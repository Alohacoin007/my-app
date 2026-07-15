// ALPEXA Manager — Trading Monitor (real-time positions / exposure)
function TradingMonitorScreen() {
  const [filter, setFilter] = useState('all');
  const positions = MANAGER.POSITIONS;

  // Exposure by symbol
  const exposureBySymbol = {};
  positions.forEach(p => {
    const sign = p.side === 'BUY' ? 1 : -1;
    const notional = p.vol * p.current * (p.sym.startsWith('XAU') ? 100 : p.sym.endsWith('USD') || /^[A-Z]{3}USD$/.test(p.sym) ? 100000 : 1);
    exposureBySymbol[p.sym] = (exposureBySymbol[p.sym] || 0) + sign * Math.min(notional, 1000000);
  });
  const totalPnl = positions.reduce((s,p)=>s+(p.pnl||0), 0);
  const winners = positions.filter(p => p.pnl >= 0).length;
  const losers  = positions.filter(p => p.pnl < 0).length;

  const filtered = filter === 'all' ? positions
    : filter === 'winners' ? positions.filter(p => p.pnl >= 0)
    : filter === 'losers'  ? positions.filter(p => p.pnl < 0)
    : positions;

  return (
    <div style={{display:'flex', flexDirection:'column', flex:1, minHeight:0}}>
      <PageHeader title="Trading Monitor" subtitle={`${positions.length} open positions across ${new Set(positions.map(p=>p.clientId)).size} clients`}/>

      {/* KPI row */}
      <div style={{display:'grid', gridTemplateColumns:'repeat(5, 1fr)', gap:12, padding:'16px 24px 0'}}>
        <KpiCard label="Total Open P/L" value={`${totalPnl>=0?'+':''}$${MANAGER.fmt(totalPnl)}`} color={totalPnl>=0?'#22C55E':'#EF4444'}/>
        <KpiCard label="Positions"      value={positions.length}/>
        <KpiCard label="Winning"        value={winners} color="#22C55E"/>
        <KpiCard label="Losing"         value={losers} color="#EF4444"/>
        <KpiCard label="Win Rate"       value={`${((winners/positions.length)*100).toFixed(0)}%`}/>
      </div>

      {/* Exposure heatmap */}
      <div style={{padding:'16px 24px 0'}}>
        <div style={{background:'var(--surface)', borderRadius:10, border:'1px solid var(--line)', padding:'14px 16px'}}>
          <div style={{fontSize:11, fontWeight:700, color:'var(--text-3)', letterSpacing:0.6, marginBottom:10, textTransform:'uppercase'}}>Exposure by Symbol (USD)</div>
          <div style={{display:'flex', gap:8, flexWrap:'wrap'}}>
            {Object.entries(exposureBySymbol).sort((a,b)=>Math.abs(b[1])-Math.abs(a[1])).map(([sym, val]) => {
              const long = val >= 0;
              const magnitude = Math.min(Math.abs(val) / 1000000, 1);
              return (
                <div key={sym} style={{
                  display:'flex', alignItems:'center', gap:6, padding:'7px 11px', borderRadius:8,
                  background: long ? `rgba(34,197,94,${0.08 + magnitude*0.22})` : `rgba(239,68,68,${0.08 + magnitude*0.22})`,
                  border:'1px solid ' + (long ? '#86EFAC' : '#FCA5A5')
                }}>
                  <span style={{fontSize:11.5, fontWeight:700, color:'var(--ink)'}}>{sym}</span>
                  <span className="mono" style={{fontSize:11, fontWeight:700, color: long ? '#15803D' : '#B91C1C'}}>
                    {long?'+':'−'}${MANAGER.fmt(Math.abs(val), 0)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Filters */}
      <div style={{display:'flex', alignItems:'center', gap:10, padding:'14px 24px', background:'var(--surface)', borderBottom:'1px solid var(--line)', marginTop:16}}>
        <FilterChip active={filter==='all'}     onClick={()=>setFilter('all')}     label="All"     count={positions.length}/>
        <FilterChip active={filter==='winners'} onClick={()=>setFilter('winners')} label="Winners" count={winners} dot="#22C55E"/>
        <FilterChip active={filter==='losers'}  onClick={()=>setFilter('losers')}  label="Losers"  count={losers} dot="#EF4444"/>
      </div>

      {/* Positions table */}
      <div style={{flex:1, overflowY:'auto', padding:'16px 24px 24px'}}>
        <div style={{background:'var(--surface)', borderRadius:10, border:'1px solid var(--line)', overflow:'hidden'}}>
          <div style={{display:'grid', gridTemplateColumns:'1fr 80px 70px 80px 120px 120px 120px 130px', padding:'10px 16px', background:'var(--bg)', borderBottom:'1px solid var(--line)', fontSize:10, fontWeight:700, color:'var(--text-3)', letterSpacing:0.5, textTransform:'uppercase'}}>
            <span>Client</span><span>Symbol</span><span>Side</span>
            <span style={{textAlign:'right'}}>Vol</span>
            <span style={{textAlign:'right'}}>Open</span>
            <span style={{textAlign:'right'}}>Current</span>
            <span style={{textAlign:'right'}}>Unrealized P/L</span>
            <span style={{textAlign:'right'}}>Opened</span>
          </div>
          {filtered.map(p => {
            const c = MANAGER.findClient(p.clientId);
            return (
              <div key={p.id} style={{display:'grid', gridTemplateColumns:'1fr 80px 70px 80px 120px 120px 120px 130px', padding:'12px 16px', borderBottom:'1px solid var(--line)', alignItems:'center', fontSize:12.5}}>
                <div>
                  <div style={{fontWeight:700, color:'var(--ink)'}}>{c ? `${c.firstName} ${c.lastName}` : '—'}</div>
                  <div className="mono" style={{fontSize:10, color:'var(--text-3)'}}>{c?.id.toUpperCase()} · {p.accountId.toUpperCase()}</div>
                </div>
                <span style={{fontWeight:700, color:'var(--ink)'}}>{p.sym}</span>
                <span style={{
                  fontSize:9.5, fontWeight:800, padding:'2px 5px', borderRadius:3, justifySelf:'flex-start', letterSpacing:0.3,
                  background: p.side==='BUY'?'#E8F5E9':'#FFEBEE',
                  color:      p.side==='BUY'?'#1B5E20':'#C62828'
                }}>{p.side}</span>
                <span className="mono" style={{textAlign:'right', color:'var(--text-2)'}}>{p.vol}</span>
                <span className="mono" style={{textAlign:'right', color:'var(--text-2)'}}>{p.open}</span>
                <span className="mono" style={{textAlign:'right', color:'var(--ink)', fontWeight:600}}>{p.current}</span>
                <span className="mono" style={{textAlign:'right', fontWeight:700, color: p.pnl >= 0 ? '#22C55E' : '#EF4444'}}>
                  {p.pnl>=0?'+':''}${MANAGER.fmt(p.pnl)}
                </span>
                <span style={{textAlign:'right', fontSize:11, color:'var(--text-3)'}}>{p.opened.split(' ')[1]}<br/><span style={{fontSize:10}}>{p.opened.split(' ')[0]}</span></span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function KpiCard({ label, value, color }) {
  return (
    <div style={{background:'var(--surface)', border:'1px solid var(--line)', borderRadius:10, padding:'14px 16px'}}>
      <div style={{fontSize:10, fontWeight:700, color:'var(--text-3)', letterSpacing:0.6, textTransform:'uppercase'}}>{label}</div>
      <div className="mono" style={{fontSize:22, fontWeight:700, color: color || 'var(--ink)', marginTop:5, letterSpacing:-0.3}}>{value}</div>
    </div>
  );
}

Object.assign(window, { TradingMonitorScreen, KpiCard });
