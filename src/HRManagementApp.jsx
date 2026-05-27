import { useState, useEffect, useCallback } from "react";
import { createClient } from "@supabase/supabase-js";
import {
  Users, Building2, Clock, CheckCircle, XCircle, MapPin,
  Navigation, LogIn, LogOut, Settings, Bell, Search,
  ChevronDown, ChevronRight, BarChart3, FileText,
  Shield, WifiOff, RefreshCw, UserPlus, DollarSign,
  Umbrella, AlertCircle, Activity, Home, X, Edit, Trash2, Save, Phone, Mail,
  Plus, Calendar, ArrowRightLeft, ArrowLeftRight, TrendingUp, User, Lock, Eye, EyeOff, Key, Menu
} from "lucide-react";

const supabase = createClient(
  "https://iqhswfuddwltzxpggldc.supabase.co",
  "sb_publishable_D8vUfkTd2LZMnsB7W1fvIQ_a1oVeJeO"
);

const SCHOOL_LAT = 15.596741;
const SCHOOL_LNG = 100.652199;
const GEOFENCE_RADIUS = 100;

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

// คืนค่า start/end ของวันนี้ในเวลาไทยเป็น ISO timestamp
const todayRange = () => {
  const dateStr = todayISO(); // เช่น "2026-05-22"
  const start = new Date(dateStr + "T00:00:00+07:00").toISOString();
  const end = new Date(dateStr + "T23:59:59+07:00").toISOString();
  return { start, end };
};

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
    "เก่งมากครับ! 🎉",
    "วันนี้ดีเยี่ยม ✨",
    "ขยันสุดๆ เลย 👏",
    "มาเช้าเสมอ น่ายกย่อง 🌟",
    "นี่แหละ ครูตัวอย่าง 💪",
    "พลังบวกล้นเปี่ยม 🌞",
    "เริ่มวันด้วยสไตล์! 🚀",
    "วินัยดีมาก ☕",
    "Good morning! ตื่นเช้าจริงๆ 🐓",
  ],
  onTime: [
    "ตรงเวลาเป๊ะ! 👌",
    "มืออาชีพมาก 💼",
    "เป็นแบบอย่างที่ดี ✨",
    "สมบูรณ์แบบเลย 🎯",
  ],
  late: [
    "ไม่เป็นไร พรุ่งนี้เริ่มต้นใหม่ได้ 💪",
    "การจราจรติด สู้ๆ นะครับ 🚗",
    "วันนี้ตื่นยากใช่ไหม? ☕",
    "พรุ่งนี้ลองตื่นเร็วขึ้นนะ 🌅",
    "ไม่เป็นไร ทุกคนเคยสาย 🙂",
    "เข้าใจครับ ชีวิตมีหลายเรื่อง 🌈",
    "อย่ากดดันตัวเอง วันใหม่เริ่มได้ใหม่ 🌸",
    "หายใจลึกๆ พร้อมเริ่มงานนะครับ 🧘",
  ],
  leaveEarly: [
    "รีบไปธุระใช่ไหมครับ? 🏃",
    "วันนี้ยุ่งล่ะสิ 📋",
    "ดูแลสุขภาพด้วยนะครับ 💊",
    "ไปไหนต่อเอ่ย? ✈️",
    "เผื่อมีอะไรด่วน หายห่วงได้นะ 🌟",
    "ขับรถระวังตัวด้วยครับ 🚗",
    "หวังว่าทุกอย่างจะราบรื่นนะ 🙏",
  ],
  stayLate: [
    "ขอบคุณที่เสียสละเวลาเพื่อโรงเรียนนะครับ 🙏",
    "ทุ่มเทมากเลย ขอบคุณครับ ❤️",
    "ครูตัวจริงเลย น่าประทับใจ 🌟",
    "เหนื่อยมั้ย? พักเยอะๆ นะครับ 🛌",
    "ขอบคุณจากใจ ครูคนเก่ง 💝",
    "ความตั้งใจของครูสร้างอนาคตเด็ก 🌱",
    "ทำงานหนักจัง ดูแลสุขภาพด้วย 🍵",
    "หัวใจของโรงเรียนเลยครับ 💙",
  ],
  onTimeLeave: [
    "วันนี้ทำงานเสร็จเรียบร้อย เก่งมาก ✅",
    "Work-life balance ดีมากเลย ⚖️",
    "พักผ่อนให้เต็มที่นะครับ 😊",
    "เจอกันพรุ่งนี้นะครับ 👋",
  ]
};

