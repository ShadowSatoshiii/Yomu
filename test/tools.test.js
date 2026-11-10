'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const { checkIssue, readMinutes } = require('../src/check');
const { toMarkdown } = require('../src/markdown');
const { scanProject, renderProfile, clean } = require('../src/scan');

const ROOT = path.join(__dirname, '..');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'dispatch-'));

function issue(url = 'https://example.com/a', extra = {}) {
  return {
    id: '2026-11-11-0800', date: '2026-11-11', time: '08:00', name: 'Morning Edition',
    items: [
      { kind: 'lead', title: 'Lead', summary: 'Word '.repeat(300).trim(), why_it_matters: 'Because.', image: 'https://example.com/i.png', url, source: 'blog', signal: 'x' },
      { kind: 'brief', title: 'Brief', summary: 'S', why_it_matters: 'W', image: null, url: 'https://example.com/b', source: 'github', signal: 'y', ...extra },
    ],
  };
}

const ok = (type = 'image/png') => async () => ({ ok: true, status: 200, headers: { get: () => type } });

// --- check ------------------------------------------------------------------

test('check: a valid issue passes and its read time is estimated', async () => {
  const result = await checkIssue(issue());
  assert.deepEqual(result.errors, []);
  assert.equal(result.minutes, readMinutes(issue()));
  assert.equal(result.minutes, 2);
});

test('check: repeated links are errors, unless the title starts with "Update:"', async () => {
  const earlier = [{ id: '2026-11-10-1900', items: [{ url: 'https://example.com/a' }] }];
  const repeated = await checkIssue(issue(), { recentIssues: earlier });
  assert.match(repeated.errors.join('\n'), /already reported in 2026-11-10-1900/);

  const updated = issue();
  updated.items[0].title = 'Update: Lead';
  assert.deepEqual((await checkIssue(updated, { recentIssues: earlier })).errors, []);

  const sameIssue = [{ id: '2026-11-11-0800', items: [{ url: 'https://example.com/a' }] }];
  assert.deepEqual((await checkIssue(issue(), { recentIssues: sameIssue })).errors, []);
});

test('check: images must load as images; a missing image is only a note', async () => {
  assert.deepEqual((await checkIssue(issue(), { checkImages: true, load: ok() })).errors, []);
  const noImage = await checkIssue(issue(), { checkImages: true, load: ok() });
  assert.match(noImage.warnings.join('\n'), /items\[1\] has no image/);

  const html = await checkIssue(issue(), { checkImages: true, load: ok('text/html') });
  assert.match(html.errors.join('\n'), /does not load as an image/);

  const failing = await checkIssue(issue(), { checkImages: true, load: async () => { throw new Error('boom'); } });
  assert.match(failing.errors.join('\n'), /could not be requested \(boom\)/);

  const local = issue();
  local.items[0].image = 'http://127.0.0.1/x.png';
  assert.match((await checkIssue(local, { checkImages: true, load: ok() })).errors.join('\n'), /not a public/);
});

test('check: item count limits come from the config', async () => {
  const result = await checkIssue(issue(), { limits: { min: 4, max: 6 } });
  assert.match(result.errors.join('\n'), /needs 4 to 6 items/);
});

