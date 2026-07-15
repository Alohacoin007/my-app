// ALPEXA Manager — Mock data for back office demo
// Real implementation would fetch from API.

const CLIENTS = [
  { id:'c001', firstName:'Christian', lastName:'Kang',     email:'zbnyme@gmail.com',          phone:'+82 10-•••• 8512', country:'KR', dob:'1985-03-12', kyc:'verified',    risk:'medium', joined:'2026-04-12', status:'active',  online:true,  lastSeen:'2026-05-19 14:42', sessionDevice:'iPhone 15 Pro' },
  { id:'c002', firstName:'Sarah',     lastName:'Müller',   email:'sarah.muller@example.com',  phone:'+41 79-••• 4421',  country:'CH', dob:'1990-07-22', kyc:'verified',    risk:'low',    joined:'2026-04-18', status:'active',  online:true,  lastSeen:'2026-05-19 14:39', sessionDevice:'MacBook Pro · Chrome' },
  { id:'c003', firstName:'Hiroshi',   lastName:'Tanaka',   email:'h.tanaka@example.jp',       phone:'+81 90-•••• 2118', country:'JP', dob:'1988-11-04', kyc:'pending',     risk:'low',    joined:'2026-05-01', status:'limited', online:false, lastSeen:'2026-05-19 11:18', sessionDevice:'Android · Pixel 8' },
  { id:'c004', firstName:'Emma',      lastName:'Smith',    email:'emma.s@example.co.uk',      phone:'+44 7700-•••442',  country:'GB', dob:'1993-02-19', kyc:'verified',    risk:'high',   joined:'2026-03-08', status:'active',  online:true,  lastSeen:'2026-05-19 14:41', sessionDevice:'Windows · Edge' },
  { id:'c005', firstName:'Lucas',     lastName:'Pereira',  email:'lucas.p@example.br',        phone:'+55 11-••••-7831', country:'BR', dob:'1982-09-30', kyc:'rejected',    risk:'high',   joined:'2026-05-09', status:'blocked', online:false, lastSeen:'2026-05-17 18:22', sessionDevice:'iPhone 14' },
  { id:'c006', firstName:'Anna',      lastName:'Kowalski', email:'a.kowalski@example.pl',     phone:'+48 22-••••451',   country:'PL', dob:'1995-06-15', kyc:'verified',    risk:'low',    joined:'2026-05-12', status:'active',  online:false, lastSeen:'2026-05-19 09:14', sessionDevice:'iPad Air' },
  { id:'c007', firstName:'Mohamed',   lastName:'Al-Rashid',email:'m.alrashid@example.ae',     phone:'+971 50-•••6624',  country:'AE', dob:'1979-12-08', kyc:'verified',    risk:'medium', joined:'2026-02-22', status:'active',  online:true,  lastSeen:'2026-05-19 14:38', sessionDevice:'iPhone 15 · Safari' },
  { id:'c008', firstName:'Sophie',    lastName:'Dubois',   email:'sophie.d@example.fr',       phone:'+33 6-•••• 4912',  country:'FR', dob:'1991-04-27', kyc:'pending',     risk:'medium', joined:'2026-05-15', status:'limited', online:false, lastSeen:'2026-05-18 22:05', sessionDevice:'MacBook Air' },
  { id:'c009', firstName:'Marco',     lastName:'Rossi',    email:'m.rossi@example.it',        phone:'+39 333-•••7732',  country:'IT', dob:'1986-08-11', kyc:'verified',    risk:'low',    joined:'2026-01-30', status:'active',  online:true,  lastSeen:'2026-05-19 14:40', sessionDevice:'Windows · Chrome' },
  { id:'c010', firstName:'Min-jun',   lastName:'Park',     email:'mjpark@example.kr',         phone:'+82 10-•••• 3344', country:'KR', dob:'1989-10-25', kyc:'verified',    risk:'medium', joined:'2026-05-02', status:'active',  online:false, lastSeen:'2026-05-19 08:42', sessionDevice:'Galaxy S24' },
  { id:'c011', firstName:'Olivia',    lastName:'Anderson', email:'olivia.a@example.com',      phone:'+1 415-•••-9921',  country:'US', dob:'1992-01-18', kyc:'verified',    risk:'low',    joined:'2026-04-05', status:'active',  online:true,  lastSeen:'2026-05-19 14:42', sessionDevice:'iPhone 15 Pro Max' },
  { id:'c012', firstName:'James',     lastName:'Wright',   email:'j.wright@example.com',      phone:'+1 212-•••-7710',  country:'US', dob:'1984-05-23', kyc:'verified',    risk:'high',   joined:'2026-03-19', status:'active',  online:true,  lastSeen:'2026-05-19 14:42', sessionDevice:'iMac · Chrome' },
  { id:'c013', firstName:'David',     lastName:'Kim',      email:'d.kim@example.kr',          phone:'+82 10-•••• 4521', country:'KR', dob:'1987-06-14', kyc:'verified',    risk:'low',    joined:'2026-04-22', status:'active',  online:false, lastSeen:'2026-05-19 09:12', sessionDevice:'Galaxy S24 Ultra' },
  { id:'c014', firstName:'Isabella',  lastName:'Garcia',   email:'i.garcia@example.es',       phone:'+34 6-••• 4781',   country:'ES', dob:'1990-03-28', kyc:'verified',    risk:'medium', joined:'2026-03-12', status:'active',  online:true,  lastSeen:'2026-05-19 14:38', sessionDevice:'iPad Pro' },
  { id:'c015', firstName:'Thomas',    lastName:'Bauer',    email:'t.bauer@example.at',        phone:'+43 6-•••• 2310',  country:'AT', dob:'1981-11-09', kyc:'verified',    risk:'medium', joined:'2026-02-14', status:'active',  online:false, lastSeen:'2026-05-18 23:42', sessionDevice:'MacBook Pro · Safari' },
  { id:'c016', firstName:'Elena',     lastName:'Petrov',   email:'elena.p@example.ru',        phone:'+7 9-•••• 4012',   country:'RU', dob:'1992-08-21', kyc:'pending',     risk:'high',   joined:'2026-05-17', status:'limited', online:false, lastSeen:'2026-05-19 08:14', sessionDevice:'Windows · Firefox' },
  { id:'c017', firstName:'Carlos',    lastName:'Mendoza',  email:'c.mendoza@example.mx',      phone:'+52 55-•••8924',   country:'MX', dob:'1985-10-17', kyc:'verified',    risk:'medium', joined:'2026-04-08', status:'active',  online:true,  lastSeen:'2026-05-19 14:40', sessionDevice:'iPhone 15' },
  { id:'c018', firstName:'Maria',     lastName:'Silva',    email:'m.silva@example.pt',        phone:'+351 9-•••2231',   country:'PT', dob:'1988-04-06', kyc:'verified',    risk:'low',    joined:'2026-01-25', status:'active',  online:false, lastSeen:'2026-05-19 10:24', sessionDevice:'MacBook Air' },
  { id:'c019', firstName:'Liam',      lastName:'O\'Connor',email:'l.oconnor@example.ie',      phone:'+353 8-•••6712',   country:'IE', dob:'1994-12-03', kyc:'verified',    risk:'low',    joined:'2026-04-30', status:'active',  online:true,  lastSeen:'2026-05-19 14:39', sessionDevice:'iPhone 15 Pro' },
  { id:'c020', firstName:'Yuki',      lastName:'Sato',     email:'yuki.sato@example.jp',      phone:'+81 90-•••• 8821', country:'JP', dob:'1991-07-19', kyc:'pending',     risk:'medium', joined:'2026-05-18', status:'limited', online:true,  lastSeen:'2026-05-19 14:42', sessionDevice:'iPad Air' },
  { id:'c021', firstName:'William',   lastName:'Brown',    email:'w.brown@example.com',       phone:'+1 312-•••-3421',  country:'US', dob:'1983-09-11', kyc:'verified',    risk:'medium', joined:'2026-03-22', status:'active',  online:false, lastSeen:'2026-05-19 12:18', sessionDevice:'Windows · Chrome' },
  { id:'c022', firstName:'Charlotte', lastName:'Lee',      email:'c.lee@example.com',         phone:'+1 650-•••-7821',  country:'US', dob:'1996-02-28', kyc:'verified',    risk:'low',    joined:'2026-05-08', status:'active',  online:true,  lastSeen:'2026-05-19 14:41', sessionDevice:'MacBook Pro' },
  { id:'c023', firstName:'Alexander', lastName:'Schmidt',  email:'a.schmidt@example.de',      phone:'+49 30-••••671',   country:'DE', dob:'1980-06-05', kyc:'verified',    risk:'low',    joined:'2026-02-09', status:'active',  online:false, lastSeen:'2026-05-19 08:50', sessionDevice:'Linux · Firefox' },
  { id:'c024', firstName:'Aaliyah',   lastName:'Hassan',   email:'a.hassan@example.ng',       phone:'+234 81-•••4521',  country:'NG', dob:'1989-01-15', kyc:'verified',    risk:'high',   joined:'2026-04-02', status:'active',  online:false, lastSeen:'2026-05-18 18:42', sessionDevice:'Android · Pixel 9' },
  { id:'c025', firstName:'Noah',      lastName:'Andersen', email:'n.andersen@example.dk',     phone:'+45 5-•••• 4521',  country:'DK', dob:'1993-11-28', kyc:'verified',    risk:'low',    joined:'2026-05-14', status:'active',  online:true,  lastSeen:'2026-05-19 14:40', sessionDevice:'iPhone 15' },
];

