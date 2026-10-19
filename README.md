# StockSense AI 📊

Progressive Web App d'analyse boursière alimentée par IA — **DeepSeek par défaut**, multi-fournisseurs (DeepSeek, Mistral, OpenRouter).

**Marchés couverts :** BRVM · TSX · NYSE/NASDAQ · Europe · Asie · Marchés Émergents

---

## 🚀 Déploiement en 5 minutes sur GitHub Pages

### Étape 1 — Créer le dépôt GitHub

1. Va sur [github.com/new](https://github.com/new)
2. Nom du dépôt : `stocksense` (ou ce que tu veux)
3. Visibilité : **Public**
4. Clique **Create repository**

### Étape 2 — Uploader les fichiers

**Option A — Interface web GitHub (plus simple)**

1. Dans ton nouveau dépôt, clique **"uploading an existing file"**
2. Glisse-dépose **tout le contenu** du dossier `stocksense-pwa/` (pas le dossier lui-même)
3. Clique **Commit changes**

**Option B — Git en ligne de commande**

```bash
cd stocksense-pwa
git init
git add .
git commit -m "Initial StockSense AI"
git branch -M main
git remote add origin https://github.com/TON_USERNAME/stocksense.git
git push -u origin main
```

### Étape 3 — Activer GitHub Pages

1. Dans ton dépôt → **Settings** → **Pages** (menu gauche)
2. Source : **Deploy from a branch**
3. Branch : **main** → dossier **/ (root)**
4. Clique **Save**
5. Attends 1-2 minutes

### Étape 4 — Accéder à l'app

Ton URL sera :
```
https://TON_USERNAME.github.io/stocksense/
```

---

## 📱 Installation sur iPhone

1. Ouvre l'URL dans **Safari** (pas Chrome)
2. Appuie sur l'icône **Partager** (carré avec flèche)
3. Sélectionne **"Sur l'écran d'accueil"**
4. Appuie **Ajouter**

L'app s'ouvre en plein écran, comme une app native.

---

## 🔑 Configuration de la clé API

L'app est multi-fournisseurs : **DeepSeek** (par défaut), Mistral, OpenRouter et Claude.
Une seule clé suffit — celle du fournisseur que tu choisis.

> ⚠️ **Anthropic (Claude) ne peut pas fonctionner depuis cette app.** Son API refuse les
> appels venant d'un navigateur (aucun en-tête CORS au préflight), quel que soit le
> contenu de la clé. Il faudrait un relais côté serveur. **Utilise DeepSeek.**

### DeepSeek (recommandé — c'est le défaut)

1. Va sur [platform.deepseek.com](https://platform.deepseek.com)
2. Crée un compte → **API Keys** → **Create Key**
3. Copie la clé (commence par `sk-...`)
4. Dans l'app → onglet **⚙️ Paramètres** → fournisseur **DeepSeek** → colle la clé → **Sauvegarder**
5. Appuie sur **Tester la clé** : le bouton fait une vraie mini-requête et affiche le
   résultat. C'est la seule vérification fiable — lister les modèles ne prouve rien.

### OpenRouter (gratuit, modèle plus faible)

OpenRouter offre un accès gratuit sans carte bancaire : [openrouter.ai/keys](https://openrouter.ai/keys).
Le modèle gratuit est plus petit : il respecte moins bien le format JSON strict exigé
par l'app, attends-toi à quelques « Réponse inattendue ».

> La clé est stockée uniquement dans **ton** navigateur (localStorage) et n'est envoyée
> qu'au fournisseur que tu as sélectionné.

---

## ✨ Fonctionnalités

### Onglet Analyser
- Entre n'importe quel ticker (SNTS, ENB, NVDA, ASML…)
- Choisis ton intention : Acheter / Vendre / Surveiller
- Verdict clair avec niveau de confiance
- 5 scores visuels (Technique, Fondamentaux, Macro, Momentum, Risque)
- Graphique interactif Prix / RSI / Volume
- Analyse détaillée texte générée par l'IA

### Onglet Marchés
- 6 régions : BRVM, Canada, USA, Europe, Asie, Émergents
- Top 6 actions par région avec signal Acheter/Vendre/Conserver
- Statut marché en temps réel (ouvert/fermé)
- Popup informatif si marché fermé avec heure de prochaine ouverture
- Clique sur une action → analyse complète lancée automatiquement

### Onglet Guide
- RSI, Moyennes Mobiles, PER, Dividende, Support/Résistance, Volume, Biais cognitifs
- Explication claire avec exemples BRVM et TSX

### Onglet Historique
- Toutes les analyses de la session
- Clique pour recharger une analyse

### Mode Offline
- Cache IndexedDB automatique
- Données de la dernière session disponibles sans connexion
- Fallback statique si aucun cache disponible

---

## 🏗 Structure du projet

```
stocksense-pwa/
├── index.html          ← Page principale (5 pages en SPA)
├── manifest.json       ← Config PWA
├── sw.js               ← Service Worker (cache offline)
├── css/
│   └── style.css       ← Design system complet
├── js/
│   ├── hours.js        ← Horaires boursiers 6 régions
│   ├── markets.js      ← Config régions + données fallback
│   ├── db.js           ← Cache IndexedDB
│   ├── api.js          ← Appels API IA (analyse + marchés) — 4 fournisseurs, clé testable
│   ├── ui.js           ← Rendu HTML (verdict, chart, cartes)
│   └── app.js          ← Orchestration, navigation, état
└── icons/
    ├── icon-192.png
    └── icon-512.png
```

---

## 🛠 Développement local

Aucune installation requise. Lance simplement un serveur HTTP :

```bash
# Python
cd stocksense-pwa
python3 -m http.server 8080

# Node.js (si npx disponible)
npx serve .
```

Puis ouvre `http://localhost:8080` dans Safari.

> **Important :** Ouvre toujours via `http://localhost` ou une URL HTTPS. Le Service Worker ne fonctionne pas sur `file://`.

---

## ⚠️ Avertissement

StockSense AI est un outil informatif uniquement. Les analyses générées par l'IA ne constituent pas des conseils financiers officiels. Effectuez toujours vos propres recherches avant d'investir.

## Licence

Tous droits réservés — aucun droit accordé au-delà de la loi ; toute utilisation demande une autorisation écrite.

Voir `LICENSE`. © 2026 Josué Konan.
