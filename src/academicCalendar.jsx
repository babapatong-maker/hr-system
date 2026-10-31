import { Fragment, useState } from "react";

// ปฏิทินการศึกษา ภาคเรียนที่ 2/2569 (ตามเอกสารโรงเรียน) — แก้ข้อมูลที่ค่าคงที่นี้
// color: "red" = วันหยุด/เรียนชดเชย/สอบ (ตัวแดงตามกระดาษ), "blue" = ค่ายลูกเสือ, ไม่ระบุ = ปกติ
export const ACADEMIC_CALENDAR_2_2569 = [
  { month: "2026-11", studyDays: 25, note: "กิจกรรมวันลอยกระทง - ครูธนัตถ์ / วันวชิราวุธ - ครูขนิษฐา", events: [
    { date: "2026-11-02", title: "เปิดภาคเรียน" },
    { date: "2026-11-07", title: "เรียนชดเชย 1", color: "red" },
    { date: "2026-11-09", title: "ทัศนศึกษามัธยม" },
    { date: "2026-11-10", title: "ทัศนศึกษา ป.ปลาย" },
    { date: "2026-11-11", title: "ทัศนศึกษา ป.ต้น/อ." },
    { date: "2026-11-14", title: "เรียนชดเชย 2", color: "red" },
    { date: "2026-11-21", title: "เรียนชดเชย 3", color: "red" },
    { date: "2026-11-24", title: "วันลอยกระทง", teacher: "ครูธนัตถ์" },
    { date: "2026-11-25", title: "วันวชิราวุธ", teacher: "ครูขนิษฐา" },
    { date: "2026-11-28", title: "เรียนชดเชย 4", color: "red" },
  ] },
  { month: "2026-12", studyDays: 20, note: "กิจกรรมวันพ่อ - ครูศิริรัตน์ / กิจกรรมวันคริสต์มาส/กิจกรรมวันขึ้นปีใหม่ - ครูนพรัตน์", events: [
    { date: "2026-12-04", title: "กิจกรรมวันพ่อแห่งชาติ", teacher: "ครูศิริรัตน์" },
    { date: "2026-12-05", title: "วันพ่อแห่งชาติ", color: "red", teacher: "ครูศิริรัตน์" },
    { date: "2026-12-07", title: "หยุดชดเชยวันพ่อ", color: "red" },
    { date: "2026-12-10", title: "วันรัฐธรรมนูญ", color: "red" },
    { date: "2026-12-12", title: "เรียนชดเชย 5", color: "red" },
    { date: "2026-12-16", title: "หยุดกรณีพิเศษ", color: "red" },
    { date: "2026-12-19", title: "เรียนชดเชย 6", color: "red" },
    { date: "2026-12-25", title: "เข้าค่ายลูกเสือ", color: "blue" },
    { date: "2026-12-26", title: "เข้าค่ายลูกเสือ", color: "blue" },
    { date: "2026-12-30", title: "กิจกรรมวันขึ้นปีใหม่ / วันคริสต์มาส", teacher: "ครูนพรัตน์" },
    { date: "2026-12-31", title: "วันสิ้นปี", color: "red" },
  ] },
  { month: "2027-01", studyDays: 21, note: "กิจกรรมวันเด็ก - ครูเบญจวรรณ", events: [
    { date: "2027-01-01", title: "วันขึ้นปีใหม่", color: "red" },
    { date: "2027-01-07", title: "เข้าค่ายลูกเสือสำรอง" },
    { date: "2027-01-08", title: "กิจกรรมวันเด็ก", teacher: "ครูเบญจวรรณ" },
    { date: "2027-01-09", title: "วันเด็ก", teacher: "ครูเบญจวรรณ" },
    { date: "2027-01-16", title: "วันครู" },
    { date: "2027-01-23", title: "เรียนชดเชย 7", color: "red" },
    { date: "2027-01-30", title: "สอบโอเน็ต ป.6", color: "red" },
  ] },
  { month: "2027-02", studyDays: 22, note: "", events: [
    ...[1, 2, 3, 4, 5].map(d => ({ date: `2027-02-0${d}`, title: "สอบโอเน็ต ม.3", color: "red" })),
    { date: "2027-02-06", title: "เรียนชดเชย 8", color: "red" },
    { date: "2027-02-13", title: "เรียนชดเชย 9", color: "red" },
    { date: "2027-02-21", title: "วันมาฆบูชา", color: "red" },
    { date: "2027-02-22", title: "หยุดชดเชยวันมาฆบูชา", color: "red" },
    { date: "2027-02-27", title: "เรียนชดเชย 10", color: "red" },
  ] },
  { month: "2027-03", studyDays: 12, note: "กิจกรรมบัณฑิตน้อย - ครูธนัตถ์ / กิจกรรม Open House - ครูนพรัตน์/ครูจุฑารัตน์", events: [
    { date: "2027-03-05", title: "บัณฑิตน้อย", teacher: "ครูธนัตถ์" },
    { date: "2027-03-09", title: "Open House", teacher: "ครูนพรัตน์/ครูจุฑารัตน์" },
    { date: "2027-03-15", title: "สอบปลายภาค" },
    { date: "2027-03-16", title: "สอบปลายภาค" },
    { date: "2027-03-24", title: "เรียน summer" },
    { date: "2027-03-31", title: "อนุมัติผลการเรียน", color: "red" },
  ] },
  { month: "2027-04", studyDays: null, note: "", events: [
    { date: "2027-04-23", title: "สิ้นสุด summer" },
  ] },
];

