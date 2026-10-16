'use strict';
/* Harnais des fonctions pures du mode Trade — exécuté avec node, sans DOM.
 *   node tests/trade-tests.js
 * Aucun test ne touche le réseau ni le navigateur : uniquement du calcul. */

const T = require('../js/trade.js');

let n = 0, echecs = 0;
function ok(nom, cond, detail) {
  n++;
  if (cond) { console.log('  ok   ' + nom); }
  else { echecs++; console.log('  ÉCHEC ' + nom + (detail !== undefined ? '  -> ' + JSON.stringify(detail) : '')); }
}
function egal(nom, obtenu, attendu) {
  const a = JSON.stringify(obtenu), b = JSON.stringify(attendu);
  ok(nom, a === b, { obtenu: obtenu, attendu: attendu });
}
const proche = (a, b, tol) => Math.abs(a - b) <= (tol === undefined ? 1e-6 : tol);

console.log('\n— Lecture des nombres');
egal('virgule décimale', T.trNum('142,30'), 142.3);
egal('espace de milliers', T.trNum('1 250,50'), 1250.5);
egal('espace insécable + $', T.trNum('4\u00A0095,25 $'), 4095.25);
egal('entier', T.trNum('12'), 12);
ok('vide -> NaN', isNaN(T.trNum('')), T.trNum(''));
ok('texte -> NaN', isNaN(T.trNum('abc')), T.trNum('abc'));

console.log('\n— Formatage');
egal('milliers + décimale', T.trFmt(1234.5), '1 234,50');
egal('négatif', T.trFmt(-9.9), '-9,90');
egal('zéro décimale', T.trFmt(1500, 0), '1 500');
egal('valeur absente', T.trFmt(NaN), '—');

console.log('\n— Dimensionnement : trois bornes, dans l\'ordre');
const base = { capital: 5000, risquePct: 1, entree: 142.30, stop: 137.50, cible: 155, comm: 4.95, plafondLignePct: 25, sens: 'achat' };
let c = T.trCalculer(base);
ok('calcul valide', c.ok, c.motifs);
egal('risque monétaire = 1 % de 5 000', c.risqueMontant, 50);
ok('risque unitaire = 4,80', proche(c.risqueUnitaire, 4.8), c.risqueUnitaire);
egal('quantité bornée par le plafond de ligne (8)', c.qte, 8);
ok('le budget de risque contient les commissions (jamais dépassé)', c.risqueReel <= c.risqueMontant, c);
// la formule naïve (risque / écart) donnerait 10 : le péage est retiré AVANT de diviser
const naif = T.trCalculer(Object.assign({}, base, { entree: 100, stop: 95 }));
egal('le péage est retiré avant de diviser (8 au lieu de 10)', naif.qte, 8);
ok('et le budget reste tenu', naif.risqueReel <= naif.risqueMontant, naif);
ok('montant = 8 × 142,30', proche(c.montant, 1138.4), c.montant);
ok('frais aller-retour = 9,90', proche(c.fraisAR, 9.9), c.fraisAR);
ok('le risque inclut les deux commissions', proche(c.risqueReel, 8 * 4.8 + 9.9), c.risqueReel);
ok('perte réelle < 1 % du capital (les frais compris)', c.pertePct < 1, c.pertePct);
ok('seuil de couverture des frais ≈ 0,87 %', proche(c.seuilCouverturePct, 100 * 9.9 / 1138.4, 1e-9), c.seuilCouverturePct);
ok('R:R ≈ 1,90', proche(c.rr, (8 * 12.7 - 9.9) / (8 * 4.8 + 9.9), 1e-9), c.rr);

console.log('\n— Le cas qui compte : un petit compte ne peut pas copier un gros');
let petit = T.trCalculer(Object.assign({}, base, { capital: 500 }));
egal('500 $, titre à 142 $, risque 1 % -> aucune unité possible', petit.qte, 0);
ok('et le motif nomme les commissions', petit.motifs.join(' ').indexOf('ne couvre même pas les deux commissions') > 0, petit.motifs);
// le mur des frais, en une assertion : à 1 % de risque sur 500 $, le budget (5 $)
// est inférieur au péage (9,90 $) — AUCUN titre, à AUCUN prix, ne peut passer.
let petitBas = T.trCalculer(Object.assign({}, base, { capital: 500, entree: 1.00, stop: 0.99, cible: 1.20 }));
egal('et ce n\'est pas une question de prix du titre', petitBas.ok, false);
// en relevant le risque par trade à 3 %, la même somme autorise une position
let petit2 = T.trCalculer(Object.assign({}, base, { capital: 500, risquePct: 3, entree: 12.40, stop: 11.90, cible: 14.00 }));
ok('risque 3 % : la quantité existe', petit2.ok && petit2.qte > 0, petit2);
egal('500 $ / 3 % / stop à 0,50 -> 10 unités (budget 5,10 moins le péage)', petit2.qte, 10);
ok('le plafond de ligne (25 %) reste respecté', petit2.montant <= 500 * 0.25, petit2.montant);
ok('et le risque réel tient dans le budget', petit2.risqueReel <= 500 * 0.03, petit2);
let moyen = T.trCalculer(Object.assign({}, base, { capital: 2000, entree: 12.40, stop: 11.90, cible: 14.00 }));
egal('2 000 $ / 1 % / stop à 0,50 -> 20 unités (le péage rogne la taille)', moyen.qte, 20);

