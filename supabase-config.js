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
  url:      "",   // es. "https://xxxxxxxxxxxx.supabase.co"
  anonKey:  "",   // es. "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9....."

  // Solo queste email vedono i comandi da amministratore:
  adminEmails: [
    "jacopo.bergamin89@gmail.com",
    "service@terapix.eu"
  ],

  // pagine (di norma non serve toccarle)
  loginPage: "login.html",
  homePage:  "home.html"
};
