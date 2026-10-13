'use strict';

// ── ÉTAT ─────────────────────────────────────────────────────────────
let STATE = {
  // Défaut : DeepSeek. Anthropic est le défaut historique, mais son API refuse
  // les appels depuis un navigateur (aucun en-tête CORS au préflight) — le
  // défaut envoyait donc l'utilisateur droit dans un mur.
  provider:     localStorage.getItem('ss_provider') || 'deepseek',
  apiKeys: {
    claude:     localStorage.getItem('ss_key_claude')     || '',
    mistral:    localStorage.getItem('ss_key_mistral')    || '',
    deepseek:   localStorage.getItem('ss_key_deepseek')   || '',
    openrouter: localStorage.getItem('ss_key_openrouter') || ''
  },
  theme:        localStorage.getItem('ss_theme') || 'light',
  intent:       'buy',
  currentData:  null,
  chartMode:    'price',
  activeRegion: 'brvm',
  marketCache:  {},
  history:      [],
  isAnalyzing:  false,
  isOnline:     navigator.onLine
};

// ── THÈME ─────────────────────────────────────────────────────────────
function applyTheme(t, instant) {
  STATE.theme = t;
  const root = document.documentElement;

  if (instant) {
    // Pas d'animation au 1er chargement
    root.classList.add('no-transition');
    root.setAttribute('data-theme', t);
    requestAnimationFrame(() => root.classList.remove('no-transition'));
  } else {
    root.setAttribute('data-theme', t);
  }

  const meta = document.getElementById('theme-color-meta');
  if (meta) meta.content = t === 'dark' ? '#080A0F' : '#F4F6FA';

  const btn = document.getElementById('theme-btn');
  if (btn) btn.textContent = t === 'dark' ? '🌙' : '☀️';

  const tog = document.getElementById('theme-toggle');
  if (tog) tog.classList.toggle('on', t === 'dark');

  localStorage.setItem('ss_theme', t);
}

function toggleTheme() {
  applyTheme(STATE.theme === 'dark' ? 'light' : 'dark', false);
}

// ── NAVIGATION ────────────────────────────────────────────────────────
const PAGES = ['analyze','markets','guide','history','settings'];

/* Marchés couverts — une seule liste, qui alimente à la fois le <select> de
 * l'onglet Analyser et la correspondance « région de la page Marchés » → valeur.
 * Avant, le HTML ne proposait que BRVM / TSX / AUTO alors que l'app couvre six
 * marchés (voir REGIONS dans markets.js) : impossible de lancer une analyse
 * ciblée sur les États-Unis, l'Europe, l'Asie ou les émergents, et les actions
 * de ces pages renvoyaient toutes sur « AUTO ». */
const MARCHES = [
  { value:'BRVM',      label:'🌍 BRVM',        region:'brvm' },
  { value:'TSX',       label:'🍁 TSX',         region:'tsx' },
  { value:'USA',       label:'🇺🇸 États-Unis', region:'usa' },
  { value:'Europe',    label:'🇪🇺 Europe',      region:'europe' },
  { value:'Asie',      label:'🌏 Asie',         region:'asie' },
  { value:'Émergents', label:'🌐 Émergents',    region:'emergents' },
  { value:'AUTO',      label:'🔍 Auto',         region:null }
];
const MARKET_OF_REGION = MARCHES.filter(m => m.region).reduce((o, m) => (o[m.region] = m.value, o), {});

function initMarketSelect() {
  const sel = document.getElementById('marketSelect');
  if (!sel) return;
  const courant = sel.value;
  sel.innerHTML = MARCHES
    .map(m => `<option value="${SS_UI.esc(m.value)}">${SS_UI.esc(m.label)}</option>`).join('');
  if (courant) sel.value = courant;
}

function showPage(name) {
  PAGES.forEach(p => {
    const el = document.getElementById('page-' + p);
    const bn = document.getElementById('bn-' + p);
    if (el) el.classList.toggle('active', p === name);
    if (bn) bn.classList.toggle('active', p === name);
  });
  window.scrollTo(0, 0);
  if (name === 'guide')   buildGuide();
  if (name === 'history') buildHistory();
  if (name === 'markets') initMarketsPage();
  if (name === 'settings') refreshSettingsUI();
}

