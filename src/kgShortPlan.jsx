// แผนการจัดประสบการณ์ระยะสั้น (อนุบาล) ตามแบบฟอร์มของโรงเรียน 7 ส่วน
// เก็บใน teaching_schedule (ห้องพิเศษ __KG_SHORT_PLAN__) ไม่ต้องแก้โครงสร้างฐานข้อมูล
//   แถวหลัก: day_of_week 0  = ส่วนที่ 1,2,3,5,6,7 + สถานะ (start_time 00:01 ร่าง / 00:02 ส่ง / 00:03 ส่งช้า)
//   แถวรายวัน: day_of_week 1–5 = ส่วนที่ 4 แผนรายวันของวันนั้น (แยกแถวเพื่อไม่ให้ JSON ยาวเกิน)
//   period = วันจันทร์ของสัปดาห์ (YYYYMMDD)
import { useState, useEffect, useCallback, Fragment } from "react";
import { supabase } from "./supabase.js";

export const KG_SHORT_PLAN_ROOM = "__KG_SHORT_PLAN__";

// ── ตั้งค่าที่ปรับง่าย ─────────────────────────────────────────────
// ครูอนุบาลที่ใช้เมนูนี้ (ชื่อ-สกุล ไม่ต้องใส่คำนำหน้า) + ห้องที่รับผิดชอบ
export const KG_TEACHERS = [
  { name: "จุฑารัตน์ แสงโสด", level: "ตอ." },
  { name: "จิตราพร ยิ้มแย้ม", level: "อ.1" },
  { name: "ศิริรัตน์ เหล็กทอง", level: "อ.2" },
  { name: "พัชราพร การะภักดี", level: "อ.3" },
];
export const KG_PLAN_RULES = {
  deadlineDaysBeforeMonday: 3, // ส่งภายในวันศุกร์ก่อนสัปดาห์สอน (เหมือนแผนสอนเดิม)
  deadlineTime: "17:00",
  scoreDeduction: false, // ยังไม่หักคะแนนครู (เปิดใช้ภายหลังได้)
};
const JSON_LIMIT = 3200000;

export const KG_ACTIVITIES = [
  { key: "move", label: "กิจกรรมเคลื่อนไหวและจังหวะ", short: "เคลื่อนไหวและจังหวะ" },
  { key: "experience", label: "กิจกรรมเสริมประสบการณ์", short: "เสริมประสบการณ์" },
  { key: "art", label: "กิจกรรมศิลปะสร้างสรรค์", short: "ศิลปะสร้างสรรค์" },
  { key: "corner", label: "กิจกรรมเล่นตามมุม", short: "เล่นตามมุม" },
  { key: "outdoor", label: "กิจกรรมกลางแจ้ง", short: "กลางแจ้ง" },
  { key: "game", label: "กิจกรรมเกมการศึกษา", short: "เกมการศึกษา" },
];
const ANALYSIS_ROWS = [
  { key: "content", label: "สาระที่ควรเรียนรู้", required: true },
  { key: "standards", label: "มาตรฐาน ตัวบ่งชี้ สภาพที่พึงประสงค์", required: true },
  { key: "exp_body", label: "ประสบการณ์สำคัญ – ร่างกาย", required: true },
  { key: "exp_emotion", label: "ประสบการณ์สำคัญ – อารมณ์ จิตใจ", required: true },
  { key: "exp_social", label: "ประสบการณ์สำคัญ – สังคม", required: true },
  { key: "exp_intellect", label: "ประสบการณ์สำคัญ – สติปัญญา", required: true },
  { key: "math", label: "คณิตศาสตร์" },
  { key: "science", label: "วิทยาศาสตร์" },
  { key: "language", label: "พัฒนาการทางภาษาและการรู้หนังสือ" },
  { key: "objectives", label: "จุดประสงค์", required: true },
];
const DAILY_FIELDS = [
  { key: "objective", label: "จุดประสงค์การเรียนรู้", required: true },
  { key: "experience", label: "ประสบการณ์สำคัญ" },
  { key: "content", label: "สาระที่ควรเรียนรู้" },
  { key: "steps", label: "กิจกรรมการเรียนรู้ (ขั้นตอน)", required: true },
  { key: "media", label: "สื่อ" },
  { key: "assess", label: "การประเมินพัฒนาการ" },
];
const DOMAINS = [
  { key: "body", label: "ด้านร่างกาย" },
  { key: "emotion", label: "ด้านอารมณ์และจิตใจ" },
  { key: "social", label: "ด้านสังคม" },
  { key: "intellect", label: "ด้านสติปัญญา" },
];
const LEVELS = [{ v: 3, t: "3 ดี" }, { v: 2, t: "2 ปานกลาง" }, { v: 1, t: "1 ต้องส่งเสริม" }];
const DAY_LABELS = ["จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์"];
const THAI_DIGITS = "๐๑๒๓๔๕๖๗๘๙";
const thaiNum = v => String(v).replace(/\d/g, d => THAI_DIGITS[d]);

// ── วันที่ ──────────────────────────────────────────────────────
function shiftDateKey(dateKey, days) {
  const [y, m, d] = dateKey.split("-").map(Number);
  const u = new Date(Date.UTC(y, m - 1, d));
  u.setUTCDate(u.getUTCDate() + days);
  return u.toISOString().slice(0, 10);
}
export function kgMondayOf(dateKey) {
  const [y, m, d] = dateKey.split("-").map(Number);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return shiftDateKey(dateKey, wd === 0 ? -6 : 1 - wd);
}
const todayKey = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" });
const periodKey = monday => Number(monday.replace(/-/g, ""));
function thaiDate(dateKey, opts = { day: "numeric", month: "short", year: "2-digit" }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey || "")) return "-";
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString("th-TH", { ...opts, timeZone: "UTC" });
}
function bangkokStamp(iso) {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(new Date(iso));
  const g = t => p.find(x => x.type === t)?.value || "00";
  return `${g("year")}-${g("month")}-${g("day")}T${g("hour")}:${g("minute")}:${g("second")}`;
}
export function kgDeadlineStamp(monday) {
  return `${shiftDateKey(monday, -KG_PLAN_RULES.deadlineDaysBeforeMonday)}T${KG_PLAN_RULES.deadlineTime}:00`;
}
function deadlineText(monday) {
  return `กำหนดส่ง ${thaiDate(shiftDateKey(monday, -KG_PLAN_RULES.deadlineDaysBeforeMonday), { weekday: "short", day: "numeric", month: "short", year: "2-digit" })} เวลา ${KG_PLAN_RULES.deadlineTime} น.`;
}

