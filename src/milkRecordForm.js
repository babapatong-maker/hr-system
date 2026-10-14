// แบบบันทึกการแจกนมให้นักเรียนดื่ม (บันทึกดื่มนม) รายห้อง/รายเดือน
// เติมลงสำเนาแบบฟอร์มต้นฉบับ public/forms/milk_record_template.xlsx (ชีตเดียว ลอกจากไฟล์ .xls ของโรงเรียน)
// เครื่องหมาย: มาเรียน = เส้นแดง 1 ขีด "/" · ถูกเลือกให้ดื่มนมแทนเพื่อน = เพิ่ม 1 ขีดต่อ 1 กล่อง ("//")
// ขาด/ลา = ไม่มีเครื่องหมาย · วันเสาร์–อาทิตย์ที่ไม่มีการเช็คชื่อ = เส้นทแยงสีแดงทั้งคอลัมน์ (แบบเดียวกับต้นฉบับ)
import { MILK_OTHER, MILK_NONE, classLevelKey } from "./studentStatsForm.js";

export const MILK_RECORD_TEMPLATE_URL = "/forms/milk_record_template.xlsx";
export const MILK_FIRST_ROW = 7;
export const MILK_ROWS_PER_SHEET = 29; // แถว 7–35
export const MILK_DAY_FIRST_COL = 6; // F = วันที่ 1 … AJ = วันที่ 31
export const MILK_MARK = "/";
export const MILK_MARK_COLOR = "FFFF0000";
export const MILK_MAX_MARKS = 4;

export const THAI_MONTHS_FULL = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];

const LEVEL_WORD = { "ป": "ประถมศึกษาปีที่", "ม": "มัธยมศึกษาปีที่", "อ": "อนุบาลปีที่" };

// ข้อความบรรทัด "ชั้น" รูปแบบเดียวกับต้นฉบับ: "ชั้น   ประถมศึกษาปีที่..... 2 ......."
export function milkClassLine(className) {
  const name = String(className || "").trim();
  const key = classLevelKey(name);
  const m = key.match(/^(ป|ม|อ)\.(\d)$/);
  if (m) {
    const room = (name.replace(/\s+/g, "").match(/\/(\d+)/) || [])[1];
    return `ชั้น   ${LEVEL_WORD[m[1]]}..... ${m[2]}${room ? `/${room}` : ""} .......`;
  }
  return `ชั้น   ${name || "................"} .......`;
}

const daysInMonth = month => { const [y, m] = month.split("-").map(Number); return new Date(Date.UTC(y, m, 0)).getUTCDate(); };
const dayOfWeek = (month, day) => { const [y, m] = month.split("-").map(Number); return new Date(Date.UTC(y, m - 1, day)).getUTCDay(); };

