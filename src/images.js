'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const dns = require('node:dns/promises');
const net = require('node:net');

const MAX_BYTES = 5 * 1024 * 1024;
const MAX_REDIRECTS = 5;

/** True for an IP address that points at this machine or a private network. */
function isLocalAddress(address) {
  let host = String(address).toLowerCase().replace(/^\[|\]$/g, '').split('%')[0];

  // IPv4 written inside IPv6, such as ::ffff:127.0.0.1 or ::ffff:7f00:1
  const mapped = host.match(/^::ffff:(.+)$/);
  if (mapped) {
    if (mapped[1].includes('.')) {
      host = mapped[1];
    } else {
      const parts = mapped[1].split(':');
      if (parts.length === 2) {
        const n = (parseInt(parts[0], 16) << 16) | parseInt(parts[1], 16);
        host = [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.');
      }
    }
  }

  if (net.isIPv4(host)) {
    const [a, b] = host.split('.').map(Number);
    return a === 0 || a === 10 || a === 127
      || (a === 100 && b >= 64 && b <= 127)   // carrier-grade NAT
      || (a === 169 && b === 254)             // link-local, cloud metadata
      || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168);
  }
  if (net.isIPv6(host)) {
    return host === '::1' || host === '::' || /^f[cd]/.test(host) || /^fe[89ab]/.test(host);
  }
  return false;
}

function isLocalHost(hostname) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) return true;
  return isLocalAddress(host);
}

/** Only public http(s) addresses without embedded credentials are allowed. */
function isFetchableUrl(value) {
  try {
    const url = new URL(value);
    return (url.protocol === 'http:' || url.protocol === 'https:')
      && !url.username && !url.password
      && !isLocalHost(url.hostname);
  } catch {
    return false;
  }
}

/** Resolves a host name and refuses it when any of its addresses is private. */
async function assertPublic(url, lookup) {
  const host = new URL(url).hostname.replace(/^\[|\]$/g, '');
  if (net.isIP(host)) return; // already checked by isFetchableUrl
  const addresses = await lookup(host, { all: true });
  if (!addresses.length || addresses.some(({ address }) => isLocalAddress(address))) {
    throw new Error('the address is not public');
  }
}

/**
 * GET request that only ever talks to public addresses. Redirects are followed by hand,
 * so that every hop is checked again (a public address must not forward to a private one).
 * Remaining gap: a host name could resolve differently between this check and the request
 * (DNS rebinding). The app only turns responses of type image/* into pictures and never shows other bodies.
 */
async function requestPublic(url, { load = fetch, lookup = dns.lookup, headers = {} } = {}) {
  let current = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    if (!isFetchableUrl(current)) throw new Error('only public http(s) addresses are allowed');
    await assertPublic(current, lookup);
    const response = await load(current, {
      redirect: 'manual',
      headers: { 'User-Agent': 'Mozilla/5.0 (Yomu)', ...headers },
      signal: AbortSignal.timeout(20_000),
    });
    const target = response.status >= 300 && response.status < 400 ? response.headers.get('location') : null;
    if (!target) return response;
    current = new URL(target, current).href;
  }
  throw new Error('too many redirects');
}

/**
 * Returns an image as a data URL. The first call downloads it and stores it in
 * the cache folder; later calls read it from disk, so issues stay readable offline.
 */
async function getImage(url, cacheFolder, load = fetch, lookup = dns.lookup) {
  if (!isFetchableUrl(url)) throw new Error('only public http(s) addresses are allowed');
  const file = path.join(cacheFolder, `${crypto.createHash('sha1').update(url).digest('hex')}.txt`);
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    // not cached yet
  }
  const response = await requestPublic(url, { load, lookup });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const type = (response.headers.get('content-type') || '').split(';')[0].trim();
  if (!type.startsWith('image/')) throw new Error(`not an image: ${type}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > MAX_BYTES) throw new Error('image is too large');
  const dataUrl = `data:${type};base64,${bytes.toString('base64')}`;
  fs.mkdirSync(cacheFolder, { recursive: true });
  fs.writeFileSync(file, dataUrl);
  return dataUrl;
}

module.exports = { getImage, requestPublic, isFetchableUrl, isLocalAddress, MAX_BYTES };
