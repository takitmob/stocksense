#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Instantané BRVM — extracteur des cours de clôture réels.

Pourquoi ce fichier existe : la BRVM n'est couverte par aucune source de
cotations gratuite et compatible navigateur (vérifié : /stocks?exchange=XBRV et
/stocks?symbol=SNTS reviennent vides chez Twelve Data). brvm.org publie en
revanche ses cours en HTML statique — 49 valeurs dans un tableau, sans rendu
JavaScript. Ce script est exécuté par un runner GitHub Actions (donc côté
serveur, hors contrainte CORS) et dépose data/brvm.json dans le dépôt : l'app
statique le lit ensuite depuis SA PROPRE origine, ce qui supprime le problème.

Le marché BRVM cote une fois par jour : un instantané quotidien est la bonne
granularité, pas un flux temps réel.

Usage :
    python3 tools/brvm_snapshot.py [chemin_de_sortie]
Sortie : data/brvm.json (ou le chemin demandé)
"""
import html
import json
import os
import re
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone

URL_COURS = "https://www.brvm.org/fr/cours-actions/0"
URL_INDICES = "https://www.brvm.org/fr/indices/0"
EN_TETE = {
    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/120.0 Safari/537.36",
    "Accept-Language": "fr-FR,fr;q=0.9",
}


def telecharger(url, essais=3):
    """Télécharge avec trois tentatives : le site public tombe parfois."""
    derniere = None
    for i in range(essais):
        try:
            with urllib.request.urlopen(
                urllib.request.Request(url, headers=EN_TETE), timeout=45
            ) as r:
                return r.read().decode("utf-8", "replace")
        except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError) as e:
            derniere = e
    raise RuntimeError(f"Téléchargement impossible après {essais} essais : {url} ({derniere})")


def cellules(ligne_html):
    """Contenu texte des cellules d'une ligne <tr>."""
    brut = re.findall(r"<t[dh][^>]*>(.*?)</t[dh]>", ligne_html, re.S)
    return [
        re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", c))).strip()
        for c in brut
    ]


def tableau_brvm(page, entete_attendu):
    """Retourne les lignes du premier tableau dont l'en-tête correspond."""
    for t in re.findall(r"<table.*?</table>", page, re.S):
        lignes = [cellules(l) for l in re.findall(r"<tr.*?</tr>", t, re.S)]
        lignes = [l for l in lignes if l]
        if not lignes:
            continue
        entete = " ".join(lignes[0]).lower()
        if all(mot in entete for mot in entete_attendu):
            return lignes
    return None


def nombre(txt):
    """« 3 205 » -> 3205.0 ; « -6,99% » -> -6.99 ; « 12 345,50 » -> 12345.5 ; « n/d » -> None.

    Format français : espace (y compris insécable) séparateur de milliers,
    virgule décimale. Un champ vide ou non numérique doit rester None plutôt
    que devenir 0 — un cours à 0 serait un mensonge silencieux.
    """
    if txt is None:
        return None
    t = str(txt).strip().replace("\u00a0", " ").replace("\u202f", " ")
    t = t.replace("%", "").replace(" ", "")
    if not t or not re.match(r"^-?\d+(?:[.,]\d+)?$", t):
        return None
    return float(t.replace(",", "."))


def extraire(page):
    """49 valeurs BRVM : (symbole, nom, volume, veille, ouverture, clôture, variation)."""
    lignes = tableau_brvm(page, ["symbole", "clôture", "variation"])
    if not lignes:
        raise RuntimeError("Tableau des cours introuvable : la page a changé de structure.")
    valeurs = []
    for l in lignes[1:]:
        if len(l) < 7:
            continue
        symbole = l[0].strip().upper()
        cours = nombre(l[5])
        if not re.match(r"^[A-Z0-9]{3,7}$", symbole) or cours is None:
            continue          # ligne de service ou valeur non cotée ce jour
        valeurs.append({
            "ticker": symbole,
            "nom": l[1].strip(),
            "volume": nombre(l[2]),
            "veille": nombre(l[3]),
            "ouverture": nombre(l[4]),
            "cloture": cours,
            "variation": nombre(l[6]),
        })
    return valeurs


def indices(page):
    """Indices BRVM (composite, 30, sectoriels) : Nom / Fermeture / Variation."""
    lignes = tableau_brvm(page, ["nom", "fermeture", "variation"])
    out = []
    if not lignes:
        return out
    for l in lignes[1:]:
        if len(l) < 4 or not l[0].strip():
            continue
        fermeture = nombre(l[2])
        if fermeture is None:
            continue
        out.append({"nom": l[0].strip(), "fermeture": fermeture, "variation": nombre(l[3])})
    return out


