// Alpexa — compliance gating (SINGLE SOURCE OF TRUTH for age + geo).
// Loaded by signup.html (<script src>) AND required by tests/compliance.test.js,
// so the UI gate and the test prove the SAME logic — no drift.
// NOTE: this is the client UX gate. The hard enforcement is the server trigger
// trg_guard_player_compliance (supabase/sql/compliance_guard.sql) — the client
// can be bypassed, the DB trigger cannot.
(function (root) {
  'use strict';

  // Minimum age to open any account (sports betting / leveraged trading).
  var MIN_AGE = 18;

  // OFAC comprehensively-sanctioned jurisdictions (policy: block sanctioned only).
  // ISO-2 codes. Names below must match the COUNTRIES list in signup.html exactly,
  // because the server trigger matches on the stored country NAME.
  var SANCTIONED_CODES = ['CU', 'IR', 'KP', 'SY', 'RU', 'BY'];
  var SANCTIONED_NAMES = ['Cuba', 'Iran', 'North Korea', 'Syria', 'Russia', 'Belarus'];

  // Whole years between dob and now, computed in UTC so it is deterministic
  // (a test can pin `nowMs`; the browser passes Date.now()).
  function ageFromDob(dob, nowMs) {
    if (!dob) return null;
    var b = new Date(dob + 'T00:00:00Z');
    if (isNaN(b.getTime())) return null;
    var now = (typeof nowMs === 'number') ? new Date(nowMs) : new Date();
    var a = now.getUTCFullYear() - b.getUTCFullYear();
    var mo = now.getUTCMonth() - b.getUTCMonth();
    if (mo < 0 || (mo === 0 && now.getUTCDate() < b.getUTCDate())) a--;
    return a;
  }

  function meetsMinAge(dob, nowMs) {
    var a = ageFromDob(dob, nowMs);
    return a !== null && a >= MIN_AGE;
  }

  function isSanctionedCode(code) {
    return !!code && SANCTIONED_CODES.indexOf(code) >= 0;
  }
  function isSanctionedName(name) {
    return !!name && SANCTIONED_NAMES.indexOf(name) >= 0;
  }

  var api = {
    MIN_AGE: MIN_AGE,
    SANCTIONED_CODES: SANCTIONED_CODES,
    SANCTIONED_NAMES: SANCTIONED_NAMES,
    ageFromDob: ageFromDob,
    meetsMinAge: meetsMinAge,
    isSanctionedCode: isSanctionedCode,
    isSanctionedName: isSanctionedName,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.AlpexaCompliance = api;
})(typeof window !== 'undefined' ? window : null);
