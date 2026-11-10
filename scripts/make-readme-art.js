#!/usr/bin/env node
'use strict';

/**
 * Draws the README artwork: the banner, the numbered section headers and the flow cards.
 * The look follows the other repositories of the same author: GitHub-dark background,
 * red-to-orange gradient, mono labels, one Japanese character per section.
 * Usage: node scripts/make-readme-art.js
 */

const fs = require('node:fs');
const path = require('node:path');

const out = path.join(__dirname, '..', 'assets');
fs.mkdirSync(out, { recursive: true });

const SANS = "-apple-system,BlinkMacSystemFont,'Segoe UI','Noto Sans',Helvetica,Arial,sans-serif";
const MONO = "ui-monospace,'JetBrains Mono','SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace";
const SERIF_JP = "'Noto Serif JP','Hiragino Mincho ProN','Yu Mincho',serif";
const D_PATH = 'M30 26H52A24 24 0 0 1 52 74H30ZM42 38H52A12 12 0 0 1 52 62H42Z';

const esc = (text) => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const save = (name, svg) => {
  fs.writeFileSync(path.join(out, name), svg);
  console.log(`wrote assets/${name} (${svg.length} bytes)`);
};

// --- numbered section header (1200 x 90) ------------------------------------

function header(name, number, total, kanji, title) {
  const n = String(number).padStart(2, '0');
  const t = String(total).padStart(2, '0');
  save(name, `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="90" viewBox="0 0 1200 90">
<defs><linearGradient id="gl" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e5383b"/><stop offset="1" stop-color="#ff8a5c"/></linearGradient>
<linearGradient id="ln" x1="0" x2="1"><stop offset="0" stop-color="#e5383b" stop-opacity=".8"/><stop offset=".35" stop-color="#30363d"/><stop offset="1" stop-color="#30363d" stop-opacity="0"/></linearGradient>
<radialGradient id="cm"><stop offset="0" stop-color="#fff"/><stop offset=".3" stop-color="#ff8a5c"/><stop offset="1" stop-color="#e5383b" stop-opacity="0"/></radialGradient>
<filter id="gw" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
<style>.cm{animation:cm 4s cubic-bezier(.6,0,.4,1) infinite}@keyframes cm{0%{transform:translateX(0);opacity:0}10%{opacity:1}90%{opacity:1}100%{transform:translateX(1100px);opacity:0}}
.bx{animation:bx 4s ease-in-out infinite}@keyframes bx{0%,100%{opacity:.55}50%{opacity:1}}</style>
<rect class="bx" x="2" y="10" width="56" height="56" rx="14" fill="#e5383b" fill-opacity=".35" filter="url(#gw)"/>
<rect x="2" y="10" width="56" height="56" rx="14" fill="url(#gl)"/>
<text x="30" y="49" text-anchor="middle" font-family="${SERIF_JP}" font-weight="900" font-size="30" fill="#fff">${kanji}</text>
<text x="78" y="32" font-family="${MONO}" font-size="12.5" letter-spacing="3" fill="#ff8a5c">${n} / ${t}</text>
<text x="78" y="62" font-family="${SANS}" font-size="28" font-weight="700" fill="#f0f6fc">${esc(title)}</text>
<rect x="0" y="84" width="1200" height="1.5" fill="url(#ln)"/>
<ellipse class="cm" cx="40" cy="84.75" rx="40" ry="3" fill="url(#cm)"/></svg>
`);
}

// --- four step cards (1200 x 180), one lights up after the other -------------

function cards(name, items) {
  const dur = 8;
  const body = items.map((item, i) => {
    const x = i * 310;
    const start = i / items.length;
    const keys = `0;${start.toFixed(3)};${(start + 0.037).toFixed(3)};${(start + 0.212).toFixed(3)};${(start + 0.25).toFixed(3)};1`;
    const keyTimes = i === 0 ? '0;0.000;0.037;0.212;0.250;1' : keys;
    const fade = `<animate attributeName="opacity" values="0;0;1;1;0;0" keyTimes="${keyTimes}" dur="${dur}s" repeatCount="indefinite"/>`;
    return `<g transform="translate(${x} 14)">
 <rect width="270" height="150" rx="16" fill="#0d1117" stroke="#30363d"/>
 <rect width="270" height="150" rx="16" fill="none" stroke="url(#bd)" stroke-width="2" opacity="0">${fade}</rect>
 <text x="252" y="132" text-anchor="end" font-family="${SERIF_JP}" font-weight="900" font-size="80" fill="#e5383b" fill-opacity=".1">${item.kanji}</text>
 <text x="22" y="62" font-family="${SANS}" font-size="44" font-weight="800" fill="none" stroke="#e5383b" stroke-width="1.2">${String(i + 1).padStart(2, '0')}</text>
 <text x="22" y="62" font-family="${SANS}" font-size="44" font-weight="800" fill="url(#gl)" opacity="0">${fade}${String(i + 1).padStart(2, '0')}</text>
 <text x="22" y="102" font-family="${SANS}" font-size="22" font-weight="700" fill="#f0f6fc">${esc(item.title)}</text>
 <text x="22" y="126" font-family="${MONO}" font-size="12.5" fill="#9198a1">${esc(item.sub)}</text></g>`;
  }).join('');
  save(name, `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="180" viewBox="0 0 1200 180">
<defs><linearGradient id="gl" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e5383b"/><stop offset="1" stop-color="#ff8a5c"/></linearGradient>
<linearGradient id="bd" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e5383b"/><stop offset="1" stop-color="#ff8a5c" stop-opacity=".5"/></linearGradient></defs>${body}</svg>
`);
}

