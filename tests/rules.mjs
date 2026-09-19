// Rule coverage: which decisions in DECISIONS.md no test asserts.
//
// Every rule in DECISIONS.md has a stable ID (MDL-02, RGN-03, ...). Every test
// file declares the rules it covers in a "// @rules" header line. This reports
// the rules nothing asserts — the regression backlog — and errors on a test
// that names a rule DECISIONS.md does not have (a typo, or a rule deleted
// instead of superseded).
//
//   node tests/rules.mjs            the report
//   node tests/rules.mjs --json     machine readable
import fs from 'node:fs';
import path from 'node:path';

const here = decodeURIComponent(new URL('.', import.meta.url).pathname);
const root = path.resolve(here, '..');
const json = process.argv.includes('--json');

const md = fs.readFileSync(path.join(root, 'DECISIONS.md'), 'utf8');
const superseded = md.split(/^## Superseded/m)[1] || '';

const rules = new Map();
for (const line of md.split(/\r?\n/)) {
  const m = /^\|\s*([A-Z]{3}-\d{2})\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*$/.exec(line);
  if (m) rules.set(m[1], { text: m[2], decided: m[3], tests: [] });
}

const orphans = [];
for (const fn of fs.readdirSync(path.join(root, 'tests')).sort()) {
  if (!fn.endsWith('.mjs') || fn === 'rules.mjs' || fn === 'run.mjs') continue;
  const head = fs.readFileSync(path.join(root, 'tests', fn), 'utf8').slice(0, 400);
  const m = /^\/\/ @rules (.+)$/m.exec(head);
  if (!m) continue;
  for (const id of m[1].match(/[A-Z]{3}-\d{2}/g) || []) {
    if (rules.has(id)) rules.get(id).tests.push(fn);
    else orphans.push({ id, file: fn });
  }
}

const covered = [...rules].filter(([, r]) => r.tests.length);
const gaps = [...rules].filter(([, r]) => !r.tests.length);

if (json) {
  console.log(JSON.stringify({
    total: rules.size, covered: covered.length, gaps: gaps.map(([id]) => id), orphans,
  }, null, 2));
  process.exit(orphans.length ? 1 : 0);
}

const pct = Math.round((covered.length / rules.size) * 100);
console.log(`\nDECISIONS.md — ${rules.size} rules, ${covered.length} with a test, ${gaps.length} without (${pct}% covered)\n`);

if (gaps.length) {
  console.log('NO TEST ASSERTS THESE:\n');
  let group = '';
  for (const [id, r] of gaps) {
    const g = id.slice(0, 3);
    if (g !== group) { group = g; console.log(''); }
    console.log(`  ${id}  ${r.text.length > 96 ? r.text.slice(0, 95) + '…' : r.text}`);
  }
  console.log('');
}

if (orphans.length) {
  console.log('TESTS NAME RULES THAT DO NOT EXIST:\n');
  for (const o of orphans) {
    const gone = superseded.includes(o.id);
    console.log(`  ${o.id} in tests/${o.file}${gone ? '  (superseded — retag or retire the test)' : '  (typo, or the rule was deleted instead of superseded)'}`);
  }
  console.log('');
}

process.exit(orphans.length ? 1 : 0);
