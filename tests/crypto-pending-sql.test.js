#!/usr/bin/env node
// Alpexa — 크립토 지정가·스탑 주문 SQL 을 **실제 Postgres 에서 실행**해 증명한다 (2026-11-17 사장님 "크립토 지정가 진행해")
// ============================================================================
// 대상: supabase/sql/crypto_pending.sql (+ 선행 crypto_trade.sql). 내장 Postgres(PGlite, WASM)로 실제로 돌린다 — 추측 아님.
// 증명하는 것:
//   A. 시장가는 그대로다 — 옛 crypto_trade 와 새 crypto_trade(얇은 래퍼 + 코어)를 같은 시나리오로 돌려
//      호출마다의 응답 · 최종 잔고(crypto_holdings) · 체결 기록(crypto_trades)이 전부 같다.
//   B. 배포 전 가드 — 배포된 crypto_trade 가 리포와 다르면 멈추고 아무것도 만들지 않는다. 재실행은 통과한다.
//   C. 접수 — 방향 검증 4종 · 멱등(같은 id 두 번 = 한 건) · 남의 계좌 거절 · 낡은 시세 거절 · 20건 상한 · 돈은 안 움직인다.
//   D. 체결 — 트리거 4종 · 체결 결과 = 같은 가격의 시장가와 동일 · 주문 id = 체결 ref · 두 번 체결 불가 ·
//             잔고 부족 = rejected(사유) · 낡은 시세 = 건너뜀(pending 유지) · SELL 은 코인 수량 그대로.
//   E. 취소 — 본인 pending 만 · 체결된 주문은 취소 불가 · 취소된 주문은 체결되지 않는다.
//   F. 권한 — 앱(authenticated)은 테이블에 못 쓰고 · 코어와 스윕을 직접 못 부르고 · 남의 주문을 못 본다.
// PGlite 가 없으면 정적 핀만 돌리고 실행 구간은 SKIP (CI 는 deploy.yml 에서 설치한다).
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto'), { pathToFileURL } = require('url');
const REPO = path.resolve(__dirname, '..');
const rd = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) pass++; else fail++; console.log(`  ${c ? '✅' : '❌'} ${n}${!c && x ? '  ' + x : ''}`); };
const OLD_SQL = rd('supabase/sql/crypto_trade.sql'), NEW_SQL = rd('supabase/sql/crypto_pending.sql');
const md5n = (s) => crypto.createHash('md5').update(s.replace(/\s+/g, '')).digest('hex');
const bodyOf = (sql, name) => { const m = sql.match(new RegExp('create or replace function public\\.' + name + '\\([\\s\\S]*?as \\$\\$([\\s\\S]*?)\\$\\$;')); return m ? m[1] : ''; };

// ── 정적 핀 ──────────────────────────────────────────────────────────────────
const oldBody = bodyOf(OLD_SQL, 'crypto_trade'), newBody = bodyOf(NEW_SQL, 'crypto_trade'), coreBody = bodyOf(NEW_SQL, 'crypto_fill_internal');
ok('본문 3개를 찾았다 (옛 crypto_trade · 새 crypto_trade · 코어)', !!(oldBody && newBody && coreBody));
// 운영 DB 에 실제로 깔려 있던 본문 (2026-11-17 사장님이 pg_get_functiondef 로 뽑아 준 것 그대로).
// 리포 파일과 주석 9줄이 달라 해시가 달랐고, 가드가 운영 배포를 막았다 (결함-로그 2026-11-17).
const PROD_SQL = rd('tests/fixtures/crypto_trade.prod-2026-11-17.sql');
const prodBody = (PROD_SQL.match(/AS \$function\$([\s\S]*?)\$function\$/) || [])[1] || '';
const noComments = (s) => s.split('\n').map((l) => l.replace(/--.*$/, '')).join('\n');
const guardHashes = ((NEW_SQL.match(/v_h not in \(([^)]*)\)/) || [])[1] || '').split(',').map((x) => x.trim().replace(/^'|'$/g, ''));
ok('가드의 해시 3개 = 실제 본문의 해시 (리포 crypto_trade.sql · 운영 배포본 · 새 래퍼) — 본문을 고치면 여기서 🔴',
   guardHashes.length === 3 && guardHashes[0] === md5n(oldBody) && guardHashes[1] === md5n(prodBody) && guardHashes[2] === md5n(newBody),
   JSON.stringify({ file: guardHashes, old: md5n(oldBody), prod: md5n(prodBody), new: md5n(newBody) }));
ok('운영 배포본 자료의 해시 = 가드가 운영에서 보고한 값 (30fce10b…) — 받아 적은 글자가 운영과 같다',
   md5n(prodBody) === '30fce10bac44ee7e4c2fa6d21ac5e6a7', md5n(prodBody));
