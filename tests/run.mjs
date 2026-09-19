// Run the whole suite and say which DECISIONS are at risk.
//
//   node tests/run.mjs                  everything
//   node tests/run.mjs slivers overlap  just those
//   node tests/run.mjs --rule RGN-03    every suite covering that rule
//   RESHORE_JOBS=1 node tests/run.mjs   serial (default 4 at a time)
//
// A suite prints "N passed, M failed" and exits non-zero on failure. This
// collects that, and for any suite that fails, lists the rule IDs from its
// "// @rules" header — so a red run names the decisions it puts at risk
// instead of just a filename.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const here = decodeURIComponent(new URL('.', import.meta.url).pathname);
const root = path.resolve(here, '..');
const JOBS = Math.max(1, Number(process.env.RESHORE_JOBS || 4));
const TIMEOUT = Number(process.env.RESHORE_TIMEOUT || 300) * 1000;

const argv = process.argv.slice(2);
const ruleIdx = argv.indexOf('--rule');
const wantRule = ruleIdx >= 0 ? argv[ruleIdx + 1] : null;
const names = argv.filter((a, i) => !a.startsWith('--') && i !== ruleIdx + 1);

const all = fs.readdirSync(here).filter(f =>
  f.endsWith('.mjs') && f !== 'run.mjs' && f !== 'rules.mjs').sort();

const rulesOf = f => {
  const m = /^\/\/ @rules (.+)$/m.exec(fs.readFileSync(path.join(here, f), 'utf8').slice(0, 400));
  return m ? (m[1].match(/[A-Z]{3}-\d{2}/g) || []) : [];
};

let suites = all;
if (names.length) suites = all.filter(f => names.some(n => f.includes(n)));
if (wantRule) suites = suites.filter(f => rulesOf(f).includes(wantRule));
if (!suites.length) { console.log('no suites matched'); process.exit(1); }

const run = f => new Promise(res => {
  const t0 = Date.now();
  const p = spawn(process.execPath, [path.join(here, f)], { cwd: root });
  let out = '';
  p.stdout.on('data', d => out += d);
  p.stderr.on('data', d => out += d);
  const timer = setTimeout(() => { p.kill('SIGKILL'); }, TIMEOUT);
  p.on('close', code => {
    clearTimeout(timer);
    const m = /(\d+) passed, (\d+) failed/.exec(out);
    res({
      file: f, code, secs: (Date.now() - t0) / 1000,
      pass: m ? +m[1] : 0,
      fail: m ? +m[2] : (code === 0 ? 0 : 1),
      crashed: !m,
      lines: out.split('\n').filter(l => /^\s+(FAIL|PAGEERROR)/.test(l)),
      tail: out.trim().split('\n').slice(-6).join('\n'),
    });
  });
});

const results = [];
const queue = [...suites];
await Promise.all(Array.from({ length: Math.min(JOBS, queue.length) }, async () => {
  while (queue.length) {
    const f = queue.shift();
    const r = await run(f);
    results.push(r);
    const tag = r.crashed ? 'CRASH' : r.fail ? `${r.fail} FAILED` : 'ok';
    console.log(`  ${tag.padEnd(10)} ${f.replace('.mjs', '').padEnd(16)} ${r.pass} checks  ${r.secs.toFixed(0)}s`);
  }
}));

results.sort((a, b) => a.file.localeCompare(b.file));
const bad = results.filter(r => r.fail || r.crashed);
const checks = results.reduce((n, r) => n + r.pass, 0);

console.log(`\n${'='.repeat(64)}`);
console.log(`${results.length} suites, ${checks} checks, ${bad.length} suite(s) not green`);

if (bad.length) {
  const atRisk = new Set();
  console.log('');
  for (const r of bad) {
    const ids = rulesOf(r.file);
    ids.forEach(id => atRisk.add(id));
    console.log(`${r.file}${r.crashed ? '  — CRASHED, no summary printed' : ''}`);
    for (const l of r.lines.slice(0, 8)) console.log('   ' + l.trim());
    if (r.crashed) console.log('   ' + r.tail.split('\n').join('\n   '));
    if (ids.length) console.log(`   decisions at risk: ${ids.join(', ')}`);
    console.log('');
  }
  console.log(`Decisions at risk: ${[...atRisk].sort().join(', ')}`);
  console.log('Read them in DECISIONS.md before changing a test to match the code.');
}
console.log('');
process.exit(bad.length ? 1 : 0);
