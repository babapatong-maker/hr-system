import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Save, RefreshCw } from "lucide-react";
import { supabase } from "./supabase.js";

// งานวิชาการของโรงเรียนเอกชน เก็บในแถว teaching_schedule ห้องพิเศษ
// ไม่รวมระบบของโรงเรียนรัฐ เช่น DMC อาหารกลางวันฟรีทุกคน และนมชั้นมัธยมของโรงเรียนขยายโอกาส
export const ACADEMIC_RECORD_ROOM = "__ACADEMIC_RECORD__";
const JSON_LIMIT = 3200000;
const PERIOD = { assign: 1, growth: 2, health: 3, milk: 4, lunch: 5, score: 6, indicator: 7, quality: 8, activity: 9, develop: 10 };

export const ACADEMIC_EXTRA_TABS = [
  { key: "growth", label: "น้ำหนักส่วนสูง" },
  { key: "health", label: "สุขภาพนักเรียน" },
  { key: "milk", label: "นมโรงเรียน" },
  { key: "lunch", label: "อาหารกลางวัน" },
  { key: "score", label: "ปพ.5" },
  { key: "indicator", label: "ตัวชี้วัด" },
  { key: "quality", label: "คุณลักษณะ" },
  { key: "activity", label: "กิจกรรม" },
  { key: "develop", label: "พัฒนาการ" },
];

const LEVELS = ["อนุบาล", "ประถม", "มัธยม"];
const GRADE_OPTIONS = {
  อนุบาล: ["อ.1", "อ.2", "อ.3"],
  ประถม: ["ป.1", "ป.2", "ป.3", "ป.4", "ป.5", "ป.6"],
  มัธยม: ["ม.1", "ม.2", "ม.3", "ม.4", "ม.5", "ม.6"],
};
const ALL_GRADES = LEVELS.flatMap(level => GRADE_OPTIONS[level]);
export const TEACHING_GRADE_GROUPS = LEVELS.map(level => [level, GRADE_OPTIONS[level]]);
const SUBJECT_PRESETS = ["ภาษาไทย", "คณิตศาสตร์", "วิทยาศาสตร์", "สังคมศึกษา", "ประวัติศาสตร์", "สุขศึกษา", "ศิลปะ", "การงานอาชีพ", "ภาษาอังกฤษ", "ดนตรี", "พลศึกษา", "หน้าที่พลเมือง", "จินตคณิต"];
const HEIGHT_KINDER = ["เตี้ย", "ตามเกณฑ์", "สูง"];
const WEIGHT_KINDER = ["ผอม", "ตามเกณฑ์", "ท้วม", "เริ่มอ้วน", "อ้วน"];
const HEIGHT_SCHOOL = ["เตี้ยมาก", "เตี้ย", "ส่วนสูงตามเกณฑ์", "ค่อนข้างสูง", "สูง"];
const WEIGHT_SCHOOL = ["ผอม", "ค่อนข้างผอม", "สมส่วน", "ท้วม", "เริ่มอ้วน", "อ้วน"];
const ALL_HEIGHT = new Set([...HEIGHT_KINDER, ...HEIGHT_SCHOOL]);
const ALL_WEIGHT = new Set([...WEIGHT_KINDER, ...WEIGHT_SCHOOL]);
const CHECK_RESULTS = ["ปกติ", "ต้องติดตาม"];
const SDQ_RESULTS = ["ปกติ", "กลุ่มเสี่ยง", "มีปัญหา"];
const LUNCH_REASONS = ["ผอม", "เตี้ย", "อ้วน", "จ่ายไม่ได้"];
const BOOKLET_GRADES = new Set(["ป.5", "ป.6", "ม.1", "ม.2", "ม.3", "ม.4", "ม.5", "ม.6"]);
const FLUORIDE_GRADES = new Set(["ป.1", "ป.6"]);
const ONET_GRADES = new Set(["ป.6", "ม.3", "ม.6"]);
const UPPER_GRADES = new Set(["ม.4", "ม.5", "ม.6"]);
const PASS_FAIL = ["ผ่าน", "ไม่ผ่าน"];
const QUALITY_LEVELS = ["ไม่ผ่าน", "ผ่าน", "ดี", "ดีเยี่ยม"];
const DEV_LEVELS = ["ควรเสริม", "พอใช้", "ดี"];
const TRAIT_ITEMS = [
  ["nation", "รักชาติ ศาสน์ กษัตริย์"],
  ["honest", "ซื่อสัตย์สุจริต"],
  ["discipline", "มีวินัย"],
  ["learn", "ใฝ่เรียนรู้"],
  ["enough", "อยู่อย่างพอเพียง"],
  ["work", "มุ่งมั่นในการทำงาน"],
  ["thai", "รักความเป็นไทย"],
  ["public", "มีจิตสาธารณะ"],
];
const SKILL_ITEMS = [
  ["talk", "สื่อสาร"],
  ["think", "คิด"],
  ["solve", "แก้ปัญหา"],
  ["life", "ทักษะชีวิต"],
  ["tech", "ใช้เทคโนโลยี"],
];
const VALUE_ITEMS = [
  ["v1", "รักชาติ ศาสนา พระมหากษัตริย์"],
  ["v2", "ซื่อสัตย์ เสียสละ อดทน"],
  ["v3", "กตัญญูต่อพ่อแม่ ผู้ปกครอง ครู"],
  ["v4", "ใฝ่หาความรู้"],
  ["v5", "รักษาวัฒนธรรมประเพณีไทย"],
  ["v6", "มีศีลธรรม"],
  ["v7", "เข้าใจประชาธิปไตย"],
  ["v8", "มีระเบียบวินัย"],
  ["v9", "มีสติรู้ตัว"],
  ["v10", "เศรษฐกิจพอเพียง"],
  ["v11", "เข้มแข็งทั้งกายและใจ"],
  ["v12", "คำนึงถึงส่วนรวม"],
];
const DEV_GROUPS = [
  ["ร่างกาย", [
    ["b1", "1 ร่างกายเจริญเติบโตตามวัยและมีสุขนิสัยที่ดี"],
    ["b2", "2 กล้ามเนื้อใหญ่และกล้ามเนื้อเล็กแข็งแรง"],
  ]],
  ["อารมณ์และจิตใจ", [
    ["b3", "3 มีสุขภาพจิตที่ดีและมีความสุข"],
    ["b4", "4 ชื่นชมและแสดงออกทางศิลปะ ดนตรี และการเคลื่อนไหว"],
    ["b5", "5 มีคุณธรรม จริยธรรม และจิตใจที่ดีงาม"],
  ]],
  ["สังคม", [
    ["b6", "6 มีทักษะชีวิตและปฏิบัติตนอย่างพอเพียง"],
    ["b7", "7 รักธรรมชาติ สิ่งแวดล้อม วัฒนธรรม และความเป็นไทย"],
    ["b8", "8 อยู่ร่วมกับผู้อื่นได้และเป็นสมาชิกที่ดีของสังคม"],
  ]],
  ["สติปัญญา", [
    ["b9", "9 ใช้ภาษาสื่อสารได้เหมาะสมกับวัย"],
    ["b10", "10 คิดเป็นพื้นฐานในการเรียนรู้"],
    ["b11", "11 มีจินตนาการและความคิดสร้างสรรค์"],
    ["b12", "12 มีเจตคติที่ดีต่อการเรียนรู้และแสวงหาความรู้"],
  ]],
];
const DEV_ITEMS = DEV_GROUPS.flatMap(([, items]) => items);

const fieldStyle = { width: "100%", boxSizing: "border-box", minWidth: 0, maxWidth: "100%", padding: "0.65rem 0.75rem", border: "1.5px solid #e2e8f0", borderRadius: "10px", fontSize: "16px", fontFamily: "inherit", color: "#0f172a", outline: "none", background: "#fff" };
const cardStyle = { background: "#fff", borderRadius: "1rem", padding: "1rem", boxShadow: "0 2px 12px rgba(0,0,0,0.06)", border: "1px solid #f1f5f9", minWidth: 0 };
const primaryButton = { boxSizing: "border-box", minHeight: 48, width: "100%", maxWidth: 320, border: "none", borderRadius: 10, background: "linear-gradient(135deg, #2563eb, #1d4ed8)", color: "#fff", fontWeight: 800, fontFamily: "inherit", fontSize: "0.95rem", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "0.4rem", cursor: "pointer" };
const quietButton = { boxSizing: "border-box", minHeight: 44, border: "1.5px solid #e2e8f0", borderRadius: 10, background: "#f8fafc", color: "#475569", fontWeight: 800, fontFamily: "inherit", fontSize: "0.88rem", padding: "0.45rem 0.8rem", cursor: "pointer" };

function todayISO() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

function shiftDate(dateKey, days) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

function formatThai(dateKey) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey || "")) return "-";
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12)).toLocaleDateString("th-TH", { weekday: "short", day: "numeric", month: "short", year: "2-digit", timeZone: "UTC" });
}

function currentTerm() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit" }).format(new Date());
  const [year, month] = parts.split("-").map(Number);
  return { year: String(month >= 5 ? year + 543 : year + 542), term: month >= 5 && month <= 10 ? "1" : "2" };
}

function termKey(term) {
  return `${term.year}-${term.term}`;
}

function newId() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function clip(value, max) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

function studentLabel(student) {
  return [student?.name, student?.surname].map(part => String(part || "").trim()).filter(Boolean).join(" ");
}

function gradeFromClassName(name) {
  const text = String(name || "");
  const short = text.match(/(อ|ป|ม)\.\s*(\d+)/);
  if (short) return `${short[1]}.${short[2]}`;
  const primary = text.match(/ประถมศึกษาปีที่\s*(\d+)/);
  if (primary) return `ป.${primary[1]}`;
  const secondary = text.match(/มัธยมศึกษาปีที่\s*(\d+)/);
  if (secondary) return `ม.${secondary[1]}`;
  const kinder = text.match(/อนุบาล(?:ศึกษา)?(?:ปีที่)?\s*(\d+)/);
  if (kinder) return `อ.${kinder[1]}`;
  return "";
}

function levelFromGrade(grade) {
  if (String(grade).startsWith("อ")) return "อนุบาล";
  if (String(grade).startsWith("ป")) return "ประถม";
  if (String(grade).startsWith("ม")) return "มัธยม";
  return "";
}

function subjectsForRoom(roomGrade) {
  const level = levelFromGrade(roomGrade);
  if (level === "ประถม" || level === "มัธยม") return SUBJECT_PRESETS;
  return [];
}

function emptyDuty() {
  return { levels: [], grades: [], subjectsByGrade: {} };
}

function cleanSubjectList(list) {
  const clean = [];
  (Array.isArray(list) ? list : []).forEach(item => {
    const text = clip(item, 40);
    if (text && !clean.includes(text)) clean.push(text);
  });
  return clean.slice(0, 12);
}

function cleanDuty(raw) {
  const levels = LEVELS.filter(level => Array.isArray(raw?.levels) && raw.levels.includes(level));
  const allowed = new Set(levels.flatMap(level => GRADE_OPTIONS[level]));
  const grades = ALL_GRADES.filter(grade => allowed.has(grade) && Array.isArray(raw?.grades) && raw.grades.includes(grade));
  const subjectsByGrade = {};
  grades.forEach(grade => {
    if (grade.startsWith("อ")) return;
    const subjects = cleanSubjectList(raw?.subjectsByGrade?.[grade]);
    if (subjects.length) subjectsByGrade[grade] = subjects;
  });
  return { levels, grades, subjectsByGrade };
}

function dutyIsEmpty(duty) {
  return !duty?.levels?.length;
}

function emptySanitation() {
  return { food: false, water: false, toilet: false, seller: false, note: "" };
}

function emptyAssignment() {
  return { version: 1, milk_joined: false, lunch_joined: false, sanitation: emptySanitation(), teachers: {}, updated_at: "" };
}

function parseAssignment(subject) {
  try {
    const parsed = JSON.parse(subject || "{}");
    const teachers = {};
    if (parsed?.teachers && typeof parsed.teachers === "object" && !Array.isArray(parsed.teachers)) {
      Object.entries(parsed.teachers).forEach(([id, duty]) => {
        const clean = cleanDuty(duty);
        if (!dutyIsEmpty(clean)) teachers[id] = clean;
      });
    }
    const sanitation = parsed?.sanitation || {};
    return {
      version: 1,
      milk_joined: Boolean(parsed?.milk_joined),
      lunch_joined: Boolean(parsed?.lunch_joined),
      sanitation: {
        food: Boolean(sanitation.food),
        water: Boolean(sanitation.water),
        toilet: Boolean(sanitation.toilet),
        seller: Boolean(sanitation.seller),
        note: clip(sanitation.note, 300),
      },
      teachers,
      updated_at: String(parsed?.updated_at || ""),
    };
  } catch {
    return emptyAssignment();
  }
}

function emptyRoll() {
  return { class_name: "", students: [] };
}

function parseRoll(subject) {
  try {
    const parsed = JSON.parse(subject || "{}");
    const students = (Array.isArray(parsed?.students) ? parsed.students : [])
      .map((student, index) => ({
        id: String(student?.id || ""),
        number: String(student?.number || index + 1).slice(0, 4),
        name: clip(student?.name, 40),
        surname: clip(student?.surname, 40),
      }))
      .filter(student => student.id && student.name)
      .slice(0, 80);
    return { class_name: clip(parsed?.class_name, 40), students };
  } catch {
    return emptyRoll();
  }
}

function oneDecimal(value) {
  const text = String(value ?? "").trim();
  if (!text) return "";
  if (!/^\d{1,3}(\.\d)?$/.test(text)) return "";
  return text.includes(".") ? text : `${text}.0`;
}

function decimalDraft(value) {
  const text = String(value ?? "");
  return /^\d{0,3}(\.\d{0,1})?$/.test(text) ? text : null;
}

function emptyMeasure() {
  return { w: "", h: "", hs: "", ws: "", follow: false, note: "" };
}

