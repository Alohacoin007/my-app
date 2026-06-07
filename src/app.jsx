// ALPEXA — Main app: chart-first trading screen + bottom nav
const { useState, useEffect, useRef } = React;

const TAB_ICONS = {
  WATCH: <Mi name="format_list_bulleted" size={22}/>,
  CHART: <Mi name="candlestick_chart" size={22}/>,
  TRADE: <Mi name="swap_vert" size={22}/>,
  HIST:  <Mi name="history" size={22}/>,
  ACCT:  <Mi name="account_circle" size={22}/>,
};

// ──────────────────────────────────────────────
// LOTS POPOVER (quick adjuster above the LOTS button)
// ──────────────────────────────────────────────


// ──────────────────────────────────────────────
// LOTS POPOVER (quick adjuster above the LOTS button)
// ──────────────────────────────────────────────
function LotsPopover({ lots, setLots, cls = 'FX', onClose }) {
  const isInt = cls === 'STOCK' || cls === 'INDEX';
  const step = isInt
    ? (lots < 10 ? 1 : lots < 100 ? 5 : 10)
    : (lots < 0.1 ? 0.01 : lots < 1 ? 0.1 : 1);
  const min = isInt ? 1 : 0.01;
  const presets = isInt
    ? [1, 5, 10, 50, 100]
    : [0.01, 0.10, 0.50, 1.00, 5.00];
  const fmtVal = v => ALPEXA_MARKET.fmtVol(cls, v);
  const unit = ALPEXA_MARKET.getUnitLabel(cls).toUpperCase();
  return (
    <>
      <div onClick={onClose} style={{
        position:'fixed', inset:0, zIndex:90, background:'transparent'
      }}/>
      <div style={{
        position:'absolute', bottom:'calc(100% + 8px)', left:'50%', transform:'translateX(-50%)',
        zIndex:100, background:'var(--surface)', borderRadius:12,
        boxShadow:'var(--shadow-lg)', padding:'10px 10px 9px',
        border:'1px solid var(--line-2)', width:220
      }}>
        <div style={{fontSize:9, fontWeight:700, color:'var(--text-3)', letterSpacing:0.5, marginBottom:7, textAlign:'center'}}>VOLUME ({unit})</div>
        <div style={{display:'flex', alignItems:'center', gap:8, marginBottom:8}}>
          <button onClick={()=>setLots(Math.max(min, +(lots - step).toFixed(2)))} style={{
            width:32, height:32, borderRadius:16, background:'var(--bg-2)',
            display:'flex', alignItems:'center', justifyContent:'center', color:'var(--ink)'
          }}>
            <Mi name="remove" size={18} weight={600}/>
          </button>
          <div style={{flex:1, textAlign:'center'}}>
            <div className="mono" style={{fontSize:22, fontWeight:700, color:'var(--ink)', lineHeight:1}}>{fmtVal(lots)}</div>
            <div style={{fontSize:8.5, color:'var(--text-3)', fontWeight:600, letterSpacing:0.3, marginTop:2}}>STEP {fmtVal(step)}</div>
          </div>
          <button onClick={()=>setLots(+(lots + step).toFixed(2))} style={{
            width:32, height:32, borderRadius:16, background:'var(--acc)',
            display:'flex', alignItems:'center', justifyContent:'center', color:'#fff'
          }}>
            <Mi name="add" size={18} weight={600}/>
          </button>
        </div>
        <div style={{display:'flex', gap:4}}>
          {presets.map(p => (
            <button key={p} onClick={()=>setLots(p)} className="mono" style={{
              flex:1, padding:'5px 0', borderRadius:5, fontSize:10.5, fontWeight:600,
              background: Math.abs(lots-p) < 0.001 ? 'var(--ink)' : 'var(--bg-2)',
              color:    Math.abs(lots-p) < 0.001 ? 'var(--ink-fg)' : 'var(--text-2)',
            }}>{fmtVal(p)}</button>
          ))}
        </div>
        <div style={{
          position:'absolute', bottom:-6, left:'50%', transform:'translateX(-50%) rotate(45deg)',
          width:12, height:12, background:'var(--surface)',
          borderRight:'1px solid var(--line-2)', borderBottom:'1px solid var(--line-2)'
        }}/>
      </div>
    </>
  );
}

// ──────────────────────────────────────────────
// ACCOUNT SWITCHER (3 servers like MT5)
// ──────────────────────────────────────────────
const ACCOUNTS = [
  { id:'live',   name:'ALPEXA SUISSE Live',   url:'live.alpexa.com:443',   tag:'LIVE',   acct:'08471293', type:'Standard',   balance:'$3,000,000.00', color:'#15A36C' },
  { id:'crypto', name:'ALPEXA SUISSE Crypto', url:'crypto.alpexa.com:443', tag:'CRYPTO', acct:'21084712', type:'Crypto CFD', balance:'$0.00',  color:'#F59E0B' },
  { id:'sports', name:'ALPEXA SUISSE Sports', url:'sports.alpexa.com:443', tag:'SPORTS', acct:'44219982', type:'Sports',     balance:'$0.00',color:'#7C3AED' },
];

function AccountSheet({ open, current, onPick, onClose }) {
  if (!open) return null;
  return (
    <div style={{
      position:'absolute', inset:0, zIndex:300,
      background:'rgba(10,14,26,0.55)',
      display:'flex', flexDirection:'column', justifyContent:'flex-end',
      animation:'fadeIn 0.15s ease'
    }} onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} style={{
        background:'var(--surface)', borderTopLeftRadius:18, borderTopRightRadius:18,
        paddingBottom:18, overflow:'hidden',
        animation:'slideUp 0.22s cubic-bezier(0.2,0.8,0.2,1)'
      }}>
        <div style={{display:'flex', justifyContent:'center', padding:'8px 0 6px'}}>
          <div style={{width:36, height:4, borderRadius:2, background:'var(--line-2)'}}/>
        </div>
        <div style={{padding:'4px 16px 12px', display:'flex', alignItems:'center'}}>
          <span style={{fontSize:15, fontWeight:700, color:'var(--ink)'}}>Switch Account</span>
          <span style={{flex:1}}/>
          <button onClick={onClose} style={{fontSize:11, fontWeight:600, color:'var(--text-3)', padding:'4px 8px'}}>Close</button>
        </div>
        {ACCOUNTS.map(a => {
          const sel = current === a.id;
          return (
            <button key={a.id} onClick={()=>{ if(a.id==='sports'){window.location.href='sports-live.html';return;} if(a.id==='crypto'){window.location.href='crypto-live.html';return;} onPick(a.id); onClose(); }} style={{
              width:'100%', display:'flex', alignItems:'center', gap:12, padding:'14px 16px',
              background: sel?'var(--acc-3)':'transparent',
              borderTop:'1px solid var(--line)', textAlign:'left'
            }}>
              <div style={{
                width:36, height:36, borderRadius:10, background:a.color,
                display:'flex', alignItems:'center', justifyContent:'center',
                color:'#fff', fontSize:11, fontWeight:800, letterSpacing:0.5
              }}>{a.id === 'live' ? <Mi name="trending_up" size={20} weight={600}/> : a.id === 'crypto' ? <Mi name="currency_bitcoin" size={20} weight={600}/> : a.id === 'sports' ? <Mi name="sports_soccer" size={20} weight={600}/> : a.tag.slice(0,1)}</div>
              <div style={{flex:1, minWidth:0}}>
                <div style={{display:'flex', alignItems:'center', gap:6}}>
                  <span style={{fontSize:13, fontWeight:700, color:'var(--ink)'}}>{a.name}</span>
                  <span style={{
                    fontSize:8.5, padding:'2px 5px', borderRadius:3,
                    background:a.color+'22', color:a.color, fontWeight:800, letterSpacing:0.4
                  }}>{a.tag}</span>
                </div>
                <div className="mono" style={{fontSize:10.5, color:'var(--text-3)', marginTop:2}}>
                  #{a.acct} · {a.type} · {a.url}
                </div>
              </div>
              <div style={{textAlign:'right'}}>
                <div className="mono" style={{fontSize:12.5, fontWeight:700, color:'var(--ink)'}}>{a.balance}</div>
                {sel && <div style={{fontSize:9.5, fontWeight:700, color:'var(--acc-2)', marginTop:2, letterSpacing:0.4}}>● CONNECTED</div>}
              </div>
            </button>
          );
        })}
        <button style={{
          margin:'12px 16px 4px', padding:'12px 0', borderRadius:10,
          background:'var(--bg-2)', color:'var(--ink)', fontSize:13, fontWeight:700,
          width:'calc(100% - 32px)', display:'flex', alignItems:'center', justifyContent:'center', gap:6
        }}>
          <span style={{fontSize:14}}>+</span> Connect new server
        </button>
      </div>
      <style>{`
        @keyframes fadeIn { from{opacity:0} to{opacity:1} }
        @keyframes slideUp { from{transform:translateY(100%)} to{transform:translateY(0)} }
      `}</style>
    </div>
  );
}

