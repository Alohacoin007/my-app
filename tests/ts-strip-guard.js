// Alpexa — Edge(TS) 실제 코드를 테스트에서 돌리기 위한 Node 버전 가드 (2026-09-27)
// ============================================================================
// settle-dual-source · feed-odds-primary 는 module.stripTypeScriptTypes(Node ≥22.6)로 Edge TS 를 JS 로 벗겨
// **실제 함수**를 실행한다. GitHub 러너 중 daily-sports-check.yml 이 Node 20 이라 09-16 이후 매일
// "TypeError: mod.stripTypeScriptTypes is not a function" 로 verify 🔴 → 사장님께 매일 오경보 메일.
// 규칙: 스트립이 없으면 행위 절만 ⏭ (소스 핀은 그대로). 대신 **배포 게이트**(deploy.yml · deploy-edge.yml)가
//       Node ≥22 인지 핀으로 강제 — 행위 검증이 실제로 돌아야 하는 곳에서는 절대 생략되지 않는다.
// ============================================================================
'use strict';
const fs = require('fs'), path = require('path'), mod = require('module');

const canStrip = typeof mod.stripTypeScriptTypes === 'function';

// 배포 게이트 워크플로가 Node ≥22 로 고정돼 있나 (각 파일의 node-version 이 전부 22 이상)
function deployGatesOnNode22() {
  const bad = [];
  for (const f of ['deploy.yml', 'deploy-edge.yml']) {
    const p = path.join(__dirname, '..', '.github', 'workflows', f);
    const y = fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
    const vers = [...y.matchAll(/node-version:\s*["']?(\d+)/g)].map((m) => +m[1]);
    if (!vers.length || vers.some((v) => v < 22)) bad.push(f + '=' + (vers.join(',') || '없음'));
  }
  return { ok: !bad.length, bad };
}

module.exports = { canStrip, deployGatesOnNode22 };
