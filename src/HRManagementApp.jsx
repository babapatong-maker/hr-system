import { useState, useEffect, useCallback } from "react";
import {
  Users, Building2, Clock, CheckCircle, XCircle, MapPin,
  Navigation, LogIn, LogOut, Settings, Bell, Search,
  ChevronDown, ChevronRight, BarChart3, FileText, Calendar,
  Shield, Wifi, WifiOff, RefreshCw, UserPlus, DollarSign,
  Umbrella, AlertCircle, TrendingUp, Activity, Home, Menu, X
} from "lucide-react";

// ─── SCHOOL COORDINATES (สมมติว่าโรงเรียนอยู่ที่กรุงเทพ) ───────────────────
const SCHOOL_LAT = 13.7563;
const SCHOOL_LNG = 100.5018;
const GEOFENCE_RADIUS = 100; // meters

// ─── HAVERSINE FORMULA ──────────────────────────────────────────────────────
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

// ─── MOCK DATA ───────────────────────────────────────────────────────────────
const mockStats = [
  { label: "พนักงานทั้งหมด", value: 128, icon: Users, color: "#2563eb", bg: "#eff6ff", trend: "+4 เดือนนี้" },
  { label: "แผนก", value: 8, icon: Building2, color: "#7c3aed", bg: "#f5f3ff", trend: "คงที่" },
  { label: "รออนุมัติ", value: 12, icon: AlertCircle, color: "#dc2626", bg: "#fef2f2", trend: "3 ใหม่วันนี้" },
  { label: "เข้างานวันนี้", value: 95, icon: CheckCircle, color: "#059669", bg: "#ecfdf5", trend: "74.2%" },
];

const mockActivity = [
  { id: 1, name: "สมชาย ใจดี", action: "เข้างาน", time: "08:02", location: "โรงเรียน A", type: "in", dept: "วิชาการ" },
  { id: 2, name: "สุดา รักเรียน", action: "ออกงาน", time: "17:05", location: "โรงเรียน A", type: "out", dept: "บริหาร" },
  { id: 3, name: "วิชัย มั่นใจ", action: "เข้างาน", time: "07:58", location: "โรงเรียน A", type: "in", dept: "พละศึกษา" },
  { id: 4, name: "นงลักษณ์ ขยัน", action: "ลาป่วย", time: "09:00", location: "-", type: "leave", dept: "คณิตศาสตร์" },
  { id: 5, name: "ประสิทธิ์ ดีงาม", action: "เข้างาน", time: "08:15", location: "โรงเรียน A", type: "in", dept: "ภาษาไทย" },
  { id: 6, name: "รัตนา สว่าง", action: "ออกงาน", time: "16:45", location: "โรงเรียน A", type: "out", dept: "ศิลปะ" },
];

const navItems = [
  { icon: Home, label: "หน้าหลัก", key: "dashboard" },
  {
    icon: Users, label: "ข้อมูลพนักงาน", key: "employee",
    children: ["รายชื่อพนักงาน", "เพิ่มพนักงาน", "แผนกและตำแหน่ง"]
  },
  {
    icon: Clock, label: "การจัดการเวลา", key: "time",
    children: ["ลงเวลาเข้า-ออก", "ตารางงาน", "การลา"]
  },
  { icon: BarChart3, label: "รายงาน", key: "report" },
  { icon: FileText, label: "บันทึกกิจกรรม", key: "logs" },
];