// ──────────────────────────────────────────────
// CHART SCREEN (main / deep)
// ──────────────────────────────────────────────
function ChartScreen({ market, sym, setSym, accent, density, indicators, setIndicators, lots, setLots, onPlace }) {
  const [tf, setTf] = useState('M15');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [lotPop, setLotPop] = useState(false);
  const [dateRangePop, setDateRangePop] = useState(false);
  const [pendingTrade, setPendingTrade] = useState(null);
  const s = market.find(m => m.sym === sym);

  function placeTrade(side, price) {
    const order = { sym: s.sym, side, vol: lots, open: price, sl: 0, tp: 0, otype: 'MARKET', swap: 0 };
    const oneClick = (typeof window.getPrefs === 'function') && window.getPrefs().oneClick;
    if (oneClick) {
      onPlace && onPlace(order);
    } else {
      setPendingTrade(order);
    }
  }

  // Auto-clamp vol to sensible minimum based on asset class (stocks/indices = ≥1 integer)
  useEffect(() => {
    if (!s) return;
    if ((s.cls === 'STOCK' || s.cls === 'INDEX') && lots < 1) {
      setLots(1);
    }
  }, [s && s.cls]);
  const ask = s.last + s.spread;
  const up = s.chgPct >= 0;
  const cur = s.series[s.series.length - 1];

  // pip change vs open of last candle
  const dPts = ((s.last - cur.o) * Math.pow(10, s.digits)).toFixed(0);
  const flashClass = s.flash === 'up' ? 'flash-up' : s.flash === 'down' ? 'flash-down' : '';
  const compact = density === 'compact';

  return (
    <div style={{display:'flex', flexDirection:'column', flex:1, minHeight:0}}>
      {/* Symbol header */}
      <div style={{
        background:'var(--surface)', padding:'10px 14px 8px',
        borderBottom:'1px solid var(--line)',
        position:'relative'
      }}>
        <div style={{display:'flex', alignItems:'center', gap:10}}>
          <button onClick={()=>setPickerOpen(!pickerOpen)} style={{
            display:'flex', alignItems:'center', gap:6, padding:'4px 8px 4px 4px', borderRadius:8
          }}>
            <span style={{fontSize:19, fontWeight:800, color:'var(--ink)', letterSpacing:0.3}}>{s.sym}</span>
            <span style={{
              fontSize:8.5, padding:'2px 5px', borderRadius:3,
              background:'var(--bg-2)', color:'var(--text-2)', fontWeight:700, letterSpacing:0.5
            }}>{s.cls}</span>
            <Mi name="expand_more" size={18} style={{color:'var(--text-3)', transform: pickerOpen?'rotate(180deg)':'none', transition:'transform 0.15s'}}/>
          </button>
          <div style={{flex:1}}/>
          <span className="livedot"/>
          <span style={{fontSize:10, fontWeight:700, color:'var(--text-2)', letterSpacing:0.4}}>LIVE</span>
        </div>
        <div style={{display:'flex', alignItems:'baseline', gap:10, marginTop:4}}>
          <span className={`mono ${flashClass}`} style={{fontSize:30, fontWeight:700, color:'var(--ink)', letterSpacing:-0.5, padding:'0 4px', borderRadius:4, marginLeft:-4}}>
            {ALPEXA_MARKET.fmt(s.last, s.digits)}
          </span>
          <span className="mono" style={{fontSize:12.5, fontWeight:700, color: up?'var(--buy)':'var(--sell)'}}>
            {up?'+':''}{s.chgPct.toFixed(2)}%
          </span>
          <span className="mono" style={{fontSize:11, color:'var(--text-3)'}}>
            ({dPts>0?'+':''}{dPts} pt)
          </span>
        </div>

        {pickerOpen && <SymPicker market={market} sym={sym} onPick={s => { setSym(s); setPickerOpen(false); }}/>}
      </div>

      {/* Bid/Ask + spread bar */}
      <div style={{
        display:'flex', alignItems:'stretch', background:'var(--surface)',
        borderBottom:'1px solid var(--line)', padding:'8px 14px', gap:10
      }}>
        <div className={flashClass} style={{flex:1, padding:'7px 10px', borderRadius:8, background:'var(--sell-tint)'}}>
          <div style={{fontSize:8.5, fontWeight:800, color:'var(--sell)', letterSpacing:0.8}}>SELL · BID</div>
          <div className="mono" style={{fontSize:17, fontWeight:700, color:'var(--sell)', marginTop:2}}>
            {ALPEXA_MARKET.fmt(s.last, s.digits)}
          </div>
        </div>
        <div style={{
          display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
          padding:'0 4px'
        }}>
          <div style={{fontSize:8.5, color:'var(--text-3)', fontWeight:700, letterSpacing:0.4}}>SPREAD</div>
          <div className="mono" style={{fontSize:13, fontWeight:700, color:'var(--ink)', marginTop:2}}>
            {(s.spread*Math.pow(10,s.digits)).toFixed(0)}
          </div>
        </div>
        <div className={flashClass} style={{flex:1, padding:'7px 10px', borderRadius:8, background:'var(--buy-tint)'}}>
          <div style={{fontSize:8.5, fontWeight:800, color:'var(--buy)', letterSpacing:0.8, textAlign:'right'}}>BUY · ASK</div>
          <div className="mono" style={{fontSize:17, fontWeight:700, color:'var(--buy)', marginTop:2, textAlign:'right'}}>
            {ALPEXA_MARKET.fmt(ask, s.digits)}
          </div>
        </div>
      </div>

      {/* Timeframe pills */}
      <div style={{
        display:'flex', gap:2, padding:'6px 8px', background:'var(--surface)',
        borderBottom:'1px solid var(--line)', alignItems:'center'
      }}>
        {['M1','M5','M15','H1','H4','D1','W1'].map(t => (
          <button key={t} onClick={()=>setTf(t)} style={{
            flex:1, padding:'6px 0', borderRadius:6, fontSize:10.5, fontWeight:700, letterSpacing:0.3,
            background: tf===t?'var(--ink)':'transparent',
            color:    tf===t?'var(--ink-fg)' : 'var(--text-2)',
          }}>{t}</button>
        ))}
        <span style={{width:1, height:18, background:'var(--line-2)', margin:'0 4px'}}/>
        <button onClick={()=>setDateRangePop(!dateRangePop)} style={{
          width:30, height:28, display:'flex', alignItems:'center', justifyContent:'center',
          color: dateRangePop ? 'var(--acc)' : 'var(--text-2)', position:'relative',
          background: dateRangePop ? 'var(--acc-3)' : 'transparent', borderRadius:6
        }}>
          <Mi name="date_range" size={16}/>
          {dateRangePop && (
            <div onClick={e=>e.stopPropagation()} style={{
              position:'absolute', top:'calc(100% + 6px)', right:0, zIndex:50,
              background:'var(--surface)', borderRadius:10, boxShadow:'var(--shadow-lg)',
              border:'1px solid var(--line-2)', padding:'8px', width:200, textAlign:'left'
            }}>
              <div style={{fontSize:9.5, fontWeight:700, color:'var(--text-3)', letterSpacing:0.5, padding:'2px 6px 6px'}}>JUMP TO</div>
              {[
                ['1H', 'Last 1 hour',  'M1'],
                ['1D', 'Last 24 hours','M15'],
                ['1W', 'Last week',    'H1'],
                ['1M', 'Last month',   'H4'],
                ['3M', 'Last 3 months','D1'],
                ['YTD','Year to date', 'D1'],
                ['ALL','All available','W1'],
              ].map(([k,l,mappedTf]) => (
                <button key={k} onClick={(e)=>{ e.stopPropagation(); setTf(mappedTf); setDateRangePop(false); }} style={{
                  width:'100%', display:'flex', alignItems:'center', gap:8, padding:'7px 8px',
                  borderRadius:6, fontSize:12,
                  color: tf===mappedTf ? 'var(--acc-2)' : 'var(--ink)',
                  background: tf===mappedTf ? 'var(--acc-3)' : 'transparent', textAlign:'left'
                }}
                onMouseEnter={(e)=>{ if (tf!==mappedTf) e.currentTarget.style.background='var(--bg)'; }}
                onMouseLeave={(e)=>{ if (tf!==mappedTf) e.currentTarget.style.background='transparent'; }}>
                  <span className="mono" style={{fontSize:10.5, fontWeight:700, color: tf===mappedTf?'var(--acc-2)':'var(--acc-2)', width:30}}>{k}</span>
                  <span style={{fontSize:11.5, color:'var(--text-2)', flex:1}}>{l}</span>
                  <span className="mono" style={{fontSize:9.5, color:'var(--text-3)', fontWeight:700}}>{mappedTf}</span>
                </button>
              ))}
              <div style={{borderTop:'1px solid var(--line)', marginTop:4, paddingTop:6}}>
                <button onClick={(e)=>{ e.stopPropagation(); setDateRangePop(false); }} style={{
                  width:'100%', padding:'7px 8px', borderRadius:6, fontSize:11.5, fontWeight:600,
                  color:'var(--text-2)', textAlign:'left', display:'flex', alignItems:'center', gap:6
                }}
                onMouseEnter={(e)=>e.currentTarget.style.background='var(--bg)'}
                onMouseLeave={(e)=>e.currentTarget.style.background='transparent'}>
                  <Mi name="event" size={14}/>Custom range…
                </button>
              </div>
            </div>
          )}
        </button>
      </div>

      {/* OHLC bar */}
      <div style={{
        display:'flex', gap:14, padding:'7px 14px', background:'var(--bg-2)',
        borderBottom:'1px solid var(--line)', fontSize:10
      }}>
        {[['O', cur.o], ['H', s.high], ['L', s.low], ['C', s.last]].map(([k,v]) => (
          <div key={k} style={{display:'flex', gap:4, alignItems:'baseline'}}>
            <span style={{color:'var(--text-3)', fontWeight:700, fontSize:9}}>{k}</span>
            <span className="mono" style={{color:'var(--ink)', fontWeight:600}}>{ALPEXA_MARKET.fmt(v, s.digits)}</span>
          </div>
        ))}
      </div>

      {/* Chart */}
      <div style={{flex:1, position:'relative', background:'var(--surface)', minHeight:0}}>
        <Chart
          series={s.series}
          sym={s.sym}
          tf={tf}
          digits={s.digits}
          showMA={indicators.ma}
          showVol={indicators.vol}
          accent={accent}
          height={compact?260:300}
        />
      </div>

      {/* Indicator chips */}
      <div style={{
        display:'flex', gap:6, padding:'7px 12px', background:'var(--surface)',
        borderTop:'1px solid var(--line)', overflowX:'auto'
      }}>
        {[
          ['ma',  'MA(20)'],
          ['vol', 'Volume'],
          ['bb',  'Bollinger'],
          ['rsi', 'RSI(14)'],
          ['macd','MACD'],
        ].map(([k, l]) => {
          const on = indicators[k];
          return (
            <button key={k}
              onClick={()=>setIndicators({...indicators, [k]: !on})}
              style={{
                flexShrink:0, padding:'4px 10px', borderRadius:999, fontSize:10.5, fontWeight:600,
                background: on?'var(--acc-3)':'var(--bg-2)',
                color:    on?'var(--acc-ink)':'var(--text-3)',
                border: on?'1px solid var(--acc)':'1px solid transparent',
              }}>{on?'● ':''}{l}</button>
          );
        })}
      </div>

      {/* Quick action — Sell / Lot / Buy */}
      <div style={{
        display:'flex', gap:8, padding:'10px 12px', background:'var(--surface)',
        borderTop:'1px solid var(--line)'
      }}>
        <button onClick={()=>{
          if (!onPlace) return;
          placeTrade('SELL', s.last);
        }} style={{
          flex:1, padding:'12px 0', borderRadius:10, background:'var(--sell)',
          color:'#fff', fontWeight:800, fontSize:13, letterSpacing:0.4, lineHeight:1.2,
        }}>
          SELL<br/>
          <span className="mono" style={{fontSize:11, fontWeight:500, opacity:0.85}}>{ALPEXA_MARKET.fmt(s.last, s.digits)}</span>
        </button>
        <div style={{position:'relative'}}>
          <button onClick={()=>setLotPop(!lotPop)} style={{
            display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
            width:78, background: lotPop?'var(--acc-3)':'var(--bg-2)', borderRadius:10, padding:'4px 0',
            border: lotPop?'1px solid var(--acc)':'1px solid transparent',
            height:'100%'
          }}>
            <span style={{fontSize:8.5, color:'var(--text-3)', fontWeight:700, letterSpacing:0.4}}>{ALPEXA_MARKET.getUnitLabel(s.cls).toUpperCase()}</span>
            <span className="mono" style={{fontSize:18, fontWeight:700, color:'var(--ink)', lineHeight:1.1, marginTop:1}}>{ALPEXA_MARKET.fmtVol(s.cls, lots)}</span>
          </button>
          {lotPop && <LotsPopover lots={lots} setLots={setLots} cls={s.cls} onClose={()=>setLotPop(false)}/>}
        </div>
        <button onClick={()=>{
          if (!onPlace) return;
          placeTrade('BUY', ask);
        }} style={{
          flex:1, padding:'12px 0', borderRadius:10, background:'var(--buy)',
          color:'#fff', fontWeight:800, fontSize:13, letterSpacing:0.4, lineHeight:1.2,
        }}>
          BUY<br/>
          <span className="mono" style={{fontSize:11, fontWeight:500, opacity:0.85}}>{ALPEXA_MARKET.fmt(ask, s.digits)}</span>
        </button>
      </div>

      {/* Confirmation modal for non-one-click chart trades */}
      {pendingTrade && (
        <div onClick={()=>setPendingTrade(null)} style={{
          position:'absolute', inset:0, background:'rgba(10,14,26,0.55)', zIndex:400,
          display:'flex', alignItems:'center', justifyContent:'center', padding:20
        }}>
          <div onClick={e=>e.stopPropagation()} style={{
            background:'var(--surface)', borderRadius:16, padding:22, width:'100%', maxWidth:320,
            animation:'popIn 0.22s cubic-bezier(0.34,1.56,0.64,1)'
          }}>
            <div style={{
              width:54, height:54, borderRadius:27, margin:'0 auto 12px',
              background: pendingTrade.side==='BUY' ? 'var(--buy-tint)' : 'var(--sell-tint)',
              display:'flex', alignItems:'center', justifyContent:'center',
            }}>
              <Mi name={pendingTrade.side==='BUY'?'trending_up':'trending_down'} size={28} fill style={{color: pendingTrade.side==='BUY' ? 'var(--buy)' : 'var(--sell)'}}/>
            </div>
            <div style={{fontSize:17, fontWeight:700, color:'var(--ink)', textAlign:'center'}}>
              Confirm {pendingTrade.side==='BUY'?'Buy':'Sell'} Order
            </div>
            <div style={{fontSize:12.5, color:'var(--text-2)', textAlign:'center', marginTop:5, marginBottom:14}}>
              MARKET order for <b>{pendingTrade.sym}</b>
            </div>
            <div style={{background:'var(--bg)', borderRadius:9, padding:'10px 14px', marginBottom:16, fontSize:12.5}}>
              <div style={{display:'flex', justifyContent:'space-between', padding:'4px 0', color:'var(--text-2)'}}>
                <span>Volume</span><span className="mono" style={{color:'var(--ink)', fontWeight:600}}>{ALPEXA_MARKET.fmtVol(s.cls, pendingTrade.vol)} {ALPEXA_MARKET.getUnitLabel(s.cls)}</span>
              </div>
              <div style={{display:'flex', justifyContent:'space-between', padding:'4px 0', color:'var(--text-2)'}}>
                <span>Entry price</span><span className="mono" style={{color:'var(--ink)', fontWeight:600}}>{ALPEXA_MARKET.fmt(pendingTrade.open, s.digits)}</span>
              </div>
            </div>
            <div style={{display:'flex', gap:8}}>
              <button onClick={()=>setPendingTrade(null)} style={{
                flex:1, padding:'11px 0', borderRadius:9, background:'var(--bg-2)',
                fontSize:12.5, fontWeight:600, color:'var(--text-2)'
              }}>Cancel</button>
              <button onClick={()=>{ onPlace && onPlace(pendingTrade); setPendingTrade(null); }} style={{
                flex:1.2, padding:'11px 0', borderRadius:9,
                background: pendingTrade.side==='BUY' ? 'var(--buy)' : 'var(--sell)',
                fontSize:12.5, fontWeight:700, color:'#fff'
              }}>Confirm {pendingTrade.side}</button>
            </div>
          </div>
        </div>
      )}

      {/* Fullscreen chart modal — removed in favor of inline zoom-in */}
    </div>
  );
}