function cleanMeasure(raw) {
  return {
    w: oneDecimal(raw?.w),
    h: oneDecimal(raw?.h),
    hs: ALL_HEIGHT.has(raw?.hs) ? raw.hs : "",
    ws: ALL_WEIGHT.has(raw?.ws) ? raw.ws : "",
    follow: Boolean(raw?.follow),
    note: clip(raw?.note, 200),
  };
}

function parseTermMap(subject, cleanItem) {
  try {
    const parsed = JSON.parse(subject || "{}");
    const terms = {};
    if (parsed?.terms && typeof parsed.terms === "object" && !Array.isArray(parsed.terms)) {
      Object.entries(parsed.terms).forEach(([key, value]) => {
        if (!/^\d{4}-[12]$/.test(key) || !value || typeof value !== "object" || Array.isArray(value)) return;
        const students = {};
        Object.entries(value).forEach(([id, item]) => {
          if (!id || id === "students" || id === "aid" || id === "watch") return;
          students[id] = cleanItem(item);
        });
        if (value.students && typeof value.students === "object") {
          Object.entries(value.students).forEach(([id, item]) => {
            students[id] = cleanItem(item);
          });
        }
        terms[key] = { ...value, students };
      });
    }
    return { version: 1, terms };
  } catch {
    return { version: 1, terms: {} };
  }
}

function parseGrowth(subject) {
  const parsed = parseTermMap(subject, cleanMeasure);
  const terms = {};
  Object.entries(parsed.terms).forEach(([key, term]) => {
    const students = {};
    Object.entries(term.students || {}).forEach(([id, item]) => {
      const measure = cleanMeasure(item);
      if (measure.w || measure.h || measure.hs || measure.ws || measure.note || measure.follow) students[id] = measure;
    });
    terms[key] = students;
  });
  return { version: 1, terms };
}

function subsidyReason(level, measure) {
  const thin = level === "อนุบาล" ? measure.ws === "ผอม" : ["ผอม", "ค่อนข้างผอม"].includes(measure.ws);
  const obese = ["ท้วม", "เริ่มอ้วน", "อ้วน"].includes(measure.ws);
  const short = level === "อนุบาล" ? measure.hs === "เตี้ย" : ["เตี้ย", "เตี้ยมาก"].includes(measure.hs);
  if (thin) return "ผอม";
  if (short) return "เตี้ย";
  if (obese) return "อ้วน";
  return "";
}

function isOffChart(level, measure) {
  if (!measure) return false;
  if (level === "อนุบาล") return (measure.hs && measure.hs !== "ตามเกณฑ์") || (measure.ws && measure.ws !== "ตามเกณฑ์");
  return (measure.hs && measure.hs !== "ส่วนสูงตามเกณฑ์") || (measure.ws && measure.ws !== "สมส่วน");
}

function emptyHealthStudent() {
  return { card: false, vision: "", hearing: "", teeth: "", fluoride: false, sealant: false, booklet: false, sdq: "", sdq_date: "", body: "", mind: "", social: "", think: "", note: "" };
}

function cleanHealthStudent(raw) {
  const base = emptyHealthStudent();
  base.card = Boolean(raw?.card);
  base.vision = CHECK_RESULTS.includes(raw?.vision) ? raw.vision : "";
  base.hearing = CHECK_RESULTS.includes(raw?.hearing) ? raw.hearing : "";
  base.teeth = CHECK_RESULTS.includes(raw?.teeth) ? raw.teeth : "";
  base.fluoride = Boolean(raw?.fluoride);
  base.sealant = Boolean(raw?.sealant);
  base.booklet = Boolean(raw?.booklet);
  base.sdq = SDQ_RESULTS.includes(raw?.sdq) ? raw.sdq : "";
  base.sdq_date = /^\d{4}-\d{2}-\d{2}$/.test(raw?.sdq_date || "") ? raw.sdq_date : "";
  base.body = clip(raw?.body, 300);
  base.mind = clip(raw?.mind, 300);
  base.social = clip(raw?.social, 300);
  base.think = clip(raw?.think, 300);
  base.note = clip(raw?.note, 300);
  return base;
}

function parseHealth(subject) {
  try {
    const parsed = JSON.parse(subject || "{}");
    const terms = {};
    const source = parsed?.terms && typeof parsed.terms === "object" ? parsed.terms : {};
    Object.entries(source).forEach(([key, value]) => {
      if (!/^\d{4}-[12]$/.test(key) || !value || typeof value !== "object") return;
      const students = {};
      const rawStudents = value.students && typeof value.students === "object" ? value.students : {};
      Object.entries(rawStudents).forEach(([id, item]) => {
        students[id] = cleanHealthStudent(item);
      });
      const aid = (Array.isArray(value.aid) ? value.aid : []).slice(0, 40).map(item => ({
        id: String(item?.id || newId()),
        date: /^\d{4}-\d{2}-\d{2}$/.test(item?.date || "") ? item.date : "",
        student_id: String(item?.student_id || ""),
        what: clip(item?.what, 200),
        care: clip(item?.care, 200),
      })).filter(item => item.date && item.student_id && item.what && item.care);
      terms[key] = { students, aid, watch: clip(value.watch, 500) };
    });
    return { version: 1, terms };
  } catch {
    return { version: 1, terms: {} };
  }
}

function parseMilk(subject) {
  try {
    const parsed = JSON.parse(subject || "{}");
    const days = {};
    const source = parsed?.days && typeof parsed.days === "object" ? parsed.days : {};
    Object.entries(source).forEach(([date, day]) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
      const marks = {};
      const reasons = {};
      const rawMarks = day?.marks && typeof day.marks === "object" ? day.marks : {};
      Object.entries(rawMarks).forEach(([id, mark]) => {
        if (mark === "yes" || mark === "no") marks[id] = mark;
      });
      const rawReasons = day?.reasons && typeof day.reasons === "object" ? day.reasons : {};
      Object.entries(rawReasons).forEach(([id, reason]) => {
        const text = clip(reason, 80);
        if (text) reasons[id] = text;
      });
      days[date] = { saved_at: day?.saved_at || "", marks, reasons };
    });
    return { version: 1, days };
  } catch {
    return { version: 1, days: {} };
  }
}

function pruneDays(days) {
  const keys = Object.keys(days).sort();
  if (keys.length <= 400) return days;
  const keep = new Set(keys.slice(-400));
  return Object.fromEntries(Object.entries(days).filter(([key]) => keep.has(key)));
}

function parseLunch(subject) {
  try {
    const parsed = JSON.parse(subject || "{}");
    const terms = {};
    const source = parsed?.terms && typeof parsed.terms === "object" ? parsed.terms : {};
    Object.entries(source).forEach(([key, value]) => {
      if (!/^\d{4}-[12]$/.test(key) || !value || typeof value !== "object") return;
      const students = {};
      const rawStudents = value.students && typeof value.students === "object" ? value.students : value;
      Object.entries(rawStudents).forEach(([id, item]) => {
        if (id === "students") return;
        const reason = LUNCH_REASONS.includes(item?.reason) ? item.reason : "";
        if (!reason) return;
        students[id] = { reason, note: clip(item?.note, 120) };
      });
      terms[key] = students;
    });
    return { version: 1, terms };
  } catch {
    return { version: 1, terms: {} };
  }
}

function cleanScore(raw) {
  const hoursText = String(raw?.hours ?? "").trim();
  const hours = /^\d{1,3}$/.test(hoursText) ? hoursText : "";
  return {
    hours,
    mid: oneDecimal(raw?.mid),
    final: oneDecimal(raw?.final),
    grade: clip(raw?.grade, 12),
    onet: oneDecimal(raw?.onet),
  };
}

function parseScore(subject) {
  try {
    const parsed = JSON.parse(subject || "{}");
    const terms = {};
    const source = parsed?.terms && typeof parsed.terms === "object" ? parsed.terms : {};
    Object.entries(source).forEach(([key, value]) => {
      if (!/^\d{4}-[12]$/.test(key) || !value || typeof value !== "object") return;
      const books = {};
      Object.entries(value).forEach(([bookKey, book]) => {
        if (!bookKey.includes("\n") || !book || typeof book !== "object") return;
        const students = {};
        const rawStudents = book.students && typeof book.students === "object" ? book.students : {};
        Object.entries(rawStudents).forEach(([id, item]) => {
          students[id] = cleanScore(item);
        });
        books[bookKey] = { students };
      });
      terms[key] = books;
    });
    return { version: 1, terms };
  } catch {
    return { version: 1, terms: {} };
  }
}

async function fetchMarker(period, employeeId) {
  let query = supabase.from("teaching_schedule").select("id, employee_id, subject, created_at").eq("class_room", ACADEMIC_RECORD_ROOM).eq("day_of_week", 0).eq("period", period).order("created_at", { ascending: false });
  if (employeeId) query = query.eq("employee_id", employeeId);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data || [];
}

async function writeMarker(period, employeeId, doc, existingId, schoolwide = false) {
  const subject = JSON.stringify(doc);
  if (subject.length > JSON_LIMIT) throw new Error("ข้อมูลยาวเกินที่ระบบเก็บได้");
  const payload = {
    employee_id: employeeId,
    day_of_week: 0,
    period,
    class_room: ACADEMIC_RECORD_ROOM,
    start_time: "00:00:00",
    end_time: null,
    subject,
  };
  const result = existingId
    ? await supabase.from("teaching_schedule").update(payload).eq("id", existingId).select("id").single()
    : await supabase.from("teaching_schedule").insert(payload).select("id").single();
  if (result.error) throw new Error(result.error.message);
  const rows = await fetchMarker(period, schoolwide ? null : employeeId);
  const extras = rows.filter(row => row.id !== result.data.id).map(row => row.id);
  if (extras.length) await supabase.from("teaching_schedule").delete().in("id", extras);
  return result.data.id;
}

async function fetchRoll(employeeId) {
  if (!employeeId) return emptyRoll();
  const { data, error } = await supabase.from("teaching_schedule").select("subject, created_at").eq("class_room", "__STUDENT_ROLL__").eq("day_of_week", 0).eq("period", 0).eq("employee_id", employeeId).order("created_at", { ascending: false }).limit(1);
  if (error) throw new Error(error.message);
  return parseRoll(data?.[0]?.subject);
}

function roomContext(roll, duty) {
  const className = roll?.class_name || "";
  const roomGrade = gradeFromClassName(className);
  const roomLevel = levelFromGrade(roomGrade);
  if (dutyIsEmpty(duty)) return { className, roomGrade, roomLevel, blocked: "noduty" };
  if (!className) return { className, roomGrade, roomLevel, blocked: "noroom" };
  if (!roomGrade) return { className, roomGrade, roomLevel, blocked: "unknownroom" };
  if (!duty.levels.includes(roomLevel)) return { className, roomGrade, roomLevel, blocked: "level" };
  if (!duty.grades.includes(roomGrade)) return { className, roomGrade, roomLevel, blocked: "grade" };
  return { className, roomGrade, roomLevel, blocked: "" };
}

function blockText(context, duty) {
  const grade = duty?.grades?.[0] || "";
  if (context.blocked === "noduty") return "แอดมินยังไม่ได้ตั้งชั้นที่สอนในข้อมูลพนักงาน";
  if (context.blocked === "noroom") return "ยังไม่มีรายชื่อห้อง ฝ่ายวิชาการอัป Excel ในแท็บเช็คชื่อ และตั้งชื่อห้องให้ขึ้นต้นด้วยชั้น เช่น อ.1/1 ป.2/1 หรือ ม.1/1";
  if (context.blocked === "unknownroom") return `ชื่อห้อง ${context.className} ยังอ่านชั้นไม่ได้ ให้ใช้รูปแบบ อ.1/1 ป.2/1 หรือ ม.1/1`;
  if (context.blocked === "level" || context.blocked === "grade") return `ห้องนี้เป็น ${context.roomGrade || context.roomLevel} แต่ชั้นที่ตั้งไว้ในข้อมูลพนักงานเป็น ${grade || "คนละชั้น"}`;
  return "";
}

function Card({ children }) {
  return <div style={cardStyle}>{children}</div>;
}

function ErrorBox({ children }) {
  return <div style={{ background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 8, padding: "0.75rem", color: "#dc2626", fontSize: "0.85rem" }}>{children}</div>;
}

function OkNote({ children }) {
  return <div style={{ background: "#ecfdf5", border: "1px solid #bbf7d0", borderRadius: 10, padding: "0.75rem 1rem", color: "#166534", fontWeight: 700 }}>{children}</div>;
}

function WarnNote({ children }) {
  return <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 12, padding: "0.8rem", color: "#92400e", fontWeight: 700, lineHeight: 1.55 }}>{children}</div>;
}

function FieldLabel({ children }) {
  return <div style={{ fontSize: "0.8rem", fontWeight: 700, color: "#475569", marginBottom: "0.3rem" }}>{children}</div>;
}

function SectionFold({ title, summary, children }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ minWidth: 0 }}>
      <button type="button" aria-expanded={open} onClick={() => setOpen(value => !value)} style={{ width: "100%", minHeight: 44, display: "flex", alignItems: "center", gap: "0.4rem", border: "none", background: "transparent", fontFamily: "inherit", textAlign: "left", cursor: "pointer", padding: "0.2rem 0" }}>
        <span style={{ fontWeight: 800, color: "#0f172a", flex: "1 1 auto", minWidth: 0 }}>{title}</span>
        {!open && summary ? <span style={{ color: "#64748b", fontWeight: 700, fontSize: "0.78rem", flex: "0 0 auto" }}>{summary}</span> : null}
        {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>
      {open && <div style={{ display: "grid", gap: "0.55rem", paddingBottom: "0.45rem", minWidth: 0 }}>{children}</div>}
    </div>
  );
}

function SaveButton({ saving, label, onClick }) {
  return (
    <button type="button" onClick={onClick} disabled={saving} style={{ ...primaryButton, cursor: saving ? "not-allowed" : "pointer" }}>
      {saving ? <RefreshCw size={16} style={{ animation: "spin 1s linear infinite" }} /> : <Save size={16} />}
      {saving ? "กำลังบันทึก..." : label}
    </button>
  );
}