// ── สิทธิ์ ─────────────────────────────────────────────────────────
const normName = n => String(n || "").normalize("NFC").trim().replace(/^(นางสาว|นาง|นาย|น\.ส\.|ครู|ดร\.)\s*/, "").replace(/\s+/g, "");
export function kgTeacherInfo(user) {
  if (!user) return null;
  const n = normName(user.name);
  return KG_TEACHERS.find(t => normName(t.name) === n) || null;
}
export function isKgTeacher(user) {
  return !!kgTeacherInfo(user);
}

// ── ข้อมูล ─────────────────────────────────────────────────────────
const str = (v, max = 4000) => String(v ?? "").slice(0, max);
export function emptyKgMain() {
  const analysis = {};
  ANALYSIS_ROWS.forEach(r => { analysis[r.key] = ""; });
  const mindmap = {};
  const week = [0, 1, 2, 3, 4].map(() => ({}));
  KG_ACTIVITIES.forEach(a => { mindmap[a.key] = ""; week.forEach(d => { d[a.key] = ""; }); });
  const indicators = {};
  DOMAINS.forEach(d => { indicators[d.key] = ""; });
  return {
    version: 1, unit_no: "", unit_name: "", class_level: "", semester: "2", year: "",
    analysis, mindmap, week,
    assessment: { indicators, scores: {}, note: "" },
    after: { date: "", result: "", problems: "", suggestions: "", position: "ครู" },
    exec: null, status: "", submitted_at: null, late: false,
  };
}
export function emptyKgDay() {
  const activities = {};
  KG_ACTIVITIES.forEach(a => { activities[a.key] = {}; DAILY_FIELDS.forEach(f => { activities[a.key][f.key] = ""; }); });
  return { activities };
}
export function parseKgMain(subject) {
  const base = emptyKgMain();
  try {
    const p = JSON.parse(subject || "{}");
    if (!p || typeof p !== "object") return base;
    const out = { ...base, ...p };
    out.analysis = { ...base.analysis, ...(p.analysis || {}) };
    out.mindmap = { ...base.mindmap, ...(p.mindmap || {}) };
    out.week = base.week.map((d, i) => ({ ...d, ...((p.week || [])[i] || {}) }));
    out.assessment = { ...base.assessment, ...(p.assessment || {}), indicators: { ...base.assessment.indicators, ...(p.assessment?.indicators || {}) }, scores: p.assessment?.scores || {} };
    out.after = { ...base.after, ...(p.after || {}) };
    return out;
  } catch { return base; }
}
export function parseKgDay(subject) {
  const base = emptyKgDay();
  try {
    const p = JSON.parse(subject || "{}");
    KG_ACTIVITIES.forEach(a => { base.activities[a.key] = { ...base.activities[a.key], ...(p?.activities?.[a.key] || {}) }; });
  } catch { /* ใช้ค่าว่าง */ }
  return base;
}
// คืนรายการช่องที่ยังขาด (ส่วนที่ 1–4 ต้องครบจึงส่งได้)
export function kgMissing(main, days) {
  const miss = [];
  if (!String(main.unit_name).trim()) miss.push("ชื่อหน่วย");
  if (!String(main.class_level).trim()) miss.push("ชั้น");
  ANALYSIS_ROWS.filter(r => r.required && !String(main.analysis[r.key] || "").trim()).forEach(r => miss.push(`ส่วนที่ 1: ${r.label}`));
  KG_ACTIVITIES.filter(a => !String(main.mindmap[a.key] || "").trim()).forEach(a => miss.push(`ส่วนที่ 2: ${a.short}`));
  main.week.forEach((d, i) => KG_ACTIVITIES.forEach(a => { if (!String(d[a.key] || "").trim()) miss.push(`ส่วนที่ 3: วันที่ ${i + 1} ${a.short}`); }));
  days.forEach((d, i) => KG_ACTIVITIES.forEach(a => DAILY_FIELDS.filter(f => f.required).forEach(f => {
    if (!String(d.activities[a.key][f.key] || "").trim()) miss.push(`ส่วนที่ 4: วันที่ ${i + 1} ${a.short} – ${f.label}`);
  })));
  return miss;
}
export function kgStartTime(main) {
  if (main.status === "submitted") return main.late ? "00:03:00" : "00:02:00";
  return "00:01:00";
}
export function kgStatusLabel(main) {
  if (!main || !main.status) return { text: "ยังไม่ส่ง", color: "#dc2626", bg: "#fee2e2" };
  if (main.status === "draft") return { text: "ร่าง", color: "#b45309", bg: "#fef3c7" };
  return main.late ? { text: "ส่งช้า", color: "#c2410c", bg: "#ffedd5" } : { text: "ส่งแล้ว", color: "#047857", bg: "#d1fae5" };
}