function SymPicker({ market, sym, onPick }) {
  return (
    <div style={{
      position:'absolute', top:'100%', left:0, right:0, zIndex:200,
      background:'var(--surface)', borderTop:'1px solid var(--line)',
      borderBottom:'1px solid var(--line)', boxShadow:'var(--shadow-lg)',
      maxHeight:300, overflowY:'auto'
    }}>
      {market.map(m => (
        <button key={m.sym} onClick={()=>onPick(m.sym)} style={{
          width:'100%', display:'flex', alignItems:'center', padding:'10px 14px',
          borderBottom:'1px solid var(--line)', textAlign:'left',
          background: sym===m.sym?'var(--acc-3)':'transparent'
        }}>
          <div style={{flex:1, display:'flex', alignItems:'center', gap:6}}>
            <span style={{fontSize:13, fontWeight:700, color:'var(--ink)'}}>{m.sym}</span>
            <span style={{fontSize:9, padding:'1px 4px', borderRadius:3, background:'var(--bg-2)', color:'var(--text-2)', fontWeight:700}}>{m.cls}</span>
          </div>
          <span className="mono" style={{fontSize:12, color:'var(--ink)', marginRight:8}}>{ALPEXA_MARKET.fmt(m.last, m.digits)}</span>
          <span className="mono" style={{fontSize:11, fontWeight:600, width:48, textAlign:'right', color: m.chgPct>=0?'var(--buy)':'var(--sell)'}}>
            {m.chgPct>=0?'+':''}{m.chgPct.toFixed(2)}%
          </span>
        </button>
      ))}
    </div>
  );
}

