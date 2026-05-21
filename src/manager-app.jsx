// ALPEXA Manager — Top nav + main shell with left quotes rail
const { useState: useStateMgr, useEffect: useEffectMgr } = React;

function ManagerApp() {
  const [route, setRoute] = useState('clients');
  const [server, setServer] = useState('LIVE');
  const [quotesOpen, setQuotesOpen] = useState(true);
  const [clientFilter, setClientFilter] = useState('all');
  const [clientSearch, setClientSearch] = useState('');

  function openClientFilter(f) {
    setClientFilter(f);
    setRoute('clients');
  }

  return (
    <div style={{
      display:'flex', flexDirection:'column', height:'100vh', background:'var(--bg)',
      fontFamily:'var(--font)', overflow:'hidden'
    }}>
      {/* Top bar */}
      <TopBar route={route} setRoute={setRoute} server={server} setServer={setServer} quotesOpen={quotesOpen} setQuotesOpen={setQuotesOpen} openClientFilter={openClientFilter} clientSearch={clientSearch} setClientSearch={setClientSearch}/>

      {/* Module nav — moved out of top bar */}
      <ModuleNav route={route} setRoute={setRoute} openClientFilter={openClientFilter}/>

      {/* Body: left quotes panel + main content */}
      <div style={{flex:1, display:'flex', minHeight:0}}>
        {quotesOpen && <QuotesPanel server={server} onClose={()=>setQuotesOpen(false)}/>}
        <div style={{flex:1, display:'flex', flexDirection:'column', minWidth:0, minHeight:0}}>
          {route === 'clients'  && <ClientsScreen server={server} filter={clientFilter} setFilter={setClientFilter} search={clientSearch} setSearch={setClientSearch}/>}
          {route === 'accounts' && <AccountsScreen server={server}/>}
          {route === 'funding'  && <FundingScreen server={server}/>}
          {route === 'trading'  && <TradingMonitorScreen server={server}/>}
          {route === 'reports'  && <ReportsScreen server={server}/>}
          {route === 'settings' && <SystemSettingsScreen server={server}/>}
        </div>
      </div>

      <Footer server={server} setServer={setServer} openClientFilter={openClientFilter} quotesOpen={quotesOpen} setQuotesOpen={setQuotesOpen}/>
    </div>
  );
}

