'use strict';

// Inside the app, preload.js provides window.yomu. Without it (viewing this
// page in a browser while developing) the data comes from dev-data.json.
const api = window.yomu ?? {
  config: async () => (await (await fetch('dev-data.json')).json()).config,
  issues: async () => {
    const { issues, sample } = await (await fetch('dev-data.json')).json();
    return { issues, sample };
  },
  image: async (url) => url,
  open: (url) => window.open(url, '_blank', 'noopener'),
  notify: () => {},
};

const WORDS_PER_MINUTE = 200;
const POLL_MS = 60_000;
const GRACE_MINUTES = 30; // how long a run may take after its scheduled time
const REMEMBER = 'yomu.lastSeen';
const EASE = 'cubic-bezier(.2,.7,.2,1)';
const CALM = matchMedia('(prefers-reduced-motion: reduce)');

let cfg = { language: 'en', userName: '', schedule: ['08:00', '13:00', '19:00'], strings: {} };
let issues = [];
let sample = false;
let selected = null;

// --- helpers ----------------------------------------------------------------

function t(key, vars = {}) {
  const found = key.split('.').reduce((node, part) => (node && typeof node === 'object' ? node[part] : undefined), cfg.strings);
  const text = typeof found === 'string' ? found : key;
  return text.replace(/\{(\w+)\}/g, (whole, name) => (name in vars ? String(vars[name]) : whole));
}

