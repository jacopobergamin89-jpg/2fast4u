# 2FAST4U — online (Node + Express + Socket.io)

Corse clandestine, 2–8 giocatori, **anche da soli contro la CPU**. Vince chi arriva a 50 PO.

## Struttura (PIATTA — tutto qui, niente cartella `public/`)
```
server.js       motore + stanze + bot (autorevole)
index.html      client (lobby, rivelazione pilota, mercato, gara)
package.json
README.md
```
> Il server serve i file dalla **sua stessa cartella**. Metti `server.js` e `index.html` **nella stessa posizione** e funziona. (Se nel repo è rimasta una vecchia `public/index.html`, ora viene **ignorata**.)

## ▶️ Giocare in locale sul Mac (contro la CPU)
1. Apri il Terminale nella cartella del progetto.
2. `npm install`
3. `node server.js`
4. Apri **http://localhost:3000**
5. **Crea partita** → in sala d'attesa premi **“+ Aggiungi CPU”** (1–7 bot) → **Avvia partita**.

Niente attese, nessun amico necessario: 1 umano + ≥1 CPU.

## ☁️ Aggiornare il deploy su Render
1. Su GitHub carica **`server.js`** e **`index.html`** nella **radice** del repo (sovrascrivi). La vecchia `public/index.html` non serve più.
2. Render → **Events**: parte una build; se no, **Manual Deploy → Deploy latest commit**, attendi **Live**.
3. Nel browser: **Cmd+Shift+R** (ricarica senza cache).
4. **Verifica versione giusta:** in sala d'attesa devi vedere **“+ Aggiungi CPU”**. Se leggi ancora *“Servono almeno 2 giocatori”*, sta girando il file vecchio.

Free tier Render: dopo ~15 min si addormenta → prima apertura 30–60s.

## Note tecniche
- Avvio: `node server.js` (porta da `PORT`, default 3000).
- Velocità bot: variabile d'ambiente `BOT_DELAY` (ms, default 700).
- Validazione: `node --check server.js`.