// book = { class_name, students, days } ของห้องเดียว · month = "YYYY-MM"
export function buildMilkRecord(book, month) {
  const students = (book?.students || []).filter(student => String(student?.name || "").trim())
    .slice().sort((a, b) => (Number(a.number) || 9999) - (Number(b.number) || 9999));
  const total = daysInMonth(month);
  const days = [];
  const substituteIssues = [];
  for (let day = 1; day <= 31; day += 1) {
    const date = `${month}-${String(day).padStart(2, "0")}`;
    const record = day <= total ? book?.days?.[date] : null;
    const dow = day <= total ? dayOfWeek(month, day) : null;
    const checked = !!(record && record.saved_at && Object.keys(record.marks || {}).length);
    days.push({ day, date, inMonth: day <= total, weekend: dow === 0 || dow === 6, checked, record: checked ? record : null });
  }
  const rows = students.map(student => {
    const marks = days.map(entry => {
      if (!entry.record) return 0;
      const status = entry.record.marks?.[student.id] || "";
      if (status !== "present" && status !== "late") return 0; // ขาด/ลา/ยังไม่เช็ค = ไม่มีเครื่องหมาย
      const subs = Object.entries(entry.record.milk || {}).filter(([absentId, pick]) => pick === student.id && absentId !== student.id).length;
      return Math.min(MILK_MAX_MARKS, 1 + subs);
    });
    return { student, marks, days: marks.filter(Boolean).length, cartons: marks.reduce((sum, n) => sum + n, 0), substitutes: marks.reduce((sum, n) => sum + Math.max(0, n - 1), 0) };
  });
  // ตรวจรายการดื่มแทนที่เลือกนักเรียนที่ไม่ได้มาเรียน (จะไม่ถูกขีด)
  days.forEach(entry => {
    if (!entry.record) return;
    Object.entries(entry.record.milk || {}).forEach(([absentId, pick]) => {
      if (!pick || pick === MILK_OTHER || pick === MILK_NONE) return;
      const status = entry.record.marks?.[pick] || "";
      if (status !== "present" && status !== "late") {
        const who = students.find(item => item.id === pick);
        substituteIssues.push({ date: entry.date, absent: students.find(item => item.id === absentId), drinker: who || null });
      }
    });
  });
  const unpicked = [];
  days.forEach(entry => {
    if (!entry.record) return;
    students.forEach(student => {
      const status = entry.record.marks?.[student.id] || "";
      if (status && status !== "present" && status !== "late" && !entry.record.milk?.[student.id]) unpicked.push({ date: entry.date, student });
    });
  });
  return {
    month, className: book?.class_name || "", students, rows, days,
    checkedDays: days.filter(entry => entry.checked).length,
    totalCartons: rows.reduce((sum, row) => sum + row.cartons, 0),
    totalSubstitutes: rows.reduce((sum, row) => sum + row.substitutes, 0),
    substituteIssues, unpicked,
    sheets: Math.max(1, Math.ceil(students.length / MILK_ROWS_PER_SHEET)),
  };
}

const markText = count => (count > 0 ? MILK_MARK.repeat(count) : null);
const markFont = count => ({ name: "Angsana New", size: count > 2 ? 10 : 14, bold: true, color: { argb: MILK_MARK_COLOR } });

function fillSheet(sheet, record, part, teacherName) {
  const [year, mon] = record.month.split("-").map(Number);
  sheet.getCell("A4").value = milkClassLine(record.className) + (record.sheets > 1 ? `   (แผ่นที่ ${part + 1}/${record.sheets})` : "");
  // F5 เป็นข้อความหลายรูปแบบ (มีเครื่องหมาย ü แบบ Wingdings) → แทนเฉพาะชื่อเดือนในช่วงแรก
  const f5 = sheet.getCell("F5").value;
  if (f5 && Array.isArray(f5.richText)) {
    const runs = f5.richText.map((run, index) => (index === 0 ? { ...run, text: `เดือน..... ${THAI_MONTHS_FULL[mon - 1]}` } : run));
    sheet.getCell("F5").value = { richText: runs };
  }
  void year;
  const slice = record.rows.slice(part * MILK_ROWS_PER_SHEET, (part + 1) * MILK_ROWS_PER_SHEET);
  for (let i = 0; i < MILK_ROWS_PER_SHEET; i += 1) {
    const row = sheet.getRow(MILK_FIRST_ROW + i);
    const item = slice[i];
    row.getCell(1).value = item ? Number(item.student.number) || part * MILK_ROWS_PER_SHEET + i + 1 : null;
    row.getCell(2).value = item ? String(item.student.name || "").trim() : null;
    row.getCell(3).value = item ? String(item.student.surname || "").trim() || null : null;
    record.days.forEach((entry, index) => {
      const cell = row.getCell(MILK_DAY_FIRST_COL + index);
      const count = item ? item.marks[index] : 0;
      // เซลล์จากแม่แบบใช้อ็อบเจกต์สไตล์ร่วมกัน → สร้างสไตล์ใหม่ทั้งก้อนต่อเซลล์ (กันการแก้ทับกันทั้งแถว)
      const base = cell.style || {};
      const border = { ...(base.border || {}) };
      // วันหยุดเสาร์–อาทิตย์ที่ไม่มีการเช็คชื่อ: เส้นทแยงสีแดง แบบเดียวกับต้นฉบับ
      if (entry.inMonth && entry.weekend && !entry.checked) border.diagonal = { up: true, down: false, style: "thin", color: { argb: MILK_MARK_COLOR } };
      else delete border.diagonal;
      cell.style = {
        ...base,
        font: count ? markFont(count) : { ...(base.font || {}) },
        alignment: { ...(base.alignment || {}), horizontal: count ? "center" : base.alignment?.horizontal, vertical: "middle" },
        border,
      };
      cell.value = markText(count);
    });
    row.getCell(37).value = item && item.days ? item.days : null; // AK รวมวัน
  }
  if (teacherName) sheet.getCell("C37").value = ` (  ${teacherName} )`;
}