console.log('\n— Sens, stop et invalidation');
let v = T.trCalculer(Object.assign({}, base, { sens: 'vente', entree: 100, stop: 106, cible: 88 }));
ok('vente : stop au-dessus, cohérent', v.ok, v.motifs);
let ko = T.trCalculer(Object.assign({}, base, { entree: 100, stop: 104 }));
ok('achat avec stop au-dessus de l\'entrée -> refus', !ko.ok, ko.motifs);
ok('motif explicite', ko.motifs.join(' ').indexOf('plus bas') > 0, ko.motifs);
let sansStop = T.trCalculer(Object.assign({}, base, { stop: '' }));
ok('sans stop, pas de taille', !sansStop.ok, sansStop.motifs);

console.log('\n— Garde-fous');
// Les garde-fous sont éprouvés avec un courtier à commission fixe et parts entières :
// c'est le cas le plus tendu pour le budget de risque, et il garde des chiffres lisibles.
const regl = Object.assign({}, T.TR_REGLES_DEFAUT, { comm: 4.95, fraisPct: 0, fractionnaire: false });
const prop = { ticker: 'SHOP', sens: 'achat', entree: 142.30, stop: 137.50, cible: 155, capital: 5000 };
prop.calcul = T.trCalculer(Object.assign({ plafondLignePct: regl.plafondLignePct, comm: regl.comm,
  fraisPct: 0, fractionnaire: false, risquePct: regl.risquePct }, prop));
ok('proposition nominale acceptée', T.trValider(prop, regl, { halte: false, positionsOuvertes: 0, perteJour: 0, capital: 5000 }).ok);
ok('halte -> refus', !T.trValider(prop, regl, { halte: true, positionsOuvertes: 0, perteJour: 0, capital: 5000 }).ok);
ok('plafond de positions -> refus',
   !T.trValider(prop, regl, { halte: false, positionsOuvertes: regl.maxPositions, perteJour: 0, capital: 5000 }).ok);
// régression : une saisie à 5 000 $ ne doit pas être jugée sur les 500 $ mémorisés par l'écran
ok('le capital du formulaire fait foi, pas celui de l\'écran (régression)',
   T.trValider(prop, regl, { halte: false, positionsOuvertes: 0, perteJour: 0, capital: 500 }).ok,
   T.trValider(prop, regl, { halte: false, positionsOuvertes: 0, perteJour: 0, capital: 500 }).motifs);
// aucun contournement silencieux : demander 3 % quand la règle dit 1 % est refusé, et nommé
const prop3 = { ticker: 'AC.TO', sens: 'achat', entree: 12.40, stop: 11.90, cible: 14.00, capital: 2000, risquePct: 3 };
prop3.calcul = T.trCalculer(Object.assign({ comm: regl.comm, fraisPct: 0, fractionnaire: false,
  plafondLignePct: regl.plafondLignePct }, prop3));
ok('risque demandé (3 %) > règle inscrite (1 %) -> refus', !T.trValider(prop3, regl, { halte: false, positionsOuvertes: 0, perteJour: 0, capital: 2000 }).ok);
ok('et le motif nomme la règle',
   T.trValider(prop3, regl, { halte: false, positionsOuvertes: 0, perteJour: 0, capital: 2000 }).motifs.join(' ').indexOf('règle inscrite') > 0);
ok('la même chose avec la règle à 3 % passe',
   T.trValider(prop3, Object.assign({}, regl, { risquePct: 3 }), { halte: false, positionsOuvertes: 0, perteJour: 0, capital: 2000 }).ok);
ok('perte du jour proche du plafond -> refus',
   !T.trValider(prop, regl, { halte: false, positionsOuvertes: 0, perteJour: -145, capital: 5000 }).ok);

console.log('\n— Wealthsimple : parts fractionnaires et frais de conversion');
const ws = { capital: 100, risquePct: 1, entree: 279.01, stop: 265.05, cible: 306.93,
             comm: 0, fraisPct: 0, fractionnaire: true, plafondLignePct: 25, sens: 'achat' };
