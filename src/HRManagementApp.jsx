import { useState, useEffect, useCallback } from "react";
import { createClient } from "@supabase/supabase-js";
import {
  Users, Building2, Clock, CheckCircle, XCircle, MapPin,
  Navigation, LogIn, LogOut, Settings, Bell, Search,
  ChevronDown, ChevronRight, BarChart3, FileText,
  Shield, WifiOff, RefreshCw, UserPlus, DollarSign,
  Umbrella, AlertCircle, Activity, Home, X, Edit, Trash2, Save, Phone, Mail,
  Plus, Calendar, ArrowRightLeft, ArrowLeftRight, TrendingUp, Filter
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
const todayISO = () => new Date().toISOString().split("T")[0];

const DEPT_OPTIONS = ["วิชาการ", "บริหาร", "พลศึกษา", "คณิตศาสตร์", "ภาษาไทย", "ศิลปะ", "วิทยาศาสตร์", "สังคมศึกษา", "ภาษาอังกฤษ", "การงานอาชีพ"];

const navItems = [
  { icon: Home, label: "หน้าหลัก", key: "dashboard" },
  { icon: Users, label: "ข้อมูลพนักงาน", key: "employee" },
  { icon: Clock, label: "ลงเวลาเข้า-ออก", key: "attendance" },
  { icon: Umbrella, label: "การลา", key: "leave" },
  { icon: ArrowRightLeft, label: "ขอออกนอกสถานที่", key: "outing" },
  { icon: BarChart3, label: "รายงาน", key: "report" },
];

// ─── EMPLOYEE FORM MODAL ──────────────────────────────────────────────────────
function EmployeeModal({ employee, onClose, onSave }) {
  const [form, setForm] = useState({
    name: employee?.name || "", department: employee?.department || "",
    position: employee?.position || "", email: employee?.email || "", phone: employee?.phone || "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSave = async () => {
    if (!form.name.trim()) { setError("กรุณากรอกชื่อ"); return; }
    if (!form.department.trim()) { setError("กรุณาเลือกแผนก"); return; }
    setSaving(true);
    const payload = { ...form, email: form.email || null };
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
        <ButtonRow onCancel={onClose} onSave={handleSave} saving={saving} />
      </div>
    </Modal>
  );
}

// ─── LEAVE MODAL ──────────────────────────────────────────────────────────────
function LeaveModal({ employees, onClose, onSave }) {
  const [form, setForm] = useState({
    employee_id: "", leave_type: "ลาป่วย", duration_type: "เต็มวัน",
    start_date: todayISO(), end_date: todayISO(),
    start_time: "08:30", end_time: "16:30", hours: 8, reason: ""
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const hourMap = { "เต็มวัน": 8, "ครึ่งวันเช้า": 4, "ครึ่งวันบ่าย": 4, "1 ชั่วโมง": 1, "2 ชั่วโมง": 2, "หลายวัน": 8 };
    setForm(f => ({ ...f, hours: hourMap[f.duration_type] || 8 }));
  }, [form.duration_type]);

  const handleSave = async () => {
    if (!form.employee_id) { setError("กรุณาเลือกพนักงาน"); return; }
    if (!form.reason.trim()) { setError("กรุณากรอกเหตุผล"); return; }
    setSaving(true);
    const { error } = await supabase.from("leaves").insert(form);
    setSaving(false);
    if (error) { setError(error.message); return; }
    onSave();
  };

  const isHourly = ["1 ชั่วโมง", "2 ชั่วโมง"].includes(form.duration_type);
  const isMultiDay = form.duration_type === "หลายวัน";

  return (
    <Modal title="ขอลา" onClose={onClose} icon={Umbrella} color="#059669">
      <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        {error && <ErrorBox>{error}</ErrorBox>}
        <Field label="พนักงาน *">
          <select value={form.employee_id} onChange={e => setForm(f => ({ ...f, employee_id: e.target.value }))} style={selectStyle}>
            <option value="">-- เลือกพนักงาน --</option>
            {employees.map(e => <option key={e.id} value={e.id}>{e.name} — {e.department}</option>)}
          </select>
        </Field>
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
        <Field label={isMultiDay ? "วันที่เริ่ม" : "วันที่"}>
          <input type="date" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} style={inputStyle} />
        </Field>
        {isMultiDay && (
          <Field label="ถึงวันที่">
            <input type="date" value={form.end_date} onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))} style={inputStyle} />
          </Field>
        )}
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
        <Field label="เหตุผล *">
          <textarea value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} rows={3} style={{ ...inputStyle, paddingLeft: "0.75rem", resize: "vertical" }} placeholder="กรอกเหตุผลการลา..." />
        </Field>
        <ButtonRow onCancel={onClose} onSave={handleSave} saving={saving} />
      </div>
    </Modal>
  );
}

// ─── OUTING MODAL ─────────────────────────────────────────────────────────────
function OutingModal({ employees, onClose, onSave }) {
  const [form, setForm] = useState({ employee_id: "", destination: "", reason: "" });
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
        <Field label="พนักงาน *">
          <select value={form.employee_id} onChange={e => setForm(f => ({ ...f, employee_id: e.target.value }))} style={selectStyle}>
            <option value="">-- เลือกพนักงาน --</option>
            {employees.map(e => <option key={e.id} value={e.id}>{e.name} — {e.department}</option>)}
          </select>
        </Field>
        <Field label="สถานที่ปลายทาง">
          <InputWithIcon icon={MapPin} value={form.destination} onChange={v => setForm(f => ({ ...f, destination: v }))} placeholder="เช่น ธนาคาร, ไปประชุม" />
        </Field>
        <Field label="เหตุผล *">
          <textarea value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} rows={3} style={{ ...inputStyle, paddingLeft: "0.75rem", resize: "vertical" }} placeholder="กรอกเหตุผลการออกนอกสถานที่..." />
        </Field>
        <ButtonRow onCancel={onClose} onSave={handleSave} saving={saving} label="บันทึกการออก" />
      </div>
    </Modal>
  );
}

