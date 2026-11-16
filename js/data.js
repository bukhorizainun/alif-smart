/* ============================================
   ALIF SMART — Data layer
   createLiveApi()  → Supabase (RLS decides what each role sees)
   createDemoApi()  → in-memory sample data, same method shapes
   The dashboard only talks to these methods.
   ============================================ */

import { supabase } from './supabase-client.js';

// ---------- date helpers (local time, not UTC) ----------
export function todayISO(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}
export function periodeNow(d = new Date()) {
  return todayISO(d).slice(0, 7);
}
function monthRange(periode) {
  const [y, m] = periode.split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  return [periode + '-01', periode + '-' + String(last).padStart(2, '0')];
}

function must({ data, error }) {
  if (error) throw error;
  return data;
}

// =====================================================
// LIVE (Supabase)
// =====================================================
export function createLiveApi(uid) {
  const db = supabase;

  return {
    mode: 'live',

    // ----- admin -----
    async adminStats() {
      const count = async (table, filters) => {
        let q = db.from(table).select('*', { count: 'exact', head: true });
        for (const [k, v] of Object.entries(filters)) {
          q = v === 'NOT_NULL' ? q.not(k, 'is', null) : q.eq(k, v);
        }
        const { count: n, error } = await q;
        if (error) throw error;
        return n ?? 0;
      };
      const [santri, guru, akses, daftar, bukti] = await Promise.all([
        count('santri', { status: 'aktif' }),
        count('profiles', { role: 'guru', status: 'aktif' }),
        count('profiles', { status: 'menunggu' }),
        count('santri', { status: 'pending' }),
        db.from('spp').select('id', { count: 'exact', head: true })
          .neq('status', 'lunas').not('bukti_url', 'is', null)
          .then(({ count: n, error }) => { if (error) throw error; return n ?? 0; }),
      ]);
      return { santri, guru, akses, daftar, bukti };
    },
    async listPendingAccounts() {
      return must(await db.from('profiles')
        .select('id, full_name, email, avatar_url, created_at')
        .eq('status', 'menunggu').order('created_at'));
    },
    async listSantri() {
      return must(await db.from('santri')
        .select('id, nama_lengkap, panggilan, jenjang, status, email_ortu, hp_ortu, nama_ayah, nama_ibu, tanggal_lahir, alamat, ortu_profile_id, kelas_id, created_at')
        .order('nama_lengkap'));
    },
    async approveAccount(id, role, santriIds = []) {
      must(await db.from('profiles').update({ role, status: 'aktif' }).eq('id', id).select('id'));
      if (role === 'ortu' && santriIds.length) {
        must(await db.from('santri').update({ ortu_profile_id: id }).in('id', santriIds).select('id'));
      }
    },
    async rejectAccount(id) {
      must(await db.from('profiles').update({ status: 'ditolak' }).eq('id', id).select('id'));
    },
    async approveSantri(id, kelasId) {
      must(await db.from('santri').update({ status: 'aktif', kelas_id: kelasId || null }).eq('id', id).select('id'));
    },
    async rejectSantri(id) {
      must(await db.from('santri').update({ status: 'nonaktif' }).eq('id', id).select('id'));
    },
    async listKelas() {
      return must(await db.from('kelas')
        .select('id, nama, jenjang, jadwal_text, guru_profile_id, guru:guru_profile_id(full_name)')
        .order('jenjang').order('nama'));
    },
    async listGuru() {
      return must(await db.from('profiles').select('id, full_name, email')
        .eq('role', 'guru').eq('status', 'aktif').order('full_name'));
    },
    async createKelas(row) {
      must(await db.from('kelas').insert(row).select('id'));
    },
    async listSppVerifikasi() {
      const rows = must(await db.from('spp')
        .select('id, periode, jumlah, status, bukti_url, santri:santri_id(nama_lengkap)')
        .neq('status', 'lunas').not('bukti_url', 'is', null).order('periode'));
      for (const r of rows) {
        const { data } = await db.storage.from('bukti-spp').createSignedUrl(r.bukti_url, 600);
        r.bukti_link = data ? data.signedUrl : null;
      }
      return rows;
    },
    async markLunas(id) {
      must(await db.from('spp').update({ status: 'lunas', paid_at: new Date().toISOString() }).eq('id', id).select('id'));
    },
    async createTagihan(periode, jumlah) {
      const santri = must(await db.from('santri').select('id').eq('status', 'aktif'));
      if (!santri.length) return 0;
      const rows = santri.map((s) => ({ santri_id: s.id, periode, jumlah }));
      must(await db.from('spp').upsert(rows, { onConflict: 'santri_id,periode', ignoreDuplicates: true }));
      return rows.length;
    },

    // ----- shared -----
    async listPengumuman() {
      return must(await db.from('pengumuman')
        .select('id, judul, isi, pinned, created_at, penulis:created_by(full_name)')
        .order('pinned', { ascending: false }).order('created_at', { ascending: false }).limit(20));
    },
    async postPengumuman(judul, isi) {
      must(await db.from('pengumuman').insert({ judul, isi, target_jenis: 'semua', created_by: uid }).select('id'));
    },

    // ----- guru -----
    async myKelas() {
      return must(await db.from('kelas').select('id, nama, jenjang, jadwal_text')
        .eq('guru_profile_id', uid).order('nama'));
    },
    async santriByKelas(kelasId) {
      return must(await db.from('santri').select('id, nama_lengkap, panggilan')
        .eq('kelas_id', kelasId).eq('status', 'aktif').order('nama_lengkap'));
    },
    async absensiFor(kelasId, tanggal) {
      const rows = must(await db.from('absensi').select('santri_id, status')
        .eq('kelas_id', kelasId).eq('tanggal', tanggal));
      return Object.fromEntries(rows.map((r) => [r.santri_id, r.status]));
    },
    async saveAbsensi(kelasId, tanggal, map) {
      const rows = Object.entries(map).map(([santri_id, status]) => ({
        santri_id, kelas_id: kelasId, tanggal, status, created_by: uid,
      }));
      must(await db.from('absensi').upsert(rows, { onConflict: 'santri_id,tanggal' }));
    },
    async iqroFor(santriIds) {
      if (!santriIds.length) return {};
      const rows = must(await db.from('progress_iqro').select('santri_id, jilid, halaman, updated_at')
        .in('santri_id', santriIds));
      return Object.fromEntries(rows.map((r) => [r.santri_id, r]));
    },
    async saveIqro(santriId, jilid, halaman) {
      must(await db.from('progress_iqro').upsert({
        santri_id: santriId, jilid, halaman, updated_by: uid, updated_at: new Date().toISOString(),
      }));
    },

    async hafalanFor(santriIds) {
      if (!santriIds.length) return {};
      const rows = must(await db.from('progress_hafalan').select('santri_id, surat, ayat_terakhir, selesai, updated_at')
        .in('santri_id', santriIds).order('updated_at', { ascending: false }));
      const out = {};
      rows.forEach((r) => { (out[r.santri_id] = out[r.santri_id] || []).push(r); });
      return out;
    },
    async saveHafalan(santriId, surat, ayat, selesai) {
      must(await db.from('progress_hafalan').upsert({
        santri_id: santriId, surat, ayat_terakhir: ayat, selesai, updated_by: uid, updated_at: new Date().toISOString(),
      }, { onConflict: 'santri_id,surat' }));
    },

    // ----- wali -----
    async myChildren() {
      return must(await db.from('santri')
        .select('id, nama_lengkap, panggilan, jenjang, kelas:kelas_id(nama, guru:guru_profile_id(full_name))')
        .eq('ortu_profile_id', uid).order('nama_lengkap'));
    },
    async childDetail(santriId) {
      const periode = periodeNow();
      const [from, to] = monthRange(periode);
      const [iqro, hafalan, absensi, spp] = await Promise.all([
        db.from('progress_iqro').select('jilid, halaman, updated_at').eq('santri_id', santriId).maybeSingle().then(must),
        db.from('progress_hafalan').select('surat, ayat_terakhir, selesai, updated_at').eq('santri_id', santriId).order('updated_at', { ascending: false }).then(must),
        db.from('absensi').select('tanggal, status').eq('santri_id', santriId).gte('tanggal', from).lte('tanggal', to).order('tanggal').then(must),
        db.from('spp').select('id, periode, jumlah, status, bukti_url, paid_at').eq('santri_id', santriId).order('periode', { ascending: false }).limit(6).then(must),
      ]);
      return { iqro, hafalan, absensi, spp };
    },
    async uploadBukti(sppId, file) {
      const safe = file.name.replace(/[^a-z0-9._-]/gi, '_').slice(-60);
      const path = uid + '/' + sppId + '-' + Date.now() + '-' + safe;
      must(await db.storage.from('bukti-spp').upload(path, file, { upsert: false }));
      must(await db.from('spp').update({ bukti_url: path }).eq('id', sppId).select('id'));
    },

    // ----- komite -----
    async ringkasan() {
      return must(await db.rpc('komite_ringkasan'));
    },
  };
}

