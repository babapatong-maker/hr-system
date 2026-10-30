import { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabase";
import { ACADEMIC_CALENDAR_2_2569 } from "./academicCalendar.jsx";

// จองห้องสื่อการสอน — เก็บใน teaching_schedule (สร้างตารางใหม่ด้วย anon key ไม่ได้)
// 1 แถว = 1 การจอง: class_room=ROOM_BOOKING_ROOM, day_of_week=0 (ไม่ให้ไปปนตารางสอน),
// period = วันที่ YYYYMMDD, start/end_time = เวลาคาบ, subject = JSON {kind, room, date, period_no, subject, class_level, note}
export const ROOM_BOOKING_ROOM = "__ROOM_BOOKING__";
export const ROOM_BOOKING_ROOMS_ROOM = "__ROOM_BOOKING_ROOMS__"; // รายชื่อห้องที่แอดมินแก้ได้ (period=0)
export const DEFAULT_MEDIA_ROOMS = ["ห้องคอมพิวเตอร์", "ห้องวิทยาศาสตร์", "ห้องสมุด", "ห้องโสตทัศนูปกรณ์/ห้องประชุม"];
const CLASS_LEVELS = ["ตอ.", "อ.1", "อ.2", "อ.3", "ป.1", "ป.2", "ป.3", "ป.4", "ป.5", "ป.6", "ม.1", "ม.2", "ม.3"];
const PERIOD_TIMES = [["08:30", "09:20"], ["09:20", "10:10"], ["10:20", "11:10"], ["11:10", "12:00"], ["13:00", "13:50"], ["13:50", "14:40"]];
const DAY_LABELS = ["จ.", "อ.", "พ.", "พฤ.", "ศ."];

const pad = n => String(n).padStart(2, "0");
const todayKey = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" });
function shift(key, days) { const [y, m, d] = key.split("-").map(Number); const u = new Date(Date.UTC(y, m - 1, d + days)); return u.toISOString().slice(0, 10); }
function weekday(key) { const [y, m, d] = key.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); }
function monday(key) { const w = weekday(key); return shift(key, w === 0 ? -6 : 1 - w); }
const keyNum = key => Number(key.replace(/-/g, ""));
const numKey = n => { const s = String(n); return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`; };
function thaiDate(key) { const [y, m, d] = key.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString("th-TH", { weekday: "short", day: "numeric", month: "short", year: "2-digit", timeZone: "UTC" }); }
function calendarEvents(key) {
  const out = [];
  for (const m of ACADEMIC_CALENDAR_2_2569) for (const e of m.events || []) if (e.date === key) out.push(e);
  return out;
}
const HOLIDAY_RE = /(หยุด|วันพ่อ|วันแม่|ปีใหม่|มาฆ|จักรี|สงกรานต์|รัฐธรรมนูญ|ปิดภาค|สอบ)/;
function dayWarning(key) {
  const ev = calendarEvents(key).filter(e => !/ชดเชย/.test(e.title));
  const hit = ev.filter(e => e.color === "red" || HOLIDAY_RE.test(e.title));
  return hit.length ? hit.map(e => e.title).join(", ") : "";
}
function parseRow(row) {
  try { const j = JSON.parse(row.subject || "{}"); if (j.kind !== "room_booking") return null; return { ...j, id: row.id, employee_id: row.employee_id, created_at: row.created_at }; } catch { return null; }
}

export async function fetchBookingsBetween(fromKey, toKey) {
  const { data, error } = await supabase.from("teaching_schedule").select("id, employee_id, period, subject, created_at").eq("class_room", ROOM_BOOKING_ROOM).eq("day_of_week", 0).gte("period", keyNum(fromKey)).lte("period", keyNum(toKey));
  if (error) throw new Error(error.message);
  return (data || []).map(parseRow).filter(Boolean);
}
export async function createBooking({ employeeId, room, date, periodNo, subject, classLevel, note }) {
  const existing = (await fetchBookingsBetween(date, date)).find(b => b.room === room && Number(b.period_no) === Number(periodNo));
  if (existing) return { conflict: existing };
  const [s, e] = PERIOD_TIMES[periodNo - 1];
  const payload = { employee_id: employeeId, day_of_week: 0, period: keyNum(date), class_room: ROOM_BOOKING_ROOM, start_time: `${s}:00`, end_time: `${e}:00`,
    subject: JSON.stringify({ kind: "room_booking", room, date, period_no: Number(periodNo), subject, class_level: classLevel, note: note || "", booked_at: new Date().toISOString() }) };
  const { data, error } = await supabase.from("teaching_schedule").insert(payload).select("id").single();
  if (error) throw new Error(error.message);
  // กันจองชนกันพร้อมกัน: ถ้ามีคนอื่นจองช่องเดียวกันก่อน (id/เวลาเก่ากว่า) ให้ยกเลิกของเรา
  const again = (await fetchBookingsBetween(date, date)).filter(b => b.room === room && Number(b.period_no) === Number(periodNo)).sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)) || String(a.id).localeCompare(String(b.id)));
  if (again.length > 1 && String(again[0].id) !== String(data.id)) {
    await supabase.from("teaching_schedule").delete().eq("id", data.id);
    return { conflict: again[0] };
  }
  return { id: data.id };
}
export async function deleteBooking(id) {
  const { error } = await supabase.from("teaching_schedule").delete().eq("id", id).eq("class_room", ROOM_BOOKING_ROOM);
  if (error) throw new Error(error.message);
}

const card = { background: "#fff", borderRadius: 16, padding: "1.1rem", boxShadow: "0 1px 3px rgba(15,23,42,0.06)", border: "1px solid #eef2f7", marginBottom: "1rem" };
const input = { width: "100%", padding: "0.6rem 0.7rem", border: "1.5px solid #e2e8f0", borderRadius: 10, fontSize: "0.9rem", fontFamily: "inherit", color: "#233862", background: "#fff", boxSizing: "border-box" };
const label = { fontSize: "0.78rem", fontWeight: 700, color: "#475569", marginBottom: 4, display: "block" };
const btn = (bg, color = "#fff") => ({ background: bg, color, border: "none", borderRadius: 10, padding: "0.55rem 0.9rem", fontWeight: 700, fontFamily: "inherit", cursor: "pointer", fontSize: "0.85rem" });
const tab = active => ({ ...btn(active ? "#008CFF" : "#f1f5f9", active ? "#fff" : "#475569") });

export function RoomBookingPage({ employees = [], currentUser, canManage = false, isTestTeacher = () => false, canSeeTestTeacher = false }) {
  const [rooms, setRooms] = useState(DEFAULT_MEDIA_ROOMS);
  const [roomsRowId, setRoomsRowId] = useState(null);
  const [view, setView] = useState("month");
  const [month, setMonth] = useState(() => todayKey().slice(0, 7));
  const [monthRoom, setMonthRoom] = useState("");
  const [monthBookings, setMonthBookings] = useState([]);
  const [pickDay, setPickDay] = useState(todayKey());
  const [room, setRoom] = useState(DEFAULT_MEDIA_ROOMS[0]);
  const [week, setWeek] = useState(() => { const t = todayKey(); const w = weekday(t); return monday(w === 6 || w === 0 ? shift(t, 2) : t); });
  const [bookings, setBookings] = useState([]);
  const [mine, setMine] = useState([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState(null);
  const [form, setForm] = useState(null);
  const [newRoom, setNewRoom] = useState("");
  const [timetable, setTimetable] = useState([]);

  const empById = useMemo(() => new Map(employees.map(e => [String(e.id), e])), [employees]);
  const visible = b => { const e = empById.get(String(b.employee_id)); return !(e && isTestTeacher(e)) || canSeeTestTeacher || String(b.employee_id) === String(currentUser?.id); };
  const nameOf = id => empById.get(String(id))?.name || "-";
  const canCancel = b => canManage || String(b.employee_id) === String(currentUser?.id);
  const days = [0, 1, 2, 3, 4].map(i => shift(week, i));

  async function loadRooms() {
    const { data } = await supabase.from("teaching_schedule").select("id, subject").eq("class_room", ROOM_BOOKING_ROOMS_ROOM).eq("period", 0).order("created_at", { ascending: false }).limit(1);
    const row = data?.[0];
    if (row) { try { const list = JSON.parse(row.subject).rooms; if (Array.isArray(list) && list.length) { setRooms(list); setRoom(r => list.includes(r) ? r : list[0]); } } catch { /* ใช้ค่าเริ่มต้น */ } setRoomsRowId(row.id); }
  }
  async function load() {
    setLoading(true);
    try {
      const [w, m] = await Promise.all([fetchBookingsBetween(week, shift(week, 4)), fetchBookingsBetween(todayKey(), shift(todayKey(), 400))]);
      setBookings(w.filter(visible));
      setMine(m.filter(b => String(b.employee_id) === String(currentUser?.id)).sort((a, b) => a.date.localeCompare(b.date) || a.period_no - b.period_no));
    } catch (e) { setMsg({ type: "err", text: "โหลดข้อมูลไม่สำเร็จ: " + e.message }); }
    setLoading(false);
  }
  async function loadMonth() {
    try { const last = shift(`${month}-01`, 40).slice(0, 8) + "01"; setMonthBookings((await fetchBookingsBetween(`${month}-01`, shift(last, -1))).filter(visible)); } catch { /* แสดงข้อความจาก load() */ }
  }
  useEffect(() => { loadMonth(); }, [month, bookings, employees.length]);
  useEffect(() => { loadRooms(); }, []);
  useEffect(() => { load(); }, [week, currentUser?.id, employees.length]);
  useEffect(() => {
    if (!currentUser?.id) return;
    supabase.from("teaching_schedule").select("day_of_week, period, subject, class_room").eq("employee_id", currentUser.id).gte("day_of_week", 1).lte("day_of_week", 5)
      .then(({ data }) => setTimetable((data || []).filter(r => !String(r.class_room || "").startsWith("__"))));
  }, [currentUser?.id]);

  function openForm(date, periodNo) {
    const base = { room, date: date || days[0], period_no: periodNo || 1, subject: "", class_level: "", note: "" };
    setForm(prefill(base)); setMsg(null);
  }
  function prefill(f) {
    const slot = timetable.find(r => r.day_of_week === weekday(f.date) && Number(r.period) === Number(f.period_no));
    if (!slot) return f;
    const lvl = CLASS_LEVELS.slice().reverse().find(c => String(slot.class_room || "").replace(/\s/g, "").startsWith(c.replace(/\s/g, "")));
    return { ...f, subject: f.subject || slot.subject || "", class_level: f.class_level || lvl || "" };
  }
  async function submit() {
    if (!form.room || !form.date || !form.subject.trim() || !form.class_level) { setMsg({ type: "err", text: "กรอกห้อง วันที่ วิชา และชั้นให้ครบ" }); return; }
    const wd = weekday(form.date);
    if (wd === 0 || wd === 6) { setMsg({ type: "err", text: "จองได้เฉพาะวันจันทร์–ศุกร์" }); return; }
    if (form.date < todayKey()) { setMsg({ type: "err", text: "ไม่สามารถจองย้อนหลังได้" }); return; }
    const warn = dayWarning(form.date);
    if (warn && !window.confirm(`วันที่เลือกตรงกับ "${warn}" ในปฏิทินการศึกษา ยืนยันจองหรือไม่?`)) return;
    setLoading(true);
    try {
      const res = await createBooking({ employeeId: currentUser.id, room: form.room, date: form.date, periodNo: form.period_no, subject: form.subject.trim(), classLevel: form.class_level, note: form.note.trim() });
      if (res.conflict) { const c = res.conflict; setMsg({ type: "err", text: `ห้องนี้ถูกจองแล้วโดย ${nameOf(c.employee_id)} (${c.subject} ${c.class_level}) — ${thaiDate(c.date)} คาบ ${c.period_no}` }); }
      else { setMsg({ type: "ok", text: `จอง ${form.room} ${thaiDate(form.date)} คาบ ${form.period_no} เรียบร้อย` }); setRoom(form.room); setWeek(monday(form.date)); setForm(null); }
    } catch (e) { setMsg({ type: "err", text: "จองไม่สำเร็จ: " + e.message }); }
    setLoading(false); load();
  }
  async function cancel(b) {
    if (!canCancel(b)) return;
    if (!window.confirm(`ยกเลิกการจอง ${b.room} ${thaiDate(b.date)} คาบ ${b.period_no}?`)) return;
    try { await deleteBooking(b.id); setMsg({ type: "ok", text: "ยกเลิกการจองแล้ว" }); } catch (e) { setMsg({ type: "err", text: "ยกเลิกไม่สำเร็จ: " + e.message }); }
    load();
  }
  async function saveRooms(list) {
    const subject = JSON.stringify({ kind: "room_booking_rooms", rooms: list, updated_at: new Date().toISOString() });
    const q = roomsRowId ? supabase.from("teaching_schedule").update({ subject }).eq("id", roomsRowId)
      : supabase.from("teaching_schedule").insert({ employee_id: currentUser.id, day_of_week: 0, period: 0, class_room: ROOM_BOOKING_ROOMS_ROOM, start_time: "00:00:00", end_time: "00:00:00", subject });
    const { error } = await q;
    if (error) { setMsg({ type: "err", text: "บันทึกรายชื่อห้องไม่สำเร็จ: " + error.message }); return; }
    setRooms(list); if (!list.includes(room)) setRoom(list[0]); loadRooms();
  }

  const cell = (date, p) => bookings.find(b => b.room === room && b.date === date && Number(b.period_no) === p);

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto" }}>
      <div style={card}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontWeight: 800, color: "#233862", fontSize: "1.05rem" }}>🏫 จองห้องสื่อการสอน</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <button style={tab(view === "month")} onClick={() => setView("month")}>ปฏิทิน</button>
            <button style={tab(view === "grid")} onClick={() => setView("grid")}>ตารางการใช้ห้อง</button>
            <button style={tab(view === "mine")} onClick={() => setView("mine")}>การจองของฉัน ({mine.length})</button>
            {canManage && <button style={tab(view === "rooms")} onClick={() => setView("rooms")}>จัดการห้อง</button>}
            <button style={btn("#16a34a")} onClick={() => openForm()}>+ จองห้อง</button>
          </div>
        </div>
        {msg && <div style={{ marginTop: 10, padding: "0.6rem 0.8rem", borderRadius: 10, fontSize: "0.85rem", fontWeight: 600, background: msg.type === "ok" ? "#dcfce7" : "#fef2f2", color: msg.type === "ok" ? "#15803d" : "#b91c1c" }}>{msg.text}</div>}
      </div>

      {form && (
        <div style={card}>
          <div style={{ fontWeight: 800, color: "#233862", marginBottom: 10 }}>ขอใช้ห้อง — ผู้จอง: {currentUser?.name}</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10 }}>
            <div><span style={label}>ห้อง</span><select style={input} value={form.room} onChange={e => setForm({ ...form, room: e.target.value })}>{rooms.map(r => <option key={r}>{r}</option>)}</select></div>
            <div><span style={label}>วันที่ (จ.–ศ.)</span><input type="date" style={input} value={form.date} min={todayKey()} onChange={e => setForm(prefill({ ...form, date: e.target.value, subject: "", class_level: "" }))} /></div>
            <div><span style={label}>คาบ</span><select style={input} value={form.period_no} onChange={e => setForm(prefill({ ...form, period_no: Number(e.target.value), subject: "", class_level: "" }))}>{PERIOD_TIMES.map((t, i) => <option key={i} value={i + 1}>คาบ {i + 1} ({t[0]}–{t[1]})</option>)}</select></div>
            <div><span style={label}>วิชา</span><input style={input} value={form.subject} placeholder="เช่น วิทยาศาสตร์" onChange={e => setForm({ ...form, subject: e.target.value })} /></div>
            <div><span style={label}>ชั้น</span><select style={input} value={form.class_level} onChange={e => setForm({ ...form, class_level: e.target.value })}><option value="">-- เลือกชั้น --</option>{CLASS_LEVELS.map(c => <option key={c}>{c}</option>)}</select></div>
            <div><span style={label}>หมายเหตุ (ถ้ามี)</span><input style={input} value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} /></div>
          </div>
          {form.date && [0, 6].includes(weekday(form.date)) && <div style={{ color: "#b91c1c", fontSize: "0.82rem", marginTop: 8 }}>⚠️ วันเสาร์–อาทิตย์จองไม่ได้</div>}
          {form.date && dayWarning(form.date) && <div style={{ color: "#d97706", fontSize: "0.82rem", marginTop: 8 }}>⚠️ ปฏิทินการศึกษา: {dayWarning(form.date)}</div>}
          {(() => { const c = bookings.concat(mine).find(b => b.room === form.room && b.date === form.date && Number(b.period_no) === Number(form.period_no)); return c ? <div style={{ color: "#b91c1c", fontSize: "0.82rem", marginTop: 8 }}>⛔ ช่องนี้ถูกจองแล้วโดย {nameOf(c.employee_id)}</div> : null; })()}
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button style={btn("#f1f5f9", "#475569")} onClick={() => setForm(null)}>ยกเลิก</button>
            <button style={btn("#008CFF")} disabled={loading} onClick={submit}>{loading ? "กำลังบันทึก..." : "ยืนยันการจอง"}</button>
          </div>
        </div>
      )}

      {view === "month" && (() => {
        const first = `${month}-01`; const lead = (weekday(first) + 6) % 7;
        const nDays = Number(shift(shift(first, 40).slice(0, 8) + "01", -1).slice(8));
        const cells = Array(lead).fill(null).concat(Array.from({ length: nDays }, (_, i) => `${month}-${pad(i + 1)}`));
        const shown = monthBookings.filter(b => !monthRoom || b.room === monthRoom);
        const byDay = d => shown.filter(b => b.date === d);
        const moveMonth = n => { const [y, m] = month.split("-").map(Number); const t = new Date(Date.UTC(y, m - 1 + n, 1)); setMonth(t.toISOString().slice(0, 7)); };
        const dayList = byDay(pickDay).sort((a, b) => a.period_no - b.period_no || a.room.localeCompare(b.room));
        const pickWd = weekday(pickDay);
        return (
          <div style={{ ...card, maxWidth: 460 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
              <button style={{ ...btn("#f1f5f9", "#475569"), padding: "0.3rem 0.6rem" }} onClick={() => moveMonth(-1)}>‹</button>
              <div style={{ flex: 1, textAlign: "center", fontWeight: 800, color: "#233862", fontSize: "0.92rem" }}>{new Date(`${first}T12:00:00Z`).toLocaleDateString("th-TH", { month: "long", year: "numeric", timeZone: "UTC" })}</div>
              <button style={{ ...btn("#f1f5f9", "#475569"), padding: "0.3rem 0.6rem" }} onClick={() => moveMonth(1)}>›</button>
            </div>
            <select style={{ ...input, padding: "0.4rem 0.6rem", fontSize: "0.82rem", marginBottom: 8 }} value={monthRoom} onChange={e => setMonthRoom(e.target.value)}>
              <option value="">ทุกห้อง</option>{rooms.map(r => <option key={r}>{r}</option>)}
            </select>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 3, fontSize: "0.75rem" }}>
              {["จ", "อ", "พ", "พฤ", "ศ", "ส", "อา"].map(h => <div key={h} style={{ textAlign: "center", color: "#94a3b8", fontWeight: 700 }}>{h}</div>)}
              {cells.map((d, i) => { if (!d) return <div key={i} />;
                const n = byDay(d).length; const hol = dayWarning(d); const wk = [0, 6].includes(weekday(d)); const isToday = d === todayKey(); const sel = d === pickDay;
                return (
                  <button key={d} title={hol || ""} onClick={() => setPickDay(d)} style={{ aspectRatio: "1 / 1", border: sel ? "2px solid #008CFF" : isToday ? "2px solid #16a34a" : "1px solid #eef2f7", borderRadius: 8, background: hol ? "#fee2e2" : wk ? "#f8fafc" : "#fff", color: wk ? "#cbd5e1" : "#233862", cursor: "pointer", fontFamily: "inherit", padding: 2, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontWeight: isToday ? 800 : 600, fontSize: "0.78rem" }}>
                    {Number(d.slice(8))}
                    {n > 0 && <span style={{ marginTop: 1, background: "#008CFF", color: "#fff", borderRadius: 999, fontSize: "0.62rem", minWidth: 16, lineHeight: "14px", padding: "0 3px" }}>{n}</span>}
                  </button>); })}
            </div>
            <div style={{ display: "flex", gap: 10, fontSize: "0.68rem", color: "#64748b", marginTop: 6, flexWrap: "wrap" }}>
              <span><span style={{ display: "inline-block", width: 9, height: 9, background: "#fee2e2", borderRadius: 2 }} /> วันหยุด/กิจกรรม</span>
              <span><span style={{ display: "inline-block", width: 9, height: 9, border: "2px solid #16a34a", borderRadius: 2 }} /> วันนี้</span>
              <span><span style={{ display: "inline-block", width: 9, height: 9, background: "#008CFF", borderRadius: 9 }} /> จำนวนการจอง</span>
            </div>
            <div style={{ borderTop: "1px solid #eef2f7", marginTop: 10, paddingTop: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6 }}>
                <div style={{ fontWeight: 800, color: "#233862", fontSize: "0.85rem" }}>{thaiDate(pickDay)}{dayWarning(pickDay) && <span style={{ color: "#d97706", fontWeight: 600 }}> · {dayWarning(pickDay)}</span>}</div>
                {pickWd >= 1 && pickWd <= 5 && pickDay >= todayKey() && <button style={{ ...btn("#16a34a"), padding: "0.35rem 0.7rem", fontSize: "0.78rem" }} onClick={() => { setForm(prefill({ room: monthRoom || room, date: pickDay, period_no: 1, subject: "", class_level: "", note: "" })); setMsg(null); }}>+ จองวันนี้</button>}
              </div>
              {dayList.length === 0 ? <div style={{ color: "#94a3b8", fontSize: "0.8rem", padding: "0.5rem 0" }}>ไม่มีการจอง</div> : dayList.map(b => (
                <div key={b.id} style={{ display: "flex", justifyContent: "space-between", gap: 6, padding: "0.4rem 0", borderBottom: "1px solid #f8fafc", fontSize: "0.8rem" }}>
                  <div><b style={{ color: "#233862" }}>คาบ {b.period_no}</b> <span style={{ color: "#94a3b8" }}>({PERIOD_TIMES[b.period_no - 1]?.join("–")})</span> · {b.room}
                    <div style={{ color: "#475569" }}>{nameOf(b.employee_id)} · {b.subject} {b.class_level}{b.note ? ` · ${b.note}` : ""}</div></div>
                  {canCancel(b) && pickDay >= todayKey() && <button onClick={() => cancel(b)} style={{ ...btn("transparent", "#dc2626"), padding: 0, fontSize: "0.72rem" }}>ยกเลิก</button>}
                </div>))}
            </div>
          </div>);
      })()}

      {view === "grid" && (
        <div style={card}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginBottom: 10 }}>
            <select style={{ ...input, width: "auto", minWidth: 200 }} value={room} onChange={e => setRoom(e.target.value)}>{rooms.map(r => <option key={r}>{r}</option>)}</select>
            <button style={btn("#f1f5f9", "#475569")} onClick={() => setWeek(shift(week, -7))}>‹ สัปดาห์ก่อน</button>
            <span style={{ fontWeight: 700, color: "#233862", fontSize: "0.88rem" }}>{thaiDate(days[0])} – {thaiDate(days[4])}</span>
            <button style={btn("#f1f5f9", "#475569")} onClick={() => setWeek(shift(week, 7))}>สัปดาห์ถัดไป ›</button>
            <button style={btn("#f1f5f9", "#475569")} onClick={() => setWeek(monday(todayKey()))}>สัปดาห์นี้</button>
            {loading && <span style={{ color: "#94a3b8", fontSize: "0.8rem" }}>กำลังโหลด...</span>}
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 640, fontSize: "0.8rem" }}>
              <thead><tr><th style={{ padding: 6, background: "#f8fafc", color: "#64748b" }}>วัน / คาบ</th>{PERIOD_TIMES.map((t, i) => <th key={i} style={{ padding: 6, background: "#f8fafc", color: "#64748b" }}>คาบ {i + 1}<div style={{ fontWeight: 400, fontSize: "0.7rem" }}>{t[0]}–{t[1]}</div></th>)}</tr></thead>
              <tbody>{days.map((d, di) => { const warn = dayWarning(d); return (
                <tr key={d}>
                  <td style={{ padding: 6, fontWeight: 700, color: "#233862", whiteSpace: "nowrap", borderTop: "1px solid #eef2f7" }}>{DAY_LABELS[di]} {thaiDate(d).replace(/^\S+\s/, "")}{warn && <div style={{ color: "#d97706", fontSize: "0.68rem", fontWeight: 600 }}>{warn}</div>}</td>
                  {PERIOD_TIMES.map((_, pi) => { const b = cell(d, pi + 1); const past = d < todayKey(); return (
                    <td key={pi} style={{ padding: 4, borderTop: "1px solid #eef2f7", verticalAlign: "top" }}>
                      {b ? (
                        <div style={{ background: String(b.employee_id) === String(currentUser?.id) ? "#dcfce7" : "#EAF5FF", borderRadius: 8, padding: "0.35rem 0.45rem", minHeight: 44 }}>
                          <div style={{ fontWeight: 700, color: "#233862" }}>{nameOf(b.employee_id)}</div>
                          <div style={{ color: "#475569" }}>{b.subject} · {b.class_level}</div>
                          {b.note && <div style={{ color: "#94a3b8", fontSize: "0.7rem" }}>{b.note}</div>}
                          {canCancel(b) && !past && <button onClick={() => cancel(b)} style={{ ...btn("transparent", "#dc2626"), padding: 0, fontSize: "0.72rem" }}>ยกเลิก</button>}
                        </div>
                      ) : past ? <div style={{ minHeight: 44 }} /> : (
                        <button onClick={() => openForm(d, pi + 1)} style={{ width: "100%", minHeight: 44, border: "1.5px dashed #cbd5e1", background: "#fff", borderRadius: 8, color: "#94a3b8", cursor: "pointer", fontFamily: "inherit" }}>ว่าง +</button>
                      )}
                    </td>); })}
                </tr>); })}</tbody>
            </table>
          </div>
        </div>
      )}

      {view === "mine" && (
        <div style={card}>
          {mine.length === 0 ? <div style={{ color: "#94a3b8", textAlign: "center", padding: "1.5rem" }}>ยังไม่มีการจองที่กำลังจะถึง</div> : mine.map(b => (
            <div key={b.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, padding: "0.65rem 0", borderBottom: "1px solid #f1f5f9", flexWrap: "wrap" }}>
              <div><div style={{ fontWeight: 700, color: "#233862" }}>{b.room}</div><div style={{ color: "#64748b", fontSize: "0.82rem" }}>{thaiDate(b.date)} · คาบ {b.period_no} ({PERIOD_TIMES[b.period_no - 1]?.join("–")}) · {b.subject} {b.class_level}{b.note ? ` · ${b.note}` : ""}</div></div>
              <button style={btn("#fef2f2", "#dc2626")} onClick={() => cancel(b)}>ยกเลิก</button>
            </div>))}
        </div>
      )}

      {view === "rooms" && canManage && (
        <div style={card}>
          {rooms.map(r => (
            <div key={r} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.45rem 0", borderBottom: "1px solid #f1f5f9" }}>
              <span style={{ color: "#233862", fontWeight: 600 }}>{r}</span>
              <button style={btn("#fef2f2", "#dc2626")} disabled={rooms.length <= 1} onClick={() => window.confirm(`ลบ "${r}" ออกจากรายการ? (การจองเดิมยังอยู่)`) && saveRooms(rooms.filter(x => x !== r))}>ลบ</button>
            </div>))}
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <input style={input} value={newRoom} placeholder="ชื่อห้องใหม่" onChange={e => setNewRoom(e.target.value)} />
            <button style={btn("#008CFF")} onClick={() => { const n = newRoom.trim(); if (n && !rooms.includes(n)) { saveRooms([...rooms, n]); setNewRoom(""); } }}>เพิ่ม</button>
          </div>
        </div>
      )}
    </div>
  );
}
