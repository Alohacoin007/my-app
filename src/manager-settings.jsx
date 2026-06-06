// ALPEXA Manager — System Settings (spread markup, leverage limits, etc.)
function SystemSettingsScreen() {
  const [markup, setMarkup] = useState({...MANAGER.SYSTEM_SETTINGS.spreadMarkup});
  const [savedAt, setSavedAt] = useState(null);

  function save() {
    MANAGER.SYSTEM_SETTINGS.spreadMarkup = { ...markup };
    setSavedAt(new Date().toLocaleTimeString());
  }

  // Sample base spreads for preview (in pips/points)
  const SAMPLE_SYMS = [
    { sym:'EURUSD', cls:'FX',     base:0.8,  digits:5 },
    { sym:'GBPUSD', cls:'FX',     base:1.0,  digits:5 },
    { sym:'USDJPY', cls:'FX',     base:1.2,  digits:3 },
    { sym:'XAUUSD', cls:'METAL',  base:18,   digits:2 },
    { sym:'AAPL',   cls:'STOCK',  base:3,    digits:2 },
    { sym:'TSLA',   cls:'STOCK',  base:4,    digits:2 },
    { sym:'BTCUSD', cls:'CRYPTO', base:45,   digits:1 },
    { sym:'ETHUSD', cls:'CRYPTO', base:65,   digits:2 },
    { sym:'NAS100', cls:'INDEX',  base:12,   digits:1 },
    { sym:'SPX500', cls:'INDEX',  base:5,    digits:1 },
  ];

  const CLASSES = [
    { id:'FX',     label:'Forex',      icon:'currency_exchange', sub:'Major and minor currency pairs' },
    { id:'METAL',  label:'Metals',     icon:'savings',           sub:'Gold (XAUUSD), Silver (XAGUSD)' },
    { id:'STOCK',  label:'Stocks',     icon:'business',          sub:'US, EU, Asia equities CFD' },
    { id:'CRYPTO', label:'Crypto',     icon:'currency_bitcoin',  sub:'BTC, ETH and other crypto CFDs' },
    { id:'INDEX',  label:'Indices',    icon:'show_chart',        sub:'NAS100, SPX500, GER40 etc.' },
  ];

  return (
    <div style={{display:'flex', flexDirection:'column', flex:1, minHeight:0}}>
      <PageHeader title="System Settings" subtitle="Broker-side parameters · applies to all clients" actions={
        <div style={{display:'flex', alignItems:'center', gap:10}}>
          {savedAt && <span style={{fontSize:11, color:'#22C55E', fontWeight:600}}>✓ Saved at {savedAt}</span>}
          <button onClick={()=>setMarkup({FX:0,STOCK:0,CRYPTO:0,INDEX:0,METAL:0})} style={btnGhost}>Reset</button>
          <button onClick={save} style={btnPrimary}>
            <span style={{fontFamily:'Material Symbols Outlined', fontSize:15}}>save</span>
            Save Changes
          </button>
        </div>
      }/>

      <div style={{flex:1, overflowY:'auto', padding:'18px 24px 24px'}}>

        {/* Section: Spread Markup */}
        <div style={{background:'var(--surface)', borderRadius:10, border:'1px solid var(--line)', padding:'18px 20px', marginBottom:16}}>
          <div style={{display:'flex', alignItems:'flex-start', gap:10, marginBottom:6}}>
            <span style={{fontFamily:'Material Symbols Outlined', fontSize:22, color:'var(--acc-2)'}}>tune</span>
            <div style={{flex:1}}>
              <div style={{fontSize:15, fontWeight:700, color:'var(--ink)'}}>Spread Markup</div>
              <div style={{fontSize:12, color:'var(--text-3)', marginTop:3}}>
                Add a markup (in points) to liquidity provider spreads. This is the broker's revenue per trade. Applied to all clients in this group.
              </div>
            </div>
          </div>

          <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginTop:18}}>
            {CLASSES.map(cls => {
              const presets = cls.id === 'CRYPTO' ? [0, 10, 25, 50, 100] : cls.id === 'STOCK' ? [0, 1, 2, 3, 5] : [0, 0.5, 1, 2, 5];
              const val = markup[cls.id] ?? 0;
              return (
                <div key={cls.id} style={{background:'var(--bg)', borderRadius:10, padding:'14px 16px'}}>
                  <div style={{display:'flex', alignItems:'center', gap:10, marginBottom:12}}>
                    <div style={{
                      width:34, height:34, borderRadius:8, background:'var(--surface)', color:'var(--acc-2)',
                      display:'flex', alignItems:'center', justifyContent:'center'
                    }}>
                      <span style={{fontFamily:'Material Symbols Outlined', fontSize:20}}>{cls.icon}</span>
                    </div>
                    <div style={{flex:1}}>
                      <div style={{fontSize:13, fontWeight:700, color:'var(--ink)'}}>{cls.label}</div>
                      <div style={{fontSize:10.5, color:'var(--text-3)', marginTop:1}}>{cls.sub}</div>
                    </div>
                    <div style={{textAlign:'right'}}>
                      <div className="mono" style={{fontSize:18, fontWeight:700, color:'var(--ink)'}}>+{val}</div>
                      <div style={{fontSize:9.5, color:'var(--text-3)', marginTop:1, letterSpacing:0.3}}>POINTS</div>
                    </div>
                  </div>
                  <div style={{display:'flex', gap:4, marginBottom:8}}>
                    {presets.map(p => (
                      <button key={p} onClick={()=>setMarkup({...markup, [cls.id]: p})} className="mono" style={{
                        flex:1, padding:'7px 0', borderRadius:6, fontSize:11, fontWeight:700,
                        background: val === p ? 'var(--ink)' : 'var(--surface)',
                        color:    val === p ? 'var(--ink-fg)' : 'var(--text-2)',
                        border:'1px solid ' + (val === p ? 'var(--ink)' : 'var(--line-2)'),
                        cursor:'pointer'
                      }}>+{p}</button>
                    ))}
                  </div>
                  <input type="range" min="0" max={cls.id==='CRYPTO'?200:cls.id==='STOCK'?10:10} step={cls.id==='CRYPTO'?5:0.1} value={val}
                    onChange={e=>setMarkup({...markup, [cls.id]: parseFloat(e.target.value)})}
                    style={{width:'100%', accentColor:'var(--acc)'}}/>
                </div>
              );
            })}
          </div>
        </div>

        {/* Live Preview */}
        <div style={{background:'var(--surface)', borderRadius:10, border:'1px solid var(--line)', padding:'18px 20px', marginBottom:16}}>
          <div style={{display:'flex', alignItems:'center', gap:10, marginBottom:14}}>
            <span style={{fontFamily:'Material Symbols Outlined', fontSize:20, color:'var(--acc-2)'}}>visibility</span>
            <div style={{flex:1}}>
              <div style={{fontSize:14, fontWeight:700, color:'var(--ink)'}}>Live Preview</div>
              <div style={{fontSize:11, color:'var(--text-3)', marginTop:2}}>How spreads will appear to clients after markup is applied</div>
            </div>
          </div>
          <div style={{display:'grid', gridTemplateColumns:'1fr 80px 110px 110px 110px', padding:'8px 14px', background:'var(--bg)', borderRadius:8, fontSize:10, fontWeight:700, color:'var(--text-3)', letterSpacing:0.5, textTransform:'uppercase', marginBottom:4}}>
            <span>Symbol</span><span>Class</span>
            <span style={{textAlign:'right'}}>LP Spread</span>
            <span style={{textAlign:'right'}}>+ Markup</span>
            <span style={{textAlign:'right'}}>Client sees</span>
          </div>
          {SAMPLE_SYMS.map(s => {
            const m = markup[s.cls] ?? 0;
            const total = s.base + m;
            return (
              <div key={s.sym} style={{display:'grid', gridTemplateColumns:'1fr 80px 110px 110px 110px', padding:'9px 14px', borderBottom:'1px solid var(--line)', alignItems:'center', fontSize:12.5}}>
                <span style={{fontWeight:700, color:'var(--ink)'}}>{s.sym}</span>
                <span style={{fontSize:10, fontWeight:700, color:'var(--text-3)'}}>{s.cls}</span>
                <span className="mono" style={{textAlign:'right', color:'var(--text-2)'}}>{s.base.toFixed(1)} pt</span>
                <span className="mono" style={{textAlign:'right', color: m > 0 ? '#F59E0B' : 'var(--text-3)', fontWeight:600}}>{m > 0 ? `+${m.toFixed(1)} pt` : '—'}</span>
                <span className="mono" style={{textAlign:'right', color:'var(--ink)', fontWeight:700}}>{total.toFixed(1)} pt</span>
              </div>
            );
          })}
        </div>

        {/* Section: other settings stub */}
        <div style={{background:'var(--surface)', borderRadius:10, border:'1px solid var(--line)', padding:'18px 20px'}}>
          <div style={{display:'flex', alignItems:'center', gap:10, marginBottom:14}}>
            <span style={{fontFamily:'Material Symbols Outlined', fontSize:20, color:'var(--acc-2)'}}>shield</span>
            <div style={{flex:1}}>
              <div style={{fontSize:14, fontWeight:700, color:'var(--ink)'}}>Risk Thresholds</div>
              <div style={{fontSize:11, color:'var(--text-3)', marginTop:2}}>Margin call and stop-out levels apply to all client groups</div>
            </div>
          </div>
          <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:14}}>
            <div style={{background:'var(--bg)', borderRadius:9, padding:'14px 16px'}}>
              <div style={{fontSize:10, fontWeight:700, color:'var(--text-3)', letterSpacing:0.5, marginBottom:6}}>MARGIN CALL LEVEL</div>
              <div className="mono" style={{fontSize:22, fontWeight:700, color:'#F59E0B'}}>100%</div>
              <div style={{fontSize:10.5, color:'var(--text-3)', marginTop:3}}>Equity / Used Margin × 100</div>
            </div>
            <div style={{background:'var(--bg)', borderRadius:9, padding:'14px 16px'}}>
              <div style={{fontSize:10, fontWeight:700, color:'var(--text-3)', letterSpacing:0.5, marginBottom:6}}>STOP OUT LEVEL</div>
              <div className="mono" style={{fontSize:22, fontWeight:700, color:'#EF4444'}}>50%</div>
              <div style={{fontSize:10.5, color:'var(--text-3)', marginTop:3}}>Force-close positions below this</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { SystemSettingsScreen });
