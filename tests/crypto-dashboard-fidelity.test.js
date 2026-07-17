// Alpexa — 크립토 레전드 대시보드 fidelity 핀/밴 (M5 게이트)
//
// 목적: 대시보드의 돈 계약이 나중에 조용히 깨지는 걸 정적으로 차단한다.
//  · PIN  = 반드시 존재해야 하는 계약 (서버 RPC 단일 경로 · 멱등 ref 접두 · 2FA 관문 ·
//           APY 락스텝 · 정직 표기). 지우면 이 테스트가 🔴.
//  · BAN  = 존재하면 안 되는 패턴 (클라가 돈 테이블에 직접 쓰기 · service_role ·
//           돈을 localStorage에 저장). 생기면 🔴.
// 파일 위치: dev/ (개발) 또는 루트(활성화 후) — 있는 쪽을 검사한다.

const fs = require('fs');
const path = require('path');

let pass = 0, failN = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { failN++; console.log('  ❌ ' + name + (extra ? (' — ' + extra) : '')); }
}

const CAND = ['dev/crypto-dashboard.html', 'crypto-dashboard.html'];
const rel = CAND.find(p => fs.existsSync(path.join(__dirname, '..', p)));
if (!rel) { console.error('❌ crypto-dashboard.html not found (dev/ or root)'); process.exit(1); }
const html = fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
console.log('crypto-dashboard fidelity — file: ' + rel);

