'use strict';

// ── CONFIG PROVIDERS ────────────────────────────────────────────────
const PROVIDERS = {
  claude: {
    name: 'Claude (Anthropic)',
    url: 'https://api.anthropic.com/v1/messages',
    model: 'claude-sonnet-4-6',
    keyPrefix: 'sk-ant',
    isFree: false,
    badge: 'Payant',
    // Mesuré : le préflight CORS d'Anthropic ne renvoie aucun
    // Access-Control-Allow-Origin, même avec les en-têtes de cette app.
    // Un site statique ne peut donc pas l'appeler — il faut un relais serveur.
    browserOk: false,
    note: 'Appel direct refusé par le navigateur (CORS) — nécessite un relais.',
    buildRequest: (apiKey, sys, msg) => ({
      url: 'https://api.anthropic.com/v1/messages',
      opts: {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true'
        },
        body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 2000, system: sys, messages: [{ role:'user', content:msg }] })
      },
      parseResponse: (d) => (d.content||[]).find(b=>b.type==='text')?.text || ''
    })
  },
  mistral: {
    name: 'Mistral AI',
    url: 'https://api.mistral.ai/v1/chat/completions',
    model: 'mistral-small-latest',
    keyPrefix: '',
    isFree: false,
    badge: 'Gratuit 1 mois',
    browserOk: true,
    buildRequest: (apiKey, sys, msg) => ({
      url: 'https://api.mistral.ai/v1/chat/completions',
      opts: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
        body: JSON.stringify({
          model: 'mistral-small-latest',
          max_tokens: 2000,
          messages: [{ role:'system', content:sys }, { role:'user', content:msg }]
        })
      },
      parseResponse: (d) => d.choices?.[0]?.message?.content || ''
    })
  },
  deepseek: {
    name: 'DeepSeek',
    url: 'https://api.deepseek.com/v1/chat/completions',
    model: 'deepseek-chat',
    keyPrefix: 'sk-',
    isFree: false,
    badge: 'Très économique',
    browserOk: true,
    buildRequest: (apiKey, sys, msg) => ({
      url: 'https://api.deepseek.com/v1/chat/completions',
      opts: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
        body: JSON.stringify({
          model: 'deepseek-chat',
          max_tokens: 2000,
          messages: [{ role:'system', content:sys }, { role:'user', content:msg }]
        })
      },
      parseResponse: (d) => d.choices?.[0]?.message?.content || ''
    })
  },
  openrouter: {
    name: 'OpenRouter',
    url: 'https://openrouter.ai/api/v1/chat/completions',
    model: 'mistralai/mistral-7b-instruct:free',
    keyPrefix: 'sk-or',
    isFree: true,
    badge: '100% Gratuit',
    browserOk: true,
    buildRequest: (apiKey, sys, msg) => ({
      url: 'https://openrouter.ai/api/v1/chat/completions',
      opts: {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + apiKey,
          'HTTP-Referer': window.location.href,
          'X-Title': 'StockSense AI'
        },
        body: JSON.stringify({
          model: 'mistralai/mistral-7b-instruct:free',
          max_tokens: 2000,
          messages: [{ role:'system', content:sys }, { role:'user', content:msg }]
        })
      },
      parseResponse: (d) => d.choices?.[0]?.message?.content || ''
    })
  }
};

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

// ── APPEL API GÉNÉRIQUE ──────────────────────────────────────────────
async function callProvider(providerId, apiKey, sys, msg) {
  const prov = PROVIDERS[providerId];
  if (!prov) throw new Error('Provider inconnu : ' + providerId);

  const { url, opts, parseResponse } = prov.buildRequest(apiKey, sys, msg);

  const resp = await fetch(url, opts);
  if (!resp.ok) {
    const eb = await resp.json().catch(() => ({}));
    const errMsg = eb?.error?.message || eb?.message || '';
    throw new Error('API ' + resp.status + (errMsg ? ' — ' + errMsg : ''));
  }
  const d = await resp.json();
  return parseResponse(d);
}