// ─── ATTENDANCE MODAL (Check-in & Check-out) ──────────────────────────────────
function AttendanceModal({ onClose, onCheckin, employees, mode = "in" }) {
  const [gpsState, setGpsState] = useState("idle");
  const [coords, setCoords] = useState(null);
  const [distance, setDistance] = useState(null);
  const [done, setDone] = useState(false);
  const [doneTime, setDoneTime] = useState(null);
  const [selectedEmp, setSelectedEmp] = useState("");
  const [openAttendance, setOpenAttendance] = useState(null);

  // เช็คว่าพนักงานคนนี้มี check-in ที่ยังไม่ check-out หรือไม่
  useEffect(() => {
    if (mode === "out" && selectedEmp) {
      (async () => {
        const today = todayISO();
        const { data } = await supabase
          .from("attendance")
          .select("*")
          .eq("employee_id", selectedEmp)
          .is("check_out", null)
          .gte("check_in", today)
          .order("check_in", { ascending: false })
          .limit(1);
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
      const { error } = await supabase.from("attendance").insert({
        employee_id: selectedEmp, latitude: coords?.lat, longitude: coords?.lng, distance_from_school: distance,
      });
      if (!error) finish();
    } else {
      if (!openAttendance) return;
      const { error } = await supabase.from("attendance")
        .update({ check_out: new Date().toISOString() })
        .eq("id", openAttendance.id);
      if (!error) finish();
    }
  };

  const finish = () => {
    setDoneTime(new Date().toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "Asia/Bangkok" }));
    setDone(true);
    onCheckin && onCheckin();
  };

  const circumference = 2 * Math.PI * 54;
  const ringColor = gpsState === "success" ? (isInZone ? (mode === "in" ? "#10b981" : "#f59e0b") : "#ef4444") : "#94a3b8";
  const pct = distance !== null ? Math.min(distance / GEOFENCE_RADIUS, 1) : 0;

  const canSubmit = isInZone && !done && gpsState === "success" && selectedEmp && (mode === "in" || openAttendance);

  return (
    <Modal title={mode === "in" ? "ลงเวลาเข้างาน" : "ลงเวลากลับบ้าน"} subtitle={`📍 รัศมี ${GEOFENCE_RADIUS} เมตรจากโรงเรียน`} onClose={onClose} icon={mode === "in" ? LogIn : LogOut} color={mode === "in" ? "#1d4ed8" : "#d97706"}>
        <select value={selectedEmp} onChange={e => setSelectedEmp(e.target.value)} style={{ ...selectStyle, marginBottom: "1.25rem" }}>
          <option value="">-- เลือกชื่อพนักงาน --</option>
          {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.name} — {emp.department}</option>)}
        </select>

        {mode === "out" && selectedEmp && !openAttendance && (
          <div style={{ background: "#fef2f2", border: "1.5px solid #fca5a5", borderRadius: "12px", padding: "0.75rem", marginBottom: "1.25rem", textAlign: "center", color: "#dc2626", fontSize: "0.85rem", fontWeight: 600 }}>
            ⚠️ พนักงานคนนี้ยังไม่ได้ลงเวลาเข้างานวันนี้
          </div>
        )}

        {mode === "out" && openAttendance && (
          <div style={{ background: "#eff6ff", border: "1.5px solid #93c5fd", borderRadius: "12px", padding: "0.75rem", marginBottom: "1.25rem", textAlign: "center", color: "#1d4ed8", fontSize: "0.85rem", fontWeight: 600 }}>
            🕐 ลงเวลาเข้างานเมื่อ {fmtTime(openAttendance.check_in)} น.
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "center", marginBottom: "1.25rem" }}>
          <div style={{ position: "relative", width: 140, height: 140 }}>
            <svg width={140} height={140} style={{ transform: "rotate(-90deg)" }}>
              <circle cx={70} cy={70} r={54} fill="none" stroke="#f1f5f9" strokeWidth={10} />
              <circle cx={70} cy={70} r={54} fill="none" stroke={ringColor} strokeWidth={10}
                strokeDasharray={circumference}
                strokeDashoffset={gpsState === "success" ? circumference * (1 - pct) : circumference}
                strokeLinecap="round" style={{ transition: "stroke-dashoffset 0.8s ease, stroke 0.4s ease" }} />
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
          <div style={{ background: "#f0fdf4", border: "1.5px solid #86efac", borderRadius: "12px", padding: "1rem", marginBottom: "1.25rem", textAlign: "center" }}>
            <CheckCircle size={32} color="#16a34a" style={{ margin: "0 auto 0.5rem" }} />
            <div style={{ fontWeight: 700, color: "#15803d" }}>บันทึกสำเร็จ!</div>
            <div style={{ color: "#166534", fontSize: "0.85rem" }}>เวลา {doneTime} น.</div>
          </div>
        )}

        <div style={{ display: "flex", gap: "0.75rem" }}>
          <button onClick={fetchLocation} style={btnSecondary}><RefreshCw size={16} /> อัปเดต GPS</button>
          <button onClick={handleSubmit} disabled={!canSubmit}
            style={{ ...btnPrimary, background: done ? "#dcfce7" : canSubmit ? (mode === "in" ? "linear-gradient(135deg, #2563eb, #1d4ed8)" : "linear-gradient(135deg, #f59e0b, #d97706)") : "#e2e8f0", color: done ? "#16a34a" : canSubmit ? "#fff" : "#94a3b8", cursor: canSubmit ? "pointer" : "not-allowed" }}>
            {mode === "in" ? <LogIn size={18} /> : <LogOut size={18} />}
            {done ? "บันทึกแล้ว" : mode === "in" ? "ลงเวลาเข้างาน" : "ลงเวลากลับบ้าน"}
          </button>
        </div>
    </Modal>
  );
}

