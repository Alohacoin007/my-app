// ALPEXA Manager — Quotes panel (left rail) with per-symbol spread markup
const { useState: useStateQ, useEffect: useEffectQ } = React;
const QUOTE_SYMBOLS = [
  { sym:'EURUSD', name:'Euro / US Dollar',         cls:'FX',     bid:1.08412, digits:5, baseSpread:0.8 },
  { sym:'GBPUSD', name:'British Pound / USD',      cls:'FX',     bid:1.26834, digits:5, baseSpread:1.0 },
  { sym:'USDJPY', name:'US Dollar / Yen',          cls:'FX',     bid:156.342, digits:3, baseSpread:1.2 },
  { sym:'AUDUSD', name:'Australian / US Dollar',   cls:'FX',     bid:0.66124, digits:5, baseSpread:1.4 },
  { sym:'USDCHF', name:'US Dollar / Swiss Franc',  cls:'FX',     bid:0.91024, digits:5, baseSpread:1.2 },
  { sym:'USDCAD', name:'US Dollar / Canadian',     cls:'FX',     bid:1.36420, digits:5, baseSpread:1.5 },
  { sym:'XAUUSD', name:'Gold Spot',                cls:'METAL',  bid:2348.15, digits:2, baseSpread:18 },
  { sym:'XAGUSD', name:'Silver Spot',              cls:'METAL',  bid:30.420,  digits:3, baseSpread:25 },
  { sym:'AAPL',   name:'Apple Inc.',               cls:'STOCK',  bid:218.74,  digits:2, baseSpread:3 },
  { sym:'TSLA',   name:'Tesla Inc.',               cls:'STOCK',  bid:247.31,  digits:2, baseSpread:4 },
  { sym:'NVDA',   name:'NVIDIA Corp.',             cls:'STOCK',  bid:924.18,  digits:2, baseSpread:7 },
  { sym:'MSFT',   name:'Microsoft Corp.',          cls:'STOCK',  bid:418.52,  digits:2, baseSpread:4 },
  { sym:'GOOGL',  name:'Alphabet Inc.',            cls:'STOCK',  bid:172.85,  digits:2, baseSpread:3 },
  { sym:'META',   name:'Meta Platforms Inc.',      cls:'STOCK',  bid:478.30,  digits:2, baseSpread:5 },
  { sym:'AMZN',   name:'Amazon.com Inc.',          cls:'STOCK',  bid:184.20,  digits:2, baseSpread:4 },
  { sym:'BTCUSD', name:'Bitcoin',                  cls:'CRYPTO', bid:71284.6, digits:1, baseSpread:45 },
  { sym:'ETHUSD', name:'Ethereum',                 cls:'CRYPTO', bid:3842.18, digits:2, baseSpread:65 },
  { sym:'SOLUSD', name:'Solana',                   cls:'CRYPTO', bid:172.41,  digits:2, baseSpread:8 },
  { sym:'XRPUSD', name:'XRP',                      cls:'CRYPTO', bid:0.5184,  digits:4, baseSpread:8 },
  { sym:'NAS100', name:'NASDAQ 100',               cls:'INDEX',  bid:18742.5, digits:1, baseSpread:12 },
  { sym:'SPX500', name:'S&P 500',                  cls:'INDEX',  bid:5318.6,  digits:1, baseSpread:5 },
  { sym:'US30',   name:'Dow Jones 30',             cls:'INDEX',  bid:39842.5, digits:1, baseSpread:20 },
  { sym:'GER40',  name:'DAX 40',                   cls:'INDEX',  bid:18712.4, digits:1, baseSpread:12 },
  { sym:'WTI',    name:'Crude Oil (WTI)',          cls:'INDEX',  bid:78.42,   digits:2, baseSpread:3 },
];