// ── SANITISATION ANALYSE ─────────────────────────────────────────────
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
    ticker: ss(d.ticker, ticker), name: ss(d.name, ticker),
    market: ss(d.market, market), price: ss(d.price, 'N/D'),
    decision: ss(d.decision, 'ATTENDRE'), decision_color: dc,
    confidence: Math.max(50, Math.min(95, sn(d.confidence, 65))),
    summary: ss(d.summary, 'Analyse disponible ci-dessous.'),
    scores: {
      technique:    Math.max(0, Math.min(100, sn((d.scores||{}).technique,    55))),
      fondamentaux: Math.max(0, Math.min(100, sn((d.scores||{}).fondamentaux, 55))),
      macro:        Math.max(0, Math.min(100, sn((d.scores||{}).macro,        55))),
      momentum:     Math.max(0, Math.min(100, sn((d.scores||{}).momentum,     55))),
      risque:       Math.max(0, Math.min(100, sn((d.scores||{}).risque,       55)))
    },
    technicals: techs, fundamentals: funds,
    catalysts:  (Array.isArray(d.catalysts)?d.catalysts:[]).slice(0,4).map(c=>ss(c)),
    risks:      (Array.isArray(d.risks)?d.risks:[]).slice(0,4).map(r=>ss(r)),
    price_history:  sanitizeHistory(d.price_history,  20, 80,  200),
    rsi_history:    sanitizeHistory(d.rsi_history,    20, 25,  78),
    volume_history: sanitizeHistory(d.volume_history, 20, 50,  500),
    full_analysis:  ss(d.full_analysis, 'Analyse pour ' + ticker),
    fetchedAt: Date.now()
  };
}

function sanitizeStock(s, i) {
  const sig = ['b','s','h'].includes(ss(s&&s.signal).toLowerCase()) ? ss(s.signal).toLowerCase() : 'h';
  const cd  = ['up','dn','fl'].includes(ss(s&&s.change_dir).toLowerCase()) ? ss(s.change_dir).toLowerCase() : 'fl';
  return {
    rank: i+1, ticker: ss(s&&s.ticker,'—'), name: ss(s&&s.name,'—'),
    price: ss(s&&s.price,'N/D'), change: ss(s&&s.change,'—'), change_dir: cd,
    sector: ss(s&&s.sector,'—'), per: ss(s&&s.per,'N/D'), dividend: ss(s&&s.dividend,'N/D'),
    signal: sig, signal_label: ss(s&&s.signal_label, sig==='b'?'ACHETER':sig==='s'?'VENDRE':'CONSERVER'),
    why: ss(s&&s.why,'')
  };
}

/* ── VERDICT : calcul et cohérence ─────────────────────────────────────
 * Deux protections contre l'ancrage du modèle.
 *
 * 1. Le gabarit envoyé au prompt ne contient plus AUCUNE valeur évaluative.
 *    Il était auparavant entièrement haussier (decision ACHETER, 4 signaux buy
 *    sur 6, 5 qualités good sur 6) : sans données de marché réelles, le modèle
 *    recopiait le gabarit au lieu d'analyser, d'où un verdict « ACHETER »
 *    quasi systématique quel que soit le titre.
 * 2. Le verdict final est recalculé à partir des cinq scores que le modèle
 *    produit lui-même. Un verdict qui contredit ses propres scores est remplacé
 *    et signalé, au lieu d'être affiché tel quel.
 */
const POIDS_SCORES = { technique: 0.25, fondamentaux: 0.25, momentum: 0.20, risque: 0.15, macro: 0.15 };
const SEUIL_ACHAT  = 65;
const SEUIL_VENTE  = 40;

function scoreComposite(scores) {
  let total = 0, poids = 0;
  for (const k of Object.keys(POIDS_SCORES)) {
    const v = scores ? scores[k] : null;
    if (typeof v === 'number' && !isNaN(v)) { total += v * POIDS_SCORES[k]; poids += POIDS_SCORES[k]; }
  }
  return poids ? total / poids : null;
}

function decisionDepuisScore(composite) {
  if (composite === null) return null;
  if (composite >= SEUIL_ACHAT) return { decision: 'ACHETER',  decision_color: 'buy'  };
  if (composite <= SEUIL_VENTE) return { decision: 'VENDRE',   decision_color: 'sell' };
  return { decision: 'ATTENDRE', decision_color: 'wait' };
}

