'use strict';

const API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL   = 'claude-sonnet-4-6';

// ── HELPERS ──────────────────────────────────────────────────────────
function ss(v, f) { return (v === null || v === undefined || v === '') ? (f || '—') : String(v); }
function sn(v, f) { const n = parseFloat(v); return isNaN(n) ? (f || 0) : n; }

function parseJSONSafe(text) {
  if (!text) return null;
  const c = text.replace(/^```json\s*/im,'').replace(/^```\s*/im,'').replace(/```\s*$/im,'').trim();
  let p = null;
  try { p = JSON.parse(c); } catch(e) {}
  if (!p) { const m = c.match(/\{[\s\S]*\}/); if (m) { try { p = JSON.parse(m[0]); } catch(e) {} } }
  if (!p) { try { p = JSON.parse(repairJSON(c)); } catch(e) {} }
  return p;
}

function repairJSON(s) {
  let op = 0, ar = 0;
  for (const ch of s) {
    if (ch==='{') op++; else if (ch==='}') op--;
    else if (ch==='[') ar++; else if (ch===']') ar--;
  }
  return s + ']'.repeat(Math.max(0,ar)) + '}'.repeat(Math.max(0,op));
}

function makeFB(n, mn, mx) {
  const o = []; let v = (mn+mx)/2;
  for (let i=0;i<n;i++) {
    v = Math.max(mn, Math.min(mx, v + (Math.random()-.47)*(mx-mn)*.13));
    o.push(Math.round(v*100)/100);
  }
  return o;
}

function sanitizeHistory(arr, n, mn, mx) {
  if (!Array.isArray(arr)||arr.length===0) return makeFB(n,mn,mx);
  const out = [];
  for (let i=0;i<n;i++) { const v=parseFloat(arr[i]); out.push(isNaN(v)?(mn+mx)/2:v); }
  while (out.length<n) out.push(out[out.length-1]||(mn+mx)/2);
  return out.slice(0,n);
}

function sanitizeAnalysis(d, ticker, market) {
  if (!d || typeof d !== 'object') return null;
  const validDC  = ['buy','sell','wait'];
  const validSig = ['buy','sell','neutral'];
  const validQ   = ['good','bad','neutral','plain'];
  const dc = validDC.includes(d.decision_color) ? d.decision_color : 'wait';

  const dtechs = [
    {name:'MM200',value:'—',signal:'neutral',label:'Neutre'},
    {name:'RSI(14)',value:'50',signal:'neutral',label:'Neutre'},
    {name:'MACD',value:'—',signal:'neutral',label:'Neutre'},
    {name:'Volume',value:'Moyen',signal:'neutral',label:'Normal'},
    {name:'Bollinger',value:'—',signal:'neutral',label:'Neutre'},
    {name:'Tendance',value:'—',signal:'neutral',label:'Neutre'}
  ];
  const dfunds = [
    {key:'PER',value:'—',quality:'plain'},{key:'Dividende',value:'—',quality:'plain'},
    {key:'ROE',value:'—',quality:'plain'},{key:'Dette/FP',value:'—',quality:'plain'},
    {key:'Croissance CA',value:'—',quality:'plain'},{key:'Secteur',value:'—',quality:'plain'}
  ];

  const techs = (Array.isArray(d.technicals) && d.technicals.length ? d.technicals : dtechs)
    .slice(0,6).map((t,i) => {
      const sig = validSig.includes(ss(t&&t.signal).toLowerCase()) ? ss(t.signal).toLowerCase() : 'neutral';
      return { name:ss(t&&t.name,dtechs[i]&&dtechs[i].name), value:ss(t&&t.value,'—'), signal:sig, label:ss(t&&t.label,'Neutre') };
    });

  const funds = (Array.isArray(d.fundamentals) && d.fundamentals.length ? d.fundamentals : dfunds)
    .slice(0,6).map((f,i) => {
      const q = validQ.includes(ss(f&&f.quality).toLowerCase()) ? ss(f.quality).toLowerCase() : 'plain';
      return { key:ss(f&&f.key,dfunds[i]&&dfunds[i].key), value:ss(f&&f.value,'—'), quality:q };
    });

  return {
    ticker:         ss(d.ticker, ticker),
    name:           ss(d.name, ticker),
    market:         ss(d.market, market),
    price:          ss(d.price, 'N/D'),
    decision:       ss(d.decision, 'ATTENDRE'),
    decision_color: dc,
    confidence:     Math.max(50, Math.min(95, sn(d.confidence, 65))),
    summary:        ss(d.summary, 'Analyse disponible ci-dessous.'),
    scores: {
      technique:    Math.max(0, Math.min(100, sn((d.scores||{}).technique,    55))),
      fondamentaux: Math.max(0, Math.min(100, sn((d.scores||{}).fondamentaux, 55))),
      macro:        Math.max(0, Math.min(100, sn((d.scores||{}).macro,        55))),
      momentum:     Math.max(0, Math.min(100, sn((d.scores||{}).momentum,     55))),
      risque:       Math.max(0, Math.min(100, sn((d.scores||{}).risque,       55)))
    },
    technicals:     techs,
    fundamentals:   funds,
    catalysts:      (Array.isArray(d.catalysts)?d.catalysts:[]).slice(0,4).map(c=>ss(c)),
    risks:          (Array.isArray(d.risks)?d.risks:[]).slice(0,4).map(r=>ss(r)),
    price_history:  sanitizeHistory(d.price_history,  20, 80,  200),
    rsi_history:    sanitizeHistory(d.rsi_history,    20, 25,  78),
    volume_history: sanitizeHistory(d.volume_history, 20, 50,  500),
    full_analysis:  ss(d.full_analysis, 'Analyse pour ' + ticker),
    fetchedAt:      Date.now()
  };
}

function sanitizeStock(s, i) {
  const sig = ['b','s','h'].includes(ss(s&&s.signal).toLowerCase()) ? ss(s.signal).toLowerCase() : 'h';
  const cd  = ['up','dn','fl'].includes(ss(s&&s.change_dir).toLowerCase()) ? ss(s.change_dir).toLowerCase() : 'fl';
  return {
    rank:         i+1,
    ticker:       ss(s&&s.ticker,'—'),
    name:         ss(s&&s.name,'—'),
    price:        ss(s&&s.price,'N/D'),
    change:       ss(s&&s.change,'—'),
    change_dir:   cd,
    sector:       ss(s&&s.sector,'—'),
    per:          ss(s&&s.per,'N/D'),
    dividend:     ss(s&&s.dividend,'N/D'),
    signal:       sig,
    signal_label: ss(s&&s.signal_label, sig==='b'?'ACHETER':sig==='s'?'VENDRE':'CONSERVER'),
    why:          ss(s&&s.why,'')
  };
}

// ── ANALYSE D'UNE ACTION ────────────────────────────────────────────
async function analyzeStock(apiKey, ticker, market, intent) {
  const imap = { buy:"L'utilisateur souhaite ACHETER.", sell:"L'utilisateur souhaite VENDRE.", watch:"L'utilisateur surveille." };

  const exJSON = '{"ticker":"SNTS","name":"SONATEL SN","market":"BRVM","price":"31 710 FCFA","decision":"ACHETER","decision_color":"buy","confidence":78,"summary":"SONATEL affiche des fondamentaux solides sur la BRVM.","scores":{"technique":72,"fondamentaux":80,"macro":65,"momentum":70,"risque":75},"technicals":[{"name":"MM200","value":"29 500 FCFA","signal":"buy","label":"Haussier"},{"name":"RSI(14)","value":"58","signal":"neutral","label":"Neutre"},{"name":"MACD","value":"Positif","signal":"buy","label":"Achat"},{"name":"Volume","value":"Élevé","signal":"buy","label":"Fort"},{"name":"Bollinger","value":"Zone centrale","signal":"neutral","label":"Neutre"},{"name":"Tendance","value":"Haussière","signal":"buy","label":"Haussier"}],"fundamentals":[{"key":"PER","value":"7.8","quality":"good"},{"key":"Dividende","value":"5.5%","quality":"good"},{"key":"ROE","value":"22%","quality":"good"},{"key":"Dette/FP","value":"0.4","quality":"good"},{"key":"Croissance CA","value":"+8%","quality":"good"},{"key":"Secteur","value":"Télécoms","quality":"plain"}],"catalysts":["Expansion Orange Money","Résultats T2 positifs","Dividende juillet"],"risks":["Concurrence régionale","Risque réglementaire","Exposition CFA/USD"],"price_history":[28000,28500,29000,28800,29200,29800,30100,29900,30200,30500,30800,31000,30700,31100,31300,31500,31200,31600,31800,31710],"rsi_history":[45,48,52,50,55,58,60,57,62,65,63,60,58,61,64,66,62,59,58,58],"volume_history":[100,120,90,110,130,150,140,160,170,145,155,180,165,190,175,200,185,210,195,205],"full_analysis":"**SONATEL SN** est le pilier de la BRVM.\\n\\nFondamentaux solides avec un PER de 7.8 très attractif."}';

  const sys = 'Tu es StockSense AI, analyste boursier expert BRVM et TSX. Contexte: juillet 2026. RÈGLE ABSOLUE: réponds UNIQUEMENT avec un objet JSON valide, sans markdown ni backticks. Commence par { et termine par }.';
  const msg = `Analyse l'action ${ticker} sur ${market==='AUTO'?'BRVM ou TSX selon le ticker':market}. ${imap[intent]||''}\nUtilise exactement la même structure JSON que cet exemple: ${exJSON}\nRemplace avec les données réelles de ${ticker} en juillet 2026.\nsignal: buy/sell/neutral uniquement. quality: good/bad/neutral/plain uniquement.\n20 nombres dans chaque historique (price_history, rsi_history, volume_history). full_analysis en 150-200 mots avec **mots clés** en gras. JSON pur uniquement.`;

  const resp = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
    body: JSON.stringify({ model: MODEL, max_tokens: 2000, system: sys, messages: [{ role:'user', content:msg }] })
  });

  if (!resp.ok) {
    const eb = await resp.json().catch(() => ({}));
    throw new Error('API ' + resp.status + (eb?.error?.message ? ' — ' + eb.error.message : ''));
  }

  const d = await resp.json();
  const raw = (d.content||[]).find(b=>b.type==='text')?.text || '';
  const parsed = parseJSONSafe(raw);
  if (!parsed) throw new Error('Réponse IA invalide. Réessaie.');
  const result = sanitizeAnalysis(parsed, ticker, market);
  if (!result) throw new Error('Données IA incomplètes. Réessaie.');
  return result;
}