let w = T.trCalculer(ws);
ok('100 $ / 1 % : la position existe (0 $ de commission)', w.ok, w.motifs);
ok('quantité fractionnaire sous l\'unité', w.qte > 0 && w.qte < 1, w.qte);
ok('4 décimales, pas plus', Math.abs(w.qte * 10000 - Math.round(w.qte * 10000)) < 1e-9, w.qte);
ok('le risque réel tient dans le budget de 1 $', w.risqueReel <= 1.0001, w.risqueReel);
ok('aucun frais sur un titre canadien', w.fraisAR === 0, w.fraisAR);
egal('le plafond de ligne (25 % = 25 $) n\'est pas atteint', w.montant <= 25, true);
// un titre américain : 1,5 % de conversion par opération, donc 3 % l'aller-retour
let us = T.trCalculer(Object.assign({}, ws, { fraisPct: 1.5 }));
ok('titre américain : la quantité baisse', us.ok && us.qte < w.qte, { ca: w.qte, us: us.qte });
ok('les frais proportionnels sont comptés', us.fraisAR > 0, us.fraisAR);
ok('le seuil de couverture vaut exactement 3 % (1,5 % × 2)',
   Math.abs(us.seuilCouverturePct - 3) < 1e-9, us.seuilCouverturePct);
ok('et le risque réel tient toujours dans le budget', us.risqueReel <= 1.0001, us.risqueReel);
// parts entières : la même position ne passe plus
let entier = T.trCalculer(Object.assign({}, ws, { fractionnaire: false }));
egal('parts entières seulement -> plus aucune position à 100 $', entier.ok, false);

console.log('\n— Ticket d\'ordre');
prop.ts = new Date(2026, 9, 15, 14, 32).getTime();
prop.mode = 'papier';
const ticket = T.trOrdreTexte(prop);
const ticketWs = T.trOrdreTexte(Object.assign({}, ws, { ticker: 'RY.TO', ts: prop.ts, mode: 'papier', calcul: w }));
ok('ticket fractionnaire : le montant d\'abord, comme le formulaire du courtier',
   ticketWs.indexOf('ACHAT 19,98 \$ de RY.TO') === 0, ticketWs.split('\n')[0]);
ok('et la part en clair, entre parenthèses', ticketWs.indexOf('(0,0716 part)') > 0, ticketWs.split('\n')[0]);
ok('mentionne le sens et la quantité', ticket.indexOf('ACHAT 8 × SHOP') === 0, ticket.split('\n')[0]);
ok('porte le stop de protection', ticket.indexOf('137,50 $') > 0, ticket);
ok('annonce le seuil de couverture', ticket.indexOf('juste pour les couvrir') > 0);
ok('étiqueté MODE PAPIER', ticket.indexOf('MODE PAPIER') > 0);

console.log('\n— Journal');
const journal = [
  { etat: 'clos', ts: new Date(2026, 9, 15, 10, 0).getTime(), pnl: 91.7, calcul: { fraisAR: 9.9, risqueReel: 48.3, montant: 1138.4 } },
  { etat: 'clos', ts: new Date(2026, 9, 15, 11, 0).getTime(), pnl: -48.3, calcul: { fraisAR: 9.9, risqueReel: 48.3, montant: 1138.4 } },
  { etat: 'execute', ts: new Date(2026, 9, 15, 12, 0).getTime(), calcul: { fraisAR: 9.9, risqueReel: 48.3, montant: 1138.4 } },
  { etat: 'refuse', ts: new Date(2026, 9, 15, 13, 0).getTime(), calcul: { fraisAR: 0, risqueReel: 0, montant: 0 } },
];
const st = T.trStats(journal, '2026-10-15');
egal('trades clos', st.trades, 2);
egal('gagnants', st.gagnants, 1);
ok('taux de réussite 50 %', proche(st.tauxReussite, 50), st.tauxReussite);
ok('P&L net = 43,40', proche(st.pnlNet, 43.4), st.pnlNet);
ok('frais payés = 19,80', proche(st.fraisTotaux, 19.8), st.fraisTotaux);
ok('P&L avant frais = 63,20', proche(st.pnlAvantFrais, 63.2), st.pnlAvantFrais);
ok('R moyen proche de 0,45', proche(st.rMoyen, (91.7 / 48.3 - 1) / 2, 1e-9), st.rMoyen);
egal('une position ouverte suivie', st.positionsOuvertes, 1);
ok('risque ouvert = 48,30', proche(st.risqueOuvert, 48.3), st.risqueOuvert);
ok('perte du jour captée', proche(st.perteJour, -48.3), st.perteJour);

console.log('\n— Halte automatique');
const e1 = T.trEtatDuJour(journal, regl, 5000, '2026-10-15');
ok('plafond non atteint à -48,30 (plafond -150)', !e1.plafondAtteint, e1);
const gros = [{ etat: 'clos', ts: Date.now(), pnl: -160, calcul: { fraisAR: 9.9, risqueReel: 50, montant: 1000 } }];
const e2 = T.trEtatDuJour(gros, regl, 5000, new Date().toISOString().slice(0, 10));
ok('plafond de perte du jour atteint -> halte', e2.plafondAtteint, e2);

console.log('\n' + n + ' tests, ' + echecs + ' échec(s)');
process.exit(echecs ? 1 : 0);
