/* 2FAST4U — musica di sottofondo condivisa tra tutte le pagine.
   Continua da dove era (salva brano + posizione in localStorage), si ferma solo in gara. */
(function(){
  var MUSIC=['/audio/Ita-Intro.mp3','/audio/Eng-Base.mp3','/audio/Ita-Latin.mp3','/audio/Eng-Base5.mp3','/audio/Ita-Bombola_Taranta.mp3'];
  var KEY='2f4u_mus';
  function load(){ try{ return JSON.parse(localStorage.getItem(KEY))||{}; }catch(e){ return {}; } }
  function save(){ try{ localStorage.setItem(KEY, JSON.stringify(st)); }catch(e){} }
  var st=load();
  if(st.i==null) st.i=Math.floor(Math.random()*MUSIC.length);
  if(st.on==null) st.on=true;
  if(st.vol==null) st.vol=0.4;
  if(st.t==null) st.t=0;
  var a=null, saveInt=null, blockedRace=false;

  function persist(){ if(a){ st.t=a.currentTime||0; save(); } }
  function ensure(){
    if(a) return;
    a=new Audio(); a.volume=st.vol; a.preload='auto'; a.src=MUSIC[st.i];
    a.addEventListener('loadedmetadata',function(){ if(st.t>0 && st.t<(a.duration||1e9)){ try{ a.currentTime=st.t; }catch(e){} } });
    a.addEventListener('ended',function(){ var n; do{ n=Math.floor(Math.random()*MUSIC.length); }while(MUSIC.length>1 && n===st.i); st.i=n; st.t=0; save(); a.src=MUSIC[st.i]; if(st.on&&!blockedRace) a.play().catch(function(){}); });
  }
  function start(){ if(blockedRace) return; ensure(); if(!st.on) return; a.play().catch(function(){}); if(!saveInt) saveInt=setInterval(persist,1000); }
  function stop(){ persist(); if(a) a.pause(); }

  function updBtn(){ var b=document.getElementById('mus-toggle'); if(b) b.textContent=st.on?'\u266a':'\uD83D\uDD07'; }
  function ui(){
    if(document.getElementById('mus-ctrl')) return;
    var d=document.createElement('div'); d.id='mus-ctrl';
    d.style.cssText='position:fixed;bottom:8px;left:8px;z-index:99999;display:flex;align-items:center;gap:6px;background:rgba(11,5,24,.72);border:1px solid rgba(255,255,255,.18);border-radius:16px;padding:3px 8px;font-family:sans-serif';
    d.innerHTML='<button id="mus-toggle" title="Musica on/off" style="background:none;border:none;color:#F4EEFF;font-size:15px;cursor:pointer;padding:0;line-height:1">'+(st.on?'\u266a':'\uD83D\uDD07')+'</button>'
      +'<input id="mus-vol" type="range" min="0" max="100" value="'+Math.round(st.vol*100)+'" title="Volume" style="width:56px;accent-color:#2BA8E6">';
    document.body.appendChild(d);
    d.querySelector('#mus-toggle').addEventListener('click',function(){ st.on=!st.on; save(); if(st.on) start(); else stop(); updBtn(); });
    d.querySelector('#mus-vol').addEventListener('input',function(){ st.vol=Math.max(0,Math.min(1,this.value/100)); if(a) a.volume=st.vol; save(); });
  }

  // API usata dal gioco per fermare/riprendere in gara
  window.MUS={
    stop:function(){ blockedRace=true; stop(); var c=document.getElementById('mus-ctrl'); if(c) c.style.display='none'; },
    resume:function(){ blockedRace=false; var c=document.getElementById('mus-ctrl'); if(c) c.style.display='flex'; if(st.on) start(); }
  };

  function init(){ ui(); if(st.on) start(); }
  if(document.body) init(); else window.addEventListener('DOMContentLoaded', init);
  // sblocco autoplay al primo tocco/tasto (i browser bloccano l'audio automatico)
  function once(){ if(st.on) start(); window.removeEventListener('pointerdown',once); window.removeEventListener('keydown',once); }
  window.addEventListener('pointerdown',once); window.addEventListener('keydown',once);
  window.addEventListener('pagehide',persist); window.addEventListener('beforeunload',persist);
})();
