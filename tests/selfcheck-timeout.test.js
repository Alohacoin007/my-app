#!/usr/bin/env node
// 자가검진은 DB 가 응답하지 않을 때 **매달리지 않고 🔴 로 끝나야** 한다 (2026-11-21 DB 장애).
//
// 그날 DB 가 4시간 무응답이었다. tests/daily-selfcheck.js 의 요청에는 시간 상한이 없어서
// 검진이 5분 넘게 끝나지 않았다 — 감시 도구가 "빨강"도 "초록"도 내지 못했다.
// 같은 스크립트를 GitHub 의 무음 게이트(hourly-selfcheck)가 돌리므로, 매달리면 경보 메일도 안 온다.
//
// 여기서는 **연결은 받지만 답을 안 하는** 가짜 서버를 세우고 검진을 실제로 돌려 본다 (네트워크 0).
'use strict';
const http = require('http'), path = require('path'), { spawn } = require('child_process');
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) pass++; else fail++; console.log(`  ${c ? '✅' : '❌'} ${n}${!c && x ? '  ' + x : ''}`); };
const SCRIPT = path.join(__dirname, 'daily-selfcheck.js');

const run = (url, extraEnv, limitMs) => new Promise((resolve) => {
  const t0 = Date.now(); let out = '';
  const p = spawn(process.execPath, [SCRIPT], { env: Object.assign({}, process.env, { ALPEXA_URL: url }, extraEnv) });
  p.stdout.on('data', (d) => { out += d; }); p.stderr.on('data', (d) => { out += d; });
  const killer = setTimeout(() => { p.kill('SIGKILL'); resolve({ hung: true, ms: Date.now() - t0, out, code: null }); }, limitMs);
  p.on('exit', (code) => { clearTimeout(killer); resolve({ hung: false, ms: Date.now() - t0, out, code }); });
});

(async () => {
  // 연결은 받고 응답은 영원히 안 하는 서버 = 그날의 DB
  const sockets = new Set();
  const hang = http.createServer(() => { /* 답하지 않는다 */ });
  hang.on('connection', (s) => { sockets.add(s); s.on('close', () => sockets.delete(s)); });
  await new Promise((r) => hang.listen(0, '127.0.0.1', r));
  const url = 'http://127.0.0.1:' + hang.address().port;

  const a = await run(url, { ALPEXA_SELFCHECK_TIMEOUT_MS: '700' }, 40000);
  ok('무응답 서버: 검진이 매달리지 않고 스스로 끝난다', a.hung === false, `40초 안에 끝나지 않음 · 출력: ${a.out.slice(0, 200)}`);
  ok('무응답 서버: 실패로 끝난다 (exit 1 — 무음 게이트가 빨강이 된다)', a.code === 1, 'exit=' + a.code);
  ok('무응답 서버: 🔴 줄을 낸다 · 🟢 "전부 정상"은 내지 않는다', /🔴/.test(a.out) && !/전부 정상/.test(a.out), a.out.slice(0, 300));
  ok('무응답 서버: 원인이 "응답 없음(시간 초과)"임을 말한다', /시간 초과|timeout/i.test(a.out), a.out.slice(0, 300));

  // 전체 상한(워치독): 요청별 상한이 길어도 검진 전체가 정해진 시간 안에 끝난다
  const b = await run(url, { ALPEXA_SELFCHECK_TIMEOUT_MS: '600000', ALPEXA_SELFCHECK_TOTAL_MS: '2500' }, 30000);
  ok('전체 상한: 요청이 아무리 오래 걸려도 정해진 시간에 🔴 로 끝난다', b.hung === false && b.code === 1 && /전체 상한/.test(b.out), JSON.stringify({ hung: b.hung, code: b.code, out: b.out.slice(0, 200) }));

  // 기본값이 실제로 걸려 있다 (환경변수 없이도 매달리지 않는다는 뜻) — 소스 핀
  const src = require('fs').readFileSync(SCRIPT, 'utf8');
  const perReq = +((src.match(/ALPEXA_SELFCHECK_TIMEOUT_MS\s*\|\|\s*(\d+)/) || [])[1] || 0);
  const total = +((src.match(/ALPEXA_SELFCHECK_TOTAL_MS\s*\|\|\s*(\d+)/) || [])[1] || 0);
  ok('기본 상한: 요청당 5~30초 · 전체 60~240초 (GitHub 작업·루틴이 기다릴 수 있는 범위)', perReq >= 5000 && perReq <= 30000 && total >= 60000 && total <= 240000, JSON.stringify({ perReq, total }));
  ok('모든 요청이 상한 달린 fetch 를 쓴다 (맨 fetch 직접 호출 없음)', !/globalThis\.fetch\(/.test(src.replace(/const _fetch = globalThis\.fetch;/, '')) && /const fetch = \(u, o\) =>/.test(src));

  sockets.forEach((s) => s.destroy()); hang.close();
  console.log(`\n${fail ? '🔴' : '🟢'} selfcheck-timeout — ${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
})();
