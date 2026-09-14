// Alpexa — 아웃컴 배정 라이브 판별 (네트워크 필요 · 아침 점검/배포 후 수동)
// ============================================================================
// 질문 하나만 던진다: **지금 live_games 에 실린 가격은 어느 코드의 산출인가?**
//   OLD = teamMatch 단독 배정 (2026-09-11 D.C. United 차익 라인의 원인)
//   NEW = sideOf(엄격 우선·상호배제) + 오버라운드 가드 95% (커밋 ad810ae)
// 프로덕션 odds 풀로 두 버전을 나란히 돌려, 산출이 갈리는 경기에서 live_games 가 어느 쪽과
// 일치하는지 본다. 갈리는 경기가 0건이면 ⚪(판별 불가) — 이건 실패가 아니라 "오늘은 증거 없음".
//
// 왜 필요한가 (2026-09-14): Edge 자동배포 토큰이 죽어 수동 붙여넣기로 배포했다. 소스 락스텝
// 핀(odds-match.test.js)은 **리포의 코드**만 보지 **배포된 코드**는 못 본다. 수동 배포는 "붙여넣기
// 안 됨 / 옛 버전 재배포" 가 조용히 일어나는 경로라, 배포된 쪽을 독립 출처(라이브 산출)로 대조한다.
// CLAUDE.md: "자기 정합성 검사는 내 착각을 못 잡는다 — 독립된 두 출처를 대조해야 잡힌다."
//
// 종료코드: 🔴(라이브=OLD) 1 · 🟢/⚪ 0.   사용: node tests/odds-assign-live.js
'use strict';
const BASE='https://grxnbgtfnaayeluenvqh.supabase.co',KEY='sb_publishable_ow1DihBdAAvNtnb1H0Kojw_7vbeMKFu';
const H={apikey:KEY,Authorization:'Bearer '+KEY};
const NAME_ALIAS=[[/\bman city\b/,'manchester city'],[/\bman (?:united|utd)\b/,'manchester united'],[/\bnottm forest\b/,'nottingham forest'],[/\bspurs\b/,'tottenham hotspur'],[/\bwolves\b/,'wolverhampton wanderers'],[/\bsheff (?:utd|united)\b/,'sheffield united'],[/\bsheff wed\b/,'sheffield wednesday'],[/\bwest brom\b/,'west bromwich albion'],[/\blafc\b/,'los angeles'],[/\bnycfc\b/,'new york city'],[/\b(?:red bull ny|ny red bulls?)\b/,'new york red bulls'],[/\bpsg\b/,'saint germain'],[/\bpraha\b/,'prague']];
const LETTER_FOLD=[[/ø/g,'o'],[/æ/g,'ae'],[/œ/g,'oe'],[/ł/g,'l'],[/đ/g,'d'],[/ð/g,'d'],[/þ/g,'th'],[/ß/g,'ss'],[/ı/g,'i']];
const normBase=s=>{let t=String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase();for(const[re,to]of LETTER_FOLD)t=t.replace(re,to);return t.replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim();};
const stripClub=s=>s.replace(/\b(fc|sc|cf|afc|ac|sd|cd)\b/g,' ').replace(/\s+/g,' ').trim();
const variants=(s,min)=>{const base=normBase(s),out=[stripClub(base)];for(const[re,to]of NAME_ALIAS){if(re.test(base)){const v=stripClub(base.replace(re,to));if(v&&!out.includes(v))out.push(v);}}return out.map(v=>v.split(' ').filter(t=>t.length>min)).filter(t=>t.length>0);};
const subset=(a,b,min)=>{for(const A of variants(a,min))for(const B of variants(b,min)){const[s,l]=A.length<=B.length?[A,B]:[B,A];if(s.every(t=>l.includes(t)))return true;}return false;};
const teamMatch=(a,b)=>subset(a,b,2), teamMatchStrict=(a,b)=>subset(a,b,0);
function sideOf(name,home,away){const sh=teamMatchStrict(name,home.nm),sa=teamMatchStrict(name,away.nm);if(sh!==sa)return sh?'H':'A';if(sh&&sa)return null;const lh=teamMatch(name,home.nm),la=teamMatch(name,away.nm);if(lh!==la)return lh?'H':'A';return null;}
const decP=p=>p>0?1+p/100:1+100/-p, impliedSum=ps=>ps.reduce((s,p)=>s+1/decP(p),0);
function bestOutcome(ev,key,fn){let b=null;(ev.bookmakers||[]).forEach(bk=>{const m=(bk.markets||[]).find(x=>x.key===key);if(!m)return;(m.outcomes||[]).forEach(o=>{if(fn(o)){if(b===null||decP(o.price)>decP(b.price))b={price:o.price};}});});return b;}
const ODDS_SPORT={NFL:'americanfootball_nfl',NBA:'basketball_nba',NCAAB:'basketball_ncaab',MLB:'baseball_mlb',NHL:'icehockey_nhl'};
// 자가검사: 판별기 자신이 눈이 멀지 않았는지 — 사고 픽스처(D.C. United v Atlanta United FC)에서 OLD≠NEW 여야 한다.
// 이게 깨지면 아래 라이브 비교의 ⚪ 는 "증거 없음"이 아니라 "판별기 고장"이다.
{
  const ev={bookmakers:[{key:'x',markets:[{key:'h2h',outcomes:[{name:'D.C. United',price:125},{name:'Atlanta United FC',price:210},{name:'Draw',price:289}]}]}]};
  const home={nm:'D.C. United'},away={nm:'Atlanta'};
  const old=[bestOutcome(ev,'h2h',o=>teamMatch(o.name,home.nm)).price,bestOutcome(ev,'h2h',o=>teamMatch(o.name,away.nm)).price];
  const nw=[bestOutcome(ev,'h2h',o=>sideOf(o.name,home,away)==='H').price,bestOutcome(ev,'h2h',o=>sideOf(o.name,home,away)==='A').price];
  if(!(old[0]===210&&old[1]===210&&nw[0]===125&&nw[1]===210)){console.log('🔴 판별기 자가검사 실패 — OLD',old,'NEW',nw);process.exit(1);}
  console.log('자가검사 ✅ 사고 픽스처: OLD [210,210] (차익 90%) ≠ NEW [125,210] (정상 102%)');
}
(async()=>{
  const lg=(await (await fetch(BASE+'/rest/v1/live_games?id=eq.all&select=data,updated_at',{headers:H})).json())[0];
  const games=lg.data; const rows=await (await fetch(BASE+'/rest/v1/sports_odds?select=sport,data',{headers:H})).json();
  const bySport={};rows.forEach(r=>{bySport[r.sport]=Array.isArray(r.data)?r.data:[];});
  let checked=0,differ=0,agreeNew=0,agreeOld=0,agreeNeither=0,guardDrop=0; const detail=[];
  for(const g of games){
    if(g.lg==='GOLF'||g.oddsReal!==true)continue;
    let data=[]; if(g.lg==='SOC'){for(const k of Object.keys(bySport))if(k.startsWith('soccer_'))data=data.concat(bySport[k]);} else {data=bySport[ODDS_SPORT[g.lg]]||[]; if(g.lg==='NFL')data=data.concat(bySport['americanfootball_nfl_preseason']||[]);}
    const gt=Date.parse(g.iso||'');
    const hits=data.filter(e=>{const ok=(teamMatch(e.home_team,g.home.nm)&&teamMatch(e.away_team,g.away.nm))||(teamMatch(e.home_team,g.away.nm)&&teamMatch(e.away_team,g.home.nm));if(!ok)return false;const et=Date.parse(e.commence_time||'');return(isNaN(gt)||isNaN(et))?true:Math.abs(et-gt)<=6*3600e3;});
    if(!hits.length)continue;
    const dist=e=>{const et=Date.parse(e.commence_time||'');return isNaN(et)?Infinity:Math.abs(et-gt);};
    const ev=hits.slice().sort((a,b)=>dist(a)-dist(b))[0];
    checked++;
    // OLD
    const oH=bestOutcome(ev,'h2h',o=>teamMatch(o.name,g.home.nm)), oA=bestOutcome(ev,'h2h',o=>teamMatch(o.name,g.away.nm));
    const old=(oH&&oA)?[oH.price,oA.price]:null;
    // NEW
    const nH=bestOutcome(ev,'h2h',o=>sideOf(String(o.name||''),g.home,g.away)==='H'), nA=bestOutcome(ev,'h2h',o=>sideOf(String(o.name||''),g.home,g.away)==='A');
    const drawO=bestOutcome(ev,'h2h',o=>/draw/i.test(o.name));
    let nw=(nH&&nA)?[nH.price,nA.price]:null;
    if(nw&&impliedSum(nw)<(drawO?0.60:0.95)){nw=null;guardDrop++;}
    let nw3=(nH&&nA&&drawO&&impliedSum([nH.price,drawO.price,nA.price])>=0.95)?[nH.price,drawO.price,nA.price]:null;
    const live=(g.ml&&g.ml.length===2)?g.ml.map(o=>o.am):null;
    const live3=(g.threeWay&&g.threeWay.length===3)?g.threeWay.map(o=>o.am):null;
    const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
    if(!same(old,nw)){differ++; const mN=same(live,nw), mO=same(live,old); if(mN&&!mO)agreeNew++; else if(mO&&!mN)agreeOld++; else agreeNeither++;
      detail.push(`${g.lg} ${g.gid} ${g.home.nm} v ${g.away.nm} · OLD ${JSON.stringify(old)} · NEW ${JSON.stringify(nw)} · LIVE ${JSON.stringify(live)} → ${mN?'NEW':mO?'OLD':'?'}`);}
    // 3way 가드 확인 (축구): 라이브 3way 가 있으면 합 ≥95% 여야 함
    if(live3&&impliedSum(live3)<0.95)detail.push(`🔴 3way<95% 라이브 ${g.gid} ${JSON.stringify(live3)}`);
  }
  console.log(`live_games ${lg.updated_at} · 매칭된 실배당 경기 ${checked}`);
  console.log(`OLD≠NEW 인 경기: ${differ} → 라이브가 NEW 와 일치 ${agreeNew} · OLD 와 일치 ${agreeOld} · 둘 다 아님 ${agreeNeither}`);
  console.log(`NEW 가드로 버려질 2way 시장: ${guardDrop}`);
  detail.forEach(d=>console.log('  '+d));
  if(differ===0){console.log("⚪ 오늘 풀에는 OLD/NEW 가 갈리는 경기가 없다 — 행위로는 판별 불가 (증거 없음 ≠ 이상)");process.exit(0);}
  const good=agreeOld===0&&agreeNew>0; console.log(good?"🟢 라이브 = NEW 코드 산출 (배포 확인)":"🔴 라이브가 OLD 코드와 일치 — 배포 미반영?"); process.exit(good?0:1);
})();