def croiser_top_flop(page, valeurs):
    """Recoupement d'intégrité : les tableaux Top 5 et Flop 5 sont rendus
    séparément du tableau principal. Tout titre présent des deux côtés doit
    afficher le même cours et la même variation — c'est un contrôle réel, et
    c'est la seule vérification valable : la variation officielle BRVM n'est
    PAS (clôture - veille) / veille, elle suit une référence propre au marché.
    """
    connus = {v["ticker"]: v for v in valeurs}
    ecarts = []
    for entete in (["top 5", "cours"], ["flop 5", "cours"]):
        lignes = tableau_brvm(page, entete)
        if not lignes:
            continue
        for l in lignes[1:]:
            if len(l) < 3:
                continue
            t = l[0].strip().upper()
            cours, var = nombre(l[1]), nombre(l[2])
            v = connus.get(t)
            if not v:
                ecarts.append(f"{t} absent du tableau principal")
                continue
            if cours is not None and v["cloture"] != cours:
                ecarts.append(f"{t} cours {v['cloture']} != {cours}")
            if var is not None and v["variation"] is not None and abs(v["variation"] - var) > 0.01:
                ecarts.append(f"{t} variation {v['variation']} != {var}")
    return ecarts


def construire():
    page = telecharger(URL_COURS)
    valeurs = extraire(page)
    try:
        idx = indices(telecharger(URL_INDICES))
    except Exception:
        idx = []
    return {
        "source": "brvm.org",
        "recupere": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "marche": "BRVM",
        "devise": "FCFA",
        "nombre": len(valeurs),
        "ecarts_topflop": croiser_top_flop(page, valeurs),
        "indices": idx,
        "valeurs": valeurs,
    }


def maj_historique(paquet, chemin, max_sessions=90):
    """Ajoute la séance du jour à l'historique cumulé, par titre.

    La cote BRVM ne publie que la clôture du jour : une série se construit
    séance après séance. C'est ce fichier qui donnera plus tard un vrai RSI et
    un vrai graphique — d'où l'intérêt de le tenir dès maintenant, même avec un
    seul point au départ.

    Écrit par date (une séance déjà enregistrée est remplacée, jamais dupliquée).
    """
    session = paquet["recupere"][:10]
    try:
        with open(chemin, encoding="utf-8") as f:
            hist = json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        hist = {"source": paquet["source"], "marche": paquet["marche"],
                "devise": paquet["devise"], "series": {}}

    series = hist.setdefault("series", {})
    for v in paquet["valeurs"]:
        points = series.setdefault(v["ticker"], [])
        points[:] = [p for p in points if p[0] != session]   # remplace la séance
        points.append([session, v["cloture"], v["volume"]])
        points.sort(key=lambda p: p[0])
        del points[:-max_sessions]                            # fenêtre glissante
    # purge les titres qui ne cotent plus
    actifs = {v["ticker"] for v in paquet["valeurs"]}
    for t in list(series):
        if t not in actifs:
            del series[t]
    hist["sessions"] = sorted({p[0] for pts in series.values() for p in pts})
    hist["nombre_titres"] = len(series)
    hist["maj"] = paquet["recupere"]
    with open(chemin, "w", encoding="utf-8") as f:
        json.dump(hist, f, ensure_ascii=False, indent=1, sort_keys=True)
    return hist["sessions"]


def main():
    cible = sys.argv[1] if len(sys.argv) > 1 else "data/brvm.json"
    hist = sys.argv[2] if len(sys.argv) > 2 else "data/brvm-history.json"
    try:
        paquet = construire()
    except Exception as e:
        print(f"ECHEC : {e}", file=sys.stderr)
        return 1
    for chemin in (cible, hist):
        dossier = os.path.dirname(chemin)
        if dossier:
            os.makedirs(dossier, exist_ok=True)
    with open(cible, "w", encoding="utf-8") as f:
        json.dump(paquet, f, ensure_ascii=False, indent=1, sort_keys=True)
    try:
        sessions = maj_historique(paquet, hist)
    except Exception as e:
        sessions = []
        print(f"ATTENTION : historique non mis à jour ({e})", file=sys.stderr)
    print(f"{paquet['nombre']} valeurs écrites dans {cible} "
          f"({len(paquet['indices'])} indices)")
    print(f"historique : {len(sessions)} séance(s) dans {hist}")
    if paquet["ecarts_topflop"]:
        print(f"ATTENTION : recoupement Top/Flop en écart : "
              f"{'; '.join(paquet['ecarts_topflop'])}", file=sys.stderr)
    else:
        print("recoupement Top 5 / Flop 5 : concordant")
    return 0


if __name__ == "__main__":
    sys.exit(main())