function Footer({ server, setServer, openClientFilter, quotesOpen, setQuotesOpen }) {
  const [time, setTime] = useStateMgr(() => new Date());
  useEffectMgr(() => {
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const local = time.toTimeString().split(' ')[0];

  const stats = {
    onlineClients: MANAGER.CLIENTS.filter(c => c.online).length,
    totalAccounts: MANAGER.ACCOUNTS.filter(a => a.tag === server).length,
    openPositions: MANAGER.POSITIONS.length,
    pendingFunding: MANAGER.FUNDING_REQUESTS.filter(r => r.status === 'pending').length,
  };
  const pendingKyc = MANAGER.CLIENTS.filter(c => c.kyc === 'pending').length;
  const blocked = MANAGER.CLIENTS.filter(c => c.status === 'blocked').length;

  return (
    <div style={{
      display:'flex', alignItems:'center', padding:'0 14px', height:30, gap:10,
      background:'var(--surface)', borderTop:'1px solid var(--line)', flexShrink:0,
      fontSize:10, color:'var(--text-3)'
    }}>
      {/* Server selector — moved to footer */}
      {setServer && <ServerSelector server={server} setServer={setServer} dropUp/>}

      <span style={{color:'var(--line-2)'}}>|</span>

      <span style={{display:'flex', alignItems:'center', gap:5, color:'#15A36C', fontWeight:700}}>
        <span style={{width:6, height:6, borderRadius:'50%', background:'#22C55E', display:'inline-block', animation:'mgrPulse 1.8s infinite'}}/>
        Connected
      </span>
      <span style={{color:'var(--line-2)'}}>|</span>
      <span className="mono">{stats.onlineClients} online · {stats.totalAccounts} accts · {stats.openPositions} pos · {stats.pendingFunding} pending</span>

      <span style={{flex:1}}/>

      {/* Alerts: Pending KYC + Blocked + New client + Quotes toggle (moved from top bar) */}
      <div style={{display:'flex', alignItems:'center', gap:1, flexShrink:0}}>
        {pendingKyc > 0 && (
          <button onClick={()=>openClientFilter && openClientFilter('pending_kyc')} title={`${pendingKyc} pending KYC`} style={{
            position:'relative', width:26, height:24, borderRadius:5,
            background:'transparent', color:'var(--text-2)', border:'none',
            cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center'
          }}
          onMouseEnter={(e)=>{ e.currentTarget.style.background = 'var(--bg)'; }}
          onMouseLeave={(e)=>{ e.currentTarget.style.background = 'transparent'; }}>
            <span style={{fontFamily:'Material Symbols Outlined', fontSize:16, color:'var(--text-2)'}}>id_card</span>
            <span className="mono" style={{position:'absolute', top:-1, right:-1, fontSize:8.5, fontWeight:800, color:'var(--ink)', lineHeight:1}}>{pendingKyc}</span>
          </button>
        )}
        {blocked > 0 && (
          <button onClick={()=>openClientFilter && openClientFilter('blocked')} title={`${blocked} blocked`} style={{
            position:'relative', width:26, height:24, borderRadius:5,
            background:'transparent', color:'var(--text-2)', border:'none',
            cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center'
          }}
          onMouseEnter={(e)=>{ e.currentTarget.style.background = 'var(--bg)'; }}
          onMouseLeave={(e)=>{ e.currentTarget.style.background = 'transparent'; }}>
            <span style={{fontFamily:'Material Symbols Outlined', fontSize:16, color:'var(--text-2)'}}>person_off</span>
            <span className="mono" style={{position:'absolute', top:-1, right:-1, fontSize:8.5, fontWeight:800, color:'var(--ink)', lineHeight:1}}>{blocked}</span>
          </button>
        )}
        <button title="New client" style={{
          width:24, height:24, borderRadius:5,
          background:'transparent', color:'var(--text-2)', border:'none', cursor:'pointer',
          display:'flex', alignItems:'center', justifyContent:'center'
        }}
        onMouseEnter={(e)=>{ e.currentTarget.style.background = 'var(--bg)'; }}
        onMouseLeave={(e)=>{ e.currentTarget.style.background = 'transparent'; }}>
          <span style={{fontFamily:'Material Symbols Outlined', fontSize:15, color:'var(--text-2)'}}>person_add</span>
        </button>
        {setQuotesOpen && (
          <button title={quotesOpen ? 'Hide quotes panel' : 'Show quotes panel'} onClick={()=>setQuotesOpen(!quotesOpen)} style={{
            width:24, height:24, borderRadius:5,
            background:'transparent',
            color: quotesOpen ? 'var(--acc-2)' : 'var(--text-2)',
            border:'none', cursor:'pointer',
            display:'flex', alignItems:'center', justifyContent:'center'
          }}
          onMouseEnter={(e)=>{ e.currentTarget.style.background = 'var(--bg)'; }}
          onMouseLeave={(e)=>{ e.currentTarget.style.background = 'transparent'; }}>
            <span style={{fontFamily:'Material Symbols Outlined', fontSize:15}}>{quotesOpen ? 'left_panel_close' : 'left_panel_open'}</span>
          </button>
        )}
      </div>

      <span style={{color:'var(--line-2)'}}>|</span>

      <a href="#" onClick={e=>e.preventDefault()} style={{color:'var(--text-3)', textDecoration:'none', display:'inline-flex', alignItems:'center', gap:3}}>
        <span style={{fontFamily:'Material Symbols Outlined', fontSize:12}}>help</span>
        Help
      </a>
      <a href="#" onClick={e=>e.preventDefault()} style={{color:'var(--text-3)', textDecoration:'none', display:'inline-flex', alignItems:'center', gap:3}}>
        <span style={{fontFamily:'Material Symbols Outlined', fontSize:12}}>menu_book</span>
        Docs
      </a>
      <a href="#" onClick={e=>e.preventDefault()} style={{color:'var(--text-3)', textDecoration:'none', display:'inline-flex', alignItems:'center', gap:3}}>
        <span style={{fontFamily:'Material Symbols Outlined', fontSize:12}}>monitoring</span>
        Status
      </a>
      <span style={{color:'var(--line-2)'}}>|</span>
      <span className="mono" title="Local time">🕐 {local}</span>
      <span style={{color:'var(--line-2)'}}>|</span>
      <span style={{fontWeight:700, color:'var(--text-2)'}}>ALPEXA SUISSE</span>
      <span style={{color:'var(--text-3)'}}>· v2.4.1</span>
    </div>
  );
}

const SERVERS = [
  { id:'LIVE',   label:'Live',   color:'#15A36C', icon:'trending_up',      sub:'FX · Stocks · Indices' },
  { id:'CRYPTO', label:'Crypto', color:'#F59E0B', icon:'currency_bitcoin', sub:'BTC · ETH · USDT' },
  { id:'SPORTS', label:'Sports', color:'#7C3AED', icon:'sports_soccer',    sub:'Betting · Odds' },
];

function ServerSelector({ server, setServer, dropUp }) {
  const [open, setOpen] = useState(false);
  const cur = SERVERS.find(s => s.id === server) || SERVERS[0];

  // Counts per server (for badge)
  const counts = {
    LIVE:   MANAGER.ACCOUNTS.filter(a => a.tag === 'LIVE').length,
    CRYPTO: MANAGER.ACCOUNTS.filter(a => a.tag === 'CRYPTO').length,
    SPORTS: 0,
  };

  return (
    <div style={{position:'relative'}}>
      <button onClick={()=>setOpen(!open)} style={{
        display:'inline-flex', alignItems:'center', gap:4, padding:0,
        background:'transparent', border:'none', cursor:'pointer',
        color:'var(--text-3)', fontSize:10, fontFamily:'inherit', fontWeight:500
      }}
      onMouseEnter={(e)=>{ e.currentTarget.style.color = 'var(--text-2)'; }}
      onMouseLeave={(e)=>{ e.currentTarget.style.color = 'var(--text-3)'; }}>
        <span style={{whiteSpace:'nowrap'}}>{cur.label}</span>
        <span style={{fontFamily:'Material Symbols Outlined', fontSize:11, transform: open ? (dropUp?'rotate(0deg)':'rotate(180deg)') : (dropUp?'rotate(180deg)':'none'), transition:'transform 0.15s'}}>expand_more</span>
      </button>
      {open && (
        <>
          <div onClick={()=>setOpen(false)} style={{position:'fixed', inset:0, zIndex:50}}/>
          <div style={{
            position:'absolute',
            ...(dropUp ? {bottom: 'calc(100% + 8px)'} : {top: 'calc(100% + 8px)'}),
            left:0, zIndex:60, minWidth:240,
            background:'var(--surface)', borderRadius:8, boxShadow:'var(--shadow-lg)',
            border:'1px solid var(--line)', overflow:'hidden'
          }}>
            <div style={{
              fontSize:9.5, fontWeight:700, color:'var(--text-3)', letterSpacing:0.6,
              padding:'8px 12px 6px', textTransform:'uppercase',
              background:'#FAF8F2', borderBottom:'1px solid var(--line)'
            }}>
              Switch Server
            </div>
            {SERVERS.map(s => {
              const sel = server === s.id;
              return (
                <button key={s.id} onClick={()=>{setServer(s.id); setOpen(false);}} style={{
                  width:'100%', display:'flex', alignItems:'center', gap:10, padding:'9px 12px',
                  background: sel ? 'var(--bg)' : 'transparent', border:'none', cursor:'pointer', textAlign:'left',
                  borderBottom:'1px solid var(--line)'
                }}
                onMouseEnter={(e)=>{ if (!sel) e.currentTarget.style.background = 'var(--bg)'; }}
                onMouseLeave={(e)=>{ if (!sel) e.currentTarget.style.background = 'transparent'; }}>
                  <span style={{
                    width:6, height:6, borderRadius:'50%', background: s.color, flexShrink:0
                  }}/>
                  <div style={{flex:1, display:'flex', flexDirection:'column', lineHeight:1.2}}>
                    <span style={{fontSize:11.5, fontWeight:700, color:'var(--ink)', letterSpacing:0.2}}>ALPEXA {s.label}</span>
                    <span style={{fontSize:9.5, color:'var(--text-3)', marginTop:2, letterSpacing:0.2}}>{s.sub}</span>
                  </div>
                  <span className="mono" style={{
                    fontSize:9.5, fontWeight:700, color:'var(--text-3)'
                  }}>{counts[s.id] || 0}</span>
                  {sel && <span style={{fontFamily:'Material Symbols Outlined', fontSize:14, color:'var(--ink)'}}>check</span>}
                </button>
              );
            })}
            <div style={{padding:'7px 12px', background:'#FAF8F2', fontSize:9.5, color:'var(--text-3)', lineHeight:1.45}}>
              Views are filtered by the selected server. Client KYC and profile are shared.
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function TopBar({ route, setRoute, server, setServer, quotesOpen, setQuotesOpen, openClientFilter, clientSearch, setClientSearch }) {
  const items = [
    { id:'clients',  icon:'group',           label:'Clients',          count: MANAGER.CLIENTS.filter(c=>c.online).length, countColor:'#22C55E' },
    { id:'accounts', icon:'account_balance', label:'Accounts',         count: MANAGER.ACCOUNTS.length },
    { id:'funding',  icon:'compare_arrows',  label:'Funding',          count: MANAGER.FUNDING_REQUESTS.filter(r=>r.status==='pending').length, countColor:'#F59E0B' },
    { id:'trading',  icon:'monitoring',      label:'Trading Monitor',  count: MANAGER.POSITIONS.length },
    { id:'reports',  icon:'analytics',       label:'Reports' },
    { id:'settings', icon:'settings',        label:'Settings' },
  ];
  return (
    <div style={{
      display:'flex', flexDirection:'column', background:'var(--surface)',
      borderBottom:'1px solid var(--line)', flexShrink:0
    }}>
      {/* Row 1 — utility bar */}
      <div style={{
        display:'flex', alignItems:'center', padding:'0 14px', height:48, gap:10
      }}>
        {/* Brand — centered over quotes panel */}
        <div style={{
          width:300, display:'flex', flexDirection:'column', alignItems:'center', gap:1,
          flexShrink:0, lineHeight:1, marginLeft:-14
        }}>
          <div style={{fontFamily:'var(--brand)', fontSize:16, fontWeight:800, color:'var(--ink)', letterSpacing:3, lineHeight:1, whiteSpace:'nowrap'}}>ALPEXA</div>
          <div style={{display:'flex', alignItems:'center', gap:5, marginTop:2}}>
            <div style={{width:18, height:1, background:'var(--line-2)'}}/>
            <span style={{fontFamily:'var(--brand)', fontSize:7.5, fontWeight:700, color:'var(--text-3)', letterSpacing:2}}>SUISSE</span>
            <div style={{width:18, height:1, background:'var(--line-2)'}}/>
          </div>
        </div>

        <span style={{flex:1}}/>

        {/* Search */}
        <div style={{display:'flex', alignItems:'center', gap:5, padding:'4px 9px', background:'var(--bg)', borderRadius:6, border:'1px solid var(--line-2)', width:220, height:28, flexShrink:0}}>
          <span style={{fontFamily:'Material Symbols Outlined', fontSize:14, color:'var(--text-3)'}}>search</span>
          <input value={clientSearch || ''} onChange={e=>setClientSearch && setClientSearch(e.target.value)} placeholder="Search clients…"
            style={{flex:1, fontSize:11, color:'var(--ink)', background:'transparent', outline:'none', border:'none', minWidth:0}}/>
        </div>

        <div style={{width:1, height:24, background:'var(--line)', margin:'0 4px', flexShrink:0}}/>

        {/* Admin */}
        <div style={{display:'flex', alignItems:'center', gap:8, flexShrink:0}}>
          <div style={{
            width:28, height:28, borderRadius:14, background:'var(--ink)', color:'var(--ink-fg)',
            display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:800, letterSpacing:0.5
          }}>AD</div>
          <div style={{display:'flex', flexDirection:'column', lineHeight:1.15}}>
            <span style={{fontSize:11, fontWeight:700, color:'var(--ink)', whiteSpace:'nowrap'}}>Admin</span>
            <span style={{fontSize:9.5, color:'var(--text-3)', whiteSpace:'nowrap'}}>admin@alpexa.com</span>
          </div>
          <button title="Sign out" style={{
            width:24, height:24, borderRadius:5, background:'transparent',
            display:'flex', alignItems:'center', justifyContent:'center', color:'var(--text-3)',
            border:'none', cursor:'pointer'
          }}>
            <span style={{fontFamily:'Material Symbols Outlined', fontSize:15}}>logout</span>
          </button>
        </div>
      </div>
    </div>
  );
}

function ModuleNav({ route, setRoute, openClientFilter }) {
  const items = [
    { id:'clients',  icon:'group',           label:'Clients',          count: MANAGER.CLIENTS.filter(c=>c.online).length, countColor:'#22C55E' },
    { id:'accounts', icon:'account_balance', label:'Accounts',         count: MANAGER.ACCOUNTS.length },
    { id:'funding',  icon:'compare_arrows',  label:'Funding',          count: MANAGER.FUNDING_REQUESTS.filter(r=>r.status==='pending').length, countColor:'#F59E0B' },
    { id:'trading',  icon:'monitoring',      label:'Trading Monitor',  count: MANAGER.POSITIONS.length },
    { id:'reports',  icon:'analytics',       label:'Reports' },
    { id:'settings', icon:'settings',        label:'Settings' },
  ];
  return (
    <div style={{
      display:'flex', alignItems:'center', justifyContent:'flex-end', padding:'0 14px', height:42, gap:2,
      background:'var(--surface)', borderBottom:'1px solid var(--line)', flexShrink:0
    }}>
      {items.map(item => {
        const active = route === item.id;
        return (
          <div key={item.id} style={{display:'flex', alignItems:'center'}}>
            <button onClick={()=>{
              setRoute(item.id);
              if (item.id === 'clients') openClientFilter && openClientFilter('all');
            }} style={{
              display:'flex', alignItems:'center', gap:5, padding:'7px 11px', borderRadius:7,
              background: active ? 'var(--acc-3)' : 'transparent',
              color:    active ? 'var(--acc-2)' : 'var(--text-2)',
              border:'none', cursor:'pointer',
              fontWeight: active ? 700 : 500, fontSize:12, whiteSpace:'nowrap', height:30
            }}
            onMouseEnter={(e)=>{ if (!active) e.currentTarget.style.background = 'var(--bg)'; }}
            onMouseLeave={(e)=>{ if (!active) e.currentTarget.style.background = 'transparent'; }}>
              <span style={{
                fontFamily:'Material Symbols Outlined', fontSize:16,
                color: active ? 'var(--acc-2)' : 'var(--text-2)',
                fontVariationSettings: `'FILL' ${active?1:0}, 'wght' 500, 'GRAD' 0, 'opsz' 24`
              }}>{item.icon}</span>
              <span>{item.label}</span>
              {item.count !== undefined && item.count > 0 && (
                <span
                  onClick={item.id === 'clients' ? (e)=>{ e.stopPropagation(); openClientFilter && openClientFilter('online'); } : undefined}
                  title={item.id === 'clients' ? 'Show online clients only' : undefined}
                  className="mono" style={{
                    fontSize:9, fontWeight:700, padding:'1px 5px', borderRadius:8,
                    background: item.countColor ? item.countColor + '22' : 'var(--bg)',
                    color: item.countColor || 'var(--text-3)',
                    cursor: item.id === 'clients' ? 'pointer' : 'default'
                  }}>{item.count}</span>
              )}
            </button>
          </div>
        );
      })}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<ManagerApp/>);
