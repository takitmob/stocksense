/* StockSense AI — service worker
 *
 * Deux règles qui avaient été prises à l'envers dans la v1 :
 *
 * 1. Le shell de l'app (HTML, JS, CSS) doit être **network-first**. En
 *    cache-first, une fois `index.html` et `js/*.js` en cache, plus aucune
 *    mise à jour ne pouvait atteindre un utilisateur existant : le numéro de
 *    cache restait `v1` et le navigateur servait indéfiniment l'ancienne app.
 * 2. Le service worker ne doit **jamais** toucher aux appels d'API. En v1,
 *    seul `api.anthropic.com` était exclu : les POST vers DeepSeek, Mistral ou
 *    OpenRouter tombaient dans le handler et `cache.put()` sur une requête POST
 *    rejette systématiquement (la Cache API n'accepte que GET).
 *
 * À CHAQUE MODIFICATION des fichiers statiques : incrémenter CACHE_VERSION.
 */

const CACHE_VERSION = 'stocksense-v6';
const SHELL = [
  './',
  './index.html',
  './trade.html',
  './css/style.css',
  './js/app.js',
  './js/api.js',
  './js/markets.js',
  './js/hours.js',
  './js/db.js',
  './js/quotes.js',
  './js/trade.js',
  './data/suivi.json',
  './data/propositions.json',
  './js/ui.js',
  './manifest.json'
];

// Installation — pré-cache du shell. Un seul fichier manquant ferait échouer
// tout l'install : `addAll` est donc appelé fichier par fichier.
self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE_VERSION);
    await Promise.all(SHELL.map((url) =>
      cache.add(url).catch(() => console.warn('[SW] non mis en cache :', url))
    ));
    await self.skipWaiting();
  })());
});

// Activation — purge des caches des versions précédentes.
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);

  // Jamais de cache pour : les méthodes autres que GET (POST d'API), les
  // requêtes vers un autre domaine (APIs IA, GitHub), et les requêtes non-http.
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;

  // Le shell de l'app : réseau d'abord, cache en secours hors ligne.
  const estShell = req.mode === 'navigate' || /\.(?:html|js|css|json)$/.test(url.pathname) || url.pathname.endsWith('/');
  if (estShell) {
    e.respondWith((async () => {
      try {
        const reseau = await fetch(req);
        if (reseau && reseau.status === 200) {
          const clone = reseau.clone();
          caches.open(CACHE_VERSION).then((c) => c.put(req, clone)).catch(() => {});
        }
        return reseau;
      } catch (err) {
        const cache = await caches.match(req);
        if (cache) return cache;
        if (req.mode === 'navigate') {
          const index = await caches.match('./index.html');
          if (index) return index;
        }
        return new Response('Hors ligne', {
          status: 503,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' }
        });
      }
    })());
    return;
  }

  // Le reste (images, icônes, polices) : cache d'abord, c'est immuable.
  e.respondWith((async () => {
    const cache = await caches.match(req);
    if (cache) return cache;
    try {
      const reseau = await fetch(req);
      if (reseau && reseau.status === 200 && reseau.type === 'basic') {
        const clone = reseau.clone();
        caches.open(CACHE_VERSION).then((c) => c.put(req, clone)).catch(() => {});
      }
      return reseau;
    } catch (err) {
      return new Response('Hors ligne', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    }
  })());
});
