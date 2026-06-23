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
 ['Ti prendooooo!!!!','ctrl',1,1,'self'],['Hai istallato le nuove sospensioni','ctrl',1,1,'self'],['Il nuovo alettone fa il suo dovere','ctrl',1,2,'self'],['Spettacolo le nuove minigonne','ctrl',1,2,'self'],
 ['Freni rispondono male','ctrl',-1,1,'rival'],['Alettone danneggiato','ctrl',-1,1,'rival'],['Ti prendooooo!!!!','ctrl',-1,1,'rival'],['Olio vecchi nel motore','ctrl',-1,2,'rival'],
 ['Olio vecchio nei freni','ctrl',-1,2,'rival'],['Ammortizzatore scarico','ctrl',-2,1,'rival'],['Il motore non raffredda bene','ctrl',-2,1,'rival'],['Marmitta inceppata','ctrl',-2,2,'rival'],
 ['Sterzo allentato','ctrl',-2,2,'rival'],['Bel colpo di fortuna','partenza',2,0,'self'],['Il sonno aiuta','partenza',2,0,'self'],['Brucia le gomme','partenza',1,0,'self'],
 ['Brucia le gomme','partenza',1,0,'self'],['Buono il caffè stamattina','partenza',1,0,'self'],['Non è la tua giornata','partenza',-2,0,'rival'],['Brutti incubi','partenza',-2,0,'rival'],
 ['Hai messo gli occhiali sbagliati','partenza',-1,0,'rival'],['Oggi va cosi…','partenza',-1,0,'rival'],['Falsa partenza','partenza',-1,0,'rival'],['Sempre la vecchia fortuna','dado',6,1,'self'],
 ['Il destino provvede','dado',6,1,'self'],['Spegni la fiamma','dado',1,1,'rival'],['ALT','dado',1,1,'rival']
];
const C_PREGARA = [
 ['Bravo, aiuti il prossimo','po',1],['Quando meno se lo aspettano','po',2],['Mi sembra giusto cosi','po',2],
 ['Beccato','po',-1],['Un piccolo sgarro, ti costa caro','po',-1],['Non puoi andare avanti sempre così','po',-2],
 ['Arriva bonifica dallo zio del Molise','money',250],['Ieri sera hai vinto a Poker','money',500],['Il tuo cane vince il primo premio','money',500],
 ['Arrivano le tasse arretrate','money',-250],['Arriva la multa per eccesso velocità','money',-500],['I debiti si pagano','money',-500],
 ['Arrivano gli sponsor','prizeUp',2],['La fortuna ti assiste','prizeUp',2],['Pareggiamo le cose','prizeDown',0.5],['Pareggiamo i conti','prizeDown',0.5],
 ['Anche gli altri puntano su di te','betUp',2],['Il broker ti fa un regalo','betUp',2],['La quota cala all\'ultimo','betDown',0.5]
];