// ── DONNÉES MARCHÉ RÉGIONALES ────────────────────────────────────────
async function fetchRegionData(apiKey, region) {
  const { REGIONS, FALLBACK } = window.SS_DATA;
  const info = REGIONS[region];
  const fb   = FALLBACK[region];

  const devises = {brvm:'FCFA',tsx:'$CAD',usa:'$USD',europe:'EUR',asie:'devise locale (JPY/HKD/TWD/KRW)',emergents:'devise locale (INR/ZAR/BRL/MAD/KES)'};
  const devise  = devises[region] || 'devise locale';
  const exStock = JSON.stringify(fb.stocks[0]);

  const sys = `Tu es analyste boursier expert spécialisé sur ${info.label}. RÈGLE ABSOLUE: réponds UNIQUEMENT avec un objet JSON valide, sans markdown ni backticks. Commence par { et termine par }.`;
  const msg = `Génère un JSON listant les 6 meilleures actions de ${info.label} en juillet 2026.\nContexte: ${info.context}\nIMPORTANT: Prix en ${devise} UNIQUEMENT. N'utilise jamais FCFA ni tickers BRVM pour un marché non-BRVM.\nFormat JSON exact:\n{"region":"${region}","label":"${info.label}","summary":"1 phrase sur le contexte actuel","stocks":[${exStock},...5 autres actions]}\nRègles: signal b=acheter s=vendre h=conserver, change_dir up/dn/fl, 6 actions exactement de ${info.label}, JSON pur.`;

  const resp = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
    body: JSON.stringify({ model: MODEL, max_tokens: 2000, system: sys, messages: [{ role:'user', content:msg }] })
  });

  if (!resp.ok) {
    const eb = await resp.json().catch(() => ({}));
    throw new Error('API ' + resp.status + (eb?.error?.message ? ' — ' + eb.error.message : ''));
  }

  const d   = await resp.json();
  const raw = (d.content||[]).find(b=>b.type==='text')?.text || '';
  const p   = parseJSONSafe(raw);
  if (!p) throw new Error('Réponse IA invalide pour ' + region);

  p.region = region;
  p.label  = info.label;
  if (!p.summary) p.summary = fb.summary;
  if (!Array.isArray(p.stocks) || p.stocks.length === 0) {
    p.stocks  = fb.stocks;
    p.summary = fb.summary;
  }
  p.stocks = p.stocks.slice(0,6).map(sanitizeStock);
  return p;
}

window.SS_API = { analyzeStock, fetchRegionData };
