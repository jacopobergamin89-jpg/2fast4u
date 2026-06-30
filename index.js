/* =====================================================================
   2FAST4U — ENTRY DEL BIVIO (un solo processo Render, un solo indirizzo)
   Una porta, un server HTTP. La home sta a "/". I due motori girano nello
   STESSO processo ma su socket.io SEPARATI (path diversi), cosi' i loro
   stati di gioco non si toccano mai:
     - CLASSICO  (A) -> socket path di default  /socket.io/   · client: index.html  (io())
     - MODALITA B    -> socket path dedicato    /sock-b/      · client: play_modalitaB.html (io({path:'/sock-b/'}))
   ===================================================================== */
const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const app = express();

/* ---- pagine ---- */
app.get('/',         (req,res)=> res.sendFile(path.join(__dirname,'home.html')));
app.get('/login',    (req,res)=> res.sendFile(path.join(__dirname,'login.html')));
app.get('/classica', (req,res)=> res.sendFile(path.join(__dirname,'index.html')));
app.get('/b',        (req,res)=> res.sendFile(path.join(__dirname,'play_modalitaB.html')));
app.get('/deck',     (req,res)=> res.sendFile(path.join(__dirname,'deck-builder.html'), err=>{
  if(err) res.status(200).send('<!doctype html><meta charset="utf-8"><body style="font-family:system-ui;background:#0B0518;color:#F4EEFF;padding:40px;line-height:1.5">Deck-builder non ancora caricato sul server (manca <code>deck-builder.html</code>). <br><a style="color:#2BA8E6" href="/">← torna alla home</a></body>');
}));

app.use(express.static(__dirname, { index:false }));   // asset (img/, video/) e file diretti; "/" NON serve index.html

const server = http.createServer(app);

/* ---- due istanze socket.io sullo stesso server, su path diversi ---- */
const ioA = new Server(server, { path:'/socket.io/' });   // CLASSICO (path default: index.html usa io())
const ioB = new Server(server, { path:'/sock-b/' });      // MODALITA B (path dedicato)

require('./server.js').mount(ioA);
require('./server_modalitaB.js').mount(ioB);

const PORT = process.env.PORT || 3000;
server.listen(PORT, ()=> console.log('2FAST4U · bivio A+B in ascolto sulla porta '+PORT+'  ·  rotte: /  /classica  /b  /deck'));
