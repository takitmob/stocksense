'use strict';

/* ── BALAYAGE QUOTIDIEN — PROPOSITIONS DU JOUR ────────────────────────────
 *
 * Côté serveur (GitHub Actions), donc hors contrainte CORS : l'app, elle, ne
 * peut interroger que les sources qui renvoient Access-Control-Allow-Origin
 * (voir js/quotes.js), alors qu'un runner peut lire n'importe quoi. C'est
 * exactement le raisonnement qui a fait adopter data/brvm.json.
 *
 * Ce que ce script fait, et rien de plus :
 *   1. lit data/suivi.json (liste de titres + règles du compte) ;
 *   2. récupère les clôtures quotidiennes réelles (Yahoo Finance, 1 an) ;
 *   3. calcule RSI(14), moyennes 50/200, ATR(14), plus bas des 10 séances ;
 *   4. applique UNE règle mécanique, écrite ici et vérifiable :
 *        tendance  : dernier cours au-dessus de la MM200
 *        repli     : RSI(14) sous 45  (on n'achète pas un prix en surchauffe)
 *        tenue     : dernier cours au-dessus de MM50 × 0,96 (pas un couteau)
 *      -> entrée = dernière clôture
 *      -> stop   = plus bas des 10 dernières séances − 0,25 × ATR(14)
 *      -> cible  = entrée + 2 × (entrée − stop)   [on ne devine pas une cible,
 *                                                  on fixe un multiple du risque]
 *   5. dimensionne chaque proposition avec LES FONCTIONS PURES DE L'APP
 *      (js/trade.js) : la taille affichée ici et celle affichée dans l'écran
 *      sortent du même calcul testé ;
 *   6. écrit data/propositions.json — y compris les titres écartés et le motif.
 *
 * Ce que ce script ne fait pas : passer un ordre, promettre un rendement,
 * deviner une cible, ou inventer un prix quand la source ne répond pas.
 */

const fs = require('fs');
const path = require('path');
const TR = require('../js/trade.js');

const RACINE = path.join(__dirname, '..');
const F_SUIVI = path.join(RACINE, 'data', 'suivi.json');
const F_SORTIE = path.join(RACINE, 'data', 'propositions.json');
const UA = 'StockSense/1.0 (balayage quotidien; contact: depot takitmob/stocksense)';
const PAUSE_MS = 250;

const lire = (o) => TR.trNum(o);

function aujourdHui() {
  return new Date().toISOString().slice(0, 10);
}
function pause(ms) { return new Promise((r) => setTimeout(r, ms)); }

// ── Données de marché (côté serveur : aucune contrainte CORS) ──────────────
async function bougies(symbole) {
  const url = 'https://query1.finance.yahoo.com/v8/finance/chart/' + encodeURIComponent(symbole)
    + '?range=1y&interval=1d';
  for (let essai = 1; essai <= 3; essai++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const j = await r.json();
      const res = j && j.chart && j.chart.result && j.chart.result[0];
      if (!res || !res.timestamp || !res.indicators || !res.indicators.quote) {
        throw new Error('réponse sans séries');
      }
      const q = res.indicators.quote[0];
      const lignes = [];
      for (let i = 0; i < res.timestamp.length; i++) {
        const c = q.close ? q.close[i] : null;
        if (c === null || c === undefined || !isFinite(c)) continue;   // séance incomplète : on saute
        lignes.push({
          t: res.timestamp[i],
          o: isFinite(q.open[i]) ? q.open[i] : null,
          h: isFinite(q.high[i]) ? q.high[i] : null,
          l: isFinite(q.low[i]) ? q.low[i] : null,
          c: c,
          v: isFinite(q.volume[i]) ? q.volume[i] : null,
        });
      }
      if (lignes.length < 60) throw new Error('historique trop court (' + lignes.length + ' séances)');
      return {
        symbole: symbole,
        devise: (res.meta && res.meta.currency) || null,
        place: (res.meta && res.meta.fullExchangeName) || null,
        derniereSeance: (res.meta && res.meta.regularMarketTime) || ligne_t(lignes),
        lignes: lignes,
      };
    } catch (e) {
      if (essai === 3) throw e;
      await pause(400 * essai);
    }
  }
  function ligne_t(l) { return l.length ? l[l.length - 1].t : null; }
}

