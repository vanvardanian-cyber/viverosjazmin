/* Publish robot: fetch live products from Supabase, shrink any oversized
   base64 images, and write data/catalog.json — the static snapshot customers
   read from the CDN (so visitor traffic never queries the database).

   Runs both locally on macOS (uses `sips`) and in GitHub Actions on Linux
   (uses ImageMagick `convert`, preinstalled on ubuntu-latest runners).

   Reads the Supabase URL + publishable key from js/supabase.js — the same
   public, RLS-protected key the website itself ships — so there is nothing
   to configure and no secret to store. */
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execSync } = require("child_process");

const supaSrc = fs.readFileSync(path.join(__dirname, "..", "js", "supabase.js"), "utf8");
const PROJECT = (supaSrc.match(/SUPABASE_URL\s*=\s*"([^"]+)"/) || [])[1];
const KEY = (supaSrc.match(/SUPABASE_KEY\s*=\s*"([^"]+)"/) || [])[1];
if (!PROJECT || !KEY) {
  console.error("Could not read SUPABASE_URL / SUPABASE_KEY from js/supabase.js");
  process.exit(1);
}

const MAXDIM = 1000;      // cap longest image side
const QUALITY = 70;       // jpeg quality
// Images at or under this base64 length pass through untouched. Keeps runs
// deterministic (no re-encoding of already-small images → no spurious diffs,
// so the workflow only commits when the catalog really changed).
const SKIP_BELOW = 350000;
const HAS_SIPS = process.platform === "darwin";

function shrink(dataURL) {
  if (typeof dataURL !== "string" || !dataURL.startsWith("data:image")) return dataURL;
  if (dataURL.length <= SKIP_BELOW) return dataURL;
  const m = dataURL.match(/^data:(image\/[a-z0-9.+-]+);base64,(.*)$/i);
  if (!m) return dataURL;
  const ext = /png/i.test(m[1]) ? "png" : (/webp/i.test(m[1]) ? "webp" : "jpg");
  const rnd = Math.random().toString(36).slice(2);
  const tin = path.join(os.tmpdir(), `vj_in_${rnd}.${ext}`);
  const tout = path.join(os.tmpdir(), `vj_out_${rnd}.jpg`);
  try {
    fs.writeFileSync(tin, Buffer.from(m[2], "base64"));
    if (HAS_SIPS) {
      execSync(`sips -Z ${MAXDIM} -s format jpeg -s formatOptions ${QUALITY} "${tin}" --out "${tout}"`, { stdio: "ignore" });
    } else {
      // ">" = only shrink, never enlarge (literal inside double quotes in sh)
      execSync(`convert "${tin}" -auto-orient -resize "${MAXDIM}x${MAXDIM}>" -quality ${QUALITY} "${tout}"`, { stdio: "ignore" });
    }
    return "data:image/jpeg;base64," + fs.readFileSync(tout).toString("base64");
  } catch (e) {
    return dataURL; // keep original if the image tool fails
  } finally {
    try { fs.unlinkSync(tin); } catch {}
    try { fs.unlinkSync(tout); } catch {}
  }
}

(async () => {
  const url = `${PROJECT}/rest/v1/products?select=*&order=sort_order.asc`;
  const res = await fetch(url, { headers: { apikey: KEY, Authorization: "Bearer " + KEY } });
  if (!res.ok) { console.error("HTTP", res.status, await res.text()); process.exit(1); }
  const rows = await res.json();
  let before = 0, after = 0;
  for (const row of rows) {
    if (typeof row.img === "string" && row.img.startsWith("data:")) {
      before += row.img.length; row.img = shrink(row.img); after += row.img.length;
    }
    if (Array.isArray(row.images)) {
      row.images = row.images.map(s => {
        if (typeof s === "string" && s.startsWith("data:")) {
          before += s.length; const o = shrink(s); after += o.length; return o;
        }
        return s;
      });
    }
  }
  const outPath = path.join(__dirname, "..", "data", "catalog.json");
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(rows));
  console.log(JSON.stringify({
    rows: rows.length,
    fileKB: Math.round(fs.statSync(outPath).size / 1024),
    base64BeforeKB: Math.round(before / 1024),
    base64AfterKB: Math.round(after / 1024)
  }));
})();
