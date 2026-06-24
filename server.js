/* =====================================================================
   2FAST4U - server multiplayer autorevole (Node + Express + Socket.io)
   Lo stato della partita vive QUI. I client mandano azioni, il server
   valida (turno, regole) e rimanda a ogni giocatore solo cio' che puo'
   vedere (la mano In-Gara e le scommesse degli altri restano segrete;
   pilota e auto di ciascuno sono ispezionabili dagli avversari).
   ===================================================================== */
const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
app.use(express.static(__dirname));
const server = http.createServer(app);
const io = new Server(server);

/* ============================ DATI ============================ */
const DB = {
  ordine: ['motore', 'cambio', 'sterzo', 'assetto', 'peso', 'nos'],
  nomi: { motore: 'Motore', cambio: 'Cambio', sterzo: 'Sterzo', assetto: 'Assetto', peso: 'Peso', nos: 'NOS' },
  valori: { motore: [2,3,5,6,8,9], cambio: [1,2,4,6,7,9], sterzo: [1,3,5,7,8,9], assetto: [1,2,4,5,7,9], peso: [-6,-5,-4,-3,-2,-1], nos: [0,3,5,6,8,9] },
  prezzi: { motore: [0,800,1600,2100,3200,3900], cambio: [0,500,1200,2100,2600,3900], sterzo: [0,800,1600,2600,3200,3900], assetto: [0,500,1200,1600,2600,3900], peso: [0,400,800,1200,1700,2300], nos: [0,600,1200,1600,2400,2900] },
  lunghezze: [8,9,11,13,14],
  roadBasePrice: { 1:100, 2:200, 3:300, 4:400, 5:500 },
  premiMult: [9,6,4,2.5,1.5,1,0,0],
  premiPO: [5,3,1,0,0,0,0,0],
  quoteScommessa: [0.5,1,1.5,2,2.5,3,4,5],
  obiettivo: 50,
  maxLevelRoads: 4,
  deckPerStat: { 1:4, 2:3, 3:3 },
  colori: [
    { n:'Rosso', h:'#e74c3c' }, { n:'Blu', h:'#3498db' }, { n:'Verde', h:'#2ecc71' }, { n:'Giallo', h:'#f39c12' },
    { n:'Viola', h:'#9b59b6' }, { n:'Turchese', h:'#1abc9c' }, { n:'Arancio', h:'#e67e22' }, { n:'Rosa', h:'#e91e63' }
  ],
  piloti: [
    { id:1, nome:"Topho 'Grugno' Ragnox", gang:'Scimmo Syndik8', tipo:'rettilineo', ab:'+1 Controllo nei Rettilinei', partenza:2 },
    { id:2, nome:"Lil' Arpa", gang:'Scimmo Syndik8', tipo:'citta', ab:'+1 Controllo in Città', partenza:1 },
    { id:3, nome:"Iri 'Rage Pulse'", gang:'Scimmo Syndik8', tipo:'fortuna', ab:'1° tiro 2 o 4 → +2 movimento', partenza:3, fortuna:[2,4] },
    { id:4, nome:"Donaz 'Torque Don'", gang:'Kromag Kru', tipo:'drift', ab:'+1 Controllo nei Drift', partenza:1 },
    { id:5, nome:"Lax 'Skid Prophet'", gang:'Kromag Kru', tipo:'nos', ab:'NOS → +4 movimento extra', partenza:2 },
    { id:6, nome:"IZ 'Blazeflip'", gang:'Kromag Kru', tipo:'fortuna', ab:'1° tiro 1 o 5 → +2 movimento', partenza:3, fortuna:[1,5] },
    { id:7, nome:"MOKAH 'Drip Boss'", gang:"Mo'ka Mafia", tipo:'citta', ab:'+1 Controllo in Città', partenza:1 },
    { id:8, nome:"Barb'ra 'Sharp Curlz'", gang:"Mo'ka Mafia", tipo:'drift', ab:'+1 Controllo nei Drift', partenza:1 },
    { id:9, nome:"Cespik 'Clippaz'", gang:"Mo'ka Mafia", tipo:'rettilineo', ab:'+1 Controllo nei Rettilinei', partenza:2 },
    { id:10, nome:'GEMI.X', gang:'Geminitech', tipo:'nos', ab:'NOS → +4 movimento extra', partenza:2 },
    { id:11, nome:"Antym 'RAMMER'", gang:'Geminitech', tipo:'fortuna', ab:'1° tiro 1 o 3 → +2 movimento', partenza:3, fortuna:[1,3] },
    { id:12, nome:'Hoi.H4nn', gang:'Geminitech', tipo:'rettilineo', ab:'+1 Controllo nei Rettilinei', partenza:2 },
    { id:13, nome:"K0T0R 'Blind Thrill'", gang:'Kotor Void', tipo:'citta', ab:'+1 Controllo in Città', partenza:1 },
    { id:14, nome:"Lil' Yanna", gang:'Kotor Void', tipo:'drift', ab:'+1 Controllo nei Drift', partenza:1 },
    { id:15, nome:"Scimmiz 'Echo Noiz'", gang:'Kotor Void', tipo:'nos', ab:'NOS → +4 movimento extra', partenza:2 }
  ]
};
const TIPO_LABEL = { rettilineo:'Rettilineo', citta:'Città', drift:'Drift' };
const ROADS = {
  1: [ {t:'rettilineo',nm:'Run Base'}, {t:'rettilineo',nm:'Flat Line'},
       {t:'citta',nm:'Semaforo Verde',pc:{lt:4,a:1}}, {t:'citta',nm:'Start Rush',pc:{lt:6,a:1}},
       {t:'drift',nm:'Slalom Rookie',pv:{gt:3,a:1},pc:{lt:5,a:1}}, {t:'drift',nm:'Asfalto Fresco',pv:{gt:3,a:1},pc:{lt:5,a:1}} ],
  2: [ {t:'rettilineo',nm:'Tunnel Line'},
       {t:'citta',nm:'Via Libera',pc:{lt:4,a:1}}, {t:'citta',nm:'Zona 30',pc:{lt:6,a:1}},
       {t:'citta',nm:'Urban Clash',pc:{lt:7,a:2}}, {t:'citta',nm:'Cross Lanes',pc:{lt:7,a:2}}, {t:'citta',nm:'Night Deviation',pc:{lt:6,a:2}},
       {t:'drift',nm:'Slide District',pv:{gt:4,a:1},pc:{lt:7,a:2}}, {t:'drift',nm:'Backstreet Slides',pv:{gt:4,a:2},pc:{lt:6,a:1}} ],
  3: [ {t:'rettilineo',nm:'Vento in Faccia'}, {t:'rettilineo',nm:'Autostrada Chiusa'}, {t:'rettilineo',nm:'Rush 5th Gear'},
       {t:'citta',nm:'Fatal Cross',pc:{lt:8,a:2}}, {t:'citta',nm:'Midnight Run',pc:{lt:9,a:2}}, {t:'citta',nm:'Sirene Spente',pc:{lt:8,a:2}},
       {t:'drift',nm:'Rincon Drift',pv:{gt:7,a:2},pc:{lt:10,a:1}}, {t:'drift',nm:'Urban Slide',pv:{gt:4,a:1},pc:{lt:7,a:2}} ],
  4: [ {t:'rettilineo',nm:'Iper Strada'},
       {t:'citta',nm:'Caos Urbano',pc:{lt:9,a:2}}, {t:'citta',nm:'Blocco Notturno',pc:{lt:12,a:1}},
       {t:'drift',nm:'Deriva Estrema',pv:{gt:8,a:1},pc:{lt:9,a:2}}, {t:'drift',nm:'Vortice',pv:{gt:15,a:2},pc:{lt:15,a:1}} ]
};
const C_INGARA = [
 ['Oggi devi vincere','vel',2,1,'self'],['Corri Fooorrreeeesstttttt!!!!','vel',2,1,'self'],['Monti un\'espansione racing','vel',2,1,'self'],['Un colpo di fortuna con il turbo','vel',2,1,'self'],
 ['Doppio caffe stamattina','vel',2,2,'self'],['Il vento è a favore','vel',2,2,'self'],['Veloce come il vento','vel',1,1,'self'],['Finalmente il giusto cambio','vel',1,1,'self'],
 ['Hai messo benzina racing: boost temporaneo!','vel',1,1,'self'],['Il meccanico ti sistema la centralina: +1','vel',1,1,'self'],['Senti l\'adrenalina salire: spingi di più!!!','vel',1,1,'self'],['L\'ora del Energy drink','vel',1,1,'self'],
 ['Hai montato un nuovo filtro aria','vel',1,2,'self'],['Hai montato un nuovo filtro aria','vel',1,2,'self'],['La marmitta si allenta','vel',-1,1,'rival'],['Una curva mal presa ti rallenta','vel',-1,1,'rival'],
 ['Benzina Sporca','vel',-1,1,'rival'],['Si allenta un bullone','vel',-1,1,'rival'],['Le gomme slittano','vel',-1,2,'rival'],['Problemi al cambio','vel',-1,2,'rival'],
 ['Perdi pressione nei pneumatici','vel',-2,1,'rival'],['Frenata d\'emergenza','vel',-2,1,'rival'],['Gomma forata','vel',-2,2,'rival'],['Carburatore ingolfato','vel',-2,2,'rival'],
 ['Ribassamento perfetto','ctrl',2,1,'self'],['Installato il nuovo volante','ctrl',2,1,'self'],['Spettacolo il nuovo alettone','ctrl',2,2,'self'],['Con questo nuovo cambio si vola','ctrl',2,2,'self'],
 ['Ti prendooooo!!!!','ctrl',1,1,'self'],['Hai istallato le nuove sospensioni','ctrl',1,1,'self'],['Il nuovo alettone fa il suo dovere','ctrl',1,2,'self'],['Spettacolo le nuove minigonne','ctrl',1,2,'self'],['Barra antirollio nuova','ctrl',1,1,'self'],
 ['Freni rispondono male','ctrl',-1,1,'rival'],['Alettone danneggiato','ctrl',-1,1,'rival'],['Ti prendooooo!!!!','ctrl',-1,1,'rival'],['Olio vecchi nel motore','ctrl',-1,2,'rival'],
 ['Olio vecchio nei freni','ctrl',-1,2,'rival'],['Ammortizzatore scarico','ctrl',-2,1,'rival'],['Il motore non raffredda bene','ctrl',-2,1,'rival'],['Marmitta inceppata','ctrl',-2,2,'rival'],
 ['Sterzo allentato','ctrl',-2,2,'rival'],['Servosterzo in tilt','ctrl',-2,1,'rival'],['Sospensioni a pezzi','ctrl',-2,2,'rival'],['Convergenza sballata','ctrl',-1,2,'rival'],['Bel colpo di fortuna','partenza',2,0,'self'],['Il sonno aiuta','partenza',2,0,'self'],['Brucia le gomme','partenza',1,0,'self'],
 ['Brucia le gomme','partenza',1,0,'self'],['Buono il caffè stamattina','partenza',1,0,'self'],['Non è la tua giornata','partenza',-2,0,'rival'],['Brutti incubi','partenza',-2,0,'rival'],
 ['Hai messo gli occhiali sbagliati','partenza',-1,0,'rival'],['Oggi va cosi…','partenza',-1,0,'rival'],['Falsa partenza','partenza',-1,0,'rival'],['Sempre la vecchia fortuna','dado',6,1,'self'],
 ['Il destino provvede','dado',6,1,'self'],['Spegni la fiamma','dado',1,1,'rival'],['ALT','dado',1,1,'rival'],
 ['Sfrutti la scia','reach',2,0,'self'],['Incollato al paraurti','reach',1,-1,'self']
];
const C_PREGARA = [
 ['Bravo, aiuti il prossimo','po',1],['Quando meno se lo aspettano','po',2],['Mi sembra giusto cosi','po',2],
 ['Beccato','po',-1],['Un piccolo sgarro, ti costa caro','po',-1],['Non puoi andare avanti sempre così','po',-2],
 ['Arriva bonifica dallo zio del Molise','money',250],['Ieri sera hai vinto a Poker','money',500],['Il tuo cane vince il primo premio','money',500],
 ['Arrivano le tasse arretrate','money',-250],['Arriva la multa per eccesso velocità','money',-500],['I debiti si pagano','money',-500],
 ['Arrivano gli sponsor','prizeUp',2],['La fortuna ti assiste','prizeUp',2],['Pareggiamo le cose','prizeDown',0.5],['Pareggiamo i conti','prizeDown',0.5],
 ['Anche gli altri puntano su di te','betUp',2],['Il broker ti fa un regalo','betUp',2],['La quota cala all\'ultimo','betDown',0.5],
 ['Il broker ti fa un regalo di compleanno','quota',1],['Il broker sbaglia a segnare la quota','quota',0.5],['Quota ricalcolata','quota',-1],['Stai antipatico al broker','quota',-0.5],
 ['Il capo officina ti deve un debito','discount',0.5],['Il figlio del capo officina ti salda il debito','discount',0.5],['Il meccanico ti fa un favore','discount',0.5],
 ['Durante la notte smonti il pezzo al tuo acerrimo rivale','smonta',0,2],['Commissioni furto ad un tuo rivale','smonta',2000,0],['Ogni azione ha una conseguenza','smonta',2000,1],
 ['Chiedi al figlio del proprietario di riaprire l\'officina','reopenAll',0],['Chiedi alla moglie del proprietario di riaprire l\'officina','reopenAll',0],['Il proprietario riapre l\'officina per tutti','reopenAll',0],['Serata di porte aperte in officina','reopenAll',0],['Notte di porte aperte in officina','reopenAll',0],
 ['Tour privato dell\'officina ti costerà caro','reopen',400],['Visita privata all\'officina','reopen',400],
 ['I debidi di gioco si pagano','reopenDebt',0],['Favori incrociati in officina','reopenDebt',0],
 ['Gara lampo','sprint',28],['Hai da fare stasera','sprint',34]
];
// Difese: eff 'defend', val=ambito ('ingara'|'pregara'|'both'), dur=1 se riflette
const C_DIFESA = [
 ['Riflessi felini','ingara',0],['Schivata all\'ultimo','ingara',0],['Sangue freddo','ingara',0],['Lo eviti in un lampo','ingara',0],['Colpo di reni','ingara',0],['Scarto secco','ingara',0],['Effetto specchio','ingara',1],
 ['Spalle coperte','pregara',0],['Soffiata in anticipo','pregara',0],['Niente ti scalfisce','pregara',0],['Sempre un passo avanti','pregara',0],['Talpa in officina','pregara',0],['Coperto su tutto','pregara',0],['Ritorno al mittente','pregara',1],
 ['Sesto senso','both',0],['Scudo totale','both',0]
];
// Polizia: [nome, kind('blocco'|'inseguimento'), size]. size = caselle del blocco (4/6/10), 0 per inseguimento.
// Entrano nel mazzo SOLO dal livello pista 2 in poi. "Girare subito": vanno giocate prima di proseguire.
const C_POLIZIA = [
 ['Pattuglia dietro la curva','blocco',4],['Controllo lampo','blocco',4],['Gazzella in agguato','blocco',4],['Lampeggianti all\'improvviso','blocco',4],['Soffiata alle volanti','blocco',4],
 ['Doppia volante di traverso','blocco',6],['Reparto mobile schierato','blocco',6],['La strada si chiude','blocco',6],
 ['Maxi-retata notturna','blocco',10],['Città blindata','blocco',10],
 ['Inseguimento a sirene spiegate','inseguimento',0],['Le volanti ti stanno addosso','inseguimento',0],['Elicottero in caccia','inseguimento',0]
];