// ──────────────────────────────────────────────
// HEADER (compact)
// ──────────────────────────────────────────────
function AppHeader({ accent, account, onAccountClick, livePnl = 0, prevPnl = 0, usedMargin = 0, realizedPnl = 0, notifCount = 0, onBellClick, onMenuClick }) {
  const a = ACCOUNTS.find(x => x.id === account) || ACCOUNTS[0];
  // Effective cash balance = starting balance + sum of realized P/L from
  // closed positions. Without this, closing a position would just remove
  // its unrealized P/L from equity and "reset" balance.
  const balanceNum = parseFloat(a.balance.replace(/[$,]/g, '')) + realizedPnl;
  const prefs = getPrefs();
  const cur = window.getCurrency ? window.getCurrency(prefs.currency || 'USD') : { code:'USD', symbol:'$', rate:1 };
  const equityUsd = balanceNum + livePnl;
  const freeUsd = balanceNum + livePnl - usedMargin;
  const equity = equityUsd * cur.rate;
  const balance = balanceNum * cur.rate;
  const free = freeUsd * cur.rate;
  const usedMarginConverted = usedMargin * cur.rate;
  const pnlConverted = livePnl * cur.rate;
  // Margin level = Equity / Used Margin * 100. Infinity if no positions open.
  const marginLevel = usedMargin > 0 ? (equityUsd / usedMargin) * 100 : Infinity;
  const MARGIN_CALL = 100;   // %
  const STOP_OUT = 50;       // %
  const marginColor = marginLevel < STOP_OUT ? '#FB7185'
                   : marginLevel < MARGIN_CALL ? '#F59E0B'
                   : marginLevel < 200 ? '#FBBF24'
                   : 'rgba(255,255,255,0.92)';
  const marginWarn = marginLevel < MARGIN_CALL;
  const up = livePnl >= 0;
  const flashClass = livePnl > prevPnl ? 'flash-up' : livePnl < prevPnl ? 'flash-down' : '';
  const decimals = cur.code === 'JPY' || cur.code === 'KRW' ? 0 : 2;
  const fmt = n => n.toLocaleString('en-US',{minimumFractionDigits:decimals, maximumFractionDigits:decimals});
  return (
    <div style={{
      background:'var(--acc)', color:'#fff', padding:'56px 14px 12px',
      display:'flex', flexDirection:'column', gap:8
    }}>
      <div style={{display:'flex', alignItems:'center', gap:10}}>
        <span style={{
          fontFamily:'var(--brand)', fontSize:14, fontWeight:800,
          letterSpacing:3, color:'#fff'
        }}>ALPEXA</span>
        <button onClick={onAccountClick} style={{
          display:'flex', alignItems:'center', gap:5,
          fontSize:8.5, padding:'2.5px 6px 2.5px 7px', borderRadius:4,
          background:'rgba(255,255,255,0.12)', color:'rgba(255,255,255,0.9)',
          fontWeight:700, letterSpacing:0.6
        }}>
          <span style={{width:5, height:5, borderRadius:'50%', background:a.color, display:'inline-block'}}/>
          {a.tag} · #{a.acct.slice(-4)}
          <Mi name="expand_more" size={12} style={{opacity:0.7}}/>
        </button>
        <span style={{flex:1}}/>
        <button onClick={onBellClick} style={{padding:6, color:'rgba(255,255,255,0.85)', position:'relative'}}>{ScreenIcons.bell}{notifCount > 0 && <span style={{position:'absolute', top:2, right:2, minWidth:14, height:14, padding:'0 3px', borderRadius:7, background:'#FB7185', color:'#fff', fontSize:9, fontWeight:800, display:'flex', alignItems:'center', justifyContent:'center', lineHeight:1, border:'1.5px solid var(--acc)'}}>{notifCount > 9 ? '9+' : notifCount}</span>}</button>
        <button onClick={onMenuClick} style={{padding:6, color:'rgba(255,255,255,0.85)'}}>{ScreenIcons.menu}</button>
      </div>
      <div style={{display:'flex', alignItems:'baseline', gap:8, marginTop:2}}>
        <div style={{fontSize:8.5, fontWeight:700, color:'rgba(255,255,255,0.55)', letterSpacing:0.7}}>EQUITY · {cur.code}</div>
        <div style={{fontSize:8.5, fontWeight:700, color:'rgba(255,255,255,0.45)', letterSpacing:0.5}}>OPEN P/L</div>
      </div>
      <div style={{display:'flex', alignItems:'center', gap:10}}>
        <div className={`mono ${flashClass}`} style={{fontSize:24, fontWeight:700, lineHeight:1.1, padding:'0 2px', borderRadius:3, whiteSpace:'nowrap'}}>{cur.symbol}{fmt(equity)}</div>
        <span title="Sum of unrealized profit/loss across all open positions" className="mono" style={{
          fontSize:13, fontWeight:700, padding:'4px 9px', borderRadius:5,
          background: up ? 'var(--buy-glow)' : 'var(--sell-glow)',
          color: up ? 'var(--buy-bright)' : 'var(--sell-bright)',
          boxShadow: '0 0 0 1px ' + (up ? 'rgba(74,222,128,0.35)' : 'rgba(251,113,133,0.35)'),
          letterSpacing:0.2, whiteSpace:'nowrap', lineHeight:1.2, cursor:'help',
          transition:'background 0.2s, color 0.2s'
        }}>{up?'+':''}{fmt(pnlConverted)}</span>
      </div>
      <div style={{display:'flex', gap:14, marginTop:6, fontSize:10, color:'rgba(255,255,255,0.75)', flexWrap:'wrap'}}>
        <span><span style={{color:'rgba(255,255,255,0.5)', fontWeight:700, letterSpacing:0.5, marginRight:5}}>BAL</span><span className="mono">{fmt(balance)}</span></span>
        <span><span style={{color:'rgba(255,255,255,0.5)', fontWeight:700, letterSpacing:0.5, marginRight:5}}>FREE</span><span className="mono">{fmt(free)}</span></span>
        {usedMargin > 0 && (
          <span title={`Margin Call at ${MARGIN_CALL}% · Stop Out at ${STOP_OUT}%`} style={{display:'flex', alignItems:'center', gap:5}}>
            <span style={{color:'rgba(255,255,255,0.5)', fontWeight:700, letterSpacing:0.5}}>MARGIN</span>
            <span className="mono" style={{color: marginColor, fontWeight:700}}>
              {marginLevel === Infinity ? '∞' : marginLevel.toFixed(0) + '%'}
            </span>
            {marginWarn && <Mi name="warning" size={10} style={{color:marginColor}}/>}
          </span>
        )}
      </div>
    </div>
  );
}
function HeaderStat({ lbl, val, color }) {
  return (
    <div>
      <div style={{fontSize:8, fontWeight:700, color:'rgba(255,255,255,0.45)', letterSpacing:0.6}}>{lbl}</div>
      <div className="mono" style={{fontSize:11, fontWeight:600, color: color||'rgba(255,255,255,0.92)', marginTop:1}}>{val}</div>
    </div>
  );
}