// Generate additional accounts for the new clients
const ADDITIONAL_ACCOUNTS = [
  { id:'a015', clientId:'c013', accountNo:'13548721', tag:'LIVE',   currency:'USD', balance:54200.00,   equity:54812.50,   margin:1840.00, leverage:100, group:'Standard', created:'2026-04-22 09:14:22' },
  { id:'a016', clientId:'c014', accountNo:'14258910', tag:'LIVE',   currency:'EUR', balance:38200.00,   equity:39124.00,   margin:1620.00, leverage:100, group:'Standard', created:'2026-03-12 10:42:08' },
  { id:'a017', clientId:'c015', accountNo:'15820471', tag:'LIVE',   currency:'EUR', balance:120000.00,  equity:121420.50,  margin:4820.00, leverage:200, group:'Pro',      created:'2026-02-14 11:28:35' },
  { id:'a018', clientId:'c016', accountNo:'16412580', tag:'LIVE',   currency:'USD', balance:8500.00,    equity:8500.00,    margin:0,       leverage:30,  group:'Standard', created:'2026-05-17 13:15:47' },
  { id:'a019', clientId:'c017', accountNo:'17284015', tag:'LIVE',   currency:'USD', balance:62000.00,   equity:61240.30,   margin:3420.00, leverage:100, group:'Standard', created:'2026-04-08 14:32:18' },
  { id:'a020', clientId:'c018', accountNo:'18504231', tag:'LIVE',   currency:'EUR', balance:14800.00,   equity:14920.00,   margin:520.00,  leverage:100, group:'Standard', created:'2026-01-25 15:48:51' },
  { id:'a021', clientId:'c019', accountNo:'19674218', tag:'LIVE',   currency:'EUR', balance:8200.00,    equity:8284.00,    margin:280.00,  leverage:100, group:'Standard', created:'2026-04-30 16:22:09' },
  { id:'a022', clientId:'c020', accountNo:'20158420', tag:'LIVE',   currency:'JPY', balance:850000,     equity:850000,     margin:0,       leverage:30,  group:'Standard', created:'2026-05-18 17:54:33' },
  { id:'a023', clientId:'c021', accountNo:'21847215', tag:'LIVE',   currency:'USD', balance:42100.00,   equity:42810.50,   margin:1820.00, leverage:100, group:'Standard', created:'2026-03-22 18:11:42' },
  { id:'a024', clientId:'c022', accountNo:'22158400', tag:'LIVE',   currency:'USD', balance:9800.00,    equity:9920.00,    margin:320.00,  leverage:100, group:'Standard', created:'2026-05-08 19:28:15' },
  { id:'a025', clientId:'c023', accountNo:'23541870', tag:'LIVE',   currency:'EUR', balance:185000.00,  equity:184820.00,  margin:8420.00, leverage:200, group:'Pro',      created:'2026-02-09 20:42:08' },
  { id:'a026', clientId:'c024', accountNo:'24852014', tag:'LIVE',   currency:'USD', balance:18500.00,   equity:17820.00,   margin:1240.00, leverage:100, group:'Standard', created:'2026-04-02 21:18:35' },
  { id:'a027', clientId:'c024', accountNo:'24852015', tag:'CRYPTO', currency:'USD', balance:5200.00,    equity:5840.30,    margin:820.00,  leverage:5,   group:'Standard', created:'2026-04-02 09:14:22' },
  { id:'a028', clientId:'c025', accountNo:'25841270', tag:'LIVE',   currency:'EUR', balance:24500.00,   equity:24824.50,   margin:920.00,  leverage:100, group:'Standard', created:'2026-05-14 10:42:08' },
];