/* ============================ UTIL ============================ */
function shuffle(a){ for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; }
function d6(){ return 1+Math.floor(Math.random()*6); }
function ini(n){ return (n||'?')[0].toUpperCase(); }
function makeDeck(){ const d=[]; C_INGARA.forEach(c=>d.push({cat:'ingara',nome:c[0],eff:c[1],val:c[2],dur:c[3],target:c[4]})); C_PREGARA.forEach(c=>d.push({cat:'pregara',nome:c[0],eff:c[1],val:c[2]})); return shuffle(d); }
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
  G.players.forEach((p,idx)=>{ p.pilot=null; p.drew=false; p.money=3000; p.po=0; p.comp={motore:0,cambio:0,sterzo:0,assetto:0,peso:0,nos:0}; p.lastRank=idx; p.prevRank=idx; p.hand=[]; });
  G.deck=makeDeck(); G.discard=[];
  G.players.forEach(p=>{ for(let k=0;k<3;k++){ const card=drawCard(G); if(card) p.hand.push(card); } });
  G.round=0; room.started=true;
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
  G.ppIdx=0; G.phase='prep'; G.R=null; G.lastResults=null;
  G.players.forEach(p=>{ p.bet=null; p.prizeMult=1; p.betMult=1; });
  curPrep(G).buysLeft=G.maxBuys;
}
function rebuildShop(room){
  const G=room.G; const N=G.players.length; const reveal=(G.round===1)?N*2:N; const bag=[];
  DB.ordine.forEach(comp=>{
    for(let lvl=1;lvl<=G.compMaxLevel;lvl++){
      let copies; if(lvl<=3) copies=DB.deckPerStat[lvl]; else if(lvl===4) copies=Math.max(0,N-2); else copies=Math.max(0,N-3);
      for(let k=0;k<copies;k++) bag.push({comp,lvl});
    }
  });
  shuffle(bag); G.shop=bag.slice(0,reveal);
}
function curPrep(G){ return G.players.find(p=>p.id===G.order[G.ppIdx]); }
function buildCount(p,lvl){ return DB.ordine.filter(c=>p.comp[c]===lvl).length; }
function canHaveAtLevel(p,comp,lvl){
  if(lvl===4 && buildCount(p,4)>=3) return false;
  if(lvl===5){ if(buildCount(p,5)>=2) return false; if((comp==='motore'&&p.comp.peso===5)||(comp==='peso'&&p.comp.motore===5)) return false; }
  return true;
}
function priceFor(G,p,comp,lvl){ let price=DB.prezzi[comp][lvl]; if(lvl>p.comp[comp]+1) price*=2; return price; }

/* --- azioni preparazione --- */
function actBuy(room,p,shopIdx){
  const G=room.G; if(G.phase!=='prep'||curPrep(G).id!==p.id) return 'Non è il tuo turno.';
  const card=G.shop[shopIdx]; if(!card) return 'Carta non valida.';
  if(card.lvl<=p.comp[card.comp]) return 'Livello pari o inferiore.';
  if(card.lvl>G.compMaxLevel) return 'Livello non ancora sbloccato.';
  if(p.buysLeft<=0) return 'Acquisti finiti.';
  if(!canHaveAtLevel(p,card.comp,card.lvl)) return 'Tetto di costruzione raggiunto.';
  const price=priceFor(G,p,card.comp,card.lvl); if(p.money<price) return 'Denaro insufficiente.';
  p.money-=price; p.comp[card.comp]=card.lvl; p.buysLeft--; G.shop.splice(shopIdx,1); return null;
}
function pregaraTarget(c){ if(c.eff==='prizeDown'||c.eff==='betDown') return 'rival'; if((c.eff==='money'||c.eff==='po')&&c.val<0) return 'rival'; return 'self'; }
function actPlayPregara(room,p,handIdx,targetId){
  const G=room.G; if(G.phase!=='prep'||curPrep(G).id!==p.id) return 'Non è il tuo turno.';
  const c=p.hand[handIdx]; if(!c||c.cat!=='pregara') return 'Carta non valida.';
  let tgt=p;
  if(pregaraTarget(c)==='rival'){ const t=G.players.find(x=>x.id===targetId && x.id!==p.id); if(!t) return 'Scegli un avversario valido.'; tgt=t; }
  if(c.eff==='money') tgt.money=Math.max(0,tgt.money+c.val);
  else if(c.eff==='po') tgt.po=Math.max(0,tgt.po+c.val);
  else if(c.eff==='prizeUp'||c.eff==='prizeDown') tgt.prizeMult=(tgt.prizeMult||1)*c.val;
  else if(c.eff==='betUp'||c.eff==='betDown') tgt.betMult=(tgt.betMult||1)*c.val;
  G.discard.push(c); p.hand.splice(handIdx,1); return null;
}
function actSetBet(room,p,targetId,amount){
  const G=room.G; if(G.phase!=='prep'||curPrep(G).id!==p.id) return 'Non è il tuo turno.';
  if(G.round<2) return 'Scommesse dal round 2.';
  if(targetId==null||!amount||amount<=0){ p.bet=null; return null; }
  if(!G.players.some(x=>x.id===targetId)) return 'Bersaglio non valido.';
  if(amount>p.money) return 'Importo superiore al denaro.';
  p.bet={ targetId, amount }; return null;
}
function actPrepDone(room,p){
  const G=room.G; if(G.phase!=='prep'||curPrep(G).id!==p.id) return 'Non è il tuo turno.';
  if(p.bet){ if(p.bet.amount>p.money){ p.bet=null; } else { p.money-=p.bet.amount; } }
  G.ppIdx++;
  if(G.ppIdx<G.order.length){ curPrep(G).buysLeft=G.maxBuys; }
  else startRace(room);
  return null;
}

