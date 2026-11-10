'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { loadConfig, DEFAULTS } = require('../src/config');
const { readIssues, readIssuesOrSamples, validateIssue } = require('../src/issues');
const { getImage, isFetchableUrl } = require('../src/images');
const { loadStrings } = require('../src/strings');

const ROOT = path.join(__dirname, '..');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'dispatch-'));

function goodIssue(overrides = {}) {
  return {
    id: '2026-11-10-0800',
    date: '2026-11-10',
    time: '08:00',
    name: 'Morning Edition',
    items: [
      { kind: 'lead', title: 'A', summary: 'B', why_it_matters: 'C', image: null, url: 'https://example.com/a', source: 'blog', signal: '10 points' },
      { kind: 'brief', title: 'D', summary: 'E', why_it_matters: 'F', image: 'https://example.com/i.png', url: 'https://example.com/d', source: 'github', signal: '+5 stars', more_urls: ['https://example.com/x'] },
    ],
    ...overrides,
  };
}

// --- config -----------------------------------------------------------------

test('config: without a file the defaults apply and nothing warns', () => {
  const { config, warnings } = loadConfig(tmp());
  assert.deepEqual(warnings, []);
  assert.equal(config.language, 'English');
  assert.deepEqual(config.schedule, DEFAULTS.schedule);
});

test('config: user values override defaults, nested values merge', () => {
  const root = tmp();
  fs.writeFileSync(path.join(root, 'dispatch.config.json'), JSON.stringify({
    language: 'German', schedule: ['19:00', '07:30'], sources: { hackerNews: false },
  }));
  const { config, warnings } = loadConfig(root);
  assert.deepEqual(warnings, []);
  assert.equal(config.language, 'German');
  assert.deepEqual(config.schedule, ['07:30', '19:00']);
  assert.equal(config.sources.hackerNews, false);
  assert.equal(config.sources.githubTrending, true);
  assert.equal(config.issuesPath, path.join(root, 'issues'));
});

test('config: a broken file or bad values fall back to defaults with a warning', () => {
  const root = tmp();
  fs.writeFileSync(path.join(root, 'dispatch.config.json'), '{ not json');
  assert.equal(loadConfig(root).warnings.length, 1);
  fs.writeFileSync(path.join(root, 'dispatch.config.json'), JSON.stringify({ schedule: ['25:99'], items: { min: 5, max: 2 } }));
  const { config, warnings } = loadConfig(root);
  assert.equal(warnings.length, 2);
  assert.deepEqual(config.schedule, DEFAULTS.schedule);
  assert.deepEqual(config.items, DEFAULTS.items);
});

// --- issues -----------------------------------------------------------------

test('issues: reads newest first and skips broken or incomplete files', () => {
  const dir = tmp();
  fs.writeFileSync(path.join(dir, 'a.json'), '{ half written');
  fs.writeFileSync(path.join(dir, '2026-11-10-0800.json'), JSON.stringify(goodIssue()));
  fs.writeFileSync(path.join(dir, '2026-11-10-1300.json'), JSON.stringify(goodIssue({ id: '2026-11-10-1300' })));
  fs.writeFileSync(path.join(dir, 'c.json'), JSON.stringify({ id: 'x' }));
  fs.writeFileSync(path.join(dir, 'notes.md'), '# not an issue');
  assert.deepEqual(readIssues(dir).map((i) => i.id), ['2026-11-10-1300', '2026-11-10-0800']);
  assert.deepEqual(readIssues(path.join(dir, 'missing')), []);
});

test('issues: the bundled samples show until a real issue exists', () => {
  const { config } = loadConfig(tmp());
  const first = readIssuesOrSamples(config, ROOT);
  assert.equal(first.sample, true);
  assert.ok(first.issues.length >= 1);
  fs.mkdirSync(config.issuesPath, { recursive: true });
  fs.writeFileSync(path.join(config.issuesPath, '2026-11-10-0800.json'), JSON.stringify(goodIssue()));
  assert.equal(readIssuesOrSamples(config, ROOT).sample, false);
});

test('issues: every bundled sample is valid', () => {
  const issues = readIssues(path.join(ROOT, 'samples'));
  assert.ok(issues.length >= 1, 'no sample issues found');
  for (const issue of issues) assert.deepEqual(validateIssue(issue), [], issue.id);
});

test('validate: accepts a good issue', () => {
  assert.deepEqual(validateIssue(goodIssue()), []);
});

