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
  return {
    id: row.id,
    cat: row.cat,
    price: Number(row.price),
    stock: row.stock,
    imgSeed: row.img_seed || 0,
    img: row.img || undefined,
    name: { es: row.name_es, va: row.name_va },
    desc: { es: row.desc_es, va: row.desc_va },
    availableOnline: row.available_online !== false,
    delivery: row.delivery || "standard",
    ivaRate: row.iva_rate != null ? Number(row.iva_rate) : 10
  };
}
function productToRow(p, sortOrder) {
  const row = {
    id: p.id,
    cat: p.cat,
    price: p.price,
    stock: p.stock,
    img_seed: p.imgSeed || 0,
    img: p.img || null,
    name_es: p.name?.es || "",
    name_va: p.name?.va || "",
    desc_es: p.desc?.es || "",
    desc_va: p.desc?.va || "",
    available_online: p.availableOnline !== false,
    delivery: p.delivery || "standard",
    iva_rate: p.ivaRate != null ? p.ivaRate : 10,
    updated_at: new Date().toISOString()
  };
  if (sortOrder != null) row.sort_order = sortOrder;
  return row;
}

window.VJ_SUPA = { client: supa, rowToProduct, productToRow };
