'use strict';

/* ── DONNÉES DE MARCHÉ RÉELLES ─────────────────────────────────────────
 *
 * Une page statique ne peut appeler que les sources qui renvoient
 * `Access-Control-Allow-Origin` pour son origine. Mesuré le 2026-10-13 depuis
 * https://takitmob.github.io — préflight OPTIONS, indépendant de toute clé :
 *
 *   Twelve Data   ✓  Access-Control-Allow-Origin: *
 *   Finnhub       ✓  *
 *   FMP           ✓  *
 *   Yahoo Finance ✗   Stooq ✗   Alpha Vantage ✗   Nasdaq ✗
 *   BRVM.org      ✗   Frankfurter ✗
 *
 * La BRVM n'est couverte par AUCUNE source gratuite : `/stocks?exchange=XBRV`
 * et `/stocks?symbol=SNTS` renvoient tous deux une liste vide. Les analyses
 * BRVM restent donc explicitement « indicatives » — l'app le dit, elle ne fait
 * pas semblant.
 *
 * Ce que cette couche apporte : au lieu de laisser le modèle inventer des prix,
 * on récupère la vraie clôture, la vraie variation, les 20 dernières clôtures et
 * les volumes, et on CALCULE localement le RSI(14) et les moyennes mobiles. Ces
 * valeurs partent dans le prompt comme des faits, pas comme des estimations.
 */

const QUOTES = {
  nom: 'Twelve Data',
  base: 'https://api.twelvedata.com',
  cleStockage: 'ss_key_quotes',
  // région interne de l'app -> place de cotation. null = aucune source connue.
  places: { brvm: null, tsx: 'TSX', usa: '', europe: '', asie: '', emergents: '' },
  cacheMs: 6 * 60 * 60 * 1000,   // 6 h : une clôture journalière ne bouge pas plus vite
};

function quotesCle() { return (localStorage.getItem(QUOTES.cleStockage) || '').trim(); }
function quotesCleEnregistree() { return quotesCle().length > 0; }
function quotesEnregistrerCle(v) {
  if (v) localStorage.setItem(QUOTES.cleStockage, v.trim());
  else localStorage.removeItem(QUOTES.cleStockage);
}

/** Symbole attendu par le fournisseur pour une région donnée. */
function quotesSymbole(ticker, region) {
  const t = String(ticker || '').trim().toUpperCase();
  if (!t) return null;
  const place = QUOTES.places[region];
  if (place === undefined) return t;          // région inconnue : ticker nu
  if (place === null) return null;            // BRVM : aucune source
  return place ? t + ':' + place : t;         // TSX -> ENB:TSX ; USA -> AAPL
}

/** RSI de Wilder sur une série de clôtures. Calcul réel, pas une estimation. */
function calculerRSI(clotures, periode) {
  periode = periode || 14;
  if (!Array.isArray(clotures) || clotures.length < periode + 1) return [];
  const gains = [], pertes = [];
  for (let i = 1; i < clotures.length; i++) {
    const d = clotures[i] - clotures[i - 1];
    gains.push(Math.max(0, d));
    pertes.push(Math.max(0, -d));
  }
  let g = gains.slice(0, periode).reduce((a, b) => a + b, 0) / periode;
  let p = pertes.slice(0, periode).reduce((a, b) => a + b, 0) / periode;
  // série strictement plate : aucun gain ni aucune perte -> 50 (et non 100, qui
  // signalerait à tort un surachat maximal)
  const rsiDe = (gain, perte) => {
    if (perte === 0 && gain === 0) return 50;
    if (perte === 0) return 100;
    return 100 - 100 / (1 + gain / perte);
  };
  const out = [rsiDe(g, p)];
  for (let i = periode; i < gains.length; i++) {
    g = (g * (periode - 1) + gains[i]) / periode;
    p = (p * (periode - 1) + pertes[i]) / periode;
    out.push(rsiDe(g, p));
  }
  return out.map(v => Math.round(v * 10) / 10);
}

