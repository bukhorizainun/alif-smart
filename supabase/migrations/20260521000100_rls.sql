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