// คืนค่า buffer .xlsx
export async function fillMilkRecordWorkbook(ExcelJS, JSZip, templateBuffer, record, { teacherName = "" } = {}) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(templateBuffer);
  const base = workbook.worksheets[0];
  const sheets = [base];
  for (let part = 1; part < record.sheets; part += 1) {
    const copy = workbook.addWorksheet(`${base.name} (${part + 1})`);
    copy.model = { ...base.model, id: copy.id, name: copy.name };
    sheets.push(copy);
  }
  sheets.forEach((sheet, part) => fillSheet(sheet, record, part, teacherName));
  const written = await workbook.xlsx.writeBuffer();
  return restoreSheetXml(JSZip, templateBuffer, written);
}

// exceljs ตัด/เปลี่ยน <cols> <sheetFormatPr> <pageSetup> และทิ้ง <printOptions horizontalCentered> → คัดจากแม่แบบกลับมา
async function restoreSheetXml(JSZip, templateBuffer, writtenBuffer) {
  const sheetRe = /^xl\/worksheets\/sheet\d+\.xml$/;
  const original = await JSZip.loadAsync(templateBuffer);
  const output = await JSZip.loadAsync(writtenBuffer);
  const srcPath = Object.keys(original.files).find(name => sheetRe.test(name));
  const src = await original.file(srcPath).async("string");
  const grab = re => (src.match(re) || [null])[0];
  const parts = {
    cols: grab(/<cols>[\s\S]*?<\/cols>/),
    format: grab(/<sheetFormatPr[^>]*?(\/>|>[\s\S]*?<\/sheetFormatPr>)/),
    setup: grab(/<pageSetup[^>]*\/>/),
    print: grab(/<printOptions[^>]*\/>/),
  };
  for (const name of Object.keys(output.files).filter(n => sheetRe.test(n))) {
    let xml = await output.file(name).async("string");
    if (parts.cols) xml = xml.replace(/<cols>[\s\S]*?<\/cols>/, parts.cols);
    if (parts.format) xml = xml.replace(/<sheetFormatPr[^>]*?(\/>|>[\s\S]*?<\/sheetFormatPr>)/, parts.format);
    if (parts.setup) xml = xml.replace(/<pageSetup[^>]*\/>/, parts.setup);
    if (parts.print) xml = /<printOptions[^>]*\/>/.test(xml) ? xml.replace(/<printOptions[^>]*\/>/, parts.print) : xml.replace(/<pageMargins/, parts.print + "<pageMargins");
    output.file(name, xml);
  }
  return output.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}

