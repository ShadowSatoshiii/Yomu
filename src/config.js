'use strict';

const fs = require('node:fs');
const path = require('node:path');

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

const DEFAULTS = {
  language: 'English',
  uiLanguage: 'auto',
  userName: '',
  schedule: ['08:00', '10:00', '13:00', '16:00', '19:00', '21:00'],
  issuesDir: 'issues',
  items: { min: 4, max: 6 },
  sources: { githubTrending: true, hackerNews: true, extra: [] },
  projects: [],
  interests: [],
};

function isObject(x) {
  return x !== null && typeof x === 'object' && !Array.isArray(x);
}

function merge(base, extra) {
  const out = { ...base };
  for (const [key, value] of Object.entries(extra)) {
    out[key] = isObject(value) && isObject(base[key]) ? merge(base[key], value) : value;
  }
  return out;
}

function textList(value) {
  return Array.isArray(value) ? value.filter((x) => typeof x === 'string' && x.trim()) : null;
}

/**
 * Reads yomu.config.json from the project root and fills in defaults.
 * Never throws: a missing or broken file yields the defaults plus a warning,
 * so the app and the tools keep working.
 */
function loadConfig(root) {
  const warnings = [];
  const file = path.join(root, 'yomu.config.json');
  let user = {};
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (isObject(parsed)) user = parsed;
    else warnings.push('yomu.config.json must contain a JSON object. Using defaults.');
  } catch (error) {
    if (error.code !== 'ENOENT') warnings.push(`yomu.config.json could not be read (${error.message}). Using defaults.`);
  }

  const config = merge(DEFAULTS, user);

  const schedule = textList(config.schedule);
  if (!schedule || schedule.length === 0 || !schedule.every((t) => TIME.test(t))) {
    warnings.push('"schedule" must be a list of HH:MM times. Using the default schedule.');
    config.schedule = [...DEFAULTS.schedule];
  } else {
    config.schedule = [...new Set(schedule)].sort();
  }

  for (const key of ['language', 'uiLanguage', 'userName', 'issuesDir']) {
    if (typeof config[key] !== 'string' || (key !== 'userName' && !config[key].trim())) {
      warnings.push(`"${key}" must be text. Using the default.`);
      config[key] = DEFAULTS[key];
    }
  }

  config.projects = textList(config.projects) ?? [];
  config.interests = textList(config.interests) ?? [];
  config.sources.extra = textList(config.sources.extra) ?? [];

  const { min, max } = config.items ?? {};
  if (!Number.isInteger(min) || !Number.isInteger(max) || min < 1 || max < min) {
    warnings.push('"items" needs whole numbers with 1 <= min <= max. Using the default.');
    config.items = { ...DEFAULTS.items };
  }

  config.issuesPath = path.resolve(root, config.issuesDir);
  return { config, warnings };
}

module.exports = { loadConfig, DEFAULTS, TIME };
