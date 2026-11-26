#!/usr/bin/env node
// 자가검진은 서버가 **오류 페이지(5xx)** 를 돌려줄 때 원인을 바로 말해야 한다 (2026-11-25~26 DB 18시간 장애).
//
// 그 장애 동안 서버는 두 가지로 답했다:
//   · Cloudflare `522 Connection timed out` — HTML 오류 페이지 (프로젝트 서버에 연결 불가)
//   · PostgREST `503 PGRST002` — JSON (API 는 살았지만 DB 조회 불가)
// 검진은 둘 다 잘못 읽었다:
//   · PAMM·RUM: `!r.ok` 를 전부 "미배포 — SQL 실행 대기"로 찍었다 → 장애 한복판에 "SQL 안 돌렸다"는 거짓 안내.
//   · 나머지: "Unexpected token '<'" · "t1.map is not a function" · "Cannot read properties of undefined" —
//     빨강은 맞지만 원인을 읽을 수 없다.
// 여기서는 그 두 응답을 그대로 돌려주는 가짜 서버를 세우고 검진을 실제로 돌려 본다 (네트워크 0).
'use strict';
const http = require('http'), path = require('path'), { spawn } = require('child_process');
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) pass++; else fail++; console.log(`  ${c ? '✅' : '❌'} ${n}${!c && x ? '  ' + x : ''}`); };
const SCRIPT = path.join(__dirname, 'daily-selfcheck.js');

const run = (url) => new Promise((resolve) => {
  let out = '';
  const p = spawn(process.execPath, [SCRIPT], { env: Object.assign({}, process.env, { ALPEXA_URL: url, ALPEXA_SELFCHECK_TIMEOUT_MS: '3000' }) });
  p.stdout.on('data', (d) => { out += d; }); p.stderr.on('data', (d) => { out += d; });
  const killer = setTimeout(() => { p.kill('SIGKILL'); resolve({ out, code: null }); }, 40000);
  p.on('exit', (code) => { clearTimeout(killer); resolve({ out, code }); });
});
const serve = (handler) => new Promise((resolve) => {
  const s = http.createServer(handler);
  s.listen(0, '127.0.0.1', () => resolve({ s, url: 'http://127.0.0.1:' + s.address().port }));
});
const CRYPTIC = /Unexpected token|is not valid JSON|is not a function|Cannot read properties/;

(async () => {
  // ① Cloudflare 522 — 모든 경로가 HTML 오류 페이지
  const cf = await serve((q, r) => {
    r.writeHead(522, { 'Content-Type': 'text/html; charset=UTF-8' });
    r.end('<!DOCTYPE html><html><head><title>supabase.co | 522: Connection timed out</title></head><body>522</body></html>');
  });
  const a = await run(cf.url); cf.s.close();
  ok('522: 실패로 끝난다 (exit 1)', a.code === 1, 'exit=' + a.code);
  ok('522: "미배포"라고 하지 않는다 (PAMM·RUM — 장애를 SQL 미실행으로 오독 금지)', !/미배포/.test(a.out), a.out);
  ok('522: 원인을 말한다 — HTTP 522', /HTTP 522/.test(a.out), a.out);
  ok('522: 읽을 수 없는 파싱 오류를 내지 않는다', !CRYPTIC.test(a.out), a.out);

  // ② PostgREST 503 PGRST002 — REST 는 JSON 오류, Edge(감사)는 그 오류를 감싼 JSON 500
  const pg = await serve((q, r) => {
    if (q.url.startsWith('/rest/v1/')) {
      r.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8' });
      return r.end(JSON.stringify({ code: 'PGRST002', details: null, hint: null, message: 'Could not query the database for the schema cache. Retrying.' }));
    }
    r.writeHead(500, { 'Content-Type': 'application/json' });
    r.end(JSON.stringify({ ok: false, error: 'run_sports_audit 503: {"code":"PGRST002"}' }));
  });
  const b = await run(pg.url); pg.s.close();
  ok('PGRST002: 실패로 끝난다 (exit 1)', b.code === 1, 'exit=' + b.code);
  ok('PGRST002: "미배포"라고 하지 않는다', !/미배포/.test(b.out), b.out);
  ok('PGRST002: 원인을 말한다 — HTTP 503 PGRST002', /HTTP 503 PGRST002/.test(b.out), b.out);
  ok('PGRST002: 읽을 수 없는 파싱 오류를 내지 않는다', !CRYPTIC.test(b.out), b.out);
  ok('PGRST002: 감사 Edge 의 JSON 오류 본문은 그대로 보인다 (상세를 지우지 않는다)', /run_sports_audit 503/.test(b.out), b.out);

  // ③ 진짜 미배포(404)는 여전히 "미배포"로 조용히 생략한다 — 기존 동작 유지
  const nf = await serve((q, r) => {
    if (/pamm_health|rum_stats/.test(q.url)) {
      r.writeHead(404, { 'Content-Type': 'application/json' });
      return r.end(JSON.stringify({ code: 'PGRST202', message: 'Could not find the function' }));
    }
    r.writeHead(522, { 'Content-Type': 'text/html' }); r.end('<!DOCTYPE html>522');
  });
  const c = await run(nf.url); nf.s.close();
  ok('404: 함수·뷰가 정말 없을 때는 "미배포"로 안내한다 (2건)', (c.out.match(/미배포/g) || []).length === 2, c.out);

  console.log(`\n${fail ? '🔴' : '🟢'} selfcheck-5xx — ${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
})();
