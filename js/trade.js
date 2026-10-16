'use strict';

/* ── MODE TRADE — POSTE DE DÉCISION ─────────────────────────────────────
 *
 * Cette page ne passe AUCUN ordre. Elle transforme une intention (« SHOP,
 * achat, entrée 142,30, stop 137,50 ») en un ticket complet et vérifié :
 * quantité calculée depuis le risque, frais réels, seuil de couverture,
 * ratio gain/risque, et refus explicite quand une règle est violée.
 *
 * Le dimensionnement n'est PAS laissé au jugement du modèle ni à l'humeur
 * du moment : c'est une division. Toute la logique de calcul ci-dessous est
 * pure et testable (voir tests-node.js) ; le DOM n'est touché qu'au init().
 *
 * Ce qui reste dehors, volontairement : aucune clé d'API, aucun identifiant
 * de courtier, aucun accès réseau. Le ticket est copié à la main vers le
 * courtier ou vers l'agent, et c'est un humain qui approuve.
 */

// ── RÈGLES PAR DÉFAUT (modifiables dans l'interface) ──────────────────────
const TR_REGLES_DEFAUT = {
  risquePct: 1.0,          // % du capital risqué par position (jusqu'au stop)
  plafondLignePct: 25,     // % du capital maximum sur une seule ligne
  maxPositions: 5,         // positions ouvertes simultanées
  perteJourPct: 3.0,       // perte réalisée dans la journée -> halte
  comm: 4.95,              // commission par transaction (Questrade : 4,95-9,95 $)
  devise: '$',
};

const TR_ETATS = {
  propose:  'proposé',
  approuve: 'approuvé',
  execute:  'exécuté',
  clos:     'clos',
  refuse:   'refusé',
};

// ── ENTRÉES : nombres « à la française » ──────────────────────────────────
function trNum(v) {
  if (typeof v === 'number') return isFinite(v) ? v : NaN;
  if (v === null || v === undefined) return NaN;
  const s = String(v).replace(/[\s\u00A0\u202F$€%]/g, '').replace(',', '.');
  if (s === '') return NaN;
  const n = Number(s);
  return isFinite(n) ? n : NaN;
}

function trFmt(n, dec) {
  if (typeof n !== 'number' || !isFinite(n)) return '—';
  dec = (dec === undefined) ? 2 : dec;
  const neg = n < 0;
  const p = Math.abs(n).toFixed(dec).split('.');
  p[0] = p[0].replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return (neg ? '-' : '') + p[0] + (p[1] ? ',' + p[1] : '');
}

function trDev(n, dec) {
  return trFmt(n, dec) + ' ' + TR_REGLES_DEFAUT.devise;
}

// ── LE CALCUL ─────────────────────────────────────────────────────────────
/* Le risque est borné par trois choses, dans cet ordre :
 *   1. le % de capital risqué (taille « théorique »),
 *   2. le plafond par ligne (aucune ligne ne domine le compte),
 *   3. l'argent réellement disponible, commission comprise.
 * Les commissions entrent dans le risque : un stop se paie aussi. */
