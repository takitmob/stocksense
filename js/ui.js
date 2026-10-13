'use strict';

// ── ESCAPE HTML ───────────────────────────────────────────────────────
function esc(s) {
  if (!s) return '';
  return String(s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;')
    // L'apostrophe manquait : `renderStockCard` injecte le ticker dans un
    // attribut onclick="fn('…')" — un ticker en contenant cassait l'attribut.
    .replace(/'/g,'&#39;').replace(/`/g,'&#96;');
}

// ── COULEURS ──────────────────────────────────────────────────────────
const C = {
  buy:  { bg:'rgba(0,214,143,.12)',  text:'#00D68F', border:'rgba(0,214,143,.3)'  },
  sell: { bg:'rgba(255,77,106,.12)', text:'#FF4D6A', border:'rgba(255,77,106,.3)' },
  wait: { bg:'rgba(255,179,64,.12)', text:'#FFB340', border:'rgba(255,179,64,.3)' },
  b:    { bg:'rgba(0,214,143,.12)',  text:'#00D68F', border:'rgba(0,214,143,.3)'  },
  s:    { bg:'rgba(255,77,106,.12)', text:'#FF4D6A', border:'rgba(255,77,106,.3)' },
  h:    { bg:'rgba(255,179,64,.12)', text:'#FFB340', border:'rgba(255,179,64,.3)' },
};
const QCOL = { good:'#00D68F', bad:'#FF4D6A', neutral:'#FFB340', plain:'#D8DCE8' };
const CHGCOL = { up:'#00D68F', dn:'#FF4D6A', fl:'#FFB340' };
const CHGICO = { up:'▲', dn:'▼', fl:'►' };

// ── SCORE RING SVG ────────────────────────────────────────────────────
function scoreRing(val, label, icon) {
  const r    = 18;
  const circ = 2 * Math.PI * r;
  const off  = circ - (val / 100) * circ;
  const col  = val >= 65 ? '#00D68F' : val >= 40 ? '#FFB340' : '#FF4D6A';
  return `
    <div class="score-card">
      <div class="score-icon">${icon}</div>
      <div class="score-label">${label}</div>
      <div class="ring-wrap">
        <svg width="44" height="44" viewBox="0 0 44 44" class="ring-svg">
          <circle cx="22" cy="22" r="${r}" fill="none" stroke="#252B3D" stroke-width="4"/>
          <circle cx="22" cy="22" r="${r}" fill="none" stroke="${col}" stroke-width="4"
            stroke-linecap="round"
            stroke-dasharray="${circ.toFixed(2)}"
            stroke-dashoffset="${off.toFixed(2)}"
            transform="rotate(-90 22 22)"/>
        </svg>
        <div class="ring-val" style="color:${col}">${val}</div>
      </div>
    </div>`;
}

// ── VERDICT CARD ──────────────────────────────────────────────────────
function renderVerdict(data) {
  const dc  = data.decision_color || 'wait';
  const col = C[dc] || C.wait;
  const conf = Math.max(0, Math.min(100, data.confidence || 0));

  return `
<div class="verdict-card ${dc}">
  <div class="verdict-glow"></div>
  <div class="verdict-top">
    <div>
      <div class="verdict-ticker">${esc(data.ticker)}</div>
      <div class="verdict-name">${esc(data.name)}</div>
    </div>
    <div class="verdict-right">
      <div class="verdict-price">${esc(data.price)}</div>
      <div class="verdict-market">${esc(data.market)}</div>
    </div>
  </div>
  <div class="verdict-badge" style="background:${col.bg};border-color:${col.border};color:${col.text}">
    ${esc(data.decision)}
  </div>
  <div class="verdict-summary">${esc(data.summary)}</div>
  <div class="conf-row">
    <span class="conf-label">CONFIANCE</span>
    <div class="conf-bar-wrap">
      <div class="conf-bar" style="width:${conf}%;background:${col.text}"></div>
    </div>
    <span class="conf-val" style="color:${col.text}">${conf}%</span>
  </div>
  ${data.score_global == null ? '' : `
  <div class="conf-row" style="margin-top:6px">
    <span class="conf-label">SCORE GLOBAL</span>
    <div class="conf-bar-wrap">
      <div class="conf-bar" style="width:${Math.max(0, Math.min(100, data.score_global))}%;background:${col.text}"></div>
    </div>
    <span class="conf-val" style="color:${col.text}">${data.score_global}/100</span>
  </div>`}
  ${data.verdict_recalcule ? `
  <div class="verdict-summary" style="margin-top:9px;opacity:.85;font-size:11px">
    ⓘ Verdict recalculé à partir des cinq scores (seuil d'achat : 65/100). L'analyse brute
    annonçait « ${esc(data.decision_ia || '—')} », incohérent avec ses propres notes.
  </div>` : ''}
  ${data.donneesReelles ? `
  <div class="verdict-summary" style="margin-top:9px;font-size:11px">
    ✅ Cotations réelles — ${esc(data.source || 'source de marché')}${data.sourceDate ? ' · ' + esc(data.sourceDate) : ''}${data.rsiCalcule == null ? '' : ' · RSI(14) mesuré ' + esc(data.rsiCalcule)}
  </div>` : `
  <div class="verdict-summary" style="margin-top:9px;font-size:11px;opacity:.85">
    ⚠️ Analyse indicative : aucun prix réel n'a pu être injecté (clé de données de marché absente,
    titre absent de la cote du jour, ou instantané indisponible). Les chiffres sont ceux du modèle,
    pas des cotations.
  </div>`}
</div>`;
}

// ── SCORES ────────────────────────────────────────────────────────────
function renderScores(scores) {
  const defs = [
    { k:'technique',    l:'Tech',   i:'📊' },
    { k:'fondamentaux', l:'Fond.',  i:'🏗' },
    { k:'macro',        l:'Macro',  i:'🌍' },
    { k:'momentum',     l:'Mom.',   i:'⚡' },
    { k:'risque',       l:'Risque', i:'🛡' }
  ];
  return `<div class="scores-grid">${defs.map(d => scoreRing(scores[d.k]||0, d.l, d.i)).join('')}</div>`;
}

// ── CHART CANVAS ──────────────────────────────────────────────────────
function renderChart() {
  return `
<div class="chart-panel">
  <div class="chart-header">
    <span class="chart-title">ÉVOLUTION</span>
    <div class="chart-tabs">
      <button class="ct active" data-mode="price" onclick="SS_APP.switchChart('price',this)">Prix</button>
      <button class="ct" data-mode="rsi"   onclick="SS_APP.switchChart('rsi',this)">RSI</button>
      <button class="ct" data-mode="vol"   onclick="SS_APP.switchChart('vol',this)">Vol.</button>
    </div>
  </div>
  <canvas id="priceChart" height="150"></canvas>
</div>`;
}

function drawChart(data, mode) {
  const canvas = document.getElementById('priceChart');
  if (!canvas || !data) return;
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const W   = canvas.parentElement.offsetWidth - 28 || 340;
  const H   = 150;
  canvas.width  = W * dpr; canvas.height = H * dpr;
  canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, W, H);

  let raw, col;
  if      (mode === 'price') { raw = data.price_history;  col = '#00D68F'; }
  else if (mode === 'rsi')   { raw = data.rsi_history;    col = '#5B8CFF'; }
  else                        { raw = data.volume_history; col = '#FFB340'; }

  if (!raw || !raw.length) return;
  // Une série d'un seul point ne fait pas un graphique. On l'écrit au lieu de
  // dessiner une droite inventée : sur un marché comme la BRVM, l'historique se
  // construit séance après séance, et la première séance n'a pas de courbe.
  if (raw.length < 2) {
    ctx.fillStyle = '#3A4158'; ctx.font = '11px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('Historique insuffisant — ' + raw.length + ' séance enregistrée', W / 2, H / 2 - 8);
    ctx.fillStyle = '#252B3D'; ctx.font = '9.5px sans-serif';
    ctx.fillText(mode === 'volume' ? 'la courbe se construira séance après séance'
                                   : 'le RSI devient calculable à partir de 15 séances', W / 2, H / 2 + 10);
    return;
  }
  const n  = raw.length;
  const mn = Math.min(...raw) * 0.96;
  const mx = Math.max(...raw) * 1.04;
  const pl = 42, pr = 10, pt = 12, pb = 24;
  const cW = W - pl - pr, cH = H - pt - pb;
  if (mx === mn) return;

  const xp = i => pl + (i / (n-1)) * cW;
  const yp = v => pt + cH - ((v - mn) / (mx - mn)) * cH;

  // Grid
  ctx.strokeStyle = '#252B3D'; ctx.lineWidth = 0.5;
  for (let g = 0; g <= 4; g++) {
    const gy = pt + (g / 4) * cH;
    ctx.beginPath(); ctx.moveTo(pl, gy); ctx.lineTo(W - pr, gy); ctx.stroke();
    const gv = mx - (g / 4) * (mx - mn);
    ctx.fillStyle = '#3A4158'; ctx.font = '9px monospace';
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ctx.fillText(gv.toFixed(0), pl - 4, gy);
  }

  // RSI zones
  if (mode === 'rsi') {
    ctx.fillStyle = 'rgba(255,77,106,.06)'; ctx.fillRect(pl, pt, cW, yp(70) - pt);
    ctx.fillStyle = 'rgba(0,214,143,.06)';  ctx.fillRect(pl, yp(30), cW, pt + cH - yp(30));
    [['#FF4D6A', 70], ['#00D68F', 30]].forEach(([c, v]) => {
      ctx.strokeStyle = c + '55'; ctx.lineWidth = 0.8; ctx.setLineDash([4, 3]);
      ctx.beginPath(); ctx.moveTo(pl, yp(v)); ctx.lineTo(W - pr, yp(v)); ctx.stroke();
    });
    ctx.setLineDash([]);
  }

  if (mode === 'vol') {
    const bw = (cW / n) * 0.6;
    raw.forEach((v, i) => {
      const bh = ((v - mn) / (mx - mn)) * cH;
      ctx.fillStyle = col + '99';
      ctx.fillRect(xp(i) - bw/2, pt + cH - bh, bw, bh);
    });
  } else {
    const grad = ctx.createLinearGradient(0, pt, 0, pt + cH);
    grad.addColorStop(0, col + '25'); grad.addColorStop(1, col + '00');
    ctx.beginPath(); ctx.moveTo(xp(0), yp(raw[0]));
    raw.forEach((v, i) => { if (i) ctx.lineTo(xp(i), yp(v)); });
    ctx.lineTo(xp(n-1), pt+cH); ctx.lineTo(xp(0), pt+cH); ctx.closePath();
    ctx.fillStyle = grad; ctx.fill();
    ctx.beginPath(); ctx.moveTo(xp(0), yp(raw[0]));
    raw.forEach((v, i) => { if (i) ctx.lineTo(xp(i), yp(v)); });
    ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.stroke();
    const lx = xp(n-1), ly = yp(raw[n-1]);
    ctx.beginPath(); ctx.arc(lx, ly, 4, 0, Math.PI*2); ctx.fillStyle = col; ctx.fill();
    ctx.beginPath(); ctx.arc(lx, ly, 8, 0, Math.PI*2); ctx.fillStyle = col + '30'; ctx.fill();
  }

  ctx.fillStyle = '#3A4158'; ctx.font = '8px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  [0, 5, 10, 15, 19].forEach(i => { if (i < n) ctx.fillText('J-' + (n-1-i), xp(i), H - 5); });
}

// ── TECHNICALS ────────────────────────────────────────────────────────
function renderTechnicals(techs) {
  return `
<div class="section-panel">
  <div class="section-title">INDICATEURS TECHNIQUES</div>
  ${techs.map(t => {
    const cls = t.signal === 'buy' ? 'sgb' : t.signal === 'sell' ? 'sgs' : 'sgn';
    return `<div class="ind-row">
      <span class="ind-name">${esc(t.name)}</span>
      <span class="ind-val">${esc(t.value)}</span>
      <span class="sig ${cls}">${esc(t.label)}</span>
    </div>`;
  }).join('')}
</div>`;
}

// ── FUNDAMENTALS ──────────────────────────────────────────────────────
function renderFundamentals(funds) {
  return `
<div class="section-panel">
  <div class="section-title">FONDAMENTAUX</div>
  ${funds.map(f => {
    const col = QCOL[f.quality] || '#D8DCE8';
    return `<div class="fund-row">
      <span class="fund-key">${esc(f.key)}</span>
      <span class="fund-val" style="color:${col}">${esc(f.value)}</span>
    </div>`;
  }).join('')}
</div>`;
}

// ── CATALYSTS / RISKS ─────────────────────────────────────────────────
function renderCatalystsRisks(catalysts, risks) {
  const pill = (items, dot) => items.map(t =>
    `<div class="pill-item"><div class="pill-dot" style="background:${dot}"></div><span>${esc(t)}</span></div>`
  ).join('');
  return `
<div class="cr-grid">
  <div class="cr-panel">
    <div class="section-title">CATALYSEURS</div>
    ${pill(catalysts, '#00D68F')}
  </div>
  <div class="cr-panel">
    <div class="section-title">RISQUES</div>
    ${pill(risks, '#FF4D6A')}
  </div>
</div>`;
}

// ── FULL ANALYSIS ─────────────────────────────────────────────────────
function renderFullAnalysis(text) {
  const html = esc(text).replace(/\*\*(.*?)\*\*/g, '<strong style="color:#00D68F">$1</strong>').replace(/\\n/g, '<br>').replace(/\n/g, '<br>');
  return `
<div class="section-panel">
  <div class="section-title ai-label">
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
    </svg>
    ANALYSE CLAUDE AI
  </div>
  <div class="ai-text">${html}</div>
</div>`;
}

// ── STOCK CARD (marchés) ──────────────────────────────────────────────
function renderStockCard(s, idx, onClickFn) {
  const sig    = s.signal || 'h';
  const sigCol = C[sig] || C.h;
  const chgCol = CHGCOL[s.change_dir] || '#FFB340';
  const chgIco = CHGICO[s.change_dir] || '►';
  return `
<div class="stock-card" style="border-left-color:${sigCol.text}" onclick="${onClickFn}('${esc(s.ticker)}')">
  <div class="stock-row1">
    <div class="stock-left">
      <div class="rank-badge">${idx+1}</div>
      <div>
        <div class="stock-ticker">${esc(s.ticker)}</div>
        <div class="stock-name">${esc(s.name)}</div>
      </div>
    </div>
    <div class="stock-right">
      <div class="stock-price">${esc(s.price)}</div>
      <div class="stock-change" style="color:${chgCol}">${chgIco} ${esc(s.change)}</div>
    </div>
  </div>
  <div class="stock-row2">
    <span class="stock-sector">${esc(s.sector)}</span>
    <div class="stock-meta">
      <span>PER <b>${esc(s.per)}</b></span>
      <span>Div <b>${esc(s.dividend)}</b></span>
    </div>
    <span class="sig-badge" style="background:${sigCol.bg};border-color:${sigCol.border};color:${sigCol.text}">${esc(s.signal_label)}</span>
  </div>
  ${s.why ? `<div class="stock-why">${esc(s.why)}</div>` : ''}
</div>`;
}

// ── MARKET STATUS BADGE ───────────────────────────────────────────────
function renderStatusBadge(st, region) {
  if (!st) return '';
  const col = st.isOpen ? '#00D68F' : '#FF4D6A';
  const bg  = st.isOpen ? 'rgba(0,214,143,.1)' : 'rgba(255,77,106,.1)';
  const bd  = st.isOpen ? 'rgba(0,214,143,.3)' : 'rgba(255,77,106,.3)';
  const txt = st.isOpen
    ? `Marché ouvert · Ferme à ${st.closeTime}`
    : `Marché fermé · Ouvre ${st.nextOpen}`;
  const sub = `${st.localDayName} ${st.localTime} heure locale · ${st.isOpen ? 'En direct' : 'Dernière séance'}`;
  return `
<div class="status-badge" style="background:${bg};border-color:${bd}" onclick="SS_APP.showMarketInfo('${region}')">
  <div class="status-dot" style="background:${col}"></div>
  <div style="flex:1">
    <div style="font-size:11px;font-weight:700;color:${col}">${txt}</div>
    <div style="font-size:10px;color:#3A4158;margin-top:1px">${sub}</div>
  </div>
  <span style="font-size:12px;color:#3A4158">ⓘ</span>
</div>`;
}

// ── TOAST ─────────────────────────────────────────────────────────────
let _toastTimer = null;
function showToast(msg, duration = 2500) {
  let t = document.getElementById('toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'toast';
    t.className = 'toast';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => t.classList.remove('show'), duration);
}

// ── MODAL ─────────────────────────────────────────────────────────────
function showModal(opts) {
  const el = document.getElementById('modal');
  if (!el) return;
  document.getElementById('m-ico').textContent   = opts.ico   || '⚠️';
  document.getElementById('m-title').textContent  = opts.title || 'Une erreur est survenue';
  document.getElementById('m-msg').textContent    = opts.msg   || '';
  const hintEl = document.getElementById('m-hint');
  if (opts.hint) { hintEl.innerHTML = opts.hint; hintEl.style.display = 'block'; }
  else           { hintEl.style.display = 'none'; }
  const retryBtn = document.getElementById('m-retry');
  retryBtn.style.display = opts.retry === false ? 'none' : 'block';
  // Bouton extra
  const oldExtra = document.getElementById('m-extra');
  if (oldExtra) oldExtra.remove();
  if (opts.extraBtn) {
    const eb = document.createElement('button');
    eb.id = 'm-extra'; eb.className = 'mbtn-extra';
    eb.textContent = opts.extraBtn.label;
    eb.onclick = () => { closeModal(); opts.extraBtn.fn && opts.extraBtn.fn(); };
    document.getElementById('m-btns').appendChild(eb);
  }
  el.className = 'modal-overlay show';
}

function closeModal() {
  const el = document.getElementById('modal');
  if (el) el.className = 'modal-overlay';
}

function closeModalOutside(e) {
  if (e.target === document.getElementById('modal')) closeModal();
}

// ── HANDLE ERRORS ─────────────────────────────────────────────────────
/* Nom lisible du fournisseur actif. Le message d'erreur 401 disait « Vérifie ta
 * clé Anthropic » en dur, même avec DeepSeek ou OpenRouter sélectionné. */
function nomFournisseurActif() {
  try {
    const pid = (typeof STATE !== 'undefined' && STATE.provider) || '';
    const prov = window.SS_API && pid ? SS_API.PROVIDERS[pid] : null;
    return prov ? prov.name : 'API';
  } catch (e) {
    return 'API';
  }
}

function handleError(e, label, retryFn) {
  const msg  = String(e && e.message || '');
  const isNet  = /fetch|Failed|OFFLINE|network/i.test(msg);
  const is529  = /529|overload/i.test(msg);
  const is500  = /500|internal/i.test(msg);
  const is429  = /429|rate/i.test(msg);
  const is401  = /401|auth|key/i.test(msg);
  const isJSON = /invalide|JSON/i.test(msg);

  const opts = isNet  ? { ico:'📡', title:'Pas de connexion',         msg:'StockSense AI a besoin d\'internet.',           hint:'<b>Que faire ?</b><br>Vérifie ta connexion Wi-Fi ou données mobiles.', retry:true }
             : is529  ? { ico:'⏳', title:'Service surchargé',         msg:'Trop de demandes. Attends 1 minute.',           hint:'<b>Que faire ?</b><br>Attends 60 secondes puis réessaie.', retry:true }
             : is500  ? { ico:'🔧', title:'Service indisponible',       msg:'Les serveurs sont momentanément surchargés.',   hint:'<b>Que faire ?</b><br>Attends 30 secondes puis réessaie.', retry:true }
             : is429  ? { ico:'🚦', title:'Limite atteinte',            msg:'Trop d\'analyses rapprochées. Patiente 2 min.', hint:'<b>Que faire ?</b><br>Attends 2 minutes.', retry:true }
             : is401  ? { ico:'🔑', title:'Clé API invalide',           msg:'Vérifie ta clé ' + nomFournisseurActif() + ' dans les paramètres.', hint:'Va dans ⚙️ Paramètres → entre ta clé API.', retry:false }
             : isJSON ? { ico:'🔄', title:'Réponse inattendue',         msg:'Format IA inattendu pour ' + label + '.',       hint:'Appuie sur Réessayer — fonctionne dans 95% des cas.', retry:true }
             :          { ico:'😕', title:'Erreur inattendue',          msg:'L\'analyse de ' + label + ' a échoué.',         hint:'<b>Que faire ?</b><br>Réessaie ou utilise les accès rapides.', retry:true };

  if (retryFn && opts.retry) {
    opts.extraBtn = { label:'Réessayer', fn: () => { closeModal(); retryFn(); } };
    opts.retry = false;
  }
  showModal(opts);
}

window.SS_UI = { esc, C, QCOL, CHGCOL, CHGICO, scoreRing, renderVerdict, renderScores, renderChart, drawChart, renderTechnicals, renderFundamentals, renderCatalystsRisks, renderFullAnalysis, renderStockCard, renderStatusBadge, showToast, showModal, closeModal, closeModalOutside, handleError };
