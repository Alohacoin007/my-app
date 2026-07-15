// ALPEXA — Screens: Watchlist, Trade ticket, Positions, History, News, Account
const { useState, useMemo, useEffect } = React;

// ──────────────────────────────────────────────
// Icons (Google Material Symbols Outlined)
// ──────────────────────────────────────────────
const Mi = ({ name, size, weight, fill, style }) => (
  <span className={"msi" + (fill ? " fill" : "")}
    style={{
      fontSize: size || 18,
      fontVariationSettings: `'FILL' ${fill?1:0}, 'wght' ${weight||400}, 'GRAD' 0, 'opsz' 24`,
      ...style
    }}>{name}</span>
);
const I = {
  search:  <Mi name="search" size={16}/>,
  plus:    <Mi name="add" size={18} weight={500}/>,
  bell:    <Mi name="notifications" size={20}/>,
  menu:    <Mi name="more_vert" size={20}/>,
  chev:    <Mi name="chevron_right" size={16}/>,
  star:    (filled) => <Mi name="star" size={14} fill={filled}/>,
  filter:  <Mi name="filter_list" size={16}/>,
  sort:    <Mi name="swap_vert" size={16}/>,
  refresh: <Mi name="refresh" size={16}/>,
  globe:   <Mi name="public" size={16}/>,
  card:    <Mi name="credit_card" size={16}/>,
};

// ──────────────────────────────────────────────
// MT5-style numeric stepper for prices
// ──────────────────────────────────────────────
function PriceStepper({ value, onChange, digits, placeholder }) {
  const step = +(1 / Math.pow(10, digits)).toFixed(digits);
  const holdRef = React.useRef(null);
  const currentRef = React.useRef(value);
  React.useEffect(() => { currentRef.current = value; }, [value]);
  React.useEffect(() => () => { if (holdRef.current) clearTimeout(holdRef.current); }, []);

  function startHold(dir) {
    let speed = 220;
    let count = 0;
    const tick = () => {
      const raw = currentRef.current && !isNaN(parseFloat(currentRef.current))
        ? parseFloat(currentRef.current)
        : parseFloat(placeholder) || 0;
      const multiplier = count > 18 ? 10 : 1;
      const next = (raw + dir * step * multiplier).toFixed(digits);
      currentRef.current = next;
      onChange(next);
      count++;
      if (count > 3) speed = Math.max(35, speed - 18);
      holdRef.current = setTimeout(tick, speed);
    };
    tick();
  }
  function endHold() {
    if (holdRef.current) { clearTimeout(holdRef.current); holdRef.current = null; }
  }
  const btn = {
    width:36, height:36, borderRadius:18, background:'var(--bg-2)', border:'none',
    color:'var(--ink)', fontSize:18, fontWeight:600, cursor:'pointer',
    display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0,
    userSelect:'none', touchAction:'none'
  };
  return (
    <div style={{display:'flex', alignItems:'center', gap:8}}>
      <button type="button" style={btn}
        onMouseDown={() => startHold(-1)} onMouseUp={endHold} onMouseLeave={endHold}
        onTouchStart={(e) => { e.preventDefault(); startHold(-1); }} onTouchEnd={endHold}
        onContextMenu={(e) => e.preventDefault()}>−</button>
      <input value={value} onChange={e=>onChange(e.target.value)}
        placeholder={placeholder} inputMode="decimal" className="mono"
        style={{flex:1, textAlign:'center', borderBottom:'1.5px solid var(--line-2)',
          padding:'5px 0', fontSize:18, color:'var(--ink)', fontWeight:600,
          outline:'none', border:'none', background:'transparent', minWidth:0}}/>
      <button type="button" style={btn}
        onMouseDown={() => startHold(1)} onMouseUp={endHold} onMouseLeave={endHold}
        onTouchStart={(e) => { e.preventDefault(); startHold(1); }} onTouchEnd={endHold}
        onContextMenu={(e) => e.preventDefault()}>+</button>
    </div>
  );
}

// ──────────────────────────────────────────────
// WATCHLIST
// ──────────────────────────────────────────────
function getFavSyms() {
  try { return JSON.parse(localStorage.getItem('alpexa.favs') || '["EURUSD","XAUUSD","AAPL","NVDA","BTCUSD","ETHUSD","NAS100","SPX500"]'); } catch(e) { return []; }
}
function saveFavSyms(list) { try { localStorage.setItem('alpexa.favs', JSON.stringify(list)); } catch(e) {} }

