#!/usr/bin/env node
'use strict';

/**
 * Lists every link that recent issues already reported, so the editor does not repeat itself.
 * Usage: npm run reported [-- <days>]     (default: 14 days)
 * Output: one line per item: issue id <TAB> link <TAB> title
 */

const path = require('node:path');
const { loadConfig } = require('../src/config');
const { readIssues } = require('../src/issues');

const root = path.join(__dirname, '..');
const days = Number(process.argv[2] ?? 14);
if (!Number.isFinite(days) || days < 0) {
  console.error('Usage: npm run reported [-- <days>]');
  process.exit(2);
}

const { config } = loadConfig(root);
const since = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
for (const issue of readIssues(config.issuesPath)) {
  if (issue.date < since) continue;
  for (const item of issue.items) console.log(`${issue.id}\t${item.url}\t${item.title}`);
}