/* ── PIN: 모든 돈 이동 = 기존 서버 RPC + 앱과 동일한 멱등 ref 접두 ── */
const PINS = [
  ['Buy/Sell = crypto_trade + cb- ref',      /p_ref:'cb-'\+Date\.now\(\)[\s\S]{0,500}?rpc\('crypto_trade'/],
  ['Sell Max = p_all(전량 청산) 지원',         /p_all\s*=\s*true|p_all:\s*true/],
  ['마크업 0~50 클램프(앱 락스텝)',            /Math\.max\(0,Math\.min\(50,\(window\.__alpexaCryptoMarks/],
  ['Swap = swap_crypto + sw- ref',           /rpc\('swap_crypto',\{\s*p_ref:'sw-'\+Date\.now\(\)/],
  ['Stake = stake_crypto + stk- ref',        /rpc\('stake_crypto',\{\s*p_ref:'stk-'\+Date\.now\(\)/],
  ['Unstake = unstake_crypto + unstk- ref',  /rpc\('unstake_crypto',\{\s*p_ref:'unstk-'\+Date\.now\(\)/],
  ['Send = cryptoSendInternal 공용 래퍼(발신자=auth.uid 서버 유도)', /AlpexaSync\.cryptoSendInternal\(/],
  ['이메일 수취인 = acct_for_email 해석',      /rpc\('acct_for_email'/],
  ['Transfer = app_transfer + xfer- ref',    /rpc\('app_transfer',\{\s*p_ref:'xfer-'\+Date\.now\(\)/],
  ['이체/출금 캡 = withdrawable_for(보너스 제외)', /rpc\('withdrawable_for'/],
  ['입출금 = pushRequest(백오피스 승인) + cr- ref', /pushRequest\(\{\s*id:'cr-'\+Date\.now\(\)/],
  ['카드입금 = transak-widget Edge(시크릿 서버 전용)', /functions\.invoke\('transak-widget'/],
  ['출금 ≥$1k 관문 = withdraw-otp Edge 발송',  /functions\.invoke\('withdraw-otp'/],
  ['출금 OTP 검증 = verify_withdraw_otp RPC',  /rpc\('verify_withdraw_otp'/],
  ['OTP 형식 가드(6자리)',                    /\^\\d\{6\}\$/],
  ['리워드 = redeem_referral RPC(서버 1회 강제)', /rpc\('redeem_referral',\{p_code/],
  ['세션 가드 = alpexa.me 태그 AND getSession 실존', /auth\.getSession\(\)/],
  ['비로그인 잔고 표시 = ··· (가짜 $ 금지)',   /'···'/],
  ['Open orders 정직 표기 = Pending (manual)', /Pending \(manual\)/],
  ['미구현 기능 정직 표기 = Soon 칩',          /title="Soon"/],
  ['ALPXS 하드락 안내(만기 전 언스테이크 불가)', /cannot be unstaked before maturity/],
  ['조기 언스테이크 몰수 경고(원금만 반환)',    /principal only/],
  ['출금 승인 전 차감 없음 문구',              /nothing deducted until approval/i],
];
PINS.forEach(([name, re]) => ok('PIN ' + name, re.test(html)));

/* ── PIN: APY 락스텝 — 대시보드 PF_APY == stake-accrue Edge RATES ── */
(function apyLockstep() {
  const edgePath = path.join(__dirname, '..', 'supabase/functions/stake-accrue/index.ts');
  if (!fs.existsSync(edgePath)) { ok('PIN APY 락스텝(stake-accrue 존재)', false, 'edge 파일 없음'); return; }
  const edge = fs.readFileSync(edgePath, 'utf8');
  const grab = (src, sym) => {
    const m = src.match(new RegExp(sym + "\\s*:\\s*\\{\\s*flexible\\s*:\\s*(\\d+),\\s*['\"]?90d['\"]?\\s*:\\s*(\\d+),\\s*['\"]?1y['\"]?\\s*:\\s*(\\d+)"));
    return m ? [+m[1], +m[2], +m[3]] : null;
  };
  ['ALPXS', 'SOL', 'USDT', 'ETH'].forEach(sym => {
    const a = grab(html, sym), b = grab(edge, sym);
    ok('PIN APY 락스텝 ' + sym + ' (대시보드==stake-accrue)',
      !!a && !!b && a.join() === b.join(),
      'dash=' + JSON.stringify(a) + ' edge=' + JSON.stringify(b));
  });
})();

/* ── BAN: 클라가 돈 테이블에 직접 쓰는 경로 (RPC 우회) ── */
const BANS = [
  ['crypto_holdings 직접 쓰기', /from\('crypto_holdings'\)\s*\.\s*(insert|update|upsert|delete)/],
  ['crypto_stakes 직접 쓰기',   /from\('crypto_stakes'\)\s*\.\s*(insert|update|upsert|delete)/],
  ['accounts 직접 쓰기',        /from\('accounts'\)\s*\.\s*(insert|update|upsert|delete)/],
  ['ledger 접근(읽기든 쓰기든 대시보드 소관 아님)', /from\('ledger'\)/],
  ['crypto_trades 직접 쓰기(RPC만 기록)', /from\('crypto_trades'\)\s*\.\s*(insert|update|upsert|delete)/],
  ['service_role 노출',         /service_role/],
  ['잔고 델타 추측 업로드(syncSportsBal류)', /__sbLastPushed|syncSportsBal/],
];
BANS.forEach(([name, re]) => ok('BAN ' + name + ' 없음', !re.test(html)));

/* ── BAN: localStorage 쓰기 = 허용 키만 (돈/잔고/보유 저장 금지 — CLAUDE.md #5) ──
   허용: 레이아웃(LKEY)·테마(TKEY)·워치리스트(MK_KEY)·주문 의사표시(pendingOrders,
   자금 미이동)·레퍼럴 UX 캐시(referralRedeemed). 그 외 setItem이 생기면 🔴 → 검토 후
   여기 허용목록에 근거와 함께 추가하거나 서버로 옮겨라. */
(function storageAllowlist() {
  const calls = html.match(/localStorage\.setItem\([^)]*\)/g) || [];
  const ALLOWED = /localStorage\.setItem\(\s*(LKEY|TKEY|MK_KEY|localStorage|'alpexa\.pendingOrders'|'alpexa\.referralRedeemed')/;
  const bad = calls.filter(c => !ALLOWED.test(c));
  ok('BAN localStorage 비허용 키 쓰기 없음 (' + calls.length + '건 검사)', bad.length === 0,
    bad.join(' | '));
})();

console.log(failN === 0
  ? `🟢 crypto-dashboard fidelity — pins/bans ${pass} all green`
  : `🔴 crypto-dashboard fidelity — ${failN} FAILED / ${pass} passed`);
process.exit(failN === 0 ? 0 : 1);
