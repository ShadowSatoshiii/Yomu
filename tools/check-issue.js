#!/usr/bin/env node
'use strict';

/**
 * Checks an issue the editor just wrote and, optionally, writes its Markdown copy.
 *
 * Usage: npm run check -- [<file> | --latest] [--images] [--markdown]
 *   --latest    check the newest file in the issues folder (default when no file is given)
 *   --images    request every image and make sure it loads as an image
 *   --markdown  write <id>.md next to the JSON file
 *
 * Exit code 0 = valid, 1 = problems found (listed), 2 = bad usage.
 */

const fs = require('node:fs');
const path = require('node:path');
const { loadConfig } = require('../src/config');
const { readIssues } = require('../src/issues');
const { checkIssue } = require('../src/check');
const { toMarkdown } = require('../src/markdown');

const root = path.join(__dirname, '..');
const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith('--')));
const target = args.find((a) => !a.startsWith('--'));
const { config, warnings } = loadConfig(root);
warnings.forEach((w) => console.warn(`warning: ${w}`));

function newestFile(folder) {
  const names = fs.existsSync(folder) ? fs.readdirSync(folder).filter((n) => n.endsWith('.json')).sort() : [];
  return names.length ? path.join(folder, names[names.length - 1]) : null;
}

(async () => {
  const known = new Set(['--latest', '--images', '--markdown']);
  const unknown = [...flags].filter((f) => !known.has(f));
  if (unknown.length) {
    console.error(`Unknown option: ${unknown.join(', ')}\nUsage: npm run check -- [<file> | --latest] [--images] [--markdown]`);
    process.exit(2);
  }
  const file = target ? path.resolve(target) : newestFile(config.issuesPath);
  if (!file || !fs.existsSync(file)) {
    console.error(`No issue found${target ? ` at ${target}` : ` in ${config.issuesPath}`}.`);
    process.exit(2);
  }

  let issue;
  try {
    issue = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    console.error(`${path.basename(file)} is not valid JSON: ${error.message}`);
    process.exit(1);
  }

  const since = new Date(Date.now() - 14 * 86_400_000).toISOString().slice(0, 10);
  const recentIssues = readIssues(config.issuesPath).filter((i) => i.date >= since);
  const { errors, warnings: notes, minutes } = await checkIssue(issue, {
    limits: config.items,
    recentIssues,
    checkImages: flags.has('--images'),
  });

  console.log(`${path.basename(file)}: ${Array.isArray(issue.items) ? issue.items.length : 0} items, about ${minutes} min read`);
  notes.forEach((n) => console.log(`  note: ${n}`));
  if (errors.length) {
    errors.forEach((e) => console.log(`  PROBLEM: ${e}`));
    console.log(`${errors.length} problem(s) found. Fix them and run the check again.`);
    process.exit(1);
  }
  if (flags.has('--markdown')) {
    const out = file.replace(/\.json$/, '.md');
    fs.writeFileSync(out, toMarkdown(issue));
    console.log(`  wrote ${path.basename(out)}`);
  }
  console.log('OK');
})();