function TermBar({ term, onChange }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 140px), 1fr))", gap: "0.6rem" }}>
      <div>
        <FieldLabel>ปีการศึกษา</FieldLabel>
        <input aria-label="ปีการศึกษา" inputMode="numeric" value={term.year} onChange={event => {
          const year = event.target.value.replace(/\D/g, "").slice(0, 4);
          onChange({ ...term, year });
        }} style={fieldStyle} />
      </div>
      <div>
        <FieldLabel>ภาคเรียน</FieldLabel>
        <select aria-label="ภาคเรียน" value={term.term} onChange={event => onChange({ ...term, term: event.target.value })} style={fieldStyle}>
          <option value="1">ภาคเรียนที่ 1</option>
          <option value="2">ภาคเรียนที่ 2</option>
        </select>
      </div>
    </div>
  );
}

function TeacherPick({ teachers, value, onChange }) {
  return (
    <Card>
      <FieldLabel>ครู</FieldLabel>
      <select aria-label="เลือกครู" value={value} onChange={event => onChange(event.target.value)} style={fieldStyle}>
        <option value="">เลือกครู</option>
        {teachers.map(teacher => <option key={teacher.id} value={teacher.id}>{teacher.name}{teacher.department ? ` · ${teacher.department}` : ""}</option>)}
      </select>
    </Card>
  );
}

function RoomHint({ show, className }) {
  if (!show || !className) return null;
  return <div style={{ color: "#64748b", fontWeight: 700 }}>ห้อง {className}</div>;
}

function useAcademicAccess(employees, currentUser) {
  const isAdmin = currentUser?.role === "admin";
  const teachers = useMemo(() => (employees || []).filter(employee => employee.role !== "admin").slice().sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "th")), [employees]);
  const [picked, setPicked] = useState("");
  const teacherId = isAdmin ? picked : (currentUser?.id || "");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [assign, setAssign] = useState({ row: null, doc: emptyAssignment() });
  const [roll, setRoll] = useState(emptyRoll);
  const [rollOwner, setRollOwner] = useState("");

  const pickTeacher = (id) => {
    if (id === teacherId) return;
    setLoading(true);
    setRollOwner("");
    setPicked(id);
  };

  const reload = async (id) => {
    const rows = await fetchMarker(PERIOD.assign, null);
    const row = rows[0] || null;
    const doc = parseAssignment(row?.subject);
    const nextRoll = id ? await fetchRoll(id) : emptyRoll();
    return { row, doc, roll: nextRoll };
  };

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        setLoading(true);
        setError("");
        const loaded = await reload(teacherId);
        if (!active) return;
        setAssign({ row: loaded.row, doc: loaded.doc });
        setRoll(loaded.roll);
        setRollOwner(teacherId);
      } catch (err) {
        if (active) setError(err.message || "โหลดงานวิชาการไม่สำเร็จ");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [teacherId]);

  const duty = cleanDuty(assign.doc.teachers?.[teacherId]);
  const visibleRoll = rollOwner === teacherId ? roll : emptyRoll();
  return { isAdmin, teachers, teacherId, pickTeacher, loading, error, assign, setAssign, roll: visibleRoll, duty, reload, setError };
}

function ResultSelect({ label, value, options, onChange, disabled }) {
  return (
    <div style={{ minWidth: 0 }}>
      <FieldLabel>{label}</FieldLabel>
      <select aria-label={label} disabled={disabled} value={options.includes(value) ? value : ""} onChange={event => onChange(event.target.value)} style={{ ...fieldStyle, background: disabled ? "#f8fafc" : "#fff" }}>
        <option value="">ยังไม่ลงผล</option>
        {options.map(option => <option key={option} value={option}>{option}</option>)}
      </select>
    </div>
  );
}

function GrowthPage({ employees, currentUser }) {
  const access = useAcademicAccess(employees, currentUser);
  const [term, setTerm] = useState(currentTerm);
  const [doc, setDoc] = useState({ version: 1, terms: {} });
  const [rowId, setRowId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [pageError, setPageError] = useState("");
  const [openId, setOpenId] = useState("");
  const readOnly = access.isAdmin;

  useEffect(() => {
    let active = true;
    if (!access.teacherId) return undefined;
    (async () => {
      try {
        const rows = await fetchMarker(PERIOD.growth, access.teacherId);
        if (!active) return;
        setRowId(rows[0]?.id || null);
        setDoc(parseGrowth(rows[0]?.subject));
        setOpenId("");
        setMessage("");
        setPageError("");
      } catch (err) {
        if (active) setPageError(err.message || "โหลดน้ำหนักส่วนสูงไม่สำเร็จ");
      }
    })();
    return () => { active = false; };
  }, [access.teacherId]);

  const key = termKey(term);
  const context = roomContext(access.roll, access.duty);
  const level = context.roomLevel;
  const heightOptions = level === "อนุบาล" ? HEIGHT_KINDER : HEIGHT_SCHOOL;
  const weightOptions = level === "อนุบาล" ? WEIGHT_KINDER : WEIGHT_SCHOOL;
  const students = access.roll.students;
  const termStudents = doc.terms[key] || {};
  const measured = students.filter(student => termStudents[student.id]?.w && termStudents[student.id]?.h).length;

  const updateStudent = (id, patch) => {
    setDoc(current => {
      const nextTerm = { ...(current.terms[key] || {}) };
      nextTerm[id] = { ...emptyMeasure(), ...nextTerm[id], ...patch };
      return { ...current, terms: { ...current.terms, [key]: nextTerm } };
    });
    setMessage("");
  };

  const save = async () => {
    if (readOnly || context.blocked) return;
    if (!/^\d{4}$/.test(term.year)) { setPageError("กรอกปีการศึกษา 4 หลัก"); return; }
    for (const student of students) {
      const item = { ...emptyMeasure(), ...(termStudents[student.id] || {}) };
      const weight = item.w ? oneDecimal(item.w) : "";
      const height = item.h ? oneDecimal(item.h) : "";
      if ((item.w && !weight) || (item.h && !height)) {
        setPageError(`เลขที่ ${student.number} ใช้น้ำหนักและส่วนสูงเป็นตัวเลข ทศนิยมไม่เกิน 1 ตำแหน่ง`);
        return;
      }
      if ((weight && !height) || (!weight && height)) {
        setPageError(`เลขที่ ${student.number} กรอกทั้งน้ำหนักและส่วนสูง`);
        return;
      }
    }
    setSaving(true);
    setPageError("");
    setMessage("");
    try {
      const nextTerm = { ...(doc.terms[key] || {}) };
      students.forEach(student => {
        const item = cleanMeasure(nextTerm[student.id] || {});
        if (item.w || item.h || item.hs || item.ws || item.note || item.follow) nextTerm[student.id] = item;
        else delete nextTerm[student.id];
      });
      const next = { version: 1, terms: { ...doc.terms, [key]: nextTerm } };
      const id = await writeMarker(PERIOD.growth, access.teacherId, next, rowId);
      setRowId(id);
      setDoc(parseGrowth(JSON.stringify(next)));
      setMessage(`บันทึกน้ำหนักส่วนสูงแล้ว ${measured} จาก ${students.length} คน`);
    } catch (err) {
      setPageError(err.message || "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  };

  if (access.loading) return <Card><div style={{ color: "#64748b" }}>กำลังโหลดน้ำหนักส่วนสูง...</div></Card>;
  return (
    <div style={{ display: "grid", gap: "0.8rem", minWidth: 0 }}>
      {(access.error || pageError) && <ErrorBox>{access.error || pageError}</ErrorBox>}
      {message && <OkNote>{message}</OkNote>}
      {access.isAdmin && <TeacherPick teachers={access.teachers} value={access.teacherId} onChange={access.pickTeacher} />}
      {access.isAdmin && !access.teacherId ? <WarnNote>เลือกครูเพื่อดูน้ำหนักส่วนสูง</WarnNote> : (
        <Card>
          <div style={{ display: "grid", gap: "0.75rem", minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: "1.05rem", color: "#0f172a" }}>น้ำหนักส่วนสูง</div>
            <RoomHint show={access.isAdmin} className={context.className} />
            {context.blocked ? <WarnNote>{blockText(context, access.duty)}</WarnNote> : (
              <>
                <TermBar term={term} onChange={setTerm} />
                <div style={{ fontWeight: 800, color: "#0f172a" }}>ชั่งครบ {measured}/{students.length} คน</div>
                {!readOnly && <SaveButton saving={saving} label="บันทึกน้ำหนักส่วนสูง" onClick={save} />}
                {readOnly && <div style={{ color: "#64748b" }}>ดูอย่างเดียว</div>}
                {students.map(student => {
                  const item = { ...emptyMeasure(), ...(termStudents[student.id] || {}) };
                  const open = openId === student.id;
                  const summary = item.w && item.h ? `${item.w} กก. · ${item.h} ซม.` : "ยังไม่ชั่ง";
                  return (
                    <div key={student.id} style={{ borderTop: "1px solid #f1f5f9", minWidth: 0 }}>
                      <button type="button" aria-expanded={open} onClick={() => setOpenId(open ? "" : student.id)} style={{ width: "100%", minHeight: 48, display: "flex", flexWrap: "wrap", gap: "0.35rem", alignItems: "center", background: "transparent", border: "none", fontFamily: "inherit", textAlign: "left", padding: "0.45rem 0", cursor: "pointer" }}>
                        <span style={{ fontWeight: 800, color: "#64748b" }}>{student.number}</span>
                        <span style={{ fontWeight: 800, color: "#0f172a", flex: "1 1 120px", minWidth: 0, wordBreak: "break-word" }}>{studentLabel(student)}</span>
                        <span style={{ color: "#64748b", fontWeight: 700, fontSize: "0.78rem" }}>{summary}</span>
                        {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </button>
                      {open && (
                        <div style={{ display: "grid", gap: "0.6rem", paddingBottom: "0.7rem", minWidth: 0 }}>
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 150px), 1fr))", gap: "0.6rem" }}>
                            <div>
                              <FieldLabel>น้ำหนัก (กก.)</FieldLabel>
                              <input aria-label={`น้ำหนักเลขที่ ${student.number}`} inputMode="decimal" disabled={readOnly} value={item.w} placeholder="0.0" onChange={event => {
                                const next = decimalDraft(event.target.value);
                                if (next !== null) updateStudent(student.id, { w: next });
                              }} style={{ ...fieldStyle, background: readOnly ? "#f8fafc" : "#fff" }} />
                            </div>
                            <div>
                              <FieldLabel>ส่วนสูง (ซม.)</FieldLabel>
                              <input aria-label={`ส่วนสูงเลขที่ ${student.number}`} inputMode="decimal" disabled={readOnly} value={item.h} placeholder="0.0" onChange={event => {
                                const next = decimalDraft(event.target.value);
                                if (next !== null) updateStudent(student.id, { h: next });
                              }} style={{ ...fieldStyle, background: readOnly ? "#f8fafc" : "#fff" }} />
                            </div>
                          </div>
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 160px), 1fr))", gap: "0.6rem" }}>
                            <ResultSelect label={`ผลส่วนสูงเลขที่ ${student.number}`} value={item.hs} options={heightOptions} disabled={readOnly} onChange={hs => updateStudent(student.id, { hs })} />
                            <ResultSelect label={`ผลน้ำหนักเลขที่ ${student.number}`} value={item.ws} options={weightOptions} disabled={readOnly} onChange={ws => updateStudent(student.id, { ws })} />
                          </div>
                          {isOffChart(level, item) && <div style={{ color: "#b45309", fontWeight: 700, fontSize: "0.84rem" }}>ผลนี้อยู่นอกเกณฑ์ปกติ ควรติดตามทุกเดือน</div>}
                          <label style={{ display: "flex", gap: "0.45rem", alignItems: "center", fontWeight: 700, color: "#334155" }}>
                            <input type="checkbox" checked={item.follow} disabled={readOnly} onChange={event => updateStudent(student.id, { follow: event.target.checked })} />
                            ติดตามรายเดือน
                          </label>
                          <input aria-label={`หมายเหตุผลชั่งเลขที่ ${student.number}`} disabled={readOnly} value={item.note} maxLength={200} onChange={event => updateStudent(student.id, { note: event.target.value.slice(0, 200) })} style={{ ...fieldStyle, background: readOnly ? "#f8fafc" : "#fff" }} />
                        </div>
                      )}
                    </div>
                  );
                })}
                {!readOnly && <SaveButton saving={saving} label="บันทึกน้ำหนักส่วนสูง" onClick={save} />}
              </>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}

function HealthFields({ student, item, level, grade, readOnly, onChange }) {
  const set = patch => onChange({ ...item, ...patch });
  return (
    <div style={{ display: "grid", gap: "0.65rem", minWidth: 0 }}>
      <label style={{ display: "flex", gap: "0.45rem", alignItems: "center", fontWeight: 700 }}>
        <input aria-label={`มีบัตรสุขภาพเลขที่ ${student.number}`} type="checkbox" checked={item.card} disabled={readOnly} onChange={event => set({ card: event.target.checked })} />
        มีบัตร สศ.3 หรือสมุดสุขภาพสะสม
      </label>
      {level === "อนุบาล" && (
        <SectionFold title="พัฒนาการ 4 ด้าน" summary={[["body"], ["mind"], ["social"], ["think"]].filter(([keyName]) => String(item[keyName] || "").trim()).length ? "มีบันทึก" : ""}>
          {[["body", "ร่างกาย"], ["mind", "อารมณ์และจิตใจ"], ["social", "สังคม"], ["think", "สติปัญญา"]].map(([keyName, label]) => (
            <div key={keyName}>
              <FieldLabel>{label}</FieldLabel>
              <textarea aria-label={`${label}เลขที่ ${student.number}`} disabled={readOnly} value={item[keyName]} rows={2} maxLength={300} onChange={event => set({ [keyName]: event.target.value.slice(0, 300) })} style={{ ...fieldStyle, resize: "vertical", background: readOnly ? "#f8fafc" : "#fff" }} />
            </div>
          ))}
        </SectionFold>
      )}
      {level !== "อนุบาล" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 150px), 1fr))", gap: "0.6rem" }}>
          <ResultSelect label={`สายตาเลขที่ ${student.number}`} value={item.vision} options={CHECK_RESULTS} disabled={readOnly} onChange={vision => set({ vision })} />
          <ResultSelect label={`การได้ยินเลขที่ ${student.number}`} value={item.hearing} options={CHECK_RESULTS} disabled={readOnly} onChange={hearing => set({ hearing })} />
          <ResultSelect label={`ฟันเลขที่ ${student.number}`} value={item.teeth} options={CHECK_RESULTS} disabled={readOnly} onChange={teeth => set({ teeth })} />
        </div>
      )}
      {level === "อนุบาล" && <ResultSelect label={`ฟันเลขที่ ${student.number}`} value={item.teeth} options={CHECK_RESULTS} disabled={readOnly} onChange={teeth => set({ teeth })} />}
      {FLUORIDE_GRADES.has(grade) && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.8rem" }}>
          <label style={{ fontWeight: 700 }}><input type="checkbox" checked={item.fluoride} disabled={readOnly} onChange={event => set({ fluoride: event.target.checked })} /> ฟลูออไรด์</label>
          <label style={{ fontWeight: 700 }}><input type="checkbox" checked={item.sealant} disabled={readOnly} onChange={event => set({ sealant: event.target.checked })} /> เคลือบหลุมร่องฟัน</label>
        </div>
      )}
      {BOOKLET_GRADES.has(grade) && (
        <label style={{ fontWeight: 700 }}><input type="checkbox" checked={item.booklet} disabled={readOnly} onChange={event => set({ booklet: event.target.checked })} /> สมุดบันทึกสุขภาพด้วยตนเองภาคนี้</label>
      )}
      {level !== "อนุบาล" && (
        <SectionFold title="SDQ" summary={item.sdq || ""}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 160px), 1fr))", gap: "0.6rem" }}>
            <ResultSelect label={`ผล SDQ เลขที่ ${student.number}`} value={item.sdq} options={SDQ_RESULTS} disabled={readOnly} onChange={sdq => set({ sdq })} />
            <div>
              <FieldLabel>วันที่ประเมิน SDQ</FieldLabel>
              <input aria-label={`วันที่ SDQ เลขที่ ${student.number}`} type="date" disabled={readOnly} value={item.sdq_date} onChange={event => set({ sdq_date: event.target.value })} style={{ ...fieldStyle, background: readOnly ? "#f8fafc" : "#fff" }} />
            </div>
          </div>
        </SectionFold>
      )}
      <input aria-label={`หมายเหตุสุขภาพเลขที่ ${student.number}`} disabled={readOnly} value={item.note} maxLength={300} onChange={event => set({ note: event.target.value.slice(0, 300) })} style={{ ...fieldStyle, background: readOnly ? "#f8fafc" : "#fff" }} />
    </div>
  );
}

