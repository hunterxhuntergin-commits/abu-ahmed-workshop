/* عطور السيد — الكود المشترك بين الصفحات
   ضع هنا الرابط والمفتاح العام فقط (anon / publishable). لا تضع أي مفتاح سري. */
(() => {
  const CONFIG = { SUPABASE_URL: 'https://bowkgxuzpgcontcmsmip.supabase.co', SUPABASE_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJvd2tneHV6cGdjb250Y21zbWlwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMzMDYzNzAsImV4cCI6MjEwODg4MjM3MH0.MwwozXS_fKo-mQ2KZgesv5ZBKs-h0pFidSIaq-14liY', WA_NUMBER: '' };

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const IQD = n => new Intl.NumberFormat('ar-IQ').format(n) + ' د.ع';
  const connected = () => !!(CONFIG.SUPABASE_URL && CONFIG.SUPABASE_KEY);
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  function toast(msg) {
    let t = $('#toast');
    if (!t) { t = document.createElement('div'); t.id = 'toast'; t.setAttribute('role', 'status'); t.setAttribute('aria-live', 'polite'); document.body.appendChild(t); }
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 2800);
  }

  /* ===== REST / RPC ===== */
  const H = () => ({ apikey: CONFIG.SUPABASE_KEY, Authorization: 'Bearer ' + CONFIG.SUPABASE_KEY });
  async function sb(path, { count = false } = {}) {
    const headers = H(); if (count) headers.Prefer = 'count=exact';
    const r = await fetch(CONFIG.SUPABASE_URL + '/rest/v1/' + path, { headers });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const rows = await r.json();
    if (!count) return rows;
    const m = (r.headers.get('content-range') || '').match(/\/(\d+)$/);
    return { rows, total: m ? +m[1] : rows.length };
  }
  async function rpc(fn, body) {
    const r = await fetch(CONFIG.SUPABASE_URL + '/rest/v1/rpc/' + fn, { method: 'POST', headers: { ...H(), 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!r.ok) { let m = ''; try { m = (await r.json()).message; } catch {} throw new Error(m || 'HTTP ' + r.status); }
    return r.json();
  }

  /* ===== السلة (محليًا؛ الأسعار تُحسب دائمًا على الخادم) ===== */
  const Cart = {
    get() {
      try { return JSON.parse(localStorage.getItem('as_cart') || '[]').filter(x => UUID.test(x.product_id) && x.qty >= 1); }
      catch { return []; }
    },
    set(v) { try { localStorage.setItem('as_cart', JSON.stringify(v)); } catch {} Cart.badge(); },
    add(id, qty = 1, seen = null) {
      const c = Cart.get(), i = c.find(x => x.product_id === id);
      if (i) { i.qty = Math.min(99, i.qty + qty); if (seen != null) i.seen = seen; } else c.push({ product_id: id, qty, seen });
      Cart.set(c);
    },
    setQty(id, qty) { const c = Cart.get(); const i = c.find(x => x.product_id === id); if (i) { i.qty = Math.max(1, Math.min(99, qty)); Cart.set(c); } },
    setSeen(id, seen) { const c = Cart.get(); const i = c.find(x => x.product_id === id); if (i) { i.seen = seen; Cart.set(c); } },
    remove(id) { Cart.set(Cart.get().filter(x => x.product_id !== id)); },
    clear() { Cart.set([]); Pkg.clear(); },
    count() { return Cart.get().reduce((a, x) => a + x.qty, 0) + Pkg.count(); },
    badge() { const b = $('#cartCount'); if (b) b.textContent = Cart.count(); }
  };
  /* باكيجات الاستكشاف في السلة (الأسعار والتحقق دائمًا على الخادم) */
  const Pkg = {
    get() {
      try { return JSON.parse(localStorage.getItem('as_pkgs') || '[]').filter(x => UUID.test(x.package_id) && Array.isArray(x.picks) && x.picks.length && x.picks.every(i => UUID.test(i))); }
      catch { return []; }
    },
    set(v) { try { localStorage.setItem('as_pkgs', JSON.stringify(v)); } catch {} Cart.badge(); },
    add(p) { const c = Pkg.get(); c.push({ uid: Date.now() + '-' + Math.random().toString(16).slice(2), package_id: p.package_id, picks: p.picks, name: p.name, price: p.price }); Pkg.set(c); },
    remove(uid) { Pkg.set(Pkg.get().filter(x => x.uid !== uid)); },
    clear() { Pkg.set([]); },
    count() { return Pkg.get().length; }
  };

  /* ===== واتساب ===== */
  function openWA(text) {
    if (!CONFIG.WA_NUMBER) { toast('لم يُضبط رقم واتساب بعد. يُضاف من لوحة الإدارة.'); return; }
    window.open('https://wa.me/' + CONFIG.WA_NUMBER.replace(/[^0-9]/g, '') + '?text=' + encodeURIComponent(text), '_blank', 'noopener');
  }

  /* ===== الإعدادات العامة ===== */
  const SETTINGS = {};
  let PRESENT = null; /* الأحجام الموجودة فعلًا في المنتجات الظاهرة للزائر */
  async function loadSettings() {
    if (connected()) {
      try { (await sb('settings?select=key,value&key=like.public.*')).forEach(r => SETTINGS[r.key] = r.value); } catch {}
    }
    if (connected()) { try { const r = await sb('products?select=size_value,size_unit&limit=1000'); if (Array.isArray(r)) PRESENT = new Set(r.filter(x => x.size_value != null && (!x.size_unit || x.size_unit === 'ml')).map(x => +x.size_value)); } catch {} }
    if (!CONFIG.WA_NUMBER && SETTINGS['public.whatsapp_number']) CONFIG.WA_NUMBER = String(SETTINGS['public.whatsapp_number']);
    $$('[data-s]').forEach(el => { const v = SETTINGS['public.' + el.dataset.s]; if (typeof v === 'string' && v) el.textContent = v; });
    const n = SETTINGS['public.store_name'];
    if (typeof n === 'string' && n) $$('.store-name').forEach(e => e.textContent = n);
    if (!window.AS_ADMIN) applyTheme();
  }

  /* التخصيص من لوحة الإدارة: ألوان/خط/شعار/صورة الواجهة/CSS مخصص (مفاتيح public.* في settings) */
  function applyTheme() {
    const T = SETTINGS['public.theme'], root = document.documentElement, col = /^#[0-9a-f]{3,8}$/i;
    let css = '';
    if (T && typeof T === 'object') {
      const m = { bg: '--bg', ink: '--ink', soft: '--soft', line: '--line' };
      Object.keys(m).forEach(k => { if (col.test(T[k])) root.style.setProperty(m[k], T[k]); });
      if (+T.r >= 0 && +T.r <= 24) root.style.setProperty('--r', (+T.r) + 'px');
      if (+T.fs >= 14 && +T.fs <= 20) root.style.fontSize = (+T.fs) + 'px';
      const FF = ['IBM Plex Sans Arabic', 'Noto Kufi Arabic', 'Cairo'], fb = "system-ui,-apple-system,'Segoe UI',Tahoma,sans-serif";
      if (FF.includes(T.font)) root.style.setProperty('--fb', `'${T.font}',${fb}`);
      if (FF.includes(T.hfont)) root.style.setProperty('--fh', `'${T.hfont}',${fb}`);
      if (col.test(T.btn)) css += `.btn:not(.ghost),.badge{background:${T.btn};border-color:${T.btn}}.btn.ghost{border-color:${T.btn}}`;
      if (col.test(T.footer)) css += `footer{background:${T.footer}}`;
    }
    const cc = SETTINGS['public.custom_css']; if (typeof cc === 'string') css += cc;
    if (css) { const s = document.createElement('style'); s.textContent = css; document.head.appendChild(s); }
    const lg = SETTINGS['public.logo'];
    if (lg) $$('.logo').forEach(e => e.innerHTML = `<img src="${esc(imgUrl(lg))}" alt="${esc(SETTINGS['public.store_name'] || '')}" style="height:38px;width:auto">`);
    const hi = SETTINGS['public.hero_image'], h = $('.hero');
    if (hi && h) { h.classList.add('has-img'); h.style.setProperty('--hero-img', `url("${encodeURI(imgUrl(hi))}")`); }
  }

  /* ===== الرأس والتذييل ===== */
  const NAV = [['#/', 'الرئيسية'], ['#/products', 'تسوّق المفرد'], ['#/wholesale', 'تسوّق الجملة'], ['#/advisor', 'مستشار العطور'], ['@fam', 'العائلات العطرية'], ['#/about', 'من نحن'], ['https://frixcode.com', 'عالم براند FRIX']];
  function mountLayout() {
    const lk = ([h, t]) => h === '@fam' ? `<details class="dd"><summary>${t}</summary><div class="ddm" data-fm><span class="meta">جارٍ التحميل…</span></div></details>` : h.startsWith('https://') ? `<a class="frx-link" href="${h}" target="_blank" rel="noopener noreferrer">${t}</a>` : `<a href="${h}">${t}</a>`;
    const links = NAV.map(lk).join('');
    const MAINH = ['#/', '#/products', '#/wholesale', '#/advisor'];
    const IC = { '#/': 'M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z', '#/products': 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z', '#/wholesale': 'M21 8l-9-5-9 5v8l9 5 9-5zM3 8l9 5 9-5M12 13v8', '#/advisor': 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z', '@fam': 'M12 3l9 5-9 5-9-5zM3 13l9 5 9-5', '#/about': 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v5M12 8h.01', 'https://frixcode.com': 'M7 17L17 7M8 7h9v9' };
    const ico = h => `<svg class="di" viewBox="0 0 24 24" aria-hidden="true"><path d="${IC[h] || IC['#/']}"/></svg>`;
    const dlk = ([h, t]) => h === '@fam' ? `<details class="dd"><summary>${ico(h)}<span>${t}</span></summary><div class="ddm" data-fm><span class="meta">جارٍ التحميل…</span></div></details>` : h.startsWith('https://') ? `<a class="frx-link" href="${h}" target="_blank" rel="noopener noreferrer">${ico(h)}<span>${t}</span></a>` : `<a href="${h}">${ico(h)}<span>${t}</span></a>`;
    const drawerNav = '<div class="drawer-sec">التسوق</div>' + NAV.filter(([h]) => MAINH.includes(h)).map(dlk).join('') + '<div class="drawer-sec">استكشف</div>' + NAV.filter(([h]) => !MAINH.includes(h)).map(dlk).join('');
    const hd = $('#site-header');
    if (hd) hd.innerHTML = `<div id="installBar" hidden style="background:var(--ink);color:#fff;padding:8px 0;padding-top:max(8px,env(safe-area-inset-top,0px))"><div class="wrap" style="display:flex;align-items:center;gap:10px"><button type="button" class="btn sm ghost" id="installBtn" style="flex:1">ثبّت التطبيق</button><button type="button" id="installClose" aria-label="إغلاق" style="background:none;border:0;color:#fff;font-size:1.5rem;line-height:1;cursor:pointer;padding:0 8px">×</button></div><p id="installHelp" hidden style="margin:0;padding:8px var(--sp-4) 0;text-align:center;font-size:.9rem"></p></div><header><div class="wrap">
      <div class="bar">
        <button class="icon-btn menu-btn" id="menuBtn" aria-label="القائمة" aria-expanded="false"><svg viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h16"/></svg></button>
        <a href="#/" class="logo store-name">عطور السيد</a>
        <nav class="main" aria-label="التنقل الرئيسي">${links}</nav><span class="sp"></span>
        <button class="icon-btn" id="searchBtn" aria-label="بحث"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg></button>
        <a class="icon-btn" href="#/cart" aria-label="السلة"><svg viewBox="0 0 24 24"><path d="M3 4h2l2.4 11h10.2L20 7H6.2"/><circle cx="9" cy="19.5" r="1.4"/><circle cx="17" cy="19.5" r="1.4"/></svg><span class="badge" id="cartCount">0</span></a>
      </div>
      <div class="searchbar" id="searchbar"><form id="searchForm" role="search"><input type="search" name="q" placeholder="ابحث بالاسم أو رمز المنتج" aria-label="بحث"><button class="btn sm" type="submit">بحث</button></form></div>
    </div></header>`;
    const ft = $('#site-footer');
    if (ft) ft.innerHTML = `<footer><div class="wrap"><div class="cols">
      <div><h4 class="store-name">عطور السيد</h4><p>عطور للأفراد وأصحاب المحلات، بخيارات واضحة وأسعار معلنة.</p></div>
      <div><h4>المتجر</h4><a href="#/products">جميع العطور</a><a href="#/wholesale">تسوّق الجملة</a><a href="#/about">من نحن</a></div>
      <div><h4>تواصل معنا</h4><a href="#/contact">صفحة التواصل</a><a href="#" data-wa="مرحبًا، لدي استفسار عن العطور.">واتساب</a></div>
      <div class="frx-footer"><h4>عالم براند FRIX</h4><p>براند عطور بهوية مستقلة، يجمع بين التجربة العطرية والرؤية الثقافية.</p><a href="https://frixcode.com" target="_blank" rel="noopener noreferrer">اكتشف براند FRIX</a></div>
    </div><div class="copy">© ${new Date().getFullYear()} عطور السيد. جميع الحقوق محفوظة.</div></div></footer>`;
    document.getElementById('drawerRoot')?.remove();
    const dRoot = document.createElement('div'); dRoot.id = 'drawerRoot';
    dRoot.innerHTML = `<div class="drawer-backdrop" id="drawerBackdrop" hidden></div>
      <aside class="drawer" id="drawer" aria-hidden="true" aria-label="القائمة">
        <div class="drawer-head"><a href="#/" class="logo store-name">عطور السيد</a><button type="button" class="drawer-close" id="drawerClose" aria-label="إغلاق القائمة">×</button></div>
        <nav class="drawer-links" aria-label="القائمة الجانبية">${drawerNav}</nav>
        <div class="drawer-foot"><a href="#/cart">سلة المشتريات</a><a href="#" data-wa="مرحبا، لدي استفسار عن العطور.">تواصل عبر واتساب</a></div>
      </aside>`;
    document.body.appendChild(dRoot);
    const mb = $('#menuBtn'), sbtn = $('#searchBtn'), dr = $('#drawer'), bd = $('#drawerBackdrop');
    let lastFocus = null;
    const isOpen = () => dr.classList.contains('open');
    const setDrawer = o => {
      if (o === isOpen()) return;
      dr.style.transform = ''; dr.style.transition = ''; bd.style.opacity = '';
      dr.classList.toggle('open', o); bd.hidden = !o; dr.setAttribute('aria-hidden', String(!o));
      if ('inert' in dr) dr.inert = !o;
      document.documentElement.classList.toggle('drawer-visible', o); document.body.classList.toggle('drawer-visible', o);
      if (mb) mb.setAttribute('aria-expanded', String(o));
      if (o) { lastFocus = document.activeElement; setTimeout(() => $('#drawerClose').focus({ preventScroll: true }), 60); }
      else if (lastFocus && lastFocus.focus) { try { lastFocus.focus({ preventScroll: true }); } catch (_) {} lastFocus = null; }
    };
    if ('inert' in dr) dr.inert = true;
    window.App && (window.App.closeDrawer = () => setDrawer(false));
    if (mb) mb.onclick = e => { e.stopPropagation(); setDrawer(!isOpen()); };
    $('#drawerClose').onclick = () => setDrawer(false);
    /* الخلفية المعتمة تغطي الشاشة كاملة؛ الضغط عليها (أي مكان خارج القائمة) يغلق القائمة */
    bd.addEventListener('click', () => setDrawer(false));
    dr.addEventListener('click', e => { if (e.target.closest('a')) setDrawer(false); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') setDrawer(false); });
    window.addEventListener('resize', () => { if (innerWidth >= 900) setDrawer(false); });
    window.addEventListener('hashchange', () => setDrawer(false));
    /* سحب القائمة نحو اليمين (اتجاه الإغلاق) يغلقها */
    (() => {
      let x0 = null, y0 = 0, dx = 0, lock = false;
      dr.addEventListener('touchstart', e => { if (!isOpen() || e.touches.length !== 1) return; x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; dx = 0; lock = false; }, { passive: true });
      dr.addEventListener('touchmove', e => {
        if (x0 === null) return;
        const t = e.touches[0], mx = t.clientX - x0, my = t.clientY - y0;
        if (!lock) { if (Math.abs(mx) > 10 && Math.abs(mx) > Math.abs(my) * 1.3) { lock = true; dr.style.transition = 'none'; } else if (Math.abs(my) > 10) { x0 = null; return; } else return; }
        dx = Math.max(0, mx);
        dr.style.transform = `translateX(${dx}px)`; bd.style.opacity = String(Math.max(0, 1 - dx / dr.offsetWidth));
      }, { passive: true });
      const end = () => { if (x0 === null) return; const close = lock && dx > dr.offsetWidth * 0.3; x0 = null; if (!lock) return; dr.style.transition = ''; if (close) setDrawer(false); else { dr.style.transform = ''; bd.style.opacity = ''; } };
      dr.addEventListener('touchend', end); dr.addEventListener('touchcancel', end);
    })();
    if (sbtn) sbtn.onclick = () => { const s = $('#searchbar'); s.classList.toggle('open'); if (s.classList.contains('open')) $('input', s).focus(); };
    const qv = new URLSearchParams(location.search).get('q'); if (qv && $('#searchbar input')) $('#searchbar input').value = qv;
    Cart.badge();
  }

  document.addEventListener('click', e => {
    const w = e.target.closest('[data-wa]'); if (w) { e.preventDefault(); openWA(w.dataset.wa); return; }
    const a = e.target.closest('[data-add]');
    if (a) { Cart.add(a.dataset.add, 1, a.dataset.price ? +a.dataset.price : null); toast('أُضيف إلى السلة'); }
  });

  /* ===== المنتجات ===== */
  const PSEL = 'id,slug,sku,name,group_key,size_value,size_unit,retail_price,stock,status,featured,created_at,product_images(path,sort_order),price_tiers(min_qty,unit_price),product_terms(term_id)';
  const imgUrl = p => CONFIG.SUPABASE_URL + '/storage/v1/object/public/product-images/' + p;
  function prep(p) {
    const imgs = [...(p.product_images || [])].sort((a, b) => a.sort_order - b.sort_order);
    const tier = [...(p.price_tiers || [])].sort((a, b) => a.unit_price - b.unit_price)[0];
    return { ...p, tier, image: imgs[0] ? imgUrl(imgs[0].path) : '', fams: termNames(p, 'family') };
  }
  const sizes = () => { const s = SETTINGS['public.sizes'], l = Array.isArray(s) && s.length ? s.map(Number).filter(n => n > 0) : [10, 30, 50, 100]; return PRESENT ? l.filter(n => PRESENT.has(n)) : l; };

  /* العطر الواحد بأحجام متعددة = منتجات تشترك في group_key، وتُعرض بطاقة واحدة فيها قائمة منسدلة للأحجام */
  const POCKET_ML = 10, POCKET = 'عطر جيب صغير';
  const sizeLbl = (v, u) => { if (!v) return ''; const m = !u || u === 'ml'; return m && +v === POCKET_ML ? POCKET : v + ' ' + (m ? 'مل' : u); };
  const sizeTxt = p => sizeLbl(p.size_value, p.size_unit);
  const isOut = p => p.status === 'unavailable' || p.stock < 1;
  const tierTxt = p => p.tier ? `جملة: ${IQD(p.tier.unit_price)} من ${p.tier.min_qty} قطع` : 'لا يوجد سعر جملة حاليًا';
  function groupBy(list) {
    const m = new Map();
    (list || []).forEach(p => { const k = p.group_key || p.id; if (!m.has(k)) m.set(k, []); m.get(k).push(p); });
    return [...m.values()].map(g => g.sort((a, b) => (+b.size_value || 0) - (+a.size_value || 0)));
  }
  function cardHTML(x) {
    const g = Array.isArray(x) ? x : [x];
    const def = g.find(p => !isOut(p)) || g[0], out = isOut(def);
    const fb = (g.find(p => p.image) || {}).image || '';
    const V = g.map(p => ({ name: p.name, slug: p.slug, sku: p.sku, id: p.id, price: p.retail_price, out: isOut(p), tier: tierTxt(p), img: p.image || fb }));
    const href = '#/product?slug=' + encodeURIComponent(def.slug), img = def.image || fb;
    const sz = g.length > 1
      ? `<label class="sz">الحجم<select class="size-sel" aria-label="اختر الحجم">${g.map((p, i) => `<option value="${i}" ${p === def ? 'selected' : ''}>${esc(sizeTxt(p))}${isOut(p) ? ' (غير متوفر)' : ''}</option>`).join('')}</select></label>`
      : (sizeTxt(def) ? `<span class="meta">${esc(sizeTxt(def))}</span>` : '');
    return `<article class="card" data-v="${esc(JSON.stringify(V))}"><a class="ph" data-pl href="${href}">${img ? `<img src="${esc(img)}" alt="${esc(def.name)}" loading="lazy">` : '<span>لا توجد صورة</span>'}</a>
      <div class="bd"><h3>${esc(def.name)}</h3>${(def.fams || []).slice(0, 2).map(n => `<span class="chip fam-chip">${esc(n)}</span>`).join('')}<span class="meta sku">${esc(def.sku)}</span>${sz}
      <span class="price">${IQD(def.retail_price)}</span><span class="ws">${esc(tierTxt(def))}</span><span class="stock ${out ? 'out' : 'in'}">${out ? 'غير متوفر' : 'متوفر'}</span></div>
      <div class="act"><a class="btn sm ghost" data-pl href="${href}">عرض التفاصيل</a><button class="btn sm" data-add="${esc(def.id)}" data-price="${def.retail_price}" ${out ? 'disabled' : ''}>إضافة سريعة</button></div></article>`;
  }
  document.addEventListener('change', e => {
    const s = e.target.closest && e.target.closest('.size-sel'); if (!s) return;
    const card = s.closest('.card'); let V; try { V = JSON.parse(card.dataset.v); } catch { return; }
    const v = V[+s.value]; if (!v) return;
    const href = '#/product?slug=' + encodeURIComponent(v.slug);
    card.querySelectorAll('a[data-pl]').forEach(a => a.href = href);
    card.querySelector('h3').textContent = v.name;
    card.querySelector('.sku').textContent = v.sku;
    card.querySelector('.price').textContent = IQD(v.price);
    card.querySelector('.ws').textContent = v.tier;
    const st = card.querySelector('.stock'); st.textContent = v.out ? 'غير متوفر' : 'متوفر'; st.className = 'stock ' + (v.out ? 'out' : 'in');
    const b = card.querySelector('[data-add]'); b.dataset.add = v.id; b.dataset.price = v.price; b.disabled = v.out;
    const im = card.querySelector('.ph img'); if (im && v.img) im.src = v.img;
  });
  function renderGrid(sel, list, max = 8, emptyText = 'لا توجد منتجات منشورة في هذا القسم حاليًا.') {
    const el = $(sel), gs = groupBy(list).slice(0, max);
    if (gs.length) { el.innerHTML = gs.map(cardHTML).join(''); return false; }
    el.innerHTML = `<div class="empty product-empty" role="status">${esc(emptyText)}</div>`;
    return true;
  }
  async function homeData() {
    if (!connected()) return { featured: [], latest: [], all: [] };
    const all = (await sb('products?select=' + encodeURIComponent(PSEL) + '&status=in.(published,unavailable)&order=created_at.desc&limit=200')).map(prep);
    return { featured: all.filter(p => p.featured), latest: all, all };
  }

  /* التصنيفات العطرية من القاعدة (المفعّلة فقط): تغذّي القائمة والبطاقات والفلاتر */
  const TM = {};
  const termsP = (async () => { if (!connected()) return []; const r = await sb('taxonomy_terms?select=id,kind,name&active=eq.true&order=sort_order,id'); r.forEach(t => TM[t.id] = t); return r; })().catch(() => []);
  const termNames = (p, kind) => (p.product_terms || []).map(t => TM[t.term_id]).filter(t => t && t.kind === kind).map(t => t.name);
  const fillMenu = rows => { const fam = rows.filter(t => t.kind === 'family'); $$('[data-fm]').forEach(el => el.innerHTML = fam.length ? fam.map(t => `<a href="#/products?fam=${t.id}">${esc(t.name)}</a>`).join('') : '<span class="meta">لا توجد عائلات متاحة بعد</span>'); };
  document.addEventListener('click', e => { document.querySelectorAll('.dd[open]').forEach(d => { if (!d.contains(e.target) || e.target.closest('.ddm a')) d.open = false; }); });
  addEventListener('hashchange', () => document.querySelectorAll('.dd[open]').forEach(d => d.open = false));
  const ready = (async () => { mountLayout(); await Promise.all([loadSettings(), termsP]); fillMenu(await termsP); })();
  window.App = { sizeLbl, Pkg, CONFIG, $, $$, esc, IQD, connected, toast, sb, rpc, Cart, openWA, SETTINGS, PSEL, prep, imgUrl, cardHTML, groupBy, renderGrid, homeData, sizes, ready, UUID, TM, termNames, terms: () => termsP };
})();

/* ===== الموجّه: صفحة واحدة بروابط #/ ===== */
(() => {
  const Pages = {};
  Pages.home = async (App) => {
  await App.ready;
  { /* ترتيب أقسام الرئيسية من الإدارة (public.home_order) */
    const hero = App.$('.hero'), root = hero && hero.parentElement, saved = App.SETTINGS['public.home_order'];
    if (root && Array.isArray(saved)) {
      const defs = ['hero', 'frix', 'advisor', 'categories', 'featured', 'latest', 'wholesale', 'steps', 'faq'];
      const sel = { hero: '.hero', frix: '#frixCardSection', advisor: '.advisor-panel', categories: '#cats', featured: '#featured', latest: '#latest', wholesale: '.panel.light', steps: '.steps' };
      const secs = {}, used = new Set();
      Object.entries(sel).forEach(([k, q]) => { const el = root.querySelector(q), s = el && (el.tagName === 'SECTION' ? el : el.closest('section')); if (s && s.parentElement === root) { secs[k] = s; used.add(s); } });
      const rest = [...root.children].filter(el => el.tagName === 'SECTION' && !used.has(el)); if (rest.length) secs.faq = rest[rest.length - 1];
      const order = [...saved.filter(k => defs.includes(k)), ...defs.filter(k => !saved.includes(k))];
      order.forEach(k => { if (secs[k]) root.appendChild(secs[k]); });
    }
  }
  const sizeLinks = App.$('#sizes');
  if (sizeLinks) sizeLinks.innerHTML = App.sizes().map(n => `<a class="cat" href="#/products?size=${n}">${App.sizeLbl(n)}</a>`).join('');
  let d={featured:[],latest:[],all:[]};
  try{ d=await App.homeData(); }catch{ App.toast('تعذّر تحميل المنتجات. حاول مرة أخرى.'); }
  const featuredEmpty=App.renderGrid('#featured',d.featured,8,'لا توجد منتجات مميزة منشورة حاليًا.');
  const latestEmpty=App.renderGrid('#latest',d.latest,8,'ستظهر المنتجات هنا فور إضافتها ونشرها من لوحة الإدارة.');
  const note=App.$('#sampleNote');
  if(note){note.textContent='لا توجد منتجات منشورة حاليًا. ستظهر منتجات المتجر الحقيقية وأسعارها بعد إضافتها من لوحة الإدارة.';note.hidden=!(featuredEmpty&&latestEmpty);}
};
  Pages.products = async (App) => {
  const { $, esc, IQD, sb, connected, toast, PSEL, prep, cardHTML, groupBy } = App;
  await App.ready;
  const PER = 12, KEYS = ['q', 'cat', 'min', 'max', 'size', 'fam', 'mood', 'avail', 'sort', 'page'];
  const clean = s => String(s || '').replace(/[,()*\\%]/g, ' ').trim().slice(0, 60);
  const num = v => (v !== '' && v != null && isFinite(+v) && +v >= 0) ? Math.floor(+v) : '';
  let st = {}; const P = new URLSearchParams(App.qs());
  KEYS.forEach(k => st[k] = P.get(k) || '');
  st.page = Math.max(1, +st.page || 1);
  const f = $('#ff'), out = $('#out');
  if (matchMedia('(min-width:900px)').matches) $('#fdet').open = true;

  const fill = (sel, items) => items.forEach(([v, t]) => sel.add(new Option(t, v)));
  async function loadOptions() {
    if (!connected()) return;
    try {
      const cats = await sb('categories?select=slug,name&order=sort_order');
      fill(f.cat, cats.map(c => [c.slug, c.name]));
      fill(f.size, App.sizes().map(n => [n, App.sizeLbl(n)]));
      const T = await App.terms(), grp = (id, kind) => { $('#g-' + id).innerHTML = T.filter(t => t.kind === kind).map(t => `<label class="chk"><input type="checkbox" name="${id}" value="${t.id}"> ${esc(t.name)}</label>`).join('') || '<span class="meta">لا توجد خيارات</span>'; };
      grp('fam', 'family'); grp('mood', 'mood');
      if (matchMedia('(min-width:900px)').matches) f.querySelectorAll('.fg').forEach(d => d.open = true);
    } catch { /* الفلاتر تبقى متاحة بدون خيارات */ }
    syncForm();
  }
  function syncForm() { ['q', 'cat', 'min', 'max', 'size'].forEach(k => f[k].value = st[k]); f.querySelectorAll('input[name=fam],input[name=mood]').forEach(c => c.checked = (st[c.name] || '').split(',').includes(c.value)); f.avail.checked = st.avail === '1'; $('#sort').value = st.sort || 'new'; }
  function pushURL() {
    const u = new URLSearchParams();
    KEYS.forEach(k => { if (st[k] && !(k === 'page' && st[k] === 1) && !(k === 'sort' && st[k] === 'new')) u.set(k, st[k]); });
    history.replaceState(null, '', '#/products' + (u.toString() ? '?' + u : ''));
  }
  function applyForm() {
    const chk = n => [...f.querySelectorAll('input[name=' + n + ']:checked')].map(c => c.value).join(',');
    st.q = clean(f.q.value); st.cat = f.cat.value; st.min = num(f.min.value); st.max = num(f.max.value);
    st.size = f.size.value; st.fam = chk('fam'); st.mood = chk('mood'); st.avail = f.avail.checked ? '1' : ''; st.page = 1; load();
  }

  async function load() {
    pushURL();
    { const cn = []; if (st.q) cn.push(['q', 'بحث: ' + st.q]); if (st.cat) cn.push(['cat', f.cat.selectedOptions[0]?.text || st.cat]); if (st.size) cn.push(['size', App.sizeLbl(st.size)]);
      if (st.min !== '') cn.push(['min', 'من ' + st.min]); if (st.max !== '') cn.push(['max', 'إلى ' + st.max]); if (st.avail) cn.push(['avail', 'المتوفر فقط']);
      ['fam', 'mood'].forEach(k => (st[k] ? st[k].split(',') : []).forEach(i => App.TM[i] && cn.push([k + ':' + i, App.TM[i].name])));
      $('#chips').innerHTML = cn.length ? cn.map(([k, t]) => `<button type="button" class="chip x" data-rm="${esc(k)}">${esc(t)} ×</button>`).join('') + '<button type="button" class="chip x" data-rm="*">مسح الكل</button>' : ''; }
    $('#crumb').textContent = $('#title').textContent = (f.cat.selectedOptions[0]?.value && st.cat ? f.cat.selectedOptions[0].text : 'جميع العطور');
    if (!connected()) {
      out.innerHTML = '<div class="state"><b>المتجر غير متصل بقاعدة البيانات بعد</b><span>بعد إضافة رابط Supabase والمفتاح العام في app.js ستظهر المنتجات هنا.</span></div>';
      $('#count').textContent = ''; $('#pager').hidden = true; return;
    }
    out.innerHTML = '<div class="grid">' + '<div class="skel"></div>'.repeat(4) + '</div>';
    try {
      const ids = [...new Set([...(st.fam ? st.fam.split(',') : []), ...(st.mood ? st.mood.split(',') : [])].filter(x => /^\d+$/.test(x)))];
      const sel = PSEL + ',categories' + (st.cat ? '!inner' : '') + '(slug,name)' + ids.map(i => `,t${i}:product_terms!inner(term_id)`).join('');
      const qs = ['select=' + encodeURIComponent(sel), 'status=in.(published,unavailable)'];
      if (st.q) qs.push('or=' + encodeURIComponent(`(name.ilike.*${st.q}*,sku.ilike.*${st.q}*)`));
      if (st.cat) qs.push('categories.slug=eq.' + encodeURIComponent(st.cat));
      if (st.min !== '') qs.push('retail_price=gte.' + st.min);
      if (st.max !== '') qs.push('retail_price=lte.' + st.max);
      if (st.size) qs.push('size_value=eq.' + encodeURIComponent(st.size));
      ids.forEach(i => qs.push('t' + i + '.term_id=eq.' + i)); /* مطابقة كل الاختيارات، والمنتج لا يتكرر */
      if (st.avail) qs.push('status=eq.published', 'stock=gt.0');
      qs.push('order=' + ({ price_asc: 'retail_price.asc', price_desc: 'retail_price.desc' }[st.sort] || 'created_at.desc'));
      qs.push('limit=' + PER, 'offset=' + (st.page - 1) * PER);
      const { rows, total } = await sb('products?' + qs.join('&'), { count: true });
      $('#count').textContent = total ? `${total} منتج` : '';
      if (!rows.length) {
        const pages = Math.ceil(total / PER);
        if (total && st.page > pages) { st.page = pages; return load(); }
        out.innerHTML = '<div class="state"><b>لا توجد نتائج مطابقة</b><span>جرّب تغيير كلمات البحث أو مسح عوامل التصفية.</span><button class="btn sm ghost" id="r2">مسح التصفية</button></div>';
        $('#r2').onclick = reset; $('#pager').hidden = true; return;
      }
      out.innerHTML = '<div class="grid">' + groupBy(rows.map(prep)).map(cardHTML).join('') + '</div>';
      pager(Math.ceil(total / PER));
    } catch {
      out.innerHTML = '<div class="state err"><b>تعذّر تحميل المنتجات</b><span>تحقق من الاتصال ثم أعد المحاولة.</span><button class="btn sm" id="retry">إعادة المحاولة</button></div>';
      $('#retry').onclick = load; $('#pager').hidden = true;
    }
  }
  function pager(pages) {
    const p = $('#pager'); p.hidden = pages <= 1; if (pages <= 1) return;
    p.innerHTML = `<button class="btn sm ghost" ${st.page <= 1 ? 'disabled' : ''} data-p="${st.page - 1}">السابق</button><span>صفحة ${st.page} من ${pages}</span><button class="btn sm ghost" ${st.page >= pages ? 'disabled' : ''} data-p="${st.page + 1}">التالي</button>`;
  }
  function reset() { st = { q: '', cat: '', min: '', max: '', size: '', fam: '', mood: '', avail: '', sort: 'new', page: 1 }; syncForm(); load(); }

  f.onsubmit = e => { e.preventDefault(); applyForm(); };
  $('#reset').onclick = reset;
  $('#chips').onclick = e => { const b = e.target.closest('[data-rm]'); if (!b) return; const k = b.dataset.rm; if (k === '*') return reset(); if (k.includes(':')) { const [g, i] = k.split(':'); st[g] = st[g].split(',').filter(x => x !== i).join(','); } else st[k] = ''; st.page = 1; syncForm(); load(); };
  $('#sort').onchange = e => { st.sort = e.target.value; st.page = 1; load(); };
  $('#pager').onclick = e => { const b = e.target.closest('[data-p]'); if (b && !b.disabled) { st.page = +b.dataset.p; load(); scrollTo({ top: 0 }); } };
  syncForm(); await loadOptions(); load();
};
  Pages.product = async (App) => {
  const { $, esc, IQD, sb, connected, Cart, openWA, toast, imgUrl } = App;
  await App.ready;
  const out = $('#out'), slug = new URLSearchParams(App.qs()).get('slug');
  const state = (t, s, err) => out.innerHTML = `<div class="state${err ? ' err' : ''}"><b>${t}</b><span>${s}</span><a class="btn sm ghost" href="#/products">العودة إلى الكتالوج</a></div>`;
  if (!slug) return state('المنتج غير محدد', 'افتح المنتج من صفحة الكتالوج.');
  if (!connected()) return state('المتجر غير متصل بقاعدة البيانات بعد', 'ستظهر تفاصيل المنتج بعد ربط Supabase.');

  let p;
  try {
    const rows = await sb('products?slug=eq.' + encodeURIComponent(slug) + '&status=in.(published,unavailable)&limit=1&select=' +
      encodeURIComponent('id,slug,sku,name,group_key,short_desc,description,size_value,size_unit,longevity,sillage,occasions,intensity,retail_price,stock,status,origin_note,seo_title,seo_description,product_images(path,sort_order),price_tiers(min_qty,unit_price,label),product_terms(term_id),categories(name)'));
    p = rows[0];
  } catch { return state('تعذّر تحميل المنتج', 'تحقق من الاتصال ثم أعد المحاولة.', true); }
  if (!p) return state('المنتج غير موجود', 'قد يكون الرابط قديمًا أو المنتج مخفيًا.');

  let sibs = [];
  if (p.group_key) { try { sibs = await sb('products?group_key=eq.' + encodeURIComponent(p.group_key) + '&status=in.(published,unavailable)&select=slug,size_value,size_unit,retail_price,stock,status&order=size_value'); } catch {} }
  const szl = s => App.sizeLbl(s.size_value, s.size_unit) || '—';
  const sizePick = sibs.length > 1 ? `<label class="f" style="margin-top:var(--sp-3)">الحجم<select id="szs">${sibs.map(s => `<option value="${esc(s.slug)}" ${s.slug === p.slug ? 'selected' : ''}>${esc(szl(s))} — ${IQD(s.retail_price)}${(s.status === 'unavailable' || s.stock < 1) ? ' (غير متوفر)' : ''}</option>`).join('')}</select></label>` : '';
  const imgs = [...p.product_images].sort((a, b) => a.sort_order - b.sort_order).map(i => imgUrl(i.path));
  const tiers = [...p.price_tiers].filter(t => t.unit_price < p.retail_price).sort((a, b) => a.min_qty - b.min_qty);
  const unavailable = p.status === 'unavailable' || p.stock < 1;
  const priceFor = q => Math.min(p.retail_price, ...tiers.filter(t => t.min_qty <= q).map(t => t.unit_price));
  const INT = { calm: 'هادئ', medium: 'متوسط', strong: 'قوي' };
  const OCC = { daily: 'يومي', work: 'عمل', special: 'مناسبة خاصة', gift: 'هدية' };

  document.title = (p.seo_title || p.name) + ' | عطور السيد';
  const md = document.querySelector('meta[name=description]');
  md.content = p.seo_description || p.short_desc || md.content;
  $('#crumb').textContent = p.name;
  const og = (k, v) => { const m = document.createElement('meta'); m.setAttribute('property', k); m.content = v; m.dataset.rh = 1; document.head.appendChild(m); };
  og('og:title', p.name); if (p.short_desc) og('og:description', p.short_desc); if (imgs[0]) og('og:image', imgs[0]);
  const ld = document.createElement('script'); ld.type = 'application/ld+json'; ld.dataset.rh = 1;
  ld.textContent = JSON.stringify({ '@context': 'https://schema.org', '@type': 'Product', name: p.name, sku: p.sku, ...(p.short_desc && { description: p.short_desc }), ...(imgs[0] && { image: imgs }),
    offers: { '@type': 'Offer', priceCurrency: 'IQD', price: p.retail_price, availability: unavailable ? 'https://schema.org/OutOfStock' : 'https://schema.org/InStock' } });
  document.head.appendChild(ld);

  const chips = [p.categories?.name, ...App.termNames(p, 'family'), ...App.termNames(p, 'mood'), INT[p.intensity] && 'حضور ' + INT[p.intensity], p.longevity && 'الثبات: ' + p.longevity, p.sillage && 'الانتشار: ' + p.sillage, ...(p.occasions || []).map(o => OCC[o] || o)].filter(Boolean);
  out.innerHTML = `<div class="pd">
    <div class="gal"><div class="main" id="main">${imgs[0] ? `<img src="${esc(imgs[0])}" alt="${esc(p.name)}">` : '<span>لا توجد صورة لهذا المنتج</span>'}</div>
      ${imgs.length > 1 ? `<div class="thumbs">${imgs.map((u, i) => `<button type="button" data-i="${i}" aria-label="صورة ${i + 1}" aria-current="${i === 0}"><img src="${esc(u)}" alt="" loading="lazy"></button>`).join('')}</div>` : ''}</div>
    <div>
      <h1>${esc(p.name)}</h1>
      <div class="meta">رمز المنتج: ${esc(p.sku)}${p.size_value ? ' · ' + esc(App.sizeLbl(p.size_value, p.size_unit)) : ''}</div>
      <div class="chips">${chips.map(c => `<span class="chip">${esc(c)}</span>`).join('')}</div>
      ${sizePick}
      <div class="big" id="price">${IQD(p.retail_price)}</div>
      <div class="stock ${unavailable ? 'out' : 'in'}">${unavailable ? 'غير متوفر حاليًا' : 'متوفر'}</div>
      ${tiers.length ? `<table class="t" aria-label="أسعار الكميات"><thead><tr><th>الكمية</th><th>سعر القطعة</th></tr></thead><tbody id="tt">
        <tr data-m="1"><td>قطعة واحدة (تجزئة)</td><td>${IQD(p.retail_price)}</td></tr>
        ${tiers.map(t => `<tr data-m="${t.min_qty}"><td>من ${t.min_qty} قطع${t.label ? ' · ' + esc(t.label) : ''}</td><td>${IQD(t.unit_price)}</td></tr>`).join('')}</tbody></table>` : '<p class="meta" style="margin-top:8px">لا توجد أسعار جملة لهذا المنتج حاليًا.</p>'}
      <div class="buy"><div class="qty"><button type="button" id="mn" aria-label="إنقاص">−</button><input type="number" id="q" value="1" min="1" max="99" inputmode="numeric" aria-label="الكمية"><button type="button" id="pl" aria-label="زيادة">+</button></div>
        <button class="btn" id="add" ${unavailable ? 'disabled' : ''}>إضافة إلى السلة</button>
        <button class="btn ghost" id="wa" ${unavailable ? 'disabled' : ''}>اطلب عبر واتساب</button></div>
      <div class="meta" id="line"></div>
      ${p.short_desc ? `<p style="margin-top:var(--sp-4)">${esc(p.short_desc)}</p>` : ''}
      ${p.description ? `<p style="margin-top:var(--sp-3);white-space:pre-line">${esc(p.description)}</p>` : ''}
      ${p.origin_note ? `<p class="note">${esc(p.origin_note)}</p>` : ''}
    </div></div>`;

  const qi = $('#q');
  const getQ = () => Math.max(1, Math.min(99, Math.floor(+qi.value) || 1));
  function upd() {
    const q = getQ(); qi.value = q; const u = priceFor(q);
    $('#price').textContent = IQD(u) + (u < p.retail_price ? ' للقطعة' : '');
    $('#line').textContent = `الإجمالي التقديري: ${IQD(u * q)} (يتأكد السعر النهائي في السلة)`;
    const on = tiers.filter(t => t.min_qty <= q).pop()?.min_qty || 1;
    App.$$('#tt tr').forEach(r => r.classList.toggle('on', +r.dataset.m === on));
  }
  qi.oninput = upd; $('#mn').onclick = () => { qi.value = getQ() - 1; upd(); }; $('#pl').onclick = () => { qi.value = getQ() + 1; upd(); };
  $('#add').onclick = () => { Cart.add(p.id, getQ(), p.retail_price); toast('أُضيف إلى السلة'); };
  $('#wa').onclick = () => { const q = getQ(), u = priceFor(q);
    openWA(`مرحبًا، أرغب بطلب:\n- ${p.name} (${p.sku}) × ${q}\nسعر القطعة المعروض: ${IQD(u)}\nالإجمالي التقديري: ${IQD(u * q)}\nهل يمكن تأكيد الطلب؟`); };
  const th = App.$('.thumbs');
  if (th) th.onclick = e => { const b = e.target.closest('button'); if (!b) return; $('#main').innerHTML = `<img src="${esc(imgs[b.dataset.i])}" alt="${esc(p.name)}">`; th.querySelectorAll('button').forEach(x => x.setAttribute('aria-current', x === b)); };
  { const ss = $('#szs'); if (ss) ss.onchange = () => { location.hash = '#/product?slug=' + encodeURIComponent(ss.value); }; }
  upd();
};
  Pages.cart = async (App) => {
  const { $, esc, IQD, sb, rpc, connected, Cart, Pkg, openWA, toast, imgUrl } = App;
  await App.ready;
  const out = $('#out');
  let govs = [], gov = +(localStorage.getItem('as_gov') || 0) || '', notices = [], seenChecked = false, last = null;

  const empty = (t, s, err) => out.innerHTML = `<div class="state${err ? ' err' : ''}"><b>${t}</b><span>${s}</span><a class="btn sm" href="#/products">تصفح العطور</a></div>`;

  const pkgBad = () => { out.innerHTML = `<div class="state err"><b>باكيج الاستكشاف لم يعد صالحًا</b><span>قد يكون أحد عطوره غير متوفر الآن أو تغيّرت إعدادات الباكيج. احذف الباكيج وأعد بناءه من المستشار.</span><button class="btn sm" id="clrpk">حذف الباكيجات من السلة</button><a class="btn sm ghost" href="#/advisor">مستشار العطور</a></div>`; };

  async function build() {
    const items = Cart.get(), pk = Pkg.get();
    if (!items.length && !pk.length) return empty('السلة فارغة', 'أضف عطرًا من الكتالوج لتبدأ.');
    if (!connected()) return empty('المتجر غير متصل بقاعدة البيانات بعد', 'لا يمكن حساب الأسعار قبل ربط Supabase.');
    let priced, meta = {};
    try {
      const ids = items.map(i => i.product_id).join(',');
      const [pr, rows, g] = await Promise.all([
        pk.length ? rpc('price_cart_pkg', { p_items: items.map(({ product_id, qty }) => ({ product_id, qty })), p_packages: pk.map(({ package_id, picks }) => ({ package_id, picks })), p_governorate_id: gov || null })
          : rpc('price_cart', { p_items: items.map(({ product_id, qty }) => ({ product_id, qty })), p_governorate_id: gov || null }),
        items.length ? sb('products?id=in.(' + ids + ')&select=slug,id,size_value,size_unit,product_images(path,sort_order)') : [],
        govs.length ? govs : sb('governorates?select=id,name,eta_text&active=eq.true&order=name')
      ]);
      priced = pr; govs = g;
      rows.forEach(r => { const im = [...r.product_images].sort((a, b) => a.sort_order - b.sort_order)[0]; meta[r.id] = { slug: r.slug, img: im ? imgUrl(im.path) : '', size: App.sizeLbl(r.size_value, r.size_unit) }; });
    } catch (e) { if (/^(PACKAGE_|INVALID_PACKAGES)/.test(String(e.message))) return pkgBad(); return empty('تعذّر حساب السلة', 'تحقق من الاتصال ثم أعد المحاولة.', true), $('.state').insertAdjacentHTML('beforeend', '<button class="btn sm ghost" id="rt">إعادة المحاولة</button>'), $('#rt').onclick = build; }
    last = priced;
    // تنبيه تغيّر السعر مقارنة بما رآه العميل عند الإضافة
    if (!seenChecked) {
      seenChecked = true;
      priced.lines.forEach(l => { const it = items.find(i => i.product_id === l.product_id);
        if (it && it.seen != null && l.retail_price != null && it.seen !== l.retail_price) notices.push(`تغيّر سعر «${l.name}» من ${IQD(it.seen)} إلى ${IQD(l.retail_price)}. راجع الإجمالي.`);
        if (l.retail_price != null) Cart.setSeen(l.product_id, l.retail_price); });
    }
    const gname = govs.find(x => x.id === gov);
    const shipTxt = priced.shipping == null ? 'اختر المحافظة' : priced.shipping === 0 ? 'مجاني' : IQD(priced.shipping);
    out.innerHTML = `${notices.map(n => `<div class="alert">${esc(n)}</div>`).join('')}
    ${priced.all_available ? '' : '<div class="alert err">بعض المنتجات غير متوفرة بالكمية المطلوبة. عدّل الكمية أو احذفها للمتابعة.</div>'}
    <div class="cartwrap"><div>${(priced.packages || []).map((p, i) => `<div class="line pkgline"><div><b>${esc(p.name)}</b> <span class="chip">باكيج استكشاف</span>
      <div class="meta">${esc(p.items.map(x => x.name).join('، '))}</div>
      <div class="ctl"><strong>${IQD(p.price)}</strong><button class="link" data-rmpkg="${esc((pk[i] || {}).uid || '')}">حذف</button></div></div></div>`).join('')}${priced.lines.map(l => {
      const m = meta[l.product_id] || {}, gone = l.name == null;
      return `<div class="line"><div class="im">${m.img ? `<img src="${esc(m.img)}" alt="" loading="lazy">` : 'بلا صورة'}</div>
      <div><b>${gone ? 'منتج لم يعد موجودًا' : `<a href="#/product?slug=${encodeURIComponent(m.slug || '')}">${esc(l.name)}</a>`}</b>
      ${gone ? '' : `<div class="meta">${esc(l.sku)}${m.size ? ' · ' + esc(m.size) : ''}</div>
      <div>${IQD(l.unit_price)} للقطعة${l.tier_min_qty ? ` <span class="chip">سعر الجملة من ${l.tier_min_qty} قطع</span>` : ''}</div>`}
      ${l.available ? '' : `<div class="stock out">${gone ? 'غير موجود' : l.stock > 0 ? 'الكمية المطلوبة غير متوفرة' : 'غير متوفر'}</div>`}
      <div class="ctl"><div class="qty"><button data-d="-1" data-id="${l.product_id}" aria-label="إنقاص">−</button><input type="number" min="1" max="99" value="${l.qty}" data-q="${l.product_id}" aria-label="الكمية"><button data-d="1" data-id="${l.product_id}" aria-label="زيادة">+</button></div>
      <strong>${l.unit_price != null ? IQD(l.unit_price * l.qty) : ''}</strong><button class="link" data-rm="${l.product_id}">حذف</button></div></div></div>`; }).join('')}</div>
    <aside class="sum"><h2 style="font-size:1.1rem;margin:0">ملخص الطلب</h2>
      <label class="f">المحافظة<select id="gov"><option value="">اختر المحافظة</option>${govs.map(g => `<option value="${g.id}" ${g.id === gov ? 'selected' : ''}>${esc(g.name)}</option>`).join('')}</select></label>
      ${gname?.eta_text ? `<div class="meta">مدة التوصيل المتوقعة: ${esc(gname.eta_text)}</div>` : ''}
      ${govs.length ? '' : '<div class="meta">لم تُفعَّل مناطق التوصيل بعد.</div>'}
      <div class="r"><span>المجموع الفرعي</span><span>${IQD(priced.subtotal)}</span></div>
      ${priced.discount > 0 ? `<div class="r"><span>خصم الكمية</span><span>− ${IQD(priced.discount)}</span></div>` : ''}
      <div class="r"><span>التوصيل</span><span>${shipTxt}</span></div>
      <div class="r tot"><span>الإجمالي</span><span>${IQD(priced.total)}</span></div>
      <a class="btn block" href="#/checkout" ${priced.all_available && gov ? '' : 'aria-disabled="true" style="pointer-events:none;opacity:.45"'}>إتمام الطلب</a>
      <button class="btn ghost block" id="wa">أرسل الطلب عبر واتساب</button>
      <button class="link" id="clr" style="justify-self:center">إفراغ السلة</button></aside></div>`;
  }

  out.addEventListener('click', e => {
    const d = e.target.closest('[data-d]'), r = e.target.closest('[data-rm]');
    if (d) { const it = Cart.get().find(i => i.product_id === d.dataset.id); Cart.setQty(d.dataset.id, it.qty + +d.dataset.d); build(); }
    else if (r) { Cart.remove(r.dataset.rm); build(); }
    else if (e.target.closest('[data-rmpkg]')) { Pkg.remove(e.target.closest('[data-rmpkg]').dataset.rmpkg); build(); }
    else if (e.target.id === 'clrpk') { Pkg.clear(); build(); }
    else if (e.target.id === 'clr' && confirm('إفراغ السلة بالكامل؟')) { Cart.clear(); build(); }
    else if (e.target.id === 'wa' && last) {
      const L = last.lines.filter(l => l.name);
      const g = govs.find(x => x.id === gov);
      openWA(['مرحبًا، أرغب بطلب:', ...L.map(l => `- ${l.name} (${l.sku}) × ${l.qty} — ${IQD(l.unit_price)}`),
        ...(last.packages || []).map(p => `- باكيج ${p.name}: ${p.items.map(x => x.name).join('، ')} — ${IQD(p.price)}`),
        ...(last.discount > 0 ? [`الخصم: ${IQD(last.discount)}`] : []),
        `الإجمالي التقديري: ${IQD(last.total)}${last.shipping == null ? ' (دون التوصيل)' : ''}`,
        ...(g ? [`المحافظة: ${g.name}`] : []), 'هل يمكن تأكيد الطلب؟'].join('\n'));
    }
  });
  out.addEventListener('change', e => {
    if (e.target.id === 'gov') { gov = +e.target.value || ''; try { localStorage.setItem('as_gov', gov); } catch {} build(); }
    else if (e.target.dataset.q) { Cart.setQty(e.target.dataset.q, Math.floor(+e.target.value) || 1); build(); }
  });
  build();
};
  Pages.checkout = async (App) => {
  const { $, esc, IQD, sb, rpc, connected, Cart, Pkg, openWA } = App;
  await App.ready;
  const out = $('#out'), KEY = 'as_idem';
  let govs = [], gov = +(localStorage.getItem('as_gov') || 0) || '', priced = null, busy = false;

  const ERR = {
    PACKAGE_UNAVAILABLE: 'باكيج الاستكشاف لم يعد متاحًا. احذفه من السلة وأعد بناءه من المستشار.',
    PACKAGE_WRONG_COUNT: 'عدد عطور الباكيج غير صحيح. أعد بناء الباكيج من المستشار.',
    PACKAGE_DUPLICATE: 'لا يمكن تكرار العطر نفسه داخل الباكيج. أعد بناءه من المستشار.',
    PACKAGE_ITEM_NOT_ALLOWED: 'أحد عطور الباكيج لم يعد متاحًا ضمنه. أعد بناء الباكيج من المستشار.',
    INVALID_PACKAGES: 'بيانات الباكيج غير صالحة. احذفه من السلة وأعد بناءه.',
    PACKAGE_RETAIL_ONLY: 'الباكيجات متاحة لطلبات المفرد فقط.',
    EMPTY_OR_INVALID_CART: 'السلة فارغة.',
    INVALID_NAME: 'أدخل الاسم الكامل.',
    INVALID_PHONE: 'رقم الهاتف غير صالح.',
    INVALID_GOVERNORATE: 'المحافظة المختارة غير متاحة للتوصيل.',
    ITEM_UNAVAILABLE_OR_INSUFFICIENT_STOCK: 'بعض المنتجات لم تعد متوفرة بالكمية المطلوبة. راجع السلة.',
    MISSING_IDEMPOTENCY_KEY: 'حدث خطأ تقني. حدّث الصفحة وأعد المحاولة.'
  };
  const state = (t, s, btn = true) => out.innerHTML = `<div class="state"><b>${t}</b><span>${s}</span>${btn ? '<a class="btn sm" href="#/products">تصفح العطور</a>' : ''}</div>`;
  const items = () => Cart.get().map(({ product_id, qty }) => ({ product_id, qty }));
  const pkgs = () => Pkg.get().map(({ package_id, picks }) => ({ package_id, picks }));
  const latin = s => String(s).replace(/[٠-٩]/g, d => d.charCodeAt(0) - 1632).replace(/[۰-۹]/g, d => d.charCodeAt(0) - 1776);
  const idem = () => {
    let k = ''; try { k = sessionStorage.getItem(KEY) || ''; } catch {}
    if (!k) { k = crypto.randomUUID ? crypto.randomUUID() : Date.now() + '-' + Math.random().toString(16).slice(2); try { sessionStorage.setItem(KEY, k); } catch {} }
    return k;
  };

  if (!Cart.get().length && !Pkg.get().length) return state('السلة فارغة', 'أضف عطرًا من الكتالوج لتبدأ.');
  if (!connected()) return state('المتجر غير متصل بقاعدة البيانات بعد', 'لا يمكن إرسال الطلب قبل ربط Supabase.', false);
  try { govs = await sb('governorates?select=id,name,eta_text&active=eq.true&order=name'); }
  catch { return state('تعذّر تحميل بيانات التوصيل', 'تحقق من الاتصال ثم حدّث الصفحة.', false); }
  if (!govs.length) return state('التوصيل غير مفعّل بعد', 'لم تُفعَّل مناطق التوصيل بعد، لذلك لا يمكن إتمام الطلب حاليًا.', false);
  if (!govs.some(g => g.id === gov)) gov = '';

  out.innerHTML = `<div class="cartwrap">
  <form id="f" novalidate style="display:grid;gap:var(--sp-3)">
    <h2 style="font-size:1.1rem;margin:0">بيانات التوصيل</h2>
    <label class="f">الاسم الكامل<input type="text" name="name" required maxlength="120" autocomplete="name"></label>
    <label class="f">رقم الهاتف<input type="tel" name="phone" required inputmode="tel" autocomplete="tel" dir="ltr" style="text-align:right"></label>
    <label class="f">المحافظة<select name="gov" id="gov" required><option value="">اختر المحافظة</option>${govs.map(g => `<option value="${g.id}" ${g.id === gov ? 'selected' : ''}>${esc(g.name)}</option>`).join('')}</select></label>
    <label class="f">المنطقة / الحي<input type="text" name="district" maxlength="120"></label>
    <label class="f">العنوان التفصيلي<textarea name="address" required maxlength="500"></textarea></label>
    <label class="f">ملاحظات (اختياري)<textarea name="notes" maxlength="1000"></textarea></label>
    <label class="f">طريقة التواصل المفضلة<select name="contact"><option value="phone">اتصال هاتفي</option><option value="whatsapp">واتساب</option></select></label>
    <div id="msg" role="alert"></div>
    <button class="btn block" id="go" type="submit">تأكيد الطلب</button>
  </form>
  <aside class="sum" id="sum"><div class="skel" style="min-height:160px"></div></aside></div>`;

  const msg = (t, cls = 'err') => $('#msg').innerHTML = t ? `<div class="alert ${cls}">${esc(t)}</div>` : '';

  async function price() {
    try {
      priced = Pkg.get().length ? await rpc('price_cart_pkg', { p_items: items(), p_packages: pkgs(), p_governorate_id: gov || null }) : await rpc('price_cart', { p_items: items(), p_governorate_id: gov || null });
    } catch {
      $('#sum').innerHTML = '<b>تعذّر حساب الأسعار</b><button class="btn sm ghost" id="rt" type="button">إعادة المحاولة</button>';
      $('#rt').onclick = price; priced = null; $('#go').disabled = true; return;
    }
    const g = govs.find(x => x.id === gov);
    const ship = priced.shipping == null ? 'اختر المحافظة' : priced.shipping === 0 ? 'مجاني' : IQD(priced.shipping);
    $('#sum').innerHTML = `<h2 style="font-size:1.1rem;margin:0">ملخص الطلب</h2>
      ${priced.all_available ? '' : '<div class="alert err">بعض المنتجات غير متوفرة بالكمية المطلوبة. <a href="#/cart" style="text-decoration:underline">راجع السلة</a>.</div>'}
      ${priced.lines.map(l => `<div class="r"><span>${esc(l.name || 'منتج لم يعد موجودًا')} × ${l.qty}</span><span>${l.unit_price != null ? IQD(l.unit_price * l.qty) : ''}</span></div>`).join('')}
      ${(priced.packages || []).map(p => `<div class="r"><span>باكيج ${esc(p.name)} (${p.items.length} عطور)</span><span>${IQD(p.price)}</span></div>`).join('')}
      ${g?.eta_text ? `<div class="meta">مدة التوصيل المتوقعة: ${esc(g.eta_text)}</div>` : ''}
      <div class="r"><span>المجموع الفرعي</span><span>${IQD(priced.subtotal)}</span></div>
      ${priced.discount > 0 ? `<div class="r"><span>خصم الكمية</span><span>− ${IQD(priced.discount)}</span></div>` : ''}
      <div class="r"><span>التوصيل</span><span>${ship}</span></div>
      <div class="r tot"><span>الإجمالي</span><span>${IQD(priced.total)}</span></div>
      <a class="link" href="#/cart" style="justify-self:center;color:var(--ink-2)">تعديل السلة</a>`;
    $('#go').disabled = busy || !(priced.all_available && gov);
  }

  $('#gov').onchange = e => { gov = +e.target.value || ''; try { localStorage.setItem('as_gov', gov); } catch {} price(); };

  $('#f').onsubmit = async e => {
    e.preventDefault(); if (busy) return;
    const f = new FormData(e.target), name = f.get('name').trim(), phone = latin(f.get('phone')).trim(), address = f.get('address').trim();
    if (!name) return msg('أدخل الاسم الكامل.');
    if (!/^\+?[0-9\s\-]{7,20}$/.test(phone) || phone.replace(/\D/g, '').length < 7 || phone.replace(/\D/g, '').length > 15) return msg('رقم الهاتف غير صالح.');
    if (!gov) return msg('اختر المحافظة.');
    if (!address) return msg('أدخل العنوان التفصيلي.');
    msg(''); busy = true; const b = $('#go'); b.disabled = true; b.textContent = 'جارٍ إرسال الطلب…';
    try {
      const r = await rpc(Pkg.get().length ? 'create_order_pkg' : 'create_order', { p: {
        idempotency_key: idem(), kind: 'retail', channel: 'site',
        customer_name: name, phone, governorate_id: gov,
        district: f.get('district').trim(), address, notes: f.get('notes').trim(),
        contact_method: f.get('contact'), items: items(), ...(Pkg.get().length ? { packages: pkgs() } : {})
      } });
      Cart.clear(); try { sessionStorage.removeItem(KEY); } catch {}
      out.innerHTML = `<div class="state"><b>تم استلام طلبك</b>
        <span>رقم الطلب: <strong dir="ltr">${esc(r.order_no)}</strong></span>
        <span>الإجمالي: ${IQD(r.total)}</span>
        ${r.duplicate ? '<span class="meta">هذا الطلب سُجّل مسبقًا ولم يُكرَّر.</span>' : ''}
        <span class="meta">احتفظ برقم الطلب للمراجعة.</span>
        <button class="btn sm ghost" id="wa" type="button">أرسل رقم الطلب عبر واتساب</button>
        <a class="btn sm" href="#/products">متابعة التسوق</a></div>`;
      $('#wa').onclick = () => openWA('مرحبًا، رقم طلبي ' + r.order_no);
      scrollTo({ top: 0 });
    } catch (err) {
      const code = String(err.message || '').trim();
      msg(ERR[code] || (/fetch|network|HTTP/i.test(code) ? 'تعذّر الاتصال. إن كنت غير متأكد من وصول الطلب فأعد المحاولة، ولن يُسجَّل مرتين.' : 'تعذّر إرسال الطلب (' + code + ').'));
      busy = false; b.textContent = 'تأكيد الطلب'; b.disabled = false; price();
    }
  };
  price();
};
  Pages.advisor = async (App) => {
  const { $, esc, IQD, sb, rpc, connected, Cart, Pkg, toast, imgUrl, sizeLbl } = App;
  await App.ready;
  const box = $('#adv');
  const say = (t, s) => { box.innerHTML = `<div class="state"><b>${t}</b><span>${s}</span></div>`; };
  if (!connected()) return say('المتجر غير متصل بقاعدة البيانات بعد', 'لا يمكن تحميل العطور قبل ربط Supabase.');
  let cat, cats, terms, pkgs;
  try {
    [cat, cats, terms, pkgs] = await Promise.all([
      rpc('advisor_catalog', {}),
      sb('categories?select=id,name&active=eq.true&order=sort_order'),
      sb('taxonomy_terms?select=id,kind,name&active=eq.true&order=sort_order'),
      rpc('active_packages', {})
    ]);
  } catch { return say('تعذّر تحميل المستشار', 'تحقق من الاتصال ثم حدّث الصفحة.'); }
  if (!cat.length) return say('لا توجد عطور متاحة حاليًا', 'سيعمل المستشار فور توفر عطور في المتجر.');

  /* ----- تجميع الأحجام: العطر الواحد = مجموعة group_key ----- */
  const mk = rows => {
    rows = rows.slice().sort((x, y) => x.size_value - y.size_value);
    const uni = f => [...new Set(rows.flatMap(r => r[f] || []))];
    const first = f => { const r = rows.find(x => x[f] != null && x[f] !== ''); return r ? r[f] : null; };
    return { key: rows[0].group_key || rows[0].id, rows, name: rows[0].name, category: first('category_id'), terms: uni('terms'), tags: uni('scent_tags'), occ: uni('occasions'), intensity: first('intensity'), image: first('image') };
  };
  const groupRows = list => { const m = new Map(); list.forEach(r => { const k = r.group_key || r.id; (m.get(k) || m.set(k, []).get(k)).push(r); }); return [...m.values()].map(mk); };
  const G = groupRows(cat);

  /* ----- الأسئلة: تُبنى فقط من الخصائص المملوءة فعلًا في المنتجات ----- */
  const INT = { calm: 'هادئ وخفيف', medium: 'متوسط', strong: 'قوي وحاضر' };
  const tName = id => (terms.find(t => t.id === id) || {}).name;
  const Q = [];
  const distinct = fn => [...new Set(G.flatMap(fn).filter(v => v != null && v !== ''))];
  const cIds = distinct(g => [g.category]).filter(id => cats.some(c => c.id === id));
  if (cIds.length >= 2) Q.push({ id: 'cat', title: 'لمن العطر؟', multi: false, opts: cIds.map(id => [id, cats.find(c => c.id === id).name]) });
  const KS = Array.isArray(App.SETTINGS['public.taxonomy_kinds']) ? App.SETTINGS['public.taxonomy_kinds'] : [];
  [['family', 'ما العائلة العطرية التي تفضلها؟'], ['mood', 'ما الأجواء التي تحبها؟'], ...KS.filter(k => k && k.kind).map(k => [k.kind, String(k.question || '').trim() || (k.label ? 'ما ' + k.label + ' التي تفضلها؟' : '')])].forEach(([kind, title]) => {
    if (!title) return;
    const ids = distinct(g => g.terms).filter(id => (terms.find(t => t.id === id) || {}).kind === kind);
    if (ids.length >= 2) Q.push({ id: 'terms', terms: true, title, multi: true, opts: ids.map(id => [id, tName(id)]) });
  });
  const tags = distinct(g => g.tags); if (tags.length >= 2) Q.push({ id: 'tags', title: 'أي النفحات تفضّل؟', multi: true, opts: tags.map(t => [t, t]) });
  const occ = distinct(g => g.occ); if (occ.length >= 2) Q.push({ id: 'occ', title: 'لأي مناسبة؟', multi: true, opts: occ.map(t => [t, t]) });
  const ints = distinct(g => [g.intensity]); if (ints.length >= 2) Q.push({ id: 'int', title: 'ما شدة العطر المناسبة؟', multi: false, opts: ints.map(t => [t, INT[t] || t]) });
  Q.push({ id: 'budget', title: 'ما ميزانيتك؟', budget: true });

  const A = { cat: null, terms: new Set(), tags: new Set(), occ: new Set(), int: null, min: null, max: null };
  let step = 0, results = [], draft = [], pIdx = 0, swap = -1, pOpts = [];

  const shown = (g, min = A.min, max = A.max) => {
    const ok = g.rows.filter(r => (!min || r.retail_price >= min) && (!max || r.retail_price <= max));
    return ok.length ? (ok.find(r => +r.size_value === 30) || ok[0]) : null;
  };
  const score = g => {
    let s = 0; const why = [];
    if (A.cat != null && g.category === A.cat) { s += 3; why.push('يناسب فئة «' + (cats.find(c => c.id === A.cat) || {}).name + '»'); }
    const t = g.terms.filter(x => A.terms.has(x));
    if (t.length) { s += 2 * t.length; const by = {}; t.forEach(id => { const tm = terms.find(z => z.id === id); if (tm) (by[tm.kind] = by[tm.kind] || []).push(tm.name); });
      Object.entries(by).forEach(([k, ns]) => why.push((k === 'family' ? 'من عائلة ' : k === 'mood' ? 'بأجواء ' : ((KS.find(z => z.kind === k) || {}).label || '') + ': ') + ns.join(' و'))); }
    const tg = g.tags.filter(x => A.tags.has(x)); if (tg.length) { s += 1.5 * tg.length; why.push('نفحات ' + tg.join('، ')); }
    const oc = g.occ.filter(x => A.occ.has(x)); if (oc.length) { s += 2 * oc.length; why.push('مناسب لـ' + oc.join('، ')); }
    if (A.int && g.intensity === A.int) { s += 2; why.push('بشدة ' + (INT[A.int] || A.int)); }
    return { s, why };
  };
  const rank = (groups, min, max) => groups.map(g => ({ g, row: shown(g, min, max), ...score(g) })).filter(x => x.row).sort((x, y) => y.s - x.s || x.row.retail_price - y.row.retail_price || (x.g.name > y.g.name ? 1 : -1));

  /* ----- الأسئلة ----- */
  function renderQ() {
    const q = Q[step], total = Q.length;
    const sel = q.id === 'cat' ? [A.cat] : q.id === 'int' ? [A.int] : q.terms ? [...A.terms] : q.id === 'tags' ? [...A.tags] : [...A.occ];
    box.innerHTML = `<div class="adv-q"><div class="meta">السؤال ${step + 1} من ${total}</div><div class="adv-bar"><i style="width:${Math.round((step + 1) / total * 100)}%"></i></div>
      <h2>${esc(q.title)}</h2>
      ${q.budget ? `<div class="adv-budget"><label class="f">من (دينار)<input type="number" inputmode="numeric" min="0" id="bmin" value="${A.min ?? ''}" placeholder="اختياري"></label><label class="f">إلى (دينار)<input type="number" inputmode="numeric" min="0" id="bmax" value="${A.max ?? ''}" placeholder="اختياري"></label></div><p class="meta">اترك الخانتين فارغتين إن لم تكن لديك ميزانية محددة.</p>`
        : `<div class="adv-opts">${q.opts.map(([v, l]) => `<button type="button" class="adv-opt${sel.includes(v) ? ' on' : ''}" data-v="${esc(String(v))}" aria-pressed="${sel.includes(v)}">${esc(l)}</button>`).join('')}</div>${q.multi ? '<p class="meta">يمكنك اختيار أكثر من إجابة، أو تخطّي السؤال.</p>' : ''}`}
      <div class="adv-nav">${step ? '<button class="btn ghost" id="back" type="button">السابق</button>' : ''}<button class="btn" id="next" type="button">${step === total - 1 ? 'اعرض الترشيحات' : (q.multi || true) ? 'التالي' : ''}</button></div></div>`;
    box.querySelectorAll('.adv-opt').forEach(b => b.onclick = () => {
      const raw = b.dataset.v, v = (q.id === 'cat' || q.terms) ? +raw : raw;
      if (q.id === 'cat') A.cat = A.cat === v ? null : v;
      else if (q.id === 'int') A.int = A.int === v ? null : v;
      else { const S = q.terms ? A.terms : q.id === 'tags' ? A.tags : A.occ; S.has(v) ? S.delete(v) : S.add(v); }
      renderQ();
    });
    $('#back') && ($('#back').onclick = () => { step--; renderQ(); });
    $('#next').onclick = () => {
      if (q.budget) { const mn = Math.floor(+$('#bmin').value) || null, mx = Math.floor(+$('#bmax').value) || null; if (mn && mx && mn > mx) return toast('الحد الأدنى أكبر من الأعلى.'); A.min = mn; A.max = mx; return showResults(); }
      step++; renderQ();
    };
  }

  /* ----- النتائج ----- */
  function showResults() {
    const hasPref = A.cat != null || A.terms.size || A.tags.size || A.occ.size || A.int;
    let r = rank(G);
    if (hasPref) { const m = r.filter(x => x.s > 0); r = m.concat(r.filter(x => x.s === 0)); }
    results = r.slice(0, 5);
    draw();
  }
  const budgetTxt = () => A.min || A.max ? 'ضمن ميزانيتك' : '';
  function draw() {
    const cards = results.map(x => {
      const why = x.why.length ? x.why.join(' · ') : (budgetTxt() || 'من العطور المتوفرة في المتجر');
      return `<article class="adv-card"><div class="im">${x.g.image ? `<img src="${esc(imgUrl(x.g.image))}" alt="" loading="lazy">` : 'بلا صورة'}</div>
        <div class="adv-body"><h3>${esc(x.g.name)}</h3><p class="meta">${esc(why)}${x.why.length && budgetTxt() ? ' · ' + budgetTxt() : ''}</p>
        <div class="adv-price"><strong>${IQD(x.row.retail_price)}</strong> <span class="meta">${esc(sizeLbl(x.row.size_value, x.row.size_unit))}</span></div>
        <div class="adv-act"><button class="btn sm" data-add="${x.row.id}" data-price="${x.row.retail_price}">أضف إلى السلة</button><a class="btn sm ghost" href="#/product?slug=${encodeURIComponent(x.row.slug)}">التفاصيل</a></div></div></article>`;
    }).join('');
    box.innerHTML = `<div class="adv-res"><h2>عطور تناسب ذوقك</h2>
      ${results.length ? `<p class="sub">رتّبناها من العطور المتوفرة في المتجر حسب إجاباتك.</p><div class="adv-grid">${cards}</div>` : '<div class="state"><b>لا توجد عطور ضمن هذه الإجابات</b><span>جرّب توسيع الميزانية أو تغيير الاختيارات.</span></div>'}
      <div id="pk"></div>
      <div class="adv-nav"><button class="btn ghost" id="again" type="button">أعد الأسئلة</button></div></div>`;
    $('#again').onclick = () => { step = 0; renderQ(); };
    box.querySelectorAll('[data-add]').forEach(b => b.onclick = () => { Cart.add(b.dataset.add, 1, +b.dataset.price); toast('أُضيف إلى السلة'); });
    initPkg();
  }

  /* ----- باكيج الاستكشاف ----- */
  const live = pkgs.filter(p => p.buildable);
  async function initPkg() {
    if (!live.length) return;
    const holder = $('#pk'); if (!holder) return;
    holder.innerHTML = '<div class="skel" style="min-height:120px"></div>';
    await loadPkg(holder);
  }
  async function loadPkg(holder) {
    const p = live[pIdx];
    try { pOpts = await rpc('package_options', { p_package_id: p.id }); } catch { holder.innerHTML = ''; return; }
    const optG = groupRows(pOpts), recKeys = results.map(x => x.g.key);
    const ordered = [...recKeys.map(k => optG.find(o => o.key === k)).filter(Boolean), ...rank(optG.filter(o => !recKeys.includes(o.key)), null, null).map(x => x.g)];
    draft = ordered.slice(0, p.items_count).map(g => g.rows[0]);
    if (draft.length < p.items_count) { holder.innerHTML = ''; return; }
    swap = -1; drawPkg(holder);
  }
  function drawPkg(holder) {
    const p = live[pIdx], used = new Set(draft.map(r => r.group_key || r.id));
    holder.innerHTML = `<section class="adv-pkg"><span class="eyebrow">جرّبها قبل أن تشتري الحجم الكامل</span><h2>${esc(p.name)}</h2>
      ${live.length > 1 ? `<div class="adv-opts">${live.map((x, i) => `<button type="button" class="adv-opt${i === pIdx ? ' on' : ''}" data-pk="${i}">${esc(x.name)}</button>`).join('')}</div>` : ''}
      ${p.image_path ? `<div class="im adv-pim"><img src="${esc(imgUrl(p.image_path))}" alt="" loading="lazy"></div>` : ''}
      ${p.description ? `<p>${esc(p.description)}</p>` : ''}
      <p><strong>${IQD(p.price)}</strong> <span class="meta">· ${p.items_count} عطور</span></p>
      <div class="adv-slots">${draft.map((r, i) => {
        const alts = pOpts.filter(o => (o.group_key || o.id) === (r.group_key || r.id) || !used.has(o.group_key || o.id));
        return `<div class="adv-slot"><div class="adv-slot-h"><div class="im sm">${r.image ? `<img src="${esc(imgUrl(r.image))}" alt="" loading="lazy">` : ''}</div><div><b>${esc(r.name)}</b><div class="meta">${esc(sizeLbl(r.size_value, r.size_unit))}</div></div><button class="link" type="button" data-sw="${i}">${swap === i ? 'إغلاق' : 'استبدال'}</button></div>
        ${swap === i ? `<div class="adv-opts">${alts.filter(o => o.id !== r.id).map(o => `<button type="button" class="adv-opt" data-pick="${i}" data-id="${o.id}">${esc(o.name)} · ${esc(sizeLbl(o.size_value, o.size_unit))}</button>`).join('') || '<span class="meta">لا توجد خيارات أخرى متاحة.</span>'}</div>` : ''}</div>`;
      }).join('')}</div>
      <button class="btn block" id="accept" type="button">قبول الباكيج وإضافته للسلة</button></section>`;
    holder.querySelectorAll('[data-pk]').forEach(b => b.onclick = async () => { pIdx = +b.dataset.pk; holder.innerHTML = '<div class="skel" style="min-height:120px"></div>'; await loadPkg(holder); });
    holder.querySelectorAll('[data-sw]').forEach(b => b.onclick = () => { swap = swap === +b.dataset.sw ? -1 : +b.dataset.sw; drawPkg(holder); });
    holder.querySelectorAll('[data-pick]').forEach(b => b.onclick = () => { const o = pOpts.find(x => x.id === b.dataset.id); if (o) { draft[+b.dataset.pick] = o; swap = -1; drawPkg(holder); } });
    $('#accept').onclick = () => {
      Pkg.add({ package_id: p.id, picks: draft.map(r => r.id), name: p.name, price: p.price });
      toast('أُضيف الباكيج إلى السلة');
      $('#accept').outerHTML = '<a class="btn block" href="#/cart">الانتقال إلى السلة</a>';
    };
  }

  renderQ();
};
  Pages.wholesale = async (App) => {
  const { $, $$, esc, IQD, sb, rpc, connected, PSEL, prep, openWA } = App;
  await App.ready;
  const out = $('#out'), KEY = 'as_idem_ws';
  let govs = [], gov = +(localStorage.getItem('as_gov') || 0) || '', prods = [], q = {}, priced = null, busy = false, timer = 0, seq = 0;

  const ERR = {
    INVALID_NAME: 'أدخل اسم المسؤول عن الطلب.',
    INVALID_PHONE: 'رقم الهاتف غير صالح.',
    INVALID_GOVERNORATE: 'المحافظة المختارة غير متاحة للتوصيل.',
    ITEM_UNAVAILABLE_OR_INSUFFICIENT_STOCK: 'بعض المنتجات لم تعد متوفرة بالكمية المطلوبة. خفّض الكمية.',
    MISSING_IDEMPOTENCY_KEY: 'حدث خطأ تقني. حدّث الصفحة وأعد المحاولة.'
  };
  const state = (t, s) => out.innerHTML = `<div class="state"><b>${t}</b><span>${s}</span></div>`;
  const latin = s => String(s).replace(/[٠-٩]/g, d => d.charCodeAt(0) - 1632).replace(/[۰-۹]/g, d => d.charCodeAt(0) - 1776);
  const items = () => Object.entries(q).filter(([, n]) => n > 0).map(([product_id, qty]) => ({ product_id, qty }));
  const idem = () => {
    let k = ''; try { k = sessionStorage.getItem(KEY) || ''; } catch {}
    if (!k) { k = crypto.randomUUID ? crypto.randomUUID() : Date.now() + '-' + Math.random().toString(16).slice(2); try { sessionStorage.setItem(KEY, k); } catch {} }
    return k;
  };

  if (!connected()) return state('المتجر غير متصل بقاعدة البيانات بعد', 'لا يمكن عرض المنتجات قبل ربط Supabase.');
  try {
    [prods, govs] = await Promise.all([
      sb('products?select=' + encodeURIComponent(PSEL) + '&order=name&limit=200'),
      sb('governorates?select=id,name,eta_text&active=eq.true&order=name')
    ]);
    prods = prods.map(prep).filter(p => p.status !== 'unavailable' && p.stock >= 1);
  } catch { return state('تعذّر تحميل البيانات', 'تحقق من الاتصال ثم حدّث الصفحة.'); }
  if (!prods.length) return state('لا توجد منتجات متاحة حاليًا', 'عد لاحقًا.');
  if (!govs.some(g => g.id === gov)) gov = '';

  const tiers = p => [...(p.price_tiers || [])].sort((a, b) => a.min_qty - b.min_qty);
  out.innerHTML = `<div class="cartwrap">
  <div>
    <input type="search" id="flt" placeholder="ابحث بالاسم أو الرمز" aria-label="بحث في المنتجات" style="width:100%;margin-bottom:var(--sp-3)">
    <div id="list">${prods.map(p => `<div class="line" data-n="${esc((p.name + ' ' + p.sku).toLowerCase())}">
      <div class="im">${p.image ? `<img src="${esc(p.image)}" alt="" loading="lazy">` : 'بلا صورة'}</div>
      <div><b>${esc(p.name)}</b><div class="meta">${esc(p.sku)} · ${esc(App.sizeLbl(p.size_value, p.size_unit))}</div>
      <div>${IQD(p.retail_price)} للقطعة</div>
      ${tiers(p).length ? `<div class="chips">${tiers(p).map(t => `<span class="chip">${t.min_qty}+ قطع: ${IQD(t.unit_price)}</span>`).join('')}</div>` : '<div class="meta">لا توجد شرائح جملة لهذا العطر.</div>'}
      <div class="ctl"><label class="qty"><input type="number" min="0" max="${Math.min(p.stock, 9999)}" value="" placeholder="0" data-q="${esc(p.id)}" aria-label="الكمية: ${esc(p.name)}" inputmode="numeric"></label>
      <span class="meta">المتوفر: ${p.stock}</span><strong class="lt" data-lt="${esc(p.id)}"></strong></div></div></div>`).join('')}</div>
  </div>
  <form id="f" class="sum" novalidate>
    <h2 style="font-size:1.1rem;margin:0">ملخص الطلب</h2>
    <div id="sum" class="meta">لم تحدد كميات بعد.</div>
    <h2 style="font-size:1.1rem;margin:var(--sp-2) 0 0">بيانات المحل</h2>
    <label class="f">اسم المحل<input type="text" name="shop" required maxlength="120"></label>
    <label class="f">اسم المسؤول<input type="text" name="name" required maxlength="120" autocomplete="name"></label>
    <label class="f">رقم الهاتف<input type="tel" name="phone" required inputmode="tel" autocomplete="tel" dir="ltr" style="text-align:right"></label>
    <label class="f">المحافظة<select name="gov" id="gov" required><option value="">اختر المحافظة</option>${govs.map(g => `<option value="${g.id}" ${g.id === gov ? 'selected' : ''}>${esc(g.name)}</option>`).join('')}</select></label>
    <label class="f">المنطقة / الحي<input type="text" name="district" maxlength="120"></label>
    <label class="f">العنوان التفصيلي<textarea name="address" required maxlength="500"></textarea></label>
    <label class="f">ملاحظات (اختياري)<textarea name="notes" maxlength="1000"></textarea></label>
    <div id="msg" role="alert"></div>
    <button class="btn block" id="go" type="submit" disabled>إرسال طلب الجملة</button>
    ${govs.length ? '' : '<div class="meta">لم تُفعَّل مناطق التوصيل بعد، لذلك لا يمكن إرسال الطلب حاليًا.</div>'}
  </form></div>`;

  const msg = (t, cls = 'err') => $('#msg').innerHTML = t ? `<div class="alert ${cls}">${esc(t)}</div>` : '';
  const sync = () => { $('#go').disabled = busy || !priced || !priced.all_available || !gov || !items().length; };

  async function price() {
    const my = ++seq, its = items();
    $$('[data-lt]').forEach(e => e.textContent = '');
    if (!its.length) { priced = null; $('#sum').className = 'meta'; $('#sum').textContent = 'لم تحدد كميات بعد.'; return sync(); }
    let r;
    try { r = await rpc('price_cart', { p_items: its, p_governorate_id: gov || null }); }
    catch { if (my !== seq) return; priced = null; $('#sum').textContent = 'تعذّر حساب الأسعار. جرّب تعديل الكمية مرة أخرى.'; return sync(); }
    if (my !== seq) return;
    priced = r; $('#sum').className = '';
    r.lines.forEach(l => { const e = $(`[data-lt="${l.product_id}"]`); if (e && l.unit_price != null) e.textContent = `${IQD(l.unit_price)} × ${l.qty} = ${IQD(l.unit_price * l.qty)}`; });
    const g = govs.find(x => x.id === gov);
    const ship = r.shipping == null ? 'اختر المحافظة' : r.shipping === 0 ? 'مجاني' : IQD(r.shipping);
    $('#sum').innerHTML = `${r.all_available ? '' : '<div class="alert err">بعض الكميات تتجاوز المتوفر. عدّلها للمتابعة.</div>'}
      <div class="r"><span>عدد القطع</span><span>${its.reduce((a, x) => a + x.qty, 0)}</span></div>
      <div class="r"><span>المجموع الفرعي</span><span>${IQD(r.subtotal)}</span></div>
      ${r.discount > 0 ? `<div class="r"><span>خصم الجملة</span><span>− ${IQD(r.discount)}</span></div>` : ''}
      <div class="r"><span>التوصيل</span><span>${ship}</span></div>
      ${g?.eta_text ? `<div class="meta">مدة التوصيل المتوقعة: ${esc(g.eta_text)}</div>` : ''}
      <div class="r tot"><span>الإجمالي</span><span>${IQD(r.total)}</span></div>`;
    sync();
  }
  const later = () => { clearTimeout(timer); timer = setTimeout(price, 400); };

  $('#list').addEventListener('input', e => {
    const id = e.target.dataset.q; if (!id) return;
    const max = +e.target.max || 9999, n = Math.floor(+latin(e.target.value)) || 0;
    q[id] = Math.max(0, Math.min(n, max)); sync(); later();
  });
  $('#list').addEventListener('change', e => { const id = e.target.dataset.q; if (id) e.target.value = q[id] > 0 ? q[id] : ''; });
  $('#flt').oninput = e => { const v = e.target.value.trim().toLowerCase(); $$('#list .line').forEach(r => r.hidden = !!v && !r.dataset.n.includes(v)); };
  $('#gov').onchange = e => { gov = +e.target.value || ''; try { localStorage.setItem('as_gov', gov); } catch {} price(); };

  $('#f').onsubmit = async e => {
    e.preventDefault(); if (busy) return;
    const f = new FormData(e.target), shop = f.get('shop').trim(), name = f.get('name').trim(), phone = latin(f.get('phone')).trim(), address = f.get('address').trim(), dg = phone.replace(/\D/g, '');
    if (!items().length) return msg('حدد كمية واحدة على الأقل.');
    if (!shop) return msg('أدخل اسم المحل.');
    if (!name) return msg('أدخل اسم المسؤول.');
    if (!/^\+?[0-9\s\-]+$/.test(phone) || dg.length < 7 || dg.length > 15) return msg('رقم الهاتف غير صالح.');
    if (!gov) return msg('اختر المحافظة.');
    if (!address) return msg('أدخل العنوان التفصيلي.');
    msg(''); busy = true; const b = $('#go'); b.disabled = true; b.textContent = 'جارٍ إرسال الطلب…';
    try {
      const r = await rpc('create_order', { p: {
        idempotency_key: idem(), kind: 'wholesale', channel: 'site', shop_name: shop,
        customer_name: name, phone, governorate_id: gov,
        district: f.get('district').trim(), address, notes: f.get('notes').trim(), items: items()
      } });
      try { sessionStorage.removeItem(KEY); } catch {}
      out.innerHTML = `<div class="state"><b>تم استلام طلب الجملة</b>
        <span>رقم الطلب: <strong dir="ltr">${esc(r.order_no)}</strong></span><span>الإجمالي: ${IQD(r.total)}</span>
        ${r.duplicate ? '<span class="meta">هذا الطلب سُجّل مسبقًا ولم يُكرَّر.</span>' : ''}
        <span class="meta">احتفظ برقم الطلب للمراجعة.</span>
        <button class="btn sm ghost" id="wa" type="button">أرسل رقم الطلب عبر واتساب</button>
        <a class="btn sm" href="#/">العودة للرئيسية</a></div>`;
      $('#wa').onclick = () => openWA('مرحبًا، رقم طلب الجملة ' + r.order_no);
      scrollTo({ top: 0 });
    } catch (err) {
      const code = String(err.message || '').trim();
      msg(ERR[code] || (/fetch|network|HTTP/i.test(code) ? 'تعذّر الاتصال. إن كنت غير متأكد من وصول الطلب فأعد المحاولة، ولن يُسجَّل مرتين.' : 'تعذّر إرسال الطلب (' + code + ').'));
      busy = false; b.textContent = 'إرسال طلب الجملة'; price();
    }
  };
};
  const App = window.App, DEF = "تسوّق العطور للأفراد وأصحاب المحلات، واكتشف خيارات واضحة وأسعارًا معلنة للتجزئة والجملة.", TITLE0 = "عطور السيد | عطور تناسب ذوقك وميزانيتك";
  const qs = () => { const h = location.hash.slice(1), i = h.indexOf('?'); return i < 0 ? '' : h.slice(i); };
  const hero = root => { const hi = App.SETTINGS['public.hero_image'], h = root.querySelector('.hero');
    if (hi && h) { h.classList.add('has-img'); h.style.setProperty('--hero-img', `url("${encodeURI(App.imgUrl(hi))}")`); } };
  async function route() {
    if (window.AS_ADMIN || !document.getElementById('view')) return; // الصفحات المنفصلة (لوحة الإدارة) لا تستخدم الموجّه
    const name = location.hash.replace(/^#\/?/, '').split('?')[0].replace(/\/$/, '') || 'home';
    document.querySelectorAll('[data-rh]').forEach(e => e.remove());
    const view = document.getElementById('view'), root = document.createElement('div');
    const t = document.getElementById('t-' + name), md = document.querySelector('meta[name=description]');
    view.replaceChildren(root); scrollTo(0, 0);
    window.App && window.App.closeDrawer && window.App.closeDrawer(); document.getElementById('searchbar')?.classList.remove('open');
    if (!t || !Pages[name]) {
      document.title = TITLE0; if (md) md.content = DEF; root.className = 'page';
      root.innerHTML = '<div class="wrap"><div class="state"><b>هذه الصفحة غير متاحة بعد</b><span>ستُضاف قريبًا.</span><a class="btn sm" href="#/">العودة إلى الرئيسية</a></div></div>'; return;
    }
    document.title = t.dataset.title; if (md) md.content = t.dataset.desc;
    { const cur = location.hash.slice(1) || '/', [cp, cq] = cur.split('?'), hasCat = new URLSearchParams(cq || '').get('cat');
      document.querySelectorAll('nav.main a, .drawer a').forEach(l => { const h = (l.getAttribute('href') || '').slice(1), on = h.includes('?') ? cur === h : (cp === h && !hasCat); l.classList.toggle('on', on); if (on) l.setAttribute('aria-current', 'page'); else l.removeAttribute('aria-current'); }); }
    root.className = name === 'home' ? '' : 'page'; root.appendChild(t.content.cloneNode(true));
    const A = { ...App, qs, $: (s, r = root) => r.querySelector(s), $$: (s, r = root) => [...r.querySelectorAll(s)] };
    App.ready.then(() => {
      A.$$('[data-s]').forEach(el => { const v = App.SETTINGS['public.' + el.dataset.s]; if (typeof v === 'string' && v) el.textContent = v; });
      hero(root);
    });
    try { await Pages[name](A); } catch (e) { console.error(e); }
  }
  document.addEventListener('submit', e => {
    if (e.target.id !== 'searchForm') return;
    e.preventDefault(); const v = String(new FormData(e.target).get('q') || '').trim();
    location.hash = '#/products' + (v ? '?q=' + encodeURIComponent(v) : '');
  });
  addEventListener('hashchange', route);
  route();
})();