const ACCOUNTS = [
  { id:'a001', clientId:'c001', accountNo:'08471293', tag:'LIVE',   currency:'USD', balance:3000000.00, equity:3002847.92, margin:1284.50, leverage:100, group:'VIP',      created:'2026-04-12 11:28:35' },
  { id:'a002', clientId:'c001', accountNo:'08471294', tag:'CRYPTO', currency:'USD', balance:0.00,       equity:0.00,       margin:0,       leverage:5,   group:'Standard', created:'2026-04-12 13:15:47' },
  { id:'a003', clientId:'c002', accountNo:'21084712', tag:'LIVE',   currency:'CHF', balance:84210.50,   equity:84512.20,   margin:842.10,  leverage:100, group:'Standard', created:'2026-04-18 14:32:18' },
  { id:'a004', clientId:'c003', accountNo:'31582046', tag:'LIVE',   currency:'JPY', balance:1280000,    equity:1280000,    margin:0,       leverage:30,  group:'Standard', created:'2026-05-01 15:48:51' },
  { id:'a005', clientId:'c004', accountNo:'44219982', tag:'LIVE',   currency:'GBP', balance:158420.30,  equity:152188.10,  margin:8240.00, leverage:200, group:'Pro',      created:'2026-03-08 16:22:09' },
  { id:'a006', clientId:'c004', accountNo:'44219983', tag:'CRYPTO', currency:'USD', balance:12500.00,   equity:13842.50,   margin:3120.00, leverage:5,   group:'Standard', created:'2026-03-08 17:54:33' },
  { id:'a007', clientId:'c005', accountNo:'52716830', tag:'LIVE',   currency:'USD', balance:5000.00,    equity:5000.00,    margin:0,       leverage:100, group:'Standard', created:'2026-05-09 18:11:42' },
  { id:'a008', clientId:'c006', accountNo:'61428517', tag:'LIVE',   currency:'EUR', balance:24800.00,   equity:24812.40,   margin:412.20,  leverage:100, group:'Standard', created:'2026-05-12 19:28:15' },
  { id:'a009', clientId:'c007', accountNo:'73824516', tag:'LIVE',   currency:'USD', balance:480000.00,  equity:478124.30,  margin:18420.0, leverage:200, group:'VIP',      created:'2026-02-22 20:42:08' },
  { id:'a010', clientId:'c008', accountNo:'84217320', tag:'LIVE',   currency:'EUR', balance:7500.00,    equity:7500.00,    margin:0,       leverage:30,  group:'Standard', created:'2026-05-15 21:18:35' },
  { id:'a011', clientId:'c009', accountNo:'90516283', tag:'LIVE',   currency:'EUR', balance:42100.00,   equity:43240.50,   margin:1240.00, leverage:100, group:'Standard', created:'2026-01-30 09:14:22' },
  { id:'a012', clientId:'c010', accountNo:'10284517', tag:'LIVE',   currency:'USD', balance:18500.00,   equity:18412.20,   margin:920.00,  leverage:100, group:'Standard', created:'2026-05-02 10:42:08' },
  { id:'a013', clientId:'c011', accountNo:'11625840', tag:'LIVE',   currency:'USD', balance:32400.00,   equity:32678.90,   margin:1820.00, leverage:100, group:'Standard', created:'2026-04-05 11:28:35' },
  { id:'a014', clientId:'c012', accountNo:'12384517', tag:'LIVE',   currency:'USD', balance:218000.00,  equity:212840.00,  margin:12420.00,leverage:200, group:'Pro',      created:'2026-03-19 13:15:47' },
];

