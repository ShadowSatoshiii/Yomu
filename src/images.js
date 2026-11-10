'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const MAX_BYTES = 5 * 1024 * 1024;

/** Addresses that point at this machine or a private network. */
function isLocalHost(hostname) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host === '::1' || host === '::') return true;
  if (/^(fc|fd|fe80)/.test(host) && host.includes(':')) return true;
  const v4 = host.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (!v4) return false;
  const [a, b] = [Number(v4[1]), Number(v4[2])];
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

/** Only public http(s) addresses are allowed (a basic guard, not DNS-rebinding proof). */
function isFetchableUrl(value) {
  try {
    const url = new URL(value);
    return (url.protocol === 'http:' || url.protocol === 'https:') && !isLocalHost(url.hostname);
  } catch {
    return false;
  }
}

/**
 * Returns an image as a data URL. The first call downloads it and stores it in
 * the cache folder; later calls read it from disk, so issues stay readable offline.
 */
async function getImage(url, cacheFolder, load = fetch) {
  if (!isFetchableUrl(url)) throw new Error('only public http(s) addresses are allowed');
  const file = path.join(cacheFolder, `${crypto.createHash('sha1').update(url).digest('hex')}.txt`);
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    // not cached yet
  }
  const response = await load(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Dispatch)' },
    signal: AbortSignal.timeout(20_000),
  });
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

module.exports = { getImage, isFetchableUrl, MAX_BYTES };
