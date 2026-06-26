/* =====================================================================
   2FAST4U - MODALITA' B (Deck personale) - server multiplayer autorevole
   File SEPARATO dal classico (server.js): modificarlo non tocca la A.
   Differenze rispetto al classico:
     - MAZZO PERSONALE: ogni giocatore pesca dal PROPRIO deck (costruito
       nel deck-builder), non da un mazzo condiviso. La pesca e' gated per
       livello pista (le carte di livello > pista restano nel mazzo).
     - OFFICINA PERSONALE: ogni giocatore compra dal proprio banco di pezzi
       (varianti esp su L3/L4, limite pezzi a L4). Niente mercato condiviso.
     - PILOTA: ne porti 6, ne guidi 1 (gia' scelto nel deck-builder).
   Il MOTORE DI GARA (movimento, dado/NOS, difese, malus, polizia, boss,
   scommesse, avanzamento livello, voto) e' COPIATO dal classico, immutato.
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
  quoteScommessa: [1.05,1.2,1.5,2,2.5,3,4,5],
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
 ['Hai montato un nuovo filtro aria','vel',1,2,'self'],['La marmitta si allenta','vel',-1,1,'rival'],['Una curva mal presa ti rallenta','vel',-1,1,'rival'],
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
 ['Riflessi felini','ingara',0],['Schivata all\'ultimo','ingara',0],['Sangue freddo','ingara',0],['Lo eviti in un lampo','ingara',0],['Colpo di reni','ingara',0],['Scarto secco','ingara',0],['Effetto specchio','ingara',1],['Sterzata provvidenziale','ingara',0],['Controsterzo da maestro','ingara',0],['Nervi d\'acciaio','ingara',0],['Rispedito al mittente','ingara',1],
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
/* ===== CARTE SCALATE — entrano col livello pista (cumulative), formato [nome,eff,val,dur,target,rarità]
   Griglia comune/raro (magnitudo): Velocità+Partenza 3·4 / 5·6 / 7·8 ; Controllo 2·3 / 4·5 / 6·7 (L2/L3/L4).
   Bonus = +val (self), Malus = −val (rival), speculari. 30 carte/livello, 90 totali.
   rarità: 'comune' | 'raro'. (In Modalità A entrano tutte; per la Modalità B i 'raro' saranno espansione.) ===== */
