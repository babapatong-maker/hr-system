import { useState, useEffect, useCallback, useRef, Fragment } from "react";
// lessonPlanCatalog.js (หน่วย/แผนสำเร็จรูป ภาษาไทย ป.2) ไม่ได้ใช้แล้ว ครูกรอกหน่วยการเรียนรู้เอง
import { AcademicExtra, ACADEMIC_EXTRA_TABS, ACADEMIC_RECORD_ROOM, TEACHING_GRADE_GROUPS, loadAssignedPlanLevels, loadTeachingGrades, saveTeachingGrade } from "./academicRecords.jsx";
import { read as readWorkbook, utils as xlsxUtils, writeFile as writeWorkbookFile } from "xlsx";
import { supabase } from "./supabase.js";
import { cached } from "./queryCache.js";
import { AcademicCalendarPage, UpcomingCalendarCard } from "./academicCalendar.jsx";
import { RoomBookingPage, ROOM_BOOKING_ROOM, ROOM_BOOKING_ROOMS_ROOM } from "./roomBooking.jsx";
import { KgShortPlanPage, KG_SHORT_PLAN_ROOM, isKgTeacher, kgTeacherInfo } from "./kgShortPlan.jsx";
import { MILK_RECORD_TEMPLATE_URL, buildMilkRecord, fillMilkRecordWorkbook, milkRecordPrintHtml, milkClassLine } from "./milkRecordForm.js";
import { STUDENT_STATS_TEMPLATE_URL, STUDENT_STATS_LEVELS, MILK_OTHER, MILK_NONE, buildStudentStats, fillStudentStatsWorkbook, statsTotals, studentSex, remarkName, formDateLine } from "./studentStatsForm.js";
import {
  Users, Building2, Clock, CheckCircle, XCircle, MapPin,
  Navigation, LogIn, LogOut, Settings, Bell, Search,
  ChevronDown, ChevronRight, BarChart3, FileText,
  Shield, WifiOff, RefreshCw, UserPlus, DollarSign,
  Umbrella, AlertCircle, Activity, Home, X, Edit, Trash2, Save, Phone, Mail,
  Plus, Calendar, ArrowRightLeft, ArrowLeftRight, TrendingUp, User, Lock, Eye, EyeOff, Key, Menu,
  BookOpen, ChevronLeft, ChevronUp, Copy, Upload, Download, Printer, Pencil } from "lucide-react";

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

// ─── LOGIN SESSIONS (สูงสุด 3 เครื่องต่อคน) ─────────────────────────────────────
// แถวพิเศษใน teaching_schedule: class_room "__LOGIN_SESSION__", subject = JSON {device_id, device_name, login_at, last_seen}
const LOGIN_SESSION_ROOM = "__LOGIN_SESSION__";
const MAX_LOGIN_DEVICES = 3;
const SESSION_STALE_DAYS = 30;
const KICKED_MESSAGE = "⚠️ บัญชีนี้ถูกออกจากระบบบนเครื่องนี้ เนื่องจากมีการเข้าสู่ระบบจากเครื่องอื่น (เข้าได้พร้อมกันสูงสุด 3 เครื่อง) กรุณาเข้าสู่ระบบใหม่";

function parseSessionRow(row) {
  let body = {};
  try { body = JSON.parse(row.subject || "{}"); } catch { /* ignore */ }
  return { id: row.id, ...body };
}

async function fetchLoginSessions(employeeId) {
  const { data, error } = await supabase.from("teaching_schedule").select("id, subject").eq("class_room", LOGIN_SESSION_ROOM).eq("employee_id", employeeId);
  if (error) throw error;
  return (data || []).map(parseSessionRow);
}

async function registerLoginSession(employeeId) {
  const deviceId = getDeviceId();
  const now = new Date().toISOString();
  const sessions = await fetchLoginSessions(employeeId);
  const mine = sessions.filter(x => x.device_id === deviceId);
  const body = { device_id: deviceId, device_name: getDeviceName(), login_at: now, last_seen: now };
  const payload = { employee_id: employeeId, day_of_week: 0, period: 1, class_room: LOGIN_SESSION_ROOM, start_time: "00:00:00", end_time: null, subject: JSON.stringify(body) };
  // บันทึกไม่สำเร็จ (เน็ตหลุด/สิทธิ์) = ไม่ตั้งธง จะได้ไม่ถูกเตะออกเพราะหาแถวของตัวเองไม่เจอ
  const { error: saveErr } = mine.length
    ? await supabase.from("teaching_schedule").update(payload).eq("id", mine[0].id)
    : await supabase.from("teaching_schedule").insert(payload);
  if (saveErr) throw saveErr;
  if (mine.length > 1) await supabase.from("teaching_schedule").delete().in("id", mine.slice(1).map(x => x.id));
  try { localStorage.setItem("hr_session_device", `${employeeId}|${deviceId}`); } catch { /* ignore */ }
  // ลบเครื่องที่ไม่ได้ใช้นานเกิน 30 วัน และเกิน 3 เครื่องให้ออกเครื่องที่ใช้ล่าสุดนานที่สุด
  const staleBefore = Date.now() - SESSION_STALE_DAYS * 86400000;
  const others = sessions.filter(x => x.device_id !== deviceId)
    .sort((a, b) => new Date(b.last_seen || b.login_at || 0) - new Date(a.last_seen || a.login_at || 0));
  const remove = others.filter((x, i) => i >= MAX_LOGIN_DEVICES - 1 || new Date(x.last_seen || x.login_at || 0).getTime() < staleBefore);
  if (remove.length) await supabase.from("teaching_schedule").delete().in("id", remove.map(x => x.id));
}

// คืนค่า "ok" | "kicked" | "unknown" (เน็ตหลุด/ผิดพลาด = ไม่เตะออก)
async function touchLoginSession(employeeId) {
  try {
    const deviceId = getDeviceId();
    const sessions = await fetchLoginSessions(employeeId);
    const mine = sessions.find(x => x.device_id === deviceId);
    if (!mine) {
      // เครื่องที่ล็อกอินไว้ก่อนมีระบบนี้ (ยังไม่เคยลงทะเบียน) ให้ลงทะเบียนเลย ไม่เตะออก
      if (localStorage.getItem("hr_session_device") !== `${employeeId}|${deviceId}`) { await registerLoginSession(employeeId); return "ok"; }
      return "kicked";
    }
    const { id, ...body } = mine;
    await supabase.from("teaching_schedule").update({ subject: JSON.stringify({ ...body, last_seen: new Date().toISOString() }) }).eq("id", id);
    return "ok";
  } catch { return "unknown"; }
}

async function removeLoginSession(employeeId) {
  try {
    const deviceId = getDeviceId();
    const sessions = await fetchLoginSessions(employeeId);
    const ids = sessions.filter(x => x.device_id === deviceId).map(x => x.id);
    localStorage.removeItem("hr_session_device");
    if (ids.length) await supabase.from("teaching_schedule").delete().in("id", ids);
  } catch { /* ignore */ }
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

// ─── เวลาทำงานรายบุคคล (กรณีต่างหาก) ─────────────────────────────
// แถวพิเศษใน teaching_schedule: class_room "__WORK_HOURS__", employee_id = ครู, day_of_week 0, period 0,
// start_time = เวลาเข้า, end_time = เวลาเลิก (ไม่ต้องแก้โครงสร้างฐานข้อมูล)
const WORK_HOURS_ROOM = "__WORK_HOURS__";
let WORK_HOURS_OVERRIDES = {};
function setWorkHourOverrides(rows) {
  const next = {};
  (rows || []).forEach(row => {
    const start = /^\d{2}:\d{2}/.test(row?.start_time || "") ? String(row.start_time).slice(0, 5) : "";
    const end = /^\d{2}:\d{2}/.test(row?.end_time || "") ? String(row.end_time).slice(0, 5) : "";
    if (row?.employee_id && (start || end)) next[String(row.employee_id)] = { id: row.id, start, end };
  });
  WORK_HOURS_OVERRIDES = next;
  return next;
}
async function loadWorkHourOverrides() {
  try {
    const { data, error } = await supabase.from("teaching_schedule").select("id, employee_id, start_time, end_time").eq("class_room", WORK_HOURS_ROOM);
    if (!error) return setWorkHourOverrides(data);
  } catch { /* ใช้ค่าเดิม */ }
  return WORK_HOURS_OVERRIDES;
}
function wsOf(employeeId, fallback) {
  return WORK_HOURS_OVERRIDES[String(employeeId)]?.start || fallback;
}
function weOf(employeeId, fallback) {
  return WORK_HOURS_OVERRIDES[String(employeeId)]?.end || fallback;
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
const ACTIVITY_PLAN_ROOM = "__ACTIVITY_PLAN__";
const SUPERVISION_FILE_LIMIT = 2.5 * 1024 * 1024;
const SUPERVISION_JSON_LIMIT = 3200000;
const SUPERVISION_FILE_EXTENSIONS = [".pdf", ".doc", ".docx", ".jpg", ".jpeg", ".png", ".webp", ".gif"];
const SUPERVISION_FILE_ACCEPT = ".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp,.gif,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/*";

// ผู้ดูหน้าประเมินครูได้: role admin หรือ ผู้บริหารตามตำแหน่ง (ผู้อำนวยการ/ผอ./รองผอ./ผู้บริหาร)
const EXECUTIVE_POSITION_PATTERN = /(ผู้อำนวยการ|รองผู้อำนวยการ|ผอ\.?|รอง\s*ผอ|ผู้บริหาร|ผู้จัดการโรงเรียน|director|principal)/i;
// ผู้บริหาร = 4 คนนี้เท่านั้น สิทธิ์เท่ากันทุกหน้าผู้บริหาร (ตรวจด้วย id และชื่อ-สกุลแบบตัดคำนำหน้า/ช่องว่าง)
const EXECUTIVE_ALLOWLIST_IDS = new Set([
  "c5306809-307e-47ae-bce1-42c2a9b38f1d", // เรณู เล็กดี
  "193538b9-9672-4c18-b29d-114dcc5befaf", // จักรพล พลโสภาพ
  "b76e8f05-984c-4c2d-83d8-5ea886836824", // ศศิธร มีสมสืบ
  "1c21605d-3404-4424-a640-d2eb25361c19", // ศักดิ์ศิริ มีสมสืบ
]);
function normalizePersonName(name) {
  return String(name || "").normalize("NFC").trim().replace(/^(นางสาว|นาง|นาย|น\.ส\.|ครู|ดร\.)\s*/, "").replace(/\s+/g, "");
}
const EXECUTIVE_ALLOWLIST_NAMES = new Set(["เรณู เล็กดี", "จักรพล พลโสภาพ", "ศศิธร มีสมสืบ", "ศักดิ์ศิริ มีสมสืบ"].map(normalizePersonName));
// เงินเดือนเป็นความลับสูงสุด: เห็น/เข้าได้เฉพาะ ศักดิ์ศิริ มีสมสืบ คนเดียว (ไม่ใช้ role admin เพราะมี admin หลายคน)
const SALARY_OWNER_ID = "1c21605d-3404-4424-a640-d2eb25361c19";
function isSalaryOwner(user) {
  if (!user) return false;
  return String(user.id || "") === SALARY_OWNER_ID;
}
// บัญชีทดสอบ "ครูทดลองระบบ" (username teacher.try) ใช้/เห็นได้เฉพาะ ศักดิ์ศิริ มีสมสืบ เท่านั้น
const TEST_TEACHER_OWNER_IDS = new Set(["1c21605d-3404-4424-a640-d2eb25361c19"]);
const TEST_TEACHER_OWNER_NAMES = new Set([normalizePersonName("ศักดิ์ศิริ มีสมสืบ")]);
function isTestTeacherOwner(user) {
  if (!user) return false;
  return TEST_TEACHER_OWNER_IDS.has(String(user.id || "")) || TEST_TEACHER_OWNER_NAMES.has(normalizePersonName(user.name));
}
function isTestTeacher(emp) {
  if (!emp) return false;
  const raw = String(emp.name || "").normalize("NFC").replace(/\s+/g, "");
  return String(emp.username || "").toLowerCase() === "teacher.try" || raw.includes("ครูทดลองระบบ") || normalizePersonName(emp.name) === "ทดลองระบบ";
}

// เจ้าหน้าที่ที่ไม่สอน (เช่น ธุรการ) — ไม่ต้องส่งแผน ไม่มีคาบ (ยังลงเวลา/ใช้ฟีเจอร์อื่นตามปกติ)
function isNonTeachingStaff(user) {
  return /ธุรการ/.test(String(user?.position || "")) || /ธุรการ/.test(String(user?.department || ""));
}
// ครูอนุบาล (ตอ./อ.1–3) อยู่ห้องตัวเองทั้งวัน — ไม่แสดงในตารางสอนรายคาบของผู้บริหาร
function isKgHomeroomTeacher(user) {
  const info = kgTeacherInfo(user);
  return !!info && !info.test;
}
const KG_ROOM_RE = /^\s*(ตอ\.?|อ\.?\s*[1-3])(\s|\/|$)/;

function isExecutiveUser(user) {
  if (!user) return false;
  return EXECUTIVE_ALLOWLIST_IDS.has(String(user.id || "")) || EXECUTIVE_ALLOWLIST_NAMES.has(normalizePersonName(user.name));
}

// ผู้บริหารทั้ง 4 คนมีสิทธิ์เท่ากับ admin ในทุกหน้าที่ไม่ใช่เงินเดือน
function hasAdminRights(user) {
  return !!user && (user.role === "admin" || isExecutiveUser(user));
}

function canAccessNavItem(item, user) {
  if (!item || !user) return false;
  if (item.key === "finance") return isSalaryOwner(user);
  if (item.key === "teacherEval" || item.key === "execDash" || item.key === "cleaningDuty") return isExecutiveUser(user);
  if (item.key === "kgShortPlan") return isKgTeacher(user) || isExecutiveUser(user);
  return item.roles.includes(hasAdminRights(user) ? "admin" : "employee");
}

function NoAccessCard() {
  return <Card><div style={{ textAlign: "center", color: "#b91c1c", fontWeight: 800, padding: "1.5rem" }}>ไม่มีสิทธิ์เข้าถึงหน้านี้ (เฉพาะผู้บริหาร/แอดมิน)</div></Card>;
}

const navItems = [
  { icon: Shield, label: "หน้าผู้บริหาร", key: "execDash", roles: ["admin"], executiveOnly: true },
  { icon: Home, label: "หน้าหลัก", key: "dashboard", roles: ["admin", "employee"] },
  { icon: Users, label: "ข้อมูลพนักงาน", key: "employee", roles: ["admin"] },
  { icon: Clock, label: "ลงเวลาเข้า-ออก", key: "attendance", roles: ["admin", "employee"] },
  { icon: Calendar, label: "ตารางสอน", key: "schedule", roles: ["admin", "employee"] },
  { icon: BookOpen, label: "งานวิชาการ", key: "academic", roles: ["admin", "employee"] },
  { icon: Calendar, label: "ปฏิทินการศึกษา", key: "academicCalendar", roles: ["admin", "employee"] },
  { icon: Calendar, label: "จองห้องสื่อการสอน", key: "roomBooking", roles: ["admin", "employee"] },
  { icon: FileText, label: "แผนการจัดกิจกรรม", key: "activityPlan", roles: ["admin", "employee"] },
  { icon: BookOpen, label: "แผนระยะสั้น (อนุบาล)", key: "kgShortPlan", roles: ["admin", "employee"] },
  { icon: TrendingUp, label: "ประเมินครู", key: "teacherEval", roles: ["admin"], executiveOnly: true },
  { icon: CheckCircle, label: "เวรความสะอาด / เวรพื้นที่", key: "cleaningDuty", roles: ["admin"], executiveOnly: true },
  { icon: Umbrella, label: "การลา", key: "leave", roles: ["admin", "employee"] },
  { icon: ArrowRightLeft, label: "ขอออกนอกสถานที่", key: "outing", roles: ["admin", "employee"] },
  { icon: DollarSign, label: "เงินเดือน", key: "finance", roles: ["admin"] },
  { icon: BarChart3, label: "รายงาน", key: "report", roles: ["admin"] },
  { icon: Settings, label: "ตั้งค่าเวลาทำงาน", key: "settings", roles: ["admin"] },
];

const inputStyle = { width: "100%", padding: "0.65rem 0.75rem", border: "1.5px solid #e2e8f0", borderRadius: "10px", fontSize: "0.9rem", fontFamily: "inherit", color: "#233862", outline: "none", background: "#fff" };
const selectStyle = { ...inputStyle };
const btnSecondary = { flex: 1, padding: "0.75rem", borderRadius: "10px", border: "1.5px solid #e2e8f0", background: "#f8fafc", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.4rem", color: "#475569", fontSize: "0.9rem", fontWeight: 600, fontFamily: "inherit" };
const btnPrimary = { flex: 2, padding: "0.75rem", borderRadius: "10px", border: "none", fontWeight: 700, fontSize: "0.95rem", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.4rem" };
const iconBtn = (bg, color) => ({ background: bg, border: "none", borderRadius: "8px", padding: "0.4rem", cursor: "pointer", color });

function Avatar({ name, index = 0 }) {
  return <div style={{ width: 34, height: 34, borderRadius: "50%", background: `hsl(${index * 47 + 200}, 65%, 58%)`, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700, fontSize: "0.85rem", flexShrink: 0 }}>{name?.[0] || "?"}</div>;
}

function Card({ children, padding = "1.25rem", style = {} }) {
  return <div style={{ background: "#fff", borderRadius: "18px", padding, boxShadow: "0 4px 24px rgba(0,140,255,0.08)", border: "1px solid #E4EEF8", ...style }}>{children}</div>;
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
      <button onClick={onSave} disabled={saving} style={{ ...btnPrimary, background: "linear-gradient(135deg, #008CFF, #0072D9)", color: "#fff", cursor: saving ? "not-allowed" : "pointer" }}>
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
        <h1 style={{ fontSize: "1.4rem", fontWeight: 800, color: "#233862" }}>{title}</h1>
        {count !== undefined && <p style={{ color: "#64748b", fontSize: "0.85rem" }}>ทั้งหมด {count} รายการ</p>}
      </div>
      {onAdd && (
        <button onClick={onAdd} style={{ background: "linear-gradient(135deg, #008CFF, #0072D9)", border: "none", borderRadius: "12px", padding: "0.65rem 1.25rem", color: "#fff", fontWeight: 700, fontSize: "0.875rem", cursor: "pointer", display: "flex", alignItems: "center", gap: "0.5rem", fontFamily: "inherit", boxShadow: "0 4px 14px rgba(0,140,255,0.3)" }}>
          <Plus size={16} /> {addLabel}
        </button>
      )}
    </div>
  );
}

function Modal({ title, subtitle, onClose, icon: Icon, color = "#0072D9", children }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.7)", backdropFilter: "blur(6px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: "1rem" }}>
      <div style={{ background: "#fff", borderRadius: "1.5rem", width: "100%", maxWidth: "480px", boxShadow: "0 32px 80px rgba(0,0,0,0.25)", overflow: "hidden", fontFamily: "'Anuphan', 'Sarabun', sans-serif", maxHeight: "90vh", display: "flex", flexDirection: "column" }}>
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
  const [error, setError] = useState(() => { try { return sessionStorage.getItem("hr_kicked_msg") || ""; } catch { return ""; } });
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

    // ครู 1 คนเข้าได้พร้อมกันสูงสุด 3 เครื่อง ไม่ล็อกบัญชี — เครื่องที่ 4 จะเตะเครื่องที่ไม่ได้ใช้นานที่สุดออก
    try { await registerLoginSession(user.id); } catch (e) { console.warn("login session", e); }
    try { sessionStorage.removeItem("hr_kicked_msg"); } catch { /* ignore */ }

    setLoading(false);
    localStorage.setItem("hr_user", JSON.stringify(user));
    onLogin(user);
  };

  return (
    <div style={{ fontFamily: "'Anuphan', 'Sarabun', sans-serif", minHeight: "100vh", background: "linear-gradient(135deg, #0072D9 0%, #008CFF 55%, #3EBFFB 100%)", display: "flex", flexDirection: "column" }}>
      <PreviewBanner />
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Anuphan:wght@300;400;500;600;700&family=Sarabun:wght@400;600;700&display=swap'); * { box-sizing: border-box; margin: 0; padding: 0; } @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>

      <div style={{ background: "#fff", borderRadius: "1.5rem", padding: "2.5rem 2rem", width: "100%", maxWidth: 400, boxShadow: "0 32px 80px rgba(0,0,0,0.3)" }}>
        <div style={{ textAlign: "center", marginBottom: "2rem" }}>
          <div style={{ width: 72, height: 72, borderRadius: "20px", background: "linear-gradient(135deg, #008CFF, #0072D9)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 1rem", boxShadow: "0 8px 24px rgba(0,140,255,0.4)" }}>
            <Shield size={36} color="#fff" />
          </div>
          <h1 style={{ fontSize: "1.4rem", fontWeight: 800, color: "#233862" }}>HR System</h1>
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
          <button onClick={handleLogin} disabled={loading} style={{ padding: "0.85rem", borderRadius: "10px", border: "none", background: "linear-gradient(135deg, #008CFF, #0072D9)", color: "#fff", fontWeight: 700, fontSize: "0.95rem", cursor: loading ? "not-allowed" : "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem", boxShadow: "0 4px 14px rgba(0,140,255,0.3)" }}>
            {loading ? <RefreshCw size={18} style={{ animation: "spin 1s linear infinite" }} /> : <LogIn size={18} />}
            {loading ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบ"}
          </button>
        </div>

        <div style={{ marginTop: "1.5rem", padding: "0.75rem", background: "#EAF5FF", borderRadius: "10px", fontSize: "0.78rem", color: "#0072D9", textAlign: "center" }}>
          💡 ทดสอบ: username <strong>admin1</strong> / password <strong>admin123</strong>
        </div>
      </div>
      </div>
    </div>
  );
}

// ─── EMPLOYEE MODAL ───────────────────────────────────────────────────────────
function EmployeeModal({ employee, onClose, onSave, canSeePay = false }) {
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
    // ผู้ที่ไม่ใช่เจ้าของข้อมูลเงินเดือน แก้ได้แค่ระดับครู ไม่แตะตัวเลขเงินเดือนเดิม
    const salaryResult = salarySettingId
      ? await supabase.from("salary_settings").update(canSeePay ? salaryPayload : { leave_deduct_types: salaryPayload.leave_deduct_types }).eq("id", salarySettingId)
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
          <div style={{ fontSize: "0.9rem", fontWeight: 800, color: "#233862" }}>{canSeePay ? "ข้อมูลเงินเดือนและการสอนแทน" : "ระดับครู"}</div>
          <Field label="ระดับครู *">
            <select value={payrollConfig.teacher_level || ""} onChange={e => setPayrollConfig(f => ({ ...f, teacher_level: e.target.value }))} style={selectStyle}>
              <option value="">-- เลือกระดับครู --</option>
              {LEAVE_TEACHER_LEVELS.map(level => <option key={level} value={level}>ครู{level}</option>)}
            </select>
          </Field>
          {canSeePay && (<>
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
          </>)}
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
const LEAVE_LIST_COLUMNS = "id, employee_id, leave_type, duration_type, start_date, end_date, start_time, end_time, hours, reason, substitute_id, substitute_note, status, created_at";
const LAZY_LEAVE_DOCUMENT = "lazy:leave-document";

// รูปเอกสารลาที่เก็บเป็น base64 ในแถว: โหลดเฉพาะตอนกดดู
async function openLeaveDocument(row) {
  const url = row?.document_url;
  if (url && /^https?:/i.test(url)) { window.open(url, "_blank", "noopener"); return; }
  const win = window.open("", "_blank");
  const { data, error } = await supabase.from("leaves").select("document_url").eq("id", row.id).single();
  if (error || !data?.document_url) { if (win) win.close(); window.alert("โหลดเอกสารไม่สำเร็จ"); return; }
  if (win) { win.document.title = "เอกสารลา"; win.document.body.style.margin = "0"; const img = win.document.createElement("img"); img.src = data.document_url; img.style.maxWidth = "100%"; win.document.body.appendChild(img); }
}

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
        <div style={{ ...inputStyle, background: "#EAF5FF", color: "#0072D9", textAlign: "center", fontWeight: 700, border: "1.5px solid #B8E0FF" }}>
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
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "#0072D9", fontSize: "0.82rem", fontWeight: 600 }}>
                <RefreshCw size={15} style={{ animation: "spin 1s linear infinite" }} />
                กำลังเตรียมรูปภาพ...
              </div>
            )}
            {form.document_url && (
              <div style={{ border: "1px solid #DCEFFF", borderRadius: "12px", padding: "0.75rem", background: "#EAF5FF" }}>
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
        <div style={{ ...inputStyle, background: "#EAF5FF", color: "#0072D9", textAlign: "center", fontWeight: 700, border: "1.5px solid #B8E0FF" }}>
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
        const l = checkLate(a.check_in, wsOf(a.employee_id, settings?.work_start), settings?.late_grace_minutes);
        if (l?.late) late++;
        if (a.check_out) {
          const e = checkEarly(a.check_out, weOf(a.employee_id, settings?.work_end));
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
      info = checkLate(now.toISOString(), wsOf(selectedEmp, settings?.work_start), settings?.late_grace_minutes);
      if (info?.late) quoteType = "late";
      else if (info?.early) quoteType = "early";
      else quoteType = "onTime";
    } else {
      info = checkEarly(now.toISOString(), weOf(selectedEmp, settings?.work_end));
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
    <Modal title={mode === "in" ? "ลงเวลาเข้างาน" : "ลงเวลากลับบ้าน"} subtitle={`📍 รัศมี ${GEOFENCE_RADIUS} เมตรจากโรงเรียน`} onClose={onClose} icon={mode === "in" ? LogIn : LogOut} color={mode === "in" ? "#0072D9" : "#d97706"}>
      <div style={{ ...inputStyle, background: "#EAF5FF", color: "#0072D9", marginBottom: "1rem", textAlign: "center", fontWeight: 700, border: "1.5px solid #B8E0FF" }}>
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
        <div style={{ background: "#EAF5FF", border: "1.5px solid #8FD0FF", borderRadius: "12px", padding: "0.75rem", marginBottom: "1.25rem", textAlign: "center", color: "#0072D9", fontSize: "0.85rem", fontWeight: 700 }}>
          ลงเวลาเข้างานวันนี้แล้ว เวลา {fmtTime(openAttendance.check_in)} น. ถ้าจะกลับบ้านให้กดเมนูกลับบ้าน
        </div>
      )}

      {mode === "out" && selectedEmp && !openAttendance && (
        <div style={{ background: "#fef2f2", border: "1.5px solid #fca5a5", borderRadius: "12px", padding: "0.75rem", marginBottom: "1.25rem", textAlign: "center", color: "#dc2626", fontSize: "0.85rem", fontWeight: 600 }}>⚠️ ยังไม่ได้ลงเวลาเข้างานวันนี้</div>
      )}

      {mode === "out" && openAttendance && (
        <div style={{ background: "#EAF5FF", border: "1.5px solid #8FD0FF", borderRadius: "12px", padding: "0.75rem", marginBottom: "1.25rem", textAlign: "center", color: "#0072D9", fontSize: "0.85rem", fontWeight: 600 }}>🕐 เข้างานเมื่อ {fmtTime(openAttendance.check_in)} น.</div>
      )}

      <div style={{ display: "flex", justifyContent: "center", marginBottom: "1.25rem" }}>
        <div style={{ position: "relative", width: 140, height: 140 }}>
          <svg width={140} height={140} style={{ transform: "rotate(-90deg)" }}>
            <circle cx={70} cy={70} r={54} fill="none" stroke="#f1f5f9" strokeWidth={10} />
            <circle cx={70} cy={70} r={54} fill="none" stroke={ringColor} strokeWidth={10} strokeDasharray={circumference} strokeDashoffset={gpsState === "success" ? circumference * (1 - pct) : circumference} strokeLinecap="round" style={{ transition: "stroke-dashoffset 0.8s ease, stroke 0.4s ease" }} />
          </svg>
          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
            {gpsState === "loading" && <RefreshCw size={28} color="#008CFF" style={{ animation: "spin 1s linear infinite" }} />}
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
              else if (doneStatus.type === "early") badge = <div style={{ marginTop: "0.5rem", background: "#EAF5FF", border: "1px solid #8FD0FF", color: "#008CFF", padding: "0.4rem 0.6rem", borderRadius: "8px", fontSize: "0.8rem", fontWeight: 700 }}>⏰ เข้าก่อนเวลา {formatMinutes(doneStatus.minutes)}</div>;
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

          {!isTestTeacher(currentUser) && <MyEvalScoreCard currentUser={currentUser} />}
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
              <div style={{ background: "#EAF5FF", borderRadius: "8px", padding: "0.4rem", textAlign: "center" }}>
                <div style={{ fontSize: "1.1rem", fontWeight: 800, color: "#008CFF" }}>{myStats.outings}</div>
                <div style={{ fontSize: "0.65rem", color: "#008CFF", fontWeight: 600 }}>ออกนอก</div>
              </div>
            </div>
          </div>
        </>
      )}

      <div style={{ display: "flex", gap: "0.75rem" }}>
        <button onClick={fetchLocation} style={btnSecondary}><RefreshCw size={16} /> อัปเดต GPS</button>
        <button onClick={handleSubmit} disabled={!canSubmit} style={{ ...btnPrimary, background: done ? "#dcfce7" : canSubmit ? (mode === "in" ? "linear-gradient(135deg, #008CFF, #0072D9)" : "linear-gradient(135deg, #f59e0b, #d97706)") : "#e2e8f0", color: done ? "#16a34a" : canSubmit ? "#fff" : "#94a3b8", cursor: canSubmit ? "pointer" : "not-allowed" }}>
          {mode === "in" ? <LogIn size={18} /> : <LogOut size={18} />}
          {done ? "บันทึกแล้ว" : mode === "in" ? "ลงเวลาเข้างาน" : "ลงเวลากลับบ้าน"}
        </button>
      </div>
    </Modal>
  );
}

// ─── PAGES ────────────────────────────────────────────────────────────────────
function EmployeePage({ employees, currentUser, onRefresh }) {
  const canSeePay = isSalaryOwner(currentUser);
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
      const { data: salaryData } = await supabase.from("salary_settings").select(isSalaryOwner(currentUser) ? "*" : "employee_id, leave_deduct_types").not("employee_id", "is", null);
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
                {["#", "ชื่อ-นามสกุล", "Username", "แผนก", "ระดับ", ...(canSeePay ? ["ค่าจ้าง", "เงินเข้า บช"] : []), "สิทธิ์", "เครื่อง", "จัดการ"].map(h => (
                  <th key={h} style={{ padding: "0.75rem 1rem", textAlign: "left", color: "#64748b", fontWeight: 600, fontSize: "0.78rem", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={canSeePay ? 10 : 8} style={{ padding: "3rem", textAlign: "center", color: "#94a3b8" }}>ไม่พบข้อมูล</td></tr>
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
                        <span style={{ fontWeight: 600, color: "#233862" }}>{emp.name}</span>
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
                    <td style={{ padding: "0.75rem 1rem" }}><span style={{ background: "#EAF5FF", color: "#008CFF", fontSize: "0.75rem", fontWeight: 600, padding: "0.2rem 0.6rem", borderRadius: "20px" }}>{emp.department || "-"}</span></td>
                    <td style={{ padding: "0.75rem 1rem", color: "#475569", whiteSpace: "nowrap" }}>{salaryMeta.teacher_level ? `ครู${salaryMeta.teacher_level}` : "-"}</td>
                    {canSeePay && (<>
                    <td style={{ padding: "0.75rem 1rem", whiteSpace: "nowrap" }}>
                      <div style={{ color: "#233862", fontWeight: 800 }}>{formatMoney(salaryRow?.daily_rate || 0)}</div>
                      <div style={{ color: "#64748b", fontSize: "0.7rem" }}>{salaryMeta.pay_type === "monthly" ? "รายเดือน" : "รายวัน"}</div>
                    </td>
                    <td style={{ padding: "0.75rem 1rem", color: "#233862", fontWeight: 800, whiteSpace: "nowrap" }}>{formatMoney(salaryMeta.bank_deposit || 0)}</td>
                    </>)}
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
                        <button onClick={() => { setEditEmp(emp); setShowModal(true); }} style={iconBtn("#EAF5FF", "#008CFF")}><Edit size={15} /></button>
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
      {showModal && <EmployeeModal employee={editEmp} canSeePay={canSeePay} onClose={() => { setShowModal(false); setEditEmp(null); }} onSave={() => { setShowModal(false); setEditEmp(null); onRefresh(); }} />}
    </div>
  );
}

function AttendancePage({ employees, activityLog, currentUser, settings, onRefresh }) {
  const [showIn, setShowIn] = useState(false);
  const [showOut, setShowOut] = useState(false);
  const filtered = hasAdminRights(currentUser) ? activityLog : activityLog.filter(a => a.employee_id === currentUser?.id);

  return (
    <div>
      <PageHeader title="ลงเวลาเข้า-ออก" count={filtered.length} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1.5rem" }}>
        <button onClick={() => setShowIn(true)} style={{ background: "linear-gradient(135deg, #008CFF, #0072D9)", border: "none", borderRadius: "1rem", padding: "1.5rem", color: "#fff", cursor: "pointer", fontFamily: "inherit", boxShadow: "0 8px 24px rgba(0,140,255,0.3)", display: "flex", flexDirection: "column", alignItems: "center", gap: "0.5rem" }}>
          <LogIn size={32} /><div style={{ fontSize: "1.1rem", fontWeight: 800 }}>ลงเวลาเข้างาน</div>
          <div style={{ fontSize: "0.75rem", opacity: 0.9 }}>เวลาทำงาน: {wsOf(currentUser?.id, settings?.work_start)?.slice(0,5)} น.</div>
        </button>
        <button onClick={() => setShowOut(true)} style={{ background: "linear-gradient(135deg, #f59e0b, #d97706)", border: "none", borderRadius: "1rem", padding: "1.5rem", color: "#fff", cursor: "pointer", fontFamily: "inherit", boxShadow: "0 8px 24px rgba(245,158,11,0.3)", display: "flex", flexDirection: "column", alignItems: "center", gap: "0.5rem" }}>
          <LogOut size={32} /><div style={{ fontSize: "1.1rem", fontWeight: 800 }}>ลงเวลากลับบ้าน</div>
          <div style={{ fontSize: "0.75rem", opacity: 0.9 }}>เวลาเลิก: {weOf(currentUser?.id, settings?.work_end)?.slice(0,5)} น.</div>
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
                const lateInfo = checkLate(row.check_in, wsOf(row.employee_id, settings?.work_start), settings?.late_grace_minutes);
                const earlyInfo = row.check_out ? checkEarly(row.check_out, weOf(row.employee_id, settings?.work_end)) : null;
                const isTraining = row.work_activity === "training";
                return (
                  <tr key={row.id} style={{ borderBottom: "1px solid #f8fafc", background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                    <td style={{ padding: "0.65rem 0.75rem" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                        <Avatar name={row.employees?.name} index={i} />
                        <span style={{ fontWeight: 600, color: "#233862" }}>{row.employees?.name || "-"}</span>
                      </div>
                    </td>
                    <td style={{ padding: "0.65rem 0.75rem", color: "#475569" }}>{fmtDate(row.check_in)}</td>
                    <td style={{ padding: "0.65rem 0.75rem" }}>
                      <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem", minWidth: 150 }}>
                        <span style={{ background: isTraining ? "#DCEFFF" : "#f1f5f9", color: isTraining ? "#0072D9" : "#475569", fontSize: "0.7rem", fontWeight: 800, padding: "0.2rem 0.5rem", borderRadius: "20px", width: "fit-content" }}>
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
                          <span style={{ background: "#EAF5FF", color: "#008CFF", fontSize: "0.7rem", fontWeight: 700, padding: "0.2rem 0.5rem", borderRadius: "20px" }}>⏰ เข้าก่อน {formatMinutes(lateInfo.minutes)}</span>
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
  const filtered = hasAdminRights(currentUser) ? leaves : leaves.filter(l => l.employee_id === currentUser?.id);

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
                      <span style={{ fontWeight: 600, color: "#233862" }}>{row.employees?.name || "-"}</span>
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
                        <a href={row.document_url === LAZY_LEAVE_DOCUMENT ? "#" : row.document_url} onClick={event => { if (row.document_url === LAZY_LEAVE_DOCUMENT || String(row.document_url).startsWith("data:")) { event.preventDefault(); openLeaveDocument(row); } }} target="_blank" rel="noreferrer" style={{ background: "#EAF5FF", color: "#0072D9", fontSize: "0.72rem", fontWeight: 700, padding: "0.28rem 0.6rem", borderRadius: "20px", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: "0.3rem" }}>
                          <FileText size={13} /> ใบนัดหมอ · ไม่หักลา
                        </a>
                      ) : <span style={{ color: "#94a3b8", fontSize: "0.78rem" }}>—</span>}
                  </td>
                  <td style={{ padding: "0.65rem 0.75rem" }}>{stsBadge(row.status)}</td>
                  <td style={{ padding: "0.65rem 0.75rem" }}>
                    <div style={{ display: "flex", gap: "0.3rem" }}>
                      {hasAdminRights(currentUser) && row.status === "pending" && (
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
  const filtered = hasAdminRights(currentUser) ? outings : outings.filter(o => o.employee_id === currentUser?.id);

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
                      <span style={{ fontWeight: 600, color: "#233862" }}>{row.employees?.name || "-"}</span>
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
    const lateCount = attDays.filter(a => checkLate(a.check_in, wsOf(a.employee_id, settings?.work_start))?.late).length;
    const earlyArrival = attDays.filter(a => checkLate(a.check_in, wsOf(a.employee_id, settings?.work_start))?.early).length;
    const earlyDeparture = attDays.filter(a => a.check_out && checkEarly(a.check_out, weOf(a.employee_id, settings?.work_end))?.early).length;
    const overtime = attDays.filter(a => a.check_out && checkEarly(a.check_out, weOf(a.employee_id, settings?.work_end))?.late).length;
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
    const lateInfo = firstRow ? checkLate(firstRow.check_in, wsOf(firstRow.employee_id, settings?.work_start)) : null;
    const earlyInfo = lastRowWithCheckOut ? checkEarly(lastRowWithCheckOut.check_out, weOf(lastRowWithCheckOut.employee_id, settings?.work_end)) : null;
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
        const li = checkLate(a.check_in, wsOf(a.employee_id, settings?.work_start));
        const ei = a.check_out ? checkEarly(a.check_out, weOf(a.employee_id, settings?.work_end)) : null;
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
        const li = checkLate(a.check_in, wsOf(a.employee_id, settings?.work_start));
        const ei = a.check_out ? checkEarly(a.check_out, weOf(a.employee_id, settings?.work_end)) : null;
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
        const li = checkLate(a.check_in, wsOf(a.employee_id, settings?.work_start));
        if (li?.late) csv += csvRow([a.employees?.name || "-", fmtDate(a.check_in), fmtTime(a.check_in), li.minutes]);
      });
    } else if (reportType === "earlyLeave") {
      csv = csvRow(["พนักงาน", "วันที่", "เวลากลับ", "กลับก่อน(นาที)"]);
      attendanceRows.filter(a => a.check_out).forEach(a => {
        const ei = checkEarly(a.check_out, weOf(a.employee_id, settings?.work_end));
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
    { key: "summary", label: "สรุปภาพรวม", icon: BarChart3, color: "#008CFF" },
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
          <h1 style={{ fontSize: "1.4rem", fontWeight: 800, color: "#233862" }}>รายงาน</h1>
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
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "1rem", padding: "0.65rem 1rem", background: "#EAF5FF", borderRadius: "10px" }}>
            <Calendar size={16} color="#008CFF" />
            <div><div style={{ fontSize: "0.72rem", color: "#64748b" }}>วันทำงาน</div><div style={{ fontWeight: 800, color: "#0072D9" }}>{workDays} วัน</div></div>
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
                          <span style={{ fontWeight: 600, color: "#233862", whiteSpace: "nowrap" }}>{r.emp.name}</span>
                        </div>
                      </td>
                      <td style={{ padding: "0.6rem 0.75rem", color: "#64748b" }}>{r.emp.department || "-"}</td>
                      <td style={{ padding: "0.6rem 0.75rem" }}><span style={{ color: "#16a34a", fontWeight: 700 }}>{r.attended}</span></td>
                      <td style={{ padding: "0.6rem 0.75rem", color: r.lateCount > 0 ? "#dc2626" : "#94a3b8", fontWeight: 700 }}>{r.lateCount}</td>
                      <td style={{ padding: "0.6rem 0.75rem", color: "#008CFF", fontWeight: 600 }}>{r.earlyArrival}</td>
                      <td style={{ padding: "0.6rem 0.75rem", color: r.earlyDeparture > 0 ? "#dc2626" : "#94a3b8", fontWeight: 600 }}>{r.earlyDeparture}</td>
                      <td style={{ padding: "0.6rem 0.75rem", color: "#16a34a", fontWeight: 600 }}>{r.overtime}</td>
                      <td style={{ padding: "0.6rem 0.75rem", color: "#7c3aed", fontWeight: 600 }}>{r.leaveDays}</td>
                      <td style={{ padding: "0.6rem 0.75rem", color: r.absent > 0 ? "#dc2626" : "#94a3b8", fontWeight: 700 }}>{r.absent}</td>
                      <td style={{ padding: "0.6rem 0.75rem", color: "#d97706", fontWeight: 600 }}>{r.outingCount}</td>
                      <td style={{ padding: "0.6rem 0.75rem", color: "#0072D9", fontWeight: 700 }}>{r.totalHours}</td>
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
                    const li = checkLate(a.check_in, wsOf(a.employee_id, settings?.work_start));
                    const ei = a.check_out ? checkEarly(a.check_out, weOf(a.employee_id, settings?.work_end)) : null;
                    const hours = a.check_out ? ((new Date(a.check_out) - new Date(a.check_in)) / 3600000).toFixed(1) : "-";
                    return (
                      <tr key={a.id} style={{ borderBottom: "1px solid #f8fafc", background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                        <td style={{ padding: "0.6rem 0.75rem", fontWeight: 600, color: "#233862" }}>{a.employees?.name || "-"}</td>
                        <td style={{ padding: "0.6rem 0.75rem", color: "#475569" }}>{fmtDate(a.check_in)}</td>
                        <td style={{ padding: "0.6rem 0.75rem", color: "#16a34a", fontWeight: 600 }}>{fmtTime(a.check_in)}</td>
                        <td style={{ padding: "0.6rem 0.75rem", color: "#d97706", fontWeight: 600 }}>{a.check_out ? fmtTime(a.check_out) : "-"}</td>
                        <td style={{ padding: "0.6rem 0.75rem", fontWeight: 600 }}>{hours} ชม.</td>
                        <td style={{ padding: "0.6rem 0.75rem" }}>
                          {li?.late ? <span style={{ background: "#fef2f2", color: "#dc2626", fontSize: "0.7rem", fontWeight: 700, padding: "0.2rem 0.5rem", borderRadius: "20px" }}>สาย {formatMinutes(li.minutes)}</span>
                          : li?.early ? <span style={{ background: "#EAF5FF", color: "#008CFF", fontSize: "0.7rem", fontWeight: 700, padding: "0.2rem 0.5rem", borderRadius: "20px" }}>เข้าก่อน {formatMinutes(li.minutes)}</span>
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
                <div style={{ display: "grid", gridTemplateColumns: "120px 100px", justifyContent: "center", gap: "0.25rem 1rem", color: "#233862", fontSize: "0.9rem", fontWeight: 800, marginBottom: "1rem" }}>
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
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem", border: "2px solid #233862" }}>
                        <thead>
                          <tr>
                            <th rowSpan={2} style={{ background: "#DCEFFF", border: "1px solid #233862", padding: "0.5rem", textAlign: "center", width: 64 }}>ลำดับ</th>
                            <th rowSpan={2} style={{ background: "#DCEFFF", border: "1px solid #233862", padding: "0.5rem", textAlign: "center", minWidth: 220 }}>ชื่อ - นามสกุล</th>
                            <th rowSpan={2} style={{ background: "#DCEFFF", border: "1px solid #233862", padding: "0.5rem", textAlign: "center", width: 110 }}>ลงเวลาเข้า</th>
                            <th rowSpan={2} style={{ background: "#DCEFFF", border: "1px solid #233862", padding: "0.5rem", textAlign: "center", width: 110 }}>ลงเวลาออก</th>
                            <th colSpan={2} style={{ background: "#fed7aa", border: "1px solid #233862", padding: "0.5rem", textAlign: "center" }}>มาสาย</th>
                            <th colSpan={2} style={{ background: "#fed7aa", border: "1px solid #233862", padding: "0.5rem", textAlign: "center" }}>เลิกก่อน</th>
                          </tr>
                          <tr>
                            {["ช.ม.", "นาที", "ช.ม.", "นาที"].map((h, index) => (
                              <th key={`${h}-${index}`} style={{ background: "#fed7aa", border: "1px solid #233862", padding: "0.45rem", textAlign: "center", width: 78 }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((row, index) => (
                            <tr key={`${date.key}-${row.emp.id}`} style={{ background: index % 2 === 0 ? "#fff" : "#f8fafc" }}>
                              <td style={{ border: "1px solid #233862", padding: "0.45rem", textAlign: "center", fontWeight: 800 }}>{index + 1}</td>
                              <td style={{ border: "1px solid #233862", padding: "0.45rem 0.6rem", fontWeight: 700, color: "#233862" }}>{row.emp.name}</td>
                              <td style={{ border: "1px solid #233862", padding: "0.45rem", textAlign: "center", fontWeight: 800, color: row.checkInText === "-" ? "#94a3b8" : "#233862" }}>{row.checkInText === "-" ? "-" : `${row.checkInText} น.`}</td>
                              <td style={{ border: "1px solid #233862", padding: "0.45rem", textAlign: "center", fontWeight: 800, color: row.checkOutText.includes("ยังไม่กลับ") ? "#dc2626" : "#233862" }}>{row.checkOutText === "-" ? "-" : `${row.checkOutText} น.`}</td>
                              <td style={{ border: "1px solid #233862", padding: "0.45rem", textAlign: "center", color: row.lateHours !== "" ? "#dc2626" : "#233862", fontWeight: row.lateHours !== "" ? 900 : 500 }}>{row.lateHours}</td>
                              <td style={{ border: "1px solid #233862", padding: "0.45rem", textAlign: "center", color: row.lateMinutes !== "" ? "#dc2626" : "#233862", fontWeight: row.lateMinutes !== "" ? 900 : 500 }}>{row.lateMinutes}</td>
                              <td style={{ border: "1px solid #233862", padding: "0.45rem", textAlign: "center", color: row.earlyHours !== "" ? "#dc2626" : "#233862", fontWeight: row.earlyHours !== "" ? 900 : 500 }}>{row.earlyHours}</td>
                              <td style={{ border: "1px solid #233862", padding: "0.45rem", textAlign: "center", color: row.earlyMinutes !== "" ? "#dc2626" : "#233862", fontWeight: row.earlyMinutes !== "" ? 900 : 500 }}>{row.earlyMinutes}</td>
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
                  {attendance.filter(a => inMonth(a.check_in) && (!empFilter || a.employee_id === empFilter)).filter(a => checkLate(a.check_in, wsOf(a.employee_id, settings?.work_start))?.late).map((a, i) => {
                    const li = checkLate(a.check_in, wsOf(a.employee_id, settings?.work_start));
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
    plan_title: "",
    plan_class: "",
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
    worksheet_images: [],
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
    plan_title: source.plan_title || "",
    plan_class: source.plan_class || "",
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
    worksheet_images: Array.isArray(source.worksheet_images) ? source.worksheet_images.filter(img => img && (img.url || img.dataUrl)).slice(0, 12) : [],
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

// กำหนดส่งแผนรายสัปดาห์: วันอาทิตย์ก่อนสัปดาห์สอน ก่อนเวลา 08:00 (เวลาไทย)
const SUPERVISION_DEADLINE_TIME = "08:00";
function supervisionDeadlineDate(weekStart) {
  return shiftDateKey(weekStart, -1);
}

function supervisionDeadlineStamp(weekStart) {
  return `${supervisionDeadlineDate(weekStart)}T${SUPERVISION_DEADLINE_TIME}:00`;
}

function supervisionDeadlineText(weekStart) {
  return `ส่งภายในวันอาทิตย์ ${formatThaiDateKey(supervisionDeadlineDate(weekStart))} ก่อนเวลา ${SUPERVISION_DEADLINE_TIME} น.`;
}

function resolveSubmission(nextStatus, previousStatus, previousSubmittedAt, previousLate, weekStart) {
  if (nextStatus !== "submitted") return { status: nextStatus || "draft", submitted_at: null, late: false };
  if (previousStatus === "submitted" && previousSubmittedAt) {
    return { status: "submitted", submitted_at: previousSubmittedAt, late: !!previousLate };
  }
  const submittedAt = new Date().toISOString();
  return { status: "submitted", submitted_at: submittedAt, late: bangkokDateTimeKey(submittedAt) >= supervisionDeadlineStamp(weekStart) };
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

// แผนทั้งสัปดาห์สำหรับหน้าผู้บริหาร (หลายการ์ดใช้ข้อมูลชุดเดียวกัน) แคช 60 วินาที ล้างทันทีเมื่อมีการบันทึก
function fetchWeekPlansForExec(weekKey) {
  return cached(`exec-week-plans:${weekKey}`, 60000, async () => {
    const { data, error } = await supabase.from("teaching_schedule").select("id, employee_id, period, start_time, end_time, subject, created_at").eq("class_room", SUPERVISION_SCHEDULE_ROOM).eq("day_of_week", 0).eq("period", weekKey);
    if (error) throw new Error(error.message);
    return data || [];
  }).then(rows => ({ data: rows.map(row => ({ ...row })), error: null }), err => ({ data: null, error: { message: err.message } }));
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
// ─── ตารางสอนรายสัปดาห์ (ครูกรอกเอง · ผู้บริหาร/แอดมินดูได้ทั้งหมด) ───────────────
const TIMETABLE_SPECIAL_ROOMS = [ROOM_BOOKING_ROOM, ROOM_BOOKING_ROOMS_ROOM, SUPERVISION_SCHEDULE_ROOM, STUDENT_ROLL_ROOM, ACADEMIC_RECORD_ROOM, ACTIVITY_PLAN_ROOM, "__TEACHER_EVAL__", "__CLEANING_DUTY__", "__LOGIN_SESSION__", "__WORK_HOURS__", KG_SHORT_PLAN_ROOM];
const TIMETABLE_PERIODS = [1, 2, 3, 4, 5, 6, 7, 8];
const TIMETABLE_DEFAULT_TIMES = [["08:30", "09:20"], ["09:20", "10:10"], ["10:20", "11:10"], ["11:10", "12:00"], ["13:00", "13:50"], ["13:50", "14:40"], ["14:40", "15:30"], ["15:30", "16:20"]];
const isTimetableRow = row => row && row.day_of_week >= 1 && row.day_of_week <= 5 && !String(row.class_room || "").startsWith("__") && !TIMETABLE_SPECIAL_ROOMS.includes(row.class_room);

function fetchTimetableRows(employeeId = null) {
  return cached(`timetable:${employeeId || "all"}`, 120000, () => fetchTimetableRowsRaw(employeeId)).then(rows => rows.map(row => ({ ...row })));
}

async function fetchTimetableRowsRaw(employeeId = null) {
  let query = supabase.from("teaching_schedule").select("id, employee_id, day_of_week, period, subject, class_room, start_time, end_time").gte("day_of_week", 1).lte("day_of_week", 5).order("day_of_week").order("period");
  if (employeeId) query = query.eq("employee_id", employeeId);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data || []).filter(isTimetableRow);
}

function timetableSlotLabel(row) {
  return [row?.subject, row?.class_room].filter(text => String(text || "").trim()).join(" · ");
}

function SchedulePage({ employees, currentUser, onOpenPlan }) {
  const canViewAll = currentUser?.role === "admin" || isExecutiveUser(currentUser);
  const [viewId, setViewId] = useState(String(currentUser?.id || ""));
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [viewPlan, setViewPlan] = useState(null);
  const isMine = String(viewId) === String(currentUser?.id);
  const todayDow = new Date(`${todayISO()}T00:00:00`).getDay();
  const weekStart = mondayOf(todayISO());

  const load = async () => {
    try {
      setRows(await fetchTimetableRows(canViewAll ? null : currentUser.id));
      setError("");
    } catch (err) {
      setRows([]);
      setError(`โหลดตารางสอนไม่สำเร็จ: ${err.message}`);
    }
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [currentUser?.id]);

  const mine = (rows || []).filter(row => String(row.employee_id) === String(viewId));
  const cellRows = (day, period) => mine.filter(row => row.day_of_week === day && Number(row.period) === period);
  const maxPeriod = Math.max(6, ...mine.map(row => Number(row.period) || 0));
  const periods = TIMETABLE_PERIODS.filter(no => no <= Math.max(maxPeriod, 6));
  const nameOf = id => (employees || []).find(emp => String(emp.id) === String(id))?.name || "-";
  const viewer = (employees || []).find(emp => String(emp.id) === String(viewId)) || (isMine ? currentUser : null);

  const startEdit = (day, period) => {
    if (!isMine) return;
    const row = cellRows(day, period)[0];
    const [start, end] = TIMETABLE_DEFAULT_TIMES[period - 1] || ["", ""];
    setEditing({ id: row?.id || null, day, period, subject: row?.subject || "", class_room: row?.class_room || "", start_time: String(row?.start_time || start).slice(0, 5), end_time: String(row?.end_time || end).slice(0, 5) });
    setMessage("");
  };

  const saveEdit = async () => {
    if (!editing.subject.trim()) { setError("กรุณากรอกวิชา"); return; }
    if (editing.class_room.trim().startsWith("__")) { setError("ชื่อห้องห้ามขึ้นต้นด้วย __"); return; }
    setSaving(true);
    const payload = { employee_id: currentUser.id, day_of_week: editing.day, period: editing.period, subject: editing.subject.trim(), class_room: editing.class_room.trim() || null, start_time: editing.start_time ? `${editing.start_time}:00` : "00:00:00", end_time: editing.end_time ? `${editing.end_time}:00` : null };
    const result = editing.id
      ? await supabase.from("teaching_schedule").update(payload).eq("id", editing.id).select("id").single()
      : await supabase.from("teaching_schedule").insert(payload).select("id").single();
    setSaving(false);
    if (result.error) { setError(`บันทึกไม่สำเร็จ: ${result.error.message}`); return; }
    const saved = { ...payload, id: result.data.id };
    setRows(current => [...(current || []).filter(row => row.id !== editing.id), saved]);
    setMessage(`บันทึกวัน${DAY_NAMES[editing.day]} คาบ ${editing.period} แล้ว`);
    setError("");
    setEditing(null);
  };

  const removeEdit = async () => {
    if (!editing?.id || !window.confirm(`ลบวัน${DAY_NAMES[editing.day]} คาบ ${editing.period} ออกจากตารางสอน?`)) return;
    setSaving(true);
    const { error: delError } = await supabase.from("teaching_schedule").delete().eq("id", editing.id).eq("employee_id", currentUser.id);
    setSaving(false);
    if (delError) { setError(`ลบไม่สำเร็จ: ${delError.message}`); return; }
    setRows(current => (current || []).filter(row => row.id !== editing.id));
    setMessage("ลบคาบแล้ว");
    setEditing(null);
  };

  const openPlan = (day, period) => {
    // แผนส่งล่วงหน้า: ศุกร์-อาทิตย์ ให้เปิดแผนของสัปดาห์หน้า (เหมือนหน้าแผนการสอน) ไม่ใช่สัปดาห์ที่สอนผ่านไปแล้ว
    const date = shiftDateKey(defaultPlanWeek(), day - 1);
    if (isMine) onOpenPlan?.({ date, period });
    else setViewPlan({ emp: viewer || { id: viewId, name: nameOf(viewId) }, focus: { date, period } });
  };

  const th = { padding: "0.45rem 0.4rem", fontSize: "0.8rem", fontWeight: 800, color: "#233862", background: "#F3F8FD", borderBottom: "1px solid #E4EEF8", textAlign: "center", whiteSpace: "nowrap" };
  const small = { ...inputStyle, padding: "0.4rem 0.55rem", fontSize: "0.88rem" };
  const people = canViewAll ? [...new Map([[String(currentUser.id), currentUser], ...(employees || []).map(emp => [String(emp.id), emp])]).values()] : [];

  return (
    <div style={{ display: "grid", gap: "1rem" }}>
      <div style={{ background: "linear-gradient(90deg, #008CFF, #3EBFFB)", borderRadius: 18, padding: "1rem 1.2rem", color: "#fff", boxShadow: "0 4px 24px rgba(0,140,255,0.2)" }}>
        <div style={{ fontSize: "1.2rem", fontWeight: 800 }}>ตารางสอน</div>
        <div style={{ fontSize: "0.85rem", opacity: 0.9 }}>{isMine ? "กรอกตารางสอนของท่าน (วันจันทร์–ศุกร์ × คาบ) กดช่องเพื่อเพิ่ม/แก้ไข ข้อมูลนี้ใช้ในแผนรายคาบและหน้าผู้บริหาร" : `ตารางสอนของ ${viewer?.name || nameOf(viewId)} (ดูอย่างเดียว)`}</div>
      </div>
      {canViewAll && (
        <Card padding="0.8rem">
          <Field label="ดูตารางสอนของ">
            <select aria-label="ดูตารางสอนของ" value={viewId} onChange={event => { setViewId(event.target.value); setEditing(null); }} style={{ ...small, maxWidth: 360 }}>
              {people.map(emp => <option key={emp.id} value={String(emp.id)}>{emp.name}{String(emp.id) === String(currentUser.id) ? " (ของฉัน)" : ""} · {(rows || []).filter(row => String(row.employee_id) === String(emp.id)).length} คาบ</option>)}
            </select>
          </Field>
        </Card>
      )}
      {error && <ErrorBox>{error}</ErrorBox>}
      {message && <div style={{ background: "#ecfdf5", border: "1px solid #bbf7d0", borderRadius: 10, padding: "0.5rem 0.8rem", color: "#166534", fontWeight: 700, fontSize: "0.88rem" }}>{message}</div>}
      {editing && (
        <Card padding="0.9rem">
          <div style={{ fontWeight: 800, color: "#233862", marginBottom: "0.6rem" }}>{editing.id ? "แก้ไข" : "เพิ่ม"}คาบ · วัน{DAY_NAMES[editing.day]} คาบที่ {editing.period}</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 150px), 1fr))", gap: "0.55rem" }}>
            <Field label="วิชา *"><input aria-label="วิชา" value={editing.subject} onChange={event => setEditing(current => ({ ...current, subject: event.target.value }))} placeholder="เช่น ภาษาไทย" style={small} /></Field>
            <Field label="ห้อง/ชั้น"><input aria-label="ห้อง/ชั้น" value={editing.class_room} onChange={event => setEditing(current => ({ ...current, class_room: event.target.value }))} placeholder="เช่น ป.2/1" style={small} /></Field>
            <Field label="เวลาเริ่ม"><input type="time" value={editing.start_time} onChange={event => setEditing(current => ({ ...current, start_time: event.target.value }))} style={small} /></Field>
            <Field label="เวลาสิ้นสุด"><input type="time" value={editing.end_time} onChange={event => setEditing(current => ({ ...current, end_time: event.target.value }))} style={small} /></Field>
          </div>
          <div style={{ display: "flex", gap: "0.45rem", marginTop: "0.7rem", flexWrap: "wrap" }}>
            <button type="button" disabled={saving} onClick={saveEdit} style={{ ...btnPrimary, flex: "none", padding: "0.5rem 1.1rem", background: "linear-gradient(90deg, #008CFF, #3EBFFB)", color: "#fff", cursor: saving ? "wait" : "pointer" }}><Save size={15} /> บันทึกคาบ</button>
            {editing.id && <button type="button" disabled={saving} onClick={removeEdit} style={{ ...btnSecondary, flex: "none", color: "#b91c1c" }}><Trash2 size={15} /> ลบคาบ</button>}
            <button type="button" onClick={() => setEditing(null)} style={{ ...btnSecondary, flex: "none" }}>ยกเลิก</button>
          </div>
        </Card>
      )}
      <Card padding="0.8rem">
        {!rows ? <div style={{ color: "#64748b" }}>กำลังโหลดตารางสอน...</div> : (
          <>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 4, minWidth: 720 }}>
                <thead><tr><th style={th}>คาบ</th>{[1, 2, 3, 4, 5].map(day => <th key={day} style={{ ...th, color: day === todayDow ? "#008CFF" : th.color }}>{DAY_NAMES[day]}{day === todayDow ? " (วันนี้)" : ""}</th>)}</tr></thead>
                <tbody>
                  {periods.map(period => (
                    <tr key={period}>
                      <td style={{ ...th, background: "#fff", fontSize: "0.78rem" }}>{period}<div style={{ fontWeight: 500, color: "#94a3b8", fontSize: "0.68rem" }}>{(TIMETABLE_DEFAULT_TIMES[period - 1] || []).join("–")}</div></td>
                      {[1, 2, 3, 4, 5].map(day => {
                        const items = cellRows(day, period);
                        const active = editing && editing.day === day && editing.period === period;
                        return (
                          <td key={day} style={{ verticalAlign: "top", border: `1px ${items.length ? "solid" : "dashed"} ${active ? "#008CFF" : items.length ? "#B8E0FF" : "#E4EEF8"}`, background: items.length ? "#EAF5FF" : "#fff", borderRadius: 12, padding: "0.4rem 0.45rem", minWidth: 120, height: 64 }}>
                            {items.length === 0 ? (
                              isMine ? <button type="button" aria-label={`เพิ่มวัน${DAY_NAMES[day]} คาบ ${period}`} onClick={() => startEdit(day, period)} style={{ width: "100%", height: "100%", minHeight: 48, border: "none", background: "transparent", color: "#8FD0FF", fontSize: "1.2rem", cursor: "pointer" }}>+</button> : <span style={{ color: "#cbd5e1" }}>–</span>
                            ) : items.map(row => (
                              <div key={row.id} style={{ display: "grid", gap: "0.2rem" }}>
                                <button type="button" onClick={() => startEdit(day, period)} disabled={!isMine} style={{ border: "none", background: "transparent", padding: 0, textAlign: "left", cursor: isMine ? "pointer" : "default", fontFamily: "inherit" }}>
                                  <div style={{ fontWeight: 800, color: "#233862", fontSize: "0.85rem" }}>{row.subject}</div>
                                  <div style={{ color: "#596068", fontSize: "0.75rem" }}>{row.class_room || "-"}{row.start_time && row.start_time !== "00:00:00" ? ` · ${String(row.start_time).slice(0, 5)}` : ""}</div>
                                </button>
                                <button type="button" onClick={() => openPlan(day, period)} style={{ border: "none", background: "linear-gradient(90deg, #FF7106, #FF9A3C)", color: "#fff", borderRadius: 999, padding: "0.12rem 0.5rem", fontSize: "0.7rem", fontWeight: 800, cursor: "pointer", width: "fit-content", fontFamily: "inherit" }}>แผนรายคาบ</button>
                              </div>
                            ))}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ fontSize: "0.75rem", color: "#64748b", marginTop: "0.45rem" }}>
              {mine.length === 0 ? (isMine ? "ยังไม่มีตารางสอน กดเครื่องหมาย + ในช่องเพื่อเพิ่มคาบ" : "ครูท่านนี้ยังไม่ได้กรอกตารางสอน") : `รวม ${mine.length} คาบ/สัปดาห์`} · ปุ่ม "แผนรายคาบ" เปิดแผนของคาบนั้นในสัปดาห์ปัจจุบัน
            </div>
          </>
        )}
      </Card>
      {viewPlan && <ExecPlanModal teacher={viewPlan.emp} weekStart={weekStart} focus={viewPlan.focus} onClose={() => setViewPlan(null)} />}
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
    approved: { bg: "#DCEFFF", color: "#0072D9", label: "รับทราบแล้ว" },
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
          <div style={{ fontWeight: 800, color: "#233862" }}>{formatWeekLabel(weekStart)}</div>
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
        <div style={{ fontWeight: 800, color: "#233862", wordBreak: "break-word" }}>{file.name || "ไฟล์"}</div>
        <a href={file.dataUrl} download={file.name || "ไฟล์"} style={{ ...btnSecondary, flex: "none", textDecoration: "none" }}>ดาวน์โหลด</a>
      </div>
      {isImage && <img src={file.dataUrl} alt={file.name || "ไฟล์แผน"} style={{ width: "100%", maxHeight: 320, objectFit: "contain", borderRadius: "12px", background: "#f8fafc", border: "1px solid #e2e8f0" }} />}
      {isPdf && <iframe title={file.name || "ไฟล์แผน"} src={file.dataUrl} style={{ width: "100%", height: 420, border: "1px solid #e2e8f0", borderRadius: "12px", background: "#fff" }} />}
    </div>
  );
}

function FullText({ value }) {
  const text = String(value || "").trim();
  return <div style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", color: text ? "#233862" : "#94a3b8", lineHeight: 1.65, fontSize: "0.95rem" }}>{text || "ไม่มีข้อมูล"}</div>;
}

function LinkLines({ value }) {
  const lines = String(value || "").split(/\n/).map(line => line.trim()).filter(Boolean);
  if (lines.length === 0) return <div style={{ color: "#94a3b8" }}>ไม่มีข้อมูล</div>;
  return (
    <div style={{ display: "grid", gap: "0.35rem" }}>
      {lines.map((line, index) => (
        /^https?:\/\//i.test(line)
          ? <a key={`${line}-${index}`} href={line} target="_blank" rel="noreferrer" style={{ color: "#0072D9", wordBreak: "break-all" }}>{line}</a>
          : <div key={`${line}-${index}`} style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", color: "#233862" }}>{line}</div>
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
    kpa_text: "",
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
  const out = { ...base, kpa_text: typeof raw.kpa_text === "string" ? text(raw.kpa_text, 4000) : legacyKpaText(raw) };
  ["problems", "solutions", "suggestions", "admin_comment"].forEach(key => { out[key] = text(raw[key]); });
  ["teacher_sign", "admin_sign"].forEach(key => { out[key] = text(raw[key], 120); });
  ["teacher_date", "admin_date"].forEach(key => { out[key] = /^\d{4}-\d{2}-\d{2}$/.test(raw[key] || "") ? raw[key] : ""; });
  return out;
}

// บันทึกเก่าที่เคยกรอกเป็นตัวเลข ผ่าน/ไม่ผ่าน → แปลงเป็นข้อความเพื่อให้ยังอ่านได้
function legacyKpaText(raw) {
  if (!raw || typeof raw !== "object") return "";
  const total = countText(raw.total);
  const lines = [];
  if (total) lines.push(`นักเรียนทั้งหมด ${total} คน`);
  POST_NOTE_DOMAINS.forEach(({ key, label }) => {
    const pass = countText(raw[key]?.pass);
    const fail = countText(raw[key]?.fail);
    if (!pass && !fail) return;
    const pct = count => postNotePercent(count, total) ? ` (${postNotePercent(count, total)})` : "";
    lines.push(`${label}: ผ่าน ${pass || "-"} คน${pct(pass)} · ไม่ผ่าน ${fail || "-"} คน${pct(fail)}`);
  });
  return lines.join("\n");
}

function postNoteHasData(note) {
  if (!note) return false;
  const kpa = typeof note.kpa_text === "string" ? note.kpa_text : legacyKpaText(note);
  return !!(String(kpa || "").trim()
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

async function uploadLessonImage(file, employeeId) {
  const source = await readFileAsDataUrl(file);
  const image = await new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("เปิดรูปภาพไม่สำเร็จ"));
    img.src = source;
  });
  const scale = Math.min(1, 1280 / Math.max(image.width, image.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(image.width * scale);
  canvas.height = Math.round(image.height * scale);
  const ctx = canvas.getContext("2d");
  if (ctx) ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  const dataUrl = ctx ? canvas.toDataURL("image/jpeg", 0.8) : source;
  const name = file.name || "worksheet.jpg";
  try {
    const blob = await (await fetch(dataUrl)).blob();
    const objectPath = `${employeeId || "unknown"}/${todayISO()}/img-${newSupervisionId()}.jpg`;
    const { error } = await supabase.storage.from(LESSON_FILE_BUCKET).upload(objectPath, blob, { contentType: "image/jpeg", upsert: false });
    if (!error) {
      const { data } = supabase.storage.from(LESSON_FILE_BUCKET).getPublicUrl(objectPath);
      if (data?.publicUrl) return { name, url: data.publicUrl, path: objectPath, storage: "supabase" };
    }
  } catch { /* ไม่มี bucket → เก็บแบบย่อขนาดในแผน */ }
  return { name, dataUrl, storage: "inline" };
}

function printWorksheetImages(images, title) {
  const list = (images || []).map(lessonFileHref).filter(Boolean);
  if (!list.length) return;
  const win = window.open("", "_blank");
  if (!win) return;
  const esc = v => String(v || "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  win.document.open();
  win.document.write(`<!doctype html><html lang="th"><head><meta charset="utf-8"><title>${esc(title)}</title><style>@page{size:A4 landscape;margin:10mm}body{font-family:sans-serif;margin:0}h3{margin:0 0 6px}.g{display:flex;flex-wrap:wrap;gap:8px}img{max-width:48%;max-height:175mm;object-fit:contain;border:1px solid #999;page-break-inside:avoid}</style></head><body><h3>${esc(title)}</h3><div class="g">${list.map(u => `<img src="${esc(u)}">`).join("")}</div></body></html>`);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 800);
}

function WorksheetImages({ images, onRemove, title = "ใบงาน" }) {
  const [view, setView] = useState("");
  const list = (images || []).filter(img => lessonFileHref(img));
  if (!list.length) return onRemove ? <div style={{ color: "#94a3b8", fontSize: "0.9rem" }}>ยังไม่ได้แนบรูปใบงาน</div> : null;
  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
        {list.map((img, index) => (
          <div key={img.path || index} style={{ position: "relative" }}>
            <img src={lessonFileHref(img)} alt={img.name || "ใบงาน"} onClick={() => setView(lessonFileHref(img))} style={{ width: 104, height: 104, objectFit: "cover", borderRadius: 8, border: "1px solid #cbd5e1", cursor: "zoom-in" }} />
            {onRemove && <button type="button" title="ลบรูป" onClick={() => onRemove(index)} style={{ position: "absolute", top: 2, right: 2, background: "#dc2626", color: "#fff", border: "none", borderRadius: 999, width: 24, height: 24, cursor: "pointer", fontWeight: 800 }}>×</button>}
          </div>
        ))}
      </div>
      <button type="button" onClick={() => printWorksheetImages(list, title)} style={{ ...btnSecondary, flex: "none", marginTop: "0.5rem" }}>พิมพ์รูปใบงาน (A4 แนวนอน)</button>
      {view && <div onClick={() => setView("")} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", cursor: "zoom-out" }}><img src={view} alt="ใบงาน" style={{ maxWidth: "95vw", maxHeight: "95vh" }} /></div>}
    </div>
  );
}

function WorksheetLink({ file }) {
  const href = lessonFileHref(file);
  if (!href) return <div style={{ color: "#94a3b8", fontSize: "0.9rem" }}>ยังไม่ได้แนบใบงาน PDF</div>;
  return (
    <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
      <FileText size={18} color="#dc2626" />
      <span style={{ fontWeight: 700, color: "#233862", wordBreak: "break-word" }}>{file.name || "ใบงาน.pdf"}</span>
      <a href={href} target="_blank" rel="noreferrer" style={{ ...btnSecondary, flex: "none", textDecoration: "none" }}>เปิดดู</a>
      <a href={href} download={file.name || "ใบงาน.pdf"} style={{ ...btnSecondary, flex: "none", textDecoration: "none" }}>ดาวน์โหลด</a>
      {file.storage === "inline" && <span style={{ fontSize: "0.75rem", color: "#b45309" }}>(เก็บในแผน ยังไม่ได้ใช้ Storage)</span>}
    </div>
  );
}

function YoutubePreview({ url }) {
  const [play, setPlay] = useState(false);
  const id = youtubeId(url);
  if (!id) return <a href={url} target="_blank" rel="noreferrer" style={{ color: "#0072D9", wordBreak: "break-all" }}>{url}</a>;
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
      <a href={url} target="_blank" rel="noreferrer" style={{ color: "#0072D9", fontSize: "0.8rem", wordBreak: "break-all" }}>{url}</a>
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
  return (
    <div style={{ display: "grid", gap: "0.75rem" }}>
      <Field label="1. ผลการจัดกิจกรรมการเรียนรู้ (K/P/A)">
        <textarea value={value.kpa_text} disabled={disabled} placeholder={"K (ความรู้): เช่น นักเรียน 26 จาก 30 คน อธิบายหลักการ... ได้ถูกต้อง\nP (ทักษะกระบวนการ): เช่น ทำการทดลอง บันทึกผลได้...\nA (คุณลักษณะ): เช่น ตั้งใจ ทำงานร่วมกับผู้อื่น..."} onChange={event => set({ kpa_text: event.target.value })} style={{ ...periodArea, minHeight: 120 }} />
      </Field>
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
    <div style={{ background: "#EAF5FF", border: "1px solid #B8E0FF", borderRadius: "12px", padding: "0.6rem 0.75rem" }}>
      <div style={{ fontWeight: 800, color: "#0072D9" }}>5. ความเห็นผู้บริหาร/หัวหน้างานวิชาการ</div>
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
      <div><div style={{ fontWeight: 800, color: "#233862" }}>1. ผลการจัดกิจกรรมการเรียนรู้ (K/P/A)</div><FullText value={value.kpa_text} /></div>
      {POST_NOTE_TEXTS.map(({ key, label }) => (
        <div key={key}><div style={{ fontWeight: 800, color: "#233862" }}>{label}</div><FullText value={value[key]} /></div>
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
    || (period?.worksheet_images || []).length > 0
    || (period?.youtube_links || []).some(link => String(link || "").trim())
    || postNoteHasData(period?.post_note)
    || String(period?.plan_unit || "").trim()
    || String(period?.plan_title || "").trim()
    || String(period?.plan_id || "").trim()
    || String(period?.plan_hour || "").trim()
    || String(period?.lesson_page || "").trim());
}


// เติมวิชา/ห้อง/เวลาจากตารางสอนของครูเองให้อัตโนมัติ (ไม่ทับสิ่งที่ครูพิมพ์ไว้)
const ACTIVITY_SUBJECT_RE = /(ชุมนุม|ลูกเสือ|เนตรนารี|ยุวกาชาด|แนะแนว|กิจกรรม|บำเพ็ญประโยชน์)/;
const meaningfulText = value => String(value || "").replace(/[\s\-–—.]/g, "").length > 0;
function autofillPeriodsFromTimetable(periods, weekStart, timetable) {
  if (!Array.isArray(timetable) || timetable.length === 0) return periods;
  const dates = weekDates(weekStart);
  const hhmm = value => (value && value !== "00:00:00" ? String(value).slice(0, 5) : "");
  return periods.map(period => {
    const day = dates.indexOf(period.teach_date) + 1;
    if (day < 1 || period.free) return period;
    const slot = timetable.find(row => row.day_of_week === day && Number(row.period) === Number(period.period_no));
    if (!slot) {
      if (String(period.subject || "").trim()) return period;
      if (periodIsBlank(period)) return { ...period, free: true };
      const activity = [period.lesson_intro, period.plan_title, period.plan_unit].map(text => String(text || "").trim()).find(text => ACTIVITY_SUBJECT_RE.test(text));
      if (activity) return { ...period, subject: activity.split("\n")[0].slice(0, 80) };
      if (![period.lesson_intro, period.lesson_activity, period.lesson_practice, period.lesson_summary, period.plan_title, period.plan_unit].some(meaningfulText)) return { ...period, free: true };
      return period;
    }
    const next = { ...period };
    let fromSlot = false;
    if (!String(next.subject || "").trim()) {
      next.subject = slot.subject || "";
      fromSlot = true;
      if (!String(next.plan_class || "").trim()) next.plan_class = slot.class_room || "";
    }
    const start = hhmm(slot.start_time), end = hhmm(slot.end_time);
    const badTime = !next.start_time || !next.end_time || next.start_time >= next.end_time;
    if ((badTime || fromSlot) && start && end) { next.start_time = start; next.end_time = end; }
    return next;
  });
}

function periodIsBlank(period) {
  return !period?.free && !periodHasDetail(period);
}

// หน่วย/แผน เป็นข้อความที่ครูกรอกเอง (ไม่มีรายการสำเร็จรูปแล้ว)
function selectedPlanParts(period) {
  const unitText = String(period?.plan_unit || "").trim();
  const planText = String(period?.plan_title || "").trim();
  return { unit: unitText ? { name: unitText } : null, plan: planText ? { title: planText } : null, hour: null };
}

function periodFoldSummary(period, plan) {
  const planLabel = plan ? plan.title : "";
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
        <span style={{ fontWeight: 800, color: "#233862", flex: 1 }}>{title}</span>
        {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>
      {open && <div style={{ display: "grid", gap: "0.75rem", minWidth: 0, paddingBottom: "0.35rem" }}>{children}</div>}
    </div>
  );
}

function DayCard({ title, summary, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Card>
      <button type="button" aria-expanded={open} onClick={() => setOpen(value => !value)} style={{ width: "100%", minHeight: 48, display: "flex", alignItems: "center", gap: "0.55rem", border: "none", background: "transparent", fontFamily: "inherit", textAlign: "left", cursor: "pointer", padding: 0 }}>
        <span style={{ fontWeight: 800, fontSize: "1.05rem", color: "#233862", flex: "0 0 auto" }}>{title}</span>
        <span style={{ color: "#64748b", fontSize: "0.8rem", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{summary}</span>
        {open ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
      </button>
      {open && <div style={{ display: "grid", gap: "0.45rem", minWidth: 0, marginTop: "0.75rem" }}>{children}</div>}
    </Card>
  );
}

function WeekPeriodEditor({ period, disabled, onChange, onPickFile, onPickWorksheet, worksheetBusy, onPickImages, imageBusy, imagesLocked = false, teacherName, slot = null, timetable = [], defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  const [typing, setTyping] = useState(false);
  const subjectOptions = [...new Map((timetable || []).map(row => [timetableSlotLabel(row), row])).values()];
  const applySlot = row => onChange({ subject: row.subject || "", plan_class: row.class_room || "", start_time: row.start_time && row.start_time !== "00:00:00" ? String(row.start_time).slice(0, 5) : period.start_time, end_time: row.end_time ? String(row.end_time).slice(0, 5) : period.end_time });
  const { plan } = selectedPlanParts(period);
  const summary = periodFoldSummary(period, plan);
  return (
    <div id={`plan-${period.teach_date}-${period.period_no}`} style={{ border: `1px solid ${slot ? "#B8E0FF" : "#e2e8f0"}`, borderRadius: "12px", padding: open ? "0.75rem" : "0.35rem 0.5rem", display: "grid", gap: "0.75rem", minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", minWidth: 0 }}>
        <button type="button" aria-expanded={open} aria-label={open ? `หุบคาบที่ ${period.period_no}` : `เปิดคาบที่ ${period.period_no}`} onClick={() => setOpen(value => !value)} style={{ width: 44, height: 44, flex: "none", border: "1px solid #e2e8f0", borderRadius: "10px", background: "#fff", color: "#0072D9", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
          {open ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
        </button>
        <button type="button" onClick={() => setOpen(value => !value)} style={{ flex: 1, minWidth: 0, textAlign: "left", background: "transparent", border: "none", padding: "0.25rem 0", fontFamily: "inherit", cursor: "pointer" }}>
          <div style={{ fontWeight: 800, color: "#233862" }}>คาบที่ {period.period_no}{slot && <span style={{ marginLeft: "0.4rem", fontSize: "0.72rem", fontWeight: 700, color: "#0072D9", background: "#EAF5FF", borderRadius: 999, padding: "0.05rem 0.5rem" }}>ตารางสอน: {timetableSlotLabel(slot)}</span>}</div>
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
        <Field label="หน่วยการเรียนรู้">
          <input value={period.plan_unit || ""} disabled={disabled} placeholder="เช่น หน่วยที่ 1 ..." onChange={event => onChange({ plan_unit: event.target.value })} style={periodInput} />
        </Field>
        <Field label="แผน/เรื่อง">
          <input value={period.plan_title || ""} disabled={disabled} placeholder="ชื่อแผนหรือเรื่องที่สอน" onChange={event => onChange({ plan_title: event.target.value })} style={periodInput} />
        </Field>
        <Field label="หน้า">
          <input value={period.lesson_page || ""} disabled={disabled} onChange={event => onChange({ lesson_page: event.target.value })} style={periodInput} />
        </Field>
      </div>
      <div style={periodGrid}>
        <Field label="เวลาเริ่ม">
          <input type="time" value={period.start_time || ""} onChange={event => onChange({ start_time: event.target.value })} style={periodInput} />
        </Field>
        <Field label="เวลาสิ้นสุด">
          <input type="time" value={period.end_time || ""} onChange={event => onChange({ end_time: event.target.value })} style={periodInput} />
        </Field>
      </div>
      <Field label="วิชา / ห้อง (จากตารางสอน)">
        {subjectOptions.length > 0 && !typing ? (
          <select aria-label="วิชาจากตารางสอน" value={subjectOptions.find(row => row.subject === period.subject && (row.class_room || "") === (period.plan_class || ""))?.id || subjectOptions.find(row => row.subject === period.subject)?.id || ""} disabled={disabled} onChange={event => { if (event.target.value === "__type") { setTyping(true); return; } const row = subjectOptions.find(item => String(item.id) === event.target.value); if (row) applySlot(row); else onChange({ subject: "", plan_class: "" }); }} style={periodSelect}>
            <option value="">{period.subject ? `${period.subject} (พิมพ์ไว้เดิม)` : "-- เลือกวิชาจากตารางสอน --"}</option>
            {subjectOptions.map(row => <option key={row.id} value={row.id}>{timetableSlotLabel(row)}{slot && timetableSlotLabel(slot) === timetableSlotLabel(row) ? " (ตรงกับคาบนี้)" : ""}</option>)}
            <option value="__type">อื่น ๆ (พิมพ์เอง)</option>
          </select>
        ) : (
          <input value={period.subject || ""} onChange={event => onChange({ subject: event.target.value })} placeholder={subjectOptions.length ? "พิมพ์ชื่อวิชา" : "ยังไม่มีตารางสอน — พิมพ์ชื่อวิชา หรือกรอกตารางสอนที่เมนู ตารางสอน"} style={periodInput} />
        )}
        {slot && !period.subject && (
          <button type="button" disabled={disabled} onClick={() => applySlot(slot)} style={{ ...btnSecondary, flex: "none", width: "fit-content", marginTop: "0.4rem", padding: "0.3rem 0.7rem", fontSize: "0.8rem", color: "#0072D9" }}>ใช้ตามตารางสอน: {timetableSlotLabel(slot)}</button>
        )}
        {typing && subjectOptions.length > 0 && <button type="button" onClick={() => setTyping(false)} style={{ ...btnSecondary, flex: "none", width: "fit-content", marginTop: "0.4rem", padding: "0.3rem 0.7rem", fontSize: "0.8rem" }}>เลือกจากตารางสอน</button>}
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
        <Field label="แนบรูปใบงาน (ถ่ายรูป/เลือกจากคลัง ได้หลายรูป)">
          {!imagesLocked && (
            <label style={{ ...btnSecondary, flex: "none", width: "fit-content", cursor: disabled || imageBusy ? "not-allowed" : "pointer" }}>
              <Upload size={16} /> {imageBusy ? "กำลังอัปโหลด..." : "เพิ่มรูปใบงาน"}
              <input type="file" accept="image/*" multiple disabled={disabled || imageBusy} onChange={onPickImages} style={{ display: "none" }} />
            </label>
          )}
          {!imagesLocked && (
            <div
              tabIndex={0}
              contentEditable={!disabled && !imageBusy}
              suppressContentEditableWarning
              onPaste={event => {
                event.preventDefault();
                if (disabled || imageBusy) return;
                const files = Array.from(event.clipboardData?.items || []).filter(item => item.kind === "file" && item.type.startsWith("image/")).map(item => item.getAsFile()).filter(Boolean);
                if (files.length) onPickImages({ target: { files, value: "" } });
              }}
              onDragOver={event => event.preventDefault()}
              onDrop={event => {
                event.preventDefault();
                if (disabled || imageBusy) return;
                const files = Array.from(event.dataTransfer?.files || []).filter(f => f.type.startsWith("image/"));
                if (files.length) onPickImages({ target: { files, value: "" } });
              }}
              onInput={event => { event.currentTarget.textContent = ""; }}
              data-placeholder="คลิกแล้วกด Ctrl+V เพื่อวางรูป (มือถือ: กดค้างแล้วเลือกวาง) หรือลากรูปมาวางที่นี่"
              className="ws-paste-zone"
              style={{ marginTop: "0.5rem", border: "2px dashed #94a3b8", borderRadius: 10, padding: "0.8rem", minHeight: 44, color: "#64748b", fontSize: "0.85rem", outline: "none", cursor: "text", background: "#f8fafc" }}
            />
          )}
          <style>{`.ws-paste-zone:empty:before{content:attr(data-placeholder);color:#64748b}.ws-paste-zone:focus{border-color:#2563eb !important;background:#eff6ff !important}`}</style>
          {imagesLocked && <div style={{ fontSize: "0.8rem", color: "#b45309" }}>ส่งแผนแล้ว แก้ไขรูปใบงานไม่ได้</div>}
          <div style={{ marginTop: "0.6rem" }}>
            <WorksheetImages images={period.worksheet_images} title={`ใบงาน ${teacherName || ""}`} onRemove={imagesLocked || disabled ? null : index => onChange({ worksheet_images: (period.worksheet_images || []).filter((_, i) => i !== index) })} />
          </div>
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

function SupervisionPeriodRead({ period, defaultOpen = false, adminSlot = null, hidePostNote = false }) {
  const [open, setOpen] = useState(defaultOpen);
  const choice = selectedPlanParts(period);
  const planLabel = choice.plan ? choice.plan.title : "";
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
        <button type="button" aria-expanded={open} aria-label={open ? `หุบคาบที่ ${period.period_no}` : `เปิดคาบที่ ${period.period_no}`} onClick={() => setOpen(value => !value)} style={{ width: 44, height: 44, flex: "none", border: "1px solid #e2e8f0", borderRadius: "10px", background: "#fff", color: "#0072D9", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
          {open ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
        </button>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 800, color: "#233862" }}>คาบที่ {period.period_no} · {clockLabel(period.start_time)} - {clockLabel(period.end_time)}</div>
          {!open && <div style={{ fontSize: "0.8rem", color: "#475569", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{summary}</div>}
        </div>
      </div>
      {open && (
        <div style={{ display: "grid", gap: "0.45rem", minWidth: 0 }}>
          {(choice.unit || planLabel || topicLabel || period.lesson_page) && (
            <div style={{ color: "#233862", lineHeight: 1.55 }}>
              {choice.unit && <div><strong>หน่วย: </strong>{choice.unit.name}</div>}
              {planLabel && <div><strong>แผน: </strong>{planLabel}</div>}
              {topicLabel && <div><strong>เรื่อง: </strong>{topicLabel}</div>}
              {period.lesson_page && <div style={{ overflowWrap: "anywhere" }}><strong>หน้า: </strong>{period.lesson_page}</div>}
            </div>
          )}
          {String(period.subject || "").trim() && <div style={{ color: "#233862" }}><strong>วิชา: </strong>{period.subject}</div>}
          {[
            ["1. ขั้นนำเข้าสู่บทเรียน", period.lesson_intro],
            ["2. ขั้นจัดกิจกรรมการเรียนรู้", period.lesson_activity],
            ["3. ขั้นฝึกฝนประยุกต์", period.lesson_practice],
            ["4. ขั้นสรุป", period.lesson_summary],
          ].filter(([, value]) => String(value || "").trim()).length > 0 && (
            <div style={{ display: "grid", gap: "0.45rem" }}>
              <div style={{ fontWeight: 800, color: "#233862" }}>รายละเอียดการสอน</div>
              {[
                ["1. ขั้นนำเข้าสู่บทเรียน", period.lesson_intro],
                ["2. ขั้นจัดกิจกรรมการเรียนรู้", period.lesson_activity],
                ["3. ขั้นฝึกฝนประยุกต์", period.lesson_practice],
                ["4. ขั้นสรุป", period.lesson_summary],
              ].filter(([, value]) => String(value || "").trim()).map(([label, value]) => (
                <div key={label}>
                  <div style={{ fontWeight: 800, color: "#233862" }}>{label}</div>
                  <FullText value={value} />
                </div>
              ))}
            </div>
          )}
          {String(period.media_links || "").trim() && (
            <div>
              <div style={{ fontWeight: 800, color: "#233862" }}>ลิงก์สื่อ</div>
              <LinkLines value={period.media_links} />
            </div>
          )}
          {String(period.media_detail || "").trim() && (
            <div>
              <div style={{ fontWeight: 800, color: "#233862" }}>สื่อโดยละเอียด</div>
              <FullText value={period.media_detail} />
            </div>
          )}
          {lessonFileHref(period.worksheet_file) && (
            <div>
              <div style={{ fontWeight: 800, color: "#233862" }}>ใบงาน (PDF)</div>
              <WorksheetLink file={period.worksheet_file} />
            </div>
          )}
          {(period.worksheet_images || []).length > 0 && (
            <div>
              <div style={{ fontWeight: 800, color: "#233862" }}>รูปใบงาน ({period.worksheet_images.length} รูป)</div>
              <WorksheetImages images={period.worksheet_images} />
            </div>
          )}
          {cleanYoutubeLinks(period.youtube_links).length > 0 && (
            <div>
              <div style={{ fontWeight: 800, color: "#233862" }}>YouTube ที่ใช้สอน</div>
              <YoutubeGrid links={period.youtube_links} />
            </div>
          )}
          {!hidePostNote && postNoteHasData(period.post_note) && (
            <div style={{ borderTop: "1px solid #e2e8f0", paddingTop: "0.45rem" }}>
              <div style={{ fontWeight: 800, color: "#233862", marginBottom: "0.3rem" }}>บันทึกหลังสอน</div>
              <PostNoteRead note={period.post_note} />
            </div>
          )}
          {adminSlot}
          {period.homework === "yes" && (
            <>
              <div>
                <div style={{ fontWeight: 800, color: "#233862" }}>คืองานอะไร</div>
                <FullText value={period.homework_what} />
              </div>
              <div style={{ color: "#233862" }}><strong>หน้า: </strong>{period.homework_page || "-"}</div>
              <div>
                <div style={{ fontWeight: 800, color: "#233862" }}>ใบงาน</div>
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
        <button type="button" aria-expanded={open} aria-label={open ? `หุบวัน${dayName}` : `เปิดวัน${dayName}`} onClick={() => setOpen(value => !value)} style={{ width: 44, height: 44, flex: "none", border: "1px solid #e2e8f0", borderRadius: "10px", background: "#fff", color: "#0072D9", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
          {open ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
        </button>
        <button type="button" onClick={() => setOpen(value => !value)} style={{ flex: "1 1 120px", minWidth: 0, textAlign: "left", background: "transparent", border: "none", padding: "0.25rem 0", fontFamily: "inherit", cursor: "pointer" }}>
          <div style={{ fontWeight: 800, color: "#233862" }}>วัน{dayName}</div>
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
      <div style={{ fontWeight: 800, color: "#233862" }}>หน่วย {plan.unit || "-"} · ห้อง {plan.room || "-"}</div>
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
        <button type="button" aria-expanded={open} aria-label={open ? `หุบวัน${dayName}` : `เปิดวัน${dayName}`} onClick={() => setOpen(value => !value)} style={{ width: 44, height: 44, flex: "none", border: "1px solid #e2e8f0", borderRadius: "10px", background: "#fff", color: "#0072D9", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
          {open ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
        </button>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 800, color: "#233862" }}>วัน{dayName} · {dateLabel}</div>
          {!open && <div style={{ fontSize: "0.8rem", color: "#475569", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{summary}</div>}
        </div>
      </div>
      {open && (
        <div style={{ display: "grid", gap: "0.45rem" }}>
          {day.off && <div style={{ fontWeight: 800, color: "#64748b" }}>วันนี้ไม่มีแผนสอน</div>}
          {KINDER_ACTIVITIES.filter(item => String(day.activities?.[item.key] || "").trim()).map(item => (
            <div key={item.key}>
              <div style={{ fontWeight: 800, color: "#233862" }}>{item.label}</div>
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
  const [weekStart, setWeekStart] = useState(() => defaultPlanWeek());
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
    // ส่งแล้วแก้ไขได้ตลอด: ไม่บังคับตรวจความครบซ้ำ และคงเวลาส่งครั้งแรก/สถานะสายเดิม
    if (effective === "submitted" && !alreadySent) {
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
                <div style={{ fontSize: "1.05rem", fontWeight: 800, color: "#233862" }}>แผนอนุบาลของ {currentUser.name}</div>
                <div style={{ fontSize: "0.8rem", color: "#b45309", fontWeight: 700, marginTop: "0.25rem" }}>{supervisionDeadlineText(weekStart)} · แก้ไขได้ตลอด สถานะยึดเวลาส่งครั้งแรก</div>
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
              <div style={{ background: "#EAF5FF", border: "1px solid #B8E0FF", borderRadius: "12px", padding: "0.8rem", marginBottom: "0.9rem" }}>
                <div style={{ fontWeight: 800, color: "#0072D9" }}>ฝ่ายวิชาการรับทราบแล้ว · {signoff.by || "ผู้บริหาร"} · {fmtDate(signoff.at)} {fmtTime(signoff.at)}</div>
                <FullText value={signoff.comment} />
              </div>
            )}
            {observations.length > 0 && (
              <div style={{ display: "grid", gap: "0.45rem", marginBottom: "0.9rem" }}>
                {observations.map(item => (
                  <div key={item.id} style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "12px", padding: "0.75rem" }}>
                    <div style={{ fontWeight: 800, color: "#233862" }}>นิเทศในห้อง {formatThaiDateKey(item.date)} · {labelOf(OBSERVATION_MATCH, item.match) || "-"}</div>
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

function TeachingSupervisionPage({ employees, currentUser, planFocus = null }) {
  const isExec = isExecutiveUser(currentUser);
  const [level, setLevel] = useState(isExec ? "" : null);
  useEffect(() => {
    if (isExec) return undefined;
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
  }, [currentUser?.id, isExec]);
  if (isExec) return <ExecutiveSupervisionSwitch employees={employees} currentUser={currentUser} planFocus={planFocus} />;
  if (level === null) return <Card><div style={{ textAlign: "center", color: "#64748b", padding: "1.5rem" }}>กำลังโหลดแผนสัปดาห์...</div></Card>;
  if (level === "อนุบาล") return <KindergartenSupervisionTeacher currentUser={currentUser} />;
  return <SupervisionTeacher currentUser={currentUser} planFocus={planFocus} />;
}

// ผู้บริหารที่มีคาบสอนประจำ: เห็นทั้ง "ตรวจแผนครู" และ "แผนการสอนของฉัน" (ส่งแผนเหมือนครู กฎ draft/ส่ง/ล็อกเดียวกัน)
function ExecutiveSupervisionSwitch({ employees, currentUser, planFocus = null }) {
  const [hasPeriods, setHasPeriods] = useState(false);
  const [view, setView] = useState(planFocus?.date ? "mine" : "review");
  useEffect(() => {
    let active = true;
    if (isNonTeachingStaff(currentUser)) { setHasPeriods(false); return undefined; }
    fetchTimetableRows(currentUser.id)
      .then(list => { if (active) setHasPeriods((list || []).length > 0); })
      .catch(() => { if (active) setHasPeriods(false); });
    return () => { active = false; };
  }, [currentUser?.id]);
  useEffect(() => { if (planFocus?.date) setView("mine"); }, [planFocus]);
  if (!hasPeriods) return <SupervisionAdmin employees={employees} currentUser={currentUser} />;
  const btn = (key, label) => (
    <button type="button" onClick={() => setView(key)} aria-pressed={view === key} style={{ ...btnSecondary, flex: "none", minHeight: 40, fontWeight: 800, background: view === key ? "linear-gradient(135deg, #008CFF, #0072D9)" : "#fff", color: view === key ? "#fff" : "#233862", border: view === key ? "none" : "1px solid #cbd5e1" }}>{label}</button>
  );
  return (
    <div style={{ display: "grid", gap: "0.9rem", minWidth: 0 }}>
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        {btn("review", "ตรวจแผนครู (ผู้บริหาร)")}
        {btn("mine", "แผนการสอนของฉัน / ส่งแผน")}
      </div>
      {view === "mine"
        ? <SupervisionTeacher currentUser={currentUser} planFocus={planFocus} />
        : <SupervisionAdmin employees={employees} currentUser={currentUser} />}
    </div>
  );
}

function defaultPlanWeek() {
  // หลังวันศุกร์ 18:00 น. ถึงวันอาทิตย์ (เวลาไทย) เปิดสัปดาห์ถัดไปเป็นค่าเริ่มต้น
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23", weekday: "short" }).formatToParts(new Date()).map(x => [x.type, x.value]));
  const today = `${parts.year}-${parts.month}-${parts.day}`;
  const monday = mondayOf(today);
  const next = (parts.weekday === "Fri" && Number(parts.hour) >= 18) || parts.weekday === "Sat" || parts.weekday === "Sun";
  return next ? shiftDateKey(monday, 7) : monday;
}

const NO_TIMETABLE_TEXT = "ยังไม่ได้กรอกตารางสอน จึงกรอกแผนการสอนไม่ได้ กรุณากรอกตารางสอนก่อน";

function SupervisionTeacher({ currentUser, planFocus = null }) {
  const [weekStart, setWeekStart] = useState(() => planFocus?.date ? mondayOf(planFocus.date) : defaultPlanWeek());
  const [loadedStamp, setLoadedStamp] = useState(null);
  const [timetable, setTimetable] = useState([]);
  const [timetableLoaded, setTimetableLoaded] = useState(false);
  useEffect(() => {
    let active = true;
    setTimetableLoaded(false);
    fetchTimetableRows(currentUser.id).then(list => { if (active) { setTimetable(list); setTimetableLoaded(true); } }).catch(() => {});
    return () => { active = false; };
  }, [currentUser.id]);
  useEffect(() => {
    if (!planFocus?.date) return;
    setWeekStart(mondayOf(planFocus.date));
    const timer = setTimeout(() => document.getElementById(`plan-${planFocus.date}-${planFocus.period}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 900);
    return () => clearTimeout(timer);
  }, [planFocus]);
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
  const [imageBusy, setImageBusy] = useState("");

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
    setLoadedStamp(plan.updated_at || null);
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

  useEffect(() => {
    if (loading || timetable.length === 0 || status === "submitted" || status === "late") return;
    setPeriods(prev => {
      const next = autofillPeriodsFromTimetable(prev, weekStart, timetable);
      return JSON.stringify(next) === JSON.stringify(prev) ? prev : next;
    });
  }, [loading, timetable, weekStart, status]);

  const noTimetable = timetableLoaded && timetable.length === 0;
  const blockedNoTimetable = noTimetable && status !== "submitted" && status !== "late";

  const formPlan = (nextStatus = status || "draft", sourcePeriods = periods) => {
    const previous = status === "late" ? "submitted" : status;
    const timing = resolveSubmission(nextStatus, previous, submittedAt, late, weekStart);
    return {
      version: 4,
      week_start: weekStart,
      periods: sourcePeriods.filter(period => !periodIsBlank(period)),
      signoff,
      observations,
      status: timing.status,
      late: timing.late,
      submitted_at: timing.submitted_at,
    };
  };

  const savePlan = async (nextStatus) => {
    const alreadySent = status === "submitted" || status === "late";
    if (noTimetable && !alreadySent) {
      setError(NO_TIMETABLE_TEXT);
      return;
    }
    const effective = alreadySent ? "submitted" : nextStatus;
    const workPeriods = alreadySent ? periods : autofillPeriodsFromTimetable(periods, weekStart, timetable);
    const filled = workPeriods.filter(period => !periodIsBlank(period));
    const taught = filled.filter(period => !period.free);
    // ส่งแล้วแก้ไขได้ตลอด: ไม่บังคับตรวจความครบซ้ำ และคงเวลาส่งครั้งแรก/สถานะสายเดิม
    if (effective === "submitted" && !alreadySent) {
      const missingDays = weekDates(weekStart).flatMap((date, index) => (
        workPeriods.some(period => period.teach_date === date && periodIsBlank(period)) ? [`วัน${DAY_NAMES[index + 1]}`] : []
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
    const plan = formPlan(effective, workPeriods);
    if (JSON.stringify(plan).length > SUPERVISION_JSON_LIMIT) {
      setError("ไฟล์ใบงานรวมกันใหญ่เกินที่ฐานเก็บได้ ลดขนาดไฟล์ หรือวางลิงก์แทน");
      return;
    }
    setSaving(true);
    setError("");
    setMessage("");
    try {
      // กันเครื่องอื่น (เช่น มือถือที่เปิดค้างไว้) บันทึกทับฉบับใหม่กว่า
      const latest = (await fetchSupervisionRows(currentUser.id, weekStart))[0];
      const latestStamp = latest ? (parseSupervisionPlan(latest.subject, weekStart).updated_at || null) : null;
      if (latest && (latest.id !== rowId || latestStamp !== loadedStamp)
        && !window.confirm(`แผนสัปดาห์ ${formatThaiDateKey(weekStart)} ถูกบันทึกจากเครื่องอื่นหลังจากที่เปิดหน้านี้ ถ้ากดตกลง ข้อมูลในหน้านี้จะทับฉบับนั้น (กดยกเลิก แล้วรีเฟรชหน้าเพื่อดูฉบับล่าสุด)`)) {
        return;
      }
      const id = await writeSupervisionPlan(currentUser.id, weekStart, plan, latest?.id || rowId);
      const savedRow = (await fetchSupervisionRows(currentUser.id, weekStart))[0];
      setLoadedStamp(savedRow ? (parseSupervisionPlan(savedRow.subject, weekStart).updated_at || null) : null);
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

  const onPickImages = async (event, period) => {
    const picked = Array.from(event.target.files || []).filter(f => !f.type || f.type.startsWith("image/"));
    event.target.value = "";
    if (!picked.length) return;
    const room = 12 - (period.worksheet_images || []).length;
    if (room <= 0) { setError("แนบรูปใบงานได้ไม่เกิน 12 รูปต่อคาบ"); return; }
    setImageBusy(period.id);
    try {
      const added = [];
      for (const f of picked.slice(0, room)) added.push(await uploadLessonImage(f, currentUser.id));
      setPeriods(prev => prev.map(p => p.id === period.id ? { ...p, worksheet_images: [...(p.worksheet_images || []), ...added] } : p));
      setError("");
      setMessage(`แนบรูปใบงาน ${added.length} รูปแล้ว กดบันทึกเพื่อเก็บลงแผน`);
    } catch (err) {
      setError(err.message || "อัปโหลดรูปไม่สำเร็จ");
    } finally {
      setImageBusy("");
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

  const actionButtons = blockedNoTimetable ? null : (
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
                <div style={{ fontSize: "1.05rem", fontWeight: 800, color: "#233862" }}>แผนสัปดาห์ของ {currentUser.name}</div>
                <div style={{ fontSize: "0.8rem", color: "#b45309", fontWeight: 700, marginTop: "0.25rem" }}>{supervisionDeadlineText(weekStart)} · แก้ไขได้ตลอด สถานะยึดเวลาส่งครั้งแรก</div>
              </div>
              <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
                <SupervisionStatusBadge status={status === "submitted" && late ? "late" : (status || "missing")} />
                {signoff?.at && <SupervisionStatusBadge status="approved" />}
              </div>
            </div>
            {signoff?.at && (
              <div style={{ background: "#EAF5FF", border: "1px solid #B8E0FF", borderRadius: "12px", padding: "0.8rem", marginBottom: "0.9rem" }}>
                <div style={{ fontWeight: 800, color: "#0072D9" }}>ฝ่ายวิชาการรับทราบแล้ว · {signoff.by || "ผู้บริหาร"} · {fmtDate(signoff.at)} {fmtTime(signoff.at)}</div>
                <FullText value={signoff.comment} />
              </div>
            )}
            {observations.length > 0 && (
              <div style={{ display: "grid", gap: "0.45rem", marginBottom: "0.9rem" }}>
                {observations.map(item => (
                  <div key={item.id} style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "12px", padding: "0.75rem" }}>
                    <div style={{ fontWeight: 800, color: "#233862" }}>นิเทศในห้อง {formatThaiDateKey(item.date)} · {labelOf(OBSERVATION_MATCH, item.match) || "-"}</div>
                    <FullText value={item.note} />
                  </div>
                ))}
              </div>
            )}
            {blockedNoTimetable && (
              <div role="alert" style={{ background: "#fef2f2", border: "2px solid #dc2626", borderRadius: "12px", padding: "1rem", color: "#b91c1c", fontWeight: 800, fontSize: "1.05rem", lineHeight: 1.6 }}>
                ⚠️ {NO_TIMETABLE_TEXT}
                <div style={{ fontSize: "0.85rem", fontWeight: 600, color: "#7f1d1d", marginTop: "0.35rem" }}>ไปที่เมนู "ตารางสอน" เพิ่มคาบที่สอนให้ครบ แล้วกลับมาหน้านี้ ระบบจะเติมวิชา ห้อง และเวลาให้อัตโนมัติ</div>
              </div>
            )}
            {actionButtons}
            {submittedAt && status === "submitted" && <div style={{ marginTop: "0.7rem", fontSize: "0.78rem", color: "#64748b" }}>ส่งล่าสุด {fmtDate(submittedAt)} {fmtTime(submittedAt)}</div>}
          </Card>
          {!blockedNoTimetable && weekDates(weekStart).map((date, index) => {
            const dayPeriods = periods
              .filter(period => period.teach_date === date)
              .sort((a, b) => (Number(a.period_no) || 0) - (Number(b.period_no) || 0));
            const filled = dayPeriods.filter(period => !periodIsBlank(period)).length;
            return (
              <DayCard key={`${date}-${planFocus?.at || 0}`} defaultOpen={planFocus?.date === date} title={`วัน${DAY_NAMES[index + 1]}`} summary={`${formatThaiDateKey(date)} · ${filled}/6${timetable.some(row => row.day_of_week === index + 1) ? ` · ตารางสอน ${timetable.filter(row => row.day_of_week === index + 1).length} คาบ` : ""}`}>
                {dayPeriods.map(period => (
                  <WeekPeriodEditor
                    key={`${period.id}-${planFocus?.at || 0}`}
                    defaultOpen={planFocus?.date === date && Number(planFocus?.period) === Number(period.period_no)}
                    slot={timetable.find(row => row.day_of_week === index + 1 && Number(row.period) === Number(period.period_no)) || null}
                    timetable={timetable}
                    period={period}
                    disabled={saving}
                    onChange={patch => updatePeriod(period.id, patch)}
                    onPickFile={event => onPickHomework(event, period.id)}
                    onPickWorksheet={event => onPickWorksheet(event, period.id)}
                    worksheetBusy={worksheetBusy === period.id}
                    onPickImages={event => onPickImages(event, period)}
                    imageBusy={imageBusy === period.id}
                    imagesLocked={status === "submitted" || status === "late"}
                    teacherName={currentUser.name}
                  />
                ))}
              </DayCard>
            );
          })}
          {actionButtons && <Card>{actionButtons}</Card>}
        </>
      )}
    </div>
  );
}

function SupervisionAdmin({ employees, currentUser }) {
  const [weekStart, setWeekStart] = useState(() => defaultPlanWeek());
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
        const { data, error: loadError } = await fetchWeekPlansForExec(weekPeriodKey(weekStart));
        if (loadError) throw new Error(loadError.message);
        if (!active) return;
        const latest = new Map();
        (data || []).forEach(raw => {
          let submittedAt = "";
          try { submittedAt = JSON.parse(raw.subject || "{}").submitted_at || ""; } catch { submittedAt = ""; }
          const { subject: _omit, ...row } = { ...raw, submitted_at: submittedAt };
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
    .filter(teacher => (teacher.role !== "admin" || rows.some(item => item.employee_id === teacher.id)) && !isNonTeachingStaff(teacher))
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
      <div style={{ fontSize: "0.8rem", color: "#64748b" }}>เขียว = ส่งตรงเวลา · เหลือง = สาย · แดง = ยังไม่ส่งหรือฉบับร่าง · ส่งภายในวันอาทิตย์ก่อนสัปดาห์สอน ก่อน 08:00 น. (ยึดเวลาส่งครั้งแรก)</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "0.75rem" }}>
        <StatCard stat={{ label: "ส่งแล้ว", value: loading ? "..." : counts.submitted, icon: CheckCircle, color: "#16a34a", bg: "#ecfdf5", trend: "สัปดาห์นี้" }} />
        <StatCard stat={{ label: "สาย", value: loading ? "..." : counts.late, icon: Clock, color: "#d97706", bg: "#fffbeb", trend: "ตั้งแต่วันอาทิตย์ 08:00" }} />
        <StatCard stat={{ label: "ยังไม่ส่ง", value: loading ? "..." : counts.missing, icon: AlertCircle, color: "#dc2626", bg: "#fef2f2", trend: "รวมฉบับร่าง" }} />
      </div>

      {selectedTeacher ? (
        <Card>
          <button onClick={() => { setSelectedId(""); setDetail(null); }} style={{ ...btnSecondary, flex: "none", marginBottom: "1rem" }}><ChevronLeft size={16} /> กลับไปกระดาน</button>
          <div style={{ display: "flex", justifyContent: "space-between", gap: "0.75rem", alignItems: "center", flexWrap: "wrap", marginBottom: "1rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
              <Avatar name={selectedTeacher.name} />
              <div>
                <div style={{ fontSize: "1.15rem", fontWeight: 800, color: "#233862" }}>{selectedTeacher.name}</div>
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
                <div style={{ background: "#EAF5FF", border: "1px solid #B8E0FF", borderRadius: "12px", padding: "0.8rem" }}>
                  <div style={{ fontWeight: 800, color: "#0072D9" }}>รับทราบแล้ว · {plan.signoff.by || "ฝ่ายวิชาการ"} · {fmtDate(plan.signoff.at)} {fmtTime(plan.signoff.at)}</div>
                  <FullText value={plan.signoff.comment} />
                </div>
              )}
              {(plan.observations || []).length > 0 && (
                <div style={{ display: "grid", gap: "0.45rem" }}>
                  {plan.observations.map((item, index) => (
                    <div key={item.id || index} style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "12px", padding: "0.75rem" }}>
                      <div style={{ fontWeight: 800, color: "#233862" }}>นิเทศในห้อง {formatThaiDateKey(item.date)} · {labelOf(OBSERVATION_MATCH, item.match) || "-"} · {item.by || "ฝ่ายวิชาการ"}</div>
                      <FullText value={item.note} />
                    </div>
                  ))}
                </div>
              )}
              <div>
                <div style={{ fontWeight: 800, color: "#233862", marginBottom: "0.75rem" }}>{plan.kind === "kindergarten" ? "แผนอนุบาลรายสัปดาห์" : "แผนรายสัปดาห์"}</div>
                {plan.kind === "kindergarten"
                  ? <KindergartenWeekView plan={plan} weekStart={weekStart} />
                  : <SupervisionWeekView periods={plan.periods} weekStart={weekStart} />}
              </div>
              <div style={{ borderTop: "1px solid #e2e8f0", paddingTop: "1rem", display: "grid", gap: "0.75rem" }}>
                <div style={{ fontWeight: 800, color: "#233862" }}>รับทราบ/อนุมัติ</div>
                <div style={{ fontSize: "0.8rem", color: "#64748b" }}>ครูเห็นข้อเสนอแนะนี้ในแผนสัปดาห์ และแก้เนื้อหาแผนเองจากบัญชีครู</div>
                <Field label="ข้อเสนอแนะถึงครู">
                  <textarea value={signoffComment} onChange={event => setSignoffComment(event.target.value)} style={supervisionTextArea} placeholder="พิมพ์คำแนะนำสั้นๆ แล้วกดรับทราบ" />
                </Field>
                <button type="button" onClick={() => saveReview("signoff")} disabled={savingReview} style={{ ...btnPrimary, flex: "none", background: "linear-gradient(135deg, #008CFF, #0072D9)", color: "#fff", cursor: savingReview ? "not-allowed" : "pointer" }}>
                  <CheckCircle size={16} /> รับทราบ/อนุมัติ
                </button>
              </div>
              <div style={{ display: "grid", gap: "0.75rem" }}>
                <div style={{ fontWeight: 800, color: "#233862" }}>นิเทศในห้อง</div>
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
              const submittedAtOf = (id) => rows.find(item => item.employee_id === id)?.submitted_at || "";
              const people = visibleTeachers.filter(teacher => supervisionBoardGroup(statusOf(teacher.id)) === group.key)
                .sort((a, b) => group.key === "missing" ? 0 : String(submittedAtOf(a.id) || "9").localeCompare(String(submittedAtOf(b.id) || "9")));
              return (
                <div key={group.key} style={{ marginTop: "1rem" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
                    <div style={{ fontWeight: 800, color: "#233862" }}>{group.label}</div>
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
                              <span style={{ display: "block", fontWeight: 800, color: "#233862" }}>{teacher.name || "-"}</span>
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
  { value: "personal", label: "ลากิจ", color: "#b45309", bg: "#fef3c7", border: "#fcd34d" },
  { value: "sick", label: "ลาป่วย", color: "#0072D9", bg: "#DCEFFF", border: "#8FD0FF" },
];
// "absent" เก็บไว้อ่านข้อมูลเก่าเท่านั้น หน้าเช็คชื่อใช้แค่ มา / ลา (ลากิจ หรือ ป่วย)
const ROLL_STATUS_VALUES = new Set([...ROLL_STATUSES.map(item => item.value), "absent"]);
// อาการคัดกรองนักเรียนป่วย อ้างอิง: กรมอนามัย "แนวทางปฏิบัติคัดกรองสุขภาพนักเรียนในสถานศึกษา" และ
// กรมควบคุมโรค นิยามผู้มีอาการ (15 เม.ย. 2564): ไข้ ≥37.5°C ไอ น้ำมูก เจ็บคอ ไม่ได้กลิ่น/ไม่รับรส ถ่ายเหลว ตาแดง ผื่น หายใจเร็ว/เหนื่อย/ลำบาก
const SICK_SYMPTOMS = [
  { key: "fever", label: "ไข้ ≥37.5°C" },
  { key: "cough", label: "ไอ" },
  { key: "runny", label: "น้ำมูก" },
  { key: "throat", label: "เจ็บคอ" },
  { key: "smell", label: "ไม่ได้กลิ่น/ไม่รับรส" },
  { key: "diarrhea", label: "ถ่ายเหลว" },
  { key: "redeye", label: "ตาแดง" },
  { key: "rash", label: "ผื่นขึ้น" },
  { key: "breath", label: "หายใจเร็ว/เหนื่อย/ลำบาก" },
];
const SICK_ACTIONS = [
  { value: "", label: "การดูแล..." },
  { value: "rest", label: "แยกพักห้องพยาบาล" },
  { value: "home", label: "ผู้ปกครองรับกลับบ้าน" },
  { value: "doctor", label: "ส่งพบแพทย์" },
  { value: "stayhome", label: "หยุดเรียนอยู่บ้าน" },
];

function cleanSickHealth(raw) {
  const symptoms = Array.isArray(raw?.symptoms) ? raw.symptoms.filter(key => SICK_SYMPTOMS.some(item => item.key === key)) : [];
  const temp = String(raw?.temp ?? "").replace(/[^\d.]/g, "").slice(0, 5);
  return {
    symptoms,
    temp,
    other: String(raw?.other || "").slice(0, 200),
    parent: !!raw?.parent,
    action: SICK_ACTIONS.some(item => item.value === raw?.action) ? raw.action : "",
  };
}

function SickScreening({ value, disabled, onChange }) {
  const health = cleanSickHealth(value);
  const set = patch => onChange(cleanSickHealth({ ...health, ...patch }));
  const toggle = key => set({ symptoms: health.symptoms.includes(key) ? health.symptoms.filter(item => item !== key) : [...health.symptoms, key] });
  const tiny = { ...periodInput, minHeight: 30, padding: "0.2rem 0.4rem", fontSize: "0.8rem" };
  const highTemp = Number(health.temp) >= 37.5;
  return (
    <div style={{ gridColumn: "1 / -1", background: "#EAF5FF", border: "1px solid #B8E0FF", borderRadius: 8, padding: "0.4rem", display: "grid", gap: "0.35rem", fontSize: "0.78rem" }}>
      <div style={{ fontWeight: 800, color: "#0072D9" }}>คัดกรองอาการป่วย</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.25rem" }}>
        {SICK_SYMPTOMS.map(item => {
          const on = health.symptoms.includes(item.key) || (item.key === "fever" && highTemp);
          return <button key={item.key} type="button" disabled={disabled} aria-pressed={on} onClick={() => toggle(item.key)} style={{ border: `1px solid ${on ? "#0072D9" : "#cbd5e1"}`, background: on ? "#0072D9" : "#fff", color: on ? "#fff" : "#475569", borderRadius: 14, padding: "0.12rem 0.5rem", fontSize: "0.74rem", fontFamily: "inherit", cursor: "pointer" }}>{item.label}</button>;
        })}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem", alignItems: "center" }}>
        <input inputMode="decimal" value={health.temp} disabled={disabled} placeholder="อุณหภูมิ °C" onChange={event => set({ temp: event.target.value })} style={{ ...tiny, width: 84, flex: "none", borderColor: highTemp ? "#dc2626" : undefined }} />
        <input value={health.other} disabled={disabled} placeholder="อาการอื่น" onChange={event => set({ other: event.target.value })} style={{ ...tiny, flex: "1 1 110px", width: "auto" }} />
        <select value={health.action} disabled={disabled} onChange={event => set({ action: event.target.value })} style={{ ...tiny, flex: "1 1 130px", width: "auto" }}>
          {SICK_ACTIONS.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select>
        <label style={{ display: "flex", alignItems: "center", gap: "0.2rem", color: "#334155", whiteSpace: "nowrap" }}>
          <input type="checkbox" checked={health.parent} disabled={disabled} onChange={event => set({ parent: event.target.checked })} /> แจ้งผู้ปกครองแล้ว
        </label>
      </div>
    </div>
  );
}
const STUDENT_ROLL_MAX = 80;
const ROSTER_HEADER_CELLS = new Set(["เลขที่", "ชื่อ", "นามสกุล", "ชื่อ-สกุล", "ชื่อสกุล", "ชื่อนักเรียน", "name", "student", "no", "no.", "ลำดับ", "ชั้น", "ห้อง"]);

function emptyRollBook() {
  return { version: 1, class_name: "", students: [], days: {} };
}

function rollCounts(students, marks) {
  const counts = { present: 0, absent: 0, late: 0, personal: 0, sick: 0, unset: 0, total: students.length };
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
      sex: student?.sex === "M" || student?.sex === "F" ? student.sex : "",
    }))
    .filter(student => student.name)
    .slice(0, STUDENT_ROLL_MAX);
}

function rollStudentKey(student) {
  return `${student?.name || ""} ${student?.surname || ""}`.replace(/\s+/g, " ").trim();
}

// รวมรายชื่อจากหลายแหล่งโดยไม่ให้ชื่อหาย (ตรงกันด้วย id หรือชื่อ-นามสกุล)
function mergeRollStudents(...lists) {
  const out = [];
  lists.forEach(list => {
    cleanRollStudents(list).forEach(student => {
      if (out.some(item => item.id === student.id || rollStudentKey(item) === rollStudentKey(student))) return;
      out.push(student);
    });
  });
  return out.slice(0, STUDENT_ROLL_MAX);
}

function rollStamp(raw) {
  try { const parsed = JSON.parse(raw || "{}"); return String(parsed.saved_local_at || parsed.updated_at || ""); } catch { return ""; }
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
        const health = {};
        Object.entries(day?.health && typeof day.health === "object" ? day.health : {}).forEach(([id, item]) => {
          if (marks[id] === "sick") health[id] = cleanSickHealth(item);
        });
        // เช็คนม: คนที่ไม่มาเรียน/ลา → ใครดื่มนมแทน (id นักเรียนที่มา, MILK_OTHER หรือ MILK_NONE)
        const milk = {};
        const milkNote = {};
        Object.entries(day?.milk && typeof day.milk === "object" ? day.milk : {}).forEach(([id, pick]) => {
          if (marks[id] && marks[id] !== "present" && typeof pick === "string" && pick) milk[id] = pick.slice(0, 64);
        });
        Object.entries(day?.milk_note && typeof day.milk_note === "object" ? day.milk_note : {}).forEach(([id, note]) => {
          if (milk[id] === MILK_OTHER) milkNote[id] = String(note || "").slice(0, 80);
        });
        const recordedBy = day?.recorded_by && typeof day.recorded_by === "object" && day.recorded_by.name ? { id: String(day.recorded_by.id || ""), name: String(day.recorded_by.name).slice(0, 80) } : null;
        days[date] = { saved_at: day?.saved_at || null, marks, health, milk, milk_note: milkNote, ...(recordedBy ? { recorded_by: recordedBy } : {}) };
      });
    }
    // ย้ายรายชื่อที่เคยติดอยู่ในข้อมูลรายวัน (days[date].students / roster) ขึ้นเป็นรายชื่อถาวร
    const lifted = [];
    if (parsed.days && typeof parsed.days === "object" && !Array.isArray(parsed.days)) {
      Object.keys(parsed.days).sort().forEach(date => {
        const day = parsed.days[date];
        [day?.students, day?.roster].forEach(list => { if (Array.isArray(list)) lifted.push(...list); });
      });
    }
    return {
      version: 1,
      class_name: String(parsed.class_name || "").trim().slice(0, 40),
      students: mergeRollStudents(parsed.students, lifted),
      removed_ids: Array.isArray(parsed.removed_ids) ? parsed.removed_ids.map(String).slice(-200) : [],
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
    return { id: match.id, number: student.number, name: student.name, surname: student.surname || "", sex: match.sex || student.sex || "" };
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

function fetchRollRows(employeeId) {
  return cached(`roll-rows:${employeeId || "all"}`, 120000, () => fetchRollRowsRaw(employeeId)).then(rows => rows.map(row => ({ ...row })));
}

async function fetchRollRowsRaw(employeeId) {
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

// รายชื่อนักเรียนของครูประจำชั้น (จากสมุดเช็คชื่อ) ใช้ในแบบประเมินพัฒนาการอนุบาล
async function fetchKgStudents(employeeId) {
  const row = dedupeRollRows(await fetchRollRows(employeeId))[0];
  if (!row) return [];
  return parseRollBook(row.subject).students.filter(s => String(s.name || "").trim()).map(s => ({ id: s.id, name: s.name }));
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
        <span key={status.value} style={{ background: status.bg, color: status.color, border: `1px solid ${status.border}`, fontWeight: 800, fontSize: "0.72rem", borderRadius: 20, padding: "0.15rem 0.5rem" }}>{status.label} {counts[status.value]}</span>
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
  const totals = { present: 0, absent: 0, late: 0, personal: 0, sick: 0, unset: 0, days: days.length };
  const perStudent = students.map(student => {
    const counts = { present: 0, absent: 0, late: 0, personal: 0, sick: 0, unset: 0 };
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
          <button key={item.key} type="button" onClick={() => onChange(item.key)} style={{ minHeight: 44, border: "none", borderRadius: 10, background: active ? "#EAF5FF" : "transparent", color: active ? "#0072D9" : "#64748b", fontWeight: 800, fontFamily: "inherit", fontSize: "0.92rem", cursor: "pointer" }}>
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

function RollMarkRow({ student, value, disabled, onChange, health, onHealth }) {
  const label = studentLabel(student);
  const onLeave = value === "personal" || value === "sick" || value === "absent";
  const btn = (active, color, bg) => ({ boxSizing: "border-box", minHeight: 30, minWidth: 0, borderRadius: 8, border: `1px solid ${active ? color : "#e2e8f0"}`, background: active ? bg : "#fff", color: active ? color : "#64748b", fontWeight: 800, fontFamily: "inherit", fontSize: "0.74rem", cursor: disabled ? "default" : "pointer", padding: "0 0.45rem", whiteSpace: "nowrap" });
  return (
    <div style={{ display: "grid", width: "100%", boxSizing: "border-box", gridTemplateColumns: "minmax(0, 1fr) auto", gap: "0.25rem 0.4rem", alignItems: "center", padding: "0.2rem 0", borderTop: "1px solid #f1f5f9", minWidth: 0 }}>
      <div style={{ minWidth: 0, display: "flex", gap: "0.3rem", alignItems: "center", fontSize: "0.82rem" }}>
        <span style={{ fontWeight: 700, color: "#94a3b8", flex: "0 0 auto" }}>{student.number}</span>
        <span title={label} style={{ minWidth: 0, fontWeight: 700, color: "#233862", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>
      </div>
      <div style={{ display: "flex", gap: "0.2rem", alignItems: "center" }}>
        <button type="button" aria-pressed={value === "present"} aria-label={`${label} มา`} disabled={disabled} onClick={() => onChange?.("present")} style={btn(value === "present", "#166534", "#dcfce7")}>มา</button>
        <button type="button" aria-pressed={onLeave} aria-label={`${label} ลา`} disabled={disabled} onClick={() => onChange?.(onLeave ? value : "personal")} style={btn(onLeave, "#b45309", "#fef3c7")}>ลา</button>
        {onLeave && (
          <select aria-label={`${label} ประเภทการลา`} value={value === "sick" ? "sick" : "personal"} disabled={disabled} onChange={event => onChange?.(event.target.value)} style={{ minHeight: 30, borderRadius: 8, border: "1px solid #e2e8f0", fontSize: "0.74rem", fontFamily: "inherit", padding: "0 0.2rem", background: "#fff" }}>
            <option value="personal">ลากิจ</option>
            <option value="sick">ป่วย</option>
          </select>
        )}
      </div>
      {value === "sick" && onHealth && <SickScreening value={health} disabled={disabled} onChange={onHealth} />}
    </div>
  );
}

function rollSickCases(book, month) {
  const students = book?.students || [];
  const cases = [];
  Object.entries(book?.days || {})
    .filter(([date, day]) => month && date.startsWith(month) && day?.saved_at)
    .sort((left, right) => left[0].localeCompare(right[0]))
    .forEach(([date, day]) => {
      Object.entries(day.marks || {}).forEach(([id, status]) => {
        if (status !== "sick") return;
        const student = students.find(item => item.id === id);
        const health = cleanSickHealth(day.health?.[id]);
        const symptoms = SICK_SYMPTOMS.filter(item => health.symptoms.includes(item.key) || (item.key === "fever" && Number(health.temp) >= 37.5)).map(item => item.label);
        cases.push({
          date,
          number: student?.number || "",
          name: student ? studentLabel(student) : "(นักเรียนที่ถูกลบ)",
          symptoms,
          other: health.other,
          temp: health.temp,
          action: SICK_ACTIONS.find(item => item.value === health.action && item.value)?.label || "",
          parent: health.parent,
        });
      });
    });
  const symptomCounts = SICK_SYMPTOMS.map(item => ({ label: item.label, count: cases.filter(row => row.symptoms.includes(item.label)).length })).filter(item => item.count > 0);
  const otherCount = cases.filter(row => row.other.trim()).length;
  if (otherCount) symptomCounts.push({ label: "อาการอื่น", count: otherCount });
  return { cases, symptomCounts };
}

function exportSickCases(cases, month, title) {
  const rows = cases.map(row => ({
    "วันที่": formatThaiDateKey(row.date),
    "เลขที่": row.number,
    "ชื่อ": row.name,
    "อาการ": row.symptoms.join(", "),
    "อาการอื่น": row.other,
    "อุณหภูมิ (°C)": row.temp,
    "การดูแล": row.action,
    "แจ้งผู้ปกครอง": row.parent ? "แจ้งแล้ว" : "ยังไม่แจ้ง",
  }));
  const sheet = xlsxUtils.json_to_sheet(rows.length ? rows : [{ "วันที่": "ไม่มีนักเรียนลาป่วย" }]);
  const workbook = xlsxUtils.book_new();
  xlsxUtils.book_append_sheet(workbook, sheet, "ลาป่วย");
  const safe = String(title || "ห้อง").replace(/[\\/:*?"<>|]+/g, "_").slice(0, 40);
  writeWorkbookFile(workbook, `ลาป่วย_${safe}_${month}.xlsx`);
}

function SickCasesPanel({ book, month, title }) {
  const { cases, symptomCounts } = rollSickCases(book, month);
  const th = { padding: "0.25rem 0.4rem", fontWeight: 800, fontSize: "0.74rem", textAlign: "left", whiteSpace: "nowrap", borderBottom: "1px solid #e2e8f0", color: "#475569" };
  const td = { padding: "0.2rem 0.4rem", fontSize: "0.78rem", verticalAlign: "top", borderTop: "1px solid #f1f5f9" };
  return (
    <div style={{ display: "grid", gap: "0.45rem", minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
        <span style={{ fontWeight: 800, color: "#0072D9", flex: 1 }}>นักเรียนลาป่วย {cases.length} ครั้ง</span>
        {cases.length > 0 && <button type="button" onClick={() => exportSickCases(cases, month, title)} style={{ ...btnSecondary, flex: "none", padding: "0.25rem 0.6rem", fontSize: "0.78rem" }}><FileText size={14} /> Excel</button>}
      </div>
      {symptomCounts.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.25rem" }}>
          {symptomCounts.map(item => <span key={item.label} style={{ background: "#DCEFFF", color: "#0072D9", borderRadius: 14, padding: "0.1rem 0.5rem", fontSize: "0.74rem", fontWeight: 700 }}>{item.label} {item.count}</span>)}
        </div>
      )}
      {cases.length > 0 && (
        <div style={{ overflowX: "auto", border: "1px solid #e2e8f0", borderRadius: 8 }}>
          <table style={{ width: "100%", minWidth: 520, borderCollapse: "collapse" }}>
            <thead><tr style={{ background: "#f8fafc" }}>{["วันที่", "ชื่อ", "อาการ", "อุณหภูมิ", "การดูแล", "แจ้งผู้ปกครอง"].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
            <tbody>
              {cases.map((row, index) => (
                <tr key={`${row.date}-${index}`}>
                  <td style={{ ...td, whiteSpace: "nowrap" }}>{formatThaiDateKey(row.date)}</td>
                  <td style={{ ...td, whiteSpace: "nowrap" }}>{row.number ? `${row.number}. ` : ""}{row.name}</td>
                  <td style={td}>{[...row.symptoms, row.other].filter(Boolean).join(", ") || <span style={{ color: "#94a3b8" }}>ไม่ได้กรอก</span>}</td>
                  <td style={{ ...td, whiteSpace: "nowrap", color: Number(row.temp) >= 37.5 ? "#dc2626" : undefined, fontWeight: Number(row.temp) >= 37.5 ? 800 : 400 }}>{row.temp ? `${row.temp}°C` : "-"}</td>
                  <td style={{ ...td, whiteSpace: "nowrap" }}>{row.action || "-"}</td>
                  <td style={{ ...td, whiteSpace: "nowrap", color: row.parent ? "#166534" : "#b45309" }}>{row.parent ? "✓ แจ้งแล้ว" : "ยังไม่แจ้ง"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function RollStatsPanel({ book, month, onMonth, title }) {
  const summary = rollMonthSummary(book, month);
  return (
    <Card>
      <div style={{ display: "grid", gap: "0.8rem", minWidth: 0 }}>
        <div>
          <div style={{ fontWeight: 800, color: "#233862", fontSize: "1.05rem" }}>{title || "สถิติการเช็คชื่อ"}</div>
          <div style={{ color: "#64748b", fontSize: "0.82rem" }}>นับจากวันที่บันทึกการเช็คชื่อแล้ว</div>
        </div>
        <Field label="เดือน">
          <input type="month" value={month} max={todayISO().slice(0, 7)} onChange={event => onMonth(event.target.value)} style={{ ...periodInput, width: "100%", maxWidth: 240 }} />
        </Field>
        <div style={{ fontWeight: 800, color: "#233862" }}>เช็คชื่อแล้ว {summary.totals.days} วัน</div>
        <RollCountChips counts={summary.totals} />
        {summary.totals.sick > 0 && <SickCasesPanel book={book} month={month} title={title} />}
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
                  <span style={{ fontWeight: 800, color: "#233862", wordBreak: "break-word" }}>{studentLabel(student)}</span>
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


// ─── แผนการจัดกิจกรรม ─────────────────────────────────────────────────────────
// เก็บ 1 แผน = 1 แถวใน teaching_schedule (class_room = ACTIVITY_PLAN_ROOM, subject = JSON)
// สำรองใน localStorage "hr_activity_plans" แล้วรวมกับ Supabase ตอนโหลด (แบบเดียวกับรายชื่อนักเรียน)
const ACTIVITY_LOCAL_KEY = "hr_activity_plans";

function emptyActivityPlan(currentUser) {
  return { id: newSupervisionId(), row_id: null, title: "", description: "", date: todayISO(), materials: [], requisitions: [], worksheet_images: [], organizers: currentUser?.id ? [String(currentUser.id)] : [], created_by: currentUser?.id || "", created_by_name: currentUser?.name || "", updated_at: "" };
}

function cleanActivityPlan(raw) {
  const text = (value, max) => String(value || "").slice(0, max);
  const rows = (list, withUnit) => (Array.isArray(list) ? list : []).map(item => ({
    id: String(item?.id || newSupervisionId()),
    name: text(item?.name, 120),
    qty: text(item?.qty, 12),
    ...(withUnit ? { unit: text(item?.unit, 30) } : {}),
  })).slice(0, 100);
  return {
    id: String(raw?.id || newSupervisionId()),
    row_id: raw?.row_id ?? null,
    title: text(raw?.title, 200),
    description: text(raw?.description, 3000),
    date: /^\d{4}-\d{2}-\d{2}$/.test(raw?.date || "") ? raw.date : "",
    end_date: /^\d{4}-\d{2}-\d{2}$/.test(raw?.end_date || "") && raw.end_date > (raw?.date || "") ? raw.end_date : "",
    days: (Array.isArray(raw?.days) ? raw.days : []).filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d?.date || "")).map(d => ({ date: d.date, time: text(d.time, 60), detail: text(d.detail, 2000), holiday: !!d.holiday })).slice(0, 31),
    materials: rows(raw?.materials, false),
    requisitions: rows(raw?.requisitions, true),
    organizers: Array.isArray(raw?.organizers) ? [...new Set(raw.organizers.map(String))].slice(0, 50) : [],
    created_by: String(raw?.created_by || ""),
    created_by_name: text(raw?.created_by_name, 120),
    updated_at: String(raw?.updated_at || ""),
    pending: !!raw?.pending,
    worksheet_images: Array.isArray(raw?.worksheet_images) ? raw.worksheet_images.filter(img => img && (img.url || img.dataUrl)).slice(0, ACTIVITY_POST_IMAGE_LIMIT) : [],
    post_record: cleanActivityPost(raw?.post_record),
  };
}

// ─── แผนกิจกรรมหลายวัน: date = วันเริ่ม, end_date = วันสิ้นสุด (ว่าง = วันเดียว), days = รายละเอียดรายวัน (จ.–ศ.)
const TH_SHORT_MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
const TH_DAY_NAMES = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"];
function activityEnd(plan) { return plan?.end_date && plan.end_date > (plan.date || "") ? plan.end_date : (plan?.date || ""); }
function activityDowOf(key) { const [y, m, d] = key.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); }
// วันทำการ (จ.–ศ.) ในช่วง — ถ้าเป็นวันเดียวคืนวันนั้นเสมอ
function activityRangeDates(start, end) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start || "")) return [];
  if (!end || end <= start) return [start];
  const out = [];
  for (let key = start, i = 0; key <= end && i < 62; key = shiftDateKey(key, 1), i++) { const dow = activityDowOf(key); if (dow >= 1 && dow <= 5) out.push(key); }
  return out.length ? out.slice(0, 31) : [start];
}
function activityDayList(plan) {
  const byDate = new Map((plan?.days || []).map(d => [d.date, d]));
  return activityRangeDates(plan?.date, activityEnd(plan)).map(date => ({ date, time: "", detail: "", holiday: false, ...(byDate.get(date) || {}) }));
}
function activityActiveDates(plan) { return activityDayList(plan).filter(d => !d.holiday).map(d => d.date); }
function formatActivityRange(plan) {
  const start = plan?.date; if (!/^\d{4}-\d{2}-\d{2}$/.test(start || "")) return "-";
  const end = activityEnd(plan);
  if (end === start) return formatThaiDateKey(start);
  const [y1, m1, d1] = start.split("-").map(Number), [y2, m2, d2] = end.split("-").map(Number);
  if (y1 === y2 && m1 === m2) return `${d1}–${d2} ${TH_SHORT_MONTHS[m2 - 1]} ${y2 + 543}`;
  if (y1 === y2) return `${d1} ${TH_SHORT_MONTHS[m1 - 1]} – ${d2} ${TH_SHORT_MONTHS[m2 - 1]} ${y2 + 543}`;
  return `${d1} ${TH_SHORT_MONTHS[m1 - 1]} ${y1 + 543} – ${d2} ${TH_SHORT_MONTHS[m2 - 1]} ${y2 + 543}`;
}
function activityDayLabel(key) { const [, m, d] = key.split("-").map(Number); return `${TH_DAY_NAMES[activityDowOf(key)]} ${d} ${TH_SHORT_MONTHS[m - 1]}`; }
function activityIsMultiDay(plan) { return activityEnd(plan) !== plan?.date; }
function activityDaysHtml(plan, esc) {
  if (!activityIsMultiDay(plan)) return "";
  return `<h4>กำหนดการรายวัน</h4><table style="border-collapse:collapse;width:100%"><tr><th style="border:1px solid #999;padding:3px">วัน</th><th style="border:1px solid #999;padding:3px">เวลา</th><th style="border:1px solid #999;padding:3px">กิจกรรม</th></tr>${activityDayList(plan).map(d => `<tr><td style="border:1px solid #999;padding:3px;white-space:nowrap">${esc(activityDayLabel(d.date))}</td><td style="border:1px solid #999;padding:3px">${d.holiday ? "-" : esc(d.time) || "-"}</td><td style="border:1px solid #999;padding:3px">${d.holiday ? "<b>วันหยุด (ไม่มีกิจกรรม)</b>" : esc(d.detail) || "-"}</td></tr>`).join("")}</table>`;
}
// บันทึกหลังกิจกรรม — เก็บในแถว JSON เดียวกับแผน (ฟิลด์ post_record) แผนเก่าที่ไม่มีฟิลด์นี้ = ยังไม่บันทึก
const ACTIVITY_POST_IMAGE_LIMIT = 8;
function cleanActivityPost(raw) {
  if (!raw || typeof raw !== "object") return null;
  const text = (value, max) => String(value || "").slice(0, max);
  return {
    result: text(raw.result, 5000),
    participants: text(raw.participants, 40),
    problems: text(raw.problems, 4000),
    suggestions: text(raw.suggestions, 4000),
    images: Array.isArray(raw.images) ? raw.images.filter(img => img && (img.url || img.dataUrl)).slice(0, ACTIVITY_POST_IMAGE_LIMIT) : [],
    recorded_by: String(raw.recorded_by || ""),
    recorded_by_name: text(raw.recorded_by_name, 120),
    recorded_at: String(raw.recorded_at || ""),
  };
}

function printActivityPost(plan, nameOf) {
  const post = plan.post_record;
  if (!post) return;
  const win = window.open("", "_blank");
  if (!win) return;
  const esc = v => String(v || "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])).replace(/\n/g, "<br>");
  const block = (label, value) => `<h4>${label}</h4><div class="b">${esc(value) || "-"}</div>`;
  const imgs = (post.images || []).map(lessonFileHref).filter(Boolean);
  const sheets = (plan.worksheet_images || []).map(lessonFileHref).filter(Boolean);
  win.document.open();
  win.document.write(`<!doctype html><html lang="th"><head><meta charset="utf-8"><title>บันทึกหลังกิจกรรม ${esc(plan.title)}</title><style>@page{size:A4;margin:15mm}body{font-family:sans-serif;font-size:14px;color:#111}h2{text-align:center;margin:0 0 4px}h4{margin:12px 0 4px}.b{border:1px solid #999;border-radius:4px;padding:6px 8px;min-height:40px}.g{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px}img{width:48%;max-height:80mm;object-fit:contain;border:1px solid #999;page-break-inside:avoid}.sig{margin-top:30px;display:flex;justify-content:space-around;text-align:center}</style></head><body>
<h2>บันทึกหลังกิจกรรม</h2><div style="text-align:center">โรงเรียนนิมิตศึกษา</div>
<p><b>กิจกรรม:</b> ${esc(plan.title)} &nbsp; <b>วันที่จัด:</b> ${esc(formatActivityRange(plan))}${activityIsMultiDay(plan) ? ` (${activityActiveDates(plan).length} วัน)` : ""}<br><b>ครูผู้จัดกิจกรรม:</b> ${esc(plan.organizers.map(nameOf).join(", ") || "-")}${post.participants ? `<br><b>จำนวนผู้เข้าร่วม:</b> ${esc(post.participants)}` : ""}</p>
${activityDaysHtml(plan, esc)}${block("1. ผลการดำเนินกิจกรรม", post.result)}${block("2. ปัญหา/อุปสรรค", post.problems)}${block("3. ข้อเสนอแนะ/แนวทางแก้ไข", post.suggestions)}
${imgs.length ? `<h4>ภาพประกอบกิจกรรม</h4><div class="g">${imgs.map(u => `<img src="${esc(u)}">`).join("")}</div>` : ""}
${sheets.length ? `<h4>ใบงาน</h4><div class="g">${sheets.map(u => `<img src="${esc(u)}">`).join("")}</div>` : ""}
<div class="sig"><div>ลงชื่อ.................................ผู้บันทึก<br>(${esc(post.recorded_by_name || nameOf(post.recorded_by))})<br>${esc(post.recorded_at ? fmtDate(post.recorded_at) : "")}</div><div>ลงชื่อ.................................ผู้บริหาร<br>(.................................)</div></div>
</body></html>`);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 800);
}

function ActivityWorksheetPicker({ images = [], onChange, setError, userId }) {
  const [busy, setBusy] = useState(false);
  const add = async files => {
    const picked = Array.from(files || []).filter(f => !f.type || f.type.startsWith("image/"));
    if (!picked.length) return;
    const room = ACTIVITY_POST_IMAGE_LIMIT - images.length;
    if (room <= 0) { setError(`แนบใบงานได้ไม่เกิน ${ACTIVITY_POST_IMAGE_LIMIT} รูป`); return; }
    setBusy(true);
    try {
      const added = [];
      for (const f of picked.slice(0, room)) added.push(await uploadLessonImage(f, userId));
      onChange([...images, ...added]);
      setError("");
    } catch (err) { setError(err.message || "แนบใบงานไม่สำเร็จ"); }
    setBusy(false);
  };
  return (
    <div style={{ display: "grid", gap: "0.4rem" }}>
      <span style={{ fontWeight: 800, fontSize: "0.85rem", color: "#334155" }}>5. แนบใบงาน (ไม่บังคับ สูงสุด {ACTIVITY_POST_IMAGE_LIMIT} รูป)</span>
      <label style={{ ...btnSecondary, flex: "none", width: "fit-content", cursor: busy ? "not-allowed" : "pointer" }}>
        <Upload size={16} /> {busy ? "กำลังเพิ่มรูป..." : "เพิ่มใบงาน"}
        <input type="file" accept="image/*" multiple disabled={busy} onChange={e => { const files = Array.from(e.target.files || []); e.target.value = ""; add(files); }} style={{ display: "none" }} />
      </label>
      <div
        tabIndex={0}
        contentEditable={!busy}
        suppressContentEditableWarning
        onPaste={event => { event.preventDefault(); const files = Array.from(event.clipboardData?.items || []).filter(i => i.kind === "file" && i.type.startsWith("image/")).map(i => i.getAsFile()).filter(Boolean); if (files.length) add(files); }}
        onDragOver={event => event.preventDefault()}
        onDrop={event => { event.preventDefault(); add(event.dataTransfer?.files); }}
        onInput={event => { event.currentTarget.textContent = ""; }}
        data-placeholder="คลิกแล้วกด Ctrl+V เพื่อวางรูปใบงาน (มือถือ: กดค้างแล้วเลือกวาง) หรือลากรูปมาวางที่นี่"
        className="ws-paste-zone"
        style={{ border: "2px dashed #94a3b8", borderRadius: 10, padding: "0.8rem", minHeight: 44, color: "#64748b", fontSize: "0.85rem", outline: "none", cursor: "text", background: "#f8fafc" }}
      />
      <style>{`.ws-paste-zone:empty:before{content:attr(data-placeholder);color:#64748b}.ws-paste-zone:focus{border-color:#2563eb !important;background:#eff6ff !important}`}</style>
      <WorksheetImages images={images} title="ใบงานกิจกรรม" onRemove={index => onChange(images.filter((_, i) => i !== index))} />
    </div>
  );
}

function ActivityPostForm({ plan, currentUser, saving, onCancel, onSave, setError }) {
  const [post, setPost] = useState(() => plan.post_record || { result: "", participants: "", problems: "", suggestions: "", images: [] });
  const [busy, setBusy] = useState(false);
  const set = patch => setPost(current => ({ ...current, ...patch }));
  const small = { ...inputStyle, padding: "0.45rem 0.6rem", fontSize: "0.9rem" };
  const area = { ...small, minHeight: 90, resize: "vertical" };
  const addImages = async files => {
    const picked = Array.from(files || []).filter(f => !f.type || f.type.startsWith("image/"));
    if (!picked.length) return;
    const room = ACTIVITY_POST_IMAGE_LIMIT - (post.images || []).length;
    if (room <= 0) { setError(`แนบรูปได้ไม่เกิน ${ACTIVITY_POST_IMAGE_LIMIT} รูป`); return; }
    setBusy(true);
    try {
      const added = [];
      for (const f of picked.slice(0, room)) added.push(await uploadLessonImage(f, currentUser?.id));
      setPost(current => ({ ...current, images: [...(current.images || []), ...added] }));
      setError("");
    } catch (err) { setError(err.message || "แนบรูปไม่สำเร็จ"); }
    setBusy(false);
  };
  const label = text => <span style={{ fontWeight: 800, fontSize: "0.85rem", color: "#334155" }}>{text}</span>;
  return (
    <Card padding="0.85rem">
      <div style={{ display: "grid", gap: "0.6rem" }}>
        <div style={{ fontWeight: 800, fontSize: "1.05rem", color: "#233862" }}>บันทึกหลังกิจกรรม</div>
        <div style={{ fontSize: "0.85rem", color: "#475569" }}>{plan.title} · {formatActivityRange(plan)}</div>
        {label("1. ผลการดำเนินกิจกรรม")}
        <textarea value={post.result} placeholder="กิจกรรมเป็นอย่างไร ได้ผลอย่างไร" onChange={e => set({ result: e.target.value })} style={area} />
        {label("จำนวนผู้เข้าร่วม (ถ้ามี)")}
        <input value={post.participants} placeholder="เช่น นักเรียน 120 คน ครู 10 คน" onChange={e => set({ participants: e.target.value })} style={small} />
        {label("2. ปัญหา/อุปสรรค")}
        <textarea value={post.problems} onChange={e => set({ problems: e.target.value })} style={area} />
        {label("3. ข้อเสนอแนะ/แนวทางแก้ไข")}
        <textarea value={post.suggestions} onChange={e => set({ suggestions: e.target.value })} style={area} />
        {label(`ภาพกิจกรรม (ไม่บังคับ สูงสุด ${ACTIVITY_POST_IMAGE_LIMIT} รูป)`)}
        <label style={{ ...btnSecondary, flex: "none", width: "fit-content", cursor: busy ? "not-allowed" : "pointer" }}>
          <Upload size={16} /> {busy ? "กำลังเพิ่มรูป..." : "เพิ่มรูป"}
          <input type="file" accept="image/*" multiple disabled={busy} onChange={e => { const files = Array.from(e.target.files || []); e.target.value = ""; addImages(files); }} style={{ display: "none" }} />
        </label>
        <div
          tabIndex={0}
          contentEditable={!busy}
          suppressContentEditableWarning
          onPaste={event => { event.preventDefault(); const files = Array.from(event.clipboardData?.items || []).filter(i => i.kind === "file" && i.type.startsWith("image/")).map(i => i.getAsFile()).filter(Boolean); if (files.length) addImages(files); }}
          onDragOver={event => event.preventDefault()}
          onDrop={event => { event.preventDefault(); addImages(event.dataTransfer?.files); }}
          onInput={event => { event.currentTarget.textContent = ""; }}
          data-placeholder="คลิกแล้วกด Ctrl+V เพื่อวางรูป (มือถือ: กดค้างแล้วเลือกวาง) หรือลากรูปมาวางที่นี่"
          className="ws-paste-zone"
          style={{ border: "2px dashed #94a3b8", borderRadius: 10, padding: "0.8rem", minHeight: 44, color: "#64748b", fontSize: "0.85rem", outline: "none", cursor: "text", background: "#f8fafc" }}
        />
        <style>{`.ws-paste-zone:empty:before{content:attr(data-placeholder);color:#64748b}.ws-paste-zone:focus{border-color:#2563eb !important;background:#eff6ff !important}`}</style>
        <WorksheetImages images={post.images} title={`ภาพกิจกรรม ${plan.title}`} onRemove={index => set({ images: (post.images || []).filter((_, i) => i !== index) })} />
        <div style={{ fontSize: "0.75rem", color: "#94a3b8" }}>ผู้บันทึก: {currentUser?.name} · วันที่บันทึกจะใส่ให้อัตโนมัติ</div>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button type="button" onClick={onCancel} disabled={saving} style={{ ...btnSecondary, padding: "0.55rem" }}>ยกเลิก</button>
          <button type="button" disabled={saving || busy} onClick={() => {
            if (!String(post.result || "").trim()) { setError("กรอกผลการดำเนินกิจกรรมก่อน"); return; }
            onSave({ ...post, recorded_by: String(currentUser?.id || ""), recorded_by_name: currentUser?.name || "", recorded_at: new Date().toISOString() });
          }} style={{ ...btnPrimary, padding: "0.55rem", background: "linear-gradient(135deg, #008CFF, #0072D9)", color: "#fff", cursor: saving ? "not-allowed" : "pointer" }}><Save size={16} /> {saving ? "กำลังบันทึก..." : "บันทึก"}</button>
        </div>
      </div>
    </Card>
  );
}


function ActivityDaysView({ plan }) {
  if (!activityIsMultiDay(plan)) return null;
  return (
    <div style={{ display: "grid", gap: "0.2rem" }}>
      <div style={{ fontWeight: 800, color: "#334155" }}>กำหนดการรายวัน ({activityActiveDates(plan).length} วัน)</div>
      {activityDayList(plan).map(d => (
        <div key={d.date} style={{ fontSize: "0.82rem", display: "flex", gap: "0.4rem", color: d.holiday ? "#94a3b8" : "#334155" }}>
          <b style={{ flex: "none", minWidth: 110, color: d.holiday ? "#94a3b8" : "#0072D9" }}>{activityDayLabel(d.date)}</b>
          <span style={{ whiteSpace: "pre-wrap" }}>{d.holiday ? "วันหยุด (ไม่มีกิจกรรม)" : [d.time, d.detail].filter(Boolean).join(" · ") || "-"}</span>
        </div>
      ))}
    </div>
  );
}

function ActivityDateRangeEditor({ plan, onChange, small }) {
  const end = activityEnd(plan);
  const multi = activityIsMultiDay(plan);
  const days = activityDayList(plan);
  const setDays = next => onChange({ days: next });
  const setDay = (date, patch) => setDays(days.map(d => (d.date === date ? { ...d, ...patch } : d)));
  const copyFrom = (from, to) => { const src = days.find(d => d.date === from); if (src) setDay(to, { time: src.time, detail: src.detail }); };
  const wholeWeek = () => {
    const base = plan.date || todayISO();
    const dow = activityDowOf(base);
    const monday = dow === 0 ? shiftDateKey(base, 1) : dow === 6 ? shiftDateKey(base, 2) : shiftDateKey(base, 1 - dow);
    onChange({ date: monday, end_date: shiftDateKey(monday, 4) });
  };
  const lbl = { fontSize: "0.78rem", color: "#475569", fontWeight: 700, display: "grid", gap: "0.2rem" };
  return (
    <div style={{ display: "grid", gap: "0.45rem" }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "flex-end" }}>
        <label style={lbl}>วันที่เริ่ม<input type="date" value={plan.date} onChange={e => onChange({ date: e.target.value, ...(plan.end_date && e.target.value >= plan.end_date ? { end_date: "" } : {}) })} style={small} /></label>
        <label style={lbl}>วันที่สิ้นสุด (ไม่ใส่ = วันเดียว)<input type="date" value={plan.end_date || ""} min={plan.date || undefined} onChange={e => onChange({ end_date: e.target.value > (plan.date || "") ? e.target.value : "" })} style={small} /></label>
        <button type="button" onClick={wholeWeek} style={{ ...btnSecondary, flex: "none", padding: "0.45rem 0.7rem", fontSize: "0.82rem" }}>ทั้งสัปดาห์ จ.–ศ.</button>
        {multi && <button type="button" onClick={() => onChange({ end_date: "" })} style={{ ...btnSecondary, flex: "none", padding: "0.45rem 0.7rem", fontSize: "0.82rem" }}>วันเดียว</button>}
      </div>
      <div style={{ fontSize: "0.82rem", color: "#0072D9", fontWeight: 800 }}>จัดกิจกรรม: {formatActivityRange({ date: plan.date, end_date: end })}{multi ? ` · ${days.filter(d => !d.holiday).length} วัน` : ""}</div>
      {multi && (
        <div style={{ display: "grid", gap: "0.45rem" }}>
          <span style={{ fontWeight: 800, fontSize: "0.85rem", color: "#334155" }}>แผนรายวัน (เวลา + ทำอะไร)</span>
          {days.map((d, i) => (
            <div key={d.date} style={{ border: "1px solid #e2e8f0", borderRadius: 10, padding: "0.5rem", background: d.holiday ? "#f8fafc" : "#fff", display: "grid", gap: "0.35rem" }}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", alignItems: "center" }}>
                <b style={{ color: d.holiday ? "#94a3b8" : "#233862", flex: 1, minWidth: 120 }}>{activityDayLabel(d.date)}</b>
                <label style={{ fontSize: "0.8rem", color: "#b91c1c", display: "flex", gap: "0.25rem", alignItems: "center", cursor: "pointer" }}><input type="checkbox" checked={d.holiday} onChange={e => setDay(d.date, { holiday: e.target.checked })} /> วันหยุด</label>
                {i > 0 && !d.holiday && <button type="button" onClick={() => copyFrom(days[0].date, d.date)} style={{ ...btnSecondary, flex: "none", padding: "0.2rem 0.5rem", fontSize: "0.75rem" }}>ใช้แผน{TH_DAY_NAMES[activityDowOf(days[0].date)] === "จันทร์" ? "วันจันทร์" : "วันแรก"}</button>}
                {i > 1 && !d.holiday && <button type="button" onClick={() => copyFrom(days[i - 1].date, d.date)} style={{ ...btnSecondary, flex: "none", padding: "0.2rem 0.5rem", fontSize: "0.75rem" }}>ใช้แผนวันก่อน</button>}
              </div>
              {d.holiday ? <div style={{ fontSize: "0.8rem", color: "#94a3b8" }}>วันหยุด ไม่มีกิจกรรม</div> : (
                <>
                  <input value={d.time} placeholder="เวลา เช่น 08:30–10:00" onChange={e => setDay(d.date, { time: e.target.value })} style={small} />
                  <textarea value={d.detail} placeholder="ทำอะไรบ้างในวันนี้" onChange={e => setDay(d.date, { detail: e.target.value })} style={{ ...small, minHeight: 60, resize: "vertical" }} />
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ปฏิทินการศึกษา + แผนกิจกรรม (แสดงทุกวันทำการในช่วง ข้ามวันหยุดที่ติ๊กไว้ ซ่อนครูทดลองระบบ)
function AcademicCalendarWithActivities({ employees, currentUser }) {
  const [plans, setPlans] = useState([]);
  useEffect(() => { fetchActivityRows().then(setPlans, () => setPlans([])); }, []);
  const viewerIsTest = isTestTeacher(currentUser);
  const testIds = new Set((employees || []).filter(isTestTeacher).map(emp => String(emp.id)));
  const nameOf = id => (employees || []).find(emp => String(emp.id) === String(id))?.name || "";
  const extra = plans.filter(p => viewerIsTest || (!testIds.has(String(p.created_by)) && !(p.organizers.length && p.organizers.every(id => testIds.has(String(id))))))
    .flatMap(p => activityActiveDates(p).map(date => ({ date, title: `🎯 ${p.title}${activityIsMultiDay(p) ? ` (${formatActivityRange(p)})` : ""}`, teacher: p.organizers.map(nameOf).filter(Boolean).join(", "), activity: true })));
  return <AcademicCalendarPage extraEvents={extra} />;
}

function readActivityLocal() {
  try {
    const parsed = JSON.parse(localStorage.getItem(ACTIVITY_LOCAL_KEY) || "{}");
    return { plans: Array.isArray(parsed.plans) ? parsed.plans.map(cleanActivityPlan) : [], deleted: Array.isArray(parsed.deleted) ? parsed.deleted.map(String) : [] };
  } catch { return { plans: [], deleted: [] }; }
}

function writeActivityLocal(plans, deleted) {
  const save = list => localStorage.setItem(ACTIVITY_LOCAL_KEY, JSON.stringify({ plans: list, deleted: deleted.slice(-300), saved_local_at: new Date().toISOString() }));
  try { save(plans); } catch {
    // รูปบันทึกหลังกิจกรรมใหญ่เกินพื้นที่เครื่อง → สำรองเฉพาะข้อความ (ยกเว้นแผนที่ยังรอซิงก์)
    try { save(plans.map(plan => (plan.post_record && !plan.pending ? { ...plan, post_record: { ...plan.post_record, images: [] } } : plan))); } catch { /* ignore */ }
  }
}

function fetchActivityRows() {
  return cached("activity-rows", 300000, fetchActivityRowsRaw).then(rows => rows.map(row => ({ ...row })));
}

async function fetchActivityRowsRaw() {
  const { data, error } = await supabase
    .from("teaching_schedule")
    .select("id, employee_id, subject, created_at")
    .eq("class_room", ACTIVITY_PLAN_ROOM)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data || []).map(row => {
    try { return cleanActivityPlan({ ...JSON.parse(row.subject || "{}"), row_id: row.id, pending: false }); } catch { return null; }
  }).filter(Boolean);
}

async function writeActivityRow(plan) {
  const body = { ...plan };
  delete body.row_id;
  delete body.pending;
  const payload = { employee_id: plan.created_by || null, day_of_week: 0, period: 0, class_room: ACTIVITY_PLAN_ROOM, start_time: "00:00:00", end_time: null, subject: JSON.stringify(body) };
  const result = plan.row_id
    ? await supabase.from("teaching_schedule").update(payload).eq("id", plan.row_id).select("id").single()
    : await supabase.from("teaching_schedule").insert(payload).select("id").single();
  if (result.error) throw new Error(result.error.message);
  return result.data.id;
}

function ActivityRowsEditor({ title, rows, withUnit, onChange }) {
  const set = (id, patch) => onChange(rows.map(row => (row.id === id ? { ...row, ...patch } : row)));
  const small = { ...inputStyle, padding: "0.35rem 0.5rem", fontSize: "0.85rem", minWidth: 0 };
  return (
    <div style={{ display: "grid", gap: "0.3rem" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontWeight: 800, fontSize: "0.85rem", color: "#334155" }}>{title}</span>
        <button type="button" aria-label={`เพิ่ม${title}`} onClick={() => onChange([...rows, { id: newSupervisionId(), name: "", qty: "", ...(withUnit ? { unit: "" } : {}) }])} style={{ ...btnSecondary, flex: "none", padding: "0.25rem 0.55rem", fontSize: "0.8rem" }}><Plus size={14} /> เพิ่ม</button>
      </div>
      {rows.length === 0 && <div style={{ color: "#94a3b8", fontSize: "0.8rem" }}>ยังไม่มีรายการ กด + เพิ่ม</div>}
      {rows.map((row, index) => (
        <div key={row.id} style={{ display: "grid", gridTemplateColumns: withUnit ? "1.4rem minmax(0,1fr) 4.2rem 4.5rem 1.8rem" : "1.4rem minmax(0,1fr) 4.2rem 1.8rem", gap: "0.25rem", alignItems: "center" }}>
          <span style={{ color: "#94a3b8", fontSize: "0.8rem", textAlign: "right" }}>{index + 1}.</span>
          <input value={row.name} placeholder="ชื่อสิ่งของ" onChange={event => set(row.id, { name: event.target.value })} style={small} />
          <input value={row.qty} inputMode="decimal" placeholder="จำนวน" onChange={event => set(row.id, { qty: event.target.value })} style={small} />
          {withUnit && <input value={row.unit} placeholder="หน่วย" onChange={event => set(row.id, { unit: event.target.value })} style={small} />}
          <button type="button" aria-label="ลบรายการ" onClick={() => onChange(rows.filter(item => item.id !== row.id))} style={{ width: 26, height: 26, border: "none", borderRadius: "50%", background: "#fee2e2", color: "#b91c1c", display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0 }}><X size={13} /></button>
        </div>
      ))}
    </div>
  );
}

function ActivityPlanPage({ employees, currentUser }) {
  const isAdmin = isExecutiveUser(currentUser);
  const [plans, setPlans] = useState([]);
  const [deleted, setDeleted] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(null);
  const [openId, setOpenId] = useState("");
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const nameOf = id => (employees || []).find(emp => String(emp.id) === String(id))?.name || "ไม่ทราบชื่อ";
  const canEdit = plan => isAdmin || String(plan.created_by) === String(currentUser?.id);
  const canPost = plan => isAdmin || hasAdminRights(currentUser) || String(plan.created_by) === String(currentUser?.id) || plan.organizers.includes(String(currentUser?.id));
  const [postFor, setPostFor] = useState(null);
  const viewerIsTest = isTestTeacher(currentUser);
  const testIds = new Set((employees || []).filter(isTestTeacher).map(emp => String(emp.id)));
  const pickableEmployees = (employees || []).filter(emp => viewerIsTest || !isTestTeacher(emp));

  const commit = (nextPlans, nextDeleted = deleted) => {
    const sorted = [...nextPlans].sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.updated_at).localeCompare(String(a.updated_at)));
    setPlans(sorted);
    setDeleted(nextDeleted);
    writeActivityLocal(sorted, nextDeleted);
  };

  useEffect(() => {
    let active = true;
    (async () => {
      const local = readActivityLocal();
      try {
        const remote = await fetchActivityRows();
        if (!active) return;
        const deletedSet = new Set(local.deleted);
        const byId = new Map();
        remote.forEach(plan => { if (!deletedSet.has(plan.id)) byId.set(plan.id, plan); });
        const toSync = [];
        local.plans.forEach(plan => {
          if (deletedSet.has(plan.id)) return;
          const current = byId.get(plan.id);
          if (!current || (plan.pending && String(plan.updated_at) > String(current.updated_at))) {
            byId.set(plan.id, { ...plan, row_id: current?.row_id || plan.row_id || null });
            if (plan.pending || !current) toSync.push(plan.id);
          }
        });
        const merged = [...byId.values()];
        // ลบแถวที่ถูกลบในเครื่องตอนออฟไลน์
        const toDelete = remote.filter(plan => deletedSet.has(plan.id) && plan.row_id).map(plan => plan.row_id);
        if (toDelete.length) await supabase.from("teaching_schedule").delete().in("id", toDelete).then(() => {}, () => {});
        for (const id of toSync) {
          const plan = merged.find(item => item.id === id);
          try { plan.row_id = await writeActivityRow(plan); plan.pending = false; } catch { /* คงไว้ในเครื่อง */ }
        }
        if (active) commit(merged, toDelete.length ? [] : local.deleted);
      } catch (err) {
        if (active) {
          commit(local.plans, local.deleted);
          setError(`โหลดจากฐานข้อมูลไม่ได้ (${err.message || "เชื่อมต่อไม่สำเร็จ"}) แสดงแผนที่เก็บไว้ในเครื่องนี้`);
        }
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = async () => {
    const plan = cleanActivityPlan({ ...editing, updated_at: new Date().toISOString() });
    if (!plan.title.trim()) { setError("กรอกชื่อกิจกรรมก่อน"); return; }
    if (!plan.date) { setError("เลือกวันที่จัดกิจกรรม"); return; }
    plan.days = activityIsMultiDay(plan) ? activityDayList(plan) : [];
    if (activityIsMultiDay(plan) && !activityActiveDates(plan).length) { setError("ทุกวันถูกติ๊กเป็นวันหยุด เลือกอย่างน้อย 1 วันที่จัดกิจกรรม"); return; }
    plan.materials = plan.materials.filter(row => row.name.trim());
    plan.requisitions = plan.requisitions.filter(row => row.name.trim());
    if (plan.organizers.length === 0 && currentUser?.id) plan.organizers = [String(currentUser.id)];
    setSaving(true);
    setError("");
    setMessage("");
    try {
      plan.row_id = await writeActivityRow(plan);
      plan.pending = false;
      setMessage("บันทึกแผนกิจกรรมแล้ว");
    } catch (err) {
      plan.pending = true;
      setError(`${err.message || "บันทึกไม่สำเร็จ"} · เก็บไว้ในเครื่องนี้แล้ว จะซิงก์ขึ้นระบบเมื่อเปิดหน้านี้ครั้งถัดไป`);
    }
    commit([plan, ...plans.filter(item => item.id !== plan.id)]);
    setEditing(null);
    setOpenId(plan.id);
    setSaving(false);
  };

  const remove = async plan => {
    if (!canEdit(plan) || !window.confirm(`ลบแผน "${plan.title}"?`)) return;
    setSaving(true);
    let nextDeleted = deleted;
    try {
      if (plan.row_id) {
        const { error: delError } = await supabase.from("teaching_schedule").delete().eq("id", plan.row_id);
        if (delError) throw new Error(delError.message);
      }
      setMessage("ลบแผนแล้ว");
    } catch {
      nextDeleted = [...deleted, plan.id];
      setMessage("ลบในเครื่องแล้ว จะลบในระบบเมื่อเชื่อมต่อได้");
    }
    commit(plans.filter(item => item.id !== plan.id), nextDeleted);
    setSaving(false);
  };

  const savePost = async post => {
    const plan = cleanActivityPlan({ ...postFor, post_record: post, updated_at: new Date().toISOString() });
    setSaving(true); setError(""); setMessage("");
    try {
      plan.row_id = await writeActivityRow(plan);
      plan.pending = false;
      setMessage("บันทึกหลังกิจกรรมแล้ว");
    } catch (err) {
      plan.pending = true;
      setError(`${err.message || "บันทึกไม่สำเร็จ"} · เก็บไว้ในเครื่องนี้แล้ว จะซิงก์ขึ้นระบบเมื่อเปิดหน้านี้ครั้งถัดไป`);
    }
    commit([plan, ...plans.filter(item => item.id !== plan.id)]);
    setPostFor(null); setOpenId(plan.id); setSaving(false);
  };

  const q = query.trim().toLowerCase();
  const visiblePlans = plans.filter(plan => viewerIsTest || !testIds.has(String(plan.created_by)));
  const shown = visiblePlans.filter(plan => !q || [plan.title, plan.description, ...plan.organizers.map(nameOf)].join(" ").toLowerCase().includes(q));
  const small = { ...inputStyle, padding: "0.45rem 0.6rem", fontSize: "0.9rem" };

  if (postFor) {
    return (
      <div style={{ display: "grid", gap: "0.75rem", maxWidth: 760 }}>
        {error && <ErrorBox>{error}</ErrorBox>}
        <ActivityPostForm plan={postFor} currentUser={currentUser} saving={saving} setError={setError} onCancel={() => { setPostFor(null); setError(""); }} onSave={savePost} />
      </div>
    );
  }

  if (editing) {
    const set = patch => setEditing(current => ({ ...current, ...patch }));
    const toggleOrganizer = id => set({ organizers: editing.organizers.includes(id) ? editing.organizers.filter(item => item !== id) : [...editing.organizers, id] });
    return (
      <div style={{ display: "grid", gap: "0.75rem", maxWidth: 760 }}>
        {error && <ErrorBox>{error}</ErrorBox>}
        <Card padding="0.85rem">
          <div style={{ display: "grid", gap: "0.7rem" }}>
            <div style={{ fontWeight: 800, fontSize: "1.05rem", color: "#233862" }}>{editing.row_id || plans.some(item => item.id === editing.id) ? "แก้ไขแผนกิจกรรม" : "เพิ่มแผนกิจกรรม"}</div>
            <div style={{ fontWeight: 800, fontSize: "0.85rem", color: "#334155" }}>1. กิจกรรมที่จัด</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 200px), 1fr))", gap: "0.5rem" }}>
              <input value={editing.title} placeholder="ชื่อกิจกรรม" onChange={event => set({ title: event.target.value })} style={small} />
            </div>
            <ActivityDateRangeEditor plan={editing} onChange={set} small={small} />
            <textarea value={editing.description} placeholder="รายละเอียดกิจกรรม" onChange={event => set({ description: event.target.value })} style={{ ...small, minHeight: 80, resize: "vertical" }} />
            <ActivityRowsEditor title="2. สิ่งของที่ใช้" rows={editing.materials} onChange={materials => set({ materials })} />
            <ActivityRowsEditor title="3. ของที่ใช้เบิก" rows={editing.requisitions} withUnit onChange={requisitions => set({ requisitions })} />
            <div style={{ display: "grid", gap: "0.3rem" }}>
              <span style={{ fontWeight: 800, fontSize: "0.85rem", color: "#334155" }}>4. ครูผู้จัดกิจกรรม ({editing.organizers.length} คน)</span>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.3rem", maxHeight: 180, overflowY: "auto" }}>
                {pickableEmployees.map(emp => {
                  const on = editing.organizers.includes(String(emp.id));
                  return <button key={emp.id} type="button" aria-pressed={on} onClick={() => toggleOrganizer(String(emp.id))} style={{ border: `1px solid ${on ? "#0072D9" : "#cbd5e1"}`, background: on ? "#0072D9" : "#fff", color: on ? "#fff" : "#475569", borderRadius: 14, padding: "0.15rem 0.6rem", fontSize: "0.8rem", fontFamily: "inherit", cursor: "pointer" }}>{emp.name}</button>;
                })}
              </div>
            </div>
            <ActivityWorksheetPicker images={editing.worksheet_images || []} onChange={worksheet_images => set({ worksheet_images })} setError={setError} userId={currentUser?.id} />
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <button type="button" onClick={() => { setEditing(null); setError(""); }} disabled={saving} style={{ ...btnSecondary, padding: "0.55rem" }}>ยกเลิก</button>
              <button type="button" onClick={save} disabled={saving} style={{ ...btnPrimary, padding: "0.55rem", background: "linear-gradient(135deg, #008CFF, #0072D9)", color: "#fff", cursor: saving ? "not-allowed" : "pointer" }}><Save size={16} /> {saving ? "กำลังบันทึก..." : "บันทึก"}</button>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: "0.75rem", maxWidth: 900 }}>
      <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ fontWeight: 800, fontSize: "1.15rem", color: "#233862", flex: 1 }}>แผนการจัดกิจกรรม <span style={{ color: "#64748b", fontSize: "0.85rem" }}>({visiblePlans.length})</span></div>
        <input value={query} placeholder="ค้นหากิจกรรม/ครู" onChange={event => setQuery(event.target.value)} style={{ ...small, width: "auto", flex: "1 1 160px", maxWidth: 260 }} />
        <button type="button" onClick={() => { setEditing(emptyActivityPlan(currentUser)); setMessage(""); setError(""); }} style={{ ...btnPrimary, flex: "none", padding: "0.5rem 0.8rem", background: "linear-gradient(135deg, #008CFF, #0072D9)", color: "#fff", cursor: "pointer" }}><Plus size={16} /> เพิ่มแผน</button>
      </div>
      {error && <ErrorBox>{error}</ErrorBox>}
      {message && <div style={{ background: "#ecfdf5", border: "1px solid #bbf7d0", borderRadius: 10, padding: "0.5rem 0.8rem", color: "#166534", fontWeight: 700, fontSize: "0.88rem" }}>{message}</div>}
      {loading ? (
        <Card><div style={{ color: "#64748b" }}>กำลังโหลดแผนกิจกรรม...</div></Card>
      ) : shown.length === 0 ? (
        <Card><div style={{ color: "#94a3b8", textAlign: "center" }}>{visiblePlans.length ? "ไม่พบแผนที่ค้นหา" : "ยังไม่มีแผนกิจกรรม กด + เพิ่มแผน"}</div></Card>
      ) : shown.map(plan => {
        const open = openId === plan.id;
        return (
          <Card key={plan.id} padding="0.6rem 0.8rem">
            <button type="button" onClick={() => setOpenId(open ? "" : plan.id)} aria-expanded={open} style={{ width: "100%", display: "flex", gap: "0.5rem", alignItems: "center", border: "none", background: "transparent", padding: 0, fontFamily: "inherit", textAlign: "left", cursor: "pointer" }}>
              <span style={{ fontSize: "0.78rem", color: "#0072D9", fontWeight: 800, flex: "none" }}>{formatActivityRange(plan)}</span>
              <span style={{ fontWeight: 800, color: "#233862", flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{plan.title}</span>
              {plan.pending && <span style={{ fontSize: "0.7rem", color: "#b45309", flex: "none" }}>รอซิงก์</span>}
              <span style={{ fontSize: "0.68rem", fontWeight: 800, flex: "none", borderRadius: 999, padding: "0.1rem 0.45rem", background: plan.post_record ? "#dcfce7" : "#f1f5f9", color: plan.post_record ? "#15803d" : "#64748b" }}>{plan.post_record ? "บันทึกแล้ว" : "ยังไม่บันทึก"}</span>
              {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
            {!open && <div style={{ fontSize: "0.75rem", color: "#64748b", marginTop: "0.15rem", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>ครู: {plan.organizers.map(nameOf).join(", ") || "-"}</div>}
            {open && (
              <div style={{ display: "grid", gap: "0.5rem", marginTop: "0.5rem", fontSize: "0.88rem" }}>
                {plan.description && <FullText value={plan.description} />}
                <ActivityDaysView plan={plan} />
                {[["สิ่งของที่ใช้", plan.materials, false], ["ของที่ใช้เบิก", plan.requisitions, true]].map(([label, rows, withUnit]) => (
                  <div key={label}>
                    <div style={{ fontWeight: 800, color: "#334155" }}>{label} ({rows.length})</div>
                    {rows.length === 0 ? <div style={{ color: "#94a3b8" }}>-</div> : (
                      <div style={{ overflowX: "auto" }}>
                        <table style={{ borderCollapse: "collapse", fontSize: "0.82rem", minWidth: 260 }}>
                          <tbody>
                            {rows.map((row, index) => (
                              <tr key={row.id} style={{ borderTop: "1px solid #f1f5f9" }}>
                                <td style={{ padding: "0.15rem 0.4rem", color: "#94a3b8" }}>{index + 1}.</td>
                                <td style={{ padding: "0.15rem 0.4rem" }}>{row.name}</td>
                                <td style={{ padding: "0.15rem 0.4rem", textAlign: "right" }}>{row.qty || "-"}</td>
                                {withUnit && <td style={{ padding: "0.15rem 0.4rem" }}>{row.unit}</td>}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                ))}
                {(plan.worksheet_images || []).length > 0 && <div><div style={{ fontWeight: 800, color: "#334155" }}>ใบงาน ({plan.worksheet_images.length})</div><WorksheetImages images={plan.worksheet_images} title={`ใบงาน ${plan.title}`} /></div>}
                <div><span style={{ fontWeight: 800, color: "#334155" }}>ครูผู้จัดกิจกรรม: </span>{plan.organizers.map(nameOf).join(", ") || "-"}</div>
                <div style={{ fontSize: "0.75rem", color: "#94a3b8" }}>สร้างโดย {plan.created_by_name || nameOf(plan.created_by)}{plan.updated_at ? ` · แก้ล่าสุด ${fmtDate(plan.updated_at)} ${fmtTime(plan.updated_at)}` : ""}</div>
                {plan.post_record && (
                  <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10, padding: "0.55rem 0.7rem", display: "grid", gap: "0.35rem" }}>
                    <div style={{ fontWeight: 800, color: "#15803d" }}>บันทึกหลังกิจกรรม</div>
                    {[["ผลการดำเนินกิจกรรม", plan.post_record.result], ["จำนวนผู้เข้าร่วม", plan.post_record.participants], ["ปัญหา/อุปสรรค", plan.post_record.problems], ["ข้อเสนอแนะ/แนวทางแก้ไข", plan.post_record.suggestions]].filter(([, v]) => String(v || "").trim()).map(([label, value]) => (
                      <div key={label}><span style={{ fontWeight: 800, color: "#334155" }}>{label}: </span><span style={{ whiteSpace: "pre-wrap" }}>{value}</span></div>
                    ))}
                    {(plan.post_record.images || []).length > 0 && <WorksheetImages images={plan.post_record.images} title={`ภาพกิจกรรม ${plan.title}`} />}
                    <div style={{ fontSize: "0.75rem", color: "#94a3b8" }}>บันทึกโดย {plan.post_record.recorded_by_name || nameOf(plan.post_record.recorded_by)}{plan.post_record.recorded_at ? ` · ${fmtDate(plan.post_record.recorded_at)} ${fmtTime(plan.post_record.recorded_at)}` : ""}</div>
                  </div>
                )}
                <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
                  {canPost(plan) && <button type="button" onClick={() => { setPostFor({ ...plan }); setMessage(""); setError(""); }} disabled={saving} style={{ ...btnSecondary, flex: "none", padding: "0.35rem 0.7rem", fontSize: "0.82rem", color: "#15803d" }}><FileText size={14} /> {plan.post_record ? "แก้บันทึกหลังกิจกรรม" : "บันทึกหลังกิจกรรม"}</button>}
                  {plan.post_record && <button type="button" onClick={() => printActivityPost(plan, nameOf)} style={{ ...btnSecondary, flex: "none", padding: "0.35rem 0.7rem", fontSize: "0.82rem" }}><Printer size={14} /> พิมพ์บันทึก</button>}
                </div>
                {canEdit(plan) && (
                  <div style={{ display: "flex", gap: "0.4rem" }}>
                    <button type="button" onClick={() => { setEditing({ ...plan }); setMessage(""); setError(""); }} disabled={saving} style={{ ...btnSecondary, flex: "none", padding: "0.35rem 0.7rem", fontSize: "0.82rem" }}><Edit size={14} /> แก้ไข</button>
                    <button type="button" onClick={() => remove(plan)} disabled={saving} style={{ ...btnSecondary, flex: "none", padding: "0.35rem 0.7rem", fontSize: "0.82rem", color: "#dc2626" }}><Trash2 size={14} /> ลบ</button>
                  </div>
                )}
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}

// ─── ประเมินครู (ระบบหัก/เพิ่มคะแนนรายภาคเรียน) ─────────────────────────────────
// เริ่ม 100 คะแนน/ภาคเรียน หักอัตโนมัติจากข้อมูลในระบบ + ผู้บริหารหัก/เพิ่มเอง
// เก็บใน teaching_schedule (class_room = TEACHER_EVAL_ROOM) แถวละ 1 ครู/ภาค (kind "deduct")
// + แถวตั้งค่า (kind "deduct_settings", period 2) + แถวล็อกคะแนน (kind "deduct_lock")
// ข้อมูลเดิมแบบ 60/40 (kind "eval"/"settings") ยังอยู่ในฐานข้อมูลแต่ไม่ถูกใช้
const TEACHER_EVAL_ROOM = "__TEACHER_EVAL__";
const EVAL2_LOCAL_KEY = "hr_teacher_eval_v2";
const EVAL2_SETTINGS_PERIOD = 2;
const EVAL_LEVELS = [
  { min: 90, label: "ดีเยี่ยม", color: "#166534", bg: "#dcfce7" },
  { min: 80, label: "ดีมาก", color: "#0072D9", bg: "#DCEFFF" },
  { min: 70, label: "ดี", color: "#0f766e", bg: "#ccfbf1" },
  { min: 60, label: "พอใช้", color: "#b45309", bg: "#fef3c7" },
  { min: -1, label: "ต้องปรับปรุง", color: "#b91c1c", bg: "#fee2e2" },
];
const EVAL_POINT_OPTIONS = [0.5, 1, 2, 3, 5, 10];
const EVAL_CATEGORIES = [
  { key: "dress", label: "การแต่งกาย", type: "deduct", points: 1 },
  { key: "abandon", label: "ทิ้งงานที่ได้รับมอบหมาย", type: "deduct", points: 3 },
  { key: "ethics", label: "ผิดวินัย/จรรยาบรรณ", desc: "เช่น ตีนักเรียน / ผู้ปกครองร้องเรียน", type: "deduct", points: 5 },
  { key: "complaint", label: "ผู้ปกครองร้องเรียน", desc: "หัก 1–5 คะแนน ตามความรุนแรง", type: "deduct", points: 1, options: [1, 2, 3, 4, 5] },
  { key: "offsite", label: "ออกนอกบริเวณโดยไม่แจ้งในระบบ", desc: "หักครั้งละ 1 คะแนน", type: "deduct", points: 1, options: [1] },
  { key: "supervision", label: "ผลนิเทศต่ำ", type: "deduct", points: 2 },
  { key: "activity", label: "จัดกิจกรรม", type: "add", points: 2 },
  { key: "award", label: "ผลงาน/รางวัล", type: "add", points: 5 },
  { key: "project_owner", label: "เจ้าของโครงการ", desc: "+1 ถึง +5 ตามผลการประเมินโครงการ", type: "add", points: 1, options: [1, 2, 3, 4, 5] },
  { key: "training", label: "ไปอบรม", desc: "+1 ต่อครั้ง", type: "add", points: 1, options: [1] },
  { key: "sacrifice", label: "เสียสละเวลาให้กับโรงเรียน", desc: "+1 ต่อครั้ง", type: "add", points: 1, options: [1] },
  { key: "other", label: "อื่นๆ", type: "deduct", points: 1 },
  // หมวดเดิม (เลิกใช้แล้ว) เก็บไว้ให้รายการเก่ายังแสดง/คิดคะแนนเหมือนเดิม แต่ไม่ให้เลือกใหม่
  { key: "duty", label: "ไม่เข้าเวร (หมวดเดิม)", type: "deduct", points: 2, legacy: true },
];
const evalPointOptions = key => EVAL_CATEGORIES.find(item => item.key === key)?.options || EVAL_POINT_OPTIONS;
const EVAL_AUTO_RULES = [
  { key: "late_checkin", label: "ลงเวลาสาย", points: 0.5 },
  { key: "no_checkin", label: "ไม่ลงเวลาเข้า (วันทำงาน ไม่นับวันลาที่อนุมัติ)", points: 1 },
  { key: "plan_late", label: "ส่งแผนรายสัปดาห์ช้า (กำหนดส่งภายในวันอาทิตย์ก่อนสัปดาห์สอน ก่อน 08:00 น.) ต่อสัปดาห์", points: 1 },
  { key: "plan_missing", label: "ไม่ส่งแผนรายสัปดาห์ (เลยวันอาทิตย์ 08:00 น. แล้วยังไม่ส่ง) ต่อสัปดาห์", points: 2 },
  { key: "post_missing", label: "ไม่มีบันทึกหลังสอน (ต่อคาบ)", points: 0.5 },
  { key: "roll_missing", label: "ไม่เช็คชื่อนักเรียน (ต่อวัน)", points: 0.5 },
];

function defaultEval2Settings(workStart) {
  const rules = {};
  EVAL_AUTO_RULES.forEach(rule => { rules[rule.key] = { on: true, points: rule.points }; });
  return { kind: "deduct_settings", work_start: String(workStart || "08:00").slice(0, 5), rules, holidays: [], ranges: {}, updated_at: "" };
}

function cleanEval2Settings(raw, workStart) {
  const base = defaultEval2Settings(workStart);
  if (!raw || typeof raw !== "object") return base;
  const rules = {};
  EVAL_AUTO_RULES.forEach(rule => {
    const saved = raw.rules?.[rule.key];
    const points = Number(saved?.points);
    rules[rule.key] = { on: saved?.on !== false, points: points >= 0 && points <= 100 ? points : rule.points };
  });
  return {
    kind: "deduct_settings",
    work_start: /^\d{2}:\d{2}/.test(raw.work_start || "") ? raw.work_start.slice(0, 5) : base.work_start,
    rules,
    holidays: Array.isArray(raw.holidays) ? raw.holidays.filter(date => /^\d{4}-\d{2}-\d{2}$/.test(date)).slice(0, 200) : [],
    ranges: raw.ranges && typeof raw.ranges === "object" ? raw.ranges : {},
    updated_at: String(raw.updated_at || ""),
    row_id: raw.row_id ?? null,
    pending: !!raw.pending,
  };
}

function cleanEvalEntry(raw) {
  const category = EVAL_CATEGORIES.find(item => item.key === raw?.category) || EVAL_CATEGORIES[EVAL_CATEGORIES.length - 1];
  const points = Number(raw?.points);
  return {
    id: String(raw?.id || newSupervisionId()),
    date: /^\d{4}-\d{2}-\d{2}$/.test(raw?.date || "") ? raw.date : todayISO(),
    category: category.key,
    type: raw?.type === "add" ? "add" : "deduct",
    points: points > 0 && points <= 100 ? points : category.points,
    reason: String(raw?.reason || "").slice(0, 500),
    by: String(raw?.by || "").slice(0, 120),
    at: String(raw?.at || ""),
  };
}

function cleanEvalBook(raw) {
  return {
    kind: "deduct",
    teacher_id: String(raw?.teacher_id || ""),
    sem: Number(raw?.sem) || 0,
    entries: (Array.isArray(raw?.entries) ? raw.entries : []).map(cleanEvalEntry).slice(0, 500),
    deleted: Array.isArray(raw?.deleted) ? raw.deleted.map(String).slice(-500) : [],
    updated_at: String(raw?.updated_at || ""),
    row_id: raw?.row_id ?? null,
    pending: !!raw?.pending,
  };
}

function mergeEvalBooks(left, right) {
  if (!left) return right;
  if (!right) return left;
  const deleted = [...new Set([...left.deleted, ...right.deleted])];
  const byId = new Map();
  [...left.entries, ...right.entries].forEach(entry => { if (!deleted.includes(entry.id)) byId.set(entry.id, entry); });
  const newer = left.updated_at >= right.updated_at ? left : right;
  return { ...newer, entries: [...byId.values()], deleted, row_id: left.row_id || right.row_id };
}

function evalLevel(score) {
  return EVAL_LEVELS.find(level => score >= level.min) || EVAL_LEVELS[EVAL_LEVELS.length - 1];
}

function EvalLevelBadge({ score }) {
  const level = evalLevel(score);
  return <span style={{ background: level.bg, color: level.color, fontWeight: 800, fontSize: "0.72rem", borderRadius: 20, padding: "0.12rem 0.5rem", whiteSpace: "nowrap" }}>{level.label}</span>;
}

// ภาคเรียน 1/2569 ปิดแล้ว (รีเซ็ตคะแนน 13 ต.ค. 2569) — เริ่มนับใหม่ที่ 2/2569
const EVAL_FRESH_START = { term: 2, year: 2569 };
function currentSemester() {
  const today = todayISO();
  if (today < "2027-04-01") return { ...EVAL_FRESH_START };
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  if (month >= 5 && month <= 10) return { term: 1, year: year + 543 };
  if (month >= 11) return { term: 2, year: year + 543 };
  return { term: 2, year: year + 542 };
}

function semesterKey(sem) {
  return sem.year * 10 + sem.term;
}

function semesterRange(sem, settings) {
  const ce = sem.year - 543;
  const base = sem.term === 1 ? { start: `${ce}-05-16`, end: `${ce}-10-10` } : { start: `${ce}-11-01`, end: `${ce + 1}-03-31` };
  const saved = settings?.ranges?.[semesterKey(sem)];
  return {
    start: /^\d{4}-\d{2}-\d{2}$/.test(saved?.start || "") ? saved.start : base.start,
    end: /^\d{4}-\d{2}-\d{2}$/.test(saved?.end || "") ? saved.end : base.end,
  };
}

function schoolDaysBetween(start, end, holidays = []) {
  const skip = new Set(holidays);
  const days = [];
  let cursor = start;
  let guard = 0;
  while (cursor <= end && guard < 400) {
    const dow = new Date(`${cursor}T00:00:00`).getDay();
    if (dow >= 1 && dow <= 5 && !skip.has(cursor)) days.push(cursor);
    cursor = shiftDateKey(cursor, 1);
    guard += 1;
  }
  return days;
}

const EVAL_RESET_FLAG_KEY = "hr_teacher_eval_reset_version";
const EVAL_RESET_VERSION = "20261013";
function applyEvalLocalReset() {
  try {
    if (localStorage.getItem(EVAL_RESET_FLAG_KEY) === EVAL_RESET_VERSION) return;
    let keepSettings = null;
    try { keepSettings = JSON.parse(localStorage.getItem(EVAL2_LOCAL_KEY) || "{}").settings || null; } catch { /* ignore */ }
    localStorage.removeItem("hr_teacher_eval");
    localStorage.removeItem(EVAL2_LOCAL_KEY);
    if (keepSettings) localStorage.setItem(EVAL2_LOCAL_KEY, JSON.stringify({ books: {}, settings: keepSettings, locks: {} }));
    localStorage.setItem(EVAL_RESET_FLAG_KEY, EVAL_RESET_VERSION);
  } catch { /* ignore */ }
}

function readEval2Local() {
  applyEvalLocalReset();
  try {
    const parsed = JSON.parse(localStorage.getItem(EVAL2_LOCAL_KEY) || "{}");
    const books = {};
    Object.entries(parsed.books || {}).forEach(([key, value]) => { books[key] = cleanEvalBook(value); });
    return { books, settings: parsed.settings || null, locks: parsed.locks || {} };
  } catch { return { books: {}, settings: null, locks: {} }; }
}

function writeEval2Local(store) {
  try { localStorage.setItem(EVAL2_LOCAL_KEY, JSON.stringify({ books: store.books, settings: store.settings, locks: store.locks, saved_local_at: new Date().toISOString() })); } catch { /* ignore */ }
}

async function writeEvalRow(employeeId, period, body, rowId) {
  const clean = { ...body };
  delete clean.row_id;
  delete clean.pending;
  const payload = { employee_id: employeeId, day_of_week: 0, period, class_room: TEACHER_EVAL_ROOM, start_time: "00:00:00", end_time: null, subject: JSON.stringify(clean) };
  const result = rowId
    ? await supabase.from("teaching_schedule").update(payload).eq("id", rowId).select("id").single()
    : await supabase.from("teaching_schedule").insert(payload).select("id").single();
  if (result.error) throw new Error(result.error.message);
  return result.data.id;
}

async function loadEval2Store(currentUser) {
  const local = readEval2Local();
  await loadWorkHourOverrides();
  let workStart = "08:00";
  try {
    const { data } = await supabase.from("settings").select("work_start").eq("id", 1).single();
    if (data?.work_start) workStart = String(data.work_start).slice(0, 5);
  } catch { /* ใช้ 08:00 */ }
  const books = {};
  const locks = {};
  let remoteSettings = null;
  let loadError = "";
  try {
    const { data, error } = await supabase.from("teaching_schedule").select("id, employee_id, period, subject").eq("class_room", TEACHER_EVAL_ROOM);
    if (error) throw new Error(error.message);
    (data || []).forEach(row => {
      let parsed = {};
      try { parsed = JSON.parse(row.subject || "{}"); } catch { return; }
      if (parsed.kind === "deduct_settings") {
        const settings = cleanEval2Settings({ ...parsed, row_id: row.id }, workStart);
        if (!remoteSettings || settings.updated_at > remoteSettings.updated_at) remoteSettings = settings;
      } else if (parsed.kind === "deduct_lock") {
        locks[parsed.sem] = { ...parsed, row_id: row.id };
      } else if (parsed.kind === "deduct") {
        const book = cleanEvalBook({ ...parsed, row_id: row.id });
        const key = `${book.sem}:${book.teacher_id}`;
        books[key] = mergeEvalBooks(books[key], book);
      }
    });
  } catch (err) {
    loadError = err.message || "เชื่อมต่อไม่สำเร็จ";
  }
  const canWrite = isExecutiveUser(currentUser) && !loadError;
  for (const [key, book] of Object.entries(local.books)) {
    const merged = mergeEvalBooks(books[key], book);
    const remoteSame = books[key] && JSON.stringify(books[key].entries.map(e => e.id).sort()) === JSON.stringify(merged.entries.map(e => e.id).sort());
    books[key] = merged;
    if (canWrite && (book.pending || !remoteSame)) {
      try { books[key].row_id = await writeEvalRow(merged.teacher_id, merged.sem, merged, merged.row_id); books[key].pending = false; } catch { books[key].pending = true; }
    }
  }
  Object.entries(local.locks || {}).forEach(([sem, lock]) => { if (!locks[sem]) locks[sem] = lock; });
  let settings = remoteSettings || cleanEval2Settings(null, workStart);
  if (local.settings && (!remoteSettings || String(local.settings.updated_at) > remoteSettings.updated_at)) {
    settings = cleanEval2Settings({ ...local.settings, row_id: remoteSettings?.row_id || local.settings.row_id }, workStart);
    if (local.settings.pending && canWrite) {
      try { settings.row_id = await writeEvalRow(currentUser.id, EVAL2_SETTINGS_PERIOD, settings, settings.row_id); settings.pending = false; } catch { /* ignore */ }
    }
  }
  const store = { books, settings, locks, loadError, systemWorkStart: workStart };
  writeEval2Local(store);
  return store;
}

function loadEval2Sources(range) {
  return cached(`eval2-sources:${range?.start}:${range?.end}`, 300000, () => loadEval2SourcesRaw(range));
}

async function loadEval2SourcesRaw(range) {
  const errors = [];
  const safe = async (label, fn) => { try { return await fn(); } catch (err) { errors.push(`${label}: ${err.message || "โหลดไม่สำเร็จ"}`); return []; } };
  const firstWeek = weekPeriodKey(mondayOf(range.start));
  const lastWeek = weekPeriodKey(mondayOf(range.end));
  const [attendance, leaves, plans, rolls] = await Promise.all([
    safe("ลงเวลา", async () => {
      const { data, error } = await supabase.from("attendance").select("employee_id, check_in, work_activity, training_start_date, training_end_date").gte("check_in", `${shiftDateKey(range.start, -60)}T00:00:00+07:00`).lte("check_in", `${range.end}T23:59:59+07:00`).limit(20000);
      if (error) throw new Error(error.message);
      return data || [];
    }),
    safe("การลา", async () => {
      const { data, error } = await supabase.from("leaves").select("employee_id, start_date, end_date, status, duration_type").eq("status", "approved").lte("start_date", range.end);
      if (error) throw new Error(error.message);
      return data || [];
    }),
    safe("แผนรายสัปดาห์", async () => {
      const { data, error } = await supabase.from("teaching_schedule").select("id, employee_id, period, start_time, subject, created_at").eq("class_room", SUPERVISION_SCHEDULE_ROOM).eq("day_of_week", 0).gte("period", firstWeek).lte("period", lastWeek);
      if (error) throw new Error(error.message);
      return data || [];
    }),
    safe("เช็คชื่อนักเรียน", async () => dedupeRollRows(await fetchRollRows(null))),
  ]);
  return { attendance, leaves, plans, rolls, errors };
}

function computeAutoEntries(teacherId, sources, range, settings) {
  const id = String(teacherId);
  const today = todayISO();
  const lastDay = shiftDateKey(today, -1) < range.end ? shiftDateKey(today, -1) : range.end;
  if (lastDay < range.start) return []; // ยังไม่เริ่มเทอม
  const rules = settings.rules;
  const entries = [];
  const add = (key, date, reason) => {
    if (!rules[key]?.on || !(rules[key].points > 0)) return;
    entries.push({ id: `auto-${key}-${date}-${entries.length}`, auto: true, date, type: "deduct", points: rules[key].points, category: key, reason });
  };
  const workDays = schoolDaysBetween(range.start, lastDay, settings.holidays);
  // ลงเวลา: แถวแรกของวัน
  const firstCheckIn = new Map();
  const presentDays = new Set();
  sources.attendance.filter(row => String(row.employee_id) === id).forEach(row => {
    getAttendanceWorkDateKeys(row).forEach(key => presentDays.add(key));
    if (!row.check_in || row.work_activity === "training") return;
    const key = getDateKey(row.check_in);
    if (!firstCheckIn.has(key) || row.check_in < firstCheckIn.get(key)) firstCheckIn.set(key, row.check_in);
  });
  const leaveDays = new Set();
  sources.leaves.filter(row => String(row.employee_id) === id).forEach(row => {
    let cursor = row.start_date;
    const end = row.end_date && row.end_date >= row.start_date ? row.end_date : row.start_date;
    let guard = 0;
    while (cursor && cursor <= end && guard < 200) { leaveDays.add(cursor); cursor = shiftDateKey(cursor, 1); guard += 1; }
  });
  workDays.forEach(date => {
    const checkIn = firstCheckIn.get(date);
    if (checkIn) {
      const startAt = wsOf(id, settings.work_start);
      const late = checkLate(checkIn, startAt);
      if (late?.late) add("late_checkin", date, `เข้า ${fmtTime(checkIn)} เกินเวลา ${startAt} ไป ${late.minutes} นาที`);
    } else if (!presentDays.has(date) && !leaveDays.has(date)) {
      add("no_checkin", date, "ไม่ลงเวลาเข้า (ไม่มีวันลาที่อนุมัติ)");
    }
  });
  // แผนรายสัปดาห์ (ครบกำหนดวันอาทิตย์ก่อนสัปดาห์สอน 08:00; นับเฉพาะสัปดาห์ที่เลยกำหนดแล้ว)
  const nowStamp = bangkokDateTimeKey(new Date().toISOString());
  const latest = new Map();
  sources.plans.filter(row => String(row.employee_id) === id).forEach(row => {
    const current = latest.get(row.period);
    if (!current || String(row.created_at || "") > String(current.created_at || "")) latest.set(row.period, row);
  });
  const taught = [];
  for (let monday = mondayOf(range.start); monday <= range.end && supervisionDeadlineStamp(monday) < nowStamp; monday = shiftDateKey(monday, 7)) {
    const row = latest.get(weekPeriodKey(monday));
    const plan = row ? parseSupervisionPlan(row.subject, monday) : null;
    const status = row ? supervisionStatusFromStartTime(row.start_time) : "missing";
    const sent = status === "submitted" || status === "late" || plan?.status === "submitted";
    const late = status === "late" || (plan?.status === "submitted" && plan?.late);
    if (!sent) add("plan_missing", monday, `ไม่ส่งแผนสัปดาห์ ${formatThaiDateKey(monday)} – ${formatThaiDateKey(shiftDateKey(monday, 4))}`);
    else if (late) add("plan_late", monday, `ส่งแผนสัปดาห์ ${formatThaiDateKey(monday)} – ${formatThaiDateKey(shiftDateKey(monday, 4))} สาย${plan?.submitted_at ? ` (ส่ง ${fmtDate(plan.submitted_at)} ${fmtTime(plan.submitted_at)})` : ""}`);
    (plan?.periods || []).forEach(period => {
      if (!period.free && periodHasDetail(period) && period.teach_date >= range.start && period.teach_date <= lastDay) taught.push(period);
    });
  }
  taught.forEach(period => {
    if (!postNoteHasData(period.post_note)) add("post_missing", period.teach_date, `ไม่มีบันทึกหลังสอน วันที่ ${formatThaiDateKey(period.teach_date)} คาบที่ ${period.period_no}${period.subject ? ` (${period.subject})` : ""}`);
  });
  // เช็คชื่อนักเรียน: เฉพาะครูที่มีรายชื่อนักเรียน
  const rollRow = sources.rolls.find(row => String(row.employee_id) === id);
  const book = rollRow ? parseRollBook(rollRow.subject) : null;
  if (book && book.students.length) {
    workDays.forEach(date => {
      if (leaveDays.has(date)) return;
      if (!book.days[date]?.saved_at) add("roll_missing", date, "ไม่ได้บันทึกเช็คชื่อนักเรียน");
    });
  }
  return entries;
}

// คะแนนประเมินของครูคนที่ลงเวลา (เฉพาะของตัวเอง) แสดงหลังลงเวลาสำเร็จ — โหลดไม่ได้ก็ซ่อนไป ไม่กระทบการลงเวลา
function MyEvalScoreCard({ currentUser }) {
  const [data, setData] = useState(null);
  useEffect(() => {
    let active = true;
    const empId = currentUser?.id;
    if (!empId) return undefined;
    (async () => {
      const store = await loadEval2Store(currentUser);
      const sem = currentSemester();
      const range = semesterRange(sem, store.settings);
      const semKey = semesterKey(sem);
      const frozen = store.locks?.[semKey]?.teachers?.[empId];
      let entries;
      if (frozen) entries = frozen.entries;
      else {
        const sources = await loadEval2Sources(range);
        const manual = (store.books?.[`${semKey}:${empId}`]?.entries || []).filter(entry => entry.date >= range.start && entry.date <= range.end);
        entries = [...computeAutoEntries(empId, sources, range, store.settings), ...manual];
      }
      const month = todayISO().slice(0, 7);
      const groups = new Map();
      entries.filter(entry => String(entry.date || "").startsWith(month)).forEach(entry => {
        const key = `${entry.type}|${evalEntryLabel(entry)}`;
        const cur = groups.get(key) || { type: entry.type, label: evalEntryLabel(entry), count: 0, points: 0 };
        cur.count += 1; cur.points += Number(entry.points) || 0; groups.set(key, cur);
      });
      if (active) setData({ ...evalSummary(entries), sem, month: [...groups.values()].sort((a, b) => b.points - a.points) });
    })().catch(() => { if (active) setData({ failed: true }); });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.id]);
  if (!data || data.failed) return data ? null : <div style={{ fontSize: "0.75rem", color: "#94a3b8", textAlign: "center", marginBottom: "0.75rem" }}>กำลังโหลดคะแนนของคุณ...</div>;
  const level = evalLevel(data.score);
  const msg = data.score >= 95 ? "ยอดเยี่ยมมาก รักษามาตรฐานนี้ไว้นะคะ 🌟" : data.score >= 85 ? "ดีมากค่ะ อีกนิดเดียวก็เต็มแล้ว 💪" : data.score >= 70 ? "สู้ๆ ค่ะ มาตรงเวลาและแจ้งก่อนออกนอกบริเวณ คะแนนจะกลับมาเร็ว 🙂" : "เริ่มใหม่ได้ทุกวัน ค่อยๆ เก็บคะแนนคืนนะคะ ❤️";
  const r = n => Math.round(n * 10) / 10;
  return (
    <div style={{ border: "1.5px solid #B8E0FF", background: "#F5FAFF", borderRadius: 12, padding: "0.7rem 0.8rem", marginBottom: "0.75rem", fontSize: "0.82rem" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.5rem" }}>
        <div><div style={{ fontWeight: 800, color: "#233862" }}>คะแนนประเมินของฉัน</div><div style={{ fontSize: "0.7rem", color: "#64748b" }}>ภาคเรียน {data.sem.term}/{data.sem.year} · เต็ม 100</div></div>
        <div style={{ textAlign: "right" }}><div style={{ fontSize: "1.6rem", fontWeight: 900, color: level.color, lineHeight: 1 }}>{data.score}</div><div style={{ fontSize: "0.7rem", fontWeight: 700, color: level.color }}>{level.label}</div></div>
      </div>
      <div style={{ marginTop: "0.4rem", fontSize: "0.72rem", color: "#64748b" }}>ทั้งเทอม: หัก −{data.deduct} · เพิ่ม +{data.bonus}</div>
      <div style={{ marginTop: "0.35rem", fontWeight: 700, color: "#334155", fontSize: "0.75rem" }}>เดือนนี้</div>
      {data.month.length === 0 ? <div style={{ color: "#15803d", fontSize: "0.75rem" }}>ยังไม่มีรายการหัก/เพิ่มคะแนน 👍</div> : data.month.slice(0, 5).map(g => (
        <div key={g.type + g.label} style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem", fontSize: "0.75rem" }}>
          <span style={{ color: "#475569" }}>{g.label}{g.count > 1 ? ` ×${g.count}` : ""}</span>
          <b style={{ color: g.type === "add" ? "#15803d" : "#dc2626" }}>{g.type === "add" ? "+" : "−"}{r(g.points)}</b>
        </div>
      ))}
      <div style={{ marginTop: "0.4rem", fontSize: "0.75rem", color: "#0072D9", fontWeight: 600 }}>{msg}</div>
    </div>
  );
}

function evalSummary(entries) {
  const deduct = entries.filter(entry => entry.type === "deduct").reduce((sum, entry) => sum + entry.points, 0);
  const bonus = entries.filter(entry => entry.type === "add").reduce((sum, entry) => sum + entry.points, 0);
  const score = Math.max(0, Math.min(100, 100 - deduct + bonus));
  return { deduct: Math.round(deduct * 10) / 10, bonus: Math.round(bonus * 10) / 10, score: Math.round(score * 10) / 10 };
}

function evalEntryLabel(entry) {
  if (entry.auto) return EVAL_AUTO_RULES.find(rule => rule.key === entry.category)?.label || "อัตโนมัติ";
  return EVAL_CATEGORIES.find(item => item.key === entry.category)?.label || "อื่นๆ";
}

function EvalScoreChart({ entries, range }) {
  const width = 320;
  const height = 90;
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
  const start = new Date(`${range.start}T00:00:00`).getTime();
  const endKey = range.end < todayISO() ? range.end : todayISO();
  const end = Math.max(start + 86400000, new Date(`${endKey}T00:00:00`).getTime());
  const x = date => 4 + ((new Date(`${date}T00:00:00`).getTime() - start) / (end - start)) * (width - 8);
  const y = score => 6 + (1 - score / 100) * (height - 12);
  let score = 100;
  const points = [[x(range.start), y(100)]];
  sorted.forEach(entry => {
    score = Math.max(0, Math.min(100, score + (entry.type === "add" ? entry.points : -entry.points)));
    points.push([x(entry.date), y(score)]);
  });
  points.push([x(endKey), y(score)]);
  const path = points.map(([px, py], index) => `${index ? "L" : "M"}${Math.max(0, Math.min(width, px)).toFixed(1)},${py.toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${width} ${height}`} style={{ width: "100%", maxWidth: 480, height: "auto", background: "#f8fafc", borderRadius: 8 }} role="img" aria-label="กราฟคะแนนตลอดภาคเรียน">
      {[90, 80, 70, 60].map(line => <line key={line} x1={0} x2={width} y1={y(line)} y2={y(line)} stroke="#e2e8f0" strokeDasharray="3 3" />)}
      {[100, 60].map(line => <text key={line} x={width - 2} y={y(line) - 2} fontSize="8" textAnchor="end" fill="#94a3b8">{line}</text>)}
      <path d={path} fill="none" stroke={evalLevel(score).color} strokeWidth="2" />
    </svg>
  );
}

function SemesterPicker({ sem, onChange, range }) {
  const now = currentSemester();
  const years = [now.year + 1, now.year, now.year - 1, now.year - 2];
  const small = { ...inputStyle, padding: "0.35rem 0.5rem", fontSize: "0.85rem", width: "auto" };
  return (
    <div style={{ display: "flex", gap: "0.35rem", alignItems: "center", flexWrap: "wrap" }}>
      <select aria-label="ภาคเรียน" value={sem.term} onChange={event => onChange({ ...sem, term: Number(event.target.value) })} style={small}>
        <option value={1}>ภาคเรียน 1</option>
        <option value={2}>ภาคเรียน 2</option>
      </select>
      <select aria-label="ปีการศึกษา" value={sem.year} onChange={event => onChange({ ...sem, year: Number(event.target.value) })} style={small}>
        {years.map(year => <option key={year} value={year}>ปีการศึกษา {year}</option>)}
      </select>
      <span style={{ fontSize: "0.78rem", color: "#64748b" }}>{formatThaiDateKey(range.start)} – {formatThaiDateKey(range.end)}</span>
      {todayISO() < range.start && <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "#0072D9", background: "#EAF5FF", border: "1px solid #B8E0FF", borderRadius: 999, padding: "0.15rem 0.6rem" }}>ยังไม่เริ่มเทอม · ทุกคน 100 คะแนน</span>}
    </div>
  );
}

function TeacherEvalPage({ employees, currentUser, initialSelected = "" }) {
  if (!isExecutiveUser(currentUser)) return <NoAccessCard />;
  return <TeacherDeductPage key={initialSelected || "list"} employees={employees} currentUser={currentUser} initialSelected={initialSelected} />;
}

function TeacherDeductPage({ employees, currentUser, initialSelected = "" }) {
  const [sem, setSem] = useState(currentSemester);
  const [store, setStore] = useState(null);
  const [sources, setSources] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [selected, setSelected] = useState(initialSelected ? String(initialSelected) : "");
  const [sort, setSort] = useState({ key: "score", dir: 1 });
  const [showSettings, setShowSettings] = useState(false);
  const [form, setForm] = useState(() => ({ date: todayISO(), category: "dress", type: "deduct", points: 1, reason: "" }));
  const settings = store?.settings || cleanEval2Settings(null, "08:00");
  const range = semesterRange(sem, settings);
  const semKey = semesterKey(sem);
  const lock = store?.locks?.[semKey] || null;

  useEffect(() => {
    let active = true;
    loadEval2Store(currentUser).then(result => {
      if (!active) return;
      setStore(result);
      if (result.loadError) setError(`โหลดคะแนนจากฐานข้อมูลไม่ได้ (${result.loadError}) ใช้ข้อมูลในเครื่องนี้`);
    });
    return () => { active = false; };
  }, [currentUser]);

  useEffect(() => {
    if (!store) return undefined;
    let active = true;
    setLoading(true);
    loadEval2Sources(range).then(result => {
      if (!active) return;
      setSources(result);
      if (result.errors.length) setError(`โหลดบางส่วนไม่ได้: ${result.errors.join(" · ")}`);
      setLoading(false);
    });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store === null, range.start, range.end]);

  const updateStore = patch => {
    const next = { ...store, ...patch };
    setStore(next);
    writeEval2Local(next);
    return next;
  };

  const teachers = (employees || []).filter(emp => !isExecutiveUser(emp));
  const rows = (sources ? teachers : []).map(emp => {
    const key = `${semKey}:${emp.id}`;
    const frozen = lock?.teachers?.[emp.id];
    const manual = (store?.books?.[key]?.entries || []).filter(entry => entry.date >= range.start && entry.date <= range.end);
    const entries = frozen ? frozen.entries : [...computeAutoEntries(emp.id, sources, range, settings), ...manual];
    const summary = evalSummary(entries);
    return { emp, entries, ...summary, name: emp.name || "" };
  });

  const saveBook = async (teacherId, mutate, success) => {
    const key = `${semKey}:${teacherId}`;
    const current = store.books[key] || cleanEvalBook({ teacher_id: teacherId, sem: semKey });
    const next = cleanEvalBook({ ...mutate(current), teacher_id: teacherId, sem: semKey, updated_at: new Date().toISOString(), row_id: current.row_id });
    try {
      next.row_id = await writeEvalRow(teacherId, semKey, next, next.row_id);
      next.pending = false;
      setMessage(success);
      setError("");
    } catch (err) {
      next.pending = true;
      setError(`${err.message || "บันทึกไม่สำเร็จ"} · เก็บไว้ในเครื่องนี้แล้ว จะซิงก์เมื่อเปิดหน้านี้ครั้งถัดไป`);
    }
    updateStore({ books: { ...store.books, [key]: next } });
  };

  const addEntry = () => {
    if (lock) return;
    if (form.category === "other" && !form.reason.trim()) { setError("หมวด อื่นๆ ต้องกรอกเหตุผล"); return; }
    if (form.date < range.start || form.date > range.end) { setError("วันที่ต้องอยู่ในภาคเรียนที่เลือก"); return; }
    const allowed = evalPointOptions(form.category);
    if (!allowed.includes(Number(form.points))) { setError(`หมวดนี้เลือกได้ ${allowed.join(", ")} คะแนน`); return; }
    const entry = cleanEvalEntry({ ...form, id: newSupervisionId(), by: currentUser.name, at: new Date().toISOString() });
    saveBook(selected, book => ({ ...book, entries: [...book.entries, entry] }), `${entry.type === "add" ? "เพิ่ม" : "หัก"} ${entry.points} คะแนนแล้ว`);
    setForm(current => ({ ...current, reason: "" }));
  };

  const deleteEntry = entry => {
    if (lock || !window.confirm(`ลบรายการ "${evalEntryLabel(entry)}" ${entry.points} คะแนน?`)) return;
    saveBook(selected, book => ({ ...book, entries: book.entries.filter(item => item.id !== entry.id), deleted: [...book.deleted, entry.id] }), "ลบรายการแล้ว");
  };

  const saveSettings = async patch => {
    const next = cleanEval2Settings({ ...settings, ...patch, updated_at: new Date().toISOString() }, store.systemWorkStart);
    try {
      next.row_id = await writeEvalRow(currentUser.id, EVAL2_SETTINGS_PERIOD, next, settings.row_id);
      next.pending = false;
      setMessage("บันทึกการตั้งค่าแล้ว");
    } catch (err) {
      next.pending = true;
      setError(`${err.message || "บันทึกไม่สำเร็จ"} · เก็บไว้ในเครื่องนี้แล้ว`);
    }
    updateStore({ settings: next });
  };

  const toggleLock = async () => {
    if (lock) {
      if (!window.confirm("ปลดล็อกคะแนนภาคเรียนนี้? คะแนนจะคำนวณใหม่จากข้อมูลปัจจุบัน")) return;
      try { if (lock.row_id) await supabase.from("teaching_schedule").delete().eq("id", lock.row_id); } catch { /* ignore */ }
      const locks = { ...store.locks };
      delete locks[semKey];
      updateStore({ locks });
      setMessage("ปลดล็อกแล้ว");
      return;
    }
    if (!window.confirm(`ล็อกคะแนนภาคเรียน ${sem.term}/${sem.year}? คะแนนทุกคนจะถูกตรึงไว้ เพิ่ม/ลบรายการไม่ได้จนกว่าจะปลดล็อก`)) return;
    const teachersSnap = {};
    rows.forEach(row => { teachersSnap[row.emp.id] = { entries: row.entries, score: row.score, deduct: row.deduct, bonus: row.bonus }; });
    const next = { kind: "deduct_lock", sem: semKey, at: new Date().toISOString(), by: currentUser.name, teachers: teachersSnap };
    try {
      next.row_id = await writeEvalRow(currentUser.id, semKey, next, null);
      setMessage("ล็อกคะแนนแล้ว");
    } catch (err) {
      setError(`${err.message || "ล็อกไม่สำเร็จ"} · ล็อกไว้ในเครื่องนี้เท่านั้น`);
    }
    updateStore({ locks: { ...store.locks, [semKey]: next } });
  };

  const sorted = [...rows].sort((a, b) => {
    const left = a[sort.key];
    const right = b[sort.key];
    return (typeof left === "string" ? left.localeCompare(right, "th") : left - right) * sort.dir;
  });

  const exportExcel = () => {
    const summary = sorted.map((row, index) => ({ "ลำดับ": index + 1, "ชื่อ": row.name, "หัก": row.deduct, "เพิ่ม": row.bonus, "คงเหลือ (100)": row.score, "ระดับ": evalLevel(row.score).label }));
    const all = [];
    sorted.forEach(row => [...row.entries].sort((a, b) => a.date.localeCompare(b.date)).forEach(entry => all.push({
      "ชื่อ": row.name, "วันที่": entry.date, "ประเภท": entry.auto ? "อัตโนมัติ" : "บันทึกโดยผู้บริหาร", "หมวด": evalEntryLabel(entry),
      "หัก/เพิ่ม": entry.type === "add" ? "เพิ่ม" : "หัก", "คะแนน": entry.type === "add" ? entry.points : -entry.points, "เหตุผล": entry.reason, "ผู้บันทึก": entry.by || "", "เวลาบันทึก": entry.at ? `${fmtDate(entry.at)} ${fmtTime(entry.at)}` : "",
    })));
    const workbook = xlsxUtils.book_new();
    xlsxUtils.book_append_sheet(workbook, xlsxUtils.json_to_sheet(summary), "สรุป");
    xlsxUtils.book_append_sheet(workbook, xlsxUtils.json_to_sheet(all.length ? all : [{ "ชื่อ": "ไม่มีรายการ" }]), "รายการทั้งหมด");
    writeWorkbookFile(workbook, `ประเมินครู_ภาค${sem.term}_${sem.year}${lock ? "_ล็อก" : ""}.xlsx`);
  };

  const head = (key, label, align = "center") => (
    <th onClick={() => setSort(current => ({ key, dir: current.key === key ? -current.dir : (key === "name" ? 1 : key === "deduct" ? -1 : 1) }))} style={{ padding: "0.3rem 0.45rem", fontSize: "0.75rem", fontWeight: 800, color: "#475569", textAlign: align, whiteSpace: "nowrap", cursor: "pointer", borderBottom: "1px solid #e2e8f0" }}>
      {label}{sort.key === key ? (sort.dir > 0 ? " ▲" : " ▼") : ""}
    </th>
  );
  const small = { ...inputStyle, padding: "0.35rem 0.5rem", fontSize: "0.85rem" };
  const header = (
    <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
      <div style={{ fontWeight: 800, fontSize: "1.15rem", color: "#233862", flex: "1 1 160px" }}>ประเมินครู <span style={{ fontSize: "0.75rem", color: "#64748b", fontWeight: 600 }}>เริ่ม 100 คะแนน/ภาคเรียน</span></div>
      <SemesterPicker sem={sem} onChange={next => { setSem(next); setSelected(""); }} range={range} />
    </div>
  );
  const banner = (
    <>
      {lock && <div style={{ background: "#f1f5f9", border: "1px solid #cbd5e1", borderRadius: 10, padding: "0.45rem 0.75rem", fontSize: "0.82rem", fontWeight: 700, color: "#334155" }}>🔒 ล็อกคะแนนแล้วโดย {lock.by || "-"} · {lock.at ? `${fmtDate(lock.at)} ${fmtTime(lock.at)}` : ""}</div>}
      {error && <ErrorBox>{error}</ErrorBox>}
      {message && <div style={{ background: "#ecfdf5", border: "1px solid #bbf7d0", borderRadius: 10, padding: "0.5rem 0.8rem", color: "#166534", fontWeight: 700, fontSize: "0.85rem" }}>{message}</div>}
    </>
  );

  if (!store || loading || !sources) return <div style={{ display: "grid", gap: "0.75rem", maxWidth: 960 }}>{header}<Card><div style={{ color: "#64748b" }}>กำลังคำนวณคะแนน...</div></Card></div>;

  if (selected) {
    const row = rows.find(item => String(item.emp.id) === String(selected));
    if (!row) return null;
    const level = evalLevel(row.score);
    const timeline = [...row.entries].sort((a, b) => b.date.localeCompare(a.date) || String(b.at || "").localeCompare(String(a.at || "")));
    const pickCategory = key => {
      const category = EVAL_CATEGORIES.find(item => item.key === key);
      setForm(current => ({ ...current, category: key, type: category.type, points: category.points }));
    };
    return (
      <div style={{ display: "grid", gap: "0.75rem", maxWidth: 820 }}>
        {header}
        {banner}
        <button type="button" onClick={() => { setSelected(""); setMessage(""); setError(""); }} style={{ ...btnSecondary, flex: "none", width: "fit-content", padding: "0.35rem 0.7rem", fontSize: "0.82rem" }}><ChevronLeft size={14} /> กลับไปตาราง</button>
        <Card padding="0.8rem">
          <div style={{ display: "flex", gap: "1rem", alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ textAlign: "center", minWidth: 110 }}>
              <div style={{ fontSize: "2.6rem", fontWeight: 900, color: level.color, lineHeight: 1 }}>{row.score.toFixed(1)}</div>
              <div style={{ fontSize: "0.75rem", color: "#64748b" }}>/ 100</div>
              <div style={{ marginTop: "0.25rem" }}><EvalLevelBadge score={row.score} /></div>
            </div>
            <div style={{ flex: "1 1 240px", display: "grid", gap: "0.3rem" }}>
              <div style={{ fontWeight: 800, fontSize: "1.05rem" }}>{row.name}</div>
              <div style={{ fontSize: "0.82rem", color: "#475569" }}>หัก <strong style={{ color: "#dc2626" }}>-{row.deduct}</strong> · เพิ่ม <strong style={{ color: "#16a34a" }}>+{row.bonus}</strong> · {row.entries.length} รายการ</div>
              <EvalScoreChart entries={row.entries} range={range} />
            </div>
          </div>
        </Card>
        <EvalExplain entries={row.entries} deduct={row.deduct} bonus={row.bonus} score={row.score} />
        {!lock && (
          <Card padding="0.75rem">
            <div style={{ fontWeight: 800, fontSize: "0.9rem", marginBottom: "0.5rem" }}>บันทึกหัก/เพิ่มคะแนน</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 150px), 1fr))", gap: "0.45rem", alignItems: "center" }}>
              <input type="date" aria-label="วันที่" value={form.date} min={range.start} max={range.end} onChange={event => setForm(current => ({ ...current, date: event.target.value }))} style={small} />
              <select aria-label="หมวด" value={form.category} onChange={event => pickCategory(event.target.value)} style={small}>
                {EVAL_CATEGORIES.filter(item => !item.legacy).map(item => <option key={item.key} value={item.key}>{item.label}{item.type === "add" ? " (เพิ่ม)" : ""}</option>)}
              </select>
              <div style={{ display: "flex", gap: "0.25rem" }}>
                {[["deduct", "หัก", "#dc2626", "#fee2e2"], ["add", "เพิ่ม", "#16a34a", "#dcfce7"]].map(([value, label, color, bg]) => (
                  <button key={value} type="button" aria-pressed={form.type === value} onClick={() => setForm(current => ({ ...current, type: value }))} style={{ flex: 1, padding: "0.35rem", borderRadius: 8, border: `1px solid ${form.type === value ? color : "#e2e8f0"}`, background: form.type === value ? bg : "#fff", color: form.type === value ? color : "#64748b", fontWeight: 800, fontFamily: "inherit", cursor: "pointer" }}>{label}</button>
                ))}
              </div>
              <select aria-label="คะแนน" value={form.points} onChange={event => setForm(current => ({ ...current, points: Number(event.target.value) }))} style={small}>
                {evalPointOptions(form.category).map(value => <option key={value} value={value}>{value} คะแนน</option>)}
              </select>
            </div>
            <div style={{ display: "flex", gap: "0.45rem", marginTop: "0.45rem" }}>
              <input value={form.reason} placeholder={form.category === "other" ? "เหตุผล (จำเป็น)" : (EVAL_CATEGORIES.find(item => item.key === form.category)?.desc || "เหตุผล/รายละเอียด")} onChange={event => setForm(current => ({ ...current, reason: event.target.value }))} style={{ ...small, flex: 1 }} />
              <button type="button" onClick={addEntry} style={{ ...btnPrimary, flex: "none", padding: "0.4rem 0.9rem", background: form.type === "add" ? "linear-gradient(135deg, #16a34a, #15803d)" : "linear-gradient(135deg, #dc2626, #b91c1c)", color: "#fff", cursor: "pointer" }}><Plus size={15} /> {form.type === "add" ? `+${form.points}` : `-${form.points}`}</button>
            </div>
          </Card>
        )}
        <Card padding="0.75rem">
          <div style={{ fontWeight: 800, fontSize: "0.9rem", marginBottom: "0.4rem" }}>ไทม์ไลน์ ({timeline.length})</div>
          {timeline.length === 0 ? <div style={{ color: "#94a3b8", fontSize: "0.85rem" }}>ยังไม่มีรายการ คะแนนเต็ม 100</div> : (
            <div style={{ display: "grid" }}>
              {timeline.map(entry => (
                <div key={entry.id} style={{ display: "grid", gridTemplateColumns: "4.6rem minmax(0,1fr) auto", gap: "0.45rem", alignItems: "start", padding: "0.3rem 0", borderTop: "1px solid #f1f5f9", fontSize: "0.8rem" }}>
                  <span style={{ color: "#64748b", whiteSpace: "nowrap" }}>{formatThaiDateKey(entry.date)}</span>
                  <div style={{ minWidth: 0 }}>
                    <span style={{ fontWeight: 800, color: "#233862" }}>{evalEntryLabel(entry)}</span>
                    {entry.auto ? <span style={{ marginLeft: "0.3rem", background: "#e0e7ff", color: "#4338ca", fontSize: "0.65rem", fontWeight: 800, borderRadius: 10, padding: "0.05rem 0.4rem" }}>อัตโนมัติ</span> : <span style={{ marginLeft: "0.3rem", color: "#94a3b8", fontSize: "0.7rem" }}>โดย {entry.by || "-"}{entry.at ? ` · ${fmtDate(entry.at)} ${fmtTime(entry.at)}` : ""}</span>}
                    {entry.reason && <div style={{ color: "#475569", wordBreak: "break-word" }}>{entry.reason}</div>}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
                    <span style={{ fontWeight: 900, color: entry.type === "add" ? "#16a34a" : "#dc2626", whiteSpace: "nowrap" }}>{entry.type === "add" ? "+" : "-"}{entry.points}</span>
                    {!entry.auto && !lock && <button type="button" aria-label="ลบรายการ" onClick={() => deleteEntry(entry)} style={{ width: 22, height: 22, border: "none", borderRadius: "50%", background: "#fee2e2", color: "#b91c1c", display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0 }}><X size={12} /></button>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    );
  }

  const distribution = EVAL_LEVELS.map(level => ({ ...level, count: rows.filter(row => evalLevel(row.score).label === level.label).length }));
  return (
    <div style={{ display: "grid", gap: "0.75rem", maxWidth: 960 }}>
      {header}
      {banner}
      <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap", alignItems: "center" }}>
        {distribution.map(level => <span key={level.label} style={{ background: level.bg, color: level.color, fontWeight: 800, fontSize: "0.75rem", borderRadius: 20, padding: "0.15rem 0.6rem" }}>{level.label} {level.count}</span>)}
        <span style={{ flex: 1 }} />
        <button type="button" onClick={() => setShowSettings(value => !value)} style={{ ...btnSecondary, flex: "none", padding: "0.3rem 0.6rem", fontSize: "0.8rem" }}><Settings size={14} /> ตั้งค่า</button>
        <button type="button" onClick={exportExcel} style={{ ...btnSecondary, flex: "none", padding: "0.3rem 0.6rem", fontSize: "0.8rem" }}><FileText size={14} /> Excel</button>
        <button type="button" onClick={toggleLock} style={{ ...btnSecondary, flex: "none", padding: "0.3rem 0.6rem", fontSize: "0.8rem", color: lock ? "#b45309" : "#334155" }}><Lock size={14} /> {lock ? "ปลดล็อก" : "ล็อกคะแนน"}</button>
      </div>
      {showSettings && (
        <Card padding="0.75rem">
          <div style={{ fontWeight: 800, fontSize: "0.88rem", marginBottom: "0.4rem" }}>หักอัตโนมัติ (คะแนนต่อครั้ง)</div>
          <div style={{ display: "grid", gap: "0.3rem" }}>
            {EVAL_AUTO_RULES.map(rule => (
              <div key={rule.key} style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.82rem" }}>
                <input type="checkbox" checked={settings.rules[rule.key].on} onChange={event => saveSettings({ rules: { ...settings.rules, [rule.key]: { ...settings.rules[rule.key], on: event.target.checked } } })} />
                <span style={{ flex: 1 }}>{rule.label}</span>
                <input type="number" step="0.5" min="0" key={`${rule.key}-${settings.updated_at}`} defaultValue={settings.rules[rule.key].points} onBlur={event => saveSettings({ rules: { ...settings.rules, [rule.key]: { ...settings.rules[rule.key], points: Number(event.target.value) } } })} style={{ ...small, width: 70 }} />
              </div>
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 160px), 1fr))", gap: "0.5rem", marginTop: "0.6rem", alignItems: "end" }}>
            <Field label={`เวลาเริ่มงาน (ระบบ ${store.systemWorkStart})`}><input type="time" key={`ws-${settings.updated_at}`} defaultValue={settings.work_start} onBlur={event => saveSettings({ work_start: event.target.value })} style={small} /></Field>
            <Field label="เริ่มภาคเรียน"><input type="date" key={`s${semKey}`} defaultValue={range.start} onBlur={event => saveSettings({ ranges: { ...settings.ranges, [semKey]: { ...range, start: event.target.value } } })} style={small} /></Field>
            <Field label="สิ้นสุดภาคเรียน"><input type="date" key={`e${semKey}`} defaultValue={range.end} onBlur={event => saveSettings({ ranges: { ...settings.ranges, [semKey]: { ...range, end: event.target.value } } })} style={small} /></Field>
          </div>
          <Field label="วันหยุด (ไม่นับขาด/ไม่เช็คชื่อ) ใส่ปี-เดือน-วัน คั่นด้วยเว้นวรรคหรือขึ้นบรรทัด">
            <textarea key={`h-${settings.updated_at}`} defaultValue={settings.holidays.join("\n")} onBlur={event => saveSettings({ holidays: event.target.value.split(/[\s,]+/).filter(Boolean) })} style={{ ...small, minHeight: 50 }} />
          </Field>
        </Card>
      )}
      <div style={{ overflowX: "auto", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10 }}>
        <table style={{ width: "100%", minWidth: 460, borderCollapse: "collapse", fontSize: "0.82rem" }}>
          <thead><tr style={{ background: "#f8fafc" }}>{head("name", "ชื่อ", "left")}{head("deduct", "หัก")}{head("bonus", "เพิ่ม")}{head("score", "คงเหลือ /100")}{head("score", "ระดับ")}</tr></thead>
          <tbody>
            {sorted.length === 0 && <tr><td colSpan={5} style={{ padding: "1rem", textAlign: "center", color: "#94a3b8" }}>ยังไม่มีครูในระบบ</td></tr>}
            {sorted.map(row => (
              <tr key={row.emp.id} onClick={() => { setSelected(String(row.emp.id)); setMessage(""); setError(""); }} style={{ borderTop: "1px solid #f1f5f9", cursor: "pointer" }}>
                <td style={{ padding: "0.3rem 0.45rem", fontWeight: 700, color: "#0072D9", whiteSpace: "nowrap" }}>{row.name}</td>
                <td style={{ padding: "0.3rem 0.45rem", textAlign: "center", color: row.deduct ? "#dc2626" : "#94a3b8" }}>{row.deduct ? `-${row.deduct}` : "0"}</td>
                <td style={{ padding: "0.3rem 0.45rem", textAlign: "center", color: row.bonus ? "#16a34a" : "#94a3b8" }}>{row.bonus ? `+${row.bonus}` : "0"}</td>
                <td style={{ padding: "0.3rem 0.45rem", textAlign: "center", fontWeight: 900, color: evalLevel(row.score).color }}>{row.score.toFixed(1)}</td>
                <td style={{ padding: "0.3rem 0.45rem", textAlign: "center" }}><EvalLevelBadge score={row.score} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ fontSize: "0.72rem", color: "#64748b" }}>หักอัตโนมัติคิดถึงเมื่อวาน (วันนี้ยังไม่นับ) · ลงเวลาจากตาราง attendance เทียบเวลาเริ่มงาน {settings.work_start} น. · วันลาที่อนุมัติไม่ถูกหัก</div>
    </div>
  );
}

// ─── หน้าผู้บริหาร (Executive dashboard) ─────────────────────────────────────
function evalExplainGroups(entries) {
  const groups = new Map();
  entries.forEach(entry => {
    const key = `${entry.auto ? "auto" : "manual"}:${entry.type}:${entry.category}`;
    if (!groups.has(key)) groups.set(key, { key, type: entry.type, auto: !!entry.auto, label: evalEntryLabel(entry), items: [] });
    groups.get(key).items.push(entry);
  });
  return [...groups.values()].map(group => {
    const items = [...group.items].sort((a, b) => a.date.localeCompare(b.date));
    const total = Math.round(items.reduce((sum, entry) => sum + entry.points, 0) * 10) / 10;
    const uniform = items.every(entry => entry.points === items[0].points);
    return { ...group, items, total, uniform, unit: items[0]?.points || 0 };
  }).sort((a, b) => b.total - a.total);
}

function EvalExplain({ entries, deduct, bonus, score }) {
  const [open, setOpen] = useState({});
  const groups = evalExplainGroups(entries);
  const section = (type, title, color, bg) => {
    const list = groups.filter(group => group.type === type);
    return (
      <div style={{ display: "grid", gap: "0.35rem" }}>
        <div style={{ fontWeight: 800, fontSize: "0.85rem", color }}>{title}</div>
        {list.length === 0 ? <div style={{ fontSize: "0.8rem", color: "#94a3b8" }}>ไม่มี</div> : list.map(group => {
          const isOpen = !!open[group.key];
          const sign = type === "add" ? "+" : "-";
          return (
            <div key={group.key} style={{ border: `1px solid ${bg}`, borderRadius: 12, overflow: "hidden" }}>
              <button type="button" aria-expanded={isOpen} onClick={() => setOpen(current => ({ ...current, [group.key]: !isOpen }))} style={{ width: "100%", display: "flex", gap: "0.5rem", alignItems: "center", padding: "0.5rem 0.7rem", background: bg, border: "none", cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>
                {isOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                <span style={{ flex: 1, fontWeight: 700, color: "#233862", fontSize: "0.85rem" }}>{group.label}{group.auto ? " (อัตโนมัติ)" : ""}</span>
                <span style={{ fontSize: "0.82rem", color: "#475569", whiteSpace: "nowrap" }}>{group.items.length} ครั้ง{group.uniform ? ` × ${group.unit}` : ""} = <strong style={{ color }}>{sign}{group.total}</strong></span>
              </button>
              {isOpen && (
                <div style={{ display: "grid", background: "#fff" }}>
                  {group.items.map(entry => (
                    <div key={entry.id} style={{ display: "grid", gridTemplateColumns: "6.5rem minmax(0,1fr) auto", gap: "0.45rem", padding: "0.35rem 0.7rem", borderTop: "1px solid #f1f5f9", fontSize: "0.8rem" }}>
                      <span style={{ color: "#64748b" }}>{formatThaiDateKey(entry.date)}</span>
                      <span style={{ color: "#334155", wordBreak: "break-word" }}>
                        {entry.reason || evalEntryLabel(entry)}
                        {!entry.auto && <span style={{ display: "block", color: "#94a3b8", fontSize: "0.72rem" }}>บันทึกโดย {entry.by || "-"}{entry.at ? ` · ${fmtDate(entry.at)} ${fmtTime(entry.at)}` : ""}</span>}
                      </span>
                      <span style={{ fontWeight: 800, color }}>{sign}{entry.points}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };
  return (
    <Card padding="0.8rem">
      <div style={{ fontWeight: 800, fontSize: "1rem", color: "#233862", marginBottom: "0.55rem" }}>ทำไมคะแนนเหลือ {score.toFixed(1)}</div>
      <div style={{ display: "grid", gap: "0.75rem" }}>
        {section("deduct", "รายการที่หักคะแนน", "#dc2626", "#fee2e2")}
        {section("add", "รายการที่เพิ่มคะแนน", "#16a34a", "#dcfce7")}
        <div style={{ background: "#EAF5FF", border: "1px solid #B8E0FF", borderRadius: 12, padding: "0.6rem 0.8rem", fontWeight: 800, color: "#233862", fontSize: "0.92rem" }}>
          100 - หัก <span style={{ color: "#dc2626" }}>{deduct}</span> + เพิ่ม <span style={{ color: "#16a34a" }}>{bonus}</span> = คงเหลือ <span style={{ color: "#0072D9" }}>{score.toFixed(1)}</span>
          {100 - deduct + bonus !== score && <span style={{ display: "block", fontSize: "0.75rem", color: "#64748b", fontWeight: 600 }}>คะแนนถูกจำกัดไว้ระหว่าง 0–100</span>}
        </div>
      </div>
    </Card>
  );
}

const EXEC_PLAN_STATUS = {
  submitted: { label: "ส่งแล้ว", color: "#166534", bg: "#dcfce7" },
  late: { label: "ส่งช้า", color: "#b45309", bg: "#fef3c7" },
  missing: { label: "ยังไม่ส่ง", color: "#b91c1c", bg: "#fee2e2" },
};

function ExecPill({ color, bg, children }) {
  return <span style={{ background: bg, color, fontWeight: 800, fontSize: "0.72rem", borderRadius: 20, padding: "0.12rem 0.55rem", whiteSpace: "nowrap" }}>{children}</span>;
}

function ExecSection({ title, icon: Icon, right, children }) {
  return (
    <Card padding="1rem">
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.7rem", flexWrap: "wrap" }}>
        {Icon && <span style={{ width: 30, height: 30, borderRadius: 10, background: "linear-gradient(135deg, #008CFF, #3EBFFB)", color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center" }}><Icon size={16} /></span>}
        <div style={{ fontWeight: 800, color: "#233862", fontSize: "1rem", flex: 1 }}>{title}</div>
        {right}
      </div>
      {children}
    </Card>
  );
}

// ─── ตารางสอนรายคาบ (หน้าผู้บริหาร) ─────────────────────────────────────────
const EXEC_SPECIAL_ROOMS = new Set([ROOM_BOOKING_ROOM, ROOM_BOOKING_ROOMS_ROOM, SUPERVISION_SCHEDULE_ROOM, STUDENT_ROLL_ROOM, ACADEMIC_RECORD_ROOM, ACTIVITY_PLAN_ROOM, "__TEACHER_EVAL__", "__CLEANING_DUTY__", "__LOGIN_SESSION__", "__WORK_HOURS__", KG_SHORT_PLAN_ROOM]);
const EXEC_DEFAULT_PERIOD_TIMES = [["08:30", "09:20"], ["09:20", "10:10"], ["10:20", "11:10"], ["11:10", "12:00"], ["13:00", "13:50"], ["13:50", "14:40"]];

function execNowMinutes() {
  const [h, m] = new Date().toLocaleTimeString("en-GB", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit", hour12: false }).split(":").map(Number);
  return h * 60 + m;
}
const execMin = t => { const [h, m] = String(t || "").slice(0, 5).split(":").map(Number); return Number.isFinite(h) ? h * 60 + (m || 0) : null; };

function ExecPeriodSection({ employees, leaves, onOpenPlan }) {
  const todayDow = new Date(`${todayISO()}T00:00:00`).getDay();
  const [rows, setRows] = useState(null);
  const [plans, setPlans] = useState(new Map());
  const [presentToday, setPresentToday] = useState(new Set());
  const [day, setDay] = useState(todayDow >= 1 && todayDow <= 5 ? todayDow : 1);
  const [period, setPeriod] = useState(null);
  const [grid, setGrid] = useState(false);
  const [error, setError] = useState("");
  const weekStart = mondayOf(todayISO());

  useEffect(() => {
    let active = true;
    (async () => {
      const [sched, sup, att] = await Promise.all([
        supabase.from("teaching_schedule").select("id, employee_id, day_of_week, period, subject, class_room, start_time, end_time").gte("day_of_week", 1).lte("day_of_week", 5).order("day_of_week").order("period"),
        fetchWeekPlansForExec(weekPeriodKey(weekStart)),
        supabase.from("attendance").select("employee_id").gte("check_in", `${todayISO()}T00:00:00+07:00`).lte("check_in", `${todayISO()}T23:59:59+07:00`),
      ]);
      if (!active) return;
      if (sched.error) setError(`ตารางสอน: ${sched.error.message}`);
      const kgIds = new Set((employees || []).filter(emp => isKgHomeroomTeacher(emp) || isNonTeachingStaff(emp)).map(emp => String(emp.id)));
      const list = (sched.data || []).filter(row => !EXEC_SPECIAL_ROOMS.has(row.class_room) && row.day_of_week >= 1 && row.day_of_week <= 5 && !kgIds.has(String(row.employee_id)) && !KG_ROOM_RE.test(String(row.class_room || "")));
      const latest = new Map();
      (sup.data || []).forEach(row => {
        const key = String(row.employee_id);
        if (!latest.has(key) || String(row.created_at || "") > String(latest.get(key).created_at || "")) latest.set(key, row);
      });
      const parsed = new Map();
      latest.forEach((row, key) => parsed.set(key, parseSupervisionPlan(row.subject, weekStart)));
      setPlans(parsed);
      setPresentToday(new Set((att.data || []).map(row => String(row.employee_id))));
      setRows(list);
    })().catch(err => { if (active) { setRows([]); setError(err.message || "โหลดตารางสอนไม่สำเร็จ"); } });
    return () => { active = false; };
  }, [weekStart, employees]);

  const maxPeriod = Math.max(6, ...(rows || []).map(row => Number(row.period) || 0));
  const periods = Array.from({ length: maxPeriod }, (_, index) => index + 1);
  // คาบปัจจุบันจากเวลาในตารางสอน (หรือเวลามาตรฐาน) ไม่ตรงคาบใด → คาบ 1
  useEffect(() => {
    if (!rows || period !== null) return;
    const now = execNowMinutes();
    let found = 1;
    periods.forEach(no => {
      const sample = rows.find(row => Number(row.period) === no && row.start_time && row.end_time);
      const [start, end] = sample ? [execMin(sample.start_time), execMin(sample.end_time)] : (EXEC_DEFAULT_PERIOD_TIMES[no - 1] || []).map(execMin);
      if (start !== null && end !== null && now >= start && now < end) found = no;
    });
    setPeriod(found);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  const people = employees || [];
  const nameOf = id => people.find(emp => String(emp.id) === String(id))?.name || "-";
  const teacherIds = new Set([...people.filter(emp => !isExecutiveUser(emp) && emp.role !== "admin").map(emp => String(emp.id)), ...(rows || []).map(row => String(row.employee_id))]);
  const teachers = people.filter(emp => teacherIds.has(String(emp.id)) && !isKgHomeroomTeacher(emp) && !isNonTeachingStaff(emp)).sort((a, b) => String(a.name).localeCompare(String(b.name), "th"));
  const dateOfDay = shiftDateKey(weekStart, day - 1);
  const isToday = dateOfDay === todayISO();
  const onLeaveToday = new Set((leaves || []).filter(row => row.status === "approved" && row.start_date <= todayISO() && (row.end_date || row.start_date) >= todayISO()).map(row => String(row.employee_id)));
  const cur = period || 1;
  const slotRows = (rows || []).filter(row => row.day_of_week === day && Number(row.period) === cur);
  const step = delta => {
    let d = day; let p = cur + delta;
    if (p < 1) { d = d === 1 ? 5 : d - 1; p = maxPeriod; }
    if (p > maxPeriod) { d = d === 5 ? 1 : d + 1; p = 1; }
    setDay(d); setPeriod(p);
  };
  const planPeriodOf = (id, date, no) => (plans.get(String(id))?.periods || []).find(item => item.teach_date === date && Number(item.period_no) === no);
  const planState = id => {
    const plan = plans.get(String(id));
    return plan?.status === "submitted" ? (plan.late ? "late" : "submitted") : "missing";
  };
  const small = { ...inputStyle, width: "auto", padding: "0.35rem 0.5rem", fontSize: "0.85rem" };
  const navBtn = { ...btnSecondary, flex: "none", padding: "0.35rem 0.6rem", fontSize: "0.82rem" };
  const cell = { padding: "0.4rem 0.45rem", borderTop: "1px solid #f1f5f9", fontSize: "0.83rem", verticalAlign: "top" };
  const th = { padding: "0.35rem 0.45rem", fontSize: "0.75rem", color: "#596068", textAlign: "left", fontWeight: 800, whiteSpace: "nowrap" };

  return (
    <ExecSection title="ตารางสอนรายคาบ" icon={Calendar} right={
      <button type="button" aria-pressed={grid} onClick={() => setGrid(value => !value)} style={{ ...navBtn, background: grid ? "#EAF5FF" : "#f8fafc", color: "#0072D9" }}>{grid ? "ดูทีละคาบ" : "ดูทั้งสัปดาห์"}</button>
    }>
      {error && <ErrorBox>{error}</ErrorBox>}
      {!rows ? <div style={{ color: "#64748b" }}>กำลังโหลดตารางสอน...</div> : rows.length === 0 ? (
        <div style={{ background: "#FFF4EA", border: "1px solid #FFD2AD", borderRadius: 12, padding: "0.8rem 1rem", color: "#9a4a00", fontWeight: 700, fontSize: "0.88rem" }}>
          ยังไม่มีข้อมูลตารางสอนในระบบ — ให้ครูหรือฝ่ายวิชาการกรอกที่เมนู "ตารางสอน" (เพิ่มคาบ: ครู · วัน · คาบ · วิชา · ห้อง) แล้วหน้านี้จะแสดงครูที่สอนในแต่ละคาบให้อัตโนมัติ
        </div>
      ) : grid ? (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 720 }}>
            <thead><tr><th style={th}>คาบ</th>{[1, 2, 3, 4, 5].map(d => <th key={d} style={{ ...th, color: d === todayDow ? "#008CFF" : th.color }}>{DAY_NAMES[d]}</th>)}</tr></thead>
            <tbody>
              {periods.map(no => (
                <tr key={no}>
                  <td style={{ ...cell, fontWeight: 800, color: "#233862" }}>{no}</td>
                  {[1, 2, 3, 4, 5].map(d => {
                    const items = rows.filter(row => row.day_of_week === d && Number(row.period) === no);
                    return (
                      <td key={d} style={{ ...cell, background: d === day && no === cur ? "#EAF5FF" : "transparent", cursor: "pointer" }} onClick={() => { setDay(d); setPeriod(no); setGrid(false); }}>
                        {items.length === 0 ? <span style={{ color: "#cbd5e1" }}>–</span> : items.map(row => <div key={row.id} style={{ fontSize: "0.76rem", lineHeight: 1.35 }}><strong style={{ color: "#233862" }}>{nameOf(row.employee_id)}</strong> · {row.subject || "-"}{row.class_room ? ` · ${row.class_room}` : ""}</div>)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ fontSize: "0.75rem", color: "#64748b", marginTop: "0.4rem" }}>กดช่องในตารางเพื่อไปดูคาบนั้น</div>
        </div>
      ) : (
        <div style={{ display: "grid", gap: "0.6rem" }}>
          <div style={{ display: "flex", gap: "0.4rem", alignItems: "center", flexWrap: "wrap" }}>
            <button type="button" aria-label="คาบก่อนหน้า" onClick={() => step(-1)} style={navBtn}><ChevronLeft size={15} /> คาบก่อน</button>
            <select aria-label="วัน" value={day} onChange={event => setDay(Number(event.target.value))} style={small}>
              {[1, 2, 3, 4, 5].map(d => <option key={d} value={d}>{DAY_NAMES[d]}{d === todayDow ? " (วันนี้)" : ""}</option>)}
            </select>
            <select aria-label="คาบ" value={cur} onChange={event => setPeriod(Number(event.target.value))} style={small}>
              {periods.map(no => <option key={no} value={no}>คาบ {no}</option>)}
            </select>
            <button type="button" aria-label="คาบถัดไป" onClick={() => step(1)} style={navBtn}>คาบถัดไป <ChevronRight size={15} /></button>
            <span style={{ fontSize: "0.8rem", color: "#596068" }}>{formatThaiDateKey(dateOfDay)} · สอน {slotRows.length} · ว่าง {Math.max(0, teachers.length - new Set(slotRows.map(row => String(row.employee_id))).size)}</span>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 640 }}>
              <thead><tr>{["ครู", "วิชา", "ห้อง/ชั้น", "หน่วย/เรื่อง", "สถานะแผน", isToday ? "วันนี้" : ""].map(label => <th key={label} style={th}>{label}</th>)}</tr></thead>
              <tbody>
                {teachers.map(emp => {
                  const mine = slotRows.filter(row => String(row.employee_id) === String(emp.id));
                  const state = EXEC_PLAN_STATUS[planState(emp.id)];
                  const status = (
                    <>
                      <td style={cell}><ExecPill color={state.color} bg={state.bg}>{planState(emp.id) === "missing" ? "ยังไม่ส่ง" : "ส่งแล้ว"}</ExecPill></td>
                      <td style={cell}>{isToday && (onLeaveToday.has(String(emp.id)) ? <ExecPill color="#0072D9" bg="#DCEFFF">ลา</ExecPill> : presentToday.has(String(emp.id)) ? <ExecPill color="#166534" bg="#dcfce7">เข้างานแล้ว</ExecPill> : <ExecPill color="#b91c1c" bg="#fee2e2">ยังไม่เข้างาน</ExecPill>)}</td>
                    </>
                  );
                  if (mine.length === 0) {
                    return (
                      <tr key={emp.id} style={{ background: "#fafcff" }}>
                        <td style={{ ...cell, fontWeight: 700, color: "#233862" }}>{emp.name}</td>
                        <td style={{ ...cell, color: "#94a3b8", fontWeight: 700 }} colSpan={3}>ว่าง</td>
                        {status}
                      </tr>
                    );
                  }
                  return mine.map(row => {
                    const pp = planPeriodOf(emp.id, dateOfDay, cur);
                    const topic = [pp?.plan_unit, pp?.plan_title || pp?.subject].filter(text => String(text || "").trim()).join(" · ");
                    return (
                      <tr key={row.id} onClick={() => onOpenPlan(emp, weekStart, { date: dateOfDay, period: cur })} style={{ cursor: "pointer" }} title="ดูแผนคาบนี้">
                        <td style={{ ...cell, fontWeight: 700, color: "#233862" }}>{emp.name}</td>
                        <td style={cell}>{row.subject || "-"}</td>
                        <td style={cell}>{row.class_room || "-"}</td>
                        <td style={{ ...cell, color: topic ? "#334155" : "#94a3b8" }}>{topic || "-"}</td>
                        {status}
                      </tr>
                    );
                  });
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </ExecSection>
  );
}

function ExecPlanModal({ teacher, weekStart, onClose, focus = null }) {
  const [state, setState] = useState({ loading: true, plan: null, error: "" });
  useEffect(() => {
    let active = true;
    fetchSupervisionRows(teacher.id, weekStart)
      .then(rows => { if (active) setState({ loading: false, plan: rows[0] ? parseSupervisionPlan(rows[0].subject, weekStart) : null, error: "" }); })
      .catch(err => { if (active) setState({ loading: false, plan: loadLocalPlan(teacher.id, weekStart), error: err.message || "โหลดแผนไม่สำเร็จ" }); });
    return () => { active = false; };
  }, [teacher.id, weekStart]);
  const plan = state.plan;
  return (
    <div role="dialog" aria-modal="true" style={{ position: "fixed", inset: 0, background: "rgba(35,56,98,0.45)", zIndex: 1000, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "1rem", overflowY: "auto" }} onClick={onClose}>
      <div onClick={event => event.stopPropagation()} style={{ background: "#fff", borderRadius: 18, width: "100%", maxWidth: 860, padding: "1rem", boxShadow: "0 4px 24px rgba(0,140,255,0.15)", display: "grid", gap: "0.8rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <div style={{ flex: 1, fontWeight: 800, color: "#233862", fontSize: "1.05rem" }}>แผนของ {teacher.name} · สัปดาห์ {formatThaiDateKey(weekStart)} <span style={{ fontSize: "0.75rem", color: "#64748b", fontWeight: 600 }}>(อ่านอย่างเดียว)</span></div>
          <button type="button" aria-label="ปิด" onClick={onClose} style={{ border: "none", background: "#f1f5f9", borderRadius: "50%", width: 32, height: 32, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}><X size={16} /></button>
        </div>
        {state.error && <ErrorBox>{state.error}</ErrorBox>}
        {state.loading ? <div style={{ color: "#64748b" }}>กำลังโหลดแผน...</div> : !plan ? <div style={{ color: "#64748b" }}>ยังไม่มีแผนสัปดาห์นี้</div> : (
          <>
            {plan.submitted_at && <div style={{ fontSize: "0.8rem", color: "#64748b" }}>ส่งล่าสุด {fmtDate(plan.submitted_at)} {fmtTime(plan.submitted_at)}{plan.late ? " · ส่งช้า" : ""}</div>}
            {plan.signoff?.at && (
              <div style={{ background: "#EAF5FF", border: "1px solid #B8E0FF", borderRadius: 12, padding: "0.7rem" }}>
                <div style={{ fontWeight: 800, color: "#0072D9" }}>รับทราบแล้ว · {plan.signoff.by || "ฝ่ายวิชาการ"} · {fmtDate(plan.signoff.at)} {fmtTime(plan.signoff.at)}</div>
                <FullText value={plan.signoff.comment} />
              </div>
            )}
            {(plan.observations || []).map((item, index) => (
              <div key={item.id || index} style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 12, padding: "0.7rem" }}>
                <div style={{ fontWeight: 800, color: "#233862" }}>นิเทศในห้อง {formatThaiDateKey(item.date)} · {labelOf(OBSERVATION_MATCH, item.match) || "-"} · {item.by || "ฝ่ายวิชาการ"}</div>
                <FullText value={item.note} />
              </div>
            ))}
            {focus && plan.kind !== "kindergarten" ? (() => {
              const target = (plan.periods || []).find(item => item.teach_date === focus.date && Number(item.period_no) === Number(focus.period));
              return target ? <SupervisionPeriodRead period={target} defaultOpen /> : <div style={{ color: "#64748b" }}>ยังไม่มีแผนของคาบที่ {focus.period} วันที่ {formatThaiDateKey(focus.date)}</div>;
            })() : plan.kind === "kindergarten" ? <KindergartenWeekView plan={plan} weekStart={weekStart} /> : <SupervisionWeekView periods={plan.periods} weekStart={weekStart} />}
          </>
        )}
      </div>
    </div>
  );
}

// รายงานกิจกรรม (หน้าผู้บริหาร) — อ่านจากแผนกิจกรรม (__ACTIVITY_PLAN__) ซ่อนกิจกรรมของครูทดลองระบบ
function activityTermOf(date) {
  if (!/^\d{4}-\d{2}/.test(date || "")) return "";
  const y = Number(date.slice(0, 4)), m = Number(date.slice(5, 7));
  if (m >= 5 && m <= 10) return `1/${y + 543}`;
  return `2/${(m >= 11 ? y : y - 1) + 543}`;
}
function sumActivityItems(plans, key) {
  const map = new Map();
  plans.forEach(plan => (plan[key] || []).forEach(row => {
    const name = String(row.name || "").trim(); if (!name) return;
    const unit = String(row.unit || "").trim();
    const k = `${name}|${unit}`;
    const cur = map.get(k) || { name, unit, qty: 0, nonNumeric: [], count: 0 };
    const n = Number(String(row.qty || "").replace(/,/g, ""));
    if (row.qty && Number.isFinite(n)) cur.qty += n; else if (row.qty) cur.nonNumeric.push(row.qty);
    cur.count += 1; map.set(k, cur);
  }));
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, "th"));
}
function printActivityReport(plans, nameOf, heading) {
  const win = window.open("", "_blank");
  if (!win) return;
  const esc = v => String(v ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const items = rows => rows.length ? rows.map(r => `${esc(r.name)} ${esc(r.qty || "")} ${esc(r.unit || "")}`).join("<br>") : "-";
  const sumTable = (title, list) => `<h3>${title}</h3>${list.length ? `<table><tr><th>รายการ</th><th>รวม</th><th>หน่วย</th><th>จำนวนกิจกรรม</th></tr>${list.map(r => `<tr><td>${esc(r.name)}</td><td style="text-align:right">${r.qty || ""}${r.nonNumeric.length ? ` (+${esc(r.nonNumeric.join(", "))})` : ""}</td><td>${esc(r.unit)}</td><td style="text-align:center">${r.count}</td></tr>`).join("")}</table>` : "<div>-</div>"}`;
  win.document.open();
  win.document.write(`<!doctype html><html lang="th"><head><meta charset="utf-8"><title>รายงานกิจกรรม</title><style>@page{size:A4 landscape;margin:10mm}body{font-family:sans-serif;font-size:12px}h2{text-align:center;margin:0}table{border-collapse:collapse;width:100%;margin-top:6px}th,td{border:1px solid #888;padding:3px 5px;vertical-align:top}th{background:#eef}</style></head><body>
<h2>รายงานกิจกรรม โรงเรียนนิมิตศึกษา</h2><div style="text-align:center">${esc(heading)} · ${plans.length} กิจกรรม</div>
<table><tr><th>#</th><th>วันที่</th><th>กิจกรรม</th><th>ครูผู้จัด</th><th>สิ่งของที่ใช้</th><th>ของที่ใช้เบิก</th><th>ใบงาน</th><th>บันทึกหลังกิจกรรม</th></tr>
${plans.map((p, i) => `<tr><td>${i + 1}</td><td>${esc(formatActivityRange(p))}${activityIsMultiDay(p) ? `<br><small>${activityDayList(p).map(d => `${esc(activityDayLabel(d.date))}: ${d.holiday ? "วันหยุด" : esc([d.time, d.detail].filter(Boolean).join(" ")) || "-"}`).join("<br>")}</small>` : ""}</td><td>${esc(p.title)}</td><td>${esc(p.organizers.map(nameOf).join(", "))}</td><td>${items(p.materials)}</td><td>${items(p.requisitions)}</td><td style="text-align:center">${(p.worksheet_images || []).length}</td><td>${p.post_record ? "บันทึกแล้ว" : "ยังไม่บันทึก"}</td></tr>`).join("")}</table>
${sumTable("สรุปของที่ใช้เบิกรวม", sumActivityItems(plans, "requisitions"))}${sumTable("สรุปสิ่งของที่ใช้รวม", sumActivityItems(plans, "materials"))}
</body></html>`);
  win.document.close(); win.focus(); setTimeout(() => win.print(), 600);
}

function ExecActivityReport({ employees }) {
  const [plans, setPlans] = useState(null);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState("term");
  const [term, setTerm] = useState(() => activityTermOf(todayISO()));
  const [month, setMonth] = useState(() => todayISO().slice(0, 7));
  const [query, setQuery] = useState("");
  const [detail, setDetail] = useState("");
  const [showSum, setShowSum] = useState(false);
  const nameOf = id => (employees || []).find(emp => String(emp.id) === String(id))?.name || "ไม่ทราบชื่อ";
  useEffect(() => {
    if (!open || plans) return;
    fetchActivityRows().then(rows => setPlans(rows), err => { setError(err.message || "โหลดไม่สำเร็จ"); setPlans([]); });
  }, [open, plans]);
  const testIds = new Set((employees || []).filter(isTestTeacher).map(emp => String(emp.id)));
  const all = (plans || []).filter(p => !testIds.has(String(p.created_by)) && !(p.organizers.length && p.organizers.every(id => testIds.has(String(id)))));
  const terms = [...new Set([activityTermOf(todayISO()), ...all.flatMap(p => [activityTermOf(p.date), activityTermOf(activityEnd(p))]).filter(Boolean)])].sort().reverse();
  const q = query.trim().toLowerCase();
  const shown = all
    .filter(p => mode === "all" || (mode === "term" ? [p.date, activityEnd(p)].some(d => activityTermOf(d) === term) : (String(p.date).slice(0, 7) <= month && String(activityEnd(p)).slice(0, 7) >= month)))
    .filter(p => !q || [p.title, p.description, ...p.organizers.map(nameOf), ...p.materials.map(r => r.name), ...p.requisitions.map(r => r.name)].join(" ").toLowerCase().includes(q))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const heading = mode === "all" ? "ทุกกิจกรรม" : mode === "term" ? `ภาคเรียนที่ ${term}` : `เดือน ${new Date(`${month}-01T12:00:00Z`).toLocaleDateString("th-TH", { month: "long", year: "numeric", timeZone: "UTC" })}`;
  const reqSum = sumActivityItems(shown, "requisitions");
  const small = { ...inputStyle, padding: "0.35rem 0.5rem", fontSize: "0.82rem", width: "auto" };
  const itemList = rows => rows.length ? rows.map(r => `${r.name}${r.qty ? ` ${r.qty}` : ""}${r.unit ? ` ${r.unit}` : ""}`).join(", ") : "-";
  const sumBox = (title, list) => (
    <div><div style={{ fontWeight: 800, color: "#334155", fontSize: "0.85rem" }}>{title}</div>
      {list.length === 0 ? <div style={{ color: "#94a3b8", fontSize: "0.8rem" }}>-</div> : (
        <div style={{ overflowX: "auto" }}><table style={{ borderCollapse: "collapse", fontSize: "0.8rem", width: "100%" }}><tbody>
          {list.map(r => <tr key={r.name + r.unit} style={{ borderTop: "1px solid #f1f5f9" }}><td style={{ padding: "0.2rem 0.4rem" }}>{r.name}</td><td style={{ padding: "0.2rem 0.4rem", textAlign: "right", fontWeight: 700 }}>{r.qty || ""}{r.nonNumeric.length ? ` (+${r.nonNumeric.join(", ")})` : ""}</td><td style={{ padding: "0.2rem 0.4rem" }}>{r.unit}</td><td style={{ padding: "0.2rem 0.4rem", color: "#64748b" }}>{r.count} กิจกรรม</td></tr>)}
        </tbody></table></div>)}
    </div>);
  return (
    <ExecSection title="รายงานกิจกรรม" icon={FileText} right={<button type="button" onClick={() => setOpen(!open)} style={{ ...btnSecondary, flex: "none", padding: "0.3rem 0.7rem", fontSize: "0.8rem" }}>{open ? "ซ่อน" : "เปิดดู"}</button>}>
      {!open ? <div style={{ color: "#64748b", fontSize: "0.85rem" }}>ดูกิจกรรมทั้งหมด ของที่ขอใช้/ขอเบิก ใบงาน และบันทึกหลังกิจกรรม</div> : plans === null ? <div style={{ color: "#64748b" }}>กำลังโหลด...</div> : (
        <div style={{ display: "grid", gap: "0.6rem" }}>
          {error && <ErrorBox>{error}</ErrorBox>}
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", alignItems: "center" }}>
            <select value={mode} onChange={e => setMode(e.target.value)} style={small}><option value="term">รายภาคเรียน</option><option value="month">รายเดือน</option><option value="all">ทั้งหมด</option></select>
            {mode === "term" && <select value={term} onChange={e => setTerm(e.target.value)} style={small}>{terms.map(t => <option key={t} value={t}>ภาค {t}</option>)}</select>}
            {mode === "month" && <input type="month" value={month} onChange={e => setMonth(e.target.value)} style={small} />}
            <input value={query} placeholder="ค้นหากิจกรรม/ครู/สิ่งของ" onChange={e => setQuery(e.target.value)} style={{ ...small, flex: "1 1 140px" }} />
            <button type="button" onClick={() => printActivityReport(shown, nameOf, heading)} disabled={!shown.length} style={{ ...btnSecondary, flex: "none", padding: "0.35rem 0.7rem", fontSize: "0.8rem" }}><Printer size={14} /> พิมพ์</button>
          </div>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", fontSize: "0.8rem" }}>
            <span style={{ background: "#EAF5FF", color: "#0072D9", borderRadius: 999, padding: "0.15rem 0.6rem", fontWeight: 700 }}>{shown.length} กิจกรรม</span>
            <span style={{ background: "#dcfce7", color: "#15803d", borderRadius: 999, padding: "0.15rem 0.6rem", fontWeight: 700 }}>บันทึกหลังกิจกรรมแล้ว {shown.filter(p => p.post_record).length}</span>
            <span style={{ background: "#fef3c7", color: "#b45309", borderRadius: 999, padding: "0.15rem 0.6rem", fontWeight: 700 }}>ขอเบิก {reqSum.length} รายการ</span>
            <button type="button" onClick={() => setShowSum(!showSum)} style={{ border: "none", background: "none", color: "#0072D9", cursor: "pointer", fontFamily: "inherit", fontWeight: 700, fontSize: "0.8rem" }}>{showSum ? "ซ่อนสรุปรวม" : "ดูสรุปของรวม"}</button>
          </div>
          {showSum && <div style={{ background: "#f8fafc", borderRadius: 10, padding: "0.6rem", display: "grid", gap: "0.5rem" }}>{sumBox("ของที่ใช้เบิกรวม", reqSum)}{sumBox("สิ่งของที่ใช้รวม", sumActivityItems(shown, "materials"))}</div>}
          {shown.length === 0 ? <div style={{ color: "#94a3b8", textAlign: "center", padding: "1rem" }}>ไม่มีกิจกรรมในช่วงนี้</div> : (
            <div style={{ display: "grid", gap: "0.4rem", maxHeight: 520, overflowY: "auto" }}>
              {shown.map(p => {
                const isOpen = detail === p.id;
                return (
                  <div key={p.id} style={{ border: "1px solid #e2e8f0", borderRadius: 10, padding: "0.5rem 0.65rem" }}>
                    <button type="button" onClick={() => setDetail(isOpen ? "" : p.id)} style={{ width: "100%", border: "none", background: "none", padding: 0, textAlign: "left", cursor: "pointer", fontFamily: "inherit" }}>
                      <div style={{ display: "flex", gap: "0.4rem", alignItems: "center", flexWrap: "wrap" }}>
                        <span style={{ fontSize: "0.75rem", color: "#0072D9", fontWeight: 800 }}>{formatActivityRange(p)}</span>
                        <span style={{ fontWeight: 800, color: "#233862", flex: 1, minWidth: 120 }}>{p.title}</span>
                        {p.approval?.status && <span style={{ fontSize: "0.68rem", fontWeight: 800, borderRadius: 999, padding: "0.1rem 0.45rem", background: "#EAF5FF", color: "#0072D9" }}>{p.approval.status}</span>}
                        <span style={{ fontSize: "0.68rem", fontWeight: 800, borderRadius: 999, padding: "0.1rem 0.45rem", background: p.post_record ? "#dcfce7" : "#f1f5f9", color: p.post_record ? "#15803d" : "#64748b" }}>{p.post_record ? "บันทึกแล้ว" : "ยังไม่บันทึก"}</span>
                        {(p.worksheet_images || []).length > 0 && <span style={{ fontSize: "0.68rem", color: "#64748b" }}>ใบงาน {p.worksheet_images.length}</span>}
                      </div>
                      <div style={{ fontSize: "0.75rem", color: "#64748b", marginTop: 2 }}>ครู: {p.organizers.map(nameOf).join(", ") || "-"}</div>
                      <div style={{ fontSize: "0.75rem", color: "#475569" }}><b>ใช้:</b> {itemList(p.materials)}</div>
                      <div style={{ fontSize: "0.75rem", color: "#b45309" }}><b>ขอเบิก:</b> {itemList(p.requisitions)}</div>
                    </button>
                    {isOpen && (
                      <div style={{ display: "grid", gap: "0.4rem", marginTop: "0.5rem", fontSize: "0.85rem", borderTop: "1px solid #f1f5f9", paddingTop: "0.5rem" }}>
                        {p.description && <FullText value={p.description} />}
                        <ActivityDaysView plan={p} />
                        {(p.worksheet_images || []).length > 0 && <div><div style={{ fontWeight: 800, color: "#334155" }}>ใบงาน</div><WorksheetImages images={p.worksheet_images} title={`ใบงาน ${p.title}`} /></div>}
                        {p.post_record ? (
                          <div style={{ background: "#f8fafc", borderRadius: 10, padding: "0.5rem 0.65rem", display: "grid", gap: "0.3rem" }}>
                            <div style={{ fontWeight: 800, color: "#15803d" }}>บันทึกหลังกิจกรรม</div>
                            {[["ผลการดำเนินกิจกรรม", p.post_record.result], ["จำนวนผู้เข้าร่วม", p.post_record.participants], ["ปัญหา/อุปสรรค", p.post_record.problems], ["ข้อเสนอแนะ/แนวทางแก้ไข", p.post_record.suggestions]].filter(([, v]) => String(v || "").trim()).map(([label, value]) => <div key={label}><b style={{ color: "#334155" }}>{label}: </b><span style={{ whiteSpace: "pre-wrap" }}>{value}</span></div>)}
                            {(p.post_record.images || []).length > 0 && <div><div style={{ fontWeight: 800, color: "#334155" }}>ภาพกิจกรรม</div><WorksheetImages images={p.post_record.images} title={`ภาพกิจกรรม ${p.title}`} /></div>}
                            <div style={{ fontSize: "0.75rem", color: "#94a3b8" }}>บันทึกโดย {p.post_record.recorded_by_name || nameOf(p.post_record.recorded_by)}</div>
                            <button type="button" onClick={() => printActivityPost(p, nameOf)} style={{ ...btnSecondary, flex: "none", width: "fit-content", padding: "0.3rem 0.6rem", fontSize: "0.8rem" }}><Printer size={14} /> พิมพ์บันทึกหลังกิจกรรม</button>
                          </div>
                        ) : <div style={{ color: "#94a3b8" }}>ยังไม่มีบันทึกหลังกิจกรรม</div>}
                      </div>
                    )}
                  </div>);
              })}
            </div>
          )}
        </div>
      )}
    </ExecSection>
  );
}

function ExecutiveDashboard({ employees, leaves, settings, currentUser, onOpenEval, onOpenLeave, onOpenCalendar }) {
  const [date, setDate] = useState(() => todayISO());
  const [attendance, setAttendance] = useState([]);
  const [attLoading, setAttLoading] = useState(true);
  const [evalRows, setEvalRows] = useState(null);
  const [evalNote, setEvalNote] = useState("");
  const [plans, setPlans] = useState(null);
  const [planWeek, setPlanWeek] = useState(() => defaultPlanWeek());
  const [planTeacher, setPlanTeacher] = useState(null);
  const [periodPlan, setPeriodPlan] = useState(null);
  const [error, setError] = useState("");
  const people = (employees || []);
  const teachers = people.filter(emp => !isExecutiveUser(emp));
  const planTeachers = teachers.filter(emp => !isNonTeachingStaff(emp));
  const workStart = String(settings?.work_start || "08:00").slice(0, 5);
  const grace = Number(settings?.late_grace_minutes || 0);

  useEffect(() => {
    let active = true;
    setAttLoading(true);
    supabase.from("attendance").select("employee_id, check_in, check_out, work_activity").gte("check_in", `${date}T00:00:00+07:00`).lte("check_in", `${date}T23:59:59+07:00`).then(({ data, error: err }) => {
      if (!active) return;
      if (err) setError(`ลงเวลา: ${err.message}`);
      setAttendance(data || []);
      setAttLoading(false);
    });
    return () => { active = false; };
  }, [date]);

  useEffect(() => {
    let active = true;
    (async () => {
      const store = await loadEval2Store(currentUser);
      const sem = currentSemester();
      const range = semesterRange(sem, store.settings);
      const sources = await loadEval2Sources(range);
      if (!active) return;
      const semKey = semesterKey(sem);
      const lock = store.locks?.[semKey];
      const rows = teachers.map(emp => {
        const frozen = lock?.teachers?.[emp.id];
        const manual = (store.books?.[`${semKey}:${emp.id}`]?.entries || []).filter(entry => entry.date >= range.start && entry.date <= range.end);
        const entries = frozen ? frozen.entries : [...computeAutoEntries(emp.id, sources, range, store.settings), ...manual];
        return { emp, ...evalSummary(entries) };
      }).sort((a, b) => a.score - b.score || String(a.emp.name).localeCompare(String(b.emp.name), "th"));
      setEvalRows(rows);
      setEvalNote(`ภาคเรียน ${sem.term}/${sem.year}${todayISO() < range.start ? " · ยังไม่เริ่มเทอม" : ""}`);
    })().catch(err => { if (active) { setEvalRows([]); setError(`ประเมินครู: ${err.message}`); } });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser, employees]);

  useEffect(() => {
    let active = true;
    setPlans(null);
    fetchWeekPlansForExec(weekPeriodKey(planWeek)).then(({ data, error: err }) => {
      if (!active) return;
      if (err) setError(`แผนการสอน: ${err.message}`);
      const latest = new Map();
      (data || []).forEach(row => {
        const key = String(row.employee_id);
        if (!latest.has(key) || String(row.created_at || "") > String(latest.get(key).created_at || "")) latest.set(key, row);
      });
      setPlans(latest);
    });
    return () => { active = false; };
  }, [planWeek]);

  // ลงเวลา
  const firstRow = new Map();
  attendance.forEach(row => {
    const key = String(row.employee_id);
    const current = firstRow.get(key);
    if (!current || row.check_in < current.check_in) firstRow.set(key, { ...row, check_out: row.check_out || current?.check_out || null });
    else if (row.check_out && (!current.check_out || row.check_out > current.check_out)) current.check_out = row.check_out;
  });
  const leaveOn = day => (leaves || []).filter(row => row.status === "approved" && row.start_date <= day && (row.end_date || row.start_date) >= day);
  const onLeave = new Set(leaveOn(date).map(row => String(row.employee_id)));
  const attRows = people.map(emp => {
    const row = firstRow.get(String(emp.id));
    const late = row && row.work_activity !== "training" ? checkLate(row.check_in, wsOf(row.employee_id, workStart), grace) : null;
    return { emp, row, late: late?.late ? late.minutes : 0 };
  });
  const checkedIn = attRows.filter(item => item.row).sort((a, b) => a.row.check_in.localeCompare(b.row.check_in));
  const lateList = checkedIn.filter(item => item.late > 0);
  const outList = checkedIn.filter(item => item.row.check_out);
  const notIn = attRows.filter(item => !item.row);

  // การลา
  const today = todayISO();
  const todayLeaves = leaveOn(today);
  const upcoming = (leaves || []).filter(row => row.status === "approved" && row.start_date > today && row.start_date <= shiftDateKey(today, 30)).sort((a, b) => a.start_date.localeCompare(b.start_date));
  const pending = (leaves || []).filter(row => row.status === "pending");
  const leaveLine = row => `${row.employees?.name || people.find(emp => String(emp.id) === String(row.employee_id))?.name || "-"} · ${row.leave_type || "ลา"} · ${formatThaiDateKey(row.start_date)}${row.end_date && row.end_date !== row.start_date ? ` – ${formatThaiDateKey(row.end_date)}` : ""}`;

  // แผน
  const planStatus = emp => {
    const row = plans?.get(String(emp.id));
    if (!row) return "missing";
    const status = supervisionStatusFromStartTime(row.start_time);
    if (status === "submitted" || status === "late") return status;
    const plan = parseSupervisionPlan(row.subject, planWeek);
    if (plan?.status === "submitted") return plan.late ? "late" : "submitted";
    return "missing";
  };
  const planCounts = { submitted: 0, late: 0, missing: 0 };
  if (plans) planTeachers.forEach(emp => { planCounts[planStatus(emp)] += 1; });

  const distribution = EVAL_LEVELS.map(level => ({ ...level, count: (evalRows || []).filter(row => evalLevel(row.score).label === level.label).length }));
  const maxCount = Math.max(1, ...distribution.map(level => level.count));
  const tile = (label, value, color) => (
    <div style={{ flex: "1 1 110px", background: "#F3F8FD", border: "1px solid #E4EEF8", borderRadius: 14, padding: "0.6rem 0.75rem" }}>
      <div style={{ fontSize: "0.75rem", color: "#596068" }}>{label}</div>
      <div style={{ fontSize: "1.5rem", fontWeight: 900, color }}>{value}</div>
    </div>
  );
  const nameCell = emp => <span style={{ fontWeight: 700, color: "#233862" }}>{emp.name}</span>;
  const listBox = { display: "grid", gap: "0.3rem", maxHeight: 260, overflowY: "auto" };
  const line = { display: "flex", justifyContent: "space-between", gap: "0.5rem", fontSize: "0.83rem", padding: "0.3rem 0.1rem", borderTop: "1px solid #f1f5f9" };

  return (
    <div style={{ display: "grid", gap: "1rem" }}>
      <div style={{ background: "linear-gradient(90deg, #008CFF, #3EBFFB)", borderRadius: 18, padding: "1rem 1.2rem", color: "#fff", boxShadow: "0 4px 24px rgba(0,140,255,0.2)" }}>
        <div style={{ fontSize: "1.25rem", fontWeight: 800 }}>หน้าผู้บริหาร</div>
        <div style={{ fontSize: "0.85rem", opacity: 0.9 }}>สวัสดี {currentUser?.name} · ภาพรวมวันที่ {formatThaiDateKey(today)}</div>
      </div>
      {error && <ErrorBox>{error}</ErrorBox>}
      <UpcomingCalendarCard onOpen={onOpenCalendar} />
      <ExecActivityReport employees={employees} />
      <div style={{ display: "grid", gap: "1rem", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 420px), 1fr))" }}>
        <ExecSection title="การประเมินครู" icon={TrendingUp} right={<span style={{ fontSize: "0.75rem", color: "#64748b" }}>{evalNote}</span>}>
          {!evalRows ? <div style={{ color: "#64748b" }}>กำลังคำนวณคะแนน...</div> : (
            <div style={{ display: "grid", gap: "0.7rem" }}>
              <div style={{ display: "grid", gap: "0.3rem" }} aria-label="กราฟการกระจายระดับ">
                {distribution.map(level => (
                  <div key={level.label} style={{ display: "grid", gridTemplateColumns: "6.5rem 1fr 2rem", alignItems: "center", gap: "0.4rem", fontSize: "0.78rem" }}>
                    <span style={{ color: level.color, fontWeight: 700 }}>{level.label}</span>
                    <div style={{ background: "#F3F8FD", borderRadius: 8, height: 14 }}><div style={{ width: `${(level.count / maxCount) * 100}%`, background: level.color, opacity: 0.8, height: "100%", borderRadius: 8, minWidth: level.count ? 6 : 0 }} /></div>
                    <span style={{ fontWeight: 800, color: "#233862", textAlign: "right" }}>{level.count}</span>
                  </div>
                ))}
              </div>
              <div style={listBox}>
                {evalRows.map(row => (
                  <button key={row.emp.id} type="button" onClick={() => onOpenEval(row.emp.id)} style={{ ...line, background: "none", border: "none", borderTop: "1px solid #f1f5f9", cursor: "pointer", fontFamily: "inherit", textAlign: "left", alignItems: "center" }}>
                    {nameCell(row.emp)}
                    <span style={{ display: "flex", gap: "0.4rem", alignItems: "center" }}><strong style={{ color: evalLevel(row.score).color }}>{row.score.toFixed(1)}</strong><EvalLevelBadge score={row.score} /><ChevronRight size={14} color="#94a3b8" /></span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </ExecSection>

        <ExecSection title="ลงเวลา" icon={Clock} right={<input type="date" aria-label="เลือกวันที่" value={date} max={today} onChange={event => event.target.value && setDate(event.target.value)} style={{ ...inputStyle, width: "auto", padding: "0.3rem 0.5rem", fontSize: "0.82rem" }} />}>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "0.6rem" }}>
            {tile("ลงเวลาเข้า", checkedIn.length, "#008CFF")}
            {tile("มาสาย", lateList.length, "#FF7106")}
            {tile("ลงเวลาออก", outList.length, "#16a34a")}
            {tile("ยังไม่ลงเวลา", notIn.length, "#dc2626")}
          </div>
          {attLoading ? <div style={{ color: "#64748b" }}>กำลังโหลด...</div> : (
            <div style={listBox}>
              {checkedIn.map(item => (
                <div key={item.emp.id} style={line}>
                  {nameCell(item.emp)}
                  <span style={{ display: "flex", gap: "0.35rem", alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
                    <span>เข้า {fmtTime(item.row.check_in)}</span>
                    {item.late > 0 && <ExecPill color="#b45309" bg="#fef3c7">สาย {item.late} นาที</ExecPill>}
                    <span style={{ color: item.row.check_out ? "#16a34a" : "#94a3b8" }}>ออก {item.row.check_out ? fmtTime(item.row.check_out) : "-"}</span>
                  </span>
                </div>
              ))}
              {notIn.map(item => (
                <div key={item.emp.id} style={line}>
                  {nameCell(item.emp)}
                  {onLeave.has(String(item.emp.id)) ? <ExecPill color="#0072D9" bg="#DCEFFF">ลา</ExecPill> : <ExecPill color="#b91c1c" bg="#fee2e2">ยังไม่ลงเวลา</ExecPill>}
                </div>
              ))}
            </div>
          )}
        </ExecSection>

        <ExecSection title="การลา" icon={Umbrella} right={<button type="button" onClick={onOpenLeave} style={{ border: "none", background: pending.length ? "linear-gradient(90deg, #FF7106, #FF9A3C)" : "#EAF5FF", color: pending.length ? "#fff" : "#0072D9", fontWeight: 800, borderRadius: 999, padding: "0.3rem 0.8rem", cursor: "pointer", fontFamily: "inherit", fontSize: "0.8rem" }}>รออนุมัติ {pending.length} · ไปหน้าอนุมัติ</button>}>
          <div style={{ display: "grid", gap: "0.6rem" }}>
            {[["ลาวันนี้", todayLeaves], ["ลาที่กำลังจะถึง (30 วัน)", upcoming], ["รออนุมัติ", pending]].map(([title, list]) => (
              <div key={title}>
                <div style={{ fontWeight: 800, fontSize: "0.83rem", color: "#233862", marginBottom: "0.2rem" }}>{title} ({list.length})</div>
                {list.length === 0 ? <div style={{ fontSize: "0.8rem", color: "#94a3b8" }}>ไม่มี</div> : (
                  <div style={{ display: "grid" }}>{list.slice(0, 8).map(row => <div key={row.id} style={{ ...line, display: "block" }}>{leaveLine(row)}{row.reason ? <span style={{ color: "#64748b" }}> — {row.reason}</span> : null}</div>)}</div>
                )}
              </div>
            ))}
          </div>
        </ExecSection>

        <ExecSection title="แผนที่ครูส่ง" icon={BookOpen} right={<WeekSwitcher weekStart={planWeek} onChange={setPlanWeek} />}>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "0.6rem" }}>
            {tile("ส่งแล้ว", planCounts.submitted, "#16a34a")}
            {tile("ส่งช้า", planCounts.late, "#b45309")}
            {tile("ยังไม่ส่ง", planCounts.missing, "#dc2626")}
          </div>
          {!plans ? <div style={{ color: "#64748b" }}>กำลังโหลด...</div> : (
            <div style={listBox}>
              {planTeachers.map(emp => {
                const status = EXEC_PLAN_STATUS[planStatus(emp)];
                return (
                  <button key={emp.id} type="button" onClick={() => setPlanTeacher(emp)} style={{ ...line, background: "none", border: "none", borderTop: "1px solid #f1f5f9", cursor: "pointer", fontFamily: "inherit", textAlign: "left", alignItems: "center" }}>
                    {nameCell(emp)}
                    <span style={{ display: "flex", gap: "0.35rem", alignItems: "center" }}><ExecPill color={status.color} bg={status.bg}>{status.label}</ExecPill><Eye size={14} color="#94a3b8" /></span>
                  </button>
                );
              })}
            </div>
          )}
        </ExecSection>
      </div>
      <ExecPeriodSection employees={employees} leaves={leaves} onOpenPlan={(emp, week, focus) => setPeriodPlan({ emp, week, focus })} />
      {planTeacher && <ExecPlanModal teacher={planTeacher} weekStart={planWeek} onClose={() => setPlanTeacher(null)} />}
      {periodPlan && <ExecPlanModal teacher={periodPlan.emp} weekStart={periodPlan.week} focus={periodPlan.focus} onClose={() => setPeriodPlan(null)} />}
    </div>
  );
}

// ─── เวรความสะอาด / เวรพื้นที่ (เฉพาะผู้บริหาร/แอดมิน) ─────────────────────────
// แถวพิเศษใน teaching_schedule: class_room "__CLEANING_DUTY__"
// period 1 = ทะเบียนห้องเรียนและพื้นที่รับผิดชอบ (kind "config"), period 2 = ผลการตรวจ 1 ครั้ง/แถว (kind "inspection")
const CLEANING_DUTY_ROOM = "__CLEANING_DUTY__";
const CLEANING_LOCAL_KEY = "hr_cleaning_duty_v1";
const CLEANING_AREA_PRESETS = ["ห้องเรียน", "ทางเดิน", "สนาม", "ห้องน้ำ", "บันได", "สวนหย่อม"];
const CLEANING_CRITERIA = [
  { key: "trash", label: "ขยะ", hint: "ไม่มีขยะตกค้างบนพื้น ใต้โต๊ะ และมุมห้อง" },
  { key: "floor", label: "ฝุ่น/พื้น", hint: "พื้นกวาดและถูสะอาด ไม่มีคราบหรือฝุ่นสะสม" },
  { key: "furniture", label: "โต๊ะเก้าอี้เป็นระเบียบ", hint: "จัดโต๊ะเก้าอี้เป็นแถว สิ่งของจัดเก็บเรียบร้อย" },
  { key: "board", label: "กระดาน/หน้าต่าง", hint: "กระดานลบสะอาด หน้าต่างและขอบหน้าต่างไม่มีฝุ่น" },
  { key: "bins", label: "ถังขยะ/การคัดแยก", hint: "ถังขยะไม่ล้น มีฝาปิด และคัดแยกขยะถูกประเภท" },
];
const CLEANING_SCALE = [
  { value: 5, label: "ดีเยี่ยม" }, { value: 4, label: "ดี" }, { value: 3, label: "พอใช้" },
  { value: 2, label: "ควรปรับปรุง" }, { value: 1, label: "ต้องแก้ไขเร่งด่วน" }, { value: 0, label: "ไม่ได้ดำเนินการ" },
];
// เกณฑ์จัดการได้โดยผู้บริหาร เก็บใน config.criteria · ผลการตรวจแต่ละครั้งเก็บสำเนาเกณฑ์ของตัวเอง (criteria) ไว้
// คะแนนเต็ม = จำนวนเกณฑ์ × 5 · ผลการตรวจเก่าที่ไม่มีสำเนาเกณฑ์ = ใช้ 5 เกณฑ์ตั้งต้น
const CLEANING_CRITERIA_LIMIT = 15;
function cleanCleaningCriteria(raw, fallback = CLEANING_CRITERIA) {
  if (!Array.isArray(raw)) return fallback.map(c => ({ key: c.key, label: c.label, hint: c.hint || "" }));
  const seen = new Set();
  return raw.map(c => ({ key: String(c?.key || "").trim().slice(0, 40), label: String(c?.label || "").trim().slice(0, 60), hint: String(c?.hint || "").trim().slice(0, 200) }))
    .filter(c => c.key && c.label && !seen.has(c.key) && seen.add(c.key)).slice(0, CLEANING_CRITERIA_LIMIT);
}
const cleaningMaxOf = criteria => criteria.length * 5;
const CLEANING_PHOTO_LIMIT = 4;

function cleaningLevel(percent) {
  if (percent >= 90) return { label: "ดีเยี่ยม", color: "#166534", bg: "#dcfce7" };
  if (percent >= 75) return { label: "ดี", color: "#0072D9", bg: "#DCEFFF" };
  if (percent >= 60) return { label: "พอใช้", color: "#b45309", bg: "#fef3c7" };
  return { label: "ต้องปรับปรุง", color: "#b91c1c", bg: "#fee2e2" };
}

function cleanCleaningRoom(raw) {
  const areas = [...new Set((Array.isArray(raw?.areas) ? raw.areas : []).map(area => String(area || "").trim().slice(0, 60)).filter(Boolean))];
  return { id: String(raw?.id || newSupervisionId()), name: String(raw?.name || "").trim().slice(0, 80), areas };
}

function cleanCleaningConfig(raw) {
  return {
    kind: "config",
    id: "config",
    rooms: (Array.isArray(raw?.rooms) ? raw.rooms : []).map(cleanCleaningRoom).filter(room => room.name),
    criteria: (() => { const list = cleanCleaningCriteria(raw?.criteria); return list.length ? list : cleanCleaningCriteria(null); })(),
    updated_at: String(raw?.updated_at || ""),
    row_id: raw?.row_id || null,
    pending: !!raw?.pending,
  };
}

function cleaningTotal(scores, criteria = CLEANING_CRITERIA) {
  return criteria.reduce((sum, item) => sum + (Number(scores?.[item.key]) || 0), 0);
}

function cleanCleaningInspection(raw) {
  const criteria = cleanCleaningCriteria(raw?.criteria).map(c => ({ key: c.key, label: c.label }));
  const scores = {};
  criteria.forEach(item => {
    const value = Number(raw?.scores?.[item.key]);
    scores[item.key] = Number.isFinite(value) ? Math.max(0, Math.min(5, Math.round(value))) : 0;
  });
  return {
    kind: "inspection",
    id: String(raw?.id || newSupervisionId()),
    room_id: String(raw?.room_id || ""),
    room_name: String(raw?.room_name || "").slice(0, 80),
    area: String(raw?.area || "").slice(0, 60),
    date: /^\d{4}-\d{2}-\d{2}$/.test(raw?.date || "") ? raw.date : todayISO(),
    criteria,
    scores,
    total: cleaningTotal(scores, criteria),
    max: cleaningMaxOf(criteria),
    note: String(raw?.note || "").slice(0, 1000),
    photos: (Array.isArray(raw?.photos) ? raw.photos : []).filter(photo => photo?.url || photo?.dataUrl).slice(0, CLEANING_PHOTO_LIMIT),
    by: String(raw?.by || "").slice(0, 120),
    by_id: String(raw?.by_id || ""),
    at: String(raw?.at || ""),
    updated_at: String(raw?.updated_at || raw?.at || ""),
    edited_by: String(raw?.edited_by || "").slice(0, 120),
    row_id: raw?.row_id || null,
    pending: !!raw?.pending,
  };
}

function readCleaningLocal() {
  try {
    const parsed = JSON.parse(localStorage.getItem(CLEANING_LOCAL_KEY) || "{}");
    return {
      config: parsed.config ? cleanCleaningConfig(parsed.config) : null,
      inspections: (parsed.inspections || []).map(cleanCleaningInspection),
      deleted: Array.isArray(parsed.deleted) ? parsed.deleted.map(String) : [],
    };
  } catch { return { config: null, inspections: [], deleted: [] }; }
}

function writeCleaningLocal(config, inspections, deleted) {
  try {
    localStorage.setItem(CLEANING_LOCAL_KEY, JSON.stringify({ config, inspections, deleted, saved_at: new Date().toISOString() }));
  } catch {
    // รูปภาพทำให้พื้นที่เต็ม → เก็บเฉพาะรายการที่ยังไม่ซิงก์ แบบไม่มีรูป
    try { localStorage.setItem(CLEANING_LOCAL_KEY, JSON.stringify({ config, inspections: inspections.filter(item => item.pending).map(item => ({ ...item, photos: item.photos.filter(photo => photo.url) })), deleted })); } catch { /* ignore */ }
  }
}

async function fetchCleaningRows() {
  const { data, error } = await supabase.from("teaching_schedule").select("id, employee_id, period, subject, created_at").eq("class_room", CLEANING_DUTY_ROOM);
  if (error) throw new Error(error.message);
  let config = null;
  const inspections = [];
  (data || []).forEach(row => {
    let parsed = {};
    try { parsed = JSON.parse(row.subject || "{}"); } catch { return; }
    if (parsed.kind === "config") {
      const next = cleanCleaningConfig({ ...parsed, row_id: row.id });
      if (!config || next.updated_at > config.updated_at) config = next;
    } else if (parsed.kind === "inspection") {
      inspections.push(cleanCleaningInspection({ ...parsed, row_id: row.id }));
    }
  });
  return { config, inspections };
}

async function writeCleaningRow(item, employeeId) {
  const body = { ...item };
  delete body.row_id;
  delete body.pending;
  const payload = { employee_id: employeeId || null, day_of_week: 0, period: item.kind === "config" ? 1 : 2, class_room: CLEANING_DUTY_ROOM, start_time: "00:00:00", end_time: null, subject: JSON.stringify(body) };
  const result = item.row_id
    ? await supabase.from("teaching_schedule").update(payload).eq("id", item.row_id).select("id").single()
    : await supabase.from("teaching_schedule").insert(payload).select("id").single();
  if (result.error) throw new Error(result.error.message);
  return result.data.id;
}

async function storeCleaningPhoto(file) {
  const source = await readFileAsDataUrl(file);
  const image = await new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("เปิดรูปภาพไม่สำเร็จ"));
    img.src = source;
  });
  const scale = Math.min(1, 1024 / Math.max(image.width, image.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(image.width * scale);
  canvas.height = Math.round(image.height * scale);
  const ctx = canvas.getContext("2d");
  if (ctx) ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  const dataUrl = ctx ? canvas.toDataURL("image/jpeg", 0.7) : source;
  try {
    const blob = await (await fetch(dataUrl)).blob();
    const objectPath = `cleaning/${todayISO()}/${newSupervisionId()}.jpg`;
    const { error } = await supabase.storage.from(LESSON_FILE_BUCKET).upload(objectPath, blob, { contentType: "image/jpeg", upsert: false });
    if (!error) {
      const { data } = supabase.storage.from(LESSON_FILE_BUCKET).getPublicUrl(objectPath);
      if (data?.publicUrl) return { url: data.publicUrl, path: objectPath, storage: "supabase" };
    }
  } catch { /* ไม่มี bucket → เก็บแบบย่อขนาดในรายการ */ }
  return { dataUrl, storage: "inline" };
}

const photoSrc = photo => photo?.url || photo?.dataUrl || "";

function CleaningLevelBadge({ percent }) {
  const level = cleaningLevel(percent);
  return <span style={{ background: level.bg, color: level.color, fontWeight: 800, fontSize: "0.72rem", borderRadius: 20, padding: "0.12rem 0.55rem", whiteSpace: "nowrap" }}>{level.label}</span>;
}

function emptyCleaningForm(rooms, criteria = CLEANING_CRITERIA) {
  const room = rooms[0];
  const scores = {};
  criteria.forEach(item => { scores[item.key] = 5; });
  return { room_id: room?.id || "", area: room?.areas?.[0] || "", date: todayISO(), criteria: criteria.map(c => ({ key: c.key, label: c.label, hint: c.hint || "" })), scores, note: "", photos: [] };
}

function CleaningDutyPage({ currentUser }) {
  if (!isExecutiveUser(currentUser)) return <NoAccessCard />;
  return <CleaningDutyInner currentUser={currentUser} />;
}

function CleaningDutyInner({ currentUser }) {
  const [tab, setTab] = useState("inspect");
  const [config, setConfig] = useState(cleanCleaningConfig(null));
  const [inspections, setInspections] = useState([]);
  const [deleted, setDeleted] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [form, setForm] = useState(() => emptyCleaningForm([]));
  const [busy, setBusy] = useState(false);
  const [newRoom, setNewRoom] = useState("");
  const [areaDrafts, setAreaDrafts] = useState({});
  const [mode, setMode] = useState("week");
  const [weekStart, setWeekStart] = useState(() => mondayOf(todayISO()));
  const [month, setMonth] = useState(() => todayISO().slice(0, 7));
  const [detailRoom, setDetailRoom] = useState("");
  const [zoom, setZoom] = useState("");
  const [editingId, setEditingId] = useState("");
  const [roomEdit, setRoomEdit] = useState(null); // { id, name }
  const [areaEdit, setAreaEdit] = useState(null); // { roomId, from, to }
  const [confirmBox, setConfirmBox] = useState(null);
  const [criterionEdit, setCriterionEdit] = useState(null); // { key, label, hint }
  const [criterionDraft, setCriterionDraft] = useState({ label: "", hint: "" }); // { title, text, confirmLabel, onConfirm }
  const rooms = config.rooms;
  const askConfirm = (title, text, onConfirm, confirmLabel = "ลบ") => setConfirmBox({ title, text, onConfirm, confirmLabel });
  const roomNameOf = item => rooms.find(room => room.id === item.room_id)?.name || item.room_name || "ห้องที่ลบแล้ว";

  const commit = (nextConfig, nextInspections, nextDeleted = deleted) => {
    const sorted = [...nextInspections].sort((a, b) => b.date.localeCompare(a.date) || b.at.localeCompare(a.at));
    setConfig(nextConfig);
    setInspections(sorted);
    setDeleted(nextDeleted);
    writeCleaningLocal(nextConfig, sorted, nextDeleted);
  };

  useEffect(() => {
    let active = true;
    (async () => {
      const local = readCleaningLocal();
      try {
        const remote = await fetchCleaningRows();
        if (!active) return;
        let nextConfig = remote.config || cleanCleaningConfig(null);
        if (local.config && local.config.pending && local.config.updated_at > nextConfig.updated_at) {
          nextConfig = { ...local.config, row_id: nextConfig.row_id || local.config.row_id };
          try { nextConfig.row_id = await writeCleaningRow(nextConfig, currentUser.id); nextConfig.pending = false; } catch { /* คงไว้ในเครื่อง */ }
        }
        const deletedSet = new Set(local.deleted);
        const byId = new Map();
        remote.inspections.forEach(item => { if (!deletedSet.has(item.id)) byId.set(item.id, item); });
        for (const item of local.inspections) {
          if (deletedSet.has(item.id) || !item.pending) continue;
          const merged = { ...item, row_id: byId.get(item.id)?.row_id || item.row_id };
          try { merged.row_id = await writeCleaningRow(merged, currentUser.id); merged.pending = false; } catch { /* คงไว้ในเครื่อง */ }
          byId.set(item.id, merged);
        }
        const toDelete = remote.inspections.filter(item => deletedSet.has(item.id) && item.row_id).map(item => item.row_id);
        let remaining = local.deleted;
        if (toDelete.length) {
          const { error: delError } = await supabase.from("teaching_schedule").delete().in("id", toDelete);
          if (!delError) remaining = [];
        } else remaining = [];
        if (active) { commit(nextConfig, [...byId.values()], remaining); setForm(emptyCleaningForm(nextConfig.rooms, nextConfig.criteria)); }
      } catch (err) {
        if (active) {
          const fallback = local.config || cleanCleaningConfig(null);
          commit(fallback, local.inspections, local.deleted);
          setForm(emptyCleaningForm(fallback.rooms, fallback.criteria));
          setError(`โหลดจากฐานข้อมูลไม่ได้ (${err.message || "เชื่อมต่อไม่สำเร็จ"}) แสดงข้อมูลที่บันทึกไว้ในเครื่องนี้`);
        }
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveConfig = async (nextRooms, success, nextInspections = inspections, nextCriteria = config.criteria) => {
    const next = cleanCleaningConfig({ ...config, rooms: nextRooms, criteria: nextCriteria, updated_at: new Date().toISOString() });
    try {
      next.row_id = await writeCleaningRow(next, currentUser.id);
      next.pending = false;
      setMessage(success);
      setError("");
    } catch (err) {
      next.pending = true;
      setError(`${err.message || "บันทึกไม่สำเร็จ"} · เก็บไว้ในเครื่องนี้แล้ว จะซิงก์เมื่อเปิดหน้านี้ครั้งถัดไป`);
    }
    commit(next, nextInspections);
    if (!editingId && (!next.rooms.some(room => room.id === form.room_id) || nextCriteria !== config.criteria)) {
      setForm(current => ({ ...emptyCleaningForm(next.rooms, next.criteria), ...(next.rooms.some(room => room.id === current.room_id) ? { room_id: current.room_id, area: current.area, date: current.date, note: current.note, photos: current.photos } : {}) }));
    }
  };

  const addRoom = () => {
    const name = newRoom.trim();
    if (!name) return;
    if (rooms.some(room => room.name === name)) { setError(`มีห้อง ${name} อยู่แล้ว`); return; }
    saveConfig([...rooms, cleanCleaningRoom({ name, areas: ["ห้องเรียน"] })], `เพิ่มห้อง ${name} แล้ว`);
    setNewRoom("");
  };
  const removeRoom = room => {
    const count = inspections.filter(item => item.room_id === room.id).length;
    askConfirm(`ลบห้อง ${room.name}?`, `ห้องนี้จะถูกนำออกจากทะเบียน${count ? ` · ผลการตรวจเดิม ${count} รายการยังคงอยู่ในสรุปผล` : ""}`, () => saveConfig(rooms.filter(item => item.id !== room.id), `ลบห้อง ${room.name} แล้ว`));
  };
  const renameRoom = () => {
    if (!roomEdit) return;
    const room = rooms.find(item => item.id === roomEdit.id);
    const name = roomEdit.name.trim().slice(0, 80);
    if (!room || !name) { setError("กรุณากรอกชื่อห้อง"); return; }
    if (name === room.name) { setRoomEdit(null); return; }
    if (rooms.some(item => item.id !== room.id && item.name === name)) { setError(`มีห้อง ${name} อยู่แล้ว`); return; }
    setRoomEdit(null);
    saveConfig(rooms.map(item => (item.id === room.id ? { ...item, name } : item)), `เปลี่ยนชื่อห้อง ${room.name} เป็น ${name} แล้ว`);
  };
  // เปลี่ยนชื่อพื้นที่ → แก้ชื่อพื้นที่ในผลการตรวจเดิมของห้องนั้นด้วย
  const renameArea = async () => {
    if (!areaEdit) return;
    const room = rooms.find(item => item.id === areaEdit.roomId);
    const to = areaEdit.to.trim().slice(0, 60);
    if (!room || !to) { setError("กรุณากรอกชื่อพื้นที่"); return; }
    if (to === areaEdit.from) { setAreaEdit(null); return; }
    if (room.areas.includes(to)) { setError(`ห้อง ${room.name} มีพื้นที่ ${to} อยู่แล้ว`); return; }
    const from = areaEdit.from;
    setAreaEdit(null);
    setBusy(true);
    const now = new Date().toISOString();
    let failed = 0;
    const nextInspections = [];
    for (const item of inspections) {
      if (item.room_id !== room.id || item.area !== from) { nextInspections.push(item); continue; }
      const next = { ...item, area: to, updated_at: now };
      try { next.row_id = await writeCleaningRow(next, currentUser.id); next.pending = false; } catch { next.pending = true; failed += 1; }
      nextInspections.push(next);
    }
    await saveConfig(rooms.map(item => (item.id === room.id ? { ...item, areas: item.areas.map(value => (value === from ? to : value)) } : item)), `เปลี่ยนชื่อพื้นที่ ${from} เป็น ${to} แล้ว${failed ? ` (ผลการตรวจ ${failed} รายการรอซิงก์)` : ""}`, nextInspections);
    if (form.room_id === room.id && form.area === from) setForm(current => ({ ...current, area: to }));
    setBusy(false);
  };
  const addArea = (room, area) => {
    const text = String(area || "").trim();
    if (!text || room.areas.includes(text)) return;
    saveConfig(rooms.map(item => (item.id === room.id ? { ...item, areas: [...item.areas, text] } : item)), `เพิ่มพื้นที่ ${text} ให้ห้อง ${room.name} แล้ว`);
    setAreaDrafts(current => ({ ...current, [room.id]: "" }));
  };
  const removeArea = (room, area) => askConfirm(`ลบพื้นที่ ${area} ของห้อง ${room.name}?`, "ผลการตรวจเดิมของพื้นที่นี้ยังคงอยู่", () => saveConfig(rooms.map(item => (item.id === room.id ? { ...item, areas: item.areas.filter(value => value !== area) } : item)), `ลบพื้นที่ ${area} แล้ว`));

  const criteria = config.criteria;
  const saveCriteria = (list, success) => saveConfig(rooms, success, inspections, list);
  const addCriterion = () => {
    const label = criterionDraft.label.trim().slice(0, 60);
    if (!label) { setError("กรุณากรอกชื่อเกณฑ์"); return; }
    if (criteria.length >= CLEANING_CRITERIA_LIMIT) { setError(`มีเกณฑ์ได้ไม่เกิน ${CLEANING_CRITERIA_LIMIT} ข้อ`); return; }
    if (criteria.some(c => c.label === label)) { setError(`มีเกณฑ์ ${label} อยู่แล้ว`); return; }
    saveCriteria([...criteria, { key: `c_${newSupervisionId()}`, label, hint: criterionDraft.hint.trim().slice(0, 200) }], `เพิ่มเกณฑ์ ${label} แล้ว · คะแนนเต็มใหม่ ${cleaningMaxOf(criteria) + 5}`);
    setCriterionDraft({ label: "", hint: "" });
  };
  const saveCriterionEdit = () => {
    if (!criterionEdit) return;
    const label = criterionEdit.label.trim().slice(0, 60);
    if (!label) { setError("กรุณากรอกชื่อเกณฑ์"); return; }
    if (criteria.some(c => c.key !== criterionEdit.key && c.label === label)) { setError(`มีเกณฑ์ ${label} อยู่แล้ว`); return; }
    const edit = criterionEdit;
    setCriterionEdit(null);
    saveCriteria(criteria.map(c => (c.key === edit.key ? { ...c, label, hint: edit.hint.trim().slice(0, 200) } : c)), `แก้ไขเกณฑ์ ${label} แล้ว (ผลการตรวจเดิมยังแสดงชื่อเกณฑ์ตามที่บันทึกไว้)`);
  };
  const removeCriterion = c => {
    if (criteria.length <= 1) { setError("ต้องมีเกณฑ์อย่างน้อย 1 ข้อ"); return; }
    askConfirm(`ลบเกณฑ์ ${c.label}?`, `คะแนนเต็มของการตรวจครั้งต่อไปจะเป็น ${cleaningMaxOf(criteria) - 5} คะแนน (${criteria.length - 1} เกณฑ์ × 5) · ผลการตรวจเดิมยังคงคะแนนและเกณฑ์ตามที่บันทึกไว้`, () => saveCriteria(criteria.filter(item => item.key !== c.key), `ลบเกณฑ์ ${c.label} แล้ว`));
  };
  const moveCriterion = (index, delta) => {
    const target = index + delta;
    if (target < 0 || target >= criteria.length) return;
    const list = [...criteria];
    [list[index], list[target]] = [list[target], list[index]];
    saveCriteria(list, "จัดลำดับเกณฑ์แล้ว");
  };

  const pickPhotos = async event => {
    const files = [...(event.target.files || [])];
    event.target.value = "";
    if (!files.length) return;
    const room = CLEANING_PHOTO_LIMIT - form.photos.length;
    if (room <= 0) { setError(`แนบรูปได้ไม่เกิน ${CLEANING_PHOTO_LIMIT} รูปต่อการตรวจ`); return; }
    setBusy(true);
    try {
      const stored = [];
      for (const file of files.slice(0, room)) {
        if (!String(file.type).startsWith("image/")) continue;
        stored.push(await storeCleaningPhoto(file));
      }
      setForm(current => ({ ...current, photos: [...current.photos, ...stored].slice(0, CLEANING_PHOTO_LIMIT) }));
    } catch (err) {
      setError(err.message || "แนบรูปไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  };

  const submitInspection = async () => {
    const room = rooms.find(item => item.id === form.room_id);
    if (!room) { setError("กรุณาเลือกห้องเรียน"); return; }
    if (!form.area) { setError("กรุณาเลือกพื้นที่รับผิดชอบ"); return; }
    const now = new Date().toISOString();
    const original = editingId ? inspections.find(entry => entry.id === editingId) : null;
    const item = original
      ? cleanCleaningInspection({ ...original, room_id: form.room_id, area: form.area, date: form.date, criteria: form.criteria, scores: form.scores, note: form.note, photos: form.photos, room_name: room.name, updated_at: now, edited_by: currentUser.name })
      : cleanCleaningInspection({ ...form, id: newSupervisionId(), room_name: room.name, by: currentUser.name, by_id: currentUser.id, at: now, updated_at: now });
    if (original) item.edited_by = currentUser.name;
    setBusy(true);
    try {
      item.row_id = await writeCleaningRow(item, currentUser.id);
      item.pending = false;
      setMessage(`${original ? "แก้ไข" : "บันทึก"}ผลการตรวจ ${room.name} · ${item.area} แล้ว (${item.total}/${item.max} คะแนน)`);
      setError("");
    } catch (err) {
      item.pending = true;
      setError(`${err.message || "บันทึกไม่สำเร็จ"} · เก็บไว้ในเครื่องนี้แล้ว จะซิงก์เมื่อเปิดหน้านี้ครั้งถัดไป`);
    }
    commit(config, original ? inspections.map(entry => (entry.id === original.id ? item : entry)) : [item, ...inspections]);
    setEditingId("");
    setForm(current => ({ ...emptyCleaningForm(rooms, criteria), room_id: current.room_id, area: current.area, date: original ? todayISO() : current.date }));
    setBusy(false);
  };

  const startEdit = item => {
    setEditingId(item.id);
    setForm({ room_id: item.room_id, area: item.area, date: item.date, criteria: item.criteria.map(c => ({ ...c, hint: criteria.find(x => x.key === c.key)?.hint || "" })), scores: { ...item.scores }, note: item.note, photos: [...item.photos] });
    setTab("inspect");
    setDetailRoom("");
    setMessage("");
    setError(rooms.some(room => room.id === item.room_id) ? "" : "ห้องของผลการตรวจนี้ถูกลบจากทะเบียนแล้ว กรุณาเลือกห้องใหม่ก่อนบันทึก");
    if (!rooms.some(room => room.id === item.room_id)) setForm(current => ({ ...current, room_id: rooms[0]?.id || "", area: rooms[0]?.areas?.[0] || "" }));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const cancelEdit = () => {
    setEditingId("");
    setForm(emptyCleaningForm(rooms, criteria));
  };

  const deleteInspection = item => askConfirm("ลบผลการตรวจนี้?", `${roomNameOf(item)} · ${item.area} · วันที่ ${formatThaiDateKey(item.date)} (${item.total}/${item.max} คะแนน) — ลบแล้วกู้คืนไม่ได้`, () => removeInspection(item));
  const removeInspection = async item => {
    let nextDeleted = deleted;
    if (item.row_id) {
      const { error: delError } = await supabase.from("teaching_schedule").delete().eq("id", item.row_id);
      if (delError) nextDeleted = [...deleted, item.id];
    }
    commit(config, inspections.filter(entry => entry.id !== item.id), nextDeleted);
    if (editingId === item.id) cancelEdit();
    setMessage("ลบผลการตรวจแล้ว");
  };

  // สรุปผลตามช่วงเวลา
  const rangeStart = mode === "week" ? weekStart : `${month}-01`;
  const rangeEnd = mode === "week" ? shiftDateKey(weekStart, 6) : `${month}-31`;
  const inRange = inspections.filter(item => item.date >= rangeStart && item.date <= rangeEnd);
  const roomKeys = new Map();
  rooms.forEach(room => roomKeys.set(room.id, room.name));
  inRange.forEach(item => { if (!roomKeys.has(item.room_id)) roomKeys.set(item.room_id, item.room_name || "ห้องที่ลบแล้ว"); });
  const summary = [...roomKeys.entries()].map(([id, name]) => {
    const list = inRange.filter(item => item.room_id === id);
    const total = list.reduce((sum, item) => sum + item.total, 0);
    const maxSum = list.reduce((sum, item) => sum + item.max, 0);
    const average = list.length ? total / list.length : 0;
    const avgMax = list.length ? maxSum / list.length : cleaningMaxOf(criteria);
    const percent = maxSum ? (total / maxSum) * 100 : 0;
    // เฉลี่ยรายเกณฑ์: เกณฑ์ที่ใช้อยู่ + เกณฑ์ที่ถูกลบแต่ยังมีในผลการตรวจช่วงนี้ (นับเฉพาะครั้งที่มีเกณฑ์นั้น)
    const labels = new Map(criteria.map(c => [c.key, { label: c.label, active: true }]));
    list.forEach(item => item.criteria.forEach(c => { if (!labels.has(c.key)) labels.set(c.key, { label: c.label, active: false }); }));
    const byCriterion = [...labels.entries()].map(([key, info]) => {
      const scored = list.filter(item => item.criteria.some(c => c.key === key));
      return { key, ...info, n: scored.length, avg: scored.length ? scored.reduce((sum, item) => sum + item.scores[key], 0) / scored.length : 0 };
    }).filter(row => row.active || row.n);
    return { id, name, list, count: list.length, total, maxSum, average, avgMax, percent, byCriterion };
  }).sort((a, b) => (b.count > 0) - (a.count > 0) || b.percent - a.percent || a.name.localeCompare(b.name, "th"));
  let rank = 0;
  summary.forEach(row => { row.rank = row.count ? ++rank : null; });

  const small = { ...inputStyle, padding: "0.4rem 0.55rem", fontSize: "0.88rem" };
  const tabs = [["inspect", "บันทึกผลการตรวจ"], ["summary", "สรุปผลและอันดับ"], ["rooms", "ทะเบียนห้อง พื้นที่ และเกณฑ์"]];
  const formRoom = rooms.find(room => room.id === form.room_id);
  const formCriteria = form.criteria || criteria;
  const formTotal = cleaningTotal(form.scores, formCriteria);
  const formMax = cleaningMaxOf(formCriteria);
  const chip = active => ({ border: `1px solid ${active ? "#008CFF" : "#E4EEF8"}`, background: active ? "linear-gradient(90deg, #008CFF, #3EBFFB)" : "#fff", color: active ? "#fff" : "#233862", borderRadius: 999, padding: "0.3rem 0.75rem", fontWeight: 700, fontSize: "0.82rem", cursor: "pointer", fontFamily: "inherit" });
  const th = { padding: "0.4rem 0.5rem", fontSize: "0.75rem", color: "#596068", textAlign: "left", fontWeight: 800, whiteSpace: "nowrap", borderBottom: "1px solid #E4EEF8" };
  const td = { padding: "0.45rem 0.5rem", fontSize: "0.85rem", borderTop: "1px solid #f1f5f9" };

  const photoStrip = (photos, onRemove) => (
    <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
      {photos.map((photo, index) => (
        <div key={index} style={{ position: "relative" }}>
          <img src={photoSrc(photo)} alt={`รูปประกอบ ${index + 1}`} onClick={() => setZoom(photoSrc(photo))} style={{ width: 92, height: 92, objectFit: "cover", borderRadius: 10, border: "1px solid #E4EEF8", cursor: "zoom-in" }} />
          {onRemove && <button type="button" aria-label="ลบรูป" onClick={() => onRemove(index)} style={{ position: "absolute", top: 3, right: 3, width: 22, height: 22, borderRadius: "50%", border: "none", background: "#fee2e2", color: "#b91c1c", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", padding: 0 }}><X size={12} /></button>}
        </div>
      ))}
    </div>
  );

  const inspectionCard = item => {
    const percent = item.max ? (item.total / item.max) * 100 : 0;
    return (
      <div key={item.id} style={{ border: "1px solid #E4EEF8", borderRadius: 14, padding: "0.7rem 0.8rem", display: "grid", gap: "0.45rem", background: "#fff" }}>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
          <strong style={{ color: "#233862" }}>{formatThaiDateKey(item.date)} · {roomNameOf(item)} · {item.area}</strong>
          <span style={{ fontWeight: 900, color: cleaningLevel(percent).color }}>{item.total}/{item.max}</span>
          <CleaningLevelBadge percent={percent} />
          {item.pending && <span style={{ fontSize: "0.7rem", color: "#b45309" }}>รอซิงก์</span>}
          {editingId === item.id && <span style={{ fontSize: "0.7rem", color: "#FF7106", fontWeight: 800 }}>กำลังแก้ไข</span>}
          <span style={{ marginLeft: "auto", fontSize: "0.72rem", color: "#94a3b8" }}>ผู้ตรวจ {item.by || "-"}{item.at ? ` · ${fmtDate(item.at)} ${fmtTime(item.at)}` : ""}{item.edited_by && item.updated_at !== item.at ? ` · แก้ไขโดย ${item.edited_by} ${fmtDate(item.updated_at)} ${fmtTime(item.updated_at)}` : ""}</span>
          <button type="button" aria-label="แก้ไขผลการตรวจ" title="แก้ไข" onClick={() => startEdit(item)} style={{ border: "none", background: "#EAF5FF", color: "#0072D9", borderRadius: 8, padding: "0.2rem 0.4rem", cursor: "pointer" }}><Pencil size={13} /></button>
          <button type="button" aria-label="ลบผลการตรวจ" title="ลบ" onClick={() => deleteInspection(item)} style={{ border: "none", background: "#fee2e2", color: "#b91c1c", borderRadius: 8, padding: "0.2rem 0.4rem", cursor: "pointer" }}><Trash2 size={13} /></button>
        </div>
        <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
          {item.criteria.map(c => <span key={c.key} style={{ fontSize: "0.75rem", background: item.scores[c.key] >= 4 ? "#EAF5FF" : item.scores[c.key] >= 3 ? "#fef9c3" : "#fee2e2", color: "#233862", borderRadius: 8, padding: "0.15rem 0.45rem" }}>{c.label} {item.scores[c.key]}/5</span>)}
        </div>
        {item.note && <div style={{ fontSize: "0.83rem", color: "#334155", whiteSpace: "pre-wrap" }}><strong>จุดที่ต้องแก้ไข: </strong>{item.note}</div>}
        {item.photos.length > 0 && photoStrip(item.photos)}
      </div>
    );
  };

  const header = (
    <div style={{ background: "linear-gradient(90deg, #008CFF, #3EBFFB)", borderRadius: 18, padding: "1rem 1.2rem", color: "#fff", boxShadow: "0 4px 24px rgba(0,140,255,0.2)" }}>
      <div style={{ fontSize: "1.2rem", fontWeight: 800 }}>เวรความสะอาด / เวรพื้นที่</div>
      <div style={{ fontSize: "0.85rem", opacity: 0.9 }}>บันทึกผลการตรวจความสะอาดพื้นที่รับผิดชอบของแต่ละห้องเรียน (เฉพาะผู้บริหาร)</div>
    </div>
  );

  if (loading) return <div style={{ display: "grid", gap: "1rem" }}>{header}<Card><div style={{ color: "#64748b" }}>กำลังโหลดข้อมูล...</div></Card></div>;

  const detail = detailRoom ? summary.find(row => row.id === detailRoom) : null;

  return (
    <div style={{ display: "grid", gap: "1rem", maxWidth: 1080 }}>
      {header}
      <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
        {tabs.map(([key, label]) => <button key={key} type="button" aria-pressed={tab === key} onClick={() => { setTab(key); setDetailRoom(""); }} style={chip(tab === key)}>{label}</button>)}
      </div>
      {error && <ErrorBox>{error}</ErrorBox>}
      {message && <div style={{ background: "#ecfdf5", border: "1px solid #bbf7d0", borderRadius: 10, padding: "0.5rem 0.8rem", color: "#166534", fontWeight: 700, fontSize: "0.88rem" }}>{message}</div>}

      {tab !== "rooms" && rooms.length === 0 && (
        <Card><div style={{ color: "#9a4a00", fontWeight: 700 }}>ยังไม่มีทะเบียนห้องเรียน กรุณาเพิ่มห้องและพื้นที่รับผิดชอบที่แท็บ "ทะเบียนห้องและพื้นที่" ก่อนบันทึกผลการตรวจ</div></Card>
      )}

      {tab === "inspect" && rooms.length > 0 && (
        <div style={{ display: "grid", gap: "1rem", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 460px), 1fr))", alignItems: "start" }}>
          <Card>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.7rem", flexWrap: "wrap" }}>
              <div style={{ fontWeight: 800, color: editingId ? "#FF7106" : "#233862" }}>{editingId ? "แก้ไขผลการตรวจ" : "แบบบันทึกผลการตรวจ"}</div>
              {editingId && <span style={{ fontSize: "0.75rem", color: "#9a4a00", background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 999, padding: "0.1rem 0.55rem" }}>แก้ไขวันที่ ห้อง พื้นที่ คะแนน บันทึก และรูปได้</span>}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 140px), 1fr))", gap: "0.6rem" }}>
              <Field label="ห้องเรียน">
                <select value={form.room_id} onChange={event => { const room = rooms.find(item => item.id === event.target.value); setForm(current => ({ ...current, room_id: event.target.value, area: room?.areas?.[0] || "" })); }} style={small}>
                  {rooms.map(room => <option key={room.id} value={room.id}>{room.name}</option>)}
                </select>
              </Field>
              <Field label="วันที่ตรวจ">
                <input type="date" value={form.date} max={todayISO()} onChange={event => setForm(current => ({ ...current, date: event.target.value }))} style={small} />
              </Field>
              <Field label="พื้นที่รับผิดชอบ">
                <select value={form.area} onChange={event => setForm(current => ({ ...current, area: event.target.value }))} style={small}>
                  {(formRoom?.areas || []).length === 0 && !form.area && <option value="">ยังไม่กำหนดพื้นที่</option>}
                  {form.area && !(formRoom?.areas || []).includes(form.area) && <option value={form.area}>{form.area} (ไม่อยู่ในทะเบียนแล้ว)</option>}
                  {(formRoom?.areas || []).map(area => <option key={area} value={area}>{area}</option>)}
                </select>
              </Field>
            </div>
            <div style={{ display: "grid", gap: "0.55rem", marginTop: "0.8rem" }}>
              {formCriteria.map((c, index) => (
                <div key={c.key} style={{ background: "#F3F8FD", border: "1px solid #E4EEF8", borderRadius: 12, padding: "0.55rem 0.7rem" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem", alignItems: "baseline" }}>
                    <span style={{ fontWeight: 800, color: "#233862", fontSize: "0.88rem" }}>{index + 1}. {c.label}</span>
                    <span style={{ fontSize: "0.75rem", color: "#596068" }}>{CLEANING_SCALE.find(s => s.value === form.scores[c.key])?.label}</span>
                  </div>
                  <div style={{ fontSize: "0.75rem", color: "#596068", margin: "0.15rem 0 0.35rem" }}>{c.hint}</div>
                  <div role="radiogroup" aria-label={c.label} style={{ display: "flex", gap: "0.3rem", flexWrap: "wrap" }}>
                    {[0, 1, 2, 3, 4, 5].map(value => (
                      <button key={value} type="button" role="radio" aria-checked={form.scores[c.key] === value} onClick={() => setForm(current => ({ ...current, scores: { ...current.scores, [c.key]: value } }))} style={{ minWidth: 38, height: 34, borderRadius: 10, border: `1px solid ${form.scores[c.key] === value ? "#008CFF" : "#d6e4f2"}`, background: form.scores[c.key] === value ? "linear-gradient(135deg, #008CFF, #3EBFFB)" : "#fff", color: form.scores[c.key] === value ? "#fff" : "#233862", fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>{value}</button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: "0.7rem" }}>
              <Field label="บันทึกเพิ่มเติม / จุดที่ไม่สะอาด">
                <textarea value={form.note} onChange={event => setForm(current => ({ ...current, note: event.target.value }))} placeholder="เช่น มีขยะใต้โต๊ะแถวหลัง, ขอบหน้าต่างด้านทิศเหนือมีฝุ่น" rows={3} style={{ ...inputStyle, resize: "vertical" }} />
              </Field>
            </div>
            <div style={{ display: "grid", gap: "0.45rem", marginTop: "0.6rem" }}>
              <label style={{ ...btnSecondary, flex: "none", width: "fit-content", cursor: busy ? "wait" : "pointer" }}>
                <Upload size={16} /> {busy ? "กำลังประมวลผลรูป..." : `แนบรูปถ่าย (ไม่เกิน ${CLEANING_PHOTO_LIMIT} รูป)`}
                <input type="file" accept="image/*" multiple disabled={busy} onChange={pickPhotos} style={{ display: "none" }} />
              </label>
              {form.photos.length > 0 && photoStrip(form.photos, index => setForm(current => ({ ...current, photos: current.photos.filter((_, i) => i !== index) })))}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginTop: "0.9rem", flexWrap: "wrap" }}>
              <div style={{ fontWeight: 900, fontSize: "1.3rem", color: cleaningLevel(formMax ? (formTotal / formMax) * 100 : 0).color }}>{formTotal}/{formMax}</div>
              <CleaningLevelBadge percent={formMax ? (formTotal / formMax) * 100 : 0} />
              <span style={{ fontSize: "0.75rem", color: "#596068" }}>{formCriteria.length} เกณฑ์ × 5</span>
              {editingId && <button type="button" disabled={busy} onClick={cancelEdit} style={{ ...btnSecondary, flex: "none", marginLeft: "auto", padding: "0.6rem 1rem" }}><X size={16} /> ยกเลิกการแก้ไข</button>}
              <button type="button" disabled={busy} onClick={submitInspection} style={{ ...btnPrimary, flex: "none", marginLeft: editingId ? 0 : "auto", padding: "0.6rem 1.2rem", background: "linear-gradient(90deg, #FF7106, #FF9A3C)", color: "#fff", cursor: busy ? "wait" : "pointer", boxShadow: "0 4px 14px rgba(255,113,6,0.3)" }}><Save size={16} /> {editingId ? "บันทึกการแก้ไข" : "บันทึกผลการตรวจ"}</button>
            </div>
          </Card>
          <Card>
            <div style={{ fontWeight: 800, color: "#233862", marginBottom: "0.6rem" }}>ผลการตรวจล่าสุด</div>
            {inspections.length === 0 ? <div style={{ color: "#94a3b8" }}>ยังไม่มีผลการตรวจ</div> : <div style={{ display: "grid", gap: "0.5rem", maxHeight: 900, overflowY: "auto" }}>{inspections.slice(0, 12).map(inspectionCard)}</div>}
          </Card>
        </div>
      )}

      {tab === "summary" && rooms.length + inspections.length > 0 && (
        <Card>
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap", marginBottom: "0.8rem" }}>
            <button type="button" aria-pressed={mode === "week"} onClick={() => setMode("week")} style={chip(mode === "week")}>รายสัปดาห์</button>
            <button type="button" aria-pressed={mode === "month"} onClick={() => setMode("month")} style={chip(mode === "month")}>รายเดือน</button>
            {mode === "week" ? <WeekSwitcher weekStart={weekStart} onChange={setWeekStart} /> : <input type="month" aria-label="เดือน" value={month} onChange={event => event.target.value && setMonth(event.target.value)} style={{ ...small, width: "auto" }} />}
            <span style={{ fontSize: "0.8rem", color: "#596068" }}>ตรวจทั้งหมด {inRange.length} ครั้ง</span>
          </div>
          {detail ? (
            <div style={{ display: "grid", gap: "0.6rem" }}>
              <button type="button" onClick={() => setDetailRoom("")} style={{ ...btnSecondary, flex: "none", width: "fit-content", padding: "0.35rem 0.7rem", fontSize: "0.82rem" }}><ChevronLeft size={14} /> กลับไปตารางสรุป</button>
              <div style={{ display: "flex", gap: "1rem", alignItems: "center", flexWrap: "wrap" }}>
                <div style={{ fontSize: "1.15rem", fontWeight: 800, color: "#233862" }}>{detail.name}{detail.rank ? ` · อันดับ ${detail.rank}` : ""}</div>
                <div style={{ fontWeight: 900, color: cleaningLevel(detail.percent).color }}>เฉลี่ย {detail.average.toFixed(1)}/{Number.isInteger(detail.avgMax) ? detail.avgMax : detail.avgMax.toFixed(1)} ({detail.percent.toFixed(0)}%)</div>
                {detail.count > 0 && <CleaningLevelBadge percent={detail.percent} />}
              </div>
              {detail.count > 0 && (
                <div style={{ display: "grid", gap: "0.25rem" }}>
                  {detail.byCriterion.map(c => (
                    <div key={c.key} style={{ display: "grid", gridTemplateColumns: "12rem 1fr 3rem", gap: "0.5rem", alignItems: "center", fontSize: "0.8rem" }}>
                      <span style={{ color: c.active ? "#233862" : "#94a3b8", fontWeight: 700 }}>{c.label}{!c.active ? " (เลิกใช้)" : ""}{c.n < detail.count ? ` · ${c.n} ครั้ง` : ""}</span>
                      <div style={{ background: "#F3F8FD", borderRadius: 8, height: 12 }}><div style={{ width: `${(c.avg / 5) * 100}%`, height: "100%", borderRadius: 8, background: c.active ? "linear-gradient(90deg, #008CFF, #3EBFFB)" : "#cbd5e1" }} /></div>
                      <span style={{ textAlign: "right", fontWeight: 800 }}>{c.n ? c.avg.toFixed(1) : "-"}</span>
                    </div>
                  ))}
                </div>
              )}
              {detail.list.length === 0 ? <div style={{ color: "#94a3b8" }}>ไม่มีผลการตรวจในช่วงนี้</div> : detail.list.map(inspectionCard)}
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 620 }}>
                <thead><tr>{["อันดับ", "ห้องเรียน", "จำนวนครั้งที่ตรวจ", "คะแนนรวม", "คะแนนเฉลี่ย", "ร้อยละ", "ระดับ"].map(label => <th key={label} style={th}>{label}</th>)}</tr></thead>
                <tbody>
                  {summary.map(row => (
                    <tr key={row.id} onClick={() => setDetailRoom(row.id)} style={{ cursor: "pointer" }} title="ดูรายละเอียดและรูปถ่าย">
                      <td style={{ ...td, fontWeight: 900, color: row.rank === 1 ? "#FF7106" : "#233862" }}>{row.rank ? (row.rank <= 3 ? ["🥇", "🥈", "🥉"][row.rank - 1] + " " : "") + row.rank : "-"}</td>
                      <td style={{ ...td, fontWeight: 700, color: "#233862" }}>{row.name}</td>
                      <td style={td}>{row.count}</td>
                      <td style={td}>{row.count ? `${row.total}/${row.maxSum}` : "-"}</td>
                      <td style={td}>{row.count ? `${row.average.toFixed(1)}/${Number.isInteger(row.avgMax) ? row.avgMax : row.avgMax.toFixed(1)}` : "-"}</td>
                      <td style={td}>{row.count ? `${row.percent.toFixed(0)}%` : "-"}</td>
                      <td style={td}>{row.count ? <CleaningLevelBadge percent={row.percent} /> : <span style={{ color: "#94a3b8", fontSize: "0.78rem" }}>ยังไม่ได้ตรวจ</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ fontSize: "0.75rem", color: "#64748b", marginTop: "0.4rem" }}>เรียงอันดับตามร้อยละของคะแนนที่ได้ (คะแนนเต็มของแต่ละครั้ง = จำนวนเกณฑ์ ณ วันที่ตรวจ × 5) · กดที่แถวเพื่อดูรายละเอียดและรูปถ่าย</div>
            </div>
          )}
        </Card>
      )}

      {tab === "rooms" && (
        <Card>
          <div style={{ display: "flex", alignItems: "baseline", gap: "0.6rem", flexWrap: "wrap", marginBottom: "0.3rem" }}>
            <div style={{ fontWeight: 800, color: "#233862" }}>เกณฑ์การให้คะแนน</div>
            <span style={{ fontSize: "0.8rem", color: "#0072D9", fontWeight: 800 }}>{criteria.length} เกณฑ์ × 5 = คะแนนเต็ม {cleaningMaxOf(criteria)}</span>
          </div>
          <div style={{ fontSize: "0.78rem", color: "#596068", marginBottom: "0.6rem" }}>ใช้กับการตรวจครั้งต่อไป · ผลการตรวจเดิมยังคงเกณฑ์ คะแนน และคะแนนเต็มตามที่บันทึกไว้</div>
          <div style={{ display: "grid", gap: "0.45rem" }}>
            {criteria.map((c, index) => (
              <div key={c.key} style={{ border: "1px solid #E4EEF8", borderRadius: 12, padding: "0.5rem 0.7rem", background: criterionEdit?.key === c.key ? "#F3F8FD" : "#fff" }}>
                {criterionEdit?.key === c.key ? (
                  <div style={{ display: "grid", gap: "0.4rem" }}>
                    <input autoFocus value={criterionEdit.label} onChange={event => setCriterionEdit({ ...criterionEdit, label: event.target.value })} onKeyDown={event => { if (event.key === "Escape") setCriterionEdit(null); }} aria-label={`ชื่อใหม่ของเกณฑ์ ${c.label}`} placeholder="ชื่อเกณฑ์" style={small} />
                    <input value={criterionEdit.hint} onChange={event => setCriterionEdit({ ...criterionEdit, hint: event.target.value })} onKeyDown={event => { if (event.key === "Enter") saveCriterionEdit(); if (event.key === "Escape") setCriterionEdit(null); }} aria-label={`คำอธิบายเกณฑ์ ${c.label}`} placeholder="คำอธิบาย / สิ่งที่ตรวจ" style={small} />
                    <div style={{ display: "flex", gap: "0.4rem", justifyContent: "flex-end" }}>
                      <button type="button" onClick={() => setCriterionEdit(null)} style={{ ...btnSecondary, flex: "none", padding: "0.3rem 0.7rem", fontSize: "0.8rem" }}>ยกเลิก</button>
                      <button type="button" onClick={saveCriterionEdit} style={{ ...btnPrimary, flex: "none", padding: "0.3rem 0.8rem", fontSize: "0.8rem", background: "linear-gradient(90deg, #008CFF, #3EBFFB)", color: "#fff", cursor: "pointer" }}><Save size={13} /> บันทึกเกณฑ์</button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                    <div style={{ display: "grid", gap: 0 }}>
                      <button type="button" aria-label={`เลื่อนเกณฑ์ ${c.label} ขึ้น`} disabled={index === 0} onClick={() => moveCriterion(index, -1)} style={{ border: "none", background: "transparent", color: index === 0 ? "#cbd5e1" : "#596068", cursor: index === 0 ? "default" : "pointer", padding: 0, display: "inline-flex" }}><ChevronUp size={14} /></button>
                      <button type="button" aria-label={`เลื่อนเกณฑ์ ${c.label} ลง`} disabled={index === criteria.length - 1} onClick={() => moveCriterion(index, 1)} style={{ border: "none", background: "transparent", color: index === criteria.length - 1 ? "#cbd5e1" : "#596068", cursor: index === criteria.length - 1 ? "default" : "pointer", padding: 0, display: "inline-flex", transform: "rotate(180deg)" }}><ChevronUp size={14} /></button>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 800, color: "#233862", fontSize: "0.9rem" }}>{index + 1}. {c.label}</div>
                      <div style={{ fontSize: "0.76rem", color: c.hint ? "#596068" : "#94a3b8" }}>{c.hint || "ไม่มีคำอธิบาย"}</div>
                    </div>
                    <button type="button" aria-label={`แก้ไขเกณฑ์ ${c.label}`} onClick={() => setCriterionEdit({ key: c.key, label: c.label, hint: c.hint || "" })} style={{ border: "none", background: "#EAF5FF", color: "#0072D9", borderRadius: 8, padding: "0.25rem 0.55rem", cursor: "pointer", fontFamily: "inherit", fontSize: "0.78rem", fontWeight: 700, whiteSpace: "nowrap" }}><Pencil size={12} /> แก้ไข</button>
                    <button type="button" aria-label={`ลบเกณฑ์ ${c.label}`} disabled={criteria.length <= 1} title={criteria.length <= 1 ? "ต้องมีเกณฑ์อย่างน้อย 1 ข้อ" : "ลบเกณฑ์"} onClick={() => removeCriterion(c)} style={{ border: "none", background: "#fee2e2", color: "#b91c1c", borderRadius: 8, padding: "0.25rem 0.55rem", cursor: criteria.length <= 1 ? "not-allowed" : "pointer", fontFamily: "inherit", fontSize: "0.78rem", fontWeight: 700, whiteSpace: "nowrap", opacity: criteria.length <= 1 ? 0.5 : 1 }}><Trash2 size={12} /> ลบ</button>
                  </div>
                )}
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: "0.45rem", marginTop: "0.7rem", flexWrap: "wrap" }}>
            <input value={criterionDraft.label} onChange={event => setCriterionDraft(current => ({ ...current, label: event.target.value }))} placeholder="ชื่อเกณฑ์ใหม่ เช่น ห้องน้ำ/อ่างล้างมือ" aria-label="ชื่อเกณฑ์ใหม่" style={{ ...small, flex: "1 1 180px" }} />
            <input value={criterionDraft.hint} onChange={event => setCriterionDraft(current => ({ ...current, hint: event.target.value }))} onKeyDown={event => { if (event.key === "Enter") addCriterion(); }} placeholder="คำอธิบาย (ไม่บังคับ)" aria-label="คำอธิบายเกณฑ์ใหม่" style={{ ...small, flex: "2 1 240px" }} />
            <button type="button" onClick={addCriterion} disabled={criteria.length >= CLEANING_CRITERIA_LIMIT} style={{ ...btnPrimary, flex: "none", padding: "0.45rem 1rem", background: "linear-gradient(90deg, #008CFF, #3EBFFB)", color: "#fff", cursor: "pointer" }}><Plus size={15} /> เพิ่มเกณฑ์</button>
          </div>
        </Card>
      )}

      {tab === "rooms" && (
        <Card>
          <div style={{ fontWeight: 800, color: "#233862", marginBottom: "0.6rem" }}>ทะเบียนห้องเรียนและพื้นที่รับผิดชอบ</div>
          <div style={{ display: "flex", gap: "0.45rem", marginBottom: "0.8rem", flexWrap: "wrap" }}>
            <input value={newRoom} onChange={event => setNewRoom(event.target.value)} onKeyDown={event => { if (event.key === "Enter") addRoom(); }} placeholder="ชื่อห้อง เช่น ป.1/1" aria-label="ชื่อห้องใหม่" style={{ ...small, flex: "1 1 200px" }} />
            <button type="button" onClick={addRoom} style={{ ...btnPrimary, flex: "none", padding: "0.45rem 1rem", background: "linear-gradient(90deg, #008CFF, #3EBFFB)", color: "#fff", cursor: "pointer" }}><Plus size={15} /> เพิ่มห้องเรียน</button>
          </div>
          {rooms.length === 0 ? <div style={{ color: "#94a3b8" }}>ยังไม่มีห้องเรียนในทะเบียน</div> : (
            <div style={{ display: "grid", gap: "0.55rem" }}>
              {rooms.map(room => (
                <div key={room.id} style={{ border: "1px solid #E4EEF8", borderRadius: 14, padding: "0.65rem 0.8rem", display: "grid", gap: "0.45rem" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    {roomEdit?.id === room.id ? (
                      <>
                        <input autoFocus value={roomEdit.name} onChange={event => setRoomEdit({ id: room.id, name: event.target.value })} onKeyDown={event => { if (event.key === "Enter") renameRoom(); if (event.key === "Escape") setRoomEdit(null); }} aria-label={`ชื่อใหม่ของห้อง ${room.name}`} style={{ ...small, flex: 1, padding: "0.3rem 0.5rem" }} />
                        <button type="button" onClick={renameRoom} style={{ ...btnPrimary, flex: "none", padding: "0.25rem 0.6rem", fontSize: "0.78rem", background: "linear-gradient(90deg, #008CFF, #3EBFFB)", color: "#fff", cursor: "pointer" }}><Save size={12} /> บันทึก</button>
                        <button type="button" onClick={() => setRoomEdit(null)} style={{ ...btnSecondary, flex: "none", padding: "0.25rem 0.6rem", fontSize: "0.78rem" }}>ยกเลิก</button>
                      </>
                    ) : (
                      <>
                        <strong style={{ color: "#233862", flex: 1 }}>{room.name}</strong>
                        <button type="button" onClick={() => setRoomEdit({ id: room.id, name: room.name })} style={{ border: "none", background: "#EAF5FF", color: "#0072D9", borderRadius: 8, padding: "0.25rem 0.55rem", cursor: "pointer", fontFamily: "inherit", fontSize: "0.78rem", fontWeight: 700 }}><Pencil size={12} /> เปลี่ยนชื่อ</button>
                      </>
                    )}
                    <button type="button" onClick={() => removeRoom(room)} style={{ border: "none", background: "#fee2e2", color: "#b91c1c", borderRadius: 8, padding: "0.25rem 0.55rem", cursor: "pointer", fontFamily: "inherit", fontSize: "0.78rem", fontWeight: 700 }}><Trash2 size={12} /> ลบห้อง</button>
                  </div>
                  <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap", alignItems: "center" }}>
                    <span style={{ fontSize: "0.78rem", color: "#596068" }}>พื้นที่รับผิดชอบ:</span>
                    {room.areas.length === 0 && <span style={{ fontSize: "0.78rem", color: "#94a3b8" }}>ยังไม่กำหนด</span>}
                    {room.areas.map(area => (areaEdit?.roomId === room.id && areaEdit.from === area ? (
                      <span key={area} style={{ display: "inline-flex", gap: "0.25rem", alignItems: "center" }}>
                        <input autoFocus value={areaEdit.to} onChange={event => setAreaEdit({ ...areaEdit, to: event.target.value })} onKeyDown={event => { if (event.key === "Enter") renameArea(); if (event.key === "Escape") setAreaEdit(null); }} aria-label={`ชื่อใหม่ของพื้นที่ ${area}`} style={{ ...small, width: 140, padding: "0.2rem 0.45rem", fontSize: "0.8rem" }} />
                        <button type="button" aria-label="บันทึกชื่อพื้นที่" onClick={renameArea} disabled={busy} style={{ border: "none", background: "#008CFF", color: "#fff", borderRadius: 8, padding: "0.2rem 0.4rem", cursor: "pointer", display: "inline-flex" }}><Save size={12} /></button>
                        <button type="button" aria-label="ยกเลิก" onClick={() => setAreaEdit(null)} style={{ border: "none", background: "#f1f5f9", color: "#596068", borderRadius: 8, padding: "0.2rem 0.4rem", cursor: "pointer", display: "inline-flex" }}><X size={12} /></button>
                      </span>
                    ) : (
                      <span key={area} style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem", background: "#EAF5FF", color: "#0072D9", borderRadius: 999, padding: "0.15rem 0.3rem 0.15rem 0.6rem", fontSize: "0.8rem", fontWeight: 700 }}>
                        {area}
                        <button type="button" aria-label={`เปลี่ยนชื่อพื้นที่ ${area}`} title="เปลี่ยนชื่อ" onClick={() => setAreaEdit({ roomId: room.id, from: area, to: area })} style={{ border: "none", background: "transparent", color: "#0072D9", cursor: "pointer", padding: 0, display: "inline-flex" }}><Pencil size={11} /></button>
                        <button type="button" aria-label={`ลบพื้นที่ ${area}`} onClick={() => removeArea(room, area)} style={{ border: "none", background: "transparent", color: "#0072D9", cursor: "pointer", padding: 0, display: "inline-flex" }}><X size={12} /></button>
                      </span>
                    )))}
                  </div>
                  <div style={{ display: "flex", gap: "0.3rem", flexWrap: "wrap", alignItems: "center" }}>
                    {CLEANING_AREA_PRESETS.filter(area => !room.areas.includes(area)).map(area => <button key={area} type="button" onClick={() => addArea(room, area)} style={{ border: "1px dashed #8FD0FF", background: "#fff", color: "#0072D9", borderRadius: 999, padding: "0.12rem 0.55rem", fontSize: "0.75rem", cursor: "pointer", fontFamily: "inherit" }}>+ {area}</button>)}
                    <input value={areaDrafts[room.id] || ""} onChange={event => setAreaDrafts(current => ({ ...current, [room.id]: event.target.value }))} onKeyDown={event => { if (event.key === "Enter") addArea(room, areaDrafts[room.id]); }} placeholder="พื้นที่อื่น ๆ" aria-label={`เพิ่มพื้นที่ให้ ${room.name}`} style={{ ...small, width: 150, padding: "0.25rem 0.5rem", fontSize: "0.8rem" }} />
                    <button type="button" onClick={() => addArea(room, areaDrafts[room.id])} style={{ ...btnSecondary, flex: "none", padding: "0.25rem 0.6rem", fontSize: "0.78rem" }}>เพิ่ม</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {zoom && (
        <div role="dialog" aria-modal="true" onClick={() => setZoom("")} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.75)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem", cursor: "zoom-out" }}>
          <img src={zoom} alt="รูปขยาย" style={{ maxWidth: "100%", maxHeight: "90vh", borderRadius: 12 }} />
        </div>
      )}
      {confirmBox && (
        <div role="alertdialog" aria-modal="true" aria-label={confirmBox.title} onClick={() => setConfirmBox(null)} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.55)", zIndex: 1001, display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem" }}>
          <div onClick={event => event.stopPropagation()} style={{ background: "#fff", borderRadius: 16, padding: "1.1rem 1.2rem", maxWidth: 420, width: "100%", boxShadow: "0 12px 40px rgba(15,23,42,0.3)", display: "grid", gap: "0.6rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontWeight: 800, color: "#b91c1c", fontSize: "1.05rem" }}><Trash2 size={18} /> {confirmBox.title}</div>
            <div style={{ color: "#334155", fontSize: "0.9rem" }}>{confirmBox.text}</div>
            <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end", marginTop: "0.3rem" }}>
              <button type="button" autoFocus onClick={() => setConfirmBox(null)} style={{ ...btnSecondary, flex: "none", padding: "0.5rem 1rem" }}>ยกเลิก</button>
              <button type="button" onClick={() => { const action = confirmBox.onConfirm; setConfirmBox(null); action(); }} style={{ ...btnPrimary, flex: "none", padding: "0.5rem 1rem", background: "#dc2626", color: "#fff", cursor: "pointer" }}><Trash2 size={15} /> {confirmBox.confirmLabel}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── ดูแผนสอนแทน (ครูทุกคนดูได้ · อ่านอย่างเดียว ยกเว้นความเห็นผู้บริหาร) ──────────────
// เลือกครู → สัปดาห์ → วัน → คาบ (ค่าเริ่มต้น = วันนี้) · ดึงตารางสอนของครูคนนั้นมาแสดงคาบของวันที่เลือก
// แสดงเฉพาะชื่อ/กลุ่มสาระของครู ไม่ดึงเงินเดือนหรือผลประเมินใด ๆ · บันทึกหลังสอนแสดงเฉพาะผู้บริหาร
function substituteDefaultDay() {
  const today = todayISO();
  const dow = new Date(`${today}T00:00:00`).getDay();
  const weekStart = defaultPlanWeek();
  if (weekStart !== mondayOf(today)) return { weekStart, day: 1 }; // ศุกร์หลัง 18:00–อาทิตย์ → วันจันทร์ถัดไป
  return { weekStart, day: dow }; // เสาร์–อาทิตย์ → วันจันทร์ถัดไป
}

function SubstitutePlanView({ employees, currentUser }) {
  const isAdmin = isExecutiveUser(currentUser);
  const canSeeTestTeacher = isTestTeacher(currentUser);
  const teachers = (employees || [])
    .filter(emp => emp?.id && (!isTestTeacher(emp) || canSeeTestTeacher))
    .map(emp => ({ id: emp.id, name: emp.name || "", department: emp.department || "" })) // ใช้เฉพาะชื่อ/กลุ่มสาระ
    .sort((a, b) => a.name.localeCompare(b.name, "th"));
  // ผู้ใช้ที่ถูกซ่อนจากรายชื่อรวม (เช่น ครูทดลองระบบ) ยังดูแผนของตัวเองได้
  if (currentUser?.id && !teachers.some(emp => String(emp.id) === String(currentUser.id))) teachers.unshift({ id: currentUser.id, name: `${currentUser.name || "ตัวเอง"} (ตัวเอง)`, department: "" });
  const initial = substituteDefaultDay();
  const [teacherId, setTeacherId] = useState("");
  const [weekStart, setWeekStart] = useState(initial.weekStart);
  const [day, setDay] = useState(initial.day);
  const [periodNo, setPeriodNo] = useState("");
  const [timetable, setTimetable] = useState([]);
  const [timetableError, setTimetableError] = useState("");
  const [row, setRow] = useState(null);
  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [drafts, setDrafts] = useState({});
  const date = shiftDateKey(weekStart, day - 1);

  useEffect(() => {
    if (!teacherId) { setTimetable([]); return undefined; }
    let active = true;
    setTimetableError("");
    fetchTimetableRows(teacherId)
      .then(rows => { if (active) setTimetable(rows); })
      .catch(err => { if (active) { setTimetable([]); setTimetableError(err.message || "โหลดตารางสอนไม่สำเร็จ"); } });
    return () => { active = false; };
  }, [teacherId]);

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

  const dayPlanPeriods = (plan?.periods || []).filter(period => period.teach_date === date);
  const periods = dayPlanPeriods
    .filter(period => !periodNo || String(period.period_no) === periodNo)
    .sort((a, b) => a.period_no - b.period_no);
  const daySlots = timetable.filter(row => Number(row.day_of_week) === day).sort((a, b) => a.period - b.period);
  const slotOf = no => daySlots.find(row => Number(row.period) === Number(no));
  const periodChoices = [...new Set([...daySlots.map(row => Number(row.period)), ...dayPlanPeriods.map(period => Number(period.period_no))])].filter(Boolean).sort((a, b) => a - b);
  const chip = active => ({ border: `1px solid ${active ? "#008CFF" : "#d6e4f2"}`, background: active ? "linear-gradient(135deg, #008CFF, #0072D9)" : "#fff", color: active ? "#fff" : "#233862", borderRadius: 10, padding: "0.35rem 0.65rem", fontWeight: 700, fontSize: "0.82rem", cursor: "pointer", fontFamily: "inherit", textAlign: "left", minHeight: 40 });
  const teacher = teachers.find(emp => String(emp.id) === String(teacherId));

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
        <div style={{ fontSize: "1.05rem", fontWeight: 800, color: "#233862", marginBottom: "0.75rem" }}>ดูแผนสอนแทน</div>
        <div style={periodGrid}>
          <Field label="ครูเจ้าของแผน">
            <select aria-label="ครูเจ้าของแผน" value={teacherId} onChange={event => { setTeacherId(event.target.value); setPeriodNo(""); }} style={periodSelect}>
              <option value="">-- เลือกครู --</option>
              {teachers.map(emp => <option key={emp.id} value={emp.id}>{emp.name}{emp.department ? ` — ${emp.department}` : ""}</option>)}
            </select>
          </Field>
          <Field label="วัน">
            <select aria-label="วันที่สอนแทน" value={day} onChange={event => { setDay(Number(event.target.value)); setPeriodNo(""); }} style={periodSelect}>
              {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{formatThaiDateKey(shiftDateKey(weekStart, n - 1))}</option>)}
            </select>
          </Field>
          <Field label="คาบ">
            <select aria-label="คาบ" value={periodNo} onChange={event => setPeriodNo(event.target.value)} style={periodSelect}>
              <option value="">ทุกคาบของวัน</option>
              {(periodChoices.length ? periodChoices : TIMETABLE_PERIODS).map(n => <option key={n} value={String(n)}>คาบที่ {n}{slotOf(n) ? ` · ${timetableSlotLabel(slotOf(n))}` : ""}</option>)}
            </select>
          </Field>
        </div>
        <div style={{ marginTop: "0.75rem" }}>
          <WeekSwitcher weekStart={weekStart} onChange={value => { setWeekStart(value); setPeriodNo(""); }} />
        </div>
        {teacherId && (
          <div style={{ marginTop: "0.75rem", display: "grid", gap: "0.4rem" }}>
            <div style={{ fontSize: "0.82rem", fontWeight: 800, color: "#233862" }}>ตารางสอน {formatThaiDateKey(date)}</div>
            {timetableError ? <div style={{ fontSize: "0.8rem", color: "#b45309" }}>⚠️ {timetableError}</div> : daySlots.length === 0 ? (
              <div style={{ fontSize: "0.8rem", color: "#94a3b8" }}>ครูคนนี้ยังไม่ได้กรอกตารางสอนของวัน{DAY_NAMES[day]}</div>
            ) : (
              <div role="group" aria-label="คาบในตารางสอน" style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
                <button type="button" aria-pressed={!periodNo} onClick={() => setPeriodNo("")} style={chip(!periodNo)}>ทุกคาบ</button>
                {daySlots.map(row => (
                  <button key={row.id} type="button" aria-pressed={periodNo === String(row.period)} onClick={() => setPeriodNo(String(row.period))} style={chip(periodNo === String(row.period))}>
                    คาบ {row.period}{row.start_time ? ` (${clockLabel(row.start_time)})` : ""} · {timetableSlotLabel(row) || "-"}
                    {dayPlanPeriods.some(period => Number(period.period_no) === Number(row.period) && periodHasDetail(period)) ? " ✓" : ""}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        <div style={{ fontSize: "0.8rem", color: "#64748b", marginTop: "0.6rem" }}>ดูได้อย่างเดียว เฉพาะเจ้าของแผนเท่านั้นที่แก้ไขแผนได้ · ✓ = คาบที่มีแผนแล้ว{isAdmin ? " · ผู้บริหารเขียนความเห็นท้ายบันทึกหลังสอนได้" : ""}</div>
      </Card>
      {error && <ErrorBox>{error}</ErrorBox>}
      {message && <div style={{ background: "#ecfdf5", border: "1px solid #bbf7d0", borderRadius: "10px", padding: "0.75rem 1rem", color: "#166534", fontWeight: 700 }}>{message}</div>}
      {!teacherId ? null : loading ? (
        <Card><div style={{ textAlign: "center", color: "#64748b", padding: "1.5rem" }}>กำลังโหลดแผน...</div></Card>
      ) : periods.length === 0 ? (
        <Card><div style={{ textAlign: "center", color: "#64748b", padding: "1.5rem" }}>{teacher?.name || "ครู"} ยังไม่มีแผน{periodNo ? `คาบที่ ${periodNo} ` : ""}ของ{formatThaiDateKey(date)}</div></Card>
      ) : (
        <Card>
          <div style={{ fontWeight: 800, color: "#233862", marginBottom: "0.6rem" }}>แผนของ {teacher?.name} · {formatThaiDateKey(date)}</div>
          <div style={{ display: "grid", gap: "0.5rem" }}>
            {periods.map(period => (
              <SupervisionPeriodRead
                key={period.id}
                period={period}
                defaultOpen={periods.length === 1}
                hidePostNote={!isAdmin}
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
  { key: "substitute", label: "ดูแผนสอนแทน" },
  { key: "roll", label: "เช็คชื่อนักเรียน/สถิติ" },
  ...ACADEMIC_EXTRA_TABS,
];

function AcademicPage({ employees, currentUser, planFocus = null }) {
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
                style={{ flex: "0 0 auto", minWidth: "max-content", minHeight: 44, border: "none", borderRadius: 10, padding: "0.55rem 0.9rem", background: active ? "linear-gradient(135deg, #008CFF, #0072D9)" : "transparent", color: active ? "#fff" : "#475569", fontWeight: 800, fontFamily: "inherit", fontSize: "0.92rem", cursor: "pointer", whiteSpace: "nowrap" }}
              >
                {index + 1}. {item.label}
              </button>
            );
          })}
        </div>
      </div>
      {tab === "plan" && <TeachingSupervisionPage employees={employees} currentUser={currentUser} planFocus={planFocus} />}
      {tab === "roll" && <StudentRollPage employees={employees} currentUser={currentUser} />}
      {tab === "substitute" && <SubstitutePlanView employees={employees} currentUser={currentUser} />}
      {tab !== "plan" && tab !== "roll" && tab !== "substitute" && <AcademicExtra tab={tab} employees={employees} currentUser={currentUser} />}
    </div>
  );
}

function StudentRollPage({ employees, currentUser }) {
  const [view, setView] = useState("overview");
  if (!isExecutiveUser(currentUser)) return <StudentRollTeacher currentUser={currentUser} />;
  const tabBtn = (key, label) => (
    <button type="button" onClick={() => setView(key)} aria-pressed={view === key} style={{ ...btnSecondary, flex: "none", minHeight: 40, fontWeight: 800, background: view === key ? "linear-gradient(135deg, #008CFF, #0072D9)" : "#fff", color: view === key ? "#fff" : "#233862", border: view === key ? "none" : "1px solid #cbd5e1" }}>{label}</button>
  );
  return (
    <div style={{ display: "grid", gap: "0.9rem", minWidth: 0 }}>
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        {tabBtn("overview", "ภาพรวมทุกห้อง")}
        {tabBtn("proxy", "เช็คชื่อแทนครูประจำชั้น")}
      </div>
      {view === "proxy" ? <StudentRollProxy employees={employees} currentUser={currentUser} /> : <StudentRollAdmin employees={employees} />}
    </div>
  );
}

// ผู้บริหารเช็คชื่อ/เช็คนมแทนครูประจำชั้นที่ไม่มา: บันทึกลงห้องของครูคนนั้นเหมือนครูทำเอง พร้อมหมายเหตุ "บันทึกแทนโดย"
function StudentRollProxy({ employees, currentUser }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [teacherId, setTeacherId] = useState("");
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const data = dedupeRollRows(await fetchRollRows(null));
        if (active) setRows(data);
      } catch (err) {
        if (active) setError(err.message || "โหลดรายชื่อห้องไม่สำเร็จ");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);
  const options = rows
    .map(row => ({ row, book: parseRollBook(row.subject), teacher: (employees || []).find(emp => String(emp.id) === String(row.employee_id)) }))
    .filter(item => item.teacher && item.book.students.length > 0)
    .sort((a, b) => {
      const rank = name => { const t = String(name || ""); const i = ["เตรียม", "อ.", "ป.", "ม."].findIndex(p => t.startsWith(p)); return i < 0 ? 9 : i; };
      return rank(a.book.class_name) - rank(b.book.class_name) || String(a.book.class_name || "").localeCompare(String(b.book.class_name || ""), "th", { numeric: true });
    });
  const picked = options.find(item => String(item.teacher.id) === teacherId) || null;
  return (
    <div style={{ display: "grid", gap: "0.9rem", minWidth: 0 }}>
      <Card padding="0.85rem">
        <div style={{ fontWeight: 800, color: "#233862", fontSize: "1.05rem" }}>เช็คชื่อ / เช็คนม แทนครูประจำชั้น</div>
        <div style={{ color: "#64748b", fontSize: "0.82rem", marginTop: "0.25rem", lineHeight: 1.55 }}>ใช้เมื่อครูประจำชั้นไม่มาปฏิบัติงาน เลือกห้องแล้วเช็คชื่อได้ตามปกติ ข้อมูลจะบันทึกเข้าห้องของครูคนนั้นทันที (สถิติ บันทึกดื่มนม และไฟล์ส่งออกจะนับรวม) พร้อมหมายเหตุว่าบันทึกแทนโดย {currentUser?.name}</div>
        {error && <div style={{ marginTop: "0.5rem" }}><ErrorBox>{error}</ErrorBox></div>}
        <select aria-label="เลือกห้องที่จะเช็คชื่อแทน" value={teacherId} disabled={loading} onChange={event => setTeacherId(event.target.value)} style={{ ...inputStyle, marginTop: "0.65rem", width: "100%", maxWidth: 420, fontSize: "16px" }}>
          <option value="">{loading ? "กำลังโหลด..." : "— เลือกห้อง / ครูประจำชั้น —"}</option>
          {options.map(item => <option key={item.teacher.id} value={String(item.teacher.id)}>{item.book.class_name || "ไม่ระบุห้อง"} · {item.teacher.name} ({item.book.students.length} คน)</option>)}
        </select>
      </Card>
      {picked && <StudentRollTeacher key={picked.teacher.id} currentUser={picked.teacher} recordedBy={currentUser} />}
    </div>
  );
}

const rollTh = { padding: "0.3rem 0.35rem", fontWeight: 800, fontSize: "0.75rem", textAlign: "center", whiteSpace: "nowrap", borderBottom: "1px solid #e2e8f0" };
const rollTd = { padding: "0.2rem 0.35rem", textAlign: "center", verticalAlign: "middle" };

function StudentRollTeacher({ currentUser, recordedBy = null }) {
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
  const [newName, setNewName] = useState("");
  const [health, setHealth] = useState({});
  const [milk, setMilk] = useState({});
  const [milkNote, setMilkNote] = useState({});
  const rollLocalKey = recordedBy ? `hr_student_roll_proxy_${currentUser.id}` : `hr_student_roll_${currentUser.id}`;

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        setLoading(true);
        setError("");
        let rows;
        try {
          rows = await fetchRollRows(currentUser.id);
        } catch (loadErr) {
          const raw = recordedBy ? null : localStorage.getItem(`hr_student_roll_${currentUser.id}`);
          if (!raw) throw loadErr;
          const local = parseRollBook(raw);
          if (!active) return;
          setBook(local);
          setBaseline(local);
          setMarks({ ...(local.days[todayISO()]?.marks || {}) });
          setError(`โหลดจากฐานข้อมูลไม่ได้ (${loadErr.message || "เชื่อมต่อไม่สำเร็จ"}) แสดงรายชื่อที่เก็บไว้ในเครื่องนี้แทน`);
          return;
        }
        if (!active) return;
        const row = rows[0];
        let loaded = row ? parseRollBook(row.subject) : emptyRollBook();
        let localRaw = null;
        try { if (!recordedBy) localRaw = localStorage.getItem(`hr_student_roll_${currentUser.id}`); } catch { /* ignore */ }
        let localRemoved = [];
        try { const parsedLocal = JSON.parse(localRaw || "{}"); if (Array.isArray(parsedLocal.removed_ids)) localRemoved = parsedLocal.removed_ids; } catch { /* ignore */ }
        const removed = new Set([...localRemoved, ...(loaded.removed_ids || [])]);
        if (localRaw) {
          const local = parseRollBook(localRaw);
          const localNewer = rollStamp(localRaw) > rollStamp(row?.subject);
          const merged = {
            ...(localNewer ? local : loaded),
            students: mergeRollStudents(localNewer ? local.students : loaded.students, localNewer ? loaded.students : local.students).filter(student => !removed.has(student.id)),
            days: localNewer ? { ...loaded.days, ...local.days } : { ...local.days, ...loaded.days },
            removed_ids: [...removed].slice(-200),
          };
          const changed = JSON.stringify(merged.students) !== JSON.stringify(loaded.students) || Object.keys(merged.days).length !== Object.keys(loaded.days).length;
          loaded = merged;
          if (changed) {
            // ซิงก์รายชื่อ/การเช็คชื่อที่ค้างอยู่ในเครื่องขึ้น Supabase
            writeRollBook(currentUser.id, merged, row?.id || null).then(id => { if (active) setRowId(id); }).catch(() => {});
          }
        }
        const today = todayISO();
        setBook(loaded);
        setBaseline(loaded);
        setRowId(row?.id || null);
        setDate(today);
        setMarks({ ...(loaded.days[today]?.marks || {}) });
        setHealth({ ...(loaded.days[today]?.health || {}) });
        setMilk({ ...(loaded.days[today]?.milk || {}) });
        setMilkNote({ ...(loaded.days[today]?.milk_note || {}) });
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

  const persist = async (nextBook, success, keepMarks = false) => {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const id = await writeRollBook(currentUser.id, nextBook, rowId);
      setRowId(id);
      setBook(nextBook);
      setBaseline(nextBook);
      setMarks(current => ({ ...(nextBook.days[date]?.marks || {}), ...(keepMarks ? current : {}) }));
      setMessage(success);
      try { localStorage.setItem(rollLocalKey, JSON.stringify({ ...nextBook, saved_local_at: new Date().toISOString() })); } catch { /* ignore */ }
    } catch (err) {
      let kept = false;
      try { localStorage.setItem(rollLocalKey, JSON.stringify({ ...nextBook, saved_local_at: new Date().toISOString() })); kept = true; } catch { /* ignore */ }
      if (kept) { setBook(nextBook); setBaseline(nextBook); }
      setError(`${err.message || "บันทึกไม่สำเร็จ"}${kept ? " · เก็บสำรองไว้ในเครื่องนี้แล้ว (localStorage)" : ""}`);
    } finally {
      setSaving(false);
    }
  };

  const addStudent = () => {
    const name = newName.replace(/\s+/g, " ").trim().slice(0, 80);
    if (!name || saving) return;
    const current = cleanRollStudents(book.students);
    if (current.length >= STUDENT_ROLL_MAX) { setError(`เพิ่มได้ไม่เกิน ${STUDENT_ROLL_MAX} คน`); return; }
    if (current.some(student => `${student.name} ${student.surname}`.trim() === name)) { setError(`มี "${name}" ในรายชื่อแล้ว`); return; }
    const [first, ...rest] = name.split(" ");
    const maxNo = current.reduce((max, student) => Math.max(max, Number(student.number) || 0), 0);
    const student = { id: newSupervisionId(), number: String(maxNo + 1), name: first, surname: rest.join(" ") };
    setNewName("");
    persist({ ...book, students: [...current, student] }, `เพิ่ม ${name} แล้ว`, true);
  };

  const removeStudent = (student) => {
    if (saving) return;
    const label = `${student.name} ${student.surname}`.trim();
    if (!window.confirm(`ลบ ${label} ออกจากรายชื่อ? (ประวัติเช็คชื่อเดิมของคนนี้จะไม่แสดงในสถิติ)`)) return;
    setMarks(current => { const next = { ...current }; delete next[student.id]; return next; });
    persist({ ...book, removed_ids: [...new Set([...(book.removed_ids || []), student.id])].slice(-200), students: cleanRollStudents(book.students).filter(item => item.id !== student.id) }, `ลบ ${label} แล้ว`, true);
  };

  const rosterEditor = (
    <Card padding="0.85rem">
      <div style={{ fontWeight: 800, color: "#233862", fontSize: "1.05rem" }}>รายชื่อนักเรียน{className ? ` ${className}` : ""} ({namedStudents.length} คน)</div>
      <div style={{ color: "#64748b", fontSize: "0.8rem", marginTop: "0.25rem" }}>พิมพ์ชื่อ-นามสกุล แล้วกด + หรือ Enter เพื่อเพิ่มทีละคน</div>
      <form onSubmit={event => { event.preventDefault(); addStudent(); }} style={{ display: "flex", gap: "0.4rem", marginTop: "0.6rem" }}>
        <input value={newName} onChange={event => setNewName(event.target.value)} placeholder="ชื่อ นามสกุล" disabled={saving} style={{ ...inputStyle, flex: 1, minWidth: 0, fontSize: "16px" }} />
        <button type="submit" aria-label="เพิ่มนักเรียน" disabled={saving || !newName.trim()} style={{ ...btnPrimary, flex: "none", minWidth: 48, minHeight: 44, justifyContent: "center", background: "linear-gradient(135deg, #008CFF, #0072D9)", color: "#fff", cursor: saving || !newName.trim() ? "not-allowed" : "pointer" }}><Plus size={18} /></button>
      </form>
    </Card>
  );

  const saveMarks = () => {
    const students = cleanRollStudents(book.students);
    if (students.length === 0) { setError("ยังไม่มีรายชื่อ เพิ่มชื่อนักเรียนด้านบนก่อน"); return; }
    const clean = {};
    students.forEach(student => {
      if (ROLL_STATUS_VALUES.has(marks[student.id])) clean[student.id] = marks[student.id];
    });
    if (Object.keys(clean).length === 0) { setError("ติ๊กชื่อนักเรียนอย่างน้อย 1 คนก่อนบันทึก"); return; }
    const nextBook = {
      ...book,
      students,
      days: { ...book.days, [date]: { saved_at: new Date().toISOString(), marks: clean, ...(recordedBy ? { recorded_by: { id: String(recordedBy.id || ""), name: String(recordedBy.name || "").slice(0, 80) } } : {}) } },
    };
    const cleanHealth = {};
    Object.keys(clean).forEach(id => { if (clean[id] === "sick") cleanHealth[id] = cleanSickHealth(health[id]); });
    nextBook.days[date].health = cleanHealth;
    const cleanMilk = {};
    const cleanMilkNote = {};
    Object.keys(clean).forEach(id => {
      if (clean[id] === "present" || !milk[id]) return;
      cleanMilk[id] = milk[id];
      if (milk[id] === MILK_OTHER) cleanMilkNote[id] = String(milkNote[id] || "").trim().slice(0, 80);
    });
    nextBook.days[date].milk = cleanMilk;
    nextBook.days[date].milk_note = cleanMilkNote;
    const unset = students.length - Object.keys(clean).length;
    persist(nextBook, unset > 0 ? `บันทึกการเช็คชื่อแล้ว ยังไม่ติ๊ก ${unset} คน` : "บันทึกการเช็คชื่อวันนี้แล้ว");
  };

  const changeDate = (next) => {
    if (next === date) return;
    if (!sameMarks(marks, savedMarks) && !window.confirm("การเช็คชื่อที่ยังไม่บันทึกจะไม่ถูกเก็บ เปลี่ยนวันเลยหรือไม่")) return;
    setDate(next);
    setMarks({ ...(baseline.days[next]?.marks || {}) });
    setHealth({ ...(baseline.days[next]?.health || {}) });
    setMilk({ ...(baseline.days[next]?.milk || {}) });
    setMilkNote({ ...(baseline.days[next]?.milk_note || {}) });
    setMessage("");
    setError("");
  };

  // เพศ (ใช้นับ ชาย/หญิง ในแบบฟอร์มสถิติ): กดสลับ ช → ญ → ไม่ระบุ แล้วบันทึกทันที
  const toggleSex = (student) => {
    if (saving) return;
    const current = studentSex(student);
    const next = current === "M" ? "F" : current === "F" ? "" : "M";
    const students = cleanRollStudents(book.students).map(item => (item.id === student.id ? { ...item, sex: next } : item));
    persist({ ...book, students }, `${studentLabel(student)}: ${next === "M" ? "ชาย" : next === "F" ? "หญิง" : "ไม่ระบุเพศ"}`, true);
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
          {recordedBy && <div style={{ background: "#fff7ed", border: "1px solid #fdba74", borderRadius: 10, padding: "0.6rem 0.85rem", color: "#9a3412", fontWeight: 700, fontSize: "0.85rem" }}>กำลังเช็คชื่อแทน {currentUser?.name}{className ? ` (ห้อง ${className})` : ""} · บันทึกแทนโดย {recordedBy.name}</div>}
          <RollModeSwitch mode={mode} onChange={setMode} />
          {mode === "stats" ? (
            <RollStatsPanel book={book} month={month} onMonth={setMonth} title={className ? `สถิติห้อง ${className}` : "สถิติห้องของฉัน"} />
          ) : namedStudents.length === 0 ? (
            rosterEditor
          ) : (
            <>
            {rosterEditor}
            <Card padding="0.85rem">
              <div style={{ display: "grid", gap: "0.8rem", minWidth: 0 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 800, color: "#233862", fontSize: "1.05rem" }}>เช็คชื่อ{className ? ` ${className}` : ""}</div>
                    <div style={{ color: "#64748b", fontSize: "0.8rem" }}>{formatThaiDateKey(date)} · นักเรียน {namedStudents.length} คน</div>
                  </div>
                  {baseline.days[date]?.saved_at && <span style={{ background: "#dcfce7", color: "#166534", fontWeight: 800, fontSize: "0.75rem", borderRadius: 20, padding: "0.25rem 0.6rem" }}>บันทึกแล้ว {fmtTime(baseline.days[date].saved_at)}{baseline.days[date]?.recorded_by?.name ? ` · บันทึกแทนโดย ${baseline.days[date].recorded_by.name}` : ""}</span>}
                </div>
                <div style={{ color: "#64748b", fontSize: "0.84rem", lineHeight: 1.55 }}>ติ๊กช่องละ 1 อย่างต่อคน ถ้าลาป่วยจะมีช่องคัดกรองอาการให้กรอก · ถ้าไม่มาหรือลา จะมีช่องเลือกคนดื่มนมแทน · ปุ่ม ช/ญ หน้าชื่อใช้นับในแบบฟอร์มสถิติ (กดสลับได้)</div>
                <RollDateBar date={date} onChange={changeDate} />
                <RollCountChips counts={counts} />
                <div style={{ overflowX: "auto", minWidth: 0, border: "1px solid #e2e8f0", borderRadius: 8 }}>
                  <table style={{ width: "100%", minWidth: 380, borderCollapse: "collapse", fontSize: "0.8rem" }}>
                    <thead>
                      <tr style={{ background: "#f8fafc", color: "#475569" }}>
                        <th style={rollTh}>เลขที่</th>
                        <th style={{ ...rollTh, textAlign: "left" }}>ชื่อ-นามสกุล</th>
                        <th style={rollTh}>
                          <label style={{ display: "inline-flex", alignItems: "center", gap: "0.2rem", cursor: "pointer" }} title="มาทั้งหมด">
                            <input type="checkbox" aria-label="มาทั้งหมด" disabled={saving} checked={namedStudents.length > 0 && namedStudents.every(student => marks[student.id] === "present")} onChange={event => (event.target.checked ? markAllPresent() : setMarks({}))} />มา
                          </label>
                        </th>
                        <th style={rollTh}>ลากิจ</th>
                        <th style={rollTh}>ลาป่วย</th>
                        <th style={rollTh}>ลบ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {namedStudents.map(student => {
                        const value = marks[student.id] || "";
                        const tick = status => event => setMarks(current => ({ ...current, [student.id]: event.target.checked ? status : "" }));
                        return (
                          <Fragment key={student.id}>
                            <tr style={{ borderTop: "1px solid #f1f5f9", background: value === "sick" ? "#EAF5FF" : undefined }}>
                              <td style={{ ...rollTd, color: "#94a3b8", fontWeight: 700 }}>{student.number}</td>
                              <td style={{ ...rollTd, textAlign: "left", fontWeight: 700, color: "#233862", whiteSpace: "nowrap", maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis" }} title={studentLabel(student)}>
                                <button type="button" onClick={() => toggleSex(student)} disabled={saving} aria-label={`เพศของ ${studentLabel(student)}`} title="กดเพื่อสลับ ชาย/หญิง" style={{ marginRight: 4, minWidth: 24, height: 20, borderRadius: 6, border: "1px solid #cbd5e1", background: studentSex(student) === "M" ? "#DCEFFF" : studentSex(student) === "F" ? "#fce7f3" : "#fff7ed", color: studentSex(student) === "M" ? "#0072D9" : studentSex(student) === "F" ? "#be185d" : "#c2410c", fontWeight: 800, fontSize: "0.7rem", cursor: "pointer", padding: "0 4px", fontFamily: "inherit" }}>{studentSex(student) === "M" ? "ช" : studentSex(student) === "F" ? "ญ" : "?"}</button>
                                {studentLabel(student)}
                              </td>
                              {["present", "personal", "sick"].map(status => (
                                <td key={status} style={rollTd}>
                                  <input type="checkbox" aria-label={`${studentLabel(student)} ${labelOf(ROLL_STATUSES, status)}`} disabled={saving} checked={value === status} onChange={tick(status)} style={{ width: 16, height: 16, cursor: "pointer" }} />
                                </td>
                              ))}
                              <td style={rollTd}>
                                <button type="button" aria-label={`ลบ ${student.name}`} onClick={() => removeStudent(student)} disabled={saving} style={{ width: 22, height: 22, border: "none", borderRadius: "50%", background: "#fee2e2", color: "#b91c1c", display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0 }}><X size={12} /></button>
                              </td>
                            </tr>
                            {value === "sick" && (
                              <tr>
                                <td colSpan={6} style={{ padding: "0 0.3rem 0.35rem" }}>
                                  <SickScreening value={health[student.id]} disabled={saving} onChange={item => setHealth(current => ({ ...current, [student.id]: item }))} />
                                </td>
                              </tr>
                            )}
                            {value && value !== "present" && (
                              <tr style={{ background: "#fffbeb" }}>
                                <td colSpan={6} style={{ padding: "0.2rem 0.4rem 0.4rem" }}>
                                  <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem", alignItems: "center", fontSize: "0.78rem" }}>
                                    <span style={{ fontWeight: 800, color: "#92400e" }}>🥛 นมของ {student.name} ใครดื่มแทน</span>
                                    <select aria-label={`ผู้ดื่มนมแทน ${studentLabel(student)}`} value={milk[student.id] || ""} disabled={saving} onChange={event => setMilk(current => ({ ...current, [student.id]: event.target.value }))} style={{ minHeight: 30, borderRadius: 8, border: "1px solid #fcd34d", fontSize: "0.8rem", fontFamily: "inherit", padding: "0 0.3rem", background: "#fff", maxWidth: "100%" }}>
                                      <option value="">— เลือก —</option>
                                      {namedStudents.filter(item => marks[item.id] === "present").map(item => <option key={item.id} value={item.id}>{item.number}. {studentLabel(item)}</option>)}
                                      <option value={MILK_OTHER}>อื่น ๆ</option>
                                      <option value={MILK_NONE}>ไม่มี (ไม่มีใครดื่มแทน)</option>
                                    </select>
                                    {milk[student.id] === MILK_OTHER && (
                                      <input aria-label={`ผู้ดื่มนมแทน (อื่น ๆ) ${studentLabel(student)}`} value={milkNote[student.id] || ""} disabled={saving} placeholder="ระบุ เช่น นักเรียนห้องอื่น / เก็บคืน" onChange={event => setMilkNote(current => ({ ...current, [student.id]: event.target.value }))} style={{ minHeight: 30, borderRadius: 8, border: "1px solid #fcd34d", fontSize: "0.8rem", fontFamily: "inherit", padding: "0 0.4rem", flex: "1 1 160px" }} />
                                    )}
                                    {milk[student.id] && milk[student.id] !== MILK_OTHER && milk[student.id] !== MILK_NONE && marks[milk[student.id]] !== "present" && <span style={{ color: "#b91c1c", fontWeight: 700 }}>คนที่เลือกไม่ได้ติ๊ก "มา"</span>}
                                  </div>
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <button type="button" onClick={saveMarks} disabled={saving} style={{ ...btnPrimary, flex: "none", width: "100%", minHeight: 48, background: "linear-gradient(135deg, #008CFF, #0072D9)", color: "#fff", cursor: saving ? "not-allowed" : "pointer" }}>
                  {saving ? <RefreshCw size={16} style={{ animation: "spin 1s linear infinite" }} /> : <Save size={16} />}
                  {saving ? "กำลังบันทึก..." : "บันทึกการเช็คชื่อ"}
                </button>
              </div>
            </Card>
            </>
          )}
        </>
      )}
      {!loading && <MilkRecordFormCard entries={[{ key: "mine", book, teacherName: currentUser?.name || "" }]} />}
    </div>
  );
}

// ─── แบบบันทึกการแจกนมให้นักเรียนดื่ม (รายห้อง/รายเดือน) ───────────────────────────────
// entries: [{ key, book, teacherName }] · มา = ขีดแดง 1 ขีด · ถูกเลือกดื่มแทน = 2 ขีด · ขาด/ลา = ไม่ขีด
function MilkRecordFormCard({ entries }) {
  const usable = (entries || []).filter(entry => (entry.book?.students || []).some(student => String(student?.name || "").trim()));
  const [key, setKey] = useState("");
  const [month, setMonth] = useState(() => todayISO().slice(0, 7));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const selected = usable.find(entry => entry.key === key) || usable[0] || null;
  const record = selected ? buildMilkRecord(selected.book, month) : null;
  const label = entry => entry.book.class_name || `ห้องของ ${entry.teacherName || "ครู"}`;
  const fileBase = record ? `บันทึกดื่มนม_${(selected.book.class_name || "ห้อง").replace(/[\\/:*?"<>|]/g, "-")}_${month}` : "";

  const downloadExcel = async () => {
    if (!record) return;
    setBusy(true);
    setError("");
    try {
      const [{ default: ExcelJS }, { default: JSZip }] = await Promise.all([import("exceljs"), import("jszip")]);
      const response = await fetch(MILK_RECORD_TEMPLATE_URL);
      if (!response.ok) throw new Error("ไม่พบไฟล์แบบฟอร์มต้นฉบับ");
      const output = await fillMilkRecordWorkbook(ExcelJS, JSZip, await response.arrayBuffer(), record, { teacherName: selected.teacherName });
      const url = URL.createObjectURL(new Blob([output], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = `${fileBase}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (err) {
      setError(err.message || "สร้างไฟล์ไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  };
  const openPrint = () => {
    if (!record) return;
    const win = window.open("", "_blank");
    if (!win) { setError("เบราว์เซอร์บล็อกหน้าต่างพิมพ์ ให้อนุญาต pop-up ก่อน"); return; }
    win.document.open();
    win.document.write(milkRecordPrintHtml(record, { teacherName: selected.teacherName }));
    win.document.close();
  };

  return (
    <Card>
      <div style={{ display: "grid", gap: "0.7rem", minWidth: 0 }}>
        <div style={{ fontWeight: 800, color: "#233862", fontSize: "1.05rem" }}>🥛 แบบบันทึกการแจกนมให้นักเรียนดื่ม (รายเดือน)</div>
        <div style={{ color: "#64748b", fontSize: "0.82rem" }}>ดึงจากการเช็คชื่อทุกวันของเดือน · มาเรียน = ขีดแดง <b style={{ color: "#dc2626" }}>/</b> · ถูกเลือกให้ดื่มนมแทนเพื่อน = <b style={{ color: "#dc2626" }}>//</b> · ขาด/ลา = ไม่ขีด · เสาร์–อาทิตย์ที่ไม่ได้เช็คชื่อ = เส้นทแยงแดงทั้งช่อง (แบบเดียวกับฟอร์มเดิม)</div>
        {error && <ErrorBox>{error}</ErrorBox>}
        {usable.length === 0 ? <div style={{ color: "#94a3b8", fontSize: "0.85rem" }}>ยังไม่มีห้องที่มีรายชื่อนักเรียน</div> : (
          <>
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "end" }}>
              {usable.length > 1 && (
                <Field label="ห้อง">
                  <select aria-label="ห้องสำหรับแบบบันทึกดื่มนม" value={selected?.key || ""} onChange={event => setKey(event.target.value)} style={{ ...periodInput, maxWidth: 260 }}>
                    {usable.map(entry => <option key={entry.key} value={entry.key}>{label(entry)}{entry.teacherName ? ` · ${entry.teacherName}` : ""}</option>)}
                  </select>
                </Field>
              )}
              <Field label="เดือน">
                <input type="month" aria-label="เดือนของแบบบันทึกดื่มนม" value={month} max={todayISO().slice(0, 7)} onChange={event => event.target.value && setMonth(event.target.value)} style={{ ...periodInput, maxWidth: 200 }} />
              </Field>
              <button type="button" onClick={downloadExcel} disabled={busy} style={{ ...btnPrimary, flex: "none", minHeight: 44, background: "linear-gradient(135deg, #16a34a, #15803d)", color: "#fff", cursor: busy ? "wait" : "pointer" }}><Download size={16} /> {busy ? "กำลังสร้างไฟล์..." : "ดาวน์โหลด Excel (แบบบันทึกดื่มนม)"}</button>
              <button type="button" onClick={openPrint} style={{ ...btnSecondary, flex: "none", minHeight: 44 }}><Printer size={16} /> พิมพ์ / บันทึก PDF</button>
            </div>
            {record && (
              <div style={{ fontSize: "0.85rem", color: "#233862" }}>
                {milkClassLine(record.className).replace(/\s+/g, " ")} · นักเรียน {record.students.length} คน{record.sheets > 1 ? ` (${record.sheets} แผ่น)` : ""} · เช็คชื่อแล้ว {record.checkedDays} วัน · นมที่ดื่มรวม {record.totalCartons} กล่อง (ดื่มแทน {record.totalSubstitutes})
              </div>
            )}
            {record && !record.className && <div style={{ color: "#b45309", fontSize: "0.8rem" }}>⚠️ ห้องนี้ยังไม่ได้ตั้งชื่อห้อง บรรทัด "ชั้น" ในแบบฟอร์มจะว่าง</div>}
            {record && record.unpicked.length > 0 && <div style={{ color: "#b45309", fontSize: "0.8rem" }}>⚠️ ยังไม่ได้เลือกผู้ดื่มนมแทน {record.unpicked.length} รายการ: {record.unpicked.slice(0, 6).map(item => `${Number(item.date.slice(8))} ${studentLabel(item.student)}`).join(", ")}{record.unpicked.length > 6 ? " ..." : ""}</div>}
            {record && record.substituteIssues.length > 0 && <div style={{ color: "#b91c1c", fontSize: "0.8rem" }}>⚠️ เลือกผู้ดื่มแทนที่ไม่ได้มาเรียน (ไม่ถูกขีด) {record.substituteIssues.length} รายการ: {record.substituteIssues.slice(0, 6).map(item => `${Number(item.date.slice(8))} ${item.drinker ? studentLabel(item.drinker) : "?"}`).join(", ")}</div>}
          </>
        )}
      </div>
    </Card>
  );
}

// ─── แบบฟอร์ม "สถิตินักเรียนมาเรียนประจำวัน" (ไฟล์ต้นฉบับของโรงเรียน) ───────────────
const STATS_PRINT_COLS = [18.5703125, 6.140625, 6.140625, 6.140625, 6.140625, 6.140625, 6.140625, 6.140625, 6.140625, 6.140625, 35.7109375];
const STATS_PRINT_ROW_PT = { 1: 21.75, 2: 21.75, 3: 21.75, 4: 15, 5: 21.75, 6: 21.75, 7: 21.75, 10: 39.75, 11: 21.75, 12: 39.75, 13: 39.75, 14: 39.75, 15: 21.75, 16: 39.75, 17: 39.75, 18: 39.75, 19: 39.75, 20: 39.75, 21: 39.75, 22: 21.75, 23: 39.75, 24: 39.75, 25: 39.75, 26: 21.75, 27: 21.75, 28: 21.75, 29: 18, 30: 21.75, 31: 21.75, 32: 19.5, 33: 21.75, 34: 21.75 };

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[char]));
}

// หน้าพิมพ์ที่จำลองแบบฟอร์มต้นฉบับ (ขนาดคอลัมน์/แถว ฟอนต์ เส้น และข้อความเหมือนไฟล์ Excel)
function studentStatsPrintHtml(stats) {
  const { groups, all } = statsTotals(stats);
  // ย่อ 85% เหมือน pageSetup scale="85" ของไฟล์ต้นฉบับ (ย่อขนาดจริง ไม่ใช้ CSS zoom เพราะ Chrome ตัดหน้าตามขนาดก่อนย่อ)
  const S = 0.85;
  const px = width => Math.round((width * 7 + 5) * S * 100) / 100;
  const pt = value => Math.round(value * S * 100) / 100;
  const cell = (value, bold = false) => `<td class="n${bold ? " b" : ""}">${value}</td>`;
  const numbers = (item, bold = false) => {
    const total = item.boys + item.girls;
    const present = item.boysPresent + item.girlsPresent;
    return cell(item.boys, bold) + cell(item.girls, bold) + cell(total, true) + cell(item.boysPresent, bold) + cell(item.girlsPresent, bold) + cell(present, true) + cell(item.boys - item.boysPresent, bold) + cell(item.girls - item.girlsPresent, bold) + cell(total - present, true);
  };
  const row = (r, label, item, { bold = false, remark = "", labelSize = 16 } = {}) => `<tr style="height:${pt(STATS_PRINT_ROW_PT[r])}pt"><td class="lab${bold ? " b" : ""}" style="font-size:${pt(labelSize)}pt">${escapeHtml(label)}</td>${numbers(item, bold)}<td class="rm">${escapeHtml(remark)}</td></tr>`;
  const level = key => stats.levels[key];
  const remarkOf = key => level(key).absent.map(entry => remarkName(entry.student)).join(" , ");
  const body = [
    row(10, "เตรียมอนุบาล", level("เตรียมอนุบาล"), { remark: remarkOf("เตรียมอนุบาล") }),
    row(11, "รวมเตรียมอนุบาล", groups["เตรียมอนุบาล"], { bold: true }),
    ...["อ.1", "อ.2", "อ.3"].map((key, index) => row(12 + index, key, level(key), { remark: remarkOf(key) })),
    row(15, "รวมก่อนประถมศึกษา", groups["ก่อนประถมศึกษา"], { bold: true }),
    ...["ป.1", "ป.2", "ป.3", "ป.4", "ป.5", "ป.6"].map((key, index) => row(16 + index, key, level(key), { remark: remarkOf(key) })),
    row(22, "รวมประถมศึกษา", groups["ประถมศึกษา"], { bold: true }),
    ...["ม.1", "ม.2", "ม.3"].map((key, index) => row(23 + index, key, level(key), { remark: remarkOf(key) })),
    row(26, "รวมมัธยมศึกษาตอนต้น", groups["มัธยมศึกษาตอนต้น"], { bold: true, labelSize: 15 }),
    row(27, "รวมทั้งสิ้น", all, { bold: true }),
  ].join("");
  return `<!doctype html><html lang="th"><head><meta charset="utf-8"><title>สถิตินักเรียนมาเรียนประจำวัน ${escapeHtml(stats.date)}</title>
<style>
/* ฟอนต์ต้นฉบับ Angsana New (ถ้าเครื่องมี) · ถ้าไม่มีใช้ Sarabun ย่อขนาดให้กว้างใกล้ Angsana */
@font-face { font-family: "FormAngsana"; font-weight: 400; src: local("Angsana New"), local("AngsanaNew"), local("AngsanaUPC"); }
@font-face { font-family: "FormAngsana"; font-weight: 700; src: local("Angsana New Bold"), local("AngsanaNew-Bold"), local("AngsanaUPC Bold"); }
@font-face { font-family: "FormSarabun"; font-weight: 400; size-adjust: 72%; unicode-range: U+02D7, U+0303, U+0331, U+0E01-0E5B, U+200C-200D, U+25CC; src: url(https://fonts.gstatic.com/s/sarabun/v17/DtVjJx26TKEr37c9aAFJn2QN.woff2) format("woff2"); }
@font-face { font-family: "FormSarabun"; font-weight: 700; size-adjust: 72%; unicode-range: U+02D7, U+0303, U+0331, U+0E01-0E5B, U+200C-200D, U+25CC; src: url(https://fonts.gstatic.com/s/sarabun/v17/DtVmJx26TKEr37c9YK5sik8s6zDX.woff2) format("woff2"); }
@font-face { font-family: "FormSarabun"; font-weight: 400; size-adjust: 72%; unicode-range: U+0000-00FF, U+2000-206F; src: url(https://fonts.gstatic.com/s/sarabun/v17/DtVjJx26TKEr37c9aBVJnw.woff2) format("woff2"); }
@font-face { font-family: "FormSarabun"; font-weight: 700; size-adjust: 72%; unicode-range: U+0000-00FF, U+2000-206F; src: url(https://fonts.gstatic.com/s/sarabun/v17/DtVmJx26TKEr37c9YK5silss6w.woff2) format("woff2"); }
@page { size: A4 portrait; margin: 0 0.4cm 0 1cm; }
* { box-sizing: border-box; }
body { margin: 0; font-family: "FormAngsana", "FormSarabun", sans-serif; color: #000; }
.page { width: ${STATS_PRINT_COLS.reduce((sum, width) => sum + px(width), 0)}px; margin: 0 auto; }
table { border-collapse: collapse; table-layout: fixed; width: 100%; }
td { padding: 0 2px; overflow: hidden; white-space: nowrap; font-size: ${pt(16)}pt; line-height: 1; vertical-align: middle; }
.title td { text-align: center; font-weight: bold; font-size: ${pt(18)}pt; }
.grid td { border: 1px solid #000; }
.head td { text-align: center; font-weight: bold; }
.n { text-align: center; } .b { font-weight: bold; }
.lab { text-align: center; }
.rm { font-size: ${pt(11)}pt; white-space: normal; text-align: left; line-height: 1.05; }
.sig td { font-size: ${pt(16)}pt; }
</style></head><body><div class="page"><table>
<colgroup>${STATS_PRINT_COLS.map(width => `<col style="width:${px(width)}px">`).join("")}</colgroup>
<tbody class="title">
<tr style="height:${pt(21.75)}pt"><td colspan="11">สถิตินักเรียนมาเรียนประจำวัน</td></tr>
<tr style="height:${pt(21.75)}pt"><td colspan="11">โรงเรียนนิมิตศึกษา&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; อำเภอไพศาลี&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; จังหวัดนครสวรรค์</td></tr>
<tr style="height:${pt(21.75)}pt"><td colspan="11">${escapeHtml(formDateLine(stats.date))}</td></tr>
<tr style="height:${pt(15)}pt"><td colspan="11"></td></tr>
</tbody>
<tbody class="grid">
<tr class="head" style="height:${pt(21.75)}pt"><td rowspan="3">ระดับชั้น/ห้องเรียน</td><td colspan="3">จำนวนนักเรียนเต็ม</td><td colspan="3">จำนวนนักเรียน</td><td colspan="3">จำนวนนักเรียน</td><td rowspan="2">หมายเหตุ</td></tr>
<tr class="head" style="height:${pt(21.75)}pt"><td colspan="3">เต็มตามบัญชีเรียกชื่อ</td><td colspan="3">มาเรียน</td><td colspan="3">ไม่มาเรียน</td></tr>
<tr class="head" style="height:${pt(21.75)}pt"><td>ชาย</td><td>หญิง</td><td>รวม</td><td>ชาย</td><td>หญิง</td><td>รวม</td><td>ชาย</td><td>หญิง</td><td>รวม</td><td>(รายชื่อนักเรียนไม่มาเรียน)</td></tr>
${body}
</tbody>
<tbody class="sig">
<tr style="height:${pt(21.75)}pt"><td class="b">หมายเหตุ</td><td colspan="10"></td></tr>
<tr style="height:${pt(18)}pt"><td colspan="11"></td></tr>
<tr style="height:${pt(21.75)}pt"><td colspan="6"></td><td colspan="5">ลงชื่อ...............................................................ผู้รวบรวม</td></tr>
<tr style="height:${pt(21.75)}pt"><td colspan="6"></td><td colspan="5" style="white-space:pre">                                     ( นางสาวเบญจวรรณ   เจิมแหล่ )</td></tr>
<tr style="height:${pt(19.5)}pt"><td colspan="11"></td></tr>
<tr style="height:${pt(21.75)}pt"><td colspan="6"></td><td colspan="5" style="white-space:pre">           ลงชื่อ.....................................................ผู้อำนวยการโรงเรียน</td></tr>
<tr style="height:${pt(21.75)}pt"><td colspan="6"></td><td colspan="5" style="white-space:pre">                                   (   นางศศิธร    มีสมสืบ  )</td></tr>
</tbody></table></div>
<script>window.onload = () => (document.fonts ? document.fonts.ready : Promise.resolve()).then(() => setTimeout(() => window.print(), 200));</script>
</body></html>`;
}

function StudentStatsFormCard({ rows, employees }) {
  const [date, setDate] = useState(todayISO);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const books = (rows || []).map(row => parseRollBook(row.subject));
  const stats = buildStudentStats(books, date);
  const { all } = statsTotals(stats);
  const unknownSex = STUDENT_STATS_LEVELS.flatMap(level => stats.levels[level.key].unknownSex.map(student => `${level.key} ${studentLabel(student)}`));
  const unchecked = STUDENT_STATS_LEVELS.filter(level => stats.levels[level.key].unchecked > 0).map(level => level.key);
  const milkRows = STUDENT_STATS_LEVELS.flatMap(level => stats.levels[level.key].milk.map(item => ({ level: level.key, ...item })));
  const milkLabel = item => item.choice === "student" ? studentLabel(item.drinker) : item.choice === "other" ? `อื่น ๆ${item.note ? `: ${item.note}` : ""}` : item.choice === "none" ? "ไม่มี" : "ยังไม่เลือก";
  const statusLabel = status => ({ personal: "ลากิจ", sick: "ลาป่วย", absent: "ขาด", "": "ยังไม่เช็ค" }[status] ?? status);

  const downloadExcel = async () => {
    setBusy(true);
    setError("");
    try {
      const [{ default: ExcelJS }, { default: JSZip }] = await Promise.all([import("exceljs"), import("jszip")]);
      const response = await fetch(STUDENT_STATS_TEMPLATE_URL);
      if (!response.ok) throw new Error("ไม่พบไฟล์แบบฟอร์มต้นฉบับ");
      const output = await fillStudentStatsWorkbook(ExcelJS, JSZip, await response.arrayBuffer(), stats);
      const url = URL.createObjectURL(new Blob([output], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = `สถิตินักเรียนมาเรียน_${date}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (err) {
      setError(err.message || "สร้างไฟล์ไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  };

  const openPrint = () => {
    const win = window.open("", "_blank");
    if (!win) { setError("เบราว์เซอร์บล็อกหน้าต่างพิมพ์ ให้อนุญาต pop-up ก่อน"); return; }
    win.document.open();
    win.document.write(studentStatsPrintHtml(stats));
    win.document.close();
  };

  return (
    <Card>
      <div style={{ display: "grid", gap: "0.7rem", minWidth: 0 }}>
        <div style={{ fontWeight: 800, color: "#233862", fontSize: "1.05rem" }}>แบบฟอร์มสถิตินักเรียนมาเรียนประจำวัน</div>
        <div style={{ color: "#64748b", fontSize: "0.82rem" }}>ดึงจากการเช็คชื่อของทุกห้องตามวันที่เลือก · ไฟล์ Excel เติมลงสำเนาแบบฟอร์มต้นฉบับของโรงเรียน (เลย์เอาต์/สูตร/ฟอนต์เดิม)</div>
        {error && <ErrorBox>{error}</ErrorBox>}
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "end" }}>
          <Field label="วันที่">
            <input type="date" value={date} max={todayISO()} onChange={event => setDate(event.target.value || todayISO())} style={{ ...periodInput, maxWidth: 200 }} />
          </Field>
          <button type="button" onClick={downloadExcel} disabled={busy} style={{ ...btnPrimary, flex: "none", minHeight: 44, background: "linear-gradient(135deg, #16a34a, #15803d)", color: "#fff", cursor: busy ? "wait" : "pointer" }}><Download size={16} /> {busy ? "กำลังสร้างไฟล์..." : "ดาวน์โหลด Excel (แบบฟอร์ม)"}</button>
          <button type="button" onClick={openPrint} style={{ ...btnSecondary, flex: "none", minHeight: 44 }}><Printer size={16} /> พิมพ์ / บันทึก PDF</button>
        </div>
        <div style={{ fontSize: "0.85rem", color: "#233862" }}>รวมทั้งสิ้น: เต็ม {all.boys + all.girls} คน (ช {all.boys} ญ {all.girls}) · มา {all.boysPresent + all.girlsPresent} · ไม่มา {all.boys + all.girls - all.boysPresent - all.girlsPresent}</div>
        {stats.unmapped.length > 0 && <div style={{ color: "#b45309", fontSize: "0.8rem" }}>⚠️ ห้องที่จับคู่ชั้นในแบบฟอร์มไม่ได้ (ตั้งชื่อห้องเป็น เช่น ป.2/1, อ.1, ม.3, เตรียมอนุบาล): {stats.unmapped.join(", ")}</div>}
        {unknownSex.length > 0 && <div role="alert" style={{ color: "#b45309", background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 8, padding: "0.5rem 0.7rem", fontSize: "0.8rem" }}><div style={{ fontWeight: 800 }}>⚠️ ยังไม่ระบุเพศ {unknownSex.length} คน (ไม่ถูกนับในช่อง ชาย/หญิง) — ระบบเดาจากคำนำหน้าชื่อไม่ได้</div><div style={{ marginTop: 2 }}>แก้ได้ที่หน้าเช็คชื่อนักเรียน: กดปุ่มหน้าชื่อ (? → ช → ญ) ให้ถูกต้อง</div><ul style={{ margin: "0.3rem 0 0", paddingLeft: "1.2rem", maxHeight: 160, overflowY: "auto" }}>{unknownSex.map((label, idx) => <li key={idx}>{label}</li>)}</ul></div>}
        {unchecked.length > 0 && <div style={{ color: "#b45309", fontSize: "0.8rem" }}>⚠️ ชั้นที่ยังไม่ได้เช็คชื่อวันนี้ (นับเป็นไม่มาเรียน): {unchecked.join(", ")}</div>}
        <details>
          <summary style={{ cursor: "pointer", fontWeight: 800, color: "#92400e" }}>🥛 เช็คนม: คนไม่มา/ลา และผู้ดื่มแทน ({milkRows.length})</summary>
          {milkRows.length === 0 ? <div style={{ color: "#94a3b8", fontSize: "0.82rem", padding: "0.4rem 0" }}>ไม่มีนักเรียนไม่มาเรียน</div> : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem", marginTop: "0.4rem" }}>
              <thead><tr style={{ background: "#fffbeb" }}><th style={rollTh}>ชั้น</th><th style={{ ...rollTh, textAlign: "left" }}>นักเรียน</th><th style={rollTh}>สถานะ</th><th style={{ ...rollTh, textAlign: "left" }}>ผู้ดื่มนมแทน</th></tr></thead>
              <tbody>{milkRows.map(item => (
                <tr key={`${item.level}-${item.student.id}`} style={{ borderTop: "1px solid #f1f5f9" }}><td style={rollTd}>{item.level}</td><td style={{ ...rollTd, textAlign: "left" }}>{studentLabel(item.student)}</td><td style={rollTd}>{statusLabel(item.status)}</td><td style={{ ...rollTd, textAlign: "left", color: item.choice ? "#233862" : "#b91c1c" }}>{milkLabel(item)}</td></tr>
              ))}</tbody>
            </table>
          )}
        </details>
      </div>
    </Card>
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
                          <span style={{ display: "block", fontWeight: 800, color: "#233862" }}>{item.book.class_name || "ไม่ระบุห้อง"}</span>
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
      <StudentStatsFormCard rows={rows} employees={employees} />
      <MilkRecordFormCard entries={(rows || []).map(row => ({ key: String(row.id), book: parseRollBook(row.subject), teacherName: (employees || []).find(employee => employee.id === row.employee_id)?.name || "" }))} />
      <Card>
        <div style={{ display: "grid", gap: "0.8rem", minWidth: 0 }}>
          <div>
            <div style={{ fontWeight: 800, color: "#233862", fontSize: "1.05rem" }}>อัปรายชื่อจาก Excel</div>
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
              <div style={{ fontWeight: 800, color: "#233862" }}>พบ {incoming.length} คน{classHint ? ` · ไฟล์ระบุ ${classHint}` : ""}</div>
              <div style={{ maxHeight: 200, overflow: "auto", border: "1px solid #e2e8f0", borderRadius: 10, minWidth: 0 }}>
                {incoming.map(student => (
                  <div key={student.id} style={{ display: "flex", gap: "0.45rem", padding: "0.35rem 0.65rem", borderTop: "1px solid #f1f5f9", minWidth: 0 }}>
                    <span style={{ fontWeight: 800, color: "#64748b", flex: "0 0 auto" }}>{student.number}</span>
                    <span style={{ fontWeight: 700, color: "#233862", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{studentLabel(student)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <button type="button" onClick={saveRoster} disabled={saving} style={{ ...btnPrimary, flex: "none", width: "100%", maxWidth: 280, minHeight: 48, background: "linear-gradient(135deg, #008CFF, #0072D9)", color: "#fff", cursor: saving ? "not-allowed" : "pointer" }}>
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
              <div style={{ fontWeight: 800, fontSize: "1.05rem", color: "#233862" }}>{selected.book.class_name || "ไม่ระบุห้อง"}</div>
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
                      <span style={{ display: "block", fontWeight: 800, color: "#233862" }}>{item.book.class_name || "ไม่ระบุห้อง"}</span>
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
    const lateCount = employeeAttendance.filter(row => checkLate(row.check_in, wsOf(row.employee_id, settings?.work_start), settings?.late_grace_minutes)?.late).length;
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
          th { background: #EAF5FF; font-weight: 700; }
          .section-title { background: #f8fafc; color: #233862; font-size: 12px; text-align: left; }
          .count { text-align: center; }
          .money { background: #ecfdf5; color: #166534; font-weight: 700; text-align: right; }
          .deduct { background: #fef2f2; color: #b91c1c; }
          .total { background: #fff7ed; color: #c2410c; font-weight: 800; }
          .additional { background: #EAF5FF; color: #0072D9; font-weight: 800; }
        </style>
      </head>
      <body>
        <table>
          <tr>
            <th colspan="19" style="font-size:15px;background:#DCEFFF;">สรุปเงินเดือน เดือน ${escapeHtml(month)}</th>
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
    border: "1px solid #8FD0FF",
    borderRadius: "6px",
    padding: "0.38rem 0.42rem",
    fontFamily: "inherit",
    fontSize: "0.75rem",
    fontWeight: 700,
    color: "#233862",
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
  const payrollTotalCell = { ...payrollCellBase, background: "#DCEFFF", color: "#0072D9", fontWeight: 900 };
  const payrollRefundCell = { ...payrollCellBase, background: "#fff7ed", color: "#c2410c", fontWeight: 900 };
  const payrollAdditionalCell = { ...payrollCellBase, background: "#EAF5FF", color: "#0072D9", fontWeight: 900 };
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
          <div style={{ fontSize: "0.95rem", fontWeight: 800, color: "#233862" }}>{title}</div>
          <div style={{ fontSize: "0.75rem", color: "#64748b", marginTop: "0.15rem" }}>ช่องสีขาวกรอกแก้ได้ ช่องสีอื่นเป็นสูตรคำนวณอัตโนมัติ</div>
        </div>
        <div style={{ fontSize: "0.75rem", color: "#0072D9", fontWeight: 800 }}>{rows.length} คน</div>
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
                  background: index <= 8 ? "#fef3c7" : index <= 15 ? "#fed7aa" : index === 16 ? "#B8E0FF" : "#f8fafc",
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
                    <div style={{ fontWeight: 800, color: "#233862" }}>{row.emp.name}</div>
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
                      <td style={{ ...payrollCellBase, background: "#EAF5FF", color: "#0072D9", fontWeight: 900, textAlign: "center" }}>{row.attendanceDays} วัน</td>
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
          <h1 style={{ margin: 0, fontSize: "1.35rem", color: "#233862", letterSpacing: 0 }}>สรุปเงินเดือน</h1>
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
            <div key={label} style={{ padding: "0.55rem 0.7rem", borderRight: index < 4 ? "1px solid #cbd5e1" : "none", background: index === 3 ? "#fff7ed" : index === 4 ? "#EAF5FF" : "#f8fafc", minWidth: 135 }}>
              <div style={{ color: "#64748b", fontSize: "0.68rem" }}>{label}</div>
              <div style={{ color: index === 3 ? "#c2410c" : index === 4 ? "#0072D9" : "#233862", fontSize: "0.95rem", fontWeight: 900 }}>{value}</div>
            </div>
          ))}
        </div>
        {(loadingMonthData || monthDataError) && <div style={{ borderTop: "1px solid #cbd5e1", padding: "0.4rem 0.7rem", color: monthDataError ? "#b91c1c" : "#0072D9", fontSize: "0.72rem" }}>{monthDataError || "กำลังซิงก์ข้อมูลเดือนนี้..."}</div>}
      </div>

      <div className="payroll-insight-grid" style={{ marginBottom: "0.65rem" }}>
        <section style={{ border: "1px solid #cbd5e1", background: "#fff", minWidth: 300 }}>
          <div style={{ padding: "0.42rem 0.65rem", background: "#DCEFFF", borderBottom: "1px solid #94a3b8", fontSize: "0.78rem", fontWeight: 900 }}>รายละเอียด {selectedEmployee?.name || "-"}</div>
          {selectedSummaryRow ? (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.72rem" }}><tbody>
              {[
                ["ประเภท", selectedSummaryRow.payType === "monthly" ? "รายเดือน" : "รายวัน"],
                [selectedSummaryRow.baseSalaryLabel, formatMoney(selectedSummaryRow.baseSalary)],
                ["เงินเข้า บช", formatMoney(selectedSummaryRow.bankDeposit)],
                ["สอนแทน / ขับรถ-เวร", `${formatMoney(selectedSummaryRow.substitutePay)} / ${formatMoney(selectedSummaryRow.dutyOrDriverPay)}`],
                ["หักลา / หักรวม", `${formatMoney(selectedSummaryRow.leaveDeductions)} / ${formatMoney(selectedSummaryRow.deductions)}`],
                [selectedSummaryRow.additionalPayment > 0 ? "ต้องรับเพิ่ม" : "ยอดคืน", formatMoney(selectedSummaryRow.additionalPayment || selectedSummaryRow.refundAmount)],
              ].map(([label, value], index) => <tr key={label}><td style={{ padding: "0.29rem 0.55rem", color: "#475569", borderBottom: index < 5 ? "1px solid #e2e8f0" : "none" }}>{label}</td><td style={{ padding: "0.29rem 0.55rem", textAlign: "right", fontWeight: 800, color: index === 5 ? "#c2410c" : "#233862", borderBottom: index < 5 ? "1px solid #e2e8f0" : "none", whiteSpace: "nowrap" }}>{value}</td></tr>)}
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
        <StatCard stat={{ label: "คนที่มีข้อมูลเดือนนี้", value: summaryRows.length, icon: Users, color: "#008CFF", bg: "#EAF5FF", trend: month }} />
        <StatCard stat={{ label: "เงินเข้า บช รวม", value: formatMoney(totalBankDeposit), icon: Building2, color: "#7c3aed", bg: "#f5f3ff", trend: "ยอดที่โอนเข้าก่อน" }} />
        <StatCard stat={{ label: "ยอดสุทธิหลังคำนวณ", value: formatMoney(totalPayout), icon: Calendar, color: "#059669", bg: "#ecfdf5", trend: `${totalAttendanceDays} วันทำงานรวม` }} />
        <StatCard stat={{ label: "ยอดคืนรวม", value: formatMoney(totalRefund), icon: DollarSign, color: "#d97706", bg: "#fff7ed", trend: "ยอดสุดท้าย" }} />
        <StatCard stat={{ label: "ต้องรับเพิ่มรวม", value: formatMoney(totalAdditionalPayment), icon: Plus, color: "#008CFF", bg: "#EAF5FF", trend: "ยอดที่ต้องจ่ายเพิ่ม" }} />
      </div>

      <Card>
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div style={{ background: "#EAF5FF", border: "1px solid #B8E0FF", borderRadius: "12px", padding: "0.85rem", color: "#0072D9", fontSize: "0.85rem" }}>
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
              <button onClick={handleSave} disabled={loadingConfig || loadingMonthData || Boolean(monthDataError) || saving} style={{ ...btnPrimary, flex: "none", padding: "0.8rem 1rem", background: saved ? "#16a34a" : "linear-gradient(135deg, #008CFF, #0072D9)", color: "#fff", cursor: loadingConfig || loadingMonthData || monthDataError || saving ? "not-allowed" : "pointer" }}>
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
          <div style={{ fontSize: "1rem", fontWeight: 800, color: "#233862", marginBottom: "0.3rem" }}>ข้อมูลเงินเดือนรายคน</div>
          <div style={{ fontSize: "0.8rem", color: "#64748b", marginBottom: "0.9rem" }}>ค่าหลักดึงจากเมนูพนักงาน และแก้เฉพาะเดือนนี้ได้ด้านล่าง</div>
          {selectedEmployee && (
            <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "12px", padding: "0.9rem", display: "flex", flexDirection: "column", gap: "0.9rem" }}>
              <div>
                <div style={{ fontWeight: 800, color: "#233862", fontSize: "1rem" }}>{selectedEmployee.name}</div>
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
              <div style={{ background: "#EAF5FF", border: "1px solid #B8E0FF", borderRadius: "10px", padding: "0.75rem", color: "#0072D9", fontSize: "0.82rem", fontWeight: 700 }}>
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
                          border: `1px solid ${checked ? "#008CFF" : "#cbd5e1"}`,
                          background: checked ? "#EAF5FF" : "#fff",
                          color: checked ? "#0072D9" : "#475569",
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
          <div style={{ fontSize: "1rem", fontWeight: 800, color: "#233862", marginBottom: "0.3rem" }}>ตั้งค่าอัตราเวรที่คิดเงิน</div>
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
          <div style={{ fontSize: "1rem", fontWeight: 800, color: "#233862", marginBottom: "0.3rem" }}>สรุปของคนที่เลือก</div>
          <div style={{ fontSize: "0.8rem", color: "#64748b", marginBottom: "0.9rem" }}>ดึงจากข้อมูลลงเวลา ลา และเวรของเดือนนี้อัตโนมัติ</div>
          {!selectedSummaryRow ? (
            <div style={{ color: "#94a3b8", fontSize: "0.84rem" }}>ยังไม่มีข้อมูลของพนักงานคนนี้</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "0.75rem" }}>
                <div style={{ background: "#EAF5FF", borderRadius: "12px", padding: "0.85rem" }}>
                  <div style={{ fontSize: "0.72rem", color: "#0072D9", fontWeight: 700 }}>มาทำงาน</div>
                  <div style={{ fontSize: "1.25rem", color: "#233862", fontWeight: 800 }}>{selectedSummaryRow.attendanceDays} วัน</div>
                </div>
                <div style={{ background: "#f5f3ff", borderRadius: "12px", padding: "0.85rem" }}>
                  <div style={{ fontSize: "0.72rem", color: "#7c3aed", fontWeight: 700 }}>ยอดคืน</div>
                  <div style={{ fontSize: "1.25rem", color: "#233862", fontWeight: 800 }}>{formatMoney(selectedSummaryRow.refundAmount)}</div>
                </div>
                <div style={{ background: "#EAF5FF", borderRadius: "12px", padding: "0.85rem" }}>
                  <div style={{ fontSize: "0.72rem", color: "#0072D9", fontWeight: 700 }}>ต้องรับเพิ่ม</div>
                  <div style={{ fontSize: "1.25rem", color: "#233862", fontWeight: 800 }}>{formatMoney(selectedSummaryRow.additionalPayment)}</div>
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
                  <div style={{ fontWeight: 800, color: "#008CFF" }}>{selectedSummaryRow.substituteCount} คาบ / {formatMoney(selectedSummaryRow.substitutePay)}</div>
                </div>
                {selectedSummaryRow.payType === "monthly" && (
                  <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "12px", padding: "0.8rem" }}>
                    <div style={{ fontSize: "0.75rem", color: "#64748b", marginBottom: "0.2rem" }}>เงินเดือนตาม PDF</div>
                    <div style={{ fontWeight: 800, color: "#233862" }}>{formatMoney(selectedSummaryRow.bankGrossSalary)}</div>
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
                  <div style={{ color: "#233862", fontWeight: 800 }}>{formatMoney(selectedSummaryRow.grossPay)}</div>
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
              <div style={{ fontSize: "1rem", fontWeight: 800, color: "#233862" }}>ข้อมูลเงินเดือนที่บันทึกไว้แล้ว</div>
              <div style={{ fontSize: "0.8rem", color: "#64748b" }}>แสดงตามสูตรปัจจุบัน เทียบกับ snapshot เดือน {month}</div>
            </div>
            <div style={{ background: "#EAF5FF", borderRadius: "999px", padding: "0.35rem 0.8rem", color: "#0072D9", fontWeight: 700, fontSize: "0.8rem" }}>
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
                    <div style={{ fontWeight: 800, color: "#233862" }}>{value}</div>
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
              <div style={{ fontSize: "1rem", fontWeight: 800, color: "#233862" }}>รายการที่ใช้คิดเงินเดือน</div>
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
                  { label: "สอนแทน", detail: `${selectedSummaryRow.substituteCount} คาบ`, value: formatMoney(selectedSummaryRow.substitutePay), color: "#008CFF" },
                  { label: "ปรับเพิ่ม", detail: selectedSummaryRow.adjustmentNote || "รายการพิเศษ", value: formatMoney(selectedSummaryRow.adjustmentAdd), color: "#16a34a" },
                  { label: "หักลา", detail: selectedSummaryRow.payType === "daily" ? `ลา ${selectedSummaryRow.recordedLeaveDays.toFixed(1)} วัน ไม่ได้ค่าจ้างวันนั้นและไม่หักซ้ำ` : `${selectedSummaryRow.leaveDeductDays.toFixed(1)} วัน x ${formatMoney(MONTHLY_LEAVE_DEDUCT_RATE)}${selectedSummaryRow.medicalLeaveDays > 0 ? `, ใบนัดหมอ ${selectedSummaryRow.medicalLeaveDays.toFixed(1)} วันไม่หัก` : ""}`, value: `- ${formatMoney(selectedSummaryRow.leaveDeductions)}`, color: "#dc2626" },
                  { label: "หัก 3% ตาม PDF", detail: selectedSummaryRow.payType === "monthly" ? `${formatMoney(selectedSummaryRow.bankGrossSalary)} - ${formatMoney(selectedSummaryRow.bankDeposit)}` : "เฉพาะรายเดือน", value: `- ${formatMoney(selectedSummaryRow.monthlyRecurringDeduction)}`, color: "#dc2626" },
                  { label: "หักเพิ่ม", detail: selectedSummaryRow.adjustmentNote || "รายการพิเศษ", value: `- ${formatMoney(selectedSummaryRow.adjustmentDeduct)}`, color: "#dc2626" },
                  { label: "รวมเข้า บช หลังคำนวณ", detail: selectedSummaryRow.payType === "daily" ? "ค่าจ้างรายวัน + เวรรถ + สอนแทน + ค่าขับรถ" : "รับจริง - หัก 3% - หักลา + เวรรถ + สอนแทน + ค่าขับรถ", value: formatMoney(selectedSummaryRow.realSalary), color: "#15803d" },
                  { label: "เงินเข้า บช ตาม PDF", detail: "ยอดที่หัก 3% มาแล้ว", value: formatMoney(selectedSummaryRow.bankDeposit), color: "#c2410c" },
                ].filter(Boolean).map(item => (
                  <div key={item.label} style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: "0.75rem", alignItems: "center", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "12px", padding: "0.85rem 1rem" }}>
                    <div>
                      <div style={{ fontSize: "0.82rem", fontWeight: 700, color: "#233862" }}>{item.label}</div>
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
                <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: "0.75rem", alignItems: "center", background: "#EAF5FF", border: "1px solid #B8E0FF", borderRadius: "12px", padding: "0.95rem 1rem" }}>
                  <div>
                    <div style={{ fontSize: "0.84rem", fontWeight: 800, color: "#0072D9" }}>ต้องรับเพิ่ม</div>
                    <div style={{ fontSize: "0.76rem", color: "#008CFF", marginTop: "0.18rem" }}>MAX(0, รวมเข้า บช หลังคำนวณ - เงินเข้า บช ตาม PDF)</div>
                  </div>
                  <div style={{ fontSize: "1.05rem", fontWeight: 900, color: "#008CFF", whiteSpace: "nowrap" }}>{formatMoney(selectedSummaryRow.additionalPayment)}</div>
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
          <div style={{ background: "#EAF5FF", border: "1px solid #B8E0FF", borderRadius: "10px", padding: "0.75rem", fontSize: "0.85rem", color: "#0072D9" }}>
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

          <button onClick={handleSave} disabled={saving} style={{ padding: "0.85rem", borderRadius: "10px", border: "none", background: saved ? "#16a34a" : "linear-gradient(135deg, #008CFF, #0072D9)", color: "#fff", fontWeight: 700, fontSize: "0.95rem", cursor: saving ? "not-allowed" : "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem" }}>
            {saving ? <RefreshCw size={18} style={{ animation: "spin 1s linear infinite" }} /> : saved ? <CheckCircle size={18} /> : <Save size={18} />}
            {saving ? "กำลังบันทึก..." : saved ? "บันทึกแล้ว!" : "บันทึกการตั้งค่า"}
          </button>
        </div>
      </Card>
      <WorkHourOverridesCard onRefresh={onRefresh} />
    </div>
  );
}

function WorkHourOverridesCard({ onRefresh }) {
  const [people, setPeople] = useState([]);
  const [rows, setRows] = useState({});
  const [form, setForm] = useState({ employee_id: "", start: "07:40", end: "15:40" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const reload = async () => {
    setRows({ ...(await loadWorkHourOverrides()) });
    const { data } = await supabase.from("employees").select("id, name, role, username").order("name");
    setPeople((data || []).filter(emp => emp.role !== "admin" && !isTestTeacher(emp)));
  };
  useEffect(() => { reload(); }, []);
  const save = async () => {
    if (!form.employee_id || !form.start || !form.end) { setMsg("เลือกครูและกรอกเวลาให้ครบ"); return; }
    if (form.start >= form.end) { setMsg("เวลาเลิกต้องหลังเวลาเข้า"); return; }
    setBusy(true); setMsg("");
    const payload = { employee_id: form.employee_id, day_of_week: 0, period: 0, class_room: WORK_HOURS_ROOM, start_time: `${form.start}:00`, end_time: `${form.end}:00`, subject: JSON.stringify({ kind: "work_hours", updated_at: new Date().toISOString() }) };
    const existing = rows[String(form.employee_id)]?.id;
    const result = existing
      ? await supabase.from("teaching_schedule").update(payload).eq("id", existing)
      : await supabase.from("teaching_schedule").insert(payload);
    setBusy(false);
    if (result.error) { setMsg(`บันทึกไม่สำเร็จ: ${result.error.message}`); return; }
    setMsg("บันทึกแล้ว");
    await reload();
    onRefresh?.();
  };
  const remove = async (employeeId) => {
    const id = rows[String(employeeId)]?.id;
    if (!id || !window.confirm("ลบเวลาเฉพาะของครูคนนี้ กลับไปใช้เวลาโรงเรียน?")) return;
    setBusy(true);
    const { error } = await supabase.from("teaching_schedule").delete().eq("id", id);
    setBusy(false);
    setMsg(error ? `ลบไม่สำเร็จ: ${error.message}` : "ลบแล้ว กลับไปใช้เวลาโรงเรียน");
    await reload();
    onRefresh?.();
  };
  const nameOf = id => people.find(emp => String(emp.id) === String(id))?.name || id;
  const btn = { padding: "0.35rem 0.75rem", borderRadius: 8, border: "1px solid #cbd5e1", background: "#fff", cursor: "pointer", fontFamily: "inherit" };
  return (
    <div style={{ marginTop: "1rem" }}>
    <Card>
      <div style={{ display: "flex", flexDirection: "column", gap: "1rem", maxWidth: 560 }}>
        <div style={{ fontWeight: 800 }}>เวลาทำงานรายบุคคล (กรณีต่างหาก)</div>
        <div style={{ fontSize: "0.8rem", color: "#64748b" }}>ครูที่ตั้งไว้ตรงนี้ ระบบจะคิดมาสาย/กลับก่อน และหักคะแนนลงเวลาสาย ตามเวลานี้แทนเวลาโรงเรียน</div>
        {Object.keys(rows).length === 0 ? <div style={{ fontSize: "0.85rem", color: "#94a3b8" }}>ยังไม่มีครูที่ตั้งเวลาเฉพาะ</div> : Object.entries(rows).map(([id, item]) => (
          <div key={id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.5rem", padding: "0.5rem 0.75rem", border: "1px solid #e2e8f0", borderRadius: 8 }}>
            <span>{nameOf(id)} · เข้า {item.start || "-"} น. · เลิก {item.end || "-"} น.</span>
            <span style={{ display: "flex", gap: "0.4rem" }}>
              <button disabled={busy} onClick={() => setForm({ employee_id: id, start: item.start || "07:40", end: item.end || "15:40" })} style={btn}>แก้</button>
              <button disabled={busy} onClick={() => remove(id)} style={{ ...btn, color: "#b91c1c" }}>ลบ</button>
            </span>
          </div>
        ))}
        <Field label="ครู">
          <select value={form.employee_id} onChange={e => setForm(f => ({ ...f, employee_id: e.target.value }))} style={inputStyle}>
            <option value="">เลือกครู</option>
            {people.map(emp => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
          </select>
        </Field>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
          <Field label="เวลาเข้า"><input type="time" value={form.start} onChange={e => setForm(f => ({ ...f, start: e.target.value }))} style={inputStyle} /></Field>
          <Field label="เวลาเลิก"><input type="time" value={form.end} onChange={e => setForm(f => ({ ...f, end: e.target.value }))} style={inputStyle} /></Field>
        </div>
        {msg && <div style={{ fontSize: "0.85rem", color: msg.startsWith("บันทึกแล้ว") || msg.startsWith("ลบแล้ว") ? "#15803d" : "#b91c1c" }}>{msg}</div>}
        <button disabled={busy} onClick={save} style={{ padding: "0.75rem", borderRadius: 10, border: "none", background: "linear-gradient(135deg, #008CFF, #0072D9)", color: "#fff", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>{busy ? "กำลังบันทึก..." : "บันทึกเวลาเฉพาะครู"}</button>
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
            <div style={{ fontSize: "1.05rem", fontWeight: 800, color: "#233862" }}>ศูนย์รวมเงินเดือนและค่าใช้จ่าย</div>
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
              border: `1.5px solid ${tab === item.key ? "#008CFF" : "#e2e8f0"}`,
              background: tab === item.key ? "#EAF5FF" : "#fff",
              color: tab === item.key ? "#0072D9" : "#475569",
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
            <StatCard stat={{ label: "ยอดสุทธิหลังคำนวณ", value: loadingPayroll ? "..." : formatMoney(payrollRealSalaryTotal), icon: DollarSign, color: "#008CFF", bg: "#EAF5FF", trend: month }} />
            <StatCard stat={{ label: "ค่าใช้จ่ายอื่น", value: formatMoney(manualExpenseTotal), icon: FileText, color: "#dc2626", bg: "#fef2f2", trend: "ค่าไฟ ค่าน้ำ และอื่นๆ" }} />
            <StatCard stat={{ label: "รายรับรวม", value: formatMoney(incomeTotal), icon: TrendingUp, color: "#16a34a", bg: "#ecfdf5", trend: "กรอกในเครื่องคิด" }} />
            <StatCard stat={{ label: "ยอดคืนรวม", value: formatMoney(payrollRefundTotal), icon: Building2, color: "#d97706", bg: "#fff7ed", trend: "จาก payroll" }} />
          </div>

          <Card padding="0">
            <div style={{ padding: "1rem 1.25rem", borderBottom: "1px solid #f1f5f9" }}>
              <div style={{ fontSize: "1rem", fontWeight: 800, color: "#233862" }}>เงินเดือนที่บันทึกแล้วในเดือนนี้</div>
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
                        <td style={{ padding: "0.75rem 0.9rem", fontWeight: 800, color: "#233862" }}>{row.employees?.name || "-"}</td>
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
              <div style={{ fontSize: "1rem", fontWeight: 800, color: "#233862" }}>เครื่องคิดรายรับรายจ่ายโรงเรียน</div>
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
    <div style={{ fontFamily: "'Anuphan', 'Sarabun', 'Noto Sans Thai', sans-serif", background: "#F3F8FD", minHeight: "100vh" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Anuphan:wght@300;400;500;600;700&family=Sarabun:wght@400;600;700&display=swap'); * { box-sizing: border-box; margin: 0; padding: 0; } @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      <header style={{ position: "sticky", top: 0, zIndex: 100, background: "#fff", borderBottom: "1px solid #e2e8f0", height: 64, display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem", padding: "0 1rem", boxShadow: "0 4px 24px rgba(0,140,255,0.08)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", minWidth: 0 }}>
          <div style={{ width: 38, height: 38, borderRadius: "12px", background: "linear-gradient(135deg, #16a34a, #0f766e)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <DollarSign size={20} color="#fff" />
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ color: "#233862", fontWeight: 900, fontSize: "1rem", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>เว็บคิดเงินเดือน</div>
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
          <div style={{ fontSize: "2rem", fontWeight: 800, color: "#233862", lineHeight: 1 }}>{stat.value}</div>
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
  const [evalFocus, setEvalFocus] = useState("");
  const [planFocus, setPlanFocus] = useState(null);
  const landedRef = useRef("");
  useEffect(() => {
    // ผู้บริหาร/แอดมิน เข้าสู่ระบบแล้วไปหน้าผู้บริหารก่อน (ครั้งเดียวต่อการล็อกอิน)
    const id = currentUser ? String(currentUser.id) : "";
    if (!id) { landedRef.current = ""; return; }
    if (landedRef.current === id) return;
    landedRef.current = id;
    if (isExecutiveUser(currentUser) && !window.location.hash) setActivePage("execDash");
  }, [currentUser]);
  const [showAttendance, setShowAttendance] = useState(false);
  const [attMode, setAttMode] = useState("in");
  const [allActivityLog, setActivityLog] = useState([]);
  const [allEmployees, setEmployees] = useState([]);
  const [allLeaves, setLeaves] = useState([]);
  const [allOutings, setOutings] = useState([]);
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
        if (isSalaryOwner(currentUser)) {
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
    if ((activePage === "payrollStandalone" || activePage === "finance") && !isSalaryOwner(currentUser)) {
      window.history.replaceState(null, "", window.location.pathname);
      setActivePage("dashboard");
      return;
    }
    if ((activePage === "teacherEval" || activePage === "execDash" || activePage === "cleaningDuty") && !isExecutiveUser(currentUser)) {
      setActivePage("dashboard");
      return;
    }
    if (currentPage && !currentPage.executiveOnly && !currentPage.roles.includes(hasAdminRights(currentUser) ? "admin" : "employee")) {
      if (window.location.hash === "#finance" || window.location.hash === "#payroll") {
        window.history.replaceState(null, "", window.location.pathname);
      }
      setActivePage("dashboard");
    }
  }, [currentUser, activePage]);

  // ตรวจว่าเครื่องนี้ยังอยู่ใน 3 เครื่องล่าสุด ตอนเปิดหน้า ตอนกลับมาที่แท็บ และทุก 5 นาที (ลดการดึงข้อมูล)
  const currentUserId = currentUser?.id;
  useEffect(() => {
    if (!currentUserId) return;
    let stopped = false;
    const check = async () => {
      const result = await touchLoginSession(currentUserId);
      if (stopped || result !== "kicked") return;
      try { sessionStorage.setItem("hr_kicked_msg", KICKED_MESSAGE); } catch { /* ignore */ }
      localStorage.removeItem("hr_user");
      setCurrentUser(null);
      setActivePage("dashboard");
    };
    check();
    const t = setInterval(() => { if (document.visibilityState !== "hidden") check(); }, 300000);
    const onVisible = () => { if (document.visibilityState === "visible") check(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { stopped = true; clearInterval(t); document.removeEventListener("visibilitychange", onVisible); };
  }, [currentUserId]);

  useEffect(() => { const t = setInterval(() => setCurrentTime(new Date()), 1000); return () => clearInterval(t); }, []);
  useEffect(() => { if (currentUser) fetchData(); }, [currentUser]);

  async function fetchData() {
    setLoading(true);
    const { data: emps } = await supabase.from("employees").select("*").order("name");
    if (emps) setEmployees(emps);
    // ครูทั่วไปเห็นแค่ประวัติของตัวเอง + รายชื่อคนที่ลงเวลาวันนี้ จึงไม่ต้องดึงประวัติทั้งโรงเรียน (ลด egress)
    let att = null;
    if (hasAdminRights(currentUser)) {
      ({ data: att } = await supabase.from("attendance").select("*, employees(name, department)").order("check_in", { ascending: false }).limit(5000));
    } else {
      const [{ data: mine }, { data: today }] = await Promise.all([
        supabase.from("attendance").select("*, employees(name, department)").eq("employee_id", currentUser.id).order("check_in", { ascending: false }).limit(5000),
        supabase.from("attendance").select("*, employees(name, department)").gte("check_in", `${todayISO()}T00:00:00+07:00`).order("check_in", { ascending: false }),
      ]);
      if (mine || today) {
        const byId = new Map();
        [...(mine || []), ...(today || [])].forEach(row => byId.set(String(row.id), row));
        att = [...byId.values()].sort((x, y) => String(y.check_in || "").localeCompare(String(x.check_in || "")));
      }
    }
    if (att) setActivityLog(att);
    // ไม่ดึง document_url ที่เป็นรูป base64 มาทั้งก้อน (ใหญ่มาก) ดึงเฉพาะลิงก์ http สั้น ๆ ส่วนรูป base64 โหลดตอนกดดู
    const [{ data: lvs }, { data: lvDocs }, { data: lvInline }] = await Promise.all([
      supabase.from("leaves").select(`${LEAVE_LIST_COLUMNS}, employees!leaves_employee_id_fkey(name, department), substitute:employees!leaves_substitute_id_fkey(name)`).order("created_at", { ascending: false }),
      supabase.from("leaves").select("id, document_url").like("document_url", "http%"),
      supabase.from("leaves").select("id").like("document_url", "data:%"),
    ]);
    if (lvs) {
      const docMap = new Map((lvDocs || []).map(row => [String(row.id), row.document_url]));
      const inlineIds = new Set((lvInline || []).map(row => String(row.id)));
      setLeaves(lvs.map(row => ({ ...row, document_url: docMap.get(String(row.id)) || (inlineIds.has(String(row.id)) ? LAZY_LEAVE_DOCUMENT : "") })));
    }
    const { data: outs } = await supabase.from("outings").select("*, employees(name, department)").order("out_time", { ascending: false });
    if (outs) setOutings(outs);

    await loadWorkHourOverrides();
    const { data: stg } = await supabase.from("settings").select("*").eq("id", 1).single();
    if (stg) setSettings(stg);

    setLoading(false);
  }

  const handleLogout = () => {
    if (currentUser?.id) removeLoginSession(currentUser.id);
    localStorage.removeItem("hr_user");
    if (window.location.hash === "#finance" || window.location.hash === "#payroll") {
      window.history.replaceState(null, "", window.location.pathname);
    }
    setCurrentUser(null);
    setActivePage("dashboard");
  };

  if (!currentUser) return <LoginPage onLogin={setCurrentUser} />;

  const canUseTestTeacher = isTestTeacherOwner(currentUser);
  const previewTeacher = allEmployees.find(emp => isTestTeacher(emp) && emp.role !== "admin");
  const actingUser = canUseTestTeacher && teacherPreview && previewTeacher ? previewTeacher : currentUser;
  // ครูทดลองระบบมีไว้ทดสอบเท่านั้น — ไม่แสดงในรายงาน/สถิติ/รายชื่อใด ๆ (รวมถึงของผู้บริหาร)
  // ยกเว้นตอนใช้งานในฐานะครูทดลองเอง (ล็อกอินเป็น teacher.try หรือโหมดทดลองของผู้ดูแล) เพื่อให้เห็นข้อมูลตัวเอง
  const hiddenIds = isTestTeacher(actingUser) ? new Set() : new Set(allEmployees.filter(isTestTeacher).map(emp => String(emp.id)));
  const notHidden = row => !hiddenIds.has(String(row.employee_id));
  const employees = hiddenIds.size ? allEmployees.filter(emp => !hiddenIds.has(String(emp.id))) : allEmployees;
  const activityLog = hiddenIds.size ? allActivityLog.filter(notHidden) : allActivityLog;
  const leaves = hiddenIds.size ? allLeaves.filter(notHidden) : allLeaves;
  const outings = hiddenIds.size ? allOutings.filter(notHidden) : allOutings;
  const todayDateStr = todayISO();
  const isToday = (dt) => new Date(dt).toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" }) === todayDateStr;
  const todayAttendance = activityLog.filter(a => isToday(a.check_in));
  const currentlyOut = outings.filter(o => o.status === "out").length;
  const pendingLeaves = leaves.filter(l => l.status === "pending").length;
  const myAttToday = activityLog.find(a => a.employee_id === actingUser.id && isToday(a.check_in));

  const stats = hasAdminRights(actingUser) ? [
    { label: "พนักงานทั้งหมด", value: employees.length, icon: Users, color: "#008CFF", bg: "#EAF5FF", trend: "ข้อมูลจริง" },
    { label: "ลงเวลาวันนี้", value: todayAttendance.length, icon: CheckCircle, color: "#059669", bg: "#ecfdf5", trend: `${employees.length > 0 ? Math.round(todayAttendance.length / employees.length * 100) : 0}%` },
    { label: "มาสายวันนี้", value: todayAttendance.filter(a => checkLate(a.check_in, wsOf(a.employee_id, settings?.work_start), settings?.late_grace_minutes)?.late).length, icon: AlertCircle, color: "#dc2626", bg: "#fef2f2", trend: "นับเฉพาะวันนี้" },
    { label: "รออนุมัติลา", value: pendingLeaves, icon: Umbrella, color: "#d97706", bg: "#fef3c7", trend: pendingLeaves > 0 ? "ต้องดำเนินการ" : "ไม่มี" },
  ] : (() => {
    const myLateInfo = myAttToday ? checkLate(myAttToday.check_in, wsOf(myAttToday.employee_id, settings?.work_start), settings?.late_grace_minutes) : null;
    const myEarlyInfo = myAttToday?.check_out ? checkEarly(myAttToday.check_out, weOf(myAttToday.employee_id, settings?.work_end)) : null;
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
      if (!isSalaryOwner(currentUser)) {
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
    setEvalFocus("");
    setPlanFocus(null);
    if ((key === "teacherEval" || key === "execDash" || key === "cleaningDuty") && !isExecutiveUser(actingUser)) {
      setActivePage("dashboard");
      setSidebarOpen(false);
      return;
    }
    setActivePage(key);
    setSidebarOpen(false);
  };

  const visibleNavItems = navItems.filter(item => canAccessNavItem(item, actingUser));

  if (activePage === "payrollStandalone" && isSalaryOwner(currentUser)) {
    return loading ? (
      <div style={{ fontFamily: "'Anuphan', 'Sarabun', 'Noto Sans Thai', sans-serif", background: "#F3F8FD", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: "#64748b" }}>
        <style>{`@import url('https://fonts.googleapis.com/css2?family=Anuphan:wght@300;400;500;600;700&family=Sarabun:wght@400;600;700&display=swap'); @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
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

  const rail = !isMobile && desktopSidebarCollapsed;
  return (
    <div style={{ fontFamily: "'Anuphan', 'Sarabun', 'Noto Sans Thai', sans-serif", background: "#F3F8FD", minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Anuphan:wght@300;400;500;600;700&family=Sarabun:wght@400;600;700&display=swap'); * { box-sizing: border-box; margin: 0; padding: 0; } @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      <PreviewBanner />

      <header style={{ background: "#fff", borderBottom: "1px solid #E4EEF8", borderTop: "3px solid #008CFF", height: 60, display: "flex", alignItems: "center", padding: "0 1rem", gap: "0.75rem", position: "sticky", top: 0, zIndex: 100, boxShadow: "0 4px 24px rgba(0,140,255,0.08)" }}>
        <button
          onClick={() => isMobile ? setSidebarOpen(open => !open) : setDesktopSidebarCollapsed(collapsed => !collapsed)}
          title={isMobile ? "เปิดเมนู" : (desktopSidebarCollapsed ? "เปิดแถบเมนู" : "พับแถบเมนู")}
          aria-label={isMobile ? "เปิดเมนู" : (desktopSidebarCollapsed ? "เปิดแถบเมนู" : "พับแถบเมนู")}
          style={{ background: "#f1f5f9", border: "none", borderRadius: "10px", padding: "0.5rem", cursor: "pointer", color: "#475569", display: "flex", flexShrink: 0 }}
        >
          <Menu size={20} />
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", minWidth: 0, flex: isMobile ? 1 : "0 0 auto" }}>
          <div style={{ width: 34, height: 34, borderRadius: "10px", background: "linear-gradient(135deg, #008CFF, #0072D9)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Shield size={18} color="#fff" /></div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: "0.95rem", fontWeight: 800, color: "#233862", lineHeight: 1.1 }}>HR System</div>
            <div style={{ fontSize: "0.65rem", color: "#64748b", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>โรงเรียนนิมิตศึกษา</div>
          </div>
        </div>
        {!isMobile && <div style={{ flex: 1 }} />}
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginLeft: "auto" }}>
          {!isMobile && (
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: "0.85rem", fontWeight: 700, color: "#233862" }}>{actingUser.name}</div>
              <div style={{ fontSize: "0.7rem", color: "#64748b" }}>
                {actingUser.role === "admin" ? "👑 Admin" : "พนักงาน"} • {actingUser.department}
              </div>
            </div>
          )}
          {canUseTestTeacher && previewTeacher && (
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
              style={{ background: teacherPreview ? "#DCEFFF" : "#EAF5FF", border: "1.5px solid #8FD0FF", borderRadius: "10px", padding: "0.4rem 0.7rem", cursor: "pointer", color: "#0072D9", fontFamily: "inherit", fontSize: "0.78rem", fontWeight: 800, whiteSpace: "nowrap" }}
            >
              {teacherPreview ? "กลับหน้าแอดมิน" : "ดูหน้าครู"}
            </button>
          )}
          <div style={{ width: 36, height: 36, borderRadius: "50%", background: "linear-gradient(135deg, #008CFF, #FF9A3C)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700, fontSize: "0.9rem", flexShrink: 0 }}>{actingUser.name?.[0]}</div>
          <button onClick={handleLogout} title="ออกจากระบบ" style={{ background: "#fef2f2", border: "1.5px solid #fca5a5", borderRadius: "10px", padding: "0.45rem 0.65rem", cursor: "pointer", color: "#dc2626", display: "flex", alignItems: "center", gap: "0.3rem", fontFamily: "inherit", fontSize: "0.78rem", fontWeight: 600 }}>
            <LogOut size={14} />
          </button>
        </div>
      </header>

      <div style={{ display: "flex", flex: 1, position: "relative" }}>
        {/* Mobile Overlay */}
        {/* rail = desktop collapsed icon-only sidebar */}
        {isMobile && sidebarOpen && (
          <div onClick={() => setSidebarOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 90, top: 60 }} />
        )}

        <aside data-sidebar={rail ? "rail" : "full"} style={{
          width: rail ? 72 : 260,
          flexShrink: 0,
          background: "#fff",
          borderRight: "1px solid #e2e8f0",
          padding: rail ? "1rem 0.5rem" : "1rem 0.75rem",
          display: "flex",
          flexDirection: "column",
          gap: "0.35rem",
          overflowY: "auto",
          overflowX: "hidden",
          position: isMobile ? "fixed" : "sticky",
          top: 60,
          left: isMobile ? (sidebarOpen ? 0 : -280) : 0,
          height: "calc(100vh - 60px)",
          zIndex: 95,
          transition: "left 0.3s ease, width 0.25s ease, padding 0.25s ease",
          boxShadow: isMobile && sidebarOpen ? "4px 0 20px rgba(0,0,0,0.15)" : "none"
        }}>
          {!rail && <div style={{ background: "linear-gradient(135deg, #008CFF, #3EBFFB)", borderRadius: "18px", padding: "0.95rem", marginBottom: "0.75rem", textAlign: "center", boxShadow: "0 8px 22px rgba(0,140,255,0.25)" }}>
            <div style={{ fontSize: "1.6rem", fontWeight: 700, color: "#fff" }}>{currentTime.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "Asia/Bangkok" })}</div>
            <div style={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.88)" }}>{currentTime.toLocaleDateString("th-TH", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Bangkok" })}</div>
          </div>}

          {isMobile && (
            <div style={{ background: "#f8fafc", borderRadius: "10px", padding: "0.65rem", marginBottom: "0.5rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <div style={{ width: 32, height: 32, borderRadius: "50%", background: "linear-gradient(135deg, #008CFF, #FF9A3C)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700, fontSize: "0.85rem" }}>{currentUser.name?.[0]}</div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: "0.85rem", fontWeight: 700, color: "#233862", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{actingUser.name}</div>
                <div style={{ fontSize: "0.7rem", color: "#64748b" }}>{actingUser.role === "admin" ? "👑 Admin" : "พนักงาน"}</div>
              </div>
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: rail ? "1fr" : "1fr 1fr", gap: "0.5rem", marginBottom: "1rem" }}>
            <button title="เข้างาน" aria-label="เข้างาน" onClick={() => { openCheckIn(); setSidebarOpen(false); }} style={{ background: "linear-gradient(135deg, #008CFF, #0072D9)", border: "none", borderRadius: "12px", padding: "0.85rem 0.5rem", color: "#fff", fontWeight: 700, fontSize: "0.85rem", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: "0.35rem", boxShadow: "0 4px 14px rgba(0,140,255,0.3)", fontFamily: "inherit" }}>
              <LogIn size={20} /> {!rail && "เข้างาน"}
            </button>
            <button title="กลับบ้าน" aria-label="กลับบ้าน" onClick={() => { openCheckOut(); setSidebarOpen(false); }} style={{ background: "linear-gradient(90deg, #FF7106, #FF9A3C)", border: "none", borderRadius: "14px", padding: "0.85rem 0.5rem", color: "#fff", fontWeight: 700, fontSize: "0.85rem", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: "0.35rem", boxShadow: "0 4px 14px rgba(255,113,6,0.3)", fontFamily: "inherit" }}>
              <LogOut size={20} /> {!rail && "กลับบ้าน"}
            </button>
          </div>

          {visibleNavItems.map(item => {
            const Icon = item.icon;
            const isActive = activePage === item.key;
            return (
              <button key={item.key} title={rail ? item.label : undefined} aria-label={item.label} onClick={() => openNavItem(item.key)} style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: rail ? "center" : "flex-start",
                gap: "0.75rem",
                padding: rail ? "0.85rem 0" : "0.85rem 0.85rem",
                borderRadius: "12px",
                border: "none",
                background: isActive ? "linear-gradient(90deg, #008CFF, #3EBFFB)" : "transparent",
                color: isActive ? "#fff" : "#464646",
                boxShadow: isActive ? "0 6px 16px rgba(0,140,255,0.25)" : "none",
                cursor: "pointer",
                fontSize: "0.95rem",
                fontWeight: isActive ? 700 : 600,
                fontFamily: "inherit",
                textAlign: "left",
                transition: "all 0.15s",
                minHeight: 48
              }}
                onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = "#EAF5FF"; }}
                onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = "transparent"; }}
              >
                <Icon size={20} />
                {!rail && <span style={{ flex: 1 }}>{item.label}</span>}
                {!rail && isActive && <ChevronRight size={16} />}
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

                  {hasAdminRights(actingUser) && (
                    <>
                      {/* Pending Approvals */}
                      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: "1rem", marginBottom: "1.5rem" }}>
                        {/* การลารออนุมัติ */}
                        <Card>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                              <Umbrella size={18} color="#7c3aed" />
                              <div style={{ fontWeight: 700, color: "#233862", fontSize: "0.95rem" }}>การลารออนุมัติ</div>
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
                                    <div style={{ fontWeight: 600, fontSize: "0.85rem", color: "#233862" }}>{l.employees?.name}</div>
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
                              <div style={{ fontWeight: 700, color: "#233862", fontSize: "0.95rem" }}>ออกนอกสถานที่ — ขณะนี้</div>
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
                                    <div style={{ fontWeight: 600, fontSize: "0.85rem", color: "#233862" }}>{o.employees?.name}</div>
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
                            <div style={{ fontWeight: 700, color: "#233862", fontSize: "0.95rem" }}>มาสายวันนี้</div>
                          </div>
                          <span style={{ background: "#fef2f2", color: "#dc2626", fontSize: "0.72rem", fontWeight: 700, padding: "0.2rem 0.6rem", borderRadius: "20px" }}>{todayAttendance.filter(a => checkLate(a.check_in, wsOf(a.employee_id, settings?.work_start))?.late).length} คน</span>
                        </div>
                        {todayAttendance.filter(a => checkLate(a.check_in, wsOf(a.employee_id, settings?.work_start))?.late).length === 0 ? (
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
                                {todayAttendance.filter(a => checkLate(a.check_in, wsOf(a.employee_id, settings?.work_start))?.late).map((a, i) => {
                                  const li = checkLate(a.check_in, wsOf(a.employee_id, settings?.work_start));
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
                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}><Activity size={18} color="#008CFF" /><div style={{ fontWeight: 700, color: "#233862", fontSize: "0.95rem" }}>กิจกรรมล่าสุด</div></div>
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
                                    <span style={{ fontWeight: 600, color: "#233862" }}>{row.employees?.name || "-"}</span>
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
              {activePage === "finance" && isSalaryOwner(currentUser) && isSalaryOwner(actingUser) && <FinancePortal employees={employees} attendance={activityLog} leaves={leaves} settings={settings} />}
              {activePage === "report" && <ReportPage employees={employees} attendance={activityLog} leaves={leaves} outings={outings} settings={settings} />}
              {activePage === "schedule" && <SchedulePage employees={employees} currentUser={actingUser} onOpenPlan={focus => { setPlanFocus({ ...focus, at: Date.now() }); setActivePage("academic"); }} />}
              {activePage === "academic" && <AcademicPage employees={employees} currentUser={actingUser} planFocus={planFocus} />}
              {activePage === "activityPlan" && <ActivityPlanPage employees={employees} currentUser={actingUser} />}
              {activePage === "execDash" && (isExecutiveUser(actingUser) ? <ExecutiveDashboard employees={employees} leaves={leaves} settings={settings} currentUser={actingUser} onOpenEval={id => { setEvalFocus(String(id)); setActivePage("teacherEval"); }} onOpenLeave={() => openNavItem("leave")} onOpenCalendar={() => openNavItem("academicCalendar")} /> : <NoAccessCard />)}
              {activePage === "cleaningDuty" && (isExecutiveUser(actingUser) ? <CleaningDutyPage currentUser={actingUser} /> : <NoAccessCard />)}
              {activePage === "teacherEval" && (isExecutiveUser(actingUser) ? <TeacherEvalPage employees={employees} currentUser={actingUser} initialSelected={evalFocus} /> : <NoAccessCard />)}
              {activePage === "settings" && <SettingsPage settings={settings} onRefresh={fetchData} />}
              {activePage === "academicCalendar" && <AcademicCalendarWithActivities employees={employees} currentUser={actingUser} />}
              {activePage === "roomBooking" && <RoomBookingPage employees={employees} currentUser={actingUser} canManage={isExecutiveUser(actingUser) || isTestTeacherOwner(actingUser)} isTestTeacher={isTestTeacher} canSeeTestTeacher={isTestTeacher(actingUser)} />}
              {activePage === "kgShortPlan" && ((isKgTeacher(actingUser) || isExecutiveUser(actingUser)) ? <KgShortPlanPage employees={employees} currentUser={actingUser} canReview={isExecutiveUser(actingUser)} fetchStudents={fetchKgStudents} /> : <NoAccessCard />)}
            </>
          )}
        </main>
      </div>

      {showAttendance && <AttendanceModal mode={attMode} onClose={() => { setShowAttendance(false); fetchData(); }} onCheckin={() => fetchData()} employees={employees} currentUser={actingUser} settings={settings} />}
    </div>
  );
}
