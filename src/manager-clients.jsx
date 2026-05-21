// ALPEXA Manager — Clients screen
const { useState, useMemo } = React;

const CLIENT_COLS = [
  { key:'dot',     width:20,  label:'',           resizable:false, min:20, align:'center'  },
  { key:'account', width:110, label:'Account #',  min:80,  align:'center' },
  { key:'opened',  width:130, label:'Date / Time',min:110, align:'center' },
  { key:'client',  width:180, label:'Name',     min:120, align:'center' },
  { key:'balance', width:110, label:'Balance',    min:80,  align:'center' },
  { key:'equity',  width:110, label:'Equity',     min:80,  align:'center' },
  { key:'kyc',     width:80,  label:'KYC',        min:60,  align:'center' },
  { key:'status',  width:80,  label:'Status',     min:60,  align:'center' },
  { key:'email',   width:200, label:'Email',      min:120, align:'center' },
];

function loadColWidths(key, defaults) {
  try {
    const raw = localStorage.getItem(key);
    if (raw) return { ...defaults, ...JSON.parse(raw) };
  } catch (e) {}
  return { ...defaults };
}

function ClientsScreen({ onSelect, server = 'LIVE', filter: extFilter, setFilter: extSetFilter, search: extSearch, setSearch: extSetSearch }) {
  const [localSearch, setLocalSearch] = useState('');
  const search = extSearch !== undefined ? extSearch : localSearch;
  const setSearch = extSetSearch || setLocalSearch;
  const [localFilter, setLocalFilter] = useState('all');
  const filter = extFilter !== undefined ? extFilter : localFilter;
  const setFilter = extSetFilter || setLocalFilter;
  const [selectedId, setSelectedId] = useState(null);
  const [detailId, setDetailId] = useState(null);

  // Column widths — load from localStorage, persist on resize
  const defaultWidths = Object.fromEntries(CLIENT_COLS.map(c => [c.key, c.width]));
  const [colWidths, setColWidths] = useState(() => loadColWidths('alpexa.mgr.clientCols', defaultWidths));
  function setWidth(key, w) {
    setColWidths(prev => {
      const next = { ...prev, [key]: w };
      try { localStorage.setItem('alpexa.mgr.clientCols', JSON.stringify(next)); } catch (e) {}
      return next;
    });
  }
  function resetCols() {
    try { localStorage.removeItem('alpexa.mgr.clientCols'); } catch (e) {}
    setColWidths(defaultWidths);
  }
  const gridTemplate = CLIENT_COLS.map(c => `${colWidths[c.key] || c.width}px`).join(' ');

  const filtered = useMemo(() => {
    let list = MANAGER.CLIENTS;
    if (filter === 'online')      list = list.filter(c => c.online);
    if (filter === 'pending_kyc') list = list.filter(c => c.kyc === 'pending');
    if (filter === 'blocked')     list = list.filter(c => c.status === 'blocked');
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(c =>
        c.firstName.toLowerCase().includes(q) ||
        c.lastName.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q) ||
        c.id.toLowerCase().includes(q)
      );
    }
    return list;
  }, [search, filter]);

  const onlineCount = MANAGER.CLIENTS.filter(c => c.online).length;
  const pendingKycCount = MANAGER.CLIENTS.filter(c => c.kyc === 'pending').length;

  return (
    <div style={{display:'flex', flexDirection:'column', flex:1, minHeight:0}}>
      {/* Sub-toolbar — actions */}
      <div style={{
        display:'flex', alignItems:'center', gap:10, padding:'10px 14px', height:50,
        background:'var(--surface)', borderBottom:'1px solid var(--line)', flexShrink:0
      }}>
        {filter !== 'all' && (
          <span style={{
            fontSize:10, fontWeight:700, padding:'2px 7px', borderRadius:10,
            background:'var(--bg)', color:'var(--text-2)', display:'inline-flex', alignItems:'center', gap:4
          }}>
            {filter === 'pending_kyc' ? 'Pending KYC' : filter === 'blocked' ? 'Blocked' : 'Online'}
            <button onClick={()=>setFilter('all')} title="Clear filter" style={{
              background:'transparent', border:'none', cursor:'pointer', padding:0, color:'var(--text-3)',
              display:'flex', alignItems:'center'
            }}>
              <span style={{fontFamily:'Material Symbols Outlined', fontSize:13}}>close</span>
            </button>
          </span>
        )}
        <span style={{flex:1}}/>
        <span style={{fontSize:10.5, color:'var(--text-3)'}}>
          Sort: <span style={{color:'var(--ink)', fontWeight:600}}>Account # (asc)</span>
        </span>
        <SubToolbarBtn icon="sort" title="Sort"/>
        <SubToolbarBtn icon="filter_alt" title="Advanced filters"/>
        <SubToolbarBtn icon="refresh" title="Refresh"/>
        <SubToolbarBtn icon="file_download" title="Export CSV"/>
        <SubToolbarBtn icon="view_column" title="Column settings"/>
      </div>

      {/* Spacer to align table header with quotes panel column header */}
      <div style={{height:35, background:'var(--surface)', borderBottom:'1px solid var(--line)', flexShrink:0}}/>

      {/* Table */}
      <div style={{flex:1, overflowY:'scroll', minHeight:0, background:'var(--surface)'}}
        className="mgr-table-scroll">
        <div className="mgr-excel-table" style={{
          background:'var(--surface)', overflow:'hidden'
        }}>
          {/* Header row */}
          {/* Header row */}
          <div style={{
            display:'grid', gridTemplateColumns: gridTemplate,
            padding:'10px 0', background:'#FAF8F2', borderBottom:'1px solid var(--line)',
            fontSize:9.5, fontWeight:700, color:'var(--text-3)', letterSpacing:0.5, textTransform:'uppercase',
            alignItems:'center', position:'sticky', top:0, zIndex:5
          }}>
            {CLIENT_COLS.map((col, i) => (
              <ColHeader key={col.key} col={col} currentWidth={colWidths[col.key] || col.width} setWidth={setWidth} onReset={resetCols} isLast={i === CLIENT_COLS.length - 1}/>
            ))}
          </div>

          {filtered.length === 0 ? (
            <div style={{padding:'40px 16px', textAlign:'center', color:'var(--text-3)', fontSize:13}}>
              No clients match your filter.
            </div>
          ) : filtered.map(c => {
            const allAccts = MANAGER.findAccounts(c.id);
            const accts = allAccts.filter(a => a.tag === server);
            if (accts.length === 0) return null;
            const balanceUsd = accts.reduce((s, a) => s + (a.balance || 0) * usdRate(a.currency), 0);
            const equityUsd  = accts.reduce((s, a) => s + (a.equity  || 0) * usdRate(a.currency), 0);
            const pnl = equityUsd - balanceUsd;
            return (
            <div key={c.id} onClick={()=>{setSelectedId(c.id); setDetailId(c.id); if (onSelect) onSelect(c.id);}} style={{
              display:'grid', gridTemplateColumns: gridTemplate,
              padding:'0', borderBottom:'1px solid var(--line)', cursor:'pointer',
              alignItems:'center', fontSize:13,
              background: selectedId === c.id ? 'var(--acc-3)' : 'transparent'
            }}
            onMouseEnter={(e)=>{ if (selectedId !== c.id) e.currentTarget.style.background = 'var(--bg)'; }}
            onMouseLeave={(e)=>{ if (selectedId !== c.id) e.currentTarget.style.background = 'transparent'; }}>
              {/* Online indicator */}
              <div title={c.online ? `Online · ${c.sessionDevice}` : `Last seen ${MANAGER.timeAgo(c.lastSeen)}`} style={{display:'flex', alignItems:'center', justifyContent:'center'}}>
                {c.online ? (
                  <span style={{
                    width:8, height:8, borderRadius:'50%', background:'#22C55E',
                    boxShadow:'0 0 0 0 rgba(34,197,94,0.5)',
                    animation:'mgrPulse 1.8s infinite', display:'inline-block'
                  }}/>
                ) : (
                  <span style={{width:8, height:8, borderRadius:'50%', background:'var(--muted)', display:'inline-block'}}/>
                )}
              </div>
              {/* Account numbers */}
              <div className="mono" style={{fontSize:11, color:'var(--text-2)', lineHeight:1.3, display:'flex', flexDirection:'row', alignItems:'center', gap:8, flexWrap:'wrap'}}>
                {accts.map(a => (
                  <span key={a.id}>#{a.accountNo || a.id.slice(1).toUpperCase()}</span>
                ))}
              </div>
              {/* Opened date */}
              <div className="mono" style={{fontSize:11, color:'var(--text-2)', lineHeight:1.3, display:'flex', flexDirection:'column', alignItems:'center'}}>
                {(() => {
                  const dates = accts.map(a => a.created).filter(Boolean).sort();
                  const earliest = dates[0] || c.joined;
                  const parts = earliest.split(' ');
                  return (
                    <>
                      <span style={{fontSize:11}}>{parts[0]}</span>
                      {parts[1] && <span style={{fontSize:9.5, color:'var(--text-3)', marginTop:1}}>{parts[1]}</span>}
                    </>
                  );
                })()}
              </div>
              {/* Name */}
              <div style={{display:'flex', flexDirection:'column', gap:1, alignItems:'center'}}>
                <span style={{color:'var(--ink)'}}>{c.firstName} {c.lastName}</span>
              </div>
              {/* Balance USD */}
              <span className="mono" style={{color:'var(--ink)'}}>
                ${MANAGER.fmt(balanceUsd, 0)}
              </span>
              {/* Equity USD */}
              <span className="mono" style={{color:'var(--ink)'}}>
                ${MANAGER.fmt(equityUsd, 0)}
              </span>
              {/* KYC */}
              <div><KycBadge state={c.kyc}/></div>
              {/* Status */}
              <div><StatusBadge state={c.status}/></div>
              {/* Email */}
              <span style={{color:'var(--text-2)', fontSize:12}}>{c.email}</span>
            </div>
            );
          })}
        </div>
      </div>

      <style>{`@keyframes mgrPulse { 0%,100%{box-shadow:0 0 0 0 rgba(34,197,94,0.5)} 70%{box-shadow:0 0 0 5px rgba(34,197,94,0)} }
        .mgr-table-scroll {
          scrollbar-gutter: stable;
          scrollbar-width: thin;
          scrollbar-color: #B0B7C3 #FAF8F2;
        }
        .mgr-table-scroll::-webkit-scrollbar { width: 16px; height: 14px; }
        .mgr-table-scroll::-webkit-scrollbar-track { background: #FAF8F2; border-left: 1px solid var(--line); }
        .mgr-table-scroll::-webkit-scrollbar-thumb { background: #9CA3AF; border-radius: 8px; border: 3px solid #FAF8F2; min-height: 50px; }
        .mgr-table-scroll::-webkit-scrollbar-thumb:hover { background: #4B5563; }
        .mgr-table-scroll::-webkit-scrollbar-thumb:active { background: var(--text-2); }
        .mgr-table-scroll::-webkit-scrollbar-corner { background: #FAF8F2; }
        .mgr-drawer-scroll::-webkit-scrollbar { width: 8px; }
        .mgr-drawer-scroll::-webkit-scrollbar-track { background: var(--surface); }
        .mgr-drawer-scroll::-webkit-scrollbar-thumb { background: #D1D5DB; border-radius: 4px; border: 2px solid var(--surface); min-height: 30px; }
        .mgr-drawer-scroll::-webkit-scrollbar-thumb:hover { background: #9CA3AF; }
        .mgr-excel-table > div { padding: 0 !important; }
        .mgr-excel-table > div > * {
          padding: 7px 10px;
          border-right: 1px solid var(--line);
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          box-sizing: border-box;
          text-align: center;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .mgr-excel-table > div > *:last-child { border-right: none; }
        .mgr-excel-table > div:nth-child(odd):not(:first-child) { background: #FCFCFD; }
        .mgr-excel-table > div:first-child > * { padding: 8px 10px; position: relative; }
        .mgr-col-resize {
          position: absolute; top: 0; right: -3px; bottom: 0; width: 6px;
          cursor: col-resize; user-select: none; z-index: 10;
          display: flex; align-items: center; justify-content: center;
        }
        .mgr-col-resize:hover::before, .mgr-col-resize.dragging::before {
          content:''; position:absolute; top:0; bottom:0; left:2px; right:2px; background: var(--acc); border-radius:1px;
        }
      `}</style>
      {detailId && <ClientDetailDrawer clientId={detailId} onClose={()=>setDetailId(null)}/>}
    </div>
  );
}

