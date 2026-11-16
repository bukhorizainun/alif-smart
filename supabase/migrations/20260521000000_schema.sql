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
