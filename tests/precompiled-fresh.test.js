#!/usr/bin/env node
// PIN — JSX 사전 컴파일 신선도 게이트 (P1, 2026-07-31)
// 계약: "src/*.jsx 수정 → node tools/precompile-jsx.js → 커밋" 을 잊을 수 없게 만든다.
//  ① 신선도: src를 지금 다시 컴파일한 결과 == vendor 산출물 (다르면 컴파일 잊음 = 🔴)
//  ② HTML 계약(이관된 앱): text/babel 블록 0 · Babel/React CDN 태그 0 (셀프호스팅 vendor만)
//  ③ 캐시버스터: HTML의 ?v=해시 == vendor 파일 내용 해시 (스테일 캐시 방지)
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const ROOT = path.join(__dirname, '..');
const { APPS, compile } = require(path.join(ROOT, 'tools', 'precompile-jsx.js'));
let fail = 0;
const bad = (m) => { console.error('🔴 ' + m); fail++; };

for (const app of APPS) {
  const srcPath = path.join(ROOT, app.src);
  if (!fs.existsSync(srcPath)) continue;   // 아직 미이관 앱은 건너뜀 (이관 시 자동 편입)
  const outPath = path.join(ROOT, app.out);
  if (!fs.existsSync(outPath)) { bad(`${app.out} 없음 — node tools/precompile-jsx.js 실행`); continue; }

  // ① 신선도
  const expected = `// ⚠️ 생성 파일 — 직접 수정 금지. 원본: ${app.src} → node tools/precompile-jsx.js (${app.label})\n` + compile(fs.readFileSync(srcPath, 'utf8')) + '\n';
  const actual = fs.readFileSync(outPath, 'utf8');
  if (expected !== actual) bad(`${app.out} 이 ${app.src} 보다 낡음 — node tools/precompile-jsx.js 실행 후 커밋`);

  // ② HTML 계약
  const html = fs.readFileSync(path.join(ROOT, app.html), 'utf8');
  if (/type=["']text\/babel["']/.test(html)) bad(`${app.html}: text/babel 블록 잔존 — 인브라우저 컴파일 금지 (P1)`);
  if (/@babel\/standalone|babel\.min\.js/.test(html)) bad(`${app.html}: Babel CDN 태그 잔존`);
  if (/(unpkg\.com|jsdelivr\.net)[^"']*react/.test(html)) bad(`${app.html}: React CDN 잔존 — vendor 셀프호스팅으로`);
  if (!html.includes(app.out + '?v=')) bad(`${app.html}: ${app.out} 참조 없음`);

  // ③ 캐시버스터 = 내용 해시
  const hash = crypto.createHash('sha1').update(actual).digest('hex').slice(0, 8);
  const m = html.match(new RegExp(app.out.replace(/[/.]/g, '\\$&') + '\\?v=([a-f0-9]+)'));
  if (m && m[1] !== hash) bad(`${app.html}: 캐시버스터 v=${m[1]} ≠ 내용해시 ${hash} — node tools/precompile-jsx.js 재실행`);
}

if (fail) { console.error(`\n🔴 FAIL — ${fail} precompile problem(s).`); process.exit(1); }
console.log('🟢 PASS: precompiled JSX fresh (src == vendor, no in-browser Babel, hash-busted).');
