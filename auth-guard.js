/* 2FAST4U — GUARDIA DI SESSIONE
   Includere nelle pagine protette DOPO supabase-config.js e supabase-js:

     <script src="supabase-config.js"></script>
     <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
     <script src="auth-guard.js"></script>

   Comportamento:
     - Config vuota            → pagina visibile, nessuna protezione (sviluppo).
     - Config ok, NON loggato  → redirect a login.html.
     - Config ok, loggato      → espone window.AUTH e lancia l'evento 'auth:ready'.

   window.AUTH = { user, email, isAdmin, configured }
   window.authLogout()  → esce e torna al login. */
(function () {
  var CFG = window.SB_CONFIG || {};
  var root = document.documentElement;

  // Nasconde la pagina finché non sappiamo se sei loggato (niente lampo di contenuto protetto)
  try { root.style.visibility = "hidden"; } catch (e) {}
  function reveal() { try { root.style.visibility = "visible"; } catch (e) {} }
  function goLogin() { location.replace(CFG.loginPage || "login.html"); }

  function fireReady(auth) {
    window.AUTH = auth;
    function emit() {
      try { document.dispatchEvent(new CustomEvent("auth:ready", { detail: auth })); } catch (e) {}
    }
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", emit);
    else emit();
  }

  function isAdminEmail(email) {
    var list = (CFG.adminEmails || []).map(function (x) { return String(x).toLowerCase().trim(); });
    return !!email && list.indexOf(String(email).toLowerCase().trim()) !== -1;
  }

  // --- Config non compilata: non blocco lo sviluppo ---
  if (!CFG.url || !CFG.anonKey) {
    console.warn("[2FAST4U] Supabase non configurato (supabase-config.js): guardia di sessione inattiva.");
    reveal();
    fireReady({ user: null, email: null, isAdmin: false, configured: false });
    window.authLogout = function () { if (!confirm('Vuoi davvero uscire?')) return; location.href = CFG.loginPage || "login.html"; };
    return;
  }

  if (!window.supabase || !window.supabase.createClient) {
    console.error("[2FAST4U] libreria supabase-js non caricata prima di auth-guard.js.");
    reveal();
    return;
  }

  var sb = window.supabase.createClient(CFG.url, CFG.anonKey);
  window.sbClient = sb;

  window.authLogout = function () {
    if (!confirm('Vuoi davvero uscire?')) return;
    sb.auth.signOut().finally(function () { location.replace(CFG.loginPage || "login.html"); });
  };

  sb.auth.getSession().then(function (res) {
    var s = (res && res.data) ? res.data.session : null;
    if (!s) { goLogin(); return; }
    var email = (s.user && s.user.email) ? s.user.email : null;
    reveal();
    fireReady({ user: s.user, email: email, isAdmin: isAdminEmail(email), configured: true });
  }).catch(function (err) {
    console.error("[2FAST4U] errore lettura sessione:", err);
    goLogin();
  });
})();
