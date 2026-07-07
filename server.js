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

/* Server HTTP e socket.io non creati qui: il motore classico si "monta" su un io
   fornito (vedi mount() in fondo), cosi' puo' convivere con la Modalita' B in un
   unico processo (bivio). In standalone si auto-avvia comunque, sul path di default. */
let IO = null;

/* ============================ DATI ============================
   FONTE UNICA: dati_2fast4u.json (generato dagli Excel di design).
   Qui non vive NESSUNA carta, strada o pilota: solo regole. Committare
   sempre server.js e dati_2fast4u.json insieme. */
const DATI = require('./dati_2fast4u.json');
const DB = {
  ordine: DATI.pezzi.ordine,
  nomi: DATI.pezzi.nomi,
  valori: DATI.pezzi.valori,                                    // [L0..L4] per pezzo
  prezzi: DATI.pezzi.prezzi,
  esp: DATI.pezzi.esp,                                          // varianti ESP: {comp:{"3":{v,p},"4":{v,p}}} — mai il Peso
  lunghezze: [8,9,11,13,14],
  roadBasePrice: { 1:100, 2:200, 3:300, 4:400, 5:500 },
  premiMult: [9,6,4,2.5,1.5,1,0,0],
  premiPO: [5,3,1,0,0,0,0,0],
  quoteScommessa: [1.05,1.2,1.5,2,2.5,3,4,5],
  obiettivo: 50,
  maxLevelRoads: 5,
  colori: [
    { n:'Rosso', h:'#e74c3c' }, { n:'Blu', h:'#3498db' }, { n:'Verde', h:'#2ecc71' }, { n:'Giallo', h:'#f39c12' },
    { n:'Viola', h:'#9b59b6' }, { n:'Turchese', h:'#1abc9c' }, { n:'Arancio', h:'#e67e22' }, { n:'Rosa', h:'#e91e63' }
  ],
  piloti: DATI.piloti                                           // 24 piloti: tratto {t,v} · fortuna {set,v} · bonus {vel|ctrl|nos}
};
const TIPO_LABEL = { rettilineo:'Rettilineo', citta:'Città', drift:'Drift' };
const ROADS = { 1:DATI.strade['1'], 2:DATI.strade['2'], 3:DATI.strade['3'], 4:DATI.strade['4'], 5:DATI.strade['5'] };
const CARD_PACKS = { 1:DATI.carte['1'], 2:DATI.carte['2'], 3:DATI.carte['3'], 4:DATI.carte['4'], 5:DATI.carte['5'] };   // ogni pack: ingara+pregara+difesa+polizia+esp di quel livello (L5: solo ESP)

/* ============================ UTIL ============================ */
function shuffle(a){ for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; }
function d6(){ return 1+Math.floor(Math.random()*6); }
function ini(n){ return (n||'?')[0].toUpperCase(); }

/* ===== descrizione carta lato server (il client la mostra così com'è) ===== */
function cardDesc(c){
  if(c.desc) return c.desc;
  const eur=v=>'€'+Math.abs(v);
  if(c.eff==='vel') return (c.val>=0?'+':'')+c.val+' Velocità · '+c.dur+(c.dur===1?' tiro':' tiri');
  if(c.eff==='ctrl') return (c.val>=0?'+':'')+c.val+' Controllo · '+c.dur+(c.dur===1?' tiro':' tiri');
  if(c.eff==='partenza') return 'Partenza '+(c.val>=0?'+':'')+c.val;
  if(c.eff==='money') return (c.val>=0?'+':'−')+eur(c.val);
  if(c.eff==='po') return (c.val>=0?'+':'')+c.val+' Punti Onore';
  if(c.eff==='prizeUp') return 'Montepremi ×'+c.val+' (su di te)';
  if(c.eff==='prizeDown') return 'Montepremi ÷'+(Math.round(10/c.val)/10)+' (a un rivale)';
  if(c.eff==='betUp') return 'Scommessa ×'+c.val+' (su di te)';
  if(c.eff==='betDown') return 'Scommessa ÷'+(Math.round(10/c.val)/10)+' (a un rivale)';
  if(c.eff==='quota') return 'Quota '+(c.val>=0?'+':'')+c.val+' sulla scommessa';
  if(c.eff==='discount') return 'Sconto '+Math.round((1-c.val)*100)+'% sul prossimo acquisto';
  if(c.eff==='smonta') return 'Smonta 1 livello a un rivale'+(c.val?' · costa '+eur(c.val):'');
  if(c.eff==='reopen') return 'Giro extra in officina solo per te · 1 pezzo'+(c.val?' · costa '+eur(c.val):'');
  if(c.eff==='reopenAll') return 'Giro extra in officina per tutti · 1 pezzo a testa (tu per primo)';
  if(c.eff==='reopenDebt') return 'Giro extra per te e 1 rivale scelto · lui a metà prezzo · 1 pezzo a testa';
  if(c.eff==='sprint') return 'Gara breve · traguardo a '+c.val;
  if(c.eff==='tratto') return 'Trasforma 1 tratto della pista in '+(TIPO_LABEL[c.val]||c.val);
  if(c.eff==='defend') return 'Difesa '+(c.val==='both'?'totale (gara + pre-gara)':c.val==='ingara'?'da gara':'da pre-gara')+(c.dur===1?' · rimanda al mittente':'');
  if(c.cat==='polizia') return c.kind==='blocco'?('Blocco stradale · '+c.size+' caselle'):'Inseguimento: la polizia entra in gara';
  return '';
}
function cardNeedsTarget(c){
  if(c.cat==='ingara') return c.target==='rival' || (c.eff==='multi' && (c.effects||[]).some(e=>e.tgt==='pick'));
  if(c.cat==='pregara') return pregaraTarget(c)==='rival';
  return false;
}
function mkCard(c){
  const o={ ...c };
  if(o.effects) o.effects=o.effects.map(e=>({ ...e }));
  if(o.set) o.set=o.set.slice();
  o.desc=cardDesc(o);
  return o;
}
// --- POLIZIA AUTOMATICA: 1 carta a caso per livello in ogni mazzo ---
const POLICE_BY_LEVEL=(function(){ const m={1:[],2:[],3:[],4:[],5:[]}; for(const lv of ['1','2','3','4','5']) (DATI.carte[lv]||[]).forEach(c=>{ if(c.cat==='polizia') m[+lv].push(c); }); return m; })();
function addRandomPolice(arr,lvl){ const pool=POLICE_BY_LEVEL[lvl]||[]; if(pool.length) arr.push(mkCard(pool[Math.floor(Math.random()*pool.length)])); return arr; }
function packCards(lvl){ return (CARD_PACKS[lvl]||[]).filter(c=>c.cat!=='polizia').map(mkCard); }   // esclude la polizia (entra a parte, 1 a caso per livello)
function makeDeck(maxLvl){
  const d=[]; const top=Math.min(maxLvl||1, DB.maxLevelRoads);
  for(let l=1;l<=top;l++){ packCards(l).forEach(c=>d.push(c)); addRandomPolice(d,l); }    // tutte le carte fino al livello + 1 polizia a caso per livello
  return shuffle(d);
}
/* --- mazzo PERSONALE dal deck-builder (nome carta univoco per livello) --- */
const CARD_INDEX=(function(){ const idx={}; for(const lv of ['1','2','3','4','5']) for(const c of (DATI.carte[lv]||[])) if(!idx[c.nome]) idx[c.nome]={def:c,lvl:+lv}; return idx; })();
function sanitizeDeck(deck){
  if(!deck||typeof deck!=='object') return null;
  const qty={}; if(deck.qty&&typeof deck.qty==='object') for(const k in deck.qty){ const v=deck.qty[k]|0; if(v>0 && CARD_INDEX[k]) qty[k]=Math.min(9,v); }
  const pilots=Array.isArray(deck.pilots)?deck.pilots.filter(id=>DB.piloti.some(q=>q.id===id)).slice(0,6):[];
  if(!pilots.length && !Object.keys(qty).length) return null;
  return { qty, pilots };
}
function personalDeckCards(deckDef,lvl){ const out=[]; const qty=(deckDef&&deckDef.qty)||{}; for(const nome in qty){ const e=CARD_INDEX[nome]; if(!e||e.lvl!==lvl||e.def.cat==='polizia') continue; const n=qty[nome]|0; for(let k=0;k<n;k++) out.push(mkCard(e.def)); } addRandomPolice(out,lvl); return out; }
function makePersonalDeck(deckDef,maxLvl){ const d=[]; const top=Math.min(maxLvl||1, DB.maxLevelRoads); for(let l=1;l<=top;l++) personalDeckCards(deckDef,l).forEach(c=>d.push(c)); return shuffle(d); }
function pilotPoolFor(p){ if(p.deckDef && Array.isArray(p.deckDef.pilots) && p.deckDef.pilots.length) return shuffle(p.deckDef.pilots.slice()); return shuffle(DB.piloti.map(q=>q.id)).slice(0,6); }

function drawCard(p, trackLevel){
  if(!p.deck||!p.deck.length){ if(p.discard&&p.discard.length){ p.deck=shuffle(p.discard); p.discard=[]; } else { p.deck = p.deckDef ? makePersonalDeck(p.deckDef, trackLevel||1) : makeDeck(trackLevel||1); } }
  return p.deck.length ? p.deck.pop() : null;
}
function statVal(p,k){
  const lv=p.comp[k];
  if(p.espOwned && p.espOwned[k]===lv && DB.esp[k] && DB.esp[k][lv]) return DB.esp[k][lv].v;   // variante ESP montata
  return DB.valori[k][lv];
}