// --- the banner (1200 x 520) ------------------------------------------------

function hero() {
  const chips = ['any language', 'any AI tool', 'local files', 'no key in the app'];
  let chipX = 70;
  const chipSvg = chips.map((label) => {
    const width = label.length * 8.4 + 28;
    const svg = `<rect x="${chipX}" y="408" width="${width.toFixed(0)}" height="32" rx="16" fill="#0d1117" stroke="#30363d"/>
<text x="${(chipX + width / 2).toFixed(0)}" y="429" text-anchor="middle" font-family="${MONO}" font-size="13" fill="#c9d1d9">${esc(label)}</text>`;
    chipX += width + 12;
    return svg;
  }).join('\n');

  const lines = (x, y, widths, color) => widths.map((w, i) => `<rect x="${x}" y="${y + i * 12}" width="${w}" height="5" rx="2.5" fill="${color}"/>`).join('');

  save('hero.svg', `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="520" viewBox="0 0 1200 520">
<defs>
<linearGradient id="gl" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e5383b"/><stop offset="1" stop-color="#ff8a5c"/></linearGradient>
<radialGradient id="rg" cx=".2" cy=".4" r=".55"><stop offset="0" stop-color="#e5383b" stop-opacity=".3"/><stop offset="1" stop-color="#e5383b" stop-opacity="0"/></radialGradient>
<radialGradient id="rg2" cx=".85" cy=".2" r=".5"><stop offset="0" stop-color="#ff8a5c" stop-opacity=".14"/><stop offset="1" stop-color="#ff8a5c" stop-opacity="0"/></radialGradient>
<linearGradient id="title" gradientUnits="userSpaceOnUse" x1="0" x2="520"><stop offset="0" stop-color="#f0f6fc"/><stop offset=".42" stop-color="#f0f6fc"/><stop offset=".5" stop-color="#ff8a5c"/><stop offset=".58" stop-color="#f0f6fc"/><stop offset="1" stop-color="#f0f6fc"/>
<animateTransform attributeName="gradientTransform" type="translate" values="-600 0;900 0" dur="4.5s" repeatCount="indefinite"/></linearGradient>
<linearGradient id="pic" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1f6feb" stop-opacity=".55"/><stop offset="1" stop-color="#e5383b" stop-opacity=".5"/></linearGradient>
<radialGradient id="cm"><stop offset="0" stop-color="#fff"/><stop offset=".3" stop-color="#ff8a5c"/><stop offset="1" stop-color="#e5383b" stop-opacity="0"/></radialGradient>
<pattern id="dots" width="28" height="28" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1" fill="#30363d" fill-opacity=".55"/></pattern>
<clipPath id="r"><rect width="1200" height="520" rx="16"/></clipPath>
<filter id="gw" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="6" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
</defs>
<style>
.fl{animation:fl 6s ease-in-out infinite}@keyframes fl{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}
.pu{animation:pu 1.6s ease-in-out infinite}@keyframes pu{50%{opacity:.35}}
.cm{animation:cm 5s cubic-bezier(.6,0,.4,1) infinite}@keyframes cm{0%{transform:translateX(0);opacity:0}10%{opacity:1}90%{opacity:1}100%{transform:translateX(1120px);opacity:0}}
.walk{animation:walk 9s ease-in-out infinite alternate}@keyframes walk{from{transform:translateX(0)}to{transform:translateX(250px)}}
</style>
<g clip-path="url(#r)">
<rect width="1200" height="520" fill="#010409"/>
<rect width="1200" height="520" fill="url(#dots)"/>
<rect width="1200" height="520" fill="url(#rg)"/>
<rect width="1200" height="520" fill="url(#rg2)"/>

<g transform="translate(70 62)">
<rect width="68" height="68" rx="18" fill="#e5383b" fill-opacity=".35" filter="url(#gw)"/>
<g transform="scale(.68)"><rect width="100" height="100" rx="22" fill="url(#gl)"/><path fill="#fff" fill-rule="evenodd" d="${D_PATH}"/></g>
</g>
<text x="160" y="104" font-family="${MONO}" font-size="13" letter-spacing="4" fill="#ff8a5c">YOUR PERSONAL NEWSROOM</text>
<text x="160" y="127" font-family="${MONO}" font-size="12" letter-spacing="2" fill="#6e7681">CLAUDE WRITES · A DESKTOP APP SHOWS</text>

<text x="66" y="262" font-family="${SANS}" font-size="112" font-weight="800" letter-spacing="-3" fill="url(#title)">Dispatch</text>
<text x="70" y="318" font-family="${SANS}" font-size="22" fill="#c9d1d9">A short, illustrated news issue a few times a day.</text>
<text x="70" y="350" font-family="${SANS}" font-size="22" fill="#9198a1">Picked from <tspan fill="#ff8a5c" font-weight="700">your own projects</tspan>, written in <tspan fill="#ff8a5c" font-weight="700">your own language</tspan>.</text>
${chipSvg}

<g class="fl">
<g transform="translate(700 62)">
<rect width="440" height="396" rx="14" fill="#0d1117" stroke="#30363d" stroke-width="1.5"/>
<circle cx="22" cy="22" r="5" fill="#ff5f57"/><circle cx="40" cy="22" r="5" fill="#febc2e"/><circle cx="58" cy="22" r="5" fill="#28c840"/>
<rect x="0" y="44" width="1" height="0" fill="none"/>
<rect x="1" y="44" width="116" height="351" fill="#161b22"/>
<text x="16" y="76" font-family="${SANS}" font-size="15" font-weight="800" fill="#f0f6fc">Dispatch</text>
<rect x="16" y="86" width="84" height="2" fill="#e5383b"/>
<rect x="9" y="108" width="100" height="40" rx="3" fill="#21262d"/><rect x="9" y="108" width="3" height="40" fill="#e5383b"/>
<rect x="20" y="118" width="46" height="5" rx="2.5" fill="#f0f6fc"/><rect class="pu" x="72" y="116" width="26" height="9" rx="2" fill="#e5383b"/>
${lines(20, 130, [76, 52], '#6e7681')}
<rect x="9" y="158" width="100" height="40" rx="3" fill="none"/>
<rect x="20" y="168" width="52" height="5" rx="2.5" fill="#c9d1d9"/>${lines(20, 180, [70, 44], '#484f58')}

<rect x="136" y="64" width="284" height="3" fill="#f0f6fc" fill-opacity=".85"/>
<text x="136" y="104" font-family="'Newsreader',Georgia,serif" font-size="34" font-weight="800" fill="#f0f6fc" letter-spacing="-1">Morning Edition</text>
<rect x="136" y="116" width="284" height="1.5" fill="#f0f6fc" fill-opacity=".8"/>
<rect x="136" y="130" width="284" height="126" rx="4" fill="url(#pic)"/>
<rect x="136" y="130" width="74" height="18" fill="#e5383b"/>
<text x="144" y="143" font-family="${SANS}" font-size="9.5" font-weight="800" letter-spacing="1.4" fill="#fff">LEAD STORY</text>
<circle cx="278" cy="193" r="30" fill="#f0f6fc" fill-opacity=".18"/><circle cx="278" cy="193" r="18" fill="#f0f6fc" fill-opacity=".22"/>
<rect x="136" y="270" width="220" height="9" rx="4.5" fill="#f0f6fc"/>
<rect x="136" y="286" width="150" height="9" rx="4.5" fill="#f0f6fc"/>
${lines(136, 308, [284, 268, 276, 190], '#6e7681')}
<rect x="136" y="362" width="284" height="22" rx="3" fill="#161b22"/><rect x="136" y="362" width="3" height="22" fill="#e5383b"/>
<rect x="148" y="370" width="150" height="5" rx="2.5" fill="#ff8a5c"/>
<g transform="translate(150 330)"><g class="walk"><rect x="0" y="12" width="16" height="12" rx="2" fill="#a8855f"/><rect x="2" y="2" width="12" height="11" rx="2" fill="#d8c3a5"/><rect x="2" y="0" width="3" height="4" fill="#a8855f"/><rect x="11" y="0" width="3" height="4" fill="#a8855f"/><rect x="5" y="6" width="2" height="2" fill="#16130f"/><rect x="9" y="6" width="2" height="2" fill="#16130f"/><rect x="7" y="9" width="2" height="1.5" fill="#e5383b"/></g></g>
</g>
</g>

<rect x="0" y="516" width="1200" height="1.5" fill="#30363d"/>
<ellipse class="cm" cx="40" cy="516.75" rx="46" ry="3" fill="url(#cm)"/>
</g>
<rect x="1" y="1" width="1198" height="518" rx="15" fill="none" stroke="#30363d" stroke-width="2"/>
</svg>
`);
}

hero();
header('h-why.svg', 1, 6, '理', 'Why Dispatch?');
header('h-how.svg', 2, 6, '仕', 'How it works');
header('h-start.svg', 3, 6, '始', 'Quick start');
header('h-yours.svg', 4, 6, '個', 'Make it yours');
header('h-language.svg', 5, 6, '語', 'Your language');
header('h-schedule.svg', 6, 6, '時', 'Schedule it');
cards('flow.svg', [
  { kanji: '探', title: 'Scan', sub: 'your project folders' },
  { kanji: '書', title: 'Write', sub: 'Claude, on a schedule' },
  { kanji: '検', title: 'Check', sub: 'schema, links, images' },
  { kanji: '読', title: 'Read', sub: 'the Dispatch app' },
]);
