#!/usr/bin/env node
'use strict';

/**
 * Prints what you need to create the scheduled task: the cron expression(s) for your
 * schedule and the prompt, with the path of this folder filled in.
 * Usage: npm run schedule
 */

const path = require('node:path');
const { loadConfig } = require('../src/config');
const { toCron, taskPrompt } = require('../src/schedule');

const root = path.join(__dirname, '..');
const { config, warnings } = loadConfig(root);
warnings.forEach((warning) => console.warn(`warning: ${warning}`));

const jobs = toCron(config.schedule);
console.log('1. Schedule (cron, local time)');
for (const job of jobs) console.log(`   ${job.cron}    # ${job.times.join(', ')}`);
if (jobs.length > 1) console.log('   Your times use different minutes, so create one scheduled task per line above.');
console.log('\n2. Prompt for the scheduled task\n');
console.log(taskPrompt(root));
console.log('\nHow to create the task: see "Schedule it" in README.md.');