const FUNDING_REQUESTS = [
  { id:'f001', clientId:'c003', accountId:'a004', kind:'deposit',    method:'bank',   amount:5000,    currency:'JPY', requested:'2026-05-19 14:32', status:'pending', notes:'First deposit'              },
  { id:'f002', clientId:'c001', accountId:'a002', kind:'deposit',    method:'crypto', amount:1250,    currency:'USD', requested:'2026-05-19 13:18', status:'pending', notes:'USDT-TRC20 · 0x4f...8a2d'    },
  { id:'f003', clientId:'c004', accountId:'a005', kind:'withdrawal', method:'bank',   amount:8200,    currency:'GBP', requested:'2026-05-19 11:45', status:'pending', notes:'AML review required'         },
  { id:'f004', clientId:'c006', accountId:'a008', kind:'deposit',    method:'card',   amount:5000,    currency:'EUR', requested:'2026-05-19 10:22', status:'approved',notes:'Approved by admin'           },
  { id:'f005', clientId:'c011', accountId:'a013', kind:'withdrawal', method:'wallet', amount:2400,    currency:'USD', requested:'2026-05-19 09:08', status:'approved',notes:'USDC withdrawn'              },
  { id:'f006', clientId:'c012', accountId:'a014', kind:'withdrawal', method:'bank',   amount:15000,   currency:'USD', requested:'2026-05-18 22:31', status:'pending', notes:'Large amount — manual review'},
  { id:'f007', clientId:'c008', accountId:'a010', kind:'deposit',    method:'card',   amount:1500,    currency:'EUR', requested:'2026-05-18 19:47', status:'rejected',notes:'Card declined'               },
];