const GABARIT_ANALYSE = '{"ticker":"<TICKER>","name":"<nom de la societe>","market":"<marche>","price":"<prix>",'
  + '"decision":"<ACHETER|VENDRE|ATTENDRE>","decision_color":"<buy|sell|wait>","confidence":<50 a 95>,'
  + '"summary":"<une phrase de synthese>",'
  + '"scores":{"technique":<0 a 100>,"fondamentaux":<0 a 100>,"macro":<0 a 100>,"momentum":<0 a 100>,"risque":<0 a 100>},'
  + '"technicals":[<exactement 6 objets de la forme {"name":"MM200","value":"<valeur>","signal":"<buy|sell|neutral>","label":"<libelle>"}>],'
  + '"fundamentals":[<exactement 6 objets de la forme {"key":"PER","value":"<valeur>","quality":"<good|bad|neutral|plain>"}>],'
  + '"catalysts":[<0 a 4 phrases>],"risks":[<0 a 4 phrases>],'
  + '"price_history":[<20 nombres>],"rsi_history":[<20 nombres>],"volume_history":[<20 nombres>],'
  + '"full_analysis":"<150 a 200 mots, **mots cles** en gras>"}';

const REGLES_ANALYSE = [
  'Tu es StockSense AI, analyste boursier.',
  'FORME : reponds UNIQUEMENT par un objet JSON valide, sans markdown ni backticks. Commence par { et termine par }.',
  'FOND : le gabarit ne montre que la STRUCTURE. Tout ce qui est entre < > est un jeton a remplacer : ne recopie jamais un jeton tel quel.',
  'OBJECTIVITE : la decision doit decouler des cinq scores que tu produis. Si technique, fondamentaux et momentum sont majoritairement faibles, la decision est VENDRE ou ATTENDRE, jamais ACHETER.',
  'DIVERSITE : une action survaluee, endettee ou en tendance baissiere donne VENDRE ou ATTENDRE. Le verdict ACHETER doit rester l exception, pas la regle.',
  'ESPRIT CRITIQUE : cite au moins 2 risques concrets et retiens au moins un signal sell si la valeur en presente un.'
].join(' ');

// ── ANALYSE D'UNE ACTION ────────────────────────────────────────────
async function analyzeStock(providerId, apiKey, ticker, market, intent) {
  const imap = { buy:"L'utilisateur souhaite ACHETER.", sell:"L'utilisateur souhaite VENDRE.", watch:"L'utilisateur surveille." };
  const prov = PROVIDERS[providerId] || PROVIDERS.claude;


  const sys = REGLES_ANALYSE;
  const msg = 'Analyse l\'action ' + ticker + ' sur ' + (market === 'AUTO' ? 'le marche le plus pertinent pour ce ticker' : market)
    + '. ' + (imap[intent] || '')
    + '\nGabarit a remplir (structure seule, aucun jeton a recopier) : ' + GABARIT_ANALYSE
    + '\nRemplace chaque jeton < > par ta propre analyse de ' + ticker + '. '
    + 'signal: buy/sell/neutral. quality: good/bad/neutral/plain. '
    + 'Exactement 20 nombres par historique. full_analysis 150-200 mots avec **mots cles** en gras. JSON pur uniquement.';

  const raw = await callProvider(providerId, apiKey, sys, msg);
  const parsed = parseJSONSafe(raw);
  if (!parsed) throw new Error('Reponse IA invalide. Reessaie.');
  const result = sanitizeAnalysis(parsed, ticker, market);
  if (!result) throw new Error('Donnees IA incompletes. Reessaie.');

  // Cohérence : le verdict est recalcule a partir des scores. S'il contredit
  // ses propres scores, c'est le verdict calcule qui est retenu et l'ecart
  // est signale a l'utilisateur plutot que masque.
  const composite = scoreComposite(result.scores);
  result.score_global = composite === null ? null : Math.round(composite);
  const calcule = decisionDepuisScore(composite);
  if (calcule && calcule.decision_color !== result.decision_color) {
    result.decision_ia = result.decision;
    result.decision = calcule.decision;
    result.decision_color = calcule.decision_color;
    result.verdict_recalcule = true;
  } else {
    result.verdict_recalcule = false;
  }
  return result;
}

