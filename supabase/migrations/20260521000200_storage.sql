-- ============================================
-- ALIF SMART — Storage buckets + policies
--
-- 4 buckets:
--   pendaftaran  — anon upload during registration
--                  (foto santri + KK/akta). Read: admin only.
--   foto-santri  — santri profile photos. Read: authenticated.
--                  Write: admin.
--   materi       — learning materials (PDF, video links).
--                  Read: authenticated. Write: admin/guru.
--   bukti-spp    — proof of payment uploads.
--                  Read: admin + the owning ortu. Write: ortu.
-- ============================================

-- Create buckets (idempotent).
insert into storage.buckets (id, name, public)
values
  ('pendaftaran', 'pendaftaran', false),
  ('foto-santri', 'foto-santri', false),
  ('materi',      'materi',      false),
  ('bukti-spp',   'bukti-spp',   false)
on conflict (id) do nothing;

-- ============================================
-- pendaftaran bucket
-- Path convention: pendaftaran/{client-generated-uuid}/{filename}
-- The client uses the same UUID to link the upload to the santri
-- row it just inserted.
-- ============================================
create policy "pendaftaran: anyone upload"
  on storage.objects for insert
  to anon, authenticated
  with check (bucket_id = 'pendaftaran');

create policy "pendaftaran: admin read"
  on storage.objects for select
  using (bucket_id = 'pendaftaran' and is_admin());

create policy "pendaftaran: admin update + delete"
  on storage.objects for all
  using (bucket_id = 'pendaftaran' and is_admin())
  with check (bucket_id = 'pendaftaran' and is_admin());

-- ============================================
-- foto-santri bucket
-- Path: foto-santri/{santri_id}.jpg
-- ============================================
create policy "foto-santri: authenticated read"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'foto-santri');

create policy "foto-santri: admin write"
  on storage.objects for all
  using (bucket_id = 'foto-santri' and is_admin())
  with check (bucket_id = 'foto-santri' and is_admin());

-- ============================================
-- materi bucket
-- Path: materi/{jenjang}/{materi_id}-{filename}
-- ============================================
create policy "materi: authenticated read"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'materi');

create policy "materi: admin write"
  on storage.objects for all
  using (bucket_id = 'materi' and is_admin())
  with check (bucket_id = 'materi' and is_admin());

create policy "materi: guru insert"
  on storage.objects for insert
  with check (bucket_id = 'materi' and auth_role() = 'guru');

-- ============================================
-- bukti-spp bucket
-- Path: bukti-spp/{ortu_user_id}/{spp_id}-{filename}
-- Path's first segment must match auth.uid() so ortu
-- can only upload their own files.
-- ============================================
create policy "bukti-spp: ortu upload own"
  on storage.objects for insert
  with check (
    bucket_id = 'bukti-spp'
    and auth_role() = 'ortu'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "bukti-spp: ortu read own"
  on storage.objects for select
  using (
    bucket_id = 'bukti-spp'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "bukti-spp: admin read all"
  on storage.objects for select
  using (bucket_id = 'bukti-spp' and is_admin());
