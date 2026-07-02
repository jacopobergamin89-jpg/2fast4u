/* 2FAST4U — CONFIGURAZIONE SUPABASE
   ============================================================
   Unico file da compilare. Incolla qui i DUE valori del TUO progetto:

     Dashboard Supabase  →  Project Settings  →  API
        • Project URL   →  incolla in  url
        • anon  public  →  incolla in  anonKey

   Finché "url" e "anonKey" restano vuoti:
     - login e registrazione mostrano un avviso di configurazione;
     - le pagine di gioco NON sono protette (comodo per sviluppo).
   Appena li compili, il login viene richiesto e i comandi admin
   compaiono solo per le email elencate in adminEmails.
   ============================================================ */
window.SB_CONFIG = {
  url:      "https://dnwiyqpivhmpziyawutw.supabase.co",
  anonKey:  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRud2l5cXBpdmhtcHppeWF3dXR3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI3MzEyNDUsImV4cCI6MjA5ODMwNzI0NX0.WIHo-wC5bnLtiMQcDaFUVY_cOHNuJyxH3OWrl6WL6kI",

  // Solo queste email vedono i comandi da amministratore:
  adminEmails: [
    "jacopo.bergamin89@gmail.com",
    "service@terapix.eu"
  ],

  // pagine (di norma non serve toccarle)
  loginPage: "login.html",
  homePage:  "home.html"
};