function HealthPage({ employees, currentUser }) {
  const access = useAcademicAccess(employees, currentUser);
  const [term, setTerm] = useState(currentTerm);
  const [doc, setDoc] = useState({ version: 1, terms: {} });
  const [rowId, setRowId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [pageError, setPageError] = useState("");
  const [openId, setOpenId] = useState("");
  const [sanitation, setSanitation] = useState(emptySanitation);
  const [aidDraft, setAidDraft] = useState({ date: todayISO(), student_id: "", what: "", care: "" });
  const readOnly = access.isAdmin;

  useEffect(() => {
    let active = true;
    if (!access.teacherId) return undefined;
    (async () => {
      try {
        const rows = await fetchMarker(PERIOD.health, access.teacherId);
        if (!active) return;
        setRowId(rows[0]?.id || null);
        setDoc(parseHealth(rows[0]?.subject));
        setOpenId("");
        setMessage("");
        setPageError("");
      } catch (err) {
        if (active) setPageError(err.message || "โหลดสุขภาพไม่สำเร็จ");
      }
    })();
    return () => { active = false; };
  }, [access.teacherId]);

  useEffect(() => {
    setSanitation(access.assign.doc.sanitation || emptySanitation());
  }, [access.assign.doc.updated_at, access.assign.row?.id]);

  const key = termKey(term);
  const context = roomContext(access.roll, access.duty);
  const termData = doc.terms[key] || { students: {}, aid: [], watch: "" };
  const students = access.roll.students;

  const updateStudent = (id, item) => {
    setDoc(current => {
      const currentTermData = current.terms[key] || { students: {}, aid: [], watch: "" };
      return { ...current, terms: { ...current.terms, [key]: { ...currentTermData, students: { ...currentTermData.students, [id]: item } } } };
    });
  };

  const save = async () => {
    if (readOnly || context.blocked) return;
    setSaving(true);
    setPageError("");
    setMessage("");
    try {
      const studentsOut = {};
      students.forEach(student => {
        studentsOut[student.id] = cleanHealthStudent(termData.students?.[student.id] || {});
      });
      const next = { version: 1, terms: { ...doc.terms, [key]: { students: studentsOut, aid: termData.aid || [], watch: clip(termData.watch, 500) } } };
      const id = await writeMarker(PERIOD.health, access.teacherId, next, rowId);
      setRowId(id);
      setDoc(parseHealth(JSON.stringify(next)));
      setMessage("บันทึกสุขภาพนักเรียนแล้ว");
    } catch (err) {
      setPageError(err.message || "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  };

  const addAid = () => {
    if (!aidDraft.date || !aidDraft.student_id || !clip(aidDraft.what, 200) || !clip(aidDraft.care, 200)) {
      setPageError("บันทึกปฐมพยาบาลต้องมีวัน นักเรียน อาการ และการดูแล");
      return;
    }
    const entry = { id: newId(), date: aidDraft.date, student_id: aidDraft.student_id, what: clip(aidDraft.what, 200), care: clip(aidDraft.care, 200) };
    setDoc(current => {
      const currentTermData = current.terms[key] || { students: {}, aid: [], watch: "" };
      return { ...current, terms: { ...current.terms, [key]: { ...currentTermData, aid: [entry, ...(currentTermData.aid || [])].slice(0, 40) } } };
    });
    setAidDraft({ date: todayISO(), student_id: "", what: "", care: "" });
    setPageError("");
  };

  const saveSanitation = async () => {
    setSaving(true);
    setPageError("");
    setMessage("");
    try {
      const latestRows = await fetchMarker(PERIOD.assign, null);
      const row = latestRows[0] || null;
      const latest = parseAssignment(row?.subject);
      const next = { ...latest, sanitation: { ...emptySanitation(), ...sanitation, note: clip(sanitation.note, 300) }, updated_at: new Date().toISOString() };
      const id = await writeMarker(PERIOD.assign, row?.employee_id || currentUser.id, next, row?.id || null, true);
      access.setAssign({ row: { ...(row || {}), id, employee_id: row?.employee_id || currentUser.id }, doc: next });
      setMessage("บันทึกสุขาภิบาลของโรงเรียนแล้ว");
    } catch (err) {
      setPageError(err.message || "บันทึกสุขาภิบาลไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  };

  if (access.loading) return <Card><div style={{ color: "#64748b" }}>กำลังโหลดสุขภาพ...</div></Card>;
  return (
    <div style={{ display: "grid", gap: "0.8rem", minWidth: 0 }}>
      {(access.error || pageError) && <ErrorBox>{access.error || pageError}</ErrorBox>}
      {message && <OkNote>{message}</OkNote>}
      {access.isAdmin && <TeacherPick teachers={access.teachers} value={access.teacherId} onChange={access.pickTeacher} />}
      <Card>
        <SectionFold title="สุขาภิบาลอาหาร น้ำ และห้องน้ำ" summary={["food", "water", "toilet", "seller"].filter(keyName => sanitation[keyName]).length ? "มีรายการ" : ""}>
          {["food", "water", "toilet", "seller"].map(keyName => (
            <label key={keyName} style={{ display: "flex", gap: "0.45rem", alignItems: "center", fontWeight: 700 }}>
              <input type="checkbox" checked={Boolean(sanitation[keyName])} disabled={!access.isAdmin} onChange={event => setSanitation(current => ({ ...current, [keyName]: event.target.checked }))} />
              {keyName === "food" ? "ตรวจอาหาร" : keyName === "water" ? "ตรวจน้ำดื่ม" : keyName === "toilet" ? "ตรวจห้องน้ำ" : "ผู้ขายอาหารมีใบรับรอง"}
            </label>
          ))}
          <textarea aria-label="หมายเหตุสุขาภิบาล" disabled={!access.isAdmin} value={sanitation.note || ""} rows={2} maxLength={300} onChange={event => setSanitation(current => ({ ...current, note: event.target.value.slice(0, 300) }))} style={{ ...fieldStyle, resize: "vertical", background: access.isAdmin ? "#fff" : "#f8fafc" }} />
          {access.isAdmin && <SaveButton saving={saving} label="บันทึกสุขาภิบาล" onClick={saveSanitation} />}
        </SectionFold>
      </Card>
      {access.isAdmin && !access.teacherId ? <WarnNote>เลือกครูเพื่อดูสุขภาพรายคนของห้องนั้น</WarnNote> : access.teacherId && (
        <Card>
          <div style={{ display: "grid", gap: "0.75rem", minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: "1.05rem" }}>สุขภาพรายคน</div>
            <RoomHint show={access.isAdmin} className={context.className} />
            {context.blocked ? <WarnNote>{blockText(context, access.duty)}</WarnNote> : (
              <>
                <TermBar term={term} onChange={setTerm} />
                {!readOnly && <SaveButton saving={saving} label="บันทึกสุขภาพ" onClick={save} />}
                {readOnly && <div style={{ color: "#64748b" }}>ดูอย่างเดียว</div>}
                <SectionFold title="เฝ้าระวังโรคในห้องนี้" summary={termData.watch ? "มีบันทึก" : ""}>
                  <textarea aria-label="เฝ้าระวังโรค" disabled={readOnly} value={termData.watch || ""} rows={2} maxLength={500} onChange={event => {
                    const watch = event.target.value.slice(0, 500);
                    setDoc(current => {
                      const currentTerm = current.terms[key] || { students: {}, aid: [], watch: "" };
                      return { ...current, terms: { ...current.terms, [key]: { ...currentTerm, watch } } };
                    });
                  }} style={{ ...fieldStyle, resize: "vertical", background: readOnly ? "#f8fafc" : "#fff" }} />
                </SectionFold>
                {students.map(student => {
                  const item = cleanHealthStudent(termData.students?.[student.id] || {});
                  const open = openId === student.id;
                  return (
                    <div key={student.id} style={{ borderTop: "1px solid #f1f5f9", minWidth: 0 }}>
                      <button type="button" aria-expanded={open} onClick={() => setOpenId(open ? "" : student.id)} style={{ width: "100%", minHeight: 48, display: "flex", gap: "0.4rem", alignItems: "center", background: "transparent", border: "none", fontFamily: "inherit", textAlign: "left", cursor: "pointer", padding: "0.4rem 0" }}>
                        <span style={{ fontWeight: 800, color: "#64748b" }}>{student.number}</span>
                        <span style={{ fontWeight: 800, color: "#0f172a", flex: 1, minWidth: 0, wordBreak: "break-word" }}>{studentLabel(student)}</span>
                        {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </button>
                      {open && <HealthFields student={student} item={item} level={context.roomLevel} grade={context.roomGrade} readOnly={readOnly} onChange={next => updateStudent(student.id, next)} />}
                    </div>
                  );
                })}
                <SectionFold title="บันทึกปฐมพยาบาล" summary={(termData.aid || []).length ? `${termData.aid.length} รายการ` : ""}>
                  {!readOnly && (
                    <div style={{ display: "grid", gap: "0.5rem" }}>
                      <input aria-label="วันที่ปฐมพยาบาล" type="date" max={todayISO()} value={aidDraft.date} onChange={event => setAidDraft(current => ({ ...current, date: event.target.value }))} style={fieldStyle} />
                      <select aria-label="นักเรียนปฐมพยาบาล" value={aidDraft.student_id} onChange={event => setAidDraft(current => ({ ...current, student_id: event.target.value }))} style={fieldStyle}>
                        <option value="">เลือกนักเรียน</option>
                        {students.map(student => <option key={student.id} value={student.id}>{student.number} {studentLabel(student)}</option>)}
                      </select>
                      <div>
                        <FieldLabel>อาการ</FieldLabel>
                        <input aria-label="อาการปฐมพยาบาล" value={aidDraft.what} maxLength={200} onChange={event => setAidDraft(current => ({ ...current, what: event.target.value }))} style={fieldStyle} />
                      </div>
                      <div>
                        <FieldLabel>การดูแล</FieldLabel>
                        <input aria-label="การดูแลปฐมพยาบาล" value={aidDraft.care} maxLength={200} onChange={event => setAidDraft(current => ({ ...current, care: event.target.value }))} style={fieldStyle} />
                      </div>
                      <button type="button" onClick={addAid} style={{ ...quietButton, width: "fit-content" }}>เพิ่มรายการ</button>
                    </div>
                  )}
                  {(termData.aid || []).map(entry => {
                    const student = students.find(item => item.id === entry.student_id);
                    return (
                      <div key={entry.id} style={{ display: "grid", gap: "0.15rem", borderTop: "1px solid #f1f5f9", padding: "0.4rem 0", minWidth: 0 }}>
                        <div style={{ fontWeight: 800 }}>{formatThai(entry.date)} · {student ? `${student.number} ${studentLabel(student)}` : "ไม่พบชื่อในห้องนี้"}</div>
                        <div style={{ color: "#334155", wordBreak: "break-word" }}>{entry.what} · {entry.care}</div>
                      </div>
                    );
                  })}
                </SectionFold>
                {!readOnly && <SaveButton saving={saving} label="บันทึกสุขภาพ" onClick={save} />}
              </>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}

function MilkPage({ employees, currentUser }) {
  const access = useAcademicAccess(employees, currentUser);
  const [doc, setDoc] = useState({ version: 1, days: {} });
  const [rowId, setRowId] = useState(null);
  const [date, setDate] = useState(todayISO);
  const [marks, setMarks] = useState({});
  const [reasons, setReasons] = useState({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [pageError, setPageError] = useState("");
  const readOnly = access.isAdmin;

  useEffect(() => {
    let active = true;
    if (!access.teacherId) return undefined;
    (async () => {
      try {
        const rows = await fetchMarker(PERIOD.milk, access.teacherId);
        if (!active) return;
        const loaded = parseMilk(rows[0]?.subject);
        const today = todayISO();
        setRowId(rows[0]?.id || null);
        setDoc(loaded);
        setDate(today);
        setMarks({ ...(loaded.days[today]?.marks || {}) });
        setReasons({ ...(loaded.days[today]?.reasons || {}) });
      } catch (err) {
        if (active) setPageError(err.message || "โหลดบันทึกนมไม่สำเร็จ");
      }
    })();
    return () => { active = false; };
  }, [access.teacherId]);

  const context = roomContext(access.roll, access.duty);
  const joined = access.assign.doc.milk_joined;
  const covered = context.roomLevel === "อนุบาล" || context.roomLevel === "ประถม";

  const changeDate = (next) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(next) || next > todayISO()) return;
    const saved = doc.days[date] || { marks: {}, reasons: {} };
    const dirty = JSON.stringify(marks) !== JSON.stringify(saved.marks || {}) || JSON.stringify(reasons) !== JSON.stringify(saved.reasons || {});
    if (dirty && !window.confirm("การเช็คนมที่ยังไม่บันทึกจะไม่ถูกเก็บ เปลี่ยนวันเลยหรือไม่")) return;
    setDate(next);
    setMarks({ ...(doc.days[next]?.marks || {}) });
    setReasons({ ...(doc.days[next]?.reasons || {}) });
    setMessage("");
  };

  const saveFlag = async (value) => {
    const previous = access.assign.doc.milk_joined;
    access.setAssign(current => ({ ...current, doc: { ...current.doc, milk_joined: value } }));
    setSaving(true);
    setPageError("");
    try {
      const rows = await fetchMarker(PERIOD.assign, null);
      const row = rows[0] || null;
      const latest = parseAssignment(row?.subject);
      const next = { ...latest, milk_joined: value, updated_at: new Date().toISOString() };
      const id = await writeMarker(PERIOD.assign, row?.employee_id || currentUser.id, next, row?.id || null, true);
      access.setAssign({ row: { ...(row || {}), id, employee_id: row?.employee_id || currentUser.id }, doc: next });
      setMessage(value ? "เปิดบันทึกนมโรงเรียนแล้ว" : "ปิดบันทึกนมโรงเรียนแล้ว");
    } catch (err) {
      access.setAssign(current => ({ ...current, doc: { ...current.doc, milk_joined: previous } }));
      setPageError(err.message || "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  };

  const saveDay = async () => {
    const cleanMarks = {};
    const cleanReasons = {};
    access.roll.students.forEach(student => {
      if (marks[student.id] === "yes" || marks[student.id] === "no") cleanMarks[student.id] = marks[student.id];
      if (marks[student.id] === "no" && clip(reasons[student.id], 80)) cleanReasons[student.id] = clip(reasons[student.id], 80);
    });
    if (Object.keys(cleanMarks).length === 0) { setPageError("ติ๊กผู้ได้รับนมอย่างน้อย 1 คน"); return; }
    setSaving(true);
    setPageError("");
    try {
      const days = pruneDays({ ...doc.days, [date]: { saved_at: new Date().toISOString(), marks: cleanMarks, reasons: cleanReasons } });
      const next = { version: 1, days };
      const id = await writeMarker(PERIOD.milk, access.teacherId, next, rowId);
      setRowId(id);
      setDoc(next);
      setMarks(cleanMarks);
      setReasons(cleanReasons);
      setMessage("บันทึกผู้ดื่มนมวันนี้แล้ว");
    } catch (err) {
      setPageError(err.message || "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  };

  if (access.loading) return <Card><div style={{ color: "#64748b" }}>กำลังโหลดบันทึกนม...</div></Card>;
  return (
    <div style={{ display: "grid", gap: "0.8rem", minWidth: 0 }}>
      {(access.error || pageError) && <ErrorBox>{access.error || pageError}</ErrorBox>}
      {message && <OkNote>{message}</OkNote>}
      <Card>
        <div style={{ display: "grid", gap: "0.65rem" }}>
          <div style={{ fontWeight: 800, fontSize: "1.05rem" }}>นมโรงเรียน</div>
          {access.isAdmin ? (
            <label style={{ display: "flex", gap: "0.5rem", alignItems: "center", fontWeight: 800 }}>
              <input aria-label="โรงเรียนนี้เบิกนม" type="checkbox" checked={joined} onChange={event => saveFlag(event.target.checked)} />
              โรงเรียนนี้เบิกนม อ.1–ป.6
            </label>
          ) : <div style={{ fontWeight: 800 }}>{joined ? "โรงเรียนเปิดบันทึกนมแล้ว" : "ฝ่ายวิชาการยังไม่ได้เปิดบันทึกนม"}</div>}
        </div>
      </Card>
      {access.isAdmin && <TeacherPick teachers={access.teachers} value={access.teacherId} onChange={access.pickTeacher} />}
      {joined && access.teacherId && (
        <Card>
          <div style={{ display: "grid", gap: "0.7rem", minWidth: 0 }}>
            <RoomHint show={access.isAdmin} className={context.className} />
            {context.blocked ? <WarnNote>{blockText(context, access.duty)}</WarnNote> : !covered ? <WarnNote>นมโรงเรียนของเอกชนที่เข้าร่วมครอบคลุมอนุบาลถึงประถม ไม่รวมมัธยม</WarnNote> : (
              <>
                <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", alignItems: "center" }}>
                  <button type="button" aria-label="วันก่อน" onClick={() => changeDate(shiftDate(date, -1))} style={quietButton}>ก่อนหน้า</button>
                  <input aria-label="วันที่บันทึกนม" type="date" max={todayISO()} value={date} onChange={event => changeDate(event.target.value)} style={{ ...fieldStyle, width: "auto", flex: "1 1 150px" }} />
                  <button type="button" aria-label="วันถัดไป" disabled={date >= todayISO()} onClick={() => changeDate(shiftDate(date, 1))} style={{ ...quietButton, opacity: date >= todayISO() ? 0.45 : 1 }}>ถัดไป</button>
                </div>
                <div style={{ color: "#64748b" }}>{formatThai(date)} · {access.roll.students.length} คน</div>
                {!readOnly && <button type="button" onClick={() => {
                  const next = {};
                  access.roll.students.forEach(student => { next[student.id] = "yes"; });
                  setMarks(next);
                }} style={{ ...quietButton, width: "100%", maxWidth: 280 }}>ได้รับทั้งหมด</button>}
                {access.roll.students.map(student => (
                  <div key={student.id} style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 3.5rem 3.5rem", gap: "0.15rem", alignItems: "center", minWidth: 0, borderTop: "1px solid #f1f5f9", padding: "0.35rem 0" }}>
                    <div style={{ minWidth: 0, fontWeight: 800, wordBreak: "break-word" }}><span style={{ color: "#64748b", marginRight: "0.3rem" }}>{student.number}</span>{studentLabel(student)}</div>
                    {[["yes", "ได้รับ"], ["no", "ไม่ได้"]].map(([value, label]) => {
                      const active = marks[student.id] === value;
                      return (
                        <button key={value} type="button" aria-pressed={active} aria-label={`${label} นมเลขที่ ${student.number}`} disabled={readOnly} onClick={() => setMarks(current => ({ ...current, [student.id]: value }))} style={{ boxSizing: "border-box", width: "100%", minWidth: 0, minHeight: 44, borderRadius: 10, border: `2px solid ${active ? "#1d4ed8" : "#e2e8f0"}`, background: active ? "#dbeafe" : "#fff", color: active ? "#1d4ed8" : "#64748b", fontWeight: 800, fontSize: "0.68rem", fontFamily: "inherit", padding: 0 }}>
                          {label}
                        </button>
                      );
                    })}
                    <input aria-label={`เหตุผลนมเลขที่ ${student.number}`} disabled={readOnly || marks[student.id] !== "no"} value={reasons[student.id] || ""} maxLength={80} onChange={event => setReasons(current => ({ ...current, [student.id]: event.target.value.slice(0, 80) }))} style={{ ...fieldStyle, gridColumn: "1 / -1", background: readOnly || marks[student.id] !== "no" ? "#f8fafc" : "#fff" }} />
                  </div>
                ))}
                {!readOnly && <SaveButton saving={saving} label="บันทึกผู้ดื่มนม" onClick={saveDay} />}
                {readOnly && <div style={{ color: "#64748b" }}>ดูอย่างเดียว</div>}
              </>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}

function LunchPage({ employees, currentUser }) {
  const access = useAcademicAccess(employees, currentUser);
  const [term, setTerm] = useState(currentTerm);
  const [doc, setDoc] = useState({ version: 1, terms: {} });
  const [growth, setGrowth] = useState({ version: 1, terms: {} });
  const [rowId, setRowId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [pageError, setPageError] = useState("");
  const [pickId, setPickId] = useState("");
  const [pickReason, setPickReason] = useState("จ่ายไม่ได้");
  const readOnly = access.isAdmin;
  const key = termKey(term);

  useEffect(() => {
    let active = true;
    if (!access.teacherId) return undefined;
    (async () => {
      try {
        const [lunchRows, growthRows] = await Promise.all([
          fetchMarker(PERIOD.lunch, access.teacherId),
          fetchMarker(PERIOD.growth, access.teacherId),
        ]);
        if (!active) return;
        setRowId(lunchRows[0]?.id || null);
        setDoc(parseLunch(lunchRows[0]?.subject));
        setGrowth(parseGrowth(growthRows[0]?.subject));
      } catch (err) {
        if (active) setPageError(err.message || "โหลดรายการอาหารไม่สำเร็จ");
      }
    })();
    return () => { active = false; };
  }, [access.teacherId]);

  const context = roomContext(access.roll, access.duty);
  const joined = access.assign.doc.lunch_joined;
  const listed = doc.terms[key] || {};

  const saveFlag = async (value) => {
    const previous = access.assign.doc.lunch_joined;
    access.setAssign(current => ({ ...current, doc: { ...current.doc, lunch_joined: value } }));
    setSaving(true);
    setPageError("");
    try {
      const rows = await fetchMarker(PERIOD.assign, null);
      const row = rows[0] || null;
      const latest = parseAssignment(row?.subject);
      const next = { ...latest, lunch_joined: value, updated_at: new Date().toISOString() };
      const id = await writeMarker(PERIOD.assign, row?.employee_id || currentUser.id, next, row?.id || null, true);
      access.setAssign({ row: { ...(row || {}), id, employee_id: row?.employee_id || currentUser.id }, doc: next });
      setMessage(value ? "เปิดรายการเบิกอาหารกลางวันแล้ว" : "ปิดรายการเบิกอาหารกลางวันแล้ว");
    } catch (err) {
      access.setAssign(current => ({ ...current, doc: { ...current.doc, lunch_joined: previous } }));
      setPageError(err.message || "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  };

  const save = async (nextListed, success) => {
    setSaving(true);
    setPageError("");
    setMessage("");
    try {
      const next = { version: 1, terms: { ...doc.terms, [key]: nextListed } };
      const id = await writeMarker(PERIOD.lunch, access.teacherId, next, rowId);
      setRowId(id);
      setDoc(next);
      setMessage(success);
    } catch (err) {
      setPageError(err.message || "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  };

  const addOne = () => {
    if (!pickId) { setPageError("เลือกนักเรียนก่อน"); return; }
    const next = { ...listed, [pickId]: { reason: pickReason, note: listed[pickId]?.note || "" } };
    save(next, "เพิ่มในรายการเบิกแล้ว");
  };

  const pullOffChart = () => {
    const measures = growth.terms[key] || {};
    const next = { ...listed };
    let added = 0;
    access.roll.students.forEach(student => {
      const reason = subsidyReason(context.roomLevel, measures[student.id] || emptyMeasure());
      if (!reason || next[student.id]) return;
      next[student.id] = { reason, note: "" };
      added += 1;
    });
    if (added === 0) { setPageError("ภาคนี้ยังไม่มีผลชั่งที่เข้าเกณฑ์ผอม เตี้ย หรืออ้วน"); return; }
    save(next, `ดึงเด็กนอกเกณฑ์แล้ว ${added} คน`);
  };

  if (access.loading) return <Card><div style={{ color: "#64748b" }}>กำลังโหลดรายการอาหาร...</div></Card>;
  const rows = access.roll.students.filter(student => listed[student.id]);
  return (
    <div style={{ display: "grid", gap: "0.8rem", minWidth: 0 }}>
      {(access.error || pageError) && <ErrorBox>{access.error || pageError}</ErrorBox>}
      {message && <OkNote>{message}</OkNote>}
      <Card>
        <div style={{ display: "grid", gap: "0.65rem" }}>
          <div style={{ fontWeight: 800, fontSize: "1.05rem" }}>อาหารกลางวัน</div>
          {access.isAdmin ? (
            <label style={{ display: "flex", gap: "0.5rem", alignItems: "center", fontWeight: 800 }}>
              <input aria-label="โรงเรียนนี้เบิกอาหารกลางวัน" type="checkbox" checked={joined} onChange={event => saveFlag(event.target.checked)} />
              โรงเรียนนี้ทำรายการเบิกอาหารกลางวัน
            </label>
          ) : <div style={{ fontWeight: 800 }}>{joined ? "โรงเรียนเปิดรายการเบิกแล้ว" : "ฝ่ายวิชาการยังไม่ได้เปิดรายการเบิก"}</div>}
        </div>
      </Card>
      {joined && access.isAdmin && <TeacherPick teachers={access.teachers} value={access.teacherId} onChange={access.pickTeacher} />}
      {joined && access.teacherId && (
        <Card>
          <div style={{ display: "grid", gap: "0.7rem", minWidth: 0 }}>
            <RoomHint show={access.isAdmin} className={context.className} />
            {context.blocked ? <WarnNote>{blockText(context, access.duty)}</WarnNote> : (
              <>
                <TermBar term={term} onChange={setTerm} />
                <div style={{ fontWeight: 800 }}>ในรายการ {rows.length} คน จากห้อง {access.roll.students.length} คน</div>
                {!readOnly && (
                  <>
                    <button type="button" onClick={pullOffChart} disabled={saving} style={{ ...quietButton, width: "100%", maxWidth: 360 }}>ดึงเด็กที่ผลชั่งนอกเกณฑ์ในภาคนี้</button>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 160px), 1fr))", gap: "0.5rem" }}>
                      <select aria-label="เพิ่มนักเรียนเบิกอาหาร" value={pickId} onChange={event => setPickId(event.target.value)} style={fieldStyle}>
                        <option value="">เลือกนักเรียน</option>
                        {access.roll.students.filter(student => !listed[student.id]).map(student => <option key={student.id} value={student.id}>{student.number} {studentLabel(student)}</option>)}
                      </select>
                      <select aria-label="เหตุผลการเบิก" value={pickReason} onChange={event => setPickReason(event.target.value)} style={fieldStyle}>
                        {LUNCH_REASONS.map(reason => <option key={reason} value={reason}>{reason === "จ่ายไม่ได้" ? "จ่ายค่าอาหารไม่ได้" : reason}</option>)}
                      </select>
                    </div>
                    <button type="button" onClick={addOne} disabled={saving} style={{ ...quietButton, width: "fit-content" }}>เพิ่มในรายการเบิก</button>
                  </>
                )}
                {rows.length === 0 && <div style={{ color: "#94a3b8" }}>ยังไม่มีรายชื่อสำหรับเบิก</div>}
                {rows.map(student => (
                  <div key={student.id} style={{ display: "grid", gap: "0.35rem", borderTop: "1px solid #f1f5f9", paddingTop: "0.45rem", minWidth: 0 }}>
                    <div style={{ fontWeight: 800, wordBreak: "break-word" }}>{student.number} {studentLabel(student)}</div>
                    <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", alignItems: "center" }}>
                      <span style={{ background: "#fff7ed", color: "#c2410c", fontWeight: 800, borderRadius: 20, padding: "0.2rem 0.55rem" }}>{listed[student.id].reason === "จ่ายไม่ได้" ? "จ่ายค่าอาหารไม่ได้" : listed[student.id].reason}</span>
                      {!readOnly && <button type="button" onClick={() => {
                        const next = { ...listed };
                        delete next[student.id];
                        save(next, "นำออกจากรายการแล้ว");
                      }} style={quietButton}>นำออก</button>}
                    </div>
                  </div>
                ))}
                {readOnly && <div style={{ color: "#64748b" }}>ดูอย่างเดียว</div>}
              </>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}

function ScorePage({ employees, currentUser }) {
  const access = useAcademicAccess(employees, currentUser);
  const [term, setTerm] = useState(currentTerm);
  const [doc, setDoc] = useState({ version: 1, terms: {} });
  const [rowId, setRowId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [pageError, setPageError] = useState("");
  const [subject, setSubject] = useState("");
  const [openId, setOpenId] = useState("");
  const readOnly = access.isAdmin;

  useEffect(() => {
    let active = true;
    if (!access.teacherId) return undefined;
    (async () => {
      try {
        const rows = await fetchMarker(PERIOD.score, access.teacherId);
        if (!active) return;
        setRowId(rows[0]?.id || null);
        setDoc(parseScore(rows[0]?.subject));
        setOpenId("");
      } catch (err) {
        if (active) setPageError(err.message || "โหลด ปพ.5 ไม่สำเร็จ");
      }
    })();
    return () => { active = false; };
  }, [access.teacherId]);

  const context = roomContext(access.roll, access.duty);
  const subjects = subjectsForRoom(context.roomGrade);
  useEffect(() => {
    setSubject(current => subjects.includes(current) ? current : (subjects[0] || ""));
  }, [access.teacherId, context.roomGrade, subjects.join("|")]);

  const key = termKey(term);
  const bookKey = `${context.roomGrade}\n${subject}`;
  const book = doc.terms[key]?.[bookKey] || { students: {} };
  const kinderRoom = context.roomLevel === "อนุบาล";

  const update = (id, patch) => {
    setDoc(current => {
      const termBooks = { ...(current.terms[key] || {}) };
      const currentBook = termBooks[bookKey] || { students: {} };
      termBooks[bookKey] = { students: { ...currentBook.students, [id]: { ...cleanScore(currentBook.students[id]), ...patch } } };
      return { ...current, terms: { ...current.terms, [key]: termBooks } };
    });
  };

  const save = async () => {
    if (readOnly || !subject) return;
    setSaving(true);
    setPageError("");
    setMessage("");
    try {
      const students = {};
      access.roll.students.forEach(student => {
        const item = cleanScore(book.students?.[student.id] || {});
        if (!ONET_GRADES.has(context.roomGrade)) item.onet = "";
        students[student.id] = item;
      });
      const termBooks = { ...(doc.terms[key] || {}), [bookKey]: { students } };
      const next = { version: 1, terms: { ...doc.terms, [key]: termBooks } };
      const id = await writeMarker(PERIOD.score, access.teacherId, next, rowId);
      setRowId(id);
      setDoc(parseScore(JSON.stringify(next)));
      setMessage("บันทึก ปพ.5 แล้ว");
    } catch (err) {
      setPageError(err.message || "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  };

  if (access.loading) return <Card><div style={{ color: "#64748b" }}>กำลังโหลด ปพ.5...</div></Card>;
  return (
    <div style={{ display: "grid", gap: "0.8rem", minWidth: 0 }}>
      {(access.error || pageError) && <ErrorBox>{access.error || pageError}</ErrorBox>}
      {message && <OkNote>{message}</OkNote>}
      {access.isAdmin && <TeacherPick teachers={access.teachers} value={access.teacherId} onChange={access.pickTeacher} />}
      {access.isAdmin && !access.teacherId ? <WarnNote>เลือกครูเพื่อดู ปพ.5</WarnNote> : access.teacherId && (
        <Card>
          <div style={{ display: "grid", gap: "0.7rem", minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: "1.05rem" }}>ปพ.5 เวลาเรียนและผลการเรียน</div>
            <RoomHint show={access.isAdmin} className={context.className} />
            {context.blocked ? <WarnNote>{blockText(context, access.duty)}</WarnNote> : kinderRoom ? <WarnNote>อนุบาลไม่บันทึกคะแนนรายวิชา ใช้แท็บพัฒนาการ</WarnNote> : (
              <>
                <TermBar term={term} onChange={setTerm} />
                <div>
                  <FieldLabel>วิชา</FieldLabel>
                  <select aria-label="วิชา ปพ.5" value={subject} onChange={event => setSubject(event.target.value)} style={fieldStyle}>
                    {subjects.map(item => <option key={item} value={item}>{item}</option>)}
                  </select>
                </div>
                {!readOnly && <SaveButton saving={saving} label="บันทึก ปพ.5" onClick={save} />}
                {readOnly && <div style={{ color: "#64748b" }}>ดูอย่างเดียว</div>}
                {access.roll.students.map(student => {
                  const item = { ...cleanScore(book.students?.[student.id] || {}) };
                  const open = openId === student.id;
                  return (
                    <div key={student.id} style={{ borderTop: "1px solid #f1f5f9", minWidth: 0 }}>
                      <button type="button" aria-expanded={open} onClick={() => setOpenId(open ? "" : student.id)} style={{ width: "100%", minHeight: 48, display: "flex", gap: "0.4rem", alignItems: "center", border: "none", background: "transparent", fontFamily: "inherit", textAlign: "left", cursor: "pointer" }}>
                        <span style={{ fontWeight: 800, color: "#64748b" }}>{student.number}</span>
                        <span style={{ fontWeight: 800, flex: 1, minWidth: 0, wordBreak: "break-word" }}>{studentLabel(student)}</span>
                        <span style={{ color: "#64748b", fontSize: "0.78rem", fontWeight: 700 }}>{item.grade ? `ผล ${item.grade}` : "ยังไม่กรอก"}</span>
                      </button>
                      {open && (
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 140px), 1fr))", gap: "0.55rem", paddingBottom: "0.7rem" }}>
                          <div>
                            <FieldLabel>เวลาเรียน (ชม.)</FieldLabel>
                            <input aria-label={`เวลาเรียนเลขที่ ${student.number}`} inputMode="numeric" disabled={readOnly} value={item.hours} onChange={event => {
                              const hours = event.target.value.replace(/\D/g, "").slice(0, 3);
                              update(student.id, { hours });
                            }} style={{ ...fieldStyle, background: readOnly ? "#f8fafc" : "#fff" }} />
                          </div>
                          <div>
                            <FieldLabel>คะแนนระหว่างภาค</FieldLabel>
                            <input aria-label={`คะแนนระหว่างภาคเลขที่ ${student.number}`} inputMode="decimal" disabled={readOnly} value={item.mid} onChange={event => {
                              const next = decimalDraft(event.target.value);
                              if (next !== null) update(student.id, { mid: next });
                            }} style={{ ...fieldStyle, background: readOnly ? "#f8fafc" : "#fff" }} />
                          </div>
                          <div>
                            <FieldLabel>คะแนนปลายภาค</FieldLabel>
                            <input aria-label={`คะแนนปลายภาคเลขที่ ${student.number}`} inputMode="decimal" disabled={readOnly} value={item.final} onChange={event => {
                              const next = decimalDraft(event.target.value);
                              if (next !== null) update(student.id, { final: next });
                            }} style={{ ...fieldStyle, background: readOnly ? "#f8fafc" : "#fff" }} />
                          </div>
                          <div>
                            <FieldLabel>ผลการเรียน</FieldLabel>
                            <input aria-label={`ผลการเรียนเลขที่ ${student.number}`} disabled={readOnly} value={item.grade} maxLength={12} onChange={event => update(student.id, { grade: event.target.value.slice(0, 12) })} style={{ ...fieldStyle, background: readOnly ? "#f8fafc" : "#fff" }} />
                          </div>
                          {ONET_GRADES.has(context.roomGrade) && (
                            <div>
                              <FieldLabel>O-NET ไม่นำไปเฉลี่ย</FieldLabel>
                              <input aria-label={`ONET เลขที่ ${student.number}`} inputMode="decimal" disabled={readOnly} value={item.onet} onChange={event => {
                                const next = decimalDraft(event.target.value);
                                if (next !== null) update(student.id, { onet: next });
                              }} style={{ ...fieldStyle, background: readOnly ? "#f8fafc" : "#fff" }} />
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
                {!readOnly && <SaveButton saving={saving} label="บันทึก ปพ.5" onClick={save} />}
              </>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}

function pickOne(value, options) {
  return options.includes(value) ? value : "";
}

function cleanKeyed(raw, items, options) {
  const out = {};
  items.forEach(([key]) => {
    const value = pickOne(raw?.[key], options);
    if (value) out[key] = value;
  });
  return out;
}

function cleanCodes(list) {
  const out = [];
  (Array.isArray(list) ? list : []).forEach(item => {
    const text = clip(item, 30);
    if (text && !out.includes(text)) out.push(text);
  });
  return out.slice(0, 20);
}

function parseIndicator(subject) {
  try {
    const parsed = JSON.parse(subject || "{}");
    const terms = {};
    const source = parsed?.terms && typeof parsed.terms === "object" ? parsed.terms : {};
    Object.entries(source).forEach(([key, books]) => {
      if (!/^\d{4}-[12]$/.test(key) || !books || typeof books !== "object" || Array.isArray(books)) return;
      const cleanBooks = {};
      Object.entries(books).forEach(([bookKey, book]) => {
        if (!bookKey.includes("\n") || !book || typeof book !== "object") return;
        const codes = cleanCodes(book.codes);
        const allowed = new Set(codes);
        const students = {};
        const rawStudents = book.students && typeof book.students === "object" ? book.students : {};
        Object.entries(rawStudents).forEach(([id, marks]) => {
          if (!id || !marks || typeof marks !== "object") return;
          const clean = {};
          allowed.forEach(code => {
            const value = pickOne(marks[code], PASS_FAIL);
            if (value) clean[code] = value;
          });
          students[id] = clean;
        });
        cleanBooks[bookKey] = { codes, students };
      });
      terms[key] = cleanBooks;
    });
    return { version: 1, terms };
  } catch {
    return { version: 1, terms: {} };
  }
}

function cleanQuality(raw) {
  const traits = cleanKeyed(raw?.traits, TRAIT_ITEMS, QUALITY_LEVELS);
  const skills = cleanKeyed(raw?.skills, SKILL_ITEMS, QUALITY_LEVELS);
  const values = cleanKeyed(raw?.values, VALUE_ITEMS, PASS_FAIL);
  const read = pickOne(raw?.read, QUALITY_LEVELS);
  const out = {};
  if (Object.keys(traits).length) out.traits = traits;
  if (read) out.read = read;
  if (Object.keys(skills).length) out.skills = skills;
  if (Object.keys(values).length) out.values = values;
  return out;
}

function cleanActivity(raw) {
  const out = {};
  const guide = pickOne(raw?.guide, PASS_FAIL);
  const scout = pickOne(raw?.scout, PASS_FAIL);
  const club = clip(raw?.club, 40);
  const clubResult = pickOne(raw?.clubResult, PASS_FAIL);
  const social = pickOne(raw?.social, PASS_FAIL);
  if (guide) out.guide = guide;
  if (scout) out.scout = scout;
  if (club) out.club = club;
  if (clubResult) out.clubResult = clubResult;
  if (social) out.social = social;
  return out;
}

function cleanDevelop(raw) {
  return cleanKeyed(raw, DEV_ITEMS, DEV_LEVELS);
}

function parseRoomBook(subject, cleanStudent) {
  try {
    const parsed = JSON.parse(subject || "{}");
    const terms = {};
    const source = parsed?.terms && typeof parsed.terms === "object" ? parsed.terms : {};
    Object.entries(source).forEach(([key, value]) => {
      if (!/^\d{4}-[12]$/.test(key) || !value || typeof value !== "object") return;
      const students = {};
      const rawStudents = value.students && typeof value.students === "object" ? value.students : {};
      Object.entries(rawStudents).forEach(([id, item]) => {
        if (id) students[id] = cleanStudent(item);
      });
      terms[key] = { students };
    });
    return { version: 1, terms };
  } catch {
    return { version: 1, terms: {} };
  }
}

function parseQuality(subject) {
  return parseRoomBook(subject, cleanQuality);
}

function parseActivity(subject) {
  return parseRoomBook(subject, cleanActivity);
}

function parseDevelop(subject) {
  return parseRoomBook(subject, cleanDevelop);
}

function choiceTone(option) {
  if (option === "ไม่ผ่าน" || option === "ควรเสริม") return "bad";
  if (option === "ดี" || option === "ดีเยี่ยม") return "good";
  return "mid";
}

function choiceStyle(on, option) {
  if (!on) return { ...quietButton, minHeight: 40, background: "#fff" };
  const tone = choiceTone(option);
  if (tone === "bad") return { ...quietButton, minHeight: 40, background: "#fef2f2", color: "#b91c1c", borderColor: "#fca5a5" };
  if (tone === "good") return { ...quietButton, minHeight: 40, background: "#ecfdf5", color: "#166534", borderColor: "#86efac" };
  return { ...quietButton, minHeight: 40, background: "#eff6ff", color: "#1d4ed8", borderColor: "#93c5fd" };
}

function ChoiceRow({ label, value, options, onChange, disabled }) {
  return (
    <div style={{ display: "grid", gap: "0.3rem", minWidth: 0 }}>
      <div style={{ fontWeight: 700, color: "#334155", lineHeight: 1.45, wordBreak: "break-word" }}>{label}</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.3rem" }}>
        {options.map(option => {
          const on = value === option;
          return (
            <button key={option} type="button" aria-pressed={on} aria-label={`${label} ${option}`} disabled={disabled} onClick={() => onChange(on ? "" : option)} style={choiceStyle(on, option)}>
              {option}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function FoldStudent({ open, onToggle, number, name, summary, children }) {
  return (
    <div style={{ borderTop: "1px solid #f1f5f9", minWidth: 0 }}>
      <button type="button" aria-expanded={open} onClick={onToggle} style={{ width: "100%", minHeight: 48, display: "flex", gap: "0.4rem", alignItems: "center", border: "none", background: "transparent", fontFamily: "inherit", textAlign: "left", cursor: "pointer", minWidth: 0 }}>
        <span style={{ fontWeight: 800, color: "#64748b", flex: "0 0 auto" }}>{number}</span>
        <span style={{ fontWeight: 800, flex: "1 1 auto", minWidth: 0, wordBreak: "break-word" }}>{name}</span>
        <span style={{ color: "#64748b", fontSize: "0.78rem", fontWeight: 700, flex: "0 0 auto" }}>{summary}</span>
        {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>
      {open && <div style={{ display: "grid", gap: "0.7rem", paddingBottom: "0.85rem", minWidth: 0 }}>{children}</div>}
    </div>
  );
}

function useBook(teacherId, period, parse) {
  const [doc, setDoc] = useState(() => parse(""));
  const [rowId, setRowId] = useState(null);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [pageError, setPageError] = useState("");
  const [openId, setOpenId] = useState("");

  useEffect(() => {
    let active = true;
    setReady(false);
    setDoc(parse(""));
    setRowId(null);
    setOpenId("");
    if (!teacherId) {
      setReady(true);
      return undefined;
    }
    (async () => {
      try {
        const rows = await fetchMarker(period, teacherId);
        if (!active) return;
        setRowId(rows[0]?.id || null);
        setDoc(parse(rows[0]?.subject));
        setMessage("");
        setPageError("");
      } catch (err) {
        if (active) setPageError(err.message || "โหลดไม่สำเร็จ");
      } finally {
        if (active) setReady(true);
      }
    })();
    return () => { active = false; };
  }, [teacherId, period, parse]);

  return { doc, setDoc, rowId, setRowId, ready, saving, setSaving, message, setMessage, pageError, setPageError, openId, setOpenId };
}

function BookFrame({ access, record, loadingText, pickHint, children }) {
  if (access.loading) return <Card><div style={{ color: "#64748b" }}>{loadingText}</div></Card>;
  return (
    <div style={{ display: "grid", gap: "0.8rem", minWidth: 0 }}>
      {(access.error || record.pageError) && <ErrorBox>{access.error || record.pageError}</ErrorBox>}
      {record.message && <OkNote>{record.message}</OkNote>}
      {access.isAdmin && <TeacherPick teachers={access.teachers} value={access.teacherId} onChange={access.pickTeacher} />}
      {access.isAdmin && !access.teacherId ? <WarnNote>{pickHint}</WarnNote> : access.teacherId && !record.ready ? <Card><div style={{ color: "#64748b" }}>{loadingText}</div></Card> : access.teacherId ? children : null}
    </div>
  );
}

async function saveBook(record, period, teacherId, next, parse, success) {
  record.setSaving(true);
  record.setPageError("");
  record.setMessage("");
  try {
    const id = await writeMarker(period, teacherId, next, record.rowId);
    record.setRowId(id);
    record.setDoc(parse(JSON.stringify(next)));
    record.setMessage(success);
  } catch (err) {
    record.setPageError(err.message || "บันทึกไม่สำเร็จ");
  } finally {
    record.setSaving(false);
  }
}

function putRoomStudent(record, key, studentId, item) {
  record.setDoc(current => {
    const termData = current.terms[key] || { students: {} };
    return { ...current, terms: { ...current.terms, [key]: { students: { ...termData.students, [studentId]: item } } } };
  });
}

function IndicatorPage({ employees, currentUser }) {
  const access = useAcademicAccess(employees, currentUser);
  const record = useBook(access.teacherId, PERIOD.indicator, parseIndicator);
  const [term, setTerm] = useState(currentTerm);
  const [subject, setSubject] = useState("");
  const [draft, setDraft] = useState("");
  const readOnly = access.isAdmin;
  const context = roomContext(access.roll, access.duty);
  const subjects = subjectsForRoom(context.roomGrade);
  const schoolRoom = context.roomLevel === "ประถม" || context.roomLevel === "มัธยม";

  useEffect(() => {
    setSubject(current => (subjects.includes(current) ? current : (subjects[0] || "")));
  }, [access.teacherId, context.roomGrade, subjects.join("|")]);

  const key = termKey(term);
  const bookKey = `${context.roomGrade}\n${subject}`;
  const book = record.doc.terms[key]?.[bookKey] || { codes: [], students: {} };

  const setBook = (nextBook) => {
    record.setDoc(current => {
      const termBooks = { ...(current.terms[key] || {}) };
      termBooks[bookKey] = nextBook;
      return { ...current, terms: { ...current.terms, [key]: termBooks } };
    });
    record.setMessage("");
  };

  const addCode = () => {
    const text = clip(draft, 30);
    if (!text || book.codes.includes(text) || book.codes.length >= 20) return;
    setBook({ ...book, codes: [...book.codes, text] });
    setDraft("");
  };

  const save = () => {
    if (readOnly || !subject) return;
    const codes = cleanCodes(book.codes);
    const allowed = new Set(codes);
    const students = {};
    access.roll.students.forEach(student => {
      const marks = {};
      const raw = book.students?.[student.id] || {};
      allowed.forEach(code => {
        const value = pickOne(raw[code], PASS_FAIL);
        if (value) marks[code] = value;
      });
      students[student.id] = marks;
    });
    const termBooks = { ...(record.doc.terms[key] || {}), [bookKey]: { codes, students } };
    saveBook(record, PERIOD.indicator, access.teacherId, { version: 1, terms: { ...record.doc.terms, [key]: termBooks } }, parseIndicator, "บันทึกตัวชี้วัดแล้ว");
  };

  return (
    <BookFrame access={access} record={record} loadingText="กำลังโหลดตัวชี้วัด..." pickHint="เลือกครูเพื่อดูตัวชี้วัด">
      <Card>
        <div style={{ display: "grid", gap: "0.7rem", minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: "1.05rem" }}>ติ๊กตัวชี้วัดรายวิชา</div>
          <RoomHint show={access.isAdmin} className={context.className} />
          {context.blocked ? <WarnNote>{blockText(context, access.duty)}</WarnNote> : !schoolRoom ? <WarnNote>อนุบาลไม่ติ๊กตัวชี้วัดรายวิชา ใช้แท็บพัฒนาการ</WarnNote> : (
            <>
              <TermBar term={term} onChange={setTerm} />
              {access.roll.students.length === 0 && <WarnNote>ห้องนี้ยังไม่มีรายชื่อ ฝ่ายวิชาการอัป Excel ในแท็บเช็คชื่อ</WarnNote>}
              <div>
                <FieldLabel>วิชา</FieldLabel>
                <select aria-label="วิชาตัวชี้วัด" value={subject} onChange={event => setSubject(event.target.value)} style={fieldStyle}>
                  {subjects.map(item => <option key={item} value={item}>{item}</option>)}
                </select>
              </div>
              <div style={{ display: "grid", gap: "0.45rem" }}>
                <FieldLabel>รหัสตัวชี้วัด</FieldLabel>
                {book.codes.map(code => (
                  <div key={code} style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem", alignItems: "center", minWidth: 0 }}>
                    <span style={{ fontWeight: 800, wordBreak: "break-word" }}>{code}</span>
                    {!readOnly && (
                      <>
                        <button type="button" aria-label={`ผ่านทั้งห้อง ${code}`} onClick={() => {
                          const students = { ...book.students };
                          access.roll.students.forEach(student => { students[student.id] = { ...(students[student.id] || {}), [code]: "ผ่าน" }; });
                          setBook({ ...book, students });
                        }} style={quietButton}>ผ่านทั้งห้อง</button>
                        <button type="button" aria-label={`ลบรหัส ${code}`} onClick={() => {
                          const students = {};
                          Object.entries(book.students || {}).forEach(([id, marks]) => {
                            const next = { ...marks };
                            delete next[code];
                            students[id] = next;
                          });
                          setBook({ codes: book.codes.filter(item => item !== code), students });
                        }} style={quietButton}>ลบ</button>
                      </>
                    )}
                  </div>
                ))}
                {!readOnly && book.codes.length < 20 && (
                  <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
                    <input aria-label="เพิ่มรหัสตัวชี้วัด" value={draft} maxLength={30} onChange={event => setDraft(event.target.value)} onKeyDown={event => {
                      if (event.key !== "Enter") return;
                      event.preventDefault();
                      addCode();
                    }} style={{ ...fieldStyle, flex: "1 1 160px" }} />
                    <button type="button" onClick={addCode} style={quietButton}>เพิ่มรหัส</button>
                  </div>
                )}
              </div>
              {!readOnly && <SaveButton saving={record.saving || !record.ready} label="บันทึกตัวชี้วัด" onClick={save} />}
              {readOnly && <div style={{ color: "#64748b" }}>ดูอย่างเดียว</div>}
              {access.roll.students.map(student => {
                const marks = book.students?.[student.id] || {};
                const done = book.codes.filter(code => marks[code]).length;
                const open = record.openId === student.id;
                return (
                  <FoldStudent key={student.id} open={open} onToggle={() => record.setOpenId(open ? "" : student.id)} number={student.number} name={studentLabel(student)} summary={book.codes.length ? `${done}/${book.codes.length}` : "ยังไม่มีรหัส"}>
                    {book.codes.length === 0 ? <div style={{ color: "#94a3b8" }}>เพิ่มรหัสด้านบนก่อน</div> : book.codes.map(code => (
                      <ChoiceRow key={code} label={code} value={marks[code] || ""} options={PASS_FAIL} disabled={readOnly} onChange={next => {
                        const students = { ...book.students, [student.id]: { ...marks, [code]: next } };
                        if (!next) delete students[student.id][code];
                        setBook({ ...book, students });
                      }} />
                    ))}
                  </FoldStudent>
                );
              })}
              {!readOnly && <SaveButton saving={record.saving || !record.ready} label="บันทึกตัวชี้วัด" onClick={save} />}
            </>
          )}
        </div>
      </Card>
    </BookFrame>
  );
}

function QualityPage({ employees, currentUser }) {
  const access = useAcademicAccess(employees, currentUser);
  const record = useBook(access.teacherId, PERIOD.quality, parseQuality);
  const [term, setTerm] = useState(currentTerm);
  const readOnly = access.isAdmin;
  const context = roomContext(access.roll, access.duty);
  const schoolRoom = context.roomLevel === "ประถม" || context.roomLevel === "มัธยม";
  const key = termKey(term);
  const termStudents = record.doc.terms[key]?.students || {};

  const save = () => {
    if (readOnly) return;
    const students = {};
    access.roll.students.forEach(student => { students[student.id] = cleanQuality(termStudents[student.id]); });
    saveBook(record, PERIOD.quality, access.teacherId, { version: 1, terms: { ...record.doc.terms, [key]: { students } } }, parseQuality, "บันทึกคุณลักษณะแล้ว");
  };

  const edit = (studentId, item) => {
    putRoomStudent(record, key, studentId, item);
    record.setMessage("");
  };

  return (
    <BookFrame access={access} record={record} loadingText="กำลังโหลดคุณลักษณะ..." pickHint="เลือกครูเพื่อดูคุณลักษณะ">
      <Card>
        <div style={{ display: "grid", gap: "0.7rem", minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: "1.05rem" }}>คุณลักษณะ อ่านคิดวิเคราะห์ และสมรรถนะ</div>
          <RoomHint show={access.isAdmin} className={context.className} />
          {context.blocked ? <WarnNote>{blockText(context, access.duty)}</WarnNote> : !schoolRoom ? <WarnNote>อนุบาลใช้แท็บพัฒนาการ ไม่ใช้คุณลักษณะของประถมและมัธยม</WarnNote> : (
            <>
              <TermBar term={term} onChange={setTerm} />
              {access.roll.students.length === 0 && <WarnNote>ห้องนี้ยังไม่มีรายชื่อ ฝ่ายวิชาการอัป Excel ในแท็บเช็คชื่อ</WarnNote>}
              {!readOnly && <SaveButton saving={record.saving || !record.ready} label="บันทึกคุณลักษณะ" onClick={save} />}
              {readOnly && <div style={{ color: "#64748b" }}>ดูอย่างเดียว</div>}
              {access.roll.students.map(student => {
                const item = cleanQuality(termStudents[student.id]);
                const traitCount = Object.keys(item.traits || {}).length;
                const open = record.openId === student.id;
                return (
                  <FoldStudent key={student.id} open={open} onToggle={() => record.setOpenId(open ? "" : student.id)} number={student.number} name={studentLabel(student)} summary={`คุณลักษณะ ${traitCount}/8`}>
                    <SectionFold title="คุณลักษณะ" summary={`${traitCount + (item.read ? 1 : 0)}/9`}>
                      {TRAIT_ITEMS.map(([traitKey, label]) => (
                        <ChoiceRow key={traitKey} label={label} value={item.traits?.[traitKey] || ""} options={QUALITY_LEVELS} disabled={readOnly} onChange={next => {
                          const traits = { ...(item.traits || {}) };
                          if (next) traits[traitKey] = next;
                          else delete traits[traitKey];
                          edit(student.id, cleanQuality({ ...item, traits }));
                        }} />
                      ))}
                      <ChoiceRow label="การอ่าน คิดวิเคราะห์ และเขียน" value={item.read || ""} options={QUALITY_LEVELS} disabled={readOnly} onChange={next => edit(student.id, cleanQuality({ ...item, read: next }))} />
                    </SectionFold>
                    <SectionFold title="สมรรถนะ" summary={`${Object.keys(item.skills || {}).length}/5`}>
                      {SKILL_ITEMS.map(([skillKey, label]) => (
                        <ChoiceRow key={skillKey} label={label} value={item.skills?.[skillKey] || ""} options={QUALITY_LEVELS} disabled={readOnly} onChange={next => {
                          const skills = { ...(item.skills || {}) };
                          if (next) skills[skillKey] = next;
                          else delete skills[skillKey];
                          edit(student.id, cleanQuality({ ...item, skills }));
                        }} />
                      ))}
                    </SectionFold>
                    <SectionFold title="ค่านิยม" summary={`${Object.keys(item.values || {}).length}/12`}>
                      {VALUE_ITEMS.map(([valueKey, label]) => (
                        <ChoiceRow key={valueKey} label={label} value={item.values?.[valueKey] || ""} options={PASS_FAIL} disabled={readOnly} onChange={next => {
                          const values = { ...(item.values || {}) };
                          if (next) values[valueKey] = next;
                          else delete values[valueKey];
                          edit(student.id, cleanQuality({ ...item, values }));
                        }} />
                      ))}
                    </SectionFold>
                  </FoldStudent>
                );
              })}
              {!readOnly && <SaveButton saving={record.saving || !record.ready} label="บันทึกคุณลักษณะ" onClick={save} />}
            </>
          )}
        </div>
      </Card>
    </BookFrame>
  );
}

function ActivityPage({ employees, currentUser }) {
  const access = useAcademicAccess(employees, currentUser);
  const record = useBook(access.teacherId, PERIOD.activity, parseActivity);
  const [term, setTerm] = useState(currentTerm);
  const readOnly = access.isAdmin;
  const context = roomContext(access.roll, access.duty);
  const schoolRoom = context.roomLevel === "ประถม" || context.roomLevel === "มัธยม";
  const showScout = schoolRoom && !UPPER_GRADES.has(context.roomGrade);
  const key = termKey(term);
  const termStudents = record.doc.terms[key]?.students || {};

  const save = () => {
    if (readOnly) return;
    const students = {};
    access.roll.students.forEach(student => {
      const item = cleanActivity(termStudents[student.id]);
      if (!showScout) delete item.scout;
      students[student.id] = item;
    });
    saveBook(record, PERIOD.activity, access.teacherId, { version: 1, terms: { ...record.doc.terms, [key]: { students } } }, parseActivity, "บันทึกกิจกรรมแล้ว");
  };

  const edit = (studentId, item) => {
    putRoomStudent(record, key, studentId, cleanActivity(item));
    record.setMessage("");
  };

  return (
    <BookFrame access={access} record={record} loadingText="กำลังโหลดกิจกรรม..." pickHint="เลือกครูเพื่อดูกิจกรรม">
      <Card>
        <div style={{ display: "grid", gap: "0.7rem", minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: "1.05rem" }}>กิจกรรมพัฒนาผู้เรียน</div>
          <RoomHint show={access.isAdmin} className={context.className} />
          {context.blocked ? <WarnNote>{blockText(context, access.duty)}</WarnNote> : !schoolRoom ? <WarnNote>อนุบาลไม่มีกิจกรรมพัฒนาผู้เรียนแบบประถมและมัธยม ใช้แท็บพัฒนาการ</WarnNote> : (
            <>
              <TermBar term={term} onChange={setTerm} />
              {access.roll.students.length === 0 && <WarnNote>ห้องนี้ยังไม่มีรายชื่อ ฝ่ายวิชาการอัป Excel ในแท็บเช็คชื่อ</WarnNote>}
              {!readOnly && <SaveButton saving={record.saving || !record.ready} label="บันทึกกิจกรรม" onClick={save} />}
              {readOnly && <div style={{ color: "#64748b" }}>ดูอย่างเดียว</div>}
              {access.roll.students.map(student => {
                const item = cleanActivity(termStudents[student.id]);
                const done = [item.guide, showScout ? item.scout : "", item.clubResult, item.social].filter(Boolean).length;
                const open = record.openId === student.id;
                return (
                  <FoldStudent key={student.id} open={open} onToggle={() => record.setOpenId(open ? "" : student.id)} number={student.number} name={studentLabel(student)} summary={item.club || `${done} รายการ`}>
                    <ChoiceRow label="แนะแนว" value={item.guide || ""} options={PASS_FAIL} disabled={readOnly} onChange={next => edit(student.id, { ...item, guide: next })} />
                    {showScout && <ChoiceRow label="ลูกเสือ-เนตรนารี" value={item.scout || ""} options={PASS_FAIL} disabled={readOnly} onChange={next => edit(student.id, { ...item, scout: next })} />}
                    <div>
                      <FieldLabel>ชื่อชุมนุม</FieldLabel>
                      <input aria-label={`ชื่อชุมนุมเลขที่ ${student.number}`} disabled={readOnly} value={item.club || ""} maxLength={40} onChange={event => edit(student.id, { ...item, club: event.target.value.slice(0, 40) })} style={{ ...fieldStyle, background: readOnly ? "#f8fafc" : "#fff" }} />
                    </div>
                    <ChoiceRow label="ชุมนุม" value={item.clubResult || ""} options={PASS_FAIL} disabled={readOnly} onChange={next => edit(student.id, { ...item, clubResult: next })} />
                    <ChoiceRow label="กิจกรรมเพื่อสังคมและสาธารณประโยชน์" value={item.social || ""} options={PASS_FAIL} disabled={readOnly} onChange={next => edit(student.id, { ...item, social: next })} />
                  </FoldStudent>
                );
              })}
              {!readOnly && <SaveButton saving={record.saving || !record.ready} label="บันทึกกิจกรรม" onClick={save} />}
            </>
          )}
        </div>
      </Card>
    </BookFrame>
  );
}

function DevelopPage({ employees, currentUser }) {
  const access = useAcademicAccess(employees, currentUser);
  const record = useBook(access.teacherId, PERIOD.develop, parseDevelop);
  const [term, setTerm] = useState(currentTerm);
  const readOnly = access.isAdmin;
  const context = roomContext(access.roll, access.duty);
  const kinderRoom = context.roomLevel === "อนุบาล";
  const key = termKey(term);
  const termStudents = record.doc.terms[key]?.students || {};

  const save = () => {
    if (readOnly) return;
    const students = {};
    access.roll.students.forEach(student => { students[student.id] = cleanDevelop(termStudents[student.id]); });
    saveBook(record, PERIOD.develop, access.teacherId, { version: 1, terms: { ...record.doc.terms, [key]: { students } } }, parseDevelop, "บันทึกพัฒนาการแล้ว");
  };

  return (
    <BookFrame access={access} record={record} loadingText="กำลังโหลดพัฒนาการ..." pickHint="เลือกครูเพื่อดูพัฒนาการ">
      <Card>
        <div style={{ display: "grid", gap: "0.7rem", minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: "1.05rem" }}>พัฒนาการเด็กปฐมวัย</div>
          <RoomHint show={access.isAdmin} className={context.className} />
          {context.blocked ? <WarnNote>{blockText(context, access.duty)}</WarnNote> : !kinderRoom ? <WarnNote>ประถมและมัธยมใช้แท็บตัวชี้วัด คุณลักษณะ และกิจกรรม หน้านี้สำหรับอนุบาล</WarnNote> : (
            <>
              <TermBar term={term} onChange={setTerm} />
              {access.roll.students.length === 0 && <WarnNote>ห้องนี้ยังไม่มีรายชื่อ ฝ่ายวิชาการอัป Excel ในแท็บเช็คชื่อ</WarnNote>}
              {!readOnly && <SaveButton saving={record.saving || !record.ready} label="บันทึกพัฒนาการ" onClick={save} />}
              {readOnly && <div style={{ color: "#64748b" }}>ดูอย่างเดียว</div>}
              {access.roll.students.map(student => {
                const item = cleanDevelop(termStudents[student.id]);
                const done = DEV_ITEMS.filter(([itemKey]) => item[itemKey]).length;
                const open = record.openId === student.id;
                return (
                  <FoldStudent key={student.id} open={open} onToggle={() => record.setOpenId(open ? "" : student.id)} number={student.number} name={studentLabel(student)} summary={`${done}/12`}>
                    {DEV_GROUPS.map(([group, items]) => {
                      const groupDone = items.filter(([itemKey]) => item[itemKey]).length;
                      return (
                        <SectionFold key={group} title={group} summary={`${groupDone}/${items.length}`}>
                          {items.map(([itemKey, label]) => (
                            <ChoiceRow key={itemKey} label={label} value={item[itemKey] || ""} options={DEV_LEVELS} disabled={readOnly} onChange={next => {
                              const merged = { ...item };
                              if (next) merged[itemKey] = next;
                              else delete merged[itemKey];
                              putRoomStudent(record, key, student.id, cleanDevelop(merged));
                              record.setMessage("");
                            }} />
                          ))}
                        </SectionFold>
                      );
                    })}
                  </FoldStudent>
                );
              })}
              {!readOnly && <SaveButton saving={record.saving || !record.ready} label="บันทึกพัฒนาการ" onClick={save} />}
            </>
          )}
        </div>
      </Card>
    </BookFrame>
  );
}

export async function loadTeachingGrades() {
  const rows = await fetchMarker(PERIOD.assign, null);
  const doc = parseAssignment(rows[0]?.subject);
  const map = {};
  Object.entries(doc.teachers || {}).forEach(([id, duty]) => {
    if (duty.grades[0]) map[id] = duty.grades[0];
  });
  return map;
}

export async function saveTeachingGrade(employeeId, grade, actorId) {
  const rows = await fetchMarker(PERIOD.assign, null);
  const latestRow = rows[0] || null;
  const latest = parseAssignment(latestRow?.subject);
  const teachers = { ...latest.teachers };
  const cleanGrade = ALL_GRADES.includes(grade) ? grade : "";
  if (!cleanGrade) delete teachers[employeeId];
  else {
    const level = levelFromGrade(cleanGrade);
    teachers[employeeId] = { levels: [level], grades: [cleanGrade], subjectsByGrade: {} };
  }
  const next = { ...latest, teachers, updated_at: new Date().toISOString() };
  const ownerId = latestRow?.employee_id || actorId;
  if (!ownerId) throw new Error("ไม่พบผู้บันทึก");
  await writeMarker(PERIOD.assign, ownerId, next, latestRow?.id || null, true);
}

export async function loadAssignedPlanLevels() {
  const rows = await fetchMarker(PERIOD.assign, null);
  const doc = parseAssignment(rows[0]?.subject);
  const map = {};
  Object.entries(doc.teachers || {}).forEach(([id, duty]) => {
    const school = duty.levels.includes("ประถม") || duty.levels.includes("มัธยม");
    if (duty.levels.includes("อนุบาล") && !school) map[id] = "อนุบาล";
    else if (school) map[id] = "school";
  });
  return map;
}

export function AcademicExtra({ tab, employees, currentUser }) {
  if (tab === "growth") return <GrowthPage employees={employees} currentUser={currentUser} />;
  if (tab === "health") return <HealthPage employees={employees} currentUser={currentUser} />;
  if (tab === "milk") return <MilkPage employees={employees} currentUser={currentUser} />;
  if (tab === "lunch") return <LunchPage employees={employees} currentUser={currentUser} />;
  if (tab === "score") return <ScorePage employees={employees} currentUser={currentUser} />;
  if (tab === "indicator") return <IndicatorPage employees={employees} currentUser={currentUser} />;
  if (tab === "quality") return <QualityPage employees={employees} currentUser={currentUser} />;
  if (tab === "activity") return <ActivityPage employees={employees} currentUser={currentUser} />;
  if (tab === "develop") return <DevelopPage employees={employees} currentUser={currentUser} />;
  return null;
}