function el(name, className, text) {
  const node = document.createElement(name);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function dayLabel(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(cfg.language, { weekday: 'long', day: 'numeric', month: 'long' });
}

function timesLabel() {
  try {
    return new Intl.ListFormat(cfg.language, { style: 'long', type: 'conjunction' }).format(cfg.schedule);
  } catch {
    return cfg.schedule.join(', ');
  }
}

function domain(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

function wordCount(item) {
  return `${item.title} ${item.summary} ${item.why_it_matters}`.split(/\s+/).filter(Boolean).length;
}

function minutes(words) {
  return Math.max(1, Math.round(words / WORDS_PER_MINUTE));
}

const leadOf = (issue) => issue.items.find((item) => item.kind === 'lead') ?? issue.items[0];

function link(url, className, text) {
  const a = el('a', className, text);
  if (/^https?:\/\//.test(url)) {
    a.href = url;
    a.addEventListener('click', (event) => {
      event.preventDefault();
      api.open(url);
    });
  }
  return a;
}

function sourceBadge(item) {
  const known = Object.hasOwn(cfg.strings.sourceNames ?? {}, item.source);
  return el('span', `source s-${known ? item.source : 'other'}`, known ? t(`sourceNames.${item.source}`) : item.source);
}

// --- rendering --------------------------------------------------------------

function thumb(item, withZoom) {
  const frame = link(item.url, 'thumb');
  frame.tabIndex = -1;
  const fallback = (text) => frame.prepend(el('div', 'no-image', text));
  if (!item.image) {
    fallback(t('noImage'));
    return frame;
  }
  api.image(item.image)
    .then((src) => {
      const img = el('img');
      img.alt = '';
      img.src = src;
      frame.prepend(img);
      if (withZoom && !CALM.matches) {
        img.animate([{ transform: 'scale(1.15)' }, { transform: 'scale(1)' }], { duration: 1600, easing: EASE });
      }
    })
    .catch(() => fallback(t('imageFailed')));
  return frame;
}

function leadStory(item) {
  const article = el('article', 'lead');
  article.dataset.anim = '1';

  const figure = el('figure');
  const frame = thumb(item, true);
  frame.append(el('span', 'mark', t('lead')));
  const caption = el('figcaption');
  caption.append(el('span', null, domain(item.url)), el('span', null, t('minutesRead', { n: minutes(wordCount(item)) })));
  figure.append(frame, caption);

  const text = el('div', 'lead-text');
  const meta = el('div', 'lead-meta');
  meta.append(sourceBadge(item), el('span', 'signal', `↑ ${item.signal}`));
  const heading = el('h3');
  heading.append(link(item.url, null, item.title));
  const why = el('div', 'why-lead');
  const whyText = el('p');
  whyText.append(el('b', null, t('whyLead')), item.why_it_matters);
  why.append(el('span', 'stripe'), whyText);
  const buttons = el('div', 'buttons');
  const original = link(item.url, 'original', `${t('readOriginal')} `);
  original.append(el('span', null, '→'));
  buttons.append(original, ...(item.more_urls ?? []).map((url) => link(url, 'more', `${domain(url)} ↗`)));
  text.append(meta, heading, el('p', null, item.summary), why, buttons);

  article.append(figure, text);
  return article;
}

function brief(item, number) {
  const article = el('article', 'brief');
  article.dataset.anim = '1';
  const head = el('div', 'brief-head');
  head.append(el('span', 'no', String(number).padStart(2, '0')), sourceBadge(item));
  const heading = el('h3');
  heading.append(link(item.url, null, item.title));
  const why = el('p', 'why');
  why.append(el('b', null, t('whyBrief')), item.why_it_matters);
  const foot = el('div', 'brief-foot');
  const read = link(item.url, 'read', `${t('read')} `);
  read.append(el('span', null, '→'));
  foot.append(el('span', null, `${domain(item.url)} · ${t('minutes', { n: minutes(wordCount(item)) })}`), read);
  article.append(head, thumb(item, false), el('span', 'signal', `↑ ${item.signal}`), heading, el('p', null, item.summary), why, foot);
  return article;
}

function number(value, unit, red) {
  const box = el('div', 'number');
  box.append(el('span', red ? 'value red' : 'value', value), el('span', 'unit', unit));
  return box;
}

function head(issue) {
  const header = el('header', 'head');
  header.dataset.anim = '1';
  const sources = [...new Set(issue.items.map((item) => (
    Object.hasOwn(cfg.strings.sourceNames ?? {}, item.source) ? t(`sourceNames.${item.source}`) : item.source)))];
  const line = el('div', 'head-line');
  line.append(
    el('span', null, dayLabel(issue.date)),
    el('span', null, t('sources', { sources: sources.join(' · ') })),
    el('span', null, t('issueOf', { n: issues.length - issues.indexOf(issue), total: issues.length })),
  );
  const total = issue.items.reduce((sum, item) => sum + wordCount(item), 0);
  const numbers = el('div', 'numbers');
  numbers.append(
    number(issue.time, t('clock')),
    number(String(issue.items.length), t('itemCount')),
    number(t('minutes', { n: minutes(total) }), t('readTime'), true),
  );
  const main = el('div', 'head-main');
  main.append(el('h2', null, issue.name), numbers);
  header.append(line, main);
  return header;
}

function showIssue() {
  const target = document.getElementById('issue');
  const issue = issues.find((x) => x.id === selected);
  if (!issue) {
    target.replaceChildren(el('p', 'empty', t('empty', { times: timesLabel() })));
    return;
  }
  const leadItem = leadOf(issue);
  const grid = el('section', 'grid');
  grid.append(...issue.items.filter((item) => item !== leadItem).map((item, i) => brief(item, i + 1)));
  const foot = el('footer', 'foot');
  foot.append(el('span', null, t('endOf', { name: issue.name })), el('span', null, t('footer', { times: timesLabel() })));
  target.replaceChildren(head(issue), leadStory(leadItem), grid, foot);
  window.scrollTo(0, 0);
  showProgress();
  if (!CALM.matches) {
    target.querySelectorAll('[data-anim]').forEach((node, i) => node.animate(
      [{ opacity: 0, transform: 'translateY(32px)' }, { opacity: 1, transform: 'none' }],
      { duration: 700, delay: i * 80, easing: EASE, fill: 'backwards' },
    ));
  }
}

function showList() {
  const list = document.getElementById('list');
  const parts = [];
  let day = null;
  for (const issue of issues) {
    if (issue.date !== day) {
      day = issue.date;
      parts.push(el('p', 'day', dayLabel(issue.date)));
    }
    const button = el('button', 'entry');
    button.type = 'button';
    const top = el('span', 'entry-head', `${issue.time} · ${issue.name}`);
    if (!sample && issue.id === issues[0].id) top.append(el('span', 'new-badge', t('newBadge')));
    button.append(top, el('span', 'entry-title', leadOf(issue).title));
    button.setAttribute('aria-current', String(issue.id === selected));
    button.addEventListener('click', () => {
      selected = issue.id;
      showList();
      showIssue();
    });
    parts.push(button);
  }
  list.replaceChildren(...parts);
}

function showProgress() {
  const root = document.documentElement;
  const max = root.scrollHeight - root.clientHeight;
  document.getElementById('progress-bar').style.width = `${max > 0 ? Math.min(100, (root.scrollTop / max) * 100) : 0}%`;
}

// The id of the latest issue that should exist by now according to the schedule.
function expectedIssue(now) {
  const moment = new Date(now.getTime() - GRACE_MINUTES * 60_000);
  const clock = `${String(moment.getHours()).padStart(2, '0')}:${String(moment.getMinutes()).padStart(2, '0')}`;
  let slot = [...cfg.schedule].sort().filter((time) => time <= clock).pop();
  if (!slot) {
    moment.setDate(moment.getDate() - 1);
    slot = [...cfg.schedule].sort().pop();
  }
  const date = `${moment.getFullYear()}-${String(moment.getMonth() + 1).padStart(2, '0')}-${String(moment.getDate()).padStart(2, '0')}`;
  return { id: `${date}-${slot.replace(':', '')}`, date, time: slot };
}

function showNotice() {
  const notice = document.getElementById('notice');
  if (sample) {
    notice.hidden = false;
    notice.textContent = t('sampleNotice');
    return;
  }
  const due = expectedIssue(new Date());
  const missing = issues.length > 0 && !issues.some((issue) => issue.id >= due.id);
  notice.hidden = !missing;
  if (missing) notice.textContent = t('missing', { date: dayLabel(due.date), time: due.time });
}

// --- the cat ----------------------------------------------------------------

const cat = {
  stage: document.getElementById('cat-stage'),
  button: document.getElementById('cat-button'),
  body: document.getElementById('cat-body'),
  open: document.getElementById('cat-open'),
  shadow: document.getElementById('cat-shadow'),
  slot: document.getElementById('bubble-slot'),
  talking: false,
  timer: null,
  line: -1,
  running: false,
};

function say(text) {
  clearTimeout(cat.timer);
  cat.talking = true;
  cat.slot.replaceChildren(el('div', 'bubble', text));
  cat.timer = setTimeout(() => {
    cat.talking = false;
    cat.slot.replaceChildren();
  }, 5000);
}

function announce() {
  const issue = issues.find((x) => x.id === selected);
  if (!issue) return;
  const name = issue.name;
  const lines = [
    cfg.userName ? t('cat.helloNamed', { user: cfg.userName, name }) : t('cat.hello', { name }),
    t('cat.lead', { title: leadOf(issue).title }),
    t('cat.count', { n: issue.items.length }),
    t('cat.idle'),
  ];
  cat.line = (cat.line + 1) % lines.length;
  say(lines[cat.line]);
}

function startCat() {
  if (cat.running) return;
  cat.running = true;
  cat.stage.hidden = false;
  cat.button.title = t('cat.title');
  cat.button.setAttribute('aria-label', t('cat.label'));
  cat.button.addEventListener('click', announce);
  setTimeout(announce, 1200);
  if (CALM.matches) return; // stays put but still talks

  let x = 40; let dir = 1; let facing = 1; let phase = 0; let pause = 0;
  let untilPause = 400 + Math.random() * 500;
  let last = performance.now();
  const frame = (now) => {
    const dt = Math.min(50, now - last);
    last = now;
    const sidebar = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--sidebar')) || 0;
    const max = Math.max(10, window.innerWidth - sidebar - 110);
    const still = pause > 0 || cat.talking;
    if (pause > 0) pause -= dt;
    if (!still || phase > 0) {
      phase += dt / 460;
      if (phase >= 1) phase = still ? 0 : phase - 1;
    }
    if (!still) {
      x += dir * dt * 0.11 * Math.sin(phase * Math.PI) ** 2;
      if (x > max) { x = max; dir = -1; }
      if (x < 10) { x = 10; dir = 1; }
      untilPause -= dt * 0.06;
      if (untilPause <= 0) {
        pause = 1800 + Math.random() * 2200;
        untilPause = 300 + Math.random() * 600;
        if (Math.random() < 0.5) dir *= -1;
      }
    }
    cat.stage.style.transform = `translateX(${Math.min(x, max)}px)`;
    facing += (dir - facing) * Math.min(1, dt / 90);
    cat.button.style.transform = `scaleX(${facing.toFixed(3)})`;
    const lift = Math.sin(phase * Math.PI);
    const land = phase < 0.12 ? 1 - phase / 0.12 : phase > 0.9 ? (phase - 0.9) / 0.1 : 0;
    const sy = 1 + lift * 0.04 - land * 0.07;
    const sx = 1 - lift * 0.02 + land * 0.06;
    cat.body.style.transform = `translateY(${(-lift * 10).toFixed(2)}px) scale(${sx.toFixed(3)},${sy.toFixed(3)})`;
    cat.shadow.style.transform = `scaleX(${(1 - lift * 0.3).toFixed(3)})`;
    cat.shadow.style.opacity = (1 - lift * 0.45).toFixed(2);
    cat.open.style.opacity = cat.talking && Math.floor(now / 170) % 2 === 0 ? 1 : 0; // the mouth opens while it talks
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

// --- loading ----------------------------------------------------------------

function notify(issue) {
  api.notify(
    t('notifyTitle', { app: t('appName'), name: issue.name }),
    leadOf(issue).title || t('notifyBody', { n: issue.items.length }),
  );
}

async function load() {
  let result;
  try {
    result = await api.issues();
  } catch {
    return; // try again at the next poll
  }
  const newest = result.issues[0]?.id ?? null;
  const lastSeen = localStorage.getItem(REMEMBER);
  const wasOnNewest = !selected || selected === issues[0]?.id;
  issues = result.issues;
  sample = result.sample;
  const isNew = Boolean(!sample && newest && lastSeen && newest > lastSeen);
  if (!sample && newest) localStorage.setItem(REMEMBER, newest);
  if (isNew) notify(issues[0]);
  const switched = wasOnNewest && selected !== newest;
  if (switched) selected = newest;
  showList();
  showNotice();
  if (switched || !document.getElementById('issue').hasChildNodes()) showIssue();
  if (newest) startCat();
  if (isNew && cat.running) say(t('cat.fresh', { name: issues[0].name }));
}

async function start() {
  try {
    cfg = { ...cfg, ...(await api.config()) };
  } catch {
    // keep the defaults; the interface then shows the text keys
  }
  document.documentElement.lang = String(cfg.language).split('-')[0];
  document.title = t('appName');
  document.getElementById('app-name').textContent = t('appName');
  document.getElementById('archive-title').textContent = t('issues');
  window.addEventListener('scroll', showProgress, { passive: true });
  await load();
  if (issues.length === 0) showIssue();
  setInterval(load, POLL_MS);
}

start();
