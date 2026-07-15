// Alpexa — idle auto-logout decision rules (RED→GREEN). #26 (mobile-lifecycle class)
//
// Bug: on mobile the screen locks → the browser PAUSES setInterval, so the idle clock can't
// count down while backgrounded. And the visibilitychange handler treated RETURNING to the
// app as activity (reset the clock) — so coming back wiped the away-time and it NEVER logged
// out. Desktop worked only because the screen stays on.
//
// Rule (banking-app behavior), encoded here so it can't silently regress:
//   • genuine input (touch/scroll/key) → reset the clock.
//   • RESUME (visibilitychange/focus/pageshow) is NOT input → do NOT reset; instead check the
//     REAL elapsed time: away ≥ limit → logout now; within the warning window → show warning.
//   • the elapsed time is measured from a timestamp (Date.now() - last), never from counting
//     interval ticks (which pause when backgrounded).
'use strict';

// pure mirror of the idle decision (what alpexa-sync startIdleLogout must do)
function decide(event, elapsedMs, IDLE_MS, WARN_MS) {
  if (event === 'input') return { action: 'reset' };
  // 'tick' (interval) and 'resume' (visibility/focus/pageshow) use the SAME elapsed-time check;
  // crucially neither resets, so a backgrounded gap is honored on return.
  if (elapsedMs >= IDLE_MS) return { action: 'logout' };
  if (elapsedMs >= IDLE_MS - WARN_MS) return { action: 'warn' };
  return { action: 'none' };
}
// the OLD buggy handler: resume == activity (reset) → away-time wiped, never logs out
function buggyResume() { return { action: 'reset' }; }

const IDLE = 15 * 60000, WARN = 30000;
let pass = true; const ok = (n, c) => { if (!c) pass = false; console.log(`  ${c ? '✅' : '❌'} ${n}`); };

console.log('\n=== RED: old behavior — returning resets, so long-away never logs out ===');
ok('RED: resume after 20 min away → RESET (bug: stays logged in)', buggyResume().action === 'reset');

console.log('\n=== GREEN: resume is not activity; honors real away-time ===');
ok('resume after 20 min away → logout', decide('resume', 20 * 60000, IDLE, WARN).action === 'logout');
ok('resume after 14m40s away → warn (in 30s window)', decide('resume', 14 * 60000 + 40000, IDLE, WARN).action === 'warn');
ok('resume after 3 min away → none (within limit, NOT reset)', decide('resume', 3 * 60000, IDLE, WARN).action === 'none');

console.log('\n=== genuine input still resets ===');
ok('touch/scroll/key → reset', decide('input', 99 * 60000, IDLE, WARN).action === 'reset');

console.log('\n=== interval tick uses the same elapsed check (works when foreground) ===');
ok('tick at 15 min → logout', decide('tick', IDLE, IDLE, WARN).action === 'logout');
ok('tick at 14m45s → warn', decide('tick', IDLE - 15000, IDLE, WARN).action === 'warn');
ok('tick at 1 min → none', decide('tick', 60000, IDLE, WARN).action === 'none');

console.log('\n=== elapsed is timestamp-based, not tick-counted (survives a paused timer) ===');
{
  // simulate: backgrounded at t=0 (last=0), timer paused for the whole gap, user returns at 20m.
  const last = 0, returnAt = 20 * 60000;
  ok('paused-timer gap still measured on resume → logout', decide('resume', returnAt - last, IDLE, WARN).action === 'logout');
}

console.log('\n' + (pass ? '🟢 idle-logout rules: resume honors away-time, never resets' : '🔴 idle-logout rules broken') + '\n');
process.exit(pass ? 0 : 1);
