#!/usr/bin/env node
// ALPEXA — 합성 고객 봇 (2026-07-31 사장님 승인 "감시의 마지막 구멍 = 행동 계층")
//
// 매일 1회, 실제 고객이 하는 행동을 봇 전용 계정으로 그대로 해보고 돈이 정확히
// 움직이는지 대조한다. 데이터 감시(신선도·쿼터·정산)가 못 보는 "버튼은 있는데 죽었다 /
// 체결은 되는데 잔고가 어긋난다"를 사장님보다 먼저 잡는 층.
//
// 하는 일 (전부 봇 계정 한정, 왕복 비용 = 스프레드 몇십 센트, 하우스 수취라 사업상 0):
//   ① 로그인(패스워드 그랜트) + 계정 3종(sports/crypto/fx) 조회
//   ② 크립토 왕복: BTC $2 매수 → 같은 ref 재호출(멱등 프로브: duplicate=true·잔고 불변) → 전량 매도
//   ③ FX 왕복: eurusd 0.01랏 BUY → 즉시 close (주말 MARKET_CLOSED면 스킵 — 정상)
//   ④ 거부 프로브(돈 무이동): place_bet stake 0 → 거절 · 남의 계정 → 거절
//   ⑤ cash_out 잠금 회귀: 호출이 permission denied 여야 정상 (2026-07-27 전수감사 잠금 유지 확인)
//   ⑥ 불변식 대조: 계정별 (잔고after − 잔고before) == Σ(런 중 새 ledger 행) — 센트 단위 정확 일치
//   ⑦ 총 왕복 비용 < $1 새너티
//
// 원칙: fail-closed — 어긋나면 exit 1 (Actions 침묵 게이트가 이메일). 봇 계정 외 접근 0.
// 시크릿: SYNTH_EMAIL / SYNTH_PASSWORD (GitHub Secrets — 레포는 public, 절대 하드코딩 금지).
'use strict';
const URL = process.env.ALPEXA_URL || 'https://grxnbgtfnaayeluenvqh.supabase.co';
const ANON = process.env.ALPEXA_ANON || 'sb_publishable_ow1DihBdAAvNtnb1H0Kojw_7vbeMKFu';
const EMAIL = process.env.SYNTH_EMAIL || '';
const PASS = process.env.SYNTH_PASSWORD || '';
const BUY_USD = 2;          // 크립토 왕복 금액 (핀: ≤5 — 봇이 큰돈을 만지는 순간 자체가 결함)
const FX_SIZE = 0.01;       // FX 최소 랏 (핀: ≤0.01)
const MAX_ROUNDTRIP_COST = 1.0;   // 왕복 총비용 상한(스프레드) — 초과 = 어딘가 샌다

let red = 0;
const ok = (m) => console.log('  ✅ ' + m);
const bad = (m) => { console.log('  🔴 ' + m); red++; };
const skip = (m) => console.log('  ⏭️  ' + m);