test('validate: reports each kind of problem', () => {
  const bad = goodIssue({ id: '2026-11-10-0900', name: '' });
  bad.items[0].url = 'ftp://x';
  bad.items[1].kind = 'lead';
  delete bad.items[1].why_it_matters;
  const text = validateIssue(bad).join('\n');
  assert.match(text, /"id" must equal/);
  assert.match(text, /"name" is missing/);
  assert.match(text, /Exactly one item must have kind "lead", found 2/);
  assert.match(text, /items\[0\]\.url/);
  assert.match(text, /items\[1\]\.why_it_matters/);
  assert.match(validateIssue(goodIssue(), { min: 4, max: 6 }).join('\n'), /needs 4 to 6 items, found 2/);
  assert.deepEqual(validateIssue(null), ['The issue is not a JSON object.']);
});

// --- images -----------------------------------------------------------------

function imageResponse(type, bytes) {
  return { ok: true, status: 200, headers: { get: () => type }, arrayBuffer: async () => bytes };
}

test('images: downloaded once, then served from the cache', async () => {
  const cache = path.join(tmp(), 'images');
  let calls = 0;
  const load = async () => { calls += 1; return imageResponse('image/png; charset=binary', new Uint8Array([1, 2, 3]).buffer); };
  const first = await getImage('https://example.com/a.png', cache, load);
  const second = await getImage('https://example.com/a.png', cache, load);
  assert.equal(first, 'data:image/png;base64,AQID');
  assert.equal(second, first);
  assert.equal(calls, 1);
});

test('images: refuses non-images, huge files and non-public addresses', async () => {
  const cache = path.join(tmp(), 'images');
  await assert.rejects(getImage('file:///C:/secret.txt', cache), /public http/);
  await assert.rejects(getImage('http://localhost:8080/a.png', cache), /public http/);
  await assert.rejects(getImage('http://192.168.1.10/a.png', cache), /public http/);
  await assert.rejects(getImage('https://example.com/x', cache, async () => imageResponse('text/html', new ArrayBuffer(1))), /not an image/);
  await assert.rejects(getImage('https://example.com/y', cache, async () => imageResponse('image/png', new ArrayBuffer(5 * 1024 * 1024 + 1))), /too large/);
});

test('images: address check', () => {
  for (const ok of ['https://example.com/a.png', 'http://8.8.8.8/x', 'https://172.32.0.1/x']) assert.equal(isFetchableUrl(ok), true, ok);
  for (const no of ['http://127.0.0.1/x', 'http://10.0.0.5/x', 'http://172.20.1.1/x', 'http://169.254.169.254/x', 'http://[::1]/x', 'ftp://example.com/x', 'not a url']) assert.equal(isFetchableUrl(no), false, no);
});

// --- strings ----------------------------------------------------------------

test('strings: English is the base, other languages override it', () => {
  const en = loadStrings(ROOT, 'en');
  const de = loadStrings(ROOT, 'de');
  assert.equal(en.language, 'en');
  assert.equal(de.language, 'de');
  assert.notEqual(de.strings.issues, en.strings.issues);
  assert.equal(de.strings.sourceNames.github, 'GitHub');
});

test('strings: auto uses the system language and unknown languages fall back', () => {
  const german = loadStrings(ROOT, 'auto', 'de-DE');
  assert.equal(german.language, 'de-DE'); // kept for date formatting
  assert.equal(german.strings.issues, 'Ausgaben');
  assert.equal(loadStrings(ROOT, 'auto', 'xx-YY').language, 'en');
  assert.equal(loadStrings(ROOT, '../../etc/passwd').language, 'en');
});

test('strings: a partly translated language still works', () => {
  const root = tmp();
  fs.mkdirSync(path.join(root, 'locales'));
  fs.writeFileSync(path.join(root, 'locales', 'en.json'), JSON.stringify({ a: 'one', b: 'two', nested: { x: 'x', y: 'y' } }));
  fs.writeFileSync(path.join(root, 'locales', 'fr.json'), JSON.stringify({ a: 'un', nested: { x: 'ex' } }));
  const { strings } = loadStrings(root, 'fr');
  assert.deepEqual(strings, { a: 'un', b: 'two', nested: { x: 'ex', y: 'y' } });
});

test('strings: both shipped languages have exactly the same keys', () => {
  const keys = (object, prefix = '') => Object.entries(object).flatMap(([k, v]) =>
    (v && typeof v === 'object' ? keys(v, `${prefix}${k}.`) : [`${prefix}${k}`]));
  const en = JSON.parse(fs.readFileSync(path.join(ROOT, 'locales', 'en.json'), 'utf8'));
  const de = JSON.parse(fs.readFileSync(path.join(ROOT, 'locales', 'de.json'), 'utf8'));
  assert.deepEqual(keys(de).sort(), keys(en).sort());
});
