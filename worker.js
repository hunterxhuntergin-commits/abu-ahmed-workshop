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


// ---------------- قراءة دفتر الزبائن من صورة (OCR بالذكاء الاصطناعي) ----------------
// المسار: POST /api/ledger-ocr   — للإدارة فقط (يتحقق من جلسة Supabase)
// يحتاج سرّ (Secret) اسمه ANTHROPIC_API_KEY في إعدادات الـ Worker. (اختياري: ANTHROPIC_MODEL)
const OCR_MODEL_DEFAULT = "claude-sonnet-5-5";
const OCR_PROMPT = `You read photos of a workshop's customer ledger (handwritten notebook pages, or screenshots of phone notes) written in Iraqi Arabic. The workshop makes aluminium doors, windows, countertops and stair railings. Currency: Iraqi dinar.
Each customer has ONE general account: the total amount of all his works, and the payments he made. Extract every customer account on the page and return ONLY valid JSON (no markdown, no commentary) in exactly this shape:
{"customers":[{"name":string,"phone":string|null,"notes":string|null,"total":number|null,"payments":[{"amount":number,"date":"YYYY-MM-DD"|null,"note":string|null}],"uncertain":boolean}]}
Rules:
- Never invent anything. If something is unreadable use null and set "uncertain" to true for that customer.
- Write digits as Western digits. Amounts are the numbers exactly as written: do NOT add zeros or multiply.
- "total" is the overall amount charged to the customer for all his works. If a total is written use it; if only separate prices of works are written, add them up; if only the remaining balance (الباقي / المتبقي) is written, use remaining + the payments listed (or just the remaining if no payments are listed). Do not describe the individual works.
- Money received (دفعة، واصل، استلمت، مقدم، عربون، دفع) goes to "payments". Never put a remaining balance or a total into payments.
- Keep names exactly as written (e.g. أبو علي، حسين الكرخ). The same customer on several lines is one entry.
- Dates matter: give every payment its own date exactly as written, as YYYY-MM-DD (ledger dates are day/month order). If only day and month are written, assume the current year given at the end. Use null only when no date is written for that payment.
- Ignore crossed-out lines.
- If the page contains no customer data return {"customers":[]}.`;

async function handleLedgerOcr(request, env) {
  const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
  if (request.method !== "POST") return json({ error: "method not allowed" }, 405);

  const auth = request.headers.get("Authorization") || "";
  if (!/^Bearer .{20,}/.test(auth)) return json({ error: "غير مصرّح" }, 401);
  try {
    const u = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: SUPABASE_ANON_KEY, Authorization: auth } });
    if (!u.ok) return json({ error: "انتهت الجلسة، سجّل الدخول من جديد" }, 401);
  } catch (e) { return json({ error: "تعذّر التحقق من الحساب" }, 502); }

  if (!env.ANTHROPIC_API_KEY) return json({ error: "مفتاح الذكاء الاصطناعي غير مضاف للـ Worker (ANTHROPIC_API_KEY)" }, 500);

  let body;
  try { body = await request.json(); } catch (e) { return json({ error: "طلب غير صالح" }, 400); }
  const image = String(body.image || "");
  const mt = ["image/jpeg", "image/png", "image/webp"].includes(body.media_type) ? body.media_type : "image/jpeg";
  if (image.length < 100 || image.length > 7000000) return json({ error: "حجم الصورة غير مناسب" }, 400);

  let r;
  try {
    r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: env.ANTHROPIC_MODEL || OCR_MODEL_DEFAULT,
        max_tokens: 4096,
        system: OCR_PROMPT + `\nThe current year is ${new Date().getFullYear()}.`,
        messages: [{ role: "user", content: [
          { type: "image", source: { type: "base64", media_type: mt, data: image } },
          { type: "text", text: "استخرج حسابات الزبائن من هذه الصفحة. أعد JSON فقط." }
        ] }]
      })
    });
  } catch (e) { return json({ error: "تعذّر الاتصال بخدمة القراءة" }, 502); }
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    return json({ error: "فشلت قراءة الصورة (" + r.status + ")", detail: t.slice(0, 300) }, 502);
  }
  const d = await r.json().catch(() => ({}));
  const txt = (d.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
  const a = txt.indexOf("{"), b = txt.lastIndexOf("}");
  try {
    const parsed = JSON.parse(txt.slice(a, b + 1));
    return json({ customers: Array.isArray(parsed.customers) ? parsed.customers : [] });
  } catch (e) { return json({ error: "تعذّر فهم نتيجة القراءة، جرّب صورة أوضح" }, 502); }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/ledger-ocr") return handleLedgerOcr(request, env);
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