test('markdown: contains title, summary and link of every item', () => {
  const text = toMarkdown(issue());
  assert.match(text, /^# Morning Edition, 2026-11-11 08:00/);
  assert.match(text, /## Lead story: Lead/);
  assert.match(text, /\*\*Why it matters to you:\*\* Because\./);
  assert.match(text, /- Link: https:\/\/example\.com\/b/);
  assert.doesNotMatch(text, /!\[Brief\]/);
});

// --- scan -------------------------------------------------------------------

function sampleProject() {
  const dir = tmp();
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({
    name: 'demo', description: 'A demo shop', dependencies: { react: '^19.0.0', vite: '^7.0.0' },
  }));
  fs.writeFileSync(path.join(dir, 'README.md'), '![logo](x.png)\n# Demo\nA small shop. Contact: jane@example.com\nAPI_KEY=sk-abcdefghijklmnopqrstuvwxyz\nBuilt with React.\n');
  fs.writeFileSync(path.join(dir, 'CLAUDE.md'), 'Use TypeScript. Keep it simple.');
  fs.mkdirSync(path.join(dir, '.cursor'));
  fs.writeFileSync(path.join(dir, '.env'), 'DATABASE_URL=postgres://user:topsecret@host/db\n');
  return dir;
}

test('scan: finds stack, tools and README, never reads .env, and removes secrets', () => {
  const profile = renderProfile([scanProject(sampleProject())], new Date('2026-11-10'));
  assert.match(profile, /Stack: Node\.js \/ JavaScript, uses react, vite/);
  assert.match(profile, /AI tools in use: Claude Code, Cursor/);
  assert.match(profile, /Described as: A demo shop/);
  assert.match(profile, /Built with React\./);
  assert.match(profile, /Agent instructions start with: Use TypeScript/);
  assert.doesNotMatch(profile, /topsecret|DATABASE_URL|sk-abc|API_KEY|jane@example\.com|logo/);
});

test('scan: other ecosystems and missing folders', () => {
  const dir = tmp();
  fs.writeFileSync(path.join(dir, 'Cargo.toml'), '[package]\nname = "x"\n\n[dependencies]\ntokio = "1"\nserde = { version = "1" }\n\n[dev-dependencies]\nfoo = "1"\n');
  fs.writeFileSync(path.join(dir, 'requirements.txt'), '# comment\nrequests>=2.0\nflask==3.0\n-r other.txt\n');
  const result = scanProject(dir);
  assert.deepEqual(result.stacks.find((s) => s.label === 'Rust').dependencies, ['tokio', 'serde']);
  assert.deepEqual(result.stacks.find((s) => s.label === 'Python').dependencies, ['requests', 'flask']);

  const missing = renderProfile([scanProject(path.join(dir, 'nope'))]);
  assert.match(missing, /does not exist/);
  assert.match(renderProfile([]), /No projects scanned yet/);
});

test('scan: clean() drops credential lines and masks tokens', () => {
  assert.equal(clean('keep this\npassword: hunter2\nghp_abcdefghijklmnopqrstuvwxyz1234 leaked'), 'keep this\n[removed] leaked');
});

// --- command line -----------------------------------------------------------

function run(script, args = []) {
  return spawnSync(process.execPath, [path.join(ROOT, 'tools', script), ...args], { encoding: 'utf8' });
}

test('cli: check accepts a valid file and rejects a broken one', () => {
  const dir = tmp();
  const good = path.join(dir, '2026-11-11-0800.json');
  const full = issue();
  for (const n of [1, 2]) full.items.push({ ...full.items[1], title: `Brief ${n}`, url: `https://example.com/more-${n}` });
  fs.writeFileSync(good, JSON.stringify(full)); // the default config asks for 4 to 6 items
  const pass = run('check-issue.js', [good, '--markdown']);
  assert.equal(pass.status, 0, pass.stdout + pass.stderr);
  assert.match(pass.stdout, /OK/);
  assert.ok(fs.existsSync(path.join(dir, '2026-11-11-0800.md')));

  const bad = path.join(dir, 'bad.json');
  fs.writeFileSync(bad, JSON.stringify({ id: 'x', items: [] }));
  const fail = run('check-issue.js', [bad]);
  assert.equal(fail.status, 1);
  assert.match(fail.stdout, /PROBLEM/);

  assert.equal(run('check-issue.js', [path.join(dir, 'missing.json')]).status, 2);
  assert.equal(run('check-issue.js', ['--bogus']).status, 2);
});

test('cli: scan --dry-run prints a profile and needs folders', () => {
  const printed = run('scan-projects.js', [sampleProject(), '--dry-run']);
  assert.equal(printed.status, 0, printed.stderr);
  assert.match(printed.stdout, /# Generated project profile/);
  assert.equal(run('scan-projects.js').status, 2);
});

test('cli: reported runs without issues', () => {
  const result = run('reported.js', ['14']);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(run('reported.js', ['abc']).status, 2);
});