const POSITIONS = [
  { id:'p001', clientId:'c001', accountId:'a001', sym:'EURUSD', side:'BUY',  vol:5.00,  open:1.08120, current:1.08412, pnl: 14600.00, opened:'2026-05-18 09:42' },
  { id:'p002', clientId:'c001', accountId:'a001', sym:'XAUUSD', side:'BUY',  vol:1.00,  open:2342.10, current:2348.15, pnl: 605.00,   opened:'2026-05-18 11:15' },
  { id:'p003', clientId:'c004', accountId:'a005', sym:'NVDA',   side:'BUY',  vol:100,   open:911.20,  current:924.18,  pnl: 1298.00,  opened:'2026-05-15 22:30' },
  { id:'p004', clientId:'c004', accountId:'a005', sym:'BTCUSD', side:'SELL', vol:0.5,   open:72100,   current:71284.6, pnl: 407.70,   opened:'2026-05-17 18:22' },
  { id:'p005', clientId:'c007', accountId:'a009', sym:'USDJPY', side:'SELL', vol:10.00, open:156.910, current:156.342, pnl: 3635.46,  opened:'2026-05-18 14:08' },
  { id:'p006', clientId:'c007', accountId:'a009', sym:'TSLA',   side:'BUY',  vol:200,   open:241.50,  current:247.31,  pnl: 1162.00,  opened:'2026-05-17 19:14' },
  { id:'p007', clientId:'c009', accountId:'a011', sym:'GBPUSD', side:'SELL', vol:2.00,  open:1.27210, current:1.26834, pnl: 752.00,   opened:'2026-05-18 08:11' },
  { id:'p008', clientId:'c012', accountId:'a014', sym:'AAPL',   side:'BUY',  vol:300,   open:215.10,  current:218.74,  pnl: 1092.00,  opened:'2026-05-16 22:55' },
  { id:'p009', clientId:'c012', accountId:'a014', sym:'ETHUSD', side:'BUY',  vol:5,     open:3920,    current:3842.18, pnl: -389.10,  opened:'2026-05-17 20:42' },
  { id:'p010', clientId:'c011', accountId:'a013', sym:'EURUSD', side:'SELL', vol:0.30, open:1.08920,  current:1.08412, pnl: 152.40,   opened:'2026-05-16 18:30' },
  { id:'p011', clientId:'c003', accountId:'a004', sym:'USDJPY', side:'BUY',  vol:0.40, open:155.910,  current:156.342, pnl: 110.40,   opened:'2026-05-15 19:47' },
  { id:'p012', clientId:'c002', accountId:'a003', sym:'XAUUSD', side:'SELL', vol:0.05, open:2356.40,  current:2348.15, pnl: 41.25,    opened:'2026-05-16 15:08' },
];

