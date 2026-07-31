#!/usr/bin/env node
// ALPEXA — JSX 사전 컴파일 (P1 성능: 인브라우저 Babel 제거, 2026-07-31)
//
// 왜: 종전엔 고객 폰마다 3MB Babel을 내려받아 JSX를 실시간 컴파일했다 (크립토 1.2s+,
// 트레이딩 0.6s+ — 폰에선 3~5배). 이제 배포 전에 여기서 한 번만 컴파일한다.
// 전례: manager-app → vendor/manager-compiled.js.
//
// 사용: 앱 JSX(src/*.jsx) 수정 후  →  node tools/precompile-jsx.js  →  커밋.
// 잊어버림 방지: tests/precompiled-fresh.test.js 가 verify 게이트에서 신선도를 강제
// (src를 다시 컴파일해 vendor 산출물과 비교 — 다르면 🔴).
//
// HTML의 ?v= 캐시버스터도 내용 해시로 자동 갱신한다 (수동 관리 금지).
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const ROOT = path.join(__dirname, '..');
const Babel = require(path.join(ROOT, 'tests', 'vendor', 'babel.min.js'));

const APPS = [
  { src: 'src/trading-app.jsx', out: 'vendor/trading-compiled.js', html: 'trading.html', label: 'ALPEXA Trading (모바일 FX)' },
  { src: 'src/crypto-live-app.jsx', out: 'vendor/crypto-live-compiled.js', html: 'crypto-live.html', label: 'ALPEXA Crypto' },
];

// 라이브 앱과 동일 의미론: babel-standalone의 script 태그 처리 = sourceType script + react 프리셋
const compile = (code) => Babel.transform(code, { presets: ['react'], sourceType: 'script', compact: false }).code;

module.exports = { APPS, compile };
if (require.main !== module) return;

let fail = 0;
for (const app of APPS) {
  const srcPath = path.join(ROOT, app.src);
  if (!fs.existsSync(srcPath)) { console.log(`⏭️  ${app.src} 없음 — 건너뜀 (아직 미이관)`); continue; }
  try {
    const t0 = Date.now();
    const code = compile(fs.readFileSync(srcPath, 'utf8'));
    const body = `// ⚠️ 생성 파일 — 직접 수정 금지. 원본: ${app.src} → node tools/precompile-jsx.js (${app.label})\n` + code + '\n';
    const hash = crypto.createHash('sha1').update(body).digest('hex').slice(0, 8);
    fs.writeFileSync(path.join(ROOT, app.out), body);
    // HTML 캐시버스터를 내용 해시로 갱신
    const htmlPath = path.join(ROOT, app.html);
    const html = fs.readFileSync(htmlPath, 'utf8');
    const re = new RegExp(app.out.replace(/[/.]/g, '\\$&') + '\\?v=[a-f0-9]+');
    if (!re.test(html)) { console.log(`🔴 ${app.html} 에 ${app.out}?v= 참조가 없음`); fail++; }
    else fs.writeFileSync(htmlPath, html.replace(re, `${app.out}?v=${hash}`));
    console.log(`🟢 ${app.src} → ${app.out} (${Math.round(body.length / 1024)}KB, ${Date.now() - t0}ms, v=${hash})`);
  } catch (e) { console.log(`🔴 ${app.src} 컴파일 실패: ${e.message.slice(0, 200)}`); fail++; }
}
process.exit(fail ? 1 : 0);
