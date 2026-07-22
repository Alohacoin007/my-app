// Alpexa — 청산 경로 스왑 포함 불변식 핀 (정적, 네트워크 0)
//
// 불변식: 포지션이 어떤 경로(수동 fx_close · SL/TP fx_sltp · 마진콜 fx_stopout)로 닫히든
//   실현손익 = 가격 P&L + 적립 스왑(meta.swap). 한 경로라도 스왑을 빼먹으면 자동청산이
//   수동청산보다 스왑만큼 다르게 정산되는 돈 구멍 (결함-로그 2026-07-22).
// 각 SQL 파일에서 "settlements insert가 있는 함수 본문 안에 meta->>'swap' 가산식이 존재"를 핀.
'use strict';
const fs = require('fs'), path = require('path');
const REPO = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c, d) => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (d ? '  ' + d : '')); } };
console.log('fx settle swap — 청산 3경로 스왑 포함 불변식');

const SWAP_ADD = /v_pnl\s*:=\s*round\(\s*v_pnl\s*\+\s*coalesce\(\((?:select\s+)?\(?(?:r_pos\.|v_pos\.)?meta->>'swap'/;

const CASES = [
  { file: 'supabase/sql/fx_close.sql',   fn: 'fx_close',   label: '수동 청산' },
  { file: 'supabase/sql/fx_modify.sql',  fn: 'fx_sltp',    label: 'SL/TP 스위프' },
  { file: 'supabase/sql/fx_stopout.sql', fn: 'fx_stopout', label: '마진콜 강제청산' },
];
for (const c of CASES) {
  const src = fs.readFileSync(path.join(REPO, c.file), 'utf8');
  // 함수 본문만 잘라 검사 (파일 내 다른 함수의 스왑 코드로 오탐 방지)
  const m = src.match(new RegExp('create or replace function public\\.' + c.fn + '[\\s\\S]*?end;\\s*\\$(?:function)?\\$', 'i'));
  const body = m ? m[0] : '';
  ok(c.fn + ' (' + c.label + ') 본문에 settlements insert 존재', /insert into (public\.)?settlements/.test(body), c.file);
  ok(c.fn + ' (' + c.label + ') 실현손익에 meta.swap 가산 (불변식)', SWAP_ADD.test(body),
     c.file + ' — 스왑 가산식 없음: 이 경로로 닫히면 적립 스왑이 정산 누락');
}

console.log((fail ? '🔴' : '🟢') + ' fx-settle-swap-pin — ' + pass + ' pass, ' + fail + ' fail');
process.exit(fail ? 1 : 0);