let TOKEN = '';
const hdr = () => ({ apikey: ANON, Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json' });
const rpc = async (fn, params) => {
  const r = await fetch(`${URL}/rest/v1/rpc/${fn}`, { method: 'POST', headers: hdr(), body: JSON.stringify(params) });
  const t = await r.text();
  let j = null; try { j = JSON.parse(t); } catch (_e) { /* non-json */ }
  return { status: r.status, body: j, raw: t };
};
const rest = async (path) => (await fetch(`${URL}/rest/v1/${path}`, { headers: hdr() })).json();

(async () => {
  console.log('══ ALPEXA 합성 고객 봇 ══  (' + new Date().toISOString() + ')');
  if (!EMAIL || !PASS) { skip('SYNTH_EMAIL/SYNTH_PASSWORD 미설정 — GitHub Secrets 등록 전까지 생략'); process.exit(0); }

  // ── ① 로그인 + 계정 ──
  const au = await fetch(`${URL}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASS }),
  });
  const auj = await au.json();
  if (!auj.access_token) { bad('로그인 실패: ' + JSON.stringify(auj).slice(0, 120)); process.exit(1); }
  TOKEN = auj.access_token;
  ok('로그인 성공 (봇 계정)');

  const accts = await rest('accounts?select=acct_no,server,balance');
  const A = {}; for (const a of accts) A[a.server] = a;
  for (const s of ['sports', 'crypto', 'fx']) if (!A[s]) bad(`${s} 계정 없음 — 봇 계정 생성이 불완전`);
  if (red) { console.log('\n🔴 봇: 계정 구성부터 실패'); process.exit(1); }
  const runStart = new Date().toISOString();
  const bal0 = { crypto: +A.crypto.balance, fx: +A.fx.balance, sports: +A.sports.balance };
  console.log(`  잔고: crypto $${bal0.crypto} · fx $${bal0.fx} · sports $${bal0.sports}`);
  if (bal0.crypto < 5) bad(`crypto 잔고 $${bal0.crypto} < $5 — 봇 계정에 자금 필요 (crypto $10 권장)`);
  if (bal0.fx < 30) bad(`fx 잔고 $${bal0.fx} < $30 — 봇 계정에 자금 필요 (fx $50 권장, 0.01랏 마진)`);
  if (red) { console.log('\n🔴 봇: 자금 부족 — 어드민에서 봇 계정에 충전 후 재실행'); process.exit(1); }

  const ts = Date.now();

  // ── ② 크립토 왕복 + 멱등 프로브 ──
  let cryptoDone = false;
  try {
    const refB = `synth-${ts}-buy`;
    const b1 = await rpc('crypto_trade', { p_ref: refB, p_acct: A.crypto.acct_no, p_symbol: 'BTC', p_usd: BUY_USD, p_side: 'buy' });
    if (!b1.body || b1.body.ok !== true) bad('크립토 매수 실패: ' + (b1.raw || '').slice(0, 140));
    else {
      ok(`크립토 매수 $${BUY_USD} BTC 체결`);
      const b2 = await rpc('crypto_trade', { p_ref: refB, p_acct: A.crypto.acct_no, p_symbol: 'BTC', p_usd: BUY_USD, p_side: 'buy' });
      if (b2.body && b2.body.ok === true && b2.body.duplicate === true) ok('멱등 프로브: 같은 ref 재호출 → duplicate (이중적용 차단 확인)');
      else bad('멱등 프로브 실패 — 같은 ref가 duplicate로 안 막힘: ' + (b2.raw || '').slice(0, 140));
      const s1 = await rpc('crypto_trade', { p_ref: `synth-${ts}-sell`, p_acct: A.crypto.acct_no, p_symbol: 'BTC', p_usd: 0, p_side: 'sell', p_all: true });
      if (!s1.body || s1.body.ok !== true) bad('크립토 전량 매도 실패: ' + (s1.raw || '').slice(0, 140));
      else { ok('크립토 전량 매도 체결 (보유 0 복귀)'); cryptoDone = true; }
    }
  } catch (e) { bad('크립토 왕복 예외: ' + e.message); }

  // ── ③ FX 왕복 (주말 = 정상 스킵) ──
  let fxDone = false;
  try {
    const lid = `synth-${ts}-fx`;
    const o = await rpc('fx_open', { p_local_id: lid, p_symbol: 'eurusd', p_side: 'BUY', p_size: FX_SIZE });
    if (o.body && o.body.ok !== true && o.body.code === 'MARKET_CLOSED') skip('FX 장 닫힘(주말) — FX 왕복 생략');
    else if (!o.body || o.body.ok !== true) bad('FX 오픈 실패: ' + (o.raw || '').slice(0, 140));
    else {
      const c = await rpc('fx_close', { p_local_id: lid });
      if (!c.body || c.body.ok !== true) bad(`FX 클로즈 실패 (포지션 ${lid} 열려있을 수 있음 — 확인 필요!): ` + (c.raw || '').slice(0, 140));
      else { ok(`FX 왕복 eurusd ${FX_SIZE}랏 — 실현손익 $${(+c.body.pnl || 0).toFixed(2)}`); fxDone = true; }
    }
  } catch (e) { bad('FX 왕복 예외: ' + e.message); }

  // ── ④ 거부 프로브 (돈 무이동) ──
  try {
    const r1 = await rpc('place_bet', { p_acct: A.sports.acct_no, p_stake: 0, p_potential: 0, p_symbol: 'SPORTS', p_local_id: `synth-${ts}-neg`, p_meta: {} });
    if (r1.body && r1.body.ok === false) ok('거부 프로브: stake 0 베팅 → 거절 (' + (r1.body.error || '') + ')');
    else bad('거부 프로브 실패: stake 0 베팅이 안 막힘: ' + (r1.raw || '').slice(0, 140));
    const r2 = await rpc('place_bet', { p_acct: 'SP-000000', p_stake: 1, p_potential: 2, p_symbol: 'SPORTS', p_local_id: `synth-${ts}-neg2`, p_meta: {} });
    if (r2.body && r2.body.ok === false) ok('거부 프로브: 남의/없는 계정 베팅 → 거절 (' + (r2.body.error || '') + ')');
    else bad('거부 프로브 실패: 타계정 베팅이 안 막힘: ' + (r2.raw || '').slice(0, 140));
  } catch (e) { bad('거부 프로브 예외: ' + e.message); }

  // ── ⑤ cash_out 잠금 회귀 (2026-07-27 전수감사: authenticated 권한 회수 상태가 정상) ──
  try {
    const co = await rpc('cash_out', { p_local_id: 'synth-none', p_fraction: 1.0 });
    if (co.status === 401 || co.status === 403 || /permission denied|42501/i.test(co.raw || '')) ok('cash_out 잠금 유지 — permission denied (정상)');
    else bad('🚨 cash_out 잠금 풀림?! 고객 세션 호출이 거부되지 않음: ' + co.status + ' ' + (co.raw || '').slice(0, 140));
  } catch (e) { bad('cash_out 프로브 예외: ' + e.message); }

  // ── ⑥ 불변식 대조: Δ잔고 == Σ(런 중 새 ledger) — 센트 정확 일치 ──
  try {
    await new Promise((r) => setTimeout(r, 1500));   // 트리거 커밋 여유
    const accts1 = await rest('accounts?select=acct_no,server,balance');
    const A1 = {}; for (const a of accts1) A1[a.server] = a;
    const led = await rest(`ledger?select=acct_no,amount,ref&created_at=gte.${encodeURIComponent(runStart)}`);
    let totalCost = 0;
    for (const s of ['crypto', 'fx', 'sports']) {
      const d = Math.round(((+A1[s].balance) - bal0[s]) * 100) / 100;
      const sum = Math.round(led.filter((x) => x.acct_no === A[s].acct_no).reduce((a, x) => a + (+x.amount || 0), 0) * 100) / 100;
      if (Math.abs(d - sum) < 0.005) ok(`불변식(${s}): Δ잔고 ${d >= 0 ? '+' : ''}$${d} == Σledger ${sum >= 0 ? '+' : ''}$${sum}`);
      else bad(`🚨 불변식 위반(${s}): Δ잔고 $${d} ≠ Σledger $${sum} — 원장 밖에서 돈이 움직임!`);
      totalCost += -d;
    }
    if ((cryptoDone || fxDone) && totalCost > MAX_ROUNDTRIP_COST) bad(`왕복 비용 $${totalCost.toFixed(2)} > $${MAX_ROUNDTRIP_COST} — 스프레드 이상 또는 누수`);
    else ok(`왕복 총비용 $${totalCost.toFixed(2)} (스프레드 — 하우스 수취, 상한 $${MAX_ROUNDTRIP_COST})`);
    if (led.some((x) => !x.ref)) bad('ref 없는 ledger 행 발견 — 멱등 계약 위반');
  } catch (e) { bad('불변식 대조 예외: ' + e.message); }

  console.log(red ? `\n🔴 합성 고객 봇: ${red}건 이상 — 고객이 겪기 전에 잡힌 문제` : '\n🟢 합성 고객 봇: 전 구간 정상 (로그인→체결→원장 정합)');
  process.exit(red ? 1 : 0);
})().catch((e) => { console.error('🔴 봇 크래시: ' + e.message); process.exit(1); });
