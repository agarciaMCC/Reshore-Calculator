// @rules UI-24, UI-25, UI-26  (see DECISIONS.md)
// The shell after the Sep 21 2026 revamp: one type scale and one pill
// vocabulary (UI-24), the rail as a checklist (UI-25), one Next bar that
// names the next action (UI-26).
import { createRequire } from 'node:module';
const { chromium } = await (async () => {
  try { return await import('playwright'); }
  catch { return createRequire('/home/claude/x.js')('playwright'); }
})();
import path from 'node:path';
import fs from 'node:fs';
const here = decodeURIComponent(new URL('.', import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL', m); } };
const appPath = path.resolve(here, '..', 'reshore-calc.html');

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 900 } });
page.on('pageerror', e => { fail++; console.log('  PAGEERROR', e.message); });
await page.goto('file://' + appPath);
await page.waitForFunction(() => typeof solveAll === 'function');
await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });

// ── A. one type scale ───────────────────────────────────────────────────
console.log('A. four sizes, nothing else (UI-24)');
{
  const html = fs.readFileSync(appPath, 'utf8');
  // the app's own stylesheet: everything before the first embedded library
  const css = html.slice(html.indexOf('<style>'), html.indexOf('</style>'));
  const px = [...css.matchAll(/font-size:\s*([0-9.]+)px/g)].map(m => +m[1]).filter(v => v < 40);
  ok(px.length === 0, 'no literal pixel font sizes left in the stylesheet (found ' + px.length + ': ' + [...new Set(px)].join(', ') + ')');
  const toks = [...css.matchAll(/font-size:\s*var\(--fs-(xl|lg|md|sm)\)/g)].length;
  ok(toks > 200, 'the sizes are the four tokens: ' + toks + ' uses');
  const live = await page.evaluate(() => {
    const cs = getComputedStyle(document.documentElement);
    return ['xl', 'lg', 'md', 'sm'].map(k => cs.getPropertyValue('--fs-' + k).trim());
  });
  ok(live.join(' ') === '18px 14px 12.5px 11px', 'and they resolve to 18 / 14 / 12.5 / 11: ' + live.join(' '));
}

// ── fixture: a job with the Building step half done ─────────────────────
await page.evaluate(() => {
  const T = [1, 0, 0, 1, 0, 0];
  const mk = (name, el, slab, cap) => ({
    id: sid(), name, elevation: el, floorToFloor: null, slabThickness: slab, defaultCapacity: cap,
    rangeFrom: null, rangeTo: null, pdfPage: null, zones: [], slabZones: [],
    alignment: { transform: T, points: [] },
  });
  state.project = { name: 'shell', loadingConditions: [], shoreChoices: {}, solveStepFt: 10 };
  state.levels = [mk('L3', 30, 7.5, 54), mk('L2', 20, 7.5, 54), mk('L1', 10, 7.5, 400)];
  state.pdf.pages = 1; state.pdf.current = 1;
  state.levels.forEach(l => { l.pdfPage = 1; });
  renderSidebar(); persist(); setStep('levels');
});
await page.waitForTimeout(400);

// ── B. pills everywhere a state is shown ────────────────────────────────
console.log('B. one pill vocabulary (UI-24)');
{
  const r = await page.evaluate(() => {
    const kinds = new Set([...document.querySelectorAll('.pill')].map(p => [...p.classList].find(c => c !== 'pill')));
    const heads = [...document.querySelectorAll('#stepPanels .sec-head')];
    const headPills = heads.filter(h => h.querySelector('.sh-s .pill')).length;
    const railPills = document.querySelectorAll('#stepRail .pill').length;
    const cs = getComputedStyle(document.querySelector('.pill.need') || document.body);
    return { kinds: [...kinds], heads: heads.length, headPills, railPills, needBg: cs.backgroundColor };
  });
  ok(r.kinds.every(k => ['need', 'ok', 'read', 'lock'].includes(k)), 'only the four kinds are used: ' + r.kinds.join(', '));
  ok(r.heads > 0 && r.headPills === r.heads, 'every section head carries its state as a pill: ' + r.headPills + ' of ' + r.heads);
  ok(r.railPills >= 4, 'so does every step on the rail: ' + r.railPills);
  ok(/251, 241, 220|rgb\(46, 36, 16\)/.test(r.needBg), '"needs you" is amber, not red: ' + r.needBg);
}

