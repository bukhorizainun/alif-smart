

# ALIF SMART — COMPLETE WORKFLOW

# Dari Ide → Claude Code → Production

====================================================
PHASE 1 — PERSIAPAN ENVIRONMENT
===============================

1. Install tools utama:

* Node.js
* Git
* Claude Code
* Bun
* WSL (opsional tapi direkomendasikan)
* VS Code

2. Install Claude Code:
   npm install -g @anthropic-ai/claude-code

3. Jalankan Claude:
   claude

4. Install gstack:
   git clone --single-branch --depth 1 https://github.com/garrytan/gstack.git %USERPROFILE%.claude\skills\gstack

====================================================
PHASE 2 — MEMBUAT PROJECT
=========================

1. Buat folder project:

D:\AI PROJECTS\alif_smart

2. Masuk ke folder:

cd "D:\AI PROJECTS\alif_smart"

3. Jalankan Claude:

claude

4. Masukkan logo ke folder project:

* logo_alif_lam_mim.png

Struktur awal:

alif_smart/
│
├── assets/
│   └── logo_alif_lam_mim.png
│
├── index.html
├── style.css
├── script.js
└── README.md

====================================================
PHASE 3 — LANDING PAGE
======================

PROMPT:

Saya ingin membuat aplikasi/website ALIF SMART untuk LPQ Alif Lam Mim.

Logo sudah tersedia di folder project.

Buat landing page modern, premium, dan responsive mobile dengan:

* index.html
* style.css
* script.js

Konsep:
ALIF SMART adalah platform digital untuk TKQ, TPQ, dan MDTA.

Fitur:

1. Pendaftaran santri online
2. Dashboard admin
3. Absensi guru dan santri
4. Materi belajar
5. Progress Iqro dan hafalan
6. Pengumuman
7. Pembayaran SPP
8. Laporan perkembangan santri

Desain:

* modern Islamic edtech
* clean
* mobile-first
* warna emerald, putih, emas lembut
* nyaman dibaca di HP

Gunakan logo PNG yang ada di folder project.

====================================================
PHASE 4 — RESPONSIVE MOBILE
===========================

PROMPT:

Perbaiki tampilan mobile ALIF SMART.

Fokus:

* layar 320px–480px
* navbar rapi
* hero compact
* tombol full-width
* tidak ada horizontal scroll
* grid menjadi 1 kolom di HP
* desktop jangan dirusak

====================================================
PHASE 5 — HALAMAN TAMBAHAN
==========================

1. Halaman pendaftaran

PROMPT:

Buat halaman:
pendaftaran-santri.html

Dengan:

* form modern
* pilihan TKQ/TPQ/MDTA
* upload dokumen
* responsive mobile
* style konsisten dengan landing page

---

2. Dashboard mockup

PROMPT:

Buat dashboard-demo.html untuk:

* admin
* guru
* orang tua
* santri

Gunakan:

* sidebar modern
* statistik card
* progress hafalan
* jadwal belajar
* absensi
* mobile responsive

====================================================
PHASE 6 — REVIEW ALA GSTACK
===========================

1. Design Review

PROMPT:

Lakukan design review seperti gstack untuk seluruh project ALIF SMART.

Cek:

* typography
* spacing
* navbar
* hero
* CTA
* card layout
* mobile responsiveness
* visual consistency

Jangan edit file dulu.
Berikan daftar masalah dan rekomendasi prioritas.

---

2. Engineering Review

PROMPT:

Lakukan engineering review seperti gstack.

Cek:

* struktur folder
* scalability
* maintainability
* dashboard architecture
* future backend integration
* auth flow
* database preparation

---

3. QA Review

PROMPT:

Lakukan QA review untuk mobile dan desktop.

Cek:

* horizontal scroll
* button issue
* broken layout
* responsive issue
* accessibility
* spacing consistency

====================================================
PHASE 7 — BACKEND
=================

Mulai integrasi:

* Firebase
  atau
* Supabase

Fitur:

* login
* auth
* database
* realtime data
* upload file
* role management

PROMPT:

Tambahkan backend menggunakan Firebase/Supabase.

Role:

* admin
* guru
* orang tua
* santri

Buat:

* auth
* database schema
* dashboard data flow
* absensi
* pembayaran
* progress hafalan

====================================================
PHASE 8 — PRODUCTION READY
==========================

1. GitHub

git init
git add .
git commit -m "Initial commit"

2. Push ke GitHub

3. Deploy:

* Vercel
  atau
* Netlify

====================================================
PHASE 9 — DEPLOYMENT
====================

PROMPT:

Persiapkan project ALIF SMART untuk production deployment.

Cek:

* performance
* responsive
* SEO
* favicon
* metadata
* image optimization
* accessibility
* deployment readiness

====================================================
PHASE 10 — DOMAIN & PRODUCTION
==============================

1. Beli domain:
   contoh:

* alifsmart.id
* alifsmart.com

2. Connect domain ke:

* Vercel
  atau
* Netlify

3. Production launch

====================================================
PHASE 11 — FUTURE DEVELOPMENT
=============================

Roadmap lanjutan:

* Mobile app Android/iOS
* Push notification
* AI assistant santri
* AI hafalan tracker
* AI raport generation
* WhatsApp integration
* Payment gateway
* QR attendance
* Parent analytics dashboard

====================================================
WORKFLOW TERBAIK
================

BUILD → REVIEW → REFINE → SCALE

Jangan langsung:

* backend besar
* terlalu banyak fitur
* multi-agent kompleks

Bangun bertahap:

1. Landing page
2. Dashboard
3. Backend
4. Production
5. Mobile app
