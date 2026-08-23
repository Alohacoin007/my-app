#!/usr/bin/env node
// Alpexa — 일일 자가검진 (2026-07-19 사장님 지시: "알림은 사후 — 니가 매일 자체 확인해라")
//
// 아침·저녁 루틴이 이 한 방으로 돈다. 커버(사장님 지정 4종 + 시세):
//   ① 스케줄·오즈 — 오늘/내일 경기 수, 실배당/잠금, 가짜라인 노출 여부 (live_games)
//   ② 주문·결제·미청산 — sports-audit(C1~C9) verdict + 미정산 건수/최대 노출/홀드
//   ②b PAMM 펀드 — 유령 open 행·유닛 불변식·롤오버 잠김 (pamm_health)
//   ③ 시세 라이브니스 — 서버 prices 크립토 갱신 주기 실측 (3s 스펙)
// 원칙: 전부 읽기 전용. 돈/쓰기 0. RED가 하나라도 있으면 exit 1 (루틴이 원인 추적 모드로).
// 토큰: WELCOME_SECRET(이미 repo 공개·실고객 전 교체 예정 — 리마인드 등록됨). env로 덮어쓰기 가능.
'use strict';
const URL = process.env.ALPEXA_URL || 'https://grxnbgtfnaayeluenvqh.supabase.co';
const KEY = process.env.ALPEXA_ANON || 'sb_publishable_ow1DihBdAAvNtnb1H0Kojw_7vbeMKFu';
const AUDIT_TOKEN = process.env.ALPEXA_AUDIT_TOKEN || 'alpexa-welcome-2026';
const H = { apikey: KEY, Authorization: 'Bearer ' + KEY };
let red = 0;
const flag = (bad, line) => { console.log((bad ? '  🔴 ' : '  ✅ ') + line); if (bad) red++; };

const vegasYMD = (t) => new Date(t - 7 * 3600e3).toISOString().slice(0, 10);   // PDT
function oddsStatus(g) {
  if (g.lg === 'GOLF') { const oc = g.outright || []; return (g.oddsReal === true && oc.length >= 2) ? 'REAL' : 'LOCK'; }
  if (g.lg === 'SOC') { const tw = g.threeWay || []; if (tw.length < 3) return 'LOCK'; return g.oddsReal === true ? 'REAL' : (+tw[1].am === 230 ? 'FAKE' : 'REAL'); }
  const ml = g.ml || []; if (ml.length < 2) return 'LOCK';
  const a = +ml[0].am, b = +ml[1].am;
  return ((a === -140 && b === 120) || (a === 120 && b === -140)) ? 'FAKE' : 'REAL';
}

