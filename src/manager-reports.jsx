// ALPEXA Manager — Reports (P&L, client stats, audit log)
function ReportsScreen() {
  const totalEquity = MANAGER.ACCOUNTS.reduce((s,a)=>s + a.equity, 0);
  const totalDeposits = MANAGER.FUNDING_REQUESTS.filter(r => r.kind === 'deposit' && r.status === 'approved').reduce((s,r)=>s+r.amount, 0);
  const totalWithdrawals = MANAGER.FUNDING_REQUESTS.filter(r => r.kind === 'withdrawal' && r.status === 'approved').reduce((s,r)=>s+r.amount, 0);
  const totalPnl = MANAGER.POSITIONS.reduce((s,p)=>s+p.pnl, 0);

  return (
    <div style={{display:'flex', flexDirection:'column', flex:1, minHeight:0}}>
      <PageHeader title="Reports" subtitle="Snapshot · 2026-05-19 · End of session" actions={
        <div style={{display:'flex', gap:8}}>
          <button style={btnGhost}>
            <span style={{fontFamily:'Material Symbols Outlined', fontSize:15}}>file_download</span>
            Export CSV
          </button>
          <button style={btnPrimary}>
            <span style={{fontFamily:'Material Symbols Outlined', fontSize:15}}>picture_as_pdf</span>
            Export PDF
          </button>
        </div>
      }/>

      <div style={{flex:1, overflowY:'auto', padding:'18px 24px 24px'}}>
        {/* KPIs */}
        <div style={{display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:12, marginBottom:18}}>
          <KpiCard label="Total Equity (USD)" value={`$${MANAGER.fmt(totalEquity, 0)}`}/>
          <KpiCard label="Deposits Today"     value={`$${MANAGER.fmt(totalDeposits, 0)}`} color="#22C55E"/>
          <KpiCard label="Withdrawals Today"  value={`$${MANAGER.fmt(totalWithdrawals, 0)}`} color="#EF4444"/>
          <KpiCard label="Open P/L"            value={`${totalPnl>=0?'+':''}$${MANAGER.fmt(totalPnl, 0)}`} color={totalPnl>=0?'#22C55E':'#EF4444'}/>
        </div>

        {/* P&L chart (simulated) */}
        <div style={{background:'var(--surface)', borderRadius:10, border:'1px solid var(--line)', padding:'16px 18px', marginBottom:16}}>
          <div style={{display:'flex', alignItems:'center', marginBottom:12}}>
            <div style={{fontSize:14, fontWeight:700, color:'var(--ink)', flex:1}}>Daily P&L · Last 30 days</div>
            <div style={{display:'flex', gap:4}}>
              {['7D','30D','90D','YTD','ALL'].map(t => (
                <button key={t} style={{
                  padding:'4px 10px', borderRadius:6, fontSize:11, fontWeight:600,
                  background: t==='30D'?'var(--ink)':'var(--bg)', color: t==='30D'?'var(--ink-fg)':'var(--text-2)',
                  border:'none', cursor:'pointer'
                }}>{t}</button>
              ))}
            </div>
          </div>
          <svg viewBox="0 0 800 200" preserveAspectRatio="none" style={{width:'100%', height:200}}>
            <defs>
              <linearGradient id="rep-grad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#22C55E" stopOpacity="0.25"/>
                <stop offset="100%" stopColor="#22C55E" stopOpacity="0"/>
              </linearGradient>
            </defs>
            {[1,2,3].map(i => <line key={i} x1="0" y1={50*i} x2="800" y2={50*i} stroke="var(--line)"/>)}
            <path d="M0,150 L27,148 L53,142 L80,138 L107,130 L133,135 L160,128 L187,118 L213,122 L240,108 L267,98 L293,102 L320,88 L347,82 L373,90 L400,72 L427,68 L453,58 L480,62 L507,50 L533,42 L560,46 L587,38 L613,32 L640,26 L667,30 L693,24 L720,18 L747,22 L773,16 L800,12 L800,200 L0,200 Z" fill="url(#rep-grad)"/>
            <path d="M0,150 L27,148 L53,142 L80,138 L107,130 L133,135 L160,128 L187,118 L213,122 L240,108 L267,98 L293,102 L320,88 L347,82 L373,90 L400,72 L427,68 L453,58 L480,62 L507,50 L533,42 L560,46 L587,38 L613,32 L640,26 L667,30 L693,24 L720,18 L747,22 L773,16 L800,12" fill="none" stroke="#22C55E" strokeWidth="2"/>
          </svg>
        </div>

        {/* Two-column: Top traders + Recent admin activity */}
        <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:16}}>

          {/* Top traders */}
          <div style={{background:'var(--surface)', borderRadius:10, border:'1px solid var(--line)', padding:'16px 18px'}}>
            <div style={{fontSize:14, fontWeight:700, color:'var(--ink)', marginBottom:12}}>Top Traders (by Open P/L)</div>
            {(() => {
              const byClient = {};
              MANAGER.POSITIONS.forEach(p => { byClient[p.clientId] = (byClient[p.clientId] || 0) + p.pnl; });
              const sorted = Object.entries(byClient).sort((a,b)=>b[1]-a[1]).slice(0, 6);
              return sorted.map(([cid, pnl], i) => {
                const c = MANAGER.findClient(cid);
                return (
                  <div key={cid} style={{display:'flex', alignItems:'center', gap:10, padding:'8px 0', borderTop: i===0 ? 'none' : '1px solid var(--line)'}}>
                    <span className="mono" style={{fontSize:11, color:'var(--text-3)', width:18}}>#{i+1}</span>
                    <div style={{flex:1}}>
                      <div style={{fontSize:13, fontWeight:600, color:'var(--ink)'}}>{c?.firstName} {c?.lastName}</div>
                      <div className="mono" style={{fontSize:10.5, color:'var(--text-3)'}}>{cid.toUpperCase()} · {c?.country}</div>
                    </div>
                    <span className="mono" style={{fontSize:13, fontWeight:700, color: pnl>=0?'#22C55E':'#EF4444'}}>
                      {pnl>=0?'+':''}${MANAGER.fmt(pnl)}
                    </span>
                  </div>
                );
              });
            })()}
          </div>

          {/* Admin activity */}
          <div style={{background:'var(--surface)', borderRadius:10, border:'1px solid var(--line)', padding:'16px 18px'}}>
            <div style={{fontSize:14, fontWeight:700, color:'var(--ink)', marginBottom:12}}>Admin Activity Log</div>
            {MANAGER.ADMIN_ACTIVITY.map((a, i) => (
              <div key={i} style={{display:'flex', flexDirection:'column', gap:2, padding:'9px 0', borderTop: i===0 ? 'none' : '1px solid var(--line)'}}>
                <div style={{display:'flex', alignItems:'center', gap:8}}>
                  <span style={{fontSize:12.5, fontWeight:600, color:'var(--ink)'}}>{a.action}</span>
                  <span style={{flex:1}}/>
                  <span className="mono" style={{fontSize:10, color:'var(--text-3)'}}>{a.ts.split(' ')[1]}</span>
                </div>
                <div style={{fontSize:11, color:'var(--text-2)'}}>{a.target}</div>
                <div className="mono" style={{fontSize:10, color:'var(--text-3)'}}>{a.user} · {a.ip}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

const btnGhost = {
  display:'inline-flex', alignItems:'center', gap:6, padding:'8px 12px', borderRadius:8,
  background:'var(--bg)', color:'var(--text-2)', fontSize:12.5, fontWeight:600, letterSpacing:0.2,
  border:'1px solid var(--line-2)', cursor:'pointer'
};

Object.assign(window, { ReportsScreen, btnGhost });
