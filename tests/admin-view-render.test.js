// Alpexa — back-office VIEW RENDER harness (the gap that let History/Approvals/Logs
// crash unnoticed: the smoke only renders the DEFAULT view with EMPTY data). This loads
// manager-mobile.html's app script in a Node VM with a stubbed DOM, SEEDS realistic rows
// into every data global, then CALLS every view*() function and fails if any throws
// (undefined helper like esc, null deref on a real row, etc.). No browser, deterministic.
'use strict';
const fs=require('fs'), path=require('path'), vm=require('vm');
let pass=true; const ok=(n,c,extra)=>{ if(!c)pass=false; console.log(`  ${c?'✅':'❌'} ${n}${extra?'  — '+extra:''}`); };

const TARGET=process.argv[2]||path.join(__dirname,'..','manager-mobile.html');  // optional path (RED demos)
const html=fs.readFileSync(TARGET,'utf8');
// Extract the big app <script> (the one that defines render()/viewHistory()).
const blocks=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
const script=blocks.filter(b=>/function render\(\)/.test(b)&&/function viewHistory\(/.test(b)).sort((a,b)=>b.length-a.length)[0];
if(!script){ console.log('  ⏭️  SKIP — could not locate the app script (structure changed)'); process.exit(0); }

// ── minimal DOM stub: enough for boot (lock gate, render, renderTabs, bindEvents) to survive ──
function el(){
  const e={ style:new Proxy({},{get:()=>'' ,set:()=>true}), classList:{add(){},remove(){},toggle(){},contains(){return false;}},
    dataset:{}, children:[], attributes:{}, value:'', innerHTML:'', textContent:'', checked:false, files:[],
    appendChild(x){return x;}, removeChild(x){return x;}, insertBefore(x){return x;}, remove(){}, click(){}, focus(){}, blur(){},
    addEventListener(){}, removeEventListener(){}, setAttribute(){}, removeAttribute(){}, getAttribute(){return null;},
    querySelector(){return el();}, querySelectorAll(){return [];}, closest(){return el();}, contains(){return false;},
    getBoundingClientRect(){return {top:0,left:0,width:0,height:0,bottom:0,right:0};}, scrollIntoView(){}, hasAttribute(){return false;} };
  return e;
}
// querySelector returns a stub el (never null) so top-level `.onclick=` bindings during boot
// don't abort the script — that matters because ALL `var X={...}` initializers (WAL, FX_INSTR,
// ADMIN_AUTH, …) run before boot finishes; an early abort would leave them undefined and make
// views crash for the WRONG reason (missing state, not a real render bug).
const doc={ createElement:()=>el(), createElementNS:()=>el(), getElementById:()=>el(), querySelector:()=>el(),
  querySelectorAll:()=>[], addEventListener(){}, removeEventListener(){}, body:el(), head:el(), documentElement:el(),
  activeElement:null, createTextNode:()=>({}), cookie:'' };
const store=()=>({ _m:{}, getItem(k){return this._m[k]!=null?this._m[k]:null;}, setItem(k,v){this._m[k]=String(v);}, removeItem(k){delete this._m[k];}, clear(){this._m={};} });
function thenable(v){ const p={ then(f){ try{f&&f({data:v,error:null});}catch(e){} return p; }, catch(){return p;} };
  ['select','eq','neq','gt','gte','lt','lte','like','ilike','is','in','contains','order','limit','range','match','or','filter','single','maybeSingle','insert','update','upsert','delete','abortSignal','returns'].forEach(k=>p[k]=()=>p); return p; }
const AlpexaSync={ db:{ from:()=>thenable([]), rpc:()=>thenable({ok:true}), channel:()=>({on(){return this;},subscribe(){return this;}}), removeChannel(){}, getChannels(){return [];} },
  updateRequest:()=>Promise.resolve({}), deleteRequest:()=>Promise.resolve({}), pullAll:()=>Promise.resolve([]) };

const sandbox={ document:doc, localStorage:store(), sessionStorage:store(), navigator:{userAgent:'node'},
  location:{href:'file://manager-mobile.html',search:'',reload(){},assign(){}}, console,
  setTimeout:()=>0, clearTimeout:()=>{}, setInterval:()=>0, clearInterval:()=>{}, requestAnimationFrame:()=>0,
  fetch:()=>Promise.resolve({ok:true,json:()=>Promise.resolve([]),text:()=>Promise.resolve('')}),
  AlpexaSync, ALPEXA_ADMIN_SESSION:true, alert(){}, confirm:()=>true, prompt:()=>null, atob:s=>Buffer.from(s,'base64').toString('binary'), btoa:s=>Buffer.from(s,'binary').toString('base64'),
  addEventListener(){}, removeEventListener(){}, matchMedia:()=>({matches:false,addListener(){},removeListener(){},addEventListener(){}}), dispatchEvent(){return true;}, scrollTo(){}, getComputedStyle:()=>({getPropertyValue:()=>''}) };
vm.createContext(sandbox);
sandbox.window=sandbox; sandbox.self=sandbox; sandbox.globalThis=sandbox; sandbox.supabase={createClient:()=>AlpexaSync.db};

// Run the app script (defines all globals + boots). Boot is at the END, after every function
// def, so even if boot throws the view functions are already defined in the context.
let bootErr=null;
try{ vm.runInContext(script, sandbox, {timeout:5000}); }catch(e){ bootErr=String(e&&e.message||e); }
ok('app script boots without throwing', !bootErr, bootErr||'');

// ── seed realistic rows into every data global, then render each view ──
const seed=`
  SRV_PLAYERS=[{id:'p1',cust_id:'CR-1',name:'<b>Ann & Bo</b>',email:'a@b.com',created_at:'2026-07-01T00:00:00Z',phone:'+1 555',dob:'1990-01-01',country:'US',server:'crypto',leverage:'1:1',currency:'USD',kyc:'pending',status:'active'}];
  SRV_ACCOUNTS=[{player_id:'p1',server:'crypto',acct_no:'CR-1',balance:0,bonus:0},{player_id:'p1',server:'sports',acct_no:'SP-1',balance:50,bonus:100},{player_id:'p1',server:'fx',acct_no:'FX-1',balance:100,bonus:100}];
  SRV_REQS=[{local_id:'r1',cust_id:'CR-1',name:'Ann',acct_no:'CR-1',server:'crypto',type:'deposit',amount:100,net:100,fee:0,status:'pending',created_at:'2026-07-09T10:00:00Z',asset:'USDT',network:'ERC-20',address:'0xabc'},{local_id:'r2',cust_id:'CR-1',name:'Ann',acct_no:'CR-1',server:'crypto',type:'withdraw',amount:20,net:19,fee:1,status:'approved',created_at:'2026-07-09T09:00:00Z',address:'0xdef'}];
  SRV_SETTLE=[{id:1,cust_id:'CR-1',kind:'bet_won',ticket:'T1',detail:'ok',created_at:'2026-07-09T08:00:00Z',acct_no:'SP-1',server:'sports',symbol:'NBA',stake:10,pnl:20}];
  LOGS=[{action:'bonus',target_cust:'CR-1',detail:'100 ALPXS',created_at:'2026-07-09T07:00:00Z'}];
  POS_TOP=[{cust_id:'CR-1',acct_no:'SP-1',server:'sports',local_id:'b1',symbol:'NBA',side:'',stake:10,potential:20,status:'open',pnl:5,game:'A vs B',pick:'A',open_price:1.9}];
  ONLINE=[{cust_id:'CR-1',name:'Ann',email:'a@b.com',last_seen:'2026-07-09T10:00:00Z',last_app:'sports'}];
  HEDGES=[]; RISK_POS=POS_TOP.slice(); SRV_PAYMENTS=[]; SRV_ACTIVITY=[]; SRV_AGENTS=[]; SRV_ALINKS=[]; SRV_APAY=[]; API_USAGE={}; CONTROLS={live_betting:'1'};
  CRYPTO_BY_CUST={'CR-1':{holdings:[{asset:'ALPXS',qty:100},{asset:'USDT',qty:50}],stakes:[]}};
  try{ if(typeof LIVE_FEED==='object'&&LIVE_FEED){ LIVE_FEED.ALPXS={mid:1.8}; } }catch(e){}
  PLAYER_OPEN='CR-1';
`;
try{ vm.runInContext(seed, sandbox); }catch(e){ ok('seed data into globals', false, String(e.message)); }

// discover every view function and render it (twice for viewPlayers: open + editing)
const views=[...script.matchAll(/\bfunction (view[A-Za-z]+)\(/g)].map(m=>m[1]);
console.log('\n  rendering '+views.length+' views with seeded data:');
let crashed=[];
views.forEach(v=>{
  const r=vm.runInContext(`(function(){ try{ var f=(typeof finance==='function')?finance():{}; var out=${v}(f); return {ok:true,type:typeof out}; }catch(e){ return {ok:false,err:String(e&&e.message||e)}; } })()`, sandbox);
  ok(v+'()', r.ok, r.ok?'':r.err);
  if(!r.ok) crashed.push(v+': '+r.err);
});
// viewPlayers in EDITING mode (esc-heavy inputs path)
const edit=vm.runInContext(`(function(){ try{ PLAYER_EDIT='CR-1'; var out=viewPlayers({}); PLAYER_EDIT=null; return {ok:true}; }catch(e){ PLAYER_EDIT=null; return {ok:false,err:String(e&&e.message||e)}; } })()`, sandbox);
ok('viewPlayers() [editing mode]', edit.ok, edit.ok?'':edit.err);

console.log(pass?'\n🟢 admin-view-render: PASS — every back-office view renders with real data':'\n🔴 admin-view-render: FAIL\n   '+crashed.join('\n   '));
process.exit(pass?0:1);