// ── INTENT ────────────────────────────────────────────────────────────
function setIntent(v) {
  STATE.intent = v;
  ['buy','sell','watch'].forEach(i => {
    const btn = document.getElementById('ib-' + i);
    if (btn) btn.className = 'intent-btn' + (i === v ? ' active-' + i : '');
  });
}

function quickPick(ticker, market) {
  document.getElementById('tickerInput').value = ticker;
  document.getElementById('marketSelect').value = market;
  runAnalysis();
}

// ── PROVIDER ──────────────────────────────────────────────────────────
function selectProvider(pid) {
  STATE.provider = pid;
  localStorage.setItem('ss_provider', pid);
  // UI cartes
  document.querySelectorAll('.provider-card').forEach(el => {
    el.classList.toggle('selected', el.dataset.provider === pid);
  });
  // Champs API
  ['claude','mistral','deepseek','openrouter'].forEach(p => {
    const f = document.getElementById('field-' + p);
    if (f) f.classList.toggle('visible', p === pid);
  });
  refreshSettingsUI();
}

function refreshSettingsUI() {
  const pid = STATE.provider;
  const key = STATE.apiKeys[pid] || '';
  const inp = document.getElementById('key-' + pid);
  if (inp) inp.placeholder = key ? 'Clé configurée ✓' : inp.placeholder || '…';

  const statusEl = document.getElementById('api-key-status');
  if (statusEl) {
    if (key) {
      statusEl.textContent = '✓ Clé ' + pid + ' configurée';
      statusEl.style.color = 'var(--gr)';
    } else {
      statusEl.textContent = 'Aucune clé pour ' + pid;
      statusEl.style.color = 'var(--re)';
    }
  }

  const provLabel = document.getElementById('active-provider-label');
  if (provLabel && window.SS_API) {
    const prov = SS_API.PROVIDERS[pid];
    provLabel.textContent = prov ? prov.name + ' — ' + prov.model : pid;
  }
}

function saveApiKey() {
  const pid = STATE.provider;
  const inp = document.getElementById('key-' + pid);
  const val = (inp && inp.value || '').trim();
  if (!val) { SS_UI.showToast('⚠️ Entre une clé valide'); return; }
  STATE.apiKeys[pid] = val;
  localStorage.setItem('ss_key_' + pid, val);
  if (inp) inp.value = '';
  refreshSettingsUI();
  SS_UI.showToast('✓ Clé ' + pid + ' sauvegardée');
}

function clearApiKey() {
  const pid = STATE.provider;
  STATE.apiKeys[pid] = '';
  localStorage.removeItem('ss_key_' + pid);
  const inp = document.getElementById('key-' + pid);
  if (inp) { inp.value = ''; inp.placeholder = '…'; }
  refreshSettingsUI();
  SS_UI.showToast('Clé ' + pid + ' supprimée');
}

/* Valide la clé du fournisseur actif par une vraie mini-génération, et affiche
 * le résultat sous les boutons. Évite l'échec silencieux : sans ce test, on ne
 * découvre une clé invalide qu'au milieu d'une analyse. */
async function testerCle() {
  const pid  = STATE.provider;
  const cle  = STATE.apiKeys[pid] || '';
  const sortie = document.getElementById('api-key-test');
  const provName = (SS_API.PROVIDERS[pid] || {}).name || pid;

  if (!cle) {
    if (sortie) { sortie.textContent = '⚠️ Aucune clé enregistrée pour ' + provName + '.'; sortie.style.color = 'var(--am)'; }
    return;
  }
  if (sortie) { sortie.textContent = '⏳ Test de la clé ' + provName + '…'; sortie.style.color = 'var(--mu)'; }

  const res = await SS_API.testKey(pid, cle);
  if (sortie) {
    sortie.textContent = (res.ok ? '✓ ' : '✗ ') + res.message;
    sortie.style.color = res.ok ? 'var(--gr)' : 'var(--re)';
  }
  SS_UI.showToast(res.ok ? '✓ ' + res.message : '✗ ' + res.message);
}

function getActiveKey() { return STATE.apiKeys[STATE.provider] || ''; }

