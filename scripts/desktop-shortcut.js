#!/usr/bin/env node
'use strict';

/**
 * Creates a Dispatch shortcut with its own icon on your Windows desktop.
 * Usage: npm run desktop [-- --out <folder>]      (default folder: your Desktop)
 * Run `npm install` first, so that Electron is present.
 */

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.join(__dirname, '..');

if (process.platform !== 'win32') {
  console.error('The desktop shortcut is Windows only. On macOS and Linux start Dispatch with: npm start');
  process.exit(2);
}

const electron = path.join(root, 'node_modules', 'electron', 'dist', 'electron.exe');
if (!fs.existsSync(electron)) {
  console.error('Electron is not installed yet. Run "npm install" first.');
  process.exit(1);
}

const outIndex = process.argv.indexOf('--out');
const outFolder = outIndex > -1 ? process.argv[outIndex + 1] : null;

// Paths go through environment variables, so that no path can be read as PowerShell code.
const script = `
$folder = if ($env:DISPATCH_OUT) { $env:DISPATCH_OUT } else { [Environment]::GetFolderPath('Desktop') }
$link = Join-Path $folder 'Dispatch.lnk'
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($link)
$shortcut.TargetPath = $env:DISPATCH_ELECTRON
$shortcut.Arguments = '"' + $env:DISPATCH_ROOT + '"'
$shortcut.WorkingDirectory = $env:DISPATCH_ROOT
$shortcut.IconLocation = $env:DISPATCH_ICON
$shortcut.Description = 'Dispatch'
$shortcut.Save()
Write-Output $link
`;

const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
  encoding: 'utf8',
  env: {
    ...process.env,
    DISPATCH_OUT: outFolder ? path.resolve(outFolder) : '',
    DISPATCH_ELECTRON: electron,
    DISPATCH_ROOT: root,
    DISPATCH_ICON: path.join(root, 'build', 'icon.ico'),
  },
});

if (result.status !== 0) {
  console.error(`Could not create the shortcut: ${(result.stderr || result.stdout).trim()}`);
  process.exit(1);
}
console.log(`Created ${result.stdout.trim()}`);
