/* 2FAST4U - guardia di accesso. Protegge la pagina: se non sei autenticato ti manda al login.
   Espone window.sb (client Supabase) e window.logout(). */
(function(){
  var SUPABASE_URL = "https://dnwiyqpivhmpziyawutw.supabase.co";
  var SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRud2l5cXBpdmhtcHppeWF3dXR3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI3MzEyNDUsImV4cCI6MjA5ODMwNzI0NX0.WIHo-wC5bnLtiMQcDaFUVY_cOHNuJyxH3OWrl6WL6kI";
  var LOGIN_URL = "/login";
  function reveal(){ try{ document.documentElement.style.visibility="visible"; }catch(e){} }
  if(!window.supabase || !window.supabase.createClient){ reveal(); return; }  // libreria non caricata: non bloccare la pagina
  var sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  window.sb = sb;
  window.logout = function(){ try{ sb.auth.signOut().finally(function(){ location.replace(LOGIN_URL); }); }catch(e){ location.replace(LOGIN_URL); } };
  sb.auth.getSession().then(function(res){
    if(res && res.data && res.data.session){ reveal(); }
    else { location.replace(LOGIN_URL); }
  }).catch(function(){ location.replace(LOGIN_URL); });
})();
