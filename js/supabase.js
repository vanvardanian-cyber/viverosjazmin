/* =========================================================
   Viveros Jazmín — Supabase client
   The supabase-js library is loaded via CDN as window.supabase.
   This file just instantiates the client with the project keys.
   ========================================================= */

const SUPABASE_URL = "https://nvwaktscqxswrnnrvvif.supabase.co";
const SUPABASE_KEY = "sb_publishable_rAtbZT-42JXkoILaAnJ4nQ_JkAJS4pb";

// `supabase` is the library namespace exported by the CDN bundle;
// `supa` is our singleton client instance.
const supa = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    persistSession: true,           // keep admin / customer logged in across reloads
    autoRefreshToken: true,
    storage: window.localStorage,
    storageKey: "vj.supabase.auth"
  },
  global: {
    headers: { "x-application-name": "viveros-jazmin" }
  }
});

// Mapping helpers between site's product shape (nested name/desc objects)
// and Supabase's flat column shape (name_es, name_va, desc_es, desc_va).
function rowToProduct(row) {
  // Normalise images: prefer the new `images` array; fall back to single `img`
  // so legacy rows (and the seed data) still display correctly.
  let images = Array.isArray(row.images) ? row.images.filter(Boolean) : [];
  if (images.length === 0 && row.img) images = [row.img];
  return {
    id: row.id,
    cat: row.cat,
    price: Number(row.price),
    stock: row.stock,
    imgSeed: row.img_seed || 0,
    img: images[0] || row.img || undefined,   // first photo = the legacy single img
    images,                                    // full array of up to 6 URLs
    name: { es: row.name_es, va: row.name_va },
    desc: { es: row.desc_es, va: row.desc_va },
    availableOnline: row.available_online !== false,
    delivery: row.delivery || "standard",
    ivaRate: row.iva_rate != null ? Number(row.iva_rate) : 10,
    origin: row.origin || "",
    featured: row.featured === true,
    // Floristería filter attributes (optional)
    floristType: row.florist_type || "",
    flowerType: row.flower_type || "",
    color: row.color || ""
  };
}
function productToRow(p, sortOrder) {
  // Cap the images array at 6 entries and strip any empty values
  const images = Array.isArray(p.images)
    ? p.images.filter(Boolean).slice(0, 6)
    : (p.img ? [p.img] : []);
  const row = {
    id: p.id,
    cat: p.cat,
    price: p.price,
    stock: p.stock,
    img_seed: p.imgSeed || 0,
    img: images[0] || p.img || null,   // keep the legacy column synced to the first image
    images,                            // full array
    name_es: p.name?.es || "",
    name_va: p.name?.va || "",
    desc_es: p.desc?.es || "",
    desc_va: p.desc?.va || "",
    available_online: p.availableOnline !== false,
    delivery: p.delivery || "standard",
    iva_rate: p.ivaRate != null ? p.ivaRate : 10,
    origin: (p.origin || "").trim() || null,
    featured: !!p.featured,
    florist_type: (p.floristType || "").trim() || null,
    flower_type:  (p.flowerType  || "").trim() || null,
    color:        (p.color       || "").trim() || null,
    updated_at: new Date().toISOString()
  };
  if (sortOrder != null) row.sort_order = sortOrder;
  return row;
}

window.VJ_SUPA = { client: supa, rowToProduct, productToRow };
