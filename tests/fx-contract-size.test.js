// Alpexa — 계약 크기(contract size) 단일 출처 핀. 2026-09-09 사장님 승인 (DOGE·XRP·ADA 1랏 = 10,000).
// ============================================================================
// 왜: 계약 크기가 서버 3함수 + 클라 2파일에 CASE 문으로 **5벌 복제**돼 있었다. 크립토를 MT5처럼
// 랏 단위로 바꾸려면 다섯 곳을 같이 고쳐야 하고, 하나라도 빠지면 플로팅≠실현 (fx-floating-spread).
// 진실을 fx_specs.contract 한 곳으로 옮기고, 서버는 fx_contract() 로만, 클라는 락스텝 표로만 읽는다.
//
//   S1  fx_specs.contract 컬럼 + 백필 (현재값 그대로 = 1단계 동작 변화 0)
//   S2  fx_contract(symbol, cls) 헬퍼 — 스펙 행 없으면 옛 CASE 폴백 (fail-safe, 새 숫자 발명 금지)
//   S3  서버 3함수(fx_notional_usd · fx_close · fx_realized_pnl)가 fx_contract() 만 부른다 — 옛 CASE 0벌
//   S4  배포 파일이 소스 함수 본문과 바이트 단위로 같다 (복사본 드리프트 차단)
//   S5  2단계 마이그레이션은 spec 값 변경 + 열린 포지션·펜딩 size ÷ 계약 을 한 트랜잭션으로, 감사 기록 포함
//   C1  trading.html getLotSize 는 s.contract 를 우선한다
//   C2  webtrade 는 fx_specs.contract 를 런타임으로 읽고(SERVER_CONTRACT), 없을 때만 폴백
//   C3  락스텝: trading.html SYMBOLS.contract == webtrade 폴백표 == SQL 2단계 값 (3벌이 같은 숫자)
//   C4  모바일 티켓: 계약>1 크립토는 USD 금액이 아니라 랏 입력 (MT5 방식)
'use strict';
const fs = require('fs'), path = require('path');
let pass = true;
const ok = (n, c) => { if (!c) pass = false; console.log(`  ${c ? '✅' : '❌'} ${n}`); };
const R = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const exists = (p) => fs.existsSync(path.join(__dirname, '..', p));

const fnBlock = (src, name) => { const m = src.match(new RegExp(`create or replace function public\\.${name}\\([\\s\\S]*?\\$\\$;`)); return m ? m[0] : ''; };
const LEGACY = /when (?:p_symbol\s*=\s*)?'XAUUSD' then 100/;   // 옛 CASE (헬퍼 폴백 1곳에만 허용)

console.log('\n=== 서버 — 계약 크기 단일 출처 ===');
ok('S1 fx_contract_size.sql 이 있다', exists('supabase/sql/fx_contract_size.sql'));
const cs = exists('supabase/sql/fx_contract_size.sql') ? R('supabase/sql/fx_contract_size.sql') : '';
ok('S1 fx_specs.contract 컬럼 추가 (add column if not exists)', /alter table public\.fx_specs add column if not exists contract numeric/.test(cs));
ok('S1 백필: XAU 100 · XAG 5000 · FX 100000 · else 1 (현재값 그대로)', /when 'XAUUSD' then 100 when 'XAGUSD' then 5000/.test(cs) && /when 'FX' then 100000 else 1/.test(cs));
const helper = fnBlock(cs, 'fx_contract');
ok('S2 fx_contract(p_symbol, p_cls) 헬퍼 정의', /p_symbol text, p_cls text/.test(helper));
ok('S2 헬퍼: 스펙 행 우선, 없으면 옛 CASE 폴백', /select contract from public\.fx_specs where symbol = p_symbol/.test(helper) && LEGACY.test(helper));

const om = R('supabase/sql/fx_open_margin.sql'), fc = R('supabase/sql/fx_close.sql'), so = R('supabase/sql/fx_stopout.sql');
const notional = fnBlock(om, 'fx_notional_usd'), close = fnBlock(fc, 'fx_close'), realized = fnBlock(so, 'fx_realized_pnl');
ok('S3 fx_notional_usd → fx_contract()', /v_lot := public\.fx_contract\(p_symbol, p_cls\)/.test(notional) && !LEGACY.test(notional));
ok('S3 fx_close → fx_contract()', /v_lot\s+:= public\.fx_contract\(v_sym, v_cls\)/.test(close) && !LEGACY.test(close));
ok('S3 fx_realized_pnl → fx_contract()', /v_lot\s+:= public\.fx_contract\(p_symbol, v_cls\)/.test(realized) && !LEGACY.test(realized));
ok('S3 소스 전체에 옛 CASE 가 헬퍼 폴백 1곳 외엔 없다', [om, fc, so].every(s => !LEGACY.test(s)));

ok('S4 배포 파일이 세 함수 본문을 소스 그대로 담는다', notional && close && realized && cs.includes(notional) && cs.includes(close) && cs.includes(realized));
ok('S4 배포 파일이 헬퍼를 세 함수보다 먼저 정의한다', cs.indexOf('function public.fx_contract(') > 0 && cs.indexOf('function public.fx_contract(') < cs.indexOf('function public.fx_notional_usd('));