function trCalculer(p) {
  const capital   = trNum(p.capital);
  const entree    = trNum(p.entree);
  const stop      = trNum(p.stop);
  const cible     = trNum(p.cible);
  const risquePct = trNum(p.risquePct);
  const comm      = trNum(p.comm);
  const plafond   = trNum(p.plafondLignePct);

  const out = {
    ok: false, motifs: [], qte: 0, montant: 0, coutTotal: 0,
    risqueUnitaire: NaN, risqueMontant: NaN, risqueReel: NaN, pertePct: NaN,
    gainCible: NaN, rr: NaN, fraisAR: NaN, seuilCouverturePct: NaN, invalidation: NaN,
  };
  if (!isFinite(capital) || capital <= 0) { out.motifs.push('Capital absent ou nul.'); return out; }
  if (!isFinite(entree) || entree <= 0)   { out.motifs.push('Prix d\'entrée absent.'); return out; }
  if (!isFinite(stop) || stop <= 0)       { out.motifs.push('Stop absent : sans prix d\'invalidation, il n\'y a pas de taille.'); return out; }
  if (!isFinite(risquePct) || risquePct <= 0) { out.motifs.push('Risque par trade absent.'); return out; }
  if (!isFinite(comm) || comm < 0)        { out.motifs.push('Commission absente.'); return out; }

  const sens = (p.sens === 'vente') ? 'vente' : 'achat';
  const risqU = (sens === 'achat') ? (entree - stop) : (stop - entree);
  out.risqueUnitaire = risqU;
  out.invalidation = stop;
  if (!(risqU > 0)) {
    out.motifs.push(sens === 'achat'
      ? 'Stop au-dessus ou égal à l\'entrée : sur un achat, le stop doit être plus bas.'
      : 'Stop en dessous ou égal à l\'entrée : sur une vente, le stop doit être plus haut.');
    return out;
  }

  const risqueMontant = capital * risquePct / 100;
  const fraisAR = 2 * comm;                       // une entrée, une sortie : la sortie du stop aussi
  out.fraisAR = fraisAR;
  out.risqueMontant = risqueMontant;

  /* Le budget de risque PAIE les commissions : la taille se calcule donc sur ce
   * qui reste après le péage, sinon la position dépasse le plafond par
   * construction. C'est ici que le mur des frais devient visible : sur un petit
   * compte, les deux commissions peuvent dépasser tout le budget. */
  const budget = risqueMontant - fraisAR;
  if (budget <= 0) {
    out.motifs.push('Le budget de risque (' + trFmt(risqueMontant, 2) + ' = ' + trFmt(risquePct, 2)
      + ' % de ' + trFmt(capital, 0) + ') ne couvre même pas les deux commissions ('
      + trFmt(fraisAR, 2) + ').');
    return out;
  }
  const qBudget = Math.floor(budget / risqU);
  const qPlafond = Math.floor((capital * plafond / 100) / entree);
  let q = Math.min(qBudget, qPlafond);
  while (q > 0 && (q * entree + comm) > capital) q--;   // l'argent disponible tranche en dernier

  if (q <= 0) {
    out.motifs.push('Aucune quantité possible : le capital ne couvre pas une unité de risque après commissions.');
    return out;
  }
  const montant    = q * entree;
  const risqueReel = q * risqU + fraisAR;               // le stop est un ordre : il se paie
  const gainCible  = isFinite(cible) && (sens === 'achat' ? cible > entree : cible < entree)
                     ? q * Math.abs(cible - entree) - fraisAR : NaN;

  out.qte = q;
  out.montant = montant;
  out.coutTotal = montant + comm;
  out.fraisAR = fraisAR;
  out.risqueReel = risqueReel;
  out.pertePct = 100 * risqueReel / capital;
  out.gainCible = gainCible;
  out.rr = isFinite(gainCible) && risqueReel > 0 ? gainCible / risqueReel : NaN;
  out.seuilCouverturePct = 100 * fraisAR / montant;
  out.ok = true;
  return out;
}

// ── GARDE-FOUS ────────────────────────────────────────────────────────────
/* Renvoie {ok, motifs}. Appelée AVANT toute mise au carnet : une proposition
 * refusée est conservée avec ses motifs, pour qu'on puisse relire pourquoi. */
