# 2FAST4U · versione online (multiplayer realtime)

Gioco di corse clandestine per 2–8 giocatori. Ognuno gioca **dal proprio dispositivo**
(PC, telefono, tablet): basta che si colleghino allo stesso indirizzo e usino lo stesso
codice-stanza. Lo stato della partita vive sul **server**, che a ogni giocatore manda solo
ciò che può vedere — così **pilota e scommesse restano segreti** agli avversari.

---

## 📁 Struttura del progetto

Tieni ESATTAMENTE questa struttura (la cartella `public` è importante):

```
2fast4u-online/
├── package.json
├── server.js
└── public/
    └── index.html
```

- `server.js` → il server (motore di gioco + stanze). Gira su Node.
- `public/index.html` → l'interfaccia che si apre nel browser.
- `package.json` → dice quali librerie installare e come avviare.

> Se hai scaricato lo **zip**, scompattalo e troverai già questa struttura.
> NON serve la cartella `node_modules`: la crea il server da solo in fase di installazione.

---

## 🚀 Metodo consigliato: GitHub + Render (link permanente, gratis)

GitHub da solo **non basta** a far giocare in rete: GitHub (e GitHub Pages) ospita solo
file statici, non *esegue* un server. Quindi mettiamo il codice su **GitHub** e lo facciamo
**eseguire** a **Render**, che ha un piano gratuito e si collega al repo in due clic.

### Passo 1 — Metti il progetto su GitHub
1. Crea un account su **github.com** (se non ce l'hai).
2. In alto a destra: **+** → **New repository**.
3. Dai un nome (es. `2fast4u-online`), lascia **Public**, e crea.
4. Nella pagina del repo vuoto, clicca **"uploading an existing file"**.
5. Trascina dentro **i 3 file** mantenendo la cartella `public`:
   - se l'upload web non ti fa caricare una cartella, carica prima `package.json` e
     `server.js`, poi crea il file `public/index.html` scrivendo `public/` davanti al nome
     quando lo aggiungi (GitHub crea la cartella in automatico).
   - In alternativa, più comodo: installa **GitHub Desktop**, oppure usa i comandi git
     (in fondo).
6. **Commit changes**.

### Passo 2 — Pubblica su Render
1. Vai su **render.com** e registrati (puoi entrare con l'account GitHub).
2. **New +** → **Web Service**.
3. Collega il tuo account GitHub e seleziona il repo `2fast4u-online`.
4. Compila i campi (Render di solito li indovina da solo):
   - **Language / Environment:** `Node`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance Type:** `Free`
5. Premi **Create Web Service** e aspetta che finisca (1–2 minuti).
6. In cima alla pagina comparirà l'indirizzo pubblico, tipo
   **`https://2fast4u-online.onrender.com`** → quello è il link da condividere.

> ⚠️ **Nota piano gratuito:** dopo ~15 minuti di inattività Render "addormenta" il
> servizio. La **prima apertura** dopo una pausa può metterci 30–60 secondi a svegliarsi:
> è normale, basta aspettare. Una volta sveglio va liscio per tutta la serata.

### Passo 3 — Giocate
1. Tu (o chi fa da **host**) apri il link e premi **Crea nuova partita**.
2. Compare un **codice di 4 lettere**. Mandalo agli amici (WhatsApp, a voce…).
3. Gli amici aprono **lo stesso link**, scrivono nome + codice e premono **Entra**.
4. Quando siete tutti in sala, l'host preme **Avvia partita**.
5. Si gioca a turni: quando tocca a te, il tuo schermo si attiva; gli altri vedono
   "sta giocando…". Pilota, soldi, carte e scommesse li vedi **solo tu**.

---

## 💻 Alternative (senza pubblicare online)

### A) Sul tuo Mac + tunnel (veloce, temporaneo)
Per giocare al volo senza GitHub:
```bash
cd 2fast4u-online
npm install
npm start
```
Il server parte su `http://localhost:3000` (lo apri tu in locale). Per farci entrare gli
amici da fuori casa serve un "tunnel": installa **cloudflared** o **ngrok** e lancia
`cloudflared tunnel --url http://localhost:3000` (oppure `ngrok http 3000`): ti dà un
indirizzo pubblico temporaneo da condividere. Quando spegni il Mac, finisce.

### B) Stessa rete Wi-Fi (LAN)
Se siete tutti **sotto lo stesso Wi-Fi** (stessa casa), dopo `npm start` gli amici possono
collegarsi a `http://INDIRIZZO-IP-DEL-TUO-MAC:3000` (l'IP locale lo trovi in
Impostazioni di rete, tipo `192.168.1.20`). Non serve internet, ma funziona solo in locale.

---

## 🧰 Per chi usa git da terminale (opzionale)
```bash
cd 2fast4u-online
git init
git add .
git commit -m "2fast4u online"
git branch -M main
git remote add origin https://github.com/TUO-UTENTE/2fast4u-online.git
git push -u origin main
```
Poi colleghi il repo a Render come nel Passo 2.

---

## ℹ️ Note tecniche
- **Requisiti server:** Node 18+ (Render lo fornisce).
- **Librerie:** `express` + `socket.io` (installate da `npm install`).
- **Riconnessione:** se un giocatore perde la connessione, riaprendo il link e rientrando
  con **lo stesso nome** e lo stesso codice torna nella partita in corso.
- **Contenuti ancora da aggiungere** (rimandati al playtest): carte Pre-Gara speciali
  (confisca, smonta, mini-market, rimappa strada, difesa), mazzo Polizia completo, carte
  strada di Livello 5. Il tetto attuale di pista e componenti è Livello 4.
