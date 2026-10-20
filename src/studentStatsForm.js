// แบบฟอร์ม "สถิตินักเรียนมาเรียนประจำวัน" — เติมข้อมูลลงสำเนาไฟล์ต้นฉบับ (public/forms/student_daily_stats_template.xlsx)
// ไม่แก้เลย์เอาต์: เขียนเฉพาะช่องตัวเลข B,C,E,F แถวชั้นเรียน, ช่องหมายเหตุ K และบรรทัดวันที่ A3

export const STUDENT_STATS_TEMPLATE_URL = "/forms/student_daily_stats_template.xlsx";

// ชั้น → แถวในฟอร์ม (แถว 8–9 ถูกซ่อนในต้นฉบับ, แถวรวมเป็นสูตร)
export const STUDENT_STATS_LEVELS = [
  { key: "เตรียมอนุบาล", row: 10, group: "เตรียมอนุบาล" },
  { key: "อ.1", row: 12, group: "ก่อนประถมศึกษา" },
  { key: "อ.2", row: 13, group: "ก่อนประถมศึกษา" },
  { key: "อ.3", row: 14, group: "ก่อนประถมศึกษา" },
  { key: "ป.1", row: 16, group: "ประถมศึกษา" },
  { key: "ป.2", row: 17, group: "ประถมศึกษา" },
  { key: "ป.3", row: 18, group: "ประถมศึกษา" },
  { key: "ป.4", row: 19, group: "ประถมศึกษา" },
  { key: "ป.5", row: 20, group: "ประถมศึกษา" },
  { key: "ป.6", row: 21, group: "ประถมศึกษา" },
  { key: "ม.1", row: 23, group: "มัธยมศึกษาตอนต้น" },
  { key: "ม.2", row: 24, group: "มัธยมศึกษาตอนต้น" },
  { key: "ม.3", row: 25, group: "มัธยมศึกษาตอนต้น" },
];

const THAI_DAYS = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"];
const THAI_MONTHS = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];

// ชื่อห้องที่ครูตั้ง (เช่น "ป.2/1", "ประถมศึกษาปีที่ 2", "อนุบาล 1", "เตรียมอนุบาล") → คีย์ชั้นในฟอร์ม
export function classLevelKey(className) {
  const text = String(className || "").replace(/\s+/g, "");
  if (!text) return "";
  if (/เตรียมอนุบาล|เตรียมอ/.test(text)) return "เตรียมอนุบาล";
  let m = text.match(/^(ป|ม|อ)\.?(\d)/);
  if (m) return `${m[1]}.${m[2]}`;
  m = text.match(/ประถมศึกษาปีที่(\d)/); if (m) return `ป.${m[1]}`;
  m = text.match(/มัธยมศึกษาปีที่(\d)/); if (m) return `ม.${m[1]}`;
  m = text.match(/อนุบาล(?:ปีที่)?(\d)/); if (m) return `อ.${m[1]}`;
  return "";
}

const MALE_PREFIX = /^(เด็ก\s*ชาย|ด\.\s*ช\.?|ดช\.?|นาย|ช\.)\s*/;
const FEMALE_PREFIX = /^(เด็ก\s*หญิง|ด\.\s*ญ\.?|ดญ\.?|นางสาว|น\.\s*ส\.?|ญ\.)\s*/;

// เพศ: ใช้ค่าที่ครูกำหนด (sex = "M"/"F") ก่อน ถ้าไม่มีเดาจากคำนำหน้าชื่อ
export function studentSex(student) {
  if (student?.sex === "M" || student?.sex === "F") return student.sex;
  const name = String(student?.name || "").trim();
  if (MALE_PREFIX.test(name)) return "M";
  if (FEMALE_PREFIX.test(name)) return "F";
  return "";
}

export function stripNamePrefix(name) {
  return String(name || "").trim().replace(MALE_PREFIX, "").replace(FEMALE_PREFIX, "").trim();
}

// ชื่อในช่องหมายเหตุแบบฟอร์มเดิม: "ช.ชื่อ นามสกุล" / "ญ.ชื่อ นามสกุล"
export function remarkName(student) {
  const sex = studentSex(student);
  const full = [stripNamePrefix(student?.name), String(student?.surname || "").trim()].filter(Boolean).join(" ");
  return `${sex === "M" ? "ช." : sex === "F" ? "ญ." : ""}${full}`;
}

export const MILK_OTHER = "__other__";
export const MILK_NONE = "__none__";

