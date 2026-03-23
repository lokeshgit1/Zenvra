#!/usr/bin/env node
const { Command } = require('commander');
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(process.cwd(), '.env') });
const Automo = require('../src/core');

const program = new Command();

program
  .name('automo')
  .description('AI-powered automation daemon for git syncing')
  .version('1.0.0');

program
  .command('sync')
  .description('Run a single sync cycle (git add, AI commit, push)')
  .action(async () => {
    const automo = new Automo();
    try {
      await automo.sync();
    } catch (error) {
      process.exit(1);
    }
  });

program
  .command('start')
  .description('Start the daemon in the background (runs every hour)')
  .option('-i, --interval <minutes>', 'Sync interval in minutes', '60')
  .action((options) => {
    const interval = parseInt(options.interval) * 60 * 1000;
    const automo = new Automo();
    
    console.log(`Starting Automo daemon (interval: ${options.interval}m)...`);
    automo.sync().catch(() => {});
    
    setInterval(async () => {
      try {
        await automo.sync();
      } catch (error) {
        console.error('Daemon sync failed, will retry next interval.');
      }
    }, interval);
  });

program
  .command('init')
  .description('Initialize Automo in the current directory')
  .action(() => {
    const envPath = path.join(process.cwd(), '.env');
    if (!fs.existsSync(envPath)) {
      fs.writeFileSync(envPath, 'GEMINI_API_KEY=your_key_here\n');
      console.log('Created .env template. Please add your GEMINI_API_KEY.');
    } else {
      console.log('.env already exists.');
    }
    
    const workflowDir = path.join(process.cwd(), '.github', 'workflows');
    if (!fs.existsSync(workflowDir)) {
      fs.mkdirSync(workflowDir, { recursive: true });
    }
    
    const workflowPath = path.join(workflowDir, 'automo.yml');
    const workflowContent = `name: Automo Sync
on:
  schedule:
    - cron: '0 * * * *' # Every hour
  workflow_dispatch:

jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
        with:
          fetch-depth: 0
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
      - name: Install Automo
        run: npm install -g automo-git # Placeholder name
      - name: Run Automo Sync
        run: automo sync
        env:
          GEMINI_API_KEY: \${{ secrets.GEMINI_API_KEY }}
`;
    fs.writeFileSync(workflowPath, workflowContent);
    console.log('Created GitHub Action workflow at .github/workflows/automo.yml');
  });

program.parse();
