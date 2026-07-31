#!/usr/bin/env node
// ALPEXA — 합성 고객 봇 (2026-07-31 사장님 승인 "감시의 마지막 구멍 = 행동 계층")
// 2026-07-31 사장님 지시 확장: "스포츠 크립토 fx 를 테스트 해...매일" — 3종 전부 실거래 리허설.
// 계정 = 사장님 테스트 계정 (시크릿 SYNTH_EMAIL/SYNTH_PASSWORD — 공용 계정이므로
// 봇은 자기가 만든 것만 건드린다: 산 만큼만 팔고, 자기 local_id만 닫는다).
//
// 매일 1회, 실제 고객이 하는 행동을 그대로 해보고 돈이 정확히 움직이는지 대조한다.
// 데이터 감시(신선도·쿼터·정산)가 못 보는 "버튼은 있는데 죽었다 / 체결은 되는데 잔고가
// 어긋난다"를 사장님보다 먼저 잡는 층.
//
//   ① 로그인(패스워드 그랜트) + 계정 3종(sports/crypto/fx) 조회
//   ② 스포츠 풀루프: 어제 synbet- 정산 완료 확인(36h 넘게 열려있으면 🔴 = 정산 파이프 막힘)
//      + 오늘 실배당 경기에 $1 실베팅(서버 재가격 확인) — 정산은 내일 런이 검증
//   ③ 크립토 왕복: BTC $2 매수 → 같은 ref 재호출(멱등 프로브) → 산 만큼만 매도
//      (사전 보유 0일 때만 전량 매도 — 사장님 기존 보유엔 손대지 않는다)
//   ④ FX 왕복: eurusd 0.01랏 BUY → 즉시 close (주말 MARKET_CLOSED면 스킵 — 정상)
//   ⑤ 거부 프로브(돈 무이동): stake 0 → 거절 · 타계정 → 거절
//   ⑥ cash_out 잠금 회귀: permission denied 여야 정상 (2026-07-27 전수감사 잠금 유지)
//   ⑦ 불변식 대조: 계정별 (잔고after − 잔고before) == Σ(런 중 새 ledger) — 센트 정확 일치
//   ⑧ 왕복 비용(크립토+FX 스프레드) < $1 새너티 (스포츠 stake $1은 비용 아님 — 열린 베팅 자산)
//
// 원칙: fail-closed — 어긋나면 exit 1 (Actions 침묵 게이트가 이메일). 시크릿 하드코딩 금지.
'use strict';
const URL = process.env.ALPEXA_URL || 'https://grxnbgtfnaayeluenvqh.supabase.co';
const ANON = process.env.ALPEXA_ANON || 'sb_publishable_ow1DihBdAAvNtnb1H0Kojw_7vbeMKFu';
const EMAIL = process.env.SYNTH_EMAIL || '';
const PASS = process.env.SYNTH_PASSWORD || '';
const BUY_USD = 2;          // 크립토 왕복 금액 (핀: ≤5 — 봇이 큰돈을 만지는 순간 자체가 결함)
const FX_SIZE = 0.01;       // FX 최소 랏 (핀: ≤0.01)
const BET_STAKE = 1;        // 스포츠 일일 실베팅 (핀: ≤2)
const MAX_ROUNDTRIP_COST = 1.0;   // 크립토+FX 왕복 비용 상한(스프레드) — 초과 = 어딘가 샌다

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
  ok('로그인 성공');

  // ⚠️ 사장님 계정은 어드민 — RLS가 전 고객 행을 돌려주므로 반드시 "내 player"로 필터.
  //    (1차 실행 실패 원인: 필터 없이 A[server]가 남의 계정을 집어 "not your account")
  const uid = (auj.user || {}).id;
  const players = await rest(`players?select=id,cust_id&auth_id=eq.${uid}`);
  if (!Array.isArray(players) || !players.length) { bad('players 조회 실패: ' + JSON.stringify(players).slice(0, 120)); process.exit(1); }
  const pids = players.map((p) => p.id).join(',');
  const custs = players.map((p) => p.cust_id);
  const accts = await rest(`accounts?select=acct_no,server,balance&player_id=in.(${pids})`);
  const A = {}; for (const a of accts) A[a.server] = a;
  for (const s of ['sports', 'crypto', 'fx']) if (!A[s]) bad(`${s} 계정 없음`);
  if (red) { console.log('\n🔴 봇: 계정 구성부터 실패'); process.exit(1); }
  const runStart = new Date().toISOString();
  const bal0 = { crypto: +A.crypto.balance, fx: +A.fx.balance, sports: +A.sports.balance };
  console.log(`  잔고: crypto $${bal0.crypto} · fx $${bal0.fx} · sports $${bal0.sports}`);
  if (bal0.sports < 5) bad(`sports 잔고 $${bal0.sports} < $5 — 충전 필요`);
  if (bal0.fx < 30) bad(`fx 잔고 $${bal0.fx} < $30 — 충전 필요 (0.01랏 마진)`);
  if (red) { console.log('\n🔴 봇: 자금 부족'); process.exit(1); }

  const ts = Date.now();

  // ── ② 스포츠 풀루프 ──
  let betPlaced = false;
  try {
    // ②a 어제까지의 synbet- 이 아직 열려있으면 정산 파이프가 막힌 것 (경기 종료+정산크론 시간 고려 36h)
    //    나이는 local_id의 synbet-<ts> 타임스탬프로 계산 (스키마 컬럼 의존 0 — 1차 실행 실패 교훈)
    const openBets = await rest(`positions?select=local_id,status&server=eq.sports&status=eq.open&cust_id=in.(${custs.map((c) => '"' + c + '"').join(',')})&local_id=like.synbet-%25`);
    if (!Array.isArray(openBets)) bad('synbet 조회 실패: ' + JSON.stringify(openBets).slice(0, 120));
    else {
      const stale = openBets.filter((p) => { const t = +String(p.local_id).replace('synbet-', ''); return t > 0 && Date.now() - t > 36 * 3600e3; });
      if (stale.length) bad(`🚨 정산 파이프 의심: synbet ${stale.length}건이 36h+ 미정산 (${stale.map((p) => p.local_id).join(',')})`);
      else ok(`이전 synbet 정산 상태 정상 (미정산 ${openBets.length}건, 전부 36h 이내)`);
    }

    // ②b 오늘 실배당 경기에 $1 실베팅 — 서버가 재가격·마진·게이트 전부 태우는 실경로
    const lg = await rest('live_games?id=eq.all&select=data');
    const games = ((lg[0] || {}).data || []).filter((g) =>
      g.oddsReal === true && Array.isArray(g.ml) && g.ml.length >= 2 &&
      Date.parse(g.iso || 0) > Date.now() && Date.parse(g.iso) < Date.now() + 36 * 3600e3);
    if (!games.length) skip('베팅 가능한 실배당 미래 경기 없음 — 오늘 베팅 생략 (드묾)');
    else {
      games.sort((a, b) => Date.parse(a.iso) - Date.parse(b.iso));
      const g = games[0]; const sel = g.ml[0].sel;
      const lid = `synbet-${ts}`;
      const pb = await rpc('place_bet', {
        p_acct: A.sports.acct_no, p_stake: BET_STAKE, p_potential: 0, p_symbol: 'SPORTS',
        p_local_id: lid, p_meta: { legs: [{ gid: g.gid, market: 'Moneyline', sel: sel }] },
      });
      if (!pb.body || pb.body.ok !== true) bad('실베팅 실패: ' + (pb.raw || '').slice(0, 140) + ` (${g.lg} ${g.away}@${g.home})`);
      else { ok(`실베팅 $${BET_STAKE} — ${g.lg} ${g.away}@${g.home} · ${sel} (${lid}) — 정산은 내일 런이 확인`); betPlaced = true; }
    }
  } catch (e) { bad('스포츠 풀루프 예외: ' + e.message); }

  // ── ③ 크립토 왕복 + 멱등 프로브 (산 만큼만 판다 — 기존 보유 불가침) ──
  try {
    const h0 = await rest(`crypto_holdings?select=asset,qty&acct_no=eq.${A.crypto.acct_no}&asset=eq.BTC`);
    const have0 = +((h0[0] || {}).qty || 0);
    const refB = `synth-${ts}-buy`;
    const b1 = await rpc('crypto_trade', { p_ref: refB, p_acct: A.crypto.acct_no, p_symbol: 'BTC', p_usd: BUY_USD, p_side: 'buy' });
    if (!b1.body || b1.body.ok !== true) bad('크립토 매수 실패: ' + (b1.raw || '').slice(0, 140));
    else {
      const boughtQty = +b1.body.qty || 0;
      ok(`크립토 매수 $${BUY_USD} BTC (qty ${boughtQty})`);
      const b2 = await rpc('crypto_trade', { p_ref: refB, p_acct: A.crypto.acct_no, p_symbol: 'BTC', p_usd: BUY_USD, p_side: 'buy' });
      if (b2.body && b2.body.ok === true && b2.body.duplicate === true) ok('멱등 프로브: 같은 ref 재호출 → duplicate (이중적용 차단 확인)');
      else bad('멱등 프로브 실패 — 같은 ref가 duplicate로 안 막힘: ' + (b2.raw || '').slice(0, 140));
      // 사전 보유 0 → 전량 매도(깨끗한 왕복). 보유 있었음 → 산 수량만큼만 USD 환산 매도(먼지 몇 센트 허용).
      const sellParams = have0 <= 0
        ? { p_ref: `synth-${ts}-sell`, p_acct: A.crypto.acct_no, p_symbol: 'BTC', p_usd: 0, p_side: 'sell', p_all: true }
        : { p_ref: `synth-${ts}-sell`, p_acct: A.crypto.acct_no, p_symbol: 'BTC', p_usd: Math.floor(boughtQty * (+b1.body.price || 0) * 0.995 * 100) / 100, p_side: 'sell' };
      const s1 = await rpc('crypto_trade', sellParams);
      if (!s1.body || s1.body.ok !== true) bad('크립토 매도 실패: ' + (s1.raw || '').slice(0, 140));
      else ok(have0 <= 0 ? '크립토 전량 매도 (보유 0 복귀)' : '크립토 산 만큼 매도 (기존 보유 불가침)');
    }
  } catch (e) { bad('크립토 왕복 예외: ' + e.message); }

  // ── ④ FX 왕복 (주말 = 정상 스킵) ──
  try {
    const lid = `synth-${ts}-fx`;
    const o = await rpc('fx_open', { p_local_id: lid, p_symbol: 'EURUSD', p_side: 'BUY', p_size: FX_SIZE });
    if (o.body && o.body.ok !== true && o.body.code === 'MARKET_CLOSED') skip('FX 장 닫힘(주말) — FX 왕복 생략');
    else if (!o.body || o.body.ok !== true) bad('FX 오픈 실패: ' + (o.raw || '').slice(0, 140));
    else {
      const c = await rpc('fx_close', { p_local_id: lid });
      if (!c.body || c.body.ok !== true) bad(`FX 클로즈 실패 (포지션 ${lid} 열려있을 수 있음 — 확인 필요!): ` + (c.raw || '').slice(0, 140));
      else ok(`FX 왕복 EURUSD ${FX_SIZE}랏 — 실현손익 $${(+c.body.pnl || 0).toFixed(2)}`);
    }
  } catch (e) { bad('FX 왕복 예외: ' + e.message); }

  // ── ⑤ 거부 프로브 (돈 무이동) ──
  try {
    const r1 = await rpc('place_bet', { p_acct: A.sports.acct_no, p_stake: 0, p_potential: 0, p_symbol: 'SPORTS', p_local_id: `synth-${ts}-neg`, p_meta: {} });
    if (r1.body && r1.body.ok === false) ok('거부 프로브: stake 0 베팅 → 거절 (' + (r1.body.error || '') + ')');
    else bad('거부 프로브 실패: stake 0 베팅이 안 막힘: ' + (r1.raw || '').slice(0, 140));
    const r2 = await rpc('place_bet', { p_acct: 'SP-000000', p_stake: 1, p_potential: 2, p_symbol: 'SPORTS', p_local_id: `synth-${ts}-neg2`, p_meta: {} });
    if (r2.body && r2.body.ok === false) ok('거부 프로브: 남의/없는 계정 베팅 → 거절 (' + (r2.body.error || '') + ')');
    else bad('거부 프로브 실패: 타계정 베팅이 안 막힘: ' + (r2.raw || '').slice(0, 140));
  } catch (e) { bad('거부 프로브 예외: ' + e.message); }

  // ── ⑥ cash_out 잠금 회귀 (2026-07-27 전수감사: authenticated 권한 회수 상태가 정상) ──
  try {
    const co = await rpc('cash_out', { p_local_id: 'synth-none', p_fraction: 1.0 });
    if (co.status === 401 || co.status === 403 || /permission denied|42501/i.test(co.raw || '')) ok('cash_out 잠금 유지 — permission denied (정상)');
    else bad('🚨 cash_out 잠금 풀림?! 고객 세션 호출이 거부되지 않음: ' + co.status + ' ' + (co.raw || '').slice(0, 140));
  } catch (e) { bad('cash_out 프로브 예외: ' + e.message); }

  // ── ⑦ 불변식 대조: Δ잔고 == Σ(런 중 새 ledger) — 센트 정확 일치 ──
  try {
    await new Promise((r) => setTimeout(r, 1500));   // 트리거 커밋 여유
    const accts1 = await rest(`accounts?select=acct_no,server,balance&player_id=in.(${pids})`);
    const A1 = {}; for (const a of accts1) A1[a.server] = a;
    const own = new Set(['crypto', 'fx', 'sports'].map((s) => A[s].acct_no));
    const led = (await rest(`ledger?select=acct_no,amount,ref&created_at=gte.${encodeURIComponent(runStart)}`))
      .filter((x) => own.has(x.acct_no));   // 어드민 RLS로 남의 행도 오므로 내 계정만
    // FX 실현손익은 설계상 ledger가 아니라 settlements로 기장 (fx_close 주석: ledger에 쓰면
    // 이중계산 — trg_settlement_balance가 잔고 반영). 2차 실행 오탐 교훈: 불변식의 우변은
    // Σledger + Σsettlements.pnl 이어야 한다.
    const setl = (await rest(`settlements?select=acct_no,pnl&created_at=gte.${encodeURIComponent(runStart)}`))
      .filter((x) => own.has(x.acct_no));
    let tradeCost = 0;
    for (const s of ['crypto', 'fx', 'sports']) {
      const d = Math.round(((+A1[s].balance) - bal0[s]) * 100) / 100;
      const sum = Math.round((
        led.filter((x) => x.acct_no === A[s].acct_no).reduce((a, x) => a + (+x.amount || 0), 0) +
        setl.filter((x) => x.acct_no === A[s].acct_no).reduce((a, x) => a + (+x.pnl || 0), 0)
      ) * 100) / 100;
      if (Math.abs(d - sum) < 0.005) ok(`불변식(${s}): Δ잔고 ${d >= 0 ? '+' : ''}$${d} == Σ(ledger+settlements) ${sum >= 0 ? '+' : ''}$${sum}`);
      else bad(`🚨 불변식 위반(${s}): Δ잔고 $${d} ≠ Σ(ledger+settlements) $${sum} — 원장 밖에서 돈이 움직임!`);
      if (s !== 'sports') tradeCost += -d;   // 스포츠 stake는 비용 아님(열린 베팅 자산) — 정산은 ②a가 감시
    }
    if (tradeCost > MAX_ROUNDTRIP_COST) bad(`왕복 비용(크립토+FX) $${tradeCost.toFixed(2)} > $${MAX_ROUNDTRIP_COST} — 스프레드 이상 또는 누수`);
    else ok(`왕복 비용(크립토+FX) $${tradeCost.toFixed(2)} (스프레드 — 하우스 수취, 상한 $${MAX_ROUNDTRIP_COST})`);
    if (betPlaced) {
      const ds = Math.round(((+A1.sports.balance) - bal0.sports) * 100) / 100;
      if (ds > 0 || ds < -BET_STAKE - 0.005) bad(`스포츠 Δ잔고 $${ds} — stake $${BET_STAKE} 차감과 불일치`);
    }
    if (led.some((x) => !x.ref)) bad('ref 없는 ledger 행 발견 — 멱등 계약 위반');
  } catch (e) { bad('불변식 대조 예외: ' + e.message); }

  console.log(red ? `\n🔴 합성 고객 봇: ${red}건 이상 — 고객이 겪기 전에 잡힌 문제` : '\n🟢 합성 고객 봇: 스포츠·크립토·FX 전 구간 정상 (로그인→체결→원장 정합)');
  process.exit(red ? 1 : 0);
})().catch((e) => { console.error('🔴 봇 크래시: ' + e.message); process.exit(1); });
