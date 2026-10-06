/* Service Worker — أبو أحمد للألمنيوم
   يخلي الموقع (والإدارة) يفتح بدون نت، ويعرض آخر بيانات محفوظة.
   لما تسوي أي تحديث كبير بالموقع، غيّر رقم CACHE_VERSION تحت عشان يتحدث الكاش عند الزوار. */
const CACHE_VERSION = 'v5';
const SHELL_CACHE = 'shell-' + CACHE_VERSION;
const DATA_CACHE = 'data-' + CACHE_VERSION;
const IMG_CACHE = 'img-' + CACHE_VERSION;

// fetch مع مهلة: إذا النت بطيء أو السيرفر واقف نرجع للنسخة المحفوظة بدل الانتظار
function fetchWithTimeout(req, ms){
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    fetch(req).then((r) => { clearTimeout(t); resolve(r); }, (e) => { clearTimeout(t); reject(e); });
  });
}

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
          .filter((k) => k !== SHELL_CACHE && k !== DATA_CACHE && k !== IMG_CACHE)
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
      caches.match('/').then((cached) => {
        const net = fetch(req).then((res) => {
          if (res && res.ok) { const c = res.clone(); caches.open(SHELL_CACHE).then((ca) => ca.put('/', c)); }
          return res;
        });
        return cached ? (net.catch(() => {}), cached) : net.catch(() => caches.match(req));
      })
    );
    return;
  }

  // فقط نتدخل بطلبات GET (الطلبات اللي تغيّر بيانات "insert/update/delete" لازم نت فعلي)
  if (req.method !== 'GET') return;

  // صور التخزين (Supabase Storage) — كاش أولاً، تنحفظ بعد أول تحميل
  if (url.hostname.endsWith('.supabase.co') && url.pathname.includes('/storage/v1/object/public/')) {
    event.respondWith(
      caches.open(IMG_CACHE).then((cache) =>
        cache.match(req).then((cached) => cached || fetch(req).then((res) => {
          if (res && res.ok) cache.put(req, res.clone());
          return res;
        }))
      )
    );
    return;
  }

  // 2) بيانات سوبابيس (منتجات، طلبات، تصنيفات...) — نت أولاً، وإذا ما فيه نرجّع آخر نسخة بالكاش
  if (url.hostname.endsWith('.supabase.co')) {
    event.respondWith(
      fetchWithTimeout(req, 4000)
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
