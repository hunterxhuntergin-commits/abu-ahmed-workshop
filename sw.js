/* عطور السيد — Service Worker. غيّر CACHE_VERSION عند كل نشر. */
const CACHE_VERSION = 'v21';
const CACHE = 'as-' + CACHE_VERSION;

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(['offline.html'])).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('as-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

const put = (req, res) => { if (res && res.ok) { const c = res.clone(); caches.open(CACHE).then(x => x.put(req, c)); } return res; };
const networkFirst = (req, fallback) => fetch(req).then(r => put(req, r)).catch(() => caches.match(req).then(m => m || (fallback ? caches.match(fallback) : Response.error())));
const swr = req => caches.match(req).then(m => {
  const net = fetch(req).then(r => put(req, r)).catch(() => m);
  return m || net;
});

self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET') return;
  const u = new URL(req.url);
  if (u.origin === location.origin) {
    // تُخزَّن صفحات المتجر العامة فقط؛ أي مسار آخر (ومنه لوحة الإدارة) يمرّ للشبكة دون تخزين
    if (req.mode === 'navigate') return /^\/(index\.html|cart\.html|products\.html|product\.html)?$/.test(u.pathname) ? e.respondWith(networkFirst(req, 'offline.html')) : undefined;
    if (/\.(css|js|webmanifest)$/i.test(u.pathname)) return e.respondWith(networkFirst(req));
    if (/\.(woff2?|png|jpe?g|webp|svg|ico)$/i.test(u.pathname)) return e.respondWith(swr(req));
    return;
  }
  // Supabase: لا يُخزَّن أي طلب عدا صور المنتجات العامة
  if (u.hostname.endsWith('.supabase.co') && u.pathname.startsWith('/storage/v1/object/public/product-images/')) return e.respondWith(swr(req));
});
