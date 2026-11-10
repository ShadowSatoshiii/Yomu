'use strict';

const fs = require('node:fs');
const path = require('node:path');

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'target', '.venv', 'venv', '__pycache__']);
const MAX_DEPS = 30;
const EXCERPT = 600;

/** Markers that show which AI coding tools a project uses. */
const TOOL_MARKERS = [
  ['CLAUDE.md', 'Claude Code'],
  ['.claude', 'Claude Code'],
  ['.cursor', 'Cursor'],
  ['.cursorrules', 'Cursor'],
  ['.windsurfrules', 'Windsurf'],
  ['.windsurf', 'Windsurf'],
  ['.github/copilot-instructions.md', 'GitHub Copilot'],
  ['GEMINI.md', 'Gemini CLI'],
  ['.aider.conf.yml', 'Aider'],
  ['.continue', 'Continue'],
  ['AGENTS.md', 'AGENTS.md (generic agent instructions)'],
];

const SECRET_LINE = /(api[_-]?key|secret|token|password|passwd|private[_-]?key)\s*[:=]/i;
const SECRET_VALUE = [
  /sk-[A-Za-z0-9_-]{16,}/g,
  /gh[pousr]_[A-Za-z0-9]{20,}/g,
  /github_pat_[A-Za-z0-9_]{20,}/g,
  /AKIA[0-9A-Z]{16}/g,
  /xox[abprs]-[A-Za-z0-9-]{10,}/g,
  /AIza[0-9A-Za-z_-]{30,}/g,
  /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,
  /[\w.+-]+@[\w-]+\.[\w.-]+/g,
];

/** Drops lines that look like credentials and masks tokens and e-mail addresses. */
function clean(text) {
  return text
    .split(/\r?\n/)
    .filter((line) => !SECRET_LINE.test(line))
    .map((line) => SECRET_VALUE.reduce((out, pattern) => out.replace(pattern, '[removed]'), line))
    .join('\n');
}

function exists(target) {
  try {
    fs.accessSync(target);
    return true;
  } catch {
    return false;
  }
}

function readText(file, limit = 200_000) {
  try {
    return fs.readFileSync(file, 'utf8').slice(0, limit);
  } catch {
    return null;
  }
}

function firstWords(text, count = EXCERPT) {
  const lines = clean(text)
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !/^(!\[|\[!\[|<|---)/.test(line));
  const joined = lines.join(' ').replace(/\s+/g, ' ');
  return joined.length > count ? `${joined.slice(0, count).trimEnd()}…` : joined;
}

function names(list) {
  return [...new Set(list)].slice(0, MAX_DEPS);
}

/** Pulls dependency names from the manifest files we know. Names only, never versions or values. */
function readStacks(dir) {
  const stacks = [];
  const add = (label, deps, extra = {}) => stacks.push({ label, dependencies: names(deps), ...extra });

  const pkg = readText(path.join(dir, 'package.json'));
  if (pkg) {
    try {
      const json = JSON.parse(pkg);
      add('Node.js / JavaScript', Object.keys({ ...json.dependencies, ...json.devDependencies }), { description: json.description });
    } catch {
      add('Node.js / JavaScript', []);
    }
  }
  const requirements = readText(path.join(dir, 'requirements.txt'));
  if (requirements) {
    add('Python', requirements.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#') && !l.startsWith('-'))
      .map((l) => l.split(/[<>=!~;[ ]/)[0]).filter(Boolean));
  }
  const pyproject = readText(path.join(dir, 'pyproject.toml'));
  if (pyproject) {
    const block = pyproject.match(/dependencies\s*=\s*\[([\s\S]*?)\]/);
    add('Python', block ? [...block[1].matchAll(/["']([A-Za-z0-9_.-]+)/g)].map((m) => m[1]) : []);
  }
  const cargo = readText(path.join(dir, 'Cargo.toml'));
  if (cargo) {
    const section = cargo.match(/\[dependencies\]([\s\S]*?)(\n\[|$)/);
    add('Rust', section ? [...section[1].matchAll(/^\s*([A-Za-z0-9_-]+)\s*=/gm)].map((m) => m[1]) : []);
  }
  const gomod = readText(path.join(dir, 'go.mod'));
  if (gomod) add('Go', [...gomod.matchAll(/^\s*([\w.-]+\/[\w./-]+)\s+v/gm)].map((m) => m[1]));
  const composer = readText(path.join(dir, 'composer.json'));
  if (composer) {
    try {
      add('PHP', Object.keys(JSON.parse(composer).require ?? {}));
    } catch {
      add('PHP', []);
    }
  }
  const gemfile = readText(path.join(dir, 'Gemfile'));
  if (gemfile) add('Ruby', [...gemfile.matchAll(/^\s*gem\s+['"]([\w-]+)/gm)].map((m) => m[1]));
  try {
    for (const name of fs.readdirSync(dir).filter((n) => n.endsWith('.csproj')).slice(0, 3)) {
      const xml = readText(path.join(dir, name)) ?? '';
      add('.NET', [...xml.matchAll(/PackageReference\s+Include="([^"]+)"/g)].map((m) => m[1]));
    }
  } catch {
    // unreadable folder, nothing to add
  }
  return stacks;
}

/** Reads one project folder and returns what Dispatch may use to pick relevant news. */
function scanProject(dir) {
  const root = path.resolve(dir);
  if (!exists(root)) return { name: path.basename(root), path: root, missing: true };

  const tools = [...new Set(TOOL_MARKERS.filter(([marker]) => exists(path.join(root, marker))).map(([, tool]) => tool))];
  const readme = ['README.md', 'readme.md', 'README.txt'].map((n) => readText(path.join(root, n))).find(Boolean);
  const instructions = ['CLAUDE.md', 'AGENTS.md', '.cursorrules', 'GEMINI.md'].map((n) => readText(path.join(root, n))).find(Boolean);
  return {
    name: path.basename(root),
    path: root,
    stacks: readStacks(root),
    tools,
    readme: readme ? firstWords(readme) : null,
    instructions: instructions ? firstWords(instructions, 400) : null,
  };
}

function renderProfile(projects, when = new Date()) {
  const lines = [
    '# Generated project profile',
    '',
    `Generated by \`npm run scan\` on ${when.toISOString().slice(0, 10)}. Dispatch reads this file when it picks news.`,
    'Only manifest files, README and agent instruction files were read. Credential-like lines and e-mail addresses were removed.',
    'Read it once and delete anything you do not want used. Run `npm run scan` again to refresh it.',
    '',
  ];
  if (projects.length === 0) lines.push('_No projects scanned yet. Add folders to "projects" in dispatch.config.json._', '');
  for (const project of projects) {
    lines.push(`## ${project.name}`, '', `- Folder: ${project.path}`);
    if (project.missing) {
      lines.push('- This folder does not exist, so nothing was read.', '');
      continue;
    }
    for (const stack of project.stacks) {
      lines.push(`- Stack: ${stack.label}${stack.dependencies.length ? `, uses ${stack.dependencies.join(', ')}` : ''}`);
      if (stack.description) lines.push(`- Described as: ${clean(stack.description)}`);
    }
    if (project.stacks.length === 0) lines.push('- Stack: no known manifest file found');
    if (project.tools.length) lines.push(`- AI tools in use: ${project.tools.join(', ')}`);
    if (project.readme) lines.push(`- README starts with: ${project.readme}`);
    if (project.instructions) lines.push(`- Agent instructions start with: ${project.instructions}`);
    lines.push('');
  }
  return lines.join('\n');
}

module.exports = { scanProject, renderProfile, clean, SKIP_DIRS };
