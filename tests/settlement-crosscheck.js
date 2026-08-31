#!/usr/bin/env node
// Alpexa — 정산 교차 출처 검증 (2026-08-31 사장님 지시 ③b)
// ============================================================================
// 잡는 버그 클래스: **우리가 잘못 채점했는데 우리만 모르는 것.**
//
//   지금 돈 감사(C1~C9)는 전부 **자기 정합성**이다 — "지급액이 배당과 맞나", "스테이크가
//   차감됐나", "이중지급 없나". 전부 중요하지만 한 가지를 절대 못 본다:
//   **"이긴 팀이 진짜 이긴 팀이 맞나."**
//   우리 채점기가 틀리면(팀 매칭 실수, 홈/원정 뒤바뀜, 연장 처리, 총점 경계) 장부는
//   완벽하게 앞뒤가 맞는 채로 **틀린 사람에게 돈이 나간다.** 감사는 영원히 초록이다.
//
//   → 유일한 해법은 **바깥의 진실과 대조**하는 것. 최종 스코어를 ESPN 에서 독립적으로
//     가져와, **여기서 새로 쓴 채점 로직**으로 다시 채점하고 우리 결과와 맞춰본다.
//
// 🔑 설계 규칙 — **sports-settle 의 gradeLeg 를 재사용하지 않는다.**
//   같은 코드로 두 번 채점하면 정의상 항상 일치한다(같은 눈으로 두 번 보기 = 검사 아님).
//   여기 채점은 처음부터 다시 썼고, **애매한 것은 채점하지 않고 건너뛴다**:
//     채점함  : 머니라인("<팀> ML") · 총점("Over/Under N") · 무승부("Draw")
//     건너뜀  : 스프레드(푸시 규칙) · 골프 아웃라이트 · 결과 없음/보류/보이드
//   건너뛴 건 **통과로 세지 않는다** — 모르면 모른다고 한다.
//
// ⚠️ 네트워크: ESPN + Supabase 가 필요하고, settlements 는 RLS 로 잠겨 있어
//    **service_role 키**가 있어야 읽힌다. Claude 세션 샌드박스는 ESPN 아웃바운드가
//    막혀 있어 여기서 실주행이 안 된다 → GitHub Actions 에서 돈다.
//    채점 로직만 `--selftest` 로 오프라인 증명한다.
//
// 읽기 전용 · 돈 이동 0 · 개인정보 출력 0 (계좌번호·이름 안 찍는다).
'use strict';
const BASE = process.env.ALPEXA_URL || 'https://grxnbgtfnaayeluenvqh.supabase.co';
const SVC = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const DAYS = +(process.env.CROSSCHECK_DAYS || 3);
const ESPN_UA = 'alpexa-feed/1.0';

// LG → ESPN 스코어보드 경로 (sports-games 의 LEAGUES 와 같은 지도).
// 이건 "어디서 최종 스코어를 가져오나"일 뿐, **채점 로직이 아니다.**
const PATHS = {
  NFL: ['football/nfl'], NBA: ['basketball/nba'], NCAAB: ['basketball/mens-college-basketball'],
  MLB: ['baseball/mlb'], NHL: ['hockey/nhl'],
  SOC: ['soccer/eng.1', 'soccer/uefa.champions', 'soccer/usa.1', 'soccer/fifa.world'],
};

// ── 독립 채점기 (여기가 핵심 — settle 코드를 보지 않고 규칙만 보고 새로 씀) ──
// game = { home:{nm,score}, away:{nm,score} }
// pick = "Yankees ML" | "Over 8.5" | "Under 8.5" | "Draw"
// 반환: 'won' | 'lost' | null(채점 안 함)
function gradeIndependently(game, pick) {
  const p = String(pick || '').trim();
  if (!p || !game) return null;
  // ⚠️ null/undefined 를 +로 바꾸면 **0 이 된다** — 스코어가 없는 경기를 "0점"으로 채점하면
  //    없는 사실로 돈 판정을 내리게 된다. 자가시험이 이 구멍을 잡았다(내 실수였다).
  const rawH = game.home.score, rawA = game.away.score;
  if (rawH === null || rawH === undefined || rawA === null || rawA === undefined) return null;
  const hs = +rawH, as = +rawA;
  if (!isFinite(hs) || !isFinite(as)) return null;

  const tot = p.match(/^(Over|Under)\s+([\d.]+)$/i);
  if (tot) {
    const line = +tot[2]; const sum = hs + as;
    if (!isFinite(line)) return null;
    if (sum === line) return null;                       // 푸시 — 승/패가 아니다, 채점 안 함
    const over = sum > line;
    return (/^over$/i.test(tot[1]) ? over : !over) ? 'won' : 'lost';
  }

  if (/^draw$/i.test(p)) return hs === as ? 'won' : 'lost';

  const ml = p.match(/^(.+?)\s+ML$/i);
  if (ml) {
    // 한 경기 안에 팀은 둘뿐이다 — 어느 쪽을 가리키는지 **유일하게** 정해질 때만 채점한다.
    const want = norm(ml[1]);
    const hitH = nameHit(want, game.home.nm), hitA = nameHit(want, game.away.nm);
    if (hitH === hitA) return null;                      // 둘 다 맞거나 둘 다 아니면 판정 불가
    if (hs === as) return null;                          // 무승부 — ML 규칙이 종목마다 달라 채점 안 함
    const pickedHome = hitH;
    return ((hs > as) === pickedHome) ? 'won' : 'lost';
  }
  return null;                                           // 스프레드·기타 = 채점 안 함
}
const norm = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
// 팀 지목: 한쪽 이름이 다른 쪽에 통째로 들어가면 히트 (경기 안 2팀 중 고르는 것뿐이라 충분).
function nameHit(want, teamNm) {
  const t = norm(teamNm);
  if (!want || !t) return false;
  return t === want || t.includes(want) || want.includes(t);
}

