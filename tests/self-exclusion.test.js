// Alpexa — C4: self-exclusion is ONE-WAY for customers (can't be lifted by
// clearing localStorage and writing 0 back). Mirrors guard_self_exclusion()
// in supabase/sql/responsible_gaming.sql.
'use strict';
let pass = true;
const ok = (n, c) => { if (!c) pass = false; console.log(`  ${c ? '✅' : '❌'} ${n}`); };

// The DB trigger, in JS form: clamp the customer's write to >= the stored value.
function applyWrite(oldVal, newVal, isAdmin) {
  if (isAdmin) return newVal;                       // admin may shorten/clear
  return (newVal < oldVal) ? oldVal : newVal;       // customer: monotonic up only
}

const T = 1_900_000_000_000; // some future epoch-ms exclusion deadline

console.log('\n=== RED: customer tries to lift an active self-exclusion ===');
ok('clearing → write 0 is IGNORED (stays excluded)', applyWrite(T, 0, false) === T);
ok('shortening → smaller value is IGNORED', applyWrite(T, T - 86400000, false) === T);

console.log('\n=== GREEN: legitimate transitions still work ===');
ok('customer can EXTEND (larger value accepted)', applyWrite(T, T + 86400000, false) === T + 86400000);
ok('starting fresh (old 0 → set T) accepted', applyWrite(0, T, false) === T);
ok('unrelated save (same value) is a no-op', applyWrite(T, T, false) === T);
ok('ADMIN can clear it (back office)', applyWrite(T, 0, true) === 0);

console.log('\n' + (pass ? '🟢 self-exclusion is one-way for customers' : '🔴 one-way rule broken') + '\n');
process.exit(pass ? 0 : 1);
