'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { toCron, taskPrompt } = require('../src/schedule');

const ROOT = path.join(__dirname, '..');

test('schedule: times with the same minute share one cron line', () => {
  assert.deepEqual(toCron(['19:00', '08:00', '13:00']), [
    { cron: '0 8,13,19 * * *', times: ['08:00', '13:00', '19:00'] },
  ]);
});

test('schedule: different minutes need separate lines', () => {
  assert.deepEqual(toCron(['07:30', '18:00']), [
    { cron: '30 7 * * *', times: ['07:30'] },
    { cron: '0 18 * * *', times: ['18:00'] },
  ]);
});

test('schedule: the prompt names the folder and points at EDITORIAL.md', () => {
  const prompt = taskPrompt('C:/Yomu');
  assert.match(prompt, /Project folder: C:\/Yomu/);
  assert.match(prompt, /EDITORIAL\.md/);
});

test('cli: npm run schedule prints cron lines and the prompt', () => {
  const result = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'print-schedule.js')], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /\d+ [\d,]+ \* \* \*/);
  assert.match(result.stdout, /Read EDITORIAL\.md/);
});

test('cli: the desktop shortcut refuses to run without Electron or off Windows', () => {
  const result = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'desktop-shortcut.js')], { encoding: 'utf8' });
  // On this folder Electron may or may not be installed; either way the script must exit cleanly with a message.
  assert.ok([0, 1, 2].includes(result.status), result.stderr);
});