// ─── ATTENDANCE COMPONENT ────────────────────────────────────────────────────
function AttendanceModal({ onClose, onCheckin }) {
  const [gpsState, setGpsState] = useState("idle"); // idle | loading | success | error
  const [coords, setCoords] = useState(null);
  const [distance, setDistance] = useState(null);
  const [checkedIn, setCheckedIn] = useState(false);
  const [checkTime, setCheckTime] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [pulse, setPulse] = useState(false);

  const fetchLocation = useCallback(() => {
    setGpsState("loading");
    setErrorMsg("");
    if (!navigator.geolocation) {
      setGpsState("error");
      setErrorMsg("เบราว์เซอร์ไม่รองรับ GPS");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        setCoords({ lat: latitude, lng: longitude });
        const dist = haversineDistance(latitude, longitude, SCHOOL_LAT, SCHOOL_LNG);
        setDistance(Math.round(dist));
        setGpsState("success");
        setPulse(true);
        setTimeout(() => setPulse(false), 600);
      },
      (err) => {
        // Demo mode: simulate being inside geofence
        const demoLat = SCHOOL_LAT + (Math.random() - 0.5) * 0.0008;
        const demoLng = SCHOOL_LNG + (Math.random() - 0.5) * 0.0008;
        setCoords({ lat: demoLat, lng: demoLng });
        const dist = haversineDistance(demoLat, demoLng, SCHOOL_LAT, SCHOOL_LNG);
        setDistance(Math.round(dist));
        setGpsState("success");
      },
      { timeout: 8000, enableHighAccuracy: true }
    );
  }, []);

  useEffect(() => { fetchLocation(); }, [fetchLocation]);

  const isInZone = distance !== null && distance <= GEOFENCE_RADIUS;

  const handleCheckin = () => {
    if (!isInZone || checkedIn) return;
    const now = new Date();
    setCheckTime(now.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
    setCheckedIn(true);
    onCheckin && onCheckin({ time: now, coords, distance });
  };

  const ringColor = gpsState === "success" ? (isInZone ? "#10b981" : "#ef4444") : "#94a3b8";
  const pct = distance !== null ? Math.min(distance / GEOFENCE_RADIUS, 1) : 0;
  const circumference = 2 * Math.PI * 54;
  const dashOffset = circumference * pct;

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(15,23,42,0.7)", backdropFilter: "blur(6px)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: "1rem"
    }}>
      <div style={{
        background: "#fff", borderRadius: "1.5rem", width: "100%", maxWidth: "420px",
        boxShadow: "0 32px 80px rgba(0,0,0,0.25)", overflow: "hidden",
        fontFamily: "'Sarabun', 'Noto Sans Thai', sans-serif"
      }}>
        {/* Header */}
        <div style={{
          background: "linear-gradient(135deg, #1d4ed8 0%, #2563eb 60%, #3b82f6 100%)",
          padding: "1.5rem", position: "relative"
        }}>
          <button onClick={onClose} style={{
            position: "absolute", top: "1rem", right: "1rem",
            background: "rgba(255,255,255,0.2)", border: "none", borderRadius: "50%",
            width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer", color: "#fff"
          }}><X size={16} /></button>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", color: "#fff" }}>
            <div style={{
              background: "rgba(255,255,255,0.2)", borderRadius: "12px",
              padding: "0.5rem", display: "flex"
            }}>
              <Clock size={22} />
            </div>
            <div>
              <div style={{ fontSize: "0.75rem", opacity: 0.8 }}>ระบบลงเวลา</div>
              <div style={{ fontSize: "1.1rem", fontWeight: 700 }}>ลงเวลาเข้างาน</div>
            </div>
          </div>
          <div style={{
            color: "rgba(255,255,255,0.9)", fontSize: "0.85rem", marginTop: "0.75rem",
            background: "rgba(255,255,255,0.1)", borderRadius: "8px", padding: "0.5rem 0.75rem"
          }}>
            📍 โรงเรียน A — รัศมี {GEOFENCE_RADIUS} เมตร
          </div>
        </div>

        <div style={{ padding: "1.75rem" }}>
          {/* GPS Ring Meter */}
          <div style={{ display: "flex", justifyContent: "center", marginBottom: "1.5rem" }}>
            <div style={{ position: "relative", width: 140, height: 140 }}>
              <svg width={140} height={140} style={{ transform: "rotate(-90deg)" }}>
                <circle cx={70} cy={70} r={54} fill="none" stroke="#f1f5f9" strokeWidth={10} />
                <circle cx={70} cy={70} r={54} fill="none"
                  stroke={ringColor} strokeWidth={10}
                  strokeDasharray={circumference}
                  strokeDashoffset={gpsState === "success" ? circumference - dashOffset * circumference / circumference : circumference}
                  strokeLinecap="round"
                  style={{ transition: "stroke-dashoffset 0.8s ease, stroke 0.4s ease" }}
                />
              </svg>
              <div style={{
                position: "absolute", inset: 0, display: "flex", flexDirection: "column",
                alignItems: "center", justifyContent: "center"
              }}>
                {gpsState === "loading" && (
                  <RefreshCw size={28} color="#2563eb" style={{ animation: "spin 1s linear infinite" }} />
                )}
                {gpsState === "success" && (
                  <>
                    <Navigation size={20} color={ringColor} />
                    <div style={{ fontSize: "1.5rem", fontWeight: 800, color: ringColor, lineHeight: 1.1 }}>
                      {distance}
                    </div>
                    <div style={{ fontSize: "0.7rem", color: "#64748b" }}>เมตร</div>
                  </>
                )}
                {gpsState === "error" && <WifiOff size={28} color="#ef4444" />}
              </div>
            </div>
          </div>

          {/* Status Badge */}
          {gpsState === "success" && (
            <div style={{
              textAlign: "center", marginBottom: "1.25rem",
              background: isInZone ? "#ecfdf5" : "#fef2f2",
              border: `1.5px solid ${isInZone ? "#6ee7b7" : "#fca5a5"}`,
              borderRadius: "12px", padding: "0.75rem"
            }}>
              <div style={{
                fontSize: "1rem", fontWeight: 700,
                color: isInZone ? "#059669" : "#dc2626"
              }}>
                {isInZone ? "✅ คุณอยู่ในพื้นที่" : "❌ อยู่นอกพื้นที่"}
              </div>
              <div style={{ fontSize: "0.8rem", color: "#64748b", marginTop: "0.25rem" }}>
                ห่างจากโรงเรียน {distance} เมตร
                {!isInZone && ` (ต้องอยู่ภายใน ${GEOFENCE_RADIUS} เมตร)`}
              </div>
              {coords && (
                <div style={{ fontSize: "0.7rem", color: "#94a3b8", marginTop: "0.25rem" }}>
                  GPS: {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}
                </div>
              )}
            </div>
          )}

          {gpsState === "loading" && (
            <div style={{ textAlign: "center", color: "#64748b", marginBottom: "1.25rem", fontSize: "0.9rem" }}>
              🛰️ กำลังรับสัญญาณ GPS...
            </div>
          )}

          {/* Checkin Success */}
          {checkedIn && (
            <div style={{
              background: "#f0fdf4", border: "1.5px solid #86efac",
              borderRadius: "12px", padding: "1rem", marginBottom: "1.25rem", textAlign: "center"
            }}>
              <CheckCircle size={32} color="#16a34a" style={{ margin: "0 auto 0.5rem" }} />
              <div style={{ fontWeight: 700, color: "#15803d", fontSize: "1rem" }}>ลงเวลาสำเร็จ!</div>
              <div style={{ color: "#166534", fontSize: "0.85rem" }}>เวลา {checkTime} น.</div>
            </div>
          )}

          {/* Buttons */}
          <div style={{ display: "flex", gap: "0.75rem" }}>
            <button onClick={fetchLocation} style={{
              flex: 1, padding: "0.75rem", borderRadius: "10px",
              border: "1.5px solid #e2e8f0", background: "#f8fafc",
              cursor: "pointer", display: "flex", alignItems: "center",
              justifyContent: "center", gap: "0.4rem",
              color: "#475569", fontSize: "0.9rem", fontWeight: 600
            }}>
              <RefreshCw size={16} /> อัปเดต GPS
            </button>
            <button
              onClick={handleCheckin}
              disabled={!isInZone || checkedIn || gpsState !== "success"}
              style={{
                flex: 2, padding: "0.75rem", borderRadius: "10px",
                border: "none", fontWeight: 700, fontSize: "0.95rem",
                cursor: isInZone && !checkedIn && gpsState === "success" ? "pointer" : "not-allowed",
                background: checkedIn ? "#dcfce7"
                  : isInZone && gpsState === "success" ? "linear-gradient(135deg, #2563eb, #1d4ed8)"
                    : "#e2e8f0",
                color: checkedIn ? "#16a34a"
                  : isInZone && gpsState === "success" ? "#fff" : "#94a3b8",
                transition: "all 0.3s ease",
                display: "flex", alignItems: "center", justifyContent: "center", gap: "0.4rem"
              }}
            >
              <LogIn size={18} />
              {checkedIn ? "ลงเวลาแล้ว" : "ลงเวลาเข้างาน"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── STAT CARD ───────────────────────────────────────────────────────────────
function StatCard({ stat }) {
  const Icon = stat.icon;
  return (
    <div style={{
      background: "#fff", borderRadius: "1rem", padding: "1.25rem",
      boxShadow: "0 2px 12px rgba(0,0,0,0.06)", border: "1px solid #f1f5f9",
      transition: "transform 0.2s, box-shadow 0.2s",
      cursor: "default"
    }}
      onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 8px 24px rgba(0,0,0,0.1)"; }}
      onMouseLeave={e => { e.currentTarget.style.transform = ""; e.currentTarget.style.boxShadow = "0 2px 12px rgba(0,0,0,0.06)"; }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ color: "#64748b", fontSize: "0.8rem", fontWeight: 500, marginBottom: "0.4rem" }}>{stat.label}</div>
          <div style={{ fontSize: "2rem", fontWeight: 800, color: "#0f172a", lineHeight: 1 }}>{stat.value}</div>
          <div style={{ fontSize: "0.72rem", color: stat.color, marginTop: "0.35rem", fontWeight: 600 }}>{stat.trend}</div>
        </div>
        <div style={{
          background: stat.bg, borderRadius: "12px", padding: "0.6rem",
          display: "flex", alignItems: "center", justifyContent: "center"
        }}>
          <Icon size={22} color={stat.color} />
        </div>
      </div>
    </div>
  );
}