const C_SCALE_L2 = [
  // Velocità — Bonus (+3 comune ×6, +4 raro ×1)
  ["Turbo a pieni giri","vel",3,1,"self","comune"],["Iniezione racing","vel",3,1,"self","comune"],["Collettori liberi","vel",3,1,"self","comune"],["Sgommata d'autore","vel",3,1,"self","comune"],["Cambiata fulminea","vel",3,1,"self","comune"],["Scia sfruttata bene","vel",3,1,"self","comune"],["Sovrappressione turbo","vel",4,1,"self","raro"],
  // Velocità — Malus (−3 comune ×6, −4 raro ×1)
  ["Gomma sgonfia","vel",-3,1,"rival","comune"],["Bullone allentato","vel",-3,1,"rival","comune"],["Frizione che pattina","vel",-3,1,"rival","comune"],["Cinghia consumata","vel",-3,1,"rival","comune"],["Turbo che perde pressione","vel",-3,1,"rival","comune"],["Filtro intasato","vel",-3,1,"rival","comune"],["Gomma forata in curva","vel",-4,1,"rival","raro"],
  // Controllo — Bonus (+2 comune ×4, +3 raro ×1)
  ["Assetto azzeccato","ctrl",2,1,"self","comune"],["Volante preciso","ctrl",2,1,"self","comune"],["Gomme in temperatura","ctrl",2,1,"self","comune"],["Differenziale a punto","ctrl",2,1,"self","comune"],["Differenziale autobloccante","ctrl",3,1,"self","raro"],
  // Controllo — Malus (−2 comune ×4, −3 raro ×1)
  ["Sterzo molle","ctrl",-2,1,"rival","comune"],["Gomme fredde","ctrl",-2,1,"rival","comune"],["Assetto sfasato","ctrl",-2,1,"rival","comune"],["Sospensione molle","ctrl",-2,1,"rival","comune"],["Geometrie sballate","ctrl",-3,1,"rival","raro"],
  // Partenza — Bonus (+3 comune ×2, +4 raro ×1)
  ["Reazione fulminea al verde","partenza",3,0,"self","comune"],["Frizione perfetta al via","partenza",3,0,"self","comune"],["Holeshot pulito","partenza",4,0,"self","raro"],
  // Partenza — Malus (−3 comune ×2, −4 raro ×1)
  ["Parti in ritardo","partenza",-3,0,"rival","comune"],["Ingolfi al semaforo","partenza",-3,0,"rival","comune"],["Spegni sulla griglia","partenza",-4,0,"rival","raro"],
];
const C_SCALE_L3 = [
  // Velocità — Bonus (+5 comune ×6, +6 raro ×1)
  ["Mappa motore aggressiva","vel",5,1,"self","comune"],["Aspirazione diretta","vel",5,1,"self","comune"],["Antilag attivato","vel",5,1,"self","comune"],["Sorpasso da manuale","vel",5,1,"self","comune"],["Pista libera davanti","vel",5,1,"self","comune"],["Doppia frizione che canta","vel",5,1,"self","comune"],["Launch control perfetto","vel",6,1,"self","raro"],
  // Velocità — Malus (−5 comune ×6, −6 raro ×1)
  ["Surriscaldamento motore","vel",-5,1,"rival","comune"],["Olio sull'asfalto","vel",-5,1,"rival","comune"],["Iniettore intasato","vel",-5,1,"rival","comune"],["Sospensione cedevole","vel",-5,1,"rival","comune"],["Foratura improvvisa","vel",-5,1,"rival","comune"],["Cambio incrodato","vel",-5,1,"rival","comune"],["Turbina in affanno","vel",-6,1,"rival","raro"],
  // Controllo — Bonus (+4 comune ×4, +5 raro ×1)
  ["Setup da pista","ctrl",4,1,"self","comune"],["Sterzo diretto","ctrl",4,1,"self","comune"],["Aderenza perfetta","ctrl",4,1,"self","comune"],["Alettone regolato","ctrl",4,1,"self","comune"],["Telaio rigido su misura","ctrl",5,1,"self","raro"],
  // Controllo — Malus (−4 comune ×4, −5 raro ×1)
  ["Sottosterzo improvviso","ctrl",-4,1,"rival","comune"],["Sospensione rotta","ctrl",-4,1,"rival","comune"],["Asfalto viscido","ctrl",-4,1,"rival","comune"],["Retrotreno ballerino","ctrl",-4,1,"rival","comune"],["Telaio storto","ctrl",-5,1,"rival","raro"],
  // Partenza — Bonus (+5 comune ×2, +6 raro ×1)
  ["Scatto da dragster","partenza",5,0,"self","comune"],["Stacco di frizione chirurgico","partenza",5,0,"self","comune"],["Partenza fotocopia","partenza",6,0,"self","raro"],
  // Partenza — Malus (−5 comune ×2, −6 raro ×1)
  ["Spegni al semaforo","partenza",-5,0,"rival","comune"],["Ruote che fumano a vuoto","partenza",-5,0,"rival","comune"],["Parti col freno a mano","partenza",-6,0,"rival","raro"],
];
const C_SCALE_L4 = [
  // Velocità — Bonus (+7 comune ×6, +8 raro ×1)
  ["Motore portato al limite","vel",7,1,"self","comune"],["Big turbo che spinge","vel",7,1,"self","comune"],["Centralina sbloccata","vel",7,1,"self","comune"],["Rettilineo divorato","vel",7,1,"self","comune"],["Tutto il cavallaggio a terra","vel",7,1,"self","comune"],["Pieno carico in spinta","vel",7,1,"self","comune"],["Cavallaggio scatenato","vel",8,1,"self","raro"],
  // Velocità — Malus (−7 comune ×6, −8 raro ×1)
  ["Motore fuso a metà gara","vel",-7,1,"rival","comune"],["Albero a camme spezzato","vel",-7,1,"rival","comune"],["Trasmissione distrutta","vel",-7,1,"rival","comune"],["Detonazione in camera","vel",-7,1,"rival","comune"],["Freno motore bloccato","vel",-7,1,"rival","comune"],["Cinghia esplosa","vel",-7,1,"rival","comune"],["Motore esploso","vel",-8,1,"rival","raro"],
  // Controllo — Bonus (+6 comune ×4, +7 raro ×1)
  ["Aerodinamica da formula","ctrl",6,1,"self","comune"],["Grip totale sull'asfalto","ctrl",6,1,"self","comune"],["Bilanciamento perfetto","ctrl",6,1,"self","comune"],["Downforce massima","ctrl",6,1,"self","comune"],["Assetto da gara perfetto","ctrl",7,1,"self","raro"],
  // Controllo — Malus (−6 comune ×4, −7 raro ×1)
  ["Aderenza persa del tutto","ctrl",-6,1,"rival","comune"],["Testacoda sfiorato","ctrl",-6,1,"rival","comune"],["Sbandata in rettilineo","ctrl",-6,1,"rival","comune"],["Avantreno che scappa","ctrl",-6,1,"rival","comune"],["Sterzo bloccato","ctrl",-7,1,"rival","raro"],
  // Partenza — Bonus (+7 comune ×2, +8 raro ×1)
  ["Holeshot perfetto","partenza",7,0,"self","comune"],["Partenza da campionato","partenza",7,0,"self","comune"],["Bruciati tutti al via","partenza",8,0,"self","raro"],
  // Partenza — Malus (−7 comune ×2, −8 raro ×1)
  ["Cali il motore al via","partenza",-7,0,"rival","comune"],["Frizione bruciata in partenza","partenza",-7,0,"rival","comune"],["Stallo in griglia","partenza",-8,0,"rival","raro"],
];
const SCALE_PACKS = {2:C_SCALE_L2, 3:C_SCALE_L3, 4:C_SCALE_L4};
function mapScale(arr){ return arr.map(c=>({cat:'ingara',nome:c[0],eff:c[1],val:c[2],dur:c[3],target:c[4],rar:c[5]})); }

/* ===================================================================
   MODALITA' B — DATI PERSONALI (mazzo / officina / pilota)
   =================================================================== */
/* Varianti esp dei pezzi (raro): valore e prezzo a L3/L4. Il peso non ha esp.
   Valori dal deck-builder (DATA.pieces.esp). */
DB.espValori = { motore:{3:7,4:9}, cambio:{3:7,4:8}, sterzo:{3:8,4:9}, assetto:{3:6,4:8}, nos:{3:7,4:9} };
DB.espPrezzi = { motore:{3:2650,4:3900}, cambio:{3:2600,4:3250}, sterzo:{3:3200,4:3900}, assetto:{3:2100,4:3250}, nos:{3:2000,4:2900} };

