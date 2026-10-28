#!/usr/bin/env node
// Alpexa — 크립토 홈 보유 목록 미니 차트 제거 (2026-10-28 사장님 "큰 차트는 유지하고 미니 차트만 제거 해")
// ============================================================================
// 보유 행(AssetRow — 크립토·증권·스테이킹 공통)의 미니 차트는 7일선(CoinGecko sparkline_in_7d)인데 옆 % 는 24h 라
// "선은 내려가는데 +1.61%"·"상승색 하락선" 이 같은 줄에 나왔다 → 행에서 뺀다. 홈 큰 차트(1D·1W 실시세)는 그대로.
// 핀: ① 소스 AssetRow 에 <MiniSpark 0 · 3칸 그리드(아이콘·이름·금액) ② **배포되는 컴파일본**도 같음 (src 만 고치고 재컴파일 잊으면 🔴)
//     ③ 홈 큰 차트 컴포넌트·기간 버튼은 남아 있음 (실수로 같이 지우면 🔴).
'use strict';
const fs = require('fs'), path = require('path');
const REPO = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) pass++; else fail++; console.log(`  ${c ? '✅' : '❌'} ${n}${!c && x ? '  ' + x : ''}`); };
const src = fs.readFileSync(path.join(REPO, 'src/crypto-live-app.jsx'), 'utf8');
const bin = fs.readFileSync(path.join(REPO, 'vendor/crypto-live-compiled.js'), 'utf8');
const body = (s) => { const i = s.indexOf('function AssetRow('); const j = s.indexOf('function WatchRow(', i); return i >= 0 && j > i ? s.slice(i, j) : ''; };
const sb = body(src), bb = body(bin);
ok('① 소스 AssetRow 찾음 (헛초록 방지)', sb.length > 500, sb.length);
ok('① 소스 AssetRow: 미니 차트(<MiniSpark) 0', sb && !/MiniSpark/.test(sb));
ok('① 소스 AssetRow: 3칸 그리드 ASSET_GRID (아이콘·이름·금액)', /gridTemplateColumns:\s*ASSET_GRID/.test(sb) && /const ASSET_GRID = '26px minmax\(0, 1fr\) auto';/.test(src));
ok('② 컴파일본 AssetRow 찾음', bb.length > 500, bb.length);
ok('② 컴파일본 AssetRow: MiniSpark 0 (재컴파일 반영)', bb && !/MiniSpark/.test(bb));
ok('③ 홈 큰 차트·기간 버튼 유지 (priceSeries · RangeTabs)', /const priceSeries = React\.useMemo/.test(src) && /function RangeTabs\(/.test(src) && /<RangeTabs/.test(src));
console.log(`\n${fail ? '🔴' : '🟢'} crypto-holdings-nospark — ${pass} pass, ${fail} fail`); process.exit(fail ? 1 : 0);