// ──────────────────────────────────────────────
// BOTTOM NAV
// ──────────────────────────────────────────────
function BottomNav({ tab, setTab }) {
  const items = [
    ['WATCH', 'Watch'],
    ['CHART', 'Chart'],
    ['TRADE', 'Trade'],
    ['HIST',  'History'],
    ['ACCT',  'Account'],
  ];
  return (
    <div style={{
      display:'flex', background:'var(--surface)',
      borderTop:'1px solid var(--line)', padding:'5px 4px 30px'
    }}>
      {items.map(([k,l]) => {
        const active = tab===k;
        return (
          <button key={k} onClick={()=>setTab(k)} style={{
            flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:2,
            padding:'4px 0', color: active?'var(--ink)':'var(--text-3)',
          }}>
            {TAB_ICONS[k]}
            <span style={{fontSize:9.5, fontWeight:active?700:500, letterSpacing:0.3}}>{l}</span>
          </button>
        );
      })}
    </div>
  );
}

// ──────────────────────────────────────────────
// APP MENU (top-right · 3 dots)
// ──────────────────────────────────────────────
function AppMenu({ indicators, setIndicators, liveOrders, closedHistory, onClose }) {
  const [view, setView] = useState('root'); // root | chart | stats | help
  function muted() { try { return JSON.parse(localStorage.getItem('alpexa.prefs')||'{}').soundMuted === true; } catch(e) { return false; } }
  const [, force] = useState(0);
  function toggleSound() {
    try {
      const p = JSON.parse(localStorage.getItem('alpexa.prefs')||'{}');
      p.soundMuted = !p.soundMuted;
      localStorage.setItem('alpexa.prefs', JSON.stringify(p));
      if (!p.soundMuted && window.ALPEXA_SFX) window.ALPEXA_SFX.tick();
    } catch(e) {}
    force(x=>x+1);
  }
  function toggleDark() { document.documentElement.classList.toggle('dark'); force(x=>x+1); }

  const closed = closedHistory || [];
  const wins = closed.filter(c => c.pnl >= 0);
  const losses = closed.filter(c => c.pnl < 0);
  const winRate = closed.length ? ((wins.length / closed.length) * 100).toFixed(1) : '0.0';
  const totalPnl = closed.reduce((s,c)=>s+(c.pnl||0), 0);
  const avgWin = wins.length ? wins.reduce((s,c)=>s+c.pnl,0)/wins.length : 0;
  const avgLoss = losses.length ? losses.reduce((s,c)=>s+c.pnl,0)/losses.length : 0;

  return (
    <div onClick={onClose} style={{
      position:'absolute', inset:0, background:'rgba(10,14,26,0.55)', zIndex:300,
      display:'flex', flexDirection:'column', justifyContent:'flex-end',
    }}>
      <div onClick={e=>e.stopPropagation()} style={{
        background:'var(--surface)', borderTopLeftRadius:16, borderTopRightRadius:16,
        display:'flex', flexDirection:'column', maxHeight:'80%', overflow:'hidden',
        animation:'slideUp 0.22s cubic-bezier(0.2,0.8,0.2,1)'
      }}>
        <div style={{display:'flex', justifyContent:'center', padding:'8px 0 4px'}}>
          <div style={{width:36, height:4, borderRadius:2, background:'var(--line-2)'}}/>
        </div>
        <div style={{padding:'10px 14px 12px', display:'flex', alignItems:'center', gap:6, borderBottom:'1px solid var(--line)'}}>
          {view !== 'root' && (
            <button onClick={()=>setView('root')} style={{
              width:28, height:28, display:'flex', alignItems:'center',
              justifyContent:'center', color:'var(--text-2)', background:'transparent'
            }}><Mi name="arrow_back_ios_new" size={16}/></button>
          )}
          <div style={{fontSize:15, fontWeight:600, color:'var(--ink)', flex:1}}>
            {view === 'root' && 'Settings'}
            {view === 'chart' && 'Charts'}
            {view === 'stats' && 'Statistics'}
            {view === 'help' && 'Help'}
          </div>
          <button onClick={onClose} style={{
            width:28, height:28, display:'flex', alignItems:'center',
            justifyContent:'center', color:'var(--text-2)', background:'transparent'
          }}><Mi name="close" size={18}/></button>
        </div>

        <div style={{flex:1, overflowY:'auto', padding:'0 0 16px', background:'var(--bg)'}}>

          {view === 'root' && (
            <>
              <Mt5Section title="Charts"/>
              <Mt5Row icon="candlestick_chart" label="Charts" value="Indicators, grid" onClick={()=>setView('chart')}/>

              <Mt5Section title="Interface"/>
              <Mt5Row icon="dark_mode" label="Dark Mode" toggle={document.documentElement.classList.contains('dark')} onClick={toggleDark}/>
              <Mt5Row icon={muted()?'volume_off':'volume_up'} label="Sounds" toggle={!muted()} onClick={toggleSound}/>

              <Mt5Section title="Trading"/>
              <Mt5Row icon="bar_chart" label="Statistics" value={`${closed.length} closed · ${winRate}%`} onClick={()=>setView('stats')}/>

              <Mt5Section title="Support"/>
              <Mt5Row icon="help_outline" label="FAQ" onClick={()=>setView('help')}/>
              <Mt5Row icon="info" label="About" value="v1.4.2"/>

              <Mt5Section title=""/>
              <Mt5Row icon="logout" label="Sign Out" danger onClick={()=>{
                if (confirm('Sign out of ALPEXA?')) window.location.href='login.html';
              }}/>
            </>
          )}

          {view === 'chart' && (
            <>
              <Mt5Section title="Indicators"/>
              {[
                ['ma','Moving Average (20)'],
                ['vol','Volume'],
                ['bb','Bollinger Bands'],
                ['rsi','RSI (14)'],
                ['macd','MACD'],
              ].map(([k,l])=> (
                <Mt5Row key={k} label={l} toggle={!!indicators[k]}
                  onClick={()=>setIndicators({...indicators, [k]: !indicators[k]})}/>
              ))}
              <Mt5Section title="Appearance"/>
              <Mt5Row label="Grid" toggle={true}/>
              <Mt5Row label="Colors" value="Green / Red" chev/>
            </>
          )}

          {view === 'stats' && (
            <>
              <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:8}}>
                <StatCard lbl="Total P/L" val={`${totalPnl>=0?'+':''}$${totalPnl.toFixed(2)}`} up={totalPnl>=0}/>
                <StatCard lbl="Win Rate" val={`${winRate}%`}/>
                <StatCard lbl="Wins"   val={wins.length} hue="buy"/>
                <StatCard lbl="Losses" val={losses.length} hue="sell"/>
                <StatCard lbl="Avg Win"  val={`+$${avgWin.toFixed(2)}`} hue="buy"/>
                <StatCard lbl="Avg Loss" val={`$${avgLoss.toFixed(2)}`} hue="sell"/>
              </div>
              <div style={{background:'var(--bg)', borderRadius:9, padding:'12px 14px', marginTop:4}}>
                <div style={{fontSize:11, fontWeight:700, color:'var(--text-2)', marginBottom:8}}>Active Positions</div>
                <div style={{display:'flex', justifyContent:'space-between', fontSize:12.5}}>
                  <span style={{color:'var(--text-2)'}}>Open</span>
                  <span className="mono" style={{fontWeight:700, color:'var(--ink)'}}>{(liveOrders||[]).length}</span>
                </div>
                <div style={{display:'flex', justifyContent:'space-between', fontSize:12.5, marginTop:6}}>
                  <span style={{color:'var(--text-2)'}}>Closed (session)</span>
                  <span className="mono" style={{fontWeight:700, color:'var(--ink)'}}>{closed.length}</span>
                </div>
              </div>
            </>
          )}

          {view === 'help' && (
            <>
              {[
                { q:'How do I place a trade?',  a:'Tap a symbol in Watchlist or go to Chart, set volume, then BUY or SELL.' },
                { q:'What is leverage?',         a:'A multiplier on your buying power. Configure in Account → Leverage Settings.' },
                { q:'How are spreads charged?',  a:'Spreads are floating. You pay the difference between bid and ask on entry.' },
                { q:'Can I close partial?',      a:'Not yet — full close only. Modify SL/TP to manage risk on open positions.' },
                { q:'When are markets open?',    a:'FX: 24/5 (Sun 21:00 GMT — Fri 21:00 GMT). Stocks: NYSE 14:30–21:00 GMT. Crypto: 24/7.' },
              ].map((item,i) => (
                <details key={i} style={{
                  background:'var(--bg)', borderRadius:9, padding:'10px 12px', marginBottom:5,
                  cursor:'pointer'
                }}>
                  <summary style={{fontSize:12.5, fontWeight:600, color:'var(--ink)', cursor:'pointer'}}>{item.q}</summary>
                  <div style={{fontSize:11.5, color:'var(--text-2)', marginTop:6, lineHeight:1.5}}>{item.a}</div>
                </details>
              ))}
              <div style={{textAlign:'center', fontSize:11, color:'var(--text-3)', marginTop:12}}>
                ALPEXA v1.4.2 · © 2026 ALPEXA SUISSE
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Mt5Section({ title }) {
  return (
    <div style={{
      fontSize:10.5, fontWeight:700, color:'var(--text-3)',
      letterSpacing:0.8, textTransform:'uppercase',
      padding: title ? '18px 16px 6px' : '12px 0 0'
    }}>{title}</div>
  );
}

function Mt5Row({ icon, label, value, toggle, chev, danger, onClick }) {
  const interactive = !!onClick;
  return (
    <div onClick={onClick} style={{
      display:'flex', alignItems:'center', gap:14,
      padding:'12px 16px', background:'var(--surface)',
      borderBottom:'1px solid var(--line)',
      cursor: interactive ? 'pointer' : 'default'
    }}
    onMouseEnter={(e)=>{ if (interactive) e.currentTarget.style.background='var(--bg-2)'; }}
    onMouseLeave={(e)=>{ e.currentTarget.style.background='var(--surface)'; }}>
      {icon && (
        <Mi name={icon} size={20} style={{
          color: danger ? 'var(--sell-2)' : 'var(--text-2)',
          flexShrink:0
        }}/>
      )}
      <div style={{flex:1, fontSize:14, fontWeight:500,
        color: danger ? 'var(--sell-2)' : 'var(--ink)'}}>{label}</div>
      {value !== undefined && (
        <div style={{fontSize:12.5, color:'var(--text-3)', textAlign:'right'}}>{value}</div>
      )}
      {toggle !== undefined && (
        <div style={{
          width:38, height:22, borderRadius:11, position:'relative',
          background: toggle ? '#34C759' : 'var(--muted)',
          transition:'background 0.2s', flexShrink:0
        }}>
          <div style={{
            width:18, height:18, background:'#fff', borderRadius:9,
            position:'absolute', top:2, left: toggle?18:2,
            boxShadow:'0 1px 3px rgba(0,0,0,0.2)', transition:'left 0.2s'
          }}/>
        </div>
      )}
      {chev && <Mi name="chevron_right" size={18} style={{color:'var(--text-3)', flexShrink:0}}/>}
      {!toggle && !value && chev === undefined && onClick && !danger && (
        <Mi name="chevron_right" size={18} style={{color:'var(--text-3)', flexShrink:0}}/>
      )}
    </div>
  );
}

function MenuItem({ icon, label, sub, toggle, chev, danger, onClick }) {
  return (
    <div onClick={onClick} style={{
      display:'flex', alignItems:'center', gap:12, padding:'12px 12px',
      borderRadius:9, cursor:'pointer'
    }}
    onMouseEnter={(e)=>e.currentTarget.style.background='var(--bg)'}
    onMouseLeave={(e)=>e.currentTarget.style.background='transparent'}>
      <div style={{
        width:34, height:34, borderRadius:8, flexShrink:0,
        background: danger ? 'var(--sell-tint)' : 'var(--bg-2)',
        color: danger ? 'var(--sell-2)' : 'var(--ink)',
        display:'flex', alignItems:'center', justifyContent:'center'
      }}>
        <Mi name={icon} size={18}/>
      </div>
      <div style={{flex:1, minWidth:0}}>
        <div style={{fontSize:13, fontWeight:600, color: danger ? 'var(--sell-2)' : 'var(--ink)'}}>{label}</div>
        {sub && <div style={{fontSize:10.5, color:'var(--text-3)', marginTop:1}}>{sub}</div>}
      </div>
      {toggle !== undefined && (
        <div style={{
          width:36, height:22, borderRadius:11, position:'relative',
          background: toggle ? 'var(--acc-2)' : 'var(--muted)',
          transition:'background 0.2s', flexShrink:0
        }}>
          <div style={{
            width:18, height:18, background:'#fff', borderRadius:9,
            position:'absolute', top:2, left: toggle?16:2,
            boxShadow:'0 1px 3px rgba(0,0,0,0.2)', transition:'left 0.2s'
          }}/>
        </div>
      )}
      {chev && <Mi name="chevron_right" size={16} style={{color:'var(--text-3)'}}/>}
    </div>
  );
}

function StatCard({ lbl, val, up, hue }) {
  const color = hue === 'buy' ? 'var(--buy)' : hue === 'sell' ? 'var(--sell)' : up !== undefined ? (up?'var(--buy)':'var(--sell)') : 'var(--ink)';
  return (
    <div style={{background:'var(--bg)', borderRadius:9, padding:'10px 12px'}}>
      <div style={{fontSize:9.5, fontWeight:700, color:'var(--text-3)', letterSpacing:0.5}}>{lbl}</div>
      <div className="mono" style={{fontSize:18, fontWeight:700, color, marginTop:3, letterSpacing:-0.2}}>{val}</div>
    </div>
  );
}

// ──────────────────────────────────────────────
// NOTIFICATION SHEET
// ──────────────────────────────────────────────
function NotificationSheet({ notifications, setNotifications, onClose }) {
  const unread = notifications.filter(n => !n.read).length;
  function markAllRead() { setNotifications(notifications.map(n => ({ ...n, read: true }))); }
  function clear(id) { setNotifications(notifications.filter(n => n.id !== id)); }
  function markRead(id) { setNotifications(notifications.map(n => n.id === id ? { ...n, read: true } : n)); }

  const META = {
    orderFill: { icon:'task_alt', tint:'var(--buy-tint)', col:'var(--buy-2)', label:'Order Filled' },
    pendingTriggered: { icon:'bolt', tint:'#FFF3E0', col:'#E65100', label:'Pending Triggered' },
    priceAlert: { icon:'notifications_active', tint:'var(--acc-3)', col:'var(--acc-2)', label:'Price Alert' },
    news: { icon:'campaign', tint:'#FCE4EC', col:'#C2185B', label:'Market News' },
    login: { icon:'login', tint:'var(--bg-2)', col:'var(--text-2)', label:'New Sign-in' },
    marginCall: { icon:'warning', tint:'var(--sell-tint)', col:'var(--sell-2)', label:'Margin Call' },
  };

  function renderBody(n) {
    if (n.type === 'orderFill') return <>Filled <b>{n.side} {n.vol.toFixed(2)} {n.sym}</b> @ <span className="mono">{n.px}</span></>;
    if (n.type === 'pendingTriggered') return <><b>{n.side} {n.sym}</b> triggered at <span className="mono">{n.px}</span></>;
    if (n.type === 'priceAlert') return <><b>{n.sym}</b> crossed {n.side === 'above' ? '↑' : '↓'} <span className="mono">{n.px.toLocaleString()}</span></>;
    if (n.type === 'news') return <>{n.title}</>;
    if (n.type === 'login') return <>New sign-in from <b>{n.device}</b> · {n.loc}</>;
    return null;
  }

  return (
    <div onClick={onClose} style={{
      position:'absolute', inset:0, background:'rgba(10,14,26,0.55)', zIndex:300,
      display:'flex', flexDirection:'column', justifyContent:'flex-end',
    }}>
      <div onClick={e=>e.stopPropagation()} style={{
        background:'var(--surface)', borderTopLeftRadius:16, borderTopRightRadius:16,
        display:'flex', flexDirection:'column', maxHeight:'82%', overflow:'hidden',
        animation:'slideUp 0.22s cubic-bezier(0.2,0.8,0.2,1)'
      }}>
        <div style={{display:'flex', justifyContent:'center', padding:'8px 0 4px'}}>
          <div style={{width:36, height:4, borderRadius:2, background:'var(--line-2)'}}/>
        </div>
        <div style={{padding:'6px 16px 12px', display:'flex', alignItems:'center', gap:8}}>
          <div>
            <div style={{fontSize:16, fontWeight:700, color:'var(--ink)'}}>Notifications</div>
            <div style={{fontSize:11.5, color:'var(--text-3)', marginTop:2}}>
              {unread > 0 ? `${unread} unread · ${notifications.length} total` : `${notifications.length} total`}
            </div>
          </div>
          <span style={{flex:1}}/>
          {unread > 0 && (
            <button onClick={markAllRead} style={{
              fontSize:11, fontWeight:600, color:'var(--acc-2)', padding:'5px 10px',
              borderRadius:6, background:'var(--acc-3)'
            }}>Mark all read</button>
          )}
          <button onClick={onClose} style={{
            width:28, height:28, borderRadius:14, background:'var(--bg-2)',
            display:'flex', alignItems:'center', justifyContent:'center', color:'var(--text-2)'
          }}><Mi name="close" size={14}/></button>
        </div>

        <div style={{flex:1, overflowY:'auto', padding:'4px 12px 14px'}}>
          {notifications.length === 0 ? (
            <div style={{padding:'50px 16px', textAlign:'center'}}>
              <Mi name="notifications_off" size={42} style={{color:'var(--muted)', display:'block', margin:'0 auto 10px'}}/>
              <div style={{fontSize:13, fontWeight:600, color:'var(--text-2)'}}>No notifications</div>
              <div style={{fontSize:11, marginTop:4, color:'var(--text-3)'}}>You're all caught up</div>
            </div>
          ) : notifications.map(n => {
            const m = META[n.type] || META.login;
            return (
              <div key={n.id} onClick={()=>markRead(n.id)} style={{
                display:'flex', alignItems:'flex-start', gap:10, padding:'11px 12px',
                background: n.read ? 'transparent' : 'var(--acc-3)',
                borderRadius:9, marginBottom:4, cursor:'pointer',
                borderLeft: n.read ? '3px solid transparent' : '3px solid var(--acc)',
              }}>
                <div style={{
                  width:34, height:34, borderRadius:8, flexShrink:0,
                  background: m.tint, color: m.col,
                  display:'flex', alignItems:'center', justifyContent:'center'
                }}>
                  <Mi name={m.icon} size={18}/>
                </div>
                <div style={{flex:1, minWidth:0}}>
                  <div style={{display:'flex', alignItems:'center', gap:6}}>
                    <span style={{fontSize:11.5, fontWeight:700, color: m.col, letterSpacing:0.2}}>{m.label}</span>
                    {!n.read && <span style={{width:6, height:6, borderRadius:'50%', background:'var(--acc)'}}/>}
                    <span style={{flex:1}}/>
                    <span className="mono" style={{fontSize:10, color:'var(--text-3)'}}>{n.time}</span>
                  </div>
                  <div style={{fontSize:12.5, color:'var(--ink)', marginTop:3, lineHeight:1.4}}>
                    {renderBody(n)}
                  </div>
                </div>
                <button onClick={(e)=>{ e.stopPropagation(); clear(n.id); }} style={{
                  width:24, height:24, borderRadius:12, color:'var(--text-3)',
                  display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0
                }}><Mi name="close" size={14}/></button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────
// ROOT APP
// ──────────────────────────────────────────────
const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "accent":   "#1565C0",
  "density":  "compact",
  "darkHdr":  true
}/*EDITMODE-END*/;

function App() {
  const [tweaks, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const urlSym = (() => {
    try {
      const p = new URLSearchParams(window.location.search).get('sym');
      const ls = localStorage.getItem('alpexa.selectedSym');
      return p || ls || 'EURUSD';
    } catch (e) { return 'EURUSD'; }
  })();
  const [tab, setTab] = useState('WATCH');
  const [sym, setSym] = useState(urlSym);
  const [posTab, setPosTab] = useState('OPEN');
  const [account, setAccount] = useState('live');
  const [acctSheet, setAcctSheet] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [notifications, setNotifications] = useState([
    { id:1, type:'orderFill', side:'BUY',  sym:'EURUSD', vol:0.10, px:1.08412, time:'14:32', read:false },
    { id:2, type:'priceAlert', sym:'BTCUSD', side:'above', px:71200, time:'13:18', read:false },
    { id:3, type:'news', impact:'high', title:'US CPI release in 30 minutes', time:'13:00', read:false },
    { id:4, type:'pendingTriggered', side:'SELL', sym:'GBPUSD', vol:0.50, px:1.26500, time:'11:45', read:true },
    { id:5, type:'login', device:'iPhone', loc:'Seoul, KR', time:'09:12', read:true },
  ]);
  const [lots, setLots] = useState(0.10);
  const [indicators, setIndicators] = useState({ ma:true, vol:true, bb:false, rsi:false, macd:false });
  const [liveOrders, setLiveOrders] = useState([]);
  const [pendingOrders, setPendingOrders] = useState([]);
  const [closedHistory, setClosedHistory] = useState([]);
  const [modifyTarget, setModifyTarget] = useState(null);
  const [toast, setToast] = useState(null);
  const marketRef = useRef(null);
  if (!marketRef.current) marketRef.current = ALPEXA_MARKET.createMarket();
  const [, force] = useState(0);

  // tick
  useEffect(() => {
    const id = setInterval(() => {
      marketRef.current.tick();
      setLiveOrders(prev => prev.map(o => {
        if (o.status !== 'OPEN') return o;
        const m = marketRef.current.state.find(s => s.sym === o.sym);
        if (!m) return o;
        const cur = o.side === 'BUY' ? m.last : m.last + m.spread;
        const pnl = ALPEXA_MARKET.getPnlUSD(m, o.open, cur, o.side, o.vol);
        return { ...o, pnl: pnl };
      }));
      // Check pending orders for trigger
      setPendingOrders(prev => {
        const triggered = [];
        const stillPending = prev.filter(p => {
          const m = marketRef.current.state.find(s => s.sym === p.sym);
          if (!m) return true;
          const px = p.side === 'BUY' ? m.last + m.spread : m.last;
          let hit = false;
          // LIMIT: BUY when ask <= trigger; SELL when bid >= trigger
          // STOP:  BUY when ask >= trigger; SELL when bid <= trigger
          if (p.otype === 'LIMIT') {
            hit = p.side === 'BUY' ? px <= p.trigger : px >= p.trigger;
          } else if (p.otype === 'STOP') {
            hit = p.side === 'BUY' ? px >= p.trigger : px <= p.trigger;
          }
          if (hit) {
            const now = new Date();
            const time = String(now.getHours()).padStart(2,'0')+':'+String(now.getMinutes()).padStart(2,'0')+':'+String(now.getSeconds()).padStart(2,'0');
            triggered.push({
              ...p,
              status: 'OPEN',
              open: px,
              placedAt: time,
              fresh: true,
              pnl: 0,
            });
            return false;
          }
          return true;
        });
          if (triggered.length > 0) {
            setLiveOrders(lo => [...triggered, ...lo]);
            const t = triggered[0];
            setToast({ side: t.side, sym: t.sym, vol: t.vol, price: t.open, triggered: true });
            setTimeout(() => setToast(null), 3200);
            if (window.ALPEXA_SFX) window.ALPEXA_SFX.triggered();
            setTimeout(() => {
              setLiveOrders(lo => lo.map(o => triggered.find(tr => tr.id === o.id) ? { ...o, fresh: false } : o));
            }, 1500);
          }
        return stillPending;
      });
      force(x => x + 1);
    }, 700);
    return () => clearInterval(id);
  }, []);

  function placeOrder(orderData) {
    const id = Date.now();
    const now = new Date();
    const time = String(now.getHours()).padStart(2,'0')+':'+String(now.getMinutes()).padStart(2,'0')+':'+String(now.getSeconds()).padStart(2,'0');
    if (orderData.otype && orderData.otype !== 'MARKET') {
      // Add to pending
      const newPending = { id, ...orderData, status:'PENDING', placedAt: time };
      setPendingOrders(prev => [newPending, ...prev]);
      setToast({ side: orderData.side, sym: orderData.sym, vol: orderData.vol, price: orderData.trigger, pending: true, otype: orderData.otype });
      setTimeout(() => setToast(null), 3200);
      if (window.ALPEXA_SFX) window.ALPEXA_SFX.pendingPlaced();
      setTab('HIST');
      setPosTab('PEND');
      return;
    }
    const newOrder = { id, ...orderData, status:'OPEN', placedAt: time, pnl: 0, fresh: true };
    setLiveOrders(prev => [newOrder, ...prev]);
    setToast({ side: orderData.side, sym: orderData.sym, vol: orderData.vol, price: orderData.open });
    setTimeout(() => setToast(null), 3200);
    if (window.ALPEXA_SFX) window.ALPEXA_SFX.orderFill(orderData.side);
    setTimeout(() => {
      setLiveOrders(prev => prev.map(o => o.id === id ? { ...o, fresh: false } : o));
    }, 1500);
    setTab('HIST');
    setPosTab('OPEN');
  }

  function cancelPending(id) {
    setPendingOrders(prev => prev.filter(p => p.id !== id));
  }

  function modifyPosition(updated) {
    setLiveOrders(prev => prev.map(o => o.id === updated.id ? { ...o, sl: updated.sl, tp: updated.tp } : o));
    if (window.ALPEXA_SFX) window.ALPEXA_SFX.tick();
  }
  function modifyPending(updated) {
    setPendingOrders(prev => prev.map(p => p.id === updated.id ? { ...p, sl: updated.sl, tp: updated.tp, trigger: updated.trigger } : p));
    if (window.ALPEXA_SFX) window.ALPEXA_SFX.tick();
  }

  function closeOrder(id) {
    setLiveOrders(prev => {
      const order = prev.find(o => o.id === id);
      if (order) {
        const m = marketRef.current.state.find(s => s.sym === order.sym);
        const closePrice = m ? (order.side === 'BUY' ? m.last : m.last + m.spread) : order.open;
        const now = new Date();
        const dateStr = String(now.getMonth()+1).padStart(2,'0') + '-' + String(now.getDate()).padStart(2,'0') + ' '
                      + String(now.getHours()).padStart(2,'0') + ':' + String(now.getMinutes()).padStart(2,'0');
        setClosedHistory(h => [
          {
            id: order.id,
            sym: order.sym,
            side: order.side,
            vol: order.vol,
            open: order.open,
            close: closePrice,
            pnl: order.pnl || 0,
            date: dateStr,
            placedAt: order.placedAt,
          },
          ...h,
        ]);
        if (window.ALPEXA_SFX) window.ALPEXA_SFX.closed();
      }
      return prev.filter(o => o.id !== id);
    });
  }

  const market = marketRef.current.state;

  // accent CSS var live update
  useEffect(() => {
    document.documentElement.style.setProperty('--acc', tweaks.accent);
  }, [tweaks.accent]);

  // Total live P/L = static demo positions + live orders
  const staticPnl = ALPEXA_MARKET.POSITIONS.reduce((s,p)=>s+(p.pnl||0),0);
  const ordersPnl = liveOrders.reduce((s,o)=>s+(o.pnl||0),0);
  const livePnl = staticPnl + ordersPnl;
  // Cumulative realized P/L from closed positions — added to balance so
  // closing a winner/loser updates cash, not just unrealized equity.
  const realizedPnl = closedHistory.reduce((s,c)=>s+(c.pnl||0),0);
  // Used margin from all open live orders
  const usedMargin = liveOrders.reduce((sum, o) => {
    const m = marketRef.current.state.find(s => s.sym === o.sym);
    if (!m) return sum;
    const lev = (typeof window.getLeverageSettings === 'function' ? window.getLeverageSettings() : { FX:100, INDEX:20, STOCK:5, CRYPTO:5 })[m.cls] || 100;
    return sum + ALPEXA_MARKET.getMarginUSD(m, o.vol||0, o.open||0, lev);
  }, 0);
  const prevPnlRef = useRef(livePnl);
  const prevPnl = prevPnlRef.current;
  useEffect(() => { prevPnlRef.current = livePnl; }, [livePnl]);

  return (
    <div className="app">
      <AppHeader accent={tweaks.accent} account={account} onAccountClick={()=>setAcctSheet(true)} livePnl={livePnl} prevPnl={prevPnl} usedMargin={usedMargin} realizedPnl={realizedPnl} notifCount={notifications.filter(n => !n.read).length} onBellClick={()=>setNotifOpen(true)} onMenuClick={()=>setMenuOpen(true)}/>
      {tab === 'WATCH' && <Watchlist market={market} current={sym} onSelect={s => { setSym(s); setTab('CHART'); }} onDepositCrypto={()=>{
        try { localStorage.setItem('alpexa.openDeposit', 'crypto'); } catch(e) {}
        setTab('ACCT');
      }}/>}
      {tab === 'CHART' && <ChartScreen
        market={market} sym={sym} setSym={setSym}
        accent={tweaks.accent}
        density={tweaks.density}
        indicators={indicators}
        setIndicators={setIndicators}
        lots={lots} setLots={setLots}
        onPlace={placeOrder}
      />}
      {tab === 'TRADE' && <TradeTicket
        market={market} sym={sym} setSym={setSym} lots={lots} setLots={setLots}
        onPlace={placeOrder}
      />}
      {tab === 'HIST'  && <Positions tab={posTab} setTab={setPosTab} liveOrders={liveOrders} pendingOrders={pendingOrders} closedHistory={closedHistory} market={market} onClose={closeOrder} onCancelPending={cancelPending} onModify={(p)=>setModifyTarget({ position:p, isPending:false })} onModifyPending={(p)=>setModifyTarget({ position:p, isPending:true })}/>}
      {tab === 'ACCT'  && <Account openPositions={liveOrders.length} onNavigate={setTab}/>}
      {modifyTarget && <ModifySheet
        position={modifyTarget.position}
        isPending={modifyTarget.isPending}
        market={market}
        onSave={modifyTarget.isPending ? modifyPending : modifyPosition}
        onClose={()=>setModifyTarget(null)}
      />}
      <BottomNav tab={tab} setTab={setTab}/>
      <AccountSheet
        open={acctSheet}
        current={account}
        onPick={setAccount}
        onClose={()=>setAcctSheet(false)}
      />
      {notifOpen && <NotificationSheet notifications={notifications} setNotifications={setNotifications} onClose={()=>setNotifOpen(false)}/>}
      {menuOpen && <AppMenu indicators={indicators} setIndicators={setIndicators} liveOrders={liveOrders} closedHistory={closedHistory} onClose={()=>setMenuOpen(false)}/>}

      {/* Trade toast — appears on order placement */}
      {toast && (
        <div style={{
          position:'absolute', top:96, left:14, right:14, zIndex:500,
          background:'var(--ink)', color:'var(--ink-fg)', borderRadius:11, padding:'12px 14px',
          boxShadow:'var(--shadow-lg)', display:'flex', alignItems:'center', gap:10,
          animation:'tIn 0.3s cubic-bezier(0.2,0.8,0.2,1)',
          borderLeft:'4px solid ' + (toast.pending ? 'var(--warn)' : (toast.side==='BUY' ? 'var(--buy-bright)' : 'var(--sell-bright)'))
        }}>
          <div style={{
            width:32, height:32, borderRadius:16,
            background: toast.pending ? 'rgba(229,139,30,0.18)' : (toast.side==='BUY' ? 'var(--buy-glow)' : 'var(--sell-glow)'),
            color:    toast.pending ? 'var(--warn)' : (toast.side==='BUY' ? 'var(--buy-bright)' : 'var(--sell-bright)'),
            display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0
          }}>
            <Mi name={toast.pending ? 'hourglass_empty' : toast.triggered ? 'bolt' : (toast.side==='BUY'?'trending_up':'trending_down')} size={18} fill/>
          </div>
          <div style={{flex:1}}>
            <div style={{fontSize:13, fontWeight:700, letterSpacing:0.2}}>
              {toast.pending
                ? `${toast.otype} Order Pending · ${toast.side} ${toast.vol.toFixed(2)} ${toast.sym}`
                : toast.triggered
                  ? `Triggered · ${toast.side} ${toast.vol.toFixed(2)} ${toast.sym}`
                  : `Order Filled · ${toast.side} ${toast.vol.toFixed(2)} ${toast.sym}`}
            </div>
            <div className="mono" style={{fontSize:10.5, color:'rgba(255,255,255,0.55)', marginTop:2}}>
              {toast.pending ? 'Trigger @ ' : '@ '}{toast.price.toFixed(5).replace(/\.?0+$/, p => p === '.' ? '' : p)}
            </div>
          </div>
          <button onClick={()=>setToast(null)} style={{color:'rgba(255,255,255,0.5)'}}>
            <Mi name="close" size={16}/>
          </button>
          <style>{`@keyframes tIn { from{transform:translateY(-20px);opacity:0} to{transform:translateY(0);opacity:1} }`}</style>
        </div>
      )}

      <TweaksPanel title="Tweaks">
        <TweakSection label="Accent Color">
          <TweakColor
            label="Accent"
            value={tweaks.accent}
            onChange={v => setTweak('accent', v)}
            options={['#1565C0', '#0EA5E9', '#22B8CF', '#10B981', '#8B5CF6']}
          />
        </TweakSection>
        <TweakSection label="Layout Density">
          <TweakRadio
            label="Density"
            value={tweaks.density}
            onChange={v => setTweak('density', v)}
            options={[{value:'compact', label:'Compact'}, {value:'cozy', label:'Cozy'}]}
          />
        </TweakSection>
        <TweakSection label="Indicators">
          <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:6}}>
            {[['ma','MA(20)'],['vol','Volume'],['bb','Bollinger'],['rsi','RSI'],['macd','MACD']].map(([k,l]) => (
              <button key={k}
                onClick={()=>setIndicators({...indicators, [k]: !indicators[k]})}
                style={{
                  padding:'7px 10px', borderRadius:7, fontSize:11.5, fontWeight:600,
                  background: indicators[k]?'#0A0E1A':'#F4F6FA',
                  color:    indicators[k]?'#fff':'#5A6478',
                  textAlign:'left'
                }}>
                {indicators[k]?'● ':'○ '}{l}
              </button>
            ))}
          </div>
        </TweakSection>
      </TweaksPanel>
    </div>
  );
}

// Mount
function Root() {
  return (
    <div style={{
      minHeight:'100vh', width:'100%', display:'flex', alignItems:'center',
      justifyContent:'center', padding:'24px 0', background:'#E5E7EB'
    }}>
      <IOSDevice width={402} height={874}>
        <App/>
      </IOSDevice>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<Root/>);
