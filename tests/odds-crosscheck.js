#!/usr/bin/env node
// Alpexa — 잠긴 경기 교차 검증 (2026-08-31 사장님 "왜 자꾸 문제가 생겨, 하네스가 못 잡아?")
// ============================================================================
// 왜 만드나 — 8/28 사고의 재발 방지가 아니라 **그 클래스 전체**를 닫기 위해서다.
//
//   그날 간판 축구(맨시티·리버풀·토트넘·맨유)가 시즌 내내 잠겨 있었다. 프로바이더에는
//   라인이 **있었는데** 우리 매처가 ESPN 약어("Man City" vs "Manchester City")를 못 넘은
//   것이었다. 그런데 자가검진도 feed-check 도 계속 🟢 였다 — 두 검사 모두
//   **"잠김 = 프로바이더가 라인을 안 냈다"고 가정**하고 잠긴 수를 세기만 했기 때문이다.
//   즉 검사와 버그가 **같은 착각을 공유**했다. 내가 그렇게 믿고 검사를 짰으니
//   내 착각은 영원히 초록으로 보인다.
//
// 그래서 이 검사는 **자기 정합성이 아니라 교차 출처**로 본다:
//   "잠긴 경기가 있다 → 그 시간대에 프로바이더가 **실제로** 경기를 갖고 있나?"
//     · 없다 → 진짜 공백 (정상, 조용히 넘어간다)
//     · 있다 → **우리 매칭 실패** 🔴
//
// 🔑 핵심 설계 — **팀 이름 매칭을 쓰지 않는다.**
//   production 의 teamMatch 로 대조하면 정의상 프로덕션과 항상 같은 답이 나온다
//   (같은 눈으로 두 번 보는 것 = 검사가 아니다). 대신 **킥오프 시각과 개수**라는,
//   이름과 완전히 독립인 신호만 쓴다:
//     ① 우리가 실배당을 붙인 경기들이 소비한 프로바이더 이벤트를 먼저 뺀다
//     ② 남은(=아무도 안 가져간) 프로바이더 이벤트를 모은다
//     ③ 잠긴 경기의 킥오프 ±15분에 그 잔여 이벤트가 있으면 → 붙일 게 있었는데 못 붙인 것
//   이름이 어떻게 생겼든(약어·악센트·리그 개편·신규 종목) 전부 이 그물에 걸린다.
//
// 네트워크 필요 (수동/크론). verify 게이트에는 넣지 않는다 — verify 는 오프라인·결정적이어야
// 하고, 이 검사는 외부 피드 상태에 따라 정당하게 달라진다. 아침 점검에서 돌린다.
// 읽기 전용 · 돈 이동 0.
// ============================================================================
'use strict';
const BASE = process.env.ALPEXA_URL || 'https://grxnbgtfnaayeluenvqh.supabase.co';
const KEY = process.env.ALPEXA_ANON || 'sb_publishable_ow1DihBdAAvNtnb1H0Kojw_7vbeMKFu';
const H = { apikey: KEY, Authorization: 'Bearer ' + KEY };

// 리그 → 오즈 키. sports-games 의 ODDS_SPORT/ODDS_EXTRA 와 같은 지도를 쓴다.
// (여기서 갈리면 검사가 엉뚱한 풀을 본다 — 아래 락스텝 경고 참조.)
const POOL = {
  NFL: ['americanfootball_nfl', 'americanfootball_nfl_preseason'],
  NBA: ['basketball_nba'],
  NCAAB: ['basketball_ncaab'],
  MLB: ['baseball_mlb'],
  NHL: ['icehockey_nhl'],
  // 축구는 대회별로 키가 갈리지만 lg 는 전부 SOC → soccer_* 전부 합친다 (프로덕션과 동일).
  SOC: ['__soccer_all__'],
};
const SLOT_MS = 15 * 60 * 1000;    // 킥오프 ±15분 = "같은 경기 슬롯"
const HORIZON_DAYS = 7;            // 이 창 밖은 프로바이더가 아직 안 열어도 정상

// 프로덕션 매처(부분집합+별칭)를 **소비 계산에만** 쓴다 — 판정에는 쓰지 않는다.
// 여기 목적은 "실배당이 붙은 경기가 어느 이벤트를 가져갔나"를 알아내는 것뿐이다.
const NAME_ALIAS = [
  [/\bman city\b/, 'manchester city'], [/\bman (?:united|utd)\b/, 'manchester united'],
  [/\bnottm forest\b/, 'nottingham forest'], [/\bspurs\b/, 'tottenham hotspur'],
  [/\bwolves\b/, 'wolverhampton wanderers'], [/\bsheff (?:utd|united)\b/, 'sheffield united'],
  [/\bsheff wed\b/, 'sheffield wednesday'], [/\bwest brom\b/, 'west bromwich albion'],
  [/\blafc\b/, 'los angeles'], [/\bnycfc\b/, 'new york city'],
  [/\b(?:red bull ny|ny red bulls?)\b/, 'new york red bulls'],
  [/\bpsg\b/, 'saint germain'],
];
const nb = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const sc = (s) => s.replace(/\b(fc|sc|cf|afc|ac|sd|cd)\b/g, ' ').replace(/\s+/g, ' ').trim();
function variants(s) {
  const b = nb(s), out = [sc(b)];
  for (const [re, to] of NAME_ALIAS) if (re.test(b)) { const v = sc(b.replace(re, to)); if (v && !out.includes(v)) out.push(v); }
  return out.map((v) => v.split(' ').filter((t) => t.length > 2)).filter((t) => t.length > 0);
}
function teamMatch(a, b) {
  for (const A of variants(a)) for (const B of variants(b)) {
    const [s, l] = A.length <= B.length ? [A, B] : [B, A];
    if (s.every((t) => l.includes(t))) return true;
  }
  return false;
}

