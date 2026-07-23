#!/usr/bin/env node
// FEATURE (webtrade) — 차트 트레이드-레벨 드래그 (2026-07-23 사장님 "밑으로 땡기면 스탑로쓰 설정 없는데").
// 터미널(terminal.html) commitSltpDrag의 webtrade 이식 계약:
//  ① 서버 저장 SL/TP(meta.sl/tp)가 차트에 점선으로 그려진다 (sl 빨강 / tp 초록, 진입선과 별개)
//  ② 진입선/sl/tp 선 6px 안에서 드래그 시작 — 그리기 도구 활성 시 양보, 데모(WT_DEMO)는 제외
//  ③ 방향 판정 = 터미널과 자구 동일: 롱은 아래=SL·위=TP, 숏 반전 ((side==='BUY')===(px<entry))
//  ④ 커밋 = rpc(fx_modify) — 반대 레벨은 보존, 심볼 digits로 라운딩
//  ⑤ 거절 → 에러음 + Journal 'SL/TP drag rejected' · 성공 → Journal 기록 (무음 금지)
//  ⑥ 커밋/거절 후 positionsStore.loadPos() — 서버 진실로 라인 재도장 (거절이면 원위치)
//  ⑦ capture-phase mousedown + preventDefault/stopPropagation — LWC 팬과 충돌 금지
'use strict';
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'webtrade.html'), 'utf8');
const term = fs.readFileSync(path.join(__dirname, '..', 'terminal.html'), 'utf8');
let fail = 0;
const bad = (m) => { console.error('🔴 ' + m); fail++; };

// ① SL/TP 라인 표시
if (!/title:'sl'/.test(src) || !/title:'tp'/.test(src)) bad('position-lines effect must draw meta.sl/tp as dashed lines (title sl/tp)');
if (!/meta\.sl!=null&&\+meta\.sl>0.*createPriceLine.*'#ff2020'.*lineStyle:DASH/.test(src)) bad('SL line: red dashed from meta.sl');
if (!/meta\.tp!=null&&\+meta\.tp>0.*createPriceLine.*'#00c800'.*lineStyle:DASH/.test(src)) bad('TP line: green dashed from meta.tp');

// ② 드래그 시작 게이트
if (!/const hitTest=\(y\)=>/.test(src) || !/d0<=6/.test(src)) bad('hitTest: 6px proximity to entry/sl/tp lines');
if (!/if\(t0&&t0!=='arrow'\) return;/.test(src)) bad('drag must yield to active drawing tools');
if (!/if\(!el\|\|WT_DEMO\) return;/.test(src)) bad('drag disabled in WT_DEMO (real positions only)');
if (!/\[\['entry',\+p\.open_price\],\['sl',meta\.sl!=null\?\+meta\.sl:null\],\['tp',meta\.tp!=null\?\+meta\.tp:null\]\]/.test(src)) bad('hitTest must cover entry + existing sl/tp lines');

// ③ 방향 판정 — 터미널과 자구 동일 의미
if (!/d\.kind!=='entry' \? d\.kind : \(\(side==='BUY'\)===\(px<entry\)\?'sl':'tp'\)/.test(src)) bad("direction rule must mirror terminal (BUY: below entry=SL, above=TP; SELL inverted; dragging an sl/tp line keeps its kind)");
if (!/const isSL=d\.side==='buy' \? d\.price<d\.entry : d\.price>d\.entry/.test(term)) bad('terminal reference rule missing/changed — keep both sides in lockstep');

// ④ 커밋
if (!/rpc\('fx_modify',\{ p_local_id:d\.p\.local_id, p_sl:sl, p_tp:tp \}\)/.test(src)) bad('commit must call fx_modify with both levels');
if (!/let sl=\(meta\.sl!=null&&\+meta\.sl>0\)\?\+meta\.sl:null, tp=\(meta\.tp!=null&&\+meta\.tp>0\)\?\+meta\.tp:null;/.test(src)) bad('the untouched level must be preserved from meta');
if (!/toFixed\(dgt\)/.test(src) || !/dgt=digits\(symbol\)/.test(src)) bad('dragged level must round to the symbol digits');

// ⑤ 무음 금지
if (!/SL\/TP drag rejected/.test(src)) bad("reject → journal 'SL/TP drag rejected' + error sound");
if (!/journalStore\.log\('SL\/TP drag — '/.test(src)) bad('success → journal records the new levels');

// ⑥ 서버 진실 재적재
if (!/positionsStore\.loadPos\(\);\s*\/\/ 서버 진실 재적재/.test(src)) bad('after commit/reject the lines must redraw from the server (loadPos)');

// ⑦ LWC 팬 충돌 금지
if (!/el\.addEventListener\('mousedown',onDown,true\)/.test(src)) bad('mousedown must be capture-phase (beat LWC pan)');
if (!/e\.preventDefault\(\); e\.stopPropagation\(\);\s*\/\/ LWC 팬 차단/.test(src)) bad('hit → preventDefault+stopPropagation so the chart does not pan');

if (fail) { console.error(`\n🔴 FAIL — ${fail} sltp-drag problem(s).`); process.exit(1); }
console.log('🟢 PASS: webtrade chart trade-level drag — SL/TP lines drawn from server meta, drag→fx_modify (terminal lockstep).');