function randomQuote(type) {
  const list = QUOTES[type] || [];
  return list[Math.floor(Math.random() * list.length)] || "";
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

const navItems = [
  { icon: Home, label: "หน้าหลัก", key: "dashboard", roles: ["admin", "employee"] },
  { icon: Users, label: "ข้อมูลพนักงาน", key: "employee", roles: ["admin"] },
  { icon: Clock, label: "ลงเวลาเข้า-ออก", key: "attendance", roles: ["admin", "employee"] },
  { icon: Calendar, label: "ตารางสอน", key: "schedule", roles: ["admin", "employee"] },
  { icon: Umbrella, label: "การลา", key: "leave", roles: ["admin", "employee"] },
  { icon: ArrowRightLeft, label: "ขอออกนอกสถานที่", key: "outing", roles: ["admin", "employee"] },
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

function Card({ children, padding = "1.25rem" }) {
  return <div style={{ background: "#fff", borderRadius: "1rem", padding, boxShadow: "0 2px 12px rgba(0,0,0,0.06)", border: "1px solid #f1f5f9" }}>{children}</div>;
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

    // 2. ถ้าเป็น admin ข้ามการเช็ค device
    if (user.role === "admin") {
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
    <div style={{ fontFamily: "'Sarabun', sans-serif", minHeight: "100vh", background: "linear-gradient(135deg, #1d4ed8 0%, #2563eb 50%, #3b82f6 100%)", display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem" }}>
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
          💡 ทดสอบ: username <strong>admin</strong> / password <strong>admin123</strong>
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
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [showPass, setShowPass] = useState(false);

  const handleSave = async () => {
    if (!form.name.trim()) { setError("กรุณากรอกชื่อ"); return; }
    if (!form.department.trim()) { setError("กรุณาเลือกแผนก"); return; }
    setSaving(true);
    const payload = { ...form, email: form.email || null, username: form.username || null, password: form.password || null };
    const result = employee?.id
      ? await supabase.from("employees").update(payload).eq("id", employee.id)
      : await supabase.from("employees").insert(payload);
    setSaving(false);
    if (result.error) { setError(result.error.message); return; }
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
  const [form, setForm] = useState({
    employee_id: currentUser?.id || "",
    leave_type: "ลาป่วย", duration_type: "เต็มวัน",
    start_date: todayISO(), end_date: todayISO(),
    start_time: "08:30", end_time: "16:30", hours: 8, reason: "",
    substitute_id: ""
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

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
    if (!form.reason.trim()) { setError("กรุณากรอกเหตุผล"); return; }
    setSaving(true);
    const payload = { ...form, substitute_id: form.substitute_id || null };
    const { error } = await supabase.from("leaves").insert(payload);
    setSaving(false);
    if (error) { setError(error.message); return; }
    onSave();
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
          <select value={form.substitute_id} onChange={e => setForm(f => ({ ...f, substitute_id: e.target.value }))} style={selectStyle}>
            <option value="">-- ไม่ระบุ --</option>
            {employees.filter(e => e.id !== currentUser?.id).map(e => (
              <option key={e.id} value={e.id}>{e.name} — {e.department}</option>
            ))}
          </select>
        </Field>

        <ButtonRow onCancel={onClose} onSave={handleSave} saving={saving} />
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
  const [duty, setDuty] = useState("ไม่มีเวร");

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
    if (mode === "out" && selectedEmp) {
      (async () => {
        const { start, end } = todayRange();
        const { data } = await supabase.from("attendance").select("*").eq("employee_id", selectedEmp).is("check_out", null).gte("check_in", start).lte("check_in", end).order("check_in", { ascending: false }).limit(1);
        setOpenAttendance(data?.[0] || null);
      })();
    }
  }, [selectedEmp, mode]);

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
    if (!isInZone || done || !selectedEmp) return;
    if (mode === "in") {
      const { error } = await supabase.from("attendance").insert({ employee_id: selectedEmp, latitude: coords?.lat, longitude: coords?.lng, distance_from_school: distance, duty: duty });
      if (!error) finish();
    } else {
      if (!openAttendance) return;
      const { error } = await supabase.from("attendance").update({ check_out: new Date().toISOString() }).eq("id", openAttendance.id);
      if (!error) finish();
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
    setDoneStatus({ type: quoteType, minutes: info?.minutes || 0 });
    setDoneQuote(randomQuote(quoteType));
    setDone(true);
    onCheckin && onCheckin();
  };

  const circumference = 2 * Math.PI * 54;
  const ringColor = gpsState === "success" ? (isInZone ? (mode === "in" ? "#10b981" : "#f59e0b") : "#ef4444") : "#94a3b8";
  const pct = distance !== null ? Math.min(distance / GEOFENCE_RADIUS, 1) : 0;
  const canSubmit = isInZone && !done && gpsState === "success" && selectedEmp && (mode === "in" || openAttendance);

  return (
    <Modal title={mode === "in" ? "ลงเวลาเข้างาน" : "ลงเวลากลับบ้าน"} subtitle={`📍 รัศมี ${GEOFENCE_RADIUS} เมตรจากโรงเรียน`} onClose={onClose} icon={mode === "in" ? LogIn : LogOut} color={mode === "in" ? "#1d4ed8" : "#d97706"}>
      <div style={{ ...inputStyle, background: "#eff6ff", color: "#1d4ed8", marginBottom: "1rem", textAlign: "center", fontWeight: 700, border: "1.5px solid #bfdbfe" }}>
        👤 {currentUser?.name}
      </div>

      {mode === "in" && (
        <div style={{ marginBottom: "1.25rem" }}>
          <label style={{ fontSize: "0.8rem", fontWeight: 600, color: "#475569", display: "block", marginBottom: "0.35rem" }}>🚦 เวรวันนี้</label>
          <select value={duty} onChange={e => setDuty(e.target.value)} style={selectStyle}>
            {DUTY_OPTIONS.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
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
function EmployeePage({ employees, onRefresh }) {
  const [showModal, setShowModal] = useState(false);
  const [editEmp, setEditEmp] = useState(null);
  const [search, setSearch] = useState("");
  const [deleting, setDeleting] = useState(null);
  const [devices, setDevices] = useState([]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("user_devices").select("*");
      setDevices(data || []);
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
      <div style={{ position: "relative", marginBottom: "1.25rem" }}>
        <Search size={15} color="#94a3b8" style={{ position: "absolute", left: "0.75rem", top: "50%", transform: "translateY(-50%)" }} />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="ค้นหา..." style={{ ...inputStyle, maxWidth: 360, paddingLeft: "2.25rem" }} />
      </div>
      <Card padding="0">
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
            <thead>
              <tr style={{ background: "#f8fafc", borderBottom: "2px solid #f1f5f9" }}>
                {["#", "ชื่อ-นามสกุล", "Username", "แผนก", "สิทธิ์", "เครื่อง", "จัดการ"].map(h => (
                  <th key={h} style={{ padding: "0.75rem 1rem", textAlign: "left", color: "#64748b", fontWeight: 600, fontSize: "0.78rem", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={7} style={{ padding: "3rem", textAlign: "center", color: "#94a3b8" }}>ไม่พบข้อมูล</td></tr>
              ) : filtered.map((emp, i) => {
                const device = devices.find(d => d.employee_id === emp.id);
                return (
                  <tr key={emp.id} style={{ borderBottom: "1px solid #f8fafc" }}>
                    <td style={{ padding: "0.75rem 1rem", color: "#94a3b8", fontSize: "0.78rem" }}>{i + 1}</td>
                    <td style={{ padding: "0.75rem 1rem" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                        <Avatar name={emp.name} index={i} />
                        <span style={{ fontWeight: 600, color: "#0f172a" }}>{emp.name}</span>
                      </div>
                    </td>
                    <td style={{ padding: "0.75rem 1rem", color: "#475569", fontFamily: "monospace", fontSize: "0.8rem" }}>{emp.username || "-"}</td>
                    <td style={{ padding: "0.75rem 1rem" }}><span style={{ background: "#eff6ff", color: "#2563eb", fontSize: "0.75rem", fontWeight: 600, padding: "0.2rem 0.6rem", borderRadius: "20px" }}>{emp.department || "-"}</span></td>
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
                {["พนักงาน", "วันที่", "เข้างาน", "กลับบ้าน", "รวม", "สถานะ"].map(h => (
                  <th key={h} style={{ padding: "0.5rem 0.75rem", textAlign: "left", color: "#94a3b8", fontWeight: 600, fontSize: "0.75rem", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={6} style={{ padding: "2rem", textAlign: "center", color: "#94a3b8" }}>ไม่มีข้อมูล</td></tr>
              ) : filtered.map((row, i) => {
                const hours = row.check_out ? ((new Date(row.check_out) - new Date(row.check_in)) / 3600000).toFixed(1) : null;
                const lateInfo = checkLate(row.check_in, settings?.work_start, settings?.late_grace_minutes);
                const earlyInfo = row.check_out ? checkEarly(row.check_out, settings?.work_end) : null;
                return (
                  <tr key={row.id} style={{ borderBottom: "1px solid #f8fafc", background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                    <td style={{ padding: "0.65rem 0.75rem" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                        <Avatar name={row.employees?.name} index={i} />
                        <span style={{ fontWeight: 600, color: "#0f172a" }}>{row.employees?.name || "-"}</span>
                      </div>
                    </td>
                    <td style={{ padding: "0.65rem 0.75rem", color: "#475569" }}>{fmtDate(row.check_in)}</td>
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
                {["พนักงาน", "ประเภท", "ระยะเวลา", "วันที่", "ชม.", "ครูสอนแทน", "สถานะ", "จัดการ"].map(h => (
                  <th key={h} style={{ padding: "0.5rem 0.75rem", textAlign: "left", color: "#94a3b8", fontWeight: 600, fontSize: "0.75rem", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={8} style={{ padding: "3rem", textAlign: "center", color: "#94a3b8" }}>ไม่มีข้อมูลการลา</td></tr>
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
                    {row.substitute?.name
                      ? <span style={{ background: "#f5f3ff", color: "#7c3aed", fontSize: "0.72rem", fontWeight: 700, padding: "0.2rem 0.5rem", borderRadius: "20px" }}>👨‍🏫 {row.substitute.name}</span>
                      : <span style={{ color: "#94a3b8", fontSize: "0.78rem" }}>—</span>}
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

  const exportCSV = () => {
    let csv = "";
    if (reportType === "summary") {
      csv = "พนักงาน,แผนก,มาทำงาน(วัน),มาสาย(ครั้ง),เข้าก่อน(ครั้ง),กลับก่อน(ครั้ง),OT(ครั้ง),ลา(ชม.),ลา(วัน),ขาด,ออกนอก(ครั้ง),รวม(ชม.)\n";
      summaryRows.forEach(r => {
        csv += `${r.emp.name},${r.emp.department || ""},${r.attended},${r.lateCount},${r.earlyArrival},${r.earlyDeparture},${r.overtime},${r.leaveHours},${r.leaveDays},${r.absent},${r.outingCount},${r.totalHours}\n`;
      });
    } else if (reportType === "attendance") {
      csv = "พนักงาน,วันที่,เข้างาน,กลับบ้าน,รวม(ชม.),สถานะเข้า,สถานะกลับ\n";
      attendance.filter(a => inMonth(a.check_in) && (!empFilter || a.employee_id === empFilter)).forEach(a => {
        const li = checkLate(a.check_in, settings?.work_start);
        const ei = a.check_out ? checkEarly(a.check_out, settings?.work_end) : null;
        const hours = a.check_out ? ((new Date(a.check_out) - new Date(a.check_in)) / 3600000).toFixed(1) : "-";
        csv += `${a.employees?.name || "-"},${fmtDate(a.check_in)},${fmtTime(a.check_in)},${a.check_out ? fmtTime(a.check_out) : "-"},${hours},${li?.late ? "สาย " + li.minutes + " น." : li?.early ? "เข้าก่อน " + li.minutes + " น." : "ตรงเวลา"},${ei ? (ei.early ? "ก่อน " + ei.minutes + " น." : ei.late ? "ช้า " + ei.minutes + " น." : "ตรงเวลา") : "-"}\n`;
      });
    } else if (reportType === "late") {
      csv = "พนักงาน,วันที่,เวลาเข้า,สาย(นาที)\n";
      attendance.filter(a => inMonth(a.check_in) && (!empFilter || a.employee_id === empFilter)).forEach(a => {
        const li = checkLate(a.check_in, settings?.work_start);
        if (li?.late) csv += `${a.employees?.name || "-"},${fmtDate(a.check_in)},${fmtTime(a.check_in)},${li.minutes}\n`;
      });
    } else if (reportType === "earlyLeave") {
      csv = "พนักงาน,วันที่,เวลากลับ,กลับก่อน(นาที)\n";
      attendance.filter(a => inMonth(a.check_in) && a.check_out && (!empFilter || a.employee_id === empFilter)).forEach(a => {
        const ei = checkEarly(a.check_out, settings?.work_end);
        if (ei?.early) csv += `${a.employees?.name || "-"},${fmtDate(a.check_in)},${fmtTime(a.check_out)},${ei.minutes}\n`;
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

// ─── SCHEDULE PAGE ────────────────────────────────────────────────────────────
function SchedulePage({ employees, currentUser, onRefresh }) {
  const [schedules, setSchedules] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [empView, setEmpView] = useState(currentUser?.role === "admin" ? "" : currentUser?.id);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("teaching_schedule").select("*, employees(name, department)").order("day_of_week").order("period");
      setSchedules(data || []);
    })();
  }, []);

  const refresh = async () => {
    const { data } = await supabase.from("teaching_schedule").select("*, employees(name, department)").order("day_of_week").order("period");
    setSchedules(data || []);
  };

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
  const [activePage, setActivePage] = useState("dashboard");
  const [showAttendance, setShowAttendance] = useState(false);
  const [attMode, setAttMode] = useState("in");
  const [activityLog, setActivityLog] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [leaves, setLeaves] = useState([]);
  const [outings, setOutings] = useState([]);
  const [settings, setSettings] = useState({ work_start: "08:00", work_end: "16:30", late_grace_minutes: 0 });
  const [currentTime, setCurrentTime] = useState(new Date());
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(typeof window !== "undefined" ? window.innerWidth < 768 : false);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const saved = localStorage.getItem("hr_user");
    if (saved) {
      try { setCurrentUser(JSON.parse(saved)); } catch (e) { localStorage.removeItem("hr_user"); }
    }
  }, []);

  useEffect(() => { const t = setInterval(() => setCurrentTime(new Date()), 1000); return () => clearInterval(t); }, []);
  useEffect(() => { if (currentUser) fetchData(); }, [currentUser]);

  async function fetchData() {
    setLoading(true);
    const { data: emps } = await supabase.from("employees").select("*").order("name");
    if (emps) setEmployees(emps);
    const { data: att } = await supabase.from("attendance").select("*, employees(name, department)").order("check_in", { ascending: false }).limit(100);
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
    setCurrentUser(null);
    setActivePage("dashboard");
  };

  if (!currentUser) return <LoginPage onLogin={setCurrentUser} />;

  const todayDateStr = todayISO();
  const isToday = (dt) => new Date(dt).toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" }) === todayDateStr;
  const todayAttendance = activityLog.filter(a => isToday(a.check_in));
  const currentlyOut = outings.filter(o => o.status === "out").length;
  const pendingLeaves = leaves.filter(l => l.status === "pending").length;
  const myAttToday = activityLog.find(a => a.employee_id === currentUser.id && isToday(a.check_in));

  const stats = currentUser.role === "admin" ? [
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
      { label: "การลาของฉัน", value: leaves.filter(l => l.employee_id === currentUser.id).length, icon: Umbrella, color: "#7c3aed", bg: "#f5f3ff", trend: "รวม" },
      { label: "รออนุมัติ", value: leaves.filter(l => l.employee_id === currentUser.id && l.status === "pending").length, icon: AlertCircle, color: "#d97706", bg: "#fef3c7", trend: "รอ" },
    ];
  })();

  const openCheckIn = () => { setAttMode("in"); setShowAttendance(true); };
  const openCheckOut = () => { setAttMode("out"); setShowAttendance(true); };

  const visibleNavItems = navItems.filter(item => item.roles.includes(currentUser.role));

  return (
    <div style={{ fontFamily: "'Sarabun', 'Noto Sans Thai', sans-serif", background: "#f8fafc", minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Sarabun:wght@300;400;500;600;700;800&display=swap'); * { box-sizing: border-box; margin: 0; padding: 0; } @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>

      <header style={{ background: "#fff", borderBottom: "1px solid #e2e8f0", height: 60, display: "flex", alignItems: "center", padding: "0 1rem", gap: "0.75rem", position: "sticky", top: 0, zIndex: 100, boxShadow: "0 1px 8px rgba(0,0,0,0.06)" }}>
        {isMobile && (
          <button onClick={() => setSidebarOpen(true)} style={{ background: "#f1f5f9", border: "none", borderRadius: "10px", padding: "0.5rem", cursor: "pointer", color: "#475569", display: "flex" }}>
            <Menu size={20} />
          </button>
        )}
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
              <div style={{ fontSize: "0.85rem", fontWeight: 700, color: "#0f172a" }}>{currentUser.name}</div>
              <div style={{ fontSize: "0.7rem", color: "#64748b" }}>
                {currentUser.role === "admin" ? "👑 Admin" : "พนักงาน"} • {currentUser.department}
              </div>
            </div>
          )}
          <div style={{ width: 36, height: 36, borderRadius: "50%", background: "linear-gradient(135deg, #2563eb, #7c3aed)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700, fontSize: "0.9rem", flexShrink: 0 }}>{currentUser.name?.[0]}</div>
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
          width: 260,
          background: "#fff",
          borderRight: "1px solid #e2e8f0",
          padding: "1rem 0.75rem",
          display: "flex",
          flexDirection: "column",
          gap: "0.35rem",
          overflowY: "auto",
          position: isMobile ? "fixed" : "sticky",
          top: 60,
          left: isMobile ? (sidebarOpen ? 0 : -280) : 0,
          height: "calc(100vh - 60px)",
          zIndex: 95,
          transition: "left 0.3s ease",
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
                <div style={{ fontSize: "0.85rem", fontWeight: 700, color: "#0f172a", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{currentUser.name}</div>
                <div style={{ fontSize: "0.7rem", color: "#64748b" }}>{currentUser.role === "admin" ? "👑 Admin" : "พนักงาน"}</div>
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
              <button key={item.key} onClick={() => { setActivePage(item.key); setSidebarOpen(false); }} style={{
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
                  <PageHeader title={`สวัสดี ${currentUser.name?.split(" ")[0]} 👋`} />
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1rem", marginBottom: "1.5rem" }}>
                    {stats.map(stat => <StatCard key={stat.label} stat={stat} />)}
                  </div>

                  {currentUser.role === "admin" && (
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
              {activePage === "employee" && <EmployeePage employees={employees} onRefresh={fetchData} />}
              {activePage === "attendance" && <AttendancePage employees={employees} activityLog={activityLog} currentUser={currentUser} settings={settings} onRefresh={fetchData} />}
              {activePage === "leave" && <LeavePage employees={employees} leaves={leaves} currentUser={currentUser} onRefresh={fetchData} />}
              {activePage === "outing" && <OutingPage employees={employees} outings={outings} currentUser={currentUser} onRefresh={fetchData} />}
              {activePage === "report" && <ReportPage employees={employees} attendance={activityLog} leaves={leaves} outings={outings} settings={settings} />}
              {activePage === "schedule" && <SchedulePage employees={employees} currentUser={currentUser} onRefresh={fetchData} />}
              {activePage === "settings" && <SettingsPage settings={settings} onRefresh={fetchData} />}
            </>
          )}
        </main>
      </div>

      {showAttendance && <AttendanceModal mode={attMode} onClose={() => { setShowAttendance(false); fetchData(); }} onCheckin={() => fetchData()} employees={employees} currentUser={currentUser} settings={settings} />}
    </div>
  );
}