async function fetchPlanRows(employeeId, monday) {
  let q = supabase.from("teaching_schedule").select("id, employee_id, day_of_week, subject, start_time, created_at")
    .eq("class_room", KG_SHORT_PLAN_ROOM).eq("period", periodKey(monday)).order("created_at", { ascending: false });
  if (employeeId) q = q.eq("employee_id", employeeId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data || [];
}
function pickRows(rows, employeeId) {
  const mine = rows.filter(r => String(r.employee_id) === String(employeeId));
  const byDay = {};
  mine.forEach(r => { if (!byDay[r.day_of_week]) byDay[r.day_of_week] = r; }); // ใหม่สุดก่อน
  return byDay;
}
async function upsertRow(employeeId, monday, dayOfWeek, subject, startTime, existingId) {
  if (subject.length > JSON_LIMIT) throw new Error("ข้อมูลยาวเกินที่ระบบเก็บได้");
  const payload = { employee_id: employeeId, day_of_week: dayOfWeek, period: periodKey(monday), class_room: KG_SHORT_PLAN_ROOM, start_time: startTime, end_time: null, subject };
  const res = existingId
    ? await supabase.from("teaching_schedule").update(payload).eq("id", existingId).select("id").single()
    : await supabase.from("teaching_schedule").insert(payload).select("id").single();
  if (res.error) throw new Error(res.error.message);
  return res.data.id;
}

// ── พิมพ์ (A4 แนวนอน ตามลำดับแบบฟอร์ม Word) ───────────────────────
const esc = v => String(v ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const br = v => esc(v).replace(/\n/g, "<br>");
export function kgPrintHtml({ main, days, teacherName, students, monday }) {
  const unit = `หน่วยที่ ${thaiNum(main.unit_no || "…")} ${esc(main.unit_name)}`;
  const cls = `ชั้น${esc(main.class_level)}`;
  const term = `ภาคเรียนที่ ${thaiNum(main.semester || "…")}${main.year ? ` ปีการศึกษา ${thaiNum(main.year)}` : ""}`;
  const css = `@page{size:A4 landscape;margin:12mm}body{font-family:'TH Sarabun New','Sarabun','Leelawadee UI',sans-serif;font-size:15px;color:#000}
  h2{text-align:center;font-size:19px;margin:0 0 4px}h3{text-align:center;font-size:17px;margin:0 0 8px;font-weight:600}
  table{width:100%;border-collapse:collapse;margin-bottom:6px}th,td{border:1px solid #000;padding:4px 6px;vertical-align:top;text-align:left}
  th{background:#eee;text-align:center}.pb{page-break-before:always}.c{text-align:center}
  .mm{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px}.mm div{border:1px solid #000;padding:6px;min-height:110px}.mm .center{display:flex;align-items:center;justify-content:center;font-weight:700;text-align:center;border:2px solid #000;border-radius:50%}
  .sign{margin-top:18px;margin-left:55%;text-align:center;line-height:2}.dots{border-bottom:1px dotted #000;min-height:22px}`;
  const s1 = `<h2>การวิเคราะห์โครงสร้างหน่วยการจัดประสบการณ์ตามหลักสูตรการศึกษาปฐมวัย พุทธศักราช ๒๕๖๐</h2><h3>${unit} ${cls} ${term}</h3>
  <table><tr><th style="width:24%">รายการ</th><th>${cls}</th></tr>${ANALYSIS_ROWS.map(r => `<tr><td><b>${esc(r.label)}</b></td><td>${br(main.analysis[r.key])}</td></tr>`).join("")}</table>`;
  const cells = KG_ACTIVITIES.map((a, i) => `<div><b>${thaiNum(i + 1)}. ${esc(a.label)}</b><br>${br(main.mindmap[a.key])}</div>`);
  const s2 = `<div class="pb"></div><h2>ผังความคิดแผนการจัดประสบการณ์หน่วย${esc(main.unit_name)} ${cls}</h2>
  <div class="mm">${cells[0]}${cells[1]}${cells[2]}<div class="center">หน่วย<br>${esc(main.unit_name)}<br>${cls}</div>${cells[3]}${cells[4]}<div></div>${cells[5]}<div></div></div>`;
  const s3 = `<div class="pb"></div><h2>การวางแผนกิจกรรมรายหน่วยการจัดประสบการณ์ ${cls} หน่วย${esc(main.unit_name)}</h2>
  <p class="c">สอนระหว่างวันที่ ${thaiDate(monday, { day: "numeric", month: "long", year: "numeric" })} – ${thaiDate(shiftDateKey(monday, 4), { day: "numeric", month: "long", year: "numeric" })}</p>
  <table><tr><th rowspan="2" style="width:6%">วันที่</th><th colspan="6">กิจกรรม</th></tr><tr>${KG_ACTIVITIES.map(a => `<th>${esc(a.short)}</th>`).join("")}</tr>
  ${main.week.map((d, i) => `<tr><td class="c">${thaiNum(i + 1)}</td>${KG_ACTIVITIES.map(a => `<td>${br(d[a.key])}</td>`).join("")}</tr>`).join("")}</table>`;
  const s4 = days.map((d, i) => `<div class="pb"></div><h2>แผนการจัดประสบการณ์รายวัน วันที่ ${thaiNum(i + 1)} ${unit} ${cls}</h2>
  <p class="c">วัน${DAY_LABELS[i]}ที่ ${thaiDate(shiftDateKey(monday, i), { day: "numeric", month: "long", year: "numeric" })}</p>
  <table><tr><th rowspan="2" style="width:11%">กิจกรรม</th><th rowspan="2" style="width:14%">จุดประสงค์การเรียนรู้</th><th colspan="2">สาระการเรียนรู้</th><th rowspan="2">กิจกรรมการเรียนรู้</th><th rowspan="2" style="width:11%">สื่อ</th><th rowspan="2" style="width:12%">การประเมินพัฒนาการ</th></tr>
  <tr><th style="width:13%">ประสบการณ์สำคัญ</th><th style="width:12%">สาระที่ควรเรียนรู้</th></tr>
  ${KG_ACTIVITIES.map(a => { const x = d.activities[a.key]; return `<tr><td><b>${esc(a.label)}</b></td><td>${br(x.objective)}</td><td>${br(x.experience)}</td><td>${br(x.content)}</td><td>${br(x.steps)}</td><td>${br(x.media)}</td><td>${br(x.assess)}</td></tr>`; }).join("")}</table>`).join("");
  const ind = DOMAINS.map(dm => ({ ...dm, items: String(main.assessment.indicators[dm.key] || "").split("\n").map(s => s.trim()).filter(Boolean) }));
  const cols = ind.flatMap(dm => dm.items.map((t, j) => ({ dm, t, k: `${dm.key}_${j}` })));
  const s5 = `<div class="pb"></div><h2>แบบประเมินพัฒนาการ ${unit} ${cls}</h2>
  <table><tr><th rowspan="2" style="width:4%">เลขที่</th><th rowspan="2" style="width:18%">ชื่อ-สกุล</th>${ind.filter(d => d.items.length).map(d => `<th colspan="${d.items.length}">${esc(d.label)}</th>`).join("")}<th rowspan="2">หมายเหตุ</th></tr>
  <tr>${cols.map((c, j) => `<th style="font-weight:400;font-size:13px">${thaiNum(j + 1)}. ${esc(c.t)}</th>`).join("")}</tr>
  ${(students.length ? students : Array.from({ length: 10 }, () => ({ id: "", name: "" }))).map((s, i) => `<tr><td class="c">${thaiNum(i + 1)}</td><td>${esc(s.name)}</td>${cols.map(c => `<td class="c">${s.id && main.assessment.scores?.[s.id]?.[c.k] ? thaiNum(main.assessment.scores[s.id][c.k]) : ""}</td>`).join("")}<td></td></tr>`).join("")}</table>
  <p><b>คำอธิบาย</b> ครูสังเกตพฤติกรรมเด็กรายบุคคล จดบันทึกสรุปเป็นรายสัปดาห์ &nbsp; ระดับ ๓ ดี &nbsp; ระดับ ๒ ปานกลาง &nbsp; ระดับ ๑ ต้องส่งเสริม</p>${main.assessment.note ? `<p>${br(main.assessment.note)}</p>` : ""}`;
  const af = main.after;
  const s6 = `<div class="pb"></div><h2>บันทึกหลังการสอน</h2><h3>หน่วย ${esc(main.unit_name)}</h3><p class="c">วันที่ ${af.date ? thaiDate(af.date, { day: "numeric", month: "long", year: "numeric" }) : "……………เดือน……………………พ.ศ.………"}</p>
  <p><b>๑. ผลการสอน</b></p><div class="dots">${br(af.result)}</div><p><b>๒. ปัญหา/อุปสรรค</b></p><div class="dots">${br(af.problems)}</div><p><b>๓. ข้อเสนอแนะและแนวทางแก้ไข</b></p><div class="dots">${br(af.suggestions)}</div>
  <div class="sign">ลงชื่อ.............................................ผู้สอน<br>( ${esc(teacherName)} )<br>ตำแหน่ง ${esc(af.position || "ครู")}</div>`;
  const ex = main.exec || {};
  const s7 = `<p style="margin-top:22px"><b>ความเห็นและข้อเสนอแนะของผู้บริหาร</b></p><div class="dots" style="min-height:90px">${br(ex.comment)}</div>
  <div class="sign">(ลงชื่อ)..........................................ผู้บริหาร<br>( ${esc(ex.by_name || "………………………………")} )<br>ตำแหน่ง ${esc(ex.position || "ผู้อำนวยการโรงเรียน………………")}<br>วันที่ ${ex.at ? thaiDate(bangkokStamp(ex.at).slice(0, 10), { day: "numeric", month: "long", year: "numeric" }) : "…….. เดือน ……………… พ.ศ. ………"}</div>`;
  return `<!doctype html><html lang="th"><head><meta charset="utf-8"><title>แผนระยะสั้น ${esc(main.unit_name)} ${esc(teacherName)}</title><style>${css}</style></head><body>${s1}${s2}${s3}${s4}${s5}${s6}${s7}</body></html>`;
}

// ── UI ───────────────────────────────────────────────────────────
const box = { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, padding: "1rem", marginBottom: "1rem" };
const inp = { width: "100%", boxSizing: "border-box", border: "1px solid #cbd5e1", borderRadius: 8, padding: "0.45rem 0.6rem", fontFamily: "inherit", fontSize: "0.9rem" };
const btn = (bg, color = "#fff") => ({ background: bg, color, border: "none", borderRadius: 10, padding: "0.55rem 1rem", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" });
const TABS = [
  { key: 1, label: "1. วิเคราะห์หน่วย" }, { key: 2, label: "2. ผังความคิด" }, { key: 3, label: "3. แผนรายสัปดาห์" },
  { key: 4, label: "4. แผนรายวัน" }, { key: 5, label: "5. ประเมินพัฒนาการ" }, { key: 6, label: "6. บันทึกหลังสอน" }, { key: 7, label: "7. ความเห็นผู้บริหาร" },
];
function TA({ value, onChange, rows = 3, disabled, placeholder }) {
  return <textarea value={value || ""} onChange={e => onChange(e.target.value)} rows={rows} disabled={disabled} placeholder={placeholder} style={{ ...inp, resize: "vertical", background: disabled ? "#f8fafc" : "#fff" }} />;
}

// props: currentUser, employees, canReview (ผู้บริหาร/แอดมิน), fetchStudents(employeeId) => [{id,name}]
export function KgShortPlanPage({ currentUser, employees = [], canReview = false, fetchStudents, initialMonday }) {
  const myInfo = kgTeacherInfo(currentUser);
  const kgEmployees = employees.filter(e => isKgTeacher(e));
  const [monday, setMonday] = useState(initialMonday || kgMondayOf(shiftDateKey(todayKey(), 3)));
  const [teacherId, setTeacherId] = useState(myInfo ? String(currentUser.id) : String(kgEmployees[0]?.id || ""));
  const [main, setMain] = useState(emptyKgMain());
  const [days, setDays] = useState([0, 1, 2, 3, 4].map(() => emptyKgDay()));
  const [rowIds, setRowIds] = useState({});
  const [students, setStudents] = useState([]);
  const [tab, setTab] = useState(canReview && !myInfo ? 0 : 1);
  const [dayIdx, setDayIdx] = useState(0);
  const [overview, setOverview] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [comment, setComment] = useState("");
  const [position, setPosition] = useState("");

  const teacher = employees.find(e => String(e.id) === String(teacherId)) || (myInfo ? currentUser : null);
  const isOwner = !!myInfo && String(teacherId) === String(currentUser?.id);
  const editable = isOwner;
  const lockedCore = isOwner && main.status === "submitted"; // ส่งแล้ว แก้ส่วน 1–4 ไม่ได้ (5–6 ยังกรอกได้)

  const load = useCallback(async () => {
    if (!teacherId) return;
    setLoading(true); setErr(""); setMsg("");
    try {
      const rows = await fetchPlanRows(teacherId, monday);
      const byDay = pickRows(rows, teacherId);
      const m = byDay[0] ? parseKgMain(byDay[0].subject) : emptyKgMain();
      const info = kgTeacherInfo(employees.find(e => String(e.id) === String(teacherId)) || currentUser);
      if (!m.class_level && info) m.class_level = info.level;
      setMain(m);
      setDays([1, 2, 3, 4, 5].map(d => byDay[d] ? parseKgDay(byDay[d].subject) : emptyKgDay()));
      const ids = {}; [0, 1, 2, 3, 4, 5].forEach(d => { if (byDay[d]) ids[d] = byDay[d].id; });
      setRowIds(ids);
      setComment(m.exec?.comment || ""); setPosition(m.exec?.position || "");
      try { setStudents(fetchStudents ? (await fetchStudents(teacherId)) || [] : []); } catch { setStudents([]); }
    } catch (e) { setErr(e.message); } finally { setLoading(false); }
  }, [teacherId, monday, employees, currentUser, fetchStudents]);
  useEffect(() => { load(); }, [load]);

  const loadOverview = useCallback(async () => {
    if (!canReview) return;
    try {
      const rows = await fetchPlanRows(null, monday);
      setOverview(kgEmployees.map(e => { const r = pickRows(rows, e.id)[0]; return { emp: e, main: r ? parseKgMain(r.subject) : null }; }));
    } catch (e) { setErr(e.message); }
  }, [canReview, monday, employees]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { loadOverview(); }, [loadOverview]);

  const setA = (k, v) => setMain(m => ({ ...m, analysis: { ...m.analysis, [k]: v } }));
  const setMM = (k, v) => setMain(m => ({ ...m, mindmap: { ...m.mindmap, [k]: v } }));
  const setWeek = (i, k, v) => setMain(m => ({ ...m, week: m.week.map((d, j) => j === i ? { ...d, [k]: v } : d) }));
  const setDay = (i, a, f, v) => setDays(ds => ds.map((d, j) => j === i ? { activities: { ...d.activities, [a]: { ...d.activities[a], [f]: v } } } : d));
  const setAfter = (k, v) => setMain(m => ({ ...m, after: { ...m.after, [k]: v } }));
  const setInd = (k, v) => setMain(m => ({ ...m, assessment: { ...m.assessment, indicators: { ...m.assessment.indicators, [k]: v } } }));
  const setScore = (sid, k, v) => setMain(m => ({ ...m, assessment: { ...m.assessment, scores: { ...m.assessment.scores, [sid]: { ...(m.assessment.scores[sid] || {}), [k]: v } } } }));

  async function save(mode) {
    setErr(""); setMsg("");
    let next = { ...main };
    if (mode === "submit") {
      const miss = kgMissing(main, days);
      if (miss.length) { setErr(`ยังส่งไม่ได้ ขาด ${miss.length} ช่อง เช่น: ${miss.slice(0, 5).join(" · ")}`); return; }
      const at = new Date().toISOString();
      next = { ...next, status: "submitted", submitted_at: at, late: bangkokStamp(at) > kgDeadlineStamp(monday) };
    } else if (main.status !== "submitted") next = { ...next, status: "draft" };
    setSaving(true);
    try {
      const ids = { ...rowIds };
      if (!lockedCore || mode === "submit") {
        for (let i = 0; i < 5; i += 1) ids[i + 1] = await upsertRow(teacherId, monday, i + 1, JSON.stringify({ version: 1, ...days[i] }), "00:00:00", ids[i + 1]);
      }
      ids[0] = await upsertRow(teacherId, monday, 0, JSON.stringify({ ...next, updated_at: new Date().toISOString() }), kgStartTime(next), ids[0]);
      setRowIds(ids); setMain(next);
      setMsg(mode === "submit" ? (next.late ? "ส่งแผนแล้ว (ส่งช้ากว่ากำหนด)" : "ส่งแผนเรียบร้อย") : "บันทึกแล้ว");
      loadOverview();
    } catch (e) { setErr(e.message); } finally { setSaving(false); }
  }

  async function saveExec() {
    setErr(""); setMsg(""); setSaving(true);
    try {
      const rows = await fetchPlanRows(teacherId, monday);
      const r = pickRows(rows, teacherId)[0];
      if (!r) throw new Error("ครูยังไม่ได้สร้างแผนสัปดาห์นี้");
      const fresh = parseKgMain(r.subject); // อ่านใหม่ก่อน เพื่อไม่ทับข้อมูลที่ครูเพิ่งแก้
      const exec = { comment, position, by: currentUser.id, by_name: currentUser.name, at: new Date().toISOString() };
      const next = { ...fresh, exec };
      await upsertRow(teacherId, monday, 0, JSON.stringify({ ...next, updated_at: new Date().toISOString() }), kgStartTime(next), r.id);
      setMain(next); setMsg("บันทึกความเห็นผู้บริหารแล้ว"); loadOverview();
    } catch (e) { setErr(e.message); } finally { setSaving(false); }
  }

  function printPlan() {
    const html = kgPrintHtml({ main, days, teacherName: teacher?.name || "", students, monday });
    const w = window.open("", "_blank");
    if (!w) { setErr("เบราว์เซอร์บล็อกหน้าต่างพิมพ์"); return; }
    w.document.write(html); w.document.close(); w.focus(); setTimeout(() => w.print(), 400);
  }

  if (!myInfo && !canReview) return <div style={box}>เมนูนี้สำหรับครูอนุบาลและผู้บริหารเท่านั้น</div>;
  const st = kgStatusLabel(main.status ? main : null);
  const dis = !editable || lockedCore;
  const indCols = DOMAINS.flatMap(dm => String(main.assessment.indicators[dm.key] || "").split("\n").map(s => s.trim()).filter(Boolean).map((t, j) => ({ dm, t, k: `${dm.key}_${j}` })));

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto" }} data-testid="kg-plan">
      <div style={{ ...box, display: "flex", flexWrap: "wrap", gap: "0.75rem", alignItems: "center" }}>
        <div style={{ fontWeight: 800, fontSize: "1.15rem", color: "#233862", flex: "1 1 260px" }}>แผนการจัดประสบการณ์ระยะสั้น (อนุบาล)</div>
        <label style={{ fontSize: "0.85rem" }}>สัปดาห์ (วันจันทร์)
          <input type="date" value={monday} onChange={e => e.target.value && setMonday(kgMondayOf(e.target.value))} style={{ ...inp, width: "auto", marginLeft: 6 }} />
        </label>
        {canReview && (
          <select value={teacherId} onChange={e => setTeacherId(e.target.value)} style={{ ...inp, width: "auto" }}>
            {kgEmployees.map(e => <option key={e.id} value={String(e.id)}>{kgTeacherInfo(e)?.level} · {e.name}</option>)}
            {myInfo && !kgEmployees.some(e => String(e.id) === String(currentUser.id)) && <option value={String(currentUser.id)}>{currentUser.name}</option>}
          </select>
        )}
        <span style={{ background: st.bg, color: st.color, borderRadius: 999, padding: "0.25rem 0.75rem", fontWeight: 700, fontSize: "0.85rem" }}>{st.text}</span>
      </div>
      <div style={{ color: "#64748b", fontSize: "0.82rem", margin: "-0.5rem 0 0.75rem 0.25rem" }}>
        {thaiDate(monday)} – {thaiDate(shiftDateKey(monday, 4))} · {deadlineText(monday)} · ส่วนที่ 1–4 ต้องครบจึงกดส่งได้ ส่วนที่ 5–6 กรอกเพิ่มหลังส่งได้
      </div>

      {canReview && (
        <div style={box}>
          <div style={{ fontWeight: 800, color: "#233862", marginBottom: 8 }}>สถานะส่งแผนสัปดาห์นี้</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 8 }}>
            {overview.map(o => { const s = kgStatusLabel(o.main && o.main.status ? o.main : null); return (
              <button key={o.emp.id} onClick={() => { setTeacherId(String(o.emp.id)); setTab(1); }} style={{ textAlign: "left", border: String(o.emp.id) === String(teacherId) ? "2px solid #2563eb" : "1px solid #e2e8f0", borderRadius: 10, padding: "0.6rem", background: "#fff", cursor: "pointer", fontFamily: "inherit" }}>
                <div style={{ fontWeight: 700 }}>{kgTeacherInfo(o.emp)?.level} · {o.emp.name}</div>
                <div style={{ fontSize: "0.8rem", color: "#64748b" }}>{o.main?.unit_name ? `หน่วย ${o.main.unit_name}` : "—"}</div>
                <span style={{ background: s.bg, color: s.color, borderRadius: 999, padding: "0.1rem 0.6rem", fontSize: "0.78rem", fontWeight: 700 }}>{s.text}</span>
                {o.main?.exec?.at && <span style={{ marginLeft: 6, fontSize: "0.78rem", color: "#2563eb" }}>✓ ผู้บริหารให้ความเห็นแล้ว</span>}
              </button>); })}
            {overview.length === 0 && <div style={{ color: "#94a3b8" }}>ไม่พบรายชื่อครูอนุบาล</div>}
          </div>
        </div>
      )}

      {loading ? <div style={box}>กำลังโหลด...</div> : teacherId && (
        <>
          <div style={{ ...box, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 8 }}>
            <label>หน่วยที่<input value={main.unit_no} disabled={dis} onChange={e => setMain(m => ({ ...m, unit_no: e.target.value }))} style={inp} /></label>
            <label>ชื่อหน่วย *<input value={main.unit_name} disabled={dis} onChange={e => setMain(m => ({ ...m, unit_name: e.target.value }))} style={inp} placeholder="เช่น ลอยกระทง" /></label>
            <label>ชั้น *<input value={main.class_level} disabled={dis} onChange={e => setMain(m => ({ ...m, class_level: e.target.value }))} style={inp} placeholder="อ.1" /></label>
            <label>ภาคเรียนที่<input value={main.semester} disabled={dis} onChange={e => setMain(m => ({ ...m, semester: e.target.value }))} style={inp} /></label>
            <label>ปีการศึกษา<input value={main.year} disabled={dis} onChange={e => setMain(m => ({ ...m, year: e.target.value }))} style={inp} placeholder="2569" /></label>
            <div style={{ alignSelf: "end", fontSize: "0.85rem", color: "#475569" }}>ผู้สอน: <b>{teacher?.name || "-"}</b></div>
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: "0.75rem" }}>
            {TABS.map(t => <button key={t.key} onClick={() => setTab(t.key)} style={{ ...btn(tab === t.key ? "#2563eb" : "#e2e8f0", tab === t.key ? "#fff" : "#1e293b"), padding: "0.45rem 0.8rem", fontSize: "0.85rem" }}>{t.label}</button>)}
          </div>

          {tab === 1 && (
            <div style={box}>
              <div style={{ fontWeight: 800, marginBottom: 8 }}>ส่วนที่ 1 การวิเคราะห์โครงสร้างหน่วยการจัดประสบการณ์ตามหลักสูตรการศึกษาปฐมวัย พ.ศ. 2560</div>
              {ANALYSIS_ROWS.map(r => (
                <div key={r.key} style={{ display: "grid", gridTemplateColumns: "minmax(140px,240px) 1fr", gap: 8, marginBottom: 8 }}>
                  <div style={{ fontWeight: 600, fontSize: "0.9rem", paddingTop: 6 }}>{r.label}{r.required && " *"}</div>
                  <TA value={main.analysis[r.key]} disabled={dis} onChange={v => setA(r.key, v)} rows={3} />
                </div>
              ))}
            </div>
          )}
          {tab === 2 && (
            <div style={box}>
              <div style={{ fontWeight: 800, marginBottom: 8 }}>ส่วนที่ 2 ผังความคิดแผนการจัดประสบการณ์ (พิมพ์บรรทัดละ 1 ข้อ)</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: 10 }}>
                {KG_ACTIVITIES.map((a, i) => <label key={a.key} style={{ fontWeight: 600, fontSize: "0.9rem" }}>{i + 1}. {a.label} *<TA value={main.mindmap[a.key]} disabled={dis} onChange={v => setMM(a.key, v)} rows={5} placeholder={"1. ...\n2. ..."} /></label>)}
              </div>
            </div>
          )}
          {tab === 3 && (
            <div style={{ ...box, overflowX: "auto" }}>
              <div style={{ fontWeight: 800, marginBottom: 8 }}>ส่วนที่ 3 การวางแผนกิจกรรมรายหน่วย (จันทร์–ศุกร์ × 6 กิจกรรม)</div>
              <table style={{ borderCollapse: "collapse", minWidth: 900, width: "100%" }}>
                <thead><tr><th style={{ border: "1px solid #cbd5e1", padding: 6, background: "#f1f5f9" }}>วันที่</th>{KG_ACTIVITIES.map(a => <th key={a.key} style={{ border: "1px solid #cbd5e1", padding: 6, background: "#f1f5f9", fontSize: "0.85rem" }}>{a.short}</th>)}</tr></thead>
                <tbody>{main.week.map((d, i) => (
                  <tr key={i}><td style={{ border: "1px solid #cbd5e1", padding: 6, textAlign: "center", whiteSpace: "nowrap" }}><b>{i + 1}</b><div style={{ fontSize: "0.75rem", color: "#64748b" }}>{DAY_LABELS[i]}<br />{thaiDate(shiftDateKey(monday, i), { day: "numeric", month: "short" })}</div></td>
                    {KG_ACTIVITIES.map(a => <td key={a.key} style={{ border: "1px solid #cbd5e1", padding: 4 }}><TA value={d[a.key]} disabled={dis} onChange={v => setWeek(i, a.key, v)} rows={4} /></td>)}</tr>
                ))}</tbody>
              </table>
            </div>
          )}
          {tab === 4 && (
            <div style={box}>
              <div style={{ fontWeight: 800, marginBottom: 8 }}>ส่วนที่ 4 แผนการจัดประสบการณ์รายวัน</div>
              <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
                {DAY_LABELS.map((l, i) => <button key={i} onClick={() => setDayIdx(i)} style={{ ...btn(dayIdx === i ? "#0f766e" : "#e2e8f0", dayIdx === i ? "#fff" : "#1e293b"), padding: "0.35rem 0.8rem" }}>วันที่ {i + 1} · {l}</button>)}
              </div>
              {KG_ACTIVITIES.map(a => (
                <div key={a.key} style={{ border: "1px solid #e2e8f0", borderRadius: 10, padding: 10, marginBottom: 10 }}>
                  <div style={{ fontWeight: 700, color: "#0f766e", marginBottom: 6 }}>{a.label}{main.week[dayIdx]?.[a.key] ? <span style={{ color: "#64748b", fontWeight: 400 }}> — {main.week[dayIdx][a.key].split("\n")[0]}</span> : null}</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(250px,1fr))", gap: 8 }}>
                    {DAILY_FIELDS.map(f => <label key={f.key} style={{ fontSize: "0.85rem", fontWeight: 600 }}>{f.label}{f.required && " *"}<TA value={days[dayIdx].activities[a.key][f.key]} disabled={dis} onChange={v => setDay(dayIdx, a.key, f.key, v)} rows={f.key === "steps" ? 5 : 3} /></label>)}
                  </div>
                </div>
              ))}
            </div>
          )}
          {tab === 5 && (
            <div style={{ ...box, overflowX: "auto" }}>
              <div style={{ fontWeight: 800, marginBottom: 8 }}>ส่วนที่ 5 แบบประเมินพัฒนาการ (กรอกหลังส่งแผนได้)</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 8, marginBottom: 10 }}>
                {DOMAINS.map(d => <label key={d.key} style={{ fontSize: "0.85rem", fontWeight: 600 }}>ตัวชี้วัด{d.label} (บรรทัดละ 1 ข้อ)<TA value={main.assessment.indicators[d.key]} disabled={!editable} onChange={v => setInd(d.key, v)} rows={3} /></label>)}
              </div>
              {students.length === 0 ? <div style={{ color: "#94a3b8" }}>ยังไม่มีรายชื่อนักเรียน (ดึงจากรายชื่อเช็คชื่อของครูประจำชั้น)</div> : indCols.length === 0 ? <div style={{ color: "#94a3b8" }}>ใส่ตัวชี้วัดก่อน แล้วตารางคะแนนจะขึ้น</div> : (
                <table style={{ borderCollapse: "collapse", fontSize: "0.82rem" }}>
                  <thead><tr><th style={{ border: "1px solid #cbd5e1", padding: 4 }}>เลขที่</th><th style={{ border: "1px solid #cbd5e1", padding: 4 }}>ชื่อ-สกุล</th>{indCols.map((c, j) => <th key={c.k} title={c.t} style={{ border: "1px solid #cbd5e1", padding: 4, maxWidth: 110, fontWeight: 500 }}>{j + 1}. {c.t}</th>)}</tr></thead>
                  <tbody>{students.map((s, i) => <tr key={s.id}><td style={{ border: "1px solid #cbd5e1", padding: 4, textAlign: "center" }}>{i + 1}</td><td style={{ border: "1px solid #cbd5e1", padding: 4, whiteSpace: "nowrap" }}>{s.name}</td>
                    {indCols.map(c => <td key={c.k} style={{ border: "1px solid #cbd5e1", padding: 2 }}><select disabled={!editable} value={main.assessment.scores?.[s.id]?.[c.k] || ""} onChange={e => setScore(s.id, c.k, Number(e.target.value) || "")} style={{ fontFamily: "inherit" }}><option value="">-</option>{LEVELS.map(l => <option key={l.v} value={l.v}>{l.t}</option>)}</select></td>)}</tr>)}</tbody>
                </table>
              )}
              <label style={{ display: "block", marginTop: 8, fontSize: "0.85rem", fontWeight: 600 }}>หมายเหตุ<TA value={main.assessment.note} disabled={!editable} onChange={v => setMain(m => ({ ...m, assessment: { ...m.assessment, note: v } }))} rows={2} /></label>
            </div>
          )}
          {tab === 6 && (
            <div style={box}>
              <div style={{ fontWeight: 800, marginBottom: 8 }}>ส่วนที่ 6 บันทึกหลังการสอน (กรอกหลังส่งแผนได้)</div>
              <label style={{ fontSize: "0.85rem" }}>วันที่บันทึก <input type="date" value={main.after.date} disabled={!editable} onChange={e => setAfter("date", e.target.value)} style={{ ...inp, width: "auto" }} /></label>
              {[["result", "1. ผลการสอน"], ["problems", "2. ปัญหา/อุปสรรค"], ["suggestions", "3. ข้อเสนอแนะและแนวทางแก้ไข"]].map(([k, l]) => <label key={k} style={{ display: "block", marginTop: 8, fontWeight: 600, fontSize: "0.9rem" }}>{l}<TA value={main.after[k]} disabled={!editable} onChange={v => setAfter(k, v)} rows={3} /></label>)}
              <label style={{ display: "block", marginTop: 8, fontSize: "0.85rem" }}>ตำแหน่งผู้สอน<input value={main.after.position} disabled={!editable} onChange={e => setAfter("position", e.target.value)} style={inp} /></label>
            </div>
          )}
          {tab === 7 && (
            <div style={box}>
              <div style={{ fontWeight: 800, marginBottom: 8 }}>ส่วนที่ 7 ความเห็นและข้อเสนอแนะของผู้บริหาร</div>
              {canReview ? (
                <>
                  <TA value={comment} onChange={setComment} rows={5} />
                  <label style={{ display: "block", marginTop: 8, fontSize: "0.85rem" }}>ตำแหน่ง<input value={position} onChange={e => setPosition(e.target.value)} style={inp} placeholder="ผู้อำนวยการโรงเรียนนิมิตศึกษา" /></label>
                  <button disabled={saving || !rowIds[0]} onClick={saveExec} style={{ ...btn("#7c3aed"), marginTop: 10, opacity: saving || !rowIds[0] ? 0.5 : 1 }}>ลงชื่อ / บันทึกความเห็น</button>
                  {!rowIds[0] && <span style={{ marginLeft: 8, color: "#94a3b8", fontSize: "0.85rem" }}>ครูยังไม่ได้สร้างแผนสัปดาห์นี้</span>}
                </>
              ) : <div style={{ whiteSpace: "pre-wrap", color: main.exec?.comment ? "#1e293b" : "#94a3b8" }}>{main.exec?.comment || "ยังไม่มีความเห็นจากผู้บริหาร"}</div>}
              {main.exec?.at && <div style={{ marginTop: 8, fontSize: "0.82rem", color: "#64748b" }}>ลงชื่อ: {main.exec.by_name} · {main.exec.position} · {thaiDate(bangkokStamp(main.exec.at).slice(0, 10))}</div>}
            </div>
          )}

          {err && <div style={{ ...box, background: "#fef2f2", color: "#b91c1c", borderColor: "#fecaca" }} data-testid="kg-err">{err}</div>}
          {msg && <div style={{ ...box, background: "#ecfdf5", color: "#047857", borderColor: "#a7f3d0" }} data-testid="kg-msg">{msg}</div>}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: "2rem" }}>
            {editable && <button disabled={saving} onClick={() => save("draft")} style={btn("#64748b")}>{main.status === "submitted" ? "บันทึก (ส่วนที่ 5–6)" : "บันทึกร่าง"}</button>}
            {editable && main.status !== "submitted" && <button disabled={saving} onClick={() => save("submit")} style={btn("#16a34a")}>ส่งแผน</button>}
            <button onClick={printPlan} style={btn("#2563eb")}>พิมพ์ / PDF (A4 แนวนอน)</button>
          </div>
        </>
      )}
    </div>
  );
}