function Watchlist({ market, onSelect, current, onDepositCrypto }) {
  const [filter, setFilter] = useState('FAV');
  const [search, setSearch] = useState('');
  const [favs, setFavs] = useState(getFavSyms());
  // Freeze trending pick at mount so the order doesn't shuffle every tick.
  // Curated order: Tesla, Nvidia, EURUSD, Bitcoin
  const trendingSymsRef = React.useRef(null);
  if (!trendingSymsRef.current) {
    trendingSymsRef.current = ['TSLA','NVDA','EURUSD','BTCUSD','WTI'];
  }
  function toggleFav(sym) {
    const next = favs.includes(sym) ? favs.filter(f => f !== sym) : [...favs, sym];
    setFavs(next); saveFavSyms(next);
  }
  const cats = [
    { id:'FAV',    label:'★ Favorites' },
    { id:'FX',     label:'Forex' },
    { id:'STOCK',  label:'Stocks' },
    { id:'CRYPTO', label:'Crypto' },
    { id:'INDEX',  label:'Indices' },
  ];
  function catCount(id) {
    if (id === 'FAV') return market.filter(s => favs.includes(s.sym)).length;
    return market.filter(s => s.cls === id).length;
  }
  const rows = market.filter(s => {
    if (filter === 'FAV') {
      if (!favs.includes(s.sym)) return false;
    } else if (s.cls !== filter) {
      return false;
    }
    if (search && !s.sym.toLowerCase().includes(search.toLowerCase()) && !s.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div style={{display:'flex', flexDirection:'column', flex:1, minHeight:0, background:'var(--bg)'}}>
      {/* search */}
      <div style={{
        display:'flex', alignItems:'center', gap:8, padding:'10px 14px',
        background:'var(--surface)', borderBottom:'1px solid var(--line)'
      }}>
        <div style={{
          flex:1, display:'flex', alignItems:'center', gap:8,
          padding:'8px 12px', background:'var(--bg-2)', borderRadius:10, color:'var(--text-2)'
        }}>
          {I.search}
          <input
            value={search} onChange={e=>setSearch(e.target.value)}
            placeholder="Search symbol…"
            style={{flex:1, fontSize:13, color:'var(--text)'}}
          />
        </div>
        <button style={{
          width:36, height:36, borderRadius:10, background:'var(--ink)', color:'var(--ink-fg)',
          display:'flex', alignItems:'center', justifyContent:'center'
        }}>{I.plus}</button>
      </div>

      {/* category strip with counts */}
      <div className="cat-strip" ref={el => {
        if (el && !el.__wheelBound) {
          el.__wheelBound = true;
          // Vertical wheel → horizontal scroll
          el.addEventListener('wheel', (e) => {
            if (e.deltaY !== 0 && el.scrollWidth > el.clientWidth) {
              e.preventDefault();
              el.scrollLeft += e.deltaY;
            }
          }, { passive: false });
          // Click + drag with mouse (desktop)
          let isDown = false, startX = 0, scrollStart = 0, moved = false;
          el.addEventListener('mousedown', (e) => {
            isDown = true; moved = false;
            startX = e.pageX - el.offsetLeft;
            scrollStart = el.scrollLeft;
            el.style.cursor = 'grabbing';
          });
          el.addEventListener('mouseleave', () => { isDown = false; el.style.cursor = 'grab'; });
          el.addEventListener('mouseup',    () => { isDown = false; el.style.cursor = 'grab'; });
          el.addEventListener('mousemove', (e) => {
            if (!isDown) return;
            const x = e.pageX - el.offsetLeft;
            const walk = (x - startX) * 1.2;
            if (Math.abs(walk) > 3) moved = true;
            el.scrollLeft = scrollStart - walk;
          });
          // Prevent click after drag
          el.addEventListener('click', (e) => {
            if (moved) { e.preventDefault(); e.stopPropagation(); moved = false; }
          }, true);
        }
      }} style={{
        display:'flex', gap:6, padding:'10px 14px', background:'var(--surface)',
        borderBottom:'1px solid var(--line)',
        overflowX:'auto', overflowY:'hidden',
        scrollbarWidth:'none', msOverflowStyle:'none',
        WebkitOverflowScrolling:'touch', flexWrap:'nowrap',
        cursor:'grab', userSelect:'none'
      }}>
        {cats.map(c => {
          const active = filter === c.id;
          const count = catCount(c.id);
          return (
            <button key={c.id} onClick={()=>setFilter(c.id)} style={{
              padding:'6px 11px', borderRadius:999, fontSize:11.5, fontWeight:600, letterSpacing:0.2,
              background: active ? 'var(--ink)' : 'var(--bg-2)',
              color:    active ? 'var(--ink-fg)' : 'var(--text-2)',
              flexShrink:0, display:'flex', alignItems:'center', gap:6
            }}>
              <span>{c.label}</span>
              <span style={{
                fontSize:9.5, fontWeight:700, padding:'1.5px 6px', borderRadius:10,
                background: active ? 'rgba(255,255,255,0.18)' : 'var(--surface)',
                color: active ? 'var(--ink-fg)' : 'var(--text-3)',
                fontFamily:'JetBrains Mono, monospace'
              }}>{count}</span>
            </button>
          );
        })}
      </div>

      {/* header row — hide when showing empty Favorites + Trending card */}
      {!(filter === 'FAV' && rows.length === 0) && (
      <div style={{
        display:'flex', alignItems:'center', padding:'6px 14px',
        background:'var(--surface)', borderBottom:'1px solid var(--line)',
        fontSize:9.5, color:'var(--text-3)', fontWeight:700, letterSpacing:0.5
      }}>
        <span style={{width:26}}/>
        <span style={{flex:1.4}}>SYMBOL</span>
        <span style={{flex:1, textAlign:'right'}}>BID</span>
        <span style={{flex:1, textAlign:'right'}}>ASK</span>
        <span style={{width:62, textAlign:'right'}}>CHG %</span>
      </div>
      )}

      {/* list */}
      <div style={{flex:1, overflowY:'auto', background:'var(--surface)'}}>
        {rows.length === 0 && filter === 'FAV' && (() => {
          // Trending — top mover per category, frozen at mount
          const trending = trendingSymsRef.current
            .map(sym => market.find(m => m.sym === sym))
            .filter(Boolean);
          return (
            <div style={{padding:'18px 16px 20px'}}>
              <div style={{
                display:'flex', alignItems:'center', gap:6, marginBottom:8
              }}>
                <span style={{fontSize:14}}>🔥</span>
                <span style={{fontSize:10.5, fontWeight:700, color:'var(--text-2)', letterSpacing:0.6, textTransform:'uppercase'}}>
                  Trending Today
                </span>
              </div>
              <div style={{
                background:'var(--surface)', borderRadius:10, border:'1px solid var(--line-2)',
                overflow:'hidden'
              }}>
                {trending.map((s, i) => {
                  const up = s.chgPct >= 0;
                  const ask = s.last + s.spread;
                  const fav = favs.includes(s.sym);
                  const tagBg = { FX:'#E3F2FD', STOCK:'#E8F5E9', CRYPTO:'#FCE4EC', INDEX:'#EDE7F6' }[s.cls] || 'var(--bg-2)';
                  const tagCol = { FX:'#1565C0', STOCK:'#2E7D32', CRYPTO:'#C2185B', INDEX:'#5E35B1' }[s.cls] || 'var(--text-3)';
                  const now = new Date();
                  const timeStr = String(now.getHours()).padStart(2,'0') + ':' + String(now.getMinutes()).padStart(2,'0') + ':' + String(now.getSeconds()).padStart(2,'0');
                  const sprPt = (s.spread * Math.pow(10, s.digits)).toFixed(0);
                  return (
                    <div key={s.sym} style={{
                      display:'flex', alignItems:'center', padding:'14px 14px', gap:12,
                      borderTop: i === 0 ? 'none' : '1px solid var(--line)',
                      borderLeft: fav ? '3px solid #FBBF24' : '3px solid transparent',
                      paddingLeft: fav ? 11 : 14
                    }}>
                      <button onClick={()=>onSelect(s.sym)} style={{
                        flex:1, display:'flex', alignItems:'center', padding:0, background:'transparent', textAlign:'left', gap:8
                      }}>
                        <div style={{flex:'1 1 0', minWidth:0, display:'flex', flexDirection:'column', gap:1}}>
                          <div style={{display:'flex', alignItems:'center', gap:5}}>
                            <span style={{fontSize:13, fontWeight:700, color:'var(--ink)', letterSpacing:0.2, lineHeight:1.1}}>{s.sym}</span>
                            <span style={{
                              fontSize:8, padding:'1px 4px', borderRadius:3, fontWeight:800, letterSpacing:0.4,
                              background:tagBg, color:tagCol
                            }}>{s.cls}</span>
                          </div>
                          <span style={{
                            fontSize:9.5, color:'var(--text-3)', lineHeight:1.2,
                            whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'
                          }}>{s.name}</span>
                          <div className="mono" style={{
                            fontSize:9, color:'var(--muted)', fontWeight:500, letterSpacing:0.2, marginTop:1,
                            display:'flex', alignItems:'center', gap:4
                          }}>
                            <span style={{width:5, height:5, borderRadius:'50%', background:'#4CAF50', flexShrink:0}}/>
                            {timeStr}
                            <span style={{marginLeft:4, color:'var(--text-2)', fontWeight:700}}>{sprPt}</span>
                          </div>
                        </div>
                        <div style={{display:'flex', flexDirection:'column', alignItems:'flex-end', gap:1, flexShrink:0}}>
                          <span className="mono" style={{fontSize:14, fontWeight:700, color:'var(--ink)', lineHeight:1.15}}>
                            {ALPEXA_MARKET.fmt(s.last, s.digits)}
                          </span>
                          <span className="mono" style={{fontSize:9, color:'var(--text-3)', lineHeight:1.2, letterSpacing:0.1}}>
                            L {ALPEXA_MARKET.fmt(s.low, s.digits)} · H {ALPEXA_MARKET.fmt(s.high, s.digits)}
                          </span>
                        </div>
                        <span className="mono" style={{
                          fontSize:11.5, fontWeight:700, minWidth:52, textAlign:'right',
                          color: up ? 'var(--buy)' : 'var(--sell)', flexShrink:0
                        }}>
                          {up?'+':''}{s.chgPct.toFixed(2)}%
                        </span>
                      </button>
                    </div>
                  );
                })}
              </div>

              {/* Promo card */}
              <button onClick={()=>{ if (onDepositCrypto) onDepositCrypto(); }} style={{
                width:'100%', marginTop:12, padding:'12px 14px',
                background:'var(--surface)', borderRadius:10,
                border:'1px solid var(--line-2)',
                color:'var(--ink)', textAlign:'left', cursor:'pointer',
                position:'relative', overflow:'hidden',
                boxShadow:'var(--shadow-sm)'
              }}>
                <div style={{
                  display:'flex', alignItems:'center', gap:5, marginBottom:6
                }}>
                  <span style={{
                    fontSize:8, fontWeight:800, padding:'1px 5px', borderRadius:3, letterSpacing:0.5,
                    background:'var(--acc-3)', color:'var(--acc-2)'
                  }}>NEW</span>
                  <span style={{fontSize:8.5, fontWeight:700, color:'var(--text-3)', letterSpacing:0.4}}>CRYPTO WALLET</span>
                </div>
                <div style={{
                  display:'flex', alignItems:'center', gap:10
                }}>
                  <div style={{
                    flex:1, fontSize:12.5, fontWeight:700, lineHeight:1.3,
                    letterSpacing:0.1, color:'var(--ink)'
                  }}>
                    Bring your crypto into ALPEXA
                  </div>
                  <span style={{
                    fontSize:10.5, fontWeight:700, color:'#fff', background:'var(--acc)',
                    padding:'6px 11px', borderRadius:6, display:'inline-flex',
                    alignItems:'center', gap:4, letterSpacing:0.3, flexShrink:0, whiteSpace:'nowrap'
                  }}>
                    Deposit
                    <Mi name="arrow_forward" size={11}/>
                  </span>
                </div>
              </button>
            </div>
          );
        })()}
        {rows.map(s => {
          const ask = s.last + s.spread;
          const up = s.chgPct >= 0;
          const sel = current === s.sym;
          const fav = favs.includes(s.sym);
          const flashClass = s.flash === 'up' ? 'flash-up' : s.flash === 'down' ? 'flash-down' : '';
          return (
            <div key={s.sym} className={flashClass} style={{
              width:'100%', display:'flex', alignItems:'center', padding:'10px 14px',
              borderBottom:'1px solid var(--line)',
              background: sel ? 'var(--acc-3)' : 'transparent',
              borderLeft: sel ? '3px solid var(--acc-2)' : '3px solid transparent',
            }}>
              <button onClick={(e)=>{ e.stopPropagation(); toggleFav(s.sym); }} style={{
                width:26, display:'flex', alignItems:'center', justifyContent:'center',
                color: fav ? '#FBBF24' : 'var(--muted)'
              }}>
                <span style={{
                  fontFamily:'Material Symbols Outlined', fontSize:16,
                  fontVariationSettings: `'FILL' ${fav?1:0}, 'wght' 500, 'GRAD' 0, 'opsz' 24`,
                }}>star</span>
              </button>
              <button onClick={()=>onSelect(s.sym)} style={{
                flex:1, display:'flex', alignItems:'center', padding:0, textAlign:'left', background:'transparent'
              }}>
                <div style={{flex:1.4, display:'flex', flexDirection:'column', gap:1}}>
                  <div style={{display:'flex', alignItems:'center', gap:6}}>
                    <span style={{fontSize:13.5, fontWeight:700, color:'var(--ink)', letterSpacing:0.2}}>{s.sym}</span>
                    <span style={{
                      fontSize:8.5, padding:'1px 5px', borderRadius:3,
                      background:'var(--bg-2)', color:'var(--text-3)', fontWeight:700, letterSpacing:0.4
                    }}>{s.cls}</span>
                  </div>
                  <span style={{fontSize:10.5, color:'var(--text-3)'}}>{s.name}</span>
                </div>
                <span className="mono" style={{flex:1, textAlign:'right', fontSize:13, fontWeight:600, color:'var(--sell)', display:'flex', flexDirection:'column', alignItems:'flex-end', gap:1}}>
                  <span>{ALPEXA_MARKET.fmt(s.last, s.digits)}</span>
                  {filter === 'FAV' && <span style={{fontSize:9, color:'var(--text-3)', fontWeight:500}}>L {ALPEXA_MARKET.fmt(s.low, s.digits)}</span>}
                </span>
                <span className="mono" style={{flex:1, textAlign:'right', fontSize:13, fontWeight:600, color:'var(--buy)', display:'flex', flexDirection:'column', alignItems:'flex-end', gap:1}}>
                  <span>{ALPEXA_MARKET.fmt(ask, s.digits)}</span>
                  {filter === 'FAV' && <span style={{fontSize:9, color:'var(--text-3)', fontWeight:500}}>H {ALPEXA_MARKET.fmt(s.high, s.digits)}</span>}
                </span>
                <span className="mono" style={{
                  width:62, textAlign:'right', fontSize:11.5, fontWeight:600,
                  color: up ? 'var(--buy)' : 'var(--sell)'
                }}>
                  {up?'+':''}{s.chgPct.toFixed(2)}%
                </span>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────
// TRADE TICKET (full screen)
// ──────────────────────────────────────────────
function TradeTicket({ market, sym, setSym, lots, setLots, onPlace }) {
  const s = market.find(m => m.sym === sym);
  const [side, setSide] = useState('BUY');
  const [otype, setOtype] = useState('MARKET');
  const [otypePrice, setOtypePrice] = useState('');
  const [sl, setSl] = useState('');
  const [tp, setTp] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const vol = lots;
  const setVol = setLots;

  // Auto-clamp vol when switching to stocks/indices
  useEffect(() => {
    if (!s) return;
    if ((s.cls === 'STOCK' || s.cls === 'INDEX') && lots < 1) {
      setLots(1);
    } else if (s.cls !== 'STOCK' && s.cls !== 'INDEX' && lots > 5 && Number.isInteger(lots)) {
      setLots(1);
    }
  }, [s && s.cls]);

  const ask = s.last + s.spread;
  const entryPx = side === 'BUY' ? ask : s.last;
  // Use centralized contract-spec helpers from market.js for consistent
  // margin / notional / pnl across all asset classes.
  const notional = ALPEXA_MARKET.getNotionalUSD(s, vol, entryPx);
  const levSettings = getLeverageSettings();
  const lev = levSettings[s.cls] || (s.cls === 'STOCK' ? 5 : s.cls === 'CRYPTO' ? 5 : s.cls === 'INDEX' ? 20 : 100);
  const marginPct = (100 / lev).toFixed(lev<10?0:1);
  const margin = notional / lev;
  // Realistic commissions: stocks $0.02/share min $1; crypto 0.1%; FX/indices spread-only
  const commission = s.cls === 'STOCK'
    ? Math.max(1, vol * 0.02)
    : s.cls === 'CRYPTO'
      ? notional * 0.001
      : 0;

  // Per-tick value for the summary row (1 minimum-price-move = ?)
  const lotSize = ALPEXA_MARKET.getLotSize(s);
  const tickSize = Math.pow(10, -s.digits); // e.g. 0.00001 for FX 5-digit, 0.01 for stocks, 0.1 for BTC
  let tickValueUSD;
  if (ALPEXA_MARKET.isUsdBaseFx(s)) {
    tickValueUSD = (tickSize * lotSize * vol) / entryPx;
  } else {
    tickValueUSD = tickSize * lotSize * vol;
  }
  // SL/TP helper — accepts absolute price or pip distance (auto-detected by magnitude).
  // Inputs smaller than half of entry price are treated as pip distance from entry.
  function sltpHelper(val, isTp) {
    if (val === '' || val == null) return null;
    const rawStr = String(val).trim();
    let p = parseFloat(rawStr);
    if (isNaN(p) || p === 0) return null;
    p = Math.abs(p);
    let targetPx;
    const tickSizeLocal = Math.pow(10, -s.digits);
    const hasDecimal = rawStr.includes('.');
    const isPipMode = !hasDecimal || p < entryPx * 0.5;
    if (isPipMode) {
      const offset = p * tickSizeLocal;
      if (isTp) {
        targetPx = side === 'BUY' ? entryPx + offset : entryPx - offset;
      } else {
        targetPx = side === 'BUY' ? entryPx - offset : entryPx + offset;
      }
    } else {
      targetPx = p;
    }
    const dist = Math.abs(entryPx - targetPx) * Math.pow(10, s.digits);
    const amt = tickValueUSD * dist;
    const pctAway = Math.abs(entryPx - targetPx) / entryPx;
    const invalid = pctAway > 0.30;
    const tooClose = dist < 10; // Min 10 pt distance from current price
    const asPipsInput = p < entryPx * 0.5;
    return {
      dist: dist.toFixed(0),
      amt: amt.toFixed(2),
      invalid,
      tooClose,
      pctAway: (pctAway*100).toFixed(1),
      targetPx: targetPx.toFixed(s.digits),
      asPipsInput,
    };
  }
  const slH = sltpHelper(sl, false);
  const tpH = sltpHelper(tp, true);

  // Reject wrong-side pending triggers up front; otherwise the trigger
  // check fires on the next tick and the order vanishes from Pending
  // (looks like it executed at market).
  function triggerHelper() {
    if (otype === 'MARKET') return null;
    const trig = parseFloat(otypePrice);
    if (!otypePrice || isNaN(trig) || trig <= 0) return null;
    const ref = side === 'BUY' ? ask : s.last;
    let wrongSide = false;
    if (otype === 'LIMIT') wrongSide = side === 'BUY' ? trig >= ref : trig <= ref;
    else if (otype === 'STOP') wrongSide = side === 'BUY' ? trig <= ref : trig >= ref;
    return { trig, ref, wrongSide };
  }
  const trigH = triggerHelper();

  // Contract size label
  let contractLabel;
  if (s.cls === 'FX') {
    if (s.sym === 'XAUUSD') contractLabel = `${(100 * vol).toFixed(2)} oz`;
    else if (s.sym === 'XAGUSD') contractLabel = `${(5000 * vol).toFixed(0)} oz`;
    else contractLabel = `${(100000 * vol).toLocaleString('en-US',{maximumFractionDigits:0})} ${s.sym.slice(0,3)}`;
  } else if (s.cls === 'CRYPTO') {
    contractLabel = `${vol.toFixed(2)} ${s.sym.replace('USD','')}`;
  } else if (s.cls === 'STOCK') {
    contractLabel = `${(vol).toFixed(0)} ${vol === 1 ? 'share' : 'shares'}`;
  } else {
    contractLabel = `${vol.toFixed(2)} units`;
  }

  const tagBg = { FX:'var(--acc-3)', STOCK:'var(--buy-tint)', CRYPTO:'#FCE4EC', INDEX:'#EDE7F6', METAL:'#FFF8E1', COMM:'#FBE9E7' };
  const tagCol = { FX:'var(--acc-2)', STOCK:'var(--buy-2)', CRYPTO:'#C2185B', INDEX:'#5E35B1', METAL:'#B45309', COMM:'#BF360C' };

  function place() {
    setConfirmOpen(false);
    if (!onPlace) return;
    const trigger = otype === 'MARKET' ? null : parseFloat(otypePrice);
    const order = {
      sym: s.sym,
      side,
      vol,
      open: otype === 'MARKET' ? entryPx : trigger,
      trigger: trigger,
      sl: sl ? parseFloat(sl) : 0,
      tp: tp ? parseFloat(tp) : 0,
      otype,
      swap: 0,
    };
    onPlace(order);
  }
  function submit() {
    // One-click: skip confirmation modal
    if (getPrefs().oneClick && otype === 'MARKET' && canPlace) {
      place();
    } else if (canPlace) {
      setConfirmOpen(true);
    }
  }
  const canPlace = (otype === 'MARKET' || (trigH && !trigH.wrongSide))
    && (!slH || (!slH.invalid && !slH.tooClose))
    && (!tpH || (!tpH.invalid && !tpH.tooClose));

  const bidParts = formatPriceFixed(s.last, s.digits);
  const askParts = formatPriceFixed(ask, s.digits);

  return (
    <div style={{display:'flex', flexDirection:'column', flex:1, minHeight:0, background:'var(--bg)', position:'relative'}}>
      {/* Symbol bar */}
      <button onClick={()=>setPickerOpen(true)} style={{
        display:'flex', alignItems:'center', gap:10, padding:'12px 14px',
        background:'var(--surface)', borderBottom:'1px solid var(--line)', textAlign:'left',
        width:'100%'
      }}>
        <div style={{flex:1}}>
          <div style={{display:'flex', alignItems:'center', gap:6}}>
            <span style={{fontSize:18, fontWeight:800, color:'var(--ink)', letterSpacing:0.2}}>{s.sym}</span>
            <span style={{
              fontSize:8.5, padding:'2px 5px', borderRadius:3, fontWeight:800, letterSpacing:0.4,
              background: tagBg[s.cls]||'var(--bg-2)', color: tagCol[s.cls]||'var(--text-2)'
            }}>{s.cls}</span>
          </div>
          <div style={{fontSize:11, color:'var(--text-3)', marginTop:2}}>{s.name}</div>
        </div>
        <div style={{
          width:30, height:30, borderRadius:15, background:'var(--bg-2)',
          display:'flex', alignItems:'center', justifyContent:'center', color:'var(--text-2)'
        }}>
          <Mi name="unfold_more" size={18}/>
        </div>
      </button>

      {/* Price tiles with spread pill */}
      <div style={{display:'flex', gap:10, padding:'12px 12px 8px', background:'var(--bg)', position:'relative'}}>
        <button onClick={()=>setSide('SELL')} style={{
          flex:1, padding:'11px 12px 13px', borderRadius:12, textAlign:'left',
          background: side==='SELL'? 'var(--sell-tint)' : 'var(--surface)',
          border: side==='SELL' ? '1.5px solid var(--sell)' : '1.5px solid var(--line-2)',
        }}>
          <div style={{fontSize:9.5, fontWeight:800, color:'var(--sell)', letterSpacing:0.8}}>SELL · BID</div>
          <div className="mono" style={{display:'flex', alignItems:'baseline', color:'var(--sell)', fontWeight:700, marginTop:6}}>
            <span style={{fontSize:22}}>{bidParts.big}</span>
            <span style={{fontSize:26, fontWeight:800}}>{bidParts.small}</span>
          </div>
          <div className="mono" style={{fontSize:10, color:'var(--text-3)', marginTop:4}}>L {ALPEXA_MARKET.fmt(s.low, s.digits)}</div>
        </button>
        <button onClick={()=>setSide('BUY')} style={{
          flex:1, padding:'11px 12px 13px', borderRadius:12, textAlign:'left',
          background: side==='BUY'? 'var(--buy-tint)' : 'var(--surface)',
          border: side==='BUY' ? '1.5px solid var(--buy)' : '1.5px solid var(--line-2)',
        }}>
          <div style={{fontSize:9.5, fontWeight:800, color:'var(--buy)', letterSpacing:0.8}}>BUY · ASK</div>
          <div className="mono" style={{display:'flex', alignItems:'baseline', color:'var(--buy)', fontWeight:700, marginTop:6}}>
            <span style={{fontSize:22}}>{askParts.big}</span>
            <span style={{fontSize:26, fontWeight:800}}>{askParts.small}</span>
          </div>
          <div className="mono" style={{fontSize:10, color:'var(--text-3)', marginTop:4}}>H {ALPEXA_MARKET.fmt(s.high, s.digits)}</div>
        </button>
        <div className="mono" style={{
          position:'absolute', top:'50%', left:'50%', transform:'translate(-50%,-50%)',
          background:'var(--ink)', color:'var(--ink-fg)', padding:'3px 8px', borderRadius:10,
          fontSize:10, fontWeight:700, letterSpacing:0.5,
        }}>{(s.spread*Math.pow(10,s.digits)).toFixed(0)}</div>
      </div>

      {/* Body */}
      <div style={{flex:1, overflowY:'auto', padding:'4px 12px 12px', display:'flex', flexDirection:'column', gap:8}}>

        {/* Order type */}
        <div style={{background:'var(--surface)', borderRadius:12, padding:'12px 14px'}}>
          <div style={{fontSize:9.5, fontWeight:700, color:'var(--text-3)', letterSpacing:0.7, marginBottom:9}}>ORDER TYPE</div>
          <Seg value={otype} onChange={setOtype} options={['MARKET','LIMIT','STOP']}/>
          {otype !== 'MARKET' && (
            <div style={{marginTop:12}}>
              <div style={{display:'flex', justifyContent:'space-between', alignItems:'baseline', marginBottom:5}}>
                <span style={{fontSize:9.5, fontWeight:700, color:'var(--text-3)', letterSpacing:0.5}}>TRIGGER PRICE</span>
                <span className="mono" style={{fontSize:10, color:'var(--text-3)'}}>cur {ALPEXA_MARKET.fmt(entryPx, s.digits)}</span>
              </div>
              <PriceStepper
                value={otypePrice}
                onChange={setOtypePrice}
                digits={s.digits}
                placeholder={ALPEXA_MARKET.fmt(entryPx, s.digits)}
              />
              {trigH && (
                <div className="mono" style={{fontSize:9.5, marginTop:5, color: trigH.wrongSide ? 'var(--warn)' : 'var(--text-3)'}}>
                  {trigH.wrongSide
                    ? `⚠ ${otype} ${side} must be ${(otype==='LIMIT') === (side==='BUY') ? 'below' : 'above'} ${ALPEXA_MARKET.fmt(trigH.ref, s.digits)}`
                    : `${Math.round(Math.abs(trigH.trig - trigH.ref) * Math.pow(10, s.digits))} pt from market`}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Volume */}
        <div style={{background:'var(--surface)', borderRadius:12, padding:'12px 14px'}}>
          <div style={{fontSize:9.5, fontWeight:700, color:'var(--text-3)', letterSpacing:0.7, marginBottom:10}}>VOLUME ({ALPEXA_MARKET.getUnitLabel(s.cls).toUpperCase()})</div>
          <div style={{display:'flex', alignItems:'center', gap:12, marginBottom:8}}>
            <button onClick={()=>{
              const step = s.cls === 'STOCK' ? (vol <= 1 ? 1 : vol <= 10 ? 1 : vol <= 100 ? 5 : 10)
                         : s.cls === 'INDEX' ? 1
                         : vol < 0.1 ? 0.01 : vol < 1 ? 0.10 : vol < 10 ? 1 : 5;
              const min = s.cls === 'STOCK' || s.cls === 'INDEX' ? 1 : 0.01;
              setVol(Math.max(min, +(vol - step).toFixed(2)));
            }} style={{
              width:38, height:38, borderRadius:19, background:'var(--bg-2)',
              display:'flex', alignItems:'center', justifyContent:'center', color:'var(--ink)'
            }}>
              <Mi name="remove" size={20} weight={600}/>
            </button>
            <div style={{flex:1, textAlign:'center'}}>
              <div className="mono" style={{fontSize:28, fontWeight:700, color:'var(--ink)', lineHeight:1, letterSpacing:-0.5}}>{ALPEXA_MARKET.fmtVol(s.cls, vol)}</div>
              <div className="mono" style={{fontSize:10, color:'var(--text-3)', marginTop:5, letterSpacing:0.3}}>
                ≈ ${notional.toLocaleString('en-US',{maximumFractionDigits:0})} notional
              </div>
            </div>
            <button onClick={()=>{
              const step = s.cls === 'STOCK' ? (vol < 1 ? 1 : vol < 10 ? 1 : vol < 100 ? 5 : 10)
                         : s.cls === 'INDEX' ? 1
                         : vol < 0.1 ? 0.01 : vol < 1 ? 0.10 : vol < 10 ? 1 : 5;
              setVol(+(vol + step).toFixed(2));
            }} style={{
              width:38, height:38, borderRadius:19, background:'var(--bg-2)',
              display:'flex', alignItems:'center', justifyContent:'center', color:'var(--ink)'
            }}>
              <Mi name="add" size={20} weight={600}/>
            </button>
          </div>
          <div style={{display:'flex', gap:5}}>
            {(s.cls === 'STOCK' ? [1, 5, 10, 50, 100] : s.cls === 'INDEX' ? [1, 2, 5, 10, 20] : [0.01, 0.10, 0.50, 1.00, 5.00]).map(p => (
              <button key={p} onClick={()=>setVol(p)} className="mono" style={{
                flex:1, padding:'6px 0', borderRadius:6, fontSize:11, fontWeight:600,
                background: Math.abs(vol-p) < 0.001 ? 'var(--ink)' : 'var(--bg-2)',
                color:    Math.abs(vol-p) < 0.001 ? 'var(--ink-fg)' : 'var(--text-2)',
              }}>{ALPEXA_MARKET.fmtVol(s.cls, p)}</button>
            ))}
          </div>
        </div>

        {/* SL / TP with helpers */}
        <div style={{background:'var(--surface)', borderRadius:12, padding:'12px 14px'}}>
          <div style={{fontSize:9.5, fontWeight:700, color:'var(--text-3)', letterSpacing:0.7, marginBottom:10}}>STOP LOSS / TAKE PROFIT</div>
          <div style={{display:'flex', gap:14}}>
            <div style={{flex:1}}>
              <div style={{fontSize:9.5, fontWeight:800, color:'var(--sell)', letterSpacing:0.5, marginBottom:5, display:'flex', alignItems:'center', gap:4}}>
                <Mi name="shield" size={12}/> STOP LOSS
              </div>
              <div style={{display:'flex', alignItems:'center', gap:4, borderBottom:'1.5px solid var(--line-2)', paddingBottom:5}}>
                <input value={sl} onChange={e=>setSl(e.target.value)} placeholder="—" type="number" step="any" className="mono"
                  style={{flex:1, fontSize:15, color:'var(--ink)', fontWeight:600, outline:'none', width:'100%'}}/>
                {sl && <button onClick={()=>setSl('')} style={{color:'var(--text-3)'}}><Mi name="close" size={14}/></button>}
              </div>
              <div className="mono" style={{fontSize:9.5, marginTop:5, color: slH ? (slH.invalid || slH.tooClose ? 'var(--warn)' : 'var(--sell)') : 'var(--text-3)'}}>
                {slH ? (slH.invalid ? `⚠ ${slH.pctAway}% off entry — check price` : slH.tooClose ? `⚠ Min 10 pt required (now ${slH.dist} pt)` : `${slH.asPipsInput ? '→ ' + slH.targetPx + ' · ' : ''}${slH.dist} pt · −$${slH.amt}`) : 'No SL set'}
              </div>
            </div>
            <div style={{flex:1}}>
              <div style={{fontSize:9.5, fontWeight:800, color:'var(--buy)', letterSpacing:0.5, marginBottom:5, display:'flex', alignItems:'center', gap:4}}>
                <Mi name="flag" size={12}/> TAKE PROFIT
              </div>
              <div style={{display:'flex', alignItems:'center', gap:4, borderBottom:'1.5px solid var(--line-2)', paddingBottom:5}}>
                <input value={tp} onChange={e=>setTp(e.target.value)} placeholder="—" type="number" step="any" className="mono"
                  style={{flex:1, fontSize:15, color:'var(--ink)', fontWeight:600, outline:'none', width:'100%'}}/>
                {tp && <button onClick={()=>setTp('')} style={{color:'var(--text-3)'}}><Mi name="close" size={14}/></button>}
              </div>
              <div className="mono" style={{fontSize:9.5, marginTop:5, color: tpH ? (tpH.invalid || tpH.tooClose ? 'var(--warn)' : 'var(--buy)') : 'var(--text-3)'}}>
                {tpH ? (tpH.invalid ? `⚠ ${tpH.pctAway}% off entry — check price` : tpH.tooClose ? `⚠ Min 10 pt required (now ${tpH.dist} pt)` : `${tpH.asPipsInput ? '→ ' + tpH.targetPx + ' · ' : ''}${tpH.dist} pt · +$${tpH.amt}`) : 'No TP set'}
              </div>
            </div>
          </div>
        </div>

        {/* Order Summary */}
        <div style={{background:'var(--surface)', borderRadius:12, padding:'12px 14px'}}>
          <div style={{fontSize:9.5, fontWeight:700, color:'var(--text-3)', letterSpacing:0.7, marginBottom:6}}>ORDER SUMMARY</div>
          <SumRow label="Notional value" val={`$${notional.toLocaleString('en-US',{maximumFractionDigits:2})}`}/>
          <SumRow label="Contract size" val={contractLabel}/>
          <SumRow label="Required margin" val={`$${margin.toLocaleString('en-US',{maximumFractionDigits:2})} (${marginPct}%)`}/>
          <SumRow label="Leverage" val={`1:${lev}`}/>
          <SumRow label="Commission" val={`$${commission.toFixed(2)}`}/>
          <SumRow label={s.cls === 'FX' ? `Pip value (1 pip)` : `Tick value (${tickSize.toFixed(s.digits)})`} val={`$${tickValueUSD.toFixed(4)}`}/>
          <SumRow label="Swap (overnight)" val={s.cls==='CRYPTO'?'−12.0':s.cls==='STOCK'?'−3.5':side==='BUY'?'−0.5':'+0.2'}/>
        </div>
      </div>

      {/* Place button */}
      <div style={{padding:'10px 12px 12px', background:'var(--surface)', borderTop:'1px solid var(--line)'}}>
        <button onClick={submit} disabled={!canPlace} style={{
          width:'100%', padding:'14px 0', borderRadius:11, fontSize:14, fontWeight:800, color:'#fff',
          background: !canPlace ? 'var(--muted)' : (side==='BUY' ? 'var(--buy)' : 'var(--sell)'),
          letterSpacing:0.4, cursor: canPlace ? 'pointer' : 'not-allowed',
        }}>
          {otype !== 'MARKET' && !canPlace
            ? `Enter trigger price`
            : <>{side === 'BUY' ? 'BUY' : 'SELL'}{otype !== 'MARKET' ? ` ${otype}` : ''} · {ALPEXA_MARKET.fmtVol(s.cls, vol)} {ALPEXA_MARKET.getUnitLabel(s.cls)} of {sym} @ <span className="mono">{ALPEXA_MARKET.fmt(otype === 'MARKET' ? entryPx : parseFloat(otypePrice), s.digits)}</span></>
          }
        </button>
      </div>

      {/* Symbol picker sheet */}
      {pickerOpen && (
        <div onClick={()=>setPickerOpen(false)} style={{
          position:'absolute', inset:0, background:'rgba(10,14,26,0.55)', zIndex:300,
          display:'flex', flexDirection:'column', justifyContent:'flex-end'
        }}>
          <div onClick={e=>e.stopPropagation()} style={{
            background:'var(--surface)', borderTopLeftRadius:16, borderTopRightRadius:16,
            maxHeight:'72%', display:'flex', flexDirection:'column',
            animation:'slideUp 0.22s cubic-bezier(0.2,0.8,0.2,1)'
          }}>
            <div style={{display:'flex', justifyContent:'center', padding:'8px 0 4px'}}>
              <div style={{width:36, height:4, borderRadius:2, background:'var(--line-2)'}}/>
            </div>
            <div style={{padding:'6px 16px 10px', display:'flex', alignItems:'center'}}>
              <span style={{fontSize:15, fontWeight:700, color:'var(--ink)'}}>Select Symbol</span>
              <span style={{flex:1}}/>
              <button onClick={()=>setPickerOpen(false)} style={{
                width:28, height:28, borderRadius:14, background:'var(--bg-2)',
                display:'flex', alignItems:'center', justifyContent:'center', color:'var(--text-2)'
              }}><Mi name="close" size={14}/></button>
            </div>
            <div style={{flex:1, overflowY:'auto'}}>
              {market.map(m => {
                const a = m.last + m.spread;
                const sel = m.sym === sym;
                return (
                  <button key={m.sym} onClick={()=>{ setSym(m.sym); setPickerOpen(false); }} style={{
                    width:'100%', display:'flex', alignItems:'center', gap:10, padding:'11px 16px',
                    borderBottom:'1px solid var(--line)', textAlign:'left',
                    background: sel?'var(--acc-3)':'transparent'
                  }}>
                    <span style={{fontSize:13.5, fontWeight:700, color:'var(--ink)', flex:1}}>{m.sym}</span>
                    <span style={{
                      fontSize:8.5, padding:'2px 5px', borderRadius:3, fontWeight:800, letterSpacing:0.4,
                      background: tagBg[m.cls]||'var(--bg-2)', color: tagCol[m.cls]||'var(--text-2)'
                    }}>{m.cls}</span>
                    <span className="mono" style={{fontSize:12, color:'var(--sell)', fontWeight:600, width:70, textAlign:'right'}}>{ALPEXA_MARKET.fmt(m.last, m.digits)}</span>
                    <span className="mono" style={{fontSize:12, color:'var(--buy)', fontWeight:600, width:70, textAlign:'right'}}>{ALPEXA_MARKET.fmt(a, m.digits)}</span>
                    {sel && <Mi name="check_circle" size={16} style={{color:'var(--acc-2)'}}/>}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Confirmation modal */}
      {confirmOpen && (
        <div onClick={()=>setConfirmOpen(false)} style={{
          position:'absolute', inset:0, background:'rgba(10,14,26,0.55)', zIndex:400,
          display:'flex', alignItems:'center', justifyContent:'center', padding:20
        }}>
          <div onClick={e=>e.stopPropagation()} style={{
            background:'var(--surface)', borderRadius:16, padding:22, width:'100%', maxWidth:320,
            animation:'popIn 0.22s cubic-bezier(0.34,1.56,0.64,1)'
          }}>
            <div style={{
              width:54, height:54, borderRadius:27, margin:'0 auto 12px',
              background: side==='BUY' ? 'var(--buy-tint)' : 'var(--sell-tint)',
              display:'flex', alignItems:'center', justifyContent:'center',
            }}>
              <Mi name={side==='BUY'?'trending_up':'trending_down'} size={28} fill style={{color: side==='BUY' ? 'var(--buy)' : 'var(--sell)'}}/>
            </div>
            <div style={{fontSize:17, fontWeight:700, color:'var(--ink)', textAlign:'center'}}>Confirm {side==='BUY'?'Buy':'Sell'} Order</div>
            <div style={{fontSize:12.5, color:'var(--text-2)', textAlign:'center', marginTop:5, marginBottom:14, lineHeight:1.5}}>
              {otype} order for <b>{s.sym}</b>
            </div>
            <div style={{background:'var(--bg)', borderRadius:9, padding:'10px 14px', marginBottom:16}}>
              <SumRow label="Volume" val={`${ALPEXA_MARKET.fmtVol(s.cls, vol)} ${ALPEXA_MARKET.getUnitLabel(s.cls)}`}/>
              <SumRow label="Entry price" val={ALPEXA_MARKET.fmt(entryPx, s.digits)}/>
              <SumRow label="Stop Loss" val={sl || '—'}/>
              <SumRow label="Take Profit" val={tp || '—'}/>
              <SumRow label="Required margin" val={`$${margin.toLocaleString('en-US',{maximumFractionDigits:2})}`}/>
            </div>
            <div style={{display:'flex', gap:8}}>
              <button onClick={()=>setConfirmOpen(false)} style={{
                flex:1, padding:'11px 0', borderRadius:9, background:'var(--bg-2)',
                fontSize:12.5, fontWeight:600, color:'var(--text-2)'
              }}>Cancel</button>
              <button onClick={place} style={{
                flex:1.2, padding:'11px 0', borderRadius:9,
                background: side==='BUY' ? 'var(--buy)' : 'var(--sell)',
                fontSize:12.5, fontWeight:700, color:'#fff'
              }}>Confirm {side}</button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes slideUp { from{transform:translateY(100%)} to{transform:translateY(0)} }
        @keyframes popIn { from{transform:scale(0.9);opacity:0} to{transform:scale(1);opacity:1} }
      `}</style>
    </div>
  );
}

function formatPriceFixed(n, digits) {
  const s = n.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  if (digits >= 2) return { big: s.slice(0, -2), small: s.slice(-2) };
  return { big: s, small: '' };
}

function Card({ label, children }) {
  return (
    <div style={{background:'var(--surface)', borderRadius:12, padding:'12px 14px', boxShadow:'var(--shadow-sm)'}}>
      <div style={{fontSize:9.5, fontWeight:700, color:'var(--text-3)', letterSpacing:0.7, marginBottom:9}}>{label}</div>
      {children}
    </div>
  );
}
function Seg({ value, onChange, options }) {
  return (
    <div style={{display:'flex', background:'var(--bg-2)', borderRadius:8, padding:3}}>
      {options.map(o => (
        <button key={o} onClick={()=>onChange(o)} style={{
          flex:1, padding:'7px 0', borderRadius:6, fontSize:11.5, fontWeight:700, letterSpacing:0.3,
          background: value===o?'var(--surface)':'transparent',
          color:    value===o?'var(--ink)':'var(--text-2)',
          boxShadow: value===o?'var(--shadow-sm)':'none',
        }}>{o}</button>
      ))}
    </div>
  );
}
function SumRow({ label, val }) {
  return (
    <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', padding:'5px 0', fontSize:12.5}}>
      <span style={{color:'var(--text-2)'}}>{label}</span>
      <span className="mono" style={{color:'var(--ink)', fontWeight:600}}>{val}</span>
    </div>
  );
}

// ──────────────────────────────────────────────
// POSITIONS + HISTORY
// ──────────────────────────────────────────────
function Positions({ tab, setTab, liveOrders = [], pendingOrders = [], closedHistory = [], market = [], onClose, onCancelPending, onModify, onModifyPending }) {
  // Merge live orders + static demo positions. Live first.
  const allPositions = [
    ...liveOrders,
    ...ALPEXA_MARKET.POSITIONS.map(p => ({ ...p, isStatic: true }))
  ];
  const allHistory = [...closedHistory, ...ALPEXA_MARKET.HISTORY];
  const totalPnl = allPositions.reduce((s,p)=>s+(p.pnl||0),0);
  const totalMargin = allPositions.reduce((sum, p) => {
    if (p.isStatic) return sum;
    const symInfo = ALPEXA_MARKET.SYMBOLS.find(s => s.sym === p.sym);
    if (!symInfo) return sum;
    const lev = getLeverageSettings()[symInfo.cls] || 100;
    return sum + ALPEXA_MARKET.getMarginUSD(symInfo, p.vol||0, p.open||0, lev);
  }, 0);
  const [dateFilter, setDateFilter] = useState('all');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [openGroup, setOpenGroup] = useState('time'); // 'time' | 'class' | 'symbol'
  return (
    <div style={{display:'flex', flexDirection:'column', flex:1, minHeight:0, background:'var(--bg)'}}>
      {/* tabs */}
      <div style={{display:'flex', background:'var(--surface)', borderBottom:'1px solid var(--line)', padding:'0 14px'}}>
        {[['OPEN','Open'],['PEND',`Pending${pendingOrders.length?` (${pendingOrders.length})`:''}`],['HIST','History']].map(([k,l]) => (
          <button key={k} onClick={()=>setTab(k)} style={{
            padding:'12px 0', marginRight:18, fontSize:13, fontWeight:tab===k?700:500,
            color: tab===k ? 'var(--ink)' : 'var(--text-3)',
            borderBottom: tab===k ? '2px solid var(--ink)' : '2px solid transparent',
          }}>{l}</button>
        ))}
      </div>

      {/* summary */}
      <div style={{display:'flex', padding:'12px 14px', gap:14, background:'var(--surface)', borderBottom:'1px solid var(--line)'}}>
        <Stat label="Total P/L" val={`${totalPnl>=0?'+':''}$${totalPnl.toFixed(2)}`} color={totalPnl>=0?'var(--buy)':'var(--sell)'}/>
        <Stat label="Positions"  val={`${allPositions.length}`}/>
        <Stat label="Total Margin" val={`$${totalMargin.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}`}/>
      </div>

      {tab === 'OPEN' && (
        <div style={{flex:1, overflowY:'auto'}}>
          {/* Group-by toggle */}
          {liveOrders.length > 0 && (
            <div style={{
              display:'flex', alignItems:'center', gap:6, padding:'8px 14px',
              background:'var(--surface)', borderBottom:'1px solid var(--line)'
            }}>
              <span style={{fontSize:9.5, fontWeight:700, color:'var(--text-3)', letterSpacing:0.5}}>GROUP BY</span>
              <span style={{flex:1}}/>
              {[['time','Time'],['class','Class'],['symbol','Symbol']].map(([k,l]) => (
                <button key={k} onClick={()=>setOpenGroup(k)} style={{
                  padding:'5px 10px', borderRadius:6, fontSize:11, fontWeight:600,
                  background: openGroup===k ? 'var(--ink)' : 'var(--bg-2)',
                  color:    openGroup===k ? 'var(--ink-fg)' : 'var(--text-2)',
                }}>{l}</button>
              ))}
            </div>
          )}

          {openGroup === 'time' && (
            <>
              {liveOrders.length === 0 && (
                <div style={{padding:'8px 14px 4px', fontSize:9.5, fontWeight:700, color:'var(--text-3)', letterSpacing:0.6}}>
                  DEMO POSITIONS
                </div>
              )}
              {liveOrders.length > 0 && (
                <div style={{padding:'8px 14px 4px', fontSize:9.5, fontWeight:700, color:'var(--acc-2)', letterSpacing:0.6, display:'flex', alignItems:'center', gap:4}}>
                  <span className="livedot"/> LIVE — {liveOrders.length} ACTIVE
                </div>
              )}
              {allPositions.map((p,i) => <PosCard key={p.id||'static-'+i} p={p} onClose={onClose} onModify={onModify}/>)}
              {liveOrders.length > 0 && ALPEXA_MARKET.POSITIONS.length > 0 && (
                <div style={{padding:'8px 14px 4px', fontSize:9.5, fontWeight:700, color:'var(--text-3)', letterSpacing:0.6, marginTop:6, borderTop:'1px solid var(--line)'}}>
                  DEMO POSITIONS
                </div>
              )}
            </>
          )}

          {(openGroup === 'class' || openGroup === 'symbol') && (() => {
            const groups = {};
            const labels = { FX:'Forex', STOCK:'Stocks', CRYPTO:'Crypto', INDEX:'Indices' };
            allPositions.forEach(p => {
              const symInfo = ALPEXA_MARKET.SYMBOLS.find(s => s.sym === p.sym);
              const key = openGroup === 'class'
                ? (symInfo ? symInfo.cls : 'OTHER')
                : p.sym;
              if (!groups[key]) groups[key] = [];
              groups[key].push(p);
            });
            const groupKeys = Object.keys(groups).sort();
            return groupKeys.map(k => {
              const list = groups[k];
              const groupPnl = list.reduce((s,p)=>s+(p.pnl||0), 0);
              const groupVol = list.reduce((s,p)=>s+(p.vol||0), 0);
              return (
                <div key={k}>
                  <div style={{
                    padding:'10px 14px 6px', fontSize:9.5, fontWeight:800, color:'var(--text-3)',
                    letterSpacing:0.6, display:'flex', alignItems:'center', gap:8,
                    background:'var(--bg)', borderTop:'1px solid var(--line)', borderBottom:'1px solid var(--line)'
                  }}>
                    <span>{(labels[k] || k).toUpperCase()}</span>
                    <span style={{
                      fontSize:9, fontWeight:700, padding:'1px 6px', borderRadius:9,
                      background:'var(--surface)', color:'var(--text-2)',
                      fontFamily:'JetBrains Mono, monospace'
                    }}>{list.length}</span>
                    <span style={{flex:1}}/>
                    <span className="mono" style={{
                      fontSize:11, fontWeight:700,
                      color: groupPnl>=0 ? 'var(--buy)' : 'var(--sell)'
                    }}>{groupPnl>=0?'+':''}${groupPnl.toFixed(2)}</span>
                  </div>
                  {list.map((p,i) => <PosCard key={p.id||'g-'+k+'-'+i} p={p} onClose={onClose} onModify={onModify}/>)}
                </div>
              );
            });
          })()}
        </div>
      )}
      {tab === 'HIST' && (
        <>
          {/* Date filter pills */}
          <div style={{
            display:'flex', gap:5, padding:'10px 14px', background:'var(--surface)',
            borderBottom:'1px solid var(--line)', overflowX:'auto'
          }}>
            {[['all','All'],['today','Today'],['7d','7d'],['30d','30d'],['custom','Custom']].map(([k,l]) => (
              <button key={k} onClick={()=>setDateFilter(k)} style={{
                flexShrink:0, padding:'5px 12px', borderRadius:14, fontSize:11, fontWeight:700, letterSpacing:0.3,
                background: dateFilter===k?'var(--ink)':'var(--bg-2)',
                color:    dateFilter===k?'var(--ink-fg)' : 'var(--text-2)',
              }}>{l}</button>
            ))}
          </div>

          {dateFilter === 'custom' && (
            <div style={{display:'flex', gap:8, padding:'8px 14px', background:'var(--surface)', borderBottom:'1px solid var(--line)'}}>
              <input type="date" value={customFrom} onChange={e=>setCustomFrom(e.target.value)} className="mono"
                style={{flex:1, padding:'7px 10px', borderRadius:7, border:'1px solid var(--line-2)', fontSize:12, color:'var(--ink)'}}/>
              <input type="date" value={customTo} onChange={e=>setCustomTo(e.target.value)} className="mono"
                style={{flex:1, padding:'7px 10px', borderRadius:7, border:'1px solid var(--line-2)', fontSize:12, color:'var(--ink)'}}/>
            </div>
          )}

          {(() => {
            const filtered = filterByDate(allHistory, dateFilter, customFrom, customTo);
            const filteredPnl = filtered.reduce((s,h)=>s+(h.pnl||0),0);
            return (
              <>
                <div style={{
                  display:'flex', alignItems:'center', gap:8, padding:'10px 14px',
                  background:'var(--bg-2)', borderBottom:'1px solid var(--line)'
                }}>
                  <Mi name="receipt_long" size={16} style={{color:'var(--text-3)'}}/>
                  <span style={{fontSize:11.5, color:'var(--text-2)', flex:1}}>
                    <b className="mono" style={{color:'var(--ink)'}}>{filtered.length}</b> trades · Total <span className="mono" style={{
                      color: filteredPnl >= 0 ? 'var(--buy)' : 'var(--sell)',
                      fontWeight:700
                    }}>
                      {(filteredPnl>=0?'+':'')+'$'+filteredPnl.toFixed(2)}
                    </span>
                  </span>
                </div>
                <div style={{flex:1, overflowY:'auto', background:'var(--surface)'}}>
                  {filtered.length === 0 && (
                    <div style={{padding:'40px 24px', textAlign:'center', color:'var(--text-3)'}}>
                      <Mi name="history" size={36} style={{color:'var(--muted)', display:'block', margin:'0 auto 8px'}}/>
                      <div style={{fontSize:13, fontWeight:600, color:'var(--text-2)'}}>
                        {allHistory.length === 0 ? 'No closed trades yet' : 'No trades in this date range'}
                      </div>
                      <div style={{fontSize:11.5, marginTop:4}}>
                        {allHistory.length === 0 ? 'Your trade history will appear here' : 'Try a different filter'}
                      </div>
                    </div>
                  )}
                  {(() => {
                    // Group by date prefix (MM-DD)
                    const grouped = {};
                    filtered.forEach(h => {
                      const dayKey = (h.date || '').slice(0, 5) || '—';
                      if (!grouped[dayKey]) grouped[dayKey] = [];
                      grouped[dayKey].push(h);
                    });
                    return Object.entries(grouped).map(([day, items]) => {
                      const dayPnl = items.reduce((s,h)=>s+(h.pnl||0), 0);
                      return (
                        <div key={day}>
                          <div style={{
                            display:'flex', alignItems:'center', padding:'8px 14px',
                            background:'var(--bg)', fontSize:10, fontWeight:700, color:'var(--text-3)', letterSpacing:0.5
                          }}>
                            <span style={{flex:1}}>{day}</span>
                            <span className="mono" style={{
                              color: dayPnl >= 0 ? 'var(--buy)' : 'var(--sell)', fontWeight:700
                            }}>{(dayPnl>=0?'+':'')+'$'+dayPnl.toFixed(2)} · {items.length} {items.length===1?'trade':'trades'}</span>
                          </div>
                          {items.map((h,i) => (
                            <div key={h.id||day+'-'+i} style={{
                              display:'flex', alignItems:'center', padding:'12px 14px',
                              borderBottom:'1px solid var(--line)'
                            }}>
                              <div style={{flex:1.4}}>
                                <div style={{display:'flex', alignItems:'center', gap:6}}>
                                  <span style={{
                                    fontSize:9, fontWeight:800, padding:'2px 5px', borderRadius:3,
                                    background: h.side==='BUY'?'var(--buy-tint)':'var(--sell-tint)',
                                    color:    h.side==='BUY'?'var(--buy-2)':'var(--sell-2)'
                                  }}>{h.side}</span>
                                  <span style={{fontSize:13, fontWeight:700, color:'var(--ink)'}}>{h.sym}</span>
                                  <span className="mono" style={{fontSize:10.5, color:'var(--text-3)'}}>{h.vol}</span>
                                </div>
                                <div className="mono" style={{fontSize:10, color:'var(--text-3)', marginTop:3}}>
                                  {typeof h.open === 'number' ? h.open.toFixed(5).replace(/\.?0+$/, p => p === '.' ? '' : p) : h.open} → {typeof h.close === 'number' ? h.close.toFixed(5).replace(/\.?0+$/, p => p === '.' ? '' : p) : h.close} · {(h.date||'').slice(6)}
                                </div>
                              </div>
                              <div className="mono" style={{
                                fontSize:13.5, fontWeight:700,
                                color: h.pnl>=0?'var(--buy)':'var(--sell)'
                              }}>
                                {h.pnl>=0?'+':''}${h.pnl.toFixed(2)}
                              </div>
                            </div>
                          ))}
                        </div>
                      );
                    });
                  })()}
                </div>
              </>
            );
          })()}
        </>
      )}
      {tab === 'PEND' && (
        <div style={{flex:1, overflowY:'auto'}}>
          {pendingOrders.length === 0 && (
            <div style={{padding:'40px 24px', textAlign:'center', color:'var(--text-3)'}}>
              <Mi name="hourglass_empty" size={36} style={{color:'var(--muted)', display:'block', margin:'0 auto 8px'}}/>
              <div style={{fontSize:13, fontWeight:600, color:'var(--text-2)'}}>No pending orders</div>
              <div style={{fontSize:11.5, marginTop:4}}>Limit / Stop orders will appear here</div>
            </div>
          )}
          {pendingOrders.map(p => {
            const isBuy = p.side === 'BUY';
            const symInfo = ALPEXA_MARKET.SYMBOLS.find(s => s.sym === p.sym);
            const liveSym = market.find(m => m.sym === p.sym);
            const digits = symInfo ? symInfo.digits : 5;
            const curPx = liveSym ? (isBuy ? liveSym.last + liveSym.spread : liveSym.last) : 0;
            const dist = curPx ? ((p.trigger - curPx) * Math.pow(10, digits)) : 0;
            return (
              <div key={p.id} style={{background:'var(--surface)', marginBottom:6, padding:'12px 14px'}}>
                <div style={{display:'flex', alignItems:'center', gap:8, marginBottom:9}}>
                  <span style={{
                    fontSize:9, fontWeight:800, padding:'2px 6px', borderRadius:3, letterSpacing:0.3,
                    background: isBuy?'var(--buy-tint)':'var(--sell-tint)',
                    color:    isBuy?'var(--buy-2)':'var(--sell-2)'
                  }}>{p.side} {p.otype}</span>
                  <span style={{fontSize:14, fontWeight:700, color:'var(--ink)'}}>{p.sym}</span>
                  <span className="mono" style={{fontSize:11, color:'var(--text-3)'}}>{ALPEXA_MARKET.fmtVol(symInfo?.cls||'FX', p.vol)} {ALPEXA_MARKET.getUnitLabel(symInfo?.cls||'FX')}</span>
                  <span style={{flex:1}}/>
                  <span style={{
                    fontSize:9, fontWeight:700, padding:'2px 5px', borderRadius:3,
                    background:'rgba(229,139,30,0.18)', color:'var(--warn)', letterSpacing:0.4,
                    display:'flex', alignItems:'center', gap:3
                  }}>
                    <span style={{width:5, height:5, borderRadius:'50%', background:'var(--warn)', display:'inline-block'}}/>
                    WAITING
                  </span>
                </div>
                <div style={{
                  display:'grid', gridTemplateColumns:'1.2fr 1fr 1fr 0.9fr',
                  background:'var(--bg)', borderRadius:8, padding:'6px 0', marginBottom:9
                }}>
                  <Meta lbl={p.otype + ' @'} val={p.trigger.toFixed(digits)}/>
                  <Meta lbl="SL"   val={p.sl ? p.sl.toFixed(digits) : '—'}/>
                  <Meta lbl="TP"   val={p.tp ? p.tp.toFixed(digits) : '—'}/>
                  <Meta lbl="DIST" val={(dist>=0?'+':'')+dist.toFixed(0)+'pt'}/>
                </div>
                <div style={{fontSize:10, color:'var(--text-3)', marginBottom:9, display:'flex', alignItems:'center', gap:6}}>
                  <Mi name="schedule" size={12}/> Placed {p.placedAt}
                </div>
                <div style={{display:'flex', gap:6}}>
                  <button onClick={()=>onModifyPending && onModifyPending(p)} style={{
                    flex:1, padding:'7px 0', borderRadius:7, fontSize:11.5, fontWeight:600,
                    background:'var(--bg-2)', color:'var(--text-2)'
                  }}>Modify</button>
                  <button onClick={()=>onCancelPending && onCancelPending(p.id)} style={{
                    flex:1, padding:'7px 0', borderRadius:7, fontSize:11.5, fontWeight:700,
                    background:'var(--sell-tint)', color:'var(--sell-2)'
                  }}>Cancel</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function filterByDate(history, mode, customFrom, customTo) {
  if (mode === 'all') return history;
  const now = new Date();
  const today = now.toISOString().slice(0, 10); // YYYY-MM-DD
  function toIso(d) {
    // d is "MM-DD HH:mm" — assume current year
    if (!d) return null;
    const md = d.slice(0, 5); // MM-DD
    return now.getFullYear() + '-' + md;
  }
  return history.filter(h => {
    const iso = toIso(h.date);
    if (!iso) return false;
    if (mode === 'today') return iso === today;
    if (mode === '7d' || mode === '30d') {
      const days = mode === '7d' ? 7 : 30;
      const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      return iso >= cutoff && iso <= today;
    }
    if (mode === 'custom') {
      if (!customFrom && !customTo) return true;
      if (customFrom && iso < customFrom) return false;
      if (customTo && iso > customTo) return false;
      return true;
    }
    return true;
  });
}

function EmailHistorySheet({ onClose }) {
  const PRESETS = [
    ['today',  'Today'],
    ['7d',     'Last 7 days'],
    ['30d',    'Last 30 days'],
    ['month',  'This month'],
    ['lastm',  'Last month'],
    ['custom', 'Custom range'],
  ];
  const FORMATS = [['pdf','PDF'], ['csv','CSV'], ['html','HTML']];
  const [preset, setPreset] = useState('30d');
  const [from, setFrom] = useState('2026-04-17');
  const [to, setTo] = useState('2026-05-17');
  const [email, setEmail] = useState('zbnyme@gmail.com');
  const [format, setFormat] = useState('pdf');
  const [includeOpen, setIncludeOpen] = useState(true);
  const [includePending, setIncludePending] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  // compute date range based on preset
  function presetLabel() {
    const today = '2026-05-17';
    if (preset === 'today')  return today + ' → ' + today;
    if (preset === '7d')     return '2026-05-10 → ' + today;
    if (preset === '30d')    return '2026-04-17 → ' + today;
    if (preset === 'month')  return '2026-05-01 → ' + today;
    if (preset === 'lastm')  return '2026-04-01 → 2026-04-30';
    return from + ' → ' + to;
  }

  function send() {
    if (!email.includes('@')) return;
    setSending(true);
    setTimeout(() => { setSending(false); setSent(true); }, 1400);
  }

  return (
    <div onClick={onClose} style={{
      position:'absolute', inset:0, background:'rgba(10,14,26,0.55)', zIndex:300,
      display:'flex', flexDirection:'column', justifyContent:'flex-end',
    }}>
      <div onClick={e=>e.stopPropagation()} style={{
        background:'var(--surface)', borderTopLeftRadius:16, borderTopRightRadius:16,
        display:'flex', flexDirection:'column', maxHeight:'88%', overflow:'hidden',
        animation:'slideUp 0.22s cubic-bezier(0.2,0.8,0.2,1)'
      }}>
        <div style={{display:'flex', justifyContent:'center', padding:'8px 0 4px'}}>
          <div style={{width:36, height:4, borderRadius:2, background:'var(--line-2)'}}/>
        </div>

        {sent ? (
          <div style={{padding:'22px 22px 32px', textAlign:'center'}}>
            <div style={{
              width:64, height:64, borderRadius:32, background:'var(--buy-tint)',
              display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 14px'
            }}>
              <Mi name="mark_email_read" size={32} fill style={{color:'var(--buy)'}}/>
            </div>
            <div style={{fontSize:17, fontWeight:700, color:'var(--ink)', marginBottom:6}}>Report Sent</div>
            <div style={{fontSize:13, color:'var(--text-2)', lineHeight:1.5, marginBottom:18}}>
              Your trade history for <b>{presetLabel()}</b><br/>has been emailed to <b>{email}</b>
            </div>
            <button onClick={onClose} style={{
              width:'100%', padding:'12px 0', borderRadius:10, background:'var(--ink)', color:'var(--ink-fg)', fontSize:14, fontWeight:700
            }}>Done</button>
          </div>
        ) : (
          <>
            <div style={{padding:'6px 16px 10px', display:'flex', alignItems:'center'}}>
              <div>
                <div style={{fontSize:15, fontWeight:700, color:'var(--ink)'}}>Email Trade Report</div>
                <div style={{fontSize:11, color:'var(--text-3)', marginTop:2}}>
                  PDF · CSV · HTML — sent to your inbox
                </div>
              </div>
              <span style={{flex:1}}/>
              <button onClick={onClose} style={{
                width:28, height:28, borderRadius:14, background:'var(--bg-2)',
                display:'flex', alignItems:'center', justifyContent:'center', color:'var(--text-2)'
              }}><Mi name="close" size={14}/></button>
            </div>

            <div style={{flex:1, overflowY:'auto', padding:'4px 16px 16px'}}>

              {/* Date range */}
              <div style={{fontSize:10, fontWeight:700, color:'var(--text-3)', letterSpacing:0.5, margin:'8px 0 6px'}}>DATE RANGE</div>
              <div style={{display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:6, marginBottom:8}}>
                {PRESETS.map(([k,l]) => (
                  <button key={k} onClick={()=>setPreset(k)} style={{
                    padding:'8px 0', borderRadius:7, fontSize:11.5, fontWeight:600, letterSpacing:0.2,
                    background: preset===k?'var(--ink)':'var(--bg-2)',
                    color:    preset===k?'var(--ink-fg)' : 'var(--text-2)',
                  }}>{l}</button>
                ))}
              </div>
              {preset === 'custom' ? (
                <div style={{display:'flex', gap:10, marginBottom:14}}>
                  <div style={{flex:1}}>
                    <div style={{fontSize:9, fontWeight:700, color:'var(--text-3)', letterSpacing:0.4, marginBottom:4}}>FROM</div>
                    <input type="date" value={from} onChange={e=>setFrom(e.target.value)} className="mono"
                      style={{width:'100%', padding:'8px 10px', borderRadius:7, border:'1px solid var(--line-2)', fontSize:13, color:'var(--ink)'}}/>
                  </div>
                  <div style={{flex:1}}>
                    <div style={{fontSize:9, fontWeight:700, color:'var(--text-3)', letterSpacing:0.4, marginBottom:4}}>TO</div>
                    <input type="date" value={to} onChange={e=>setTo(e.target.value)} className="mono"
                      style={{width:'100%', padding:'8px 10px', borderRadius:7, border:'1px solid var(--line-2)', fontSize:13, color:'var(--ink)'}}/>
                  </div>
                </div>
              ) : (
                <div className="mono" style={{
                  fontSize:11.5, color:'var(--text-2)', background:'var(--bg)', padding:'8px 10px',
                  borderRadius:7, marginBottom:14, textAlign:'center', letterSpacing:0.3
                }}>{presetLabel()}</div>
              )}

              {/* Email address */}
              <div style={{fontSize:10, fontWeight:700, color:'var(--text-3)', letterSpacing:0.5, marginBottom:6}}>SEND TO</div>
              <div style={{
                display:'flex', alignItems:'center', gap:8, padding:'10px 12px',
                borderRadius:9, background:'var(--bg)', marginBottom:14
              }}>
                <Mi name="mail" size={16} style={{color:'var(--text-3)'}}/>
                <input value={email} onChange={e=>setEmail(e.target.value)} type="email"
                  placeholder="you@example.com"
                  style={{flex:1, fontSize:14, color:'var(--ink)', fontWeight:500}}/>
              </div>

              {/* Format */}
              <div style={{fontSize:10, fontWeight:700, color:'var(--text-3)', letterSpacing:0.5, marginBottom:6}}>FORMAT</div>
              <div style={{display:'flex', gap:6, marginBottom:14}}>
                {FORMATS.map(([k,l]) => (
                  <button key={k} onClick={()=>setFormat(k)} style={{
                    flex:1, padding:'9px 0', borderRadius:8, fontSize:12, fontWeight:700,
                    background: format===k?'var(--acc-3)':'var(--bg-2)',
                    color:    format===k?'var(--acc-2)':'var(--text-2)',
                    border: format===k?'1px solid var(--acc)':'1px solid transparent',
                    display:'flex', alignItems:'center', justifyContent:'center', gap:4
                  }}>
                    <Mi name={k==='pdf'?'picture_as_pdf':k==='csv'?'table_view':'description'} size={14}/>
                    {l}
                  </button>
                ))}
              </div>

              {/* Include options */}
              <div style={{fontSize:10, fontWeight:700, color:'var(--text-3)', letterSpacing:0.5, marginBottom:8}}>INCLUDE</div>
              <CheckRow label="Open positions" checked={includeOpen} onChange={setIncludeOpen} sub={`${ALPEXA_MARKET.POSITIONS.length} active`}/>
              <CheckRow label="Pending orders" checked={includePending} onChange={setIncludePending} sub={`${ALPEXA_MARKET.PENDING.length} waiting`}/>
              <CheckRow label="Closed trades" checked={true} onChange={()=>{}} sub={`${ALPEXA_MARKET.HISTORY.length} in range`} required/>
            </div>

            <div style={{padding:'10px 16px 16px', background:'var(--surface)', borderTop:'1px solid var(--line)'}}>
              <button onClick={send} disabled={sending || !email.includes('@')} style={{
                width:'100%', padding:'13px 0', borderRadius:10, fontSize:14, fontWeight:700, color:'#fff',
                background: (sending||!email.includes('@')) ? 'var(--muted)' : 'var(--acc)',
                display:'flex', alignItems:'center', justifyContent:'center', gap:8,
                opacity: sending ? 0.85 : 1
              }}>
                {sending ? (
                  <>
                    <div style={{
                      width:16, height:16, border:'2.5px solid rgba(255,255,255,0.35)',
                      borderTopColor:'#fff', borderRadius:'50%', animation:'spin 0.7s linear infinite'
                    }}/>
                    Sending…
                  </>
                ) : (
                  <>
                    <Mi name="send" size={16}/>
                    Send Report
                  </>
                )}
              </button>
            </div>
          </>
        )}
      </div>
      <style>{`
        @keyframes slideUp { from{transform:translateY(100%)} to{transform:translateY(0)} }
        @keyframes spin { to{transform:rotate(360deg)} }
      `}</style>
    </div>
  );
}

function CheckRow({ label, checked, onChange, sub, required }) {
  return (
    <div onClick={()=>!required && onChange(!checked)} style={{
      display:'flex', alignItems:'center', gap:10, padding:'10px 12px', background:'var(--bg)',
      borderRadius:9, marginBottom:6, cursor: required ? 'default' : 'pointer'
    }}>
      <div style={{
        width:20, height:20, borderRadius:5, flexShrink:0,
        background: checked ? 'var(--acc)' : 'transparent',
        border: '2px solid ' + (checked ? 'var(--acc)' : 'var(--muted)'),
        display:'flex', alignItems:'center', justifyContent:'center'
      }}>
        {checked && <Mi name="check" size={12} style={{color:'#fff'}}/>}
      </div>
      <div style={{flex:1}}>
        <div style={{fontSize:13, color:'var(--ink)', fontWeight:500}}>
          {label}{required && <span style={{fontSize:9, color:'var(--text-3)', marginLeft:6, fontWeight:700, letterSpacing:0.3}}>REQUIRED</span>}
        </div>
        {sub && <div style={{fontSize:10.5, color:'var(--text-3)', marginTop:1}}>{sub}</div>}
      </div>
    </div>
  );
}
function Stat({ label, val, color }) {
  return (
    <div style={{flex:1}}>
      <div style={{fontSize:9.5, fontWeight:700, color:'var(--text-3)', letterSpacing:0.5}}>{label}</div>
      <div className="mono" style={{fontSize:15, fontWeight:700, color: color||'var(--ink)', marginTop:2}}>{val}</div>
    </div>
  );
}
function ModifySheet({ position, isPending = false, market = [], onSave, onClose }) {
  const symInfo = ALPEXA_MARKET.SYMBOLS.find(s => s.sym === position.sym);
  const digits = symInfo ? symInfo.digits : 5;
  const [sl, setSl] = useState(position.sl ? String(position.sl) : '');
  const [tp, setTp] = useState(position.tp ? String(position.tp) : '');
  const [trigger, setTrigger] = useState(position.trigger ? String(position.trigger) : '');
  const [, force] = useState(0);
  const liveSym = market.find(m => m.sym === position.sym);
  const bid = liveSym ? liveSym.last : position.open;
  const ask = liveSym ? liveSym.last + liveSym.spread : position.open;
  const curPx = position.side === 'BUY' ? bid : ask;
  // tickValueUSD for SL/TP $ impact
  const lotSize = ALPEXA_MARKET.getLotSize ? ALPEXA_MARKET.getLotSize(symInfo || { sym: position.sym, cls: 'FX' }) : (symInfo?.cls === 'FX' ? 100000 : 1);
  const tickSize = Math.pow(10, -digits);
  const tickValueUSD = ALPEXA_MARKET.isUsdBaseFx && ALPEXA_MARKET.isUsdBaseFx(symInfo || {})
    ? (tickSize * lotSize * (position.vol || 0)) / (curPx || 1)
    : tickSize * lotSize * (position.vol || 0);
  const entryPx = isPending ? (parseFloat(trigger) || position.trigger || curPx) : position.open;

  function sltpHelper(val, isTp) {
    if (val === '' || val == null) return null;
    const rawStr = String(val).trim();
    let p = parseFloat(rawStr);
    if (isNaN(p) || p === 0) return null;
    p = Math.abs(p);
    let targetPx;
    const hasDecimal = rawStr.includes('.');
    const isPipMode = !hasDecimal || p < entryPx * 0.5;
    if (isPipMode) {
      const offset = p * tickSize;
      if (isTp) targetPx = position.side === 'BUY' ? entryPx + offset : entryPx - offset;
      else      targetPx = position.side === 'BUY' ? entryPx - offset : entryPx + offset;
    } else {
      targetPx = p;
    }
    const dist = Math.abs(entryPx - targetPx) * Math.pow(10, digits);
    const amt = tickValueUSD * dist;
    const pctAway = Math.abs(entryPx - targetPx) / entryPx;
    return {
      dist: dist.toFixed(0),
      amt: amt.toFixed(2),
      invalid: pctAway > 0.30,
      tooClose: dist < 10,
      pctAway: (pctAway*100).toFixed(1),
      targetPx: targetPx.toFixed(digits),
      asPipsInput: isPipMode,
    };
  }
  const slH = sltpHelper(sl, false);
  const tpH = sltpHelper(tp, true);

  // Re-render every 700ms so price ticks live
  useEffect(() => {
    const id = setInterval(() => force(x => x + 1), 700);
    return () => clearInterval(id);
  }, []);
  const flashRef = React.useRef(curPx);
  const flashDir = curPx > flashRef.current ? 'up' : curPx < flashRef.current ? 'down' : '';
  React.useEffect(() => { flashRef.current = curPx; }, [curPx]);

  function save() {
    if (slH && (slH.invalid || slH.tooClose)) return;
    if (tpH && (tpH.invalid || tpH.tooClose)) return;
    const updated = {
      ...position,
      sl: slH ? parseFloat(slH.targetPx) : 0,
      tp: tpH ? parseFloat(tpH.targetPx) : 0,
    };
    if (isPending && trigger) updated.trigger = parseFloat(trigger);
    onSave(updated);
    onClose();
  }
  const canSave = (!slH || (!slH.invalid && !slH.tooClose)) && (!tpH || (!tpH.invalid && !tpH.tooClose));

  return (
    <div onClick={onClose} style={{
      position:'absolute', inset:0, background:'rgba(10,14,26,0.55)', zIndex:300,
      display:'flex', flexDirection:'column', justifyContent:'flex-end',
    }}>
      <div onClick={e=>e.stopPropagation()} style={{
        background:'var(--surface)', borderTopLeftRadius:16, borderTopRightRadius:16,
        display:'flex', flexDirection:'column',
        animation:'slideUp 0.22s cubic-bezier(0.2,0.8,0.2,1)'
      }}>
        <div style={{display:'flex', justifyContent:'center', padding:'8px 0 4px'}}>
          <div style={{width:36, height:4, borderRadius:2, background:'var(--line-2)'}}/>
        </div>
        <div style={{padding:'6px 16px 6px', display:'flex', alignItems:'center'}}>
          <div>
            <div style={{fontSize:16, fontWeight:700, color:'var(--ink)'}}>
              Modify {isPending ? 'Pending Order' : 'Position'}
            </div>
            <div style={{fontSize:11.5, color:'var(--text-3)', marginTop:2}}>
              <span className="mono">{position.side} {ALPEXA_MARKET.fmtVol(symInfo?.cls||'FX', position.vol)} {ALPEXA_MARKET.getUnitLabel(symInfo?.cls||'FX')} {position.sym}</span>
              {!isPending && position.open && <span> · Open <span className="mono">{Number(position.open).toFixed(digits)}</span></span>}
            </div>
          </div>
          <span style={{flex:1}}/>
          <button onClick={onClose} style={{
            width:28, height:28, borderRadius:14, background:'var(--bg-2)',
            display:'flex', alignItems:'center', justifyContent:'center', color:'var(--text-2)'
          }}><Mi name="close" size={14}/></button>
        </div>

        {/* Live price strip */}
        {liveSym && (
          <div style={{
            margin:'0 16px 14px', padding:'10px 14px', background:'var(--bg)', borderRadius:9,
            display:'flex', alignItems:'center', gap:14
          }}>
            <div style={{display:'flex', alignItems:'center', gap:6}}>
              <span className="livedot"/>
              <span style={{fontSize:9, fontWeight:800, color:'var(--text-3)', letterSpacing:0.5}}>LIVE</span>
            </div>
            <div style={{flex:1, display:'flex', flexDirection:'column'}}>
              <div style={{fontSize:9, fontWeight:700, color:'var(--text-3)', letterSpacing:0.5}}>BID</div>
              <div className={`mono ${flashDir==='up'?'flash-up':flashDir==='down'?'flash-down':''}`} style={{
                fontSize:14, fontWeight:700, color:'var(--sell)', padding:'0 2px', borderRadius:3
              }}>{bid.toFixed(digits)}</div>
            </div>
            <div style={{flex:1, display:'flex', flexDirection:'column', alignItems:'flex-end'}}>
              <div style={{fontSize:9, fontWeight:700, color:'var(--text-3)', letterSpacing:0.5}}>ASK</div>
              <div className={`mono ${flashDir==='up'?'flash-up':flashDir==='down'?'flash-down':''}`} style={{
                fontSize:14, fontWeight:700, color:'var(--buy)', padding:'0 2px', borderRadius:3
              }}>{ask.toFixed(digits)}</div>
            </div>
            {!isPending && position.open && (() => {
              const dist = (curPx - position.open) * (position.side === 'BUY' ? 1 : -1);
              const distPt = (dist * Math.pow(10, digits)).toFixed(0);
              const up = dist >= 0;
              return (
                <div style={{
                  textAlign:'right', minWidth:54
                }}>
                  <div style={{fontSize:9, fontWeight:700, color:'var(--text-3)', letterSpacing:0.5}}>FROM OPEN</div>
                  <div className="mono" style={{fontSize:12, fontWeight:700, color: up?'var(--buy)':'var(--sell)'}}>
                    {up?'+':''}{distPt}pt
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        <div style={{padding:'0 16px 14px'}}>
          {isPending && (
            <div style={{marginBottom:14}}>
              <div style={{fontSize:9.5, fontWeight:700, color:'var(--acc-2)', letterSpacing:0.5, marginBottom:5, display:'flex', alignItems:'center', gap:4}}>
                <Mi name="bolt" size={12}/> TRIGGER PRICE
              </div>
              <input value={trigger} onChange={e=>setTrigger(e.target.value)} type="number" step="any" className="mono"
                placeholder={Number(position.trigger||0).toFixed(digits)}
                style={{width:'100%', borderBottom:'1.5px solid var(--acc)', padding:'6px 0', fontSize:16, color:'var(--ink)', fontWeight:600, outline:'none', background:'transparent'}}/>
            </div>
          )}

          <div style={{display:'flex', gap:14, marginBottom:12}}>
            <div style={{flex:1}}>
              <div style={{fontSize:9.5, fontWeight:800, color:'var(--sell)', letterSpacing:0.5, marginBottom:5, display:'flex', alignItems:'center', gap:4}}>
                <Mi name="shield" size={12}/> STOP LOSS
              </div>
              <div style={{display:'flex', alignItems:'center', gap:4, borderBottom:'1.5px solid var(--line-2)', paddingBottom:5}}>
                <input value={sl} onChange={e=>setSl(e.target.value)} type="number" step="any" placeholder="—" className="mono"
                  style={{flex:1, fontSize:15, color:'var(--ink)', fontWeight:600, outline:'none', width:'100%', background:'transparent'}}/>
                {sl && <button onClick={()=>setSl('')} style={{color:'var(--text-3)'}}><Mi name="close" size={14}/></button>}
              </div>
              <div className="mono" style={{fontSize:9.5, marginTop:5, color: slH ? (slH.invalid || slH.tooClose ? 'var(--warn)' : 'var(--sell)') : 'var(--text-3)'}}>
                {slH ? (slH.invalid
                  ? `⚠ ${slH.pctAway}% off entry — check price`
                  : slH.tooClose
                    ? `⚠ Min 10 pt required (now ${slH.dist} pt)`
                    : `${slH.asPipsInput ? '→ ' + slH.targetPx + ' · ' : ''}${slH.dist} pt · −$${slH.amt}`
                ) : 'No SL set'}
              </div>
            </div>
            <div style={{flex:1}}>
              <div style={{fontSize:9.5, fontWeight:800, color:'var(--buy)', letterSpacing:0.5, marginBottom:5, display:'flex', alignItems:'center', gap:4}}>
                <Mi name="flag" size={12}/> TAKE PROFIT
              </div>
              <div style={{display:'flex', alignItems:'center', gap:4, borderBottom:'1.5px solid var(--line-2)', paddingBottom:5}}>
                <input value={tp} onChange={e=>setTp(e.target.value)} type="number" step="any" placeholder="—" className="mono"
                  style={{flex:1, fontSize:15, color:'var(--ink)', fontWeight:600, outline:'none', width:'100%', background:'transparent'}}/>
                {tp && <button onClick={()=>setTp('')} style={{color:'var(--text-3)'}}><Mi name="close" size={14}/></button>}
              </div>
              <div className="mono" style={{fontSize:9.5, marginTop:5, color: tpH ? (tpH.invalid || tpH.tooClose ? 'var(--warn)' : 'var(--buy)') : 'var(--text-3)'}}>
                {tpH ? (tpH.invalid
                  ? `⚠ ${tpH.pctAway}% off entry — check price`
                  : tpH.tooClose
                    ? `⚠ Min 10 pt required (now ${tpH.dist} pt)`
                    : `${tpH.asPipsInput ? '→ ' + tpH.targetPx + ' · ' : ''}${tpH.dist} pt · +$${tpH.amt}`
                ) : 'No TP set'}
              </div>
            </div>
          </div>

          <div style={{
            background:'var(--bg)', borderRadius:9, padding:'10px 12px',
            display:'flex', alignItems:'flex-start', gap:8, fontSize:11.5, color:'var(--text-2)'
          }}>
            <Mi name="info" size={14}/>
            <span>{isPending
              ? 'Trigger price determines when the order becomes active. SL/TP apply once filled.'
              : 'Stop Loss closes the position to limit losses. Take Profit closes when target is hit.'}</span>
          </div>
        </div>

        <div style={{padding:'10px 16px 16px', background:'var(--surface)', borderTop:'1px solid var(--line)', display:'flex', gap:8}}>
          <button onClick={onClose} style={{
            flex:1, padding:'12px 0', borderRadius:10, fontSize:13, fontWeight:600,
            background:'var(--bg-2)', color:'var(--text-2)'
          }}>Cancel</button>
          <button onClick={save} disabled={!canSave} style={{
            flex:1.5, padding:'12px 0', borderRadius:10, fontSize:13, fontWeight:700, color:'#fff',
            background: canSave ? 'var(--acc)' : 'var(--muted)',
            cursor: canSave ? 'pointer' : 'not-allowed'
          }}>Save Changes</button>
        </div>
      </div>
    </div>
  );
}

function PosCard({ p, onClose, onModify }) {
  const up = p.pnl >= 0;
  const fresh = p.fresh;
  const symInfo = ALPEXA_MARKET.SYMBOLS.find(s => s.sym === p.sym);
  const digits = symInfo ? symInfo.digits : 5;
  const cls = symInfo ? symInfo.cls : 'FX';
  const fmtPx = v => (typeof v === 'number' ? v.toFixed(digits) : v);
  return (
    <div style={{
      background:'var(--surface)', marginBottom:6, padding:'12px 14px',
      position:'relative',
      animation: fresh ? 'newOrder 1.5s ease' : 'none',
      borderLeft: fresh ? '3px solid ' + (p.side==='BUY'?'var(--buy)':'var(--sell)') : '3px solid transparent',
    }}>
      {fresh && (
        <div style={{
          position:'absolute', top:8, right:10,
          fontSize:8.5, fontWeight:800, padding:'2px 6px', borderRadius:3,
          background:'var(--acc)', color:'#fff', letterSpacing:0.5,
          animation:'pulse 1.2s ease infinite'
        }}>NEW</div>
      )}
      <div style={{display:'flex', alignItems:'center', gap:8, marginBottom:9}}>
        <span style={{
          fontSize:9, fontWeight:800, padding:'2px 6px', borderRadius:3,
          background: p.side==='BUY'?'var(--buy-tint)':'var(--sell-tint)',
          color:    p.side==='BUY'?'var(--buy-2)':'var(--sell-2)'
        }}>{p.side}</span>
        <span style={{fontSize:14, fontWeight:700, color:'var(--ink)'}}>{p.sym}</span>
        <span className="mono" style={{fontSize:11, color:'var(--text-3)'}}>{ALPEXA_MARKET.fmtVol(cls, p.vol)} {ALPEXA_MARKET.getUnitLabel(cls)}</span>
        {p.placedAt && <span className="mono" style={{fontSize:9.5, color:'var(--text-3)', marginLeft:'auto', marginRight:8}}>{p.placedAt}</span>}
        {!p.placedAt && <span style={{flex:1}}/>}
        <span className="mono" style={{fontSize:15, fontWeight:700, color: up?'var(--buy)':'var(--sell)'}}>
          {up?'+':''}${p.pnl.toFixed(2)}
        </span>
      </div>
      <div style={{
        display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr',
        background:'var(--bg)', borderRadius:8, padding:'6px 0', marginBottom:9
      }}>
        <Meta lbl="OPEN" val={fmtPx(p.open)}/>
        <Meta lbl="SL"   val={p.sl ? fmtPx(p.sl) : '—'}/>
        <Meta lbl="TP"   val={p.tp ? fmtPx(p.tp) : '—'}/>
        <Meta lbl="SWAP" val={p.swap !== undefined ? (p.swap>=0?'+':'')+p.swap.toFixed(2) : '0.00'}/>
      </div>
      <div style={{display:'flex', gap:6}}>
        <button onClick={()=>onModify && onModify(p)} style={{
          flex:1, padding:'7px 0', borderRadius:7, fontSize:11.5, fontWeight:600,
          background:'var(--bg-2)', color:'var(--text-2)'
        }}>Modify</button>
        <button onClick={()=>{ if (onClose && p.id) onClose(p.id); }} style={{
          flex:1, padding:'7px 0', borderRadius:7, fontSize:11.5, fontWeight:700,
          background:'var(--ink)', color:'var(--ink-fg)'
        }}>Close</button>
      </div>
      <style>{`
        @keyframes newOrder { 0%{background:rgba(34,184,207,0.2)} 100%{background:#fff} }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.5} }
      `}</style>
    </div>
  );
}
function Meta({ lbl, val }) {
  return (
    <div style={{textAlign:'center', borderLeft:'1px solid var(--line)', padding:'2px 0'}}>
      <div style={{fontSize:8.5, fontWeight:700, color:'var(--text-3)', letterSpacing:0.4}}>{lbl}</div>
      <div className="mono" style={{fontSize:11, fontWeight:600, color:'var(--ink)', marginTop:1}}>{val}</div>
    </div>
  );
}

// ──────────────────────────────────────────────
// NEWS / CALENDAR
// ──────────────────────────────────────────────
function NewsScreen() {
  const [tab, setTab] = useState('NEWS');
  return (
    <div style={{display:'flex', flexDirection:'column', flex:1, minHeight:0, background:'var(--bg)'}}>
      <div style={{display:'flex', background:'var(--surface)', borderBottom:'1px solid var(--line)', padding:'0 14px'}}>
        {[['NEWS','News'],['CAL','Calendar']].map(([k,l]) => (
          <button key={k} onClick={()=>setTab(k)} style={{
            padding:'12px 0', marginRight:18, fontSize:13, fontWeight:tab===k?700:500,
            color: tab===k ? 'var(--ink)' : 'var(--text-3)',
            borderBottom: tab===k ? '2px solid var(--ink)' : '2px solid transparent',
          }}>{l}</button>
        ))}
      </div>
      {tab==='NEWS' && (
        <div style={{flex:1, overflowY:'auto'}}>
          {ALPEXA_MARKET.NEWS.map((n,i) => (
            <div key={i} style={{background:'var(--surface)', padding:'12px 14px', borderBottom:'1px solid var(--line)'}}>
              <div style={{display:'flex', alignItems:'center', gap:8, marginBottom:5}}>
                <span className="mono" style={{fontSize:11, color:'var(--text-3)'}}>{n.t}</span>
                <span style={{
                  fontSize:9, fontWeight:800, padding:'2px 5px', borderRadius:3,
                  background:'var(--bg-2)', color:'var(--text-2)', letterSpacing:0.4
                }}>{n.tag}</span>
                {n.impact==='high' && <span style={{
                  fontSize:9, fontWeight:800, padding:'2px 5px', borderRadius:3,
                  background:'var(--sell-tint)', color:'var(--sell-2)'
                }}>HIGH</span>}
              </div>
              <div style={{fontSize:13.5, fontWeight:700, color:'var(--ink)', lineHeight:1.35, marginBottom:3}}>{n.ttl}</div>
              <div style={{fontSize:11.5, color:'var(--text-2)', lineHeight:1.45}}>{n.body}</div>
            </div>
          ))}
        </div>
      )}
      {tab==='CAL' && (
        <div style={{flex:1, overflowY:'auto', background:'var(--surface)'}}>
          <div style={{padding:'10px 14px 4px', fontSize:10, fontWeight:700, color:'var(--text-3)', letterSpacing:0.5}}>2026-05-17 (Thu)</div>
          {ALPEXA_MARKET.CALENDAR.map((c,i) => (
            <div key={i} style={{display:'flex', alignItems:'center', padding:'12px 14px', borderBottom:'1px solid var(--line)', gap:10}}>
              <span className="mono" style={{fontSize:12, fontWeight:700, color:'var(--ink)', width:42}}>{c.time}</span>
              <span style={{
                fontSize:9.5, fontWeight:800, padding:'2px 5px', borderRadius:3,
                background:'var(--bg-2)', color:'var(--text-2)'
              }}>{c.ccy}</span>
              <div style={{flex:1, fontSize:12, color:'var(--ink)'}}>{c.ttl}</div>
              <div style={{display:'flex', gap:1}}>
                {[1,2,3].map(n => <div key={n} style={{
                  width:6, height:6, borderRadius:1.5,
                  background: n<=c.impact ? (c.impact===3?'var(--sell)':c.impact===2?'var(--warn)':'var(--buy)') : 'var(--line-2)'
                }}/>)}
              </div>
              <div className="mono" style={{fontSize:10.5, color:'var(--text-3)', width:50, textAlign:'right'}}>{c.fcst}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Trading preferences (one-click trading, etc.) — stored in localStorage
const DEFAULT_PREFS = { oneClick: true, biometric: true, currency: 'USD' };

// Multi-currency support — fixed conversion rates relative to USD
// In production, these would come from a live FX feed.
const CURRENCIES = [
  { code:'USD',  symbol:'$',  name:'US Dollar',         rate:1 },
  { code:'EUR',  symbol:'€',  name:'Euro',              rate:0.92 },
  { code:'GBP',  symbol:'£',  name:'British Pound',     rate:0.79 },
  { code:'JPY',  symbol:'¥',  name:'Japanese Yen',      rate:156 },
  { code:'CNY',  symbol:'¥',  name:'Chinese Yuan',      rate:7.25 },
  { code:'KRW',  symbol:'₩',  name:'South Korean Won',  rate:1370 },
  { code:'CHF',  symbol:'Fr', name:'Swiss Franc',        rate:0.91 },
  { code:'AUD',  symbol:'A$', name:'Australian Dollar',  rate:1.52 },
  { code:'CAD',  symbol:'C$', name:'Canadian Dollar',    rate:1.36 },
  { code:'SGD',  symbol:'S$', name:'Singapore Dollar',   rate:1.34 },
  { code:'HKD',  symbol:'HK$',name:'Hong Kong Dollar',   rate:7.82 },
  { code:'USDT', symbol:'₮',  name:'Tether (Stablecoin)',rate:1 },
];
function getCurrency(code) {
  return CURRENCIES.find(c => c.code === code) || CURRENCIES[0];
}
window.CURRENCIES = CURRENCIES;
window.getCurrency = getCurrency;
function getPrefs() {
  try {
    const raw = localStorage.getItem('alpexa.prefs');
    if (raw) return { ...DEFAULT_PREFS, ...JSON.parse(raw) };
  } catch (e) {}
  return { ...DEFAULT_PREFS };
}
function setPref(key, value) {
  const cur = getPrefs();
  cur[key] = value;
  try { localStorage.setItem('alpexa.prefs', JSON.stringify(cur)); } catch (e) {}
  window.dispatchEvent(new CustomEvent('alpexa-prefs-change', { detail: { key, value } }));
}
window.getPrefs = getPrefs;
window.setPref = setPref;

// Leverage settings — stored in localStorage so user can customize
const DEFAULT_LEVERAGE = { FX: 100, INDEX: 20, STOCK: 5, CRYPTO: 5 };
function getLeverageSettings() {
  try {
    const raw = localStorage.getItem('alpexa.leverage');
    if (raw) return { ...DEFAULT_LEVERAGE, ...JSON.parse(raw) };
  } catch (e) {}
  return { ...DEFAULT_LEVERAGE };
}
function setLeverageSettings(settings) {
  try { localStorage.setItem('alpexa.leverage', JSON.stringify(settings)); } catch (e) {}
  window.dispatchEvent(new Event('alpexa-leverage-change'));
}
window.getLeverageSettings = getLeverageSettings;
window.setLeverageSettings = setLeverageSettings;

// ──────────────────────────────────────────────
// ACCOUNT
// ──────────────────────────────────────────────
function Account({ openPositions = 0, onNavigate }) {
  const [sheet, setSheet] = useState(null);
  const [presetMethod, setPresetMethod] = useState(null);
  const [, force] = useState(0);
  // Check if we should auto-open a sheet (e.g. from promo card "Deposit Crypto")
  useEffect(() => {
    try {
      const flag = localStorage.getItem('alpexa.openDeposit');
      if (flag) {
        setSheet('deposit');
        setPresetMethod(flag);
        localStorage.removeItem('alpexa.openDeposit');
      }
    } catch(e) {}
  }, []);
  React.useEffect(() => {
    const handler = () => force(x => x + 1);
    window.addEventListener('alpexa-leverage-change', handler);
    return () => window.removeEventListener('alpexa-leverage-change', handler);
  }, []);
  const lev = getLeverageSettings();
  return (
    <div style={{display:'flex', flexDirection:'column', flex:1, minHeight:0, overflowY:'auto', background:'var(--bg)', position:'relative'}}>
      {/* Account quick actions */}
      <div style={{display:'flex', gap:8, padding:'14px 14px 10px', background:'var(--bg)'}}>
        <ActionBtn icon="south" label="Deposit"  active={sheet==='deposit'}  onClick={()=>setSheet('deposit')}/>
        <ActionBtn icon="north" label="Withdraw" active={sheet==='withdraw'} onClick={()=>setSheet('withdraw')}/>
        <ActionBtn icon="swap_horiz" label="Transfer" active={sheet==='transfer'} onClick={()=>setSheet('transfer')}/>
        <ActionBtn icon="assessment" label="Report" active={sheet==='report'} onClick={()=>setSheet('report')}/>
      </div>

      <Section title="Account">
        <Row label="Name" val="Christian Kang"/>
        <Row label="Email" val="zbnyme@gmail.com"/>
        <Row label="Account #" val="ALX-08471293" mono/>
        <Row label="Server"    val="ALPEXA-Live 04"/>
        <Row label="Leverage" val={`FX 1:${lev.FX} · Stocks 1:${lev.STOCK}`} chev onClick={()=>setSheet('leverage')}/>
        <Row label="Currency"  val={getPrefs().currency || 'USD'} chev onClick={()=>setSheet('currency')}/>
        <Row label="Language"  val={(window.getLanguageLabel ? window.getLanguageLabel(getPrefs().language || 'en') : 'English')} chev onClick={()=>setSheet('language')}/>
      </Section>

      <Section title="Trading">
        <Row label="One-click Trading" toggle={getPrefs().oneClick} onToggle={v=>{setPref('oneClick', v); force(x=>x+1);}}/>
        <Row label="Sound Effects" toggle={!getPrefs().soundMuted} onToggle={v=>{setPref('soundMuted', !v); if (v && window.ALPEXA_SFX) window.ALPEXA_SFX.tick(); force(x=>x+1);}}/>
      </Section>

      <Section title="Preferences">
        <Row label="Price Alerts" val="3 active" chev onClick={()=>setSheet('alerts')}/>
        <Row label="Notifications" chev onClick={()=>setSheet('notif')}/>
        <Row label="Dark Mode" toggle={false}/>
      </Section>

      <Section title="Security">
        <Row label="2-Factor Auth" val="Enabled" chev onClick={()=>setSheet('2fa')}/>
        <Row label="Biometric Login" toggle={true}/>
        <Row label="Active Sessions" chev onClick={()=>setSheet('sessions')}/>
      </Section>

      <Section title="About">
        <Row label="Terms of Use" chev onClick={()=>setSheet('terms')}/>
        <Row label="Support" chev onClick={()=>setSheet('support')}/>
        <Row label="Version"  val="v1.4.2"/>
      </Section>
      <div style={{height:12}}/>

      {sheet && ['deposit','withdraw','transfer','report'].includes(sheet) && <AcctSheet kind={sheet} presetMethod={presetMethod} onNavigate={onNavigate} onClose={()=>{setSheet(null); setPresetMethod(null);}}/>}
      {sheet === 'leverage' && <LeverageSheet openPositions={openPositions} onClose={()=>setSheet(null)}/>}
      {sheet === 'currency' && <CurrencySheet onClose={()=>setSheet(null)}/>}
      {sheet === 'language' && <LanguageSheet onClose={()=>setSheet(null)}/>}
      {sheet && ['alerts','notif','2fa','sessions','terms','support'].includes(sheet) && <SettingSheet kind={sheet} onClose={()=>setSheet(null)}/>}
    </div>
  );
}

// ── Leverage settings sheet ──
function LeverageSheet({ openPositions = 0, onClose }) {
  const locked = openPositions > 0;
  const [lev, setLev] = useState(getLeverageSettings());
  const PRESETS = {
    FX:     [10, 30, 50, 100, 200, 500],
    INDEX:  [5, 10, 20, 50, 100],
    STOCK:  [1, 2, 5, 10, 20],
    CRYPTO: [1, 2, 5, 10, 20],
  };
  const META = {
    FX:     { label:'Forex',    sub:'Major and minor currency pairs', icon:'currency_exchange' },
    INDEX:  { label:'Indices',  sub:'NAS100, SPX500, GER40, etc.',    icon:'show_chart' },
    STOCK:  { label:'Stocks',   sub:'AAPL, TSLA, NVDA, MSFT, etc.',   icon:'business' },
    CRYPTO: { label:'Crypto',   sub:'BTC, ETH and other crypto CFDs', icon:'currency_bitcoin' },
  };
  function save() {
    setLeverageSettings(lev);
    onClose();
  }
  function reset() {
    const def = { ...DEFAULT_LEVERAGE };
    setLev(def);
    setLeverageSettings(def);
  }
  return (
    <div onClick={onClose} style={{
      position:'absolute', inset:0, background:'rgba(10,14,26,0.55)', zIndex:300,
      display:'flex', flexDirection:'column', justifyContent:'flex-end',
    }}>
      <div onClick={e=>e.stopPropagation()} style={{
        background:'var(--surface)', borderTopLeftRadius:16, borderTopRightRadius:16,
        display:'flex', flexDirection:'column', maxHeight:'88%', overflow:'hidden',
        animation:'slideUp 0.22s cubic-bezier(0.2,0.8,0.2,1)'
      }}>
        <div style={{display:'flex', justifyContent:'center', padding:'8px 0 4px'}}>
          <div style={{width:36, height:4, borderRadius:2, background:'var(--line-2)'}}/>
        </div>

        <div style={{padding:'6px 16px 12px', display:'flex', alignItems:'center'}}>
          <div>
            <div style={{fontSize:16, fontWeight:700, color:'var(--ink)'}}>Leverage Settings</div>
            <div style={{fontSize:11.5, color:'var(--text-3)', marginTop:2}}>Adjust max leverage per asset class</div>
          </div>
          <span style={{flex:1}}/>
          <button onClick={onClose} style={{
            width:28, height:28, borderRadius:14, background:'var(--bg-2)',
            display:'flex', alignItems:'center', justifyContent:'center', color:'var(--text-2)'
          }}><Mi name="close" size={14}/></button>
        </div>

        {locked && (
          <div style={{
            margin:'0 16px 10px', background:'var(--sell-tint)', borderRadius:9,
            padding:'10px 12px', display:'flex', alignItems:'flex-start', gap:8,
            fontSize:11.5, color:'var(--sell-2)', lineHeight:1.45, border:'1px solid rgba(229,57,53,0.25)'
          }}>
            <Mi name="lock" size={14}/>
            <span><b>Locked.</b> Close your {openPositions} open {openPositions===1?'position':'positions'} before changing leverage. Changes would affect existing margin requirements.</span>
          </div>
        )}

        <div style={{flex:1, overflowY:'auto', padding:'0 16px 14px'}}>
          {['FX','INDEX','STOCK','CRYPTO'].map(cls => {
            const m = META[cls];
            const presets = PRESETS[cls];
            const cur = lev[cls];
            const marginPct = (100 / cur).toFixed(cur < 10 ? 0 : 1);
            return (
              <div key={cls} style={{
                background:'var(--bg)', borderRadius:11, padding:'12px 14px', marginBottom:8
              }}>
                <div style={{display:'flex', alignItems:'center', gap:10, marginBottom:10}}>
                  <div style={{
                    width:32, height:32, borderRadius:8, background:'var(--surface)',
                    display:'flex', alignItems:'center', justifyContent:'center', color:'var(--acc-2)'
                  }}>
                    <Mi name={m.icon} size={18}/>
                  </div>
                  <div style={{flex:1}}>
                    <div style={{fontSize:13, fontWeight:700, color:'var(--ink)'}}>{m.label}</div>
                    <div style={{fontSize:10.5, color:'var(--text-3)', marginTop:1}}>{m.sub}</div>
                  </div>
                  <div style={{textAlign:'right'}}>
                    <div className="mono" style={{fontSize:15, fontWeight:700, color:'var(--ink)'}}>1:{cur}</div>
                    <div style={{fontSize:9.5, color:'var(--text-3)', marginTop:1}}>{marginPct}% margin</div>
                  </div>
                </div>
                <div style={{display:'flex', gap:4}}>
                  {presets.map(p => (
                    <button key={p} onClick={()=>!locked && setLev({...lev, [cls]: p})} disabled={locked} className="mono" style={{
                      flex:1, padding:'8px 0', borderRadius:7, fontSize:11, fontWeight:700,
                      background: cur === p ? (locked?'var(--muted)':'var(--acc)') : 'var(--surface)',
                      color:    cur === p ? '#fff' : (locked?'var(--text-3)':'var(--text-2)'),
                      border:'1px solid ' + (cur === p ? (locked?'var(--muted)':'var(--acc)') : 'var(--line-2)'),
                      opacity: locked && cur !== p ? 0.5 : 1,
                      cursor: locked ? 'not-allowed' : 'pointer'
                    }}>1:{p}</button>
                  ))}
                </div>
              </div>
            );
          })}

          <div style={{
            background:'var(--acc-3)', borderRadius:9, padding:'10px 12px',
            display:'flex', alignItems:'flex-start', gap:8, fontSize:11.5, color:'var(--acc-2)', lineHeight:1.45
          }}>
            <Mi name="info" size={14}/>
            <span>Higher leverage amplifies both profits and losses. ESMA/FCA regulated brokers cap retail leverage at 1:30 for FX majors, 1:20 for indices, 1:5 for stocks, and 1:2 for crypto.</span>
          </div>
        </div>

        <div style={{padding:'10px 16px 16px', background:'var(--surface)', borderTop:'1px solid var(--line)', display:'flex', gap:8}}>
          <button onClick={()=>!locked && reset()} disabled={locked} style={{
            flex:1, padding:'12px 0', borderRadius:10, fontSize:13, fontWeight:600,
            background:'var(--bg-2)', color: locked?'var(--muted)':'var(--text-2)',
            cursor: locked ? 'not-allowed' : 'pointer', opacity: locked?0.6:1
          }}>Reset to Default</button>
          <button onClick={()=>!locked && save()} disabled={locked} style={{
            flex:1.5, padding:'12px 0', borderRadius:10, fontSize:13, fontWeight:700, color:'#fff',
            background: locked?'var(--muted)':'var(--acc)',
            cursor: locked ? 'not-allowed' : 'pointer'
          }}>{locked ? 'Close positions first' : 'Save Changes'}</button>
        </div>
      </div>
    </div>
  );
}

// ─── Language support ───
const LANGUAGES = [
  { code:'en',    name:'English',          native:'English',   flag:'🇬🇧' },
  { code:'ko',    name:'Korean',           native:'한국어',     flag:'🇰🇷' },
  { code:'ja',    name:'Japanese',         native:'日本語',     flag:'🇯🇵' },
  { code:'zh',    name:'Chinese (Simp.)',  native:'简体中文',   flag:'🇨🇳' },
  { code:'zh-TW', name:'Chinese (Trad.)',  native:'繁體中文',   flag:'🇹🇼' },
  { code:'es',    name:'Spanish',          native:'Español',   flag:'🇪🇸' },
  { code:'pt',    name:'Portuguese (BR)',  native:'Português', flag:'🇧🇷' },
  { code:'fr',    name:'French',           native:'Français',  flag:'🇫🇷' },
  { code:'de',    name:'German',           native:'Deutsch',   flag:'🇩🇪' },
  { code:'it',    name:'Italian',          native:'Italiano',  flag:'🇮🇹' },
  { code:'ru',    name:'Russian',          native:'Русский',   flag:'🇷🇺' },
  { code:'ar',    name:'Arabic',           native:'العربية',   flag:'🇸🇦' },
  { code:'hi',    name:'Hindi',            native:'हिन्दी',     flag:'🇮🇳' },
  { code:'id',    name:'Indonesian',       native:'Bahasa',    flag:'🇮🇩' },
  { code:'vi',    name:'Vietnamese',       native:'Tiếng Việt',flag:'🇻🇳' },
  { code:'th',    name:'Thai',             native:'ไทย',       flag:'🇹🇭' },
  { code:'tr',    name:'Turkish',          native:'Türkçe',    flag:'🇹🇷' },
];
window.LANGUAGES = LANGUAGES;
window.getLanguageLabel = function(code) {
  const l = LANGUAGES.find(x => x.code === code) || LANGUAGES[0];
  return l.flag + ' ' + l.native;
};

function LanguageSheet({ onClose }) {
  const [selected, setSelected] = useState(getPrefs().language || 'en');
  const [search, setSearch] = useState('');
  function save() { setPref('language', selected); onClose(); }
  const filtered = LANGUAGES.filter(l =>
    !search ||
    l.name.toLowerCase().includes(search.toLowerCase()) ||
    l.native.toLowerCase().includes(search.toLowerCase()) ||
    l.code.toLowerCase().includes(search.toLowerCase())
  );
  return (
    <div onClick={onClose} style={{
      position:'absolute', inset:0, background:'rgba(10,14,26,0.55)', zIndex:300,
      display:'flex', flexDirection:'column', justifyContent:'flex-end',
    }}>
      <div onClick={e=>e.stopPropagation()} style={{
        background:'var(--surface)', borderTopLeftRadius:16, borderTopRightRadius:16,
        display:'flex', flexDirection:'column', maxHeight:'88%',
        animation:'slideUp 0.22s cubic-bezier(0.2,0.8,0.2,1)'
      }}>
        <div style={{display:'flex', justifyContent:'center', padding:'8px 0 4px'}}>
          <div style={{width:36, height:4, borderRadius:2, background:'var(--line-2)'}}/>
        </div>
        <div style={{padding:'6px 16px 12px', display:'flex', alignItems:'center'}}>
          <div>
            <div style={{fontSize:16, fontWeight:700, color:'var(--ink)'}}>Language</div>
            <div style={{fontSize:11.5, color:'var(--text-3)', marginTop:2}}>Choose your preferred app language</div>
          </div>
          <span style={{flex:1}}/>
          <button onClick={onClose} style={{
            width:28, height:28, borderRadius:14, background:'var(--bg-2)',
            display:'flex', alignItems:'center', justifyContent:'center', color:'var(--text-2)'
          }}><Mi name="close" size={14}/></button>
        </div>
        <div style={{padding:'0 16px 8px', flexShrink:0}}>
          <div style={{
            display:'flex', alignItems:'center', gap:8, padding:'10px 12px',
            borderRadius:9, background:'var(--bg)'
          }}>
            <Mi name="search" size={16} style={{color:'var(--text-3)'}}/>
            <input value={search} onChange={e=>setSearch(e.target.value)}
              placeholder="Search language…"
              style={{flex:1, fontSize:13, color:'var(--ink)', background:'transparent', outline:'none'}}/>
          </div>
        </div>
        <div style={{flex:1, overflowY:'auto', padding:'4px 8px 12px'}}>
          {filtered.map(l => {
            const sel = selected === l.code;
            return (
              <button key={l.code} onClick={()=>setSelected(l.code)} style={{
                width:'100%', display:'flex', alignItems:'center', gap:12,
                padding:'11px 12px', borderRadius:10, marginBottom:4,
                background: sel ? 'var(--acc-3)' : 'transparent',
                border: sel ? '1.5px solid var(--acc)' : '1.5px solid transparent',
                textAlign:'left'
              }}>
                <span style={{fontSize:22, flexShrink:0, width:30, textAlign:'center'}}>{l.flag}</span>
                <div style={{flex:1}}>
                  <div style={{fontSize:13.5, fontWeight:700, color:'var(--ink)'}}>{l.native}</div>
                  <div style={{fontSize:11, color:'var(--text-3)', marginTop:1}}>
                    {l.name} <span className="mono" style={{color:'var(--muted)'}}> · {l.code}</span>
                  </div>
                </div>
                {sel && <Mi name="check_circle" size={18} fill style={{color:'var(--acc-2)', flexShrink:0}}/>}
              </button>
            );
          })}
          {filtered.length === 0 && (
            <div style={{padding:'30px 16px', textAlign:'center', color:'var(--text-3)', fontSize:12.5}}>
              No matching language
            </div>
          )}
        </div>
        <div style={{padding:'10px 16px 16px', background:'var(--surface)', borderTop:'1px solid var(--line)'}}>
          <button onClick={save} style={{
            width:'100%', padding:'13px 0', borderRadius:10, fontSize:14, fontWeight:700, color:'#fff',
            background:'var(--acc)'
          }}>
            Use {(LANGUAGES.find(l => l.code === selected) || {}).native || selected}
          </button>
          <div style={{fontSize:10.5, color:'var(--text-3)', textAlign:'center', marginTop:8, lineHeight:1.4}}>
            Some content (market news, instrument descriptions) may remain in English.
          </div>
        </div>
      </div>
    </div>
  );
}

function CurrencySheet({ onClose }) {
  const [selected, setSelected] = useState(getPrefs().currency || 'USD');
  const [search, setSearch] = useState('');
  function save() { setPref('currency', selected); onClose(); }
  const filtered = CURRENCIES.filter(c =>
    !search ||
    c.code.toLowerCase().includes(search.toLowerCase()) ||
    c.name.toLowerCase().includes(search.toLowerCase())
  );
  return (
    <div onClick={onClose} style={{
      position:'absolute', inset:0, background:'rgba(10,14,26,0.55)', zIndex:300,
      display:'flex', flexDirection:'column', justifyContent:'flex-end',
    }}>
      <div onClick={e=>e.stopPropagation()} style={{
        background:'var(--surface)', borderTopLeftRadius:16, borderTopRightRadius:16,
        display:'flex', flexDirection:'column', maxHeight:'88%',
        animation:'slideUp 0.22s cubic-bezier(0.2,0.8,0.2,1)'
      }}>
        <div style={{display:'flex', justifyContent:'center', padding:'8px 0 4px'}}>
          <div style={{width:36, height:4, borderRadius:2, background:'var(--line-2)'}}/>
        </div>
        <div style={{padding:'6px 16px 12px', display:'flex', alignItems:'center'}}>
          <div>
            <div style={{fontSize:16, fontWeight:700, color:'var(--ink)'}}>Account Currency</div>
            <div style={{fontSize:11.5, color:'var(--text-3)', marginTop:2}}>Display balances and P/L in your preferred currency</div>
          </div>
          <span style={{flex:1}}/>
          <button onClick={onClose} style={{
            width:28, height:28, borderRadius:14, background:'var(--bg-2)',
            display:'flex', alignItems:'center', justifyContent:'center', color:'var(--text-2)'
          }}><Mi name="close" size={14}/></button>
        </div>
        <div style={{padding:'0 16px 8px', flexShrink:0}}>
          <div style={{display:'flex', alignItems:'center', gap:8, padding:'10px 12px', borderRadius:9, background:'var(--bg)'}}>
            <Mi name="search" size={16} style={{color:'var(--text-3)'}}/>
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search currency…"
              style={{flex:1, fontSize:13, color:'var(--ink)', background:'transparent', outline:'none'}}/>
          </div>
        </div>
        <div style={{flex:1, overflowY:'auto', padding:'4px 8px 12px'}}>
          {filtered.length === 0 && (
            <div style={{padding:'30px 16px', textAlign:'center', color:'var(--text-3)', fontSize:12.5}}>No matching currency</div>
          )}
          {filtered.map(c => {
            const sel = selected === c.code;
            return (
              <button key={c.code} onClick={()=>setSelected(c.code)} style={{
                width:'100%', display:'flex', alignItems:'center', gap:12,
                padding:'12px 12px', borderRadius:10, marginBottom:4,
                background: sel ? 'var(--acc-3)' : 'transparent',
                border: sel ? '1.5px solid var(--acc)' : '1.5px solid transparent',
                textAlign:'left'
              }}>
                <div className="mono" style={{
                  width:38, height:38, borderRadius:9, flexShrink:0,
                  background: sel ? 'var(--acc)' : 'var(--bg-2)',
                  color: sel ? '#fff' : 'var(--ink)',
                  display:'flex', alignItems:'center', justifyContent:'center',
                  fontSize:15, fontWeight:700
                }}>{c.symbol}</div>
                <div style={{flex:1}}>
                  <div style={{display:'flex', alignItems:'center', gap:6}}>
                    <span className="mono" style={{fontSize:13, fontWeight:700, color:'var(--ink)', letterSpacing:0.3}}>{c.code}</span>
                    {c.code === 'USDT' && <span style={{
                      fontSize:8, fontWeight:800, padding:'1px 4px', borderRadius:3,
                      background:'#E0F2F1', color:'#00796B', letterSpacing:0.3
                    }}>STABLECOIN</span>}
                  </div>
                  <div style={{fontSize:11, color:'var(--text-3)', marginTop:2}}>{c.name}</div>
                </div>
                <div className="mono" style={{fontSize:10.5, color:'var(--text-3)', textAlign:'right'}}>
                  {c.code !== 'USD' && <>1 USD<br/><span style={{color:'var(--text-2)', fontWeight:600}}>= {c.rate} {c.code}</span></>}
                  {c.code === 'USD' && <span style={{color:'var(--acc-2)', fontWeight:700}}>BASE</span>}
                </div>
                {sel && <Mi name="check_circle" size={18} fill style={{color:'var(--acc-2)', flexShrink:0}}/>}
              </button>
            );
          })}
        </div>
        <div style={{padding:'10px 16px 16px', background:'var(--surface)', borderTop:'1px solid var(--line)'}}>
          <button onClick={save} style={{
            width:'100%', padding:'13px 0', borderRadius:10, fontSize:14, fontWeight:700, color:'#fff',
            background:'var(--acc)'
          }}>Use {selected}</button>
          <div style={{fontSize:10.5, color:'var(--text-3)', textAlign:'center', marginTop:8, lineHeight:1.4}}>
            Conversion rates updated daily. Trade execution remains in instrument currency.
          </div>
        </div>
      </div>
    </div>
  );
}

function SettingSheet({ kind, onClose }) {
  const titles = {
    alerts:   { title:'Price Alerts',     sub:'Get notified when prices hit your targets' },
    notif:    { title:'Notifications',    sub:'Manage push and email notifications' },
    '2fa':    { title:'Two-Factor Auth',  sub:'Enabled · Authenticator app' },
    sessions: { title:'Active Sessions',  sub:'Devices currently signed in' },
    terms:    { title:'Terms of Use',     sub:'Last updated May 10, 2026' },
    support:  { title:'Support',          sub:'Get help from our team' },
  };
  const t = titles[kind] || { title:'Settings', sub:'' };
  return (
    <div onClick={onClose} style={{
      position:'absolute', inset:0, background:'rgba(10,14,26,0.55)', zIndex:300,
      display:'flex', flexDirection:'column', justifyContent:'flex-end',
    }}>
      <div onClick={e=>e.stopPropagation()} style={{
        background:'var(--surface)', borderTopLeftRadius:16, borderTopRightRadius:16,
        display:'flex', flexDirection:'column', maxHeight:'88%', overflow:'hidden',
        animation:'slideUp 0.22s cubic-bezier(0.2,0.8,0.2,1)'
      }}>
        <div style={{display:'flex', justifyContent:'center', padding:'8px 0 4px'}}>
          <div style={{width:36, height:4, borderRadius:2, background:'var(--line-2)'}}/>
        </div>
        <div style={{padding:'6px 16px 12px', display:'flex', alignItems:'center'}}>
          <div>
            <div style={{fontSize:16, fontWeight:700, color:'var(--ink)'}}>{t.title}</div>
            <div style={{fontSize:11.5, color:'var(--text-3)', marginTop:2}}>{t.sub}</div>
          </div>
          <span style={{flex:1}}/>
          <button onClick={onClose} style={{
            width:28, height:28, borderRadius:14, background:'var(--bg-2)',
            display:'flex', alignItems:'center', justifyContent:'center', color:'var(--text-2)'
          }}><Mi name="close" size={14}/></button>
        </div>
        {kind === 'alerts'   && <PriceAlertsPanel/>}
        {kind === 'notif'    && <NotificationsPanel/>}
        {kind === '2fa'      && <TwoFactorPanel/>}
        {kind === 'sessions' && <SessionsPanel/>}
        {kind === 'terms'    && <TermsPanel/>}
        {kind === 'support'  && <SupportPanel/>}
      </div>
    </div>
  );
}

// ── Alerts storage ──
function getAlerts() {
  try { return JSON.parse(localStorage.getItem('alpexa.alerts') || '[]'); } catch (e) { return []; }
}
function saveAlerts(a) { try { localStorage.setItem('alpexa.alerts', JSON.stringify(a)); } catch (e) {} }

function PriceAlertsPanel() {
  const [alerts, setAlerts] = useState(getAlerts());
  const [adding, setAdding] = useState(false);
  const [sym, setSym] = useState('EURUSD');
  const [side, setSide] = useState('above');
  const [px, setPx] = useState('');

  function add() {
    if (!px || isNaN(parseFloat(px))) return;
    const next = [...alerts, { id: Date.now(), sym, side, px: parseFloat(px), active: true }];
    setAlerts(next); saveAlerts(next);
    setAdding(false); setPx('');
  }
  function toggle(id) {
    const next = alerts.map(a => a.id === id ? { ...a, active: !a.active } : a);
    setAlerts(next); saveAlerts(next);
  }
  function remove(id) {
    const next = alerts.filter(a => a.id !== id);
    setAlerts(next); saveAlerts(next);
  }

  const symInfo = ALPEXA_MARKET.SYMBOLS.find(s => s.sym === sym);
  const digits = symInfo ? symInfo.digits : 5;

  return (
    <div style={{flex:1, overflowY:'auto', padding:'4px 16px 18px'}}>
      <button onClick={()=>setAdding(!adding)} style={{
        width:'100%', padding:'12px 0', borderRadius:10, marginBottom:14,
        background: adding ? 'var(--bg-2)' : 'var(--acc)', color: adding ? 'var(--text-2)' : '#fff',
        fontSize:13, fontWeight:700, display:'flex', alignItems:'center', justifyContent:'center', gap:6
      }}>
        <Mi name={adding ? 'close' : 'add_alert'} size={16}/>
        {adding ? 'Cancel' : 'Create New Alert'}
      </button>

      {adding && (
        <div style={{background:'var(--bg)', borderRadius:11, padding:'12px 14px', marginBottom:14}}>
          <div style={{fontSize:10, fontWeight:700, color:'var(--text-3)', letterSpacing:0.5, marginBottom:6}}>SYMBOL</div>
          <select value={sym} onChange={e=>setSym(e.target.value)} className="mono" style={{
            width:'100%', padding:'9px 10px', borderRadius:8, border:'1px solid var(--line-2)',
            background:'var(--surface)', fontSize:13, fontWeight:600, color:'var(--ink)', marginBottom:12,
            outline:'none'
          }}>
            {ALPEXA_MARKET.SYMBOLS.map(s => <option key={s.sym} value={s.sym}>{s.sym} — {s.name}</option>)}
          </select>

          <div style={{fontSize:10, fontWeight:700, color:'var(--text-3)', letterSpacing:0.5, marginBottom:6}}>CONDITION</div>
          <div style={{display:'flex', gap:6, marginBottom:12}}>
            <button onClick={()=>setSide('above')} style={{
              flex:1, padding:'10px 0', borderRadius:8, fontSize:12, fontWeight:700,
              background: side==='above' ? 'var(--buy-tint)' : 'var(--surface)',
              color:    side==='above' ? 'var(--buy-2)' : 'var(--text-2)',
              border:'1px solid ' + (side==='above' ? 'var(--buy)' : 'var(--line-2)'),
              display:'flex', alignItems:'center', justifyContent:'center', gap:4
            }}><Mi name="arrow_upward" size={14}/>Price rises above</button>
            <button onClick={()=>setSide('below')} style={{
              flex:1, padding:'10px 0', borderRadius:8, fontSize:12, fontWeight:700,
              background: side==='below' ? 'var(--sell-tint)' : 'var(--surface)',
              color:    side==='below' ? 'var(--sell-2)' : 'var(--text-2)',
              border:'1px solid ' + (side==='below' ? 'var(--sell)' : 'var(--line-2)'),
              display:'flex', alignItems:'center', justifyContent:'center', gap:4
            }}><Mi name="arrow_downward" size={14}/>Price falls below</button>
          </div>

          <div style={{fontSize:10, fontWeight:700, color:'var(--text-3)', letterSpacing:0.5, marginBottom:6}}>TARGET PRICE</div>
          <input value={px} onChange={e=>setPx(e.target.value)} type="number" step="any"
            placeholder={`e.g. ${(1.0850).toFixed(digits)}`} className="mono"
            style={{width:'100%', padding:'10px 12px', borderRadius:8, border:'1.5px solid var(--line-2)',
              background:'var(--surface)', fontSize:15, fontWeight:600, color:'var(--ink)', outline:'none', marginBottom:12}}/>

          <button onClick={add} disabled={!px} style={{
            width:'100%', padding:'12px 0', borderRadius:9, fontSize:13, fontWeight:700, color:'#fff',
            background: px ? 'var(--acc)' : 'var(--muted)',
            cursor: px ? 'pointer' : 'not-allowed'
          }}>Create Alert</button>
        </div>
      )}

      <div style={{fontSize:10, fontWeight:700, color:'var(--text-3)', letterSpacing:0.5, marginBottom:6}}>
        ACTIVE ALERTS ({alerts.filter(a => a.active).length})
      </div>
      {alerts.length === 0 && (
        <div style={{padding:'40px 16px', textAlign:'center'}}>
          <Mi name="notifications_off" size={36} style={{color:'var(--muted)', display:'block', margin:'0 auto 8px'}}/>
          <div style={{fontSize:13, fontWeight:600, color:'var(--text-2)'}}>No price alerts yet</div>
          <div style={{fontSize:11.5, marginTop:4, color:'var(--text-3)'}}>Tap "Create New Alert" to set one up</div>
        </div>
      )}
      {alerts.map(a => {
        const info = ALPEXA_MARKET.SYMBOLS.find(s => s.sym === a.sym);
        const d = info ? info.digits : 5;
        return (
          <div key={a.id} style={{
            display:'flex', alignItems:'center', gap:10, padding:'11px 12px',
            background:'var(--surface)', border:'1px solid var(--line)', borderRadius:9,
            marginBottom:5, opacity: a.active ? 1 : 0.55
          }}>
            <div style={{
              width:32, height:32, borderRadius:8, flexShrink:0,
              background: a.side==='above'?'var(--buy-tint)':'var(--sell-tint)',
              color:    a.side==='above'?'var(--buy-2)':'var(--sell-2)',
              display:'flex', alignItems:'center', justifyContent:'center'
            }}>
              <Mi name={a.side==='above'?'arrow_upward':'arrow_downward'} size={16} weight={600}/>
            </div>
            <div style={{flex:1, minWidth:0}}>
              <div style={{display:'flex', alignItems:'center', gap:6}}>
                <span style={{fontSize:13, fontWeight:700, color:'var(--ink)'}}>{a.sym}</span>
                <span style={{fontSize:10, color:'var(--text-3)'}}>{a.side==='above'?'≥':'≤'}</span>
                <span className="mono" style={{fontSize:13, fontWeight:600, color:'var(--ink)'}}>{Number(a.px).toFixed(d)}</span>
              </div>
              <div style={{fontSize:10, color:'var(--text-3)', marginTop:1}}>
                {info ? info.name : ''} · {a.active ? 'Monitoring' : 'Paused'}
              </div>
            </div>
            <button onClick={()=>toggle(a.id)} style={{
              width:36, height:22, borderRadius:11, position:'relative',
              background: a.active ? 'var(--acc-2)' : 'var(--muted)',
              transition:'background 0.2s'
            }}>
              <div style={{
                width:18, height:18, background:'#fff', borderRadius:9,
                position:'absolute', top:2, left: a.active?16:2,
                boxShadow:'0 1px 3px rgba(0,0,0,0.2)', transition:'left 0.2s'
              }}/>
            </button>
            <button onClick={()=>remove(a.id)} style={{
              width:26, height:26, borderRadius:13, color:'var(--text-3)',
              display:'flex', alignItems:'center', justifyContent:'center'
            }}><Mi name="delete" size={16}/></button>
          </div>
        );
      })}
    </div>
  );
}

// ── Notifications ──
function getNotifPrefs() {
  try { return { ...DEFAULT_NOTIF, ...JSON.parse(localStorage.getItem('alpexa.notif') || '{}') }; }
  catch (e) { return { ...DEFAULT_NOTIF }; }
}
function saveNotifPrefs(p) { try { localStorage.setItem('alpexa.notif', JSON.stringify(p)); } catch(e) {} }
const DEFAULT_NOTIF = {
  orderFilled: { push:true, email:true },
  pendingTriggered: { push:true, email:false },
  slTpHit: { push:true, email:true },
  priceAlert: { push:true, email:false },
  marginCall: { push:true, email:true },
  newsHigh: { push:true, email:false },
  newsMedium: { push:false, email:false },
  deposit: { push:true, email:true },
  withdrawal: { push:true, email:true },
  login: { push:false, email:true },
  weeklySummary: { push:false, email:true },
};
const NOTIF_LABELS = [
  { group:'Trading', items: [
    { key:'orderFilled',      label:'Order Filled',          sub:'Market orders executed', icon:'task_alt' },
    { key:'pendingTriggered', label:'Pending Order Triggered',sub:'Limit/Stop activated', icon:'bolt' },
    { key:'slTpHit',          label:'SL / TP Hit',           sub:'Position auto-closed',  icon:'flag' },
    { key:'marginCall',       label:'Margin Call',           sub:'Account at risk',       icon:'warning' },
  ]},
  { group:'Market', items: [
    { key:'priceAlert',       label:'Price Alerts',          sub:'Custom price targets',  icon:'notifications_active' },
    { key:'newsHigh',         label:'High-Impact News',      sub:'FOMC, NFP, CPI, etc.',  icon:'campaign' },
    { key:'newsMedium',       label:'Medium-Impact News',    sub:'GDP, PMI, retail sales',icon:'feed' },
  ]},
  { group:'Account', items: [
    { key:'deposit',          label:'Deposits',              sub:'Funds added',           icon:'south' },
    { key:'withdrawal',       label:'Withdrawals',           sub:'Funds removed',         icon:'north' },
    { key:'login',            label:'New Sign-in',           sub:'Security alerts',       icon:'login' },
    { key:'weeklySummary',    label:'Weekly Summary',        sub:'P/L digest every Mon',  icon:'mail' },
  ]},
];

function NotificationsPanel() {
  const [prefs, setPrefsState] = useState(getNotifPrefs());
  function update(key, ch, val) {
    const next = { ...prefs, [key]: { ...prefs[key], [ch]: val } };
    setPrefsState(next); saveNotifPrefs(next);
  }
  function bulk(channel, val) {
    const next = { ...prefs };
    Object.keys(next).forEach(k => { next[k] = { ...next[k], [channel]: val }; });
    setPrefsState(next); saveNotifPrefs(next);
  }
  const totalPush = Object.values(prefs).filter(p => p.push).length;
  const totalEmail = Object.values(prefs).filter(p => p.email).length;
  return (
    <div style={{flex:1, overflowY:'auto', padding:'4px 16px 18px'}}>
      {/* Channel bulk toggles */}
      <div style={{display:'flex', gap:8, marginBottom:14}}>
        <div style={{
          flex:1, padding:'10px 12px', borderRadius:9, background:'var(--bg)',
          display:'flex', alignItems:'center', gap:8
        }}>
          <Mi name="notifications" size={18} style={{color:'var(--acc-2)'}}/>
          <div style={{flex:1}}>
            <div style={{fontSize:11.5, fontWeight:700, color:'var(--ink)'}}>Push</div>
            <div style={{fontSize:9.5, color:'var(--text-3)'}}>{totalPush}/{Object.keys(prefs).length} on</div>
          </div>
          <button onClick={()=>bulk('push', totalPush < Object.keys(prefs).length)} style={{
            fontSize:10.5, fontWeight:700, color:'var(--acc-2)', padding:'4px 8px',
            borderRadius:6, background:'var(--acc-3)'
          }}>{totalPush === Object.keys(prefs).length ? 'OFF' : 'ALL'}</button>
        </div>
        <div style={{
          flex:1, padding:'10px 12px', borderRadius:9, background:'var(--bg)',
          display:'flex', alignItems:'center', gap:8
        }}>
          <Mi name="mail" size={18} style={{color:'var(--acc-2)'}}/>
          <div style={{flex:1}}>
            <div style={{fontSize:11.5, fontWeight:700, color:'var(--ink)'}}>Email</div>
            <div style={{fontSize:9.5, color:'var(--text-3)'}}>{totalEmail}/{Object.keys(prefs).length} on</div>
          </div>
          <button onClick={()=>bulk('email', totalEmail < Object.keys(prefs).length)} style={{
            fontSize:10.5, fontWeight:700, color:'var(--acc-2)', padding:'4px 8px',
            borderRadius:6, background:'var(--acc-3)'
          }}>{totalEmail === Object.keys(prefs).length ? 'OFF' : 'ALL'}</button>
        </div>
      </div>

      {NOTIF_LABELS.map(group => (
        <div key={group.group} style={{marginBottom:14}}>
          <div style={{fontSize:10, fontWeight:700, color:'var(--text-3)', letterSpacing:0.5, marginBottom:6, padding:'0 2px'}}>
            {group.group.toUpperCase()}
          </div>
          <div style={{background:'var(--surface)', border:'1px solid var(--line)', borderRadius:10, overflow:'hidden'}}>
            {/* column headers */}
            <div style={{display:'flex', alignItems:'center', padding:'7px 12px', background:'var(--bg)', fontSize:9, fontWeight:700, color:'var(--text-3)', letterSpacing:0.6}}>
              <span style={{flex:1}}/>
              <span style={{width:44, textAlign:'center'}}>PUSH</span>
              <span style={{width:44, textAlign:'center'}}>EMAIL</span>
            </div>
            {group.items.map(item => (
              <div key={item.key} style={{
                display:'flex', alignItems:'center', padding:'10px 12px',
                borderTop:'1px solid var(--line)'
              }}>
                <div style={{
                  width:30, height:30, borderRadius:7, flexShrink:0,
                  background:'var(--bg-2)', color:'var(--text-2)',
                  display:'flex', alignItems:'center', justifyContent:'center', marginRight:10
                }}>
                  <Mi name={item.icon} size={16}/>
                </div>
                <div style={{flex:1, minWidth:0}}>
                  <div style={{fontSize:12.5, fontWeight:600, color:'var(--ink)'}}>{item.label}</div>
                  <div style={{fontSize:10, color:'var(--text-3)', marginTop:1}}>{item.sub}</div>
                </div>
                <NotifCheck on={prefs[item.key].push} onChange={v=>update(item.key,'push',v)}/>
                <NotifCheck on={prefs[item.key].email} onChange={v=>update(item.key,'email',v)}/>
              </div>
            ))}
          </div>
        </div>
      ))}

      <div style={{
        background:'var(--acc-3)', borderRadius:9, padding:'10px 12px', marginTop:6,
        display:'flex', alignItems:'flex-start', gap:8, fontSize:11.5, color:'var(--acc-2)', lineHeight:1.4
      }}>
        <Mi name="info" size={14}/>
        <span>Notifications are sent to your registered email (zbnyme@gmail.com) and registered device.</span>
      </div>
    </div>
  );
}
function NotifCheck({ on, onChange }) {
  return (
    <button onClick={()=>onChange(!on)} style={{
      width:44, display:'flex', justifyContent:'center'
    }}>
      <div style={{
        width:20, height:20, borderRadius:5,
        background: on ? 'var(--acc)' : 'transparent',
        border:'2px solid ' + (on ? 'var(--acc)' : 'var(--muted)'),
        display:'flex', alignItems:'center', justifyContent:'center'
      }}>
        {on && <Mi name="check" size={12} style={{color:'#fff'}}/>}
      </div>
    </button>
  );
}

// ── 2FA / Sessions / Terms / Support — lighter implementations ──
function TwoFactorPanel() {
  const [method, setMethod] = useState('app');
  return (
    <div style={{flex:1, overflowY:'auto', padding:'4px 16px 18px'}}>
      <div style={{
        background:'var(--buy-tint)', borderRadius:10, padding:'12px 14px', marginBottom:14,
        display:'flex', alignItems:'center', gap:10
      }}>
        <Mi name="verified_user" size={20} style={{color:'var(--buy-2)'}}/>
        <div style={{flex:1}}>
          <div style={{fontSize:12.5, fontWeight:700, color:'var(--buy-2)'}}>2FA is Enabled</div>
          <div style={{fontSize:10.5, color:'var(--buy-2)', opacity:0.85, marginTop:1}}>Authenticator app · Connected May 12</div>
        </div>
      </div>

      <div style={{fontSize:10, fontWeight:700, color:'var(--text-3)', letterSpacing:0.5, marginBottom:6}}>METHOD</div>
      {[
        { v:'app',   icon:'phonelink_lock', label:'Authenticator App',  sub:'Google / Authy / 1Password' },
        { v:'sms',   icon:'sms',            label:'SMS Code',           sub:'+82 10-•••• 8512' },
        { v:'email', icon:'mail',           label:'Email Code',         sub:'zbnyme@gmail.com' },
      ].map(o => (
        <button key={o.v} onClick={()=>setMethod(o.v)} style={{
          width:'100%', display:'flex', alignItems:'center', gap:12, padding:'12px',
          background: method===o.v?'var(--acc-3)':'var(--bg-2)',
          border:'1.5px solid ' + (method===o.v?'var(--acc)':'transparent'),
          borderRadius:10, marginBottom:6, textAlign:'left'
        }}>
          <div style={{
            width:34, height:34, borderRadius:8, flexShrink:0,
            background: method===o.v?'var(--acc)':'var(--surface)',
            color:    method===o.v?'var(--ink-fg)' : 'var(--text-2)',
            display:'flex', alignItems:'center', justifyContent:'center'
          }}><Mi name={o.icon} size={18}/></div>
          <div style={{flex:1}}>
            <div style={{fontSize:13, fontWeight:700, color:'var(--ink)'}}>{o.label}</div>
            <div style={{fontSize:10.5, color:'var(--text-3)', marginTop:1}}>{o.sub}</div>
          </div>
          {method===o.v && <Mi name="check_circle" size={18} fill style={{color:'var(--acc-2)'}}/>}
        </button>
      ))}
      <button style={{
        width:'100%', padding:'11px 0', borderRadius:9, marginTop:10,
        background:'var(--bg-2)', color:'var(--text-2)', fontSize:12, fontWeight:600,
        display:'flex', alignItems:'center', justifyContent:'center', gap:6
      }}>
        <Mi name="refresh" size={14}/>Regenerate backup codes
      </button>
      <button style={{
        width:'100%', padding:'11px 0', borderRadius:9, marginTop:6,
        background:'var(--sell-tint)', color:'var(--sell-2)', fontSize:12, fontWeight:700,
        display:'flex', alignItems:'center', justifyContent:'center', gap:6
      }}>
        <Mi name="cancel" size={14}/>Disable 2FA
      </button>
    </div>
  );
}

function SessionsPanel() {
  const sessions = [
    { id:1, device:'iPhone 15 Pro', os:'iOS 18.4', loc:'Seoul, KR', ip:'175.223.•••.42', current:true,  time:'Active now' },
    { id:2, device:'MacBook Pro',   os:'macOS 14.5', loc:'Seoul, KR', ip:'175.223.•••.42', current:false, time:'2 hours ago' },
    { id:3, device:'Chrome',        os:'Windows 11', loc:'Tokyo, JP', ip:'126.108.•••.18', current:false, time:'Yesterday, 14:32' },
  ];
  return (
    <div style={{flex:1, overflowY:'auto', padding:'4px 16px 18px'}}>
      {sessions.map(s => (
        <div key={s.id} style={{
          display:'flex', alignItems:'center', gap:12, padding:'12px',
          background:'var(--surface)', border:'1px solid ' + (s.current?'var(--acc)':'var(--line)'),
          borderRadius:10, marginBottom:6
        }}>
          <div style={{
            width:36, height:36, borderRadius:8, flexShrink:0,
            background: s.current?'var(--acc-3)':'var(--bg-2)',
            color:    s.current?'var(--acc-2)':'var(--text-2)',
            display:'flex', alignItems:'center', justifyContent:'center'
          }}>
            <Mi name={s.device.includes('iPhone')?'phone_iphone':s.device.includes('Mac')||s.device.includes('Book')?'laptop_mac':'desktop_windows'} size={18}/>
          </div>
          <div style={{flex:1, minWidth:0}}>
            <div style={{display:'flex', alignItems:'center', gap:6}}>
              <span style={{fontSize:13, fontWeight:700, color:'var(--ink)'}}>{s.device}</span>
              {s.current && <span style={{
                fontSize:8.5, padding:'1px 5px', borderRadius:3, fontWeight:800, letterSpacing:0.3,
                background:'var(--buy-tint)', color:'var(--buy-2)'
              }}>THIS DEVICE</span>}
            </div>
            <div style={{fontSize:10.5, color:'var(--text-3)', marginTop:2}}>
              {s.os} · {s.loc}
            </div>
            <div className="mono" style={{fontSize:9.5, color:'var(--text-3)', marginTop:1}}>
              {s.ip} · {s.time}
            </div>
          </div>
          {!s.current && (
            <button style={{
              width:28, height:28, borderRadius:14, background:'var(--sell-tint)',
              display:'flex', alignItems:'center', justifyContent:'center', color:'var(--sell-2)'
            }}><Mi name="logout" size={16}/></button>
          )}
        </div>
      ))}
      <button style={{
        width:'100%', padding:'12px 0', borderRadius:10, marginTop:10,
        background:'var(--sell-tint)', color:'var(--sell-2)', fontSize:13, fontWeight:700,
        display:'flex', alignItems:'center', justifyContent:'center', gap:6
      }}>
        <Mi name="logout" size={16}/>Sign out of all other devices
      </button>
    </div>
  );
}

function TermsPanel() {
  return (
    <div style={{flex:1, overflowY:'auto', padding:'4px 16px 18px', fontSize:12, color:'var(--text-2)', lineHeight:1.6}}>
      <p style={{fontWeight:700, color:'var(--ink)', marginBottom:8}}>1. Risk Disclosure</p>
      <p style={{marginBottom:14}}>Trading leveraged products carries significant risk and may result in loss of capital exceeding deposits. By using this platform you acknowledge you understand these risks.</p>
      <p style={{fontWeight:700, color:'var(--ink)', marginBottom:8}}>2. Account Eligibility</p>
      <p style={{marginBottom:14}}>You must be at least 18 years old and a resident of an eligible jurisdiction. Identity verification (KYC) is required before live trading.</p>
      <p style={{fontWeight:700, color:'var(--ink)', marginBottom:8}}>3. Order Execution</p>
      <p style={{marginBottom:14}}>Orders are filled at the best available market price. Slippage may occur during high volatility periods. ALPEXA is not responsible for losses arising from price gaps or feed delays.</p>
      <p style={{fontWeight:700, color:'var(--ink)', marginBottom:8}}>4. Funds Safety</p>
      <p style={{marginBottom:14}}>Client funds are held in segregated accounts at tier-1 banks. ALPEXA SUISSE is regulated by FINMA (Swiss Financial Market Supervisory Authority).</p>
      <p style={{fontWeight:700, color:'var(--ink)', marginBottom:8}}>5. Privacy</p>
      <p style={{marginBottom:14}}>Your personal data is processed in accordance with our Privacy Policy and applicable laws (GDPR, Swiss FADP). Trading data is encrypted at rest and in transit.</p>
      <p style={{fontSize:10.5, color:'var(--text-3)', marginTop:12, padding:'10px 12px', background:'var(--bg)', borderRadius:8}}>
        Last revised: May 10, 2026 · Full document available at <span style={{color:'var(--acc-2)', textDecoration:'underline'}}>alpexa.com/terms</span>
      </p>
    </div>
  );
}

function SupportPanel() {
  const [topic, setTopic] = useState('');
  const [msg, setMsg] = useState('');
  return (
    <div style={{flex:1, overflowY:'auto', padding:'4px 16px 18px'}}>
      <div style={{
        display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:14
      }}>
        {[
          { icon:'forum', label:'Live Chat',    sub:'Avg 2 min wait' },
          { icon:'call',  label:'Phone',        sub:'+41 22 555 9900' },
          { icon:'mail',  label:'Email',        sub:'support@alpexa.com' },
          { icon:'help',  label:'Help Center',  sub:'Browse articles' },
        ].map(o => (
          <button key={o.label} style={{
            padding:'14px 12px', borderRadius:10, background:'var(--bg)',
            border:'1px solid var(--line)', display:'flex', flexDirection:'column',
            alignItems:'flex-start', gap:4, textAlign:'left'
          }}>
            <div style={{
              width:30, height:30, borderRadius:7, background:'var(--acc-3)', color:'var(--acc-2)',
              display:'flex', alignItems:'center', justifyContent:'center'
            }}><Mi name={o.icon} size={16}/></div>
            <div style={{fontSize:12.5, fontWeight:700, color:'var(--ink)', marginTop:4}}>{o.label}</div>
            <div style={{fontSize:10, color:'var(--text-3)'}}>{o.sub}</div>
          </button>
        ))}
      </div>

      <div style={{fontSize:10, fontWeight:700, color:'var(--text-3)', letterSpacing:0.5, marginBottom:6}}>SUBMIT A TICKET</div>
      <select value={topic} onChange={e=>setTopic(e.target.value)} style={{
        width:'100%', padding:'10px 12px', borderRadius:8, border:'1px solid var(--line-2)',
        background:'var(--surface)', fontSize:13, color:'var(--ink)', marginBottom:10, outline:'none'
      }}>
        <option value="">Select a topic…</option>
        <option value="deposit">Deposit / Withdrawal</option>
        <option value="trade">Trading / Order Execution</option>
        <option value="account">Account / Verification</option>
        <option value="tech">Technical Issue</option>
        <option value="other">Other</option>
      </select>
      <textarea value={msg} onChange={e=>setMsg(e.target.value)} placeholder="Describe your issue…" style={{
        width:'100%', padding:'10px 12px', borderRadius:8, border:'1px solid var(--line-2)',
        background:'var(--surface)', fontSize:13, color:'var(--ink)', minHeight:90, outline:'none',
        resize:'vertical', fontFamily:'inherit', marginBottom:10
      }}/>
      <button disabled={!topic || !msg} style={{
        width:'100%', padding:'12px 0', borderRadius:10, fontSize:13, fontWeight:700, color:'#fff',
        background: (topic && msg) ? 'var(--acc)' : 'var(--muted)',
        display:'flex', alignItems:'center', justifyContent:'center', gap:6,
        cursor: (topic && msg) ? 'pointer' : 'not-allowed'
      }}>
        <Mi name="send" size={14}/>Submit Ticket
      </button>
      <div style={{fontSize:10.5, color:'var(--text-3)', textAlign:'center', marginTop:8}}>
        Typical response time: 4 hours · 24/7 support
      </div>
    </div>
  );
}

function AcctSheet({ kind, presetMethod, onNavigate, onClose }) {
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState(presetMethod || (kind === 'deposit' ? 'card' : kind === 'withdraw' ? 'bank' : 'live'));
  const [destAcct, setDestAcct] = useState('stocks');
  const [reportType, setReportType] = useState('monthly');
  const [reportFormat, setReportFormat] = useState('pdf');
  const [step, setStep] = useState('form'); // 'form' | 'processing' | 'done'

  const TITLES = {
    deposit:  { title:'Deposit Funds',    sub:'Funds available immediately for trading' },
    withdraw: { title:'Withdraw Funds',   sub:'Processed within 1–3 business days' },
    transfer: { title:'Transfer Between Accounts', sub:'Instant, no fees' },
    report:   { title:'Account Report',   sub:'Statement of your trading activity' },
  };
  const t = TITLES[kind];

  function submit() {
    if (kind !== 'report' && !amount) return;
    setStep('processing');
    if (kind === 'deposit' || kind === 'withdraw' || kind === 'transfer') {
      try {
        var id = 'fx-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
        var amt = parseFloat(amount) || 0;
        window.AlpexaSync && AlpexaSync.pushRequest({
          id, type: kind, server: 'FX', amount: amt, asset: 'USD', network: method, address: '',
          from: kind === 'transfer' ? 'FX' : '', to: kind === 'transfer' ? destAcct : '',
        });
      } catch (e) {}
    }
    setTimeout(()=>setStep('done'), 1300);
  }

  function reset() { setStep('form'); setAmount(''); }

  const QUICK = [100, 500, 1000, 5000];

  return (
    <div onClick={onClose} style={{
      position:'absolute', inset:0, background:'rgba(10,14,26,0.55)', zIndex:300,
      display:'flex', flexDirection:'column', justifyContent:'flex-end',
    }}>
      <div onClick={e=>e.stopPropagation()} style={{
        background:'var(--surface)', borderTopLeftRadius:16, borderTopRightRadius:16,
        display:'flex', flexDirection:'column', maxHeight:'88%', overflow:'hidden',
        animation:'slideUp 0.22s cubic-bezier(0.2,0.8,0.2,1)'
      }}>
        <div style={{display:'flex', justifyContent:'center', padding:'8px 0 4px'}}>
          <div style={{width:36, height:4, borderRadius:2, background:'var(--line-2)'}}/>
        </div>

        {step === 'done' ? (
          <div style={{padding:'22px 22px 28px', textAlign:'center'}}>
            <div style={{
              width:64, height:64, borderRadius:32, background:'var(--buy-tint)',
              display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 14px'
            }}>
              <Mi name="check" size={32} fill style={{color:'var(--buy)'}}/>
            </div>
            <div style={{fontSize:17, fontWeight:700, color:'var(--ink)', marginBottom:6}}>
              {kind === 'deposit' && 'Deposit Submitted'}
              {kind === 'withdraw' && 'Withdrawal Requested'}
              {kind === 'transfer' && 'Transfer Submitted'}
              {kind === 'report' && 'Report Sent'}
            </div>
            <div style={{fontSize:13, color:'var(--text-2)', lineHeight:1.5, marginBottom:18}}>
              {kind === 'deposit' && <>$ {amount || '0'} deposit submitted.<br/>Pending back-office approval.</>}
              {kind === 'withdraw' && <>$ {amount || '0'} withdrawal requested.<br/>Pending back-office approval.</>}
              {kind === 'transfer' && <>$ {amount || '0'} transfer to {destAcct} submitted.<br/>Pending back-office approval.</>}
              {kind === 'report' && <>{reportType} {reportFormat.toUpperCase()} report<br/>has been sent to your email.</>}
            </div>
            <button onClick={()=>{
              onClose();
              if (kind === 'deposit' && onNavigate) onNavigate('WATCH');
            }} style={{
              width:'100%', padding:'12px 0', borderRadius:10, background:'var(--ink)', color:'var(--ink-fg)', fontSize:14, fontWeight:700
            }}>Done</button>
          </div>
        ) : (
          <>
            <div style={{padding:'6px 16px 12px', display:'flex', alignItems:'center'}}>
              <div>
                <div style={{fontSize:16, fontWeight:700, color:'var(--ink)'}}>{t.title}</div>
                <div style={{fontSize:11.5, color:'var(--text-3)', marginTop:2}}>{t.sub}</div>
              </div>
              <span style={{flex:1}}/>
              <button onClick={onClose} style={{
                width:28, height:28, borderRadius:14, background:'var(--bg-2)',
                display:'flex', alignItems:'center', justifyContent:'center', color:'var(--text-2)'
              }}><Mi name="close" size={14}/></button>
            </div>

            <div style={{flex:1, overflowY:'auto', padding:'4px 16px 14px'}}>

              {/* DEPOSIT */}
              {kind === 'deposit' && (
                <>
                  <SheetLabel>Method</SheetLabel>
                  <MethodGrid value={method} onChange={setMethod} options={[
                    { v:'card',   icon:'credit_card',    label:'Card',          sub:'Instant · 2.5% fee' },
                    { v:'bank',   icon:'account_balance',label:'Bank Wire',     sub:'1–2 days · Free' },
                    { v:'crypto', icon:'currency_bitcoin', label:'Crypto',     sub:'10 min · 0% fee' },
                  ]}/>
                  <AmountField amount={amount} setAmount={setAmount} quick={QUICK} currency="USD"/>
                  <div style={{
                    background:'var(--bg)', borderRadius:9, padding:'10px 12px', fontSize:11.5, color:'var(--text-2)'
                  }}>
                    <Row2 l="Amount" v={amount ? '$' + amount : '—'}/>
                    <Row2 l="Fee" v={method==='card' && amount ? '$' + (parseFloat(amount)*0.025).toFixed(2) : '$0.00'}/>
                    <Row2 l="You'll receive" v={amount ? '$' + (method==='card' ? (parseFloat(amount)*0.975).toFixed(2) : amount) : '—'} bold/>
                  </div>
                </>
              )}

              {/* WITHDRAW */}
              {kind === 'withdraw' && (
                <>
                  <SheetLabel>To</SheetLabel>
                  <MethodGrid value={method} onChange={setMethod} options={[
                    { v:'bank',    icon:'account_balance',label:'Bank Account', sub:'•••• 4982 · KEB Hana' },
                    { v:'wallet',  icon:'wallet',         label:'Crypto Wallet',sub:'0x4f...8a2d · USDT' },
                  ]}/>
                  <AmountField amount={amount} setAmount={setAmount} quick={[100,500,1000,'MAX']} currency="USD" max={11248}/>
                  <div style={{
                    background:'var(--bg)', borderRadius:9, padding:'10px 12px', fontSize:11.5, color:'var(--text-2)'
                  }}>
                    <Row2 l="Available" v="$11,248.10"/>
                    <Row2 l="Amount" v={amount ? '$' + amount : '—'}/>
                    <Row2 l="Fee" v="$0.00"/>
                    <Row2 l="You'll receive" v={amount ? '$' + parseFloat(amount).toFixed(2) : '—'} bold/>
                  </div>
                </>
              )}

              {/* TRANSFER */}
              {kind === 'transfer' && (
                <>
                  <SheetLabel>From</SheetLabel>
                  <div style={{
                    background:'var(--bg)', borderRadius:9, padding:'10px 12px', marginBottom:14,
                    display:'flex', alignItems:'center', gap:10
                  }}>
                    <div style={{width:34, height:34, borderRadius:9, background:'var(--buy)',
                      display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontSize:11, fontWeight:800, letterSpacing:0.5}}>L</div>
                    <div style={{flex:1}}>
                      <div style={{fontSize:12.5, fontWeight:700, color:'var(--ink)'}}>ALPEXA Live</div>
                      <div className="mono" style={{fontSize:10, color:'var(--text-3)'}}>#08471293 · $3,000,000.00</div>
                    </div>
                  </div>
                  <SheetLabel>To</SheetLabel>
                  <MethodGrid value={destAcct} onChange={setDestAcct} options={[
                    { v:'crypto', icon:'currency_bitcoin', label:'ALPEXA Crypto', sub:'#21084712 · $0.00' },
                    { v:'sports', icon:'sports_soccer',    label:'ALPEXA Sports', sub:'#44219982 · $0.00' },
                  ]}/>
                  <AmountField amount={amount} setAmount={setAmount} quick={QUICK} currency="USD" max={12847}/>
                  <div style={{
                    background:'var(--acc-3)', borderRadius:9, padding:'10px 12px', fontSize:11.5, color:'var(--acc-2)',
                    display:'flex', alignItems:'center', gap:8
                  }}>
                    <Mi name="info" size={14}/>
                    <span>Instant transfer · No fees · 24/7</span>
                  </div>
                </>
              )}

              {/* REPORT */}
              {kind === 'report' && (
                <>
                  <SheetLabel>Period</SheetLabel>
                  <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:6, marginBottom:14}}>
                    {[
                      ['monthly','Monthly Statement'],
                      ['quarterly','Quarterly Report'],
                      ['annual','Annual Tax Report'],
                      ['custom','Custom Period'],
                    ].map(([k,l]) => (
                      <button key={k} onClick={()=>setReportType(k)} style={{
                        padding:'12px 10px', borderRadius:9, fontSize:12, fontWeight:600, textAlign:'left',
                        background: reportType===k?'var(--acc-3)':'var(--bg-2)',
                        color:    reportType===k?'var(--acc-2)':'var(--text-2)',
                        border: reportType===k?'1px solid var(--acc)':'1px solid transparent'
                      }}>{l}</button>
                    ))}
                  </div>
                  <SheetLabel>Format</SheetLabel>
                  <div style={{display:'flex', gap:6, marginBottom:14}}>
                    {[['pdf','PDF'],['csv','CSV'],['xlsx','Excel']].map(([k,l]) => (
                      <button key={k} onClick={()=>setReportFormat(k)} style={{
                        flex:1, padding:'10px 0', borderRadius:8, fontSize:12, fontWeight:700,
                        background: reportFormat===k?'var(--ink)':'var(--bg-2)',
                        color:    reportFormat===k?'var(--ink-fg)' : 'var(--text-2)',
                      }}>{l}</button>
                    ))}
                  </div>
                  <div style={{
                    background:'var(--bg)', borderRadius:9, padding:'10px 12px', fontSize:11.5, color:'var(--text-2)'
                  }}>
                    <Row2 l="Type" v={({monthly:'Monthly',quarterly:'Quarterly',annual:'Annual Tax',custom:'Custom'})[reportType]}/>
                    <Row2 l="Format" v={reportFormat.toUpperCase()}/>
                    <Row2 l="Delivery" v="Email (zbnyme@gmail.com)"/>
                    <Row2 l="Generation time" v="~30 seconds"/>
                  </div>
                </>
              )}
            </div>

            <div style={{padding:'10px 16px 16px', background:'var(--surface)', borderTop:'1px solid var(--line)'}}>
              <button onClick={submit} disabled={step==='processing' || (kind !== 'report' && !amount)} style={{
                width:'100%', padding:'13px 0', borderRadius:10, fontSize:14, fontWeight:700, color:'#fff',
                background: (step==='processing' || (kind !== 'report' && !amount)) ? 'var(--muted)' : 'var(--acc)',
                display:'flex', alignItems:'center', justifyContent:'center', gap:8
              }}>
                {step === 'processing' ? (
                  <>
                    <div style={{
                      width:16, height:16, border:'2.5px solid rgba(255,255,255,0.35)',
                      borderTopColor:'#fff', borderRadius:'50%', animation:'spin 0.7s linear infinite'
                    }}/>
                    Processing…
                  </>
                ) : (
                  <>
                    <Mi name={kind==='report'?'send':kind==='transfer'?'swap_horiz':kind==='withdraw'?'north':'south'} size={16}/>
                    {kind === 'deposit' && 'Confirm Deposit'}
                    {kind === 'withdraw' && 'Request Withdrawal'}
                    {kind === 'transfer' && 'Transfer Now'}
                    {kind === 'report' && 'Generate Report'}
                  </>
                )}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function SheetLabel({ children }) {
  return <div style={{fontSize:10, fontWeight:700, color:'var(--text-3)', letterSpacing:0.5, marginBottom:6, marginTop:4}}>{children}</div>;
}
function Row2({ l, v, bold }) {
  return (
    <div style={{display:'flex', justifyContent:'space-between', padding:'4px 0', fontSize:12, color: bold?'var(--ink)':'var(--text-2)', fontWeight: bold?700:500}}>
      <span>{l}</span><span className="mono">{v}</span>
    </div>
  );
}
function MethodGrid({ value, onChange, options }) {
  return (
    <div style={{display:'flex', flexDirection:'column', gap:6, marginBottom:14}}>
      {options.map(o => (
        <button key={o.v} onClick={()=>onChange(o.v)} style={{
          display:'flex', alignItems:'center', gap:12, padding:'12px 12px',
          borderRadius:10, textAlign:'left',
          background: value===o.v?'var(--acc-3)':'var(--bg-2)',
          border: value===o.v?'1.5px solid var(--acc)':'1.5px solid transparent',
        }}>
          <div style={{
            width:36, height:36, borderRadius:9,
            background: value===o.v?'var(--acc)':'var(--surface)',
            color:    value===o.v?'var(--ink-fg)' : 'var(--text-2)',
            display:'flex', alignItems:'center', justifyContent:'center'
          }}>
            <Mi name={o.icon} size={18} weight={500}/>
          </div>
          <div style={{flex:1}}>
            <div style={{fontSize:13, fontWeight:700, color:'var(--ink)'}}>{o.label}</div>
            <div style={{fontSize:10.5, color:'var(--text-3)', marginTop:2}}>{o.sub}</div>
          </div>
          {value === o.v && <Mi name="check_circle" size={18} fill style={{color:'var(--acc-2)'}}/>}
        </button>
      ))}
    </div>
  );
}
function AmountField({ amount, setAmount, quick, currency, max }) {
  return (
    <>
      <SheetLabel>Amount</SheetLabel>
      <div style={{
        display:'flex', alignItems:'baseline', gap:8, padding:'14px 14px',
        background:'var(--bg)', borderRadius:10, marginBottom:8
      }}>
        <span className="mono" style={{fontSize:18, fontWeight:600, color:'var(--text-3)'}}>$</span>
        <input type="number" value={amount} onChange={e=>setAmount(e.target.value)}
          placeholder="0.00" className="mono"
          style={{flex:1, fontSize:26, fontWeight:700, color:'var(--ink)', letterSpacing:-0.3}}/>
        <span style={{fontSize:11, color:'var(--text-3)', fontWeight:600, letterSpacing:0.4}}>{currency}</span>
      </div>
      <div style={{display:'flex', gap:5, marginBottom:14}}>
        {quick.map(q => (
          <button key={q} onClick={()=>setAmount(q === 'MAX' ? String(max||0) : String(q))} className="mono" style={{
            flex:1, padding:'7px 0', borderRadius:7, fontSize:11, fontWeight:700,
            background: String(amount) === String(q === 'MAX' ? (max||0) : q) ? 'var(--ink)' : 'var(--bg-2)',
            color:    String(amount) === String(q === 'MAX' ? (max||0) : q) ? 'var(--ink-fg)' : 'var(--text-2)',
          }}>{q === 'MAX' ? 'MAX' : '$' + q.toLocaleString()}</button>
        ))}
      </div>
    </>
  );
}
function AcctStat({ lbl, val }) {
  return (
    <div style={{flex:1}}>
      <div style={{fontSize:9, fontWeight:600, color:'rgba(255,255,255,0.45)', letterSpacing:0.5}}>{lbl}</div>
      <div className="mono" style={{fontSize:12.5, fontWeight:600, color:'#fff', marginTop:2}}>{val}</div>
    </div>
  );
}
function ActionBtn({ icon, label, primary, active, onClick }) {
  const [hover, setHover] = useState(false);
  const on = primary || active;
  const showAccent = on || hover;
  return (
    <button
      onClick={onClick}
      onMouseEnter={()=>setHover(true)}
      onMouseLeave={()=>setHover(false)}
      style={{
        flex:1, padding:'11px 0', borderRadius:10, display:'flex', flexDirection:'column',
        alignItems:'center', gap:3,
        background: on ? 'var(--acc)' : hover ? 'var(--acc-3)' : 'var(--surface)',
        color:    on ? '#fff' : hover ? 'var(--acc-2)' : 'var(--ink)',
        boxShadow: 'var(--shadow-sm)',
        border: on ? 'none' : '1px solid ' + (hover ? 'var(--acc)' : 'var(--line-2)'),
        transition: 'background 0.15s, color 0.15s, border-color 0.15s, transform 0.1s',
        transform: hover && !on ? 'translateY(-1px)' : 'none',
        cursor: 'pointer'
    }}>
      <Mi name={icon} size={18} weight={500}/>
      <span style={{fontSize:10.5, fontWeight:600}}>{label}</span>
    </button>
  );
}
function Section({ title, children }) {
  return (
    <>
      <div style={{fontSize:10, fontWeight:700, color:'var(--text-3)', letterSpacing:0.6, padding:'14px 14px 6px'}}>{title}</div>
      <div style={{background:'var(--surface)'}}>{children}</div>
    </>
  );
}
function Row({ label, val, chev, toggle, mono, onClick, onToggle }) {
  const [on, setOn] = useState(toggle);
  useEffect(()=>{ setOn(toggle); }, [toggle]);
  return (
    <div onClick={onClick} style={{display:'flex', alignItems:'center', padding:'12px 14px', borderBottom:'1px solid var(--line)', cursor: onClick?'pointer':'default'}}>
      <span style={{flex:1, fontSize:13, color:'var(--ink)'}}>{label}</span>
      {val && <span className={mono?'mono':''} style={{fontSize:12.5, color:'var(--text-2)', marginRight:chev?6:0}}>{val}</span>}
      {chev && <span style={{color:'var(--text-3)'}}>{I.chev}</span>}
      {toggle !== undefined && (
        <button onClick={(e)=>{ e.stopPropagation(); const nv = !on; setOn(nv); if (onToggle) onToggle(nv); }} style={{
          width:36, height:22, borderRadius:11, position:'relative',
          background: on?'var(--acc-2)':'var(--muted)',
          transition:'background 0.2s'
        }}>
          <div style={{
            width:18, height:18, background:'#fff', borderRadius:9,
            position:'absolute', top:2, left: on?16:2,
            boxShadow:'0 1px 3px rgba(0,0,0,0.2)', transition:'left 0.2s'
          }}/>
        </button>
      )}
    </div>
  );
}

Object.assign(window, { Watchlist, TradeTicket, Positions, NewsScreen, Account, ScreenIcons: I, Mi, ModifySheet });
