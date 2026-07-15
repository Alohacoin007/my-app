// Alpexa daily backup — fetches every table from Supabase (PostgREST) and writes
// one JSON file. Run by .github/workflows/daily-backup.yml (or `node scripts/backup.mjs`).
// Uses the publishable key (works while RLS is permissive). After the M4 lockdown,
// set SUPABASE_KEY to the service_role key via a GitHub Actions secret instead.
import { mkdir, writeFile } from 'node:fs/promises';

const URL = process.env.SUPABASE_URL || 'https://grxnbgtfnaayeluenvqh.supabase.co';
const KEY = process.env.SUPABASE_KEY || 'sb_publishable_ow1DihBdAAvNtnb1H0Kojw_7vbeMKFu';
const TABLES = ['players','accounts','requests','payments','positions','commands','logs','hedges','settlements','agents','agent_links','agent_payouts','pricing','pricing_marks'];

async function pull(table){
  const out = []; let from = 0; const page = 1000;
  for(;;){
    const res = await fetch(`${URL}/rest/v1/${table}?select=*`, {
      headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, Range: `${from}-${from+page-1}` }
    });
    if(!res.ok) throw new Error(`${table}: HTTP ${res.status}`);
    const rows = await res.json();
    out.push(...rows);
    if(rows.length < page) break;
    from += page;
  }
  return out;
}

const backup = { _meta: { app: 'Alpexa', taken_at: new Date().toISOString(), tables: {} } };
let total = 0, failed = 0;
for(const t of TABLES){
  try { const rows = await pull(t); backup[t] = rows; backup._meta.tables[t] = rows.length; total += rows.length; console.log(`  ${t}: ${rows.length} rows`); }
  catch(e){ failed++; backup[t] = []; backup._meta.tables[t] = 'ERROR'; console.error(`  ${t}: ${e.message}`); }
}

const d = new Date(), p = n => String(n).padStart(2,'0');
const stamp = `${d.getFullYear()}${p(d.getMonth()+1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
await mkdir('backup', { recursive: true });
const file = `backup/alpexa-backup-${stamp}.json`;
await writeFile(file, JSON.stringify(backup, null, 2));
console.log(`\nSaved ${total} rows → ${file}` + (failed ? ` (${failed} table(s) failed)` : ''));
