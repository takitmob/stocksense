'use strict';

// ── ÉTAT ─────────────────────────────────────────────────────────────
let STATE = {
  apiKey:        localStorage.getItem('ss_api_key') || '',
  intent:        'buy',
  currentData:   null,
  chartMode:     'price',
  activeRegion:  'brvm',
  marketCache:   {},
  history:       [],
  isAnalyzing:   false,
  isOnline:      navigator.onLine,
};

// ── NAVIGATION ────────────────────────────────────────────────────────
const PAGES = ['analyze','markets','guide','history','settings'];

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
}

// ── INTENT ────────────────────────────────────────────────────────────
function setIntent(v) {
  STATE.intent = v;
  ['buy','sell','watch'].forEach(i => {
    const btn = document.getElementById('ib-' + i);
    if (btn) btn.className = 'intent-btn' + (i === v ? ' active-' + i : '');
  });
}

// ── QUICK PICK ────────────────────────────────────────────────────────
function quickPick(ticker, market) {
  document.getElementById('tickerInput').value = ticker;
  document.getElementById('marketSelect').value = market;
  runAnalysis();
}

// ── ANALYSE PRINCIPALE ────────────────────────────────────────────────
let _stepTimer = null;
const STEPS = [
  '📡 Collecte des données marché…',
  '📊 Analyse technique (MM · RSI · Bollinger)…',
  '🏗 Évaluation des fondamentaux…',
  '📰 Scan actualité macro…',
  '🧠 Génération de la décision IA…'
];

