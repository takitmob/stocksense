'use strict';

const REGIONS = {
  brvm:      { label:'BRVM — Afrique de l\'Ouest (UEMOA)', flag:'🌍', currency:'FCFA',
    context:'BRVM zone UEMOA, juillet 2026, +37.4% YTD. Actions: SNTS, BOABF, ORAC, CBIBF, ETIT, NSBC, CIEC.' },
  tsx:       { label:'TSX — Canada',                        flag:'🍁', currency:'$CAD',
    context:'TSX Canada, juillet 2026, Banque du Canada en baisse de taux. Actions: ENB, RY, TD, SU, BCE, XBAL.' },
  usa:       { label:'NYSE/NASDAQ — États-Unis',            flag:'🇺🇸', currency:'$USD',
    context:'NYSE/NASDAQ, juillet 2026, S&P500 +18.3% YTD, Fed en pause. Actions: NVDA, MSFT, AAPL, V, JPM, GOOGL.' },
  europe:    { label:'Europe — Euronext & DAX & FTSE',      flag:'🇪🇺', currency:'EUR',
    context:'CAC40/DAX/FTSE, juillet 2026, BCE en baisse de taux. Actions: AIR, ASML, MC, BNP, TTE, SAP.' },
  asie:      { label:'Asie — Nikkei, Hang Seng, Shanghai',  flag:'🌏', currency:'Locales',
    context:'Nikkei/HSI/SSE, juillet 2026, yen faible, reprise Chine. Actions: TSMC, Toyota, SoftBank, Tencent, Samsung.' },
  emergents: { label:'Marchés Émergents',                   flag:'🌐', currency:'Locales',
    context:'Brésil/Inde/Afrique du Sud, juillet 2026, Inde +7.2% PIB. Actions: Reliance, HDFC Bank, MTN, Safaricom, Petrobras.' }
};