// ── Indicateurs (mêmes définitions que js/quotes.js côté app) ──────────────
function mm(valeurs, n) {
  if (valeurs.length < n) return NaN;
  let s = 0;
  for (let i = valeurs.length - n; i < valeurs.length; i++) s += valeurs[i];
  return s / n;
}
function rsi(clotures, n) {
  if (clotures.length < n + 1) return NaN;
  let gains = 0, pertes = 0;
  for (let i = clotures.length - n; i < clotures.length; i++) {
    const d = clotures[i] - clotures[i - 1];
    if (d >= 0) gains += d; else pertes -= d;
  }
  const mg = gains / n, mp = pertes / n;
  if (mp === 0) return 100;
  return 100 - 100 / (1 + mg / mp);
}
function atr(lignes, n) {
  if (lignes.length < n + 1) return NaN;
  let s = 0;
  for (let i = lignes.length - n; i < lignes.length; i++) {
    const L = lignes[i], P = lignes[i - 1];
    const tr = Math.max(L.h - L.l, Math.abs(L.h - P.c), Math.abs(L.l - P.c));
    s += tr;
  }
  return s / n;
}
function indicateurs(b) {
  const clotures = b.lignes.map((l) => l.c);
  const cours = clotures[clotures.length - 1];
  const precedent = clotures[clotures.length - 2];
  const bas10 = b.lignes.slice(-10).reduce((m, l) => Math.min(m, l.l), Infinity);
  return {
    cours: cours,
    cours_precedent: precedent,
    variation_pct: ((cours - precedent) / precedent) * 100,
    rsi14: rsi(clotures, 14),
    mm50: mm(clotures, 50),
    mm200: mm(clotures, 200),
    atr14: atr(b.lignes, 14),
    plus_bas_10: bas10,
    seances: b.lignes.length,
  };
}

// ── La règle mécanique, écrite une fois, lisible et auditable ─────────────
const TENDANCE_OK = (i) => isFinite(i.mm200) && i.cours > i.mm200;
const REPLI_OK = (i, seuil) => isFinite(i.rsi14) && i.rsi14 < seuil;
const TENUE_OK = (i) => isFinite(i.mm50) && i.cours > i.mm50 * 0.96;
const RISQUE_MAX_PCT = 10;      // au-delà, la position devient trop petite pour valoir la peine

/* Le seuil de RSI est le principal réglage de la méthode, et il se paie :
 *   bas (45)  -> entrée sur repli franc : peu de propositions, qualité espérée
 *                meilleure, mais des semaines sans rien ;
 *   haut (55) -> entrée en tendance : plus d'occasions, plus de faux départs.
 * Il se règle dans data/suivi.json (regles.rsi_seuil). Aucune des deux valeurs
 * n'est « prouvée meilleure » : c'est justement ce que le journal doit mesurer. */
function evaluer(i, seuil) {
  if (!TENDANCE_OK(i)) return { etat: 'attendre', raison: 'sous la moyenne 200 séances — fond non haussier' };
  if (!TENUE_OK(i)) return { etat: 'attendre', raison: 'cours sous la moyenne 50 × 0,96 — chute en cours' };
  if (!REPLI_OK(i, seuil)) {
    // Tendance haussière mais prix tendu : ce n'est pas une proposition, c'est une
    // surveillance — et on dit à quel niveau la règle se remettrait à regarder.
    const repli = Math.min(i.mm50, i.cours - i.atr14);
    return {
      etat: 'surveiller',
      raison: 'RSI(14) à ' + i.rsi14.toFixed(0) + ' — au-dessus du seuil de ' + seuil
            + ' : la tendance est bonne, le prix est tendu',
      prix_de_repli: repli,
      ecart_repli_pct: 100 * (i.cours - repli) / i.cours,
    };
  }
  const entree = i.cours;
  const stop = i.plus_bas_10 - 0.25 * i.atr14;
  if (!(stop > 0) || !(entree > stop)) return { etat: 'attendre', raison: 'stop inexploitable (données de volatilité douteuses)' };
  const ecartPct = 100 * (entree - stop) / entree;
  if (ecartPct > RISQUE_MAX_PCT) {
    return { etat: 'attendre', raison: 'stop à ' + ecartPct.toFixed(1) + ' % — trop volatil pour un compte de cette taille' };
  }
  return {
    etat: 'proposition',
    regle: 'cours > MM200, RSI(14) < ' + seuil + ', cours > MM50 × 0,96',
    entree: entree,
    stop: stop,
    cible: entree + 2 * (entree - stop),
    ecart_stop_pct: ecartPct,
  };
}