function ClientDetailDrawer({ clientId, onClose }) {
  const c = MANAGER.findClient(clientId);
  if (!c) return null;
  const initAccts = MANAGER.findAccounts(clientId);
  const initPositions = MANAGER.findPositions(clientId);
  const [accts, setAccts] = useState(initAccts);
  const [positions, setPositions] = useState(initPositions);
  const [client, setClient] = useState(c);
  const totalEquity = accts.reduce((s, a) => s + (Number(a.equity) || 0) * usdRate(a.currency), 0);
  const totalBalance = accts.reduce((s, a) => s + (Number(a.balance) || 0) * usdRate(a.currency), 0);
  const totalPnl = positions.reduce((s, p) => s + (Number(p.pnl) || 0), 0);
  const totalMargin = accts.reduce((s, a) => s + (Number(a.margin) || 0) * usdRate(a.currency), 0);
  const marginLevel = totalMargin > 0 ? (totalEquity / totalMargin) * 100 : Infinity;
  const [action, setAction] = useState(null);
  const [edited, setEdited] = useState(false);

  function updateClient(key, val) {
    setClient(prev => ({ ...prev, [key]: val }));
    setEdited(true);
  }
  function updateAcct(id, key, val) {
    setAccts(prev => prev.map(a => a.id === id ? { ...a, [key]: val } : a));
    setEdited(true);
  }
  function updatePos(id, key, val) {
    setPositions(prev => prev.map(p => p.id === id ? { ...p, [key]: val } : p));
    setEdited(true);
  }
  function saveAll() {
    // Persist client changes
    const cidx = MANAGER.CLIENTS.findIndex(x => x.id === client.id);
    if (cidx >= 0) MANAGER.CLIENTS[cidx] = { ...client };
    accts.forEach(a => {
      const idx = MANAGER.ACCOUNTS.findIndex(x => x.id === a.id);
      if (idx >= 0) MANAGER.ACCOUNTS[idx] = { ...a };
    });
    positions.forEach(p => {
      const idx = MANAGER.POSITIONS.findIndex(x => x.id === p.id);
      if (idx >= 0) MANAGER.POSITIONS[idx] = { ...p };
    });
    setEdited(false);
    onClose();
  }

  return (
    <div onClick={onClose} style={{
      position:'fixed', inset:0, background:'rgba(15,23,41,0.5)', zIndex:150,
      display:'flex', alignItems:'center', justifyContent:'center', padding:20
    }}>
      <div onClick={e=>e.stopPropagation()} className="mgr-drawer-scroll" style={{
        width:720, maxWidth:'92vw', maxHeight:'92vh', background:'var(--surface)', overflowY:'scroll',
        boxShadow:'0 24px 60px rgba(15,23,41,0.30)', borderRadius:12,
        animation:'mgrFadeIn 0.18s ease'
      }}>
        {/* Header */}
        {/* Header */}
        <div style={{padding:'18px 22px 16px', borderBottom:'1px solid var(--line)'}}>
          <div style={{display:'flex', alignItems:'center', gap:12, marginBottom:10}}>
            <div style={{
              width:44, height:44, borderRadius:22,
              background: client.online ? '#15A36C' : 'var(--bg-2)', color: client.online ? '#fff' : 'var(--text-2)',
              display:'flex', alignItems:'center', justifyContent:'center',
              fontSize:14, fontWeight:800, letterSpacing:0.5, flexShrink:0
            }}>
              {client.firstName[0]}{client.lastName[0]}
            </div>
            <div style={{flex:1, minWidth:0}}>
              <div style={{display:'flex', alignItems:'center', gap:6}}>
                <EditableText value={client.firstName} onChange={v=>updateClient('firstName', v)} bold color="var(--ink)"/>
                <EditableText value={client.lastName}  onChange={v=>updateClient('lastName', v)}  bold color="var(--ink)"/>
                {client.online && <span style={{width:7, height:7, borderRadius:'50%', background:'#22C55E', display:'inline-block', animation:'mgrPulse 1.8s infinite'}}/>}
              </div>
              <div style={{fontSize:11, color:'var(--text-3)', marginTop:2, display:'flex', alignItems:'center', gap:4, flexWrap:'wrap'}}>
                <EditableText value={client.country} onChange={v=>updateClient('country', v.toUpperCase())} color="var(--text-3)"/>
                <span>·</span>
                <span>Joined</span>
                <EditableText value={client.joined} onChange={v=>updateClient('joined', v)} color="var(--text-3)"/>
                <span>·</span>
                <EditableText value={client.sessionDevice} onChange={v=>updateClient('sessionDevice', v)} color="var(--text-3)"/>
              </div>
            </div>
            <button onClick={onClose} style={{
              width:28, height:28, borderRadius:14, background:'var(--bg)', border:'none', cursor:'pointer',
              display:'flex', alignItems:'center', justifyContent:'center', color:'var(--text-2)'
            }}>
              <span style={{fontFamily:'Material Symbols Outlined', fontSize:16}}>close</span>
            </button>
          </div>
          <div style={{display:'flex', alignItems:'center', gap:8, fontSize:11.5, color:'var(--text-2)', flexWrap:'wrap'}}>
            <EditableSelect
              value={client.kyc}
              options={[{value:'verified', label:'Verified'},{value:'pending', label:'Pending'},{value:'rejected', label:'Rejected'}]}
              onChange={v=>updateClient('kyc', v)}
              color="var(--ink)"
            />
            <EditableSelect
              value={client.status}
              options={[{value:'active', label:'Active'},{value:'limited', label:'Limited'},{value:'blocked', label:'Blocked'}]}
              onChange={v=>updateClient('status', v)}
              color="var(--ink)"
            />
            <span style={{color:'var(--text-3)', margin:'0 2px'}}>·</span>
            <span style={{display:'flex', alignItems:'center', gap:4}}>
              <span style={{fontFamily:'Material Symbols Outlined', fontSize:13, color:'var(--text-3)'}}>mail</span>
              <EditableText value={client.email} onChange={v=>updateClient('email', v)} color="var(--text-2)"/>
            </span>
            <span style={{display:'flex', alignItems:'center', gap:4}}>
              <span style={{fontFamily:'Material Symbols Outlined', fontSize:13, color:'var(--text-3)'}}>call</span>
              <EditableText value={client.phone} onChange={v=>updateClient('phone', v)} color="var(--text-2)"/>
            </span>
          </div>
        </div>

        {/* KPIs */}
        <div style={{display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr', borderBottom:'1px solid var(--line)'}}>
          <DetailKpi lbl="Balance"  val={`$${MANAGER.fmt(totalBalance, 0)}`}/>
          <DetailKpi lbl="Equity"   val={`$${MANAGER.fmt(totalEquity, 0)}`}/>
          <DetailKpi lbl="Open P/L" val={`${totalPnl>=0?'+':''}$${MANAGER.fmt(totalPnl, 0)}`} color={totalPnl>0?'#15A36C':totalPnl<0?'#EF4444':'var(--ink)'}/>
          <DetailKpi lbl="Margin"   val={marginLevel === Infinity ? '—' : `${marginLevel > 9999 ? '∞' : marginLevel.toFixed(0)}%`} color={marginLevel < 100 ? '#F59E0B' : 'var(--ink)'}/>
        </div>

        {/* Accounts */}
        <DetailSection title="Accounts" count={accts.length}>
          <div style={{display:'grid', gridTemplateColumns:'90px 60px 1fr 1fr 60px 70px', padding:'7px 22px', fontSize:9.5, fontWeight:700, color:'var(--text-3)', letterSpacing:0.5, textTransform:'uppercase', background:'#FAF8F2', borderTop:'1px solid var(--line)', borderBottom:'1px solid var(--line)', gap:8}}>
            <span>Account</span>
            <span>Type</span>
            <span style={{textAlign:'right'}}>Balance</span>
            <span style={{textAlign:'right'}}>Equity</span>
            <span style={{textAlign:'right'}}>Lev.</span>
            <span style={{textAlign:'right'}}>Group</span>
          </div>
          {accts.map(a => (
            <div key={a.id} style={{display:'grid', gridTemplateColumns:'90px 60px 1fr 1fr 60px 70px', alignItems:'center', padding:'9px 22px', borderBottom:'1px solid var(--line)', fontSize:12, gap:8}}>
              <div style={{display:'flex', flexDirection:'column', lineHeight:1.3, alignItems:'center', gap:2}}>
                <EditableText
                  value={'#' + (a.accountNo || a.id.toUpperCase())}
                  onChange={v=>updateAcct(a.id, 'accountNo', v.replace(/^#/, ''))}
                  bold
                  color="var(--ink)"
                />
                <EditableText
                  value={a.created}
                  onChange={v=>updateAcct(a.id, 'created', v)}
                  color="var(--text-3)"
                />
              </div>
              <EditableSelect
                value={a.tag}
                options={[{value:'LIVE', label:'LIVE'},{value:'CRYPTO', label:'CRYPTO'},{value:'SPORTS', label:'SPORTS'}]}
                onChange={v=>updateAcct(a.id, 'tag', v)}
              />
              <EditableNumber
                value={a.balance}
                prefix={a.currency + ' '}
                decimals={a.currency==='JPY'?0:2}
                onChange={v=>updateAcct(a.id, 'balance', v)}
                align="right"
                color="var(--ink)"
                bold
              />
              <EditableNumber
                value={a.equity}
                prefix={a.currency + ' '}
                decimals={a.currency==='JPY'?0:2}
                onChange={v=>updateAcct(a.id, 'equity', v)}
                align="right"
                color={a.equity > a.balance ? '#15A36C' : a.equity < a.balance ? '#EF4444' : 'var(--ink)'}
                bold
              />
              <EditableNumber
                value={a.leverage}
                prefix="1:"
                decimals={0}
                onChange={v=>updateAcct(a.id, 'leverage', Math.round(v))}
                align="right"
                color="var(--text-2)"
              />
              <EditableSelect
                value={a.group}
                options={[{value:'Standard', label:'Standard'},{value:'Pro', label:'Pro'},{value:'VIP', label:'VIP'}]}
                onChange={v=>updateAcct(a.id, 'group', v)}
                color={a.group==='VIP'?'#7C3AED':a.group==='Pro'?'#0EA5E9':'var(--text-2)'}
                align="right"
              />
            </div>
          ))}
        </DetailSection>

        {/* Open positions */}
        <DetailSection title="Open Positions" count={positions.length}>
          {positions.length === 0 ? (
            <div style={{padding:'20px 22px', textAlign:'center', color:'var(--text-3)', fontSize:12}}>
              No open positions.
            </div>
          ) : (
            <OpenPositionsTable positions={positions} updatePos={updatePos}/>
          )}
        </DetailSection>

        {/* Actions */}
        <div style={{padding:'16px 22px 20px', display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr 1fr', gap:6}}>
          <DrawerActionBtn icon="tune"           label="Adjust"  onClick={()=>setAction('adjust')}/>
          <DrawerActionBtn icon="verified_user"  label="KYC"     onClick={()=>setAction('kyc')}/>
          <DrawerActionBtn icon="mail"           label="Message" onClick={()=>setAction('message')}/>
          <DrawerActionBtn icon="block"          label={client.status === 'blocked' ? 'Unblock' : 'Block'} onClick={()=>setAction('block')} danger/>
          <DrawerActionBtn icon="save"           label={edited ? 'Save *' : 'Save'} onClick={saveAll} highlight={edited}/>
        </div>

        <style>{`@keyframes mgrFadeIn { from{opacity:0; transform:scale(0.96)} to{opacity:1; transform:scale(1)} }`}</style>

        {action === 'adjust'  && <AdjustBalanceModal client={client} accounts={accts} onClose={()=>setAction(null)}/>}
        {action === 'kyc'     && <ManageKycModal client={client} onClose={()=>setAction(null)}/>}
        {action === 'message' && <SendMessageModal client={client} onClose={()=>setAction(null)}/>}
        {action === 'block'   && <BlockAccountModal client={client} onClose={()=>setAction(null)}/>}

        <style>{`@keyframes mgrSlideIn { from{transform:translateX(100%)} to{transform:translateX(0)} }`}</style>
      </div>
    </div>
  );
}

function DetailKpi({ lbl, val, color, editable, rawValue, onEdit, prefix }) {
  const [editing, setEditing] = useState(false);
  const [tmp, setTmp] = useState(String(rawValue || 0));
  React.useEffect(() => setTmp(String(rawValue || 0)), [rawValue]);
  function commit() {
    setEditing(false);
    const n = parseFloat(tmp);
    if (!isNaN(n) && onEdit) onEdit(n);
  }
  return (
    <div style={{padding:'14px 16px', background:'var(--surface)', borderRight:'1px solid var(--line)'}}>
      <div style={{fontSize:9, fontWeight:700, color:'var(--text-3)', letterSpacing:0.5, textTransform:'uppercase'}}>{lbl}</div>
      {editable && editing ? (
        <input type="number" value={tmp} onChange={e=>setTmp(e.target.value)} autoFocus onBlur={commit}
          onKeyDown={e=>{ if (e.key==='Enter') commit(); if (e.key==='Escape') setEditing(false); }}
          className="mono"
          style={{fontSize:17, fontWeight:700, color: color || 'var(--ink)', marginTop:5, letterSpacing:-0.2, background:'#FFF8E1', border:'1px solid #F59E0B', borderRadius:4, padding:'2px 5px', outline:'none', width:'100%', fontFamily:'inherit'}}/>
      ) : (
        <div
          onClick={editable ? ()=>setEditing(true) : undefined}
          className="mono"
          style={{fontSize:17, fontWeight:700, color: color || 'var(--ink)', marginTop:5, letterSpacing:-0.2, cursor: editable ? 'pointer' : 'default', padding: editable ? '2px 5px' : 0, marginLeft: editable ? -5 : 0, borderRadius:4}}
          onMouseEnter={editable ? (e)=>{e.currentTarget.style.background='#FAF8F2';} : undefined}
          onMouseLeave={editable ? (e)=>{e.currentTarget.style.background='transparent';} : undefined}>
          {val}
        </div>
      )}
    </div>
  );
}

function DrawerActionBtn({ icon, label, onClick, danger, highlight }) {
  return (
    <button onClick={onClick} style={{
      display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:3,
      padding:'10px 4px', borderRadius:8,
      background: highlight ? 'var(--ink)' : danger ? '#FEF2F2' : 'var(--bg)',
      color: highlight ? 'var(--ink-fg)' : danger ? '#B91C1C' : 'var(--text-2)',
      border:'none', cursor:'pointer', fontSize:10.5, fontWeight:600
    }}>
      <span style={{fontFamily:'Material Symbols Outlined', fontSize:18}}>{icon}</span>
      {label}
    </button>
  );
}

// ── Inline editable controls ──
function EditableText({ value, onChange, color, bold, align = 'left' }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(value);
  React.useEffect(() => setVal(value), [value]);
  function commit() { setEditing(false); if (val !== value) onChange(val); }
  return editing ? (
    <input value={val} onChange={e=>setVal(e.target.value)} autoFocus onBlur={commit}
      onKeyDown={e=>{ if (e.key==='Enter') commit(); if (e.key==='Escape') { setVal(value); setEditing(false); } }}
      style={{fontWeight: bold?700:500, color: color || 'var(--ink)', textAlign: align, background:'#FFF8E1', border:'1px solid #F59E0B', borderRadius:3, padding:'2px 5px', fontSize:'inherit', fontFamily:'inherit', width:'100%', outline:'none'}}/>
  ) : (
    <span onClick={()=>setEditing(true)}
      style={{fontWeight: bold?700:500, color: color || 'var(--ink)', textAlign: align, cursor:'pointer', padding:'2px 4px', borderRadius:3}}
      onMouseEnter={(e)=>{e.currentTarget.style.background='#FAF8F2';}}
      onMouseLeave={(e)=>{e.currentTarget.style.background='transparent';}}>
      {value}
    </span>
  );
}

function EditableNumber({ value, onChange, color, bold, align = 'left', prefix = '', decimals = 2 }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(String(value));
  React.useEffect(() => setVal(String(value)), [value]);
  function commit() {
    setEditing(false);
    const n = parseFloat(val);
    if (!isNaN(n) && n !== value) onChange(n);
    else setVal(String(value));
  }
  const display = `${prefix}${MANAGER.fmt(Math.abs(value), decimals)}`;
  return editing ? (
    <input type="number" value={val} onChange={e=>setVal(e.target.value)} autoFocus onBlur={commit}
      onKeyDown={e=>{ if (e.key==='Enter') commit(); if (e.key==='Escape') { setVal(String(value)); setEditing(false); } }}
      className="mono"
      style={{fontWeight: bold?700:500, color: color || 'var(--ink)', textAlign: align, background:'#FFF8E1', border:'1px solid #F59E0B', borderRadius:3, padding:'2px 5px', fontSize:'inherit', fontFamily:'inherit', width:'100%', outline:'none'}}/>
  ) : (
    <span onClick={()=>setEditing(true)} className="mono"
      style={{fontWeight: bold?700:500, color: color || 'var(--ink)', textAlign: align, cursor:'pointer', padding:'2px 4px', borderRadius:3, display:'block'}}
      onMouseEnter={(e)=>{e.currentTarget.style.background='#FAF8F2';}}
      onMouseLeave={(e)=>{e.currentTarget.style.background='transparent';}}>
      {display}
    </span>
  );
}

function EditableSelect({ value, options, onChange, color, align = 'left' }) {
  return (
    <select value={value} onChange={e=>onChange(e.target.value)}
      style={{
        fontSize:11, fontWeight:700, color: color || 'var(--text-2)',
        background:'transparent', border:'1px solid transparent', borderRadius:3,
        padding:'2px 4px', cursor:'pointer', outline:'none', textAlign: align,
        fontFamily:'inherit', appearance:'none', justifySelf: align === 'right' ? 'flex-end' : 'flex-start'
      }}
      onMouseEnter={(e)=>{e.currentTarget.style.borderColor='#F59E0B'; e.currentTarget.style.background='#FFF8E1';}}
      onMouseLeave={(e)=>{e.currentTarget.style.borderColor='transparent'; e.currentTarget.style.background='transparent';}}>
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

function OpenPositionsTable({ positions, updatePos }) {
  const [search, setSearch] = useState('');
  const [sideFilter, setSideFilter] = useState('all');

  const filtered = positions.filter(p => {
    if (sideFilter !== 'all' && p.side !== sideFilter) return false;
    if (search && !p.sym.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <>
      <div style={{display:'flex', alignItems:'center', gap:6, padding:'7px 22px', borderTop:'1px solid var(--line)', background:'var(--surface)'}}>
        <div style={{display:'flex', alignItems:'center', gap:5, padding:'4px 9px', background:'var(--bg)', borderRadius:5, border:'1px solid var(--line-2)', flex:1, maxWidth:220, height:26}}>
          <span style={{fontFamily:'Material Symbols Outlined', fontSize:13, color:'var(--text-3)'}}>search</span>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search symbol…"
            style={{flex:1, fontSize:11, color:'var(--ink)', background:'transparent', outline:'none', border:'none', minWidth:0}}/>
        </div>
        <button onClick={()=>setSideFilter(sideFilter==='all'?'BUY':sideFilter==='BUY'?'SELL':'all')} style={{
          padding:'4px 9px', borderRadius:5, fontSize:10, fontWeight:700,
          background: sideFilter==='BUY' ? '#ECFDF5' : sideFilter==='SELL' ? '#FEF2F2' : 'var(--bg)',
          color: sideFilter==='BUY' ? '#15803D' : sideFilter==='SELL' ? '#B91C1C' : 'var(--text-2)',
          border:'1px solid ' + (sideFilter==='BUY' ? '#86EFAC' : sideFilter==='SELL' ? '#FCA5A5' : 'var(--line-2)'),
          cursor:'pointer', height:26
        }}>{sideFilter === 'all' ? 'ALL SIDES' : sideFilter}</button>
        <span style={{flex:1}}/>
        <span style={{fontSize:10, color:'var(--text-3)'}}>{filtered.length} of {positions.length}</span>
      </div>

      <div style={{display:'grid', gridTemplateColumns:'80px 60px 60px 1fr 1fr 90px', padding:'7px 22px', fontSize:9.5, fontWeight:700, color:'var(--text-3)', letterSpacing:0.5, textTransform:'uppercase', background:'#FAF8F2', borderTop:'1px solid var(--line)', borderBottom:'1px solid var(--line)', gap:8}}>
        <span>Symbol</span>
        <span>Side</span>
        <span style={{textAlign:'right'}}>Vol</span>
        <span style={{textAlign:'right'}}>Open</span>
        <span style={{textAlign:'right'}}>Current</span>
        <span style={{textAlign:'right'}}>P/L</span>
      </div>
      <div className="mgr-drawer-scroll" style={{maxHeight:200, overflowY:'scroll'}}>
        {filtered.length === 0 ? (
          <div style={{padding:'20px 22px', textAlign:'center', color:'var(--text-3)', fontSize:11}}>No positions match.</div>
        ) : filtered.map(p => (
          <div key={p.id} style={{display:'grid', gridTemplateColumns:'80px 60px 60px 1fr 1fr 90px', alignItems:'center', padding:'9px 22px', borderBottom:'1px solid var(--line)', fontSize:12, gap:8}}>
            <EditableText
              value={p.sym}
              onChange={v=>updatePos(p.id, 'sym', v.toUpperCase())}
              bold
              color="var(--ink)"
            />
            <EditableSelect
              value={p.side}
              options={[{value:'BUY', label:'BUY'},{value:'SELL', label:'SELL'}]}
              onChange={v=>updatePos(p.id, 'side', v)}
              color={p.side==='BUY' ? '#15803D' : '#B91C1C'}
            />
            <EditableNumber
              value={p.vol}
              decimals={2}
              onChange={v=>updatePos(p.id, 'vol', v)}
              align="right"
              color="var(--text-2)"
            />
            <EditableNumber
              value={p.open}
              decimals={5}
              onChange={v=>updatePos(p.id, 'open', v)}
              align="right"
              color="var(--text-2)"
            />
            <EditableNumber
              value={p.current}
              decimals={5}
              onChange={v=>updatePos(p.id, 'current', v)}
              align="right"
              color="var(--ink)"
              bold
            />
            <EditableNumber
              value={p.pnl}
              prefix={p.pnl >= 0 ? '+$' : '-$'}
              decimals={0}
              onChange={v=>updatePos(p.id, 'pnl', v)}
              align="right"
              color={p.pnl>0?'#15A36C':p.pnl<0?'#EF4444':'var(--text-3)'}
              bold
            />
          </div>
        ))}
      </div>
    </>
  );
}

function DetailSection({ title, count, children }) {
  return (
    <div>
      <div style={{display:'flex', alignItems:'center', gap:6, padding:'14px 22px 4px'}}>
        <span style={{fontSize:10, fontWeight:800, color:'var(--text-3)', letterSpacing:0.6, textTransform:'uppercase'}}>{title}</span>
        {count !== undefined && (
          <span className="mono" style={{
            fontSize:9, fontWeight:700, padding:'1px 5px', borderRadius:8,
            background:'var(--bg)', color:'var(--text-3)'
          }}>{count}</span>
        )}
      </div>
      {children}
    </div>
  );
}

function FilterChip({ active, onClick, label, count, dot }) {
  return (
    <button onClick={onClick} style={{
      display:'flex', alignItems:'center', gap:6, padding:'7px 12px', borderRadius:8,
      background: active ? 'var(--ink)' : 'var(--bg)',
      color:    active ? 'var(--ink-fg)' : 'var(--text-2)',
      fontSize:12, fontWeight:600, letterSpacing:0.2, cursor:'pointer',
      border: active ? '1px solid var(--ink)' : '1px solid var(--line-2)'
    }}>
      {dot && <span style={{width:7, height:7, borderRadius:'50%', background:dot}}/>}
      {label}
      <span className="mono" style={{
        fontSize:10, fontWeight:700, padding:'1px 5px', borderRadius:3,
        background: active ? 'rgba(255,255,255,0.18)' : 'var(--surface)',
        color: active ? 'var(--ink-fg)' : 'var(--text-3)'
      }}>{count}</span>
    </button>
  );
}

function KycBadge({ state }) {
  const styles = {
    verified: { bg:'#F0F2F5', col:'#1F2937', label:'Verified' },
    pending:  { bg:'#F0F2F5', col:'#6B7280', label:'Pending'  },
    rejected: { bg:'#E5E7EB', col:'#1F2937', label:'Rejected' },
  };
  const s = styles[state] || styles.pending;
  return (
    <span style={{
      fontSize:10, fontWeight:700, padding:'2px 6px', borderRadius:3, letterSpacing:0.3,
      background: s.bg, color: s.col
    }}>{s.label}</span>
  );
}
function StatusBadge({ state }) {
  const styles = {
    active:  { bg:'#F0F2F5', col:'#1F2937', label:'Active'  },
    limited: { bg:'#F0F2F5', col:'#6B7280', label:'Limited' },
    blocked: { bg:'#E5E7EB', col:'#1F2937', label:'Blocked' },
  };
  const s = styles[state] || styles.active;
  return (
    <span style={{
      fontSize:10, fontWeight:700, padding:'2px 6px', borderRadius:3, letterSpacing:0.3,
      background: s.bg, color: s.col
    }}>{s.label}</span>
  );
}
function RiskBadge({ state }) {
  const styles = {
    low:    { col:'#22C55E', label:'Low'    },
    medium: { col:'#F59E0B', label:'Medium' },
    high:   { col:'#EF4444', label:'High'   },
  };
  const s = styles[state] || styles.medium;
  return (
    <span style={{
      fontSize:10.5, fontWeight:700, color: s.col, display:'inline-flex', alignItems:'center', gap:4
    }}>
      <span style={{width:6, height:6, borderRadius:'50%', background:s.col}}/>
      {s.label}
    </span>
  );
}

function SubToolbarBtn({ icon, title, onClick }) {
  return (
    <button onClick={onClick} title={title} style={{
      width:26, height:26, borderRadius:5, background:'transparent',
      display:'flex', alignItems:'center', justifyContent:'center', color:'var(--text-2)',
      border:'none', cursor:'pointer'
    }}
    onMouseEnter={(e)=>{ e.currentTarget.style.background = 'var(--bg)'; }}
    onMouseLeave={(e)=>{ e.currentTarget.style.background = 'transparent'; }}>
      <span style={{fontFamily:'Material Symbols Outlined', fontSize:15}}>{icon}</span>
    </button>
  );
}

function SubChip({ icon, label, count, onClick, active }) {
  return (
    <button onClick={onClick} style={{
      display:'inline-flex', alignItems:'center', gap:4, padding:'3px 8px', borderRadius:11,
      background: active ? 'var(--ink)' : 'transparent',
      color:    active ? 'var(--ink-fg)' : 'var(--text-2)',
      border: active ? '1px solid var(--ink)' : '1px solid var(--line-2)',
      fontSize:10.5, fontWeight:600, cursor:'pointer', height:22
    }}>
      <span style={{fontFamily:'Material Symbols Outlined', fontSize:13}}>{icon}</span>
      {label}
      {count !== undefined && (
        <span className="mono" style={{
          fontSize:9, fontWeight:700, padding:'0 4px', borderRadius:6,
          background: active ? 'rgba(255,255,255,0.2)' : 'var(--bg)',
          color: active ? 'var(--ink-fg)' : 'var(--text-3)'
        }}>{count}</span>
      )}
    </button>
  );
}

function SummaryStat({ label, value, color }) {
  return (
    <div style={{display:'flex', alignItems:'baseline', gap:5}}>
      <span style={{fontSize:9.5, color:'var(--text-3)', fontWeight:700, letterSpacing:0.3, textTransform:'uppercase'}}>{label}</span>
      <span className="mono" style={{fontSize:11.5, fontWeight:700, color: color || 'var(--ink)'}}>{value}</span>
    </div>
  );
}

function PageHeader({ title, subtitle, actions }) {
  return (
    <div style={{
      padding:'12px 24px 10px', background:'var(--surface)',
      borderBottom:'1px solid var(--line)'
    }}>
      <div style={{display:'flex', alignItems:'center', gap:14}}>
        <div style={{flex:1, display:'flex', alignItems:'baseline', gap:10}}>
          <div style={{fontSize:15, fontWeight:700, color:'var(--ink)', letterSpacing:-0.1}}>{title}</div>
          {subtitle && <div style={{fontSize:11, color:'var(--text-3)'}}>{subtitle}</div>}
        </div>
        {actions}
      </div>
    </div>
  );
}

const btnPrimary = {
  display:'inline-flex', alignItems:'center', gap:6, padding:'8px 14px', borderRadius:8,
  background:'var(--acc)', color:'#fff', fontSize:12.5, fontWeight:700, letterSpacing:0.2,
  border:'none', cursor:'pointer'
};

function usdRate(currency) {
  const rates = { USD:1, EUR:1.08, GBP:1.26, JPY:0.0064, CHF:1.10, KRW:0.00073 };
  return rates[currency] || 1;
}

const btnGhost = {
  display:'inline-flex', alignItems:'center', gap:6, padding:'8px 12px', borderRadius:8,
  background:'var(--bg)', color:'var(--text-2)', fontSize:12.5, fontWeight:600, letterSpacing:0.2,
  border:'1px solid var(--line-2)', cursor:'pointer'
};

// ── Modal wrapper ──
function MgrModal({ title, subtitle, icon, iconColor, children, onClose, footer, width = 460 }) {
  return (
    <div onClick={onClose} style={{position:'fixed', inset:0, background:'rgba(15,23,41,0.55)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:300, padding:20}}>
      <div onClick={e=>e.stopPropagation()} style={{background:'var(--surface)', borderRadius:12, width, maxWidth:'92vw', maxHeight:'88vh', display:'flex', flexDirection:'column', boxShadow:'var(--shadow-lg)', overflow:'hidden'}}>
        <div style={{display:'flex', alignItems:'center', gap:10, padding:'18px 20px 14px', borderBottom:'1px solid var(--line)'}}>
          {icon && (
            <div style={{
              width:36, height:36, borderRadius:9,
              background: (iconColor || 'var(--acc-2)') + '22',
              color: iconColor || 'var(--acc-2)',
              display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0
            }}>
              <span style={{fontFamily:'Material Symbols Outlined', fontSize:20}}>{icon}</span>
            </div>
          )}
          <div style={{flex:1, minWidth:0}}>
            <div style={{fontSize:16, fontWeight:700, color:'var(--ink)'}}>{title}</div>
            {subtitle && <div style={{fontSize:11.5, color:'var(--text-3)', marginTop:2}}>{subtitle}</div>}
          </div>
          <button onClick={onClose} style={{width:30, height:30, borderRadius:15, background:'var(--bg-2)', border:'none', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', color:'var(--text-2)'}}>
            <span style={{fontFamily:'Material Symbols Outlined', fontSize:16}}>close</span>
          </button>
        </div>
        <div style={{flex:1, overflowY:'auto', padding:'16px 20px'}}>{children}</div>
        {footer && <div style={{padding:'12px 20px 16px', borderTop:'1px solid var(--line)', background:'var(--bg)', display:'flex', gap:8}}>{footer}</div>}
      </div>
    </div>
  );
}

// ── Adjust Balance ──
function AdjustBalanceModal({ client, accounts, onClose }) {
  const [acctId, setAcctId] = useState(accounts[0]?.id || '');
  const [type, setType] = useState('credit');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [done, setDone] = useState(false);
  const acct = accounts.find(a => a.id === acctId);
  function submit() {
    if (!amount || !reason || !acct) return;
    setDone(true);
  }
  if (done) {
    return (
      <MgrModal title="Balance Adjusted" icon="check_circle" iconColor="#22C55E" onClose={onClose} footer={
        <button onClick={onClose} style={{flex:1, padding:'11px 0', borderRadius:8, background:'var(--ink)', color:'var(--ink-fg)', fontSize:13, fontWeight:700, border:'none', cursor:'pointer'}}>Done</button>
      }>
        <div style={{textAlign:'center', padding:'14px 0'}}>
          <div style={{fontSize:13, color:'var(--text-2)', lineHeight:1.6}}>
            {type === 'credit' ? '+' : type === 'debit' ? '−' : '·'}{acct.currency} {amount} applied to <b className="mono">{acct.id.toUpperCase()}</b>
          </div>
          <div style={{fontSize:11, color:'var(--text-3)', marginTop:6}}>
            Client will receive a notification. Audit log entry created.
          </div>
        </div>
      </MgrModal>
    );
  }
  return (
    <MgrModal
      title="Adjust Balance"
      subtitle={`${client.firstName} ${client.lastName} · ${client.id.toUpperCase()}`}
      icon="tune"
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose} style={{flex:1, padding:'11px 0', borderRadius:8, background:'var(--bg-2)', color:'var(--text-2)', fontSize:13, fontWeight:600, border:'none', cursor:'pointer'}}>Cancel</button>
          <button onClick={submit} disabled={!amount || !reason} style={{flex:1.4, padding:'11px 0', borderRadius:8, background: (!amount || !reason) ? 'var(--muted)' : 'var(--acc)', color:'#fff', fontSize:13, fontWeight:700, border:'none', cursor: (!amount || !reason) ? 'not-allowed' : 'pointer'}}>Apply Adjustment</button>
        </>
      }
    >
      <ModalLabel>Account</ModalLabel>
      <select value={acctId} onChange={e=>setAcctId(e.target.value)} style={{width:'100%', padding:'10px 12px', borderRadius:8, border:'1px solid var(--line-2)', fontSize:13, color:'var(--ink)', background:'var(--surface)', marginBottom:14}}>
        {accounts.map(a => (
          <option key={a.id} value={a.id}>
            {a.id.toUpperCase()} · {a.tag} · {a.currency} {MANAGER.fmt(a.balance, a.currency==='JPY'?0:2)}
          </option>
        ))}
      </select>

      <ModalLabel>Adjustment Type</ModalLabel>
      <div style={{display:'flex', gap:6, marginBottom:14}}>
        {[['credit','Credit (+)','#22C55E'],['debit','Debit (−)','#EF4444'],['correction','Correction','#0EA5E9']].map(([k,l,col]) => (
          <button key={k} onClick={()=>setType(k)} style={{
            flex:1, padding:'9px 0', borderRadius:7, fontSize:12, fontWeight:700,
            background: type===k ? col : 'var(--bg)', color: type===k ? '#fff' : 'var(--text-2)',
            border:'1px solid ' + (type===k ? col : 'var(--line-2)'), cursor:'pointer'
          }}>{l}</button>
        ))}
      </div>

      <ModalLabel>Amount</ModalLabel>
      <div style={{display:'flex', alignItems:'baseline', gap:8, padding:'10px 14px', background:'var(--bg)', borderRadius:8, marginBottom:14}}>
        <span className="mono" style={{fontSize:14, fontWeight:600, color:'var(--text-3)'}}>{acct?.currency}</span>
        <input type="number" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="0.00" className="mono"
          style={{flex:1, fontSize:20, fontWeight:700, color:'var(--ink)', background:'transparent', outline:'none', border:'none'}}/>
      </div>

      <ModalLabel>Reason (required)</ModalLabel>
      <textarea value={reason} onChange={e=>setReason(e.target.value)}
        placeholder="e.g. Welcome bonus, KYC promotion, manual correction…"
        style={{width:'100%', padding:'10px 12px', borderRadius:8, border:'1px solid var(--line-2)', background:'var(--surface)', fontSize:13, color:'var(--ink)', minHeight:64, outline:'none', resize:'vertical', fontFamily:'inherit', marginBottom:14}}/>

      <div style={{background:'#FFF3E0', borderRadius:8, padding:'8px 12px', fontSize:11.5, color:'#B45309', display:'flex', alignItems:'flex-start', gap:6}}>
        <span style={{fontFamily:'Material Symbols Outlined', fontSize:15}}>warning</span>
        <span>This action is logged in the audit trail. Client will receive a notification.</span>
      </div>
    </MgrModal>
  );
}

// ── Manage KYC ──
function ManageKycModal({ client, onClose }) {
  const [newStatus, setNewStatus] = useState(client.kyc);
  const [note, setNote] = useState('');
  const [done, setDone] = useState(false);
  if (done) {
    return (
      <MgrModal title="KYC Updated" icon="check_circle" iconColor="#22C55E" onClose={onClose} footer={
        <button onClick={onClose} style={{flex:1, padding:'11px 0', borderRadius:8, background:'var(--ink)', color:'var(--ink-fg)', fontSize:13, fontWeight:700, border:'none', cursor:'pointer'}}>Done</button>
      }>
        <div style={{textAlign:'center', padding:'14px 0', fontSize:13, color:'var(--text-2)'}}>
          KYC status changed to <b>{newStatus}</b> for {client.firstName} {client.lastName}.
        </div>
      </MgrModal>
    );
  }
  return (
    <MgrModal
      title="Manage KYC"
      subtitle={`${client.firstName} ${client.lastName} · Current: ${client.kyc}`}
      icon="verified_user"
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose} style={{flex:1, padding:'11px 0', borderRadius:8, background:'var(--bg-2)', color:'var(--text-2)', fontSize:13, fontWeight:600, border:'none', cursor:'pointer'}}>Cancel</button>
          <button onClick={()=>setDone(true)} disabled={newStatus === client.kyc} style={{flex:1.4, padding:'11px 0', borderRadius:8, background: newStatus === client.kyc ? 'var(--muted)' : 'var(--acc)', color:'#fff', fontSize:13, fontWeight:700, border:'none', cursor: newStatus === client.kyc ? 'not-allowed' : 'pointer'}}>Update Status</button>
        </>
      }
    >
      <ModalLabel>Documents on File</ModalLabel>
      <div style={{background:'var(--bg)', borderRadius:8, padding:'10px 12px', marginBottom:14}}>
        {[
          { name:'Passport', uploaded:'2026-04-12', status:'verified' },
          { name:'Proof of Address', uploaded:'2026-04-12', status: client.kyc === 'verified' ? 'verified' : 'pending' },
          { name:'Selfie Verification', uploaded:'2026-04-12', status: client.kyc === 'rejected' ? 'rejected' : 'verified' },
        ].map((d, i) => (
          <div key={i} style={{display:'flex', alignItems:'center', gap:8, padding:'6px 0', borderTop: i===0?'none':'1px solid var(--line)'}}>
            <span style={{fontFamily:'Material Symbols Outlined', fontSize:16, color:'var(--text-3)'}}>description</span>
            <span style={{flex:1, fontSize:12.5, color:'var(--ink)', fontWeight:500}}>{d.name}</span>
            <KycBadge state={d.status}/>
            <button style={{padding:'3px 8px', fontSize:10.5, borderRadius:5, background:'var(--surface)', border:'1px solid var(--line-2)', color:'var(--text-2)', fontWeight:600, cursor:'pointer'}}>View</button>
          </div>
        ))}
      </div>

      <ModalLabel>Change Status To</ModalLabel>
      <div style={{display:'flex', gap:6, marginBottom:14}}>
        {[['verified','Verified','#22C55E'],['pending','Pending','#F59E0B'],['rejected','Rejected','#EF4444']].map(([k,l,col]) => (
          <button key={k} onClick={()=>setNewStatus(k)} style={{
            flex:1, padding:'10px 0', borderRadius:7, fontSize:12, fontWeight:700,
            background: newStatus===k ? col : 'var(--bg)', color: newStatus===k ? '#fff' : 'var(--text-2)',
            border:'1px solid ' + (newStatus===k ? col : 'var(--line-2)'), cursor:'pointer'
          }}>{l}</button>
        ))}
      </div>

      {newStatus === 'rejected' && (
        <>
          <ModalLabel>Rejection Reason</ModalLabel>
          <textarea value={note} onChange={e=>setNote(e.target.value)}
            placeholder="e.g. Document expired, name mismatch, address unreadable…"
            style={{width:'100%', padding:'10px 12px', borderRadius:8, border:'1px solid var(--line-2)', background:'var(--surface)', fontSize:13, color:'var(--ink)', minHeight:64, outline:'none', resize:'vertical', fontFamily:'inherit'}}/>
        </>
      )}
    </MgrModal>
  );
}

// ── Send Message ──
function SendMessageModal({ client, onClose }) {
  const [channel, setChannel] = useState('email');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [done, setDone] = useState(false);
  if (done) {
    return (
      <MgrModal title="Message Sent" icon="check_circle" iconColor="#22C55E" onClose={onClose} footer={
        <button onClick={onClose} style={{flex:1, padding:'11px 0', borderRadius:8, background:'var(--ink)', color:'var(--ink-fg)', fontSize:13, fontWeight:700, border:'none', cursor:'pointer'}}>Done</button>
      }>
        <div style={{textAlign:'center', padding:'14px 0', fontSize:13, color:'var(--text-2)', lineHeight:1.6}}>
          Message delivered to {client.firstName} {client.lastName} via {channel === 'email' ? 'email' : channel === 'sms' ? 'SMS' : 'in-app push'}.
        </div>
      </MgrModal>
    );
  }
  return (
    <MgrModal
      title="Send Message"
      subtitle={`To: ${client.firstName} ${client.lastName} · ${client.email}`}
      icon="mail"
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose} style={{flex:1, padding:'11px 0', borderRadius:8, background:'var(--bg-2)', color:'var(--text-2)', fontSize:13, fontWeight:600, border:'none', cursor:'pointer'}}>Cancel</button>
          <button onClick={()=>setDone(true)} disabled={!body || (channel==='email' && !subject)} style={{flex:1.4, padding:'11px 0', borderRadius:8, background: (!body || (channel==='email' && !subject)) ? 'var(--muted)' : 'var(--acc)', color:'#fff', fontSize:13, fontWeight:700, border:'none', cursor: (!body || (channel==='email' && !subject)) ? 'not-allowed' : 'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:6}}>
            <span style={{fontFamily:'Material Symbols Outlined', fontSize:15}}>send</span>
            Send Now
          </button>
        </>
      }
    >
      <ModalLabel>Channel</ModalLabel>
      <div style={{display:'flex', gap:6, marginBottom:14}}>
        {[['email','Email','mail'],['sms','SMS','sms'],['push','Push','notifications']].map(([k,l,ic]) => (
          <button key={k} onClick={()=>setChannel(k)} style={{
            flex:1, padding:'10px 0', borderRadius:7, fontSize:12, fontWeight:700,
            background: channel===k ? 'var(--acc-3)' : 'var(--bg)', color: channel===k ? 'var(--acc-2)' : 'var(--text-2)',
            border:'1px solid ' + (channel===k ? 'var(--acc)' : 'var(--line-2)'), cursor:'pointer',
            display:'flex', alignItems:'center', justifyContent:'center', gap:5
          }}>
            <span style={{fontFamily:'Material Symbols Outlined', fontSize:15}}>{ic}</span>
            {l}
          </button>
        ))}
      </div>

      {channel === 'email' && (
        <>
          <ModalLabel>Subject</ModalLabel>
          <input value={subject} onChange={e=>setSubject(e.target.value)} placeholder="Important: Account verification update"
            style={{width:'100%', padding:'10px 12px', borderRadius:8, border:'1px solid var(--line-2)', background:'var(--surface)', fontSize:13, color:'var(--ink)', outline:'none', marginBottom:14}}/>
        </>
      )}

      <ModalLabel>Message</ModalLabel>
      <textarea value={body} onChange={e=>setBody(e.target.value)}
        placeholder="Type your message..."
        style={{width:'100%', padding:'10px 12px', borderRadius:8, border:'1px solid var(--line-2)', background:'var(--surface)', fontSize:13, color:'var(--ink)', minHeight:120, outline:'none', resize:'vertical', fontFamily:'inherit', marginBottom:14}}/>

      <ModalLabel>Quick Templates</ModalLabel>
      <div style={{display:'flex', gap:6, flexWrap:'wrap'}}>
        {[
          { l:'KYC reminder', s:'Action needed: complete KYC', b:`Hi ${client.firstName},\n\nWe noticed your KYC verification is pending. Please complete the verification to enable full account features.\n\nBest, ALPEXA Team` },
          { l:'Margin warning', s:'Your account requires attention', b:`Hi ${client.firstName},\n\nYour margin level is approaching the maintenance threshold. Please consider adding funds or closing positions to avoid stop-out.\n\nBest, ALPEXA Team` },
          { l:'Welcome', s:'Welcome to ALPEXA SUISSE', b:`Hi ${client.firstName},\n\nWelcome aboard! Your account is ready for trading.\n\nBest, ALPEXA Team` },
        ].map((t, i) => (
          <button key={i} onClick={()=>{ setSubject(t.s); setBody(t.b); }} style={{padding:'5px 10px', borderRadius:6, background:'var(--bg)', border:'1px solid var(--line-2)', fontSize:11, color:'var(--text-2)', fontWeight:600, cursor:'pointer'}}>{t.l}</button>
        ))}
      </div>
    </MgrModal>
  );
}

// ── Block Account ──
function BlockAccountModal({ client, onClose }) {
  const isBlocked = client.status === 'blocked';
  const [reason, setReason] = useState('');
  const [done, setDone] = useState(false);
  if (done) {
    return (
      <MgrModal title={isBlocked ? 'Account Unblocked' : 'Account Blocked'} icon={isBlocked ? 'lock_open' : 'block'} iconColor={isBlocked ? '#22C55E' : '#EF4444'} onClose={onClose} footer={
        <button onClick={onClose} style={{flex:1, padding:'11px 0', borderRadius:8, background:'var(--ink)', color:'var(--ink-fg)', fontSize:13, fontWeight:700, border:'none', cursor:'pointer'}}>Done</button>
      }>
        <div style={{textAlign:'center', padding:'14px 0', fontSize:13, color:'var(--text-2)', lineHeight:1.6}}>
          {isBlocked
            ? <>{client.firstName} {client.lastName}'s account access has been restored.</>
            : <>{client.firstName} {client.lastName}'s account is now blocked.<br/>They cannot sign in or place new trades.</>
          }
        </div>
      </MgrModal>
    );
  }
  return (
    <MgrModal
      title={isBlocked ? 'Unblock Account' : 'Block Account'}
      subtitle={`${client.firstName} ${client.lastName} · ${client.id.toUpperCase()}`}
      icon={isBlocked ? 'lock_open' : 'block'}
      iconColor={isBlocked ? '#22C55E' : '#EF4444'}
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose} style={{flex:1, padding:'11px 0', borderRadius:8, background:'var(--bg-2)', color:'var(--text-2)', fontSize:13, fontWeight:600, border:'none', cursor:'pointer'}}>Cancel</button>
          <button onClick={()=>setDone(true)} disabled={!reason} style={{flex:1.4, padding:'11px 0', borderRadius:8, background: !reason ? 'var(--muted)' : (isBlocked ? '#22C55E' : '#EF4444'), color:'#fff', fontSize:13, fontWeight:700, border:'none', cursor: !reason ? 'not-allowed' : 'pointer'}}>
            {isBlocked ? 'Restore Access' : 'Block Now'}
          </button>
        </>
      }
    >
      {!isBlocked && (
        <div style={{background:'#FFEBEE', borderRadius:8, padding:'12px 14px', marginBottom:14, display:'flex', alignItems:'flex-start', gap:8}}>
          <span style={{fontFamily:'Material Symbols Outlined', fontSize:18, color:'#C62828'}}>warning</span>
          <div style={{flex:1, fontSize:12, color:'#C62828', lineHeight:1.5}}>
            <b>This will immediately:</b>
            <ul style={{margin:'6px 0 0 18px', padding:0}}>
              <li>Sign the client out from all devices</li>
              <li>Prevent new sign-ins and new orders</li>
              <li>Suspend all pending orders (open positions remain)</li>
              <li>Block deposits and withdrawals</li>
            </ul>
          </div>
        </div>
      )}

      <ModalLabel>{isBlocked ? 'Restoration Note' : 'Reason for Blocking'} (required)</ModalLabel>
      <select value={reason} onChange={e=>setReason(e.target.value)} style={{width:'100%', padding:'10px 12px', borderRadius:8, border:'1px solid var(--line-2)', fontSize:13, color:'var(--ink)', background:'var(--surface)', marginBottom:14}}>
        <option value="">Select a reason…</option>
        {isBlocked ? (
          <>
            <option value="resolved">Issue resolved · access restored</option>
            <option value="kyc">KYC verification completed</option>
            <option value="appeal">Customer appeal approved</option>
            <option value="other">Other (specify in notes)</option>
          </>
        ) : (
          <>
            <option value="aml">AML review · suspicious activity</option>
            <option value="kyc_failed">KYC documents rejected</option>
            <option value="fraud">Fraud suspicion</option>
            <option value="customer_request">Customer requested closure</option>
            <option value="regulatory">Regulatory requirement</option>
            <option value="other">Other</option>
          </>
        )}
      </select>

      <div style={{fontSize:11, color:'var(--text-3)', lineHeight:1.5}}>
        This action will be logged in the audit trail with your admin ID and timestamp.
        {!isBlocked && ' Existing positions remain open for risk management.'}
      </div>
    </MgrModal>
  );
}

function ModalLabel({ children }) {
  return <div style={{fontSize:10, fontWeight:700, color:'var(--text-3)', letterSpacing:0.5, marginBottom:6, textTransform:'uppercase'}}>{children}</div>;
}

function ColHeader({ col, currentWidth, setWidth, onReset, isLast }) {
  const [dragging, setDragging] = useState(false);

  function onMouseDown(e) {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startW = currentWidth || col.width;
    setDragging(true);
    function move(ev) {
      const dx = ev.clientX - startX;
      const next = Math.max(col.min || 40, startW + dx);
      setWidth(col.key, next);
    }
    function up() {
      setDragging(false);
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      document.body.style.cursor = '';
    }
    document.body.style.cursor = 'col-resize';
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  }

  return (
    <span
      onDoubleClick={col.key === 'dot' ? onReset : undefined}
      title={col.key === 'dot' ? 'Double-click to reset column widths' : col.label}
      style={{textAlign: col.align || 'left'}}>
      {col.label}
      {col.resizable !== false && !isLast && (
        <span className={'mgr-col-resize ' + (dragging ? 'dragging' : '')} onMouseDown={onMouseDown}/>
      )}
    </span>
  );
}

Object.assign(window, { ClientsScreen, ClientDetailDrawer, FilterChip, KycBadge, StatusBadge, RiskBadge, PageHeader, btnPrimary, btnGhost, usdRate, MgrModal, ModalLabel, ColHeader });
