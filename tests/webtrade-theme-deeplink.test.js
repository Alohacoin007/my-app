#!/usr/bin/env node
// REGRESSION — the marketing footer "Log in" opens the WebTrader in the LEGEND theme. webtrade.html
// must honour a ?theme=legend|light (→ Legend) / ?theme=dark|mt5 (→ dark) deep-link on load, and the
// fx/ib/about footers must link to webtrade.html?theme=legend (not the bare page / not login.html).
'use strict';
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'webtrade.html'), 'utf8');
let fail = 0;
const bad = (m) => { console.error('🔴 ' + m); fail++; };

// 1) deep-link parser exists and maps legend/light → 'light', dark/mt5 → 'dark'
const m = src.match(/const WT_URL_THEME = \(\(\)=>\{[\s\S]*?\}\)\(\);/);
if (!m) bad('WT_URL_THEME deep-link parser missing');
else {
  const p = m[0];
  if (!/URLSearchParams\(location\.search\)\.get\('theme'\)/.test(p)) bad('WT_URL_THEME must read the ?theme= query param');
  if (!/'legend'|'light'/.test(p) || !/return 'light'/.test(p)) bad("WT_URL_THEME must map legend/light → 'light'");
  if (!/'dark'|'mt5'/.test(p) || !/return 'dark'/.test(p)) bad("WT_URL_THEME must map dark/mt5 → 'dark'");
  // behavioural: evaluate the parser under fake locations
  const build = (search) => {
    const location = { search };
    // eslint-disable-next-line no-eval
    return eval('(function(){ const location = arguments[0]; return ' + p.replace(/^const WT_URL_THEME = /, '').replace(/;$/, '') + '; })')(location);
  };
  if (build('?theme=legend') !== 'light') bad('?theme=legend must resolve to light (Legend)');
  if (build('?theme=light')  !== 'light') bad('?theme=light must resolve to light');
  if (build('?theme=dark')   !== 'dark')  bad('?theme=dark must resolve to dark');
  if (build('')              !== null)    bad('no ?theme= param must resolve to null (fall back to saved setting)');
}

// 2) themeBus + App initial theme both prefer the deep-link
// 2026-07-23 레전드 고정: 기본 = 'light'(레전드). ?theme=dark는 개발 백도어로만 남고,
// 저장 설정(cfg.theme)으로는 다크가 절대 복귀하지 못한다 (다크 UI 토글 폐지).
if (!/const themeBus = \{ theme: WT_URL_THEME \|\| 'light'/.test(src)) bad("themeBus must default to 'light' (Legend locked) while still honouring the deep-link");
if (!/React\.useState\(WT_URL_THEME \|\| 'light'\)/.test(src)) bad("App theme state must be WT_URL_THEME || 'light' — saved cfg must NOT resurrect dark");
if (/cfg\.theme==='light'\?'light':'dark'/.test(src)) bad('saved-cfg dark fallback must be gone (Legend locked)');

// 3) footers link to the Legend WebTrader
for (const f of ['fx.html', 'ib.html', 'about.html']) {
  const h = fs.readFileSync(path.join(root, f), 'utf8');
  if (!/<a href="webtrade\.html\?theme=legend" target="_blank" rel="noopener">Log in<\/a>/.test(h))
    bad(`${f} footer "Log in" must link to webtrade.html?theme=legend`);
  if (/foot[\s\S]*?<a href="login\.html\?switch=1"[^>]*>Log in<\/a>/.test(h.slice(h.indexOf('foot-col') >= 0 ? h.indexOf('<h4>Account') : 0)))
    bad(`${f} footer still points "Log in" to login.html`);
}

if (fail) { console.error(`\n🔴 FAIL — ${fail} theme-deeplink problem(s).`); process.exit(1); }
console.log('🟢 PASS: webtrade honours ?theme=legend deep-link; fx/ib/about footer "Log in" opens the Legend WebTrader.');