const ADMIN_ACTIVITY = [
  { ts:'2026-05-19 14:42', user:'admin@alpexa.com',    action:'Approved deposit',        target:'F003 · GBP 8,200',      ip:'82.220.12.4' },
  { ts:'2026-05-19 14:32', user:'manager1@alpexa.com', action:'Adjusted balance',        target:'C001 · +$3,000,000',    ip:'82.220.12.18' },
  { ts:'2026-05-19 13:18', user:'manager1@alpexa.com', action:'Approved KYC',            target:'C002 · Sarah Müller',   ip:'82.220.12.18' },
  { ts:'2026-05-19 11:45', user:'compliance@alpexa.com',action:'Rejected withdrawal',    target:'F007 · EUR 1,500',      ip:'82.220.12.7'  },
  { ts:'2026-05-19 10:22', user:'admin@alpexa.com',    action:'Created promotion',       target:'Crypto deposit 0% fee', ip:'82.220.12.4'  },
  { ts:'2026-05-19 09:08', user:'manager2@alpexa.com', action:'Changed leverage',        target:'C007 · 1:200 → 1:100',  ip:'82.220.12.21' },
];

const SYSTEM_SETTINGS = {
  spreadMarkup: { FX: 0, STOCK: 0, CRYPTO: 0, INDEX: 0, METAL: 0 },
};

window.MANAGER = { CLIENTS, ACCOUNTS: [...ACCOUNTS, ...ADDITIONAL_ACCOUNTS], FUNDING_REQUESTS, POSITIONS, ADMIN_ACTIVITY, SYSTEM_SETTINGS };