// ── 오프라인 자가시험 ────────────────────────────────────────────────────
function selftest() {
  let fail = 0;
  const ok = (n, c) => { if (!c) fail++; console.log(`  ${c ? '✅' : '❌'} ${n}`); };
  const G = { home: { nm: 'Yankees', score: 5 }, away: { nm: 'Red Sox', score: 3 } };
  const D = { home: { nm: 'Arsenal', score: 1 }, away: { nm: 'Chelsea', score: 1 } };
  console.log('정산 교차검증 — 독립 채점 로직 자가시험 (네트워크 불필요)\n');
  console.log('=== 머니라인 ===');
  ok('이긴 홈팀 ML → won',            gradeIndependently(G, 'Yankees ML') === 'won');
  ok('진 원정팀 ML → lost',           gradeIndependently(G, 'Red Sox ML') === 'lost');
  ok('무승부면 ML 채점 안 함(null)',   gradeIndependently(D, 'Arsenal ML') === null);
  ok('경기에 없는 팀 → 판정 불가',     gradeIndependently(G, 'Mets ML') === null);
  console.log('\n=== 총점 ===');
  ok('합 8 > 7.5 Over → won',         gradeIndependently(G, 'Over 7.5') === 'won');
  ok('합 8 > 7.5 Under → lost',       gradeIndependently(G, 'Under 7.5') === 'lost');
  ok('합 8 < 8.5 Under → won',        gradeIndependently(G, 'Under 8.5') === 'won');
  ok('푸시(합 8 = 8)는 채점 안 함',    gradeIndependently(G, 'Over 8') === null);
  console.log('\n=== 무승부 픽 ===');
  ok('1-1 Draw → won',                gradeIndependently(D, 'Draw') === 'won');
  ok('5-3 Draw → lost',               gradeIndependently(G, 'Draw') === 'lost');
  console.log('\n=== 채점 안 하는 것 (모르면 모른다고) ===');
  ok('스프레드는 건너뜀',              gradeIndependently(G, 'Yankees -1.5') === null);
  ok('스코어 없으면 건너뜀',           gradeIndependently({ home: { nm: 'A', score: null }, away: { nm: 'B', score: 1 } }, 'A ML') === null);
  console.log('\n' + (fail ? `🔴 자가시험 실패 ${fail}건` : '🟢 자가시험 통과 — 독립 채점 로직은 옳다 (실 대조는 CI 에서)'));
  process.exit(fail ? 1 : 0);
}

