#!/usr/bin/env node
// Alpexa — 일일 자가검진 (2026-07-19 사장님 지시: "알림은 사후 — 니가 매일 자체 확인해라")
//
// 아침·저녁 루틴이 이 한 방으로 돈다. 커버(사장님 지정 4종 + 시세):
//   ① 스케줄·오즈 — 오늘/내일 경기 수, 실배당/잠금, 가짜라인 노출 여부 (live_games)
//   ② 주문·결제·미청산 — sports-audit(C1~C9) verdict + 미정산 건수/최대 노출/홀드
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
    flag(ageMin > 10, `피드 신선도: live_games ${all.length}경기 · ${ageMin}분 전 갱신` + (ageMin > 10 ? ' — 크론 확인 필요' : ''));
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

  console.log(red ? `\n🔴 자가검진: ${red}건 이상 — 원인 추적 후 보고할 것` : '\n🟢 자가검진 전부 정상');
  process.exit(red ? 1 : 0);
})().catch(e => { console.error('🔴 자가검진 크래시: ' + e.message); process.exit(1); });
