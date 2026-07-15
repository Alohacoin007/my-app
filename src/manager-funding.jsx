// ALPEXA Manager — Funding Operations (deposits/withdrawals queue)
function FundingScreen() {
  const [filter, setFilter] = useState('pending');
  const [reqs, setReqs] = useState(MANAGER.FUNDING_REQUESTS);

  const filtered = reqs.filter(r => filter === 'all' || r.status === filter);
  const pendingCount = reqs.filter(r => r.status === 'pending').length;

  function approve(id) {
    setReqs(prev => prev.map(r => r.id === id ? { ...r, status:'approved' } : r));
  }
  function reject(id) {
    setReqs(prev => prev.map(r => r.id === id ? { ...r, status:'rejected' } : r));
  }

  return (
    <div style={{display:'flex', flexDirection:'column', flex:1, minHeight:0}}>
      <PageHeader title="Funding Operations" subtitle={`${pendingCount} pending · ${reqs.filter(r=>r.status==='approved').length} approved today`}/>

      <div style={{display:'flex', alignItems:'center', gap:10, padding:'14px 24px', background:'var(--surface)', borderBottom:'1px solid var(--line)'}}>
        <FilterChip active={filter==='pending'}  onClick={()=>setFilter('pending')}  label="Pending"  count={pendingCount} dot="#F59E0B"/>
        <FilterChip active={filter==='approved'} onClick={()=>setFilter('approved')} label="Approved" count={reqs.filter(r=>r.status==='approved').length}/>
        <FilterChip active={filter==='rejected'} onClick={()=>setFilter('rejected')} label="Rejected" count={reqs.filter(r=>r.status==='rejected').length}/>
        <FilterChip active={filter==='all'}      onClick={()=>setFilter('all')}      label="All"      count={reqs.length}/>
      </div>

      <div style={{flex:1, overflowY:'auto', padding:'16px 24px 24px', display:'flex', flexDirection:'column', gap:8}}>
        {filtered.map(r => {
          const c = MANAGER.findClient(r.clientId);
          const isDeposit = r.kind === 'deposit';
          return (
            <div key={r.id} style={{background:'var(--surface)', borderRadius:10, border:'1px solid var(--line)', padding:'14px 16px', display:'flex', alignItems:'center', gap:14}}>
              {/* Kind icon */}
              <div style={{
                width:42, height:42, borderRadius:10,
                background: isDeposit ? '#E8F5E9' : '#FFEBEE',
                color:      isDeposit ? '#1B5E20' : '#C62828',
                display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0
              }}>
                <span style={{fontFamily:'Material Symbols Outlined', fontSize:22}}>{isDeposit ? 'south' : 'north'}</span>
              </div>
              {/* Details */}
              <div style={{flex:1, minWidth:0}}>
                <div style={{display:'flex', alignItems:'center', gap:8, marginBottom:4}}>
                  <span style={{fontSize:14, fontWeight:700, color:'var(--ink)'}}>
                    {isDeposit ? 'Deposit' : 'Withdrawal'}
                  </span>
                  <span className="mono" style={{fontSize:14, fontWeight:700, color: isDeposit ? '#1B5E20' : '#C62828'}}>
                    {r.currency} {MANAGER.fmt(r.amount, r.currency==='JPY'?0:2)}
                  </span>
                  <span style={{fontSize:10, padding:'2px 6px', borderRadius:3, background:'var(--bg)', color:'var(--text-2)', fontWeight:700, letterSpacing:0.4, textTransform:'uppercase'}}>{r.method}</span>
                  <FundingStatusBadge state={r.status}/>
                </div>
                <div style={{fontSize:12, color:'var(--text-2)', display:'flex', gap:14, marginBottom:3}}>
                  <span>{c ? `${c.firstName} ${c.lastName}` : '—'} · <span className="mono">{c?.id.toUpperCase()}</span></span>
                  <span>· Account <span className="mono">{r.accountId.toUpperCase()}</span></span>
                </div>
                <div style={{fontSize:11, color:'var(--text-3)', display:'flex', gap:14}}>
                  <span style={{display:'flex', alignItems:'center', gap:4}}>
                    <span style={{fontFamily:'Material Symbols Outlined', fontSize:12}}>schedule</span>
                    {r.requested}
                  </span>
                  <span>· {r.notes}</span>
                </div>
              </div>
              {/* Actions */}
              {r.status === 'pending' && (
                <div style={{display:'flex', gap:6, flexShrink:0}}>
                  <button onClick={()=>reject(r.id)} style={{padding:'7px 12px', borderRadius:7, background:'#FFEBEE', color:'#C62828', border:'none', fontSize:12, fontWeight:700, cursor:'pointer'}}>Reject</button>
                  <button onClick={()=>approve(r.id)} style={{padding:'7px 14px', borderRadius:7, background:'#1B5E20', color:'#fff', border:'none', fontSize:12, fontWeight:700, cursor:'pointer'}}>Approve</button>
                </div>
              )}
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div style={{padding:'60px 16px', textAlign:'center', color:'var(--text-3)', fontSize:14}}>
            No {filter !== 'all' ? filter : ''} funding requests.
          </div>
        )}
      </div>
    </div>
  );
}

function FundingStatusBadge({ state }) {
  const styles = {
    pending:  { bg:'#FFF3E0', col:'#E65100', label:'Pending'  },
    approved: { bg:'#E8F5E9', col:'#1B5E20', label:'Approved' },
    rejected: { bg:'#FFEBEE', col:'#C62828', label:'Rejected' },
  };
  const s = styles[state];
  return (
    <span style={{
      fontSize:9.5, fontWeight:800, padding:'2px 6px', borderRadius:3, letterSpacing:0.4,
      background: s.bg, color: s.col, marginLeft:'auto'
    }}>{s.label.toUpperCase()}</span>
  );
}

Object.assign(window, { FundingScreen });