const TH_MONTHS = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
const TH_DAYS = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"];
const HEAD_BG = ["#fde047", "#a3e635", "#f9a8d4", "#7dd3fc", "#fbbf24", "#fbbf24"];
const COLORS = { red: "#dc2626", blue: "#2563eb" };

export function monthLabel(key) {
  const [y, m] = key.split("-").map(Number);
  return `${TH_MONTHS[m - 1]} ${y + 543}`;
}

// ช่องปฏิทินแบบ อาทิตย์–เสาร์ (null = ช่องว่าง)
export function monthCells(key) {
  const [y, m] = key.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const cells = Array(first).fill(null);
  for (let d = 1; d <= days; d++) cells.push(`${key}-${String(d).padStart(2, "0")}`);
  while (cells.length % 7) cells.push(null);
  return cells;
}

// ครูเวรประจำสัปดาห์ (หมุนเวียนกลุ่ม 1→2→3→1…)
export const DUTY_GROUP_COUNT = 3;
export const DUTY_START = "2026-11-02"; // วันจันทร์ของสัปดาห์แรก (กลุ่ม 1)
export const DUTY_END = "2027-04-30"; // สิ้นภาคเรียน 2/2569
const dayNum = date => { const [y, m, d] = date.split("-").map(Number); return Date.UTC(y, m - 1, d) / 86400000; };
const keyOf = n => new Date(n * 86400000).toISOString().slice(0, 10);
// คืนค่า { group, monday, friday } ของสัปดาห์ที่มีวันนี้ หรือ null
export function dutyWeek(date) {
  if (!date) return null;
  const n = dayNum(date);
  const monday = n - ((new Date(n * 86400000).getUTCDay() + 6) % 7);
  const start = dayNum(DUTY_START);
  if (monday < start || monday > dayNum(DUTY_END)) return null;
  const week = Math.floor((monday - start) / 7);
  return { group: (week % DUTY_GROUP_COUNT) + 1, monday: keyOf(monday), friday: keyOf(monday + 4) };
}
// แบ่งช่องปฏิทินเป็นแถวรายสัปดาห์ พร้อมกลุ่มเวร
function weekRows(cells) {
  const rows = [];
  for (let i = 0; i < cells.length; i += 7) {
    const row = cells.slice(i, i + 7);
    const any = row.slice(1, 6).find(Boolean) || row.find(Boolean);
    rows.push({ row, start: i, duty: dutyWeek(any) });
  }
  return rows;
}
const DUTY_BG = ["#dcfce7", "#fef9c3", "#fce7f3", "#e0f2fe", "#ede9fe"];
const DUTY_FG = ["#15803d", "#a16207", "#be185d", "#0369a1", "#6d28d9"];
function DutyBar({ duty, compact }) {
  if (!duty) return null;
  const i = (duty.group - 1) % DUTY_BG.length;
  return (
    <div style={{ gridColumn: "1 / -1", display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", borderBottom: compact ? "1px solid #cbd5e1" : "1px solid #94a3b8", borderRight: compact ? "1px solid #cbd5e1" : "none" }}>
      <div style={{ gridColumn: "2 / 7", margin: compact ? "1px 2px" : "3px 4px", background: DUTY_BG[i], color: DUTY_FG[i], border: `1px solid ${DUTY_FG[i]}55`, borderRadius: 999, textAlign: "center", fontWeight: 800, fontSize: compact ? "0.6rem" : "0.8rem", padding: compact ? "0 2px" : "2px 6px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>จัดกิจกรรม ครูกลุ่ม {duty.group}</div>
    </div>
  );
}

export function defaultMonthIndex(today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" })) {
  const key = today.slice(0, 7);
  const idx = ACADEMIC_CALENDAR_2_2569.findIndex(item => item.month === key);
  if (idx >= 0) return idx;
  return key < ACADEMIC_CALENDAR_2_2569[0].month ? 0 : ACADEMIC_CALENDAR_2_2569.length - 1;
}

function formatDate(date) {
  const [y, m, d] = date.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${TH_DAYS[dow]} ${d} ${TH_MONTHS[m - 1]} ${y + 543}`;
}

export function AcademicCalendarPage({ extraEvents = [] }) {
  const [index, setIndex] = useState(() => defaultMonthIndex());
  const [view, setView] = useState("grid");
  const baseMonth = ACADEMIC_CALENDAR_2_2569[index];
  const withExtra = item => ({ ...item, events: [...item.events, ...extraEvents.filter(ev => ev.date.startsWith(item.month))].sort((a, b) => a.date.localeCompare(b.date)) });
  const month = withExtra(baseMonth);
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" });
  const byDate = new Map();
  month.events.forEach(ev => byDate.set(ev.date, [...(byDate.get(ev.date) || []), ev]));
  const btn = (active) => ({ padding: "0.45rem 0.9rem", borderRadius: 10, border: "1.5px solid #cbd5e1", background: active ? "#0072D9" : "#fff", color: active ? "#fff" : "#334155", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" });
  const allEvents = ACADEMIC_CALENDAR_2_2569.map(withExtra).flatMap(item => item.events.map(ev => ({ ...ev, month: item.month })));
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.75rem", marginBottom: "1rem" }}>
        <h2 style={{ margin: 0, color: "#233862" }}>ปฏิทินการศึกษา ภาคเรียนที่ 2/2569</h2>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button style={btn(view === "grid")} onClick={() => setView("grid")}>ปฏิทินรายเดือน</button>
          <button style={btn(view === "list")} onClick={() => setView("list")}>รายการกิจกรรม</button>
        </div>
      </div>
      {view === "grid" ? (
        <div style={{ background: "#fff", borderRadius: 18, padding: "1rem", border: "1px solid #E4EEF8" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.75rem" }}>
            <button style={btn(false)} disabled={index === 0} onClick={() => setIndex(i => Math.max(0, i - 1))}>‹ เดือนก่อน</button>
            <div style={{ flex: 1, textAlign: "center", background: HEAD_BG[index], borderRadius: 8, padding: "0.5rem", fontWeight: 800, color: "#1e293b" }}>
              ปฏิทินงานเดือน{monthLabel(month.month)}{month.studyDays ? `   เวลาเรียน ${month.studyDays} วัน` : ""}
            </div>
            <button style={btn(false)} disabled={index === ACADEMIC_CALENDAR_2_2569.length - 1} onClick={() => setIndex(i => Math.min(ACADEMIC_CALENDAR_2_2569.length - 1, i + 1))}>เดือนถัดไป ›</button>
          </div>
          <div style={{ overflowX: "auto" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(84px, 1fr))", border: "1px solid #94a3b8", minWidth: 600 }}>
              {TH_DAYS.map(d => <div key={d} style={{ padding: "0.4rem", textAlign: "center", fontWeight: 700, borderRight: "1px solid #94a3b8", borderBottom: "1px solid #94a3b8", background: "#f8fafc" }}>{d}</div>)}
              {weekRows(monthCells(month.month)).map(({ row, start, duty }) => <Fragment key={start}>{row.map((date, j) => {
                const i = start + j;
                const events = date ? byDate.get(date) || [] : [];
                const dayColor = events.find(ev => ev.color)?.color;
                return (
                  <div key={i} style={{ minHeight: 78, padding: "0.35rem", textAlign: "center", borderRight: "1px solid #94a3b8", borderBottom: "1px solid #94a3b8", background: date === today ? "#EAF5FF" : "#fff" }}>
                    {date && <div style={{ fontWeight: 700, color: COLORS[dayColor] || "#1e293b" }}>{Number(date.slice(8))}</div>}
                    {events.map((ev, k) => (
                      <div key={k} style={{ fontSize: "0.78rem", lineHeight: 1.3, color: COLORS[ev.color] || "#1e293b", marginTop: 2 }}>
                        {ev.title}
                        {ev.teacher && <div style={{ fontSize: "0.7rem", color: "#7c3aed" }}>👤 {ev.teacher}</div>}
                      </div>
                    ))}
                  </div>
                );
              })}<DutyBar duty={duty} /></Fragment>)}
            </div>
          </div>
          {month.note && <div style={{ marginTop: "0.6rem", fontSize: "0.85rem", color: "#334155" }}><b>ผู้รับผิดชอบ:</b> {month.note}</div>}
          <div style={{ marginTop: "0.4rem", fontSize: "0.75rem", color: "#64748b" }}>ตัวแดง = วันหยุด/เรียนชดเชย/สอบ · ตัวน้ำเงิน = เข้าค่ายลูกเสือ · แถบสี = ครูเวรประจำสัปดาห์ (หมุนเวียน {DUTY_GROUP_COUNT} กลุ่ม)</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {ACADEMIC_CALENDAR_2_2569.map(item => (
            <div key={item.month} style={{ background: "#fff", borderRadius: 14, padding: "0.9rem 1rem", border: "1px solid #E4EEF8" }}>
              <div style={{ fontWeight: 800, marginBottom: "0.4rem" }}>{monthLabel(item.month)}{item.studyDays ? ` · เวลาเรียน ${item.studyDays} วัน` : ""}</div>
              {allEvents.filter(ev => ev.month === item.month).map((ev, k, arr) => {
                const duty = dutyWeek(ev.date);
                const prev = k ? dutyWeek(arr[k - 1].date) : null;
                const showDuty = duty && (!prev || prev.monday !== duty.monday);
                return (<Fragment key={k}>
                {showDuty && <div style={{ margin: "0.35rem 0 0.15rem", fontSize: "0.78rem", fontWeight: 800, color: DUTY_FG[(duty.group - 1) % DUTY_FG.length], background: DUTY_BG[(duty.group - 1) % DUTY_BG.length], borderRadius: 999, padding: "0.1rem 0.7rem", width: "fit-content" }}>สัปดาห์ {Number(duty.monday.slice(8))}–{Number(duty.friday.slice(8))} {TH_MONTHS[Number(duty.friday.slice(5, 7)) - 1]} · จัดกิจกรรม ครูกลุ่ม {duty.group}</div>}
                <div style={{ display: "flex", gap: "0.75rem", padding: "0.3rem 0", borderTop: k ? "1px solid #f1f5f9" : "none", fontSize: "0.88rem" }}>
                  <span style={{ minWidth: 190, color: "#64748b" }}>{formatDate(ev.date)}</span>
                  <span style={{ color: COLORS[ev.color] || "#1e293b", fontWeight: 600 }}>{ev.title}{ev.teacher && <span style={{ color: "#7c3aed", fontWeight: 500 }}> · ผู้รับผิดชอบ {ev.teacher}</span>}</span>
                </div>
                </Fragment>);
              })}
              {item.note && <div style={{ marginTop: "0.4rem", fontSize: "0.8rem", color: "#475569" }}>หมายเหตุ: {item.note}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// รายการกิจกรรมที่กำลังจะมาถึง (ใช้ในหน้าผู้บริหาร)
export function upcomingEvents(today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" }), days = 30, min = 5) {
  const all = ACADEMIC_CALENDAR_2_2569.flatMap(m => m.events).filter(e => e.date >= today).sort((a, b) => a.date.localeCompare(b.date));
  const end = new Date(today + "T00:00:00"); end.setDate(end.getDate() + days);
  const endKey = end.toLocaleDateString("en-CA");
  const inRange = all.filter(e => e.date <= endKey);
  return inRange.length >= min ? inRange : all.slice(0, Math.max(min, inRange.length));
}

// ปฏิทินรายเดือนแบบย่อ (ใช้ในหน้าผู้บริหาร)
const SHORT_DAYS = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];
export function UpcomingCalendarCard({ onOpen, today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" }) }) {
  const [index, setIndex] = useState(() => defaultMonthIndex(today));
  const month = ACADEMIC_CALENDAR_2_2569[index];
  const byDate = new Map();
  month.events.forEach(ev => byDate.set(ev.date, [...(byDate.get(ev.date) || []), ev]));
  const last = ACADEMIC_CALENDAR_2_2569.length - 1;
  const nav = (dis) => ({ padding: "0.2rem 0.55rem", borderRadius: 8, border: "1px solid #cbd5e1", background: "#fff", color: dis ? "#cbd5e1" : "#334155", fontWeight: 700, cursor: dis ? "default" : "pointer", fontFamily: "inherit", fontSize: "0.85rem" });
  const line = "1px solid #cbd5e1";
  return (
    <div style={{ background: "#fff", borderRadius: 16, padding: "0.75rem", border: "1px solid #E4EEF8", boxShadow: "0 2px 12px rgba(15,23,42,0.05)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
        <div style={{ fontWeight: 800, fontSize: "0.95rem", color: "#233862" }}>📅 ปฏิทินการศึกษา 2/2569</div>
        <button onClick={onOpen} style={{ background: "#0072D9", color: "#fff", border: 0, borderRadius: 8, padding: "0.25rem 0.65rem", fontWeight: 700, cursor: "pointer", fontSize: "0.8rem", fontFamily: "inherit" }}>เปิดปฏิทินเต็ม</button>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 6 }}>
        <button style={nav(index === 0)} disabled={index === 0} onClick={() => setIndex(i => Math.max(0, i - 1))} aria-label="เดือนก่อน">‹</button>
        <div style={{ flex: 1, textAlign: "center", background: HEAD_BG[index], borderRadius: 6, padding: "0.25rem", fontWeight: 800, fontSize: "0.82rem", color: "#1e293b" }}>
          {monthLabel(month.month)}{month.studyDays ? ` · เวลาเรียน ${month.studyDays} วัน` : ""}
        </div>
        <button style={nav(index === last)} disabled={index === last} onClick={() => setIndex(i => Math.min(last, i + 1))} aria-label="เดือนถัดไป">›</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", borderTop: line, borderLeft: line, fontSize: "0.62rem" }}>
        {SHORT_DAYS.map(d => <div key={d} style={{ padding: "2px 0", textAlign: "center", fontWeight: 700, borderRight: line, borderBottom: line, background: "#f8fafc" }}>{d}</div>)}
        {weekRows(monthCells(month.month)).map(({ row, start, duty }) => <Fragment key={start}>{row.map((date, j) => {
          const i = start + j;
          const events = date ? byDate.get(date) || [] : [];
          const dayColor = events.find(ev => ev.color)?.color;
          const isToday = date === today;
          return (
            <div key={i} title={events.map(ev => ev.title + (ev.teacher ? ` (${ev.teacher})` : "")).join("\n") || undefined}
              style={{ minHeight: 40, padding: "1px 2px", overflow: "hidden", borderRight: line, borderBottom: line, background: isToday ? "#EAF5FF" : "#fff", boxShadow: isToday ? "inset 0 0 0 2px #0072D9" : "none" }}>
              {date && <div style={{ fontWeight: 700, fontSize: "0.7rem", color: COLORS[dayColor] || "#1e293b" }}>{Number(date.slice(8))}</div>}
              {events.map((ev, k) => (
                <div key={k} style={{ lineHeight: 1.15, color: COLORS[ev.color] || "#1e293b", overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", wordBreak: "break-word" }}>
                  {ev.title}
                  {ev.teacher && <div style={{ fontSize: "0.55rem", color: "#7c3aed", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>👤{ev.teacher.replace(/^ครู/, "")}</div>}
                </div>
              ))}
            </div>
          );
        })}<DutyBar duty={duty} compact /></Fragment>)}
      </div>
      <div style={{ marginTop: 4, fontSize: "0.6rem", color: "#64748b" }}>แดง = หยุด/ชดเชย/สอบ · น้ำเงิน = ค่ายลูกเสือ · แตะค้างดูรายละเอียด</div>
    </div>
  );
}
