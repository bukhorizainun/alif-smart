/* ============================================
   ALIF SMART — Supabase config (TEMPLATE)

   1. Copy this file to `js/supabase-config.js`
   2. Replace the placeholder values with the values from your
      Supabase project at https://app.supabase.com → Project Settings → API
   3. The real `supabase-config.js` is gitignored so your key never
      reaches the repo — the anon key is fine to expose to the browser
      (RLS protects data), but committing it makes secret rotation
      annoying later.

   See docs/supabase-setup.md for the full walkthrough.
   ============================================ */

window.SUPABASE_CONFIG = {
  // e.g. "https://abcdefghijklmnop.supabase.co"
  url: "REPLACE_WITH_YOUR_SUPABASE_PROJECT_URL",

  // e.g. "eyJhbGciOi...long jwt..."
  anonKey: "REPLACE_WITH_YOUR_SUPABASE_ANON_KEY",
};
