/* Service Worker — أبو أحمد للألمنيوم
   يخلي الموقع (والإدارة) يفتح بدون نت، ويعرض آخر بيانات محفوظة.
   لما تسوي أي تحديث كبير بالموقع، غيّر رقم CACHE_VERSION تحت عشان يتحدث الكاش عند الزوار. */
const CACHE_VERSION = 'v1';
const SHELL_CACHE = 'shell-' + CACHE_VERSION;
const DATA_CACHE = 'data-' + CACHE_VERSION;

// روابط خارجية ضرورية لتشغيل الموقع (مكتبات + خطوط) — تنحفظ بأول زيارة فيها نت
const PRECACHE_URLS = [
  '/',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm',
  'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js',
  'https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;900&family=IBM+Plex+Mono:wght@500;600&display=swap'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => {
      return Promise.all(
        PRECACHE_URLS.map((url) =>
          cache.add(url).catch((err) => console.warn('[SW] precache failed:', url, err))
        )
      );
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k !== SHELL_CACHE && k !== DATA_CACHE)
          .map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // 1) فتح الصفحة نفسها (navigation) — نت أولاً، وإذا ما فيه نت نرجّع آخر نسخة محفوظة
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const clone = res.clone();
          caches.open(SHELL_CACHE).then((c) => c.put('/', clone));
          return res;
        })
        .catch(() => caches.match('/').then((r) => r || caches.match(req)))
    );
    return;
  }

  // فقط نتدخل بطلبات GET (الطلبات اللي تغيّر بيانات "insert/update/delete" لازم نت فعلي)
  if (req.method !== 'GET') return;

  // 2) بيانات سوبابيس (منتجات، طلبات، تصنيفات...) — نت أولاً، وإذا ما فيه نرجّع آخر نسخة بالكاش
  if (url.hostname.endsWith('.supabase.co')) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const clone = res.clone();
            caches.open(DATA_CACHE).then((c) => c.put(req, clone));
          }
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  // 3) مكتبات وخطوط خارجية (jsdelivr / fonts) — كاش أولاً (نادراً تتغيّر)
  if (url.hostname.includes('jsdelivr.net') || url.hostname.includes('fonts.googleapis.com') || url.hostname.includes('fonts.gstatic.com')) {
    event.respondWith(
      caches.match(req).then((cached) => {
        if (cached) return cached;
        return fetch(req).then((res) => {
          if (res && res.ok) {
            const clone = res.clone();
            caches.open(SHELL_CACHE).then((c) => c.put(req, clone));
          }
          return res;
        });
      })
    );
    return;
  }

  // غير هذا خلها تروح عادي عالنت (بدون تدخل)
});