// ─── หน้าพิมพ์ / PDF: จำลองแบบฟอร์ม (คอลัมน์/แถว/ฟอนต์/เส้น) · หัวตารางแถว 1–6 พิมพ์ซ้ำทุกหน้าเหมือน Print_Titles ของไฟล์ ───
const PRINT_COLS = [3.12, 12.99, 13.36, 6.25, 6.25, ...Array(31).fill(2.12), 5.36, 6.37, 7.24, 6.87, 6.87];
const esc = value => String(value ?? "").replace(/[&<>"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[char]));

export function milkRecordPrintHtml(record, { teacherName = "" } = {}) {
  const colPx = width => Math.trunc(width * 7 + 5); // ความกว้างคอลัมน์แบบ Excel (ตัวเลขฟอนต์ปกติ 7px)
  const totalPx = PRINT_COLS.reduce((sum, width) => sum + colPx(width), 0);
  // A4 แนวนอน ขอบซ้าย/ขวา 0.394" → พื้นที่พิมพ์ ~1047px · ย่อเท่าที่ไฟล์กำหนด (91%) หรือพอดีความกว้าง
  const S = Math.min(0.91, 1040 / totalPx);
  const px = width => Math.round(colPx(width) * S * 100) / 100;
  const pt = value => Math.round(value * S * 100) / 100;
  const [, mon] = record.month.split("-").map(Number);
  const dayHead = record.days.map(entry => `<td class="c b" style="font-size:${pt(12)}pt">${entry.day}</td>`).join("");
  const parts = [];
  for (let part = 0; part < record.sheets; part += 1) {
    const slice = record.rows.slice(part * MILK_ROWS_PER_SHEET, (part + 1) * MILK_ROWS_PER_SHEET);
    const body = Array.from({ length: MILK_ROWS_PER_SHEET }, (_, i) => {
      const item = slice[i];
      const cells = record.days.map((entry, index) => {
        const count = item ? item.marks[index] : 0;
        const holiday = entry.inMonth && entry.weekend && !entry.checked;
        return `<td class="d${holiday ? " hol" : ""}">${count ? `<span class="mk${count > 2 ? " sm" : ""}">${MILK_MARK.repeat(count)}</span>` : ""}</td>`;
      }).join("");
      return `<tr style="height:${pt(21.95)}pt"><td class="c" style="font-size:${pt(12)}pt">${item ? esc(Number(item.student.number) || part * MILK_ROWS_PER_SHEET + i + 1) : i + 1 + part * MILK_ROWS_PER_SHEET}</td><td class="nm">${item ? esc(item.student.name) : ""}</td><td class="nm">${item ? esc(item.student.surname || "") : ""}</td><td></td><td></td>${cells}<td class="c">${item && item.days ? item.days : ""}</td><td></td><td></td><td></td><td></td></tr>`;
    }).join("");
    parts.push(`<table class="sheet"${part ? ' style="break-before:page"' : ""}>
<colgroup>${PRINT_COLS.map(width => `<col style="width:${px(width)}px">`).join("")}</colgroup>
<thead>
<tr style="height:${pt(21)}pt"><td colspan="41" class="t">แบบบันทึกการแจกนมให้นักเรียนดื่ม</td></tr>
<tr style="height:${pt(21)}pt"><td colspan="41" class="t">สำนักบริหารงานคณะกรรมการส่งเสริมการศึกษาเอกชน</td></tr>
<tr style="height:${pt(21)}pt"><td colspan="41" class="t">โรงเรียน&nbsp;&nbsp; นิมิตศึกษา&nbsp;&nbsp; แขวง/ตำบล&nbsp; ไพศาลี&nbsp;&nbsp; เขต/อำเภอ&nbsp; ไพศาลี&nbsp;&nbsp; จังหวัด&nbsp; นครสวรรค์</td></tr>
<tr style="height:${pt(21)}pt"><td colspan="41" class="t" style="white-space:pre">${esc(milkClassLine(record.className))}${record.sheets > 1 ? `   (แผ่นที่ ${part + 1}/${record.sheets})` : ""}</td></tr>
<tr class="g" style="height:${pt(21)}pt"><td rowspan="2" class="c b">ที่</td><td rowspan="2" colspan="2" class="c b">ชื่อ-สกุล</td><td colspan="2" class="c b">ต้นเดือน</td><td colspan="31" class="c b" style="white-space:pre">เดือน..... ${THAI_MONTHS_FULL[mon - 1]} ................ได้รับนมบริโภค   ( กาเครื่องหมาย ✓วันที่ได้รับนม )</td><td rowspan="2" class="c b" style="font-size:${pt(13)}pt">รวมวัน</td><td colspan="2" class="c b">ปลายเดือน</td><td rowspan="2" colspan="2" class="c b">หมายเหตุ</td></tr>
<tr class="g" style="height:${pt(21)}pt"><td class="c b" style="font-size:${pt(13)}pt">น้ำหนัก</td><td class="c b" style="font-size:${pt(13)}pt">ส่วนสูง</td>${dayHead}<td class="c b">น้ำหนัก</td><td class="c b">ส่วนสูง</td></tr>
</thead>
<tbody class="g">${body}</tbody>
<tbody class="f">
<tr style="height:${pt(30)}pt"><td></td><td></td><td colspan="5" class="c s">ลงชื่อ....................................................ครูประจำชั้น</td><td colspan="20"></td><td colspan="11" class="c s">ลงชื่อ......................................................ผู้อำนวยการ</td><td colspan="3"></td></tr>
<tr style="height:${pt(26.25)}pt"><td></td><td></td><td colspan="3" class="c s" style="white-space:pre">${teacherName ? ` (  ${esc(teacherName)} )` : " (........................................................)"}</td><td colspan="23"></td><td colspan="9" class="c s" style="white-space:pre">  (   นางศศิธร     มีสมสืบ )</td><td colspan="4"></td></tr>
<tr style="height:${pt(10.5)}pt"><td colspan="41"></td></tr>
<tr style="height:${pt(21)}pt"><td></td><td colspan="37" class="b" style="white-space:pre">หมายเหตุ          1.  แบบบันทึกนี้ให้ครูประจำชั้นจัดทำทุกเดือน             2.   เก็บไว้ที่โรงเรียนเพื่อตรวจสอบ</td><td colspan="3"></td></tr>
</tbody></table>`);
  }
  return `<!doctype html><html lang="th"><head><meta charset="utf-8"><title>แบบบันทึกการแจกนม ${esc(record.className)} ${esc(record.month)}</title>
<style>
@font-face { font-family: "FormAngsana"; font-weight: 400; src: local("Angsana New"), local("AngsanaNew"), local("AngsanaUPC"); }
@font-face { font-family: "FormAngsana"; font-weight: 700; src: local("Angsana New Bold"), local("AngsanaNew-Bold"), local("AngsanaUPC Bold"); }
@font-face { font-family: "FormSarabun"; font-weight: 400; size-adjust: 72%; unicode-range: U+02D7, U+0303, U+0331, U+0E01-0E5B, U+200C-200D, U+25CC; src: url(https://fonts.gstatic.com/s/sarabun/v17/DtVjJx26TKEr37c9aAFJn2QN.woff2) format("woff2"); }
@font-face { font-family: "FormSarabun"; font-weight: 700; size-adjust: 72%; unicode-range: U+02D7, U+0303, U+0331, U+0E01-0E5B, U+200C-200D, U+25CC; src: url(https://fonts.gstatic.com/s/sarabun/v17/DtVmJx26TKEr37c9YK5sik8s6zDX.woff2) format("woff2"); }
@font-face { font-family: "FormSarabun"; font-weight: 400; size-adjust: 72%; unicode-range: U+0000-00FF, U+2000-206F; src: url(https://fonts.gstatic.com/s/sarabun/v17/DtVjJx26TKEr37c9aBVJnw.woff2) format("woff2"); }
@font-face { font-family: "FormSarabun"; font-weight: 700; size-adjust: 72%; unicode-range: U+0000-00FF, U+2000-206F; src: url(https://fonts.gstatic.com/s/sarabun/v17/DtVmJx26TKEr37c9YK5silss6w.woff2) format("woff2"); }
@page { size: A4 landscape; margin: 0.8cm 1cm; }
* { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { margin: 0; font-family: "FormAngsana", "FormSarabun", serif; color: #000; }
table.sheet { border-collapse: collapse; table-layout: fixed; width: ${Math.round(PRINT_COLS.reduce((sum, width) => sum + px(width), 0))}px; margin: 0 auto; }
td { padding: 0 1px; overflow: hidden; white-space: nowrap; font-size: ${pt(14)}pt; line-height: 1; vertical-align: middle; }
.t { text-align: center; font-weight: bold; }
thead tr.g td, tbody.g td { border: 1px solid #000; }
.c { text-align: center; } .b { font-weight: bold; } .s { font-size: ${pt(12)}pt; }
.nm { text-align: left; }
.d { padding: 0; text-align: center; }
.hol { background: linear-gradient(to top left, transparent calc(50% - 0.6px), #ff0000 calc(50% - 0.6px), #ff0000 calc(50% + 0.6px), transparent calc(50% + 0.6px)); }
.mk { color: #ff0000; font-weight: bold; font-size: ${pt(14)}pt; letter-spacing: -0.5px; }
.mk.sm { font-size: ${pt(10)}pt; }
tbody.g tr { break-inside: avoid; }
</style></head><body>${parts.join("")}
<script>window.onload = () => (document.fonts ? document.fonts.ready : Promise.resolve()).then(() => setTimeout(() => window.print(), 200));</script>
</body></html>`;
}
