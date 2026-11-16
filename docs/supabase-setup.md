# Setup Supabase + Login Google

Project Supabase dan `js/supabase-config.js` sudah ada. Tinggal empat langkah.

## Langkah 1 — Database (sekali jalan)

1. Buka `supabase/SETUP_LENGKAP.sql` di Notepad atau VS Code.
2. **Ctrl+A, Ctrl+C** — salin *isi* file, bukan nama atau path filenya.
   (Error lama `syntax error at or near "supabase"` terjadi karena yang
   ditempel adalah path `supabase/migrations/...sql`.)
3. Supabase → **SQL Editor** → **New query** → Ctrl+V → **Run**.

Hasil yang benar: *Success. No rows returned*. Di **Table Editor** ada 9 tabel,
di **Storage** ada 4 bucket.

Kalau muncul `already exists`, berarti sebagian pernah jalan. Buka lagi
`SETUP_LENGKAP.sql`, hapus tanda `--` pada blok **RESET** di bagian atas,
jalankan, lalu kembalikan tanda `--` dan jalankan ulang seluruh file.

## Langkah 2 — Google Cloud: buat OAuth Client

1. Buka <https://console.cloud.google.com/> → buat project baru, misalnya `alif-smart`.
2. **APIs & Services → OAuth consent screen** (di konsol baru: *Google Auth Platform → Branding*):
   - User type: **External**
   - App name: `Alif Smart`, support email: email pengurus
   - Scopes: cukup `email`, `profile`, `openid` (bawaan)
   - Setelah selesai, klik **Publish app** (status *In production*).
     Selama masih *Testing*, hanya email yang didaftarkan sebagai *test user*
     yang bisa masuk.
3. **APIs & Services → Credentials → Create credentials → OAuth client ID**
   - Application type: **Web application**
   - Authorized JavaScript origins:
     - `http://localhost:8765`
     - domain produksi nanti, misalnya `https://alifsmart.id`
   - Authorized redirect URIs:
     - `https://bnvmkybkpgcsskhlzkgc.supabase.co/auth/v1/callback`
       (salin persis dari halaman provider Google di Supabase, langkah 3)
4. Simpan **Client ID** dan **Client secret**. Jangan kirim secret ke chat atau repo.

## Langkah 3 — Supabase: aktifkan Google

1. **Authentication → Sign In / Providers → Google** → Enable.
2. Tempel Client ID dan Client secret → **Save**.
3. **Authentication → URL Configuration**
   - Site URL: `http://localhost:8765` (ganti ke domain produksi saat online)
   - Redirect URLs: tambahkan `http://localhost:8765/**` dan nanti `https://DOMAIN-ANDA/**`

## Langkah 4 — Jadikan diri Anda admin

1. Jalankan situs lokal: `python -m http.server 8765` di folder project.
2. Buka <http://localhost:8765/login.html> → **Masuk dengan Google**.
   Anda akan melihat layar *Akun menunggu persetujuan*. Itu benar.
3. Supabase → SQL Editor:

   ```sql
   update profiles set role = 'admin', status = 'aktif'
   where email = 'EMAIL-GOOGLE-ANDA@gmail.com';
   ```

4. Muat ulang dashboard. Mulai sekarang semua persetujuan lewat aplikasi, bukan SQL.

## Alur kerja setelah setup

| Siapa | Yang dilakukan |
|---|---|
| Wali santri | Isi formulir pendaftaran (pakai email Google yang sama) → masuk dengan Google → menunggu |
| Guru / komite | Masuk dengan Google → menunggu |
| Admin | Tab **Akses**: pilih peran, tautkan wali ke anaknya (email cocok otomatis disarankan) → Setujui |
| Admin | Tab **Santri**: terima pendaftar dan masukkan ke kelas. Tab **Kelas**: buat kelas dan pilih guru |
| Admin | Tab **SPP**: buat tagihan bulanan, periksa bukti transfer, tandai lunas |
| Guru | Absensi sekali ketuk, progres Iqro, pengumuman |
| Wali | Lihat Iqro, hafalan, kehadiran, SPP, unggah bukti transfer |
| Komite | Laporan gabungan (tanpa nama santri), cetak ke PDF |

## Keamanan yang sudah dipasang

- Akun baru selalu `status = 'menunggu'`. Sebelum disetujui, `auth_role()` bernilai null
  sehingga semua aturan RLS menolak akses data.
- Peran tidak lagi diambil dari metadata pendaftaran (dulu siapa pun bisa daftar sebagai admin).
- Trigger `protect_profile_fields`: hanya admin yang bisa mengubah peran atau status.
- Trigger `protect_spp_fields`: wali hanya bisa melampirkan bukti, tidak bisa mengubah nominal atau status.
- Komite membaca lewat fungsi `komite_ringkasan()` yang hanya mengembalikan angka gabungan.

## Demo tanpa database

`dashboard.html?demo` (atau `?demo=admin`, `?demo=guru`, `?demo=ortu`, `?demo=komite`,
`?demo=menunggu`). Data hanya di memori dan hilang saat halaman dimuat ulang.

## Troubleshooting

| Gejala | Cek |
|---|---|
| "Login Google belum diaktifkan di Supabase" | Langkah 3 belum disimpan |
| Google: `redirect_uri_mismatch` | Redirect URI di Google Cloud harus persis `https://<project>.supabase.co/auth/v1/callback` |
| Google: "Access blocked / app not verified" | Consent screen masih *Testing* — Publish app atau tambahkan test user |
| Kembali dari Google tapi ke `localhost:3000` | Site URL / Redirect URLs di Supabase belum diisi (Langkah 3) |
| Dashboard: "Tabel database belum ada" | Langkah 1 belum jalan |
| Dashboard: "Profil akun tidak ditemukan" | Akun dibuat sebelum SQL dijalankan. Hapus user itu di Authentication → Users, lalu masuk lagi |
| `infinite recursion detected in policy` | Jangan menambah policy yang membaca `profiles` langsung, pakai `auth_role()` |