/* effetti pre-gara presenti nei mazzi BASE della B (le altre — prize/smonta/reopen — sono espansione, escluse) */
const BASE_PREGARA_EFF = ['po','money','discount','sprint','betUp','betDown','quota'];

/* mappa nome -> carta (per costruire il mazzo da una config del deck-builder, che usa i nomi).
   NB: nei dati sorgente esistono pochi nomi duplicati (es. "Ti prendooooo!!!!" usato sia
   bonus sia malus): la mappa ne tiene uno solo — limite noto del deck-builder, non del motore. */
const NAME_MAP = (function(){
  const m={};
  C_INGARA.forEach(c=>{ m[c[0]]={cat:'ingara',nome:c[0],eff:c[1],val:c[2],dur:c[3],target:c[4],lvl:1}; });
  [2,3,4].forEach(L=> SCALE_PACKS[L].forEach(c=>{ m[c[0]]={cat:'ingara',nome:c[0],eff:c[1],val:c[2],dur:c[3],target:c[4],lvl:L,rar:c[5]}; }));
  C_DIFESA.forEach(c=>{ m[c[0]]={cat:'difesa',nome:c[0],eff:'defend',val:c[1],dur:c[2]}; });
  C_PREGARA.forEach(c=>{ m[c[0]]={cat:'pregara',nome:c[0],eff:c[1],val:c[2],costPO:c[3]}; });
  C_POLIZIA.forEach(c=>{ m[c[0]]={cat:'polizia',nome:c[0],kind:c[1],size:c[2]}; });
  return m;
})();

/* costruisce un mazzo (array di carte) da una config. Ogni voce puo' essere un NOME
   (dal deck-builder) o gia' un oggetto carta (usato dalla simulazione). Sempre clonata. */
function buildDeckFromCfg(cfg){
  const out=[];
  const add=(list)=>{ (list||[]).forEach(it=>{ const c=(typeof it==='string')?NAME_MAP[it]:it; if(c) out.push({...c}); }); };
  add(cfg.ingara); add(cfg.difesa); add(cfg.pregara); add(cfg.polizia);
  return out;
}

/* mazzo di DEFAULT (giocatore senza deck salvato): 80 In gara + 17 difese + 24 pre-gara + 8 polizia */
function defaultDeckCards(){
  const out=[];
  C_INGARA.filter(c=>['vel','ctrl','partenza'].includes(c[1])).forEach(c=> out.push({cat:'ingara',nome:c[0],eff:c[1],val:c[2],dur:c[3],target:c[4],lvl:1}));   // 54 carte L1 (no dado/reach: speciali = espansione)
  const commons=L=> SCALE_PACKS[L].filter(c=>c[5]==='comune');
  commons(2).slice(0,12).forEach(c=> out.push({cat:'ingara',nome:c[0],eff:c[1],val:c[2],dur:c[3],target:c[4],lvl:2}));
  commons(3).slice(0,8 ).forEach(c=> out.push({cat:'ingara',nome:c[0],eff:c[1],val:c[2],dur:c[3],target:c[4],lvl:3}));
  commons(4).slice(0,6 ).forEach(c=> out.push({cat:'ingara',nome:c[0],eff:c[1],val:c[2],dur:c[3],target:c[4],lvl:4}));
  C_DIFESA.filter(c=>c[2]!==1).forEach(c=> out.push({cat:'difesa',nome:c[0],eff:'defend',val:c[1],dur:c[2]}));   // 17 (no specchio)
  C_PREGARA.filter(c=>BASE_PREGARA_EFF.includes(c[1])).forEach(c=> out.push({cat:'pregara',nome:c[0],eff:c[1],val:c[2],costPO:c[3]}));   // 24
  C_POLIZIA.filter(c=>c[1]==='blocco'&&(c[2]===4||c[2]===6)).forEach(c=> out.push({cat:'polizia',nome:c[0],kind:c[1],size:c[2]}));   // 8
  return out;
}
const DEFAULT_OFF = { espL3:[], espL4:[], l4:['motore','sterzo','assetto','nos'] };   // free player: niente esp, 4 pezzi abilitati a L4
const DEFAULT_PILOT = 1;
function makeDefaultCfg(){ return { ingara:defaultDeckCards().filter(c=>c.cat==='ingara'), difesa:[], pregara:[], polizia:[], pilot:DEFAULT_PILOT, esp:{L3:[],L4:[]}, l4:DEFAULT_OFF.l4 }; }

/* applica la config di un giocatore (mazzo + officina personale + pilota) all'avvio partita */
function applyPlayerConfig(p){
  const cfg=p.deckCfg;
  let cards;
  if(cfg && (cfg.ingara||cfg.difesa||cfg.pregara||cfg.polizia)){
    cards=buildDeckFromCfg(cfg);
    // se la config non porta difese/pregara/polizia, completa col default di quelle categorie
    if(!cards.some(c=>c.cat==='difesa'))  defaultDeckCards().filter(c=>c.cat==='difesa').forEach(c=>cards.push(c));
    if(!cards.some(c=>c.cat==='pregara')) defaultDeckCards().filter(c=>c.cat==='pregara').forEach(c=>cards.push(c));
    if(!cards.some(c=>c.cat==='polizia')) defaultDeckCards().filter(c=>c.cat==='polizia').forEach(c=>cards.push(c));
  } else { cards=defaultDeckCards(); }
  p.deck=shuffle(cards); p.discard=[];
  const off=(cfg&&cfg.esp)?{espL3:cfg.esp.L3||[],espL4:cfg.esp.L4||[],l4:cfg.l4||DEFAULT_OFF.l4}:DEFAULT_OFF;
  p.espL3=new Set(off.espL3); p.espL4=new Set(off.espL4); p.l4set=new Set(off.l4);
  const pid=(cfg&&cfg.pilot)||DEFAULT_PILOT;
  p.pilot=DB.piloti.find(q=>q.id===pid)||DB.piloti[0];
}