const FALLBACK = {
  brvm: { summary:'BRVM Composite +37.4% YTD 2026. Bull market soutenu. Finance et télécoms en tête.',
    stocks:[
      {rank:1,ticker:'SNTS', name:'SONATEL SN',         price:'31 710 FCFA', change:'+1.2%',change_dir:'up',sector:'Télécoms', per:'7.8', dividend:'5.5%',signal:'b',signal_label:'ACHETER',   why:'Pilier BRVM, dividendes réguliers 20 ans, PER attractif.'},
      {rank:2,ticker:'BOABF',name:'BOA Burkina Faso',   price:'6 300 FCFA',  change:'+0.8%',change_dir:'up',sector:'Finance',  per:'9.1', dividend:'9.2%',signal:'b',signal_label:'ACHETER',   why:'Meilleur rendement dividende BRVM — 9.2%, fondamentaux solides.'},
      {rank:3,ticker:'CBIBF',name:'Coris Bank Intl BF', price:'30 005 FCFA', change:'+7.5%',change_dir:'up',sector:'Finance',  per:'10.5',dividend:'6.3%',signal:'b',signal_label:'ACHETER',   why:'+99% sur 1 an, expansion régionale rapide.'},
      {rank:4,ticker:'CIEC', name:'CIE Côte d\'Ivoire', price:'5 325 FCFA',  change:'+2.1%',change_dir:'up',sector:'Utilities',per:'8.4', dividend:'4.4%',signal:'b',signal_label:'ACHETER',   why:'+111% YTD, boom infrastructures électriques.'},
      {rank:5,ticker:'ORAC', name:'Orange CI',           price:'16 200 FCFA', change:'+0.3%',change_dir:'fl',sector:'Télécoms', per:'12.1',dividend:'4.8%',signal:'h',signal_label:'CONSERVER', why:'Leader télécoms ivoirien, valeur défensive.'},
      {rank:6,ticker:'NSBC', name:'NSIA Banque CI',      price:'21 500 FCFA', change:'+1.5%',change_dir:'up',sector:'Finance',  per:'11.6',dividend:'3.9%',signal:'h',signal_label:'CONSERVER', why:'Bilan +22%, surveiller qualité du portefeuille.'}
    ]},
  tsx: { summary:'TSX solide en 2026. Baisse taux Banque du Canada. Énergie et banques en vedette.',
    stocks:[
      {rank:1,ticker:'ENB', name:'Enbridge Inc.',         price:'79.20 $CAD', change:'+0.8%',change_dir:'up',sector:'Énergie',  per:'26.1',dividend:'6.3%', signal:'b',signal_label:'ACHETER',   why:'31 ans de hausse du dividende, pipeline défensif.'},
      {rank:2,ticker:'RY',  name:'Royal Bank of Canada',  price:'145.30 $CAD',change:'+0.5%',change_dir:'up',sector:'Finance',  per:'12.8',dividend:'3.8%', signal:'b',signal_label:'ACHETER',   why:'1ère capitalisation TSX, résultats record T2 2026.'},
      {rank:3,ticker:'SU',  name:'Suncor Energy',         price:'56.80 $CAD', change:'+1.1%',change_dir:'up',sector:'Énergie',  per:'8.9', dividend:'4.5%', signal:'b',signal_label:'ACHETER',   why:'PER bas, sables bitumineux compétitifs.'},
      {rank:4,ticker:'XBAL',name:'iShares Core Balanced', price:'32.45 $CAD', change:'+0.4%',change_dir:'up',sector:'ETF',      per:'N/A', dividend:'~3.5%',signal:'b',signal_label:'ACHETER',   why:'ETF tout-en-un idéal. MER 0.20%, 0$ commission Wealthsimple.'},
      {rank:5,ticker:'TD',  name:'TD Bank',               price:'85.10 $CAD', change:'-0.3%',change_dir:'dn',sector:'Finance',  per:'11.2',dividend:'4.2%', signal:'h',signal_label:'CONSERVER', why:'Banque solide mais pression réglementaire USA.'},
      {rank:6,ticker:'BCE', name:'BCE Inc.',              price:'28.90 $CAD', change:'-0.5%',change_dir:'dn',sector:'Télécoms', per:'9.8', dividend:'11.2%',signal:'h',signal_label:'CONSERVER', why:'Dividende 11.2% élevé mais dette importante.'}
    ]},
  usa: { summary:'S&P500 +18.3% YTD 2026. Fed en pause. IA, tech et santé dominent.',
    stocks:[
      {rank:1,ticker:'NVDA', name:'NVIDIA Corporation',price:'$148.20',change:'+2.8%',change_dir:'up',sector:'Semi-conducteurs',per:'35.2',dividend:'0.03%',signal:'b',signal_label:'ACHETER',   why:'Leader IA, datacenter en explosion, carnet plein 2027.'},
      {rank:2,ticker:'MSFT', name:'Microsoft Corp.',   price:'$462.50',change:'+0.9%',change_dir:'up',sector:'Tech/Cloud',      per:'32.1',dividend:'0.7%', signal:'b',signal_label:'ACHETER',   why:'Azure +29%, Copilot IA intégré, SaaS très rentable.'},
      {rank:3,ticker:'V',    name:'Visa Inc.',         price:'$291.40',change:'+0.7%',change_dir:'up',sector:'Paiements',       per:'27.8',dividend:'0.8%', signal:'b',signal_label:'ACHETER',   why:'Paiements digitaux structurel, marges excellentes.'},
      {rank:4,ticker:'JPM',  name:'JPMorgan Chase',    price:'$224.60',change:'+0.4%',change_dir:'up',sector:'Finance',         per:'12.3',dividend:'2.2%', signal:'b',signal_label:'ACHETER',   why:'1ère banque US, bénéfice record 2025.'},
      {rank:5,ticker:'AAPL', name:'Apple Inc.',        price:'$228.80',change:'+0.5%',change_dir:'up',sector:'Tech/Mobile',     per:'29.4',dividend:'0.5%', signal:'h',signal_label:'CONSERVER', why:'Écosystème solide, Apple Intelligence en déploiement.'},
      {rank:6,ticker:'GOOGL',name:'Alphabet Inc.',     price:'$198.30',change:'+1.1%',change_dir:'up',sector:'Tech/Pub',        per:'22.6',dividend:'0.5%', signal:'h',signal_label:'CONSERVER', why:'Gemini IA en montée, pression antitrust à surveiller.'}
    ]},
  europe: { summary:'Marchés européens portés par la BCE. Luxe et aérospatiale tirent la performance.',
    stocks:[
      {rank:1,ticker:'AIR', name:'Airbus SE',       price:'172.40 EUR',change:'+1.4%',change_dir:'up',sector:'Aérospatiale',   per:'28.6',dividend:'1.4%',signal:'b',signal_label:'ACHETER',   why:'Carnet 8 ans, duopole mondial, A320neo accéléré.'},
      {rank:2,ticker:'ASML',name:'ASML Holding',    price:'845.20 EUR',change:'+1.9%',change_dir:'up',sector:'Semi-conducteurs',per:'31.4',dividend:'1.1%',signal:'b',signal_label:'ACHETER',   why:'Monopole EUV, demande IA, aucun concurrent réel.'},
      {rank:3,ticker:'MC',  name:'LVMH',            price:'612.50 EUR',change:'+0.6%',change_dir:'up',sector:'Luxe',            per:'18.9',dividend:'2.1%',signal:'b',signal_label:'ACHETER',   why:'Leader mondial luxe, 75 maisons, PER attractif.'},
      {rank:4,ticker:'BNP', name:'BNP Paribas',     price:'68.40 EUR', change:'+0.8%',change_dir:'up',sector:'Finance',         per:'7.1', dividend:'7.2%',signal:'b',signal_label:'ACHETER',   why:'PER 7.1, dividende 7.2%, 1ère banque zone euro.'},
      {rank:5,ticker:'TTE', name:'TotalEnergies SE',price:'58.90 EUR', change:'+0.3%',change_dir:'fl',sector:'Énergie',          per:'9.2', dividend:'4.8%',signal:'b',signal_label:'ACHETER',   why:'PER bas, dividende 4.8%, transition bien menée.'},
      {rank:6,ticker:'SAP', name:'SAP SE',          price:'238.10 EUR',change:'+1.2%',change_dir:'up',sector:'Tech/ERP',         per:'34.7',dividend:'1.3%',signal:'h',signal_label:'CONSERVER', why:'Transition cloud, valorisation déjà élevée.'}
    ]},
  asie: { summary:'Nikkei soutenu par le yen faible. TSMC et Samsung portés par la demande IA mondiale.',
    stocks:[
      {rank:1,ticker:'2330.TW',  name:'TSMC',               price:'NT$1 045',   change:'+2.3%',change_dir:'up',sector:'Semi-conducteurs',per:'24.8',dividend:'1.5%',signal:'b',signal_label:'ACHETER',   why:'Monopole EUV, puces 2nm, 90% production avancée mondiale.'},
      {rank:2,ticker:'7203.T',   name:'Toyota Motor',        price:'JPY 3 280',  change:'+1.1%',change_dir:'up',sector:'Automobile',      per:'8.4', dividend:'2.9%',signal:'b',signal_label:'ACHETER',   why:'Leader hybride mondial, yen faible booste les exports.'},
      {rank:3,ticker:'9984.T',   name:'SoftBank Group',      price:'JPY 12 450', change:'+3.2%',change_dir:'up',sector:'Tech/VC',          per:'N/A', dividend:'0.5%',signal:'b',signal_label:'ACHETER',   why:'Portfolio IA via Arm Holdings, rebond spectaculaire.'},
      {rank:4,ticker:'700.HK',   name:'Tencent Holdings',    price:'HKD 428.60', change:'+1.5%',change_dir:'up',sector:'Tech/Gaming',      per:'16.2',dividend:'1.2%',signal:'b',signal_label:'ACHETER',   why:'WeChat 1.3Mds utilisateurs, valorisation attractive.'},
      {rank:5,ticker:'005930.KS',name:'Samsung Electronics', price:'KRW 72 400', change:'-0.4%',change_dir:'dn',sector:'Semi-conducteurs',per:'12.1',dividend:'2.8%',signal:'h',signal_label:'CONSERVER', why:'Mémoire HBM IA en montée, retard vs TSMC en puces.'},
      {rank:6,ticker:'9988.HK',  name:'Alibaba Group',       price:'HKD 108.20', change:'+0.9%',change_dir:'up',sector:'E-commerce/Cloud', per:'10.8',dividend:'1.4%',signal:'h',signal_label:'CONSERVER', why:'PER très bas mais incertitude réglementaire Chine.'}
    ]},
  emergents: { summary:'Inde (+7.2% PIB) et Afrique sub-saharienne locomotives des marchés émergents 2026.',
    stocks:[
      {rank:1,ticker:'RELIANCE.NS',name:'Reliance Industries',price:'2 980 INR',   change:'+1.8%',change_dir:'up',sector:'Énergie/Retail',  per:'22.4',dividend:'0.4%', signal:'b',signal_label:'ACHETER',   why:'Conglomérat indien n°1, Jio 450M abonnés.'},
      {rank:2,ticker:'HDFCBANK.NS',name:'HDFC Bank',          price:'1 820 INR',   change:'+1.2%',change_dir:'up',sector:'Finance',          per:'18.6',dividend:'1.1%', signal:'b',signal_label:'ACHETER',   why:'1ère banque privée Inde, crédit +15%/an.'},
      {rank:3,ticker:'MTN',        name:'MTN Group Ltd',      price:'ZAR 108.40',  change:'+0.9%',change_dir:'up',sector:'Télécoms',          per:'9.8', dividend:'5.2%', signal:'b',signal_label:'ACHETER',   why:'Leader télécoms africain 19 pays, Mobile Money en croissance.'},
      {rank:4,ticker:'SAFCOM.NR',  name:'Safaricom PLC',      price:'KES 18.40',   change:'+1.4%',change_dir:'up',sector:'Télécoms/Fintech',  per:'13.2',dividend:'4.1%', signal:'b',signal_label:'ACHETER',   why:'M-Pesa leader fintech Afrique Est, expansion Éthiopie.'},
      {rank:5,ticker:'PETR4',      name:'Petrobras (Brésil)', price:'BRL 38.20',   change:'-0.6%',change_dir:'dn',sector:'Énergie',           per:'5.1', dividend:'12.8%',signal:'h',signal_label:'CONSERVER', why:'PER 5 attractif mais risque politique Brésil.'},
      {rank:6,ticker:'IAM',        name:'Maroc Telecom',      price:'128.50 MAD',  change:'+0.5%',change_dir:'fl',sector:'Télécoms',          per:'16.4',dividend:'5.8%', signal:'b',signal_label:'ACHETER',   why:'10 pays africains, dividende 5.8%, croissance MENA.'}
    ]}
};

window.SS_DATA = { REGIONS, FALLBACK };
