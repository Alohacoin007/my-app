#!/usr/bin/env node
// REGRESSION — 성능 기록(rum)이 CORS 로 막히던 문제 (2026-08-18 사장님 콘솔).
//
// 실측 에러:
//   Access to resource at '.../rest/v1/rum?apikey=...' from origin 'https://alpexa-fx.com'
//   has been blocked by CORS policy: ... The value of the 'Access-Control-Allow-Origin' header
//   must not be the wildcard '*' when the request's credentials mode is 'include'.
//
// 원인: navigator.sendBeacon 은 크로스 오리진에서 **항상 credentials 를 포함**해 보낸다.
// Supabase REST 는 ACAO:'*' 를 돌려주므로 규격상 둘이 공존할 수 없다 → 프리플라이트 거절.
// 더 나쁜 건, sendBeacon 이 true 를 돌려주면 코드가 fetch 폴백을 건너뛰어 **기록이 유실**된다.
// (일일 자가검진의 "체감속도 p95" 가 페이지마다 들쭉날쭉했던 이유.)
//
// 계약: rum 전송은 sendBeacon 을 쓰지 않고, credentials:'omit' + keepalive:true 인 fetch 로 한다.
'use strict';
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'alpexa-sync.js'), 'utf8');
let fail = 0;
const bad = (m) => { console.error('🔴 ' + m); fail++; };

const blk = (src.match(/function send\(appMs\)\{?[\s\S]*?\n    \}/) || [''])[0]
         || (src.match(/RUM_URL[\s\S]{0,1400}/) || [''])[0];
// 주석에 적힌 단어가 아니라 **실제 호출**만 본다 (`navigator.sendBeacon(`).
// 이유를 설명한 주석까지 잡으면 핀이 자기 문서를 위반으로 신고한다.
if (/navigator\.sendBeacon\s*\(/.test(blk))
  bad('rum 전송에 sendBeacon 호출이 다시 들어왔다 — 크로스 오리진에서 credentials 를 강제 포함해 CORS 로 거절된다');
if (!/credentials:\s*'omit'/.test(blk))
  bad("rum fetch 에 credentials:'omit' 이 없다 — 자격증명이 붙으면 ACAO:'*' 와 충돌해 막힌다");
if (!/keepalive:\s*true/.test(blk))
  bad('rum fetch 에 keepalive:true 가 없다 — 페이지가 닫히면 기록이 사라진다');

if (fail) { console.error(`\n🔴 FAIL — ${fail}건.`); process.exit(1); }
console.log("🟢 PASS: rum 전송 = credentials:'omit' + keepalive fetch (sendBeacon 금지) — CORS 거절·기록 유실 없음.");