async function jget(u, h) {
  const r = await fetch(u, { headers: h || {}, signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error(u.slice(0, 50) + ' → ' + r.status);
  return r.json();
}

(async () => {
  if (process.argv.includes('--selftest')) return selftest();
  if (!SVC) { console.log('  ⏭️  SKIP — SUPABASE_SERVICE_ROLE_KEY 미설정 (settlements 는 RLS 로 잠겨 있다)'); process.exit(0); }
  const H = { apikey: SVC, Authorization: 'Bearer ' + SVC };

  const since = new Date(Date.now() - DAYS * 86400000).toISOString();
  const rows = await jget(
    `${BASE}/rest/v1/settlements?select=local_id,kind,detail,created_at&server=eq.sports` +
    `&kind=in.(bet_won,bet_lost)&created_at=gte.${since}&order=created_at.desc&limit=300`, H);

  console.log('── 정산 교차 출처 검증 (우리 채점 vs ESPN 최종 스코어) ──────');
  console.log(`  최근 ${DAYS}일 정산 ${rows.length}건`);
  if (!rows.length) { console.log('\n  ⏭️  대조할 정산이 없다 — 검사 불가(통과 아님).'); process.exit(0); }

  // 필요한 리그의 최종 스코어를 ESPN 에서 모은다 (정산일 ±1일 창).
  const need = new Set();
  const tickets = [];
  for (const r of rows) {
    let legs = [];
    try { legs = (JSON.parse(r.detail || '{}').legs) || []; } catch (_e) {}
    if (!legs.length) continue;
    legs.forEach((l) => { if (l.gid && l.lg) need.add(l.lg); });
    tickets.push({ id: r.local_id, kind: r.kind, at: r.created_at, legs });
  }
  const p2 = (n) => String(n).padStart(2, '0');
  const ymd = (d) => '' + d.getUTCFullYear() + p2(d.getUTCMonth() + 1) + p2(d.getUTCDate());
  const results = {};                                     // gid → {home,away}
  for (const lg of need) {
    for (const path of (PATHS[lg] || [])) {
      for (let back = 0; back <= DAYS + 1; back++) {
        const d = ymd(new Date(Date.now() - back * 86400000));
        try {
          const j = await jget(`https://site.api.espn.com/apis/site/v2/sports/${path}/scoreboard?dates=${d}`,
                               { 'User-Agent': ESPN_UA });
          for (const ev of (j.events || [])) {
            const st = ((ev.status || {}).type || {});
            if (st.state !== 'post') continue;             // 끝난 경기만이 진실이다
            const c = (ev.competitions || [])[0]; if (!c) continue;
            const h = (c.competitors || []).find((x) => x.homeAway === 'home');
            const a = (c.competitors || []).find((x) => x.homeAway === 'away');
            if (!h || !a) continue;
            results[lg + '_' + ev.id] = {
              home: { nm: (h.team || {}).shortDisplayName || (h.team || {}).name || '', score: +h.score },
              away: { nm: (a.team || {}).shortDisplayName || (a.team || {}).name || '', score: +a.score },
            };
          }
        } catch (_e) { /* 그 날짜가 없으면 다음 */ }
      }
    }
  }

  let checked = 0, mismatch = 0, skipped = 0;
  const bad = [];
  for (const t of tickets) {
    const verdicts = t.legs.map((l) => {
      const g = results[l.gid];
      if (!g) return null;                                 // 최종 스코어 못 구함 → 판정 불가
      if (l.r === 'void' || l.r === 'pending') return null; // 승패가 아닌 상태는 대상 아님
      return gradeIndependently(g, l.pk);
    });
    if (verdicts.some((v) => v === null)) { skipped++; continue; }   // 하나라도 모르면 티켓 전체를 건너뛴다
    checked++;
    // 티켓 규칙: 전 leg 승 → 당첨, 하나라도 패 → 낙첨 (팔레이·싱글 공통)
    const shouldWin = verdicts.every((v) => v === 'won');
    const weSaid = t.kind === 'bet_won';
    if (shouldWin !== weSaid) {
      mismatch++;
      bad.push({ id: t.id, ours: t.kind, indep: shouldWin ? 'bet_won' : 'bet_lost',
                 legs: t.legs.map((l, i) => `${l.pk} [${l.gid}] 우리:${l.r} 독립:${verdicts[i]}`) });
    }
  }

  console.log(`  독립 채점 성공 ${checked}건 · 판정 불가 ${skipped}건(스프레드·결과없음·보이드 등)`);
  if (!checked) { console.log('\n  ⏭️  실제로 대조한 티켓이 없다 — 검사 불가(통과 아님).'); process.exit(0); }
  if (mismatch) {
    console.log(`\n🔴 FAIL — ${mismatch}/${checked} 티켓의 채점이 ESPN 최종 스코어와 어긋난다:`);
    bad.slice(0, 10).forEach((b) => {
      console.log(`   티켓 ${b.id}: 우리 ${b.ours} vs 독립 ${b.indep}`);
      b.legs.forEach((s) => console.log(`      · ${s}`));
    });
    console.log('\n  → 돈이 잘못 나갔을 수 있다. sports-settle 의 gradeLeg·팀매칭·최종판정을 소스부터 볼 것.');
    process.exit(1);
  }
  console.log(`\n🟢 PASS — ${checked}건 전부 ESPN 최종 스코어와 일치 (판정 불가 ${skipped}건은 통과로 세지 않음).`);
  process.exit(0);
})().catch((e) => { console.error('🔴 크래시: ' + e.message); process.exit(1); });