// Generate additional bulk clients for testing scroll with 100+ records
(function generateBulkClients() {
  const FIRST_NAMES = ['Aria','Ben','Cara','Diego','Eli','Fiona','Gabe','Hana','Ivan','Julia','Kai','Lara','Mila','Nico','Owen','Priya','Quinn','Ravi','Sara','Tom','Uma','Vera','Will','Xena','Yara','Zane','Bruno','Clara','Damian','Eva','Felix','Greta','Hugo','Iris','Jake','Kira','Leo','Maya','Niko','Olga','Paul','Rita','Sofia','Theo','Una'];
  const LAST_NAMES = ['Becker','Cohen','Dubois','Erikson','Fischer','Goldberg','Hoffman','Ito','Jensen','Klein','Lopez','Mahmood','Novak','Ortega','Pacheco','Quinn','Rocha','Saito','Tanaka','Ueda','Volkov','Wagner','Yamamoto','Zhang','Adams','Brown','Chan','Davis','Evans','Foster'];
  const COUNTRIES = ['KR','JP','US','GB','DE','FR','ES','IT','PL','BR','MX','AU','CA','NL','SE','CH','AE','IN','SG','HK','PT','IE','DK','AT','BE'];
  const STATUSES = ['active','active','active','active','active','limited'];
  const KYCS = ['verified','verified','verified','verified','pending','rejected'];
  const RISKS = ['low','low','medium','medium','high'];
  const times = ['09:14:22','10:42:08','11:28:35','13:15:47','14:32:18','15:48:51','16:22:09','17:54:33','18:11:42','19:28:15','20:42:08','21:18:35'];
  const DEVICES = ['iPhone 15','Android Pixel','MacBook Pro','Windows · Chrome','iPad Air','iMac · Safari'];

  const start = CLIENTS.length;
  for (let i = 0; i < 110; i++) {
    const idNum = start + i + 1;
    const cid = 'c' + String(idNum).padStart(3, '0');
    const firstName = FIRST_NAMES[(i * 7) % FIRST_NAMES.length];
    const lastName = LAST_NAMES[(i * 11) % LAST_NAMES.length];
    const country = COUNTRIES[(i * 5) % COUNTRIES.length];
    const status = STATUSES[(i * 3) % STATUSES.length];
    const kyc = KYCS[(i * 7) % KYCS.length];
    const risk = RISKS[(i * 13) % RISKS.length];
    const online = ((i * 17) % 5) < 3;
    const device = DEVICES[(i * 5) % DEVICES.length];
    const month = String((i % 5) + 1).padStart(2, '0');
    const day = String((i * 3) % 28 + 1).padStart(2, '0');
    const joined = `2026-${month}-${day}`;
    const lastSeen = online ? `2026-05-19 14:${String(40 - (i % 30)).padStart(2,'0')}` : `2026-05-${String(15 + (i % 5)).padStart(2,'0')} 0${(i%9)+1}:${String((i*7)%60).padStart(2,'0')}`;

    CLIENTS.push({
      id: cid,
      firstName,
      lastName,
      email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}@example.com`,
      phone: `+1 ${String(200 + (i % 800)).padStart(3,'0')}-•••-${String(1000 + (i * 31) % 9000)}`,
      country,
      dob: `198${(i % 9)}-${month}-${day}`,
      kyc,
      risk,
      joined,
      status,
      online,
      lastSeen,
      sessionDevice: device,
    });

    // Generate one LIVE account
    const balance = Math.round((5000 + (i * 1234) % 95000) / 100) * 100;
    const equity = Math.round(balance * (0.92 + ((i * 7) % 20) / 100));
    const currencies = ['USD','EUR','GBP','JPY','CHF'];
    const currency = currencies[i % currencies.length];
    const groups = ['Standard','Standard','Standard','Pro','VIP'];
    const group = groups[(i * 3) % groups.length];
    window.MANAGER.ACCOUNTS.push({
      id: 'a' + String(100 + idNum).padStart(3, '0'),
      clientId: cid,
      accountNo: String(30000000 + idNum * 1234).padStart(8, '0'),
      tag: 'LIVE',
      currency,
      balance: currency === 'JPY' ? balance * 150 : balance,
      equity:  currency === 'JPY' ? equity * 150 : equity,
      margin: Math.round(balance * 0.04),
      leverage: [30, 100, 200][i % 3],
      group,
      created: joined + ' ' + times[((i*7)%times.length)],
    });
  }
})();

// Helper utilities
window.MANAGER.fmt = function(n, decimals = 2) {
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
};
window.MANAGER.findClient = function(id) {
  return CLIENTS.find(c => c.id === id);
};
window.MANAGER.findAccounts = function(clientId) {
  return ACCOUNTS.filter(a => a.clientId === clientId);
};
window.MANAGER.findPositions = function(clientId) {
  return POSITIONS.filter(p => p.clientId === clientId);
};
window.MANAGER.timeAgo = function(ts) {
  const d = new Date(ts.replace(' ', 'T'));
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return Math.floor(diff) + 's ago';
  if (diff < 3600) return Math.floor(diff/60) + 'm ago';
  if (diff < 86400) return Math.floor(diff/3600) + 'h ago';
  return Math.floor(diff/86400) + 'd ago';
};
