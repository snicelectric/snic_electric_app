/* SNIC'ELECTRIC - Supabase Client */
(function (window) {
  "use strict";

  const SUPABASE_URL = "https://bqwkedddpjcqrwmribtn.supabase.co";
  const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_svfWrK2J-7bxRmZrFIpX-w_D0i9g8Bc";

  if (!window.supabase || typeof window.supabase.createClient !== "function") {
    console.error("SNIC'ELECTRIC: No se cargó supabase-js.");
    window.supabaseClient = null;
    return;
  }

  window.supabaseClient = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY,
    {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true
      }
    }
  );
})(window);
