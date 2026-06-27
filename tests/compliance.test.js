// Alpexa — age (18+) + geo (sanctioned-only) gating proof.
// Uses the SAME module signup.html loads, so this test IS the contract.
'use strict';
const C = require('../compliance.js');
let pass = true;
const ok = (n, c) => { if (!c) pass = false; console.log(`  ${c ? '✅' : '❌'} ${n}`); };

// Pin "now" to today (2026-06-27) so age math is deterministic.
const NOW = Date.UTC(2026, 5, 27);

console.log('\n=== AGE: must be 18+ (underage auto-rejected) ===');
ok('exactly 18 today → allowed', C.meetsMinAge('2008-06-27', NOW) === true);
ok('18 next year (one day short) → REJECTED', C.meetsMinAge('2008-06-28', NOW) === false);
ok('just turned 19 → allowed', C.meetsMinAge('2007-06-27', NOW) === true);
ok('30 years old → allowed', C.meetsMinAge('1996-01-01', NOW) === true);
ok('10 years old → REJECTED', C.meetsMinAge('2016-01-01', NOW) === false);
ok('17 years old → REJECTED', C.meetsMinAge('2009-01-01', NOW) === false);
ok('empty DOB → REJECTED (can\'t prove age)', C.meetsMinAge('', NOW) === false);
ok('garbage DOB → REJECTED', C.meetsMinAge('not-a-date', NOW) === false);

console.log('\n=== GEO: sanctioned-only policy (block OFAC, allow the rest) ===');
ok('Russia (RU) → sanctioned/blocked', C.isSanctionedCode('RU') === true);
ok('Iran (IR) → sanctioned/blocked', C.isSanctionedCode('IR') === true);
ok('North Korea (KP) → sanctioned/blocked', C.isSanctionedCode('KP') === true);
ok('Cuba/Syria/Belarus → blocked', C.isSanctionedCode('CU') && C.isSanctionedCode('SY') && C.isSanctionedCode('BY'));
ok('Korea (KR) → allowed', C.isSanctionedCode('KR') === false);
ok('US (sanctioned-only policy) → allowed', C.isSanctionedCode('US') === false);
ok('name match: "Russia" → blocked', C.isSanctionedName('Russia') === true);
ok('name match: "South Korea" → allowed', C.isSanctionedName('South Korea') === false);
ok('code list == name list length (no orphan)', C.SANCTIONED_CODES.length === C.SANCTIONED_NAMES.length);

console.log('\n' + (pass ? '🟢 age + geo gating proven' : '🔴 gating broken') + '\n');
process.exit(pass ? 0 : 1);
