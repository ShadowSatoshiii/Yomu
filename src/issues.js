'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ID = /^\d{4}-\d{2}-\d{2}-\d{4}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

function isWebUrl(value) {
  return typeof value === 'string' && /^https?:\/\/\S+$/.test(value);
}

function filled(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Reads every issue in a folder, newest first. Files that cannot be read or
 * have the wrong shape are skipped, so a half-written issue never empties the view.
 */
function readIssues(folder) {
  let names;
  try {
    names = fs.readdirSync(folder);
  } catch {
    return [];
  }
  return names
    .filter((name) => name.endsWith('.json'))
    .sort()
    .reverse()
    .map((name) => {
      try {
        return JSON.parse(fs.readFileSync(path.join(folder, name), 'utf8'));
      } catch {
        return null;
      }
    })
    .filter((issue) => issue && typeof issue.id === 'string' && Array.isArray(issue.items));
}

/** Reads the real issues; shows the bundled samples until the first real issue exists. */
function readIssuesOrSamples(config, root) {
  const real = readIssues(config.issuesPath);
  if (real.length > 0) return { issues: real, sample: false };
  return { issues: readIssues(path.join(root, 'samples')), sample: true };
}

/**
 * Checks an issue against the schema in EDITORIAL.md.
 * Returns a list of problems; an empty list means the issue is valid.
 */
function validateIssue(issue, limits = { min: 1, max: 50 }) {
  const problems = [];
  if (!issue || typeof issue !== 'object') return ['The issue is not a JSON object.'];

  if (!ID.test(issue.id ?? '')) problems.push('"id" must look like YYYY-MM-DD-HHMM.');
  if (!DATE.test(issue.date ?? '')) problems.push('"date" must look like YYYY-MM-DD.');
  if (!TIME.test(issue.time ?? '')) problems.push('"time" must look like HH:MM.');
  if (ID.test(issue.id ?? '') && DATE.test(issue.date ?? '') && TIME.test(issue.time ?? '')
      && issue.id !== `${issue.date}-${issue.time.replace(':', '')}`) {
    problems.push('"id" must equal "date" + "-" + "time" without the colon.');
  }
  if (!filled(issue.name)) problems.push('"name" is missing.');

  if (!Array.isArray(issue.items)) {
    problems.push('"items" must be a list.');
    return problems;
  }
  const { length } = issue.items;
  if (length < limits.min || length > limits.max) {
    problems.push(`An issue needs ${limits.min} to ${limits.max} items, found ${length}.`);
  }
  const leads = issue.items.filter((item) => item && item.kind === 'lead').length;
  if (leads !== 1) problems.push(`Exactly one item must have kind "lead", found ${leads}.`);

  issue.items.forEach((item, i) => {
    const at = `items[${i}]`;
    if (!item || typeof item !== 'object') {
      problems.push(`${at} is not an object.`);
      return;
    }
    if (item.kind !== 'lead' && item.kind !== 'brief') problems.push(`${at}.kind must be "lead" or "brief".`);
    for (const key of ['title', 'summary', 'why_it_matters', 'source', 'signal']) {
      if (!filled(item[key])) problems.push(`${at}.${key} is missing.`);
    }
    if (!isWebUrl(item.url)) problems.push(`${at}.url must be an http(s) address.`);
    if (item.image !== null && !isWebUrl(item.image)) problems.push(`${at}.image must be an http(s) address or null.`);
    if (item.more_urls !== undefined
        && !(Array.isArray(item.more_urls) && item.more_urls.every(isWebUrl))) {
      problems.push(`${at}.more_urls must be a list of http(s) addresses.`);
    }
  });
  return problems;
}

module.exports = { readIssues, readIssuesOrSamples, validateIssue, isWebUrl };
