/* ============================================
   ALIF SMART — Auth helpers
   Session management, role detection, nav state sync.
   ============================================ */

import { supabase, hasSupabase } from './supabase-client.js';

const PUBLIC_PAGES = new Set(['index.html', 'pendaftaran-santri.html', 'login.html', '']);

/**
 * Returns the current session, or null if signed out or Supabase not configured.
 */
export async function getSession() {
  if (!hasSupabase) return null;
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    console.error('[auth] getSession error', error);
    return null;
  }
  return data.session;
}

/**
 * Returns { user, profile } when signed in, or null.
 * The profile is fetched from the public.profiles table and includes the role.
 */
export async function getCurrentUser() {
  const session = await getSession();
  if (!session) return null;

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('id, role, status, full_name, phone, email, avatar_url')
    .eq('id', session.user.id)
    .maybeSingle();

  if (error) {
    console.error('[auth] profile fetch error', error);
    return { user: session.user, profile: null };
  }
  return { user: session.user, profile };
}

/**
 * Sign in with email + password. Returns { error } on failure.
 */
export async function signInWithPassword(email, password) {
  if (!hasSupabase) return { error: new Error('Supabase belum dikonfigurasi.') };
  return supabase.auth.signInWithPassword({ email, password });
}

/** Absolute URL of a page next to the current one (works on a sub-path host). */
export function pageUrl(page) {
  return new URL(page, window.location.href).href;
}

/**
 * Sign in with Google (OAuth). The browser leaves for Google and comes
 * back to dashboard.html with the session in the URL.
 */
export async function signInWithGoogle(next = 'dashboard.html') {
  if (!hasSupabase) return { error: new Error('Supabase belum dikonfigurasi.') };
  return supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: pageUrl(next),
      queryParams: { prompt: 'select_account' },
    },
  });
}

/**
 * Send a magic link to the given email. Returns { error } on failure.
 */
export async function signInWithMagicLink(email) {
  if (!hasSupabase) return { error: new Error('Supabase belum dikonfigurasi.') };
  return supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: pageUrl('dashboard.html'),
    },
  });
}

/**
 * Sign out and redirect to landing.
 */
export async function signOut(redirectTo = 'index.html') {
  if (hasSupabase) {
    await supabase.auth.signOut();
  }
  window.location.href = redirectTo;
}

/**
 * Guard helper for protected pages. Call early in module scripts:
 *   await requireSession();
 * If not signed in, redirects to login and returns null. Otherwise
 * returns { user, profile }.
 */
export async function requireSession(loginPath = 'login.html') {
  const current = await getCurrentUser();
  if (!current) {
    const here = encodeURIComponent(window.location.pathname + window.location.search + window.location.hash);
    window.location.replace(loginPath + '?next=' + here);
    return null;
  }
  return current;
}

/**
 * Re-render the site-nav based on session state:
 *   logged out → show "Masuk" link
 *   logged in  → show user name + Keluar
 * Call after DOMContentLoaded; safe to call when no nav present.
 */
export async function syncNavAuthState() {
  const nav = document.getElementById('siteNav');
  if (!nav) return;

  const current = await getCurrentUser();

  // Remove any prior auth UI we injected.
  nav.querySelectorAll('[data-auth-injected]').forEach((el) => el.remove());

  if (!current) {
    // Insert "Masuk" link before the .nav-cta (Daftar button).
    const cta = nav.querySelector('.nav-cta');
    const a = document.createElement('a');
    a.href = 'login.html';
    a.textContent = 'Masuk';
    a.setAttribute('data-auth-injected', 'true');
    if (window.location.pathname.endsWith('login.html')) {
      a.setAttribute('aria-current', 'page');
    }
    if (cta) nav.insertBefore(a, cta);
    else nav.appendChild(a);
    return;
  }

  // Signed in: show user name + Keluar
  const name = (current.profile && current.profile.full_name) || current.user.email;
  const greet = document.createElement('span');
  greet.setAttribute('data-auth-injected', 'true');
  greet.style.cssText = 'padding: .85rem .25rem; color: var(--ink-500); font-size: .92rem; min-height: 44px; display: flex; align-items: center;';
  greet.textContent = name;

  const out = document.createElement('a');
  out.href = '#';
  out.textContent = 'Keluar';
  out.setAttribute('data-auth-injected', 'true');
  out.addEventListener('click', (e) => {
    e.preventDefault();
    signOut();
  });

  const cta = nav.querySelector('.nav-cta');
  if (cta) {
    nav.insertBefore(greet, cta);
    nav.insertBefore(out, cta);
  } else {
    nav.appendChild(greet);
    nav.appendChild(out);
  }
}

/**
 * Listen to auth state changes (e.g. token refresh, sign-out from another tab).
 * Re-syncs nav whenever state changes.
 */
export function watchAuth() {
  if (!hasSupabase) return;
  supabase.auth.onAuthStateChange((_event, _session) => {
    syncNavAuthState();
  });
}

// Auto-init on every page that loads this module.
if (typeof window !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { syncNavAuthState(); watchAuth(); });
  } else {
    syncNavAuthState();
    watchAuth();
  }
}
