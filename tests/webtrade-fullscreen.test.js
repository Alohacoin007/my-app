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
if(fail){console.error(`\n🔴 FAIL — ${fail} fullscreen problem(s).`);process.exit(1);}
console.log('🟢 PASS: webtrade fullscreen toggle (prefixed API + CSS fallback + 3 entry points).');
