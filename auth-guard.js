/* 2FAST4U - guardia di accesso + flag admin.
   Protegge la pagina (se non sei autenticato -> login). Espone:
     window.sb          client Supabase
     window.currentUser utente loggato
     window.isAdmin     true se l'email e' tra gli ADMIN (modalita' test: tutto sbloccato)
     window.logout()
   Le pagine possono definire window.onAuthReady() per reagire a sessione pronta. */
(function(){
  var SUPABASE_URL = "https://dnwiyqpivhmpziyawutw.supabase.co";
  var SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRud2l5cXBpdmhtcHppeWF3dXR3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI3MzEyNDUsImV4cCI6MjA5ODMwNzI0NX0.WIHo-wC5bnLtiMQcDaFUVY_cOHNuJyxH3OWrl6WL6kI";
  var LOGIN_URL = "/login";

  /* >>> EMAIL DEGLI ACCOUNT ADMIN <<<  (le stesse usate per crearli su Supabase) */
  var ADMIN_EMAILS = ["jacopo.bergamin89@gmail.com", "service@terapix.eu"];

  function reveal(){ try{ document.documentElement.style.visibility="visible"; }catch(e){} }
  if(!window.supabase || !window.supabase.createClient){ reveal(); return; }
  var sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  window.sb = sb;
  window.isAdmin = false;
  window.currentUser = null;
  window.logout = function(){ try{ sb.auth.signOut().finally(function(){ location.replace(LOGIN_URL); }); }catch(e){ location.replace(LOGIN_URL); } };

  var admins = ADMIN_EMAILS.map(function(e){ return (e||"").toLowerCase(); });
  sb.auth.getSession().then(function(res){
    var session = res && res.data && res.data.session;
    if(session){
      window.currentUser = session.user;
      window.isAdmin = admins.indexOf(((session.user && session.user.email) || "").toLowerCase()) !== -1;
      if(typeof window.onAuthReady === "function"){ try{ window.onAuthReady(); }catch(e){} }
      reveal();
    } else {
      location.replace(LOGIN_URL);
    }
  }).catch(function(){ location.replace(LOGIN_URL); });
})();
