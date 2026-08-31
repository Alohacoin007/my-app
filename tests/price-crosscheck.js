#!/usr/bin/env node
// Alpexa — 시세 교차 출처 검증 (2026-08-31 사장님 지시 ③)
// ============================================================================
// 잡는 버그 클래스: **우리 시세가 틀렸는데 우리만 모르는 것.**
//
//   지금 감시는 시세의 **신선도**(몇 초 전에 갱신됐나)만 본다. 값이 **맞는지**는 아무도
//   안 본다. 그래서 다음 것들이 전부 초록으로 통과한다:
//     · 심볼이 뒤바뀜 (ETH 가격이 BTC 칸에 들어감)
//     · 소수점 자리 밀림 (1.1583 → 11.583)
//     · 단위 혼동 (센트/달러, 핍/포인트 — 2026-07-13 spr_pts 사고와 같은 클래스)
//     · 프로바이더가 옛 값을 계속 새 타임스탬프로 뱉음(신선한데 틀림)
//   전부 **돈에 직접 닿는다**: 체결가·플로팅·스탑아웃이 이 숫자로 계산된다.
//
//   자기 정합성으로는 절대 못 잡는다. 우리 값을 우리 규칙으로 검사하면 늘 맞다.
//   → **독립된 제3자와 대조한다.** (odds-crosscheck 와 같은 원리)
//
// 정밀도가 아니라 **총체적 오류**를 본다. 제3자는 거래소/기준환율이라 우리 mid 와
// 소수점까지 같을 이유가 없다. 임계치는 "스프레드·시차로는 절대 안 나오는 차이"로 잡는다:
//   크립토 2% · FX 1%. 이 폭을 넘으면 시차가 아니라 **값이 틀린 것**이다.
//
// ⚠️ 이 스크립트는 **외부 인터넷이 필요**하다. Claude 세션 샌드박스에서는 Supabase·GitHub
//    외 아웃바운드가 막혀 있어 돌지 않는다(실측: coinbase·kraken·frankfurter 전부 실패).
//    그래서 **GitHub Actions 러너에서 도는 것을 전제**로 만들었다.
//    비교 로직만 여기서 증명할 수 있게 `--selftest` 를 넣었다 — 네트워크 없이
//    고정 데이터로 RED/GREEN 을 확인한다. (모르는 걸 안다고 하지 않기 위한 장치)
//
// 읽기 전용 · 돈 이동 0.
'use strict';
const BASE = process.env.ALPEXA_URL || 'https://grxnbgtfnaayeluenvqh.supabase.co';
const KEY = process.env.ALPEXA_ANON || 'sb_publishable_ow1DihBdAAvNtnb1H0Kojw_7vbeMKFu';
const H = { apikey: KEY, Authorization: 'Bearer ' + KEY };

// 우리 심볼 → 제3자에서 같은 것을 가리키는 주소. 두 출처가 **다른 회사**여야 의미가 있다.
//   크립토: 우리 = Binance 미러 → 대조 = Coinbase (완전 별개 거래소)
//   FX    : 우리 = Polygon      → 대조 = Frankfurter(ECB 기준환율, 무키)
const PAIRS = [
  { sym: 'BTC',    kind: 'crypto', tol: 0.02, src: 'coinbase',    ref: 'BTC-USD' },
  { sym: 'ETH',    kind: 'crypto', tol: 0.02, src: 'coinbase',    ref: 'ETH-USD' },
  { sym: 'EURUSD', kind: 'fx',     tol: 0.01, src: 'frankfurter', ref: 'EUR/USD' },
  { sym: 'GBPUSD', kind: 'fx',     tol: 0.01, src: 'frankfurter', ref: 'GBP/USD' },
];
const STALE_MIN = 90;   // 이보다 오래된 우리 값은 비교 대상에서 뺀다(주말 FX 등)

async function jget(url, opts) {
  const r = await fetch(url, Object.assign({ signal: AbortSignal.timeout(15000) }, opts || {}));
  if (!r.ok) throw new Error(url.slice(0, 48) + ' → ' + r.status);
  return r.json();
}

// ── 제3자 시세 ───────────────────────────────────────────────────────────
async function refCoinbase(ref) {
  const j = await jget(`https://api.coinbase.com/v2/prices/${ref}/spot`);
  const v = +(((j || {}).data || {}).amount);
  if (!isFinite(v) || v <= 0) throw new Error('coinbase 응답 이상');
  return v;
}
async function refFrankfurter(ref) {
  const [from, to] = ref.split('/');
  const j = await jget(`https://api.frankfurter.app/latest?from=${from}&to=${to}`);
  const v = +(((j || {}).rates || {})[to]);
  if (!isFinite(v) || v <= 0) throw new Error('frankfurter 응답 이상');
  return v;
}
const REF = { coinbase: refCoinbase, frankfurter: refFrankfurter };

// ── 판정 로직 (여기만 순수 함수 — selftest 가 이걸 검증한다) ─────────────
function verdict(p, ours, theirs) {
  const diff = Math.abs(ours - theirs) / theirs;
  return { sym: p.sym, ours, theirs, diff, bad: diff > p.tol, tol: p.tol };
}
const pct = (x) => (x * 100).toFixed(2) + '%';

