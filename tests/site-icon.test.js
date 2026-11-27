#!/usr/bin/env node
// 사이트 · 앱 아이콘 계약 (2026-11-27 사장님 "아이콘도 블랙앤 화이트 버젼으로" → 시안 1번: 검정 바탕 · 흰 A).
//   · 아이콘 파일 6개가 있고, 참조는 전부 같은 캐시 번호(?v=)를 쓴다 — 번호가 섞이면 기기마다 다른 아이콘이 보인다
//   · 새 디자인 사이트 페이지는 아이콘을 명시해서 단다 (기본 /favicon.ico 는 브라우저가 오래 붙들고 있어 바뀐 것이 안 보인다)
//   · 백오피스 아이콘(icon-bo-*)은 별개 — 건드리지 않는다
'use strict';
const fs = require('fs'), path = require('path');
const REPO = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) pass++; else fail++; console.log(`  ${c ? '✅' : '❌'} ${n}${!c && x ? '  ' + x : ''}`); };
const FILES = ['favicon.ico', 'favicon-32.png', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png'];
ok('아이콘 파일 6개가 있다', FILES.every((f) => fs.existsSync(path.join(REPO, f)) && fs.statSync(path.join(REPO, f)).size > 300));
const png = (f) => { const b = fs.readFileSync(path.join(REPO, f)); return { sig: b.slice(1, 4).toString() === 'PNG', w: b.readUInt32BE(16), h: b.readUInt32BE(20) }; };
ok('크기가 이름과 같다 (32 · 180 · 192 · 512 · 512)', [['favicon-32.png', 32], ['apple-touch-icon.png', 180], ['icon-192.png', 192], ['icon-512.png', 512], ['icon-maskable-512.png', 512]].every(([f, s]) => { const p = png(f); return p.sig && p.w === s && p.h === s; }));
const WANT = 6, refs = [];
for (const f of fs.readdirSync(REPO).filter((x) => /\.(html|json)$/.test(x))) { const h = fs.readFileSync(path.join(REPO, f), 'utf8');
  for (const m of h.matchAll(/(favicon-32\.png|favicon\.ico|apple-touch-icon\.png|icon-192\.png|icon-512\.png|icon-maskable-512\.png)\?v=(\d+)/g)) refs.push({ f, v: +m[2] }); }
ok(`버전 붙은 참조는 전부 ?v=${WANT} (섞이지 않는다)`, refs.length >= 20 && refs.every((r) => r.v === WANT), JSON.stringify(refs.filter((r) => r.v !== WANT).slice(0, 5)) + ' n=' + refs.length);
for (const f of ['fx.html', 'about.html', 'ib.html', 'support.html', 'markets.html', 'fund.html']) { const h = fs.readFileSync(path.join(REPO, f), 'utf8');
  ok(`${f}: 아이콘을 명시해서 단다 (32px · 애플 터치)`, new RegExp(`<link rel="icon" type="image/png" sizes="32x32" href="favicon-32\\.png\\?v=${WANT}">`).test(h) && new RegExp(`<link rel="apple-touch-icon" href="apple-touch-icon\\.png\\?v=${WANT}">`).test(h)); }
console.log(`\n${fail ? '🔴' : '🟢'} site-icon — ${pass} pass, ${fail} fail`); process.exit(fail ? 1 : 0);