// books: [{ class_name, students, days }] ของทุกห้อง → สถิติรายชั้นของวันที่ date
export function buildStudentStats(books, date) {
  const levels = Object.fromEntries(STUDENT_STATS_LEVELS.map(level => [level.key, { boys: 0, girls: 0, boysPresent: 0, girlsPresent: 0, absent: [], unknownSex: [], unchecked: 0, classes: [], milk: [] }]));
  const unmapped = [];
  (books || []).forEach(book => {
    const key = classLevelKey(book?.class_name);
    const students = (book?.students || []).filter(student => String(student?.name || "").trim());
    if (!students.length) return;
    if (!levels[key]) { unmapped.push(book?.class_name || "(ไม่ระบุห้อง)"); return; }
    const target = levels[key];
    const day = book?.days?.[date] || {};
    const marks = day.marks || {};
    const milk = day.milk || {};
    target.classes.push(book.class_name);
    if (!day.saved_at) target.unchecked += 1;
    students.forEach(student => {
      const sex = studentSex(student);
      const status = marks[student.id] || "";
      const present = status === "present" || status === "late";
      if (sex === "M") { target.boys += 1; if (present) target.boysPresent += 1; }
      else if (sex === "F") { target.girls += 1; if (present) target.girlsPresent += 1; }
      else target.unknownSex.push(student);
      if (!present) {
        target.absent.push({ student, status });
        const pick = milk[student.id] || "";
        const drinker = students.find(item => item.id === pick);
        target.milk.push({ student, status, drinker: drinker || null, choice: drinker ? "student" : pick === MILK_OTHER ? "other" : pick === MILK_NONE ? "none" : "" , note: day.milk_note?.[student.id] || "" });
      }
    });
  });
  return { date, levels, unmapped };
}

export function formDateLine(date) {
  const [y, m, d] = String(date).split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  // รูปแบบเดียวกับต้นฉบับ: "ประจำวัน .…จันทร์... วันที่ …12…  เดือน …ตุลาคม... พ.ศ. ..... 2569 …….."
  return `ประจำวัน .…${THAI_DAYS[dow]}... วันที่ …${d}…  เดือน …${THAI_MONTHS[m - 1]}... พ.ศ. ..... ${y + 543} ……..`;
}

// เติมข้อมูลลงเวิร์กบุ๊กต้นฉบับ (exceljs) แล้วคืนค่า buffer ของ .xlsx
export async function fillStudentStatsWorkbook(ExcelJS, JSZip, templateBuffer, stats) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(templateBuffer);
  const sheet = workbook.worksheets[0];
  sheet.getCell("A3").value = formDateLine(stats.date);
  STUDENT_STATS_LEVELS.forEach(level => {
    const item = stats.levels[level.key];
    const row = sheet.getRow(level.row);
    row.getCell("B").value = item.boys;
    row.getCell("C").value = item.girls;
    row.getCell("E").value = item.boysPresent;
    row.getCell("F").value = item.girlsPresent;
    row.getCell("K").value = item.absent.map(entry => remarkName(entry.student)).join(" , ") || null;
  });
  // ให้ Excel/LibreOffice คำนวณสูตรรวมใหม่ตอนเปิดไฟล์
  workbook.calcProperties = { ...(workbook.calcProperties || {}), fullCalcOnLoad: true };
  const written = await workbook.xlsx.writeBuffer();
  return restoreTemplateSheetXml(JSZip, templateBuffer, written);
}

// exceljs ตัดความกว้างคอลัมน์ที่เท่ากับค่า default ของมัน (L–M = 9) และ customHeight ของแถวว่าง
// ทำให้หน้ากระดาษล้นเป็น 2 หน้า → คัด <cols> และ <sheetFormatPr> จากไฟล์ต้นฉบับกลับมาตรง ๆ
async function restoreTemplateSheetXml(JSZip, templateBuffer, writtenBuffer) {
  const sheetPath = "xl/worksheets/sheet1.xml";
  const original = await JSZip.loadAsync(templateBuffer);
  const output = await JSZip.loadAsync(writtenBuffer);
  const sourceXml = await original.file(sheetPath).async("string");
  let xml = await output.file(sheetPath).async("string");
  const cols = sourceXml.match(/<cols>[\s\S]*?<\/cols>/);
  if (cols) xml = xml.replace(/<cols>[\s\S]*?<\/cols>/, cols[0]);
  const format = sourceXml.match(/<sheetFormatPr[^>]*\/>/);
  if (format) xml = xml.replace(/<sheetFormatPr[^>]*\/>/, format[0]);
  output.file(sheetPath, xml);
  return output.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}

// ผลรวมแบบเดียวกับสูตรในฟอร์ม (ใช้ในหน้าพิมพ์)
export function statsTotals(stats) {
  const sum = keys => keys.reduce((acc, key) => {
    const item = stats.levels[key];
    acc.boys += item.boys; acc.girls += item.girls; acc.boysPresent += item.boysPresent; acc.girlsPresent += item.girlsPresent;
    return acc;
  }, { boys: 0, girls: 0, boysPresent: 0, girlsPresent: 0 });
  const groups = {
    "เตรียมอนุบาล": sum(["เตรียมอนุบาล"]),
    "ก่อนประถมศึกษา": sum(["อ.1", "อ.2", "อ.3"]),
    "ประถมศึกษา": sum(["ป.1", "ป.2", "ป.3", "ป.4", "ป.5", "ป.6"]),
    "มัธยมศึกษาตอนต้น": sum(["ม.1", "ม.2", "ม.3"]),
  };
  const all = Object.values(groups).reduce((acc, item) => ({ boys: acc.boys + item.boys, girls: acc.girls + item.girls, boysPresent: acc.boysPresent + item.boysPresent, girlsPresent: acc.girlsPresent + item.girlsPresent }), { boys: 0, girls: 0, boysPresent: 0, girlsPresent: 0 });
  return { groups, all };
}