// =====================================================
// DEMO (in memory)
// =====================================================
export function createDemoApi() {
  const id = (() => { let n = 0; return (p) => p + '-' + (++n); })();
  const P = periodeNow();
  const prevPeriode = (k) => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - k); return periodeNow(d); };

  const profiles = [
    { id: 'u-guru', full_name: 'Ustadzah Fatimah', email: 'fatimah@contoh.id', role: 'guru', status: 'aktif' },
    { id: 'u-guru2', full_name: 'Ustadz Hamzah', email: 'hamzah@contoh.id', role: 'guru', status: 'aktif' },
    { id: 'u-wali', full_name: 'Siti Rahmawati', email: 'siti.rahma@contoh.id', role: 'ortu', status: 'aktif' },
    { id: 'u-komite', full_name: 'Bapak Darmawan', email: 'darmawan@contoh.id', role: 'komite', status: 'aktif' },
    { id: 'u-p1', full_name: 'Nur Aini', email: 'nuraini.ibu@contoh.id', role: 'ortu', status: 'menunggu', created_at: new Date(Date.now() - 2 * 3600e3).toISOString() },
    { id: 'u-p2', full_name: 'Ustadzah Hafsah', email: 'hafsah.ustadzah@contoh.id', role: 'ortu', status: 'menunggu', created_at: new Date(Date.now() - 26 * 3600e3).toISOString() },
  ];
  const kelas = [
    { id: 'k-tpqb', nama: 'TPQ B', jenjang: 'TPQ', jadwal_text: 'Senin–Kamis 15.30', guru_profile_id: 'u-guru' },
    { id: 'k-tkq', nama: 'TKQ A', jenjang: 'TKQ', jadwal_text: 'Senin–Jumat 08.00', guru_profile_id: 'u-guru2' },
    { id: 'k-mdta', nama: 'MDTA 1', jenjang: 'MDTA', jadwal_text: 'Selasa–Jumat 14.00', guru_profile_id: 'u-guru2' },
  ];
  const nama = ['Aisyah Nur', 'Ahmad Zaki', 'Bilqis Azzahra', 'Rafi Akbar', 'Hana Salsabila', 'Fikri Ramadhan', 'Nayla Putri', 'Umar Faruq', 'Zahra Aulia'];
  const santri = nama.map((n, i) => ({
    id: 's-' + i, nama_lengkap: n, jenjang: 'TPQ', status: 'aktif', kelas_id: 'k-tpqb',
    ortu_profile_id: i === 0 ? 'u-wali' : null, email_ortu: i === 0 ? 'siti.rahma@contoh.id' : null,
  }));
  santri.push({ id: 's-yusuf', nama_lengkap: 'Yusuf Hakim', jenjang: 'TKQ', status: 'aktif', kelas_id: 'k-tkq', ortu_profile_id: 'u-wali' });
  santri.push({ id: 's-new1', nama_lengkap: 'Khadijah Amalia', panggilan: 'Dija', jenjang: 'TPQ', status: 'pending', email_ortu: 'nuraini.ibu@contoh.id', nama_ibu: 'Nur Aini', hp_ortu: '0812xxxx', tanggal_lahir: '2019-03-12', created_at: new Date().toISOString() });
  santri.push({ id: 's-new2', nama_lengkap: 'Salman Alfarizi', jenjang: 'MDTA', status: 'pending', nama_ayah: 'Hendra', hp_ortu: '0857xxxx', tanggal_lahir: '2016-08-02', created_at: new Date().toISOString() });

  const absensi = []; // {santri_id, kelas_id, tanggal, status}
  const t = new Date();
  for (let k = 1; k <= 10; k++) {
    const d = new Date(t); d.setDate(t.getDate() - k);
    if (d.getMonth() !== t.getMonth()) break;
    santri.filter((s) => s.status === 'aktif').forEach((s, i) => {
      const st = (i + k) % 11 === 0 ? 'izin' : (i * k) % 17 === 3 ? 'alpa' : 'hadir';
      absensi.push({ santri_id: s.id, kelas_id: s.kelas_id, tanggal: todayISO(d), status: st });
    });
  }
  const iqro = { 's-0': { jilid: 3, halaman: 24, updated_at: new Date(Date.now() - 86400e3).toISOString() }, 's-1': { jilid: 2, halaman: 40 }, 's-3': { jilid: 3, halaman: 5 }, 's-yusuf': { jilid: 1, halaman: 18 } };
  const hafalan = { 's-0': [{ surat: 'Al-Fajr', ayat_terakhir: 14, selesai: false }, ...['An-Nas', 'Al-Falaq', 'Al-Ikhlas', 'Al-Lahab', 'An-Nasr', 'Al-Kafirun', 'Al-Kautsar', 'Al-Ma’un', 'Quraisy', 'Al-Fil', 'Al-Humazah', 'Al-‘Asr'].map((s) => ({ surat: s, selesai: true }))] };
  const spp = [];
  santri.filter((s) => s.status === 'aktif').forEach((s, i) => {
    for (let k = 5; k >= 0; k--) {
      const per = prevPeriode(k);
      const lunas = k > 0 ? (i + k) % 7 !== 0 : i % 3 === 0;
      spp.push({ id: id('spp'), santri_id: s.id, periode: per, jumlah: 50000, status: lunas ? 'lunas' : 'belum', bukti_url: null });
    }
  });
  const sppNow = spp.find((r) => r.santri_id === 's-3' && r.periode === P);
  if (sppNow) { sppNow.bukti_url = 'demo.jpg'; sppNow.status = 'belum'; }
  const pengumuman = [
    { id: 'p1', judul: 'Wisuda Iqro semester ini', isi: 'Santri yang sudah selesai Iqro 6 akan diwisuda bersama. Jadwal menyusul.', pinned: true, created_at: new Date(Date.now() - 2 * 86400e3).toISOString(), penulis: { full_name: 'Pengurus LPQ' } },
    { id: 'p2', judul: 'Libur Maulid', isi: 'Kegiatan belajar libur satu hari. Masuk kembali seperti biasa esok harinya.', pinned: false, created_at: new Date(Date.now() - 9 * 86400e3).toISOString(), penulis: { full_name: 'Ustadzah Fatimah' } },
  ];

  const byId = (arr, x) => arr.find((r) => r.id === x);
  const wait = (v) => new Promise((r) => setTimeout(() => r(v), 120));
  let me = 'u-guru';

  return {
    mode: 'demo',
    setUser(uid) { me = uid; },

    async adminStats() {
      return wait({
        santri: santri.filter((s) => s.status === 'aktif').length,
        guru: profiles.filter((p) => p.role === 'guru' && p.status === 'aktif').length,
        akses: profiles.filter((p) => p.status === 'menunggu').length,
        daftar: santri.filter((s) => s.status === 'pending').length,
        bukti: spp.filter((r) => r.status !== 'lunas' && r.bukti_url).length,
      });
    },
    async listPendingAccounts() { return wait(profiles.filter((p) => p.status === 'menunggu')); },
    async listSantri() { return wait(santri.slice().sort((a, b) => a.nama_lengkap.localeCompare(b.nama_lengkap))); },
    async approveAccount(pid, role, santriIds = []) {
      Object.assign(byId(profiles, pid), { role, status: 'aktif' });
      if (role === 'ortu') santriIds.forEach((s) => { byId(santri, s).ortu_profile_id = pid; });
      return wait();
    },
    async rejectAccount(pid) { byId(profiles, pid).status = 'ditolak'; return wait(); },
    async approveSantri(sid, kelasId) { Object.assign(byId(santri, sid), { status: 'aktif', kelas_id: kelasId || null }); return wait(); },
    async rejectSantri(sid) { byId(santri, sid).status = 'nonaktif'; return wait(); },
    async listKelas() {
      return wait(kelas.map((k) => ({ ...k, guru: byId(profiles, k.guru_profile_id) || null })));
    },
    async listGuru() { return wait(profiles.filter((p) => p.role === 'guru' && p.status === 'aktif')); },
    async createKelas(row) { kelas.push({ id: id('k'), ...row }); return wait(); },
    async listSppVerifikasi() {
      return wait(spp.filter((r) => r.status !== 'lunas' && r.bukti_url)
        .map((r) => ({ ...r, santri: byId(santri, r.santri_id), bukti_link: null })));
    },
    async markLunas(sid) { Object.assign(byId(spp, sid), { status: 'lunas', paid_at: new Date().toISOString() }); return wait(); },
    async createTagihan(periode, jumlah) {
      let n = 0;
      santri.filter((s) => s.status === 'aktif').forEach((s) => {
        if (!spp.some((r) => r.santri_id === s.id && r.periode === periode)) {
          spp.push({ id: id('spp'), santri_id: s.id, periode, jumlah, status: 'belum' }); n++;
        }
      });
      return wait(n);
    },

    async listPengumuman() { return wait(pengumuman.slice().sort((a, b) => (b.pinned - a.pinned) || b.created_at.localeCompare(a.created_at))); },
    async postPengumuman(judul, isi) {
      pengumuman.push({ id: id('p'), judul, isi, pinned: false, created_at: new Date().toISOString(), penulis: byId(profiles, me) });
      return wait();
    },

    async myKelas() { return wait(kelas.filter((k) => k.guru_profile_id === me)); },
    async santriByKelas(kid) { return wait(santri.filter((s) => s.kelas_id === kid && s.status === 'aktif')); },
    async absensiFor(kid, tgl) {
      return wait(Object.fromEntries(absensi.filter((a) => a.kelas_id === kid && a.tanggal === tgl).map((a) => [a.santri_id, a.status])));
    },
    async saveAbsensi(kid, tgl, map) {
      for (const [sid, st] of Object.entries(map)) {
        const row = absensi.find((a) => a.santri_id === sid && a.tanggal === tgl);
        if (row) row.status = st; else absensi.push({ santri_id: sid, kelas_id: kid, tanggal: tgl, status: st });
      }
      return wait();
    },
    async iqroFor(ids) { return wait(Object.fromEntries(ids.filter((i) => iqro[i]).map((i) => [i, { santri_id: i, ...iqro[i] }]))); },
    async saveIqro(sid, jilid, halaman) { iqro[sid] = { jilid, halaman, updated_at: new Date().toISOString() }; return wait(); },

    async hafalanFor(ids) { return wait(Object.fromEntries(ids.filter((i) => hafalan[i]).map((i) => [i, hafalan[i]]))); },
    async saveHafalan(sid, surat, ayat, selesai) {
      const list = (hafalan[sid] = hafalan[sid] || []);
      const row = list.find((h) => h.surat === surat);
      const val = { surat, ayat_terakhir: ayat, selesai, updated_at: new Date().toISOString() };
      if (row) Object.assign(row, val); else list.unshift(val);
      list.sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''));
      return wait();
    },

    async myChildren() {
      return wait(santri.filter((s) => s.ortu_profile_id === me && s.status === 'aktif').map((s) => {
        const k = byId(kelas, s.kelas_id);
        return { ...s, kelas: k ? { nama: k.nama, guru: byId(profiles, k.guru_profile_id) } : null };
      }));
    },
    async childDetail(sid) {
      const [from, to] = monthRange(P);
      return wait({
        iqro: iqro[sid] || null,
        hafalan: hafalan[sid] || [],
        absensi: absensi.filter((a) => a.santri_id === sid && a.tanggal >= from && a.tanggal <= to).sort((a, b) => a.tanggal.localeCompare(b.tanggal)),
        spp: spp.filter((r) => r.santri_id === sid).sort((a, b) => b.periode.localeCompare(a.periode)),
      });
    },
    async uploadBukti(sid) { byId(spp, sid).bukti_url = 'demo-upload.jpg'; return wait(); },

    async ringkasan() {
      const aktif = santri.filter((s) => s.status === 'aktif');
      const per = {};
      aktif.forEach((s) => { per[s.jenjang] = (per[s.jenjang] || 0) + 1; });
      const bulan = absensi.filter((a) => a.tanggal.startsWith(P));
      const pers = {};
      spp.forEach((r) => { (pers[r.periode] = pers[r.periode] || { periode: r.periode, tagihan: 0, lunas: 0 }); pers[r.periode].tagihan++; if (r.status === 'lunas') pers[r.periode].lunas++; });
      return wait({
        periode: P,
        santri_aktif: aktif.length,
        pendaftar_baru: santri.filter((s) => s.status === 'pending').length,
        guru: profiles.filter((p) => p.role === 'guru' && p.status === 'aktif').length,
        per_jenjang: per,
        kehadiran_bulan_ini: bulan.length ? Math.round(100 * bulan.filter((a) => a.status === 'hadir').length / bulan.length) : null,
        spp_bulanan: Object.values(pers).sort((a, b) => a.periode.localeCompare(b.periode))
          .map((x) => ({ ...x, persen: Math.round(100 * x.lunas / x.tagihan) })),
      });
    },
  };
}

export const DEMO_USERS = {
  admin: { id: 'u-admin', full_name: 'Ustadz Ahmad', role: 'admin', status: 'aktif', email: 'admin@contoh.id' },
  guru: { id: 'u-guru', full_name: 'Ustadzah Fatimah', role: 'guru', status: 'aktif', email: 'fatimah@contoh.id' },
  ortu: { id: 'u-wali', full_name: 'Siti Rahmawati', role: 'ortu', status: 'aktif', email: 'siti.rahma@contoh.id' },
  komite: { id: 'u-komite', full_name: 'Bapak Darmawan', role: 'komite', status: 'aktif', email: 'darmawan@contoh.id' },
  menunggu: { id: 'u-p1', full_name: 'Nur Aini', role: 'ortu', status: 'menunggu', email: 'nuraini.ibu@contoh.id' },
};