// ─── MAIN APP ────────────────────────────────────────────────────────────────
export default function HRApp() {
  const [activePage, setActivePage] = useState("dashboard");
  const [expandedNav, setExpandedNav] = useState("time");
  const [showAttendance, setShowAttendance] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activityLog, setActivityLog] = useState(mockActivity);
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const t = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const handleCheckin = ({ time, coords, distance }) => {
    const entry = {
      id: Date.now(),
      name: "ผู้ใช้งาน (คุณ)",
      action: "เข้างาน",
      time: time.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" }),
      location: `${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}`,
      type: "in",
      dept: "ระบบ GPS"
    };
    setActivityLog(prev => [entry, ...prev]);
  };

  const actionBadge = (type) => {
    const cfg = {
      in: { bg: "#dcfce7", color: "#16a34a", label: "เข้างาน" },
      out: { bg: "#fef3c7", color: "#d97706", label: "ออกงาน" },
      leave: { bg: "#fce7f3", color: "#be185d", label: "ลา" },
    };
    const c = cfg[type] || cfg.in;
    return (
      <span style={{
        background: c.bg, color: c.color, fontSize: "0.72rem",
        fontWeight: 700, padding: "0.2rem 0.6rem", borderRadius: "20px"
      }}>{c.label}</span>
    );
  };

  return (
    <div style={{
      fontFamily: "'Sarabun', 'Noto Sans Thai', sans-serif",
      background: "#f8fafc", minHeight: "100vh", display: "flex", flexDirection: "column"
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Sarabun:wght@300;400;500;600;700;800&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        .fade-in { animation: fadeIn 0.4s ease forwards; }
        ::-webkit-scrollbar { width: 5px; } 
        ::-webkit-scrollbar-track { background: #f1f5f9; }
        ::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 10px; }
      `}</style>

      {/* ── TOP BAR ── */}
      <header style={{
        background: "#fff", borderBottom: "1px solid #e2e8f0",
        height: 60, display: "flex", alignItems: "center",
        padding: "0 1.25rem", gap: "1rem", position: "sticky", top: 0, zIndex: 100,
        boxShadow: "0 1px 8px rgba(0,0,0,0.06)"
      }}>
        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", minWidth: 180 }}>
          <button onClick={() => setSidebarOpen(o => !o)} style={{
            display: "none", background: "none", border: "none", cursor: "pointer", color: "#475569",
            "@media(maxWidth:768px)": { display: "flex" }
          }} className="mobile-menu">
            <Menu size={20} />
          </button>
          <div style={{
            width: 34, height: 34, borderRadius: "10px",
            background: "linear-gradient(135deg, #2563eb, #1d4ed8)",
            display: "flex", alignItems: "center", justifyContent: "center"
          }}>
            <Shield size={18} color="#fff" />
          </div>
          <div>
            <div style={{ fontSize: "0.95rem", fontWeight: 800, color: "#0f172a", lineHeight: 1.1 }}>HR System</div>
            <div style={{ fontSize: "0.65rem", color: "#64748b" }}>โรงเรียน A</div>
          </div>
        </div>

        {/* Search */}
        <div style={{
          flex: 1, maxWidth: 360, position: "relative", display: "flex", alignItems: "center"
        }}>
          <Search size={15} color="#94a3b8" style={{ position: "absolute", left: "0.75rem" }} />
          <input placeholder="ค้นหาพนักงาน, แผนก..." style={{
            width: "100%", padding: "0.5rem 0.75rem 0.5rem 2.25rem",
            border: "1.5px solid #e2e8f0", borderRadius: "10px",
            fontSize: "0.85rem", color: "#0f172a", outline: "none",
            background: "#f8fafc", fontFamily: "inherit"
          }} />
        </div>

        {/* Quick Actions */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginLeft: "auto" }}>
          {[
            { icon: UserPlus, label: "เพิ่มพนักงาน", color: "#2563eb" },
            { icon: DollarSign, label: "เงินเดือน", color: "#7c3aed" },
            { icon: Umbrella, label: "การลา", color: "#059669" },
          ].map(({ icon: Icon, label, color }) => (
            <button key={label} title={label} style={{
              background: "#f8fafc", border: "1.5px solid #e2e8f0",
              borderRadius: "10px", padding: "0.45rem 0.75rem",
              cursor: "pointer", display: "flex", alignItems: "center", gap: "0.35rem",
              fontSize: "0.78rem", color: "#475569", fontWeight: 600,
              transition: "all 0.2s", fontFamily: "inherit"
            }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = color; e.currentTarget.style.color = color; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = "#e2e8f0"; e.currentTarget.style.color = "#475569"; }}
            >
              <Icon size={15} color={color} />
              <span style={{ display: "none" }} className="btn-label">{label}</span>
            </button>
          ))}
          <div style={{ width: 1, height: 28, background: "#e2e8f0", margin: "0 0.25rem" }} />
          <button style={{
            background: "none", border: "none", cursor: "pointer", color: "#64748b",
            padding: "0.4rem", borderRadius: "8px", position: "relative"
          }}>
            <Bell size={18} />
            <span style={{
              position: "absolute", top: 4, right: 4, width: 8, height: 8,
              background: "#ef4444", borderRadius: "50%", border: "2px solid #fff"
            }} />
          </button>
          <div style={{
            width: 34, height: 34, borderRadius: "50%",
            background: "linear-gradient(135deg, #2563eb, #7c3aed)",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "#fff", fontWeight: 700, fontSize: "0.85rem", cursor: "pointer"
          }}>ผ</div>
        </div>
      </header>

      <div style={{ display: "flex", flex: 1 }}>
        {/* ── SIDEBAR ── */}
        <aside style={{
          width: 230, background: "#fff", borderRight: "1px solid #e2e8f0",
          padding: "1rem 0.75rem", display: "flex", flexDirection: "column",
          gap: "0.25rem", overflowY: "auto", minHeight: "calc(100vh - 60px)",
          position: "sticky", top: 60, height: "calc(100vh - 60px)"
        }}>
          {/* Clock */}
          <div style={{
            background: "linear-gradient(135deg, #eff6ff, #f0f9ff)",
            border: "1px solid #bfdbfe", borderRadius: "12px",
            padding: "0.75rem", marginBottom: "0.75rem", textAlign: "center"
          }}>
            <div style={{ fontSize: "1.4rem", fontWeight: 800, color: "#1d4ed8", letterSpacing: "0.05em" }}>
              {currentTime.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
            </div>
            <div style={{ fontSize: "0.72rem", color: "#64748b" }}>
              {currentTime.toLocaleDateString("th-TH", { weekday: "long", day: "numeric", month: "long" })}
            </div>
          </div>

          {/* GPS Check-in Button */}
          <button onClick={() => setShowAttendance(true)} style={{
            width: "100%", background: "linear-gradient(135deg, #2563eb, #1d4ed8)",
            border: "none", borderRadius: "12px", padding: "0.75rem",
            color: "#fff", fontWeight: 700, fontSize: "0.9rem",
            cursor: "pointer", display: "flex", alignItems: "center",
            justifyContent: "center", gap: "0.5rem", marginBottom: "1rem",
            boxShadow: "0 4px 14px rgba(37,99,235,0.35)", fontFamily: "inherit",
            transition: "transform 0.2s"
          }}
            onMouseEnter={e => e.currentTarget.style.transform = "translateY(-1px)"}
            onMouseLeave={e => e.currentTarget.style.transform = ""}
          >
            <MapPin size={17} /> ลงเวลาเข้างาน
          </button>

          {/* Nav Items */}
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activePage === item.key;
            const isExpanded = expandedNav === item.key;
            return (
              <div key={item.key}>
                <button onClick={() => {
                  setActivePage(item.key);
                  setExpandedNav(isExpanded ? null : item.key);
                }} style={{
                  width: "100%", display: "flex", alignItems: "center", gap: "0.6rem",
                  padding: "0.6rem 0.75rem", borderRadius: "10px", border: "none",
                  background: isActive ? "#eff6ff" : "transparent",
                  color: isActive ? "#2563eb" : "#475569",
                  cursor: "pointer", fontSize: "0.875rem", fontWeight: isActive ? 700 : 500,
                  transition: "all 0.15s", fontFamily: "inherit", textAlign: "left"
                }}
                  onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = "#f8fafc"; }}
                  onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = "transparent"; }}
                >
                  <Icon size={17} />
                  <span style={{ flex: 1 }}>{item.label}</span>
                  {item.children && (
                    isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />
                  )}
                </button>
                {item.children && isExpanded && (
                  <div style={{ paddingLeft: "2.25rem", marginTop: "0.15rem" }}>
                    {item.children.map(child => (
                      <button key={child} style={{
                        width: "100%", display: "block", padding: "0.45rem 0.5rem",
                        border: "none", background: "transparent", color: "#64748b",
                        cursor: "pointer", fontSize: "0.82rem", textAlign: "left",
                        borderRadius: "8px", fontFamily: "inherit",
                        transition: "color 0.15s"
                      }}
                        onMouseEnter={e => e.currentTarget.style.color = "#2563eb"}
                        onMouseLeave={e => e.currentTarget.style.color = "#64748b"}
                      >{child}</button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {/* Settings at bottom */}
          <div style={{ marginTop: "auto", paddingTop: "1rem", borderTop: "1px solid #f1f5f9" }}>
            <button style={{
              width: "100%", display: "flex", alignItems: "center", gap: "0.6rem",
              padding: "0.6rem 0.75rem", borderRadius: "10px", border: "none",
              background: "transparent", color: "#94a3b8", cursor: "pointer",
              fontSize: "0.875rem", fontFamily: "inherit"
            }}>
              <Settings size={17} /> การตั้งค่า
            </button>
          </div>
        </aside>

        {/* ── MAIN CONTENT ── */}
        <main style={{ flex: 1, padding: "1.5rem", overflowY: "auto", minHeight: "calc(100vh - 60px)" }}>
          {/* Page Title */}
          <div style={{ marginBottom: "1.5rem" }} className="fade-in">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <h1 style={{ fontSize: "1.4rem", fontWeight: 800, color: "#0f172a" }}>หน้าหลัก</h1>
                <p style={{ color: "#64748b", fontSize: "0.85rem" }}>
                  {currentTime.toLocaleDateString("th-TH", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
                </p>
              </div>
              <button onClick={() => setShowAttendance(true)} style={{
                background: "linear-gradient(135deg, #2563eb, #1d4ed8)",
                border: "none", borderRadius: "12px", padding: "0.65rem 1.25rem",
                color: "#fff", fontWeight: 700, fontSize: "0.875rem",
                cursor: "pointer", display: "flex", alignItems: "center",
                gap: "0.5rem", fontFamily: "inherit",
                boxShadow: "0 4px 14px rgba(37,99,235,0.3)"
              }}>
                <Navigation size={16} /> GPS Check-in
              </button>
            </div>
          </div>

          {/* Stat Cards */}
          <div style={{
            display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: "1rem", marginBottom: "1.5rem"
          }} className="fade-in">
            {mockStats.map(stat => <StatCard key={stat.label} stat={stat} />)}
          </div>

          {/* Charts Row */}
          <div style={{
            display: "grid", gridTemplateColumns: "1fr 1fr",
            gap: "1rem", marginBottom: "1.5rem"
          }} className="fade-in">
            {/* Attendance Overview */}
            <div style={{
              background: "#fff", borderRadius: "1rem", padding: "1.25rem",
              boxShadow: "0 2px 12px rgba(0,0,0,0.06)", border: "1px solid #f1f5f9"
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
                <div style={{ fontWeight: 700, color: "#0f172a", fontSize: "0.95rem" }}>ภาพรวมการเข้างาน</div>
                <TrendingUp size={16} color="#2563eb" />
              </div>
              {[
                { label: "เข้างานปกติ", value: 74, color: "#2563eb" },
                { label: "มาสาย", value: 12, color: "#f59e0b" },
                { label: "ขาดงาน", value: 8, color: "#ef4444" },
                { label: "ลา", value: 6, color: "#8b5cf6" },
              ].map(row => (
                <div key={row.label} style={{ marginBottom: "0.75rem" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8rem", marginBottom: "0.25rem" }}>
                    <span style={{ color: "#475569" }}>{row.label}</span>
                    <span style={{ fontWeight: 700, color: "#0f172a" }}>{row.value}%</span>
                  </div>
                  <div style={{ height: 8, background: "#f1f5f9", borderRadius: "10px", overflow: "hidden" }}>
                    <div style={{
                      height: "100%", width: `${row.value}%`, background: row.color,
                      borderRadius: "10px", transition: "width 1s ease"
                    }} />
                  </div>
                </div>
              ))}
            </div>

            {/* Pending Approvals */}
            <div style={{
              background: "#fff", borderRadius: "1rem", padding: "1.25rem",
              boxShadow: "0 2px 12px rgba(0,0,0,0.06)", border: "1px solid #f1f5f9"
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
                <div style={{ fontWeight: 700, color: "#0f172a", fontSize: "0.95rem" }}>รออนุมัติ</div>
                <span style={{
                  background: "#fef2f2", color: "#dc2626", fontSize: "0.72rem",
                  fontWeight: 700, padding: "0.2rem 0.6rem", borderRadius: "20px"
                }}>12 รายการ</span>
              </div>
              {[
                { name: "สมชาย ใจดี", type: "ลาป่วย 3 วัน", dept: "วิชาการ", urgent: true },
                { name: "วิภา สุขใจ", type: "OT 2 ชั่วโมง", dept: "การเงิน", urgent: false },
                { name: "นิคม ทำดี", type: "ลากิจ 1 วัน", dept: "พลศึกษา", urgent: false },
                { name: "ยุวดี รักงาน", type: "ลาพักร้อน 5 วัน", dept: "ศิลปะ", urgent: true },
              ].map((item, i) => (
                <div key={i} style={{
                  display: "flex", alignItems: "center", gap: "0.6rem",
                  padding: "0.6rem 0", borderBottom: i < 3 ? "1px solid #f8fafc" : "none"
                }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: "50%",
                    background: `hsl(${i * 60 + 200}, 70%, 60%)`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    color: "#fff", fontWeight: 700, fontSize: "0.8rem", flexShrink: 0
                  }}>{item.name[0]}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: "0.82rem", fontWeight: 600, color: "#0f172a" }}>{item.name}</div>
                    <div style={{ fontSize: "0.72rem", color: "#64748b" }}>{item.type} · {item.dept}</div>
                  </div>
                  {item.urgent && (
                    <span style={{
                      background: "#fef2f2", color: "#dc2626",
                      fontSize: "0.65rem", fontWeight: 700, padding: "0.15rem 0.4rem",
                      borderRadius: "6px", flexShrink: 0
                    }}>ด่วน</span>
                  )}
                  <div style={{ display: "flex", gap: "0.3rem" }}>
                    <button style={{
                      background: "#dcfce7", border: "none", borderRadius: "6px",
                      padding: "0.25rem", cursor: "pointer", color: "#16a34a"
                    }}><CheckCircle size={14} /></button>
                    <button style={{
                      background: "#fef2f2", border: "none", borderRadius: "6px",
                      padding: "0.25rem", cursor: "pointer", color: "#dc2626"
                    }}><XCircle size={14} /></button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Activity Log */}
          <div style={{
            background: "#fff", borderRadius: "1rem", padding: "1.25rem",
            boxShadow: "0 2px 12px rgba(0,0,0,0.06)", border: "1px solid #f1f5f9"
          }} className="fade-in">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <Activity size={18} color="#2563eb" />
                <div style={{ fontWeight: 700, color: "#0f172a", fontSize: "0.95rem" }}>กิจกรรมล่าสุด</div>
              </div>
              <button style={{
                background: "none", border: "1.5px solid #e2e8f0", borderRadius: "8px",
                padding: "0.35rem 0.75rem", fontSize: "0.78rem", color: "#475569",
                cursor: "pointer", fontFamily: "inherit"
              }}>ดูทั้งหมด</button>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
                <thead>
                  <tr style={{ borderBottom: "2px solid #f1f5f9" }}>
                    {["พนักงาน", "แผนก", "สถานะ", "เวลา", "ตำแหน่ง GPS"].map(h => (
                      <th key={h} style={{
                        padding: "0.5rem 0.75rem", textAlign: "left",
                        color: "#94a3b8", fontWeight: 600, fontSize: "0.75rem",
                        whiteSpace: "nowrap"
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {activityLog.map((row, i) => (
                    <tr key={row.id} style={{
                      borderBottom: "1px solid #f8fafc",
                      background: i % 2 === 0 ? "#fff" : "#fafafa",
                      transition: "background 0.15s"
                    }}
                      onMouseEnter={e => e.currentTarget.style.background = "#eff6ff"}
                      onMouseLeave={e => e.currentTarget.style.background = i % 2 === 0 ? "#fff" : "#fafafa"}
                    >
                      <td style={{ padding: "0.65rem 0.75rem" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                          <div style={{
                            width: 28, height: 28, borderRadius: "50%",
                            background: `hsl(${i * 47 + 200}, 65%, 58%)`,
                            display: "flex", alignItems: "center", justifyContent: "center",
                            color: "#fff", fontWeight: 700, fontSize: "0.75rem", flexShrink: 0
                          }}>{row.name[0]}</div>
                          <span style={{ fontWeight: 600, color: "#0f172a", whiteSpace: "nowrap" }}>{row.name}</span>
                        </div>
                      </td>
                      <td style={{ padding: "0.65rem 0.75rem", color: "#64748b" }}>{row.dept}</td>
                      <td style={{ padding: "0.65rem 0.75rem" }}>{actionBadge(row.type)}</td>
                      <td style={{ padding: "0.65rem 0.75rem", color: "#475569", fontWeight: 600, whiteSpace: "nowrap" }}>
                        {row.time} น.
                      </td>
                      <td style={{ padding: "0.65rem 0.75rem" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.3rem", color: "#64748b", fontSize: "0.8rem" }}>
                          <MapPin size={12} color="#94a3b8" />
                          <span style={{ whiteSpace: "nowrap" }}>{row.location}</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </main>
      </div>

      {/* GPS Attendance Modal */}
      {showAttendance && (
        <AttendanceModal
          onClose={() => setShowAttendance(false)}
          onCheckin={(data) => { handleCheckin(data); }}
        />
      )}
    </div>
  );
}
