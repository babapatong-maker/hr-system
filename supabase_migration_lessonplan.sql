-- =====================================================================
-- hr-system : แผนรายคาบ (ใบงาน PDF / YouTube / บันทึกหลังสอน / ดูแผนสอนแทน)
-- วันที่ 2026-10-13
--
-- หมายเหตุ: ข้อมูลใหม่ (worksheet_file, youtube_links, post_note) เก็บใน JSON
-- ของแผนสัปดาห์ในตาราง teaching_schedule.subject เหมือนข้อมูลแผนเดิม
-- จึง "ไม่ต้องเพิ่มคอลัมน์หรือตารางใหม่"
--
-- ที่ต้องรันมีอย่างเดียว คือสร้าง Storage bucket สำหรับไฟล์ใบงาน PDF
-- ถ้ายังไม่รัน โปรแกรมจะเก็บ PDF (ไม่เกิน 2.5 MB) ไว้ในแผนแทนอัตโนมัติ
-- =====================================================================

-- 1) bucket สาธารณะ (อ่านได้ผ่านลิงก์) จำกัด PDF ไม่เกิน 20 MB
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('lesson-files', 'lesson-files', true, 20971520, array['application/pdf'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- 2) สิทธิ์: ทุกคนอ่านได้, อัปโหลดได้ (แอปนี้ล็อกอินเองผ่านตาราง employees
--    และใช้ anon key จึงต้องอนุญาต role anon ด้วย)
drop policy if exists "lesson-files read" on storage.objects;
create policy "lesson-files read" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'lesson-files');

drop policy if exists "lesson-files upload" on storage.objects;
create policy "lesson-files upload" on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'lesson-files');

-- (ไม่เปิดสิทธิ์ update/delete ให้ anon เพื่อกันการลบไฟล์ของคนอื่น)