ok('운영 배포본과 리포 crypto_trade.sql 의 차이는 주석뿐이다 (주석을 지우면 한 글자도 다르지 않다)',
   !!prodBody && md5n(prodBody) !== md5n(oldBody) && md5n(noComments(prodBody)) === md5n(noComments(oldBody)) &&
   !/'[^'\n]*--[^'\n]*'/.test(prodBody) && !/'[^'\n]*--[^'\n]*'/.test(oldBody));
ok('체결(crypto_trades insert · crypto_holdings 이동)은 코어 한 곳에만 있다',
   (NEW_SQL.match(/insert into public\.crypto_trades/g) || []).length === 1 && /insert into public\.crypto_trades/.test(coreBody) &&
   (NEW_SQL.match(/update public\.crypto_holdings/g) || []).length === 2 && !/crypto_holdings/.test(newBody));
ok('새 crypto_trade 는 본인 확인 뒤 코어만 부른다 · 스윕도 코어만 부른다',
   /return public\.crypto_fill_internal\(p_ref, p_acct, p_symbol, p_usd, p_side, p_all, null\);/.test(newBody) &&
   /v_res := public\.crypto_fill_internal\(r\.id, r\.acct_no, r\.asset, r\.usd, r\.side, false, r\.qty\);/.test(NEW_SQL));
ok('코어·스윕은 앱이 직접 못 부른다 (revoke) · 접수/취소만 authenticated',
   /revoke all on function public\.crypto_fill_internal\([^)]*\) from public, anon, authenticated;/.test(NEW_SQL) &&
   /revoke all on function public\.crypto_pending_fill\(\) from public, anon, authenticated;/.test(NEW_SQL) &&
   /grant execute on function public\.crypto_place_pending\([^)]*\) to authenticated;/.test(NEW_SQL) && /grant execute on function public\.crypto_cancel_pending\(text\) to authenticated;/.test(NEW_SQL));
ok('테이블: RLS 켬 · 읽기 정책만 · 앱 쓰기 권한 회수', /alter table public\.crypto_pending enable row level security;/.test(NEW_SQL) &&
   (NEW_SQL.match(/create policy/g) || []).length === 1 && /for select using/.test(NEW_SQL) && /revoke insert, update, delete on public\.crypto_pending from anon, authenticated;/.test(NEW_SQL));
ok('코어의 시세 신선도 = 120초 (시장가와 같음) · 스윕·접수도 120초', (NEW_SQL.match(/interval '120 seconds'/g) || []).length === 3);