/* ============================ UTIL ============================ */
function shuffle(a){ for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; }
function d6(){ return 1+Math.floor(Math.random()*6); }
function ini(n){ return (n||'?')[0].toUpperCase(); }
function makeDeck(){ const d=[]; C_INGARA.forEach(c=>d.push({cat:'ingara',nome:c[0],eff:c[1],val:c[2],dur:c[3],target:c[4]})); C_PREGARA.forEach(c=>d.push({cat:'pregara',nome:c[0],eff:c[1],val:c[2],costPO:c[3]})); C_DIFESA.forEach(c=>d.push({cat:'difesa',nome:c[0],eff:'defend',val:c[1],dur:c[2]})); return shuffle(d); }
function makePoliceDeck(){ return C_POLIZIA.map(c=>({cat:'polizia',nome:c[0],kind:c[1],size:c[2]})); }
function drawCard(G){
  if(!G.deck||!G.deck.length){ if(G.discard&&G.discard.length){ G.deck=shuffle(G.discard); G.discard=[]; } else { G.deck=makeDeck(); } }
  return G.deck.length ? G.deck.pop() : null;
}
function statVal(p,k){ return DB.valori[k][p.comp[k]]; }

/* ============================ STANZE ============================ */
const rooms = new Map();             // code -> room
const socketToRoom = new Map();      // socket.id -> code
function genCode(){ const c='ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let s; do{ s=''; for(let i=0;i<4;i++) s+=c[Math.floor(Math.random()*c.length)]; } while(rooms.has(s)); return s; }
function cleanName(x){x=String(x||'').replace(/[\r\n\t]+/g,' ').replace(/^ {2,}/,' ').replace(/ +$/,'');return x.slice(0,8)||'Giocatore';}
function freeColorIdx(room){ const used=new Set(room.G.players.map(p=>p.colorIdx)); for(let i=0;i<DB.colori.length;i++) if(!used.has(i)) return i; return -1; }
function playerBySocket(socket){ const code=socketToRoom.get(socket.id); if(!code) return null; const room=rooms.get(code); if(!room) return null; const p=room.G.players.find(x=>x.socketId===socket.id); return p?{room,p}:null; }

/* ============================ MOTORE ============================ */
function layoutTrack(cards){ let from=1; cards.forEach((c,i)=>{ c.len=DB.lunghezze[i]; c.from=from; c.to=from+c.len-1; from+=c.len; }); }
function newCardOfLevel(lvl){ const L=Math.min(lvl,DB.maxLevelRoads); const pool=ROADS[L]; return { ...pool[Math.floor(Math.random()*pool.length)], lvl:L }; }
function buildInitialTrack(G){
  const pool=shuffle(ROADS[1].map(c=>({...c,lvl:1})));
  const rett=pool.find(c=>c.t==='rettilineo'); const cards=[rett];
  pool.filter(c=>c!==rett).slice(0,4).forEach(c=>cards.push(c));
  layoutTrack(cards); G.track=cards; G.trackLevel=1;
}
function trackTopLevel(G){ return G.track[G.track.length-1].lvl; }
function segOf(G,sq){ const s=Math.max(1,sq); return G.track.find(c=>s>=c.from&&s<=c.to)||G.track[G.track.length-1]; }

function startGame(room){
  const G=room.G;
  G.players.forEach((p,i)=>{ p.roll=d6(); });
  G.diceOrder=[...G.players].sort((a,b)=>b.roll-a.roll||a.id-b.id).map(p=>p.id);
  G.pilotPool=shuffle(DB.piloti.map(p=>p.id));
  G.players.forEach((p,idx)=>{ p.pilot=null; p.drew=false; p.money=3000; p.po=0; p.comp={motore:0,cambio:0,sterzo:0,assetto:0,peso:0,nos:0}; p.lvlOwned={motore:[0],cambio:[0],sterzo:[0],assetto:[0],peso:[0],nos:[0]}; p.lastRank=idx; p.prevRank=idx; p.hand=[]; });
  G.deck=makeDeck(); G.discard=[];
  G.players.forEach(p=>{ for(let k=0;k<3;k++){ const card=drawCard(G); if(card) p.hand.push(card); } });
  G.round=0; room.started=true; G.policeUnlocked=false; G.blocks=[]; G.pendPolice=[]; G.bossPending=null;
  G.phase='reveal'; G.players.forEach(p=>{ p.ready=false; });
}
function restartGame(room){
  const G=room.G;
  if(room._botTimer){ clearTimeout(room._botTimer); room._botTimer=null; }
  room.started=false;
  G.phase='lobby';
  G.round=0; G.R=null; G.lastResults=null; G.winner=null;
  G.shop=[]; G.track=[]; G.pilotPool=null; G.deck=null; G.discard=[]; G.order=[]; G.diceOrder=[];
  G.players.forEach((p,i)=>{
    p.pilot=null; p.drew=false; p.ready=false;
    p.money=3000; p.po=0;
    p.comp={motore:0,cambio:0,sterzo:0,assetto:0,peso:0,nos:0};
    p.lvlOwned={motore:[0],cambio:[0],sterzo:[0],assetto:[0],peso:[0],nos:[0]};
    p.hand=[]; p.bet=null;
    p.lastRank=i; p.prevRank=i; p.roll=0;
  });
}
function actDrawPilot(room,p){
  const G=room.G; if(G.phase!=='reveal') return 'Non in fase di pesca.';
  if(p.drew) return 'Hai già pescato il pilota.';
  if(!G.pilotPool || !G.pilotPool.length) return 'Mazzo piloti esaurito.';
  const pid=G.pilotPool.pop(); p.pilot=DB.piloti.find(q=>q.id===pid); p.drew=true;
  return null;
}
function actReady(room,p){
  const G=room.G; if(G.phase!=='reveal') return 'Non in fase di rivelazione.';
  if(!p.drew) return 'Devi prima pescare il pilota.';
  p.ready=true;
  if(G.players.every(x=>x.ready)) startRound(room);
  return null;
}
function startRound(room){
  const G=room.G; G.round++;
  if(G.round===1) buildInitialTrack(G);
  if(G.round===1) G.order=[...G.diceOrder];
  else G.order=[...G.players].sort((a,b)=>b.lastRank-a.lastRank||a.id-b.id).map(p=>p.id);
  G.maxBuys=(G.round===1)?2:1;
  G.compMaxLevel=G.trackLevel;
  G.raceLevel=G.trackLevel;
  G.entryFee=DB.roadBasePrice[G.raceLevel];
  G.raceFirstRollDone=false;
  rebuildShop(room);
  G.ppIdx=0; G.phase='prep'; G.R=null; G.lastResults=null; G.reshop=false; G.reshopQueued=false; G.reshopFirst=null; G.sprintFinish=null;
  G.blocks=[]; G.pendPolice=[]; G.forfeitedBlocks=[];
  G.players.forEach(p=>{ p.bet=null; p.prizeMult=1; p.betMult=1; p.quotaMod=0; p.discountNext=false; p.incoming=[]; });
  curPrep(G).buysLeft=G.maxBuys;
}
function rebuildShop(room){
  const G=room.G; const N=G.players.length; const reveal=(G.round===1)?N*2:N; const bag=[];
  DB.ordine.forEach(comp=>{
    for(let lvl=1;lvl<=G.compMaxLevel;lvl++){
      let copies=(lvl<=3)?N:Math.max(0,N-1);   // stock per tipo: N ai liv. 1-3, N-1 ai liv. 4-5
      for(let k=0;k<copies;k++) bag.push({comp,lvl});
    }
  });
  shuffle(bag); G.shop=bag.slice(0,reveal);
}
function revealMore(room,n,maxLvl){
  const G=room.G; const N=G.players.length; const bag=[];
  DB.ordine.forEach(comp=>{
    for(let lvl=1;lvl<=maxLvl;lvl++){
      let copies=(lvl<=3)?N:Math.max(0,N-1);   // stock per tipo: N ai liv. 1-3, N-1 ai liv. 4-5
      for(let k=0;k<copies;k++) bag.push({comp,lvl});
    }
  });
  shuffle(bag); for(let k=0;k<n&&k<bag.length;k++) G.shop.push(bag[k]);
}
function pOrder(G){ return G.reshop?G.reshopOrder:G.order; }
function curPrep(G){ const o=pOrder(G); return G.players.find(p=>p.id===o[G.ppIdx]); }
function startReshop(room){
  const G=room.G;
  G.reshop=true; G.reshopQueued=false;
  const first=G.reshopFirst;
  G.reshopOrder=[first, ...G.order.filter(id=>id!==first)];
  G.ppIdx=0;
  revealMore(room, Math.max(4,G.players.length), G.compMaxLevel);   // officina riaperta: nuovi ricambi
  G.players.forEach(pp=>{ pp.buysLeft=0; });
  curPrep(G).buysLeft=1;
}
function buildCount(p,lvl){ return DB.ordine.filter(c=>p.comp[c]===lvl).length; }
function canHaveAtLevel(p,comp,lvl){
  if(lvl===4 && buildCount(p,4)>=3) return false;
  if(lvl===5){ if(buildCount(p,5)>=2) return false; if((comp==='motore'&&p.comp.peso===5)||(comp==='peso'&&p.comp.motore===5)) return false; }
  return true;
}
function priceFor(G,p,comp,lvl){ let price=DB.prezzi[comp][lvl]; if(lvl>p.comp[comp]+1) price*=2; if(p.discountNext) price=Math.round(price/2); return price; }

/* --- azioni preparazione --- */
function actBuy(room,p,shopIdx){
  const G=room.G; if(G.phase!=='prep'||curPrep(G).id!==p.id) return 'Non è il tuo turno.';
  const card=G.shop[shopIdx]; if(!card) return 'Carta non valida.';
  if(card.lvl<=p.comp[card.comp]) return 'Livello pari o inferiore.';
  if(card.lvl>G.compMaxLevel) return 'Livello non ancora sbloccato.';
  if(p.buysLeft<=0) return 'Acquisti finiti.';
  if(!canHaveAtLevel(p,card.comp,card.lvl)) return 'Tetto di costruzione raggiunto.';
  const price=priceFor(G,p,card.comp,card.lvl); if(p.money<price) return 'Denaro insufficiente.';
  p.money-=price; p.comp[card.comp]=card.lvl; if(p.lvlOwned&&!p.lvlOwned[card.comp].includes(card.lvl)) p.lvlOwned[card.comp].push(card.lvl); p.buysLeft--; p.discountNext=false; G.shop.splice(shopIdx,1); return null;
}
function pregaraTarget(c){ if(c.eff==='prizeDown'||c.eff==='betDown'||c.eff==='smonta'||c.eff==='reopenDebt') return 'rival'; if(c.eff==='quota') return c.val<0?'rival':'self'; if((c.eff==='money'||c.eff==='po')&&c.val<0) return 'rival'; return 'self'; }

/* ====================== DIFESE / MALUS ====================== */
function isDefense(c){ return !!c && c.eff==='defend'; }
function isReflect(c){ return isDefense(c) && (c.dur===1||c.costPO===1); }
function canDefend(c, m){ if(!isDefense(c)) return false; const s=c.val; return m.phase==='ingara' ? (s==='ingara'||s==='both') : (s==='pregara'||s==='both'); }
function malusLabel(m){
  if(m.eff==='vel') return (m.val>=0?'+':'')+m.val+' Velocità';
  if(m.eff==='ctrl') return (m.val>=0?'+':'')+m.val+' Controllo';
  if(m.eff==='partenza') return 'Partenza '+(m.val>=0?'+':'')+m.val;
  if(m.eff==='dado') return 'Dado truccato a '+m.val;
  if(m.eff==='money') return '−€'+Math.abs(m.val);
  if(m.eff==='po') return m.val+' Punti Onore';
  if(m.eff==='smonta') return 'Smonta '+((DB.nomi&&DB.nomi[m.comp])||m.comp||'pezzo');
  if(m.eff==='prizeDown') return 'Montepremi ÷2';
  if(m.eff==='betDown') return 'Scommessa ÷2';
  if(m.eff==='quota') return 'Quota '+m.val;
  return 'Malus';
}
function smontaBest(G, victim){
  let best=null;
  DB.ordine.forEach(cp=>{ if(victim.comp[cp]>0){ const vv=DB.valori[cp][victim.comp[cp]]; if(best===null||vv>best.vv) best={cp,vv}; } });
  if(!best) return null;
  const cp=best.cp, lv=victim.comp[cp];
  victim.lvlOwned[cp]=(victim.lvlOwned[cp]||[0]).filter(x=>x!==lv);
  if(!victim.lvlOwned[cp].length) victim.lvlOwned[cp]=[0];
  victim.comp[cp]=Math.max(...victim.lvlOwned[cp]);
  G.shop.push({comp:cp,lvl:lv});
  return {comp:cp,lvl:lv};
}
function recordMalus(room, attacker, target, m){
  const G=room.G;
  m.mid=(G.malusSeq=(G.malusSeq||0)+1);
  m.attackerId=attacker.id; m.attackerName=attacker.name;
  m.label=malusLabel(m);
  (target.incoming=target.incoming||[]).push(m);
  if(target.isBot) botMaybeDefend(room, target);
}
function revertMalus(G, t, m){
  switch(m.eff){
    case 'money': t.money=Math.max(0, t.money-(m.applied||0)); break;
    case 'po': t.po=Math.max(0, t.po-(m.applied||0)); break;
    case 'prizeDown': t.prizeMult=(t.prizeMult||1)/m.val; break;
    case 'betDown': t.betMult=(t.betMult||1)/m.val; break;
    case 'quota': t.quotaMod=(t.quotaMod||0)-m.val; break;
    case 'smonta': { const cp=m.comp, lv=m.lvl; if(cp!=null){ if(t.lvlOwned[cp]&&!t.lvlOwned[cp].includes(lv)) t.lvlOwned[cp].push(lv); t.comp[cp]=Math.max(...t.lvlOwned[cp]); const si=G.shop.findIndex(s=>s.comp===cp&&s.lvl===lv); if(si>=0) G.shop.splice(si,1); } break; }
    case 'vel': case 'ctrl': { const car=G.R&&G.R.cars[t.id]; if(car&&m.fxRef) car.fx=car.fx.filter(e=>e!==m.fxRef); break; }
    case 'partenza': { const car=G.R&&G.R.cars[t.id]; if(car) car.pendPart-=m.val; break; }
    case 'dado': { const car=G.R&&G.R.cars[t.id]; if(car) car.pendDado=(m.prevDado!==undefined?m.prevDado:null); break; }
  }
}
function reflectMalus(G, a, m){
  switch(m.eff){
    case 'money': a.money=Math.max(0, a.money+m.val); break;
    case 'po': a.po=Math.max(0, a.po+m.val); break;
    case 'prizeDown': a.prizeMult=(a.prizeMult||1)*m.val; break;
    case 'betDown': a.betMult=(a.betMult||1)*m.val; break;
    case 'quota': a.quotaMod=(a.quotaMod||0)+m.val; break;
    case 'smonta': smontaBest(G, a); break;
    case 'vel': case 'ctrl': { const car=G.R&&G.R.cars[a.id]; if(car) car.fx.push({stat:m.eff,amt:m.val,turns:m.dur}); break; }
    case 'partenza': { const car=G.R&&G.R.cars[a.id]; if(car) car.pendPart+=m.val; break; }
    case 'dado': { const car=G.R&&G.R.cars[a.id]; if(car) car.pendDado=m.val; break; }
  }
}
function incomingFor(player){
  return (player.incoming||[]).map(m=>({ mid:m.mid, label:m.label, by:m.attackerName,
    defenders: player.hand.map((c,i)=>({c,i})).filter(o=>canDefend(o.c,m)).map(o=>({ handIdx:o.i, nome:o.c.nome, reflect:isReflect(o.c) })) })).filter(x=>x.defenders.length>0);
}
function actDefend(room, p, handIdx, mid){
  const G=room.G;
  const m=(p.incoming||[]).find(x=>x.mid===mid); if(!m) return 'Quel malus non è più annullabile.';
  const c=p.hand[handIdx]; if(!isDefense(c)) return 'Carta difesa non valida.';
  if(!canDefend(c,m)) return 'Questa difesa non copre quel malus.';
  revertMalus(G, p, m);
  const reflect=isReflect(c);
  if(reflect){ const a=G.players.find(x=>x.id===m.attackerId) || (G.R&&G.R.police&&G.R.police.find(x=>x.id===m.attackerId)); if(a) reflectMalus(G, a, m); }
  p.incoming=(p.incoming||[]).filter(x=>x.mid!==mid);
  G.discard.push(c); p.hand.splice(handIdx,1);
  raceLog(G,{kind:'defend',who:p.name,nome:c.nome,reflect,by:m.attackerName});
  return null;
}
function botMaybeDefend(room, bot){
  const snap=(bot.incoming||[]).slice();
  for(const m of snap){
    if(!(bot.incoming||[]).some(x=>x.mid===m.mid)) continue;
    const opts=bot.hand.map((c,i)=>({c,i})).filter(o=>canDefend(o.c,m));
    if(!opts.length) continue;
    if(Math.random()>=0.6) continue;
    opts.sort((a,b)=>(isReflect(b.c)?1:0)-(isReflect(a.c)?1:0));
    actDefend(room, bot, opts[0].i, m.mid);
  }
}

function actPlayPregara(room,p,handIdx,targetId,comp){
  const G=room.G; if(G.phase!=='prep'||curPrep(G).id!==p.id) return 'Non è il tuo turno.';
  if(G.reshop) return 'Nel giro extra puoi solo comprare.';
  const c=p.hand[handIdx]; if(!c||c.cat!=='pregara') return 'Carta non valida.';
  if(c.eff==='defend') return 'Le difese si usano solo quando vieni colpito.';
  let tgt=p; let _ap=0,_comp=null,_lvl=null;
  if(pregaraTarget(c)==='rival'){ const t=G.players.find(x=>x.id===targetId && x.id!==p.id); if(!t) return 'Scegli un avversario valido.'; tgt=t; }
  if(c.eff==='smonta'){
    const cost=c.val||0;
    if(p.money<cost) return 'Ti servono €'+cost+' per giocarla.';
    if(!comp||tgt.comp[comp]==null) return 'Componente non valido.';
    if(tgt.comp[comp]<=0) return 'Quel pezzo è già al minimo.';
    const lvl=tgt.comp[comp]; _comp=comp; _lvl=lvl;
    tgt.lvlOwned[comp]=(tgt.lvlOwned[comp]||[0]).filter(x=>x!==lvl);   // tolgo il livello in cima
    if(!tgt.lvlOwned[comp].length) tgt.lvlOwned[comp]=[0];
    tgt.comp[comp]=Math.max(...tgt.lvlOwned[comp]);                    // torno al livello posseduto più alto rimasto
    G.shop.push({comp,lvl});              // il pezzo torna in officina
    p.money-=cost;                        // costo denaro
    if(c.costPO) p.po=Math.max(0,p.po-c.costPO); // costo Rispetto
  }
  else if(c.eff==='money'){ const _b=tgt.money; tgt.money=Math.max(0,tgt.money+c.val); _ap=tgt.money-_b; }
  else if(c.eff==='po'){ const _b=tgt.po; tgt.po=Math.max(0,tgt.po+c.val); _ap=tgt.po-_b; }
  else if(c.eff==='prizeUp'||c.eff==='prizeDown') tgt.prizeMult=(tgt.prizeMult||1)*c.val;
  else if(c.eff==='betUp'||c.eff==='betDown') tgt.betMult=(tgt.betMult||1)*c.val;
  else if(c.eff==='quota') tgt.quotaMod=(tgt.quotaMod||0)+c.val;
  else if(c.eff==='discount') tgt.discountNext=true;
  else if(c.eff==='reopen'){                                       // Tour privato: esclusiva, +1 acquisto, costa val
    const cost=c.val||0;
    if(p.money<cost) return 'Ti servono €'+cost+' per giocarla.';
    p.money-=cost;
    p.buysLeft=(p.buysLeft||0)+1;
    revealMore(room, Math.max(4,G.players.length), G.compMaxLevel);
  }
  else if(c.eff==='reopenAll'){                                    // Apri a tutti: giro condiviso dopo la prep
    if(!G.reshopQueued){ G.reshopQueued=true; G.reshopFirst=p.id; }
  }
  else if(c.eff==='reopenDebt'){
    p.buysLeft=(p.buysLeft||0)+1;                                  // +1 acquisto per chi gioca
    revealMore(room, Math.max(4,G.players.length), G.compMaxLevel);
    tgt.discountNext=true;                                         // il rivale scelto compra a metà prezzo
  }
  else if(c.eff==='sprint'){                                       // gara breve: traguardo a c.val, una sola per gara
    if(G.sprintFinish) return 'Un\'altra gara breve è già stata organizzata. Riprova la prossima.';
    G.sprintFinish=c.val;
  }
  if(pregaraTarget(c)==='rival' && c.eff!=='reopenDebt' && tgt.id!==p.id) recordMalus(room, p, tgt, {phase:'pregara', eff:c.eff, val:c.val, applied:_ap, comp:_comp, lvl:_lvl});
  G.discard.push(c); p.hand.splice(handIdx,1); return null;
}
/* ====================== POLIZIA ====================== */
function trackTotalCells(G){ return G.track[G.track.length-1].to; }
function blockPlaceable(G,size){ const total=trackTotalCells(G); for(let a=1;a+size-1<=total;a++){ const b=a+size-1; if(!(G.blocks||[]).some(bl=>!(b<bl.from||a>bl.to))) return true; } return false; }
function smontaCheapest(G, victim){
  let cheap=null;
  DB.ordine.forEach(cp=>{ if(victim.comp[cp]>0){ const pr=DB.prezzi[cp][victim.comp[cp]]; if(cheap===null||pr<cheap.pr) cheap={cp,pr}; } });
  if(!cheap) return null;
  const cp=cheap.cp, lv=victim.comp[cp];
  victim.lvlOwned[cp]=(victim.lvlOwned[cp]||[0]).filter(x=>x!==lv);
  if(!victim.lvlOwned[cp].length) victim.lvlOwned[cp]=[0];
  victim.comp[cp]=Math.max(...victim.lvlOwned[cp]);
  G.shop.push({comp:cp,lvl:lv});
  return {comp:cp,lvl:lv};
}
function actPlayPolice(room,p,handIdx,cell){
  const G=room.G; if(G.phase!=='prep'||curPrep(G).id!==p.id) return 'Non è il tuo turno.';
  if(G.reshop) return 'Nel giro extra puoi solo comprare.';
  const c=p.hand[handIdx]; if(!c||c.cat!=='polizia') return 'Carta non valida.';
  if(c.kind==='blocco'){
    const total=trackTotalCells(G); const size=c.size; const a=parseInt(cell,10);
    if(!a || a<1 || a+size-1>total) return 'Posizione del blocco non valida.';
    const b=a+size-1;
    if((G.blocks||[]).some(bl=>!(b<bl.from||a>bl.to))) return 'Si sovrappone a un altro blocco: scegli un\'altra casella.';
    (G.blocks=G.blocks||[]).push({from:a,to:b,size,by:p.id,byName:p.name});
  } else {
    (G.pendPolice=G.pendPolice||[]).push({by:p.id});
  }
  G.discard.push(c); p.hand.splice(handIdx,1); return null;
}
function throwPoliceMalus(room, attacker, target){
  const G=room.G;
  const pool=[['Sirene addosso','vel',-2,1],['Posto di blocco','ctrl',-2,1],['Inseguito da vicino','vel',-1,2],['Manovra brusca','partenza',-1,0],['Paletta alzata','dado',1,1]];
  const pick=pool[Math.floor(Math.random()*pool.length)];
  const eff=pick[1], val=pick[2], dur=pick[3];
  const tc=G.R.cars[target.id]; let _fx=null,_prevDado;
  if(eff==='vel'||eff==='ctrl'){ _fx={stat:eff,amt:val,turns:dur}; tc.fx.push(_fx); }
  else if(eff==='partenza') tc.pendPart+=val;
  else if(eff==='dado'){ _prevDado=tc.pendDado; tc.pendDado=val; }
  recordMalus(room, attacker, target, {phase:'ingara', eff, val, dur, fxRef:_fx, prevDado:_prevDado});
  raceLog(G,{kind:'police',who:attacker.name,target:target.name,nome:pick[0]});
}
function spawnPolice(room){
  const G=room.G; G.R.police=[]; if(!(G.pendPolice||[]).length) return;
  const lowestPart=Math.min(...G.players.map(p=>p.pilot.partenza));
  const firstLvl=G.track[0].lvl;                                  // livello della PRIMA strada in gioco
  G.pendPolice.forEach((pp,idx)=>{
    const id='POL'+idx; const comp={}, lvlOwned={};
    DB.ordine.forEach(cp=>{ comp[cp]=firstLvl; lvlOwned[cp]=[0]; for(let k=1;k<=firstLvl;k++) lvlOwned[cp].push(k); });
    const lowComp=DB.ordine[Math.floor(Math.random()*DB.ordine.length)];  // un pezzo a caso un livello in meno
    if(comp[lowComp]>0){ const nl=comp[lowComp]-1; comp[lowComp]=nl; lvlOwned[lowComp]=lvlOwned[lowComp].filter(x=>x<=nl); }
    if(firstLvl<2){ comp.nos=0; lvlOwned.nos=[0]; }               // NOS solo dal livello 2 in su
    const pol={ id, name:'Polizia'+(G.pendPolice.length>1?(' '+(idx+1)):''), comp, lvlOwned, partenza:lowestPart, isPolice:true };
    G.R.police.push(pol);
    G.R.cars[id]={ pos:0, firstDone:false, nosUsed:false, fx:[], pendDado:null, pendPart:0, pendReach:null };
  });
}
function spawnBosses(room){
  const G=room.G; G.R.bosses=[];
  const lowestPart=Math.min(...G.players.map(p=>p.pilot.partenza));
  function mkFoe(id,name,kind,allLvl,upLvl,reward){
    const comp={},lvlOwned={};
    DB.ordine.forEach(cp=>{ comp[cp]=allLvl; lvlOwned[cp]=[]; for(let k=0;k<=allLvl;k++) lvlOwned[cp].push(k); });
    if(upLvl!=null){ const rc=DB.ordine[Math.floor(Math.random()*DB.ordine.length)]; comp[rc]=upLvl; lvlOwned[rc]=[]; for(let k=0;k<=upLvl;k++) lvlOwned[rc].push(k); }
    const foe={ id, name, kind, comp, lvlOwned, partenza:lowestPart, reward };
    G.R.bosses.push(foe);
    G.R.cars[id]={ pos:0, firstDone:false, nosUsed:false, fx:[], pendDado:null, pendPart:0, pendReach:null };
  }
  // BOSS: se il round precedente ha completato un livello → tutte le stat al livello completato, una random a +1
  const bp=G.bossPending; G.bossPending=null;
  if(bp!=null){ mkFoe('BOSS','BOSS L'+bp,'boss',bp,Math.min(bp+1,G.compMaxLevel),2500); }
  // MINIBOSS: 25% per gara → tutte le stat al livello della gara in corso
  if(Math.random()<0.25){ mkFoe('MINI','MINIBOSS L'+G.raceLevel,'miniboss',G.raceLevel,null,1000); }
}
function computePoliceMove(G,pol,worstDie){
  const R=G.R; const car=R.cars[pol.id]; const first=!car.firstDone; const seg=segOf(G,Math.max(1,car.pos));
  const die=car.pendDado || worstDie;                             // un dado truccato riflesso ha la precedenza
  const mot=statVal(pol,'motore'),cam=statVal(pol,'cambio'),ste=statVal(pol,'sterzo'),ass=statVal(pol,'assetto'),pes=statVal(pol,'peso');
  const fxVel=fxSum(R,pol,'vel'),fxCtrl=fxSum(R,pol,'ctrl');
  let vel=mot+cam+fxVel, ctrl=ste+ass+fxCtrl;
  let total=mot+cam+ste+ass+pes+fxVel+fxCtrl+dieBonus(die);
  if(first) total+=pol.partenza;
  if(car.pendPart) total+=car.pendPart;
  let useNos=false;
  if(!car.nosUsed && !first && seg.t!=='drift' && statVal(pol,'nos')>0){ let nv=statVal(pol,'nos'); if(seg.t==='citta') nv=Math.max(0,nv-1); total+=nv; useNos=true; }
  if(seg.pv && vel>seg.pv.gt) total-=seg.pv.a;
  if(seg.pc && ctrl<seg.pc.lt) total-=seg.pc.a;
  if(total<0) total=0;
  return { total, die, useNos };
}
function movePolice(room){
  const G=room.G; const foes=[...(G.R.police||[]),...(G.R.bosses||[])]; if(!foes.length) return;
  const dice=G.R.turnDice||[]; const worst=dice.length?Math.min(...dice):d6();
  foes.forEach(foe=>{
    const car=G.R.cars[foe.id]; const b=computePoliceMove(G,foe,worst);
    if(b.useNos) car.nosUsed=true;
    car.firstDone=true;
    car.pos=Math.min(G.R.finish||55, car.pos+b.total);
    car.pendPart=0; car.pendDado=null;
    car.fx=car.fx.map(e=>({...e,turns:e.turns-1})).filter(e=>e.turns>0);
    raceLog(G,{kind:(foe.kind==='boss'||foe.kind==='miniboss')?'boss-move':'police-move',who:foe.name,mov:b.total,pos:car.pos});
  });
}

function actSetBet(room,p,targetId,amount){
  const G=room.G; if(G.phase!=='prep'||curPrep(G).id!==p.id) return 'Non è il tuo turno.';
  if(G.reshop) return 'Nel giro extra puoi solo comprare.';
  if(G.round<2) return 'Scommesse dal round 2.';
  if(targetId==null||!amount||amount<=0){ p.bet=null; return null; }
  if(!G.players.some(x=>x.id===targetId)) return 'Bersaglio non valido.';
  if(amount>p.money) return 'Importo superiore al denaro.';
  p.bet={ targetId, amount }; return null;
}
function actPrepDone(room,p){
  const G=room.G; if(G.phase!=='prep'||curPrep(G).id!==p.id) return 'Non è il tuo turno.';
  if(!G.reshop) for(let i=p.hand.length-1;i>=0;i--){ const c=p.hand[i]; if(c.cat==='polizia'&&c.kind==='blocco'&&!blockPlaceable(G,c.size)){ G.discard.push(c); p.hand.splice(i,1); (G.forfeitedBlocks=G.forfeitedBlocks||[]).push({who:p.name,nome:c.nome}); } } // blocco senza spazio: annullato
  if(!G.reshop && p.hand.some(c=>c.cat==='polizia')) return 'Devi prima giocare la carta polizia (gira subito).';
  if(!G.reshop && p.bet){ if(p.bet.amount>p.money){ p.bet=null; } else { p.money-=p.bet.amount; } }
  G.ppIdx++;
  const o=pOrder(G);
  if(G.ppIdx<o.length){ curPrep(G).buysLeft=G.reshop?1:G.maxBuys; }
  else if(!G.reshop && G.reshopQueued){ startReshop(room); }   // chiudi l'officina, riaprila a tutti
  else { G.reshop=false; startRace(room); }
  return null;
}

/* --- gara --- */
function startRace(room){
  const G=room.G;
  G.R={ turnOrder:[...G.order], turn:1, ptr:0, phase:'await', cars:{}, lastBreak:null, log:[], logId:0, finish:(G.sprintFinish||null), turnDice:[], police:[], blocks:(G.blocks||[]).slice() };
  G.players.forEach(p=>{ G.R.cars[p.id]={ pos:0, firstDone:false, nosUsed:false, fx:[], pendDado:null, pendPart:0, pendReach:null }; p.incoming=[]; });  // azzero incoming: finestra difese pre-gara chiusa
  const fee=DB.roadBasePrice[G.raceLevel]||0;                    // quota d'ingresso: la paga ogni giocatore
  G.players.forEach(p=>{ const paid=Math.min(p.money,fee); p.money=Math.max(0,p.money-fee); p._entryFee=paid; });
  raceLog(G,{kind:'fee',amount:fee});
  spawnPolice(room);                                            // auto della polizia (1 per carta inseguimento)
  spawnBosses(room);                                            // boss (su level-up) + miniboss (25%)
  if(G.R.police.length){ const attacker=G.R.police[0]; G.players.forEach(p=>throwPoliceMalus(room, attacker, p)); }  // 1 malus a testa (non si moltiplica con più auto)
  G.phase='race';
}
function activeRace(G){ return G.players.find(p=>p.id===G.R.turnOrder[G.R.ptr]); }
function dieBonus(d){ return d<=2?1:d<=5?2:3; }
function fxSum(R,p,stat){ return R.cars[p.id].fx.filter(e=>e.stat===stat).reduce((s,e)=>s+e.amt,0); }
function nosAllowed(G,p){ const car=G.R.cars[p.id]; const seg=segOf(G,Math.max(1,car.pos)); if(car.nosUsed) return false; if(!car.firstDone) return false; if(seg.t==='drift') return false; if(statVal(p,'nos')<=0) return false; return true; }

function computeMove(G,p,die,useNos){
  const R=G.R; const car=R.cars[p.id]; const first=!car.firstDone; const seg=segOf(G,Math.max(1,car.pos));
  if(car.pendReach){
    const ranked=G.players.map(x=>R.cars[x.id].pos).sort((a,b)=>b-a);   // classifica per posizione, decrescente
    const ref=Math.min(ranked.length, Math.max(1, car.pendReach.ref));  // 1 = primo, 2 = secondo
    let target=Math.max(0, Math.min(55, (ranked[ref-1]||0)+(car.pendReach.off||0)));
    const mov=Math.max(0, target-car.pos);                              // solo in avanti
    const lbl=(car.pendReach.ref===2&&car.pendReach.off===0)?'Carta · raggiungi il 2°':(car.pendReach.ref===1&&car.pendReach.off===-1)?'Carta · una casella dietro il 1°':'Carta · salto di posizione';
    return { lines:[{k:lbl,v:mov,cls:'pos'}], total:mov, die, db:0, useNos:false, segType:seg.t, vel:0, ctrl:0 };
  }
  const noPen = first && G.round===1 && !G.raceFirstRollDone && seg.t==='rettilineo';
  const mot=statVal(p,'motore'),cam=statVal(p,'cambio'),ste=statVal(p,'sterzo'),ass=statVal(p,'assetto'),pes=statVal(p,'peso');
  const fxVel=fxSum(R,p,'vel'),fxCtrl=fxSum(R,p,'ctrl');
  let vel=mot+cam+fxVel, ctrl=ste+ass+fxCtrl;
  let total=mot+cam+ste+ass+pes;
  const lines=[{k:'Base auto',v:mot+cam+ste+ass+pes}];
  if(fxVel){ total+=fxVel; lines.push({k:'Carte velocità',v:fxVel,cls:fxVel>0?'pos':'neg'}); }
  if(fxCtrl){ total+=fxCtrl; lines.push({k:'Carte controllo',v:fxCtrl,cls:fxCtrl>0?'pos':'neg'}); }
  const db=dieBonus(die); total+=db; lines.push({k:'Dado '+die,v:db,cls:'pos'});
  if(first){ total+=p.pilot.partenza; lines.push({k:'Partenza pilota',v:p.pilot.partenza,cls:'pos'}); }
  if(car.pendPart){ total+=car.pendPart; lines.push({k:'Carta partenza',v:car.pendPart,cls:car.pendPart>0?'pos':'neg'}); }
  if(!first && ['rettilineo','drift','citta'].includes(p.pilot.tipo) && p.pilot.tipo===seg.t){ total+=1; ctrl+=1; lines.push({k:'Abilità '+TIPO_LABEL[seg.t],v:1,cls:'pos'}); }
  if(first && p.pilot.tipo==='fortuna' && p.pilot.fortuna.includes(die)){ total+=2; vel+=2; lines.push({k:'Fortuna 1° tiro',v:2,cls:'pos'}); }
  if(useNos){ let nv=statVal(p,'nos'); if(seg.t==='citta') nv=Math.max(0,nv-1); const add=nv+(p.pilot.tipo==='nos'?4:0); total+=add; lines.push({k:'NOS'+(seg.t==='citta'?' (–1 città)':'')+(p.pilot.tipo==='nos'?' +4':''),v:add,cls:'nos'}); }
  if(!noPen){
    if(seg.pv && vel>seg.pv.gt){ total-=seg.pv.a; lines.push({k:'Pen. Drift (Vel '+vel+'>'+seg.pv.gt+')',v:-seg.pv.a,cls:'neg'}); }
    if(seg.pc && ctrl<seg.pc.lt){ total-=seg.pc.a; lines.push({k:'Pen. Controllo (Ctrl '+ctrl+'<'+seg.pc.lt+')',v:-seg.pc.a,cls:'neg'}); }
  }
  if(total<0){ lines.push({k:'Minimo',v:0,info:true}); total=0; }
  return { lines, total, die, db, useNos, segType:seg.t, vel, ctrl };
}

function raceLog(G,e){ if(!G.R)return; e.id=++G.R.logId; e.t=G.R.turn; G.R.log.push(e); if(G.R.log.length>60)G.R.log.shift(); }
function actRacePlayCard(room,p,handIdx,targetId){
  const G=room.G; if(G.phase!=='race') return 'Non in gara.';
  if(activeRace(G).id!==p.id) return 'Non è il tuo turno.';
  if(G.R.phase!=='await') return 'Hai già tirato.';
  const c=p.hand[handIdx]; if(!c||c.cat!=='ingara') return 'Carta non valida.';
  if(c.eff==='defend') return 'Le difese si usano solo quando vieni colpito.';
  let target=p, isFoe=false;
  if(c.target==='rival'){
    let t=G.players.find(x=>x.id===targetId && x.id!==p.id);
    if(!t){ t=(G.R.bosses||[]).find(b=>b.id===targetId); if(t) isFoe=true; }   // si può colpire boss/miniboss
    if(!t) return 'Scegli un rivale valido.'; target=t;
  }
  else if(targetId!=null && targetId!==p.id && G.players.length>2){ const t=G.players.find(x=>x.id===targetId); if(t) target=t; }
  if(c.eff==='reach') target=p;                          // catch-up: sempre su di sé, mai redirigibile
  const tc=G.R.cars[target.id];
  let _fx=null,_prevDado;
  if(c.eff==='vel'||c.eff==='ctrl'){ _fx={stat:c.eff,amt:c.val,turns:c.dur}; tc.fx.push(_fx); }
  else if(c.eff==='partenza') tc.pendPart+=c.val;
  else if(c.eff==='dado'){ _prevDado=tc.pendDado; tc.pendDado=c.val; }
  else if(c.eff==='reach') tc.pendReach={ref:c.val,off:c.dur};
  raceLog(G,{kind:'card',who:p.name,target:target.name,targetId:target.id,nome:c.nome,eff:c.eff,val:c.val,dur:c.dur});
  if(c.target==='rival' && target.id!==p.id && !isFoe) recordMalus(room, p, target, {phase:'ingara', eff:c.eff, val:c.val, dur:c.dur, fxRef:_fx, prevDado:_prevDado});  // i boss non si difendono
  G.discard.push(c); p.hand.splice(handIdx,1); return null;
}
function actRoll(room,p,useNos){
  const G=room.G; if(G.phase!=='race') return 'Non in gara.';
  if(activeRace(G).id!==p.id) return 'Non è il tuo turno.';
  if(G.R.phase!=='await') return 'Hai già tirato.';
  p.incoming=(p.incoming||[]).filter(m=>m.phase!=='ingara');   // finestra di difesa chiusa: ora il malus fa effetto
  const car=G.R.cars[p.id];
  const realNos = !!useNos && nosAllowed(G,p);
  const die = car.pendDado || d6();
  (G.R.turnDice=G.R.turnDice||[]).push(die);
  G.R.lastBreak = computeMove(G,p,die,realNos);
  G.R.phase='rolled';
  return null;
}
function actConfirmMove(room,p){
  const G=room.G; if(G.phase!=='race') return 'Non in gara.';
  if(activeRace(G).id!==p.id) return 'Non è il tuo turno.';
  if(G.R.phase!=='rolled') return 'Prima tira il dado.';
  const car=G.R.cars[p.id]; const b=G.R.lastBreak;
  if(b.useNos) car.nosUsed=true;
  car.firstDone=true; G.raceFirstRollDone=true;
  car.pos=Math.min(G.R.finish||55,car.pos+b.total);
  const onBlk=(G.R.blocks||[]).find(bl=>car.pos>=bl.from&&car.pos<=bl.to);
  if(onBlk && car.pos>0){ p.money=Math.max(0,p.money-500); raceLog(G,{kind:'fine',who:p.name,amount:500,pos:car.pos}); }
  raceLog(G,{kind:'move',who:p.name,seg:TIPO_LABEL[b.segType]||b.segType,mov:b.total,pos:car.pos,die:b.die});
  car.pendPart=0; car.pendDado=null; car.pendReach=null;
  car.fx=car.fx.map(e=>({...e,turns:e.turns-1})).filter(e=>e.turns>0);
  G.R.lastBreak=null; G.R.phase='await';
  G.R.ptr++;
  if(G.R.ptr>=G.R.turnOrder.length){
    movePolice(room);                       // la polizia si muove per ultima, col dado peggiore del turno
    G.R.turnDice=[];
    G.R.turn++; G.R.ptr=0;
    if(G.R.turn>5 || (G.R.finish && G.players.some(x=>G.R.cars[x.id].pos>=G.R.finish))){ endRace(room); }
  }
  return null;
}

function endRace(room){
  const G=room.G;
  const ranked=[...G.players].sort((a,b)=>G.R.cars[b.id].pos-G.R.cars[a.id].pos||Math.random()-0.5);
  const N=G.players.length; const base=DB.roadBasePrice[G.raceLevel];
  const maxPolPos=(G.R.police&&G.R.police.length)?Math.max(...G.R.police.map(pl=>G.R.cars[pl.id].pos)):-1;
  ranked.forEach((p,i)=>{
    const pos=G.R.cars[p.id].pos;
    const onBlock=(G.R.blocks||[]).some(b=>pos>=b.from&&pos<=b.to);
    const caught=(maxPolPos>=0)&&(pos<=maxPolPos);
    p._busted=onBlock||caught; p._bustReason=onBlock?'blocco':(caught?'polizia':null);
    p.prevRank=p.lastRank; p.lastRank=i; p._finalPos=i+1; p._betDelta=0; p._betWin=false; p._bossBonus=0; p._bossList=[];
    if(caught){ if(p.money>=1000){ p.money-=1000; } else { smontaCheapest(G,p); } } // multa inseguimento (o smonta)
    if(onBlock){ smontaCheapest(G,p); }                                              // fine gara sul blocco: smonta (il €500 è già stato pagato all'atterraggio)
    if(p._busted){ p._gainPO=0; p._gainMoney=0; }                                    // beccato: niente montepremi né PO
    else {
      const po=DB.premiPO[i]||0; let money=Math.max(base, Math.round(base*(DB.premiMult[i]||0)));
      money=Math.round(money*(p.prizeMult||1));
      p.po=Math.max(0,p.po+po); p.money+=money; p._gainPO=po; p._gainMoney=money;
    }
  });
  const winnerId=ranked[0].id;
  (G.R.bosses||[]).forEach(foe=>{
    const fpos=G.R.cars[foe.id].pos;
    ranked.forEach(p=>{ if(p._busted) return; if(G.R.cars[p.id].pos>fpos){ p.money+=foe.reward; p._bossBonus=(p._bossBonus||0)+foe.reward; (p._bossList=p._bossList||[]).push({kind:foe.kind,reward:foe.reward}); } });
  });
  G.players.forEach(p=>{
    if(p.bet && p.bet.targetId!=null && p.bet.amount>0){
      if(p._busted){ p._betDelta=-p.bet.amount; }                                    // beccato: niente vincita scommessa (perdi la posta)
      else {
        const t=G.players.find(x=>x.id===p.bet.targetId); const q=Math.max(0.5, DB.quoteScommessa[Math.min(7,t.prevRank)]+(p.quotaMod||0));
        if(p.bet.targetId===winnerId){ const payout=Math.round(p.bet.amount*q*(p.betMult||1)); p.money+=p.bet.amount+payout; p._betDelta=payout; p._betWin=true; }
        else { p._betDelta=-p.bet.amount; }
      }
    }
    p.bet=null;
  });
  G.players.forEach(p=>{ while(p.hand.length<5){ const card=drawCard(G); if(!card) break; p.hand.push(card); } });
  const racedLevels=G.track.map(c=>c.lvl);
  advanceTrack(room);
  G.lastTrackInfo={ racedLevels, change:G.lastTrackChange };
  G.winner = G.players.some(p=>p.po>=DB.obiettivo) ? [...G.players].sort((a,b)=>b.po-a.po||b.money-a.money)[0] : null;
  G.lastResults = ranked.map(p=>({ id:p.id, name:p.name, colorH:DB.colori[p.colorIdx].h, pos:p._finalPos, cell:G.R.cars[p.id].pos, po:p._gainPO, money:p._gainMoney, betDelta:p._betDelta, busted:!!p._busted, bustReason:p._bustReason||null, bossBonus:p._bossBonus||0, bossList:p._bossList||[] }));
  G.lastRaceRecap = {
    quota: base,
    blocks: (G.R.blocks||[]).map(b=>({from:b.from,to:b.to,size:b.size})),
    police: (G.R.police||[]).map(pl=>({name:pl.name, pos:G.R.cars[pl.id].pos})),
    bosses: (G.R.bosses||[]).map(b=>({name:b.name, kind:b.kind, reward:b.reward, pos:G.R.cars[b.id].pos, beatenBy: ranked.filter(p=>!p._busted && G.R.cars[p.id].pos>G.R.cars[b.id].pos).map(p=>p.name)})),
    busted: ranked.filter(p=>p._busted).map(p=>({name:p.name, reason:p._bustReason})),
    forfeited: (G.forfeitedBlocks||[]).map(f=>({who:f.who,nome:f.nome}))
  };
  G.phase = G.winner ? 'win' : 'results';
}
function advanceTrack(room){
  const G=room.G;
  const L=G.trackLevel;
  const crossed=G.players.map(p=>{ const pos=G.R.cars[p.id].pos; return G.track.filter(c=>c.to<=pos).length; });
  const passedAll=Math.min(...crossed);
  let change={ passedAll, addedCount:0, oldLevel:L, newLevel:L, advanced:false };
  if(passedAll>=1){
    const removed=G.track.slice(0,passedAll);
    const maxPassed=removed.filter(c=>c.lvl>=L).length;          // strade del livello MASSIMO superate da tutti
    const advance=(maxPassed>=2)&&(L<DB.maxLevelRoads);          // si sale solo superando >=2 strade del livello max
    if(advance) G.trackLevel=L+1;
    if(advance) G.bossPending=L;                                 // boss per il livello appena completato (appare nella gara dopo)
    const fillLvl=advance?(L+1):L;                               // se non si sale, si riempie col livello max attuale
    G.track=G.track.slice(passedAll);
    for(let k=0;k<passedAll;k++) G.track.push(newCardOfLevel(fillLvl));
    change.addedCount=passedAll; change.newLevel=G.trackLevel; change.advanced=advance;
  }
  layoutTrack(G.track);
  G.lastTrackChange=change;
  if(!G.policeUnlocked && G.trackLevel>=2){ G.policeUnlocked=true; G.deck=shuffle((G.deck||[]).concat(makePoliceDeck())); change.policeUnlocked=true; }
}
function actNextRound(room,p){
  const G=room.G; if(G.phase!=='results') return 'Non disponibile ora.';
  if(p.id!==room.hostId) return 'Solo l\'host avvia la gara.';
  startRound(room); return null;
}

/* ============================ VISTE ============================ */
function publicPlayers(G,duringRace){
  return G.players.map(p=>({
    id:p.id, name:p.name, colorH:DB.colori[p.colorIdx].h, po:p.po, connected:p.connected,
    pos: duringRace ? G.R.cars[p.id].pos : null,
    pilot: p.pilot?{ nome:p.pilot.nome, gang:p.pilot.gang, tipo:p.pilot.tipo, tipoLabel:(TIPO_LABEL[p.pilot.tipo]||(p.pilot.tipo==='fortuna'?'Fortuna':'NOS')), ab:p.pilot.ab, partenza:p.pilot.partenza }:null,
    car: p.pilot?{ stats:statsOf(p), owned:ownedView(p) }:null
  }));
}
function trackView(G){
  return G.track.map(c=>{
    const pen=[];
    if(c.pv) pen.push({stat:'Velocità', cmp:'>', thr:c.pv.gt, amt:c.pv.a});
    if(c.pc) pen.push({stat:'Controllo', cmp:'<', thr:c.pc.lt, amt:c.pc.a});
    return { t:c.t, label:TIPO_LABEL[c.t], lvl:c.lvl, from:c.from, to:c.to, pen };
  });
}
function statsOf(p){
  const vel=statVal(p,'motore')+statVal(p,'cambio'), ctrl=statVal(p,'sterzo')+statVal(p,'assetto');
  return { vel, ctrl, mov:vel+ctrl+statVal(p,'peso'), nos:statVal(p,'nos') };
}
function ownedView(p){ return DB.ordine.map(c=>{ const cur=p.comp[c]; const own=((p.lvlOwned&&p.lvlOwned[c])||[0]).slice().sort((a,b)=>a-b); const down=own.length>=2?own[own.length-2]:0; return { comp:c, name:DB.nomi[c], lvl:cur, val:DB.valori[c][cur], down }; }); }

function buildView(room, player){
  const G=room.G;
  const v={ phase:G.phase, code:room.code, round:G.round||0,
    you:{ id:player.id, name:player.name, colorH:DB.colori[player.colorIdx].h, isHost:player.id===room.hostId },
  };
  if(G.phase==='lobby'){
    v.players=G.players.map(p=>({ id:p.id, name:p.name, colorH:DB.colori[p.colorIdx].h, isHost:p.id===room.hostId, isBot:!!p.isBot, connected:p.connected }));
    v.canStart = (player.id===room.hostId) && G.players.length>=2;
    v.canAddBot = (player.id===room.hostId) && G.players.length<8;
    return v;
  }
  if(G.phase==='reveal'){
    v.players=G.players.map(p=>({ id:p.id, name:p.name, colorH:DB.colori[p.colorIdx].h, ready:p.ready, drew:p.drew, connected:p.connected }));
    v.readyCount=G.players.filter(p=>p.ready).length;
    v.total=G.players.length;
    const p=player;
    v.reveal={
      drawn:p.drew,
      deckSize:(G.pilotPool?G.pilotPool.length:0),
      pilot:p.drew?{ nome:p.pilot.nome, gang:p.pilot.gang, tipo:p.pilot.tipo, tipoLabel:(TIPO_LABEL[p.pilot.tipo]||(p.pilot.tipo==='fortuna'?'Fortuna':'NOS')), ab:p.pilot.ab, partenza:p.pilot.partenza }:null,
      roll:p.roll,
      startPos:G.diceOrder.indexOf(p.id)+1,
      ready:p.ready,
      hand:p.hand.map(c=>({ cat:c.cat, nome:c.nome, eff:c.eff, val:c.val, dur:c.dur, target:c.target, costPO:c.costPO }))
    };
    return v;
  }
  v.players=publicPlayers(G, G.phase==='race');
  v.allBets = G.players.filter(p=>p.bet && p.bet.targetId!=null && p.bet.amount>0).map(p=>({ playerId:p.id, targetId:p.bet.targetId, amount:p.bet.amount }));
  v.raceLevel=G.raceLevel; v.entryFee=G.entryFee;
  v.incoming = incomingFor(player);
  v.myDefenses = (player.hand||[]).filter(c=>isDefense(c)).map(c=>({ nome:c.nome, scope:c.val, reflect:isReflect(c) }));

  if(G.phase==='prep'){
    const active=curPrep(G); v.activeId=active.id; v.activeName=active.name; v.isYourTurn=active.id===player.id;
    v.reshop=!!G.reshop; v.reshopComing=(!G.reshop && !!G.reshopQueued);
    v.sprintFinish=(G.sprintFinish||null);
    v.incoming=incomingFor(player);
    v.compMaxLevel=G.compMaxLevel;
    v.policeWaiting=G.players.filter(x=>(x.hand||[]).some(c=>c.cat==='polizia')).map(x=>x.name);
    v.pendBlocks=(G.blocks||[]).map(b=>({from:b.from,to:b.to,size:b.size,byName:b.byName}));
    v.trackTotal=trackTotalCells(G);
    if(v.isYourTurn){
      const p=player;
      v.policeHand=p.hand.map((c,idx)=>({c,idx})).filter(o=>o.c.cat==='polizia').map(o=>({idx:o.idx,nome:o.c.nome,kind:o.c.kind,size:o.c.size}));
      v.mustPlayPolice=p.hand.some(c=>c.cat==='polizia');
      v.track=trackView(G);
      v.me={ money:p.money, po:p.po, buysLeft:p.buysLeft, stats:statsOf(p), owned:ownedView(p), handCount:p.hand.length, prizeMult:(p.prizeMult||1), betMult:(p.betMult||1), quotaMod:(p.quotaMod||0), discount:!!p.discountNext };
      v.shop=G.shop.map((card,idx)=>{
        const cur=p.comp[card.comp]; const usable=card.lvl>cur && card.lvl<=G.compMaxLevel; const okLimit=canHaveAtLevel(p,card.comp,card.lvl);
        const price=priceFor(G,p,card.comp,card.lvl); const skip=card.lvl>cur+1;
        let reason=''; if(!usable) reason=card.lvl<=cur?'livello pari/inferiore':'oltre il livello sbloccato'; else if(!okLimit) reason='tetto raggiunto';
        return { idx, comp:card.comp, name:DB.nomi[card.comp], lvl:card.lvl, val:DB.valori[card.comp][card.lvl], cur, price, skip,
          buyable: usable && okLimit && p.buysLeft>0 && p.money>=price, reason };
      });
      v.pregara = G.reshop ? [] : p.hand.map((c,idx)=>({ idx, cat:c.cat, nome:c.nome, eff:c.eff, val:c.val, target:pregaraTarget(c), costPO:(c.costPO||0) })).filter(c=>c.cat==='pregara' && c.eff!=='defend');
      v.canBet = !G.reshop && G.round>=2;
      if(v.canBet){
        v.betTargets=G.players.map(t=>({ id:t.id, name:t.name, colorH:DB.colori[t.colorIdx].h, quote:Math.max(0.5, DB.quoteScommessa[Math.min(7,t.lastRank)]+(p.quotaMod||0)), you:t.id===p.id }));
        v.myBet=p.bet?{ targetId:p.bet.targetId, amount:p.bet.amount }:null;
      }
    }
    return v;
  }

  if(G.phase==='race'){
    const R=G.R; const active=activeRace(G); v.activeId=active.id; v.activeName=active.name; v.isYourTurn=active.id===player.id;
    v.turn=R.turn; v.track=trackView(G); v.cars=G.players.map(p=>({ id:p.id, name:p.name, colorH:DB.colori[p.colorIdx].h, ini:ini(p.name), pos:R.cars[p.id].pos }));
    v.blocks=(R.blocks||[]).map(b=>({from:b.from,to:b.to,size:b.size,byName:b.byName}));
    v.police=(R.police||[]).map(pl=>({ id:pl.id, name:pl.name, pos:R.cars[pl.id].pos, stats:statsOf(pl) }));
    v.bosses=(R.bosses||[]).map(b=>({ id:b.id, name:b.name, kind:b.kind, pos:R.cars[b.id].pos, reward:b.reward, stats:statsOf(b) }));
    v.siren=((R.police&&R.police.length>0)||(R.blocks&&R.blocks.length>0));
    v.sprintFinish=(R.finish||null);
    v.incoming=incomingFor(player);
    v.log=R.log.slice(-25).map(e=>({...e}));
    if(v.isYourTurn){
      const p=player; const car=R.cars[p.id]; const seg=segOf(G,Math.max(1,car.pos));
      const fxVel=fxSum(R,p,'vel'),fxCtrl=fxSum(R,p,'ctrl');
      v.me={
        pilotNome:p.pilot.nome, gang:p.pilot.gang, ab:p.pilot.ab, pilotTipo:p.pilot.tipo, pilotTipoLabel:(TIPO_LABEL[p.pilot.tipo]||(p.pilot.tipo==='fortuna'?'Fortuna':'NOS')), partenza:p.pilot.partenza,
        vel:statVal(p,'motore')+statVal(p,'cambio')+fxVel, ctrl:statVal(p,'sterzo')+statVal(p,'assetto')+fxCtrl,
        mov:statVal(p,'motore')+statVal(p,'cambio')+statVal(p,'sterzo')+statVal(p,'assetto')+statVal(p,'peso'),
        segType:seg.t, segLabel:TIPO_LABEL[seg.t], firstDone:car.firstDone,
        nosOk:nosAllowed(G,p), nosVal:statVal(p,'nos'),
        fx:car.fx.map(e=>({stat:e.stat,amt:e.amt,turns:e.turns})), pendPart:car.pendPart, pendDado:car.pendDado,
        hand:p.hand.map((c,idx)=>({idx,cat:c.cat,nome:c.nome,eff:c.eff,val:c.val,dur:c.dur,target:c.target})).filter(c=>c.cat==='ingara' && c.eff!=='defend'),
        rivals:[...G.players.filter(x=>x.id!==p.id).map(x=>({id:x.id,name:x.name,colorH:DB.colori[x.colorIdx].h})), ...(R.bosses||[]).map(b=>({id:b.id,name:b.name,colorH:b.kind==='boss'?'#ff3b3b':'#ffa733',isFoe:true,kind:b.kind}))]
      };
      v.rolled = R.phase==='rolled' ? (function(){ const b=R.lastBreak; return { lines:b.lines, total:b.total, die:b.die, db:b.db, useNos:b.useNos, np:Math.min(R.finish||55,car.pos+b.total) }; })() : null;
    }
    return v;
  }

  if(G.phase==='results' || G.phase==='win'){
    v.results=G.lastResults;
    v.trackInfo=G.lastTrackInfo;
    v.raceRecap=G.lastRaceRecap;
    v.champ=[...G.players].sort((a,b)=>b.po-a.po||b.money-a.money).map(p=>({ id:p.id, name:p.name, colorH:DB.colori[p.colorIdx].h, po:p.po, money:p.money }));
    v.youMoney=player.money;
    v.canNext=(player.id===room.hostId);
    if(G.winner) v.winner={ name:G.winner.name, pilot:G.winner.pilot.nome, gang:G.winner.pilot.gang, po:G.winner.po };
    return v;
  }
  return v;
}
function broadcast(room){
  room.G.players.forEach(p=>{ if(p.socketId){ const s=io.sockets.sockets.get(p.socketId); if(s) s.emit('state', buildView(room,p)); } });
}

/* ============================ BOT (gioco contro il PC) ============================ */
function botPending(room){
  const G=room.G; if(!room.started) return false;
  if(G.phase==='reveal') return G.players.some(p=>p.isBot && !p.ready);
  if(G.phase==='prep') return curPrep(G).isBot;
  if(G.phase==='race') return activeRace(G).isBot;
  return false;
}
function botPrep(room,bot){
  const G=room.G;
  // 0) carte polizia (gira subito, obbligatorie)
  if(!G.reshop) for(let i=bot.hand.length-1;i>=0;i--){ const c=bot.hand[i]; if(c.cat!=='polizia') continue;
    if(c.kind==='blocco'){ const total=trackTotalCells(G); const size=c.size; let placed=false;
      for(let s=Math.max(1,Math.floor(total/2)-size); s>=1 && !placed; s--){ const a=s,b=s+size-1; if(b<=total && !(G.blocks||[]).some(bl=>!(b<bl.from||a>bl.to))){ if(!actPlayPolice(room,bot,i,s)) placed=true; } }
      for(let s=1; s<=total-size+1 && !placed; s++){ if(!actPlayPolice(room,bot,i,s)) placed=true; }
    } else { actPlayPolice(room,bot,i); }
  }
  // 1) carte pre-gara PRIMA di comprare (saltate nel giro extra)
  if(!G.reshop) for(let i=bot.hand.length-1;i>=0;i--){ const c=bot.hand[i]; if(c.cat!=='pregara')continue;
    if(c.eff==='smonta'){ if(bot.money>=(c.val||0)){ let best=null; G.players.filter(x=>x.id!==bot.id).forEach(r=>{ DB.ordine.forEach(cp=>{ if(r.comp[cp]>0){ const vv=DB.valori[cp][r.comp[cp]]; if(best===null||vv>best.vv) best={rid:r.id,comp:cp,vv}; } }); }); if(best) actPlayPregara(room,bot,i,best.rid,best.comp); } continue; }
    if(c.eff==='reopen'){ if(bot.money>=(c.val||0)+500) actPlayPregara(room,bot,i); continue; }
    if(c.eff==='reopenAll'){ actPlayPregara(room,bot,i); continue; }
    if(c.eff==='reopenDebt'){ const tg=[...G.players].filter(x=>x.id!==bot.id).sort((a,b)=>a.po-b.po)[0]; if(tg) actPlayPregara(room,bot,i,tg.id); continue; }
    const self=(c.eff==='money'&&c.val>0)||(c.eff==='po'&&c.val>0)||c.eff==='prizeUp'||c.eff==='betUp'||c.eff==='discount'||(c.eff==='quota'&&c.val>0); const rival=(c.val<0)||c.eff==='prizeDown'||c.eff==='betDown'; if(self) actPlayPregara(room,bot,i); else if(rival){ const tg=[...G.players].filter(x=>x.id!==bot.id).sort((a,b)=>b.po-a.po)[0]; if(tg) actPlayPregara(room,bot,i,tg.id); } }
  // 2) acquisti
  let safety=12;
  while(bot.buysLeft>0 && safety-->0){
    const opts=G.shop.map((card,idx)=>({card,idx})).filter(o=>{
      const c=o.card, cur=bot.comp[c.comp];
      if(c.lvl<=cur || c.lvl>G.compMaxLevel) return false;
      if(!canHaveAtLevel(bot,c.comp,c.lvl)) return false;
      return priceFor(G,bot,c.comp,c.lvl) <= bot.money-400;
    });
    if(!opts.length) break;
    const w={motore:3,cambio:3,sterzo:3,assetto:3,nos:2,peso:2};
    opts.sort((a,b)=>{
      const ga=(DB.valori[a.card.comp][a.card.lvl]-DB.valori[a.card.comp][bot.comp[a.card.comp]])*(w[a.card.comp]||1);
      const gb=(DB.valori[b.card.comp][b.card.lvl]-DB.valori[b.card.comp][bot.comp[b.card.comp]])*(w[b.card.comp]||1);
      return gb-ga;
    });
    if(actBuy(room,bot,opts[0].idx)) break;
  }
  actPrepDone(room,bot);
}
function botRace(room,bot){
  const G=room.G, R=G.R;
  if(R.phase==='await'){
    const reachC=bot.hand.map((c,i)=>({c,i})).filter(o=>o.c.cat==='ingara'&&o.c.eff==='reach');
    const behind=G.players.some(p=>p.id!==bot.id&&R.cars[p.id].pos>R.cars[bot.id].pos);
    const selfPos=bot.hand.map((c,i)=>({c,i})).filter(o=>o.c.cat==='ingara'&&o.c.target==='self'&&(o.c.eff==='vel'||o.c.eff==='ctrl')&&o.c.val>0);
    const rivalNeg=bot.hand.map((c,i)=>({c,i})).filter(o=>o.c.cat==='ingara'&&o.c.target==='rival');
    if(reachC.length && behind && Math.random()<0.5) actRacePlayCard(room,bot,reachC[0].i);
    else if(selfPos.length && Math.random()<0.45) actRacePlayCard(room,bot,selfPos[0].i);
    else if(rivalNeg.length && Math.random()<0.5){ const lead=[...G.players].filter(p=>p.id!==bot.id).sort((a,b)=>R.cars[b.id].pos-R.cars[a.id].pos)[0]; if(lead) actRacePlayCard(room,bot,rivalNeg[0].i,lead.id); }
    actRoll(room,bot, nosAllowed(G,bot)&&Math.random()<0.5);
    actConfirmMove(room,bot);
  } else if(R.phase==='rolled') actConfirmMove(room,bot);
}
function botAct(room){
  const G=room.G;
  if(G.phase==='reveal'){ G.players.forEach(p=>{ if(p.isBot){ if(!p.drew && G.pilotPool && G.pilotPool.length){ const pid=G.pilotPool.pop(); p.pilot=DB.piloti.find(q=>q.id===pid); p.drew=true; } p.ready=true; } }); if(G.players.every(p=>p.ready)) startRound(room); return; }
  if(G.phase==='prep'){ const b=curPrep(G); if(b.isBot) botPrep(room,b); return; }
  if(G.phase==='race'){ const b=activeRace(G); if(b.isBot) botRace(room,b); return; }
}
function scheduleBot(room){
  if(room._botTimer || !botPending(room)) return;
  room._botTimer=setTimeout(()=>{
    room._botTimer=null;
    try{ botAct(room); }catch(e){ console.error('bot error', e); }
    broadcast(room);
    scheduleBot(room);
  }, room._botDelay || (+process.env.BOT_DELAY || 700));
}

/* ============================ SOCKET ============================ */
io.on('connection', (socket)=>{

  socket.on('createRoom', ({name,colorIdx}, cb)=>{
    const code=genCode();
    const room={ code, hostId:0, started:false, G:{ phase:'lobby', players:[], nextId:0 } };
    const p={ id:0, socketId:socket.id, name:cleanName(name), colorIdx: (colorIdx>=0&&colorIdx<8)?colorIdx:0, connected:true };
    room.G.players.push(p); room.G.nextId=1; room.hostId=0;
    rooms.set(code, room); socketToRoom.set(socket.id, code); socket.join(code);
    if(cb) cb({ ok:true, code, youId:0 });
    broadcast(room);
  });

  socket.on('joinRoom', ({code,name,colorIdx}, cb)=>{
    code=(code||'').toUpperCase().trim();
    const room=rooms.get(code);
    if(!room){ if(cb) cb({ ok:false, error:'Stanza inesistente.' }); return; }
    if(room.started){
      // tentativo di rientro per nome
      const ex=room.G.players.find(x=>x.name.toLowerCase()===cleanName(name).toLowerCase());
      if(ex){ ex.socketId=socket.id; ex.connected=true; socketToRoom.set(socket.id, code); socket.join(code); if(cb) cb({ ok:true, code, youId:ex.id, rejoined:true }); broadcast(room); return; }
      if(cb) cb({ ok:false, error:'Partita già iniziata.' }); return;
    }
    if(room.G.players.length>=8){ if(cb) cb({ ok:false, error:'Stanza piena (max 8).' }); return; }
    let ci=(colorIdx>=0&&colorIdx<8)?colorIdx:freeColorIdx(room);
    if(room.G.players.some(x=>x.colorIdx===ci)){ ci=freeColorIdx(room); }
    if(ci<0){ if(cb) cb({ ok:false, error:'Nessun colore libero.' }); return; }
    const id=room.G.nextId++;
    const p={ id, socketId:socket.id, name:cleanName(name), colorIdx:ci, connected:true };
    room.G.players.push(p); socketToRoom.set(socket.id, code); socket.join(code);
    if(cb) cb({ ok:true, code, youId:id });
    broadcast(room);
  });

  socket.on('setColor', ({colorIdx})=>{
    const f=playerBySocket(socket); if(!f||f.room.started) return;
    if(colorIdx<0||colorIdx>=8) return;
    if(f.room.G.players.some(x=>x.colorIdx===colorIdx && x.id!==f.p.id)) return;
    f.p.colorIdx=colorIdx; broadcast(f.room);
  });

  socket.on('addBot', ()=>{
    const f=playerBySocket(socket); if(!f||f.room.started) return; const {room,p}=f;
    if(p.id!==room.hostId || room.G.players.length>=8) return;
    const ci=freeColorIdx(room); if(ci<0) return;
    room._botN=(room._botN||0)+1;
    room.G.players.push({ id:room.G.nextId++, socketId:null, name:'CPU '+room._botN, colorIdx:ci, connected:true, isBot:true });
    broadcast(room);
  });
  socket.on('removeBot', ({id})=>{
    const f=playerBySocket(socket); if(!f||f.room.started) return; const {room,p}=f;
    if(p.id!==room.hostId) return;
    const t=room.G.players.find(x=>x.id===id && x.isBot); if(!t) return;
    room.G.players=room.G.players.filter(x=>x.id!==id);
    broadcast(room);
  });

  socket.on('startGame', ()=>{
    const f=playerBySocket(socket); if(!f) return; const {room,p}=f;
    if(p.id!==room.hostId || room.started || room.G.players.length<2) return;
    startGame(room); broadcast(room); scheduleBot(room);
  });

  socket.on('restartGame', ()=>{
    const f=playerBySocket(socket); if(!f) return; const {room,p}=f;
    if(p.id!==room.hostId) return;
    restartGame(room); broadcast(room);
  });

  function handle(fn){ return (payload)=>{ const f=playerBySocket(socket); if(!f) return; const err=fn(f.room,f.p,payload||{}); if(err) socket.emit('errorMsg', err); broadcast(f.room); scheduleBot(f.room); }; }

  socket.on('setup:drawPilot', handle((room,p)=>actDrawPilot(room,p)));
  socket.on('setup:ready', handle((room,p)=>actReady(room,p)));
  socket.on('prep:buy', handle((room,p,d)=>actBuy(room,p,d.shopIdx)));
  socket.on('prep:playCard', handle((room,p,d)=>actPlayPregara(room,p,d.handIdx,d.targetId,d.comp)));
  socket.on('prep:police', handle((room,p,d)=>actPlayPolice(room,p,d.handIdx,d.cell)));
  socket.on('prep:bet', handle((room,p,d)=>actSetBet(room,p,d.targetId,d.amount)));
  socket.on('prep:done', handle((room,p)=>actPrepDone(room,p)));
  socket.on('race:playCard', handle((room,p,d)=>actRacePlayCard(room,p,d.handIdx,d.targetId)));
  socket.on('race:roll', handle((room,p,d)=>actRoll(room,p,d.useNos)));
  socket.on('race:move', handle((room,p)=>actConfirmMove(room,p)));
  socket.on('defend', handle((room,p,d)=>actDefend(room,p,d.handIdx,d.mid)));
  socket.on('defense:play', handle((room,p,d)=>actDefend(room,p,d.handIdx,d.mid)));
  socket.on('results:next', handle((room,p)=>actNextRound(room,p)));

  socket.on('disconnect', ()=>{
    const f=playerBySocket(socket); socketToRoom.delete(socket.id);
    if(!f) return; const {room,p}=f;
    p.connected=false; p.socketId=null;
    if(!room.started){
      // in lobby: rimuovi il giocatore
      room.G.players=room.G.players.filter(x=>x.id!==p.id);
      if(room.G.players.length===0 || !room.G.players.some(x=>!x.isBot)){ rooms.delete(room.code); return; }
      if(p.id===room.hostId){ room.hostId=room.G.players.find(x=>!x.isBot).id; }
    }
    broadcast(room);
  });
});

module.exports = { DB, startGame, startRound, actReady, curPrep, activeRace, actBuy, actPlayPregara, actPlayPolice, actSetBet, actPrepDone, actRacePlayCard, actRoll, actConfirmMove, actNextRound, buildView, botAct, botPending, actDefend, incomingFor };

const PORT = process.env.PORT || 3000;
server.listen(PORT, ()=>console.log('2FAST4U server in ascolto sulla porta '+PORT));
