#!/usr/bin/env node
const path = require('path');
const { spawn } = require('child_process');
const chokidar = require('chokidar');

const DATA_DIR = path.join(__dirname, '../data');
const GLOB = path.join(DATA_DIR, '*-analysis.json');

console.log(`👀 Watching for analysis changes: ${GLOB}`);

let running = false;
let queued = false;

function runAnnotateLatest(trigger) {
  if (running) {
    queued = true;
    return;
  }
  running = true;
  console.log(`⚙️  Running annotate-latest (trigger: ${trigger})...`);
  const proc = spawn(process.execPath, [path.join(__dirname, 'annotate-latest.js')], { stdio: 'inherit' });
  proc.on('exit', (code) => {
    running = false;
    if (queued) {
      queued = false;
      setTimeout(() => runAnnotateLatest('queued'), 50);
    }
    if (code === 0) {
      console.log('✅ annotate-latest complete');
    } else {
      console.warn('⚠️ annotate-latest exited with code', code);
    }
  });
}

const watcher = chokidar.watch(GLOB, { ignoreInitial: false, awaitWriteFinish: { stabilityThreshold: 150, pollInterval: 50 } });

watcher
  .on('add', file => {
    console.log('➕ Detected new analysis file:', path.basename(file));
    runAnnotateLatest('add');
  })
  .on('change', file => {
    console.log('♻️  Detected change in:', path.basename(file));
    runAnnotateLatest('change');
  })
  .on('error', err => console.error('❌ Watch error:', err));

process.on('SIGINT', () => {
  console.log('\n👋 Watcher shutting down');
  watcher.close().then(() => process.exit(0));
});
