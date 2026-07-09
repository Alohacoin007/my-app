// Alpexa — every back-office view that calls esc() must have esc in scope.
// Bug: esc() is defined only LOCALLY inside a few functions (posRowHTML, viewPlayers, …),
// with NO global. viewHistory() and viewApprovals() call esc() with no local esc, so as
// soon as they render a row they throw "esc is not defined" → render() dies → the tab
// click does not switch pages (customer reported: History won't open). Fix = a GLOBAL esc.
'use strict';
const fs=require('path'), P=require('path');
const src=require('fs').readFileSync(P.join(__dirname,'..','manager-mobile.html'),'utf8');
let pass=true; const ok=(n,c)=>{ if(!c)pass=false; console.log(`  ${c?'✅':'❌'} ${n}`); };

// Top-level (2-space indent) global helper: `  function esc(` / `  var esc=` / `  const/let esc` / `window.esc=`
const hasGlobalEsc = /\n {2}(?:function esc\b|(?:var|const|let) esc\s*=)/.test(src) || /window\.esc\s*=/.test(src);

// Extract a top-level function body: from `  function NAME(){` to the next `\n  function `/`\n  var `-at-2-space.
function body(name){
  const m=src.indexOf('\n  function '+name+'(');
  if(m<0) return '';
  const after=src.slice(m+1);
  const nxt=after.slice(1).search(/\n {2}(?:function|var) [A-Za-z_]/);
  return nxt<0?after:after.slice(0,nxt+1);
}
function callsEsc(b){ return /[^A-Za-z0-9_.]esc\(/.test(b); }
function definesEscLocally(b){ return /(?:var|const|let)\s+esc\s*=|function\s+esc\b/.test(b); }

// Which top-level views call esc()? Each must resolve esc (global OR local), else it crashes on render.
const VIEWS=['viewHistory','viewApprovals','viewPlayers','viewReport','viewOverview'];
const users=VIEWS.filter(v=>callsEsc(body(v)));

console.log('\n=== views that call esc():', users.join(', '), '===');
ok('viewHistory calls esc() (row rendering)', callsEsc(body('viewHistory')));
ok('viewApprovals calls esc() (request rendering)', callsEsc(body('viewApprovals')));

// The core invariant: every esc()-calling view must have esc in scope (global, or its own local).
let allResolvable=true, offenders=[];
users.forEach(v=>{ const b=body(v); const resolvable = hasGlobalEsc || definesEscLocally(b);
  if(!resolvable){ allResolvable=false; offenders.push(v); } });

console.log('\n=== RED before fix: viewHistory/viewApprovals have no esc (no global, no local) ===');
console.log('   global esc present:', hasGlobalEsc, '| unresolved views:', offenders.join(', ')||'(none)');
ok('every esc()-calling view can resolve esc (global or local)', allResolvable);

console.log(pass?'\n🟢 admin-esc-scope: PASS':'\n🔴 admin-esc-scope: FAIL — a view calls esc() with esc not in scope (render will crash)');
process.exit(pass?0:1);