/* --- gara --- */
function startRace(room){
  const G=room.G;
  G.R={ turnOrder:[...G.order], turn:1, ptr:0, phase:'await', cars:{}, lastBreak:null, log:[], logId:0 };
  G.players.forEach(p=>{ G.R.cars[p.id]={ pos:0, firstDone:false, nosUsed:false, fx:[], pendDado:null, pendPart:0 }; });
  G.phase='race';
}
function activeRace(G){ return G.players.find(p=>p.id===G.R.turnOrder[G.R.ptr]); }
function dieBonus(d){ return d<=2?1:d<=5?2:3; }
function fxSum(R,p,stat){ return R.cars[p.id].fx.filter(e=>e.stat===stat).reduce((s,e)=>s+e.amt,0); }
function nosAllowed(G,p){ const car=G.R.cars[p.id]; const seg=segOf(G,Math.max(1,car.pos)); if(car.nosUsed) return false; if(!car.firstDone) return false; if(seg.t==='drift') return false; if(statVal(p,'nos')<=0) return false; return true; }

function computeMove(G,p,die,useNos){
  const R=G.R; const car=R.cars[p.id]; const first=!car.firstDone; const seg=segOf(G,Math.max(1,car.pos));
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
  let target=p;
  if(c.target==='rival'){ const t=G.players.find(x=>x.id===targetId && x.id!==p.id); if(!t) return 'Scegli un rivale valido.'; target=t; }
  else if(targetId!=null && targetId!==p.id && G.players.length>2){ const t=G.players.find(x=>x.id===targetId); if(t) target=t; }
  const tc=G.R.cars[target.id];
  if(c.eff==='vel'||c.eff==='ctrl') tc.fx.push({stat:c.eff,amt:c.val,turns:c.dur});
  else if(c.eff==='partenza') tc.pendPart+=c.val;
  else if(c.eff==='dado') tc.pendDado=c.val;
  raceLog(G,{kind:'card',who:p.name,target:target.name,targetId:target.id,nome:c.nome,eff:c.eff,val:c.val,dur:c.dur});
  G.discard.push(c); p.hand.splice(handIdx,1); return null;
}
function actRoll(room,p,useNos){
  const G=room.G; if(G.phase!=='race') return 'Non in gara.';
  if(activeRace(G).id!==p.id) return 'Non è il tuo turno.';
  if(G.R.phase!=='await') return 'Hai già tirato.';
  const car=G.R.cars[p.id];
  const realNos = !!useNos && nosAllowed(G,p);
  const die = car.pendDado || d6();
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
  car.pos=Math.min(55,car.pos+b.total);
  raceLog(G,{kind:'move',who:p.name,seg:TIPO_LABEL[b.segType]||b.segType,mov:b.total,pos:car.pos,die:b.die});
  car.pendPart=0; car.pendDado=null;
  car.fx=car.fx.map(e=>({...e,turns:e.turns-1})).filter(e=>e.turns>0);
  G.R.lastBreak=null; G.R.phase='await';
  G.R.ptr++;
  if(G.R.ptr>=G.R.turnOrder.length){ G.R.turn++; G.R.ptr=0; if(G.R.turn>5){ endRace(room); } }
  return null;
}