/* valore/prezzo del pezzo TENENDO CONTO della variante esp personale del giocatore */
function pieceVal(p,comp,lvl){
  lvl=+lvl||0;
  if(lvl===3 && p.espL3 && p.espL3.has(comp) && DB.espValori[comp]) return DB.espValori[comp][3];
  if(lvl===4 && p.espL4 && p.espL4.has(comp) && DB.espValori[comp]) return DB.espValori[comp][4];
  return DB.valori[comp][lvl];
}
function pieceBasePrice(p,comp,lvl){
  lvl=+lvl||0;
  if(lvl===3 && p.espL3 && p.espL3.has(comp) && DB.espPrezzi[comp]) return DB.espPrezzi[comp][3];
  if(lvl===4 && p.espL4 && p.espL4.has(comp) && DB.espPrezzi[comp]) return DB.espPrezzi[comp][4];
  return DB.prezzi[comp][lvl];
}
/* un pezzo puo' raggiungere quel livello? L4 solo se abilitato nel deck-builder (max 4 su 6) */
function pieceReach(p,comp,lvl){ lvl=+lvl; if(lvl<1||lvl>4) return false; if(lvl===4 && !(p.l4set&&p.l4set.has(comp))) return false; return true; }

/* pesca dal mazzo PERSONALE, gated per livello pista:
   In gara -> solo carte di livello <= pista ; Polizia -> solo da pista L2 ; pre-gara/difesa -> sempre.
   Le carte non ancora "sbloccate" restano nel mazzo. */
function cardAvailable(card, G){
  if(card.cat==='ingara') return (card.lvl||1) <= (G.trackLevel||1);
  if(card.cat==='polizia') return (G.trackLevel||1) >= 2;
  return true;
}
function drawCardP(p, G){
  if(!p.deck) p.deck=[];
  for(let pass=0; pass<2; pass++){
    for(let i=p.deck.length-1;i>=0;i--){ if(cardAvailable(p.deck[i],G)) return p.deck.splice(i,1)[0]; }
    if(p.discard && p.discard.length){ p.deck=shuffle(p.deck.concat(p.discard)); p.discard=[]; } else break;
  }
  return null;
}