// ── ANALYSE PRINCIPALE ────────────────────────────────────────────────
const STEPS = [
  '📡 Collecte des données marché…',
  '📊 Analyse technique (MM · RSI · Bollinger)…',
  '🏗 Évaluation des fondamentaux…',
  '📰 Scan actualité macro…',
  '🧠 Génération de la décision IA…'
];
let _stepTimer = null;

async function runAnalysis() {
  const ticker = (document.getElementById('tickerInput').value || '').trim().toUpperCase();
  const market = document.getElementById('marketSelect').value || 'BRVM';
  const pid    = STATE.provider;
  const apiKey = getActiveKey();

  if (!ticker) {
    SS_UI.showModal({ ico:'⚠️', title:'Ticker manquant', msg:'Entre un ticker valide (ex: SNTS, ENB, XBAL)', retry:false });
    return;
  }
  if (!apiKey) {
    const prov = SS_API.PROVIDERS[pid];
    SS_UI.showModal({
      ico:'🔑', title:'Clé API requise',
      msg:'Configure ta clé ' + (prov ? prov.name : pid) + ' dans les paramètres.',
      hint: pid === 'openrouter'
        ? '<b>OpenRouter est gratuit !</b><br>Va sur <b>openrouter.ai/keys</b> → crée un compte → génère une clé gratuite. Aucune CB requise.'
        : '<b>Où trouver la clé ?</b><br>' + (prov ? 'Visite le site de ' + prov.name + ' et crée un compte.' : ''),
      retry:false,
      extraBtn:{ label:'Aller aux paramètres', fn:() => showPage('settings') }
    });
    return;
  }
  if (!STATE.isOnline) {
    SS_UI.showModal({ ico:'📡', title:'Hors connexion', msg:'L\'analyse IA nécessite internet.', retry:false });
    return;
  }

  STATE.isAnalyzing = true;
  document.getElementById('empty-state').style.display   = 'none';
  document.getElementById('results-section').style.display = 'none';
  document.getElementById('loading-state').style.display  = 'block';
  document.getElementById('loading-ticker').textContent   = ticker;
  const provLbl = document.getElementById('loading-provider-label');
  if (provLbl) provLbl.textContent = 'Analyse via ' + (SS_API.PROVIDERS[pid]?.name || pid) + '…';
  document.getElementById('analyze-btn').disabled = true;

  // Animer étapes
  let step = 0;
  const stepsEl = document.getElementById('loading-steps');
  stepsEl.innerHTML = STEPS.map((s,i) => `<div class="ls" id="ls-${i}">${s}</div>`).join('');
  _stepTimer = setInterval(() => {
    const prev = document.getElementById('ls-' + (step - 1));
    const cur  = document.getElementById('ls-' + step);
    if (prev) prev.className = 'ls done';
    if (cur)  cur.className  = 'ls active';
    step++;
    if (step >= STEPS.length) clearInterval(_stepTimer);
  }, 700);

  try {
    const data = await SS_API.analyzeStock(pid, apiKey, ticker, market, STATE.intent);
    clearInterval(_stepTimer);
    STATE.currentData = data;
    await SS_DB.saveAnalysis(ticker, market, STATE.intent, data);
    addToHistory({ ticker, market, intent:STATE.intent, data, ts:new Date().toLocaleTimeString('fr-CA',{hour:'2-digit',minute:'2-digit'}) });
    renderResults(data);
    SS_UI.showToast('✓ Analyse complétée');
  } catch(e) {
    clearInterval(_stepTimer);
    document.getElementById('loading-state').style.display  = 'none';
    document.getElementById('empty-state').style.display    = 'block';
    SS_UI.handleError(e, ticker, runAnalysis);
  } finally {
    STATE.isAnalyzing = false;
    document.getElementById('analyze-btn').disabled = false;
  }
}

