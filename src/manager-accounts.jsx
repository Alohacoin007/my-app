// ALPEXA Manager — Accounts screen (balance adjustment, leverage, group)
const { useState: useStateAcc } = React;

function AccountsScreen() {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all'); // all | live | crypto
  const [adjustingId, setAdjustingId] = useState(null);

  const filtered = MANAGER.ACCOUNTS.filter(a => {
    if (filter === 'live'   && a.tag !== 'LIVE')   return false;
    if (filter === 'crypto' && a.tag !== 'CRYPTO') return false;
    if (search) {
      const c = MANAGER.findClient(a.clientId);
      const q = search.toLowerCase();
      if (!a.id.toLowerCase().includes(q) &&
          !(c && (c.firstName.toLowerCase().includes(q) || c.lastName.toLowerCase().includes(q) || c.email.toLowerCase().includes(q)))) return false;
    }
    return true;
  });

  const totalEquity = MANAGER.ACCOUNTS.reduce((s,a)=>s+(a.equity||0)*usdRate(a.currency), 0);
  const totalMargin = MANAGER.ACCOUNTS.reduce((s,a)=>s+(a.margin||0)*usdRate(a.currency), 0);

  return (
    <div style={{display:'flex', flexDirection:'column', flex:1, minHeight:0}}>
      <PageHeader
        title="Accounts"
        subtitle={`${MANAGER.ACCOUNTS.length} accounts · Equity ≈ $${MANAGER.fmt(totalEquity)} · Margin ≈ $${MANAGER.fmt(totalMargin)}`}
        actions={
          <div style={{display:'flex', alignItems:'center', gap:8}}>
            <div style={{display:'flex', alignItems:'center', gap:6, padding:'5px 10px', background:'var(--bg)', borderRadius:7, border:'1px solid var(--line-2)', width:260, height:30}}>
              <span style={{fontFamily:'Material Symbols Outlined', fontSize:15, color:'var(--text-3)'}}>search</span>
              <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search by account, client, email…"
                style={{flex:1, fontSize:11.5, color:'var(--ink)', background:'transparent', outline:'none', border:'none'}}/>
            </div>
            <FilterChip active={filter==='all'}    onClick={()=>setFilter('all')}    label="All"    count={MANAGER.ACCOUNTS.length}/>
            <FilterChip active={filter==='live'}   onClick={()=>setFilter('live')}   label="Live"   count={MANAGER.ACCOUNTS.filter(a=>a.tag==='LIVE').length}/>
            <FilterChip active={filter==='crypto'} onClick={()=>setFilter('crypto')} label="Crypto" count={MANAGER.ACCOUNTS.filter(a=>a.tag==='CRYPTO').length}/>
          </div>
        }/>

      {/* Table */}
      <div style={{flex:1, overflowY:'auto', padding:'16px 24px 24px'}}>
        <div style={{background:'var(--surface)', borderRadius:10, border:'1px solid var(--line)', overflow:'hidden'}}>
          <div style={{display:'grid', gridTemplateColumns:'100px 1fr 70px 140px 140px 100px 80px 80px 110px', padding:'10px 16px', background:'var(--bg)', borderBottom:'1px solid var(--line)', fontSize:10, fontWeight:700, color:'var(--text-3)', letterSpacing:0.5, textTransform:'uppercase'}}>
            <span>Account</span><span>Client</span><span>Tag</span>
            <span style={{textAlign:'right'}}>Balance</span>
            <span style={{textAlign:'right'}}>Equity</span>
            <span style={{textAlign:'right'}}>Margin</span>
            <span style={{textAlign:'right'}}>Lev.</span>
            <span style={{textAlign:'right'}}>Group</span>
            <span style={{textAlign:'right'}}>Actions</span>
          </div>
          {filtered.map(a => {
            const c = MANAGER.findClient(a.clientId);
            return (
              <div key={a.id} style={{display:'grid', gridTemplateColumns:'100px 1fr 70px 140px 140px 100px 80px 80px 110px', padding:'12px 16px', borderBottom:'1px solid var(--line)', alignItems:'center', fontSize:12.5}}>
                <span className="mono" style={{fontWeight:700, color:'var(--ink)'}}>{a.id.toUpperCase()}</span>
                <span style={{color:'var(--text-2)'}}>{c ? `${c.firstName} ${c.lastName}` : '—'}</span>
                <span style={{
                  fontSize:9.5, fontWeight:800, padding:'2px 5px', borderRadius:3,
                  background: a.tag==='LIVE'?'#E8F5E9':'#FFF3E0',
                  color:      a.tag==='LIVE'?'#1B5E20':'#E65100',
                  justifySelf:'flex-start', letterSpacing:0.3
                }}>{a.tag}</span>
                <span className="mono" style={{textAlign:'right', color:'var(--ink)', fontWeight:600}}>{a.currency} {MANAGER.fmt(a.balance, a.currency==='JPY'?0:2)}</span>
                <span className="mono" style={{textAlign:'right', color: a.equity >= a.balance ? '#22C55E' : '#EF4444', fontWeight:600}}>{a.currency} {MANAGER.fmt(a.equity, a.currency==='JPY'?0:2)}</span>
                <span className="mono" style={{textAlign:'right', color:'var(--text-2)'}}>{MANAGER.fmt(a.margin)}</span>
                <span className="mono" style={{textAlign:'right', color:'var(--text-2)'}}>1:{a.leverage}</span>
                <span style={{textAlign:'right', fontSize:11.5, fontWeight:600, color: a.group==='VIP'?'#7C3AED':a.group==='Pro'?'#0EA5E9':'var(--text-2)'}}>{a.group}</span>
                <div style={{display:'flex', justifyContent:'flex-end', gap:4}}>
                  <button onClick={()=>setAdjustingId(a.id)} title="Adjust balance" style={iconBtn}>
                    <span style={{fontFamily:'Material Symbols Outlined', fontSize:16}}>tune</span>
                  </button>
                  <button title="View positions" style={iconBtn}>
                    <span style={{fontFamily:'Material Symbols Outlined', fontSize:16}}>open_in_new</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {adjustingId && <BalanceAdjustModal accountId={adjustingId} onClose={()=>setAdjustingId(null)}/>}
    </div>
  );
}

function BalanceAdjustModal({ accountId, onClose }) {
  const acct = MANAGER.ACCOUNTS.find(a => a.id === accountId);
  const client = MANAGER.findClient(acct.clientId);
  const [type, setType] = useState('credit'); // credit | debit | correction
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  function submit() {
    if (!amount || !reason) return;
    alert(`[Demo] ${type === 'credit' ? '+' : '−'}${acct.currency} ${amount} adjustment applied to ${acct.id}.\nReason: ${reason}`);
    onClose();
  }
  return (
    <div onClick={onClose} style={{position:'fixed', inset:0, background:'rgba(15,23,41,0.6)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:200}}>
      <div onClick={e=>e.stopPropagation()} style={{background:'var(--surface)', borderRadius:12, padding:24, width:460, maxWidth:'92vw', boxShadow:'var(--shadow-lg)'}}>
        <div style={{display:'flex', alignItems:'center', gap:10, marginBottom:18}}>
          <span style={{fontFamily:'Material Symbols Outlined', fontSize:24, color:'var(--acc-2)'}}>tune</span>
          <div style={{flex:1}}>
            <div style={{fontSize:17, fontWeight:700, color:'var(--ink)'}}>Adjust Balance</div>
            <div style={{fontSize:11.5, color:'var(--text-3)', marginTop:2}}>
              {client?.firstName} {client?.lastName} · <span className="mono">{acct.id.toUpperCase()}</span> · Current: {acct.currency} {MANAGER.fmt(acct.balance)}
            </div>
          </div>
          <button onClick={onClose} style={{width:30, height:30, borderRadius:15, background:'var(--bg-2)', border:'none', cursor:'pointer'}}>×</button>
        </div>

        <div style={{display:'flex', gap:6, marginBottom:14}}>
          {[['credit','Credit (+)','#22C55E'],['debit','Debit (−)','#EF4444'],['correction','Correction','#0EA5E9']].map(([k,l,col]) => (
            <button key={k} onClick={()=>setType(k)} style={{
              flex:1, padding:'9px 0', borderRadius:7, fontSize:12, fontWeight:700,
              background: type===k ? col : 'var(--bg)', color: type===k ? '#fff' : 'var(--text-2)',
              border:'1px solid ' + (type===k ? col : 'var(--line-2)'), cursor:'pointer'
            }}>{l}</button>
          ))}
        </div>

        <div style={{fontSize:10, fontWeight:700, color:'var(--text-3)', letterSpacing:0.5, marginBottom:5}}>AMOUNT</div>
        <div style={{display:'flex', alignItems:'baseline', gap:8, padding:'10px 14px', background:'var(--bg)', borderRadius:8, marginBottom:14}}>
          <span className="mono" style={{fontSize:14, fontWeight:600, color:'var(--text-3)'}}>{acct.currency}</span>
          <input type="number" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="0.00" className="mono"
            style={{flex:1, fontSize:20, fontWeight:700, color:'var(--ink)', background:'transparent', outline:'none', border:'none'}}/>
        </div>

        <div style={{fontSize:10, fontWeight:700, color:'var(--text-3)', letterSpacing:0.5, marginBottom:5}}>REASON (REQUIRED)</div>
        <textarea value={reason} onChange={e=>setReason(e.target.value)}
          placeholder="e.g. Welcome bonus, KYC promotion, manual correction…"
          style={{width:'100%', padding:'10px 12px', borderRadius:8, border:'1px solid var(--line-2)', background:'var(--surface)', fontSize:13, color:'var(--ink)', minHeight:64, outline:'none', resize:'vertical', fontFamily:'inherit', marginBottom:14}}/>

        <div style={{background:'#FFF3E0', borderRadius:8, padding:'8px 12px', fontSize:11.5, color:'#B45309', marginBottom:14, display:'flex', alignItems:'flex-start', gap:6}}>
          <span style={{fontFamily:'Material Symbols Outlined', fontSize:15}}>warning</span>
          <span>This action is logged in the audit trail. Client will receive a notification.</span>
        </div>

        <div style={{display:'flex', gap:8}}>
          <button onClick={onClose} style={{flex:1, padding:'11px 0', borderRadius:8, background:'var(--bg-2)', color:'var(--text-2)', fontSize:13, fontWeight:600, border:'none', cursor:'pointer'}}>Cancel</button>
          <button onClick={submit} disabled={!amount || !reason} style={{flex:1.4, padding:'11px 0', borderRadius:8, background: (!amount || !reason) ? 'var(--muted)' : 'var(--acc)', color:'#fff', fontSize:13, fontWeight:700, border:'none', cursor: (!amount || !reason) ? 'not-allowed' : 'pointer'}}>Apply Adjustment</button>
        </div>
      </div>
    </div>
  );
}

function usdRate(currency) {
  const rates = { USD:1, EUR:1.08, GBP:1.26, JPY:0.0064, CHF:1.10, KRW:0.00073 };
  return rates[currency] || 1;
}

const iconBtn = {
  width:28, height:28, borderRadius:6, background:'var(--bg)', border:'1px solid var(--line-2)',
  display:'inline-flex', alignItems:'center', justifyContent:'center', color:'var(--text-2)', cursor:'pointer'
};

Object.assign(window, { AccountsScreen, BalanceAdjustModal, iconBtn });
