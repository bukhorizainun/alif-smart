/* ============================================
   ALIF SMART — Dashboard (role-aware app)
   Roles: admin, guru, ortu (wali santri), komite.
   Status gate: profiles.status must be 'aktif'.
   ?demo in the URL → in-memory demo with role switcher.
   ============================================ */

import { hasSupabase } from './supabase-client.js';
import { getCurrentUser, signOut } from './auth.js';
import { createLiveApi, createDemoApi, DEMO_USERS, todayISO, periodeNow } from './data.js';

// ---------- tiny helpers ----------
const $ = (sel, root = document) => root.querySelector(sel);
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const rupiah = (n) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(n) || 0);
const tglPanjang = (d = new Date()) => d.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long' });
const bulanNama = (per) => { const [y, m] = per.split('-').map(Number); return new Date(y, m - 1, 1).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' }); };
const bulanPendek = (per) => { const [y, m] = per.split('-').map(Number); return new Date(y, m - 1, 1).toLocaleDateString('id-ID', { month: 'short' }); };
const initials = (name) => (name || '?').trim().split(/\s+/).filter((w) => !/^(ustadz|ustadzah|bapak|ibu)$/i.test(w)).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';
const relatif = (iso) => {
  if (!iso) return '';
  const h = Math.round((Date.now() - new Date(iso).getTime()) / 3600e3);
  if (h < 1) return 'baru saja';
  if (h < 24) return h + ' jam lalu';
  const d = Math.round(h / 24);
  return d === 1 ? 'kemarin' : d + ' hari lalu';
};

const ROLE_LABEL = { admin: 'Admin', guru: 'Guru', ortu: 'Wali santri', komite: 'Komite' };
const ABSEN = {
  hadir: { k: 'H', label: 'Hadir' },
  izin: { k: 'I', label: 'Izin' },
  sakit: { k: 'S', label: 'Sakit' },
  alpa: { k: 'A', label: 'Alpa' },
};

// Juz 30 + Al-Fatihah with ayat counts (Hafs). Other surahs can be typed freely.
const SURAH = [['Al-Fatihah', 7], ['An-Naba’', 40], ['An-Nazi‘at', 46], ['‘Abasa', 42], ['At-Takwir', 29], ['Al-Infitar', 19],
  ['Al-Mutaffifin', 36], ['Al-Insyiqaq', 25], ['Al-Buruj', 22], ['At-Tariq', 17], ['Al-A‘la', 19], ['Al-Gasyiyah', 26],
  ['Al-Fajr', 30], ['Al-Balad', 20], ['Asy-Syams', 15], ['Al-Lail', 21], ['Ad-Duha', 11], ['Asy-Syarh', 8], ['At-Tin', 8],
  ['Al-‘Alaq', 19], ['Al-Qadr', 5], ['Al-Bayyinah', 8], ['Az-Zalzalah', 8], ['Al-‘Adiyat', 11], ['Al-Qari‘ah', 11],
  ['At-Takasur', 8], ['Al-‘Asr', 3], ['Al-Humazah', 9], ['Al-Fil', 5], ['Quraisy', 4], ['Al-Ma‘un', 7], ['Al-Kausar', 3],
  ['Al-Kafirun', 6], ['An-Nasr', 3], ['Al-Lahab', 5], ['Al-Ikhlas', 4], ['Al-Falaq', 5], ['An-Nas', 6]];
const SURAH_AYAT = Object.fromEntries(SURAH);

const I = {
  home: '<path d="M3 11l9-7 9 7v9a1 1 0 01-1 1h-5v-6H9v6H4a1 1 0 01-1-1z"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M17 6l3 3M15 8l2 2"/>',
  users: '<circle cx="9" cy="8" r="3"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><path d="M16 4.5a3 3 0 010 7M21 20c0-2.6-1.6-4.8-4-5.6"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  card: '<rect x="2" y="6" width="20" height="13" rx="2"/><path d="M2 10h20M6 15h4"/>',
  check: '<rect x="4" y="4" width="16" height="17" rx="2"/><path d="M9 3v3M15 3v3M8 13l3 3 5-6"/>',
  book: '<path d="M2 5h7a3 3 0 013 3v12a2 2 0 00-2-2H2z"/><path d="M22 5h-7a3 3 0 00-3 3v12a2 2 0 012-2h8z"/>',
  mega: '<path d="M3 11l15-6v14L3 13z"/><path d="M7 13v5a2 2 0 004 0v-4"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M21 20H3"/>',
  logout: '<path d="M15 4h4a1 1 0 011 1v14a1 1 0 01-1 1h-4"/><path d="M10 16l-4-4 4-4M6 12h10"/>',
  star: '<path d="M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.5 6.7 19.4l1.2-6L3.4 9.3l6-.7z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  upload: '<path d="M12 16V4M7 9l5-5 5 5M4 20h16"/>',
  print: '<path d="M6 9V3h12v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M7 14h10v7H7z"/>',
  eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
};
const icon = (name, size = 22) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${I[name]}</svg>`;

const TABS = {
  admin: [['beranda', 'Beranda', 'home'], ['akses', 'Akses', 'key'], ['santri', 'Santri', 'users'], ['kelas', 'Kelas', 'grid'], ['spp', 'SPP', 'card']],
  guru: [['beranda', 'Beranda', 'home'], ['absensi', 'Absensi', 'check'], ['iqro', 'Progres', 'book'], ['info', 'Pengumuman', 'mega']],
  ortu: [['beranda', 'Beranda', 'home'], ['spp', 'SPP', 'card'], ['info', 'Info', 'mega']],
  komite: [['laporan', 'Laporan', 'chart'], ['info', 'Info', 'mega']],
};

// ---------- app state ----------
const S = {
  demo: false,
  api: null,
  user: null,         // profile row
  tab: null,
  guru: { kelasId: null, tanggal: todayISO(), sheet: null },
  wali: { childId: null },
};

const root = $('#app');
const toastEl = $('#toast');
let toastTimer;
function toast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2600);
}
function errText(err) {
  const m = (err && (err.message || err.details)) || String(err);
  if (/relation .* does not exist|schema cache|Could not find the table/i.test(m)) {
    return 'Tabel database belum ada. Jalankan supabase/SETUP_LENGKAP.sql di SQL Editor Supabase.';
  }
  if (/row-level security|permission denied/i.test(m)) return 'Akses ditolak oleh aturan keamanan database.';
  return m;
}

// =====================================================
// Shell
// =====================================================
function renderShell() {
  const u = S.user;
  const role = u.role;
  const tabs = u.status === 'aktif' ? TABS[role] || [] : [];
  if (!S.tab || !tabs.some((t) => t[0] === S.tab)) S.tab = tabs.length ? tabs[0][0] : null;

  const avatar = u.avatar_url
    ? `<img src="${esc(u.avatar_url)}" alt="" class="avatar xs" referrerpolicy="no-referrer">`
    : `<span class="avatar xs" aria-hidden="true">${esc(initials(u.full_name))}</span>`;

  const demoBar = S.demo ? `
    <div class="demo-bar" role="group" aria-label="Pilih peran contoh">
      <span class="demo-tag">Contoh</span>
      ${Object.entries(DEMO_USERS).map(([k, d]) => `
        <button type="button" class="chip ${d.id === u.id ? 'on' : ''}" data-act="demo-role" data-role="${k}" aria-pressed="${d.id === u.id}">
          ${esc(k === 'menunggu' ? 'Akun baru' : ROLE_LABEL[d.role])}</button>`).join('')}
    </div>` : '';

  root.innerHTML = `
    ${demoBar}
    <header class="topbar">
      <img src="assets/img/logo-emblem.png" alt="LPQ Alif Lam Mim" class="brand-mark" width="46" height="46">
      <div class="topbar-who">
        <p class="muted small">${esc(tglPanjang())}</p>
        <h1>${esc(u.full_name || u.email)}</h1>
      </div>
      ${u.status === 'aktif' ? `<span class="role-pill">${esc(ROLE_LABEL[role] || role)}</span>` : ''}
      <span class="topbar-avatar">${avatar}</span>
      <button type="button" class="icon-btn" data-act="logout" aria-label="Keluar">${icon('logout', 20)}</button>
    </header>
    <main id="view" class="view" tabindex="-1"></main>
    ${tabs.length > 1 ? `
    <nav class="bottom-nav" aria-label="Menu ${esc(ROLE_LABEL[role])}" style="--n:${tabs.length}">
      ${tabs.map(([k, label, ic]) => `
        <a href="#${k}" data-act="tab" data-tab="${k}" ${k === S.tab ? 'aria-current="page"' : ''}>${icon(ic)}<span>${esc(label)}</span></a>`).join('')}
    </nav>` : ''}
  `;
  renderView();
}

async function renderView() {
  const view = $('#view');
  view.innerHTML = '<div class="skeleton"></div><div class="skeleton short"></div>';
  try {
    let html;
    if (S.user.status === 'menunggu') html = viewMenunggu();
    else if (S.user.status === 'ditolak') html = viewDitolak();
    else {
      const fn = VIEWS[S.user.role] && VIEWS[S.user.role][S.tab];
      html = fn ? await fn() : card('<p>Peran ini belum punya tampilan.</p>');
    }
    view.innerHTML = html;
    afterRender(view);
  } catch (err) {
    console.error(err);
    view.innerHTML = `<div class="alert show error">${esc(errText(err))}</div>`;
  }
}

function switchTab(tab) {
  S.tab = tab;
  history.replaceState(null, '', (S.demo ? '?demo' : location.pathname.replace(/^.*\//, '')) + '#' + tab);
  document.querySelectorAll('.bottom-nav a').forEach((a) => {
    if (a.dataset.tab === tab) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  window.scrollTo({ top: 0 });
  renderView();
}

const card = (inner, cls = '') => `<section class="card ${cls}">${inner}</section>`;
const empty = (text) => `<div class="empty">${esc(text)}</div>`;
const stat = (label, value, tone = '', act = '') => `
  <${act ? `button type="button" data-act="tab" data-tab="${act}"` : 'div'} class="stat ${tone}">
    <span class="stat-label">${esc(label)}</span>
    <span class="stat-value">${esc(value ?? '–')}</span>
  </${act ? 'button' : 'div'}>`;

// =====================================================
// Status gates
// =====================================================
function viewMenunggu() {
  return card(`
    <div class="gate">
      <span class="gate-icon">${icon('clock', 30)}</span>
      <h2>Akun menunggu persetujuan</h2>
      <p class="muted">Terima kasih sudah masuk. Admin LPQ akan memeriksa akun <b>${esc(S.user.email)}</b>, lalu memberi peran sebagai guru, wali santri atau komite.</p>
      <p class="muted small">Wali santri: pakai email yang sama dengan formulir pendaftaran agar admin mudah mencocokkan.</p>
      <button type="button" class="btn-primary btn-block" data-act="reload">Periksa lagi</button>
    </div>`);
}
function viewDitolak() {
  return card(`
    <div class="gate">
      <h2>Akses belum bisa diberikan</h2>
      <p class="muted">Akun ${esc(S.user.email)} tidak terdaftar sebagai guru, wali santri atau komite. Jika ini keliru, hubungi admin LPQ.</p>
    </div>`);
}

// =====================================================
// ADMIN
// =====================================================
const admin = {
  async beranda() {
    const [st, info] = await Promise.all([S.api.adminStats(), S.api.listPengumuman()]);
    return `
      <div class="stats">
        ${stat('Santri aktif', st.santri)}
        ${stat('Guru', st.guru)}
        ${stat('Permintaan akses', st.akses, st.akses ? 'warn' : '', 'akses')}
        ${stat('Pendaftaran baru', st.daftar, st.daftar ? 'warn' : '', 'santri')}
      </div>
      ${st.bukti ? `<button type="button" class="banner" data-act="tab" data-tab="spp">${icon('card', 20)}<span><b>${st.bukti}</b> bukti SPP menunggu diperiksa</span></button>` : ''}
      ${formPengumuman()}
      ${listPengumuman(info.slice(0, 3))}`;
  },

  async akses() {
    const [list, santri] = await Promise.all([S.api.listPendingAccounts(), S.api.listSantri()]);
    if (!list.length) return card(empty('Tidak ada permintaan akses baru.'));
    const pilihan = santri.filter((s) => s.status === 'aktif' || s.status === 'pending');
    return `<h2 class="section-title">Permintaan akses <span class="count">${list.length}</span></h2>` + list.map((p) => {
      const cocok = pilihan.filter((s) => s.email_ortu && p.email && s.email_ortu.toLowerCase() === p.email.toLowerCase());
      const saran = cocok.length ? 'ortu' : (/ustadz|ustadzah/i.test(p.full_name) ? 'guru' : 'ortu');
      return card(`
        <div class="person">
          <span class="avatar sm">${esc(initials(p.full_name))}</span>
          <div class="grow"><p class="strong">${esc(p.full_name)}</p><p class="muted small">${esc(p.email)} · ${esc(relatif(p.created_at))}</p></div>
        </div>
        ${cocok.length ? `<div class="hint-box">Email ini cocok dengan pendaftaran <b>${cocok.map((s) => esc(s.nama_lengkap)).join(', ')}</b>. Kemungkinan wali santri.</div>` : ''}
        <fieldset class="seg" data-role-pick="${p.id}">
          <legend>Beri peran</legend>
          ${['guru', 'ortu', 'komite', 'admin'].map((r) => `
            <label><input type="radio" name="role-${p.id}" value="${r}" ${r === saran ? 'checked' : ''}><span>${esc(r === 'ortu' ? 'Wali' : ROLE_LABEL[r])}</span></label>`).join('')}
        </fieldset>
        <div class="anak-picker" data-anak="${p.id}" ${saran === 'ortu' ? '' : 'hidden'}>
          <label for="cari-${p.id}">Tautkan ke santri</label>
          <input id="cari-${p.id}" type="search" placeholder="Cari nama santri…" data-filter="${p.id}">
          <div class="check-list" id="list-${p.id}">
            ${cocok.concat(pilihan.filter((s) => !cocok.includes(s))).map((s) => `
              <label class="check-row" data-name="${esc(s.nama_lengkap.toLowerCase())}">
                <input type="checkbox" value="${s.id}" ${cocok.includes(s) ? 'checked' : ''}>
                <span>${esc(s.nama_lengkap)}</span><span class="muted small">${esc(s.jenjang)}${s.status === 'pending' ? ' · pendaftar' : ''}${s.ortu_profile_id ? ' · sudah ada wali' : ''}</span>
              </label>`).join('')}
          </div>
        </div>
        <div class="row-actions">
          <button type="button" class="btn-danger" data-act="reject-account" data-id="${p.id}">Tolak</button>
          <button type="button" class="btn-primary grow" data-act="approve-account" data-id="${p.id}">Setujui</button>
        </div>`);
    }).join('');
  },

  async santri() {
    const [list, kelas] = await Promise.all([S.api.listSantri(), S.api.listKelas()]);
    const pending = list.filter((s) => s.status === 'pending');
    const aktif = list.filter((s) => s.status === 'aktif');
    const tanpaWali = aktif.filter((s) => !s.ortu_profile_id).length;
    return `
      <h2 class="section-title">Pendaftaran baru <span class="count">${pending.length}</span></h2>
      ${pending.length ? pending.map((s) => {
        const opsi = kelas.filter((k) => k.jenjang === s.jenjang).concat(kelas.filter((k) => k.jenjang !== s.jenjang));
        return card(`
          <div class="person">
            <span class="avatar sm gold">${esc(initials(s.nama_lengkap))}</span>
            <div class="grow"><p class="strong">${esc(s.nama_lengkap)}${s.panggilan ? ` <span class="muted">(${esc(s.panggilan)})</span>` : ''}</p>
            <p class="muted small">${esc(s.jenjang)} · lahir ${esc(s.tanggal_lahir || '–')}</p></div>
          </div>
          <dl class="facts">
            <div><dt>Orang tua</dt><dd>${esc([s.nama_ayah, s.nama_ibu].filter(Boolean).join(' & ') || '–')}</dd></div>
            <div><dt>HP</dt><dd>${esc(s.hp_ortu || '–')}</dd></div>
            <div><dt>Email</dt><dd>${esc(s.email_ortu || '–')}</dd></div>
          </dl>
          <label for="kelas-${s.id}">Masukkan ke kelas</label>
          <select id="kelas-${s.id}">
            <option value="">Belum ditentukan</option>
            ${opsi.map((k) => `<option value="${k.id}">${esc(k.nama)} (${esc(k.jenjang)})</option>`).join('')}
          </select>
          <div class="row-actions">
            <button type="button" class="btn-danger" data-act="reject-santri" data-id="${s.id}">Tolak</button>
            <button type="button" class="btn-primary grow" data-act="approve-santri" data-id="${s.id}">Terima santri</button>
          </div>`);
      }).join('') : card(empty('Tidak ada pendaftaran yang menunggu.'))}
      <h2 class="section-title">Santri aktif <span class="count">${aktif.length}</span></h2>
      ${tanpaWali ? `<div class="hint-box">${tanpaWali} santri belum tertaut ke akun wali. Tautkan lewat tab Akses saat walinya masuk dengan Google.</div>` : ''}
      ${card(aktif.length ? `<ul class="plain-list">${aktif.map((s) => {
        const k = kelas.find((x) => x.id === s.kelas_id);
        return `<li><span class="strong">${esc(s.nama_lengkap)}</span><span class="muted small">${esc(k ? k.nama : s.jenjang)}${s.ortu_profile_id ? '' : ' · tanpa wali'}</span></li>`;
      }).join('')}</ul>` : empty('Belum ada santri aktif.'))}`;
  },

  async kelas() {
    const [kelas, guru] = await Promise.all([S.api.listKelas(), S.api.listGuru()]);
    return `
      <h2 class="section-title">Kelas <span class="count">${kelas.length}</span></h2>
      ${card(kelas.length ? `<ul class="plain-list">${kelas.map((k) => `
        <li><span class="strong">${esc(k.nama)} <span class="tag">${esc(k.jenjang)}</span></span>
        <span class="muted small">${esc(k.guru ? k.guru.full_name : 'Belum ada guru')}${k.jadwal_text ? ' · ' + esc(k.jadwal_text) : ''}</span></li>`).join('')}</ul>` : empty('Belum ada kelas.'))}
      ${card(`
        <form data-form="create-kelas">
          <h3>Tambah kelas</h3>
          <label for="kNama">Nama kelas</label>
          <input id="kNama" name="nama" required placeholder="mis. TPQ B">
          <label for="kJenjang">Jenjang</label>
          <select id="kJenjang" name="jenjang" required><option>TKQ</option><option selected>TPQ</option><option>MDTA</option></select>
          <label for="kGuru">Guru / wali kelas</label>
          <select id="kGuru" name="guru_profile_id">
            <option value="">Belum ditentukan</option>
            ${guru.map((g) => `<option value="${g.id}">${esc(g.full_name)}</option>`).join('')}
          </select>
          ${guru.length ? '' : '<p class="muted small">Belum ada guru aktif. Setujui akun guru di tab Akses dulu.</p>'}
          <label for="kJadwal">Jadwal</label>
          <input id="kJadwal" name="jadwal_text" placeholder="mis. Senin–Kamis 15.30">
          <button type="submit" class="btn-primary btn-block mt">Simpan kelas</button>
        </form>`)}`;
  },

  async spp() {
    const list = await S.api.listSppVerifikasi();
    return `
      <h2 class="section-title">Bukti transfer masuk <span class="count">${list.length}</span></h2>
      ${list.length ? list.map((r) => card(`
        <div class="person">
          <span class="avatar sm gold">${icon('card', 18)}</span>
          <div class="grow"><p class="strong">${esc(r.santri ? r.santri.nama_lengkap : '–')}</p>
          <p class="muted small">${esc(bulanNama(r.periode))} · ${esc(rupiah(r.jumlah))}</p></div>
        </div>
        <div class="row-actions">
          ${r.bukti_link ? `<a class="btn-outline" href="${esc(r.bukti_link)}" target="_blank" rel="noopener">${icon('eye', 18)} Lihat bukti</a>` : '<span class="muted small grow">Bukti contoh (demo)</span>'}
          <button type="button" class="btn-primary grow" data-act="lunas" data-id="${r.id}">Tandai lunas</button>
        </div>`)).join('') : card(empty('Tidak ada bukti yang perlu diperiksa.'))}
      ${card(`
        <form data-form="tagihan">
          <h3>Buat tagihan SPP</h3>
          <p class="muted small">Satu tagihan untuk setiap santri aktif. Tagihan yang sudah ada untuk bulan itu tidak digandakan.</p>
          <label for="tPeriode">Bulan</label>
          <input id="tPeriode" name="periode" type="month" value="${periodeNow()}" required>
          <label for="tJumlah">Nominal per santri (Rp)</label>
          <input id="tJumlah" name="jumlah" type="number" min="0" step="1000" inputmode="numeric" required placeholder="mis. 50000">
          <button type="submit" class="btn-primary btn-block mt">Buat tagihan</button>
        </form>`)}`;
  },
};

// =====================================================
// GURU
// =====================================================
const guru = {
  async beranda() {
    const [kelas, info] = await Promise.all([S.api.myKelas(), S.api.listPengumuman()]);
    if (!kelas.length) return card(empty('Anda belum menjadi wali kelas. Minta admin menautkan Anda ke kelas.'));
    const k0 = kelas[0];
    const counts = await Promise.all(kelas.map((k) => S.api.santriByKelas(k.id).then((l) => l.length)));
    return `
      <section class="hero-card">
        <span class="eyebrow">Kelas Anda</span>
        <p class="hero-title">${esc(k0.nama)}</p>
        <p class="hero-sub">${counts[0]} santri${k0.jadwal_text ? ' · ' + esc(k0.jadwal_text) : ''}</p>
        <button type="button" class="btn-gold btn-block" data-act="go-absen" data-kelas="${k0.id}">${icon('check', 18)} Mulai absensi hari ini</button>
      </section>
      <div class="quick">
        <button type="button" data-act="tab" data-tab="absensi"><span class="qi mint">${icon('check', 20)}</span>Absensi</button>
        <button type="button" data-act="tab" data-tab="iqro"><span class="qi gold">${icon('book', 20)}</span>Iqro</button>
        <button type="button" data-act="tab" data-tab="info"><span class="qi blue">${icon('mega', 20)}</span>Pengumuman</button>
      </div>
      ${kelas.length > 1 ? `<h2 class="section-title">Semua kelas</h2>${card(`<ul class="plain-list">${kelas.map((k, i) => `<li><span class="strong">${esc(k.nama)}</span><span class="muted small">${counts[i]} santri</span></li>`).join('')}</ul>`)}` : ''}
      ${listPengumuman(info.slice(0, 2))}`;
  },

  async absensi() {
    const kelas = await S.api.myKelas();
    if (!kelas.length) return card(empty('Belum ada kelas yang Anda ajar.'));
    const g = S.guru;
    if (!g.kelasId || !kelas.some((k) => k.id === g.kelasId)) g.kelasId = kelas[0].id;
    if (!g.sheet || g.sheet.kelasId !== g.kelasId || g.sheet.tanggal !== g.tanggal) {
      const [santri, ada] = await Promise.all([S.api.santriByKelas(g.kelasId), S.api.absensiFor(g.kelasId, g.tanggal)]);
      const marks = {};
      santri.forEach((s) => { marks[s.id] = ada[s.id] || 'hadir'; });
      g.sheet = { kelasId: g.kelasId, tanggal: g.tanggal, santri, marks, sudahAda: Object.keys(ada).length > 0, dirty: false };
    }
    const sh = g.sheet;
    const n = { hadir: 0, izin: 0, sakit: 0, alpa: 0 };
    Object.values(sh.marks).forEach((v) => { n[v]++; });
    return `
      ${kelas.length > 1 ? `<div class="chips" role="group" aria-label="Pilih kelas">${kelas.map((k) => `<button type="button" class="chip ${k.id === g.kelasId ? 'on' : ''}" aria-pressed="${k.id === g.kelasId}" data-act="pick-kelas" data-kelas="${k.id}">${esc(k.nama)}</button>`).join('')}</div>` : ''}
      <div class="absen-head">
        <div><h2>${esc((kelas.find((k) => k.id === g.kelasId) || {}).nama)}</h2>
        <p class="muted small">${sh.sudahAda ? 'Sudah pernah disimpan, bisa diubah' : 'Belum diisi'}</p></div>
        <label class="sr-only" for="absTgl">Tanggal</label>
        <input id="absTgl" type="date" value="${g.tanggal}" max="${todayISO()}" data-change="tanggal" class="date-in">
      </div>
      <div class="absen-sum">
        ${Object.entries(ABSEN).map(([k, m]) => `<div class="s-${k}"><b>${n[k]}</b><span>${m.label}</span></div>`).join('')}
      </div>
      <div class="absen-tools">
        <p class="muted small">Semua otomatis hadir. Ketuk yang berbeda saja.</p>
        <button type="button" class="btn-ghost" data-act="all-hadir">Semua hadir</button>
      </div>
      ${sh.santri.length ? `<ul class="absen-list">${sh.santri.map((s) => `
        <li>
          <span class="avatar sm a-${sh.marks[s.id]}">${esc(initials(s.nama_lengkap))}</span>
          <span class="absen-name">${esc(s.nama_lengkap)}</span>
          <span class="absen-opts" role="group" aria-label="${esc(s.nama_lengkap)}">
            ${Object.entries(ABSEN).map(([k, m]) => `<button type="button" class="opt o-${k} ${sh.marks[s.id] === k ? 'on' : ''}" aria-pressed="${sh.marks[s.id] === k}" aria-label="${m.label}" data-act="mark" data-santri="${s.id}" data-val="${k}">${m.k}</button>`).join('')}
          </span>
        </li>`).join('')}</ul>` : card(empty('Belum ada santri aktif di kelas ini.'))}
      ${sh.santri.length ? `<div class="sticky-save"><button type="button" class="btn-primary btn-block" data-act="save-absen">Simpan absensi (${sh.santri.length} santri)</button></div>` : ''}`;
  },

  async iqro() {
    const kelas = await S.api.myKelas();
    if (!kelas.length) return card(empty('Belum ada kelas yang Anda ajar.'));
    const g = S.guru;
    if (!g.kelasId || !kelas.some((k) => k.id === g.kelasId)) g.kelasId = kelas[0].id;
    const santri = await S.api.santriByKelas(g.kelasId);
    const ids = santri.map((s) => s.id);
    const [prog, haf] = await Promise.all([S.api.iqroFor(ids), S.api.hafalanFor(ids)]);
    return `
      <datalist id="surah-list">${SURAH.map(([n]) => `<option value="${esc(n)}">`).join('')}</datalist>
      ${kelas.length > 1 ? `<div class="chips" role="group" aria-label="Pilih kelas">${kelas.map((k) => `<button type="button" class="chip ${k.id === g.kelasId ? 'on' : ''}" aria-pressed="${k.id === g.kelasId}" data-act="pick-kelas" data-kelas="${k.id}">${esc(k.nama)}</button>`).join('')}</div>` : ''}
      <h2 class="section-title">Progres Iqro &amp; hafalan</h2>
      ${santri.length ? santri.map((s) => {
        const p = prog[s.id] || { jilid: 1, halaman: 1 };
        return `
        <form class="card iqro-row" data-form="iqro" data-santri="${s.id}">
          <div class="person">
            <span class="avatar sm">${esc(initials(s.nama_lengkap))}</span>
            <div class="grow"><p class="strong">${esc(s.nama_lengkap)}</p>
            <p class="muted small">${prog[s.id] ? 'Diperbarui ' + esc(relatif(prog[s.id].updated_at) || '') : 'Belum ada catatan'}</p></div>
          </div>
          <div class="iqro-inputs">
            <div><label for="j-${s.id}">Jilid</label>
              <select id="j-${s.id}" name="jilid">${[1, 2, 3, 4, 5, 6].map((j) => `<option ${j === p.jilid ? 'selected' : ''}>${j}</option>`).join('')}</select></div>
            <div><label for="h-${s.id}">Halaman</label>
              <input id="h-${s.id}" name="halaman" type="number" min="1" max="60" inputmode="numeric" value="${p.halaman}" required></div>
            <button type="submit" class="btn-outline">Simpan</button>
          </div>
        </form>
        ${hafalanForm(s, haf[s.id] || [])}`;
      }).join('') : card(empty('Belum ada santri aktif di kelas ini.'))}`;
  },

  async info() {
    const list = await S.api.listPengumuman();
    return formPengumuman() + listPengumuman(list);
  },
};

// =====================================================
// WALI SANTRI (role 'ortu')
// =====================================================
const wali = {
  async beranda() {
    const kids = await S.api.myChildren();
    if (!kids.length) return card(empty('Akun Anda belum ditautkan ke data santri. Admin LPQ akan menautkannya.'));
    if (!S.wali.childId || !kids.some((k) => k.id === S.wali.childId)) S.wali.childId = kids[0].id;
    const kid = kids.find((k) => k.id === S.wali.childId);
    const [d, info] = await Promise.all([S.api.childDetail(kid.id), S.api.listPengumuman()]);

    const iq = d.iqro;
    const persen = iq ? Math.round(100 * ((iq.jilid - 1) * 60 + iq.halaman) / 360) : 0;
    const C = 2 * Math.PI * 38;
    const hadir = d.absensi.filter((a) => a.status === 'hadir').length;
    const lain = d.absensi.length - hadir;
    const selesai = d.hafalan.filter((h) => h.selesai).length;
    const sedang = d.hafalan.find((h) => !h.selesai);
    const now = d.spp.find((r) => r.periode === periodeNow());

    return `
      ${kidChips(kids)}
      ${card(`
        <div class="iqro-card">
          <svg width="96" height="96" viewBox="0 0 96 96" role="img" aria-label="Progres Iqro ${persen} persen">
            <circle cx="48" cy="48" r="38" fill="none" stroke="#EEF0EF" stroke-width="10"/>
            <circle cx="48" cy="48" r="38" fill="none" stroke="#0F4C3A" stroke-width="10" stroke-linecap="round" stroke-dasharray="${(C * persen / 100).toFixed(1)} ${C.toFixed(1)}" transform="rotate(-90 48 48)" class="ring"/>
            <text x="48" y="47" text-anchor="middle" font-size="22" font-weight="800" fill="#0B1F1A">${iq ? iq.jilid : '–'}</text>
            <text x="48" y="62" text-anchor="middle" font-size="10" font-weight="600" fill="#55635E">JILID</text>
          </svg>
          <div class="grow">
            <p class="eyebrow-dark">Iqro${iq ? ' · halaman ' + iq.halaman : ''}</p>
            <p class="strong big">${iq ? persen + '% dari Iqro 1–6' : 'Belum ada catatan Iqro'}</p>
            <p class="muted small">${kid.kelas ? esc(kid.kelas.nama) + (kid.kelas.guru ? ' · ' + esc(kid.kelas.guru.full_name) : '') : esc(kid.jenjang)}</p>
          </div>
        </div>`)}
      <div class="two">
        ${card(`
          <p class="strong">Kehadiran ${esc(bulanPendek(periodeNow()))}</p>
          <div class="days" aria-hidden="true">${d.absensi.map((a) => `<span class="d-${a.status}" title="${esc(a.tanggal)}"></span>`).join('') || '<span class="d-none"></span>'}</div>
          <p class="muted small"><b>${hadir}</b> hadir${lain ? ` · <b>${lain}</b> lainnya` : ''}</p>`, 'tight')}
        ${card(`
          <p class="strong">Hafalan</p>
          <p class="num">${selesai} <span class="muted small">surat</span></p>
          <p class="muted small">${sedang ? 'Sedang: ' + esc(sedang.surat) + (sedang.ayat_terakhir ? ' ayat ' + sedang.ayat_terakhir : '') : 'Belum ada catatan'}</p>`, 'tight')}
      </div>
      ${now ? sppCard(now) : ''}
      ${listPengumuman(info.slice(0, 2))}`;
  },

  async spp() {
    const kids = await S.api.myChildren();
    if (!kids.length) return card(empty('Akun Anda belum ditautkan ke data santri.'));
    if (!S.wali.childId || !kids.some((k) => k.id === S.wali.childId)) S.wali.childId = kids[0].id;
    const d = await S.api.childDetail(S.wali.childId);
    return `
      ${kidChips(kids)}
      <h2 class="section-title">Tagihan SPP</h2>
      ${d.spp.length ? d.spp.map(sppCard).join('') : card(empty('Belum ada tagihan.'))}`;
  },

  async info() {
    return listPengumuman(await S.api.listPengumuman());
  },
};

function hafalanForm(s, list) {
  const done = list.filter((h) => h.selesai).length;
  const cur = list.find((h) => !h.selesai);
  return `
    <form class="card hafalan-row" data-form="hafalan" data-santri="${s.id}">
      <p class="muted small"><b class="ink">Hafalan:</b> ${done} surat selesai${cur ? ' · sedang ' + esc(cur.surat) + (cur.ayat_terakhir ? ' ayat ' + cur.ayat_terakhir : '') : ''}</p>
      <div class="hafalan-inputs">
        <div><label for="sr-${s.id}">Surat</label>
          <input id="sr-${s.id}" name="surat" list="surah-list" required value="${esc(cur ? cur.surat : '')}" placeholder="Pilih / ketik"></div>
        <div><label for="ay-${s.id}">Ayat</label>
          <input id="ay-${s.id}" name="ayat" type="number" min="1" max="286" inputmode="numeric" value="${cur && cur.ayat_terakhir ? cur.ayat_terakhir : ''}"></div>
      </div>
      <div class="hafalan-foot">
        <label class="inline-check"><input type="checkbox" name="selesai"> Surat selesai</label>
        <button type="submit" class="btn-outline">Simpan hafalan</button>
      </div>
    </form>`;
}

function kidChips(kids) {
  if (kids.length < 2) return '';
  return `<div class="chips" role="tablist" aria-label="Pilih anak">${kids.map((k) => `
    <button type="button" role="tab" class="chip kid ${k.id === S.wali.childId ? 'on' : ''}" aria-selected="${k.id === S.wali.childId}" data-act="pick-kid" data-id="${k.id}">
      <span class="avatar xs">${esc(initials(k.nama_lengkap))}</span>${esc(k.panggilan || k.nama_lengkap.split(' ')[0])}</button>`).join('')}</div>`;
}

function sppCard(r) {
  const lunas = r.status === 'lunas';
  const menunggu = !lunas && r.bukti_url;
  return `
    <section class="card spp ${lunas ? 'paid' : 'due'}">
      <div class="spp-top">
        <div><p class="strong">SPP ${esc(bulanNama(r.periode))}</p><p class="num">${esc(rupiah(r.jumlah))}</p></div>
        <span class="tag ${lunas ? 'ok' : menunggu ? 'wait' : 'due'}">${lunas ? 'Lunas' : menunggu ? 'Bukti diperiksa' : 'Belum bayar'}</span>
      </div>
      ${!lunas ? `
        <label class="upload-btn ${menunggu ? 'secondary' : ''}">
          <input type="file" accept="image/*,application/pdf" data-upload="${r.id}" class="sr-only">
          ${icon('upload', 18)} <span>${menunggu ? 'Ganti bukti transfer' : 'Unggah bukti transfer'}</span>
        </label>` : ''}
    </section>`;
}

// =====================================================
// KOMITE
// =====================================================
const komite = {
  async laporan() {
    const r = await S.api.ringkasan();
    const spp = r.spp_bulanan || [];
    const jen = r.per_jenjang || {};
    const totalJen = Object.values(jen).reduce((a, b) => a + b, 0) || 1;
    const JC = { TKQ: '#D4A23A', TPQ: '#0F4C3A', MDTA: '#2D3A73' };
    return `
      <div class="komite-head">
        <h2>Laporan ${esc(bulanNama(r.periode))}</h2>
        <span class="role-pill blue">${icon('eye', 14)} Baca saja</span>
      </div>
      <div class="stats three">
        ${stat('Santri aktif', r.santri_aktif)}
        ${stat('Kehadiran', r.kehadiran_bulan_ini == null ? '–' : r.kehadiran_bulan_ini + '%', 'good')}
        ${stat('Guru', r.guru)}
      </div>
      ${card(`
        <div class="card-head"><h3>SPP lunas per bulan</h3><span class="muted small">% santri</span></div>
        ${spp.length ? `
        <div class="bars" role="img" aria-label="${esc(spp.map((x) => bulanPendek(x.periode) + ' ' + x.persen + '%').join(', '))}">
          ${spp.map((x, i) => `<div class="bar-col"><span class="bar-val">${x.persen}%</span><span class="bar ${i === spp.length - 1 ? 'now' : ''}" style="height:${Math.max(4, x.persen)}%"></span></div>`).join('')}
        </div>
        <div class="bar-labels" aria-hidden="true">${spp.map((x) => `<span>${esc(bulanPendek(x.periode))}</span>`).join('')}</div>
        <p class="muted small mt">${spp[spp.length - 1].periode === r.periode ? 'Bulan ini masih berjalan.' : ''}</p>` : empty('Belum ada tagihan SPP.')}`)}
      ${card(`
        <h3>Santri per jenjang</h3>
        <div class="stack-bar" aria-hidden="true">${Object.entries(jen).map(([k, v]) => `<span style="flex:${v};background:${JC[k] || '#888'}"></span>`).join('')}</div>
        <ul class="legend">${['TKQ', 'TPQ', 'MDTA'].map((k) => `<li><span style="background:${JC[k]}"></span>${k} <b>${jen[k] || 0}</b> <span class="muted">(${Math.round(100 * (jen[k] || 0) / totalJen)}%)</span></li>`).join('')}</ul>`)}
      <button type="button" class="btn-primary btn-block no-print" data-act="print">${icon('print', 18)} Cetak / simpan PDF</button>
      <p class="muted small center mt">Komite melihat angka gabungan saja. Nama santri dan rincian pembayaran per keluarga tidak ditampilkan.</p>`;
  },
  async info() {
    return listPengumuman(await S.api.listPengumuman());
  },
};

const VIEWS = { admin, guru, ortu: wali, komite };

// ---------- shared pieces ----------
function formPengumuman() {
  return card(`
    <form data-form="pengumuman">
      <h3>Tulis pengumuman</h3>
      <label for="pJudul">Judul</label>
      <input id="pJudul" name="judul" required maxlength="120">
      <label for="pIsi">Isi</label>
      <textarea id="pIsi" name="isi" required maxlength="2000"></textarea>
      <button type="submit" class="btn-primary btn-block mt">Kirim ke semua wali</button>
    </form>`);
}
function listPengumuman(list) {
  if (!list.length) return '';
  return `<h2 class="section-title">Pengumuman</h2>` + list.map((p) => card(`
    <div class="person top">
      <span class="qi blue">${icon('mega', 20)}</span>
      <div class="grow">
        <p class="strong">${p.pinned ? '<span class="tag wait">Penting</span> ' : ''}${esc(p.judul)}</p>
        <p class="pre">${esc(p.isi)}</p>
        <p class="muted small">${esc(p.penulis ? p.penulis.full_name : 'Pengurus')} · ${esc(relatif(p.created_at))}</p>
      </div>
    </div>`)).join('');
}

// =====================================================
// Events
// =====================================================
function afterRender(view) {
  view.querySelectorAll('[data-role-pick]').forEach((fs) => {
    fs.addEventListener('change', () => {
      const id = fs.dataset.rolePick;
      const role = fs.querySelector('input:checked').value;
      $(`[data-anak="${id}"]`).hidden = role !== 'ortu';
    });
  });
  view.querySelectorAll('[data-filter]').forEach((inp) => {
    inp.addEventListener('input', () => {
      const q = inp.value.trim().toLowerCase();
      $('#list-' + inp.dataset.filter).querySelectorAll('.check-row').forEach((row) => {
        row.hidden = q && !row.dataset.name.includes(q);
      });
    });
  });
}

async function busy(btn, fn) {
  if (btn) btn.disabled = true;
  try { await fn(); } catch (err) { console.error(err); toast(errText(err)); } finally { if (btn) btn.disabled = false; }
}

root.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const act = el.dataset.act;
  if (act === 'tab') { e.preventDefault(); return switchTab(el.dataset.tab); }
  if (act === 'logout') return S.demo ? (location.href = 'login.html') : signOut('login.html');
  if (act === 'reload') return location.reload();
  if (act === 'print') return window.print();
  if (act === 'demo-role') {
    S.user = { ...DEMO_USERS[el.dataset.role] };
    S.api.setUser(S.user.id);
    S.tab = null; S.guru.sheet = null; S.wali.childId = null;
    return renderShell();
  }

  // ----- admin -----
  if (act === 'approve-account') return busy(el, async () => {
    const id = el.dataset.id;
    const role = $(`[data-role-pick="${id}"] input:checked`).value;
    const anak = role === 'ortu' ? [...document.querySelectorAll(`#list-${id} input:checked`)].map((c) => c.value) : [];
    if (role === 'admin' && !confirm('Jadikan admin? Admin bisa mengubah semua data.')) return;
    await S.api.approveAccount(id, role, anak);
    toast('Akun disetujui sebagai ' + (role === 'ortu' ? 'wali santri' : ROLE_LABEL[role]));
    renderView();
  });
  if (act === 'reject-account') return busy(el, async () => {
    if (!confirm('Tolak akun ini?')) return;
    await S.api.rejectAccount(el.dataset.id); toast('Akun ditolak'); renderView();
  });
  if (act === 'approve-santri') return busy(el, async () => {
    await S.api.approveSantri(el.dataset.id, $('#kelas-' + el.dataset.id).value);
    toast('Santri diterima'); renderView();
  });
  if (act === 'reject-santri') return busy(el, async () => {
    if (!confirm('Tolak pendaftaran ini?')) return;
    await S.api.rejectSantri(el.dataset.id); toast('Pendaftaran ditolak'); renderView();
  });
  if (act === 'lunas') return busy(el, async () => {
    await S.api.markLunas(el.dataset.id); toast('Ditandai lunas'); renderView();
  });

  // ----- guru -----
  if (act === 'go-absen') { S.guru.kelasId = el.dataset.kelas; S.guru.tanggal = todayISO(); return switchTab('absensi'); }
  if (act === 'pick-kelas') { S.guru.kelasId = el.dataset.kelas; return renderView(); }
  if (act === 'mark') {
    S.guru.sheet.marks[el.dataset.santri] = el.dataset.val;
    S.guru.sheet.dirty = true;
    const y = window.scrollY;
    await renderView();
    window.scrollTo({ top: y });
    return;
  }
  if (act === 'all-hadir') {
    Object.keys(S.guru.sheet.marks).forEach((k) => { S.guru.sheet.marks[k] = 'hadir'; });
    return renderView();
  }
  if (act === 'save-absen') return busy(el, async () => {
    const sh = S.guru.sheet;
    await S.api.saveAbsensi(sh.kelasId, sh.tanggal, sh.marks);
    sh.sudahAda = true; sh.dirty = false;
    toast('Absensi tersimpan. Wali bisa melihatnya sekarang.');
    el.textContent = 'Tersimpan';
  });

  // ----- wali -----
  if (act === 'pick-kid') { S.wali.childId = el.dataset.id; return renderView(); }
});