function endRace(room){
  const G=room.G;
  const ranked=[...G.players].sort((a,b)=>G.R.cars[b.id].pos-G.R.cars[a.id].pos||Math.random()-0.5);
  const N=G.players.length; const base=DB.roadBasePrice[G.raceLevel];
  ranked.forEach((p,i)=>{
    const po=DB.premiPO[i]||0; let money=Math.max(base, Math.round(base*(DB.premiMult[i]||0)));
    money=Math.round(money*(p.prizeMult||1));
    p.po=Math.max(0,p.po+po); p.money+=money; p.prevRank=p.lastRank; p.lastRank=i;
    p._gainPO=po; p._gainMoney=money; p._betDelta=0; p._betWin=false; p._finalPos=i+1;
  });
  const winnerId=ranked[0].id;
  G.players.forEach(p=>{
    if(p.bet && p.bet.targetId!=null && p.bet.amount>0){
      const t=G.players.find(x=>x.id===p.bet.targetId); const q=DB.quoteScommessa[Math.min(7,t.prevRank)];
      if(p.bet.targetId===winnerId){ const payout=Math.round(p.bet.amount*q*(p.betMult||1)); p.money+=p.bet.amount+payout; p._betDelta=payout; p._betWin=true; }
      else { p._betDelta=-p.bet.amount; }
    }
    p.bet=null;
  });
  G.players.forEach(p=>{ while(p.hand.length<5){ const card=drawCard(G); if(!card) break; p.hand.push(card); } });
  const racedLevels=G.track.map(c=>c.lvl);
  advanceTrack(room);
  G.lastTrackInfo={ racedLevels, change:G.lastTrackChange };
  G.winner = G.players.some(p=>p.po>=DB.obiettivo) ? [...G.players].sort((a,b)=>b.po-a.po||b.money-a.money)[0] : null;
  G.lastResults = ranked.map(p=>({ id:p.id, name:p.name, colorH:DB.colori[p.colorIdx].h, pos:p._finalPos, cell:G.R.cars[p.id].pos, po:p._gainPO, money:p._gainMoney, betDelta:p._betDelta }));
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
    const fillLvl=advance?(L+1):L;                               // se non si sale, si riempie col livello max attuale
    G.track=G.track.slice(passedAll);
    for(let k=0;k<passedAll;k++) G.track.push(newCardOfLevel(fillLvl));
    change.addedCount=passedAll; change.newLevel=G.trackLevel; change.advanced=advance;
  }
  layoutTrack(G.track);
  G.lastTrackChange=change;
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
function ownedView(p){ return DB.ordine.map(c=>({ comp:c, name:DB.nomi[c], lvl:p.comp[c], val:DB.valori[c][p.comp[c]] })); }

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
      hand:p.hand.map(c=>({ cat:c.cat, nome:c.nome, eff:c.eff, val:c.val, dur:c.dur, target:c.target }))
    };
    return v;
  }
  v.players=publicPlayers(G, G.phase==='race');
  v.allBets = G.players.filter(p=>p.bet && p.bet.targetId!=null && p.bet.amount>0).map(p=>({ playerId:p.id, targetId:p.bet.targetId, amount:p.bet.amount }));
  v.raceLevel=G.raceLevel; v.entryFee=G.entryFee;

  if(G.phase==='prep'){
    const active=curPrep(G); v.activeId=active.id; v.activeName=active.name; v.isYourTurn=active.id===player.id;
    v.compMaxLevel=G.compMaxLevel;
    if(v.isYourTurn){
      const p=player;
      v.me={ money:p.money, po:p.po, buysLeft:p.buysLeft, stats:statsOf(p), owned:ownedView(p), handCount:p.hand.length, prizeMult:(p.prizeMult||1), betMult:(p.betMult||1) };
      v.shop=G.shop.map((card,idx)=>{
        const cur=p.comp[card.comp]; const usable=card.lvl>cur && card.lvl<=G.compMaxLevel; const okLimit=canHaveAtLevel(p,card.comp,card.lvl);
        const price=priceFor(G,p,card.comp,card.lvl); const skip=card.lvl>cur+1;
        let reason=''; if(!usable) reason=card.lvl<=cur?'livello pari/inferiore':'oltre il livello sbloccato'; else if(!okLimit) reason='tetto raggiunto';
        return { idx, comp:card.comp, name:DB.nomi[card.comp], lvl:card.lvl, val:DB.valori[card.comp][card.lvl], cur, price, skip,
          buyable: usable && okLimit && p.buysLeft>0 && p.money>=price, reason };
      });
      v.pregara=p.hand.map((c,idx)=>({ idx, cat:c.cat, nome:c.nome, eff:c.eff, val:c.val, target:pregaraTarget(c) })).filter(c=>c.cat==='pregara');
      v.canBet = G.round>=2;
      if(v.canBet){
        v.betTargets=G.players.map(t=>({ id:t.id, name:t.name, colorH:DB.colori[t.colorIdx].h, quote:DB.quoteScommessa[Math.min(7,t.lastRank)], you:t.id===p.id }));
        v.myBet=p.bet?{ targetId:p.bet.targetId, amount:p.bet.amount }:null;
      }
    }
    return v;
  }

  if(G.phase==='race'){
    const R=G.R; const active=activeRace(G); v.activeId=active.id; v.activeName=active.name; v.isYourTurn=active.id===player.id;
    v.turn=R.turn; v.track=trackView(G); v.cars=G.players.map(p=>({ id:p.id, name:p.name, colorH:DB.colori[p.colorIdx].h, ini:ini(p.name), pos:R.cars[p.id].pos }));
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
        hand:p.hand.map((c,idx)=>({idx,cat:c.cat,nome:c.nome,eff:c.eff,val:c.val,dur:c.dur,target:c.target})).filter(c=>c.cat==='ingara'),
        rivals:G.players.filter(x=>x.id!==p.id).map(x=>({id:x.id,name:x.name,colorH:DB.colori[x.colorIdx].h}))
      };
      v.rolled = R.phase==='rolled' ? (function(){ const b=R.lastBreak; return { lines:b.lines, total:b.total, die:b.die, db:b.db, useNos:b.useNos, np:Math.min(55,car.pos+b.total) }; })() : null;
    }
    return v;
  }

  if(G.phase==='results' || G.phase==='win'){
    v.results=G.lastResults;
    v.trackInfo=G.lastTrackInfo;
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
  const G=room.G; let safety=10;
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
  for(let i=bot.hand.length-1;i>=0;i--){ const c=bot.hand[i]; if(c.cat!=='pregara')continue; const self=(c.eff==='money'&&c.val>0)||(c.eff==='po'&&c.val>0)||c.eff==='prizeUp'||c.eff==='betUp'; const rival=(c.val<0)||c.eff==='prizeDown'||c.eff==='betDown'; if(self) actPlayPregara(room,bot,i); else if(rival){ const tg=[...G.players].filter(x=>x.id!==bot.id).sort((a,b)=>b.po-a.po)[0]; if(tg) actPlayPregara(room,bot,i,tg.id); } }
  actPrepDone(room,bot);
}
function botRace(room,bot){
  const G=room.G, R=G.R;
  if(R.phase==='await'){
    const selfPos=bot.hand.map((c,i)=>({c,i})).filter(o=>o.c.cat==='ingara'&&o.c.target==='self'&&(o.c.eff==='vel'||o.c.eff==='ctrl')&&o.c.val>0);
    const rivalNeg=bot.hand.map((c,i)=>({c,i})).filter(o=>o.c.cat==='ingara'&&o.c.target==='rival');
    if(selfPos.length && Math.random()<0.45) actRacePlayCard(room,bot,selfPos[0].i);
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
  socket.on('prep:playCard', handle((room,p,d)=>actPlayPregara(room,p,d.handIdx,d.targetId)));
  socket.on('prep:bet', handle((room,p,d)=>actSetBet(room,p,d.targetId,d.amount)));
  socket.on('prep:done', handle((room,p)=>actPrepDone(room,p)));
  socket.on('race:playCard', handle((room,p,d)=>actRacePlayCard(room,p,d.handIdx,d.targetId)));
  socket.on('race:roll', handle((room,p,d)=>actRoll(room,p,d.useNos)));
  socket.on('race:move', handle((room,p)=>actConfirmMove(room,p)));
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

module.exports = { DB, startGame, startRound, actReady, curPrep, activeRace, actBuy, actPlayPregara, actSetBet, actPrepDone, actRacePlayCard, actRoll, actConfirmMove, actNextRound, buildView, botAct, botPending };

const PORT = process.env.PORT || 3000;
server.listen(PORT, ()=>console.log('2FAST4U server in ascolto sulla porta '+PORT));