(async () => {
  console.log('══ ALPEXA 일일 자가검진 ══  (' + new Date().toISOString() + ')');

  // ── ① 스케줄 · 오즈 ──
  try {
    const r = await fetch(`${URL}/rest/v1/live_games?id=eq.all&select=data,updated_at`, { headers: H });
    const row = (await r.json())[0]; const all = row.data || [];
    const ageMin = Math.round((Date.now() - Date.parse(row.updated_at)) / 60000);
    // ⚠️ 나이만 보면 **빈 피드를 못 잡는다** (2026-08-19 실측 사고): sports-games 가 상류(ESPN)
    //    실패 후 sticky 이월분 2경기만으로 441경기 행을 덮어썼는데, 크론은 계속 돌아 updated_at 은
    //    1분 전이었다 → 신선도 검사는 내내 🟢. 고객 스포츠북은 비어 있었는데 우리는 몰랐다.
    //    **내용(경기 수)까지** 본다. 4개 리그 7일 창에서 20경기 미만이면 시즌 무관하게 붕괴다.
    const BLACKOUT_FLOOR = 20;
    flag(ageMin > 10, `피드 신선도: live_games ${all.length}경기 · ${ageMin}분 전 갱신` + (ageMin > 10 ? ' — 크론 확인 필요' : ''));
    flag(all.length < BLACKOUT_FLOOR,
      `피드 내용: ${all.length}경기` + (all.length < BLACKOUT_FLOOR
        ? ` — 🚨 블랙아웃 (기준 ${BLACKOUT_FLOOR}경기 미만). 크론은 돌지만 빈 목록을 쓰고 있다 → sports-games 상류(ESPN) 확인`
        : ' (블랙아웃 아님)'));
    const today = vegasYMD(Date.now()), tomorrow = vegasYMD(Date.now() + 86400e3);
    for (const dk of [today, tomorrow]) {
      const day = all.filter(g => { const t = Date.parse(g.iso || ''); return !isNaN(t) && vegasYMD(t) === dk; });
      const by = {};
      day.forEach(g => { const s = oddsStatus(g); const e = by[g.lg] || (by[g.lg] = { n: 0, REAL: 0, FAKE: 0, LOCK: 0 }); e.n++; e[s]++; });
      const parts = Object.keys(by).sort().map(lg => `${lg} ${by[lg].n}(실${by[lg].REAL}/잠${by[lg].LOCK}${by[lg].FAKE ? '/🚨가짜' + by[lg].FAKE : ''})`);
      const fake = Object.values(by).reduce((a, e) => a + e.FAKE, 0);
      flag(fake > 0, `${dk === today ? '오늘' : '내일'}(베가스): ` + (parts.join(' · ') || '경기 없음') + (fake ? ' — 가짜라인 베팅가능 노출!' : ''));
    }
  } catch (e) { flag(true, '스케줄·오즈 점검 실패: ' + e.message); }

  // ── ② 주문 · 결제 · 미청산 (돈-상태 감사 C1~C9) ──
  try {
    const r = await fetch(`${URL}/functions/v1/sports-audit?token=${encodeURIComponent(AUDIT_TOKEN)}`);
    const a = await r.json();
    if (!a || a.ok !== true) { flag(true, '돈-상태 감사 호출 실패: ' + JSON.stringify(a).slice(0, 120)); }
    else {
      flag(a.verdict === 'red', `돈-상태 감사: ${a.verdict === 'red' ? '🔴 RED' : a.verdict === 'yellow' ? '🟡 YELLOW' : 'GREEN'}` +
        ` · 미청산 ${a.open_bets}건 · 최대 단건 지급 $${(+a.biggest_exposure || 0).toLocaleString()} · 홀드 ${a.hold_pct}%` +
        (a.emailed ? ' · 이메일 발송됨' : ''));
      if (a.verdict === 'red') console.log('     ↳ 이메일 상세(C1~C9) 확인 + 미청산 나이/원인 추적할 것 (settle 규칙 A/B 배포 여부 포함)');
    }
  } catch (e) { flag(true, '돈-상태 감사 실패: ' + e.message); }

  // ── ②b PAMM 펀드 건전성 (2026-08-23 신설) ──
  // 왜 생겼나: 사장님이 "PAMM 포지션 다 닫혔어?"라고 물어봐서야 펀드에 EURUSD 8.1랏이
  // 17일째 열려 있다는 걸 알았다. 그동안 이 검진은 스포츠 미청산만 보고 PAMM 은 아무도
  // 안 보고 있었다 — 2026-08-19 블랙아웃과 똑같은 "조용한 쪽" 구조. 화면에 안 뜨는 곳이
  // 진짜 위험한 곳이다.
  //   🔴 판정: 유령 open 행(정산됐는데 status='open') · 유닛 불변식 깨짐 — 둘 다 돈 문제.
  //   ⚠️ 경고만: 롤오버 잠김(열린 포지션이 있으면 join/leave 가 막히는 건 **설계된 동작**).
  //      정상 상태를 빨강으로 울리면 경보가 무시당한다(CLAUDE.md "오탐 체크는 더 해롭다").
  try {
    const r = await fetch(`${URL}/rest/v1/rpc/pamm_health`, {
      method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: '{}',
    });
    if (!r.ok) console.log('  ⏭️  PAMM: pamm_health() 미배포 — supabase/sql/pamm_health.sql 실행 대기');
    else {
      const h = await r.json();
      const funds = (h && h.funds) || [];
      if (!funds.length) console.log('  ⏭️  PAMM: 등록된 펀드 없음');
      for (const f of funds) {
        const ghost = +f.ghost_positions || 0;
        const unitsBad = f.units_ok === false;
        flag(ghost > 0 || unitsBad,
          `PAMM ${f.name}(${f.fund_acct}): ${f.status} · NAV ${f.nav} · 열린 ${f.open_positions}건 ${f.open_lots}랏` +
          (f.open_positions > 0 ? ` · 플로팅 ${f.float_pct}% · ${f.oldest_open_days}일째` : '') +
          ` · 투자자 ${f.members}명` +
          (ghost > 0 ? ` — 🚨 유령 행 ${ghost}건 (정산 기록이 있는데 status=open) → Equity·NAV 왜곡 + join/leave 영구 잠김` : '') +
          (unitsBad ? ` — 🚨 유닛 불변식 깨짐: total ${f.total_units} ≠ 회원합 ${f.members_units}` : ''));
        // 운영 사실 안내(빨강 아님) — 며칠째 고객이 못 들어오고 못 나가는지 사람이 알아야 한다.
        if (!ghost && !unitsBad && f.join_leave_locked) {
          console.log(`     ↳ ⚠️ 열린 포지션 때문에 참여·회수 잠김 (${f.oldest_open_days}일째, P3 롤오버 게이트 — 설계된 동작).` +
            (f.oldest_open_days >= 7 ? ' 7일 초과 — 롤오버 계획 확인 권장.' : ''));
        }
      }
    }
  } catch (e) { console.log('  ⏭️  PAMM 점검 생략: ' + e.message); }

  // ── ③ 시세 라이브니스 (서버 prices — 크립토는 24/7이라 항상 신선해야) ──
  try {
    const q = () => fetch(`${URL}/rest/v1/prices?select=symbol,mid,updated_at&symbol=in.(BTC,ETH)`, { headers: H }).then(r => r.json());
    const probe = async () => { const t0 = await q(); await new Promise(r => setTimeout(r, 4000)); const t1 = await q();
      const age = Math.min(...t1.map(x => (Date.now() - Date.parse(x.updated_at)) / 1000));
      const moved = t1.some((x, i) => t0[i] && (x.updated_at !== t0[i].updated_at));
      return { age, moved, ok: age < 15 && moved }; };
    let p = await probe();
    if (!p.ok) { await new Promise(r => setTimeout(r, 6000)); p = await probe(); }   // 크론 틱 1회 늦은 블립 필터(2026-07-19 오탐)
    flag(!p.ok, `시세(크립토 서버): 신선도 ${p.age.toFixed(1)}s · 4s 내 갱신 ${p.moved ? '확인' : '없음'}` + (!p.ok ? ' — 펌프/크론 확인(재시도 후에도)' : ''));
  } catch (e) { flag(true, '시세 점검 실패: ' + e.message); }

  // ── ③b 주식 시세 라이브니스 (2026-07-27 사장님 지적 "하네스가 못 잡아?" — 크립토만 보던 구멍 폐쇄) ──
  //     장중(평일 13:35~19:55 UTC, NYSE 09:30~16:00 ET)에만 검사 — 장외 정지는 정상이라 오탐 금지.
  try {
    const nowD = new Date(); const dow = nowD.getUTCDay(); const mins = nowD.getUTCHours() * 60 + nowD.getUTCMinutes();
    const inMarket = dow >= 1 && dow <= 5 && mins >= (13 * 60 + 35) && mins <= (19 * 60 + 55);
    if (!inMarket) console.log('  ⏭️  주식 시세: 장외 시간 — 검사 생략 (정지가 정상)');
    else {
      const r = await fetch(`${URL}/rest/v1/prices?select=symbol,updated_at&symbol=in.(AAPL,NVDA,MSFT)`, { headers: H });
      const rows = await r.json();
      const age = Math.min(...rows.map((x) => (Date.now() - Date.parse(x.updated_at)) / 1000));
      flag(!(rows.length >= 3 && age < 120), `시세(주식 장중): ${rows.length}종 · 최신 ${isFinite(age) ? age.toFixed(0) : '?'}s 전` +
        ((rows.length >= 3 && age < 120) ? '' : ' — stock-stream/stock-prices 크론 확인'));
      // WS 폴백 퇴행 감지 (2026-07-31: stock-stream WS가 9일간 죽어 1분 폴백만 돌았는데 120s
      // 기준을 통과해 못 잡았음). WS 정상 = AAPL이 장중 수 초마다 갱신 → 20초 뒤에도 같은
      // updated_at이면 폴백-온리 의심. 경고만(폴백은 설계된 안전망 — 빨강 아님).
      if (rows.length >= 3 && age < 120) {
        const t0 = (rows.find((x) => x.symbol === 'AAPL') || {}).updated_at;
        await new Promise((res) => setTimeout(res, 20000));
        const r2 = await fetch(`${URL}/rest/v1/prices?select=updated_at&symbol=eq.AAPL`, { headers: H });
        const t1 = ((await r2.json())[0] || {}).updated_at;
        if (t0 && t1 && t0 === t1) console.log('  ⚠️  주식 WS 펌프 퇴행 의심 — AAPL 20초간 무갱신 (1분 폴백만 동작?). stock-stream 재배포 검토');
      }
    }
  } catch (e) { flag(true, '주식 시세 점검 실패: ' + e.message); }

  // ── ④ Odds API 쿼터 (2026-07-25 소진 사고의 사전 경보 — 90% 소진 = 🔴, 70% = ⚠️) ──
  try {
    const r = await fetch(`${URL}/rest/v1/api_usage?select=remaining,used,updated_at&provider=eq.odds_api`, { headers: H });
    const u = (await r.json())[0];
    if (!u) flag(false, '배당 쿼터: api_usage 행 없음 (크론 첫 보고 대기)');
    else {
      const total = (+u.remaining || 0) + (+u.used || 0);
      const pct = total > 0 ? Math.round((+u.used || 0) / total * 100) : 0;
      const line = `배당 쿼터(Odds API): 사용 ${pct}% · 잔량 ${(+u.remaining || 0).toLocaleString()}`;
      if (pct >= 90) flag(true, line + ' — 소진 임박! 플랜/폴링 확인');
      else flag(false, line + (pct >= 70 ? ' ⚠️ 70% 초과 — 추이 주시' : ''));
    }
  } catch (e) { flag(true, '배당 쿼터 점검 실패: ' + e.message); }

  // ── ⑤ 고객 체감속도 (RUM p95 — P2 관측성. 뷰 미배포면 조용히 생략) ──
  try {
    const r = await fetch(`${URL}/rest/v1/rum_stats?select=page,n,p95_app&order=n.desc&limit=5`, { headers: H });
    if (!r.ok) console.log('  ⏭️  체감속도(RUM): rum_stats 뷰 미배포 — SQL 실행 대기');
    else {
      const rows = await r.json();
      if (!rows.length) console.log('  ⏭️  체감속도(RUM): 아직 수집 데이터 없음');
      else {
        const slow = rows.filter((x) => +x.p95_app > 4000);
        flag(slow.length > 0, '체감속도 p95: ' + rows.map((x) => `${String(x.page).replace('.html', '')} ${x.p95_app ? (x.p95_app / 1000).toFixed(1) + 's' : '—'}(${x.n})`).join(' · ') +
          (slow.length ? ' — 4s 초과 페이지 있음! 퇴행 추적' : ''));
      }
    }
  } catch (e) { console.log('  ⏭️  체감속도(RUM) 점검 생략: ' + e.message); }

  console.log(red ? `\n🔴 자가검진: ${red}건 이상 — 원인 추적 후 보고할 것` : '\n🟢 자가검진 전부 정상');
  process.exit(red ? 1 : 0);
})().catch(e => { console.error('🔴 자가검진 크래시: ' + e.message); process.exit(1); });