const fmtT = (ms) => new Date(ms).toISOString().replace('T', ' ').slice(0, 16) + 'Z';

(async () => {
  const lg = await (await fetch(`${BASE}/rest/v1/live_games?id=eq.all&select=data,updated_at`, { headers: H })).json();
  const games = (lg[0] && lg[0].data) || [];
  const od = await (await fetch(`${BASE}/rest/v1/sports_odds?select=sport,data`, { headers: H })).json();
  const bySport = {};
  for (const r of od) if (r.sport !== '__sports_list') bySport[r.sport] = r.data || [];
  const soccerAll = Object.keys(bySport).filter((k) => k.startsWith('soccer_'))
    .reduce((a, k) => a.concat(bySport[k]), []);

  console.log('── 잠긴 경기 교차 검증 (프로바이더가 정말 없나?) ──────────');
  console.log(`  live_games ${games.length}경기 · 오즈 리그 ${Object.keys(bySport).length}개 · 창 ${HORIZON_DAYS}일 · 슬롯 ±15분`);

  const now = Date.now(), horizon = now + HORIZON_DAYS * 86400000;
  const suspects = [], byLg = {};

  for (const league of Object.keys(POOL)) {
    const pool = POOL[league][0] === '__soccer_all__'
      ? soccerAll
      : POOL[league].reduce((a, k) => a.concat(bySport[k] || []), []);
    if (!pool.length) continue;

    const mine = games.filter((g) => g.lg === league).filter((g) => {
      const t = Date.parse(g.iso || ''); return isFinite(t) && t >= now - 3600e3 && t <= horizon;
    });
    if (!mine.length) continue;

    // ① 실배당이 붙은 경기가 소비한 프로바이더 이벤트를 표시한다.
    const consumed = new Set();
    for (const g of mine) {
      if (g.oddsReal !== true) continue;
      const gt = Date.parse(g.iso);
      for (let i = 0; i < pool.length; i++) {
        const e = pool[i], et = Date.parse(e.commence_time || '');
        if (!isFinite(et) || Math.abs(et - gt) > 6 * 3600e3) continue;
        if ((teamMatch(e.home_team, g.home.nm) && teamMatch(e.away_team, g.away.nm)) ||
            (teamMatch(e.home_team, g.away.nm) && teamMatch(e.away_team, g.home.nm))) { consumed.add(i); break; }
      }
    }

    // ② 아무도 안 가져간 프로바이더 이벤트 (= 붙일 수 있었던 라인)
    const leftover = pool.map((e, i) => ({ e, i, t: Date.parse(e.commence_time || '') }))
      .filter((x) => !consumed.has(x.i) && isFinite(x.t) && x.t >= now - 3600e3 && x.t <= horizon);

    // ③ 잠긴 경기의 킥오프 슬롯에 잔여 이벤트가 있으면 = 있는데 못 붙인 것
    const locked = mine.filter((g) => g.oddsReal !== true);
    let hit = 0;
    for (const g of locked) {
      const gt = Date.parse(g.iso);
      const near = leftover.filter((x) => Math.abs(x.t - gt) <= SLOT_MS);
      if (!near.length) continue;   // 프로바이더도 그 시간대에 없다 → 진짜 공백 (정상)
      hit++;
      suspects.push({
        lg: league, when: fmtT(gt),
        ours: `${g.away.nm} @ ${g.home.nm}`,
        theirs: near.map((x) => `${x.e.away_team} @ ${x.e.home_team}`).join('  |  '),
        gid: g.gid,
      });
    }
    byLg[league] = { games: mine.length, locked: locked.length, leftover: leftover.length, suspect: hit };
  }

  console.log('');
  console.log('  리그    경기  잠금  미소비라인  의심');
  for (const [k, v] of Object.entries(byLg))
    console.log(`  ${k.padEnd(6)} ${String(v.games).padStart(4)} ${String(v.locked).padStart(5)} ${String(v.leftover).padStart(11)} ${String(v.suspect).padStart(5)}${v.suspect ? '  🔴' : ''}`);

  if (!suspects.length) {
    console.log('\n  🟢 이상 없음 — 잠긴 경기는 프로바이더도 갖고 있지 않다 (진짜 공백).');
    process.exit(0);
  }
  console.log(`\n  🔴 매칭 실패 의심 ${suspects.length}건 — 프로바이더에 같은 슬롯의 라인이 남아 있다:`);
  for (const s of suspects) {
    console.log(`     [${s.lg}] ${s.when}  ${s.gid}`);
    console.log(`        우리(잠김) : ${s.ours}`);
    console.log(`        프로바이더 : ${s.theirs}`);
  }
  console.log('\n  → 이름 표기 차이로 못 붙이고 있을 가능성이 높다. sports-games 의 teamMatch/별칭을 보라.');
  console.log('     (진짜로 다른 경기라면 이 검사가 오탐이다 — 그 경우 슬롯 폭이나 리그 지도를 조정할 것.)');
  process.exit(1);
})().catch((e) => { console.error('🔴 크래시: ' + e.message); process.exit(1); });
