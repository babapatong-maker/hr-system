// ไฟล์แนบ (รูป/PDF) เก็บใน Supabase Storage แบบ private แล้วเก็บเฉพาะ path ในฐานข้อมูล
// อ่าน: เติม url/dataUrl เป็น signed URL ให้อัตโนมัติ  เขียน: ตัด signed URL ออก เก็บเฉพาะ path (ลด egress)
const SIGN_SECONDS = 7 * 86400;
const CACHE_MS = 6 * 86400 * 1000;
const signCache = new Map();
const STORAGE_RE = /\/storage\/v1\/object\/(?:sign|public|authenticated)\/([^/?#]+)\/([^?#]+)/;

export function refFromUrl(value) {
  const s = String(value || "");
  if (s.startsWith("sb://")) { const rest = s.slice(5); const i = rest.indexOf("/"); return i > 0 ? { bucket: rest.slice(0, i), path: rest.slice(i + 1) } : null; }
  const m = s.match(STORAGE_RE);
  return m ? { bucket: decodeURIComponent(m[1]), path: decodeURIComponent(m[2]) } : null;
}

let client = null;
export function setFileClient(c) { client = c; }

export async function signRefs(refs) {
  const now = Date.now();
  const need = new Map();
  refs.forEach(({ bucket, path }) => {
    const hit = signCache.get(`${bucket}/${path}`);
    if (!hit || hit.expires < now) { if (!need.has(bucket)) need.set(bucket, new Set()); need.get(bucket).add(path); }
  });
  await Promise.all([...need.entries()].map(async ([bucket, set]) => {
    try {
      const { data } = await client.storage.from(bucket).createSignedUrls([...set], SIGN_SECONDS);
      (data || []).forEach(item => { if (item?.signedUrl && item.path) signCache.set(`${bucket}/${item.path}`, { url: item.signedUrl, expires: now + CACHE_MS }); });
    } catch { /* ignore */ }
  }));
  const out = new Map();
  refs.forEach(({ bucket, path }) => { const hit = signCache.get(`${bucket}/${path}`); if (hit) out.set(`${bucket}/${path}`, hit.url); });
  return out;
}

export async function signedFileUrl(bucket, path) {
  const map = await signRefs([{ bucket, path }]);
  return map.get(`${bucket}/${path}`) || "";
}

const isRefObj = o => o && typeof o === "object" && !Array.isArray(o) && typeof o.path === "string" && (o.storage === "supabase" || o.bucket);
function walk(o, fn) {
  if (Array.isArray(o)) o.forEach(v => walk(v, fn));
  else if (o && typeof o === "object") { fn(o); Object.values(o).forEach(v => walk(v, fn)); }
}
const looksJson = s => (s[0] === "{" || s[0] === "[") && (s.includes('"storage":"supabase"') || s.includes('"storage": "supabase"') || s.includes("/storage/v1/object/"));

// เติม signed URL ให้ข้อมูลที่อ่านมา (แก้ในที่)
export async function hydrateFiles(data) {
  if (!client || !data) return data;
  const rows = Array.isArray(data) ? data : [data];
  const jobs = [];
  const refs = [];
  rows.forEach(row => {
    if (!row || typeof row !== "object") return;
    Object.keys(row).forEach(key => {
      const v = row[key];
      if (typeof v !== "string" || v.length < 6) return;
      if (v.startsWith("sb://")) { const r = refFromUrl(v); if (r) { refs.push(r); jobs.push({ row, key, ref: r }); } return; }
      if (!looksJson(v)) return;
      let parsed; try { parsed = JSON.parse(v); } catch { return; }
      const objs = [];
      walk(parsed, o => {
        if (!isRefObj(o) && typeof o.url === "string") { const r = refFromUrl(o.url); if (r) { o.path = r.path; o.bucket = r.bucket; o.storage = "supabase"; } }
        if (isRefObj(o)) { o.bucket = o.bucket || "lesson-files"; objs.push(o); refs.push({ bucket: o.bucket, path: o.path }); }
      });
      if (objs.length) jobs.push({ row, key, parsed, objs });
    });
  });
  if (!refs.length) return data;
  const map = await signRefs(refs);
  jobs.forEach(job => {
    if (job.ref) { const u = map.get(`${job.ref.bucket}/${job.ref.path}`); if (u) job.row[job.key] = u; return; }
    job.objs.forEach(o => { const u = map.get(`${o.bucket}/${o.path}`); if (u) { o.url = u; o.dataUrl = u; } });
    job.row[job.key] = JSON.stringify(job.parsed);
  });
  return data;
}

// ก่อนเขียน: ตัด url/dataUrl ที่เป็นลิงก์ Storage ออก เหลือ path
function stripValue(v) {
  if (typeof v !== "string") return v;
  if (/^https?:/i.test(v)) { const r = refFromUrl(v); return r ? `sb://${r.bucket}/${r.path}` : v; }
  if (!looksJson(v)) return v;
  let parsed; try { parsed = JSON.parse(v); } catch { return v; }
  walk(parsed, o => {
    const r = typeof o.url === "string" ? refFromUrl(o.url) : (typeof o.dataUrl === "string" && /^https?:/i.test(o.dataUrl) ? refFromUrl(o.dataUrl) : null);
    if (r && !o.path) { o.path = r.path; o.bucket = r.bucket; }
    if (isRefObj(o) || r) {
      o.storage = "supabase"; o.bucket = o.bucket || "lesson-files";
      if (typeof o.url === "string" && !o.url.startsWith("data:")) delete o.url;
      if (typeof o.dataUrl === "string" && !o.dataUrl.startsWith("data:")) delete o.dataUrl;
    }
  });
  return JSON.stringify(parsed);
}
export function stripFiles(payload) {
  const one = row => {
    if (!row || typeof row !== "object" || Array.isArray(row)) return row;
    const out = {};
    Object.keys(row).forEach(k => { out[k] = stripValue(row[k]); });
    return out;
  };
  return Array.isArray(payload) ? payload.map(one) : one(payload);
}

// อัปโหลดไฟล์ (ไม่มีการเก็บ base64 ในฐานข้อมูลอีก) — คืนค่า ref + signed URL ไว้แสดงผล
export async function uploadFileRef(bucket, objectPath, blob, contentType, extra = {}) {
  const { error } = await client.storage.from(bucket).upload(objectPath, blob, { contentType, upsert: false });
  if (error) throw new Error(`อัปโหลดไฟล์ไม่สำเร็จ: ${error.message || "Storage"}`);
  const url = await signedFileUrl(bucket, objectPath);
  return { ...extra, type: contentType, path: objectPath, bucket, storage: "supabase", url, dataUrl: url };
}

// ย่อรูปก่อนอัปโหลด: ด้านยาวสุด 1280px, JPEG คุณภาพ 0.7
export async function compressImageBlob(file, maxSide = 1280, quality = 0.7) {
  const source = await new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = () => reject(new Error("อ่านไฟล์ไม่สำเร็จ")); r.readAsDataURL(file); });
  const image = await new Promise((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = () => reject(new Error("เปิดรูปภาพไม่สำเร็จ")); img.src = source; });
  const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/jpeg", quality));
  return blob && (blob.size < file.size || file.type !== "image/jpeg") ? blob : file;
}