function trValider(prop, regles, etat) {
  const motifs = [];
  regles = regles || TR_REGLES_DEFAUT;
  etat = etat || { halte: false, positionsOuvertes: 0, perteJour: 0, capital: prop.capital };

  if (etat.halte) motifs.push('HALTE active : plus aucune proposition tant qu\'elle n\'est pas levée.');
  const c = prop.calcul || trCalculer(prop);
  if (!c.ok) motifs.push.apply(motifs, c.motifs);

  if (c.ok) {
    if (c.pertePct > trNum(regles.risquePct) + 0.01) {
      // écart entre ce qui est demandé au formulaire et ce qui est inscrit dans les règles :
      // on refuse, et on dit lequel des deux doit céder — pas de dérogation silencieuse.
      const demande = trNum(prop.risquePct);
      motifs.push(isFinite(demande) && demande > trNum(regles.risquePct)
        ? 'Risque demandé (' + trFmt(demande, 2) + ' %) au-dessus de la règle inscrite ('
          + trFmt(regles.risquePct, 2) + ' %). Ramène le risque, ou modifie la règle sciemment.'
        : 'Risque réel ' + trFmt(c.pertePct, 2) + ' % du capital, au-delà de ' + trFmt(regles.risquePct, 2) + ' %.');
    }
    if (!isFinite(trNum(prop.stop))) motifs.push('Pas de stop : refusé sans prix d\'invalidation.');
    // le risque se mesure sur le capital RÉELLEMENT engagé (celui du formulaire),
    // pas sur la valeur mémorisée de l'écran : sinon une saisie à 5 000 $ se ferait
    // refuser à cause d'un ancien capital de 500 $ resté en mémoire.
    const capNum = trNum(prop.capital) > 0 ? trNum(prop.capital) : trNum(etat.capital);
    const perteJourAbs = Math.abs(trNum(etat.perteJour) || 0);
    if (capNum > 0 && 100 * (perteJourAbs + c.risqueReel) / capNum > regles.perteJourPct) {
      motifs.push('Cette position porterait la perte du jour à '
        + trFmt(100 * (perteJourAbs + c.risqueReel) / capNum, 2) + ' % du capital (plafond '
        + trFmt(regles.perteJourPct, 2) + ' %).');
    }
    if (etat.positionsOuvertes >= regles.maxPositions) {
      motifs.push('Déjà ' + etat.positionsOuvertes + ' positions ouvertes (plafond ' + regles.maxPositions + ').');
    }
  }
  return { ok: motifs.length === 0, motifs: motifs };
}

// ── TICKET D'ORDRE : ce qu'on porte au courtier ───────────────────────────
function trOrdreTexte(prop) {
  const c = prop.calcul || trCalculer(prop);
  const d = new Date(prop.ts || Date.now());
  const pad = (n) => (n < 10 ? '0' + n : '' + n);
  const horo = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())
             + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  const lignes = [
    (prop.sens === 'vente' ? 'VENTE' : 'ACHAT') + ' ' + (c.qte || 0) + ' × ' + String(prop.ticker || '').toUpperCase(),
    'Limite : ' + trDev(trNum(prop.entree)) + ' · valide jour',
    'Stop de protection : ' + trDev(trNum(prop.stop)) + '  (invalidation : clôture au-delà)',
  ];
  if (isFinite(trNum(prop.cible))) lignes.push('Objectif : ' + trDev(trNum(prop.cible))
    + (isFinite(c.rr) ? '  (R:R ' + trFmt(c.rr, 2) + ')' : ''));
  lignes.push('Risque : ' + trDev(c.risqueReel) + ' = ' + trFmt(c.pertePct, 2) + ' % du capital');
  lignes.push('Frais aller-retour : ' + trDev(c.fraisAR) + ' · il faut +' + trFmt(c.seuilCouverturePct, 2)
    + ' % juste pour les couvrir');
  lignes.push('— StockSense, proposition du ' + horo + (prop.mode === 'reel' ? '' : ' · MODE PAPIER'));
  return lignes.join('\n');
}

