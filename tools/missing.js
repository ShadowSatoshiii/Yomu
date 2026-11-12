#!/usr/bin/env node
'use strict';

/**
 * Lists every issue slot that should exist by now but does not (missed runs), oldest first.
 * Usage: npm run missing
 * Output: one line per slot: id <TAB> date <TAB> time. Empty output means nothing is missing.
 * With no issue at all, only the latest slot is listed.
 */

const path = require('node:path');
const { loadConfig } = require('../src/config');
const { readIssues } = require('../src/issues');
const { missingSlots } = require('../src/slots');

const root = path.join(__dirname, '..');
const { config } = loadConfig(root);
const ids = readIssues(config.issuesPath).map((issue) => issue.id);
for (const slot of missingSlots(config.schedule, ids, new Date())) {
  console.log(`${slot.id}\t${slot.date}\t${slot.time}`);
}
