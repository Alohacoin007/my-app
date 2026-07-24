// Alpexa daily backup VERIFICATION — no data leaves Supabase (repo is PUBLIC; the old
// version uploaded table dumps as artifacts = a data leak the moment backups worked).
//
// What it does now (read-only, counts only):
//   1) counts the critical money tables with the service key (RLS-proof)
//   2) calls backup_status() — the in-database snapshot layer (supabase/sql/backup_snapshots.sql)
//   3) FAILS (exit 1) when anything is wrong → the workflow goes red → GitHub emails the owner.
//      (The 2026-07 defect: secrets were empty + RLS blocked everything + the script always
//       exited 0 → three weeks of empty "green" backups. Fail-closed now.)
//
// Env (GitHub Actions secrets): SUPABASE_URL, SUPABASE_KEY (service_role — NEVER the anon key).
import process from 'node:process';

const URL = process.env.SUPABASE_URL || '';
const KEY = process.env.SUPABASE_KEY || '';
const CRITICAL = ['players', 'accounts', 'ledger', 'positions', 'settlements'];   // 돈의 진실
const NONZERO  = ['players', 'accounts', 'ledger'];   // 라이브 서비스에서 0행이면 무조건 이상

let failed = [];
const fail = (m) => { failed.push(m); console.error('  ❌ ' + m); };

if (!URL || !KEY) {
  console.error('❌ SUPABASE_URL / SUPABASE_KEY secrets not set — backup verification cannot run.');
  console.error('   Set them in GitHub → Settings → Secrets → Actions (KEY = service_role).');
  process.exit(1);
}

async function countRows(table) {
  const res = await fetch(`${URL}/rest/v1/${table}?select=*`, {
    method: 'HEAD',
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, Prefer: 'count=exact', Range: '0-0' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const cr = res.headers.get('content-range') || '';      // e.g. "0-0/1234"
  const total = parseInt(cr.split('/')[1], 10);
  if (Number.isNaN(total)) throw new Error('no count in content-range');
  return total;
}

console.log('── ① 핵심 테이블 행수 (서비스 키, RLS 무관) ──');
for (const t of CRITICAL) {
  try {
    const n = await countRows(t);
    console.log(`  ${t}: ${n} rows`);
    if (NONZERO.includes(t) && n === 0) fail(`${t} has 0 rows — service key wrong or data gone`);
  } catch (e) { fail(`${t}: ${e.message}`); }
}

console.log('── ② DB 내부 스냅샷 상태 (backup_status) ──');
try {
  const res = await fetch(`${URL}/rest/v1/rpc/backup_status`, {
    method: 'POST',
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: '{}',
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const st = await res.json();
  console.log('  ' + JSON.stringify(st));
  if (!st.ok) fail('backup_status error: ' + (st.error || '?'));
  else if (st.never_ran) fail('snapshot layer never ran — deploy supabase/sql/backup_snapshots.sql');
  else {
    if (st.stale) fail(`snapshot stale — last ${st.last_day}, ${st.age_hours}h ago`);
    if (st.money_empty) fail('snapshot ledger is EMPTY — fake backup');
  }
} catch (e) { fail('backup_status call failed: ' + e.message); }

if (failed.length) {
  console.error(`\n🔴 backup verification FAILED (${failed.length}): owner action needed.`);
  process.exit(1);
}
console.log('\n🟢 backup verification OK — snapshots fresh, money tables populated.');