// ── RENDER RESULTS ────────────────────────────────────────────────────
function renderResults(data) {
  document.getElementById('loading-state').style.display   = 'none';
  document.getElementById('results-section').style.display = 'block';
  const r = document.getElementById('results-section');
  r.innerHTML =
    SS_UI.renderVerdict(data) +
    SS_UI.renderScores(data.scores) +
    SS_UI.renderChart() +
    `<div class="section-tabs">
      <button class="stab active" onclick="swTab('tech',this)">📊 Technique</button>
      <button class="stab" onclick="swTab('fund',this)">🏗 Fondamentaux</button>
    </div>
    <div id="tab-tech">${SS_UI.renderTechnicals(data.technicals)}</div>
    <div id="tab-fund" style="display:none">${SS_UI.renderFundamentals(data.fundamentals)}</div>` +
    SS_UI.renderCatalystsRisks(data.catalysts, data.risks) +
    SS_UI.renderFullAnalysis(data.full_analysis) +
    `<div class="decision-banner ${data.decision_color}">
      <div class="db-left">
        <div class="db-title">Décision : ${SS_UI.esc(data.decision)}</div>
        <div class="db-sub">${{buy:"Conditions favorables à l'achat",sell:"Signaux de vente identifiés",wait:"Attendre un meilleur point d'entrée"}[data.decision_color]||''}</div>
      </div>
      <button class="db-btn ${data.decision_color}" onclick="resetAnalysis()">Nouvelle</button>
    </div>
    <div style="height:24px"></div>`;
  requestAnimationFrame(() => SS_UI.drawChart(data, STATE.chartMode));
  r.scrollIntoView({ behavior:'smooth', block:'start' });
}