// ── JOURNAL : ce qui a réellement eu lieu ─────────────────────────────────
function trStats(props, jour) {
  const clos = (props || []).filter((p) => p.etat === 'clos' && p.pnl !== undefined && p.pnl !== null);
  const ouverts = (props || []).filter((p) => p.etat === 'execute');
  const gagnants = clos.filter((p) => p.pnl > 0);
  const fraisTotaux = clos.reduce((s, p) => s + (p.calcul ? p.calcul.fraisAR : 0), 0);
  const pnlNet = clos.reduce((s, p) => s + p.pnl, 0);
  const rListe = clos.map((p) => (p.calcul && p.calcul.risqueReel > 0) ? p.pnl / p.calcul.risqueReel : 0);
  const jour_ = jour || new Date().toISOString().slice(0, 10);
  const perteJour = clos
    .filter((p) => new Date(p.ts || 0).toISOString().slice(0, 10) === jour_ && p.pnl < 0)
    .reduce((s, p) => s + p.pnl, 0);
  return {
    trades: clos.length,
    gagnants: gagnants.length,
    perdants: clos.length - gagnants.length,
    tauxReussite: clos.length ? 100 * gagnants.length / clos.length : NaN,
    pnlNet: pnlNet,
    fraisTotaux: fraisTotaux,
    pnlAvantFrais: pnlNet + fraisTotaux,
    rMoyen: rListe.length ? rListe.reduce((a, b) => a + b, 0) / rListe.length : NaN,
    esperanceParTrade: clos.length ? pnlNet / clos.length : NaN,
    perteJour: perteJour,           // valeur négative ou 0
    positionsOuvertes: ouverts.length,
    risqueOuvert: ouverts.reduce((s, p) => s + (p.calcul ? p.calcul.risqueReel : 0), 0),
    engage: ouverts.reduce((s, p) => s + (p.calcul ? p.calcul.montant : 0), 0),
    fraisParGain: gagnants.length && fraisTotaux > 0 ? fraisTotaux / Math.max(1, pnlNet) : NaN,
  };
}

/* Peut-on encore proposer quelque chose aujourd'hui ? Même règle que la
 * validation, vue depuis l'état global : la halte n'est pas un bouton qu'on
 * oublie, la perte du jour la déclenche d'elle-même. */
function trEtatDuJour(props, regles, capital, jour) {
  const s = trStats(props, jour);
  const plafond = -(trNum(capital) * trNum(regles.perteJourPct) / 100);
  return {
    perteJour: s.perteJour,
    plafondPerte: plafond,
    plafondAtteint: s.perteJour <= plafond && s.perteJour < 0,
    positionsOuvertes: s.positionsOuvertes,
    risqueOuvert: s.risqueOuvert,
    engage: s.engage,
  };
}

// ── EXPORT (tests node) ───────────────────────────────────────────────────
const TR_API = {
  TR_REGLES_DEFAUT, TR_ETATS,
  trNum, trFmt, trDev, trCalculer, trValider, trOrdreTexte, trStats, trEtatDuJour,
};
if (typeof window !== 'undefined') window.SS_TRADE_API = TR_API;
if (typeof module !== 'undefined' && module.exports) module.exports = TR_API;