// ── C. the rail is a checklist ──────────────────────────────────────────
console.log('C. the rail lists the sections of the current step (UI-25)');
{
  const r = await page.evaluate(() => {
    const cur = document.querySelector('#stepRail .step.current');
    const secs = [...cur.querySelectorAll('.rail-sec')].map(b => ({ id: b.dataset.sec, on: b.classList.contains('on'), done: b.classList.contains('done'), need: b.classList.contains('need'), status: b.querySelector('.rs-s').textContent.trim() }));
    const others = [...document.querySelectorAll('#stepRail .step:not(.current) .rail-sec')].length;
    const pill = cur.querySelector('.step-sub .pill').textContent.trim();
    return { secs, others, pill };
  });
  ok(r.secs.map(s => s.id).join(',') === 'drawings,levels,sheets,edge,match', 'Building lists its five sections in order: ' + r.secs.map(s => s.id).join(','));
  ok(r.secs.find(s => s.id === 'levels').on, 'the section in focus is marked');
  ok(r.secs.find(s => s.id === 'drawings').done, 'a finished section is ticked');
  const lv = r.secs.find(s => s.id === 'levels');
  ok(lv.need && /confirm/i.test(lv.status), 'an unfinished one says what it wants: ' + lv.status);
  ok(r.others === 0, 'only the current step is expanded');
  ok(/^\d of 5 done$/.test(r.pill), 'the step sums itself up as n of m done: ' + r.pill);
  // clicking a section row goes there
  await page.click('#stepRail .rail-sec[data-sec="sheets"]');
  await page.waitForTimeout(200);
  ok(await page.evaluate(() => curStep === 'sheets'), 'clicking a row on the checklist opens that section');
  await page.evaluate(() => setStep('levels'));
}

// ── D. the Next bar names the action ────────────────────────────────────
console.log('D. one Next bar, naming what is wanted (UI-26)');
{
  const r = await page.evaluate(() => {
    const f = document.getElementById('stepFoot');
    const now = f.querySelector('.sf-now'), txt = now && now.querySelector('.sf-txt');
    const pill = now && now.querySelector('.pill');
    const btn = f.querySelector('#stepNext, #stepGo');
    return { hidden: f.hidden, pill: pill && pill.textContent.trim(), txt: txt && txt.textContent.trim(), btn: btn && btn.textContent.trim(), disabled: btn && btn.disabled, id: btn && btn.id };
  });
  ok(!r.hidden && r.pill === 'Levels', 'the bar names the section that wants something: ' + r.pill);
  ok(/^Now:/.test(r.txt) && /confirm/i.test(r.txt), 'and what it wants, as an action: ' + r.txt);
  ok(r.id === 'stepNext' && r.disabled, 'Next waits while the section in focus is the one wanting: ' + r.btn);
  // once the levels are confirmed, the bar sends you to the next section wanting something
  await page.evaluate(() => { confirmLevels(); });
  await page.waitForTimeout(300);
  const r2 = await page.evaluate(() => {
    const f = document.getElementById('stepFoot');
    const btn = f.querySelector('#stepNext, #stepGo');
    const want = ['sheets', 'edge', 'match'].find(s => !stepStatus(s).done);
    return { want, wantTitle: stepTitle(want), pill: f.querySelector('.sf-now .pill').textContent.trim(), btn: btn.textContent.trim(), id: btn.id, disabled: btn.disabled };
  });
  ok(r2.id === 'stepGo' && r2.btn === 'Go to ' + r2.wantTitle + ' ↓' && !r2.disabled, 'with Levels done, the one button goes to the next section wanting something: ' + r2.btn);
  ok(r2.pill === r2.wantTitle, 'and the bar says so: ' + r2.pill);
  await page.click('#stepGo');
  await page.waitForTimeout(200);
  ok(await page.evaluate(w => curStep === w, r2.want), 'pressing it lands there');
}

// ── E. one primary button per section, plus the bar ─────────────────────
console.log('E. red is spent once per section');
{
  const r = await page.evaluate(() => {
    const out = {};
    for (const p of document.querySelectorAll('.step-panel.active:not(.sec-collapsed)')) {
      const vis = [...p.querySelectorAll('.btn-primary')].filter(b => b.offsetParent !== null && !b.closest('details:not([open])'));
      out[p.dataset.step] = vis.length;
    }
    return out;
  });
  const over = Object.entries(r).filter(([, n]) => n > 1);
  ok(over.length === 0, 'no open section shows more than one primary button: ' + JSON.stringify(r));
}

await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
