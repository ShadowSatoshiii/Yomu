#!/usr/bin/env node
'use strict';

/**
 * Reads your project folders and writes profile/generated.md, the list of what you
 * build with. The editor uses it to pick news that matters to YOUR projects, no
 * matter which AI tool or editor you work in.
 *
 * Usage: npm run scan [-- <folder> <folder> ...] [--dry-run]
 *   Without folders, the "projects" list in yomu.config.json is used.
 *   --dry-run prints the result instead of writing the file.
 */

const fs = require('node:fs');
const path = require('node:path');
const { loadConfig } = require('../src/config');
const { scanProject, renderProfile } = require('../src/scan');

const root = path.join(__dirname, '..');
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const folders = args.filter((a) => !a.startsWith('--'));
const { config, warnings } = loadConfig(root);
warnings.forEach((w) => console.warn(`warning: ${w}`));

const list = folders.length ? folders : config.projects;
if (list.length === 0) {
  console.error('No project folders given.\nAdd them to "projects" in yomu.config.json, or run: npm run scan -- <folder> [<folder> ...]');
  process.exit(2);
}

const markdown = renderProfile(list.map((folder) => scanProject(folder)));
if (dryRun) {
  console.log(markdown);
} else {
  const out = path.join(root, 'profile', 'generated.md');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, markdown);
  console.log(`Scanned ${list.length} project(s). Wrote ${path.relative(root, out)}. Please read it once before the first run.`);
}