/* ============================ STANZE ============================ */
const rooms = new Map();             // code -> room
const socketToRoom = new Map();      // socket.id -> code
function genCode(){ const c='ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let s; do{ s=''; for(let i=0;i<4;i++) s+=c[Math.floor(Math.random()*c.length)]; } while(rooms.has(s)); return s; }
function cleanName(x){x=String(x||'').replace(/[\r\n\t]+/g,' ').replace(/^ {2,}/,' ').replace(/ +$/,'');return x.slice(0,8)||'Giocatore';}
function freeColorIdx(room){ const used=new Set(room.G.players.map(p=>p.colorIdx)); for(let i=0;i<DB.colori.length;i++) if(!used.has(i)) return i; return -1; }
function playerBySocket(socket){ const code=socketToRoom.get(socket.id); if(!code) return null; const room=rooms.get(code); if(!room) return null; const p=room.G.players.find(x=>x.socketId===socket.id); return p?{room,p}:null; }

/* ============================ MOTORE ============================ */
const POSW=[0.85,0.85,1.0,1.10,1.20];                                  // peso di posizione: 1ª = 2ª (lancio), poi a salire fino alla 5ª (la più lunga)
function roadBase(L){ return 10+5*(Math.min(L,DB.maxLevelRoads)-1); }   // lunghezza media a livello L: 10 a L1, +5 per livello
function layoutTrack(cards){ let from=1; cards.forEach((c,i)=>{ const w=(POSW[i]!==undefined?POSW[i]:1); c.len=Math.max(3,Math.round(roadBase(c.lvl||1)*w)); c.from=from; c.to=from+c.len-1; from+=c.len; }); }
function newCardOfLevel(lvl){ const L=Math.min(lvl,DB.maxLevelRoads); const pool=ROADS[L]; return { ...pool[Math.floor(Math.random()*pool.length)], lvl:L }; }
function buildInitialTrack(G){
  const pool=shuffle(ROADS[1].map(c=>({...c,lvl:1})));
  const rett=pool.find(c=>c.t==='rettilineo'); const cards=[rett];
  pool.filter(c=>c!==rett).slice(0,4).forEach(c=>cards.push(c));
  layoutTrack(cards); G.track=cards; G.trackLevel=1; G._lvlRaces=0;
}
function trackTopLevel(G){ return G.track[G.track.length-1].lvl; }
function segOf(G,sq){ const s=Math.max(1,sq); return G.track.find(c=>s>=c.from&&s<=c.to)||G.track[G.track.length-1]; }

function startGame(room){
  const G=room.G;
  G.players.forEach((p,i)=>{ p.roll=d6(); });
  G.diceOrder=[...G.players].sort((a,b)=>b.roll-a.roll||a.id-b.id).map(p=>p.id);
  G.players.forEach((p,idx)=>{ p.pilot=null; p.drew=false; p.money=4000; p.po=0; p.comp={motore:0,cambio:0,sterzo:0,assetto:0,peso:0,nos:0}; p.lvlOwned={motore:[0],cambio:[0],sterzo:[0],assetto:[0],peso:[0],nos:[0]}; p.espOwned={}; p.deck = p.deckDef ? makePersonalDeck(p.deckDef,1) : makeDeck(1); p.discard=[]; p.pilotPool=pilotPoolFor(p); p.lastRank=idx; p.prevRank=idx; p.hand=[]; });   // mazzo e piloti PERSONALI (deck-builder); bot e senza-deck usano il mazzo completo
  G.discard=[];
  G.market=[]; G.marketUsed={}; G.marketSeq=0; G.prevResults=null;
  G.players.forEach(p=>{ for(let k=0;k<3;k++){ const card=drawCard(p,1); if(card) p.hand.push(card); } });
  G.round=0; room.started=true; G.policeUnlocked=true; G.scaleUnlocked={2:false,3:false,4:false,5:false}; G.blocks=[]; G.pendPolice=[]; G.bossPending=null;
  G.gameLog=[]; G.gameSeq=0;
  G.phase='reveal'; G.players.forEach(p=>{ p.ready=false; if(p.pilotPool && p.pilotPool.length){ const pid=p.pilotPool.pop(); p.pilot=DB.piloti.find(q=>q.id===pid); p.drew=true; } });   // pilota unico assegnato in automatico: niente pescaggio
}
function restartGame(room){
  const G=room.G;
  if(room._botTimer){ clearTimeout(room._botTimer); room._botTimer=null; }
  if(room._launchTimer){ clearTimeout(room._launchTimer); room._launchTimer=null; }
  room.started=false;
  G.phase='lobby';
  G.round=0; G.R=null; G.lastResults=null; G.winner=null;
  G.gameLog=[]; G.gameSeq=0;
  G.track=[]; G.discard=[]; G.order=[]; G.diceOrder=[];
  G.market=[]; G.marketUsed={}; G.marketSeq=0; G.prevResults=null;
  G.players.forEach((p,i)=>{
    p.pilot=null; p.drew=false; p.ready=false;
    p.money=4000; p.po=0;
    p.comp={motore:0,cambio:0,sterzo:0,assetto:0,peso:0,nos:0};
    p.lvlOwned={motore:[0],cambio:[0],sterzo:[0],assetto:[0],peso:[0],nos:[0]};
    p.espOwned={};
    p.deck=null; p.discard=[];
    p.hand=[]; p.bet=null;
    p.lastRank=i; p.prevRank=i; p.roll=0;
  });
}
function actDrawPilot(room,p){
  const G=room.G; if(G.phase!=='reveal') return 'Non in fase di pesca.';
  if(p.drew) return 'Hai già pescato il pilota.';
  if(!p.pilotPool || !p.pilotPool.length) return 'Nessun pilota disponibile.';
  const pid=p.pilotPool.pop(); p.pilot=DB.piloti.find(q=>q.id===pid); p.drew=true;
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
  G.maxBuys=(G.round===1)?2:1;                                  // pezzi scoperti a testa (2 alla prima officina)
  G.shopRounds=(G.round===1)?2:1; G.shopRound=1;                 // giri d'acquisto: 2 alla prima officina (1 pezzo per giro), 1 dalle successive
  G.compMaxLevel=G.trackLevel;
  G.market=[]; G.marketUsed={};                                          // banco condiviso pulito ogni officina
  revealMarket(G, G.maxBuys * G.players.length);   // pezzi scoperti = acquisti totali (maxBuys × giocatori): 2 a testa al round 1, 1 dai successivi; si compra dalle scoperte (contesa)
  G.raceLevel=G.trackLevel;
  G.entryFee=DB.roadBasePrice[G.raceLevel];
  G.raceFirstRollDone=false;
  G.ppIdx=0; G.phase='prep'; G.R=null; if(G.lastResults) G.prevResults=G.lastResults; G.lastResults=null; G.reshop=false; G.reshopQueued=false; G.reshopFirst=null; G.reshopBuys={}; G.reshopHalf=[]; G.sprintFinish=null;
  G.blocks=[]; G.pendPolice=[]; G.forfeitedBlocks=[];
  G.players.forEach(p=>{ p.bet=null; p.prizeMult=1; p.betMult=1; p.quotaMod=0; p.discountNext=false; p.incoming=[]; p.nosBombs=(G.trackLevel>=4)?[0,0]:null; });
  curPrep(G).buysLeft=1;                                        // 1 acquisto per giro
  glog(G,'— Round '+G.round+' · officina aperta · gara liv. '+G.raceLevel,'round');
}
function compSlots(N,lvl){ return Math.max(1, N - Math.max(0, lvl-2)); }   // posti totali per tipo a un livello: L1-2=N, L3=N-1, L4=N-2, L5=N-3 (min 1)
function stockAvail(G,comp,lvl){ return compSlots(G.players.length,lvl) - G.players.filter(x=>x.comp[comp]===lvl).length; }   // disponibili = posti − chi tiene già quel livello (il pezzo rientra da solo quando uno sale)
/* ===== MERCATO CONDIVISO a carte scoperte (1° mercato N×2, successivi N; scarsità → contesa; ordine officina dall\'ultimo al primo) ===== */
function deckCountForLevel(N,lvl){ return ({1:4,2:3,3:3,4:Math.max(0,N-2),5:Math.max(0,N-3)})[lvl]||0; }   // scarsità mazzo per stat/livello
function revealMarket(G,count){                                  // pesca `count` pezzi e li scopre nel banco condiviso
  const N=G.players.length; let guard=count*60;
  const marketPool = G.round<=1 ? DB.ordine.filter(c=>c!=='nos') : DB.ordine;   // NOS non disponibile al primo mercato (round 1)
  while(count>0 && guard-->0){
    const comp=marketPool[Math.floor(Math.random()*marketPool.length)];
    const lvl=1+Math.floor(Math.random()*G.compMaxLevel);        // 1..livello max pista
    const key=comp+':'+lvl; const used=G.marketUsed[key]||0;
    if(used>=deckCountForLevel(N,lvl)) continue;                 // esaurita quella carta nel mazzo
    G.marketUsed[key]=used+1; G.market.push({ id:++G.marketSeq, comp, lvl }); count--;
  }
}
function pOrder(G){ return G.reshop?G.reshopOrder:G.order; }
function curPrep(G){ const o=pOrder(G); return G.players.find(p=>p.id===o[G.ppIdx]); }
function startReshop(room){
  const G=room.G;
  G.reshop=true; G.reshopQueued=false;
  const buys=G.reshopBuys||{};
  const parts=G.players.map(p=>p.id).filter(id=>(buys[id]||0)>0);   // solo chi ha un acquisto nel giro extra
  const extraStock=parts.length;                                   // giro extra: 1 pezzo per giocatore (N pezzi, più contesa)
  G.market=[]; G.marketUsed={};                                     // il giro extra riparte pulito
  revealMarket(G, extraStock);
  let first=parts.includes(G.reshopFirst)?G.reshopFirst:parts[0];
  G.reshopOrder=[first, ...G.order.filter(id=>id!==first && parts.includes(id))];
  G.ppIdx=0;
  G.players.forEach(pp=>{ pp.buysLeft=0; });
  if(G.reshopOrder.length){ const cp=curPrep(G); cp.buysLeft=1; }
  const fn=(G.players.find(x=>x.id===first)||{}).name||'?';
  glog(G, parts.length>1 ? ('Giro extra in officina · primo a scegliere: '+fn) : ('Giro extra in officina · '+fn+' riapre'), 'round');
}
function buildCount(p,lvl){ return DB.ordine.filter(c=>p.comp[c]===lvl).length; }
function canHaveAtLevel(p,comp,lvl){
  if(lvl===4 && buildCount(p,4)>=3) return false;                // max 3 pezzi a L4
  if(lvl===5 && buildCount(p,5)>=2) return false;                // max 2 pezzi a L5
  return true;
}
function priceFor(G,p,comp,lvl){
  let price=DB.prezzi[comp][lvl];
  if(lvl>p.comp[comp]+1) price*=2;
  if(p.discountNext) price=Math.round(price*p.discountNext);     // discountNext = moltiplicatore prezzo (0.75 / 0.5)
  return price;
}

/* --- azioni preparazione --- */
function actBuy(room,p,comp,lvl){
  const G=room.G; if(G.phase!=='prep'||curPrep(G).id!==p.id) return 'Non è il tuo turno.';
  lvl=+lvl; if(!DB.ordine.includes(comp)||!(lvl>=1)) return 'Ricambio non valido.';
  const ci=(G.market||[]).findIndex(c=>c.comp===comp&&c.lvl===lvl);
  if(ci<0) return 'Quella carta non è più al mercato.';
  if(lvl<=p.comp[comp]) return 'Livello pari o inferiore.';
  if(lvl>G.compMaxLevel) return 'Livello non ancora sbloccato.';
  if(p.buysLeft<=0) return 'Acquisti finiti.';
  if(!canHaveAtLevel(p,comp,lvl)) return 'Tetto di costruzione raggiunto.';
  let price=priceFor(G,p,comp,lvl); if(G.reshop && (G.reshopHalf||[]).includes(p.id)) price=Math.round(price/2);   // rivale 'portato' dalla carta: metà prezzo nel giro extra
  if(p.money<price) return 'Denaro insufficiente.';
  p.money-=price; p.comp[comp]=lvl; if(p.lvlOwned&&!p.lvlOwned[comp].includes(lvl)) p.lvlOwned[comp].push(lvl); p.buysLeft--; p.discountNext=false;
  if(p.espOwned && p.espOwned[comp]!=null && p.espOwned[comp]!==lvl) delete p.espOwned[comp];   // salendo di livello, l'eventuale ESP del livello precedente decade
  G.market.splice(ci,1);                                          // carta scoperta consumata
  glog(G,p.name+' compra '+(COMPLAB[comp]||comp)+' L'+lvl+' · €'+price,'buy');
  return null;
}
function pregaraTarget(c){ if(c.eff==='prizeDown'||c.eff==='betDown'||c.eff==='smonta'||c.eff==='reopenDebt') return 'rival'; if(c.eff==='quota') return c.val<0?'rival':'self'; if((c.eff==='money'||c.eff==='po')&&c.val<0) return 'rival'; return 'self'; }

/* ====================== DIFESE / MALUS ====================== */
function isDefense(c){ return !!c && c.eff==='defend'; }
function isReflect(c){ return isDefense(c) && (c.dur===1||c.costPO===1); }
function canDefend(c, m){ if(!isDefense(c)) return false; const s=c.val; return m.phase==='ingara' ? (s==='ingara'||s==='both') : (s==='pregara'||s==='both'); }
function malusLabel(m){
  if(m.eff==='vel') return (m.val>=0?'+':'')+m.val+' Velocità';
  if(m.eff==='ctrl') return (m.val>=0?'+':'')+m.val+' Controllo';
  if(m.eff==='nosmod') return (m.val>=0?'+':'')+m.val+' NOS';
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
    case 'smonta': { const cp=m.comp, lv=m.lvl; if(cp!=null){ if(t.lvlOwned[cp]&&!t.lvlOwned[cp].includes(lv)) t.lvlOwned[cp].push(lv); t.comp[cp]=Math.max(...t.lvlOwned[cp]); } break; }
    case 'vel': case 'ctrl': { const car=G.R&&G.R.cars[t.id]; if(car&&m.fxRef) car.fx=car.fx.filter(e=>e!==m.fxRef); break; }
    case 'nosmod': { const tp=G.players.find(x=>x.id===t.id); const car=G.R&&G.R.cars[t.id]; if(tp&&tp.nosBombs) bombAddCharge(tp,-m.val); else if(car) car.nosMod=(car.nosMod||0)-m.val; break; }
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
    case 'nosmod': { const ap=G.players.find(x=>x.id===a.id); const car=G.R&&G.R.cars[a.id]; if(ap&&ap.nosBombs) bombAddCharge(ap,m.val); else if(car) car.nosMod=(car.nosMod||0)+m.val; break; }
    case 'partenza': { const car=G.R&&G.R.cars[a.id]; if(car) car.pendPart+=m.val; break; }
    case 'dado': { const car=G.R&&G.R.cars[a.id]; if(car) car.pendDado=m.val; break; }
  }
}
function incomingFor(player){
  return (player.incoming||[]).map(m=>({ mid:m.mid, label:m.label, by:m.attackerName, cardNome:m.cardNome,
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
  p.discard.push(c); p.hand.splice(handIdx,1);
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

function actDiscard(room,p,handIdx){
  const G=room.G;
  if(G.phase!=='prep') return 'Si scartano le carte solo in officina.';
  if(curPrep(G).id!==p.id) return 'Non è il tuo turno.';
  const c=p.hand[handIdx];
  if(!c) return 'Carta non trovata.';
  if(c.cat==='polizia') return 'Le carte polizia non si scartano: vanno giocate.';
  p.hand.splice(handIdx,1);
  p.discard.push(c);                 // niente ripesca immediata: la mano si ricompone a 5 a fine gara
  return null;
}
function actPlayPregara(room,p,handIdx,targetId,comp){
  const G=room.G; if(G.phase!=='prep'||curPrep(G).id!==p.id) return 'Non è il tuo turno.';
  const c=p.hand[handIdx]; if(!c||c.cat!=='pregara') return 'Carta non valida.';
  if(c.eff==='defend') return 'Le difese si usano solo quando vieni colpito.';
  if(G.reshop && (c.eff==='reopen'||c.eff==='reopenAll'||c.eff==='reopenDebt')) return 'Non puoi riaprire di nuovo nel giro extra.';
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
    tgt.comp[comp]=Math.max(...tgt.lvlOwned[comp]);                    // torno al livello posseduto più alto rimasto (il posto si libera da solo)
    p.money-=cost;                        // costo denaro
    if(c.costPO) p.po=Math.max(0,p.po-c.costPO); // costo Rispetto
  }
  else if(c.eff==='money'){ const _b=tgt.money; tgt.money=Math.max(0,tgt.money+c.val); _ap=tgt.money-_b; }
  else if(c.eff==='po'){ const _b=tgt.po; tgt.po=Math.max(0,tgt.po+c.val); _ap=tgt.po-_b; }
  else if(c.eff==='prizeUp'||c.eff==='prizeDown') tgt.prizeMult=(tgt.prizeMult||1)*c.val;
  else if(c.eff==='betUp'||c.eff==='betDown') tgt.betMult=(tgt.betMult||1)*c.val;
  else if(c.eff==='quota') tgt.quotaMod=(tgt.quotaMod||0)+c.val;
  else if(c.eff==='discount') tgt.discountNext=c.val;                    // moltiplicatore prezzo (0.75 / 0.5)
  else if(c.eff==='tratto'){                                             // trasforma 1 tratto della pista nel tipo della carta
    const idx=parseInt(comp,10);
    if(!(idx>=0 && idx<G.track.length)) return 'Scegli il tratto da trasformare.';
    if(G.round===1 && idx===0) return 'Nella prima gara della partita il primo tratto resta rettilineo.';   // regola assoluta: 1ª gara, tratto 1 = rettilineo
    const seg=G.track[idx];
    if(seg.t===c.val) return 'Quel tratto è già '+(TIPO_LABEL[c.val]||c.val)+'.';
    const pool=(ROADS[seg.lvl||1]||[]).filter(r=>r.t===c.val);
    if(!pool.length) return 'Nessuna strada di quel tipo a questo livello.';
    const nr=pool[Math.floor(Math.random()*pool.length)];
    const keep={from:seg.from,to:seg.to,len:seg.len,lvl:seg.lvl};
    Object.keys(seg).forEach(k=>delete seg[k]);
    Object.assign(seg,{...nr},keep);
    glog(G,p.name+' trasforma il tratto '+(idx+1)+' in '+(TIPO_LABEL[c.val]||c.val)+' («'+seg.nm+'»)','card');
  }
  else if(c.eff==='reopen'){                                       // Tour privato: riapre un mercato (giro extra) solo per te, costa val
    const cost=c.val||0;
    if(p.money<cost) return 'Ti servono €'+cost+' per giocarla.';
    p.money-=cost;
    G.reshopBuys=G.reshopBuys||{}; G.reshopBuys[p.id]=(G.reshopBuys[p.id]||0)+1;   // 1 acquisto nel giro extra
    G.reshopQueued=true; if(G.reshopFirst==null) G.reshopFirst=p.id;
  }
  else if(c.eff==='reopenAll'){                                    // Apri a tutti: giro extra condiviso dopo la prep, 1 pezzo a testa
    G.reshopBuys=G.reshopBuys||{}; G.players.forEach(pp=>{ G.reshopBuys[pp.id]=(G.reshopBuys[pp.id]||0)+1; });
    // chi riapre sceglie per primo nel giro extra; un bot NON scavalca un umano che l'ha già rivendicata
    const prevHuman = G.reshopQueued && G.reshopFirst!=null && !((G.players.find(x=>x.id===G.reshopFirst)||{}).isBot);
    if(!(p.isBot && prevHuman)){ G.reshopQueued=true; G.reshopFirst=p.id; }
    else G.reshopQueued=true;
  }
  else if(c.eff==='reopenDebt'){                                   // riapre un mercato per te + 1 rivale scelto: 1 pezzo ciascuno, il rivale a metà prezzo
    G.reshopBuys=G.reshopBuys||{}; G.reshopHalf=G.reshopHalf||[];
    G.reshopBuys[p.id]=(G.reshopBuys[p.id]||0)+1;                  // tu: 1 acquisto nel giro extra (prezzo pieno)
    G.reshopBuys[tgt.id]=(G.reshopBuys[tgt.id]||0)+1;             // il rivale scelto: 1 acquisto nel giro extra
    if(!G.reshopHalf.includes(tgt.id)) G.reshopHalf.push(tgt.id);  // ...a metà prezzo
    G.reshopQueued=true; if(G.reshopFirst==null) G.reshopFirst=p.id;
  }
  else if(c.eff==='sprint'){                                       // gara breve: traguardo a c.val, una sola per gara
    if(G.sprintFinish) return 'Un\'altra gara breve è già stata organizzata. Riprova la prossima.';
    G.sprintFinish=c.val;
  }
  if(pregaraTarget(c)==='rival' && c.eff!=='reopenDebt' && tgt.id!==p.id) recordMalus(room, p, tgt, {phase:'pregara', eff:c.eff, val:c.val, applied:_ap, comp:_comp, lvl:_lvl, cardNome:c.nome});
  glog(G,p.name+' gioca «'+c.nome+'»'+(pregaraTarget(c)==='rival'&&tgt.id!==p.id?(' su '+tgt.name):''),'card');
  p.discard.push(c); p.hand.splice(handIdx,1); return null;
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
  return {comp:cp,lvl:lv};
}
function actPlayEsp(room,p,handIdx){                              // carta ESP: potenzia un pezzo già montato alla variante ESP, pagando (delta+1000)
  const G=room.G; if(G.phase!=='prep'||curPrep(G).id!==p.id) return 'Non è il tuo turno.';
  if(G.reshop) return 'Nel giro extra puoi solo comprare pezzi.';
  const c=p.hand[handIdx]; if(!c||c.cat!=='esp') return 'Carta ESP non valida.';
  if(p.comp[c.comp]!==c.lvl) return 'Ti serve '+(COMPLAB[c.comp]||c.comp)+' L'+c.lvl+' montato per usarla.';
  if(p.espOwned && p.espOwned[c.comp]===c.lvl) return 'Hai già la variante ESP su questo pezzo.';
  if(p.money<c.cost) return 'Ti servono €'+c.cost+' per il potenziamento.';
  p.money-=c.cost;
  p.espOwned=p.espOwned||{}; p.espOwned[c.comp]=c.lvl;             // statVal ora restituisce il valore ESP di quel pezzo
  glog(G,p.name+' potenzia '+(COMPLAB[c.comp]||c.comp)+' L'+c.lvl+' → ESP · €'+c.cost,'buy');
  p.discard.push(c); p.hand.splice(handIdx,1);
  return null;                                                    // non consuma un acquisto del banco; non è un attacco (nessuna difesa)
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
  glog(G,p.name+' gioca «'+c.nome+'» (polizia)','card');
  p.discard.push(c); p.hand.splice(handIdx,1); return null;
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
  recordMalus(room, attacker, target, {phase:'ingara', eff, val, dur, fxRef:_fx, prevDado:_prevDado, cardNome:pick[0]});
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
    G.R.cars[id]={ pos:0, firstDone:false, nosUsed:false, fx:[], pendDado:null, pendPart:0, pendReach:null, nosMod:0, dadoForza:null };
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
    G.R.cars[id]={ pos:0, firstDone:false, nosUsed:false, fx:[], pendDado:null, pendPart:0, pendReach:null, nosMod:0, dadoForza:null };
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
  if(!car.nosUsed && !first && seg.t!=='drift' && (statVal(pol,'nos')+(car.nosMod||0))>0){ let nv=Math.max(0,statVal(pol,'nos')+(car.nosMod||0)); if(seg.t==='citta') nv=Math.max(0,nv-1); total+=nv; useNos=true; }
  if(seg.pv && vel>seg.pv.gt) total-=seg.pv.a;
  if(seg.pc && ctrl<seg.pc.lt) total-=seg.pc.a;
  if(seg.pcg && ctrl>seg.pcg.gt) total-=seg.pcg.a;
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
  const changed=!p.bet||p.bet.targetId!==targetId||p.bet.amount!==amount;
  p.bet={ targetId, amount };
  if(changed){ const tn=(G.players.find(x=>x.id===targetId)||{}).name||'?'; glog(G,p.name+' scommette €'+amount+' su '+(targetId===p.id?'sé stesso':tn),'bet'); }
  return null;
}
function actPrepDone(room,p){
  const G=room.G; if(G.phase!=='prep'||curPrep(G).id!==p.id) return 'Non è il tuo turno.';
  if(!G.reshop) for(let i=p.hand.length-1;i>=0;i--){ const c=p.hand[i]; if(c.cat==='polizia'&&c.kind==='blocco'&&!blockPlaceable(G,c.size)){ p.discard.push(c); p.hand.splice(i,1); (G.forfeitedBlocks=G.forfeitedBlocks||[]).push({who:p.name,nome:c.nome}); } } // blocco senza spazio: annullato
  if(!G.reshop && p.hand.some(c=>c.cat==='polizia')) return 'Devi prima giocare la carta polizia (gira subito).';
  if(!G.reshop && p.bet){ if(p.bet.amount>p.money){ p.bet=null; } else { p.money-=p.bet.amount; } }
  if(G.reshop && p.buysLeft>0) glog(G, p.name+' non compra nel giro extra', 'card');
  G.ppIdx++;
  const o=pOrder(G);
  if(G.ppIdx<o.length){ const cp=curPrep(G); cp.buysLeft=1; }
  else if(!G.reshop && G.shopRound<G.shopRounds){ G.shopRound++; G.ppIdx=0; const cp=curPrep(G); cp.buysLeft=1; }   // secondo giro della prima officina: si ricomincia dal primo, 1 acquisto a testa
  else if(!G.reshop && G.reshopQueued){ startReshop(room); }   // chiudi l'officina, riaprila a tutti
  else { G.reshop=false; startLaunch(room); }   // tutti pronti → semaforo di partenza
  return null;
}

/* --- gara --- */
function setupRace(room){                                         // crea le auto: durante il semaforo le carte partenza accumulano pendPart
  const G=room.G;
  G.R={ turnOrder:[...G.order], turn:1, ptr:0, phase:'await', cars:{}, lastBreak:null, log:[], logId:0, finish:(G.sprintFinish||trackTotalCells(G)), turnDice:[], police:[], blocks:(G.blocks||[]).slice() };
  G.players.forEach(p=>{ G.R.cars[p.id]={ pos:0, firstDone:false, nosUsed:false, fx:[], pendDado:null, pendPart:0, pendReach:null, nosMod:0, dadoForza:null }; p.incoming=[]; });  // azzero incoming: finestra difese pre-gara chiusa
}
function beginRace(room){                                         // VERDE: quota, polizia, boss, parte il 1° turno
  const G=room.G;
  if(!G.R) setupRace(room);
  const fee=DB.roadBasePrice[G.raceLevel]||0;                    // quota d'ingresso: la paga ogni giocatore
  G.players.forEach(p=>{ const paid=Math.min(p.money,fee); p.money=Math.max(0,p.money-fee); p._entryFee=paid; });
  raceLog(G,{kind:'fee',amount:fee});
  spawnPolice(room);                                            // auto della polizia (1 per carta inseguimento)
  spawnBosses(room);                                            // boss (su level-up) + miniboss (25%)
  if(G.R.police.length){ const attacker=G.R.police[0]; G.players.forEach(p=>throwPoliceMalus(room, attacker, p)); }  // 1 malus a testa (non si moltiplica con più auto)
  G.phase='race';
  glog(G,'🟢 Semaforo verde · via alla gara liv. '+G.raceLevel,'race');
}
function startRace(room){ setupRace(room); beginRace(room); }    // avvio immediato (compat, non usato col semaforo)
function startLaunch(room){                                       // SEMAFORO: finestra di 6s per le carte partenza, poi parte la gara
  const G=room.G;
  setupRace(room);                                              // auto pronte sulla griglia (pendPart accumula)
  G.phase='launch'; G.launchEndsAt=Date.now()+6000; G.launchLog=[];
  botsPlayPartenza(room);                                       // i bot giocano subito le loro carte partenza
  if(room._launchTimer) clearTimeout(room._launchTimer);
  room._launchTimer=setTimeout(()=>{ room._launchTimer=null; try{ beginRace(room); }catch(e){ console.error('launch->race', e); } broadcast(room); scheduleBot(room); }, 6000);
}
function actPlayPartenza(room,p,handIdx,targetId){
  const G=room.G; if(G.phase!=='launch') return 'Non è il momento della partenza.';
  const c=p.hand[handIdx]; if(!c||c.cat!=='ingara'||c.eff!=='partenza') return 'Carta partenza non valida.';
  let target=p;
  if(c.target==='rival'){
    let t=G.players.find(x=>x.id===targetId && x.id!==p.id);
    if(!t && G.players.length===2) t=G.players.find(x=>x.id!==p.id);   // in 2 giocatori bersaglio automatico
    if(!t) return 'Scegli un rivale.'; target=t;
  }
  const tc=G.R&&G.R.cars[target.id]; if(!tc) return 'Auto non pronta.';
  tc.pendPart+=c.val;
  (G.launchLog=G.launchLog||[]).push({ who:p.name, target:target.name, targetId:target.id, nome:c.nome, val:c.val, self:(c.target!=='rival') });
  glog(G,p.name+' al via: «'+c.nome+'» '+(c.target!=='rival'?'su di sé':('su '+target.name)),'card');
  p.discard.push(c); p.hand.splice(handIdx,1);
  return null;                                                  // nessuna difesa, se ne possono giocare quante si vuole
}
function botsPlayPartenza(room){
  const G=room.G;
  G.players.filter(p=>p.isBot).forEach(bot=>{
    for(let i=bot.hand.length-1;i>=0;i--){ const c=bot.hand[i]; if(c.cat!=='ingara'||c.eff!=='partenza') continue;
      if(c.target==='rival'){ const rivals=G.players.filter(x=>x.id!==bot.id); const tg=rivals[Math.floor(Math.random()*rivals.length)]; if(tg) actPlayPartenza(room,bot,i,tg.id); }
      else actPlayPartenza(room,bot,i);
    }
  });
}
function activeRace(G){ return G.players.find(p=>p.id===G.R.turnOrder[G.R.ptr]); }
function dieBonus(d){ return d<=2?1:d<=5?2:3; }
const REACT_DIE={perfetto:6,quasi:4,mancato:1};   // Reazione (colpo di gas): perfetto=+3, quasi=+2, mancato=+1
function fxSum(R,p,stat){ return R.cars[p.id].fx.filter(e=>e.stat===stat).reduce((s,e)=>s+e.amt,0); }
function nosOwned(p){ return statVal(p,'nos'); }                                  // NOS che possiedi = valore del componente NOS montato
function bombSet(p,a,b){ if(!p.nosBombs) return false; a=Math.max(0,Math.min(13,a|0)); b=Math.max(0,Math.min(13,b|0)); if(a+b>nosOwned(p)) return false; p.nosBombs=[a,b]; return true; }
function bombPickFire(p){ if(!p.nosBombs) return -1; let best=-1,bv=0; p.nosBombs.forEach((c,i)=>{ if(c>=1&&c>bv){bv=c;best=i;} }); return best; }   // di default attiva la bombola più carica
function bombAddCharge(p,val){ if(!p.nosBombs) return;
  if(val>=0){ let i=(p.nosBombs[1]<p.nosBombs[0])?1:0; p.nosBombs[i]+=val; if(p.nosBombs[i]>13) p.nosBombs[i]=Math.floor(p.nosBombs[i]/2); }   // bonus sulla meno carica; sballo oltre 13 → dimezza
  else { let i=(p.nosBombs[1]>p.nosBombs[0])?1:0; p.nosBombs[i]=Math.max(0,p.nosBombs[i]+val); } }   // malus sulla più carica
function nosAllowed(G,p){ const car=G.R.cars[p.id]; const seg=segOf(G,Math.max(1,car.pos)); if(!car.firstDone) return false; if(seg.t==='drift') return false;
  if(p.nosBombs){ const cd=(car.nosTurn||0); const ready=(cd===0||G.R.turn>=cd+2); return ready && p.nosBombs.some(c=>c>=1); }   // L4+: bombola carica e fuori cooldown (1 tiro)
  if(car.nosUsed) return false; if((statVal(p,'nos')+(car.nosMod||0))<=0) return false; return true; }

function computeMove(G,p,die,useNos){
  const R=G.R; const car=R.cars[p.id]; const first=!car.firstDone; const seg=segOf(G,Math.max(1,car.pos));
  if(car.pendReach){
    const ranked=G.players.map(x=>R.cars[x.id].pos).sort((a,b)=>b-a);   // classifica per posizione, decrescente
    const ref=Math.min(ranked.length, Math.max(1, car.pendReach.ref));  // 1 = primo, 2 = secondo
    let target=Math.max(0, Math.min(trackTotalCells(G), (ranked[ref-1]||0)+(car.pendReach.off||0)));
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
  const pb=(p.pilot&&p.pilot.bonus)||{};                                             // bonus del pilota
  const hasTratto = !!(p.pilot.tratto && p.pilot.tratto.t);
  const onTratto = !hasTratto || (p.pilot.tratto.t===seg.t);                          // senza tratto (Diavoli): il bonus vale ovunque
  const trattoLbl = hasTratto ? ' ('+TIPO_LABEL[seg.t]+')' : '';
  if(onTratto && pb.vel){ total+=pb.vel; vel+=pb.vel; lines.push({k:'Pilota · Velocità'+trattoLbl,v:pb.vel,cls:pb.vel>0?'pos':'neg'}); }
  if(onTratto && pb.ctrl){ total+=pb.ctrl; ctrl+=pb.ctrl; lines.push({k:'Pilota · Controllo'+trattoLbl,v:pb.ctrl,cls:pb.ctrl>0?'pos':'neg'}); }
  if(first){ const pStart=(hasTratto?(p.pilot.tratto.v||0):0)+(p.pilot.partenza||0); if(pStart){ total+=pStart; lines.push({k:'Partenza pilota',v:pStart,cls:pStart>0?'pos':'neg'}); } }
  if(car.pendPart){ total+=car.pendPart; lines.push({k:'Carta partenza',v:car.pendPart,cls:car.pendPart>0?'pos':'neg'}); }
  if(first && p.pilot.fortuna && p.pilot.fortuna.set.includes(die)){ const fv=p.pilot.fortuna.v; total+=fv; vel+=fv; lines.push({k:'Fortuna 1° tiro',v:fv,cls:'pos'}); }
  if(car.dadoForza && car.dadoForza.set.includes(die)){ const df=car.dadoForza; total+=df.val; if(df.stat==='vel') vel+=df.val; else if(df.stat==='ctrl') ctrl+=df.val; const es=df.set.includes(6)?'perfetto':df.set.includes(4)?'quasi':'mancato'; lines.push({k:'Forza · colpo '+es,v:df.val,cls:'pos'}); }
  if(useNos){ let nv;
    if(p.nosBombs){ const bi=(car.pendBomb!=null)?car.pendBomb:bombPickFire(p); nv=(bi>=0)?p.nosBombs[bi]:0; }
    else { nv=statVal(p,'nos')+(car.nosMod||0); }
    nv=Math.max(0,nv); if(seg.t==='citta') nv=Math.max(0,nv-1); const add=nv+(onTratto?(pb.nos||0):0); total+=add; lines.push({k:'NOS'+(seg.t==='citta'?' (–1 città)':'')+((onTratto&&pb.nos)?' +pilota':''),v:add,cls:'nos'}); }
  if(!noPen){
    if(seg.pv && vel>seg.pv.gt){ total-=seg.pv.a; lines.push({k:'Pen. Drift (Vel '+vel+'>'+seg.pv.gt+')',v:-seg.pv.a,cls:'neg'}); }
    if(seg.pc && ctrl<seg.pc.lt){ total-=seg.pc.a; lines.push({k:'Pen. Controllo (Ctrl '+ctrl+'<'+seg.pc.lt+')',v:-seg.pc.a,cls:'neg'}); }
    if(seg.pcg && ctrl>seg.pcg.gt){ total-=seg.pcg.a; lines.push({k:'Pen. Rettilineo (Ctrl '+ctrl+'>'+seg.pcg.gt+')',v:-seg.pcg.a,cls:'neg'}); }
  }
  if(seg.bv && vel>seg.bv.gt){ total+=seg.bv.a; lines.push({k:'Bonus Rettilineo (Vel '+vel+'>'+seg.bv.gt+')',v:seg.bv.a,cls:'pos'}); }   // premio velocità
  if(seg.al){ const aL=seg.lvl||1; if(p.comp.motore===aL && p.comp.peso===aL){ total+=seg.al.a; lines.push({k:'Allineamento (Mot+Peso L'+aL+')',v:seg.al.a,cls:'pos'}); } }   // premio Motore/Peso/Strada allineati
  if(total<0){ lines.push({k:'Minimo',v:0,info:true}); total=0; }
  return { lines, total, die, db, useNos, segType:seg.t, vel, ctrl };
}

function raceLog(G,e){ if(!G.R)return; e.id=++G.R.logId; e.t=G.R.turn; G.R.log.push(e); if(G.R.log.length>60)G.R.log.shift(); }
function glog(G,text,kind){ if(!G)return; G.gameSeq=(G.gameSeq||0)+1; (G.gameLog=G.gameLog||[]).push({ id:G.gameSeq, round:G.round||1, phase:G.phase, kind:kind||'info', text:text }); if(G.gameLog.length>240) G.gameLog.shift(); }   // registro di TUTTA la partita
const COMPLAB={motore:'Motore',cambio:'Cambio',sterzo:'Sterzo',assetto:'Assetto',peso:'Peso',nos:'NOS'};
const COMP_STAT={motore:'vel',cambio:'vel',sterzo:'ctrl',assetto:'ctrl',peso:'mov',nos:'nos'};   // su quale stat incide ogni componente
function raceHandNote(c, gangOK){
  if(c.cat==='pregara'||c.cat==='esp') return 'in officina';
  if(c.cat==='difesa') return 'quando ti colpiscono';
  if(c.cat==='ingara' && c.eff==='partenza') return 'solo al via';
  if(c.cat==='ingara' && c.gangLock && !gangOK) return 'solo pilota '+c.gang;
  if(c.cat==='polizia') return 'gira in officina';
  return 'non ora';
}
function actRacePlayCard(room,p,handIdx,targetId){
  const G=room.G; if(G.phase!=='race') return 'Non in gara.';
  if(activeRace(G).id!==p.id) return 'Non è il tuo turno.';
  if(G.R.phase!=='await') return 'Hai già tirato.';
  const c=p.hand[handIdx]; if(!c||c.cat!=='ingara') return 'Carta non valida.';
  if(c.eff==='defend') return 'Le difese si usano solo quando vieni colpito.';
  if(c.gangLock && (!p.pilot || p.pilot.gang!==c.gang)) return 'Carta della gang '+c.gang+': la gioca solo un suo pilota.';   // carte a doppio valore = solo pilota della gang
  /* --- dado-forza: se il prossimo dado esce nel set, bonus stat per il tiro (solo su di sé) --- */
  if(c.eff==='dadoforza'){
    const tc=G.R.cars[p.id]; if(!tc) return 'Auto non pronta.';
    tc.dadoForza={ set:c.set.slice(), stat:c.stat, val:c.val };
    raceLog(G,{kind:'card',who:p.name,target:p.name,targetId:p.id,nome:c.nome,eff:c.eff});
    glog(G,p.name+' gioca «'+c.nome+'» (gara)','card');
    p.discard.push(c); p.hand.splice(handIdx,1); return null;
  }
  /* --- carta multi-effetto (gang / NOS): ogni componente si applica al suo bersaglio;
         i malus verso i giocatori restano difendibili uno a uno --- */
  if(c.eff==='multi'){
    const rivals=G.players.filter(x=>x.id!==p.id);
    let pickT=null, pickFoe=false;
    if((c.effects||[]).some(e=>e.tgt==='pick')){
      pickT=G.players.find(x=>x.id===targetId && x.id!==p.id);
      if(!pickT){ const b=(G.R.bosses||[]).find(b=>b.id===targetId); if(b){ pickT=b; pickFoe=true; } }
      if(!pickT && G.players.length===2) pickT=rivals[0];        // in 2 giocatori bersaglio automatico
      if(!pickT) return 'Scegli un rivale valido.';
    }
    const dur=c.dur||1;
    for(const e of (c.effects||[])){
      let tgts;
      if(e.tgt==='self') tgts=[p];
      else if(e.tgt==='pick') tgts=[pickT];
      else if(e.tgt==='rivals') tgts=rivals;
      else tgts=G.players.filter(x=>x.id!==p.id && (!pickT || x.id!==pickT.id));   // 'others' = tutti tranne chi gioca e il bersaglio
      for(const tg of tgts){
        const tcCar=G.R.cars[tg.id]; if(!tcCar) continue;
        const isPlayerFoe = (tg!==p) && !tg.kind && !tg.isPolice;                  // solo i giocatori si difendono
        if(e.stat==='nosmod'){
          if(tg.nosBombs) bombAddCharge(tg,e.val); else tcCar.nosMod=(tcCar.nosMod||0)+e.val;
          if(isPlayerFoe && e.val<0) recordMalus(room, p, tg, {phase:'ingara', eff:'nosmod', val:e.val, cardNome:c.nome});
        } else {
          const fx={stat:e.stat, amt:e.val, turns:dur}; tcCar.fx.push(fx);
          if(isPlayerFoe && e.val<0) recordMalus(room, p, tg, {phase:'ingara', eff:e.stat, val:e.val, dur, fxRef:fx, cardNome:c.nome});
        }
      }
    }
    raceLog(G,{kind:'card',who:p.name,target:(pickT?pickT.name:p.name),targetId:(pickT?pickT.id:p.id),nome:c.nome,eff:c.eff});
    glog(G,p.name+' gioca «'+c.nome+'»'+(pickT?(' su '+pickT.name):'')+' (gara)','card');
    p.discard.push(c); p.hand.splice(handIdx,1); return null;
  }
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
  glog(G,p.name+' gioca «'+c.nome+'»'+(c.target==='rival'&&target.id!==p.id?(' su '+target.name):'')+' (gara)','card');
  if(c.target==='rival' && target.id!==p.id && !isFoe) recordMalus(room, p, target, {phase:'ingara', eff:c.eff, val:c.val, dur:c.dur, fxRef:_fx, prevDado:_prevDado, cardNome:c.nome});  // i boss non si difendono
  p.discard.push(c); p.hand.splice(handIdx,1); return null;
}
function actRoll(room,p,useNos,reaction,bombIdx){
  const G=room.G; if(G.phase!=='race') return 'Non in gara.';
  if(activeRace(G).id!==p.id) return 'Non è il tuo turno.';
  if(G.R.phase!=='await') return 'Hai già tirato.';
  p.incoming=(p.incoming||[]).filter(m=>m.phase!=='ingara');   // finestra di difesa chiusa: ora il malus fa effetto
  const car=G.R.cars[p.id];
  const realNos = !!useNos && nosAllowed(G,p);
  if(realNos && p.nosBombs){ car.pendBomb=(bombIdx!=null && p.nosBombs[bombIdx]>=1)?bombIdx:bombPickFire(p); } else { car.pendBomb=null; }
  const die = car.pendDado || (reaction && REACT_DIE[reaction]) || d6();   // Reazione del giocatore; dado truccato ha precedenza; bot (no reaction) → d6
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
  if(b.useNos){ if(p.nosBombs && car.pendBomb!=null){ p.nosBombs[car.pendBomb]=0; car.nosTurn=G.R.turn; car.pendBomb=null; } else { car.nosUsed=true; } }
  car.firstDone=true; G.raceFirstRollDone=true;
  car.dist=(car.dist||0)+b.total;                       // distanza reale percorsa (non tappata) → classifica photo-finish
  car.pos=Math.min(G.R.finish||55,car.pos+b.total);
  const onBlk=(G.R.blocks||[]).find(bl=>car.pos>=bl.from&&car.pos<=bl.to);
  if(onBlk && car.pos>0){ p.money=Math.max(0,p.money-500); raceLog(G,{kind:'fine',who:p.name,amount:500,pos:car.pos}); glog(G,'🚧 '+p.name+' multato al blocco · −€500 (cas. '+car.pos+')','fine'); }
  raceLog(G,{kind:'move',who:p.name,seg:TIPO_LABEL[b.segType]||b.segType,mov:b.total,pos:car.pos,die:b.die});
  glog(G,p.name+' muove '+b.total+' → cas. '+car.pos+' ('+(TIPO_LABEL[b.segType]||b.segType)+')','move');
  car.pendPart=0; car.pendDado=null; car.pendReach=null; car.dadoForza=null;
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

function dragOff3(p){ let s=0; const mov=statsOf(p).mov; for(let k=0;k<3;k++) s+=Math.max(0,mov)+dieBonus(d6()); return s; }  // spareggio: 3 tiri su strip pulito, vince la distanza più alta
function endRace(room){
  const G=room.G;
  const distOf=p=>(G.R.cars[p.id].dist!=null?G.R.cars[p.id].dist:G.R.cars[p.id].pos);   // photo-finish: distanza reale percorsa (non tappata)
  const ranked=[...G.players].sort((a,b)=>distOf(b)-distOf(a));
  G.lastTiebreaks=[];
  { let i=0; while(i<ranked.length){ let j=i; while(j+1<ranked.length && distOf(ranked[j+1])===distOf(ranked[i])) j++;
      if(j>i){ const group=ranked.slice(i,j+1);                                          // pari-merito esatti → spareggio a 3 tiri solo tra loro
        const scored=group.map(p=>({p,s:dragOff3(p)})).sort((a,b)=>b.s-a.s||Math.random()-0.5);
        for(let k=0;k<scored.length;k++) ranked[i+k]=scored[k].p;
        G.lastTiebreaks.push({ cell:G.R.cars[group[0].id].pos, players:scored.map(o=>({name:o.p.name,score:o.s})) });
      } i=j+1; } }
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
        const t=G.players.find(x=>x.id===p.bet.targetId); const q=Math.max(1.05, Math.min(6, DB.quoteScommessa[Math.min(7,t.prevRank)]+(t.quotaMod||0)));
        if(p.bet.targetId===winnerId){ const payout=Math.round(p.bet.amount*q*(t.betMult||1)); p.money+=p.bet.amount+payout; p._betDelta=payout; p._betWin=true; }
        else { p._betDelta=-p.bet.amount; }
      }
    }
    p.bet=null;
  });
  G.players.forEach(p=>{ while(p.hand.length<5){ const card=drawCard(p,G.trackLevel); if(!card) break; p.hand.push(card); } });
  const racedLevels=G.track.map(c=>c.lvl);
  advanceTrack(room);
  G.lastTrackInfo={ racedLevels, change:G.lastTrackChange };
  const goalPO=G.targetPO||DB.obiettivo;
  G.winner = G.players.some(p=>p.po>=goalPO) ? [...G.players].sort((a,b)=>b.po-a.po||b.money-a.money)[0] : null;
  G.lastResults = ranked.map(p=>({ id:p.id, name:p.name, colorH:DB.colori[p.colorIdx].h, pos:p._finalPos, cell:G.R.cars[p.id].pos, po:p._gainPO, money:p._gainMoney, betDelta:p._betDelta, busted:!!p._busted, bustReason:p._bustReason||null, bossBonus:p._bossBonus||0, bossList:p._bossList||[] }));
  glog(G,'🏁 Fine gara liv. '+G.raceLevel,'race');
  ranked.forEach(p=>{ const bits=[]; if(p._gainMoney) bits.push((p._gainMoney>0?'+':'')+'€'+p._gainMoney); if(p._gainPO) bits.push('+'+p._gainPO+' PO'); if(p._betDelta) bits.push('scommessa '+(p._betDelta>0?('vinta +€'+p._betDelta):('persa −€'+Math.abs(p._betDelta)))); if(p._busted) bits.push('beccato'); glog(G,p._finalPos+'° '+p.name+(bits.length?(' · '+bits.join(' · ')):''),'result'); });
  G.lastRaceRecap = {
    quota: base,
    blocks: (G.R.blocks||[]).map(b=>({from:b.from,to:b.to,size:b.size})),
    police: (G.R.police||[]).map(pl=>({name:pl.name, pos:G.R.cars[pl.id].pos})),
    bosses: (G.R.bosses||[]).map(b=>({name:b.name, kind:b.kind, reward:b.reward, pos:G.R.cars[b.id].pos, beatenBy: ranked.filter(p=>!p._busted && G.R.cars[p.id].pos>G.R.cars[b.id].pos).map(p=>p.name)})),
    busted: ranked.filter(p=>p._busted).map(p=>({name:p.name, reason:p._bustReason})),
    fines: (function(){ const m={}; (G.R.log||[]).filter(e=>e.kind==='fine').forEach(e=>{ (m[e.who]=m[e.who]||{who:e.who,total:0,cells:[]}); m[e.who].total+=e.amount; m[e.who].cells.push(e.pos); }); return Object.values(m); })(),
    reopened: (function(){ const ro=(G.reshopFirst!=null)&&G.players.find(x=>x.id===G.reshopFirst); return ro?ro.name:null; })(),
    forfeited: (G.forfeitedBlocks||[]).map(f=>({who:f.who,nome:f.nome})),
    tiebreaks: (G.lastTiebreaks||[])
  };
  G.phase = G.winner ? 'win' : 'results';
  maybeStartVote(room);
}

/* ===== VOTO SEGRETO BONUS — nel riepilogo, una volta ogni 2 gare, solo con >=3 giocatori reali dispari ===== */
const VOTE_MS=20000, VIDEO_MS=30000;
function voteBonus(lvl){ return ({1:200,2:400,3:700,4:1000,5:1000})[Math.min(5,Math.max(1,lvl||1))]||200; }
function clearVoteTimer(room){ if(room._voteTimer){ clearTimeout(room._voteTimer); room._voteTimer=null; } }
function maybeStartVote(room){
  const G=room.G; if(G.phase!=='results') return;            // niente voto sulla vittoria finale
  const reals=G.players.filter(p=>!p.isBot);
  if(reals.length<3 || reals.length%2===0) return;           // servono >=3 reali e in numero dispari
  if(G.round%2!==0) return;                                  // una volta ogni 2 gare (round pari)
  clearVoteTimer(room);
  G.vote={ stage:'voting', amount:voteBonus(G.raceLevel), votes:{}, eligible:reals.map(p=>p.id), endsAt:Date.now()+VOTE_MS, videoEndsAt:0, tally:null, result:null, credited:false };
  room._voteTimer=setTimeout(()=>resolveVote(room), VOTE_MS);
}
function actVote(room,p,choice){
  const G=room.G, v=G.vote;
  if(!v || v.stage!=='voting' || !v.eligible.includes(p.id) || v.votes[p.id]) return null;
  v.votes[p.id]=(choice==='si')?'si':'no';
  if(v.eligible.every(id=>v.votes[id])){ clearVoteTimer(room); resolveVote(room); }   // tutti hanno votato -> risolvi subito (handle fa il broadcast)
  return null;
}
function resolveVote(room){
  const G=room.G, v=G.vote; if(!v || v.stage!=='voting') return;
  let si=0,no=0; v.eligible.forEach(id=>{ if(v.votes[id]==='si') si++; else no++; });  // chi non vota entro il timer = no
  v.tally={si,no}; v.result=(si>no)?'si':'no'; clearVoteTimer(room);
  if(v.result==='si'){ v.stage='video'; v.videoEndsAt=Date.now()+VIDEO_MS; room._voteTimer=setTimeout(()=>creditVote(room), VIDEO_MS); }
  else { v.stage='done'; }
  broadcast(room);
}
function creditVote(room){
  const G=room.G, v=G.vote; if(!v || v.stage!=='video') return;
  v.eligible.forEach(id=>{ const pl=G.players.find(x=>x.id===id); if(pl) pl.money+=v.amount; });   // +bonus a tutti i reali
  v.stage='done'; v.credited=true; clearVoteTimer(room);
  broadcast(room);
}

function advanceTrack(room){
  const G=room.G; const L=G.trackLevel;
  G._lvlRaces=(G._lvlRaces||0)+1;                                // gare giocate a QUESTO livello (questa inclusa)
  const crossed=G.players.map(p=>{ const pos=G.R.cars[p.id].pos; return G.track.filter(c=>c.to<=pos).length; });
  const passedAll=Math.min(...crossed);                          // la finestra scorre di quante strade hanno superato TUTTI
  const lead=Math.max(...crossed);                               // il vincitore = chi è più avanti
  const slow=Math.min(...G.players.map(p=>G.R.cars[p.id].pos)); // posizione (casella) dell'ultimo
  const r2=G.track[1];                                           // seconda strada della finestra
  const thr=r2?(r2.from+0.30*r2.len):Infinity;                   // soglia: 30% dentro la 2ª strada
  const winnerOk=lead>=3 && G.track.slice(0,lead).filter(c=>c.lvl>=L).length>=3;   // vincitore: almeno 3 strade INTERE del livello in corso
  let advance=winnerOk && (slow>=thr);                           // + l'ultimo ha raggiunto il 30% della 2ª strada
  if(L===1){ if(G._lvlRaces<2) advance=false; else if(G._lvlRaces>=4) advance=true; }   // L1: min 2 gare, forzato dopo 4
  else if(L===2){ if(G._lvlRaces>=6) advance=true; }                                     // L2: forzato dopo 6
  else if(L===3){ if(G._lvlRaces>=9) advance=true; }                                     // L3: forzato dopo 9
  advance = advance && (L<DB.maxLevelRoads);                     // L4 è il tetto: non si sale oltre
  let change={ passedAll, addedCount:0, oldLevel:L, newLevel:L, advanced:false };
  if(advance){ G.trackLevel=L+1; G.bossPending=L; G._lvlRaces=0; }   // salita: boss del livello completato (appare nella gara dopo) + azzero il contatore
  const fillLvl=advance?(L+1):L;
  if(passedAll>=1){
    G.track=G.track.slice(passedAll);
    for(let k=0;k<passedAll;k++) G.track.push(newCardOfLevel(fillLvl));
    change.addedCount=passedAll;
  } else if(advance){ G.track[G.track.length-1]=newCardOfLevel(fillLvl); }
  change.newLevel=G.trackLevel; change.advanced=advance;
  layoutTrack(G.track);
  G.lastTrackChange=change;
  for(const lv of [2,3,4,5]){ if(G.trackLevel>=lv && G.scaleUnlocked && !G.scaleUnlocked[lv]){ G.scaleUnlocked[lv]=true; G.players.forEach(p=>{ const add = p.deckDef ? personalDeckCards(p.deckDef,lv) : addRandomPolice(packCards(lv),lv); p.deck=shuffle((p.deck||[]).concat(add)); }); change.scaleUnlocked=(change.scaleUnlocked||[]).concat(lv); } }   // il pack del nuovo livello (+1 polizia a caso) entra in ogni mazzo
}
function actNextRound(room,p){
  const G=room.G; if(G.phase!=='results') return 'Non disponibile ora.';
  if(p.id!==room.hostId) return 'Solo l\'host avvia la gara.';
  if(G.vote && G.vote.stage!=='done') return 'Attendi la fine del voto bonus.';
  G.vote=null; clearVoteTimer(room);
  startRound(room); return null;
}

/* ============================ VISTE ============================ */
function publicPlayers(G,duringRace){
  return G.players.map(p=>({
    id:p.id, name:p.name, colorH:DB.colori[p.colorIdx].h, po:p.po, money:p.money, connected:p.connected,
    pos: duringRace ? G.R.cars[p.id].pos : null,
    pilot: p.pilot?{ nome:p.pilot.nome, gang:p.pilot.gang, tipoLabel:p.pilot.tipoLabel, liv:p.pilot.liv, ab:p.pilot.ab }:null,
    car: p.pilot?{ stats:statsOf(p), owned:ownedView(p) }:null
  }));
}
function trackView(G){
  return G.track.map(c=>{
    const pen=[];
    if(c.pv) pen.push({stat:'Velocità', cmp:'>', thr:c.pv.gt, amt:c.pv.a});
    if(c.pc) pen.push({stat:'Controllo', cmp:'<', thr:c.pc.lt, amt:c.pc.a});
    if(c.pcg) pen.push({stat:'Controllo', cmp:'>', thr:c.pcg.gt, amt:c.pcg.a});
    return { t:c.t, label:TIPO_LABEL[c.t], nm:c.nm, lvl:c.lvl, from:c.from, to:c.to, pen };
  });
}
function statsOf(p){
  const vel=statVal(p,'motore')+statVal(p,'cambio'), ctrl=statVal(p,'sterzo')+statVal(p,'assetto');
  return { vel, ctrl, mov:vel+ctrl+statVal(p,'peso'), nos:statVal(p,'nos') };
}
function ownedView(p){ return DB.ordine.map(c=>{ const cur=p.comp[c]; const own=((p.lvlOwned&&p.lvlOwned[c])||[0]).slice().sort((a,b)=>a-b); const down=own.length>=2?own[own.length-2]:0; return { comp:c, name:DB.nomi[c], lvl:cur, val:DB.valori[c][cur], down }; }); }

function buildView(room, player){
  const G=room.G;
  const v={ phase:G.phase, code:room.code, round:G.round||0, targetPO:(G.targetPO||DB.obiettivo),
    you:{ id:player.id, name:player.name, colorH:DB.colori[player.colorIdx].h, isHost:player.id===room.hostId },
  };
  if(G.phase!=='lobby' && G.phase!=='reveal') v.gameLog=(G.gameLog||[]).slice(-140).map(e=>({ id:e.id, round:e.round, phase:e.phase, kind:e.kind, text:e.text }));   // diario di tutta la partita
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
      deckSize:(player.pilotPool?player.pilotPool.length:0),
      pilot:p.drew?{ nome:p.pilot.nome, gang:p.pilot.gang, tipoLabel:p.pilot.tipoLabel, liv:p.pilot.liv, ab:p.pilot.ab }:null,
      roll:p.roll,
      startPos:G.diceOrder.indexOf(p.id)+1,
      ready:p.ready,
      hand:p.hand.map(c=>({ cat:c.cat, nome:c.nome, eff:c.eff, val:c.val, dur:c.dur, target:c.target, costPO:c.costPO, gang:c.gang, desc:c.desc||cardDesc(c), needsTarget:cardNeedsTarget(c) }))
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
    v.reshopBy=(G.reshopFirst!=null)?((G.players.find(x=>x.id===G.reshopFirst)||{}).name||null):null;
    v.sprintFinish=(G.sprintFinish||null);
    v.incoming=incomingFor(player);
    v.compMaxLevel=G.compMaxLevel;
    v.policeWaiting=G.players.filter(x=>(x.hand||[]).some(c=>c.cat==='polizia')).map(x=>x.name);
    v.pendBlocks=(G.blocks||[]).map(b=>({from:b.from,to:b.to,size:b.size,byName:b.byName}));
    v.trackTotal=trackTotalCells(G);
    v.order=[...G.order];
    v.lastRace=(G.round>1 && G.prevResults) ? G.prevResults.map(r=>({ id:r.id, name:r.name, colorH:r.colorH, pos:r.pos, busted:!!r.busted })) : null;
    v.market=(G.market||[]).map(c=>{
      const pl=player; const cap=!canHaveAtLevel(pl,c.comp,c.lvl);
      const below=c.lvl<=pl.comp[c.comp]; const overcap=c.lvl>G.compMaxLevel;
      const price=priceFor(G,pl,c.comp,c.lvl); const skip=c.lvl>pl.comp[c.comp]+1;
      const buyable=v.isYourTurn && !cap && !below && !overcap && pl.buysLeft>0 && pl.money>=price;
      let reason=''; if(below)reason='hai già L'+pl.comp[c.comp]; else if(overcap)reason='pista L'+G.compMaxLevel; else if(cap)reason='tetto pieno'; else if(pl.money<price)reason='soldi insuff.'; else if(pl.buysLeft<=0)reason='niente acquisti';
      return { comp:c.comp, name:DB.nomi[c.comp], lvl:c.lvl, val:DB.valori[c.comp][c.lvl], stat:COMP_STAT[c.comp], delta:DB.valori[c.comp][c.lvl]-statVal(pl,c.comp), price, skip, buyable, reason };
    });
    if(v.isYourTurn){
      const p=player;
      v.policeHand=p.hand.map((c,idx)=>({c,idx})).filter(o=>o.c.cat==='polizia').map(o=>({idx:o.idx,nome:o.c.nome,kind:o.c.kind,size:o.c.size}));
      v.mustPlayPolice=p.hand.some(c=>c.cat==='polizia');
      v.track=trackView(G);
      v.me={ money:p.money, po:p.po, buysLeft:p.buysLeft, stats:statsOf(p), owned:ownedView(p), handCount:p.hand.length, prizeMult:(p.prizeMult||1), betMult:(p.betMult||1), quotaMod:(p.quotaMod||0), discount:(p.discountNext||0), nosBombs:p.nosBombs, nosOwned:nosOwned(p) };
      v.pregara = p.hand.map((c,idx)=>({ idx, cat:c.cat, nome:c.nome, eff:c.eff, val:c.val, target:pregaraTarget(c), costPO:(c.costPO||0) })).filter(c=>c.cat==='pregara' && c.eff!=='defend' && !(G.reshop && (c.eff==='reopen'||c.eff==='reopenAll'||c.eff==='reopenDebt')));
      v.handAll = p.hand.map((c,idx)=>{ const o={ idx, cat:c.cat, nome:c.nome, eff:c.eff, val:c.val, dur:c.dur, costPO:(c.costPO||0), gang:c.gang, desc:c.desc||cardDesc(c), needsTarget:cardNeedsTarget(c) }; if(c.cat==='pregara') o.target=pregaraTarget(c); if(c.cat==='esp'){ o.comp=c.comp; o.lvl=c.lvl; o.cost=c.cost; o.espVal=c.espVal; } return o; }).filter(c=>c.cat!=='polizia');
      v.canBet = !G.reshop && G.round>=2;
      if(v.canBet){
        v.betTargets=G.players.map(t=>({ id:t.id, name:t.name, colorH:DB.colori[t.colorIdx].h, quote:Math.round(Math.max(1.05, Math.min(6, DB.quoteScommessa[Math.min(7,t.lastRank)]+(t.quotaMod||0)))*(t.betMult||1)*100)/100, you:t.id===p.id }));
        v.myBet=p.bet?{ targetId:p.bet.targetId, amount:p.bet.amount }:null;
      }
    }
    return v;
  }

  if(G.phase==='launch'){
    v.launchEndsAt=G.launchEndsAt||0; v.raceLevel=G.raceLevel;
    v.launchMs=Math.max(0,(G.launchEndsAt||0)-Date.now());   // ms rimanenti: il client ancora il countdown al momento della ricezione
    v.launchLog=(G.launchLog||[]).map(e=>({ who:e.who, target:e.target, nome:e.nome, val:e.val, self:!!e.self }));
    v.cars=G.players.map(p=>({ id:p.id, name:p.name, colorH:DB.colori[p.colorIdx].h, ini:ini(p.name) }));
    v.rivals=G.players.filter(x=>x.id!==player.id).map(x=>({ id:x.id, name:x.name, colorH:DB.colori[x.colorIdx].h }));
    v.partenza=player.hand.map((c,idx)=>({c,idx})).filter(o=>o.c.cat==='ingara'&&o.c.eff==='partenza').map(o=>({ idx:o.idx, nome:o.c.nome, val:o.c.val, target:o.c.target }));
    v.myPart=(G.R&&G.R.cars[player.id])?G.R.cars[player.id].pendPart:0;
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
        pilotNome:p.pilot.nome, gang:p.pilot.gang, ab:p.pilot.ab, pilotTipoLabel:p.pilot.tipoLabel, pilotLiv:p.pilot.liv,
        vel:statVal(p,'motore')+statVal(p,'cambio')+fxVel, ctrl:statVal(p,'sterzo')+statVal(p,'assetto')+fxCtrl,
        mov:statVal(p,'motore')+statVal(p,'cambio')+statVal(p,'sterzo')+statVal(p,'assetto')+statVal(p,'peso'),
        segType:seg.t, segLabel:TIPO_LABEL[seg.t], firstDone:car.firstDone,
        nosOk:nosAllowed(G,p), nosVal:statVal(p,'nos'), nosBombs:p.nosBombs,
        fx:car.fx.map(e=>({stat:e.stat,amt:e.amt,turns:e.turns})), pendPart:car.pendPart, pendDado:car.pendDado,
        hand:p.hand.map((c,idx)=>{ const gOK=!c.gangLock||(!!p.pilot&&p.pilot.gang===c.gang); const playable=c.cat==='ingara'&&c.eff!=='defend'&&c.eff!=='partenza'&&gOK; return {idx,cat:c.cat,nome:c.nome,eff:c.eff,val:c.val,dur:c.dur,target:c.target,gang:c.gang,desc:c.desc||cardDesc(c),needsTarget:cardNeedsTarget(c),gangLock:!!c.gangLock,gangOK:gOK,playable,note:playable?'':raceHandNote(c,gOK)}; }),
        rivals:[...G.players.filter(x=>x.id!==p.id).map(x=>({id:x.id,name:x.name,colorH:DB.colori[x.colorIdx].h})), ...(R.bosses||[]).map(b=>({id:b.id,name:b.name,colorH:b.kind==='boss'?'#ff3b3b':'#ffa733',isFoe:true,kind:b.kind}))]
      };
      v.rolled = R.phase==='rolled' ? (function(){ const b=R.lastBreak; return { lines:b.lines, total:b.total, die:b.die, db:b.db, useNos:b.useNos, np:Math.min(R.finish||55,car.pos+b.total), finish:(R.finish||0) }; })() : null;
    }
    return v;
  }

  if(G.phase==='results' || G.phase==='win'){
    v.results=G.lastResults;
    v.trackInfo=G.lastTrackInfo;
    v.raceRecap=G.lastRaceRecap;
    v.champ=[...G.players].sort((a,b)=>b.po-a.po||b.money-a.money).map(p=>({ id:p.id, name:p.name, colorH:DB.colori[p.colorIdx].h, po:p.po, money:p.money }));
    v.youMoney=player.money;
    v.canNext=(player.id===room.hostId) && !(G.vote && G.vote.stage!=='done');
    if(G.vote){ const vt=G.vote; v.vote={ stage:vt.stage, amount:vt.amount, n:vt.eligible.length, eligible:vt.eligible.includes(player.id), youVoted:!!vt.votes[player.id], endsAt:vt.endsAt||0, videoEndsAt:vt.videoEndsAt||0, tally:vt.tally||null, result:vt.result||null, credited:!!vt.credited }; }
    if(G.winner) v.winner={ name:G.winner.name, pilot:G.winner.pilot.nome, gang:G.winner.pilot.gang, po:G.winner.po };
    return v;
  }
  return v;
}
function broadcast(room){
  if(!IO) return;
  room.G.players.forEach(p=>{ if(p.socketId){ const s=IO.sockets.sockets.get(p.socketId); if(s) s.emit('state', buildView(room,p)); } });
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
    if(c.eff==='tratto'){ const idxs=G.track.map((s,ix)=>({s,ix})).filter(o=>o.s.t!==c.val && !(G.round===1 && o.ix===0)); if(idxs.length){ const pick=idxs[Math.floor(Math.random()*idxs.length)]; actPlayPregara(room,bot,i,null,pick.ix); } continue; }
    const self=(c.eff==='money'&&c.val>0)||(c.eff==='po'&&c.val>0)||c.eff==='prizeUp'||c.eff==='betUp'||c.eff==='discount'||(c.eff==='quota'&&c.val>0); const rival=(c.val<0)||c.eff==='prizeDown'||c.eff==='betDown'; if(self) actPlayPregara(room,bot,i); else if(rival){ const tg=[...G.players].filter(x=>x.id!==bot.id).sort((a,b)=>b.po-a.po)[0]; if(tg) actPlayPregara(room,bot,i,tg.id); } }
  // 2) acquisti (solo dalle carte scoperte del mercato)
  let safety=12;
  while(bot.buysLeft>0 && safety-->0){
    const opts=(G.market||[]).filter(c=> c.lvl>bot.comp[c.comp] && c.lvl<=G.compMaxLevel && canHaveAtLevel(bot,c.comp,c.lvl) && priceFor(G,bot,c.comp,c.lvl)<=bot.money-300);
    if(!opts.length) break;
    const w={motore:3,cambio:3,sterzo:3,assetto:3,nos:2,peso:2};
    opts.sort((a,b)=>{
      const ga=(DB.valori[a.comp][a.lvl]-DB.valori[a.comp][bot.comp[a.comp]])*(w[a.comp]||1);
      const gb=(DB.valori[b.comp][b.lvl]-DB.valori[b.comp][bot.comp[b.comp]])*(w[b.comp]||1);
      return gb-ga;
    });
    if(actBuy(room,bot,opts[0].comp,opts[0].lvl)) break;
  }
  for(let i=bot.hand.length-1;i>=0;i--){ const c=bot.hand[i]; if(c.cat!=='esp') continue;   // carte ESP: potenzia se hai il pezzo base a quel livello e i soldi
    if(bot.comp[c.comp]===c.lvl && !(bot.espOwned&&bot.espOwned[c.comp]===c.lvl) && bot.money>=c.cost+300) actPlayEsp(room,bot,i);
  }
  if(bot.nosBombs){ const n=nosOwned(bot); bombSet(bot, Math.min(13,n), Math.max(0,n-13)); }   // bot: riempi A, il resto in B
  actPrepDone(room,bot);
}
function botRace(room,bot){
  const G=room.G, R=G.R;
  if(R.phase==='await'){
    const reachC=bot.hand.map((c,i)=>({c,i})).filter(o=>o.c.cat==='ingara'&&o.c.eff==='reach');
    const behind=G.players.some(p=>p.id!==bot.id&&R.cars[p.id].pos>R.cars[bot.id].pos);
    const gangOK=c=>!c.gangLock||(bot.pilot&&bot.pilot.gang===c.gang);   // rispetta il lock di gang
    const isSelfMulti=c=>c.eff==='multi'&&gangOK(c)&&(c.effects||[]).every(e=>e.tgt==='self')&&(c.effects||[]).some(e=>e.val>0);
    const isAtkMulti=c=>c.eff==='multi'&&gangOK(c)&&(c.effects||[]).some(e=>(e.tgt==='pick'||e.tgt==='rivals')&&e.val<0);
    const selfPos=bot.hand.map((c,i)=>({c,i})).filter(o=>o.c.cat==='ingara'&&((o.c.target==='self'&&(o.c.eff==='vel'||o.c.eff==='ctrl')&&o.c.val>0)||isSelfMulti(o.c)||o.c.eff==='dadoforza'));
    const rivalNeg=bot.hand.map((c,i)=>({c,i})).filter(o=>o.c.cat==='ingara'&&(o.c.target==='rival'||isAtkMulti(o.c)));
    if(reachC.length && behind && Math.random()<0.5) actRacePlayCard(room,bot,reachC[0].i);
    else if(selfPos.length && Math.random()<0.45) actRacePlayCard(room,bot,selfPos[0].i);
    else if(rivalNeg.length && Math.random()<0.5){ const lead=[...G.players].filter(p=>p.id!==bot.id).sort((a,b)=>R.cars[b.id].pos-R.cars[a.id].pos)[0]; if(lead) actRacePlayCard(room,bot,rivalNeg[0].i,lead.id); }
    actRoll(room,bot, nosAllowed(G,bot)&&Math.random()<0.5);
    actConfirmMove(room,bot);
  } else if(R.phase==='rolled') actConfirmMove(room,bot);
}
function botAct(room){
  const G=room.G;
  if(G.phase==='reveal'){ G.players.forEach(p=>{ if(p.isBot){ if(!p.drew && p.pilotPool && p.pilotPool.length){ const pid=p.pilotPool.pop(); p.pilot=DB.piloti.find(q=>q.id===pid); p.drew=true; } p.ready=true; } }); if(G.players.every(p=>p.ready)) startRound(room); return; }
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
function mount(ioInstance){
  IO = ioInstance;
  IO.on('connection', (socket)=>{

  socket.on('createRoom', ({name,colorIdx,deck}, cb)=>{
    const code=genCode();
    const room={ code, hostId:0, started:false, G:{ phase:'lobby', players:[], nextId:0, targetPO:50 } };
    const p={ id:0, socketId:socket.id, name:cleanName(name), colorIdx: (colorIdx>=0&&colorIdx<8)?colorIdx:0, connected:true, deckDef:sanitizeDeck(deck) };
    room.G.players.push(p); room.G.nextId=1; room.hostId=0;
    rooms.set(code, room); socketToRoom.set(socket.id, code); socket.join(code);
    if(cb) cb({ ok:true, code, youId:0 });
    broadcast(room);
  });

  socket.on('joinRoom', ({code,name,colorIdx,deck}, cb)=>{
    code=(code||'').toUpperCase().trim();
    const room=rooms.get(code);
    if(!room){ if(cb) cb({ ok:false, error:'Stanza inesistente.' }); return; }
    const ex=room.G.players.find(x=>x.name.toLowerCase()===cleanName(name).toLowerCase());
    if(ex && (room.started || !ex.connected)){                  // riaggancio per nome: in partita sempre, in lobby se disconnesso
      ex.socketId=socket.id; ex.connected=true; socketToRoom.set(socket.id, code); socket.join(code);
      if(ex._dcTimer){ clearTimeout(ex._dcTimer); ex._dcTimer=null; }
      if(cb) cb({ ok:true, code, youId:ex.id, rejoined:true }); broadcast(room); return;
    }
    if(room.started){ if(cb) cb({ ok:false, error: ex?'Nome già in uso.':'Partita già iniziata.' }); return; }
    if(ex){ if(cb) cb({ ok:false, error:'Nome già in uso in questa sala.' }); return; }
    if(room.G.players.length>=8){ if(cb) cb({ ok:false, error:'Stanza piena (max 8).' }); return; }
    let ci=(colorIdx>=0&&colorIdx<8)?colorIdx:freeColorIdx(room);
    if(room.G.players.some(x=>x.colorIdx===ci)){ ci=freeColorIdx(room); }
    if(ci<0){ if(cb) cb({ ok:false, error:'Nessun colore libero.' }); return; }
    const id=room.G.nextId++;
    const p={ id, socketId:socket.id, name:cleanName(name), colorIdx:ci, connected:true, deckDef:sanitizeDeck(deck) };
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

  socket.on('setTargetPO', ({po})=>{
    const f=playerBySocket(socket); if(!f||f.room.started) return; const {room,p}=f;
    if(p.id!==room.hostId) return;                                 // solo l'host
    if(![50,70,100].includes(po)) return;                          // solo i valori previsti
    room.G.targetPO=po; broadcast(room);
  });

  socket.on('addBot', ()=>{
    const f=playerBySocket(socket); if(!f){ socket.emit('errorMsg','Connessione persa: ricarica la pagina.'); return; }
    if(f.room.started) return; const {room,p}=f;
    if(p.id!==room.hostId){ socket.emit('errorMsg','Solo l\'host può aggiungere una CPU.'); return; }
    if(room.G.players.length>=8){ socket.emit('errorMsg','Sala piena (max 8).'); return; }
    const ci=freeColorIdx(room); if(ci<0){ socket.emit('errorMsg','Nessun colore libero.'); return; }
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
  socket.on('prep:buy', handle((room,p,d)=>actBuy(room,p,d.comp,d.lvl)));
  socket.on('prep:playCard', handle((room,p,d)=>actPlayPregara(room,p,d.handIdx,d.targetId,d.comp)));
  socket.on('prep:discard', handle((room,p,d)=>actDiscard(room,p,d.handIdx)));
  socket.on('prep:police', handle((room,p,d)=>actPlayPolice(room,p,d.handIdx,d.cell)));
  socket.on('prep:playEsp', handle((room,p,d)=>actPlayEsp(room,p,d.handIdx)));
  socket.on('prep:bet', handle((room,p,d)=>actSetBet(room,p,d.targetId,d.amount)));
  socket.on('prep:done', handle((room,p)=>actPrepDone(room,p)));
  socket.on('launch:play', handle((room,p,d)=>actPlayPartenza(room,p,d.handIdx,d.targetId)));
  socket.on('race:playCard', handle((room,p,d)=>actRacePlayCard(room,p,d.handIdx,d.targetId)));
  socket.on('race:roll', handle((room,p,d)=>actRoll(room,p,d.useNos,d.reaction,d.bombIdx)));
  socket.on('bomb:set', handle((room,p,d)=>{ bombSet(p, d.a, d.b); return null; }));
  socket.on('race:move', handle((room,p)=>actConfirmMove(room,p)));
  socket.on('defend', handle((room,p,d)=>actDefend(room,p,d.handIdx,d.mid)));
  socket.on('defense:play', handle((room,p,d)=>actDefend(room,p,d.handIdx,d.mid)));
  socket.on('results:next', handle((room,p)=>actNextRound(room,p)));
  socket.on('results:vote', handle((room,p,d)=>actVote(room,p,d.choice)));

  socket.on('leave', ()=>{ const f=playerBySocket(socket); if(!f) return; const {room,p}=f; if(p._dcTimer){ clearTimeout(p._dcTimer); p._dcTimer=null; } room.G.players=room.G.players.filter(x=>x.id!==p.id); if(room.G.players.length===0 || !room.G.players.some(x=>!x.isBot)){ rooms.delete(room.code); return; } if(p.id===room.hostId){ const h=room.G.players.find(x=>!x.isBot&&x.connected)||room.G.players.find(x=>!x.isBot); if(h) room.hostId=h.id; } broadcast(room); });
  socket.on('disconnect', ()=>{
    const f=playerBySocket(socket); socketToRoom.delete(socket.id);
    if(!f) return; const {room,p}=f;
    p.connected=false; p.socketId=null;
    if(!room.started){
      // in lobby: NON cancellare subito — dà tempo al riaggancio (mobile/Render free)
      const otherHuman=room.G.players.find(x=>!x.isBot && x.connected && x.id!==p.id);
      if(p.id===room.hostId && otherHuman){ room.hostId=otherHuman.id; }   // se ci sono altri umani, l'host passa subito
      if(p._dcTimer) clearTimeout(p._dcTimer);
      p._dcTimer=setTimeout(()=>{                                          // scaduta la finestra: pulizia
        p._dcTimer=null; if(p.connected) return;
        room.G.players=room.G.players.filter(x=>x.id!==p.id);
        if(room.G.players.length===0 || !room.G.players.some(x=>!x.isBot)){ rooms.delete(room.code); return; }
        if(p.id===room.hostId){ const h=room.G.players.find(x=>!x.isBot&&x.connected)||room.G.players.find(x=>!x.isBot); if(h) room.hostId=h.id; }
        broadcast(room);
      }, 60000);
      broadcast(room); return;
    }
    broadcast(room);
  });
  });
}

module.exports = { mount, DB, startGame, startRound, actReady, curPrep, activeRace, actBuy, actPlayPregara, actPlayEsp, actPlayPolice, actSetBet, actPrepDone, actRacePlayCard, actRoll, actConfirmMove, actNextRound, buildView, botAct, botPending, actDefend, incomingFor, stockAvail, compSlots, endRace, startLaunch, beginRace, setupRace, actPlayPartenza };

if(require.main===module){
  // Avvio STANDALONE (node server.js): crea un server proprio e monta il classico
  // sul path socket.io di DEFAULT, cosi' index.html (io()) funziona come sempre.
  const app = express();
  app.get('/', (req,res)=>res.sendFile(path.join(__dirname,'landing.html')));   // pagina d'ingresso: la home con negozio e collezione
  app.use(express.static(__dirname));
  const server = http.createServer(app);
  const io = new Server(server);
  mount(io);
  const PORT = process.env.PORT || 3000;
  server.listen(PORT, ()=>console.log('2FAST4U (classico standalone) in ascolto sulla porta '+PORT));
}
