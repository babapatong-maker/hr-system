// แคชผลการอ่านข้อมูลในหน่วยความจำแบบสั้น ๆ เพื่อลดการดึงข้อมูลซ้ำจาก Supabase (ลด egress)
// ทุกครั้งที่มีการเขียน (insert/update/upsert/delete) ผ่าน supabase.from() แคชจะถูกล้างทั้งหมด
import { supabase } from "./supabase.js";
import { hydrateFiles, stripFiles, setFileClient } from "./fileStore.js";

const store = new Map();
let generation = 0;

export function clearQueryCache() { generation += 1; store.clear(); }

// cached("key", 60000, () => fetchSomething()) — คำขอเดียวกันที่ซ้อนกันจะใช้ promise เดียวกัน
export function cached(key, ttlMs, loader) {
  const now = Date.now();
  const hit = store.get(key);
  if (hit && hit.expires > now) return hit.promise;
  const gen = generation;
  const promise = Promise.resolve().then(loader);
  store.set(key, { promise, expires: now + ttlMs });
  promise.then(() => { if (gen !== generation) store.delete(key); }, () => { if (store.get(key)?.promise === promise) store.delete(key); });
  return promise;
}

if (supabase) setFileClient(supabase);
if (supabase && !supabase.__egressPatched) {
  const origFrom = supabase.from.bind(supabase);
  supabase.from = (...args) => {
    const builder = origFrom(...args);
    const origSelect = builder.select;
    if (typeof origSelect === "function") {
      builder.select = (...a) => {
        const fb = origSelect.apply(builder, a);
        if (fb && typeof fb.then === "function") {
          const t = fb.then.bind(fb);
          fb.then = (res, rej) => t(async v => { try { if (v && v.data) await hydrateFiles(v.data); } catch { /* ignore */ } return v; }).then(res, rej);
        }
        return fb;
      };
    }
    ["insert", "update", "upsert", "delete"].forEach(name => {
      const orig = builder[name];
      if (typeof orig !== "function") return;
      builder[name] = (...a) => {
        if (name !== "delete" && a.length) a[0] = stripFiles(a[0]);
        clearQueryCache();
        const next = orig.apply(builder, a);
        // ล้างอีกครั้งหลังเขียนเสร็จ กันกรณีมีคำขออ่านระหว่างเขียน
        if (next && typeof next.then === "function") {
          const origThen = next.then.bind(next);
          next.then = (res, rej) => origThen(v => { clearQueryCache(); return res ? res(v) : v; }, rej);
        }
        return next;
      };
    });
    return builder;
  };
  supabase.__egressPatched = true;
}
