#!/usr/bin/env node
// PIN — webtrade 풀스크린 토글 (2026-08-06 사장님 "저거 안돼"). 표준만 쓰면 Safari 등서 무반응.
//  ① 헬퍼 존재 + webkit 접두사 대응 ② Fullscreen API 막힘 CSS 폴백 ③ 세 진입점(버튼·F11·메뉴) 배선
'use strict';
const fs=require('fs'), path=require('path');
const s=fs.readFileSync(path.join(__dirname,'..','webtrade.html'),'utf8');
let fail=0; const bad=m=>{console.error('🔴 '+m);fail++;};
if(!/function toggleFullscreen\(\)/.test(s)) bad('toggleFullscreen helper missing');
if(!/webkitRequestFullscreen|webkitRequestFullScreen/.test(s)) bad('must try webkit-prefixed requestFullscreen (Safari)');
if(!/webkitExitFullscreen/.test(s)) bad('must try webkit-prefixed exit');
if(!/function cssMaximize\(/.test(s)) bad('CSS maximize fallback missing (API-blocked envs)');
if(!/onClick=\{\(\)=>toggleFullscreen\(\)\}>⛶/.test(s)) bad('⛶ button must call toggleFullscreen');
if(!/e\.key==='F11'\)\{ e\.preventDefault\(\); toggleFullscreen\(\);/.test(s)) bad('F11 must call toggleFullscreen');
if(!/cmd==='view\.fullscreen'\)\{ toggleFullscreen\(\);/.test(s)) bad('menu view.fullscreen must call toggleFullscreen');
if(/document\.documentElement\.requestFullscreen\(\)\.catch\(\(\)=>\{\}\)/.test(s)) bad('old silent-swallow call must be gone');

// ── 대쉬보드 FX 오버레이 = 브로커 표준 (2026-08-07 사장님): ⛶ 작동 + ESC=풀스크린 해제만(앱 안 닫힘) ──
const d=fs.readFileSync(path.join(__dirname,'..','sports-dashboard.html'),'utf8');
// ④ iframe allowfullscreen — 없으면 자식 ⛶의 requestFullscreen이 막힌다
if(!/id="fxFrame"[^>]*\ballowfullscreen\b/.test(d)) bad('fx iframe must have allowfullscreen (embedded ⛶ blocked otherwise)');
// ⑤ 풀스크린 해제=앱 닫기 결합 제거 — 이게 "ESC로 스포츠 대쉬보드 복귀" 버그의 근본이었다
if(/fullscreenchange[\s\S]{0,120}fullscreenElement[\s\S]{0,80}closeFx\(\)/.test(d)) bad('fullscreenchange must NOT auto-close the FX overlay (ESC = exit fullscreen only, stay in terminal)');
// ⑥ 열 때 자동 네이티브 풀스크린 금지 — ⛶ 버튼으로만 사용자가 건다
if(/fxOv\.requestFullscreen\(\)/.test(d)) bad('openFx must NOT force native fullscreen on open (broker-standard: ⛶ only)');
// ⑦ ESC가 FX 오버레이를 닫지 않음 — fxEsc(닫기) 경로 제거
if(/fxEsc/.test(d)) bad('ESC must not close the FX overlay (fxEsc close-path must be gone)');

if(fail){console.error(`\n🔴 FAIL — ${fail} fullscreen problem(s).`);process.exit(1);}
console.log('🟢 PASS: webtrade fullscreen toggle + dashboard FX overlay broker-standard (⛶ works, ESC = exit fullscreen only).');
