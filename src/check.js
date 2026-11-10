'use strict';

const { validateIssue, isWebUrl } = require('./issues');
const { isFetchableUrl } = require('./images');

const WORDS_PER_MINUTE = 200;

function words(item) {
  return `${item.title} ${item.summary} ${item.why_it_matters}`.split(/\s+/).filter(Boolean).length;
}

function readMinutes(issue) {
  const total = issue.items.reduce((sum, item) => sum + words(item), 0);
  return Math.max(1, Math.round(total / WORDS_PER_MINUTE));
}

/** Links that earlier issues already reported, mapped to the id of the issue. */
function reportedLinks(recentIssues, exceptId) {
  const links = new Map();
  for (const issue of recentIssues) {
    if (issue.id === exceptId || !Array.isArray(issue.items)) continue;
    for (const item of issue.items) if (isWebUrl(item.url)) links.set(item.url, issue.id);
  }
  return links;
}

/**
 * Full check of one issue: schema, duplicates against recent issues and,
 * when asked, whether every image really loads. Pure apart from the image requests.
 */
async function checkIssue(issue, { limits, recentIssues = [], checkImages = false, load = fetch } = {}) {
  const errors = validateIssue(issue, limits);
  const warnings = [];
  if (errors.length > 0 && !Array.isArray(issue?.items)) return { errors, warnings, minutes: 0 };

  const seen = reportedLinks(recentIssues, issue.id);
  issue.items.forEach((item, i) => {
    const earlier = seen.get(item.url);
    if (earlier && !/^update\s*:/i.test(item.title ?? '')) {
      errors.push(`items[${i}] was already reported in ${earlier}. Replace it, or start the title with "Update:" if there is real news.`);
    }
  });

  if (checkImages) {
    await Promise.all(issue.items.map(async (item, i) => {
      if (!item.image) {
        warnings.push(`items[${i}] has no image.`);
        return;
      }
      if (!isFetchableUrl(item.image)) {
        errors.push(`items[${i}].image is not a public http(s) address.`);
        return;
      }
      try {
        const response = await load(item.image, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Dispatch)' },
          signal: AbortSignal.timeout(20_000),
        });
        const type = (response.headers.get('content-type') || '').split(';')[0].trim();
        if (!response.ok || !type.startsWith('image/')) {
          errors.push(`items[${i}].image does not load as an image (${response.ok ? type || 'no content type' : `HTTP ${response.status}`}). Replace it or set it to null.`);
        }
      } catch (error) {
        errors.push(`items[${i}].image could not be requested (${error.message}). Replace it or set it to null.`);
      }
    }));
  }

  return { errors, warnings, minutes: Array.isArray(issue.items) ? readMinutes(issue) : 0 };
}

module.exports = { checkIssue, readMinutes, reportedLinks, WORDS_PER_MINUTE };
