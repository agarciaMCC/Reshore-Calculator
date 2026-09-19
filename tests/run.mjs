// @rules none
// Run the suite and say which DECISIONS are at risk.
//
//   node tests/run.mjs                  everything (resumes; see --fresh)
//   node tests/run.mjs slivers overlap  just those
//   node tests/run.mjs --rule RGN-03    every suite covering that rule
//   node tests/run.mjs --report         print the last run's result, run nothing
//   node tests/run.mjs --fresh          discard saved state and start over
//   RESHORE_JOBS=8 RESHORE_BUDGET=38 node tests/run.mjs
//
// A suite prints "N passed, M failed" and exits non-zero on failure. This
// collects that, and for anything red it lists the rule IDs from that file's
// "// @rules" header — so a failure names the decisions it endangers rather
// than just a filename.
//
// Each suite takes ~35s and the shell this usually runs in caps at 45s, so the
// run works to a time budget and saves what it finished to tests/.run-state.json.
// Call it again to pick up where it stopped; it reports when the last one lands.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const here = decodeURIComponent(new URL('.', import.meta.url).pathname);
const root = path.resolve(here, '..');
const STATE = path.join(here, '.run-state.json');

// Browsers live in .pw-browsers in the project folder (gitignored) because the
// network allowlist blocks playwright's own download, plus the one system
// library the VM lacks.
const LOCAL_BROWSERS = path.join(root, '.pw-browsers');
if (!process.env.PLAYWRIGHT_BROWSERS_PATH && fs.existsSync(LOCAL_BROWSERS))
  process.env.PLAYWRIGHT_BROWSERS_PATH = LOCAL_BROWSERS;
const LOCAL_LIB = path.join(LOCAL_BROWSERS, 'lib');
if (fs.existsSync(LOCAL_LIB))
  process.env.LD_LIBRARY_PATH = [LOCAL_LIB, process.env.LD_LIBRARY_PATH].filter(Boolean).join(':');

const JOBS = Math.max(1, Number(process.env.RESHORE_JOBS || 6));
const BUDGET = Number(process.env.RESHORE_BUDGET || 38) * 1000;
const TIMEOUT = Number(process.env.RESHORE_TIMEOUT || 300) * 1000;

const argv = process.argv.slice(2);
const flag = f => argv.includes(f);
const ruleIdx = argv.indexOf('--rule');
const wantRule = ruleIdx >= 0 ? argv[ruleIdx + 1] : null;
const names = argv.filter((a, i) => !a.startsWith('--') && !(ruleIdx >= 0 && i === ruleIdx + 1));

const all = fs.readdirSync(here).filter(f =>
  f.endsWith('.mjs') && f !== 'run.mjs' && f !== 'rules.mjs').sort();

const rulesOf = f => {
  const m = /^\/\/ @rules (.+)$/m.exec(fs.readFileSync(path.join(here, f), 'utf8').slice(0, 400));
  return m ? (m[1].match(/[A-Z]{3}-\d{2}/g) || []) : [];
};

let want = all;
if (names.length) want = all.filter(f => names.some(n => f.includes(n)));
if (wantRule) want = want.filter(f => rulesOf(f).includes(wantRule));
if (!want.length) { console.log('no suites matched'); process.exit(1); }

const sig = want.join(',');
let state = { sig, done: {} };
if (!flag('--fresh') && fs.existsSync(STATE)) {
  try {
    const s = JSON.parse(fs.readFileSync(STATE, 'utf8'));
    if (s.sig === sig) state = s;
  } catch {}
}

const report = () => {
  const results = Object.values(state.done).sort((a, b) => a.file.localeCompare(b.file));
  const bad = results.filter(r => r.fail || r.crashed);
  const checks = results.reduce((n, r) => n + r.pass, 0);
  console.log(`\n${'='.repeat(64)}`);
  console.log(`${results.length}/${want.length} suites, ${checks} checks, ${bad.length} not green`);
  if (bad.length) {
    const atRisk = new Set();
    console.log('');
    for (const r of bad) {
      const ids = rulesOf(r.file);
      ids.forEach(id => atRisk.add(id));
      console.log(`${r.file}${r.crashed ? '  — CRASHED, no summary printed' : ''}`);
      for (const l of (r.lines || []).slice(0, 8)) console.log('   ' + l.trim());
      if (r.crashed && r.tail) console.log('   ' + r.tail.split('\n').join('\n   '));
      if (ids.length) console.log(`   decisions at risk: ${ids.join(', ')}`);
      console.log('');
    }
    console.log(`Decisions at risk: ${[...atRisk].sort().join(', ')}`);
    console.log('Read them in DECISIONS.md before changing a test to match the code.');
  }
  const left = want.filter(f => !state.done[f]);
  if (left.length) console.log(`\n${left.length} suite(s) still to run — call again to continue.`);
  console.log('');
  return bad.length === 0 && left.length === 0;
};

if (flag('--report')) process.exit(report() ? 0 : 1);

const run = f => new Promise(res => {
  const t0 = Date.now();
  const p = spawn(process.execPath, [path.join(here, f)], { cwd: root, env: process.env });
  let out = '';
  p.stdout.on('data', d => out += d);
  p.stderr.on('data', d => out += d);
  const timer = setTimeout(() => p.kill('SIGKILL'), TIMEOUT);
  p.on('close', code => {
    clearTimeout(timer);
    const m = /(\d+) passed, (\d+) failed/.exec(out);
    res({
      file: f, code, secs: +((Date.now() - t0) / 1000).toFixed(0),
      pass: m ? +m[1] : 0,
      fail: m ? +m[2] : (code === 0 ? 0 : 1),
      crashed: !m,
      lines: out.split('\n').filter(l => /^\s+(FAIL|PAGEERROR)/.test(l)),
      tail: out.trim().split('\n').slice(-6).join('\n'),
    });
  });
});

const t0 = Date.now();
const queue = want.filter(f => !state.done[f]);
if (!queue.length) process.exit(report() ? 0 : 1);

const save = () => fs.writeFileSync(STATE, JSON.stringify(state, null, 1));
let stopped = false;

await Promise.all(Array.from({ length: Math.min(JOBS, queue.length) }, async () => {
  while (queue.length && !stopped) {
    if (Date.now() - t0 > BUDGET) { stopped = true; break; }
    const f = queue.shift();
    const r = await run(f);
    state.done[f] = r; save();
    const tag = r.crashed ? 'CRASH' : r.fail ? `${r.fail} FAILED` : 'ok';
    console.log(`  ${tag.padEnd(10)} ${f.replace('.mjs', '').padEnd(16)} ${r.pass} checks  ${r.secs}s`);
  }
}));

process.exit(report() ? 0 : 1);