// ── 실행 구간 ────────────────────────────────────────────────────────────────
let pglitePath = null;
for (const base of [REPO, process.env.ALPEXA_PGLITE_DIR, path.join(REPO, '..', 'pg')].filter(Boolean)) {
  try { pglitePath = require.resolve('@electric-sql/pglite', { paths: [base] }); break; } catch (_) {}
}
const done = () => { console.log(`\n${fail ? '🔴' : '🟢'} crypto-pending-sql — ${pass} pass, ${fail} fail`); process.exit(fail ? 1 : 0); };
if (!pglitePath) { console.log('  ⏭️  실행 구간 SKIP — @electric-sql/pglite 없음 (npm i @electric-sql/pglite --no-save)'); done(); }
else (async () => {
  const { PGlite } = await import(pathToFileURL(pglitePath).href);
  const UA = '11111111-1111-1111-1111-111111111111', UB = '22222222-2222-2222-2222-222222222222';
  // 운영 DB 의 최소 모형 (이 SQL 들이 기대하는 것만)
  const BASE = `
    do $$ begin
      if not exists (select 1 from pg_roles where rolname='anon') then create role anon; end if;
      if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
      if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role; end if;
    end $$;
    create schema if not exists auth;
    create or replace function auth.uid() returns uuid language sql stable as $f$ select nullif(current_setting('test.uid', true),'')::uuid $f$;
    grant usage on schema auth to anon, authenticated, service_role; grant usage on schema public to anon, authenticated, service_role;
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;      -- Supabase 기본값
    create schema if not exists cron;
    create table cron.job(jobid serial primary key, jobname text unique, schedule text, command text, active boolean default true);
    create function cron.schedule(n text, s text, c text) returns bigint language sql as $f$ insert into cron.job(jobname,schedule,command) values (n,s,c) on conflict (jobname) do update set schedule=excluded.schedule, command=excluded.command returning jobid::bigint $f$;
    create function cron.unschedule(n text) returns boolean language sql as $f$ delete from cron.job where jobname=n returning true $f$;
    create table public.players(id text primary key, auth_id uuid, cust_id text);
    create table public.accounts(acct_no text primary key, server text, player_id text, balance numeric default 0);
    create table public.prices(symbol text primary key, mid numeric);
    create table public.pricing_marks(symbol text primary key, markup_pts numeric);
    create table public.crypto_holdings(acct_no text, asset text, qty numeric not null default 0 check (qty >= 0), updated_at timestamptz default now(), primary key (acct_no, asset));
    create or replace function public.is_admin() returns boolean language sql stable as $f$ select false $f$;
    create or replace function public.owns_acct(a text) returns boolean language sql stable security definer as $f$
      select exists (select 1 from public.accounts x join public.players p on p.id = x.player_id where x.acct_no = a and p.auth_id = auth.uid()) $f$;
    insert into public.players values ('P1','${UA}','C1'), ('P2','${UB}','C2');
    insert into public.accounts(acct_no,server,player_id) values ('CR-1','crypto','P1'), ('CR-2','crypto','P2'), ('CR-1T','crypto','P1'), ('FX-1','fx','P1');
    insert into public.pricing_marks values ('BTC', 1.5), ('ETH', 0);
  `;
  const SEED = `
    insert into public.prices(symbol, mid) values ('BTC', 100000), ('ETH', 4000), ('SOL', 200) on conflict (symbol) do update set mid = excluded.mid;
    insert into public.crypto_holdings(acct_no, asset, qty) values ('CR-1','USDT',10000), ('CR-1','BTC',0.05), ('CR-2','USDT',500), ('CR-1T','USDT',10000), ('CR-1T','BTC',0.05)
      on conflict (acct_no, asset) do update set qty = excluded.qty;
  `;
  const mk = async (withNew) => { const db = new PGlite(); await db.exec(BASE); await db.exec(OLD_SQL); await db.exec(SEED); if (withNew) await db.exec(NEW_SQL); return db; };
  const as = async (db, uid) => db.exec(`select set_config('test.uid', '${uid || ''}', false)`);
  const q = async (db, sql, params) => (await db.query(sql, params)).rows;
  const one = async (db, sql, params) => { const r = await q(db, sql, params); return r[0] ? Object.values(r[0])[0] : null; };
  const price = async (db, sym, mid) => db.query(`update public.prices set mid = $2 where symbol = $1`, [sym, mid]);
  const stale = async (db, sym) => db.exec(`alter table public.prices disable trigger trg_prices_touch; update public.prices set updated_at = now() - interval '10 minutes' where symbol = '${sym}'; alter table public.prices enable trigger trg_prices_touch;`);
  const snap = async (db) => JSON.stringify({ h: await q(db, `select acct_no, asset, qty::text from public.crypto_holdings order by 1,2`),
    t: await q(db, `select ref, cust_id, acct_no, asset, side, usd::text, qty::text, price::text, fee::text from public.crypto_trades order by ref`) });
  const hold = async (db, acct) => { const o = {}; (await q(db, `select asset, qty::float8 as qty from public.crypto_holdings where acct_no = $1`, [acct])).forEach((r) => { o[r.asset] = r.qty; }); return o; };

  try {
    // ════ A0. 운영과 같은 출발점 ════ 운영 배포본(주석만 다른 crypto_trade)이 깔린 DB 에 새 SQL 을 실행한다.
    //   이게 2026-11-17 운영에서 실제로 일어난 일이다 — 가드가 "리포와 다르다"며 멈췄다.
    const dbProd = new PGlite(); await dbProd.exec(BASE); await dbProd.exec(OLD_SQL); await dbProd.exec(PROD_SQL); await dbProd.exec(SEED);
    ok('A0. DB 가 계산한 운영 배포본 해시 = 운영 가드가 보고한 값 (30fce10b…)',
       (await one(dbProd, `select md5(regexp_replace(prosrc, '\\s+', '', 'g')) from pg_proc where proname = 'crypto_trade'`)) === '30fce10bac44ee7e4c2fa6d21ac5e6a7');
    let prodRun = true; try { await dbProd.exec(NEW_SQL); } catch (e) { prodRun = e.message; }
    ok('A0. 운영 배포본 위에서 새 SQL 이 끝까지 실행된다 (가드 통과 · 테이블 · 코어 · 크론)', prodRun === true &&
       (await one(dbProd, `select to_regclass('public.crypto_pending')::text`)) !== null && (await one(dbProd, `select count(*)::int from pg_proc where proname='crypto_fill_internal'`)) === 1 &&
       (await one(dbProd, `select count(*)::int from cron.job where jobname='crypto_pending_fill'`)) === 1, String(prodRun));

    // ════ A. 시장가 동등성 ════ 옛 함수는 **운영 배포본**으로 돌린다 (운영에서 실제로 바뀌는 것이 이것이다).
    const dbOld = new PGlite(); await dbOld.exec(BASE); await dbOld.exec(OLD_SQL); await dbOld.exec(PROD_SQL); await dbOld.exec(SEED);
    const dbNew = prodRun === true ? dbProd : await mk(true);
    const trade = (db, a) => one(db, `select public.crypto_trade($1,$2,$3,$4,$5,$6,$7)`, a);
    const STEPS = [
      [UA,   ['m-1', 'CR-1', 'BTC', 1000, 'buy', 0, false], '매수 $1000 (수수료 1.5%)'],
      [UA,   ['m-1', 'CR-1', 'BTC', 1000, 'buy', 0, false], '같은 ref 재시도 → duplicate'],
      [UA,   ['m-2', 'CR-1', 'ETH', 500, 'buy', 99, false], '매수 (클라가 보낸 수수료율 무시)'],
      [UA,   ['m-3', 'CR-1', 'BTC', 999999, 'buy', 0, false], '잔고 부족'],
      [UA,   ['m-4', 'CR-1', 'BTC', 300, 'sell', 0, false], '매도 $300 어치'],
      [UA,   ['m-5', 'CR-1', 'BTC', 999999, 'sell', 0, false], '보유 부족'],
      [UA,   ['m-6', 'CR-1', 'ETH', null, 'sell', 0, true], '전량 매도'],
      [UA,   ['m-7', 'CR-1', 'ETH', null, 'sell', 0, true], '보유 0 전량 매도 → nothing to sell'],
      [UA,   ['m-8', 'CR-1', 'BTC', 0, 'buy', 0, false], '금액 0'],
      [UA,   ['m-9', 'CR-1', 'BTC', 10, 'hold', 0, false], '잘못된 방향'],
      [UA,   ['m-10', 'CR-1', 'USDT', 10, 'buy', 0, false], 'USDT 거래 불가'],
      [UA,   ['m-11', 'CR-2', 'BTC', 10, 'buy', 0, false], '남의 계좌'],
      [UA,   ['m-12', 'FX-1', 'BTC', 10, 'buy', 0, false], '크립토 계좌 아님'],
      ['',   ['m-13', 'CR-1', 'BTC', 10, 'buy', 0, false], '로그인 안 됨'],
      [UA,   ['m-14', 'CR-1', 'DOGE', 10, 'buy', 0, false], '시세 없는 코인'],
      [UB,   ['m-15', 'CR-2', 'SOL', 123.45, 'buy', 0, false], '다른 고객 매수 (마크업 행 없음 = 0)'],
      [UB,   ['m-16', 'CR-2', 'SOL', 50, 'sell', 0, false], '다른 고객 매도'],
    ];
    let same = true, firstDiff = '';
    for (const [uid, args, label] of STEPS) {
      await as(dbOld, uid); await as(dbNew, uid);
      const a = JSON.stringify(await trade(dbOld, args)), b = JSON.stringify(await trade(dbNew, args));
      if (a !== b && same) { same = false; firstDiff = `${label}: old ${a} new ${b}`; }
    }
    await stale(dbOld, 'BTC'); await stale(dbNew, 'BTC'); await as(dbOld, UA); await as(dbNew, UA);
    const sa = JSON.stringify(await trade(dbOld, ['m-17', 'CR-1', 'BTC', 10, 'buy', 0, false])), sb = JSON.stringify(await trade(dbNew, ['m-17', 'CR-1', 'BTC', 10, 'buy', 0, false]));
    ok(`A. 시장가 ${STEPS.length}단계: 호출마다의 응답이 옛 함수와 새 함수에서 같다`, same, firstDiff);
    ok('A. 낡은 시세(10분 전) 거절도 같다', sa === sb && /stale/.test(sa), sa + ' | ' + sb);
    const s1 = await snap(dbOld), s2 = await snap(dbNew);
    ok('A. 최종 잔고(crypto_holdings)와 체결 기록(crypto_trades)이 한 글자도 다르지 않다', s1 === s2 && JSON.parse(s1).t.length >= 6, s1.slice(0, 200) + ' … ' + s2.slice(0, 200));

    // ════ B. 가드 ════
    let rerun = true; try { await dbNew.exec(NEW_SQL); } catch (e) { rerun = e.message; }
    ok('B. 재실행 안전 (이미 새 래퍼가 깔려 있어도 통과)', rerun === true, String(rerun));
    ok('B. 크론이 1개만 등록된다 (재실행해도 중복 없음) · 매분', (await q(dbNew, `select schedule from cron.job where jobname='crypto_pending_fill'`)).map((r) => r.schedule).join() === '* * * * *');
    const dbDrift = new PGlite(); await dbDrift.exec(BASE); await dbDrift.exec(OLD_SQL.replace("interval '120 seconds'", "interval '300 seconds'"));   // 누가 SQL editor 에서 직접 고친 상황
    let gmsg = ''; try { await dbDrift.exec(NEW_SQL); } catch (e) { gmsg = e.message; }
    ok('B. 배포된 crypto_trade 가 리포와 다르면 멈춘다', /differs from the repo/.test(gmsg), gmsg);
    ok('B. 멈췄을 때 아무것도 만들지 않았다 (테이블·코어·크론 없음)',
       (await one(dbDrift, `select to_regclass('public.crypto_pending')::text`)) === null && (await one(dbDrift, `select count(*)::int from pg_proc where proname='crypto_fill_internal'`)) === 0 &&
       (await one(dbDrift, `select count(*)::int from cron.job`)) === 0);
    const dbNone = new PGlite(); await dbNone.exec(BASE); let nmsg = ''; try { await dbNone.exec(NEW_SQL); } catch (e) { nmsg = e.message; }
    ok('B. crypto_trade 가 아예 없으면 멈춘다 (선행 파일 안내)', /deploy crypto_trade\.sql first/.test(nmsg), nmsg);

    // ════ C. 접수 ════
    const db = await mk(true); await as(db, UA);
    const place = (a) => one(db, `select public.crypto_place_pending($1,$2,$3,$4,$5,$6,$7,$8)`, a);
    const sweep = () => one(db, `select public.crypto_pending_fill()`);
    const cancel = (id) => one(db, `select public.crypto_cancel_pending($1)`, [id]);
    const st = (id) => one(db, `select status from public.crypto_pending where id = $1`, [id]);
    const w = async (a) => (await place(a)).code;
    ok('C. 방향 검증: 지금 가격(100,000)에서 즉시 체결될 주문 4종은 전부 거절 (WRONG_SIDE)',
       (await w(['cp-wrong-1', 'CR-1', 'BTC', 'buy', 'limit', 100000, 100, null])) === 'WRONG_SIDE' && (await w(['cp-wrong-2', 'CR-1', 'BTC', 'sell', 'limit', 99000, null, 0.01])) === 'WRONG_SIDE' &&
       (await w(['cp-wrong-3', 'CR-1', 'BTC', 'buy', 'stop', 99000, 100, null])) === 'WRONG_SIDE' && (await w(['cp-wrong-4', 'CR-1', 'BTC', 'sell', 'stop', 101000, null, 0.01])) === 'WRONG_SIDE');
    const p1 = await place(['cp-buylimit-1', 'CR-1', 'BTC', 'buy', 'limit', 95000, 1000, null]);
    const p1b = await place(['cp-buylimit-1', 'CR-1', 'BTC', 'buy', 'limit', 95000, 1000, null]);
    ok('C. 접수 성공 · 같은 id 로 다시 보내면 duplicate (주문은 1건)', p1.ok === true && p1.status === 'pending' && p1b.ok === true && p1b.duplicate === true &&
       (await one(db, `select count(*)::int from public.crypto_pending where id='cp-buylimit-1'`)) === 1, JSON.stringify([p1, p1b]));
    ok('C. 입력 거절: 잘못된 id · 방향 · 유형 · 트리거 0 · BUY 에 수량 · SELL 에 달러 · USDT',
       (await place(['x', 'CR-1', 'BTC', 'buy', 'limit', 95000, 100, null])).error === 'bad id' && (await place(['cp-aaaaaa', 'CR-1', 'BTC', 'hold', 'limit', 95000, 100, null])).error === 'bad side' &&
       (await place(['cp-aaaaaa', 'CR-1', 'BTC', 'buy', 'market', 95000, 100, null])).error === 'bad type' && (await place(['cp-aaaaaa', 'CR-1', 'BTC', 'buy', 'limit', 0, 100, null])).error === 'bad trigger' &&
       (await place(['cp-aaaaaa', 'CR-1', 'BTC', 'buy', 'limit', 95000, 100, 0.1])).error === 'bad amount' && (await place(['cp-aaaaaa', 'CR-1', 'BTC', 'sell', 'limit', 105000, 100, null])).error === 'bad amount' &&
       (await place(['cp-aaaaaa', 'CR-1', 'USDT', 'buy', 'limit', 0.9, 100, null])).error === 'cannot trade USDT');
    ok('C. 남의 계좌로는 접수 불가 · 로그아웃 상태 불가', (await place(['cp-other-1', 'CR-2', 'BTC', 'buy', 'limit', 95000, 100, null])).error === 'not your account' &&
       (await as(db, ''), (await place(['cp-anon-01', 'CR-1', 'BTC', 'buy', 'limit', 95000, 100, null])).error) === 'not authenticated');
    await as(db, UA);
    ok('C. 이미 체결에 쓰인 번호(ref)나 남의 주문 id 는 쓸 수 없다',
       (await one(db, `select public.crypto_trade('cp-usedref-1','CR-1','BTC',10,'buy',0,false)`)).ok === true && (await place(['cp-usedref-1', 'CR-1', 'BTC', 'buy', 'limit', 95000, 100, null])).error === 'bad id' &&
       (await as(db, UB), (await place(['cp-buylimit-1', 'CR-2', 'BTC', 'buy', 'limit', 95000, 100, null])).error) === 'bad id');
    await as(db, UA);
    const hPlace = JSON.stringify(await hold(db, 'CR-1'));          // 여기서부터의 접수는 잔고를 한 푼도 움직이면 안 된다
    await stale(db, 'SOL');
    ok('C. 시세가 낡은 코인은 접수 거절', /stale/.test((await place(['cp-stale-01', 'CR-1', 'SOL', 'buy', 'limit', 150, 100, null])).error || ''));
    for (let i = 0; i < 19; i++) await place(['cp-cap-' + String(i).padStart(4, '0'), 'CR-1', 'ETH', 'buy', 'limit', 3000 + i, 10, null]);
    const capped = await place(['cp-cap-over1', 'CR-1', 'ETH', 'buy', 'limit', 2900, 10, null]);
    ok('C. 계좌당 대기 20건 상한 (21번째 거절)', capped.code === 'TOO_MANY' && (await one(db, `select count(*)::int from public.crypto_pending where acct_no='CR-1' and status='pending'`)) === 20, JSON.stringify(capped));
    await db.exec(`update public.crypto_pending set status='cancelled' where id like 'cp-cap-%'`);
    ok('C. 접수만으로는 돈이 움직이지 않는다 (대기 20건을 건 뒤에도 잔고 그대로 · 체결 기록 0건)',
       JSON.stringify(await hold(db, 'CR-1')) === hPlace && (await one(db, `select count(*)::int from public.crypto_trades where ref like 'cp-%' and ref <> 'cp-usedref-1'`)) === 0);

    // ════ D. 체결 ════
    const r0 = await sweep();
    ok('D. 조건 미달(가격 100,000 · 지정가 95,000) → 체결 안 됨 · 그대로 pending', r0.filled === 0 && (await st('cp-buylimit-1')) === 'pending', JSON.stringify(r0));
    // 같은 가격에서 시장가로 사는 쌍둥이 계좌와 결과 비교
    await price(db, 'BTC', 94000);
    const before = await hold(db, 'CR-1'), tBefore = await hold(db, 'CR-1T');
    const r1 = await sweep();
    const tw = await one(db, `select public.crypto_trade('m-twin-1','CR-1T','BTC',1000,'buy',0,false)`);
    const after = await hold(db, 'CR-1'), tAfter = await hold(db, 'CR-1T');
    const rowF = (await q(db, `select status, fill_price::float8 as fp, fill_qty::float8 as fq from public.crypto_pending where id='cp-buylimit-1'`))[0];
    ok('D. BUY LIMIT: 가격이 지정가 아래(94,000)로 → 체결 · 상태 filled · 체결가 94,000 (지정가 95,000보다 유리)', r1.filled === 1 && rowF.status === 'filled' && rowF.fp === 94000, JSON.stringify([r1, rowF]));
    ok('D. 체결 결과 = 같은 가격의 시장가와 동일 (달러 차감 · 코인 수량 · 수수료)',
       Math.abs((after.USDT - before.USDT) - (tAfter.USDT - tBefore.USDT)) < 1e-9 && Math.abs((after.BTC - before.BTC) - (tAfter.BTC - tBefore.BTC)) < 1e-12 && rowF.fq === tw.qty,
       JSON.stringify({ pend: [after.USDT - before.USDT, after.BTC - before.BTC], mkt: [tAfter.USDT - tBefore.USDT, tAfter.BTC - tBefore.BTC] }));
    ok('D. 체결 기록의 ref = 주문 id (crypto_trades 에 1건)', (await one(db, `select count(*)::int from public.crypto_trades where ref='cp-buylimit-1'`)) === 1);
    const r2 = await sweep(); const after2 = await hold(db, 'CR-1');
    ok('D. 스윕을 다시 돌려도 아무 일 없다 (이미 filled)', r2.filled === 0 && JSON.stringify(after2) === JSON.stringify(after), JSON.stringify(r2));
    await db.exec(`update public.crypto_pending set status='pending', filled_at=null where id='cp-buylimit-1'`);   // 상태가 어떤 이유로 되돌아간 최악의 경우
    const r3 = await sweep(); const after3 = await hold(db, 'CR-1');
    ok('D. 이중 체결 불가: 상태를 억지로 pending 으로 되돌려도 돈은 다시 움직이지 않는다 (같은 ref → duplicate) · 다시 filled 로 정리',
       JSON.stringify(after3) === JSON.stringify(after) && (await st('cp-buylimit-1')) === 'filled' && (await one(db, `select count(*)::int from public.crypto_trades where ref='cp-buylimit-1'`)) === 1, JSON.stringify(r3));

    // 트리거 4종 경계 (mid == trigger 도 체결)
    await price(db, 'ETH', 4000);
    await db.exec(`insert into public.crypto_holdings(acct_no,asset,qty) values ('CR-1','ETH',1) on conflict (acct_no,asset) do update set qty=1`);
    const P = [['cp-t-buylimit', 'buy', 'limit', 3900, 100, null], ['cp-t-selllimit', 'sell', 'limit', 4100, null, 0.1], ['cp-t-buystop', 'buy', 'stop', 4200, 100, null], ['cp-t-sellstop', 'sell', 'stop', 3800, null, 0.1]];
    for (const [id, side, ot, trg, usd, qty] of P) await place([id, 'CR-1', 'ETH', side, ot, trg, usd, qty]);
    const stAll = async () => (await q(db, `select id, status from public.crypto_pending where id like 'cp-t-%' order by id`)).map((r) => r.id.slice(5) + ':' + r.status).join(' ');
    await price(db, 'ETH', 3901); await sweep(); const tA = await stAll();
    await price(db, 'ETH', 3900); await sweep(); const tB = await stAll();
    await price(db, 'ETH', 3800); await sweep(); const tC = await stAll();
    await price(db, 'ETH', 4100); await sweep(); const tD = await stAll();
    await price(db, 'ETH', 4200); await sweep(); const tE = await stAll();
    ok('D. 트리거 4종: 3901 → 아무것도 · 3900 → BUY LIMIT · 3800 → SELL STOP · 4100 → SELL LIMIT · 4200 → BUY STOP (경계값 포함)',
       tA === 'buylimit:pending buystop:pending selllimit:pending sellstop:pending' && tB === 'buylimit:filled buystop:pending selllimit:pending sellstop:pending' &&
       tC === 'buylimit:filled buystop:pending selllimit:pending sellstop:filled' && tD === 'buylimit:filled buystop:pending selllimit:filled sellstop:filled' &&
       tE === 'buylimit:filled buystop:filled selllimit:filled sellstop:filled', [tA, tB, tC, tD, tE].join(' | '));
    const ethQty = (await q(db, `select id, fill_qty::float8 as fq, fill_price::float8 as fp from public.crypto_pending where id in ('cp-t-sellstop','cp-t-selllimit') order by id`));
    ok('D. SELL 은 건 수량(0.1 ETH) 그대로 팔린다 — 가격이 내려간 뒤의 스탑도 (3,800에 0.1 ETH)', ethQty[0].fq === 0.1 && ethQty[0].fp === 4100 && ethQty[1].fq === 0.1 && ethQty[1].fp === 3800, JSON.stringify(ethQty));

    // 잔고 부족 → rejected
    await as(db, UB);
    await price(db, 'BTC', 94000);
    const big = await one(db, `select public.crypto_place_pending('cp-big-00001','CR-2','BTC','buy','limit',90000,5000,null)`);
    const hb = JSON.stringify(await hold(db, 'CR-2'));
    await price(db, 'BTC', 89000); const r4 = await sweep();
    const rej = (await q(db, `select status, reason from public.crypto_pending where id='cp-big-00001'`))[0];
    ok('D. 체결 순간 잔고 부족($5,000 주문 · 잔고 부족) → rejected + 사유 · 돈은 안 움직인다',
       big.ok === true && r4.rejected === 1 && rej.status === 'rejected' && /insufficient balance/.test(rej.reason) && JSON.stringify(await hold(db, 'CR-2')) === hb, JSON.stringify([big, r4, rej]));
    // 낡은 시세 → 건너뜀
    const sp = await one(db, `select public.crypto_place_pending('cp-stale-fill1','CR-2','BTC','buy','limit',88000,50,null)`);
    await price(db, 'BTC', 87000); await stale(db, 'BTC'); const r5 = await sweep(); const s5 = await st('cp-stale-fill1');
    await price(db, 'BTC', 87000); const r6 = await sweep(); const s6 = await st('cp-stale-fill1');
    ok('D. 조건은 넘었지만 시세가 낡았으면 건너뛴다(pending 유지) → 시세가 살아나면 체결', sp.ok === true && r5.skipped >= 1 && r5.filled === 0 && s5 === 'pending' && r6.filled === 1 && s6 === 'filled', JSON.stringify([r5, s5, r6, s6]));

    // ════ E. 취소 ════
    await as(db, UA); await price(db, 'BTC', 100000);
    await place(['cp-cancel-01', 'CR-1', 'BTC', 'buy', 'limit', 96000, 100, null]);
    const c1 = await cancel('cp-cancel-01'); const hc = JSON.stringify(await hold(db, 'CR-1'));
    await price(db, 'BTC', 95000); const r7 = await sweep();
    ok('E. 본인 pending 주문 취소 → cancelled · 그 뒤 조건이 와도 체결되지 않는다', c1.ok === true && (await st('cp-cancel-01')) === 'cancelled' && r7.filled === 0 && JSON.stringify(await hold(db, 'CR-1')) === hc, JSON.stringify([c1, r7]));
    ok('E. 이미 체결된 주문은 취소 불가 (NOT_PENDING) · 상태 그대로 filled', (await cancel('cp-buylimit-1')).code === 'NOT_PENDING' && (await st('cp-buylimit-1')) === 'filled');
    await price(db, 'BTC', 100000); await place(['cp-cancel-02', 'CR-1', 'BTC', 'buy', 'limit', 90000, 100, null]);
    await as(db, UB);
    ok('E. 남의 주문은 취소 불가', (await cancel('cp-cancel-02')).code === 'NOT_PENDING' && (await st('cp-cancel-02')) === 'pending');
    await as(db, ''); ok('E. 로그아웃 상태 취소 불가', (await cancel('cp-cancel-02')).error === 'not authenticated');

    // ════ F. 권한 (앱 = authenticated 역할) ════
    const asRole = async (uid, sql) => { await as(db, uid); await db.exec('set role authenticated'); try { return { rows: await q(db, sql) }; } catch (e) { return { err: e.message }; } finally { await db.exec('reset role'); } };
    const seeA = await asRole(UA, `select distinct acct_no from public.crypto_pending`), seeB = await asRole(UB, `select distinct acct_no from public.crypto_pending`);
    ok('F. 앱은 본인 주문만 본다 (RLS)', seeA.rows && seeA.rows.map((r) => r.acct_no).join() === 'CR-1' && seeB.rows && seeB.rows.map((r) => r.acct_no).join() === 'CR-2', JSON.stringify([seeA, seeB]));
    const wIns = await asRole(UA, `insert into public.crypto_pending(id,acct_no,asset,side,otype,usd,trigger) values ('cp-hack-0001','CR-1','BTC','buy','limit',1,1)`);
    const wUpd = await asRole(UA, `update public.crypto_pending set status='filled' where id='cp-cancel-02'`);
    const wDel = await asRole(UA, `delete from public.crypto_pending where id='cp-cancel-02'`);
    ok('F. 앱은 주문 테이블에 직접 못 쓴다 (insert · update · delete 거부)', /permission denied/.test(wIns.err || '') && /permission denied/.test(wUpd.err || '') && /permission denied/.test(wDel.err || ''), JSON.stringify([wIns, wUpd, wDel]));
    const xCore = await asRole(UA, `select public.crypto_fill_internal('cp-hack-0002','CR-2','BTC',100,'buy',false,null)`);
    const xSweep = await asRole(UA, `select public.crypto_pending_fill()`);
    ok('F. 앱은 체결 코어·스윕을 직접 못 부른다 (본인 확인 없는 함수)', /permission denied/.test(xCore.err || '') && /permission denied/.test(xSweep.err || ''), JSON.stringify([xCore, xSweep]));
    const okPlace = await asRole(UA, `select public.crypto_place_pending('cp-role-0001','CR-1','BTC','buy','limit',90000,10,null) as r`);
    const okTrade = await asRole(UA, `select public.crypto_trade('m-role-1','CR-1','BTC',10,'buy',0,false) as r`);
    ok('F. 앱은 접수와 시장가는 부를 수 있다', okPlace.rows && okPlace.rows[0].r.ok === true && okTrade.rows && okTrade.rows[0].r.ok === true, JSON.stringify([okPlace, okTrade]));
  } catch (e) { ok('실행 구간이 예외 없이 끝난다', false, e.message + '\n' + String(e.stack || '').split('\n').slice(0, 4).join('\n')); }
  done();
})();
