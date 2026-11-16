/* ============================================
   ALIF SMART — Supabase client (ES module)
   Loaded from esm.sh as a side-effect-free import.
   Pinned version to avoid surprises on upstream releases.
   ============================================ */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const cfg = (typeof window !== 'undefined' && window.SUPABASE_CONFIG) || null;

// Detect placeholder vs. real config so the app can show a clear
// "configure Supabase" message instead of failing with a CORS error.
const isPlaceholder = (v) =>
  !v ||
  typeof v !== 'string' ||
  v.startsWith('REPLACE_WITH_') ||
  v.length < 10;

export const hasSupabase = !!(cfg && !isPlaceholder(cfg.url) && !isPlaceholder(cfg.anonKey));

export const supabase = hasSupabase
  ? createClient(cfg.url, cfg.anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;

if (!hasSupabase && typeof console !== 'undefined') {
  console.warn(
    '[alif-smart] Supabase belum dikonfigurasi. ' +
    'Copy js/supabase-config.example.js → js/supabase-config.js dan isi URL + anon key. ' +
    'Lihat docs/supabase-setup.md.'
  );
}