function moyenne(arr) {
  const v = (arr || []).filter(n => typeof n === 'number' && !isNaN(n));
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

/** Extrait (clôtures, volumes) triés du plus ancien au plus récent. */
function quotesExtraireSeries(json, limite) {
  const valeurs = (json && Array.isArray(json.values)) ? json.values.slice() : [];
  // l'API renvoie du plus récent au plus ancien
  const chrono = valeurs.slice().reverse();
  const clotures = chrono.map(v => parseFloat(v.close)).filter(n => !isNaN(n));
  const volumes  = chrono.map(v => parseFloat(v.volume)).filter(n => !isNaN(n));
  const dates    = chrono.map(v => v.datetime);
  const n = limite || 20;
  return {
    clotures: clotures.slice(-n),
    volumes:  volumes.slice(-n),
    dates:    dates.slice(-n),
    devise:   (json && json.meta && json.meta.currency) || null,
  };
}

/** Assemblage des faits de marché à partir des deux réponses du fournisseur. */
function quotesAssembler(quote, serie) {
  const s = quotesExtraireSeries(serie, 20);
  if (!s.clotures.length) return { ok: false, erreur: 'Aucune clôture renvoyée par la source.' };
  const rsi = calculerRSI(s.clotures, 14);
  const dernier = s.clotures[s.clotures.length - 1];
  const prix = parseFloat(quote && quote.close);
  const variation = parseFloat(quote && quote.percent_change);
  const mm20 = moyenne(s.clotures);
  const mm50 = serie && Array.isArray(serie.values)
    ? moyenne(serie.values.map(v => parseFloat(v.close)).filter(n => !isNaN(n)))
    : null;
  return {
    ok: true,
    source: QUOTES.nom,
    date: (quote && quote.datetime) || (serie && serie.meta && serie.meta.last_refreshed) || null,
    devise: s.devise || (quote && quote.currency) || null,
    nom: (quote && quote.name) || null,
    place: (quote && quote.exchange) || null,
    // la cotation temps réel prime ; la clôture sert de repli
    prix: isNaN(prix) ? dernier : prix,
    variation: isNaN(variation) ? null : variation,
    clotures: s.clotures,
    volumes: s.volumes,
    rsi: rsi,
    rsiActuel: rsi.length ? rsi[rsi.length - 1] : null,
    moyenne20: mm20,
    moyenne50: mm50,
    volumeMoyen: moyenne(s.volumes),
    debut: s.dates[0] || null,
    fin: s.dates[s.dates.length - 1] || null,
  };
}

/* ── BRVM : instantané servi depuis la même origine ─────────────────────
 *
 * brvm.org publie ses cours en HTML, sans API, et aucune source gratuite ne
 * couvre cette place. Un runner GitHub Actions — donc côté serveur, hors
 * contrainte CORS — extrait les cours chaque séance et les dépose dans le
 * dépôt ; l'app lit ces fichiers depuis SA PROPRE ORIGINE. Aucun relais à
 * administrer, aucun certificat, aucun quota, et la donnée est officielle.
 *
 * Le marché cote une fois par jour : un instantané quotidien est la bonne
 * granularité, pas un flux temps réel.
 */
const BRVM_FICHIERS = { cours: 'data/brvm.json', historique: 'data/brvm-history.json' };

async function quotesChargerBRVM(ticker, options) {
  options = options || {};
  const t = String(ticker || '').trim().toUpperCase();
  if (!t) return { ok: false, erreur: 'Ticker vide.' };
  let snap, hist = null;
  try {
    const rc = await fetch(BRVM_FICHIERS.cours, { cache: options.force ? 'no-store' : 'default' });
    if (!rc.ok) {
      return { ok: false, indisponible: true,
               erreur: 'Instantané BRVM non publié (HTTP ' + rc.status + ').' };
    }
    snap = await rc.json();
  } catch (e) {
    return { ok: false, erreur: 'Instantané BRVM injoignable : ' + String((e && e.message) || e) };
  }
  try {
    const rh = await fetch(BRVM_FICHIERS.historique, { cache: 'default' });
    if (rh.ok) hist = await rh.json();
  } catch (e) { /* l'historique est optionnel : sans lui, pas de RSI ni de graphique */ }

  const v = (snap.valeurs || []).find(x => x.ticker === t);
  if (!v) {
    return { ok: false, indisponible: true,
             erreur: 'Ce titre ne figure pas dans la cote BRVM du ' + (snap.recupere || '?').slice(0, 10) + '.' };
  }
  const points = (hist && hist.series && hist.series[t]) || [];
  const series = points.map(p => p[1]).filter(n => typeof n === 'number');
  const volumes = points.map(p => p[2]).filter(n => typeof n === 'number');
  const rsi = calculerRSI(series, 14);
  const date = String(snap.recupere || '').slice(0, 10);
  const age = date ? Math.floor((Date.now() - Date.parse(date + 'T00:00:00Z')) / 86400000) : null;
  return {
    ok: true,
    source: 'BRVM (brvm.org)',
    date: date,
    devise: snap.devise || 'FCFA',
    nom: v.nom || null,
    place: 'BRVM',
    prix: v.cloture,
    variation: v.variation,
    clotures: series.slice(-20),
    volumes: volumes.slice(-20),
    rsi: rsi,
    rsiActuel: rsi.length ? rsi[rsi.length - 1] : null,
    moyenne20: moyenne(series.slice(-20)),
    moyenne50: moyenne(series),
    volumeMoyen: moyenne(volumes.slice(-20)),
    seances: series.length,
    debut: points[0] ? points[0][0] : null,
    fin: points.length ? points[points.length - 1][0] : date,
    perime: age !== null && age > 4,
    officiel: true,
  };
}

/**
 * Charge les données réelles d'un titre. Ne jette jamais : renvoie
 * { ok:false, erreur } — l'appelant décide quoi en faire.
 * Renvoie { ok:false, indisponible:true } quand la région n'a aucune source.
 */
async function quotesCharger(ticker, region, options) {
  options = options || {};
  // La BRVM passe par l'instantané du dépôt : elle ne demande aucune clé.
  if (region === 'brvm') return quotesChargerBRVM(ticker, options);
  const cle = options.cle || quotesCle();
  if (!quotesCleEnregistree() && !options.cle) {
    return { ok: false, indisponible: true, erreur: 'Aucune clé de données de marché configurée.' };
  }
  const symbole = quotesSymbole(ticker, region);
  if (!symbole) {
    return { ok: false, indisponible: true,
             erreur: 'Aucune source de cotations gratuite ne couvre la BRVM.' };
  }

  // cache local (IndexedDB) : une clôture journalière ne change pas toutes les 5 min
  if (!options.force && window.SS_DB && SS_DB.getMarketCache) {
    try {
      const c = await SS_DB.getMarketCache('q:' + symbole);
      if (c && c.data && c.fetchedAt && (Date.now() - c.fetchedAt) < QUOTES.cacheMs) {
        return { ...c.data, depuisCache: true };
      }
    } catch (e) { /* cache indisponible : on continue en réseau */ }
  }

  const q = 'apikey=' + encodeURIComponent(cle) + '&symbol=' + encodeURIComponent(symbole);
  try {
    const [rq, rs] = await Promise.all([
      fetch(QUOTES.base + '/quote?' + q, { cache: 'no-store' }),
      fetch(QUOTES.base + '/time_series?' + q + '&interval=1day&outputsize=60', { cache: 'no-store' }),
    ]);
    const jq = await rq.json().catch(() => ({}));
    const js = await rs.json().catch(() => ({}));
    // l'API répond 200 avec {code,message,status:'error'} pour un symbole inconnu
    const err = (jq && jq.status === 'error' && jq.message) || (js && js.status === 'error' && js.message);
    if (err) return { ok: false, erreur: 'Source de marché : ' + String(err).slice(0, 140) };
    const faits = quotesAssembler(jq, js);
    if (faits.ok && window.SS_DB && SS_DB.saveMarketCache) {
      try { await SS_DB.saveMarketCache('q:' + symbole, faits, true); } catch (e) { /* sans gravité */ }
    }
    return faits;
  } catch (e) {
    return { ok: false, erreur: 'Source de marché injoignable : ' + String((e && e.message) || e) };
  }
}

/** Bloc de faits injecté tel quel dans le prompt. */
function quotesBlocPrompt(f) {
  if (!f || !f.ok) return '';
  const nb = (v) => (v == null ? 'non communiqué' : String(Math.round(v * 100) / 100));
  const lignes = [
    'DONNEES DE MARCHE REELLES — source ' + f.source + (f.date ? ', ' + f.date : '') + '.',
    '- prix de reference : ' + nb(f.prix) + (f.devise ? ' ' + f.devise : ''),
    f.variation != null ? '- variation du jour : ' + nb(f.variation) + ' %' : '',
    f.rsiActuel != null ? '- RSI(14) CALCULE : ' + nb(f.rsiActuel) : '',
    '- clotures disponibles (' + f.clotures.length + ') : [' + f.clotures.map(v => Math.round(v * 100) / 100).join(', ') + ']',
    f.volumes && f.volumes.length ? '- volumes disponibles (' + f.volumes.length + ') : [' + f.volumes.map(v => Math.round(v)).join(', ') + ']' : '',
    f.moyenne20 != null ? '- moyenne des ' + Math.min(f.clotures.length, 20) + ' dernieres clotures : ' + nb(f.moyenne20) : '',
    (f.moyenne50 != null && f.clotures.length > 20) ? '- moyenne des ' + f.clotures.length + ' clotures de la serie : ' + nb(f.moyenne50) : '',
    (f.seances != null && f.seances < 15)
      ? '- SERIE COURTE : ' + f.seances + ' seance(s) enregistree(s) seulement. Le RSI n est PAS encore calculable : ne l invente pas, dis que l historique est trop court.'
      : '',
    f.perime ? '- ATTENTION : cet instantane date du ' + f.date + ', soit plus de quatre jours. Signale-le dans le resume.' : '',
    f.officiel ? '- Source officielle de la place : cours de cloture publies par la BRVM elle-meme.' : '',
    'CONSIGNE : ces chiffres sont MESURES, pas estimes. Recopie-les exactement dans le JSON. '
      + 'Ne les recalcule pas et n\'invente aucun autre prix. Deduis technique et momentum de ces series.',
  ];
  return lignes.filter(Boolean).join('\n');
}

window.SS_QUOTES = {
  QUOTES, quotesCle, quotesCleEnregistree, quotesEnregistrerCle,
  quotesSymbole, quotesCharger, quotesBlocPrompt,
  calculerRSI, moyenne,       // exposes pour les tests
};