const mig = cs.slice(cs.indexOf('════════ 2단계'));   // 2단계 블록만 (앞의 함수 본문 제외)
ok('S5 2단계: DOGE·XRP·ADA contract = 10000', /set contract = 10000 where symbol in \('DOGEUSD','XRPUSD','ADAUSD'\)/.test(mig));
ok('S5 2단계: 열린 포지션 size ÷ 10000 (같은 심볼·open 만)', /update public\.positions set size = round\(size \/ 10000, 6\)[\s\S]*?status = 'open' and symbol in \('DOGEUSD','XRPUSD','ADAUSD'\)/.test(mig));
ok('S5 2단계: 펜딩 주문 size ÷ 10000', /update public\.fx_pending set size = round\(size \/ 10000, 6\)[\s\S]*?status = 'pending'/.test(mig));
ok('S5 2단계: begin … commit 한 트랜잭션 + 감사 기록', /begin;[\s\S]*_sbdesk_audit\('contract_size_migration'[\s\S]*commit;/.test(mig));
ok('S5 2단계: 잔고·원장 접근 0줄', !/ledger|accounts\b|balance/.test(mig));

console.log('\n=== 클라 — 락스텝 ===');
const th = R('trading.html'), wt = R('webtrade.html'), app = R('src/trading-app.jsx');
ok('C1 trading.html getLotSize 가 s.contract 를 우선한다', /function getLotSize\(s\)\{if\(s&&\+s\.contract>0\)return \+s\.contract;/.test(th));
ok('C2 webtrade: SERVER_CONTRACT 를 fx_specs.contract 로 채운다', /const SERVER_CONTRACT = \{\}/.test(wt) && /select\('symbol,cls,contract'\)/.test(wt) && /SERVER_CONTRACT\[x\.symbol\]/.test(wt));
ok('C2 webtrade: contract 컬럼 없을 때(1단계 SQL 전) cls 만으로 폴백', /select\('symbol,cls'\)/.test(wt));
ok('C2 webtrade: contractSize 는 SERVER_CONTRACT 우선', /const contractSize = \(symbol\)=> \(SERVER_CONTRACT\[symbol\]>0 \? SERVER_CONTRACT\[symbol\] :/.test(wt));

// 락스텝 3벌: trading.html SYMBOLS 의 contract 필드 · webtrade CRYPTO_CONTRACT 폴백표 · SQL 2단계
const thMap = {}; for (const m of th.matchAll(/\{sym:'([A-Z]+)'[^}]*?cls:'CRYPTO'[^}]*?contract:(\d+)/g)) thMap[m[1]] = +m[2];
const wtMapSrc = (wt.match(/const CRYPTO_CONTRACT = \{([^}]*)\}/) || [])[1] || '';
const wtMap = {}; for (const m of wtMapSrc.matchAll(/([A-Z]+):(\d+)/g)) wtMap[m[1]] = +m[2];
const sqlMap = /set contract = 10000 where symbol in \('DOGEUSD','XRPUSD','ADAUSD'\)/.test(mig) ? { DOGEUSD: 10000, XRPUSD: 10000, ADAUSD: 10000 } : {};
const same = (a, b) => JSON.stringify(Object.entries(a).sort()) === JSON.stringify(Object.entries(b).sort());
ok('C3 webtrade 폴백표 == trading.html SYMBOLS.contract  (' + JSON.stringify(wtMap) + ')', same(wtMap, thMap));
ok('C3 클라 표 == SQL 2단계 값 (SQL 은 진실, 클라는 미러) — 2단계 배포 전엔 둘 다 비어 있어야 한다', same(thMap, sqlMap) || (Object.keys(thMap).length === 0 && /2단계 배포 전/.test(cs)));

ok('C4 티켓: 계약>1 크립토는 랏 UI (USD 금액 UI 는 계약==1 일 때만)', /s\.cls==='CRYPTO'&&lotSize===1\?\(/.test(app));
ok('C4 티켓: 계약>1 크립토 기본 수량 0.10 랏, 계약==1 은 USD 사이징 유지', /if\(s\.cls==='CRYPTO'&&cs===1\)\{ setLots\(\+\(cryptoUsdRef\.current\/px\)\.toFixed\(6\)\); \}/.test(app) && /else if\(s\.cls==='CRYPTO'\)\{ if\(classChanged\|\|prevLotRef\.current===1\) setLots\(0\.10\); \}/.test(app));
ok('C4 티켓: 계약 라벨이 랏×계약 코인 수를 보여준다', /lotSize>1\?`\$\{\(lotSize\*vol\)\.toLocaleString/.test(app));
ok('C4 단위 라벨: 계약>1 크립토는 lots', /if\(cls==='CRYPTO'\)return contract>1\?\(plural\?'lots':'lot'\):'units'/.test(th));

console.log('\n' + (pass ? '🟢 계약 크기의 진실은 fx_specs.contract 한 곳 — 서버·클라 락스텝' : '🔴 계약 크기 계약 깨짐') + '\n');
process.exit(pass ? 0 : 1);