// ── INTERFACE ─────────────────────────────────────────────────────────────
if (typeof document !== 'undefined') {
  (function () {
    const CLE = 'ss_trade_v1';
    let S = charger();
    let dernier = null;   // dernier calcul affiché

    function etatVide() {
      return {
        mode: 'papier', halte: false, capital: 500,
        regles: Object.assign({}, TR_REGLES_DEFAUT),
        propositions: [],
      };
    }
    function charger() {
      try {
        const brut = localStorage.getItem(CLE);
        if (!brut) return etatVide();
        const s = JSON.parse(brut);
        s.regles = Object.assign({}, TR_REGLES_DEFAUT, s.regles || {});
        s.propositions = s.propositions || [];
        return s;
      } catch (e) { return etatVide(); }
    }
    function sauver() {
      try { localStorage.setItem(CLE, JSON.stringify(S)); }
      catch (e) { /* quota ou mode privé : l'écran reste utilisable */ }
    }
    const $ = (id) => document.getElementById(id);

    function etatGlobal(jour) {
      const e = trEtatDuJour(S.propositions, S.regles, S.capital, jour);
      return {
        halte: S.halte || e.plafondAtteint,
        positionsOuvertes: e.positionsOuvertes,
        perteJour: e.perteJour,
        capital: S.capital,
        auto: e.plafondAtteint,
      };
    }

    function rendre() {
      const jour = new Date().toISOString().slice(0, 10);
      const st = trStats(S.propositions, jour);
      const g = etatGlobal(jour);

      // KPI
      $('tr-kpi').innerHTML =
        kpi('Capital suivi', trDev(S.capital, 0), S.mode === 'reel' ? 'mode réel' : 'mode papier', '') +
        kpi('Risque ouvert', trDev(st.risqueOuvert, 0), st.positionsOuvertes + ' position(s)', st.positionsOuvertes ? '' : 'ok') +
        kpi('P&L réalisé', (st.pnlNet >= 0 ? '+' : '') + trDev(st.pnlNet, 2),
            st.trades + ' trade(s) clos', st.trades === 0 ? '' : (st.pnlNet >= 0 ? 'ok' : 'alarme'));

      // mode + halte
      $('tr-mode-papier').className = S.mode === 'papier' ? 'on' : '';
      $('tr-mode-reel').className = S.mode === 'reel' ? 'on' : '';
      $('tr-halte').className = g.halte ? 'on vente' : '';
      const note = [];
      if (g.auto) note.push('Plafond de perte du jour atteint : propositions automatiquement refusées jusqu\'à demain.');
      if (S.halte) note.push('Halte manuelle active.');
      if (S.mode === 'reel') note.push('Mode réel : les tickets produits sont destinés à un compte réel. La page ne transmet toujours rien.');
      $('tr-halte-note').innerHTML = note.join('<br>');

      // règles
      $('tr-r-risque').value = S.regles.risquePct;
      $('tr-r-ligne').value = S.regles.plafondLignePct;
      $('tr-r-pos').value = S.regles.maxPositions;
      $('tr-r-perte').value = S.regles.perteJourPct;
      $('tr-r-comm').value = S.regles.comm;

      // rappel du plafond de risque réellement inscrit dans les règles
      $('tr-risque-note').textContent = 'Plafond inscrit dans les règles : ' + trFmt(S.regles.risquePct, 2)
        + ' % du capital par position. Au-delà, la proposition est refusée — la règle se modifie '
        + 'en bas de page, pas ici.';

      // résultat du dernier calcul
      rendreResultat(g);

      // carnet
      const carnet = S.propositions.slice().reverse();
      $('tr-carnet').innerHTML = carnet.length
        ? carnet.map(carteProposition).join('')
        : '<div class="tr-vide">Aucune proposition. Le carnet se remplit depuis « Calculer et vérifier le risque ».</div>';

      // journal
      $('tr-journal').innerHTML = journalHtml(st);
    }

    function kpi(l, v, s, cls) {
      return '<div class="k ' + (cls || '') + '"><div class="l">' + l + '</div><div class="v">' + v +
             '</div><div class="s">' + s + '</div></div>';
    }

    function rendreResultat(g) {
      if (!dernier) { $('tr-resultat').innerHTML = ''; return; }
      const c = dernier.calcul, v = dernier.verdict;
      const lignes = [];
      lignes.push('<div class="tr-fig">');
      lignes.push(fig('Quantité', c.qte + ' unité(s)'));
      lignes.push(fig('Montant engagé', trDev(c.montant)));
      lignes.push(fig('Risque unitaire', trDev(c.risqueUnitaire)));
      lignes.push(fig('Risque réel (stop + frais)', trDev(c.risqueReel)));
      lignes.push(fig('Soit', trFmt(c.pertePct, 2) + ' % du capital'));
      lignes.push(fig('Frais aller-retour', trDev(c.fraisAR)));
      lignes.push(fig('Seuil de couverture', '+' + trFmt(c.seuilCouverturePct, 2) + ' %'));
      lignes.push(fig('Gain à la cible', isFinite(c.gainCible) ? trDev(c.gainCible) : '—'));
      lignes.push(fig('Ratio gain / risque', isFinite(c.rr) ? trFmt(c.rr, 2) : '—'));
      lignes.push('<div class="pied">Seuil de couverture : la variation qu\'il faut <b>juste</b> pour '
        + 'rembourser les deux commissions, avant le moindre gain.</div>');
      lignes.push('</div>');
      // Si c'est la commission fixe qui rend le plafond de risque intenable, on le dit :
      // c'est une arithmétique de taille de compte, pas une erreur de saisie.
      let avis = '';
      const commPct = 100 * c.fraisAR / trNum(dernier.capital);
      if (!v.ok && isFinite(commPct) && commPct > S.regles.risquePct) {
        avis = 'Les deux commissions pèsent à elles seules ' + trFmt(commPct, 2)
          + ' % du capital : sur un compte de cette taille, aucun plafond de risque à '
          + trFmt(S.regles.risquePct, 2) + ' % n\'est tenable. Titre moins cher, tenue plus longue '
          + '(1 aller-retour par trimestre), ou achat de FNB sans commission.';
      }
      const html = '<div class="tr-verdict"><div class="t ' + (v.ok ? 'yes' : 'no') + '">'
        + (v.ok ? '✓ Proposition conforme aux règles' : '✗ Refusée par les règles')
        + '</div>'
        + (v.motifs.length ? '<ul>' + v.motifs.map((m) => '<li>' + m + '</li>').join('') + '</ul>' : '')
        + (avis ? '<div class="tr-note" style="margin-top:8px;color:var(--mu)"><b>Lecture :</b> ' + avis + '</div>' : '')
        + lignes.join('')
        + (c.ok ? '<div class="tr-copier" id="tr-ticket">' + echapper(trOrdreTexte(dernier)) + '</div>' : '')
        + '</div>';
      $('tr-resultat').innerHTML = html;
      const actions = document.createElement('div');
      actions.className = 'tr-duo';
      actions.style.marginBottom = '11px';
      actions.innerHTML = '<button class="tr-btn" id="tr-ajouter"' + (v.ok && !g.halte ? '' : ' disabled')
        + '>Mettre au carnet</button>'
        + (c.ok ? '<button class="tr-btn gris" id="tr-copier">Copier le ticket</button>' : '');
      $('tr-resultat').appendChild(actions);
      const aj = $('tr-ajouter');
      if (aj) aj.onclick = ajouter;
      const cp = $('tr-copier');
      if (cp) cp.onclick = copier;
    }

    function fig(l, v) { return '<div><span>' + l + '</span><b>' + v + '</b></div>'; }
    function echapper(s) {
      return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    function carteProposition(p) {
      const c = p.calcul || {};
      const lignes = [];
      lignes.push('<div class="l">' + (p.sens === 'vente' ? 'Vente' : 'Achat') + ' ' + c.qte + ' × '
        + trDev(trNum(p.entree)) + ' · stop ' + trDev(trNum(p.stop))
        + (isFinite(trNum(p.cible)) ? ' · cible ' + trDev(trNum(p.cible)) : '') + '</div>');
      lignes.push('<div class="l">Risque ' + trDev(c.risqueReel) + ' (' + trFmt(c.pertePct, 2)
        + ' %) · frais ' + trDev(c.fraisAR) + (isFinite(c.rr) ? ' · R:R ' + trFmt(c.rr, 2) : '') + '</div>');
      if (p.etat === 'clos') {
        lignes.push('<div class="l">Sortie ' + trDev(trNum(p.prixSortie)) + ' · <b style="color:'
          + (p.pnl >= 0 ? 'var(--gr)' : 'var(--re)') + '">' + (p.pnl >= 0 ? '+' : '') + trDev(p.pnl)
          + '</b> net de frais</div>');
      }
      if (p.motifs && p.motifs.length) {
        lignes.push('<div class="l" style="color:var(--re)">' + p.motifs.map(echapper).join('<br>') + '</div>');
      }
      const a = [];
      if (p.etat === 'propose') {
        a.push('<button data-id="' + p.id + '" data-act="approuve">Approuver</button>');
        a.push('<button class="sup" data-id="' + p.id + '" data-act="refuse">Écarter</button>');
      }
      if (p.etat === 'approuve') a.push('<button data-id="' + p.id + '" data-act="execute">Exécuté…</button>');
      if (p.etat === 'execute') {
        a.push('<button data-id="' + p.id + '" data-act="clos">Clôturer…</button>');
        a.push('<button data-id="' + p.id + '" data-act="ticket">Copier</button>');
      }
      if (p.etat === 'clos' || p.etat === 'refuse') a.push('<button class="sup" data-id="' + p.id + '" data-act="suppr">Retirer</button>');
      return '<div class="tr-carte"><div class="h"><span class="tk">' + echapper(p.ticker) + '</span>'
        + '<span class="et ' + p.etat + '">' + (TR_ETATS[p.etat] || p.etat) + '</span></div>'
        + lignes.join('') + (a.length ? '<div class="a">' + a.join('') + '</div>' : '') + '</div>';
    }

    function journalHtml(st) {
      const l = [];
      l.push(fig('Trades clos', String(st.trades)));
      l.push(fig('Gagnants / perdants', st.gagnants + ' / ' + st.perdants));
      l.push(fig('Taux de réussite', isFinite(st.tauxReussite) ? trFmt(st.tauxReussite, 0) + ' %' : '—'));
      l.push(fig('R moyen', isFinite(st.rMoyen) ? trFmt(st.rMoyen, 2) : '—'));
      l.push(fig('P&L net', (st.pnlNet >= 0 ? '+' : '') + trDev(st.pnlNet)));
      l.push(fig('Frais payés', trDev(st.fraisTotaux)));
      l.push(fig('P&L avant frais', (st.pnlAvantFrais >= 0 ? '+' : '') + trDev(st.pnlAvantFrais)));
      l.push(fig('Espérance par trade', isFinite(st.esperanceParTrade) ? trDev(st.esperanceParTrade) : '—'));
      return '<div class="tr-fig">' + l.join('') + '<div class="pied">La ligne qui compte : les frais payés, '
        + 'face au P&L avant frais. Si l\'écart est proche du résultat, la méthode ne gagne rien — '
        + 'c\'est le courtier qui gagne.</div></div>';
    }

    // ── Actions ───────────────────────────────────────────────────────────
    function lireFormulaire() {
      const sens = (document.querySelector('#tr-sens button.on') || {}).dataset;
      return {
        ticker: ($('tr-ticker').value || '').trim().toUpperCase(),
        sens: sens ? sens.sens : 'achat',
        entree: $('tr-entree').value,
        stop: $('tr-stop').value,
        cible: $('tr-cible').value,
        capital: $('tr-capital').value || S.capital,
        risquePct: $('tr-risque').value || S.regles.risquePct,
        comm: S.regles.comm,
        plafondLignePct: S.regles.plafondLignePct,
      };
    }

    function calculer() {
      const p = lireFormulaire();
      if (!p.ticker) { alert('Entre un titre.'); return; }
      const calcul = trCalculer(p);
      const verdict = trValider({ ticker: p.ticker, sens: p.sens, entree: p.entree, stop: p.stop,
        cible: p.cible, capital: p.capital, risquePct: trNum(p.risquePct), mode: S.mode,
        calcul: calcul }, S.regles, etatGlobal());
      dernier = { id: 'p' + Date.now(), ts: Date.now(), mode: S.mode,
        ticker: p.ticker, sens: p.sens, entree: trNum(p.entree), stop: trNum(p.stop),
        cible: trNum(p.cible), capital: trNum(p.capital), risquePct: trNum(p.risquePct),
        calcul: calcul, verdict: verdict, etat: verdict.ok ? 'propose' : 'refuse', motifs: verdict.motifs };
      rendre();
      $('tr-resultat').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    function ajouter() {
      if (!dernier) return;
      S.propositions.push(dernier);
      if (dernier.calcul && isFinite(dernier.capital)) S.capital = dernier.capital;
      dernier = null;
      sauver(); rendre();
    }

    function copier() {
      const t = trOrdreTexte(dernier);
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(t).then(
          () => { const b = $('tr-copier'); if (b) { b.textContent = '✓ Copié'; setTimeout(() => { b.textContent = 'Copier le ticket'; }, 1600); } },
          () => window.prompt('Copie le ticket :', t));
      } else { window.prompt('Copie le ticket :', t); }
    }

    function agir(id, act) {
      const p = S.propositions.filter((x) => x.id === id)[0];
      if (!p) return;
      if (act === 'approuve') p.etat = 'approuve';
      if (act === 'refuse')   p.etat = 'refuse';
      if (act === 'suppr')    S.propositions = S.propositions.filter((x) => x.id !== id);
      if (act === 'execute') {
        const v = window.prompt('Prix d\'exécution réel :', String(trNum(p.entree)));
        if (v === null) return;
        const px = trNum(v);
        if (!isFinite(px) || px <= 0) { alert('Prix invalide.'); return; }
        p.prixExecution = px; p.etat = 'execute';
      }
      if (act === 'clos') {
        const v = window.prompt('Prix de sortie :');
        if (v === null) return;
        const px = trNum(v);
        if (!isFinite(px) || px <= 0) { alert('Prix invalide.'); return; }
        p.prixSortie = px;
        const entree = isFinite(p.prixExecution) ? p.prixExecution : trNum(p.entree);
        p.pnl = (p.sens === 'vente' ? (entree - px) : (px - entree)) * p.calcul.qte - p.calcul.fraisAR;
        p.etat = 'clos';
      }
      if (act === 'ticket') { dernier = p; copier(); }
      sauver(); rendre();
    }

    function init() {
      $('tr-capital').value = S.capital;
      $('tr-risque').value = S.regles.risquePct;

      $('tr-calc').onclick = calculer;
      $('tr-copier');

      Array.prototype.forEach.call(document.querySelectorAll('#tr-sens button'), (b) => {
        b.onclick = function () {
          Array.prototype.forEach.call(document.querySelectorAll('#tr-sens button'), (x) => { x.className = ''; });
          b.className = 'on' + (b.dataset.sens === 'vente' ? ' vente' : '');
        };
      });

      $('tr-mode-papier').onclick = function () { S.mode = 'papier'; sauver(); rendre(); };
      $('tr-mode-reel').onclick = function () {
        if (S.mode === 'reel') return;
        if (window.confirm('Passer en mode réel ? La page ne transmettra toujours aucun ordre : '
          + 'elle étiquetera simplement les tickets comme destinés à un compte réel.')) {
          S.mode = 'reel'; sauver(); rendre();
        }
      };
      $('tr-halte').onclick = function () { S.halte = !S.halte; sauver(); rendre(); };

      $('tr-r-sauv').onclick = function () {
        const r = {
          risquePct: trNum($('tr-r-risque').value), plafondLignePct: trNum($('tr-r-ligne').value),
          maxPositions: Math.max(1, Math.round(trNum($('tr-r-pos').value))),
          perteJourPct: trNum($('tr-r-perte').value), comm: trNum($('tr-r-comm').value),
          devise: TR_REGLES_DEFAUT.devise,
        };
        Object.keys(r).forEach((k) => { if (!isFinite(r[k])) delete r[k]; });
        S.regles = Object.assign({}, S.regles, r);
        $('tr-risque').value = S.regles.risquePct;   // le formulaire suit la règle, pas l'inverse
        sauver(); rendre();
      };

      $('tr-vider').onclick = function () {
        if (window.confirm('Effacer tout le carnet et le journal ? Cette action ne vide rien chez le courtier.')) {
          S.propositions = []; S.halte = false; sauver(); rendre();
        }
      };

      document.addEventListener('click', function (ev) {
        const b = ev.target.closest ? ev.target.closest('#tr-carnet button[data-act]') : null;
        if (b) agir(b.dataset.id, b.dataset.act);
      });

      rendre();
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
  })();
}
