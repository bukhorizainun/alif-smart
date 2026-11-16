/* ============================================
   ALIF SMART — Login page logic
   Google OAuth is the main door. Magic link and
   password stay as a fallback (admin, no Google).
   ============================================ */

import {
  signInWithGoogle,
  signInWithPassword,
  signInWithMagicLink,
  getSession,
} from './auth.js';
import { hasSupabase } from './supabase-client.js';

const msgEl = document.getElementById('authMsg');
const btnGoogle = document.getElementById('btnGoogle');
const formPwd = document.getElementById('formPassword');
const formMagic = document.getElementById('formMagic');

(async function () {
  // Google returns errors in the URL hash or query (e.g. user cancelled).
  const back = new URLSearchParams(window.location.hash.slice(1) || window.location.search);
  if (back.get('error_description')) {
    showMessage('error', 'Gagal masuk: ' + back.get('error_description'));
  }

  const session = await getSession();
  if (session) {
    redirectAfterLogin();
    return;
  }

  if (!hasSupabase) {
    showMessage('error', 'Supabase belum dikonfigurasi. Lihat docs/supabase-setup.md. Anda tetap bisa membuka versi contoh.');
    document.querySelectorAll('button, input').forEach((el) => (el.disabled = true));
    return;
  }

  btnGoogle.addEventListener('click', async () => {
    clearMessage();
    setBusy(btnGoogle, true, 'Membuka Google…');
    const next = safeNext() || 'dashboard.html';
    const { error } = await signInWithGoogle(next);
    if (error) {
      setBusy(btnGoogle, false);
      showMessage('error', humanizeAuthError(error));
    }
    // On success the browser navigates to Google.
  });

  formPwd.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearMessage();
    const email = formPwd.querySelector('[name=email]').value.trim();
    const password = formPwd.querySelector('[name=password]').value;
    const btn = formPwd.querySelector('button[type=submit]');
    setBusy(btn, true);
    const { error } = await signInWithPassword(email, password);
    setBusy(btn, false);
    if (error) return showMessage('error', humanizeAuthError(error));
    redirectAfterLogin();
  });

  formMagic.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearMessage();
    const email = formMagic.querySelector('[name=email]').value.trim();
    const btn = formMagic.querySelector('button[type=submit]');
    setBusy(btn, true);
    const { error } = await signInWithMagicLink(email);
    setBusy(btn, false);
    if (error) return showMessage('error', humanizeAuthError(error));
    showMessage('success', 'Link masuk telah dikirim ke ' + email + '. Cek inbox dan folder spam.');
  });
})();

function showMessage(kind, text) {
  msgEl.className = 'alert show ' + kind;
  msgEl.textContent = text;
}
function clearMessage() {
  msgEl.className = 'alert';
  msgEl.textContent = '';
}
function setBusy(btn, busy, label = 'Memproses…') {
  btn.disabled = busy;
  const span = btn.querySelector('span') || btn;
  span.dataset.originalText = span.dataset.originalText || span.textContent;
  span.textContent = busy ? label : span.dataset.originalText;
}
function humanizeAuthError(error) {
  const msg = (error && error.message) || 'Terjadi kesalahan.';
  if (/provider is not enabled/i.test(msg)) return 'Login Google belum diaktifkan di Supabase. Lihat docs/supabase-setup.md bagian Google.';
  if (/invalid login credentials/i.test(msg)) return 'Email atau password salah.';
  if (/email not confirmed/i.test(msg)) return 'Email belum dikonfirmasi. Cek inbox Anda.';
  if (/rate limit/i.test(msg)) return 'Terlalu banyak percobaan. Coba beberapa menit lagi.';
  return msg;
}
// Only relative page names, never another origin (open redirect).
function safeNext() {
  const next = new URLSearchParams(window.location.search).get('next');
  if (!next) return null;
  const page = next.replace(/^.*\//, '');
  return /^[a-z0-9_-]+\.html([?#].*)?$/i.test(page) ? page : null;
}
function redirectAfterLogin() {
  window.location.replace(safeNext() || 'dashboard.html');
}
