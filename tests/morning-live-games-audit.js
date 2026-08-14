#!/usr/bin/env node
// 아침 점검 보조 — live_games(id=all) 를 **오늘/내일(라스베가스 기준)** 로 잘라 3가지를 본다.
//   ① 경기 수가 캘린더 상식과 맞나 (시즌/브레이크/대회 일정)
//   ② 실배당 경기의 오즈 새너티 — 암시확률 합(overround) 100~110% 범위, 극단 배당 없음
//   ③ 잠금(oddsReal:false) 경기가 **전부 베팅 불가**인가 (data-am 근거가 되는 가격이 안 실렸는지)
// 전부 읽기 전용. 돈/쓰기 0.
'use strict';
const URL = 'https://grxnbgtfnaayeluenvqh.supabase.co';
const KEY = 'sb_publishable_ow1DihBdAAvNtnb1H0Kojw_7vbeMKFu';

// 라스베가스(PDT, UTC-7) 기준 날짜 문자열
const vegasYMD = (t) => new Date(t - 7 * 3600e3).toISOString().slice(0, 10);
const NOW = Date.now();
const TODAY = vegasYMD(NOW);
const TOMORROW = vegasYMD(NOW + 86400e3);

const amToProb = (am) => { const a = +am; if (!isFinite(a) || a === 0) return null;
  return a > 0 ? 100 / (a + 100) : (-a) / ((-a) + 100); };

(async () => {
  let rows;
  try {
    const r = await fetch(`${URL}/rest/v1/live_games?id=eq.all&select=data,updated_at`,
      { headers: { apikey: KEY, Authorization: 'Bearer ' + KEY } });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    rows = await r.json();
  } catch (e) {
    console.log('⏭️  SKIP — live_games 조회 실패(네트워크/정책): ' + e.message);
    process.exit(0);
  }
  const row = rows && rows[0];
  if (!row) { console.log('🔴 live_games(id=all) 행이 없다'); process.exit(1); }
  const games = Array.isArray(row.data) ? row.data : (row.data && row.data.games) || [];
  const ageMin = Math.round((NOW - new Date(row.updated_at).getTime()) / 60000);
  console.log(`live_games ${games.length}개 · ${ageMin}분 전 갱신 · 베가스 오늘=${TODAY} 내일=${TOMORROW}\n`);

  // 실제 스키마: 킥오프=iso · 팀=away/home{ab,nm} · 가격=ml/spread/total/threeWay/outright 배열
  const pick = (ymd) => games.filter((g) => g.iso && vegasYMD(new Date(g.iso).getTime()) === ymd);
  const nameOf = (g) => `${g.lg} ${(g.away && (g.away.ab || g.away.nm)) || '?'}@${(g.home && (g.home.ab || g.home.nm)) || '?'}`;
  let fail = 0;
  const bad = (m) => { console.log('🔴 ' + m); fail++; };
  const warn = (m) => { console.log('⚠️  ' + m); };

  for (const [label, ymd] of [['오늘', TODAY], ['내일', TOMORROW]]) {
    const gs = pick(ymd);
    const byLg = {};
    gs.forEach((g) => { (byLg[g.lg] = byLg[g.lg] || []).push(g); });
    const parts = Object.keys(byLg).sort().map((k) => `${k} ${byLg[k].length}`).join(' · ');
    console.log(`── ${label} (${ymd}) — 총 ${gs.length}경기  [${parts || '없음'}]`);

    for (const lg of Object.keys(byLg).sort()) {
      const list = byLg[lg];
      const real = list.filter((g) => g.oddsReal === true);
      const locked = list.filter((g) => g.oddsReal === false);
      console.log(`   ${lg}: 실배당 ${real.length} · 잠금 ${locked.length}`);

      // ② 실배당 오즈 새너티
      for (const g of real) {
        const nm = nameOf(g);
        if (lg === 'GOLF') {
          const oc = g.outright || [];
          if (oc.length < 2) bad(`${nm}: oddsReal=true 인데 outright ${oc.length}개`);
          const wild = oc.filter((o) => amToProb(o.am) == null);
          if (wild.length) bad(`${nm}: outright 배당 파싱 불가 ${wild.length}건`);
          continue;
        }
        // 승/무/패(축구) 또는 머니라인(2-way) 의 암시확률 합
        const three = g.threeWay || [];
        const legs = three.length ? three.map((x) => x.am) : (g.ml || []).map((x) => x.am);
        if (!legs.length) { bad(`${nm}: oddsReal=true 인데 가격이 없다`); continue; }
        const ps = legs.map(amToProb);
        if (ps.some((p) => p == null)) { bad(`${nm}: 배당 파싱 불가 ${JSON.stringify(legs)}`); continue; }
        const sum = ps.reduce((a, b) => a + b, 0) * 100;
        const lo = legs.length >= 3 ? 100 : 100, hi = legs.length >= 3 ? 115 : 112;
        if (sum < lo - 0.5 || sum > hi)
          bad(`${nm}: 오버라운드 ${sum.toFixed(1)}% (정상 ${lo}~${hi}%) — ${JSON.stringify(legs)}`);
        const extreme = legs.filter((am) => Math.abs(+am) > 100000 || Math.abs(+am) < 100);
        if (extreme.length) bad(`${nm}: 극단/비정상 배당 ${JSON.stringify(extreme)}`);
      }

      // ③ 잠금 경기는 가격이 실려 있으면 안 된다 (클라가 data-am 을 붙일 근거가 생김)
      for (const g of locked) {
        const nm = nameOf(g);
        const three = (g.threeWay || []).map((x) => x.am);
        const ml = (g.ml || []).map((x) => x.am);
        const oc = (g.outright || []).length;
        if (three.length || ml.length || oc)
          bad(`${nm}: 잠금(oddsReal=false) 인데 가격이 실려 있다 — threeWay ${three.length} · ml ${ml.length} · outright ${oc}`);
      }
    }
    console.log('');
  }

  // ① 캘린더 상식 — 8월 중순 기준
  const t = pick(TODAY), all = [...t, ...pick(TOMORROW)];
  const cnt = (lg) => all.filter((g) => g.lg === lg).length;
  const mon = +TODAY.slice(5, 7);
  if (mon >= 4 && mon <= 9 && cnt('MLB') === 0) bad('MLB 정규시즌(4~9월)인데 오늘/내일 경기 0 — 피드 누락 의심');
  if (mon === 8 && cnt('NFL') === 0) warn('NFL 프리시즌 기간인데 오늘/내일 0경기 (일정상 정상일 수 있음)');
  if (cnt('MLB') > 0 && cnt('MLB') < 6) warn(`MLB 오늘+내일 ${cnt('MLB')}경기 — 통상 하루 10~15경기라 적다(올스타 브레이크/우천 아니면 확인)`);

  console.log(fail ? `\n🔴 FAIL — ${fail}건` : '\n🟢 오늘/내일 스케줄·오즈 새너티 이상 없음');
  process.exit(fail ? 1 : 0);
})();
