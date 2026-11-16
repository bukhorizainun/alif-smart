-- =====================================================================
-- ALIF SMART — SETUP LENGKAP (satu kali jalan)
--
-- CARA PAKAI
--   1. Buka file ini di Notepad / VS Code.
--   2. Ctrl+A, Ctrl+C  (salin SELURUH ISI, bukan nama filenya).
--   3. Supabase -> SQL Editor -> New query -> Ctrl+V -> Run.
--
-- Kalau sebelumnya sudah pernah dijalankan sebagian dan muncul error
-- "already exists", jalankan dulu blok RESET di bawah (hapus tanda --
-- di depan setiap barisnya), lalu jalankan file ini lagi.
-- RESET menghapus semua tabel ALIF SMART beserta isinya.
--
-- File ini dibuat dari supabase/migrations/*.sql (urut). Jangan diedit
-- langsung; edit file migrasinya lalu buat ulang file ini.
-- =====================================================================

-- ---------------- RESET (opsional) ----------------
-- drop table if exists pengumuman, spp, progress_hafalan, progress_iqro,
--   materi, absensi, santri, kelas, profiles cascade;
-- drop function if exists handle_new_user, set_updated_at, protect_profile_fields,
--   protect_spp_fields, komite_ringkasan, auth_role, is_admin, guru_kelas_ids cascade;
-- drop type if exists user_role, akun_status, jenjang_type, jk_type, santri_status,
--   absen_status, spp_status, pengumuman_target, kemampuan_baca cascade;
-- do $$ declare p record; begin
--   for p in select policyname from pg_policies
--            where schemaname = 'storage' and tablename = 'objects'
--              and split_part(policyname, ':', 1) in ('pendaftaran','foto-santri','materi','bukti-spp')
--   loop execute format('drop policy %I on storage.objects', p.policyname); end loop;
-- end $$;
-- --------------------------------------------------


-- >>>>>>>>>> migrations\20260521000000_schema.sql >>>>>>>>>>

-- ============================================
-- ALIF SMART — Schema (V1)
-- 9 tables: profiles, kelas, santri, absensi, materi,
-- progress_iqro, progress_hafalan, spp, pengumuman
-- ============================================

-- ---- Extensions ----
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- ---- Enums ----
create type user_role          as enum ('admin', 'guru', 'ortu', 'komite', 'santri');
create type akun_status        as enum ('menunggu', 'aktif', 'ditolak');
create type jenjang_type       as enum ('TKQ', 'TPQ', 'MDTA');
create type jk_type            as enum ('L', 'P');
create type santri_status      as enum ('pending', 'aktif', 'alumni', 'nonaktif');
create type absen_status       as enum ('hadir', 'izin', 'sakit', 'alpa');
create type spp_status         as enum ('lunas', 'belum', 'cicil');
create type pengumuman_target  as enum ('semua', 'jenjang', 'kelas', 'individu');
create type kemampuan_baca     as enum (
  'belum_hijaiyah',
  'sudah_hijaiyah',
  'iqro_1_2',
  'iqro_3_4',
  'iqro_5_6',
  'al_quran'
);

-- ============================================
-- profiles
-- Extends auth.users with a role, an approval status
-- and display info.
-- Every new account (Google, email) starts as
-- role='ortu', status='menunggu'. Until an admin sets
-- status='aktif', auth_role() returns null and RLS
-- hides all data from that account.
-- ============================================
create table profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  role       user_role not null default 'ortu',
  status     akun_status not null default 'menunggu',
  full_name  text not null,
  phone      text,
  email      text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index profiles_role_idx   on profiles(role);
create index profiles_status_idx on profiles(status);

-- Auto-create a profile row when a new auth user is created.
-- Role and status are NEVER taken from user metadata: a client
-- could put role='admin' there. Google sends the display name as
-- 'full_name' or 'name' and the photo as 'avatar_url' or 'picture'.
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, role, status, full_name, email, phone, avatar_url)
  values (
    new.id,
    'ortu',
    'menunggu',
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', new.email),
    new.email,
    new.raw_user_meta_data->>'phone',
    coalesce(new.raw_user_meta_data->>'avatar_url', new.raw_user_meta_data->>'picture')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ============================================
-- kelas
-- One kelas, one wali (guru). A guru can be wali of
-- multiple kelas (separate rows pointing to same guru).
-- ============================================
create table kelas (
  id               uuid primary key default uuid_generate_v4(),
  jenjang          jenjang_type not null,
  nama             text not null,
  guru_profile_id  uuid references profiles(id) on delete set null,
  jadwal_text      text,
  tahun_ajaran     text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index kelas_jenjang_idx on kelas(jenjang);
create index kelas_guru_idx    on kelas(guru_profile_id);

-- ============================================
-- santri
-- Core entity. Anonymous pendaftaran inserts here
-- with status='pending'. Admin verifies → 'aktif'.
-- ortu_profile_id is linked once the ortu account
-- has been provisioned by admin.
-- ============================================
create table santri (
  id                   uuid primary key default uuid_generate_v4(),

  -- Identitas
  nama_lengkap         text not null,
  panggilan            text,
  nik                  text check (nik is null or nik ~ '^[0-9]{16}$'),
  tanggal_lahir        date not null,
  tempat_lahir         text not null,
  jenis_kelamin        jk_type not null,
  alamat               text not null,

  -- Program
  jenjang              jenjang_type not null,
  kelas_id             uuid references kelas(id) on delete set null,
  kemampuan_baca       kemampuan_baca,
  sekolah_formal       text,

  -- Orang tua / wali (collected at pendaftaran)
  nama_ayah            text,
  nama_ibu             text,
  pekerjaan_ortu       text,
  hp_ortu              text,
  email_ortu           text,
  hubungan_pendaftar   text,
  ortu_profile_id      uuid references profiles(id) on delete set null,

  -- Files (storage URLs)
  foto_url             text,
  dokumen_urls         jsonb not null default '[]'::jsonb,

  -- Workflow
  status               santri_status not null default 'pending',
  catatan_admin        text,

  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index santri_status_idx  on santri(status);
create index santri_jenjang_idx on santri(jenjang);
create index santri_kelas_idx   on santri(kelas_id);
create index santri_ortu_idx    on santri(ortu_profile_id);

-- ============================================
-- absensi
-- One row per (santri, tanggal). Unique constraint
-- prevents double-marking.
-- ============================================
create table absensi (
  id          uuid primary key default uuid_generate_v4(),
  santri_id   uuid not null references santri(id) on delete cascade,
  kelas_id    uuid not null references kelas(id) on delete cascade,
  tanggal     date not null,
  status      absen_status not null,
  catatan     text,
  created_by  uuid references profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  unique (santri_id, tanggal)
);

create index absensi_kelas_tanggal_idx on absensi(kelas_id, tanggal);
create index absensi_santri_idx        on absensi(santri_id);

-- ============================================
-- materi
-- Learning materials uploaded by admin/guru.
-- ============================================
create table materi (
  id            uuid primary key default uuid_generate_v4(),
  jenjang       jenjang_type not null,
  judul         text not null,
  deskripsi     text,
  file_url      text,
  uploaded_by   uuid references profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index materi_jenjang_idx on materi(jenjang);

-- ============================================
-- progress_iqro
-- Latest jilid + halaman per santri. Updated by guru.
-- ============================================
create table progress_iqro (
  santri_id    uuid primary key references santri(id) on delete cascade,
  jilid        smallint not null check (jilid between 1 and 6),
  halaman      smallint not null check (halaman between 1 and 60),
  updated_by   uuid references profiles(id) on delete set null,
  updated_at   timestamptz not null default now()
);

-- ============================================
-- progress_hafalan
-- One row per (santri, surat). Tracks last memorized ayat.
-- ============================================
create table progress_hafalan (
  id           uuid primary key default uuid_generate_v4(),
  santri_id    uuid not null references santri(id) on delete cascade,
  surat        text not null,
  ayat_terakhir smallint,
  selesai      boolean not null default false,
  updated_by   uuid references profiles(id) on delete set null,
  updated_at   timestamptz not null default now(),
  unique (santri_id, surat)
);

create index hafalan_santri_idx on progress_hafalan(santri_id);

-- ============================================
-- spp
-- Monthly tuition. One row per (santri, periode YYYY-MM).
-- ============================================
create table spp (
  id          uuid primary key default uuid_generate_v4(),
  santri_id   uuid not null references santri(id) on delete cascade,
  periode     text not null check (periode ~ '^[0-9]{4}-[0-9]{2}$'),
  jumlah      numeric(10, 2) not null,
  status      spp_status not null default 'belum',
  bukti_url   text,
  paid_at     timestamptz,
  catatan     text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (santri_id, periode)
);

create index spp_santri_idx  on spp(santri_id);
create index spp_periode_idx on spp(periode);
create index spp_status_idx  on spp(status);

-- ============================================
-- pengumuman
-- Targeting via (target_jenis, target_id):
--   target_jenis='semua'    → target_id null
--   target_jenis='jenjang'  → target_id is jenjang_type cast as text
--   target_jenis='kelas'    → target_id is kelas.id
--   target_jenis='individu' → target_id is santri.id
-- ============================================
create table pengumuman (
  id            uuid primary key default uuid_generate_v4(),
  target_jenis  pengumuman_target not null default 'semua',
  target_id     text,
  judul         text not null,
  isi           text not null,
  pinned        boolean not null default false,
  created_by    uuid references profiles(id) on delete set null,
  created_at    timestamptz not null default now()
);

create index pengumuman_created_idx on pengumuman(created_at desc);

-- ============================================
-- protect_profile_fields
-- Only an admin may change role or status. Requests without
-- a user (SQL Editor, service role) are allowed so the first
-- admin can be created by hand. is_admin() is defined in the
-- RLS migration; plpgsql resolves it at run time.
-- ============================================
create or replace function protect_profile_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null
     and (new.role is distinct from old.role or new.status is distinct from old.status)
     and not is_admin() then
    raise exception 'Hanya admin yang boleh mengubah peran atau status akun';
  end if;
  return new;
end;
$$;

create trigger profiles_protect_fields
  before update on profiles
  for each row execute function protect_profile_fields();

-- ============================================
-- updated_at triggers
-- ============================================
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare t text;
begin
  for t in select unnest(array[
    'profiles','kelas','santri','materi',
    'progress_iqro','progress_hafalan','spp'
  ])
  loop
    execute format(
      'create trigger %I_set_updated_at before update on %I
       for each row execute function set_updated_at();',
      t, t
    );
  end loop;
end$$;

-- >>>>>>>>>> migrations\20260521000100_rls.sql >>>>>>>>>>

-- ============================================
-- ALIF SMART — Row Level Security policies
-- Roles (see public.profiles.role):
--   admin   — full access
--   guru    — own kelas + own students
--   ortu    — own santri only (wali santri)
--   komite  — aggregate numbers only, via komite_ringkasan()
--   santri  — (V1: not used, reserved)
-- Accounts with status <> 'aktif' get auth_role() = null,
-- so every role-based policy below denies them.
-- anon       — can submit a pending pendaftaran
-- ============================================

-- ---- Helper: read current user's role ----
-- security definer so it can read profiles even when RLS
-- is on. Returns null for unauthenticated requests.
create or replace function auth_role()
returns user_role
language sql
stable
security definer
set search_path = public
as $$
  select role from profiles where id = auth.uid() and status = 'aktif';
$$;

-- ---- Helper: is current user admin? ----
create or replace function is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(auth_role() = 'admin', false);
$$;

-- ---- Helper: kelas IDs taught by current guru ----
create or replace function guru_kelas_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from kelas where guru_profile_id = auth.uid();
$$;

-- ============================================
-- profiles
-- ============================================
alter table profiles enable row level security;

create policy "profiles: self read"
  on profiles for select
  using (id = auth.uid());

create policy "profiles: self update"
  on profiles for update
  using (id = auth.uid())
  with check (id = auth.uid());
-- role/status changes are blocked by the protect_profile_fields trigger.

create policy "profiles: admin all"
  on profiles for all
  using (is_admin())
  with check (is_admin());

-- Guru and ortu can read other profiles' display info
-- (needed to render names next to santri, kelas, etc.).
-- Sensitive fields like phone are still in this table —
-- if that matters later, split into profiles_public view.
create policy "profiles: authenticated read"
  on profiles for select
  to authenticated
  using (auth_role() is not null);

-- ============================================
-- kelas
-- ============================================
alter table kelas enable row level security;

create policy "kelas: authenticated read"
  on kelas for select
  to authenticated
  using (auth_role() is not null);

create policy "kelas: admin all"
  on kelas for all
  using (is_admin())
  with check (is_admin());

create policy "kelas: guru update own"
  on kelas for update
  using (guru_profile_id = auth.uid())
  with check (guru_profile_id = auth.uid());

-- ============================================
-- santri
-- Pendaftaran flow: anon INSERT with status='pending'.
-- Admin sets status='aktif' and ortu_profile_id later.
-- ============================================
alter table santri enable row level security;

create policy "santri: anon insert pending"
  on santri for insert
  to anon, authenticated
  with check (status = 'pending');

create policy "santri: admin all"
  on santri for all
  using (is_admin())
  with check (is_admin());

create policy "santri: guru read own kelas"
  on santri for select
  using (kelas_id in (select guru_kelas_ids()));

create policy "santri: ortu read own"
  on santri for select
  using (ortu_profile_id = auth.uid());

-- ============================================
-- absensi
-- Guru writes for own kelas. Ortu reads for own santri.
-- ============================================
alter table absensi enable row level security;

create policy "absensi: admin all"
  on absensi for all
  using (is_admin())
  with check (is_admin());

create policy "absensi: guru rw own kelas"
  on absensi for all
  using (kelas_id in (select guru_kelas_ids()))
  with check (kelas_id in (select guru_kelas_ids()));

create policy "absensi: ortu read own santri"
  on absensi for select
  using (santri_id in (select id from santri where ortu_profile_id = auth.uid()));

-- ============================================
-- materi
-- All authenticated users can read materi for their
-- jenjang. Admin/guru write.
-- ============================================
alter table materi enable row level security;

create policy "materi: authenticated read"
  on materi for select
  to authenticated
  using (auth_role() is not null);

create policy "materi: admin all"
  on materi for all
  using (is_admin())
  with check (is_admin());

create policy "materi: guru insert + update own"
  on materi for insert
  with check (auth_role() = 'guru' and uploaded_by = auth.uid());

create policy "materi: guru update own"
  on materi for update
  using (auth_role() = 'guru' and uploaded_by = auth.uid())
  with check (uploaded_by = auth.uid());

-- ============================================
-- progress_iqro
-- ============================================
alter table progress_iqro enable row level security;

create policy "iqro: admin all"
  on progress_iqro for all
  using (is_admin())
  with check (is_admin());

create policy "iqro: guru rw own kelas santri"
  on progress_iqro for all
  using (santri_id in (
    select id from santri where kelas_id in (select guru_kelas_ids())
  ))
  with check (santri_id in (
    select id from santri where kelas_id in (select guru_kelas_ids())
  ));

create policy "iqro: ortu read own"
  on progress_iqro for select
  using (santri_id in (select id from santri where ortu_profile_id = auth.uid()));

-- ============================================
-- progress_hafalan
-- ============================================
alter table progress_hafalan enable row level security;

create policy "hafalan: admin all"
  on progress_hafalan for all
  using (is_admin())
  with check (is_admin());

create policy "hafalan: guru rw own kelas santri"
  on progress_hafalan for all
  using (santri_id in (
    select id from santri where kelas_id in (select guru_kelas_ids())
  ))
  with check (santri_id in (
    select id from santri where kelas_id in (select guru_kelas_ids())
  ));

create policy "hafalan: ortu read own"
  on progress_hafalan for select
  using (santri_id in (select id from santri where ortu_profile_id = auth.uid()));

-- ============================================
-- spp
-- Admin manages. Ortu reads own + uploads bukti.
-- ============================================
alter table spp enable row level security;

create policy "spp: admin all"
  on spp for all
  using (is_admin())
  with check (is_admin());

create policy "spp: ortu read own"
  on spp for select
  using (santri_id in (select id from santri where ortu_profile_id = auth.uid()));

create policy "spp: ortu update own bukti"
  on spp for update
  using (santri_id in (select id from santri where ortu_profile_id = auth.uid()))
  with check (
    santri_id in (select id from santri where ortu_profile_id = auth.uid())
    and status in ('belum', 'cicil')
  );

-- ============================================
-- pengumuman
-- All authenticated read. Admin + guru write.
-- ============================================
alter table pengumuman enable row level security;

create policy "pengumuman: authenticated read"
  on pengumuman for select
  to authenticated
  using (auth_role() is not null);

create policy "pengumuman: admin all"
  on pengumuman for all
  using (is_admin())
  with check (is_admin());

create policy "pengumuman: guru insert"
  on pengumuman for insert
  with check (auth_role() = 'guru' and created_by = auth.uid());

create policy "pengumuman: guru update own"
  on pengumuman for update
  using (created_by = auth.uid())
  with check (created_by = auth.uid());

-- ============================================
-- spp guard: wali may only attach a bukti_url.
-- Amount, period and status stay as the admin set them.
-- ============================================
create or replace function protect_spp_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and not is_admin() then
    if new.jumlah is distinct from old.jumlah
       or new.periode is distinct from old.periode
       or new.status is distinct from old.status
       or new.santri_id is distinct from old.santri_id
       or new.paid_at is distinct from old.paid_at then
      raise exception 'Wali hanya boleh mengunggah bukti pembayaran';
    end if;
  end if;
  return new;
end;
$$;

create trigger spp_protect_fields
  before update on spp
  for each row execute function protect_spp_fields();

-- ============================================
-- komite_ringkasan()
-- Komite sees totals only, never names or per-family data.
-- security definer reads past RLS; the role check inside
-- is the gate.
-- ============================================
create or replace function komite_ringkasan()
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  bulan_ini text := to_char(now(), 'YYYY-MM');
  hasil json;
begin
  if auth_role() is null or auth_role() not in ('komite', 'admin') then
    raise exception 'Akses hanya untuk komite dan admin';
  end if;

  select json_build_object(
    'periode', bulan_ini,
    'santri_aktif', (select count(*) from santri where status = 'aktif'),
    'pendaftar_baru', (select count(*) from santri where status = 'pending'),
    'guru', (select count(*) from profiles where role = 'guru' and status = 'aktif'),
    'per_jenjang', (
      select coalesce(json_object_agg(jenjang, n), '{}'::json)
      from (select jenjang, count(*) n from santri where status = 'aktif' group by jenjang) j
    ),
    'kehadiran_bulan_ini', (
      select case when count(*) = 0 then null
             else round(100.0 * count(*) filter (where status = 'hadir') / count(*)) end
      from absensi where to_char(tanggal, 'YYYY-MM') = bulan_ini
    ),
    'spp_bulanan', (
      select coalesce(json_agg(row_to_json(x) order by x.periode), '[]'::json)
      from (
        select periode,
               count(*) as tagihan,
               count(*) filter (where status = 'lunas') as lunas,
               round(100.0 * count(*) filter (where status = 'lunas') / count(*)) as persen
        from spp
        where periode >= to_char(now() - interval '5 months', 'YYYY-MM')
        group by periode
      ) x
    )
  ) into hasil;

  return hasil;
end;
$$;

revoke all on function komite_ringkasan() from public, anon;
grant execute on function komite_ringkasan() to authenticated;

-- >>>>>>>>>> migrations\20260521000200_storage.sql >>>>>>>>>>

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

-- =====================================================================
-- SELESAI. Langkah berikut: jadikan akun Anda admin.
-- Masuk sekali lewat login.html (Google), lalu jalankan:
--
--   update profiles set role = 'admin', status = 'aktif'
--   where email = 'EMAIL-GOOGLE-ANDA@gmail.com';
-- =====================================================================
