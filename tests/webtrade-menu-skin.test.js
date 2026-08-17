#!/usr/bin/env node
// REGRESSION (webtrade) — the top menu-bar dropdown / fly-out submenus (.mdrop, .mdrop.sub) must wear
// the app-core matte-black skin, not the old grey Windows look (#1b1f25 bg / #3a3f47 border / #3a6ea5
// blue hover). Container = #0E1015 bg + #1D212A hairline + radius 0 (all !important, locked); rows =
// #E1E4ED silver-white text with a Robinhood #1C1F26 shadow highlight on hover (no blue). Both themes
// share the tone (the !important dark base governs; Legend rule mirrors it).
'use strict';
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'webtrade.html'), 'utf8');
let fail = 0;
const bad = (m) => { console.error('🔴 ' + m); fail++; };

const grab = (sel) => { const m = src.match(new RegExp(sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\{([^}]*)\\}')); return m ? m[1] : null; };

// ── dropdown container: matte-black, hairline border, hard corners — all locked !important ──
const md = grab('.mdrop');
if (!md) bad('.mdrop rule not found');
else {
  if (!/background:#0E1015 !important/.test(md)) bad('.mdrop must be app-core matte black #0E1015 !important');
  if (!/border:1px solid #1D212A !important/.test(md)) bad('.mdrop must have the #1D212A hairline !important');
  if (!/border-radius:0 !important/.test(md)) bad('.mdrop must be hard-cornered (border-radius:0 !important)');
  if (!/z-index:100000/.test(md)) bad('.mdrop must keep its high z-index (renders above floating charts)');
}
// the old grey Windows skin must be gone
if (/\.mdrop\{[^}]*background:#1b1f25/.test(src)) bad('old grey #1b1f25 dropdown bg must be removed');
if (/\.mdrop \.row:hover\{background:#3a6ea5/.test(src)) bad('old blue #3a6ea5 hover must be removed');

// ── rows: silver-white text + Robinhood shadow highlight on hover ──
const row = grab('.mdrop .row');
if (!row || !/color:#E1E4ED !important/.test(row)) bad('.mdrop .row text must be silver-white #E1E4ED !important');
const hov = grab('.mdrop .row:hover');
if (!hov || !/background:#1C1F26 !important/.test(hov)) bad('.mdrop .row hover must be Robinhood #1C1F26 !important');
if (!hov || !/color:#ffffff !important/.test(hov)) bad('.mdrop .row hover text must be pure white !important');

// ── Legend mirrors the same tone (no dead #000000 / #161a22 mismatch) ──
// 2026-08-17 전수조사: 여기 있던 두 검사는 **화면에 안 나오는 죽은 규칙**을 못 박고 있었다.
// 라이트 테마의 실제 메뉴는 아래쪽 MT5 화이트 블록(#f0f0f0 !important)이 이기고 있었고,
// 그 위의 다크 블록은 죽은 코드였다. 죽은 코드를 지우자 이 핀만 🔴 — 핀이 '보이는 것'이 아니라
// '남아 있는 텍스트'를 지키고 있었다는 뜻이다. 계약을 **실제 렌더 결과**로 바꾼다.
if (!/\.terminal\.light \.mdrop\{background:#f0f0f0 !important/.test(src))
  bad('라이트 메뉴 드롭다운은 MT5 화이트(#f0f0f0 !important)여야 한다');
if (!/\.terminal\.light \.mdrop \.row:hover\{background:#cfe3fb !important/.test(src))
  bad('라이트 메뉴 hover 는 MT5 파랑 하이라이트(#cfe3fb)여야 한다');
if (/\.terminal\.light \.mdrop\{background:#0E1015/.test(src))
  bad('라이트 메뉴에 다크 블록(#0E1015)이 되살아났다 — 색은 화이트 블록 한 곳에서만 정한다');

if (fail) { console.error(`\n🔴 FAIL — ${fail} menu-skin problem(s).`); process.exit(1); }
console.log('🟢 PASS: menu dropdown/submenu = app-core matte black (#0E1015 + #1D212A hairline + radius 0, !important), silver-white rows with a Robinhood #1C1F26 hover; old grey/blue skin gone.');