// ── Balayage ──────────────────────────────────────────────────────────────
async function main() {
  const suivi = JSON.parse(fs.readFileSync(F_SUIVI, 'utf8'));
  const regles = Object.assign({}, TR.TR_REGLES_DEFAUT, suivi.regles || {});
  const capital = lire(suivi.capital);
  const seuilRsi = lire(regles.rsi_seuil) > 0 ? lire(regles.rsi_seuil) : 55;
  const titres = suivi.titres || [];
  const propositions = [];
  const ecartes = [];
  const observation = [];

  for (const entree of titres) {
    const sym = entree.symbole;
    let b;
    try {
      b = await bougies(sym);
    } catch (e) {
      ecartes.push({ symbole: sym, nom: entree.nom || sym, raison: 'données indisponibles : ' + e.message });
      await pause(PAUSE_MS);
      continue;
    }
    const i = indicateurs(b);
    const ev = evaluer(i, seuilRsi);
    const place = entree.place || (b.place || null);
    const fraisPct = entree.fraisPct !== undefined ? lire(entree.fraisPct)
      : (String(place || '').toUpperCase().indexOf('TOR') >= 0 ? 0 : 1.5);
    const mesures = {
      symbole: sym, nom: entree.nom || sym, place: place, devise: b.devise,
      cours: +i.cours.toFixed(4), variation_pct: +i.variation_pct.toFixed(2),
      rsi14: +i.rsi14.toFixed(1), mm50: +i.mm50.toFixed(2), mm200: +i.mm200.toFixed(2),
      atr14: +i.atr14.toFixed(4), plus_bas_10: +i.plus_bas_10.toFixed(2),
      seances: i.seances, derniere_seance: b.derniereSeance,
      fraisPct: fraisPct,
      au_dessus_mm200: TENDANCE_OK(i), rsi_sous_seuil: REPLI_OK(i, seuilRsi), seuil_rsi: seuilRsi,
    };
    observation.push(mesures);

    if (ev.etat !== 'proposition') {
      const ligne = { symbole: sym, nom: mesures.nom, place: place, etat: ev.etat,
                      raison: ev.raison, indicateurs: mesures };
      if (ev.etat === 'surveiller') {
        ligne.prix_de_repli = +ev.prix_de_repli.toFixed(4);
        ligne.ecart_repli_pct = +ev.ecart_repli_pct.toFixed(2);
        // ce que donnerait le dimensionnement SI le repli avait lieu — sans l'engager
        if (isFinite(ligne.prix_de_repli) && ligne.prix_de_repli < mesures.cours) {
          const essai = Object.assign({}, ligne, {
            sens: 'achat', entree: ligne.prix_de_repli, stop: mesures.plus_bas_10 - 0.25 * mesures.atr14,
            cible: ligne.prix_de_repli + 2 * (ligne.prix_de_repli - (mesures.plus_bas_10 - 0.25 * mesures.atr14)),
            capital: capital, risquePct: lire(regles.risquePct), comm: lire(regles.comm),
            fraisPct: fraisPct, fractionnaire: !!regles.fractionnaire,
            plafondLignePct: lire(regles.plafondLignePct),
          });
          const c = TR.trCalculer(essai);
          if (c.ok) {
            ligne.calcul_si_repli = {
              qte: c.qte, montant: c.montant, risqueReel: c.risqueReel,
              pertePct: c.pertePct, rr: c.rr, fraisAR: c.fraisAR,
            };
          }
        }
      }
      propositions.push(ligne);
      await pause(PAUSE_MS);
      continue;
    }

    const prop = {
      symbole: sym, nom: mesures.nom, place: place, sens: 'achat',
      entree: +ev.entree.toFixed(4), stop: +ev.stop.toFixed(4), cible: +ev.cible.toFixed(4),
      capital: capital, risquePct: lire(regles.risquePct), comm: lire(regles.comm),
      fraisPct: fraisPct, fractionnaire: !!regles.fractionnaire,
      plafondLignePct: lire(regles.plafondLignePct),
      regle: ev.regle, etat: 'propose', mode: 'papier',
      indicateurs: mesures,
      ecart_stop_pct: +ev.ecart_stop_pct.toFixed(2),
    };
    prop.calcul = TR.trCalculer(prop);
    const v = TR.trValider(prop, Object.assign({}, regles, { risquePct: lire(regles.risquePct) }),
      { halte: false, positionsOuvertes: 0, perteJour: 0, capital: capital });
    prop.verdict = v;
    if (!v.ok) { prop.etat = 'refuse'; prop.motifs = v.motifs; }
    propositions.push(prop);
    await pause(PAUSE_MS);
  }

  const sortie = {
    genere: new Date().toISOString(),
    jour: aujourdHui(),
    source: 'Yahoo Finance (chart API, clôtures quotidiennes ajustées non retraitées) — lu côté serveur, hors contrainte CORS',
    methode: 'tendance + repli + tenue ; stop derrière le plus bas des 10 séances ; cible = 2 × le risque. '
           + 'Règle mécanique, aucune prévision : le but est de mesurer, pas de deviner.',
    avertissement: 'Ceci est une proposition en mode PAPIER. Aucun ordre n\'est transmis par StockSense. '
                 + 'Aucun rendement n\'est promis.',
    compte: { capital: capital, regles: regles },
    resume: {
      titres_suivis: titres.length,
      propositions_conformes: propositions.filter((p) => p.etat === 'propose').length,
      refusees_par_les_regles: propositions.filter((p) => p.etat === 'refuse').length,
      sous_surveillance: propositions.filter((p) => p.etat === 'surveiller').length,
      en_attente: propositions.filter((p) => p.etat === 'attendre').length,
      donnees_indisponibles: ecartes.length,
    },
    propositions: propositions,
    donnees_indisponibles: ecartes,
  };
  fs.writeFileSync(F_SORTIE, JSON.stringify(sortie, null, 2) + '\n');

  console.log('jour ' + sortie.jour + ' · capital ' + capital + ' $ · ' + titres.length + ' titres suivis');
  console.log('  conformes : ' + sortie.resume.propositions_conformes
    + ' | refusées : ' + sortie.resume.refusees_par_les_regles
    + ' | sous surveillance : ' + sortie.resume.sous_surveillance
    + ' | en attente : ' + sortie.resume.en_attente
    + ' | données manquantes : ' + sortie.resume.donnees_indisponibles);
  propositions.forEach((p) => {
    if (p.etat === 'propose') {
      console.log('  ✓ ' + p.symbole + ' · ' + TR.trFmt(p.calcul.qte, 4) + ' part · '
        + TR.trDev(p.calcul.montant) + ' · risque ' + TR.trDev(p.calcul.risqueReel)
        + ' (' + TR.trFmt(p.calcul.pertePct, 2) + ' %) · R:R ' + TR.trFmt(p.calcul.rr, 2)
        + ' · frais ' + TR.trDev(p.calcul.fraisAR));
    } else if (p.etat === 'refuse') {
      console.log('  ✗ ' + p.symbole + ' · refusée : ' + p.motifs.join(' '));
    } else if (p.etat === 'surveiller') {
      console.log('  ~ ' + p.symbole + ' · surveillance : repli de ' + TR.trFmt(p.ecart_repli_pct, 1)
        + ' % vers ' + TR.trDev(p.prix_de_repli) + (p.calcul_si_repli
          ? ' (donnerait ' + TR.trFmt(p.calcul_si_repli.qte, 4) + ' part · '
            + TR.trDev(p.calcul_si_repli.montant) + ')' : ''));
    }
  });
  ecartes.forEach((e) => console.log('  ? ' + e.symbole + ' · ' + e.raison));
}

main().catch((e) => { console.error('balayage interrompu :', e); process.exit(1); });
