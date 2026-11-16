# ALIF SMART

Platform digital LPQ Alif Lam Mim untuk TKQ, TPQ, dan MDTA. Mobile-first.

## Status

**Phase 8 — Login Google + dashboard 4 peran (Nov 2026).** Schema, RLS, storage, auth flow,
form wiring, dan dashboard hydration sudah tertulis. Butuh setup user untuk
aktif (buat project Supabase + jalankan SQL). Lihat
[`docs/supabase-setup.md`](docs/supabase-setup.md).

## Stack

- HTML/CSS/JS vanilla (mobile-first, no build step)
- ES modules (loaded from same origin + esm.sh untuk Supabase SDK)
- Plus Jakarta Sans (Google Fonts)
- Backend: **Supabase** (Postgres + Auth + Storage + Row Level Security)

## Struktur

```
alif_smart/
├── index.html                       — Landing
├── pendaftaran-santri.html          — Form pendaftaran (anonymous insert)
├── dashboard.html                   — Dashboard role-aware
├── login.html                       — Login (password + magic link)
├── manifest.webmanifest             — PWA manifest
│
├── assets/img/                      — Logo, gambar
├── css/
│   ├── tokens.css                   — :root vars (warna, --tap-target)
│   ├── base.css                     — Reset, container, buttons
│   ├── components.css               — Header, footer, card, alert, tag, reveal
│   └── pages/{landing,form,login,dashboard}.css
├── js/
│   ├── supabase-config.example.js   — Template config (commit)
│   ├── supabase-config.js           — Real config (gitignored)
│   ├── supabase-client.js           — createClient() + hasSupabase flag
│   ├── auth.js                      — Session, role, nav sync
│   ├── core.js                      — Nav toggle, reveal observer, year
│   ├── form.js                      — Pendaftaran + Storage upload
│   ├── login.js                     — Login page logic
│   └── dashboard.js                 — Role activation + data hydration
├── supabase/migrations/
│   ├── 20260521000000_schema.sql    — 9 tabel, enums, triggers
│   ├── 20260521000100_rls.sql       — RLS per role
│   └── 20260521000200_storage.sql   — 4 bucket + policies
└── docs/
    ├── workflow.md                  — Build workflow Phase 1-11
    └── supabase-setup.md            — Setup walkthrough
```

## Quick start

### 1. Lokal (tanpa backend)

Project tetap jalan dalam **demo mode** kalau `js/supabase-config.js`
belum ada — dashboard menampilkan role switcher untuk semua 4 role
seperti sebelumnya.

```bash
# Static server
python -m http.server 8765
# atau: npx serve / bun --bun serve
```

Buka http://localhost:8765

### 2. Dengan Supabase

Ikuti [`docs/supabase-setup.md`](docs/supabase-setup.md):

1. Buat project di https://app.supabase.com
2. Copy `js/supabase-config.example.js` → `js/supabase-config.js`, isi URL + anon key
3. Jalankan 3 file SQL di `supabase/migrations/` lewat SQL Editor
4. Buat admin pertama (`update profiles set role='admin' where email=...`)
5. Test login → pendaftaran → dashboard

## Roles (RLS-enforced)

Semua akun masuk lewat **Google** dan mulai berstatus `menunggu` sampai admin menyetujui.

| Role | Akses |
|---|---|
| **admin** | Semua data. Menyetujui akun, menerima pendaftar, kelas, tagihan SPP |
| **guru** | Santri di kelasnya: absensi, progres Iqro/hafalan, pengumuman |
| **ortu** (wali santri) | Anak sendiri: Iqro, hafalan, kehadiran, SPP, unggah bukti |
| **komite** | Angka gabungan saja lewat `komite_ringkasan()` |
| **anon** | Insert `santri` berstatus `pending` + upload ke bucket `pendaftaran` |

Setup: [`docs/supabase-setup.md`](docs/supabase-setup.md) — satu file SQL
(`supabase/SETUP_LENGKAP.sql`) + aktifkan Google. Demo tanpa database:
`dashboard.html?demo`.

## Mobile

- Viewport `viewport-fit=cover` untuk notched phones
- Tap targets minimum 44px (`--tap-target` token)
- Form input `font-size: 16px` cegah iOS auto-zoom on focus
- Role switcher horizontal scroll dengan mask-image fade hint
- Dashboard mobile: main content sebelum sidebar
- PWA manifest siap install ke home screen

## Browser support

Modern evergreen (Chrome, Edge, Firefox, Safari). iOS 13+ untuk
`backdrop-filter`. ES modules + `import` dari esm.sh wajib —
no IE11 support.

## Yang belum (V1.x roadmap)

- Admin UI untuk approval pendaftaran (V1: manual via SQL)
- Halaman absensi (guru tap kehadiran per santri)
- Halaman SPP (ortu lihat invoice + upload bukti)
- Realtime subscriptions (absensi live update ke ortu)
- WA notification via Fonnte/Wablas
- Payment gateway Midtrans/Tripay untuk SPP online
- Service worker untuk offline mode
