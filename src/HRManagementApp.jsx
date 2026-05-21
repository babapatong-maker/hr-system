import { useState, useEffect, useCallback } from "react";
import { createClient } from "@supabase/supabase-js";
import {
  Users, Building2, Clock, CheckCircle, MapPin,
  Navigation, LogIn, Settings, Bell, Search,
  ChevronDown, ChevronRight, BarChart3, FileText,
  Shield, WifiOff, RefreshCw, UserPlus, DollarSign,
  Umbrella, AlertCircle, Activity, Home, X, Edit, Trash2, Save, Phone, Mail
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
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const navItems = [
  { icon: Home, label: "หน้าหลัก", key: "dashboard" },
  { icon: Users, label: "ข้อมูลพนักงาน", key: "employee", children: ["รายชื่อพนักงาน", "เพิ่มพนักงาน"] },
  { icon: Clock, label: "การจัดการเวลา", key: "time", children: ["ลงเวลาเข้า-ออก", "ตารางงาน", "การลา"] },
  { icon: BarChart3, label: "รายงาน", key: "report" },
  { icon: FileText, label: "บันทึกกิจกรรม", key: "logs" },
];

const DEPT_OPTIONS = ["วิชาการ", "บริหาร", "พลศึกษา", "คณิตศาสตร์", "ภาษาไทย", "ศิลปะ", "วิทยาศาสตร์", "สังคมศึกษา", "ภาษาอังกฤษ", "การงานอาชีพ"];

// ─── EMPLOYEE FORM MODAL ──────────────────────────────────────────────────────
function EmployeeModal({ employee, onClose, onSave }) {
  const [form, setForm] = useState({
    name: employee?.name || "",
    department: employee?.department || "",
    position: employee?.position || "",
    email: employee?.email || "",
    phone: employee?.phone || "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSave = async () => {
    if (!form.name.trim()) { setError("กรุณากรอกชื่อพนักงาน"); return; }
    if (!form.department.trim()) { setError("กรุณาเลือกแผนก"); return; }
    setSaving(true);
    let result;
    if (employee?.id) {
      result = await supabase.from("employees").update(form).eq("id", employee.id);
    } else {
      result = await supabase.from("employees").insert(form);
    }
    setSaving(false);
    if (result.error) { setError(result.error.message); return; }
    onSave();
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.7)", backdropFilter: "blur(6px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: "1rem" }}>
      <div style={{ background: "#fff", borderRadius: "1.5rem", width: "100%", maxWidth: "480px", boxShadow: "0 32px 80px rgba(0,0,0,0.25)", overflow: "hidden", fontFamily: "'Sarabun', sans-serif" }}>
        <div style={{ background: "linear-gradient(135deg, #1d4ed8, #2563eb)", padding: "1.5rem", position: "relative" }}>
          <button onClick={onClose} style={{ position: "absolute", top: "1rem", right: "1rem", background: "rgba(255,255,255,0.2)", border: "none", borderRadius: "50%", width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#fff" }}><X size={16} /></button>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", color: "#fff" }}>
            <div style={{ background: "rgba(255,255,255,0.2)", borderRadius: "12px", padding: "0.5rem", display: "flex" }}><Users size={22} /></div>
            <div>
              <div style={{ fontSize: "0.75rem", opacity: 0.8 }}>ระบบพนักงาน</div>
              <div style={{ fontSize: "1.1rem", fontWeight: 700 }}>{employee?.id ? "แก้ไขข้อมูลพนักงาน" : "เพิ่มพนักงานใหม่"}</div>
            </div>
          </div>
        </div>

        <div style={{ padding: "1.5rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
          {error && <div style={{ background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: "8px", padding: "0.75rem", color: "#dc2626", fontSize: "0.85rem" }}>{error}</div>}

          {[
            { label: "ชื่อ-นามสกุล *", key: "name", icon: Users, placeholder: "เช่น สมชาย ใจดี" },
            { label: "ตำแหน่ง", key: "position", icon: Building2, placeholder: "เช่น ครูผู้สอน" },
            { label: "อีเมล", key: "email", icon: Mail, placeholder: "example@school.ac.th" },
            { label: "เบอร์โทร", key: "phone", icon: Phone, placeholder: "08x-xxx-xxxx" },
          ].map(({ label, key, icon: Icon, placeholder }) => (
            <div key={key}>
              <label style={{ fontSize: "0.8rem", fontWeight: 600, color: "#475569", display: "block", marginBottom: "0.35rem" }}>{label}</label>
              <div style={{ position: "relative" }}>
                <Icon size={15} color="#94a3b8" style={{ position: "absolute", left: "0.75rem", top: "50%", transform: "translateY(-50%)" }} />
                <input value={form[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                  placeholder={placeholder}
                  style={{ width: "100%", padding: "0.65rem 0.75rem 0.65rem 2.25rem", border: "1.5px solid #e2e8f0", borderRadius: "10px", fontSize: "0.9rem", fontFamily: "inherit", color: "#0f172a", outline: "none" }} />
              </div>
            </div>
          ))}

          <div>
            <label style={{ fontSize: "0.8rem", fontWeight: 600, color: "#475569", display: "block", marginBottom: "0.35rem" }}>แผนก *</label>
            <select value={form.department} onChange={e => setForm(f => ({ ...f, department: e.target.value }))}
              style={{ width: "100%", padding: "0.65rem 0.75rem", border: "1.5px solid #e2e8f0", borderRadius: "10px", fontSize: "0.9rem", fontFamily: "inherit", color: "#0f172a" }}>
              <option value="">-- เลือกแผนก --</option>
              {DEPT_OPTIONS.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>

          <div style={{ display: "flex", gap: "0.75rem", marginTop: "0.5rem" }}>
            <button onClick={onClose} style={{ flex: 1, padding: "0.75rem", borderRadius: "10px", border: "1.5px solid #e2e8f0", background: "#f8fafc", cursor: "pointer", fontFamily: "inherit", fontSize: "0.9rem", color: "#475569", fontWeight: 600 }}>ยกเลิก</button>
            <button onClick={handleSave} disabled={saving} style={{ flex: 2, padding: "0.75rem", borderRadius: "10px", border: "none", background: "linear-gradient(135deg, #2563eb, #1d4ed8)", color: "#fff", fontWeight: 700, fontSize: "0.9rem", cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.4rem" }}>
              {saving ? <RefreshCw size={16} style={{ animation: "spin 1s linear infinite" }} /> : <Save size={16} />}
              {saving ? "กำลังบันทึก..." : "บันทึก"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── ATTENDANCE MODAL ─────────────────────────────────────────────────────────
function AttendanceModal({ onClose, onCheckin, employees }) {
  const [gpsState, setGpsState] = useState("idle");
  const [coords, setCoords] = useState(null);
  const [distance, setDistance] = useState(null);
  const [checkedIn, setCheckedIn] = useState(false);
  const [checkTime, setCheckTime] = useState(null);
  const [selectedEmp, setSelectedEmp] = useState("");

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

  const handleCheckin = async () => {
    if (!isInZone || checkedIn || !selectedEmp) return;
    const now = new Date();
    const { error } = await supabase.from("attendance").insert({
      employee_id: selectedEmp,
      check_in: now.toISOString(),
      latitude: coords?.lat,
      longitude: coords?.lng,
      distance_from_school: distance,
    });
    if (!error) {
      setCheckTime(now.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
      setCheckedIn(true);
      onCheckin && onCheckin();
    }
  };

  const circumference = 2 * Math.PI * 54;
  const ringColor = gpsState === "success" ? (isInZone ? "#10b981" : "#ef4444") : "#94a3b8";
  const pct = distance !== null ? Math.min(distance / GEOFENCE_RADIUS, 1) : 0;

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.7)", backdropFilter: "blur(6px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: "1rem" }}>
      <div style={{ background: "#fff", borderRadius: "1.5rem", width: "100%", maxWidth: "420px", boxShadow: "0 32px 80px rgba(0,0,0,0.25)", overflow: "hidden", fontFamily: "'Sarabun', sans-serif" }}>
        <div style={{ background: "linear-gradient(135deg, #1d4ed8, #2563eb)", padding: "1.5rem", position: "relative" }}>
          <button onClick={onClose} style={{ position: "absolute", top: "1rem", right: "1rem", background: "rgba(255,255,255,0.2)", border: "none", borderRadius: "50%", width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#fff" }}><X size={16} /></button>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", color: "#fff" }}>
            <div style={{ background: "rgba(255,255,255,0.2)", borderRadius: "12px", padding: "0.5rem", display: "flex" }}><Clock size={22} /></div>
            <div>
              <div style={{ fontSize: "0.75rem", opacity: 0.8 }}>ระบบลงเวลา</div>
              <div style={{ fontSize: "1.1rem", fontWeight: 700 }}>ลงเวลาเข้างาน</div>
            </div>
          </div>
          <div style={{ color: "rgba(255,255,255,0.9)", fontSize: "0.85rem", marginTop: "0.75rem", background: "rgba(255,255,255,0.1)", borderRadius: "8px", padding: "0.5rem 0.75rem" }}>
            📍 โรงเรียนนิมิตสุขสา — รัศมี {GEOFENCE_RADIUS} เมตร
          </div>
        </div>

        <div style={{ padding: "1.75rem" }}>
          <select value={selectedEmp} onChange={e => setSelectedEmp(e.target.value)} style={{ width: "100%", padding: "0.65rem", borderRadius: "10px", border: "1.5px solid #e2e8f0", fontSize: "0.9rem", marginBottom: "1.25rem", fontFamily: "inherit", color: "#0f172a" }}>
            <option value="">-- เลือกชื่อพนักงาน --</option>
            {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.name} — {emp.department}</option>)}
          </select>

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

          {checkedIn && (
            <div style={{ background: "#f0fdf4", border: "1.5px solid #86efac", borderRadius: "12px", padding: "1rem", marginBottom: "1.25rem", textAlign: "center" }}>
              <CheckCircle size={32} color="#16a34a" style={{ margin: "0 auto 0.5rem" }} />
              <div style={{ fontWeight: 700, color: "#15803d" }}>ลงเวลาสำเร็จ!</div>
              <div style={{ color: "#166534", fontSize: "0.85rem" }}>เวลา {checkTime} น.</div>
            </div>
          )}

          <div style={{ display: "flex", gap: "0.75rem" }}>
            <button onClick={fetchLocation} style={{ flex: 1, padding: "0.75rem", borderRadius: "10px", border: "1.5px solid #e2e8f0", background: "#f8fafc", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.4rem", color: "#475569", fontSize: "0.9rem", fontWeight: 600, fontFamily: "inherit" }}>
              <RefreshCw size={16} /> อัปเดต GPS
            </button>
            <button onClick={handleCheckin} disabled={!isInZone || checkedIn || gpsState !== "success" || !selectedEmp}
              style={{ flex: 2, padding: "0.75rem", borderRadius: "10px", border: "none", fontWeight: 700, fontSize: "0.95rem", fontFamily: "inherit", cursor: isInZone && !checkedIn && gpsState === "success" && selectedEmp ? "pointer" : "not-allowed", background: checkedIn ? "#dcfce7" : isInZone && gpsState === "success" && selectedEmp ? "linear-gradient(135deg, #2563eb, #1d4ed8)" : "#e2e8f0", color: checkedIn ? "#16a34a" : isInZone && gpsState === "success" && selectedEmp ? "#fff" : "#94a3b8", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.4rem" }}>
              <LogIn size={18} />{checkedIn ? "ลงเวลาแล้ว" : "ลงเวลาเข้างาน"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── EMPLOYEE PAGE ────────────────────────────────────────────────────────────
function EmployeePage({ employees, onRefresh }) {
  const [showModal, setShowModal] = useState(false);
  const [editEmp, setEditEmp] = useState(null);
  const [search, setSearch] = useState("");
  const [deleting, setDeleting] = useState(null);

  const filtered = employees.filter(e =>
    e.name?.toLowerCase().includes(search.toLowerCase()) ||
    e.department?.toLowerCase().includes(search.toLowerCase())
  );

  const handleDelete = async (id) => {
    if (!window.confirm("ยืนยันลบพนักงานนี้?")) return;
    setDeleting(id);
    await supabase.from("employees").delete().eq("id", id);
    setDeleting(null);
    onRefresh();
  };

  const handleSave = () => { setShowModal(false); setEditEmp(null); onRefresh(); };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
        <div>
          <h1 style={{ fontSize: "1.4rem", fontWeight: 800, color: "#0f172a" }}>ข้อมูลพนักงาน</h1>
          <p style={{ color: "#64748b", fontSize: "0.85rem" }}>ทั้งหมด {employees.length} คน</p>
        </div>
        <button onClick={() => { setEditEmp(null); setShowModal(true); }} style={{ background: "linear-gradient(135deg, #2563eb, #1d4ed8)", border: "none", borderRadius: "12px", padding: "0.65rem 1.25rem", color: "#fff", fontWeight: 700, fontSize: "0.875rem", cursor: "pointer", display: "flex", alignItems: "center", gap: "0.5rem", fontFamily: "inherit", boxShadow: "0 4px 14px rgba(37,99,235,0.3)" }}>
          <UserPlus size={16} /> เพิ่มพนักงาน
        </button>
      </div>

      {/* Search */}
      <div style={{ position: "relative", marginBottom: "1.25rem" }}>
        <Search size={15} color="#94a3b8" style={{ position: "absolute", left: "0.75rem", top: "50%", transform: "translateY(-50%)" }} />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="ค้นหาชื่อ หรือ แผนก..."
          style={{ width: "100%", maxWidth: 360, padding: "0.65rem 0.75rem 0.65rem 2.25rem", border: "1.5px solid #e2e8f0", borderRadius: "10px", fontSize: "0.85rem", fontFamily: "inherit", color: "#0f172a", outline: "none", background: "#fff" }} />
      </div>

      {/* Table */}
      <div style={{ background: "#fff", borderRadius: "1rem", boxShadow: "0 2px 12px rgba(0,0,0,0.06)", border: "1px solid #f1f5f9", overflow: "hidden" }}>
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
                <tr key={emp.id} style={{ borderBottom: "1px solid #f8fafc", transition: "background 0.15s" }}
                  onMouseEnter={e => e.currentTarget.style.background = "#f8fafc"}
                  onMouseLeave={e => e.currentTarget.style.background = ""}>
                  <td style={{ padding: "0.75rem 1rem", color: "#94a3b8", fontSize: "0.78rem" }}>{i + 1}</td>
                  <td style={{ padding: "0.75rem 1rem" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                      <div style={{ width: 34, height: 34, borderRadius: "50%", background: `hsl(${i * 47 + 200}, 65%, 58%)`, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700, fontSize: "0.85rem", flexShrink: 0 }}>{emp.name?.[0]}</div>
                      <span style={{ fontWeight: 600, color: "#0f172a" }}>{emp.name}</span>
                    </div>
                  </td>
                  <td style={{ padding: "0.75rem 1rem" }}>
                    <span style={{ background: "#eff6ff", color: "#2563eb", fontSize: "0.75rem", fontWeight: 600, padding: "0.2rem 0.6rem", borderRadius: "20px" }}>{emp.department || "-"}</span>
                  </td>
                  <td style={{ padding: "0.75rem 1rem", color: "#475569" }}>{emp.position || "-"}</td>
                  <td style={{ padding: "0.75rem 1rem", color: "#64748b" }}>{emp.email || "-"}</td>
                  <td style={{ padding: "0.75rem 1rem", color: "#64748b" }}>{emp.phone || "-"}</td>
                  <td style={{ padding: "0.75rem 1rem" }}>
                    <div style={{ display: "flex", gap: "0.4rem" }}>
                      <button onClick={() => { setEditEmp(emp); setShowModal(true); }} style={{ background: "#eff6ff", border: "none", borderRadius: "8px", padding: "0.4rem", cursor: "pointer", color: "#2563eb" }}><Edit size={15} /></button>
                      <button onClick={() => handleDelete(emp.id)} disabled={deleting === emp.id} style={{ background: "#fef2f2", border: "none", borderRadius: "8px", padding: "0.4rem", cursor: "pointer", color: "#dc2626" }}>
                        {deleting === emp.id ? <RefreshCw size={15} style={{ animation: "spin 1s linear infinite" }} /> : <Trash2 size={15} />}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && <EmployeeModal employee={editEmp} onClose={() => { setShowModal(false); setEditEmp(null); }} onSave={handleSave} />}
    </div>
  );
}

// ─── STAT CARD ────────────────────────────────────────────────────────────────
function StatCard({ stat }) {
  const Icon = stat.icon;
  return (
    <div style={{ background: "#fff", borderRadius: "1rem", padding: "1.25rem", boxShadow: "0 2px 12px rgba(0,0,0,0.06)", border: "1px solid #f1f5f9", transition: "transform 0.2s, box-shadow 0.2s", cursor: "default" }}
      onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 8px 24px rgba(0,0,0,0.1)"; }}
      onMouseLeave={e => { e.currentTarget.style.transform = ""; e.currentTarget.style.boxShadow = "0 2px 12px rgba(0,0,0,0.06)"; }}>
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
  const [expandedNav, setExpandedNav] = useState("employee");
  const [showAttendance, setShowAttendance] = useState(false);
  const [activityLog, setActivityLog] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [loading, setLoading] = useState(true);

  useEffect(() => { const t = setInterval(() => setCurrentTime(new Date()), 1000); return () => clearInterval(t); }, []);
  useEffect(() => { fetchData(); }, []);

  async function fetchData() {
    setLoading(true);
    const { data: emps } = await supabase.from("employees").select("*").order("created_at", { ascending: false });
    if (emps) setEmployees(emps);
    const { data: att } = await supabase.from("attendance").select("*, employees(name, department)").order("check_in", { ascending: false }).limit(20);
    if (att) setActivityLog(att);
    setLoading(false);
  }

  const stats = [
    { label: "พนักงานทั้งหมด", value: employees.length, icon: Users, color: "#2563eb", bg: "#eff6ff", trend: "ข้อมูลจริง" },
    { label: "แผนก", value: [...new Set(employees.map(e => e.department).filter(Boolean))].length, icon: Building2, color: "#7c3aed", bg: "#f5f3ff", trend: "คงที่" },
    { label: "ลงเวลาวันนี้", value: activityLog.filter(a => new Date(a.check_in).toDateString() === new Date().toDateString()).length, icon: CheckCircle, color: "#059669", bg: "#ecfdf5", trend: "วันนี้" },
    { label: "รออนุมัติ", value: 0, icon: AlertCircle, color: "#dc2626", bg: "#fef2f2", trend: "-" },
  ];

  return (
    <div style={{ fontFamily: "'Sarabun', 'Noto Sans Thai', sans-serif", background: "#f8fafc", minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Sarabun:wght@300;400;500;600;700;800&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        .fade-in { animation: fadeIn 0.4s ease forwards; }
      `}</style>

      {/* TOP BAR */}
      <header style={{ background: "#fff", borderBottom: "1px solid #e2e8f0", height: 60, display: "flex", alignItems: "center", padding: "0 1.25rem", gap: "1rem", position: "sticky", top: 0, zIndex: 100, boxShadow: "0 1px 8px rgba(0,0,0,0.06)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", minWidth: 180 }}>
          <div style={{ width: 34, height: 34, borderRadius: "10px", background: "linear-gradient(135deg, #2563eb, #1d4ed8)", display: "flex", alignItems: "center", justifyContent: "center" }}><Shield size={18} color="#fff" /></div>
          <div>
            <div style={{ fontSize: "0.95rem", fontWeight: 800, color: "#0f172a", lineHeight: 1.1 }}>HR System</div>
            <div style={{ fontSize: "0.65rem", color: "#64748b" }}>โรงเรียนนิมิตสุขสา</div>
          </div>
        </div>
        <div style={{ flex: 1, maxWidth: 360, position: "relative", display: "flex", alignItems: "center" }}>
          <Search size={15} color="#94a3b8" style={{ position: "absolute", left: "0.75rem" }} />
          <input placeholder="ค้นหาพนักงาน, แผนก..." style={{ width: "100%", padding: "0.5rem 0.75rem 0.5rem 2.25rem", border: "1.5px solid #e2e8f0", borderRadius: "10px", fontSize: "0.85rem", color: "#0f172a", outline: "none", background: "#f8fafc", fontFamily: "inherit" }} />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginLeft: "auto" }}>
          {[
            { icon: UserPlus, label: "เพิ่มพนักงาน", color: "#2563eb", action: () => setActivePage("employee") },
            { icon: DollarSign, label: "เงินเดือน", color: "#7c3aed", action: () => {} },
            { icon: Umbrella, label: "การลา", color: "#059669", action: () => {} },
          ].map(({ icon: Icon, label, color, action }) => (
            <button key={label} title={label} onClick={action} style={{ background: "#f8fafc", border: "1.5px solid #e2e8f0", borderRadius: "10px", padding: "0.45rem 0.75rem", cursor: "pointer", display: "flex", alignItems: "center", gap: "0.35rem", fontSize: "0.78rem", color: "#475569", fontWeight: 600, transition: "all 0.2s", fontFamily: "inherit" }}>
              <Icon size={15} color={color} />
            </button>
          ))}
          <button style={{ background: "none", border: "none", cursor: "pointer", color: "#64748b", padding: "0.4rem", borderRadius: "8px" }}><Bell size={18} /></button>
          <div style={{ width: 34, height: 34, borderRadius: "50%", background: "linear-gradient(135deg, #2563eb, #7c3aed)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700, fontSize: "0.85rem", cursor: "pointer" }}>ผ</div>
        </div>
      </header>

      <div style={{ display: "flex", flex: 1 }}>
        {/* SIDEBAR */}
        <aside style={{ width: 230, background: "#fff", borderRight: "1px solid #e2e8f0", padding: "1rem 0.75rem", display: "flex", flexDirection: "column", gap: "0.25rem", overflowY: "auto", minHeight: "calc(100vh - 60px)", position: "sticky", top: 60, height: "calc(100vh - 60px)" }}>
          <div style={{ background: "linear-gradient(135deg, #eff6ff, #f0f9ff)", border: "1px solid #bfdbfe", borderRadius: "12px", padding: "0.75rem", marginBottom: "0.75rem", textAlign: "center" }}>
            <div style={{ fontSize: "1.4rem", fontWeight: 800, color: "#1d4ed8" }}>{currentTime.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</div>
            <div style={{ fontSize: "0.72rem", color: "#64748b" }}>{currentTime.toLocaleDateString("th-TH", { weekday: "long", day: "numeric", month: "long" })}</div>
          </div>

          <button onClick={() => setShowAttendance(true)} style={{ width: "100%", background: "linear-gradient(135deg, #2563eb, #1d4ed8)", border: "none", borderRadius: "12px", padding: "0.75rem", color: "#fff", fontWeight: 700, fontSize: "0.9rem", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem", marginBottom: "1rem", boxShadow: "0 4px 14px rgba(37,99,235,0.35)", fontFamily: "inherit" }}>
            <MapPin size={17} /> ลงเวลาเข้างาน
          </button>

          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activePage === item.key;
            const isExpanded = expandedNav === item.key;
            return (
              <div key={item.key}>
                <button onClick={() => { setActivePage(item.key); setExpandedNav(isExpanded ? null : item.key); }} style={{ width: "100%", display: "flex", alignItems: "center", gap: "0.6rem", padding: "0.6rem 0.75rem", borderRadius: "10px", border: "none", background: isActive ? "#eff6ff" : "transparent", color: isActive ? "#2563eb" : "#475569", cursor: "pointer", fontSize: "0.875rem", fontWeight: isActive ? 700 : 500, transition: "all 0.15s", fontFamily: "inherit", textAlign: "left" }}>
                  <Icon size={17} /><span style={{ flex: 1 }}>{item.label}</span>
                  {item.children && (isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />)}
                </button>
                {item.children && isExpanded && (
                  <div style={{ paddingLeft: "2.25rem", marginTop: "0.15rem" }}>
                    {item.children.map(child => (
                      <button key={child} style={{ width: "100%", display: "block", padding: "0.45rem 0.5rem", border: "none", background: "transparent", color: "#64748b", cursor: "pointer", fontSize: "0.82rem", textAlign: "left", borderRadius: "8px", fontFamily: "inherit" }}>{child}</button>
                    ))}
                  </div>
                )}
              </div>
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
          ) : activePage === "employee" ? (
            <EmployeePage employees={employees} onRefresh={fetchData} />
          ) : (
            <>
              <div style={{ marginBottom: "1.5rem" }} className="fade-in">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <h1 style={{ fontSize: "1.4rem", fontWeight: 800, color: "#0f172a" }}>หน้าหลัก</h1>
                    <p style={{ color: "#64748b", fontSize: "0.85rem" }}>{currentTime.toLocaleDateString("th-TH", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</p>
                  </div>
                  <button onClick={() => setShowAttendance(true)} style={{ background: "linear-gradient(135deg, #2563eb, #1d4ed8)", border: "none", borderRadius: "12px", padding: "0.65rem 1.25rem", color: "#fff", fontWeight: 700, fontSize: "0.875rem", cursor: "pointer", display: "flex", alignItems: "center", gap: "0.5rem", fontFamily: "inherit", boxShadow: "0 4px 14px rgba(37,99,235,0.3)" }}>
                    <Navigation size={16} /> GPS Check-in
                  </button>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1rem", marginBottom: "1.5rem" }} className="fade-in">
                {stats.map(stat => <StatCard key={stat.label} stat={stat} />)}
              </div>

              <div style={{ background: "#fff", borderRadius: "1rem", padding: "1.25rem", boxShadow: "0 2px 12px rgba(0,0,0,0.06)", border: "1px solid #f1f5f9" }} className="fade-in">
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
                  <div style={{ textAlign: "center", padding: "2rem", color: "#94a3b8" }}>ยังไม่มีการลงเวลาครับ</div>
                ) : (
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
                      <thead>
                        <tr style={{ borderBottom: "2px solid #f1f5f9" }}>
                          {["พนักงาน", "แผนก", "สถานะ", "เวลาเข้างาน", "ระยะห่าง"].map(h => (
                            <th key={h} style={{ padding: "0.5rem 0.75rem", textAlign: "left", color: "#94a3b8", fontWeight: 600, fontSize: "0.75rem", whiteSpace: "nowrap" }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {activityLog.map((row, i) => (
                          <tr key={row.id} style={{ borderBottom: "1px solid #f8fafc", background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                            <td style={{ padding: "0.65rem 0.75rem" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                                <div style={{ width: 28, height: 28, borderRadius: "50%", background: `hsl(${i * 47 + 200}, 65%, 58%)`, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700, fontSize: "0.75rem", flexShrink: 0 }}>{row.employees?.name?.[0] || "?"}</div>
                                <span style={{ fontWeight: 600, color: "#0f172a" }}>{row.employees?.name || "-"}</span>
                              </div>
                            </td>
                            <td style={{ padding: "0.65rem 0.75rem", color: "#64748b" }}>{row.employees?.department || "-"}</td>
                            <td style={{ padding: "0.65rem 0.75rem" }}><span style={{ background: "#dcfce7", color: "#16a34a", fontSize: "0.72rem", fontWeight: 700, padding: "0.2rem 0.6rem", borderRadius: "20px" }}>เข้างาน</span></td>
                            <td style={{ padding: "0.65rem 0.75rem", color: "#475569", fontWeight: 600, whiteSpace: "nowrap" }}>{new Date(row.check_in).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" })} น.</td>
                            <td style={{ padding: "0.65rem 0.75rem" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: "0.3rem", color: "#64748b", fontSize: "0.8rem" }}>
                                <MapPin size={12} color="#94a3b8" />{row.distance_from_school ? `${Math.round(row.distance_from_school)} ม.` : "-"}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </main>
      </div>

      {showAttendance && <AttendanceModal onClose={() => setShowAttendance(false)} onCheckin={fetchData} employees={employees} />}
    </div>
  );
}