root.addEventListener('change', async (e) => {
  const t = e.target;
  if (t.dataset.change === 'tanggal') {
    S.guru.tanggal = t.value || todayISO();
    return renderView();
  }
  if (t.dataset.upload) {
    const file = t.files && t.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) return toast('Ukuran file maksimal 5 MB');
    const label = t.closest('label');
    label.classList.add('loading');
    try {
      await S.api.uploadBukti(t.dataset.upload, file);
      toast('Bukti terkirim. Admin akan memeriksanya.');
      renderView();
    } catch (err) {
      console.error(err); toast(errText(err)); label.classList.remove('loading');
    }
  }
});

root.addEventListener('submit', async (e) => {
  const f = e.target.closest('[data-form]');
  if (!f) return;
  e.preventDefault();
  const btn = f.querySelector('[type=submit]');
  const v = Object.fromEntries(new FormData(f).entries());
  const kind = f.dataset.form;
  await busy(btn, async () => {
    if (kind === 'pengumuman') {
      await S.api.postPengumuman(v.judul.trim(), v.isi.trim());
      toast('Pengumuman terkirim'); renderView();
    } else if (kind === 'create-kelas') {
      await S.api.createKelas({ nama: v.nama.trim(), jenjang: v.jenjang, guru_profile_id: v.guru_profile_id || null, jadwal_text: v.jadwal_text.trim() || null });
      toast('Kelas ditambahkan'); renderView();
    } else if (kind === 'tagihan') {
      const n = await S.api.createTagihan(v.periode, Number(v.jumlah));
      toast(n ? `Tagihan dibuat untuk ${n} santri` : 'Tidak ada santri aktif');
      renderView();
    } else if (kind === 'iqro') {
      const jilid = Number(v.jilid), hal = Number(v.halaman);
      if (!(hal >= 1 && hal <= 60)) return toast('Halaman harus 1 sampai 60');
      await S.api.saveIqro(f.dataset.santri, jilid, hal);
      toast('Progres Iqro tersimpan');
    } else if (kind === 'hafalan') {
      const surat = v.surat.trim();
      const ayat = v.ayat ? Number(v.ayat) : null;
      const max = SURAH_AYAT[surat];
      if (ayat != null && max && ayat > max) return toast(`${surat} hanya ${max} ayat`);
      const selesai = v.selesai === 'on';
      await S.api.saveHafalan(f.dataset.santri, surat, selesai && max ? max : ayat, selesai);
      toast(selesai ? `${surat} selesai, alhamdulillah` : 'Hafalan tersimpan');
      renderView();
    }
  });
});

