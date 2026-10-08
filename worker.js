// Cloudflare Worker: يعطي كل منتج رابطاً بمعاينة (صورة + عنوان) عند مشاركته في واتساب
//   الرابط: https://موقعك/p/<slug>?i=<رقم الصورة>
//   الزائر العادي يُحوَّل فوراً إلى صفحة المنتج، وواتساب يقرأ وسوم og:* فيعرض المعاينة.
// أي مسار آخر يُمرَّر للموقع كما هو عبر env.ASSETS.

const SUPABASE_URL = "https://rxbytiypnqmnastydwtl.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_EAV6Xz5dUouN8abhz3HbVQ_DnS3XcSi";
const SITE_NAME = "أبو أحمد للألمنيوم";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const FULL_RE = /-f\.[A-Za-z0-9]+(\?.*)?$/;
const thumbOf = (u) => (FULL_RE.test(u) ? u.replace(FULL_RE, "-t.jpg") : u);

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const m = /^\/p\/([^/]+)\/?$/.exec(url.pathname);
    if (!m) return env.ASSETS.fetch(request);

    const slug = decodeURIComponent(m[1]);
    const idx = Math.max(0, (parseInt(url.searchParams.get("i") || "1", 10) || 1) - 1);
    const target = `${url.origin}/#/product/${encodeURIComponent(slug)}`;

    let name = SITE_NAME, desc = "اطلب الآن عبر واتساب", image = "";
    try {
      const api = `${SUPABASE_URL}/rest/v1/products?slug=eq.${encodeURIComponent(slug)}&select=name,description,product_images(url,sort_order)&limit=1`;
      const r = await fetch(api, { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } });
      const rows = r.ok ? await r.json() : [];
      const p = rows[0];
      if (p) {
        name = p.name || name;
        if (p.description) desc = String(p.description).slice(0, 160);
        const imgs = (p.product_images || [])
          .map((im, i) => ({ im, i }))
          .sort((a, b) => ((a.im.sort_order || 0) - (b.im.sort_order || 0)) || (a.i - b.i))
          .map((x) => x.im.url);
        const chosen = imgs[idx] || imgs[0];
        if (chosen) image = thumbOf(chosen);
      }
    } catch (e) { /* نكمل بمعاينة عامة */ }

    const html = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8">
<title>${esc(name)}</title>
<meta property="og:type" content="website">
<meta property="og:site_name" content="${esc(SITE_NAME)}">
<meta property="og:title" content="${esc(name)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(url.href)}">
${image ? `<meta property="og:image" content="${esc(image)}">\n<meta name="twitter:card" content="summary_large_image">` : ""}
<meta http-equiv="refresh" content="0;url=${esc(target)}">
</head><body><script>location.replace(${JSON.stringify(target)});</script><a href="${esc(target)}">${esc(name)}</a></body></html>`;

    return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300" } });
  },
};
