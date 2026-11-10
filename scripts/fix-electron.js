#!/usr/bin/env node
'use strict';

/**
 * Repairs an Electron install whose download worked but whose unpacking silently failed.
 * This happens with very new Node versions (seen with Node 26): `npm install` finishes,
 * but node_modules/electron/dist is empty and `npm start` cannot find Electron.
 * The archive is already in Electron's cache, so this script unpacks it by hand (Windows).
 *
 * Usage: npm run fix-electron
 * Better long-term fix: use a Node LTS version (22 or 20), then run `npm install` again.
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.join(__dirname, '..');
const electronFolder = path.join(root, 'node_modules', 'electron');

if (process.platform !== 'win32') {
  console.error('This repair is for Windows. Elsewhere, switch to a Node LTS version and run "npm install" again.');
  process.exit(2);
}
if (!fs.existsSync(path.join(electronFolder, 'package.json'))) {
  console.error('Electron is not in node_modules. Run "npm install" first.');
  process.exit(1);
}

const dist = path.join(electronFolder, 'dist');
if (fs.existsSync(path.join(dist, 'electron.exe'))) {
  console.log('Electron is already unpacked. Nothing to do.');
  process.exit(0);
}

const { version } = require(path.join(electronFolder, 'package.json'));
const name = `electron-v${version}-win32-${process.arch}.zip`;
const cache = process.env.electron_config_cache || path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'electron', 'Cache');

function find(folder, depth = 0) {
  let entries;
  try {
    entries = fs.readdirSync(folder, { withFileTypes: true });
  } catch {
    return null;
  }
  for (const entry of entries) {
    const full = path.join(folder, entry.name);
    if (entry.isFile() && entry.name === name) return full;
    if (entry.isDirectory() && depth < 3) {
      const found = find(full, depth + 1);
      if (found) return found;
    }
  }
  return null;
}

const archive = find(cache);
if (!archive) {
  console.error(`Electron's archive (${name}) is not in ${cache}.\nRun "npm install" once with an internet connection so that it gets downloaded, then run this again.`);
  process.exit(1);
}

console.log(`Unpacking ${archive} ...`);
fs.mkdirSync(dist, { recursive: true });
const result = spawnSync('powershell.exe', [
  '-NoProfile', '-NonInteractive', '-Command',
  'Expand-Archive -LiteralPath $env:YOMU_ZIP -DestinationPath $env:YOMU_DIST -Force',
], { encoding: 'utf8', env: { ...process.env, YOMU_ZIP: archive, YOMU_DIST: dist } });

if (result.status !== 0 || !fs.existsSync(path.join(dist, 'electron.exe'))) {
  console.error(`Unpacking failed: ${(result.stderr || result.stdout).trim()}`);
  process.exit(1);
}
fs.writeFileSync(path.join(electronFolder, 'path.txt'), 'electron.exe');
console.log('Done. Start Yomu with: npm start');
