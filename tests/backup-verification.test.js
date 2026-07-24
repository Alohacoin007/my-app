// Alpexa — 백업 체계 구조 핀 (정적, 네트워크 0, 돈 0)
//
// 배경(결함-로그 2026-07-24): 구 daily-backup은 ① 시크릿 미설정+RLS로 돈 테이블 0행
// ② ledger 미포함 ③ 실패해도 exit 0 ④ PUBLIC 레포에 데이터 아티팩트 업로드(작동했다면 유출).
// 3주+ "초록 빈 백업". 이 테스트는 재설계된 구조가 그 4개 구멍을 계속 막고 있는지 핀한다.
'use strict';
const fs = require('fs'), path = require('path');
const REPO = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c, d) => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (d ? '  ' + d : '')); } };
console.log('backup-verification — 구조 핀');

const mjs = fs.readFileSync(path.join(REPO, 'scripts', 'backup.mjs'), 'utf8');
const yml = fs.readFileSync(path.join(REPO, '.github', 'workflows', 'daily-backup.yml'), 'utf8');
const up  = fs.readFileSync(path.join(REPO, '.github', 'workflows', 'uptime-check.yml'), 'utf8');
const sql = fs.readFileSync(path.join(REPO, 'supabase', 'sql', 'backup_snapshots.sql'), 'utf8');

// ① fail-closed: 시크릿 없음 / 핵심 0행 / 스냅샷 stale·ledger빈 → exit 1
ok('① 시크릿 미설정 = 즉시 실패 (구버전은 anon 폴백)', /if \(!URL \|\| !KEY\) \{[\s\S]*?process\.exit\(1\)/.test(mjs) && !/sb_publishable/.test(mjs));
ok('① ledger가 검증 목록에 있다 (구버전 누락분)', /CRITICAL = \[[^\]]*'ledger'/.test(mjs));
ok('① 핵심 테이블 0행 = 실패', /NONZERO\.includes\(t\) && n === 0/.test(mjs));
ok('① stale/가짜(ledger 0) 스냅샷 = 실패', /st\.stale/.test(mjs) && /st\.money_empty/.test(mjs));
ok('① 실패 시 exit 1 (fail-closed)', /if \(failed\.length\) \{[\s\S]*?process\.exit\(1\)/.test(mjs));

// ② 데이터 유출 차단: PUBLIC 레포 — 데이터 저장/아티팩트 업로드 금지
ok('② backup.mjs는 데이터를 저장하지 않는다 (writeFile/mkdir 없음)', !/writeFile|mkdir/.test(mjs));
ok('② 워크플로에 upload-artifact 없음 (구버전 유출 경로 제거)', !/upload-artifact/.test(yml));
ok('② HEAD+count만 (행 데이터 미조회)', /method: 'HEAD'/.test(mjs) && /Prefer: 'count=exact'/.test(mjs));

// ③ DB 스냅샷 SQL: 멱등·보존·권한
ok('③ 스냅샷 멱등 (오늘 것 있으면 스킵)', /to_regclass\('backup\.' \|\| quote_ident\(v_dst\)\) is not null/.test(sql));
ok('③ 14일 보존 드랍', /current_date - 14/.test(sql));
ok('③ run_backup_snapshot = service_role만 · backup_status 게이트', /grant execute on function public\.run_backup_snapshot\(\) to service_role/.test(sql)
   && /revoke all on function public\.run_backup_snapshot\(\) from public, anon, authenticated/.test(sql)
   && /is_admin\(\) or current_setting/.test(sql));
ok('③ 크론 등록 + 즉시 1회 실행', /cron\.schedule\('daily-backup-snapshot', '0 9 \* \* \*'/.test(sql) && /select public\.run_backup_snapshot\(\);\s*$/.test(sql.trim()));

// ④ 다운 감시: 3층 프로브 + 실패 시 빨강 (침묵 게이트)
ok('④ uptime — 사이트·REST·Auth 3층 프로브', /alpexa-sports\.com\//.test(up) && /rest\/v1\/live_games/.test(up) && /auth\/v1\/health/.test(up));
ok('④ uptime — 실패 시 exit 1 (빨강 → 이메일)', (up.match(/exit 1/g) || []).length >= 3);
ok('④ uptime — 시크릿 불필요 (공개 엔드포인트만)', !/secrets\./.test(up));

console.log((fail ? '🔴' : '🟢') + ' backup-verification — ' + pass + ' pass, ' + fail + ' fail');
process.exit(fail ? 1 : 0);
