/* ============================================
   ALIF SMART — Pendaftaran form
   Client-side validation, file upload UI, Supabase insert.
   Anonymous submission allowed (RLS: status='pending').
   ============================================ */

import { supabase, hasSupabase } from './supabase-client.js';

const form    = document.getElementById('formDaftar');
const success = document.getElementById('formSuccess');
const errorEl = document.getElementById('formError');
if (!form) {
  // Page without form — bail silently.
} else {

  // ============================================
  // File upload UI (drag/drop + tap to pick)
  // ============================================
  document.querySelectorAll('.file-drop').forEach((drop) => {
    const input = drop.querySelector('input[type="file"]');
    const list  = drop.parentElement.querySelector('.file-list');
    if (!input) return;

    const fileBag = new DataTransfer();

    function render() {
      if (!list) return;
      list.innerHTML = '';
      Array.from(fileBag.files).forEach((file, idx) => {
        const li = document.createElement('li');
        const name = document.createElement('span');
        name.className = 'file-name';
        name.textContent = `${file.name} (${Math.round(file.size / 1024)} KB)`;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.setAttribute('aria-label', 'Hapus ' + file.name);
        btn.textContent = '×';
        btn.addEventListener('click', () => {
          const next = new DataTransfer();
          Array.from(fileBag.files).forEach((f, i) => {
            if (i !== idx) next.items.add(f);
          });
          fileBag.items.clear();
          Array.from(next.files).forEach((f) => fileBag.items.add(f));
          input.files = fileBag.files;
          render();
        });
        li.appendChild(name);
        li.appendChild(btn);
        list.appendChild(li);
      });
    }

    drop.addEventListener('click', (e) => {
      if (e.target !== input) input.click();
    });
    drop.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        input.click();
      }
    });
    input.addEventListener('change', () => {
      Array.from(input.files).forEach((f) => fileBag.items.add(f));
      input.files = fileBag.files;
      render();
    });
    ['dragenter', 'dragover'].forEach((ev) => {
      drop.addEventListener(ev, (e) => {
        e.preventDefault();
        drop.classList.add('dragover');
      });
    });
    ['dragleave', 'drop'].forEach((ev) => {
      drop.addEventListener(ev, (e) => {
        e.preventDefault();
        drop.classList.remove('dragover');
      });
    });
    drop.addEventListener('drop', (e) => {
      if (!e.dataTransfer) return;
      Array.from(e.dataTransfer.files).forEach((f) => fileBag.items.add(f));
      input.files = fileBag.files;
      render();
    });
  });

  // ============================================
  // Submit handler
  // ============================================
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

    if (!hasSupabase) {
      // Demo mode: no backend wired up yet, just show success.
      console.warn('[pendaftaran] Supabase belum dikonfigurasi — masuk mode demo.');
      showSuccess();
      return;
    }

    const submitBtn = form.querySelector('button[type=submit]');
    const originalText = submitBtn.textContent;
    submitBtn.disabled = true;
    submitBtn.textContent = 'Mengirim…';
    hideError();

    try {
      const santriId = crypto.randomUUID();
      const fd = new FormData(form);

      // ---- 1. Upload foto santri (optional) ----
      let fotoPath = null;
      const fotoFile = fd.get('foto_santri');
      if (fotoFile && fotoFile.size > 0) {
        const ext = sanitizeExt(fotoFile.name);
        const path = `${santriId}/foto.${ext}`;
        const { data, error } = await supabase.storage
          .from('pendaftaran')
          .upload(path, fotoFile, { cacheControl: '3600', upsert: false });
        if (error) throw new Error(`Upload foto gagal: ${error.message}`);
        fotoPath = data.path;
      }

      // ---- 2. Upload dokumen (KK, akta) — multiple ----
      const dokumenFiles = fd.getAll('dokumen').filter((f) => f && f.size > 0);
      const dokumenPaths = [];
      for (let i = 0; i < dokumenFiles.length; i++) {
        const f = dokumenFiles[i];
        const safeName = f.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80);
        const path = `${santriId}/dokumen-${i}-${safeName}`;
        const { data, error } = await supabase.storage
          .from('pendaftaran')
          .upload(path, f, { cacheControl: '3600', upsert: false });
        if (error) throw new Error(`Upload dokumen "${f.name}" gagal: ${error.message}`);
        dokumenPaths.push(data.path);
      }

      // ---- 3. Insert santri row (RLS: anon allowed when status='pending') ----
      const payload = {
        id:                 santriId,
        nama_lengkap:       trimOrNull(fd.get('nama')),
        panggilan:          trimOrNull(fd.get('panggilan')),
        nik:                trimOrNull(fd.get('nik')),
        tanggal_lahir:      fd.get('tanggal_lahir'),
        tempat_lahir:       trimOrNull(fd.get('tempat_lahir')),
        jenis_kelamin:      fd.get('jk'),
        alamat:             trimOrNull(fd.get('alamat')),
        jenjang:            fd.get('jenjang'),
        kemampuan_baca:     trimOrNull(fd.get('kemampuan')),
        sekolah_formal:     trimOrNull(fd.get('sekolah')),
        nama_ayah:          trimOrNull(fd.get('ayah')),
        nama_ibu:           trimOrNull(fd.get('ibu')),
        pekerjaan_ortu:     trimOrNull(fd.get('pekerjaan')),
        hp_ortu:            trimOrNull(fd.get('hp')),
        email_ortu:         trimOrNull(fd.get('email')),
        hubungan_pendaftar: trimOrNull(fd.get('hubungan')),
        foto_url:           fotoPath,
        dokumen_urls:       dokumenPaths,
        status:             'pending',
      };

      const { error: insertError } = await supabase.from('santri').insert(payload);
      if (insertError) {
        // If insert failed, try to clean up uploaded files so we don't
        // leave orphaned objects in storage.
        const paths = [fotoPath, ...dokumenPaths].filter(Boolean);
        if (paths.length) {
          await supabase.storage.from('pendaftaran').remove(paths).catch(() => {});
        }
        throw insertError;
      }

      showSuccess();
    } catch (err) {
      console.error('[pendaftaran] submit failed', err);
      showError(humanizeError(err));
      submitBtn.disabled = false;
      submitBtn.textContent = originalText;
    }
  });
}

// ============================================
// Helpers
// ============================================
function trimOrNull(v) {
  if (v == null) return null;
  const s = String(v).trim();
  return s ? s : null;
}
function sanitizeExt(filename) {
  const m = /\.([a-zA-Z0-9]{1,5})$/.exec(filename || '');
  return m ? m[1].toLowerCase() : 'jpg';
}
function showSuccess() {
  document.body.classList.add('form-submitted');
  if (form) form.style.display = 'none';
  if (success) success.classList.add('show');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
function showError(msg) {
  if (!errorEl) {
    alert(msg);
    return;
  }
  errorEl.textContent = msg;
  errorEl.classList.add('show');
  errorEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
}
function hideError() {
  if (errorEl) {
    errorEl.classList.remove('show');
    errorEl.textContent = '';
  }
}
function humanizeError(err) {
  const msg = (err && err.message) || 'Pengiriman gagal.';
  if (/network|fetch/i.test(msg)) return 'Koneksi bermasalah. Cek internet Anda lalu coba lagi.';
  if (/duplicate|unique/i.test(msg)) return 'Data ini sepertinya sudah pernah dikirim. Hubungi admin jika perlu bantuan.';
  if (/row-level security|policy/i.test(msg)) return 'Akses ditolak. Hubungi admin LPQ.';
  return `Pengiriman gagal: ${msg}`;
}