// ── DONNÉES MARCHÉ RÉGIONALES ────────────────────────────────────────
async function fetchRegionData(providerId, apiKey, region) {
  const { REGIONS, FALLBACK } = window.SS_DATA;
  const info = REGIONS[region];
  const fb   = FALLBACK[region];

  const devises = {brvm:'FCFA',tsx:'$CAD',usa:'$USD',europe:'EUR',asie:'devise locale (JPY/HKD/TWD/KRW)',emergents:'devise locale (INR/ZAR/BRL/MAD/KES)'};
  // Gabarit neutre. L'ancien prenait FALLBACK[region].stocks[0], dont le signal
  // vaut 'b' (ACHETER) dans les six regions : le modele recopiait ce signal et
  // les six listes sortaient integralement haussieres.
  const exStock = '{"ticker":"<TICKER>","name":"<nom>","price":"<prix>",'
    + '"change":"<+x% ou -x%>","change_dir":"<up|dn|fl>","sector":"<secteur>",'
    + '"per":"<valeur|N/D>","dividend":"<valeur|N/D>","signal":"<b|s|h>",'
    + '"signal_label":"<ACHETER|VENDRE|CONSERVER>","why":"<une phrase>"}';

  const sys = 'Tu es analyste boursier expert specialise sur ' + info.label + '. REGLE ABSOLUE: reponds UNIQUEMENT avec un objet JSON valide, sans markdown ni backticks. Commence par { et termine par }.';
  const msg = 'Genere un JSON listant les 6 meilleures actions de ' + info.label + ' en juillet 2026.\nContexte: ' + info.context + '\nIMPORTANT: Prix en ' + (devises[region]||'devise locale') + ' UNIQUEMENT. N\'utilise jamais FCFA ni tickers BRVM pour un marche non-BRVM.\nFormat JSON exact:\n{"region":"' + region + '","label":"' + info.label + '","summary":"1 phrase sur le contexte actuel","stocks":[' + exStock + ',...5 autres actions]}\nRegles: signal b=acheter s=vendre h=conserver, change_dir up/dn/fl, 6 actions exactement, JSON pur. '
    + 'DIVERSITE OBLIGATOIRE: les 6 actions ne doivent pas toutes porter le meme signal '
    + 'ni le meme sens de variation. Repartis-les selon la situation reelle de chacune, '
    + 'et n recopie aucun jeton < > du gabarit.';

  const raw = await callProvider(providerId, apiKey, sys, msg);
  const p = parseJSONSafe(raw);
  if (!p) throw new Error('Reponse IA invalide pour ' + region);

  p.region = region; p.label = info.label;
  if (!p.summary) p.summary = fb.summary;
  if (!Array.isArray(p.stocks) || p.stocks.length === 0) { p.stocks = fb.stocks; p.summary = fb.summary; }
  p.stocks = p.stocks.slice(0,6).map(sanitizeStock);
  return p;
}

// ── TEST D'UNE CLÉ ──────────────────────────────────────────────────
/* Valide une clé par une vraie mini-génération. Lister les modèles ne prouve
 * RIEN : certaines API répondent 200 avec une clé bidon. Renvoie { ok, message }
 * et ne jette jamais — l'appelant affiche le message tel quel. */
async function testKey(providerId, apiKey) {
  const prov = PROVIDERS[providerId];
  if (!prov) return { ok: false, message: 'Fournisseur inconnu : ' + providerId };
  if (!apiKey) return { ok: false, message: 'Aucune clé à tester pour ce fournisseur.' };
  try {
    const { url, opts, parseResponse } = prov.buildRequest(
      apiKey, 'Tu réponds en un seul mot.', 'Réponds exactement: OK');
    // Le test doit rester quasi gratuit : on abaisse la limite de sortie.
    const optsTest = { ...opts, body: JSON.stringify({ ...JSON.parse(opts.body), max_tokens: 16 }) };
    const resp = await fetch(url, optsTest);
    if (!resp.ok) {
      const eb = await resp.json().catch(() => ({}));
      const msg = (eb && eb.error && eb.error.message) || (eb && eb.message) || '';
      return { ok: false, message: 'HTTP ' + resp.status + (msg ? ' — ' + msg : '') };
    }
    const texte = String(parseResponse(await resp.json()) || '').trim();
    return texte
      ? { ok: true,  message: 'Clé valide — le modèle répond (' + prov.name + ').' }
      : { ok: false, message: 'Le modèle a renvoyé une réponse vide.' };
  } catch (e) {
    return { ok: false, message: String((e && e.message) || e) };
  }
}

window.SS_API = { PROVIDERS, analyzeStock, fetchRegionData, testKey, scoreComposite, decisionDepuisScore };
