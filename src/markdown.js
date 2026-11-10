'use strict';

/** Plain Markdown copy of an issue, handy to read in any editor or to index with other tools. */
function toMarkdown(issue) {
  const lines = [`# ${issue.name}, ${issue.date} ${issue.time}`, ''];
  for (const item of issue.items) {
    lines.push(`## ${item.kind === 'lead' ? 'Lead story: ' : ''}${item.title}`, '');
    if (item.image) lines.push(`![${item.title}](${item.image})`, '');
    lines.push(
      item.summary,
      '',
      `**Why it matters to you:** ${item.why_it_matters}`,
      '',
      `- Signal: ${item.signal}`,
      `- Source: ${item.source}`,
      `- Link: ${item.url}`,
      ...(item.more_urls ?? []).map((url) => `- More: ${url}`),
      '',
    );
  }
  return lines.join('\n');
}

module.exports = { toMarkdown };