async function runAnalysis() {
  const ticker = (document.getElementById('tickerInput').value || '').trim().toUpperCase();
  const market = document.getElementById('marketSelect').value || 'BRVM';

  if (!ticker) {
    SS_UI.showModal({ ico:'⚠️', title:'Ticker manquant', msg:'Entre un ticker valide (ex: SNTS, ENB, XBAL)', retry:false });
    return;
  }
  if (!STATE.apiKey) {
    SS_UI.showModal({ ico:'🔑', title:'Clé API requise', msg:'Configure ta clé Anthropic pour utiliser l\'analyse IA.', hint:'Va dans ⚙️ Paramètres → colle ta clé API Anthropic.', retry:false, extraBtn:{ label:'Aller aux paramètres', fn:() => showPage('settings') } });
    return;
  }
  if (!STATE.isOnline) {
    SS_UI.showModal({ ico:'📡', title:'Hors connexion', msg:'L\'analyse IA nécessite une connexion internet.', retry:false });
    return;
  }

  STATE.isAnalyzing = true;
  document.getElementById('empty-state').style.display   = 'none';
  document.getElementById('results-section').style.display = 'none';
  document.getElementById('loading-state').style.display  = 'block';
  document.getElementById('loading-ticker').textContent   = ticker;
  document.getElementById('analyze-btn').disabled = true;

  // Animer les étapes
  let step = 0;
  const stepsEl = document.getElementById('loading-steps');
  stepsEl.innerHTML = STEPS.map((s, i) => `<div class="ls" id="ls-${i}">${s}</div>`).join('');
  _stepTimer = setInterval(() => {
    const prev = document.getElementById('ls-' + (step - 1));
    const cur  = document.getElementById('ls-' + step);
    if (prev) prev.className = 'ls done';
    if (cur)  cur.className  = 'ls active';
    step++;
    if (step >= STEPS.length) clearInterval(_stepTimer);
  }, 650);

  try {
    const data = await SS_API.analyzeStock(STATE.apiKey, ticker, market, STATE.intent);
    clearInterval(_stepTimer);
    STATE.currentData = data;
    await SS_DB.saveAnalysis(ticker, market, STATE.intent, data);
    addToHistory({ ticker, market, intent: STATE.intent, data, ts: new Date().toLocaleTimeString('fr-CA', { hour:'2-digit', minute:'2-digit' }) });
    renderResults(data);
    SS_UI.showToast('✓ Analyse complétée');
  } catch (e) {
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
        <div class="db-sub">${{ buy:'Conditions favorables à l\'achat', sell:'Signaux de vente identifiés', wait:'Attendre un meilleur point d\'entrée' }[data.decision_color] || ''}</div>
      </div>
      <button class="db-btn ${data.decision_color}" onclick="resetAnalysis()">Nouvelle</button>
    </div>
    <div style="height:24px"></div>`;

  // Dessiner le graphique après rendu
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
let _mktInitDone = false;

function initMarketsPage() {
  if (!_mktInitDone) {
    _mktInitDone = true;
    loadRegion('brvm');
  }
}

function selectRegion(region, el) {
  STATE.activeRegion = region;
  document.querySelectorAll('.rtab').forEach(t => t.classList.remove('active'));
  if (el) el.classList.add('active');
  loadRegion(region);
}

async function loadRegion(region, force = false) {
  const { REGIONS, FALLBACK } = window.SS_DATA;
  const st = SS_HOURS.getMarketStatus(region);

  // Si pas de force et cache frais, utiliser le cache
  if (!force && STATE.marketCache[region]) {
    renderMarkets(STATE.marketCache[region], region);
    return;
  }

  // IndexedDB cache
  const maxAge = st && st.isOpen ? 15*60*1000 : 60*60*1000;
  const stale  = await SS_DB.isCacheStale(region, maxAge);
  if (!stale) {
    const cached = await SS_DB.getMarketCache(region);
    if (cached) {
      const d = { ...cached.data, fromCache:true, cacheAge: Date.now() - cached.fetchedAt };
      STATE.marketCache[region] = d;
      renderMarkets(d, region);
      return;
    }
  }

  // Vérifier si marché fermé AVANT l'appel API
  if (st && !st.isOpen && !force) {
    // Essayer le cache stale d'abord
    const cached = await SS_DB.getMarketCache(region);
    if (cached) {
      const d = { ...cached.data, fromCache:true, staleCache:true, cacheAge: Date.now() - cached.fetchedAt };
      STATE.marketCache[region] = d;
      renderMarkets(d, region);
      showMarketClosedBanner(st, region);
      return;
    }
    // Pas de cache — charger quand même les données (avec fallback)
    showMarketClosedBanner(st, region);
  }

  // Appel API
  const body = document.getElementById('mkt-body');
  if (body) body.innerHTML = `<div class="mkt-loading"><div class="mkt-spin"></div><div class="mkt-load-txt">Analyse IA ${SS_UI.esc(REGIONS[region]?.flag||'')} ${SS_UI.esc(REGIONS[region]?.label||'')}…</div></div>`;

  if (!STATE.apiKey) {
    const fb = FALLBACK[region];
    const d  = { ...fb, fromFallback:true };
    STATE.marketCache[region] = d;
    renderMarkets(d, region);
    return;
  }

  try {
    const data = await SS_API.fetchRegionData(STATE.apiKey, region);
    await SS_DB.saveMarketCache(region, data, st && st.isOpen);
    STATE.marketCache[region] = data;
    renderMarkets(data, region);
    SS_UI.showToast('✓ Marchés actualisés');
  } catch (e) {
    // Fallback statique en cas d'erreur
    const fb = FALLBACK[region];
    const d  = { ...fb, fromFallback:true };
    STATE.marketCache[region] = d;
    renderMarkets(d, region);
    if (body) {
      const errBanner = document.createElement('div');
      errBanner.className = 'error-banner';
      errBanner.innerHTML = `⚠️ ${SS_UI.esc(e.message || 'Erreur')} — Données estimatives affichées. <button onclick="loadRegion('${region}',true)">Réessayer</button>`;
      body.insertBefore(errBanner, body.firstChild);
    }
  }
}

function showMarketClosedBanner(st, region) {
  SS_UI.showModal({
    ico:   '🔒',
    title: `Marché fermé`,
    msg:   `${st.name} est actuellement fermé (${!st.isDay ? 'week-end' : 'hors horaires'}).`,
    hint:  `<b>Heure locale :</b> ${SS_UI.esc(st.localDayName)} ${st.localTime}<br>
            <b>Horaires :</b> ${st.openTime} – ${st.closeTime}<br>
            <b>Prochaine ouverture :</b> ${SS_UI.esc(st.nextOpen)}<br><br>
            <span style="color:#FFB340">${SS_UI.esc(st.note)}</span><br><br>
            <span style="color:#3A4158;font-size:11px">Données de la dernière séance affichées.</span>`,
    retry: false,
    extraBtn: { label:'Afficher quand même', fn: () => loadRegion(region, true) }
  });
}

function showMarketInfo(region) {
  const st = SS_HOURS.getMarketStatus(region);
  if (!st) return;
  const info = (window.SS_DATA.REGIONS[region] || {});
  SS_UI.showModal({
    ico:   st.isOpen ? '🟢' : '🔴',
    title: `${info.flag||''} ${st.name}`,
    msg:   st.isOpen ? `Marché ouvert — Ferme à ${st.closeTime}` : `Marché fermé — Ouvre ${st.nextOpen}`,
    hint:  `<b>Heure locale actuelle :</b> ${SS_UI.esc(st.localDayName)} ${st.localTime}<br>
            <b>Horaires d'ouverture :</b> ${st.openTime} – ${st.closeTime}<br>
            ${!st.isOpen ? `<b>Prochaine ouverture :</b> ${SS_UI.esc(st.nextOpen)}<br>` : ''}
            <b>Fuseau horaire :</b> ${SS_UI.esc(st.note)}`,
    retry: false
  });
}

function renderMarkets(data, region) {
  const body = document.getElementById('mkt-body');
  if (!body) return;
  const stocks = Array.isArray(data.stocks) ? data.stocks : [];
  const { REGIONS } = window.SS_DATA;
  const st   = SS_HOURS.getMarketStatus(region);
  const info = REGIONS[region] || {};

  const bc = stocks.filter(s => s.signal === 'b').length;
  const hc = stocks.filter(s => s.signal === 'h').length;
  const sc = stocks.filter(s => s.signal === 's').length;

  const mktKey = { brvm:'BRVM', tsx:'TSX' }[region] || 'AUTO';

  let html = '';
  html += SS_UI.renderStatusBadge(st, region);

  if (data.summary) {
    html += `<div class="reg-summary">
      <b>${SS_UI.esc(data.label || info.label || '')}</b> — ${SS_UI.esc(data.summary)}
      ${(data.fromFallback || data.fromCache || data.staleCache) ? `<br><span style="color:#3A4158;font-size:10px">${data.fromFallback ? '⚠️ Données estimatives' : data.staleCache ? '⚠️ Cache périmé' : '📦 Cache'}</span>` : ''}
    </div>`;
  }

  html += `<div class="mkt-counters">
    ${mkCounter(bc,'#00D68F','ACHETER')}
    ${mkCounter(hc,'#FFB340','CONSERVER')}
    ${mkCounter(sc,'#FF4D6A','VENDRE')}
  </div>`;

  html += stocks.map((s, i) => SS_UI.renderStockCard(s, i, `SS_APP.analyzeFromMarket_${region}`)).join('');
  html += `<div class="mkt-hint">Appuie sur une action pour lancer l'analyse complète →</div>`;

  body.innerHTML = html;

  // Créer les fonctions de callback par région
  window[`SS_APP.analyzeFromMarket_${region}`] = (ticker) => analyzeFromMarket(ticker, mktKey);
}

function mkCounter(n, col, lbl) {
  return `<div class="mkt-counter" style="border-color:${col}44;background:${col}0A">
    <div style="font-size:20px;font-weight:800;color:${col}">${n}</div>
    <div style="font-size:9px;color:${col};font-weight:700;letter-spacing:.5px">${lbl}</div>
  </div>`;
}

function analyzeFromMarket(ticker, market) {
  document.getElementById('tickerInput').value = ticker;
  document.getElementById('marketSelect').value = market;
  showPage('analyze');
  SS_UI.showToast(`Analyse de ${ticker}…`);
  setTimeout(runAnalysis, 300);
}

function refreshMarket() {
  delete STATE.marketCache[STATE.activeRegion];
  loadRegion(STATE.activeRegion, true);
}

// ── GUIDE ─────────────────────────────────────────────────────────────
const GUIDE_ITEMS = [
  { ico:'RSI',  col:'#5B8CFF', title:'RSI — Relative Strength Index',
    body:`Mesure la "fatigue" du prix sur 0-100.\n\n<b style="color:#FF4D6A">RSI > 70</b> → Surachat — correction probable\n<b style="color:#FFB340">RSI 30-70</b> → Zone neutre — tendance normale\n<b style="color:#00D68F">RSI < 30</b> → Survente — rebond possible\n\n⚠️ Un RSI > 70 ne signifie pas vendre immédiatement — une action peut rester en surachat longtemps.` },
  { ico:'MM',   col:'#00D68F', title:'Moyennes Mobiles (MM20 · MM200)',
    body:`Lissent les prix pour révéler la tendance de fond.\n\n<b style="color:#00D68F">Prix au-dessus MM200</b> → Tendance haussière ✅\n<b style="color:#FF4D6A">Prix en dessous MM200</b> → Zone de danger ⚠️\n\n<b style="color:#00D68F">Golden Cross</b> → MM50 croise MM200 vers le haut = signal achat fort\n<b style="color:#FF4D6A">Death Cross</b> → MM50 croise MM200 vers le bas = signal de sortie` },
  { ico:'PER',  col:'#FFB340', title:'PER — Price Earning Ratio',
    body:`PER = Prix ÷ Bénéfice par action\n\n<b style="color:#00D68F">PER < 10</b> → Potentiellement sous-évalué\n<b style="color:#FFB340">PER 10-20</b> → Zone raisonnable\n<b style="color:#FF4D6A">PER > 30</b> → Spéculatif — cherté extrême\n\nSur la BRVM, les PER < 10 sont fréquents (BOA BF: 9.1, SONATEL: 7-8) — marché structurellement moins cher.` },
  { ico:'DIV',  col:'#00D68F', title:'Rendement Dividende',
    body:`Dividende annuel ÷ Prix × 100\n\n<b style="color:#00D68F">> 5%</b> sur valeur solide → Excellent\n<b style="color:#FFB340">3-5%</b> → Correct\n<b style="color:#FF4D6A">> 12%</b> → Méfiance — possible coupe à venir\n\nExemples : BOA BF 9.2%, SONATEL 5.5%, Enbridge 6.3%` },
  { ico:'S/R',  col:'#FF4D6A', title:'Support & Résistance',
    body:`<b style="color:#00D68F">Support</b> → Niveau où le prix rebondit régulièrement → Zone d'achat\n<b style="color:#FF4D6A">Résistance</b> → Plafond difficile à franchir → Zone de prudence\n\nQuand la résistance est franchie avec du volume, elle devient le nouveau support — signal fort.` },
  { ico:'VOL',  col:'#FFB340', title:'Volume — Le détecteur de vérité',
    body:`Prix monte + Volume fort → Signal FIABLE ✅\nPrix monte + Volume faible → Signal fragile ⚠️\nPrix baisse + Volume fort → Vente massive 🚨\nPrix baisse + Volume faible → Respiration normale 😐\n\nSur la BRVM, volumes structurellement faibles → signaux moins fiables que sur TSX ou NYSE.` },
  { ico:'PSY',  col:'#FF4D6A', title:'3 Biais cognitifs à éviter',
    body:`<b style="color:#FF4D6A">1. Biais de confirmation</b>\nTu cherches les infos qui confirment ce que tu crois. Solution : cherche activement les arguments CONTRE ta position.\n\n<b style="color:#FFB340">2. Aversion aux pertes</b>\nUne perte fait 2× plus mal qu'un gain. Solution : fixe un stop-loss AVANT d'acheter.\n\n<b style="color:#5B8CFF">3. Biais de récence</b>\nTu crois que la tendance récente durera. Solution : regarde les données sur 5-10 ans.` }
];

let _guideBuilt = false;
function buildGuide() {
  if (_guideBuilt) return;
  _guideBuilt = true;
  const el = document.getElementById('guide-content');
  if (!el) return;
  el.innerHTML = GUIDE_ITEMS.map((it, i) => `
    <div class="guide-card">
      <div class="guide-header" onclick="toggleGuide(${i})">
        <div class="guide-icon" style="background:${it.col}20;border-color:${it.col}44;color:${it.col}">${it.ico}</div>
        <div class="guide-title">${SS_UI.esc(it.title)}</div>
        <div class="guide-chevron" id="gc-${i}">+</div>
      </div>
      <div class="guide-body" id="gb-${i}">${it.body.replace(/\n/g,'<br>')}</div>
    </div>`).join('');
}

function toggleGuide(i) {
  const b = document.getElementById('gb-' + i);
  const c = document.getElementById('gc-' + i);
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
    el.innerHTML = `<div class="empty-state">
      <div class="empty-icon">📋</div>
      <div class="empty-title">Aucune analyse</div>
      <div class="empty-text">Lance ta première analyse depuis l'onglet Analyser</div>
    </div>`;
    return;
  }
  const COLS = { buy:'#00D68F', sell:'#FF4D6A', wait:'#FFB340' };
  el.innerHTML = STATE.history.map((h, i) => {
    const col = COLS[h.data?.decision_color] || '#FFB340';
    return `<div class="hist-card" onclick="loadFromHistory(${i})">
      <div class="hist-top">
        <div style="display:flex;align-items:center;gap:8px">
          <span style="font-family:monospace;font-size:15px;font-weight:700;letter-spacing:1px;color:#D8DCE8">${SS_UI.esc(h.data?.ticker||h.ticker)}</span>
          <span style="font-size:9px;color:#6B738F">${SS_UI.esc(h.data?.market||h.market)}</span>
        </div>
        <div style="text-align:right">
          <div style="font-size:12px;font-weight:800;color:${col}">${SS_UI.esc(h.data?.decision||'—')}</div>
          <div style="font-size:9px;color:#3A4158;margin-top:2px">${h.ts}</div>
        </div>
      </div>
      <div style="font-size:11px;color:#6B738F;line-height:1.5;margin-top:5px">${SS_UI.esc((h.data?.summary||'').substring(0,90))}…</div>
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

// ── PARAMÈTRES ────────────────────────────────────────────────────────
function saveApiKey() {
  const val = (document.getElementById('api-key-input').value || '').trim();
  if (!val) { SS_UI.showToast('⚠️ Entre une clé valide'); return; }
  STATE.apiKey = val;
  localStorage.setItem('ss_api_key', val);
  document.getElementById('api-key-status').textContent = '✓ Clé sauvegardée';
  document.getElementById('api-key-status').style.color = '#00D68F';
  SS_UI.showToast('✓ Clé API sauvegardée');
}

function clearApiKey() {
  STATE.apiKey = '';
  localStorage.removeItem('ss_api_key');
  document.getElementById('api-key-input').value = '';
  document.getElementById('api-key-status').textContent = 'Non configurée';
  document.getElementById('api-key-status').style.color = '#FF4D6A';
  SS_UI.showToast('Clé API supprimée');
}

async function clearHistory() {
  if (!confirm('Supprimer les analyses de plus de 30 jours ?')) return;
  await SS_DB.clearOldAnalyses(30);
  SS_UI.showToast('✓ Historique nettoyé');
}

// ── CONNECTIVITÉ ──────────────────────────────────────────────────────
window.addEventListener('online',  () => { STATE.isOnline = true;  SS_UI.showToast('✓ Connexion rétablie'); updateOnlineBadge(); });
window.addEventListener('offline', () => { STATE.isOnline = false; SS_UI.showToast('⚠️ Hors connexion — données cache utilisées'); updateOnlineBadge(); });

function updateOnlineBadge() {
  document.querySelectorAll('.offline-badge').forEach(el => {
    el.style.display = STATE.isOnline ? 'none' : 'flex';
  });
}

// ── INIT ──────────────────────────────────────────────────────────────
function init() {
  // Service Worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(e => console.warn('SW:', e));
  }

  // Afficher clé API si déjà configurée
  if (STATE.apiKey) {
    const inp = document.getElementById('api-key-input');
    if (inp) inp.placeholder = 'Clé configurée (sk-ant-…)';
    const st = document.getElementById('api-key-status');
    if (st) { st.textContent = '✓ Clé configurée'; st.style.color = '#00D68F'; }
  }

  // Entrée clavier
  const tk = document.getElementById('tickerInput');
  if (tk) tk.addEventListener('keydown', e => { if (e.key === 'Enter') { e.target.blur(); runAnalysis(); } });

  // Connectivité
  updateOnlineBadge();

  // Ticker indices
  const MKT_VALS = { 'bmv':[ '+37.4%','+37.8%','+37.1%','+37.6%'], 'tmv':['+12.1%','+12.3%','+11.9%','+12.2%'] };
  let mktIdx = 0;
  setInterval(() => {
    mktIdx = (mktIdx + 1) % 4;
    Object.entries(MKT_VALS).forEach(([id, vals]) => {
      const el = document.getElementById(id);
      if (el) el.textContent = vals[mktIdx];
    });
  }, 3500);

  // Redimensionnement
  window.addEventListener('resize', () => {
    if (STATE.currentData && document.getElementById('priceChart')) {
      SS_UI.drawChart(STATE.currentData, STATE.chartMode);
    }
  });

  console.log('[StockSense] App initialisée ✓');
}

window.SS_APP = {
  showPage, setIntent, quickPick, runAnalysis, resetAnalysis,
  swTab, switchChart, selectRegion, refreshMarket, loadRegion,
  showMarketInfo, analyzeFromMarket, toggleGuide, loadFromHistory,
  saveApiKey, clearApiKey, clearHistory, init
};

document.addEventListener('DOMContentLoaded', init);
