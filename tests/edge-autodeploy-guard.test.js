#!/usr/bin/env node
// Alpexa — Edge 자동 배포 안전 계약 핀 (2026-08-20)
// ============================================================================
// 배경: 2026-08-19 블랙아웃 때 수정은 몇 시간 만에 준비됐는데 Edge 배포를 사람만 할 수
// 있어서 고객 화면이 하루 더 어두웠다 → `.github/workflows/deploy-edge.yml` 로 자동화했다.
// 자동화는 편한 만큼 위험하다. **CLAUDE.md #1(돈은 승인 후에만)을 자동화가 우회하면
// 안 된다.** 이 핀이 그 경계를 코드로 못박는다.
//
// 지키는 계약 5가지:
//   P1 돈 함수(sports-settle · stake-accrue)는 허용목록에 **절대** 없다.
//   P2 허용목록 방식이다(차단목록 금지) — 새 함수의 기본값은 "배포 안 함"이어야 한다.
//   P3 배포 전에 `node tests/verify.js` 가 선행된다 — 🔴면 안 나간다.
//   P4 허용목록의 모든 함수가 supabase/config.toml 에 `verify_jwt = false` 로 고정돼 있다.
//      (크론이 Authorization 헤더 없이 부른다 — 검증이 켜지면 401 로 전 피드가 죽는다.)
//   P5 `--all` 같은 전체 배포가 없다 — 손 안 댄 함수가 배포로 흔들리면 안 된다.
//
// 실행: node tests/edge-autodeploy-guard.test.js   (verify 게이트에 자동 포함)
// ============================================================================

const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

let fail = 0;
const bad = (m) => { console.error('🔴 ' + m); fail++; };

const WF = path.join(ROOT, '.github/workflows/deploy-edge.yml');
const CFG = path.join(ROOT, 'supabase/config.toml');
if (!fs.existsSync(WF)) { console.error('🔴 deploy-edge.yml 이 없다 — Edge 자동 배포를 지웠다면 이 핀도 같이 지워라.'); process.exit(1); }
if (!fs.existsSync(CFG)) bad('supabase/config.toml 이 없다 — CLI 배포가 verify_jwt 를 기본 ON 으로 바꿔 크론이 401 로 죽는다');

const wf = fs.readFileSync(WF, 'utf8');
const cfg = fs.existsSync(CFG) ? fs.readFileSync(CFG, 'utf8') : '';

// ── 허용목록 추출 ──
const m = wf.match(/^\s*AUTO:\s*"([^"]*)"/m);
if (!m) bad('워크플로에서 AUTO 허용목록을 못 찾았다 — 이름을 바꿨다면 이 핀도 같이 고쳐라');
const auto = m ? m[1].trim().split(/\s+/).filter(Boolean) : [];

// ── P1 · 돈 함수는 절대 자동 배포되지 않는다 ──
// 이 둘은 원장에 지급을 쓴다. 사람이 눈으로 보고 배포하는 게 마지막 안전장치다.
const MONEY = ['sports-settle', 'stake-accrue'];
for (const f of MONEY) {
  if (auto.includes(f)) bad(`${f} 이 자동 배포 허용목록에 있다 — 돈을 옮기는 함수는 사장님 승인 후 수동 배포만 (CLAUDE.md #1)`);
}

// ── P2 · 허용목록 방식이어야 한다 ──
// 차단목록(EXCLUDE/DENY)으로 뒤집으면 새로 만든 돈 함수가 **기본으로 배포된다.**
if (/\b(EXCLUDE|DENY|BLOCKLIST|BLACKLIST)\b/i.test(wf))
  bad('차단목록 방식이 보인다 — 허용목록이어야 한다(새 함수의 기본값 = 배포 안 함)');
if (!auto.length) bad('허용목록이 비었다 — 파싱이 깨졌거나 형식이 바뀌었다');

// ── P3 · verify 가 배포보다 먼저 ──
const iVerify = wf.indexOf('node tests/verify.js');
const iDeploy = wf.indexOf('supabase functions deploy');
if (iVerify < 0) bad('배포 전 verify 게이트가 없다 — 🔴 코드가 고객에게 나갈 수 있다');
else if (iDeploy >= 0 && iVerify > iDeploy) bad('verify 가 배포 뒤에 있다 — 게이트는 배포보다 앞이어야 의미가 있다');

// ── P4 · 허용목록 전부 verify_jwt = false 로 고정 ──
// 실측 근거: supabase/sql/cron_secure.sql 의 피드 크론은 대부분
//   net.http_get(url := '...?token=<CRON_SECRET>')  ← Authorization 헤더 없음
// CLI 배포 기본값은 verify_jwt ON 이라, 고정을 빠뜨리면 배포 즉시 전 피드가 401.
for (const f of auto) {
  const re = new RegExp(`\\[functions\\.${f.replace(/[-.]/g, '\\$&')}\\][^\\[]*verify_jwt\\s*=\\s*false`);
  if (!re.test(cfg)) bad(`config.toml 에 [functions.${f}] verify_jwt = false 가 없다 — 배포되는 순간 크론이 401 (헤더 없이 호출됨)`);
}

// ── P5 · 전체 배포 금지 ──
if (/functions deploy\s+(--all|\$\{\{\s*env\.AUTO)/.test(wf))
  bad('전체/일괄 배포가 보인다 — 바뀐 함수만 배포해야 한다(손 안 댄 함수가 흔들리면 안 됨)');

if (fail) { console.error(`\n🔴 FAIL — ${fail}건.`); process.exit(1); }
console.log(`🟢 PASS: Edge 자동 배포 = 허용목록 ${auto.length}종(${auto.join(', ')}) · 돈 함수 제외 · verify 선행 · verify_jwt 고정 · 일괄배포 없음.`);