function getQuoteState() {
  const state = QUOTE_SYMBOLS.map(s => {
    let markup = 0;
    try { markup = JSON.parse(localStorage.getItem('alpexa.mgr.markup.' + s.sym) || '0'); } catch(e) {}
    return { ...s, last:s.bid, markup };
  });
  return state;
}

function saveSymbolMarkup(sym, markup) {
  try { localStorage.setItem('alpexa.mgr.markup.' + sym, JSON.stringify(markup)); } catch(e) {}
}

function QuotesPanel({ server, onClose }) {
  const [symbols, setSymbols] = useStateQ(getQuoteState);
  const [filter, setFilter] = useStateQ('ALL');
  const [search, setSearch] = useStateQ('');
  const [editingId, setEditingId] = useStateQ(null);
  const [editValue, setEditValue] = useStateQ('');

  // Simulate live price ticks
  useEffectQ(() => {
    const id = setInterval(() => {
      setSymbols(prev => prev.map(s => {
        const scale = s.cls === 'CRYPTO' ? 0.0008 : s.cls === 'STOCK' ? 0.0006 : 0.0002;
        const drift = (Math.random() - 0.5) * 2 * scale;
        const revert = (s.bid - s.last) / s.bid * 0.04;
        const next = s.last * (1 + drift + revert);
        return { ...s, last: next };
      }));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  function adjustMarkup(sym, delta) {
    setSymbols(prev => prev.map(s => {
      if (s.sym !== sym) return s;
      const next = Math.max(0, +(s.markup + delta).toFixed(1));
      saveSymbolMarkup(sym, next);
      return { ...s, markup: next };
    }));
  }

  function setMarkup(sym, value) {
    const v = Math.max(0, parseFloat(value) || 0);
    setSymbols(prev => prev.map(s => {
      if (s.sym !== sym) return s;
      saveSymbolMarkup(sym, v);
      return { ...s, markup: v };
    }));
  }

  const filtered = symbols.filter(s => {
    if (filter !== 'ALL' && s.cls !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!s.sym.toLowerCase().includes(q) && !s.name.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const totalMarkupRevenue = symbols.reduce((sum, s) => sum + s.markup, 0);

  return (
    <div style={{
      width:300, background:'var(--surface)', borderRight:'1px solid var(--line)',
      display:'flex', flexDirection:'column', flexShrink:0, minHeight:0, alignSelf:'stretch'
    }}>
      {/* Header */}
      <div style={{padding:'12px 14px 10px', borderBottom:'1px solid var(--line)'}}>
        <div style={{display:'flex', alignItems:'center', gap:6, marginBottom:8}}>
          <span style={{fontFamily:'Material Symbols Outlined', fontSize:18, color:'var(--acc-2)'}}>candlestick_chart</span>
          <span style={{fontSize:13, fontWeight:700, color:'var(--ink)'}}>Live Quotes</span>
          <span style={{flex:1}}/>
          <span style={{
            fontSize:9, fontWeight:700, padding:'2px 6px', borderRadius:3, letterSpacing:0.4,
            background:'#E8F5E9', color:'#1B5E20'
          }}>● LIVE</span>
        </div>
        {/* Search */}
        <div style={{display:'flex', alignItems:'center', gap:6, padding:'6px 10px', background:'var(--bg)', borderRadius:7, border:'1px solid var(--line-2)'}}>
          <span style={{fontFamily:'Material Symbols Outlined', fontSize:14, color:'var(--text-3)'}}>search</span>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search…"
            style={{flex:1, fontSize:12, color:'var(--ink)', background:'transparent', outline:'none', border:'none'}}/>
        </div>
      </div>

      {/* Category filter */}
      <div style={{display:'flex', gap:3, padding:'7px 10px', background:'#FAF8F2', borderBottom:'1px solid var(--line)', overflowX:'auto'}}>
        {['ALL','FX','STOCK','CRYPTO','INDEX','METAL'].map(c => (
          <button key={c} onClick={()=>setFilter(c)} style={{
            padding:'3px 7px', borderRadius:4, fontSize:9.5, fontWeight:700, letterSpacing:0.5, textTransform:'uppercase',
            background: filter===c ? 'var(--ink)' : 'transparent',
            color: filter===c ? 'var(--ink-fg)' : 'var(--text-3)',
            border:'none', cursor:'pointer', flexShrink:0
          }}>{c}</button>
        ))}
      </div>

      {/* Column header */}
      <div style={{display:'grid', gridTemplateColumns:'1fr 70px 70px', padding:'6px 12px', background:'var(--surface)', borderBottom:'1px solid var(--line)', fontSize:9.5, fontWeight:700, color:'var(--text-3)', letterSpacing:0.5, textTransform:'uppercase'}}>
        <span>Symbol</span>
        <span style={{textAlign:'right'}}>Bid</span>
        <span style={{textAlign:'right'}}>Markup</span>
      </div>

      {/* Quote list */}
      <div className="mgr-quotes-scroll" style={{flex:1, overflowY:'auto', background:'var(--surface)', minHeight:0}}>
        {filtered.map(s => {
          const totalSpread = s.baseSpread + s.markup;
          const ask = s.last + totalSpread * Math.pow(10, -s.digits);
          const isEditing = editingId === s.sym;
          // Random direction for visual variety
          const dir = (Math.floor(s.last * 1000) % 2) === 0 ? 'up' : 'down';
          return (
            <div key={s.sym} style={{
              display:'grid', gridTemplateColumns:'1fr 70px 70px',
              padding:'8px 12px', borderBottom:'1px solid var(--line)', alignItems:'center', gap:6,
              background: isEditing ? 'var(--acc-3)' : 'transparent'
            }}>
              {/* Symbol */}
              <div style={{display:'flex', flexDirection:'column', gap:1, minWidth:0}}>
                <div style={{display:'flex', alignItems:'center', gap:5}}>
                  <span style={{fontSize:11.5, fontWeight:800, color:'var(--ink)', letterSpacing:0.3}}>{s.sym}</span>
                  <span style={{fontSize:7.5, padding:'1px 3px', borderRadius:2, background:'var(--bg-2)', color:'var(--text-3)', fontWeight:800, letterSpacing:0.3}}>{s.cls}</span>
                </div>
                <span style={{fontSize:9, color:'var(--text-3)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>{s.name}</span>
                <span className="mono" style={{fontSize:8.5, color: s.markup > 0 ? '#15A36C' : 'var(--text-3)', fontWeight:600, marginTop:1}}>
                  spr {totalSpread.toFixed(1)}pt
                </span>
              </div>
              {/* Bid */}
              <div className="mono" style={{textAlign:'right'}}>
                <div style={{
                  fontSize:11.5, fontWeight:700, lineHeight:1.15,
                  display:'inline-flex', alignItems:'center', gap:2,
                  color: dir==='up' ? '#15803D' : '#B91C1C'
                }}>
                  <span style={{fontFamily:'Material Symbols Outlined', fontSize:13, lineHeight:1}}>{dir==='up' ? 'arrow_drop_up' : 'arrow_drop_down'}</span>
                  {s.last.toFixed(s.digits)}
                </div>
                <div style={{fontSize:9, color:'var(--text-3)', lineHeight:1.2, marginTop:2, fontWeight:500}}>{ask.toFixed(s.digits)}</div>
              </div>
              {/* Markup adjuster */}
              <div style={{display:'flex', flexDirection:'column', gap:2, alignItems:'flex-end'}}>
                {isEditing ? (
                  <div style={{display:'flex', alignItems:'center', gap:2, width:'100%'}}>
                    <input type="number" value={editValue} onChange={e=>setEditValue(e.target.value)}
                      onBlur={()=>{ setMarkup(s.sym, editValue); setEditingId(null); }}
                      onKeyDown={e=>{ if (e.key==='Enter') { setMarkup(s.sym, editValue); setEditingId(null); } if (e.key==='Escape') setEditingId(null); }}
                      autoFocus
                      style={{flex:1, padding:'3px 4px', fontSize:11, fontWeight:700, color:'var(--ink)', background:'var(--surface)', border:'1px solid var(--acc)', borderRadius:4, outline:'none', width:'100%', minWidth:0}}/>
                  </div>
                ) : (
                  <>
                    <button onClick={()=>{ setEditingId(s.sym); setEditValue(String(s.markup)); }} className="mono" style={{
                      width:'100%', padding:'3px 6px', borderRadius:4, fontSize:11, fontWeight:700,
                      background: s.markup > 0 ? 'rgba(21,163,108,0.12)' : 'var(--bg)',
                      color: s.markup > 0 ? '#15A36C' : 'var(--text-3)',
                      border:'1px solid ' + (s.markup > 0 ? '#86EFAC' : 'var(--line-2)'),
                      cursor:'pointer'
                    }}>+{s.markup.toFixed(1)}</button>
                    <div style={{display:'flex', gap:2, width:'100%'}}>
                      <button onClick={()=>adjustMarkup(s.sym, -0.5)} style={mkBtn}>−</button>
                      <button onClick={()=>adjustMarkup(s.sym, 0.5)} style={mkBtn}>+</button>
                    </div>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div style={{padding:'8px 12px', background:'var(--surface)', borderTop:'1px solid var(--line)', display:'flex', alignItems:'center', gap:8}}>
        <div style={{display:'flex', flexDirection:'column', flex:1, lineHeight:1.2}}>
          <span style={{fontSize:9, fontWeight:700, color:'var(--text-3)', letterSpacing:0.4, textTransform:'uppercase'}}>Total markup</span>
          <span className="mono" style={{color: totalMarkupRevenue > 0 ? '#15A36C' : 'var(--text-3)', fontWeight:700, fontSize:13}}>+{totalMarkupRevenue.toFixed(1)} pt</span>
        </div>
        <button onClick={()=>{
          symbols.forEach(s => saveSymbolMarkup(s.sym, 0));
          setSymbols(getQuoteState());
        }} title="Reset all markups to 0"
          style={{
            padding:'5px 9px', borderRadius:5, background:'transparent',
            border:'1px solid var(--line-2)', fontSize:10.5, color:'var(--text-2)', fontWeight:600,
            cursor:'pointer', display:'inline-flex', alignItems:'center', gap:4
          }}
          onMouseEnter={(e)=>{ e.currentTarget.style.background = 'var(--bg)'; }}
          onMouseLeave={(e)=>{ e.currentTarget.style.background = 'transparent'; }}>
          <span style={{fontFamily:'Material Symbols Outlined', fontSize:13}}>refresh</span>
          Reset
        </button>
      </div>

      <style>{`
        .mgr-quotes-scroll::-webkit-scrollbar { width: 8px; }
        .mgr-quotes-scroll::-webkit-scrollbar-track { background: var(--surface); }
        .mgr-quotes-scroll::-webkit-scrollbar-thumb { background: #D1D5DB; border-radius: 4px; border: 2px solid var(--surface); min-height: 28px; }
        .mgr-quotes-scroll::-webkit-scrollbar-thumb:hover { background: #9CA3AF; }
      `}</style>
    </div>
  );
}

const mkBtn = {
  flex:1, padding:'3px 0', fontSize:11, fontWeight:700, lineHeight:1,
  background:'var(--bg)', border:'1px solid var(--line-2)', borderRadius:4,
  color:'var(--text-2)', cursor:'pointer'
};

const mkBtnDark = {
  flex:1, padding:'3px 0', fontSize:11, fontWeight:700, lineHeight:1,
  background:'#1A2030', border:'1px solid #374151', borderRadius:4,
  color:'#9CA3AF', cursor:'pointer'
};

Object.assign(window, { QuotesPanel });
