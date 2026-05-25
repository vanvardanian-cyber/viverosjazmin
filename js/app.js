/* =========================================================
   Viveros Jazmín — Front-end logic
   - i18n (es / va) with localStorage persistence
   - Cart (localStorage)
   - Product image SVG generator (themed by category)
   - Page-specific renderers (home / shop / product / cart / checkout / contact)
   ========================================================= */

(function () {
  "use strict";

  /* ---------------- Storage keys ---------------- */
  const STORAGE_LANG    = "vj.lang";
  const STORAGE_CART    = "vj.cart";
  const STORAGE_USERS   = "vj.users";    // { [email]: {name,email,passwordHash,salt,createdAt,phone,addresses,orders} }
  const STORAGE_SESSION = "vj.session";  // { email, since }
  const STORAGE_CATALOG = "vj.catalog";  // override product list (admin edits)
  const STORAGE_JOBS_Q  = "vj.jobsQuestions";   // custom questions for "without CV" path
  const STORAGE_JOBS_A  = "vj.applications";    // received applications

  /* ---------------- Jobs (applications + questions) ---------------- */
  const DEFAULT_JOBS_QUESTIONS = [
    {
      id: "q-experience", type: "dropdown",
      label: { es: "¿Tienes experiencia previa en viveros o floristería?", va: "Tens experiència prèvia en vivers o floristeria?" },
      required: true,
      skipIfCv: true,    // hide this question if candidate uploaded a CV
      options: [
        { es: "Ninguna",                          va: "Cap" },
        { es: "Algo (hasta 2 años)",             va: "Alguna (fins a 2 anys)" },
        { es: "Sí, más de 2 años",               va: "Sí, més de 2 anys" }
      ]
    },
    {
      id: "q-startdate", type: "date",
      label: { es: "¿Cuándo podrías empezar?", va: "Quan podries començar?" },
      required: false
    },
    {
      id: "q-commitment", type: "radio",
      label: {
        es: "¿Estás dispuesto/a a trabajar a veces los domingos y a hacer horas extra cuando el vivero lo necesita?",
        va: "Estàs disposat/da a treballar de vegades els diumenges i a fer hores extra quan el viver ho necessita?"
      },
      required: true,
      options: [
        { es: "Sí, sin problema",              va: "Sí, sense problema" },
        { es: "Algún domingo puntual",         va: "Algun diumenge puntual" },
        { es: "Prefiero no trabajar domingos", va: "Preferisc no treballar diumenges" }
      ]
    }
  ];

  function getJobsQuestions() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORAGE_JOBS_Q));
      if (Array.isArray(raw) && raw.length) return raw;
    } catch {}
    return DEFAULT_JOBS_QUESTIONS.map(q => JSON.parse(JSON.stringify(q)));
  }
  function saveJobsQuestions(arr) {
    localStorage.setItem(STORAGE_JOBS_Q, JSON.stringify(arr));
    document.dispatchEvent(new CustomEvent("vj:jobsquestionschange"));
  }
  function resetJobsQuestions() {
    localStorage.removeItem(STORAGE_JOBS_Q);
    document.dispatchEvent(new CustomEvent("vj:jobsquestionschange"));
  }
  function getApplications() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORAGE_JOBS_A));
      return Array.isArray(raw) ? raw : [];
    } catch { return []; }
  }
  function saveApplications(arr) {
    localStorage.setItem(STORAGE_JOBS_A, JSON.stringify(arr));
    document.dispatchEvent(new CustomEvent("vj:applicationschange"));
  }
  function submitApplication(app) {
    const apps = getApplications();
    const id   = "AP-" + Date.now().toString(36).toUpperCase();
    apps.unshift({ id, status: "new", createdAt: new Date().toISOString(), ...app });
    saveApplications(apps);
    return id;
  }
  function updateApplication(id, patch) {
    const apps = getApplications();
    const i = apps.findIndex(a => a.id === id);
    if (i >= 0) { apps[i] = { ...apps[i], ...patch }; saveApplications(apps); }
  }
  function deleteApplication(id) {
    saveApplications(getApplications().filter(a => a.id !== id));
  }
  window.VJ_JOBS = {
    questions: getJobsQuestions,
    saveQuestions: saveJobsQuestions,
    resetQuestions: resetJobsQuestions,
    apps: getApplications,
    submit: submitApplication,
    update: updateApplication,
    remove: deleteApplication
  };

  /* ---------------- Catalog (with localStorage override) ---------------- */
  function loadCatalogFromStorage() {
    try {
      const raw = localStorage.getItem(STORAGE_CATALOG);
      if (!raw) return;
      const arr = JSON.parse(raw);
      if (!Array.isArray(arr) || arr.length === 0) return;
      // Replace contents of the global PRODUCTS in place so all
      // existing references (PRODUCTS.find, etc.) still work.
      PRODUCTS.length = 0;
      arr.forEach(p => PRODUCTS.push(p));
    } catch (e) { /* ignore */ }
  }
  loadCatalogFromStorage();   // run before any renderers

  function saveCatalog(arr) {
    PRODUCTS.length = 0;
    arr.forEach(p => PRODUCTS.push(p));
    localStorage.setItem(STORAGE_CATALOG, JSON.stringify(PRODUCTS));
    document.dispatchEvent(new CustomEvent("vj:catalogchange"));
  }
  function resetCatalog() {
    PRODUCTS.length = 0;
    SEED_PRODUCTS.forEach(p => PRODUCTS.push(JSON.parse(JSON.stringify(p))));
    localStorage.removeItem(STORAGE_CATALOG);
    document.dispatchEvent(new CustomEvent("vj:catalogchange"));
  }
  function exportCatalogAsDataJS() {
    // Generate a replacement data.js snippet containing the new PRODUCTS array.
    // Owner replaces the old array in js/data.js with this, commits, deploys.
    const pretty = JSON.stringify(PRODUCTS, null, 2)
      // Compact `name`/`desc` bilingual objects onto fewer lines for readability.
      .replace(/\{\s*"es": (".*?"),\s*"va": (".*?")\s*\}/g, '{ "es": $1, "va": $2 }');
    return pretty;
  }
  window.VJ_CATALOG = {
    list: () => PRODUCTS.slice(),
    seed: () => JSON.parse(JSON.stringify(SEED_PRODUCTS)),
    save: saveCatalog,
    reset: resetCatalog,
    exportDataJS: exportCatalogAsDataJS,
    nextId: (cat) => {
      const prefix = (CATEGORIES.find(c => c.id === cat) || {}).id?.slice(0,3) || "new";
      let n = 1;
      while (PRODUCTS.find(p => p.id === `${prefix}-${String(n).padStart(2,"0")}`)) n++;
      return `${prefix}-${String(n).padStart(2,"0")}`;
    }
  };

  /* ---------------- Auth ---------------- */
  // NOTE: client-side mock. Passwords are hashed with SHA-256 + salt
  // via Web Crypto. For production, do this server-side over HTTPS
  // and use bcrypt/argon2 — this is just to keep the data structure
  // realistic for migration.

  async function _hash(password, salt) {
    const enc = new TextEncoder();
    const buf = await crypto.subtle.digest("SHA-256", enc.encode(salt + ":" + password));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
  }
  function _readUsers() {
    try { return JSON.parse(localStorage.getItem(STORAGE_USERS)) || {}; }
    catch { return {}; }
  }
  function _writeUsers(u) { localStorage.setItem(STORAGE_USERS, JSON.stringify(u)); }
  function _genSalt() {
    const a = new Uint8Array(16);
    crypto.getRandomValues(a);
    return Array.from(a).map(b => b.toString(16).padStart(2,"0")).join("");
  }
  function getSession() {
    try { return JSON.parse(localStorage.getItem(STORAGE_SESSION)); }
    catch { return null; }
  }
  function currentUser() {
    const s = getSession();
    if (!s) return null;
    const u = _readUsers()[s.email];
    return u || null;
  }
  async function registerUser({ name, email, phone, password }) {
    email = email.trim().toLowerCase();
    if (!name || !email || !password) throw new Error("missing");
    if (password.length < 6) throw new Error("short");
    const users = _readUsers();
    if (users[email]) throw new Error("exists");
    const salt = _genSalt();
    const passwordHash = await _hash(password, salt);
    users[email] = {
      name: name.trim(),
      email,
      phone: (phone || "").trim(),
      passwordHash, salt,
      createdAt: new Date().toISOString(),
      addresses: [],
      orders: []
    };
    _writeUsers(users);
    localStorage.setItem(STORAGE_SESSION, JSON.stringify({ email, since: Date.now() }));
    document.dispatchEvent(new CustomEvent("vj:authchange"));
    return users[email];
  }
  async function loginUser({ email, password }) {
    email = email.trim().toLowerCase();
    const users = _readUsers();
    const u = users[email];
    if (!u) throw new Error("nouser");
    const h = await _hash(password, u.salt);
    if (h !== u.passwordHash) throw new Error("badpass");
    localStorage.setItem(STORAGE_SESSION, JSON.stringify({ email, since: Date.now() }));
    document.dispatchEvent(new CustomEvent("vj:authchange"));
    return u;
  }
  function logoutUser() {
    localStorage.removeItem(STORAGE_SESSION);
    document.dispatchEvent(new CustomEvent("vj:authchange"));
  }
  function appendOrderToUser(order) {
    const u = currentUser();
    if (!u) return;
    const users = _readUsers();
    users[u.email].orders = users[u.email].orders || [];
    users[u.email].orders.unshift(order);
    _writeUsers(users);
  }
  // expose to inline scripts on auth pages
  window.VJ_AUTH = {
    register: registerUser,
    login: loginUser,
    logout: logoutUser,
    current: currentUser,
    onChange: (cb) => document.addEventListener("vj:authchange", cb)
  };

  /* ---------------- Cookies (AEPD-compliant) ---------------- */
  const STORAGE_COOKIES = "vj.cookies";
  const COOKIE_EXPIRY_DAYS = 365; // re-ask once a year

  function getCookieConsent() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORAGE_COOKIES));
      if (!raw || !raw.decidedAt) return null;
      const ageDays = (Date.now() - new Date(raw.decidedAt).getTime()) / 86400000;
      if (ageDays > COOKIE_EXPIRY_DAYS) return null;
      return raw;
    } catch { return null; }
  }
  function saveCookieConsent(prefs) {
    const data = {
      essential: true,                 // always
      analytics: !!prefs.analytics,
      marketing: !!prefs.marketing,
      decidedAt: new Date().toISOString()
    };
    localStorage.setItem(STORAGE_COOKIES, JSON.stringify(data));
    document.dispatchEvent(new CustomEvent("vj:cookieschange", { detail: data }));
    // Apply consent immediately
    applyCookieConsent(data);
  }
  function applyCookieConsent(prefs) {
    // Analytics (placeholder — when you add Google Analytics or Plausible,
    // load the script here only if prefs.analytics is true).
    // Marketing pixels (same).
    if (prefs && prefs.analytics) {
      // Example placeholder for Plausible: not loaded by default.
      // const s = document.createElement("script");
      // s.defer = true; s.src = "https://plausible.io/js/script.js";
      // s.setAttribute("data-domain", "jazmin-group.com");
      // document.head.appendChild(s);
    }
  }

  function cookieTexts() {
    const lang = getLang();
    return lang === "va" ? {
      title: "Galetes",
      body:  "Utilitzem galetes essencials per a la cistella, l'idioma i la teua sessió. No fem rastreig publicitari. Pots acceptar les opcionals (anàlisi) o rebutjar-les en qualsevol moment.",
      accept: "Acceptar tot",
      reject: "Rebutjar tot",
      config: "Configurar",
      save:   "Guardar selecció",
      essential: "Essencials (sempre actives)",
      essentialDesc: "Sense estes galetes la cistella i l'inici de sessió no funcionarien.",
      analytics: "Anàlisi (anònim)",
      analyticsDesc: "Ens ajuden a entendre quines pàgines són útils. Estadístiques agregades, sense identificar-te.",
      marketing: "Màrqueting",
      marketingDesc: "Personalització i publicitat de tercers. Actualment no s'utilitzen.",
      more: "Més informació",
      changeLink: "Configurar galetes"
    } : {
      title: "Cookies",
      body:  "Utilizamos cookies esenciales para el carrito, el idioma y tu sesión. No realizamos seguimiento publicitario. Puedes aceptar las opcionales (análisis) o rechazarlas en cualquier momento.",
      accept: "Aceptar todo",
      reject: "Rechazar todo",
      config: "Configurar",
      save:   "Guardar selección",
      essential: "Esenciales (siempre activas)",
      essentialDesc: "Sin estas cookies el carrito y la sesión no funcionarían.",
      analytics: "Análisis (anónimo)",
      analyticsDesc: "Nos ayudan a entender qué páginas son útiles. Estadísticas agregadas, sin identificarte.",
      marketing: "Marketing",
      marketingDesc: "Personalización y publicidad de terceros. Actualmente no se utilizan.",
      more: "Más información",
      changeLink: "Configurar cookies"
    };
  }

  function ensureBannerDOM() {
    if (document.getElementById("vj-cookie-banner")) return document.getElementById("vj-cookie-banner");
    const t = cookieTexts();
    const wrap = document.createElement("div");
    wrap.id = "vj-cookie-banner";
    wrap.className = "cookie-banner";
    wrap.setAttribute("role", "dialog");
    wrap.setAttribute("aria-labelledby", "vj-cookie-title");
    wrap.innerHTML = `
      <div class="cookie-card">
        <div class="cookie-summary">
          <h3 id="vj-cookie-title">${t.title}</h3>
          <p>${t.body} <a href="cookies.html">${t.more} →</a></p>
        </div>
        <div class="cookie-details" hidden>
          <label class="cookie-row">
            <span class="cookie-row-text">
              <strong>${t.essential}</strong>
              <small>${t.essentialDesc}</small>
            </span>
            <input type="checkbox" checked disabled>
          </label>
          <label class="cookie-row">
            <span class="cookie-row-text">
              <strong>${t.analytics}</strong>
              <small>${t.analyticsDesc}</small>
            </span>
            <input type="checkbox" data-pref="analytics">
          </label>
          <label class="cookie-row">
            <span class="cookie-row-text">
              <strong>${t.marketing}</strong>
              <small>${t.marketingDesc}</small>
            </span>
            <input type="checkbox" data-pref="marketing">
          </label>
        </div>
        <div class="cookie-actions" data-stage="summary">
          <button type="button" class="btn btn-light cookie-config">${t.config}</button>
          <button type="button" class="btn btn-outline cookie-reject">${t.reject}</button>
          <button type="button" class="btn btn-primary cookie-accept">${t.accept}</button>
        </div>
        <div class="cookie-actions" data-stage="details" hidden>
          <button type="button" class="btn btn-outline cookie-reject">${t.reject}</button>
          <button type="button" class="btn btn-primary cookie-save">${t.save}</button>
        </div>
      </div>
    `;
    document.body.appendChild(wrap);

    const summary  = wrap.querySelector(".cookie-summary");
    const details  = wrap.querySelector(".cookie-details");
    const actsSum  = wrap.querySelector('[data-stage="summary"]');
    const actsDet  = wrap.querySelector('[data-stage="details"]');
    const analyticsCb = wrap.querySelector('input[data-pref="analytics"]');
    const marketingCb = wrap.querySelector('input[data-pref="marketing"]');

    wrap.querySelectorAll(".cookie-config").forEach(b => b.addEventListener("click", () => {
      summary.hidden = true; details.hidden = false; actsSum.hidden = true; actsDet.hidden = false;
    }));
    wrap.querySelectorAll(".cookie-accept").forEach(b => b.addEventListener("click", () => {
      saveCookieConsent({ analytics: true, marketing: true }); hideBanner();
    }));
    wrap.querySelectorAll(".cookie-reject").forEach(b => b.addEventListener("click", () => {
      saveCookieConsent({ analytics: false, marketing: false }); hideBanner();
    }));
    wrap.querySelector(".cookie-save").addEventListener("click", () => {
      saveCookieConsent({ analytics: analyticsCb.checked, marketing: marketingCb.checked }); hideBanner();
    });
    return wrap;
  }
  function showBanner(prefilled) {
    const el = ensureBannerDOM();
    if (prefilled) {
      el.querySelector('input[data-pref="analytics"]').checked = !!prefilled.analytics;
      el.querySelector('input[data-pref="marketing"]').checked = !!prefilled.marketing;
    }
    requestAnimationFrame(() => el.classList.add("is-show"));
  }
  function hideBanner() {
    const el = document.getElementById("vj-cookie-banner");
    if (el) el.classList.remove("is-show");
  }
  function initCookieBanner() {
    const consent = getCookieConsent();
    if (consent) {
      applyCookieConsent(consent);
    } else {
      // Show after slight delay for less abrupt UX
      setTimeout(() => showBanner(), 600);
    }
    // Footer link "Configurar cookies"
    document.querySelectorAll("[data-vj-cookies]").forEach(a => {
      a.addEventListener("click", (e) => {
        e.preventDefault();
        showBanner(consent || {});
      });
    });
  }

  window.VJ_COOKIES = {
    get: getCookieConsent,
    show: showBanner,
    reset: () => { localStorage.removeItem(STORAGE_COOKIES); }
  };

  /* ---------------- i18n ---------------- */

  function getLang() {
    const stored = localStorage.getItem(STORAGE_LANG);
    if (stored === "es" || stored === "va") return stored;
    // default to Spanish
    return "es";
  }
  function setLang(lang) {
    localStorage.setItem(STORAGE_LANG, lang);
    document.documentElement.lang = lang === "va" ? "ca-valencia" : "es";
    applyTranslations();
    // re-render dynamic content on the current page
    document.dispatchEvent(new CustomEvent("vj:langchange", { detail: { lang } }));
  }
  function t(key) {
    const lang = getLang();
    return (I18N[lang] && I18N[lang][key]) || (I18N.es[key]) || key;
  }
  function applyTranslations() {
    document.querySelectorAll("[data-i18n]").forEach(el => {
      el.textContent = t(el.getAttribute("data-i18n"));
    });
    document.querySelectorAll("[data-i18n-attr]").forEach(el => {
      const spec = el.getAttribute("data-i18n-attr"); // e.g. "placeholder:common.search"
      spec.split(",").forEach(pair => {
        const [attr, key] = pair.split(":").map(s => s.trim());
        if (attr && key) el.setAttribute(attr, t(key));
      });
    });
    // active language button
    document.querySelectorAll(".lang-toggle button").forEach(btn => {
      btn.classList.toggle("is-active", btn.dataset.lang === getLang());
    });
  }

  function catName(catId) {
    const c = CATEGORIES.find(x => x.id === catId);
    return c ? c[getLang()] : catId;
  }
  function productName(p) { return p.name[getLang()] || p.name.es; }
  function productDesc(p) { return p.desc[getLang()] || p.desc.es; }

  /* ---------------- Cart ---------------- */
  function getCart() {
    try { return JSON.parse(localStorage.getItem(STORAGE_CART)) || []; }
    catch { return []; }
  }
  function setCart(items) {
    localStorage.setItem(STORAGE_CART, JSON.stringify(items));
    updateCartBadge();
    document.dispatchEvent(new CustomEvent("vj:cartchange"));
  }
  function addToCart(id, qty = 1) {
    const cart = getCart();
    const found = cart.find(it => it.id === id);
    if (found) found.qty += qty;
    else cart.push({ id, qty });
    setCart(cart);
    showToast(t("common.added"));
  }
  function updateQty(id, qty) {
    let cart = getCart();
    if (qty <= 0) cart = cart.filter(it => it.id !== id);
    else {
      const found = cart.find(it => it.id === id);
      if (found) found.qty = qty;
    }
    setCart(cart);
  }
  function removeFromCart(id) {
    setCart(getCart().filter(it => it.id !== id));
  }
  function cartCount() {
    return getCart().reduce((s, it) => s + it.qty, 0);
  }
  function cartTotal() {
    return getCart().reduce((s, it) => {
      const p = PRODUCTS.find(x => x.id === it.id);
      return s + (p ? p.price * it.qty : 0);
    }, 0);
  }
  function updateCartBadge() {
    const badges = document.querySelectorAll(".cart-count");
    const n = cartCount();
    badges.forEach(b => {
      b.textContent = n;
      b.classList.toggle("is-empty", n === 0);
    });
  }
  function formatPrice(n) {
    return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(n);
  }

  /* ---------------- Toast ---------------- */
  let toastTimer = null;
  function showToast(msg) {
    let toast = document.getElementById("vj-toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "vj-toast";
      toast.className = "toast";
      toast.innerHTML =
        `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg><span></span>`;
      document.body.appendChild(toast);
    }
    toast.querySelector("span").textContent = msg;
    toast.classList.add("is-show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("is-show"), 2200);
  }

  /* ---------------- Product image (URL or SVG fallback) ---------------- */
  function productImgSVG(p) {
    // If admin has set a real image URL, use it.
    if (p.img && /^(https?:|data:)/.test(p.img)) {
      const alt = (p.name && (p.name.es || p.name.va)) || "";
      return `<img src="${p.img}" alt="${alt.replace(/"/g,'&quot;')}" loading="lazy" style="width:100%;height:100%;object-fit:cover;display:block;">`;
    }
    return productSvgPlaceholder(p);
  }
  // Themed illustrations per category. Background pulled from brand palette,
  // foreground variations indexed by imgSeed for variety.
  function productSvgPlaceholder(p) {
    // Background palette: soft blues, occasional warm cream — keeps a coherent feel
    const bgPalettes = [
      ["#E2EDF2", "#B5D8E8"], // blue
      ["#F2F7FA", "#DCEAF1"], // pale blue
      ["#F6EFE3", "#E8D8B9"], // cream
      ["#DCEAF1", "#B5D8E8"], // blue mid
      ["#EEEEEC", "#D6DAD3"]  // stone
    ];
    const idx = ((p.imgSeed || 0) + p.id.charCodeAt(p.id.length-1)) % bgPalettes.length;
    const [bg1, bg2] = bgPalettes[idx];

    // Foreground: muted botanical greens / earth tones
    const fgPalettes = {
      interior:  [["#5C7A5D","#83A37D"], ["#4F6E54","#7B9778"], ["#647B5A","#8FA384"]],
      exterior:  [["#5E7E62","#8AA683"], ["#516B57","#7A9479"], ["#6B8669","#92A98C"]],
      arboles:   [["#48604E","#6F8870"], ["#3D5247","#5F7A63"], ["#5B7558","#84997E"]],
      flores:    [["#5C7A5D","#C49AA0"], ["#577158","#B98793"], ["#647B5A","#D1A6AC"]],
      sustratos: [["#6B5640","#917862"], ["#5B4B38","#806754"]],
      macetas:   [["#A5775A","#C49679"], ["#8E6447","#B68768"], ["#6E7A87","#9FA9B4"]]
    };
    const fpal = fgPalettes[p.cat] || fgPalettes.interior;
    const [fg1, fg2] = fpal[(p.imgSeed || 0) % fpal.length];

    const shape = cardShape(p.cat, fg1, fg2);
    return `<svg viewBox="0 0 400 500" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice">
  <defs>
    <linearGradient id="bg-${p.id}" x1="0" y1="0" x2=".5" y2="1">
      <stop offset="0" stop-color="${bg1}"/>
      <stop offset="1" stop-color="${bg2}"/>
    </linearGradient>
  </defs>
  <rect width="400" height="500" fill="url(#bg-${p.id})"/>
  <circle cx="60" cy="80" r="2" fill="${fg1}" opacity=".35"/>
  <circle cx="340" cy="120" r="1.5" fill="${fg2}" opacity=".35"/>
  <circle cx="350" cy="420" r="2" fill="${fg1}" opacity=".3"/>
  <g transform="translate(0 50)">${shape}</g>
</svg>`;
  }

  function cardShape(cat, c1, c2) {
    // refined botanical silhouettes — line-led, restrained
    if (cat === "interior") {
      return `
        <g fill="${c1}">
          <path d="M200 330 C 180 280, 130 250, 130 210 C 130 180, 160 165, 185 175 C 175 145, 200 120, 220 145 C 245 120, 270 145, 260 175 C 280 165, 305 195, 280 225 C 305 235, 295 280, 250 285 Z" opacity=".95"/>
        </g>
        <g fill="${c2}" opacity=".75">
          <ellipse cx="165" cy="200" rx="36" ry="20" transform="rotate(-32 165 200)"/>
          <ellipse cx="235" cy="200" rx="36" ry="20" transform="rotate(32 235 200)"/>
          <ellipse cx="200" cy="155" rx="32" ry="18"/>
        </g>
        <!-- pot -->
        <path d="M150 320 L250 320 L240 380 L160 380 Z" fill="#fff" opacity=".65"/>
        <path d="M150 320 L250 320 L240 380 L160 380 Z" fill="none" stroke="${c1}" stroke-width="2" opacity=".5"/>
        <path d="M147 318 L253 318" stroke="${c1}" stroke-width="2" fill="none" opacity=".55"/>
      `;
    }
    if (cat === "exterior") {
      return `
        <!-- multi-stem outdoor plant silhouette -->
        <g stroke="${c1}" stroke-width="2.5" fill="none" stroke-linecap="round">
          <path d="M200 340 C 200 300, 180 250, 160 200"/>
          <path d="M200 340 C 200 300, 220 250, 240 200"/>
          <path d="M200 340 C 200 300, 200 240, 200 180"/>
        </g>
        <g fill="${c2}" opacity=".9">
          <ellipse cx="160" cy="200" rx="20" ry="38" transform="rotate(-15 160 200)"/>
          <ellipse cx="240" cy="200" rx="20" ry="38" transform="rotate(15 240 200)"/>
          <ellipse cx="200" cy="180" rx="22" ry="42"/>
        </g>
        <g fill="${c1}" opacity=".55">
          <ellipse cx="150" cy="170" rx="14" ry="28" transform="rotate(-20 150 170)"/>
          <ellipse cx="250" cy="170" rx="14" ry="28" transform="rotate(20 250 170)"/>
          <ellipse cx="200" cy="145" rx="16" ry="32"/>
        </g>
        <!-- ground/pot -->
        <rect x="155" y="340" width="90" height="6" rx="1" fill="${c1}" opacity=".4"/>
      `;
    }
    if (cat === "flores") {
      // delicate flower stems
      return `
        <g stroke="${c1}" stroke-width="2" fill="none" stroke-linecap="round">
          <path d="M200 360 C 200 300, 200 250, 200 180"/>
          <path d="M170 360 C 170 320, 175 280, 180 240"/>
          <path d="M230 360 C 230 320, 225 280, 220 240"/>
        </g>
        <!-- leaves -->
        <g fill="${c1}" opacity=".75">
          <ellipse cx="185" cy="270" rx="16" ry="6" transform="rotate(-25 185 270)"/>
          <ellipse cx="215" cy="270" rx="16" ry="6" transform="rotate(25 215 270)"/>
        </g>
        <!-- blossoms -->
        <g>
          <g transform="translate(200 180)">
            <circle cx="0" cy="-10" r="11" fill="${c2}"/>
            <circle cx="-10" cy="3" r="11" fill="${c2}"/>
            <circle cx="10" cy="3" r="11" fill="${c2}"/>
            <circle cx="-6" cy="-3" r="6" fill="#fff" opacity=".5"/>
            <circle cx="0" cy="0" r="5" fill="${c1}"/>
          </g>
          <g transform="translate(180 230) scale(.78)">
            <circle cx="0" cy="-10" r="11" fill="${c2}"/>
            <circle cx="-10" cy="3" r="11" fill="${c2}"/>
            <circle cx="10" cy="3" r="11" fill="${c2}"/>
            <circle cx="0" cy="0" r="5" fill="${c1}"/>
          </g>
          <g transform="translate(220 230) scale(.78)">
            <circle cx="0" cy="-10" r="11" fill="${c2}"/>
            <circle cx="-10" cy="3" r="11" fill="${c2}"/>
            <circle cx="10" cy="3" r="11" fill="${c2}"/>
            <circle cx="0" cy="0" r="5" fill="${c1}"/>
          </g>
        </g>
      `;
    }
    if (cat === "arboles") {
      // refined tree silhouette
      return `
        <rect x="194" y="280" width="12" height="100" fill="${c1}" opacity=".85"/>
        <g fill="${c1}">
          <ellipse cx="200" cy="200" rx="90" ry="100"/>
        </g>
        <g fill="${c2}" opacity=".75">
          <ellipse cx="160" cy="200" rx="38" ry="46"/>
          <ellipse cx="240" cy="200" rx="38" ry="46"/>
          <ellipse cx="200" cy="160" rx="42" ry="32"/>
        </g>
        <g fill="${c1}" opacity=".25">
          <ellipse cx="200" cy="250" rx="70" ry="20"/>
        </g>
      `;
    }
    if (cat === "sustratos") {
      // minimal bag with serif Jazmín wordmark
      return `
        <g>
          <path d="M150 160 L250 160 L255 170 L255 360 Q255 372 243 372 L157 372 Q145 372 145 360 L145 170 Z" fill="${c1}"/>
          <rect x="145" y="160" width="110" height="22" fill="${c2}" opacity=".5"/>
          <rect x="160" y="200" width="80" height="100" fill="#fff" opacity=".88"/>
          <text x="200" y="240" font-family="Playfair Display, Georgia, serif" font-style="italic" font-size="22" text-anchor="middle" fill="${c1}" font-weight="500">Jazmín</text>
          <text x="200" y="262" font-family="Inter, sans-serif" font-size="8" text-anchor="middle" fill="${c1}" letter-spacing="3" font-weight="600">SUSTRATO PREMIUM</text>
          <line x1="170" y1="275" x2="230" y2="275" stroke="${c1}" stroke-width="1" opacity=".5"/>
          <text x="200" y="290" font-family="Inter, sans-serif" font-size="7" text-anchor="middle" fill="${c1}" letter-spacing="2" opacity=".7">20 L</text>
        </g>
      `;
    }
    if (cat === "macetas") {
      // clean ceramic vessel silhouette
      return `
        <path d="M150 200 L250 200 L240 360 L160 360 Z" fill="${c1}"/>
        <path d="M150 200 L250 200 L240 360 L160 360 Z" fill="${c2}" opacity=".3"/>
        <ellipse cx="200" cy="200" rx="50" ry="10" fill="${c2}"/>
        <ellipse cx="200" cy="200" rx="42" ry="6" fill="#000" opacity=".18"/>
        <path d="M170 220 L230 220" stroke="${c2}" stroke-width="1" opacity=".6"/>
        <path d="M165 240 L235 240" stroke="${c2}" stroke-width="1" opacity=".4"/>
      `;
    }
    return "";
  }

  /* ---------------- Card / Grid renderers ---------------- */
  function productCardHTML(p) {
    const stockTag = p.stock > 0 ? "" : `<span class="product-tag">${t("common.outOfStock")}</span>`;
    return `
      <article class="product-card">
        <a href="producto.html?id=${p.id}" class="product-img" aria-label="${productName(p)}">
          ${productImgSVG(p)}
          ${stockTag}
        </a>
        <div class="product-body">
          <div class="product-cat">${catName(p.cat)}</div>
          <h3 class="product-name"><a href="producto.html?id=${p.id}">${productName(p)}</a></h3>
          <p class="product-desc">${truncate(productDesc(p), 92)}</p>
          <div class="product-foot">
            <span class="product-price">${formatPrice(p.price)}</span>
            <button class="product-add js-add" data-id="${p.id}" ${p.stock === 0 ? "disabled" : ""}>
              ${t("common.addToCart")}
            </button>
          </div>
        </div>
      </article>
    `;
  }
  function truncate(s, n) { return s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s; }

  function attachAddButtons(scope = document) {
    scope.querySelectorAll(".js-add").forEach(btn => {
      if (btn._wired) return;
      btn._wired = true;
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        addToCart(btn.dataset.id, 1);
      });
    });
  }

  /* ---------------- Header / Footer templates ---------------- */
  function headerHTML() {
    return `
      <header class="header">
        <div class="container header-inner">
          <div class="header-side header-side--left">
            <button class="menu-toggle" aria-label="Menu" aria-expanded="false">
              <span></span><span></span><span></span>
            </button>
            <div class="lang-toggle desktop-only" role="group" aria-label="Language">
              <button data-lang="es">ES</button>
              <span class="sep">·</span>
              <button data-lang="va">VAL</button>
            </div>
          </div>

          <a class="brand" href="index.html" aria-label="Viveros Jazmín">
            <span class="brand-name">Viveros Jazmín</span>
            <span class="brand-sub">Castelló · Desde 1992</span>
          </a>

          <div class="header-side header-side--right">
            <nav class="nav" aria-label="primary">
              <a href="tienda.html"   data-i18n="nav.shop">Tienda</a>
              <a href="sobre.html"    data-i18n="nav.about">Sobre nosotros</a>
              <a href="contacto.html" data-i18n="nav.contact">Contacto</a>
              <a class="user-btn" data-vj-user-link href="entrar.html" aria-label="Cuenta">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>
                <span data-vj-user-label data-i18n="auth.signin">Entrar</span>
              </a>
              <div class="lang-toggle mobile-only" role="group" aria-label="Language">
                <button data-lang="es">ES</button>
                <span class="sep">·</span>
                <button data-lang="va">VAL</button>
              </div>
            </nav>
            <a href="carrito.html" class="cart-btn" aria-label="Carrito">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6 7h12l-1.5 11a2 2 0 0 1-2 1.7H9.5a2 2 0 0 1-2-1.7L6 7z"/><path d="M9 7V5a3 3 0 0 1 6 0v2"/></svg>
              <span class="cart-count is-empty">0</span>
            </a>
          </div>
        </div>
        <div class="nav-backdrop" aria-hidden="true"></div>
      </header>
    `;
  }
  function footerHTML() {
    const lang = getLang();
    const hours = SITE_INFO.hours[lang].replace(" · ", "<br>");
    return `
      <footer class="footer">
        <div class="container">
          <div class="footer-grid">
            <div>
              <a class="brand" href="index.html" style="align-items:flex-start;">
                <span class="brand-name">Viveros Jazmín</span>
                <span class="brand-sub">Castelló · Desde 1992</span>
              </a>
              <p class="tagline" data-i18n="footer.tagline"></p>
            </div>
            <div>
              <h4 data-i18n="footer.shop"></h4>
              <ul>
                ${CATEGORIES.map(c => `<li><a href="tienda.html?cat=${c.id}">${c[lang]}</a></li>`).join("")}
              </ul>
            </div>
            <div>
              <h4 data-i18n="footer.info"></h4>
              <ul>
                <li><a href="sobre.html" data-i18n="nav.about"></a></li>
                <li><a href="contacto.html" data-i18n="nav.contact"></a></li>
                <li><a href="carrito.html" data-i18n="nav.cart"></a></li>
                <li><a href="trabajo.html">${lang === "va" ? "Treballa amb nosaltres" : "Trabaja con nosotros"}</a></li>
              </ul>
            </div>
            <div>
              <h4 data-i18n="footer.find"></h4>
              <ul>
                <li>Calle Río Anna 135<br>12006 Castelló de la Plana</li>
                <li><a href="tel:+34${SITE_INFO.phone.replace(/\\s+/g,'')}">${SITE_INFO.phone}</a></li>
                <li><a href="mailto:${SITE_INFO.email}">${SITE_INFO.email}</a></li>
                <li class="mt-16" style="font-size:.82rem;line-height:1.6;opacity:.75;">${hours}</li>
              </ul>
            </div>
          </div>
          <div class="footer-bottom">
            <div>© 1992–2026 Viveros Jazmín · <span data-i18n="footer.copy"></span></div>
            <div class="footer-legal">
              <a href="aviso-legal.html">Aviso Legal</a> ·
              <a href="privacidad.html">Privacidad</a> ·
              <a href="cookies.html">Cookies</a> ·
              <a href="condiciones.html">Condiciones</a> ·
              <a href="#" data-vj-cookies>Configurar cookies</a>
            </div>
          </div>
        </div>
      </footer>
    `;
  }
  function mountChrome() {
    const hRoot = document.querySelector("[data-vj-header]");
    const fRoot = document.querySelector("[data-vj-footer]");
    if (hRoot) hRoot.outerHTML = headerHTML();
    if (fRoot) fRoot.outerHTML = footerHTML();
  }
  function rerenderFooter() {
    // Footer has language-dependent content (category labels, hours)
    const existing = document.querySelector(".footer");
    if (existing) {
      const wrap = document.createElement("div");
      wrap.innerHTML = footerHTML();
      existing.replaceWith(wrap.firstElementChild);
    }
  }

  /* ---------------- Header / Nav ---------------- */
  function initHeader() {
    const tog = document.querySelector(".menu-toggle");
    const nav = document.querySelector(".nav");
    const backdrop = document.querySelector(".nav-backdrop");

    function closeNav() {
      if (!nav) return;
      nav.classList.remove("is-open");
      tog && tog.classList.remove("is-open");
      tog && tog.setAttribute("aria-expanded", "false");
      backdrop && backdrop.classList.remove("is-show");
      document.body.classList.remove("nav-locked");
    }
    function openNav() {
      if (!nav) return;
      nav.classList.add("is-open");
      tog && tog.classList.add("is-open");
      tog && tog.setAttribute("aria-expanded", "true");
      backdrop && backdrop.classList.add("is-show");
      document.body.classList.add("nav-locked");
    }
    if (tog && nav) {
      tog.addEventListener("click", () => {
        nav.classList.contains("is-open") ? closeNav() : openNav();
      });
    }
    if (backdrop) backdrop.addEventListener("click", closeNav);
    // Close drawer when clicking a nav link (mobile)
    if (nav) nav.querySelectorAll("a").forEach(a => {
      a.addEventListener("click", () => {
        if (window.matchMedia("(max-width: 980px)").matches) closeNav();
      });
    });
    // Close on Escape
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && nav && nav.classList.contains("is-open")) closeNav();
    });
    // Close on resize back to desktop
    window.addEventListener("resize", () => {
      if (!window.matchMedia("(max-width: 980px)").matches) closeNav();
    });

    // Lang switches
    document.querySelectorAll(".lang-toggle button").forEach(b => {
      b.addEventListener("click", () => setLang(b.dataset.lang));
    });
    updateCartBadge();
    updateAuthLink();
  }
  function updateAuthLink() {
    const u = currentUser();
    document.querySelectorAll("[data-vj-user-link]").forEach(a => {
      a.href = u ? "cuenta.html" : "entrar.html";
    });
    document.querySelectorAll("[data-vj-user-label]").forEach(s => {
      s.textContent = u ? u.name.split(" ")[0] : t("auth.signin");
    });
  }

  /* ---------------- Page renderers ---------------- */

  function renderHome() {
    // featured: pick 8 across categories
    const featured = pickFeatured(8);
    const grid = document.getElementById("featured-grid");
    if (grid) {
      grid.innerHTML = featured.map(productCardHTML).join("");
      attachAddButtons(grid);
      initRail(grid);
    }
    const cats = document.getElementById("cat-grid");
    if (cats) {
      cats.innerHTML = CATEGORIES.map((c, i) => {
        const n = PRODUCTS.filter(p => p.cat === c.id).length;
        return `
          <a class="cat-tile" href="tienda.html?cat=${c.id}">
            <h3>${c[getLang()]}</h3>
            <div class="cat-meta">
              <span>${String(i + 1).padStart(2, "0")} / 06</span>
              <span>${n} ${t("common.units")} →</span>
            </div>
            <div class="cat-svg">${catSilhouetteSVG(c.id)}</div>
          </a>
        `;
      }).join("");
    }
  }

  /* ---------- Horizontal rail (carousel) ---------- */
  function initRail(rail) {
    const thumb = document.querySelector(".rail-thumb");
    const prevBtn = document.getElementById("rail-prev");
    const nextBtn = document.getElementById("rail-next");
    const posEl = document.getElementById("rail-pos");
    const totalEl = document.getElementById("rail-total");
    if (!rail || !thumb) return;

    const cards = Array.from(rail.children);
    const gap = parseFloat(getComputedStyle(rail).gap) || 24;

    function step() {
      const card = rail.firstElementChild;
      return card ? card.getBoundingClientRect().width + gap : 300;
    }
    function visibleCount() {
      return Math.max(1, Math.round(rail.clientWidth / step()));
    }
    function update() {
      const max = rail.scrollWidth - rail.clientWidth;
      const ratio = max > 0 ? Math.min(1, rail.scrollLeft / max) : 0;
      const visible = visibleCount();
      const total = cards.length;
      const trackWidth = thumb.parentElement.clientWidth;
      const thumbW = Math.max(40, (visible / total) * trackWidth);
      thumb.style.width = thumbW + "px";
      thumb.style.transform = `translateX(${ratio * (trackWidth - thumbW)}px)`;

      // pos counter — 01 / 08, based on first fully visible card
      const idx = Math.min(total - visible, Math.round(rail.scrollLeft / step()));
      if (posEl) posEl.textContent = String(idx + 1).padStart(2, "0");
      if (totalEl) totalEl.textContent = String(total).padStart(2, "0");
      if (prevBtn) prevBtn.disabled = rail.scrollLeft <= 2;
      if (nextBtn) nextBtn.disabled = rail.scrollLeft >= max - 2;
    }

    rail.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);

    function nudge(dir) {
      rail.scrollBy({ left: dir * step() * visibleCount(), behavior: "smooth" });
    }
    if (prevBtn) prevBtn.addEventListener("click", () => nudge(-1));
    if (nextBtn) nextBtn.addEventListener("click", () => nudge(1));

    // Drag-to-scroll on desktop (touch is native)
    let dragging = false, startX = 0, startScroll = 0;
    rail.addEventListener("mousedown", (e) => {
      if (e.button !== 0) return;
      dragging = true; startX = e.clientX; startScroll = rail.scrollLeft;
      rail.style.cursor = "grabbing"; rail.style.userSelect = "none";
    });
    window.addEventListener("mouseup", () => {
      if (!dragging) return;
      dragging = false; rail.style.cursor = ""; rail.style.userSelect = "";
    });
    window.addEventListener("mousemove", (e) => {
      if (!dragging) return;
      rail.scrollLeft = startScroll - (e.clientX - startX);
    });

    // Initial
    setTimeout(update, 60);
  }

  // Decorative botanical silhouettes used inside cat-tile cards
  function catSilhouetteSVG(id) {
    const ink = "#2D4856";
    const o = ".22";
    const map = {
      interior:  `<svg viewBox="0 0 200 200" fill="${ink}" opacity="${o}"><path d="M100 180 C 80 130, 40 110, 40 70 C 40 50, 65 38, 85 50 C 75 25, 100 5, 115 30 C 135 5, 160 30, 145 55 C 165 50, 180 80, 155 100 C 175 110, 165 145, 130 145 Z"/></svg>`,
      exterior:  `<svg viewBox="0 0 200 200" fill="${ink}" opacity="${o}"><ellipse cx="100" cy="80" rx="20" ry="50"/><ellipse cx="70" cy="100" rx="18" ry="42" transform="rotate(-20 70 100)"/><ellipse cx="130" cy="100" rx="18" ry="42" transform="rotate(20 130 100)"/><rect x="95" y="130" width="10" height="50"/></svg>`,
      arboles:   `<svg viewBox="0 0 200 200" fill="${ink}" opacity="${o}"><ellipse cx="100" cy="90" rx="60" ry="65"/><rect x="93" y="130" width="14" height="60"/></svg>`,
      sustratos: `<svg viewBox="0 0 200 200" fill="${ink}" opacity="${o}"><path d="M55 50 L145 50 L150 60 L150 175 Q150 188 138 188 L62 188 Q50 188 50 175 L50 60 Z"/></svg>`,
      macetas:   `<svg viewBox="0 0 200 200" fill="${ink}" opacity="${o}"><path d="M50 60 L150 60 L138 180 L62 180 Z"/><ellipse cx="100" cy="60" rx="50" ry="9"/></svg>`,
      flores:    `<svg viewBox="0 0 200 200" fill="${ink}" opacity="${o}"><circle cx="100" cy="60" r="14"/><circle cx="82" cy="80" r="14"/><circle cx="118" cy="80" r="14"/><circle cx="100" cy="80" r="14"/><circle cx="100" cy="100" r="14"/><rect x="96" y="100" width="8" height="80"/></svg>`
    };
    return map[id] || map.interior;
  }

  function pickFeatured(n) {
    const seen = new Set();
    const out = [];
    // round-robin through categories
    for (let i = 0; out.length < n; i++) {
      for (const c of CATEGORIES) {
        const candidates = PRODUCTS.filter(p => p.cat === c.id && !seen.has(p.id));
        if (candidates[i]) { out.push(candidates[i]); seen.add(candidates[i].id); }
        if (out.length >= n) break;
      }
      if (i > 20) break;
    }
    return out.slice(0, n);
  }

  function catIconSVG(id) {
    const icons = {
      interior:  `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#4a7c4e" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20v-8M12 12c0-4 3-7 7-7-1 4-3 7-7 7zM12 12c0-3-2-6-6-6 1 3 2 6 6 6zM9 20h6"/></svg>`,
      exterior:  `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#4a7c4e" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22v-6M5 14a4 4 0 1 1 8 0 4 4 0 1 1 8 0M8 8a4 4 0 1 1 8 0"/></svg>`,
      arboles:   `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#4a7c4e" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22v-7M8 15a4 4 0 0 1-2-7 4 4 0 0 1 6-3 4 4 0 0 1 6 3 4 4 0 0 1-2 7H8z"/></svg>`,
      sustratos: `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#4a7c4e" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4h12l-1 4H7zM7 8h10v12a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2z"/></svg>`,
      macetas:   `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#4a7c4e" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 9h14l-2 11H7zM4 9h16M9 9V5a3 3 0 0 1 6 0v4"/></svg>`,
      flores:    `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#4a7c4e" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="2.5"/><path d="M12 9V4M12 15v5M9 12H4M15 12h5M9.5 9.5L6 6M14.5 9.5L18 6M9.5 14.5L6 18M14.5 14.5L18 18"/></svg>`
    };
    return icons[id] || icons.interior;
  }

  function renderShop() {
    const grid = document.getElementById("shop-grid");
    const filters = document.getElementById("filters");
    const search = document.getElementById("shop-search");
    if (!grid) return;

    const params = new URLSearchParams(location.search);
    let activeCat = params.get("cat") || "all";
    let term = "";

    function renderFilters() {
      const items = [
        { id: "all", label: t("common.all"), count: PRODUCTS.length },
        ...CATEGORIES.map(c => ({
          id: c.id, label: c[getLang()],
          count: PRODUCTS.filter(p => p.cat === c.id).length
        }))
      ];
      filters.innerHTML =
        `<h4 data-i18n="common.filter">${t("common.filter")}</h4>
         <div class="filter-list">
           ${items.map(i => `
             <button data-cat="${i.id}" class="${activeCat === i.id ? "is-active" : ""}">
               <span>${i.label}</span><span class="count">${i.count}</span>
             </button>`).join("")}
         </div>`;
      filters.querySelectorAll("button[data-cat]").forEach(b => {
        b.addEventListener("click", () => {
          activeCat = b.dataset.cat;
          // update url without reload
          const u = new URL(location.href);
          if (activeCat === "all") u.searchParams.delete("cat");
          else u.searchParams.set("cat", activeCat);
          history.replaceState({}, "", u);
          renderFilters();
          renderGrid();
        });
      });
    }

    function renderGrid() {
      let list = PRODUCTS.slice();
      if (activeCat !== "all") list = list.filter(p => p.cat === activeCat);
      if (term) {
        const T = term.toLowerCase();
        list = list.filter(p =>
          productName(p).toLowerCase().includes(T) ||
          productDesc(p).toLowerCase().includes(T)
        );
      }
      if (list.length === 0) {
        grid.innerHTML = `<div class="empty-state"><h3 data-i18n="shop.empty">${t("shop.empty")}</h3></div>`;
        return;
      }
      grid.innerHTML = list.map(productCardHTML).join("");
      attachAddButtons(grid);
    }

    if (search) {
      search.addEventListener("input", (e) => {
        term = e.target.value.trim();
        renderGrid();
      });
    }

    renderFilters();
    renderGrid();

    document.addEventListener("vj:langchange", () => {
      renderFilters();
      renderGrid();
    });
  }

  function renderProductPage() {
    const root = document.getElementById("product-root");
    if (!root) return;
    const id = new URLSearchParams(location.search).get("id");
    const p = PRODUCTS.find(x => x.id === id);

    function render() {
      if (!p) {
        root.innerHTML = `<div class="empty-state"><h3>Producto no encontrado</h3>
          <a href="tienda.html" class="btn btn-primary mt-16">${t("common.back")}</a></div>`;
        return;
      }
      const inStock = p.stock > 0;
      root.innerHTML = `
        <div class="crumbs">
          <a href="index.html">${t("nav.home")}</a> ·
          <a href="tienda.html">${t("nav.shop")}</a> ·
          <a href="tienda.html?cat=${p.cat}">${catName(p.cat)}</a>
        </div>
        <div class="product-detail">
          <div class="product-detail-img">${productImgSVG(p)}</div>
          <div class="product-detail-info">
            <div class="detail-cat">${catName(p.cat)}</div>
            <h1>${productName(p)}</h1>
            <div class="detail-price">${formatPrice(p.price)}</div>
            <span class="stock-pill ${inStock ? "" : "out"}">
              ${inStock
                ? `${t("common.inStock")} · ${p.stock} ${t("common.units")}`
                : t("common.outOfStock")}
            </span>
            <p class="detail-desc">${productDesc(p)}</p>
            <div class="qty-row">
              <div class="qty-stepper">
                <button class="js-dec" aria-label="-">−</button>
                <input type="number" id="qty" value="1" min="1" max="${Math.max(1, p.stock)}">
                <button class="js-inc" aria-label="+">+</button>
              </div>
            </div>
            <div class="detail-actions">
              <button class="btn btn-primary" id="add-detail" ${inStock ? "" : "disabled"}>
                ${t("common.addToCart")}
              </button>
              <a class="btn btn-outline" href="tienda.html">${t("common.continue")}</a>
            </div>
          </div>
        </div>
      `;
      const qty = root.querySelector("#qty");
      root.querySelector(".js-inc").addEventListener("click", () => {
        const v = Math.min(parseInt(qty.value) + 1, Math.max(1, p.stock));
        qty.value = v;
      });
      root.querySelector(".js-dec").addEventListener("click", () => {
        const v = Math.max(parseInt(qty.value) - 1, 1);
        qty.value = v;
      });
      root.querySelector("#add-detail").addEventListener("click", () => {
        addToCart(p.id, parseInt(qty.value) || 1);
      });

      // related
      const related = PRODUCTS.filter(x => x.cat === p.cat && x.id !== p.id).slice(0, 4);
      const relRoot = document.getElementById("related-grid");
      if (relRoot) {
        relRoot.innerHTML = related.map(productCardHTML).join("");
        attachAddButtons(relRoot);
      }
    }
    render();
    document.addEventListener("vj:langchange", render);
  }

  function renderCartPage() {
    const root = document.getElementById("cart-root");
    if (!root) return;

    function render() {
      const items = getCart();
      if (items.length === 0) {
        root.innerHTML = `
          <div class="empty-state">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M3 4h2l2.6 11.3a2 2 0 0 0 2 1.7h8.2a2 2 0 0 0 2-1.6L21 8H6"/></svg>
            <h3>${t("cart.empty")}</h3>
            <a href="tienda.html" class="btn btn-primary mt-16">${t("cart.emptyCta")}</a>
          </div>`;
        return;
      }
      const rows = items.map(it => {
        const p = PRODUCTS.find(x => x.id === it.id);
        if (!p) return "";
        return `
          <div class="cart-row" data-id="${p.id}">
            <a href="producto.html?id=${p.id}" class="cart-img">${productImgSVG(p)}</a>
            <div class="cart-info">
              <div class="cat">${catName(p.cat)}</div>
              <h4><a href="producto.html?id=${p.id}">${productName(p)}</a></h4>
              <div class="unit">${formatPrice(p.price)} / ${t("common.units").slice(0,-1)}</div>
              <div class="qty-stepper mt-8">
                <button class="js-dec">−</button>
                <input type="number" class="js-qty" value="${it.qty}" min="1">
                <button class="js-inc">+</button>
              </div>
            </div>
            <div class="cart-controls">
              <div class="line-price">${formatPrice(p.price * it.qty)}</div>
              <button class="remove-btn js-remove">${t("common.remove")}</button>
            </div>
          </div>
        `;
      }).join("");

      const total = cartTotal();
      root.innerHTML = `
        <div class="cart-layout">
          <div class="cart-items">${rows}</div>
          <aside class="summary">
            <h3>${t("checkout.summary")}</h3>
            <div class="summary-row"><span>${t("common.subtotal")}</span><span>${formatPrice(total)}</span></div>
            <div class="summary-row total"><span>${t("common.total")}</span><span>${formatPrice(total)}</span></div>
            <a href="checkout.html" class="btn btn-primary btn-block mt-24">${t("common.checkout")}</a>
            <a href="tienda.html" class="btn btn-ghost btn-block mt-8">${t("common.continue")}</a>
          </aside>
        </div>
      `;

      // wire controls
      root.querySelectorAll(".cart-row").forEach(row => {
        const id = row.dataset.id;
        row.querySelector(".js-inc").addEventListener("click", () => {
          const cart = getCart();
          const item = cart.find(it => it.id === id);
          if (item) { updateQty(id, item.qty + 1); render(); }
        });
        row.querySelector(".js-dec").addEventListener("click", () => {
          const cart = getCart();
          const item = cart.find(it => it.id === id);
          if (item) { updateQty(id, item.qty - 1); render(); }
        });
        row.querySelector(".js-qty").addEventListener("change", (e) => {
          updateQty(id, Math.max(1, parseInt(e.target.value) || 1));
          render();
        });
        row.querySelector(".js-remove").addEventListener("click", () => {
          removeFromCart(id); render();
        });
      });
    }

    render();
    document.addEventListener("vj:langchange", render);
    document.addEventListener("vj:cartchange", render);
  }

  function renderCheckoutPage() {
    const root = document.getElementById("checkout-root");
    if (!root) return;

    function render() {
      const items = getCart();
      if (items.length === 0) {
        root.innerHTML = `
          <div class="empty-state">
            <h3>${t("cart.empty")}</h3>
            <a href="tienda.html" class="btn btn-primary mt-16">${t("cart.emptyCta")}</a>
          </div>`;
        return;
      }

      const summary = items.map(it => {
        const p = PRODUCTS.find(x => x.id === it.id);
        if (!p) return "";
        return `<div class="summary-row">
          <span>${productName(p)} <span class="muted">× ${it.qty}</span></span>
          <span>${formatPrice(p.price * it.qty)}</span>
        </div>`;
      }).join("");

      const u = currentUser();
      const authNote = u
        ? `<div class="muted" style="font-size:.85rem; margin-bottom: 16px;">✓ ${t("account.welcome")}, <strong>${u.name}</strong></div>`
        : `<div class="muted" style="font-size:.85rem; margin-bottom: 16px;">
             <a href="entrar.html?return=checkout.html">${t("auth.signin")}</a> ·
             <a href="registro.html?return=checkout.html">${t("auth.signup")}</a>
           </div>`;

      root.innerHTML = `
        <div class="cart-layout">
          <form class="form-card" id="checkout-form">
            <h3 style="font-family:'Playfair Display',serif;font-style:italic;font-weight:500;margin-bottom:16px;">${t("checkout.details")}</h3>
            ${authNote}
            <div class="form-grid">
              <div class="form-field full">
                <label>${t("checkout.name")}</label>
                <input type="text" name="name" required value="${u ? u.name : ""}">
              </div>
              <div class="form-field">
                <label>${t("checkout.emailLbl")}</label>
                <input type="email" name="email" required value="${u ? u.email : ""}">
              </div>
              <div class="form-field">
                <label>${t("checkout.phoneLbl")}</label>
                <input type="tel" name="phone" required value="${u ? (u.phone || "") : ""}">
              </div>
            </div>
            <h3 style="font-family:'Playfair Display',serif;font-style:italic;font-weight:500;margin-top:32px;margin-bottom:16px;">${t("checkout.delivery")}</h3>
            <div class="radio-group">
              <label class="radio-option is-active">
                <input type="radio" name="delivery" value="pickup" checked>
                <span>${t("checkout.pickup")}</span>
              </label>
              <label class="radio-option">
                <input type="radio" name="delivery" value="ship">
                <span>${t("checkout.ship")}</span>
              </label>
            </div>
            <div class="form-field full mt-16" id="ship-addr" style="display:none;">
              <label>${t("checkout.address")}</label>
              <input type="text" name="address" placeholder="Calle, número, ciudad, CP">
            </div>
            <div class="form-field full mt-16">
              <label>${t("checkout.notes")}</label>
              <textarea name="notes" placeholder=""></textarea>
            </div>
            <button type="submit" class="btn btn-primary btn-block btn-arrow mt-24">${t("checkout.submit")}</button>
          </form>

          <aside class="summary">
            <h3>${t("checkout.summary")}</h3>
            ${summary}
            <div class="summary-row total"><span>${t("common.total")}</span><span>${formatPrice(cartTotal())}</span></div>
          </aside>
        </div>
      `;

      const form = root.querySelector("#checkout-form");
      const addrField = root.querySelector("#ship-addr");
      const radios = root.querySelectorAll('input[name="delivery"]');
      radios.forEach(r => {
        r.addEventListener("change", () => {
          root.querySelectorAll(".radio-option").forEach(o => o.classList.remove("is-active"));
          r.closest(".radio-option").classList.add("is-active");
          addrField.style.display = r.value === "ship" ? "" : "none";
          if (r.value === "ship") addrField.querySelector("input").setAttribute("required", "");
          else addrField.querySelector("input").removeAttribute("required");
        });
      });

      form.addEventListener("submit", (e) => {
        e.preventDefault();
        const ref = "JZ-" + Date.now().toString(36).toUpperCase();
        const order = {
          ref,
          items: getCart(),
          total: cartTotal(),
          details: Object.fromEntries(new FormData(form)),
          createdAt: new Date().toISOString()
        };
        localStorage.setItem("vj.lastOrder", JSON.stringify(order));
        // If logged in, append to user's order history
        appendOrderToUser(order);
        setCart([]);
        location.href = "gracias.html?ref=" + ref;
      });
    }

    render();
    document.addEventListener("vj:langchange", render);
  }

  function renderAccountPage() {
    const root = document.getElementById("account-root");
    if (!root) return;

    function render() {
      const u = currentUser();
      if (!u) { location.href = "entrar.html"; return; }

      const orders = u.orders || [];
      const created = new Date(u.createdAt);
      const memberSince = created.toLocaleDateString(getLang() === "va" ? "ca-ES" : "es-ES", { year: "numeric", month: "long" });

      root.innerHTML = `
        <div class="account-layout">
          <aside class="account-side">
            <div class="account-name">${u.name}</div>
            <div class="account-email">${u.email}</div>
            <h4>${t("account.title")}</h4>
            <nav class="account-menu">
              <a href="#orders">${t("account.menu.orders")} <span style="margin-left:auto; color:var(--ink-soft); font-size:.8rem;">${orders.length}</span></a>
              <a href="#profile">${t("account.menu.profile")}</a>
              <button class="logout" id="logout-btn">${t("account.menu.logout")} →</button>
            </nav>
          </aside>
          <div>
            <div class="account-section" id="orders">
              <h3>${t("account.orders.title")}</h3>
              ${orders.length === 0
                ? `<div class="empty-state"><h3>${t("account.orders.empty")}</h3>
                     <a href="tienda.html" class="btn btn-primary btn-arrow mt-16">${t("cart.emptyCta")}</a></div>`
                : `<div class="order-list">${orders.map(o => `
                    <div class="order-row">
                      <div class="order-meta">
                        <div class="ref">${o.ref}</div>
                        <div class="date">${new Date(o.createdAt).toLocaleDateString(getLang() === "va" ? "ca-ES" : "es-ES", { year:"numeric", month:"short", day:"numeric" })}</div>
                      </div>
                      <div class="order-items">${o.items.length} ${t("common.units")}</div>
                      <div class="order-total">${formatPrice(o.total)}</div>
                    </div>`).join("")}</div>`
              }
            </div>
            <div class="account-section" id="profile">
              <h3>${t("account.profile.title")}</h3>
              <div class="form-card">
                <div class="form-grid">
                  <div class="form-field">
                    <label>${t("checkout.name")}</label>
                    <input type="text" value="${u.name}" disabled>
                  </div>
                  <div class="form-field">
                    <label>${t("checkout.emailLbl")}</label>
                    <input type="email" value="${u.email}" disabled>
                  </div>
                  <div class="form-field">
                    <label>${t("checkout.phoneLbl")}</label>
                    <input type="tel" value="${u.phone || ""}" disabled>
                  </div>
                  <div class="form-field">
                    <label>${t("account.member")}</label>
                    <input type="text" value="${memberSince}" disabled>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      `;
      const btn = root.querySelector("#logout-btn");
      if (btn) btn.addEventListener("click", () => { logoutUser(); location.href = "index.html"; });
    }
    render();
    document.addEventListener("vj:langchange", render);
    document.addEventListener("vj:authchange", render);
  }

  function renderThanksPage() {
    const root = document.getElementById("thanks-root");
    if (!root) return;
    const ref = new URLSearchParams(location.search).get("ref") || "—";
    function render() {
      root.innerHTML = `
        <div class="success-card">
          <div class="success-icon">
            <svg viewBox="0 0 24 24" width="44" height="44" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
          </div>
          <h1>${t("checkout.success.title")}</h1>
          <p class="muted">${t("checkout.success.text")}</p>
          <div class="mt-16">
            <small class="muted">${t("checkout.success.ref")}</small>
            <div class="ref-code">${ref}</div>
          </div>
          <a href="index.html" class="btn btn-primary mt-32">${t("checkout.success.back")}</a>
        </div>
      `;
    }
    render();
    document.addEventListener("vj:langchange", render);
  }

  function renderContactForm() {
    const form = document.getElementById("contact-form");
    const ok = document.getElementById("contact-success");
    if (!form) return;
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      form.style.display = "none";
      ok.style.display = "block";
    });
  }

  /* ---------------- Boot ---------------- */
  document.addEventListener("DOMContentLoaded", () => {
    document.documentElement.lang = getLang() === "va" ? "ca-valencia" : "es";
    mountChrome();
    initHeader();
    applyTranslations();

    // re-render footer on lang change (category labels & hours)
    document.addEventListener("vj:langchange", () => {
      rerenderFooter();
      initHeader(); // re-wire lang buttons etc.
      applyTranslations();
      updateCartBadge();
      updateAuthLink();
      // re-mark active nav
      const p = location.pathname.split("/").pop() || "index.html";
      document.querySelectorAll(".nav a").forEach(a => {
        if (a.getAttribute("href") === p) a.classList.add("is-active");
      });
    });
    document.addEventListener("vj:authchange", updateAuthLink);

    // mark active nav link
    const path = location.pathname.split("/").pop() || "index.html";
    document.querySelectorAll(".nav a").forEach(a => {
      if (a.getAttribute("href") === path) a.classList.add("is-active");
    });

    renderHome();
    renderShop();
    renderProductPage();
    renderCartPage();
    renderCheckoutPage();
    renderThanksPage();
    renderContactForm();
    renderAccountPage();
    attachAddButtons();
    initCookieBanner();
  });
})();