function makeDeck(){ const d=[]; C_INGARA.forEach(c=>d.push({cat:'ingara',nome:c[0],eff:c[1],val:c[2],dur:c[3],target:c[4]})); C_PREGARA.forEach(c=>d.push({cat:'pregara',nome:c[0],eff:c[1],val:c[2],costPO:c[3]})); C_DIFESA.forEach(c=>d.push({cat:'difesa',nome:c[0],eff:'defend',val:c[1],dur:c[2]})); return shuffle(d); }
function makePoliceDeck(){ return C_POLIZIA.map(c=>({cat:'polizia',nome:c[0],kind:c[1],size:c[2]})); }
function drawCard(G){
  if(!G.deck||!G.deck.length){ if(G.discard&&G.discard.length){ G.deck=shuffle(G.discard); G.discard=[]; } else { G.deck=makeDeck(); } }
  return G.deck.length ? G.deck.pop() : null;
}
function statVal(p,k){ return pieceVal(p,k,p.comp[k]); }   // B: valore personale del pezzo (con variante esp)

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
  G.trackLevel=1;
  G.players.forEach((p,idx)=>{
    p.money=4000; p.po=0;
    p.comp={motore:0,cambio:0,sterzo:0,assetto:0,peso:0,nos:0};
    p.lvlOwned={motore:[0],cambio:[0],sterzo:[0],assetto:[0],peso:[0],nos:[0]};
    p.lastRank=idx; p.prevRank=idx; p.hand=[]; p.drew=true; p.ready=true;
    applyPlayerConfig(p);                                   // B: mazzo + officina + pilota PERSONALI
  });
  G.players.forEach(p=>{ for(let k=0;k<3;k++){ const card=drawCardP(p,G); if(card) p.hand.push(card); } });   // pesca iniziale 3 dal PROPRIO mazzo
  G.market=[]; G.marketUsed={}; G.marketSeq=0; G.prevResults=null;
  G.round=0; room.started=true; G.policeUnlocked=true; G.blocks=[]; G.pendPolice=[]; G.bossPending=null;
  G.gameLog=[]; G.gameSeq=0;
  startRound(room);                                         // pilota gia' scelto: niente fase "pesca pilota", si parte dall'officina
}
function restartGame(room){
  const G=room.G;
  if(room._botTimer){ clearTimeout(room._botTimer); room._botTimer=null; }
  if(room._launchTimer){ clearTimeout(room._launchTimer); room._launchTimer=null; }
  room.started=false;
  G.phase='lobby';
  G.round=0; G.R=null; G.lastResults=null; G.winner=null;
  G.gameLog=[]; G.gameSeq=0;
  G.track=[]; G.order=[]; G.diceOrder=[];
  G.market=[]; G.marketUsed={}; G.marketSeq=0; G.prevResults=null;
  G.players.forEach((p,i)=>{
    p.pilot=null; p.drew=false; p.ready=false;
    p.money=4000; p.po=0;
    p.comp={motore:0,cambio:0,sterzo:0,assetto:0,peso:0,nos:0};
    p.lvlOwned={motore:[0],cambio:[0],sterzo:[0],assetto:[0],peso:[0],nos:[0]};
    p.hand=[]; p.bet=null; p.deck=null; p.discard=[];
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
  G.market=[]; G.marketUsed={};                                          // ogni officina riparte pulita: le carte invendute NON si accumulano dai round precedenti
  revealMarket(G, G.maxBuys * G.players.length);   // PEZZI = ACQUISTI: il banco scopre tanti pezzi quanti gli acquisti totali (maxBuys a testa × giocatori). Round 1: 2 a testa · dal round 2: 1 a testa
  G.raceLevel=G.trackLevel;
  G.entryFee=DB.roadBasePrice[G.raceLevel];
  G.raceFirstRollDone=false;
  G.ppIdx=0; G.phase='prep'; G.R=null; if(G.lastResults) G.prevResults=G.lastResults; G.lastResults=null; G.reshop=false; G.reshopQueued=false; G.reshopFirst=null; G.reshopBuys={}; G.reshopHalf=[]; G.sprintFinish=null;
  G.blocks=[]; G.pendPolice=[]; G.forfeitedBlocks=[];
  G.players.forEach(p=>{ p.bet=null; p.prizeMult=1; p.betMult=1; p.quotaMod=0; p.discountNext=false; p.incoming=[]; });
  curPrep(G).buysLeft=G.maxBuys;
  glog(G,'— Round '+G.round+' · officina aperta · gara liv. '+G.raceLevel,'round');
}
function compSlots(N,lvl){ return Math.max(1, N - Math.max(0, lvl-2)); }   // posti totali per tipo a un livello: L1-2=N, L3=N-1, L4=N-2, L5=N-3 (min 1)
function stockAvail(G,comp,lvl){ return compSlots(G.players.length,lvl) - G.players.filter(x=>x.comp[comp]===lvl).length; }   // disponibili = posti − chi tiene già quel livello (il pezzo rientra da solo quando uno sale)
/* ===== MERCATO a carte scoperte (regola verificata: 1° mercato N×2, successivi N; si compra solo dalle scoperte) ===== */
function deckCountForLevel(N,lvl){ return ({1:4,2:3,3:3,4:Math.max(0,N-2),5:Math.max(0,N-3)})[lvl]||0; }   // (non usato in B)
function revealMarket(G,count){ G.market=[]; }                  // B: nessun mercato condiviso — l'officina e' personale (vedi buildView/actBuy)
function pOrder(G){ return G.reshop?G.reshopOrder:G.order; }
function curPrep(G){ const o=pOrder(G); return G.players.find(p=>p.id===o[G.ppIdx]); }
function startReshop(room){
  const G=room.G;
  G.reshop=true; G.reshopQueued=false;
  const buys=G.reshopBuys||{};
  const parts=G.players.map(p=>p.id).filter(id=>(buys[id]||0)>0);   // solo chi ha un acquisto nel giro extra
  const extraStock=parts.reduce((s,id)=>s+(buys[id]||0),0);         // 1 pezzo per giocatore attivo nel giro extra
  G.market=[]; G.marketUsed={};                                     // anche il giro extra riparte pulito: esattamente 1 pezzo a testa, niente residui dell'officina principale
  revealMarket(G, extraStock);
  let first=parts.includes(G.reshopFirst)?G.reshopFirst:parts[0];
  G.reshopOrder=[first, ...G.order.filter(id=>id!==first && parts.includes(id))];
  G.ppIdx=0;
  G.players.forEach(pp=>{ pp.buysLeft=0; });
  if(G.reshopOrder.length){ const cp=curPrep(G); cp.buysLeft=buys[cp.id]||1; }
  const fn=(G.players.find(x=>x.id===first)||{}).name||'?';
  glog(G, parts.length>1 ? ('Giro extra in officina · primo a scegliere: '+fn) : ('Giro extra in officina · '+fn+' riapre'), 'round');
}
function buildCount(p,lvl){ return DB.ordine.filter(c=>p.comp[c]===lvl).length; }
function canHaveAtLevel(p,comp,lvl){ return pieceReach(p,comp,lvl); }   // B: L4 solo per i pezzi abilitati nel deck-builder (max 4 su 6)
function priceFor(G,p,comp,lvl){ let price=pieceBasePrice(p,comp,lvl); if(lvl>p.comp[comp]+1) price*=2; if(p.discountNext) price=Math.round(price/2); return price; }   // B: prezzo personale (con variante esp)

/* --- azioni preparazione --- */
function actBuy(room,p,comp,lvl){
  const G=room.G; if(G.phase!=='prep'||curPrep(G).id!==p.id) return 'Non è il tuo turno.';
  lvl=+lvl; if(!DB.ordine.includes(comp)||!(lvl>=1)) return 'Ricambio non valido.';
  if(lvl<=p.comp[comp]) return 'Livello pari o inferiore.';
  if(lvl>G.compMaxLevel) return 'Livello non ancora sbloccato.';
  if(p.buysLeft<=0) return 'Acquisti finiti.';
  if(!canHaveAtLevel(p,comp,lvl)) return (lvl===4?'Pezzo non abilitato a L4 nel tuo deck.':'Livello non disponibile.');
  let price=priceFor(G,p,comp,lvl); if(G.reshop && (G.reshopHalf||[]).includes(p.id)) price=Math.round(price/2);
  if(p.money<price) return 'Denaro insufficiente.';
  p.money-=price; p.comp[comp]=lvl; if(p.lvlOwned&&!p.lvlOwned[comp].includes(lvl)) p.lvlOwned[comp].push(lvl); p.buysLeft--; p.discountNext=false;
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
    tgt.comp[comp]=Math.max(...tgt.lvlOwned[comp]);                    // torno al livello posseduto più alto rimasto (il posto si libera da solo)
    p.money-=cost;                        // costo denaro
    if(c.costPO) p.po=Math.max(0,p.po-c.costPO); // costo Rispetto
  }
  else if(c.eff==='money'){ const _b=tgt.money; tgt.money=Math.max(0,tgt.money+c.val); _ap=tgt.money-_b; }
  else if(c.eff==='po'){ const _b=tgt.po; tgt.po=Math.max(0,tgt.po+c.val); _ap=tgt.po-_b; }
  else if(c.eff==='prizeUp'||c.eff==='prizeDown') tgt.prizeMult=(tgt.prizeMult||1)*c.val;
  else if(c.eff==='betUp'||c.eff==='betDown') tgt.betMult=(tgt.betMult||1)*c.val;
  else if(c.eff==='quota') tgt.quotaMod=(tgt.quotaMod||0)+c.val;
  else if(c.eff==='discount') tgt.discountNext=true;
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
  if(pregaraTarget(c)==='rival' && c.eff!=='reopenDebt' && tgt.id!==p.id) recordMalus(room, p, tgt, {phase:'pregara', eff:c.eff, val:c.val, applied:_ap, comp:_comp, lvl:_lvl});
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
  G.ppIdx++;
  const o=pOrder(G);
  if(G.ppIdx<o.length){ const cp=curPrep(G); cp.buysLeft=G.reshop?((G.reshopBuys&&G.reshopBuys[cp.id])||1):G.maxBuys; }
  else if(!G.reshop && G.reshopQueued){ startReshop(room); }   // chiudi l'officina, riaprila a tutti
  else { G.reshop=false; startLaunch(room); }   // tutti pronti → semaforo di partenza
  return null;
}

/* --- gara --- */
function setupRace(room){                                         // crea le auto: durante il semaforo le carte partenza accumulano pendPart
  const G=room.G;
  G.R={ turnOrder:[...G.order], turn:1, ptr:0, phase:'await', cars:{}, lastBreak:null, log:[], logId:0, finish:(G.sprintFinish||trackTotalCells(G)), turnDice:[], police:[], blocks:(G.blocks||[]).slice() };
  G.players.forEach(p=>{ G.R.cars[p.id]={ pos:0, firstDone:false, nosUsed:false, fx:[], pendDado:null, pendPart:0, pendReach:null }; p.incoming=[]; });  // azzero incoming: finestra difese pre-gara chiusa
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
function fxSum(R,p,stat){ return R.cars[p.id].fx.filter(e=>e.stat===stat).reduce((s,e)=>s+e.amt,0); }
function nosAllowed(G,p){ const car=G.R.cars[p.id]; const seg=segOf(G,Math.max(1,car.pos)); if(car.nosUsed) return false; if(!car.firstDone) return false; if(seg.t==='drift') return false; if(statVal(p,'nos')<=0) return false; return true; }

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
function glog(G,text,kind){ if(!G)return; G.gameSeq=(G.gameSeq||0)+1; (G.gameLog=G.gameLog||[]).push({ id:G.gameSeq, round:G.round||1, phase:G.phase, kind:kind||'info', text:text }); if(G.gameLog.length>240) G.gameLog.shift(); }   // registro di TUTTA la partita
const COMPLAB={motore:'Motore',cambio:'Cambio',sterzo:'Sterzo',assetto:'Assetto',peso:'Peso',nos:'NOS'};
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
  glog(G,p.name+' gioca «'+c.nome+'»'+(c.target==='rival'&&target.id!==p.id?(' su '+target.name):'')+' (gara)','card');
  if(c.target==='rival' && target.id!==p.id && !isFoe) recordMalus(room, p, target, {phase:'ingara', eff:c.eff, val:c.val, dur:c.dur, fxRef:_fx, prevDado:_prevDado});  // i boss non si difendono
  p.discard.push(c); p.hand.splice(handIdx,1); return null;
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
  car.dist=(car.dist||0)+b.total;                       // distanza reale percorsa (non tappata) → classifica photo-finish
  car.pos=Math.min(G.R.finish||55,car.pos+b.total);
  const onBlk=(G.R.blocks||[]).find(bl=>car.pos>=bl.from&&car.pos<=bl.to);
  if(onBlk && car.pos>0){ p.money=Math.max(0,p.money-500); raceLog(G,{kind:'fine',who:p.name,amount:500,pos:car.pos}); glog(G,'🚧 '+p.name+' multato al blocco · −€500 (cas. '+car.pos+')','fine'); }
  raceLog(G,{kind:'move',who:p.name,seg:TIPO_LABEL[b.segType]||b.segType,mov:b.total,pos:car.pos,die:b.die});
  glog(G,p.name+' muove '+b.total+' → cas. '+car.pos+' ('+(TIPO_LABEL[b.segType]||b.segType)+')','move');
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
        const t=G.players.find(x=>x.id===p.bet.targetId); const q=Math.max(1.05, Math.min(6, DB.quoteScommessa[Math.min(7,t.prevRank)]+(p.quotaMod||0)));
        if(p.bet.targetId===winnerId){ const payout=Math.round(p.bet.amount*q*(p.betMult||1)); p.money+=p.bet.amount+payout; p._betDelta=payout; p._betWin=true; }
        else { p._betDelta=-p.bet.amount; }
      }
    }
    p.bet=null;
  });
  G.players.forEach(p=>{ while(p.hand.length<5){ const card=drawCardP(p,G); if(!card) break; p.hand.push(card); } });   // B: ricompone la mano a 5 dal PROPRIO mazzo
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
  // B: niente iniezione nel mazzo condiviso — polizia e carte di livello superiore sono gia' nel mazzo
  // personale di ciascuno; lo "sblocco" col salire del livello e' gestito alla pesca (drawCardP/cardAvailable).
  if(!G.policeUnlocked && G.trackLevel>=2){ G.policeUnlocked=true; change.policeUnlocked=true; }
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
function ownedView(p){ return DB.ordine.map(c=>{ const cur=p.comp[c]; const own=((p.lvlOwned&&p.lvlOwned[c])||[0]).slice().sort((a,b)=>a-b); const down=own.length>=2?own[own.length-2]:0; return { comp:c, name:DB.nomi[c], lvl:cur, val:pieceVal(p,c,cur), down }; }); }

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
    v.reshopBy=(G.reshopFirst!=null)?((G.players.find(x=>x.id===G.reshopFirst)||{}).name||null):null;
    v.sprintFinish=(G.sprintFinish||null);
    v.incoming=incomingFor(player);
    v.compMaxLevel=G.compMaxLevel;
    v.policeWaiting=G.players.filter(x=>(x.hand||[]).some(c=>c.cat==='polizia')).map(x=>x.name);
    v.pendBlocks=(G.blocks||[]).map(b=>({from:b.from,to:b.to,size:b.size,byName:b.byName}));
    v.trackTotal=trackTotalCells(G);
    v.order=[...G.order];
    v.lastRace=(G.round>1 && G.prevResults) ? G.prevResults.map(r=>({ id:r.id, name:r.name, colorH:r.colorH, pos:r.pos, busted:!!r.busted })) : null;
    v.market=(function(){                                            // B: banco PERSONALE — per ogni pezzo i livelli comprabili dal giocatore
      const out=[]; const pl=player; const top=Math.min(4, G.compMaxLevel);
      DB.ordine.forEach(comp=>{
        for(let lvl=pl.comp[comp]+1; lvl<=top; lvl++){
          if(!pieceReach(pl,comp,lvl)) continue;                      // es. L4 non abilitato per quel pezzo nel deck
          const price=priceFor(G,pl,comp,lvl); const skip=lvl>pl.comp[comp]+1;
          const isEsp=(lvl===3&&pl.espL3&&pl.espL3.has(comp))||(lvl===4&&pl.espL4&&pl.espL4.has(comp));
          const buyable=v.isYourTurn && pl.buysLeft>0 && pl.money>=price;
          let reason=''; if(pl.buysLeft<=0)reason='niente acquisti'; else if(pl.money<price)reason='soldi insuff.';
          out.push({ comp, name:DB.nomi[comp], lvl, val:pieceVal(pl,comp,lvl), price, skip, esp:!!isEsp, buyable, reason });
        }
      });
      return out;
    })();
    if(v.isYourTurn){
      const p=player;
      v.policeHand=p.hand.map((c,idx)=>({c,idx})).filter(o=>o.c.cat==='polizia').map(o=>({idx:o.idx,nome:o.c.nome,kind:o.c.kind,size:o.c.size}));
      v.mustPlayPolice=p.hand.some(c=>c.cat==='polizia');
      v.track=trackView(G);
      v.me={ money:p.money, po:p.po, buysLeft:p.buysLeft, stats:statsOf(p), owned:ownedView(p), handCount:p.hand.length, prizeMult:(p.prizeMult||1), betMult:(p.betMult||1), quotaMod:(p.quotaMod||0), discount:!!p.discountNext };
      v.pregara = G.reshop ? [] : p.hand.map((c,idx)=>({ idx, cat:c.cat, nome:c.nome, eff:c.eff, val:c.val, target:pregaraTarget(c), costPO:(c.costPO||0) })).filter(c=>c.cat==='pregara' && c.eff!=='defend');
      v.handAll = G.reshop ? [] : p.hand.map((c,idx)=>{ const o={ idx, cat:c.cat, nome:c.nome, eff:c.eff, val:c.val, dur:c.dur, costPO:(c.costPO||0) }; if(c.cat==='pregara') o.target=pregaraTarget(c); return o; }).filter(c=>c.cat!=='polizia');
      v.canBet = !G.reshop && G.round>=2;
      if(v.canBet){
        v.betTargets=G.players.map(t=>({ id:t.id, name:t.name, colorH:DB.colori[t.colorIdx].h, quote:Math.max(1.05, Math.min(6, DB.quoteScommessa[Math.min(7,t.lastRank)]+(p.quotaMod||0))), you:t.id===p.id }));
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
        pilotNome:p.pilot.nome, gang:p.pilot.gang, ab:p.pilot.ab, pilotTipo:p.pilot.tipo, pilotTipoLabel:(TIPO_LABEL[p.pilot.tipo]||(p.pilot.tipo==='fortuna'?'Fortuna':'NOS')), partenza:p.pilot.partenza,
        vel:statVal(p,'motore')+statVal(p,'cambio')+fxVel, ctrl:statVal(p,'sterzo')+statVal(p,'assetto')+fxCtrl,
        mov:statVal(p,'motore')+statVal(p,'cambio')+statVal(p,'sterzo')+statVal(p,'assetto')+statVal(p,'peso'),
        segType:seg.t, segLabel:TIPO_LABEL[seg.t], firstDone:car.firstDone,
        nosOk:nosAllowed(G,p), nosVal:statVal(p,'nos'),
        fx:car.fx.map(e=>({stat:e.stat,amt:e.amt,turns:e.turns})), pendPart:car.pendPart, pendDado:car.pendDado,
        hand:p.hand.map((c,idx)=>({idx,cat:c.cat,nome:c.nome,eff:c.eff,val:c.val,dur:c.dur,target:c.target})).filter(c=>c.cat==='ingara' && c.eff!=='defend' && c.eff!=='partenza'),
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
  // 2) acquisti dal BANCO PERSONALE (livelli comprabili dal bot, esp inclusa nel valore/prezzo)
  let safety=12;
  while(bot.buysLeft>0 && safety-->0){
    const top=Math.min(4,G.compMaxLevel); const opts=[];
    DB.ordine.forEach(comp=>{ for(let lvl=bot.comp[comp]+1; lvl<=top; lvl++){ if(pieceReach(bot,comp,lvl) && priceFor(G,bot,comp,lvl)<=bot.money-300) opts.push({comp,lvl}); } });
    if(!opts.length) break;
    const w={motore:3,cambio:3,sterzo:3,assetto:3,nos:2,peso:2};
    opts.sort((a,b)=>{
      const ga=(pieceVal(bot,a.comp,a.lvl)-pieceVal(bot,a.comp,bot.comp[a.comp]))*(w[a.comp]||1);
      const gb=(pieceVal(bot,b.comp,b.lvl)-pieceVal(bot,b.comp,bot.comp[b.comp]))*(w[b.comp]||1);
      return gb-ga;
    });
    if(actBuy(room,bot,opts[0].comp,opts[0].lvl)) break;
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
    const room={ code, hostId:0, started:false, G:{ phase:'lobby', players:[], nextId:0, targetPO:50 } };
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
    const ex=room.G.players.find(x=>x.name.toLowerCase()===cleanName(name).toLowerCase());
    if(ex && !ex.connected){                                     // riaggancio per nome (lobby o partita in corso)
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

  // B: il client invia la config del proprio mazzo (output del deck-builder) prima dell'avvio.
  socket.on('setDeck', ({cfg})=>{
    const f=playerBySocket(socket); if(!f) return; const {room,p}=f;
    if(room.started) return;
    p.deckCfg = (cfg && typeof cfg==='object') ? cfg : null;
    p.deckReady = !!p.deckCfg;
    broadcast(room);
  });

  function handle(fn){ return (payload)=>{ const f=playerBySocket(socket); if(!f) return; const err=fn(f.room,f.p,payload||{}); if(err) socket.emit('errorMsg', err); broadcast(f.room); scheduleBot(f.room); }; }

  socket.on('setup:drawPilot', handle((room,p)=>actDrawPilot(room,p)));
  socket.on('setup:ready', handle((room,p)=>actReady(room,p)));
  socket.on('prep:buy', handle((room,p,d)=>actBuy(room,p,d.comp,d.lvl)));
  socket.on('prep:playCard', handle((room,p,d)=>actPlayPregara(room,p,d.handIdx,d.targetId,d.comp)));
  socket.on('prep:discard', handle((room,p,d)=>actDiscard(room,p,d.handIdx)));
  socket.on('prep:police', handle((room,p,d)=>actPlayPolice(room,p,d.handIdx,d.cell)));
  socket.on('prep:bet', handle((room,p,d)=>actSetBet(room,p,d.targetId,d.amount)));
  socket.on('prep:done', handle((room,p)=>actPrepDone(room,p)));
  socket.on('launch:play', handle((room,p,d)=>actPlayPartenza(room,p,d.handIdx,d.targetId)));
  socket.on('race:playCard', handle((room,p,d)=>actRacePlayCard(room,p,d.handIdx,d.targetId)));
  socket.on('race:roll', handle((room,p,d)=>actRoll(room,p,d.useNos)));
  socket.on('race:move', handle((room,p)=>actConfirmMove(room,p)));
  socket.on('defend', handle((room,p,d)=>actDefend(room,p,d.handIdx,d.mid)));
  socket.on('defense:play', handle((room,p,d)=>actDefend(room,p,d.handIdx,d.mid)));
  socket.on('results:next', handle((room,p)=>actNextRound(room,p)));
  socket.on('results:vote', handle((room,p,d)=>actVote(room,p,d.choice)));

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

module.exports = {
  DB, startGame, startRound, actReady, curPrep, activeRace, actBuy, actPlayPregara, actPlayPolice,
  actSetBet, actPrepDone, actRacePlayCard, actRoll, actConfirmMove, actNextRound, buildView, botAct,
  botPending, actDefend, incomingFor, stockAvail, compSlots, endRace, startLaunch, beginRace, setupRace,
  actPlayPartenza,
  // B: helper mazzo/officina personali (per la simulazione e i test)
  makeDefaultCfg, defaultDeckCards, buildDeckFromCfg, applyPlayerConfig, pieceVal, pieceBasePrice, pieceReach, drawCardP,
  __pools: { C_INGARA, C_SCALE_L2, C_SCALE_L3, C_SCALE_L4, C_DIFESA, C_PREGARA, C_POLIZIA, SCALE_PACKS, NAME_MAP, BASE_PREGARA_EFF }
};

if(require.main===module){
  const PORT = process.env.PORT || 3000;
  server.listen(PORT, ()=>console.log('2FAST4U MODALITA B server in ascolto sulla porta '+PORT));
}
