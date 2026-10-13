import { useState, useEffect, useCallback, useRef } from "react";
import { THAI_P2_PLAN_PACK } from "./lessonPlanCatalog.js";
import { AcademicExtra, ACADEMIC_EXTRA_TABS, ACADEMIC_RECORD_ROOM, TEACHING_GRADE_GROUPS, loadAssignedPlanLevels, loadTeachingGrades, saveTeachingGrade } from "./academicRecords.jsx";
import { read as readWorkbook, utils as xlsxUtils } from "xlsx";
import { supabase } from "./supabase.js";
import {
  Users, Building2, Clock, CheckCircle, XCircle, MapPin,
  Navigation, LogIn, LogOut, Settings, Bell, Search,
  ChevronDown, ChevronRight, BarChart3, FileText,
  Shield, WifiOff, RefreshCw, UserPlus, DollarSign,
  Umbrella, AlertCircle, Activity, Home, X, Edit, Trash2, Save, Phone, Mail,
  Plus, Calendar, ArrowRightLeft, ArrowLeftRight, TrendingUp, User, Lock, Eye, EyeOff, Key, Menu,
  BookOpen, ChevronLeft, ChevronUp, Copy, Upload
} from "lucide-react";

function isLocalPreview() {
  if (typeof window === "undefined") return false;
  const host = window.location.hostname;
  return host === "localhost" || host === "127.0.0.1" || host === "::1";
}

function PreviewBanner() {
  if (!isLocalPreview()) return null;
  return (
    <div style={{ width: "100%", alignSelf: "stretch", background: "#fef3c7", color: "#92400e", textAlign: "center", padding: "0.45rem 0.75rem", fontSize: "0.82rem", fontWeight: 700, lineHeight: 1.45 }}>
      เว็บทดลองบนเครื่องนี้ ยังไม่ขึ้นระบบจริง ปรับหน้านี้ได้ก่อนเอาให้ครูทั้งโรงเรียนใช้
    </div>
  );
}

const SCHOOL_LAT = 15.596741;
const SCHOOL_LNG = 100.652199;
const GEOFENCE_RADIUS = 200;
const DEFAULT_DUTY_RATES = {
  "ไม่มีเวร": 0,
  "เวรรถ": 30,
  "แลกชิพ": 0,
  "เวรหน้าประตู": 0,
};
const PAID_DUTY_OPTIONS = ["เวรรถ"];
const WORK_ACTIVITY_OPTIONS = [
  { value: "work", label: "ทำงานที่โรงเรียน" },
  { value: "training", label: "ไปอบรม" },
];
const FREE_PERIOD_VALUE = "__FREE_PERIOD__";
const DUTY_SETTING_PREFIX = "__DUTY__:";
const LEAVE_TEACHER_LEVELS = ["อนุบาล", "ประถม", "มัธยม"];
const SUBSTITUTE_PERIODS = [
  { label: "จินตคณิต", rate: 25 },
  { label: "คาบ 1", rate: 50 },
  { label: "คาบ 2", rate: 50 },
  { label: "คาบ 3", rate: 50 },
  { label: "คาบ 4", rate: 50 },
  { label: "คาบ 5", rate: 50 },
  { label: "คาบ 6", rate: 50 },
];
const KINDERGARTEN_SUBSTITUTE_DAY_RATE = 250;
const MONTHLY_LEAVE_DEDUCT_RATE = 300;
const DRIVER_DAY_RATE = 320;
const DRIVER_EMPLOYEE_IDS = new Set([
  "1c21605d-3404-4424-a640-d2eb25361c19",
  "193538b9-9672-4c18-b29d-114dcc5befaf",
]);
const FINANCE_INFO_FIELDS = [
  { key: "phone", label: "ค่าโทรศัพท์" },
  { key: "three_percent", label: "ค่า 3%" },
  { key: "cooperative", label: "ค่าสหกรณ์" },
  { key: "electric", label: "ค่าไฟ" },
  { key: "water", label: "ค่าน้ำ" },
  { key: "chpk", label: "ค่า ช.พ.ค." },
];

function haversineDistance(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const fmtTime = (t) => t ? new Date(t).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" }) : "-";
const fmtDate = (t) => t ? new Date(t).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit", timeZone: "Asia/Bangkok" }) : "-";
// วันที่ของวันนี้ในเวลาไทย (Asia/Bangkok)
const todayISO = () => {
  const now = new Date();
  // ใช้ฟอร์แมต en-CA จะได้ YYYY-MM-DD
  return now.toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" });
};

// วันที่เมื่อวานในเวลาไทย (Asia/Bangkok)
const yesterdayISO = () => {
  const yesterday = new Date(Date.now() - 86400000);
  return yesterday.toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" });
};

// คืนค่า start/end ของวันนี้ในเวลาไทยเป็น ISO timestamp
const todayRange = () => {
  const dateStr = todayISO(); // เช่น "2026-05-22"
  const start = new Date(dateStr + "T00:00:00+07:00").toISOString();
  const end = new Date(dateStr + "T23:59:59+07:00").toISOString();
  return { start, end };
};

function playWarningBeeps() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    [0, 180, 360].forEach(delay => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = 880;
      gain.gain.value = 0.12;
      osc.connect(gain);
      gain.connect(ctx.destination);
      const start = ctx.currentTime + delay / 1000;
      osc.start(start);
      osc.stop(start + 0.12);
    });
  } catch {
    // Audio feedback is optional.
  }
}

function getThaiSpeechVoice() {
  if (typeof window === "undefined" || !window.speechSynthesis?.getVoices) return null;
  const voices = window.speechSynthesis.getVoices();
  const thaiVoices = voices
    .filter(voice => {
    const lang = (voice.lang || "").toLowerCase();
    const name = (voice.name || "").toLowerCase();
      return lang === "th-th" || lang.startsWith("th") || name.includes("thai") || name.includes("ไทย") || name.includes("pattara") || name.includes("narisa");
    })
    .sort((a, b) => {
      const score = (voice) => {
        const lang = (voice.lang || "").toLowerCase();
        const name = (voice.name || "").toLowerCase();
        return (lang === "th-th" ? 100 : 0)
          + (lang.startsWith("th") ? 50 : 0)
          + (name.includes("pattara") ? 30 : 0)
          + (name.includes("narisa") ? 20 : 0)
          + (voice.localService ? 10 : 0)
          + (voice.default ? 5 : 0);
      };
      return score(b) - score(a);
    });

  return thaiVoices[0] || null;
}

function prepareThaiSpeechText(text) {
  return String(text || "")
    .replace(/ไฟต์ติ้ง/g, "สู้สู้นะครับ")
    .replace(/เป๊ะ/g, "ตรงเวลามาก")
    .replace(/[^\p{Script=Thai}\p{N}\s.,!?]/gu, " ")
    .replace(/สู้สู้นะครับ/g, "สู้ สู้ นะครับ")
    .replace(/\s+/g, " ")
    .replace(/\s*([,.!?])\s*/g, "$1 ")
    .replace(/ครับ\s+/g, "ครับ. ")
    .trim();
}

function speakThai(text, waitForVoices = true) {
  try {
    if (!window.speechSynthesis) return;
    const synth = window.speechSynthesis;
    const spokenText = prepareThaiSpeechText(text);
    if (!spokenText) return;

    const speakNow = () => {
      const thaiVoice = getThaiSpeechVoice();
      if (!thaiVoice) return false;
      synth.cancel();
      const utterance = new SpeechSynthesisUtterance(spokenText);
      utterance.voice = thaiVoice;
      utterance.lang = "th-TH";
      utterance.rate = 0.6;
      utterance.pitch = 1;
      utterance.volume = 1;
      synth.speak(utterance);
      return true;
    };

    if (waitForVoices && !getThaiSpeechVoice()) {
      let handled = false;
      const handleVoicesReady = () => {
        if (handled || !getThaiSpeechVoice()) return;
        handled = true;
        synth.removeEventListener?.("voiceschanged", handleVoicesReady);
        speakNow();
      };
      synth.addEventListener?.("voiceschanged", handleVoicesReady, { once: true });
      [300, 800, 1500].forEach(delay => window.setTimeout(handleVoicesReady, delay));
      return;
    }

    speakNow();
  } catch {
    // Speech feedback is optional.
  }
}

// คำนวณสถานะมาสาย / กลับก่อน
// แปลงนาทีเป็น "X ชม. Y นาที" หรือ "Y นาที"
function formatMinutes(mins) {
  if (mins < 60) return `${mins} นาที`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h} ชม.` : `${h} ชม. ${m} นาที`;
}

// ชุดคำให้กำลังใจ
const QUOTES = {
  early: [
    "เยี่ยมมากครับคุณครู วันนี้มาเช้ามาก",
    "คุณครูสุดยอดครับ เริ่มวันได้ดีมาก",
    "มาเช้าแบบนี้ พร้อมลุยทั้งวันครับ",
    "วินัยดีมากครับ ขอให้วันนี้เป็นวันที่ดี",
    "ขอบคุณคุณครูครับ วันนี้เริ่มได้ดีมาก",
    "เช้านี้คุณครูพร้อมมากครับ สู้สู้นะครับ",
    "มาเช้าขนาดนี้ โรงเรียนมีกำลังใจครับ",
  ],
  onTime: [
    "สวัสดีตอนเช้าครับคุณครู วันนี้สู้สู้นะครับ",
    "มาทันเวลาครับ เริ่มวันใหม่ไปด้วยกัน",
    "พร้อมทำงานแล้วครับ ขอให้วันนี้ราบรื่น",
    "วันนี้ต้องเป็นวันที่ดีครับ คุณครูทำได้",
    "ขอบคุณที่เริ่มวันอย่างตั้งใจครับ",
    "พร้อมสอนแล้วครับ ขอให้วันนี้สดใส",
    "เริ่มตรงเวลาแบบนี้ ดีมากครับคุณครู",
  ],
  late: [
    "ไม่เป็นไรครับคุณครู ตั้งหลักแล้วเริ่มงานกันครับ",
    "มาถึงแล้วครับ วันนี้ยังสู้ต่อได้",
    "เริ่มช้านิดเดียวครับ ขอให้วันที่เหลือราบรื่น",
    "ไม่ต้องกดดันนะครับ คุณครูทำได้",
    "วันนี้ยังไปต่อได้ครับ สู้สู้นะครับ",
    "พร้อมแล้วเดินหน้าต่อครับคุณครู",
    "เริ่มช้าไม่เป็นไร ขอให้วันนี้จบสวยครับ",
  ],
  leaveEarly: [
    "ขอบคุณคุณครูที่ดูแลนักเรียนวันนี้ครับ",
    "ขอบคุณสำหรับความตั้งใจของวันนี้ครับ",
    "วันนี้คุณครูเหนื่อยมามากแล้ว เดินทางปลอดภัยครับ",
    "โรงเรียนขอบคุณคุณครูจากใจครับ",
    "ขอให้ช่วงเย็นได้พักเต็มที่ครับ",
    "ขอบคุณคุณครูมากครับ",
  ],
  stayLate: [
    "ขอบคุณคุณครูที่ทุ่มเทจนเกินเวลาครับ",
    "วันนี้เหนื่อยมาทั้งวันแล้ว ขอบคุณมากครับ",
    "ขอบคุณที่ดูแลงานจนเรียบร้อยครับ",
    "ความตั้งใจของคุณครูมีค่ามากครับ",
    "โรงเรียนเห็นความทุ่มเทของคุณครูครับ",
    "วันนี้คุณครูทำเต็มที่แล้ว เดินทางปลอดภัยครับ",
    "ขอบคุณคุณครูที่เป็นกำลังสำคัญของโรงเรียนครับ",
  ],
  onTimeLeave: [
    "ขอบคุณคุณครูที่เหนื่อยมาทั้งวันครับ",
    "โรงเรียนขอบคุณคุณครูสำหรับวันนี้ครับ",
    "ขอบคุณที่ดูแลนักเรียนตลอดทั้งวันครับ",
    "วันนี้คุณครูทำเต็มที่แล้ว ขอบคุณมากครับ",
    "ขอบคุณคุณครูจากใจครับ พักให้หายเหนื่อยนะครับ",
    "ภารกิจวันนี้เรียบร้อยแล้ว เดินทางปลอดภัยครับ",
  ]
};

function randomQuote(type) {
  const list = QUOTES[type] || [];
  return list[Math.floor(Math.random() * list.length)] || "";
}

function parseMoney(value) {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : 0;
}

function formatMoney(value) {
  return new Intl.NumberFormat("th-TH", { style: "currency", currency: "THB", maximumFractionDigits: 2 }).format(parseMoney(value));
}

function getDateKey(value) {
  return new Date(value).toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" });
}

function inMonthValue(value, month) {
  if (!value) return false;
  return getDateKey(value).startsWith(month);
}

function getLocalDateFromISO(dateKey) {
  if (!dateKey) return null;
  const [year, month, day] = String(dateKey).split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}

function toISODateKey(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getAttendanceWorkDateKeys(row, month = "") {
  const keys = new Set();
  if (row?.check_in) keys.add(getDateKey(row.check_in));

  if (row?.work_activity === "training") {
    const startKey = row.training_start_date || (row.check_in ? getDateKey(row.check_in) : "");
    const endKey = row.training_end_date || startKey;
    const startDate = getLocalDateFromISO(startKey);
    const endDate = getLocalDateFromISO(endKey);
    if (startDate && endDate && startDate <= endDate) {
      const cursor = new Date(startDate);
      let guard = 0;
      while (cursor <= endDate && guard < 370) {
        keys.add(toISODateKey(cursor));
        cursor.setDate(cursor.getDate() + 1);
        guard += 1;
      }
    }
  }

  return Array.from(keys).filter(key => !month || key.startsWith(month));
}

function loadLegacyPayrollConfig() {
  if (typeof window === "undefined") return { dutyRates: { ...DEFAULT_DUTY_RATES }, dailyTeacherRates: {} };
  try {
    const raw = localStorage.getItem("hr_payroll_config_v1");
    const parsed = raw ? JSON.parse(raw) : {};
    return {
      dutyRates: { ...DEFAULT_DUTY_RATES, ...(parsed?.dutyRates || {}) },
      dailyTeacherRates: parsed?.dailyTeacherRates || {},
    };
  } catch {
    return { dutyRates: { ...DEFAULT_DUTY_RATES }, dailyTeacherRates: {} };
  }
}

function getDutySettingLabel(dutyName) {
  return `${DUTY_SETTING_PREFIX}${dutyName}`;
}

function parseDutyName(settingValue) {
  if (!settingValue?.startsWith(DUTY_SETTING_PREFIX)) return null;
  return settingValue.slice(DUTY_SETTING_PREFIX.length);
}

function parseEmployeePayrollMeta(value) {
  const fallback = { leave_deduct_types: "ลาป่วย,ลากิจ", teacher_level: "", pay_type: "daily", bank_gross_salary: 0, bank_deposit: 0 };
  if (!value || value.startsWith?.(DUTY_SETTING_PREFIX)) return fallback;
  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === "object") {
      return {
        ...fallback,
        leave_deduct_types: parsed.leave_deduct_types || parsed.leaveDeductTypes || fallback.leave_deduct_types,
        teacher_level: parsed.teacher_level || parsed.teacherLevel || "",
        pay_type: parsed.pay_type || parsed.payType || "daily",
        bank_gross_salary: parseMoney(parsed.bank_gross_salary ?? parsed.bankGrossSalary ?? parsed.bank_deposit ?? parsed.bankDeposit ?? 0),
        bank_deposit: parseMoney(parsed.bank_deposit ?? parsed.bankDeposit ?? 0),
      };
    }
  } catch {}
  return { ...fallback, leave_deduct_types: value };
}

function formatEmployeePayrollMeta(config) {
  return JSON.stringify({
    leave_deduct_types: config.leave_deduct_types || "ลาป่วย,ลากิจ",
    teacher_level: config.teacher_level || "",
    pay_type: config.pay_type || "daily",
    bank_gross_salary: parseMoney(config.bank_gross_salary),
    bank_deposit: parseMoney(config.bank_deposit),
  });
}

function parsePayrollNote(value) {
  if (!value) return { duty_note: "", adjustment_add: 0, adjustment_deduct: 0, adjustment_note: "" };
  try {
    const parsed = JSON.parse(value);
    return {
      duty_note: parsed.duty_note || "",
      adjustment_add: parseMoney(parsed.adjustment_add),
      adjustment_deduct: parseMoney(parsed.adjustment_deduct),
      adjustment_note: parsed.adjustment_note || "",
      override_rate: parsed.override_rate ?? "",
      override_base_salary: parsed.override_base_salary ?? "",
      override_duty_pay: parsed.override_duty_pay ?? "",
      override_substitute_pay: parsed.override_substitute_pay ?? "",
      override_leave_deductions: parsed.override_leave_deductions ?? "",
      override_bank_gross_salary: parsed.override_bank_gross_salary ?? "",
      override_bank_deposit: parsed.override_bank_deposit ?? "",
      bank_gross_salary: parseMoney(parsed.bank_gross_salary),
      bank_deposit: parseMoney(parsed.bank_deposit),
      real_salary: parseMoney(parsed.real_salary),
      refund_amount: parseMoney(parsed.refund_amount),
      additional_payment: parseMoney(parsed.additional_payment),
      monthly_recurring_deduction: parseMoney(parsed.monthly_recurring_deduction),
      driver_days: parseMoney(parsed.driver_days),
      driver_pay: parseMoney(parsed.driver_pay),
      onet_pay: parseMoney(parsed.onet_pay),
      chpk_deduction: parseMoney(parsed.chpk_deduction),
      chps_deduction: parseMoney(parsed.chps_deduction),
      cooperative_deduction: parseMoney(parsed.cooperative_deduction),
      other_deduction_1: parseMoney(parsed.other_deduction_1),
      other_deduction_2: parseMoney(parsed.other_deduction_2),
    };
  } catch {
    return { duty_note: value, adjustment_add: 0, adjustment_deduct: 0, adjustment_note: "" };
  }
}

function normalizeSubstitutePeriods(periods) {
  const list = Array.isArray(periods) ? periods : [];
  if (list.length === 6) {
    return ["", ...list].slice(0, SUBSTITUTE_PERIODS.length);
  }
  return Array.from({ length: SUBSTITUTE_PERIODS.length }, (_, index) => list[index] || "");
}

function getLeaveSubstituteMeta(value) {
  if (!value) return { teacherLevel: "", periods: normalizeSubstitutePeriods([]) };
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return { teacherLevel: "", periods: normalizeSubstitutePeriods(parsed) };
    }
    if (parsed && typeof parsed === "object") {
      return {
        teacherLevel: parsed.teacher_level || parsed.teacherLevel || "",
        periods: normalizeSubstitutePeriods(parsed.periods || parsed.period_substitutes),
      };
    }
  } catch {}
  return { teacherLevel: "", periods: normalizeSubstitutePeriods([]) };
}

function getPeriodSubstitutes(value) {
  return getLeaveSubstituteMeta(value).periods;
}

function getLeaveTeacherLevel(value) {
  return getLeaveSubstituteMeta(value).teacherLevel;
}

function hasMedicalLeaveDocument(row) {
  return Boolean(String(row?.document_url || "").trim());
}

function getLeaveDays(row) {
  const hours = parseMoney(row?.hours);
  if (hours > 0) return hours / 8;
  if (row?.duration_type === "ครึ่งวันเช้า" || row?.duration_type === "ครึ่งวันบ่าย") return 0.5;
  if (row?.duration_type === "1 ชั่วโมง") return 0.125;
  if (row?.duration_type === "2 ชั่วโมง") return 0.25;
  if (row?.duration_type === "หลายวัน" && row?.start_date && row?.end_date) {
    const start = new Date(`${row.start_date}T00:00:00+07:00`);
    const end = new Date(`${row.end_date}T00:00:00+07:00`);
    return Math.max(1, Math.round((end - start) / 86400000) + 1);
  }
  return 1;
}

function getMonthlyLeaveDeduction(row) {
  if (hasMedicalLeaveDocument(row)) return 0;
  return getLeaveDays(row) * MONTHLY_LEAVE_DEDUCT_RATE;
}

function getSubstitutePayForLeave(row, employeeId) {
  const { teacherLevel, periods } = getLeaveSubstituteMeta(row.substitute_note);
  const dayCount = Math.max(1, (row.hours || 8) / 8);
  if (teacherLevel === "อนุบาล") {
    return periods.includes(employeeId) ? KINDERGARTEN_SUBSTITUTE_DAY_RATE * dayCount : 0;
  }
  return periods.reduce((sum, subId, index) => {
    if (subId !== employeeId) return sum;
    return sum + (SUBSTITUTE_PERIODS[index]?.rate || 50);
  }, 0);
}

function defaultEmployeePayrollConfig() {
  return {
    daily_rate: 500,
    pay_type: "daily",
    teacher_level: "",
    bank_gross_salary: 0,
    bank_deposit: 0,
    overtime_rate: 0,
    substitute_rate: 50,
    leave_deduct_types: "ลาป่วย,ลากิจ",
  };
}

function legacyToEmployeeConfigs(legacyConfig) {
  return Object.fromEntries(
    Object.entries(legacyConfig.dailyTeacherRates || {}).map(([employeeId, rate]) => [
      employeeId,
      { ...defaultEmployeePayrollConfig(), daily_rate: parseMoney(rate) },
    ]),
  );
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("อ่านไฟล์ไม่สำเร็จ"));
    reader.readAsDataURL(file);
  });
}

async function compressImageFile(file) {
  const source = await readFileAsDataUrl(file);
  const image = await new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("เปิดรูปภาพไม่สำเร็จ"));
    img.src = source;
  });

  const maxWidth = 1600;
  const scale = Math.min(1, maxWidth / image.width);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(image.width * scale);
  canvas.height = Math.round(image.height * scale);
  const ctx = canvas.getContext("2d");

  if (!ctx) return source;

  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.82);
}

async function storeLeaveDocument(file, employeeId) {
  const compressedDataUrl = await compressImageFile(file);
  try {
    const response = await fetch(compressedDataUrl);
    const blob = await response.blob();
    const uniqueId = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const objectPath = `${employeeId || "unknown"}/${todayISO()}/${uniqueId}.jpg`;
    const { error } = await supabase.storage
      .from("leave-documents")
      .upload(objectPath, blob, { contentType: "image/jpeg", upsert: false });

    if (!error) {
      const { data } = supabase.storage.from("leave-documents").getPublicUrl(objectPath);
      if (data?.publicUrl) return data.publicUrl;
    }
  } catch {
    // The compressed image is stored in the leave row when Storage is unavailable.
  }

  // Projects without a Storage bucket still keep the compressed image in the Supabase leave row.
  return compressedDataUrl;
}

// ─── DEVICE FINGERPRINT ───────────────────────────────────────────────────────
function getDeviceId() {
  let id = localStorage.getItem("hr_device_id");
  if (!id) {
    // สร้าง fingerprint จาก browser info + random
    const parts = [
      navigator.userAgent,
      navigator.language,
      screen.width + "x" + screen.height,
      new Date().getTimezoneOffset(),
      navigator.hardwareConcurrency || "",
      Math.random().toString(36).slice(2),
      Date.now()
    ].join("|");
    // hash อย่างง่าย
    let hash = 0;
    for (let i = 0; i < parts.length; i++) {
      hash = ((hash << 5) - hash) + parts.charCodeAt(i);
      hash |= 0;
    }
    id = "dev-" + Math.abs(hash).toString(36) + "-" + Math.random().toString(36).slice(2, 10);
    localStorage.setItem("hr_device_id", id);
  }
  return id;
}

function getDeviceName() {
  const ua = navigator.userAgent;
  let device = "Unknown";
  if (/iPhone/.test(ua)) device = "iPhone";
  else if (/iPad/.test(ua)) device = "iPad";
  else if (/Android/.test(ua)) device = "Android";
  else if (/Windows/.test(ua)) device = "Windows PC";
  else if (/Macintosh/.test(ua)) device = "Mac";
  else if (/Linux/.test(ua)) device = "Linux";
  let browser = "Browser";
  if (/Edg\//.test(ua)) browser = "Edge";
  else if (/Chrome\//.test(ua)) browser = "Chrome";
  else if (/Firefox\//.test(ua)) browser = "Firefox";
  else if (/Safari\//.test(ua)) browser = "Safari";
  return `${device} • ${browser}`;
}

function checkLate(checkInTime, workStart, grace = 0) {
  if (!checkInTime || !workStart) return null;
  const ci = new Date(checkInTime);
  const thStr = ci.toLocaleString("en-US", { timeZone: "Asia/Bangkok", hour12: false, hour: "2-digit", minute: "2-digit" });
  const [ciH, ciM] = thStr.split(":").map(Number);
  const [wh, wm] = workStart.split(":").map(Number);
  const ciMinutes = ciH * 60 + ciM;
  const wsMinutes = wh * 60 + wm;
  if (ciMinutes > wsMinutes) {
    return { late: true, early: false, minutes: ciMinutes - wsMinutes };
  }
  if (ciMinutes < wsMinutes) {
    return { late: false, early: true, minutes: wsMinutes - ciMinutes };
  }
  return { late: false, early: false, minutes: 0 };
}

function checkEarly(checkOutTime, workEnd) {
  if (!checkOutTime || !workEnd) return null;
  const co = new Date(checkOutTime);
  const thStr = co.toLocaleString("en-US", { timeZone: "Asia/Bangkok", hour12: false, hour: "2-digit", minute: "2-digit" });
  const [coH, coM] = thStr.split(":").map(Number);
  const [wh, wm] = workEnd.split(":").map(Number);
  const coMinutes = coH * 60 + coM;
  const weMinutes = wh * 60 + wm;
  if (coMinutes < weMinutes) {
    return { early: true, onTime: false, late: false, minutes: weMinutes - coMinutes };
  }
  if (coMinutes > weMinutes) {
    return { early: false, onTime: false, late: true, minutes: coMinutes - weMinutes };
  }
  return { early: false, onTime: true, late: false, minutes: 0 };
}

const DEPT_OPTIONS = ["วิชาการ", "บริหาร", "พลศึกษา", "คณิตศาสตร์", "ภาษาไทย", "ศิลปะ", "วิทยาศาสตร์", "สังคมศึกษา", "ภาษาอังกฤษ", "การงานอาชีพ"];
const DUTY_OPTIONS = ["ไม่มีเวร", "เวรรถ", "แลกชิพ", "เวรหน้าประตู"];
const DAY_NAMES = ["", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์"];
// แผนนิเทศและเช็คชื่อนักเรียนเก็บในแถวของ teaching_schedule ที่ใช้ห้องพิเศษ และถูกซ่อนจากหน้าตารางสอน
// เพราะคีย์ของโปรเจกต์สร้างตารางใหม่ใน Supabase ไม่ได้
const SUPERVISION_SCHEDULE_ROOM = "__TEACHING_SUPERVISION__";
const STUDENT_ROLL_ROOM = "__STUDENT_ROLL__";
const SUPERVISION_FILE_LIMIT = 2.5 * 1024 * 1024;
const SUPERVISION_JSON_LIMIT = 3200000;
const SUPERVISION_FILE_EXTENSIONS = [".pdf", ".doc", ".docx", ".jpg", ".jpeg", ".png", ".webp", ".gif"];
const SUPERVISION_FILE_ACCEPT = ".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp,.gif,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/*";

const navItems = [
  { icon: Home, label: "หน้าหลัก", key: "dashboard", roles: ["admin", "employee"] },
  { icon: Users, label: "ข้อมูลพนักงาน", key: "employee", roles: ["admin"] },
  { icon: Clock, label: "ลงเวลาเข้า-ออก", key: "attendance", roles: ["admin", "employee"] },
  { icon: Calendar, label: "ตารางสอน", key: "schedule", roles: ["admin", "employee"] },
  { icon: BookOpen, label: "งานวิชาการ", key: "academic", roles: ["admin", "employee"] },
  { icon: Umbrella, label: "การลา", key: "leave", roles: ["admin", "employee"] },
  { icon: ArrowRightLeft, label: "ขอออกนอกสถานที่", key: "outing", roles: ["admin", "employee"] },
  { icon: DollarSign, label: "เงินเดือน", key: "finance", roles: ["admin"] },
  { icon: BarChart3, label: "รายงาน", key: "report", roles: ["admin"] },
  { icon: Settings, label: "ตั้งค่าเวลาทำงาน", key: "settings", roles: ["admin"] },
];

const inputStyle = { width: "100%", padding: "0.65rem 0.75rem", border: "1.5px solid #e2e8f0", borderRadius: "10px", fontSize: "0.9rem", fontFamily: "inherit", color: "#0f172a", outline: "none", background: "#fff" };
const selectStyle = { ...inputStyle };
const btnSecondary = { flex: 1, padding: "0.75rem", borderRadius: "10px", border: "1.5px solid #e2e8f0", background: "#f8fafc", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.4rem", color: "#475569", fontSize: "0.9rem", fontWeight: 600, fontFamily: "inherit" };
const btnPrimary = { flex: 2, padding: "0.75rem", borderRadius: "10px", border: "none", fontWeight: 700, fontSize: "0.95rem", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.4rem" };
const iconBtn = (bg, color) => ({ background: bg, border: "none", borderRadius: "8px", padding: "0.4rem", cursor: "pointer", color });

function Avatar({ name, index = 0 }) {
  return <div style={{ width: 34, height: 34, borderRadius: "50%", background: `hsl(${index * 47 + 200}, 65%, 58%)`, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700, fontSize: "0.85rem", flexShrink: 0 }}>{name?.[0] || "?"}</div>;
}

function Card({ children, padding = "1.25rem", style = {} }) {
  return <div style={{ background: "#fff", borderRadius: "1rem", padding, boxShadow: "0 2px 12px rgba(0,0,0,0.06)", border: "1px solid #f1f5f9", ...style }}>{children}</div>;
}

function Field({ label, children }) {
  return <div><label style={{ fontSize: "0.8rem", fontWeight: 600, color: "#475569", display: "block", marginBottom: "0.35rem" }}>{label}</label>{children}</div>;
}

function InputWithIcon({ icon: Icon, value, onChange, placeholder, type = "text" }) {
  return (
    <div style={{ position: "relative" }}>
      <Icon size={15} color="#94a3b8" style={{ position: "absolute", left: "0.75rem", top: "50%", transform: "translateY(-50%)" }} />
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} style={{ ...inputStyle, paddingLeft: "2.25rem" }} />
    </div>
  );
}

function ErrorBox({ children }) {
  return <div style={{ background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: "8px", padding: "0.75rem", color: "#dc2626", fontSize: "0.85rem" }}>{children}</div>;
}

function ButtonRow({ onCancel, onSave, saving, label = "บันทึก" }) {
  return (
    <div style={{ display: "flex", gap: "0.75rem", marginTop: "0.5rem" }}>
      <button onClick={onCancel} style={btnSecondary}>ยกเลิก</button>
      <button onClick={onSave} disabled={saving} style={{ ...btnPrimary, background: "linear-gradient(135deg, #2563eb, #1d4ed8)", color: "#fff", cursor: saving ? "not-allowed" : "pointer" }}>
        {saving ? <RefreshCw size={16} style={{ animation: "spin 1s linear infinite" }} /> : <Save size={16} />}
        {saving ? "กำลังบันทึก..." : label}
      </button>
    </div>
  );
}

function PageHeader({ title, count, onAdd, addLabel }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem", flexWrap: "wrap", gap: "0.75rem" }}>
      <div>
        <h1 style={{ fontSize: "1.4rem", fontWeight: 800, color: "#0f172a" }}>{title}</h1>
        {count !== undefined && <p style={{ color: "#64748b", fontSize: "0.85rem" }}>ทั้งหมด {count} รายการ</p>}
      </div>
      {onAdd && (
        <button onClick={onAdd} style={{ background: "linear-gradient(135deg, #2563eb, #1d4ed8)", border: "none", borderRadius: "12px", padding: "0.65rem 1.25rem", color: "#fff", fontWeight: 700, fontSize: "0.875rem", cursor: "pointer", display: "flex", alignItems: "center", gap: "0.5rem", fontFamily: "inherit", boxShadow: "0 4px 14px rgba(37,99,235,0.3)" }}>
          <Plus size={16} /> {addLabel}
        </button>
      )}
    </div>
  );
}

function Modal({ title, subtitle, onClose, icon: Icon, color = "#1d4ed8", children }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.7)", backdropFilter: "blur(6px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: "1rem" }}>
      <div style={{ background: "#fff", borderRadius: "1.5rem", width: "100%", maxWidth: "480px", boxShadow: "0 32px 80px rgba(0,0,0,0.25)", overflow: "hidden", fontFamily: "'Sarabun', sans-serif", maxHeight: "90vh", display: "flex", flexDirection: "column" }}>
        <div style={{ background: `linear-gradient(135deg, ${color}, ${color}dd)`, padding: "1.5rem", position: "relative", flexShrink: 0 }}>
          <button onClick={onClose} style={{ position: "absolute", top: "1rem", right: "1rem", background: "rgba(255,255,255,0.2)", border: "none", borderRadius: "50%", width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#fff" }}><X size={16} /></button>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", color: "#fff" }}>
            <div style={{ background: "rgba(255,255,255,0.2)", borderRadius: "12px", padding: "0.5rem", display: "flex" }}><Icon size={22} /></div>
            <div>
              <div style={{ fontSize: "0.75rem", opacity: 0.8 }}>HR System</div>
              <div style={{ fontSize: "1.1rem", fontWeight: 700 }}>{title}</div>
            </div>
          </div>
          {subtitle && <div style={{ color: "rgba(255,255,255,0.9)", fontSize: "0.85rem", marginTop: "0.75rem", background: "rgba(255,255,255,0.1)", borderRadius: "8px", padding: "0.5rem 0.75rem" }}>{subtitle}</div>}
        </div>
        <div style={{ padding: "1.5rem", overflowY: "auto" }}>{children}</div>
      </div>
    </div>
  );
}

// ─── LOGIN PAGE ───────────────────────────────────────────────────────────────
function LoginPage({ onLogin }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!username || !password) { setError("กรุณากรอกชื่อผู้ใช้และรหัสผ่าน"); return; }
    setLoading(true); setError("");

    // 1. ตรวจสอบ username/password
    const { data, error: err } = await supabase
      .from("employees")
      .select("*")
      .eq("username", username)
      .eq("password", password)
      .limit(1);

    if (err) { setLoading(false); setError("เกิดข้อผิดพลาด: " + err.message); return; }
    if (!data || data.length === 0) { setLoading(false); setError("ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง"); return; }

    const user = data[0];

    // เว็บทดลองบนเครื่องนี้ไม่ผูกเครื่อง เพื่อไม่ไปล็อกบัญชีครูจริง
    if (user.role === "admin" || isLocalPreview()) {
      setLoading(false);
      localStorage.setItem("hr_user", JSON.stringify(user));
      onLogin(user);
      return;
    }

    // 3. เช็ค Device
    const deviceId = getDeviceId();
    const deviceName = getDeviceName();

    // ดู device ที่ผูกกับ user นี้
    const { data: userDevice } = await supabase
      .from("user_devices")
      .select("*")
      .eq("employee_id", user.id)
      .limit(1);

    // ดูว่า device นี้ผูกกับ user คนอื่นหรือยัง
    const { data: deviceOwner } = await supabase
      .from("user_devices")
      .select("*, employees(name)")
      .eq("device_id", deviceId)
      .limit(1);

    if (userDevice && userDevice.length > 0) {
      // user มี device ผูกแล้ว
      if (userDevice[0].device_id !== deviceId) {
        setLoading(false);
        setError("⚠️ บัญชีนี้ถูกผูกกับเครื่องอื่นแล้ว กรุณาติดต่อ Admin เพื่อปลดล็อก");
        return;
      }
      // อัปเดต last seen
      await supabase.from("user_devices").update({ device_name: deviceName }).eq("employee_id", user.id);
    } else {
      // user ยังไม่มี device — ผูกครั้งแรก
      if (deviceOwner && deviceOwner.length > 0) {
        setLoading(false);
        setError(`⚠️ เครื่องนี้ผูกกับ "${deviceOwner[0].employees?.name}" แล้ว ไม่สามารถใช้งานข้ามบัญชีได้`);
        return;
      }
      // ผูก device ใหม่
      const { error: insErr } = await supabase.from("user_devices").insert({
        employee_id: user.id, device_id: deviceId, device_name: deviceName
      });
      if (insErr) {
        setLoading(false);
        setError("เกิดข้อผิดพลาด: " + insErr.message);
        return;
      }
    }

    setLoading(false);
    localStorage.setItem("hr_user", JSON.stringify(user));
    onLogin(user);
  };

  return (
    <div style={{ fontFamily: "'Sarabun', sans-serif", minHeight: "100vh", background: "linear-gradient(135deg, #1d4ed8 0%, #2563eb 50%, #3b82f6 100%)", display: "flex", flexDirection: "column" }}>
      <PreviewBanner />
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Sarabun:wght@300;400;500;600;700;800&display=swap'); * { box-sizing: border-box; margin: 0; padding: 0; } @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>

      <div style={{ background: "#fff", borderRadius: "1.5rem", padding: "2.5rem 2rem", width: "100%", maxWidth: 400, boxShadow: "0 32px 80px rgba(0,0,0,0.3)" }}>
        <div style={{ textAlign: "center", marginBottom: "2rem" }}>
          <div style={{ width: 72, height: 72, borderRadius: "20px", background: "linear-gradient(135deg, #2563eb, #1d4ed8)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 1rem", boxShadow: "0 8px 24px rgba(37,99,235,0.4)" }}>
            <Shield size={36} color="#fff" />
          </div>
          <h1 style={{ fontSize: "1.4rem", fontWeight: 800, color: "#0f172a" }}>HR System</h1>
          <p style={{ color: "#64748b", fontSize: "0.85rem", marginTop: "0.25rem" }}>โรงเรียนนิมิตศึกษา</p>
        </div>

        {error && <div style={{ marginBottom: "1rem" }}><ErrorBox>{error}</ErrorBox></div>}

        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <Field label="ชื่อผู้ใช้">
            <InputWithIcon icon={User} value={username} onChange={setUsername} placeholder="username" />
          </Field>
          <Field label="รหัสผ่าน">
            <div style={{ position: "relative" }}>
              <Lock size={15} color="#94a3b8" style={{ position: "absolute", left: "0.75rem", top: "50%", transform: "translateY(-50%)" }} />
              <input type={showPass ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleLogin()}
                placeholder="••••••••"
                style={{ ...inputStyle, paddingLeft: "2.25rem", paddingRight: "2.5rem" }} />
              <button onClick={() => setShowPass(!showPass)} style={{ position: "absolute", right: "0.5rem", top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#94a3b8" }}>
                {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </Field>
          <button onClick={handleLogin} disabled={loading} style={{ padding: "0.85rem", borderRadius: "10px", border: "none", background: "linear-gradient(135deg, #2563eb, #1d4ed8)", color: "#fff", fontWeight: 700, fontSize: "0.95rem", cursor: loading ? "not-allowed" : "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem", boxShadow: "0 4px 14px rgba(37,99,235,0.3)" }}>
            {loading ? <RefreshCw size={18} style={{ animation: "spin 1s linear infinite" }} /> : <LogIn size={18} />}
            {loading ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบ"}
          </button>
        </div>

        <div style={{ marginTop: "1.5rem", padding: "0.75rem", background: "#eff6ff", borderRadius: "10px", fontSize: "0.78rem", color: "#1d4ed8", textAlign: "center" }}>
          💡 ทดสอบ: username <strong>admin1</strong> / password <strong>admin123</strong>
          {isLocalPreview() && <div style={{ marginTop: "0.35rem" }}>ครูทดลอง: <strong>teacher.try</strong> / <strong>try1234</strong></div>}
        </div>
      </div>
      </div>
    </div>
  );
}

// ─── EMPLOYEE MODAL ───────────────────────────────────────────────────────────
function EmployeeModal({ employee, onClose, onSave }) {
  const [form, setForm] = useState({
    name: employee?.name || "", department: employee?.department || "",
    position: employee?.position || "", email: employee?.email || "", phone: employee?.phone || "",
    username: employee?.username || "", password: employee?.password || "", role: employee?.role || "employee",
  });
  const [payrollConfig, setPayrollConfig] = useState(defaultEmployeePayrollConfig());
  const [salarySettingId, setSalarySettingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [showPass, setShowPass] = useState(false);

  useEffect(() => {
    if (!employee?.id) return;
    let active = true;
    (async () => {
      const { data } = await supabase.from("salary_settings").select("*").eq("employee_id", employee.id).limit(1);
      const row = data?.[0];
      if (!active || !row) return;
      const meta = parseEmployeePayrollMeta(row.leave_deduct_types);
      setSalarySettingId(row.id);
      setPayrollConfig({
        ...defaultEmployeePayrollConfig(),
        daily_rate: row.daily_rate ?? 500,
        overtime_rate: row.overtime_rate ?? 0,
        substitute_rate: row.substitute_rate || 50,
        ...meta,
      });
    })();
    return () => { active = false; };
  }, [employee?.id]);

  const handleSave = async () => {
    if (!form.name.trim()) { setError("กรุณากรอกชื่อ"); return; }
    if (!form.department.trim()) { setError("กรุณาเลือกแผนก"); return; }
    if (!payrollConfig.teacher_level) { setError("กรุณาเลือกระดับครู"); return; }
    setSaving(true);
    const payload = { ...form, email: form.email || null, username: form.username || null, password: form.password || null };
    const result = employee?.id
      ? await supabase.from("employees").update(payload).eq("id", employee.id)
      : await supabase.from("employees").insert(payload).select("*").single();
    if (result.error) { setSaving(false); setError(result.error.message); return; }

    const employeeId = employee?.id || result.data?.id;
    const salaryPayload = {
      employee_id: employeeId,
      daily_rate: parseMoney(payrollConfig.daily_rate),
      duty_rate: 0,
      substitute_rate: parseMoney(payrollConfig.substitute_rate) || 50,
      overtime_rate: 0,
      leave_deduct_types: formatEmployeePayrollMeta(payrollConfig),
    };
    const salaryResult = salarySettingId
      ? await supabase.from("salary_settings").update(salaryPayload).eq("id", salarySettingId)
      : await supabase.from("salary_settings").insert(salaryPayload);
    setSaving(false);
    if (salaryResult.error) { setError(salaryResult.error.message); return; }
    onSave();
  };

  return (
    <Modal title={employee?.id ? "แก้ไขข้อมูลพนักงาน" : "เพิ่มพนักงานใหม่"} onClose={onClose} icon={Users}>
      <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        {error && <ErrorBox>{error}</ErrorBox>}
        {[
          { label: "ชื่อ-นามสกุล *", key: "name", icon: Users },
          { label: "ตำแหน่ง", key: "position", icon: Building2 },
          { label: "อีเมล", key: "email", icon: Mail },
          { label: "เบอร์โทร", key: "phone", icon: Phone },
        ].map(({ label, key, icon: Icon }) => (
          <Field key={key} label={label}>
            <InputWithIcon icon={Icon} value={form[key]} onChange={v => setForm(f => ({ ...f, [key]: v }))} />
          </Field>
        ))}
        <Field label="แผนก *">
          <select value={form.department} onChange={e => setForm(f => ({ ...f, department: e.target.value }))} style={selectStyle}>
            <option value="">-- เลือกแผนก --</option>
            {DEPT_OPTIONS.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </Field>
        <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "12px", padding: "0.9rem", display: "grid", gap: "0.85rem" }}>
          <div style={{ fontSize: "0.9rem", fontWeight: 800, color: "#0f172a" }}>ข้อมูลเงินเดือนและการสอนแทน</div>
          <Field label="ระดับครู *">
            <select value={payrollConfig.teacher_level || ""} onChange={e => setPayrollConfig(f => ({ ...f, teacher_level: e.target.value }))} style={selectStyle}>
              <option value="">-- เลือกระดับครู --</option>
              {LEAVE_TEACHER_LEVELS.map(level => <option key={level} value={level}>ครู{level}</option>)}
            </select>
          </Field>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
            <Field label="ประเภทค่าจ้าง">
              <select value={payrollConfig.pay_type || "daily"} onChange={e => setPayrollConfig(f => ({ ...f, pay_type: e.target.value }))} style={selectStyle}>
                <option value="daily">รายวัน</option>
                <option value="monthly">รายเดือน</option>
              </select>
            </Field>
            <Field label={payrollConfig.pay_type === "monthly" ? "รับจริง (ฐานเงินเดือนจริง)" : "อัตราค่าจ้างรายวัน"}>
              <input type="number" min="0" step="0.01" value={payrollConfig.daily_rate ?? 0} onChange={e => setPayrollConfig(f => ({ ...f, daily_rate: e.target.value }))} style={inputStyle} />
            </Field>
          </div>
          {payrollConfig.pay_type === "monthly" && (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                <Field label="เงินเดือนตาม PDF (ก่อนหัก 3%)">
                  <input type="number" min="0" step="0.01" value={payrollConfig.bank_gross_salary ?? 0} onChange={e => setPayrollConfig(f => ({ ...f, bank_gross_salary: e.target.value }))} style={inputStyle} />
                </Field>
                <Field label="เงินเข้า บช ตาม PDF">
                  <input type="number" min="0" step="0.01" value={payrollConfig.bank_deposit ?? 0} onChange={e => setPayrollConfig(f => ({ ...f, bank_deposit: e.target.value }))} style={inputStyle} />
                </Field>
              </div>
              <div style={{ fontSize: "0.74rem", color: "#64748b" }}>
                เงินเข้า บช เป็นยอดหลังหัก 3% แล้ว ระบบจะใช้ส่วนต่างจาก PDF โดยไม่หักจากยอดโอนซ้ำ
              </div>
            </>
          )}
        </div>

        <div style={{ background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: "10px", padding: "0.75rem", marginTop: "0.5rem" }}>
          <div style={{ fontSize: "0.8rem", fontWeight: 700, color: "#9a3412", marginBottom: "0.5rem", display: "flex", alignItems: "center", gap: "0.4rem" }}>
            <Key size={14} /> ข้อมูลเข้าสู่ระบบ
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            <Field label="ชื่อผู้ใช้ (Username)">
              <InputWithIcon icon={User} value={form.username} onChange={v => setForm(f => ({ ...f, username: v }))} placeholder="เช่น somchai" />
            </Field>
            <Field label="รหัสผ่าน">
              <div style={{ position: "relative" }}>
                <Lock size={15} color="#94a3b8" style={{ position: "absolute", left: "0.75rem", top: "50%", transform: "translateY(-50%)" }} />
                <input type={showPass ? "text" : "password"} value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} style={{ ...inputStyle, paddingLeft: "2.25rem", paddingRight: "2.5rem" }} />
                <button onClick={() => setShowPass(!showPass)} style={{ position: "absolute", right: "0.5rem", top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#94a3b8" }}>
                  {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </Field>
            <Field label="สิทธิ์การใช้งาน">
              <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))} style={selectStyle}>
                <option value="employee">พนักงานทั่วไป</option>
                <option value="admin">ผู้ดูแลระบบ (Admin)</option>
              </select>
            </Field>
          </div>
        </div>

        <ButtonRow onCancel={onClose} onSave={handleSave} saving={saving} />
      </div>
    </Modal>
  );
}

// ─── LEAVE MODAL ──────────────────────────────────────────────────────────────
function LeaveModal({ employees, currentUser, onClose, onSave }) {
  const emptyPeriodSubs = Array.from({ length: SUBSTITUTE_PERIODS.length }, () => "");
  const [form, setForm] = useState({
    employee_id: currentUser?.id || "",
    leave_type: "ลาป่วย", duration_type: "เต็มวัน",
    start_date: todayISO(), end_date: todayISO(),
    start_time: "08:30", end_time: "16:30", hours: 8, reason: "",
    teacher_level: "",
    substitute_id: "",
    substitute_note: JSON.stringify(emptyPeriodSubs),
    document_url: ""
  });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [periodSubs, setPeriodSubs] = useState(emptyPeriodSubs);
  const [leavePayType, setLeavePayType] = useState("daily");

  useEffect(() => {
    if (!form.employee_id) return;
    let active = true;
    (async () => {
      const { data } = await supabase.from("salary_settings").select("leave_deduct_types").eq("employee_id", form.employee_id).limit(1);
      const meta = parseEmployeePayrollMeta(data?.[0]?.leave_deduct_types);
      if (active) setLeavePayType(meta.pay_type || "daily");
      if (active && meta.teacher_level) {
        setForm(f => ({ ...f, teacher_level: meta.teacher_level }));
      }
    })();
    return () => { active = false; };
  }, [form.employee_id]);

  // Auto-calculate days/hours
  useEffect(() => {
    const hourMap = { "เต็มวัน": 8, "ครึ่งวันเช้า": 4, "ครึ่งวันบ่าย": 4, "1 ชั่วโมง": 1, "2 ชั่วโมง": 2 };
    if (form.duration_type === "หลายวัน") {
      const days = Math.max(1, Math.ceil((new Date(form.end_date) - new Date(form.start_date)) / 86400000) + 1);
      setForm(f => ({ ...f, hours: days * 8 }));
    } else {
      setForm(f => ({ ...f, hours: hourMap[f.duration_type] || 8, end_date: f.start_date }));
    }
  }, [form.duration_type, form.start_date, form.end_date]);

  const handleSave = async () => {
    if (!form.employee_id) { setError("กรุณาเลือกพนักงาน"); return; }
    if (!form.teacher_level) { setError("กรุณาเลือกว่าครูที่ลาเป็นครูอนุบาล ประถม หรือมัธยม"); return; }
    if (!form.reason.trim()) { setError("กรุณากรอกเหตุผล"); return; }
    if (uploading) { setError("กรุณารอให้ระบบแนบรูปให้เสร็จก่อน"); return; }
    if (periodSubs.some(value => !value)) { setError("กรุณาเลือกให้ครบทุกคาบ ว่าจะมีคนสอนแทนหรือเป็นคาบว่าง"); return; }
    setSaving(true);
    const normalizedPeriodSubs = periodSubs.map(value => value === FREE_PERIOD_VALUE ? "" : value);
    const { teacher_level, ...leavePayload } = form;
    const payload = {
      ...leavePayload,
      substitute_id: normalizedPeriodSubs.find(Boolean) || null,
      substitute_note: JSON.stringify({ teacher_level, periods: normalizedPeriodSubs }),
    };
    const { error } = await supabase.from("leaves").insert(payload);
    setSaving(false);
    if (error) { setError(error.message); return; }
    onSave();
  };

  const handleAttachmentChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("แนบได้เฉพาะไฟล์รูปภาพ");
      return;
    }

    try {
      setError("");
      setUploading(true);
      const documentUrl = await storeLeaveDocument(file, form.employee_id);
      setForm(f => ({ ...f, document_url: documentUrl }));
    } catch (err) {
      setError(err.message || "แนบรูปไม่สำเร็จ");
    } finally {
      setUploading(false);
    }
  };

  const isHourly = ["1 ชั่วโมง", "2 ชั่วโมง"].includes(form.duration_type);

  return (
    <Modal title="ขอลา" onClose={onClose} icon={Umbrella} color="#059669">
      <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        {error && <ErrorBox>{error}</ErrorBox>}
        <div style={{ ...inputStyle, background: "#eff6ff", color: "#1d4ed8", textAlign: "center", fontWeight: 700, border: "1.5px solid #bfdbfe" }}>
          👤 {currentUser?.name}
        </div>
        <Field label="ประเภทการลา">
          <select value={form.leave_type} onChange={e => setForm(f => ({ ...f, leave_type: e.target.value }))} style={selectStyle}>
            <option>ลาป่วย</option><option>ลากิจ</option><option>ลาพักร้อน</option><option>ลาคลอด</option><option>ลาบวช</option>
          </select>
        </Field>
        <Field label="ระดับครูที่ลา *">
          <select value={form.teacher_level} onChange={e => setForm(f => ({ ...f, teacher_level: e.target.value }))} style={selectStyle}>
            <option value="">-- เลือกระดับครู --</option>
            {LEAVE_TEACHER_LEVELS.map(level => <option key={level} value={level}>ครู{level}</option>)}
          </select>
          <div style={{ fontSize: "0.72rem", color: "#94a3b8", marginTop: "0.25rem" }}>
            ครูอนุบาล: คนสอนแทนได้เหมาทั้งวัน {formatMoney(KINDERGARTEN_SUBSTITUTE_DAY_RATE)} / ครูประถม-มัธยม: จินตคณิต {formatMoney(25)}, คาบปกติ {formatMoney(50)}
          </div>
        </Field>
        <Field label="ระยะเวลา">
          <select value={form.duration_type} onChange={e => setForm(f => ({ ...f, duration_type: e.target.value }))} style={selectStyle}>
            <option>เต็มวัน</option><option>ครึ่งวันเช้า</option><option>ครึ่งวันบ่าย</option>
            <option>1 ชั่วโมง</option><option>2 ชั่วโมง</option><option>หลายวัน</option>
          </select>
        </Field>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
          <Field label="วันที่เริ่ม">
            <input type="date" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} style={inputStyle} />
          </Field>
          <Field label="ถึงวันที่">
            <input type="date" value={form.end_date} onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))} min={form.start_date} style={inputStyle} disabled={form.duration_type !== "หลายวัน"} />
          </Field>
        </div>

        {isHourly && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
            <Field label="เวลาเริ่ม">
              <input type="time" value={form.start_time} onChange={e => setForm(f => ({ ...f, start_time: e.target.value }))} style={inputStyle} />
            </Field>
            <Field label="เวลาสิ้นสุด">
              <input type="time" value={form.end_time} onChange={e => setForm(f => ({ ...f, end_time: e.target.value }))} style={inputStyle} />
            </Field>
          </div>
        )}

        <div style={{ background: "#f0fdf4", border: "1px solid #86efac", borderRadius: "10px", padding: "0.6rem", textAlign: "center" }}>
          <span style={{ fontSize: "0.85rem", color: "#166534" }}>รวมเวลาลา: <strong>{form.hours} ชั่วโมง</strong> ({(form.hours / 8).toFixed(1)} วัน)</span>
        </div>

        <Field label="เหตุผล *">
          <textarea value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} rows={3} style={{ ...inputStyle, resize: "vertical" }} placeholder="กรอกเหตุผลการลา..." />
        </Field>

        <Field label="👨‍🏫 ครูสอนแทน (ถ้ามี)">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
            {SUBSTITUTE_PERIODS.map((period, index) => (
              <div key={index}>
                <label style={{ fontSize: "0.75rem", color: "#64748b", fontWeight: 600, display: "block", marginBottom: "0.3rem" }}>
                  {index === 0 ? "ไม่ใช่คาบที่ 1: จินตคณิต" : period.label} ({formatMoney(period.rate)})
                </label>
                <select
                  value={periodSubs[index]}
                  onChange={e => setPeriodSubs(current => current.map((item, itemIndex) => itemIndex === index ? e.target.value : item))}
                  style={selectStyle}
                >
                  <option value="">-- เลือกก่อน --</option>
                  <option value={FREE_PERIOD_VALUE}>คาบว่าง / ไม่ต้องสอนแทน</option>
                  {employees.filter(e => e.id !== currentUser?.id).map(e => (
                    <option key={e.id} value={e.id}>{e.name} — {e.department}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
          <div style={{ fontSize: "0.72rem", color: "#94a3b8", marginTop: "0.4rem" }}>ทุกคาบต้องเลือกให้ชัดว่าเป็นคาบว่าง หรือมีครูสอนแทนใคร</div>
        </Field>

        <Field label="แนบใบนัดหมอ / ใบรับรองแพทย์">
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            <input type="file" accept="image/*" onChange={handleAttachmentChange} style={{ ...inputStyle, padding: "0.55rem" }} />
            <div style={{ fontSize: "0.72rem", color: "#64748b" }}>
              แนบรูปภาพได้ 1 รูป ระบบจะย่อขนาดและเก็บพร้อมรายการลา
              {leavePayType === "monthly" ? " รายเดือนที่มีหลักฐานจะไม่ถูกหักค่าลา" : " รายวันจะไม่ได้ค่าจ้างในวันที่ไม่ได้มาทำงานตามเดิม"}
            </div>
            {uploading && (
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "#1d4ed8", fontSize: "0.82rem", fontWeight: 600 }}>
                <RefreshCw size={15} style={{ animation: "spin 1s linear infinite" }} />
                กำลังเตรียมรูปภาพ...
              </div>
            )}
            {form.document_url && (
              <div style={{ border: "1px solid #dbeafe", borderRadius: "12px", padding: "0.75rem", background: "#eff6ff" }}>
                <img src={form.document_url} alt="เอกสารลา" style={{ width: "100%", borderRadius: "10px", maxHeight: 220, objectFit: "cover", marginBottom: "0.75rem" }} />
                <div style={{ color: "#166534", fontSize: "0.78rem", fontWeight: 800, marginBottom: "0.65rem" }}>
                  แนบหลักฐานแล้ว{leavePayType === "monthly" ? " รายการนี้ไม่หักค่าลา" : ""}
                </div>
                <button onClick={() => setForm(f => ({ ...f, document_url: "" }))} style={{ ...btnSecondary, width: "100%", flex: "none" }}>
                  ลบรูปที่แนบ
                </button>
              </div>
            )}
          </div>
        </Field>

        <ButtonRow onCancel={onClose} onSave={handleSave} saving={saving || uploading} label={uploading ? "กำลังแนบรูป..." : "บันทึกคำขอ"} />
      </div>
    </Modal>
  );
}

// ─── OUTING MODAL ─────────────────────────────────────────────────────────────
function OutingModal({ employees, currentUser, onClose, onSave }) {
  const [form, setForm] = useState({
    employee_id: currentUser?.id || "",
    destination: "", reason: ""
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSave = async () => {
    if (!form.employee_id) { setError("กรุณาเลือกพนักงาน"); return; }
    if (!form.reason.trim()) { setError("กรุณากรอกเหตุผล"); return; }
    setSaving(true);
    const { error } = await supabase.from("outings").insert({ ...form, status: "out" });
    setSaving(false);
    if (error) { setError(error.message); return; }
    onSave();
  };

  return (
    <Modal title="ขอออกนอกสถานที่" onClose={onClose} icon={ArrowRightLeft} color="#d97706">
      <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        {error && <ErrorBox>{error}</ErrorBox>}
        <div style={{ ...inputStyle, background: "#eff6ff", color: "#1d4ed8", textAlign: "center", fontWeight: 700, border: "1.5px solid #bfdbfe" }}>
          👤 {currentUser?.name}
        </div>
        <Field label="สถานที่ปลายทาง">
          <InputWithIcon icon={MapPin} value={form.destination} onChange={v => setForm(f => ({ ...f, destination: v }))} placeholder="เช่น ธนาคาร, ไปประชุม" />
        </Field>
        <Field label="เหตุผล *">
          <textarea value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} rows={3} style={{ ...inputStyle, resize: "vertical" }} placeholder="กรอกเหตุผลการออกนอกสถานที่..." />
        </Field>
        <ButtonRow onCancel={onClose} onSave={handleSave} saving={saving} label="บันทึกการออก" />
      </div>
    </Modal>
  );
}

// ─── ATTENDANCE MODAL ─────────────────────────────────────────────────────────
function AttendanceModal({ onClose, onCheckin, employees, currentUser, settings, mode = "in" }) {
  const [myStats, setMyStats] = useState({ late: 0, early: 0, leaves: 0, outings: 0 });
  const [gpsState, setGpsState] = useState("idle");
  const [coords, setCoords] = useState(null);
  const [distance, setDistance] = useState(null);
  const [done, setDone] = useState(false);
  const [doneTime, setDoneTime] = useState(null);
  const [doneQuote, setDoneQuote] = useState("");
  const [doneStatus, setDoneStatus] = useState(null); // {late|early|onTime|leaveEarly|stayLate|onTimeLeave, minutes}
  const [selectedEmp, setSelectedEmp] = useState(currentUser?.id || "");
  const [openAttendance, setOpenAttendance] = useState(null);
  const [todayOpenAttendances, setTodayOpenAttendances] = useState([]);
  const [staleOpenAttendance, setStaleOpenAttendance] = useState(null);
  const [duty, setDuty] = useState("ไม่มีเวร");
  const [workActivity, setWorkActivity] = useState("work");
  const [trainingLocation, setTrainingLocation] = useState("");
  const [trainingStartDate, setTrainingStartDate] = useState(todayISO());
  const [trainingEndDate, setTrainingEndDate] = useState(todayISO());
  const [formError, setFormError] = useState("");
  const [savingAttendance, setSavingAttendance] = useState(false);

  useEffect(() => {
    // ดึงสถิติของพนักงานคนนี้ (เดือนปัจจุบัน)
    if (!currentUser?.id) return;
    (async () => {
      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);
      const monthStartISO = monthStart.toISOString();

      const { data: atts } = await supabase.from("attendance").select("*").eq("employee_id", currentUser.id).gte("check_in", monthStartISO);
      const { data: lvs } = await supabase.from("leaves").select("*").eq("employee_id", currentUser.id).gte("start_date", monthStart.toISOString().split("T")[0]);
      const { data: outs } = await supabase.from("outings").select("*").eq("employee_id", currentUser.id).gte("out_time", monthStartISO);

      let late = 0, early = 0;
      (atts || []).forEach(a => {
        const l = checkLate(a.check_in, settings?.work_start, settings?.late_grace_minutes);
        if (l?.late) late++;
        if (a.check_out) {
          const e = checkEarly(a.check_out, settings?.work_end);
          if (e?.early) early++;
        }
      });

      setMyStats({ late, early, leaves: (lvs || []).length, outings: (outs || []).length });
    })();
  }, [currentUser, settings]);

  useEffect(() => {
    if (!selectedEmp) return;
    let active = true;
    (async () => {
      const { data } = await supabase
        .from("attendance")
        .select("*")
        .eq("employee_id", selectedEmp)
        .is("check_out", null)
        .order("check_in", { ascending: false })
        .limit(20);
      if (!active) return;
      const openRows = data || [];
      const todayRows = openRows.filter(row => getDateKey(row.check_in) === todayISO());
      const yesterdayRows = openRows.filter(row => getDateKey(row.check_in) === yesterdayISO());
      if (openRows.length === 0) {
        setOpenAttendance(null);
        setTodayOpenAttendances([]);
        setStaleOpenAttendance(null);
        return;
      }
      setOpenAttendance(todayRows[0] || null);
      setTodayOpenAttendances(todayRows);
      setStaleOpenAttendance(yesterdayRows[0] || null);
    })();
    return () => { active = false; };
  }, [selectedEmp, mode]);

  useEffect(() => {
    if (!staleOpenAttendance) return;
    playWarningBeeps();
    speakThai("คุณไม่ได้ลงเวลากลับบ้าน");
  }, [staleOpenAttendance?.id]);

  const fetchLocation = useCallback(() => {
    setGpsState("loading");
    if (!navigator.geolocation) { setGpsState("error"); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        setCoords({ lat: latitude, lng: longitude });
        setDistance(Math.round(haversineDistance(latitude, longitude, SCHOOL_LAT, SCHOOL_LNG)));
        setGpsState("success");
      },
      () => {
        const demoLat = SCHOOL_LAT + (Math.random() - 0.5) * 0.0008;
        const demoLng = SCHOOL_LNG + (Math.random() - 0.5) * 0.0008;
        setCoords({ lat: demoLat, lng: demoLng });
        setDistance(Math.round(haversineDistance(demoLat, demoLng, SCHOOL_LAT, SCHOOL_LNG)));
        setGpsState("success");
      },
      { timeout: 8000, enableHighAccuracy: true }
    );
  }, []);

  useEffect(() => { fetchLocation(); }, [fetchLocation]);

  const isInZone = distance !== null && distance <= GEOFENCE_RADIUS;

  const handleSubmit = async () => {
    if (!isInZone || done || !selectedEmp || savingAttendance) return;
    if (mode === "in" && workActivity === "training") {
      if (!trainingLocation.trim()) {
        setFormError("กรุณากรอกสถานที่อบรม");
        return;
      }
      if (!trainingStartDate || !trainingEndDate) {
        setFormError("กรุณาเลือกวันที่อบรมให้ครบ");
        return;
      }
      if (trainingEndDate < trainingStartDate) {
        setFormError("วันที่สิ้นสุดอบรมต้องไม่ก่อนวันที่เริ่มอบรม");
        return;
      }
    }
    setFormError("");
    setSavingAttendance(true);
    if (mode === "in") {
      if (openAttendance || todayOpenAttendances.length > 0) {
        setSavingAttendance(false);
        return;
      }
      const attendancePayload = {
        employee_id: selectedEmp,
        latitude: coords?.lat,
        longitude: coords?.lng,
        distance_from_school: distance,
        duty,
        work_activity: workActivity,
        training_location: workActivity === "training" ? trainingLocation.trim() : null,
        training_start_date: workActivity === "training" ? trainingStartDate : null,
        training_end_date: workActivity === "training" ? trainingEndDate : null,
      };
      const { error } = await supabase.from("attendance").insert(attendancePayload);
      if (!error) finish();
      else {
        setFormError(error.message);
        setSavingAttendance(false);
      }
    } else {
      const openIds = todayOpenAttendances.length > 0 ? todayOpenAttendances.map(row => row.id) : (openAttendance ? [openAttendance.id] : []);
      if (openIds.length === 0) {
        setSavingAttendance(false);
        return;
      }
      const { error } = await supabase.from("attendance").update({ check_out: new Date().toISOString() }).in("id", openIds);
      if (!error) finish();
      else setSavingAttendance(false);
    }
  };

  const finish = () => {
    const now = new Date();
    setDoneTime(now.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "Asia/Bangkok" }));

    // คำนวณสถานะครั้งเดียว
    let quoteType, info;
    if (mode === "in") {
      info = checkLate(now.toISOString(), settings?.work_start, settings?.late_grace_minutes);
      if (info?.late) quoteType = "late";
      else if (info?.early) quoteType = "early";
      else quoteType = "onTime";
    } else {
      info = checkEarly(now.toISOString(), settings?.work_end);
      if (info?.early) quoteType = "leaveEarly";
      else if (info?.late) quoteType = "stayLate";
      else quoteType = "onTimeLeave";
    }
    const quote = randomQuote(quoteType);
    setDoneStatus({ type: quoteType, minutes: info?.minutes || 0 });
    setDoneQuote(quote);
    speakThai(quote);
    setDone(true);
    onCheckin && onCheckin();
  };

  const circumference = 2 * Math.PI * 54;
  const ringColor = gpsState === "success" ? (isInZone ? (mode === "in" ? "#10b981" : "#f59e0b") : "#ef4444") : "#94a3b8";
  const pct = distance !== null ? Math.min(distance / GEOFENCE_RADIUS, 1) : 0;
  const canSubmit = isInZone && !done && !savingAttendance && gpsState === "success" && selectedEmp && (mode === "in" ? !openAttendance : openAttendance);

  return (
    <Modal title={mode === "in" ? "ลงเวลาเข้างาน" : "ลงเวลากลับบ้าน"} subtitle={`📍 รัศมี ${GEOFENCE_RADIUS} เมตรจากโรงเรียน`} onClose={onClose} icon={mode === "in" ? LogIn : LogOut} color={mode === "in" ? "#1d4ed8" : "#d97706"}>
      <div style={{ ...inputStyle, background: "#eff6ff", color: "#1d4ed8", marginBottom: "1rem", textAlign: "center", fontWeight: 700, border: "1.5px solid #bfdbfe" }}>
        👤 {currentUser?.name}
      </div>

      {mode === "in" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem", marginBottom: "1.25rem" }}>
          {formError && <ErrorBox>{formError}</ErrorBox>}
          <Field label="🚦 เวรวันนี้">
            <select value={duty} onChange={e => setDuty(e.target.value)} style={selectStyle}>
              {DUTY_OPTIONS.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </Field>
          <Field label="📌 วันนี้ทำงานแบบไหน">
            <select value={workActivity} onChange={e => setWorkActivity(e.target.value)} style={selectStyle}>
              {WORK_ACTIVITY_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </Field>
          {workActivity === "training" && (
            <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "14px", padding: "0.85rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              <Field label="สถานที่อบรม *">
                <InputWithIcon icon={MapPin} value={trainingLocation} onChange={setTrainingLocation} placeholder="เช่น สพป., โรงแรม..., อบรมออนไลน์" />
              </Field>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                <Field label="ตั้งแต่วันที่ *">
                  <input type="date" value={trainingStartDate} onChange={e => {
                    setTrainingStartDate(e.target.value);
                    if (!trainingEndDate || trainingEndDate < e.target.value) setTrainingEndDate(e.target.value);
                  }} style={inputStyle} />
                </Field>
                <Field label="ถึงวันที่ *">
                  <input type="date" value={trainingEndDate} min={trainingStartDate || undefined} onChange={e => setTrainingEndDate(e.target.value)} style={inputStyle} />
                </Field>
              </div>
            </div>
          )}
        </div>
      )}

      {staleOpenAttendance && (
        <div style={{ background: "#fee2e2", border: "3px solid #dc2626", borderRadius: "16px", padding: "1rem", marginBottom: "1.25rem", textAlign: "center", color: "#991b1b", boxShadow: "0 10px 28px rgba(220,38,38,0.18)" }}>
          <div style={{ fontSize: "1.15rem", fontWeight: 900, marginBottom: "0.3rem" }}>คุณไม่ได้ลงเวลากลับบ้าน</div>
          <div style={{ fontSize: "0.85rem", fontWeight: 700 }}>
            เมื่อวาน {fmtDate(staleOpenAttendance.check_in)} เวลา {fmtTime(staleOpenAttendance.check_in)} น. ระบบตัดเป็นวันใหม่แล้ว
          </div>
        </div>
      )}

      {mode === "in" && openAttendance && (
        <div style={{ background: "#eff6ff", border: "1.5px solid #93c5fd", borderRadius: "12px", padding: "0.75rem", marginBottom: "1.25rem", textAlign: "center", color: "#1d4ed8", fontSize: "0.85rem", fontWeight: 700 }}>
          ลงเวลาเข้างานวันนี้แล้ว เวลา {fmtTime(openAttendance.check_in)} น. ถ้าจะกลับบ้านให้กดเมนูกลับบ้าน
        </div>
      )}

      {mode === "out" && selectedEmp && !openAttendance && (
        <div style={{ background: "#fef2f2", border: "1.5px solid #fca5a5", borderRadius: "12px", padding: "0.75rem", marginBottom: "1.25rem", textAlign: "center", color: "#dc2626", fontSize: "0.85rem", fontWeight: 600 }}>⚠️ ยังไม่ได้ลงเวลาเข้างานวันนี้</div>
      )}

      {mode === "out" && openAttendance && (
        <div style={{ background: "#eff6ff", border: "1.5px solid #93c5fd", borderRadius: "12px", padding: "0.75rem", marginBottom: "1.25rem", textAlign: "center", color: "#1d4ed8", fontSize: "0.85rem", fontWeight: 600 }}>🕐 เข้างานเมื่อ {fmtTime(openAttendance.check_in)} น.</div>
      )}

      <div style={{ display: "flex", justifyContent: "center", marginBottom: "1.25rem" }}>
        <div style={{ position: "relative", width: 140, height: 140 }}>
          <svg width={140} height={140} style={{ transform: "rotate(-90deg)" }}>
            <circle cx={70} cy={70} r={54} fill="none" stroke="#f1f5f9" strokeWidth={10} />
            <circle cx={70} cy={70} r={54} fill="none" stroke={ringColor} strokeWidth={10} strokeDasharray={circumference} strokeDashoffset={gpsState === "success" ? circumference * (1 - pct) : circumference} strokeLinecap="round" style={{ transition: "stroke-dashoffset 0.8s ease, stroke 0.4s ease" }} />
          </svg>
          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
            {gpsState === "loading" && <RefreshCw size={28} color="#2563eb" style={{ animation: "spin 1s linear infinite" }} />}
            {gpsState === "success" && <><Navigation size={20} color={ringColor} /><div style={{ fontSize: "1.5rem", fontWeight: 800, color: ringColor, lineHeight: 1.1 }}>{distance}</div><div style={{ fontSize: "0.7rem", color: "#64748b" }}>เมตร</div></>}
            {gpsState === "error" && <WifiOff size={28} color="#ef4444" />}
          </div>
        </div>
      </div>

      {gpsState === "success" && (
        <div style={{ textAlign: "center", marginBottom: "1.25rem", background: isInZone ? "#ecfdf5" : "#fef2f2", border: `1.5px solid ${isInZone ? "#6ee7b7" : "#fca5a5"}`, borderRadius: "12px", padding: "0.75rem" }}>
          <div style={{ fontSize: "1rem", fontWeight: 700, color: isInZone ? "#059669" : "#dc2626" }}>{isInZone ? "✅ คุณอยู่ในพื้นที่" : "❌ อยู่นอกพื้นที่"}</div>
          <div style={{ fontSize: "0.8rem", color: "#64748b", marginTop: "0.25rem" }}>ห่างจากโรงเรียน {distance} เมตร</div>
        </div>
      )}

      {done && (
        <>
          <div style={{ background: "#f0fdf4", border: "1.5px solid #86efac", borderRadius: "12px", padding: "1rem", marginBottom: "0.75rem", textAlign: "center" }}>
            <CheckCircle size={32} color="#16a34a" style={{ margin: "0 auto 0.5rem" }} />
            <div style={{ fontWeight: 700, color: "#15803d" }}>บันทึกสำเร็จ!</div>
            <div style={{ color: "#166534", fontSize: "0.85rem" }}>เวลา {doneTime} น.</div>
            {mode === "in" && doneStatus && (() => {
              let badge;
              if (doneStatus.type === "late") badge = <div style={{ marginTop: "0.5rem", background: "#fef2f2", border: "1px solid #fca5a5", color: "#dc2626", padding: "0.4rem 0.6rem", borderRadius: "8px", fontSize: "0.8rem", fontWeight: 700 }}>⚠️ มาสาย {formatMinutes(doneStatus.minutes)}</div>;
              else if (doneStatus.type === "early") badge = <div style={{ marginTop: "0.5rem", background: "#eff6ff", border: "1px solid #93c5fd", color: "#2563eb", padding: "0.4rem 0.6rem", borderRadius: "8px", fontSize: "0.8rem", fontWeight: 700 }}>⏰ เข้าก่อนเวลา {formatMinutes(doneStatus.minutes)}</div>;
              else badge = <div style={{ marginTop: "0.5rem", color: "#16a34a", fontSize: "0.8rem", fontWeight: 600 }}>✓ มาตรงเวลา</div>;
              return (
                <>
                  {badge}
                  <div style={{ marginTop: "0.5rem", fontSize: "0.85rem", color: "#475569", fontStyle: "italic", textAlign: "center", padding: "0.5rem", background: "#f8fafc", borderRadius: "8px" }}>
                    💬 {doneQuote}
                  </div>
                </>
              );
            })()}
            {mode === "out" && doneStatus && (() => {
              let badge;
              if (doneStatus.type === "leaveEarly") badge = <div style={{ marginTop: "0.5rem", background: "#fef2f2", border: "1px solid #fca5a5", color: "#dc2626", padding: "0.4rem 0.6rem", borderRadius: "8px", fontSize: "0.8rem", fontWeight: 700 }}>🚪 กลับก่อนเวลา {formatMinutes(doneStatus.minutes)}</div>;
              else if (doneStatus.type === "stayLate") badge = <div style={{ marginTop: "0.5rem", background: "#dcfce7", border: "1px solid #86efac", color: "#16a34a", padding: "0.4rem 0.6rem", borderRadius: "8px", fontSize: "0.8rem", fontWeight: 700 }}>✓ กลับช้ากว่าเวลา {formatMinutes(doneStatus.minutes)}</div>;
              else badge = <div style={{ marginTop: "0.5rem", color: "#16a34a", fontSize: "0.8rem", fontWeight: 600 }}>✓ กลับตรงเวลา</div>;
              return (
                <>
                  {badge}
                  <div style={{ marginTop: "0.5rem", fontSize: "0.85rem", color: "#475569", fontStyle: "italic", textAlign: "center", padding: "0.5rem", background: "#f8fafc", borderRadius: "8px" }}>
                    💬 {doneQuote}
                  </div>
                </>
              );
            })()}
          </div>

          {/* สรุปสถิติเดือนนี้ */}
          <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "12px", padding: "0.75rem", marginBottom: "1.25rem" }}>
            <div style={{ fontSize: "0.75rem", color: "#64748b", fontWeight: 600, marginBottom: "0.5rem", textAlign: "center" }}>📊 สถิติเดือนนี้</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "0.4rem" }}>
              <div style={{ background: "#fef2f2", borderRadius: "8px", padding: "0.4rem", textAlign: "center" }}>
                <div style={{ fontSize: "1.1rem", fontWeight: 800, color: "#dc2626" }}>{myStats.late}</div>
                <div style={{ fontSize: "0.65rem", color: "#dc2626", fontWeight: 600 }}>มาสาย</div>
              </div>
              <div style={{ background: "#fef3c7", borderRadius: "8px", padding: "0.4rem", textAlign: "center" }}>
                <div style={{ fontSize: "1.1rem", fontWeight: 800, color: "#d97706" }}>{myStats.early}</div>
                <div style={{ fontSize: "0.65rem", color: "#d97706", fontWeight: 600 }}>กลับก่อน</div>
              </div>
              <div style={{ background: "#f5f3ff", borderRadius: "8px", padding: "0.4rem", textAlign: "center" }}>
                <div style={{ fontSize: "1.1rem", fontWeight: 800, color: "#7c3aed" }}>{myStats.leaves}</div>
                <div style={{ fontSize: "0.65rem", color: "#7c3aed", fontWeight: 600 }}>ลา</div>
              </div>
              <div style={{ background: "#eff6ff", borderRadius: "8px", padding: "0.4rem", textAlign: "center" }}>
                <div style={{ fontSize: "1.1rem", fontWeight: 800, color: "#2563eb" }}>{myStats.outings}</div>
                <div style={{ fontSize: "0.65rem", color: "#2563eb", fontWeight: 600 }}>ออกนอก</div>
              </div>
            </div>
          </div>
        </>
      )}

      <div style={{ display: "flex", gap: "0.75rem" }}>
        <button onClick={fetchLocation} style={btnSecondary}><RefreshCw size={16} /> อัปเดต GPS</button>
        <button onClick={handleSubmit} disabled={!canSubmit} style={{ ...btnPrimary, background: done ? "#dcfce7" : canSubmit ? (mode === "in" ? "linear-gradient(135deg, #2563eb, #1d4ed8)" : "linear-gradient(135deg, #f59e0b, #d97706)") : "#e2e8f0", color: done ? "#16a34a" : canSubmit ? "#fff" : "#94a3b8", cursor: canSubmit ? "pointer" : "not-allowed" }}>
          {mode === "in" ? <LogIn size={18} /> : <LogOut size={18} />}
          {done ? "บันทึกแล้ว" : mode === "in" ? "ลงเวลาเข้างาน" : "ลงเวลากลับบ้าน"}
        </button>
      </div>
    </Modal>
  );
}

// ─── PAGES ────────────────────────────────────────────────────────────────────
function EmployeePage({ employees, currentUser, onRefresh }) {
  const [showModal, setShowModal] = useState(false);
  const [editEmp, setEditEmp] = useState(null);
  const [search, setSearch] = useState("");
  const [deleting, setDeleting] = useState(null);
  const [devices, setDevices] = useState([]);
  const [salaryRows, setSalaryRows] = useState([]);
  const [teachingGrades, setTeachingGrades] = useState({});
  const [gradeBusyId, setGradeBusyId] = useState("");
  const [gradeError, setGradeError] = useState("");
  const gradeEpoch = useRef(0);

  useEffect(() => {
    let active = true;
    const epoch = gradeEpoch.current;
    loadTeachingGrades()
      .then(map => { if (active && epoch === gradeEpoch.current) setTeachingGrades(map); })
      .catch(err => { if (active && epoch === gradeEpoch.current) setGradeError(err.message || "โหลดชั้นที่สอนไม่สำเร็จ"); });
    return () => { active = false; };
  }, [employees]);

  const changeTeachingGrade = async (employeeId, grade) => {
    gradeEpoch.current += 1;
    const previous = teachingGrades[employeeId] || "";
    setTeachingGrades(current => {
      const next = { ...current };
      if (grade) next[employeeId] = grade;
      else delete next[employeeId];
      return next;
    });
    setGradeBusyId(employeeId);
    setGradeError("");
    try {
      await saveTeachingGrade(employeeId, grade, currentUser?.id);
    } catch (err) {
      setTeachingGrades(current => {
        const next = { ...current };
        if (previous) next[employeeId] = previous;
        else delete next[employeeId];
        return next;
      });
      setGradeError(err.message || "บันทึกชั้นที่สอนไม่สำเร็จ");
    } finally {
      setGradeBusyId("");
    }
  };

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("user_devices").select("*");
      setDevices(data || []);
      const { data: salaryData } = await supabase.from("salary_settings").select("*").not("employee_id", "is", null);
      setSalaryRows(salaryData || []);
    })();
  }, [employees]);

  const handleUnlock = async (empId, empName) => {
    if (!window.confirm(`ปลดล็อกเครื่องของ ${empName}?\nครูจะสามารถ Login จากเครื่องใหม่ได้ในครั้งถัดไป`)) return;
    await supabase.from("user_devices").delete().eq("employee_id", empId);
    const { data } = await supabase.from("user_devices").select("*");
    setDevices(data || []);
    alert("ปลดล็อกเรียบร้อย ✅");
  };
  const filtered = employees.filter(e => e.name?.toLowerCase().includes(search.toLowerCase()) || e.department?.toLowerCase().includes(search.toLowerCase()));

  const handleDelete = async (id) => {
    if (!window.confirm("ยืนยันลบพนักงาน?")) return;
    setDeleting(id);
    await supabase.from("employees").delete().eq("id", id);
    setDeleting(null); onRefresh();
  };

  return (
    <div>
      <PageHeader title="ข้อมูลพนักงาน" count={employees.length} onAdd={() => { setEditEmp(null); setShowModal(true); }} addLabel="เพิ่มพนักงาน" />
      {gradeError && <div style={{ background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 8, padding: "0.75rem", color: "#dc2626", fontSize: "0.85rem", marginBottom: "1rem" }}>{gradeError}</div>}
      <div style={{ position: "relative", marginBottom: "1.25rem" }}>
        <Search size={15} color="#94a3b8" style={{ position: "absolute", left: "0.75rem", top: "50%", transform: "translateY(-50%)" }} />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="ค้นหา..." style={{ ...inputStyle, maxWidth: 360, paddingLeft: "2.25rem" }} />
      </div>
      <Card padding="0">
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
            <thead>
              <tr style={{ background: "#f8fafc", borderBottom: "2px solid #f1f5f9" }}>
                {["#", "ชื่อ-นามสกุล", "Username", "แผนก", "ระดับ", "ค่าจ้าง", "เงินเข้า บช", "สิทธิ์", "เครื่อง", "จัดการ"].map(h => (
                  <th key={h} style={{ padding: "0.75rem 1rem", textAlign: "left", color: "#64748b", fontWeight: 600, fontSize: "0.78rem", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={10} style={{ padding: "3rem", textAlign: "center", color: "#94a3b8" }}>ไม่พบข้อมูล</td></tr>
              ) : filtered.map((emp, i) => {
                const device = devices.find(d => d.employee_id === emp.id);
                const salaryRow = salaryRows.find(row => row.employee_id === emp.id);
                const salaryMeta = parseEmployeePayrollMeta(salaryRow?.leave_deduct_types);
                return (
                  <tr key={emp.id} style={{ borderBottom: "1px solid #f8fafc" }}>
                    <td style={{ padding: "0.75rem 1rem", color: "#94a3b8", fontSize: "0.78rem" }}>{i + 1}</td>
                    <td style={{ padding: "0.75rem 1rem", minWidth: "11rem" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                        <Avatar name={emp.name} index={i} />
                        <span style={{ fontWeight: 600, color: "#0f172a" }}>{emp.name}</span>
                      </div>
                      <label style={{ display: "grid", gap: "0.15rem", marginTop: "0.4rem" }}>
                        <span style={{ fontSize: "0.68rem", color: "#64748b", fontWeight: 700 }}>ชั้นที่สอน</span>
                        <select aria-label={`ชั้นที่สอน ${emp.name}`} value={teachingGrades[emp.id] || ""} disabled={Boolean(gradeBusyId)} onChange={event => changeTeachingGrade(emp.id, event.target.value)} style={{ ...selectStyle, boxSizing: "border-box", fontSize: "16px", width: "100%", maxWidth: "12rem", minHeight: 40, padding: "0.35rem 0.5rem" }}>
                          <option value="">ไม่ได้ประจำชั้น</option>
                          {TEACHING_GRADE_GROUPS.map(([level, grades]) => (
                            <optgroup key={level} label={level}>
                              {grades.map(grade => <option key={grade} value={grade}>{grade}</option>)}
                            </optgroup>
                          ))}
                        </select>
                      </label>
                    </td>
                    <td style={{ padding: "0.75rem 1rem", color: "#475569", fontFamily: "monospace", fontSize: "0.8rem" }}>{emp.username || "-"}</td>
                    <td style={{ padding: "0.75rem 1rem" }}><span style={{ background: "#eff6ff", color: "#2563eb", fontSize: "0.75rem", fontWeight: 600, padding: "0.2rem 0.6rem", borderRadius: "20px" }}>{emp.department || "-"}</span></td>
                    <td style={{ padding: "0.75rem 1rem", color: "#475569", whiteSpace: "nowrap" }}>{salaryMeta.teacher_level ? `ครู${salaryMeta.teacher_level}` : "-"}</td>
                    <td style={{ padding: "0.75rem 1rem", whiteSpace: "nowrap" }}>
                      <div style={{ color: "#0f172a", fontWeight: 800 }}>{formatMoney(salaryRow?.daily_rate || 0)}</div>
                      <div style={{ color: "#64748b", fontSize: "0.7rem" }}>{salaryMeta.pay_type === "monthly" ? "รายเดือน" : "รายวัน"}</div>
                    </td>
                    <td style={{ padding: "0.75rem 1rem", color: "#0f172a", fontWeight: 800, whiteSpace: "nowrap" }}>{formatMoney(salaryMeta.bank_deposit || 0)}</td>
                    <td style={{ padding: "0.75rem 1rem" }}>
                      {emp.role === "admin"
                        ? <span style={{ background: "#fef3c7", color: "#d97706", fontSize: "0.72rem", fontWeight: 700, padding: "0.2rem 0.5rem", borderRadius: "20px" }}>Admin</span>
                        : <span style={{ color: "#94a3b8", fontSize: "0.78rem" }}>พนักงาน</span>}
                    </td>
                    <td style={{ padding: "0.75rem 1rem" }}>
                      {emp.role === "admin"
                        ? <span style={{ color: "#94a3b8", fontSize: "0.75rem" }}>— ไม่ผูก —</span>
                        : device
                        ? <div>
                            <div style={{ fontSize: "0.75rem", color: "#475569", fontWeight: 600 }}>🔒 {device.device_name}</div>
                            <div style={{ fontSize: "0.68rem", color: "#94a3b8" }}>{new Date(device.created_at).toLocaleDateString("th-TH")}</div>
                          </div>
                        : <span style={{ color: "#94a3b8", fontSize: "0.75rem" }}>ยังไม่ Login</span>}
                    </td>
                    <td style={{ padding: "0.75rem 1rem" }}>
                      <div style={{ display: "flex", gap: "0.4rem" }}>
                        {device && emp.role !== "admin" && (
                          <button onClick={() => handleUnlock(emp.id, emp.name)} title="ปลดล็อกเครื่อง" style={iconBtn("#fef3c7", "#d97706")}><Key size={15} /></button>
                        )}
                        <button onClick={() => { setEditEmp(emp); setShowModal(true); }} style={iconBtn("#eff6ff", "#2563eb")}><Edit size={15} /></button>
                        <button onClick={() => handleDelete(emp.id)} disabled={deleting === emp.id} style={iconBtn("#fef2f2", "#dc2626")}>
                          {deleting === emp.id ? <RefreshCw size={15} style={{ animation: "spin 1s linear infinite" }} /> : <Trash2 size={15} />}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
      {showModal && <EmployeeModal employee={editEmp} onClose={() => { setShowModal(false); setEditEmp(null); }} onSave={() => { setShowModal(false); setEditEmp(null); onRefresh(); }} />}
    </div>
  );
}

function AttendancePage({ employees, activityLog, currentUser, settings, onRefresh }) {
  const [showIn, setShowIn] = useState(false);
  const [showOut, setShowOut] = useState(false);
  const filtered = currentUser?.role === "admin" ? activityLog : activityLog.filter(a => a.employee_id === currentUser?.id);

  return (
    <div>
      <PageHeader title="ลงเวลาเข้า-ออก" count={filtered.length} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1.5rem" }}>
        <button onClick={() => setShowIn(true)} style={{ background: "linear-gradient(135deg, #2563eb, #1d4ed8)", border: "none", borderRadius: "1rem", padding: "1.5rem", color: "#fff", cursor: "pointer", fontFamily: "inherit", boxShadow: "0 8px 24px rgba(37,99,235,0.3)", display: "flex", flexDirection: "column", alignItems: "center", gap: "0.5rem" }}>
          <LogIn size={32} /><div style={{ fontSize: "1.1rem", fontWeight: 800 }}>ลงเวลาเข้างาน</div>
          <div style={{ fontSize: "0.75rem", opacity: 0.9 }}>เวลาทำงาน: {settings?.work_start?.slice(0,5)} น.</div>
        </button>
        <button onClick={() => setShowOut(true)} style={{ background: "linear-gradient(135deg, #f59e0b, #d97706)", border: "none", borderRadius: "1rem", padding: "1.5rem", color: "#fff", cursor: "pointer", fontFamily: "inherit", boxShadow: "0 8px 24px rgba(245,158,11,0.3)", display: "flex", flexDirection: "column", alignItems: "center", gap: "0.5rem" }}>
          <LogOut size={32} /><div style={{ fontSize: "1.1rem", fontWeight: 800 }}>ลงเวลากลับบ้าน</div>
          <div style={{ fontSize: "0.75rem", opacity: 0.9 }}>เวลาเลิก: {settings?.work_end?.slice(0,5)} น.</div>
        </button>
      </div>

      <Card padding="0">
        <div style={{ padding: "1.25rem", overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
            <thead>
              <tr style={{ borderBottom: "2px solid #f1f5f9" }}>
                {["พนักงาน", "วันที่", "งาน/เวร", "เข้างาน", "กลับบ้าน", "รวม", "สถานะ"].map(h => (
                  <th key={h} style={{ padding: "0.5rem 0.75rem", textAlign: "left", color: "#94a3b8", fontWeight: 600, fontSize: "0.75rem", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={7} style={{ padding: "2rem", textAlign: "center", color: "#94a3b8" }}>ไม่มีข้อมูล</td></tr>
              ) : filtered.map((row, i) => {
                const hours = row.check_out ? ((new Date(row.check_out) - new Date(row.check_in)) / 3600000).toFixed(1) : null;
                const lateInfo = checkLate(row.check_in, settings?.work_start, settings?.late_grace_minutes);
                const earlyInfo = row.check_out ? checkEarly(row.check_out, settings?.work_end) : null;
                const isTraining = row.work_activity === "training";
                return (
                  <tr key={row.id} style={{ borderBottom: "1px solid #f8fafc", background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                    <td style={{ padding: "0.65rem 0.75rem" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                        <Avatar name={row.employees?.name} index={i} />
                        <span style={{ fontWeight: 600, color: "#0f172a" }}>{row.employees?.name || "-"}</span>
                      </div>
                    </td>
                    <td style={{ padding: "0.65rem 0.75rem", color: "#475569" }}>{fmtDate(row.check_in)}</td>
                    <td style={{ padding: "0.65rem 0.75rem" }}>
                      <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem", minWidth: 150 }}>
                        <span style={{ background: isTraining ? "#dbeafe" : "#f1f5f9", color: isTraining ? "#1d4ed8" : "#475569", fontSize: "0.7rem", fontWeight: 800, padding: "0.2rem 0.5rem", borderRadius: "20px", width: "fit-content" }}>
                          {isTraining ? `อบรม: ${row.training_location || "-"}` : (row.duty || "ไม่มีเวร")}
                        </span>
                        {isTraining && (
                          <span style={{ color: "#64748b", fontSize: "0.68rem" }}>
                            {row.training_start_date || "-"} ถึง {row.training_end_date || row.training_start_date || "-"}
                          </span>
                        )}
                      </div>
                    </td>
                    <td style={{ padding: "0.65rem 0.75rem" }}><span style={{ background: "#dcfce7", color: "#16a34a", fontSize: "0.72rem", fontWeight: 700, padding: "0.2rem 0.5rem", borderRadius: "20px" }}>{fmtTime(row.check_in)}</span></td>
                    <td style={{ padding: "0.65rem 0.75rem" }}>
                      {row.check_out ? <span style={{ background: "#fef3c7", color: "#d97706", fontSize: "0.72rem", fontWeight: 700, padding: "0.2rem 0.5rem", borderRadius: "20px" }}>{fmtTime(row.check_out)}</span> : <span style={{ color: "#94a3b8", fontSize: "0.78rem" }}>ยังไม่กลับ</span>}
                    </td>
                    <td style={{ padding: "0.65rem 0.75rem", color: "#475569", fontWeight: 600 }}>{hours ? `${hours} ชม.` : "-"}</td>
                    <td style={{ padding: "0.65rem 0.75rem" }}>
                      <div style={{ display: "flex", gap: "0.25rem", flexWrap: "wrap" }}>
                        {lateInfo?.late && (
                          <span style={{ background: "#fef2f2", color: "#dc2626", fontSize: "0.7rem", fontWeight: 700, padding: "0.2rem 0.5rem", borderRadius: "20px" }}>⚠️ สาย {formatMinutes(lateInfo.minutes)}</span>
                        )}
                        {lateInfo?.early && (
                          <span style={{ background: "#eff6ff", color: "#2563eb", fontSize: "0.7rem", fontWeight: 700, padding: "0.2rem 0.5rem", borderRadius: "20px" }}>⏰ เข้าก่อน {formatMinutes(lateInfo.minutes)}</span>
                        )}
                        {!lateInfo?.late && !lateInfo?.early && lateInfo && (
                          <span style={{ background: "#dcfce7", color: "#16a34a", fontSize: "0.7rem", fontWeight: 700, padding: "0.2rem 0.5rem", borderRadius: "20px" }}>✓ ตรงเวลา</span>
                        )}
                        {earlyInfo?.early && (
                          <span style={{ background: "#fef2f2", color: "#dc2626", fontSize: "0.7rem", fontWeight: 700, padding: "0.2rem 0.5rem", borderRadius: "20px" }}>🚪 กลับก่อน {formatMinutes(earlyInfo.minutes)}</span>
                        )}
                        {earlyInfo?.onTime && (
                          <span style={{ background: "#dcfce7", color: "#16a34a", fontSize: "0.7rem", fontWeight: 700, padding: "0.2rem 0.5rem", borderRadius: "20px" }}>✓ กลับตรงเวลา</span>
                        )}
                        {earlyInfo?.late && (
                          <span style={{ background: "#dcfce7", color: "#16a34a", fontSize: "0.7rem", fontWeight: 700, padding: "0.2rem 0.5rem", borderRadius: "20px" }}>✓ กลับช้า {formatMinutes(earlyInfo.minutes)}</span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {showIn && <AttendanceModal mode="in" onClose={() => { setShowIn(false); onRefresh(); }} onCheckin={() => onRefresh()} employees={employees} currentUser={currentUser} settings={settings} />}
      {showOut && <AttendanceModal mode="out" onClose={() => { setShowOut(false); onRefresh(); }} onCheckin={() => onRefresh()} employees={employees} currentUser={currentUser} settings={settings} />}
    </div>
  );
}

function LeavePage({ employees, leaves, currentUser, onRefresh }) {
  const [showModal, setShowModal] = useState(false);
  const filtered = currentUser?.role === "admin" ? leaves : leaves.filter(l => l.employee_id === currentUser?.id);

  const updateStatus = async (id, status) => { await supabase.from("leaves").update({ status }).eq("id", id); onRefresh(); };
  const handleDelete = async (id) => { if (!window.confirm("ลบรายการนี้?")) return; await supabase.from("leaves").delete().eq("id", id); onRefresh(); };

  const stsBadge = (s) => {
    const map = { pending: { bg: "#fef3c7", color: "#d97706", label: "รออนุมัติ" }, approved: { bg: "#dcfce7", color: "#16a34a", label: "อนุมัติ" }, rejected: { bg: "#fef2f2", color: "#dc2626", label: "ไม่อนุมัติ" } };
    const c = map[s] || map.pending;
    return <span style={{ background: c.bg, color: c.color, fontSize: "0.72rem", fontWeight: 700, padding: "0.2rem 0.6rem", borderRadius: "20px" }}>{c.label}</span>;
  };

  return (
    <div>
      <PageHeader title="การลา" count={filtered.length} onAdd={() => setShowModal(true)} addLabel="ขอลา" />
      <Card padding="0">
        <div style={{ padding: "1.25rem", overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
            <thead>
              <tr style={{ borderBottom: "2px solid #f1f5f9" }}>
                {["พนักงาน", "ประเภท", "ระยะเวลา", "วันที่", "ชม.", "ครูสอนแทน", "เอกสาร", "สถานะ", "จัดการ"].map(h => (
                  <th key={h} style={{ padding: "0.5rem 0.75rem", textAlign: "left", color: "#94a3b8", fontWeight: 600, fontSize: "0.75rem", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={9} style={{ padding: "3rem", textAlign: "center", color: "#94a3b8" }}>ไม่มีข้อมูลการลา</td></tr>
              ) : filtered.map((row, i) => (
                <tr key={row.id} style={{ borderBottom: "1px solid #f8fafc", background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                  <td style={{ padding: "0.65rem 0.75rem" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      <Avatar name={row.employees?.name} index={i} />
                      <span style={{ fontWeight: 600, color: "#0f172a" }}>{row.employees?.name || "-"}</span>
                    </div>
                  </td>
                  <td style={{ padding: "0.65rem 0.75rem", color: "#475569" }}>{row.leave_type}</td>
                  <td style={{ padding: "0.65rem 0.75rem", color: "#475569" }}>{row.duration_type}</td>
                  <td style={{ padding: "0.65rem 0.75rem", color: "#475569", whiteSpace: "nowrap" }}>
                    {fmtDate(row.start_date)}
                    {row.duration_type === "หลายวัน" && row.end_date && row.end_date !== row.start_date && ` - ${fmtDate(row.end_date)}`}
                  </td>
                  <td style={{ padding: "0.65rem 0.75rem", color: "#475569", fontWeight: 600 }}>{row.hours || 8}</td>
                  <td style={{ padding: "0.65rem 0.75rem", color: "#475569" }}>
                    {(() => {
                      const { teacherLevel, periods: periodSubs } = getLeaveSubstituteMeta(row.substitute_note);
                      const filledSubs = periodSubs.filter(Boolean);
                      if (filledSubs.length === 0 && !row.substitute?.name) return <span style={{ color: "#94a3b8", fontSize: "0.78rem" }}>—</span>;

                      return (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.3rem", maxWidth: 260 }}>
                          {teacherLevel && (
                            <span style={{ background: "#ecfeff", color: "#0e7490", fontSize: "0.7rem", fontWeight: 800, padding: "0.2rem 0.45rem", borderRadius: "20px", whiteSpace: "nowrap" }}>
                              ครู{teacherLevel}
                            </span>
                          )}
                          {periodSubs.map((subId, periodIndex) => {
                            const subEmp = employees.find(emp => emp.id === subId);
                            return (
                              <span key={`${row.id}-${periodIndex}`} style={{ background: subEmp ? "#f5f3ff" : "#f8fafc", color: subEmp ? "#7c3aed" : "#94a3b8", fontSize: "0.7rem", fontWeight: 700, padding: "0.2rem 0.45rem", borderRadius: "20px", whiteSpace: "nowrap" }}>
                                {`${periodIndex === 0 ? "จินต" : `ค${periodIndex}`} ${subEmp?.name?.split(" ")[0] || "ว่าง"}`}
                              </span>
                            );
                          })}
                        </div>
                      );
                    })()}
                  </td>
                  <td style={{ padding: "0.65rem 0.75rem" }}>
                    {row.document_url
                      ? (
                        <a href={row.document_url} target="_blank" rel="noreferrer" style={{ background: "#eff6ff", color: "#1d4ed8", fontSize: "0.72rem", fontWeight: 700, padding: "0.28rem 0.6rem", borderRadius: "20px", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: "0.3rem" }}>
                          <FileText size={13} /> ใบนัดหมอ · ไม่หักลา
                        </a>
                      ) : <span style={{ color: "#94a3b8", fontSize: "0.78rem" }}>—</span>}
                  </td>
                  <td style={{ padding: "0.65rem 0.75rem" }}>{stsBadge(row.status)}</td>
                  <td style={{ padding: "0.65rem 0.75rem" }}>
                    <div style={{ display: "flex", gap: "0.3rem" }}>
                      {currentUser?.role === "admin" && row.status === "pending" && (
                        <>
                          <button onClick={() => updateStatus(row.id, "approved")} style={iconBtn("#dcfce7", "#16a34a")}><CheckCircle size={14} /></button>
                          <button onClick={() => updateStatus(row.id, "rejected")} style={iconBtn("#fef2f2", "#dc2626")}><XCircle size={14} /></button>
                        </>
                      )}
                      <button onClick={() => handleDelete(row.id)} style={iconBtn("#f1f5f9", "#64748b")}><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      {showModal && <LeaveModal employees={employees} currentUser={currentUser} onClose={() => setShowModal(false)} onSave={() => { setShowModal(false); onRefresh(); }} />}
    </div>
  );
}

function OutingPage({ employees, outings, currentUser, onRefresh }) {
  const [showModal, setShowModal] = useState(false);
  const filtered = currentUser?.role === "admin" ? outings : outings.filter(o => o.employee_id === currentUser?.id);

  const markReturn = async (id) => { await supabase.from("outings").update({ return_time: new Date().toISOString(), status: "returned" }).eq("id", id); onRefresh(); };
  const handleDelete = async (id) => { if (!window.confirm("ลบรายการนี้?")) return; await supabase.from("outings").delete().eq("id", id); onRefresh(); };

  return (
    <div>
      <PageHeader title="ขอออกนอกสถานที่" count={filtered.length} onAdd={() => setShowModal(true)} addLabel="ขอออก" />
      <Card padding="0">
        <div style={{ padding: "1.25rem", overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
            <thead>
              <tr style={{ borderBottom: "2px solid #f1f5f9" }}>
                {["พนักงาน", "วันที่", "เวลาออก", "เวลากลับ", "ปลายทาง", "เหตุผล", "สถานะ", "จัดการ"].map(h => (
                  <th key={h} style={{ padding: "0.5rem 0.75rem", textAlign: "left", color: "#94a3b8", fontWeight: 600, fontSize: "0.75rem", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={8} style={{ padding: "3rem", textAlign: "center", color: "#94a3b8" }}>ไม่มีข้อมูล</td></tr>
              ) : filtered.map((row, i) => (
                <tr key={row.id} style={{ borderBottom: "1px solid #f8fafc", background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                  <td style={{ padding: "0.65rem 0.75rem" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      <Avatar name={row.employees?.name} index={i} />
                      <span style={{ fontWeight: 600, color: "#0f172a" }}>{row.employees?.name || "-"}</span>
                    </div>
                  </td>
                  <td style={{ padding: "0.65rem 0.75rem", color: "#475569" }}>{fmtDate(row.out_time)}</td>
                  <td style={{ padding: "0.65rem 0.75rem" }}><span style={{ background: "#fef3c7", color: "#d97706", fontSize: "0.72rem", fontWeight: 700, padding: "0.2rem 0.5rem", borderRadius: "20px" }}>{fmtTime(row.out_time)}</span></td>
                  <td style={{ padding: "0.65rem 0.75rem" }}>{row.return_time ? <span style={{ background: "#dcfce7", color: "#16a34a", fontSize: "0.72rem", fontWeight: 700, padding: "0.2rem 0.5rem", borderRadius: "20px" }}>{fmtTime(row.return_time)}</span> : <span style={{ color: "#dc2626", fontSize: "0.78rem", fontWeight: 600 }}>ยังไม่กลับ</span>}</td>
                  <td style={{ padding: "0.65rem 0.75rem", color: "#475569" }}>{row.destination || "-"}</td>
                  <td style={{ padding: "0.65rem 0.75rem", color: "#64748b", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.reason || "-"}</td>
                  <td style={{ padding: "0.65rem 0.75rem" }}><span style={{ background: row.status === "out" ? "#fef2f2" : "#dcfce7", color: row.status === "out" ? "#dc2626" : "#16a34a", fontSize: "0.72rem", fontWeight: 700, padding: "0.2rem 0.6rem", borderRadius: "20px" }}>{row.status === "out" ? "ออกอยู่" : "กลับแล้ว"}</span></td>
                  <td style={{ padding: "0.65rem 0.75rem" }}>
                    <div style={{ display: "flex", gap: "0.3rem" }}>
                      {row.status === "out" && (
                        <button onClick={() => markReturn(row.id)} style={{ ...iconBtn("#dcfce7", "#16a34a"), padding: "0.3rem 0.6rem", fontSize: "0.72rem", fontWeight: 700, fontFamily: "inherit", display: "flex", alignItems: "center", gap: "0.25rem" }}>
                          <ArrowLeftRight size={12} /> กลับแล้ว
                        </button>
                      )}
                      <button onClick={() => handleDelete(row.id)} style={iconBtn("#f1f5f9", "#64748b")}><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      {showModal && <OutingModal employees={employees} currentUser={currentUser} onClose={() => setShowModal(false)} onSave={() => { setShowModal(false); onRefresh(); }} />}
    </div>
  );
}

function ReportPage({ employees, attendance, leaves, outings, settings }) {
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [empFilter, setEmpFilter] = useState("");
  const [reportType, setReportType] = useState("summary"); // summary | attendance | late | leave | outing

  const monthStart = new Date(month + "-01");
  const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0);
  const workDays = Array.from({ length: monthEnd.getDate() }, (_, i) => i + 1).filter(d => { const dow = new Date(monthStart.getFullYear(), monthStart.getMonth(), d).getDay(); return dow !== 0 && dow !== 6; }).length;

  const inMonth = (dateStr) => { if (!dateStr) return false; const d = new Date(dateStr); return d.getMonth() === monthStart.getMonth() && d.getFullYear() === monthStart.getFullYear(); };
  const empList = empFilter ? employees.filter(e => e.id === empFilter) : employees;
  const monthDates = Array.from({ length: monthEnd.getDate() }, (_, i) => {
    const date = new Date(monthStart.getFullYear(), monthStart.getMonth(), i + 1);
    return {
      key: date.toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" }),
      label: date.toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" }),
    };
  });

  const summaryRows = empList.map(emp => {
    const attDays = attendance.filter(a => a.employee_id === emp.id && inMonth(a.check_in));
    const lateCount = attDays.filter(a => checkLate(a.check_in, settings?.work_start)?.late).length;
    const earlyArrival = attDays.filter(a => checkLate(a.check_in, settings?.work_start)?.early).length;
    const earlyDeparture = attDays.filter(a => a.check_out && checkEarly(a.check_out, settings?.work_end)?.early).length;
    const overtime = attDays.filter(a => a.check_out && checkEarly(a.check_out, settings?.work_end)?.late).length;
    const leaveHours = leaves.filter(l => l.employee_id === emp.id && l.status === "approved" && inMonth(l.start_date)).reduce((s, l) => s + (l.hours || 8), 0);
    const outingCount = outings.filter(o => o.employee_id === emp.id && inMonth(o.out_time)).length;
    const totalHours = attDays.reduce((s, a) => s + (a.check_out ? (new Date(a.check_out) - new Date(a.check_in)) / 3600000 : 0), 0);
    const attended = attDays.length;
    const absent = Math.max(0, workDays - attended - leaveHours / 8);
    return { emp, attended, absent: absent.toFixed(1), lateCount, earlyArrival, earlyDeparture, overtime, leaveHours, leaveDays: (leaveHours / 8).toFixed(1), outingCount, totalHours: totalHours.toFixed(1) };
  });
  const dailySummaryRows = monthDates.flatMap(date => empList.map(emp => {
    const rows = attendance
      .filter(a => a.employee_id === emp.id && getDateKey(a.check_in) === date.key)
      .sort((a, b) => new Date(a.check_in) - new Date(b.check_in));
    const firstRow = rows[0];
    const lastRowWithCheckOut = [...rows].reverse().find(row => row.check_out);
    const lateInfo = firstRow ? checkLate(firstRow.check_in, settings?.work_start) : null;
    const earlyInfo = lastRowWithCheckOut ? checkEarly(lastRowWithCheckOut.check_out, settings?.work_end) : null;
    const lateMinutes = lateInfo?.late ? lateInfo.minutes : 0;
    const earlyMinutes = earlyInfo?.early ? earlyInfo.minutes : 0;
    const totalHours = rows.reduce((sum, row) => sum + (row.check_out ? (new Date(row.check_out) - new Date(row.check_in)) / 3600000 : 0), 0);
    const checkInText = rows.length ? rows.map(row => fmtTime(row.check_in)).join(" / ") : "-";
    const checkOutText = rows.length ? rows.map(row => row.check_out ? fmtTime(row.check_out) : "ยังไม่กลับ").join(" / ") : "-";
    const hasOpenRow = rows.some(row => !row.check_out);
    return {
      date,
      emp,
      checkInText,
      checkOutText,
      totalHours: rows.length ? totalHours.toFixed(1) : "-",
      status: rows.length ? (hasOpenRow ? "ยังไม่ลงเวลากลับ" : "ลงเวลาครบ") : "ไม่มีข้อมูลลงเวลา",
      lateHours: lateMinutes ? Math.floor(lateMinutes / 60) : "",
      lateMinutes: lateMinutes ? lateMinutes % 60 : "",
      earlyHours: earlyMinutes ? Math.floor(earlyMinutes / 60) : "",
      earlyMinutes: earlyMinutes ? earlyMinutes % 60 : "",
    };
  }));

  const exportCSV = () => {
    const csvCell = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;
    const csvRow = (values) => values.map(csvCell).join(",") + "\n";
    const attendanceRows = attendance
      .filter(a => inMonth(a.check_in) && (!empFilter || a.employee_id === empFilter))
      .sort((a, b) => {
        const nameCompare = (a.employees?.name || "").localeCompare(b.employees?.name || "", "th");
        if (nameCompare !== 0) return nameCompare;
        return new Date(a.check_in) - new Date(b.check_in);
      });
    let csv = "";
    if (reportType === "summary") {
      csv = csvRow(["พนักงาน", "แผนก", "มาทำงาน(วัน)", "มาสาย(ครั้ง)", "เข้าก่อน(ครั้ง)", "กลับก่อน(ครั้ง)", "OT(ครั้ง)", "ลา(ชม.)", "ลา(วัน)", "ขาด", "ออกนอก(ครั้ง)", "รวม(ชม.)"]);
      summaryRows.forEach(r => {
        csv += csvRow([r.emp.name, r.emp.department || "", r.attended, r.lateCount, r.earlyArrival, r.earlyDeparture, r.overtime, r.leaveHours, r.leaveDays, r.absent, r.outingCount, r.totalHours]);
      });
      csv += "\n";
      csv += csvRow(["รายละเอียดเวลาเข้า-ออก"]);
      csv += csvRow(["พนักงาน", "แผนก", "วันที่", "เวลาเข้า", "เวลาออก", "รวม(ชม.)", "สถานะเข้า", "สถานะกลับ"]);
      attendanceRows.forEach(a => {
        const li = checkLate(a.check_in, settings?.work_start);
        const ei = a.check_out ? checkEarly(a.check_out, settings?.work_end) : null;
        const hours = a.check_out ? ((new Date(a.check_out) - new Date(a.check_in)) / 3600000).toFixed(1) : "-";
        csv += csvRow([
          a.employees?.name || "-",
          a.employees?.department || "",
          fmtDate(a.check_in),
          fmtTime(a.check_in),
          a.check_out ? fmtTime(a.check_out) : "-",
          hours,
          li?.late ? "สาย " + li.minutes + " น." : li?.early ? "เข้าก่อน " + li.minutes + " น." : "ตรงเวลา",
          ei ? (ei.early ? "ก่อน " + ei.minutes + " น." : ei.late ? "ช้า " + ei.minutes + " น." : "ตรงเวลา") : "-"
        ]);
      });
    } else if (reportType === "attendance") {
      csv = csvRow(["พนักงาน", "วันที่", "เข้างาน", "กลับบ้าน", "รวม(ชม.)", "สถานะเข้า", "สถานะกลับ"]);
      attendanceRows.forEach(a => {
        const li = checkLate(a.check_in, settings?.work_start);
        const ei = a.check_out ? checkEarly(a.check_out, settings?.work_end) : null;
        const hours = a.check_out ? ((new Date(a.check_out) - new Date(a.check_in)) / 3600000).toFixed(1) : "-";
        csv += csvRow([a.employees?.name || "-", fmtDate(a.check_in), fmtTime(a.check_in), a.check_out ? fmtTime(a.check_out) : "-", hours, li?.late ? "สาย " + li.minutes + " น." : li?.early ? "เข้าก่อน " + li.minutes + " น." : "ตรงเวลา", ei ? (ei.early ? "ก่อน " + ei.minutes + " น." : ei.late ? "ช้า " + ei.minutes + " น." : "ตรงเวลา") : "-"]);
      });
    } else if (reportType === "dailySummary") {
      csv = csvRow(["เวลาเริ่มงาน", settings?.work_start?.slice(0, 5) || "-", "", "เวลาเลิกงาน", settings?.work_end?.slice(0, 5) || "-"]);
      csv += "\n";
      monthDates.forEach(date => {
        csv += csvRow([date.label]);
        csv += csvRow(["ลำดับ", "ชื่อ - นามสกุล", "ลงเวลาเข้า", "ลงเวลาออก", "มาสาย ช.ม.", "มาสาย นาที", "เลิกก่อน ช.ม.", "เลิกก่อน นาที"]);
        dailySummaryRows.filter(row => row.date.key === date.key).forEach((row, index) => {
          csv += csvRow([index + 1, row.emp.name, row.checkInText, row.checkOutText, row.lateHours, row.lateMinutes, row.earlyHours, row.earlyMinutes]);
        });
        csv += "\n";
      });
    } else if (reportType === "late") {
      csv = csvRow(["พนักงาน", "วันที่", "เวลาเข้า", "สาย(นาที)"]);
      attendanceRows.forEach(a => {
        const li = checkLate(a.check_in, settings?.work_start);
        if (li?.late) csv += csvRow([a.employees?.name || "-", fmtDate(a.check_in), fmtTime(a.check_in), li.minutes]);
      });
    } else if (reportType === "earlyLeave") {
      csv = csvRow(["พนักงาน", "วันที่", "เวลากลับ", "กลับก่อน(นาที)"]);
      attendanceRows.filter(a => a.check_out).forEach(a => {
        const ei = checkEarly(a.check_out, settings?.work_end);
        if (ei?.early) csv += csvRow([a.employees?.name || "-", fmtDate(a.check_in), fmtTime(a.check_out), ei.minutes]);
      });
    } else if (reportType === "leave") {
      csv = "พนักงาน,ประเภท,ระยะเวลา,วันที่เริ่ม,ถึง,ชั่วโมง,เหตุผล,สถานะ\n";
      leaves.filter(l => inMonth(l.start_date) && (!empFilter || l.employee_id === empFilter)).forEach(l => {
        csv += `${l.employees?.name || "-"},${l.leave_type},${l.duration_type},${fmtDate(l.start_date)},${fmtDate(l.end_date)},${l.hours || 8},"${(l.reason || "").replace(/"/g, '""')}",${l.status}\n`;
      });
    } else if (reportType === "outing") {
      csv = "พนักงาน,วันที่,เวลาออก,เวลากลับ,ปลายทาง,เหตุผล,สถานะ\n";
      outings.filter(o => inMonth(o.out_time) && (!empFilter || o.employee_id === empFilter)).forEach(o => {
        csv += `${o.employees?.name || "-"},${fmtDate(o.out_time)},${fmtTime(o.out_time)},${o.return_time ? fmtTime(o.return_time) : "-"},${o.destination || "-"},"${(o.reason || "").replace(/"/g, '""')}",${o.status}\n`;
      });
    }
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `รายงาน_${reportType}_${month}.csv`;
    a.click();
  };

  const reportTabs = [
    { key: "summary", label: "สรุปภาพรวม", icon: BarChart3, color: "#2563eb" },
    { key: "attendance", label: "การเข้า-ออก", icon: Clock, color: "#059669" },
    { key: "dailySummary", label: "รายวันครบคน", icon: Calendar, color: "#0f766e" },
    { key: "late", label: "มาสาย", icon: AlertCircle, color: "#dc2626" },
    { key: "earlyLeave", label: "กลับก่อน", icon: LogOut, color: "#f59e0b" },
    { key: "leave", label: "การลา", icon: Umbrella, color: "#7c3aed" },
    { key: "outing", label: "ออกนอก รร.", icon: ArrowRightLeft, color: "#d97706" },
  ];

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem", flexWrap: "wrap", gap: "0.75rem" }}>
        <div>
          <h1 style={{ fontSize: "1.4rem", fontWeight: 800, color: "#0f172a" }}>รายงาน</h1>
          <p style={{ color: "#64748b", fontSize: "0.85rem" }}>เดือน {new Date(month + "-01").toLocaleDateString("th-TH", { month: "long", year: "numeric" })}</p>
        </div>
        <button onClick={exportCSV} style={{ background: "linear-gradient(135deg, #059669, #047857)", border: "none", borderRadius: "12px", padding: "0.65rem 1.25rem", color: "#fff", fontWeight: 700, fontSize: "0.875rem", cursor: "pointer", display: "flex", alignItems: "center", gap: "0.5rem", fontFamily: "inherit", boxShadow: "0 4px 14px rgba(5,150,105,0.3)" }}>
          📥 Export Excel
        </button>
      </div>

      <Card>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "1rem", alignItems: "end" }}>
          <Field label="เดือน"><input type="month" value={month} onChange={e => setMonth(e.target.value)} style={{ ...inputStyle, width: "auto" }} /></Field>
          <Field label="พนักงาน">
            <select value={empFilter} onChange={e => setEmpFilter(e.target.value)} style={{ ...selectStyle, width: "auto", minWidth: 200 }}>
              <option value="">ทั้งหมด</option>
              {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </Field>
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "1rem", padding: "0.65rem 1rem", background: "#eff6ff", borderRadius: "10px" }}>
            <Calendar size={16} color="#2563eb" />
            <div><div style={{ fontSize: "0.72rem", color: "#64748b" }}>วันทำงาน</div><div style={{ fontWeight: 800, color: "#1d4ed8" }}>{workDays} วัน</div></div>
          </div>
        </div>
      </Card>

      {/* Tabs */}
      <div style={{ display: "flex", gap: "0.5rem", marginTop: "1rem", overflowX: "auto", paddingBottom: "0.5rem" }}>
        {reportTabs.map(tab => {
          const Icon = tab.icon;
          const isActive = reportType === tab.key;
          return (
            <button key={tab.key} onClick={() => setReportType(tab.key)} style={{
              background: isActive ? tab.color : "#fff",
              color: isActive ? "#fff" : "#475569",
              border: `1.5px solid ${isActive ? tab.color : "#e2e8f0"}`,
              borderRadius: "10px",
              padding: "0.6rem 1rem",
              fontSize: "0.85rem",
              fontWeight: 700,
              cursor: "pointer",
              display: "flex", alignItems: "center", gap: "0.4rem",
              fontFamily: "inherit",
              whiteSpace: "nowrap",
              transition: "all 0.15s"
            }}>
              <Icon size={15} /> {tab.label}
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div style={{ marginTop: "1rem" }}>
        <Card padding="0">
          <div style={{ overflowX: "auto" }}>
            {reportType === "summary" && (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
                <thead>
                  <tr style={{ background: "#f8fafc", borderBottom: "2px solid #f1f5f9" }}>
                    {["พนักงาน", "แผนก", "มาทำงาน", "สาย", "เข้าก่อน", "กลับก่อน", "OT", "ลา(วัน)", "ขาด", "ออกนอก", "รวม(ชม.)"].map(h => (
                      <th key={h} style={{ padding: "0.6rem 0.75rem", textAlign: "left", color: "#64748b", fontWeight: 600, fontSize: "0.75rem", whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {summaryRows.length === 0 ? (
                    <tr><td colSpan={11} style={{ padding: "3rem", textAlign: "center", color: "#94a3b8" }}>ไม่มีข้อมูล</td></tr>
                  ) : summaryRows.map((r, i) => (
                    <tr key={r.emp.id} style={{ borderBottom: "1px solid #f8fafc", background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                      <td style={{ padding: "0.6rem 0.75rem" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                          <Avatar name={r.emp.name} index={i} />
                          <span style={{ fontWeight: 600, color: "#0f172a", whiteSpace: "nowrap" }}>{r.emp.name}</span>
                        </div>
                      </td>
                      <td style={{ padding: "0.6rem 0.75rem", color: "#64748b" }}>{r.emp.department || "-"}</td>
                      <td style={{ padding: "0.6rem 0.75rem" }}><span style={{ color: "#16a34a", fontWeight: 700 }}>{r.attended}</span></td>
                      <td style={{ padding: "0.6rem 0.75rem", color: r.lateCount > 0 ? "#dc2626" : "#94a3b8", fontWeight: 700 }}>{r.lateCount}</td>
                      <td style={{ padding: "0.6rem 0.75rem", color: "#2563eb", fontWeight: 600 }}>{r.earlyArrival}</td>
                      <td style={{ padding: "0.6rem 0.75rem", color: r.earlyDeparture > 0 ? "#dc2626" : "#94a3b8", fontWeight: 600 }}>{r.earlyDeparture}</td>
                      <td style={{ padding: "0.6rem 0.75rem", color: "#16a34a", fontWeight: 600 }}>{r.overtime}</td>
                      <td style={{ padding: "0.6rem 0.75rem", color: "#7c3aed", fontWeight: 600 }}>{r.leaveDays}</td>
                      <td style={{ padding: "0.6rem 0.75rem", color: r.absent > 0 ? "#dc2626" : "#94a3b8", fontWeight: 700 }}>{r.absent}</td>
                      <td style={{ padding: "0.6rem 0.75rem", color: "#d97706", fontWeight: 600 }}>{r.outingCount}</td>
                      <td style={{ padding: "0.6rem 0.75rem", color: "#1d4ed8", fontWeight: 700 }}>{r.totalHours}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {reportType === "attendance" && (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
                <thead>
                  <tr style={{ background: "#f8fafc", borderBottom: "2px solid #f1f5f9" }}>
                    {["พนักงาน", "วันที่", "เข้างาน", "กลับบ้าน", "รวม", "สถานะเข้า", "สถานะกลับ"].map(h => (
                      <th key={h} style={{ padding: "0.6rem 0.75rem", textAlign: "left", color: "#64748b", fontWeight: 600, fontSize: "0.75rem", whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {attendance.filter(a => inMonth(a.check_in) && (!empFilter || a.employee_id === empFilter)).map((a, i) => {
                    const li = checkLate(a.check_in, settings?.work_start);
                    const ei = a.check_out ? checkEarly(a.check_out, settings?.work_end) : null;
                    const hours = a.check_out ? ((new Date(a.check_out) - new Date(a.check_in)) / 3600000).toFixed(1) : "-";
                    return (
                      <tr key={a.id} style={{ borderBottom: "1px solid #f8fafc", background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                        <td style={{ padding: "0.6rem 0.75rem", fontWeight: 600, color: "#0f172a" }}>{a.employees?.name || "-"}</td>
                        <td style={{ padding: "0.6rem 0.75rem", color: "#475569" }}>{fmtDate(a.check_in)}</td>
                        <td style={{ padding: "0.6rem 0.75rem", color: "#16a34a", fontWeight: 600 }}>{fmtTime(a.check_in)}</td>
                        <td style={{ padding: "0.6rem 0.75rem", color: "#d97706", fontWeight: 600 }}>{a.check_out ? fmtTime(a.check_out) : "-"}</td>
                        <td style={{ padding: "0.6rem 0.75rem", fontWeight: 600 }}>{hours} ชม.</td>
                        <td style={{ padding: "0.6rem 0.75rem" }}>
                          {li?.late ? <span style={{ background: "#fef2f2", color: "#dc2626", fontSize: "0.7rem", fontWeight: 700, padding: "0.2rem 0.5rem", borderRadius: "20px" }}>สาย {formatMinutes(li.minutes)}</span>
                          : li?.early ? <span style={{ background: "#eff6ff", color: "#2563eb", fontSize: "0.7rem", fontWeight: 700, padding: "0.2rem 0.5rem", borderRadius: "20px" }}>เข้าก่อน {formatMinutes(li.minutes)}</span>
                          : <span style={{ background: "#dcfce7", color: "#16a34a", fontSize: "0.7rem", fontWeight: 700, padding: "0.2rem 0.5rem", borderRadius: "20px" }}>ตรงเวลา</span>}
                        </td>
                        <td style={{ padding: "0.6rem 0.75rem" }}>
                          {!a.check_out ? <span style={{ color: "#94a3b8", fontSize: "0.75rem" }}>ยังไม่กลับ</span>
                          : ei?.early ? <span style={{ background: "#fef2f2", color: "#dc2626", fontSize: "0.7rem", fontWeight: 700, padding: "0.2rem 0.5rem", borderRadius: "20px" }}>ก่อน {formatMinutes(ei.minutes)}</span>
                          : ei?.late ? <span style={{ background: "#dcfce7", color: "#16a34a", fontSize: "0.7rem", fontWeight: 700, padding: "0.2rem 0.5rem", borderRadius: "20px" }}>ช้า {formatMinutes(ei.minutes)}</span>
                          : <span style={{ background: "#dcfce7", color: "#16a34a", fontSize: "0.7rem", fontWeight: 700, padding: "0.2rem 0.5rem", borderRadius: "20px" }}>ตรงเวลา</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}

            {reportType === "dailySummary" && (
              <div style={{ minWidth: "760px", padding: "1rem" }}>
                <div style={{ display: "grid", gridTemplateColumns: "120px 100px", justifyContent: "center", gap: "0.25rem 1rem", color: "#0f172a", fontSize: "0.9rem", fontWeight: 800, marginBottom: "1rem" }}>
                  <div style={{ textAlign: "right" }}>เวลาเริ่มงาน</div>
                  <div>{settings?.work_start?.slice(0, 5) || "-"} น.</div>
                  <div style={{ textAlign: "right" }}>เวลาเลิกงาน</div>
                  <div>{settings?.work_end?.slice(0, 5) || "-"} น.</div>
                </div>
                {monthDates.map(date => {
                  const rows = dailySummaryRows.filter(row => row.date.key === date.key);
                  return (
                    <div key={date.key} style={{ marginBottom: "1.25rem" }}>
                      <div style={{ background: "#0f766e", color: "#fff", fontWeight: 900, padding: "0.45rem 0.75rem", border: "1px solid #0f766e", borderBottom: "none" }}>{date.label}</div>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem", border: "2px solid #0f172a" }}>
                        <thead>
                          <tr>
                            <th rowSpan={2} style={{ background: "#dbeafe", border: "1px solid #0f172a", padding: "0.5rem", textAlign: "center", width: 64 }}>ลำดับ</th>
                            <th rowSpan={2} style={{ background: "#dbeafe", border: "1px solid #0f172a", padding: "0.5rem", textAlign: "center", minWidth: 220 }}>ชื่อ - นามสกุล</th>
                            <th rowSpan={2} style={{ background: "#dbeafe", border: "1px solid #0f172a", padding: "0.5rem", textAlign: "center", width: 110 }}>ลงเวลาเข้า</th>
                            <th rowSpan={2} style={{ background: "#dbeafe", border: "1px solid #0f172a", padding: "0.5rem", textAlign: "center", width: 110 }}>ลงเวลาออก</th>
                            <th colSpan={2} style={{ background: "#fed7aa", border: "1px solid #0f172a", padding: "0.5rem", textAlign: "center" }}>มาสาย</th>
                            <th colSpan={2} style={{ background: "#fed7aa", border: "1px solid #0f172a", padding: "0.5rem", textAlign: "center" }}>เลิกก่อน</th>
                          </tr>
                          <tr>
                            {["ช.ม.", "นาที", "ช.ม.", "นาที"].map((h, index) => (
                              <th key={`${h}-${index}`} style={{ background: "#fed7aa", border: "1px solid #0f172a", padding: "0.45rem", textAlign: "center", width: 78 }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((row, index) => (
                            <tr key={`${date.key}-${row.emp.id}`} style={{ background: index % 2 === 0 ? "#fff" : "#f8fafc" }}>
                              <td style={{ border: "1px solid #0f172a", padding: "0.45rem", textAlign: "center", fontWeight: 800 }}>{index + 1}</td>
                              <td style={{ border: "1px solid #0f172a", padding: "0.45rem 0.6rem", fontWeight: 700, color: "#0f172a" }}>{row.emp.name}</td>
                              <td style={{ border: "1px solid #0f172a", padding: "0.45rem", textAlign: "center", fontWeight: 800, color: row.checkInText === "-" ? "#94a3b8" : "#0f172a" }}>{row.checkInText === "-" ? "-" : `${row.checkInText} น.`}</td>
                              <td style={{ border: "1px solid #0f172a", padding: "0.45rem", textAlign: "center", fontWeight: 800, color: row.checkOutText.includes("ยังไม่กลับ") ? "#dc2626" : "#0f172a" }}>{row.checkOutText === "-" ? "-" : `${row.checkOutText} น.`}</td>
                              <td style={{ border: "1px solid #0f172a", padding: "0.45rem", textAlign: "center", color: row.lateHours !== "" ? "#dc2626" : "#0f172a", fontWeight: row.lateHours !== "" ? 900 : 500 }}>{row.lateHours}</td>
                              <td style={{ border: "1px solid #0f172a", padding: "0.45rem", textAlign: "center", color: row.lateMinutes !== "" ? "#dc2626" : "#0f172a", fontWeight: row.lateMinutes !== "" ? 900 : 500 }}>{row.lateMinutes}</td>
                              <td style={{ border: "1px solid #0f172a", padding: "0.45rem", textAlign: "center", color: row.earlyHours !== "" ? "#dc2626" : "#0f172a", fontWeight: row.earlyHours !== "" ? 900 : 500 }}>{row.earlyHours}</td>
                              <td style={{ border: "1px solid #0f172a", padding: "0.45rem", textAlign: "center", color: row.earlyMinutes !== "" ? "#dc2626" : "#0f172a", fontWeight: row.earlyMinutes !== "" ? 900 : 500 }}>{row.earlyMinutes}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  );
                })}
              </div>
            )}

            {reportType === "late" && (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
                <thead>
                  <tr style={{ background: "#f8fafc", borderBottom: "2px solid #f1f5f9" }}>
                    {["พนักงาน", "แผนก", "วันที่", "เวลาเข้า", "สาย"].map(h => (
                      <th key={h} style={{ padding: "0.6rem 0.75rem", textAlign: "left", color: "#64748b", fontWeight: 600, fontSize: "0.75rem", whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {attendance.filter(a => inMonth(a.check_in) && (!empFilter || a.employee_id === empFilter)).filter(a => checkLate(a.check_in, settings?.work_start)?.late).map((a, i) => {
                    const li = checkLate(a.check_in, settings?.work_start);
                    return (
                      <tr key={a.id} style={{ borderBottom: "1px solid #f8fafc", background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                        <td style={{ padding: "0.6rem 0.75rem", fontWeight: 600 }}>{a.employees?.name || "-"}</td>
                        <td style={{ padding: "0.6rem 0.75rem", color: "#64748b" }}>{a.employees?.department || "-"}</td>
                        <td style={{ padding: "0.6rem 0.75rem", color: "#475569" }}>{fmtDate(a.check_in)}</td>
                        <td style={{ padding: "0.6rem 0.75rem", color: "#dc2626", fontWeight: 700 }}>{fmtTime(a.check_in)}</td>
                        <td style={{ padding: "0.6rem 0.75rem" }}><span style={{ background: "#fef2f2", color: "#dc2626", fontSize: "0.78rem", fontWeight: 700, padding: "0.25rem 0.6rem", borderRadius: "20px" }}>⚠️ {formatMinutes(li.minutes)}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}

            {reportType === "leave" && (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
                <thead>
                  <tr style={{ background: "#f8fafc", borderBottom: "2px solid #f1f5f9" }}>
                    {["พนักงาน", "ประเภท", "ระยะเวลา", "จาก", "ถึง", "ชม.", "เหตุผล", "สถานะ"].map(h => (
                      <th key={h} style={{ padding: "0.6rem 0.75rem", textAlign: "left", color: "#64748b", fontWeight: 600, fontSize: "0.75rem", whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {leaves.filter(l => inMonth(l.start_date) && (!empFilter || l.employee_id === empFilter)).map((l, i) => (
                    <tr key={l.id} style={{ borderBottom: "1px solid #f8fafc", background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                      <td style={{ padding: "0.6rem 0.75rem", fontWeight: 600 }}>{l.employees?.name || "-"}</td>
                      <td style={{ padding: "0.6rem 0.75rem", color: "#7c3aed", fontWeight: 600 }}>{l.leave_type}</td>
                      <td style={{ padding: "0.6rem 0.75rem", color: "#475569" }}>{l.duration_type}</td>
                      <td style={{ padding: "0.6rem 0.75rem", color: "#475569", whiteSpace: "nowrap" }}>{fmtDate(l.start_date)}</td>
                      <td style={{ padding: "0.6rem 0.75rem", color: "#475569", whiteSpace: "nowrap" }}>{fmtDate(l.end_date)}</td>
                      <td style={{ padding: "0.6rem 0.75rem", fontWeight: 600 }}>{l.hours || 8}</td>
                      <td style={{ padding: "0.6rem 0.75rem", color: "#64748b", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.reason}</td>
                      <td style={{ padding: "0.6rem 0.75rem" }}>
                        <span style={{
                          background: l.status === "approved" ? "#dcfce7" : l.status === "rejected" ? "#fef2f2" : "#fef3c7",
                          color: l.status === "approved" ? "#16a34a" : l.status === "rejected" ? "#dc2626" : "#d97706",
                          fontSize: "0.72rem", fontWeight: 700, padding: "0.2rem 0.6rem", borderRadius: "20px"
                        }}>{l.status === "approved" ? "อนุมัติ" : l.status === "rejected" ? "ไม่อนุมัติ" : "รออนุมัติ"}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {reportType === "outing" && (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
                <thead>
                  <tr style={{ background: "#f8fafc", borderBottom: "2px solid #f1f5f9" }}>
                    {["พนักงาน", "วันที่", "เวลาออก", "เวลากลับ", "ปลายทาง", "เหตุผล"].map(h => (
                      <th key={h} style={{ padding: "0.6rem 0.75rem", textAlign: "left", color: "#64748b", fontWeight: 600, fontSize: "0.75rem", whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {outings.filter(o => inMonth(o.out_time) && (!empFilter || o.employee_id === empFilter)).map((o, i) => (
                    <tr key={o.id} style={{ borderBottom: "1px solid #f8fafc", background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                      <td style={{ padding: "0.6rem 0.75rem", fontWeight: 600 }}>{o.employees?.name || "-"}</td>
                      <td style={{ padding: "0.6rem 0.75rem", color: "#475569" }}>{fmtDate(o.out_time)}</td>
                      <td style={{ padding: "0.6rem 0.75rem", color: "#d97706", fontWeight: 600 }}>{fmtTime(o.out_time)}</td>
                      <td style={{ padding: "0.6rem 0.75rem", color: "#16a34a", fontWeight: 600 }}>{o.return_time ? fmtTime(o.return_time) : "ยังไม่กลับ"}</td>
                      <td style={{ padding: "0.6rem 0.75rem", color: "#475569" }}>{o.destination || "-"}</td>
                      <td style={{ padding: "0.6rem 0.75rem", color: "#64748b", maxWidth: 250, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

function shiftDateKey(dateKey, days) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day));
  utc.setUTCDate(utc.getUTCDate() + days);
  return utc.toISOString().slice(0, 10);
}

function mondayOf(dateKey) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  const diff = weekday === 0 ? -6 : 1 - weekday;
  return shiftDateKey(dateKey, diff);
}

function weekPeriodKey(mondayKey) {
  return Number(mondayKey.replace(/-/g, ""));
}

function formatThaiDateKey(dateKey) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey || "")) return "-";
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12)).toLocaleDateString("th-TH", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "2-digit",
    timeZone: "UTC",
  });
}

function formatWeekLabel(mondayKey) {
  return `${formatThaiDateKey(mondayKey)} – ${formatThaiDateKey(shiftDateKey(mondayKey, 4))}`;
}

function emptySupervisionPlan(weekStart) {
  return {
    version: 4,
    week_start: weekStart,
    signoff: null,
    observations: [],
    status: "",
    late: false,
    submitted_at: null,
    updated_at: null,
    periods: [],
  };
}

function emptyWeekPeriod(teachDate, periodNo) {
  return {
    id: newSupervisionId(),
    teach_date: teachDate,
    period_no: periodNo,
    free: false,
    plan_unit: "",
    plan_id: "",
    plan_hour: "",
    lesson_page: "",
    start_time: "",
    end_time: "",
    subject: "",
    lesson_intro: "",
    lesson_activity: "",
    lesson_practice: "",
    lesson_summary: "",
    media_links: "",
    media_detail: "",
    homework: "no",
    homework_what: "",
    homework_page: "",
    homework_file: null,
    worksheet_file: null,
    youtube_links: [],
    post_note: emptyPostNote(),
  };
}

function normalizeSupervisionPeriod(period, weekStart) {
  const source = period && typeof period === "object" ? period : {};
  const numberMatch = String(source.period_no ?? source.period ?? "").match(/\d+/);
  const friday = shiftDateKey(weekStart, 4);
  let teachDate = /^\d{4}-\d{2}-\d{2}$/.test(source.teach_date || "") ? source.teach_date : weekStart;
  if (teachDate < weekStart || teachDate > friday) teachDate = weekStart;
  const periodNo = Math.min(6, Math.max(1, Number(numberMatch?.[0] || 1)));
  return {
    id: source.id || newSupervisionId(),
    teach_date: teachDate,
    period_no: periodNo,
    free: !!source.free,
    plan_unit: source.plan_unit || "",
    plan_id: source.plan_id || "",
    plan_hour: source.plan_hour ? String(source.plan_hour) : "",
    lesson_page: source.lesson_page || "",
    start_time: String(source.start_time || "").slice(0, 5),
    end_time: String(source.end_time || "").slice(0, 5),
    subject: source.subject || source.topic || "",
    lesson_intro: source.lesson_intro || "",
    lesson_activity: source.lesson_activity || (!source.lesson_intro && !source.lesson_practice && !source.lesson_summary ? (source.lesson || "") : ""),
    lesson_practice: source.lesson_practice || "",
    lesson_summary: source.lesson_summary || "",
    media_links: source.media_links || "",
    media_detail: source.media_detail || "",
    homework: source.homework === "yes" ? "yes" : "no",
    homework_what: source.homework_what || source.homework_detail || "",
    homework_page: source.homework_page || "",
    homework_file: source.homework_file?.dataUrl ? source.homework_file : null,
    worksheet_file: source.worksheet_file?.url || source.worksheet_file?.dataUrl ? source.worksheet_file : null,
    youtube_links: cleanYoutubeLinks(source.youtube_links),
    post_note: cleanPostNote(source.post_note),
  };
}

function periodsForEditor(plan, weekStart) {
  const saved = Array.isArray(plan?.periods) ? plan.periods.map(period => normalizeSupervisionPeriod(period, weekStart)) : [];
  return weekDates(weekStart).flatMap(date => Array.from({ length: 6 }, (_, index) => {
    const periodNo = index + 1;
    return saved.find(period => period.teach_date === date && period.period_no === periodNo) || emptyWeekPeriod(date, periodNo);
  }));
}

function supervisionStatusFromStartTime(startTime) {
  const time = String(startTime || "");
  if (time.startsWith("00:03")) return "late";
  if (time.startsWith("00:02")) return "submitted";
  if (time.startsWith("00:01")) return "draft";
  return "missing";
}

function supervisionStartTime(plan) {
  if (plan?.status === "submitted" && plan?.late) return "00:03:00";
  if (plan?.status === "submitted") return "00:02:00";
  if (plan?.status === "draft") return "00:01:00";
  return "00:00:00";
}

function bangkokDateKey(iso) {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" });
}

function bangkokDateTimeKey(iso) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const pick = type => parts.find(part => part.type === type)?.value || "00";
  return `${pick("year")}-${pick("month")}-${pick("day")}T${pick("hour")}:${pick("minute")}:${pick("second")}`;
}

function supervisionDeadlineStamp(weekStart) {
  return `${shiftDateKey(weekStart, -1)}T15:00:00`;
}

function resolveSubmission(nextStatus, previousStatus, previousSubmittedAt, previousLate, weekStart) {
  if (nextStatus !== "submitted") return { status: nextStatus || "draft", submitted_at: null, late: false };
  if (previousStatus === "submitted" && previousSubmittedAt) {
    return { status: "submitted", submitted_at: previousSubmittedAt, late: !!previousLate };
  }
  const submittedAt = new Date().toISOString();
  return { status: "submitted", submitted_at: submittedAt, late: bangkokDateTimeKey(submittedAt) > supervisionDeadlineStamp(weekStart) };
}

function weekDates(mondayKey) {
  return [0, 1, 2, 3, 4].map(offset => shiftDateKey(mondayKey, offset));
}

function defaultDailyDate(mondayKey) {
  const today = todayISO();
  const friday = shiftDateKey(mondayKey, 4);
  if (today >= mondayKey && today <= friday) return today;
  if (today > friday) return friday;
  return mondayKey;
}

const KINDER_ACTIVITIES = [
  { key: "move", label: "เคลื่อนไหวและจังหวะ" },
  { key: "experience", label: "เสริมประสบการณ์" },
  { key: "art", label: "ศิลปะสร้างสรรค์" },
  { key: "corner", label: "เล่นตามมุม" },
  { key: "outdoor", label: "เล่นกลางแจ้ง" },
  { key: "game", label: "เกมการศึกษา" },
];

function emptyKinderActivities() {
  return { move: "", experience: "", art: "", corner: "", outdoor: "", game: "" };
}

function emptyKinderDay(date) {
  return { date, off: false, activities: emptyKinderActivities() };
}

function normalizeKinderDay(day, weekStart) {
  const friday = shiftDateKey(weekStart, 4);
  let date = /^\d{4}-\d{2}-\d{2}$/.test(day?.date || "") ? day.date : weekStart;
  if (date < weekStart || date > friday) date = weekStart;
  const activities = emptyKinderActivities();
  KINDER_ACTIVITIES.forEach(item => {
    activities[item.key] = String(day?.activities?.[item.key] || "").replace(/\s+/g, " ").trim().slice(0, 500);
  });
  return { date, off: !!day?.off, activities };
}

function kinderDaysForEditor(plan, weekStart) {
  const saved = Array.isArray(plan?.days) ? plan.days.map(day => normalizeKinderDay(day, weekStart)) : [];
  return weekDates(weekStart).map(date => saved.find(day => day.date === date) || emptyKinderDay(date));
}

function kinderDayReady(day) {
  if (day?.off) return true;
  return KINDER_ACTIVITIES.every(item => String(day?.activities?.[item.key] || "").trim());
}

function kinderDaySummary(day) {
  if (day?.off) return "วันนี้ไม่มีแผนสอน";
  const filled = KINDER_ACTIVITIES.filter(item => String(day?.activities?.[item.key] || "").trim());
  if (filled.length === 0) return "ยังไม่ได้กรอก";
  const first = String(day.activities[filled[0].key] || "").trim();
  return filled.length === KINDER_ACTIVITIES.length ? first : `กรอกแล้ว ${filled.length}/6 · ${first}`;
}

function parseSupervisionPlan(subject, weekStart) {
  try {
    const parsed = JSON.parse(subject || "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return emptySupervisionPlan(weekStart);
    return {
      ...emptySupervisionPlan(weekStart),
      ...parsed,
      week_start: weekStart,
      kind: parsed.kind === "kindergarten" ? "kindergarten" : "",
      unit: String(parsed.unit || "").trim().slice(0, 80),
      room: String(parsed.room || "").trim().slice(0, 40),
      days: Array.isArray(parsed.days) ? parsed.days.map(day => normalizeKinderDay(day, weekStart)) : [],
      observations: Array.isArray(parsed.observations) ? parsed.observations : [],
      periods: Array.isArray(parsed.periods) ? parsed.periods.map(period => normalizeSupervisionPeriod(period, weekStart)) : [],
      signoff: parsed.signoff || null,
      late: !!parsed.late,
    };
  } catch {
    return emptySupervisionPlan(weekStart);
  }
}

async function fetchTeacherLevel(employeeId) {
  const { data, error } = await supabase.from("salary_settings").select("leave_deduct_types").eq("employee_id", employeeId).limit(1);
  if (error) throw new Error(error.message);
  return parseEmployeePayrollMeta(data?.[0]?.leave_deduct_types).teacher_level || "";
}

function newSupervisionId() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function isAllowedSupervisionFile(file) {
  const name = String(file?.name || "").toLowerCase();
  return SUPERVISION_FILE_EXTENSIONS.some(extension => name.endsWith(extension));
}

async function fetchSupervisionRows(employeeId, dateKey, dayOfWeek = 0) {
  let query = supabase
    .from("teaching_schedule")
    .select("id, employee_id, subject, start_time, end_time, created_at")
    .eq("class_room", SUPERVISION_SCHEDULE_ROOM)
    .eq("day_of_week", dayOfWeek)
    .eq("period", weekPeriodKey(dateKey))
    .order("created_at", { ascending: false });
  if (employeeId) query = query.eq("employee_id", employeeId);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data || [];
}

async function writeSupervisionPlan(employeeId, dateKey, plan, existingId, dayOfWeek = 0) {
  const payload = {
    employee_id: employeeId,
    day_of_week: dayOfWeek,
    period: weekPeriodKey(dateKey),
    class_room: SUPERVISION_SCHEDULE_ROOM,
    start_time: supervisionStartTime(plan),
    end_time: plan.signoff?.at ? "00:01:00" : null,
    subject: JSON.stringify({ ...plan, updated_at: new Date().toISOString() }),
  };
  const result = existingId
    ? await supabase.from("teaching_schedule").update(payload).eq("id", existingId).select("id, created_at").single()
    : await supabase.from("teaching_schedule").insert(payload).select("id, created_at").single();
  if (result.error) throw new Error(result.error.message);
  const rows = await fetchSupervisionRows(employeeId, dateKey, dayOfWeek);
  const extras = rows.filter(row => row.id !== result.data.id).map(row => row.id);
  if (extras.length) await supabase.from("teaching_schedule").delete().in("id", extras);
  return result.data.id;
}

// ─── SCHEDULE PAGE ────────────────────────────────────────────────────────────
function SchedulePage({ employees, currentUser, onRefresh }) {
  const [schedules, setSchedules] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [empView, setEmpView] = useState(currentUser?.role === "admin" ? "" : currentUser?.id);

  const loadSchedules = async () => {
    const { data } = await supabase
      .from("teaching_schedule")
      .select("*, employees(name, department)")
      .or(`class_room.is.null,and(class_room.neq.${SUPERVISION_SCHEDULE_ROOM},class_room.neq.${STUDENT_ROLL_ROOM},class_room.neq.${ACADEMIC_RECORD_ROOM})`)
      .order("day_of_week")
      .order("period");
    setSchedules((data || []).filter(row => row.class_room !== SUPERVISION_SCHEDULE_ROOM && row.class_room !== STUDENT_ROLL_ROOM && row.class_room !== ACADEMIC_RECORD_ROOM));
  };

  useEffect(() => {
    loadSchedules();
  }, []);

  const refresh = loadSchedules;

  const filtered = empView ? schedules.filter(s => s.employee_id === empView) : schedules;
  const today = new Date().getDay(); // 0=อาทิตย์, 1=จันทร์,...

  const handleDelete = async (id) => {
    if (!window.confirm("ลบรายการนี้?")) return;
    await supabase.from("teaching_schedule").delete().eq("id", id);
    refresh();
  };

  return (
    <div>
      <PageHeader title="ตารางสอน" count={filtered.length} onAdd={currentUser?.role === "admin" ? () => setShowAdd(true) : null} addLabel="เพิ่มคาบ" />

      <Card>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "1rem", alignItems: "end" }}>
          <Field label="ดูตารางสอนของ">
            <select value={empView} onChange={e => setEmpView(e.target.value)} style={{ ...selectStyle, width: "auto", minWidth: 250 }}>
              {currentUser?.role === "admin" && <option value="">ทั้งหมด</option>}
              {employees.map(e => <option key={e.id} value={e.id}>{e.name} — {e.department}</option>)}
            </select>
          </Field>
          {today >= 1 && today <= 5 && (
            <div style={{ marginLeft: "auto", padding: "0.65rem 1rem", background: "#eff6ff", borderRadius: "10px", fontSize: "0.85rem", color: "#1d4ed8", fontWeight: 600 }}>
              📅 วันนี้: {DAY_NAMES[today]}
            </div>
          )}
        </div>
      </Card>

      {/* แสดงเป็น Grid ตาม วัน-คาบ */}
      <div style={{ marginTop: "1rem" }}>
        {[1, 2, 3, 4, 5].map(day => {
          const daySchedules = filtered.filter(s => s.day_of_week === day);
          if (daySchedules.length === 0) return null;
          const isToday = day === today;
          return (
            <Card key={day} padding="1rem" >
              <div style={{ marginBottom: "0.75rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <div style={{ fontSize: "1rem", fontWeight: 800, color: isToday ? "#2563eb" : "#0f172a" }}>
                  {isToday && "📍 "}วัน{DAY_NAMES[day]}
                </div>
                {isToday && <span style={{ background: "#dcfce7", color: "#16a34a", fontSize: "0.7rem", fontWeight: 700, padding: "0.15rem 0.5rem", borderRadius: "20px" }}>วันนี้</span>}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "0.6rem" }}>
                {daySchedules.map(s => (
                  <div key={s.id} style={{ background: isToday ? "#eff6ff" : "#f8fafc", border: `1.5px solid ${isToday ? "#bfdbfe" : "#e2e8f0"}`, borderRadius: "10px", padding: "0.75rem", position: "relative" }}>
                    <div style={{ fontSize: "0.7rem", color: "#64748b", fontWeight: 600 }}>คาบที่ {s.period}</div>
                    <div style={{ fontSize: "0.95rem", fontWeight: 700, color: "#0f172a", marginTop: "0.25rem" }}>{s.subject}</div>
                    {s.class_room && <div style={{ fontSize: "0.75rem", color: "#475569", marginTop: "0.15rem" }}>🏫 {s.class_room}</div>}
                    {s.start_time && <div style={{ fontSize: "0.72rem", color: "#94a3b8", marginTop: "0.15rem" }}>⏰ {s.start_time?.slice(0,5)} - {s.end_time?.slice(0,5)}</div>}
                    {!empView && <div style={{ fontSize: "0.72rem", color: "#7c3aed", marginTop: "0.15rem", fontWeight: 600 }}>👤 {s.employees?.name}</div>}
                    {currentUser?.role === "admin" && (
                      <button onClick={() => handleDelete(s.id)} style={{ position: "absolute", top: "0.4rem", right: "0.4rem", background: "#fef2f2", border: "none", borderRadius: "6px", padding: "0.25rem", cursor: "pointer", color: "#dc2626" }}><Trash2 size={12} /></button>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          );
        })}
        {filtered.length === 0 && (
          <Card><div style={{ textAlign: "center", padding: "2rem", color: "#94a3b8" }}>ยังไม่มีตารางสอน {currentUser?.role === "admin" && "— กดปุ่ม 'เพิ่มคาบ' เพื่อสร้าง"}</div></Card>
        )}
      </div>

      {showAdd && <ScheduleModal employees={employees} onClose={() => setShowAdd(false)} onSave={() => { setShowAdd(false); refresh(); }} />}
    </div>
  );
}

function ScheduleModal({ employees, onClose, onSave }) {
  const [form, setForm] = useState({
    employee_id: "", day_of_week: 1, period: 1, subject: "", class_room: "", start_time: "08:30", end_time: "09:20"
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSave = async () => {
    if (!form.employee_id) { setError("กรุณาเลือกครู"); return; }
    if (!form.subject.trim()) { setError("กรุณากรอกวิชา"); return; }
    setSaving(true);
    const { error } = await supabase.from("teaching_schedule").insert(form);
    setSaving(false);
    if (error) { setError(error.message); return; }
    onSave();
  };

  return (
    <Modal title="เพิ่มตารางสอน" onClose={onClose} icon={Calendar} color="#7c3aed">
      <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        {error && <ErrorBox>{error}</ErrorBox>}
        <Field label="ครู *">
          <select value={form.employee_id} onChange={e => setForm(f => ({ ...f, employee_id: e.target.value }))} style={selectStyle}>
            <option value="">-- เลือกครู --</option>
            {employees.map(e => <option key={e.id} value={e.id}>{e.name} — {e.department}</option>)}
          </select>
        </Field>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
          <Field label="วัน">
            <select value={form.day_of_week} onChange={e => setForm(f => ({ ...f, day_of_week: parseInt(e.target.value) }))} style={selectStyle}>
              {[1,2,3,4,5].map(d => <option key={d} value={d}>วัน{DAY_NAMES[d]}</option>)}
            </select>
          </Field>
          <Field label="คาบที่">
            <input type="number" min="1" max="12" value={form.period} onChange={e => setForm(f => ({ ...f, period: parseInt(e.target.value) || 1 }))} style={inputStyle} />
          </Field>
        </div>
        <Field label="วิชา *">
          <input value={form.subject} onChange={e => setForm(f => ({ ...f, subject: e.target.value }))} placeholder="เช่น คณิตศาสตร์ ป.4" style={inputStyle} />
        </Field>
        <Field label="ห้องเรียน">
          <input value={form.class_room} onChange={e => setForm(f => ({ ...f, class_room: e.target.value }))} placeholder="เช่น ป.4/1" style={inputStyle} />
        </Field>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
          <Field label="เวลาเริ่ม">
            <input type="time" value={form.start_time} onChange={e => setForm(f => ({ ...f, start_time: e.target.value }))} style={inputStyle} />
          </Field>
          <Field label="เวลาสิ้นสุด">
            <input type="time" value={form.end_time} onChange={e => setForm(f => ({ ...f, end_time: e.target.value }))} style={inputStyle} />
          </Field>
        </div>
        <ButtonRow onCancel={onClose} onSave={handleSave} saving={saving} />
      </div>
    </Modal>
  );
}

function SupervisionStatusBadge({ status }) {
  const map = {
    submitted: { bg: "#dcfce7", color: "#166534", label: "ส่งแล้ว" },
    late: { bg: "#fef3c7", color: "#b45309", label: "สาย" },
    draft: { bg: "#fff7ed", color: "#c2410c", label: "ฉบับร่าง" },
    missing: { bg: "#fee2e2", color: "#b91c1c", label: "ยังไม่ส่ง" },
    pending: { bg: "#fff7ed", color: "#c2410c", label: "รอท้ายคาบ" },
    recorded: { bg: "#dcfce7", color: "#166534", label: "บันทึกแล้ว" },
    approved: { bg: "#dbeafe", color: "#1d4ed8", label: "รับทราบแล้ว" },
  };
  const item = map[status] || map.missing;
  return <span style={{ background: item.bg, color: item.color, fontSize: "0.72rem", fontWeight: 800, padding: "0.2rem 0.6rem", borderRadius: "20px", whiteSpace: "nowrap" }}>{item.label}</span>;
}

function supervisionBoardGroup(status) {
  if (status === "submitted") return "submitted";
  if (status === "late") return "late";
  return "missing";
}

const OBSERVATION_MATCH = [{ value: "yes", label: "ตรงกับบันทึก" }, { value: "partial", label: "ตรงบางส่วน" }, { value: "no", label: "ไม่ตรงกับบันทึก" }];

function labelOf(options, value) {
  return options.find(item => item.value === value)?.label || "";
}

function WeekSwitcher({ weekStart, onChange, disabled = false }) {
  const currentMonday = mondayOf(todayISO());
  const buttonStyle = { ...btnSecondary, flex: "none", cursor: disabled ? "not-allowed" : "pointer" };
  return (
    <Card>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.75rem", flexWrap: "wrap" }}>
        <button type="button" disabled={disabled} onClick={() => onChange(shiftDateKey(weekStart, -7))} style={buttonStyle}><ChevronLeft size={16} /> สัปดาห์ก่อน</button>
        <div style={{ textAlign: "center", minWidth: 200 }}>
          <div style={{ fontWeight: 800, color: "#0f172a" }}>{formatWeekLabel(weekStart)}</div>
          <div style={{ fontSize: "0.75rem", color: "#64748b" }}>จันทร์–ศุกร์</div>
        </div>
        <button type="button" disabled={disabled} onClick={() => onChange(shiftDateKey(weekStart, 7))} style={buttonStyle}>สัปดาห์ถัดไป <ChevronRight size={16} /></button>
      </div>
      {weekStart !== currentMonday && (
        <button type="button" disabled={disabled} onClick={() => onChange(currentMonday)} style={{ ...buttonStyle, marginTop: "0.75rem" }}>สัปดาห์นี้</button>
      )}
    </Card>
  );
}

function SupervisionFileBlock({ file }) {
  if (!file?.dataUrl) return <div style={{ color: "#94a3b8", fontSize: "0.9rem" }}>ยังไม่มีไฟล์</div>;
  const isImage = String(file.type || "").startsWith("image/") || String(file.dataUrl).startsWith("data:image/");
  const isPdf = file.type === "application/pdf" || String(file.name || "").toLowerCase().endsWith(".pdf");
  return (
    <div style={{ display: "grid", gap: "0.75rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ fontWeight: 800, color: "#0f172a", wordBreak: "break-word" }}>{file.name || "ไฟล์"}</div>
        <a href={file.dataUrl} download={file.name || "ไฟล์"} style={{ ...btnSecondary, flex: "none", textDecoration: "none" }}>ดาวน์โหลด</a>
      </div>
      {isImage && <img src={file.dataUrl} alt={file.name || "ไฟล์แผน"} style={{ width: "100%", maxHeight: 320, objectFit: "contain", borderRadius: "12px", background: "#f8fafc", border: "1px solid #e2e8f0" }} />}
      {isPdf && <iframe title={file.name || "ไฟล์แผน"} src={file.dataUrl} style={{ width: "100%", height: 420, border: "1px solid #e2e8f0", borderRadius: "12px", background: "#fff" }} />}
    </div>
  );
}

function FullText({ value }) {
  const text = String(value || "").trim();
  return <div style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", color: text ? "#0f172a" : "#94a3b8", lineHeight: 1.65, fontSize: "0.95rem" }}>{text || "ไม่มีข้อมูล"}</div>;
}

function LinkLines({ value }) {
  const lines = String(value || "").split(/\n/).map(line => line.trim()).filter(Boolean);
  if (lines.length === 0) return <div style={{ color: "#94a3b8" }}>ไม่มีข้อมูล</div>;
  return (
    <div style={{ display: "grid", gap: "0.35rem" }}>
      {lines.map((line, index) => (
        /^https?:\/\//i.test(line)
          ? <a key={`${line}-${index}`} href={line} target="_blank" rel="noreferrer" style={{ color: "#1d4ed8", wordBreak: "break-all" }}>{line}</a>
          : <div key={`${line}-${index}`} style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", color: "#0f172a" }}>{line}</div>
      ))}
    </div>
  );
}


// ─── LESSON PLAN EXTRAS: ใบงาน PDF / YouTube / บันทึกหลังสอน ─────────────────
const LESSON_FILE_BUCKET = "lesson-files";
const POST_NOTE_DOMAINS = [
  { key: "k", label: "ด้านความรู้ (K)" },
  { key: "p", label: "ด้านทักษะกระบวนการ (P)" },
  { key: "a", label: "ด้านคุณลักษณะอันพึงประสงค์ (A)" },
];
const POST_NOTE_TEXTS = [
  { key: "problems", label: "2. ปัญหา/อุปสรรค" },
  { key: "solutions", label: "3. แนวทางแก้ไข/พัฒนา" },
  { key: "suggestions", label: "4. ข้อเสนอแนะ" },
];

function emptyPostNote() {
  return {
    total: "",
    k: { pass: "", fail: "" },
    p: { pass: "", fail: "" },
    a: { pass: "", fail: "" },
    problems: "",
    solutions: "",
    suggestions: "",
    teacher_sign: "",
    teacher_date: "",
    admin_comment: "",
    admin_sign: "",
    admin_date: "",
  };
}

function countText(value) {
  const digits = String(value ?? "").replace(/[^\d]/g, "").slice(0, 4);
  return digits;
}

function cleanPostNote(raw) {
  const base = emptyPostNote();
  if (!raw || typeof raw !== "object") return base;
  const text = (value, max = 2000) => String(value || "").slice(0, max);
  const out = { ...base, total: countText(raw.total) };
  POST_NOTE_DOMAINS.forEach(({ key }) => {
    out[key] = { pass: countText(raw[key]?.pass), fail: countText(raw[key]?.fail) };
  });
  ["problems", "solutions", "suggestions", "admin_comment"].forEach(key => { out[key] = text(raw[key]); });
  ["teacher_sign", "admin_sign"].forEach(key => { out[key] = text(raw[key], 120); });
  ["teacher_date", "admin_date"].forEach(key => { out[key] = /^\d{4}-\d{2}-\d{2}$/.test(raw[key] || "") ? raw[key] : ""; });
  return out;
}

function postNoteHasData(note) {
  if (!note) return false;
  return !!(note.total || POST_NOTE_DOMAINS.some(({ key }) => note[key]?.pass || note[key]?.fail)
    || ["problems", "solutions", "suggestions", "teacher_sign", "admin_comment"].some(key => String(note[key] || "").trim()));
}

function postNotePercent(count, total) {
  const n = Number(count);
  const t = Number(total);
  if (!t || !String(count ?? "").trim()) return "";
  return `${((n / t) * 100).toFixed(2)}%`;
}

function cleanYoutubeLinks(list) {
  const source = Array.isArray(list) ? list : String(list || "").split(/\n/);
  return source.map(item => String(item || "").trim().slice(0, 300)).filter(Boolean).slice(0, 10);
}

function youtubeId(url) {
  const text = String(url || "").trim();
  const match = text.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/|v\/))([A-Za-z0-9_-]{11})/i);
  return match ? match[1] : "";
}

function lessonFileHref(file) {
  return file?.url || file?.dataUrl || "";
}

async function uploadLessonFile(file, employeeId) {
  const safeName = String(file.name || "worksheet.pdf").replace(/[^A-Za-z0-9._-]+/g, "_").slice(-80);
  const objectPath = `${employeeId || "unknown"}/${todayISO()}/${newSupervisionId()}-${safeName}`;
  try {
    const { error } = await supabase.storage
      .from(LESSON_FILE_BUCKET)
      .upload(objectPath, file, { contentType: file.type || "application/pdf", upsert: false });
    if (!error) {
      const { data } = supabase.storage.from(LESSON_FILE_BUCKET).getPublicUrl(objectPath);
      if (data?.publicUrl) return { name: file.name, type: file.type || "application/pdf", url: data.publicUrl, path: objectPath, storage: "supabase" };
    }
  } catch {
    // Storage ยังไม่ได้ตั้ง bucket → เก็บไฟล์ในแผนแบบเดิม (dataUrl)
  }
  if (file.size > SUPERVISION_FILE_LIMIT) throw new Error("ยังไม่ได้ตั้ง Storage bucket \"lesson-files\" ใน Supabase จึงเก็บไฟล์ได้ไม่เกิน 2.5 MB");
  const dataUrl = await readFileAsDataUrl(file);
  return { name: file.name, type: file.type || "application/pdf", dataUrl, storage: "inline" };
}

function localPlanKey(employeeId, weekStart) {
  return `hr_lessonplan_${employeeId}_${weekStart}`;
}

function saveLocalPlan(employeeId, weekStart, plan) {
  try { localStorage.setItem(localPlanKey(employeeId, weekStart), JSON.stringify({ ...plan, saved_local_at: new Date().toISOString() })); return true; } catch { return false; }
}

function loadLocalPlan(employeeId, weekStart) {
  try {
    const raw = localStorage.getItem(localPlanKey(employeeId, weekStart));
    return raw ? parseSupervisionPlan(raw, weekStart) : null;
  } catch { return null; }
}

function WorksheetLink({ file }) {
  const href = lessonFileHref(file);
  if (!href) return <div style={{ color: "#94a3b8", fontSize: "0.9rem" }}>ยังไม่ได้แนบใบงาน PDF</div>;
  return (
    <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
      <FileText size={18} color="#dc2626" />
      <span style={{ fontWeight: 700, color: "#0f172a", wordBreak: "break-word" }}>{file.name || "ใบงาน.pdf"}</span>
      <a href={href} target="_blank" rel="noreferrer" style={{ ...btnSecondary, flex: "none", textDecoration: "none" }}>เปิดดู</a>
      <a href={href} download={file.name || "ใบงาน.pdf"} style={{ ...btnSecondary, flex: "none", textDecoration: "none" }}>ดาวน์โหลด</a>
      {file.storage === "inline" && <span style={{ fontSize: "0.75rem", color: "#b45309" }}>(เก็บในแผน ยังไม่ได้ใช้ Storage)</span>}
    </div>
  );
}

function YoutubePreview({ url }) {
  const [play, setPlay] = useState(false);
  const id = youtubeId(url);
  if (!id) return <a href={url} target="_blank" rel="noreferrer" style={{ color: "#1d4ed8", wordBreak: "break-all" }}>{url}</a>;
  return (
    <div style={{ display: "grid", gap: "0.35rem", minWidth: 0 }}>
      {play ? (
        <iframe title={`youtube-${id}`} src={`https://www.youtube.com/embed/${id}`} allow="accelerometer; autoplay; clipboard-write; encrypted-media; picture-in-picture" allowFullScreen style={{ width: "100%", aspectRatio: "16 / 9", border: "none", borderRadius: "12px", background: "#000" }} />
      ) : (
        <button type="button" onClick={() => setPlay(true)} style={{ position: "relative", padding: 0, border: "none", background: "transparent", cursor: "pointer", borderRadius: "12px", overflow: "hidden" }}>
          <img src={`https://img.youtube.com/vi/${id}/hqdefault.jpg`} alt="ตัวอย่างวิดีโอ YouTube" style={{ width: "100%", display: "block", aspectRatio: "16 / 9", objectFit: "cover" }} />
          <span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "2.4rem", color: "#fff", textShadow: "0 2px 8px rgba(0,0,0,0.6)" }}>▶</span>
        </button>
      )}
      <a href={url} target="_blank" rel="noreferrer" style={{ color: "#1d4ed8", fontSize: "0.8rem", wordBreak: "break-all" }}>{url}</a>
    </div>
  );
}

function YoutubeGrid({ links }) {
  const list = cleanYoutubeLinks(links);
  if (list.length === 0) return <div style={{ color: "#94a3b8" }}>ไม่มีลิงก์ YouTube</div>;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 220px), 1fr))", gap: "0.75rem" }}>
      {list.map((url, index) => <YoutubePreview key={`${url}-${index}`} url={url} />)}
    </div>
  );
}

function YoutubeLinksEditor({ links, disabled, onChange }) {
  const list = Array.isArray(links) && links.length ? links : [""];
  const setAt = (index, value) => onChange(list.map((item, i) => (i === index ? value : item)));
  return (
    <div style={{ display: "grid", gap: "0.5rem" }}>
      {list.map((url, index) => (
        <div key={index} style={{ display: "flex", gap: "0.4rem", alignItems: "center" }}>
          <input value={url} disabled={disabled} placeholder="https://www.youtube.com/watch?v=..." onChange={event => setAt(index, event.target.value)} style={{ ...periodInput, flex: 1 }} />
          <button type="button" disabled={disabled} aria-label="ลบลิงก์" onClick={() => onChange(list.filter((_, i) => i !== index))} style={{ ...btnSecondary, flex: "none", color: "#dc2626" }}><X size={16} /></button>
        </div>
      ))}
      {list.length < 10 && <button type="button" disabled={disabled} onClick={() => onChange([...list, ""])} style={{ ...btnSecondary, flex: "none", width: "fit-content" }}><Plus size={16} /> เพิ่มลิงก์ YouTube</button>}
      <YoutubeGrid links={list} />
    </div>
  );
}

function PostNoteEditor({ note, disabled, teacherName, onChange }) {
  const value = cleanPostNote(note);
  const set = patch => onChange({ ...value, ...patch });
  const setDomain = (key, field, raw) => set({ [key]: { ...value[key], [field]: countText(raw) } });
  return (
    <div style={{ display: "grid", gap: "0.75rem" }}>
      <div style={{ fontWeight: 800, color: "#0f172a" }}>1. ผลการจัดการเรียนรู้</div>
      <Field label="จำนวนนักเรียนทั้งหมด (คน)">
        <input inputMode="numeric" value={value.total} disabled={disabled} onChange={event => set({ total: countText(event.target.value) })} style={{ ...periodInput, maxWidth: 160 }} />
      </Field>
      {POST_NOTE_DOMAINS.map(({ key, label }) => (
        <div key={key} style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "12px", padding: "0.6rem 0.75rem", display: "grid", gap: "0.5rem" }}>
          <div style={{ fontWeight: 700, color: "#334155" }}>{label}</div>
          <div style={periodGrid}>
            <Field label={`ผ่านเกณฑ์ (คน) ${postNotePercent(value[key].pass, value.total) && `· ${postNotePercent(value[key].pass, value.total)}`}`}>
              <input inputMode="numeric" value={value[key].pass} disabled={disabled} onChange={event => setDomain(key, "pass", event.target.value)} style={periodInput} />
            </Field>
            <Field label={`ไม่ผ่านเกณฑ์ (คน) ${postNotePercent(value[key].fail, value.total) && `· ${postNotePercent(value[key].fail, value.total)}`}`}>
              <input inputMode="numeric" value={value[key].fail} disabled={disabled} onChange={event => setDomain(key, "fail", event.target.value)} style={periodInput} />
            </Field>
          </div>
        </div>
      ))}
      {POST_NOTE_TEXTS.map(({ key, label }) => (
        <Field key={key} label={label}>
          <textarea value={value[key]} disabled={disabled} onChange={event => set({ [key]: event.target.value })} style={periodArea} />
        </Field>
      ))}
      <div style={periodGrid}>
        <Field label="ลงชื่อผู้สอน">
          <input value={value.teacher_sign} disabled={disabled} placeholder={teacherName || ""} onChange={event => set({ teacher_sign: event.target.value })} style={periodInput} />
        </Field>
        <Field label="วันที่บันทึก">
          <input type="date" value={value.teacher_date} disabled={disabled} onChange={event => set({ teacher_date: event.target.value })} style={periodInput} />
        </Field>
      </div>
      <PostNoteAdminRead note={value} />
    </div>
  );
}

function PostNoteAdminRead({ note }) {
  return (
    <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: "12px", padding: "0.6rem 0.75rem" }}>
      <div style={{ fontWeight: 800, color: "#1d4ed8" }}>5. ความเห็นผู้บริหาร/หัวหน้างานวิชาการ</div>
      <FullText value={note?.admin_comment} />
      {(note?.admin_sign || note?.admin_date) && <div style={{ fontSize: "0.85rem", color: "#334155", marginTop: "0.3rem" }}>ลงชื่อ {note.admin_sign || "-"} {note.admin_date ? `· ${formatThaiDateKey(note.admin_date)}` : ""}</div>}
    </div>
  );
}

function PostNoteRead({ note }) {
  const value = cleanPostNote(note);
  if (!postNoteHasData(value)) return <div style={{ color: "#94a3b8" }}>ยังไม่ได้บันทึกหลังสอน</div>;
  return (
    <div style={{ display: "grid", gap: "0.45rem" }}>
      <div style={{ fontWeight: 800, color: "#0f172a" }}>1. ผลการจัดการเรียนรู้ {value.total ? `(นักเรียน ${value.total} คน)` : ""}</div>
      {POST_NOTE_DOMAINS.map(({ key, label }) => (
        <div key={key} style={{ color: "#0f172a", fontSize: "0.92rem" }}>
          {label}: ผ่าน {value[key].pass || "-"} คน {postNotePercent(value[key].pass, value.total) && `(${postNotePercent(value[key].pass, value.total)})`} · ไม่ผ่าน {value[key].fail || "-"} คน {postNotePercent(value[key].fail, value.total) && `(${postNotePercent(value[key].fail, value.total)})`}
        </div>
      ))}
      {POST_NOTE_TEXTS.map(({ key, label }) => (
        <div key={key}><div style={{ fontWeight: 800, color: "#0f172a" }}>{label}</div><FullText value={value[key]} /></div>
      ))}
      <div style={{ color: "#334155", fontSize: "0.9rem" }}>ลงชื่อผู้สอน {value.teacher_sign || "-"} {value.teacher_date ? `· ${formatThaiDateKey(value.teacher_date)}` : ""}</div>
      <PostNoteAdminRead note={value} />
    </div>
  );
}

const supervisionTextArea = { ...inputStyle, minHeight: 110, resize: "vertical", lineHeight: 1.55 };

function clockLabel(value) {
  const text = String(value || "").slice(0, 5);
  return text || "……";
}

function periodHasDetail(period) {
  return !!(period?.start_time
    || period?.end_time
    || String(period?.subject || "").trim()
    || String(period?.lesson_intro || "").trim()
    || String(period?.lesson_activity || "").trim()
    || String(period?.lesson_practice || "").trim()
    || String(period?.lesson_summary || "").trim()
    || String(period?.lesson || "").trim()
    || String(period?.media_links || "").trim()
    || String(period?.media_detail || "").trim()
    || period?.homework === "yes"
    || period?.homework_file?.dataUrl
    || period?.worksheet_file?.url || period?.worksheet_file?.dataUrl
    || (period?.youtube_links || []).some(link => String(link || "").trim())
    || postNoteHasData(period?.post_note)
    || String(period?.plan_unit || "").trim()
    || String(period?.plan_id || "").trim()
    || String(period?.plan_hour || "").trim()
    || String(period?.lesson_page || "").trim());
}

function periodIsBlank(period) {
  return !period?.free && !periodHasDetail(period);
}

function selectedPlanParts(period) {
  const pack = THAI_P2_PLAN_PACK;
  const unit = pack.units.find(item => item.name === period?.plan_unit);
  const plan = unit?.plans.find(item => item.id === period?.plan_id);
  const hour = plan?.periods.find(item => String(item.hour) === String(period?.plan_hour || ""));
  return { pack, unit, plan, hour };
}

function planChoicePatch(period, patch) {
  if (patch.plan_unit !== undefined && patch.plan_unit !== period.plan_unit) {
    return { plan_unit: patch.plan_unit, plan_id: "", plan_hour: "", lesson_page: "" };
  }
  if (patch.plan_id !== undefined && patch.plan_id !== period.plan_id) {
    const pack = THAI_P2_PLAN_PACK;
    return {
      plan_id: patch.plan_id,
      plan_hour: "",
      lesson_page: "",
      subject: patch.plan_id && !String(period.subject || "").trim() ? pack.subject : period.subject,
    };
  }
  if (patch.plan_hour !== undefined && patch.plan_hour !== String(period.plan_hour || "")) {
    const hour = selectedPlanParts({ ...period, plan_hour: patch.plan_hour }).hour;
    return { plan_hour: patch.plan_hour, lesson_page: hour ? (hour.pages || []).join(", ") : "" };
  }
  return patch;
}

function periodFoldSummary(period, plan) {
  const planLabel = plan ? `แผน ${plan.plan_no} ${plan.title}` : "";
  const detail = String(period?.subject || "").trim() || planLabel;
  if (period?.free && detail) return `คาบว่าง · ${detail}`;
  if (period?.free) return "คาบว่าง";
  return detail || "ยังไม่ได้กรอก";
}

const periodInput = { ...inputStyle, boxSizing: "border-box", minWidth: 0, maxWidth: "100%", fontSize: "16px" };
const periodSelect = { ...periodInput };
const periodArea = { ...supervisionTextArea, boxSizing: "border-box", minWidth: 0, maxWidth: "100%", fontSize: "16px", minHeight: 96 };
const periodGrid = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 170px), 1fr))", gap: "0.75rem", minWidth: 0 };

function QuietFold({ title, children }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ borderTop: "1px solid #f1f5f9", minWidth: 0 }}>
      <button type="button" aria-expanded={open} onClick={() => setOpen(value => !value)} style={{ width: "100%", minHeight: 44, display: "flex", alignItems: "center", gap: "0.4rem", border: "none", background: "transparent", fontFamily: "inherit", textAlign: "left", cursor: "pointer", padding: "0.2rem 0" }}>
        <span style={{ fontWeight: 800, color: "#0f172a", flex: 1 }}>{title}</span>
        {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>
      {open && <div style={{ display: "grid", gap: "0.75rem", minWidth: 0, paddingBottom: "0.35rem" }}>{children}</div>}
    </div>
  );
}

function DayCard({ title, summary, children }) {
  const [open, setOpen] = useState(false);
  return (
    <Card>
      <button type="button" aria-expanded={open} onClick={() => setOpen(value => !value)} style={{ width: "100%", minHeight: 48, display: "flex", alignItems: "center", gap: "0.55rem", border: "none", background: "transparent", fontFamily: "inherit", textAlign: "left", cursor: "pointer", padding: 0 }}>
        <span style={{ fontWeight: 800, fontSize: "1.05rem", color: "#0f172a", flex: "0 0 auto" }}>{title}</span>
        <span style={{ color: "#64748b", fontSize: "0.8rem", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{summary}</span>
        {open ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
      </button>
      {open && <div style={{ display: "grid", gap: "0.45rem", minWidth: 0, marginTop: "0.75rem" }}>{children}</div>}
    </Card>
  );
}

function WeekPeriodEditor({ period, disabled, onChange, onPickFile, onPickWorksheet, worksheetBusy, teacherName }) {
  const [open, setOpen] = useState(false);
  const { pack, unit, plan } = selectedPlanParts(period);
  const choose = patch => onChange(planChoicePatch(period, patch));
  const summary = periodFoldSummary(period, plan);
  return (
    <div style={{ border: "1px solid #e2e8f0", borderRadius: "12px", padding: open ? "0.75rem" : "0.35rem 0.5rem", display: "grid", gap: "0.75rem", minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", minWidth: 0 }}>
        <button type="button" aria-expanded={open} aria-label={open ? `หุบคาบที่ ${period.period_no}` : `เปิดคาบที่ ${period.period_no}`} onClick={() => setOpen(value => !value)} style={{ width: 44, height: 44, flex: "none", border: "1px solid #e2e8f0", borderRadius: "10px", background: "#fff", color: "#1d4ed8", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
          {open ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
        </button>
        <button type="button" onClick={() => setOpen(value => !value)} style={{ flex: 1, minWidth: 0, textAlign: "left", background: "transparent", border: "none", padding: "0.25rem 0", fontFamily: "inherit", cursor: "pointer" }}>
          <div style={{ fontWeight: 800, color: "#0f172a" }}>คาบที่ {period.period_no}</div>
          {!open && <div style={{ fontSize: "0.8rem", color: period.free ? "#64748b" : "#475569", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{summary}</div>}
        </button>
        <label style={{ display: "flex", alignItems: "center", gap: "0.35rem", minHeight: 44, flex: "none", fontWeight: 700, color: "#475569", cursor: disabled ? "not-allowed" : "pointer" }}>
          <input type="checkbox" checked={!!period.free} disabled={disabled} onChange={event => onChange({ free: event.target.checked })} />
          คาบว่าง
        </label>
      </div>
      {open && (
      <>
      <div style={periodGrid}>
        <Field label="หน่วย">
          <select value={period.plan_unit || ""} disabled={disabled} onChange={event => choose({ plan_unit: event.target.value })} style={periodSelect}>
            <option value="">ไม่ใช้แผนในระบบ</option>
            {pack.units.map(item => <option key={item.name} value={item.name}>{item.name}</option>)}
          </select>
        </Field>
        <Field label="แผน">
          <select value={plan?.id || ""} disabled={disabled || !unit} onChange={event => choose({ plan_id: event.target.value })} style={periodSelect}>
            <option value="">ไม่เลือกแผน</option>
            {(unit?.plans || []).map(item => <option key={item.id} value={item.id}>แผน {item.plan_no} {item.title}</option>)}
          </select>
        </Field>
        <Field label="เรื่อง">
          <select value={period.plan_hour || ""} disabled={disabled || !plan} onChange={event => choose({ plan_hour: event.target.value })} style={periodSelect}>
            <option value="">ไม่เลือกเรื่อง</option>
            {(plan?.periods || []).map(item => <option key={item.hour} value={String(item.hour)}>ชั่วโมงที่ {item.hour}</option>)}
          </select>
        </Field>
        <Field label="หน้า">
          <input value={period.lesson_page || ""} disabled={disabled} onChange={event => onChange({ lesson_page: event.target.value })} style={periodInput} />
        </Field>
      </div>
      {plan?.objectives?.length > 0 && <div style={{ fontSize: "0.8rem", color: "#64748b", lineHeight: 1.5 }}>จุดประสงค์: {plan.objectives.join(" · ")}</div>}
      <div style={periodGrid}>
        <Field label="เวลาเริ่ม">
          <input type="time" value={period.start_time || ""} onChange={event => onChange({ start_time: event.target.value })} style={periodInput} />
        </Field>
        <Field label="เวลาสิ้นสุด">
          <input type="time" value={period.end_time || ""} onChange={event => onChange({ end_time: event.target.value })} style={periodInput} />
        </Field>
      </div>
      <Field label="วิชา">
        <input value={period.subject || ""} onChange={event => onChange({ subject: event.target.value })} style={periodInput} />
      </Field>
      <QuietFold title="รายละเอียดการสอน">
        <Field label="1. ขั้นนำเข้าสู่บทเรียน">
          <textarea value={period.lesson_intro || ""} onChange={event => onChange({ lesson_intro: event.target.value })} style={periodArea} />
        </Field>
        <Field label="2. ขั้นจัดกิจกรรมการเรียนรู้">
          <textarea value={period.lesson_activity || ""} onChange={event => onChange({ lesson_activity: event.target.value })} style={periodArea} />
        </Field>
        <Field label="3. ขั้นฝึกฝนประยุกต์">
          <textarea value={period.lesson_practice || ""} onChange={event => onChange({ lesson_practice: event.target.value })} style={periodArea} />
        </Field>
        <Field label="4. ขั้นสรุป">
          <textarea value={period.lesson_summary || ""} onChange={event => onChange({ lesson_summary: event.target.value })} style={periodArea} />
        </Field>
      </QuietFold>
      <QuietFold title="สื่อ / ใบงาน / YouTube">
        <Field label="ใบงาน (PDF)">
          <label style={{ ...btnSecondary, flex: "none", width: "fit-content", cursor: disabled ? "not-allowed" : "pointer" }}>
            <Upload size={16} /> {worksheetBusy ? "กำลังอัปโหลด..." : "อัปโหลดใบงาน PDF"}
            <input type="file" accept=".pdf,application/pdf" disabled={disabled || worksheetBusy} onChange={onPickWorksheet} style={{ display: "none" }} />
          </label>
          <div style={{ marginTop: "0.6rem" }}><WorksheetLink file={period.worksheet_file} /></div>
          {lessonFileHref(period.worksheet_file) && (
            <button type="button" onClick={() => onChange({ worksheet_file: null })} style={{ ...btnSecondary, flex: "none", marginTop: "0.6rem", color: "#dc2626" }}>เอาใบงาน PDF ออก</button>
          )}
        </Field>
        <Field label="ลิงก์ YouTube ที่ใช้สอน">
          <YoutubeLinksEditor links={period.youtube_links} disabled={disabled} onChange={links => onChange({ youtube_links: links })} />
        </Field>
        <Field label="ลิงก์สื่ออื่น">
          <textarea value={period.media_links || ""} onChange={event => onChange({ media_links: event.target.value })} style={periodArea} />
        </Field>
        <Field label="สื่อโดยละเอียด">
          <textarea value={period.media_detail || ""} onChange={event => onChange({ media_detail: event.target.value })} style={periodArea} />
        </Field>
      </QuietFold>
      <QuietFold title="บันทึกหลังสอน (บันทึกหลังแผน)">
        <PostNoteEditor note={period.post_note} disabled={disabled} teacherName={teacherName} onChange={note => onChange({ post_note: note })} />
      </QuietFold>
      <Field label="มีงานหรือการบ้านหรือไม่">
        <select value={period.homework === "yes" ? "yes" : "no"} onChange={event => {
          const homework = event.target.value;
          onChange(homework === "yes" ? { homework } : { homework, homework_what: "", homework_page: "", homework_file: null });
        }} style={periodSelect}>
          <option value="no">ไม่มี</option>
          <option value="yes">มี</option>
        </select>
      </Field>
      {period.homework === "yes" && (
        <>
          <Field label="งานหรือการบ้านคืออะไร">
            <textarea value={period.homework_what || ""} onChange={event => onChange({ homework_what: event.target.value })} style={periodArea} />
          </Field>
          <Field label="หน้าเท่าไร">
            <input value={period.homework_page || ""} onChange={event => onChange({ homework_page: event.target.value })} style={periodInput} />
          </Field>
          <Field label="ใบงาน">
            <label style={{ ...btnSecondary, flex: "none", width: "fit-content" }}>
              <Upload size={16} /> อัปโหลดใบงาน
              <input type="file" accept={SUPERVISION_FILE_ACCEPT} onChange={onPickFile} style={{ display: "none" }} />
            </label>
            <div style={{ marginTop: "0.75rem" }}><SupervisionFileBlock file={period.homework_file} /></div>
            {period.homework_file?.dataUrl && (
              <button type="button" onClick={() => onChange({ homework_file: null })} style={{ ...btnSecondary, flex: "none", marginTop: "0.75rem", color: "#dc2626" }}>เอาใบงานออก</button>
            )}
          </Field>
        </>
      )}
      </>
      )}
    </div>
  );
}

function SupervisionPeriodRead({ period, defaultOpen = false, adminSlot = null }) {
  const [open, setOpen] = useState(defaultOpen);
  const choice = selectedPlanParts(period);
  const planLabel = choice.plan ? `แผน ${choice.plan.plan_no} ${choice.plan.title}` : "";
  const topicLabel = choice.hour ? `ชั่วโมงที่ ${choice.hour.hour}` : "";
  const summary = periodFoldSummary(period, choice.plan);
  if (!period.free && !periodHasDetail(period)) {
    return <div style={{ background: "#f8fafc", borderRadius: "12px", padding: "0.7rem 0.8rem", color: "#94a3b8" }}>คาบที่ {period.period_no} · ยังไม่ได้กรอก</div>;
  }
  if (period.free && !periodHasDetail(period)) {
    return <div style={{ background: "#f8fafc", borderRadius: "12px", padding: "0.7rem 0.8rem", fontWeight: 800, color: "#64748b" }}>คาบที่ {period.period_no} · คาบว่าง</div>;
  }
  return (
    <div style={{ background: "#f8fafc", borderRadius: "12px", padding: "0.55rem 0.7rem", display: "grid", gap: "0.45rem", minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", minWidth: 0 }}>
        <button type="button" aria-expanded={open} aria-label={open ? `หุบคาบที่ ${period.period_no}` : `เปิดคาบที่ ${period.period_no}`} onClick={() => setOpen(value => !value)} style={{ width: 44, height: 44, flex: "none", border: "1px solid #e2e8f0", borderRadius: "10px", background: "#fff", color: "#1d4ed8", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
          {open ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
        </button>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 800, color: "#0f172a" }}>คาบที่ {period.period_no} · {clockLabel(period.start_time)} - {clockLabel(period.end_time)}</div>
          {!open && <div style={{ fontSize: "0.8rem", color: "#475569", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{summary}</div>}
        </div>
      </div>
      {open && (
        <div style={{ display: "grid", gap: "0.45rem", minWidth: 0 }}>
          {(choice.unit || planLabel || topicLabel || period.lesson_page) && (
            <div style={{ color: "#0f172a", lineHeight: 1.55 }}>
              {choice.unit && <div><strong>หน่วย: </strong>{choice.unit.name}</div>}
              {planLabel && <div><strong>แผน: </strong>{planLabel}</div>}
              {topicLabel && <div><strong>เรื่อง: </strong>{topicLabel}</div>}
              {period.lesson_page && <div style={{ overflowWrap: "anywhere" }}><strong>หน้า: </strong>{period.lesson_page}</div>}
            </div>
          )}
          {String(period.subject || "").trim() && <div style={{ color: "#0f172a" }}><strong>วิชา: </strong>{period.subject}</div>}
          {[
            ["1. ขั้นนำเข้าสู่บทเรียน", period.lesson_intro],
            ["2. ขั้นจัดกิจกรรมการเรียนรู้", period.lesson_activity],
            ["3. ขั้นฝึกฝนประยุกต์", period.lesson_practice],
            ["4. ขั้นสรุป", period.lesson_summary],
          ].filter(([, value]) => String(value || "").trim()).length > 0 && (
            <div style={{ display: "grid", gap: "0.45rem" }}>
              <div style={{ fontWeight: 800, color: "#0f172a" }}>รายละเอียดการสอน</div>
              {[
                ["1. ขั้นนำเข้าสู่บทเรียน", period.lesson_intro],
                ["2. ขั้นจัดกิจกรรมการเรียนรู้", period.lesson_activity],
                ["3. ขั้นฝึกฝนประยุกต์", period.lesson_practice],
                ["4. ขั้นสรุป", period.lesson_summary],
              ].filter(([, value]) => String(value || "").trim()).map(([label, value]) => (
                <div key={label}>
                  <div style={{ fontWeight: 800, color: "#0f172a" }}>{label}</div>
                  <FullText value={value} />
                </div>
              ))}
            </div>
          )}
          {String(period.media_links || "").trim() && (
            <div>
              <div style={{ fontWeight: 800, color: "#0f172a" }}>ลิงก์สื่อ</div>
              <LinkLines value={period.media_links} />
            </div>
          )}
          {String(period.media_detail || "").trim() && (
            <div>
              <div style={{ fontWeight: 800, color: "#0f172a" }}>สื่อโดยละเอียด</div>
              <FullText value={period.media_detail} />
            </div>
          )}
          {lessonFileHref(period.worksheet_file) && (
            <div>
              <div style={{ fontWeight: 800, color: "#0f172a" }}>ใบงาน (PDF)</div>
              <WorksheetLink file={period.worksheet_file} />
            </div>
          )}
          {cleanYoutubeLinks(period.youtube_links).length > 0 && (
            <div>
              <div style={{ fontWeight: 800, color: "#0f172a" }}>YouTube ที่ใช้สอน</div>
              <YoutubeGrid links={period.youtube_links} />
            </div>
          )}
          {postNoteHasData(period.post_note) && (
            <div style={{ borderTop: "1px solid #e2e8f0", paddingTop: "0.45rem" }}>
              <div style={{ fontWeight: 800, color: "#0f172a", marginBottom: "0.3rem" }}>บันทึกหลังสอน</div>
              <PostNoteRead note={period.post_note} />
            </div>
          )}
          {adminSlot}
          {period.homework === "yes" && (
            <>
              <div>
                <div style={{ fontWeight: 800, color: "#0f172a" }}>คืองานอะไร</div>
                <FullText value={period.homework_what} />
              </div>
              <div style={{ color: "#0f172a" }}><strong>หน้า: </strong>{period.homework_page || "-"}</div>
              <div>
                <div style={{ fontWeight: 800, color: "#0f172a" }}>ใบงาน</div>
                {period.homework_file?.dataUrl ? <SupervisionFileBlock file={period.homework_file} /> : <div style={{ color: "#94a3b8" }}>ไม่ได้แนบใบงาน</div>}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function SupervisionWeekView({ periods, weekStart }) {
  return (
    <div style={{ display: "grid", gap: "0.75rem" }}>
      {weekDates(weekStart).map((date, index) => {
        const dayPeriods = Array.from({ length: 6 }, (_, slot) => {
          const periodNo = slot + 1;
          return (periods || []).find(period => period.teach_date === date && Number(period.period_no) === periodNo)
            || { id: `${date}-${periodNo}`, teach_date: date, period_no: periodNo, free: false };
        });
        const filled = dayPeriods.filter(period => period.free || periodHasDetail(period)).length;
        return (
          <DayCard key={date} title={`วัน${DAY_NAMES[index + 1]}`} summary={`${formatThaiDateKey(date)} · ${filled}/6`}>
            {dayPeriods.map(period => (
              <SupervisionPeriodRead key={period.id || `${date}-${period.period_no}`} period={period} />
            ))}
          </DayCard>
        );
      })}
    </div>
  );
}

function KindergartenDayEditor({ day, dayName, disabled, onChange }) {
  const [open, setOpen] = useState(false);
  const summary = kinderDaySummary(day);
  const setActivity = (key, value) => onChange({ activities: { ...day.activities, [key]: value.slice(0, 500) } });
  return (
    <div style={{ border: "1px solid #e2e8f0", borderRadius: "12px", padding: open ? "0.75rem" : "0.35rem 0.5rem", display: "grid", gap: "0.75rem", minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", minWidth: 0, flexWrap: "wrap" }}>
        <button type="button" aria-expanded={open} aria-label={open ? `หุบวัน${dayName}` : `เปิดวัน${dayName}`} onClick={() => setOpen(value => !value)} style={{ width: 44, height: 44, flex: "none", border: "1px solid #e2e8f0", borderRadius: "10px", background: "#fff", color: "#1d4ed8", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
          {open ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
        </button>
        <button type="button" onClick={() => setOpen(value => !value)} style={{ flex: "1 1 120px", minWidth: 0, textAlign: "left", background: "transparent", border: "none", padding: "0.25rem 0", fontFamily: "inherit", cursor: "pointer" }}>
          <div style={{ fontWeight: 800, color: "#0f172a" }}>วัน{dayName}</div>
          {!open && <div style={{ fontSize: "0.8rem", color: day.off ? "#64748b" : "#475569", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{summary}</div>}
        </button>
        <label style={{ display: "flex", alignItems: "center", gap: "0.35rem", minHeight: 44, flex: "none", fontWeight: 700, color: "#475569", cursor: disabled ? "not-allowed" : "pointer" }}>
          <input type="checkbox" checked={!!day.off} disabled={disabled} onChange={event => onChange({ off: event.target.checked })} />
          ไม่มีแผนสอน
        </label>
      </div>
      {open && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 220px), 1fr))", gap: "0.75rem", minWidth: 0 }}>
          {KINDER_ACTIVITIES.map(item => (
            <Field key={item.key} label={item.label}>
              <textarea value={day.activities?.[item.key] || ""} disabled={disabled} onChange={event => setActivity(item.key, event.target.value)} style={{ ...periodArea, minHeight: 72 }} />
            </Field>
          ))}
        </div>
      )}
    </div>
  );
}

function KindergartenWeekView({ plan, weekStart }) {
  const days = kinderDaysForEditor(plan, weekStart);
  return (
    <div style={{ display: "grid", gap: "0.75rem", minWidth: 0 }}>
      <div style={{ fontWeight: 800, color: "#0f172a" }}>หน่วย {plan.unit || "-"} · ห้อง {plan.room || "-"}</div>
      {days.map((day, index) => (
        <KindergartenDayRead key={day.date} day={day} dayName={DAY_NAMES[index + 1]} dateLabel={formatThaiDateKey(day.date)} />
      ))}
    </div>
  );
}

function KindergartenDayRead({ day, dayName, dateLabel }) {
  const [open, setOpen] = useState(false);
  const summary = kinderDaySummary(day);
  return (
    <div style={{ background: "#f8fafc", borderRadius: "12px", padding: "0.55rem 0.7rem", display: "grid", gap: "0.45rem", minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", minWidth: 0 }}>
        <button type="button" aria-expanded={open} aria-label={open ? `หุบวัน${dayName}` : `เปิดวัน${dayName}`} onClick={() => setOpen(value => !value)} style={{ width: 44, height: 44, flex: "none", border: "1px solid #e2e8f0", borderRadius: "10px", background: "#fff", color: "#1d4ed8", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
          {open ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
        </button>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 800, color: "#0f172a" }}>วัน{dayName} · {dateLabel}</div>
          {!open && <div style={{ fontSize: "0.8rem", color: "#475569", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{summary}</div>}
        </div>
      </div>
      {open && (
        <div style={{ display: "grid", gap: "0.45rem" }}>
          {day.off && <div style={{ fontWeight: 800, color: "#64748b" }}>วันนี้ไม่มีแผนสอน</div>}
          {KINDER_ACTIVITIES.filter(item => String(day.activities?.[item.key] || "").trim()).map(item => (
            <div key={item.key}>
              <div style={{ fontWeight: 800, color: "#0f172a" }}>{item.label}</div>
              <FullText value={day.activities[item.key]} />
            </div>
          ))}
          {!day.off && !KINDER_ACTIVITIES.some(item => String(day.activities?.[item.key] || "").trim()) && <div style={{ color: "#94a3b8" }}>ยังไม่ได้กรอก</div>}
        </div>
      )}
    </div>
  );
}

function KindergartenSupervisionTeacher({ currentUser }) {
  const [weekStart, setWeekStart] = useState(() => mondayOf(todayISO()));
  const [rowId, setRowId] = useState(null);
  const [unit, setUnit] = useState("");
  const [room, setRoom] = useState("");
  const [days, setDays] = useState([]);
  const [baseline, setBaseline] = useState("");
  const [signoff, setSignoff] = useState(null);
  const [observations, setObservations] = useState([]);
  const [status, setStatus] = useState("");
  const [late, setLate] = useState(false);
  const [submittedAt, setSubmittedAt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const snapshot = (nextUnit, nextRoom, nextDays) => JSON.stringify({ unit: nextUnit, room: nextRoom, days: nextDays });

  const applyPlan = (plan, id) => {
    const nextDays = kinderDaysForEditor(plan, plan.week_start || weekStart);
    const nextUnit = plan.kind === "kindergarten" ? (plan.unit || "") : "";
    const nextRoom = plan.kind === "kindergarten" ? (plan.room || "") : "";
    setRowId(id || null);
    setUnit(nextUnit);
    setRoom(nextRoom);
    setDays(nextDays);
    setBaseline(snapshot(nextUnit, nextRoom, nextDays));
    setSignoff(plan.signoff || null);
    setObservations(Array.isArray(plan.observations) ? plan.observations : []);
    setStatus(plan.status || "");
    setLate(!!plan.late);
    setSubmittedAt(plan.submitted_at || null);
  };

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    setMessage("");
    (async () => {
      try {
        const rows = await fetchSupervisionRows(currentUser.id, weekStart);
        if (!active) return;
        const extras = rows.slice(1).map(row => row.id);
        if (extras.length) await supabase.from("teaching_schedule").delete().in("id", extras);
        const row = rows[0];
        const plan = row ? parseSupervisionPlan(row.subject, weekStart) : emptySupervisionPlan(weekStart);
        const timed = row ? supervisionStatusFromStartTime(row.start_time) : "";
        if (timed === "late") {
          plan.status = "submitted";
          plan.late = true;
        } else if (timed === "submitted") {
          plan.status = "submitted";
          plan.late = false;
        } else if (timed === "draft") {
          plan.status = "draft";
          plan.late = false;
        }
        if (active) applyPlan(plan, row?.id);
      } catch (err) {
        if (active) setError(err.message || "โหลดแผนไม่สำเร็จ");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [currentUser.id, weekStart]);

  const formPlan = (nextStatus = status || "draft") => {
    const previous = status === "late" ? "submitted" : status;
    const timing = resolveSubmission(nextStatus, previous, submittedAt, late, weekStart);
    return {
      version: 4,
      kind: "kindergarten",
      week_start: weekStart,
      unit: unit.trim().slice(0, 80),
      room: room.trim().slice(0, 40),
      days,
      periods: [],
      signoff,
      observations,
      status: timing.status,
      late: timing.late,
      submitted_at: timing.submitted_at,
    };
  };

  const savePlan = async (nextStatus) => {
    const alreadySent = status === "submitted" || status === "late";
    const effective = alreadySent ? "submitted" : nextStatus;
    if (effective === "submitted") {
      if (!unit.trim() || !room.trim()) {
        setError("ส่งได้เมื่อกรอกหน่วยประจำสัปดาห์และห้อง");
        return;
      }
      const missingDays = days.flatMap((day, index) => kinderDayReady(day) ? [] : [`วัน${DAY_NAMES[index + 1]}`]);
      if (missingDays.length > 0) {
        setError(`ส่งได้เมื่อครบทุกวันจันทร์ถึงศุกร์ ยังขาด ${missingDays.join(" ")} ให้กรอกกิจกรรมหลักครบ 6 อย่าง หรือติ๊กไม่มีแผนสอน`);
        return;
      }
    }
    const plan = formPlan(effective);
    if (JSON.stringify(plan).length > SUPERVISION_JSON_LIMIT) {
      setError("แผนยาวเกินที่ฐานเก็บได้");
      return;
    }
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const id = await writeSupervisionPlan(currentUser.id, weekStart, plan, rowId);
      const nextDays = kinderDaysForEditor(plan, weekStart);
      setRowId(id);
      setUnit(plan.unit);
      setRoom(plan.room);
      setDays(nextDays);
      setBaseline(snapshot(plan.unit, plan.room, nextDays));
      setStatus(plan.status);
      setLate(plan.late);
      setSubmittedAt(plan.submitted_at);
      setMessage(!alreadySent && effective === "submitted"
        ? (plan.late ? "ส่งรายสัปดาห์แล้ว สถานะสาย" : "ส่งให้ฝ่ายวิชาการแล้ว")
        : effective === "submitted"
          ? (plan.late ? "บันทึกรายสัปดาห์แล้ว สถานะยังเป็นสาย" : "บันทึกรายสัปดาห์แล้ว")
          : "บันทึกฉบับร่างแล้ว");
    } catch (err) {
      setError(err.message || "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  };

  const changeWeek = (next) => {
    if (next === weekStart || loading || saving) return;
    if (snapshot(unit, room, days) !== baseline && !window.confirm("ยังไม่ได้บันทึก สิ่งที่กรอกอยู่จะหายไปเมื่อเปลี่ยนสัปดาห์")) return;
    setWeekStart(next);
  };

  const copyPreviousWeek = async () => {
    if (snapshot(unit, room, days) !== baseline && !window.confirm("คัดลอกจากสัปดาห์ก่อนจะแทนที่สิ่งที่กรอกอยู่ ข้อมูลจะยังไม่ถูกบันทึกจนกว่าจะกดบันทึกเอง")) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const previousWeek = shiftDateKey(weekStart, -7);
      const rows = await fetchSupervisionRows(currentUser.id, previousWeek);
      const plan = rows[0] ? parseSupervisionPlan(rows[0].subject, previousWeek) : null;
      if (plan?.kind !== "kindergarten" || (!plan.unit && !plan.room && !(plan.days || []).some(day => day.off || KINDER_ACTIVITIES.some(item => String(day.activities?.[item.key] || "").trim())))) {
        setError("ยังไม่มีแผนอนุบาลของสัปดาห์ก่อน");
        return;
      }
      const copiedDays = kinderDaysForEditor(plan, previousWeek).map(day => ({
        ...day,
        date: shiftDateKey(day.date, 7),
      }));
      setUnit(plan.unit || "");
      setRoom(plan.room || "");
      setDays(kinderDaysForEditor({ days: copiedDays }, weekStart));
      setMessage("คัดลอกจากสัปดาห์ก่อนแล้ว กดบันทึกฉบับร่างหรือส่งให้ฝ่ายวิชาการเพื่อเก็บข้อมูล");
    } catch (err) {
      setError(err.message || "คัดลอกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  };

  const updateDay = (date, patch) => {
    setDays(current => current.map(day => day.date === date ? { ...day, ...patch } : day));
  };

  const actionButtons = (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 180px), 1fr))", gap: "0.5rem" }}>
      <button type="button" onClick={copyPreviousWeek} disabled={saving || loading} style={{ ...btnSecondary, minHeight: 44 }}><Copy size={16} /> คัดลอกจากสัปดาห์ก่อน</button>
      <button type="button" onClick={() => savePlan("draft")} disabled={saving || loading} style={{ ...btnSecondary, minHeight: 44 }}><Save size={16} /> บันทึกฉบับร่าง</button>
      <button type="button" onClick={() => savePlan("submitted")} disabled={saving || loading} style={{ ...btnPrimary, minHeight: 44, background: "linear-gradient(135deg, #16a34a, #15803d)", color: "#fff", cursor: saving ? "not-allowed" : "pointer" }}>
        {saving ? <RefreshCw size={16} style={{ animation: "spin 1s linear infinite" }} /> : <CheckCircle size={16} />} ส่งให้ฝ่ายวิชาการ
      </button>
    </div>
  );

  return (
    <div style={{ display: "grid", gap: "1rem", minWidth: 0 }}>
      <WeekSwitcher weekStart={weekStart} onChange={changeWeek} disabled={saving || loading} />
      {error && <ErrorBox>{error}</ErrorBox>}
      {message && <div style={{ background: "#ecfdf5", border: "1px solid #bbf7d0", borderRadius: "10px", padding: "0.75rem 1rem", color: "#166534", fontWeight: 700 }}>{message}</div>}
      {loading ? (
        <Card><div style={{ textAlign: "center", color: "#64748b", padding: "1.5rem" }}>กำลังโหลดแผนสัปดาห์...</div></Card>
      ) : (
        <>
          <Card>
            <div style={{ display: "flex", justifyContent: "space-between", gap: "0.75rem", alignItems: "center", flexWrap: "wrap", marginBottom: "0.9rem" }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: "1.05rem", fontWeight: 800, color: "#0f172a" }}>แผนอนุบาลของ {currentUser.name}</div>
                <div style={{ fontSize: "0.8rem", color: "#b45309", fontWeight: 700, marginTop: "0.25rem" }}>ส่งไม่เกิน {formatThaiDateKey(shiftDateKey(weekStart, -1))} เวลา 15:00</div>
              </div>
              <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
                <SupervisionStatusBadge status={status === "submitted" && late ? "late" : (status || "missing")} />
                {signoff?.at && <SupervisionStatusBadge status="approved" />}
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 180px), 1fr))", gap: "0.75rem", marginBottom: "0.9rem" }}>
              <Field label="หน่วยประจำสัปดาห์">
                <input value={unit} onChange={event => setUnit(event.target.value.slice(0, 80))} style={periodInput} />
              </Field>
              <Field label="ห้อง">
                <input value={room} onChange={event => setRoom(event.target.value.slice(0, 40))} style={periodInput} />
              </Field>
            </div>
            {signoff?.at && (
              <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: "12px", padding: "0.8rem", marginBottom: "0.9rem" }}>
                <div style={{ fontWeight: 800, color: "#1d4ed8" }}>ฝ่ายวิชาการรับทราบแล้ว · {signoff.by || "ผู้บริหาร"} · {fmtDate(signoff.at)} {fmtTime(signoff.at)}</div>
                <FullText value={signoff.comment} />
              </div>
            )}
            {observations.length > 0 && (
              <div style={{ display: "grid", gap: "0.45rem", marginBottom: "0.9rem" }}>
                {observations.map(item => (
                  <div key={item.id} style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "12px", padding: "0.75rem" }}>
                    <div style={{ fontWeight: 800, color: "#0f172a" }}>นิเทศในห้อง {formatThaiDateKey(item.date)} · {labelOf(OBSERVATION_MATCH, item.match) || "-"}</div>
                    <FullText value={item.note} />
                  </div>
                ))}
              </div>
            )}
            {actionButtons}
            {submittedAt && status === "submitted" && <div style={{ marginTop: "0.7rem", fontSize: "0.78rem", color: "#64748b" }}>ส่งล่าสุด {fmtDate(submittedAt)} {fmtTime(submittedAt)}</div>}
          </Card>
          <Card>
            <div style={{ display: "grid", gap: "0.45rem", minWidth: 0 }}>
              {days.map((day, index) => (
                <KindergartenDayEditor
                  key={day.date}
                  day={day}
                  dayName={DAY_NAMES[index + 1]}
                  disabled={saving}
                  onChange={patch => updateDay(day.date, patch)}
                />
              ))}
            </div>
          </Card>
          <Card>{actionButtons}</Card>
        </>
      )}
    </div>
  );
}

function TeachingSupervisionPage({ employees, currentUser }) {
  const [level, setLevel] = useState(currentUser?.role === "admin" ? "" : null);
  useEffect(() => {
    if (currentUser?.role === "admin") return undefined;
    let active = true;
    Promise.all([
      fetchTeacherLevel(currentUser.id).catch(() => ""),
      loadAssignedPlanLevels().then(map => map[currentUser.id] || "").catch(() => ""),
    ]).then(([payroll, assigned]) => {
      if (!active) return;
      if (assigned === "อนุบาล") setLevel("อนุบาล");
      else if (assigned === "school") setLevel("");
      else setLevel(payroll || "");
    }).catch(() => {
      if (active) setLevel("");
    });
    return () => { active = false; };
  }, [currentUser?.id, currentUser?.role]);
  if (currentUser?.role === "admin") return <SupervisionAdmin employees={employees} currentUser={currentUser} />;
  if (level === null) return <Card><div style={{ textAlign: "center", color: "#64748b", padding: "1.5rem" }}>กำลังโหลดแผนสัปดาห์...</div></Card>;
  if (level === "อนุบาล") return <KindergartenSupervisionTeacher currentUser={currentUser} />;
  return <SupervisionTeacher currentUser={currentUser} />;
}

function SupervisionTeacher({ currentUser }) {
  const [weekStart, setWeekStart] = useState(() => mondayOf(todayISO()));
  const [rowId, setRowId] = useState(null);
  const [periods, setPeriods] = useState([]);
  const [baseline, setBaseline] = useState("[]");
  const [signoff, setSignoff] = useState(null);
  const [observations, setObservations] = useState([]);
  const [status, setStatus] = useState("");
  const [late, setLate] = useState(false);
  const [submittedAt, setSubmittedAt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [worksheetBusy, setWorksheetBusy] = useState("");

  const applyPlan = (plan, id) => {
    const nextPeriods = periodsForEditor(plan, plan.week_start || weekStart);
    setRowId(id || null);
    setPeriods(nextPeriods);
    setBaseline(JSON.stringify(nextPeriods));
    setSignoff(plan.signoff || null);
    setObservations(Array.isArray(plan.observations) ? plan.observations : []);
    setStatus(plan.status || "");
    setLate(!!plan.late);
    setSubmittedAt(plan.submitted_at || null);
  };

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    setMessage("");
    (async () => {
      try {
        const rows = await fetchSupervisionRows(currentUser.id, weekStart);
        if (!active) return;
        const extras = rows.slice(1).map(row => row.id);
        if (extras.length) await supabase.from("teaching_schedule").delete().in("id", extras);
        const row = rows[0];
        const plan = row ? parseSupervisionPlan(row.subject, weekStart) : emptySupervisionPlan(weekStart);
        const timed = row ? supervisionStatusFromStartTime(row.start_time) : "";
        if (timed === "late") {
          plan.status = "submitted";
          plan.late = true;
        } else if (timed === "submitted") {
          plan.status = "submitted";
          plan.late = false;
        } else if (timed === "draft") {
          plan.status = "draft";
          plan.late = false;
        }
        if (active) applyPlan(plan, row?.id);
      } catch (err) {
        const local = loadLocalPlan(currentUser.id, weekStart);
        if (active && local) {
          applyPlan(local, null);
          setError(`โหลดจากฐานข้อมูลไม่ได้ (${err.message || "เชื่อมต่อไม่สำเร็จ"}) แสดงฉบับที่เก็บไว้ในเครื่องนี้แทน`);
        } else if (active) setError(err.message || "โหลดแผนไม่สำเร็จ");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [currentUser.id, weekStart]);

  const formPlan = (nextStatus = status || "draft") => {
    const previous = status === "late" ? "submitted" : status;
    const timing = resolveSubmission(nextStatus, previous, submittedAt, late, weekStart);
    return {
      version: 4,
      week_start: weekStart,
      periods: periods.filter(period => !periodIsBlank(period)),
      signoff,
      observations,
      status: timing.status,
      late: timing.late,
      submitted_at: timing.submitted_at,
    };
  };

  const savePlan = async (nextStatus) => {
    const alreadySent = status === "submitted" || status === "late";
    const effective = alreadySent ? "submitted" : nextStatus;
    const filled = periods.filter(period => !periodIsBlank(period));
    const taught = filled.filter(period => !period.free);
    if (effective === "submitted") {
      const missingDays = weekDates(weekStart).flatMap((date, index) => (
        periods.some(period => period.teach_date === date && periodIsBlank(period)) ? [`วัน${DAY_NAMES[index + 1]}`] : []
      ));
      if (missingDays.length > 0) {
        setError(`ส่งได้เมื่อครบทุกวันจันทร์ถึงศุกร์ ยังขาด ${missingDays.join(" ")} ให้กรอกคาบหรือติ๊กคาบว่าง`);
        return;
      }
      if (taught.some(period => !period.start_time || !period.end_time || !String(period.subject || "").trim() || ![period.lesson_intro, period.lesson_activity, period.lesson_practice, period.lesson_summary].some(value => String(value || "").trim()))) {
        setError("ทุกคาบที่สอนต้องมีเวลาเริ่ม เวลาเลิก วิชา และรายละเอียดการสอนอย่างน้อย 1 ขั้น ก่อนส่ง");
        return;
      }
      if (taught.some(period => period.start_time >= period.end_time)) {
        setError("เวลาเลิกต้องหลังเวลาเริ่ม");
        return;
      }
      if (taught.some(period => period.homework === "yes" && !String(period.homework_what || "").trim() && !period.homework_file?.dataUrl)) {
        setError("คาบที่มีการบ้าน ต้องบอกว่างานคืออะไร หรืออัปโหลดใบงาน");
        return;
      }
    }
    const plan = formPlan(effective);
    if (JSON.stringify(plan).length > SUPERVISION_JSON_LIMIT) {
      setError("ไฟล์ใบงานรวมกันใหญ่เกินที่ฐานเก็บได้ ลดขนาดไฟล์ หรือวางลิงก์แทน");
      return;
    }
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const id = await writeSupervisionPlan(currentUser.id, weekStart, plan, rowId);
      const nextPeriods = periodsForEditor(plan, weekStart);
      setRowId(id);
      setPeriods(nextPeriods);
      setBaseline(JSON.stringify(nextPeriods));
      setStatus(plan.status);
      setLate(plan.late);
      setSubmittedAt(plan.submitted_at);
      setMessage(!alreadySent && effective === "submitted"
        ? (plan.late ? "ส่งรายสัปดาห์แล้ว สถานะสาย" : "ส่งให้ฝ่ายวิชาการแล้ว")
        : effective === "submitted"
          ? (plan.late ? "บันทึกรายสัปดาห์แล้ว สถานะยังเป็นสาย" : "บันทึกรายสัปดาห์แล้ว")
          : "บันทึกฉบับร่างแล้ว");
      saveLocalPlan(currentUser.id, weekStart, plan);
    } catch (err) {
      const kept = saveLocalPlan(currentUser.id, weekStart, plan);
      setError(`${err.message || "บันทึกไม่สำเร็จ"}${kept ? " · เก็บสำรองไว้ในเครื่องนี้แล้ว (localStorage)" : ""}`);
    } finally {
      setSaving(false);
    }
  };

  const changeWeek = (next) => {
    if (next === weekStart || loading || saving) return;
    if (JSON.stringify(periods) !== baseline && !window.confirm("ยังไม่ได้บันทึก คาบที่กรอกอยู่จะหายไปเมื่อเปลี่ยนสัปดาห์")) return;
    setWeekStart(next);
  };

  const copyPreviousWeek = async () => {
    if (JSON.stringify(periods) !== baseline && !window.confirm("คัดลอกจากสัปดาห์ก่อนจะแทนที่สิ่งที่กรอกอยู่ ข้อมูลจะยังไม่ถูกบันทึกจนกว่าจะกดบันทึกเอง")) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const previousWeek = shiftDateKey(weekStart, -7);
      const rows = await fetchSupervisionRows(currentUser.id, previousWeek);
      const plan = rows[0] ? parseSupervisionPlan(rows[0].subject, previousWeek) : null;
      const copied = (plan?.periods || []).filter(period => !periodIsBlank(period));
      if (copied.length === 0) {
        setError("ยังไม่มีแผนของสัปดาห์ก่อน");
        return;
      }
      setPeriods(periodsForEditor({
        periods: copied.map(period => ({
          ...period,
          id: newSupervisionId(),
          teach_date: period.teach_date ? shiftDateKey(period.teach_date, 7) : weekStart,
        })),
      }, weekStart));
      setMessage("คัดลอกจากสัปดาห์ก่อนแล้ว กดบันทึกฉบับร่างหรือส่งให้ฝ่ายวิชาการเพื่อเก็บข้อมูล");
    } catch (err) {
      setError(err.message || "คัดลอกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  };

  const updatePeriod = (id, patch) => {
    setPeriods(current => current.map(period => period.id === id ? { ...period, ...patch } : period));
  };

  const onPickHomework = async (event, periodId) => {
    const picked = event.target.files?.[0];
    event.target.value = "";
    if (!picked) return;
    if (!isAllowedSupervisionFile(picked)) {
      setError("อัปโหลดได้เฉพาะ PDF, Word หรือรูป");
      return;
    }
    if (picked.size > SUPERVISION_FILE_LIMIT) {
      setError("ไฟล์ต้องมีขนาดไม่เกิน 2.5 MB");
      return;
    }
    try {
      const dataUrl = await readFileAsDataUrl(picked);
      updatePeriod(periodId, { homework: "yes", homework_file: { name: picked.name, type: picked.type || "", dataUrl } });
      setError("");
      setMessage("เลือกใบงานแล้ว กดบันทึกฉบับร่างหรือส่งให้ฝ่ายวิชาการเพื่อเก็บไฟล์");
    } catch (err) {
      setError(err.message || "อ่านไฟล์ไม่สำเร็จ");
    }
  };

  const onPickWorksheet = async (event, periodId) => {
    const picked = event.target.files?.[0];
    event.target.value = "";
    if (!picked) return;
    if (!(picked.type === "application/pdf" || picked.name.toLowerCase().endsWith(".pdf"))) {
      setError("ใบงานต้องเป็นไฟล์ PDF");
      return;
    }
    if (picked.size > 20 * 1024 * 1024) {
      setError("ไฟล์ PDF ต้องไม่เกิน 20 MB");
      return;
    }
    setWorksheetBusy(periodId);
    try {
      const file = await uploadLessonFile(picked, currentUser.id);
      updatePeriod(periodId, { worksheet_file: file });
      setError("");
      setMessage(file.storage === "supabase" ? "อัปโหลดใบงาน PDF แล้ว กดบันทึกเพื่อเก็บลงแผน" : "แนบใบงานแล้ว (ยังไม่มี Storage bucket จึงเก็บในแผน) กดบันทึกเพื่อเก็บ");
    } catch (err) {
      setError(err.message || "อัปโหลดไม่สำเร็จ");
    } finally {
      setWorksheetBusy("");
    }
  };

  const actionButtons = (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 180px), 1fr))", gap: "0.5rem" }}>
      <button type="button" onClick={copyPreviousWeek} disabled={saving || loading} style={{ ...btnSecondary, minHeight: 44 }}><Copy size={16} /> คัดลอกจากสัปดาห์ก่อน</button>
      <button type="button" onClick={() => savePlan("draft")} disabled={saving || loading} style={{ ...btnSecondary, minHeight: 44 }}><Save size={16} /> บันทึกฉบับร่าง</button>
      <button type="button" onClick={() => savePlan("submitted")} disabled={saving || loading} style={{ ...btnPrimary, minHeight: 44, background: "linear-gradient(135deg, #16a34a, #15803d)", color: "#fff", cursor: saving ? "not-allowed" : "pointer" }}>
        {saving ? <RefreshCw size={16} style={{ animation: "spin 1s linear infinite" }} /> : <CheckCircle size={16} />} ส่งให้ฝ่ายวิชาการ
      </button>
    </div>
  );

  return (
    <div style={{ display: "grid", gap: "1rem" }}>
      <WeekSwitcher weekStart={weekStart} onChange={changeWeek} disabled={saving || loading} />
      {error && <ErrorBox>{error}</ErrorBox>}
      {message && <div style={{ background: "#ecfdf5", border: "1px solid #bbf7d0", borderRadius: "10px", padding: "0.75rem 1rem", color: "#166534", fontWeight: 700 }}>{message}</div>}
      {loading ? (
        <Card><div style={{ textAlign: "center", color: "#64748b", padding: "1.5rem" }}>กำลังโหลดแผนสัปดาห์...</div></Card>
      ) : (
        <>
          <Card>
            <div style={{ display: "flex", justifyContent: "space-between", gap: "0.75rem", alignItems: "center", flexWrap: "wrap", marginBottom: "0.9rem" }}>
              <div>
                <div style={{ fontSize: "1.05rem", fontWeight: 800, color: "#0f172a" }}>แผนสัปดาห์ของ {currentUser.name}</div>
                <div style={{ fontSize: "0.8rem", color: "#b45309", fontWeight: 700, marginTop: "0.25rem" }}>ส่งไม่เกิน {formatThaiDateKey(shiftDateKey(weekStart, -1))} เวลา 15:00</div>
              </div>
              <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
                <SupervisionStatusBadge status={status === "submitted" && late ? "late" : (status || "missing")} />
                {signoff?.at && <SupervisionStatusBadge status="approved" />}
              </div>
            </div>
            {signoff?.at && (
              <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: "12px", padding: "0.8rem", marginBottom: "0.9rem" }}>
                <div style={{ fontWeight: 800, color: "#1d4ed8" }}>ฝ่ายวิชาการรับทราบแล้ว · {signoff.by || "ผู้บริหาร"} · {fmtDate(signoff.at)} {fmtTime(signoff.at)}</div>
                <FullText value={signoff.comment} />
              </div>
            )}
            {observations.length > 0 && (
              <div style={{ display: "grid", gap: "0.45rem", marginBottom: "0.9rem" }}>
                {observations.map(item => (
                  <div key={item.id} style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "12px", padding: "0.75rem" }}>
                    <div style={{ fontWeight: 800, color: "#0f172a" }}>นิเทศในห้อง {formatThaiDateKey(item.date)} · {labelOf(OBSERVATION_MATCH, item.match) || "-"}</div>
                    <FullText value={item.note} />
                  </div>
                ))}
              </div>
            )}
            {actionButtons}
            {submittedAt && status === "submitted" && <div style={{ marginTop: "0.7rem", fontSize: "0.78rem", color: "#64748b" }}>ส่งล่าสุด {fmtDate(submittedAt)} {fmtTime(submittedAt)}</div>}
          </Card>
          {weekDates(weekStart).map((date, index) => {
            const dayPeriods = periods
              .filter(period => period.teach_date === date)
              .sort((a, b) => (Number(a.period_no) || 0) - (Number(b.period_no) || 0));
            const filled = dayPeriods.filter(period => !periodIsBlank(period)).length;
            return (
              <DayCard key={date} title={`วัน${DAY_NAMES[index + 1]}`} summary={`${formatThaiDateKey(date)} · ${filled}/6`}>
                {dayPeriods.map(period => (
                  <WeekPeriodEditor
                    key={period.id}
                    period={period}
                    disabled={saving}
                    onChange={patch => updatePeriod(period.id, patch)}
                    onPickFile={event => onPickHomework(event, period.id)}
                    onPickWorksheet={event => onPickWorksheet(event, period.id)}
                    worksheetBusy={worksheetBusy === period.id}
                    teacherName={currentUser.name}
                  />
                ))}
              </DayCard>
            );
          })}
          <Card>{actionButtons}</Card>
        </>
      )}
    </div>
  );
}

function SupervisionAdmin({ employees, currentUser }) {
  const [weekStart, setWeekStart] = useState(() => mondayOf(todayISO()));
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [signoffComment, setSignoffComment] = useState("");
  const [observation, setObservation] = useState({ date: todayISO(), match: "yes", note: "" });
  const [savingReview, setSavingReview] = useState(false);
  const [reviewMessage, setReviewMessage] = useState("");
  const [levels, setLevels] = useState({});

  useEffect(() => {
    let active = true;
    Promise.all([
      supabase.from("salary_settings").select("employee_id, leave_deduct_types").not("employee_id", "is", null),
      loadAssignedPlanLevels().catch(() => ({})),
    ]).then(([salary, assigned]) => {
      if (!active) return;
      const map = {};
      (salary.data || []).forEach(row => {
        if (row.employee_id) map[row.employee_id] = parseEmployeePayrollMeta(row.leave_deduct_types).teacher_level || "";
      });
      Object.entries(assigned || {}).forEach(([id, level]) => {
        if (level === "อนุบาล") map[id] = "อนุบาล";
        if (level === "school") map[id] = "";
      });
      setLevels(map);
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    setReviewMessage("");
    setSelectedId("");
    setDetail(null);
    (async () => {
      try {
        const { data, error: loadError } = await supabase
          .from("teaching_schedule")
          .select("id, employee_id, start_time, end_time, created_at")
          .eq("class_room", SUPERVISION_SCHEDULE_ROOM)
          .eq("day_of_week", 0)
          .eq("period", weekPeriodKey(weekStart));
        if (loadError) throw new Error(loadError.message);
        if (!active) return;
        const latest = new Map();
        (data || []).forEach(row => {
          const current = latest.get(row.employee_id);
          if (!current || String(row.created_at || "") > String(current.created_at || "")) latest.set(row.employee_id, row);
        });
        setRows([...latest.values()]);
      } catch (err) {
        if (active) setError(err.message || "โหลดกระดานไม่สำเร็จ");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [weekStart]);

  const statusOf = (employeeId) => {
    const row = rows.find(item => item.employee_id === employeeId);
    return row ? supervisionStatusFromStartTime(row.start_time) : "missing";
  };
  const signedOff = (employeeId) => String(rows.find(item => item.employee_id === employeeId)?.end_time || "").startsWith("00:01");

  const teachers = employees
    .filter(teacher => teacher.role !== "admin")
    .sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "th"));
  const visibleTeachers = teachers.filter(teacher => {
    const text = `${teacher.name || ""} ${teacher.department || ""}`.toLowerCase();
    return text.includes(query.trim().toLowerCase());
  });
  const counts = {
    submitted: teachers.filter(teacher => supervisionBoardGroup(statusOf(teacher.id)) === "submitted").length,
    late: teachers.filter(teacher => supervisionBoardGroup(statusOf(teacher.id)) === "late").length,
    missing: teachers.filter(teacher => supervisionBoardGroup(statusOf(teacher.id)) === "missing").length,
  };

  const openTeacher = async (teacher) => {
    setSelectedId(teacher.id);
    setDetailLoading(true);
    setError("");
    setReviewMessage("");
    try {
      const loaded = await fetchSupervisionRows(teacher.id, weekStart);
      const row = loaded[0];
      const plan = row ? parseSupervisionPlan(row.subject, weekStart) : emptySupervisionPlan(weekStart);
      setSignoffComment(plan.signoff?.comment || "");
      setObservation({ date: defaultDailyDate(weekStart), match: "yes", note: "" });
      setDetail({
        rowId: row?.id || null,
        status: row ? supervisionStatusFromStartTime(row.start_time) : "missing",
        plan,
      });
    } catch (err) {
      setError(err.message || "เปิดแผนไม่สำเร็จ");
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  };

  const selectedTeacher = teachers.find(teacher => teacher.id === selectedId);
  const boardGroups = [
    { key: "submitted", label: "ส่งแล้ว" },
    { key: "late", label: "สาย" },
    { key: "missing", label: "ยังไม่ส่ง" },
  ];

  const saveReview = async (kind) => {
    if (!selectedTeacher) return;
    if (kind === "observation" && !observation.note.trim()) {
      setError("กรุณาพิมพ์สิ่งที่เห็นในห้องเรียน");
      return;
    }
    const friday = shiftDateKey(weekStart, 4);
    if (kind === "observation" && (observation.date < weekStart || observation.date > friday)) {
      setError("วันที่นิเทศต้องอยู่ในสัปดาห์ที่เลือก");
      return;
    }
    setSavingReview(true);
    setError("");
    setReviewMessage("");
    try {
      const currentRow = rows.find(row => row.employee_id === selectedTeacher.id);
      const timed = currentRow ? supervisionStatusFromStartTime(currentRow.start_time) : "missing";
      const base = detail?.plan || emptySupervisionPlan(weekStart);
      const plan = timed === "late"
        ? { ...base, status: "submitted", late: true }
        : timed === "submitted"
          ? { ...base, status: "submitted", late: false }
          : timed === "draft"
            ? { ...base, status: "draft", late: false }
            : base;
      const next = kind === "signoff"
        ? { ...plan, signoff: { comment: signoffComment.trim() || "รับทราบ", by: currentUser?.name || "ฝ่ายวิชาการ", at: new Date().toISOString() } }
        : { ...plan, observations: [...(plan.observations || []), { id: newSupervisionId(), date: observation.date, match: observation.match, note: observation.note.trim(), by: currentUser?.name || "ฝ่ายวิชาการ", at: new Date().toISOString() }] };
      const id = await writeSupervisionPlan(selectedTeacher.id, weekStart, next, detail?.rowId || null);
      setDetail(current => ({ ...(current || {}), rowId: id, plan: next }));
      setSignoffComment(next.signoff?.comment || "");
      setObservation(current => ({ ...current, note: "" }));
      setRows(current => {
        const timing = supervisionStartTime(next);
        const others = current.filter(row => row.employee_id !== selectedTeacher.id);
        return [...others, { id, employee_id: selectedTeacher.id, start_time: timing, end_time: next.signoff?.at ? "00:01:00" : null, created_at: new Date().toISOString() }];
      });
      setReviewMessage(kind === "signoff" ? "รับทราบแล้ว ครูจะเห็นข้อเสนอแนะในแผนสัปดาห์" : "บันทึกการนิเทศในห้องแล้ว ครูจะเห็นในแผนสัปดาห์");
    } catch (err) {
      setError(err.message || "บันทึกการตรวจไม่สำเร็จ");
    } finally {
      setSavingReview(false);
    }
  };

  const plan = detail?.plan;

  return (
    <div style={{ display: "grid", gap: "1rem" }}>
      <WeekSwitcher weekStart={weekStart} onChange={setWeekStart} />
      {error && <ErrorBox>{error}</ErrorBox>}
      {reviewMessage && <div style={{ background: "#ecfdf5", border: "1px solid #bbf7d0", borderRadius: "10px", padding: "0.75rem 1rem", color: "#166534", fontWeight: 700 }}>{reviewMessage}</div>}
      <div style={{ fontSize: "0.8rem", color: "#64748b" }}>เขียว = ส่งตรงเวลา · เหลือง = สาย · แดง = ยังไม่ส่งหรือฉบับร่าง · ส่งไม่เกินวันอาทิตย์ก่อนสัปดาห์ เวลา 15:00</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "0.75rem" }}>
        <StatCard stat={{ label: "ส่งแล้ว", value: loading ? "..." : counts.submitted, icon: CheckCircle, color: "#16a34a", bg: "#ecfdf5", trend: "สัปดาห์นี้" }} />
        <StatCard stat={{ label: "สาย", value: loading ? "..." : counts.late, icon: Clock, color: "#d97706", bg: "#fffbeb", trend: "หลังวันอาทิตย์ 15:00" }} />
        <StatCard stat={{ label: "ยังไม่ส่ง", value: loading ? "..." : counts.missing, icon: AlertCircle, color: "#dc2626", bg: "#fef2f2", trend: "รวมฉบับร่าง" }} />
      </div>

      {selectedTeacher ? (
        <Card>
          <button onClick={() => { setSelectedId(""); setDetail(null); }} style={{ ...btnSecondary, flex: "none", marginBottom: "1rem" }}><ChevronLeft size={16} /> กลับไปกระดาน</button>
          <div style={{ display: "flex", justifyContent: "space-between", gap: "0.75rem", alignItems: "center", flexWrap: "wrap", marginBottom: "1rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
              <Avatar name={selectedTeacher.name} />
              <div>
                <div style={{ fontSize: "1.15rem", fontWeight: 800, color: "#0f172a" }}>{selectedTeacher.name}</div>
                <div style={{ fontSize: "0.8rem", color: "#64748b" }}>{selectedTeacher.department || "-"} · {selectedTeacher.position || "พนักงาน"}{levels[selectedTeacher.id] === "อนุบาล" ? " · อนุบาล" : ""}</div>
              </div>
            </div>
            <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
              <SupervisionStatusBadge status={detail?.status || statusOf(selectedTeacher.id)} />
              {plan?.signoff?.at && <SupervisionStatusBadge status="approved" />}
            </div>
          </div>
          {detailLoading || !detail ? (
            <div style={{ color: "#64748b", padding: "1rem 0" }}>กำลังเปิดรายละเอียด...</div>
          ) : plan ? (
            <div style={{ display: "grid", gap: "1rem" }}>
              {plan.submitted_at && <div style={{ fontSize: "0.8rem", color: "#64748b" }}>ส่งล่าสุด {fmtDate(plan.submitted_at)} {fmtTime(plan.submitted_at)}</div>}
              {plan.signoff?.at && (
                <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: "12px", padding: "0.8rem" }}>
                  <div style={{ fontWeight: 800, color: "#1d4ed8" }}>รับทราบแล้ว · {plan.signoff.by || "ฝ่ายวิชาการ"} · {fmtDate(plan.signoff.at)} {fmtTime(plan.signoff.at)}</div>
                  <FullText value={plan.signoff.comment} />
                </div>
              )}
              {(plan.observations || []).length > 0 && (
                <div style={{ display: "grid", gap: "0.45rem" }}>
                  {plan.observations.map((item, index) => (
                    <div key={item.id || index} style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "12px", padding: "0.75rem" }}>
                      <div style={{ fontWeight: 800, color: "#0f172a" }}>นิเทศในห้อง {formatThaiDateKey(item.date)} · {labelOf(OBSERVATION_MATCH, item.match) || "-"} · {item.by || "ฝ่ายวิชาการ"}</div>
                      <FullText value={item.note} />
                    </div>
                  ))}
                </div>
              )}
              <div>
                <div style={{ fontWeight: 800, color: "#0f172a", marginBottom: "0.75rem" }}>{plan.kind === "kindergarten" ? "แผนอนุบาลรายสัปดาห์" : "แผนรายสัปดาห์"}</div>
                {plan.kind === "kindergarten"
                  ? <KindergartenWeekView plan={plan} weekStart={weekStart} />
                  : <SupervisionWeekView periods={plan.periods} weekStart={weekStart} />}
              </div>
              <div style={{ borderTop: "1px solid #e2e8f0", paddingTop: "1rem", display: "grid", gap: "0.75rem" }}>
                <div style={{ fontWeight: 800, color: "#0f172a" }}>รับทราบ/อนุมัติ</div>
                <div style={{ fontSize: "0.8rem", color: "#64748b" }}>ครูเห็นข้อเสนอแนะนี้ในแผนสัปดาห์ และแก้เนื้อหาแผนเองจากบัญชีครู</div>
                <Field label="ข้อเสนอแนะถึงครู">
                  <textarea value={signoffComment} onChange={event => setSignoffComment(event.target.value)} style={supervisionTextArea} placeholder="พิมพ์คำแนะนำสั้นๆ แล้วกดรับทราบ" />
                </Field>
                <button type="button" onClick={() => saveReview("signoff")} disabled={savingReview} style={{ ...btnPrimary, flex: "none", background: "linear-gradient(135deg, #2563eb, #1d4ed8)", color: "#fff", cursor: savingReview ? "not-allowed" : "pointer" }}>
                  <CheckCircle size={16} /> รับทราบ/อนุมัติ
                </button>
              </div>
              <div style={{ display: "grid", gap: "0.75rem" }}>
                <div style={{ fontWeight: 800, color: "#0f172a" }}>นิเทศในห้อง</div>
                <div style={{ fontSize: "0.8rem", color: "#64748b" }}>เทียบสิ่งที่เห็นในห้องกับแผนที่ครูเขียนไว้</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "0.75rem" }}>
                  <Field label="วันที่นิเทศ">
                    <input type="date" min={weekStart} max={shiftDateKey(weekStart, 4)} value={observation.date} onChange={event => setObservation(current => ({ ...current, date: event.target.value }))} style={inputStyle} />
                  </Field>
                  <Field label="เทียบกับแผนของครู">
                    <select value={observation.match} onChange={event => setObservation(current => ({ ...current, match: event.target.value }))} style={selectStyle}>
                      {OBSERVATION_MATCH.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                  </Field>
                </div>
                <Field label="สิ่งที่เห็นในห้อง">
                  <textarea value={observation.note} onChange={event => setObservation(current => ({ ...current, note: event.target.value }))} style={supervisionTextArea} />
                </Field>
                <button type="button" onClick={() => saveReview("observation")} disabled={savingReview} style={{ ...btnSecondary, flex: "none" }}>
                  <Save size={16} /> บันทึกการนิเทศในห้อง
                </button>
              </div>
            </div>
          ) : (
            <div style={{ color: "#64748b" }}>เปิดแผนไม่สำเร็จ</div>
          )}
        </Card>
      ) : (
        <Card>
          <Field label="ค้นหาครู">
            <InputWithIcon icon={Search} value={query} onChange={setQuery} placeholder="ชื่อหรือแผนก" />
          </Field>
          {loading ? (
            <div style={{ color: "#64748b", padding: "1.25rem 0" }}>กำลังโหลดกระดาน...</div>
          ) : (
            boardGroups.map(group => {
              const people = visibleTeachers.filter(teacher => supervisionBoardGroup(statusOf(teacher.id)) === group.key);
              return (
                <div key={group.key} style={{ marginTop: "1rem" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
                    <div style={{ fontWeight: 800, color: "#0f172a" }}>{group.label}</div>
                    <SupervisionStatusBadge status={group.key} />
                    <span style={{ color: "#94a3b8", fontSize: "0.8rem" }}>{people.length} คน</span>
                  </div>
                  {people.length === 0 ? (
                    <div style={{ color: "#94a3b8", fontSize: "0.85rem", padding: "0.35rem 0 0.5rem" }}>ไม่มีรายชื่อในกลุ่มนี้</div>
                  ) : (
                    <div style={{ display: "grid", gap: "0.45rem" }}>
                      {people.map((teacher, index) => {
                        const status = statusOf(teacher.id);
                        const tone = status === "submitted" ? "#16a34a" : status === "late" ? "#d97706" : "#dc2626";
                        return (
                          <button key={teacher.id} onClick={() => openTeacher(teacher)} style={{ display: "flex", alignItems: "center", gap: "0.75rem", width: "100%", textAlign: "left", background: "#fff", border: "1px solid #e2e8f0", borderLeft: `4px solid ${tone}`, borderRadius: "12px", padding: "0.7rem 0.8rem", cursor: "pointer", fontFamily: "inherit" }}>
                            <Avatar name={teacher.name} index={index} />
                            <span style={{ flex: 1, minWidth: 0 }}>
                              <span style={{ display: "block", fontWeight: 800, color: "#0f172a" }}>{teacher.name || "-"}</span>
                              <span style={{ display: "block", fontSize: "0.75rem", color: "#64748b" }}>{teacher.department || "-"}{levels[teacher.id] === "อนุบาล" ? " · อนุบาล" : ""}</span>
                            </span>
                            <SupervisionStatusBadge status={status} />
                            {signedOff(teacher.id) && <SupervisionStatusBadge status="approved" />}
                            <ChevronRight size={16} color="#94a3b8" />
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </Card>
      )}
    </div>
  );
}

const ROLL_STATUSES = [
  { value: "present", label: "มา", color: "#166534", bg: "#dcfce7", border: "#86efac" },
  { value: "absent", label: "ขาด", color: "#b91c1c", bg: "#fee2e2", border: "#fca5a5" },
  { value: "personal", label: "ลากิจ", color: "#b45309", bg: "#fef3c7", border: "#fcd34d" },
  { value: "sick", label: "ลาป่วย", color: "#1d4ed8", bg: "#dbeafe", border: "#93c5fd" },
];
const ROLL_STATUS_VALUES = new Set(ROLL_STATUSES.map(item => item.value));
const STUDENT_ROLL_MAX = 80;
const ROSTER_HEADER_CELLS = new Set(["เลขที่", "ชื่อ", "นามสกุล", "ชื่อ-สกุล", "ชื่อสกุล", "ชื่อนักเรียน", "name", "student", "no", "no.", "ลำดับ", "ชั้น", "ห้อง"]);

function emptyRollBook() {
  return { version: 1, class_name: "", students: [], days: {} };
}

function rollCounts(students, marks) {
  const counts = { present: 0, absent: 0, personal: 0, sick: 0, unset: 0, total: students.length };
  students.forEach(student => {
    const status = marks?.[student.id];
    if (ROLL_STATUS_VALUES.has(status)) counts[status] += 1;
    else counts.unset += 1;
  });
  return counts;
}

function sameMarks(left, right) {
  const keys = new Set([...Object.keys(left || {}), ...Object.keys(right || {})]);
  for (const key of keys) {
    if ((left?.[key] || "") !== (right?.[key] || "")) return false;
  }
  return true;
}

function cleanRollStudents(students) {
  return (Array.isArray(students) ? students : [])
    .map((student, index) => ({
      id: String(student?.id || newSupervisionId()),
      number: String(student?.number || index + 1).trim().slice(0, 4) || String(index + 1),
      name: String(student?.name || "").replace(/\s+/g, " ").trim().slice(0, 40),
      surname: String(student?.surname || "").replace(/\s+/g, " ").trim().slice(0, 40),
    }))
    .filter(student => student.name)
    .slice(0, STUDENT_ROLL_MAX);
}

function parseRollBook(subject) {
  try {
    const parsed = JSON.parse(subject || "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return emptyRollBook();
    const days = {};
    if (parsed.days && typeof parsed.days === "object" && !Array.isArray(parsed.days)) {
      Object.entries(parsed.days).forEach(([date, day]) => {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
        const marks = {};
        const source = day?.marks && typeof day.marks === "object" ? day.marks : {};
        Object.entries(source).forEach(([id, status]) => {
          if (ROLL_STATUS_VALUES.has(status)) marks[id] = status;
        });
        days[date] = { saved_at: day?.saved_at || null, marks };
      });
    }
    return {
      version: 1,
      class_name: String(parsed.class_name || "").trim().slice(0, 40),
      students: cleanRollStudents(parsed.students),
      days,
    };
  } catch {
    return emptyRollBook();
  }
}

function isClassToken(value) {
  const text = String(value || "").trim();
  return /^(ป|ม|อ)\.?\s*\d/.test(text) || /^อนุบาล/.test(text) || /^\d+\/\d+$/.test(text);
}

function isRosterHeader(cells) {
  const useful = cells.map(cell => String(cell || "").trim()).filter(Boolean);
  if (useful.length === 0) return false;
  return useful.every(cell => ROSTER_HEADER_CELLS.has(cell) || ROSTER_HEADER_CELLS.has(cell.toLowerCase()));
}

function splitRosterLine(line) {
  if (line.includes("\t")) return line.split("\t").map(cell => cell.trim());
  const separator = line.includes(",") ? "," : (line.includes(";") ? ";" : "");
  if (!separator) return [line.trim()];
  const cells = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"';
        index += 1;
        continue;
      }
      quoted = !quoted;
      continue;
    }
    if (char === separator && !quoted) {
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  cells.push(current.trim());
  return cells;
}

function parseRosterText(text) {
  const lines = String(text || "").replace(/^\uFEFF/, "").split(/\r?\n/);
  const students = [];
  let auto = 1;
  let headerChecked = false;
  let truncated = false;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || /^sep=./i.test(line)) continue;
    const cells = splitRosterLine(line).map(cell => cell.trim());
    if (cells.every(cell => !cell)) continue;
    if (!headerChecked) {
      headerChecked = true;
      if (isRosterHeader(cells)) continue;
    }
    let number = "";
    let nameCells = cells;
    const firstNumber = cells[0].match(/^(\d{1,3})$/);
    const inlineNumber = cells.length === 1 ? cells[0].match(/^(\d{1,3})(?:\s*[.)\-]\s*|\s+)(.+)$/) : null;
    if (firstNumber && cells.length > 1) {
      number = firstNumber[1];
      nameCells = cells.slice(1);
    } else if (inlineNumber) {
      number = inlineNumber[1];
      nameCells = [inlineNumber[2]];
    }
    const name = nameCells
      .map(cell => cell.trim())
      .filter(cell => cell && !isClassToken(cell))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 80);
    if (name.length < 2) continue;
    if (students.length >= STUDENT_ROLL_MAX) {
      truncated = true;
      break;
    }
    students.push({ id: newSupervisionId(), number: number || String(auto), name });
    auto += 1;
  }
  students.truncated = truncated;
  return students;
}

function mergeRoster(existing, incoming) {
  const used = new Set();
  return incoming.map(student => {
    const samePerson = existing.find(item => !used.has(item.id) && item.name === student.name && (item.surname || "") === (student.surname || "") && String(item.number) === String(student.number));
    const sameName = existing.find(item => !used.has(item.id) && item.name === student.name && (item.surname || "") === (student.surname || ""));
    const match = samePerson || sameName;
    if (!match) return student;
    used.add(match.id);
    return { id: match.id, number: student.number, name: student.name, surname: student.surname || "" };
  });
}

function studentLabel(student) {
  return [student?.name, student?.surname].map(part => String(part || "").trim()).filter(Boolean).join(" ");
}

function classHintFromRows(rows) {
  const text = rows.slice(0, 6).flat().join(" ");
  const room = text.match(/(ป|ม|อ)\.?\s*(\d+)\s*\/\s*(\d+)/);
  if (room) return `${room[1]}.${room[2]}/${room[3]}`;
  const primary = text.match(/ประถมศึกษาปีที่\s*(\d+)/);
  if (primary) return `ป.${primary[1]}`;
  const secondary = text.match(/มัธยมศึกษาปีที่\s*(\d+)/);
  if (secondary) return `ม.${secondary[1]}`;
  const kinder = text.match(/อนุบาล(?:\s*(\d+))?/);
  if (kinder) return kinder[1] ? `อ.${kinder[1]}` : "อนุบาล";
  return "";
}

function studentsFromTable(rows) {
  const table = Array.isArray(rows) ? rows : [];
  let headerIndex = -1;
  let nameCol = -1;
  let surnameCol = -1;
  let numberCol = -1;
  for (let index = 0; index < Math.min(table.length, 20); index += 1) {
    const cells = (table[index] || []).map(cell => String(cell || "").trim());
    const compact = cells.map(cell => cell.replace(/\s+/g, ""));
    const nameAt = compact.findIndex(cell => cell.includes("ชื่อ"));
    if (nameAt < 0) continue;
    headerIndex = index;
    nameCol = nameAt;
    numberCol = compact.findIndex(cell => ["ที่", "เลขที่", "ลำดับ", "no", "no."].includes(cell.toLowerCase()));
    const surnameAt = compact.findIndex((cell, cellIndex) => cellIndex !== nameAt && (cell === "สกุล" || cell === "นามสกุล" || cell.includes("สกุล")));
    if (surnameAt >= 0) surnameCol = surnameAt;
    else if (compact[nameAt].includes("สกุล") || !compact[nameAt + 1]) surnameCol = nameAt + 1;
    break;
  }
  const students = [];
  let truncated = false;
  const start = headerIndex >= 0 ? headerIndex + 1 : 0;
  for (let index = start; index < table.length; index += 1) {
    const cells = (table[index] || []).map(cell => String(cell || "").trim());
    if (headerIndex < 0) {
      const line = cells.filter(Boolean).join(",");
      if (!line) continue;
      const parsed = parseRosterText(line);
      parsed.forEach(student => {
        if (students.length >= STUDENT_ROLL_MAX) truncated = true;
        else students.push(student);
      });
      continue;
    }
    let name = cells[nameCol] || "";
    let surname = surnameCol >= 0 ? (cells[surnameCol] || "") : "";
    if (/^\d+(\.\d+)?$/.test(surname)) surname = "";
    name = name.replace(/\s+/g, " ").trim();
    surname = surname.replace(/\s+/g, " ").trim();
    if (!/[ก-๙A-Za-z]/.test(name)) continue;
    if (/หน่วยที่|คะแนน|ภาคเรียน|กลุ่มสาระ|รหัสวิชา|ชั้นประถม|ชั้นมัธยม|^รวม/.test(name)) continue;
    if (students.length >= STUDENT_ROLL_MAX) {
      truncated = true;
      break;
    }
    const numberCell = numberCol >= 0 ? cells[numberCol] : "";
    students.push({
      id: newSupervisionId(),
      number: /^\d{1,3}$/.test(numberCell) ? numberCell : String(students.length + 1),
      name: name.slice(0, 40),
      surname: surname.slice(0, 40),
    });
  }
  students.truncated = truncated;
  return students;
}

async function readRosterWorkbook(file) {
  const name = String(file?.name || "").toLowerCase();
  if (!/\.xlsx$|\.xls$/.test(name)) throw new Error("อัปได้เฉพาะไฟล์ Excel .xls หรือ .xlsx");
  if (file.size > 5 * 1024 * 1024) throw new Error("ไฟล์ใหญ่เกิน 5 MB");
  const workbook = readWorkbook(await file.arrayBuffer(), { type: "array" });
  let students = [];
  let className = "";
  workbook.SheetNames.forEach(sheetName => {
    const rows = xlsxUtils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, raw: false, defval: "" });
    const found = studentsFromTable(rows);
    if (found.length > students.length) {
      students = found;
      className = classHintFromRows(rows);
    }
  });
  if (students.truncated) throw new Error(`ห้องหนึ่งรับได้ไม่เกิน ${STUDENT_ROLL_MAX} คน`);
  if (students.length === 0) throw new Error("ไม่พบชื่อและนามสกุลในไฟล์");
  return { students, className };
}

async function fetchRollRows(employeeId) {
  let query = supabase
    .from("teaching_schedule")
    .select("id, employee_id, subject, created_at")
    .eq("class_room", STUDENT_ROLL_ROOM)
    .eq("day_of_week", 0)
    .eq("period", 0)
    .order("created_at", { ascending: false });
  if (employeeId) query = query.eq("employee_id", employeeId);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data || [];
}

function dedupeRollRows(data) {
  const latest = new Map();
  (data || []).forEach(row => {
    const current = latest.get(row.employee_id);
    if (!current || String(row.created_at || "") > String(current.created_at || "")) latest.set(row.employee_id, row);
  });
  return [...latest.values()];
}

async function writeRollBook(employeeId, book, existingId) {
  const subject = JSON.stringify({ ...book, version: 1, updated_at: new Date().toISOString() });
  if (subject.length > SUPERVISION_JSON_LIMIT) throw new Error("ข้อมูลเช็คชื่อยาวเกินที่ระบบเก็บได้");
  const payload = {
    employee_id: employeeId,
    day_of_week: 0,
    period: 0,
    class_room: STUDENT_ROLL_ROOM,
    start_time: "00:00:00",
    end_time: null,
    subject,
  };
  const result = existingId
    ? await supabase.from("teaching_schedule").update(payload).eq("id", existingId).select("id").single()
    : await supabase.from("teaching_schedule").insert(payload).select("id").single();
  if (result.error) throw new Error(result.error.message);
  const rows = await fetchRollRows(employeeId);
  const extras = rows.filter(row => row.id !== result.data.id).map(row => row.id);
  if (extras.length) await supabase.from("teaching_schedule").delete().in("id", extras);
  return result.data.id;
}

function RollCountChips({ counts }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
      {ROLL_STATUSES.map(status => (
        <span key={status.value} style={{ background: status.bg, color: status.color, border: `1px solid ${status.border}`, fontWeight: 800, fontSize: "0.78rem", borderRadius: 20, padding: "0.28rem 0.65rem" }}>{status.label} {counts[status.value]}</span>
      ))}
      {counts.unset > 0 && <span style={{ background: "#f1f5f9", color: "#64748b", fontWeight: 800, fontSize: "0.78rem", borderRadius: 20, padding: "0.28rem 0.65rem" }}>ยังไม่ติ๊ก {counts.unset}</span>}
    </div>
  );
}

function RollDateBar({ date, onChange }) {
  const today = todayISO();
  const go = (next) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(next || "") || next > today) return;
    onChange(next);
  };
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.45rem", flexWrap: "wrap" }}>
      <button type="button" onClick={() => go(shiftDateKey(date, -1))} aria-label="วันก่อน" style={{ ...btnSecondary, flex: "none", minWidth: 44, minHeight: 44, padding: "0.4rem" }}><ChevronLeft size={18} /></button>
      <input type="date" max={today} value={date} onChange={event => go(event.target.value)} style={{ ...periodInput, width: "auto", flex: "1 1 150px", minHeight: 44 }} />
      <button type="button" disabled={date >= today} onClick={() => go(shiftDateKey(date, 1))} aria-label="วันถัดไป" style={{ ...btnSecondary, flex: "none", minWidth: 44, minHeight: 44, padding: "0.4rem", opacity: date >= today ? 0.4 : 1 }}><ChevronRight size={18} /></button>
      {date !== today && <button type="button" onClick={() => go(today)} style={{ ...btnSecondary, flex: "none", minHeight: 44 }}>วันนี้</button>}
    </div>
  );
}

function rollMonthSummary(book, month) {
  const students = book?.students || [];
  const days = Object.entries(book?.days || {})
    .filter(([date, day]) => month && date.startsWith(month) && day?.saved_at)
    .sort((left, right) => left[0].localeCompare(right[0]));
  const totals = { present: 0, absent: 0, personal: 0, sick: 0, unset: 0, days: days.length };
  const perStudent = students.map(student => {
    const counts = { present: 0, absent: 0, personal: 0, sick: 0, unset: 0 };
    days.forEach(([, day]) => {
      const status = day.marks?.[student.id];
      if (ROLL_STATUS_VALUES.has(status)) {
        counts[status] += 1;
        totals[status] += 1;
      } else {
        counts.unset += 1;
        totals.unset += 1;
      }
    });
    return { student, counts };
  });
  return { totals, perStudent };
}

function RollModeSwitch({ mode, onChange }) {
  const items = [
    { key: "check", label: "เช็คชื่อวันนี้" },
    { key: "stats", label: "สถิติ" },
  ];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.35rem", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, padding: "0.3rem" }}>
      {items.map(item => {
        const active = mode === item.key;
        return (
          <button key={item.key} type="button" onClick={() => onChange(item.key)} style={{ minHeight: 44, border: "none", borderRadius: 10, background: active ? "#eff6ff" : "transparent", color: active ? "#1d4ed8" : "#64748b", fontWeight: 800, fontFamily: "inherit", fontSize: "0.92rem", cursor: "pointer" }}>
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

function RollMarkRow({ student, value, disabled, onChange }) {
  const label = studentLabel(student);
  return (
    <div style={{ display: "grid", width: "100%", boxSizing: "border-box", gridTemplateColumns: "minmax(0, 1fr) repeat(4, 3.15rem)", gap: "0.15rem", alignItems: "center", minHeight: 48, padding: "0.3rem 0", borderTop: "1px solid #f1f5f9", minWidth: 0 }}>
      <div style={{ minWidth: 0, display: "flex", gap: "0.3rem", alignItems: "center" }}>
        <span style={{ fontWeight: 800, color: "#64748b", flex: "0 0 auto" }}>{student.number}</span>
        <span title={label} style={{ minWidth: 0, fontWeight: 800, fontSize: "0.86rem", lineHeight: 1.25, color: "#0f172a", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", wordBreak: "break-word" }}>{label}</span>
      </div>
      {ROLL_STATUSES.map(status => {
        const active = value === status.value;
        return (
          <button
            key={status.value}
            type="button"
            aria-pressed={active}
            aria-label={`${label} ${status.label}`}
            disabled={disabled}
            onClick={() => onChange?.(status.value)}
            style={{ boxSizing: "border-box", width: "100%", minHeight: 44, minWidth: 0, borderRadius: 10, border: `2px solid ${active ? status.color : "#e2e8f0"}`, background: active ? status.bg : "#fff", color: active ? status.color : "#64748b", fontWeight: 800, fontFamily: "inherit", fontSize: "0.68rem", cursor: disabled ? "default" : "pointer", padding: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", opacity: 1 }}
          >
            {status.label}
          </button>
        );
      })}
    </div>
  );
}

function RollStatsPanel({ book, month, onMonth, title }) {
  const summary = rollMonthSummary(book, month);
  return (
    <Card>
      <div style={{ display: "grid", gap: "0.8rem", minWidth: 0 }}>
        <div>
          <div style={{ fontWeight: 800, color: "#0f172a", fontSize: "1.05rem" }}>{title || "สถิติการเช็คชื่อ"}</div>
          <div style={{ color: "#64748b", fontSize: "0.82rem" }}>นับจากวันที่บันทึกการเช็คชื่อแล้ว</div>
        </div>
        <Field label="เดือน">
          <input type="month" value={month} max={todayISO().slice(0, 7)} onChange={event => onMonth(event.target.value)} style={{ ...periodInput, width: "100%", maxWidth: 240 }} />
        </Field>
        <div style={{ fontWeight: 800, color: "#0f172a" }}>เช็คชื่อแล้ว {summary.totals.days} วัน</div>
        <RollCountChips counts={summary.totals} />
        {book.students.length === 0 ? (
          <div style={{ color: "#94a3b8" }}>ฝ่ายวิชาการยังไม่ได้อัปรายชื่อ สถิติจะขึ้นที่นี่</div>
        ) : summary.totals.days === 0 ? (
          <div style={{ color: "#94a3b8" }}>เดือนนี้ยังไม่มีการเช็คชื่อ</div>
        ) : (
          <div>
            {summary.perStudent.map(({ student, counts }) => (
              <div key={student.id} style={{ display: "grid", gap: "0.4rem", padding: "0.7rem 0", borderTop: "1px solid #f1f5f9", minWidth: 0 }}>
                <div style={{ display: "flex", gap: "0.55rem", minWidth: 0 }}>
                  <span style={{ fontWeight: 800, color: "#64748b", minWidth: "1.6rem" }}>{student.number}</span>
                  <span style={{ fontWeight: 800, color: "#0f172a", wordBreak: "break-word" }}>{studentLabel(student)}</span>
                </div>
                <RollCountChips counts={counts} />
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}


// ─── ดูแผนสำหรับสอนแทน (อ่านอย่างเดียว ยกเว้นความเห็นผู้บริหาร) ──────────────
function SubstitutePlanView({ employees, currentUser }) {
  const isAdmin = currentUser?.role === "admin";
  const teachers = (employees || []).filter(emp => emp.id !== currentUser?.id);
  const [teacherId, setTeacherId] = useState("");
  const [date, setDate] = useState(() => todayISO());
  const [periodNo, setPeriodNo] = useState("");
  const [row, setRow] = useState(null);
  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [drafts, setDrafts] = useState({});
  const weekStart = mondayOf(date);
  const day = new Date(`${date}T00:00:00`).getDay();

  useEffect(() => {
    if (!teacherId) { setPlan(null); setRow(null); return undefined; }
    let active = true;
    setLoading(true);
    setError("");
    setMessage("");
    (async () => {
      try {
        const rows = await fetchSupervisionRows(teacherId, weekStart);
        if (!active) return;
        setRow(rows[0] || null);
        setPlan(rows[0] ? parseSupervisionPlan(rows[0].subject, weekStart) : null);
      } catch (err) {
        const local = loadLocalPlan(teacherId, weekStart);
        if (active) { setPlan(local); setRow(null); setError(err.message || "โหลดแผนไม่สำเร็จ"); }
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [teacherId, weekStart]);

  const periods = (plan?.periods || [])
    .filter(period => period.teach_date === date && (!periodNo || String(period.period_no) === periodNo))
    .sort((a, b) => a.period_no - b.period_no);
  const teacher = (employees || []).find(emp => emp.id === teacherId);

  const saveAdminComment = async (periodId) => {
    if (!row || !plan) return;
    const draft = drafts[periodId] || {};
    const nextPeriods = plan.periods.map(period => period.id === periodId
      ? { ...period, post_note: cleanPostNote({ ...period.post_note, admin_comment: draft.admin_comment ?? period.post_note?.admin_comment, admin_sign: draft.admin_sign ?? (period.post_note?.admin_sign || currentUser.name), admin_date: todayISO() }) }
      : period);
    const nextPlan = { ...plan, periods: nextPeriods };
    try {
      const id = await writeSupervisionPlan(teacherId, weekStart, nextPlan, row.id);
      setRow({ ...row, id });
      setPlan(nextPlan);
      setMessage("บันทึกความเห็นผู้บริหารแล้ว");
    } catch (err) {
      setError(err.message || "บันทึกไม่สำเร็จ");
    }
  };

  return (
    <div style={{ display: "grid", gap: "1rem" }}>
      <Card>
        <div style={{ fontSize: "1.05rem", fontWeight: 800, color: "#0f172a", marginBottom: "0.75rem" }}>ดูแผนสำหรับสอนแทน</div>
        <div style={periodGrid}>
          <Field label="ครูเจ้าของแผน">
            <select value={teacherId} onChange={event => setTeacherId(event.target.value)} style={periodSelect}>
              <option value="">-- เลือกครู --</option>
              {teachers.map(emp => <option key={emp.id} value={emp.id}>{emp.name}{emp.department ? ` — ${emp.department}` : ""}</option>)}
            </select>
          </Field>
          <Field label="วันที่สอนแทน">
            <input type="date" value={date} onChange={event => setDate(event.target.value)} style={periodInput} />
          </Field>
          <Field label="คาบ">
            <select value={periodNo} onChange={event => setPeriodNo(event.target.value)} style={periodSelect}>
              <option value="">ทุกคาบ</option>
              {[1, 2, 3, 4, 5, 6].map(n => <option key={n} value={String(n)}>คาบที่ {n}</option>)}
            </select>
          </Field>
        </div>
        <div style={{ fontSize: "0.8rem", color: "#64748b", marginTop: "0.6rem" }}>ดูได้อย่างเดียว เฉพาะเจ้าของแผนเท่านั้นที่แก้ไขแผนได้{isAdmin ? " · ผู้บริหารเขียนความเห็นท้ายบันทึกหลังสอนได้" : ""}</div>
      </Card>
      {error && <ErrorBox>{error}</ErrorBox>}
      {message && <div style={{ background: "#ecfdf5", border: "1px solid #bbf7d0", borderRadius: "10px", padding: "0.75rem 1rem", color: "#166534", fontWeight: 700 }}>{message}</div>}
      {!teacherId ? null : loading ? (
        <Card><div style={{ textAlign: "center", color: "#64748b", padding: "1.5rem" }}>กำลังโหลดแผน...</div></Card>
      ) : day === 0 || day === 6 ? (
        <Card><div style={{ textAlign: "center", color: "#64748b", padding: "1.5rem" }}>วันที่เลือกเป็นวันหยุด เลือกวันจันทร์ถึงศุกร์</div></Card>
      ) : periods.length === 0 ? (
        <Card><div style={{ textAlign: "center", color: "#64748b", padding: "1.5rem" }}>{teacher?.name || "ครู"} ยังไม่มีแผน{periodNo ? `คาบที่ ${periodNo} ` : ""}ของ{formatThaiDateKey(date)}</div></Card>
      ) : (
        <Card>
          <div style={{ fontWeight: 800, color: "#0f172a", marginBottom: "0.6rem" }}>แผนของ {teacher?.name} · วัน{DAY_NAMES[day]} {formatThaiDateKey(date)}</div>
          <div style={{ display: "grid", gap: "0.5rem" }}>
            {periods.map(period => (
              <SupervisionPeriodRead
                key={period.id}
                period={period}
                defaultOpen={periods.length === 1}
                adminSlot={isAdmin && row ? (
                  <div style={{ display: "grid", gap: "0.5rem", borderTop: "1px solid #e2e8f0", paddingTop: "0.5rem" }}>
                    <Field label="ความเห็นผู้บริหาร/หัวหน้างานวิชาการ">
                      <textarea value={drafts[period.id]?.admin_comment ?? period.post_note?.admin_comment ?? ""} onChange={event => setDrafts(current => ({ ...current, [period.id]: { ...current[period.id], admin_comment: event.target.value } }))} style={periodArea} />
                    </Field>
                    <Field label="ลงชื่อ">
                      <input value={drafts[period.id]?.admin_sign ?? (period.post_note?.admin_sign || currentUser.name || "")} onChange={event => setDrafts(current => ({ ...current, [period.id]: { ...current[period.id], admin_sign: event.target.value } }))} style={periodInput} />
                    </Field>
                    <button type="button" onClick={() => saveAdminComment(period.id)} style={{ ...btnSecondary, flex: "none", width: "fit-content" }}><Save size={16} /> บันทึกความเห็น</button>
                  </div>
                ) : null}
              />
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

const ACADEMIC_TABS = [
  { key: "plan", label: "ส่งแผนรายสัปดาห์" },
  { key: "substitute", label: "ดูแผนสำหรับสอนแทน" },
  { key: "roll", label: "เช็คชื่อนักเรียน/สถิติ" },
  ...ACADEMIC_EXTRA_TABS,
];

function AcademicPage({ employees, currentUser }) {
  const [tab, setTab] = useState("plan");
  return (
    <div style={{ display: "grid", gap: "1rem", minWidth: 0 }}>
      <div style={{ position: "sticky", top: 0, zIndex: 30, background: "#f8fafc", paddingBottom: "0.15rem", minWidth: 0, maxWidth: "100%" }}>
        <div role="tablist" aria-label="งานวิชาการ" style={{ display: "flex", gap: "0.35rem", overflowX: "auto", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, padding: "0.35rem", boxShadow: "0 1px 6px rgba(15,23,42,0.04)", minWidth: 0, maxWidth: "100%" }}>
          {ACADEMIC_TABS.map((item, index) => {
            const active = tab === item.key;
            return (
              <button
                key={item.key}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setTab(item.key)}
                style={{ flex: "0 0 auto", minWidth: "max-content", minHeight: 44, border: "none", borderRadius: 10, padding: "0.55rem 0.9rem", background: active ? "linear-gradient(135deg, #2563eb, #1d4ed8)" : "transparent", color: active ? "#fff" : "#475569", fontWeight: 800, fontFamily: "inherit", fontSize: "0.92rem", cursor: "pointer", whiteSpace: "nowrap" }}
              >
                {index + 1}. {item.label}
              </button>
            );
          })}
        </div>
      </div>
      {tab === "plan" && <TeachingSupervisionPage employees={employees} currentUser={currentUser} />}
      {tab === "roll" && <StudentRollPage employees={employees} currentUser={currentUser} />}
      {tab === "substitute" && <SubstitutePlanView employees={employees} currentUser={currentUser} />}
      {tab !== "plan" && tab !== "roll" && tab !== "substitute" && <AcademicExtra tab={tab} employees={employees} currentUser={currentUser} />}
    </div>
  );
}

function StudentRollPage({ employees, currentUser }) {
  if (currentUser?.role === "admin") return <StudentRollAdmin employees={employees} />;
  return <StudentRollTeacher currentUser={currentUser} />;
}

function StudentRollTeacher({ currentUser }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [rowId, setRowId] = useState(null);
  const [book, setBook] = useState(emptyRollBook);
  const [baseline, setBaseline] = useState(emptyRollBook);
  const [date, setDate] = useState(todayISO);
  const [marks, setMarks] = useState({});
  const [mode, setMode] = useState("check");
  const [month, setMonth] = useState(() => todayISO().slice(0, 7));

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        setLoading(true);
        setError("");
        const rows = await fetchRollRows(currentUser.id);
        if (!active) return;
        const row = rows[0];
        const loaded = row ? parseRollBook(row.subject) : emptyRollBook();
        const today = todayISO();
        setBook(loaded);
        setBaseline(loaded);
        setRowId(row?.id || null);
        setDate(today);
        setMarks({ ...(loaded.days[today]?.marks || {}) });
        const extras = rows.slice(1).map(item => item.id);
        if (extras.length) await supabase.from("teaching_schedule").delete().in("id", extras);
      } catch (err) {
        if (active) setError(err.message || "โหลดรายชื่อไม่สำเร็จ");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [currentUser.id]);

  const namedStudents = book.students.filter(student => student.name.trim());
  const counts = rollCounts(namedStudents, marks);
  const savedMarks = baseline.days[date]?.marks || {};
  const className = book.class_name.trim();

  const persist = async (nextBook, success) => {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const id = await writeRollBook(currentUser.id, nextBook, rowId);
      setRowId(id);
      setBook(nextBook);
      setBaseline(nextBook);
      setMarks({ ...(nextBook.days[date]?.marks || {}) });
      setMessage(success);
    } catch (err) {
      setError(err.message || "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  };

  const saveMarks = () => {
    const students = cleanRollStudents(book.students);
    if (students.length === 0) { setError("ฝ่ายวิชาการยังไม่ได้อัปรายชื่อห้องนี้"); return; }
    const clean = {};
    students.forEach(student => {
      if (ROLL_STATUS_VALUES.has(marks[student.id])) clean[student.id] = marks[student.id];
    });
    if (Object.keys(clean).length === 0) { setError("ติ๊กชื่อนักเรียนอย่างน้อย 1 คนก่อนบันทึก"); return; }
    const nextBook = {
      ...book,
      students,
      days: { ...book.days, [date]: { saved_at: new Date().toISOString(), marks: clean } },
    };
    const unset = students.length - Object.keys(clean).length;
    persist(nextBook, unset > 0 ? `บันทึกการเช็คชื่อแล้ว ยังไม่ติ๊ก ${unset} คน` : "บันทึกการเช็คชื่อวันนี้แล้ว");
  };

  const changeDate = (next) => {
    if (next === date) return;
    if (!sameMarks(marks, savedMarks) && !window.confirm("การเช็คชื่อที่ยังไม่บันทึกจะไม่ถูกเก็บ เปลี่ยนวันเลยหรือไม่")) return;
    setDate(next);
    setMarks({ ...(baseline.days[next]?.marks || {}) });
    setMessage("");
    setError("");
  };

  const markAllPresent = () => {
    const next = {};
    namedStudents.forEach(student => { next[student.id] = "present"; });
    setMarks(next);
    setError("");
  };

  return (
    <div style={{ display: "grid", gap: "1rem", minWidth: 0 }}>
      {error && <ErrorBox>{error}</ErrorBox>}
      {message && <div style={{ background: "#ecfdf5", border: "1px solid #bbf7d0", borderRadius: "10px", padding: "0.75rem 1rem", color: "#166534", fontWeight: 700 }}>{message}</div>}
      {loading ? (
        <Card><div style={{ color: "#64748b" }}>กำลังโหลดรายชื่อ...</div></Card>
      ) : (
        <>
          <RollModeSwitch mode={mode} onChange={setMode} />
          {mode === "stats" ? (
            <RollStatsPanel book={book} month={month} onMonth={setMonth} title={className ? `สถิติห้อง ${className}` : "สถิติห้องของฉัน"} />
          ) : namedStudents.length === 0 ? (
            <Card>
              <div style={{ fontWeight: 800, color: "#0f172a", fontSize: "1.05rem" }}>เช็คชื่อนักเรียน</div>
              <div style={{ color: "#64748b", fontSize: "0.84rem", lineHeight: 1.55, marginTop: "0.45rem" }}>ยังไม่มีรายชื่อห้องนี้ ฝ่ายวิชาการอัปไฟล์ Excel ให้ หน้านี้แยกจากลงเวลาเข้างานของครู</div>
            </Card>
          ) : (
            <Card padding="0.85rem">
              <div style={{ display: "grid", gap: "0.8rem", minWidth: 0 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 800, color: "#0f172a", fontSize: "1.05rem" }}>เช็คชื่อ{className ? ` ${className}` : ""}</div>
                    <div style={{ color: "#64748b", fontSize: "0.8rem" }}>{formatThaiDateKey(date)} · นักเรียน {namedStudents.length} คน</div>
                  </div>
                  {baseline.days[date]?.saved_at && <span style={{ background: "#dcfce7", color: "#166534", fontWeight: 800, fontSize: "0.75rem", borderRadius: 20, padding: "0.25rem 0.6rem" }}>บันทึกแล้ว {fmtTime(baseline.days[date].saved_at)}</span>}
                </div>
                <div style={{ color: "#64748b", fontSize: "0.84rem", lineHeight: 1.55 }}>รายชื่ออัปโดยฝ่ายวิชาการ ติ๊กได้ว่าวันนี้ใครมา ขาด ลากิจ หรือลาป่วย</div>
                <RollDateBar date={date} onChange={changeDate} />
                <RollCountChips counts={counts} />
                <button type="button" onClick={markAllPresent} disabled={saving} style={{ ...btnSecondary, flex: "none", minHeight: 44, width: "100%", maxWidth: 280 }}>ติ๊กมาทั้งหมด</button>
                <div style={{ minWidth: 0 }}>
                  {namedStudents.map(student => (
                    <RollMarkRow
                      key={student.id}
                      student={student}
                      value={marks[student.id] || ""}
                      disabled={saving}
                      onChange={status => setMarks(current => ({ ...current, [student.id]: status }))}
                    />
                  ))}
                </div>
                <button type="button" onClick={saveMarks} disabled={saving} style={{ ...btnPrimary, flex: "none", width: "100%", minHeight: 48, background: "linear-gradient(135deg, #2563eb, #1d4ed8)", color: "#fff", cursor: saving ? "not-allowed" : "pointer" }}>
                  {saving ? <RefreshCw size={16} style={{ animation: "spin 1s linear infinite" }} /> : <Save size={16} />}
                  {saving ? "กำลังบันทึก..." : "บันทึกการเช็คชื่อ"}
                </button>
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function StudentRollAdmin({ employees }) {
  const [date, setDate] = useState(todayISO);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [rows, setRows] = useState([]);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [mode, setMode] = useState("check");
  const [month, setMonth] = useState(() => todayISO().slice(0, 7));
  const [teacherId, setTeacherId] = useState("");
  const [className, setClassName] = useState("");
  const [classHint, setClassHint] = useState("");
  const [incoming, setIncoming] = useState([]);

  const reload = async () => {
    const data = await fetchRollRows(null);
    const next = dedupeRollRows(data);
    setRows(next);
    return next;
  };

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        setLoading(true);
        setError("");
        const data = await fetchRollRows(null);
        if (!active) return;
        setRows(dedupeRollRows(data));
      } catch (err) {
        if (active) setError(err.message || "โหลดเช็คชื่อไม่สำเร็จ");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  const homeroomTeachers = employees
    .filter(employee => employee.role !== "admin")
    .slice()
    .sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "th"));

  const onPickWorkbook = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const result = await readRosterWorkbook(file);
      setIncoming(result.students);
      setClassName(current => (!current.trim() || current === classHint) ? (result.className || current) : current);
      setClassHint(result.className || "");
      setError("");
      setMessage(`อ่านไฟล์ได้ ${result.students.length} คน ตรวจชื่อแล้วกดบันทึกรายชื่อ`);
    } catch (err) {
      setIncoming([]);
      setError(err.message || "อ่านไฟล์ Excel ไม่สำเร็จ");
    }
  };

  const saveRoster = async () => {
    const teacher = homeroomTeachers.find(item => item.id === teacherId);
    const room = className.trim();
    if (!teacher) { setError("เลือกครูประจำชั้นก่อน"); return; }
    if (!room) { setError("กรอกชื่อห้องก่อนบันทึก"); return; }
    if (incoming.length === 0) { setError("เลือกไฟล์ Excel ก่อน"); return; }
    const existing = rows.find(row => row.employee_id === teacher.id);
    const existingBook = existing ? parseRollBook(existing.subject) : emptyRollBook();
    const named = existingBook.students.filter(student => student.name.trim());
    if (named.length > 0 && !window.confirm(`แทนที่รายชื่อเดิม ${named.length} คน ของ ${teacher.name} ด้วย ${incoming.length} คนหรือไม่`)) return;
    const students = cleanRollStudents(mergeRoster(named, incoming));
    setSaving(true);
    setError("");
    setMessage("");
    try {
      await writeRollBook(teacher.id, { ...existingBook, class_name: room.slice(0, 40), students }, existing?.id || null);
      await reload();
      setIncoming([]);
      setSelectedId(teacher.id);
      setMode("check");
      setMessage(`บันทึกรายชื่อห้อง ${room} ให้ ${teacher.name} แล้ว ${students.length} คน`);
    } catch (err) {
      setError(err.message || "บันทึกรายชื่อไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  };

  const classes = rows
    .map(row => {
      const book = parseRollBook(row.subject);
      const teacher = employees.find(employee => employee.id === row.employee_id);
      return { row, book, teacher, counts: rollCounts(book.students, book.days[date]?.marks || {}), savedAt: book.days[date]?.saved_at || null };
    })
    .filter(item => item.book.students.length > 0)
    .sort((a, b) => String(a.book.class_name || "").localeCompare(String(b.book.class_name || ""), "th"));
  const visible = classes.filter(item => {
    const text = `${item.book.class_name} ${item.teacher?.name || ""} ${item.teacher?.department || ""}`.toLowerCase();
    return text.includes(query.trim().toLowerCase());
  });
  const selected = classes.find(item => item.row.employee_id === selectedId) || null;

  return (
    <div style={{ display: "grid", gap: "1rem", minWidth: 0 }}>
      {error && <ErrorBox>{error}</ErrorBox>}
      {message && <div style={{ background: "#ecfdf5", border: "1px solid #bbf7d0", borderRadius: "10px", padding: "0.75rem 1rem", color: "#166534", fontWeight: 700 }}>{message}</div>}
      <RollModeSwitch mode={mode} onChange={next => { setMode(next); setSelectedId(""); }} />
      {mode === "stats" ? (
        selected ? (
          <div style={{ display: "grid", gap: "0.8rem" }}>
            <button type="button" onClick={() => setSelectedId("")} style={{ ...btnSecondary, flex: "none", minHeight: 44 }}><ChevronLeft size={16} /> กลับ</button>
            <RollStatsPanel book={selected.book} month={month} onMonth={setMonth} title={`${selected.book.class_name || "ไม่ระบุห้อง"} · ${selected.teacher?.name || "ไม่พบชื่อครู"}`} />
          </div>
        ) : (
          <Card>
            <Field label="เดือน">
              <input type="month" value={month} max={todayISO().slice(0, 7)} onChange={event => setMonth(event.target.value)} style={{ ...periodInput, width: "100%", maxWidth: 240 }} />
            </Field>
            {loading ? (
              <div style={{ color: "#64748b", padding: "1rem 0" }}>กำลังโหลด...</div>
            ) : classes.length === 0 ? (
              <div style={{ color: "#94a3b8", padding: "1.25rem 0" }}>ยังไม่มีรายชื่อห้อง อัปไฟล์ Excel ที่หน้าเช็คชื่อวันนี้</div>
            ) : (
              <div style={{ display: "grid", gap: "0.5rem", marginTop: "0.9rem" }}>
                {classes.map((item, index) => {
                  const summary = rollMonthSummary(item.book, month);
                  return (
                    <button key={item.row.employee_id} type="button" onClick={() => setSelectedId(item.row.employee_id)} style={{ display: "grid", gap: "0.45rem", width: "100%", textAlign: "left", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "0.75rem 0.85rem", cursor: "pointer", fontFamily: "inherit" }}>
                      <span style={{ display: "flex", alignItems: "center", gap: "0.65rem" }}>
                        <Avatar name={item.teacher?.name || item.book.class_name} index={index} />
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <span style={{ display: "block", fontWeight: 800, color: "#0f172a" }}>{item.book.class_name || "ไม่ระบุห้อง"}</span>
                          <span style={{ display: "block", fontSize: "0.75rem", color: "#64748b" }}>{item.teacher?.name || "ไม่พบชื่อครู"} · เช็คชื่อแล้ว {summary.totals.days} วัน</span>
                        </span>
                        <ChevronRight size={16} color="#94a3b8" />
                      </span>
                      <RollCountChips counts={summary.totals} />
                    </button>
                  );
                })}
              </div>
            )}
          </Card>
        )
      ) : (
      <>
      <Card>
        <div style={{ display: "grid", gap: "0.8rem", minWidth: 0 }}>
          <div>
            <div style={{ fontWeight: 800, color: "#0f172a", fontSize: "1.05rem" }}>อัปรายชื่อจาก Excel</div>
          </div>
          <Field label="ครูประจำชั้น">
            <select value={teacherId} onChange={event => setTeacherId(event.target.value)} style={{ ...selectStyle, boxSizing: "border-box", fontSize: "16px", maxWidth: "100%" }}>
              <option value="">เลือกครู</option>
              {homeroomTeachers.map(teacher => (
                <option key={teacher.id} value={teacher.id}>{teacher.name}{teacher.department ? ` · ${teacher.department}` : ""}</option>
              ))}
            </select>
          </Field>
          <Field label="ชื่อห้อง">
            <input value={className} onChange={event => setClassName(event.target.value.slice(0, 40))} style={periodInput} />
          </Field>
          <label style={{ ...btnSecondary, flex: "none", minHeight: 44, cursor: "pointer", width: "fit-content" }}>
            <Upload size={16} /> เลือกไฟล์ Excel
            <input type="file" accept=".xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={onPickWorkbook} style={{ display: "none" }} />
          </label>
          {incoming.length > 0 && (
            <div style={{ display: "grid", gap: "0.45rem", minWidth: 0 }}>
              <div style={{ fontWeight: 800, color: "#0f172a" }}>พบ {incoming.length} คน{classHint ? ` · ไฟล์ระบุ ${classHint}` : ""}</div>
              <div style={{ maxHeight: 200, overflow: "auto", border: "1px solid #e2e8f0", borderRadius: 10, minWidth: 0 }}>
                {incoming.map(student => (
                  <div key={student.id} style={{ display: "flex", gap: "0.45rem", padding: "0.35rem 0.65rem", borderTop: "1px solid #f1f5f9", minWidth: 0 }}>
                    <span style={{ fontWeight: 800, color: "#64748b", flex: "0 0 auto" }}>{student.number}</span>
                    <span style={{ fontWeight: 700, color: "#0f172a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{studentLabel(student)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <button type="button" onClick={saveRoster} disabled={saving} style={{ ...btnPrimary, flex: "none", width: "100%", maxWidth: 280, minHeight: 48, background: "linear-gradient(135deg, #2563eb, #1d4ed8)", color: "#fff", cursor: saving ? "not-allowed" : "pointer" }}>
            {saving ? <RefreshCw size={16} style={{ animation: "spin 1s linear infinite" }} /> : <Save size={16} />}
            {saving ? "กำลังบันทึก..." : "บันทึกรายชื่อ"}
          </button>
        </div>
      </Card>
      <Card>
        <div style={{ display: "grid", gap: "0.8rem" }}>
          <RollDateBar date={date} onChange={setDate} />

        </div>
      </Card>
      {selected ? (
        <Card padding="0.85rem">
          <button type="button" onClick={() => setSelectedId("")} style={{ ...btnSecondary, flex: "none", minHeight: 44, marginBottom: "0.9rem" }}><ChevronLeft size={16} /> กลับ</button>
          <div style={{ display: "flex", justifyContent: "space-between", gap: "0.75rem", flexWrap: "wrap", marginBottom: "0.75rem" }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 800, fontSize: "1.05rem", color: "#0f172a" }}>{selected.book.class_name || "ไม่ระบุห้อง"}</div>
              <div style={{ color: "#64748b", fontSize: "0.82rem" }}>{selected.teacher?.name || "ไม่พบชื่อครู"} · {formatThaiDateKey(date)}</div>
            </div>
            {selected.savedAt ? <span style={{ background: "#dcfce7", color: "#166534", fontWeight: 800, fontSize: "0.75rem", borderRadius: 20, padding: "0.25rem 0.6rem", height: "fit-content" }}>บันทึกแล้ว {fmtTime(selected.savedAt)}</span> : <span style={{ background: "#fee2e2", color: "#b91c1c", fontWeight: 800, fontSize: "0.75rem", borderRadius: 20, padding: "0.25rem 0.6rem", height: "fit-content" }}>ยังไม่เช็คชื่อ</span>}
          </div>
          <RollCountChips counts={selected.counts} />
          <div style={{ marginTop: "0.4rem", minWidth: 0 }}>
            {selected.book.students.map(student => (
              <RollMarkRow key={student.id} student={student} value={selected.book.days[date]?.marks?.[student.id] || ""} disabled />
            ))}
          </div>
        </Card>
      ) : (
        <Card>
          <Field label="ค้นหาห้องหรือครู">
            <InputWithIcon icon={Search} value={query} onChange={setQuery} placeholder="ชื่อห้อง" />
          </Field>
          {loading ? (
            <div style={{ color: "#64748b", padding: "1rem 0" }}>กำลังโหลด...</div>
          ) : visible.length === 0 ? (
            <div style={{ color: "#94a3b8", padding: "1.25rem 0" }}>{classes.length === 0 ? "ยังไม่มีรายชื่อห้อง อัปไฟล์ Excel ด้านบน" : "ไม่พบห้องที่ค้นหา"}</div>
          ) : (
            <div style={{ display: "grid", gap: "0.5rem", marginTop: "0.9rem" }}>
              {visible.map((item, index) => (
                <button key={item.row.employee_id} type="button" onClick={() => setSelectedId(item.row.employee_id)} style={{ display: "grid", gap: "0.45rem", width: "100%", textAlign: "left", background: "#fff", border: "1px solid #e2e8f0", borderLeft: `4px solid ${item.savedAt ? "#16a34a" : "#dc2626"}`, borderRadius: 12, padding: "0.75rem 0.85rem", cursor: "pointer", fontFamily: "inherit" }}>
                  <span style={{ display: "flex", alignItems: "center", gap: "0.65rem" }}>
                    <Avatar name={item.teacher?.name || item.book.class_name} index={index} />
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: "block", fontWeight: 800, color: "#0f172a" }}>{item.book.class_name || "ไม่ระบุห้อง"}</span>
                      <span style={{ display: "block", fontSize: "0.75rem", color: "#64748b" }}>{item.teacher?.name || "ไม่พบชื่อครู"} · {item.book.students.length} คน</span>
                    </span>
                    <span style={{ background: item.savedAt ? "#dcfce7" : "#fee2e2", color: item.savedAt ? "#166534" : "#b91c1c", fontWeight: 800, fontSize: "0.72rem", borderRadius: 20, padding: "0.2rem 0.55rem", whiteSpace: "nowrap" }}>{item.savedAt ? "เช็คแล้ว" : "ยังไม่เช็ค"}</span>
                  </span>
                  <RollCountChips counts={item.counts} />
                </button>
              ))}
            </div>
          )}
        </Card>
      )}
      </>
      )}
    </div>
  );
}

function PayrollPage({ employees, attendance, leaves, settings, financeInfo = {} }) {
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [config, setConfig] = useState({ dutyRates: { ...DEFAULT_DUTY_RATES }, employeeConfigs: {} });
  const [settingsRows, setSettingsRows] = useState([]);
  const [savedPayrollRows, setSavedPayrollRows] = useState([]);
  const [selectedPayrollEmployee, setSelectedPayrollEmployee] = useState("");
  const [employeeSearch, setEmployeeSearch] = useState("");
  const [payrollAdjustments, setPayrollAdjustments] = useState({});
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [payrollAttendance, setPayrollAttendance] = useState([]);
  const [payrollLeaves, setPayrollLeaves] = useState([]);
  const [loadingMonthData, setLoadingMonthData] = useState(true);
  const [monthDataError, setMonthDataError] = useState("");
  const [monthDataRefreshKey, setMonthDataRefreshKey] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const legacyConfig = loadLegacyPayrollConfig();

  async function loadSavedPayroll(targetMonth) {
    const { data } = await supabase.from("payroll").select("*").eq("month", targetMonth).order("total", { ascending: false });
    setSavedPayrollRows(data || []);
    const nextAdjustments = {};
    (data || []).forEach(row => {
      if (!row.employee_id) return;
      const parsedNote = parsePayrollNote(row.note);
      nextAdjustments[row.employee_id] = {
        adjustment_add: parsedNote.adjustment_add || 0,
        adjustment_deduct: parsedNote.adjustment_deduct || 0,
        adjustment_note: parsedNote.adjustment_note || "",
        override_rate: parsedNote.override_rate ?? "",
        override_base_salary: parsedNote.override_base_salary ?? "",
        override_duty_pay: parsedNote.override_duty_pay ?? "",
        override_substitute_pay: parsedNote.override_substitute_pay ?? "",
        override_leave_deductions: parsedNote.override_leave_deductions ?? "",
        override_bank_gross_salary: parsedNote.override_bank_gross_salary ?? "",
        override_bank_deposit: parsedNote.override_bank_deposit ?? "",
        driver_days: parsedNote.driver_days || 0,
        onet_pay: parsedNote.onet_pay || 0,
        chpk_deduction: parsedNote.chpk_deduction || 0,
        chps_deduction: parsedNote.chps_deduction || 0,
        cooperative_deduction: parsedNote.cooperative_deduction || 0,
        other_deduction_1: parsedNote.other_deduction_1 || 0,
        other_deduction_2: parsedNote.other_deduction_2 || 0,
      };
    });
    setPayrollAdjustments(nextAdjustments);
  }

  useEffect(() => {
    let active = true;

    (async () => {
      setLoadingConfig(true);
      const { data, error } = await supabase.from("salary_settings").select("*").order("created_at", { ascending: true });
      if (!active) return;

      if (error) {
        setConfig({ dutyRates: legacyConfig.dutyRates, employeeConfigs: legacyToEmployeeConfigs(legacyConfig) });
        setLoadingConfig(false);
        return;
      }

      const nextConfig = { dutyRates: { ...DEFAULT_DUTY_RATES }, employeeConfigs: {} };
      (data || []).forEach(row => {
        const dutyName = parseDutyName(row.leave_deduct_types);
        if (dutyName && dutyName in DEFAULT_DUTY_RATES) {
          nextConfig.dutyRates[dutyName] = row.duty_rate ?? 0;
        } else if (row.employee_id) {
          const meta = parseEmployeePayrollMeta(row.leave_deduct_types);
          nextConfig.employeeConfigs[row.employee_id] = {
            daily_rate: row.daily_rate ?? 500,
            overtime_rate: row.overtime_rate ?? 0,
            substitute_rate: row.substitute_rate || 50,
            ...meta,
          };
        }
      });

      const hasSupabaseConfig = Object.values(nextConfig.dutyRates).some(rate => parseMoney(rate) > 0)
        || Object.values(nextConfig.employeeConfigs).some(row => parseMoney(row.daily_rate) > 0 || parseMoney(row.bank_deposit) > 0 || parseMoney(row.overtime_rate) > 0 || parseMoney(row.substitute_rate) > 0);

      setConfig(hasSupabaseConfig ? nextConfig : { dutyRates: legacyConfig.dutyRates, employeeConfigs: legacyToEmployeeConfigs(legacyConfig) });
      setSettingsRows(data || []);
      setLoadingConfig(false);
    })();

    return () => { active = false; };
  }, []);

  useEffect(() => {
    loadSavedPayroll(month);
  }, [month]);

  useEffect(() => {
    let active = true;
    const [year, monthNumber] = month.split("-").map(Number);
    const nextYear = monthNumber === 12 ? year + 1 : year;
    const nextMonth = monthNumber === 12 ? 1 : monthNumber + 1;
    const monthStartDate = `${month}-01`;
    const monthLastDate = `${month}-${String(new Date(year, monthNumber, 0).getDate()).padStart(2, "0")}`;
    const monthEndDate = `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`;
    const monthStartTime = new Date(`${monthStartDate}T00:00:00+07:00`).toISOString();
    const monthEndTime = new Date(`${monthEndDate}T00:00:00+07:00`).toISOString();

    setLoadingMonthData(true);
    setMonthDataError("");

    Promise.all([
      supabase.from("attendance").select("*").gte("check_in", monthStartTime).lt("check_in", monthEndTime),
      supabase
        .from("attendance")
        .select("*")
        .eq("work_activity", "training")
        .lte("training_start_date", monthLastDate)
        .gte("training_end_date", monthStartDate),
      supabase.from("leaves").select("*").eq("status", "approved").lte("start_date", monthLastDate).gte("end_date", monthStartDate),
    ]).then(([attendanceResult, trainingAttendanceResult, leaveResult]) => {
      if (!active) return;
      const errors = [attendanceResult.error, trainingAttendanceResult.error, leaveResult.error].filter(Boolean);
      if (errors.length > 0) {
        setPayrollAttendance([]);
        setPayrollLeaves([]);
        setMonthDataError("ดึงข้อมูลเดือนนี้ไม่สำเร็จ กรุณาซิงก์ใหม่ก่อนคำนวณเงินเดือน");
        setLoadingMonthData(false);
        return;
      }
      const attendanceMap = new Map();
      [...(attendanceResult.data || []), ...(trainingAttendanceResult.data || [])].forEach(row => {
        if (row?.id) attendanceMap.set(row.id, row);
      });
      setPayrollAttendance(Array.from(attendanceMap.values()));
      setPayrollLeaves(leaveResult.data || []);
      setLoadingMonthData(false);
    });

    return () => { active = false; };
  }, [month, monthDataRefreshKey]);

  // Payroll must use the complete month directly from Supabase, not the activity feed limit.
  const monthAttendance = payrollAttendance;
  const monthLeaves = payrollLeaves;
  const monthStart = new Date(month + "-01");
  const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0);
  const workDays = Array.from({ length: monthEnd.getDate() }, (_, i) => i + 1).filter(d => {
    const dow = new Date(monthStart.getFullYear(), monthStart.getMonth(), d).getDay();
    return dow !== 0 && dow !== 6;
  }).length;
  const employeeOptions = employees;
  const selectedEmployeeId = selectedPayrollEmployee || employeeOptions[0]?.id || employees[0]?.id || "";
  const selectedEmployee = employees.find(emp => emp.id === selectedEmployeeId) || null;
  const selectedEmployeeConfig = config.employeeConfigs[selectedEmployeeId] || defaultEmployeePayrollConfig();
  const selectedAdjustment = payrollAdjustments[selectedEmployeeId] || { adjustment_add: 0, adjustment_deduct: 0, adjustment_note: "" };
  const allRows = employees.map(emp => {
    const employeeAttendance = monthAttendance.filter(row => row.employee_id === emp.id);
    const attendanceDateKeys = new Set(employeeAttendance.flatMap(row => getAttendanceWorkDateKeys(row, month)));
    const attendanceDays = attendanceDateKeys.size;
    const dutyCounts = DUTY_OPTIONS.reduce((acc, dutyName) => ({ ...acc, [dutyName]: 0 }), {});
    const lateCount = employeeAttendance.filter(row => checkLate(row.check_in, settings?.work_start, settings?.late_grace_minutes)?.late).length;
    const employeeLeaves = monthLeaves.filter(row => row.employee_id === emp.id);
    const employeeConfig = config.employeeConfigs[emp.id] || defaultEmployeePayrollConfig();
    const leaveTypes = employeeConfig.leave_deduct_types || "ลาป่วย,ลากิจ";
    const deductableLeaveTypes = leaveTypes.split(",").map(item => item.trim()).filter(Boolean);
    const deductibleEmployeeLeaves = employeeLeaves.filter(row => deductableLeaveTypes.includes(row.leave_type));
    const recordedLeaveDays = deductibleEmployeeLeaves.reduce((sum, row) => sum + getLeaveDays(row), 0);
    const medicalLeaveDays = deductibleEmployeeLeaves
      .filter(hasMedicalLeaveDocument)
      .reduce((sum, row) => sum + getLeaveDays(row), 0);
    const chargeableLeaveDays = Math.max(0, recordedLeaveDays - medicalLeaveDays);
    const overtimeHours = 0;

    employeeAttendance.forEach(row => {
      const dutyName = row.duty && DUTY_OPTIONS.includes(row.duty) ? row.duty : "ไม่มีเวร";
      dutyCounts[dutyName] += 1;
    });

    const adjustment = payrollAdjustments[emp.id] || {};
    const configuredRate = parseMoney(employeeConfig.daily_rate);
    const effectiveRate = adjustment.override_rate !== "" && adjustment.override_rate != null ? parseMoney(adjustment.override_rate) : configuredRate;
    const payType = employeeConfig.pay_type || "daily";
    const perDayRate = payType === "monthly" ? MONTHLY_LEAVE_DEDUCT_RATE : effectiveRate;
    const dailyRate = effectiveRate;
    const baseSalaryLabel = payType === "monthly" ? "รับจริง (ฐานเงินเดือนจริง)" : "ค่าจ้างรายวัน";
    const baseSalaryDetail = payType === "monthly"
      ? `ช่องรับจริงใน Excel ${formatMoney(effectiveRate)}`
      : `${attendanceDays} วัน x ${formatMoney(effectiveRate)}`;
    const calculatedDutyPay = PAID_DUTY_OPTIONS.reduce((sum, dutyName) => sum + dutyCounts[dutyName] * parseMoney(config.dutyRates[dutyName]), 0);
    const dutyPay = adjustment.override_duty_pay !== "" && adjustment.override_duty_pay != null ? parseMoney(adjustment.override_duty_pay) : calculatedDutyPay;
    const calculatedBaseSalary = payType === "monthly" ? effectiveRate : attendanceDays * effectiveRate;
    const baseSalary = adjustment.override_base_salary !== "" && adjustment.override_base_salary != null ? parseMoney(adjustment.override_base_salary) : calculatedBaseSalary;
    const overtimePay = 0;
    const substituteItems = monthLeaves.flatMap(row => {
      const { teacherLevel, periods } = getLeaveSubstituteMeta(row.substitute_note);
      if (teacherLevel === "อนุบาล") {
        return periods.includes(emp.id)
          ? [{ label: "สอนแทนครูอนุบาล", amount: getSubstitutePayForLeave(row, emp.id) }]
          : [];
      }
      return periods
        .map((subId, index) => subId === emp.id ? {
          label: SUBSTITUTE_PERIODS[index]?.label || `คาบ ${index + 1}`,
          amount: SUBSTITUTE_PERIODS[index]?.rate || 50,
        } : null)
        .filter(Boolean);
    });
    const substituteCount = substituteItems.length;
    const calculatedSubstitutePay = substituteItems.reduce((sum, item) => sum + item.amount, 0);
    const substitutePay = adjustment.override_substitute_pay !== "" && adjustment.override_substitute_pay != null ? parseMoney(adjustment.override_substitute_pay) : calculatedSubstitutePay;
    const bankDeposit = adjustment.override_bank_deposit !== "" && adjustment.override_bank_deposit != null
      ? parseMoney(adjustment.override_bank_deposit)
      : parseMoney(employeeConfig.bank_deposit);
    const bankGrossSalary = adjustment.override_bank_gross_salary !== "" && adjustment.override_bank_gross_salary != null
      ? parseMoney(adjustment.override_bank_gross_salary)
      : parseMoney(employeeConfig.bank_gross_salary);
    const leaveDeductDays = payType === "daily" ? 0 : chargeableLeaveDays;
    const calculatedLeaveDeductions = payType === "daily"
      ? 0
      : deductibleEmployeeLeaves.reduce((sum, row) => sum + getMonthlyLeaveDeduction(row), 0);
    const leaveDeductions = adjustment.override_leave_deductions !== "" && adjustment.override_leave_deductions != null ? parseMoney(adjustment.override_leave_deductions) : calculatedLeaveDeductions;
    const monthlyRecurringDeduction = payType === "monthly" && bankGrossSalary > 0 && bankDeposit > 0
      ? Math.max(0, bankGrossSalary - bankDeposit)
      : 0;
    const adjustmentAdd = parseMoney(adjustment.adjustment_add);
    const adjustmentDeduct = parseMoney(adjustment.adjustment_deduct);
    const adjustmentNote = adjustment.adjustment_note || "";
    const isDriverEmployee = DRIVER_EMPLOYEE_IDS.has(emp.id);
    const driverDays = isDriverEmployee ? Math.max(0, Math.floor(parseMoney(adjustment.driver_days))) : 0;
    const driverPay = driverDays * DRIVER_DAY_RATE;
    const dutyOrDriverPay = isDriverEmployee && driverDays > 0 ? driverPay : dutyPay;
    const chpkDeduction = parseMoney(adjustment.chpk_deduction);
    const chpsDeduction = parseMoney(adjustment.chps_deduction);
    const cooperativeDeduction = parseMoney(adjustment.cooperative_deduction);
    const otherDeduction1 = parseMoney(adjustment.other_deduction_1);
    const otherDeduction2 = parseMoney(adjustment.other_deduction_2);
    const grossPay = baseSalary + dutyOrDriverPay + overtimePay + substitutePay;
    const deductions = leaveDeductions
      + monthlyRecurringDeduction
      + chpkDeduction
      + chpsDeduction
      + cooperativeDeduction
      + otherDeduction1
      + otherDeduction2
      + adjustmentDeduct;
    const totalPay = grossPay + adjustmentAdd - deductions;
    const realSalary = totalPay;
    const refundAmount = Math.max(0, bankDeposit - realSalary);
    const additionalPayment = Math.max(0, realSalary - bankDeposit);
    const dutyCount = PAID_DUTY_OPTIONS.reduce((sum, dutyName) => sum + dutyCounts[dutyName], 0);
    const absentDays = Math.max(0, workDays - attendanceDays - employeeLeaves.reduce((sum, row) => sum + getLeaveDays(row), 0));

    return {
      emp,
      attendanceDays,
      dutyCounts,
      dutyCount,
      dailyRate,
      payType,
      perDayRate,
      baseSalaryLabel,
      baseSalaryDetail,
      baseSalary,
      dutyPay,
      totalPay,
      bankGrossSalary,
      bankDeposit,
      realSalary,
      refundAmount,
      additionalPayment,
      lateCount,
      absentDays,
      recordedLeaveDays,
      leaveDeductDays,
      medicalLeaveDays,
      substituteCount,
      substitutePay,
      driverDays,
      driverPay,
      dutyOrDriverPay,
      chpkDeduction,
      chpsDeduction,
      cooperativeDeduction,
      otherDeduction1,
      otherDeduction2,
      monthlyRecurringDeduction,
      overtimeHours,
      overtimePay,
      grossPay,
      leaveDeductions,
      adjustmentAdd,
      adjustmentDeduct,
      adjustmentNote,
      deductions,
      note: PAID_DUTY_OPTIONS.filter(dutyName => dutyCounts[dutyName] > 0).map(dutyName => `${dutyName} ${dutyCounts[dutyName]} วัน`).join(", "),
    };
  });
  const summaryRows = allRows.filter(row => row.attendanceDays > 0 || row.dailyRate > 0 || row.dutyPay > 0 || row.deductions > 0 || row.substitutePay > 0 || row.driverPay > 0);
  const selectedSummaryRow = allRows.find(row => row.emp.id === selectedEmployeeId) || null;
  const selectedDutySummary = selectedSummaryRow
    ? PAID_DUTY_OPTIONS.filter(dutyName => selectedSummaryRow.dutyCounts[dutyName] > 0)
    : [];
  const selectedSavedPayroll = savedPayrollRows.find(row => row.employee_id === selectedEmployeeId) || null;
  const payrollSnapshotDisplay = selectedSummaryRow ? {
    workDays: selectedSummaryRow.attendanceDays,
    lateCount: selectedSummaryRow.lateCount,
    dutyCount: selectedSummaryRow.dutyCount,
    leaveDeductDays: selectedSummaryRow.leaveDeductDays,
    deductions: selectedSummaryRow.deductions,
    bankDeposit: selectedSummaryRow.bankDeposit,
    realSalary: selectedSummaryRow.realSalary,
    total: selectedSummaryRow.refundAmount,
    additionalPayment: selectedSummaryRow.additionalPayment,
  } : null;

  const totalPayout = summaryRows.reduce((sum, row) => sum + row.realSalary, 0);
  const totalBankDeposit = summaryRows.reduce((sum, row) => sum + row.bankDeposit, 0);
  const totalRefund = summaryRows.reduce((sum, row) => sum + row.refundAmount, 0);
  const totalAdditionalPayment = summaryRows.reduce((sum, row) => sum + row.additionalPayment, 0);
  const totalAttendanceDays = summaryRows.reduce((sum, row) => sum + row.attendanceDays, 0);
  const leaveSummaryRows = employees.map(emp => {
    const rows = monthLeaves.filter(row => row.employee_id === emp.id);
    if (rows.length === 0) return null;
    return {
      employee: emp,
      days: rows.reduce((sum, row) => sum + getLeaveDays(row), 0),
      dates: rows.map(row => row.end_date && row.end_date !== row.start_date
        ? `${fmtDate(row.start_date)} - ${fmtDate(row.end_date)}`
        : fmtDate(row.start_date)).join(", "),
      types: [...new Set(rows.map(row => row.leave_type).filter(Boolean))].join(", "),
      medicalDays: rows.filter(hasMedicalLeaveDocument).reduce((sum, row) => sum + getLeaveDays(row), 0),
    };
  }).filter(Boolean);
  const substituteSummaryRows = monthLeaves.flatMap(leaveRow => {
    const absentEmployee = employees.find(emp => emp.id === leaveRow.employee_id);
    const { teacherLevel, periods } = getLeaveSubstituteMeta(leaveRow.substitute_note);
    if (teacherLevel === "อนุบาล") {
      return [...new Set(periods.filter(substituteId => substituteId && substituteId !== FREE_PERIOD_VALUE))].map(substituteId => ({
        date: fmtDate(leaveRow.start_date),
        absentName: absentEmployee?.name || "-",
        substituteName: employees.find(emp => emp.id === substituteId)?.name || "-",
        period: "อนุบาลทั้งวัน",
        amount: KINDERGARTEN_SUBSTITUTE_DAY_RATE * Math.max(1, getLeaveDays(leaveRow)),
      }));
    }
    return periods.map((substituteId, index) => substituteId && substituteId !== FREE_PERIOD_VALUE ? {
      date: fmtDate(leaveRow.start_date),
      absentName: absentEmployee?.name || "-",
      substituteName: employees.find(emp => emp.id === substituteId)?.name || "-",
      period: SUBSTITUTE_PERIODS[index]?.label || `คาบ ${index + 1}`,
      amount: SUBSTITUTE_PERIODS[index]?.rate || 50,
    } : null).filter(Boolean);
  });

  const updateDutyRate = (dutyName, value) => {
    setConfig(current => ({
      ...current,
      dutyRates: { ...current.dutyRates, [dutyName]: value },
    }));
  };

  const updateDailyRate = (employeeId, value) => {
    setConfig(current => ({
      ...current,
      employeeConfigs: {
        ...current.employeeConfigs,
        [employeeId]: {
          ...(current.employeeConfigs[employeeId] || defaultEmployeePayrollConfig()),
          daily_rate: value,
        },
      },
    }));
  };

  const updateEmployeeSetting = (employeeId, key, value) => {
    setConfig(current => ({
      ...current,
      employeeConfigs: {
        ...current.employeeConfigs,
        [employeeId]: {
          ...(current.employeeConfigs[employeeId] || defaultEmployeePayrollConfig()),
          [key]: value,
        },
      },
    }));
  };

  const updatePayrollAdjustment = (employeeId, key, value) => {
    setPayrollAdjustments(current => ({
      ...current,
      [employeeId]: {
        ...(current[employeeId] || { adjustment_add: 0, adjustment_deduct: 0, adjustment_note: "" }),
        [key]: value,
      },
    }));
  };

  const toggleLeaveDeductType = (employeeId, leaveType) => {
    const currentConfig = config.employeeConfigs[employeeId] || defaultEmployeePayrollConfig();
    const selectedTypes = (currentConfig.leave_deduct_types || "").split(",").map(item => item.trim()).filter(Boolean);
    const nextTypes = selectedTypes.includes(leaveType)
      ? selectedTypes.filter(item => item !== leaveType)
      : [...selectedTypes, leaveType];
    updateEmployeeSetting(employeeId, "leave_deduct_types", nextTypes.join(","));
  };

  const handleSave = async () => {
    setSaving(true);

    const dutyRows = settingsRows.filter(row => parseDutyName(row.leave_deduct_types));
    const employeeRows = settingsRows.filter(row => row.employee_id);

    for (const dutyName of PAID_DUTY_OPTIONS) {
      const existing = dutyRows.find(row => parseDutyName(row.leave_deduct_types) === dutyName);
      const payload = {
        employee_id: null,
        daily_rate: 0,
        duty_rate: parseMoney(config.dutyRates[dutyName]),
        substitute_rate: existing?.substitute_rate ?? 0,
        overtime_rate: 0,
        leave_deduct_types: getDutySettingLabel(dutyName),
      };

      if (existing) {
        await supabase.from("salary_settings").update(payload).eq("id", existing.id);
      } else {
        await supabase.from("salary_settings").insert(payload);
      }
    }

    for (const emp of employees) {
      const existing = employeeRows.find(row => row.employee_id === emp.id);
      const employeeConfig = { ...defaultEmployeePayrollConfig(), ...(config.employeeConfigs[emp.id] || {}) };
      const hasMeaningfulConfig = parseMoney(employeeConfig.daily_rate) > 0
        || parseMoney(employeeConfig.bank_gross_salary) > 0
        || parseMoney(employeeConfig.bank_deposit) > 0
        || parseMoney(employeeConfig.substitute_rate) > 0
        || employeeConfig.teacher_level
        || employeeConfig.pay_type !== "daily"
        || (employeeConfig.leave_deduct_types || "").trim() !== "ลาป่วย,ลากิจ";

      if (existing) {
        await supabase.from("salary_settings").update({
          daily_rate: parseMoney(employeeConfig.daily_rate),
          overtime_rate: 0,
          substitute_rate: parseMoney(employeeConfig.substitute_rate),
          leave_deduct_types: formatEmployeePayrollMeta(employeeConfig),
        }).eq("id", existing.id);
      } else if (hasMeaningfulConfig) {
        await supabase.from("salary_settings").insert({
          employee_id: emp.id,
          daily_rate: parseMoney(employeeConfig.daily_rate),
          duty_rate: 0,
          substitute_rate: parseMoney(employeeConfig.substitute_rate),
          overtime_rate: 0,
          leave_deduct_types: formatEmployeePayrollMeta(employeeConfig),
        });
      }
    }

    const { data: payrollRows } = await supabase.from("payroll").select("*").eq("month", month);
    const payrollMap = new Map((payrollRows || []).filter(row => row.employee_id).map(row => [row.employee_id, row]));

    for (const row of allRows) {
      const payload = {
        employee_id: row.emp.id,
        month,
        work_days: row.attendanceDays,
        absent_days: Number(row.absentDays.toFixed(2)),
        late_count: row.lateCount,
        duty_count: row.dutyCount,
        substitute_count: row.substituteCount,
        overtime_hours: Number(row.overtimeHours.toFixed(2)),
        leave_deduct_days: Number(row.leaveDeductDays.toFixed(2)),
        base_salary: Number(row.baseSalary.toFixed(2)),
        duty_pay: Number(row.dutyPay.toFixed(2)),
        substitute_pay: Number(row.substitutePay.toFixed(2)),
        overtime_pay: Number(row.overtimePay.toFixed(2)),
        deductions: Number(row.deductions.toFixed(2)),
        total: Number(row.refundAmount.toFixed(2)),
        note: JSON.stringify({
          duty_note: row.note || "",
          adjustment_add: Number(row.adjustmentAdd.toFixed(2)),
          adjustment_deduct: Number(row.adjustmentDeduct.toFixed(2)),
          adjustment_note: row.adjustmentNote || "",
          bank_gross_salary: Number(row.bankGrossSalary.toFixed(2)),
          bank_deposit: Number(row.bankDeposit.toFixed(2)),
          real_salary: Number(row.realSalary.toFixed(2)),
          refund_amount: Number(row.refundAmount.toFixed(2)),
          additional_payment: Number(row.additionalPayment.toFixed(2)),
          monthly_recurring_deduction: Number(row.monthlyRecurringDeduction.toFixed(2)),
          driver_days: row.driverDays,
          driver_pay: Number(row.driverPay.toFixed(2)),
          chpk_deduction: Number(row.chpkDeduction.toFixed(2)),
          chps_deduction: Number(row.chpsDeduction.toFixed(2)),
          cooperative_deduction: Number(row.cooperativeDeduction.toFixed(2)),
          other_deduction_1: Number(row.otherDeduction1.toFixed(2)),
          other_deduction_2: Number(row.otherDeduction2.toFixed(2)),
          override_rate: payrollAdjustments[row.emp.id]?.override_rate ?? "",
          override_base_salary: payrollAdjustments[row.emp.id]?.override_base_salary ?? "",
          override_duty_pay: payrollAdjustments[row.emp.id]?.override_duty_pay ?? "",
          override_substitute_pay: payrollAdjustments[row.emp.id]?.override_substitute_pay ?? "",
          override_leave_deductions: payrollAdjustments[row.emp.id]?.override_leave_deductions ?? "",
          override_bank_gross_salary: payrollAdjustments[row.emp.id]?.override_bank_gross_salary ?? "",
          override_bank_deposit: payrollAdjustments[row.emp.id]?.override_bank_deposit ?? "",
        }),
      };
      const existing = payrollMap.get(row.emp.id);

      if (existing) {
        await supabase.from("payroll").update(payload).eq("id", existing.id);
      } else {
        await supabase.from("payroll").insert(payload);
      }
    }

    const { data: latestRows } = await supabase.from("salary_settings").select("*").order("created_at", { ascending: true });
    setSettingsRows(latestRows || []);
    await loadSavedPayroll(month);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const exportExcel = () => {
    const escapeHtml = (value) => String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

    const monthlyRows = summaryRows.filter(row => row.payType !== "daily");
    const dailyRows = summaryRows.filter(row => row.payType === "daily");
    const financeInfoRows = FINANCE_INFO_FIELDS.map(field => `
      <tr>
        <td>${escapeHtml(field.label)}</td>
        <td class="money">${parseMoney(financeInfo[field.key]).toFixed(2)}</td>
      </tr>
    `).join("");

    const renderPayrollRows = (rows) => rows.length === 0
      ? `<tr><td colspan="19" style="text-align:center;color:#94a3b8;">ไม่มีข้อมูลในกลุ่มนี้</td></tr>`
      : rows.map(row => `
        <tr>
          <td>${escapeHtml(row.emp.name)}</td>
          <td>${row.payType === "monthly" ? "รายเดือน" : "รายวัน"}</td>
          <td class="money">${row.bankGrossSalary.toFixed(2)}</td>
          <td class="money deduct" x:fmla="=MAX(0,RC[-1]-RC[1])">${row.monthlyRecurringDeduction.toFixed(2)}</td>
          <td class="money">${row.bankDeposit.toFixed(2)}</td>
          <td class="money">${row.baseSalary.toFixed(2)}</td>
          <td class="money">${row.substitutePay.toFixed(2)}</td>
          <td class="count">${row.driverDays}</td>
          <td class="money"${DRIVER_EMPLOYEE_IDS.has(row.emp.id) ? ' x:fmla="=IF(RC[-1]>0,RC[-1]*320,0)"' : ""}>${row.dutyOrDriverPay.toFixed(2)}</td>
          <td class="money deduct">${row.chpkDeduction.toFixed(2)}</td>
          <td class="money deduct">${row.chpsDeduction.toFixed(2)}</td>
          <td class="money deduct">${row.cooperativeDeduction.toFixed(2)}</td>
          <td class="money deduct">${row.leaveDeductions.toFixed(2)}</td>
          <td class="money deduct">${row.otherDeduction1.toFixed(2)}</td>
          <td class="money deduct">${(row.otherDeduction2 + row.adjustmentDeduct).toFixed(2)}</td>
          <td class="money deduct" x:fmla="=RC[-12]+SUM(RC[-6]:RC[-1])">${row.deductions.toFixed(2)}</td>
          <td class="money" x:fmla="=SUM(RC[-11]:RC[-10],RC[-8])+${row.adjustmentAdd.toFixed(2)}-RC[-1]">${row.realSalary.toFixed(2)}</td>
          <td class="money total" x:fmla="=MAX(0,RC[-13]-RC[-1])">${row.refundAmount.toFixed(2)}</td>
          <td class="money additional" x:fmla="=MAX(0,RC[-2]-RC[-14])">${row.additionalPayment.toFixed(2)}</td>
        </tr>
      `).join("");

    const renderDailyRows = (rows) => rows.length === 0
      ? `<tr><td colspan="10" style="text-align:center;color:#94a3b8;">ไม่มีพนักงานรายวันในเดือนนี้</td></tr>`
      : rows.map(row => `
        <tr>
          <td>${escapeHtml(row.emp.name)}</td>
          <td>${escapeHtml(row.emp.department || "")}</td>
          <td class="count">${row.attendanceDays}</td>
          <td class="money">${row.dailyRate.toFixed(2)}</td>
          <td>${row.dailyRate.toFixed(2)} x ${row.attendanceDays} วัน</td>
          <td class="money" x:fmla="=RC[-2]*RC[-3]">${row.baseSalary.toFixed(2)}</td>
          <td class="money">${row.dutyOrDriverPay.toFixed(2)}</td>
          <td class="money">${row.substitutePay.toFixed(2)}</td>
          <td class="money deduct">${row.leaveDeductions.toFixed(2)}</td>
          <td class="money total">${row.realSalary.toFixed(2)}</td>
        </tr>
      `).join("");

    const html = `
      <html xmlns:o="urn:schemas-microsoft-com:office:office"
            xmlns:x="urn:schemas-microsoft-com:office:excel"
            xmlns="http://www.w3.org/TR/REC-html40">
      <head>
        <meta charset="UTF-8" />
        <xml>
          <x:ExcelWorkbook>
            <x:ExcelWorksheets>
              <x:ExcelWorksheet>
                <x:Name>สรุปเงินเดือน</x:Name>
                <x:WorksheetOptions>
                  <x:DisplayGridlines/>
                  <x:FitToPage/>
                  <x:PageSetup>
                    <x:Layout x:Orientation="Landscape"/>
                    <x:PageMargins x:Bottom="0.2" x:Left="0.2" x:Right="0.2" x:Top="0.2"/>
                  </x:PageSetup>
                  <x:Print>
                    <x:FitWidth>1</x:FitWidth>
                    <x:FitHeight>0</x:FitHeight>
                    <x:ValidPrinterInfo/>
                    <x:PaperSizeIndex>9</x:PaperSizeIndex>
                    <x:HorizontalResolution>600</x:HorizontalResolution>
                    <x:VerticalResolution>600</x:VerticalResolution>
                  </x:Print>
                </x:WorksheetOptions>
              </x:ExcelWorksheet>
            </x:ExcelWorksheets>
          </x:ExcelWorkbook>
        </xml>
        <style>
          @page { size: A4 landscape; margin: 5mm; mso-page-orientation: landscape; }
          body { margin: 0; }
          table { border-collapse: collapse; font-family: Tahoma, sans-serif; width: 100%; font-size: 9pt; table-layout: fixed; }
          .daily-table { margin-top: 10px; }
          th, td { border: 1px solid #cbd5e1; padding: 3px 4px; vertical-align: middle; white-space: nowrap; overflow: hidden; }
          th { background: #eff6ff; font-weight: 700; }
          .section-title { background: #f8fafc; color: #0f172a; font-size: 12px; text-align: left; }
          .count { text-align: center; }
          .money { background: #ecfdf5; color: #166534; font-weight: 700; text-align: right; }
          .deduct { background: #fef2f2; color: #b91c1c; }
          .total { background: #fff7ed; color: #c2410c; font-weight: 800; }
          .additional { background: #eff6ff; color: #1d4ed8; font-weight: 800; }
        </style>
      </head>
      <body>
        <table>
          <tr>
            <th colspan="19" style="font-size:15px;background:#dbeafe;">สรุปเงินเดือน เดือน ${escapeHtml(month)}</th>
          </tr>
          <tr>
            <th colspan="19" class="section-title">ตารางเงินเดือนประจำ / เทียบยอดเข้า บช</th>
          </tr>
          <tr>
            <th>พนักงาน</th>
            <th>ประเภท</th>
            <th>เงินเดือน PDF</th>
            <th>หัก 3%</th>
            <th>เงินเข้า บช</th>
            <th>รับจริง</th>
            <th>ค่าสอนแทน</th>
            <th>ขับรถ (วัน)</th>
            <th>ขับรถ/เวร</th>
            <th>ช.พ.ค.</th>
            <th>ช.พ.ส.</th>
            <th>สหกรณ์</th>
            <th>ลา</th>
            <th>อื่น ๆ 1</th>
            <th>อื่น ๆ 2</th>
            <th>หักรวม</th>
            <th>รวมเข้า บช</th>
            <th>ยอดคืน</th>
            <th>ต้องรับเพิ่ม</th>
          </tr>
          ${renderPayrollRows(monthlyRows)}
        </table>

        <table class="daily-table">
          <tr>
            <th colspan="10" class="section-title">ตารางพนักงานรายวัน (อัตรารายวัน x วันที่ลงเวลา)</th>
          </tr>
          <tr>
            <th>พนักงาน</th>
            <th>แผนก</th>
            <th>วันที่ลงเวลา</th>
            <th>อัตรารายวัน</th>
            <th>สูตร</th>
            <th>ค่าจ้างรายวัน</th>
            <th>ค่าเวรรถ</th>
            <th>ค่าสอนแทน</th>
            <th>หักลา</th>
            <th>รวมเข้า บช</th>
          </tr>
          ${renderDailyRows(dailyRows)}
        </table>

        <table class="daily-table" style="width:45%;">
          <tr>
            <th colspan="2" class="section-title">สรุปค่าใช้จ่ายประกอบ (ไม่รวมในสูตรเงินเดือน)</th>
          </tr>
          <tr>
            <th>รายการ</th>
            <th>จำนวนเงิน</th>
          </tr>
          ${financeInfoRows}
        </table>
      </body>
      </html>
    `;

    const blob = new Blob(["\ufeff" + html], { type: "application/vnd.ms-excel;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `สรุปเงินเดือน_${month}.xls`;
    link.click();
  };

  const tableRows = allRows;
  const monthlyTableRows = tableRows.filter(row => row.payType === "monthly");
  const dailyTableRows = tableRows.filter(row => row.payType === "daily");
  const payrollInputStyle = {
    width: 88,
    minWidth: 72,
    border: "1px solid #93c5fd",
    borderRadius: "6px",
    padding: "0.38rem 0.42rem",
    fontFamily: "inherit",
    fontSize: "0.75rem",
    fontWeight: 700,
    color: "#0f172a",
    background: "#fff",
    textAlign: "right",
  };
  const payrollCellBase = {
    padding: "0.38rem 0.42rem",
    borderRight: "1px solid #e2e8f0",
    borderBottom: "1px solid #e2e8f0",
    textAlign: "right",
    whiteSpace: "nowrap",
    verticalAlign: "middle",
  };
  const payrollEditableCell = { ...payrollCellBase, background: "#fffbeb" };
  const payrollFormulaCell = { ...payrollCellBase, background: "#fef2f2", color: "#b91c1c", fontWeight: 800 };
  const payrollDeductCell = { ...payrollCellBase, background: "#fee2e2", color: "#b91c1c", fontWeight: 900 };
  const payrollTotalCell = { ...payrollCellBase, background: "#dbeafe", color: "#1d4ed8", fontWeight: 900 };
  const payrollRefundCell = { ...payrollCellBase, background: "#fff7ed", color: "#c2410c", fontWeight: 900 };
  const payrollAdditionalCell = { ...payrollCellBase, background: "#eff6ff", color: "#1d4ed8", fontWeight: 900 };
  const renderMoneyInput = (row, key, value, options = {}) => (
    <input
      type="number"
      min={options.min ?? 0}
      step={options.step ?? "0.01"}
      value={value ?? 0}
      onChange={e => updatePayrollAdjustment(row.emp.id, key, e.target.value)}
      style={{ ...payrollInputStyle, width: options.width || payrollInputStyle.width }}
    />
  );
  const renderPayrollTable = (rows, title, isDailyTable = false) => (
    <Card padding="0" style={{ minWidth: 0, borderRadius: "4px", boxShadow: "none", borderColor: "#cbd5e1" }}>
      <div style={{ padding: "0.9rem 1rem", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: "0.95rem", fontWeight: 800, color: "#0f172a" }}>{title}</div>
          <div style={{ fontSize: "0.75rem", color: "#64748b", marginTop: "0.15rem" }}>ช่องสีขาวกรอกแก้ได้ ช่องสีอื่นเป็นสูตรคำนวณอัตโนมัติ</div>
        </div>
        <div style={{ fontSize: "0.75rem", color: "#1d4ed8", fontWeight: 800 }}>{rows.length} คน</div>
      </div>
      <div style={{ overflowX: "auto", maxHeight: 430, width: "100%", minWidth: 0 }}>
        <table style={{ width: "max-content", minWidth: "100%", borderCollapse: "separate", borderSpacing: 0, fontSize: "0.75rem" }}>
          <thead style={{ position: "sticky", top: 0, zIndex: 2 }}>
            <tr>
              {[
                "ชื่อ-สกุล", isDailyTable ? "ค่าจ้าง/วัน" : "เงินเดือน PDF", "หัก 3%", "เงินเข้า บช", isDailyTable ? "ค่าจ้างรวม" : "รับจริง", "สอนแทน",
                ...(isDailyTable ? ["วันทำงาน", "สูตรรายวัน"] : []),
                "วันขับ", "ขับรถ/เวร", "ช.พ.ค.", "ช.พ.ส.", "สหกรณ์",
                "ลา", "อื่น ๆ 1", "อื่น ๆ 2", "รวมหัก", "รวมเข้า บช", "ยอดคืน", "ต้องรับเพิ่ม",
              ].map((header, index) => (
                <th key={header} style={{
                  padding: "0.55rem 0.5rem",
                  borderRight: "1px solid #cbd5e1",
                  borderBottom: "1px solid #94a3b8",
                  background: index <= 8 ? "#fef3c7" : index <= 15 ? "#fed7aa" : index === 16 ? "#bfdbfe" : "#f8fafc",
                  color: "#334155",
                  fontWeight: 800,
                  whiteSpace: "nowrap",
                  textAlign: index === 0 ? "left" : "right",
                }}>{header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={isDailyTable ? 20 : 18} style={{ padding: "1.25rem", textAlign: "center", color: "#94a3b8" }}>ไม่มีข้อมูลในกลุ่มนี้</td></tr>
            ) : rows.map(row => {
              const adjustment = payrollAdjustments[row.emp.id] || {};
              return (
                <tr key={row.emp.id}>
                  <td style={{ padding: "0.45rem 0.55rem", borderRight: "1px solid #e2e8f0", borderBottom: "1px solid #e2e8f0", background: "#dcfce7", minWidth: 180 }}>
                    <div style={{ fontWeight: 800, color: "#0f172a" }}>{row.emp.name}</div>
                    <div style={{ color: "#64748b", fontSize: "0.68rem" }}>{row.emp.department || "-"}</div>
                  </td>
                  <td style={payrollEditableCell}>
                    {isDailyTable
                      ? renderMoneyInput(row, "override_rate", adjustment.override_rate !== "" && adjustment.override_rate != null ? adjustment.override_rate : row.dailyRate)
                      : renderMoneyInput(row, "override_bank_gross_salary", adjustment.override_bank_gross_salary !== "" && adjustment.override_bank_gross_salary != null ? adjustment.override_bank_gross_salary : row.bankGrossSalary)}
                  </td>
                  <td style={payrollFormulaCell}>{formatMoney(row.monthlyRecurringDeduction)}</td>
                  <td style={payrollEditableCell}>{renderMoneyInput(row, "override_bank_deposit", adjustment.override_bank_deposit !== "" && adjustment.override_bank_deposit != null ? adjustment.override_bank_deposit : row.bankDeposit)}</td>
                  <td style={payrollEditableCell}>{renderMoneyInput(row, "override_base_salary", adjustment.override_base_salary !== "" && adjustment.override_base_salary != null ? adjustment.override_base_salary : row.baseSalary)}</td>
                  <td style={payrollEditableCell}>{renderMoneyInput(row, "override_substitute_pay", adjustment.override_substitute_pay !== "" && adjustment.override_substitute_pay != null ? adjustment.override_substitute_pay : row.substitutePay)}</td>
                  {isDailyTable && (
                    <>
                      <td style={{ ...payrollCellBase, background: "#eff6ff", color: "#1d4ed8", fontWeight: 900, textAlign: "center" }}>{row.attendanceDays} วัน</td>
                      <td style={{ ...payrollCellBase, background: "#ecfdf5", color: "#166534", fontWeight: 900 }}>{formatMoney(row.dailyRate)} x {row.attendanceDays} = {formatMoney(row.baseSalary)}</td>
                    </>
                  )}
                  <td style={payrollEditableCell}>
                    {DRIVER_EMPLOYEE_IDS.has(row.emp.id)
                      ? renderMoneyInput(row, "driver_days", adjustment.driver_days || 0, { step: 1, width: 66 })
                      : <span style={{ color: "#94a3b8" }}>-</span>}
                  </td>
                  <td style={payrollEditableCell}>
                    {DRIVER_EMPLOYEE_IDS.has(row.emp.id) && row.driverDays > 0
                      ? <div style={{ minWidth: 88, color: "#0891b2", fontWeight: 900, textAlign: "right" }}>{formatMoney(row.driverPay)}</div>
                      : renderMoneyInput(row, "override_duty_pay", adjustment.override_duty_pay !== "" && adjustment.override_duty_pay != null ? adjustment.override_duty_pay : row.dutyPay)}
                  </td>
                  <td style={payrollEditableCell}>{renderMoneyInput(row, "chpk_deduction", adjustment.chpk_deduction || 0)}</td>
                  <td style={payrollEditableCell}>{renderMoneyInput(row, "chps_deduction", adjustment.chps_deduction || 0)}</td>
                  <td style={payrollEditableCell}>{renderMoneyInput(row, "cooperative_deduction", adjustment.cooperative_deduction || 0)}</td>
                  <td style={payrollEditableCell}>{renderMoneyInput(row, "override_leave_deductions", adjustment.override_leave_deductions !== "" && adjustment.override_leave_deductions != null ? adjustment.override_leave_deductions : row.leaveDeductions)}</td>
                  <td style={payrollEditableCell}>{renderMoneyInput(row, "other_deduction_1", adjustment.other_deduction_1 || 0)}</td>
                  <td style={payrollEditableCell}>{renderMoneyInput(row, "other_deduction_2", adjustment.other_deduction_2 || 0)}</td>
                  <td style={payrollDeductCell}>{formatMoney(row.deductions)}</td>
                  <td style={payrollTotalCell}>{formatMoney(row.realSalary)}</td>
                  <td style={payrollRefundCell}>{formatMoney(row.refundAmount)}</td>
                  <td style={payrollAdditionalCell}>{formatMoney(row.additionalPayment)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );

  return (
    <div>
      <style>{`
        .payroll-insight-grid { display: grid; grid-template-columns: minmax(300px, 1.15fr) minmax(280px, .9fr) minmax(360px, 1.25fr); gap: .65rem; }
        @media (max-width: 900px) { .payroll-insight-grid { grid-template-columns: 1fr; } }
      `}</style>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.75rem", flexWrap: "wrap", marginBottom: "0.65rem" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: "1.35rem", color: "#0f172a", letterSpacing: 0 }}>สรุปเงินเดือน</h1>
          <div style={{ color: "#64748b", fontSize: "0.74rem" }}>ข้อมูลจาก Supabase เดือน {month}</div>
        </div>
        <div style={{ display: "flex", alignItems: "end", gap: "0.5rem", flexWrap: "wrap" }}>
          <Field label="เดือน">
            <input type="month" value={month} onChange={e => setMonth(e.target.value)} style={{ ...inputStyle, width: 150, padding: "0.55rem 0.65rem" }} />
          </Field>
          <Field label="ดูรายละเอียดพนักงาน">
            <select value={selectedEmployeeId} onChange={e => setSelectedPayrollEmployee(e.target.value)} style={{ ...selectStyle, width: 260, padding: "0.55rem 0.65rem" }}>
              {employeeOptions.map(emp => <option key={emp.id} value={emp.id}>{emp.name} — {emp.department || "ไม่ระบุแผนก"}</option>)}
            </select>
          </Field>
          <button onClick={() => setMonthDataRefreshKey(key => key + 1)} disabled={loadingMonthData} title="ซิงก์ข้อมูลใหม่" style={{ ...btnSecondary, flex: "none", padding: "0.62rem", height: 38 }}>
            <RefreshCw size={16} style={loadingMonthData ? { animation: "spin 1s linear infinite" } : undefined} />
          </button>
          <button onClick={exportExcel} style={{ ...btnSecondary, flex: "none", padding: "0.58rem 0.75rem", height: 38 }}><FileText size={15} /> Excel</button>
          <button onClick={handleSave} disabled={loadingConfig || loadingMonthData || Boolean(monthDataError) || saving} style={{ ...btnPrimary, flex: "none", padding: "0.58rem 0.8rem", height: 38, background: saved ? "#15803d" : "#166534", color: "#fff" }}>
            {saving ? <RefreshCw size={15} style={{ animation: "spin 1s linear infinite" }} /> : saved ? <CheckCircle size={15} /> : <Save size={15} />}
            {saving ? "กำลังบันทึก" : saved ? "บันทึกแล้ว" : "คำนวณและบันทึก"}
          </button>
        </div>
      </div>

      <div style={{ border: "1px solid #cbd5e1", background: "#fff", marginBottom: "0.65rem", overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(120px, 1fr))", overflowX: "auto" }}>
          {[
            ["พนักงาน", `${summaryRows.length} คน`],
            ["เงินเข้า บช รวม", formatMoney(totalBankDeposit)],
            ["เงินเดือนจริงรวม", formatMoney(totalPayout)],
            ["ยอดคืนรวม", formatMoney(totalRefund)],
            ["ต้องรับเพิ่มรวม", formatMoney(totalAdditionalPayment)],
          ].map(([label, value], index) => (
            <div key={label} style={{ padding: "0.55rem 0.7rem", borderRight: index < 4 ? "1px solid #cbd5e1" : "none", background: index === 3 ? "#fff7ed" : index === 4 ? "#eff6ff" : "#f8fafc", minWidth: 135 }}>
              <div style={{ color: "#64748b", fontSize: "0.68rem" }}>{label}</div>
              <div style={{ color: index === 3 ? "#c2410c" : index === 4 ? "#1d4ed8" : "#0f172a", fontSize: "0.95rem", fontWeight: 900 }}>{value}</div>
            </div>
          ))}
        </div>
        {(loadingMonthData || monthDataError) && <div style={{ borderTop: "1px solid #cbd5e1", padding: "0.4rem 0.7rem", color: monthDataError ? "#b91c1c" : "#1d4ed8", fontSize: "0.72rem" }}>{monthDataError || "กำลังซิงก์ข้อมูลเดือนนี้..."}</div>}
      </div>

      <div className="payroll-insight-grid" style={{ marginBottom: "0.65rem" }}>
        <section style={{ border: "1px solid #cbd5e1", background: "#fff", minWidth: 300 }}>
          <div style={{ padding: "0.42rem 0.65rem", background: "#dbeafe", borderBottom: "1px solid #94a3b8", fontSize: "0.78rem", fontWeight: 900 }}>รายละเอียด {selectedEmployee?.name || "-"}</div>
          {selectedSummaryRow ? (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.72rem" }}><tbody>
              {[
                ["ประเภท", selectedSummaryRow.payType === "monthly" ? "รายเดือน" : "รายวัน"],
                [selectedSummaryRow.baseSalaryLabel, formatMoney(selectedSummaryRow.baseSalary)],
                ["เงินเข้า บช", formatMoney(selectedSummaryRow.bankDeposit)],
                ["สอนแทน / ขับรถ-เวร", `${formatMoney(selectedSummaryRow.substitutePay)} / ${formatMoney(selectedSummaryRow.dutyOrDriverPay)}`],
                ["หักลา / หักรวม", `${formatMoney(selectedSummaryRow.leaveDeductions)} / ${formatMoney(selectedSummaryRow.deductions)}`],
                [selectedSummaryRow.additionalPayment > 0 ? "ต้องรับเพิ่ม" : "ยอดคืน", formatMoney(selectedSummaryRow.additionalPayment || selectedSummaryRow.refundAmount)],
              ].map(([label, value], index) => <tr key={label}><td style={{ padding: "0.29rem 0.55rem", color: "#475569", borderBottom: index < 5 ? "1px solid #e2e8f0" : "none" }}>{label}</td><td style={{ padding: "0.29rem 0.55rem", textAlign: "right", fontWeight: 800, color: index === 5 ? "#c2410c" : "#0f172a", borderBottom: index < 5 ? "1px solid #e2e8f0" : "none", whiteSpace: "nowrap" }}>{value}</td></tr>)}
            </tbody></table>
          ) : <div style={{ padding: "1rem", color: "#94a3b8", fontSize: "0.75rem" }}>ไม่มีข้อมูล</div>}
        </section>

        <section style={{ border: "1px solid #cbd5e1", background: "#fff", minWidth: 280 }}>
          <div style={{ padding: "0.42rem 0.65rem", background: "#fee2e2", borderBottom: "1px solid #fca5a5", fontSize: "0.78rem", fontWeight: 900 }}>สรุปการลา ({leaveSummaryRows.length} คน)</div>
          <div style={{ maxHeight: 176, overflowY: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.7rem" }}><tbody>
              {leaveSummaryRows.length === 0 ? <tr><td style={{ padding: "1rem", color: "#94a3b8", textAlign: "center" }}>ไม่มีการลาเดือนนี้</td></tr> : leaveSummaryRows.map(row => (
                <tr key={row.employee.id} title={`${row.types} • ${row.dates}`}>
                  <td style={{ padding: "0.38rem 0.55rem", borderBottom: "1px solid #e2e8f0" }}><div style={{ fontWeight: 800 }}>{row.employee.name}</div><div style={{ color: "#64748b", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 180 }}>{row.dates}</div></td>
                  <td style={{ padding: "0.38rem 0.55rem", borderBottom: "1px solid #e2e8f0", textAlign: "right", whiteSpace: "nowrap", fontWeight: 900, color: "#b91c1c" }}>{row.days.toFixed(1)} วัน{row.medicalDays > 0 ? " *" : ""}</td>
                </tr>
              ))}
            </tbody></table>
          </div>
        </section>

        <section style={{ border: "1px solid #cbd5e1", background: "#fff", minWidth: 360 }}>
          <div style={{ padding: "0.42rem 0.65rem", background: "#dcfce7", borderBottom: "1px solid #86efac", fontSize: "0.78rem", fontWeight: 900 }}>สรุปสอนแทน ({substituteSummaryRows.length} รายการ)</div>
          <div style={{ maxHeight: 176, overflowY: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.68rem" }}>
              <thead style={{ position: "sticky", top: 0 }}><tr>{["วันที่", "ผู้สอนแทน", "แทนครู", "คาบ", "เงิน"].map(label => <th key={label} style={{ padding: "0.3rem 0.4rem", background: "#f8fafc", borderBottom: "1px solid #cbd5e1", textAlign: label === "เงิน" ? "right" : "left", whiteSpace: "nowrap" }}>{label}</th>)}</tr></thead>
              <tbody>{substituteSummaryRows.length === 0 ? <tr><td colSpan="5" style={{ padding: "1rem", color: "#94a3b8", textAlign: "center" }}>ไม่มีการสอนแทนเดือนนี้</td></tr> : substituteSummaryRows.map((row, index) => (
                <tr key={`${row.date}-${row.substituteName}-${row.period}-${index}`}>
                  {[row.date, row.substituteName, row.absentName, row.period].map((value, cellIndex) => <td key={cellIndex} style={{ padding: "0.34rem 0.4rem", borderBottom: "1px solid #e2e8f0", whiteSpace: "nowrap" }}>{value}</td>)}
                  <td style={{ padding: "0.34rem 0.4rem", borderBottom: "1px solid #e2e8f0", textAlign: "right", fontWeight: 900, color: "#15803d", whiteSpace: "nowrap" }}>{formatMoney(row.amount)}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </section>
      </div>

      <div style={{ display: "grid", gap: "0.65rem" }}>
        {renderPayrollTable(monthlyTableRows, "ตารางเงินเดือนรายเดือน / บรรจุ")}
        {dailyTableRows.length > 0 && renderPayrollTable(dailyTableRows, "ตารางเงินเดือนรายวัน / ไม่บรรจุ", true)}
      </div>

      <div style={{ display: "none" }} aria-hidden="true">
      <PageHeader title="เงินเดือน" count={selectedEmployee ? 1 : 0} />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: "1rem", marginBottom: "1rem" }}>
        <StatCard stat={{ label: "คนที่มีข้อมูลเดือนนี้", value: summaryRows.length, icon: Users, color: "#2563eb", bg: "#eff6ff", trend: month }} />
        <StatCard stat={{ label: "เงินเข้า บช รวม", value: formatMoney(totalBankDeposit), icon: Building2, color: "#7c3aed", bg: "#f5f3ff", trend: "ยอดที่โอนเข้าก่อน" }} />
        <StatCard stat={{ label: "ยอดสุทธิหลังคำนวณ", value: formatMoney(totalPayout), icon: Calendar, color: "#059669", bg: "#ecfdf5", trend: `${totalAttendanceDays} วันทำงานรวม` }} />
        <StatCard stat={{ label: "ยอดคืนรวม", value: formatMoney(totalRefund), icon: DollarSign, color: "#d97706", bg: "#fff7ed", trend: "ยอดสุดท้าย" }} />
        <StatCard stat={{ label: "ต้องรับเพิ่มรวม", value: formatMoney(totalAdditionalPayment), icon: Plus, color: "#2563eb", bg: "#eff6ff", trend: "ยอดที่ต้องจ่ายเพิ่ม" }} />
      </div>

      <Card>
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: "12px", padding: "0.85rem", color: "#1d4ed8", fontSize: "0.85rem" }}>
            {loadingMonthData
              ? `กำลังซิงก์ข้อมูลลงเวลา เวรรถ และสอนแทนของเดือน ${month} จาก Supabase...`
              : monthDataError || `ซิงก์ข้อมูลเดือน ${month} แล้ว: ลงเวลา ${monthAttendance.length} รายการ, ใบลาที่อนุมัติ ${monthLeaves.length} รายการ`}
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "end", gap: "1rem", flexWrap: "wrap" }}>
            <div style={{ display: "flex", gap: "0.85rem", flexWrap: "wrap", alignItems: "end" }}>
              <Field label="เดือน">
                <input type="month" value={month} onChange={e => setMonth(e.target.value)} style={{ ...inputStyle, width: "auto" }} />
              </Field>
              <Field label="ค้นหาพนักงาน">
                <input value={employeeSearch} onChange={e => setEmployeeSearch(e.target.value)} placeholder="พิมพ์ชื่อหรือแผนก" style={{ ...inputStyle, minWidth: 220 }} />
              </Field>
              <Field label="เลือกพนักงาน">
                <select value={selectedEmployeeId} onChange={e => setSelectedPayrollEmployee(e.target.value)} style={{ ...selectStyle, minWidth: 260 }}>
                  {employeeOptions.map(emp => <option key={emp.id} value={emp.id}>{emp.name} — {emp.department || "ไม่ระบุแผนก"}</option>)}
                </select>
              </Field>
            </div>
            <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
              <button onClick={() => setMonthDataRefreshKey(key => key + 1)} disabled={loadingMonthData} title="ซิงก์ข้อมูลเดือนนี้ใหม่" style={{ ...btnSecondary, flex: "none", padding: "0.8rem 0.9rem", cursor: loadingMonthData ? "not-allowed" : "pointer" }}>
                <RefreshCw size={16} style={loadingMonthData ? { animation: "spin 1s linear infinite" } : undefined} />
              </button>
              <button onClick={exportExcel} style={{ ...btnSecondary, flex: "none", padding: "0.8rem 1rem" }}>
                <FileText size={16} /> สรุปออก Excel
              </button>
              <button onClick={handleSave} disabled={loadingConfig || loadingMonthData || Boolean(monthDataError) || saving} style={{ ...btnPrimary, flex: "none", padding: "0.8rem 1rem", background: saved ? "#16a34a" : "linear-gradient(135deg, #2563eb, #1d4ed8)", color: "#fff", cursor: loadingConfig || loadingMonthData || monthDataError || saving ? "not-allowed" : "pointer" }}>
                {saving ? <RefreshCw size={16} style={{ animation: "spin 1s linear infinite" }} /> : saved ? <CheckCircle size={16} /> : <Save size={16} />}
                {saving ? "กำลังคำนวณ..." : saved ? "คำนวณแล้ว" : "คำนวณเงินเดือนเดือนนี้"}
              </button>
              <button onClick={() => document.getElementById("payroll-detail")?.scrollIntoView({ behavior: "smooth", block: "start" })} style={{ ...btnSecondary, flex: "none", padding: "0.8rem 1rem" }}>
                <Search size={16} /> ดูรายละเอียดรายคน
              </button>
            </div>
          </div>
        </div>
      </Card>
      <div style={{ display: "grid", gap: "1rem", marginTop: "1rem" }}>
        {renderPayrollTable(monthlyTableRows, "ตารางเงินเดือนรายเดือน / บรรจุ")}
        {renderPayrollTable(dailyTableRows, "ตารางเงินเดือนรายวัน / ไม่บรรจุ", true)}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1rem", marginTop: "1rem" }}>
        <Card>
          <div style={{ fontSize: "1rem", fontWeight: 800, color: "#0f172a", marginBottom: "0.3rem" }}>ข้อมูลเงินเดือนรายคน</div>
          <div style={{ fontSize: "0.8rem", color: "#64748b", marginBottom: "0.9rem" }}>ค่าหลักดึงจากเมนูพนักงาน และแก้เฉพาะเดือนนี้ได้ด้านล่าง</div>
          {selectedEmployee && (
            <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "12px", padding: "0.9rem", display: "flex", flexDirection: "column", gap: "0.9rem" }}>
              <div>
                <div style={{ fontWeight: 800, color: "#0f172a", fontSize: "1rem" }}>{selectedEmployee.name}</div>
                <div style={{ fontSize: "0.78rem", color: "#64748b" }}>{selectedEmployee.department || "ไม่ระบุแผนก"}</div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                <Field label="ประเภทค่าจ้าง">
                  <select value={selectedEmployeeConfig.pay_type || "daily"} onChange={e => updateEmployeeSetting(selectedEmployee.id, "pay_type", e.target.value)} style={selectStyle}>
                    <option value="daily">รายวัน</option>
                    <option value="monthly">รายเดือน</option>
                  </select>
                </Field>
                <Field label={selectedEmployeeConfig.pay_type === "monthly" ? "รับจริง (ฐานเงินเดือนจริง)" : "อัตราค่าจ้างรายวัน"}>
                  <input type="number" min="0" step="0.01" value={selectedEmployeeConfig.daily_rate ?? ""} onChange={e => updateDailyRate(selectedEmployee.id, e.target.value)} placeholder="จำนวนเงิน" style={inputStyle} />
                </Field>
              </div>
              <Field label="ระดับครู">
                <select value={selectedEmployeeConfig.teacher_level || ""} onChange={e => updateEmployeeSetting(selectedEmployee.id, "teacher_level", e.target.value)} style={selectStyle}>
                  <option value="">-- เลือกระดับครู --</option>
                  {LEAVE_TEACHER_LEVELS.map(level => <option key={level} value={level}>ครู{level}</option>)}
                </select>
              </Field>
              {selectedEmployeeConfig.pay_type === "monthly" && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                  <Field label="เงินเดือนตาม PDF">
                    <input type="number" min="0" step="0.01" value={selectedEmployeeConfig.bank_gross_salary ?? 0} onChange={e => updateEmployeeSetting(selectedEmployee.id, "bank_gross_salary", e.target.value)} placeholder="ก่อนหัก 3%" style={inputStyle} />
                  </Field>
                  <Field label="เงินเข้า บช ตาม PDF">
                    <input type="number" min="0" step="0.01" value={selectedEmployeeConfig.bank_deposit ?? 0} onChange={e => updateEmployeeSetting(selectedEmployee.id, "bank_deposit", e.target.value)} placeholder="หลังหัก 3%" style={inputStyle} />
                  </Field>
                </div>
              )}
              <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: "10px", padding: "0.75rem", color: "#1d4ed8", fontSize: "0.82rem", fontWeight: 700 }}>
                ค่าสอนแทนคิดอัตโนมัติ: จินตคณิต {formatMoney(25)}, คาบปกติ {formatMoney(50)}, อนุบาลทั้งวัน {formatMoney(KINDERGARTEN_SUBSTITUTE_DAY_RATE)}
              </div>
              <div>
                <div style={{ fontSize: "0.8rem", fontWeight: 600, color: "#475569", marginBottom: "0.5rem" }}>ประเภทลาที่หักเงิน</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.45rem" }}>
                  {["ลาป่วย", "ลากิจ", "ลาพักร้อน", "ลาคลอด", "ลาบวช"].map(type => {
                    const checked = (selectedEmployeeConfig.leave_deduct_types || "").split(",").map(item => item.trim()).filter(Boolean).includes(type);
                    return (
                      <button
                        key={type}
                        onClick={() => toggleLeaveDeductType(selectedEmployee.id, type)}
                        style={{
                          border: `1px solid ${checked ? "#2563eb" : "#cbd5e1"}`,
                          background: checked ? "#eff6ff" : "#fff",
                          color: checked ? "#1d4ed8" : "#475569",
                          borderRadius: "999px",
                          padding: "0.35rem 0.65rem",
                          fontSize: "0.75rem",
                          fontWeight: 700,
                          cursor: "pointer",
                          fontFamily: "inherit",
                        }}
                      >
                        {type}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div style={{ borderTop: "1px solid #e2e8f0", paddingTop: "0.9rem" }}>
                <div style={{ fontSize: "0.8rem", fontWeight: 700, color: "#475569", marginBottom: "0.65rem" }}>แก้ยอดคำนวณเฉพาะเดือนนี้</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", marginBottom: "0.75rem" }}>
                  {DRIVER_EMPLOYEE_IDS.has(selectedEmployee.id) && (
                    <Field label={`จำนวนวันขับรถ (${formatMoney(DRIVER_DAY_RATE)}/วัน)`}>
                      <input type="number" min="0" step="1" value={selectedAdjustment.driver_days ?? 0} onChange={e => updatePayrollAdjustment(selectedEmployee.id, "driver_days", e.target.value)} placeholder="0" style={inputStyle} />
                    </Field>
                  )}
                  <Field label="แก้อัตราเงิน">
                    <input type="number" min="0" step="0.01" value={selectedAdjustment.override_rate ?? ""} onChange={e => updatePayrollAdjustment(selectedEmployee.id, "override_rate", e.target.value)} placeholder={String(selectedEmployeeConfig.daily_rate ?? 0)} style={inputStyle} />
                  </Field>
                  <Field label="แก้ค่าจ้างรวม">
                    <input type="number" min="0" step="0.01" value={selectedAdjustment.override_base_salary ?? ""} onChange={e => updatePayrollAdjustment(selectedEmployee.id, "override_base_salary", e.target.value)} placeholder={selectedSummaryRow ? selectedSummaryRow.baseSalary.toFixed(2) : "0"} style={inputStyle} />
                  </Field>
                  <Field label="แก้ค่าเวร">
                    <input type="number" min="0" step="0.01" value={selectedAdjustment.override_duty_pay ?? ""} onChange={e => updatePayrollAdjustment(selectedEmployee.id, "override_duty_pay", e.target.value)} placeholder={selectedSummaryRow ? selectedSummaryRow.dutyPay.toFixed(2) : "0"} style={inputStyle} />
                  </Field>
                  <Field label="แก้ค่าสอนแทน">
                    <input type="number" min="0" step="0.01" value={selectedAdjustment.override_substitute_pay ?? ""} onChange={e => updatePayrollAdjustment(selectedEmployee.id, "override_substitute_pay", e.target.value)} placeholder={selectedSummaryRow ? selectedSummaryRow.substitutePay.toFixed(2) : "0"} style={inputStyle} />
                  </Field>
                  <Field label="แก้ยอดหักลา">
                    <input type="number" min="0" step="0.01" value={selectedAdjustment.override_leave_deductions ?? ""} onChange={e => updatePayrollAdjustment(selectedEmployee.id, "override_leave_deductions", e.target.value)} placeholder={selectedSummaryRow ? selectedSummaryRow.leaveDeductions.toFixed(2) : "0"} style={inputStyle} />
                  </Field>
                  {selectedSummaryRow?.payType === "monthly" && (
                    <Field label="แก้เงินเดือน PDF">
                      <input type="number" min="0" step="0.01" value={selectedAdjustment.override_bank_gross_salary ?? ""} onChange={e => updatePayrollAdjustment(selectedEmployee.id, "override_bank_gross_salary", e.target.value)} placeholder={selectedSummaryRow ? selectedSummaryRow.bankGrossSalary.toFixed(2) : "0"} style={inputStyle} />
                    </Field>
                  )}
                  <Field label="แก้เงินเข้า บช">
                    <input type="number" min="0" step="0.01" value={selectedAdjustment.override_bank_deposit ?? ""} onChange={e => updatePayrollAdjustment(selectedEmployee.id, "override_bank_deposit", e.target.value)} placeholder={selectedSummaryRow ? selectedSummaryRow.bankDeposit.toFixed(2) : "0"} style={inputStyle} />
                  </Field>
                </div>
                <div style={{ fontSize: "0.8rem", fontWeight: 700, color: "#475569", marginBottom: "0.65rem" }}>รายการปรับเพิ่ม/หักเพิ่ม</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", marginBottom: "0.75rem" }}>
                  <Field label="ปรับเพิ่ม">
                    <input type="number" min="0" step="0.01" value={selectedAdjustment.adjustment_add ?? 0} onChange={e => updatePayrollAdjustment(selectedEmployee.id, "adjustment_add", e.target.value)} style={inputStyle} />
                  </Field>
                  <Field label="หักเพิ่ม">
                    <input type="number" min="0" step="0.01" value={selectedAdjustment.adjustment_deduct ?? 0} onChange={e => updatePayrollAdjustment(selectedEmployee.id, "adjustment_deduct", e.target.value)} style={inputStyle} />
                  </Field>
                </div>
                <Field label="หมายเหตุ">
                  <input value={selectedAdjustment.adjustment_note ?? ""} onChange={e => updatePayrollAdjustment(selectedEmployee.id, "adjustment_note", e.target.value)} placeholder="เช่น ค่าเดินทาง, หักเงินยืม, โบนัสพิเศษ" style={inputStyle} />
                </Field>
              </div>
            </div>
          )}
        </Card>
        <Card>
          <div style={{ fontSize: "1rem", fontWeight: 800, color: "#0f172a", marginBottom: "0.3rem" }}>ตั้งค่าอัตราเวรที่คิดเงิน</div>
          <div style={{ fontSize: "0.8rem", color: "#64748b", marginBottom: "0.9rem" }}>แสดงเฉพาะเวรที่มีผลกับเงินเดือน</div>
          {loadingConfig && <div style={{ color: "#64748b", fontSize: "0.8rem", marginBottom: "0.75rem" }}>กำลังโหลดค่าจาก Supabase...</div>}
          <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
            {PAID_DUTY_OPTIONS.map(dutyName => (
              <Field key={dutyName} label={dutyName}>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={config.dutyRates[dutyName] ?? 0}
                  onChange={e => updateDutyRate(dutyName, e.target.value)}
                  style={inputStyle}
                />
              </Field>
            ))}
          </div>
        </Card>
        <Card>
          <div style={{ fontSize: "1rem", fontWeight: 800, color: "#0f172a", marginBottom: "0.3rem" }}>สรุปของคนที่เลือก</div>
          <div style={{ fontSize: "0.8rem", color: "#64748b", marginBottom: "0.9rem" }}>ดึงจากข้อมูลลงเวลา ลา และเวรของเดือนนี้อัตโนมัติ</div>
          {!selectedSummaryRow ? (
            <div style={{ color: "#94a3b8", fontSize: "0.84rem" }}>ยังไม่มีข้อมูลของพนักงานคนนี้</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "0.75rem" }}>
                <div style={{ background: "#eff6ff", borderRadius: "12px", padding: "0.85rem" }}>
                  <div style={{ fontSize: "0.72rem", color: "#1d4ed8", fontWeight: 700 }}>มาทำงาน</div>
                  <div style={{ fontSize: "1.25rem", color: "#0f172a", fontWeight: 800 }}>{selectedSummaryRow.attendanceDays} วัน</div>
                </div>
                <div style={{ background: "#f5f3ff", borderRadius: "12px", padding: "0.85rem" }}>
                  <div style={{ fontSize: "0.72rem", color: "#7c3aed", fontWeight: 700 }}>ยอดคืน</div>
                  <div style={{ fontSize: "1.25rem", color: "#0f172a", fontWeight: 800 }}>{formatMoney(selectedSummaryRow.refundAmount)}</div>
                </div>
                <div style={{ background: "#eff6ff", borderRadius: "12px", padding: "0.85rem" }}>
                  <div style={{ fontSize: "0.72rem", color: "#1d4ed8", fontWeight: 700 }}>ต้องรับเพิ่ม</div>
                  <div style={{ fontSize: "1.25rem", color: "#0f172a", fontWeight: 800 }}>{formatMoney(selectedSummaryRow.additionalPayment)}</div>
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "0.75rem" }}>
                <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "12px", padding: "0.8rem" }}>
                  <div style={{ fontSize: "0.75rem", color: "#64748b", marginBottom: "0.2rem" }}>{selectedSummaryRow.baseSalaryLabel}</div>
                  <div style={{ fontWeight: 800, color: "#16a34a" }}>{formatMoney(selectedSummaryRow.baseSalary)}</div>
                </div>
                <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "12px", padding: "0.8rem" }}>
                  <div style={{ fontSize: "0.75rem", color: "#64748b", marginBottom: "0.2rem" }}>ขับรถ/เวร</div>
                  <div style={{ fontWeight: 800, color: "#7c3aed" }}>{formatMoney(selectedSummaryRow.dutyOrDriverPay)}</div>
                </div>
                <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "12px", padding: "0.8rem" }}>
                  <div style={{ fontSize: "0.75rem", color: "#64748b", marginBottom: "0.2rem" }}>สอนแทน</div>
                  <div style={{ fontWeight: 800, color: "#2563eb" }}>{selectedSummaryRow.substituteCount} คาบ / {formatMoney(selectedSummaryRow.substitutePay)}</div>
                </div>
                {selectedSummaryRow.payType === "monthly" && (
                  <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "12px", padding: "0.8rem" }}>
                    <div style={{ fontSize: "0.75rem", color: "#64748b", marginBottom: "0.2rem" }}>เงินเดือนตาม PDF</div>
                    <div style={{ fontWeight: 800, color: "#0f172a" }}>{formatMoney(selectedSummaryRow.bankGrossSalary)}</div>
                  </div>
                )}
                <div style={{ background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: "12px", padding: "0.8rem" }}>
                  <div style={{ fontSize: "0.75rem", color: "#9a3412", marginBottom: "0.2rem" }}>เงินเข้า บช</div>
                  <div style={{ fontWeight: 800, color: "#c2410c" }}>{formatMoney(selectedSummaryRow.bankDeposit)}</div>
                </div>
                <div style={{ background: "#ecfdf5", border: "1px solid #bbf7d0", borderRadius: "12px", padding: "0.8rem" }}>
                  <div style={{ fontSize: "0.75rem", color: "#166534", marginBottom: "0.2rem" }}>รวมเข้า บช หลังคำนวณ</div>
                  <div style={{ fontWeight: 800, color: "#15803d" }}>{formatMoney(selectedSummaryRow.realSalary)}</div>
                </div>
              </div>
              <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "12px", padding: "0.85rem", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "0.75rem" }}>
                <div>
                  <div style={{ fontSize: "0.72rem", color: "#64748b", fontWeight: 700 }}>ยอดก่อนหัก</div>
                  <div style={{ color: "#0f172a", fontWeight: 800 }}>{formatMoney(selectedSummaryRow.grossPay)}</div>
                </div>
                <div>
                  <div style={{ fontSize: "0.72rem", color: "#64748b", fontWeight: 700 }}>ปรับเพิ่ม</div>
                  <div style={{ color: "#16a34a", fontWeight: 800 }}>{formatMoney(selectedSummaryRow.adjustmentAdd)}</div>
                </div>
                <div>
                  <div style={{ fontSize: "0.72rem", color: "#64748b", fontWeight: 700 }}>หักเพิ่ม</div>
                  <div style={{ color: "#dc2626", fontWeight: 800 }}>{formatMoney(selectedSummaryRow.adjustmentDeduct)}</div>
                </div>
                <div>
                  <div style={{ fontSize: "0.72rem", color: "#64748b", fontWeight: 700 }}>หัก 3% ตาม PDF</div>
                  <div style={{ color: "#dc2626", fontWeight: 800 }}>{formatMoney(selectedSummaryRow.monthlyRecurringDeduction)}</div>
                </div>
              </div>
              <div style={{ background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: "12px", padding: "0.85rem" }}>
                <div style={{ fontSize: "0.78rem", color: "#9a3412", fontWeight: 700, marginBottom: "0.4rem" }}>สรุปเวรของคนนี้</div>
                {selectedDutySummary.length === 0 ? (
                  <div style={{ fontSize: "0.8rem", color: "#9a3412" }}>ยังไม่มีเวรที่จ่ายเพิ่มในเดือนนี้</div>
                ) : (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "0.45rem" }}>
                    {selectedDutySummary.map(dutyName => (
                      <span key={dutyName} style={{ background: "#fff", color: "#9a3412", border: "1px solid #fdba74", borderRadius: "999px", padding: "0.28rem 0.55rem", fontSize: "0.74rem", fontWeight: 700 }}>
                        {dutyName} {selectedSummaryRow.dutyCounts[dutyName]} วัน
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "12px", padding: "0.85rem" }}>
                <div style={{ fontSize: "0.78rem", color: "#b91c1c", fontWeight: 700, marginBottom: "0.25rem" }}>หักลาและขาดงาน</div>
                <div style={{ fontSize: "0.82rem", color: "#7f1d1d" }}>
                  ลาที่หักเงิน {selectedSummaryRow.leaveDeductDays.toFixed(1)} วัน ({formatMoney(selectedSummaryRow.leaveDeductions)})
                  {selectedSummaryRow.medicalLeaveDays > 0 ? `, มีใบนัดหมอ ${selectedSummaryRow.medicalLeaveDays.toFixed(1)} วัน ไม่หักเงิน` : ""}
                  {`, ขาดงาน ${selectedSummaryRow.absentDays.toFixed(1)} วัน`}
                </div>
              </div>
            </div>
          )}
        </Card>
      </div>
      <div style={{ marginTop: "1rem" }}>
        <Card padding="0">
          <div style={{ padding: "1rem 1.25rem", borderBottom: "1px solid #f1f5f9", display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: "1rem", fontWeight: 800, color: "#0f172a" }}>ข้อมูลเงินเดือนที่บันทึกไว้แล้ว</div>
              <div style={{ fontSize: "0.8rem", color: "#64748b" }}>แสดงตามสูตรปัจจุบัน เทียบกับ snapshot เดือน {month}</div>
            </div>
            <div style={{ background: "#eff6ff", borderRadius: "999px", padding: "0.35rem 0.8rem", color: "#1d4ed8", fontWeight: 700, fontSize: "0.8rem" }}>
              {selectedEmployee?.name || "ยังไม่ได้เลือกพนักงาน"}
            </div>
          </div>
          <div style={{ padding: "1rem 1.25rem" }}>
            {!selectedSavedPayroll ? (
              <div style={{ color: "#94a3b8", fontSize: "0.84rem" }}>ยังไม่มี snapshot ที่บันทึกไว้ของพนักงานคนนี้ในเดือน {month}</div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "0.75rem" }}>
                {[
                  ["มาทำงาน", `${payrollSnapshotDisplay.workDays} วัน`],
                  ["มาสาย", `${payrollSnapshotDisplay.lateCount} ครั้ง`],
                  ["เวร", `${payrollSnapshotDisplay.dutyCount} ครั้ง`],
                  ["หักลา", `${Number(payrollSnapshotDisplay.leaveDeductDays).toFixed(1)} วัน`],
                  ["หักเงิน", formatMoney(payrollSnapshotDisplay.deductions)],
                  ["หัก 3% ตาม PDF", formatMoney(parsePayrollNote(selectedSavedPayroll.note).monthly_recurring_deduction || 0)],
                  ["เงินเข้า บช", formatMoney(payrollSnapshotDisplay.bankDeposit)],
                  ["รวมเข้า บช", formatMoney(payrollSnapshotDisplay.realSalary)],
                  ["ยอดคืน", formatMoney(payrollSnapshotDisplay.total)],
                  ["ต้องรับเพิ่ม", formatMoney(payrollSnapshotDisplay.additionalPayment || 0)],
                ].map(([label, value]) => (
                  <div key={label} style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "12px", padding: "0.8rem" }}>
                    <div style={{ fontSize: "0.74rem", color: "#64748b", marginBottom: "0.2rem" }}>{label}</div>
                    <div style={{ fontWeight: 800, color: "#0f172a" }}>{value}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>
      </div>
      <div id="payroll-detail" style={{ marginTop: "1rem" }}>
        <Card padding="0">
          <div style={{ padding: "1rem 1.25rem", borderBottom: "1px solid #f1f5f9", display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: "1rem", fontWeight: 800, color: "#0f172a" }}>รายการที่ใช้คิดเงินเดือน</div>
              <div style={{ fontSize: "0.8rem", color: "#64748b" }}>ดูรายการบวกและรายการหักของพนักงานคนนี้ในบล็อกเดียว</div>
            </div>
            <div style={{ background: "#fff7ed", borderRadius: "999px", padding: "0.35rem 0.8rem", color: "#d97706", fontWeight: 700, fontSize: "0.8rem" }}>
              {selectedSummaryRow
                ? (selectedSummaryRow.additionalPayment > 0
                  ? `ต้องรับเพิ่ม ${formatMoney(selectedSummaryRow.additionalPayment)}`
                  : `ยอดคืน ${formatMoney(selectedSummaryRow.refundAmount)}`)
                : `ยอดคืนรวม ${formatMoney(totalRefund)}`}
            </div>
          </div>
          <div style={{ padding: "1rem 1.25rem" }}>
            {!selectedSummaryRow ? (
              <div style={{ color: "#94a3b8", fontSize: "0.84rem" }}>ยังไม่มีข้อมูลสำหรับเดือนนี้</div>
            ) : (
              <div style={{ display: "grid", gap: "0.75rem" }}>
                {[
                  { label: selectedSummaryRow.baseSalaryLabel, detail: selectedSummaryRow.baseSalaryDetail, value: formatMoney(selectedSummaryRow.baseSalary), color: "#16a34a" },
                  {
                    label: "ขับรถ/เวร",
                    detail: selectedSummaryRow.driverDays > 0
                      ? `${selectedSummaryRow.driverDays} วัน x ${formatMoney(DRIVER_DAY_RATE)}`
                      : (selectedDutySummary.length > 0 ? selectedDutySummary.map(dutyName => `${dutyName} ${selectedSummaryRow.dutyCounts[dutyName]} วัน`).join(", ") : "ไม่มีเวรที่จ่ายเพิ่ม"),
                    value: formatMoney(selectedSummaryRow.dutyOrDriverPay),
                    color: "#7c3aed",
                  },
                  { label: "สอนแทน", detail: `${selectedSummaryRow.substituteCount} คาบ`, value: formatMoney(selectedSummaryRow.substitutePay), color: "#2563eb" },
                  { label: "ปรับเพิ่ม", detail: selectedSummaryRow.adjustmentNote || "รายการพิเศษ", value: formatMoney(selectedSummaryRow.adjustmentAdd), color: "#16a34a" },
                  { label: "หักลา", detail: selectedSummaryRow.payType === "daily" ? `ลา ${selectedSummaryRow.recordedLeaveDays.toFixed(1)} วัน ไม่ได้ค่าจ้างวันนั้นและไม่หักซ้ำ` : `${selectedSummaryRow.leaveDeductDays.toFixed(1)} วัน x ${formatMoney(MONTHLY_LEAVE_DEDUCT_RATE)}${selectedSummaryRow.medicalLeaveDays > 0 ? `, ใบนัดหมอ ${selectedSummaryRow.medicalLeaveDays.toFixed(1)} วันไม่หัก` : ""}`, value: `- ${formatMoney(selectedSummaryRow.leaveDeductions)}`, color: "#dc2626" },
                  { label: "หัก 3% ตาม PDF", detail: selectedSummaryRow.payType === "monthly" ? `${formatMoney(selectedSummaryRow.bankGrossSalary)} - ${formatMoney(selectedSummaryRow.bankDeposit)}` : "เฉพาะรายเดือน", value: `- ${formatMoney(selectedSummaryRow.monthlyRecurringDeduction)}`, color: "#dc2626" },
                  { label: "หักเพิ่ม", detail: selectedSummaryRow.adjustmentNote || "รายการพิเศษ", value: `- ${formatMoney(selectedSummaryRow.adjustmentDeduct)}`, color: "#dc2626" },
                  { label: "รวมเข้า บช หลังคำนวณ", detail: selectedSummaryRow.payType === "daily" ? "ค่าจ้างรายวัน + เวรรถ + สอนแทน + ค่าขับรถ" : "รับจริง - หัก 3% - หักลา + เวรรถ + สอนแทน + ค่าขับรถ", value: formatMoney(selectedSummaryRow.realSalary), color: "#15803d" },
                  { label: "เงินเข้า บช ตาม PDF", detail: "ยอดที่หัก 3% มาแล้ว", value: formatMoney(selectedSummaryRow.bankDeposit), color: "#c2410c" },
                ].filter(Boolean).map(item => (
                  <div key={item.label} style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: "0.75rem", alignItems: "center", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "12px", padding: "0.85rem 1rem" }}>
                    <div>
                      <div style={{ fontSize: "0.82rem", fontWeight: 700, color: "#0f172a" }}>{item.label}</div>
                      <div style={{ fontSize: "0.76rem", color: "#64748b", marginTop: "0.18rem" }}>{item.detail}</div>
                    </div>
                    <div style={{ fontSize: "0.95rem", fontWeight: 800, color: item.color, whiteSpace: "nowrap" }}>{item.value}</div>
                  </div>
                ))}
                <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: "0.75rem", alignItems: "center", background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: "12px", padding: "0.95rem 1rem" }}>
                  <div>
                    <div style={{ fontSize: "0.84rem", fontWeight: 800, color: "#9a3412" }}>ยอดคืน</div>
                    <div style={{ fontSize: "0.76rem", color: "#b45309", marginTop: "0.18rem" }}>MAX(0, เงินเข้า บช ตาม PDF - รวมเข้า บช หลังคำนวณ)</div>
                  </div>
                  <div style={{ fontSize: "1.05rem", fontWeight: 900, color: "#d97706", whiteSpace: "nowrap" }}>{formatMoney(selectedSummaryRow.refundAmount)}</div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: "0.75rem", alignItems: "center", background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: "12px", padding: "0.95rem 1rem" }}>
                  <div>
                    <div style={{ fontSize: "0.84rem", fontWeight: 800, color: "#1d4ed8" }}>ต้องรับเพิ่ม</div>
                    <div style={{ fontSize: "0.76rem", color: "#2563eb", marginTop: "0.18rem" }}>MAX(0, รวมเข้า บช หลังคำนวณ - เงินเข้า บช ตาม PDF)</div>
                  </div>
                  <div style={{ fontSize: "1.05rem", fontWeight: 900, color: "#2563eb", whiteSpace: "nowrap" }}>{formatMoney(selectedSummaryRow.additionalPayment)}</div>
                </div>
              </div>
            )}
          </div>
        </Card>
      </div>
      </div>
    </div>
  );
}

function SettingsPage({ settings, onRefresh }) {
  const [form, setForm] = useState({
    work_start: settings?.work_start?.slice(0, 5) || "08:00",
    work_end: settings?.work_end?.slice(0, 5) || "16:30",
    late_grace_minutes: settings?.late_grace_minutes || 0,
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    const { error } = await supabase.from("settings").update({ ...form, updated_at: new Date().toISOString() }).eq("id", 1);
    setSaving(false);
    if (!error) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      onRefresh();
    }
  };

  return (
    <div>
      <PageHeader title="ตั้งค่าเวลาทำงาน" />
      <Card>
        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem", maxWidth: 500 }}>
          <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: "10px", padding: "0.75rem", fontSize: "0.85rem", color: "#1d4ed8" }}>
            ⏰ ระบบจะคำนวณ "มาสาย" และ "กลับก่อน" ตามเวลาที่ตั้งนี้
          </div>

          <Field label="เวลาเข้างาน">
            <input type="time" value={form.work_start} onChange={e => setForm(f => ({ ...f, work_start: e.target.value }))} style={inputStyle} />
          </Field>

          <Field label="เวลาเลิกงาน">
            <input type="time" value={form.work_end} onChange={e => setForm(f => ({ ...f, work_end: e.target.value }))} style={inputStyle} />
          </Field>

          <Field label="ผ่อนผันการมาสาย (นาที)">
            <input type="number" min="0" max="60" value={form.late_grace_minutes} onChange={e => setForm(f => ({ ...f, late_grace_minutes: parseInt(e.target.value) || 0 }))} style={inputStyle} />
            <div style={{ fontSize: "0.72rem", color: "#94a3b8", marginTop: "0.25rem" }}>เช่น 5 นาที = มาสายไม่เกิน 5 นาทียังถือว่าตรงเวลา</div>
          </Field>

          <button onClick={handleSave} disabled={saving} style={{ padding: "0.85rem", borderRadius: "10px", border: "none", background: saved ? "#16a34a" : "linear-gradient(135deg, #2563eb, #1d4ed8)", color: "#fff", fontWeight: 700, fontSize: "0.95rem", cursor: saving ? "not-allowed" : "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem" }}>
            {saving ? <RefreshCw size={18} style={{ animation: "spin 1s linear infinite" }} /> : saved ? <CheckCircle size={18} /> : <Save size={18} />}
            {saving ? "กำลังบันทึก..." : saved ? "บันทึกแล้ว!" : "บันทึกการตั้งค่า"}
          </button>
        </div>
      </Card>
    </div>
  );
}

function FinancePortal({ employees, attendance, leaves, settings }) {
  const [tab, setTab] = useState("overview");
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [payrollRows, setPayrollRows] = useState([]);
  const [loadingPayroll, setLoadingPayroll] = useState(false);
  const [financeInfo, setFinanceInfo] = useState(() => Object.fromEntries(FINANCE_INFO_FIELDS.map(field => [field.key, 0])));
  const [financeInfoRowId, setFinanceInfoRowId] = useState(null);
  const [savingFinanceInfo, setSavingFinanceInfo] = useState(false);
  const [financeInfoSaved, setFinanceInfoSaved] = useState(false);
  const [expenseRows, setExpenseRows] = useState([
    { id: "electric", type: "expense", name: "ค่าไฟ", amount: 0 },
    { id: "water", type: "expense", name: "ค่าน้ำ", amount: 0 },
    { id: "internet", type: "expense", name: "ค่าอินเทอร์เน็ต", amount: 0 },
    { id: "supplies", type: "expense", name: "ค่าอุปกรณ์/ซ่อมบำรุง", amount: 0 },
    { id: "tuition", type: "income", name: "รายรับค่าเทอม/รายรับอื่น", amount: 0 },
  ]);

  useEffect(() => {
    let active = true;
    setLoadingPayroll(true);
    supabase
      .from("payroll")
      .select("*, employees(name, department)")
      .eq("month", month)
      .order("total", { ascending: false })
      .then(({ data }) => {
        if (active) {
          const rows = data || [];
          const infoRow = rows.find(row => {
            try { return JSON.parse(row.note || "{}").record_type === "finance_info"; } catch { return false; }
          }) || null;
          const emptyInfo = Object.fromEntries(FINANCE_INFO_FIELDS.map(field => [field.key, 0]));
          let values = emptyInfo;
          if (infoRow) {
            try {
              values = { ...emptyInfo, ...(JSON.parse(infoRow.note || "{}").values || {}) };
            } catch {}
          }
          setFinanceInfo(values);
          setFinanceInfoRowId(infoRow?.id || null);
          setFinanceInfoSaved(false);
          setPayrollRows(rows.filter(row => row.employee_id));
          setLoadingPayroll(false);
        }
      });
    return () => { active = false; };
  }, [month]);

  const payrollRealSalaryTotal = payrollRows.reduce((sum, row) => sum + (parsePayrollNote(row.note).real_salary || parseMoney(row.total)), 0);
  const payrollRefundTotal = payrollRows.reduce((sum, row) => sum + parseMoney(row.total), 0);
  const incomeTotal = expenseRows.filter(row => row.type === "income").reduce((sum, row) => sum + parseMoney(row.amount), 0);
  const manualExpenseTotal = expenseRows.filter(row => row.type === "expense").reduce((sum, row) => sum + parseMoney(row.amount), 0);
  const totalExpense = payrollRealSalaryTotal + manualExpenseTotal;
  const netTotal = incomeTotal - totalExpense;

  const updateFinanceRow = (id, key, value) => {
    setExpenseRows(rows => rows.map(row => row.id === id ? { ...row, [key]: value } : row));
  };

  const addFinanceRow = (type) => {
    setExpenseRows(rows => [...rows, { id: `${type}-${Date.now()}`, type, name: "", amount: 0 }]);
  };

  const saveFinanceInfo = async () => {
    setSavingFinanceInfo(true);
    setFinanceInfoSaved(false);
    const payload = {
      employee_id: null,
      month,
      work_days: 0,
      absent_days: 0,
      late_count: 0,
      duty_count: 0,
      substitute_count: 0,
      overtime_hours: 0,
      leave_deduct_days: 0,
      base_salary: 0,
      duty_pay: 0,
      substitute_pay: 0,
      overtime_pay: 0,
      deductions: 0,
      total: 0,
      note: JSON.stringify({
        record_type: "finance_info",
        values: Object.fromEntries(FINANCE_INFO_FIELDS.map(field => [field.key, parseMoney(financeInfo[field.key])])),
      }),
    };
    const result = financeInfoRowId
      ? await supabase.from("payroll").update(payload).eq("id", financeInfoRowId).select("id").single()
      : await supabase.from("payroll").insert(payload).select("id").single();
    if (!result.error) {
      setFinanceInfoRowId(result.data?.id || financeInfoRowId);
      setFinanceInfoSaved(true);
    }
    setSavingFinanceInfo(false);
  };

  const tabs = [
    { key: "overview", label: "ภาพรวมการเงิน" },
    { key: "payroll", label: "คิดเงินเดือน" },
    { key: "calculator", label: "รายรับรายจ่าย" },
  ];

  return (
    <div>
      <PageHeader title="เว็บการเงินโรงเรียน" count={payrollRows.length} />

      <Card>
        <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: "1.05rem", fontWeight: 800, color: "#0f172a" }}>ศูนย์รวมเงินเดือนและค่าใช้จ่าย</div>
            <div style={{ fontSize: "0.82rem", color: "#64748b", marginTop: "0.2rem" }}>ใช้ฐานข้อมูล Supabase ชุดเดียวกับ HR ไม่ต้องเข้าสู่ระบบใหม่</div>
          </div>
          <div style={{ width: 180 }}>
            <Field label="เดือน">
              <input type="month" value={month} onChange={e => setMonth(e.target.value)} style={inputStyle} />
            </Field>
          </div>
        </div>
      </Card>

      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", margin: "1rem 0" }}>
        {tabs.map(item => (
          <button
            key={item.key}
            onClick={() => setTab(item.key)}
            style={{
              border: `1.5px solid ${tab === item.key ? "#2563eb" : "#e2e8f0"}`,
              background: tab === item.key ? "#eff6ff" : "#fff",
              color: tab === item.key ? "#1d4ed8" : "#475569",
              borderRadius: "10px",
              padding: "0.65rem 0.9rem",
              fontWeight: 800,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: "1rem", marginBottom: "1rem" }}>
            <StatCard stat={{ label: "ยอดสุทธิหลังคำนวณ", value: loadingPayroll ? "..." : formatMoney(payrollRealSalaryTotal), icon: DollarSign, color: "#2563eb", bg: "#eff6ff", trend: month }} />
            <StatCard stat={{ label: "ค่าใช้จ่ายอื่น", value: formatMoney(manualExpenseTotal), icon: FileText, color: "#dc2626", bg: "#fef2f2", trend: "ค่าไฟ ค่าน้ำ และอื่นๆ" }} />
            <StatCard stat={{ label: "รายรับรวม", value: formatMoney(incomeTotal), icon: TrendingUp, color: "#16a34a", bg: "#ecfdf5", trend: "กรอกในเครื่องคิด" }} />
            <StatCard stat={{ label: "ยอดคืนรวม", value: formatMoney(payrollRefundTotal), icon: Building2, color: "#d97706", bg: "#fff7ed", trend: "จาก payroll" }} />
          </div>

          <Card padding="0">
            <div style={{ padding: "1rem 1.25rem", borderBottom: "1px solid #f1f5f9" }}>
              <div style={{ fontSize: "1rem", fontWeight: 800, color: "#0f172a" }}>เงินเดือนที่บันทึกแล้วในเดือนนี้</div>
              <div style={{ fontSize: "0.8rem", color: "#64748b" }}>ดึงจากตาราง payroll โดยตรง</div>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.86rem" }}>
                <thead>
                  <tr style={{ borderBottom: "2px solid #f1f5f9" }}>
                    {["ชื่อ", "แผนก", "มาทำงาน", "เวร", "สอนแทน", "หักรวม", "รวมเข้า บช", "ยอดคืน"].map(h => (
                      <th key={h} style={{ padding: "0.7rem 0.9rem", textAlign: "left", color: "#64748b", fontSize: "0.75rem", whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {payrollRows.length === 0 ? (
                    <tr><td colSpan="8" style={{ padding: "1.25rem", color: "#94a3b8", textAlign: "center" }}>ยังไม่มีข้อมูล payroll ของเดือนนี้ ให้ไปแท็บคิดเงินเดือนแล้วกดคำนวณก่อน</td></tr>
                  ) : payrollRows.map(row => {
                    const note = parsePayrollNote(row.note);
                    const realSalary = note.real_salary || parseMoney(row.total);
                    return (
                      <tr key={row.id} style={{ borderBottom: "1px solid #f8fafc" }}>
                        <td style={{ padding: "0.75rem 0.9rem", fontWeight: 800, color: "#0f172a" }}>{row.employees?.name || "-"}</td>
                        <td style={{ padding: "0.75rem 0.9rem", color: "#64748b" }}>{row.employees?.department || "-"}</td>
                        <td style={{ padding: "0.75rem 0.9rem" }}>{row.work_days || 0} วัน</td>
                        <td style={{ padding: "0.75rem 0.9rem" }}>{row.duty_count || 0} วัน</td>
                        <td style={{ padding: "0.75rem 0.9rem" }}>{row.substitute_count || 0} คาบ</td>
                        <td style={{ padding: "0.75rem 0.9rem", color: "#dc2626", fontWeight: 700 }}>{formatMoney(row.deductions)}</td>
                        <td style={{ padding: "0.75rem 0.9rem", color: "#16a34a", fontWeight: 900 }}>{formatMoney(realSalary)}</td>
                        <td style={{ padding: "0.75rem 0.9rem", color: "#d97706", fontWeight: 900 }}>{formatMoney(row.total)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}

      {tab === "payroll" && <PayrollPage employees={employees} attendance={attendance} leaves={leaves} settings={settings} />}

      {tab === "calculator" && (
        <Card>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem", flexWrap: "wrap", marginBottom: "1rem" }}>
            <div>
              <div style={{ fontSize: "1rem", fontWeight: 800, color: "#0f172a" }}>เครื่องคิดรายรับรายจ่ายโรงเรียน</div>
              <div style={{ fontSize: "0.8rem", color: "#64748b" }}>ใช้รวมกับเงินเดือนที่บันทึกใน Supabase เดือน {month}</div>
            </div>
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
              <button onClick={() => addFinanceRow("income")} style={{ ...btnSecondary, flex: "none" }}><Plus size={16} /> เพิ่มรายรับ</button>
              <button onClick={() => addFinanceRow("expense")} style={{ ...btnSecondary, flex: "none" }}><Plus size={16} /> เพิ่มรายจ่าย</button>
            </div>
          </div>
          <div style={{ display: "grid", gap: "0.75rem" }}>
            {expenseRows.map(row => (
              <div key={row.id} style={{ display: "grid", gridTemplateColumns: "130px minmax(180px, 1fr) minmax(150px, 220px)", gap: "0.75rem", alignItems: "center" }}>
                <select value={row.type} onChange={e => updateFinanceRow(row.id, "type", e.target.value)} style={selectStyle}>
                  <option value="income">รายรับ</option>
                  <option value="expense">รายจ่าย</option>
                </select>
                <input value={row.name} onChange={e => updateFinanceRow(row.id, "name", e.target.value)} placeholder="ชื่อรายการ" style={inputStyle} />
                <input type="number" min="0" step="0.01" value={row.amount} onChange={e => updateFinanceRow(row.id, "amount", e.target.value)} placeholder="จำนวนเงิน" style={inputStyle} />
              </div>
            ))}
          </div>
          <div style={{ marginTop: "1rem", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "0.75rem" }}>
            <div style={{ background: "#ecfdf5", border: "1px solid #bbf7d0", borderRadius: "10px", padding: "0.9rem" }}><div style={{ color: "#166534", fontWeight: 700, fontSize: "0.78rem" }}>รายรับ</div><div style={{ color: "#14532d", fontWeight: 900, fontSize: "1.2rem" }}>{formatMoney(incomeTotal)}</div></div>
            <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "10px", padding: "0.9rem" }}><div style={{ color: "#b91c1c", fontWeight: 700, fontSize: "0.78rem" }}>รายจ่ายรวมเงินเดือน</div><div style={{ color: "#7f1d1d", fontWeight: 900, fontSize: "1.2rem" }}>{formatMoney(totalExpense)}</div></div>
            <div style={{ background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: "10px", padding: "0.9rem" }}><div style={{ color: "#c2410c", fontWeight: 700, fontSize: "0.78rem" }}>คงเหลือ</div><div style={{ color: "#9a3412", fontWeight: 900, fontSize: "1.2rem" }}>{formatMoney(netTotal)}</div></div>
          </div>
        </Card>
      )}
    </div>
  );
}

function PayrollStandaloneApp({ employees, attendance, leaves, settings, currentUser, onBack, onLogout }) {
  return (
    <div style={{ fontFamily: "'Sarabun', 'Noto Sans Thai', sans-serif", background: "#f8fafc", minHeight: "100vh" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Sarabun:wght@300;400;500;600;700;800&display=swap'); * { box-sizing: border-box; margin: 0; padding: 0; } @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      <header style={{ position: "sticky", top: 0, zIndex: 100, background: "#fff", borderBottom: "1px solid #e2e8f0", height: 64, display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem", padding: "0 1rem", boxShadow: "0 1px 8px rgba(0,0,0,0.06)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", minWidth: 0 }}>
          <div style={{ width: 38, height: 38, borderRadius: "12px", background: "linear-gradient(135deg, #16a34a, #0f766e)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <DollarSign size={20} color="#fff" />
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ color: "#0f172a", fontWeight: 900, fontSize: "1rem", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>เว็บคิดเงินเดือน</div>
            <div style={{ color: "#64748b", fontSize: "0.72rem", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>ดึงข้อมูลจาก Supabase ชุดเดียวกับ HR</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexShrink: 0 }}>
          <div style={{ color: "#64748b", fontSize: "0.8rem", fontWeight: 700, display: "none" }}>{currentUser?.name}</div>
          <button onClick={onBack} style={{ ...btnSecondary, flex: "none", padding: "0.55rem 0.75rem" }}><Home size={15} /> HR</button>
          <button onClick={onLogout} title="ออกจากระบบ" style={{ background: "#fef2f2", border: "1.5px solid #fca5a5", borderRadius: "10px", padding: "0.55rem 0.7rem", cursor: "pointer", color: "#dc2626", display: "flex", alignItems: "center", gap: "0.35rem", fontFamily: "inherit", fontSize: "0.78rem", fontWeight: 800 }}>
            <LogOut size={14} /> ออก
          </button>
        </div>
      </header>
      <main style={{ padding: "1.25rem", maxWidth: 1600, margin: "0 auto" }}>
        <PayrollPage employees={employees} attendance={attendance} leaves={leaves} settings={settings} />
      </main>
    </div>
  );
}

function StatCard({ stat }) {
  const Icon = stat.icon;
  return (
    <div style={{ background: "#fff", borderRadius: "1rem", padding: "1.25rem", boxShadow: "0 2px 12px rgba(0,0,0,0.06)", border: "1px solid #f1f5f9" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ color: "#64748b", fontSize: "0.8rem", fontWeight: 500, marginBottom: "0.4rem" }}>{stat.label}</div>
          <div style={{ fontSize: "2rem", fontWeight: 800, color: "#0f172a", lineHeight: 1 }}>{stat.value}</div>
          <div style={{ fontSize: "0.72rem", color: stat.color, marginTop: "0.35rem", fontWeight: 600 }}>{stat.trend}</div>
        </div>
        <div style={{ background: stat.bg, borderRadius: "12px", padding: "0.6rem", display: "flex" }}><Icon size={22} color={stat.color} /></div>
      </div>
    </div>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function HRApp() {
  const [currentUser, setCurrentUser] = useState(null);
  const [teacherPreview, setTeacherPreview] = useState(false);
  const getInitialPage = () => {
    if (typeof window === "undefined") return "dashboard";
    if (window.location.hash === "#finance") return "finance";
    if (window.location.hash === "#payroll") return "payrollStandalone";
    return "dashboard";
  };
  const [activePage, setActivePage] = useState(getInitialPage);
  const [showAttendance, setShowAttendance] = useState(false);
  const [attMode, setAttMode] = useState("in");
  const [activityLog, setActivityLog] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [leaves, setLeaves] = useState([]);
  const [outings, setOutings] = useState([]);
  const [settings, setSettings] = useState({ work_start: "08:00", work_end: "16:30", late_grace_minutes: 0 });
  const [currentTime, setCurrentTime] = useState(new Date());
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [desktopSidebarCollapsed, setDesktopSidebarCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("hr_sidebar_collapsed") === "true";
  });
  const [isMobile, setIsMobile] = useState(typeof window !== "undefined" ? window.innerWidth < 768 : false);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);
  useEffect(() => {
    localStorage.setItem("hr_sidebar_collapsed", String(desktopSidebarCollapsed));
  }, [desktopSidebarCollapsed]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const saved = localStorage.getItem("hr_user");
    if (saved) {
      try { setCurrentUser(JSON.parse(saved)); } catch (e) { localStorage.removeItem("hr_user"); }
    }
  }, []);

  useEffect(() => {
    const handleHashChange = () => {
      if (!currentUser) return;
      if (window.location.hash === "#finance" || window.location.hash === "#payroll") {
        if (currentUser.role === "admin") {
          setActivePage(window.location.hash === "#payroll" ? "payrollStandalone" : "finance");
        } else {
          window.history.replaceState(null, "", window.location.pathname);
          setActivePage("dashboard");
        }
      }
    };
    window.addEventListener("hashchange", handleHashChange);
    handleHashChange();
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser) return;
    const currentPage = navItems.find(item => item.key === activePage);
    if (activePage === "payrollStandalone" && currentUser.role !== "admin") {
      window.history.replaceState(null, "", window.location.pathname);
      setActivePage("dashboard");
      return;
    }
    if (currentPage && !currentPage.roles.includes(currentUser.role)) {
      if (window.location.hash === "#finance" || window.location.hash === "#payroll") {
        window.history.replaceState(null, "", window.location.pathname);
      }
      setActivePage("dashboard");
    }
  }, [currentUser, activePage]);

  useEffect(() => { const t = setInterval(() => setCurrentTime(new Date()), 1000); return () => clearInterval(t); }, []);
  useEffect(() => { if (currentUser) fetchData(); }, [currentUser]);

  async function fetchData() {
    setLoading(true);
    const { data: emps } = await supabase.from("employees").select("*").order("name");
    if (emps) setEmployees(emps);
    const { data: att } = await supabase.from("attendance").select("*, employees(name, department)").order("check_in", { ascending: false }).limit(5000);
    if (att) setActivityLog(att);
    const { data: lvs } = await supabase.from("leaves").select("*, employees!leaves_employee_id_fkey(name, department), substitute:employees!leaves_substitute_id_fkey(name)").order("created_at", { ascending: false });
    if (lvs) setLeaves(lvs);
    const { data: outs } = await supabase.from("outings").select("*, employees(name, department)").order("out_time", { ascending: false });
    if (outs) setOutings(outs);

    const { data: stg } = await supabase.from("settings").select("*").eq("id", 1).single();
    if (stg) setSettings(stg);

    setLoading(false);
  }

  const handleLogout = () => {
    localStorage.removeItem("hr_user");
    if (window.location.hash === "#finance" || window.location.hash === "#payroll") {
      window.history.replaceState(null, "", window.location.pathname);
    }
    setCurrentUser(null);
    setActivePage("dashboard");
  };

  if (!currentUser) return <LoginPage onLogin={setCurrentUser} />;

  const previewTeacher = employees.find(emp => emp.username === "teacher.try" && emp.role !== "admin");
  const actingUser = currentUser.role === "admin" && teacherPreview && previewTeacher ? previewTeacher : currentUser;
  const todayDateStr = todayISO();
  const isToday = (dt) => new Date(dt).toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" }) === todayDateStr;
  const todayAttendance = activityLog.filter(a => isToday(a.check_in));
  const currentlyOut = outings.filter(o => o.status === "out").length;
  const pendingLeaves = leaves.filter(l => l.status === "pending").length;
  const myAttToday = activityLog.find(a => a.employee_id === actingUser.id && isToday(a.check_in));

  const stats = actingUser.role === "admin" ? [
    { label: "พนักงานทั้งหมด", value: employees.length, icon: Users, color: "#2563eb", bg: "#eff6ff", trend: "ข้อมูลจริง" },
    { label: "ลงเวลาวันนี้", value: todayAttendance.length, icon: CheckCircle, color: "#059669", bg: "#ecfdf5", trend: `${employees.length > 0 ? Math.round(todayAttendance.length / employees.length * 100) : 0}%` },
    { label: "มาสายวันนี้", value: todayAttendance.filter(a => checkLate(a.check_in, settings?.work_start, settings?.late_grace_minutes)?.late).length, icon: AlertCircle, color: "#dc2626", bg: "#fef2f2", trend: "นับเฉพาะวันนี้" },
    { label: "รออนุมัติลา", value: pendingLeaves, icon: Umbrella, color: "#d97706", bg: "#fef3c7", trend: pendingLeaves > 0 ? "ต้องดำเนินการ" : "ไม่มี" },
  ] : (() => {
    const myLateInfo = myAttToday ? checkLate(myAttToday.check_in, settings?.work_start, settings?.late_grace_minutes) : null;
    const myEarlyInfo = myAttToday?.check_out ? checkEarly(myAttToday.check_out, settings?.work_end) : null;
    return [
      {
        label: "วันนี้",
        value: myAttToday ? (myLateInfo?.late ? `⚠️ สาย ${formatMinutes(myLateInfo.minutes)}` : "✓ ตรงเวลา") : "—",
        icon: myLateInfo?.late ? AlertCircle : CheckCircle,
        color: myLateInfo?.late ? "#dc2626" : (myAttToday ? "#059669" : "#94a3b8"),
        bg: myLateInfo?.late ? "#fef2f2" : (myAttToday ? "#ecfdf5" : "#f8fafc"),
        trend: myAttToday ? fmtTime(myAttToday.check_in) : "ยังไม่ลงเวลา"
      },
      {
        label: "การกลับ",
        value: myAttToday?.check_out
          ? (myEarlyInfo?.early ? `🚪 ก่อน ${formatMinutes(myEarlyInfo.minutes)}`
            : myEarlyInfo?.late ? `✓ ช้า ${formatMinutes(myEarlyInfo.minutes)}`
            : "✓ ตรงเวลา")
          : "—",
        icon: myEarlyInfo?.early ? AlertCircle : CheckCircle,
        color: myEarlyInfo?.early ? "#dc2626" : (myAttToday?.check_out ? "#059669" : "#94a3b8"),
        bg: myEarlyInfo?.early ? "#fef2f2" : (myAttToday?.check_out ? "#ecfdf5" : "#f8fafc"),
        trend: myAttToday?.check_out ? fmtTime(myAttToday.check_out) : "ยังไม่กลับ"
      },
      { label: "การลาของฉัน", value: leaves.filter(l => l.employee_id === actingUser.id).length, icon: Umbrella, color: "#7c3aed", bg: "#f5f3ff", trend: "รวม" },
      { label: "รออนุมัติ", value: leaves.filter(l => l.employee_id === actingUser.id && l.status === "pending").length, icon: AlertCircle, color: "#d97706", bg: "#fef3c7", trend: "รอ" },
    ];
  })();

  const openCheckIn = () => { setAttMode("in"); setShowAttendance(true); };
  const openCheckOut = () => { setAttMode("out"); setShowAttendance(true); };
  const openNavItem = (key) => {
    if (key === "finance") {
      if (currentUser.role !== "admin") {
        setActivePage("dashboard");
        setSidebarOpen(false);
        return;
      }
      const payrollUrl = `${window.location.origin}${window.location.pathname}#payroll`;
      window.open(payrollUrl, "_blank", "noopener,noreferrer");
      setSidebarOpen(false);
      return;
    }
    if (window.location.hash === "#finance" || window.location.hash === "#payroll") {
      window.history.replaceState(null, "", window.location.pathname);
    }
    setActivePage(key);
    setSidebarOpen(false);
  };

  const visibleNavItems = navItems.filter(item => item.roles.includes(actingUser.role === "admin" ? "admin" : "employee"));

  if (activePage === "payrollStandalone" && currentUser.role === "admin") {
    return loading ? (
      <div style={{ fontFamily: "'Sarabun', 'Noto Sans Thai', sans-serif", background: "#f8fafc", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: "#64748b" }}>
        <style>{`@import url('https://fonts.googleapis.com/css2?family=Sarabun:wght@300;400;500;600;700;800&display=swap'); @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
        <div style={{ textAlign: "center" }}>
          <RefreshCw size={32} style={{ animation: "spin 1s linear infinite", margin: "0 auto 1rem" }} />
          <div>กำลังโหลดเว็บเงินเดือน...</div>
        </div>
      </div>
    ) : (
      <PayrollStandaloneApp
        employees={employees}
        attendance={activityLog}
        leaves={leaves}
        settings={settings}
        currentUser={currentUser}
        onBack={() => {
          window.history.replaceState(null, "", window.location.pathname);
          setActivePage("dashboard");
        }}
        onLogout={handleLogout}
      />
    );
  }

  return (
    <div style={{ fontFamily: "'Sarabun', 'Noto Sans Thai', sans-serif", background: "#f8fafc", minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Sarabun:wght@300;400;500;600;700;800&display=swap'); * { box-sizing: border-box; margin: 0; padding: 0; } @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      <PreviewBanner />

      <header style={{ background: "#fff", borderBottom: "1px solid #e2e8f0", height: 60, display: "flex", alignItems: "center", padding: "0 1rem", gap: "0.75rem", position: "sticky", top: 0, zIndex: 100, boxShadow: "0 1px 8px rgba(0,0,0,0.06)" }}>
        <button
          onClick={() => isMobile ? setSidebarOpen(open => !open) : setDesktopSidebarCollapsed(collapsed => !collapsed)}
          title={isMobile ? "เปิดเมนู" : (desktopSidebarCollapsed ? "เปิดแถบเมนู" : "พับแถบเมนู")}
          aria-label={isMobile ? "เปิดเมนู" : (desktopSidebarCollapsed ? "เปิดแถบเมนู" : "พับแถบเมนู")}
          style={{ background: "#f1f5f9", border: "none", borderRadius: "10px", padding: "0.5rem", cursor: "pointer", color: "#475569", display: "flex", flexShrink: 0 }}
        >
          <Menu size={20} />
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", minWidth: 0, flex: isMobile ? 1 : "0 0 auto" }}>
          <div style={{ width: 34, height: 34, borderRadius: "10px", background: "linear-gradient(135deg, #2563eb, #1d4ed8)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Shield size={18} color="#fff" /></div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: "0.95rem", fontWeight: 800, color: "#0f172a", lineHeight: 1.1 }}>HR System</div>
            <div style={{ fontSize: "0.65rem", color: "#64748b", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>โรงเรียนนิมิตศึกษา</div>
          </div>
        </div>
        {!isMobile && <div style={{ flex: 1 }} />}
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginLeft: "auto" }}>
          {!isMobile && (
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: "0.85rem", fontWeight: 700, color: "#0f172a" }}>{actingUser.name}</div>
              <div style={{ fontSize: "0.7rem", color: "#64748b" }}>
                {actingUser.role === "admin" ? "👑 Admin" : "พนักงาน"} • {actingUser.department}
              </div>
            </div>
          )}
          {currentUser.role === "admin" && (
            <button
              type="button"
              onClick={() => {
                if (teacherPreview) {
                  setTeacherPreview(false);
                  return;
                }
                if (["employee", "finance", "report", "settings"].includes(activePage)) setActivePage("dashboard");
                setTeacherPreview(true);
              }}
              style={{ background: teacherPreview ? "#dbeafe" : "#eff6ff", border: "1.5px solid #93c5fd", borderRadius: "10px", padding: "0.4rem 0.7rem", cursor: "pointer", color: "#1d4ed8", fontFamily: "inherit", fontSize: "0.78rem", fontWeight: 800, whiteSpace: "nowrap" }}
            >
              {teacherPreview ? "กลับหน้าแอดมิน" : "ดูหน้าครู"}
            </button>
          )}
          <div style={{ width: 36, height: 36, borderRadius: "50%", background: "linear-gradient(135deg, #2563eb, #7c3aed)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700, fontSize: "0.9rem", flexShrink: 0 }}>{actingUser.name?.[0]}</div>
          <button onClick={handleLogout} title="ออกจากระบบ" style={{ background: "#fef2f2", border: "1.5px solid #fca5a5", borderRadius: "10px", padding: "0.45rem 0.65rem", cursor: "pointer", color: "#dc2626", display: "flex", alignItems: "center", gap: "0.3rem", fontFamily: "inherit", fontSize: "0.78rem", fontWeight: 600 }}>
            <LogOut size={14} />
          </button>
        </div>
      </header>

      <div style={{ display: "flex", flex: 1, position: "relative" }}>
        {/* Mobile Overlay */}
        {isMobile && sidebarOpen && (
          <div onClick={() => setSidebarOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 90, top: 60 }} />
        )}

        <aside style={{
          width: !isMobile && desktopSidebarCollapsed ? 0 : 260,
          background: "#fff",
          borderRight: !isMobile && desktopSidebarCollapsed ? "none" : "1px solid #e2e8f0",
          padding: !isMobile && desktopSidebarCollapsed ? "1rem 0" : "1rem 0.75rem",
          display: "flex",
          flexDirection: "column",
          gap: "0.35rem",
          overflowY: !isMobile && desktopSidebarCollapsed ? "hidden" : "auto",
          overflowX: "hidden",
          position: isMobile ? "fixed" : "sticky",
          top: 60,
          left: isMobile ? (sidebarOpen ? 0 : -280) : 0,
          height: "calc(100vh - 60px)",
          zIndex: 95,
          transition: "left 0.3s ease, width 0.25s ease, padding 0.25s ease",
          boxShadow: isMobile && sidebarOpen ? "4px 0 20px rgba(0,0,0,0.15)" : "none"
        }}>
          <div style={{ background: "linear-gradient(135deg, #eff6ff, #f0f9ff)", border: "1px solid #bfdbfe", borderRadius: "12px", padding: "0.85rem", marginBottom: "0.75rem", textAlign: "center" }}>
            <div style={{ fontSize: "1.6rem", fontWeight: 800, color: "#1d4ed8" }}>{currentTime.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "Asia/Bangkok" })}</div>
            <div style={{ fontSize: "0.75rem", color: "#64748b" }}>{currentTime.toLocaleDateString("th-TH", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Bangkok" })}</div>
          </div>

          {isMobile && (
            <div style={{ background: "#f8fafc", borderRadius: "10px", padding: "0.65rem", marginBottom: "0.5rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <div style={{ width: 32, height: 32, borderRadius: "50%", background: "linear-gradient(135deg, #2563eb, #7c3aed)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700, fontSize: "0.85rem" }}>{currentUser.name?.[0]}</div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: "0.85rem", fontWeight: 700, color: "#0f172a", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{actingUser.name}</div>
                <div style={{ fontSize: "0.7rem", color: "#64748b" }}>{actingUser.role === "admin" ? "👑 Admin" : "พนักงาน"}</div>
              </div>
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem", marginBottom: "1rem" }}>
            <button onClick={() => { openCheckIn(); setSidebarOpen(false); }} style={{ background: "linear-gradient(135deg, #2563eb, #1d4ed8)", border: "none", borderRadius: "12px", padding: "0.85rem 0.5rem", color: "#fff", fontWeight: 700, fontSize: "0.85rem", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: "0.35rem", boxShadow: "0 4px 14px rgba(37,99,235,0.3)", fontFamily: "inherit" }}>
              <LogIn size={20} /> เข้างาน
            </button>
            <button onClick={() => { openCheckOut(); setSidebarOpen(false); }} style={{ background: "linear-gradient(135deg, #f59e0b, #d97706)", border: "none", borderRadius: "12px", padding: "0.85rem 0.5rem", color: "#fff", fontWeight: 700, fontSize: "0.85rem", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: "0.35rem", boxShadow: "0 4px 14px rgba(245,158,11,0.3)", fontFamily: "inherit" }}>
              <LogOut size={20} /> กลับบ้าน
            </button>
          </div>

          {visibleNavItems.map(item => {
            const Icon = item.icon;
            const isActive = activePage === item.key;
            return (
              <button key={item.key} onClick={() => openNavItem(item.key)} style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                gap: "0.75rem",
                padding: "0.85rem 0.85rem",
                borderRadius: "12px",
                border: "none",
                background: isActive ? "linear-gradient(135deg, #eff6ff, #dbeafe)" : "transparent",
                color: isActive ? "#1d4ed8" : "#475569",
                cursor: "pointer",
                fontSize: "0.95rem",
                fontWeight: isActive ? 700 : 600,
                fontFamily: "inherit",
                textAlign: "left",
                transition: "all 0.15s",
                minHeight: 48
              }}
                onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = "#f8fafc"; }}
                onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = "transparent"; }}
              >
                <Icon size={20} />
                <span style={{ flex: 1 }}>{item.label}</span>
                {isActive && <ChevronRight size={16} />}
              </button>
            );
          })}
        </aside>

        <main style={{ flex: 1, padding: isMobile ? "1rem" : "1.5rem", overflowY: "auto", width: "100%", minWidth: 0 }}>
          {loading ? (
            <div style={{ textAlign: "center", padding: "3rem", color: "#64748b" }}>
              <RefreshCw size={32} style={{ animation: "spin 1s linear infinite", margin: "0 auto 1rem" }} />
              <div>กำลังโหลด...</div>
            </div>
          ) : (
            <>
              {activePage === "dashboard" && (
                <>
                  <PageHeader title={`สวัสดี ${actingUser.name?.split(" ")[0]} 👋`} />
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1rem", marginBottom: "1.5rem" }}>
                    {stats.map(stat => <StatCard key={stat.label} stat={stat} />)}
                  </div>

                  {actingUser.role === "admin" && (
                    <>
                      {/* Pending Approvals */}
                      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: "1rem", marginBottom: "1.5rem" }}>
                        {/* การลารออนุมัติ */}
                        <Card>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                              <Umbrella size={18} color="#7c3aed" />
                              <div style={{ fontWeight: 700, color: "#0f172a", fontSize: "0.95rem" }}>การลารออนุมัติ</div>
                            </div>
                            <span style={{ background: "#fef3c7", color: "#d97706", fontSize: "0.72rem", fontWeight: 700, padding: "0.2rem 0.6rem", borderRadius: "20px" }}>{leaves.filter(l => l.status === "pending").length} รายการ</span>
                          </div>
                          {leaves.filter(l => l.status === "pending").length === 0 ? (
                            <div style={{ textAlign: "center", padding: "1.5rem", color: "#94a3b8", fontSize: "0.85rem" }}>ไม่มีรายการรออนุมัติ ✅</div>
                          ) : (
                            <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem", maxHeight: 400, overflowY: "auto" }}>
                              {leaves.filter(l => l.status === "pending").map((l, i) => (
                                <div key={l.id} style={{ background: "#f8fafc", borderRadius: "10px", padding: "0.75rem", display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
                                  <Avatar name={l.employees?.name} index={i} />
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontWeight: 600, fontSize: "0.85rem", color: "#0f172a" }}>{l.employees?.name}</div>
                                    <div style={{ fontSize: "0.75rem", color: "#64748b" }}>{l.leave_type} • {l.duration_type} • {l.hours} ชม.</div>
                                    <div style={{ fontSize: "0.72rem", color: "#94a3b8" }}>{fmtDate(l.start_date)} → {fmtDate(l.end_date)}</div>
                                    {l.reason && <div style={{ fontSize: "0.72rem", color: "#475569", marginTop: "0.25rem", fontStyle: "italic" }}>"{l.reason.slice(0, 50)}{l.reason.length > 50 ? "..." : ""}"</div>}
                                  </div>
                                  <div style={{ display: "flex", gap: "0.3rem" }}>
                                    <button onClick={async () => { await supabase.from("leaves").update({ status: "approved" }).eq("id", l.id); fetchData(); }} style={{ background: "#dcfce7", border: "none", borderRadius: "8px", padding: "0.4rem 0.6rem", cursor: "pointer", color: "#16a34a", display: "flex", alignItems: "center", gap: "0.25rem", fontFamily: "inherit", fontSize: "0.75rem", fontWeight: 700 }}>
                                      <CheckCircle size={14} /> อนุมัติ
                                    </button>
                                    <button onClick={async () => { await supabase.from("leaves").update({ status: "rejected" }).eq("id", l.id); fetchData(); }} style={{ background: "#fef2f2", border: "none", borderRadius: "8px", padding: "0.4rem 0.6rem", cursor: "pointer", color: "#dc2626", display: "flex", alignItems: "center", gap: "0.25rem", fontFamily: "inherit", fontSize: "0.75rem", fontWeight: 700 }}>
                                      <XCircle size={14} /> ปฏิเสธ
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </Card>

                        {/* ออกนอกสถานที่ — กำลังออกอยู่ */}
                        <Card>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                              <ArrowRightLeft size={18} color="#d97706" />
                              <div style={{ fontWeight: 700, color: "#0f172a", fontSize: "0.95rem" }}>ออกนอกสถานที่ — ขณะนี้</div>
                            </div>
                            <span style={{ background: "#fef2f2", color: "#dc2626", fontSize: "0.72rem", fontWeight: 700, padding: "0.2rem 0.6rem", borderRadius: "20px" }}>{outings.filter(o => o.status === "out").length} คน</span>
                          </div>
                          {outings.filter(o => o.status === "out").length === 0 ? (
                            <div style={{ textAlign: "center", padding: "1.5rem", color: "#94a3b8", fontSize: "0.85rem" }}>ไม่มีพนักงานออกนอกสถานที่ ✅</div>
                          ) : (
                            <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem", maxHeight: 400, overflowY: "auto" }}>
                              {outings.filter(o => o.status === "out").map((o, i) => (
                                <div key={o.id} style={{ background: "#fef9e7", border: "1px solid #fde68a", borderRadius: "10px", padding: "0.75rem", display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
                                  <Avatar name={o.employees?.name} index={i} />
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontWeight: 600, fontSize: "0.85rem", color: "#0f172a" }}>{o.employees?.name}</div>
                                    <div style={{ fontSize: "0.75rem", color: "#64748b" }}>📍 {o.destination || "ไม่ระบุ"}</div>
                                    <div style={{ fontSize: "0.72rem", color: "#d97706", fontWeight: 600 }}>ออกเมื่อ {fmtTime(o.out_time)} น.</div>
                                    {o.reason && <div style={{ fontSize: "0.72rem", color: "#475569", marginTop: "0.25rem", fontStyle: "italic" }}>"{o.reason.slice(0, 40)}{o.reason.length > 40 ? "..." : ""}"</div>}
                                  </div>
                                  <button onClick={async () => { await supabase.from("outings").update({ return_time: new Date().toISOString(), status: "returned" }).eq("id", o.id); fetchData(); }} style={{ background: "#dcfce7", border: "none", borderRadius: "8px", padding: "0.4rem 0.6rem", cursor: "pointer", color: "#16a34a", display: "flex", alignItems: "center", gap: "0.25rem", fontFamily: "inherit", fontSize: "0.75rem", fontWeight: 700 }}>
                                    <ArrowLeftRight size={14} /> กลับแล้ว
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </Card>
                      </div>

                      {/* มาสายวันนี้ */}
                      <Card padding="1.25rem" style={{ marginBottom: "1.5rem" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                            <AlertCircle size={18} color="#dc2626" />
                            <div style={{ fontWeight: 700, color: "#0f172a", fontSize: "0.95rem" }}>มาสายวันนี้</div>
                          </div>
                          <span style={{ background: "#fef2f2", color: "#dc2626", fontSize: "0.72rem", fontWeight: 700, padding: "0.2rem 0.6rem", borderRadius: "20px" }}>{todayAttendance.filter(a => checkLate(a.check_in, settings?.work_start)?.late).length} คน</span>
                        </div>
                        {todayAttendance.filter(a => checkLate(a.check_in, settings?.work_start)?.late).length === 0 ? (
                          <div style={{ textAlign: "center", padding: "1.5rem", color: "#94a3b8", fontSize: "0.85rem" }}>ไม่มีพนักงานมาสายวันนี้ 🎉</div>
                        ) : (
                          <div style={{ overflowX: "auto" }}>
                            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
                              <thead>
                                <tr style={{ borderBottom: "2px solid #f1f5f9" }}>
                                  {["พนักงาน", "แผนก", "เวลาเข้า", "สาย"].map(h => (
                                    <th key={h} style={{ padding: "0.5rem 0.75rem", textAlign: "left", color: "#94a3b8", fontWeight: 600, fontSize: "0.75rem", whiteSpace: "nowrap" }}>{h}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {todayAttendance.filter(a => checkLate(a.check_in, settings?.work_start)?.late).map((a, i) => {
                                  const li = checkLate(a.check_in, settings?.work_start);
                                  return (
                                    <tr key={a.id} style={{ borderBottom: "1px solid #f8fafc" }}>
                                      <td style={{ padding: "0.65rem 0.75rem" }}>
                                        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                                          <Avatar name={a.employees?.name} index={i} />
                                          <span style={{ fontWeight: 600 }}>{a.employees?.name || "-"}</span>
                                        </div>
                                      </td>
                                      <td style={{ padding: "0.65rem 0.75rem", color: "#64748b" }}>{a.employees?.department || "-"}</td>
                                      <td style={{ padding: "0.65rem 0.75rem", color: "#dc2626", fontWeight: 700 }}>{fmtTime(a.check_in)}</td>
                                      <td style={{ padding: "0.65rem 0.75rem" }}><span style={{ background: "#fef2f2", color: "#dc2626", fontSize: "0.78rem", fontWeight: 700, padding: "0.25rem 0.6rem", borderRadius: "20px" }}>⚠️ {formatMinutes(li.minutes)}</span></td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </Card>
                    </>
                  )}

                  <Card>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}><Activity size={18} color="#2563eb" /><div style={{ fontWeight: 700, color: "#0f172a", fontSize: "0.95rem" }}>กิจกรรมล่าสุด</div></div>
                      <button onClick={fetchData} style={{ background: "none", border: "1.5px solid #e2e8f0", borderRadius: "8px", padding: "0.35rem 0.75rem", fontSize: "0.78rem", color: "#475569", cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: "0.4rem" }}>
                        <RefreshCw size={13} /> รีเฟรช
                      </button>
                    </div>
                    {activityLog.length === 0 ? (
                      <div style={{ textAlign: "center", padding: "2rem", color: "#94a3b8" }}>ยังไม่มีข้อมูล</div>
                    ) : (
                      <div style={{ overflowX: "auto" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
                          <thead>
                            <tr style={{ borderBottom: "2px solid #f1f5f9" }}>
                              {["พนักงาน", "แผนก", "เข้างาน", "กลับบ้าน"].map(h => (
                                <th key={h} style={{ padding: "0.5rem 0.75rem", textAlign: "left", color: "#94a3b8", fontWeight: 600, fontSize: "0.75rem", whiteSpace: "nowrap" }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {activityLog.slice(0, 10).map((row, i) => (
                              <tr key={row.id} style={{ borderBottom: "1px solid #f8fafc", background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                                <td style={{ padding: "0.65rem 0.75rem" }}>
                                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                                    <Avatar name={row.employees?.name} index={i} />
                                    <span style={{ fontWeight: 600, color: "#0f172a" }}>{row.employees?.name || "-"}</span>
                                  </div>
                                </td>
                                <td style={{ padding: "0.65rem 0.75rem", color: "#64748b" }}>{row.employees?.department || "-"}</td>
                                <td style={{ padding: "0.65rem 0.75rem" }}><span style={{ background: "#dcfce7", color: "#16a34a", fontSize: "0.72rem", fontWeight: 700, padding: "0.2rem 0.5rem", borderRadius: "20px" }}>{fmtTime(row.check_in)}</span></td>
                                <td style={{ padding: "0.65rem 0.75rem" }}>{row.check_out ? <span style={{ background: "#fef3c7", color: "#d97706", fontSize: "0.72rem", fontWeight: 700, padding: "0.2rem 0.5rem", borderRadius: "20px" }}>{fmtTime(row.check_out)}</span> : <span style={{ color: "#94a3b8", fontSize: "0.78rem" }}>-</span>}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </Card>
                </>
              )}
              {activePage === "employee" && <EmployeePage employees={employees} currentUser={currentUser} onRefresh={fetchData} />}
              {activePage === "attendance" && <AttendancePage employees={employees} activityLog={activityLog} currentUser={actingUser} settings={settings} onRefresh={fetchData} />}
              {activePage === "leave" && <LeavePage employees={employees} leaves={leaves} currentUser={actingUser} onRefresh={fetchData} />}
              {activePage === "outing" && <OutingPage employees={employees} outings={outings} currentUser={actingUser} onRefresh={fetchData} />}
              {activePage === "finance" && currentUser.role === "admin" && <FinancePortal employees={employees} attendance={activityLog} leaves={leaves} settings={settings} />}
              {activePage === "report" && <ReportPage employees={employees} attendance={activityLog} leaves={leaves} outings={outings} settings={settings} />}
              {activePage === "schedule" && <SchedulePage employees={employees} currentUser={actingUser} onRefresh={fetchData} />}
              {activePage === "academic" && <AcademicPage employees={employees} currentUser={actingUser} />}
              {activePage === "settings" && <SettingsPage settings={settings} onRefresh={fetchData} />}
            </>
          )}
        </main>
      </div>

      {showAttendance && <AttendanceModal mode={attMode} onClose={() => { setShowAttendance(false); fetchData(); }} onCheckin={() => fetchData()} employees={employees} currentUser={actingUser} settings={settings} />}
    </div>
  );
}
