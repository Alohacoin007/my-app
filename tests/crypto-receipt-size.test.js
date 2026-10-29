#!/usr/bin/env node
// Alpexa — 크립토 완료 화면(HeroConfirm) 글자 크기 (2026-10-29 사장님 "기존 디자인에서 크기 바꿔줘" → 시안 승인 "진행해")
// ============================================================================
// 디자인(파란 히어로·2칸 배치·색)은 그대로, 크기만: 값 14.5→22 · 항목 이름 12→15 · 코인 수량 13→17 · 설명 11.5→14 · Done 14→17
// · 행 간격 22→26. 제목 42px 유지(48 이면 "$1000.00 of BTC" 가 두 줄 — 시안 실측).
// 매수·매도·송금·스테이킹 등 완료 화면 8곳이 같은 컴포넌트를 쓴다 → 한 곳 핀으로 전부 고정.
// 핀: 소스와 **배포되는 컴파일본** 둘 다 (src 만 고치고 재컴파일 잊으면 🔴).
'use strict';
const fs = require('fs'), path = require('path');
const REPO = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) pass++; else fail++; console.log(`  ${c ? '✅' : '❌'} ${n}${!c && x ? '  ' + x : ''}`); };
const body = (s) => { const i = s.indexOf('function HeroConfirm('); const j = s.indexOf('function Unstake(', i); return i >= 0 && j > i ? s.slice(i, j) : ''; };
const WANT = '42,17,15,22,14,17';
for (const [name, file] of [['소스', 'src/crypto-live-app.jsx'], ['컴파일본', 'vendor/crypto-live-compiled.js']]) {
  const b = body(fs.readFileSync(path.join(REPO, file), 'utf8'));
  ok(`${name}: HeroConfirm 찾음 (헛초록 방지)`, b.length > 1500, b.length);
  const sizes = (b.match(/fontSize: ([0-9.]+)/g) || []).map((x) => x.split(': ')[1]).join(',');
  ok(`${name}: 글자 크기 순서 = 제목 42 · 수량 17 · 항목 15 · 값 22 · 설명 14 · Done 17`, sizes === WANT, sizes);
  ok(`${name}: 디자인 유지 — 파란 히어로(heroColor)·2칸 그리드·행 간격 26px`, /background: hero/.test(b) && /gridTemplateColumns: '1fr 1fr'/.test(b) && /gap: '26px 24px'/.test(b));
}
console.log(`\n${fail ? '🔴' : '🟢'} crypto-receipt-size — ${pass} pass, ${fail} fail`); process.exit(fail ? 1 : 0);