function swTab(tab, btn) {
  document.querySelectorAll('.stab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('tab-tech').style.display = tab === 'tech' ? 'block' : 'none';
  document.getElementById('tab-fund').style.display = tab === 'fund' ? 'block' : 'none';
}

function switchChart(mode, btn) {
  STATE.chartMode = mode;
  document.querySelectorAll('.ct').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  SS_UI.drawChart(STATE.currentData, mode);
}

function resetAnalysis() {
  STATE.currentData = null;
  document.getElementById('results-section').style.display = 'none';
  document.getElementById('empty-state').style.display     = 'block';
  document.getElementById('tickerInput').value = '';
  window.scrollTo({ top:0, behavior:'smooth' });
}

// ── MARCHÉS ───────────────────────────────────────────────────────────
let _mktInit = false;
function initMarketsPage() {
  if (!_mktInit) { _mktInit = true; loadRegion('brvm'); }
}

function selectRegion(region, el) {
  STATE.activeRegion = region;
  document.querySelectorAll('.rtab').forEach(t => t.classList.remove('active'));
  if (el) el.classList.add('active');
  loadRegion(region);
}

async function loadRegion(region, force = false) {
  const { FALLBACK } = window.SS_DATA;
  const st = SS_HOURS.getMarketStatus(region);

  if (!force && STATE.marketCache[region]) {
    renderMarkets(STATE.marketCache[region], region);
    return;
  }
  const maxAge = st && st.isOpen ? 15*60*1000 : 60*60*1000;
  const stale  = await SS_DB.isCacheStale(region, maxAge);
  if (!stale) {
    const cached = await SS_DB.getMarketCache(region);
    if (cached) {
      const d = { ...cached.data, fromCache:true, cacheAge:Date.now()-cached.fetchedAt };
      STATE.marketCache[region] = d;
      renderMarkets(d, region);
      return;
    }
  }

  if (st && !st.isOpen && !force) {
    const cached = await SS_DB.getMarketCache(region);
    if (cached) {
      const d = { ...cached.data, fromCache:true, staleCache:true, cacheAge:Date.now()-cached.fetchedAt };
      STATE.marketCache[region] = d;
      renderMarkets(d, region);
      showMarketClosedBanner(st, region);
      return;
    }
    showMarketClosedBanner(st, region);
  }

  const body = document.getElementById('mkt-body');
  const { REGIONS } = window.SS_DATA;
  if (body) body.innerHTML = `<div class="mkt-loading"><div class="mkt-spin"></div><div class="mkt-load-txt">Analyse IA ${SS_UI.esc(REGIONS[region]?.flag||'')} ${SS_UI.esc(REGIONS[region]?.label||'')}…</div></div>`;

  const pid    = STATE.provider;
  const apiKey = getActiveKey();

  if (!apiKey) {
    const fb = FALLBACK[region];
    const d  = { ...fb, fromFallback:true };
    STATE.marketCache[region] = d;
    renderMarkets(d, region);
    return;
  }

  try {
    const data = await SS_API.fetchRegionData(pid, apiKey, region);
    await SS_DB.saveMarketCache(region, data, st && st.isOpen);
    STATE.marketCache[region] = data;
    renderMarkets(data, region);
    const ts = document.getElementById('mkt-ts');
    if (ts) ts.textContent = 'Mis à jour ' + new Date().toLocaleTimeString('fr-CA',{hour:'2-digit',minute:'2-digit'});
    SS_UI.showToast('✓ Marchés actualisés');
  } catch(e) {
    const fb = FALLBACK[region];
    const d  = { ...fb, fromFallback:true };
    STATE.marketCache[region] = d;
    renderMarkets(d, region);
    if (body) {
      const eb = document.createElement('div');
      eb.className = 'error-banner';
      eb.innerHTML = `⚠️ ${SS_UI.esc(e.message||'Erreur')} — Données estimatives. <button onclick="SS_APP.loadRegion('${region}',true)">Réessayer</button>`;
      body.insertBefore(eb, body.firstChild);
    }
  }
}

function showMarketClosedBanner(st, region) {
  SS_UI.showModal({
    ico:'🔒', title:'Marché fermé',
    msg: st.name + ' est fermé (' + (!st.isDay ? 'week-end' : 'hors horaires') + ').',
    hint: `<b>Heure locale :</b> ${SS_UI.esc(st.localDayName)} ${st.localTime}<br>
           <b>Horaires :</b> ${st.openTime} – ${st.closeTime}<br>
           <b>Prochaine ouverture :</b> ${SS_UI.esc(st.nextOpen)}<br><br>
           <span style="color:var(--am)">${SS_UI.esc(st.note)}</span>`,
    retry:false,
    extraBtn:{ label:'Afficher quand même', fn:() => loadRegion(region, true) }
  });
}

function showMarketInfo(region) {
  const st = SS_HOURS.getMarketStatus(region);
  if (!st) return;
  const info = (window.SS_DATA.REGIONS[region] || {});
  SS_UI.showModal({
    ico: st.isOpen ? '🟢' : '🔴',
    title: (info.flag||'') + ' ' + st.name,
    msg: st.isOpen ? `Ouvert — Ferme à ${st.closeTime}` : `Fermé — Ouvre ${st.nextOpen}`,
    hint: `<b>Heure locale :</b> ${SS_UI.esc(st.localDayName)} ${st.localTime}<br>
           <b>Horaires :</b> ${st.openTime} – ${st.closeTime}<br>
           <b>Fuseau :</b> ${SS_UI.esc(st.note)}`,
    retry:false
  });
}

function refreshMarket() {
  delete STATE.marketCache[STATE.activeRegion];
  loadRegion(STATE.activeRegion, true);
}

function renderMarkets(data, region) {
  const body = document.getElementById('mkt-body');
  if (!body) return;
  const stocks = Array.isArray(data.stocks) ? data.stocks : [];
  const { REGIONS } = window.SS_DATA;
  const st = SS_HOURS.getMarketStatus(region);
  // Un seul endroit qui fait correspondre une région de la page Marchés à la
  // valeur du sélecteur de l'onglet Analyser. Avant, seuls brvm et tsx étaient
  // mappés : les quatre autres régions retombaient toutes sur 'AUTO'.
  const mktKey = MARKET_OF_REGION[region] || 'AUTO';

  const bc = stocks.filter(s=>s.signal==='b').length;
  const hc = stocks.filter(s=>s.signal==='h').length;
  const sc = stocks.filter(s=>s.signal==='s').length;

  let html = '';
  html += SS_UI.renderStatusBadge(st, region);
  if (data.summary) {
    const cacheNote = data.fromFallback ? '<br><span style="color:var(--di);font-size:10px">⚠️ Données estimatives — clé API requise pour l\'analyse IA</span>'
      : data.staleCache ? '<br><span style="color:var(--di);font-size:10px">⚠️ Cache périmé</span>'
      : data.fromCache ? '<br><span style="color:var(--di);font-size:10px">📦 Cache local</span>' : '';
    html += `<div class="reg-summary"><b>${SS_UI.esc(data.label||REGIONS[region]?.label||'')}</b> — ${SS_UI.esc(data.summary)}${cacheNote}</div>`;
  }
  html += `<div class="mkt-counters">
    ${mkC(bc,'var(--gr)','ACHETER')}${mkC(hc,'var(--am)','CONSERVER')}${mkC(sc,'var(--re)','VENDRE')}
  </div>`;
  stocks.forEach((s,i) => { html += SS_UI.renderStockCard(s, i, `SS_APP._onStock_${region}`); });
  html += `<div class="mkt-hint">Appuie sur une action pour lancer l'analyse complète →</div>`;
  body.innerHTML = html;
  window[`SS_APP._onStock_${region}`] = (ticker) => analyzeFromMarket(ticker, mktKey);
}

function mkC(n, col, lbl) {
  return `<div class="mkt-counter" style="border-color:${col}44;background:${col}0A">
    <div style="font-size:20px;font-weight:800;color:${col}">${n}</div>
    <div style="font-size:9px;color:${col};font-weight:700;letter-spacing:.5px">${lbl}</div>
  </div>`;
}

function analyzeFromMarket(ticker, market) {
  document.getElementById('tickerInput').value  = ticker;
  document.getElementById('marketSelect').value = market;
  showPage('analyze');
  SS_UI.showToast(`Analyse de ${ticker}…`);
  setTimeout(runAnalysis, 300);
}

// ── GUIDE ─────────────────────────────────────────────────────────────
const GUIDE_ITEMS = [
  { ico:'RSI', col:'#3B6FE0', title:'RSI — Relative Strength Index',
    body:`Mesure la "fatigue" du prix sur 0-100.\n\n<b style="color:var(--re)">RSI > 70</b> → Surachat — correction probable\n<b style="color:var(--am)">RSI 30-70</b> → Zone neutre — tendance normale\n<b style="color:var(--gr)">RSI < 30</b> → Survente — rebond possible\n\n⚠️ Un RSI > 70 ne signifie pas vendre immédiatement — une action peut rester en surachat longtemps dans une tendance forte.` },
  { ico:'MM',  col:'#00A86B', title:'Moyennes Mobiles (MM20 · MM200)',
    body:`Lissent les prix pour révéler la tendance de fond.\n\n<b style="color:var(--gr)">Prix au-dessus MM200</b> → Tendance haussière ✓\n<b style="color:var(--re)">Prix en dessous MM200</b> → Zone de danger ⚠️\n\n<b style="color:var(--gr)">Golden Cross</b> → MM50 croise MM200 vers le haut = signal achat fort\n<b style="color:var(--re)">Death Cross</b> → MM50 croise MM200 vers le bas = signal de sortie` },
  { ico:'PER', col:'#D4860A', title:'PER — Price Earning Ratio',
    body:`PER = Prix ÷ Bénéfice par action\n\n<b style="color:var(--gr)">PER < 10</b> → Potentiellement sous-évalué\n<b style="color:var(--am)">PER 10-20</b> → Zone raisonnable\n<b style="color:var(--re)">PER > 30</b> → Spéculatif\n\nSur la BRVM, les PER < 10 sont fréquents (BOA BF: 9.1, SONATEL: 7-8) — marché structurellement moins cher.` },
  { ico:'DIV', col:'#00A86B', title:'Rendement Dividende',
    body:`Dividende annuel ÷ Prix × 100\n\n<b style="color:var(--gr)">> 5%</b> sur valeur solide → Excellent\n<b style="color:var(--am)">3-5%</b> → Correct\n<b style="color:var(--re)">> 12%</b> → Méfiance — possible coupe à venir\n\nExemples : BOA BF 9.2%, SONATEL 5.5%, Enbridge 6.3%` },
  { ico:'S/R', col:'#E8334A', title:'Support & Résistance',
    body:`<b style="color:var(--gr)">Support</b> → Niveau où le prix rebondit → Zone d'achat\n<b style="color:var(--re)">Résistance</b> → Plafond difficile à franchir → Zone de prudence\n\nQuand la résistance est franchie avec volume, elle devient le nouveau support — signal fort.` },
  { ico:'VOL', col:'#D4860A', title:'Volume — Le détecteur de vérité',
    body:`Prix monte + Volume fort → Signal FIABLE ✓\nPrix monte + Volume faible → Signal fragile ⚠️\nPrix baisse + Volume fort → Vente massive 🚨\nPrix baisse + Volume faible → Respiration normale\n\nSur la BRVM, volumes structurellement faibles → signaux moins fiables que sur TSX.` },
  { ico:'PSY', col:'#E8334A', title:'3 Biais cognitifs à éviter',
    body:`<b style="color:var(--re)">1. Biais de confirmation</b>\nTu cherches les infos qui confirment ta position. Solution : cherche activement les arguments CONTRE.\n\n<b style="color:var(--am)">2. Aversion aux pertes</b>\nUne perte fait 2× plus mal qu'un gain. Solution : fixe un stop-loss AVANT d'acheter.\n\n<b style="color:var(--bl)">3. Biais de récence</b>\nTu crois que la tendance récente durera. Solution : regarde les données sur 5-10 ans.` }
];

let _guideBuilt = false;
function buildGuide() {
  if (_guideBuilt) return;
  _guideBuilt = true;
  const el = document.getElementById('guide-content');
  if (!el) return;
  el.innerHTML = GUIDE_ITEMS.map((it,i) => `
    <div class="guide-card">
      <div class="guide-header" onclick="toggleGuide(${i})">
        <div class="guide-icon" style="background:${it.col}15;border-color:${it.col}33;color:${it.col}">${it.ico}</div>
        <div class="guide-title">${SS_UI.esc(it.title)}</div>
        <div class="guide-chevron" id="gc-${i}">+</div>
      </div>
      <div class="guide-body" id="gb-${i}">${it.body.replace(/\n/g,'<br>')}</div>
    </div>`).join('');
}

function toggleGuide(i) {
  const b = document.getElementById('gb-'+i), c = document.getElementById('gc-'+i);
  if (!b) return;
  const open = b.classList.toggle('show');
  if (c) c.textContent = open ? '−' : '+';
}

// ── HISTORIQUE ────────────────────────────────────────────────────────
function addToHistory(item) {
  STATE.history.unshift(item);
  if (STATE.history.length > 20) STATE.history.pop();
}

function buildHistory() {
  const el = document.getElementById('history-content');
  if (!el) return;
  if (!STATE.history.length) {
    el.innerHTML = `<div class="empty-state"><div class="empty-icon">📋</div><div class="empty-title">Aucune analyse</div><div class="empty-text">Lance ta première analyse depuis l'onglet Analyser</div></div>`;
    return;
  }
  const COLS = { buy:'var(--gr)', sell:'var(--re)', wait:'var(--am)' };
  el.innerHTML = STATE.history.map((h,i) => {
    const col = COLS[h.data?.decision_color] || 'var(--am)';
    return `<div class="hist-card" onclick="loadFromHistory(${i})">
      <div class="hist-top">
        <div style="display:flex;align-items:center;gap:8px">
          <span style="font-family:monospace;font-size:15px;font-weight:700;letter-spacing:1px;color:var(--tx)">${SS_UI.esc(h.data?.ticker||h.ticker)}</span>
          <span style="font-size:9px;color:var(--mu)">${SS_UI.esc(h.data?.market||h.market)}</span>
        </div>
        <div style="text-align:right">
          <div style="font-size:12px;font-weight:800;color:${col}">${SS_UI.esc(h.data?.decision||'—')}</div>
          <div style="font-size:9px;color:var(--di);margin-top:2px">${h.ts}</div>
        </div>
      </div>
      <div style="font-size:11px;color:var(--mu);line-height:1.5;margin-top:5px">${SS_UI.esc((h.data?.summary||'').substring(0,90))}…</div>
    </div>`;
  }).join('');
}

function loadFromHistory(i) {
  const h = STATE.history[i];
  if (!h) return;
  STATE.currentData = h.data;
  document.getElementById('tickerInput').value = h.ticker;
  showPage('analyze');
  renderResults(h.data);
}

/* Recharge l'historique depuis IndexedDB. Les analyses étaient bien écrites en
 * base (`saveAnalysis`) mais jamais relues : après un rechargement de page,
 * l'onglet Historique apparaissait vide alors que les données existaient. */
async function chargerHistorique() {
  try {
    const lignes = await SS_DB.getAnalyses(20);
    if (!Array.isArray(lignes) || !lignes.length) return;
    STATE.history = lignes.map(r => ({
      ticker: (r.data && r.data.ticker) || r.ticker,
      market: (r.data && r.data.market) || r.market,
      intent: r.intent,
      data:   r.data,
      ts:     new Date(r.createdAt || Date.now())
                .toLocaleTimeString('fr-CA', { hour:'2-digit', minute:'2-digit' })
    }));
    buildHistory();
  } catch (e) {
    // Base indisponible (navigation privée, quota atteint) : l'onglet reste
    // vide, mais l'application n'est pas cassée pour autant.
  }
}

async function clearHistory() {
  if (!confirm('Supprimer les analyses de plus de 30 jours ?')) return;
  await SS_DB.clearOldAnalyses(30);
  await chargerHistorique();
  buildHistory();
  SS_UI.showToast('✓ Historique nettoyé');
}

// ── CONNECTIVITÉ ──────────────────────────────────────────────────────
window.addEventListener('online',  () => { STATE.isOnline = true;  SS_UI.showToast('✓ Connexion rétablie'); updateOnlineBadge(); });
window.addEventListener('offline', () => { STATE.isOnline = false; SS_UI.showToast('⚠️ Hors connexion'); updateOnlineBadge(); });
function updateOnlineBadge() {
  document.querySelectorAll('.offline-badge').forEach(el => { el.style.display = STATE.isOnline ? 'none' : 'flex'; });
}

// ── INIT ──────────────────────────────────────────────────────────────
async function init() {
  // Service Worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(e => console.warn('SW:', e));
  }

  // Sélecteur de marché : alimenté par la liste MARCHES (six marchés + Auto)
  initMarketSelect();

  // Thème — instant pour éviter le flash
  applyTheme(STATE.theme, true);

  // Provider
  selectProvider(STATE.provider);

  // Charger clés dans les champs
  ['claude','mistral','deepseek','openrouter'].forEach(pid => {
    const key = STATE.apiKeys[pid];
    const inp = document.getElementById('key-' + pid);
    if (inp && key) inp.placeholder = 'Clé configurée ✓';
  });

  // Connectivité
  updateOnlineBadge();

  // Clavier
  const tk = document.getElementById('tickerInput');
  if (tk) tk.addEventListener('keydown', e => { if (e.key === 'Enter') { e.target.blur(); runAnalysis(); } });

  // Bandeau d'en-tête : statut réel des deux marchés de référence.
  // Remplace des pourcentages inventés (+37.4 % / +12.1 %) qui étaient animés
  // en boucle et présentés comme des indices de marché. Une app de finance ne
  // doit pas afficher un chiffre fabriqué à la place d'une donnée de marché.
  const majStatutMarches = () => {
    [['brvm','bmv'], ['tsx','tmv']].forEach(([region, id]) => {
      const el = document.getElementById(id);
      if (!el) return;
      const st = SS_HOURS.getMarketStatus(region);
      const ouvert = !!(st && st.isOpen);
      el.textContent = ouvert ? 'Ouvert' : 'Fermé';
      el.style.color = ouvert ? 'var(--gr)' : 'var(--re)';
    });
  };
  majStatutMarches();
  setInterval(majStatutMarches, 60000);

  // Redimensionnement
  window.addEventListener('resize', () => {
    if (STATE.currentData && document.getElementById('priceChart')) {
      SS_UI.drawChart(STATE.currentData, STATE.chartMode);
    }
  });

  // Historique persistant (IndexedDB)
  await chargerHistorique();
}

window.SS_APP = {
  showPage, toggleTheme, setIntent, quickPick, runAnalysis, resetAnalysis,
  swTab, switchChart, selectProvider, saveApiKey, clearApiKey, testerCle,
  selectRegion, refreshMarket, loadRegion, showMarketInfo,
  analyzeFromMarket, toggleGuide, loadFromHistory, clearHistory, init
};

document.addEventListener('DOMContentLoaded', init);