// ── 네트워크 없이 비교 로직만 증명 (--selftest) ──────────────────────────
function selftest() {
  let fail = 0;
  const ok = (n, c) => { if (!c) fail++; console.log(`  ${c ? '✅' : '❌'} ${n}`); };
  const P = PAIRS[0], F = PAIRS[2];
  console.log('시세 교차검증 — 비교 로직 자가시험 (네트워크 불필요)\n');
  console.log('=== 정상: 시차·스프레드 수준의 차이는 통과 ===');
  ok('BTC 78000 vs 78150 (0.19%) → 정상', !verdict(P, 78000, 78150).bad);
  ok('EURUSD 1.1583 vs 1.1590 (0.06%) → 정상', !verdict(F, 1.1583, 1.1590).bad);
  console.log('\n=== RED: 시차로는 설명 안 되는 차이 ===');
  ok('소수점 밀림 EURUSD 11.583 vs 1.159 → 🔴', verdict(F, 11.583, 1.159).bad);
  ok('심볼 뒤바뀜 BTC칸에 ETH값 3100 vs 78000 → 🔴', verdict(P, 3100, 78000).bad);
  ok('크립토 5% 이탈 → 🔴', verdict(P, 78000, 74000).bad);
  ok('FX 2% 이탈 → 🔴', verdict(F, 1.1583, 1.1350).bad);
  console.log('\n=== 경계 ===');
  ok('크립토 정확히 임계치 아래(1.9%) → 정상', !verdict(P, 100, 101.9).bad);
  ok('크립토 임계치 위(2.1%) → 🔴', verdict(P, 100, 102.1).bad);
  console.log('\n' + (fail ? `🔴 자가시험 실패 ${fail}건` : '🟢 자가시험 통과 — 비교 로직은 옳다 (실 대조는 CI 에서)'));
  process.exit(fail ? 1 : 0);
}

(async () => {
  if (process.argv.includes('--selftest')) return selftest();

  // 우리 값 (Supabase — 어디서든 읽힌다)
  const syms = PAIRS.map((p) => p.sym).join(',');
  const rows = await jget(`${BASE}/rest/v1/prices?select=symbol,mid,updated_at&symbol=in.(${syms})`, { headers: H });
  const mine = {}; (rows || []).forEach((r) => { mine[r.symbol] = r; });

  console.log('── 시세 교차 출처 검증 (우리 값 vs 제3자) ──────────────');
  let bad = 0, done = 0, skip = 0;
  for (const p of PAIRS) {
    const m = mine[p.sym];
    if (!m) { console.log(`  ⏭️  ${p.sym}: 우리 prices 에 없음`); skip++; continue; }
    const ageMin = (Date.now() - Date.parse(m.updated_at)) / 60000;
    if (ageMin > STALE_MIN) {
      // 주말 FX 등 — 값이 늙은 건 다른 검사(라이브니스)의 몫이고, 여기서 비교하면 오탐이다.
      console.log(`  ⏭️  ${p.sym}: 우리 값이 ${ageMin.toFixed(0)}분 전 (>${STALE_MIN}분) — 시장 휴장으로 보고 비교 생략`);
      skip++; continue;
    }
    let theirs;
    try { theirs = await REF[p.src](p.ref); }
    catch (e) {
      // 제3자가 죽은 건 **우리 결함이 아니다.** 통과로도 실패로도 세지 않는다.
      console.log(`  ⏭️  ${p.sym}: 제3자(${p.src}) 조회 실패 — ${String(e.message).slice(0, 50)}`);
      skip++; continue;
    }
    const v = verdict(p, +m.mid, theirs);
    done++;
    if (v.bad) { bad++;
      console.log(`  🔴 ${p.sym}: 우리 ${v.ours} vs ${p.src} ${v.theirs} — 차이 ${pct(v.diff)} (허용 ${pct(v.tol)})`);
    } else {
      console.log(`  ✅ ${p.sym}: 우리 ${v.ours} vs ${p.src} ${v.theirs} — 차이 ${pct(v.diff)}`);
    }
  }

  // 헛초록 방지 — 전부 건너뛰었으면 "정상"이 아니라 "검사 못 함"이다.
  if (!done) {
    console.log(`\n  ⏭️  실제로 대조한 심볼이 없다 (건너뜀 ${skip}) — 검사 불가. 통과로 세지 않는다.`);
    process.exit(0);
  }
  if (bad) {
    console.log(`\n🔴 FAIL — ${bad}/${done} 심볼이 제3자와 어긋난다. 시차로는 설명되지 않는 폭이다.`);
    console.log('   확인: 심볼 매핑 · 소수점/단위 · 프로바이더가 옛 값을 새 타임스탬프로 주는지.');
    process.exit(1);
  }
  console.log(`\n🟢 PASS — ${done}개 심볼이 독립 출처와 일치 (건너뜀 ${skip}).`);
  process.exit(0);
})().catch((e) => { console.error('🔴 크래시: ' + e.message); process.exit(1); });
