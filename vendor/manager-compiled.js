// === Top-level constants from src/manager-app.jsx ===
var SERVERS = [
  { id:'FX',   label:'FX',     color:'#15A36C', icon:'trending_up',      sub:'FX · Stocks · Indices' },
  { id:'CRYPTO', label:'Crypto', color:'#F59E0B', icon:'currency_bitcoin', sub:'BTC · ETH · USDT' },
  { id:'SPORTS', label:'Sports', color:'#7C3AED', icon:'sports_soccer',    sub:'Betting · Odds' },
];


// === Real-time Risk Alerts (added by back-office audit) ===
(function() {
  if (typeof window === 'undefined') return;
  if (!window.MANAGER) window.MANAGER = {};
  // Configurable thresholds
  window.MANAGER.RISK_THRESHOLDS = window.MANAGER.RISK_THRESHOLDS || {
    positionLossUsd: 5000,        // single position P/L below -$5k
    accountMarginPct: 100,         // account margin level below 100%
    eventLiabilityUsd: 5000,       // sports event single-side liability over $5k
    pendingWithdrawalUsd: 50000,   // pending withdrawal over $50k
    clientNetLossUsd: 10000        // client cumulative net loss over $10k
  };
  window.MANAGER.getRiskAlerts = function() {
    var alerts = [];
    var T = window.MANAGER.RISK_THRESHOLDS;
    // 1) Big single-position losses
    (window.MANAGER.POSITIONS || []).forEach(function(p) {
      if (typeof p.pnl === 'number' && p.pnl < -T.positionLossUsd) {
        var c = window.MANAGER.findClient(p.clientId);
        alerts.push({
          severity: p.pnl < -10000 ? 'critical' : 'high',
          kind: 'position_loss',
          icon: 'trending_down',
          title: 'Big loss on ' + (p.sym || 'position'),
          detail: (c ? c.firstName + ' ' + c.lastName : p.clientId) + ' · ' + (p.sym||'?') + ' ' + (p.side||'') + ' ' + (p.vol||'') + ' lots',
          amount: p.pnl,
          clientId: p.clientId
        });
      }
    });
    // 2) Margin call territory (account)
    (window.MANAGER.ACCOUNTS || []).forEach(function(a) {
      if (a.margin > 0) {
        var lvl = (a.equity / a.margin) * 100;
        if (lvl < T.accountMarginPct) {
          var c = window.MANAGER.findClient(a.clientId);
          alerts.push({
            severity: lvl < 50 ? 'critical' : 'high',
            kind: 'margin_call',
            icon: 'warning',
            title: 'Margin level ' + lvl.toFixed(0) + '%',
            detail: (c ? c.firstName + ' ' + c.lastName : a.clientId) + ' · acct ' + (a.accountNo||a.id),
            amount: lvl,
            clientId: a.clientId
          });
        }
      }
    });
    // 3) Sports event with concentrated liability
    (window.MANAGER.SPORTS_EVENTS || []).forEach(function(ev) {
      var openBets = (window.MANAGER.SPORTS_BETS || []).filter(function(b){ return b.eventId === ev.id && b.status === 'open'; });
      var liability = openBets.reduce(function(s, b){ return s + (b.potential || 0); }, 0);
      if (liability > T.eventLiabilityUsd) {
        alerts.push({
          severity: liability > 10000 ? 'critical' : 'high',
          kind: 'event_liability',
          icon: 'sports_soccer',
          title: 'Event liability $' + Math.round(liability/1000) + 'k',
          detail: (ev.awayAbbr||'?') + ' @ ' + (ev.homeAbbr||'?') + ' · ' + (ev.sport||'') + ' · ' + openBets.length + ' open bets',
          amount: liability,
          eventId: ev.id
        });
      }
    });
    // 4) Big pending withdrawals
    (window.MANAGER.FUNDING_REQUESTS || []).forEach(function(r) {
      if (r.kind === 'withdrawal' && r.status === 'pending' && (r.amount||0) > T.pendingWithdrawalUsd) {
        var c = window.MANAGER.findClient(r.clientId);
        alerts.push({
          severity: 'high',
          kind: 'big_withdrawal',
          icon: 'south_west',
          title: 'Large withdrawal pending',
          detail: (c ? c.firstName + ' ' + c.lastName : r.clientId) + ' · ' + (r.method||'') + ' · ' + (r.server||'FX'),
          amount: r.amount,
          clientId: r.clientId
        });
      }
    });
    // Sort by severity (critical first) then amount magnitude
    var sevOrder = { critical: 0, high: 1, medium: 2 };
    alerts.sort(function(a, b) {
      var s = (sevOrder[a.severity] || 9) - (sevOrder[b.severity] || 9);
      if (s !== 0) return s;
      return Math.abs(b.amount || 0) - Math.abs(a.amount || 0);
    });
    return alerts;
  };
})();



// === Audit Data: TRADE_AUDIT + SESSION_LOG (added by audit upgrade) ===
setTimeout(function() {
  if (typeof window === 'undefined' || !window.MANAGER) return;
  // Sample trade execution audit — what bid/ask was, what the client got, slippage
  window.MANAGER.TRADE_AUDIT = window.MANAGER.TRADE_AUDIT || [
    // === 2026-05-28 (today) ===
    { id:'TA001', ts:'2026-05-28 09:42:11', kind:'trade_execution', server:'FX',   clientId:'c001', accountId:'a001', symbol:'EURUSD', side:'BUY',  vol:5.00,  lpBid:1.08118, lpAsk:1.08120, markup:0.8, clientPrice:1.08128, slippagePips:0.0, lp:'PrimaryFIX', latencyMs:14 },
    { id:'TA002', ts:'2026-05-28 09:47:52', kind:'trade_execution', server:'FX',   clientId:'c007', accountId:'a009', symbol:'USDJPY', side:'SELL', vol:10.0,  lpBid:156.909, lpAsk:156.912, markup:0.5, clientPrice:156.904, slippagePips:0.3, lp:'PrimaryFIX', latencyMs:18 },
    { id:'TA003', ts:'2026-05-28 10:12:03', kind:'trade_execution', server:'FX',   clientId:'c004', accountId:'a005', symbol:'NVDA',   side:'BUY',  vol:100,   lpBid:911.15,  lpAsk:911.25,  markup:0.05, clientPrice:911.30, slippagePips:0.0, lp:'Polygon',   latencyMs:42 },
    { id:'TA004', ts:'2026-05-28 10:28:14', kind:'trade_execution', server:'FX',   clientId:'c012', accountId:'a014', symbol:'AAPL',   side:'BUY',  vol:300,   lpBid:215.08,  lpAsk:215.13,  markup:0.05, clientPrice:215.18, slippagePips:0.0, lp:'Polygon',   latencyMs:39 },
    { id:'TA005', ts:'2026-05-28 11:02:47', kind:'trade_execution', server:'FX',   clientId:'c009', accountId:'a011', symbol:'GBPUSD', side:'SELL', vol:2.00,  lpBid:1.27208, lpAsk:1.27214, markup:0.6, clientPrice:1.27202, slippagePips:0.0, lp:'PrimaryFIX', latencyMs:11 },
    { id:'TA006', ts:'2026-05-28 11:18:33', kind:'trade_execution', server:'FX',   clientId:'c001', accountId:'a001', symbol:'XAUUSD', side:'BUY',  vol:1.00,  lpBid:2342.05, lpAsk:2342.15, markup:1.0, clientPrice:2342.25, slippagePips:0.0, lp:'PrimaryFIX', latencyMs:22 },
    { id:'TA007', ts:'2026-05-28 11:28:41', kind:'trade_execution', server:'CRYPTO', clientId:'c004', accountId:'a005', symbol:'BTCUSD', side:'SELL', vol:0.5,   lpBid:72098,   lpAsk:72102,   markup:5, clientPrice:72093, slippagePips:0.0, lp:'Binance',    latencyMs:36 },
    { id:'TA008', ts:'2026-05-28 11:42:18', kind:'trade_reject',    server:'FX',   clientId:'c011', accountId:'a013', symbol:'GBPUSD', side:'SELL', vol:50.0,  lpBid:1.27205, lpAsk:1.27212, reason:'Price out of band (>5pip)', lp:'PrimaryFIX', latencyMs:8 },
    { id:'TA009', ts:'2026-05-28 11:54:08', kind:'trade_execution', server:'FX',   clientId:'c007', accountId:'a009', symbol:'TSLA',   side:'BUY',  vol:200,   lpBid:241.45,  lpAsk:241.55,  markup:0.05, clientPrice:241.60, slippagePips:0.0, lp:'Polygon',    latencyMs:48 },
    { id:'TA010', ts:'2026-05-28 12:08:55', kind:'bet_placement',   server:'SPORTS', clientId:'c001', eventId:'e001', betType:'moneyline', selection:'Bills',        oddsAtPlacement:-260, currentOdds:-255, lineLockTs:'2026-05-28 12:08:55', stake:500, potential:692.31 },
    { id:'TA011', ts:'2026-05-28 12:11:24', kind:'bet_placement',   server:'SPORTS', clientId:'c004', eventId:'e001', betType:'spread',    selection:'Chiefs',       oddsAtPlacement:-136, currentOdds:-130, lineLockTs:'2026-05-28 12:11:24', stake:300, potential:520.59 },
    { id:'TA012', ts:'2026-05-28 12:34:02', kind:'bet_placement',   server:'SPORTS', clientId:'c007', eventId:'e006', betType:'spread',    selection:'Warriors',     oddsAtPlacement:-110, currentOdds:-110, lineLockTs:'2026-05-28 12:34:02', stake:1100, potential:2100.00 },
    { id:'TA013', ts:'2026-05-28 12:48:51', kind:'bet_placement',   server:'SPORTS', clientId:'c011', eventId:'e005', betType:'total',     selection:'Over 224.5',   oddsAtPlacement:-108, currentOdds:-108, lineLockTs:'2026-05-28 12:48:51', stake:300, potential:577.78 },
    { id:'TA014', ts:'2026-05-28 12:55:32', kind:'bet_placement',   server:'SPORTS', clientId:'c012', eventId:'e001', betType:'total',     selection:'Under 48.5',   oddsAtPlacement:-151, currentOdds:-148, lineLockTs:'2026-05-28 12:55:32', stake:800, potential:1329.80 },
    { id:'TA015', ts:'2026-05-28 13:05:42', kind:'bet_settlement',  server:'SPORTS', clientId:'c025', eventId:'e002', betType:'moneyline', selection:'Cowboys',      oddsAtPlacement:-176, settledAt:'lost', payout:0,    originalStake:176, settleSource:'auto' },
    { id:'TA016', ts:'2026-05-28 13:22:14', kind:'trade_execution', server:'CRYPTO', clientId:'c012', accountId:'a014', symbol:'ETHUSD', side:'BUY',  vol:5,     lpBid:3919.50, lpAsk:3920.50, markup:10, clientPrice:3930.50, slippagePips:0.0, lp:'Binance', latencyMs:31 },
    { id:'TA017', ts:'2026-05-28 13:48:00', kind:'trade_reject',    server:'FX',   clientId:'c004', accountId:'a005', symbol:'EURUSD', side:'SELL', vol:100.0, lpBid:1.08402, lpAsk:1.08410, reason:'Volume exceeds max lot per ticket (50)', lp:'PrimaryFIX', latencyMs:5 },
    { id:'TA018', ts:'2026-05-28 14:15:08', kind:'trade_execution', server:'FX',   clientId:'c002', accountId:'a003', symbol:'XAUUSD', side:'SELL', vol:0.05,  lpBid:2356.30, lpAsk:2356.50, markup:1.0, clientPrice:2356.20, slippagePips:0.0, lp:'PrimaryFIX', latencyMs:19 },
    { id:'TA019', ts:'2026-05-28 14:42:33', kind:'bet_placement',   server:'SPORTS', clientId:'c019', eventId:'e002', betType:'spread',    selection:'Eagles',       oddsAtPlacement:-108, currentOdds:-105, lineLockTs:'2026-05-28 14:42:33', stake:432, potential:832.00 },
    { id:'TA020', ts:'2026-05-28 15:01:24', kind:'bet_placement',   server:'SPORTS', clientId:'c020', eventId:'e010', betType:'moneyline', selection:'Maple Leafs',  oddsAtPlacement:-135, currentOdds:-130, lineLockTs:'2026-05-28 15:01:24', stake:270, potential:470.00 },
    { id:'TA021', ts:'2026-05-28 15:18:09', kind:'bet_settlement',  server:'SPORTS', clientId:'c011', eventId:'e005', betType:'total',     selection:'Over 224.5',   oddsAtPlacement:-108, settledAt:'won',  payout:577.78,  originalStake:300, settleSource:'auto' },
    { id:'TA022', ts:'2026-05-28 15:44:18', kind:'bet_settlement',  server:'SPORTS', clientId:'c012', eventId:'e001', betType:'total',     selection:'Under 48.5',   oddsAtPlacement:-151, settledAt:'won',  payout:1329.80, originalStake:800, settleSource:'manual', settledBy:'compliance@alpexa.com' },
    { id:'TA023', ts:'2026-05-28 16:02:51', kind:'trade_execution', server:'FX',   clientId:'c011', accountId:'a013', symbol:'EURUSD', side:'SELL', vol:0.30,  lpBid:1.08915, lpAsk:1.08925, markup:0.7, clientPrice:1.08908, slippagePips:0.0, lp:'PrimaryFIX', latencyMs:13 },
    { id:'TA024', ts:'2026-05-28 16:25:42', kind:'trade_execution', server:'FX',   clientId:'c003', accountId:'a004', symbol:'USDJPY', side:'BUY',  vol:0.40,  lpBid:155.905, lpAsk:155.915, markup:0.5, clientPrice:155.920, slippagePips:0.0, lp:'PrimaryFIX', latencyMs:16 },
    { id:'TA025', ts:'2026-05-28 16:38:00', kind:'bet_settlement',  server:'SPORTS', clientId:'c002', eventId:'e008', betType:'moneyline', selection:'Dodgers',      oddsAtPlacement:-180, settledAt:'lost', payout:0,    originalStake:540, settleSource:'auto' },
    // === 2026-05-27 (yesterday) ===
    { id:'TA026', ts:'2026-05-27 08:15:33', kind:'trade_execution', server:'FX',   clientId:'c001', accountId:'a001', symbol:'EURUSD', side:'BUY',  vol:2.00,  lpBid:1.08305, lpAsk:1.08310, markup:0.8, clientPrice:1.08318, slippagePips:0.0, lp:'PrimaryFIX', latencyMs:12 },
    { id:'TA027', ts:'2026-05-27 09:22:18', kind:'trade_execution', server:'FX',   clientId:'c007', accountId:'a009', symbol:'USDJPY', side:'SELL', vol:5.00,  lpBid:156.420, lpAsk:156.428, markup:0.5, clientPrice:156.415, slippagePips:0.5, lp:'PrimaryFIX', latencyMs:17 },
    { id:'TA028', ts:'2026-05-27 10:48:51', kind:'trade_execution', server:'CRYPTO', clientId:'c022', accountId:'a022', symbol:'BTCUSD', side:'BUY',  vol:0.25,  lpBid:71840,   lpAsk:71845,   markup:5, clientPrice:71850, slippagePips:0.0, lp:'Binance',    latencyMs:34 },
    { id:'TA029', ts:'2026-05-27 11:15:00', kind:'trade_reject',    server:'CRYPTO', clientId:'c012', accountId:'a014', symbol:'BTCUSD', side:'SELL', vol:10.0,  lpBid:72100,   lpAsk:72105,   reason:'Margin insufficient (1.2x required)', lp:'Binance', latencyMs:6 },
    { id:'TA030', ts:'2026-05-27 13:42:18', kind:'bet_placement',   server:'SPORTS', clientId:'c025', eventId:'e002', betType:'moneyline', selection:'Cowboys',      oddsAtPlacement:-176, currentOdds:-176, lineLockTs:'2026-05-27 13:42:18', stake:176, potential:276.00 },
    { id:'TA031', ts:'2026-05-27 14:18:51', kind:'trade_execution', server:'FX',   clientId:'c004', accountId:'a005', symbol:'TSLA',   side:'SELL', vol:50,    lpBid:240.10,  lpAsk:240.20,  markup:0.05, clientPrice:240.05, slippagePips:0.0, lp:'Polygon',    latencyMs:45 },
    { id:'TA032', ts:'2026-05-27 16:05:42', kind:'bet_settlement',  server:'SPORTS', clientId:'c019', eventId:'e007', betType:'spread',    selection:'Nuggets',      oddsAtPlacement:-110, settledAt:'won',  payout:572.73, originalStake:300, settleSource:'auto' },
    // === 2026-05-26 ===
    { id:'TA033', ts:'2026-05-26 09:08:14', kind:'trade_execution', server:'FX',   clientId:'c001', accountId:'a001', symbol:'GBPUSD', side:'BUY',  vol:3.00,  lpBid:1.27110, lpAsk:1.27118, markup:0.6, clientPrice:1.27124, slippagePips:0.0, lp:'PrimaryFIX', latencyMs:15 },
    { id:'TA034', ts:'2026-05-26 11:42:51', kind:'trade_execution', server:'FX',   clientId:'c012', accountId:'a014', symbol:'AAPL',   side:'BUY',  vol:100,   lpBid:217.20,  lpAsk:217.30,  markup:0.05, clientPrice:217.35, slippagePips:0.0, lp:'Polygon',    latencyMs:41 },
    { id:'TA035', ts:'2026-05-26 14:25:00', kind:'trade_reject',    server:'CRYPTO', clientId:'c011', accountId:'a013', symbol:'ETHUSD', side:'BUY',  vol:20.0,  lpBid:3905.20, lpAsk:3905.80, reason:'Daily loss limit reached', lp:'Binance', latencyMs:4 },
    { id:'TA036', ts:'2026-05-26 16:30:12', kind:'bet_placement',   server:'SPORTS', clientId:'c001', eventId:'e003', betType:'moneyline', selection:'49ers',        oddsAtPlacement:+230, currentOdds:+225, lineLockTs:'2026-05-26 16:30:12', stake:200, potential:660.00 },
    { id:'TA037', ts:'2026-05-26 18:42:08', kind:'bet_settlement',  server:'SPORTS', clientId:'c001', eventId:'e003', betType:'moneyline', selection:'49ers',        oddsAtPlacement:+230, settledAt:'lost', payout:0, originalStake:200, settleSource:'auto' },
    { id:'TA038', ts:'2026-05-26 20:15:33', kind:'trade_execution', server:'CRYPTO', clientId:'c004', accountId:'a006', symbol:'ETHUSD', side:'BUY',  vol:2,     lpBid:3892.10, lpAsk:3892.80, markup:10, clientPrice:3902.80, slippagePips:0.0, lp:'Binance', latencyMs:32 },
    { id:'TA039', ts:'2026-05-26 22:08:44', kind:'bet_placement',   server:'SPORTS', clientId:'c020', eventId:'e004', betType:'spread',    selection:'Packers -1.5', oddsAtPlacement:-110, currentOdds:-108, lineLockTs:'2026-05-26 22:08:44', stake:550, potential:1050.00 },
    { id:'TA040', ts:'2026-05-26 23:42:11', kind:'trade_execution', server:'FX',   clientId:'c025', accountId:'a025', symbol:'EURUSD', side:'SELL', vol:1.50,  lpBid:1.08498, lpAsk:1.08504, markup:0.8, clientPrice:1.08490, slippagePips:0.2, lp:'PrimaryFIX', latencyMs:22 }
  ];

  // Sample session/login log
  window.MANAGER.SESSION_LOG = window.MANAGER.SESSION_LOG || [
    // === 2026-05-28 (today) ===
    { id:'S001', ts:'2026-05-28 08:00:12', kind:'login',                admin:'admin@alpexa.com',      ip:'185.220.101.42', country:'CH', device:'Chrome 124 · Windows 11', mfa:true,  result:'success' },
    { id:'S002', ts:'2026-05-28 08:14:33', kind:'login',                admin:'manager1@alpexa.com',   ip:'77.221.134.18',  country:'DE', device:'Safari 17 · macOS 14',    mfa:true,  result:'success' },
    { id:'S003', ts:'2026-05-28 08:42:18', kind:'mfa_challenge',        admin:'finance@alpexa.com',    ip:'185.220.101.42', country:'CH', device:'Chrome 124 · Windows 11', mfa:true,  result:'success' },
    { id:'S004', ts:'2026-05-28 09:02:47', kind:'login',                admin:'compliance@alpexa.com', ip:'185.220.101.42', country:'CH', device:'Firefox 126 · Windows 11', mfa:true, result:'success' },
    { id:'S005', ts:'2026-05-28 09:18:21', kind:'login',                admin:'manager2@alpexa.com',   ip:'92.103.218.55',  country:'FR', device:'Edge 124 · Windows 11',   mfa:false, result:'success' },
    { id:'S006', ts:'2026-05-28 09:42:55', kind:'login_fail',           admin:'manager2@alpexa.com',   ip:'92.103.218.55',  country:'FR', device:'Edge 124 · Windows 11',   mfa:false, result:'fail', reason:'Wrong password (attempt 1)' },
    { id:'S007', ts:'2026-05-28 10:44:09', kind:'login_fail',           admin:'unknown@—',             ip:'45.142.180.211', country:'RU', device:'Headless · Linux',         mfa:false, result:'blocked', reason:'IP on watchlist · 3 failed attempts' },
    { id:'S008', ts:'2026-05-28 10:51:14', kind:'login_fail',           admin:'unknown@—',             ip:'45.142.180.211', country:'RU', device:'Headless · Linux',         mfa:false, result:'blocked', reason:'IP banned · automatic block triggered' },
    { id:'S009', ts:'2026-05-28 11:18:42', kind:'login',                admin:'risk@alpexa.com',       ip:'185.220.101.42', country:'CH', device:'Chrome 124 · Windows 11', mfa:true,  result:'success' },
    { id:'S010', ts:'2026-05-28 11:55:32', kind:'permission_denied',    admin:'support@alpexa.com',    ip:'185.220.101.42', country:'CH', device:'Chrome 124', action:'balance_adjust',  target:'c004', reason:'Role lacks finance_write' },
    { id:'S011', ts:'2026-05-28 12:03:14', kind:'permission_denied',    admin:'support@alpexa.com',    ip:'185.220.101.42', country:'CH', device:'Chrome 124', action:'commission_edit', target:'m001', reason:'Role lacks managers_write' },
    { id:'S012', ts:'2026-05-28 12:42:11', kind:'logout',               admin:'manager1@alpexa.com',   ip:'77.221.134.18',  country:'DE', device:'Safari 17 · macOS 14',    sessionDurationMin:268 },
    { id:'S013', ts:'2026-05-28 13:15:00', kind:'login',                admin:'manager1@alpexa.com',   ip:'77.221.134.18',  country:'DE', device:'Safari 17 · macOS 14',    mfa:true,  result:'success' },
    { id:'S014', ts:'2026-05-28 14:15:05', kind:'session_idle_timeout', admin:'compliance@alpexa.com', ip:'185.220.101.42', country:'CH', sessionDurationMin:312, reason:'Auto logout after 15min idle' },
    { id:'S015', ts:'2026-05-28 14:48:33', kind:'login',                admin:'compliance@alpexa.com', ip:'185.220.101.42', country:'CH', device:'Firefox 126 · Windows 11', mfa:true, result:'success' },
    { id:'S016', ts:'2026-05-28 15:28:44', kind:'password_change',      admin:'admin@alpexa.com',      ip:'185.220.101.42', country:'CH', device:'Chrome 124', result:'success' },
    { id:'S017', ts:'2026-05-28 16:01:22', kind:'mfa_disabled_attempt', admin:'manager2@alpexa.com',   ip:'92.103.218.55',  country:'FR', result:'blocked', reason:'Cannot disable MFA without super-admin' },
    { id:'S018', ts:'2026-05-28 16:42:18', kind:'role_change',          admin:'admin@alpexa.com',      ip:'185.220.101.42', country:'CH', target:'support@alpexa.com', oldRole:'support', newRole:'finance', result:'success' },
    { id:'S019', ts:'2026-05-28 17:25:08', kind:'logout',               admin:'finance@alpexa.com',    ip:'185.220.101.42', country:'CH', device:'Chrome 124 · Windows 11', sessionDurationMin:523 },
    // === 2026-05-27 (yesterday) ===
    { id:'S020', ts:'2026-05-27 07:55:42', kind:'login',                admin:'admin@alpexa.com',      ip:'185.220.101.42', country:'CH', device:'Chrome 124 · Windows 11', mfa:true,  result:'success' },
    { id:'S021', ts:'2026-05-27 08:18:14', kind:'login',                admin:'manager1@alpexa.com',   ip:'77.221.134.18',  country:'DE', device:'Safari 17 · macOS 14',    mfa:true,  result:'success' },
    { id:'S022', ts:'2026-05-27 09:42:08', kind:'login_fail',           admin:'manager1@alpexa.com',   ip:'77.221.134.18',  country:'DE', device:'Safari 17 · macOS 14',    mfa:true,  result:'fail', reason:'MFA code incorrect (attempt 2)' },
    { id:'S023', ts:'2026-05-27 11:30:55', kind:'unusual_login_pattern',admin:'manager3@alpexa.com',   ip:'118.232.55.41',  country:'KR', device:'Chrome 124 · Android',     mfa:true,  result:'flagged', reason:'Login from new country (usual: SG)' },
    { id:'S024', ts:'2026-05-27 13:48:00', kind:'permission_denied',    admin:'support@alpexa.com',    ip:'185.220.101.42', country:'CH', device:'Chrome 124', action:'kyc_override',    target:'c011', reason:'Role lacks compliance_write' },
    { id:'S025', ts:'2026-05-27 15:18:42', kind:'logout',               admin:'manager1@alpexa.com',   ip:'77.221.134.18',  country:'DE', device:'Safari 17 · macOS 14',    sessionDurationMin:420 },
    { id:'S026', ts:'2026-05-27 16:42:31', kind:'logout',               admin:'admin@alpexa.com',      ip:'185.220.101.42', country:'CH', device:'Chrome 124 · Windows 11', sessionDurationMin:528 },
    // === 2026-05-26 ===
    { id:'S027', ts:'2026-05-26 08:15:22', kind:'login',                admin:'admin@alpexa.com',      ip:'185.220.101.42', country:'CH', device:'Chrome 124 · Windows 11', mfa:true,  result:'success' },
    { id:'S028', ts:'2026-05-26 09:00:18', kind:'login',                admin:'compliance@alpexa.com', ip:'185.220.101.42', country:'CH', device:'Firefox 126 · Windows 11', mfa:true, result:'success' },
    { id:'S029', ts:'2026-05-26 12:38:51', kind:'permission_denied',    admin:'manager2@alpexa.com',   ip:'92.103.218.55',  country:'FR', device:'Edge 124', action:'role_change',     target:'manager1@alpexa.com', reason:'Cannot modify peer roles' },
    { id:'S030', ts:'2026-05-26 17:25:14', kind:'logout',               admin:'compliance@alpexa.com', ip:'185.220.101.42', country:'CH', device:'Firefox 126', sessionDurationMin:505 }
  ];

  // CSV export helper (works for any audit dataset)


  // === Crypto Spot Exchange Data ===
  window.MANAGER.CRYPTO_WALLETS = window.MANAGER.CRYPTO_WALLETS || {
    hot: [
      { asset:'BTC',  balance: 2.4567,    valueUsd:  176883,  address:'bc1q...mhx9',  threshold:5.0    },
      { asset:'ETH',  balance: 48.215,    valueUsd:  189004,  address:'0x1aB4...d7C2', threshold:80.0  },
      { asset:'USDT', balance: 845200.00, valueUsd:  845200,  address:'0xFa12...8B41', threshold:1000000 },
      { asset:'USDC', balance: 412350.00, valueUsd:  412350,  address:'0x9Bd2...8aE4', threshold:500000  }
    ],
    cold: [
      { asset:'BTC',  balance: 28.342,    valueUsd: 2042244, address:'bc1q...COLDx', vault:'Vault-1 · Geneva',   lastTouched:'2026-05-25' },
      { asset:'ETH',  balance: 412.85,    valueUsd: 1618412, address:'0xCOLD...8aB1', vault:'Vault-1 · Geneva',   lastTouched:'2026-05-25' },
      { asset:'USDT', balance: 4200000,   valueUsd: 4200000, address:'0xCOLD...USDT', vault:'Vault-2 · Zurich',   lastTouched:'2026-05-20' },
      { asset:'USDC', balance: 2150000,   valueUsd: 2150000, address:'0xCOLD...USDC', vault:'Vault-2 · Zurich',   lastTouched:'2026-05-20' }
    ],
    transfers: [
      { ts:'2026-05-28 14:22:11', kind:'hot_to_cold', asset:'BTC',  amount:5.5,   admin:'compliance@alpexa.com', txHash:'a7c2f9...e102', status:'confirmed' },
      { ts:'2026-05-28 09:08:42', kind:'cold_to_hot', asset:'USDT', amount:250000, admin:'admin@alpexa.com',      txHash:'92ae71...3c1d', status:'confirmed', reason:'Hot balance below threshold' },
      { ts:'2026-05-27 18:42:55', kind:'hot_to_cold', asset:'ETH',  amount:120.0, admin:'compliance@alpexa.com', txHash:'5c2f81...d712', status:'confirmed' },
      { ts:'2026-05-27 11:15:33', kind:'hot_to_cold', asset:'USDT', amount:500000, admin:'admin@alpexa.com',      txHash:'1ef0b9...8a44', status:'confirmed', reason:'Daily sweep' },
      { ts:'2026-05-26 22:08:14', kind:'cold_to_hot', asset:'BTC',  amount:2.0,   admin:'admin@alpexa.com',      txHash:'8af72b...c91d', status:'confirmed', reason:'Withdrawal pool refill' }
    ]
  };

  // Live crypto pair quotes (24h data)
  window.MANAGER.CRYPTO_PAIRS = window.MANAGER.CRYPTO_PAIRS || [
    { sym:'BTC/USDT',  base:'BTC',  quote:'USDT', price:71988,  change24h:+1.87, volume24h:48292845000, high24h:72541, low24h:70885 },
    { sym:'ETH/USDT',  base:'ETH',  quote:'USDT', price:3917.45, change24h:-0.42, volume24h:21420510000, high24h:3956.20, low24h:3892.10 },
    { sym:'BNB/USDT',  base:'BNB',  quote:'USDT', price:608.32,  change24h:+0.85, volume24h:2150000000,  high24h:614.50, low24h:602.10 },
    { sym:'SOL/USDT',  base:'SOL',  quote:'USDT', price:185.42,  change24h:+3.21, volume24h:4820000000,  high24h:189.30, low24h:178.50 },
    { sym:'XRP/USDT',  base:'XRP',  quote:'USDT', price:0.5234,  change24h:-1.15, volume24h:1850000000,  high24h:0.5320, low24h:0.5180 },
    { sym:'ADA/USDT',  base:'ADA',  quote:'USDT', price:0.4521,  change24h:+0.65, volume24h:920000000,   high24h:0.4580, low24h:0.4475 },
    { sym:'DOGE/USDT', base:'DOGE', quote:'USDT', price:0.1582,  change24h:+5.42, volume24h:3120000000,  high24h:0.1620, low24h:0.1495 },
    { sym:'AVAX/USDT', base:'AVAX', quote:'USDT', price:34.85,   change24h:-2.10, volume24h:480000000,   high24h:35.92, low24h:34.20 },
    { sym:'LINK/USDT', base:'LINK', quote:'USDT', price:15.42,   change24h:+1.25, volume24h:380000000,   high24h:15.68, low24h:15.12 },
    { sym:'MATIC/USDT',base:'MATIC',quote:'USDT', price:0.6845,  change24h:-0.85, volume24h:520000000,   high24h:0.6920, low24h:0.6750 },
    { sym:'TON/USDT',  base:'TON',  quote:'USDT', price:5.80,    change24h:+2.40, volume24h:380000000,   high24h:5.95,   low24h:5.65 },
    { sym:'TRX/USDT',  base:'TRX',  quote:'USDT', price:0.1352,  change24h:+1.20, volume24h:420000000,   high24h:0.1380, low24h:0.1320 },
    { sym:'DOT/USDT',  base:'DOT',  quote:'USDT', price:7.20,    change24h:-0.85, volume24h:285000000,   high24h:7.35,   low24h:7.12 },
    { sym:'LTC/USDT',  base:'LTC',  quote:'USDT', price:82.50,   change24h:+0.50, volume24h:480000000,   high24h:83.50,  low24h:81.50 },
    { sym:'BCH/USDT',  base:'BCH',  quote:'USDT', price:385.00,  change24h:-1.20, volume24h:220000000,   high24h:392.00, low24h:380.00 },
    { sym:'APT/USDT',  base:'APT',  quote:'USDT', price:9.40,    change24h:+3.20, volume24h:195000000,   high24h:9.65,   low24h:9.10 },
    { sym:'NEAR/USDT', base:'NEAR', quote:'USDT', price:5.20,    change24h:+1.80, volume24h:240000000,   high24h:5.32,   low24h:5.08 },
    { sym:'ARB/USDT',  base:'ARB',  quote:'USDT', price:0.92,    change24h:-2.10, volume24h:165000000,   high24h:0.945,  low24h:0.905 },
    { sym:'OP/USDT',   base:'OP',   quote:'USDT', price:2.10,    change24h:+0.40, volume24h:142000000,   high24h:2.14,   low24h:2.06 },
    { sym:'SUI/USDT',  base:'SUI',  quote:'USDT', price:1.05,    change24h:+4.50, volume24h:312000000,   high24h:1.085,  low24h:0.985 },
    { sym:'BTC/USDC',  base:'BTC',  quote:'USDC', price:71995,   change24h:+1.85, volume24h:8540000000,  high24h:72548, low24h:70890 },
    { sym:'ETH/USDC',  base:'ETH',  quote:'USDC', price:3918.20, change24h:-0.40, volume24h:3920000000,  high24h:3958.00, low24h:3893.00 }
  ];

  // === Other-book odds comparison + Live odds recalc ===
  window.MANAGER.OTHER_BOOKS = window.MANAGER.OTHER_BOOKS || {
    e001: { Pinnacle:{spread:-2.0, total:48.0, mlHome:+150, mlAway:-265}, DraftKings:{spread:-2.5, total:48.5, mlHome:+148, mlAway:-265}, FanDuel:{spread:-2.5, total:49.0, mlHome:+145, mlAway:-260}, BetMGM:{spread:-3.0, total:48.5, mlHome:+155, mlAway:-275} },
    e002: { Pinnacle:{spread:-3.0, total:45.0, mlHome:-175, mlAway:+145}, DraftKings:{spread:-3.5, total:45.5, mlHome:-180, mlAway:+150}, FanDuel:{spread:-3.5, total:45.5, mlHome:-178, mlAway:+148}, BetMGM:{spread:-4.0, total:46.0, mlHome:-185, mlAway:+155} },
    e003: { Pinnacle:{spread:+6.0, total:43.0, mlHome:+220, mlAway:-275}, DraftKings:{spread:+6.5, total:43.5, mlHome:+230, mlAway:-280}, FanDuel:{spread:+7.0, total:43.5, mlHome:+235, mlAway:-285}, BetMGM:{spread:+6.5, total:43.0, mlHome:+225, mlAway:-275} },
    e004: { Pinnacle:{spread:-1.5, total:46.5, mlHome:-115, mlAway:-105}, DraftKings:{spread:-1.5, total:47.0, mlHome:-118, mlAway:+100}, FanDuel:{spread:-2.0, total:47.0, mlHome:-120, mlAway:+102}, BetMGM:{spread:-1.5, total:47.5, mlHome:-116, mlAway:-104} },
    e005: { Pinnacle:{spread:+4.0, total:224.0, mlHome:+160, mlAway:-200}, DraftKings:{spread:+4.5, total:224.5, mlHome:+165, mlAway:-195}, FanDuel:{spread:+5.0, total:224.5, mlHome:+170, mlAway:-205}, BetMGM:{spread:+4.5, total:225.0, mlHome:+162, mlAway:-198} },
    e006: { Pinnacle:{spread:-3.0, total:218.0, mlHome:-170, mlAway:+140}, DraftKings:{spread:-3.5, total:218.5, mlHome:-175, mlAway:+145}, FanDuel:{spread:-4.0, total:218.5, mlHome:-180, mlAway:+150}, BetMGM:{spread:-3.5, total:219.0, mlHome:-178, mlAway:+148} },
    e007: { Pinnacle:{spread:-5.0, total:228.0, mlHome:-230, mlAway:+190}, DraftKings:{spread:-5.5, total:228.5, mlHome:-235, mlAway:+195}, FanDuel:{spread:-6.0, total:228.5, mlHome:-240, mlAway:+200}, BetMGM:{spread:-5.5, total:229.0, mlHome:-238, mlAway:+198} },
    e008: { Pinnacle:{spread:-1.5, total:8.0, mlHome:-175, mlAway:+150}, DraftKings:{spread:-1.5, total:8.5, mlHome:-180, mlAway:+155}, FanDuel:{spread:-1.5, total:8.5, mlHome:-178, mlAway:+152}, BetMGM:{spread:-1.5, total:9.0, mlHome:-185, mlAway:+158} },
    e009: { Pinnacle:{spread:-1.5, total:8.5, mlHome:-140, mlAway:+120}, DraftKings:{spread:-1.5, total:9.0, mlHome:-145, mlAway:+125}, FanDuel:{spread:-1.5, total:9.0, mlHome:-148, mlAway:+128}, BetMGM:{spread:-1.5, total:9.5, mlHome:-150, mlAway:+130} },
    e010: { Pinnacle:{spread:-1.5, total:6.0, mlHome:-130, mlAway:+110}, DraftKings:{spread:-1.5, total:6.0, mlHome:-135, mlAway:+115}, FanDuel:{spread:-1.5, total:6.5, mlHome:-138, mlAway:+118}, BetMGM:{spread:-1.5, total:6.5, mlHome:-140, mlAway:+120} },
    e011: { Pinnacle:{spread:-1.5, total:6.5, mlHome:-140, mlAway:+120}, DraftKings:{spread:-1.5, total:6.5, mlHome:-145, mlAway:+125}, FanDuel:{spread:-1.5, total:7.0, mlHome:-148, mlAway:+128}, BetMGM:{spread:-1.5, total:7.0, mlHome:-150, mlAway:+130} },
    e012: { Pinnacle:{spread:-1.5, total:6.0, mlHome:-120, mlAway:+100}, DraftKings:{spread:-1.5, total:6.0, mlHome:-125, mlAway:+105}, FanDuel:{spread:-1.5, total:6.5, mlHome:-128, mlAway:+108}, BetMGM:{spread:-1.5, total:6.0, mlHome:-122, mlAway:+102} }
  };

  // Live odds recalculation based on current score
  window.MANAGER.recalcLiveOdds = function(ev) {
    if (!ev || ev.status !== 'live') return null;
    var sH = ev.scoreHome || 0, sA = ev.scoreAway || 0;
    var diff = sH - sA;  // positive = home leading
    // Compute implied probability shift based on score difference
    // Higher diff → home more likely → ML odds widen for home, narrow for away
    var probShift = Math.min(0.40, Math.abs(diff) * 0.04); // each point ~4% prob shift, cap 40%
    var orig = ev.moneyline || {};
    var origHome = orig.home && orig.home.odds;
    var origAway = orig.away && orig.away.odds;
    function americanToProb(o) { return o >= 0 ? 100/(o+100) : Math.abs(o)/(Math.abs(o)+100); }
    function probToAmerican(p) {
      if (p >= 0.5) return Math.round(-(p/(1-p))*100);
      return Math.round(((1-p)/p)*100);
    }
    var origHomeP = origHome != null ? americanToProb(origHome) : 0.5;
    var origAwayP = origAway != null ? americanToProb(origAway) : 0.5;
    var newHomeP = diff > 0 ? Math.min(0.95, origHomeP + probShift) : Math.max(0.05, origHomeP - probShift);
    var newAwayP = 1 - newHomeP;
    // Spread adjustment: more goals/points = spread cover more likely if leading
    var origSpread = (ev.spread && ev.spread.home && ev.spread.home.line) || 0;
    var newSpread = origSpread + (diff > 0 ? -Math.min(7, diff*0.5) : Math.min(7, -diff*0.5));
    // Total adjustment: current pace
    var origTotal = (ev.total && ev.total.line) || 0;
    var paceTotal = sH + sA;
    var newTotal = origTotal + (paceTotal > origTotal/2 ? 2.5 : -2.5);
    return {
      moneyline: {
        home: { odds: probToAmerican(newHomeP), origOdds: origHome, deltaProb: ((newHomeP - origHomeP) * 100).toFixed(1) },
        away: { odds: probToAmerican(newAwayP), origOdds: origAway, deltaProb: ((newAwayP - origAwayP) * 100).toFixed(1) }
      },
      spread: { line: +newSpread.toFixed(1), origLine: origSpread, delta: +(newSpread - origSpread).toFixed(1) },
      total:  { line: +newTotal.toFixed(1),  origLine: origTotal,  delta: +(newTotal - origTotal).toFixed(1)  },
      reason: diff > 0 ? ev.homeAbbr + ' leading by ' + diff : diff < 0 ? ev.awayAbbr + ' leading by ' + Math.abs(diff) : 'tied · adjusting based on pace'
    };
  };

  // Find market consensus (median) and our position vs market
  window.MANAGER.marketConsensus = function(eventId) {
    var books = (window.MANAGER.OTHER_BOOKS || {})[eventId];
    if (!books) return null;
    var keys = Object.keys(books);
    function median(values) {
      var sorted = values.slice().sort(function(a,b){return a-b;});
      var mid = Math.floor(sorted.length/2);
      return sorted.length % 2 === 0 ? (sorted[mid-1] + sorted[mid]) / 2 : sorted[mid];
    }
    var spreads = keys.map(function(k){return books[k].spread;});
    var totals = keys.map(function(k){return books[k].total;});
    var mlHomes = keys.map(function(k){return books[k].mlHome;});
    var mlAways = keys.map(function(k){return books[k].mlAway;});
    return {
      books: keys,
      spread: { median:+median(spreads).toFixed(1), min:Math.min.apply(null, spreads), max:Math.max.apply(null, spreads) },
      total:  { median:+median(totals).toFixed(1),  min:Math.min.apply(null, totals),  max:Math.max.apply(null, totals)  },
      mlHome: { median:Math.round(median(mlHomes)), min:Math.min.apply(null, mlHomes), max:Math.max.apply(null, mlHomes) },
      mlAway: { median:Math.round(median(mlAways)), min:Math.min.apply(null, mlAways), max:Math.max.apply(null, mlAways) },
    };
  };

  window.MANAGER.exportToCsv = function(rows, filename) {
    if (!rows || !rows.length) return;
    var keys = Object.keys(rows[0]);
    var csv = keys.join(',') + '\n' + rows.map(function(r){
      return keys.map(function(k){
        var v = r[k];
        if (v == null) return '';
        v = String(v).replace(/"/g, '""');
        return v.indexOf(',') >= 0 || v.indexOf('\n') >= 0 || v.indexOf('"') >= 0 ? ('"' + v + '"') : v;
      }).join(',');
    }).join('\n');
    var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename || 'audit.csv';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  };
}, 0);


// === AuditDashboardButton — TopBar button + full audit modal ===
function AuditDashboardButton() {
  var s = React.useState(false), open = s[0], setOpen = s[1];
  var tab = React.useState('activity'), activeTab = tab[0], setTab = tab[1];
  var q = React.useState(''), query = q[0], setQuery = q[1];
  var f = React.useState(''), kindFilter = f[0], setKindFilter = f[1];
  var d1 = React.useState(''), dateFrom = d1[0], setDateFrom = d1[1];
  var d2 = React.useState(''), dateTo   = d2[0], setDateTo   = d2[1];

  function getRows() {
    var rows = activeTab === 'activity' ? (window.MANAGER.ADMIN_ACTIVITY || [])
             : activeTab === 'trades'   ? (window.MANAGER.TRADE_AUDIT || [])
             : (window.MANAGER.SESSION_LOG || []);
    if (kindFilter) rows = rows.filter(function(r){ return (r.kind || '') === kindFilter; });
    if (dateFrom || dateTo) {
      rows = rows.filter(function(r){
        var ts = (r.ts || '').slice(0, 10);
        if (dateFrom && ts < dateFrom) return false;
        if (dateTo && ts > dateTo) return false;
        return true;
      });
    }
    if (query) {
      var qq = query.toLowerCase();
      rows = rows.filter(function(r){
        return Object.values(r).some(function(v){ return v != null && String(v).toLowerCase().indexOf(qq) >= 0; });
      });
    }
    return rows;
  }

  function getKinds() {
    var rows = activeTab === 'activity' ? (window.MANAGER.ADMIN_ACTIVITY || [])
             : activeTab === 'trades'   ? (window.MANAGER.TRADE_AUDIT || [])
             : (window.MANAGER.SESSION_LOG || []);
    var set = {};
    rows.forEach(function(r){ if (r.kind) set[r.kind] = true; });
    return Object.keys(set).sort();
  }

  function doExport() {
    var rows = getRows();
    var fname = activeTab + '_' + new Date().toISOString().slice(0,10) + '.csv';
    if (window.MANAGER.exportToCsv) window.MANAGER.exportToCsv(rows, fname);
  }

  var btnStyle = {
    display:'inline-flex', alignItems:'center', gap:5,
    height: 24, padding:'0 10px', marginLeft:8,
    background:'var(--bg)', border:'1px solid var(--line-2)', borderRadius:4,
    color:'var(--text-2)', cursor:'pointer',
    fontSize:10, fontWeight:700, letterSpacing:0.4, textTransform:'uppercase',
    fontFamily:'inherit'
  };

  return React.createElement(React.Fragment, null,
    React.createElement('button', {
      onClick: function(){ setOpen(true); }, title: 'Open audit dashboard',
      style: btnStyle,
      onMouseEnter: function(e){ e.currentTarget.style.background='var(--bg-2)'; e.currentTarget.style.color='var(--ink)'; },
      onMouseLeave: function(e){ e.currentTarget.style.background='var(--bg)'; e.currentTarget.style.color='var(--text-2)'; }
    },
      React.createElement('span', { style:{fontFamily:'Material Symbols Outlined', fontSize:13} }, 'fact_check'),
      'AUDIT'
    ),
    open && React.createElement('div', {
      onClick: function(e){ if (e.target === e.currentTarget) setOpen(false); },
      style: { position:'fixed', inset:0, background:'rgba(15,23,41,0.55)', zIndex: 200, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }
    },
      React.createElement('div', {
        onClick: function(e){ e.stopPropagation(); },
        style: { width:'90vw', maxWidth:1200, height:'85vh', background:'#fff', border:'1px solid #E5E7EB', boxShadow:'0 24px 60px rgba(15,23,41,0.30)', borderRadius:6, overflow:'hidden', display:'flex', flexDirection:'column' }
      },
        React.createElement('div', { style: { padding:'10px 16px', background:'#0F1B2D', color:'#fff', display:'flex', alignItems:'center', gap:10, borderBottom:'1px solid #1B3955' } },
          React.createElement('span', { style:{fontFamily:'Material Symbols Outlined', fontSize:18, color:'#5BB0FF'} }, 'fact_check'),
          React.createElement('span', { style:{flex:1, fontSize:13, fontWeight:800, letterSpacing:0.4} }, 'AUDIT DASHBOARD'),
          React.createElement('span', { style:{padding:'3px 8px', fontSize:9, fontWeight:700, background:'rgba(255,255,255,0.10)', borderRadius:3, color:'rgba(255,255,255,0.7)', letterSpacing:0.5} }, 'READ ONLY'),
          React.createElement('button', { onClick: function(){ setOpen(false); }, style:{width:26, height:26, border:'none', background:'transparent', color:'#fff', cursor:'pointer', display:'inline-flex', alignItems:'center', justifyContent:'center'} },
            React.createElement('span', { style:{fontFamily:'Material Symbols Outlined', fontSize:18} }, 'close'))
        ),
        React.createElement('div', { style: { display:'flex', background:'#FAFBFC', borderBottom:'1px solid #E5E7EB' } },
          [
            { id:'activity', label:'Admin Activity', count: (window.MANAGER.ADMIN_ACTIVITY||[]).length },
            { id:'trades', label:'Trade & Bet Audit', count: (window.MANAGER.TRADE_AUDIT||[]).length },
            { id:'sessions', label:'Sessions & Logins', count: (window.MANAGER.SESSION_LOG||[]).length }
          ].map(function(t) {
            var active = activeTab === t.id;
            return React.createElement('button', { key: t.id, onClick: function(){ setTab(t.id); setKindFilter(''); setQuery(''); }, style: { padding:'10px 16px', background: active ? '#fff' : 'transparent', border: 'none', borderBottom: active ? '2px solid #1B3955' : '2px solid transparent', color: active ? '#1B3955' : 'var(--text-2)', fontWeight: 700, fontSize: 12, letterSpacing: 0.3, cursor:'pointer', display:'inline-flex', alignItems:'center', gap:6 } },
              t.label,
              React.createElement('span', { className:'mono', style:{padding:'1px 6px', fontSize:9, background: active ? '#EAF2FB' : 'var(--bg-2)', color: active ? '#1B3955' : 'var(--text-3)', borderRadius:3, fontWeight:800} }, t.count)
            );
          })
        ),
        React.createElement('div', { style: { padding:'10px 16px', background:'#fff', borderBottom:'1px solid #E5E7EB', display:'flex', alignItems:'center', gap:8 } },
          React.createElement('div', { style: { display:'flex', alignItems:'center', gap:5, padding:'5px 9px', background:'var(--bg)', border:'1px solid var(--line-2)', borderRadius:3, width:240, height:28 } },
            React.createElement('span', { style:{fontFamily:'Material Symbols Outlined', fontSize:14, color:'var(--text-3)'} }, 'search'),
            React.createElement('input', { value: query, onChange: function(e){ setQuery(e.target.value); }, placeholder: 'Search across all fields...', style: { flex:1, fontSize:11, color:'var(--ink)', background:'transparent', outline:'none', border:'none' } })
          ),
          React.createElement('select', { value: kindFilter, onChange: function(e){ setKindFilter(e.target.value); }, style: { fontSize:11, padding:'5px 8px', border:'1px solid var(--line-2)', borderRadius:3, background:'#fff', color:'var(--ink)', height:30 } },
            React.createElement('option', { value:'' }, 'All types'),
            getKinds().map(function(k){ return React.createElement('option', { key:k, value:k }, k); })
          ),
          React.createElement('div', {
            style: { display:'inline-flex', alignItems:'center', gap:0, height:30, border:'1px solid var(--line-2)', borderRadius:3, background:'#fff', overflow:'hidden' }
          },
            React.createElement('span', { style:{fontSize:9, color:'var(--text-3)', fontWeight:700, letterSpacing:0.4, padding:'0 8px', borderRight:'1px solid var(--line-2)'} }, 'FROM'),
            React.createElement('input', {
              type:'date', value: dateFrom, max: dateTo || undefined,
              onChange: function(e){ setDateFrom(e.target.value); },
              style: { width:130, fontSize:11, padding:'0 8px', border:'none', background:'transparent', color: dateFrom ? 'var(--ink)' : 'var(--text-3)', height:28, fontFamily:'JetBrains Mono, monospace', cursor:'pointer', outline:'none' }
            }),
            React.createElement('span', { style:{fontSize:9, color:'var(--text-3)', fontWeight:700, letterSpacing:0.4, padding:'0 8px', borderLeft:'1px solid var(--line-2)', borderRight:'1px solid var(--line-2)'} }, 'TO'),
            React.createElement('input', {
              type:'date', value: dateTo, min: dateFrom || undefined,
              onChange: function(e){ setDateTo(e.target.value); },
              style: { width:130, fontSize:11, padding:'0 8px', border:'none', background:'transparent', color: dateTo ? 'var(--ink)' : 'var(--text-3)', height:28, fontFamily:'JetBrains Mono, monospace', cursor:'pointer', outline:'none' }
            }),
            (dateFrom || dateTo) && React.createElement('button', {
              onClick: function(){ setDateFrom(''); setDateTo(''); },
              title: 'Clear date range',
              style: { height:28, padding:'0 8px', background:'#FEF2F2', border:'none', borderLeft:'1px solid var(--line-2)', fontSize:14, color:'#B91C1C', cursor:'pointer', display:'inline-flex', alignItems:'center', justifyContent:'center' }
            }, String.fromCharCode(215))
          ),
          React.createElement('span', { style:{flex:1, fontSize:11, color:'var(--text-3)', fontFamily:'JetBrains Mono, monospace'} },
            getRows().length + ' / ' + (activeTab==='activity'?(window.MANAGER.ADMIN_ACTIVITY||[]):activeTab==='trades'?(window.MANAGER.TRADE_AUDIT||[]):(window.MANAGER.SESSION_LOG||[])).length + ' entries'
          ),
          React.createElement('button', { onClick: doExport, style: { display:'inline-flex', alignItems:'center', gap:5, padding:'5px 12px', height:30, background:'#15803D', color:'#fff', border:'none', borderRadius:3, fontSize:11, fontWeight:700, cursor:'pointer', letterSpacing:0.4 } },
            React.createElement('span', { style:{fontFamily:'Material Symbols Outlined', fontSize:13} }, 'download'),
            'EXPORT CSV'
          )
        ),
        React.createElement('div', { style: { flex:1, overflow:'auto', background:'#fff' } },
          (function() {
            var rows = getRows();
            if (!rows.length) return React.createElement('div', { style: { padding:40, textAlign:'center', color:'var(--text-3)', fontSize:12 } }, 'No entries match filters.');
            var keys = Object.keys(rows[0]);
            return React.createElement('table', { style: { width:'100%', borderCollapse:'collapse', fontSize:11, fontFamily:'JetBrains Mono, monospace' } },
              React.createElement('thead', { style: { background:'#0F1B2D', color:'rgba(255,255,255,0.85)', position:'sticky', top:0 } },
                React.createElement('tr', null,
                  keys.map(function(k){ return React.createElement('th', { key:k, style:{textAlign:'left', padding:'7px 10px', fontSize:9.5, fontWeight:700, letterSpacing:0.5, textTransform:'uppercase', borderRight:'1px solid rgba(255,255,255,0.10)', whiteSpace:'nowrap'} }, k); })
                )
              ),
              React.createElement('tbody', null,
                rows.map(function(r, i) {
                  return React.createElement('tr', { key: i, style: { borderBottom:'1px solid #E5E7EB', background: i%2===1 ? '#FAFBFC' : '#fff' } },
                    keys.map(function(k) {
                      var v = r[k];
                      var disp = v == null ? '-' : (typeof v === 'object' ? JSON.stringify(v) : String(v));
                      var color = 'var(--ink)';
                      if (k === 'result' && v === 'success') color = '#15803D';
                      if (k === 'result' && v === 'blocked') color = '#B91C1C';
                      if (k === 'kind' && (String(v).indexOf('fail') >= 0 || String(v).indexOf('reject') >= 0 || String(v).indexOf('denied') >= 0 || String(v).indexOf('blocked') >= 0)) color = '#B91C1C';
                      if (k === 'kind' && String(v) === 'login') color = '#15803D';
                      return React.createElement('td', { key:k, style:{padding:'6px 10px', color:color, maxWidth:280, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}, title: disp }, disp);
                    })
                  );
                })
              )
            );
          })()
        ),
        React.createElement('div', { style: { padding:'8px 16px', background:'#F1F5F9', borderTop:'1px solid #E5E7EB', fontSize:10, color:'var(--text-3)', fontFamily:'JetBrains Mono, monospace', display:'flex', alignItems:'center', gap:8 } },
          React.createElement('span', { style:{fontFamily:'Material Symbols Outlined', fontSize:12} }, 'verified'),
          'All audit entries are append-only and tamper-evident. Retention: 7 years (MiFID II / FINMA compliance)'
        )
      )
    )
  );
}



// === CryptoWalletButton — Hot/Cold wallet management modal ===
function CryptoWalletButton() {
  var s = React.useState(false), open = s[0], setOpen = s[1];
  var t = React.useState('overview'), tab = t[0], setTab = t[1];
  var wallets = (window.MANAGER && window.MANAGER.CRYPTO_WALLETS) || { hot:[], cold:[], transfers:[] };
  var btnStyle = {
    display:'inline-flex', alignItems:'center', gap:5,
    height: 24, padding:'0 10px', marginLeft:4,
    background:'var(--bg)', border:'1px solid var(--line-2)', borderRadius:4,
    color:'var(--text-2)', cursor:'pointer',
    fontSize:10, fontWeight:700, letterSpacing:0.4, textTransform:'uppercase',
    fontFamily:'inherit'
  };
  function totalUsd(arr) { return arr.reduce(function(s,w){return s+(w.valueUsd||0);}, 0); }
  var hotTotal = totalUsd(wallets.hot);
  var coldTotal = totalUsd(wallets.cold);
  var grandTotal = hotTotal + coldTotal;
  var hotPct = grandTotal > 0 ? (hotTotal/grandTotal*100).toFixed(1) : 0;
  return React.createElement(React.Fragment, null,
    React.createElement('button', {
      onClick: function(){ setOpen(true); },
      title: 'Crypto Wallet Management',
      style: btnStyle,
      onMouseEnter: function(e){ e.currentTarget.style.background='var(--bg-2)'; e.currentTarget.style.color='var(--ink)'; },
      onMouseLeave: function(e){ e.currentTarget.style.background='var(--bg)'; e.currentTarget.style.color='var(--text-2)'; }
    },
      React.createElement('span', { style:{fontFamily:'Material Symbols Outlined', fontSize:13} }, 'account_balance_wallet'),
      'WALLETS'
    ),
    open && React.createElement('div', {
      onClick: function(e){ if (e.target === e.currentTarget) setOpen(false); },
      style: { position:'fixed', inset:0, background:'rgba(15,23,41,0.55)', zIndex: 200, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }
    },
      React.createElement('div', {
        onClick: function(e){ e.stopPropagation(); },
        style: { width:'90vw', maxWidth:1150, height:'85vh', background:'#fff', borderRadius:6, overflow:'hidden', display:'flex', flexDirection:'column', boxShadow:'0 24px 60px rgba(15,23,41,0.30)' }
      },
        React.createElement('div', { style: { padding:'10px 16px', background:'#0F1B2D', color:'#fff', display:'flex', alignItems:'center', gap:10 } },
          React.createElement('span', { style:{fontFamily:'Material Symbols Outlined', fontSize:18, color:'#F59E0B'} }, 'account_balance_wallet'),
          React.createElement('span', { style:{flex:1, fontSize:13, fontWeight:800, letterSpacing:0.4} }, 'CRYPTO WALLET MANAGEMENT'),
          React.createElement('span', { style:{padding:'3px 8px', fontSize:9, fontWeight:700, background:'rgba(255,255,255,0.10)', borderRadius:3, color:'rgba(255,255,255,0.7)', letterSpacing:0.5, fontFamily:'JetBrains Mono, monospace'} }, 'TOTAL: $' + window.MANAGER.fmt(grandTotal, 0)),
          React.createElement('button', { onClick: function(){ setOpen(false); }, style:{width:26, height:26, border:'none', background:'transparent', color:'#fff', cursor:'pointer'} },
            React.createElement('span', { style:{fontFamily:'Material Symbols Outlined', fontSize:18} }, 'close'))
        ),
        // Tabs
        React.createElement('div', { style: { display:'flex', background:'#FAFBFC', borderBottom:'1px solid #E5E7EB' } },
          [
            { id:'overview', label:'Overview' },
            { id:'hot',  label:'Hot Wallets · $' + window.MANAGER.fmt(hotTotal, 0) },
            { id:'cold', label:'Cold Storage · $' + window.MANAGER.fmt(coldTotal, 0) },
            { id:'transfers', label:'Transfers · ' + wallets.transfers.length }
          ].map(function(t2) {
            var active = tab === t2.id;
            return React.createElement('button', {
              key: t2.id, onClick: function(){ setTab(t2.id); },
              style: { padding:'10px 16px', background: active ? '#fff' : 'transparent', border:'none', borderBottom: active ? '2px solid #F59E0B' : '2px solid transparent', color: active ? '#9A3412' : 'var(--text-2)', fontWeight: 700, fontSize: 12, letterSpacing: 0.3, cursor:'pointer' }
            }, t2.label);
          })
        ),
        React.createElement('div', { style: { flex:1, overflow:'auto', padding:16, background:'#F0F2F5' } },
          tab === 'overview' && React.createElement('div', null,
            // Hot/Cold ratio bar
            React.createElement('div', { style:{background:'#fff', padding:16, borderRadius:4, marginBottom:14} },
              React.createElement('div', {style:{fontSize:10, fontWeight:800, color:'var(--text-3)', letterSpacing:0.5, textTransform:'uppercase', marginBottom:10}}, 'Hot vs Cold Distribution'),
              React.createElement('div', {style:{display:'flex', height:30, borderRadius:3, overflow:'hidden', border:'1px solid var(--line-2)'}},
                React.createElement('div', {style:{width:hotPct+'%', background:'#F59E0B', display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontSize:11, fontWeight:800, letterSpacing:0.5}}, hotPct + '% HOT'),
                React.createElement('div', {style:{flex:1, background:'#1B3955', display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontSize:11, fontWeight:800, letterSpacing:0.5}}, (100-hotPct).toFixed(1) + '% COLD')
              ),
              React.createElement('div', {style:{display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10, marginTop:14}},
                React.createElement('div', {style:{padding:'10px 14px', background:'#FFF7ED', borderLeft:'3px solid #F59E0B', borderRadius:3}},
                  React.createElement('div', {style:{fontSize:9, fontWeight:800, color:'#9A3412', letterSpacing:0.5, textTransform:'uppercase'}}, 'Hot (Liquid)'),
                  React.createElement('div', {className:'mono', style:{fontSize:18, fontWeight:800, color:'#9A3412', marginTop:4}}, '$' + window.MANAGER.fmt(hotTotal, 0)),
                  React.createElement('div', {style:{fontSize:10, color:'var(--text-3)', marginTop:2}}, wallets.hot.length + ' assets · Available for withdrawals')
                ),
                React.createElement('div', {style:{padding:'10px 14px', background:'#EAF2FB', borderLeft:'3px solid #1B3955', borderRadius:3}},
                  React.createElement('div', {style:{fontSize:9, fontWeight:800, color:'#1B3955', letterSpacing:0.5, textTransform:'uppercase'}}, 'Cold (Vault)'),
                  React.createElement('div', {className:'mono', style:{fontSize:18, fontWeight:800, color:'#1B3955', marginTop:4}}, '$' + window.MANAGER.fmt(coldTotal, 0)),
                  React.createElement('div', {style:{fontSize:10, color:'var(--text-3)', marginTop:2}}, wallets.cold.length + ' assets · Offline multi-sig')
                ),
                React.createElement('div', {style:{padding:'10px 14px', background: hotPct > 15 ? '#FEE2E2' : '#F0FDF4', borderLeft:'3px solid '+(hotPct > 15 ? '#B91C1C' : '#15803D'), borderRadius:3}},
                  React.createElement('div', {style:{fontSize:9, fontWeight:800, color: hotPct > 15 ? '#B91C1C' : '#15803D', letterSpacing:0.5, textTransform:'uppercase'}}, 'Hot Ratio'),
                  React.createElement('div', {className:'mono', style:{fontSize:18, fontWeight:800, color: hotPct > 15 ? '#B91C1C' : '#15803D', marginTop:4}}, hotPct + '%'),
                  React.createElement('div', {style:{fontSize:10, color:'var(--text-3)', marginTop:2}}, hotPct > 15 ? '⚠ Above 15% target' : '✓ Within safety target')
                )
              )
            ),
            // Per-asset breakdown
            React.createElement('div', {style:{background:'#fff', padding:16, borderRadius:4}},
              React.createElement('div', {style:{fontSize:10, fontWeight:800, color:'var(--text-3)', letterSpacing:0.5, textTransform:'uppercase', marginBottom:10}}, 'Per-Asset Breakdown'),
              React.createElement('table', {style:{width:'100%', borderCollapse:'collapse', fontSize:11, fontFamily:'JetBrains Mono, monospace'}},
                React.createElement('thead', null, React.createElement('tr', {style:{background:'#0F1B2D', color:'rgba(255,255,255,0.85)'}},
                  ['Asset', 'Hot', 'Cold', 'Total', 'Hot Ratio'].map(function(h){ return React.createElement('th', {key:h, style:{padding:'8px 10px', textAlign:'left', fontSize:9.5, fontWeight:700, letterSpacing:0.5, textTransform:'uppercase'}}, h); })
                )),
                React.createElement('tbody', null,
                  ['BTC','ETH','USDT','USDC'].map(function(a) {
                    var h = wallets.hot.find(function(w){return w.asset === a;}) || {balance:0, valueUsd:0};
                    var c = wallets.cold.find(function(w){return w.asset === a;}) || {balance:0, valueUsd:0};
                    var t = h.valueUsd + c.valueUsd;
                    var r = t > 0 ? (h.valueUsd/t*100).toFixed(1) : 0;
                    return React.createElement('tr', {key:a, style:{borderBottom:'1px solid #E5E7EB'}},
                      React.createElement('td', {style:{padding:'8px 10px', fontWeight:800, color:'#9A3412'}}, a),
                      React.createElement('td', {style:{padding:'8px 10px'}}, h.balance + ' ' + a + ' ($' + window.MANAGER.fmt(h.valueUsd, 0) + ')'),
                      React.createElement('td', {style:{padding:'8px 10px'}}, c.balance + ' ' + a + ' ($' + window.MANAGER.fmt(c.valueUsd, 0) + ')'),
                      React.createElement('td', {style:{padding:'8px 10px', fontWeight:800}}, '$' + window.MANAGER.fmt(t, 0)),
                      React.createElement('td', {style:{padding:'8px 10px', color: r > 15 ? '#B91C1C' : '#15803D', fontWeight:700}}, r + '%')
                    );
                  })
                )
              )
            )
          ),
          tab === 'hot' && React.createElement('div', {style:{background:'#fff', padding:16, borderRadius:4}},
            React.createElement('div', {style:{fontSize:10, fontWeight:800, color:'#9A3412', letterSpacing:0.5, textTransform:'uppercase', marginBottom:10, display:'flex', alignItems:'center', gap:6}},
              React.createElement('span', {style:{fontFamily:'Material Symbols Outlined', fontSize:13, color:'#F59E0B'}}, 'local_fire_department'),
              'Hot Wallets — Online, Used for Withdrawals'
            ),
            React.createElement('table', {style:{width:'100%', borderCollapse:'collapse', fontSize:11, fontFamily:'JetBrains Mono, monospace'}},
              React.createElement('thead', null, React.createElement('tr', {style:{background:'#FFF7ED', borderBottom:'2px solid #F59E0B'}},
                ['Asset', 'Balance', 'USD Value', 'Address', 'Threshold', 'Status'].map(function(h){ return React.createElement('th', {key:h, style:{padding:'8px 10px', textAlign:'left', fontSize:9.5, fontWeight:700, letterSpacing:0.5, textTransform:'uppercase', color:'#9A3412'}}, h); })
              )),
              React.createElement('tbody', null, wallets.hot.map(function(w, i) {
                var pct = w.threshold > 0 ? (w.balance / w.threshold * 100).toFixed(0) : 0;
                var status = pct < 30 ? 'LOW · Refill from cold' : pct > 100 ? 'OVER · Sweep to cold' : 'OK';
                var statusColor = pct < 30 ? '#B91C1C' : pct > 100 ? '#B45309' : '#15803D';
                return React.createElement('tr', {key:i, style:{borderBottom:'1px solid #E5E7EB'}},
                  React.createElement('td', {style:{padding:'8px 10px', fontWeight:800}}, w.asset),
                  React.createElement('td', {style:{padding:'8px 10px'}}, w.balance),
                  React.createElement('td', {style:{padding:'8px 10px', fontWeight:700}}, '$' + window.MANAGER.fmt(w.valueUsd, 0)),
                  React.createElement('td', {style:{padding:'8px 10px', fontSize:10, color:'var(--text-3)'}}, w.address),
                  React.createElement('td', {style:{padding:'8px 10px'}}, w.threshold + ' ' + w.asset),
                  React.createElement('td', {style:{padding:'8px 10px', color:statusColor, fontWeight:800, fontSize:10}}, status)
                );
              }))
            )
          ),
          tab === 'cold' && React.createElement('div', {style:{background:'#fff', padding:16, borderRadius:4}},
            React.createElement('div', {style:{fontSize:10, fontWeight:800, color:'#1B3955', letterSpacing:0.5, textTransform:'uppercase', marginBottom:10, display:'flex', alignItems:'center', gap:6}},
              React.createElement('span', {style:{fontFamily:'Material Symbols Outlined', fontSize:13, color:'#1B3955'}}, 'ac_unit'),
              'Cold Storage — Offline Multi-Sig Vault'
            ),
            React.createElement('table', {style:{width:'100%', borderCollapse:'collapse', fontSize:11, fontFamily:'JetBrains Mono, monospace'}},
              React.createElement('thead', null, React.createElement('tr', {style:{background:'#EAF2FB', borderBottom:'2px solid #1B3955'}},
                ['Asset', 'Balance', 'USD Value', 'Address', 'Vault', 'Last Touched'].map(function(h){ return React.createElement('th', {key:h, style:{padding:'8px 10px', textAlign:'left', fontSize:9.5, fontWeight:700, letterSpacing:0.5, textTransform:'uppercase', color:'#1B3955'}}, h); })
              )),
              React.createElement('tbody', null, wallets.cold.map(function(w, i) {
                return React.createElement('tr', {key:i, style:{borderBottom:'1px solid #E5E7EB'}},
                  React.createElement('td', {style:{padding:'8px 10px', fontWeight:800}}, w.asset),
                  React.createElement('td', {style:{padding:'8px 10px'}}, w.balance),
                  React.createElement('td', {style:{padding:'8px 10px', fontWeight:700}}, '$' + window.MANAGER.fmt(w.valueUsd, 0)),
                  React.createElement('td', {style:{padding:'8px 10px', fontSize:10, color:'var(--text-3)'}}, w.address),
                  React.createElement('td', {style:{padding:'8px 10px', fontSize:10}}, w.vault),
                  React.createElement('td', {style:{padding:'8px 10px', fontSize:10}}, w.lastTouched)
                );
              }))
            )
          ),
          tab === 'transfers' && React.createElement('div', {style:{background:'#fff', padding:16, borderRadius:4}},
            React.createElement('div', {style:{fontSize:10, fontWeight:800, color:'var(--text-3)', letterSpacing:0.5, textTransform:'uppercase', marginBottom:10}}, 'Hot ↔ Cold Transfer History'),
            React.createElement('table', {style:{width:'100%', borderCollapse:'collapse', fontSize:11, fontFamily:'JetBrains Mono, monospace'}},
              React.createElement('thead', null, React.createElement('tr', {style:{background:'#0F1B2D', color:'rgba(255,255,255,0.85)'}},
                ['Time', 'Direction', 'Asset', 'Amount', 'Admin', 'TX', 'Reason'].map(function(h){ return React.createElement('th', {key:h, style:{padding:'7px 10px', textAlign:'left', fontSize:9.5, fontWeight:700, letterSpacing:0.5, textTransform:'uppercase'}}, h); })
              )),
              React.createElement('tbody', null, wallets.transfers.map(function(tr, i) {
                var dirColor = tr.kind === 'hot_to_cold' ? '#1B3955' : '#F59E0B';
                var dirLabel = tr.kind === 'hot_to_cold' ? '→ Cold' : '← Hot';
                return React.createElement('tr', {key:i, style:{borderBottom:'1px solid #E5E7EB', background: i%2===1?'#FAFBFC':'#fff'}},
                  React.createElement('td', {style:{padding:'7px 10px'}}, tr.ts),
                  React.createElement('td', {style:{padding:'7px 10px', color:dirColor, fontWeight:800}}, dirLabel),
                  React.createElement('td', {style:{padding:'7px 10px', fontWeight:800}}, tr.asset),
                  React.createElement('td', {style:{padding:'7px 10px'}}, tr.amount + ' ' + tr.asset),
                  React.createElement('td', {style:{padding:'7px 10px', fontSize:10, color:'var(--text-2)'}}, tr.admin),
                  React.createElement('td', {style:{padding:'7px 10px', fontSize:10, color:'#1E40AF'}}, tr.txHash),
                  React.createElement('td', {style:{padding:'7px 10px', fontSize:10, color:'var(--text-3)'}}, tr.reason || '—')
                );
              }))
            )
          )
        )
      )
    )
  );
}


// === MarketIntelButton — TopBar/Module nav button + modal showing other-book odds + live recalc ===
function MarketIntelButton() {
  var s = React.useState(false), open = s[0], setOpen = s[1];
  var ev = React.useState(null), selectedEv = ev[0], setSelectedEv = ev[1];
  function fmt(o) { return (o > 0 ? '+' : '') + o; }
  var events = (window.MANAGER && window.MANAGER.SPORTS_EVENTS) || [];
  var current = selectedEv && events.find(function(e){return e.id === selectedEv;});
  var consensus = current ? (window.MANAGER.marketConsensus ? window.MANAGER.marketConsensus(current.id) : null) : null;
  var recalc = current && current.status === 'live' ? (window.MANAGER.recalcLiveOdds ? window.MANAGER.recalcLiveOdds(current) : null) : null;
  var otherBooks = current ? (window.MANAGER.OTHER_BOOKS || {})[current.id] : null;

  var btnStyle = {
    display:'inline-flex', alignItems:'center', gap:5,
    height: 24, padding:'0 10px', marginLeft:8,
    background:'var(--bg)', border:'1px solid var(--line-2)', borderRadius:4,
    color:'var(--text-2)', cursor:'pointer',
    fontSize:10, fontWeight:700, letterSpacing:0.4, textTransform:'uppercase',
    fontFamily:'inherit'
  };

  return React.createElement(React.Fragment, null,
    React.createElement('button', {
      onClick: function(){ setOpen(true); if (!selectedEv && events[0]) setSelectedEv(events[0].id); },
      title: 'Market intelligence — compare other books + live recalc',
      style: btnStyle,
      onMouseEnter: function(e){ e.currentTarget.style.background='var(--bg-2)'; e.currentTarget.style.color='var(--ink)'; },
      onMouseLeave: function(e){ e.currentTarget.style.background='var(--bg)'; e.currentTarget.style.color='var(--text-2)'; }
    },
      React.createElement('span', { style:{fontFamily:'Material Symbols Outlined', fontSize:13} }, 'insights'),
      'MARKET INTEL'
    ),
    open && React.createElement('div', {
      onClick: function(e){ if (e.target === e.currentTarget) setOpen(false); },
      style: { position:'fixed', inset:0, background:'rgba(15,23,41,0.55)', zIndex: 200, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }
    },
      React.createElement('div', {
        onClick: function(e){ e.stopPropagation(); },
        style: { width:'88vw', maxWidth:1100, height:'82vh', background:'#fff', borderRadius:6, overflow:'hidden', display:'flex', flexDirection:'column', boxShadow:'0 24px 60px rgba(15,23,41,0.30)' }
      },
        React.createElement('div', { style: { padding:'10px 16px', background:'#0F1B2D', color:'#fff', display:'flex', alignItems:'center', gap:10 } },
          React.createElement('span', { style:{fontFamily:'Material Symbols Outlined', fontSize:18, color:'#FBBF24'} }, 'insights'),
          React.createElement('span', { style:{flex:1, fontSize:13, fontWeight:800, letterSpacing:0.4} }, 'MARKET INTELLIGENCE'),
          React.createElement('select', {
            value: selectedEv || '',
            onChange: function(e){ setSelectedEv(e.target.value); },
            style: { fontSize:11, padding:'4px 8px', background:'#1B3955', color:'#fff', border:'1px solid #234A6E', borderRadius:3, minWidth:240 }
          },
            events.map(function(e){ return React.createElement('option', { key:e.id, value:e.id }, e.sport + ' · ' + e.awayAbbr + ' @ ' + e.homeAbbr + (e.status==='live' ? ' · LIVE' : '')); })
          ),
          React.createElement('button', { onClick: function(){ setOpen(false); }, style:{width:26, height:26, border:'none', background:'transparent', color:'#fff', cursor:'pointer'} },
            React.createElement('span', { style:{fontFamily:'Material Symbols Outlined', fontSize:18} }, 'close'))
        ),
        React.createElement('div', { style: { flex:1, overflow:'auto', padding:16, background:'#F0F2F5' } },
          !current ? React.createElement('div', {style:{textAlign:'center', padding:40, color:'var(--text-3)'}}, 'Select an event above') :
          React.createElement(React.Fragment, null,
            // Event header
            React.createElement('div', { style: { background:'#fff', padding:16, borderRadius:4, marginBottom:14, display:'flex', alignItems:'center', gap:16 } },
              React.createElement('div', { style:{flex:1} },
                React.createElement('div', { style:{fontSize:18, fontWeight:800, color:'var(--ink)'} }, current.awayAbbr + ' @ ' + current.homeAbbr),
                React.createElement('div', { style:{fontSize:11, color:'var(--text-3)', marginTop:2} }, current.sport + ' · ' + current.start + (current.status==='live' ? (' · LIVE ' + (current.scoreHome||0) + '-' + (current.scoreAway||0)) : ''))
              ),
              current.status==='live' && React.createElement('span', { style:{padding:'4px 10px', background:'#FEE2E2', color:'#B91C1C', fontSize:11, fontWeight:800, letterSpacing:0.5, borderRadius:3, animation:'mgrPulse 1.8s infinite'} }, '● LIVE')
            ),
            // Other books comparison
            otherBooks && React.createElement('div', { style: { background:'#fff', padding:14, borderRadius:4, marginBottom:14 } },
              React.createElement('div', { style:{fontSize:10, fontWeight:800, color:'var(--text-3)', letterSpacing:0.5, textTransform:'uppercase', marginBottom:10, display:'flex', alignItems:'center', gap:6} },
                React.createElement('span', { style:{fontFamily:'Material Symbols Outlined', fontSize:13, color:'#0EA5E9'} }, 'compare_arrows'),
                'Market Comparison — Other Books vs Us'
              ),
              React.createElement('table', { style:{width:'100%', fontSize:11, borderCollapse:'collapse', fontFamily:'JetBrains Mono, monospace'} },
                React.createElement('thead', null,
                  React.createElement('tr', { style:{background:'#FAFBFC', borderBottom:'1px solid #E5E7EB'} },
                    React.createElement('th', { style:{padding:'8px 10px', textAlign:'left', fontSize:9.5, fontWeight:700, color:'var(--text-3)'} }, 'Book'),
                    React.createElement('th', { style:{padding:'8px 10px', textAlign:'center', fontSize:9.5, fontWeight:700, color:'var(--text-3)'} }, 'Spread'),
                    React.createElement('th', { style:{padding:'8px 10px', textAlign:'center', fontSize:9.5, fontWeight:700, color:'var(--text-3)'} }, 'Total'),
                    React.createElement('th', { style:{padding:'8px 10px', textAlign:'center', fontSize:9.5, fontWeight:700, color:'var(--text-3)'} }, 'ML Home'),
                    React.createElement('th', { style:{padding:'8px 10px', textAlign:'center', fontSize:9.5, fontWeight:700, color:'var(--text-3)'} }, 'ML Away')
                  )
                ),
                React.createElement('tbody', null,
                  // Our row first
                  React.createElement('tr', { style:{background:'#EAF2FB', fontWeight:800} },
                    React.createElement('td', { style:{padding:'8px 10px', color:'#1B3955'} }, '★ ALPEXA (us)'),
                    React.createElement('td', { style:{padding:'8px 10px', textAlign:'center'} }, (current.spread && current.spread.home && current.spread.home.line) || '—'),
                    React.createElement('td', { style:{padding:'8px 10px', textAlign:'center'} }, (current.total && current.total.line) || '—'),
                    React.createElement('td', { style:{padding:'8px 10px', textAlign:'center', color:'#15803D'} }, fmt((current.moneyline && current.moneyline.home && current.moneyline.home.odds) || 0)),
                    React.createElement('td', { style:{padding:'8px 10px', textAlign:'center', color:'#B91C1C'} }, fmt((current.moneyline && current.moneyline.away && current.moneyline.away.odds) || 0))
                  ),
                  Object.keys(otherBooks).map(function(book) {
                    var b = otherBooks[book];
                    return React.createElement('tr', { key:book, style:{borderBottom:'1px solid #F1F5F9'} },
                      React.createElement('td', { style:{padding:'8px 10px', color:'var(--text-2)'} }, book),
                      React.createElement('td', { style:{padding:'8px 10px', textAlign:'center', color:'var(--ink)'} }, b.spread),
                      React.createElement('td', { style:{padding:'8px 10px', textAlign:'center', color:'var(--ink)'} }, b.total),
                      React.createElement('td', { style:{padding:'8px 10px', textAlign:'center', color:'#15803D'} }, fmt(b.mlHome)),
                      React.createElement('td', { style:{padding:'8px 10px', textAlign:'center', color:'#B91C1C'} }, fmt(b.mlAway))
                    );
                  }),
                  // Consensus row
                  consensus && React.createElement('tr', { style:{background:'#FEF3C7', borderTop:'2px solid #F59E0B', fontWeight:800} },
                    React.createElement('td', { style:{padding:'8px 10px', color:'#92400E'} }, 'MEDIAN'),
                    React.createElement('td', { style:{padding:'8px 10px', textAlign:'center'} }, consensus.spread.median),
                    React.createElement('td', { style:{padding:'8px 10px', textAlign:'center'} }, consensus.total.median),
                    React.createElement('td', { style:{padding:'8px 10px', textAlign:'center', color:'#15803D'} }, fmt(consensus.mlHome.median)),
                    React.createElement('td', { style:{padding:'8px 10px', textAlign:'center', color:'#B91C1C'} }, fmt(consensus.mlAway.median))
                  )
                )
              )
            ),
            // Live odds recalc
            recalc && React.createElement('div', { style: { background:'#fff', padding:14, borderRadius:4 } },
              React.createElement('div', { style:{fontSize:10, fontWeight:800, color:'var(--text-3)', letterSpacing:0.5, textTransform:'uppercase', marginBottom:10, display:'flex', alignItems:'center', gap:6} },
                React.createElement('span', { style:{fontFamily:'Material Symbols Outlined', fontSize:13, color:'#B91C1C'} }, 'live_tv'),
                'Live Recalculated Odds — based on current score'
              ),
              React.createElement('div', { style:{padding:'10px 12px', background:'#FEF3C7', border:'1px solid #FCD34D', borderRadius:4, fontSize:11, color:'#92400E', marginBottom:10} }, 'Reason: ' + recalc.reason),
              React.createElement('div', { style:{display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12} },
                React.createElement('div', { style:{padding:'10px 14px', background:'#F0FDF4', borderRadius:4, border:'1px solid #BBF7D0'} },
                  React.createElement('div', {style:{fontSize:9, fontWeight:800, color:'#15803D', letterSpacing:0.5, textTransform:'uppercase'}}, 'Moneyline'),
                  React.createElement('div', {style:{fontSize:11, marginTop:6, color:'var(--text-2)'}}, current.homeAbbr + ': ',
                    React.createElement('span', {style:{fontWeight:800, color:'#15803D'}}, fmt(recalc.moneyline.home.odds)),
                    ' (was ', fmt(recalc.moneyline.home.origOdds), ', Δ ', recalc.moneyline.home.deltaProb, '%)'),
                  React.createElement('div', {style:{fontSize:11, marginTop:4, color:'var(--text-2)'}}, current.awayAbbr + ': ',
                    React.createElement('span', {style:{fontWeight:800, color:'#15803D'}}, fmt(recalc.moneyline.away.odds)),
                    ' (was ', fmt(recalc.moneyline.away.origOdds), ', Δ ', recalc.moneyline.away.deltaProb, '%)')
                ),
                React.createElement('div', { style:{padding:'10px 14px', background:'#FFF7ED', borderRadius:4, border:'1px solid #FED7AA'} },
                  React.createElement('div', {style:{fontSize:9, fontWeight:800, color:'#9A3412', letterSpacing:0.5, textTransform:'uppercase'}}, 'Spread'),
                  React.createElement('div', {style:{fontSize:14, marginTop:6, fontWeight:800, color:'#9A3412'}}, current.homeAbbr + ' ' + (recalc.spread.line > 0 ? '+' : '') + recalc.spread.line),
                  React.createElement('div', {style:{fontSize:11, marginTop:2, color:'var(--text-3)'}}, 'was ' + (recalc.spread.origLine > 0 ? '+' : '') + recalc.spread.origLine + ' · Δ ' + (recalc.spread.delta > 0 ? '+' : '') + recalc.spread.delta)
                ),
                React.createElement('div', { style:{padding:'10px 14px', background:'#EFF6FF', borderRadius:4, border:'1px solid #BFDBFE'} },
                  React.createElement('div', {style:{fontSize:9, fontWeight:800, color:'#1E40AF', letterSpacing:0.5, textTransform:'uppercase'}}, 'Total'),
                  React.createElement('div', {style:{fontSize:14, marginTop:6, fontWeight:800, color:'#1E40AF'}}, 'O/U ' + recalc.total.line),
                  React.createElement('div', {style:{fontSize:11, marginTop:2, color:'var(--text-3)'}}, 'was ' + recalc.total.origLine + ' · Δ ' + (recalc.total.delta > 0 ? '+' : '') + recalc.total.delta)
                )
              )
            ),
            current.status !== 'live' && React.createElement('div', { style:{background:'#fff', padding:14, borderRadius:4, textAlign:'center', color:'var(--text-3)', fontSize:12} },
              React.createElement('span', { style:{fontFamily:'Material Symbols Outlined', fontSize:18, color:'var(--text-3)', verticalAlign:'middle', marginRight:6} }, 'schedule'),
              'Live recalculation only available when event is LIVE'
            )
          )
        )
      )
    )
  );
}

// === RiskAlertsBadge — footer red badge + alert list popup ===
function RiskAlertsBadge() {
  var s = React.useState(false), open = s[0], setOpen = s[1];
  var t = React.useState(0), setTick = t[1];
  React.useEffect(function() {
    var id = setInterval(function(){ setTick(function(x){return x+1;}); }, 5000);
    return function(){ clearInterval(id); };
  }, []);
  var alerts = (window.MANAGER && window.MANAGER.getRiskAlerts) ? window.MANAGER.getRiskAlerts() : [];
  var critical = alerts.filter(function(a){return a.severity === 'critical';}).length;
  var btnColor = alerts.length === 0 ? '#22C55E' : critical > 0 ? '#EF4444' : '#F59E0B';
  var iconBtnStyle = {
    position:'relative', width:26, height:24, borderRadius:3,
    background:'transparent', color:'rgba(255,255,255,0.82)', border:'none', cursor:'pointer',
    display:'flex', alignItems:'center', justifyContent:'center', transition:'background .12s'
  };
  return React.createElement(React.Fragment, null,
    React.createElement('button', {
      onClick: function(){ setOpen(function(o){return !o;}); },
      title: alerts.length + ' risk alert(s), ' + critical + ' critical',
      style: Object.assign({}, iconBtnStyle, { background: critical > 0 ? 'rgba(239,68,68,0.20)' : 'transparent' })
    },
      React.createElement('span', { style: { fontFamily:'Material Symbols Outlined', fontSize:15, color: btnColor, fontVariationSettings:"'FILL' 1, 'wght' 600" } }, alerts.length === 0 ? 'shield' : 'warning'),
      alerts.length > 0 && React.createElement('span', {
        className: 'mono',
        style: {
          position:'absolute', top:0, right:0,
          minWidth: 13, height: 13,
          padding: '0 3px',
          background: btnColor, color:'#fff',
          fontSize: 8.5, fontWeight: 800,
          borderRadius: 7,
          display:'inline-flex', alignItems:'center', justifyContent:'center',
          boxShadow:'0 0 0 1px #0F1B2D',
          animation: critical > 0 ? 'mgrPulse 1.2s infinite' : 'none'
        }
      }, alerts.length)
    ),
    open && React.createElement('div', {
      onClick: function(e){ if (e.target === e.currentTarget) setOpen(false); },
      style: { position:'fixed', inset:0, background:'rgba(15,23,41,0.45)', zIndex: 200, display:'flex', alignItems:'flex-end', justifyContent:'flex-end', padding: '0 8px 38px 0' }
    },
      React.createElement('div', {
        onClick: function(e){ e.stopPropagation(); },
        style: { width: 460, maxHeight: '70vh', background: '#fff', border:'1px solid #E5E7EB', boxShadow:'0 16px 48px rgba(15,23,41,0.30)', borderRadius: 6, overflow:'hidden', display:'flex', flexDirection:'column' }
      },
        React.createElement('div', {
          style: { padding:'10px 14px', background:'#0F1B2D', color:'#fff', display:'flex', alignItems:'center', gap:8, borderBottom:'1px solid #1B3955' }
        },
          React.createElement('span', { style: { fontFamily:'Material Symbols Outlined', fontSize:18, color: btnColor } }, 'warning'),
          React.createElement('div', { style: { flex:1, lineHeight: 1.2 } },
            React.createElement('div', { style: { fontSize:12, fontWeight:800, letterSpacing:0.4 } }, 'RISK ALERTS'),
            React.createElement('div', { style: { fontSize:10, color:'rgba(255,255,255,0.6)', fontFamily:'JetBrains Mono, monospace' } }, alerts.length + ' active · ' + critical + ' critical · refreshes every 5s')
          ),
          React.createElement('button', {
            onClick: function(){ setOpen(false); },
            style: { width:24, height:24, border:'none', background:'transparent', color:'#fff', cursor:'pointer', display:'inline-flex', alignItems:'center', justifyContent:'center' }
          }, React.createElement('span', { style:{ fontFamily:'Material Symbols Outlined', fontSize:16 } }, 'close'))
        ),
        React.createElement('div', { style: { flex:1, overflowY:'auto', background:'#FAFBFC' } },
          alerts.map(function(a, i) {
            var sevColor = a.severity === 'critical' ? '#B91C1C' : a.severity === 'high' ? '#B45309' : '#9CA3AF';
            var sevBg    = a.severity === 'critical' ? '#FEE2E2' : a.severity === 'high' ? '#FEF3C7' : '#F3F4F6';
            return React.createElement('div', {
              key: i,
              style: { padding:'10px 14px', borderBottom:'1px solid #E5E7EB', background:'#fff', display:'flex', alignItems:'center', gap:10 }
            },
              React.createElement('span', { style: { width:32, height:32, borderRadius:6, background: sevBg, color: sevColor, display:'inline-flex', alignItems:'center', justifyContent:'center', fontFamily:'Material Symbols Outlined', fontSize:18, flexShrink:0 } }, a.icon || 'warning'),
              React.createElement('div', { style: { flex:1, minWidth:0 } },
                React.createElement('div', { style: { fontSize:12.5, fontWeight:700, color:'#1B3955', display:'flex', alignItems:'center', gap:6 } },
                  a.title,
                  React.createElement('span', { style: { padding:'1px 6px', fontSize:9, fontWeight:800, letterSpacing:0.4, background: sevBg, color: sevColor, borderRadius:3, textTransform:'uppercase' } }, a.severity)
                ),
                React.createElement('div', { style: { fontSize:11, color:'#5A6478', marginTop:2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' } }, a.detail)
              ),
              a.kind === 'position_loss' || a.kind === 'margin_call' || a.kind === 'big_withdrawal'
                ? React.createElement('span', { className:'mono', style: { fontSize:12, fontWeight:800, color: a.amount < 0 ? '#B91C1C' : '#15803D' } },
                    (a.kind === 'margin_call' ? a.amount.toFixed(0) + '%' : (a.amount > 0 ? '+' : '') + '$' + window.MANAGER.fmt(Math.abs(a.amount), 0))
                  )
                : a.kind === 'event_liability'
                  ? React.createElement('span', { className:'mono', style: { fontSize:12, fontWeight:800, color:'#B91C1C' } }, '$' + window.MANAGER.fmt(a.amount, 0))
                  : null
            );
          })
        ),
        React.createElement('div', { style: { padding:'8px 14px', background:'#F1F5F9', borderTop:'1px solid #E5E7EB', fontSize:10, color:'#5A6478', fontFamily:'JetBrains Mono, monospace', textAlign:'center' } },
          'Thresholds — Position loss: $', window.MANAGER.RISK_THRESHOLDS.positionLossUsd, ' · Margin: ', window.MANAGER.RISK_THRESHOLDS.accountMarginPct, '% · Event liability: $', window.MANAGER.RISK_THRESHOLDS.eventLiabilityUsd, ' · Withdrawal: $', window.MANAGER.RISK_THRESHOLDS.pendingWithdrawalUsd
        )
      )
    )
  );
}

// === Injected from src/manager-app.jsx: TopBar, ModuleNav, ServerSelector ===
function TopBar({
  route,
  setRoute,
  server,
  setServer,
  quotesOpen,
  setQuotesOpen,
  openClientFilter,
  clientSearch,
  setClientSearch
}) {
  const items = [{
    id: 'accounts',
    icon: 'account_balance',
    label: 'Accounts',
    count: MANAGER.ACCOUNTS.filter(a => !server || a.tag === server).length
  }, {
    id: 'funding',
    icon: 'compare_arrows',
    label: 'Funding',
    count: MANAGER.FUNDING_REQUESTS.filter(r => r.status === 'pending' && (!server || (r.server || 'FX') === server)).length,
    countColor: '#F59E0B'

  }, server === 'SPORTS' && {
    id: 'sports_ops',
    icon: 'sports_soccer',
    label: 'Sports Ops',
    count: MANAGER.SPORTS_BETS.filter(b => b.status === 'open').length,
    countColor: '#7C3AED'
  }, server === 'CRYPTO' && {
    id: 'wallets',
    icon: 'account_balance_wallet',
    label: 'Wallets',
    count: (MANAGER.WALLETS || []).length,
    countColor: '#F59E0B'
  }, {
    id: 'managers',
    icon: 'badge',
    label: 'Managers',
    count: MANAGER.MANAGERS.length
  }, {
    id: 'reports',
    icon: 'analytics',
    label: 'Reports'
  }, {
    id: 'settings',
    icon: 'settings',
    label: 'Settings'
  }].filter(Boolean);
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      background: 'var(--surface)',
      borderBottom: '1px solid var(--line)',
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      padding: '0 14px',
      height: 48,
      gap: 10
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 300,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 1,
      flexShrink: 0,
      lineHeight: 1,
      marginLeft: -14
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--brand)',
      fontSize: 16,
      fontWeight: 800,
      color: 'var(--ink)',
      letterSpacing: 3,
      lineHeight: 1,
      whiteSpace: 'nowrap'
    }
  }, "ALPEXA"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 5,
      marginTop: 2
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 18,
      height: 1,
      background: 'var(--line-2)'
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--brand)',
      fontSize: 7.5,
      fontWeight: 700,
      color: 'var(--text-3)',
      letterSpacing: 2
    }
  }, "SUISSE"), /*#__PURE__*/React.createElement("div", {
    style: {
      width: 18,
      height: 1,
      background: 'var(--line-2)'
    }
  }))),

  /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 5,
      padding: '4px 9px',
      background: 'var(--bg)',
      borderRadius: 6,
      border: '1px solid var(--line-2)',
      width: 220,
      height: 28,
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'Material Symbols Outlined',
      fontSize: 14,
      color: 'var(--text-3)'
    }
  }, "search"), /*#__PURE__*/React.createElement("input", {
    value: clientSearch || '',
    onChange: e => setClientSearch && setClientSearch(e.target.value),
    placeholder: "Search clients\u2026",
    style: {
      flex: 1,
      fontSize: 11,
      color: 'var(--ink)',
      background: 'transparent',
      outline: 'none',
      border: 'none',
      minWidth: 0
    }
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      width: 1,
      height: 24,
      background: 'var(--line)',
      margin: '0 4px',
      flexShrink: 0
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 28,
      height: 28,
      borderRadius: 14,
      background: 'var(--ink)',
      color: 'var(--ink-fg)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: 11,
      fontWeight: 800,
      letterSpacing: 0.5
    }
  }, "AD"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      lineHeight: 1.15
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 11,
      fontWeight: 700,
      color: 'var(--ink)',
      whiteSpace: 'nowrap'
    }
  }, "Admin"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 9.5,
      color: 'var(--text-3)',
      whiteSpace: 'nowrap'
    }
  }, "admin@alpexa.com")), /*#__PURE__*/React.createElement("button", {
    title: "Sign out",
    style: {
      width: 24,
      height: 24,
      borderRadius: 5,
      background: 'transparent',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: 'var(--text-3)',
      border: 'none',
      cursor: 'pointer'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'Material Symbols Outlined',
      fontSize: 15
    }
  }, "logout")))));
}
function ModuleNav({
  route,
  setRoute,
  openClientFilter,
  server
}) {
  const items = [{
    id: 'accounts',
    icon: 'account_balance',
    label: 'Accounts',
    count: MANAGER.ACCOUNTS.filter(a => !server || a.tag === server).length
  }, {
    id: 'funding',
    icon: 'compare_arrows',
    label: 'Funding',
    count: MANAGER.FUNDING_REQUESTS.filter(r => r.status === 'pending' && (!server || (r.server || 'FX') === server)).length,
    countColor: '#F59E0B'

  }, server === 'SPORTS' && {
    id: 'sports_ops',
    icon: 'sports_soccer',
    label: 'Sports Ops',
    count: MANAGER.SPORTS_BETS.filter(b => b.status === 'open').length,
    countColor: '#7C3AED'
  }, server === 'CRYPTO' && {
    id: 'wallets',
    icon: 'account_balance_wallet',
    label: 'Wallets',
    count: (MANAGER.WALLETS || []).length,
    countColor: '#F59E0B'
  }, {
    id: 'managers',
    icon: 'badge',
    label: 'Managers',
    count: MANAGER.MANAGERS.length
  }, {
    id: 'reports',
    icon: 'analytics',
    label: 'Reports'
  }, {
    id: 'settings',
    icon: 'settings',
    label: 'Settings'
  }].filter(Boolean);
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'flex-end',
      padding: '0 14px',
      height: 42,
      gap: 2,
      background: 'var(--surface)',
      borderBottom: '1px solid var(--line)',
      flexShrink: 0
    }
  }, items.map(item => {
    const active = route === item.id;
    return /*#__PURE__*/React.createElement("div", {
      key: item.id,
      style: {
        display: 'flex',
        alignItems: 'center'
      }
    }, /*#__PURE__*/React.createElement("button", {
      onClick: () => {
        setRoute(item.id);
        if (item.id === 'clients') openClientFilter && openClientFilter('all');
      },
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 5,
        padding: '7px 11px',
        borderRadius: 7,
        background: active ? 'var(--acc-3)' : 'transparent',
        color: active ? 'var(--acc-2)' : 'var(--text-2)',
        border: 'none',
        cursor: 'pointer',
        fontWeight: active ? 700 : 500,
        fontSize: 12,
        whiteSpace: 'nowrap',
        height: 30
      },
      onMouseEnter: e => {
        if (!active) e.currentTarget.style.background = 'var(--bg)';
      },
      onMouseLeave: e => {
        if (!active) e.currentTarget.style.background = 'transparent';
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: 'Material Symbols Outlined',
        fontSize: 16,
        color: active ? 'var(--acc-2)' : 'var(--text-2)',
        fontVariationSettings: `'FILL' ${active ? 1 : 0}, 'wght' 500, 'GRAD' 0, 'opsz' 24`
      }
    }, item.icon), /*#__PURE__*/React.createElement("span", null, item.label), item.count !== undefined && item.count > 0 && /*#__PURE__*/React.createElement("span", {
      onClick: item.id === 'clients' ? e => {
        e.stopPropagation();
        openClientFilter && openClientFilter('online');
      } : undefined,
      title: item.id === 'clients' ? 'Show online clients only' : undefined,
      className: "mono",
      style: {
        fontSize: 9,
        fontWeight: 700,
        padding: '1px 5px',
        borderRadius: 8,
        background: item.countColor ? item.countColor + '22' : 'var(--bg)',
        color: item.countColor || 'var(--text-3)',
        cursor: item.id === 'clients' ? 'pointer' : 'default'
      }
    }, item.count)));
  }), /*#__PURE__*/React.createElement("div", { style: { marginLeft: 8, paddingLeft: 8, borderLeft: '1px solid var(--line)', display:'inline-flex', alignItems:'center', gap:4 } },
    server === 'CRYPTO' && /*#__PURE__*/React.createElement(CryptoWalletButton, null),
    server === 'SPORTS' && /*#__PURE__*/React.createElement(MarketIntelButton, null),
    /*#__PURE__*/React.createElement(AuditDashboardButton, null)
  ));
}
function ServerSelector({
  server,
  setServer,
  dropUp
}) {
  const [open, setOpen] = useState(false);
  const cur = SERVERS.find(s => s.id === server) || SERVERS[0];

  // Counts per server (for badge)
  const counts = {
    LIVE: MANAGER.ACCOUNTS.filter(a => a.tag === 'FX').length,
    CRYPTO: MANAGER.ACCOUNTS.filter(a => a.tag === 'CRYPTO').length,
    SPORTS: 0
  };
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative'
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => setOpen(!open),
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4,
      padding: 0,
      background: 'transparent',
      border: 'none',
      cursor: 'pointer',
      color: 'var(--text-3)',
      fontSize: 10,
      fontFamily: 'inherit',
      fontWeight: 500
    },
    onMouseEnter: e => {
      e.currentTarget.style.color = 'var(--text-2)';
    },
    onMouseLeave: e => {
      e.currentTarget.style.color = 'var(--text-3)';
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      whiteSpace: 'nowrap'
    }
  }, cur.label), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'Material Symbols Outlined',
      fontSize: 11,
      transform: open ? dropUp ? 'rotate(0deg)' : 'rotate(180deg)' : dropUp ? 'rotate(180deg)' : 'none',
      transition: 'transform 0.15s'
    }
  }, "expand_more")), open && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    onClick: () => setOpen(false),
    style: {
      position: 'fixed',
      inset: 0,
      zIndex: 50
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      ...(dropUp ? {
        bottom: 'calc(100% + 8px)'
      } : {
        top: 'calc(100% + 8px)'
      }),
      left: 0,
      zIndex: 60,
      minWidth: 240,
      background: 'var(--surface)',
      borderRadius: 8,
      boxShadow: 'var(--shadow-lg)',
      border: '1px solid var(--line)',
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 9.5,
      fontWeight: 700,
      color: 'var(--text-3)',
      letterSpacing: 0.6,
      padding: '8px 12px 6px',
      textTransform: 'uppercase',
      background: '#FAF8F2',
      borderBottom: '1px solid var(--line)'
    }
  }, "Switch Server"), SERVERS.map(s => {
    const sel = server === s.id;
    return /*#__PURE__*/React.createElement("button", {
      key: s.id,
      onClick: () => {
        setServer(s.id);
        setOpen(false);
      },
      style: {
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '9px 12px',
        background: sel ? 'var(--bg)' : 'transparent',
        border: 'none',
        cursor: 'pointer',
        textAlign: 'left',
        borderBottom: '1px solid var(--line)'
      },
      onMouseEnter: e => {
        if (!sel) e.currentTarget.style.background = 'var(--bg)';
      },
      onMouseLeave: e => {
        if (!sel) e.currentTarget.style.background = 'transparent';
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        width: 6,
        height: 6,
        borderRadius: '50%',
        background: s.color,
        flexShrink: 0
      }
    }), /*#__PURE__*/React.createElement("div", {
      style: {
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        lineHeight: 1.2
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 11.5,
        fontWeight: 700,
        color: 'var(--ink)',
        letterSpacing: 0.2
      }
    }, "ALPEXA ", s.label), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 9.5,
        color: 'var(--text-3)',
        marginTop: 2,
        letterSpacing: 0.2
      }
    }, s.sub)), /*#__PURE__*/React.createElement("span", {
      className: "mono",
      style: {
        fontSize: 9.5,
        fontWeight: 700,
        color: 'var(--text-3)'
      }
    }, counts[s.id] || 0), sel && /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: 'Material Symbols Outlined',
        fontSize: 14,
        color: 'var(--ink)'
      }
    }, "check"));
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '7px 12px',
      background: '#FAF8F2',
      fontSize: 9.5,
      color: 'var(--text-3)',
      lineHeight: 1.45
    }
  }, "Views are filtered by the selected server. Client KYC and profile are shared."))));
}

// === Original compiled JSX ===
// ─── manager-data ─────────────────────────────────────
// ALPEXA Manager — Mock data for back office demo
// Real implementation would fetch from API.

const CLIENTS = [{
  id: 'c026', firstName: 'Liam', lastName: 'Chen', email: 'liam.chen@example.ie',
  phone: '+353 87-•••2147', country: 'IE', dob: '1991-08-19', kyc: 'verified', risk: 'low',
  group: 'Standard', manager: 'manager_kim', online: true, registered: '2026-06-01 10:14:22',
  lastSeen: '2026-06-05 09:41', sessionDevice: 'iPhone 15'
}, {
  id: 'c027', firstName: 'Yuki', lastName: 'Tanaka', email: 'yuki.tanaka@example.jp',
  phone: '+81 80-•••5829', country: 'JP', dob: '1988-03-12', kyc: 'verified', risk: 'low',
  group: 'Pro', manager: 'manager_park', online: true, registered: '2026-06-02 14:22:08',
  lastSeen: '2026-06-05 11:08', sessionDevice: 'MacBook Pro'
}, {
  id: 'c028', firstName: 'Sofia', lastName: 'Esposito', email: 'sofia.esposito@example.it',
  phone: '+39 333-•••6147', country: 'IT', dob: '1985-11-25', kyc: 'verified', risk: 'low',
  group: 'VIP', manager: 'manager_kim', online: true, registered: '2026-06-03 09:48:51',
  lastSeen: '2026-06-05 11:42', sessionDevice: 'iPhone 15 Pro Max'
}, {
  id: 'c029', firstName: 'Lucas', lastName: 'Martin', email: 'lucas.martin@example.es',
  phone: '+34 6•••2148', country: 'ES', dob: '1993-05-08', kyc: 'verified', risk: 'medium',
  group: 'Standard', manager: 'manager_park', online: false, registered: '2026-06-04 11:30:14',
  lastSeen: '2026-06-04 22:18', sessionDevice: 'Samsung S24'
}, {
  id: 'c030', firstName: 'Hannah', lastName: 'Mueller', email: 'hannah.mueller@example.de',
  phone: '+49 17•••8841', country: 'DE', dob: '1990-09-17', kyc: 'verified', risk: 'low',
  group: 'Pro', manager: 'manager_kim', online: true, registered: '2026-06-04 16:25:33',
  lastSeen: '2026-06-05 10:55', sessionDevice: 'iPad Pro'
}];

// Generate additional accounts for the new clients
const ADDITIONAL_ACCOUNTS = [];
const ACCOUNTS = [
  { id: 'a029', clientId: 'c026', accountNo: 'FX-2847',   tag: 'FX',     currency: 'EUR', balance: 25000.00,  equity: 25000.00,  margin: 0, leverage: 100, group: 'Standard', created: '2026-06-01 10:14:22' },
  { id: 'a032', clientId: 'c026', accountNo: 'CR-841759', tag: 'CRYPTO', currency: 'USD', balance: 5000.00,   equity: 5000.00,   margin: 0, leverage: 5,   group: 'Standard', created: '2026-06-01 10:14:23' },
  { id: 'sw013', clientId: 'c026', accountNo: 'SP-194820',tag: 'SPORTS', currency: 'USD', balance: 500.00,    equity: 500.00,    margin: 0, leverage: 1,   group: 'Standard', created: '2026-06-01 10:14:24' },
  { id: 'a030', clientId: 'c027', accountNo: 'FX-3592',   tag: 'FX',     currency: 'JPY', balance: 3000000,   equity: 3000000,   margin: 0, leverage: 200, group: 'Pro',      created: '2026-06-02 14:22:08' },
  { id: 'a033', clientId: 'c027', accountNo: 'CR-847221', tag: 'CRYPTO', currency: 'USD', balance: 8500.00,   equity: 8500.00,   margin: 0, leverage: 10,  group: 'Pro',      created: '2026-06-02 14:22:09' },
  { id: 'sw014', clientId: 'c027', accountNo: 'SP-285103',tag: 'SPORTS', currency: 'USD', balance: 1200.00,   equity: 1200.00,   margin: 0, leverage: 1,   group: 'Pro',      created: '2026-06-02 14:22:10' },
  { id: 'a031', clientId: 'c028', accountNo: 'FX-8471',   tag: 'FX',     currency: 'USD', balance: 180000.00, equity: 180000.00, margin: 0, leverage: 500, group: 'VIP',      created: '2026-06-03 09:48:51' },
  { id: 'a034', clientId: 'c028', accountNo: 'CR-928104', tag: 'CRYPTO', currency: 'USD', balance: 42000.00,  equity: 42000.00,  margin: 0, leverage: 10,  group: 'VIP',      created: '2026-06-03 09:48:52' },
  { id: 'sw015', clientId: 'c028', accountNo: 'SP-374829',tag: 'SPORTS', currency: 'USD', balance: 8800.00,   equity: 8800.00,   margin: 0, leverage: 1,   group: 'VIP',      created: '2026-06-03 09:48:53' },
  { id: 'a035', clientId: 'c029', accountNo: 'FX-2953',   tag: 'FX',     currency: 'EUR', balance: 7500.00,   equity: 7500.00,   margin: 0, leverage: 100, group: 'Standard', created: '2026-06-04 11:30:14' },
  { id: 'a036', clientId: 'c029', accountNo: 'CR-193847', tag: 'CRYPTO', currency: 'USD', balance: 1800.00,   equity: 1800.00,   margin: 0, leverage: 5,   group: 'Standard', created: '2026-06-04 11:30:15' },
  { id: 'sw016', clientId: 'c029', accountNo: 'SP-462173',tag: 'SPORTS', currency: 'USD', balance: 300.00,    equity: 300.00,    margin: 0, leverage: 1,   group: 'Standard', created: '2026-06-04 11:30:16' },
  { id: 'a037', clientId: 'c030', accountNo: 'FX-9283',   tag: 'FX',     currency: 'EUR', balance: 35000.00,  equity: 35000.00,  margin: 0, leverage: 200, group: 'Pro',      created: '2026-06-04 16:25:33' },
  { id: 'a038', clientId: 'c030', accountNo: 'CR-284917', tag: 'CRYPTO', currency: 'USD', balance: 12500.00,  equity: 12500.00,  margin: 0, leverage: 10,  group: 'Pro',      created: '2026-06-04 16:25:34' },
  { id: 'sw017', clientId: 'c030', accountNo: 'SP-573819',tag: 'SPORTS', currency: 'USD', balance: 950.00,    equity: 950.00,    margin: 0, leverage: 1,   group: 'Pro',      created: '2026-06-04 16:25:35' }
];
const FUNDING_REQUESTS = [
  // ── Liam (c026) ──
  { id: 'f101', server: 'FX', clientId: 'c026', accountId: 'a029', kind: 'deposit',
    status: 'pending', method: 'SWIFT', currency: 'EUR', amount: 10000,
    bankRef: 'AIB-IE-2026-50112847', requested: '2026-06-03 09:18',
    notes: 'EUR SWIFT deposit from AIB' },
  { id: 'f102', server: 'CRYPTO', clientId: 'c026', accountId: 'a032', kind: 'deposit',
    status: 'pending', method: 'USDT', currency: 'USD', amount: 2500, asset: 'USDT', network: 'ERC-20',
    txHash: '0xab1F2D8C5e3b9A0f7E4C2B1d6F8a3E5C9D2B7A4F12345',
    requested: '2026-06-04 14:22', notes: 'USDT ERC-20 deposit' },
  { id: 'f201', server: 'FX', clientId: 'c026', accountId: 'a029', kind: 'transfer',
    status: 'completed', method: 'INTERNAL', currency: 'USD', amount: 2000,
    fromServer: 'FX', toServer: 'CRYPTO', fromAccount: '#FX-50112847', toAccount: '#BNX-2841759',
    requested: '2026-06-03 10:25', notes: 'Internal transfer FX → CRYPTO' },

  // ── Yuki (c027) ──
  { id: 'f103', server: 'FX', clientId: 'c027', accountId: 'a030', kind: 'deposit',
    status: 'pending', method: 'SWIFT', currency: 'JPY', amount: 500000,
    bankRef: 'MUFG-JP-2026-50213592', requested: '2026-06-04 02:15',
    notes: 'JPY SWIFT from MUFG' },
  { id: 'f105', server: 'FX', clientId: 'c027', accountId: 'a030', kind: 'deposit',
    status: 'approved', method: 'SEPA', currency: 'EUR', amount: 3000,
    bankRef: 'SEPA-DE-2026-9482', requested: '2026-06-02 09:45',
    notes: 'EUR SEPA deposit' },
  { id: 'f202', server: 'FX', clientId: 'c027', accountId: 'a030', kind: 'transfer',
    status: 'completed', method: 'INTERNAL', currency: 'USD', amount: 500,
    fromServer: 'FX', toServer: 'SPORTS', fromAccount: '#FX-50213592', toAccount: '#SP-285103',
    requested: '2026-06-03 13:08', notes: 'Internal transfer FX → SPORTS (bet funding)' },

  // ── Sofia (c028 VIP) ──
  { id: 'f104', server: 'CRYPTO', clientId: 'c028', accountId: 'a034', kind: 'withdrawal',
    status: 'rejected', method: 'USDT', currency: 'USD', amount: 25000, asset: 'USDT', network: 'ERC-20',
    destAddress: '0xC4F1e9a8B7d2C5F8E3a1D9F2',
    requested: '2026-06-04 16:30', notes: 'AML review required — high amount' },
  { id: 'f106', server: 'CRYPTO', clientId: 'c028', accountId: 'a034', kind: 'deposit',
    status: 'pending', method: 'BTC', currency: 'USD', amount: 65000, asset: 'BTC', network: 'Bitcoin',
    txHash: 'bc1q9h6tq80vmwcy7z8x6y4n2k3l5p7q9r1s3t5u7v',
    requested: '2026-06-04 18:42', notes: '1.0 BTC deposit' },
  { id: 'f203', server: 'CRYPTO', clientId: 'c028', accountId: 'a034', kind: 'transfer',
    status: 'pending', method: 'INTERNAL', currency: 'USD', amount: 8000,
    fromServer: 'CRYPTO', toServer: 'FX', fromAccount: '#BNX-4928104', toAccount: '#FX-50318471',
    requested: '2026-06-03 16:42', notes: 'Convert crypto gains to FX trading capital' },
  { id: 'f107', server: 'SPORTS', clientId: 'c028', accountId: 'sw015', kind: 'deposit',
    status: 'approved', method: 'USDT', currency: 'USD', amount: 1500, asset: 'USDT', network: 'ERC-20',
    txHash: '0x9F8E7D6C5B4A3F2E1D0C9B8A7F6E5D4C3B2A1F0E',
    requested: '2026-06-01 11:30', notes: 'SPORTS USDT deposit' },
  { id: 'f108', server: 'SPORTS', clientId: 'c028', accountId: 'sw015', kind: 'withdrawal',
    status: 'approved', method: 'USDT', currency: 'USD', amount: 800, asset: 'USDT', network: 'ERC-20',
    destAddress: '0x1A2B3C4D5E6F7A8B9C0D1E2F',
    requested: '2026-05-28 14:30', notes: 'Win payout' }
];
const POSITIONS = [{
  id: 'p001',
  clientId: 'c001',
  accountId: 'a001',
  sym: 'EURUSD',
  side: 'BUY',
  vol: 5.00,
  open: 1.08120,
  current: 1.08412,
  pnl: 14600.00,
  opened: '2026-05-18 09:42'
}, {
  id: 'p002',
  clientId: 'c001',
  accountId: 'a001',
  sym: 'XAUUSD',
  side: 'BUY',
  vol: 1.00,
  open: 2342.10,
  current: 2348.15,
  pnl: 605.00,
  opened: '2026-05-18 11:15'
}, {
  id: 'p003',
  clientId: 'c004',
  accountId: 'a005',
  sym: 'NVDA',
  side: 'BUY',
  vol: 100,
  open: 911.20,
  current: 924.18,
  pnl: 1298.00,
  opened: '2026-05-15 22:30'
}, {
  id: 'p004',
  clientId: 'c004',
  accountId: 'a005',
  sym: 'BTCUSD',
  side: 'SELL',
  vol: 0.5,
  open: 72100,
  current: 71284.6,
  pnl: 407.70,
  opened: '2026-05-17 18:22'
}, {
  id: 'p005',
  clientId: 'c007',
  accountId: 'a009',
  sym: 'USDJPY',
  side: 'SELL',
  vol: 10.00,
  open: 156.910,
  current: 156.342,
  pnl: 3635.46,
  opened: '2026-05-18 14:08'
}, {
  id: 'p006',
  clientId: 'c007',
  accountId: 'a009',
  sym: 'TSLA',
  side: 'BUY',
  vol: 200,
  open: 241.50,
  current: 247.31,
  pnl: 1162.00,
  opened: '2026-05-17 19:14'
}, {
  id: 'p007',
  clientId: 'c009',
  accountId: 'a011',
  sym: 'GBPUSD',
  side: 'SELL',
  vol: 2.00,
  open: 1.27210,
  current: 1.26834,
  pnl: 752.00,
  opened: '2026-05-18 08:11'
}, {
  id: 'p008',
  clientId: 'c012',
  accountId: 'a014',
  sym: 'AAPL',
  side: 'BUY',
  vol: 300,
  open: 215.10,
  current: 218.74,
  pnl: -7820.50,
  opened: '2026-05-16 22:55'
}, {
  id: 'p009',
  clientId: 'c012',
  accountId: 'a014',
  sym: 'ETHUSD',
  side: 'BUY',
  vol: 5,
  open: 3920,
  current: 3842.18,
  pnl: -12450.30,
  opened: '2026-05-17 20:42'
}, {
  id: 'p010',
  clientId: 'c011',
  accountId: 'a013',
  sym: 'EURUSD',
  side: 'SELL',
  vol: 0.30,
  open: 1.08920,
  current: 1.08412,
  pnl: 152.40,
  opened: '2026-05-16 18:30'
}, {
  id: 'p011',
  clientId: 'c003',
  accountId: 'a004',
  sym: 'USDJPY',
  side: 'BUY',
  vol: 0.40,
  open: 155.910,
  current: 156.342,
  pnl: 110.40,
  opened: '2026-05-15 19:47'
}, {
  id: 'p012',
  clientId: 'c002',
  accountId: 'a003',
  sym: 'XAUUSD',
  side: 'SELL',
  vol: 0.05,
  open: 2356.40,
  current: 2348.15,
  pnl: 41.25,
  opened: '2026-05-16 15:08'
}];
const ADMIN_ACTIVITY = [
  { ts: '2026-06-05 11:42', admin: 'admin@alpexa.com',       kind: 'funding_approve',  target: 'f203', detail: 'Sofia (c028) CRYPTO→FX transfer $8,000 — multi-sig pending' },
  { ts: '2026-06-05 11:12', admin: 'admin@alpexa.com',       kind: 'treasury_move',    target: 'ALPEXA-COLD→ALPEXA-HOT', detail: 'Refill HOT 200,000 USDT (3-of-5 sig)' },
  { ts: '2026-06-05 10:55', admin: 'compliance@alpexa.com',  kind: 'kyc_change',       target: 'c028', detail: 'Sofia Esposito · KYC Tier 2 → Tier 3 VIP' },
  { ts: '2026-06-05 10:23', admin: 'admin@alpexa.com',       kind: 'device_connect',   target: 'MetaMask',     detail: '0xAB1F…7A4F linked to ALPEXA-HOT' },
  { ts: '2026-06-05 09:41', admin: 'manager_kim@alpexa.com', kind: 'balance_adjust',   target: 'c026', detail: 'Liam Chen FX +$5,000 (welcome bonus)' },
  { ts: '2026-06-05 09:12', admin: 'system',                 kind: 'login',            target: 'admin@alpexa.com', detail: 'Login from 203.0.113.42 (Zürich)' },
  { ts: '2026-06-05 08:45', admin: 'admin@alpexa.com',       kind: 'funding_approve',  target: 'f105', detail: 'Yuki (c027) FX deposit ¥500,000 approved' },
  { ts: '2026-06-04 22:18', admin: 'system',                 kind: 'audit_export',     target: 'AUDIT',  detail: 'Daily audit log archived (482 events)' },
  { ts: '2026-06-04 16:42', admin: 'manager_park@alpexa.com',kind: 'leverage_change',  target: 'c027', detail: 'Yuki Tanaka FX: 1:100 → 1:200 (Pro upgrade)' },
  { ts: '2026-06-04 14:30', admin: 'compliance@alpexa.com',  kind: 'funding_reject',   target: 'f104', detail: 'Sofia withdrawal $25,000 — AML review required' },
  { ts: '2026-06-04 13:08', admin: 'manager_kim@alpexa.com', kind: 'group_change',     target: 'c028', detail: 'Sofia: Standard → VIP' },
  { ts: '2026-06-04 11:25', admin: 'admin@alpexa.com',       kind: 'position_edit',    target: 'p104', detail: 'Liam EURUSD lot 2.5 → 1.5 (manual reduce)' },
  { ts: '2026-06-04 10:08', admin: 'admin@alpexa.com',       kind: 'funding_approve',  target: 'f201', detail: 'Liam FX→CRYPTO transfer $2,000 completed' },
  { ts: '2026-06-03 18:42', admin: 'system',                 kind: 'risk_alert',       target: 'c028', detail: 'Margin level 85% on a036 — auto-notification sent' },
  { ts: '2026-06-03 15:18', admin: 'manager_kim@alpexa.com', kind: 'kyc_change',       target: 'c027', detail: 'Yuki passport re-uploaded — approved' },
  { ts: '2026-06-03 13:08', admin: 'admin@alpexa.com',       kind: 'funding_approve',  target: 'f202', detail: 'Yuki FX→SPORTS transfer $500 — bet funding' },
  { ts: '2026-06-03 10:25', admin: 'admin@alpexa.com',       kind: 'commission_payout',target: 'manager_kim', detail: 'Monthly commission paid: $4,250.00' },
  { ts: '2026-06-03 09:45', admin: 'compliance@alpexa.com',  kind: 'sanctions_check',  target: 'c026', detail: 'Liam Chen · OFAC/EU sanctions clean' },
  { ts: '2026-06-02 22:30', admin: 'admin@alpexa.com',       kind: 'treasury_move',    target: 'ALPEXA-HOT→Customer', detail: 'Withdrawal payout: 12,400 USDT to 0x8E…2A1F' },
  { ts: '2026-06-02 19:30', admin: 'manager_park@alpexa.com',kind: 'position_close',   target: 'p106', detail: 'Yuki SPY force-closed (margin call)' },
  { ts: '2026-06-02 17:15', admin: 'admin@alpexa.com',       kind: 'settings_change',  target: 'leverage_limits', detail: 'VIP tier: 1:400 → 1:500' },
  { ts: '2026-06-02 14:05', admin: 'admin@alpexa.com',       kind: 'funding_approve',  target: 'f102', detail: 'Liam crypto deposit 0.05 BTC approved' },
  { ts: '2026-06-01 16:08', admin: 'admin@alpexa.com',       kind: 'device_connect',   target: 'Ledger Nano X',  detail: '0x3D7E…6D7E linked to ALPEXA-COLD' },
  { ts: '2026-06-01 13:42', admin: 'system',                 kind: 'audit_export',     target: 'MONTHLY', detail: 'May audit archive: 14,820 events → S3 bucket' },
  { ts: '2026-06-01 09:00', admin: 'admin@alpexa.com',       kind: 'system_maintenance',target: 'FX server', detail: 'Server restart for OS patch — 09:00-09:05 UTC' },
  { ts: '2026-05-30 16:42', admin: 'admin@alpexa.com',       kind: 'treasury_move',    target: 'ALPEXA-COLD-USDT', detail: 'Initial deposit: 24.5M USDT' },
  { ts: '2026-05-28 14:30', admin: 'compliance@alpexa.com',  kind: 'kyc_change',       target: 'c026', detail: 'Liam Chen · KYC tier upgrade to Standard' },
  { ts: '2026-05-19 14:42', admin: 'admin@alpexa.com',       kind: 'funding_approve',  target: 'F003', detail: 'GBP 8,200 deposit approved' },
  { ts: '2026-05-19 10:22', admin: 'admin@alpexa.com',       kind: 'promotion',        target: 'CRYPTO', detail: 'Crypto deposit 0% fee promo created' }
];
const SYSTEM_SETTINGS = {
  spreadMarkup: {
    FX: 0,
    STOCK: 0,
    CRYPTO: 0,
    INDEX: 0,
    METAL: 0
  },
  leverageLimits: {
    Standard: 100,
    Pro: 200,
    VIP: 500
  },
  riskParameters: {
    marginCallPct: 80,
    stopOutPct: 50,
    maxOpenPositions: 200,
    trailingStopMinPt: 5
  },
  tradingSessions: {
    FX: {
      days: 'MTWHFU',
      open: '22:00',
      close: '22:00',
      is24h: false,
      notes: 'Sun 22:00 UTC open → Fri 22:00 UTC close'
    },
    METAL: {
      days: 'MTWHFU',
      open: '23:00',
      close: '22:00',
      is24h: false,
      notes: 'Gold/Silver: Sun 23:00 → Fri 22:00 UTC, daily break 22:00-23:00'
    },
    STOCK: {
      days: 'MTWHF',
      open: '14:30',
      close: '21:00',
      is24h: false,
      notes: 'US equities: NYSE 09:30-16:00 ET'
    },
    INDEX: {
      days: 'MTWHF',
      open: '23:00',
      close: '22:15',
      is24h: false,
      notes: 'Major index CFDs: near-24h Mon-Fri with daily break'
    },
    CRYPTO: {
      days: 'MTWHFSU',
      open: '00:00',
      close: '24:00',
      is24h: true,
      notes: '24/7 — no closure'
    }
  },
  priceFeeds: [{
    id: 'pf1',
    name: 'Primary FIX',
    endpoint: 'fix://feed1.alpexa.ch:9876',
    auth: 'PRI_KEY_2026',
    categories: 'ALL',
    enabled: true,
    status: 'live',
    latency: 12,
    failureCount: 0,
    lastTick: null,
    healthIntervalSec: 5,
    failoverThreshold: 3
  }, {
    id: 'pf2',
    name: 'Reuters Elektron',
    endpoint: 'wss://reuters.feed.broker.io',
    auth: 'RTRS_TOKEN',
    categories: 'FX,METAL,INDEX',
    enabled: true,
    status: 'standby',
    latency: 28,
    failureCount: 0,
    lastTick: null,
    healthIntervalSec: 5,
    failoverThreshold: 3
  }, {
    id: 'pf3',
    name: 'Internal Aggregator',
    endpoint: 'wss://aggr.internal',
    auth: 'INT_BASIC',
    categories: 'ALL',
    enabled: true,
    status: 'standby',
    latency: 42,
    failureCount: 0,
    lastTick: null,
    healthIntervalSec: 8,
    failoverThreshold: 5
  }, {
    id: 'pf4',
    name: 'Polygon.io',
    endpoint: 'wss://socket.polygon.io',
    auth: 'POLY_API_KEY',
    categories: 'STOCK,INDEX',
    enabled: true,
    status: 'standby',
    latency: 88,
    failureCount: 0,
    lastTick: null,
    healthIntervalSec: 5,
    failoverThreshold: 3
  }, {
    id: 'pf5',
    name: 'Binance Spot',
    endpoint: 'wss://stream.binance.com',
    auth: 'NONE_PUBLIC',
    categories: 'CRYPTO',
    enabled: true,
    status: 'standby',
    latency: 54,
    failureCount: 0,
    lastTick: null,
    healthIntervalSec: 5,
    failoverThreshold: 3
  }],
  feedAutoFallback: true,
  // When primary recovers, auto-reactivate it
  holidays: [{
    date: '2026-01-01',
    name: 'New Year\'s Day',
    categories: 'ALL'
  }, {
    date: '2026-04-03',
    name: 'Good Friday',
    categories: 'STOCK,INDEX,METAL'
  }, {
    date: '2026-07-04',
    name: 'US Independence Day',
    categories: 'STOCK,INDEX'
  }, {
    date: '2026-12-25',
    name: 'Christmas Day',
    categories: 'ALL'
  }, {
    date: '2026-12-31',
    name: 'New Year\'s Eve (early close)',
    categories: 'STOCK,INDEX,METAL'
  }]
};

// ── Managers (broker-side staff: brokers, account managers, IBs) ──
const MANAGERS = [{
  id: 'm001',
  name: 'David Mueller',
  email: 'd.mueller@alpexa.ch',
  role: 'Senior Manager',
  joined: '2025-09-12',
  country: 'CH'
}, {
  id: 'm002',
  name: 'Sophie Laurent',
  email: 's.laurent@alpexa.ch',
  role: 'Account Manager',
  joined: '2025-11-04',
  country: 'CH'
}, {
  id: 'm003',
  name: 'Marcus Chen',
  email: 'm.chen@alpexa.ch',
  role: 'Senior Manager',
  joined: '2025-07-18',
  country: 'SG'
}, {
  id: 'm004',
  name: 'Anna Bauer',
  email: 'a.bauer@alpexa.ch',
  role: 'IB Partner',
  joined: '2026-01-22',
  country: 'DE'
}, {
  id: 'm005',
  name: 'Yuki Tanaka',
  email: 'y.tanaka@alpexa.ch',
  role: 'Account Manager',
  joined: '2026-02-08',
  country: 'JP'
}];

// ── Commission rules — per-server matrix (LIVE/CRYPTO/SPORTS × Standard/Pro/VIP) ──
// LIVE rules remain at top level for backward compatibility with existing earningsFor / CommissionEditor
const COMMISSION_RULES = {
  // LIVE Forex/Metals/Indices/Stocks — per-lot commission (USD)
  Standard: {
    brokerCommissionPerLot: 3.00,
    markupSharePct: 10,
    managerRebates: [{
      managerId: 'm002',
      perLot: 1.50
    }, {
      managerId: 'm005',
      perLot: 1.00
    }]
  },
  Pro: {
    brokerCommissionPerLot: 5.00,
    markupSharePct: 15,
    managerRebates: [{
      managerId: 'm001',
      perLot: 3.00
    }, {
      managerId: 'm004',
      perLot: 2.00
    }]
  },
  VIP: {
    brokerCommissionPerLot: 7.00,
    markupSharePct: 25,
    managerRebates: [{
      managerId: 'm003',
      perLot: 5.00
    }, {
      managerId: 'm001',
      perLot: 3.00
    }]
  },
  // CRYPTO — basis points of notional traded
  CRYPTO: {
    Standard: {
      feeBps: 20,
      managerSharePct: 30,
      managerRebates: [{
        managerId: 'm002',
        bps: 8
      }, {
        managerId: 'm005',
        bps: 6
      }]
    },
    Pro: {
      feeBps: 15,
      managerSharePct: 40,
      managerRebates: [{
        managerId: 'm001',
        bps: 6
      }, {
        managerId: 'm004',
        bps: 5
      }]
    },
    VIP: {
      feeBps: 10,
      managerSharePct: 50,
      managerRebates: [{
        managerId: 'm003',
        bps: 6
      }, {
        managerId: 'm001',
        bps: 4
      }]
    }
  },
  // SPORTS — % of handle (stake) AND % of GGR (gross gaming revenue)
  SPORTS: {
    Standard: {
      handlePct: 2.0,
      ggrPct: 25,
      managerSharePct: 30,
      managerRebates: [{
        managerId: 'm002',
        handlePct: 0.6
      }, {
        managerId: 'm005',
        handlePct: 0.4
      }]
    },
    Pro: {
      handlePct: 1.5,
      ggrPct: 30,
      managerSharePct: 40,
      managerRebates: [{
        managerId: 'm001',
        handlePct: 0.5
      }, {
        managerId: 'm004',
        handlePct: 0.4
      }]
    },
    VIP: {
      handlePct: 1.0,
      ggrPct: 35,
      managerSharePct: 50,
      managerRebates: [{
        managerId: 'm003',
        handlePct: 0.5
      }, {
        managerId: 'm001',
        handlePct: 0.3
      }]
    }
  }
};

// Manager → assigned clients (primary + optional referrer split)
// Shape:
//   byClient:  { c001: 'm001' }                       — primary manager per client (legacy)
//   byManager: { m001: ['c001','c004'] }             — reverse index
//   splits:    { c001: { primary:'m001', primaryPct:70, referrer:'m003', referrerPct:30 } }
const MANAGER_ASSIGNMENTS = {
  splits: {}
};

// ── Auto-routing rules: assign new clients to managers by country/group ──
const MANAGER_ROUTING_RULES = [{
  id: 'r1',
  match: {
    country: 'CH'
  },
  managerId: 'm001',
  priority: 1,
  enabled: true,
  label: 'Switzerland → David Mueller'
}, {
  id: 'r2',
  match: {
    country: 'DE'
  },
  managerId: 'm004',
  priority: 2,
  enabled: true,
  label: 'Germany → Anna Bauer (IB)'
}, {
  id: 'r3',
  match: {
    country: 'JP'
  },
  managerId: 'm005',
  priority: 3,
  enabled: true,
  label: 'Japan → Yuki Tanaka'
}, {
  id: 'r4',
  match: {
    group: 'VIP'
  },
  managerId: 'm003',
  priority: 4,
  enabled: true,
  label: 'All VIP → Marcus Chen'
}, {
  id: 'r5',
  match: {
    group: 'Pro'
  },
  managerId: 'm001',
  priority: 5,
  enabled: true,
  label: 'Pro → David Mueller'
}, {
  id: 'r6',
  match: {},
  managerId: 'm002',
  priority: 99,
  enabled: true,
  label: 'Default → Sophie Laurent'
}];

// ── Commission Ledger — one row per trade/bet with computed commission ──
// Auto-populated by buildCommissionLedger() — see below. Each entry:
//   { id, ts, server, clientId, accountId, managerId, asset, volume, baseRate, commission, splitTo, status }
const COMMISSION_LEDGER = [];

// ── Sports betting domain data (American odds: Spread / Total / Moneyline) ─
const SPORTS_EVENTS = [
// NFL — Week 8
{
  id: 'e001',
  sport: 'NFL',
  league: 'NFL',
  homeAbbr: 'KC',
  homeTeam: 'Chiefs',
  awayAbbr: 'BUF',
  awayTeam: 'Bills',
  start: '2026-05-27 20:30',
  status: 'live',
  scoreHome: 70,
  scoreAway: 59,
  spread: {
    home: {
      line: -2.5,
      odds: -136
    },
    away: {
      line: +2.5,
      odds: -176
    }
  },
  total: {
    line: 48.5,
    over: {
      odds: -112
    },
    under: {
      odds: -151
    }
  },
  moneyline: {
    home: {
      odds: +144
    },
    away: {
      odds: -260
    }
  }
}, {
  id: 'e002',
  sport: 'NFL',
  league: 'NFL',
  homeAbbr: 'DAL',
  homeTeam: 'Cowboys',
  awayAbbr: 'PHI',
  awayTeam: 'Eagles',
  start: '2026-05-31 13:00',
  status: 'upcoming',
  spread: {
    home: {
      line: -3.5,
      odds: -112
    },
    away: {
      line: +3.5,
      odds: -108
    }
  },
  total: {
    line: 45.5,
    over: {
      odds: -110
    },
    under: {
      odds: -110
    }
  },
  moneyline: {
    home: {
      odds: -176
    },
    away: {
      odds: +148
    }
  }
}, {
  id: 'e003',
  sport: 'NFL',
  league: 'NFL',
  homeAbbr: 'SF',
  homeTeam: '49ers',
  awayAbbr: 'SEA',
  awayTeam: 'Seahawks',
  start: '2026-05-31 16:25',
  status: 'upcoming',
  spread: {
    home: {
      line: +6.5,
      odds: -110
    },
    away: {
      line: -6.5,
      odds: -110
    }
  },
  total: {
    line: 43.5,
    over: {
      odds: -105
    },
    under: {
      odds: -115
    }
  },
  moneyline: {
    home: {
      odds: +230
    },
    away: {
      odds: -280
    }
  }
}, {
  id: 'e004',
  sport: 'NFL',
  league: 'NFL',
  homeAbbr: 'GB',
  homeTeam: 'Packers',
  awayAbbr: 'MIN',
  awayTeam: 'Vikings',
  start: '2026-05-31 20:20',
  status: 'upcoming',
  spread: {
    home: {
      line: -1.5,
      odds: -110
    },
    away: {
      line: +1.5,
      odds: -110
    }
  },
  total: {
    line: 47.0,
    over: {
      odds: -108
    },
    under: {
      odds: -112
    }
  },
  moneyline: {
    home: {
      odds: -118
    },
    away: {
      odds: +100
    }
  }
},
// NBA
{
  id: 'e005',
  sport: 'NBA',
  league: 'NBA',
  homeAbbr: 'LAL',
  homeTeam: 'Lakers',
  awayAbbr: 'BOS',
  awayTeam: 'Celtics',
  start: '2026-05-27 22:30',
  status: 'upcoming',
  spread: {
    home: {
      line: +4.5,
      odds: -110
    },
    away: {
      line: -4.5,
      odds: -110
    }
  },
  total: {
    line: 224.5,
    over: {
      odds: -108
    },
    under: {
      odds: -112
    }
  },
  moneyline: {
    home: {
      odds: +165
    },
    away: {
      odds: -195
    }
  }
}, {
  id: 'e006',
  sport: 'NBA',
  league: 'NBA',
  homeAbbr: 'GSW',
  homeTeam: 'Warriors',
  awayAbbr: 'MIA',
  awayTeam: 'Heat',
  start: '2026-05-27 22:00',
  status: 'live',
  scoreHome: 87,
  scoreAway: 82,
  spread: {
    home: {
      line: -3.5,
      odds: -110
    },
    away: {
      line: +3.5,
      odds: -110
    }
  },
  total: {
    line: 218.5,
    over: {
      odds: -115
    },
    under: {
      odds: -105
    }
  },
  moneyline: {
    home: {
      odds: -175
    },
    away: {
      odds: +145
    }
  }
}, {
  id: 'e007',
  sport: 'NBA',
  league: 'NBA',
  homeAbbr: 'DEN',
  homeTeam: 'Nuggets',
  awayAbbr: 'PHX',
  awayTeam: 'Suns',
  start: '2026-05-28 21:00',
  status: 'upcoming',
  spread: {
    home: {
      line: -5.5,
      odds: -110
    },
    away: {
      line: +5.5,
      odds: -110
    }
  },
  total: {
    line: 228.5,
    over: {
      odds: -110
    },
    under: {
      odds: -110
    }
  },
  moneyline: {
    home: {
      odds: -235
    },
    away: {
      odds: +195
    }
  }
},
// MLB
{
  id: 'e008',
  sport: 'MLB',
  league: 'MLB',
  homeAbbr: 'LAD',
  homeTeam: 'Dodgers',
  awayAbbr: 'SF',
  awayTeam: 'Giants',
  start: '2026-05-27 22:10',
  status: 'upcoming',
  spread: {
    home: {
      line: -1.5,
      odds: +130
    },
    away: {
      line: +1.5,
      odds: -150
    }
  },
  total: {
    line: 8.5,
    over: {
      odds: -110
    },
    under: {
      odds: -110
    }
  },
  moneyline: {
    home: {
      odds: -180
    },
    away: {
      odds: +155
    }
  }
}, {
  id: 'e009',
  sport: 'MLB',
  league: 'MLB',
  homeAbbr: 'NYY',
  homeTeam: 'Yankees',
  awayAbbr: 'BOS',
  awayTeam: 'Red Sox',
  start: '2026-05-28 19:05',
  status: 'upcoming',
  spread: {
    home: {
      line: -1.5,
      odds: +135
    },
    away: {
      line: +1.5,
      odds: -155
    }
  },
  total: {
    line: 9.0,
    over: {
      odds: -105
    },
    under: {
      odds: -115
    }
  },
  moneyline: {
    home: {
      odds: -145
    },
    away: {
      odds: +125
    }
  }
},
// NHL
{
  id: 'e010',
  sport: 'NHL',
  league: 'NHL',
  homeAbbr: 'TOR',
  homeTeam: 'Maple Leafs',
  awayAbbr: 'MTL',
  awayTeam: 'Canadiens',
  start: '2026-05-27 19:00',
  status: 'live',
  scoreHome: 3,
  scoreAway: 2,
  spread: {
    home: {
      line: -1.5,
      odds: +155
    },
    away: {
      line: +1.5,
      odds: -180
    }
  },
  total: {
    line: 6.0,
    over: {
      odds: -108
    },
    under: {
      odds: -112
    }
  },
  moneyline: {
    home: {
      odds: -135
    },
    away: {
      odds: +115
    }
  }
}, {
  id: 'e011',
  sport: 'NHL',
  league: 'NHL',
  homeAbbr: 'EDM',
  homeTeam: 'Oilers',
  awayAbbr: 'CGY',
  awayTeam: 'Flames',
  start: '2026-05-28 21:00',
  status: 'upcoming',
  spread: {
    home: {
      line: -1.5,
      odds: +140
    },
    away: {
      line: +1.5,
      odds: -165
    }
  },
  total: {
    line: 6.5,
    over: {
      odds: -110
    },
    under: {
      odds: -110
    }
  },
  moneyline: {
    home: {
      odds: -145
    },
    away: {
      odds: +125
    }
  }
}, {
  id: 'e012',
  sport: 'NHL',
  league: 'NHL',
  homeAbbr: 'NYR',
  homeTeam: 'Rangers',
  awayAbbr: 'NJD',
  awayTeam: 'Devils',
  start: '2026-05-28 19:30',
  status: 'upcoming',
  spread: {
    home: {
      line: -1.5,
      odds: +170
    },
    away: {
      line: +1.5,
      odds: -200
    }
  },
  total: {
    line: 6.0,
    over: {
      odds: -115
    },
    under: {
      odds: -105
    }
  },
  moneyline: {
    home: {
      odds: -125
    },
    away: {
      odds: +105
    }
  }
}];

// ── Sports operations: bettor profiles, bonuses, limits ──
const SPORTS_PROFILES = {
  c001: {
    tier: 'whale',
    maxBetUsd: 5000,
    winRate: 0.62,
    clvAvg: +2.8,
    restricted: false,
    notes: 'Consistent winner. Watch closely.'
  },
  c004: {
    tier: 'recreational',
    maxBetUsd: 1000,
    winRate: 0.41,
    clvAvg: -1.5,
    restricted: false,
    notes: ''
  },
  c007: {
    tier: 'whale',
    maxBetUsd: 10000,
    winRate: 0.58,
    clvAvg: +1.4,
    restricted: false,
    notes: 'High volume, balanced'
  },
  c011: {
    tier: 'recreational',
    maxBetUsd: 500,
    winRate: 0.45,
    clvAvg: -2.1,
    restricted: false,
    notes: ''
  },
  c012: {
    tier: 'recreational',
    maxBetUsd: 2000,
    winRate: 0.48,
    clvAvg: -0.8,
    restricted: false,
    notes: ''
  },
  c002: {
    tier: 'recreational',
    maxBetUsd: 1000,
    winRate: 0.52,
    clvAvg: +0.2,
    restricted: false,
    notes: ''
  },
  c019: {
    tier: 'recreational',
    maxBetUsd: 1500,
    winRate: 0.39,
    clvAvg: -3.2,
    restricted: false,
    notes: 'Loss-chaser pattern'
  },
  c020: {
    tier: 'recreational',
    maxBetUsd: 1000,
    winRate: 0.50,
    clvAvg: 0.0,
    restricted: false,
    notes: ''
  },
  c009: {
    tier: 'sharp',
    maxBetUsd: 2000,
    winRate: 0.68,
    clvAvg: +4.1,
    restricted: true,
    notes: '★ Restricted — beat the close 28 of last 40'
  },
  c017: {
    tier: 'recreational',
    maxBetUsd: 500,
    winRate: 0.43,
    clvAvg: -1.8,
    restricted: false,
    notes: ''
  },
  c022: {
    tier: 'sharp',
    maxBetUsd: 3000,
    winRate: 0.64,
    clvAvg: +3.5,
    restricted: false,
    notes: 'Monitor — sharp on totals'
  },
  c025: {
    tier: 'recreational',
    maxBetUsd: 300,
    winRate: 0.38,
    clvAvg: -2.8,
    restricted: false,
    notes: ''
  }
};
const SPORTS_PROMOS = [{
  id: 'p001',
  name: 'New Customer Risk-Free $1000',
  type: 'risk_free',
  value: 1000,
  status: 'active',
  uses: 142,
  budget: 50000,
  expires: '2026-06-30'
}, {
  id: 'p002',
  name: 'NFL Sunday Same-Game Parlay Boost',
  type: 'odds_boost',
  value: 25,
  status: 'active',
  uses: 842,
  budget: 25000,
  expires: '2026-12-31'
}, {
  id: 'p003',
  name: 'Deposit Match 100% up to $500',
  type: 'deposit_match',
  value: 500,
  status: 'active',
  uses: 284,
  budget: 100000,
  expires: '2026-07-31'
}, {
  id: 'p004',
  name: 'NBA Finals Free $50 Bet',
  type: 'free_bet',
  value: 50,
  status: 'active',
  uses: 1842,
  budget: 50000,
  expires: '2026-06-15'
}, {
  id: 'p005',
  name: 'MLB Opening Day Boost',
  type: 'odds_boost',
  value: 20,
  status: 'expired',
  uses: 712,
  budget: 30000,
  expires: '2026-04-15'
}, {
  id: 'p006',
  name: 'Loyalty Tier 3+ Cashback',
  type: 'cashback',
  value: 10,
  status: 'active',
  uses: 48,
  budget: 10000,
  expires: '2026-12-31'
}];
const SPORTS_LIVE_FEED = [{
  ts: '14:32:18',
  clientId: 'c001',
  amount: 500,
  selection: 'Bills ML',
  odds: -260
}, {
  ts: '14:31:42',
  clientId: 'c011',
  amount: 300,
  selection: 'Lakers/Celtics O224.5',
  odds: -108
}, {
  ts: '14:30:55',
  clientId: 'c007',
  amount: 1100,
  selection: 'Warriors -3.5',
  odds: -110
}, {
  ts: '14:29:11',
  clientId: 'c012',
  amount: 800,
  selection: 'Bills/Chiefs U48.5',
  odds: -151
}, {
  ts: '14:28:22',
  clientId: 'c004',
  amount: 300,
  selection: 'Chiefs -2.5',
  odds: -136
}];

// ── Event-level hedge positions and risk limits ──
// ── RBAC (Role-Based Access Control) ──────────────────────────
// Permission tokens. Each role gets a set of these.
const ROLES = {
  super_admin: {
    label: 'Super Admin',
    color: '#9F1239',
    description: 'Full system access. Can manage roles, override approvals.',
    permissions: ['*'],
    actionLimits: {
      balanceAdjust: Infinity,
      hedge: Infinity,
      kycChange: Infinity,
      manualSettle: Infinity,
      block: Infinity
    }
  },
  risk_manager: {
    label: 'Risk Manager',
    color: '#B45309',
    description: 'Hedges, market suspension, position oversight. No client edits.',
    permissions: ['view_all', 'edit_hedge', 'edit_market', 'edit_position', 'view_reports', 'export_reports'],
    actionLimits: {
      balanceAdjust: 0,
      hedge: 50000,
      kycChange: 0,
      manualSettle: Infinity,
      block: 0
    }
  },
  compliance: {
    label: 'Compliance',
    color: '#0F766E',
    description: 'KYC, AML, blocks, regulatory reports.',
    permissions: ['view_all', 'edit_kyc', 'edit_block', 'view_activity', 'export_reports', 'edit_limits'],
    actionLimits: {
      balanceAdjust: 0,
      hedge: 0,
      kycChange: Infinity,
      manualSettle: 0,
      block: Infinity
    }
  },
  finance: {
    label: 'Finance',
    color: '#1E40AF',
    description: 'Funding approvals, balance adjustments.',
    permissions: ['view_all', 'edit_funding', 'edit_balance', 'view_reports', 'export_reports'],
    actionLimits: {
      balanceAdjust: 10000,
      hedge: 0,
      kycChange: 0,
      manualSettle: 0,
      block: 0
    }
  },
  support: {
    label: 'Support',
    color: '#5BB0FF',
    description: 'Client communication, transfers, view-only operations.',
    permissions: ['view_all', 'edit_message', 'edit_transfer', 'edit_client_info'],
    actionLimits: {
      balanceAdjust: 500,
      hedge: 0,
      kycChange: 0,
      manualSettle: 0,
      block: 0
    }
  },
  read_only: {
    label: 'Read-Only',
    color: '#5A6478',
    description: 'View dashboards and reports. No modifications.',
    permissions: ['view_all', 'export_reports'],
    actionLimits: {
      balanceAdjust: 0,
      hedge: 0,
      kycChange: 0,
      manualSettle: 0,
      block: 0
    }
  }
};

// Admin staff with assigned roles
const ADMIN_STAFF = [{
  id: 'a001',
  name: 'You (Admin)',
  email: 'admin@alpexa.com',
  role: 'super_admin',
  twoFA: true,
  lastLogin: '2026-05-27 14:32 from 82.220.12.4',
  active: true
}, {
  id: 'a002',
  name: 'Marcus Chen',
  email: 'risk@alpexa.com',
  role: 'risk_manager',
  twoFA: true,
  lastLogin: '2026-05-27 13:18 from 82.220.12.18',
  active: true
}, {
  id: 'a003',
  name: 'Sophie Laurent',
  email: 'compliance@alpexa.com',
  role: 'compliance',
  twoFA: true,
  lastLogin: '2026-05-27 11:45 from 82.220.12.7',
  active: true
}, {
  id: 'a004',
  name: 'David Mueller',
  email: 'finance@alpexa.com',
  role: 'finance',
  twoFA: false,
  lastLogin: '2026-05-27 09:08 from 82.220.12.21',
  active: true
}, {
  id: 'a005',
  name: 'Yuki Tanaka',
  email: 'support@alpexa.com',
  role: 'support',
  twoFA: false,
  lastLogin: '2026-05-27 10:42 from 82.220.12.9',
  active: true
}, {
  id: 'a006',
  name: 'Auditor (Read)',
  email: 'audit@alpexa.com',
  role: 'read_only',
  twoFA: true,
  lastLogin: '2026-05-26 16:00 from 82.220.12.55',
  active: true
}];

// Approval queue for actions above each role's limit
const APPROVAL_QUEUE = [];
const SPORTS_HEDGES = {
  // Hedge values calibrated to be reasonable fractions of net exposure (≤ 50%)
  e001: {
    hedge: 0,
    limit: 50000,
    marketStatus: 'open',
    lineLock: false
  },
  e002: {
    hedge: 0,
    limit: 50000,
    marketStatus: 'open',
    lineLock: false
  },
  e003: {
    hedge: 0,
    limit: 40000,
    marketStatus: 'open',
    lineLock: false
  },
  e004: {
    hedge: 0,
    limit: 40000,
    marketStatus: 'open',
    lineLock: false
  },
  e005: {
    hedge: 0,
    limit: 50000,
    marketStatus: 'open',
    lineLock: false
  },
  e006: {
    hedge: 250,
    limit: 50000,
    marketStatus: 'open',
    lineLock: false
  },
  // sane: stake $1100, worst ~$2100
  e007: {
    hedge: 0,
    limit: 50000,
    marketStatus: 'open',
    lineLock: false
  },
  e008: {
    hedge: 100,
    limit: 30000,
    marketStatus: 'open',
    lineLock: false
  },
  // sane: stake $540, worst $840
  e009: {
    hedge: 0,
    limit: 30000,
    marketStatus: 'open',
    lineLock: false
  },
  e010: {
    hedge: 80,
    limit: 25000,
    marketStatus: 'open',
    lineLock: false
  },
  // sane: stake $270, worst $470 → exposure $200, hedge 40%
  e011: {
    hedge: 0,
    limit: 25000,
    marketStatus: 'open',
    lineLock: false
  },
  e012: {
    hedge: 0,
    limit: 25000,
    marketStatus: 'open',
    lineLock: false
  }
};
const SPORTS_BETS = [
// Open bets — different bet types
{
  id: 'b001',
  clientId: 'c001',
  eventId: 'e001',
  betType: 'moneyline',
  selection: 'Bills',
  line: null,
  odds: -260,
  stake: 500.00,
  potential: 692.31,
  status: 'open',
  placed: '2026-05-27 18:42'
}, {
  id: 'b002',
  clientId: 'c004',
  eventId: 'e001',
  betType: 'spread',
  selection: 'Chiefs',
  line: -2.5,
  odds: -136,
  stake: 300.00,
  potential: 520.59,
  status: 'open',
  placed: '2026-05-27 19:01'
}, {
  id: 'b003',
  clientId: 'c007',
  eventId: 'e006',
  betType: 'spread',
  selection: 'Warriors',
  line: -3.5,
  odds: -110,
  stake: 1100.00,
  potential: 2100.00,
  status: 'open',
  placed: '2026-05-27 22:15'
}, {
  id: 'b004',
  clientId: 'c011',
  eventId: 'e005',
  betType: 'total',
  selection: 'Over 224.5',
  line: 224.5,
  odds: -108,
  stake: 300.00,
  potential: 577.78,
  status: 'open',
  placed: '2026-05-27 21:08'
}, {
  id: 'b005',
  clientId: 'c012',
  eventId: 'e001',
  betType: 'total',
  selection: 'Under 48.5',
  line: 48.5,
  odds: -151,
  stake: 800.00,
  potential: 1329.80,
  status: 'open',
  placed: '2026-05-27 18:55'
}, {
  id: 'b006',
  clientId: 'c002',
  eventId: 'e008',
  betType: 'moneyline',
  selection: 'Dodgers',
  line: null,
  odds: -180,
  stake: 540.00,
  potential: 840.00,
  status: 'open',
  placed: '2026-05-27 19:30'
}, {
  id: 'b007',
  clientId: 'c019',
  eventId: 'e002',
  betType: 'spread',
  selection: 'Eagles',
  line: +3.5,
  odds: -108,
  stake: 432.00,
  potential: 832.00,
  status: 'open',
  placed: '2026-05-27 19:14'
}, {
  id: 'b008',
  clientId: 'c020',
  eventId: 'e010',
  betType: 'moneyline',
  selection: 'Maple Leafs',
  line: null,
  odds: -135,
  stake: 270.00,
  potential: 470.00,
  status: 'open',
  placed: '2026-05-27 18:30'
},
// Settled
{
  id: 'b009',
  clientId: 'c009',
  eventId: 'e003',
  betType: 'moneyline',
  selection: '49ers',
  line: null,
  odds: +230,
  stake: 200.00,
  potential: 660.00,
  status: 'won',
  payout: 660.00,
  placed: '2026-05-26 19:30',
  settled: '2026-05-26 21:18'
}, {
  id: 'b010',
  clientId: 'c017',
  eventId: 'e005',
  betType: 'spread',
  selection: 'Lakers',
  line: +4.5,
  odds: -110,
  stake: 330.00,
  potential: 630.00,
  status: 'lost',
  payout: 0,
  placed: '2026-05-26 22:30',
  settled: '2026-05-27 01:42'
}, {
  id: 'b011',
  clientId: 'c022',
  eventId: 'e007',
  betType: 'total',
  selection: 'Over 228.5',
  line: 228.5,
  odds: -110,
  stake: 550.00,
  potential: 1050.00,
  status: 'won',
  payout: 1050.00,
  placed: '2026-05-26 17:00',
  settled: '2026-05-26 20:14'
}, {
  id: 'b012',
  clientId: 'c025',
  eventId: 'e002',
  betType: 'moneyline',
  selection: 'Cowboys',
  line: null,
  odds: -176,
  stake: 176.00,
  potential: 276.00,
  status: 'lost',
  payout: 0,
  placed: '2026-05-26 20:00',
  settled: '2026-05-26 22:08'
}];

// Helper: assign each client's primary manager based on their best account's group
function buildManagerAssignments() {
  MANAGER_ASSIGNMENTS.byClient = {};
  MANAGER_ASSIGNMENTS.byManager = {
    m001: [],
    m002: [],
    m003: [],
    m004: [],
    m005: []
  };
  CLIENTS.forEach(c => {
    const accs = [...ACCOUNTS, ...ADDITIONAL_ACCOUNTS].filter(a => a.clientId === c.id);
    const topAcct = accs.sort((a, b) => (b.equity || 0) - (a.equity || 0))[0];
    const group = topAcct?.group || 'Standard';
    // Round-robin within group to spread assignment
    const eligible = (COMMISSION_RULES[group]?.managerRebates || []).map(r => r.managerId);
    const mid = eligible[(parseInt(c.id.slice(1)) || 0) % Math.max(1, eligible.length)] || 'm002';
    MANAGER_ASSIGNMENTS.byClient[c.id] = mid;
    MANAGER_ASSIGNMENTS.byManager[mid] = MANAGER_ASSIGNMENTS.byManager[mid] || [];
    MANAGER_ASSIGNMENTS.byManager[mid].push(c.id);
  });
}
window.MANAGER = {
  CLIENTS,
  ACCOUNTS: [...ACCOUNTS],
  FUNDING_REQUESTS,
  POSITIONS,
  ADMIN_ACTIVITY,
  SYSTEM_SETTINGS,
  MANAGERS,
  COMMISSION_RULES,
  MANAGER_ASSIGNMENTS,
  MANAGER_ROUTING_RULES,
  COMMISSION_LEDGER,
  SPORTS_EVENTS,
  SPORTS_BETS,
  SPORTS_PROFILES,
  SPORTS_PROMOS,
  SPORTS_LIVE_FEED,
  SPORTS_HEDGES,
  ROLES,
  ADMIN_STAFF,
  APPROVAL_QUEUE
};
window.MANAGER.currentAdminId = 'a001';
window.MANAGER.getCurrentAdmin = function () {
  return ADMIN_STAFF.find(a => a.id === MANAGER.currentAdminId) || ADMIN_STAFF[0];
};
window.MANAGER.getCurrentRole = function () {
  const a = MANAGER.getCurrentAdmin();
  return ROLES[a.role];
};
window.MANAGER.hasPerm = function (perm) {
  const r = MANAGER.getCurrentRole();
  return r.permissions.includes('*') || r.permissions.includes(perm);
};
window.MANAGER.actionLimit = function (action) {
  return MANAGER.getCurrentRole().actionLimits[action] || 0;
};
window.MANAGER.requestApproval = function (req) {
  MANAGER.APPROVAL_QUEUE.unshift({
    ...req,
    id: 'r' + Date.now(),
    requestedBy: MANAGER.currentAdminId,
    requestedAt: new Date().toISOString().slice(0, 19).replace('T', ' '),
    status: 'pending'
  });
  if (MANAGER.ADMIN_ACTIVITY) MANAGER.ADMIN_ACTIVITY.unshift({
    ts: new Date().toISOString().slice(0, 19).replace('T', ' '),
    admin: MANAGER.getCurrentAdmin().email,
    kind: 'approval_request',
    target: req.target || '—',
    detail: `${req.action} requires approval: ${req.detail}`
  });
};

// Generate additional bulk clients for testing scroll with 100+ records
(function generateBulkClients() { return; // disabled
  const FIRST_NAMES = ['Aria', 'Ben', 'Cara', 'Diego', 'Eli', 'Fiona', 'Gabe', 'Hana', 'Ivan', 'Julia', 'Kai', 'Lara', 'Mila', 'Nico', 'Owen', 'Priya', 'Quinn', 'Ravi', 'Sara', 'Tom', 'Uma', 'Vera', 'Will', 'Xena', 'Yara', 'Zane', 'Bruno', 'Clara', 'Damian', 'Eva', 'Felix', 'Greta', 'Hugo', 'Iris', 'Jake', 'Kira', 'Leo', 'Maya', 'Niko', 'Olga', 'Paul', 'Rita', 'Sofia', 'Theo', 'Una'];
  const LAST_NAMES = ['Becker', 'Cohen', 'Dubois', 'Erikson', 'Fischer', 'Goldberg', 'Hoffman', 'Ito', 'Jensen', 'Klein', 'Lopez', 'Mahmood', 'Novak', 'Ortega', 'Pacheco', 'Quinn', 'Rocha', 'Saito', 'Tanaka', 'Ueda', 'Volkov', 'Wagner', 'Yamamoto', 'Zhang', 'Adams', 'Brown', 'Chan', 'Davis', 'Evans', 'Foster'];
  const COUNTRIES = ['KR', 'JP', 'US', 'GB', 'DE', 'FR', 'ES', 'IT', 'PL', 'BR', 'MX', 'AU', 'CA', 'NL', 'SE', 'CH', 'AE', 'IN', 'SG', 'HK', 'PT', 'IE', 'DK', 'AT', 'BE'];
  const STATUSES = ['active', 'active', 'active', 'active', 'active', 'limited'];
  const KYCS = ['verified', 'verified', 'verified', 'verified', 'pending', 'rejected'];
  const RISKS = ['low', 'low', 'medium', 'medium', 'high'];
  const times = ['09:14:22', '10:42:08', '11:28:35', '13:15:47', '14:32:18', '15:48:51', '16:22:09', '17:54:33', '18:11:42', '19:28:15', '20:42:08', '21:18:35'];
  const DEVICES = ['iPhone 15', 'Android Pixel', 'MacBook Pro', 'Windows · Chrome', 'iPad Air', 'iMac · Safari'];
  const start = CLIENTS.length;
  for (let i = 0; i < 110; i++) {
    const idNum = start + i + 1;
    const cid = 'c' + String(idNum).padStart(3, '0');
    const firstName = FIRST_NAMES[i * 7 % FIRST_NAMES.length];
    const lastName = LAST_NAMES[i * 11 % LAST_NAMES.length];
    const country = COUNTRIES[i * 5 % COUNTRIES.length];
    const status = STATUSES[i * 3 % STATUSES.length];
    const kyc = KYCS[i * 7 % KYCS.length];
    const risk = RISKS[i * 13 % RISKS.length];
    const online = i * 17 % 5 < 3;
    const device = DEVICES[i * 5 % DEVICES.length];
    const month = String(i % 5 + 1).padStart(2, '0');
    const day = String(i * 3 % 28 + 1).padStart(2, '0');
    const joined = `2026-${month}-${day}`;
    const lastSeen = online ? `2026-05-19 14:${String(40 - i % 30).padStart(2, '0')}` : `2026-05-${String(15 + i % 5).padStart(2, '0')} 0${i % 9 + 1}:${String(i * 7 % 60).padStart(2, '0')}`;
    CLIENTS.push({
      id: cid,
      firstName,
      lastName,
      email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}@example.com`,
      phone: `+1 ${String(200 + i % 800).padStart(3, '0')}-•••-${String(1000 + i * 31 % 9000)}`,
      country,
      dob: `198${i % 9}-${month}-${day}`,
      kyc,
      risk,
      joined,
      status,
      online,
      lastSeen,
      sessionDevice: device
    });

    // Generate one LIVE account
    const balance = Math.round((5000 + i * 1234 % 95000) / 100) * 100;
    const equity = Math.round(balance * (0.92 + i * 7 % 20 / 100));
    const currencies = ['USD', 'EUR', 'GBP', 'JPY', 'CHF'];
    const currency = currencies[i % currencies.length];
    const groups = ['Standard', 'Standard', 'Standard', 'Pro', 'VIP'];
    const group = groups[i * 3 % groups.length];
    window.MANAGER.ACCOUNTS.push({
      id: 'a' + String(100 + idNum).padStart(3, '0'),
      clientId: cid,
      accountNo: String(30000000 + idNum * 1234).padStart(8, '0'),
      tag: 'FX',
      currency,
      balance: currency === 'JPY' ? balance * 150 : balance,
      equity: currency === 'JPY' ? equity * 150 : equity,
      margin: Math.round(balance * 0.04),
      leverage: [30, 100, 200][i % 3],
      group,
      created: joined + ' ' + times[i * 7 % times.length]
    });
  }
})();
buildManagerAssignments();

// Helper utilities
window.MANAGER.fmt = function (n, decimals = 2) {
  return Number(n).toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
};
window.MANAGER.findClient = function (id) {
  return CLIENTS.find(c => c.id === id);
};
window.MANAGER.findAccounts = function (clientId) {
  return (window.MANAGER.ACCOUNTS || ACCOUNTS).filter(a => a.clientId === clientId);
};
window.MANAGER.findPositions = function (clientId) {
  return (window.MANAGER.POSITIONS || POSITIONS).filter(p => p.clientId === clientId);
};
// Find primary manager for a client
window.MANAGER.findManagerForClient = function (clientId) {
  const mid = MANAGER_ASSIGNMENTS.byClient && MANAGER_ASSIGNMENTS.byClient[clientId];
  return MANAGERS.find(m => m.id === mid) || null;
};
// Sum commissions earned by a manager (broker side + manager rebate)
window.MANAGER.earningsFor = function (managerId) {
  let brokerCommission = 0,
    managerRebate = 0,
    markupShare = 0;
  const clientIds = new Set(MANAGER_ASSIGNMENTS.byManager && MANAGER_ASSIGNMENTS.byManager[managerId] || []);
  POSITIONS.forEach(p => {
    const acc = [...ACCOUNTS, ...ADDITIONAL_ACCOUNTS].find(a => a.id === p.accountId);
    if (!acc) return;
    const rule = COMMISSION_RULES[acc.group] || COMMISSION_RULES.Standard;
    const vol = p.vol || p.volume || 1;
    // Broker commission credited if this manager owns the client
    if (clientIds.has(p.clientId)) {
      brokerCommission += (rule.brokerCommissionPerLot || 0) * vol;
    }
    // Manager rebate — only if this manager is in the group's rebate list AND owns the client
    const rebate = (rule.managerRebates || []).find(r => r.managerId === managerId);
    if (rebate && clientIds.has(p.clientId)) {
      managerRebate += (rebate.perLot || 0) * vol;
    }
  });
  // Approximate markup share — based on volume × default 1.0 markup
  POSITIONS.forEach(p => {
    if (!clientIds.has(p.clientId)) return;
    const acc = [...ACCOUNTS, ...ADDITIONAL_ACCOUNTS].find(a => a.id === p.accountId);
    if (!acc) return;
    const rule = COMMISSION_RULES[acc.group] || COMMISSION_RULES.Standard;
    const vol = p.vol || p.volume || 1;
    markupShare += vol * 1.0 * ((rule.markupSharePct || 0) / 100);
  });
  return {
    brokerCommission,
    managerRebate,
    markupShare,
    total: brokerCommission + managerRebate + markupShare
  };
};

// ── Asset classifier — categorize symbol into FX/Metals/Indices/Stocks/Crypto ──
window.MANAGER.assetClass = function (symbol) {
  if (!symbol) return 'OTHER';
  const s = String(symbol).toUpperCase();
  if (/^(BTC|ETH|LTC|XRP|ADA|SOL|DOGE|BNB|USDT|USDC|DOT|MATIC|AVAX|LINK)/.test(s)) return 'CRYPTO';
  if (/^XA[UG]/.test(s) || s.includes('GOLD') || s.includes('SILVER') || /^XPD|^XPT/.test(s)) return 'METALS';
  if (/^(US30|NAS100|SPX|DE40|UK100|JPN225|HSI|FRA40|AUS200|EU50|VIX)/.test(s)) return 'INDICES';
  if (/^(AAPL|TSLA|MSFT|GOOG|AMZN|NVDA|META|NFLX|AMD|INTC|JPM|BAC|V|MA|DIS|KO|MCD|WMT|XOM|CVX|PFE|MRK)/.test(s)) return 'STOCKS';
  if (s.length === 6 && /^[A-Z]{6}$/.test(s)) return 'FX';
  return 'OTHER';
};

// ── Commission Ledger: rebuild from POSITIONS + SPORTS_BETS using current rules ──
window.MANAGER.rebuildCommissionLedger = function () {
  const ledger = [];
  const accIdx = id => [...ACCOUNTS, ...ADDITIONAL_ACCOUNTS].find(a => a.id === id);
  // LIVE / CRYPTO from trading positions
  POSITIONS.forEach(p => {
    const acc = accIdx(p.accountId);
    if (!acc) return;
    const mid = (MANAGER_ASSIGNMENTS.byClient || {})[p.clientId];
    const ac = MANAGER.assetClass(p.sym);
    const server = acc.tag === 'CRYPTO' || ac === 'CRYPTO' ? 'CRYPTO' : 'FX';
    const vol = Number(p.vol || p.volume || 1);
    let baseRate = 0,
      commission = 0;
    if (server === 'CRYPTO') {
      const rule = (COMMISSION_RULES.CRYPTO || {})[acc.group] || (COMMISSION_RULES.CRYPTO || {}).Standard || {
        feeBps: 20
      };
      const notional = (p.current || p.open || 0) * vol;
      baseRate = rule.feeBps || 0;
      commission = notional * (baseRate / 10000);
    } else {
      const rule = COMMISSION_RULES[acc.group] || COMMISSION_RULES.Standard;
      baseRate = rule.brokerCommissionPerLot || 0;
      commission = baseRate * vol;
    }
    const split = (MANAGER_ASSIGNMENTS.splits || {})[p.clientId];
    ledger.push({
      id: 'L_' + p.id,
      ts: p.opened || '',
      server,
      clientId: p.clientId,
      accountId: p.accountId,
      managerId: mid,
      group: acc.group || 'Standard',
      asset: ac,
      symbol: p.sym,
      volume: vol,
      baseRate,
      commission: +commission.toFixed(2),
      splitTo: split ? [{
        managerId: split.primary,
        pct: split.primaryPct
      }, {
        managerId: split.referrer,
        pct: split.referrerPct
      }] : null,
      status: 'accrued'
    });
  });
  // SPORTS from settled bets only (commission accrues after settlement)
  (window.SPORTS_BETS || SPORTS_BETS || []).forEach(b => {
    const acc = [...ACCOUNTS, ...ADDITIONAL_ACCOUNTS].find(a => a.clientId === b.clientId && a.tag === 'SPORTS');
    if (!acc) return;
    const mid = (MANAGER_ASSIGNMENTS.byClient || {})[b.clientId];
    const rule = (COMMISSION_RULES.SPORTS || {})[acc.group] || (COMMISSION_RULES.SPORTS || {}).Standard || {
      handlePct: 2,
      ggrPct: 25
    };
    const stake = Number(b.stake || 0);
    // Handle-based commission accrues on every placed bet
    const handleCom = stake * ((rule.handlePct || 0) / 100);
    // GGR commission only on settled bets (won=loss to book, lost=gain to book)
    let ggrCom = 0;
    if (b.status === 'lost') ggrCom = stake * ((rule.ggrPct || 0) / 100);else if (b.status === 'won') ggrCom = -(b.payout || 0) * ((rule.ggrPct || 0) / 100);
    const commission = +(handleCom + ggrCom).toFixed(2);
    const split = (MANAGER_ASSIGNMENTS.splits || {})[b.clientId];
    ledger.push({
      id: 'L_' + b.id,
      ts: b.placedAt || '',
      server: 'SPORTS',
      clientId: b.clientId,
      accountId: acc.id,
      managerId: mid,
      group: acc.group || 'Standard',
      asset: b.sport || 'BET',
      symbol: b.selection,
      volume: stake,
      baseRate: rule.handlePct || 0,
      commission,
      splitTo: split ? [{
        managerId: split.primary,
        pct: split.primaryPct
      }, {
        managerId: split.referrer,
        pct: split.referrerPct
      }] : null,
      status: b.status === 'open' ? 'pending' : 'accrued'
    });
  });
  COMMISSION_LEDGER.length = 0;
  ledger.forEach(e => COMMISSION_LEDGER.push(e));
  return COMMISSION_LEDGER;
};

// ── Earnings by manager — sum across servers, honor splits ──
window.MANAGER.earningsByServer = function (managerId, opts) {
  opts = opts || {};
  const rows = COMMISSION_LEDGER.length ? COMMISSION_LEDGER : MANAGER.rebuildCommissionLedger();
  const result = {
    LIVE: 0,
    CRYPTO: 0,
    SPORTS: 0,
    total: 0,
    count: 0
  };
  rows.forEach(e => {
    if (opts.statusOnly && e.status !== opts.statusOnly) return;
    // If split exists, distribute by pct
    if (e.splitTo && e.splitTo.length) {
      e.splitTo.forEach(s => {
        if (s.managerId === managerId) {
          const cut = e.commission * (s.pct / 100);
          result[e.server] = (result[e.server] || 0) + cut;
          result.total += cut;
          result.count++;
        }
      });
    } else if (e.managerId === managerId) {
      result[e.server] = (result[e.server] || 0) + e.commission;
      result.total += e.commission;
      result.count++;
    }
  });
  return result;
};

// ── Commission for a single client (across all servers) ──
window.MANAGER.clientCommission = function (clientId) {
  const rows = COMMISSION_LEDGER.length ? COMMISSION_LEDGER : MANAGER.rebuildCommissionLedger();
  const out = {
    LIVE: 0,
    CRYPTO: 0,
    SPORTS: 0,
    total: 0,
    count: 0
  };
  rows.forEach(e => {
    if (e.clientId !== clientId) return;
    out[e.server] = (out[e.server] || 0) + e.commission;
    out.total += e.commission;
    out.count++;
  });
  return out;
};

// ── Auto-route a client to a manager based on routing rules ──
window.MANAGER.autoRoute = function (client, group) {
  const rules = (MANAGER_ROUTING_RULES || []).filter(r => r.enabled).sort((a, b) => (a.priority || 99) - (b.priority || 99));
  for (const r of rules) {
    const m = r.match || {};
    if (m.country && client.country !== m.country) continue;
    if (m.group && group && group !== m.group) continue;
    return r.managerId;
  }
  return 'm002'; // default
};

// ── Bulk reassign clients to a manager ──
window.MANAGER.bulkReassign = function (clientIds, newManagerId) {
  if (!MANAGER_ASSIGNMENTS.byClient) MANAGER_ASSIGNMENTS.byClient = {};
  if (!MANAGER_ASSIGNMENTS.byManager) MANAGER_ASSIGNMENTS.byManager = {};
  clientIds.forEach(cid => {
    const oldMid = MANAGER_ASSIGNMENTS.byClient[cid];
    if (oldMid && MANAGER_ASSIGNMENTS.byManager[oldMid]) {
      MANAGER_ASSIGNMENTS.byManager[oldMid] = MANAGER_ASSIGNMENTS.byManager[oldMid].filter(x => x !== cid);
    }
    MANAGER_ASSIGNMENTS.byClient[cid] = newManagerId;
    if (!MANAGER_ASSIGNMENTS.byManager[newManagerId]) MANAGER_ASSIGNMENTS.byManager[newManagerId] = [];
    if (!MANAGER_ASSIGNMENTS.byManager[newManagerId].includes(cid)) MANAGER_ASSIGNMENTS.byManager[newManagerId].push(cid);
  });
  MANAGER.rebuildCommissionLedger();
  if (MANAGER.ADMIN_ACTIVITY) MANAGER.ADMIN_ACTIVITY.unshift({
    ts: new Date().toISOString().slice(0, 19).replace('T', ' '),
    admin: MANAGER.getCurrentAdmin && MANAGER.getCurrentAdmin().email || 'admin@alpexa.com',
    kind: 'bulk_reassign',
    target: `${clientIds.length} clients`,
    detail: `Reassigned ${clientIds.length} clients to ${(MANAGERS.find(m => m.id === newManagerId) || {}).name || newManagerId}`
  });
};

// ── Set split commission for a client ──
window.MANAGER.setSplit = function (clientId, primary, primaryPct, referrer, referrerPct) {
  if (!MANAGER_ASSIGNMENTS.splits) MANAGER_ASSIGNMENTS.splits = {};
  if (!referrer || referrerPct === 0) {
    delete MANAGER_ASSIGNMENTS.splits[clientId];
    return;
  }
  MANAGER_ASSIGNMENTS.splits[clientId] = {
    primary,
    primaryPct,
    referrer,
    referrerPct
  };
  MANAGER.rebuildCommissionLedger();
};

// ── Open accounts for a new client across all 3 servers ──
window.MANAGER.openServerAccounts = function (client, group) {
  group = group || 'Standard';
  const baseNo = 21054301 + ACCOUNTS.length + ADDITIONAL_ACCOUNTS.length;
  const created = ['FX', 'CRYPTO', 'SPORTS'].map((srv, i) => {
    const id = 'a_' + client.id + '_' + srv.toLowerCase();
    return {
      id,
      clientId: client.id,
      accountNo: String(baseNo + i),
      tag: srv,
      currency: srv === 'CRYPTO' ? 'USDT' : 'USD',
      balance: 0,
      equity: 0,
      margin: 0,
      leverage: srv === 'SPORTS' ? 1 : group === 'VIP' ? 500 : group === 'Pro' ? 200 : 100,
      group,
      created: new Date().toISOString().slice(0, 10)
    };
  });
  created.forEach(a => ADDITIONAL_ACCOUNTS.push(a));
  // Auto-assign to a manager via routing
  const mid = MANAGER.autoRoute(client, group);
  if (!MANAGER_ASSIGNMENTS.byClient) MANAGER_ASSIGNMENTS.byClient = {};
  if (!MANAGER_ASSIGNMENTS.byManager) MANAGER_ASSIGNMENTS.byManager = {};
  MANAGER_ASSIGNMENTS.byClient[client.id] = mid;
  if (!MANAGER_ASSIGNMENTS.byManager[mid]) MANAGER_ASSIGNMENTS.byManager[mid] = [];
  if (!MANAGER_ASSIGNMENTS.byManager[mid].includes(client.id)) MANAGER_ASSIGNMENTS.byManager[mid].push(client.id);
  if (MANAGER.ADMIN_ACTIVITY) MANAGER.ADMIN_ACTIVITY.unshift({
    ts: new Date().toISOString().slice(0, 19).replace('T', ' '),
    admin: 'system',
    kind: 'account_provision',
    target: client.id,
    detail: `3 accounts opened (LIVE/CRYPTO/SPORTS) — assigned to ${(MANAGERS.find(m => m.id === mid) || {}).name || mid}`
  });
  return {
    accounts: created,
    managerId: mid
  };
};

// ── Pick up any signups completed in signup.html (localStorage) ──
function pickupSignups() {
  try {
    if (typeof localStorage === 'undefined') return;
    const raw = localStorage.getItem('alpexa_pending_signups');
    if (!raw) return;
    const pending = JSON.parse(raw);
    if (!Array.isArray(pending) || !pending.length) return;
    pending.forEach(p => {
      if (!p || !p.client || !p.accounts) return;
      if (CLIENTS.find(c => c.id === p.client.id)) return;
      CLIENTS.push(p.client);
      p.accounts.forEach(a => { MANAGER.ACCOUNTS.push(a); ACCOUNTS.push(a); });
      if (!MANAGER_ASSIGNMENTS.byClient) MANAGER_ASSIGNMENTS.byClient = {};
      if (!MANAGER_ASSIGNMENTS.byManager) MANAGER_ASSIGNMENTS.byManager = {};
      MANAGER_ASSIGNMENTS.byClient[p.client.id] = p.managerId;
      if (!MANAGER_ASSIGNMENTS.byManager[p.managerId]) MANAGER_ASSIGNMENTS.byManager[p.managerId] = [];
      if (!MANAGER_ASSIGNMENTS.byManager[p.managerId].includes(p.client.id)) MANAGER_ASSIGNMENTS.byManager[p.managerId].push(p.client.id);
      if (MANAGER.ADMIN_ACTIVITY) MANAGER.ADMIN_ACTIVITY.unshift({
        ts: new Date(p.ts || Date.now()).toISOString().slice(0, 19).replace('T', ' '),
        admin: 'system',
        kind: 'signup',
        target: p.client.id,
        detail: `Signup: ${p.client.firstName} ${p.client.lastName} — 3 accounts opened, assigned to ${(MANAGERS.find(m => m.id === p.managerId) || {}).name || p.managerId}`
      });
    });
    MANAGER.ACCOUNTS = [...ACCOUNTS, ...ADDITIONAL_ACCOUNTS];
    console.log('[ALPEXA] Picked up', pending.length, 'signups from localStorage');
  } catch (e) { console.warn('[ALPEXA] Signup pickup failed:', e); }
}
pickupSignups();

// === REAL-TIME SYNC: poll trading apps' localStorage every 2s + storage events ===
(function syncFromApps() {
  try {
    if (typeof localStorage === 'undefined') return;
    function pickupPositions() {
      try {
        const raw = localStorage.getItem('alpexa.positions');
        if (!raw) return;
        const arr = JSON.parse(raw);
        if (!Array.isArray(arr) || !arr.length) return;
        arr.forEach(p => {
          const idx = MANAGER.POSITIONS.findIndex(x => x.id === p.id);
          if (p.status === 'closed') {
            if (idx >= 0) MANAGER.POSITIONS.splice(idx, 1);
            return;
          }
          const rec = {
            id: p.id, clientId: p.clientId || 'c026', accountId: p.accountId,
            sym: p.sym, side: p.side, vol: p.vol,
            open: p.open, current: p.current || p.open, pnl: p.pnl || 0,
            opened: p.opened
          };
          if (idx < 0) { MANAGER.POSITIONS.push(rec); POSITIONS.push(rec); }
          else MANAGER.POSITIONS[idx] = {...MANAGER.POSITIONS[idx], ...rec};
        });
      } catch (e) {}
    }
    function pickupBalances() {
      try {
        const raw = localStorage.getItem('alpexa.balances');
        if (!raw) return;
        const obj = JSON.parse(raw);
        if (!obj) return;
        const cidRaw = localStorage.getItem('alpexa_current_user');
        const cur = cidRaw ? JSON.parse(cidRaw) : null;
        const cid = cur && cur.clientId ? cur.clientId : 'c026';
        const tagMap = {live:'FX', crypto:'CRYPTO', sports:'SPORTS'};
        Object.keys(tagMap).forEach(k => {
          const tag = tagMap[k];
          const acc = (MANAGER.ACCOUNTS || []).find(a => a.clientId === cid && a.tag === tag);
          if (acc && typeof obj[k] === 'number') {
            acc.balance = obj[k];
            acc.equity = obj[k];
          }
        });
      } catch (e) {}
    }
    function pickupFunding() {
      try {
        const raw = localStorage.getItem('alpexa.funding');
        if (!raw) return;
        const arr = JSON.parse(raw);
        if (!Array.isArray(arr)) return;
        arr.forEach(rec => {
          if (!rec || !rec.id) return;
          if (MANAGER.FUNDING_REQUESTS.find(r => r.id === rec.id)) return;
          const clientId = rec.clientId || 'c026';
          const serverTag = (rec.server || 'FX').toUpperCase();
          const acc = (MANAGER.ACCOUNTS || []).find(a => a.clientId === clientId && a.tag === serverTag);
          MANAGER.FUNDING_REQUESTS.unshift({
            id: rec.id, server: serverTag, clientId, accountId: acc ? acc.id : '',
            kind: rec.kind || 'deposit', status: rec.status || 'pending',
            method: rec.method || 'USDT', currency: rec.currency || 'USD',
            amount: rec.amount || 0, asset: rec.asset, network: rec.network,
            requested: new Date(rec.ts || Date.now()).toISOString().slice(0,16).replace('T',' '),
            notes: rec.notes || 'From trading app'
          });
        });
      } catch (e) {}
    }
    function pickupBets() {
      try {
        const raw = localStorage.getItem('alpexa.bets');
        if (!raw) return;
        const arr = JSON.parse(raw);
        if (!Array.isArray(arr) || !arr.length) return;
        arr.forEach(b => {
          if ((MANAGER.SPORTS_BETS || []).findIndex(x => x.id === b.id) >= 0) return;
          const newBet = {
            id: b.id, clientId: b.clientId || 'c026', eventId: b.eventId || 'app',
            betType: b.betType || 'singles', selection: b.selection,
            odds: b.odds || 0, stake: b.stake || 0, potential: b.potential || 0,
            status: b.status || 'open', placed: b.placed
          };
          (MANAGER.SPORTS_BETS = MANAGER.SPORTS_BETS || []).unshift(newBet);
          if (typeof SPORTS_BETS !== 'undefined') SPORTS_BETS.unshift(newBet);
        });
      } catch (e) {}
    }
    pickupSignups(); pickupPositions(); pickupBalances(); pickupFunding(); pickupBets();
    window.addEventListener('storage', (e) => {
      if (e.key === 'alpexa_pending_signups') pickupSignups();
      if (e.key === 'alpexa.positions') pickupPositions();
      if (e.key === 'alpexa.balances') pickupBalances();
      if (e.key === 'alpexa.funding') pickupFunding();
      if (e.key === 'alpexa.bets') pickupBets();
    });
    setInterval(() => {
      pickupSignups(); pickupPositions(); pickupBalances(); pickupFunding(); pickupBets();
    }, 2000);
  } catch (e) { console.warn('[MGR] App sync error:', e); }
})();


// Build ledger on load with current data
MANAGER.rebuildCommissionLedger();

// ── Price feed helpers ──
window.MANAGER.getFeeds = function () {
  return MANAGER.SYSTEM_SETTINGS.priceFeeds || [];
};
window.MANAGER.getActiveFeed = function () {
  return (MANAGER.SYSTEM_SETTINGS.priceFeeds || []).find(f => f.status === 'live');
};
window.MANAGER.markFeedDown = function (id, reason) {
  const feeds = MANAGER.SYSTEM_SETTINGS.priceFeeds || [];
  const idx = feeds.findIndex(f => f.id === id);
  if (idx < 0) return;
  feeds[idx] = {
    ...feeds[idx],
    status: 'down',
    failureCount: (feeds[idx].failureCount || 0) + 1
  };
  // If this was the live feed, promote next enabled feed
  if (idx >= 0 && feeds[idx].id === id) {
    const next = feeds.find(f => f.enabled && f.status !== 'down' && f.id !== id);
    if (next) {
      const nidx = feeds.findIndex(f => f.id === next.id);
      feeds[nidx] = {
        ...feeds[nidx],
        status: 'live'
      };
      if (MANAGER.ADMIN_ACTIVITY) MANAGER.ADMIN_ACTIVITY.unshift({
        ts: new Date().toISOString().slice(0, 19).replace('T', ' '),
        admin: 'system',
        kind: 'feed_failover',
        target: next.id,
        detail: `Primary → ${next.name} (${reason || 'health check'})`
      });
    }
  }
};
window.MANAGER.markFeedLive = function (id) {
  const feeds = MANAGER.SYSTEM_SETTINGS.priceFeeds || [];
  // First set all to standby except this one which becomes live
  feeds.forEach((f, i) => {
    feeds[i] = {
      ...f,
      status: f.id === id ? 'live' : f.status === 'down' ? 'down' : 'standby'
    };
  });
};

// ── Auto-settle config (Settings page toggles can mutate this) ──
window.MANAGER.AUTO_SETTLE = {
  enabled: true,
  finishedOnly: true,
  // only auto-settle events with status==='finished'
  byType: {
    moneyline: true,
    spread: true,
    total: true
  },
  requireConfirmation: false // if true, suspect cases stay in queue
};

// Evaluate a bet against the event outcome. Returns 'won' | 'lost' | 'push' | null
window.MANAGER.autoEvaluateBet = function (bet, event) {
  if (!event) return null;
  if (event.scoreHome == null || event.scoreAway == null) return null;
  if (event.status !== 'finished' && MANAGER.AUTO_SETTLE.finishedOnly) return null;
  const homeWon = event.scoreHome > event.scoreAway;
  const awayWon = event.scoreAway > event.scoreHome;
  const totalScore = event.scoreHome + event.scoreAway;
  if (bet.betType === 'moneyline') {
    if (event.scoreHome === event.scoreAway) return 'push'; // tie → void
    const isHome = bet.selection === event.homeTeam || bet.selection === event.homeAbbr;
    const isAway = bet.selection === event.awayTeam || bet.selection === event.awayAbbr;
    if (isHome) return homeWon ? 'won' : 'lost';
    if (isAway) return awayWon ? 'won' : 'lost';
    return null;
  }
  if (bet.betType === 'spread') {
    if (bet.line == null) return null;
    const isHome = bet.selection === event.homeTeam || bet.selection === event.homeAbbr;
    const adj = isHome ? event.scoreHome + bet.line : event.scoreAway + bet.line;
    const opp = isHome ? event.scoreAway : event.scoreHome;
    if (adj > opp) return 'won';
    if (adj < opp) return 'lost';
    return 'push'; // exact spread
  }
  if (bet.betType === 'total') {
    if (bet.line == null) return null;
    const isOver = String(bet.selection).toLowerCase().startsWith('over');
    if (totalScore === bet.line) return 'push';
    return isOver === totalScore > bet.line ? 'won' : 'lost';
  }
  return null;
};

// Auto-settle all bets for one event. Returns counts.
window.MANAGER.autoSettleEvent = function (eventId) {
  const ev = MANAGER.SPORTS_EVENTS.find(e => e.id === eventId);
  if (!ev) return {
    settled: 0,
    skipped: 0
  };
  let settled = 0,
    skipped = 0;
  MANAGER.SPORTS_BETS.forEach((b, i) => {
    if (b.eventId !== eventId || b.status !== 'open') return;
    if (!MANAGER.AUTO_SETTLE.byType[b.betType]) {
      skipped++;
      return;
    }
    const outcome = MANAGER.autoEvaluateBet(b, ev);
    if (!outcome) {
      skipped++;
      return;
    }
    const payout = outcome === 'won' ? b.potential : outcome === 'push' ? b.stake : 0;
    MANAGER.SPORTS_BETS[i] = {
      ...b,
      status: outcome === 'push' ? 'void' : outcome,
      payout,
      settled: new Date().toISOString().slice(0, 19).replace('T', ' ')
    };
    if (MANAGER.ADMIN_ACTIVITY) MANAGER.ADMIN_ACTIVITY.unshift({
      ts: new Date().toISOString().slice(0, 19).replace('T', ' '),
      admin: 'system@autosettle',
      kind: 'auto_settle',
      target: b.id,
      detail: `${outcome.toUpperCase()} · payout $${MANAGER.fmt(payout, 2)} · ${b.betType}`
    });
    settled++;
  });
  return {
    settled,
    skipped
  };
};

// Mark an event as finished (used to trigger auto-settle in demo)
window.MANAGER.finishEvent = function (eventId) {
  const idx = MANAGER.SPORTS_EVENTS.findIndex(e => e.id === eventId);
  if (idx < 0) return;
  MANAGER.SPORTS_EVENTS[idx] = {
    ...MANAGER.SPORTS_EVENTS[idx],
    status: 'finished'
  };
};
window.MANAGER.timeAgo = function (ts) {
  const d = new Date(ts.replace(' ', 'T'));
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return Math.floor(diff) + 's ago';
  if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
  if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
  return Math.floor(diff / 86400) + 'd ago';
};

// ─── manager-clients ─────────────────────────────────────
// ALPEXA Manager — Clients screen
const {
  useState,
  useMemo,
  useEffect
} = React;
const useStateMgr = useState;
const useEffectMgr = useEffect;
const useStateQ = useState;
const useEffectQ = useEffect;
const CLIENT_COLS = [{
  key: 'dot',
  width: 28,
  label: '',
  resizable: false,
  min: 28,
  align: 'center'
}, {
  key: 'account',
  width: 140,
  label: 'Account #',
  min: 110,
  align: 'center'
}, {
  key: 'opened',
  width: 150,
  label: 'Date / Time',
  min: 130,
  align: 'center'
}, {
  key: 'client',
  width: 220,
  label: 'Name',
  min: 160,
  align: 'center'
}, {
  key: 'balance',
  width: 150,
  label: 'Balance',
  min: 120,
  align: 'center'
}, {
  key: 'equity',
  width: 150,
  label: 'Equity',
  min: 120,
  align: 'center'
}, {
  key: 'kyc',
  width: 120,
  label: 'KYC',
  min: 90,
  align: 'center'
}, {
  key: 'status',
  width: 120,
  label: 'Status',
  min: 90,
  align: 'center'
}];
function loadColWidths(key, defaults) {
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const stored = JSON.parse(raw);
      // Detect stale keys (e.g. removed columns like 'opened', 'status', 'email')
      const validKeys = Object.keys(defaults);
      const storedKeys = Object.keys(stored);
      const hasStale = storedKeys.some(k => !validKeys.includes(k));
      if (hasStale) {
        localStorage.removeItem(key);
        return {
          ...defaults
        };
      }
      return {
        ...defaults,
        ...stored
      };
    }
  } catch (e) {}
  return {
    ...defaults
  };
}
function ClientsScreen({
  onSelect,
  server = 'FX',
  filter: extFilter,
  setFilter: extSetFilter,
  search: extSearch,
  setSearch: extSetSearch,
  quotesOpen,
  setQuotesOpen
}) {
  const [localSearch, setLocalSearch] = useState('');
  const search = extSearch !== undefined ? extSearch : localSearch;
  const setSearch = extSetSearch || setLocalSearch;
  const [localFilter, setLocalFilter] = useState('online');
  const filter = extFilter !== undefined ? extFilter : localFilter;
  const setFilter = extSetFilter || setLocalFilter;
  const [selectedId, setSelectedId] = useState(null);
  const [detailId, setDetailId] = useState(null);
  const [sortKey, setSortKey] = useState('account');
  const [sortDir, setSortDir] = useState('asc');
  const [refreshTick, setRefreshTick] = useState(0);
  function toggleSort(key) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');else {
      setSortKey(key);
      setSortDir(['balance', 'equity', 'opened'].includes(key) ? 'desc' : 'asc');
    }
  }

  // Column widths — load from localStorage, persist on resize
  const defaultWidths = Object.fromEntries(CLIENT_COLS.map(c => [c.key, c.width]));
  const [colWidths, setColWidths] = useState(() => loadColWidths('alpexa.mgr.clientCols', defaultWidths));
  function setWidth(key, w) {
    setColWidths(prev => {
      const next = {
        ...prev,
        [key]: w
      };
      try {
        localStorage.setItem('alpexa.mgr.clientCols', JSON.stringify(next));
      } catch (e) {}
      return next;
    });
  }
  function resetCols() {
    try {
      localStorage.removeItem('alpexa.mgr.clientCols');
    } catch (e) {}
    setColWidths(defaultWidths);
  }
  const gridTemplate = CLIENT_COLS.map(c => `${colWidths[c.key] || c.width}px`).join(' ');
  const filtered = useMemo(() => {
    // HARD RULE: this page shows ONLY online clients who have at least
    // one account on the currently-selected server (so visible rows
    // and all counters always match).
    let list = MANAGER.CLIENTS.filter(c => {
      if (!c.online) return false;
      const accts = MANAGER.findAccounts(c.id);
      return accts.some(a => a.tag === server);
    });
    if (filter === 'pending_kyc') list = list.filter(c => c.kyc === 'pending');
    if (filter === 'blocked') list = list.filter(c => c.status === 'blocked');
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(c => c.firstName.toLowerCase().includes(q) || c.lastName.toLowerCase().includes(q) || c.email.toLowerCase().includes(q) || c.id.toLowerCase().includes(q));
    }
    // ── Sort by selected column
    const dir = sortDir === 'asc' ? 1 : -1;
    list = [...list].sort((a, b) => {
      const acctA = MANAGER.findAccounts(a.id)[0];
      const acctB = MANAGER.findAccounts(b.id)[0];
      let va, vb;
      switch (sortKey) {
        case 'account':
          va = acctA?.accountNo || '';
          vb = acctB?.accountNo || '';
          return va.localeCompare(vb) * dir;
        case 'opened':
          va = acctA?.created || a.joined || '';
          vb = acctB?.created || b.joined || '';
          return va.localeCompare(vb) * dir;
        case 'client':
          va = (a.firstName + ' ' + a.lastName).toLowerCase();
          vb = (b.firstName + ' ' + b.lastName).toLowerCase();
          return va.localeCompare(vb) * dir;
        case 'balance':
          {
            const ba = MANAGER.findAccounts(a.id).reduce((s, x) => s + (x.balance || 0) * usdRate(x.currency), 0);
            const bb = MANAGER.findAccounts(b.id).reduce((s, x) => s + (x.balance || 0) * usdRate(x.currency), 0);
            return (ba - bb) * dir;
          }
        case 'equity':
          {
            const ea = MANAGER.findAccounts(a.id).reduce((s, x) => s + (x.equity || 0) * usdRate(x.currency), 0);
            const eb = MANAGER.findAccounts(b.id).reduce((s, x) => s + (x.equity || 0) * usdRate(x.currency), 0);
            return (ea - eb) * dir;
          }
        case 'kyc':
          return (a.kyc || '').localeCompare(b.kyc || '') * dir;
        case 'status':
          return (a.status || '').localeCompare(b.status || '') * dir;
        case 'email':
          return (a.email || '').toLowerCase().localeCompare((b.email || '').toLowerCase()) * dir;
        default:
          return 0;
      }
    });
    return list;
  }, [search, filter, sortKey, sortDir, refreshTick, server]);
  const onlineCount = filtered.length;
  const pendingKycCount = MANAGER.CLIENTS.filter(c => c.kyc === 'pending').length;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      flex: 1,
      minHeight: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      padding: '10px 14px',
      height: 50,
      background: 'var(--surface)',
      borderBottom: '1px solid var(--line)',
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1
    }
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      height: 35,
      background: 'var(--surface)',
      borderBottom: '1px solid var(--line)',
      flexShrink: 0
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      overflowY: 'scroll',
      minHeight: 0,
      background: 'var(--surface)'
    },
    className: "mgr-table-scroll"
  }, /*#__PURE__*/React.createElement("div", {
    className: "mgr-excel-table",
    style: {
      background: 'var(--surface)',
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "mt5-header-row",
    style: {
      display: 'grid',
      gridTemplateColumns: gridTemplate,
      padding: '0',
      background: '#1B3955',
      borderBottom: '1px solid #0F1B2D',
      borderTop: '1px solid #234A6E',
      fontSize: 10,
      fontWeight: 700,
      color: 'rgba(255,255,255,0.92)',
      letterSpacing: 0.6,
      textTransform: 'uppercase',
      alignItems: 'center',
      position: 'sticky',
      top: 0,
      zIndex: 5,
      fontFamily: 'JetBrains Mono, Roboto Mono, monospace',
      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06)'
    }
  }, CLIENT_COLS.map((col, i) => /*#__PURE__*/React.createElement(ColHeader, {
    key: col.key,
    col: col,
    currentWidth: colWidths[col.key] || col.width,
    setWidth: setWidth,
    onReset: resetCols,
    isLast: i === CLIENT_COLS.length - 1,
    sortKey: sortKey,
    sortDir: sortDir,
    onSort: toggleSort
  }))), filtered.length === 0 ? /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '40px 16px',
      textAlign: 'center',
      color: 'var(--text-3)',
      fontSize: 13
    }
  }, "No clients match your filter.") : filtered.map(c => {
    const allAccts = MANAGER.findAccounts(c.id);
    const accts = allAccts.filter(a => a.tag === server);
    if (accts.length === 0) return null;
    const balanceUsd = accts.reduce((s, a) => s + (a.balance || 0) * usdRate(a.currency), 0);
    const equityUsd = accts.reduce((s, a) => s + (a.equity || 0) * usdRate(a.currency), 0);
    const pnl = equityUsd - balanceUsd;
    return /*#__PURE__*/React.createElement("div", {
      key: c.id,
      className: `mt5-data-row ${c.online ? 'is-online' : ''}`,
      onClick: () => {
        setSelectedId(c.id);
        setDetailId(c.id);
        if (onSelect) onSelect(c.id);
      },
      style: {
        display: 'grid',
        gridTemplateColumns: gridTemplate,
        padding: '0',
        borderBottom: '1px solid #E5E7EB',
        cursor: 'pointer',
        alignItems: 'center',
        fontSize: 11.5,
        background: selectedId === c.id ? '#DCEAF8' : 'transparent',
        borderLeft: selectedId === c.id ? '3px solid #1B3955' : '3px solid transparent'
      },
      onMouseEnter: e => {
        if (selectedId !== c.id) e.currentTarget.style.background = '#F4F7FB';
      },
      onMouseLeave: e => {
        if (selectedId !== c.id) e.currentTarget.style.background = 'transparent';
      }
    }, /*#__PURE__*/React.createElement("div", {
      title: c.online ? `Online · ${c.sessionDevice}` : `Last seen ${MANAGER.timeAgo(c.lastSeen)}`,
      style: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }
    }, c.online ? /*#__PURE__*/React.createElement("span", {
      style: {
        width: 9,
        height: 9,
        borderRadius: 2,
        background: '#22C55E',
        boxShadow: '0 0 6px rgba(34,197,94,0.8), 0 0 0 1px rgba(21,131,76,0.4)',
        animation: 'mgrPulse 1.8s infinite',
        display: 'inline-block'
      }
    }) : /*#__PURE__*/React.createElement("span", {
      style: {
        width: 9,
        height: 9,
        borderRadius: 2,
        background: '#CBD5E1',
        border: '1px solid #94A3B8',
        display: 'inline-block'
      }
    })), /*#__PURE__*/React.createElement("div", {
      className: "mono",
      style: {
        fontSize: 11,
        color: 'var(--text-2)',
        lineHeight: 1.3,
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        flexWrap: 'wrap'
      }
    }, accts.map(a => /*#__PURE__*/React.createElement("span", {
      key: a.id
    }, "#", a.accountNo || a.id.slice(1).toUpperCase()))), /*#__PURE__*/React.createElement("div", {
      className: "mono",
      style: {
        fontSize: 11,
        color: 'var(--text-2)',
        lineHeight: 1.3,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 1
      }
    }, (() => {
      const dates = accts.map(a => a.created).filter(Boolean).sort();
      const earliest = dates[0] || c.joined;
      const parts = (earliest || '').split(' ');
      return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("span", {
        style: {
          fontSize: 11
        }
      }, parts[0]), parts[1] && /*#__PURE__*/React.createElement("span", {
        style: {
          fontSize: 9.5,
          color: 'var(--text-3)'
        }
      }, parts[1]));
    })()), /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        flexDirection: 'column',
        gap: 1,
        alignItems: 'center'
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        color: 'var(--ink)'
      }
    }, c.firstName, " ", c.lastName)), /*#__PURE__*/React.createElement("span", {
      className: "mono",
      style: {
        color: 'var(--ink)'
      }
    }, "$", MANAGER.fmt(balanceUsd, 0)), /*#__PURE__*/React.createElement("span", {
      className: "mono",
      style: {
        color: 'var(--ink)'
      }
    }, "$", MANAGER.fmt(equityUsd, 0)), /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }
    }, /*#__PURE__*/React.createElement(KycBadge, {
      state: c.kyc
    })), /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }
    }, /*#__PURE__*/React.createElement(StatusBadge, {
      state: c.status
    })));
  }))), /*#__PURE__*/React.createElement("style", null, `@keyframes mgrPulse { 0%,100%{box-shadow:0 0 0 0 rgba(34,197,94,0.5)} 70%{box-shadow:0 0 0 5px rgba(34,197,94,0)} }
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
          padding: 9px 10px;
          border-right: 1px solid #E5E7EB;
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
        /* MT5-style zebra striping — subtle */
        .mgr-excel-table .mt5-data-row:nth-of-type(even) { background: #F7F9FC; }
        .mgr-excel-table .mt5-data-row:hover { background: #EAF2FB !important; }
        .mgr-excel-table .mt5-data-row.is-online { box-shadow: inset 2px 0 0 transparent; }
        /* Header cells (navy MT5 bar) */
        .mt5-header-row > * {
          padding: 6px 8px !important;
          position: relative;
          border-right: 1px solid rgba(255,255,255,0.12) !important;
          color: rgba(255,255,255,0.92);
        }
        .mt5-header-row > *:last-child { border-right: none !important; }
        .mgr-col-resize {
          position: absolute; top: 0; right: -3px; bottom: 0; width: 6px;
          cursor: col-resize; user-select: none; z-index: 10;
          display: flex; align-items: center; justify-content: center;
        }
        .mgr-col-resize:hover::before, .mgr-col-resize.dragging::before {
          content:''; position:absolute; top:0; bottom:0; left:2px; right:2px; background: #5BB0FF; border-radius:1px;
        }
        /* MT5 header text — small caps, dense */
        .mt5-header-row > * > span:first-child { color: rgba(255,255,255,0.92); }
      `), detailId && /*#__PURE__*/React.createElement(ClientDetailDrawer, {
    clientId: detailId,
    server: server,
    onClose: () => {
      setDetailId(null);
      setRefreshTick(t => t + 1);
    },
    onMutated: () => setRefreshTick(t => t + 1)
  }));
}
function ClientDetailDrawer({
  clientId,
  onClose,
  onMutated,
  server
}) {
  const c = MANAGER.findClient(clientId);
  if (!c) return null;
  // Customer 360: show ALL accounts, ALL positions, ALL bets — grouped by server below.
  // server prop only determines which section is expanded by default.
  const ctx = server || 'FX';
  const allAccts = MANAGER.findAccounts(clientId);
  const initAccts = allAccts;                                   // all accounts (cross-server)
  const initPositions = MANAGER.findPositions(clientId);        // all positions
  // Sports data — always loaded regardless of server context
  const sportsProfile = (MANAGER.SPORTS_PROFILES || {})[clientId] || null;
  const myBets = (MANAGER.SPORTS_BETS || []).filter(b => b.clientId === clientId);
  const openBets = myBets.filter(b => b.status === 'open');
  const settledBets = myBets.filter(b => b.status !== 'open');
  const totalWagered = myBets.reduce((s, b) => s + (b.stake || 0), 0);
  const wonTotal = myBets.filter(b => b.status === 'won').reduce((s, b) => s + (b.payout || 0), 0);
  const lostTotal = myBets.filter(b => b.status === 'lost').reduce((s, b) => s + (b.stake || 0), 0);
  const netBetPnl = wonTotal - lostTotal;
  // Commission earned from this client across all servers (using ledger)
  const clientCom = MANAGER.clientCommission ? MANAGER.clientCommission(clientId) : {
    LIVE: 0,
    CRYPTO: 0,
    SPORTS: 0,
    total: 0,
    count: 0
  };
  const [accts, setAccts] = useState(initAccts);
  const [positions, setPositions] = useState(initPositions);
  const [client, setClient] = useState(c);
  const totalEquity = accts.reduce((s, a) => s + (Number(a.equity) || 0) * usdRate(a.currency), 0);
  const totalBalance = accts.reduce((s, a) => s + (Number(a.balance) || 0) * usdRate(a.currency), 0);
  const totalPnl = positions.reduce((s, p) => s + (Number(p.pnl) || 0), 0);
  const totalMargin = accts.reduce((s, a) => s + (Number(a.margin) || 0) * usdRate(a.currency), 0);
  const marginLevel = totalMargin > 0 ? totalEquity / totalMargin * 100 : Infinity;
  const [action, setAction] = useState(null);
  const [edited, setEdited] = useState(false);
  function updateClient(key, val) {
    setClient(prev => ({
      ...prev,
      [key]: val
    }));
    setEdited(true);
  }
  function updateAcct(id, key, val) {
    setAccts(prev => prev.map(a => a.id === id ? {
      ...a,
      [key]: val
    } : a));
    setEdited(true);
  }
  function updatePos(id, key, val) {
    setPositions(prev => prev.map(p => p.id === id ? {
      ...p,
      [key]: val
    } : p));
    setEdited(true);
  }
  function saveAll() {
    // Persist client changes
    const cidx = MANAGER.CLIENTS.findIndex(x => x.id === client.id);
    if (cidx >= 0) MANAGER.CLIENTS[cidx] = {
      ...client
    };
    accts.forEach(a => {
      const idx = MANAGER.ACCOUNTS.findIndex(x => x.id === a.id);
      if (idx >= 0) MANAGER.ACCOUNTS[idx] = {
        ...a
      };
    });
    positions.forEach(p => {
      const idx = MANAGER.POSITIONS.findIndex(x => x.id === p.id);
      if (idx >= 0) MANAGER.POSITIONS[idx] = {
        ...p
      };
    });
    setEdited(false);
    onClose();
  }

  // Pull latest data from MANAGER after a modal mutation, then close it
  function refreshAndClose() {
    const fresh = MANAGER.findClient(clientId);
    if (fresh) setClient(fresh);
    setAccts(MANAGER.findAccounts(clientId));
    setPositions(MANAGER.findPositions(clientId));
    setAction(null);
    if (onMutated) onMutated();
  }
  return /*#__PURE__*/React.createElement("div", {
    onClick: onClose,
    style: {
      position: 'fixed',
      inset: 0,
      background: 'rgba(15,23,41,0.5)',
      zIndex: 150,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 20
    }
  }, /*#__PURE__*/React.createElement("div", {
    onClick: e => e.stopPropagation(),
    className: "mgr-drawer-scroll",
    style: {
      width: 720,
      maxWidth: '92vw',
      maxHeight: '92vh',
      background: 'var(--surface)',
      overflowY: 'scroll',
      boxShadow: '0 24px 60px rgba(15,23,41,0.30)',
      borderRadius: 12,
      animation: 'mgrFadeIn 0.18s ease'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '18px 22px 16px',
      borderBottom: '1px solid var(--line)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      marginBottom: 10
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 44,
      height: 44,
      borderRadius: 22,
      background: client.online ? '#15A36C' : 'var(--bg-2)',
      color: client.online ? '#fff' : 'var(--text-2)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: 14,
      fontWeight: 800,
      letterSpacing: 0.5,
      flexShrink: 0
    }
  }, client.firstName[0], client.lastName[0]), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 6
    }
  }, /*#__PURE__*/React.createElement(EditableText, {
    value: client.firstName,
    onChange: v => updateClient('firstName', v),
    bold: true,
    color: "var(--ink)"
  }), /*#__PURE__*/React.createElement(EditableText, {
    value: client.lastName,
    onChange: v => updateClient('lastName', v),
    bold: true,
    color: "var(--ink)"
  }), client.online && /*#__PURE__*/React.createElement("span", {
    style: {
      width: 7,
      height: 7,
      borderRadius: '50%',
      background: '#22C55E',
      display: 'inline-block',
      animation: 'mgrPulse 1.8s infinite'
    }
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      color: 'var(--text-3)',
      marginTop: 2,
      display: 'flex',
      alignItems: 'center',
      gap: 4,
      flexWrap: 'wrap'
    }
  }, /*#__PURE__*/React.createElement(EditableText, {
    value: client.country,
    onChange: v => updateClient('country', v.toUpperCase()),
    color: "var(--text-3)"
  }), /*#__PURE__*/React.createElement("span", null, "\xB7"), /*#__PURE__*/React.createElement("span", null, "Joined"), /*#__PURE__*/React.createElement(EditableText, {
    value: client.joined,
    onChange: v => updateClient('joined', v),
    color: "var(--text-3)"
  }), /*#__PURE__*/React.createElement("span", null, "\xB7"), /*#__PURE__*/React.createElement(EditableText, {
    value: client.sessionDevice,
    onChange: v => updateClient('sessionDevice', v),
    color: "var(--text-3)"
  }))), /*#__PURE__*/React.createElement("button", {
    onClick: onClose,
    style: {
      width: 28,
      height: 28,
      borderRadius: 14,
      background: 'var(--bg)',
      border: 'none',
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: 'var(--text-2)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'Material Symbols Outlined',
      fontSize: 16
    }
  }, "close"))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      fontSize: 11.5,
      color: 'var(--text-2)',
      flexWrap: 'wrap'
    }
  }, /*#__PURE__*/React.createElement(EditableSelect, {
    value: client.kyc,
    options: [{
      value: 'verified',
      label: 'Verified'
    }, {
      value: 'pending',
      label: 'Pending'
    }, {
      value: 'rejected',
      label: 'Rejected'
    }],
    onChange: v => updateClient('kyc', v),
    color: "var(--ink)"
  }), /*#__PURE__*/React.createElement(EditableSelect, {
    value: client.status,
    options: [{
      value: 'active',
      label: 'Active'
    }, {
      value: 'limited',
      label: 'Limited'
    }, {
      value: 'blocked',
      label: 'Blocked'
    }],
    onChange: v => updateClient('status', v),
    color: "var(--ink)"
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--text-3)',
      margin: '0 2px'
    }
  }, "\xB7"), /*#__PURE__*/React.createElement("span", {
    style: { display:'flex', alignItems:'center', gap:5 }
  }, /*#__PURE__*/React.createElement("span", {
    style: { fontFamily:'Material Symbols Outlined', fontSize:13, color:'var(--text-3)' }
  }, "workspace_premium"),
  /*#__PURE__*/React.createElement("span", {
    style: { fontSize:10, color:'var(--text-3)', fontWeight:700, letterSpacing:0.4 }
  }, "GROUP"),
  /*#__PURE__*/React.createElement("select", {
    value: (accts[0] && accts[0].group) || 'Standard',
    onChange: function(e) {
      var newG = e.target.value;
      setAccts(function(prev) { return prev.map(function(a){ return Object.assign({}, a, {group: newG}); }); });
      var allAccs = MANAGER.findAccounts(client.id);
      allAccs.forEach(function(a){
        var idx = MANAGER.ACCOUNTS.findIndex(function(x){return x.id === a.id;});
        if (idx >= 0) MANAGER.ACCOUNTS[idx] = Object.assign({}, MANAGER.ACCOUNTS[idx], {group: newG});
      });
      if (MANAGER.rebuildCommissionLedger) MANAGER.rebuildCommissionLedger();
      setEdited(true);
      if (MANAGER.ADMIN_ACTIVITY) MANAGER.ADMIN_ACTIVITY.unshift({
        ts: new Date().toISOString().slice(0,19).replace('T',' '),
        admin:'admin@alpexa.com', kind:'group_change',
        target: client.id, detail: 'All accounts -> ' + newG
      });
    },
    style: {
      fontSize:11, padding:'2px 8px',
      border:'1px solid var(--line-2)',
      background: (accts[0]&&accts[0].group)==='VIP' ? '#F3E8FF' : (accts[0]&&accts[0].group)==='Pro' ? '#E0F2FE' : 'var(--surface)',
      color: (accts[0]&&accts[0].group)==='VIP' ? '#7C3AED' : (accts[0]&&accts[0].group)==='Pro' ? '#0EA5E9' : 'var(--ink)',
      fontWeight: 700,
      cursor: 'pointer'
    }
  },
    /*#__PURE__*/React.createElement("option", {value: 'Standard'}, "Standard"),
    /*#__PURE__*/React.createElement("option", {value: 'Pro'}, "Pro"),
    /*#__PURE__*/React.createElement("option", {value: 'VIP'}, "VIP")
  )), /*#__PURE__*/React.createElement("span", {
    style: { color: 'var(--text-3)', margin: '0 2px' }
  }, "\xB7"), /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 4
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'Material Symbols Outlined',
      fontSize: 13,
      color: 'var(--text-3)'
    }
  }, "badge"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 10,
      color: 'var(--text-3)',
      fontWeight: 700,
      letterSpacing: 0.4
    }
  }, "MGR"), /*#__PURE__*/React.createElement("select", {
    value: MANAGER.MANAGER_ASSIGNMENTS.byClient && MANAGER.MANAGER_ASSIGNMENTS.byClient[client.id] || '',
    onChange: e => {
      const newMid = e.target.value;
      const oldMid = MANAGER.MANAGER_ASSIGNMENTS.byClient[client.id];
      // Remove from old manager
      if (oldMid && MANAGER.MANAGER_ASSIGNMENTS.byManager[oldMid]) {
        MANAGER.MANAGER_ASSIGNMENTS.byManager[oldMid] = MANAGER.MANAGER_ASSIGNMENTS.byManager[oldMid].filter(cid => cid !== client.id);
      }
      // Add to new manager
      MANAGER.MANAGER_ASSIGNMENTS.byClient[client.id] = newMid;
      if (!MANAGER.MANAGER_ASSIGNMENTS.byManager[newMid]) MANAGER.MANAGER_ASSIGNMENTS.byManager[newMid] = [];
      if (!MANAGER.MANAGER_ASSIGNMENTS.byManager[newMid].includes(client.id)) {
        MANAGER.MANAGER_ASSIGNMENTS.byManager[newMid].push(client.id);
      }
      if (MANAGER.ADMIN_ACTIVITY) MANAGER.ADMIN_ACTIVITY.unshift({
        ts: new Date().toISOString().slice(0, 19).replace('T', ' '),
        admin: 'admin@alpexa.com',
        kind: 'reassign',
        target: client.id,
        detail: `Manager → ${MANAGER.MANAGERS.find(m => m.id === newMid)?.name || newMid}`
      });
      if (onMutated) onMutated();
      setEdited(true);
    },
    style: {
      fontSize: 11,
      padding: '2px 6px',
      border: '1px solid var(--line-2)',
      background: 'var(--surface)',
      color: 'var(--ink)',
      fontWeight: 600
    }
  }, MANAGER.MANAGERS.map(m => /*#__PURE__*/React.createElement("option", {
    key: m.id,
    value: m.id
  }, m.name)))), /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--text-3)',
      margin: '0 2px'
    }
  }, "\xB7"), /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 4
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'Material Symbols Outlined',
      fontSize: 13,
      color: 'var(--text-3)'
    }
  }, "mail"), /*#__PURE__*/React.createElement(EditableText, {
    value: client.email,
    onChange: v => updateClient('email', v),
    color: "var(--text-2)"
  })), /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 4
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'Material Symbols Outlined',
      fontSize: 13,
      color: 'var(--text-3)'
    }
  }, "call"), /*#__PURE__*/React.createElement(EditableText, {
    value: client.phone,
    onChange: v => updateClient('phone', v),
    color: "var(--text-2)"
  })))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr 1fr 1fr',
      borderBottom: '1px solid var(--line)'
    }
  }, /*#__PURE__*/React.createElement(DetailKpi, {
    lbl: "Balance",
    val: `$${MANAGER.fmt(totalBalance, 0)}`
  }), /*#__PURE__*/React.createElement(DetailKpi, {
    lbl: "Equity",
    val: `$${MANAGER.fmt(totalEquity, 0)}`
  }), /*#__PURE__*/React.createElement(DetailKpi, {
    lbl: "Open P/L",
    val: `${totalPnl >= 0 ? '+' : ''}$${MANAGER.fmt(totalPnl, 0)}`,
    color: totalPnl > 0 ? '#15A36C' : totalPnl < 0 ? '#EF4444' : 'var(--ink)'
  }), /*#__PURE__*/React.createElement(DetailKpi, {
    lbl: "Margin",
    val: marginLevel === Infinity ? '—' : `${marginLevel > 9999 ? '∞' : marginLevel.toFixed(0)}%`,
    color: marginLevel < 100 ? '#F59E0B' : 'var(--ink)'
  })),
  // ─── Split Commission section ───
  React.createElement(DetailSection, {
    title: "Manager Assignment",
    count: null
  }, (function() {
    var currentSplit = (MANAGER.MANAGER_ASSIGNMENTS.splits || {})[client.id];
    var primaryMid = (MANAGER.MANAGER_ASSIGNMENTS.byClient || {})[client.id];
    var primary = MANAGER.MANAGERS.find(function(m){return m.id === primaryMid;});
    var hasSplit = !!currentSplit;
    var sp = currentSplit || { primary: primaryMid, primaryPct: 70, referrer: '', referrerPct: 30 };
    function applyChange(updated) {
      if (!updated.referrer || updated.referrerPct === 0) {
        delete MANAGER.MANAGER_ASSIGNMENTS.splits[client.id];
      } else {
        if (!MANAGER.MANAGER_ASSIGNMENTS.splits) MANAGER.MANAGER_ASSIGNMENTS.splits = {};
        MANAGER.MANAGER_ASSIGNMENTS.splits[client.id] = updated;
      }
      if (MANAGER.rebuildCommissionLedger) MANAGER.rebuildCommissionLedger();
      if (MANAGER.ADMIN_ACTIVITY) MANAGER.ADMIN_ACTIVITY.unshift({
        ts: new Date().toISOString().slice(0,19).replace('T',' '),
        admin:'admin@alpexa.com', kind:'split_change',
        target: client.id,
        detail: updated.referrer
          ? (MANAGER.MANAGERS.find(function(m){return m.id===updated.primary;})||{name:updated.primary}).name + ' ' + updated.primaryPct + '% / ' + (MANAGER.MANAGERS.find(function(m){return m.id===updated.referrer;})||{name:updated.referrer}).name + ' ' + updated.referrerPct + '%'
          : 'Split removed'
      });
      setEdited(true);
      if (onMutated) onMutated();
    }
    return React.createElement('div', { style: { padding:'14px 22px' } },
      React.createElement('div', { style: { display:'flex', alignItems:'center', gap:8, marginBottom:10 } },
        React.createElement('span', { style:{fontSize:11, color:'var(--text-2)'} }, 'Co-managed by 2 brokers?'),
        React.createElement('button', {
          onClick: function() {
            if (hasSplit) {
              applyChange({ primary: primaryMid, primaryPct: 100, referrer: '', referrerPct: 0 });
            } else {
              var others = MANAGER.MANAGERS.filter(function(m){return m.id !== primaryMid;});
              applyChange({ primary: primaryMid, primaryPct: 70, referrer: others[0]?others[0].id:'', referrerPct: 30 });
            }
          },
          style: { padding:'3px 10px', fontSize:10, fontWeight:700, letterSpacing:0.4, background: hasSplit ? '#FEE2E2' : '#E0F2FE', color: hasSplit ? '#B91C1C' : '#0D47A1', border:'1px solid '+(hasSplit ? '#FECACA' : '#BFDBFE'), cursor:'pointer', borderRadius:3, textTransform:'uppercase' }
        }, hasSplit ? 'Remove Split' : '+ Add Co-Manager')
      ),
      hasSplit
        ? React.createElement('div', null,
            // Primary row
            React.createElement('div', { style: { display:'grid', gridTemplateColumns:'90px 1fr 80px 50px', alignItems:'center', gap:8, padding:'8px 0', borderBottom:'1px solid var(--line)' } },
              React.createElement('span', { style:{fontSize:10, fontWeight:800, color:'#15803D', letterSpacing:0.4, textTransform:'uppercase'} }, '★ Primary'),
              React.createElement('select', {
                value: sp.primary || '',
                onChange: function(e){ applyChange(Object.assign({}, sp, {primary: e.target.value})); },
                style: { fontSize:11.5, padding:'4px 8px', border:'1px solid var(--line-2)', background:'#F0FDF4', color:'#15803D', fontWeight:700 }
              }, MANAGER.MANAGERS.map(function(m){ return React.createElement('option', {key:m.id, value:m.id}, m.name); })),
              React.createElement('input', {
                type:'number', min:1, max:99, step:5,
                value: sp.primaryPct,
                onChange: function(e){
                  var p = Math.max(1, Math.min(99, parseInt(e.target.value)||0));
                  applyChange(Object.assign({}, sp, {primaryPct: p, referrerPct: 100-p}));
                },
                style: { width:60, padding:'4px 8px', border:'1px solid #15803D', background:'#F0FDF4', color:'#15803D', fontFamily:'JetBrains Mono, monospace', fontWeight:700, textAlign:'right', borderRadius:3, fontSize:11.5 }
              }),
              React.createElement('span', { style:{fontSize:11, fontWeight:700, color:'#15803D'} }, '%')
            ),
            // Referrer row
            React.createElement('div', { style: { display:'grid', gridTemplateColumns:'90px 1fr 80px 50px', alignItems:'center', gap:8, padding:'8px 0' } },
              React.createElement('span', { style:{fontSize:10, fontWeight:800, color:'#B45309', letterSpacing:0.4, textTransform:'uppercase'} }, '↪ Referrer'),
              React.createElement('select', {
                value: sp.referrer || '',
                onChange: function(e){ applyChange(Object.assign({}, sp, {referrer: e.target.value})); },
                style: { fontSize:11.5, padding:'4px 8px', border:'1px solid var(--line-2)', background:'#FFFBEB', color:'#B45309', fontWeight:700 }
              },
                React.createElement('option', {value:''}, '— none —'),
                MANAGER.MANAGERS.filter(function(m){return m.id !== sp.primary;}).map(function(m){ return React.createElement('option', {key:m.id, value:m.id}, m.name); })
              ),
              React.createElement('input', {
                type:'number', min:1, max:99, step:5,
                value: sp.referrerPct,
                onChange: function(e){
                  var r = Math.max(1, Math.min(99, parseInt(e.target.value)||0));
                  applyChange(Object.assign({}, sp, {referrerPct: r, primaryPct: 100-r}));
                },
                style: { width:60, padding:'4px 8px', border:'1px solid #B45309', background:'#FFFBEB', color:'#B45309', fontFamily:'JetBrains Mono, monospace', fontWeight:700, textAlign:'right', borderRadius:3, fontSize:11.5 }
              }),
              React.createElement('span', { style:{fontSize:11, fontWeight:700, color:'#B45309'} }, '%')
            ),
            // Visual bar
            React.createElement('div', { style: { display:'flex', height:6, marginTop:10, borderRadius:3, overflow:'hidden', border:'1px solid var(--line-2)' } },
              React.createElement('div', { style:{ width: sp.primaryPct+'%', background:'#15803D' } }),
              React.createElement('div', { style:{ width: sp.referrerPct+'%', background:'#B45309' } })
            ),
            React.createElement('div', { style: { fontSize:10, color:'var(--text-3)', marginTop:6, fontFamily:'JetBrains Mono, monospace' } },
              'Every commission earned from this client will be split: $1.00 = $' + (sp.primaryPct/100).toFixed(2) + ' primary + $' + (sp.referrerPct/100).toFixed(2) + ' referrer'
            )
          )
        : React.createElement('div', { style: { fontSize:11.5, color:'var(--text-3)' } },
            primary ? ('All commission goes to ' + primary.name + ' (100%)') : 'No primary manager assigned'
          )
    );
  })()),
  /*#__PURE__*/React.createElement(DetailSection, {
    title: "Accounts",
    count: accts.length
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '90px 60px 1fr 1fr 60px 70px',
      padding: '7px 22px',
      fontSize: 9.5,
      fontWeight: 700,
      color: 'var(--text-3)',
      letterSpacing: 0.5,
      textTransform: 'uppercase',
      background: '#FAF8F2',
      borderTop: '1px solid var(--line)',
      borderBottom: '1px solid var(--line)',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("span", null, "Account"), /*#__PURE__*/React.createElement("span", null, "Type"), /*#__PURE__*/React.createElement("span", {
    style: {
      textAlign: 'right'
    }
  }, "Balance"), /*#__PURE__*/React.createElement("span", {
    style: {
      textAlign: 'right'
    }
  }, "Equity"), /*#__PURE__*/React.createElement("span", {
    style: {
      textAlign: 'right'
    }
  }, "Lev."), /*#__PURE__*/React.createElement("span", {
    style: {
      textAlign: 'right'
    }
  }, "Group")), accts.map(a => /*#__PURE__*/React.createElement("div", {
    key: a.id,
    style: {
      display: 'grid',
      gridTemplateColumns: '90px 60px 1fr 1fr 60px 70px',
      alignItems: 'center',
      padding: '9px 22px',
      borderBottom: '1px solid var(--line)',
      fontSize: 12,
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      lineHeight: 1.3,
      alignItems: 'center',
      gap: 2
    }
  }, /*#__PURE__*/React.createElement(EditableText, {
    value: '#' + (a.accountNo || a.id.toUpperCase()),
    onChange: v => updateAcct(a.id, 'accountNo', v.replace(/^#/, '')),
    bold: true,
    color: "var(--ink)"
  }), /*#__PURE__*/React.createElement(EditableText, {
    value: a.created,
    onChange: v => updateAcct(a.id, 'created', v),
    color: "var(--text-3)"
  })), /*#__PURE__*/React.createElement(EditableSelect, {
    value: a.tag,
    options: [{
      value: 'FX',
      label: 'FX'
    }, {
      value: 'CRYPTO',
      label: 'CRYPTO'
    }, {
      value: 'SPORTS',
      label: 'SPORTS'
    }],
    onChange: v => updateAcct(a.id, 'tag', v)
  }), /*#__PURE__*/React.createElement(EditableNumber, {
    value: a.balance,
    prefix: a.currency + ' ',
    decimals: a.currency === 'JPY' ? 0 : 2,
    onChange: v => updateAcct(a.id, 'balance', v),
    align: "right",
    color: "var(--ink)",
    bold: true
  }), /*#__PURE__*/React.createElement(EditableNumber, {
    value: a.equity,
    prefix: a.currency + ' ',
    decimals: a.currency === 'JPY' ? 0 : 2,
    onChange: v => updateAcct(a.id, 'equity', v),
    align: "right",
    color: a.equity > a.balance ? '#15A36C' : a.equity < a.balance ? '#EF4444' : 'var(--ink)',
    bold: true
  }), /*#__PURE__*/React.createElement(EditableNumber, {
    value: a.leverage,
    prefix: "1:",
    decimals: 0,
    onChange: v => updateAcct(a.id, 'leverage', Math.round(v)),
    align: "right",
    color: "var(--text-2)"
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      justifyContent: 'flex-end',
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      padding: '2px 8px',
      fontSize: 10,
      fontWeight: 700,
      letterSpacing: 0.4,
      background: a.group === 'VIP' ? '#F3E8FF' : a.group === 'Pro' ? '#E0F2FE' : '#F1F5F9',
      color: a.group === 'VIP' ? '#7C3AED' : a.group === 'Pro' ? '#0EA5E9' : 'var(--text-2)',
      borderRadius: 3
    }
  }, a.group || '—'))))), /*#__PURE__*/React.createElement(React.Fragment, null, (positions.length > 0 || (myBets && myBets.length > 0) || sportsProfile) && true, sportsProfile && /*#__PURE__*/React.createElement(DetailSection, {
    title: "Bettor Profile",
    count: null
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '14px 22px',
      display: 'grid',
      gridTemplateColumns: 'repeat(4, 1fr)',
      gap: 14
    }
  }, (() => {
    const tier = sportsProfile.tier;
    const styles = {
      sharp: {
        bg: '#FFE4E6',
        col: '#9F1239',
        icon: '⚠'
      },
      whale: {
        bg: '#EAF2FB',
        col: '#1B3955',
        icon: '🐋'
      },
      recreational: {
        bg: '#E8F5E9',
        col: '#15803D',
        icon: '🎲'
      }
    };
    const s = styles[tier] || styles.recreational;
    return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 9,
        fontWeight: 700,
        color: 'var(--text-3)',
        letterSpacing: 0.5,
        textTransform: 'uppercase'
      }
    }, "Tier"), /*#__PURE__*/React.createElement("div", {
      style: {
        marginTop: 5
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        padding: '3px 9px',
        fontSize: 11,
        fontWeight: 800,
        background: sportsProfile.restricted ? '#FEE2E2' : s.bg,
        color: sportsProfile.restricted ? '#991B1B' : s.col,
        letterSpacing: 0.4,
        textTransform: 'uppercase'
      }
    }, sportsProfile.restricted ? '🚫 LIMITED' : `${s.icon} ${tier}`))), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 9,
        fontWeight: 700,
        color: 'var(--text-3)',
        letterSpacing: 0.5,
        textTransform: 'uppercase'
      }
    }, "Win Rate"), /*#__PURE__*/React.createElement("div", {
      className: "mono",
      style: {
        fontSize: 16,
        fontWeight: 800,
        color: 'var(--ink)',
        marginTop: 3
      }
    }, (sportsProfile.winRate * 100).toFixed(0), "%")), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 9,
        fontWeight: 700,
        color: 'var(--text-3)',
        letterSpacing: 0.5,
        textTransform: 'uppercase'
      }
    }, "CLV Avg"), /*#__PURE__*/React.createElement("div", {
      className: "mono",
      style: {
        fontSize: 16,
        fontWeight: 800,
        color: sportsProfile.clvAvg > 0 ? '#9F1239' : 'var(--ink)',
        marginTop: 3
      }
    }, sportsProfile.clvAvg > 0 ? '+' : '', sportsProfile.clvAvg)), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 9,
        fontWeight: 700,
        color: 'var(--text-3)',
        letterSpacing: 0.5,
        textTransform: 'uppercase'
      }
    }, "Max Bet"), /*#__PURE__*/React.createElement("div", {
      className: "mono",
      style: {
        fontSize: 16,
        fontWeight: 800,
        color: 'var(--ink)',
        marginTop: 3
      }
    }, "$", MANAGER.fmt(sportsProfile.maxBetUsd, 0))), sportsProfile.notes && /*#__PURE__*/React.createElement("div", {
      style: {
        gridColumn: '1 / 5',
        fontSize: 11,
        color: 'var(--text-2)',
        padding: '8px 10px',
        background: '#FAFBFC',
        borderLeft: '3px solid ' + s.col
      }
    }, /*#__PURE__*/React.createElement("b", null, "Notes:"), " ", sportsProfile.notes));
  })())), /*#__PURE__*/React.createElement(DetailSection, {
    title: "Betting Summary",
    count: myBets.length
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '12px 22px',
      display: 'grid',
      gridTemplateColumns: 'repeat(4, 1fr)',
      gap: 14
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 9,
      fontWeight: 700,
      color: 'var(--text-3)',
      letterSpacing: 0.5,
      textTransform: 'uppercase'
    }
  }, "Total Wagered"), /*#__PURE__*/React.createElement("div", {
    className: "mono",
    style: {
      fontSize: 15,
      fontWeight: 800,
      color: 'var(--ink)',
      marginTop: 3
    }
  }, "$", MANAGER.fmt(totalWagered, 0))), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 9,
      fontWeight: 700,
      color: 'var(--text-3)',
      letterSpacing: 0.5,
      textTransform: 'uppercase'
    }
  }, "Open Bets"), /*#__PURE__*/React.createElement("div", {
    className: "mono",
    style: {
      fontSize: 15,
      fontWeight: 800,
      color: '#0D47A1',
      marginTop: 3
    }
  }, openBets.length)), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 9,
      fontWeight: 700,
      color: 'var(--text-3)',
      letterSpacing: 0.5,
      textTransform: 'uppercase'
    }
  }, "Won / Lost"), /*#__PURE__*/React.createElement("div", {
    className: "mono",
    style: {
      fontSize: 15,
      fontWeight: 800,
      marginTop: 3
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: '#15A36C'
    }
  }, "+$", MANAGER.fmt(wonTotal, 0)), " / ", /*#__PURE__*/React.createElement("span", {
    style: {
      color: '#EF4444'
    }
  }, "-$", MANAGER.fmt(lostTotal, 0)))), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 9,
      fontWeight: 700,
      color: 'var(--text-3)',
      letterSpacing: 0.5,
      textTransform: 'uppercase'
    }
  }, "Net P/L"), /*#__PURE__*/React.createElement("div", {
    className: "mono",
    style: {
      fontSize: 15,
      fontWeight: 800,
      color: netBetPnl >= 0 ? '#15A36C' : '#EF4444',
      marginTop: 3
    }
  }, netBetPnl >= 0 ? '+' : '−', "$", MANAGER.fmt(Math.abs(netBetPnl), 0))))), /*#__PURE__*/React.createElement(DetailSection, {
    title: "Open Bets",
    count: openBets.length
  }, openBets.length === 0 ? /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '20px 22px',
      textAlign: 'center',
      color: 'var(--text-3)',
      fontSize: 12
    }
  }, "No open bets.") : /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '80px 1fr 1fr 60px 80px 100px 100px',
      padding: '7px 22px',
      fontSize: 9.5,
      fontWeight: 700,
      color: 'var(--text-3)',
      letterSpacing: 0.5,
      textTransform: 'uppercase',
      background: '#FAFBFC',
      borderBottom: '1px solid var(--line)'
    }
  }, /*#__PURE__*/React.createElement("span", null, "Bet ID"), /*#__PURE__*/React.createElement("span", null, "Event"), /*#__PURE__*/React.createElement("span", null, "Selection"), /*#__PURE__*/React.createElement("span", {
    style: {
      textAlign: 'center'
    }
  }, "Type"), /*#__PURE__*/React.createElement("span", {
    style: {
      textAlign: 'right'
    }
  }, "Odds"), /*#__PURE__*/React.createElement("span", {
    style: {
      textAlign: 'right'
    }
  }, "Stake"), /*#__PURE__*/React.createElement("span", {
    style: {
      textAlign: 'right'
    }
  }, "Payout")), openBets.map((b, i) => {
    const e = MANAGER.SPORTS_EVENTS.find(x => x.id === b.eventId);
    return /*#__PURE__*/React.createElement("div", {
      key: b.id,
      style: {
        display: 'grid',
        gridTemplateColumns: '80px 1fr 1fr 60px 80px 100px 100px',
        padding: '8px 22px',
        fontSize: 11,
        alignItems: 'center',
        borderBottom: '1px solid var(--line)'
      }
    }, /*#__PURE__*/React.createElement("span", {
      className: "mono",
      style: {
        color: 'var(--text-2)'
      }
    }, b.id.toUpperCase()), /*#__PURE__*/React.createElement("span", {
      style: {
        color: 'var(--ink)',
        fontSize: 11
      }
    }, e ? `${e.awayAbbr} @ ${e.homeAbbr}` : '—', /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 9.5,
        color: 'var(--text-3)'
      }
    }, e?.sport)), /*#__PURE__*/React.createElement("span", {
      style: {
        color: '#7C3AED',
        fontWeight: 600
      }
    }, b.selection), /*#__PURE__*/React.createElement("span", {
      style: {
        textAlign: 'center',
        fontSize: 9.5,
        color: 'var(--text-3)',
        textTransform: 'uppercase',
        letterSpacing: 0.4
      }
    }, b.betType), /*#__PURE__*/React.createElement("span", {
      className: "mono",
      style: {
        textAlign: 'right',
        color: b.odds > 0 ? '#15803D' : 'var(--ink)',
        fontWeight: 700
      }
    }, b.odds > 0 ? '+' : '', b.odds), /*#__PURE__*/React.createElement("span", {
      className: "mono",
      style: {
        textAlign: 'right',
        color: 'var(--ink)',
        fontWeight: 600
      }
    }, "$", MANAGER.fmt(b.stake, 0)), /*#__PURE__*/React.createElement("span", {
      className: "mono",
      style: {
        textAlign: 'right',
        color: '#9F1239',
        fontWeight: 700
      }
    }, "$", MANAGER.fmt(b.potential, 0)));
  }))), settledBets.length > 0 && /*#__PURE__*/React.createElement(DetailSection, {
    title: "Bet History",
    count: settledBets.length
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '80px 1fr 1fr 70px 80px 100px 100px',
      padding: '7px 22px',
      fontSize: 9.5,
      fontWeight: 700,
      color: 'var(--text-3)',
      letterSpacing: 0.5,
      textTransform: 'uppercase',
      background: '#FAFBFC',
      borderBottom: '1px solid var(--line)'
    }
  }, /*#__PURE__*/React.createElement("span", null, "Bet ID"), /*#__PURE__*/React.createElement("span", null, "Event"), /*#__PURE__*/React.createElement("span", null, "Selection"), /*#__PURE__*/React.createElement("span", {
    style: {
      textAlign: 'center'
    }
  }, "Result"), /*#__PURE__*/React.createElement("span", {
    style: {
      textAlign: 'right'
    }
  }, "Odds"), /*#__PURE__*/React.createElement("span", {
    style: {
      textAlign: 'right'
    }
  }, "Stake"), /*#__PURE__*/React.createElement("span", {
    style: {
      textAlign: 'right'
    }
  }, "Payout")), settledBets.map((b, i) => {
    const e = MANAGER.SPORTS_EVENTS.find(x => x.id === b.eventId);
    return /*#__PURE__*/React.createElement("div", {
      key: b.id,
      style: {
        display: 'grid',
        gridTemplateColumns: '80px 1fr 1fr 70px 80px 100px 100px',
        padding: '8px 22px',
        fontSize: 11,
        alignItems: 'center',
        borderBottom: '1px solid var(--line)'
      }
    }, /*#__PURE__*/React.createElement("span", {
      className: "mono",
      style: {
        color: 'var(--text-2)'
      }
    }, b.id.toUpperCase()), /*#__PURE__*/React.createElement("span", {
      style: {
        color: 'var(--ink)'
      }
    }, e ? `${e.awayAbbr} @ ${e.homeAbbr}` : '—'), /*#__PURE__*/React.createElement("span", {
      style: {
        color: '#7C3AED',
        fontWeight: 600
      }
    }, b.selection), /*#__PURE__*/React.createElement("span", {
      style: {
        textAlign: 'center'
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        padding: '1px 6px',
        fontSize: 9,
        fontWeight: 800,
        background: b.status === 'won' ? '#E8F5E9' : b.status === 'lost' ? '#FFEBEE' : '#F5F5F5',
        color: b.status === 'won' ? '#1B5E20' : b.status === 'lost' ? '#C62828' : '#616161',
        textTransform: 'uppercase',
        letterSpacing: 0.4
      }
    }, b.status)), /*#__PURE__*/React.createElement("span", {
      className: "mono",
      style: {
        textAlign: 'right',
        color: b.odds > 0 ? '#15803D' : 'var(--ink)'
      }
    }, b.odds > 0 ? '+' : '', b.odds), /*#__PURE__*/React.createElement("span", {
      className: "mono",
      style: {
        textAlign: 'right',
        color: 'var(--text-2)'
      }
    }, "$", MANAGER.fmt(b.stake, 0)), /*#__PURE__*/React.createElement("span", {
      className: "mono",
      style: {
        textAlign: 'right',
        color: b.status === 'won' ? '#15A36C' : '#EF4444',
        fontWeight: 700
      }
    }, "$", MANAGER.fmt(b.payout || 0, 0)));
  })))),
  /* Always show positions section regardless of server */
  positions.length > 0 && /*#__PURE__*/React.createElement(DetailSection, {
    title: "Open Positions (All Servers)",
    count: positions.length
  }, positions.length === 0 ? /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '20px 22px',
      textAlign: 'center',
      color: 'var(--text-3)',
      fontSize: 12
    }
  }, "No open positions.") : /*#__PURE__*/React.createElement(OpenPositionsTable, {
    positions: positions,
    updatePos: updatePos
  })), clientCom.count > 0 && /*#__PURE__*/React.createElement(DetailSection, {
    title: "Commission Earned by Broker",
    count: clientCom.count
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '12px 22px',
      display: 'grid',
      gridTemplateColumns: '1fr 1fr 1fr 1fr',
      gap: 14
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 9,
      fontWeight: 700,
      color: 'var(--text-3)',
      letterSpacing: 0.5,
      textTransform: 'uppercase'
    }
  }, "FX"), /*#__PURE__*/React.createElement("div", {
    className: "mono",
    style: {
      fontSize: 14,
      fontWeight: 800,
      color: '#15803D',
      marginTop: 3
    }
  }, "$", MANAGER.fmt(clientCom.LIVE || 0, 2))), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 9,
      fontWeight: 700,
      color: 'var(--text-3)',
      letterSpacing: 0.5,
      textTransform: 'uppercase'
    }
  }, "CRYPTO"), /*#__PURE__*/React.createElement("div", {
    className: "mono",
    style: {
      fontSize: 14,
      fontWeight: 800,
      color: '#F59E0B',
      marginTop: 3
    }
  }, "$", MANAGER.fmt(clientCom.CRYPTO || 0, 2))), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 9,
      fontWeight: 700,
      color: 'var(--text-3)',
      letterSpacing: 0.5,
      textTransform: 'uppercase'
    }
  }, "SPORTS"), /*#__PURE__*/React.createElement("div", {
    className: "mono",
    style: {
      fontSize: 14,
      fontWeight: 800,
      color: '#7C3AED',
      marginTop: 3
    }
  }, "$", MANAGER.fmt(clientCom.SPORTS || 0, 2))), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 9,
      fontWeight: 700,
      color: 'var(--text-3)',
      letterSpacing: 0.5,
      textTransform: 'uppercase'
    }
  }, "Total"), /*#__PURE__*/React.createElement("div", {
    className: "mono",
    style: {
      fontSize: 14,
      fontWeight: 800,
      color: 'var(--ink)',
      marginTop: 3
    }
  }, "$", MANAGER.fmt(clientCom.total || 0, 2)))), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '4px 22px 10px',
      fontSize: 10,
      color: 'var(--text-3)',
      fontFamily: 'JetBrains Mono, monospace'
    }
  }, clientCom.count, " commission entries across all servers \xB7 auto-computed from current rules")), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '16px 22px 8px',
      display: 'grid',
      gridTemplateColumns: '1fr 1fr 1fr 1fr',
      gap: 6
    }
  }, /*#__PURE__*/React.createElement(DrawerActionBtn, {
    icon: "tune",
    label: "Adjust",
    onClick: () => setAction('adjust')
  }), /*#__PURE__*/React.createElement(DrawerActionBtn, {
    icon: "swap_horiz",
    label: "Transfer",
    onClick: () => setAction('transfer')
  }), /*#__PURE__*/React.createElement(DrawerActionBtn, {
    icon: "schedule",
    label: "History",
    onClick: () => setAction('history')
  }), /*#__PURE__*/React.createElement(DrawerActionBtn, {
    icon: "receipt_long",
    label: "Orders",
    onClick: () => setAction('orders')
  }), /*#__PURE__*/React.createElement(DrawerActionBtn, {
    icon: "verified_user",
    label: "KYC",
    onClick: () => setAction('kyc')
  }), /*#__PURE__*/React.createElement(DrawerActionBtn, {
    icon: "mail",
    label: "Message",
    onClick: () => setAction('message')
  }), /*#__PURE__*/React.createElement(DrawerActionBtn, {
    icon: "block",
    label: client.status === 'blocked' ? 'Unblock' : 'Block',
    onClick: () => setAction('block'),
    danger: true
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '0 22px 18px'
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: saveAll,
    style: {
      width: '100%',
      padding: '10px 14px',
      borderRadius: 3,
      border: 'none',
      cursor: edited ? 'pointer' : 'not-allowed',
      background: edited ? '#1B3955' : '#E5E7EB',
      color: edited ? '#fff' : 'var(--text-3)',
      fontWeight: 700,
      fontSize: 12,
      letterSpacing: 0.5,
      textTransform: 'uppercase',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'Material Symbols Outlined',
      fontSize: 16
    }
  }, "save"), edited ? 'Save Changes' : 'No changes to save')), /*#__PURE__*/React.createElement("style", null, `@keyframes mgrFadeIn { from{opacity:0; transform:scale(0.96)} to{opacity:1; transform:scale(1)} }`), action === 'adjust' && /*#__PURE__*/React.createElement(AdjustBalanceModal, {
    client: client,
    accounts: accts,
    onClose: refreshAndClose
  }), action === 'transfer' && /*#__PURE__*/React.createElement(TransferBalanceModal, {
    client: client,
    accounts: accts,
    onClose: refreshAndClose
  }), action === 'history' && /*#__PURE__*/React.createElement(HistoryModal, {
    client: client,
    onClose: () => setAction(null)
  }), action === 'orders' && /*#__PURE__*/React.createElement(OrderHistoryModal, {
    client: client,
    onClose: () => setAction(null)
  }), action === 'kyc' && /*#__PURE__*/React.createElement(ManageKycModal, {
    client: client,
    onClose: refreshAndClose
  }), action === 'message' && /*#__PURE__*/React.createElement(SendMessageModal, {
    client: client,
    onClose: refreshAndClose
  }), action === 'block' && /*#__PURE__*/React.createElement(BlockAccountModal, {
    client: client,
    onClose: refreshAndClose
  }), /*#__PURE__*/React.createElement("style", null, `@keyframes mgrSlideIn { from{transform:translateX(100%)} to{transform:translateX(0)} }`)));
}
function DetailKpi({
  lbl,
  val,
  color,
  editable,
  rawValue,
  onEdit,
  prefix
}) {
  const [editing, setEditing] = useState(false);
  const [tmp, setTmp] = useState(String(rawValue || 0));
  React.useEffect(() => setTmp(String(rawValue || 0)), [rawValue]);
  function commit() {
    setEditing(false);
    const n = parseFloat(tmp);
    if (!isNaN(n) && onEdit) onEdit(n);
  }
  return /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '14px 16px',
      background: 'var(--surface)',
      borderRight: '1px solid var(--line)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 9,
      fontWeight: 700,
      color: 'var(--text-3)',
      letterSpacing: 0.5,
      textTransform: 'uppercase'
    }
  }, lbl), editable && editing ? /*#__PURE__*/React.createElement("input", {
    type: "number",
    value: tmp,
    onChange: e => setTmp(e.target.value),
    autoFocus: true,
    onBlur: commit,
    onKeyDown: e => {
      if (e.key === 'Enter') commit();
      if (e.key === 'Escape') setEditing(false);
    },
    className: "mono",
    style: {
      fontSize: 17,
      fontWeight: 700,
      color: color || 'var(--ink)',
      marginTop: 5,
      letterSpacing: -0.2,
      background: '#FFF8E1',
      border: '1px solid #F59E0B',
      borderRadius: 4,
      padding: '2px 5px',
      outline: 'none',
      width: '100%',
      fontFamily: 'inherit'
    }
  }) : /*#__PURE__*/React.createElement("div", {
    onClick: editable ? () => setEditing(true) : undefined,
    className: "mono",
    style: {
      fontSize: 17,
      fontWeight: 700,
      color: color || 'var(--ink)',
      marginTop: 5,
      letterSpacing: -0.2,
      cursor: editable ? 'pointer' : 'default',
      padding: editable ? '2px 5px' : 0,
      marginLeft: editable ? -5 : 0,
      borderRadius: 4
    },
    onMouseEnter: editable ? e => {
      e.currentTarget.style.background = '#FAF8F2';
    } : undefined,
    onMouseLeave: editable ? e => {
      e.currentTarget.style.background = 'transparent';
    } : undefined
  }, val));
}
function DrawerActionBtn({
  icon,
  label,
  onClick,
  danger,
  highlight
}) {
  return /*#__PURE__*/React.createElement("button", {
    onClick: onClick,
    style: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 3,
      padding: '10px 4px',
      borderRadius: 8,
      background: highlight ? 'var(--ink)' : danger ? '#FEF2F2' : 'var(--bg)',
      color: highlight ? 'var(--ink-fg)' : danger ? '#B91C1C' : 'var(--text-2)',
      border: 'none',
      cursor: 'pointer',
      fontSize: 10.5,
      fontWeight: 600
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'Material Symbols Outlined',
      fontSize: 18
    }
  }, icon), label);
}

// ── Inline editable controls ──
function EditableText({
  value,
  onChange,
  color,
  bold,
  align = 'left'
}) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(value);
  React.useEffect(() => setVal(value), [value]);
  function commit() {
    setEditing(false);
    if (val !== value) onChange(val);
  }
  return editing ? /*#__PURE__*/React.createElement("input", {
    value: val,
    onChange: e => setVal(e.target.value),
    autoFocus: true,
    onBlur: commit,
    onKeyDown: e => {
      if (e.key === 'Enter') commit();
      if (e.key === 'Escape') {
        setVal(value);
        setEditing(false);
      }
    },
    style: {
      fontWeight: bold ? 700 : 500,
      color: color || 'var(--ink)',
      textAlign: align,
      background: '#FFF8E1',
      border: '1px solid #F59E0B',
      borderRadius: 3,
      padding: '2px 5px',
      fontSize: 'inherit',
      fontFamily: 'inherit',
      width: '100%',
      outline: 'none'
    }
  }) : /*#__PURE__*/React.createElement("span", {
    onClick: () => setEditing(true),
    style: {
      fontWeight: bold ? 700 : 500,
      color: color || 'var(--ink)',
      textAlign: align,
      cursor: 'pointer',
      padding: '2px 4px',
      borderRadius: 3
    },
    onMouseEnter: e => {
      e.currentTarget.style.background = '#FAF8F2';
    },
    onMouseLeave: e => {
      e.currentTarget.style.background = 'transparent';
    }
  }, value);
}
function EditableNumber({
  value,
  onChange,
  color,
  bold,
  align = 'left',
  prefix = '',
  decimals = 2
}) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(String(value));
  React.useEffect(() => setVal(String(value)), [value]);
  function commit() {
    setEditing(false);
    const n = parseFloat(val);
    if (!isNaN(n) && n !== value) onChange(n);else setVal(String(value));
  }
  const display = `${prefix}${MANAGER.fmt(Math.abs(value), decimals)}`;
  return editing ? /*#__PURE__*/React.createElement("input", {
    type: "number",
    value: val,
    onChange: e => setVal(e.target.value),
    autoFocus: true,
    onBlur: commit,
    onKeyDown: e => {
      if (e.key === 'Enter') commit();
      if (e.key === 'Escape') {
        setVal(String(value));
        setEditing(false);
      }
    },
    className: "mono",
    style: {
      fontWeight: bold ? 700 : 500,
      color: color || 'var(--ink)',
      textAlign: align,
      background: '#FFF8E1',
      border: '1px solid #F59E0B',
      borderRadius: 3,
      padding: '2px 5px',
      fontSize: 'inherit',
      fontFamily: 'inherit',
      width: '100%',
      outline: 'none'
    }
  }) : /*#__PURE__*/React.createElement("span", {
    onClick: () => setEditing(true),
    className: "mono",
    style: {
      fontWeight: bold ? 700 : 500,
      color: color || 'var(--ink)',
      textAlign: align,
      cursor: 'pointer',
      padding: '2px 4px',
      borderRadius: 3,
      display: 'block'
    },
    onMouseEnter: e => {
      e.currentTarget.style.background = '#FAF8F2';
    },
    onMouseLeave: e => {
      e.currentTarget.style.background = 'transparent';
    }
  }, display);
}
function EditableSelect({
  value,
  options,
  onChange,
  color,
  align = 'left'
}) {
  return /*#__PURE__*/React.createElement("select", {
    value: value,
    onChange: e => onChange(e.target.value),
    style: {
      fontSize: 11,
      fontWeight: 700,
      color: color || 'var(--text-2)',
      background: 'transparent',
      border: '1px solid transparent',
      borderRadius: 3,
      padding: '2px 4px',
      cursor: 'pointer',
      outline: 'none',
      textAlign: align,
      fontFamily: 'inherit',
      appearance: 'none',
      justifySelf: align === 'right' ? 'flex-end' : 'flex-start'
    },
    onMouseEnter: e => {
      e.currentTarget.style.borderColor = '#F59E0B';
      e.currentTarget.style.background = '#FFF8E1';
    },
    onMouseLeave: e => {
      e.currentTarget.style.borderColor = 'transparent';
      e.currentTarget.style.background = 'transparent';
    }
  }, options.map(o => /*#__PURE__*/React.createElement("option", {
    key: o.value,
    value: o.value
  }, o.label)));
}
function OpenPositionsTable({
  positions,
  updatePos
}) {
  const [search, setSearch] = useState('');
  const [sideFilter, setSideFilter] = useState('all');
  const filtered = positions.filter(p => {
    if (sideFilter !== 'all' && p.side !== sideFilter) return false;
    if (search && !p.sym.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      padding: '7px 22px',
      borderTop: '1px solid var(--line)',
      background: 'var(--surface)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 5,
      padding: '4px 9px',
      background: 'var(--bg)',
      borderRadius: 5,
      border: '1px solid var(--line-2)',
      flex: 1,
      maxWidth: 220,
      height: 26
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'Material Symbols Outlined',
      fontSize: 13,
      color: 'var(--text-3)'
    }
  }, "search"), /*#__PURE__*/React.createElement("input", {
    value: search,
    onChange: e => setSearch(e.target.value),
    placeholder: "Search symbol\u2026",
    style: {
      flex: 1,
      fontSize: 11,
      color: 'var(--ink)',
      background: 'transparent',
      outline: 'none',
      border: 'none',
      minWidth: 0
    }
  })), /*#__PURE__*/React.createElement("button", {
    onClick: () => setSideFilter(sideFilter === 'all' ? 'BUY' : sideFilter === 'BUY' ? 'SELL' : 'all'),
    style: {
      padding: '4px 9px',
      borderRadius: 5,
      fontSize: 10,
      fontWeight: 700,
      background: sideFilter === 'BUY' ? '#ECFDF5' : sideFilter === 'SELL' ? '#FEF2F2' : 'var(--bg)',
      color: sideFilter === 'BUY' ? '#15803D' : sideFilter === 'SELL' ? '#B91C1C' : 'var(--text-2)',
      border: '1px solid ' + (sideFilter === 'BUY' ? '#86EFAC' : sideFilter === 'SELL' ? '#FCA5A5' : 'var(--line-2)'),
      cursor: 'pointer',
      height: 26
    }
  }, sideFilter === 'all' ? 'ALL SIDES' : sideFilter), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 10,
      color: 'var(--text-3)'
    }
  }, filtered.length, " of ", positions.length)), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '80px 60px 60px 1fr 1fr 90px',
      padding: '7px 22px',
      fontSize: 9.5,
      fontWeight: 700,
      color: 'var(--text-3)',
      letterSpacing: 0.5,
      textTransform: 'uppercase',
      background: '#FAF8F2',
      borderTop: '1px solid var(--line)',
      borderBottom: '1px solid var(--line)',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("span", null, "Symbol"), /*#__PURE__*/React.createElement("span", null, "Side"), /*#__PURE__*/React.createElement("span", {
    style: {
      textAlign: 'right'
    }
  }, "Vol"), /*#__PURE__*/React.createElement("span", {
    style: {
      textAlign: 'right'
    }
  }, "Open"), /*#__PURE__*/React.createElement("span", {
    style: {
      textAlign: 'right'
    }
  }, "Current"), /*#__PURE__*/React.createElement("span", {
    style: {
      textAlign: 'right'
    }
  }, "P/L")), /*#__PURE__*/React.createElement("div", {
    className: "mgr-drawer-scroll",
    style: {
      maxHeight: 200,
      overflowY: 'scroll'
    }
  }, filtered.length === 0 ? /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '20px 22px',
      textAlign: 'center',
      color: 'var(--text-3)',
      fontSize: 11
    }
  }, "No positions match.") : filtered.map(p => /*#__PURE__*/React.createElement("div", {
    key: p.id,
    style: {
      display: 'grid',
      gridTemplateColumns: '80px 60px 60px 1fr 1fr 90px',
      alignItems: 'center',
      padding: '9px 22px',
      borderBottom: '1px solid var(--line)',
      fontSize: 12,
      gap: 8
    }
  }, /*#__PURE__*/React.createElement(EditableText, {
    value: p.sym,
    onChange: v => updatePos(p.id, 'sym', v.toUpperCase()),
    bold: true,
    color: "var(--ink)"
  }), /*#__PURE__*/React.createElement(EditableSelect, {
    value: p.side,
    options: [{
      value: 'BUY',
      label: 'BUY'
    }, {
      value: 'SELL',
      label: 'SELL'
    }],
    onChange: v => updatePos(p.id, 'side', v),
    color: p.side === 'BUY' ? '#15803D' : '#B91C1C'
  }), /*#__PURE__*/React.createElement(EditableNumber, {
    value: p.vol,
    decimals: 2,
    onChange: v => updatePos(p.id, 'vol', v),
    align: "right",
    color: "var(--text-2)"
  }), /*#__PURE__*/React.createElement(EditableNumber, {
    value: p.open,
    decimals: 5,
    onChange: v => updatePos(p.id, 'open', v),
    align: "right",
    color: "var(--text-2)"
  }), /*#__PURE__*/React.createElement(EditableNumber, {
    value: p.current,
    decimals: 5,
    onChange: v => updatePos(p.id, 'current', v),
    align: "right",
    color: "var(--ink)",
    bold: true
  }), /*#__PURE__*/React.createElement(EditableNumber, {
    value: p.pnl,
    prefix: p.pnl >= 0 ? '+$' : '-$',
    decimals: 0,
    onChange: v => updatePos(p.id, 'pnl', v),
    align: "right",
    color: p.pnl > 0 ? '#15A36C' : p.pnl < 0 ? '#EF4444' : 'var(--text-3)',
    bold: true
  })))));
}
function DetailSection({
  title,
  count,
  children
}) {
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      padding: '14px 22px 4px'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 10,
      fontWeight: 800,
      color: 'var(--text-3)',
      letterSpacing: 0.6,
      textTransform: 'uppercase'
    }
  }, title), count !== undefined && /*#__PURE__*/React.createElement("span", {
    className: "mono",
    style: {
      fontSize: 9,
      fontWeight: 700,
      padding: '1px 5px',
      borderRadius: 8,
      background: 'var(--bg)',
      color: 'var(--text-3)'
    }
  }, count)), children);
}
function FilterChip({
  active,
  onClick,
  label,
  count,
  dot
}) {
  return /*#__PURE__*/React.createElement("button", {
    onClick: onClick,
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      padding: '7px 12px',
      borderRadius: 8,
      background: active ? 'var(--ink)' : 'var(--bg)',
      color: active ? 'var(--ink-fg)' : 'var(--text-2)',
      fontSize: 12,
      fontWeight: 600,
      letterSpacing: 0.2,
      cursor: 'pointer',
      border: active ? '1px solid var(--ink)' : '1px solid var(--line-2)'
    }
  }, dot && /*#__PURE__*/React.createElement("span", {
    style: {
      width: 7,
      height: 7,
      borderRadius: '50%',
      background: dot
    }
  }), label, /*#__PURE__*/React.createElement("span", {
    className: "mono",
    style: {
      fontSize: 10,
      fontWeight: 700,
      padding: '1px 5px',
      borderRadius: 3,
      background: active ? 'rgba(255,255,255,0.18)' : 'var(--surface)',
      color: active ? 'var(--ink-fg)' : 'var(--text-3)'
    }
  }, count));
}
function KycBadge({
  state
}) {
  const styles = {
    verified: {
      bg: '#F0F2F5',
      col: '#1F2937',
      label: 'Verified'
    },
    pending: {
      bg: '#F0F2F5',
      col: '#6B7280',
      label: 'Pending'
    },
    rejected: {
      bg: '#E5E7EB',
      col: '#1F2937',
      label: 'Rejected'
    }
  };
  const s = styles[state] || styles.pending;
  return /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 10,
      fontWeight: 700,
      padding: '2px 6px',
      borderRadius: 3,
      letterSpacing: 0.3,
      background: s.bg,
      color: s.col
    }
  }, s.label);
}
function StatusBadge({
  state
}) {
  const styles = {
    active: {
      bg: '#F0F2F5',
      col: '#1F2937',
      label: 'Active'
    },
    limited: {
      bg: '#F0F2F5',
      col: '#6B7280',
      label: 'Limited'
    },
    blocked: {
      bg: '#E5E7EB',
      col: '#1F2937',
      label: 'Blocked'
    }
  };
  const s = styles[state] || styles.active;
  return /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 10,
      fontWeight: 700,
      padding: '2px 6px',
      borderRadius: 3,
      letterSpacing: 0.3,
      background: s.bg,
      color: s.col
    }
  }, s.label);
}
function RiskBadge({
  state
}) {
  const styles = {
    low: {
      col: '#22C55E',
      label: 'Low'
    },
    medium: {
      col: '#F59E0B',
      label: 'Medium'
    },
    high: {
      col: '#EF4444',
      label: 'High'
    }
  };
  const s = styles[state] || styles.medium;
  return /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 10.5,
      fontWeight: 700,
      color: s.col,
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 6,
      height: 6,
      borderRadius: '50%',
      background: s.col
    }
  }), s.label);
}
function SubToolbarBtn({
  icon,
  title,
  onClick
}) {
  return /*#__PURE__*/React.createElement("button", {
    onClick: onClick,
    title: title,
    style: {
      width: 26,
      height: 26,
      borderRadius: 5,
      background: 'transparent',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: 'var(--text-2)',
      border: 'none',
      cursor: 'pointer'
    },
    onMouseEnter: e => {
      e.currentTarget.style.background = 'var(--bg)';
    },
    onMouseLeave: e => {
      e.currentTarget.style.background = 'transparent';
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'Material Symbols Outlined',
      fontSize: 15
    }
  }, icon));
}
function SubChip({
  icon,
  label,
  count,
  onClick,
  active
}) {
  return /*#__PURE__*/React.createElement("button", {
    onClick: onClick,
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4,
      padding: '3px 8px',
      borderRadius: 11,
      background: active ? 'var(--ink)' : 'transparent',
      color: active ? 'var(--ink-fg)' : 'var(--text-2)',
      border: active ? '1px solid var(--ink)' : '1px solid var(--line-2)',
      fontSize: 10.5,
      fontWeight: 600,
      cursor: 'pointer',
      height: 22
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'Material Symbols Outlined',
      fontSize: 13
    }
  }, icon), label, count !== undefined && /*#__PURE__*/React.createElement("span", {
    className: "mono",
    style: {
      fontSize: 9,
      fontWeight: 700,
      padding: '0 4px',
      borderRadius: 6,
      background: active ? 'rgba(255,255,255,0.2)' : 'var(--bg)',
      color: active ? 'var(--ink-fg)' : 'var(--text-3)'
    }
  }, count));
}
function SummaryStat({
  label,
  value,
  color
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'baseline',
      gap: 5
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 9.5,
      color: 'var(--text-3)',
      fontWeight: 700,
      letterSpacing: 0.3,
      textTransform: 'uppercase'
    }
  }, label), /*#__PURE__*/React.createElement("span", {
    className: "mono",
    style: {
      fontSize: 11.5,
      fontWeight: 700,
      color: color || 'var(--ink)'
    }
  }, value));
}
function PageHeader({
  title,
  subtitle,
  actions
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '12px 24px 10px',
      background: 'var(--surface)',
      borderBottom: '1px solid var(--line)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 14
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      display: 'flex',
      alignItems: 'baseline',
      gap: 10
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 15,
      fontWeight: 700,
      color: 'var(--ink)',
      letterSpacing: -0.1
    }
  }, title), subtitle && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      color: 'var(--text-3)'
    }
  }, subtitle)), actions));
}
const btnPrimary = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '8px 14px',
  borderRadius: 8,
  background: 'var(--acc)',
  color: '#fff',
  fontSize: 12.5,
  fontWeight: 700,
  letterSpacing: 0.2,
  border: 'none',
  cursor: 'pointer'
};
function usdRate(currency) {
  const rates = {
    USD: 1,
    EUR: 1.08,
    GBP: 1.26,
    JPY: 0.0064,
    CHF: 1.10,
    KRW: 0.00073
  };
  return rates[currency] || 1;
}
const btnGhost = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '8px 12px',
  borderRadius: 8,
  background: 'var(--bg)',
  color: 'var(--text-2)',
  fontSize: 12.5,
  fontWeight: 600,
  letterSpacing: 0.2,
  border: '1px solid var(--line-2)',
  cursor: 'pointer'
};

// ── Modal wrapper ──
function MgrModal({
  title,
  subtitle,
  icon,
  iconColor,
  children,
  onClose,
  footer,
  width = 460
}) {
  return /*#__PURE__*/React.createElement("div", {
    onClick: onClose,
    style: {
      position: 'fixed',
      inset: 0,
      background: 'rgba(15,23,41,0.55)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 300,
      padding: 20
    }
  }, /*#__PURE__*/React.createElement("div", {
    onClick: e => e.stopPropagation(),
    style: {
      background: 'var(--surface)',
      borderRadius: 12,
      width,
      maxWidth: '92vw',
      maxHeight: '88vh',
      display: 'flex',
      flexDirection: 'column',
      boxShadow: 'var(--shadow-lg)',
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      padding: '18px 20px 14px',
      borderBottom: '1px solid var(--line)'
    }
  }, icon && /*#__PURE__*/React.createElement("div", {
    style: {
      width: 36,
      height: 36,
      borderRadius: 9,
      background: (iconColor || 'var(--acc-2)') + '22',
      color: iconColor || 'var(--acc-2)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'Material Symbols Outlined',
      fontSize: 20
    }
  }, icon)), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 16,
      fontWeight: 700,
      color: 'var(--ink)'
    }
  }, title), subtitle && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11.5,
      color: 'var(--text-3)',
      marginTop: 2
    }
  }, subtitle)), /*#__PURE__*/React.createElement("button", {
    onClick: onClose,
    style: {
      width: 30,
      height: 30,
      borderRadius: 15,
      background: 'var(--bg-2)',
      border: 'none',
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: 'var(--text-2)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'Material Symbols Outlined',
      fontSize: 16
    }
  }, "close"))), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      overflowY: 'auto',
      padding: '16px 20px'
    }
  }, children), footer && /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '12px 20px 16px',
      borderTop: '1px solid var(--line)',
      background: 'var(--bg)',
      display: 'flex',
      gap: 8
    }
  }, footer)));
}

// ── Adjust Balance ──
function AdjustBalanceModal({
  client,
  accounts,
  onClose
}) {
  const [acctId, setAcctId] = useState(accounts[0]?.id || '');
  const [type, setType] = useState('credit');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [done, setDone] = useState(false);
  const acct = accounts.find(a => a.id === acctId);
  function submit() {
    if (!amount || !reason || !acct) return;
    const n = parseFloat(amount) || 0;
    const sign = type === 'credit' ? 1 : type === 'debit' ? -1 : 0;
    const idx = MANAGER.ACCOUNTS.findIndex(a => a.id === acct.id);
    if (idx >= 0) {
      const a = MANAGER.ACCOUNTS[idx];
      MANAGER.ACCOUNTS[idx] = {
        ...a,
        balance: type === 'correction' ? n : a.balance + sign * n,
        equity: type === 'correction' ? n + ((a.equity || 0) - (a.balance || 0)) : (a.equity || 0) + sign * n
      };
    }
    // Audit log
    if (MANAGER.ADMIN_ACTIVITY) {
      MANAGER.ADMIN_ACTIVITY.unshift({
        ts: new Date().toISOString().slice(0, 19).replace('T', ' '),
        admin: 'admin@alpexa.com',
        kind: 'balance_adjust',
        target: acct.id,
        detail: `${type === 'credit' ? '+' : type === 'debit' ? '−' : '='}${acct.currency} ${n} — ${reason}`
      });
    }
    setDone(true);
  }
  if (done) {
    return /*#__PURE__*/React.createElement(MgrModal, {
      title: "Balance Adjusted",
      icon: "check_circle",
      iconColor: "#22C55E",
      onClose: onClose,
      footer: /*#__PURE__*/React.createElement("button", {
        onClick: onClose,
        style: {
          flex: 1,
          padding: '11px 0',
          borderRadius: 8,
          background: 'var(--ink)',
          color: 'var(--ink-fg)',
          fontSize: 13,
          fontWeight: 700,
          border: 'none',
          cursor: 'pointer'
        }
      }, "Done")
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        textAlign: 'center',
        padding: '14px 0'
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 13,
        color: 'var(--text-2)',
        lineHeight: 1.6
      }
    }, type === 'credit' ? '+' : type === 'debit' ? '−' : '·', acct.currency, " ", amount, " applied to ", /*#__PURE__*/React.createElement("b", {
      className: "mono"
    }, acct.id.toUpperCase())), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 11,
        color: 'var(--text-3)',
        marginTop: 6
      }
    }, "Client will receive a notification. Audit log entry created.")));
  }
  return /*#__PURE__*/React.createElement(MgrModal, {
    title: "Adjust Balance",
    subtitle: `${client.firstName} ${client.lastName} · ${client.id.toUpperCase()}`,
    icon: "tune",
    onClose: onClose,
    footer: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("button", {
      onClick: onClose,
      style: {
        flex: 1,
        padding: '11px 0',
        borderRadius: 8,
        background: 'var(--bg-2)',
        color: 'var(--text-2)',
        fontSize: 13,
        fontWeight: 600,
        border: 'none',
        cursor: 'pointer'
      }
    }, "Cancel"), /*#__PURE__*/React.createElement("button", {
      onClick: submit,
      disabled: !amount || !reason,
      style: {
        flex: 1.4,
        padding: '11px 0',
        borderRadius: 8,
        background: !amount || !reason ? 'var(--muted)' : 'var(--acc)',
        color: '#fff',
        fontSize: 13,
        fontWeight: 700,
        border: 'none',
        cursor: !amount || !reason ? 'not-allowed' : 'pointer'
      }
    }, "Apply Adjustment"))
  }, /*#__PURE__*/React.createElement(ModalLabel, null, "Account"), /*#__PURE__*/React.createElement("select", {
    value: acctId,
    onChange: e => setAcctId(e.target.value),
    style: {
      width: '100%',
      padding: '10px 12px',
      borderRadius: 8,
      border: '1px solid var(--line-2)',
      fontSize: 13,
      color: 'var(--ink)',
      background: 'var(--surface)',
      marginBottom: 14
    }
  }, accounts.map(a => /*#__PURE__*/React.createElement("option", {
    key: a.id,
    value: a.id
  }, a.id.toUpperCase(), " \xB7 ", a.tag, " \xB7 ", a.currency, " ", MANAGER.fmt(a.balance, a.currency === 'JPY' ? 0 : 2)))), /*#__PURE__*/React.createElement(ModalLabel, null, "Adjustment Type"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 6,
      marginBottom: 14
    }
  }, [['credit', 'Credit (+)', '#22C55E'], ['debit', 'Debit (−)', '#EF4444'], ['correction', 'Correction', '#0EA5E9']].map(([k, l, col]) => /*#__PURE__*/React.createElement("button", {
    key: k,
    onClick: () => setType(k),
    style: {
      flex: 1,
      padding: '9px 0',
      borderRadius: 7,
      fontSize: 12,
      fontWeight: 700,
      background: type === k ? col : 'var(--bg)',
      color: type === k ? '#fff' : 'var(--text-2)',
      border: '1px solid ' + (type === k ? col : 'var(--line-2)'),
      cursor: 'pointer'
    }
  }, l))), /*#__PURE__*/React.createElement(ModalLabel, null, "Amount"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'baseline',
      gap: 8,
      padding: '10px 14px',
      background: 'var(--bg)',
      borderRadius: 8,
      marginBottom: 14
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "mono",
    style: {
      fontSize: 14,
      fontWeight: 600,
      color: 'var(--text-3)'
    }
  }, acct?.currency), /*#__PURE__*/React.createElement("input", {
    type: "number",
    value: amount,
    onChange: e => setAmount(e.target.value),
    placeholder: "0.00",
    className: "mono",
    style: {
      flex: 1,
      fontSize: 20,
      fontWeight: 700,
      color: 'var(--ink)',
      background: 'transparent',
      outline: 'none',
      border: 'none'
    }
  })), /*#__PURE__*/React.createElement(ModalLabel, null, "Reason (required)"), /*#__PURE__*/React.createElement("textarea", {
    value: reason,
    onChange: e => setReason(e.target.value),
    placeholder: "e.g. Welcome bonus, KYC promotion, manual correction\u2026",
    style: {
      width: '100%',
      padding: '10px 12px',
      borderRadius: 8,
      border: '1px solid var(--line-2)',
      background: 'var(--surface)',
      fontSize: 13,
      color: 'var(--ink)',
      minHeight: 64,
      outline: 'none',
      resize: 'vertical',
      fontFamily: 'inherit',
      marginBottom: 14
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      background: '#FFF3E0',
      borderRadius: 8,
      padding: '8px 12px',
      fontSize: 11.5,
      color: '#B45309',
      display: 'flex',
      alignItems: 'flex-start',
      gap: 6
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'Material Symbols Outlined',
      fontSize: 15
    }
  }, "warning"), /*#__PURE__*/React.createElement("span", null, "This action is logged in the audit trail. Client will receive a notification.")));
}

// ── Manage KYC ──
function ManageKycModal({
  client,
  onClose
}) {
  const [newStatus, setNewStatus] = useState(client.kyc);
  const [note, setNote] = useState('');
  const [done, setDone] = useState(false);
  if (done) {
    return /*#__PURE__*/React.createElement(MgrModal, {
      title: "KYC Updated",
      icon: "check_circle",
      iconColor: "#22C55E",
      onClose: onClose,
      footer: /*#__PURE__*/React.createElement("button", {
        onClick: onClose,
        style: {
          flex: 1,
          padding: '11px 0',
          borderRadius: 8,
          background: 'var(--ink)',
          color: 'var(--ink-fg)',
          fontSize: 13,
          fontWeight: 700,
          border: 'none',
          cursor: 'pointer'
        }
      }, "Done")
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        textAlign: 'center',
        padding: '14px 0',
        fontSize: 13,
        color: 'var(--text-2)'
      }
    }, "KYC status changed to ", /*#__PURE__*/React.createElement("b", null, newStatus), " for ", client.firstName, " ", client.lastName, "."));
  }
  return /*#__PURE__*/React.createElement(MgrModal, {
    title: "Manage KYC",
    subtitle: `${client.firstName} ${client.lastName} · Current: ${client.kyc}`,
    icon: "verified_user",
    onClose: onClose,
    footer: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("button", {
      onClick: onClose,
      style: {
        flex: 1,
        padding: '11px 0',
        borderRadius: 8,
        background: 'var(--bg-2)',
        color: 'var(--text-2)',
        fontSize: 13,
        fontWeight: 600,
        border: 'none',
        cursor: 'pointer'
      }
    }, "Cancel"), /*#__PURE__*/React.createElement("button", {
      onClick: () => {
        const idx = MANAGER.CLIENTS.findIndex(c => c.id === client.id);
        if (idx >= 0) MANAGER.CLIENTS[idx] = {
          ...MANAGER.CLIENTS[idx],
          kyc: newStatus
        };
        if (MANAGER.ADMIN_ACTIVITY) MANAGER.ADMIN_ACTIVITY.unshift({
          ts: new Date().toISOString().slice(0, 19).replace('T', ' '),
          admin: 'admin@alpexa.com',
          kind: 'kyc_change',
          target: client.id,
          detail: `KYC → ${newStatus}${note ? ' (' + note + ')' : ''}`
        });
        setDone(true);
      },
      disabled: newStatus === client.kyc,
      style: {
        flex: 1.4,
        padding: '11px 0',
        borderRadius: 8,
        background: newStatus === client.kyc ? 'var(--muted)' : 'var(--acc)',
        color: '#fff',
        fontSize: 13,
        fontWeight: 700,
        border: 'none',
        cursor: newStatus === client.kyc ? 'not-allowed' : 'pointer'
      }
    }, "Update Status"))
  }, /*#__PURE__*/React.createElement(ModalLabel, null, "Documents on File"), /*#__PURE__*/React.createElement("div", {
    style: {
      background: 'var(--bg)',
      borderRadius: 8,
      padding: '10px 12px',
      marginBottom: 14
    }
  }, [{
    name: 'Passport',
    uploaded: '2026-04-12',
    status: 'verified'
  }, {
    name: 'Proof of Address',
    uploaded: '2026-04-12',
    status: client.kyc === 'verified' ? 'verified' : 'pending'
  }, {
    name: 'Selfie Verification',
    uploaded: '2026-04-12',
    status: client.kyc === 'rejected' ? 'rejected' : 'verified'
  }].map((d, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '6px 0',
      borderTop: i === 0 ? 'none' : '1px solid var(--line)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'Material Symbols Outlined',
      fontSize: 16,
      color: 'var(--text-3)'
    }
  }, "description"), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1,
      fontSize: 12.5,
      color: 'var(--ink)',
      fontWeight: 500
    }
  }, d.name), /*#__PURE__*/React.createElement(KycBadge, {
    state: d.status
  }), /*#__PURE__*/React.createElement("button", {
    style: {
      padding: '3px 8px',
      fontSize: 10.5,
      borderRadius: 5,
      background: 'var(--surface)',
      border: '1px solid var(--line-2)',
      color: 'var(--text-2)',
      fontWeight: 600,
      cursor: 'pointer'
    }
  }, "View")))), /*#__PURE__*/React.createElement(ModalLabel, null, "Change Status To"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 6,
      marginBottom: 14
    }
  }, [['verified', 'Verified', '#22C55E'], ['pending', 'Pending', '#F59E0B'], ['rejected', 'Rejected', '#EF4444']].map(([k, l, col]) => /*#__PURE__*/React.createElement("button", {
    key: k,
    onClick: () => setNewStatus(k),
    style: {
      flex: 1,
      padding: '10px 0',
      borderRadius: 7,
      fontSize: 12,
      fontWeight: 700,
      background: newStatus === k ? col : 'var(--bg)',
      color: newStatus === k ? '#fff' : 'var(--text-2)',
      border: '1px solid ' + (newStatus === k ? col : 'var(--line-2)'),
      cursor: 'pointer'
    }
  }, l))), newStatus === 'rejected' && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(ModalLabel, null, "Rejection Reason"), /*#__PURE__*/React.createElement("textarea", {
    value: note,
    onChange: e => setNote(e.target.value),
    placeholder: "e.g. Document expired, name mismatch, address unreadable\u2026",
    style: {
      width: '100%',
      padding: '10px 12px',
      borderRadius: 8,
      border: '1px solid var(--line-2)',
      background: 'var(--surface)',
      fontSize: 13,
      color: 'var(--ink)',
      minHeight: 64,
      outline: 'none',
      resize: 'vertical',
      fontFamily: 'inherit'
    }
  })));
}

// ── Send Message ──
function SendMessageModal({
  client,
  onClose
}) {
  const [channel, setChannel] = useState('email');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [done, setDone] = useState(false);
  if (done) {
    return /*#__PURE__*/React.createElement(MgrModal, {
      title: "Message Sent",
      icon: "check_circle",
      iconColor: "#22C55E",
      onClose: onClose,
      footer: /*#__PURE__*/React.createElement("button", {
        onClick: onClose,
        style: {
          flex: 1,
          padding: '11px 0',
          borderRadius: 8,
          background: 'var(--ink)',
          color: 'var(--ink-fg)',
          fontSize: 13,
          fontWeight: 700,
          border: 'none',
          cursor: 'pointer'
        }
      }, "Done")
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        textAlign: 'center',
        padding: '14px 0',
        fontSize: 13,
        color: 'var(--text-2)',
        lineHeight: 1.6
      }
    }, "Message delivered to ", client.firstName, " ", client.lastName, " via ", channel === 'email' ? 'email' : channel === 'sms' ? 'SMS' : 'in-app push', "."));
  }
  return /*#__PURE__*/React.createElement(MgrModal, {
    title: "Send Message",
    subtitle: `To: ${client.firstName} ${client.lastName} · ${client.email}`,
    icon: "mail",
    onClose: onClose,
    footer: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("button", {
      onClick: onClose,
      style: {
        flex: 1,
        padding: '11px 0',
        borderRadius: 8,
        background: 'var(--bg-2)',
        color: 'var(--text-2)',
        fontSize: 13,
        fontWeight: 600,
        border: 'none',
        cursor: 'pointer'
      }
    }, "Cancel"), /*#__PURE__*/React.createElement("button", {
      onClick: () => {
        if (MANAGER.ADMIN_ACTIVITY) MANAGER.ADMIN_ACTIVITY.unshift({
          ts: new Date().toISOString().slice(0, 19).replace('T', ' '),
          admin: 'admin@alpexa.com',
          kind: 'message',
          target: client.id,
          detail: `${channel.toUpperCase()}: ${(subject || body).slice(0, 60)}`
        });
        setDone(true);
      },
      disabled: !body || channel === 'email' && !subject,
      style: {
        flex: 1.4,
        padding: '11px 0',
        borderRadius: 8,
        background: !body || channel === 'email' && !subject ? 'var(--muted)' : 'var(--acc)',
        color: '#fff',
        fontSize: 13,
        fontWeight: 700,
        border: 'none',
        cursor: !body || channel === 'email' && !subject ? 'not-allowed' : 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: 'Material Symbols Outlined',
        fontSize: 15
      }
    }, "send"), "Send Now"))
  }, /*#__PURE__*/React.createElement(ModalLabel, null, "Channel"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 6,
      marginBottom: 14
    }
  }, [['email', 'Email', 'mail'], ['sms', 'SMS', 'sms'], ['push', 'Push', 'notifications']].map(([k, l, ic]) => /*#__PURE__*/React.createElement("button", {
    key: k,
    onClick: () => setChannel(k),
    style: {
      flex: 1,
      padding: '10px 0',
      borderRadius: 7,
      fontSize: 12,
      fontWeight: 700,
      background: channel === k ? 'var(--acc-3)' : 'var(--bg)',
      color: channel === k ? 'var(--acc-2)' : 'var(--text-2)',
      border: '1px solid ' + (channel === k ? 'var(--acc)' : 'var(--line-2)'),
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 5
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'Material Symbols Outlined',
      fontSize: 15
    }
  }, ic), l))), channel === 'email' && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(ModalLabel, null, "Subject"), /*#__PURE__*/React.createElement("input", {
    value: subject,
    onChange: e => setSubject(e.target.value),
    placeholder: "Important: Account verification update",
    style: {
      width: '100%',
      padding: '10px 12px',
      borderRadius: 8,
      border: '1px solid var(--line-2)',
      background: 'var(--surface)',
      fontSize: 13,
      color: 'var(--ink)',
      outline: 'none',
      marginBottom: 14
    }
  })), /*#__PURE__*/React.createElement(ModalLabel, null, "Message"), /*#__PURE__*/React.createElement("textarea", {
    value: body,
    onChange: e => setBody(e.target.value),
    placeholder: "Type your message...",
    style: {
      width: '100%',
      padding: '10px 12px',
      borderRadius: 8,
      border: '1px solid var(--line-2)',
      background: 'var(--surface)',
      fontSize: 13,
      color: 'var(--ink)',
      minHeight: 120,
      outline: 'none',
      resize: 'vertical',
      fontFamily: 'inherit',
      marginBottom: 14
    }
  }), /*#__PURE__*/React.createElement(ModalLabel, null, "Quick Templates"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 6,
      flexWrap: 'wrap'
    }
  }, [{
    l: 'KYC reminder',
    s: 'Action needed: complete KYC',
    b: `Hi ${client.firstName},\n\nWe noticed your KYC verification is pending. Please complete the verification to enable full account features.\n\nBest, ALPEXA Team`
  }, {
    l: 'Margin warning',
    s: 'Your account requires attention',
    b: `Hi ${client.firstName},\n\nYour margin level is approaching the maintenance threshold. Please consider adding funds or closing positions to avoid stop-out.\n\nBest, ALPEXA Team`
  }, {
    l: 'Welcome',
    s: 'Welcome to ALPEXA',
    b: `Hi ${client.firstName},\n\nWelcome aboard! Your account is ready for trading.\n\nBest, ALPEXA Team`
  }].map((t, i) => /*#__PURE__*/React.createElement("button", {
    key: i,
    onClick: () => {
      setSubject(t.s);
      setBody(t.b);
    },
    style: {
      padding: '5px 10px',
      borderRadius: 6,
      background: 'var(--bg)',
      border: '1px solid var(--line-2)',
      fontSize: 11,
      color: 'var(--text-2)',
      fontWeight: 600,
      cursor: 'pointer'
    }
  }, t.l))));
}

// ── Block Account ──
function BlockAccountModal({
  client,
  onClose
}) {
  const isBlocked = client.status === 'blocked';
  const [reason, setReason] = useState('');
  const [done, setDone] = useState(false);
  if (done) {
    return /*#__PURE__*/React.createElement(MgrModal, {
      title: isBlocked ? 'Account Unblocked' : 'Account Blocked',
      icon: isBlocked ? 'lock_open' : 'block',
      iconColor: isBlocked ? '#22C55E' : '#EF4444',
      onClose: onClose,
      footer: /*#__PURE__*/React.createElement("button", {
        onClick: onClose,
        style: {
          flex: 1,
          padding: '11px 0',
          borderRadius: 8,
          background: 'var(--ink)',
          color: 'var(--ink-fg)',
          fontSize: 13,
          fontWeight: 700,
          border: 'none',
          cursor: 'pointer'
        }
      }, "Done")
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        textAlign: 'center',
        padding: '14px 0',
        fontSize: 13,
        color: 'var(--text-2)',
        lineHeight: 1.6
      }
    }, isBlocked ? /*#__PURE__*/React.createElement(React.Fragment, null, client.firstName, " ", client.lastName, "'s account access has been restored.") : /*#__PURE__*/React.createElement(React.Fragment, null, client.firstName, " ", client.lastName, "'s account is now blocked.", /*#__PURE__*/React.createElement("br", null), "They cannot sign in or place new trades.")));
  }
  return /*#__PURE__*/React.createElement(MgrModal, {
    title: isBlocked ? 'Unblock Account' : 'Block Account',
    subtitle: `${client.firstName} ${client.lastName} · ${client.id.toUpperCase()}`,
    icon: isBlocked ? 'lock_open' : 'block',
    iconColor: isBlocked ? '#22C55E' : '#EF4444',
    onClose: onClose,
    footer: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("button", {
      onClick: onClose,
      style: {
        flex: 1,
        padding: '11px 0',
        borderRadius: 8,
        background: 'var(--bg-2)',
        color: 'var(--text-2)',
        fontSize: 13,
        fontWeight: 600,
        border: 'none',
        cursor: 'pointer'
      }
    }, "Cancel"), /*#__PURE__*/React.createElement("button", {
      onClick: () => {
        const idx = MANAGER.CLIENTS.findIndex(c => c.id === client.id);
        if (idx >= 0) MANAGER.CLIENTS[idx] = {
          ...MANAGER.CLIENTS[idx],
          status: isBlocked ? 'active' : 'blocked'
        };
        if (MANAGER.ADMIN_ACTIVITY) MANAGER.ADMIN_ACTIVITY.unshift({
          ts: new Date().toISOString().slice(0, 19).replace('T', ' '),
          admin: 'admin@alpexa.com',
          kind: isBlocked ? 'unblock' : 'block',
          target: client.id,
          detail: reason
        });
        setDone(true);
      },
      disabled: !reason,
      style: {
        flex: 1.4,
        padding: '11px 0',
        borderRadius: 8,
        background: !reason ? 'var(--muted)' : isBlocked ? '#22C55E' : '#EF4444',
        color: '#fff',
        fontSize: 13,
        fontWeight: 700,
        border: 'none',
        cursor: !reason ? 'not-allowed' : 'pointer'
      }
    }, isBlocked ? 'Restore Access' : 'Block Now'))
  }, !isBlocked && /*#__PURE__*/React.createElement("div", {
    style: {
      background: '#FFEBEE',
      borderRadius: 8,
      padding: '12px 14px',
      marginBottom: 14,
      display: 'flex',
      alignItems: 'flex-start',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'Material Symbols Outlined',
      fontSize: 18,
      color: '#C62828'
    }
  }, "warning"), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      fontSize: 12,
      color: '#C62828',
      lineHeight: 1.5
    }
  }, /*#__PURE__*/React.createElement("b", null, "This will immediately:"), /*#__PURE__*/React.createElement("ul", {
    style: {
      margin: '6px 0 0 18px',
      padding: 0
    }
  }, /*#__PURE__*/React.createElement("li", null, "Sign the client out from all devices"), /*#__PURE__*/React.createElement("li", null, "Prevent new sign-ins and new orders"), /*#__PURE__*/React.createElement("li", null, "Suspend all pending orders (open positions remain)"), /*#__PURE__*/React.createElement("li", null, "Block deposits and withdrawals")))), /*#__PURE__*/React.createElement(ModalLabel, null, isBlocked ? 'Restoration Note' : 'Reason for Blocking', " (required)"), /*#__PURE__*/React.createElement("select", {
    value: reason,
    onChange: e => setReason(e.target.value),
    style: {
      width: '100%',
      padding: '10px 12px',
      borderRadius: 8,
      border: '1px solid var(--line-2)',
      fontSize: 13,
      color: 'var(--ink)',
      background: 'var(--surface)',
      marginBottom: 14
    }
  }, /*#__PURE__*/React.createElement("option", {
    value: ""
  }, "Select a reason\u2026"), isBlocked ? /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("option", {
    value: "resolved"
  }, "Issue resolved \xB7 access restored"), /*#__PURE__*/React.createElement("option", {
    value: "kyc"
  }, "KYC verification completed"), /*#__PURE__*/React.createElement("option", {
    value: "appeal"
  }, "Customer appeal approved"), /*#__PURE__*/React.createElement("option", {
    value: "other"
  }, "Other (specify in notes)")) : /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("option", {
    value: "aml"
  }, "AML review \xB7 suspicious activity"), /*#__PURE__*/React.createElement("option", {
    value: "kyc_failed"
  }, "KYC documents rejected"), /*#__PURE__*/React.createElement("option", {
    value: "fraud"
  }, "Fraud suspicion"), /*#__PURE__*/React.createElement("option", {
    value: "customer_request"
  }, "Customer requested closure"), /*#__PURE__*/React.createElement("option", {
    value: "regulatory"
  }, "Regulatory requirement"), /*#__PURE__*/React.createElement("option", {
    value: "other"
  }, "Other"))), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      color: 'var(--text-3)',
      lineHeight: 1.5
    }
  }, "This action will be logged in the audit trail with your admin ID and timestamp.", !isBlocked && ' Existing positions remain open for risk management.'));
}
function ModalLabel({
  children
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10,
      fontWeight: 700,
      color: 'var(--text-3)',
      letterSpacing: 0.5,
      marginBottom: 6,
      textTransform: 'uppercase'
    }
  }, children);
}
function ColHeader({
  col,
  currentWidth,
  setWidth,
  onReset,
  isLast,
  sortKey,
  sortDir,
  onSort
}) {
  const [dragging, setDragging] = useState(false);
  const sortable = col.key !== 'dot' && !!onSort;
  const active = sortKey === col.key;
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
  function handleClick(e) {
    if (e.target.closest && e.target.closest('.mgr-col-resize')) return;
    if (sortable) {
      e.stopPropagation();
      onSort(col.key);
    }
  }
  const arrow = !sortable ? null : active ? /*#__PURE__*/React.createElement("svg", {
    width: "9",
    height: "9",
    viewBox: "0 0 24 24",
    fill: "#5BB0FF",
    style: {
      flexShrink: 0,
      marginLeft: 4
    }
  }, sortDir === 'asc' ? /*#__PURE__*/React.createElement("path", {
    d: "M7 14l5-5 5 5z"
  }) : /*#__PURE__*/React.createElement("path", {
    d: "M7 10l5 5 5-5z"
  })) : /*#__PURE__*/React.createElement("svg", {
    width: "8",
    height: "10",
    viewBox: "0 0 24 24",
    fill: "rgba(255,255,255,0.35)",
    style: {
      flexShrink: 0,
      marginLeft: 4
    }
  }, /*#__PURE__*/React.createElement("path", {
    d: "M7 9l5-5 5 5z M7 15l5 5 5-5z"
  }));
  return /*#__PURE__*/React.createElement("span", {
    onClick: sortable ? handleClick : undefined,
    onDoubleClick: col.key === 'dot' ? onReset : undefined,
    title: col.key === 'dot' ? 'Double-click to reset column widths' : sortable ? `Sort by ${col.label}` : col.label,
    style: {
      textAlign: col.align || 'left',
      cursor: sortable ? 'pointer' : 'default',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 0,
      width: '100%',
      height: '100%',
      userSelect: 'none',
      background: active ? 'rgba(91,176,255,0.10)' : 'transparent',
      color: active ? '#FFFFFF' : 'inherit'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      pointerEvents: 'none'
    }
  }, col.label), /*#__PURE__*/React.createElement("span", {
    style: {
      pointerEvents: 'none',
      display: 'inline-flex'
    }
  }, arrow), col.resizable !== false && !isLast && /*#__PURE__*/React.createElement("span", {
    className: 'mgr-col-resize ' + (dragging ? 'dragging' : ''),
    onMouseDown: onMouseDown
  }));
}

// ─── Edit Client Info ─────────────────────────────────────
function EditInfoModal({
  client,
  onClose
}) {
  const [form, setForm] = useState({
    firstName: client.firstName,
    lastName: client.lastName,
    email: client.email,
    phone: client.phone,
    country: client.country,
    dob: client.dob,
    risk: client.risk
  });
  const [saved, setSaved] = useState(false);
  function save() {
    const idx = MANAGER.CLIENTS.findIndex(x => x.id === client.id);
    if (idx >= 0) MANAGER.CLIENTS[idx] = {
      ...MANAGER.CLIENTS[idx],
      ...form
    };
    setSaved(true);
    setTimeout(onClose, 700);
  }
  const fld = {
    width: '100%',
    padding: '8px 10px',
    borderRadius: 3,
    border: '1px solid var(--line-2)',
    fontSize: 13,
    color: 'var(--ink)',
    background: 'var(--surface)',
    fontFamily: 'inherit',
    boxSizing: 'border-box'
  };
  return /*#__PURE__*/React.createElement(MgrModal, {
    title: "Edit Client Info",
    subtitle: `${client.firstName} ${client.lastName} · ${client.id}`,
    icon: "edit",
    iconColor: "#1B3955",
    onClose: onClose,
    width: 520,
    footer: /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        gap: 8,
        justifyContent: 'flex-end'
      }
    }, /*#__PURE__*/React.createElement("button", {
      onClick: onClose,
      style: btnGhost
    }, "Cancel"), /*#__PURE__*/React.createElement("button", {
      onClick: save,
      style: {
        ...btnPrimary,
        background: '#1B3955'
      }
    }, saved ? 'Saved ✓' : 'Save Changes'))
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 12,
      padding: '4px 0'
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(ModalLabel, null, "First name"), /*#__PURE__*/React.createElement("input", {
    style: fld,
    value: form.firstName,
    onChange: e => setForm({
      ...form,
      firstName: e.target.value
    })
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(ModalLabel, null, "Last name"), /*#__PURE__*/React.createElement("input", {
    style: fld,
    value: form.lastName,
    onChange: e => setForm({
      ...form,
      lastName: e.target.value
    })
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      gridColumn: '1 / 3'
    }
  }, /*#__PURE__*/React.createElement(ModalLabel, null, "Email"), /*#__PURE__*/React.createElement("input", {
    style: fld,
    value: form.email,
    onChange: e => setForm({
      ...form,
      email: e.target.value
    })
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(ModalLabel, null, "Phone"), /*#__PURE__*/React.createElement("input", {
    style: fld,
    value: form.phone,
    onChange: e => setForm({
      ...form,
      phone: e.target.value
    })
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(ModalLabel, null, "Country"), /*#__PURE__*/React.createElement("input", {
    style: fld,
    maxLength: "2",
    value: form.country,
    onChange: e => setForm({
      ...form,
      country: e.target.value.toUpperCase()
    })
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(ModalLabel, null, "Date of birth"), /*#__PURE__*/React.createElement("input", {
    type: "date",
    style: fld,
    value: form.dob,
    onChange: e => setForm({
      ...form,
      dob: e.target.value
    })
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(ModalLabel, null, "Risk rating"), /*#__PURE__*/React.createElement("select", {
    style: fld,
    value: form.risk,
    onChange: e => setForm({
      ...form,
      risk: e.target.value
    })
  }, /*#__PURE__*/React.createElement("option", {
    value: "low"
  }, "Low"), /*#__PURE__*/React.createElement("option", {
    value: "medium"
  }, "Medium"), /*#__PURE__*/React.createElement("option", {
    value: "high"
  }, "High")))));
}

// ─── Transfer Balance Between Servers ─────────────────────
function TransferBalanceModal({
  client,
  accounts,
  onClose
}) {
  const [fromId, setFromId] = useState(accounts[0]?.id || '');
  const [toId, setToId] = useState(accounts[1]?.id || accounts[0]?.id || '');
  const [amt, setAmt] = useState('');
  const [note, setNote] = useState('Inter-server transfer');
  const [done, setDone] = useState(false);
  const from = accounts.find(a => a.id === fromId);
  const to = accounts.find(a => a.id === toId);
  const n = parseFloat(amt) || 0;
  const valid = from && to && fromId !== toId && n > 0 && n <= (from?.balance || 0);
  function transfer() {
    if (!valid) return;
    const fIdx = MANAGER.ACCOUNTS.findIndex(x => x.id === fromId);
    const tIdx = MANAGER.ACCOUNTS.findIndex(x => x.id === toId);
    if (fIdx >= 0 && tIdx >= 0) {
      MANAGER.ACCOUNTS[fIdx] = {
        ...MANAGER.ACCOUNTS[fIdx],
        balance: MANAGER.ACCOUNTS[fIdx].balance - n
      };
      const fxFrom = usdRate(MANAGER.ACCOUNTS[fIdx].currency);
      const fxTo = usdRate(MANAGER.ACCOUNTS[tIdx].currency);
      const credited = n * fxFrom / fxTo;
      MANAGER.ACCOUNTS[tIdx] = {
        ...MANAGER.ACCOUNTS[tIdx],
        balance: MANAGER.ACCOUNTS[tIdx].balance + credited
      };
    }
    setDone(true);
    setTimeout(onClose, 900);
  }
  const fld = {
    width: '100%',
    padding: '8px 10px',
    borderRadius: 3,
    border: '1px solid var(--line-2)',
    fontSize: 13,
    color: 'var(--ink)',
    background: 'var(--surface)',
    fontFamily: 'inherit',
    boxSizing: 'border-box'
  };
  function tagColor(t) {
    return t === 'FX' ? '#15A36C' : t === 'CRYPTO' ? '#F59E0B' : '#7C3AED';
  }
  return /*#__PURE__*/React.createElement(MgrModal, {
    title: "Transfer Between Servers",
    subtitle: `${client.firstName} ${client.lastName}`,
    icon: "swap_horiz",
    iconColor: "#1B3955",
    onClose: onClose,
    width: 520,
    footer: /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        gap: 8,
        justifyContent: 'flex-end'
      }
    }, /*#__PURE__*/React.createElement("button", {
      onClick: onClose,
      style: btnGhost
    }, "Cancel"), /*#__PURE__*/React.createElement("button", {
      onClick: transfer,
      disabled: !valid,
      style: {
        ...btnPrimary,
        background: valid ? '#1B3955' : '#9AA3B2',
        cursor: valid ? 'pointer' : 'not-allowed'
      }
    }, done ? 'Transferred ✓' : 'Execute Transfer'))
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr',
      gap: 12,
      padding: '4px 0'
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(ModalLabel, null, "From account"), /*#__PURE__*/React.createElement("select", {
    style: fld,
    value: fromId,
    onChange: e => setFromId(e.target.value)
  }, accounts.map(a => /*#__PURE__*/React.createElement("option", {
    key: a.id,
    value: a.id
  }, "[", a.tag, "] #", a.accountNo || a.id.toUpperCase(), " \xB7 ", a.currency, " ", MANAGER.fmt(a.balance, 2))))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'center',
      color: '#1B3955'
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: "22",
    height: "22",
    viewBox: "0 0 24 24",
    fill: "currentColor"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M12 4l-1.4 1.4L16.2 11H4v2h12.2l-5.6 5.6L12 20l8-8z"
  }))), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(ModalLabel, null, "To account"), /*#__PURE__*/React.createElement("select", {
    style: fld,
    value: toId,
    onChange: e => setToId(e.target.value)
  }, accounts.filter(a => a.id !== fromId).map(a => /*#__PURE__*/React.createElement("option", {
    key: a.id,
    value: a.id
  }, "[", a.tag, "] #", a.accountNo || a.id.toUpperCase(), " \xB7 ", a.currency, " ", MANAGER.fmt(a.balance, 2))))), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(ModalLabel, null, "Amount ", from && /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--text-3)',
      fontWeight: 400
    }
  }, "(", from.currency, ")")), /*#__PURE__*/React.createElement("input", {
    type: "number",
    style: fld,
    value: amt,
    onChange: e => setAmt(e.target.value),
    placeholder: "0.00"
  }), from && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10.5,
      color: 'var(--text-3)',
      marginTop: 4
    }
  }, "Available: ", /*#__PURE__*/React.createElement("span", {
    className: "mono",
    style: {
      color: 'var(--ink)',
      fontWeight: 700
    }
  }, from.currency, " ", MANAGER.fmt(from.balance, 2)))), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(ModalLabel, null, "Note"), /*#__PURE__*/React.createElement("input", {
    style: fld,
    value: note,
    onChange: e => setNote(e.target.value)
  })), from && to && /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '10px 12px',
      background: '#F4F7FB',
      borderLeft: '3px solid #1B3955',
      fontSize: 11.5,
      color: 'var(--text-2)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between'
    }
  }, /*#__PURE__*/React.createElement("span", null, "Source:"), /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement("span", {
    style: {
      padding: '1px 6px',
      background: tagColor(from.tag) + '22',
      color: tagColor(from.tag),
      fontWeight: 700,
      fontSize: 10,
      borderRadius: 2
    }
  }, from.tag), " #", from.accountNo)), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      marginTop: 4
    }
  }, /*#__PURE__*/React.createElement("span", null, "Destination:"), /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement("span", {
    style: {
      padding: '1px 6px',
      background: tagColor(to.tag) + '22',
      color: tagColor(to.tag),
      fontWeight: 700,
      fontSize: 10,
      borderRadius: 2
    }
  }, to.tag), " #", to.accountNo)), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      marginTop: 4
    }
  }, /*#__PURE__*/React.createElement("span", null, "FX rate:"), /*#__PURE__*/React.createElement("span", {
    className: "mono"
  }, from.currency, " \u2192 ", to.currency)))));
}

// ─── Account Activity History ─────────────────────────────
function HistoryModal({
  client,
  onClose
}) {
  // Synthesize plausible event log from positions, joined date, and KYC state
  const events = useMemo(() => {
    const out = [];
    out.push({
      ts: client.joined,
      kind: 'signup',
      text: `Account opened from ${client.country}`
    });
    if (client.kyc === 'verified') out.push({
      ts: client.joined,
      kind: 'kyc',
      text: 'KYC documents verified'
    });
    if (client.kyc === 'pending') out.push({
      ts: client.lastSeen,
      kind: 'kyc',
      text: 'KYC submitted — under review'
    });
    if (client.kyc === 'rejected') out.push({
      ts: client.lastSeen,
      kind: 'kyc',
      text: 'KYC rejected — resubmission required'
    });
    const accts = MANAGER.findAccounts(client.id);
    accts.forEach(a => {
      out.push({
        ts: a.created || client.joined,
        kind: 'account',
        text: `Account [${a.tag}] #${a.accountNo || a.id.toUpperCase()} created`
      });
      if (a.balance > 0) out.push({
        ts: a.created || client.joined,
        kind: 'deposit',
        text: `Initial deposit ${a.currency} ${MANAGER.fmt(a.balance, 2)}`,
        amount: a.balance,
        currency: a.currency
      });
    });
    const positions = MANAGER.findPositions(client.id);
    positions.forEach(p => {
      out.push({
        ts: p.openTime || client.lastSeen,
        kind: 'trade',
        text: `${p.side?.toUpperCase() || 'BUY'} ${p.volume || 1} ${p.symbol} @ ${p.openPrice}`,
        side: p.side
      });
    });
    out.push({
      ts: client.lastSeen,
      kind: 'login',
      text: `Signed in · ${client.sessionDevice}`
    });
    return out.sort((a, b) => (b.ts || '').localeCompare(a.ts || ''));
  }, [client]);
  const iconFor = k => k === 'signup' ? 'person_add' : k === 'kyc' ? 'verified_user' : k === 'account' ? 'account_balance' : k === 'deposit' ? 'arrow_downward' : k === 'trade' ? 'trending_up' : 'login';
  const colorFor = k => k === 'signup' ? '#1B3955' : k === 'kyc' ? '#0EA5E9' : k === 'account' ? '#5BB0FF' : k === 'deposit' ? '#15A36C' : k === 'trade' ? '#7C3AED' : '#5A6478';
  return /*#__PURE__*/React.createElement(MgrModal, {
    title: "Account History",
    subtitle: `${client.firstName} ${client.lastName} · ${events.length} events`,
    icon: "schedule",
    iconColor: "#1B3955",
    onClose: onClose,
    width: 560,
    footer: /*#__PURE__*/React.createElement("button", {
      onClick: onClose,
      style: btnGhost
    }, "Close")
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      maxHeight: 420,
      overflowY: 'auto',
      margin: '0 -4px'
    }
  }, events.map((ev, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      display: 'flex',
      alignItems: 'flex-start',
      gap: 10,
      padding: '10px 6px',
      borderBottom: i < events.length - 1 ? '1px solid var(--line)' : 'none'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 28,
      height: 28,
      borderRadius: 3,
      background: colorFor(ev.kind) + '18',
      color: colorFor(ev.kind),
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'Material Symbols Outlined',
      fontSize: 16
    }
  }, iconFor(ev.kind))), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12.5,
      color: 'var(--ink)',
      fontWeight: 500
    }
  }, ev.text), /*#__PURE__*/React.createElement("div", {
    className: "mono",
    style: {
      fontSize: 10,
      color: 'var(--text-3)',
      marginTop: 2
    }
  }, ev.ts || '—')), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 9.5,
      fontWeight: 700,
      color: colorFor(ev.kind),
      padding: '2px 7px',
      background: colorFor(ev.kind) + '12',
      borderRadius: 2,
      textTransform: 'uppercase',
      flexShrink: 0,
      letterSpacing: 0.4
    }
  }, ev.kind)))));
}

// ─── Order History (Trades) ───────────────────────────────
function OrderHistoryModal({
  client,
  onClose
}) {
  // Combine open positions + synthetic closed trades for the client
  const orders = useMemo(() => {
    const open = MANAGER.findPositions(client.id).map(p => ({
      id: p.id,
      ts: p.openTime || client.lastSeen,
      status: 'open',
      symbol: p.symbol,
      side: (p.side || 'buy').toLowerCase(),
      volume: p.volume || 1,
      openPrice: p.openPrice,
      closePrice: p.currentPrice || p.openPrice,
      pnl: p.pnl || 0
    }));
    // synthesize 8 closed trades
    const symbols = ['EURUSD', 'GBPUSD', 'XAUUSD', 'USDJPY', 'BTCUSD', 'ETHUSD', 'US30', 'NAS100'];
    const closed = [];
    for (let i = 0; i < 8; i++) {
      const sym = symbols[(i + client.id.charCodeAt(2)) % symbols.length];
      const side = i % 2 === 0 ? 'buy' : 'sell';
      const op = sym.startsWith('BTC') ? 60000 + i * 420 : sym.startsWith('ETH') ? 3400 + i * 30 : sym === 'XAUUSD' ? 2350 + i * 4 : sym === 'USDJPY' ? 156 + i * 0.04 : 1.07 + i * 0.003;
      const cp = op * (1 + (i * 7 % 9 - 4) / 1000);
      const pnl = (cp - op) * (side === 'buy' ? 1 : -1) * (sym.startsWith('BTC') || sym.startsWith('ETH') ? 0.05 : sym === 'XAUUSD' ? 5 : 10000);
      closed.push({
        id: 'h' + i,
        ts: `2026-05-${String(5 + i * 2).padStart(2, '0')} ${String(9 + i).padStart(2, '0')}:${String(i * 13 % 60).padStart(2, '0')}`,
        status: 'closed',
        symbol: sym,
        side,
        volume: (0.1 * (1 + i % 5)).toFixed(2),
        openPrice: op,
        closePrice: cp,
        pnl
      });
    }
    return [...open, ...closed].sort((a, b) => (b.ts || '').localeCompare(a.ts || ''));
  }, [client]);
  const totalPnl = orders.reduce((s, o) => s + (o.pnl || 0), 0);
  return /*#__PURE__*/React.createElement(MgrModal, {
    title: "Order History",
    subtitle: `${client.firstName} ${client.lastName} · ${orders.length} orders · Net P/L $${MANAGER.fmt(totalPnl, 2)}`,
    icon: "receipt_long",
    iconColor: "#1B3955",
    onClose: onClose,
    width: 680,
    footer: /*#__PURE__*/React.createElement("button", {
      onClick: onClose,
      style: btnGhost
    }, "Close")
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      margin: '0 -4px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '80px 1fr 60px 60px 90px 90px 80px 70px',
      padding: '6px 6px',
      background: '#1B3955',
      color: 'rgba(255,255,255,0.92)',
      fontSize: 10,
      fontWeight: 700,
      letterSpacing: 0.5,
      textTransform: 'uppercase',
      gap: 4,
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement("span", null, "Order"), /*#__PURE__*/React.createElement("span", null, "Time"), /*#__PURE__*/React.createElement("span", {
    style: {
      textAlign: 'center'
    }
  }, "Side"), /*#__PURE__*/React.createElement("span", {
    style: {
      textAlign: 'right'
    }
  }, "Lots"), /*#__PURE__*/React.createElement("span", null, "Symbol"), /*#__PURE__*/React.createElement("span", {
    style: {
      textAlign: 'right'
    }
  }, "Open"), /*#__PURE__*/React.createElement("span", {
    style: {
      textAlign: 'right'
    }
  }, "Close"), /*#__PURE__*/React.createElement("span", {
    style: {
      textAlign: 'right'
    }
  }, "P/L")), /*#__PURE__*/React.createElement("div", {
    style: {
      maxHeight: 380,
      overflowY: 'auto'
    }
  }, orders.map((o, i) => /*#__PURE__*/React.createElement("div", {
    key: o.id,
    style: {
      display: 'grid',
      gridTemplateColumns: '80px 1fr 60px 60px 90px 90px 80px 70px',
      padding: '5px 6px',
      borderBottom: '1px solid #E5E7EB',
      background: i % 2 === 1 ? '#F7F9FC' : 'transparent',
      fontSize: 11,
      gap: 4,
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "mono",
    style: {
      color: 'var(--text-2)'
    }
  }, "#", o.id.toUpperCase()), /*#__PURE__*/React.createElement("span", {
    className: "mono",
    style: {
      color: 'var(--text-2)',
      fontSize: 10.5
    }
  }, o.ts), /*#__PURE__*/React.createElement("span", {
    style: {
      textAlign: 'center'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      padding: '1px 6px',
      fontSize: 9.5,
      fontWeight: 800,
      color: '#fff',
      background: o.side === 'buy' ? '#2E6FB0' : '#E04141',
      textTransform: 'uppercase',
      letterSpacing: 0.4
    }
  }, o.side)), /*#__PURE__*/React.createElement("span", {
    className: "mono",
    style: {
      textAlign: 'right',
      color: 'var(--ink)'
    }
  }, o.volume), /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--ink)',
      fontWeight: 600
    }
  }, o.symbol), /*#__PURE__*/React.createElement("span", {
    className: "mono",
    style: {
      textAlign: 'right',
      color: 'var(--text-2)'
    }
  }, typeof o.openPrice === 'number' ? o.openPrice.toFixed(o.symbol.includes('JPY') ? 3 : o.symbol.startsWith('BTC') || o.symbol.startsWith('ETH') ? 2 : 5) : o.openPrice), /*#__PURE__*/React.createElement("span", {
    className: "mono",
    style: {
      textAlign: 'right',
      color: 'var(--text-2)'
    }
  }, typeof o.closePrice === 'number' ? o.closePrice.toFixed(o.symbol.includes('JPY') ? 3 : o.symbol.startsWith('BTC') || o.symbol.startsWith('ETH') ? 2 : 5) : o.closePrice), /*#__PURE__*/React.createElement("span", {
    className: "mono",
    style: {
      textAlign: 'right',
      color: o.pnl > 0 ? '#15A36C' : o.pnl < 0 ? '#EF4444' : 'var(--ink)',
      fontWeight: 700
    }
  }, o.pnl >= 0 ? '+' : '', MANAGER.fmt(o.pnl, 2)))))));
}
Object.assign(window, {
  ClientsScreen,
  ClientDetailDrawer,
  FilterChip,
  KycBadge,
  StatusBadge,
  RiskBadge,
  PageHeader,
  btnPrimary,
  btnGhost,
  usdRate,
  MgrModal,
  ModalLabel,
  ColHeader,
  EditInfoModal,
  TransferBalanceModal,
  HistoryModal,
  OrderHistoryModal
});

// ─── manager-accounts ─────────────────────────────────────
// ALPEXA Manager — Accounts screen (balance adjustment, leverage, group)
const {
  useState: useStateAcc
} = React;
function AccountsScreen({
  server,
  quotesOpen,
  setQuotesOpen
}) {
  const [search, setSearch] = useState('');
  const [serverFilter, setServerFilter] = useState(server || 'all'); // all | LIVE | CRYPTO | SPORTS — defaults to active server
  const view = 'all'; // single unified view (sort via column headers)
  const [adjustingId, setAdjustingId] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [detailId, setDetailId] = useState(null);
  const [sortKey, setSortKey] = useState('account');
  const [sortDir, setSortDir] = useState('asc');
  const [refreshTick, setRefreshTick] = useState(0);
  function toggleSort(key) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');else {
      setSortKey(key);
      setSortDir(['balance', 'equity', 'margin', 'created'].includes(key) ? 'desc' : 'asc');
    }
  }

  // Base filtering by tag + search
  let rows = MANAGER.ACCOUNTS.filter(a => {
    if (serverFilter !== 'all' && a.tag !== serverFilter) return false;
    if (search) {
      const c = MANAGER.findClient(a.clientId);
      const q = search.toLowerCase();
      if (!a.id.toLowerCase().includes(q) && !(a.accountNo || '').includes(search) && !(c && (c.firstName.toLowerCase().includes(q) || c.lastName.toLowerCase().includes(q) || c.email.toLowerCase().includes(q)))) return false;
    }
    return true;
  });

  // Column-header sort
  const dir = sortDir === 'asc' ? 1 : -1;
  rows = [...rows].sort((a, b) => {
    switch (sortKey) {
      case 'account':
        return (a.accountNo || '').localeCompare(b.accountNo || '') * dir;
      case 'created':
        return (a.created || '').localeCompare(b.created || '') * dir;
      case 'client':
        {
          const ca = MANAGER.findClient(a.clientId);
          const cb = MANAGER.findClient(b.clientId);
          return ((ca?.firstName || '') + ' ' + (ca?.lastName || '')).toLowerCase().localeCompare(((cb?.firstName || '') + ' ' + (cb?.lastName || '')).toLowerCase()) * dir;
        }
      case 'tag':
        return (a.tag || '').localeCompare(b.tag || '') * dir;
      case 'balance':
        return ((a.balance || 0) * usdRate(a.currency) - (b.balance || 0) * usdRate(b.currency)) * dir;
      case 'equity':
        return ((a.equity || 0) * usdRate(a.currency) - (b.equity || 0) * usdRate(b.currency)) * dir;
      case 'margin':
        return ((a.margin || 0) * usdRate(a.currency) - (b.margin || 0) * usdRate(b.currency)) * dir;
      case 'lev':
        return ((a.leverage || 0) - (b.leverage || 0)) * dir;
      case 'group':
        return (a.group || '').localeCompare(b.group || '') * dir;
      default:
        return 0;
    }
  });
  const totalBalance = MANAGER.ACCOUNTS.reduce((s, a) => s + (a.balance || 0) * usdRate(a.currency), 0);
  const totalEquity = MANAGER.ACCOUNTS.reduce((s, a) => s + (a.equity || 0) * usdRate(a.currency), 0);
  const ordersCount = MANAGER.ACCOUNTS.filter(a => MANAGER.POSITIONS.some(p => p.accountId === a.id || p.clientId === a.clientId)).length;
  const NAVY = '#1B3955';
  const NAVY_HI = '#234A6E';
  function ViewTab({
    id,
    icon,
    label,
    count
  }) {
    const active = view === id;
    return /*#__PURE__*/React.createElement("button", {
      onClick: () => setView(id),
      style: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        padding: '5px 11px',
        background: active ? NAVY : 'transparent',
        color: active ? '#fff' : 'var(--text-2)',
        border: active ? '1px solid ' + NAVY : '1px solid var(--line-2)',
        cursor: 'pointer',
        fontSize: 11,
        fontWeight: active ? 700 : 500,
        letterSpacing: 0.3
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: 'Material Symbols Outlined',
        fontSize: 13
      }
    }, icon), label, count !== undefined && /*#__PURE__*/React.createElement("span", {
      style: {
        padding: '0 4px',
        fontSize: 9.5,
        fontWeight: 700,
        background: active ? 'rgba(255,255,255,0.18)' : 'var(--bg)',
        color: active ? '#fff' : 'var(--text-3)'
      }
    }, count));
  }
  function ServerChip({
    id,
    label,
    count
  }) {
    const active = serverFilter === id;
    return /*#__PURE__*/React.createElement("button", {
      onClick: () => setServerFilter(id),
      style: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '5px 10px',
        background: active ? '#EAF2FB' : 'transparent',
        color: active ? NAVY : 'var(--text-2)',
        border: active ? `1px solid ${NAVY}` : '1px solid var(--line-2)',
        cursor: 'pointer',
        fontSize: 11,
        fontWeight: active ? 700 : 500,
        letterSpacing: 0.3
      }
    }, label, " ", /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 9.5,
        color: active ? NAVY : 'var(--text-3)',
        fontWeight: 700
      }
    }, count));
  }

  // Single unified column layout — sort by clicking headers
  const cols = [{
    key: 'account',
    label: 'Account #',
    w: 130,
    align: 'center',
    sortable: true
  }, {
    key: 'created',
    label: 'Created',
    w: 160,
    align: 'center',
    sortable: true
  }, {
    key: 'client',
    label: 'Client',
    w: 220,
    align: 'left',
    sortable: true
  }, {
    key: 'tag',
    label: 'Server',
    w: 90,
    align: 'center',
    sortable: true
  }, {
    key: 'balance',
    label: 'Balance',
    w: 160,
    align: 'right',
    sortable: true
  }, {
    key: 'equity',
    label: 'Equity',
    w: 160,
    align: 'right',
    sortable: true
  }, {
    key: 'margin',
    label: 'Margin',
    w: 110,
    align: 'right',
    sortable: true
  }, {
    key: 'lev',
    label: 'Leverage',
    w: 90,
    align: 'right',
    sortable: true
  }, {
    key: 'group',
    label: 'Group',
    w: 90,
    align: 'center',
    sortable: true
  }, {
    key: 'actions',
    label: '',
    w: 70,
    align: 'right'
  }];
  const gridTemplate = cols.map(c => `${c.w}px`).join(' ');
  function Arrow({
    active,
    dir
  }) {
    if (!active) return /*#__PURE__*/React.createElement("svg", {
      width: "8",
      height: "10",
      viewBox: "0 0 24 24",
      fill: "rgba(255,255,255,0.35)",
      style: {
        marginLeft: 4
      }
    }, /*#__PURE__*/React.createElement("path", {
      d: "M7 9l5-5 5 5z M7 15l5 5 5-5z"
    }));
    return /*#__PURE__*/React.createElement("svg", {
      width: "9",
      height: "9",
      viewBox: "0 0 24 24",
      fill: "#5BB0FF",
      style: {
        marginLeft: 4
      }
    }, dir === 'asc' ? /*#__PURE__*/React.createElement("path", {
      d: "M7 14l5-5 5 5z"
    }) : /*#__PURE__*/React.createElement("path", {
      d: "M7 10l5 5 5-5z"
    }));
  }
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      flex: 1,
      minHeight: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      padding: '10px 14px',
      minHeight: 50,
      background: 'var(--surface)',
      borderBottom: '1px solid var(--line)',
      flexShrink: 0,
      flexWrap: 'wrap'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      lineHeight: 1.15,
      marginRight: 6
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 14,
      fontWeight: 800,
      color: 'var(--ink)',
      letterSpacing: 0.3
    }
  }, "Accounts"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 10,
      color: 'var(--text-3)',
      fontFamily: 'JetBrains Mono, monospace'
    }
  }, rows.length, " / ", MANAGER.ACCOUNTS.length, " \xB7 BAL $", MANAGER.fmt(totalBalance, 0), " \xB7 EQ $", MANAGER.fmt(totalEquity, 0))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 5,
      padding: '5px 9px',
      background: 'var(--bg)',
      border: '1px solid var(--line-2)',
      width: 220,
      height: 28
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'Material Symbols Outlined',
      fontSize: 14,
      color: 'var(--text-3)'
    }
  }, "search"), /*#__PURE__*/React.createElement("input", {
    value: search,
    onChange: e => setSearch(e.target.value),
    placeholder: "Search\u2026",
    style: {
      flex: 1,
      fontSize: 11,
      color: 'var(--ink)',
      background: 'transparent',
      outline: 'none',
      border: 'none'
    }
  })), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1
    }
  }), setQuotesOpen && /*#__PURE__*/React.createElement("button", {
    onClick: () => setQuotesOpen(!quotesOpen),
    title: quotesOpen ? 'Hide quotes panel' : 'Show quotes panel',
    style: {
      width: 28,
      height: 28,
      background: quotesOpen ? 'var(--acc-3)' : 'transparent',
      color: quotesOpen ? 'var(--acc-2)' : 'var(--text-2)',
      border: 'none',
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    },
    onMouseEnter: e => {
      if (!quotesOpen) e.currentTarget.style.background = 'var(--bg)';
    },
    onMouseLeave: e => {
      if (!quotesOpen) e.currentTarget.style.background = 'transparent';
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'Material Symbols Outlined',
      fontSize: 17
    }
  }, quotesOpen ? 'left_panel_close' : 'left_panel_open'))), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      overflowY: 'auto',
      background: 'var(--surface)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: gridTemplate,
      background: NAVY,
      color: 'rgba(255,255,255,0.92)',
      fontSize: 10,
      fontWeight: 700,
      letterSpacing: 0.6,
      textTransform: 'uppercase',
      fontFamily: 'JetBrains Mono, Roboto Mono, monospace',
      position: 'sticky',
      top: 0,
      zIndex: 5,
      borderTop: `1px solid ${NAVY_HI}`,
      borderBottom: '1px solid #0F1B2D',
      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06)'
    }
  }, cols.map(col => /*#__PURE__*/React.createElement("span", {
    key: col.key,
    onClick: col.sortable ? () => toggleSort(col.key) : undefined,
    style: {
      padding: '7px 8px',
      borderRight: '1px solid rgba(255,255,255,0.12)',
      cursor: col.sortable ? 'pointer' : 'default',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: col.align === 'right' ? 'flex-end' : col.align === 'left' ? 'flex-start' : 'center',
      background: sortKey === col.key ? 'rgba(91,176,255,0.10)' : 'transparent'
    }
  }, col.label, col.sortable && /*#__PURE__*/React.createElement(Arrow, {
    active: sortKey === col.key,
    dir: sortDir
  })))), rows.length === 0 ? /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '30px 16px',
      textAlign: 'center',
      color: 'var(--text-3)',
      fontSize: 12
    }
  }, "No accounts match the current filter.") : rows.map((a, i) => {
    const c = MANAGER.findClient(a.clientId);
    const positions = MANAGER.POSITIONS.filter(p => p.accountId === a.id || p.clientId === a.clientId);
    const open = expandedId === a.id;
    const isOrdersView = view === 'orders';
    const plSum = positions.reduce((s, p) => s + (p.pnl || 0), 0);
    return /*#__PURE__*/React.createElement(React.Fragment, {
      key: a.id
    }, /*#__PURE__*/React.createElement("div", {
      onClick: () => {
        if (isOrdersView) setExpandedId(open ? null : a.id);else if (c) setDetailId(c.id);
      },
      style: {
        display: 'grid',
        gridTemplateColumns: gridTemplate,
        fontSize: 11.5,
        borderBottom: '1px solid #E5E7EB',
        background: open ? '#EAF2FB' : i % 2 === 1 ? '#F7F9FC' : 'transparent',
        cursor: 'pointer'
      },
      onMouseEnter: e => {
        if (!open) e.currentTarget.style.background = '#F4F7FB';
      },
      onMouseLeave: e => {
        if (!open) e.currentTarget.style.background = i % 2 === 1 ? '#F7F9FC' : 'transparent';
      }
    }, isOrdersView && /*#__PURE__*/React.createElement("span", {
      style: {
        padding: '8px 8px',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center'
      }
    }, /*#__PURE__*/React.createElement("svg", {
      width: "11",
      height: "11",
      viewBox: "0 0 24 24",
      fill: "currentColor",
      style: {
        transform: open ? 'rotate(90deg)' : 'none',
        transition: 'transform .12s',
        color: 'var(--text-3)'
      }
    }, /*#__PURE__*/React.createElement("path", {
      d: "M9 6l6 6-6 6z"
    }))), /*#__PURE__*/React.createElement("span", {
      className: "mono",
      style: {
        padding: '8px 8px',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: 700,
        color: 'var(--ink)'
      }
    }, "#", a.accountNo || a.id.toUpperCase()), !isOrdersView && /*#__PURE__*/React.createElement("span", {
      className: "mono",
      style: {
        padding: '8px 8px',
        display: 'inline-flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 11,
        color: 'var(--text-2)',
        lineHeight: 1.2
      }
    }, (() => {
      const p = (a.created || '').split(' ');
      return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("span", null, p[0]), p[1] && /*#__PURE__*/React.createElement("span", {
        style: {
          fontSize: 9.5,
          color: 'var(--text-3)'
        }
      }, p[1]));
    })()), /*#__PURE__*/React.createElement("span", {
      style: {
        padding: '8px 10px',
        display: 'inline-flex',
        alignItems: 'center',
        color: 'var(--text-2)'
      }
    }, c ? /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("span", {
      style: {
        color: 'var(--ink)',
        fontWeight: 500
      }
    }, c.firstName, " ", c.lastName), c.online && /*#__PURE__*/React.createElement("span", {
      style: {
        marginLeft: 6,
        width: 7,
        height: 7,
        borderRadius: '50%',
        background: '#22C55E',
        boxShadow: '0 0 4px #22C55E'
      }
    })) : '—'), /*#__PURE__*/React.createElement("span", {
      style: {
        padding: '8px 8px',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center'
      }
    }, /*#__PURE__*/React.createElement(ServerTag, {
      tag: a.tag
    })), !isOrdersView && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("span", {
      className: "mono",
      style: {
        padding: '8px 8px',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'flex-end',
        color: 'var(--ink)',
        fontWeight: 600
      }
    }, a.currency, " ", MANAGER.fmt(a.balance, a.currency === 'JPY' ? 0 : 2)), /*#__PURE__*/React.createElement("span", {
      className: "mono",
      style: {
        padding: '8px 8px',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'flex-end',
        color: a.equity >= a.balance ? '#15A36C' : '#EF4444',
        fontWeight: 600
      }
    }, a.currency, " ", MANAGER.fmt(a.equity, a.currency === 'JPY' ? 0 : 2)), /*#__PURE__*/React.createElement("span", {
      className: "mono",
      style: {
        padding: '8px 8px',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'flex-end',
        color: 'var(--text-2)'
      }
    }, MANAGER.fmt(a.margin, 0)), /*#__PURE__*/React.createElement("span", {
      className: "mono",
      style: {
        padding: '8px 8px',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'flex-end',
        color: 'var(--text-2)'
      }
    }, "1:", a.leverage), /*#__PURE__*/React.createElement("span", {
      style: {
        padding: '8px 8px',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 11,
        fontWeight: 700,
        color: a.group === 'VIP' ? '#7C3AED' : a.group === 'Pro' ? '#0EA5E9' : 'var(--text-2)'
      }
    }, a.group)), isOrdersView && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("span", {
      className: "mono",
      style: {
        padding: '8px 8px',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'flex-end',
        color: 'var(--ink)',
        fontWeight: 600
      }
    }, a.currency, " ", MANAGER.fmt(a.equity, 2)), /*#__PURE__*/React.createElement("span", {
      style: {
        padding: '8px 8px',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'flex-end'
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        padding: '2px 8px',
        background: plSum >= 0 ? '#E8F5E9' : '#FFEBEE',
        color: plSum >= 0 ? '#15A36C' : '#EF4444',
        fontSize: 11,
        fontWeight: 700
      }
    }, positions.length, " \xB7 ", plSum >= 0 ? '+' : '', MANAGER.fmt(plSum, 0)))), /*#__PURE__*/React.createElement("span", {
      style: {
        padding: '6px 8px',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'flex-end'
      },
      onClick: e => e.stopPropagation()
    }, /*#__PURE__*/React.createElement("button", {
      onClick: () => setAdjustingId(a.id),
      title: "Adjust",
      style: {
        width: 22,
        height: 22,
        borderRadius: 3,
        border: '1px solid var(--line-2)',
        background: 'var(--bg)',
        cursor: 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--text-2)'
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: 'Material Symbols Outlined',
        fontSize: 13
      }
    }, "tune")))), isOrdersView && open && /*#__PURE__*/React.createElement("div", {
      style: {
        background: '#F0F4F9',
        borderBottom: '2px solid #1B3955',
        padding: '6px 12px 10px'
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'grid',
        gridTemplateColumns: '80px 70px 70px 100px 100px 100px 1fr',
        padding: '4px 4px',
        fontSize: 9.5,
        color: 'var(--text-3)',
        fontWeight: 700,
        letterSpacing: 0.4,
        textTransform: 'uppercase',
        borderBottom: '1px solid #D7DCE3'
      }
    }, /*#__PURE__*/React.createElement("span", null, "Symbol"), /*#__PURE__*/React.createElement("span", null, "Side"), /*#__PURE__*/React.createElement("span", {
      style: {
        textAlign: 'right'
      }
    }, "Lots"), /*#__PURE__*/React.createElement("span", {
      style: {
        textAlign: 'right'
      }
    }, "Open"), /*#__PURE__*/React.createElement("span", {
      style: {
        textAlign: 'right'
      }
    }, "Current"), /*#__PURE__*/React.createElement("span", {
      style: {
        textAlign: 'right'
      }
    }, "P/L"), /*#__PURE__*/React.createElement("span", null, "Opened")), positions.map(p => /*#__PURE__*/React.createElement("div", {
      key: p.id,
      style: {
        display: 'grid',
        gridTemplateColumns: '80px 70px 70px 100px 100px 100px 1fr',
        padding: '4px 4px',
        fontSize: 11,
        alignItems: 'center',
        borderBottom: '1px solid #E5E7EB'
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        color: 'var(--ink)',
        fontWeight: 600
      }
    }, p.symbol), /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement("span", {
      style: {
        padding: '1px 6px',
        fontSize: 9.5,
        fontWeight: 800,
        color: '#fff',
        background: p.side === 'buy' ? '#2E6FB0' : '#E04141',
        textTransform: 'uppercase'
      }
    }, p.side || 'BUY')), /*#__PURE__*/React.createElement("span", {
      className: "mono",
      style: {
        textAlign: 'right',
        color: 'var(--ink)'
      }
    }, p.volume || 1), /*#__PURE__*/React.createElement("span", {
      className: "mono",
      style: {
        textAlign: 'right',
        color: 'var(--text-2)'
      }
    }, p.openPrice), /*#__PURE__*/React.createElement("span", {
      className: "mono",
      style: {
        textAlign: 'right',
        color: 'var(--text-2)'
      }
    }, p.currentPrice || p.openPrice), /*#__PURE__*/React.createElement("span", {
      className: "mono",
      style: {
        textAlign: 'right',
        color: (p.pnl || 0) > 0 ? '#15A36C' : (p.pnl || 0) < 0 ? '#EF4444' : 'var(--text-2)',
        fontWeight: 700
      }
    }, (p.pnl || 0) >= 0 ? '+' : '', MANAGER.fmt(p.pnl || 0, 2)), /*#__PURE__*/React.createElement("span", {
      className: "mono",
      style: {
        color: 'var(--text-3)',
        fontSize: 10
      }
    }, p.openTime || '—'))), positions.length === 0 && /*#__PURE__*/React.createElement("div", {
      style: {
        padding: '8px',
        textAlign: 'center',
        color: 'var(--text-3)',
        fontSize: 11
      }
    }, "No open positions.")));
  })), adjustingId && /*#__PURE__*/React.createElement(BalanceAdjustModal, {
    accountId: adjustingId,
    onClose: () => {
      setAdjustingId(null);
      setRefreshTick(t => t + 1);
    }
  }), detailId && /*#__PURE__*/React.createElement(ClientDetailDrawer, {
    clientId: detailId,
    server: server,
    onClose: () => {
      setDetailId(null);
      setRefreshTick(t => t + 1);
    },
    onMutated: () => setRefreshTick(t => t + 1)
  }));
}
function ServerTag({
  tag
}) {
  const colors = {
    LIVE: ['#E8F5E9', '#1B5E20'],
    CRYPTO: ['#FFF3E0', '#E65100'],
    SPORTS: ['#F3E5F5', '#6A1B9A']
  };
  const [bg, fg] = colors[tag] || ['#ECEFF1', '#5A6478'];
  return /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 9.5,
      fontWeight: 800,
      padding: '2px 6px',
      background: bg,
      color: fg,
      justifySelf: 'flex-start',
      letterSpacing: 0.4,
      textTransform: 'uppercase'
    }
  }, tag);
}
function BalanceAdjustModal({
  accountId,
  onClose
}) {
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
  return /*#__PURE__*/React.createElement("div", {
    onClick: onClose,
    style: {
      position: 'fixed',
      inset: 0,
      background: 'rgba(15,23,41,0.6)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 200
    }
  }, /*#__PURE__*/React.createElement("div", {
    onClick: e => e.stopPropagation(),
    style: {
      background: 'var(--surface)',
      borderRadius: 12,
      padding: 24,
      width: 460,
      maxWidth: '92vw',
      boxShadow: 'var(--shadow-lg)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      marginBottom: 18
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'Material Symbols Outlined',
      fontSize: 24,
      color: 'var(--acc-2)'
    }
  }, "tune"), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 17,
      fontWeight: 700,
      color: 'var(--ink)'
    }
  }, "Adjust Balance"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11.5,
      color: 'var(--text-3)',
      marginTop: 2
    }
  }, client?.firstName, " ", client?.lastName, " \xB7 ", /*#__PURE__*/React.createElement("span", {
    className: "mono"
  }, acct.id.toUpperCase()), " \xB7 Current: ", acct.currency, " ", MANAGER.fmt(acct.balance))), /*#__PURE__*/React.createElement("button", {
    onClick: onClose,
    style: {
      width: 30,
      height: 30,
      borderRadius: 15,
      background: 'var(--bg-2)',
      border: 'none',
      cursor: 'pointer'
    }
  }, "\xD7")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 6,
      marginBottom: 14
    }
  }, [['credit', 'Credit (+)', '#22C55E'], ['debit', 'Debit (−)', '#EF4444'], ['correction', 'Correction', '#0EA5E9']].map(([k, l, col]) => /*#__PURE__*/React.createElement("button", {
    key: k,
    onClick: () => setType(k),
    style: {
      flex: 1,
      padding: '9px 0',
      borderRadius: 7,
      fontSize: 12,
      fontWeight: 700,
      background: type === k ? col : 'var(--bg)',
      color: type === k ? '#fff' : 'var(--text-2)',
      border: '1px solid ' + (type === k ? col : 'var(--line-2)'),
      cursor: 'pointer'
    }
  }, l))), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10,
      fontWeight: 700,
      color: 'var(--text-3)',
      letterSpacing: 0.5,
      marginBottom: 5
    }
  }, "AMOUNT"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'baseline',
      gap: 8,
      padding: '10px 14px',
      background: 'var(--bg)',
      borderRadius: 8,
      marginBottom: 14
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "mono",
    style: {
      fontSize: 14,
      fontWeight: 600,
      color: 'var(--text-3)'
    }
  }, acct.currency), /*#__PURE__*/React.createElement("input", {
    type: "number",
    value: amount,
    onChange: e => setAmount(e.target.value),
    placeholder: "0.00",
    className: "mono",
    style: {
      flex: 1,
      fontSize: 20,
      fontWeight: 700,
      color: 'var(--ink)',
      background: 'transparent',
      outline: 'none',
      border: 'none'
    }
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10,
      fontWeight: 700,
      color: 'var(--text-3)',
      letterSpacing: 0.5,
      marginBottom: 5
    }
  }, "REASON (REQUIRED)"), /*#__PURE__*/React.createElement("textarea", {
    value: reason,
    onChange: e => setReason(e.target.value),
    placeholder: "e.g. Welcome bonus, KYC promotion, manual correction\u2026",
    style: {
      width: '100%',
      padding: '10px 12px',
      borderRadius: 8,
      border: '1px solid var(--line-2)',
      background: 'var(--surface)',
      fontSize: 13,
      color: 'var(--ink)',
      minHeight: 64,
      outline: 'none',
      resize: 'vertical',
      fontFamily: 'inherit',
      marginBottom: 14
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      background: '#FFF3E0',
      borderRadius: 8,
      padding: '8px 12px',
      fontSize: 11.5,
      color: '#B45309',
      marginBottom: 14,
      display: 'flex',
      alignItems: 'flex-start',
      gap: 6
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'Material Symbols Outlined',
      fontSize: 15
    }
  }, "warning"), /*#__PURE__*/React.createElement("span", null, "This action is logged in the audit trail. Client will receive a notification.")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: onClose,
    style: {
      flex: 1,
      padding: '11px 0',
      borderRadius: 8,
      background: 'var(--bg-2)',
      color: 'var(--text-2)',
      fontSize: 13,
      fontWeight: 600,
      border: 'none',
      cursor: 'pointer'
    }
  }, "Cancel"), /*#__PURE__*/React.createElement("button", {
    onClick: submit,
    disabled: !amount || !reason,
    style: {
      flex: 1.4,
      padding: '11px 0',
      borderRadius: 8,
      background: !amount || !reason ? 'var(--muted)' : 'var(--acc)',
      color: '#fff',
      fontSize: 13,
      fontWeight: 700,
      border: 'none',
      cursor: !amount || !reason ? 'not-allowed' : 'pointer'
    }
  }, "Apply Adjustment"))));
}

// usdRate already declared earlier (in clients module)

const iconBtn = {
  width: 28,
  height: 28,
  borderRadius: 6,
  background: 'var(--bg)',
  border: '1px solid var(--line-2)',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: 'var(--text-2)',
  cursor: 'pointer'
};
Object.assign(window, {
  AccountsScreen,
  BalanceAdjustModal,
  iconBtn
});

// ─── manager-funding ─────────────────────────────────────
// ALPEXA Manager — Funding Operations (deposits/withdrawals queue)
function FundingScreen({
  server,
  quotesOpen,
  setQuotesOpen
}) {
  const [filter, setFilter] = useState('pending');
  const [reqs, setReqs] = useState(MANAGER.FUNDING_REQUESTS);
  const [sortKey, setSortKey] = useState('requested');
  const [sortDir, setSortDir] = useState('desc');
  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [adding, setAdding] = useState(false);
  function updateField(id, key, val) {
    let v = val;
    if (key === 'amount') v = parseFloat(val) || 0;
    setReqs(prev => prev.map(r => r.id === id ? {
      ...r,
      [key]: v
    } : r));
    const idx = MANAGER.FUNDING_REQUESTS.findIndex(r => r.id === id);
    if (idx >= 0) MANAGER.FUNDING_REQUESTS[idx] = {
      ...MANAGER.FUNDING_REQUESTS[idx],
      [key]: v
    };
    if (MANAGER.ADMIN_ACTIVITY) MANAGER.ADMIN_ACTIVITY.unshift({
      ts: new Date().toISOString().slice(0, 19).replace('T', ' '),
      admin: 'admin@alpexa.com',
      kind: 'funding_edit',
      target: id,
      detail: `${key} → ${v}`
    });
  }
  function deleteReq(id) {
    if (!confirm('Delete this funding request?')) return;
    setReqs(prev => prev.filter(r => r.id !== id));
    const idx = MANAGER.FUNDING_REQUESTS.findIndex(r => r.id === id);
    if (idx >= 0) MANAGER.FUNDING_REQUESTS.splice(idx, 1);
    if (MANAGER.ADMIN_ACTIVITY) MANAGER.ADMIN_ACTIVITY.unshift({
      ts: new Date().toISOString().slice(0, 19).replace('T', ' '),
      admin: 'admin@alpexa.com',
      kind: 'funding_delete',
      target: id,
      detail: 'Removed by admin'
    });
  }
  function toggleSort(k) {
    if (sortKey === k) setSortDir(d => d === 'asc' ? 'desc' : 'asc');else {
      setSortKey(k);
      setSortDir(k === 'amount' || k === 'requested' ? 'desc' : 'asc');
    }
  }
  function approve(id) {
    updateField(id, 'status', 'approved');
  }
  function reject(id) {
    updateField(id, 'status', 'rejected');
  }

  // Filter by selected server first (3 independent funding queues)
  let rows = reqs.filter(r => (r.server || 'FX') === server);
  rows = rows.filter(r => filter === 'all' || r.status === filter);
  if (search) {
    const q = search.toLowerCase();
    rows = rows.filter(r => {
      const c = MANAGER.findClient(r.clientId);
      return r.id.toLowerCase().includes(q) || r.accountId.toLowerCase().includes(q) || c && (c.firstName.toLowerCase().includes(q) || c.lastName.toLowerCase().includes(q));
    });
  }
  const dir = sortDir === 'asc' ? 1 : -1;
  rows = [...rows].sort((a, b) => {
    switch (sortKey) {
      case 'requested':
        return (a.requested || '').localeCompare(b.requested || '') * dir;
      case 'kind':
        return (a.kind || '').localeCompare(b.kind || '') * dir;
      case 'client':
        {
          const ca = MANAGER.findClient(a.clientId),
            cb = MANAGER.findClient(b.clientId);
          return ((ca?.firstName || '') + ca?.lastName).localeCompare((cb?.firstName || '') + cb?.lastName) * dir;
        }
      case 'amount':
        return ((a.amount || 0) * usdRate(a.currency) - (b.amount || 0) * usdRate(b.currency)) * dir;
      case 'method':
        return (a.method || '').localeCompare(b.method || '') * dir;
      case 'status':
        return (a.status || '').localeCompare(b.status || '') * dir;
      default:
        return 0;
    }
  });
  const pendingCount = reqs.filter(r => r.status === 'pending').length;
  const approvedCount = reqs.filter(r => r.status === 'approved').length;
  const rejectedCount = reqs.filter(r => r.status === 'rejected').length;
  const totalUsd = rows.reduce((s, r) => s + (r.amount || 0) * usdRate(r.currency), 0);
  const NAVY = '#1B3955',
    NAVY_HI = '#234A6E';
  function Chip({
    id,
    label,
    count,
    dot
  }) {
    const active = filter === id;
    return /*#__PURE__*/React.createElement("button", {
      onClick: () => setFilter(id),
      style: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        padding: '5px 10px',
        background: active ? '#EAF2FB' : 'transparent',
        color: active ? NAVY : 'var(--text-2)',
        border: active ? `1px solid ${NAVY}` : '1px solid var(--line-2)',
        cursor: 'pointer',
        fontSize: 11,
        fontWeight: active ? 700 : 500,
        letterSpacing: 0.3
      }
    }, dot && /*#__PURE__*/React.createElement("span", {
      style: {
        width: 6,
        height: 6,
        borderRadius: '50%',
        background: dot
      }
    }), label, " ", /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 9.5,
        color: active ? NAVY : 'var(--text-3)',
        fontWeight: 700
      }
    }, count));
  }
  function Arrow({
    a,
    d
  }) {
    if (!a) return /*#__PURE__*/React.createElement("svg", {
      width: "8",
      height: "10",
      viewBox: "0 0 24 24",
      fill: "rgba(255,255,255,0.35)",
      style: {
        marginLeft: 4
      }
    }, /*#__PURE__*/React.createElement("path", {
      d: "M7 9l5-5 5 5z M7 15l5 5 5-5z"
    }));
    return /*#__PURE__*/React.createElement("svg", {
      width: "9",
      height: "9",
      viewBox: "0 0 24 24",
      fill: "#5BB0FF",
      style: {
        marginLeft: 4
      }
    }, d === 'asc' ? /*#__PURE__*/React.createElement("path", {
      d: "M7 14l5-5 5 5z"
    }) : /*#__PURE__*/React.createElement("path", {
      d: "M7 10l5 5 5-5z"
    }));
  }
  const isCrypto = server === 'CRYPTO' || server === 'SPORTS'; // SPORTS routes through crypto gateway
  const cols = isCrypto ? [{
    k: 'requested',
    l: 'Time',
    w: 150,
    a: 'center',
    s: true
  }, {
    k: 'kind',
    l: 'Type',
    w: 110,
    a: 'center',
    s: true
  }, {
    k: 'client',
    l: 'Client',
    w: 240,
    a: 'left',
    s: true
  }, {
    k: 'asset',
    l: 'Asset',
    w: 140,
    a: 'center'
  }, {
    k: 'amount',
    l: 'Amount',
    w: 220,
    a: 'right',
    s: true
  }, {
    k: 'status',
    l: 'Status',
    w: 130,
    a: 'center',
    s: true
  }, {
    k: 'actions',
    l: 'Actions',
    w: 200,
    a: 'center'
  }] : [{
    k: 'requested',
    l: 'Time',
    w: 140,
    a: 'center',
    s: true
  }, {
    k: 'kind',
    l: 'Type',
    w: 100,
    a: 'center',
    s: true
  }, {
    k: 'client',
    l: 'Client',
    w: 220,
    a: 'left',
    s: true
  }, {
    k: 'account',
    l: 'Account #',
    w: 130,
    a: 'center'
  }, {
    k: 'amount',
    l: 'Amount',
    w: 160,
    a: 'right',
    s: true
  }, {
    k: 'method',
    l: 'Method',
    w: 120,
    a: 'center',
    s: true
  }, {
    k: 'reference',
    l: 'Reference',
    w: 160,
    a: 'left'
  }, {
    k: 'status',
    l: 'Status',
    w: 110,
    a: 'center',
    s: true
  }, {
    k: 'actions',
    l: '',
    w: 170,
    a: 'right'
  }];
  const grid = cols.map(c => `${c.w}px`).join(' ');
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      flex: 1,
      minHeight: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      padding: '10px 14px',
      minHeight: 50,
      background: 'var(--surface)',
      borderBottom: '1px solid var(--line)',
      flexShrink: 0,
      flexWrap: 'wrap'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      lineHeight: 1.15,
      marginRight: 6
    }
  }, (() => {
    const ic = server === 'CRYPTO' ? 'currency_bitcoin' : server === 'SPORTS' ? 'sports_soccer' : 'account_balance';
    const col = server === 'CRYPTO' ? '#E65100' : server === 'SPORTS' ? '#7C3AED' : '#1B5E20';
    return /*#__PURE__*/React.createElement("span", {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        fontSize: 14,
        fontWeight: 800,
        color: 'var(--ink)',
        letterSpacing: 0.3
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: 'Material Symbols Outlined',
        fontSize: 18,
        color: col
      }
    }, ic), "Funding \xB7 ", /*#__PURE__*/React.createElement("span", {
      style: {
        color: col
      }
    }, server));
  })(), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 10,
      color: 'var(--text-3)',
      fontFamily: 'JetBrains Mono, monospace'
    }
  }, rows.length, " requests on ", server, " \xB7 $", MANAGER.fmt(totalUsd, 0), " flow \xB7 Switch server in footer to see other queues")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 5,
      padding: '5px 9px',
      background: 'var(--bg)',
      border: '1px solid var(--line-2)',
      width: 220,
      height: 28
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'Material Symbols Outlined',
      fontSize: 14,
      color: 'var(--text-3)'
    }
  }, "search"), /*#__PURE__*/React.createElement("input", {
    value: search,
    onChange: e => setSearch(e.target.value),
    placeholder: "Search\u2026",
    style: {
      flex: 1,
      fontSize: 11,
      color: 'var(--ink)',
      background: 'transparent',
      outline: 'none',
      border: 'none'
    }
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 4
    }
  }, /*#__PURE__*/React.createElement(Chip, {
    id: "pending",
    label: "Pending",
    count: pendingCount,
    dot: "#F59E0B"
  }), /*#__PURE__*/React.createElement(Chip, {
    id: "approved",
    label: "Approved",
    count: approvedCount,
    dot: "#22C55E"
  }), /*#__PURE__*/React.createElement(Chip, {
    id: "rejected",
    label: "Rejected",
    count: rejectedCount,
    dot: "#EF4444"
  }), /*#__PURE__*/React.createElement(Chip, {
    id: "all",
    label: "All",
    count: reqs.length
  })), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1
    }
  }), /*#__PURE__*/React.createElement("button", {
    onClick: () => setAdding(true),
    style: {
      padding: '6px 12px',
      background: '#1B3955',
      border: 'none',
      color: '#fff',
      fontSize: 11,
      fontWeight: 700,
      cursor: 'pointer',
      display: 'inline-flex',
      alignItems: 'center',
      gap: 5,
      letterSpacing: 0.4
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'Material Symbols Outlined',
      fontSize: 14
    }
  }, "person_add"), "Add Manager")), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      overflowY: 'auto',
      background: 'var(--surface)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: grid,
      background: NAVY,
      color: 'rgba(255,255,255,0.92)',
      fontSize: 10,
      fontWeight: 700,
      letterSpacing: 0.6,
      textTransform: 'uppercase',
      fontFamily: 'JetBrains Mono, Roboto Mono, monospace',
      position: 'sticky',
      top: 0,
      zIndex: 5,
      borderTop: `1px solid ${NAVY_HI}`,
      borderBottom: '1px solid #0F1B2D'
    }
  }, cols.map(col => /*#__PURE__*/React.createElement("span", {
    key: col.k,
    onClick: col.s ? () => toggleSort(col.k) : undefined,
    style: {
      padding: '7px 8px',
      borderRight: '1px solid rgba(255,255,255,0.12)',
      cursor: col.s ? 'pointer' : 'default',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: col.a === 'right' ? 'flex-end' : col.a === 'left' ? 'flex-start' : 'center',
      background: sortKey === col.k ? 'rgba(91,176,255,0.10)' : 'transparent'
    }
  }, col.l, col.s && /*#__PURE__*/React.createElement(Arrow, {
    a: sortKey === col.k,
    d: sortDir
  })))), rows.length === 0 ? /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '40px 16px',
      textAlign: 'center',
      color: 'var(--text-3)',
      fontSize: 12
    }
  }, "No ", filter !== 'all' ? filter : '', " funding requests.") : rows.map((r, i) => {
    const c = MANAGER.findClient(r.clientId);
    const isDep = r.kind === 'deposit';
    return /*#__PURE__*/React.createElement("div", {
      key: r.id,
      style: {
        display: 'grid',
        gridTemplateColumns: grid,
        fontSize: 11.5,
        borderBottom: '1px solid #E5E7EB',
        background: editingId === r.id ? '#FEF3C7' : i % 2 === 1 ? '#F7F9FC' : 'transparent'
      },
      onMouseEnter: e => {
        if (editingId !== r.id) e.currentTarget.style.background = '#F4F7FB';
      },
      onMouseLeave: e => {
        if (editingId !== r.id) e.currentTarget.style.background = i % 2 === 1 ? '#F7F9FC' : 'transparent';
      }
    }, /*#__PURE__*/React.createElement("span", {
      className: "mono",
      style: {
        padding: '5px 8px',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--text-2)',
        fontSize: 10.5
      }
    }, editingId === r.id ? /*#__PURE__*/React.createElement("input", {
      defaultValue: r.requested,
      onBlur: e => updateField(r.id, 'requested', e.target.value),
      style: {
        width: 120,
        padding: '3px 6px',
        border: '1px solid var(--line-2)',
        fontSize: 10.5,
        fontFamily: 'JetBrains Mono, monospace',
        boxSizing: 'border-box'
      }
    }) : r.requested), /*#__PURE__*/React.createElement("span", {
      style: {
        padding: '5px 8px',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center'
      }
    }, editingId === r.id ? /*#__PURE__*/React.createElement("select", {
      defaultValue: r.kind,
      onBlur: e => updateField(r.id, 'kind', e.target.value),
      style: {
        padding: '3px 6px',
        border: '1px solid var(--line-2)',
        fontSize: 10.5
      }
    }, /*#__PURE__*/React.createElement("option", {
      value: "deposit"
    }, "deposit"), /*#__PURE__*/React.createElement("option", {
      value: "withdrawal"
    }, "withdrawal")) : /*#__PURE__*/React.createElement("span", {
      style: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: 3,
        padding: '2px 7px',
        fontSize: 9.5,
        fontWeight: 800,
        color: '#fff',
        background: isDep ? '#15803D' : '#B91C1C',
        textTransform: 'uppercase',
        letterSpacing: 0.4
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: 'Material Symbols Outlined',
        fontSize: 11
      }
    }, isDep ? 'south' : 'north'), r.kind)), /*#__PURE__*/React.createElement("span", {
      style: {
        padding: '8px 10px',
        display: 'inline-flex',
        alignItems: 'center',
        color: 'var(--text-2)'
      }
    }, c ? /*#__PURE__*/React.createElement("span", {
      style: {
        color: 'var(--ink)',
        fontWeight: 500
      }
    }, c.firstName, " ", c.lastName) : '—'), isCrypto ? /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("span", {
      style: {
        padding: '10px 12px',
        display: 'inline-flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        lineHeight: 1.3,
        gap: 3
      }
    }, editingId === r.id ? /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("select", {
      defaultValue: r.asset || 'USDT',
      onBlur: e => updateField(r.id, 'asset', e.target.value),
      style: {
        padding: '3px 6px',
        border: '1px solid var(--line-2)',
        fontSize: 10.5,
        fontFamily: 'JetBrains Mono, monospace'
      }
    }, /*#__PURE__*/React.createElement("option", null, "USDT")), /*#__PURE__*/React.createElement("select", {
      defaultValue: r.network || 'TRC-20',
      onBlur: e => updateField(r.id, 'network', e.target.value),
      style: {
        padding: '3px 6px',
        border: '1px solid var(--line-2)',
        fontSize: 10,
        fontFamily: 'JetBrains Mono, monospace',
        marginTop: 2
      }
    }, /*#__PURE__*/React.createElement("option", null, "ERC-20"))) : /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("span", {
      className: "mono",
      style: {
        fontSize: 11.5,
        fontWeight: 700,
        color: '#7C3AED'
      }
    }, r.asset || '—'), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 9,
        fontWeight: 700,
        color: 'var(--text-3)',
        fontFamily: 'JetBrains Mono, monospace'
      }
    }, r.network || '—'))), /*#__PURE__*/React.createElement("span", {
      className: "mono",
      style: {
        padding: '10px 16px',
        display: 'inline-flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
        justifyContent: 'center',
        lineHeight: 1.3,
        gap: 3
      }
    }, editingId === r.id ? /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("input", {
      type: "number",
      step: "0.0001",
      defaultValue: r.cryptoAmount,
      onBlur: e => updateField(r.id, 'cryptoAmount', e.target.value),
      style: {
        width: 130,
        padding: '3px 6px',
        border: '1px solid var(--line-2)',
        fontSize: 10.5,
        fontFamily: 'JetBrains Mono, monospace',
        textAlign: 'right'
      }
    }), /*#__PURE__*/React.createElement("input", {
      type: "number",
      step: "0.01",
      defaultValue: r.amount,
      onBlur: e => updateField(r.id, 'amount', e.target.value),
      style: {
        width: 130,
        padding: '3px 6px',
        border: '1px solid var(--line-2)',
        fontSize: 10.5,
        fontFamily: 'JetBrains Mono, monospace',
        textAlign: 'right',
        marginTop: 2
      }
    })) : /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 11.5,
        fontWeight: 700,
        color: isDep ? '#15803D' : '#B91C1C'
      }
    }, isDep ? '+' : '−', r.asset === 'BTC' ? (r.cryptoAmount || 0).toFixed(4) : r.asset === 'ETH' ? (r.cryptoAmount || 0).toFixed(3) : MANAGER.fmt(r.cryptoAmount || 0, 2), " ", r.asset), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 9.5,
        color: 'var(--text-3)'
      }
    }, "\u2248 $", MANAGER.fmt(r.amount, 2))))) : /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("span", {
      className: "mono",
      style: {
        padding: '5px 8px',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--text-2)'
      }
    }, editingId === r.id ? /*#__PURE__*/React.createElement("input", {
      defaultValue: r.accountId,
      onBlur: e => updateField(r.id, 'accountId', e.target.value),
      style: {
        width: 80,
        padding: '3px 6px',
        border: '1px solid var(--line-2)',
        fontSize: 10.5,
        fontFamily: 'JetBrains Mono, monospace'
      }
    }) : `#${r.accountId.toUpperCase()}`), /*#__PURE__*/React.createElement("span", {
      className: "mono",
      style: {
        padding: '5px 8px',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'flex-end',
        color: isDep ? '#15803D' : '#B91C1C',
        fontWeight: 700,
        gap: 4
      }
    }, editingId === r.id ? /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("input", {
      defaultValue: r.currency,
      onBlur: e => updateField(r.id, 'currency', e.target.value.toUpperCase().slice(0, 3)),
      style: {
        width: 42,
        padding: '3px 6px',
        border: '1px solid var(--line-2)',
        fontSize: 10.5,
        fontFamily: 'JetBrains Mono, monospace'
      }
    }), /*#__PURE__*/React.createElement("input", {
      type: "number",
      step: "0.01",
      defaultValue: r.amount,
      onBlur: e => updateField(r.id, 'amount', e.target.value),
      style: {
        width: 80,
        padding: '3px 6px',
        border: '1px solid var(--line-2)',
        fontSize: 10.5,
        fontFamily: 'JetBrains Mono, monospace',
        textAlign: 'right'
      }
    })) : `${isDep ? '+' : '−'}${r.currency} ${MANAGER.fmt(r.amount, r.currency === 'JPY' ? 0 : 2)}`), /*#__PURE__*/React.createElement("span", {
      style: {
        padding: '5px 8px',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--text-2)',
        fontSize: 11,
        fontWeight: 600
      }
    }, editingId === r.id ? /*#__PURE__*/React.createElement("select", {
      defaultValue: r.method,
      onBlur: e => updateField(r.id, 'method', e.target.value),
      style: {
        padding: '3px 6px',
        border: '1px solid var(--line-2)',
        fontSize: 10.5
      }
    }, server === 'FX' ? /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("option", null, "SEPA"), /*#__PURE__*/React.createElement("option", null, "SWIFT"), /*#__PURE__*/React.createElement("option", null, "CARD")) : /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("option", null, "CARD"), /*#__PURE__*/React.createElement("option", null, "SEPA"), /*#__PURE__*/React.createElement("option", null, "SKRILL"), /*#__PURE__*/React.createElement("option", null, "PAYPAL"))) : /*#__PURE__*/React.createElement("span", {
      style: {
        padding: '2px 7px',
        fontSize: 9.5,
        fontWeight: 800,
        background: '#EAF2FB',
        color: '#1B3955',
        letterSpacing: 0.4
      }
    }, r.method)), /*#__PURE__*/React.createElement("span", {
      className: "mono",
      style: {
        padding: '5px 8px',
        display: 'inline-flex',
        alignItems: 'center',
        fontSize: 10,
        color: 'var(--text-3)',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis'
      }
    }, r.bankRef ? r.bankRef : r.cardLast4 ? `•••• ${r.cardLast4}` : '—')), /*#__PURE__*/React.createElement("span", {
      style: {
        padding: '5px 8px',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center'
      }
    }, editingId === r.id ? /*#__PURE__*/React.createElement("select", {
      defaultValue: r.status,
      onBlur: e => updateField(r.id, 'status', e.target.value),
      style: {
        padding: '3px 6px',
        border: '1px solid var(--line-2)',
        fontSize: 10.5
      }
    }, /*#__PURE__*/React.createElement("option", null, "pending"), /*#__PURE__*/React.createElement("option", null, "approved"), /*#__PURE__*/React.createElement("option", null, "rejected")) : /*#__PURE__*/React.createElement(FundingStatusBadge, {
      state: r.status
    })), /*#__PURE__*/React.createElement("span", {
      style: {
        padding: '8px 14px',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6
      }
    }, /*#__PURE__*/React.createElement("button", {
      onClick: () => setEditingId(editingId === r.id ? null : r.id),
      title: editingId === r.id ? 'Done' : 'Edit',
      style: {
        width: 24,
        height: 24,
        padding: 0,
        background: editingId === r.id ? '#22C55E' : 'var(--bg)',
        color: editingId === r.id ? '#fff' : 'var(--text-2)',
        border: '1px solid var(--line-2)',
        cursor: 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center'
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: 'Material Symbols Outlined',
        fontSize: 13
      }
    }, editingId === r.id ? 'check' : 'edit')), r.status === 'pending' && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("button", {
      onClick: () => reject(r.id),
      title: "Reject",
      style: {
        padding: '5px 12px',
        background: '#FFEBEE',
        color: '#C62828',
        border: '1px solid #FECACA',
        fontSize: 10.5,
        fontWeight: 700,
        cursor: 'pointer',
        borderRadius: 3
      }
    }, "Reject"), /*#__PURE__*/React.createElement("button", {
      onClick: () => approve(r.id),
      title: "Approve",
      style: {
        padding: '5px 14px',
        background: '#15803D',
        color: '#fff',
        border: 'none',
        fontSize: 10.5,
        fontWeight: 700,
        cursor: 'pointer',
        borderRadius: 3
      }
    }, "Approve")), /*#__PURE__*/React.createElement("button", {
      onClick: () => deleteReq(r.id),
      title: "Delete",
      style: {
        width: 24,
        height: 24,
        padding: 0,
        background: '#FFEBEE',
        color: '#C62828',
        border: '1px solid #FECACA',
        cursor: 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center'
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: 'Material Symbols Outlined',
        fontSize: 13
      }
    }, "delete"))));
  })));
}
function FundingStatusBadge({
  state
}) {
  const styles = {
    pending: {
      bg: '#FFF3E0',
      col: '#E65100',
      label: 'Pending'
    },
    approved: {
      bg: '#E8F5E9',
      col: '#1B5E20',
      label: 'Approved'
    },
    rejected: {
      bg: '#FFEBEE',
      col: '#C62828',
      label: 'Rejected'
    }
  };
  const s = styles[state];
  return /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 9.5,
      fontWeight: 800,
      padding: '2px 6px',
      borderRadius: 3,
      letterSpacing: 0.4,
      background: s.bg,
      color: s.col,
      marginLeft: 'auto'
    }
  }, s.label.toUpperCase());
}
Object.assign(window, {
  FundingScreen
});

// ─── manager-trading ─────────────────────────────────────
// ALPEXA Manager — Trading Monitor (real-time positions / exposure)
function TradingMonitorScreen({
  quotesOpen,
  setQuotesOpen
}) {
  const [filter, setFilter] = useState('all');
  const [sortKey, setSortKey] = useState('pnl');
  const [sortDir, setSortDir] = useState('desc');
  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [refreshTick, setRefreshTick] = useState(0);
  function updatePos(id, key, val) {
    const idx = MANAGER.POSITIONS.findIndex(p => p.id === id);
    if (idx < 0) return;
    let v = val;
    if (['vol', 'open', 'current', 'pnl'].includes(key)) v = parseFloat(val) || 0;
    MANAGER.POSITIONS[idx] = {
      ...MANAGER.POSITIONS[idx],
      [key]: v
    };
    if (MANAGER.ADMIN_ACTIVITY) MANAGER.ADMIN_ACTIVITY.unshift({
      ts: new Date().toISOString().slice(0, 19).replace('T', ' '),
      admin: 'admin@alpexa.com',
      kind: 'position_edit',
      target: id,
      detail: `${key} → ${v}`
    });
    setRefreshTick(t => t + 1);
  }
  function closePosition(id) {
    if (!confirm('Force-close this position?')) return;
    const idx = MANAGER.POSITIONS.findIndex(p => p.id === id);
    if (idx >= 0) MANAGER.POSITIONS.splice(idx, 1);
    if (MANAGER.ADMIN_ACTIVITY) MANAGER.ADMIN_ACTIVITY.unshift({
      ts: new Date().toISOString().slice(0, 19).replace('T', ' '),
      admin: 'admin@alpexa.com',
      kind: 'position_close',
      target: id,
      detail: 'Force-closed by admin'
    });
    setRefreshTick(t => t + 1);
  }
  const positions = MANAGER.POSITIONS;
  function toggleSort(k) {
    if (sortKey === k) setSortDir(d => d === 'asc' ? 'desc' : 'asc');else {
      setSortKey(k);
      setSortDir(['vol', 'open', 'current', 'pnl', 'opened'].includes(k) ? 'desc' : 'asc');
    }
  }
  const totalPnl = positions.reduce((s, p) => s + (p.pnl || 0), 0);
  const winners = positions.filter(p => p.pnl >= 0).length;
  const losers = positions.filter(p => p.pnl < 0).length;
  let rows = filter === 'all' ? positions : filter === 'winners' ? positions.filter(p => p.pnl >= 0) : positions.filter(p => p.pnl < 0);
  if (search) {
    const q = search.toLowerCase();
    rows = rows.filter(p => {
      const c = MANAGER.findClient(p.clientId);
      return p.sym.toLowerCase().includes(q) || c && (c.firstName.toLowerCase().includes(q) || c.lastName.toLowerCase().includes(q));
    });
  }
  const dir = sortDir === 'asc' ? 1 : -1;
  rows = [...rows].sort((a, b) => {
    switch (sortKey) {
      case 'client':
        {
          const ca = MANAGER.findClient(a.clientId),
            cb = MANAGER.findClient(b.clientId);
          return ((ca?.firstName || '') + ca?.lastName).localeCompare((cb?.firstName || '') + cb?.lastName) * dir;
        }
      case 'symbol':
        return (a.sym || '').localeCompare(b.sym || '') * dir;
      case 'side':
        return (a.side || '').localeCompare(b.side || '') * dir;
      case 'vol':
        return ((a.vol || 0) - (b.vol || 0)) * dir;
      case 'open':
        return ((a.open || 0) - (b.open || 0)) * dir;
      case 'current':
        return ((a.current || 0) - (b.current || 0)) * dir;
      case 'pnl':
        return ((a.pnl || 0) - (b.pnl || 0)) * dir;
      case 'opened':
        return (a.opened || '').localeCompare(b.opened || '') * dir;
      default:
        return 0;
    }
  });
  const NAVY = '#1B3955',
    NAVY_HI = '#234A6E';
  function Chip({
    id,
    label,
    count,
    dot
  }) {
    const active = filter === id;
    return /*#__PURE__*/React.createElement("button", {
      onClick: () => setFilter(id),
      style: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        padding: '5px 10px',
        background: active ? '#EAF2FB' : 'transparent',
        color: active ? NAVY : 'var(--text-2)',
        border: active ? `1px solid ${NAVY}` : '1px solid var(--line-2)',
        cursor: 'pointer',
        fontSize: 11,
        fontWeight: active ? 700 : 500,
        letterSpacing: 0.3
      }
    }, dot && /*#__PURE__*/React.createElement("span", {
      style: {
        width: 6,
        height: 6,
        borderRadius: '50%',
        background: dot
      }
    }), label, " ", /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 9.5,
        color: active ? NAVY : 'var(--text-3)',
        fontWeight: 700
      }
    }, count));
  }
  function Arrow({
    a,
    d
  }) {
    if (!a) return /*#__PURE__*/React.createElement("svg", {
      width: "8",
      height: "10",
      viewBox: "0 0 24 24",
      fill: "rgba(255,255,255,0.35)",
      style: {
        marginLeft: 4
      }
    }, /*#__PURE__*/React.createElement("path", {
      d: "M7 9l5-5 5 5z M7 15l5 5 5-5z"
    }));
    return /*#__PURE__*/React.createElement("svg", {
      width: "9",
      height: "9",
      viewBox: "0 0 24 24",
      fill: "#5BB0FF",
      style: {
        marginLeft: 4
      }
    }, d === 'asc' ? /*#__PURE__*/React.createElement("path", {
      d: "M7 14l5-5 5 5z"
    }) : /*#__PURE__*/React.createElement("path", {
      d: "M7 10l5 5 5-5z"
    }));
  }
  const cols = [{
    k: 'client',
    l: 'Client',
    w: 200,
    a: 'left',
    s: true
  }, {
    k: 'symbol',
    l: 'Symbol',
    w: 80,
    a: 'center',
    s: true
  }, {
    k: 'side',
    l: 'Side',
    w: 60,
    a: 'center',
    s: true
  }, {
    k: 'vol',
    l: 'Vol',
    w: 70,
    a: 'right',
    s: true
  }, {
    k: 'open',
    l: 'Open',
    w: 100,
    a: 'right',
    s: true
  }, {
    k: 'current',
    l: 'Current',
    w: 100,
    a: 'right',
    s: true
  }, {
    k: 'pnl',
    l: 'P/L (USD)',
    w: 130,
    a: 'right',
    s: true
  }, {
    k: 'opened',
    l: 'Opened',
    w: 130,
    a: 'center',
    s: true
  }, {
    k: 'actions',
    l: '',
    w: 80,
    a: 'right'
  }];
  const grid = cols.map(c => `${c.w}px`).join(' ');
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      flex: 1,
      minHeight: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      padding: '10px 14px',
      minHeight: 50,
      background: 'var(--surface)',
      borderBottom: '1px solid var(--line)',
      flexShrink: 0,
      flexWrap: 'wrap'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      lineHeight: 1.15,
      marginRight: 6
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 14,
      fontWeight: 800,
      color: 'var(--ink)',
      letterSpacing: 0.3
    }
  }, "Trading Monitor"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 10,
      color: 'var(--text-3)',
      fontFamily: 'JetBrains Mono, monospace'
    }
  }, positions.length, " pos \xB7 NET ", totalPnl >= 0 ? '+' : '', "$", MANAGER.fmt(totalPnl, 0), " \xB7 W ", winners, " / L ", losers)), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 5,
      padding: '5px 9px',
      background: 'var(--bg)',
      border: '1px solid var(--line-2)',
      width: 200,
      height: 28
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'Material Symbols Outlined',
      fontSize: 14,
      color: 'var(--text-3)'
    }
  }, "search"), /*#__PURE__*/React.createElement("input", {
    value: search,
    onChange: e => setSearch(e.target.value),
    placeholder: "Symbol or client\u2026",
    style: {
      flex: 1,
      fontSize: 11,
      color: 'var(--ink)',
      background: 'transparent',
      outline: 'none',
      border: 'none'
    }
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 4
    }
  }, /*#__PURE__*/React.createElement(Chip, {
    id: "all",
    label: "All",
    count: positions.length
  }), /*#__PURE__*/React.createElement(Chip, {
    id: "winners",
    label: "Winners",
    count: winners,
    dot: "#22C55E"
  }), /*#__PURE__*/React.createElement(Chip, {
    id: "losers",
    label: "Losers",
    count: losers,
    dot: "#EF4444"
  })), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1
    }
  }), /*#__PURE__*/React.createElement("button", {
    onClick: () => setAdding(true),
    style: {
      padding: '6px 12px',
      background: '#1B3955',
      border: 'none',
      color: '#fff',
      fontSize: 11,
      fontWeight: 700,
      cursor: 'pointer',
      display: 'inline-flex',
      alignItems: 'center',
      gap: 5,
      letterSpacing: 0.4
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'Material Symbols Outlined',
      fontSize: 14
    }
  }, "person_add"), "Add Manager")), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      overflowY: 'auto',
      background: 'var(--surface)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: grid,
      background: NAVY,
      color: 'rgba(255,255,255,0.92)',
      fontSize: 10,
      fontWeight: 700,
      letterSpacing: 0.6,
      textTransform: 'uppercase',
      fontFamily: 'JetBrains Mono, Roboto Mono, monospace',
      position: 'sticky',
      top: 0,
      zIndex: 5,
      borderTop: `1px solid ${NAVY_HI}`,
      borderBottom: '1px solid #0F1B2D'
    }
  }, cols.map(col => /*#__PURE__*/React.createElement("span", {
    key: col.k,
    onClick: col.s ? () => toggleSort(col.k) : undefined,
    style: {
      padding: '7px 8px',
      borderRight: '1px solid rgba(255,255,255,0.12)',
      cursor: col.s ? 'pointer' : 'default',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: col.a === 'right' ? 'flex-end' : col.a === 'left' ? 'flex-start' : 'center',
      background: sortKey === col.k ? 'rgba(91,176,255,0.10)' : 'transparent'
    }
  }, col.l, col.s && /*#__PURE__*/React.createElement(Arrow, {
    a: sortKey === col.k,
    d: sortDir
  })))), rows.length === 0 ? /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '40px 16px',
      textAlign: 'center',
      color: 'var(--text-3)',
      fontSize: 12
    }
  }, "No matching positions.") : rows.map((p, i) => {
    const c = MANAGER.findClient(p.clientId);
    const isBuy = (p.side || '').toUpperCase() === 'BUY';
    const editing = editingId === p.id;
    return /*#__PURE__*/React.createElement("div", {
      key: p.id,
      style: {
        display: 'grid',
        gridTemplateColumns: grid,
        fontSize: 11.5,
        borderBottom: '1px solid #E5E7EB',
        background: editing ? '#FEF3C7' : i % 2 === 1 ? '#F7F9FC' : 'transparent'
      },
      onMouseEnter: e => {
        if (!editing) e.currentTarget.style.background = '#F4F7FB';
      },
      onMouseLeave: e => {
        if (!editing) e.currentTarget.style.background = i % 2 === 1 ? '#F7F9FC' : 'transparent';
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        padding: '7px 10px',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        color: 'var(--text-2)'
      }
    }, c ? /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("span", {
      style: {
        color: 'var(--ink)',
        fontWeight: 500
      }
    }, c.firstName, " ", c.lastName), c.online && /*#__PURE__*/React.createElement("span", {
      style: {
        width: 7,
        height: 7,
        borderRadius: '50%',
        background: '#22C55E',
        boxShadow: '0 0 4px #22C55E'
      }
    })) : '—'), /*#__PURE__*/React.createElement("span", {
      style: {
        padding: '5px 8px',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--ink)',
        fontWeight: 600
      }
    }, editing ? /*#__PURE__*/React.createElement("input", {
      defaultValue: p.sym,
      onBlur: e => updatePos(p.id, 'sym', e.target.value.toUpperCase()),
      style: {
        width: 64,
        padding: '3px 4px',
        border: '1px solid var(--line-2)',
        fontSize: 11,
        textAlign: 'center',
        fontFamily: 'inherit',
        fontWeight: 600
      }
    }) : p.sym), /*#__PURE__*/React.createElement("span", {
      style: {
        padding: '5px 8px',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center'
      }
    }, editing ? /*#__PURE__*/React.createElement("select", {
      defaultValue: p.side,
      onBlur: e => updatePos(p.id, 'side', e.target.value),
      style: {
        padding: '3px 6px',
        border: '1px solid var(--line-2)',
        fontSize: 10.5
      }
    }, /*#__PURE__*/React.createElement("option", null, "BUY"), /*#__PURE__*/React.createElement("option", null, "SELL")) : /*#__PURE__*/React.createElement("span", {
      style: {
        padding: '1px 7px',
        fontSize: 9.5,
        fontWeight: 800,
        color: '#fff',
        background: isBuy ? '#2E6FB0' : '#E04141',
        textTransform: 'uppercase',
        letterSpacing: 0.4
      }
    }, p.side)), ['vol', 'open', 'current', 'pnl'].map(k => /*#__PURE__*/React.createElement("span", {
      key: k,
      style: {
        padding: '5px 8px',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'flex-end'
      }
    }, editing ? /*#__PURE__*/React.createElement("input", {
      type: "number",
      step: k === 'vol' ? 0.01 : k === 'pnl' ? 1 : 0.0001,
      defaultValue: p[k],
      onBlur: e => updatePos(p.id, k, e.target.value),
      style: {
        width: 80,
        padding: '3px 6px',
        border: '1px solid var(--line-2)',
        fontSize: 11,
        color: 'var(--ink)',
        fontFamily: 'JetBrains Mono, monospace',
        textAlign: 'right'
      }
    }) : /*#__PURE__*/React.createElement("span", {
      className: "mono",
      style: {
        color: k === 'pnl' ? p.pnl >= 0 ? '#15A36C' : '#EF4444' : k === 'current' ? 'var(--ink)' : 'var(--text-2)',
        fontWeight: k === 'pnl' || k === 'current' ? 700 : 500
      }
    }, k === 'pnl' ? `${p.pnl >= 0 ? '+' : ''}$${MANAGER.fmt(p.pnl)}` : p[k]))), /*#__PURE__*/React.createElement("span", {
      style: {
        padding: '5px 8px',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center'
      }
    }, editing ? /*#__PURE__*/React.createElement("input", {
      defaultValue: p.opened,
      onBlur: e => updatePos(p.id, 'opened', e.target.value),
      style: {
        width: 130,
        padding: '3px 6px',
        border: '1px solid var(--line-2)',
        fontSize: 10.5,
        fontFamily: 'JetBrains Mono, monospace',
        textAlign: 'center'
      }
    }) : /*#__PURE__*/React.createElement("span", {
      className: "mono",
      style: {
        color: 'var(--text-3)',
        fontSize: 10.5
      }
    }, p.opened)), /*#__PURE__*/React.createElement("span", {
      style: {
        padding: '4px 8px',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'flex-end',
        gap: 4
      }
    }, /*#__PURE__*/React.createElement("button", {
      onClick: () => setEditingId(editing ? null : p.id),
      title: editing ? 'Done' : 'Edit',
      style: {
        width: 22,
        height: 22,
        padding: 0,
        background: editing ? '#22C55E' : 'var(--bg)',
        color: editing ? '#fff' : 'var(--text-2)',
        border: '1px solid var(--line-2)',
        cursor: 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center'
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: 'Material Symbols Outlined',
        fontSize: 13
      }
    }, editing ? 'check' : 'edit')), /*#__PURE__*/React.createElement("button", {
      onClick: () => closePosition(p.id),
      title: "Force close",
      style: {
        width: 22,
        height: 22,
        padding: 0,
        background: '#FFEBEE',
        color: '#C62828',
        border: '1px solid #FECACA',
        cursor: 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center'
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: 'Material Symbols Outlined',
        fontSize: 13
      }
    }, "close"))));
  })));
}
function KpiCard({
  label,
  value,
  color
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      background: 'var(--surface)',
      border: '1px solid var(--line)',
      borderRadius: 10,
      padding: '14px 16px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10,
      fontWeight: 700,
      color: 'var(--text-3)',
      letterSpacing: 0.6,
      textTransform: 'uppercase'
    }
  }, label), /*#__PURE__*/React.createElement("div", {
    className: "mono",
    style: {
      fontSize: 22,
      fontWeight: 700,
      color: color || 'var(--ink)',
      marginTop: 5,
      letterSpacing: -0.3
    }
  }, value));
}
Object.assign(window, {
  TradingMonitorScreen,
  KpiCard
});

// ─── manager-reports ─────────────────────────────────────
// ALPEXA Manager — Reports (P&L, client stats, audit log)
function ReportsScreen({
  quotesOpen,
  setQuotesOpen
}) {
  const [view, setView] = useState('daily'); // daily | positions | activity
  const [symFilter, setSymFilter] = useState('all');
  const [sideFilter, setSideFilter] = useState('all');
  const [timeRange, setTimeRange] = useState('all'); // today | week | month | all
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState('opened');
  const [sortDir, setSortDir] = useState('desc');
  const [editingId, setEditingId] = useState(null);
  const [editingActivity, setEditingActivity] = useState(null);
  const [refreshTick, setRefreshTick] = useState(0);
  function updateActivity(i, key, val) {
    if (!MANAGER.ADMIN_ACTIVITY[i]) return;
    MANAGER.ADMIN_ACTIVITY[i] = {
      ...MANAGER.ADMIN_ACTIVITY[i],
      [key]: val
    };
    setRefreshTick(t => t + 1);
  }
  function deleteActivity(i) {
    if (!confirm('Delete this activity entry?')) return;
    MANAGER.ADMIN_ACTIVITY.splice(i, 1);
    setRefreshTick(t => t + 1);
  }
  function addActivity() {
    MANAGER.ADMIN_ACTIVITY.unshift({
      ts: new Date().toISOString().slice(0, 19).replace('T', ' '),
      admin: 'admin@alpexa.com',
      kind: 'manual',
      target: '',
      detail: 'Manual entry'
    });
    setRefreshTick(t => t + 1);
    setEditingActivity(0);
  }
  function toggleSort(k) {
    if (sortKey === k) setSortDir(d => d === 'asc' ? 'desc' : 'asc');else {
      setSortKey(k);
      setSortDir(['vol', 'open', 'current', 'pnl', 'opened'].includes(k) ? 'desc' : 'asc');
    }
  }
  function updatePos(id, key, val) {
    const idx = MANAGER.POSITIONS.findIndex(p => p.id === id);
    if (idx < 0) return;
    let v = val;
    if (key === 'vol' || key === 'open' || key === 'current' || key === 'pnl') v = parseFloat(val) || 0;
    MANAGER.POSITIONS[idx] = {
      ...MANAGER.POSITIONS[idx],
      [key]: v
    };
    if (MANAGER.ADMIN_ACTIVITY) MANAGER.ADMIN_ACTIVITY.unshift({
      ts: new Date().toISOString().slice(0, 19).replace('T', ' '),
      admin: 'admin@alpexa.com',
      kind: 'position_edit',
      target: id,
      detail: `${key} → ${v}`
    });
    setRefreshTick(t => t + 1);
  }
  function closePosition(id) {
    if (!confirm('Force-close this position?')) return;
    const idx = MANAGER.POSITIONS.findIndex(p => p.id === id);
    if (idx >= 0) MANAGER.POSITIONS.splice(idx, 1);
    if (MANAGER.ADMIN_ACTIVITY) MANAGER.ADMIN_ACTIVITY.unshift({
      ts: new Date().toISOString().slice(0, 19).replace('T', ' '),
      admin: 'admin@alpexa.com',
      kind: 'position_close',
      target: id,
      detail: `Force-closed by admin`
    });
    setRefreshTick(t => t + 1);
  }

  // Apply filters
  const today = new Date().toISOString().slice(0, 10);
  let positions = MANAGER.POSITIONS;
  if (symFilter !== 'all') positions = positions.filter(p => p.sym === symFilter);
  if (sideFilter !== 'all') positions = positions.filter(p => (p.side || '').toUpperCase() === sideFilter);
  if (timeRange !== 'all') {
    const cutoff = new Date();
    if (timeRange === 'today') cutoff.setHours(0, 0, 0, 0);else if (timeRange === 'week') cutoff.setDate(cutoff.getDate() - 7);else if (timeRange === 'month') cutoff.setDate(cutoff.getDate() - 30);
    const cutStr = cutoff.toISOString().slice(0, 16).replace('T', ' ');
    positions = positions.filter(p => (p.opened || '') >= cutStr);
  }
  if (search) {
    const q = search.toLowerCase();
    positions = positions.filter(p => {
      const c = MANAGER.findClient(p.clientId);
      return p.sym.toLowerCase().includes(q) || p.id.toLowerCase().includes(q) || c && (c.firstName.toLowerCase().includes(q) || c.lastName.toLowerCase().includes(q));
    });
  }
  const dir = sortDir === 'asc' ? 1 : -1;
  positions = [...positions].sort((a, b) => {
    switch (sortKey) {
      case 'id':
        return (a.id || '').localeCompare(b.id || '') * dir;
      case 'client':
        {
          const ca = MANAGER.findClient(a.clientId),
            cb = MANAGER.findClient(b.clientId);
          return ((ca?.firstName || '') + ca?.lastName).localeCompare((cb?.firstName || '') + cb?.lastName) * dir;
        }
      case 'symbol':
        return (a.sym || '').localeCompare(b.sym || '') * dir;
      case 'side':
        return (a.side || '').localeCompare(b.side || '') * dir;
      case 'vol':
        return ((a.vol || 0) - (b.vol || 0)) * dir;
      case 'open':
        return ((a.open || 0) - (b.open || 0)) * dir;
      case 'current':
        return ((a.current || 0) - (b.current || 0)) * dir;
      case 'pnl':
        return ((a.pnl || 0) - (b.pnl || 0)) * dir;
      case 'opened':
        return (a.opened || '').localeCompare(b.opened || '') * dir;
      default:
        return 0;
    }
  });

  // Aggregate by symbol for By Symbol view
  const bySymbol = {};
  positions.forEach(p => {
    if (!bySymbol[p.sym]) bySymbol[p.sym] = {
      sym: p.sym,
      count: 0,
      volume: 0,
      pnl: 0,
      longs: 0,
      shorts: 0,
      clients: new Set()
    };
    const s = bySymbol[p.sym];
    s.count += 1;
    s.volume += p.vol || 0;
    s.pnl += p.pnl || 0;
    if ((p.side || '').toUpperCase() === 'BUY') s.longs += p.vol || 0;else s.shorts += p.vol || 0;
    s.clients.add(p.clientId);
  });
  const symbolRows = Object.values(bySymbol).sort((a, b) => Math.abs(b.pnl) - Math.abs(a.pnl));

  // Aggregate by hour for By Time view
  const byHour = {};
  positions.forEach(p => {
    const hour = (p.opened || '').slice(0, 13); // YYYY-MM-DD HH
    if (!hour) return;
    if (!byHour[hour]) byHour[hour] = {
      hour,
      count: 0,
      volume: 0,
      pnl: 0
    };
    byHour[hour].count += 1;
    byHour[hour].volume += p.vol || 0;
    byHour[hour].pnl += p.pnl || 0;
  });
  const timeRows = Object.values(byHour).sort((a, b) => b.hour.localeCompare(a.hour));
  const totalPnl = positions.reduce((s, p) => s + (p.pnl || 0), 0);
  const totalVol = positions.reduce((s, p) => s + (p.vol || 0), 0);
  const totalEquity = MANAGER.ACCOUNTS.reduce((s, a) => s + (a.equity || 0), 0);
  const totalDeposits = MANAGER.FUNDING_REQUESTS.filter(r => r.kind === 'deposit' && r.status === 'approved').reduce((s, r) => s + r.amount, 0);
  const totalWithdrawals = MANAGER.FUNDING_REQUESTS.filter(r => r.kind === 'withdrawal' && r.status === 'approved').reduce((s, r) => s + r.amount, 0);
  const NAVY = '#1B3955',
    NAVY_HI = '#234A6E';
  function Tab({
    id,
    icon,
    label,
    count
  }) {
    const active = view === id;
    return /*#__PURE__*/React.createElement("button", {
      onClick: () => setView(id),
      style: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        padding: '5px 11px',
        background: active ? NAVY : 'transparent',
        color: active ? '#fff' : 'var(--text-2)',
        border: active ? `1px solid ${NAVY}` : '1px solid var(--line-2)',
        cursor: 'pointer',
        fontSize: 11,
        fontWeight: active ? 700 : 500,
        letterSpacing: 0.3
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: 'Material Symbols Outlined',
        fontSize: 13
      }
    }, icon), label, count !== undefined && /*#__PURE__*/React.createElement("span", {
      style: {
        padding: '0 4px',
        fontSize: 9.5,
        fontWeight: 700,
        background: active ? 'rgba(255,255,255,0.18)' : 'var(--bg)',
        color: active ? '#fff' : 'var(--text-3)'
      }
    }, count));
  }
  function Chip({
    active,
    onClick,
    label,
    color
  }) {
    return /*#__PURE__*/React.createElement("button", {
      onClick: onClick,
      style: {
        padding: '4px 9px',
        background: active ? '#EAF2FB' : 'transparent',
        color: active ? NAVY : 'var(--text-2)',
        border: active ? `1px solid ${NAVY}` : '1px solid var(--line-2)',
        cursor: 'pointer',
        fontSize: 11,
        fontWeight: active ? 700 : 500,
        letterSpacing: 0.3,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4
      }
    }, color && /*#__PURE__*/React.createElement("span", {
      style: {
        width: 6,
        height: 6,
        borderRadius: '50%',
        background: color
      }
    }), label);
  }
  function Arrow({
    a,
    d
  }) {
    if (!a) return /*#__PURE__*/React.createElement("svg", {
      width: "8",
      height: "10",
      viewBox: "0 0 24 24",
      fill: "rgba(255,255,255,0.35)",
      style: {
        marginLeft: 4
      }
    }, /*#__PURE__*/React.createElement("path", {
      d: "M7 9l5-5 5 5z M7 15l5 5 5-5z"
    }));
    return /*#__PURE__*/React.createElement("svg", {
      width: "9",
      height: "9",
      viewBox: "0 0 24 24",
      fill: "#5BB0FF",
      style: {
        marginLeft: 4
      }
    }, d === 'asc' ? /*#__PURE__*/React.createElement("path", {
      d: "M7 14l5-5 5 5z"
    }) : /*#__PURE__*/React.createElement("path", {
      d: "M7 10l5 5 5-5z"
    }));
  }
  const allSymbols = [...new Set(MANAGER.POSITIONS.map(p => p.sym))].sort();

  // Positions table columns
  const posCols = [{
    k: 'id',
    l: 'Order',
    w: 80,
    a: 'left',
    s: true
  }, {
    k: 'client',
    l: 'Client',
    w: 180,
    a: 'left',
    s: true
  }, {
    k: 'symbol',
    l: 'Symbol',
    w: 90,
    a: 'center',
    s: true
  }, {
    k: 'side',
    l: 'Side',
    w: 60,
    a: 'center',
    s: true
  }, {
    k: 'vol',
    l: 'Vol',
    w: 80,
    a: 'right',
    s: true,
    edit: true
  }, {
    k: 'open',
    l: 'Open',
    w: 100,
    a: 'right',
    s: true,
    edit: true
  }, {
    k: 'current',
    l: 'Current',
    w: 100,
    a: 'right',
    s: true,
    edit: true
  }, {
    k: 'pnl',
    l: 'P/L',
    w: 110,
    a: 'right',
    s: true,
    edit: true
  }, {
    k: 'opened',
    l: 'Opened',
    w: 140,
    a: 'center',
    s: true
  }, {
    k: 'actions',
    l: '',
    w: 70,
    a: 'right'
  }];
  const posGrid = posCols.map(c => `${c.w}px`).join(' ');
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      flex: 1,
      minHeight: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      padding: '10px 14px',
      minHeight: 50,
      background: 'var(--surface)',
      borderBottom: '1px solid var(--line)',
      flexShrink: 0,
      flexWrap: 'wrap'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      lineHeight: 1.15,
      marginRight: 6
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 14,
      fontWeight: 800,
      color: 'var(--ink)',
      letterSpacing: 0.3
    }
  }, "Reports"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 10,
      color: 'var(--text-3)',
      fontFamily: 'JetBrains Mono, monospace'
    }
  }, positions.length, " pos shown \xB7 Net P/L ", totalPnl >= 0 ? '+' : '', "$", MANAGER.fmt(totalPnl, 0), " \xB7 Vol ", totalVol.toFixed(2))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 5,
      padding: '5px 9px',
      background: 'var(--bg)',
      border: '1px solid var(--line-2)',
      width: 200,
      height: 28
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'Material Symbols Outlined',
      fontSize: 14,
      color: 'var(--text-3)'
    }
  }, "search"), /*#__PURE__*/React.createElement("input", {
    value: search,
    onChange: e => setSearch(e.target.value),
    placeholder: "Symbol, client, order #\u2026",
    style: {
      flex: 1,
      fontSize: 11,
      color: 'var(--ink)',
      background: 'transparent',
      outline: 'none',
      border: 'none'
    }
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 4
    }
  }, /*#__PURE__*/React.createElement(Tab, {
    id: "daily",
    icon: "today",
    label: "Daily"
  }), /*#__PURE__*/React.createElement(Tab, {
    id: "positions",
    icon: "receipt_long",
    label: "Trades",
    count: positions.length
  }), /*#__PURE__*/React.createElement(Tab, {
    id: "activity",
    icon: "verified_user",
    label: "Audit",
    count: (MANAGER.ADMIN_ACTIVITY || []).length
  })), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1
    }
  }), /*#__PURE__*/React.createElement("button", {
    onClick: () => {
      // CSV export of currently visible rows
      let headers, rows;
      if (view === 'positions') {
        headers = ['Order', 'Client', 'Symbol', 'Side', 'Volume', 'Open', 'Current', 'P/L', 'Opened'];
        rows = positions.map(p => {
          const c = MANAGER.findClient(p.clientId);
          return [p.id, c ? `${c.firstName} ${c.lastName}` : '', p.sym, p.side, p.vol, p.open, p.current, p.pnl, p.opened];
        });
      } else if (view === 'by_symbol') {
        headers = ['Symbol', 'Trades', 'Long Lots', 'Short Lots', 'Total Vol', 'Unique Clients', 'Net P/L'];
        rows = symbolRows.map(r => [r.sym, r.count, r.longs, r.shorts, r.volume, r.clients.size, r.pnl]);
      } else if (view === 'by_time') {
        headers = ['Hour', 'Trades', 'Volume', 'Net P/L'];
        rows = timeRows.map(r => [r.hour + ':00', r.count, r.volume, r.pnl]);
      } else if (view === 'activity') {
        headers = ['Time', 'Type', 'Target', 'Detail', 'Admin'];
        rows = (MANAGER.ADMIN_ACTIVITY || []).map(a => [a.ts, a.kind || a.action || '', a.target, a.detail || '', a.admin || a.user || '']);
      } else {
        headers = ['Rank', 'Client', 'Country', 'Open P/L'];
        const byC = {};
        positions.forEach(p => {
          byC[p.clientId] = (byC[p.clientId] || 0) + (p.pnl || 0);
        });
        rows = Object.entries(byC).sort((a, b) => b[1] - a[1]).map(([cid, pnl], i) => {
          const c = MANAGER.findClient(cid);
          return [i + 1, c ? `${c.firstName} ${c.lastName}` : '', c?.country || '', pnl];
        });
      }
      const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
      const blob = new Blob([csv], {
        type: 'text/csv;charset=utf-8;'
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `alpexa-report-${view}-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    },
    style: {
      padding: '6px 12px',
      background: 'transparent',
      border: '1px solid var(--line-2)',
      color: 'var(--text-2)',
      fontSize: 11,
      fontWeight: 600,
      cursor: 'pointer',
      display: 'inline-flex',
      alignItems: 'center',
      gap: 5
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'Material Symbols Outlined',
      fontSize: 14
    }
  }, "file_download"), "CSV"), /*#__PURE__*/React.createElement("button", {
    onClick: () => window.print(),
    style: {
      padding: '6px 12px',
      background: '#1B3955',
      border: 'none',
      color: '#fff',
      fontSize: 11,
      fontWeight: 700,
      cursor: 'pointer',
      display: 'inline-flex',
      alignItems: 'center',
      gap: 5,
      letterSpacing: 0.4
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'Material Symbols Outlined',
      fontSize: 14
    }
  }, "print"), "Print")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '8px 14px',
      background: '#FAFBFC',
      borderBottom: '1px solid var(--line)',
      flexWrap: 'wrap'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 9,
      fontWeight: 700,
      color: 'var(--text-3)',
      letterSpacing: 0.5,
      textTransform: 'uppercase'
    }
  }, "Time"), /*#__PURE__*/React.createElement(Chip, {
    active: timeRange === 'today',
    onClick: () => setTimeRange('today'),
    label: "Today"
  }), /*#__PURE__*/React.createElement(Chip, {
    active: timeRange === 'week',
    onClick: () => setTimeRange('week'),
    label: "7 Days"
  }), /*#__PURE__*/React.createElement(Chip, {
    active: timeRange === 'month',
    onClick: () => setTimeRange('month'),
    label: "30 Days"
  }), /*#__PURE__*/React.createElement(Chip, {
    active: timeRange === 'all',
    onClick: () => setTimeRange('all'),
    label: "All"
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      width: 1,
      height: 18,
      background: 'var(--line-2)',
      margin: '0 4px'
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 9,
      fontWeight: 700,
      color: 'var(--text-3)',
      letterSpacing: 0.5,
      textTransform: 'uppercase'
    }
  }, "Side"), /*#__PURE__*/React.createElement(Chip, {
    active: sideFilter === 'all',
    onClick: () => setSideFilter('all'),
    label: "All"
  }), /*#__PURE__*/React.createElement(Chip, {
    active: sideFilter === 'BUY',
    onClick: () => setSideFilter('BUY'),
    label: "Buy",
    color: "#2E6FB0"
  }), /*#__PURE__*/React.createElement(Chip, {
    active: sideFilter === 'SELL',
    onClick: () => setSideFilter('SELL'),
    label: "Sell",
    color: "#E04141"
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      width: 1,
      height: 18,
      background: 'var(--line-2)',
      margin: '0 4px'
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 9,
      fontWeight: 700,
      color: 'var(--text-3)',
      letterSpacing: 0.5,
      textTransform: 'uppercase'
    }
  }, "Symbol"), /*#__PURE__*/React.createElement("select", {
    value: symFilter,
    onChange: e => setSymFilter(e.target.value),
    style: {
      padding: '4px 8px',
      border: '1px solid var(--line-2)',
      fontSize: 11,
      color: 'var(--ink)',
      background: '#fff',
      fontFamily: 'JetBrains Mono, monospace'
    }
  }, /*#__PURE__*/React.createElement("option", {
    value: "all"
  }, "All Symbols"), allSymbols.map(s => /*#__PURE__*/React.createElement("option", {
    key: s
  }, s)))), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      overflowY: 'auto',
      background: 'var(--bg)'
    }
  }, view === 'daily' && (() => {
    // ── Daily Brokerage Report (MT5 style) ──
    const openingBalance = MANAGER.ACCOUNTS.reduce((s, a) => s + (a.balance || 0), 0) - totalPnl;
    const cashDeposits = MANAGER.FUNDING_REQUESTS.filter(r => r.kind === 'deposit' && r.status === 'approved').reduce((s, r) => s + r.amount, 0);
    const cashWithdrawals = MANAGER.FUNDING_REQUESTS.filter(r => r.kind === 'withdrawal' && r.status === 'approved').reduce((s, r) => s + r.amount, 0);
    const commIncome = totalVol * 7;
    const swapIncome = totalVol * 1.5;
    const markupIncome = totalVol * 4;
    const brokerPnl = -totalPnl;
    const netChange = brokerPnl + commIncome + swapIncome + markupIncome + cashDeposits - cashWithdrawals;
    const closingBalance = openingBalance + netChange;
    const activeTraders = new Set(positions.map(p => p.clientId)).size;
    const dealsCount = positions.length;
    const today = new Date().toISOString().slice(0, 10);
    function row(label, value, color, indent) {
      return /*#__PURE__*/React.createElement('div', {
        style: { display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px dashed var(--line-2)', paddingLeft: indent || 0 }
      },
        /*#__PURE__*/React.createElement('span', { style: { fontSize: 12, color: indent ? 'var(--text-2)' : 'var(--ink)', fontWeight: indent ? 500 : 700 } }, label),
        /*#__PURE__*/React.createElement('span', { style: { fontSize: 12, fontWeight: 800, color: color || 'var(--ink)', fontFamily: 'JetBrains Mono, monospace' } }, value)
      );
    }
    return /*#__PURE__*/React.createElement('div', { style: { padding: 18, background: 'var(--bg)' } },
      /*#__PURE__*/React.createElement('div', {
        style: { maxWidth: 880, margin: '0 auto', background: 'var(--surface)', border: '1px solid var(--line)' }
      },
        /*#__PURE__*/React.createElement('div', {
          style: { padding: '14px 22px', borderBottom: '2px solid var(--ink)', display: 'flex', justifyContent: 'space-between', background: '#FAFBFC' }
        },
          /*#__PURE__*/React.createElement('div', null,
            /*#__PURE__*/React.createElement('div', { style: { fontSize: 17, fontWeight: 900, letterSpacing: 0.5 } }, 'Daily Brokerage Report'),
            /*#__PURE__*/React.createElement('div', { style: { fontSize: 10.5, color: 'var(--text-3)', marginTop: 2 } }, 'Period: ' + today + ' · ' + dealsCount + ' deals')
          ),
          /*#__PURE__*/React.createElement('div', { style: { display: 'flex', gap: 6 } },
            /*#__PURE__*/React.createElement('button', {
              onClick: () => window.print(),
              style: { padding: '5px 12px', fontSize: 10, fontWeight: 700, background: '#fff', border: '1px solid var(--line-2)', cursor: 'pointer' }
            }, '🖨 PRINT'),
            /*#__PURE__*/React.createElement('button', {
              onClick: () => {
                const ts = new Date().toISOString().slice(0,16).replace('T',' ');
                if (MANAGER.ADMIN_ACTIVITY) MANAGER.ADMIN_ACTIVITY.unshift({
                  ts, admin: 'admin@alpexa.com', kind: 'report_email_scheduled',
                  target: 'Daily Brokerage Report', detail: 'Daily at 23:59 UTC'
                });
                alert('Daily report scheduled at 23:59 UTC');
              },
              style: { padding: '5px 12px', fontSize: 10, fontWeight: 700, color: '#fff', background: '#1B3955', border: '1px solid #1B3955', cursor: 'pointer' }
            }, '📧 EMAIL DAILY')
          )
        ),
        /*#__PURE__*/React.createElement('div', { style: { padding: '18px 22px' } },
          row('OPENING BALANCE', '$' + MANAGER.fmt(openingBalance, 0)),
          /*#__PURE__*/React.createElement('div', { style: { height: 8 } }),
          row('+ Deposits', '+$' + MANAGER.fmt(cashDeposits, 2), '#15A36C', 16),
          row('− Withdrawals', '−$' + MANAGER.fmt(cashWithdrawals, 2), '#EF4444', 16),
          row('+ Commission income', '+$' + MANAGER.fmt(commIncome, 2), '#15A36C', 16),
          row('+ Swap income', '+$' + MANAGER.fmt(swapIncome, 2), '#15A36C', 16),
          row('+ Markup/Spread', '+$' + MANAGER.fmt(markupIncome, 2), '#15A36C', 16),
          row('± Client P/L', (brokerPnl >= 0 ? '+' : '') + '$' + MANAGER.fmt(brokerPnl, 2), brokerPnl >= 0 ? '#15A36C' : '#EF4444', 16),
          /*#__PURE__*/React.createElement('div', { style: { height: 8 } }),
          row('NET CHANGE', (netChange >= 0 ? '+' : '') + '$' + MANAGER.fmt(netChange, 2), netChange >= 0 ? '#15A36C' : '#EF4444'),
          row('CLOSING BALANCE', '$' + MANAGER.fmt(closingBalance, 0)),
          /*#__PURE__*/React.createElement('div', { style: { marginTop: 24, paddingTop: 14, borderTop: '2px solid var(--ink)' } },
            /*#__PURE__*/React.createElement('div', { style: { fontSize: 11, fontWeight: 800, color: 'var(--text-3)', marginBottom: 10 } }, 'TRADING ACTIVITY'),
            /*#__PURE__*/React.createElement('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 } },
              [['Volume', MANAGER.fmt(totalVol, 2) + ' lots'], ['Deals', dealsCount], ['Active traders', activeTraders], ['Avg P/L', dealsCount > 0 ? '$' + MANAGER.fmt(brokerPnl / dealsCount, 2) : '—']].map((c, i) =>
                /*#__PURE__*/React.createElement('div', { key: i, style: { padding: 10, background: '#FAFBFC', border: '1px solid var(--line-2)' } },
                  /*#__PURE__*/React.createElement('div', { style: { fontSize: 9.5, fontWeight: 700, color: 'var(--text-3)' } }, c[0]),
                  /*#__PURE__*/React.createElement('div', { style: { fontSize: 16, fontWeight: 800, marginTop: 4, fontFamily: 'JetBrains Mono, monospace' } }, c[1])
                )
              )
            )
          )
        )
      )
    );
  })(), view === 'positions' && /*#__PURE__*/React.createElement("div", {
    style: {
      background: 'var(--surface)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: posGrid,
      background: NAVY,
      color: 'rgba(255,255,255,0.92)',
      fontSize: 10,
      fontWeight: 700,
      letterSpacing: 0.6,
      textTransform: 'uppercase',
      fontFamily: 'JetBrains Mono, monospace',
      position: 'sticky',
      top: 0,
      zIndex: 5
    }
  }, posCols.map(col => /*#__PURE__*/React.createElement("span", {
    key: col.k,
    onClick: col.s ? () => toggleSort(col.k) : undefined,
    style: {
      padding: '7px 8px',
      borderRight: '1px solid rgba(255,255,255,0.12)',
      cursor: col.s ? 'pointer' : 'default',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: col.a === 'right' ? 'flex-end' : col.a === 'left' ? 'flex-start' : 'center',
      background: sortKey === col.k ? 'rgba(91,176,255,0.10)' : 'transparent'
    }
  }, col.l, col.s && /*#__PURE__*/React.createElement(Arrow, {
    a: sortKey === col.k,
    d: sortDir
  })))), positions.length === 0 ? /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '40px 16px',
      textAlign: 'center',
      color: 'var(--text-3)',
      fontSize: 12
    }
  }, "No positions match the filter.") : positions.map((p, i) => {
    const c = MANAGER.findClient(p.clientId);
    const isBuy = (p.side || '').toUpperCase() === 'BUY';
    const editing = editingId === p.id;
    return /*#__PURE__*/React.createElement("div", {
      key: p.id,
      style: {
        display: 'grid',
        gridTemplateColumns: posGrid,
        fontSize: 11.5,
        borderBottom: '1px solid #E5E7EB',
        background: editing ? '#FEF3C7' : i % 2 === 1 ? '#F7F9FC' : 'transparent'
      }
    }, /*#__PURE__*/React.createElement("span", {
      className: "mono",
      style: {
        padding: '7px 8px',
        display: 'inline-flex',
        alignItems: 'center',
        color: 'var(--text-2)'
      }
    }, p.id.toUpperCase()), /*#__PURE__*/React.createElement("span", {
      style: {
        padding: '7px 8px',
        display: 'inline-flex',
        alignItems: 'center',
        color: 'var(--text-2)'
      }
    }, c ? /*#__PURE__*/React.createElement("span", {
      style: {
        color: 'var(--ink)'
      }
    }, c.firstName, " ", c.lastName) : '—'), /*#__PURE__*/React.createElement("span", {
      style: {
        padding: '7px 8px',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--ink)',
        fontWeight: 600
      }
    }, p.sym), /*#__PURE__*/React.createElement("span", {
      style: {
        padding: '7px 8px',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center'
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        padding: '1px 6px',
        fontSize: 9.5,
        fontWeight: 800,
        color: '#fff',
        background: isBuy ? '#2E6FB0' : '#E04141',
        textTransform: 'uppercase',
        letterSpacing: 0.4
      }
    }, p.side)), ['vol', 'open', 'current', 'pnl'].map(k => /*#__PURE__*/React.createElement("span", {
      key: k,
      style: {
        padding: '5px 8px',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'flex-end'
      }
    }, editing ? /*#__PURE__*/React.createElement("input", {
      type: "number",
      step: k === 'vol' ? 0.01 : k === 'pnl' ? 1 : 0.0001,
      defaultValue: p[k],
      onBlur: e => updatePos(p.id, k, e.target.value),
      style: {
        width: 80,
        padding: '3px 6px',
        border: '1px solid var(--line-2)',
        fontSize: 11,
        color: 'var(--ink)',
        fontFamily: 'JetBrains Mono, monospace',
        textAlign: 'right'
      }
    }) : /*#__PURE__*/React.createElement("span", {
      className: "mono",
      style: {
        color: k === 'pnl' ? (p.pnl || 0) >= 0 ? '#15A36C' : '#EF4444' : 'var(--text-2)',
        fontWeight: k === 'pnl' ? 700 : 500
      }
    }, k === 'pnl' ? `${(p.pnl || 0) >= 0 ? '+' : ''}$${MANAGER.fmt(p.pnl || 0, 2)}` : p[k] !== undefined ? Number(p[k]).toFixed(k === 'vol' ? 2 : 5) : '—'))), /*#__PURE__*/React.createElement("span", {
      className: "mono",
      style: {
        padding: '7px 8px',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--text-3)',
        fontSize: 10.5
      }
    }, p.opened), /*#__PURE__*/React.createElement("span", {
      style: {
        padding: '5px 6px',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'flex-end',
        gap: 3
      }
    }, /*#__PURE__*/React.createElement("button", {
      onClick: () => setEditingId(editing ? null : p.id),
      title: editing ? 'Done' : 'Edit',
      style: {
        width: 22,
        height: 22,
        padding: 0,
        background: editing ? '#22C55E' : 'var(--bg)',
        color: editing ? '#fff' : 'var(--text-2)',
        border: '1px solid var(--line-2)',
        cursor: 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center'
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: 'Material Symbols Outlined',
        fontSize: 13
      }
    }, editing ? 'check' : 'edit')), /*#__PURE__*/React.createElement("button", {
      onClick: () => closePosition(p.id),
      title: "Force close",
      style: {
        width: 22,
        height: 22,
        padding: 0,
        background: '#FFEBEE',
        color: '#C62828',
        border: '1px solid #FECACA',
        cursor: 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center'
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: 'Material Symbols Outlined',
        fontSize: 13
      }
    }, "close"))));
  })), view === 'by_symbol' && /*#__PURE__*/React.createElement("div", {
    style: {
      background: 'var(--surface)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '140px 80px 1fr 100px 100px 100px 130px',
      background: NAVY,
      color: 'rgba(255,255,255,0.92)',
      fontSize: 10,
      fontWeight: 700,
      letterSpacing: 0.6,
      textTransform: 'uppercase',
      fontFamily: 'JetBrains Mono, monospace'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      padding: '7px 10px'
    }
  }, "Symbol"), /*#__PURE__*/React.createElement("span", {
    style: {
      padding: '7px 10px',
      textAlign: 'right'
    }
  }, "Trades"), /*#__PURE__*/React.createElement("span", {
    style: {
      padding: '7px 10px'
    }
  }, "Long vs Short (lots)"), /*#__PURE__*/React.createElement("span", {
    style: {
      padding: '7px 10px',
      textAlign: 'right'
    }
  }, "Total Vol"), /*#__PURE__*/React.createElement("span", {
    style: {
      padding: '7px 10px',
      textAlign: 'right'
    }
  }, "Unique Clients"), /*#__PURE__*/React.createElement("span", {
    style: {
      padding: '7px 10px',
      textAlign: 'right'
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      padding: '7px 10px',
      textAlign: 'right'
    }
  }, "Net P/L")), symbolRows.length === 0 ? /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '40px 16px',
      textAlign: 'center',
      color: 'var(--text-3)',
      fontSize: 12
    }
  }, "No data.") : symbolRows.map((r, i) => {
    const total = r.longs + r.shorts;
    const longPct = total > 0 ? r.longs / total * 100 : 50;
    return /*#__PURE__*/React.createElement("div", {
      key: r.sym,
      style: {
        display: 'grid',
        gridTemplateColumns: '140px 80px 1fr 100px 100px 100px 130px',
        fontSize: 11.5,
        borderBottom: '1px solid #E5E7EB',
        background: i % 2 === 1 ? '#F7F9FC' : 'transparent',
        alignItems: 'center'
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        padding: '10px 10px',
        fontWeight: 700,
        color: 'var(--ink)'
      }
    }, r.sym), /*#__PURE__*/React.createElement("span", {
      className: "mono",
      style: {
        padding: '10px 10px',
        textAlign: 'right',
        color: 'var(--text-2)'
      }
    }, r.count), /*#__PURE__*/React.createElement("span", {
      style: {
        padding: '10px 10px',
        display: 'flex',
        alignItems: 'center',
        gap: 6
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        flex: 1,
        height: 8,
        background: '#E5E7EB',
        position: 'relative',
        overflow: 'hidden'
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        position: 'absolute',
        left: 0,
        top: 0,
        bottom: 0,
        width: longPct + '%',
        background: '#2E6FB0'
      }
    }), /*#__PURE__*/React.createElement("span", {
      style: {
        position: 'absolute',
        right: 0,
        top: 0,
        bottom: 0,
        width: 100 - longPct + '%',
        background: '#E04141'
      }
    })), /*#__PURE__*/React.createElement("span", {
      className: "mono",
      style: {
        fontSize: 10,
        color: 'var(--text-3)',
        whiteSpace: 'nowrap'
      }
    }, "L", r.longs.toFixed(1), " / S", r.shorts.toFixed(1))), /*#__PURE__*/React.createElement("span", {
      className: "mono",
      style: {
        padding: '10px 10px',
        textAlign: 'right',
        color: 'var(--ink)',
        fontWeight: 600
      }
    }, r.volume.toFixed(2)), /*#__PURE__*/React.createElement("span", {
      className: "mono",
      style: {
        padding: '10px 10px',
        textAlign: 'right',
        color: 'var(--text-2)'
      }
    }, r.clients.size), /*#__PURE__*/React.createElement("span", null), /*#__PURE__*/React.createElement("span", {
      className: "mono",
      style: {
        padding: '10px 10px',
        textAlign: 'right',
        color: r.pnl >= 0 ? '#15A36C' : '#EF4444',
        fontWeight: 700
      }
    }, r.pnl >= 0 ? '+' : '', "$", MANAGER.fmt(r.pnl, 2)));
  })), view === 'by_time' && /*#__PURE__*/React.createElement("div", {
    style: {
      background: 'var(--surface)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '160px 100px 1fr 130px',
      background: NAVY,
      color: 'rgba(255,255,255,0.92)',
      fontSize: 10,
      fontWeight: 700,
      letterSpacing: 0.6,
      textTransform: 'uppercase',
      fontFamily: 'JetBrains Mono, monospace'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      padding: '7px 10px'
    }
  }, "Hour"), /*#__PURE__*/React.createElement("span", {
    style: {
      padding: '7px 10px',
      textAlign: 'right'
    }
  }, "Trades"), /*#__PURE__*/React.createElement("span", {
    style: {
      padding: '7px 10px',
      textAlign: 'right'
    }
  }, "Volume"), /*#__PURE__*/React.createElement("span", {
    style: {
      padding: '7px 10px',
      textAlign: 'right'
    }
  }, "Net P/L")), timeRows.length === 0 ? /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '40px 16px',
      textAlign: 'center',
      color: 'var(--text-3)',
      fontSize: 12
    }
  }, "No data for the selected time range.") : timeRows.map((r, i) => /*#__PURE__*/React.createElement("div", {
    key: r.hour,
    style: {
      display: 'grid',
      gridTemplateColumns: '160px 100px 1fr 130px',
      fontSize: 11.5,
      borderBottom: '1px solid #E5E7EB',
      background: i % 2 === 1 ? '#F7F9FC' : 'transparent',
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "mono",
    style: {
      padding: '10px 10px',
      color: 'var(--ink)'
    }
  }, r.hour, ":00"), /*#__PURE__*/React.createElement("span", {
    className: "mono",
    style: {
      padding: '10px 10px',
      textAlign: 'right',
      color: 'var(--text-2)'
    }
  }, r.count), /*#__PURE__*/React.createElement("span", {
    className: "mono",
    style: {
      padding: '10px 10px',
      textAlign: 'right',
      color: 'var(--ink)',
      fontWeight: 600
    }
  }, r.volume.toFixed(2)), /*#__PURE__*/React.createElement("span", {
    className: "mono",
    style: {
      padding: '10px 10px',
      textAlign: 'right',
      color: r.pnl >= 0 ? '#15A36C' : '#EF4444',
      fontWeight: 700
    }
  }, r.pnl >= 0 ? '+' : '', "$", MANAGER.fmt(r.pnl, 2))))), view === 'periodic' && /*#__PURE__*/React.createElement(PeriodicPL, {
    items: positions,
    getDate: p => p.opened,
    getValue: p => p.pnl || 0,
    getVolume: p => p.vol || 0,
    valueLabel: "Net P/L (USD)",
    volumeLabel: "Volume (lots)",
    prefix: "$"
  }), view === 'top_traders' && /*#__PURE__*/React.createElement("div", {
    style: {
      background: 'var(--surface)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '8px 12px',
      background: NAVY,
      color: 'rgba(255,255,255,0.92)',
      fontSize: 10,
      fontWeight: 700,
      letterSpacing: 0.6,
      textTransform: 'uppercase',
      fontFamily: 'JetBrains Mono, monospace'
    }
  }, "Top Traders by Open P/L"), (() => {
    const byClient = {};
    positions.forEach(p => {
      byClient[p.clientId] = (byClient[p.clientId] || 0) + (p.pnl || 0);
    });
    const sorted = Object.entries(byClient).sort((a, b) => b[1] - a[1]);
    return sorted.length === 0 ? /*#__PURE__*/React.createElement("div", {
      style: {
        padding: '40px 16px',
        textAlign: 'center',
        color: 'var(--text-3)',
        fontSize: 12
      }
    }, "No traders to rank.") : sorted.map(([cid, pnl], i) => {
      const c = MANAGER.findClient(cid);
      return /*#__PURE__*/React.createElement("div", {
        key: cid,
        style: {
          display: 'grid',
          gridTemplateColumns: '40px 1fr 120px',
          padding: '8px 12px',
          fontSize: 11.5,
          borderBottom: '1px solid #E5E7EB',
          background: i % 2 === 1 ? '#F7F9FC' : 'transparent',
          alignItems: 'center'
        }
      }, /*#__PURE__*/React.createElement("span", {
        className: "mono",
        style: {
          color: i < 3 ? '#B45309' : 'var(--text-3)',
          fontWeight: 700
        }
      }, "#", i + 1), /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement("span", {
        style: {
          color: 'var(--ink)',
          fontWeight: 600
        }
      }, c?.firstName, " ", c?.lastName), " ", /*#__PURE__*/React.createElement("span", {
        style: {
          fontSize: 10,
          color: 'var(--text-3)'
        }
      }, "\xB7 ", c?.country)), /*#__PURE__*/React.createElement("span", {
        className: "mono",
        style: {
          textAlign: 'right',
          color: pnl >= 0 ? '#15A36C' : '#EF4444',
          fontWeight: 700
        }
      }, pnl >= 0 ? '+' : '', "$", MANAGER.fmt(pnl, 2)));
    });
  })()), view === 'activity' && /*#__PURE__*/React.createElement("div", { style: { background: 'var(--surface)', padding: 20 } }, /*#__PURE__*/React.createElement("div", { style: { fontSize: 14, color: 'var(--text-2)', textAlign: 'center', padding: 40 } }, [/*#__PURE__*/React.createElement("div", { key: 'a', style: { marginBottom: 10 } }, 'Audit Log under reconstruction')]))));
}
function CommissionEditor({
  NAVY
}) {
  const [rules, setRules] = useState(() => JSON.parse(JSON.stringify(MANAGER.COMMISSION_RULES)));
  const [tick, setTick] = useState(0);
  function save() {
    Object.keys(rules).forEach(g => {
      MANAGER.COMMISSION_RULES[g] = JSON.parse(JSON.stringify(rules[g]));
    });
    if (MANAGER.rebuildCommissionLedger) MANAGER.rebuildCommissionLedger();
    setTick(t => t + 1);
    setTimeout(() => alert('Commission rules saved. Ledger rebuilt — Manager earnings updated.'), 50);
  }
  function setBroker(g, v) {
    setRules(prev => ({
      ...prev,
      [g]: {
        ...prev[g],
        brokerCommissionPerLot: parseFloat(v) || 0
      }
    }));
  }
  function setMarkup(g, v) {
    setRules(prev => ({
      ...prev,
      [g]: {
        ...prev[g],
        markupSharePct: parseFloat(v) || 0
      }
    }));
  }
  function setRebate(g, mid, v) {
    setRules(prev => ({
      ...prev,
      [g]: {
        ...prev[g],
        managerRebates: prev[g].managerRebates.map(r => r.managerId === mid ? {
          ...r,
          perLot: parseFloat(v) || 0
        } : r)
      }
    }));
  }
  function removeRebate(g, mid) {
    setRules(prev => ({
      ...prev,
      [g]: {
        ...prev[g],
        managerRebates: prev[g].managerRebates.filter(r => r.managerId !== mid)
      }
    }));
  }
  function addRebate(g, mid) {
    if (!mid) return;
    setRules(prev => ({
      ...prev,
      [g]: {
        ...prev[g],
        managerRebates: [...prev[g].managerRebates, {
          managerId: mid,
          perLot: 1.0
        }]
      }
    }));
  }
  return /*#__PURE__*/React.createElement("div", {
    style: {
      background: 'var(--surface)',
      border: '1px solid var(--line)',
      marginBottom: 14
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '8px 12px',
      background: NAVY,
      color: 'rgba(255,255,255,0.92)',
      fontSize: 10,
      fontWeight: 700,
      letterSpacing: 0.6,
      textTransform: 'uppercase',
      fontFamily: 'JetBrains Mono, monospace',
      display: 'flex',
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1
    }
  }, "Groups & Commission Rules \u2014 edit live"), /*#__PURE__*/React.createElement("button", {
    onClick: save,
    style: {
      padding: '4px 10px',
      background: '#22C55E',
      border: 'none',
      color: '#fff',
      fontSize: 10,
      fontWeight: 700,
      letterSpacing: 0.4,
      cursor: 'pointer',
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'Material Symbols Outlined',
      fontSize: 13
    }
  }, "save"), "Apply")), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '8px 12px',
      background: '#0F1B2D',
      color: 'rgba(255,255,255,0.75)',
      fontSize: 9.5,
      fontWeight: 700,
      letterSpacing: 0.6,
      textTransform: 'uppercase',
      fontFamily: 'JetBrains Mono, monospace'
    }
  }, "LIVE Server \u2014 Forex / Metals / Indices / Stocks (per-lot)"), Object.entries(rules).filter(([k, v]) => v.brokerCommissionPerLot !== undefined).map(([groupId, rule], i) => {
    const assigned = new Set(rule.managerRebates.map(r => r.managerId));
    const available = MANAGER.MANAGERS.filter(m => !assigned.has(m.id));
    return /*#__PURE__*/React.createElement("div", {
      key: groupId,
      style: {
        padding: '14px 14px',
        borderBottom: '1px solid #E5E7EB',
        background: i % 2 === 1 ? '#F7F9FC' : 'transparent'
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        marginBottom: 10
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        padding: '3px 10px',
        fontSize: 11,
        fontWeight: 800,
        color: '#fff',
        letterSpacing: 0.4,
        background: groupId === 'VIP' ? '#7C3AED' : groupId === 'Pro' ? '#0EA5E9' : '#5A6478'
      }
    }, groupId), /*#__PURE__*/React.createElement("span", {
      style: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        fontSize: 11,
        color: 'var(--text-2)'
      }
    }, "Broker / lot:", /*#__PURE__*/React.createElement("input", {
      type: "number",
      step: "0.5",
      value: rule.brokerCommissionPerLot,
      onChange: e => setBroker(groupId, e.target.value),
      style: {
        width: 70,
        padding: '4px 8px',
        border: '1px solid var(--line-2)',
        fontSize: 11,
        color: 'var(--ink)',
        fontFamily: 'JetBrains Mono, monospace',
        fontWeight: 700,
        textAlign: 'right'
      }
    }), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 9,
        color: 'var(--text-3)'
      }
    }, "USD")), /*#__PURE__*/React.createElement("span", {
      style: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        fontSize: 11,
        color: 'var(--text-2)'
      }
    }, "Markup share:", /*#__PURE__*/React.createElement("input", {
      type: "number",
      step: "1",
      value: rule.markupSharePct,
      onChange: e => setMarkup(groupId, e.target.value),
      style: {
        width: 50,
        padding: '4px 8px',
        border: '1px solid var(--line-2)',
        fontSize: 11,
        color: 'var(--ink)',
        fontFamily: 'JetBrains Mono, monospace',
        fontWeight: 700,
        textAlign: 'right'
      }
    }), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 9,
        color: 'var(--text-3)'
      }
    }, "%"))), /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        flexWrap: 'wrap',
        gap: 6,
        alignItems: 'center'
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 9.5,
        fontWeight: 700,
        color: 'var(--text-3)',
        letterSpacing: 0.5,
        textTransform: 'uppercase'
      }
    }, "Manager rebates:"), rule.managerRebates.length === 0 && /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 11,
        color: 'var(--text-3)',
        fontStyle: 'italic'
      }
    }, "(none)"), rule.managerRebates.map(rb => {
      const mgr = MANAGER.MANAGERS.find(m => m.id === rb.managerId);
      return /*#__PURE__*/React.createElement("span", {
        key: rb.managerId,
        style: {
          display: 'inline-flex',
          alignItems: 'center',
          gap: 5,
          padding: '3px 4px 3px 8px',
          background: '#FEF3C7',
          color: '#B45309',
          fontSize: 11,
          fontWeight: 700
        }
      }, mgr?.name?.split(' ')[0] || rb.managerId, /*#__PURE__*/React.createElement("span", {
        style: {
          fontSize: 9,
          color: '#92400E',
          opacity: 0.7
        }
      }, "$"), /*#__PURE__*/React.createElement("input", {
        type: "number",
        step: "0.5",
        value: rb.perLot,
        onChange: e => setRebate(groupId, rb.managerId, e.target.value),
        style: {
          width: 42,
          padding: '1px 4px',
          border: '1px solid #FCD34D',
          fontSize: 11,
          color: '#92400E',
          fontFamily: 'JetBrains Mono, monospace',
          fontWeight: 700,
          textAlign: 'right',
          background: '#fff'
        }
      }), /*#__PURE__*/React.createElement("span", {
        style: {
          fontSize: 9,
          color: '#92400E',
          opacity: 0.7
        }
      }, "/lot"), /*#__PURE__*/React.createElement("button", {
        onClick: () => removeRebate(groupId, rb.managerId),
        title: "Remove",
        style: {
          width: 18,
          height: 18,
          padding: 0,
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          color: '#92400E',
          fontSize: 14,
          lineHeight: 1,
          fontWeight: 700
        }
      }, "\xD7"));
    }), available.length > 0 && /*#__PURE__*/React.createElement("select", {
      onChange: e => {
        addRebate(groupId, e.target.value);
        e.target.value = '';
      },
      style: {
        padding: '4px 8px',
        border: '1px dashed var(--line-2)',
        fontSize: 10.5,
        color: 'var(--text-2)',
        background: 'var(--bg)',
        cursor: 'pointer'
      }
    }, /*#__PURE__*/React.createElement("option", {
      value: ""
    }, "+ Add manager\u2026"), available.map(m => /*#__PURE__*/React.createElement("option", {
      key: m.id,
      value: m.id
    }, m.name)))));
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '8px 12px',
      background: '#0F1B2D',
      color: 'rgba(255,255,255,0.75)',
      fontSize: 9.5,
      fontWeight: 700,
      letterSpacing: 0.6,
      textTransform: 'uppercase',
      fontFamily: 'JetBrains Mono, monospace'
    }
  }, "CRYPTO Server \u2014 BTC / ETH / Alt (basis points of notional)"), ['Standard', 'Pro', 'VIP'].map((g, i) => {
    const rule = (rules.CRYPTO || {})[g] || {
      feeBps: 0,
      managerSharePct: 0,
      managerRebates: []
    };
    return /*#__PURE__*/React.createElement("div", {
      key: 'cr-' + g,
      style: {
        padding: '12px 14px',
        borderBottom: '1px solid #E5E7EB',
        background: i % 2 === 1 ? '#F7F9FC' : 'transparent',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        flexWrap: 'wrap'
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        padding: '3px 10px',
        fontSize: 11,
        fontWeight: 800,
        color: '#fff',
        letterSpacing: 0.4,
        background: g === 'VIP' ? '#7C3AED' : g === 'Pro' ? '#0EA5E9' : '#5A6478'
      }
    }, g), /*#__PURE__*/React.createElement("span", {
      style: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        fontSize: 11,
        color: 'var(--text-2)'
      }
    }, "Fee:", /*#__PURE__*/React.createElement("input", {
      type: "number",
      step: "1",
      value: rule.feeBps,
      onChange: e => setRules(prev => ({
        ...prev,
        CRYPTO: {
          ...prev.CRYPTO,
          [g]: {
            ...prev.CRYPTO[g],
            feeBps: parseFloat(e.target.value) || 0
          }
        }
      })),
      style: {
        width: 60,
        padding: '4px 8px',
        border: '1px solid var(--line-2)',
        fontSize: 11,
        color: 'var(--ink)',
        fontFamily: 'JetBrains Mono, monospace',
        fontWeight: 700,
        textAlign: 'right'
      }
    }), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 9,
        color: 'var(--text-3)'
      }
    }, "bps")), /*#__PURE__*/React.createElement("span", {
      style: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        fontSize: 11,
        color: 'var(--text-2)'
      }
    }, "Manager share:", /*#__PURE__*/React.createElement("input", {
      type: "number",
      step: "5",
      value: rule.managerSharePct,
      onChange: e => setRules(prev => ({
        ...prev,
        CRYPTO: {
          ...prev.CRYPTO,
          [g]: {
            ...prev.CRYPTO[g],
            managerSharePct: parseFloat(e.target.value) || 0
          }
        }
      })),
      style: {
        width: 55,
        padding: '4px 8px',
        border: '1px solid var(--line-2)',
        fontSize: 11,
        color: 'var(--ink)',
        fontFamily: 'JetBrains Mono, monospace',
        fontWeight: 700,
        textAlign: 'right'
      }
    }), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 9,
        color: 'var(--text-3)'
      }
    }, "%")), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 10,
        color: 'var(--text-3)'
      }
    }, "\u2248 $", ((rule.feeBps || 0) / 10000 * 100000).toFixed(0), " per $100k traded"));
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '8px 12px',
      background: '#0F1B2D',
      color: 'rgba(255,255,255,0.75)',
      fontSize: 9.5,
      fontWeight: 700,
      letterSpacing: 0.6,
      textTransform: 'uppercase',
      fontFamily: 'JetBrains Mono, monospace'
    }
  }, "SPORTS Server \u2014 Handle % & GGR % (bets)"), ['Standard', 'Pro', 'VIP'].map((g, i) => {
    const rule = (rules.SPORTS || {})[g] || {
      handlePct: 0,
      ggrPct: 0,
      managerSharePct: 0,
      managerRebates: []
    };
    return /*#__PURE__*/React.createElement("div", {
      key: 'sp-' + g,
      style: {
        padding: '12px 14px',
        borderBottom: '1px solid #E5E7EB',
        background: i % 2 === 1 ? '#F7F9FC' : 'transparent',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        flexWrap: 'wrap'
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        padding: '3px 10px',
        fontSize: 11,
        fontWeight: 800,
        color: '#fff',
        letterSpacing: 0.4,
        background: g === 'VIP' ? '#7C3AED' : g === 'Pro' ? '#0EA5E9' : '#5A6478'
      }
    }, g), /*#__PURE__*/React.createElement("span", {
      style: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        fontSize: 11,
        color: 'var(--text-2)'
      }
    }, "Handle:", /*#__PURE__*/React.createElement("input", {
      type: "number",
      step: "0.1",
      value: rule.handlePct,
      onChange: e => setRules(prev => ({
        ...prev,
        SPORTS: {
          ...prev.SPORTS,
          [g]: {
            ...prev.SPORTS[g],
            handlePct: parseFloat(e.target.value) || 0
          }
        }
      })),
      style: {
        width: 55,
        padding: '4px 8px',
        border: '1px solid var(--line-2)',
        fontSize: 11,
        color: 'var(--ink)',
        fontFamily: 'JetBrains Mono, monospace',
        fontWeight: 700,
        textAlign: 'right'
      }
    }), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 9,
        color: 'var(--text-3)'
      }
    }, "% of stake")), /*#__PURE__*/React.createElement("span", {
      style: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        fontSize: 11,
        color: 'var(--text-2)'
      }
    }, "GGR:", /*#__PURE__*/React.createElement("input", {
      type: "number",
      step: "1",
      value: rule.ggrPct,
      onChange: e => setRules(prev => ({
        ...prev,
        SPORTS: {
          ...prev.SPORTS,
          [g]: {
            ...prev.SPORTS[g],
            ggrPct: parseFloat(e.target.value) || 0
          }
        }
      })),
      style: {
        width: 55,
        padding: '4px 8px',
        border: '1px solid var(--line-2)',
        fontSize: 11,
        color: 'var(--ink)',
        fontFamily: 'JetBrains Mono, monospace',
        fontWeight: 700,
        textAlign: 'right'
      }
    }), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 9,
        color: 'var(--text-3)'
      }
    }, "% of GGR")), /*#__PURE__*/React.createElement("span", {
      style: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        fontSize: 11,
        color: 'var(--text-2)'
      }
    }, "Manager share:", /*#__PURE__*/React.createElement("input", {
      type: "number",
      step: "5",
      value: rule.managerSharePct,
      onChange: e => setRules(prev => ({
        ...prev,
        SPORTS: {
          ...prev.SPORTS,
          [g]: {
            ...prev.SPORTS[g],
            managerSharePct: parseFloat(e.target.value) || 0
          }
        }
      })),
      style: {
        width: 55,
        padding: '4px 8px',
        border: '1px solid var(--line-2)',
        fontSize: 11,
        color: 'var(--ink)',
        fontFamily: 'JetBrains Mono, monospace',
        fontWeight: 700,
        textAlign: 'right'
      }
    }), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 9,
        color: 'var(--text-3)'
      }
    }, "%")));
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '8px 14px',
      background: '#FAFBFC',
      fontSize: 10,
      color: 'var(--text-3)',
      fontFamily: 'JetBrains Mono, monospace'
    }
  }, "Changes are local until you press ", /*#__PURE__*/React.createElement("b", {
    style: {
      color: '#15A36C'
    }
  }, "Apply"), ". After Apply, ledger rebuilds and Manager earnings recompute."));
}

// Editable leverage limits per group
function LeverageEditor({
  NAVY
}) {
  const [limits, setLimits] = useState(() => ({
    ...MANAGER.SYSTEM_SETTINGS.leverageLimits
  }));
  function save() {
    MANAGER.SYSTEM_SETTINGS.leverageLimits = {
      ...limits
    };
    alert('Leverage limits saved.');
  }
  function set(g, v) {
    setLimits(prev => ({
      ...prev,
      [g]: parseInt(v) || 1
    }));
  }
  const groups = [{
    g: 'Standard',
    color: '#5A6478'
  }, {
    g: 'Pro',
    color: '#0EA5E9'
  }, {
    g: 'VIP',
    color: '#7C3AED'
  }];
  return /*#__PURE__*/React.createElement("div", {
    style: {
      background: 'var(--surface)',
      border: '1px solid var(--line)',
      marginBottom: 14
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '8px 12px',
      background: NAVY,
      color: 'rgba(255,255,255,0.92)',
      fontSize: 10,
      fontWeight: 700,
      letterSpacing: 0.6,
      textTransform: 'uppercase',
      fontFamily: 'JetBrains Mono, monospace',
      display: 'flex',
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1
    }
  }, "Leverage Limits per Group"), /*#__PURE__*/React.createElement("button", {
    onClick: save,
    style: {
      padding: '4px 10px',
      background: '#22C55E',
      border: 'none',
      color: '#fff',
      fontSize: 10,
      fontWeight: 700,
      letterSpacing: 0.4,
      cursor: 'pointer',
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'Material Symbols Outlined',
      fontSize: 13
    }
  }, "save"), "Apply")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr 1fr',
      padding: '10px 12px',
      gap: 10
    }
  }, groups.map(r => /*#__PURE__*/React.createElement("div", {
    key: r.g,
    style: {
      padding: '12px 14px',
      border: '1px solid var(--line-2)',
      background: '#FAFBFC'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 9.5,
      color: 'var(--text-3)',
      letterSpacing: 0.5,
      fontWeight: 700,
      textTransform: 'uppercase'
    }
  }, r.g), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'baseline',
      gap: 4,
      marginTop: 5
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "mono",
    style: {
      fontSize: 14,
      fontWeight: 700,
      color: r.color
    }
  }, "1:"), /*#__PURE__*/React.createElement("input", {
    type: "number",
    min: "1",
    step: "1",
    value: limits[r.g] || 0,
    onChange: e => set(r.g, e.target.value),
    style: {
      width: 80,
      padding: '4px 8px',
      border: '1px solid var(--line-2)',
      fontSize: 18,
      color: r.color,
      fontFamily: 'JetBrains Mono, monospace',
      fontWeight: 800,
      textAlign: 'left'
    }
  }))))));
}

// Editable risk parameters
function RiskParametersEditor({
  NAVY
}) {
  const [risk, setRisk] = useState(() => ({
    ...MANAGER.SYSTEM_SETTINGS.riskParameters
  }));
  function save() {
    MANAGER.SYSTEM_SETTINGS.riskParameters = {
      ...risk
    };
    alert('Risk parameters saved.');
  }
  function set(k, v) {
    setRisk(prev => ({
      ...prev,
      [k]: parseFloat(v) || 0
    }));
  }
  const fields = [{
    k: 'marginCallPct',
    label: 'Margin Call Level',
    suffix: '%',
    step: 1
  }, {
    k: 'stopOutPct',
    label: 'Stop Out Level',
    suffix: '%',
    step: 1
  }, {
    k: 'maxOpenPositions',
    label: 'Maximum Open Positions',
    suffix: '',
    step: 10
  }, {
    k: 'trailingStopMinPt',
    label: 'Trailing Stop Minimum',
    suffix: 'points',
    step: 1
  }];
  return /*#__PURE__*/React.createElement("div", {
    style: {
      background: 'var(--surface)',
      border: '1px solid var(--line)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '8px 12px',
      background: NAVY,
      color: 'rgba(255,255,255,0.92)',
      fontSize: 10,
      fontWeight: 700,
      letterSpacing: 0.6,
      textTransform: 'uppercase',
      fontFamily: 'JetBrains Mono, monospace',
      display: 'flex',
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1
    }
  }, "Risk Parameters \u2014 editable"), /*#__PURE__*/React.createElement("button", {
    onClick: save,
    style: {
      padding: '4px 10px',
      background: '#22C55E',
      border: 'none',
      color: '#fff',
      fontSize: 10,
      fontWeight: 700,
      letterSpacing: 0.4,
      cursor: 'pointer',
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'Material Symbols Outlined',
      fontSize: 13
    }
  }, "save"), "Apply")), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '4px 14px'
    }
  }, fields.map((f, i) => /*#__PURE__*/React.createElement("div", {
    key: f.k,
    style: {
      display: 'flex',
      alignItems: 'center',
      padding: '10px 0',
      borderTop: i === 0 ? 'none' : '1px solid var(--line)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1,
      fontSize: 12,
      color: 'var(--text-2)'
    }
  }, f.label), /*#__PURE__*/React.createElement("input", {
    type: "number",
    step: f.step,
    value: risk[f.k] || 0,
    onChange: e => set(f.k, e.target.value),
    style: {
      width: 100,
      padding: '6px 10px',
      border: '1px solid var(--line-2)',
      fontSize: 13,
      color: 'var(--ink)',
      fontFamily: 'JetBrains Mono, monospace',
      fontWeight: 700,
      textAlign: 'right'
    }
  }), f.suffix && /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 10,
      color: 'var(--text-3)',
      marginLeft: 6,
      width: 50
    }
  }, f.suffix)))));
}

// Editable trading session hours per category
function TradingSessionsEditor({
  NAVY
}) {
  const [sessions, setSessions] = useState(() => JSON.parse(JSON.stringify(MANAGER.SYSTEM_SETTINGS.tradingSessions)));
  function save() {
    MANAGER.SYSTEM_SETTINGS.tradingSessions = JSON.parse(JSON.stringify(sessions));
    alert('Trading session hours saved.');
  }
  function setField(cat, key, val) {
    setSessions(prev => ({
      ...prev,
      [cat]: {
        ...prev[cat],
        [key]: val
      }
    }));
  }
  function toggleDay(cat, day) {
    setSessions(prev => {
      const cur = prev[cat].days || '';
      const next = cur.includes(day) ? cur.replace(day, '') : cur + day;
      return {
        ...prev,
        [cat]: {
          ...prev[cat],
          days: next
        }
      };
    });
  }
  const cats = ['FX', 'STOCK', 'METAL', 'CRYPTO', 'INDEX'];
  const dayLabels = [['M', 'Mon'], ['T', 'Tue'], ['W', 'Wed'], ['H', 'Thu'], ['F', 'Fri'], ['S', 'Sat'], ['U', 'Sun']];
  return /*#__PURE__*/React.createElement("div", {
    style: {
      background: 'var(--surface)',
      border: '1px solid var(--line)',
      marginBottom: 14
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '8px 12px',
      background: NAVY,
      color: 'rgba(255,255,255,0.92)',
      fontSize: 10,
      fontWeight: 700,
      letterSpacing: 0.6,
      textTransform: 'uppercase',
      fontFamily: 'JetBrains Mono, monospace',
      display: 'flex',
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1
    }
  }, "Trading Session Hours \u2014 when each category is open"), /*#__PURE__*/React.createElement("button", {
    onClick: save,
    style: {
      padding: '4px 10px',
      background: '#22C55E',
      border: 'none',
      color: '#fff',
      fontSize: 10,
      fontWeight: 700,
      letterSpacing: 0.4,
      cursor: 'pointer',
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'Material Symbols Outlined',
      fontSize: 13
    }
  }, "save"), "Apply")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '80px 1fr 110px 110px 50px 1fr',
      background: '#0F1B2D',
      color: 'rgba(255,255,255,0.7)',
      fontSize: 9.5,
      fontWeight: 700,
      letterSpacing: 0.5,
      textTransform: 'uppercase'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      padding: '6px 10px'
    }
  }, "Category"), /*#__PURE__*/React.createElement("span", {
    style: {
      padding: '6px 10px'
    }
  }, "Days"), /*#__PURE__*/React.createElement("span", {
    style: {
      padding: '6px 10px',
      textAlign: 'center'
    }
  }, "Open"), /*#__PURE__*/React.createElement("span", {
    style: {
      padding: '6px 10px',
      textAlign: 'center'
    }
  }, "Close"), /*#__PURE__*/React.createElement("span", {
    style: {
      padding: '6px 10px',
      textAlign: 'center'
    }
  }, "24h"), /*#__PURE__*/React.createElement("span", {
    style: {
      padding: '6px 10px'
    }
  }, "Notes")), cats.map((cat, i) => {
    const s = sessions[cat] || {};
    return /*#__PURE__*/React.createElement("div", {
      key: cat,
      style: {
        display: 'grid',
        gridTemplateColumns: '80px 1fr 110px 110px 50px 1fr',
        padding: '8px 10px',
        fontSize: 11,
        borderBottom: '1px solid #E5E7EB',
        alignItems: 'center',
        background: i % 2 === 1 ? '#F7F9FC' : 'transparent'
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontWeight: 800,
        color: 'var(--ink)',
        letterSpacing: 0.4
      }
    }, cat), /*#__PURE__*/React.createElement("span", {
      style: {
        display: 'inline-flex',
        gap: 3
      }
    }, dayLabels.map(([k, lbl]) => {
      const on = (s.days || '').includes(k);
      return /*#__PURE__*/React.createElement("button", {
        key: k,
        onClick: () => toggleDay(cat, k),
        title: lbl,
        style: {
          width: 24,
          height: 24,
          padding: 0,
          background: on ? NAVY : 'var(--bg)',
          color: on ? '#fff' : 'var(--text-3)',
          border: '1px solid ' + (on ? NAVY : 'var(--line-2)'),
          fontSize: 10,
          fontWeight: 700,
          cursor: 'pointer',
          fontFamily: 'JetBrains Mono, monospace'
        }
      }, k);
    })), /*#__PURE__*/React.createElement("span", {
      style: {
        textAlign: 'center'
      }
    }, /*#__PURE__*/React.createElement("input", {
      type: "time",
      value: s.open || '00:00',
      onChange: e => setField(cat, 'open', e.target.value),
      disabled: s.is24h,
      style: {
        padding: '3px 6px',
        border: '1px solid var(--line-2)',
        fontSize: 11,
        fontFamily: 'JetBrains Mono, monospace',
        textAlign: 'center',
        opacity: s.is24h ? 0.4 : 1
      }
    })), /*#__PURE__*/React.createElement("span", {
      style: {
        textAlign: 'center'
      }
    }, /*#__PURE__*/React.createElement("input", {
      type: "time",
      value: s.close || '23:59',
      onChange: e => setField(cat, 'close', e.target.value),
      disabled: s.is24h,
      style: {
        padding: '3px 6px',
        border: '1px solid var(--line-2)',
        fontSize: 11,
        fontFamily: 'JetBrains Mono, monospace',
        textAlign: 'center',
        opacity: s.is24h ? 0.4 : 1
      }
    })), /*#__PURE__*/React.createElement("span", {
      style: {
        textAlign: 'center'
      }
    }, /*#__PURE__*/React.createElement("input", {
      type: "checkbox",
      checked: !!s.is24h,
      onChange: e => setField(cat, 'is24h', e.target.checked),
      style: {
        cursor: 'pointer'
      }
    })), /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement("input", {
      value: s.notes || '',
      onChange: e => setField(cat, 'notes', e.target.value),
      placeholder: "Notes\u2026",
      style: {
        width: '100%',
        padding: '3px 8px',
        border: '1px solid var(--line-2)',
        fontSize: 10.5,
        color: 'var(--text-2)',
        boxSizing: 'border-box'
      }
    })));
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '7px 14px',
      background: '#FAFBFC',
      fontSize: 9.5,
      color: 'var(--text-3)',
      fontFamily: 'JetBrains Mono, monospace',
      letterSpacing: 0.3
    }
  }, "Day codes: M=Mon \xB7 T=Tue \xB7 W=Wed \xB7 H=Thu \xB7 F=Fri \xB7 S=Sat \xB7 U=Sun. Times are UTC unless noted."));
}

// Editable holiday calendar — add/edit/delete entries
function HolidayCalendarEditor({
  NAVY
}) {
  const [holidays, setHolidays] = useState(() => [...MANAGER.SYSTEM_SETTINGS.holidays]);
  const [editingIdx, setEditingIdx] = useState(null);
  function save() {
    MANAGER.SYSTEM_SETTINGS.holidays = [...holidays];
    alert('Holiday calendar saved.');
  }
  function update(i, key, val) {
    setHolidays(prev => prev.map((h, idx) => idx === i ? {
      ...h,
      [key]: val
    } : h));
  }
  function remove(i) {
    if (!confirm('Remove this holiday?')) return;
    setHolidays(prev => prev.filter((_, idx) => idx !== i));
  }
  function add() {
    const next = [...holidays, {
      date: new Date().toISOString().slice(0, 10),
      name: 'New Holiday',
      categories: 'ALL'
    }];
    setHolidays(next);
    setEditingIdx(next.length - 1);
  }
  // Sort by date for display (don't mutate original)
  const sorted = holidays.map((h, idx) => ({
    ...h,
    _idx: idx
  })).sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  return /*#__PURE__*/React.createElement("div", {
    style: {
      background: 'var(--surface)',
      border: '1px solid var(--line)',
      marginBottom: 14
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '8px 12px',
      background: NAVY,
      color: 'rgba(255,255,255,0.92)',
      fontSize: 10,
      fontWeight: 700,
      letterSpacing: 0.6,
      textTransform: 'uppercase',
      fontFamily: 'JetBrains Mono, monospace',
      display: 'flex',
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1
    }
  }, "Holiday Calendar \u2014 ", holidays.length, " entries"), /*#__PURE__*/React.createElement("button", {
    onClick: add,
    style: {
      padding: '4px 10px',
      background: 'transparent',
      border: '1px solid rgba(255,255,255,0.30)',
      color: '#fff',
      fontSize: 10,
      fontWeight: 700,
      letterSpacing: 0.4,
      cursor: 'pointer',
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4,
      marginRight: 6
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'Material Symbols Outlined',
      fontSize: 12
    }
  }, "add"), "Add"), /*#__PURE__*/React.createElement("button", {
    onClick: save,
    style: {
      padding: '4px 10px',
      background: '#22C55E',
      border: 'none',
      color: '#fff',
      fontSize: 10,
      fontWeight: 700,
      letterSpacing: 0.4,
      cursor: 'pointer',
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'Material Symbols Outlined',
      fontSize: 13
    }
  }, "save"), "Apply")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '130px 1fr 1fr 80px',
      background: '#0F1B2D',
      color: 'rgba(255,255,255,0.7)',
      fontSize: 9.5,
      fontWeight: 700,
      letterSpacing: 0.5,
      textTransform: 'uppercase'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      padding: '6px 10px'
    }
  }, "Date"), /*#__PURE__*/React.createElement("span", {
    style: {
      padding: '6px 10px'
    }
  }, "Holiday"), /*#__PURE__*/React.createElement("span", {
    style: {
      padding: '6px 10px'
    }
  }, "Categories Affected"), /*#__PURE__*/React.createElement("span", {
    style: {
      padding: '6px 10px',
      textAlign: 'right'
    }
  }, "Actions")), sorted.length === 0 ? /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '24px 16px',
      textAlign: 'center',
      color: 'var(--text-3)',
      fontSize: 11.5
    }
  }, "No holidays configured. Click ", /*#__PURE__*/React.createElement("b", null, "Add"), " to create one.") : sorted.map((h, displayIdx) => {
    const i = h._idx;
    const editing = editingIdx === i;
    const isPast = h.date && h.date < new Date().toISOString().slice(0, 10);
    return /*#__PURE__*/React.createElement("div", {
      key: i,
      style: {
        display: 'grid',
        gridTemplateColumns: '130px 1fr 1fr 80px',
        padding: '5px 10px',
        fontSize: 11,
        borderBottom: '1px solid #E5E7EB',
        alignItems: 'center',
        background: editing ? '#FEF3C7' : displayIdx % 2 === 1 ? '#F7F9FC' : 'transparent',
        opacity: isPast ? 0.55 : 1
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        padding: '3px 0'
      }
    }, editing ? /*#__PURE__*/React.createElement("input", {
      type: "date",
      value: h.date || '',
      onChange: e => update(i, 'date', e.target.value),
      style: {
        width: '100%',
        padding: '3px 6px',
        border: '1px solid var(--line-2)',
        fontSize: 11,
        fontFamily: 'JetBrains Mono, monospace',
        boxSizing: 'border-box'
      }
    }) : /*#__PURE__*/React.createElement("span", {
      className: "mono",
      style: {
        color: 'var(--ink)',
        fontWeight: 700
      }
    }, h.date)), /*#__PURE__*/React.createElement("span", {
      style: {
        padding: '3px 6px'
      }
    }, editing ? /*#__PURE__*/React.createElement("input", {
      value: h.name || '',
      onChange: e => update(i, 'name', e.target.value),
      placeholder: "Holiday name",
      style: {
        width: '100%',
        padding: '3px 6px',
        border: '1px solid var(--line-2)',
        fontSize: 11,
        boxSizing: 'border-box'
      }
    }) : /*#__PURE__*/React.createElement("span", {
      style: {
        color: 'var(--ink)'
      }
    }, h.name)), /*#__PURE__*/React.createElement("span", {
      style: {
        padding: '3px 6px'
      }
    }, editing ? /*#__PURE__*/React.createElement("input", {
      value: h.categories || '',
      onChange: e => update(i, 'categories', e.target.value.toUpperCase()),
      placeholder: "ALL or FX,STOCK,\u2026",
      style: {
        width: '100%',
        padding: '3px 6px',
        border: '1px solid var(--line-2)',
        fontSize: 10.5,
        fontFamily: 'JetBrains Mono, monospace',
        boxSizing: 'border-box'
      }
    }) : /*#__PURE__*/React.createElement("span", {
      style: {
        display: 'inline-flex',
        gap: 4,
        flexWrap: 'wrap'
      }
    }, (h.categories || 'ALL').split(',').map(c => /*#__PURE__*/React.createElement("span", {
      key: c,
      style: {
        padding: '1px 6px',
        fontSize: 9.5,
        fontWeight: 700,
        background: c.trim() === 'ALL' ? '#FFE4E6' : '#E5E7EB',
        color: c.trim() === 'ALL' ? '#9F1239' : 'var(--text-2)',
        letterSpacing: 0.3
      }
    }, c.trim())))), /*#__PURE__*/React.createElement("span", {
      style: {
        padding: '3px 6px',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'flex-end',
        gap: 4
      }
    }, /*#__PURE__*/React.createElement("button", {
      onClick: () => setEditingIdx(editing ? null : i),
      title: editing ? 'Done' : 'Edit',
      style: {
        width: 22,
        height: 22,
        padding: 0,
        background: editing ? '#22C55E' : 'var(--bg)',
        color: editing ? '#fff' : 'var(--text-2)',
        border: '1px solid var(--line-2)',
        cursor: 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center'
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: 'Material Symbols Outlined',
        fontSize: 13
      }
    }, editing ? 'check' : 'edit')), /*#__PURE__*/React.createElement("button", {
      onClick: () => remove(i),
      title: "Delete",
      style: {
        width: 22,
        height: 22,
        padding: 0,
        background: '#FFEBEE',
        color: '#C62828',
        border: '1px solid #FECACA',
        cursor: 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center'
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: 'Material Symbols Outlined',
        fontSize: 13
      }
    }, "delete"))));
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '7px 14px',
      background: '#FAFBFC',
      fontSize: 9.5,
      color: 'var(--text-3)',
      fontFamily: 'JetBrains Mono, monospace',
      letterSpacing: 0.3
    }
  }, "Past dates fade. Use ALL to apply to every category, or comma-list: FX, STOCK, METAL, CRYPTO, INDEX"));
}

// Price feed manager — editable list + simulated health + manual failover
function PriceFeedEditor({
  NAVY
}) {
  const [feeds, setFeeds] = useState(() => JSON.parse(JSON.stringify(MANAGER.SYSTEM_SETTINGS.priceFeeds)));
  const [autoFallback, setAutoFallback] = useState(!!MANAGER.SYSTEM_SETTINGS.feedAutoFallback);
  const [editingId, setEditingId] = useState(null);
  const [tick, setTick] = useState(0);

  // Health simulator — every 5s pick a random small disruption
  useEffect(() => {
    const id = setInterval(() => {
      setFeeds(prev => {
        const next = prev.map(f => ({
          ...f,
          latency: f.status === 'down' ? f.latency : Math.max(5, f.latency + Math.round((Math.random() - 0.5) * 8))
        }));
        if (next.length > 0) {
          const liveIdx = next.findIndex(f => f.status === 'live');
          // Simulate ~5% chance per tick that live feed goes down
          if (liveIdx >= 0 && Math.random() < 0.04) {
            next[liveIdx] = {
              ...next[liveIdx],
              status: 'down',
              failureCount: next[liveIdx].failureCount + 1
            };
            // Failover to next enabled non-down
            const failover = next.find(f => f.enabled && f.status !== 'down' && f.id !== next[liveIdx].id);
            if (failover) {
              const fIdx = next.findIndex(f => f.id === failover.id);
              next[fIdx] = {
                ...next[fIdx],
                status: 'live'
              };
              if (MANAGER.ADMIN_ACTIVITY) MANAGER.ADMIN_ACTIVITY.unshift({
                ts: new Date().toISOString().slice(0, 19).replace('T', ' '),
                admin: 'system',
                kind: 'feed_failover',
                target: failover.id,
                detail: `${next[liveIdx].name} timeout → ${failover.name}`
              });
            }
          }
          // Simulate ~3% chance per tick that a down feed recovers
          next.forEach((f, i) => {
            if (f.status === 'down' && Math.random() < 0.05) {
              next[i] = {
                ...f,
                status: 'standby',
                failureCount: 0
              };
              if (autoFallback) {
                // Find current live; if its priority is lower than this one (earlier index), promote this one back
                const curLiveIdx = next.findIndex(x => x.status === 'live');
                if (curLiveIdx > i) {
                  next[curLiveIdx] = {
                    ...next[curLiveIdx],
                    status: 'standby'
                  };
                  next[i] = {
                    ...next[i],
                    status: 'live'
                  };
                  if (MANAGER.ADMIN_ACTIVITY) MANAGER.ADMIN_ACTIVITY.unshift({
                    ts: new Date().toISOString().slice(0, 19).replace('T', ' '),
                    admin: 'system',
                    kind: 'feed_restored',
                    target: f.id,
                    detail: `Auto-fallback: ${f.name} restored as primary`
                  });
                }
              }
            }
          });
        }
        // Persist to MANAGER.SYSTEM_SETTINGS so other components (footer/quotes panel) see same state
        MANAGER.SYSTEM_SETTINGS.priceFeeds = next;
        return next;
      });
      setTick(t => t + 1);
    }, 5000);
    return () => clearInterval(id);
  }, [autoFallback]);
  function save() {
    MANAGER.SYSTEM_SETTINGS.priceFeeds = JSON.parse(JSON.stringify(feeds));
    MANAGER.SYSTEM_SETTINGS.feedAutoFallback = autoFallback;
    alert('Feed configuration saved.');
  }
  function update(id, key, val) {
    setFeeds(prev => prev.map(f => f.id === id ? {
      ...f,
      [key]: val
    } : f));
  }
  function remove(id) {
    if (!confirm('Remove this feed?')) return;
    setFeeds(prev => prev.filter(f => f.id !== id));
  }
  function addFeed() {
    const nextId = 'pf' + (feeds.length + 1);
    setFeeds(prev => [...prev, {
      id: nextId,
      name: 'New Feed',
      endpoint: 'wss://...',
      auth: 'TOKEN',
      categories: 'ALL',
      enabled: true,
      status: 'standby',
      latency: 50,
      failureCount: 0,
      lastTick: null,
      healthIntervalSec: 5,
      failoverThreshold: 3
    }]);
    setEditingId(nextId);
  }
  function move(id, dir) {
    setFeeds(prev => {
      const idx = prev.findIndex(f => f.id === id);
      if (idx < 0) return prev;
      const target = idx + dir;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  }
  function markDown(id) {
    setFeeds(prev => {
      const next = prev.map(f => f.id === id ? {
        ...f,
        status: 'down',
        failureCount: (f.failureCount || 0) + 1
      } : f);
      const downIdx = next.findIndex(f => f.id === id);
      if (downIdx >= 0 && prev[downIdx].status === 'live') {
        const fail = next.find(f => f.enabled && f.status !== 'down' && f.id !== id);
        if (fail) {
          const fIdx = next.findIndex(f => f.id === fail.id);
          next[fIdx] = {
            ...next[fIdx],
            status: 'live'
          };
        }
      }
      MANAGER.SYSTEM_SETTINGS.priceFeeds = next;
      return next;
    });
  }
  function markLive(id) {
    setFeeds(prev => {
      const next = prev.map(f => ({
        ...f,
        status: f.id === id ? 'live' : f.status === 'down' ? 'down' : 'standby'
      }));
      MANAGER.SYSTEM_SETTINGS.priceFeeds = next;
      return next;
    });
  }
  function StatusDot({
    status
  }) {
    const colors = {
      live: '#22C55E',
      standby: '#F59E0B',
      down: '#EF4444'
    };
    return /*#__PURE__*/React.createElement("span", {
      style: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        fontWeight: 700,
        fontSize: 10,
        letterSpacing: 0.4,
        textTransform: 'uppercase',
        color: colors[status] || '#999'
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        width: 8,
        height: 8,
        borderRadius: '50%',
        background: colors[status] || '#999',
        boxShadow: status === 'live' ? '0 0 6px ' + colors[status] : 'none',
        animation: status === 'live' ? 'mgrPulse 1.8s infinite' : 'none'
      }
    }), status);
  }
  return /*#__PURE__*/React.createElement("div", {
    style: {
      background: 'var(--surface)',
      border: '1px solid var(--line)',
      marginBottom: 14
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '8px 12px',
      background: NAVY,
      color: 'rgba(255,255,255,0.92)',
      fontSize: 10,
      fontWeight: 700,
      letterSpacing: 0.6,
      textTransform: 'uppercase',
      fontFamily: 'JetBrains Mono, monospace',
      display: 'flex',
      alignItems: 'center',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1
    }
  }, "Price Feed Sources \u2014 priority + auto-failover"), /*#__PURE__*/React.createElement("label", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 5,
      fontSize: 9.5,
      color: 'rgba(255,255,255,0.85)',
      cursor: 'pointer',
      textTransform: 'none',
      letterSpacing: 0.3
    }
  }, /*#__PURE__*/React.createElement("input", {
    type: "checkbox",
    checked: autoFallback,
    onChange: e => setAutoFallback(e.target.checked)
  }), "Auto-fallback when primary recovers"), /*#__PURE__*/React.createElement("button", {
    onClick: addFeed,
    style: {
      padding: '4px 10px',
      background: 'transparent',
      border: '1px solid rgba(255,255,255,0.30)',
      color: '#fff',
      fontSize: 10,
      fontWeight: 700,
      letterSpacing: 0.4,
      cursor: 'pointer',
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'Material Symbols Outlined',
      fontSize: 12
    }
  }, "add"), "Add"), /*#__PURE__*/React.createElement("button", {
    onClick: save,
    style: {
      padding: '4px 10px',
      background: '#22C55E',
      border: 'none',
      color: '#fff',
      fontSize: 10,
      fontWeight: 700,
      letterSpacing: 0.4,
      cursor: 'pointer',
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'Material Symbols Outlined',
      fontSize: 13
    }
  }, "save"), "Apply")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '40px 1fr 1fr 90px 80px 70px 90px 90px',
      background: '#0F1B2D',
      color: 'rgba(255,255,255,0.7)',
      fontSize: 9.5,
      fontWeight: 700,
      letterSpacing: 0.5,
      textTransform: 'uppercase'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      padding: '5px 8px',
      textAlign: 'center'
    }
  }, "Pri"), /*#__PURE__*/React.createElement("span", {
    style: {
      padding: '5px 8px'
    }
  }, "Name / Endpoint"), /*#__PURE__*/React.createElement("span", {
    style: {
      padding: '5px 8px'
    }
  }, "Categories"), /*#__PURE__*/React.createElement("span", {
    style: {
      padding: '5px 8px',
      textAlign: 'center'
    }
  }, "Status"), /*#__PURE__*/React.createElement("span", {
    style: {
      padding: '5px 8px',
      textAlign: 'right'
    }
  }, "Latency"), /*#__PURE__*/React.createElement("span", {
    style: {
      padding: '5px 8px',
      textAlign: 'right'
    }
  }, "Fails"), /*#__PURE__*/React.createElement("span", {
    style: {
      padding: '5px 8px',
      textAlign: 'center'
    }
  }, "Enabled"), /*#__PURE__*/React.createElement("span", {
    style: {
      padding: '5px 8px',
      textAlign: 'right'
    }
  }, "Actions")), feeds.map((f, i) => {
    const editing = editingId === f.id;
    return /*#__PURE__*/React.createElement("div", {
      key: f.id,
      style: {
        display: 'grid',
        gridTemplateColumns: '40px 1fr 1fr 90px 80px 70px 90px 90px',
        padding: '5px 0',
        fontSize: 11,
        borderBottom: '1px solid #E5E7EB',
        alignItems: 'center',
        background: editing ? '#FEF3C7' : f.status === 'live' ? '#F0FDF4' : i % 2 === 1 ? '#F7F9FC' : 'transparent'
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        textAlign: 'center',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 1
      }
    }, /*#__PURE__*/React.createElement("button", {
      onClick: () => move(f.id, -1),
      disabled: i === 0,
      title: "Move up",
      style: {
        width: 18,
        height: 14,
        padding: 0,
        background: 'transparent',
        border: 'none',
        cursor: i === 0 ? 'default' : 'pointer',
        color: i === 0 ? 'var(--text-3)' : 'var(--text-2)',
        opacity: i === 0 ? 0.4 : 1,
        lineHeight: 1
      }
    }, "\u25B2"), /*#__PURE__*/React.createElement("span", {
      className: "mono",
      style: {
        fontSize: 9,
        fontWeight: 700,
        color: 'var(--text-3)'
      }
    }, i + 1), /*#__PURE__*/React.createElement("button", {
      onClick: () => move(f.id, 1),
      disabled: i === feeds.length - 1,
      title: "Move down",
      style: {
        width: 18,
        height: 14,
        padding: 0,
        background: 'transparent',
        border: 'none',
        cursor: i === feeds.length - 1 ? 'default' : 'pointer',
        color: i === feeds.length - 1 ? 'var(--text-3)' : 'var(--text-2)',
        opacity: i === feeds.length - 1 ? 0.4 : 1,
        lineHeight: 1
      }
    }, "\u25BC")), /*#__PURE__*/React.createElement("span", {
      style: {
        padding: '4px 8px',
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        minWidth: 0
      }
    }, editing ? /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("input", {
      value: f.name,
      onChange: e => update(f.id, 'name', e.target.value),
      placeholder: "Name",
      style: {
        width: '100%',
        padding: '3px 6px',
        border: '1px solid var(--line-2)',
        fontSize: 11,
        fontWeight: 700,
        boxSizing: 'border-box'
      }
    }), /*#__PURE__*/React.createElement("input", {
      value: f.endpoint,
      onChange: e => update(f.id, 'endpoint', e.target.value),
      placeholder: "endpoint",
      style: {
        width: '100%',
        padding: '3px 6px',
        border: '1px solid var(--line-2)',
        fontSize: 10,
        fontFamily: 'JetBrains Mono, monospace',
        color: 'var(--text-3)',
        boxSizing: 'border-box'
      }
    }), /*#__PURE__*/React.createElement("input", {
      value: f.auth || '',
      onChange: e => update(f.id, 'auth', e.target.value),
      placeholder: "auth label",
      style: {
        width: '100%',
        padding: '3px 6px',
        border: '1px solid var(--line-2)',
        fontSize: 10,
        fontFamily: 'JetBrains Mono, monospace',
        color: 'var(--text-3)',
        boxSizing: 'border-box'
      }
    })) : /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("span", {
      style: {
        color: 'var(--ink)',
        fontWeight: 700
      }
    }, f.name), /*#__PURE__*/React.createElement("span", {
      className: "mono",
      style: {
        fontSize: 10,
        color: 'var(--text-3)',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap'
      }
    }, f.endpoint), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 9,
        color: 'var(--text-3)',
        letterSpacing: 0.3
      }
    }, "\uD83D\uDD10 ", f.auth))), /*#__PURE__*/React.createElement("span", {
      style: {
        padding: '4px 8px'
      }
    }, editing ? /*#__PURE__*/React.createElement("input", {
      value: f.categories,
      onChange: e => update(f.id, 'categories', e.target.value.toUpperCase()),
      placeholder: "ALL or FX,STOCK,\u2026",
      style: {
        width: '100%',
        padding: '3px 6px',
        border: '1px solid var(--line-2)',
        fontSize: 10,
        fontFamily: 'JetBrains Mono, monospace',
        boxSizing: 'border-box'
      }
    }) : /*#__PURE__*/React.createElement("span", {
      style: {
        display: 'inline-flex',
        gap: 3,
        flexWrap: 'wrap'
      }
    }, f.categories.split(',').map(c => /*#__PURE__*/React.createElement("span", {
      key: c,
      style: {
        padding: '1px 6px',
        fontSize: 9.5,
        fontWeight: 700,
        background: c.trim() === 'ALL' ? '#EAF2FB' : '#E5E7EB',
        color: c.trim() === 'ALL' ? '#1B3955' : 'var(--text-2)',
        letterSpacing: 0.3
      }
    }, c.trim())))), /*#__PURE__*/React.createElement("span", {
      style: {
        padding: '4px 8px',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center'
      }
    }, /*#__PURE__*/React.createElement(StatusDot, {
      status: f.status
    })), /*#__PURE__*/React.createElement("span", {
      className: "mono",
      style: {
        padding: '4px 8px',
        textAlign: 'right',
        color: f.latency > 100 ? '#EF4444' : f.latency > 50 ? '#F59E0B' : 'var(--text-2)',
        fontWeight: 600
      }
    }, f.status === 'down' ? '—' : f.latency + 'ms'), /*#__PURE__*/React.createElement("span", {
      className: "mono",
      style: {
        padding: '4px 8px',
        textAlign: 'right',
        color: f.failureCount > 0 ? '#EF4444' : 'var(--text-3)'
      }
    }, f.failureCount || 0), /*#__PURE__*/React.createElement("span", {
      style: {
        padding: '4px 8px',
        textAlign: 'center'
      }
    }, /*#__PURE__*/React.createElement("input", {
      type: "checkbox",
      checked: !!f.enabled,
      onChange: e => update(f.id, 'enabled', e.target.checked),
      style: {
        cursor: 'pointer'
      }
    })), /*#__PURE__*/React.createElement("span", {
      style: {
        padding: '4px 8px',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'flex-end',
        gap: 3
      }
    }, f.status !== 'live' && /*#__PURE__*/React.createElement("button", {
      onClick: () => markLive(f.id),
      title: "Activate as primary",
      style: {
        width: 22,
        height: 22,
        padding: 0,
        background: '#22C55E',
        color: '#fff',
        border: 'none',
        cursor: 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center'
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: 'Material Symbols Outlined',
        fontSize: 13
      }
    }, "play_arrow")), f.status !== 'down' && /*#__PURE__*/React.createElement("button", {
      onClick: () => markDown(f.id),
      title: "Mark as down (simulate failure)",
      style: {
        width: 22,
        height: 22,
        padding: 0,
        background: '#FFEBEE',
        color: '#C62828',
        border: '1px solid #FECACA',
        cursor: 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center'
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: 'Material Symbols Outlined',
        fontSize: 13
      }
    }, "power_off")), /*#__PURE__*/React.createElement("button", {
      onClick: () => setEditingId(editing ? null : f.id),
      title: editing ? 'Done' : 'Edit',
      style: {
        width: 22,
        height: 22,
        padding: 0,
        background: editing ? '#22C55E' : 'var(--bg)',
        color: editing ? '#fff' : 'var(--text-2)',
        border: '1px solid var(--line-2)',
        cursor: 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center'
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: 'Material Symbols Outlined',
        fontSize: 13
      }
    }, editing ? 'check' : 'edit')), /*#__PURE__*/React.createElement("button", {
      onClick: () => remove(f.id),
      title: "Delete",
      style: {
        width: 22,
        height: 22,
        padding: 0,
        background: '#FFEBEE',
        color: '#C62828',
        border: '1px solid #FECACA',
        cursor: 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center'
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: 'Material Symbols Outlined',
        fontSize: 13
      }
    }, "delete"))));
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '8px 14px',
      background: '#FAFBFC',
      fontSize: 10,
      color: 'var(--text-3)',
      fontFamily: 'JetBrains Mono, monospace',
      letterSpacing: 0.3,
      display: 'flex',
      alignItems: 'center',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1
    }
  }, "Health check simulates ~4% failure rate per 5s. Use \u23FB to manually test failover."), /*#__PURE__*/React.createElement("span", null, "Active: ", /*#__PURE__*/React.createElement("b", {
    style: {
      color: '#15A36C'
    }
  }, (feeds.find(f => f.status === 'live') || {}).name || '—'))));
}

// === RiskAlertThresholds editor (added to Settings) ===
function RiskAlertThresholdsEditor(props) {
  var NAVY = props.NAVY || '#1B3955';
  var s = React.useState(Object.assign({}, MANAGER.RISK_THRESHOLDS));
  var th = s[0], setTh = s[1];
  function save() {
    MANAGER.RISK_THRESHOLDS = Object.assign({}, th);
    alert('Risk alert thresholds saved.');
  }
  function field(key, val) {
    setTh(function(prev) { var x = Object.assign({}, prev); x[key] = parseFloat(val) || 0; return x; });
  }
  var rows = [
    { k: 'positionLossUsd',      label: 'Position Loss (single position P/L below)', suffix: 'USD', step: 500 },
    { k: 'accountMarginPct',     label: 'Account Margin Level (alarm when below)',   suffix: '%',   step: 5 },
    { k: 'eventLiabilityUsd',    label: 'Sports Event Liability (single side over)', suffix: 'USD', step: 1000 },
    { k: 'pendingWithdrawalUsd', label: 'Pending Withdrawal (large flag over)',      suffix: 'USD', step: 5000 },
    { k: 'clientNetLossUsd',     label: 'Client Net Loss (cumulative over)',         suffix: 'USD', step: 1000 }
  ];
  return React.createElement('div', { style: { background:'var(--surface)', border:'1px solid var(--line)', marginBottom:14 } },
    React.createElement('div', { style: { padding:'8px 12px', background: NAVY, color:'rgba(255,255,255,0.92)', fontSize:10, fontWeight:700, letterSpacing:0.6, textTransform:'uppercase', fontFamily:'JetBrains Mono, monospace', display:'flex', alignItems:'center' } },
      React.createElement('span', { style:{flex:1, display:'inline-flex', alignItems:'center', gap:6} },
        React.createElement('span', { style:{fontFamily:'Material Symbols Outlined', fontSize:13, color:'#FBBF24'} }, 'warning'),
        'Risk Alert Thresholds'
      ),
      React.createElement('button', {
        onClick: save,
        style: { padding:'4px 10px', background:'#22C55E', border:'none', color:'#fff', fontSize:10, fontWeight:700, letterSpacing:0.4, cursor:'pointer', display:'inline-flex', alignItems:'center', gap:4 }
      },
        React.createElement('span', { style:{fontFamily:'Material Symbols Outlined', fontSize:13} }, 'save'),
        'Apply'
      )
    ),
    React.createElement('div', { style: { padding:'4px 14px' } },
      rows.map(function(r, i) {
        return React.createElement('div', {
          key: r.k,
          style: { display:'flex', alignItems:'center', padding:'10px 0', borderTop: i === 0 ? 'none' : '1px solid var(--line)' }
        },
          React.createElement('span', { style: { flex:1, fontSize:12, color:'var(--text-2)' } }, r.label),
          React.createElement('input', {
            type:'number', step: r.step, min:0,
            value: th[r.k] || 0,
            onChange: function(e){ field(r.k, e.target.value); },
            style: { width:120, padding:'6px 10px', border:'1px solid var(--line-2)', fontSize:13, color:'var(--ink)', fontFamily:'JetBrains Mono, monospace', fontWeight:700, textAlign:'right' }
          }),
          React.createElement('span', { style: { fontSize:10, color:'var(--text-3)', marginLeft:6, width:50 } }, r.suffix)
        );
      })
    ),
    React.createElement('div', { style: { padding:'8px 14px', background:'#FAFBFC', fontSize:10, color:'var(--text-3)', fontFamily:'JetBrains Mono, monospace', borderTop:'1px solid var(--line)' } },
      'Footer badge polls every 5s. Click warning icon for alert list.'
    )
  );
}

function SystemSettingsScreen({
  quotesOpen,
  setQuotesOpen
}) {
  const [markup, setMarkup] = useState({
    ...MANAGER.SYSTEM_SETTINGS.spreadMarkup
  });
  const [savedAt, setSavedAt] = useState(null);
  function save() {
    MANAGER.SYSTEM_SETTINGS.spreadMarkup = {
      ...markup
    };
    setSavedAt(new Date().toLocaleTimeString());
  }
  const NAVY = '#1B3955';
  const categories = [{
    id: 'FX',
    label: 'Forex',
    symbols: ['EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'USDCHF', 'USDCAD'],
    unit: 'pips',
    color: '#0EA5E9'
  }, {
    id: 'METAL',
    label: 'Metals',
    symbols: ['XAUUSD', 'XAGUSD'],
    unit: 'pips',
    color: '#B45309'
  }, {
    id: 'STOCK',
    label: 'Stocks',
    symbols: ['AAPL', 'TSLA', 'NVDA'],
    unit: 'cents',
    color: '#7C3AED'
  }, {
    id: 'CRYPTO',
    label: 'Crypto',
    symbols: ['BTCUSD', 'ETHUSD'],
    unit: 'points',
    color: '#F59E0B'
  }, {
    id: 'INDEX',
    label: 'Indices',
    symbols: ['US30', 'NAS100', 'SPX500'],
    unit: 'points',
    color: '#15A36C'
  }];
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      flex: 1,
      minHeight: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      padding: '10px 14px',
      minHeight: 50,
      background: 'var(--surface)',
      borderBottom: '1px solid var(--line)',
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      lineHeight: 1.15,
      marginRight: 6
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 14,
      fontWeight: 800,
      color: 'var(--ink)',
      letterSpacing: 0.3
    }
  }, "System Settings"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 10,
      color: 'var(--text-3)',
      fontFamily: 'JetBrains Mono, monospace'
    }
  }, "Broker-side parameters \xB7 applies to all clients")), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1
    }
  }), savedAt && /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 10,
      color: '#15A36C',
      fontWeight: 700
    }
  }, "\u2713 Saved at ", savedAt), /*#__PURE__*/React.createElement("button", {
    onClick: save,
    style: {
      padding: '6px 14px',
      background: NAVY,
      border: 'none',
      color: '#fff',
      fontSize: 11,
      fontWeight: 700,
      cursor: 'pointer',
      display: 'inline-flex',
      alignItems: 'center',
      gap: 5,
      letterSpacing: 0.4
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'Material Symbols Outlined',
      fontSize: 14
    }
  }, "save"), "Save Changes")), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      overflowY: 'auto',
      padding: '14px',
      background: 'var(--bg)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      background: 'var(--surface)',
      border: '1px solid var(--line)',
      marginBottom: 14
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '8px 12px',
      background: NAVY,
      color: 'rgba(255,255,255,0.92)',
      fontSize: 10,
      fontWeight: 700,
      letterSpacing: 0.6,
      textTransform: 'uppercase',
      fontFamily: 'JetBrains Mono, monospace'
    }
  }, "Spread Markup \u2014 applied per category, on top of raw spread"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '140px 200px 1fr 100px',
      background: '#0F1B2D',
      color: 'rgba(255,255,255,0.7)',
      fontSize: 9.5,
      fontWeight: 700,
      letterSpacing: 0.5,
      textTransform: 'uppercase'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      padding: '6px 12px'
    }
  }, "Category"), /*#__PURE__*/React.createElement("span", {
    style: {
      padding: '6px 12px'
    }
  }, "Markup"), /*#__PURE__*/React.createElement("span", {
    style: {
      padding: '6px 12px'
    }
  }, "Applies to"), /*#__PURE__*/React.createElement("span", {
    style: {
      padding: '6px 12px',
      textAlign: 'right'
    }
  }, "Unit")), categories.map((c, i) => {
    const m = markup[c.id] || 0;
    return /*#__PURE__*/React.createElement("div", {
      key: c.id,
      style: {
        display: 'grid',
        gridTemplateColumns: '140px 200px 1fr 100px',
        padding: '11px 12px',
        fontSize: 12,
        borderBottom: '1px solid #E5E7EB',
        alignItems: 'center',
        background: i % 2 === 1 ? '#F7F9FC' : 'transparent'
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        width: 9,
        height: 9,
        borderRadius: 2,
        background: c.color,
        flexShrink: 0
      }
    }), /*#__PURE__*/React.createElement("span", {
      style: {
        color: 'var(--ink)',
        fontWeight: 700,
        letterSpacing: 0.3
      }
    }, c.label), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 9.5,
        color: 'var(--text-3)',
        fontFamily: 'JetBrains Mono, monospace',
        fontWeight: 700
      }
    }, c.id)), /*#__PURE__*/React.createElement("span", {
      style: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6
      }
    }, /*#__PURE__*/React.createElement("input", {
      type: "number",
      step: "0.1",
      value: m,
      onChange: e => setMarkup({
        ...markup,
        [c.id]: parseFloat(e.target.value) || 0
      }),
      style: {
        width: 90,
        padding: '6px 10px',
        border: '1px solid var(--line-2)',
        fontSize: 13,
        color: 'var(--ink)',
        fontFamily: 'JetBrains Mono, monospace',
        fontWeight: 700,
        textAlign: 'center'
      }
    }), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 11,
        color: m > 0 ? '#B45309' : 'var(--text-3)',
        fontWeight: 600
      }
    }, m > 0 ? '+' : '', m.toFixed(1))), /*#__PURE__*/React.createElement("span", {
      style: {
        color: 'var(--text-2)',
        fontSize: 11,
        fontFamily: 'JetBrains Mono, monospace'
      }
    }, c.symbols.join(' · ')), /*#__PURE__*/React.createElement("span", {
      style: {
        textAlign: 'right',
        fontSize: 10,
        color: 'var(--text-3)',
        fontWeight: 700,
        letterSpacing: 0.4,
        textTransform: 'uppercase'
      }
    }, c.unit));
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '10px 14px',
      background: '#FAFBFC',
      borderTop: '1px solid var(--line)',
      fontSize: 10.5,
      color: 'var(--text-3)',
      fontFamily: 'JetBrains Mono, monospace'
    }
  }, "Total markup applied: ", /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--ink)',
      fontWeight: 700
    }
  }, Object.values(markup).reduce((s, v) => s + (v || 0), 0).toFixed(1), " pts/pips combined"))), /*#__PURE__*/React.createElement(LeverageEditor, {
    NAVY: NAVY
  }), /*#__PURE__*/React.createElement(CommissionEditor, {
    NAVY: NAVY
  }), /*#__PURE__*/React.createElement(PriceFeedEditor, {
    NAVY: NAVY
  }), /*#__PURE__*/React.createElement(TradingSessionsEditor, {
    NAVY: NAVY
  }), /*#__PURE__*/React.createElement(HolidayCalendarEditor, {
    NAVY: NAVY
  }), /*#__PURE__*/React.createElement(RiskParametersEditor, {
    NAVY: NAVY
  }), /*#__PURE__*/React.createElement(RiskAlertThresholdsEditor, {
    NAVY: NAVY
  }), /*#__PURE__*/React.createElement(AccessControlEditor, {
    NAVY: NAVY
  })));
}

// Live quotes panel — left side, with category tabs and markup adjusters
const QUOTE_SYMBOLS = [{
  sym: 'EURUSD',
  name: 'Euro / US Dollar',
  cat: 'FX',
  base: 1.08405,
  digits: 5,
  spread: 0.8
}, {
  sym: 'GBPUSD',
  name: 'British Pound / USD',
  cat: 'FX',
  base: 1.26855,
  digits: 5,
  spread: 1.0
}, {
  sym: 'USDJPY',
  name: 'US Dollar / Yen',
  cat: 'FX',
  base: 156.325,
  digits: 3,
  spread: 1.2
}, {
  sym: 'AUDUSD',
  name: 'Australian / US Dollar',
  cat: 'FX',
  base: 0.66094,
  digits: 5,
  spread: 1.4
}, {
  sym: 'USDCHF',
  name: 'US Dollar / Swiss Franc',
  cat: 'FX',
  base: 0.91049,
  digits: 5,
  spread: 1.2
}, {
  sym: 'USDCAD',
  name: 'US Dollar / Canadian',
  cat: 'FX',
  base: 1.36357,
  digits: 5,
  spread: 1.5
}, {
  sym: 'XAUUSD',
  name: 'Gold Spot',
  cat: 'METAL',
  base: 2348.40,
  digits: 2,
  spread: 18.0
}, {
  sym: 'XAGUSD',
  name: 'Silver Spot',
  cat: 'METAL',
  base: 30.410,
  digits: 3,
  spread: 25.0
}, {
  sym: 'AAPL',
  name: 'Apple Inc.',
  cat: 'STOCK',
  base: 218.39,
  digits: 2,
  spread: 3.0
}, {
  sym: 'TSLA',
  name: 'Tesla Inc.',
  cat: 'STOCK',
  base: 246.89,
  digits: 2,
  spread: 4.0
}, {
  sym: 'NVDA',
  name: 'NVIDIA Corp.',
  cat: 'STOCK',
  base: 924.37,
  digits: 2,
  spread: 8.0
}, {
  sym: 'BTCUSD',
  name: 'Bitcoin / USD',
  cat: 'CRYPTO',
  base: 62418.50,
  digits: 2,
  spread: 15.0
}, {
  sym: 'ETHUSD',
  name: 'Ethereum / USD',
  cat: 'CRYPTO',
  base: 3142.18,
  digits: 2,
  spread: 2.5
}, {
  sym: 'US30',
  name: 'Dow Jones 30',
  cat: 'INDEX',
  base: 38942.18,
  digits: 2,
  spread: 5.0
}, {
  sym: 'NAS100',
  name: 'NASDAQ 100',
  cat: 'INDEX',
  base: 17284.62,
  digits: 2,
  spread: 4.0
}, {
  sym: 'SPX500',
  name: 'S&P 500',
  cat: 'INDEX',
  base: 5128.45,
  digits: 2,
  spread: 3.5
}];
function FeedStatusBadge() {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, []);
  const feed = (MANAGER.SYSTEM_SETTINGS.priceFeeds || []).find(f => f.status === 'live');
  if (!feed) {
    return /*#__PURE__*/React.createElement("span", {
      style: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        fontSize: 9,
        fontWeight: 700,
        color: '#B91C1C',
        padding: '1px 5px',
        background: '#FEE2E2'
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        width: 5,
        height: 5,
        borderRadius: '50%',
        background: '#EF4444'
      }
    }), "NO FEED");
  }
  return /*#__PURE__*/React.createElement("span", {
    title: `Feed: ${feed.name} · ${feed.endpoint}`,
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4,
      fontSize: 9,
      fontWeight: 700,
      color: '#15A36C',
      padding: '1px 5px',
      background: '#E8F5E9'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 5,
      height: 5,
      borderRadius: '50%',
      background: '#22C55E',
      animation: 'mgrPulse 1.8s infinite'
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      maxWidth: 80,
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap'
    }
  }, feed.name), /*#__PURE__*/React.createElement("span", {
    style: {
      color: '#15803D',
      fontWeight: 600
    }
  }, feed.latency, "ms"));
}

// Live Markets panel — clean grid alignment, all cells match columns
function SportsMarketsPanel({
  server,
  setServer,
  onClose
}) {
  const [sportFilter, setSportFilter] = useState('NBA');
  const [search, setSearch] = useState('');
  const [tick, setTick] = useState(0);
  const [marginAdj, setMarginAdj] = useState({});
  const [boxAdj, setBoxAdj] = useState({}); // key: eventId-side-market → odds shift (points)
  const [boxSuspended, setBoxSuspended] = useState({}); // key: eventId-side-market → bool
  const [selectedBox, setSelectedBox] = useState(null); // {eventId, side, market}
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 2000);
    return () => clearInterval(id);
  }, []);
  function boxKey(eventId, side, market) {
    return `${eventId}-${side}-${market}`;
  }
  function shiftBox(eventId, side, market, delta) {
    const k = boxKey(eventId, side, market);
    setBoxAdj(prev => ({
      ...prev,
      [k]: (prev[k] || 0) + delta
    }));
  }
  function toggleBoxSuspend(eventId, side, market) {
    const k = boxKey(eventId, side, market);
    setBoxSuspended(prev => ({
      ...prev,
      [k]: !prev[k]
    }));
  }
  function resetBox(eventId, side, market) {
    const k = boxKey(eventId, side, market);
    setBoxAdj(prev => {
      const n = {
        ...prev
      };
      delete n[k];
      return n;
    });
    setBoxSuspended(prev => {
      const n = {
        ...prev
      };
      delete n[k];
      return n;
    });
  }
  function isSel(eventId, side, market) {
    return selectedBox && selectedBox.eventId === eventId && selectedBox.side === side && selectedBox.market === market;
  }
  function fmtAmerican(odds) {
    if (odds === undefined || odds === null || odds === 0) return '—';
    return odds > 0 ? `+${odds}` : `${odds}`;
  }
  function adjustOdds(base, margin, boxOffset) {
    if (!base || !base.odds) return base;
    const m = margin || 0;
    const boxShift = boxOffset || 0;
    // Both event margin and box shift now apply ±1 = ±1 American point uniformly
    return {
      ...base,
      odds: Math.round(base.odds - m - boxShift)
    };
  }
  let events = MANAGER.SPORTS_EVENTS;
  if (sportFilter !== 'ALL') events = events.filter(e => e.sport === sportFilter);
  if (search) {
    const q = search.toLowerCase();
    events = events.filter(e => e.homeTeam.toLowerCase().includes(q) || e.awayTeam.toLowerCase().includes(q));
  }
  const sports = [{
    id: 'ALL',
    icon: 'sports',
    color: '#1B3955'
  }, {
    id: 'NBA',
    icon: 'sports_basketball',
    color: '#EA580C'
  }, {
    id: 'NFL',
    icon: 'sports_football',
    color: '#7C2D12'
  }, {
    id: 'MLB',
    icon: 'sports_baseball',
    color: '#1E40AF'
  }, {
    id: 'NHL',
    icon: 'sports_hockey',
    color: '#0F766E'
  }];

  // Shared grid template — used for header AND rows so everything aligns
  const GRID = '95px 1fr 1fr 1fr';
  // Each bet box: rectangular outlined card
  const boxStyle = {
    margin: '3px 4px',
    padding: '5px 4px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    lineHeight: 1.15,
    minWidth: 0,
    background: '#fff',
    border: '1px solid #D1D5DB',
    borderRadius: 4,
    transition: 'all .12s',
    cursor: 'default'
  };
  return /*#__PURE__*/React.createElement("div", {
    style: {
      width: 340,
      flexShrink: 0,
      background: 'var(--surface)',
      borderRight: '1px solid var(--line)',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden'
    }
  },
  // ─── Server selector at top ───
  setServer && /*#__PURE__*/React.createElement("div", {
    style: { display:'flex', alignItems:'center', padding:'6px 8px', background:'var(--surface)', borderBottom:'1px solid var(--line)', gap:1 }
  },
    SERVERS.map(function(srv) {
      var active = server === srv.id;
      return /*#__PURE__*/React.createElement("button", {
        key: srv.id,
        onClick: function(){ setServer(srv.id); },
        title: srv.sub,
        style: {
          flex:1, display:'inline-flex', alignItems:'center', justifyContent:'center', gap:4,
          padding:'5px 0', height:24,
          background: active ? '#5A6478' : 'transparent',
          color: active ? '#fff' : 'var(--text-2)',
          border:'none', borderRadius:3,
          fontSize:9.5, fontWeight:700, letterSpacing:0.4, textTransform:'uppercase',
          cursor:'pointer', transition:'background .12s, color .12s'
        },
        onMouseEnter: function(e){ if (!active) { e.currentTarget.style.background='var(--bg-2)'; e.currentTarget.style.color='var(--ink)'; } },
        onMouseLeave: function(e){ if (!active) { e.currentTarget.style.background='transparent'; e.currentTarget.style.color='var(--text-2)'; } }
      },
        /*#__PURE__*/React.createElement("span", { style:{ fontFamily:'Material Symbols Outlined', fontSize:12, fontVariationSettings: active ? "'FILL' 1" : "'FILL' 0" } }, srv.icon),
        srv.label
      );
    })
  ),
  /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      padding: '10px 12px',
      gap: 6,
      borderBottom: '1px solid var(--line)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'Material Symbols Outlined',
      fontSize: 16,
      color: '#1B3955'
    }
  }, "sports"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 13,
      fontWeight: 800,
      color: 'var(--ink)',
      flex: 1,
      letterSpacing: 0.4
    }
  }, "Live Markets"), /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4,
      fontSize: 9,
      fontWeight: 700,
      color: '#15A36C',
      padding: '1px 5px',
      background: '#E8F5E9'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 5,
      height: 5,
      borderRadius: '50%',
      background: '#22C55E',
      animation: 'mgrPulse 1.8s infinite'
    }
  }), "LIVE")), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '8px 10px',
      borderBottom: '1px solid var(--line)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 5,
      padding: '4px 8px',
      background: 'var(--bg)',
      border: '1px solid var(--line-2)',
      height: 26
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'Material Symbols Outlined',
      fontSize: 13,
      color: 'var(--text-3)'
    }
  }, "search"), /*#__PURE__*/React.createElement("input", {
    value: search,
    onChange: e => setSearch(e.target.value),
    placeholder: "Team or game\u2026",
    style: {
      flex: 1,
      fontSize: 10.5,
      color: 'var(--ink)',
      background: 'transparent',
      outline: 'none',
      border: 'none'
    }
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(5, 1fr)',
      borderBottom: '1px solid var(--line)',
      background: '#FAFBFC'
    }
  }, sports.map(s => {
    const active = sportFilter === s.id;
    return /*#__PURE__*/React.createElement("button", {
      key: s.id,
      onClick: () => setSportFilter(s.id),
      style: {
        padding: '8px 0',
        background: active ? 'var(--surface)' : 'transparent',
        color: active ? s.color : 'var(--text-3)',
        border: 'none',
        cursor: 'pointer',
        fontSize: 9.5,
        fontWeight: active ? 800 : 600,
        fontFamily: 'JetBrains Mono, monospace',
        letterSpacing: 0.4,
        borderBottom: active ? `2px solid ${s.color}` : '2px solid transparent',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 2
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: 'Material Symbols Outlined',
        fontSize: 16
      }
    }, s.icon), s.id);
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: GRID,
      background: '#FAFBFC',
      borderBottom: '1px solid var(--line)',
      fontSize: 8.5,
      fontWeight: 700,
      color: 'var(--text-3)',
      letterSpacing: 0.5,
      textTransform: 'uppercase'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      padding: '6px 8px'
    }
  }, "Team"), /*#__PURE__*/React.createElement("span", {
    style: {
      padding: '6px 0',
      textAlign: 'center'
    }
  }, "Spread"), /*#__PURE__*/React.createElement("span", {
    style: {
      padding: '6px 0',
      textAlign: 'center'
    }
  }, "Total"), /*#__PURE__*/React.createElement("span", {
    style: {
      padding: '6px 0',
      textAlign: 'center'
    }
  }, "Moneyline")), /*#__PURE__*/React.createElement("div", {
    onClick: () => setSelectedBox(null),
    style: {
      flex: 1,
      overflowY: 'auto'
    }
  }, events.map(ev => {
    const margin = marginAdj[ev.id] || 0;
    const sportColor = (sports.find(s => s.id === ev.sport) || {}).color || '#1B3955';
    const isLive = ev.status === 'live';
    return /*#__PURE__*/React.createElement("div", {
      key: ev.id,
      style: {
        borderBottom: '1px solid #E5E7EB',
        background: isLive ? '#FFF7ED' : 'transparent'
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '5px 8px 4px',
        gap: 5,
        fontSize: 9.5
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        fontFamily: 'JetBrains Mono, monospace'
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 9,
        fontWeight: 800,
        color: sportColor,
        letterSpacing: 0.5
      }
    }, ev.sport), isLive && /*#__PURE__*/React.createElement("span", {
      style: {
        padding: '0 4px',
        fontSize: 8,
        fontWeight: 800,
        color: '#fff',
        background: '#EA580C',
        letterSpacing: 0.3
      }
    }, "LIVE"), /*#__PURE__*/React.createElement("span", {
      style: {
        color: 'var(--text-3)'
      }
    }, isLive ? `${ev.scoreAway}–${ev.scoreHome}` : ev.start.slice(5, 16).replace(' ', ' · '))), /*#__PURE__*/React.createElement("span", {
      style: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: 3
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 8,
        color: 'var(--text-3)',
        letterSpacing: 0.4,
        fontWeight: 700
      }
    }, "MARGIN"), /*#__PURE__*/React.createElement("button", {
      onClick: () => setMarginAdj(p => ({
        ...p,
        [ev.id]: (p[ev.id] || 0) - 1
      })),
      style: {
        width: 18,
        height: 16,
        padding: 0,
        background: 'var(--bg)',
        border: '1px solid var(--line-2)',
        fontSize: 10,
        fontWeight: 800,
        cursor: 'pointer',
        color: 'var(--text-2)',
        lineHeight: 1
      }
    }, "\u2212"), /*#__PURE__*/React.createElement("span", {
      className: "mono",
      style: {
        fontSize: 9.5,
        fontWeight: 700,
        color: margin !== 0 ? '#B45309' : 'var(--text-3)',
        minWidth: 24,
        textAlign: 'center'
      }
    }, margin > 0 ? '+' : '', margin), /*#__PURE__*/React.createElement("button", {
      onClick: () => setMarginAdj(p => ({
        ...p,
        [ev.id]: (p[ev.id] || 0) + 1
      })),
      style: {
        width: 18,
        height: 16,
        padding: 0,
        background: 'var(--bg)',
        border: '1px solid var(--line-2)',
        fontSize: 10,
        fontWeight: 800,
        cursor: 'pointer',
        color: 'var(--text-2)',
        lineHeight: 1
      }
    }, "+"))), [{
      abbr: ev.awayAbbr,
      name: ev.awayTeam,
      side: 'away'
    }, {
      abbr: ev.homeAbbr,
      name: ev.homeTeam,
      side: 'home'
    }].map((t, ti) => {
      const sp = adjustOdds(ev.spread[t.side], margin, boxAdj[boxKey(ev.id, t.side, 'spread')]);
      const tot = adjustOdds(t.side === 'away' ? ev.total.over : ev.total.under, margin, boxAdj[boxKey(ev.id, t.side, 'total')]);
      const ml = adjustOdds(ev.moneyline[t.side], margin, boxAdj[boxKey(ev.id, t.side, 'ml')]);
      return /*#__PURE__*/React.createElement("div", {
        key: ti,
        style: {
          display: 'grid',
          gridTemplateColumns: GRID,
          alignItems: 'center'
        }
      }, /*#__PURE__*/React.createElement("span", {
        style: {
          padding: '6px 8px',
          display: 'flex',
          alignItems: 'center',
          gap: 5,
          minWidth: 0
        }
      }, /*#__PURE__*/React.createElement("span", {
        style: {
          padding: '1px 5px',
          fontSize: 8.5,
          fontWeight: 800,
          color: 'var(--text-2)',
          background: '#E5E7EB',
          letterSpacing: 0.3
        }
      }, t.abbr), /*#__PURE__*/React.createElement("span", {
        style: {
          fontSize: 11,
          color: 'var(--ink)',
          fontWeight: 600,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis'
        }
      }, t.name)), ['spread', 'total', 'ml'].map(market => {
        const v = market === 'spread' ? sp : market === 'total' ? tot : ml;
        const sel = isSel(ev.id, t.side, market);
        const sus = boxSuspended[boxKey(ev.id, t.side, market)];
        const shift = boxAdj[boxKey(ev.id, t.side, market)] || 0;
        const labelTop = market === 'spread' ? (sp.line > 0 ? '+' : '') + sp.line : market === 'total' ? (t.side === 'away' ? 'Over ' : 'Under ') + ev.total.line : 'ML';
        return /*#__PURE__*/React.createElement("div", {
          key: market,
          onClick: e => {
            e.stopPropagation();
            setSelectedBox(sel ? null : {
              eventId: ev.id,
              side: t.side,
              market
            });
          },
          style: {
            ...boxStyle,
            cursor: 'pointer',
            background: sus ? '#F3F4F6' : sel ? '#EAF2FB' : '#fff',
            border: sel ? '2px solid #1B3955' : '1px solid #D1D5DB',
            opacity: sus ? 0.55 : 1,
            position: 'relative',
            padding: sel ? '4px 3px' : '5px 4px'
          }
        }, sus && /*#__PURE__*/React.createElement("span", {
          style: {
            position: 'absolute',
            top: 2,
            right: 3,
            fontSize: 8,
            fontWeight: 800,
            color: '#9F1239',
            letterSpacing: 0.3
          }
        }, "OFF"), shift !== 0 && !sus && /*#__PURE__*/React.createElement("span", {
          style: {
            position: 'absolute',
            top: 1,
            right: 3,
            fontSize: 8,
            fontWeight: 800,
            color: '#B45309'
          }
        }, shift > 0 ? '+' : '', shift), /*#__PURE__*/React.createElement("span", {
          className: "mono",
          style: {
            fontSize: 9.5,
            color: 'var(--text-3)',
            fontWeight: 600
          }
        }, labelTop), /*#__PURE__*/React.createElement("span", {
          className: "mono",
          style: {
            fontSize: 11,
            fontWeight: 800,
            color: v.odds > 0 ? '#15803D' : 'var(--ink)',
            textDecoration: sus ? 'line-through' : 'none'
          }
        }, fmtAmerican(v.odds)), sel && /*#__PURE__*/React.createElement("div", {
          style: {
            marginTop: 3,
            paddingTop: 3,
            borderTop: '1px solid rgba(27,57,85,0.20)',
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
            width: '100%',
            alignItems: 'center'
          }
        }, /*#__PURE__*/React.createElement("div", {
          style: {
            display: 'inline-flex',
            alignItems: 'center',
            gap: 3
          }
        }, /*#__PURE__*/React.createElement("button", {
          onClick: e => {
            e.stopPropagation();
            shiftBox(ev.id, t.side, market, -1);
          },
          title: "\u22121 point",
          style: {
            width: 22,
            height: 18,
            padding: 0,
            background: '#fff',
            border: '1px solid #1B3955',
            color: '#1B3955',
            fontSize: 13,
            fontWeight: 800,
            cursor: 'pointer',
            lineHeight: 1
          }
        }, "\u2212"), /*#__PURE__*/React.createElement("button", {
          onClick: e => {
            e.stopPropagation();
            shiftBox(ev.id, t.side, market, +1);
          },
          title: "+1 point",
          style: {
            width: 22,
            height: 18,
            padding: 0,
            background: '#1B3955',
            border: '1px solid #1B3955',
            color: '#fff',
            fontSize: 13,
            fontWeight: 800,
            cursor: 'pointer',
            lineHeight: 1
          }
        }, "+")), /*#__PURE__*/React.createElement("div", {
          style: {
            display: 'inline-flex',
            alignItems: 'center',
            gap: 3
          }
        }, /*#__PURE__*/React.createElement("button", {
          onClick: e => {
            e.stopPropagation();
            toggleBoxSuspend(ev.id, t.side, market);
          },
          title: sus ? 'Resume' : 'Suspend',
          style: {
            width: 20,
            height: 16,
            padding: 0,
            background: sus ? '#22C55E' : '#9CA3AF',
            color: '#fff',
            border: 'none',
            fontSize: 9,
            fontWeight: 800,
            cursor: 'pointer',
            lineHeight: 1,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center'
          }
        }, /*#__PURE__*/React.createElement("span", {
          style: {
            fontFamily: 'Material Symbols Outlined',
            fontSize: 11
          }
        }, sus ? 'play_arrow' : 'pause')), (shift !== 0 || sus) && /*#__PURE__*/React.createElement("button", {
          onClick: e => {
            e.stopPropagation();
            resetBox(ev.id, t.side, market);
          },
          title: "Reset",
          style: {
            width: 20,
            height: 16,
            padding: 0,
            background: 'transparent',
            color: 'var(--text-2)',
            border: '1px solid var(--line-2)',
            fontSize: 9,
            fontWeight: 700,
            cursor: 'pointer',
            lineHeight: 1,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center'
          }
        }, /*#__PURE__*/React.createElement("span", {
          style: {
            fontFamily: 'Material Symbols Outlined',
            fontSize: 11
          }
        }, "refresh")))));
      }));
    }));
  }), events.length === 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '20px 10px',
      textAlign: 'center',
      color: 'var(--text-3)',
      fontSize: 10.5
    }
  }, "No games match.")), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '6px 10px',
      borderTop: '1px solid var(--line)',
      background: '#FAFBFC',
      display: 'flex',
      alignItems: 'center',
      gap: 6
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 8.5,
      color: 'var(--text-3)',
      letterSpacing: 0.4,
      fontWeight: 700
    }
  }, "HANDLE"), /*#__PURE__*/React.createElement("div", {
    className: "mono",
    style: {
      fontSize: 11,
      fontWeight: 700,
      color: 'var(--ink)'
    }
  }, "$", MANAGER.fmt(MANAGER.SPORTS_BETS.filter(b => b.status === 'open').reduce((s, b) => s + (b.stake || 0), 0), 0))), /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: 'right'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 8.5,
      color: 'var(--text-3)',
      letterSpacing: 0.4,
      fontWeight: 700
    }
  }, "LIABILITY"), /*#__PURE__*/React.createElement("div", {
    className: "mono",
    style: {
      fontSize: 11,
      fontWeight: 700,
      color: '#EF4444'
    }
  }, "$", MANAGER.fmt(MANAGER.SPORTS_BETS.filter(b => b.status === 'open').reduce((s, b) => s + (b.potential || 0), 0), 0)))));
}
function QuotesPanel({
  server,
  setServer,
  onClose
}) {
  // Auto-select category based on current server
  const defaultCat = server === 'CRYPTO' ? 'CRYPTO' : 'ALL';
  const [cat, setCat] = useState(defaultCat);
  // When server changes, auto-switch category
  React.useEffect(function(){
    setCat(server === 'CRYPTO' ? 'CRYPTO' : 'ALL');
  }, [server]);
  const [search, setSearch] = useState('');
  const [markupAdj, setMarkupAdj] = useState({}); // sym → extra markup
  const [editingId, setEditingId] = useState(null);
  const [editValue, setEditValue] = useState('');
  // Live ticking prices
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, []);
  // Compute drift per symbol — tiny random walk based on tick
  function priceFor(s) {
    const drift = Math.sin((tick + s.sym.charCodeAt(0)) / 7) * 0.0008 + Math.cos((tick + s.sym.charCodeAt(1)) / 11) * 0.0004;
    const rawBid = s.base * (1 + drift);
    const markup = markupAdj[s.sym] || 0;
    const pip = Math.pow(10, -s.digits);
    // Markup widens the spread symmetrically — broker pulls bid down + ask up
    const bid = rawBid - markup / 2 * pip;
    const ask = rawBid + (s.spread + markup / 2) * pip;
    const dir = drift >= 0 ? 'up' : 'down';
    return {
      bid,
      ask,
      dir
    };
  }
  function setMarkup(sym, v) {
    const n = parseFloat(v) || 0;
    setMarkupAdj(prev => ({
      ...prev,
      [sym]: n
    }));
  }
  function resetMarkup() {
    setMarkupAdj({});
  }
  let rows = QUOTE_SYMBOLS;
  if (cat !== 'ALL') rows = rows.filter(s => s.cat === cat);
  if (search) rows = rows.filter(s => s.sym.toLowerCase().includes(search.toLowerCase()) || s.name.toLowerCase().includes(search.toLowerCase()));
  const totalMarkup = Object.values(markupAdj).reduce((s, v) => s + (v || 0), 0);
  const cats = server === 'CRYPTO' ? ['CRYPTO'] : server === 'FX' ? ['ALL', 'FX', 'STOCK', 'INDEX', 'METAL'] : ['ALL', 'FX', 'STOCK', 'CRYPTO', 'INDEX', 'METAL'];
  return /*#__PURE__*/React.createElement("div", {
    style: {
      width: 320,
      flexShrink: 0,
      background: 'var(--surface)',
      borderRight: '1px solid var(--line)',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden'
    }
  },
  // ─── Server selector at top of quotes panel ───
  setServer && /*#__PURE__*/React.createElement("div", {
    style: { display:'flex', alignItems:'center', padding:'6px 8px', background:'var(--surface)', borderBottom:'1px solid var(--line)', gap:1 }
  },
    SERVERS.map(function(srv) {
      var active = server === srv.id;
      return /*#__PURE__*/React.createElement("button", {
        key: srv.id,
        onClick: function(){ setServer(srv.id); },
        title: srv.sub,
        style: {
          flex:1,
          display:'inline-flex', alignItems:'center', justifyContent:'center', gap:4,
          padding:'5px 0', height:24,
          background: active ? '#5A6478' : 'transparent',
          color: active ? '#fff' : 'var(--text-2)',
          border: 'none', borderRadius: 3,
          fontSize: 9.5, fontWeight: 700, letterSpacing: 0.4, textTransform:'uppercase',
          cursor: 'pointer', transition: 'background .12s, color .12s'
        },
        onMouseEnter: function(e){ if (!active) { e.currentTarget.style.background = 'var(--bg-2)'; e.currentTarget.style.color = 'var(--ink)'; } },
        onMouseLeave: function(e){ if (!active) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-2)'; } }
      },
        /*#__PURE__*/React.createElement("span", { style:{ fontFamily:'Material Symbols Outlined', fontSize:12, fontVariationSettings: active ? "'FILL' 1" : "'FILL' 0" } }, srv.icon),
        srv.label
      );
    })
  ),
  /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      padding: '10px 12px',
      gap: 6,
      borderBottom: '1px solid var(--line)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'Material Symbols Outlined',
      fontSize: 16,
      color: 'var(--text-2)'
    }
  }, server === 'CRYPTO' ? "currency_bitcoin" : "candlestick_chart"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 13,
      fontWeight: 700,
      color: 'var(--ink)',
      flex: 1,
      letterSpacing: 0.3
    }
  }, server === 'CRYPTO' ? "Crypto Markets" : "Live Quotes"), /*#__PURE__*/React.createElement(FeedStatusBadge, null)), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '8px 10px',
      borderBottom: '1px solid var(--line)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 5,
      padding: '4px 8px',
      background: 'var(--bg)',
      border: '1px solid var(--line-2)',
      height: 26
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'Material Symbols Outlined',
      fontSize: 13,
      color: 'var(--text-3)'
    }
  }, "search"), /*#__PURE__*/React.createElement("input", {
    value: search,
    onChange: e => setSearch(e.target.value),
    placeholder: "Search\u2026",
    style: {
      flex: 1,
      fontSize: 10.5,
      color: 'var(--ink)',
      background: 'transparent',
      outline: 'none',
      border: 'none'
    }
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      borderBottom: '1px solid var(--line)',
      background: '#FAFBFC',
      overflowX: 'auto'
    }
  }, cats.map(k => {
    const active = cat === k;
    return /*#__PURE__*/React.createElement("button", {
      key: k,
      onClick: () => setCat(k),
      style: {
        flex: '1 0 auto',
        padding: '8px 10px',
        minWidth: 48,
        background: active ? 'var(--surface)' : 'transparent',
        color: active ? '#1B3955' : 'var(--text-3)',
        border: 'none',
        cursor: 'pointer',
        fontSize: 10,
        fontWeight: active ? 800 : 600,
        fontFamily: 'JetBrains Mono, monospace',
        letterSpacing: 0.4,
        borderBottom: active ? '2px solid #1B3955' : '2px solid transparent',
        transition: 'all .12s'
      }
    }, k);
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 90px 48px 64px',
      padding: '7px 12px',
      background: '#FAFBFC',
      borderBottom: '1px solid var(--line)',
      fontSize: 8.5,
      fontWeight: 700,
      color: 'var(--text-3)',
      letterSpacing: 0.5,
      textTransform: 'uppercase',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("span", null, "Symbol"), /*#__PURE__*/React.createElement("span", {
    style: {
      textAlign: 'right'
    }
  }, "Bid"), /*#__PURE__*/React.createElement("span", {
    style: {
      textAlign: 'center'
    }
  }, "Spr"), /*#__PURE__*/React.createElement("span", {
    style: {
      textAlign: 'center'
    }
  }, "Markup")), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      overflowY: 'auto'
    }
  }, rows.map(s => {
    const {
      bid,
      ask,
      dir
    } = priceFor(s);
    const adj = markupAdj[s.sym] || 0;
    const effSpread = s.spread + adj;
    const spreadUnit = s.cat === 'CRYPTO' || s.cat === 'INDEX' ? 'pt' : 'p';
    const spreadHot = effSpread >= s.spread * 2;
    return /*#__PURE__*/React.createElement("div", {
      key: s.sym,
      style: {
        display: 'grid',
        gridTemplateColumns: '1fr 90px 48px 64px',
        padding: '10px 12px',
        borderBottom: '1px solid #F0F2F5',
        alignItems: 'center',
        fontSize: 10.5,
        gap: 8
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        minWidth: 0
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 5
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontWeight: 700,
        color: 'var(--ink)',
        fontSize: 11
      }
    }, s.sym), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 8,
        fontWeight: 700,
        color: 'var(--text-3)',
        padding: '0 4px',
        background: 'var(--bg)',
        letterSpacing: 0.3
      }
    }, s.cat)), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 9,
        color: 'var(--text-3)',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis'
      }
    }, s.name)), /*#__PURE__*/React.createElement("div", {
      className: "mono",
      style: {
        textAlign: 'right'
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: 2,
        color: dir === 'up' ? '#15803D' : '#B91C1C',
        fontWeight: 700
      }
    }, /*#__PURE__*/React.createElement("svg", {
      width: "8",
      height: "8",
      viewBox: "0 0 24 24",
      fill: "currentColor",
      style: {
        flexShrink: 0
      }
    }, dir === 'up' ? /*#__PURE__*/React.createElement("path", {
      d: "M7 14l5-5 5 5z"
    }) : /*#__PURE__*/React.createElement("path", {
      d: "M7 10l5 5 5-5z"
    })), bid.toFixed(s.digits)), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 8.5,
        color: 'var(--text-3)'
      }
    }, ask.toFixed(s.digits))), /*#__PURE__*/React.createElement("div", {
      className: "mono",
      style: {
        textAlign: 'center',
        fontSize: 10,
        fontWeight: 700,
        color: spreadHot ? '#B45309' : 'var(--text-2)',
        background: spreadHot ? '#FEF3C7' : 'transparent',
        padding: '1px 2px'
      }
    }, effSpread.toFixed(1), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 8,
        color: 'var(--text-3)',
        marginLeft: 1
      }
    }, spreadUnit)), /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 2
      }
    }, /*#__PURE__*/React.createElement("button", {
      onClick: () => setMarkup(s.sym, (adj - 0.1).toFixed(1)),
      title: "Decrease",
      style: {
        width: 16,
        height: 18,
        padding: 0,
        background: 'var(--bg)',
        border: '1px solid var(--line-2)',
        fontSize: 11,
        fontWeight: 800,
        color: 'var(--text-2)',
        cursor: 'pointer',
        lineHeight: 1
      }
    }, "\u2212"), /*#__PURE__*/React.createElement("span", {
      className: "mono",
      style: {
        flex: 1,
        textAlign: 'center',
        fontSize: 9.5,
        fontWeight: 700,
        color: adj !== 0 ? '#B45309' : 'var(--text-3)'
      }
    }, adj > 0 ? '+' : '', adj.toFixed(1)), /*#__PURE__*/React.createElement("button", {
      onClick: () => setMarkup(s.sym, (adj + 0.1).toFixed(1)),
      title: "Increase",
      style: {
        width: 16,
        height: 18,
        padding: 0,
        background: 'var(--bg)',
        border: '1px solid var(--line-2)',
        fontSize: 11,
        fontWeight: 800,
        color: 'var(--text-2)',
        cursor: 'pointer',
        lineHeight: 1
      }
    }, "+")));
  }), rows.length === 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '20px 10px',
      textAlign: 'center',
      color: 'var(--text-3)',
      fontSize: 10.5
    }
  }, "No symbols match.")), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '6px 10px',
      borderTop: '1px solid var(--line)',
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      background: '#FAFBFC'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 8.5,
      color: 'var(--text-3)',
      letterSpacing: 0.4,
      fontWeight: 700
    }
  }, "TOTAL MARKUP"), /*#__PURE__*/React.createElement("div", {
    className: "mono",
    style: {
      fontSize: 11,
      fontWeight: 700,
      color: totalMarkup > 0 ? '#B45309' : 'var(--text-2)'
    }
  }, totalMarkup > 0 ? '+' : '', totalMarkup.toFixed(1), " pt")), /*#__PURE__*/React.createElement("button", {
    onClick: resetMarkup,
    style: {
      padding: '4px 8px',
      background: 'var(--bg)',
      border: '1px solid var(--line-2)',
      fontSize: 10,
      color: 'var(--text-2)',
      cursor: 'pointer',
      display: 'inline-flex',
      alignItems: 'center',
      gap: 3,
      fontWeight: 600
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'Material Symbols Outlined',
      fontSize: 12
    }
  }, "refresh"), "Reset")));
}
function ManagersScreen({
  quotesOpen,
  setQuotesOpen
}) {
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState('total');
  const [sortDir, setSortDir] = useState('desc');
  const [detailId, setDetailId] = useState(null);
  const [adding, setAdding] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);
  function addManager(data) {
    const nextNum = MANAGER.MANAGERS.length + 1;
    const id = 'm' + String(nextNum).padStart(3, '0');
    MANAGER.MANAGERS.push({
      id,
      name: data.name,
      email: data.email,
      role: data.role,
      joined: new Date().toISOString().slice(0, 10),
      country: data.country
    });
    if (!MANAGER.MANAGER_ASSIGNMENTS.byManager) MANAGER.MANAGER_ASSIGNMENTS.byManager = {};
    MANAGER.MANAGER_ASSIGNMENTS.byManager[id] = [];
    if (MANAGER.ADMIN_ACTIVITY) MANAGER.ADMIN_ACTIVITY.unshift({
      ts: new Date().toISOString().slice(0, 19).replace('T', ' '),
      admin: 'admin@alpexa.com',
      kind: 'manager_add',
      target: id,
      detail: `Added ${data.name} (${data.role})`
    });
    setAdding(false);
    setRefreshTick(t => t + 1);
  }
  function toggleSort(k) {
    if (sortKey === k) setSortDir(d => d === 'asc' ? 'desc' : 'asc');else {
      setSortKey(k);
      setSortDir(['total', 'rebate', 'commission', 'clients', 'volume'].includes(k) ? 'desc' : 'asc');
    }
  }

  // Compute manager rows with stats
  let rows = MANAGER.MANAGERS.map(m => {
    const earnings = MANAGER.earningsFor(m.id);
    const clientIds = MANAGER.MANAGER_ASSIGNMENTS.byManager?.[m.id] || [];
    const clients = clientIds.map(cid => MANAGER.findClient(cid)).filter(Boolean);
    const onlineCount = clients.filter(c => c.online).length;
    const positions = MANAGER.POSITIONS.filter(p => clientIds.includes(p.clientId));
    const totalVolume = positions.reduce((s, p) => s + (p.vol || p.volume || 0), 0);
    return {
      ...m,
      earnings,
      clientCount: clients.length,
      onlineCount,
      positions: positions.length,
      totalVolume
    };
  });
  if (search) {
    const q = search.toLowerCase();
    rows = rows.filter(r => r.name.toLowerCase().includes(q) || r.email.toLowerCase().includes(q) || r.role.toLowerCase().includes(q));
  }
  const dir = sortDir === 'asc' ? 1 : -1;
  rows = [...rows].sort((a, b) => {
    switch (sortKey) {
      case 'name':
        return a.name.localeCompare(b.name) * dir;
      case 'role':
        return a.role.localeCompare(b.role) * dir;
      case 'clients':
        return (a.clientCount - b.clientCount) * dir;
      case 'online':
        return (a.onlineCount - b.onlineCount) * dir;
      case 'volume':
        return (a.totalVolume - b.totalVolume) * dir;
      case 'commission':
        return (a.earnings.brokerCommission - b.earnings.brokerCommission) * dir;
      case 'rebate':
        return (a.earnings.managerRebate - b.earnings.managerRebate) * dir;
      case 'total':
        return (a.earnings.total - b.earnings.total) * dir;
      default:
        return 0;
    }
  });
  const totalSystem = rows.reduce((s, r) => s + r.earnings.total, 0);
  const totalRebate = rows.reduce((s, r) => s + r.earnings.managerRebate, 0);
  const totalCommission = rows.reduce((s, r) => s + r.earnings.brokerCommission, 0);
  const NAVY = '#1B3955',
    NAVY_HI = '#234A6E';
  function Arrow({
    a,
    d
  }) {
    if (!a) return /*#__PURE__*/React.createElement("svg", {
      width: "8",
      height: "10",
      viewBox: "0 0 24 24",
      fill: "rgba(255,255,255,0.35)",
      style: {
        marginLeft: 4
      }
    }, /*#__PURE__*/React.createElement("path", {
      d: "M7 9l5-5 5 5z M7 15l5 5 5-5z"
    }));
    return /*#__PURE__*/React.createElement("svg", {
      width: "9",
      height: "9",
      viewBox: "0 0 24 24",
      fill: "#5BB0FF",
      style: {
        marginLeft: 4
      }
    }, d === 'asc' ? /*#__PURE__*/React.createElement("path", {
      d: "M7 14l5-5 5 5z"
    }) : /*#__PURE__*/React.createElement("path", {
      d: "M7 10l5 5 5-5z"
    }));
  }
  const cols = [{
    k: 'name',
    l: 'Manager',
    w: 230,
    a: 'left',
    s: true
  }, {
    k: 'role',
    l: 'Role',
    w: 150,
    a: 'left',
    s: true
  }, {
    k: 'clients',
    l: 'Clients',
    w: 90,
    a: 'right',
    s: true
  }, {
    k: 'online',
    l: 'Online',
    w: 80,
    a: 'right',
    s: true
  }, {
    k: 'volume',
    l: 'Volume (lots)',
    w: 120,
    a: 'right',
    s: true
  }, {
    k: 'commission',
    l: 'Broker Comm.',
    w: 130,
    a: 'right',
    s: true
  }, {
    k: 'rebate',
    l: 'Manager Rebate',
    w: 140,
    a: 'right',
    s: true
  }, {
    k: 'markup',
    l: 'Markup Share',
    w: 120,
    a: 'right'
  }, {
    k: 'total',
    l: 'Total Earned',
    w: 140,
    a: 'right',
    s: true
  }];
  const grid = cols.map(c => `${c.w}px`).join(' ');
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      flex: 1,
      minHeight: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      padding: '10px 14px',
      minHeight: 50,
      background: 'var(--surface)',
      borderBottom: '1px solid var(--line)',
      flexShrink: 0,
      flexWrap: 'wrap'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      lineHeight: 1.15,
      marginRight: 6
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 14,
      fontWeight: 800,
      color: 'var(--ink)',
      letterSpacing: 0.3
    }
  }, "Managers & Commissions"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 10,
      color: 'var(--text-3)',
      fontFamily: 'JetBrains Mono, monospace'
    }
  }, rows.length, " managers \xB7 Total system earnings $", MANAGER.fmt(totalSystem, 0), " (broker $", MANAGER.fmt(totalCommission, 0), " / rebate $", MANAGER.fmt(totalRebate, 0), ")")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 5,
      padding: '5px 9px',
      background: 'var(--bg)',
      border: '1px solid var(--line-2)',
      width: 220,
      height: 28
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'Material Symbols Outlined',
      fontSize: 14,
      color: 'var(--text-3)'
    }
  }, "search"), /*#__PURE__*/React.createElement("input", {
    value: search,
    onChange: e => setSearch(e.target.value),
    placeholder: "Search manager\u2026",
    style: {
      flex: 1,
      fontSize: 11,
      color: 'var(--ink)',
      background: 'transparent',
      outline: 'none',
      border: 'none'
    }
  })), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1
    }
  }), /*#__PURE__*/React.createElement("button", {
    onClick: () => setAdding(true),
    style: {
      padding: '6px 12px',
      background: '#1B3955',
      border: 'none',
      color: '#fff',
      fontSize: 11,
      fontWeight: 700,
      cursor: 'pointer',
      display: 'inline-flex',
      alignItems: 'center',
      gap: 5,
      letterSpacing: 0.4
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'Material Symbols Outlined',
      fontSize: 14
    }
  }, "person_add"), "Add Manager")), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      overflowY: 'auto',
      background: 'var(--surface)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: grid,
      background: NAVY,
      color: 'rgba(255,255,255,0.92)',
      fontSize: 10,
      fontWeight: 700,
      letterSpacing: 0.6,
      textTransform: 'uppercase',
      fontFamily: 'JetBrains Mono, Roboto Mono, monospace',
      position: 'sticky',
      top: 0,
      zIndex: 5,
      borderTop: `1px solid ${NAVY_HI}`,
      borderBottom: '1px solid #0F1B2D'
    }
  }, cols.map(col => /*#__PURE__*/React.createElement("span", {
    key: col.k,
    onClick: col.s ? () => toggleSort(col.k) : undefined,
    style: {
      padding: '7px 10px',
      borderRight: '1px solid rgba(255,255,255,0.12)',
      cursor: col.s ? 'pointer' : 'default',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: col.a === 'right' ? 'flex-end' : col.a === 'left' ? 'flex-start' : 'center',
      background: sortKey === col.k ? 'rgba(91,176,255,0.10)' : 'transparent'
    }
  }, col.l, col.s && /*#__PURE__*/React.createElement(Arrow, {
    a: sortKey === col.k,
    d: sortDir
  })))), rows.map((r, i) => /*#__PURE__*/React.createElement("div", {
    key: r.id,
    onClick: () => setDetailId(r.id),
    style: {
      display: 'grid',
      gridTemplateColumns: grid,
      fontSize: 11.5,
      borderBottom: '1px solid #E5E7EB',
      background: i % 2 === 1 ? '#F7F9FC' : 'transparent',
      cursor: 'pointer'
    },
    onMouseEnter: e => {
      e.currentTarget.style.background = '#F4F7FB';
    },
    onMouseLeave: e => {
      e.currentTarget.style.background = i % 2 === 1 ? '#F7F9FC' : 'transparent';
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      padding: '9px 10px',
      display: 'inline-flex',
      alignItems: 'center',
      gap: 8,
      color: 'var(--text-2)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 24,
      height: 24,
      borderRadius: 12,
      background: NAVY,
      color: '#fff',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: 10,
      fontWeight: 800,
      letterSpacing: 0.3,
      flexShrink: 0
    }
  }, r.name.split(' ').map(s => s[0]).join('').slice(0, 2)), /*#__PURE__*/React.createElement("span", {
    style: {
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      color: 'var(--ink)',
      fontWeight: 600
    }
  }, r.name), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 9.5,
      color: 'var(--text-3)',
      fontFamily: 'JetBrains Mono, monospace'
    }
  }, r.email))), /*#__PURE__*/React.createElement("span", {
    style: {
      padding: '9px 10px',
      display: 'inline-flex',
      alignItems: 'center',
      color: 'var(--text-2)',
      fontSize: 11
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      padding: '2px 8px',
      fontSize: 9.5,
      fontWeight: 700,
      background: '#EAF2FB',
      color: NAVY,
      letterSpacing: 0.4
    }
  }, r.role)), /*#__PURE__*/React.createElement("span", {
    className: "mono",
    style: {
      padding: '9px 10px',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'flex-end',
      color: 'var(--ink)',
      fontWeight: 600
    }
  }, r.clientCount), /*#__PURE__*/React.createElement("span", {
    style: {
      padding: '9px 10px',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'flex-end',
      gap: 4
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 7,
      height: 7,
      borderRadius: '50%',
      background: r.onlineCount > 0 ? '#22C55E' : '#CBD5E1',
      boxShadow: r.onlineCount > 0 ? '0 0 4px #22C55E' : 'none'
    }
  }), /*#__PURE__*/React.createElement("span", {
    className: "mono",
    style: {
      color: 'var(--ink)',
      fontWeight: 700
    }
  }, r.onlineCount)), /*#__PURE__*/React.createElement("span", {
    className: "mono",
    style: {
      padding: '9px 10px',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'flex-end',
      color: 'var(--text-2)'
    }
  }, r.totalVolume.toFixed(2)), /*#__PURE__*/React.createElement("span", {
    className: "mono",
    style: {
      padding: '9px 10px',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'flex-end',
      color: 'var(--text-2)'
    }
  }, "$", MANAGER.fmt(r.earnings.brokerCommission, 2)), /*#__PURE__*/React.createElement("span", {
    className: "mono",
    style: {
      padding: '9px 10px',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'flex-end',
      color: '#B45309',
      fontWeight: 600
    }
  }, "$", MANAGER.fmt(r.earnings.managerRebate, 2)), /*#__PURE__*/React.createElement("span", {
    className: "mono",
    style: {
      padding: '9px 10px',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'flex-end',
      color: '#7C3AED'
    }
  }, "$", MANAGER.fmt(r.earnings.markupShare, 2)), /*#__PURE__*/React.createElement("span", {
    className: "mono",
    style: {
      padding: '9px 10px',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'flex-end',
      color: '#15A36C',
      fontWeight: 800,
      fontSize: 12.5
    }
  }, "$", MANAGER.fmt(r.earnings.total, 2)))), rows.length === 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '40px 16px',
      textAlign: 'center',
      color: 'var(--text-3)',
      fontSize: 12
    }
  }, "No managers match the search.")), detailId && /*#__PURE__*/React.createElement(ManagerDetailDrawer, {
    managerId: detailId,
    onClose: () => {
      setDetailId(null);
      setRefreshTick(t => t + 1);
    }
  }), adding && /*#__PURE__*/React.createElement(AddManagerModal, {
    onClose: () => setAdding(false),
    onAdd: addManager
  }));
}
function AddManagerModal({
  onClose,
  onAdd
}) {
  const [form, setForm] = useState({
    name: '',
    email: '',
    role: 'Account Manager',
    country: 'CH'
  });
  const valid = form.name.trim() && form.email.trim() && /@/.test(form.email);
  const fld = {
    width: '100%',
    padding: '8px 10px',
    border: '1px solid var(--line-2)',
    fontSize: 13,
    color: 'var(--ink)',
    background: 'var(--surface)',
    fontFamily: 'inherit',
    boxSizing: 'border-box'
  };
  return /*#__PURE__*/React.createElement("div", {
    onClick: onClose,
    style: {
      position: 'fixed',
      inset: 0,
      background: 'rgba(15,23,41,0.55)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 300,
      padding: 20
    }
  }, /*#__PURE__*/React.createElement("div", {
    onClick: e => e.stopPropagation(),
    style: {
      background: '#fff',
      width: 480,
      maxWidth: '92vw',
      boxShadow: '0 24px 60px rgba(15,23,41,0.30)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '14px 18px',
      background: '#1B3955',
      color: '#fff',
      display: 'flex',
      alignItems: 'center',
      gap: 10
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'Material Symbols Outlined',
      fontSize: 18
    }
  }, "person_add"), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1,
      fontWeight: 800,
      letterSpacing: 0.3
    }
  }, "Add New Manager"), /*#__PURE__*/React.createElement("button", {
    onClick: onClose,
    style: {
      width: 26,
      height: 26,
      background: 'rgba(255,255,255,0.10)',
      border: 'none',
      cursor: 'pointer',
      color: '#fff',
      fontSize: 16
    }
  }, "\xD7")), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '16px 18px',
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 12
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      gridColumn: '1 / 3'
    }
  }, /*#__PURE__*/React.createElement(ModalLabel, null, "Full Name *"), /*#__PURE__*/React.createElement("input", {
    autoFocus: true,
    value: form.name,
    onChange: e => setForm({
      ...form,
      name: e.target.value
    }),
    placeholder: "e.g. David Mueller",
    style: fld
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      gridColumn: '1 / 3'
    }
  }, /*#__PURE__*/React.createElement(ModalLabel, null, "Email *"), /*#__PURE__*/React.createElement("input", {
    value: form.email,
    onChange: e => setForm({
      ...form,
      email: e.target.value
    }),
    placeholder: "d.mueller@alpexa.ch",
    style: fld
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(ModalLabel, null, "Role"), /*#__PURE__*/React.createElement("select", {
    value: form.role,
    onChange: e => setForm({
      ...form,
      role: e.target.value
    }),
    style: fld
  }, /*#__PURE__*/React.createElement("option", null, "Senior Manager"), /*#__PURE__*/React.createElement("option", null, "Account Manager"), /*#__PURE__*/React.createElement("option", null, "IB Partner"), /*#__PURE__*/React.createElement("option", null, "Broker"), /*#__PURE__*/React.createElement("option", null, "Compliance"))), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(ModalLabel, null, "Country (ISO-2)"), /*#__PURE__*/React.createElement("input", {
    maxLength: "2",
    value: form.country,
    onChange: e => setForm({
      ...form,
      country: e.target.value.toUpperCase()
    }),
    style: fld
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '12px 18px',
      display: 'flex',
      justifyContent: 'flex-end',
      gap: 8,
      borderTop: '1px solid var(--line)'
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: onClose,
    style: {
      padding: '8px 14px',
      background: 'var(--bg)',
      border: '1px solid var(--line-2)',
      color: 'var(--text-2)',
      fontSize: 12,
      fontWeight: 600,
      cursor: 'pointer'
    }
  }, "Cancel"), /*#__PURE__*/React.createElement("button", {
    onClick: () => valid && onAdd(form),
    disabled: !valid,
    style: {
      padding: '8px 18px',
      background: valid ? '#1B3955' : '#9AA3B2',
      color: '#fff',
      border: 'none',
      fontSize: 12,
      fontWeight: 700,
      letterSpacing: 0.4,
      cursor: valid ? 'pointer' : 'not-allowed',
      display: 'inline-flex',
      alignItems: 'center',
      gap: 5
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'Material Symbols Outlined',
      fontSize: 14
    }
  }, "save"), "Create Manager"))));
}
function ManagerDetailDrawer({
  managerId,
  onClose
}) {
  const orig = MANAGER.MANAGERS.find(x => x.id === managerId);
  if (!orig) return null;
  const [edited, setEdited] = useState({
    ...orig
  });
  const [savedAt, setSavedAt] = useState(null);
  const m = edited;
  const earnings = MANAGER.earningsFor(m.id);
  const clientIds = MANAGER.MANAGER_ASSIGNMENTS.byManager?.[m.id] || [];
  const clients = clientIds.map(cid => MANAGER.findClient(cid)).filter(Boolean);
  const positions = MANAGER.POSITIONS.filter(p => clientIds.includes(p.clientId));
  const NAVY = '#1B3955';
  function updateField(k, v) {
    setEdited(prev => ({
      ...prev,
      [k]: v
    }));
  }
  function saveProfile() {
    const idx = MANAGER.MANAGERS.findIndex(x => x.id === managerId);
    if (idx >= 0) MANAGER.MANAGERS[idx] = {
      ...edited
    };
    if (MANAGER.ADMIN_ACTIVITY) MANAGER.ADMIN_ACTIVITY.unshift({
      ts: new Date().toISOString().slice(0, 19).replace('T', ' '),
      admin: 'admin@alpexa.com',
      kind: 'manager_edit',
      target: managerId,
      detail: `Profile updated: ${edited.name} · ${edited.role}`
    });
    setSavedAt(new Date().toLocaleTimeString());
  }
  function removeManager() {
    if (!confirm('Remove this manager? Their assigned clients will be unassigned.')) return;
    const idx = MANAGER.MANAGERS.findIndex(x => x.id === managerId);
    if (idx >= 0) MANAGER.MANAGERS.splice(idx, 1);
    // Remove from assignments
    (MANAGER.MANAGER_ASSIGNMENTS.byManager[managerId] || []).forEach(cid => {
      delete MANAGER.MANAGER_ASSIGNMENTS.byClient[cid];
    });
    delete MANAGER.MANAGER_ASSIGNMENTS.byManager[managerId];
    // Remove from commission rules
    Object.keys(MANAGER.COMMISSION_RULES).forEach(g => {
      MANAGER.COMMISSION_RULES[g].managerRebates = (MANAGER.COMMISSION_RULES[g].managerRebates || []).filter(r => r.managerId !== managerId);
    });
    onClose();
  }
  const fld = {
    width: '100%',
    padding: '5px 8px',
    background: 'rgba(255,255,255,0.10)',
    color: '#fff',
    border: '1px solid rgba(255,255,255,0.20)',
    fontSize: 13,
    fontFamily: 'inherit',
    outline: 'none'
  };
  const fldSm = {
    ...fld,
    fontSize: 11,
    fontFamily: 'JetBrains Mono, monospace'
  };

  // Per-group breakdown
  const breakdown = {};
  clientIds.forEach(cid => {
    const accs = MANAGER.findAccounts(cid);
    accs.forEach(a => {
      const g = a.group || 'Standard';
      if (!breakdown[g]) breakdown[g] = {
        clients: new Set(),
        accounts: 0,
        equity: 0
      };
      breakdown[g].clients.add(cid);
      breakdown[g].accounts += 1;
      breakdown[g].equity += (a.equity || 0) * usdRate(a.currency);
    });
  });
  return /*#__PURE__*/React.createElement("div", {
    onClick: onClose,
    style: {
      position: 'fixed',
      inset: 0,
      background: 'rgba(15,23,41,0.5)',
      zIndex: 150,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 20
    }
  }, /*#__PURE__*/React.createElement("div", {
    onClick: e => e.stopPropagation(),
    style: {
      width: 720,
      maxWidth: '92vw',
      maxHeight: '92vh',
      background: 'var(--surface)',
      boxShadow: '0 24px 60px rgba(15,23,41,0.30)',
      overflowY: 'auto',
      display: 'flex',
      flexDirection: 'column'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '18px 22px',
      background: NAVY,
      color: '#fff',
      display: 'flex',
      alignItems: 'flex-start',
      gap: 12
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 42,
      height: 42,
      borderRadius: 21,
      background: 'rgba(255,255,255,0.15)',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: 13,
      fontWeight: 800,
      letterSpacing: 0.4,
      flexShrink: 0
    }
  }, m.name.split(' ').map(s => s[0]).join('').slice(0, 2)), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0,
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 6
    }
  }, /*#__PURE__*/React.createElement("input", {
    value: m.name,
    onChange: e => updateField('name', e.target.value),
    placeholder: "Full name",
    style: {
      ...fld,
      fontSize: 15,
      fontWeight: 800,
      letterSpacing: 0.3,
      gridColumn: '1 / 3'
    }
  }), /*#__PURE__*/React.createElement("input", {
    value: m.email,
    onChange: e => updateField('email', e.target.value),
    placeholder: "email@\u2026",
    style: fldSm
  }), /*#__PURE__*/React.createElement("input", {
    value: m.role,
    onChange: e => updateField('role', e.target.value),
    placeholder: "Role",
    style: fldSm
  }), /*#__PURE__*/React.createElement("input", {
    value: m.joined,
    onChange: e => updateField('joined', e.target.value),
    placeholder: "YYYY-MM-DD",
    style: fldSm
  }), /*#__PURE__*/React.createElement("input", {
    value: m.country,
    onChange: e => updateField('country', e.target.value.toUpperCase().slice(0, 2)),
    placeholder: "CH",
    maxLength: "2",
    style: fldSm
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 4,
      alignItems: 'flex-end'
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: onClose,
    style: {
      width: 28,
      height: 28,
      background: 'rgba(255,255,255,0.10)',
      border: 'none',
      cursor: 'pointer',
      color: '#fff',
      fontSize: 18
    }
  }, "\xD7"), /*#__PURE__*/React.createElement("button", {
    onClick: saveProfile,
    style: {
      padding: '4px 9px',
      background: '#22C55E',
      border: 'none',
      color: '#fff',
      fontSize: 10,
      fontWeight: 700,
      letterSpacing: 0.4,
      cursor: 'pointer',
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'Material Symbols Outlined',
      fontSize: 13
    }
  }, "save"), savedAt ? '✓' : 'Save'), /*#__PURE__*/React.createElement("button", {
    onClick: removeManager,
    style: {
      padding: '4px 9px',
      background: 'rgba(239,68,68,0.85)',
      border: 'none',
      color: '#fff',
      fontSize: 10,
      fontWeight: 700,
      letterSpacing: 0.4,
      cursor: 'pointer',
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'Material Symbols Outlined',
      fontSize: 13
    }
  }, "delete"), "Remove"))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(4, 1fr)',
      gap: 1,
      background: '#E5E7EB'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '14px 16px',
      background: '#fff'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 9,
      fontWeight: 700,
      color: 'var(--text-3)',
      letterSpacing: 0.5,
      textTransform: 'uppercase'
    }
  }, "Broker Commission"), /*#__PURE__*/React.createElement("div", {
    className: "mono",
    style: {
      fontSize: 18,
      fontWeight: 800,
      color: 'var(--ink)',
      marginTop: 3
    }
  }, "$", MANAGER.fmt(earnings.brokerCommission, 2))), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '14px 16px',
      background: '#fff'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 9,
      fontWeight: 700,
      color: 'var(--text-3)',
      letterSpacing: 0.5,
      textTransform: 'uppercase'
    }
  }, "Manager Rebate"), /*#__PURE__*/React.createElement("div", {
    className: "mono",
    style: {
      fontSize: 18,
      fontWeight: 800,
      color: '#B45309',
      marginTop: 3
    }
  }, "$", MANAGER.fmt(earnings.managerRebate, 2))), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '14px 16px',
      background: '#fff'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 9,
      fontWeight: 700,
      color: 'var(--text-3)',
      letterSpacing: 0.5,
      textTransform: 'uppercase'
    }
  }, "Markup Share"), /*#__PURE__*/React.createElement("div", {
    className: "mono",
    style: {
      fontSize: 18,
      fontWeight: 800,
      color: '#7C3AED',
      marginTop: 3
    }
  }, "$", MANAGER.fmt(earnings.markupShare, 2))), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '14px 16px',
      background: '#fff'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 9,
      fontWeight: 700,
      color: 'var(--text-3)',
      letterSpacing: 0.5,
      textTransform: 'uppercase'
    }
  }, "Total Earned"), /*#__PURE__*/React.createElement("div", {
    className: "mono",
    style: {
      fontSize: 20,
      fontWeight: 800,
      color: '#15A36C',
      marginTop: 3
    }
  }, "$", MANAGER.fmt(earnings.total, 2)))), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '14px 22px',
      borderTop: '1px solid var(--line)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10,
      fontWeight: 800,
      color: 'var(--text-3)',
      letterSpacing: 0.5,
      textTransform: 'uppercase',
      marginBottom: 8
    }
  }, "Commission Rules — 💼 Per Server × Group"), /*#__PURE__*/React.createElement(React.Fragment, null,
    ['FX', 'CRYPTO', 'SPORTS'].map(function(srv) {
      var srvColor = srv === 'FX' ? '#15A36C' : srv === 'CRYPTO' ? '#F59E0B' : '#7C3AED';
      var srvUnit = srv === 'FX' ? '$/lot' : srv === 'CRYPTO' ? 'bps' : '% handle';
      var groups = ['Standard', 'Pro', 'VIP'];
      function getRule(srv, group) {
        if (srv === 'FX') return MANAGER.COMMISSION_RULES[group];
        return (MANAGER.COMMISSION_RULES[srv] || {})[group] || { managerRebates: [] };
      }
      function getRebateField(srv) { return srv === 'FX' ? 'perLot' : srv === 'CRYPTO' ? 'bps' : 'handlePct'; }
      function getCurrentValue(srv, group) {
        var rule = getRule(srv, group);
        var field = getRebateField(srv);
        var rebates = rule.managerRebates || [];
        var r = rebates.find(function(x){return x.managerId === m.id;});
        return r ? r[field] : 0;
      }
      function setValue(srv, group, val) {
        var v = parseFloat(val) || 0;
        var rule = getRule(srv, group);
        var field = getRebateField(srv);
        var rebates = rule.managerRebates || [];
        var idx = rebates.findIndex(function(x){return x.managerId === m.id;});
        if (idx >= 0) { rebates[idx][field] = v; }
        else { var nr = {managerId: m.id}; nr[field] = v; rebates.push(nr); }
        rule.managerRebates = rebates;
        if (MANAGER.rebuildCommissionLedger) MANAGER.rebuildCommissionLedger();
        if (MANAGER.ADMIN_ACTIVITY) MANAGER.ADMIN_ACTIVITY.unshift({
          ts: new Date().toISOString().slice(0,19).replace('T',' '),
          admin:'admin@alpexa.com', kind:'commission_edit',
          target: m.id, detail: srv + ' ' + group + ' rebate set to ' + v + ' ' + srvUnit + ' for ' + m.name
        });
        setSavedAt(new Date().toLocaleTimeString());
      }
      return /*#__PURE__*/React.createElement("div", { key: srv, style: { marginBottom: 12 } },
        /*#__PURE__*/React.createElement("div", {
          style: { display:'inline-flex', alignItems:'center', gap:6, padding:'3px 10px', background: srvColor+'15', color: srvColor, fontSize:10.5, fontWeight:800, letterSpacing:0.5, marginBottom:6, borderRadius:3 }
        }, srv, /*#__PURE__*/React.createElement("span", {style:{fontSize:9, opacity:0.75, fontWeight:600}}, " · ", srvUnit)),
        /*#__PURE__*/React.createElement("div", { style: { display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8 } },
          groups.map(function(g) {
            var v = getCurrentValue(srv, g);
            return /*#__PURE__*/React.createElement("div", {
              key: g,
              style: { padding:'6px 8px', border:'1px solid var(--line-2)', background:'var(--bg)', display:'flex', alignItems:'center', gap:5, fontSize:10.5 }
            },
              /*#__PURE__*/React.createElement("span", {style:{fontWeight:700, color: g==='VIP'?'#7C3AED':g==='Pro'?'#0EA5E9':'var(--text-2)', minWidth: 50}}, g),
              /*#__PURE__*/React.createElement("input", {
                type:'number', step: srv === 'FX' ? '0.5' : srv === 'CRYPTO' ? '1' : '0.1', min:'0',
                defaultValue: v,
                onBlur: function(e) { setValue(srv, g, e.target.value); },
                style: { width:55, padding:'3px 6px', border:'1px solid '+srvColor, background:'#fff', fontSize:11, color:srvColor, fontFamily:'JetBrains Mono, monospace', fontWeight:700, textAlign:'right', borderRadius:3 }
              }),
              /*#__PURE__*/React.createElement("span", {style:{fontSize:9, color:'var(--text-3)'}}, srv === 'FX' ? '/lot' : srv === 'CRYPTO' ? 'bps' : '%')
            );
          })
        )
      );
    }))), /*#__PURE__*/React.createElement("div", {
    style: { padding:'14px 22px', borderTop:'1px solid var(--line)' }
  }, /*#__PURE__*/React.createElement("div", {
    style: { fontSize:10, fontWeight:800, color:'var(--text-3)', letterSpacing:0.5, textTransform:'uppercase', marginBottom:8, display:'flex', alignItems:'center', gap:6 }
  },
    React.createElement('span', { style:{fontFamily:'Material Symbols Outlined', fontSize:13, color:'#15803D'} }, 'paid'),
    'Commission Earned · By Client'
  ),
  (function() {
    var ledger = (window.MANAGER.COMMISSION_LEDGER && window.MANAGER.COMMISSION_LEDGER.length) ? window.MANAGER.COMMISSION_LEDGER : (window.MANAGER.rebuildCommissionLedger ? window.MANAGER.rebuildCommissionLedger() : []);
    var byClient = {};
    var byGroup = { Standard:0, Pro:0, VIP:0 };
    var groupClientCount = { Standard: new Set(), Pro: new Set(), VIP: new Set() };
    ledger.forEach(function(e) {
      var amt = 0;
      if (e.splitTo && e.splitTo.length) {
        e.splitTo.forEach(function(sp) {
          if (sp.managerId === m.id) amt += (e.commission || 0) * ((sp.pct || 0) / 100);
        });
      } else if (e.managerId === m.id) {
        amt = e.commission || 0;
      }
      if (amt === 0) return;
      var g = e.group || 'Standard';
      if (!byClient[e.clientId]) byClient[e.clientId] = { total:0, byServer:{LIVE:0, CRYPTO:0, SPORTS:0}, byGroup:{Standard:0, Pro:0, VIP:0}, count:0, groups:new Set() };
      byClient[e.clientId].total += amt;
      byClient[e.clientId].byServer[e.server] = (byClient[e.clientId].byServer[e.server] || 0) + amt;
      byClient[e.clientId].byGroup[g] = (byClient[e.clientId].byGroup[g] || 0) + amt;
      byClient[e.clientId].groups.add(g);
      byClient[e.clientId].count += 1;
      byGroup[g] = (byGroup[g] || 0) + amt;
      if (groupClientCount[g]) groupClientCount[g].add(e.clientId);
    });
    var rows = Object.keys(byClient).map(function(cid){
      var c = MANAGER.findClient(cid);
      var groups = Array.from(byClient[cid].groups);
      // Dominant group = highest amount
      var bg = byClient[cid].byGroup;
      var domGroup = ['VIP','Pro','Standard'].reduce(function(best, g){ return (bg[g] > (bg[best]||-1)) ? g : best; }, 'Standard');
      return {
        cid: cid,
        name: c ? (c.firstName + ' ' + c.lastName) : cid,
        country: c ? c.country : '—',
        online: c ? c.online : false,
        groups: groups,
        domGroup: domGroup,
        byGroup: bg,
        total: byClient[cid].total,
        live: byClient[cid].byServer.LIVE || 0,
        crypto: byClient[cid].byServer.CRYPTO || 0,
        sports: byClient[cid].byServer.SPORTS || 0,
        count: byClient[cid].count
      };
    }).sort(function(a, b){ return b.total - a.total; });
    var grandTotal = rows.reduce(function(s, r){ return s + r.total; }, 0);
    if (rows.length === 0) {
      return React.createElement('div', {
        style: { padding:'12px 0', fontSize:11.5, color:'var(--text-3)', fontStyle:'italic' }
      }, 'No commission earned yet.');
    }
    return React.createElement(React.Fragment, null,
      // BY GROUP summary
      React.createElement('div', {
        style: { display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:6, marginBottom:8 }
      },
        ['Standard','Pro','VIP'].map(function(g) {
          var gColor = g === 'VIP' ? '#7C3AED' : g === 'Pro' ? '#0EA5E9' : '#5A6478';
          var gBg = g === 'VIP' ? '#F3E8FF' : g === 'Pro' ? '#E0F2FE' : '#F1F5F9';
          return React.createElement('div', {
            key: g,
            style: { padding:'8px 10px', background: gBg, border:'1px solid '+gColor+'33', borderLeft:'3px solid '+gColor, borderRadius:3 }
          },
            React.createElement('div', { style:{ fontSize:9, fontWeight:700, color: gColor, letterSpacing:0.5, textTransform:'uppercase', marginBottom:2 } }, g),
            React.createElement('div', { className:'mono', style:{ fontSize:14, fontWeight:800, color: gColor } }, '$' + MANAGER.fmt(byGroup[g] || 0, 2)),
            React.createElement('div', { style:{ fontSize:9, color:'var(--text-3)', marginTop:1 } }, (groupClientCount[g] ? groupClientCount[g].size : 0) + ' clients')
          );
        })
      ),
      // Table header
      React.createElement('div', {
        style: { display:'grid', gridTemplateColumns:'1fr 60px 60px 60px 60px 80px 40px', padding:'7px 8px', background:'#0F1B2D', color:'rgba(255,255,255,0.85)', fontSize:9.5, fontWeight:700, letterSpacing:0.5, textTransform:'uppercase', fontFamily:'JetBrains Mono, monospace' }
      },
        React.createElement('span', null, 'Client'),
        React.createElement('span', { style:{textAlign:'center'} }, 'Group'),
        React.createElement('span', { style:{textAlign:'right', color:'#22C55E'} }, 'FX'),
        React.createElement('span', { style:{textAlign:'right', color:'#F59E0B'} }, 'CRYPTO'),
        React.createElement('span', { style:{textAlign:'right', color:'#A78BFA'} }, 'SPORTS'),
        React.createElement('span', { style:{textAlign:'right'} }, 'Total'),
        React.createElement('span', { style:{textAlign:'right'} }, '#')
      ),
      React.createElement('div', { style: { maxHeight: 240, overflowY:'auto' } },
        rows.map(function(r, i) {
          var gColor = r.domGroup === 'VIP' ? '#7C3AED' : r.domGroup === 'Pro' ? '#0EA5E9' : '#5A6478';
          var gBg    = r.domGroup === 'VIP' ? '#F3E8FF' : r.domGroup === 'Pro' ? '#E0F2FE' : '#F1F5F9';
          var multi  = r.groups.length > 1;
          return React.createElement('div', {
            key: r.cid,
            style: { display:'grid', gridTemplateColumns:'1fr 60px 60px 60px 60px 80px 40px', padding:'7px 8px', fontSize:11, borderBottom:'1px solid var(--line)', alignItems:'center', background: i % 2 === 1 ? '#FAFBFC' : 'transparent' }
          },
            React.createElement('span', { style:{ display:'inline-flex', alignItems:'center', gap:5, color:'var(--ink)', fontWeight:500, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' } },
              r.online && React.createElement('span', { style:{width:6, height:6, borderRadius:'50%', background:'#22C55E', flexShrink:0} }),
              r.name,
              React.createElement('span', { style:{fontSize:9.5, color:'var(--text-3)', marginLeft:2} }, r.country)
            ),
            React.createElement('span', { style:{ textAlign:'center', display:'inline-flex', justifyContent:'center', alignItems:'center', gap:3 } },
              React.createElement('span', { title: multi ? 'Mixed: ' + r.groups.join(', ') : r.domGroup, style:{ padding:'1px 6px', fontSize:9, fontWeight:800, letterSpacing:0.3, background: gBg, color: gColor, borderRadius:3 } }, r.domGroup),
              multi && React.createElement('span', { title: 'Multiple groups', style:{fontSize:9, color:'var(--text-3)'} }, '+')
            ),
            React.createElement('span', { className:'mono', style:{textAlign:'right', color: r.live > 0 ? '#15803D' : 'var(--text-3)'} }, r.live > 0 ? '$' + MANAGER.fmt(r.live, 0) : '—'),
            React.createElement('span', { className:'mono', style:{textAlign:'right', color: r.crypto > 0 ? '#B45309' : 'var(--text-3)'} }, r.crypto > 0 ? '$' + MANAGER.fmt(r.crypto, 0) : '—'),
            React.createElement('span', { className:'mono', style:{textAlign:'right', color: r.sports > 0 ? '#7C3AED' : 'var(--text-3)'} }, r.sports > 0 ? '$' + MANAGER.fmt(r.sports, 0) : '—'),
            React.createElement('span', { className:'mono', style:{textAlign:'right', color:'var(--ink)', fontWeight:800} }, '$' + MANAGER.fmt(r.total, 2)),
            React.createElement('span', { className:'mono', style:{textAlign:'right', color:'var(--text-3)', fontSize:10} }, r.count)
          );
        })
      ),
      React.createElement('div', {
        style: { display:'grid', gridTemplateColumns:'1fr 60px 60px 60px 60px 80px 40px', padding:'8px 8px', borderTop:'2px solid var(--ink)', background:'#FEF3C7', fontSize:11, fontWeight:800 }
      },
        React.createElement('span', null, 'TOTAL · ' + rows.length + ' clients'),
        React.createElement('span', null, ''),
        React.createElement('span', { className:'mono', style:{textAlign:'right', color:'#15803D'} }, '$' + MANAGER.fmt(rows.reduce(function(s,r){return s+r.live;},0), 0)),
        React.createElement('span', { className:'mono', style:{textAlign:'right', color:'#B45309'} }, '$' + MANAGER.fmt(rows.reduce(function(s,r){return s+r.crypto;},0), 0)),
        React.createElement('span', { className:'mono', style:{textAlign:'right', color:'#7C3AED'} }, '$' + MANAGER.fmt(rows.reduce(function(s,r){return s+r.sports;},0), 0)),
        React.createElement('span', { className:'mono', style:{textAlign:'right', color:'var(--ink)'} }, '$' + MANAGER.fmt(grandTotal, 2)),
        React.createElement('span', null, '')
      )
    );
  })()
  ), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '14px 22px',
      borderTop: '1px solid var(--line)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10,
      fontWeight: 800,
      color: 'var(--text-3)',
      letterSpacing: 0.5,
      textTransform: 'uppercase',
      marginBottom: 8
    }
  }, "Assigned Clients \xB7 ", clients.length, " (", clients.filter(c => c.online).length, " online)"), /*#__PURE__*/React.createElement("div", {
    style: {
      maxHeight: 200,
      overflowY: 'auto'
    }
  }, clients.slice(0, 30).map((c, i) => /*#__PURE__*/React.createElement("div", {
    key: c.id,
    style: {
      display: 'grid',
      gridTemplateColumns: '30px 1fr 80px 100px',
      padding: '6px 0',
      fontSize: 11,
      borderBottom: '1px solid var(--line)',
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 7,
      height: 7,
      borderRadius: '50%',
      background: c.online ? '#22C55E' : '#CBD5E1',
      marginLeft: 8
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--ink)'
    }
  }, c.firstName, " ", c.lastName), /*#__PURE__*/React.createElement("span", {
    className: "mono",
    style: {
      textAlign: 'right',
      color: 'var(--text-3)'
    }
  }, c.country), /*#__PURE__*/React.createElement("span", {
    style: {
      textAlign: 'right',
      color: 'var(--text-2)',
      fontSize: 10
    }
  }, c.kyc))), clients.length > 30 && /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '8px 0',
      textAlign: 'center',
      color: 'var(--text-3)',
      fontSize: 10.5
    }
  }, "+ ", clients.length - 30, " more")))));
}

// ── Sports Bet Dashboard — replaces trading screens when server === 'SPORTS' ──

// === MANAGER.WALLETS — Company treasury wallets (Hot / Cold) ===
if (!MANAGER.WALLETS) MANAGER.WALLETS = [
  { id: 'w_hot', name: 'ALPEXA-HOT', category: 'hot', purpose: 'Withdrawal liquidity',
    address: '0xAB1F2D8C5e3b9A0f7E4C2B1d6F8a3E5C9D2B7A4F',
    network: 'Ethereum (ERC-20)', asset: 'USDT', balance: 1850000, balanceUsd: 1850000,
    signers: 1, threshold: 1, signerType: 'API + 2FA',
    lastActivity: '2026-06-05 09:12', status: 'active' },
  { id: 'w_cold', name: 'ALPEXA-COLD', category: 'cold', purpose: 'Treasury reserves',
    address: '0x3D7E5F2A1B8C9d4E6F2A5B7C8D9E1F3A4B5C6D7E',
    network: 'Ethereum (ERC-20)', asset: 'USDT', balance: 24500000, balanceUsd: 24500000,
    signers: 5, threshold: 3, signerType: 'Multi-sig 3-of-5',
    lastActivity: '2026-05-30 16:42', status: 'active' }
];

// === WalletsScreen ===
function WalletsScreen({ quotesOpen, setQuotesOpen }) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [showMove, setShowMove] = useState(false);
  const [showConnect, setShowConnect] = useState(false);
  const [moveFrom, setMoveFrom] = useState('');
  const [moveTo, setMoveTo] = useState('');
  const [moveAmount, setMoveAmount] = useState('');
  const [linkTarget, setLinkTarget] = useState('');
  const [refreshTick, setRefreshTick] = useState(0);
  if (!MANAGER.SIGNING_DEVICES) MANAGER.SIGNING_DEVICES = [
    { id: 'sd1', provider: 'MetaMask', type: 'browser', address: '0xAB1F…7A4F', linkedTo: 'w_hot', connectedAt: '2026-06-01 10:23' },
    { id: 'sd2', provider: 'Ledger Nano X', type: 'hardware', address: '0x3D7E…6D7E', linkedTo: 'w_cold', connectedAt: '2026-05-20 14:08' }
  ];

  const all = MANAGER.WALLETS || [];
  let wallets = all;
  if (filter !== 'all') wallets = wallets.filter(w => w.category === filter);
  if (search) {
    const q = search.toLowerCase();
    wallets = wallets.filter(w => w.name.toLowerCase().includes(q) || w.address.toLowerCase().includes(q));
  }

  const totalAum = all.reduce((s, w) => s + (w.balanceUsd || 0), 0);
  const hotTotal = all.filter(w => w.category === 'hot').reduce((s, w) => s + w.balanceUsd, 0);
  const coldTotal = all.filter(w => w.category === 'cold').reduce((s, w) => s + w.balanceUsd, 0);
  const hotPct = totalAum > 0 ? (hotTotal / totalAum * 100) : 0;
  const coldPct = totalAum > 0 ? (coldTotal / totalAum * 100) : 0;

  function shortAddr(a) { return a ? (a.slice(0, 8) + '…' + a.slice(-6)) : '—'; }

  return /*#__PURE__*/React.createElement('div', {
    style: { flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0 }
  },
    React.createElement('div', {
      style: { padding: '14px 18px', borderBottom: '1px solid var(--line)', background: 'var(--surface)', display: 'flex', alignItems: 'center', gap: 12 }
    },
      React.createElement('span', { className: 'material-symbols-outlined', style: { fontSize: 22, color: '#F59E0B' } }, 'account_balance_wallet'),
      React.createElement('div', { style: { flex: 1 } },
        React.createElement('div', { style: { fontSize: 14, fontWeight: 800, color: 'var(--ink)' } }, 'Treasury & Wallets'),
        React.createElement('div', { style: { fontSize: 10.5, color: 'var(--text-3)' } }, 'Company wallets · Hot · Cold')
      ),
      React.createElement('button', {
        onClick: () => { setLinkTarget(''); setShowConnect(true); },
        style: { padding: '7px 14px', background: '#F59E0B', color: '#fff', border: 'none', fontSize: 11, fontWeight: 800, letterSpacing: 0.4, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, marginRight: 6 }
      },
        React.createElement('span', { className: 'material-symbols-outlined', style: { fontSize: 14 } }, 'link'),
        'CONNECT DEVICE'
      ),
      React.createElement('button', {
        onClick: () => setShowMove(true),
        style: { padding: '7px 14px', background: '#1E3A5F', color: '#fff', border: 'none', fontSize: 11, fontWeight: 800, letterSpacing: 0.4, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }
      },
        React.createElement('span', { className: 'material-symbols-outlined', style: { fontSize: 14 } }, 'swap_horiz'),
        'MOVE FUNDS'
      )
    ),
    // Connected devices strip
    React.createElement('div', {
      style: { padding: '8px 14px', borderBottom: '1px solid var(--line)', background: 'var(--bg)', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }
    },
      React.createElement('span', { style: { fontSize: 9.5, fontWeight: 800, color: 'var(--text-3)', letterSpacing: 0.5 } }, 'SIGNERS:'),
      (MANAGER.SIGNING_DEVICES || []).map(d => {
        const linked = all.find(w => w.id === d.linkedTo);
        const icon = d.provider.includes('MetaMask') ? '🦊' : d.provider.includes('Ledger') ? '🔒' : d.provider.includes('Trezor') ? '🛡' : '💼';
        return React.createElement('div', {
          key: d.id,
          style: { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 9px', background: 'var(--surface)', border: '1px solid var(--line)', fontSize: 10.5 }
        },
          React.createElement('span', { style: { fontSize: 14 } }, icon),
          React.createElement('span', { style: { fontWeight: 700, color: 'var(--ink)' } }, d.provider),
          React.createElement('span', { style: { color: 'var(--text-3)', fontFamily: 'JetBrains Mono, monospace' } }, '· ' + d.address),
          linked && React.createElement('span', {
            style: { padding: '1px 6px', fontSize: 9, fontWeight: 800, color: '#fff', background: linked.category === 'hot' ? '#F59E0B' : '#1E3A5F', letterSpacing: 0.4 }
          }, '→ ' + linked.name),
          React.createElement('span', {
            className: 'material-symbols-outlined',
            onClick: () => {
              if (confirm('Disconnect ' + d.provider + '?')) {
                MANAGER.SIGNING_DEVICES = MANAGER.SIGNING_DEVICES.filter(x => x.id !== d.id);
                setRefreshTick(t => t + 1);
              }
            },
            style: { fontSize: 13, color: 'var(--text-3)', cursor: 'pointer' }
          }, 'close')
        );
      })
    ),
    // KPI 3
    React.createElement('div', {
      style: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1, background: 'var(--line)', borderBottom: '1px solid var(--line)' }
    },
      [
        ['TOTAL', '$' + MANAGER.fmt(totalAum, 0), 'var(--ink)', ''],
        ['HOT', '$' + MANAGER.fmt(hotTotal, 0), '#F59E0B', hotPct.toFixed(1) + '% of total'],
        ['COLD', '$' + MANAGER.fmt(coldTotal, 0), '#1E3A5F', coldPct.toFixed(1) + '% of total']
      ].map((row, i) => React.createElement('div', {
        key: i, style: { background: 'var(--surface)', padding: '10px 14px' }
      },
        React.createElement('div', { style: { fontSize: 9.5, fontWeight: 700, color: 'var(--text-3)', letterSpacing: 0.6 } }, row[0]),
        React.createElement('div', { style: { fontSize: 16, fontWeight: 800, color: row[2], marginTop: 3, fontFamily: 'JetBrains Mono, monospace' } }, row[1]),
        row[3] && React.createElement('div', { style: { fontSize: 9, color: 'var(--text-3)', marginTop: 1 } }, row[3])
      ))
    ),
    // Filter
    React.createElement('div', {
      style: { padding: '8px 14px', borderBottom: '1px solid var(--line)', background: 'var(--surface)', display: 'flex', alignItems: 'center', gap: 8 }
    },
      ['all', 'hot', 'cold'].map(k => React.createElement('button', {
        key: k, onClick: () => setFilter(k),
        style: { padding: '4px 12px', fontSize: 10.5, fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase', background: filter === k ? '#1E3A5F' : 'transparent', color: filter === k ? '#fff' : 'var(--text-2)', border: '1px solid ' + (filter === k ? '#1E3A5F' : 'var(--line)'), cursor: 'pointer' }
      }, k))
    ),
    // Table
    React.createElement('div', { style: { flex: 1, overflow: 'auto' } },
      React.createElement('table', { style: { width: '100%', borderCollapse: 'collapse', fontSize: 11.5 } },
        React.createElement('thead', { style: { position: 'sticky', top: 0, zIndex: 1 } },
          React.createElement('tr', null,
            ['WALLET', 'TYPE', 'NETWORK', 'ADDRESS', 'BALANCE', 'SIGNERS', ''].map(h => React.createElement('th', {
              key: h, style: { padding: '8px 10px', textAlign: 'left', fontSize: 9.5, fontWeight: 800, color: '#fff', letterSpacing: 0.5, background: '#1E3A5F' }
            }, h))
          )
        ),
        React.createElement('tbody', null,
          wallets.map(w => {
            const isHot = w.category === 'hot';
            return React.createElement('tr', { key: w.id, style: { borderBottom: '1px solid var(--line)' } },
              React.createElement('td', { style: { padding: '10px 10px' } },
                React.createElement('div', { style: { fontSize: 11.5, fontWeight: 700, fontFamily: 'JetBrains Mono, monospace' } }, w.name),
                React.createElement('div', { style: { fontSize: 9.5, color: 'var(--text-3)' } }, w.purpose)
              ),
              React.createElement('td', { style: { padding: '10px 10px' } },
                React.createElement('span', { style: { padding: '3px 8px', fontSize: 9.5, fontWeight: 800, letterSpacing: 0.5, color: '#fff', background: isHot ? '#F59E0B' : '#1E3A5F' } }, isHot ? 'HOT' : 'COLD')
              ),
              React.createElement('td', { style: { padding: '10px 10px', fontSize: 10.5, color: 'var(--text-2)' } }, w.network),
              React.createElement('td', { style: { padding: '10px 10px', fontFamily: 'JetBrains Mono, monospace', fontSize: 10.5 } }, shortAddr(w.address)),
              React.createElement('td', { style: { padding: '10px 10px', fontFamily: 'JetBrains Mono, monospace' } },
                React.createElement('div', { style: { fontSize: 12, fontWeight: 700 } }, MANAGER.fmt(w.balance, 2) + ' ' + w.asset),
                React.createElement('div', { style: { fontSize: 10, color: 'var(--text-3)' } }, '$' + MANAGER.fmt(w.balanceUsd, 0))
              ),
              React.createElement('td', { style: { padding: '10px 10px' } },
                React.createElement('div', { style: { fontSize: 11, fontWeight: 700 } }, w.threshold > 1 ? (w.threshold + '-of-' + w.signers) : 'Single'),
                React.createElement('div', { style: { fontSize: 9, color: 'var(--text-3)' } }, w.signerType)
              ),
              React.createElement('td', { style: { padding: '10px 10px', textAlign: 'right' } },
                React.createElement('button', {
                  onClick: () => { setMoveFrom(w.id); setShowMove(true); },
                  style: { padding: '4px 10px', fontSize: 10, fontWeight: 700, color: '#1E3A5F', background: 'transparent', border: '1px solid #1E3A5F', cursor: 'pointer', letterSpacing: 0.4 }
                }, 'MOVE')
              )
            );
          })
        )
      )
    ),
    // Connect Device Modal
    showConnect && React.createElement('div', {
      onClick: () => setShowConnect(false),
      style: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }
    },
      React.createElement('div', {
        onClick: e => e.stopPropagation(),
        style: { background: 'var(--surface)', border: '1px solid var(--line)', width: 520, maxWidth: '92vw' }
      },
        React.createElement('div', { style: { padding: '14px 18px', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', gap: 10 } },
          React.createElement('span', { className: 'material-symbols-outlined', style: { fontSize: 22, color: '#F59E0B' } }, 'link'),
          React.createElement('div', { style: { flex: 1 } },
            React.createElement('div', { style: { fontSize: 14, fontWeight: 800 } }, 'Connect Signing Device'),
            React.createElement('div', { style: { fontSize: 10.5, color: 'var(--text-3)' } }, 'MetaMask or hardware wallet')
          ),
          React.createElement('button', { onClick: () => setShowConnect(false), style: { background: 'transparent', border: 'none', cursor: 'pointer' } },
            React.createElement('span', { className: 'material-symbols-outlined', style: { fontSize: 22 } }, 'close')
          )
        ),
        React.createElement('div', { style: { padding: 16 } },
          React.createElement('div', { style: { marginBottom: 12 } },
            React.createElement('div', { style: { fontSize: 9.5, fontWeight: 800, color: 'var(--text-3)', letterSpacing: 0.5, marginBottom: 5 } }, 'LINK TO WALLET (optional)'),
            React.createElement('select', {
              value: linkTarget, onChange: e => setLinkTarget(e.target.value),
              style: { width: '100%', padding: '7px 10px', fontSize: 12, border: '1px solid var(--line)', background: 'var(--bg)' }
            },
              React.createElement('option', { value: '' }, '— Standalone signer —'),
              all.map(w => React.createElement('option', { key: w.id, value: w.id }, w.name + ' (' + w.category.toUpperCase() + ')'))
            )
          ),
          React.createElement('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 } },
            [
              { icon: '🦊', name: 'MetaMask', type: 'Browser extension', tag: 'POPULAR' },
              { icon: '🔒', name: 'Ledger', type: 'Hardware (USB)', tag: 'SECURE' },
              { icon: '🛡', name: 'Trezor', type: 'Hardware (USB)', tag: 'SECURE' }
            ].map(p => React.createElement('button', {
              key: p.name,
              onClick: () => {
                const fakeAddr = '0x' + Math.random().toString(16).slice(2, 6).toUpperCase() + '…' + Math.random().toString(16).slice(2, 6).toUpperCase();
                MANAGER.SIGNING_DEVICES.push({
                  id: 'sd' + Date.now(), provider: p.name, address: fakeAddr,
                  linkedTo: linkTarget || null, connectedAt: new Date().toISOString().slice(0, 16).replace('T', ' ')
                });
                alert(p.name + ' connected.\nAddress: ' + fakeAddr);
                setShowConnect(false); setLinkTarget(''); setRefreshTick(t => t + 1);
              },
              style: { padding: '16px 10px', background: 'var(--bg)', border: '1px solid var(--line)', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, position: 'relative' }
            },
              React.createElement('span', { style: { position: 'absolute', top: 4, right: 4, fontSize: 8, fontWeight: 800, color: '#fff', background: p.tag === 'SECURE' ? '#15803D' : '#F59E0B', padding: '1px 5px' } }, p.tag),
              React.createElement('div', { style: { fontSize: 32 } }, p.icon),
              React.createElement('div', { style: { fontSize: 12, fontWeight: 800 } }, p.name),
              React.createElement('div', { style: { fontSize: 9.5, color: 'var(--text-3)' } }, p.type)
            ))
          )
        )
      )
    ),
    // Move Funds Modal (simple)
    showMove && React.createElement('div', {
      onClick: () => setShowMove(false),
      style: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }
    },
      React.createElement('div', {
        onClick: e => e.stopPropagation(),
        style: { background: 'var(--surface)', border: '1px solid var(--line)', width: 480, maxWidth: '92vw', padding: 18 }
      },
        React.createElement('div', { style: { fontSize: 14, fontWeight: 800, marginBottom: 14 } }, 'Move Funds'),
        React.createElement('div', { style: { fontSize: 9.5, fontWeight: 800, color: 'var(--text-3)', marginBottom: 4 } }, 'FROM'),
        React.createElement('select', {
          value: moveFrom, onChange: e => setMoveFrom(e.target.value),
          style: { width: '100%', padding: '7px 10px', marginBottom: 12, border: '1px solid var(--line)' }
        },
          React.createElement('option', { value: '' }, '— Select —'),
          all.map(w => React.createElement('option', { key: w.id, value: w.id }, w.name + ' (' + MANAGER.fmt(w.balance, 2) + ' ' + w.asset + ')'))
        ),
        React.createElement('div', { style: { fontSize: 9.5, fontWeight: 800, color: 'var(--text-3)', marginBottom: 4 } }, 'TO'),
        React.createElement('select', {
          value: moveTo, onChange: e => setMoveTo(e.target.value),
          style: { width: '100%', padding: '7px 10px', marginBottom: 12, border: '1px solid var(--line)' }
        },
          React.createElement('option', { value: '' }, '— Select —'),
          all.map(w => React.createElement('option', { key: w.id, value: w.id }, w.name))
        ),
        React.createElement('div', { style: { fontSize: 9.5, fontWeight: 800, color: 'var(--text-3)', marginBottom: 4 } }, 'AMOUNT'),
        React.createElement('input', {
          type: 'number', value: moveAmount, onChange: e => setMoveAmount(e.target.value),
          placeholder: '0.00',
          style: { width: '100%', padding: '7px 10px', marginBottom: 14, border: '1px solid var(--line)' }
        }),
        React.createElement('div', { style: { display: 'flex', gap: 8, justifyContent: 'flex-end' } },
          React.createElement('button', { onClick: () => setShowMove(false), style: { padding: '7px 14px', border: '1px solid var(--line)', background: 'transparent', cursor: 'pointer' } }, 'CANCEL'),
          React.createElement('button', {
            onClick: () => {
              const f = all.find(w => w.id === moveFrom), t = all.find(w => w.id === moveTo), amt = parseFloat(moveAmount);
              if (!f || !t || !(amt > 0)) { alert('Invalid'); return; }
              if (f.threshold > 1 && !confirm(f.threshold + '-of-' + f.signers + ' multi-sig required. Proceed?')) return;
              f.balance -= amt; t.balance += amt; f.balanceUsd -= amt; t.balanceUsd += amt;
              setShowMove(false); setMoveFrom(''); setMoveTo(''); setMoveAmount('');
              setRefreshTick(x => x + 1);
            },
            style: { padding: '7px 18px', background: '#1E3A5F', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 800 }
          }, 'PROCEED')
        )
      )
    )
  );
}

function SportsBetsScreen({
  quotesOpen,
  setQuotesOpen
}) {
  const [view, setView] = useState('open'); // open | settled | events | clients
  const [sportFilter, setSportFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState('placed');
  const [sortDir, setSortDir] = useState('desc');
  const [editingId, setEditingId] = useState(null);
  const [refreshTick, setRefreshTick] = useState(0);
  function toggleSort(k) {
    if (sortKey === k) setSortDir(d => d === 'asc' ? 'desc' : 'asc');else {
      setSortKey(k);
      setSortDir(['placed', 'odds', 'stake', 'potential', 'payout'].includes(k) ? 'desc' : 'asc');
    }
  }
  function updateBet(id, key, val) {
    const idx = MANAGER.SPORTS_BETS.findIndex(b => b.id === id);
    if (idx < 0) return;
    let v = val;
    if (['odds', 'stake', 'potential', 'payout'].includes(key)) v = parseFloat(val) || 0;
    MANAGER.SPORTS_BETS[idx] = {
      ...MANAGER.SPORTS_BETS[idx],
      [key]: v
    };
    if (MANAGER.ADMIN_ACTIVITY) MANAGER.ADMIN_ACTIVITY.unshift({
      ts: new Date().toISOString().slice(0, 19).replace('T', ' '),
      admin: 'admin@alpexa.com',
      kind: 'bet_edit',
      target: id,
      detail: `${key} → ${v}`
    });
    setRefreshTick(t => t + 1);
  }
  function settleBet(id, outcome) {
    const idx = MANAGER.SPORTS_BETS.findIndex(b => b.id === id);
    if (idx < 0) return;
    const bet = MANAGER.SPORTS_BETS[idx];
    const payout = outcome === 'won' ? bet.potential : outcome === 'void' ? bet.stake : 0;
    MANAGER.SPORTS_BETS[idx] = {
      ...bet,
      status: outcome,
      payout,
      settled: new Date().toISOString().slice(0, 19).replace('T', ' ')
    };
    if (MANAGER.ADMIN_ACTIVITY) MANAGER.ADMIN_ACTIVITY.unshift({
      ts: new Date().toISOString().slice(0, 19).replace('T', ' '),
      admin: 'admin@alpexa.com',
      kind: 'bet_settle',
      target: id,
      detail: `${outcome.toUpperCase()} · payout $${MANAGER.fmt(payout, 2)}`
    });
    setRefreshTick(t => t + 1);
  }
  function cancelBet(id) {
    if (!confirm('Cancel this bet? Stake will be returned.')) return;
    settleBet(id, 'void');
  }

  // Filter bets per view
  let bets = MANAGER.SPORTS_BETS;
  if (view === 'open') bets = bets.filter(b => b.status === 'open');
  if (view === 'settled') bets = bets.filter(b => b.status !== 'open');

  // Sport filter (join with event)
  if (sportFilter !== 'all') {
    bets = bets.filter(b => {
      const e = MANAGER.SPORTS_EVENTS.find(x => x.id === b.eventId);
      return e && e.sport === sportFilter;
    });
  }
  if (search) {
    const q = search.toLowerCase();
    bets = bets.filter(b => {
      const c = MANAGER.findClient(b.clientId);
      const e = MANAGER.SPORTS_EVENTS.find(x => x.id === b.eventId);
      return b.id.toLowerCase().includes(q) || b.selection.toLowerCase().includes(q) || c && (c.firstName.toLowerCase().includes(q) || c.lastName.toLowerCase().includes(q)) || e && (e.home.toLowerCase().includes(q) || e.away.toLowerCase().includes(q));
    });
  }
  const dir = sortDir === 'asc' ? 1 : -1;
  bets = [...bets].sort((a, b) => {
    switch (sortKey) {
      case 'id':
        return (a.id || '').localeCompare(b.id || '') * dir;
      case 'placed':
        return (a.placed || '').localeCompare(b.placed || '') * dir;
      case 'client':
        {
          const ca = MANAGER.findClient(a.clientId),
            cb = MANAGER.findClient(b.clientId);
          return ((ca?.firstName || '') + ca?.lastName).localeCompare((cb?.firstName || '') + cb?.lastName) * dir;
        }
      case 'event':
        {
          const ea = MANAGER.SPORTS_EVENTS.find(e => e.id === a.eventId),
            eb = MANAGER.SPORTS_EVENTS.find(e => e.id === b.eventId);
          return ((ea?.home || '') + ea?.away).localeCompare((eb?.home || '') + eb?.away) * dir;
        }
      case 'sport':
        {
          const ea = MANAGER.SPORTS_EVENTS.find(e => e.id === a.eventId),
            eb = MANAGER.SPORTS_EVENTS.find(e => e.id === b.eventId);
          return (ea?.sport || '').localeCompare(eb?.sport || '') * dir;
        }
      case 'selection':
        return (a.selection || '').localeCompare(b.selection || '') * dir;
      case 'odds':
        return ((a.odds || 0) - (b.odds || 0)) * dir;
      case 'stake':
        return ((a.stake || 0) - (b.stake || 0)) * dir;
      case 'potential':
        return ((a.potential || 0) - (b.potential || 0)) * dir;
      case 'payout':
        return ((a.payout || 0) - (b.payout || 0)) * dir;
      case 'status':
        return (a.status || '').localeCompare(b.status || '') * dir;
      default:
        return 0;
    }
  });

  // KPIs
  const allBets = MANAGER.SPORTS_BETS;
  const openBets = allBets.filter(b => b.status === 'open');
  const totalStake = openBets.reduce((s, b) => s + (b.stake || 0), 0);
  const totalLiability = openBets.reduce((s, b) => s + (b.potential || 0), 0);
  const houseRiskNet = totalLiability - totalStake; // worst case payout - stakes received
  const wonBets = allBets.filter(b => b.status === 'won').length;
  const lostBets = allBets.filter(b => b.status === 'lost').length;
  const houseProfit = allBets.filter(b => b.status === 'lost').reduce((s, b) => s + (b.stake || 0), 0) - allBets.filter(b => b.status === 'won').reduce((s, b) => s + ((b.payout || 0) - (b.stake || 0)), 0);
  const sports = ['all', 'NBA', 'NFL', 'MLB', 'NHL'];
  const NAVY = '#1B3955',
    NAVY_HI = '#234A6E';
  function Tab({
    id,
    icon,
    label,
    count
  }) {
    const active = view === id;
    return /*#__PURE__*/React.createElement("button", {
      onClick: () => setView(id),
      style: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        padding: '5px 11px',
        background: active ? NAVY : 'transparent',
        color: active ? '#fff' : 'var(--text-2)',
        border: active ? `1px solid ${NAVY}` : '1px solid var(--line-2)',
        cursor: 'pointer',
        fontSize: 11,
        fontWeight: active ? 700 : 500,
        letterSpacing: 0.3
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: 'Material Symbols Outlined',
        fontSize: 13
      }
    }, icon), label, count !== undefined && /*#__PURE__*/React.createElement("span", {
      style: {
        padding: '0 4px',
        fontSize: 9.5,
        fontWeight: 700,
        background: active ? 'rgba(255,255,255,0.18)' : 'var(--bg)',
        color: active ? '#fff' : 'var(--text-3)'
      }
    }, count));
  }
  function Arrow({
    a,
    d
  }) {
    if (!a) return /*#__PURE__*/React.createElement("svg", {
      width: "8",
      height: "10",
      viewBox: "0 0 24 24",
      fill: "rgba(255,255,255,0.35)",
      style: {
        marginLeft: 4
      }
    }, /*#__PURE__*/React.createElement("path", {
      d: "M7 9l5-5 5 5z M7 15l5 5 5-5z"
    }));
    return /*#__PURE__*/React.createElement("svg", {
      width: "9",
      height: "9",
      viewBox: "0 0 24 24",
      fill: "#5BB0FF",
      style: {
        marginLeft: 4
      }
    }, d === 'asc' ? /*#__PURE__*/React.createElement("path", {
      d: "M7 14l5-5 5 5z"
    }) : /*#__PURE__*/React.createElement("path", {
      d: "M7 10l5 5 5-5z"
    }));
  }
  function StatusBadge({
    status
  }) {
    const styles = {
      open: {
        bg: '#E3F2FD',
        col: '#0D47A1'
      },
      won: {
        bg: '#E8F5E9',
        col: '#1B5E20'
      },
      lost: {
        bg: '#FFEBEE',
        col: '#C62828'
      },
      void: {
        bg: '#F5F5F5',
        col: '#616161'
      },
      cashout: {
        bg: '#FFF3E0',
        col: '#E65100'
      }
    };
    const s = styles[status] || styles.open;
    return /*#__PURE__*/React.createElement("span", {
      style: {
        padding: '2px 7px',
        fontSize: 9.5,
        fontWeight: 800,
        background: s.bg,
        color: s.col,
        textTransform: 'uppercase',
        letterSpacing: 0.4
      }
    }, status);
  }
  const betCols = [{
    k: 'id',
    l: 'Bet ID',
    w: 80,
    a: 'left',
    s: true
  }, {
    k: 'placed',
    l: 'Placed',
    w: 140,
    a: 'center',
    s: true
  }, {
    k: 'client',
    l: 'Client',
    w: 180,
    a: 'left',
    s: true
  }, {
    k: 'sport',
    l: 'Sport',
    w: 110,
    a: 'center',
    s: true
  }, {
    k: 'event',
    l: 'Event',
    w: 220,
    a: 'left',
    s: true
  }, {
    k: 'selection',
    l: 'Selection',
    w: 140,
    a: 'left',
    s: true
  }, {
    k: 'odds',
    l: 'Odds',
    w: 70,
    a: 'right',
    s: true
  }, {
    k: 'stake',
    l: 'Stake',
    w: 90,
    a: 'right',
    s: true
  }, {
    k: 'potential',
    l: 'Payout',
    w: 100,
    a: 'right',
    s: true
  }, {
    k: 'status',
    l: 'Status',
    w: 90,
    a: 'center',
    s: true
  }, {
    k: 'actions',
    l: '',
    w: 160,
    a: 'right'
  }];
  const betGrid = betCols.map(c => `${c.w}px`).join(' ');
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      flex: 1,
      minHeight: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      padding: '10px 14px',
      minHeight: 50,
      background: 'var(--surface)',
      borderBottom: '1px solid var(--line)',
      flexShrink: 0,
      flexWrap: 'wrap'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      lineHeight: 1.15,
      marginRight: 6
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      fontSize: 14,
      fontWeight: 800,
      color: 'var(--ink)',
      letterSpacing: 0.3
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'Material Symbols Outlined',
      fontSize: 18,
      color: '#7C3AED'
    }
  }, "sports_soccer"), "Sports Book"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 10,
      color: 'var(--text-3)',
      fontFamily: 'JetBrains Mono, monospace'
    }
  }, bets.length, " bets shown \xB7 Open stake $", MANAGER.fmt(totalStake, 0), " \xB7 Liability $", MANAGER.fmt(totalLiability, 0))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 5,
      padding: '5px 9px',
      background: 'var(--bg)',
      border: '1px solid var(--line-2)',
      width: 220,
      height: 28
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'Material Symbols Outlined',
      fontSize: 14,
      color: 'var(--text-3)'
    }
  }, "search"), /*#__PURE__*/React.createElement("input", {
    value: search,
    onChange: e => setSearch(e.target.value),
    placeholder: "Bet ID, client, event\u2026",
    style: {
      flex: 1,
      fontSize: 11,
      color: 'var(--ink)',
      background: 'transparent',
      outline: 'none',
      border: 'none'
    }
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 4
    }
  }, /*#__PURE__*/React.createElement(Tab, {
    id: "open",
    icon: "bolt",
    label: "Open Bets",
    count: allBets.filter(b => b.status === 'open').length
  }), /*#__PURE__*/React.createElement(Tab, {
    id: "risk",
    icon: "shield",
    label: "Risk Mgr",
    count: MANAGER.SPORTS_EVENTS.filter(e => MANAGER.SPORTS_BETS.some(b => b.eventId === e.id && b.status === 'open')).length
  }), /*#__PURE__*/React.createElement(Tab, {
    id: "queue",
    icon: "pending_actions",
    label: "Settle Queue",
    count: MANAGER.SPORTS_EVENTS.filter(e => e.status === 'live').reduce((s, e) => s + MANAGER.SPORTS_BETS.filter(b => b.eventId === e.id && b.status === 'open').length, 0)
  }), /*#__PURE__*/React.createElement(Tab, {
    id: "settled",
    icon: "check_circle",
    label: "Settled",
    count: allBets.filter(b => b.status !== 'open').length
  }), /*#__PURE__*/React.createElement(Tab, {
    id: "events",
    icon: "event",
    label: "Events",
    count: MANAGER.SPORTS_EVENTS.length
  }), /*#__PURE__*/React.createElement(Tab, {
    id: "heatmap",
    icon: "grid_view",
    label: "Risk Map"
  })), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1
    }
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '8px 14px',
      background: '#FAFBFC',
      borderBottom: '1px solid var(--line)',
      flexWrap: 'wrap'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 9,
      fontWeight: 700,
      color: 'var(--text-3)',
      letterSpacing: 0.5,
      textTransform: 'uppercase'
    }
  }, "Sport"), sports.map(s => /*#__PURE__*/React.createElement("button", {
    key: s,
    onClick: () => setSportFilter(s),
    style: {
      padding: '4px 9px',
      background: sportFilter === s ? '#EAF2FB' : 'transparent',
      color: sportFilter === s ? NAVY : 'var(--text-2)',
      border: sportFilter === s ? `1px solid ${NAVY}` : '1px solid var(--line-2)',
      cursor: 'pointer',
      fontSize: 11,
      fontWeight: sportFilter === s ? 700 : 500,
      letterSpacing: 0.3
    }
  }, s === 'all' ? 'All' : s)), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 10,
      fontSize: 10.5,
      fontFamily: 'JetBrains Mono, monospace'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--text-3)'
    }
  }, "Net House P/L:"), /*#__PURE__*/React.createElement("span", {
    style: {
      color: houseProfit >= 0 ? '#15A36C' : '#EF4444',
      fontWeight: 800,
      fontSize: 12
    }
  }, houseProfit >= 0 ? '+' : '−', "$", MANAGER.fmt(Math.abs(houseProfit), 0)), /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--text-3)'
    }
  }, "\xB7 Risk:"), /*#__PURE__*/React.createElement("span", {
    style: {
      color: houseRiskNet > 1000 ? '#EF4444' : 'var(--ink)',
      fontWeight: 800
    }
  }, "$", MANAGER.fmt(houseRiskNet, 0)))), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      overflowY: 'auto',
      background: 'var(--surface)'
    }
  }, view === 'events' ? /*#__PURE__*/React.createElement(SportsEventsTable, {
    refreshTick: refreshTick,
    setRefreshTick: setRefreshTick
  }) : view === 'heatmap' ? /*#__PURE__*/React.createElement(SportsRiskHeatmap, null) : view === 'queue' ? /*#__PURE__*/React.createElement(SportsSettlementQueue, {
    settleBet: settleBet
  }) : view === 'risk' ? /*#__PURE__*/React.createElement(SportsRiskManager, {
    refreshTick: refreshTick,
    setRefreshTick: setRefreshTick
  }) : /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: betGrid,
      background: NAVY,
      color: 'rgba(255,255,255,0.92)',
      fontSize: 10,
      fontWeight: 700,
      letterSpacing: 0.6,
      textTransform: 'uppercase',
      fontFamily: 'JetBrains Mono, Roboto Mono, monospace',
      position: 'sticky',
      top: 0,
      zIndex: 5
    }
  }, betCols.map(col => /*#__PURE__*/React.createElement("span", {
    key: col.k,
    onClick: col.s ? () => toggleSort(col.k) : undefined,
    style: {
      padding: '7px 8px',
      borderRight: '1px solid rgba(255,255,255,0.12)',
      cursor: col.s ? 'pointer' : 'default',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: col.a === 'right' ? 'flex-end' : col.a === 'left' ? 'flex-start' : 'center',
      background: sortKey === col.k ? 'rgba(91,176,255,0.10)' : 'transparent'
    }
  }, col.l, col.s && /*#__PURE__*/React.createElement(Arrow, {
    a: sortKey === col.k,
    d: sortDir
  })))), bets.length === 0 ? /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '40px 16px',
      textAlign: 'center',
      color: 'var(--text-3)',
      fontSize: 12
    }
  }, "No bets match the filter.") : bets.map((b, i) => {
    const c = MANAGER.findClient(b.clientId);
    const ev = MANAGER.SPORTS_EVENTS.find(x => x.id === b.eventId);
    const editing = editingId === b.id;
    return /*#__PURE__*/React.createElement("div", {
      key: b.id,
      style: {
        display: 'grid',
        gridTemplateColumns: betGrid,
        fontSize: 11.5,
        borderBottom: '1px solid #E5E7EB',
        background: editing ? '#FEF3C7' : i % 2 === 1 ? '#F7F9FC' : 'transparent'
      }
    }, /*#__PURE__*/React.createElement("span", {
      className: "mono",
      style: {
        padding: '7px 8px',
        display: 'inline-flex',
        alignItems: 'center',
        color: 'var(--text-2)',
        fontWeight: 600
      }
    }, b.id.toUpperCase()), /*#__PURE__*/React.createElement("span", {
      className: "mono",
      style: {
        padding: '7px 8px',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--text-3)',
        fontSize: 10.5
      }
    }, b.placed), /*#__PURE__*/React.createElement("span", {
      style: {
        padding: '7px 8px',
        display: 'inline-flex',
        alignItems: 'center',
        color: 'var(--text-2)',
        gap: 5
      }
    }, c ? /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("span", {
      style: {
        color: 'var(--ink)',
        fontWeight: 500
      }
    }, c.firstName, " ", c.lastName), c.online && /*#__PURE__*/React.createElement("span", {
      style: {
        width: 6,
        height: 6,
        borderRadius: '50%',
        background: '#22C55E',
        boxShadow: '0 0 3px #22C55E'
      }
    })) : '—'), /*#__PURE__*/React.createElement("span", {
      style: {
        padding: '7px 8px',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--text-2)',
        fontSize: 11
      }
    }, ev?.sport || '—'), /*#__PURE__*/React.createElement("span", {
      style: {
        padding: '7px 8px',
        display: 'inline-flex',
        flexDirection: 'column',
        justifyContent: 'center',
        minWidth: 0
      }
    }, ev ? /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("span", {
      style: {
        color: 'var(--ink)',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis'
      }
    }, ev.awayTeam, " ", /*#__PURE__*/React.createElement("span", {
      style: {
        color: 'var(--text-3)'
      }
    }, "@"), " ", ev.homeTeam), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 9.5,
        color: 'var(--text-3)',
        fontFamily: 'JetBrains Mono, monospace'
      }
    }, ev.league, " \xB7 ", ev.status === 'live' ? `LIVE ${ev.scoreAway}-${ev.scoreHome}` : ev.start.slice(11, 16))) : '—'), /*#__PURE__*/React.createElement("span", {
      style: {
        padding: '7px 8px',
        display: 'inline-flex',
        alignItems: 'center',
        color: 'var(--ink)',
        fontWeight: 600
      }
    }, editing ? /*#__PURE__*/React.createElement("input", {
      defaultValue: b.selection,
      onBlur: e => updateBet(b.id, 'selection', e.target.value),
      style: {
        width: '100%',
        padding: '3px 6px',
        border: '1px solid var(--line-2)',
        fontSize: 11,
        boxSizing: 'border-box'
      }
    }) : b.selection), /*#__PURE__*/React.createElement("span", {
      className: "mono",
      style: {
        padding: '5px 8px',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'flex-end',
        color: b.odds > 0 ? '#15803D' : 'var(--ink)',
        fontWeight: 700
      }
    }, editing ? /*#__PURE__*/React.createElement("input", {
      type: "number",
      step: "1",
      defaultValue: b.odds,
      onBlur: e => updateBet(b.id, 'odds', e.target.value),
      style: {
        width: 60,
        padding: '3px 6px',
        border: '1px solid var(--line-2)',
        fontSize: 11,
        fontFamily: 'JetBrains Mono, monospace',
        textAlign: 'right'
      }
    }) : (b.odds > 0 ? '+' : '') + b.odds), /*#__PURE__*/React.createElement("span", {
      className: "mono",
      style: {
        padding: '5px 8px',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'flex-end',
        color: 'var(--ink)',
        fontWeight: 600
      }
    }, editing ? /*#__PURE__*/React.createElement("input", {
      type: "number",
      step: "10",
      defaultValue: b.stake,
      onBlur: e => updateBet(b.id, 'stake', e.target.value),
      style: {
        width: 75,
        padding: '3px 6px',
        border: '1px solid var(--line-2)',
        fontSize: 11,
        fontFamily: 'JetBrains Mono, monospace',
        textAlign: 'right'
      }
    }) : `$${MANAGER.fmt(b.stake, 0)}`), /*#__PURE__*/React.createElement("span", {
      className: "mono",
      style: {
        padding: '5px 8px',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'flex-end',
        color: b.status === 'won' ? '#15A36C' : b.status === 'lost' ? '#EF4444' : 'var(--text-2)',
        fontWeight: 700
      }
    }, "$", MANAGER.fmt(b.status === 'lost' ? 0 : b.payout || b.potential, 0)), /*#__PURE__*/React.createElement("span", {
      style: {
        padding: '7px 8px',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center'
      }
    }, /*#__PURE__*/React.createElement(StatusBadge, {
      status: b.status
    })), /*#__PURE__*/React.createElement("span", {
      style: {
        padding: '4px 6px',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'flex-end',
        gap: 3
      }
    }, b.status === 'open' && !editing && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("button", {
      onClick: () => settleBet(b.id, 'won'),
      title: "Settle WON",
      style: {
        padding: '3px 8px',
        background: '#15803D',
        color: '#fff',
        border: 'none',
        fontSize: 10,
        fontWeight: 700,
        cursor: 'pointer'
      }
    }, "W"), /*#__PURE__*/React.createElement("button", {
      onClick: () => settleBet(b.id, 'lost'),
      title: "Settle LOST",
      style: {
        padding: '3px 8px',
        background: '#C62828',
        color: '#fff',
        border: 'none',
        fontSize: 10,
        fontWeight: 700,
        cursor: 'pointer'
      }
    }, "L"), /*#__PURE__*/React.createElement("button", {
      onClick: () => cancelBet(b.id),
      title: "Void",
      style: {
        padding: '3px 8px',
        background: '#9CA3AF',
        color: '#fff',
        border: 'none',
        fontSize: 10,
        fontWeight: 700,
        cursor: 'pointer'
      }
    }, "V")), /*#__PURE__*/React.createElement("button", {
      onClick: () => setEditingId(editing ? null : b.id),
      title: editing ? 'Done' : 'Edit',
      style: {
        width: 22,
        height: 22,
        padding: 0,
        background: editing ? '#22C55E' : 'var(--bg)',
        color: editing ? '#fff' : 'var(--text-2)',
        border: '1px solid var(--line-2)',
        cursor: 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center'
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: 'Material Symbols Outlined',
        fontSize: 13
      }
    }, editing ? 'check' : 'edit'))));
  }))));
}
function SportsEventsTable({
  refreshTick,
  setRefreshTick
}) {
  const [editingId, setEditingId] = useState(null);
  const NAVY = '#1B3955';
  function updateEvent(id, key, val) {
    const idx = MANAGER.SPORTS_EVENTS.findIndex(e => e.id === id);
    if (idx < 0) return;
    MANAGER.SPORTS_EVENTS[idx] = {
      ...MANAGER.SPORTS_EVENTS[idx],
      [key]: val
    };
    setRefreshTick(t => t + 1);
  }
  function updateOdds(id, side, val) {
    const idx = MANAGER.SPORTS_EVENTS.findIndex(e => e.id === id);
    if (idx < 0) return;
    const v = parseFloat(val) || 0;
    MANAGER.SPORTS_EVENTS[idx] = {
      ...MANAGER.SPORTS_EVENTS[idx],
      odds: {
        ...MANAGER.SPORTS_EVENTS[idx].odds,
        [side]: v
      }
    };
    setRefreshTick(t => t + 1);
  }
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '90px 1fr 110px 110px 90px 90px 90px 100px 100px',
      background: NAVY,
      color: 'rgba(255,255,255,0.92)',
      fontSize: 10,
      fontWeight: 700,
      letterSpacing: 0.6,
      textTransform: 'uppercase',
      fontFamily: 'JetBrains Mono, monospace',
      position: 'sticky',
      top: 0,
      zIndex: 5
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      padding: '7px 8px'
    }
  }, "Sport"), /*#__PURE__*/React.createElement("span", {
    style: {
      padding: '7px 8px'
    }
  }, "Match"), /*#__PURE__*/React.createElement("span", {
    style: {
      padding: '7px 8px'
    }
  }, "League"), /*#__PURE__*/React.createElement("span", {
    style: {
      padding: '7px 8px'
    }
  }, "Status"), /*#__PURE__*/React.createElement("span", {
    style: {
      padding: '7px 8px',
      textAlign: 'right'
    }
  }, "Away ML"), /*#__PURE__*/React.createElement("span", {
    style: {
      padding: '7px 8px',
      textAlign: 'right'
    }
  }, "Home ML"), /*#__PURE__*/React.createElement("span", {
    style: {
      padding: '7px 8px',
      textAlign: 'right'
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      padding: '7px 8px',
      textAlign: 'center'
    }
  }, "Bets"), /*#__PURE__*/React.createElement("span", {
    style: {
      padding: '7px 8px',
      textAlign: 'right'
    }
  }, "Actions")), MANAGER.SPORTS_EVENTS.map((ev, i) => {
    const editing = editingId === ev.id;
    const betCount = MANAGER.SPORTS_BETS.filter(b => b.eventId === ev.id).length;
    const totalStake = MANAGER.SPORTS_BETS.filter(b => b.eventId === ev.id && b.status === 'open').reduce((s, b) => s + (b.stake || 0), 0);
    return /*#__PURE__*/React.createElement("div", {
      key: ev.id,
      style: {
        display: 'grid',
        gridTemplateColumns: '90px 1fr 110px 110px 90px 90px 90px 100px 100px',
        fontSize: 11.5,
        borderBottom: '1px solid #E5E7EB',
        background: editing ? '#FEF3C7' : ev.status === 'live' ? '#FFF7ED' : i % 2 === 1 ? '#F7F9FC' : 'transparent'
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        padding: '7px 8px',
        display: 'inline-flex',
        alignItems: 'center',
        color: 'var(--text-2)',
        fontSize: 11,
        fontWeight: 600
      }
    }, ev.sport), /*#__PURE__*/React.createElement("span", {
      style: {
        padding: '5px 8px',
        display: 'inline-flex',
        flexDirection: 'column',
        justifyContent: 'center'
      }
    }, editing ? /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("input", {
      defaultValue: ev.homeTeam,
      onBlur: e => updateEvent(ev.id, 'homeTeam', e.target.value),
      placeholder: "Home",
      style: {
        width: '100%',
        padding: '3px 6px',
        border: '1px solid var(--line-2)',
        fontSize: 11,
        boxSizing: 'border-box'
      }
    }), /*#__PURE__*/React.createElement("input", {
      defaultValue: ev.awayTeam,
      onBlur: e => updateEvent(ev.id, 'awayTeam', e.target.value),
      placeholder: "Away",
      style: {
        width: '100%',
        padding: '3px 6px',
        border: '1px solid var(--line-2)',
        fontSize: 11,
        boxSizing: 'border-box',
        marginTop: 2
      }
    })) : /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("span", {
      style: {
        color: 'var(--ink)',
        fontWeight: 600
      }
    }, ev.awayTeam, " ", /*#__PURE__*/React.createElement("span", {
      style: {
        color: 'var(--text-3)',
        fontWeight: 400
      }
    }, "@"), " ", ev.homeTeam), ev.scoreHome !== undefined && /*#__PURE__*/React.createElement("span", {
      className: "mono",
      style: {
        fontSize: 11,
        fontWeight: 800,
        color: '#EA580C'
      }
    }, ev.awayAbbr, " ", ev.scoreAway, " - ", ev.scoreHome, " ", ev.homeAbbr))), /*#__PURE__*/React.createElement("span", {
      style: {
        padding: '7px 8px',
        display: 'inline-flex',
        alignItems: 'center',
        color: 'var(--text-3)',
        fontSize: 10.5,
        fontFamily: 'JetBrains Mono, monospace'
      }
    }, ev.league), /*#__PURE__*/React.createElement("span", {
      style: {
        padding: '7px 8px',
        display: 'inline-flex',
        alignItems: 'center'
      }
    }, editing ? /*#__PURE__*/React.createElement("select", {
      defaultValue: ev.status,
      onBlur: e => updateEvent(ev.id, 'status', e.target.value),
      style: {
        padding: '3px 6px',
        border: '1px solid var(--line-2)',
        fontSize: 10.5
      }
    }, /*#__PURE__*/React.createElement("option", null, "upcoming"), /*#__PURE__*/React.createElement("option", null, "live"), /*#__PURE__*/React.createElement("option", null, "finished"), /*#__PURE__*/React.createElement("option", null, "cancelled")) : /*#__PURE__*/React.createElement("span", {
      style: {
        padding: '2px 7px',
        fontSize: 9.5,
        fontWeight: 800,
        background: ev.status === 'live' ? '#FED7AA' : ev.status === 'upcoming' ? '#E3F2FD' : '#F5F5F5',
        color: ev.status === 'live' ? '#9A3412' : ev.status === 'upcoming' ? '#0D47A1' : '#616161',
        textTransform: 'uppercase',
        letterSpacing: 0.4
      }
    }, ev.status)), ['away', 'home'].map(side => /*#__PURE__*/React.createElement("span", {
      key: side,
      className: "mono",
      style: {
        padding: '5px 8px',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'flex-end',
        color: (ev.moneyline?.[side]?.odds || 0) > 0 ? '#15803D' : 'var(--ink)',
        fontWeight: 700
      }
    }, ev.moneyline?.[side] ? (ev.moneyline[side].odds > 0 ? '+' : '') + ev.moneyline[side].odds : '—')), /*#__PURE__*/React.createElement("span", null), /*#__PURE__*/React.createElement("span", {
      style: {
        padding: '5px 8px',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center'
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        padding: '2px 7px',
        background: '#E3F2FD',
        color: '#0D47A1',
        fontSize: 10,
        fontWeight: 700
      }
    }, betCount, " \xB7 $", MANAGER.fmt(totalStake, 0))), /*#__PURE__*/React.createElement("span", {
      style: {
        padding: '4px 6px',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'flex-end'
      }
    }, /*#__PURE__*/React.createElement("button", {
      onClick: () => setEditingId(editing ? null : ev.id),
      title: editing ? 'Done' : 'Edit',
      style: {
        width: 22,
        height: 22,
        padding: 0,
        background: editing ? '#22C55E' : 'var(--bg)',
        color: editing ? '#fff' : 'var(--text-2)',
        border: '1px solid var(--line-2)',
        cursor: 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center'
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: 'Material Symbols Outlined',
        fontSize: 13
      }
    }, editing ? 'check' : 'edit'))));
  }));
}

// ── SPORTS Accounts — wallets focused on betting history ──
function SportsAccountsScreen({
  quotesOpen,
  setQuotesOpen
}) {
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState('balance');
  const [sortDir, setSortDir] = useState('desc');
  const [detailId, setDetailId] = useState(null);
  function toggleSort(k) {
    if (sortKey === k) setSortDir(d => d === 'asc' ? 'desc' : 'asc');else {
      setSortKey(k);
      setSortDir(['balance', 'wagered', 'won', 'lost', 'net'].includes(k) ? 'desc' : 'asc');
    }
  }
  // Sports accounts only
  let rows = MANAGER.ACCOUNTS.filter(a => a.tag === 'SPORTS').map(a => {
    const c = MANAGER.findClient(a.clientId);
    const myBets = MANAGER.SPORTS_BETS.filter(b => b.clientId === a.clientId);
    const wagered = myBets.reduce((s, b) => s + (b.stake || 0), 0);
    const won = myBets.filter(b => b.status === 'won').reduce((s, b) => s + (b.payout || 0), 0);
    const lost = myBets.filter(b => b.status === 'lost').reduce((s, b) => s + (b.stake || 0), 0);
    const openStake = myBets.filter(b => b.status === 'open').reduce((s, b) => s + (b.stake || 0), 0);
    const net = won - lost;
    return {
      account: a,
      client: c,
      wagered,
      won,
      lost,
      openStake,
      net,
      betCount: myBets.length
    };
  });
  if (search) {
    const q = search.toLowerCase();
    rows = rows.filter(r => r.client && (r.client.firstName.toLowerCase().includes(q) || r.client.lastName.toLowerCase().includes(q)) || (r.account.accountNo || '').includes(search));
  }
  const dir = sortDir === 'asc' ? 1 : -1;
  rows = [...rows].sort((a, b) => {
    switch (sortKey) {
      case 'account':
        return (a.account.accountNo || '').localeCompare(b.account.accountNo || '') * dir;
      case 'client':
        return ((a.client?.firstName || '') + (a.client?.lastName || '')).localeCompare((b.client?.firstName || '') + (b.client?.lastName || '')) * dir;
      case 'balance':
        return ((a.account.balance || 0) - (b.account.balance || 0)) * dir;
      case 'wagered':
        return (a.wagered - b.wagered) * dir;
      case 'won':
        return (a.won - b.won) * dir;
      case 'lost':
        return (a.lost - b.lost) * dir;
      case 'net':
        return (a.net - b.net) * dir;
      case 'bets':
        return (a.betCount - b.betCount) * dir;
      default:
        return 0;
    }
  });
  const NAVY = '#1B3955';
  const totalBalance = rows.reduce((s, r) => s + (r.account.balance || 0), 0);
  const totalWagered = rows.reduce((s, r) => s + r.wagered, 0);
  const totalNet = rows.reduce((s, r) => s + r.net, 0);
  function Arrow({
    a,
    d
  }) {
    if (!a) return /*#__PURE__*/React.createElement("svg", {
      width: "8",
      height: "10",
      viewBox: "0 0 24 24",
      fill: "rgba(255,255,255,0.35)",
      style: {
        marginLeft: 4
      }
    }, /*#__PURE__*/React.createElement("path", {
      d: "M7 9l5-5 5 5z M7 15l5 5 5-5z"
    }));
    return /*#__PURE__*/React.createElement("svg", {
      width: "9",
      height: "9",
      viewBox: "0 0 24 24",
      fill: "#5BB0FF",
      style: {
        marginLeft: 4
      }
    }, d === 'asc' ? /*#__PURE__*/React.createElement("path", {
      d: "M7 14l5-5 5 5z"
    }) : /*#__PURE__*/React.createElement("path", {
      d: "M7 10l5 5 5-5z"
    }));
  }
  const cols = [{
    k: 'account',
    l: 'Account #',
    w: 120,
    a: 'center',
    s: true
  }, {
    k: 'client',
    l: 'Bettor',
    w: 200,
    a: 'left',
    s: true
  }, {
    k: 'tier',
    l: 'Tier',
    w: 100,
    a: 'center'
  }, {
    k: 'balance',
    l: 'Balance',
    w: 120,
    a: 'right',
    s: true
  }, {
    k: 'wagered',
    l: 'Wagered',
    w: 120,
    a: 'right',
    s: true
  }, {
    k: 'bets',
    l: 'Bets',
    w: 70,
    a: 'right',
    s: true
  }, {
    k: 'winRate',
    l: 'Win %',
    w: 80,
    a: 'right'
  }, {
    k: 'clv',
    l: 'CLV',
    w: 80,
    a: 'right'
  }, {
    k: 'won',
    l: 'Won',
    w: 110,
    a: 'right',
    s: true
  }, {
    k: 'lost',
    l: 'Lost',
    w: 110,
    a: 'right',
    s: true
  }, {
    k: 'net',
    l: 'Net P/L',
    w: 120,
    a: 'right',
    s: true
  }];
  const grid = cols.map(c => `${c.w}px`).join(' ');
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      flex: 1,
      minHeight: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      padding: '10px 14px',
      minHeight: 50,
      background: 'var(--surface)',
      borderBottom: '1px solid var(--line)',
      flexShrink: 0,
      flexWrap: 'wrap'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      lineHeight: 1.15,
      marginRight: 6
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      fontSize: 14,
      fontWeight: 800,
      color: 'var(--ink)',
      letterSpacing: 0.3
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'Material Symbols Outlined',
      fontSize: 18,
      color: '#7C3AED'
    }
  }, "account_balance_wallet"), "Sports Wallets"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 10,
      color: 'var(--text-3)',
      fontFamily: 'JetBrains Mono, monospace'
    }
  }, rows.length, " bettors \xB7 BAL $", MANAGER.fmt(totalBalance, 0), " \xB7 Wagered $", MANAGER.fmt(totalWagered, 0), " \xB7 Net House ", totalNet <= 0 ? '+' : '−', "$", MANAGER.fmt(Math.abs(totalNet), 0))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 5,
      padding: '5px 9px',
      background: 'var(--bg)',
      border: '1px solid var(--line-2)',
      width: 220,
      height: 28
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'Material Symbols Outlined',
      fontSize: 14,
      color: 'var(--text-3)'
    }
  }, "search"), /*#__PURE__*/React.createElement("input", {
    value: search,
    onChange: e => setSearch(e.target.value),
    placeholder: "Bettor name or account\u2026",
    style: {
      flex: 1,
      fontSize: 11,
      color: 'var(--ink)',
      background: 'transparent',
      outline: 'none',
      border: 'none'
    }
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      overflowY: 'auto',
      background: 'var(--surface)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: grid,
      background: NAVY,
      color: 'rgba(255,255,255,0.92)',
      fontSize: 10,
      fontWeight: 700,
      letterSpacing: 0.6,
      textTransform: 'uppercase',
      fontFamily: 'JetBrains Mono, Roboto Mono, monospace',
      position: 'sticky',
      top: 0,
      zIndex: 5
    }
  }, cols.map(col => /*#__PURE__*/React.createElement("span", {
    key: col.k,
    onClick: col.s ? () => toggleSort(col.k) : undefined,
    style: {
      padding: '7px 8px',
      borderRight: '1px solid rgba(255,255,255,0.12)',
      cursor: col.s ? 'pointer' : 'default',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: col.a === 'right' ? 'flex-end' : col.a === 'left' ? 'flex-start' : 'center',
      background: sortKey === col.k ? 'rgba(91,176,255,0.10)' : 'transparent'
    }
  }, col.l, col.s && /*#__PURE__*/React.createElement(Arrow, {
    a: sortKey === col.k,
    d: sortDir
  })))), rows.map((r, i) => /*#__PURE__*/React.createElement("div", {
    key: r.account.id,
    onClick: () => r.client && setDetailId(r.client.id),
    style: {
      display: 'grid',
      gridTemplateColumns: grid,
      fontSize: 11.5,
      borderBottom: '1px solid #E5E7EB',
      background: i % 2 === 1 ? '#F7F9FC' : 'transparent',
      cursor: 'pointer'
    },
    onMouseEnter: e => {
      e.currentTarget.style.background = '#F4F7FB';
    },
    onMouseLeave: e => {
      e.currentTarget.style.background = i % 2 === 1 ? '#F7F9FC' : 'transparent';
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "mono",
    style: {
      padding: '9px 8px',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: 'var(--ink)',
      fontWeight: 700
    }
  }, "#", r.account.accountNo), /*#__PURE__*/React.createElement("span", {
    style: {
      padding: '9px 10px',
      display: 'inline-flex',
      alignItems: 'center',
      gap: 5,
      color: 'var(--text-2)'
    }
  }, r.client ? /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--ink)',
      fontWeight: 500
    }
  }, r.client.firstName, " ", r.client.lastName), r.client.online && /*#__PURE__*/React.createElement("span", {
    style: {
      width: 7,
      height: 7,
      borderRadius: '50%',
      background: '#22C55E',
      boxShadow: '0 0 4px #22C55E'
    }
  })) : '—'), /*#__PURE__*/React.createElement("span", {
    style: {
      padding: '7px 8px',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center'
    }
  }, (() => {
    const p = MANAGER.SPORTS_PROFILES[r.account.clientId];
    if (!p) return /*#__PURE__*/React.createElement("span", {
      style: {
        padding: '2px 7px',
        fontSize: 9.5,
        fontWeight: 700,
        background: '#F5F5F5',
        color: 'var(--text-3)',
        letterSpacing: 0.4,
        textTransform: 'uppercase'
      }
    }, "NEW");
    const styles = {
      sharp: {
        bg: '#FFE4E6',
        col: '#9F1239',
        icon: '⚠'
      },
      whale: {
        bg: '#EAF2FB',
        col: '#1B3955',
        icon: '🐋'
      },
      recreational: {
        bg: '#E8F5E9',
        col: '#15803D',
        icon: '🎲'
      }
    };
    const s = styles[p.tier] || styles.recreational;
    return /*#__PURE__*/React.createElement("span", {
      style: {
        padding: '2px 7px',
        fontSize: 9.5,
        fontWeight: 800,
        background: p.restricted ? '#FEE2E2' : s.bg,
        color: p.restricted ? '#991B1B' : s.col,
        letterSpacing: 0.4,
        textTransform: 'uppercase',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 3
      }
    }, p.restricted ? '🚫 LIMITED' : `${s.icon} ${p.tier}`);
  })()), /*#__PURE__*/React.createElement("span", {
    className: "mono",
    style: {
      padding: '9px 8px',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'flex-end',
      color: 'var(--ink)',
      fontWeight: 700
    }
  }, "$", MANAGER.fmt(r.account.balance, 0)), /*#__PURE__*/React.createElement("span", {
    className: "mono",
    style: {
      padding: '9px 8px',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'flex-end',
      color: 'var(--text-2)'
    }
  }, "$", MANAGER.fmt(r.wagered, 0)), /*#__PURE__*/React.createElement("span", {
    style: {
      padding: '9px 8px',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'flex-end'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      padding: '2px 7px',
      fontSize: 10,
      fontWeight: 700,
      background: r.betCount > 0 ? '#E3F2FD' : 'var(--bg)',
      color: r.betCount > 0 ? '#0D47A1' : 'var(--text-3)'
    }
  }, r.betCount)), /*#__PURE__*/React.createElement("span", {
    className: "mono",
    style: {
      padding: '9px 8px',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'flex-end',
      color: 'var(--text-2)',
      fontWeight: 600
    }
  }, (() => {
    const p = MANAGER.SPORTS_PROFILES[r.account.clientId];
    return p ? `${(p.winRate * 100).toFixed(0)}%` : '—';
  })()), /*#__PURE__*/React.createElement("span", {
    className: "mono",
    style: {
      padding: '9px 8px',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'flex-end',
      fontWeight: 700
    }
  }, (() => {
    const p = MANAGER.SPORTS_PROFILES[r.account.clientId];
    if (!p) return /*#__PURE__*/React.createElement("span", {
      style: {
        color: 'var(--text-3)'
      }
    }, "\u2014");
    const v = p.clvAvg;
    return /*#__PURE__*/React.createElement("span", {
      style: {
        color: v > 0 ? '#9F1239' : 'var(--text-2)'
      }
    }, v > 0 ? '+' : '', v.toFixed(1));
  })()), /*#__PURE__*/React.createElement("span", {
    className: "mono",
    style: {
      padding: '9px 8px',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'flex-end',
      color: '#15A36C',
      fontWeight: 600
    }
  }, "+$", MANAGER.fmt(r.won, 0)), /*#__PURE__*/React.createElement("span", {
    className: "mono",
    style: {
      padding: '9px 8px',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'flex-end',
      color: '#EF4444',
      fontWeight: 600
    }
  }, "\u2212$", MANAGER.fmt(r.lost, 0)), /*#__PURE__*/React.createElement("span", {
    className: "mono",
    style: {
      padding: '9px 8px',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'flex-end',
      color: r.net >= 0 ? '#15A36C' : '#EF4444',
      fontWeight: 800,
      fontSize: 12
    }
  }, r.net >= 0 ? '+' : '−', "$", MANAGER.fmt(Math.abs(r.net), 0)))), rows.length === 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '40px 16px',
      textAlign: 'center',
      color: 'var(--text-3)',
      fontSize: 12
    }
  }, "No sports wallets match the search.")), detailId && /*#__PURE__*/React.createElement(ClientDetailDrawer, {
    clientId: detailId,
    server: "SPORTS",
    onClose: () => setDetailId(null)
  }));
}

// ── SPORTS Reports — bet aggregations replace position aggregations ──
function SportsReportsScreen({
  quotesOpen,
  setQuotesOpen
}) {
  const [view, setView] = useState('bets'); // bets | by_sport | by_event | top_bettors | activity
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  let bets = MANAGER.SPORTS_BETS;
  if (statusFilter !== 'all') bets = bets.filter(b => b.status === statusFilter);
  if (search) {
    const q = search.toLowerCase();
    bets = bets.filter(b => {
      const c = MANAGER.findClient(b.clientId);
      return b.id.toLowerCase().includes(q) || b.selection.toLowerCase().includes(q) || c && (c.firstName.toLowerCase().includes(q) || c.lastName.toLowerCase().includes(q));
    });
  }

  // Aggregations
  const bySport = {};
  bets.forEach(b => {
    const e = MANAGER.SPORTS_EVENTS.find(x => x.id === b.eventId);
    const sport = e?.sport || 'Unknown';
    if (!bySport[sport]) bySport[sport] = {
      sport,
      count: 0,
      stake: 0,
      won: 0,
      lost: 0,
      liability: 0
    };
    bySport[sport].count++;
    bySport[sport].stake += b.stake || 0;
    if (b.status === 'won') bySport[sport].won += b.payout || 0;
    if (b.status === 'lost') bySport[sport].lost += b.stake || 0;
    if (b.status === 'open') bySport[sport].liability += b.potential || 0;
  });
  const sportRows = Object.values(bySport).sort((a, b) => b.stake - a.stake);
  const byEvent = {};
  bets.forEach(b => {
    const e = MANAGER.SPORTS_EVENTS.find(x => x.id === b.eventId);
    if (!e) return;
    if (!byEvent[e.id]) byEvent[e.id] = {
      event: e,
      count: 0,
      stake: 0,
      liability: 0,
      exposure: {}
    };
    byEvent[e.id].count++;
    byEvent[e.id].stake += b.stake || 0;
    if (b.status === 'open') byEvent[e.id].liability += b.potential || 0;
    byEvent[e.id].exposure[b.selection] = (byEvent[e.id].exposure[b.selection] || 0) + (b.potential || 0);
  });
  const eventRows = Object.values(byEvent).sort((a, b) => b.liability - a.liability);
  const totalStake = bets.reduce((s, b) => s + (b.stake || 0), 0);
  const totalLiability = bets.filter(b => b.status === 'open').reduce((s, b) => s + (b.potential || 0), 0);
  const houseNet = bets.filter(b => b.status === 'lost').reduce((s, b) => s + (b.stake || 0), 0) - bets.filter(b => b.status === 'won').reduce((s, b) => s + ((b.payout || 0) - (b.stake || 0)), 0);
  const NAVY = '#1B3955';
  function Tab({
    id,
    icon,
    label,
    count
  }) {
    const active = view === id;
    return /*#__PURE__*/React.createElement("button", {
      onClick: () => setView(id),
      style: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        padding: '5px 11px',
        background: active ? NAVY : 'transparent',
        color: active ? '#fff' : 'var(--text-2)',
        border: active ? `1px solid ${NAVY}` : '1px solid var(--line-2)',
        cursor: 'pointer',
        fontSize: 11,
        fontWeight: active ? 700 : 500,
        letterSpacing: 0.3
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: 'Material Symbols Outlined',
        fontSize: 13
      }
    }, icon), label, count !== undefined && /*#__PURE__*/React.createElement("span", {
      style: {
        padding: '0 4px',
        fontSize: 9.5,
        fontWeight: 700,
        background: active ? 'rgba(255,255,255,0.18)' : 'var(--bg)',
        color: active ? '#fff' : 'var(--text-3)'
      }
    }, count));
  }
  function Chip({
    active,
    onClick,
    label,
    color
  }) {
    return /*#__PURE__*/React.createElement("button", {
      onClick: onClick,
      style: {
        padding: '4px 9px',
        background: active ? '#EAF2FB' : 'transparent',
        color: active ? NAVY : 'var(--text-2)',
        border: active ? `1px solid ${NAVY}` : '1px solid var(--line-2)',
        cursor: 'pointer',
        fontSize: 11,
        fontWeight: active ? 700 : 500,
        letterSpacing: 0.3,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4
      }
    }, color && /*#__PURE__*/React.createElement("span", {
      style: {
        width: 6,
        height: 6,
        borderRadius: '50%',
        background: color
      }
    }), label);
  }
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      flex: 1,
      minHeight: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      padding: '10px 14px',
      minHeight: 50,
      background: 'var(--surface)',
      borderBottom: '1px solid var(--line)',
      flexShrink: 0,
      flexWrap: 'wrap'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      lineHeight: 1.15,
      marginRight: 6
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      fontSize: 14,
      fontWeight: 800,
      color: 'var(--ink)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'Material Symbols Outlined',
      fontSize: 18,
      color: '#7C3AED'
    }
  }, "analytics"), "Sports Reports"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 10,
      color: 'var(--text-3)',
      fontFamily: 'JetBrains Mono, monospace'
    }
  }, bets.length, " bets \xB7 Stake $", MANAGER.fmt(totalStake, 0), " \xB7 Liability $", MANAGER.fmt(totalLiability, 0), " \xB7 Net House ", houseNet >= 0 ? '+' : '−', "$", MANAGER.fmt(Math.abs(houseNet), 0))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 5,
      padding: '5px 9px',
      background: 'var(--bg)',
      border: '1px solid var(--line-2)',
      width: 200,
      height: 28
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'Material Symbols Outlined',
      fontSize: 14,
      color: 'var(--text-3)'
    }
  }, "search"), /*#__PURE__*/React.createElement("input", {
    value: search,
    onChange: e => setSearch(e.target.value),
    placeholder: "Bet, bettor\u2026",
    style: {
      flex: 1,
      fontSize: 11,
      color: 'var(--ink)',
      background: 'transparent',
      outline: 'none',
      border: 'none'
    }
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 4
    }
  }, /*#__PURE__*/React.createElement(Tab, {
    id: "bets",
    icon: "receipt_long",
    label: "All Bets",
    count: bets.length
  }), /*#__PURE__*/React.createElement(Tab, {
    id: "by_sport",
    icon: "sports",
    label: "By Sport",
    count: sportRows.length
  }), /*#__PURE__*/React.createElement(Tab, {
    id: "by_event",
    icon: "event",
    label: "By Event",
    count: eventRows.length
  }), /*#__PURE__*/React.createElement(Tab, {
    id: "periodic",
    icon: "calendar_month",
    label: "Periodic P/L"
  }), /*#__PURE__*/React.createElement(Tab, {
    id: "top_bettors",
    icon: "emoji_events",
    label: "Top Bettors"
  }), /*#__PURE__*/React.createElement(Tab, {
    id: "activity",
    icon: "manage_history",
    label: "Activity"
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '8px 14px',
      background: '#FAFBFC',
      borderBottom: '1px solid var(--line)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 9,
      fontWeight: 700,
      color: 'var(--text-3)',
      letterSpacing: 0.5,
      textTransform: 'uppercase'
    }
  }, "Status"), /*#__PURE__*/React.createElement(Chip, {
    active: statusFilter === 'all',
    onClick: () => setStatusFilter('all'),
    label: "All"
  }), /*#__PURE__*/React.createElement(Chip, {
    active: statusFilter === 'open',
    onClick: () => setStatusFilter('open'),
    label: "Open",
    color: "#0EA5E9"
  }), /*#__PURE__*/React.createElement(Chip, {
    active: statusFilter === 'won',
    onClick: () => setStatusFilter('won'),
    label: "Won",
    color: "#22C55E"
  }), /*#__PURE__*/React.createElement(Chip, {
    active: statusFilter === 'lost',
    onClick: () => setStatusFilter('lost'),
    label: "Lost",
    color: "#EF4444"
  }), /*#__PURE__*/React.createElement(Chip, {
    active: statusFilter === 'void',
    onClick: () => setStatusFilter('void'),
    label: "Void",
    color: "#9CA3AF"
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      overflowY: 'auto',
      background: 'var(--surface)'
    }
  }, view === 'bets' && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '90px 140px 1fr 130px 80px 80px 100px 100px',
      background: NAVY,
      color: 'rgba(255,255,255,0.92)',
      fontSize: 10,
      fontWeight: 700,
      letterSpacing: 0.6,
      textTransform: 'uppercase',
      fontFamily: 'JetBrains Mono, monospace',
      position: 'sticky',
      top: 0,
      zIndex: 5
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      padding: '7px 8px'
    }
  }, "Bet ID"), /*#__PURE__*/React.createElement("span", {
    style: {
      padding: '7px 8px'
    }
  }, "Placed"), /*#__PURE__*/React.createElement("span", {
    style: {
      padding: '7px 8px'
    }
  }, "Event \xB7 Selection"), /*#__PURE__*/React.createElement("span", {
    style: {
      padding: '7px 8px'
    }
  }, "Bettor"), /*#__PURE__*/React.createElement("span", {
    style: {
      padding: '7px 8px',
      textAlign: 'right'
    }
  }, "Odds"), /*#__PURE__*/React.createElement("span", {
    style: {
      padding: '7px 8px',
      textAlign: 'right'
    }
  }, "Stake"), /*#__PURE__*/React.createElement("span", {
    style: {
      padding: '7px 8px',
      textAlign: 'right'
    }
  }, "Payout"), /*#__PURE__*/React.createElement("span", {
    style: {
      padding: '7px 8px',
      textAlign: 'center'
    }
  }, "Status")), bets.map((b, i) => {
    const c = MANAGER.findClient(b.clientId);
    const e = MANAGER.SPORTS_EVENTS.find(x => x.id === b.eventId);
    return /*#__PURE__*/React.createElement("div", {
      key: b.id,
      style: {
        display: 'grid',
        gridTemplateColumns: '90px 140px 1fr 130px 80px 80px 100px 100px',
        fontSize: 11.5,
        borderBottom: '1px solid #E5E7EB',
        background: i % 2 === 1 ? '#F7F9FC' : 'transparent'
      }
    }, /*#__PURE__*/React.createElement("span", {
      className: "mono",
      style: {
        padding: '7px 8px',
        display: 'inline-flex',
        alignItems: 'center',
        color: 'var(--text-2)'
      }
    }, b.id.toUpperCase()), /*#__PURE__*/React.createElement("span", {
      className: "mono",
      style: {
        padding: '7px 8px',
        display: 'inline-flex',
        alignItems: 'center',
        color: 'var(--text-3)',
        fontSize: 10.5
      }
    }, b.placed), /*#__PURE__*/React.createElement("span", {
      style: {
        padding: '7px 8px',
        display: 'inline-flex',
        flexDirection: 'column',
        justifyContent: 'center'
      }
    }, e && /*#__PURE__*/React.createElement("span", {
      style: {
        color: 'var(--ink)',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis'
      }
    }, e.home, " vs ", e.away), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 10,
        color: '#7C3AED',
        fontWeight: 600
      }
    }, b.selection)), /*#__PURE__*/React.createElement("span", {
      style: {
        padding: '7px 8px',
        display: 'inline-flex',
        alignItems: 'center',
        color: 'var(--text-2)'
      }
    }, c ? /*#__PURE__*/React.createElement("span", {
      style: {
        color: 'var(--ink)',
        fontWeight: 500
      }
    }, c.firstName, " ", c.lastName) : '—'), /*#__PURE__*/React.createElement("span", {
      className: "mono",
      style: {
        padding: '7px 8px',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'flex-end',
        color: b.odds > 0 ? '#15803D' : 'var(--ink)',
        fontWeight: 700
      }
    }, (b.odds > 0 ? '+' : '') + b.odds), /*#__PURE__*/React.createElement("span", {
      className: "mono",
      style: {
        padding: '7px 8px',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'flex-end',
        color: 'var(--ink)',
        fontWeight: 600
      }
    }, "$", MANAGER.fmt(b.stake, 0)), /*#__PURE__*/React.createElement("span", {
      className: "mono",
      style: {
        padding: '7px 8px',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'flex-end',
        color: b.status === 'won' ? '#15A36C' : b.status === 'lost' ? '#EF4444' : 'var(--text-2)',
        fontWeight: 700
      }
    }, "$", MANAGER.fmt(b.status === 'lost' ? 0 : b.payout || b.potential, 0)), /*#__PURE__*/React.createElement("span", {
      style: {
        padding: '7px 8px',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center'
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        padding: '2px 7px',
        fontSize: 9.5,
        fontWeight: 800,
        background: b.status === 'open' ? '#E3F2FD' : b.status === 'won' ? '#E8F5E9' : b.status === 'lost' ? '#FFEBEE' : '#F5F5F5',
        color: b.status === 'open' ? '#0D47A1' : b.status === 'won' ? '#1B5E20' : b.status === 'lost' ? '#C62828' : '#616161',
        textTransform: 'uppercase'
      }
    }, b.status)));
  })), view === 'by_sport' && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '160px 100px 130px 130px 130px 130px',
      background: NAVY,
      color: 'rgba(255,255,255,0.92)',
      fontSize: 10,
      fontWeight: 700,
      letterSpacing: 0.6,
      textTransform: 'uppercase',
      fontFamily: 'JetBrains Mono, monospace'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      padding: '7px 10px'
    }
  }, "Sport"), /*#__PURE__*/React.createElement("span", {
    style: {
      padding: '7px 10px',
      textAlign: 'right'
    }
  }, "Bets"), /*#__PURE__*/React.createElement("span", {
    style: {
      padding: '7px 10px',
      textAlign: 'right'
    }
  }, "Total Stake"), /*#__PURE__*/React.createElement("span", {
    style: {
      padding: '7px 10px',
      textAlign: 'right'
    }
  }, "Payouts (Won)"), /*#__PURE__*/React.createElement("span", {
    style: {
      padding: '7px 10px',
      textAlign: 'right'
    }
  }, "Stake (Lost)"), /*#__PURE__*/React.createElement("span", {
    style: {
      padding: '7px 10px',
      textAlign: 'right'
    }
  }, "Liability (Open)")), sportRows.map((r, i) => /*#__PURE__*/React.createElement("div", {
    key: r.sport,
    style: {
      display: 'grid',
      gridTemplateColumns: '160px 100px 130px 130px 130px 130px',
      fontSize: 11.5,
      borderBottom: '1px solid #E5E7EB',
      background: i % 2 === 1 ? '#F7F9FC' : 'transparent',
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      padding: '10px 10px',
      color: 'var(--ink)',
      fontWeight: 700
    }
  }, r.sport), /*#__PURE__*/React.createElement("span", {
    className: "mono",
    style: {
      padding: '10px 10px',
      textAlign: 'right',
      color: 'var(--text-2)'
    }
  }, r.count), /*#__PURE__*/React.createElement("span", {
    className: "mono",
    style: {
      padding: '10px 10px',
      textAlign: 'right',
      color: 'var(--ink)',
      fontWeight: 700
    }
  }, "$", MANAGER.fmt(r.stake, 0)), /*#__PURE__*/React.createElement("span", {
    className: "mono",
    style: {
      padding: '10px 10px',
      textAlign: 'right',
      color: '#15A36C',
      fontWeight: 600
    }
  }, "$", MANAGER.fmt(r.won, 0)), /*#__PURE__*/React.createElement("span", {
    className: "mono",
    style: {
      padding: '10px 10px',
      textAlign: 'right',
      color: '#EF4444',
      fontWeight: 600
    }
  }, "$", MANAGER.fmt(r.lost, 0)), /*#__PURE__*/React.createElement("span", {
    className: "mono",
    style: {
      padding: '10px 10px',
      textAlign: 'right',
      color: '#B45309',
      fontWeight: 700
    }
  }, "$", MANAGER.fmt(r.liability, 0))))), view === 'by_event' && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 80px 130px 140px 1fr',
      background: NAVY,
      color: 'rgba(255,255,255,0.92)',
      fontSize: 10,
      fontWeight: 700,
      letterSpacing: 0.6,
      textTransform: 'uppercase',
      fontFamily: 'JetBrains Mono, monospace'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      padding: '7px 10px'
    }
  }, "Event"), /*#__PURE__*/React.createElement("span", {
    style: {
      padding: '7px 10px',
      textAlign: 'right'
    }
  }, "Bets"), /*#__PURE__*/React.createElement("span", {
    style: {
      padding: '7px 10px',
      textAlign: 'right'
    }
  }, "Total Stake"), /*#__PURE__*/React.createElement("span", {
    style: {
      padding: '7px 10px',
      textAlign: 'right'
    }
  }, "Liability"), /*#__PURE__*/React.createElement("span", {
    style: {
      padding: '7px 10px'
    }
  }, "Exposure by Selection")), eventRows.map((r, i) => /*#__PURE__*/React.createElement("div", {
    key: r.event.id,
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 80px 130px 140px 1fr',
      fontSize: 11.5,
      borderBottom: '1px solid #E5E7EB',
      background: i % 2 === 1 ? '#F7F9FC' : 'transparent',
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      padding: '10px 10px',
      display: 'flex',
      flexDirection: 'column'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--ink)',
      fontWeight: 600
    }
  }, r.event.home, " vs ", r.event.away), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 9.5,
      color: 'var(--text-3)',
      fontFamily: 'JetBrains Mono, monospace'
    }
  }, r.event.sport, " \xB7 ", r.event.league)), /*#__PURE__*/React.createElement("span", {
    className: "mono",
    style: {
      padding: '10px 10px',
      textAlign: 'right',
      color: 'var(--text-2)'
    }
  }, r.count), /*#__PURE__*/React.createElement("span", {
    className: "mono",
    style: {
      padding: '10px 10px',
      textAlign: 'right',
      color: 'var(--ink)',
      fontWeight: 700
    }
  }, "$", MANAGER.fmt(r.stake, 0)), /*#__PURE__*/React.createElement("span", {
    className: "mono",
    style: {
      padding: '10px 10px',
      textAlign: 'right',
      color: '#B45309',
      fontWeight: 700
    }
  }, "$", MANAGER.fmt(r.liability, 0)), /*#__PURE__*/React.createElement("span", {
    style: {
      padding: '10px 10px',
      display: 'inline-flex',
      flexWrap: 'wrap',
      gap: 4
    }
  }, Object.entries(r.exposure).map(([sel, exp]) => /*#__PURE__*/React.createElement("span", {
    key: sel,
    style: {
      padding: '1px 7px',
      background: '#EAF2FB',
      color: '#1B3955',
      fontSize: 10,
      fontWeight: 600
    }
  }, sel, ": ", /*#__PURE__*/React.createElement("b", {
    className: "mono"
  }, "$", MANAGER.fmt(exp, 0)))))))), view === 'periodic' && /*#__PURE__*/React.createElement(PeriodicPL, {
    items: bets.filter(b => b.status !== 'open'),
    getDate: b => b.settled || b.placed,
    getValue: b => b.status === 'lost' ? b.stake || 0 : b.status === 'won' ? -((b.payout || 0) - (b.stake || 0)) : 0,
    getVolume: b => b.stake || 0,
    valueLabel: "House Net P/L (USD)",
    volumeLabel: "Total Stake (USD)",
    prefix: "$"
  }), view === 'top_bettors' && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '8px 12px',
      background: NAVY,
      color: 'rgba(255,255,255,0.92)',
      fontSize: 10,
      fontWeight: 700,
      letterSpacing: 0.6,
      textTransform: 'uppercase',
      fontFamily: 'JetBrains Mono, monospace'
    }
  }, "Top Bettors by Total Wagered"), (() => {
    const byClient = {};
    bets.forEach(b => {
      if (!byClient[b.clientId]) byClient[b.clientId] = {
        wagered: 0,
        won: 0,
        lost: 0,
        count: 0
      };
      byClient[b.clientId].wagered += b.stake || 0;
      byClient[b.clientId].count++;
      if (b.status === 'won') byClient[b.clientId].won += b.payout || 0;
      if (b.status === 'lost') byClient[b.clientId].lost += b.stake || 0;
    });
    const sorted = Object.entries(byClient).sort((a, b) => b[1].wagered - a[1].wagered);
    return sorted.map(([cid, d], i) => {
      const c = MANAGER.findClient(cid);
      const net = d.won - d.lost;
      return /*#__PURE__*/React.createElement("div", {
        key: cid,
        style: {
          display: 'grid',
          gridTemplateColumns: '40px 1fr 90px 90px 110px 110px',
          padding: '8px 12px',
          fontSize: 11.5,
          borderBottom: '1px solid #E5E7EB',
          background: i % 2 === 1 ? '#F7F9FC' : 'transparent',
          alignItems: 'center'
        }
      }, /*#__PURE__*/React.createElement("span", {
        className: "mono",
        style: {
          color: i < 3 ? '#B45309' : 'var(--text-3)',
          fontWeight: 700
        }
      }, "#", i + 1), /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement("span", {
        style: {
          color: 'var(--ink)',
          fontWeight: 600
        }
      }, c?.firstName, " ", c?.lastName), " ", /*#__PURE__*/React.createElement("span", {
        style: {
          fontSize: 10,
          color: 'var(--text-3)'
        }
      }, "\xB7 ", c?.country)), /*#__PURE__*/React.createElement("span", {
        className: "mono",
        style: {
          textAlign: 'right',
          color: 'var(--text-2)'
        }
      }, d.count, " bets"), /*#__PURE__*/React.createElement("span", {
        className: "mono",
        style: {
          textAlign: 'right',
          color: 'var(--ink)',
          fontWeight: 700
        }
      }, "$", MANAGER.fmt(d.wagered, 0)), /*#__PURE__*/React.createElement("span", {
        className: "mono",
        style: {
          textAlign: 'right',
          color: '#15A36C'
        }
      }, "+$", MANAGER.fmt(d.won, 0)), /*#__PURE__*/React.createElement("span", {
        className: "mono",
        style: {
          textAlign: 'right',
          color: net >= 0 ? '#15A36C' : '#EF4444',
          fontWeight: 700
        }
      }, net >= 0 ? '+' : '−', "$", MANAGER.fmt(Math.abs(net), 0)));
    });
  })()), view === 'activity' && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '8px 12px',
      background: NAVY,
      color: 'rgba(255,255,255,0.92)',
      fontSize: 10,
      fontWeight: 700,
      letterSpacing: 0.6,
      textTransform: 'uppercase',
      fontFamily: 'JetBrains Mono, monospace'
    }
  }, "Sports Activity \u2014 bet & event admin events"), (MANAGER.ADMIN_ACTIVITY || []).filter(a => /bet|event|sport/i.test(a.kind || a.action || '')).map((a, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      padding: '7px 12px',
      fontSize: 11.5,
      borderBottom: '1px solid #E5E7EB',
      background: i % 2 === 1 ? '#F7F9FC' : 'transparent',
      display: 'grid',
      gridTemplateColumns: '140px 130px 1fr 1fr'
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "mono",
    style: {
      color: 'var(--text-2)'
    }
  }, a.ts), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 10,
      padding: '2px 7px',
      background: 'var(--bg)',
      color: 'var(--text-2)',
      fontWeight: 700,
      letterSpacing: 0.4,
      textTransform: 'uppercase',
      justifySelf: 'flex-start'
    }
  }, a.kind || a.action), /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--ink)'
    }
  }, a.target), /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--text-3)'
    }
  }, a.detail || ''))), (MANAGER.ADMIN_ACTIVITY || []).filter(a => /bet|event|sport/i.test(a.kind || a.action || '')).length === 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '40px 16px',
      textAlign: 'center',
      color: 'var(--text-3)',
      fontSize: 12
    }
  }, "No sports activity yet. Settle a bet to create an entry."))));
}

// ── Promos Manager — full screen for active promotions ──
function SportsPromosScreen({
  quotesOpen,
  setQuotesOpen
}) {
  const [promos, setPromos] = useState(() => [...MANAGER.SPORTS_PROMOS]);
  const [editingId, setEditingId] = useState(null);
  const [statusFilter, setStatusFilter] = useState('all');
  function save() {
    MANAGER.SPORTS_PROMOS = [...promos];
  }
  function update(id, key, val) {
    let v = val;
    if (['value', 'uses', 'budget'].includes(key)) v = parseFloat(val) || 0;
    setPromos(prev => prev.map(p => p.id === id ? {
      ...p,
      [key]: v
    } : p));
    const idx = MANAGER.SPORTS_PROMOS.findIndex(p => p.id === id);
    if (idx >= 0) MANAGER.SPORTS_PROMOS[idx] = {
      ...MANAGER.SPORTS_PROMOS[idx],
      [key]: v
    };
  }
  function remove(id) {
    if (!confirm('Delete this promotion?')) return;
    setPromos(prev => prev.filter(p => p.id !== id));
    const idx = MANAGER.SPORTS_PROMOS.findIndex(p => p.id === id);
    if (idx >= 0) MANAGER.SPORTS_PROMOS.splice(idx, 1);
  }
  function addPromo() {
    const id = 'p' + String(promos.length + 1).padStart(3, '0');
    const p = {
      id,
      name: 'New Promotion',
      type: 'free_bet',
      value: 25,
      status: 'active',
      uses: 0,
      budget: 5000,
      expires: '2026-12-31'
    };
    setPromos(prev => [...prev, p]);
    MANAGER.SPORTS_PROMOS.push(p);
    setEditingId(id);
  }
  let rows = promos;
  if (statusFilter !== 'all') rows = rows.filter(p => p.status === statusFilter);
  const NAVY = '#1B3955';
  const typeStyles = {
    risk_free: {
      bg: '#FEE2E2',
      col: '#9F1239',
      label: 'RISK-FREE'
    },
    odds_boost: {
      bg: '#FEF3C7',
      col: '#B45309',
      label: 'ODDS BOOST'
    },
    deposit_match: {
      bg: '#E3F2FD',
      col: '#0D47A1',
      label: 'DEPOSIT MATCH'
    },
    free_bet: {
      bg: '#E8F5E9',
      col: '#15803D',
      label: 'FREE BET'
    },
    cashback: {
      bg: '#F3E5F5',
      col: '#6A1B9A',
      label: 'CASHBACK'
    }
  };
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      flex: 1,
      minHeight: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      padding: '10px 14px',
      minHeight: 50,
      background: 'var(--surface)',
      borderBottom: '1px solid var(--line)',
      flexWrap: 'wrap'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      lineHeight: 1.15,
      marginRight: 6
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      fontSize: 14,
      fontWeight: 800,
      color: 'var(--ink)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'Material Symbols Outlined',
      fontSize: 18,
      color: '#7C3AED'
    }
  }, "redeem"), "Promotions"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 10,
      color: 'var(--text-3)',
      fontFamily: 'JetBrains Mono, monospace'
    }
  }, rows.length, " promos \xB7 ", promos.filter(p => p.status === 'active').length, " active \xB7 Total budget $", MANAGER.fmt(promos.reduce((s, p) => s + (p.budget || 0), 0), 0))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 4
    }
  }, ['all', 'active', 'expired', 'paused'].map(s => /*#__PURE__*/React.createElement("button", {
    key: s,
    onClick: () => setStatusFilter(s),
    style: {
      padding: '4px 10px',
      background: statusFilter === s ? '#EAF2FB' : 'transparent',
      color: statusFilter === s ? NAVY : 'var(--text-2)',
      border: statusFilter === s ? `1px solid ${NAVY}` : '1px solid var(--line-2)',
      cursor: 'pointer',
      fontSize: 11,
      fontWeight: statusFilter === s ? 700 : 500,
      textTransform: 'capitalize'
    }
  }, s))), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1
    }
  }), /*#__PURE__*/React.createElement("button", {
    onClick: addPromo,
    style: {
      padding: '6px 12px',
      background: NAVY,
      border: 'none',
      color: '#fff',
      fontSize: 11,
      fontWeight: 700,
      cursor: 'pointer',
      display: 'inline-flex',
      alignItems: 'center',
      gap: 5,
      letterSpacing: 0.4
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'Material Symbols Outlined',
      fontSize: 14
    }
  }, "add"), "New Promo")), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      overflowY: 'auto',
      background: 'var(--surface)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 130px 90px 90px 130px 110px 100px',
      background: NAVY,
      color: 'rgba(255,255,255,0.92)',
      fontSize: 10,
      fontWeight: 700,
      letterSpacing: 0.6,
      textTransform: 'uppercase',
      fontFamily: 'JetBrains Mono, monospace',
      position: 'sticky',
      top: 0,
      zIndex: 5
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      padding: '7px 10px'
    }
  }, "Promotion"), /*#__PURE__*/React.createElement("span", {
    style: {
      padding: '7px 10px'
    }
  }, "Type"), /*#__PURE__*/React.createElement("span", {
    style: {
      padding: '7px 10px',
      textAlign: 'right'
    }
  }, "Value"), /*#__PURE__*/React.createElement("span", {
    style: {
      padding: '7px 10px',
      textAlign: 'right'
    }
  }, "Uses"), /*#__PURE__*/React.createElement("span", {
    style: {
      padding: '7px 10px'
    }
  }, "Budget Used"), /*#__PURE__*/React.createElement("span", {
    style: {
      padding: '7px 10px'
    }
  }, "Expires"), /*#__PURE__*/React.createElement("span", {
    style: {
      padding: '7px 10px',
      textAlign: 'right'
    }
  }, "Actions")), rows.map((p, i) => {
    const editing = editingId === p.id;
    const ts = typeStyles[p.type] || typeStyles.free_bet;
    const budgetPct = Math.min(100, p.uses * (p.value || 0) / Math.max(1, p.budget) * 100);
    return /*#__PURE__*/React.createElement("div", {
      key: p.id,
      style: {
        display: 'grid',
        gridTemplateColumns: '1fr 130px 90px 90px 130px 110px 100px',
        fontSize: 11.5,
        borderBottom: '1px solid #E5E7EB',
        background: editing ? '#FEF3C7' : i % 2 === 1 ? '#F7F9FC' : 'transparent',
        alignItems: 'center'
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        padding: '6px 10px'
      }
    }, editing ? /*#__PURE__*/React.createElement("input", {
      value: p.name,
      onChange: e => update(p.id, 'name', e.target.value),
      style: {
        width: '100%',
        padding: '4px 8px',
        border: '1px solid var(--line-2)',
        fontSize: 12,
        boxSizing: 'border-box'
      }
    }) : /*#__PURE__*/React.createElement("span", {
      style: {
        color: 'var(--ink)',
        fontWeight: 600
      }
    }, p.name)), /*#__PURE__*/React.createElement("span", {
      style: {
        padding: '6px 10px'
      }
    }, editing ? /*#__PURE__*/React.createElement("select", {
      value: p.type,
      onChange: e => update(p.id, 'type', e.target.value),
      style: {
        padding: '3px 6px',
        border: '1px solid var(--line-2)',
        fontSize: 10.5
      }
    }, Object.keys(typeStyles).map(k => /*#__PURE__*/React.createElement("option", {
      key: k
    }, k))) : /*#__PURE__*/React.createElement("span", {
      style: {
        padding: '2px 7px',
        fontSize: 9.5,
        fontWeight: 800,
        background: ts.bg,
        color: ts.col,
        letterSpacing: 0.4
      }
    }, ts.label)), /*#__PURE__*/React.createElement("span", {
      className: "mono",
      style: {
        padding: '6px 10px',
        textAlign: 'right'
      }
    }, editing ? /*#__PURE__*/React.createElement("input", {
      type: "number",
      value: p.value,
      onChange: e => update(p.id, 'value', e.target.value),
      style: {
        width: 80,
        padding: '3px 6px',
        border: '1px solid var(--line-2)',
        fontSize: 11,
        fontFamily: 'JetBrains Mono, monospace',
        textAlign: 'right'
      }
    }) : /*#__PURE__*/React.createElement("span", {
      style: {
        color: 'var(--ink)',
        fontWeight: 700
      }
    }, p.type === 'odds_boost' || p.type === 'cashback' ? p.value + '%' : '$' + p.value)), /*#__PURE__*/React.createElement("span", {
      className: "mono",
      style: {
        padding: '6px 10px',
        textAlign: 'right',
        color: 'var(--text-2)'
      }
    }, MANAGER.fmt(p.uses, 0)), /*#__PURE__*/React.createElement("span", {
      style: {
        padding: '6px 10px',
        display: 'flex',
        flexDirection: 'column',
        gap: 3
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        height: 4,
        background: '#E5E7EB',
        overflow: 'hidden'
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        width: budgetPct + '%',
        height: '100%',
        background: budgetPct > 80 ? '#EF4444' : budgetPct > 50 ? '#F59E0B' : '#22C55E'
      }
    })), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 9.5,
        color: 'var(--text-3)',
        fontFamily: 'JetBrains Mono, monospace'
      }
    }, budgetPct.toFixed(0), "% \xB7 $", MANAGER.fmt(p.budget, 0))), /*#__PURE__*/React.createElement("span", {
      style: {
        padding: '6px 10px'
      }
    }, editing ? /*#__PURE__*/React.createElement("input", {
      type: "date",
      value: p.expires,
      onChange: e => update(p.id, 'expires', e.target.value),
      style: {
        padding: '3px 6px',
        border: '1px solid var(--line-2)',
        fontSize: 10.5,
        fontFamily: 'JetBrains Mono, monospace'
      }
    }) : /*#__PURE__*/React.createElement("span", {
      className: "mono",
      style: {
        fontSize: 10.5,
        color: 'var(--text-2)'
      }
    }, p.expires), /*#__PURE__*/React.createElement("select", {
      value: p.status,
      onChange: e => update(p.id, 'status', e.target.value),
      style: {
        marginLeft: 0,
        marginTop: 2,
        padding: '2px 5px',
        border: '1px solid var(--line-2)',
        fontSize: 9.5,
        background: p.status === 'active' ? '#E8F5E9' : p.status === 'paused' ? '#FEF3C7' : '#FEE2E2',
        color: p.status === 'active' ? '#15803D' : p.status === 'paused' ? '#B45309' : '#9F1239',
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: 0.3
      }
    }, /*#__PURE__*/React.createElement("option", null, "active"), /*#__PURE__*/React.createElement("option", null, "paused"), /*#__PURE__*/React.createElement("option", null, "expired"))), /*#__PURE__*/React.createElement("span", {
      style: {
        padding: '6px 10px',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'flex-end',
        gap: 4
      }
    }, /*#__PURE__*/React.createElement("button", {
      onClick: () => setEditingId(editing ? null : p.id),
      title: editing ? 'Done' : 'Edit',
      style: {
        width: 24,
        height: 24,
        padding: 0,
        background: editing ? '#22C55E' : 'var(--bg)',
        color: editing ? '#fff' : 'var(--text-2)',
        border: '1px solid var(--line-2)',
        cursor: 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center'
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: 'Material Symbols Outlined',
        fontSize: 13
      }
    }, editing ? 'check' : 'edit')), /*#__PURE__*/React.createElement("button", {
      onClick: () => remove(p.id),
      title: "Delete",
      style: {
        width: 24,
        height: 24,
        padding: 0,
        background: '#FFEBEE',
        color: '#C62828',
        border: '1px solid #FECACA',
        cursor: 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center'
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: 'Material Symbols Outlined',
        fontSize: 13
      }
    }, "delete"))));
  }), rows.length === 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '40px 16px',
      textAlign: 'center',
      color: 'var(--text-3)',
      fontSize: 12
    }
  }, "No promotions match this filter.")));
}

// ── Sharp Action Alert — top-right toast widget for high-risk bets ──
function SharpActionAlert() {
  const [alerts, setAlerts] = useState([]);
  const [seen, setSeen] = useState(new Set());
  // Auto-spawn alerts when a sharp/restricted bettor's bet exists in the live feed
  useEffect(() => {
    const id = setInterval(() => {
      const feed = MANAGER.SPORTS_LIVE_FEED || [];
      const profiles = MANAGER.SPORTS_PROFILES || {};
      feed.forEach((f, i) => {
        const key = f.ts + '-' + i;
        const p = profiles[f.clientId];
        if (!p) return;
        if ((p.tier === 'sharp' || p.tier === 'whale' || p.restricted) && !seen.has(key)) {
          const c = MANAGER.findClient(f.clientId);
          setAlerts(prev => [{
            id: key,
            client: c,
            profile: p,
            feed: f,
            ts: Date.now()
          }, ...prev.slice(0, 4)]);
          setSeen(prev => new Set([...prev, key]));
        }
      });
    }, 4000);
    return () => clearInterval(id);
  }, [seen]);
  // Auto-fade after 12s
  useEffect(() => {
    if (alerts.length === 0) return;
    const timers = alerts.map(a => setTimeout(() => setAlerts(prev => prev.filter(x => x.id !== a.id)), 12000));
    return () => timers.forEach(clearTimeout);
  }, [alerts]);
  function dismiss(id) {
    setAlerts(prev => prev.filter(a => a.id !== id));
  }
  if (alerts.length === 0) return null;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'fixed',
      top: 60,
      right: 14,
      zIndex: 200,
      display: 'flex',
      flexDirection: 'column',
      gap: 6,
      maxWidth: 340
    }
  }, alerts.map(a => {
    const tier = a.profile.restricted ? 'LIMITED' : a.profile.tier.toUpperCase();
    const color = a.profile.restricted ? '#9F1239' : a.profile.tier === 'sharp' ? '#9F1239' : '#1B3955';
    const bg = a.profile.restricted ? '#FEE2E2' : a.profile.tier === 'sharp' ? '#FEE2E2' : '#EAF2FB';
    return /*#__PURE__*/React.createElement("div", {
      key: a.id,
      style: {
        background: bg,
        borderLeft: `4px solid ${color}`,
        padding: '8px 12px',
        boxShadow: '0 6px 18px rgba(15,23,41,0.15)',
        display: 'flex',
        flexDirection: 'column',
        gap: 3,
        animation: 'mgrFadeIn .25s ease'
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 6
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: 'Material Symbols Outlined',
        fontSize: 16,
        color
      }
    }, "warning"), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 9.5,
        fontWeight: 800,
        color,
        letterSpacing: 0.5
      }
    }, tier, " ACTION"), /*#__PURE__*/React.createElement("span", {
      style: {
        flex: 1
      }
    }), /*#__PURE__*/React.createElement("button", {
      onClick: () => dismiss(a.id),
      style: {
        background: 'transparent',
        border: 'none',
        cursor: 'pointer',
        color,
        fontSize: 14,
        padding: 0,
        lineHeight: 1
      }
    }, "\xD7")), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 11.5,
        color: 'var(--ink)',
        fontWeight: 600
      }
    }, a.client?.firstName, " ", a.client?.lastName, " \xB7 $", MANAGER.fmt(a.feed.amount, 0), " on ", a.feed.selection), /*#__PURE__*/React.createElement("div", {
      className: "mono",
      style: {
        fontSize: 10,
        color: 'var(--text-3)'
      }
    }, "odds ", a.feed.odds > 0 ? '+' : '', a.feed.odds, " \xB7 Win% ", (a.profile.winRate * 100).toFixed(0), " \xB7 CLV ", a.profile.clvAvg > 0 ? '+' : '', a.profile.clvAvg));
  }));
}

// ── Risk Heatmap — visual liability per event ──
function SportsRiskHeatmap() {
  const NAVY = '#1B3955';
  // Calculate liability per event
  const events = MANAGER.SPORTS_EVENTS.map(ev => {
    const bets = MANAGER.SPORTS_BETS.filter(b => b.eventId === ev.id && b.status === 'open');
    const liability = bets.reduce((s, b) => s + (b.potential || 0), 0);
    const stake = bets.reduce((s, b) => s + (b.stake || 0), 0);
    // Side exposure
    const sideMap = {};
    bets.forEach(b => {
      sideMap[b.selection] = (sideMap[b.selection] || 0) + (b.potential || 0);
    });
    const maxSide = Math.max(...Object.values(sideMap), 0);
    return {
      ev,
      bets,
      liability,
      stake,
      sides: sideMap,
      maxSide
    };
  }).sort((a, b) => b.liability - a.liability);
  const maxLiability = Math.max(...events.map(e => e.liability), 1);
  function heatColor(value, max) {
    if (value === 0) return '#F3F4F6';
    const intensity = Math.min(1, value / max);
    if (intensity < 0.3) return '#FEF3C7';
    if (intensity < 0.6) return '#FED7AA';
    if (intensity < 0.85) return '#FECACA';
    return '#FCA5A5';
  }
  return /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '14px 14px',
      background: '#FAFBFC'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 10
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 11,
      fontWeight: 800,
      color: 'var(--ink)',
      letterSpacing: 0.4,
      textTransform: 'uppercase'
    }
  }, "Liability Heatmap \u2014 exposure by event"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 10,
      color: 'var(--text-3)',
      fontFamily: 'JetBrains Mono, monospace',
      display: 'inline-flex',
      alignItems: 'center',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("span", null, "scale:"), [['#F3F4F6', '0'], ['#FEF3C7', 'low'], ['#FED7AA', 'med'], ['#FECACA', 'high'], ['#FCA5A5', 'max']].map(([c, l]) => /*#__PURE__*/React.createElement("span", {
    key: l,
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 3
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 14,
      height: 10,
      background: c,
      border: '1px solid var(--line-2)'
    }
  }), l)))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
      gap: 10
    }
  }, events.map(({
    ev,
    bets,
    liability,
    stake,
    sides
  }) => /*#__PURE__*/React.createElement("div", {
    key: ev.id,
    style: {
      background: heatColor(liability, maxLiability),
      border: '1px solid var(--line-2)',
      padding: '10px 12px',
      display: 'flex',
      flexDirection: 'column',
      gap: 5
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 5
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 9.5,
      fontWeight: 800,
      color: 'var(--text-2)',
      letterSpacing: 0.5
    }
  }, ev.sport), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 9,
      color: 'var(--text-3)',
      fontFamily: 'JetBrains Mono, monospace'
    }
  }, ev.status === 'live' ? `LIVE ${ev.scoreAway}-${ev.scoreHome}` : ev.start.slice(11, 16))), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      fontWeight: 700,
      color: 'var(--ink)'
    }
  }, ev.awayAbbr, " @ ", ev.homeAbbr), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      fontSize: 9.5,
      color: 'var(--text-2)',
      fontFamily: 'JetBrains Mono, monospace'
    }
  }, /*#__PURE__*/React.createElement("span", null, "Stake"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontWeight: 700
    }
  }, "$", MANAGER.fmt(stake, 0))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      fontSize: 9.5,
      color: 'var(--text-2)',
      fontFamily: 'JetBrains Mono, monospace'
    }
  }, /*#__PURE__*/React.createElement("span", null, "Liability"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontWeight: 800,
      color: '#9F1239'
    }
  }, "$", MANAGER.fmt(liability, 0))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      fontSize: 9.5,
      color: 'var(--text-2)',
      fontFamily: 'JetBrains Mono, monospace'
    }
  }, /*#__PURE__*/React.createElement("span", null, bets.length, " open bet", bets.length === 1 ? '' : 's')), Object.entries(sides).length > 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      borderTop: '1px solid rgba(15,23,41,0.10)',
      paddingTop: 4,
      marginTop: 2,
      display: 'flex',
      flexDirection: 'column',
      gap: 2
    }
  }, Object.entries(sides).sort((a, b) => b[1] - a[1]).map(([sel, exp]) => /*#__PURE__*/React.createElement("div", {
    key: sel,
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      fontSize: 9,
      fontFamily: 'JetBrains Mono, monospace'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--text-2)',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
      maxWidth: 140
    }
  }, sel), /*#__PURE__*/React.createElement("span", {
    style: {
      fontWeight: 700,
      color: 'var(--ink)'
    }
  }, "$", MANAGER.fmt(exp, 0)))))))), events.length === 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '40px 16px',
      textAlign: 'center',
      color: 'var(--text-3)',
      fontSize: 12
    }
  }, "No active liability."));
}

// ── Settlement Queue — finished/live events with pending bets ──
function SportsSettlementQueue({
  settleBet
}) {
  const NAVY = '#1B3955';
  const [tick, setTick] = useState(0);
  // Persisted mode toggle (auto vs manual)
  const [mode, setMode] = useState(() => MANAGER.AUTO_SETTLE.enabled ? 'auto' : 'manual');
  function setSettleMode(m) {
    MANAGER.AUTO_SETTLE.enabled = m === 'auto';
    setMode(m);
    if (MANAGER.ADMIN_ACTIVITY) MANAGER.ADMIN_ACTIVITY.unshift({
      ts: new Date().toISOString().slice(0, 19).replace('T', ' '),
      admin: 'admin@alpexa.com',
      kind: 'settle_mode',
      target: 'sports',
      detail: `Mode → ${m.toUpperCase()}`
    });
  }
  // Auto-run effect: when in auto mode, periodically scan finished events and settle
  useEffect(() => {
    if (mode !== 'auto') return;
    const id = setInterval(() => {
      let total = 0;
      MANAGER.SPORTS_EVENTS.forEach(e => {
        if (e.status === 'finished') {
          const r = MANAGER.autoSettleEvent(e.id);
          total += r.settled;
        }
      });
      if (total > 0) setTick(t => t + 1);
    }, 3000);
    return () => clearInterval(id);
  }, [mode]);
  function refresh() {
    setTick(t => t + 1);
  }
  function autoSettleEvent(eventId) {
    const r = MANAGER.autoSettleEvent(eventId);
    alert(`Auto-settle: ${r.settled} resolved, ${r.skipped} skipped (require manual review).`);
    refresh();
  }
  function finishAndAutoSettle(eventId) {
    if (!confirm('Mark this event FINISHED?' + (mode === 'auto' ? ' Bets will be auto-settled.' : ' Then click Auto-Settle Event.'))) return;
    MANAGER.finishEvent(eventId);
    if (mode === 'auto') {
      const r = MANAGER.autoSettleEvent(eventId);
      alert(`Event finished. Auto-settled ${r.settled} bets, ${r.skipped} skipped (manual review required).`);
    }
    refresh();
  }
  function autoSettleAll() {
    let totalSettled = 0,
      totalSkipped = 0;
    MANAGER.SPORTS_EVENTS.forEach(e => {
      const r = MANAGER.autoSettleEvent(e.id);
      totalSettled += r.settled;
      totalSkipped += r.skipped;
    });
    alert(`Auto-settled ${totalSettled} bets across all eligible events. ${totalSkipped} require manual review.`);
    refresh();
  }
  // Include both live + finished (finished but still has open bets needs settlement)
  const eligibleEvents = MANAGER.SPORTS_EVENTS.filter(ev => ev.status === 'live' || ev.status === 'finished');
  const events = eligibleEvents.map(ev => {
    const bets = MANAGER.SPORTS_BETS.filter(b => b.eventId === ev.id && b.status === 'open');
    const stake = bets.reduce((s, b) => s + (b.stake || 0), 0);
    const liability = bets.reduce((s, b) => s + (b.potential || 0), 0);
    return {
      ev,
      bets,
      stake,
      liability
    };
  }).filter(e => e.bets.length > 0);
  return /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '14px 14px',
      background: '#FAFBFC'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 10,
      gap: 10,
      flexWrap: 'wrap'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 11,
      fontWeight: 800,
      color: 'var(--ink)',
      letterSpacing: 0.4,
      textTransform: 'uppercase'
    }
  }, "Pending Settlement \u2014 live & finished events with open bets"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 10,
      color: 'var(--text-3)',
      fontFamily: 'JetBrains Mono, monospace'
    }
  }, events.length, " events \xB7 ", events.reduce((s, e) => s + e.bets.length, 0), " bets awaiting"), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 0,
      border: '1px solid var(--line-2)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      padding: '3px 8px',
      fontSize: 9,
      fontWeight: 800,
      color: 'var(--text-3)',
      letterSpacing: 0.5,
      background: 'var(--bg)',
      borderRight: '1px solid var(--line-2)'
    }
  }, "MODE"), /*#__PURE__*/React.createElement("button", {
    onClick: () => setSettleMode('auto'),
    style: {
      padding: '4px 12px',
      background: mode === 'auto' ? '#15803D' : 'transparent',
      color: mode === 'auto' ? '#fff' : 'var(--text-2)',
      border: 'none',
      fontSize: 10.5,
      fontWeight: 700,
      cursor: 'pointer',
      letterSpacing: 0.4,
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'Material Symbols Outlined',
      fontSize: 13
    }
  }, "auto_awesome"), "AUTO"), /*#__PURE__*/React.createElement("button", {
    onClick: () => setSettleMode('manual'),
    style: {
      padding: '4px 12px',
      background: mode === 'manual' ? '#1B3955' : 'transparent',
      color: mode === 'manual' ? '#fff' : 'var(--text-2)',
      border: 'none',
      borderLeft: '1px solid var(--line-2)',
      fontSize: 10.5,
      fontWeight: 700,
      cursor: 'pointer',
      letterSpacing: 0.4,
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'Material Symbols Outlined',
      fontSize: 13
    }
  }, "pan_tool"), "MANUAL")), mode === 'auto' && /*#__PURE__*/React.createElement("button", {
    onClick: autoSettleAll,
    title: "Settle all decided bets now",
    style: {
      padding: '5px 11px',
      background: '#15803D',
      color: '#fff',
      border: 'none',
      fontSize: 10.5,
      fontWeight: 700,
      cursor: 'pointer',
      letterSpacing: 0.4,
      display: 'inline-flex',
      alignItems: 'center',
      gap: 5
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'Material Symbols Outlined',
      fontSize: 13
    }
  }, "flash_on"), "Run Now")), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '7px 12px',
      marginBottom: 8,
      background: mode === 'auto' ? '#E8F5E9' : '#EAF2FB',
      borderLeft: `3px solid ${mode === 'auto' ? '#15803D' : '#1B3955'}`,
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      fontSize: 10.5
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'Material Symbols Outlined',
      fontSize: 15,
      color: mode === 'auto' ? '#15803D' : '#1B3955'
    }
  }, mode === 'auto' ? 'auto_awesome' : 'pan_tool'), mode === 'auto' ? /*#__PURE__*/React.createElement("span", {
    style: {
      color: '#15803D'
    }
  }, /*#__PURE__*/React.createElement("b", null, "AUTO MODE"), " \u2014 Finished events with clear outcomes are settled automatically every 3 seconds. Ambiguous bets (no score yet, push, special markets) stay in queue for manual review.") : /*#__PURE__*/React.createElement("span", {
    style: {
      color: '#1B3955'
    }
  }, /*#__PURE__*/React.createElement("b", null, "MANUAL MODE"), " \u2014 Bets remain open until you click W / L / V buttons individually. Use the per-event ", /*#__PURE__*/React.createElement("b", null, "Auto-Settle"), " button to batch-process when needed.")), events.length === 0 ? /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '40px 16px',
      textAlign: 'center',
      color: 'var(--text-3)',
      fontSize: 12,
      background: 'var(--surface)',
      border: '1px solid var(--line)'
    }
  }, "No events pending settlement. Live games' bets will appear here as games conclude.") : events.map(({
    ev,
    bets,
    stake,
    liability
  }) => /*#__PURE__*/React.createElement("div", {
    key: ev.id,
    style: {
      background: 'var(--surface)',
      border: '1px solid var(--line)',
      marginBottom: 10
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '10px 14px',
      background: ev.status === 'live' ? '#FFF7ED' : '#F0FDF4',
      borderBottom: '1px solid var(--line)',
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      flexWrap: 'wrap'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      padding: '2px 7px',
      fontSize: 9,
      fontWeight: 800,
      color: '#fff',
      background: ev.status === 'live' ? '#EA580C' : '#15803D',
      letterSpacing: 0.4
    }
  }, ev.status.toUpperCase()), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 13,
      fontWeight: 700,
      color: 'var(--ink)'
    }
  }, ev.awayTeam, " @ ", ev.homeTeam), /*#__PURE__*/React.createElement("span", {
    className: "mono",
    style: {
      fontSize: 14,
      fontWeight: 800,
      color: ev.status === 'live' ? '#EA580C' : '#15803D'
    }
  }, ev.awayAbbr, " ", ev.scoreAway, " \u2013 ", ev.scoreHome, " ", ev.homeAbbr), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 10,
      color: 'var(--text-3)',
      fontFamily: 'JetBrains Mono, monospace'
    }
  }, "Stake ", /*#__PURE__*/React.createElement("b", {
    style: {
      color: 'var(--ink)'
    }
  }, "$", MANAGER.fmt(stake, 0)), " \xB7 Liability ", /*#__PURE__*/React.createElement("b", {
    style: {
      color: '#9F1239'
    }
  }, "$", MANAGER.fmt(liability, 0))), ev.status === 'live' && /*#__PURE__*/React.createElement("button", {
    onClick: () => finishAndAutoSettle(ev.id),
    title: "Mark finished and auto-settle",
    style: {
      padding: '4px 10px',
      background: '#15803D',
      color: '#fff',
      border: 'none',
      fontSize: 10.5,
      fontWeight: 700,
      cursor: 'pointer',
      letterSpacing: 0.4,
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'Material Symbols Outlined',
      fontSize: 13
    }
  }, "flag"), "Finish + Auto"), ev.status === 'finished' && /*#__PURE__*/React.createElement("button", {
    onClick: () => autoSettleEvent(ev.id),
    title: "Auto-settle decided bets",
    style: {
      padding: '4px 10px',
      background: '#15803D',
      color: '#fff',
      border: 'none',
      fontSize: 10.5,
      fontWeight: 700,
      cursor: 'pointer',
      letterSpacing: 0.4,
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'Material Symbols Outlined',
      fontSize: 13
    }
  }, "auto_awesome"), "Auto-Settle Event")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '90px 1fr 130px 80px 60px 90px 90px 130px',
      background: '#0F1B2D',
      color: 'rgba(255,255,255,0.7)',
      fontSize: 9.5,
      fontWeight: 700,
      letterSpacing: 0.5,
      textTransform: 'uppercase'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      padding: '5px 10px'
    }
  }, "Bet ID"), /*#__PURE__*/React.createElement("span", {
    style: {
      padding: '5px 10px'
    }
  }, "Bettor"), /*#__PURE__*/React.createElement("span", {
    style: {
      padding: '5px 10px'
    }
  }, "Selection"), /*#__PURE__*/React.createElement("span", {
    style: {
      padding: '5px 10px',
      textAlign: 'right'
    }
  }, "Stake"), /*#__PURE__*/React.createElement("span", {
    style: {
      padding: '5px 10px',
      textAlign: 'right'
    }
  }, "Odds"), /*#__PURE__*/React.createElement("span", {
    style: {
      padding: '5px 10px',
      textAlign: 'right'
    }
  }, "Payout"), /*#__PURE__*/React.createElement("span", {
    style: {
      padding: '5px 10px',
      textAlign: 'center'
    }
  }, "Auto"), /*#__PURE__*/React.createElement("span", {
    style: {
      padding: '5px 10px',
      textAlign: 'right'
    }
  }, "Manual Settle")), bets.map((b, i) => {
    const c = MANAGER.findClient(b.clientId);
    // Auto-evaluation preview (what auto-settle would decide)
    const autoEval = MANAGER.autoEvaluateBet(b, ev);
    return /*#__PURE__*/React.createElement("div", {
      key: b.id,
      style: {
        display: 'grid',
        gridTemplateColumns: '90px 1fr 130px 80px 60px 90px 90px 130px',
        padding: '7px 0',
        fontSize: 11.5,
        borderBottom: '1px solid #E5E7EB',
        background: i % 2 === 1 ? '#F7F9FC' : 'transparent',
        alignItems: 'center'
      }
    }, /*#__PURE__*/React.createElement("span", {
      className: "mono",
      style: {
        padding: '4px 10px',
        color: 'var(--text-2)'
      }
    }, b.id.toUpperCase()), /*#__PURE__*/React.createElement("span", {
      style: {
        padding: '4px 10px',
        color: 'var(--ink)'
      }
    }, c ? `${c.firstName} ${c.lastName}` : '—'), /*#__PURE__*/React.createElement("span", {
      style: {
        padding: '4px 10px',
        color: '#7C3AED',
        fontWeight: 600
      }
    }, b.selection), /*#__PURE__*/React.createElement("span", {
      className: "mono",
      style: {
        padding: '4px 10px',
        textAlign: 'right',
        color: 'var(--ink)',
        fontWeight: 700
      }
    }, "$", MANAGER.fmt(b.stake, 0)), /*#__PURE__*/React.createElement("span", {
      className: "mono",
      style: {
        padding: '4px 10px',
        textAlign: 'right',
        color: b.odds > 0 ? '#15803D' : 'var(--ink)',
        fontWeight: 700
      }
    }, b.odds > 0 ? '+' : '', b.odds), /*#__PURE__*/React.createElement("span", {
      className: "mono",
      style: {
        padding: '4px 10px',
        textAlign: 'right',
        color: '#9F1239',
        fontWeight: 700
      }
    }, "$", MANAGER.fmt(b.potential, 0)), /*#__PURE__*/React.createElement("span", {
      style: {
        padding: '4px 10px',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center'
      }
    }, autoEval ? /*#__PURE__*/React.createElement("span", {
      title: "Auto-settle preview (what system would decide)",
      style: {
        padding: '2px 6px',
        fontSize: 9.5,
        fontWeight: 800,
        background: autoEval === 'won' ? '#E8F5E9' : autoEval === 'lost' ? '#FFEBEE' : '#F5F5F5',
        color: autoEval === 'won' ? '#1B5E20' : autoEval === 'lost' ? '#C62828' : '#616161',
        letterSpacing: 0.4
      }
    }, "AUTO \u2192 ", autoEval.toUpperCase()) : /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 9,
        color: 'var(--text-3)'
      }
    }, "manual only")), /*#__PURE__*/React.createElement("span", {
      style: {
        padding: '3px 10px',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'flex-end',
        gap: 3
      }
    }, /*#__PURE__*/React.createElement("button", {
      onClick: () => settleBet(b.id, 'won'),
      title: "Manual: WON",
      style: {
        padding: '4px 9px',
        background: '#15803D',
        color: '#fff',
        border: 'none',
        fontSize: 10,
        fontWeight: 700,
        cursor: 'pointer'
      }
    }, "W"), /*#__PURE__*/React.createElement("button", {
      onClick: () => settleBet(b.id, 'lost'),
      title: "Manual: LOST",
      style: {
        padding: '4px 9px',
        background: '#C62828',
        color: '#fff',
        border: 'none',
        fontSize: 10,
        fontWeight: 700,
        cursor: 'pointer'
      }
    }, "L"), /*#__PURE__*/React.createElement("button", {
      onClick: () => settleBet(b.id, 'void'),
      title: "Manual: VOID",
      style: {
        padding: '4px 9px',
        background: '#9CA3AF',
        color: '#fff',
        border: 'none',
        fontSize: 10,
        fontWeight: 700,
        cursor: 'pointer'
      }
    }, "V")));
  }))));
}

// ── Periodic P/L — generic time-period aggregator with bar chart ──
function PeriodicPL({
  items,
  getDate,
  getValue,
  getVolume,
  valueLabel,
  volumeLabel,
  prefix
}) {
  const [period, setPeriod] = useState('day'); // day | week | month | weekday
  const NAVY = '#1B3955';
  // Aggregate
  const buckets = {};
  const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  function bucketKey(ts) {
    if (!ts) return '—';
    const d = new Date(ts.replace(' ', 'T'));
    if (period === 'day') return ts.slice(0, 10);
    if (period === 'week') {
      const monday = new Date(d);
      monday.setDate(d.getDate() - (d.getDay() + 6) % 7);
      return monday.toISOString().slice(0, 10);
    }
    if (period === 'month') return ts.slice(0, 7);
    if (period === 'weekday') return String(d.getDay()) + '|' + weekdays[d.getDay()];
    return ts.slice(0, 10);
  }
  items.forEach(it => {
    const key = bucketKey(getDate(it));
    if (!buckets[key]) buckets[key] = {
      key,
      count: 0,
      volume: 0,
      pnl: 0
    };
    buckets[key].count += 1;
    buckets[key].volume += getVolume(it) || 0;
    buckets[key].pnl += getValue(it) || 0;
  });
  let rows = Object.values(buckets);
  if (period === 'weekday') {
    rows.sort((a, b) => parseInt(a.key) - parseInt(b.key));
  } else {
    rows.sort((a, b) => b.key.localeCompare(a.key));
  }
  // For bar chart scale
  const maxAbsPnl = Math.max(...rows.map(r => Math.abs(r.pnl)), 1);
  const totalPnl = rows.reduce((s, r) => s + r.pnl, 0);
  const totalCount = rows.reduce((s, r) => s + r.count, 0);
  const totalVolume = rows.reduce((s, r) => s + r.volume, 0);
  function PerTab({
    id,
    icon,
    label
  }) {
    const active = period === id;
    return /*#__PURE__*/React.createElement("button", {
      onClick: () => setPeriod(id),
      style: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        padding: '5px 11px',
        background: active ? NAVY : 'transparent',
        color: active ? '#fff' : 'var(--text-2)',
        border: active ? `1px solid ${NAVY}` : '1px solid var(--line-2)',
        cursor: 'pointer',
        fontSize: 11,
        fontWeight: active ? 700 : 500,
        letterSpacing: 0.3
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: 'Material Symbols Outlined',
        fontSize: 13
      }
    }, icon), label);
  }
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '10px 14px',
      background: '#FAFBFC',
      borderBottom: '1px solid var(--line)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 9,
      fontWeight: 700,
      color: 'var(--text-3)',
      letterSpacing: 0.5,
      textTransform: 'uppercase'
    }
  }, "Period"), /*#__PURE__*/React.createElement(PerTab, {
    id: "day",
    icon: "today",
    label: "Daily"
  }), /*#__PURE__*/React.createElement(PerTab, {
    id: "week",
    icon: "date_range",
    label: "Weekly"
  }), /*#__PURE__*/React.createElement(PerTab, {
    id: "month",
    icon: "calendar_month",
    label: "Monthly"
  }), /*#__PURE__*/React.createElement(PerTab, {
    id: "weekday",
    icon: "view_week",
    label: "By Weekday"
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 10.5,
      color: 'var(--text-3)',
      fontFamily: 'JetBrains Mono, monospace'
    }
  }, rows.length, " periods \xB7 ", totalCount, " records \xB7 Total ", valueLabel.split(' ')[0], ' ', /*#__PURE__*/React.createElement("b", {
    style: {
      color: totalPnl >= 0 ? '#15A36C' : '#EF4444',
      marginLeft: 3
    }
  }, totalPnl >= 0 ? '+' : '−', prefix, MANAGER.fmt(Math.abs(totalPnl), 2)))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '180px 90px 120px 1fr 140px',
      background: NAVY,
      color: 'rgba(255,255,255,0.92)',
      fontSize: 10,
      fontWeight: 700,
      letterSpacing: 0.6,
      textTransform: 'uppercase',
      fontFamily: 'JetBrains Mono, monospace',
      position: 'sticky',
      top: 0,
      zIndex: 5
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      padding: '7px 10px'
    }
  }, "Period"), /*#__PURE__*/React.createElement("span", {
    style: {
      padding: '7px 10px',
      textAlign: 'right'
    }
  }, "Records"), /*#__PURE__*/React.createElement("span", {
    style: {
      padding: '7px 10px',
      textAlign: 'right'
    }
  }, volumeLabel), /*#__PURE__*/React.createElement("span", {
    style: {
      padding: '7px 10px'
    }
  }, valueLabel, " \u2014 visual"), /*#__PURE__*/React.createElement("span", {
    style: {
      padding: '7px 10px',
      textAlign: 'right'
    }
  }, valueLabel)), rows.length === 0 ? /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '40px 16px',
      textAlign: 'center',
      color: 'var(--text-3)',
      fontSize: 12
    }
  }, "No data for the selected period.") : rows.map((r, i) => {
    const isWeekday = period === 'weekday';
    const label = isWeekday ? r.key.split('|')[1] : r.key;
    const sub = isWeekday ? null : period === 'week' ? 'Week of ' + r.key : period === 'month' ? new Date(r.key + '-01').toLocaleString('en-US', {
      month: 'long',
      year: 'numeric'
    }) : new Date(r.key).toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric'
    });
    const pct = Math.abs(r.pnl) / maxAbsPnl * 100;
    const pos = r.pnl >= 0;
    return /*#__PURE__*/React.createElement("div", {
      key: r.key,
      style: {
        display: 'grid',
        gridTemplateColumns: '180px 90px 120px 1fr 140px',
        fontSize: 11.5,
        borderBottom: '1px solid #E5E7EB',
        background: i % 2 === 1 ? '#F7F9FC' : 'transparent',
        alignItems: 'center'
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        padding: '10px 10px',
        display: 'flex',
        flexDirection: 'column'
      }
    }, /*#__PURE__*/React.createElement("span", {
      className: "mono",
      style: {
        color: 'var(--ink)',
        fontWeight: 700,
        fontSize: 12
      }
    }, label), sub && /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 9.5,
        color: 'var(--text-3)'
      }
    }, sub)), /*#__PURE__*/React.createElement("span", {
      className: "mono",
      style: {
        padding: '10px 10px',
        textAlign: 'right',
        color: 'var(--text-2)'
      }
    }, r.count), /*#__PURE__*/React.createElement("span", {
      className: "mono",
      style: {
        padding: '10px 10px',
        textAlign: 'right',
        color: 'var(--ink)',
        fontWeight: 600
      }
    }, prefix, MANAGER.fmt(r.volume, 0)), /*#__PURE__*/React.createElement("span", {
      style: {
        padding: '10px 10px',
        display: 'flex',
        alignItems: 'center',
        height: 24,
        position: 'relative'
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        position: 'absolute',
        left: '50%',
        top: 0,
        bottom: 0,
        width: 1,
        background: 'var(--line-2)'
      }
    }), pos ? /*#__PURE__*/React.createElement("span", {
      style: {
        position: 'absolute',
        left: '50%',
        top: 4,
        bottom: 4,
        width: pct / 2 + '%',
        background: 'linear-gradient(90deg, #22C55E22, #22C55E88)',
        borderLeft: '2px solid #15A36C'
      }
    }) : /*#__PURE__*/React.createElement("span", {
      style: {
        position: 'absolute',
        right: '50%',
        top: 4,
        bottom: 4,
        width: pct / 2 + '%',
        background: 'linear-gradient(90deg, #EF444488, #EF444422)',
        borderRight: '2px solid #EF4444'
      }
    })), /*#__PURE__*/React.createElement("span", {
      className: "mono",
      style: {
        padding: '10px 10px',
        textAlign: 'right',
        fontWeight: 800,
        fontSize: 12.5,
        color: pos ? '#15A36C' : '#EF4444'
      }
    }, pos ? '+' : '−', prefix, MANAGER.fmt(Math.abs(r.pnl), 2)));
  }), rows.length > 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '180px 90px 120px 1fr 140px',
      padding: '10px 0',
      background: '#0F1B2D',
      color: '#fff',
      fontSize: 11.5,
      fontFamily: 'JetBrains Mono, monospace',
      fontWeight: 700,
      borderTop: '2px solid #5BB0FF'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      padding: '0 10px',
      letterSpacing: 0.4,
      textTransform: 'uppercase',
      fontSize: 10
    }
  }, "Total"), /*#__PURE__*/React.createElement("span", {
    style: {
      padding: '0 10px',
      textAlign: 'right'
    }
  }, totalCount), /*#__PURE__*/React.createElement("span", {
    style: {
      padding: '0 10px',
      textAlign: 'right'
    }
  }, prefix, MANAGER.fmt(totalVolume, 0)), /*#__PURE__*/React.createElement("span", null), /*#__PURE__*/React.createElement("span", {
    style: {
      padding: '0 10px',
      textAlign: 'right',
      color: totalPnl >= 0 ? '#22C55E' : '#FB7185',
      fontSize: 13,
      fontWeight: 800
    }
  }, totalPnl >= 0 ? '+' : '−', prefix, MANAGER.fmt(Math.abs(totalPnl), 2))));
}

// ── Sports Risk Manager — per-event handle, liability, hedge controls ──
function SportsRiskManager({
  refreshTick,
  setRefreshTick
}) {
  const NAVY = '#1B3955';
  const [sportFilter, setSportFilter] = useState('all');
  const [hedgeInput, setHedgeInput] = useState({});
  function updateHedge(eventId, amount) {
    if (!MANAGER.SPORTS_HEDGES[eventId]) MANAGER.SPORTS_HEDGES[eventId] = {
      hedge: 0,
      limit: 50000,
      marketStatus: 'open',
      lineLock: false
    };
    const n = parseFloat(amount) || 0;
    MANAGER.SPORTS_HEDGES[eventId].hedge = (MANAGER.SPORTS_HEDGES[eventId].hedge || 0) + n;
    if (MANAGER.ADMIN_ACTIVITY) MANAGER.ADMIN_ACTIVITY.unshift({
      ts: new Date().toISOString().slice(0, 19).replace('T', ' '),
      admin: 'risk@alpexa.com',
      kind: 'hedge_place',
      target: eventId,
      detail: `Placed $${n} hedge`
    });
    setHedgeInput(prev => ({
      ...prev,
      [eventId]: ''
    }));
    setRefreshTick(t => t + 1);
  }
  function resetHedge(eventId) {
    if (!confirm('Clear all hedge for this event?')) return;
    if (MANAGER.SPORTS_HEDGES[eventId]) MANAGER.SPORTS_HEDGES[eventId].hedge = 0;
    setRefreshTick(t => t + 1);
  }
  function toggleMarket(eventId) {
    if (!MANAGER.SPORTS_HEDGES[eventId]) MANAGER.SPORTS_HEDGES[eventId] = {
      hedge: 0,
      limit: 50000,
      marketStatus: 'open',
      lineLock: false
    };
    const cur = MANAGER.SPORTS_HEDGES[eventId].marketStatus;
    MANAGER.SPORTS_HEDGES[eventId].marketStatus = cur === 'open' ? 'suspended' : 'open';
    if (MANAGER.ADMIN_ACTIVITY) MANAGER.ADMIN_ACTIVITY.unshift({
      ts: new Date().toISOString().slice(0, 19).replace('T', ' '),
      admin: 'risk@alpexa.com',
      kind: 'market_' + MANAGER.SPORTS_HEDGES[eventId].marketStatus,
      target: eventId,
      detail: `Market ${MANAGER.SPORTS_HEDGES[eventId].marketStatus}`
    });
    setRefreshTick(t => t + 1);
  }
  function updateLimit(eventId, v) {
    if (!MANAGER.SPORTS_HEDGES[eventId]) MANAGER.SPORTS_HEDGES[eventId] = {
      hedge: 0,
      limit: 50000,
      marketStatus: 'open',
      lineLock: false
    };
    MANAGER.SPORTS_HEDGES[eventId].limit = parseFloat(v) || 0;
    setRefreshTick(t => t + 1);
  }

  // Calculate risk per event
  let events = MANAGER.SPORTS_EVENTS.map(ev => {
    const openBets = MANAGER.SPORTS_BETS.filter(b => b.eventId === ev.id && b.status === 'open');
    const handle = openBets.reduce((s, b) => s + (b.stake || 0), 0);
    const hedgeData = MANAGER.SPORTS_HEDGES[ev.id] || {
      hedge: 0,
      limit: 50000,
      marketStatus: 'open',
      lineLock: false
    };
    // Exposure per selection: if this side wins, we pay this much
    const exposureBySel = {};
    openBets.forEach(b => {
      exposureBySel[b.selection] = (exposureBySel[b.selection] || 0) + (b.potential || 0);
    });
    // Worst case = max payout across all selections
    const worstCase = Math.max(...Object.values(exposureBySel), 0);
    const worstSel = Object.entries(exposureBySel).sort((a, b) => b[1] - a[1])[0];
    // Net risk = worst case payout − stakes received − hedge proceeds (approx)
    const netRisk = worstCase - handle - hedgeData.hedge;
    const utilization = hedgeData.limit > 0 ? worstCase / hedgeData.limit * 100 : 0;
    return {
      ev,
      openBets,
      handle,
      hedgeData,
      exposureBySel,
      worstCase,
      worstSel,
      netRisk,
      utilization
    };
  });
  if (sportFilter !== 'all') events = events.filter(r => r.ev.sport === sportFilter);
  events.sort((a, b) => b.netRisk - a.netRisk);
  const totalHandle = events.reduce((s, r) => s + r.handle, 0);
  const totalLiability = events.reduce((s, r) => s + r.worstCase, 0);
  const totalHedge = events.reduce((s, r) => s + r.hedgeData.hedge, 0);
  const totalNet = totalLiability - totalHandle - totalHedge;
  const sports = ['all', 'NBA', 'NFL', 'MLB', 'NHL'];
  function statusColor(util) {
    if (util < 50) return {
      bg: '#E8F5E9',
      col: '#15803D',
      label: 'BALANCED'
    };
    if (util < 75) return {
      bg: '#FEF3C7',
      col: '#B45309',
      label: 'CAUTION'
    };
    if (util < 90) return {
      bg: '#FED7AA',
      col: '#9A3412',
      label: 'HIGH'
    };
    return {
      bg: '#FEE2E2',
      col: '#9F1239',
      label: 'CRITICAL'
    };
  }
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(4, 1fr)',
      gap: 1,
      background: NAVY,
      padding: 1
    }
  }, [{
    l: 'Total Handle',
    v: `$${MANAGER.fmt(totalHandle, 0)}`,
    c: '#5BB0FF'
  }, {
    l: 'Worst-Case Liability',
    v: `$${MANAGER.fmt(totalLiability, 0)}`,
    c: '#FB7185'
  }, {
    l: 'Hedge Position',
    v: `$${MANAGER.fmt(totalHedge, 0)}`,
    c: totalHedge > 0 ? '#FBBF24' : '#fff'
  }, {
    l: 'Net Exposure',
    v: `${totalNet >= 0 ? '-' : ''}$${MANAGER.fmt(Math.abs(totalNet), 0)}`,
    c: totalNet <= 0 ? '#22C55E' : '#FB7185'
  }].map(k => /*#__PURE__*/React.createElement("div", {
    key: k.l,
    style: {
      padding: '10px 14px',
      background: '#0F1B2D'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 9,
      fontWeight: 700,
      color: 'rgba(255,255,255,0.55)',
      letterSpacing: 0.6,
      textTransform: 'uppercase'
    }
  }, k.l), /*#__PURE__*/React.createElement("div", {
    className: "mono",
    style: {
      fontSize: 17,
      fontWeight: 800,
      color: k.c,
      marginTop: 3,
      letterSpacing: -0.3
    }
  }, k.v)))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      padding: '10px 14px',
      background: '#FAFBFC',
      borderBottom: '1px solid var(--line)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 9,
      fontWeight: 700,
      color: 'var(--text-3)',
      letterSpacing: 0.5,
      textTransform: 'uppercase'
    }
  }, "Sport"), sports.map(s => /*#__PURE__*/React.createElement("button", {
    key: s,
    onClick: () => setSportFilter(s),
    style: {
      padding: '4px 10px',
      background: sportFilter === s ? '#EAF2FB' : 'transparent',
      color: sportFilter === s ? NAVY : 'var(--text-2)',
      border: sportFilter === s ? `1px solid ${NAVY}` : '1px solid var(--line-2)',
      cursor: 'pointer',
      fontSize: 11,
      fontWeight: sportFilter === s ? 700 : 500,
      textTransform: 'uppercase',
      letterSpacing: 0.4
    }
  }, s === 'all' ? 'All' : s)), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 10.5,
      color: 'var(--text-3)',
      fontFamily: 'JetBrains Mono, monospace'
    }
  }, events.length, " events \xB7 sorted by net risk")), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '14px 14px',
      background: 'var(--bg)',
      display: 'flex',
      flexDirection: 'column',
      gap: 12
    }
  }, events.map(r => {
    const st = statusColor(r.utilization);
    const isSuspended = r.hedgeData.marketStatus === 'suspended';
    return /*#__PURE__*/React.createElement("div", {
      key: r.ev.id,
      style: {
        background: 'var(--surface)',
        border: `1px solid ${isSuspended ? '#9CA3AF' : 'var(--line)'}`,
        opacity: isSuspended ? 0.7 : 1
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '10px 14px',
        background: r.ev.status === 'live' ? '#FFF7ED' : '#FAFBFC',
        borderBottom: '1px solid var(--line)'
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        padding: '2px 7px',
        fontSize: 10,
        fontWeight: 800,
        color: '#fff',
        background: r.ev.sport === 'NFL' ? '#7C2D12' : r.ev.sport === 'NBA' ? '#EA580C' : r.ev.sport === 'MLB' ? '#1E40AF' : '#0F766E',
        letterSpacing: 0.4
      }
    }, r.ev.sport), r.ev.status === 'live' && /*#__PURE__*/React.createElement("span", {
      style: {
        padding: '2px 6px',
        fontSize: 9,
        fontWeight: 800,
        color: '#fff',
        background: '#EA580C',
        letterSpacing: 0.4
      }
    }, "LIVE"), isSuspended && /*#__PURE__*/React.createElement("span", {
      style: {
        padding: '2px 7px',
        fontSize: 9,
        fontWeight: 800,
        color: '#fff',
        background: '#9CA3AF',
        letterSpacing: 0.4
      }
    }, "SUSPENDED"), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 13,
        fontWeight: 700,
        color: 'var(--ink)'
      }
    }, r.ev.awayTeam, " @ ", r.ev.homeTeam), r.ev.status === 'live' && /*#__PURE__*/React.createElement("span", {
      className: "mono",
      style: {
        fontSize: 13,
        fontWeight: 800,
        color: '#EA580C'
      }
    }, r.ev.awayAbbr, " ", r.ev.scoreAway, " \u2013 ", r.ev.scoreHome, " ", r.ev.homeAbbr), /*#__PURE__*/React.createElement("span", {
      style: {
        flex: 1
      }
    }), /*#__PURE__*/React.createElement("span", {
      style: {
        padding: '3px 9px',
        fontSize: 10,
        fontWeight: 800,
        background: st.bg,
        color: st.col,
        letterSpacing: 0.5
      }
    }, st.label, " \xB7 ", r.utilization.toFixed(0), "%")), (() => {
      const netExp = Math.max(0, r.worstCase - r.handle);
      if (r.hedgeData.hedge > netExp * 1.1 && netExp > 0) {
        return /*#__PURE__*/React.createElement("div", {
          style: {
            padding: '7px 14px',
            background: '#FEE2E2',
            borderBottom: '1px solid #FCA5A5',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 11,
            color: '#9F1239'
          }
        }, /*#__PURE__*/React.createElement("span", {
          style: {
            fontFamily: 'Material Symbols Outlined',
            fontSize: 15
          }
        }, "warning"), /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement("b", null, "Over-hedged:"), " $$", MANAGER.fmt(r.hedgeData.hedge, 0), " hedge exceeds net exposure of $$", MANAGER.fmt(netExp, 0), ". Excess of $$", MANAGER.fmt(r.hedgeData.hedge - netExp, 0), " is a guaranteed loss regardless of outcome."), /*#__PURE__*/React.createElement("span", {
          style: {
            flex: 1
          }
        }), /*#__PURE__*/React.createElement("button", {
          onClick: () => resetHedge(r.ev.id),
          style: {
            padding: '3px 10px',
            background: '#9F1239',
            color: '#fff',
            border: 'none',
            fontSize: 10.5,
            fontWeight: 700,
            cursor: 'pointer',
            letterSpacing: 0.4
          }
        }, "Clear Hedge"));
      }
      return null;
    })(), (() => {
      // Calculate net exposure (worst-case payout we still need to cover)
      const netExposure = Math.max(0, r.worstCase - r.handle);
      // Recommended hedge: ~40% of net exposure (cover most without over-paying)
      const recommendedHedge = Math.round(netExposure * 0.4);
      const overHedged = r.hedgeData.hedge > netExposure * 1.1; // 10% buffer
      const hedgeColor = overHedged ? '#EF4444' : r.hedgeData.hedge > 0 ? '#B45309' : 'var(--text-3)';
      return /*#__PURE__*/React.createElement("div", {
        style: {
          display: 'grid',
          gridTemplateColumns: 'repeat(6, 1fr)',
          borderBottom: '1px solid var(--line)'
        }
      }, [{
        l: 'Bets',
        v: r.openBets.length
      }, {
        l: 'Handle',
        v: '$' + MANAGER.fmt(r.handle, 0),
        c: '#5BB0FF'
      }, {
        l: 'Worst-Case',
        v: '$' + MANAGER.fmt(r.worstCase, 0),
        c: '#FB7185'
      }, {
        l: 'Hedge',
        v: '$' + MANAGER.fmt(r.hedgeData.hedge, 0),
        c: hedgeColor,
        suffix: overHedged ? '⚠' : null
      }, {
        l: 'Recommended',
        v: netExposure > 0 ? '$' + MANAGER.fmt(recommendedHedge, 0) : '$0',
        c: '#0EA5E9'
      }, {
        l: 'Net Risk',
        v: (r.netRisk >= 0 ? '$' : '-$') + MANAGER.fmt(Math.abs(r.netRisk), 0),
        c: r.netRisk <= 0 ? '#15803D' : '#9F1239'
      }].map((k, i) => /*#__PURE__*/React.createElement("div", {
        key: i,
        style: {
          padding: '10px 14px',
          borderRight: i < 5 ? '1px solid var(--line)' : 'none'
        }
      }, /*#__PURE__*/React.createElement("div", {
        style: {
          fontSize: 9,
          color: 'var(--text-3)',
          letterSpacing: 0.5,
          fontWeight: 700,
          textTransform: 'uppercase'
        }
      }, k.l), /*#__PURE__*/React.createElement("div", {
        className: "mono",
        style: {
          fontSize: 14,
          fontWeight: 800,
          color: k.c || 'var(--ink)',
          marginTop: 3,
          display: 'flex',
          alignItems: 'center',
          gap: 4
        }
      }, k.v, k.suffix && /*#__PURE__*/React.createElement("span", {
        style: {
          fontSize: 12
        }
      }, k.suffix)))));
    })(), Object.keys(r.exposureBySel).length > 0 && /*#__PURE__*/React.createElement("div", {
      style: {
        padding: '10px 14px',
        borderBottom: '1px solid var(--line)',
        background: '#FAFBFC'
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 9,
        fontWeight: 700,
        color: 'var(--text-3)',
        letterSpacing: 0.5,
        textTransform: 'uppercase',
        marginBottom: 6
      }
    }, "Exposure by Selection (worst-case payout if this side wins)"), /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        flexDirection: 'column',
        gap: 4
      }
    }, Object.entries(r.exposureBySel).sort((a, b) => b[1] - a[1]).map(([sel, exp]) => {
      const pct = exp / r.worstCase * 100;
      const isWorst = sel === r.worstSel?.[0];
      return /*#__PURE__*/React.createElement("div", {
        key: sel,
        style: {
          display: 'grid',
          gridTemplateColumns: '180px 1fr 110px',
          gap: 8,
          alignItems: 'center'
        }
      }, /*#__PURE__*/React.createElement("span", {
        style: {
          fontSize: 11.5,
          color: isWorst ? '#9F1239' : 'var(--ink)',
          fontWeight: isWorst ? 700 : 500,
          display: 'flex',
          alignItems: 'center',
          gap: 5
        }
      }, isWorst && /*#__PURE__*/React.createElement("span", {
        style: {
          fontFamily: 'Material Symbols Outlined',
          fontSize: 13,
          color: '#9F1239'
        }
      }, "warning"), sel), /*#__PURE__*/React.createElement("span", {
        style: {
          height: 8,
          background: '#E5E7EB',
          position: 'relative'
        }
      }, /*#__PURE__*/React.createElement("span", {
        style: {
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: pct + '%',
          background: isWorst ? 'linear-gradient(90deg, #EF444466, #EF4444)' : 'linear-gradient(90deg, #FED7AA, #F59E0B)'
        }
      })), /*#__PURE__*/React.createElement("span", {
        className: "mono",
        style: {
          fontSize: 11,
          color: 'var(--ink)',
          fontWeight: 700,
          textAlign: 'right'
        }
      }, "$", MANAGER.fmt(exp, 0)));
    }))), /*#__PURE__*/React.createElement("div", {
      style: {
        padding: '10px 14px',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        flexWrap: 'wrap'
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 10,
        fontWeight: 700,
        color: 'var(--text-3)',
        letterSpacing: 0.5,
        textTransform: 'uppercase'
      }
    }, "Limit"), /*#__PURE__*/React.createElement("input", {
      type: "number",
      step: "5000",
      value: r.hedgeData.limit || 0,
      onChange: e => updateLimit(r.ev.id, e.target.value),
      style: {
        width: 100,
        padding: '4px 8px',
        border: '1px solid var(--line-2)',
        fontSize: 11.5,
        fontFamily: 'JetBrains Mono, monospace',
        textAlign: 'right',
        fontWeight: 700
      }
    }), /*#__PURE__*/React.createElement("span", {
      style: {
        width: 1,
        height: 18,
        background: 'var(--line-2)'
      }
    }), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 10,
        fontWeight: 700,
        color: 'var(--text-3)',
        letterSpacing: 0.5,
        textTransform: 'uppercase'
      }
    }, "Place Hedge"), /*#__PURE__*/React.createElement("input", {
      type: "number",
      step: "100",
      placeholder: "amount",
      value: hedgeInput[r.ev.id] || '',
      onChange: e => setHedgeInput(prev => ({
        ...prev,
        [r.ev.id]: e.target.value
      })),
      style: {
        width: 100,
        padding: '4px 8px',
        border: '1px solid var(--line-2)',
        fontSize: 11.5,
        fontFamily: 'JetBrains Mono, monospace',
        textAlign: 'right'
      }
    }), /*#__PURE__*/React.createElement("button", {
      onClick: () => {
        const netExp = Math.max(0, r.worstCase - r.handle);
        const proposed = parseFloat(hedgeInput[r.ev.id]) || 0;
        const newTotal = (r.hedgeData.hedge || 0) + proposed;
        if (newTotal > netExp * 1.1 && netExp > 0) {
          if (!confirm(`Hedge would total $${MANAGER.fmt(newTotal, 0)}, exceeding net exposure $${MANAGER.fmt(netExp, 0)}. This guarantees a loss. Proceed anyway?`)) return;
        }
        updateHedge(r.ev.id, hedgeInput[r.ev.id]);
      },
      style: {
        padding: '5px 12px',
        background: '#B45309',
        color: '#fff',
        border: 'none',
        fontSize: 11,
        fontWeight: 700,
        cursor: 'pointer',
        letterSpacing: 0.4,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: 'Material Symbols Outlined',
        fontSize: 13
      }
    }, "shield"), "Place"), (() => {
      const netExp = Math.max(0, r.worstCase - r.handle);
      const rec = Math.round(netExp * 0.4);
      return rec > 0 ? /*#__PURE__*/React.createElement("button", {
        onClick: () => {
          setHedgeInput(prev => ({
            ...prev,
            [r.ev.id]: String(rec)
          }));
        },
        title: `Use recommended $${rec}`,
        style: {
          padding: '5px 10px',
          background: '#EAF2FB',
          color: '#1B3955',
          border: '1px solid #1B3955',
          fontSize: 10.5,
          fontWeight: 700,
          cursor: 'pointer'
        }
      }, "Use $", MANAGER.fmt(rec, 0)) : null;
    })(), r.hedgeData.hedge > 0 && /*#__PURE__*/React.createElement("button", {
      onClick: () => resetHedge(r.ev.id),
      title: "Clear hedge",
      style: {
        padding: '5px 10px',
        background: 'transparent',
        color: 'var(--text-2)',
        border: '1px solid var(--line-2)',
        fontSize: 10.5,
        fontWeight: 600,
        cursor: 'pointer'
      }
    }, "Reset"), /*#__PURE__*/React.createElement("span", {
      style: {
        flex: 1
      }
    }), /*#__PURE__*/React.createElement("button", {
      onClick: () => toggleMarket(r.ev.id),
      style: {
        padding: '5px 12px',
        background: isSuspended ? '#22C55E' : '#9CA3AF',
        color: '#fff',
        border: 'none',
        fontSize: 11,
        fontWeight: 700,
        cursor: 'pointer',
        letterSpacing: 0.4,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: 'Material Symbols Outlined',
        fontSize: 13
      }
    }, isSuspended ? 'play_arrow' : 'pause'), isSuspended ? 'Resume Market' : 'Suspend Market')));
  }), events.length === 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '40px 16px',
      textAlign: 'center',
      color: 'var(--text-3)',
      fontSize: 12,
      background: 'var(--surface)'
    }
  }, "No events match this filter.")));
}

// ── Admin Session Switcher — replaces static "AD Admin" in TopBar ──
function AdminSessionSwitcher() {
  const [open, setOpen] = useState(false);
  const [tick, setTick] = useState(0);
  const admin = MANAGER.getCurrentAdmin();
  const role = MANAGER.getCurrentRole();
  function switchAdmin(id) {
    MANAGER.currentAdminId = id;
    if (MANAGER.ADMIN_ACTIVITY) MANAGER.ADMIN_ACTIVITY.unshift({
      ts: new Date().toISOString().slice(0, 19).replace('T', ' '),
      admin: MANAGER.getCurrentAdmin().email,
      kind: 'session_switch',
      target: '-',
      detail: `Switched to ${MANAGER.getCurrentAdmin().name} (${MANAGER.getCurrentRole().label})`
    });
    setOpen(false);
    setTick(t => t + 1);
  }
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative'
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => setOpen(o => !o),
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '4px 8px',
      background: 'transparent',
      border: '1px solid var(--line-2)',
      cursor: 'pointer'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 28,
      height: 28,
      borderRadius: 14,
      background: role.color,
      color: '#fff',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: 11,
      fontWeight: 800,
      letterSpacing: 0.5,
      flexShrink: 0
    }
  }, admin.name.split(' ').map(s => s[0]).join('').slice(0, 2).toUpperCase()), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      lineHeight: 1.15,
      textAlign: 'left'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 11,
      fontWeight: 700,
      color: 'var(--ink)',
      whiteSpace: 'nowrap'
    }
  }, admin.name), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 9,
      fontWeight: 700,
      color: role.color,
      letterSpacing: 0.4,
      textTransform: 'uppercase'
    }
  }, role.label, admin.twoFA && /*#__PURE__*/React.createElement("span", {
    style: {
      marginLeft: 4
    }
  }, "\uD83D\uDD12"))), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'Material Symbols Outlined',
      fontSize: 14,
      color: 'var(--text-3)'
    }
  }, open ? 'expand_less' : 'expand_more')), open && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    onClick: () => setOpen(false),
    style: {
      position: 'fixed',
      inset: 0,
      zIndex: 200
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      top: 'calc(100% + 4px)',
      right: 0,
      zIndex: 201,
      background: 'var(--surface)',
      border: '1px solid var(--line)',
      boxShadow: '0 12px 32px rgba(15,23,41,0.18)',
      minWidth: 300
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '8px 12px',
      background: '#0F1B2D',
      color: 'rgba(255,255,255,0.85)',
      fontSize: 9.5,
      fontWeight: 700,
      letterSpacing: 0.6,
      textTransform: 'uppercase'
    }
  }, "Switch Active Session"), MANAGER.ADMIN_STAFF.filter(a => a.active).map(a => {
    const r = MANAGER.ROLES[a.role];
    const isMe = a.id === MANAGER.currentAdminId;
    return /*#__PURE__*/React.createElement("button", {
      key: a.id,
      onClick: () => switchAdmin(a.id),
      style: {
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 12px',
        background: isMe ? '#EAF2FB' : 'transparent',
        border: 'none',
        borderBottom: '1px solid var(--line)',
        cursor: 'pointer',
        textAlign: 'left'
      },
      onMouseEnter: e => {
        if (!isMe) e.currentTarget.style.background = 'var(--bg)';
      },
      onMouseLeave: e => {
        if (!isMe) e.currentTarget.style.background = 'transparent';
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        width: 24,
        height: 24,
        borderRadius: 12,
        background: r.color,
        color: '#fff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 9,
        fontWeight: 800,
        flexShrink: 0
      }
    }, a.name.split(' ').map(s => s[0]).join('').slice(0, 2).toUpperCase()), /*#__PURE__*/React.createElement("div", {
      style: {
        flex: 1,
        minWidth: 0
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 12,
        fontWeight: 600,
        color: 'var(--ink)'
      }
    }, a.name, " ", isMe && /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 9,
        color: '#15A36C',
        fontWeight: 700,
        marginLeft: 4
      }
    }, "(active)")), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 9.5,
        color: 'var(--text-3)',
        fontFamily: 'JetBrains Mono, monospace'
      }
    }, a.email)), /*#__PURE__*/React.createElement("span", {
      style: {
        padding: '1px 7px',
        fontSize: 9,
        fontWeight: 800,
        color: '#fff',
        background: r.color,
        letterSpacing: 0.4,
        textTransform: 'uppercase'
      }
    }, r.label), a.twoFA && /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 11
      }
    }, "\uD83D\uDD12"));
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '8px 12px',
      background: '#FAFBFC',
      fontSize: 10,
      color: 'var(--text-3)'
    }
  }, "Current permissions: ", /*#__PURE__*/React.createElement("b", {
    style: {
      color: 'var(--ink)'
    }
  }, role.permissions.includes('*') ? 'ALL' : role.permissions.length + ' tokens')))));
}

// ── Access Control Settings — manage roles + staff ──
function AccessControlEditor({
  NAVY
}) {
  const [tick, setTick] = useState(0);
  const [editingStaff, setEditingStaff] = useState(null);
  function refresh() {
    setTick(t => t + 1);
  }
  function updateStaff(id, key, val) {
    const idx = MANAGER.ADMIN_STAFF.findIndex(a => a.id === id);
    if (idx >= 0) MANAGER.ADMIN_STAFF[idx] = {
      ...MANAGER.ADMIN_STAFF[idx],
      [key]: val
    };
    refresh();
  }
  function deactivateStaff(id) {
    if (!confirm('Deactivate this user? They will be unable to log in.')) return;
    updateStaff(id, 'active', false);
    if (MANAGER.ADMIN_ACTIVITY) MANAGER.ADMIN_ACTIVITY.unshift({
      ts: new Date().toISOString().slice(0, 19).replace('T', ' '),
      admin: MANAGER.getCurrentAdmin().email,
      kind: 'staff_deactivate',
      target: id,
      detail: 'Account deactivated'
    });
  }
  function approve(id) {
    const idx = MANAGER.APPROVAL_QUEUE.findIndex(r => r.id === id);
    if (idx < 0) return;
    MANAGER.APPROVAL_QUEUE[idx] = {
      ...MANAGER.APPROVAL_QUEUE[idx],
      status: 'approved',
      resolvedBy: MANAGER.currentAdminId,
      resolvedAt: new Date().toISOString().slice(0, 19).replace('T', ' ')
    };
    if (MANAGER.ADMIN_ACTIVITY) MANAGER.ADMIN_ACTIVITY.unshift({
      ts: new Date().toISOString().slice(0, 19).replace('T', ' '),
      admin: MANAGER.getCurrentAdmin().email,
      kind: 'approval_grant',
      target: MANAGER.APPROVAL_QUEUE[idx].target || '-',
      detail: `Approved ${MANAGER.APPROVAL_QUEUE[idx].action}`
    });
    refresh();
  }
  function reject(id) {
    const idx = MANAGER.APPROVAL_QUEUE.findIndex(r => r.id === id);
    if (idx < 0) return;
    MANAGER.APPROVAL_QUEUE[idx] = {
      ...MANAGER.APPROVAL_QUEUE[idx],
      status: 'rejected',
      resolvedBy: MANAGER.currentAdminId,
      resolvedAt: new Date().toISOString().slice(0, 19).replace('T', ' ')
    };
    refresh();
  }
  const canManageRoles = MANAGER.hasPerm('*');
  const pendingApprovals = MANAGER.APPROVAL_QUEUE.filter(r => r.status === 'pending');
  return /*#__PURE__*/React.createElement("div", {
    style: {
      background: 'var(--surface)',
      border: '1px solid var(--line)',
      marginBottom: 14
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '8px 12px',
      background: NAVY,
      color: 'rgba(255,255,255,0.92)',
      fontSize: 10,
      fontWeight: 700,
      letterSpacing: 0.6,
      textTransform: 'uppercase',
      fontFamily: 'JetBrains Mono, monospace',
      display: 'flex',
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1
    }
  }, "Access Control \u2014 staff, roles, approval queue"), !canManageRoles && /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 9,
      color: '#FBBF24',
      fontWeight: 700,
      textTransform: 'none',
      letterSpacing: 0.3
    }
  }, "\u26A0 View-only (super admin required)")), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '10px 12px',
      background: '#FAFBFC',
      borderBottom: '1px solid var(--line)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 9.5,
      fontWeight: 700,
      color: 'var(--text-3)',
      letterSpacing: 0.5,
      textTransform: 'uppercase',
      marginBottom: 6
    }
  }, "Defined Roles"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(3, 1fr)',
      gap: 6
    }
  }, Object.entries(MANAGER.ROLES).map(([k, r]) => /*#__PURE__*/React.createElement("div", {
    key: k,
    style: {
      padding: '7px 10px',
      border: `1px solid ${r.color}33`,
      background: `${r.color}0A`,
      fontSize: 10.5
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 5,
      marginBottom: 3
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      padding: '1px 6px',
      fontSize: 9.5,
      fontWeight: 800,
      color: '#fff',
      background: r.color,
      letterSpacing: 0.4
    }
  }, r.label)), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10,
      color: 'var(--text-2)',
      marginBottom: 3
    }
  }, r.description), /*#__PURE__*/React.createElement("div", {
    className: "mono",
    style: {
      fontSize: 9,
      color: 'var(--text-3)'
    }
  }, "Balance adj: ", r.actionLimits.balanceAdjust === Infinity ? '∞' : '$' + MANAGER.fmt(r.actionLimits.balanceAdjust, 0), " \xB7 Hedge: ", r.actionLimits.hedge === Infinity ? '∞' : '$' + MANAGER.fmt(r.actionLimits.hedge, 0)))))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 130px 80px 1fr 100px',
      background: '#0F1B2D',
      color: 'rgba(255,255,255,0.7)',
      fontSize: 9.5,
      fontWeight: 700,
      letterSpacing: 0.5,
      textTransform: 'uppercase'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      padding: '6px 12px'
    }
  }, "Staff Member"), /*#__PURE__*/React.createElement("span", {
    style: {
      padding: '6px 12px'
    }
  }, "Role"), /*#__PURE__*/React.createElement("span", {
    style: {
      padding: '6px 12px',
      textAlign: 'center'
    }
  }, "2FA"), /*#__PURE__*/React.createElement("span", {
    style: {
      padding: '6px 12px'
    }
  }, "Last Login"), /*#__PURE__*/React.createElement("span", {
    style: {
      padding: '6px 12px',
      textAlign: 'right'
    }
  }, "Actions")), MANAGER.ADMIN_STAFF.map((a, i) => {
    const r = MANAGER.ROLES[a.role];
    const editing = editingStaff === a.id;
    return /*#__PURE__*/React.createElement("div", {
      key: a.id,
      style: {
        display: 'grid',
        gridTemplateColumns: '1fr 130px 80px 1fr 100px',
        padding: '7px 0',
        fontSize: 11.5,
        borderBottom: '1px solid #E5E7EB',
        alignItems: 'center',
        background: !a.active ? '#FEE2E2' : editing ? '#FEF3C7' : i % 2 === 1 ? '#F7F9FC' : 'transparent'
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        padding: '4px 12px'
      }
    }, editing ? /*#__PURE__*/React.createElement("input", {
      value: a.name,
      onChange: e => updateStaff(a.id, 'name', e.target.value),
      style: {
        width: '100%',
        padding: '3px 6px',
        border: '1px solid var(--line-2)',
        fontSize: 11.5,
        fontWeight: 600,
        boxSizing: 'border-box'
      }
    }) : /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("span", {
      style: {
        color: 'var(--ink)',
        fontWeight: 600
      }
    }, a.name), !a.active && /*#__PURE__*/React.createElement("span", {
      style: {
        marginLeft: 6,
        padding: '1px 5px',
        fontSize: 9,
        fontWeight: 700,
        color: '#9F1239',
        background: '#fff'
      }
    }, "DEACTIVATED"), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 10,
        color: 'var(--text-3)',
        fontFamily: 'JetBrains Mono, monospace'
      }
    }, a.email))), /*#__PURE__*/React.createElement("span", {
      style: {
        padding: '4px 12px'
      }
    }, editing && canManageRoles ? /*#__PURE__*/React.createElement("select", {
      value: a.role,
      onChange: e => updateStaff(a.id, 'role', e.target.value),
      style: {
        padding: '3px 6px',
        border: '1px solid var(--line-2)',
        fontSize: 10.5
      }
    }, Object.entries(MANAGER.ROLES).map(([k, r]) => /*#__PURE__*/React.createElement("option", {
      key: k,
      value: k
    }, r.label))) : /*#__PURE__*/React.createElement("span", {
      style: {
        padding: '2px 7px',
        fontSize: 9.5,
        fontWeight: 800,
        color: '#fff',
        background: r.color,
        letterSpacing: 0.4,
        textTransform: 'uppercase'
      }
    }, r.label)), /*#__PURE__*/React.createElement("span", {
      style: {
        padding: '4px 12px',
        textAlign: 'center'
      }
    }, editing ? /*#__PURE__*/React.createElement("input", {
      type: "checkbox",
      checked: !!a.twoFA,
      onChange: e => updateStaff(a.id, 'twoFA', e.target.checked)
    }) : a.twoFA ? /*#__PURE__*/React.createElement("span", {
      style: {
        color: '#15A36C',
        fontSize: 13
      }
    }, "\uD83D\uDD12") : /*#__PURE__*/React.createElement("span", {
      style: {
        color: '#FB7185',
        fontSize: 13
      }
    }, "\u26A0")), /*#__PURE__*/React.createElement("span", {
      className: "mono",
      style: {
        padding: '4px 12px',
        fontSize: 10,
        color: 'var(--text-3)'
      }
    }, a.lastLogin), /*#__PURE__*/React.createElement("span", {
      style: {
        padding: '3px 10px',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'flex-end',
        gap: 4
      }
    }, canManageRoles && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("button", {
      onClick: () => setEditingStaff(editing ? null : a.id),
      title: editing ? 'Done' : 'Edit',
      style: {
        width: 22,
        height: 22,
        padding: 0,
        background: editing ? '#22C55E' : 'var(--bg)',
        color: editing ? '#fff' : 'var(--text-2)',
        border: '1px solid var(--line-2)',
        cursor: 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center'
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: 'Material Symbols Outlined',
        fontSize: 13
      }
    }, editing ? 'check' : 'edit')), a.active && a.id !== MANAGER.currentAdminId && /*#__PURE__*/React.createElement("button", {
      onClick: () => deactivateStaff(a.id),
      title: "Deactivate",
      style: {
        width: 22,
        height: 22,
        padding: 0,
        background: '#FFEBEE',
        color: '#C62828',
        border: '1px solid #FECACA',
        cursor: 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center'
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: 'Material Symbols Outlined',
        fontSize: 13
      }
    }, "block")))));
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '8px 12px',
      background: NAVY,
      color: 'rgba(255,255,255,0.92)',
      fontSize: 10,
      fontWeight: 700,
      letterSpacing: 0.6,
      textTransform: 'uppercase',
      fontFamily: 'JetBrains Mono, monospace',
      display: 'flex',
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1
    }
  }, "Approval Queue \u2014 ", pendingApprovals.length, " pending"), !canManageRoles && /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 9,
      color: '#FBBF24',
      textTransform: 'none'
    }
  }, "Super Admin can approve")), pendingApprovals.length === 0 ? /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '18px 16px',
      textAlign: 'center',
      color: 'var(--text-3)',
      fontSize: 11.5
    }
  }, "No pending approvals. Actions above role limits will appear here.") : pendingApprovals.map((r, i) => {
    const requester = MANAGER.ADMIN_STAFF.find(s => s.id === r.requestedBy);
    return /*#__PURE__*/React.createElement("div", {
      key: r.id,
      style: {
        display: 'grid',
        gridTemplateColumns: '130px 1fr 100px 130px',
        padding: '7px 0',
        fontSize: 11.5,
        borderBottom: '1px solid #E5E7EB',
        alignItems: 'center',
        background: i % 2 === 1 ? '#F7F9FC' : 'transparent'
      }
    }, /*#__PURE__*/React.createElement("span", {
      className: "mono",
      style: {
        padding: '4px 12px',
        color: 'var(--text-3)',
        fontSize: 10
      }
    }, r.requestedAt), /*#__PURE__*/React.createElement("span", {
      style: {
        padding: '4px 12px'
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        color: 'var(--ink)',
        fontWeight: 600
      }
    }, r.action, " \xB7 ", /*#__PURE__*/React.createElement("span", {
      className: "mono",
      style: {
        color: '#7C3AED'
      }
    }, r.target)), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 10,
        color: 'var(--text-3)'
      }
    }, r.detail, " \xB7 by ", requester?.name || r.requestedBy)), /*#__PURE__*/React.createElement("span", {
      className: "mono",
      style: {
        padding: '4px 12px',
        textAlign: 'right',
        fontWeight: 700,
        color: '#9F1239'
      }
    }, r.amount ? '$' + MANAGER.fmt(r.amount, 0) : '—'), /*#__PURE__*/React.createElement("span", {
      style: {
        padding: '3px 12px',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'flex-end',
        gap: 4
      }
    }, canManageRoles ? /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("button", {
      onClick: () => reject(r.id),
      style: {
        padding: '3px 10px',
        background: '#FFEBEE',
        color: '#C62828',
        border: '1px solid #FECACA',
        fontSize: 10.5,
        fontWeight: 700,
        cursor: 'pointer'
      }
    }, "Reject"), /*#__PURE__*/React.createElement("button", {
      onClick: () => approve(r.id),
      style: {
        padding: '3px 12px',
        background: '#15803D',
        color: '#fff',
        border: 'none',
        fontSize: 10.5,
        fontWeight: 700,
        cursor: 'pointer'
      }
    }, "Approve")) : /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 9.5,
        color: 'var(--text-3)'
      }
    }, "Awaiting Super Admin")));
  }));
}
function ManagerApp() {
  const [route, setRoute] = useState('accounts');
  const [server, setServer] = useState('FX');
  const [quotesOpen, setQuotesOpen] = useState(true);
  const [clientFilter, setClientFilter] = useState('online');
  const [clientSearch, setClientSearch] = useState('');
  function openClientFilter(f) {
    setClientFilter(f);
    setRoute('accounts');
  }
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      background: 'var(--bg)',
      fontFamily: 'var(--font)',
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement(TopBar, {
    route: route,
    setRoute: setRoute,
    server: server,
    setServer: setServer,
    quotesOpen: quotesOpen,
    setQuotesOpen: setQuotesOpen,
    openClientFilter: openClientFilter,
    clientSearch: clientSearch,
    setClientSearch: setClientSearch
  }), /*#__PURE__*/React.createElement(ModuleNav, {
    route: route,
    setRoute: setRoute,
    openClientFilter: openClientFilter,
    server: server
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      display: 'flex',
      minHeight: 0
    }
  }, quotesOpen && (server === 'SPORTS' ? /*#__PURE__*/React.createElement(SportsMarketsPanel, {
    server: server,
    setServer: setServer,
    onClose: () => setQuotesOpen(false)
  }) : /*#__PURE__*/React.createElement(QuotesPanel, {
    server: server,
    setServer: setServer,
    onClose: () => setQuotesOpen(false)
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      minWidth: 0,
      minHeight: 0
    }
  }, route === 'wallets' && /*#__PURE__*/React.createElement(WalletsScreen, {
    quotesOpen: quotesOpen,
    setQuotesOpen: setQuotesOpen
  }), route === 'accounts' && /*#__PURE__*/React.createElement(AccountsScreen, {
    server: server,
    quotesOpen: quotesOpen,
    setQuotesOpen: setQuotesOpen
  }), route === 'funding' && (server === 'SPORTS' && false ? /*#__PURE__*/React.createElement(SportsPromosScreen, {
    quotesOpen: quotesOpen,
    setQuotesOpen: setQuotesOpen
  }) : /*#__PURE__*/React.createElement(FundingScreen, {
    server: server,
    quotesOpen: quotesOpen,
    setQuotesOpen: setQuotesOpen
  })), route === 'reports' && (server === 'SPORTS' ? /*#__PURE__*/React.createElement(SportsReportsScreen, {
    quotesOpen: quotesOpen,
    setQuotesOpen: setQuotesOpen
  }) : /*#__PURE__*/React.createElement(ReportsScreen, {
    quotesOpen: quotesOpen,
    setQuotesOpen: setQuotesOpen
  })), route === 'settings' && /*#__PURE__*/React.createElement(SystemSettingsScreen, {
    quotesOpen: quotesOpen,
    setQuotesOpen: setQuotesOpen
  }), route === 'managers' && /*#__PURE__*/React.createElement(ManagersScreen, {
    quotesOpen: quotesOpen,
    setQuotesOpen: setQuotesOpen
  }))), /*#__PURE__*/React.createElement(Footer, {
    server: server,
    setServer: setServer,
    openClientFilter: openClientFilter,
    quotesOpen: quotesOpen,
    setQuotesOpen: setQuotesOpen
  }), server === 'SPORTS' && /*#__PURE__*/React.createElement(SharpActionAlert, null));
}
function Footer({
  server,
  setServer,
  openClientFilter,
  quotesOpen,
  setQuotesOpen
}) {
  const [time, setTime] = useStateMgr(() => new Date());
  // Faux live telemetry (MT5-style status bar metrics)
  const [ping, setPing] = useStateMgr(12);
  const [mem, setMem] = useStateMgr(284);
  const [cpu, setCpu] = useStateMgr(6);
  const [kbIn, setKbIn] = useStateMgr(0);
  useEffectMgr(() => {
    const id = setInterval(() => {
      setTime(new Date());
      setPing(p => Math.max(4, Math.min(40, p + Math.round((Math.random() - 0.5) * 4))));
      setMem(m => Math.max(220, Math.min(420, m + Math.round((Math.random() - 0.5) * 8))));
      setCpu(c => Math.max(2, Math.min(28, c + Math.round((Math.random() - 0.5) * 3))));
      setKbIn(() => Math.round(Math.random() * 180));
    }, 1000);
    return () => clearInterval(id);
  }, []);
  const local = time.toTimeString().split(' ')[0];
  const utc = time.toISOString().substr(11, 8);

  // Aggregate totals — switch metric set based on selected server
  const isSports = server === 'SPORTS';
  const sportsAccountIds = new Set(MANAGER.ACCOUNTS.filter(a => a.tag === 'SPORTS').map(a => a.id));
  const openBets = MANAGER.SPORTS_BETS.filter(b => b.status === 'open');
  const stats = isSports ? function () {
    // Compute max single-event liability for risk display
    let maxEvent = 0,
      maxEventId = null;
    (MANAGER.SPORTS_EVENTS || []).forEach(e => {
      const eventLiab = openBets.filter(b => b.eventId === e.id).reduce((s, b) => s + (b.potential || 0), 0);
      if (eventLiab > maxEvent) {
        maxEvent = eventLiab;
        maxEventId = e.id;
      }
    });
    const maxEv = (MANAGER.SPORTS_EVENTS || []).find(e => e.id === maxEventId);
    const totalHedge = Object.values(MANAGER.SPORTS_HEDGES || {}).reduce((s, h) => s + (h.hedge || 0), 0);
    return {
      isSports: true,
      totalBalance: MANAGER.ACCOUNTS.filter(a => a.tag === 'SPORTS').reduce((s, a) => s + (a.balance || 0) * usdRate(a.currency), 0),
      openStakes: openBets.reduce((s, b) => s + (b.stake || 0), 0),
      liability: openBets.reduce((s, b) => s + (b.potential || 0), 0),
      totalHedge,
      maxEvent,
      maxEventLabel: maxEv ? `${maxEv.awayAbbr} @ ${maxEv.homeAbbr}` : '—',
      netHousePnl: MANAGER.SPORTS_BETS.filter(b => b.status === 'lost').reduce((s, b) => s + (b.stake || 0), 0) - MANAGER.SPORTS_BETS.filter(b => b.status === 'won').reduce((s, b) => s + ((b.payout || 0) - (b.stake || 0)), 0)
    };
  }() : {
    isSports: false,
    totalBalance: MANAGER.ACCOUNTS.reduce((s, a) => s + (a.balance || 0) * usdRate(a.currency), 0),
    totalEquity: MANAGER.ACCOUNTS.reduce((s, a) => s + (a.equity || 0) * usdRate(a.currency), 0),
    floatingPnl: MANAGER.POSITIONS.reduce((s, p) => s + (p.pnl || 0), 0)
  };
  const pendingKyc = MANAGER.CLIENTS.filter(c => c.kyc === 'pending').length;
  const blocked = MANAGER.CLIENTS.filter(c => c.status === 'blocked').length;

  // MT5-style color tokens for status bar
  const NAVY = '#1B3955';
  const NAVY_HI = '#234A6E';
  const DIV = 'rgba(255,255,255,0.14)';
  const DIM = 'rgba(255,255,255,0.55)';
  const TXT = 'rgba(255,255,255,0.82)';
  const ACC = '#5BB0FF';
  const OK = '#22C55E';
  const WARN = '#FBBF24';
  const pingColor = ping < 15 ? OK : ping < 30 ? WARN : '#EF4444';
  const Sep = () => /*#__PURE__*/React.createElement("span", {
    style: {
      width: 1,
      height: 14,
      background: DIV
    }
  });
  const iconBtnStyle = {
    position: 'relative',
    width: 26,
    height: 24,
    borderRadius: 3,
    background: 'transparent',
    color: TXT,
    border: 'none',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'background .12s'
  };
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '0 10px',
      height: 30,
      gap: 10,
      background: NAVY,
      borderTop: `1px solid ${NAVY_HI}`,
      flexShrink: 0,
      fontSize: 11,
      color: TXT,
      fontFamily: 'JetBrains Mono, Roboto Mono, monospace',
      letterSpacing: 0.1,
      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      fontWeight: 600
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 7,
      height: 7,
      borderRadius: '50%',
      background: OK,
      boxShadow: `0 0 6px ${OK}`,
      animation: 'mgrPulse 1.8s infinite'
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      color: TXT
    }
  }, "Connected"), /*#__PURE__*/React.createElement("span", {
    style: {
      color: pingColor,
      fontWeight: 700
    }
  }, ping, "ms")), /*#__PURE__*/React.createElement(Sep, null), stats.isSports ? /*#__PURE__*/React.createElement("span", {
    style: {
      color: DIM,
      display: 'inline-flex',
      alignItems: 'center',
      gap: 0
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: DIM,
      fontSize: 9,
      fontWeight: 700,
      letterSpacing: 0.5
    }
  }, "HANDLE"), /*#__PURE__*/React.createElement("span", {
    style: {
      color: '#5BB0FF',
      fontWeight: 700,
      marginLeft: 6,
      fontSize: 12
    }
  }, "$", MANAGER.fmt(stats.openStakes, 0)), /*#__PURE__*/React.createElement("span", {
    style: {
      color: DIV,
      margin: '0 10px'
    }
  }, "\xB7"), /*#__PURE__*/React.createElement("span", {
    style: {
      color: DIM,
      fontSize: 9,
      fontWeight: 700,
      letterSpacing: 0.5
    }
  }, "LIABILITY"), /*#__PURE__*/React.createElement("span", {
    style: {
      color: '#FB7185',
      fontWeight: 700,
      marginLeft: 6,
      fontSize: 12
    }
  }, "$", MANAGER.fmt(stats.liability, 0)), /*#__PURE__*/React.createElement("span", {
    style: {
      color: DIV,
      margin: '0 10px'
    }
  }, "\xB7"), /*#__PURE__*/React.createElement("span", {
    style: {
      color: DIM,
      fontSize: 9,
      fontWeight: 700,
      letterSpacing: 0.5
    }
  }, "NET HOUSE"), /*#__PURE__*/React.createElement("span", {
    style: {
      color: stats.netHousePnl >= 0 ? '#22C55E' : '#FB7185',
      fontWeight: 700,
      marginLeft: 6,
      fontSize: 12
    }
  }, stats.netHousePnl >= 0 ? '+' : '\u2212', "$", MANAGER.fmt(Math.abs(stats.netHousePnl), 0))) : /*#__PURE__*/React.createElement("span", {
    style: {
      color: DIM,
      display: 'inline-flex',
      alignItems: 'center',
      gap: 0
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: DIM,
      fontSize: 9,
      fontWeight: 700,
      letterSpacing: 0.5
    }
  }, "BALANCE"), /*#__PURE__*/React.createElement("span", {
    style: {
      color: TXT,
      fontWeight: 700,
      marginLeft: 6,
      fontSize: 12
    }
  }, "$", MANAGER.fmt(stats.totalBalance, 0)), /*#__PURE__*/React.createElement("span", {
    style: {
      color: DIV,
      margin: '0 10px'
    }
  }, "\xB7"), /*#__PURE__*/React.createElement("span", {
    style: {
      color: DIM,
      fontSize: 9,
      fontWeight: 700,
      letterSpacing: 0.5
    }
  }, "EQUITY"), /*#__PURE__*/React.createElement("span", {
    style: {
      color: stats.totalEquity >= stats.totalBalance ? '#22C55E' : '#FB7185',
      fontWeight: 700,
      marginLeft: 6,
      fontSize: 12
    }
  }, "$", MANAGER.fmt(stats.totalEquity, 0)), /*#__PURE__*/React.createElement("span", {
    style: {
      color: DIV,
      margin: '0 10px'
    }
  }, "\xB7"), /*#__PURE__*/React.createElement("span", {
    style: {
      color: DIM,
      fontSize: 9,
      fontWeight: 700,
      letterSpacing: 0.5
    }
  }, "FLOAT P/L"), /*#__PURE__*/React.createElement("span", {
    style: {
      color: stats.floatingPnl >= 0 ? '#22C55E' : '#FB7185',
      fontWeight: 700,
      marginLeft: 6,
      fontSize: 12
    }
  }, stats.floatingPnl >= 0 ? '+' : '\u2212', "$", MANAGER.fmt(Math.abs(stats.floatingPnl), 0))), /*#__PURE__*/React.createElement(Sep, null), /*#__PURE__*/React.createElement(RiskAlertsBadge, null), pendingKyc > 0 && /*#__PURE__*/React.createElement("button", {
    onClick: () => openClientFilter && openClientFilter('pending_kyc'),
    title: `${pendingKyc} pending KYC`,
    style: iconBtnStyle
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'Material Symbols Outlined',
      fontSize: 15,
      color: WARN
    }
  }, "id_card"), /*#__PURE__*/React.createElement("span", {
    className: "mono",
    style: {
      position: 'absolute',
      top: 1,
      right: 1,
      fontSize: 8,
      fontWeight: 800,
      color: WARN,
      lineHeight: 1
    }
  }, pendingKyc)),
    /*#__PURE__*/React.createElement(Sep, null),
    setQuotesOpen && /*#__PURE__*/React.createElement('button', {
      title: quotesOpen ? 'Hide quotes/markets panel' : 'Show quotes/markets panel',
      onClick: function(){ setQuotesOpen(!quotesOpen); },
      style: {
        display:'inline-flex', alignItems:'center', gap:5,
        height: 22, padding:'0 10px',
        background: quotesOpen ? 'rgba(91,176,255,0.18)' : 'rgba(255,255,255,0.06)',
        border: '1px solid ' + (quotesOpen ? 'rgba(91,176,255,0.40)' : 'rgba(255,255,255,0.20)'),
        borderRadius: 3,
        color: quotesOpen ? ACC : TXT,
        cursor: 'pointer',
        fontSize: 10, fontWeight: 700, letterSpacing: 0.5, textTransform:'uppercase',
        fontFamily: 'inherit'
      },
      onMouseEnter: function(e){ e.currentTarget.style.background = quotesOpen ? 'rgba(91,176,255,0.30)' : 'rgba(255,255,255,0.14)'; },
      onMouseLeave: function(e){ e.currentTarget.style.background = quotesOpen ? 'rgba(91,176,255,0.18)' : 'rgba(255,255,255,0.06)'; }
    }, 
      /*#__PURE__*/React.createElement('span', { style:{fontFamily:'Material Symbols Outlined', fontSize:13} }, quotesOpen ? 'visibility' : 'visibility_off'),
      quotesOpen ? 'HIDE QUOTES' : 'SHOW QUOTES'
    ),
    /*#__PURE__*/React.createElement(Sep, null),
    /*#__PURE__*/React.createElement('span', { className:'mono', title:'Local time', style:{color:TXT, fontWeight:600} }, local),
    /*#__PURE__*/React.createElement('span', { style:{color:DIM, fontSize:9} }, 'UTC ' + utc),
    /*#__PURE__*/React.createElement(Sep, null),
    /*#__PURE__*/React.createElement('span', { style:{fontWeight:700, color:TXT, letterSpacing:0.5} }, 'ALPEXA'),
    /*#__PURE__*/
    /*#__PURE__*/React.createElement('span', { style:{color:DIM, fontSize:9} }, 'v2.4.1')
  );
}

try {
  ReactDOM.createRoot(document.getElementById('root')).render(/*#__PURE__*/React.createElement(ManagerApp, null));
  console.log('[MGR] React mounted OK');
} catch (e) {
  console.error('[MGR] Mount error:', e);
  var r = document.getElementById('root');
  if (r) r.innerHTML = '<div style="padding:40px;font-family:monospace;color:#c62828;background:#fff3f3;margin:20px;border-radius:8px"><b>Mount error:</b><br><br>' + (e.message || e) + '<br><br><small>' + (e.stack || '').replace(/\n/g, '<br>') + '</small></div>';
}
