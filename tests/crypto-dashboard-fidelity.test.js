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
  ['비로그인 지갑 헤드라인 = 명시적 Sign-in CTA(헐벗은 ···가 고장처럼 보이던 문제)', /amtEl\.innerHTML=[^\n]*walsignin[^\n]*data-signin/],
  ['Sign-in CTA → 목적지 토큰 후 login.html', /alpexa\.dest2','crypto-dashboard'[\s\S]{0,80}?login\.html/],
  ['지갑 헤드라인 = 세션으로 판정(wal.authed=!!sess)', /wal\.authed\s*=\s*!!sess/],
  ['헤드라인 분기 = wal.authed (히스토리 RPC 아님)', /if\(wal\.authed\)\{[\s\S]{0,400}?amtEl\.innerHTML/],
  ['로그인 총액 = KV Total과 동일 소스(wal.total=cash+cryptoV+staked)', /wal\.total\s*=\s*cash\+cryptoV\+staked/],
  /* 시세 하네스(feedHz) — 지우면 얼어붙음 자가치유가 사라진다 (2026-07-19 사장님 지시) */
  ['시세 하네스 존재(feedHz 제어루프)', /const feedHz=\{/],
  ['하네스 치유① 무틱 → 폴백+재접속', /heal:poll\+reconnect/],
  ['하네스 치유③ 차트 캔들 재적재', /heal:chLoad/],
  ['하네스 정직표시 ⚠ FEED STALE 배지', /FEED STALE/],
  ['폴백 게이트 = 신선도(sticky wsLive 금지)', /wsFresh=mk\.lastTick&&/],
  ['지갑 재평가 루프 — 시세 틱에 잔고 재마크(스냅샷 고정 금지)', /function kvLivePrice\(s\)[\s\S]{0,600}?wal\.hold\.forEach/],
  ['재평가는 수량=서버·가격=라이브(표시 전용)', /wal\.hold=h\.data\|\|\[\]; wal\.stakedUsd=staked/],
  ['Open orders 정직 표기 = Pending (manual)', /Pending \(manual\)/],
  ['미구현 기능 정직 표기 = Soon 칩',          /title="Soon"/],
  ['ALPXS 하드락 안내(만기 전 언스테이크 불가)', /cannot be unstaked before maturity/],
  ['조기 언스테이크 몰수 경고(원금만 반환)',    /principal only/],
  ['출금 승인 전 차감 없음 문구',              /nothing deducted until approval/i],
  // ── 2026-07-17 누락감사 A급 수리 핀 (지우면 부분복제 클래스 재발) ──
  ['A-1 킬스위치 적재(controls.trading_halt)', /from\('controls'\)\.select\('val'\)\.eq\('key','trading_halt'\)/],
  ['A-1 halt가 돈 제출을 막음(HALT_MSG 게이트)', /if\(window\.__alpexaHalt\)\{[^}]*HALT_MSG/],
  ['A-2 마크업 적재(pricing_marks → __alpexaCryptoMarks)', /from\('pricing_marks'\)\.select\('symbol,markup_pts'\)/],
  ['A-3 신원 대조(assertIdentity 호출)',       /AlpexaSync\.assertIdentity/],
  ['A-4 Transak 계약(walletAddress+partnerOrderId)', /walletAddress:RC_EXT\.address[\s\S]{0,200}partnerOrderId/],
  ['B-2 와이어 매칭 참조(ALPX-<custId>)',       /'ALPX-'\+String\(c\)\.toUpperCase\(\)/],
  ['B-1 온체인 출금 USDT 한정(WD_NET)',         /const WD_NET=\{ USDT:'ERC-20 · Ethereum' \};/],
  ['B-3 2단 확인 — swap',                       /armed\('sw',/],
  ['B-3 2단 확인 — send',                       /armed\('mm',/],
  ['B-3 2단 확인 — transfer',                   /armed\('xf',/],
  ['B-3 2단 확인 — stake',                      /armed\('st',/],
  ['B-4 activity 병합(reward·send)',            /\.in\('kind',\['reward','send'\]\)/],
  ['B-4 성공 액션 activity 미러(logAct)',        /AlpexaSync\.logActivity\(\{ server:'crypto'/],
  ['B-6 ALPXS 스테이크 1y 전용',                /asset==='ALPXS';\s*\/\/ B-6/],
  ['B-8 sync_crypto_balance 동기화',            /rpc\('sync_crypto_balance'/],
  ['B-9 Realtime 구독(stakes·holdings)',        /postgres_changes[\s\S]{0,200}crypto_stakes[\s\S]{0,400}crypto_holdings/],
  ['B-10 원격청산 set_balance 불가침',          /if\(c\.action==='set_balance'\) continue;/],
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
  ['피드 상태등 하드코드(가짜 초록)',        /feedDot'\)\.classList\.add\('ok'\)/],
];
BANS.forEach(([name, re]) => ok('BAN ' + name + ' 없음', !re.test(html)));

/* ── BAN: localStorage 쓰기 = 허용 키만 (돈/잔고/보유 저장 금지 — CLAUDE.md #5) ──
   허용: 레이아웃(LKEY)·테마(TKEY)·워치리스트(MK_KEY)·주문 의사표시(pendingOrders,
   자금 미이동)·레퍼럴 UX 캐시(referralRedeemed). 그 외 setItem이 생기면 🔴 → 검토 후
   여기 허용목록에 근거와 함께 추가하거나 서버로 옮겨라. */
(function storageAllowlist() {
  const calls = html.match(/localStorage\.setItem\([^)]*\)/g) || [];
  // ACCEPTED 'alpexa.cbdash.watch.alpxs1' (2026-07-17): ALPXS 기본 워치리스트 1회 병합 플래그 —
  // UI 설정 캐시(돈 아님), 사용자가 ALPXS를 뺀 뒤 다시 안 넣기 위한 존중 플래그.
  // ACCEPTED 'alpexa.dash.lang' (2026-07-17): 멀티랭귀지 선택 — UI 설정(돈 아님), 대시보드 공유.
  const ALLOWED = /localStorage\.setItem\(\s*(LKEY|TKEY|MK_KEY|localStorage|'alpexa\.pendingOrders'|'alpexa\.referralRedeemed'|'alpexa\.cbdash\.watch\.alpxs1'|'alpexa\.dash\.lang')/;
  const bad = calls.filter(c => !ALLOWED.test(c));
  ok('BAN localStorage 비허용 키 쓰기 없음 (' + calls.length + '건 검사)', bad.length === 0,
    bad.join(' | '));
})();

// ── 차트 위젯 Buy/Sell 활성화 (2026-07-23 사장님 "활성화 해줘") — 티켓과 같은 단일 주문 경로 ──
ok('PIN 차트 Buy/Sell 배선 (chBuy/chSell → chTrade)',
   /id="chBuy"/.test(html) && /id="chSell"/.test(html) &&
   /getElementById\('chBuy'\)\.onclick=\(\)=>chTrade\('buy'\)/.test(html) &&
   /getElementById\('chSell'\)\.onclick=\(\)=>chTrade\('sell'\)/.test(html));
ok('PIN chTrade = cb-sel 동기 + tkOpen (coin-list와 동일 경로 — 별도 매매 코드 금지)',
   /function chTrade\(side\)\{ const s=ch\.sym;[\s\S]{0,260}new CustomEvent\('cb-sel',\{detail:s\}\)[\s\S]{0,140}tkOpen\(side\)/.test(html));
ok('BAN 차트 버튼 "연결 예정" 플레이스홀더 잔재 0', !/Trade 위젯에서 연결 예정/.test(html));

console.log(failN === 0
  ? `🟢 crypto-dashboard fidelity — pins/bans ${pass} all green`
  : `🔴 crypto-dashboard fidelity — ${failN} FAILED / ${pass} passed`);
process.exit(failN === 0 ? 0 : 1);
