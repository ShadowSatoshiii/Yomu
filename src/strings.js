'use strict';

const fs = require('node:fs');
const path = require('node:path');

const CODE = /^[a-z]{2,3}(-[a-z0-9]{2,8})?$/i;

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

function readLocale(root, code) {
  try {
    const parsed = JSON.parse(fs.readFileSync(path.join(root, 'locales', `${code}.json`), 'utf8'));
    return isObject(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Loads the interface texts for a language code such as "en", "de" or "pt-BR".
 * English is always the base, so a partly translated file still works.
 * "auto" (or anything unusable) falls back to the system language, then English.
 */
function loadStrings(root, wanted, systemLanguage = 'en') {
  const english = readLocale(root, 'en') ?? {};
  const candidates = [wanted, systemLanguage, systemLanguage.split('-')[0], 'en']
    .filter((c) => typeof c === 'string' && CODE.test(c));
  for (const code of candidates) {
    if (code.toLowerCase() === 'en') return { language: 'en', strings: english };
    const locale = readLocale(root, code) ?? readLocale(root, code.split('-')[0]);
    if (locale) return { language: code, strings: merge(english, locale) };
  }
  return { language: 'en', strings: english };
}

module.exports = { loadStrings };