// Warn before leaving an unsaved attendance sheet.
window.addEventListener('beforeunload', (e) => {
  if (S.guru.sheet && S.guru.sheet.dirty) { e.preventDefault(); e.returnValue = ''; }
});

// =====================================================
// Boot
// =====================================================
(async function boot() {
  const params = new URLSearchParams(location.search);
  const wantDemo = params.has('demo') || !hasSupabase;
  const hashTab = location.hash.replace('#', '');

  if (wantDemo) {
    S.demo = true;
    S.api = createDemoApi();
    const pick = params.get('demo');
    S.user = { ...(DEMO_USERS[pick] || DEMO_USERS.guru) };
    S.api.setUser(S.user.id);
    S.tab = hashTab || null;
    return renderShell();
  }

  const current = await getCurrentUser();
  if (!current) {
    location.replace('login.html?next=dashboard.html');
    return;
  }
  if (!current.profile) {
    root.innerHTML = `<div class="view"><div class="alert show error">Profil akun tidak ditemukan. Pastikan supabase/SETUP_LENGKAP.sql sudah dijalankan (trigger pembuat profil), lalu keluar dan masuk lagi.</div>
      <p class="mt"><button type="button" class="btn-outline" data-act="logout">Keluar</button></p></div>`;
    return;
  }
  S.user = current.profile;
  if (!S.user.avatar_url) {
    const m = current.user.user_metadata || {};
    S.user.avatar_url = m.avatar_url || m.picture || null;
  }
  S.api = createLiveApi(current.user.id);
  S.tab = hashTab || null;
  renderShell();
})();