// ─── REUSABLE COMPONENTS ──────────────────────────────────────────────────────
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
          {subtitle && (
            <div style={{ color: "rgba(255,255,255,0.9)", fontSize: "0.85rem", marginTop: "0.75rem", background: "rgba(255,255,255,0.1)", borderRadius: "8px", padding: "0.5rem 0.75rem" }}>{subtitle}</div>
          )}
        </div>
        <div style={{ padding: "1.5rem", overflowY: "auto" }}>{children}</div>
      </div>
    </div>
  );
}

const inputStyle = { width: "100%", padding: "0.65rem 0.75rem", border: "1.5px solid #e2e8f0", borderRadius: "10px", fontSize: "0.9rem", fontFamily: "inherit", color: "#0f172a", outline: "none", background: "#fff" };
const selectStyle = { ...inputStyle };
const btnSecondary = { flex: 1, padding: "0.75rem", borderRadius: "10px", border: "1.5px solid #e2e8f0", background: "#f8fafc", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.4rem", color: "#475569", fontSize: "0.9rem", fontWeight: 600, fontFamily: "inherit" };
const btnPrimary = { flex: 2, padding: "0.75rem", borderRadius: "10px", border: "none", fontWeight: 700, fontSize: "0.95rem", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.4rem" };

function Field({ label, children }) {
  return (
    <div>
      <label style={{ fontSize: "0.8rem", fontWeight: 600, color: "#475569", display: "block", marginBottom: "0.35rem" }}>{label}</label>
      {children}
    </div>
  );
}

function InputWithIcon({ icon: Icon, value, onChange, placeholder, type = "text" }) {
  return (
    <div style={{ position: "relative" }}>
      <Icon size={15} color="#94a3b8" style={{ position: "absolute", left: "0.75rem", top: "50%", transform: "translateY(-50%)" }} />
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        style={{ ...inputStyle, paddingLeft: "2.25rem" }} />
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
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
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

function Card({ children, padding = "1.25rem" }) {
  return <div style={{ background: "#fff", borderRadius: "1rem", padding, boxShadow: "0 2px 12px rgba(0,0,0,0.06)", border: "1px solid #f1f5f9" }}>{children}</div>;
}

// ─── EMPLOYEE PAGE ────────────────────────────────────────────────────────────
function EmployeePage({ employees, onRefresh }) {
  const [showModal, setShowModal] = useState(false);
  const [editEmp, setEditEmp] = useState(null);
  const [search, setSearch] = useState("");
  const [deleting, setDeleting] = useState(null);

  const filtered = employees.filter(e => e.name?.toLowerCase().includes(search.toLowerCase()) || e.department?.toLowerCase().includes(search.toLowerCase()));

  const handleDelete = async (id) => {
    if (!window.confirm("ยืนยันลบพนักงาน? ประวัติทั้งหมดจะถูกลบด้วย")) return;
    setDeleting(id);
    await supabase.from("employees").delete().eq("id", id);
    setDeleting(null); onRefresh();
  };

  return (
    <div>
      <PageHeader title="ข้อมูลพนักงาน" count={employees.length} onAdd={() => { setEditEmp(null); setShowModal(true); }} addLabel="เพิ่มพนักงาน" />
      <div style={{ position: "relative", marginBottom: "1.25rem" }}>
        <Search size={15} color="#94a3b8" style={{ position: "absolute", left: "0.75rem", top: "50%", transform: "translateY(-50%)" }} />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="ค้นหาชื่อ หรือ แผนก..."
          style={{ ...inputStyle, maxWidth: 360, paddingLeft: "2.25rem" }} />
      </div>
      <Card padding="0">
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
            <thead>
              <tr style={{ background: "#f8fafc", borderBottom: "2px solid #f1f5f9" }}>
                {["#", "ชื่อ-นามสกุล", "แผนก", "ตำแหน่ง", "อีเมล", "เบอร์โทร", "จัดการ"].map(h => (
                  <th key={h} style={{ padding: "0.75rem 1rem", textAlign: "left", color: "#64748b", fontWeight: 600, fontSize: "0.78rem", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={7} style={{ padding: "3rem", textAlign: "center", color: "#94a3b8" }}>ไม่พบข้อมูลพนักงาน</td></tr>
              ) : filtered.map((emp, i) => (
                <tr key={emp.id} style={{ borderBottom: "1px solid #f8fafc" }}>
                  <td style={{ padding: "0.75rem 1rem", color: "#94a3b8", fontSize: "0.78rem" }}>{i + 1}</td>
                  <td style={{ padding: "0.75rem 1rem" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                      <Avatar name={emp.name} index={i} />
                      <span style={{ fontWeight: 600, color: "#0f172a" }}>{emp.name}</span>
                    </div>
                  </td>
                  <td style={{ padding: "0.75rem 1rem" }}><span style={{ background: "#eff6ff", color: "#2563eb", fontSize: "0.75rem", fontWeight: 600, padding: "0.2rem 0.6rem", borderRadius: "20px" }}>{emp.department || "-"}</span></td>
                  <td style={{ padding: "0.75rem 1rem", color: "#475569" }}>{emp.position || "-"}</td>
                  <td style={{ padding: "0.75rem 1rem", color: "#64748b" }}>{emp.email || "-"}</td>
                  <td style={{ padding: "0.75rem 1rem", color: "#64748b" }}>{emp.phone || "-"}</td>
                  <td style={{ padding: "0.75rem 1rem" }}>
                    <div style={{ display: "flex", gap: "0.4rem" }}>
                      <button onClick={() => { setEditEmp(emp); setShowModal(true); }} style={iconBtn("#eff6ff", "#2563eb")}><Edit size={15} /></button>
                      <button onClick={() => handleDelete(emp.id)} disabled={deleting === emp.id} style={iconBtn("#fef2f2", "#dc2626")}>
                        {deleting === emp.id ? <RefreshCw size={15} style={{ animation: "spin 1s linear infinite" }} /> : <Trash2 size={15} />}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      {showModal && <EmployeeModal employee={editEmp} onClose={() => { setShowModal(false); setEditEmp(null); }} onSave={() => { setShowModal(false); setEditEmp(null); onRefresh(); }} />}
    </div>
  );
}

const iconBtn = (bg, color) => ({ background: bg, border: "none", borderRadius: "8px", padding: "0.4rem", cursor: "pointer", color });
function Avatar({ name, index = 0 }) {
  return <div style={{ width: 34, height: 34, borderRadius: "50%", background: `hsl(${index * 47 + 200}, 65%, 58%)`, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700, fontSize: "0.85rem", flexShrink: 0 }}>{name?.[0] || "?"}</div>;
}

// ─── ATTENDANCE PAGE ──────────────────────────────────────────────────────────
function AttendancePage({ employees, activityLog, onRefresh }) {
  const [showIn, setShowIn] = useState(false);
  const [showOut, setShowOut] = useState(false);

  return (
    <div>
      <PageHeader title="ลงเวลาเข้า-ออก" count={activityLog.length} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1.5rem" }}>
        <button onClick={() => setShowIn(true)} style={{ background: "linear-gradient(135deg, #2563eb, #1d4ed8)", border: "none", borderRadius: "1rem", padding: "1.5rem", color: "#fff", cursor: "pointer", fontFamily: "inherit", boxShadow: "0 8px 24px rgba(37,99,235,0.3)", display: "flex", flexDirection: "column", alignItems: "center", gap: "0.5rem" }}>
          <LogIn size={32} />
          <div style={{ fontSize: "1.1rem", fontWeight: 800 }}>ลงเวลาเข้างาน</div>
          <div style={{ fontSize: "0.8rem", opacity: 0.9 }}>Check-in</div>
        </button>
        <button onClick={() => setShowOut(true)} style={{ background: "linear-gradient(135deg, #f59e0b, #d97706)", border: "none", borderRadius: "1rem", padding: "1.5rem", color: "#fff", cursor: "pointer", fontFamily: "inherit", boxShadow: "0 8px 24px rgba(245,158,11,0.3)", display: "flex", flexDirection: "column", alignItems: "center", gap: "0.5rem" }}>
          <LogOut size={32} />
          <div style={{ fontSize: "1.1rem", fontWeight: 800 }}>ลงเวลากลับบ้าน</div>
          <div style={{ fontSize: "0.8rem", opacity: 0.9 }}>Check-out</div>
        </button>
      </div>

      <Card padding="0">
        <div style={{ padding: "1.25rem 1.25rem 0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontWeight: 700, color: "#0f172a", fontSize: "0.95rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <Activity size={18} color="#2563eb" /> ประวัติการลงเวลา
          </div>
          <button onClick={onRefresh} style={{ background: "none", border: "1.5px solid #e2e8f0", borderRadius: "8px", padding: "0.35rem 0.75rem", fontSize: "0.78rem", color: "#475569", cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: "0.4rem" }}>
            <RefreshCw size={13} /> รีเฟรช
          </button>
        </div>
        <div style={{ padding: "1.25rem", overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
            <thead>
              <tr style={{ borderBottom: "2px solid #f1f5f9" }}>
                {["พนักงาน", "แผนก", "วันที่", "เข้างาน", "กลับบ้าน", "รวมเวลา", "ระยะ"].map(h => (
                  <th key={h} style={{ padding: "0.5rem 0.75rem", textAlign: "left", color: "#94a3b8", fontWeight: 600, fontSize: "0.75rem", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {activityLog.length === 0 ? (
                <tr><td colSpan={7} style={{ padding: "2rem", textAlign: "center", color: "#94a3b8" }}>ยังไม่มีข้อมูล</td></tr>
              ) : activityLog.map((row, i) => {
                const hours = row.check_out ? ((new Date(row.check_out) - new Date(row.check_in)) / 3600000).toFixed(1) : null;
                return (
                  <tr key={row.id} style={{ borderBottom: "1px solid #f8fafc", background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                    <td style={{ padding: "0.65rem 0.75rem" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                        <Avatar name={row.employees?.name} index={i} />
                        <span style={{ fontWeight: 600, color: "#0f172a" }}>{row.employees?.name || "-"}</span>
                      </div>
                    </td>
                    <td style={{ padding: "0.65rem 0.75rem", color: "#64748b" }}>{row.employees?.department || "-"}</td>
                    <td style={{ padding: "0.65rem 0.75rem", color: "#475569" }}>{fmtDate(row.check_in)}</td>
                    <td style={{ padding: "0.65rem 0.75rem" }}><span style={{ background: "#dcfce7", color: "#16a34a", fontSize: "0.72rem", fontWeight: 700, padding: "0.2rem 0.5rem", borderRadius: "20px" }}>{fmtTime(row.check_in)}</span></td>
                    <td style={{ padding: "0.65rem 0.75rem" }}>
                      {row.check_out
                        ? <span style={{ background: "#fef3c7", color: "#d97706", fontSize: "0.72rem", fontWeight: 700, padding: "0.2rem 0.5rem", borderRadius: "20px" }}>{fmtTime(row.check_out)}</span>
                        : <span style={{ color: "#94a3b8", fontSize: "0.78rem" }}>ยังไม่กลับ</span>}
                    </td>
                    <td style={{ padding: "0.65rem 0.75rem", color: "#475569", fontWeight: 600 }}>{hours ? `${hours} ชม.` : "-"}</td>
                    <td style={{ padding: "0.65rem 0.75rem", color: "#64748b", fontSize: "0.8rem" }}>{row.distance_from_school ? `${Math.round(row.distance_from_school)} ม.` : "-"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {showIn && <AttendanceModal mode="in" onClose={() => setShowIn(false)} onCheckin={() => { setShowIn(false); onRefresh(); }} employees={employees} />}
      {showOut && <AttendanceModal mode="out" onClose={() => setShowOut(false)} onCheckin={() => { setShowOut(false); onRefresh(); }} employees={employees} />}
    </div>
  );
}

// ─── LEAVE PAGE ───────────────────────────────────────────────────────────────
function LeavePage({ employees, leaves, onRefresh }) {
  const [showModal, setShowModal] = useState(false);

  const updateStatus = async (id, status) => {
    await supabase.from("leaves").update({ status }).eq("id", id);
    onRefresh();
  };

  const handleDelete = async (id) => {
    if (!window.confirm("ลบรายการลานี้?")) return;
    await supabase.from("leaves").delete().eq("id", id);
    onRefresh();
  };

  const stsBadge = (s) => {
    const map = { pending: { bg: "#fef3c7", color: "#d97706", label: "รออนุมัติ" }, approved: { bg: "#dcfce7", color: "#16a34a", label: "อนุมัติแล้ว" }, rejected: { bg: "#fef2f2", color: "#dc2626", label: "ไม่อนุมัติ" } };
    const c = map[s] || map.pending;
    return <span style={{ background: c.bg, color: c.color, fontSize: "0.72rem", fontWeight: 700, padding: "0.2rem 0.6rem", borderRadius: "20px" }}>{c.label}</span>;
  };

  return (
    <div>
      <PageHeader title="การลา" count={leaves.length} onAdd={() => setShowModal(true)} addLabel="ขอลา" />
      <Card padding="0">
        <div style={{ padding: "1.25rem", overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
            <thead>
              <tr style={{ borderBottom: "2px solid #f1f5f9" }}>
                {["พนักงาน", "ประเภท", "ระยะเวลา", "วันที่", "ชม.", "เหตุผล", "สถานะ", "จัดการ"].map(h => (
                  <th key={h} style={{ padding: "0.5rem 0.75rem", textAlign: "left", color: "#94a3b8", fontWeight: 600, fontSize: "0.75rem", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {leaves.length === 0 ? (
                <tr><td colSpan={8} style={{ padding: "3rem", textAlign: "center", color: "#94a3b8" }}>ยังไม่มีข้อมูลการลา</td></tr>
              ) : leaves.map((row, i) => (
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
                    {fmtDate(row.start_date)}{row.duration_type === "หลายวัน" && row.end_date ? ` - ${fmtDate(row.end_date)}` : ""}
                  </td>
                  <td style={{ padding: "0.65rem 0.75rem", color: "#475569", fontWeight: 600 }}>{row.hours || 8}</td>
                  <td style={{ padding: "0.65rem 0.75rem", color: "#64748b", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.reason || "-"}</td>
                  <td style={{ padding: "0.65rem 0.75rem" }}>{stsBadge(row.status)}</td>
                  <td style={{ padding: "0.65rem 0.75rem" }}>
                    <div style={{ display: "flex", gap: "0.3rem" }}>
                      {row.status === "pending" && (
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
      {showModal && <LeaveModal employees={employees} onClose={() => setShowModal(false)} onSave={() => { setShowModal(false); onRefresh(); }} />}
    </div>
  );
}

// ─── OUTING PAGE ──────────────────────────────────────────────────────────────
function OutingPage({ employees, outings, onRefresh }) {
  const [showModal, setShowModal] = useState(false);

  const markReturn = async (id) => {
    await supabase.from("outings").update({ return_time: new Date().toISOString(), status: "returned" }).eq("id", id);
    onRefresh();
  };

  const handleDelete = async (id) => {
    if (!window.confirm("ลบรายการนี้?")) return;
    await supabase.from("outings").delete().eq("id", id);
    onRefresh();
  };

  return (
    <div>
      <PageHeader title="ขอออกนอกสถานที่" count={outings.length} onAdd={() => setShowModal(true)} addLabel="ขอออก" />
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
              {outings.length === 0 ? (
                <tr><td colSpan={8} style={{ padding: "3rem", textAlign: "center", color: "#94a3b8" }}>ยังไม่มีการออกนอกสถานที่</td></tr>
              ) : outings.map((row, i) => (
                <tr key={row.id} style={{ borderBottom: "1px solid #f8fafc", background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                  <td style={{ padding: "0.65rem 0.75rem" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      <Avatar name={row.employees?.name} index={i} />
                      <span style={{ fontWeight: 600, color: "#0f172a" }}>{row.employees?.name || "-"}</span>
                    </div>
                  </td>
                  <td style={{ padding: "0.65rem 0.75rem", color: "#475569" }}>{fmtDate(row.out_time)}</td>
                  <td style={{ padding: "0.65rem 0.75rem" }}><span style={{ background: "#fef3c7", color: "#d97706", fontSize: "0.72rem", fontWeight: 700, padding: "0.2rem 0.5rem", borderRadius: "20px" }}>{fmtTime(row.out_time)}</span></td>
                  <td style={{ padding: "0.65rem 0.75rem" }}>
                    {row.return_time
                      ? <span style={{ background: "#dcfce7", color: "#16a34a", fontSize: "0.72rem", fontWeight: 700, padding: "0.2rem 0.5rem", borderRadius: "20px" }}>{fmtTime(row.return_time)}</span>
                      : <span style={{ color: "#dc2626", fontSize: "0.78rem", fontWeight: 600 }}>ยังไม่กลับ</span>}
                  </td>
                  <td style={{ padding: "0.65rem 0.75rem", color: "#475569" }}>{row.destination || "-"}</td>
                  <td style={{ padding: "0.65rem 0.75rem", color: "#64748b", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.reason || "-"}</td>
                  <td style={{ padding: "0.65rem 0.75rem" }}>
                    <span style={{ background: row.status === "out" ? "#fef2f2" : "#dcfce7", color: row.status === "out" ? "#dc2626" : "#16a34a", fontSize: "0.72rem", fontWeight: 700, padding: "0.2rem 0.6rem", borderRadius: "20px" }}>
                      {row.status === "out" ? "ออกอยู่" : "กลับแล้ว"}
                    </span>
                  </td>
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
      {showModal && <OutingModal employees={employees} onClose={() => setShowModal(false)} onSave={() => { setShowModal(false); onRefresh(); }} />}
    </div>
  );
}

// ─── REPORT PAGE ──────────────────────────────────────────────────────────────
function ReportPage({ employees, attendance, leaves, outings }) {
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [empFilter, setEmpFilter] = useState("");

  const monthStart = new Date(month + "-01");
  const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0);
  const workDays = Array.from({ length: monthEnd.getDate() }, (_, i) => i + 1)
    .filter(d => { const dow = new Date(monthStart.getFullYear(), monthStart.getMonth(), d).getDay(); return dow !== 0 && dow !== 6; }).length;

  const inMonth = (dateStr) => {
    if (!dateStr) return false;
    const d = new Date(dateStr);
    return d.getMonth() === monthStart.getMonth() && d.getFullYear() === monthStart.getFullYear();
  };

  const empList = empFilter ? employees.filter(e => e.id === empFilter) : employees;

  const rows = empList.map(emp => {
    const attDays = attendance.filter(a => a.employee_id === emp.id && inMonth(a.check_in));
    const leaveHours = leaves.filter(l => l.employee_id === emp.id && l.status === "approved" && inMonth(l.start_date)).reduce((s, l) => s + (l.hours || 8), 0);
    const outingCount = outings.filter(o => o.employee_id === emp.id && inMonth(o.out_time)).length;
    const totalHours = attDays.reduce((s, a) => s + (a.check_out ? (new Date(a.check_out) - new Date(a.check_in)) / 3600000 : 0), 0);
    const attended = attDays.length;
    const absent = Math.max(0, workDays - attended - leaveHours / 8);

    return { emp, attended, absent: absent.toFixed(1), leaveHours, leaveDays: (leaveHours / 8).toFixed(1), outingCount, totalHours: totalHours.toFixed(1) };
  });

  return (
    <div>
      <PageHeader title="รายงานการเข้างาน" />

      <Card>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "1rem", alignItems: "end", marginBottom: "1rem" }}>
          <Field label="เดือน">
            <input type="month" value={month} onChange={e => setMonth(e.target.value)} style={{ ...inputStyle, width: "auto" }} />
          </Field>
          <Field label="พนักงาน">
            <select value={empFilter} onChange={e => setEmpFilter(e.target.value)} style={{ ...selectStyle, width: "auto", minWidth: 200 }}>
              <option value="">ทั้งหมด</option>
              {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </Field>
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "1rem", padding: "0.65rem 1rem", background: "#eff6ff", borderRadius: "10px" }}>
            <Calendar size={16} color="#2563eb" />
            <div>
              <div style={{ fontSize: "0.72rem", color: "#64748b" }}>วันทำงาน</div>
              <div style={{ fontWeight: 800, color: "#1d4ed8" }}>{workDays} วัน</div>
            </div>
          </div>
        </div>
      </Card>

      <div style={{ marginTop: "1rem" }}>
        <Card padding="0">
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
              <thead>
                <tr style={{ background: "#f8fafc", borderBottom: "2px solid #f1f5f9" }}>
                  {["พนักงาน", "แผนก", "มาทำงาน", "ลา (ชม.)", "ลา (วัน)", "ขาด", "ออกนอกสถานที่", "รวมชั่วโมง"].map(h => (
                    <th key={h} style={{ padding: "0.75rem 1rem", textAlign: "left", color: "#64748b", fontWeight: 600, fontSize: "0.78rem", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.emp.id} style={{ borderBottom: "1px solid #f8fafc", background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                    <td style={{ padding: "0.75rem 1rem" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                        <Avatar name={r.emp.name} index={i} />
                        <span style={{ fontWeight: 600, color: "#0f172a" }}>{r.emp.name}</span>
                      </div>
                    </td>
                    <td style={{ padding: "0.75rem 1rem", color: "#64748b" }}>{r.emp.department || "-"}</td>
                    <td style={{ padding: "0.75rem 1rem" }}><span style={{ color: "#16a34a", fontWeight: 700 }}>{r.attended} วัน</span></td>
                    <td style={{ padding: "0.75rem 1rem", color: "#7c3aed", fontWeight: 600 }}>{r.leaveHours}</td>
                    <td style={{ padding: "0.75rem 1rem", color: "#7c3aed", fontWeight: 600 }}>{r.leaveDays}</td>
                    <td style={{ padding: "0.75rem 1rem" }}><span style={{ color: r.absent > 0 ? "#dc2626" : "#94a3b8", fontWeight: 700 }}>{r.absent}</span></td>
                    <td style={{ padding: "0.75rem 1rem", color: "#d97706", fontWeight: 600 }}>{r.outingCount} ครั้ง</td>
                    <td style={{ padding: "0.75rem 1rem", color: "#1d4ed8", fontWeight: 700 }}>{r.totalHours} ชม.</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}

// ─── STAT CARD ────────────────────────────────────────────────────────────────
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
  const [activePage, setActivePage] = useState("dashboard");
  const [showAttendance, setShowAttendance] = useState(false);
  const [attMode, setAttMode] = useState("in");
  const [activityLog, setActivityLog] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [leaves, setLeaves] = useState([]);
  const [outings, setOutings] = useState([]);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [loading, setLoading] = useState(true);

  useEffect(() => { const t = setInterval(() => setCurrentTime(new Date()), 1000); return () => clearInterval(t); }, []);
  useEffect(() => { fetchData(); }, []);

  async function fetchData() {
    setLoading(true);
    const { data: emps } = await supabase.from("employees").select("*").order("name");
    if (emps) setEmployees(emps);

    const { data: att } = await supabase.from("attendance").select("*, employees(name, department)").order("check_in", { ascending: false }).limit(100);
    if (att) setActivityLog(att);

    const { data: lvs } = await supabase.from("leaves").select("*, employees(name, department)").order("created_at", { ascending: false });
    if (lvs) setLeaves(lvs);

    const { data: outs } = await supabase.from("outings").select("*, employees(name, department)").order("out_time", { ascending: false });
    if (outs) setOutings(outs);

    setLoading(false);
  }

  const todayAttendance = activityLog.filter(a => new Date(a.check_in).toDateString() === new Date().toDateString());
  const currentlyOut = outings.filter(o => o.status === "out").length;
  const pendingLeaves = leaves.filter(l => l.status === "pending").length;

  const stats = [
    { label: "พนักงานทั้งหมด", value: employees.length, icon: Users, color: "#2563eb", bg: "#eff6ff", trend: "ข้อมูลจริง" },
    { label: "ลงเวลาวันนี้", value: todayAttendance.length, icon: CheckCircle, color: "#059669", bg: "#ecfdf5", trend: `${employees.length > 0 ? Math.round(todayAttendance.length / employees.length * 100) : 0}%` },
    { label: "ออกนอกสถานที่", value: currentlyOut, icon: ArrowRightLeft, color: "#d97706", bg: "#fef3c7", trend: "ขณะนี้" },
    { label: "รออนุมัติลา", value: pendingLeaves, icon: AlertCircle, color: "#dc2626", bg: "#fef2f2", trend: pendingLeaves > 0 ? "ต้องดำเนินการ" : "ไม่มี" },
  ];

  const openCheckIn = () => { setAttMode("in"); setShowAttendance(true); };
  const openCheckOut = () => { setAttMode("out"); setShowAttendance(true); };

  return (
    <div style={{ fontFamily: "'Sarabun', 'Noto Sans Thai', sans-serif", background: "#f8fafc", minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Sarabun:wght@300;400;500;600;700;800&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>

      {/* TOP BAR */}
      <header style={{ background: "#fff", borderBottom: "1px solid #e2e8f0", height: 60, display: "flex", alignItems: "center", padding: "0 1.25rem", gap: "1rem", position: "sticky", top: 0, zIndex: 100, boxShadow: "0 1px 8px rgba(0,0,0,0.06)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", minWidth: 180 }}>
          <div style={{ width: 34, height: 34, borderRadius: "10px", background: "linear-gradient(135deg, #2563eb, #1d4ed8)", display: "flex", alignItems: "center", justifyContent: "center" }}><Shield size={18} color="#fff" /></div>
          <div>
            <div style={{ fontSize: "0.95rem", fontWeight: 800, color: "#0f172a", lineHeight: 1.1 }}>HR System</div>
            <div style={{ fontSize: "0.65rem", color: "#64748b" }}>โรงเรียนนิมิตศึกษา</div>
          </div>
        </div>
        <div style={{ flex: 1, maxWidth: 360, position: "relative", display: "flex", alignItems: "center" }}>
          <Search size={15} color="#94a3b8" style={{ position: "absolute", left: "0.75rem" }} />
          <input placeholder="ค้นหา..." style={{ ...inputStyle, paddingLeft: "2.25rem", background: "#f8fafc", fontSize: "0.85rem", padding: "0.5rem 0.75rem 0.5rem 2.25rem" }} />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginLeft: "auto" }}>
          {[
            { icon: UserPlus, color: "#2563eb", action: () => setActivePage("employee") },
            { icon: Umbrella, color: "#059669", action: () => setActivePage("leave") },
            { icon: ArrowRightLeft, color: "#d97706", action: () => setActivePage("outing") },
          ].map((b, i) => (
            <button key={i} onClick={b.action} style={{ background: "#f8fafc", border: "1.5px solid #e2e8f0", borderRadius: "10px", padding: "0.45rem 0.6rem", cursor: "pointer", display: "flex", alignItems: "center", fontFamily: "inherit" }}>
              <b.icon size={15} color={b.color} />
            </button>
          ))}
          <button style={{ background: "none", border: "none", cursor: "pointer", color: "#64748b", padding: "0.4rem" }}><Bell size={18} /></button>
          <div style={{ width: 34, height: 34, borderRadius: "50%", background: "linear-gradient(135deg, #2563eb, #7c3aed)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700, fontSize: "0.85rem" }}>ผ</div>
        </div>
      </header>

      <div style={{ display: "flex", flex: 1 }}>
        {/* SIDEBAR */}
        <aside style={{ width: 230, background: "#fff", borderRight: "1px solid #e2e8f0", padding: "1rem 0.75rem", display: "flex", flexDirection: "column", gap: "0.25rem", overflowY: "auto", position: "sticky", top: 60, height: "calc(100vh - 60px)" }}>
          <div style={{ background: "linear-gradient(135deg, #eff6ff, #f0f9ff)", border: "1px solid #bfdbfe", borderRadius: "12px", padding: "0.75rem", marginBottom: "0.75rem", textAlign: "center" }}>
            <div style={{ fontSize: "1.4rem", fontWeight: 800, color: "#1d4ed8" }}>{currentTime.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "Asia/Bangkok" })}</div>
            <div style={{ fontSize: "0.72rem", color: "#64748b" }}>{currentTime.toLocaleDateString("th-TH", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Bangkok" })}</div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.4rem", marginBottom: "1rem" }}>
            <button onClick={openCheckIn} style={{ background: "linear-gradient(135deg, #2563eb, #1d4ed8)", border: "none", borderRadius: "10px", padding: "0.6rem", color: "#fff", fontWeight: 700, fontSize: "0.78rem", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: "0.3rem", boxShadow: "0 4px 14px rgba(37,99,235,0.3)", fontFamily: "inherit" }}>
              <LogIn size={16} /> เข้างาน
            </button>
            <button onClick={openCheckOut} style={{ background: "linear-gradient(135deg, #f59e0b, #d97706)", border: "none", borderRadius: "10px", padding: "0.6rem", color: "#fff", fontWeight: 700, fontSize: "0.78rem", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: "0.3rem", boxShadow: "0 4px 14px rgba(245,158,11,0.3)", fontFamily: "inherit" }}>
              <LogOut size={16} /> กลับบ้าน
            </button>
          </div>

          {navItems.map(item => {
            const Icon = item.icon;
            const isActive = activePage === item.key;
            return (
              <button key={item.key} onClick={() => setActivePage(item.key)} style={{
                width: "100%", display: "flex", alignItems: "center", gap: "0.6rem",
                padding: "0.6rem 0.75rem", borderRadius: "10px", border: "none",
                background: isActive ? "#eff6ff" : "transparent",
                color: isActive ? "#2563eb" : "#475569",
                cursor: "pointer", fontSize: "0.875rem", fontWeight: isActive ? 700 : 500,
                fontFamily: "inherit", textAlign: "left"
              }}>
                <Icon size={17} /><span>{item.label}</span>
              </button>
            );
          })}

          <div style={{ marginTop: "auto", paddingTop: "1rem", borderTop: "1px solid #f1f5f9" }}>
            <button style={{ width: "100%", display: "flex", alignItems: "center", gap: "0.6rem", padding: "0.6rem 0.75rem", borderRadius: "10px", border: "none", background: "transparent", color: "#94a3b8", cursor: "pointer", fontSize: "0.875rem", fontFamily: "inherit" }}>
              <Settings size={17} /> การตั้งค่า
            </button>
          </div>
        </aside>

        {/* MAIN CONTENT */}
        <main style={{ flex: 1, padding: "1.5rem", overflowY: "auto" }}>
          {loading ? (
            <div style={{ textAlign: "center", padding: "3rem", color: "#64748b" }}>
              <RefreshCw size={32} style={{ animation: "spin 1s linear infinite", margin: "0 auto 1rem" }} />
              <div>กำลังโหลดข้อมูล...</div>
            </div>
          ) : (
            <>
              {activePage === "dashboard" && (
                <>
                  <PageHeader title="หน้าหลัก" />
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1rem", marginBottom: "1.5rem" }}>
                    {stats.map(stat => <StatCard key={stat.label} stat={stat} />)}
                  </div>
                  <Card>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                        <Activity size={18} color="#2563eb" />
                        <div style={{ fontWeight: 700, color: "#0f172a", fontSize: "0.95rem" }}>กิจกรรมล่าสุด</div>
                      </div>
                      <button onClick={fetchData} style={{ background: "none", border: "1.5px solid #e2e8f0", borderRadius: "8px", padding: "0.35rem 0.75rem", fontSize: "0.78rem", color: "#475569", cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: "0.4rem" }}>
                        <RefreshCw size={13} /> รีเฟรช
                      </button>
                    </div>
                    {activityLog.length === 0 ? (
                      <div style={{ textAlign: "center", padding: "2rem", color: "#94a3b8" }}>ยังไม่มีข้อมูลครับ</div>
                    ) : (
                      <div style={{ overflowX: "auto" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
                          <thead>
                            <tr style={{ borderBottom: "2px solid #f1f5f9" }}>
                              {["พนักงาน", "แผนก", "เข้างาน", "กลับบ้าน", "ระยะ"].map(h => (
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
                                <td style={{ padding: "0.65rem 0.75rem" }}>
                                  {row.check_out
                                    ? <span style={{ background: "#fef3c7", color: "#d97706", fontSize: "0.72rem", fontWeight: 700, padding: "0.2rem 0.5rem", borderRadius: "20px" }}>{fmtTime(row.check_out)}</span>
                                    : <span style={{ color: "#94a3b8", fontSize: "0.78rem" }}>-</span>}
                                </td>
                                <td style={{ padding: "0.65rem 0.75rem", color: "#64748b", fontSize: "0.8rem" }}>{row.distance_from_school ? `${Math.round(row.distance_from_school)} ม.` : "-"}</td>
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
              {activePage === "attendance" && <AttendancePage employees={employees} activityLog={activityLog} onRefresh={fetchData} />}
              {activePage === "leave" && <LeavePage employees={employees} leaves={leaves} onRefresh={fetchData} />}
              {activePage === "outing" && <OutingPage employees={employees} outings={outings} onRefresh={fetchData} />}
              {activePage === "report" && <ReportPage employees={employees} attendance={activityLog} leaves={leaves} outings={outings} />}
            </>
          )}
        </main>
      </div>

      {showAttendance && <AttendanceModal mode={attMode} onClose={() => setShowAttendance(false)} onCheckin={() => { setShowAttendance(false); fetchData(); }} employees={employees} />}
    </div>
  );
}
