(()=>{
'use strict';
if(!CanvasRenderingContext2D.prototype.roundRect){
  CanvasRenderingContext2D.prototype.roundRect=function(x,y,w,h,r){
    r=Math.min(r||0,w/2,h/2);this.moveTo(x+r,y);this.arcTo(x+w,y,x+w,y+h,r);this.arcTo(x+w,y+h,x,y+h,r);this.arcTo(x,y+h,x,y,r);this.arcTo(x,y,x+w,y,r);this.closePath();return this;
  };
}
const $=id=>document.getElementById(id);
const canvas=$('gameCanvas');
if(!canvas)return;
const ctx=canvas.getContext('2d');
let W,H,dpr,sx,sy;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const lerp=(a,b,t)=>a+(b-a)*t;
const rand=(a,b)=>Math.random()*(b-a)+a;
const randInt=(a,b)=>Math.floor(rand(a,b+1));
const hsl=(h,s,l,a=1)=>`hsla(${h},${s}%,${l}%,${a})`;
const dist=(a,b,c,d)=>Math.sqrt((c-a)**2+(d-b)**2);

function resize(){
  dpr=Math.min(window.devicePixelRatio||1,2);
  W=window.innerWidth;
  H=(window.visualViewport&&window.visualViewport.height)||window.innerHeight;
  canvas.width=W*dpr;canvas.height=H*dpr;
  ctx.setTransform(dpr,0,0,dpr,0,0);
  sx=W/400;sy=H/700;
}
resize();
window.addEventListener('resize',()=>{
  resize();
  if(state==='play'){paddle.x=clamp(paddle.x,paddle.w/2,W-paddle.w/2);for(const b of balls){b.x=clamp(b.x,b.r,W-b.r)}}
});
if(window.visualViewport)window.visualViewport.addEventListener('resize',()=>{
  resize();
  if(state==='play'){paddle.x=clamp(paddle.x,paddle.w/2,W-paddle.w/2);for(const b of balls){b.x=clamp(b.x,b.r,W-b.r)}}
});

// ═══════════════════════════════════════════════════
// AUDIO ENGINE - PlayGama Compatible
// ═══════════════════════════════════════════════════
let audioCtx=null,audioInit=false,masterGain=null,volume=0.5;
const audioSettings={music:true,sfx:true,vibrate:true,particles:true,platformAudio:true,muted:false};

function initAudio(){
  if(audioInit)return;
  try{
    audioCtx=new(window.AudioContext||window.webkitAudioContext)();
    masterGain=audioCtx.createGain();
    masterGain.gain.value=volume;
    masterGain.connect(audioCtx.destination);
    audioInit=true;
    if(isYT()&&!ytgame.system.isAudioEnabled()){
      audioSettings.platformAudio=false;
      audioCtx.suspend();
    }
    if(audioCtx.state==='suspended')audioCtx.resume().then(()=>{});
  }catch(e){}
}

function playTone(f,d,type='sine',v=0.1){
  if(!audioCtx||audioCtx.state!=='running'||!audioSettings.sfx||!audioSettings.platformAudio||audioSettings.muted)return;
  try{
    const o=audioCtx.createOscillator(),g=audioCtx.createGain();
    o.type=type;o.frequency.setValueAtTime(f,audioCtx.currentTime);
    g.gain.setValueAtTime(v*volume,audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001,audioCtx.currentTime+d);
    o.connect(g);g.connect(masterGain);o.start();o.stop(audioCtx.currentTime+d);
  }catch(e){}
}

function playNoise(d,v=0.05){
  if(!audioCtx||audioCtx.state!=='running'||!audioSettings.sfx||!audioSettings.platformAudio||audioSettings.muted)return;
  try{
    const bufSize=audioCtx.sampleRate*d;
    const buf=audioCtx.createBuffer(1,bufSize,audioCtx.sampleRate);
    const data=buf.getChannelData(0);
    for(let i=0;i<bufSize;i++)data[i]=(Math.random()*2-1)*Math.pow(1-i/bufSize,2);
    const src=audioCtx.createBufferSource();src.buffer=buf;
    const g=audioCtx.createGain();g.gain.setValueAtTime(v*volume,audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001,audioCtx.currentTime+d);
    src.connect(g);g.connect(masterGain);src.start();
  }catch(e){}
}

function sfxHit(){playTone(600+rand(0,200),.04,'square',.06)}
function sfxBreak(){playTone(800+rand(0,300),.05,'square',.07);setTimeout(()=>playTone(1100+rand(0,200),.03,'square',.05),15)}
function sfxMetal(){playTone(300,.07,'triangle',.08);playNoise(.03,.04)}
function sfxExplosion(){playNoise(.15,.08);playTone(200,.15,'sawtooth',.06);playTone(100,.2,'sine',.04)}
function sfxPowerUp(){playTone(523,.04);setTimeout(()=>playTone(659,.04),40);setTimeout(()=>playTone(784,.06),80)}
function sfxDie(){playTone(400,.15,'sawtooth',.08);setTimeout(()=>playTone(200,.2,'sawtooth',.06),80);playNoise(.1,.05)}
function sfxWin(){playTone(523,.06);setTimeout(()=>playTone(659,.06),60);setTimeout(()=>playTone(784,.06),120);setTimeout(()=>playTone(1047,.1),180)}
function sfxCombo(n){playTone(500+n*80,.04,'sine',.06);playTone(600+n*100,.03,'sine',.04)}
function sfxFever(){playTone(800,.06,'sawtooth',.07);setTimeout(()=>playTone(1200,.08,'sawtooth',.06),30);setTimeout(()=>playTone(1600,.1,'sine',.05),60)}
function sfxUI(){playTone(880,.03,'sine',.04)}
function sfxSelect(){playTone(660,.02);playTone(880,.03)}

// ═══════════════════════════════════════════════════
// GAME STATE
// ═══════════════════════════════════════════════════
let state='loading';
let score=0,best=0,coins=0,lives=3,level=1,maxUnlockedLevel=1;
let comboCount=0,comboTimer=0,maxCombo=0;
let screenShake=0;
let feverMode=false,feverTimer=0,feverCharge=0;
let levelIntroTimer=0,levelIntroText='';
let particles=[],popups=[],comboPopups=[],trailParticles=[],shockwaves=[];
let partLimit=600;
let bgStars=[];
let timeCounter=0;
let frameCount=0;
let scoreHistory=[];

function initBgStars(){
  bgStars=[];
  for(let i=0;i<100;i++){
    bgStars.push({x:Math.random()*W,y:Math.random()*H,r:Math.random()*2+.3,spd:Math.random()*.6+.05,tw:Math.random()*6.28,hue:Math.random()*60,bright:rand(0.3,1)});
  }
}

// ═══════════════════════════════════════════════════
// PATTERNS & LEVELS DATA - 100 UNIQUE LEVELS
// ═══════════════════════════════════════════════════
// 30 patterns
const PATTERNS=[
  {name:'Welcome',m:[[0,1,0,1,0,1,0],[1,0,1,0,1,0,1],[0,1,0,1,0,1,0]]},
  {name:'Smile',m:[[0,1,1,0,1,1,0],[1,1,1,1,1,1,1],[1,0,1,1,1,0,1],[1,1,1,1,1,1,1],[0,1,1,1,1,1,0]]},
  {name:'Heart',m:[[0,1,1,0,1,1,0],[1,1,1,1,1,1,1],[1,1,1,1,1,1,1],[0,1,1,1,1,1,0],[0,0,1,1,1,0,0]]},
  {name:'Star',m:[[0,0,0,1,0,0,0],[0,0,1,1,1,0,0],[1,1,1,1,1,1,1],[0,1,1,1,1,1,0],[0,1,0,0,0,1,0]]},
  {name:'Diamond',m:[[0,0,0,1,0,0,0],[0,0,1,1,1,0,0],[0,1,1,1,1,1,0],[0,0,1,1,1,0,0],[0,0,0,1,0,0,0]]},
  {name:'Arrow',m:[[0,0,0,1,0,0,0],[0,0,1,1,1,0,0],[0,1,1,1,1,1,0],[1,1,1,1,1,1,1],[0,0,1,1,1,0,0]]},
  {name:'Crown',m:[[1,0,1,0,1,0,1],[1,1,1,1,1,1,1],[1,1,1,1,1,1,1],[0,1,1,1,1,1,0]]},
  {name:'Cross',m:[[0,0,1,1,1,0,0],[0,0,1,1,1,0,0],[1,1,1,1,1,1,1],[0,0,1,1,1,0,0],[0,0,1,1,1,0,0]]},
  {name:'Pyramid',m:[[0,0,0,1,0,0,0],[0,0,1,1,1,0,0],[0,1,1,1,1,1,0],[1,1,1,1,1,1,1]]},
  {name:'Hourglass',m:[[1,1,1,1,1,1,1],[0,1,1,1,1,1,0],[0,0,1,1,1,0,0],[0,0,0,1,0,0,0],[0,0,1,1,1,0,0],[0,1,1,1,1,1,0]]},
  {name:'Invader',m:[[0,1,0,0,0,1,0],[0,0,1,1,1,0,0],[0,1,1,1,1,1,0],[1,1,0,1,0,1,1],[1,1,1,1,1,1,1]]},
  {name:'Fortress',m:[[1,0,1,0,1,0,1],[1,1,1,1,1,1,1],[1,1,0,0,0,1,1],[1,1,1,1,1,1,1]]},
  {name:'Hexagon',m:[[0,0,1,1,1,0,0],[0,1,1,1,1,1,0],[1,1,1,1,1,1,1],[0,1,1,1,1,1,0],[0,0,1,1,1,0,0]]},
  {name:'Wave',m:[[0,0,1,1,1,0,0],[0,1,1,1,1,1,0],[1,1,1,0,1,1,1],[0,1,1,1,1,1,0],[0,0,1,1,1,0,0]]},
  {name:'Skull',m:[[0,1,1,1,1,1,0],[1,1,1,1,1,1,1],[1,0,1,1,1,0,1],[1,1,1,1,1,1,1],[0,1,0,1,0,1,0]]},
  {name:'Alien',m:[[0,1,0,0,0,1,0],[0,0,1,0,1,0,0],[0,1,1,1,1,1,0],[1,1,0,1,0,1,1],[1,0,1,1,1,0,1]]},
  {name:'Lightning',m:[[0,0,0,1,1,0,0],[0,0,1,1,0,0,0],[0,1,1,1,1,0,0],[0,0,1,1,1,0,0],[0,0,0,1,1,1,0]]},
  {name:'Castle',m:[[1,0,1,0,1,0,1],[1,1,1,1,1,1,1],[1,1,1,1,1,1,1],[1,0,1,1,1,0,1]]},
  {name:'Target',m:[[0,1,1,1,1,1,0],[1,1,0,0,0,1,1],[1,0,0,1,0,0,1],[1,1,0,0,0,1,1],[0,1,1,1,1,1,0]]},
  {name:'Ripple',m:[[1,0,0,0,0,0,1],[0,1,0,0,0,1,0],[0,0,1,0,1,0,0],[0,1,0,0,0,1,0],[1,0,0,0,0,0,1]]},
  {name:'Butterfly',m:[[1,1,0,0,0,1,1],[1,1,1,0,1,1,1],[0,1,1,1,1,1,0],[0,0,1,1,1,0,0],[0,1,1,1,1,1,0]]},
  {name:'Stairs',m:[[1,0,0,0,0,0,0],[1,1,0,0,0,0,0],[1,1,1,0,0,0,0],[1,1,1,1,0,0,0],[1,1,1,1,1,0,0]]},
  {name:'Spiral',m:[[1,1,1,1,1,1,1],[1,0,0,0,0,0,1],[1,0,1,1,1,0,1],[1,0,1,0,0,0,1],[1,0,1,1,1,1,1]]},
  {name:'Zigzag',m:[[1,1,0,0,0,0,0],[0,1,1,0,0,0,0],[0,0,1,1,0,0,0],[0,0,0,1,1,0,0],[0,0,0,0,1,1,0]]},
  {name:'XShape',m:[[1,0,0,0,0,0,1],[0,1,0,0,0,1,0],[0,0,1,0,1,0,0],[0,0,0,1,0,0,0],[0,0,1,0,1,0,0]]},
  {name:'Circle',m:[[0,0,1,1,1,0,0],[0,1,1,1,1,1,0],[1,1,1,0,1,1,1],[0,1,1,1,1,1,0],[0,0,1,1,1,0,0]]},
  {name:'Frame',m:[[1,1,1,1,1,1,1],[1,0,0,0,0,0,1],[1,0,0,0,0,0,1],[1,1,1,1,1,1,1]]},
  {name:'PlusSign',m:[[0,0,1,1,1,0,0],[0,0,1,1,1,0,0],[1,1,1,1,1,1,1],[0,0,1,1,1,0,0],[0,0,1,1,1,0,0]]},
  {name:'DoubleDiamond',m:[[0,0,1,0,1,0,0],[0,1,0,1,0,1,0],[1,0,1,1,1,0,1],[0,1,0,1,0,1,0],[0,0,1,0,1,0,0]]},
  {name:'Walls',m:[[1,0,1,0,1,0,1],[1,0,1,0,1,0,1],[1,1,1,1,1,1,1],[1,0,1,0,1,0,1]]}
];

// 20 block types
const BLOCK_TYPES={
  normal:{hp:1,score:10,name:'Normal'},
  hard:{hp:2,score:25,name:'Hard'},
  metal:{hp:3,score:50,name:'Metal'},
  explosive:{hp:1,score:15,name:'Explosive',explode:true},
  chain:{hp:1,score:20,name:'Chain',chain:true},
  bonus:{hp:1,score:0,name:'Bonus',coin:true},
  moving:{hp:1,score:15,name:'Moving',moving:true},
  regen:{hp:2,score:30,name:'Regen',regen:true},
  power:{hp:1,score:0,name:'Power',powerUp:true}
};

const BRICK_COLORS=[
  {fill:'#ff2060',hi:'#ff80a0',lo:'#880030'},
  {fill:'#ff7700',hi:'#ffbb44',lo:'#884400'},
  {fill:'#ffdd00',hi:'#ffee88',lo:'#887700'},
  {fill:'#00ee66',hi:'#80ffaa',lo:'#007733'},
  {fill:'#00ddff',hi:'#80eeff',lo:'#006688'},
  {fill:'#4499ff',hi:'#99ccff',lo:'#223388'},
  {fill:'#bb55ff',hi:'#dd99ff',lo:'#552288'},
  {fill:'#ff55dd',hi:'#ff99ee',lo:'#882277'},
  {fill:'#ff5555',hi:'#ff9999',lo:'#882222'},
  {fill:'#55ffbb',hi:'#99ffdd',lo:'#228866'}
];

// Generate 100 levels procedurally
const LEVELS=[];
for(let i=1;i<=100;i++){
  const patternIdx=(i-1)%PATTERNS.length;
  const speedMult=1+(i-1)*0.012;
  
  LEVELS.push({
    id:i,
    pattern:PATTERNS[patternIdx],
    speedMult:Math.min(speedMult,2.5),
    stars:0,
    bestScore:0
  });
}

// ═══════════════════════════════════════════════════
// SAVE / LOAD
// ═══════════════════════════════════════════════════
const SAVE_KEY='neonbreaker_save_v2';

function defaultSave(){
  return{best:0,coins:0,level:1,maxLevel:1,scores:[],levelStars:Array(101).fill(0),levelScores:Array(101).fill(0)};
}
function loadProgress(){
  try{
    const raw=localStorage.getItem(SAVE_KEY);
    if(!raw){const d=defaultSave();best=d.best;coins=d.coins;level=d.level;maxUnlockedLevel=d.maxLevel;return}
    const d=JSON.parse(raw);
    best=d.best||0;coins=d.coins||0;maxUnlockedLevel=Math.min(d.maxLevel||d.level||1,100);level=Math.min(maxUnlockedLevel,100);
    scoreHistory=d.scores||[];
    if(d.levelStars)LEVELS.forEach((l,i)=>{if(d.levelStars[i]!==undefined)l.stars=d.levelStars[i]});
    if(d.levelScores)LEVELS.forEach((l,i)=>{if(d.levelScores[i]!==undefined)l.bestScore=d.levelScores[i]});
  }catch(e){const d=defaultSave();best=d.best;coins=d.coins;level=d.level;maxUnlockedLevel=d.maxLevel}
}
function saveProgress(){
  try{
    const d={best,coins,level:maxUnlockedLevel,maxLevel:maxUnlockedLevel,scores:scoreHistory.slice(0,50),levelStars:LEVELS.map(l=>l.stars),levelScores:LEVELS.map(l=>l.bestScore)};
    localStorage.setItem(SAVE_KEY,JSON.stringify(d));
  }catch(e){}
}

// ═══════════════════════════════════════════════════
// YOUTUBE PLAYABLES SDK
// ═══════════════════════════════════════════════════
let ytReady=false;
let platformPaused=false;
let ytDataLoaded=false;

function isYT(){return typeof ytgame!=='undefined'&&ytgame.IN_PLAYABLES_ENV}

function initYT(){
  if(isYT()){
    try{
      ytgame.system.onPause(()=>{platformPaused=true;if(state==='play'){state='paused';showScreen('pause-screen')}saveProgress();ytSave()});
      ytgame.system.onResume(()=>{platformPaused=false;if(state==='paused'){state='play';showScreen(null)}});
      ytgame.system.onAudioEnabledChange(isEnabled=>{
        audioSettings.platformAudio=isEnabled;
        const btn=$('btn-mute');
        if(!isEnabled){if(audioCtx&&audioCtx.state==='running')audioCtx.suspend()}
        else if(!audioSettings.muted){if(audioCtx&&audioCtx.state==='suspended')audioCtx.resume()}
        if(btn)btn.textContent=(!isEnabled||audioSettings.muted)?'🔇':'🔊';
      });
      if(!ytgame.system.isAudioEnabled()){
        audioSettings.platformAudio=false;
        if(audioCtx&&audioCtx.state==='running')audioCtx.suspend();
      }
    }catch(e){}
  }
  ytReady=true;
}

function ytFirstFrame(){
  if(isYT()){try{ytgame.game.firstFrameReady()}catch(e){}}
}

function ytGameReady(){
  if(isYT()){try{ytgame.game.gameReady()}catch(e){}}
}

async function ytLoad(){
  if(!isYT()){loadProgress();return}
  try{
    const raw=await ytgame.game.loadData();
    if(raw){
      const data=JSON.parse(raw);
      best=data.best||0;coins=data.coins||0;
      maxUnlockedLevel=Math.min(data.maxLevel||data.level||1,100);
      level=Math.min(maxUnlockedLevel,100);
      scoreHistory=data.scores||[];
      if(data.levelStars)LEVELS.forEach((l,i)=>{if(data.levelStars[i]!==undefined)l.stars=data.levelStars[i]});
      if(data.levelScores)LEVELS.forEach((l,i)=>{if(data.levelScores[i]!==undefined)l.bestScore=data.levelScores[i]});
      ytDataLoaded=true;
    }else{loadProgress()}
  }catch(e){loadProgress()}
}

function ytSave(){
  saveProgress();
  if(!isYT()||!ytDataLoaded)return;
  try{
    const data=JSON.stringify({best,coins,level,maxLevel:maxUnlockedLevel,scores:scoreHistory.slice(0,50),levelStars:LEVELS.map(l=>l.stars),levelScores:LEVELS.map(l=>l.bestScore)});
    ytgame.game.saveData(data);
  }catch(e){}
}

function ytSendScore(){
  if(isYT()){try{ytgame.engagement.sendScore({value:best})}catch(e){}}
}

function ytShowRewarded(type){
  if(!isYT()){handleRewardedComplete();return}
  if(typeof ytgame.ads!=='undefined'&&ytgame.ads.requestRewardedAd){
    ytgame.ads.requestRewardedAd().then(()=>{handleRewardedComplete()}).catch(()=>{handleRewardedComplete()});
  }else{handleRewardedComplete()}
}
let pendingReward='';
function handleRewardedComplete(){
  if(pendingReward==='revive'){lives=1;rvUsed=true;balls=[];resetPaddle();resetBall();state='play';showScreen(null);addPopup(W/2,H/2,'REVIVED!','#0f0',24)}
  else if(pendingReward==='coins'){coins+=50;saveProgress();addPopup(W/2,H/2,'+50 COINS','#ff0',24)}
  else if(pendingReward==='bonus'){const b=level*10;coins+=b;saveProgress();addPopup(W/2,H/2,'+'+b+' COINS','#ff0',24)}
  pendingReward='';
}

// ═══════════════════════════════════════════════════
// PARTICLE SYSTEM
// ═══════════════════════════════════════════════════
function emit(x,y,color,count=6,spd=2,sizeMax=3){
  if(!audioSettings.particles)return;
  const limit=300;
  if(particles.length>limit)return;
  const n=Math.min(count*loadScale(),15);
  for(let i=0;i<n;i++){
    const a=Math.random()*Math.PI*2;
    const s=Math.random()*spd+0.3;
    particles.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,life:1,decay:rand(0.02,0.04),color,r:rand(0.5,sizeMax),glow:rand(5,12)});
  }
}
function loadScale(){return Math.max(0.4,1-(particles.length/400))}
function emitTrail(x,y,color){
  if(!audioSettings.particles)return;
  if(trailParticles.length>150)return;
  trailParticles.push({x,y,color,life:1,decay:rand(0.04,0.07),r:rand(1,2.5)});
}
function addPopup(x,y,text,color,sz=14){if(popups.length>30)return;popups.push({x,y,text,color,life:1,vy:-1.5,sz})}
function addComboPopup(x,y,text,color){if(comboPopups.length>10)return;comboPopups.push({x,y,text,color,life:1,scale:0,age:0})}
function emitExplosion(x,y,color,count=30){
  if(particles.length>300)return;
  const particlesCount=Math.min(count*loadScale(),30);
  for(let i=0;i<particlesCount;i++){
    const a=Math.random()*Math.PI*2;
    const s=Math.random()*5+1;
    particles.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,life:1,decay:rand(0.015,0.03),color,r:rand(1,3),glow:rand(8,15),type:'spark'});
  }
  for(let i=0;i<8;i++){
    const a=Math.PI*2*i/8;
    particles.push({x,y,vx:Math.cos(a)*4,vy:Math.sin(a)*4,life:1,decay:0.01,color,r:rand(2,4),glow:18});
  }
  if(shockwaves.length<10)shockwaves.push({x,y,r:5,maxR:70,life:1,color,speed:3});
}
function emitShockwave(x,y,radius,color,maxR=80){
  if(shockwaves.length<10)shockwaves.push({x,y,r:3,maxR:maxR,life:1,color,speed:2});
}
function emitScreenFlash(color){
  particles.push({x:W/2,y:H/2,vx:0,vy:0,life:0.25,decay:0.03,color,r:W,glow:0,flash:true});
}
function emitSparkShower(x,y,color,count=8){
  if(particles.length>300)return;
  const n=Math.min(count*loadScale(),8);
  for(let i=0;i<n;i++){
    const a=rand(-Math.PI,-Math.PI*0.3);
    const s=rand(2,6);
    particles.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,life:1,decay:rand(0.01,0.025),color,r:rand(0.5,1.5),glow:rand(12,20),type:'spark'});
  }
}
function updateParticles(){
  for(let i=particles.length-1;i>=0;i--){
    const p=particles[i];
    if(p.flash){p.life-=p.decay;if(p.life<=0){particles[i]=particles[particles.length-1];particles.length--}continue}
    p.x+=p.vx;p.y+=p.vy;
    if(p.type==='spark'){p.vy+=0.06;p.vx*=0.97;p.vy*=0.98}
    else if(p.confetti){p.vy+=0.03;p.vx*=0.98;p.angle=(p.angle||0)+p.spin}
    else if(p.gravity){p.vy+=p.gravity;p.vx*=0.985}
    else{p.vy+=0.02;p.vx*=0.99}
    p.life-=p.decay;
    if(p.life<=0){particles[i]=particles[particles.length-1];particles.length--}
  }
  for(let i=trailParticles.length-1;i>=0;i--){
    const p=trailParticles[i];
    if(p.vx!==undefined){p.x+=p.vx;p.y+=p.vy;p.vx*=0.95;p.vy*=0.95}
    p.life-=p.decay;
    if(p.life<=0){trailParticles[i]=trailParticles[trailParticles.length-1];trailParticles.length--}
  }
  for(let i=shockwaves.length-1;i>=0;i--){
    const s=shockwaves[i];
    s.r+=s.speed;s.life=1-(s.r/s.maxR);
    if(s.life<=0||s.r>=s.maxR){shockwaves[i]=shockwaves[shockwaves.length-1];shockwaves.length--}
  }
  for(let i=popups.length-1;i>=0;i--){
    const p=popups[i];
    p.y+=p.vy;p.vy*=0.98;p.life-=0.01;
    if(p.life<=0){popups[i]=popups[popups.length-1];popups.length--}
  }
  for(let i=comboPopups.length-1;i>=0;i--){
    const p=comboPopups[i];
    p.age++;
    p.scale=Math.min(p.age*0.1,1);p.life-=0.012;
    if(p.life<=0){comboPopups[i]=comboPopups[comboPopups.length-1];comboPopups.length--}
  }
  if(comboTimer>0)comboTimer--;else comboCount=0;
  if(screenShake>0)screenShake*=0.85;else screenShake=0;
  if(feverMode){feverTimer--;if(feverTimer<=0){feverMode=false;feverCharge=0}}
  if(levelIntroTimer>0)levelIntroTimer--;
  if(timeCounter<999999)timeCounter++;
  if(frameCount<999999)frameCount++;
}
function drawParticles(){
  ctx.shadowBlur=0;
  const loadPct=particles.length/partLimit;
  const blurScale=loadPct>0.5?1-(loadPct-0.5)*1.2:1;
  for(const p of particles){
    if(p.flash){ctx.globalAlpha=p.life*0.2;ctx.fillStyle=p.color;ctx.fillRect(0,0,W,H);continue}
    ctx.globalAlpha=p.life;
    ctx.fillStyle=p.color;
    if(p.confetti){
      ctx.save();
      ctx.translate(p.x,p.y);
      ctx.rotate(p.angle||0);
      if(p.x<-60||p.x>W+60||p.y<-60||p.y>H+60){ctx.restore();continue}
      ctx.fillRect(-p.r,-p.r*0.6,p.r*2,p.r*1.2);
      ctx.restore();
      continue;
    }
    ctx.shadowColor=p.color;
    ctx.shadowBlur=p.noShadow?0:Math.max(2,(p.glow*p.life*0.6)*blurScale);
    ctx.beginPath();
    ctx.arc(p.x,p.y,p.r*(0.5+p.life*0.5),0,Math.PI*2);
    ctx.fill();
  }
  ctx.globalAlpha=1;ctx.shadowBlur=0;
  
  for(const s of shockwaves){
    ctx.globalAlpha=s.life*0.6;
    ctx.strokeStyle=s.color;
    ctx.shadowColor=s.color;
    ctx.shadowBlur=12*s.life;
    ctx.lineWidth=2+s.life*3;
    ctx.setLineDash([4,2]);
    ctx.lineDashOffset=-Date.now()*0.05;
    ctx.beginPath();
    ctx.arc(s.x,s.y,s.r,0,Math.PI*2);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.globalAlpha=1;ctx.shadowBlur=0;
  
  for(const p of trailParticles){
    ctx.globalAlpha=p.life*0.7;
    ctx.fillStyle=p.color;
    ctx.shadowColor=p.color;
    ctx.shadowBlur=6*p.life;
    ctx.beginPath();
    ctx.arc(p.x,p.y,p.r*p.life*0.8,0,Math.PI*2);
    ctx.fill();
  }
  ctx.globalAlpha=1;ctx.shadowBlur=0;
  
  for(const p of popups){
    ctx.globalAlpha=p.life;
    ctx.fillStyle=p.color;
    ctx.strokeStyle='rgba(0,0,0,0.6)';
    ctx.lineWidth=2;
    ctx.font=`bold ${p.sz}px monospace`;
    ctx.textAlign='center';
    ctx.textBaseline='middle';
    ctx.strokeText(p.text,p.x,p.y);
    ctx.fillText(p.text,p.x,p.y);
  }
  ctx.globalAlpha=1;
  
  for(const p of comboPopups){
    ctx.save();
    ctx.translate(p.x,p.y);
    const bounce=p.scale>0.8?1+Math.sin((p.age||0)*0.2)*0.1:p.scale;
    ctx.scale(bounce,bounce);
    ctx.globalAlpha=Math.min(p.life*1.8,1);
    ctx.fillStyle=p.color;
    ctx.shadowColor=p.color;
    ctx.shadowBlur=20;
    ctx.font='bold 42px monospace';
    ctx.textAlign='center';
    ctx.textBaseline='middle';
    ctx.strokeStyle='rgba(0,0,0,0.7)';
    ctx.lineWidth=3;
    ctx.strokeText(p.text,0,0);
    ctx.fillText(p.text,0,0);
    ctx.restore();
  }
  ctx.globalAlpha=1;
  ctx.shadowBlur=0;
}

// ═══════════════════════════════════════════════════
// PADDLE - PREMIUM NEON DESIGN
// ═══════════════════════════════════════════════════
let paddle={x:0,y:0,w:70,h:12,color:'#0ff',laserActive:false};
function resetPaddle(){
  paddle.w=70*Math.min(sx,sy,1.3);paddle.h=clamp(12*sy,8,14);
  paddle.x=W/2;paddle.y=H-55*sy;
  paddle.color='#0ff';
  paddle.laserActive=false;
}
function drawPaddle(){
  const px=paddle.x-paddle.w/2,py=paddle.y-paddle.h/2;
  const col=feverMode?'#f40':paddle.color;
  const glow=Math.min(16+comboCount*3,40);
  
  // Premium paddle with glass effect and electric arcs
  const g=ctx.createLinearGradient(px,py,px,py+paddle.h);
  g.addColorStop(0,'rgba(255,255,255,0.2)');
  g.addColorStop(0.1,col);
  g.addColorStop(0.5,'rgba(255,255,255,0.3)');
  g.addColorStop(0.9,col);
  g.addColorStop(1,'rgba(0,0,0,0.6)');
  ctx.fillStyle=g;
  
  ctx.shadowColor=col;ctx.shadowBlur=glow;
  ctx.beginPath();ctx.roundRect(px,py,paddle.w,paddle.h,paddle.h/2);ctx.fill();
  
  // Glass reflection
  ctx.fillStyle='rgba(255,255,255,0.25)';
  ctx.beginPath();ctx.roundRect(px+2,py+1,paddle.w-4,paddle.h*0.35,paddle.h/2);ctx.fill();
  
  // Electric arcs at edges
  if(comboCount>=5||feverMode){
    ctx.strokeStyle=col;ctx.lineWidth=1.5;ctx.shadowColor=col;ctx.shadowBlur=12;
    ctx.beginPath();ctx.moveTo(px+5,py-5);ctx.lineTo(px+10,py-12);ctx.lineTo(px+15,py-5);ctx.stroke();
    ctx.beginPath();ctx.moveTo(px+paddle.w-5,py-5);ctx.lineTo(px+paddle.w-10,py-12);ctx.lineTo(px+paddle.w-15,py-5);ctx.stroke();
  }
  
  // Laser indicators
  if(paddle.laserActive){
    ctx.fillStyle='#f00';ctx.shadowColor='#f00';ctx.shadowBlur=10;
    ctx.beginPath();ctx.arc(px+7,py-3,3,0,Math.PI*2);ctx.fill();
    ctx.beginPath();ctx.arc(px+paddle.w-7,py-3,3,0,Math.PI*2);ctx.fill();
  }
  ctx.shadowBlur=0;
}

// ═══════════════════════════════════════════════════
// BALL
// ═══════════════════════════════════════════════════
let balls=[];
function getBallCount(lvl){
  return Math.min(10, 2 + Math.floor((lvl-1)/12));
}
const EXTRA_COLOR='#ff4400';
function makeBall(x,y,vx,vy,r){return{x,y,vx,vy,r,stuck:true,trail:[],phase:false,extra:false,color:'#0ff'}}
function resetBall(){
  balls=[];
  const r=clamp(6*Math.min(sx,sy),4,10);
  const count=getBallCount(level);
  for(let i=0;i<count;i++){
    const bx=paddle.x+(i-Math.floor(count/2))*r*2.2;
    const b=makeBall(bx,paddle.y-paddle.h/2-r-2,0,0,r);
    b.stuck=true;
    balls.push(b);
  }
}
function updateBalls(){
  let ballLost=false;
  for(let i=balls.length-1;i>=0;i--){
    const b=balls[i];
    if(b.stuck){b.x=paddle.x;b.y=paddle.y-paddle.h/2-b.r-4;continue}
    b.x+=b.vx;b.y+=b.vy;
    
    b.trail.push({x:b.x,y:b.y,life:1});
    if(b.trail.length>8)b.trail.shift();
    for(const t of b.trail)t.life-=0.1;
    
    if(frameCount%3===0)emitTrail(b.x,b.y,b.extra?b.color:'#0ff');
    
    if(b.x-b.r<0){b.x=b.r;b.vx=Math.abs(b.vx);sfxHit()}
    if(b.x+b.r>W){b.x=W-b.r;b.vx=-Math.abs(b.vx);sfxHit()}
    if(b.y-b.r<0){b.y=b.r;b.vy=Math.abs(b.vy);sfxHit()}
    if(b.y+b.r>H){
      if(b.extra){balls.splice(i,1)}
      else{ballLost=true}
      continue;
    }
    
    if(b.vy>0&&b.y+b.r>=paddle.y-paddle.h/2&&b.y-b.r<=paddle.y+paddle.h/2&&b.x>=paddle.x-paddle.w/2-b.r&&b.x<=paddle.x+paddle.w/2+b.r){
      const off=(b.x-paddle.x)/(paddle.w/2);
      const spd=Math.sqrt(b.vx*b.vx+b.vy*b.vy);
      const ang=off*Math.PI/3;
      b.vx=spd*Math.sin(ang);
      b.vy=-Math.max(Math.abs(spd*Math.cos(ang)),2*sy);
      b.y=paddle.y-paddle.h/2-b.r;
      sfxHit();emit(b.x,b.y+b.r,'#00ffff',6,3);
      emitSparkShower(b.x,b.y+b.r,'#00ffff',4);
      comboCount=0;comboTimer=0;
    }
  }
  if(ballLost){
    balls=[];
    loseLife();
    if(lives>0)resetBall();
  }
}
function drawBalls(){
    const t=Date.now()*0.003;
    for(const b of balls){
      const glow=Math.min(12+comboCount*3,35);
      const bc=b.extra?b.color:'#0ff';
    
    // Trail
    for(let i=b.trail.length-1;i>=0;i--){
      const tr=b.trail[i];
      if(tr.life<=0)continue;
      ctx.globalAlpha=tr.life*0.5;
      ctx.fillStyle=bc;
      ctx.shadowColor=bc;ctx.shadowBlur=8*tr.life;
      ctx.beginPath();ctx.arc(tr.x,tr.y,b.r*tr.life*0.6,0,Math.PI*2);ctx.fill();
    }
    ctx.globalAlpha=1;ctx.shadowBlur=0;
    
    // Ball body
    const bg=ctx.createRadialGradient(b.x-b.r*0.3,b.y-b.r*0.3,b.r*0.1,b.x,b.y,b.r);
    bg.addColorStop(0,'#fff');bg.addColorStop(0.4,'#fff');
    bg.addColorStop(0.8,bc);bg.addColorStop(1,'rgba(0,0,0,0.5)');
    ctx.fillStyle=bg;ctx.shadowColor=bc;ctx.shadowBlur=glow;
    ctx.beginPath();ctx.arc(b.x,b.y,b.r,0,Math.PI*2);ctx.fill();
    
    // Highlight
    ctx.fillStyle='rgba(255,255,255,0.5)';
    ctx.beginPath();ctx.arc(b.x-b.r*0.25,b.y-b.r*0.25,b.r*0.35,0,Math.PI*2);ctx.fill();
    
    // Phase effect
    if(b.phase){
      ctx.globalAlpha=0.3+Math.sin(t*6)*0.2;ctx.strokeStyle='#ff0';ctx.lineWidth=1.5;ctx.shadowBlur=10;
      ctx.beginPath();ctx.arc(b.x,b.y,b.r+4,0,Math.PI*2);ctx.stroke();
    }
    // Combo border
    if(comboCount>=5||feverMode){
      ctx.globalAlpha=0.5;ctx.strokeStyle=feverMode?'#ff0':'#0ff';ctx.lineWidth=1.5;ctx.shadowBlur=12;ctx.shadowColor=ctx.strokeStyle;
      ctx.beginPath();ctx.arc(b.x,b.y,b.r+2,0,Math.PI*2);ctx.stroke();
    }
    ctx.globalAlpha=1;ctx.shadowBlur=0;
  }
}

// ═══════════════════════════════════════════════════
// BRICKS
// ═══════════════════════════════════════════════════
let bricks=[];
function createBrick(x,y,w,h,type){
  return{x,y,w,h,type,hp:BLOCK_TYPES[type].hp,maxHp:BLOCK_TYPES[type].hp,glow:rand(0,6.28),
    moveDir:BLOCK_TYPES[type].moving?1:0,moveSpeed:BLOCK_TYPES[type].moving?rand(0.3,1):0,
    moveAxis:Math.random()>0.5?'x':'y',
    regenTimer:0,flashTimer:0,ci:0};
}
function pickBlockType(lvl){
  const r=Math.random();
  const p=(lvl-1)/99;
  if(lvl<=2){if(r<0.75)return'normal';if(r<0.92)return'hard';return'bonus'}
  if(lvl<=5){if(r<0.55)return'normal';if(r<0.75)return'hard';if(r<0.88)return'explosive';return'bonus'}
  if(lvl<=10){if(r<0.35)return'normal';if(r<0.55)return'hard';if(r<0.7)return'metal';if(r<0.82)return'explosive';if(r<0.92)return'chain';return'power'}
  if(lvl<=20){if(r<0.2)return'normal';if(r<0.4)return'hard';if(r<0.55)return'metal';if(r<0.68)return'explosive';if(r<0.78)return'chain';if(r<0.88)return'moving';return'power'}
  if(lvl<=40){if(r<0.1)return'normal';if(r<0.25)return'hard';if(r<0.42)return'metal';if(r<0.55)return'explosive';if(r<0.65)return'chain';if(r<0.75)return'moving';if(r<0.85)return'regen';return'power'}
  if(r<0.05)return'normal';if(r<0.18)return'hard';if(r<0.35)return'metal';if(r<0.48)return'explosive';if(r<0.58)return'chain';if(r<0.68)return'moving';if(r<0.8)return'regen';return'power';
}
function generateLevel(lvl){
  bricks=[];
  const pat=PATTERNS[(lvl-1)%PATTERNS.length];
  const m=pat.m;
  const patRows=m.length,cols=m[0].length;

  const minRows=3;
  const maxRows=12;
  const targetRows=Math.round(minRows+(maxRows-minRows)*((lvl-1)/99));
  const bw=W/cols;
  const bh=clamp(26*sy,18,32);
  const offsetY=55*sy;

  for(let r=0;r<targetRows;r++){
    for(let c=0;c<cols;c++){
      let filled=false;
      if(r<patRows){filled=!!m[r][c]}
      else{filled=Math.random()<0.7}
      if(!filled)continue;
      const type=pickBlockType(lvl);
      const brick=createBrick(c*bw,offsetY+r*bh,bw,bh,type);
      brick.ci=randInt(0,BRICK_COLORS.length-1);
      brick.glow=rand(0,6.28);
      
      if(type==='moving'){
        brick.moveSpeed=rand(0.3,0.8);
        brick.moveDir=Math.random()>0.5?1:-1;
        brick.moveAxis=Math.random()>0.5?'x':'y';
        const range=bw*0.3;
        brick.moveMin=brick.moveAxis==='x'?brick.x-range:Math.max(brick.y-range,offsetY*0.5);
        brick.moveMax=brick.moveAxis==='x'?brick.x+range:Math.min(brick.y+range,H*0.75);
      }
      
      bricks.push(brick);
    }
  }
}

function drawBrickB(b){
  const bt=BLOCK_TYPES[b.type];
  const hp=b.hp/b.maxHp;
  const c=BRICK_COLORS[b.ci%BRICK_COLORS.length];
  const t=timeCounter*0.025;
  const pulse=0.9+Math.sin(t+b.glow)*0.1;
  let alpha=clamp(0.5+hp*0.5,0.5,1)*pulse;
  
  ctx.globalAlpha=alpha;
  const x=b.x,y=b.y,w=b.w,h=b.h;
  const cx=x+w/2,cy=y+h/2;
  
  // Premium 3D neon brick rendering
  ctx.shadowColor=c.fill;ctx.shadowBlur=4+Math.sin(t+b.glow)*2;
  
  // 3D bevel - bottom shadow
  ctx.fillStyle='rgba(0,0,0,0.4)';
  ctx.fillRect(x,y+h,w*0.05,-w*0.05);
  ctx.fillRect(x+w,y+h,w*0.05,-h*0.05);
  
  // Brick body with gradient
  const grad=ctx.createRadialGradient(cx,cy,w*0.15,cx,cy,w*0.6);
  grad.addColorStop(0,c.hi);
  grad.addColorStop(0.25,c.fill);
  grad.addColorStop(0.75,c.fill);
  grad.addColorStop(1,c.lo);
  ctx.fillStyle=grad;
  ctx.fillRect(x,y,w,h);
  
  // 3D bevel - top highlight
  ctx.fillStyle='rgba(255,255,255,0.25)';
  ctx.fillRect(x+1,y+1,w-2,h*0.35);
  ctx.fillStyle='rgba(0,0,0,0.35)';
  ctx.fillRect(x+1,y+h*0.7,w-2,h*0.25);
  
  // Neon border (heavy glow effect)
  ctx.strokeStyle=c.fill;
  ctx.lineWidth=3;
  ctx.shadowBlur=12+Math.sin(t+b.glow)*4;
  ctx.shadowColor=c.fill;
  ctx.strokeRect(x,y,w,h);
  ctx.shadowBlur=0;
  
  // Inner detail
  ctx.fillStyle='rgba(255,255,255,0.15)';
  ctx.fillRect(x+4,y+4,w-8,h*0.3);
  
  if(hp<1){
    ctx.globalAlpha=(1-hp)*0.5;ctx.strokeStyle='rgba(255,255,255,0.6)';ctx.lineWidth=1;
    ctx.beginPath();ctx.moveTo(x+w*0.2,y+h*0.2);ctx.lineTo(x+w*0.5,y+h*0.5);ctx.lineTo(x+w*0.35,y+h*0.8);ctx.stroke();
    ctx.beginPath();ctx.moveTo(x+w*0.5,y+h*0.5);ctx.lineTo(x+w*0.8,y+h*0.3);ctx.stroke();
  }
  
  if(b.flashTimer>0){
    ctx.globalAlpha=b.flashTimer*0.5;ctx.fillStyle='#fff';
    ctx.fillRect(x+1,y+1,w-2,h-2);
    b.flashTimer-=0.06;
  }
  
  ctx.globalAlpha=1;
}
function drawBricks(){
  for(const b of bricks)drawBrickB(b);
  ctx.globalAlpha=1;ctx.shadowBlur=0;
}

// ═══════════════════════════════════════════════════
// COLLISION
// ═══════════════════════════════════════════════════
function ballBrickCollision(){
  for(let i=bricks.length-1;i>=0;i--){
    const b=bricks[i];
    for(let j=balls.length-1;j>=0;j--){
      const ball=balls[j];
      if(ball.x+ball.r>b.x&&ball.x-ball.r<b.x+b.w&&ball.y+ball.r>b.y&&ball.y-ball.r<b.y+b.h){
        const oL=ball.x+ball.r-b.x,oR=b.x+b.w-(ball.x-ball.r),oT=ball.y+ball.r-b.y,oB=b.y+b.h-(ball.y-ball.r);
        const mn=Math.min(oL,oR,oT,oB);
        if(mn===oL||mn===oR)ball.vx*=-1;else ball.vy*=-1;
        hitBrick(i);break;
      }
    }
  }
}
function hitBrick(idx,isChain){
  const b=bricks[idx];if(!b)return;
  const bt=BLOCK_TYPES[b.type];
  b.hp--;
  b.flashTimer=1;
  if(b.hp<=0){
    comboCount++;comboTimer=120;
    if(comboCount>maxCombo)maxCombo=comboCount;
    const mult=Math.min(8,1+Math.floor(comboCount/3));
    const baseScore=bt?bt.score:10;
    const pts=baseScore*mult;
    score+=pts;
    sfxBreak();
    if(comboCount%3===0)sfxCombo(mult);
    
    const bc=BRICK_COLORS[b.ci%BRICK_COLORS.length].fill;
    const px=b.x+b.w/2,py=b.y+b.h/2;
    
    // Premium break effects
    emitExplosion(px,py,bc,10+comboCount*3);
    emitSparkShower(px,py,bc,8+comboCount*2);
    if(mult>=3)emitShockwave(px,py,5,bc,60+mult*10);
    if(mult>=5)emitScreenFlash(bc);
    
    addPopup(px,py,'+'+pts,mult>1?hsl(50-mult*5,100,60):'#fff',mult>4?22:16);
    if(mult>=4)addComboPopup(W/2,H*0.35,mult+'x COMBO!',hsl(50-mult*5,100,60));
    screenShake=Math.min(comboCount*0.6,10);
    
    if(comboCount>=12&&!feverMode){feverMode=true;feverTimer=300;addComboPopup(W/2,H*0.3,'FEVER!','#ff0');sfxFever()}
    feverCharge=Math.min(feverCharge+8,100);
    
    if(bt&&bt.explode&&!isChain)explodeBrick(b);
    if(bt&&bt.chain&&!isChain)chainBrick(b);
    if(bt&&bt.coin){coins+=5;sfxPowerUp();emit(px,py,'#ff0',15,5);addPopup(px,py-15,'+5 coins','#ff0',18)}
    if(bt&&bt.powerUp){dropPowerUp(px,py);dropPowerUp(px,py)}
    
    dropPowerUp(px,py);
    bricks.splice(idx,1);
    sfxHit();
  }else{
    sfxMetal();
    emit(b.x+b.w/2,b.y+b.h/2,'#ffffff',6,3);
    emitSparkShower(b.x+b.w/2,b.y+b.h/2,'#ffffff',4);
    screenShake=Math.min(screenShake+3,8);
  }
}
function explodeBrick(b){
  let chains=0;
  for(let i=bricks.length-1;i>=0;i--){
    const ob=bricks[i];if(ob===b)continue;
    const dx=(ob.x+ob.w/2)-(b.x+b.w/2),dy=(ob.y+ob.h/2)-(b.y+b.h/2);
    if(Math.sqrt(dx*dx+dy*dy)<120){hitBrick(i,true);chains++}
  }
  if(chains>0){addPopup(b.x+b.w/2,b.y+b.h/2-20,'CHAIN x'+chains,'#ff8800',22);screenShake=Math.min(screenShake+chains*2.5,14)}
  emitExplosion(b.x+b.w/2,b.y+b.h/2,'#ff8800',35);
  emitShockwave(b.x+b.w/2,b.y+b.h/2,5,'#ff4400',100);
  emitSparkShower(b.x+b.w/2,b.y+b.h/2,'#ffaa00',16);
  sfxExplosion();
}
function chainBrick(b){
  for(let i=bricks.length-1;i>=0;i--){
    const ob=bricks[i];if(ob===b)continue;
    const dx=(ob.x+ob.w/2)-(b.x+b.w/2),dy=(ob.y+ob.h/2)-(b.y+b.h/2);
    if(Math.sqrt(dx*dx+dy*dy)<80){ob.hp--;ob.flashTimer=1;if(ob.hp<=0)hitBrick(i,true)}
  }
  emit(b.x+b.w/2,b.y+b.h/2,'#ff8800',18,5);
  emitShockwave(b.x+b.w/2,b.y+b.h/2,3,'#ff6600',60);
}
function updateMovingBricks(){
  for(const b of bricks){
    const bt=BLOCK_TYPES[b.type];
    if(bt&&bt.moving){
      b[b.moveAxis]+=b.moveSpeed*b.moveDir;
      if(b[b.moveAxis]>=b.moveMax||b[b.moveAxis]<=b.moveMin)b.moveDir*=-1;
    }
    if(bt&&bt.regen){
      b.regenTimer++;
      if(b.regenTimer>300&&b.hp<b.maxHp){b.hp=Math.min(b.hp+1,b.maxHp);b.regenTimer=0}
    }
  }
}

// ═══════════════════════════════════════════════════
// POWER-UPS
// ═══════════════════════════════════════════════════
let powerUps=[];
const PU_TYPES=[
  {id:'wide',emoji:'W',color:'#0f0',name:'WIDE',dur:600},
  {id:'laser',emoji:'L',color:'#f00',name:'LASER',dur:480},
  {id:'multi',emoji:'M',color:'#ff0',name:'MULTI',dur:0},
  {id:'slow',emoji:'S',color:'#88f',name:'SLOW',dur:480},
  {id:'life',emoji:'+',color:'#f44',name:'1UP',dur:0},
  {id:'coin',emoji:'$',color:'#ff0',name:'COINS',dur:0},
  {id:'phase',emoji:'P',color:'#ff0',name:'PHASE',dur:300},
  {id:'giant',emoji:'G',color:'#f0f',name:'GIANT',dur:300}
];
  let activePowerUps={};
  function dropPowerUp(x,y){
    if(Math.random()>0.22)return;
    const t=PU_TYPES[randInt(0,PU_TYPES.length-1)];
    powerUps.push({x,y,vy:2*sy,type:t});
  }
  function updatePowerUps(){
    for(let i=powerUps.length-1;i>=0;i--){
      const p=powerUps[i];
      p.y+=p.vy;
      if(p.y>H){powerUps.splice(i,1);continue}
      if(p.y+12>=paddle.y-paddle.h/2&&p.y<=paddle.y+paddle.h/2&&p.x>=paddle.x-paddle.w/2-10&&p.x<=paddle.x+paddle.w/2+10){
        activatePowerUp(p.type);powerUps.splice(i,1);
      }
    }
    for(const k in activePowerUps){
      if(activePowerUps[k]>0){activePowerUps[k]--;if(activePowerUps[k]<=0)deactivatePowerUp(k)}
    }
  }
  function activatePowerUp(t){
    sfxPowerUp();
    addPopup(paddle.x,paddle.y-30,t.name,t.color,16);
    emit(paddle.x,paddle.y-20,t.color,10,3);
    switch(t.id){
      case'wide':paddle.w=100*Math.min(sx,sy,1.3);activePowerUps.wide=t.dur;break;
      case'laser':paddle.laserActive=true;activePowerUps.laser=t.dur;break;
      case'multi':
        if(balls.length>0&&balls.length<12){
          const b=balls.find(x=>!x.stuck)||balls[0];
          const nb1=makeBall(b.x,b.y,Math.abs(b.vx)+1,-Math.abs(b.vy),b.r);nb1.stuck=false;nb1.extra=true;nb1.color=EXTRA_COLOR;
          const nb2=makeBall(b.x,b.y,-Math.abs(b.vx)-1,-Math.abs(b.vy),b.r);nb2.stuck=false;nb2.extra=true;nb2.color=EXTRA_COLOR;
          balls.push(nb1,nb2);
          if(balls.length<12){const nb3=makeBall(b.x,b.y,(Math.random()-0.5)*3,-Math.abs(b.vy),b.r);nb3.stuck=false;nb3.extra=true;nb3.color=EXTRA_COLOR;balls.push(nb3)}
        }break;
      case'slow':for(const b of balls){b.vx*=0.5;b.vy*=0.5}activePowerUps.slow=t.dur;break;
      case'life':lives=Math.min(lives+1,5);addPopup(W/2,H/2,'+1 LIFE','#f44',20);break;
      case'coin':coins+=10;emit(paddle.x,paddle.y-30,'#ff0',15,4);break;
      case'phase':for(const b of balls)b.phase=true;activePowerUps.phase=t.dur;break;
      case'giant':for(const b of balls)b.r=clamp(b.r*1.5,4,16);activePowerUps.giant=t.dur;break;
    }
  }
  function deactivatePowerUp(id){
    switch(id){
      case'wide':paddle.w=70*Math.min(sx,sy,1.3);break;
      case'laser':paddle.laserActive=false;break;
      case'slow':for(const b of balls){b.vx/=0.5||1;b.vy/=0.5||1}break;
      case'phase':for(const b of balls)b.phase=false;break;
      case'giant':for(const b of balls)b.r=clamp(6*Math.min(sx,sy),4,10);break;
    }
  }
function drawPowerUps(){
  for(const p of powerUps){
    const pulse=0.8+Math.sin(Date.now()*0.006+p.x)*0.2;
    ctx.globalAlpha=pulse;
    ctx.fillStyle=p.type.color;ctx.shadowColor=p.type.color;ctx.shadowBlur=12;
    ctx.beginPath();ctx.arc(p.x,p.y,11*pulse,0,Math.PI*2);ctx.fill();
    ctx.globalAlpha=0.3;ctx.strokeStyle=p.type.color;ctx.lineWidth=1.5;ctx.shadowBlur=15;
    ctx.beginPath();ctx.arc(p.x,p.y,15*pulse,0,Math.PI*2);ctx.stroke();
    ctx.globalAlpha=1;ctx.shadowBlur=4;
    ctx.fillStyle='#000';ctx.font='bold 10px monospace';ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.fillText(p.type.emoji,p.x,p.y);
    ctx.shadowBlur=0;
  }
  ctx.globalAlpha=1;
}
function drawActivePowerUpHUD(){
  const hud=$('hud-powerups');
  if(!hud)return;
  let html='';
  for(const k in activePowerUps){
    if(activePowerUps[k]>0){
      const pu=PU_TYPES.find(p=>p.id===k);
      if(pu){
        const secs=Math.ceil(activePowerUps[k]/60);
        html+=`<div class="hud-pu" style="color:${pu.color};border-color:${pu.color}">${pu.emoji}<span class="hud-pu-timer">${secs}s</span></div>`;
      }
    }
  }
  hud.innerHTML=html;
}

// ═══════════════════════════════════════════════════
// LASER
// ═══════════════════════════════════════════════════
let lasers=[];
function fireLaser(){
  if(!paddle.laserActive)return;
  lasers.push({x:paddle.x-paddle.w/2+6,y:paddle.y-paddle.h/2,vy:-9*sy});
  lasers.push({x:paddle.x+paddle.w/2-6,y:paddle.y-paddle.h/2,vy:-9*sy});
  playTone(1400,0.04,'sawtooth',0.05);
}
function updateLasers(){
  for(let i=lasers.length-1;i>=0;i--){
    const l=lasers[i];l.y+=l.vy;
    if(l.y<0){lasers.splice(i,1);continue}
    for(let j=bricks.length-1;j>=0;j--){
      const b=bricks[j];
      if(l.x>=b.x&&l.x<=b.x+b.w&&l.y>=b.y&&l.y<=b.y+b.h){
        hitBrick(j);lasers.splice(i,1);
        emit(l.x,b.y+b.h/2,'#f00',4,2);break;
      }
    }
  }
}
function drawLasers(){
  for(const l of lasers){
    const grd=ctx.createLinearGradient(l.x,l.y+12,l.x,l.y);
    grd.addColorStop(0,'rgba(255,0,0,0)');grd.addColorStop(0.3,'rgba(255,0,0,0.7)');grd.addColorStop(1,'rgba(255,200,0,1)');
    ctx.fillStyle=grd;ctx.shadowColor='#f00';ctx.shadowBlur=4;ctx.fillRect(l.x-1.5,l.y,3,12);ctx.shadowBlur=0;
  }
}

// ═══════════════════════════════════════════════════
// GAME LOGIC
// ═══════════════════════════════════════════════════
let rvUsed=false;
function loseLife(){
  lives--;comboCount=0;comboTimer=0;feverMode=false;feverCharge=0;
  sfxDie();screenShake=12;
  emitExplosion(paddle.x,paddle.y,'#ff2244',25);
  emitShockwave(paddle.x,paddle.y,5,'#ff0044',80);
  addPopup(paddle.x,paddle.y-20,'-1','#ff4444',22);
  if(lives<=0){setTimeout(gameOver,600)}
}
function gameOver(){
  state='over';
  if(score>best)best=score;
  scoreHistory.push({score,level,date:Date.now()});
  scoreHistory.sort((a,b)=>b.score-a.score);
  scoreHistory=scoreHistory.slice(0,50);
  saveProgress();ytSave();ytSendScore();
  showScreen('game-over');
  $('final-score').textContent=score;
  $('final-best').textContent=best;
  $('final-level').textContent=level;
  $('final-combo').textContent=maxCombo+'x';
      
}
function levelComplete(){
  if(state==='complete')return;
  state='complete';
  const bonus=level*50;
  const stars=maxCombo>=20?3:maxCombo>=10?2:1;
  const lvlIdx=(level-1)%100;
  if(stars>LEVELS[lvlIdx].stars)LEVELS[lvlIdx].stars=stars;
  if(score>LEVELS[lvlIdx].bestScore)LEVELS[lvlIdx].bestScore=score;
  score+=bonus;
  const coinReward=5+level;
  coins+=coinReward;
  if(score>best)best=score;
  if(level>=maxUnlockedLevel)maxUnlockedLevel=Math.min(level+1,100);
  ytSave();ytSendScore();
  if(level>=100){gameComplete(bonus,coinReward,stars);return}
  showScreen('level-complete');
  $('lc-score').textContent=score;
  $('lc-bonus').textContent=bonus;
  $('lc-combo').textContent=maxCombo+'x';
  $('lc-total').textContent=score;
  const starsEl=$('lc-stars');
  starsEl.innerHTML='';
  for(let i=0;i<3;i++){
    const s=document.createElement('span');
    s.className='lc-star'+(i<stars?' earned':'');
    s.textContent=String.fromCodePoint(0x2B50);
    starsEl.appendChild(s);
  }
  sfxWin();
}
function checkLevelComplete(){
  if(state!=='play')return;
  if(bricks.length===0){
    levelComplete();
  }
}

// ═══════════════════════════════════════════════════
// GAME COMPLETE (100 levels cleared)
// ═══════════════════════════════════════════════════
let gameWon=false,gcTimer=0,confettiTimer=0;
const CELEBRATION_COLORS=['#0ff','#f0f','#ff0','#0f0','#f80','#0ff','#f0f','#ff0'];
function gameComplete(bonus,coinReward,stars){
  gameWon=true;gcTimer=0;confettiTimer=0;
  partLimit=1200;
  const lapBonus=2000;
  coins+=lapBonus;
  saveProgress();ytSave();
  showScreen('game-complete');
  $('gc-score').textContent=score+lapBonus;
  $('gc-combo').textContent=maxCombo+'x';
  $('gc-coins').textContent=coins;
  const totalStars=LEVELS.reduce((a,l)=>a+l.stars,0);
  $('gc-stars').textContent=totalStars+' / 300';
  for(let i=0;i<24;i++)confettiBurst(rand(0,W),rand(0,H*0.5));
  sfxWin();setTimeout(sfxWin,300);setTimeout(sfxWin,650);
  emitScreenFlash('#fff');
}

function confettiBurst(x,y){
  for(let i=0;i<30;i++){
    if(particles.length>=partLimit)return;
    const a=rand(-Math.PI,0);
    const sp=rand(3,9);
    particles.push({x,y,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp-rand(2,5),life:rand(0.8,1.6),decay:rand(0.008,0.014),color:CELEBRATION_COLORS[Math.floor(rand(0,CELEBRATION_COLORS.length))],r:rand(2,5),glow:rand(10,20),confetti:true,spin:rand(0.05,0.2),angle:rand(0,Math.PI*2)});
  }
}
function fireworksBurst(x,y){
  const col=CELEBRATION_COLORS[Math.floor(rand(0,CELEBRATION_COLORS.length))];
  for(let i=0;i<50;i++){
    if(particles.length>=partLimit)return;
    const a=rand(0,Math.PI*2);
    const sp=rand(1,5);
    particles.push({x,y,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp,life:rand(0.7,1.4),decay:rand(0.012,0.02),color:col,r:rand(1.5,3.5),glow:rand(12,24),gravity:0.04,noShadow:true});
  }
}
function updateCelebration(){
  if(!gameWon)return;
  gcTimer++;
  if(gcTimer%40===0)confettiBurst(rand(0,W),rand(-10,10));
  if(gcTimer%90===0)fireworksBurst(rand(W*0.2,W*0.8),rand(H*0.15,H*0.5));
}

// ═══════════════════════════════════════════════════
// SCREEN MANAGEMENT
// ═══════════════════════════════════════════════════
function showScreen(id){
  ['main-menu','pause-screen','game-over','level-complete','game-complete','how-screen','level-select'].forEach(s=>{
    const el=$(s);if(el)el.classList.add('hidden');
  });
  if(id){const el=$(id);if(el)el.classList.remove('hidden')}
  const hud=$('game-hud');if(hud)hud.classList.toggle('hidden',state!=='play');
}
function updateHud(){
  const hs=$('hud-score');if(hs)hs.textContent=score;
  const hl=$('hud-level');if(hl)hl.textContent='LV '+level;
  const hc=$('hud-combo');
  if(hc){
    if(comboCount>=3){
      const mult=Math.min(8,1+Math.floor(comboCount/3));
      hc.textContent=mult+'x COMBO';
      hc.style.color=hsl(50-mult*5,100,60);
      hc.classList.add('active');
    }else{hc.textContent='';hc.classList.remove('active')}
  }
  const hv=$('hud-lives');
  if(hv){
    let html='';
    for(let i=0;i<5;i++){
      if(i<lives)html+='<span class="heart">♥</span>';
      else html+='<span class="heart empty">♥</span>';
    }
    hv.innerHTML=html;
  }
}

// ═══════════════════════════════════════════════════
// START / NEXT LEVEL
// ═══════════════════════════════════════════════════
// ═══════════════════════════════════════════════════
// LEVEL SELECT
// ═══════════════════════════════════════════════════
function renderLevelSelect(){
  const grid=$('level-grid');if(!grid)return;
  let html='';
  for(let i=1;i<=100;i++){
    const unlocked=i<=maxUnlockedLevel;
    const isCurrent=i===maxUnlockedLevel;
    const stars=LEVELS[i-1]?LEVELS[i-1].stars:0;
    let cls='level-item';
    if(!unlocked)cls+=' locked';
    if(isCurrent)cls+=' current';
    let starsHtml='';
    if(stars>0){for(let s=0;s<3;s++)starsHtml+=s<stars?'★':'☆'}
    html+=`<div class="${cls}" data-lvl="${i}"><span class="lvl-num">${i}</span>${starsHtml?`<span class="lvl-stars">${starsHtml}</span>`:''}</div>`;
  }
  grid.innerHTML=html;
  grid.querySelectorAll('.level-item:not(.locked)').forEach(el=>{
    el.onclick=()=>{sfxUI();startLevel(parseInt(el.dataset.lvl))};
  });
}
function startGame(){
  state='play';score=0;lives=3;rvUsed=false;
  gameWon=false;partLimit=600;
  comboCount=0;comboTimer=0;maxCombo=0;
  feverMode=false;feverTimer=0;feverCharge=0;
  activePowerUps={};powerUps=[];lasers=[];
  particles=[];popups=[];comboPopups=[];trailParticles=[];
  resetPaddle();resetBall();
  generateLevel(level);
  showScreen(null);
  levelIntroTimer=90;
  levelIntroText=PATTERNS[(level-1)%PATTERNS.length].name;
  if(platformPaused){state='paused';showScreen('pause-screen')}
}
function startLevel(lvl){
  level=Math.min(lvl,100);
  startGame();
}
function nextLevel(){
  if(level>=100){gameComplete(0,0,3);return}
  level=level+1;
  startGame();
}

// ═══════════════════════════════════════════════════
// BACKGROUND
// ═══════════════════════════════════════════════════
const bgNebulae=[];for(let i=0;i<5;i++)bgNebulae.push({x:Math.random(),y:Math.random(),r:Math.random()*0.3+0.15,h:Math.random()*60+180,sp:Math.random()*0.0002+0.0001});

function drawBackground(){
  const t=Date.now()*0.001;
  const grd=ctx.createLinearGradient(0,0,W*0.3,H);
  grd.addColorStop(0,'#0a0a1a');
  grd.addColorStop(0.3,'#080818');
  grd.addColorStop(0.6,'#0c0520');
  grd.addColorStop(1,'#050510');
  ctx.fillStyle=grd;ctx.fillRect(0,0,W,H);

  ctx.save();
  ctx.beginPath();ctx.rect(0,0,W,H);ctx.clip();

  for(const n of bgNebulae){
    const nx=n.x*W+Math.sin(t*0.3+n.x*10)*W*0.05;
    const ny=n.y*H+Math.cos(t*0.2+n.y*10)*H*0.03;
    const nr=n.r*Math.min(W,H);
    const ng=ctx.createRadialGradient(nx,ny,0,nx,ny,nr);
    const pulse=0.03+Math.sin(t*0.5+n.h)*0.015;
    ng.addColorStop(0,`hsla(${n.h},80%,50%,${pulse})`);
    ng.addColorStop(0.5,`hsla(${n.h+30},70%,40%,${pulse*0.5})`);
    ng.addColorStop(1,'transparent');
    ctx.fillStyle=ng;ctx.fillRect(0,0,W,H);
  }

  for(const s of bgStars){
    const flicker=0.4+Math.sin(t*2+s.tw)*0.3+s.bright*0.3;
    ctx.globalAlpha=flicker;
    ctx.fillStyle=hsl(s.hue,60,80);
    ctx.beginPath();ctx.arc(s.x,s.y,s.r,0,Math.PI*2);ctx.fill();
  }
  ctx.globalAlpha=1;

  ctx.globalAlpha=0.018;
  ctx.strokeStyle='#00ffff';ctx.lineWidth=1;
  const gOff=(timeCounter*0.4)%30;
  for(let x=0;x<W;x+=50){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);ctx.stroke()}
  for(let y=gOff;y<H;y+=40){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke()}
  ctx.globalAlpha=1;

  const rayX=W*0.5+Math.sin(t*0.15)*W*0.3;
  const rGrd=ctx.createLinearGradient(rayX,0,rayX,H);
  rGrd.addColorStop(0,'rgba(0,255,255,0.012)');
  rGrd.addColorStop(0.5,'rgba(100,0,255,0.006)');
  rGrd.addColorStop(1,'transparent');
  ctx.fillStyle=rGrd;
  ctx.beginPath();ctx.moveTo(rayX-60,0);ctx.lineTo(rayX+60,0);ctx.lineTo(rayX+120,H);ctx.lineTo(rayX-120,H);ctx.fill();

  ctx.restore();

  const vg=ctx.createRadialGradient(W/2,H/2,W*0.15,W/2,H/2,Math.max(W,H)*0.7);
  vg.addColorStop(0,'rgba(0,0,0,0)');
  vg.addColorStop(1,'rgba(0,0,0,0.5)');
  ctx.fillStyle=vg;ctx.fillRect(0,0,W,H);
  
  if(feverMode){
    const p=0.08+Math.sin(t*10)*0.04;
    ctx.fillStyle=`rgba(255,50,0,${p})`;
    ctx.globalCompositeOperation='overlay';
    ctx.fillRect(0,0,W,H);
    ctx.globalCompositeOperation='source-over';
  }
}
function drawScanlines(){
  ctx.fillStyle='rgba(0,0,0,0.02)';for(let y=0;y<H;y+=3)ctx.fillRect(0,y,W,1);
}
function drawComboHUD(){
  if(comboCount>=3){
    const mult=Math.min(8,1+Math.floor(comboCount/3));
    const pulse=1+Math.sin(Date.now()*0.008)*0.1;
    const col=hsl(50-mult*5,100,60);
    ctx.fillStyle=col;ctx.shadowColor=col;ctx.shadowBlur=14;ctx.globalAlpha=0.85;
    ctx.font=`bold ${clamp(15,4,22)*pulse}px monospace`;ctx.textAlign='left';
    ctx.fillText(mult+'x COMBO',clamp(8,2,12),H-52*sy);
    ctx.font=`${clamp(10,3,13)}px monospace`;ctx.fillStyle='#cccccc';ctx.shadowBlur=0;
    ctx.fillText('Chain: '+comboCount,clamp(8,2,12),H-34*sy);
    ctx.globalAlpha=1;ctx.shadowBlur=0;
  }
  if(feverCharge>0&&!feverMode){
    const barW=clamp(90,22,130),barH=6;
    const bx=clamp(8,2,12),by=H-20*sy;
    ctx.fillStyle='rgba(0,0,0,0.5)';ctx.beginPath();ctx.roundRect(bx-1,by-1,barW+2,barH+2,3);ctx.fill();
    const fg=ctx.createLinearGradient(bx,by,bx+barW,by);
    fg.addColorStop(0,'#ff8800');fg.addColorStop(0.5,'#ffcc00');fg.addColorStop(1,'#ffee44');
    ctx.fillStyle=fg;ctx.shadowColor='#ff8800';ctx.shadowBlur=6;
    ctx.beginPath();ctx.roundRect(bx,by,barW*(feverCharge/100),barH,2);ctx.fill();
    ctx.shadowBlur=0;
    ctx.fillStyle='#888888';ctx.font='8px monospace';ctx.textAlign='left';ctx.fillText('FEVER',bx,by-3);
  }
  if(levelIntroTimer>0){
    const prog=1-levelIntroTimer/90;
    const alpha=prog<0.2?prog*5:prog>0.7?(1-prog)*3.3:1;
    const sc=prog<0.2?0.5+prog*2.5:1;
    ctx.save();ctx.translate(W/2,H*0.4);ctx.scale(sc,sc);
    ctx.globalAlpha=clamp(alpha,0,1);
    ctx.fillStyle='#00ffff';ctx.shadowColor='#00ffff';ctx.shadowBlur=30;
    ctx.font=`bold ${clamp(34,11,54)}px monospace`;ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.strokeStyle='rgba(0,0,0,0.7)';ctx.lineWidth=5;
    ctx.strokeText(levelIntroText,0,0);ctx.fillText(levelIntroText,0,0);
    ctx.fillStyle='#ffffff';ctx.font=`bold ${clamp(17,5,25)}px monospace`;
    ctx.shadowBlur=15;
    ctx.strokeText('LEVEL '+level,0,clamp(34,9,42));ctx.fillText('LEVEL '+level,0,clamp(34,9,42));
    ctx.restore();ctx.globalAlpha=1;ctx.shadowBlur=0;
  }
}

// ═══════════════════════════════════════════════════
// MENU DEMO
// ═══════════════════════════════════════════════════
function drawMenuDemo(){
  const t=Date.now()*0.001;
  const demoY=H*0.88+Math.sin(t*1.2)*15;
  const demoX=W/2+Math.cos(t*0.9)*40;

  // Demo ball - clean, no blur
  ctx.fillStyle='#00ffff';
  ctx.beginPath();ctx.arc(demoX,demoY,6,0,Math.PI*2);ctx.fill();
  ctx.fillStyle='#ffffff';
  ctx.beginPath();ctx.arc(demoX-1,demoY-1,2,0,Math.PI*2);ctx.fill();

  // Demo paddle - clean
  const pw=70,ph=8;
  const px=demoX-pw/2,py=demoY+38;
  ctx.fillStyle='#00ffff';
  ctx.beginPath();ctx.roundRect(px,py,pw,ph,ph/2);ctx.fill();
  ctx.fillStyle='rgba(255,255,255,0.4)';
  ctx.beginPath();ctx.roundRect(px+2,py+1,pw-4,ph*0.4,ph/2);ctx.fill();

  // Demo bricks - clean solid colors
  const brickW=22,brickH=10,brickGap=2;
  const startX=demoX-3.5*(brickW+brickGap);
  const startY=demoY-55;
  const demoColors=['#ff2060','#ff7700','#ffdd00','#00ee66','#00ddff','#4499ff','#bb55ff'];
  for(let r=0;r<2;r++){
    for(let c=0;c<7;c++){
      const bx=startX+c*(brickW+brickGap);
      const by=startY+r*(brickH+brickGap);
      ctx.fillStyle=demoColors[c%demoColors.length];
      ctx.fillRect(bx,by,brickW,brickH);
      ctx.fillStyle='rgba(255,255,255,0.2)';
      ctx.fillRect(bx+1,by+1,brickW-2,brickH*0.4);
    }
  }
}

// ═══════════════════════════════════════════════════
// MAIN LOOP
// ═══════════════════════════════════════════════════
let lastTime=0;
function mainLoop(time){
  requestAnimationFrame(mainLoop);
  lastTime=time;
  
  if(state==='loading'){
    drawBackground();drawScanlines();
    return;
  }
  if(state==='menu'){
    drawBackground();drawMenuDemo();drawScanlines();
    return;
  }
  if(state==='play'){
    ctx.save();
    ctx.beginPath();ctx.rect(0,0,W,H);ctx.clip();
    if(screenShake>0.5){ctx.translate((Math.random()-0.5)*screenShake*2,(Math.random()-0.5)*screenShake*2)}
    drawBackground();
    updateBalls();updatePowerUps();updateLasers();updateParticles();
    updateMovingBricks();
    ballBrickCollision();
    if(paddle.laserActive&&frameCount%5===0)fireLaser();
    drawBricks();drawPowerUps();drawLasers();
    drawBalls();drawPaddle();
    drawParticles();drawScanlines();drawComboHUD();
    drawActivePowerUpHUD();updateHud();checkLevelComplete();
    ctx.restore();
  }
  if(state==='paused'){
    updateParticles();
    ctx.save();ctx.beginPath();ctx.rect(0,0,W,H);ctx.clip();
    drawBackground();drawBricks();drawPowerUps();drawLasers();
    drawBalls();drawPaddle();
    drawScanlines();drawComboHUD();updateHud();
    ctx.restore();
  }
  if(state==='over'||state==='complete'){
    if(gameWon)updateCelebration();
    updateParticles();
    ctx.save();ctx.beginPath();ctx.rect(0,0,W,H);ctx.clip();
    drawBackground();
    if(gameWon)drawParticles();
    drawScanlines();
    ctx.restore();
  }
}
requestAnimationFrame(mainLoop);

// ═══════════════════════════════════════════════════
// INPUT
// ═══════════════════════════════════════════════════
document.addEventListener('mousemove',e=>{if(state==='play'&&!platformPaused)paddle.x=clamp(e.clientX,paddle.w/2,W-paddle.w/2)});
function launchBalls(){
  if(balls.length===0||!balls.some(b=>b.stuck))return;
  const spd=3.5*Math.min(sy,1.2);
  const stuckBalls=balls.filter(b=>b.stuck);
  const count=stuckBalls.length;
  for(let i=0;i<count;i++){
    stuckBalls[i].stuck=false;
    const angle=-Math.PI/2+(i-(count-1)/2)*0.4;
    stuckBalls[i].vx=spd*Math.cos(angle);
    stuckBalls[i].vy=spd*Math.sin(angle);
  }
}
canvas.addEventListener('click',()=>{if(state==='play'&&!platformPaused)launchBalls()});
canvas.addEventListener('touchstart',e=>{e.preventDefault();initAudio();if(state==='play'&&!platformPaused){paddle.x=clamp(e.touches[0].clientX,paddle.w/2,W-paddle.w/2);launchBalls()}},{passive:false});
canvas.addEventListener('touchmove',e=>{e.preventDefault();if(state==='play'&&!platformPaused)paddle.x=clamp(e.touches[0].clientX,paddle.w/2,W-paddle.w/2)},{passive:false});
document.addEventListener('keydown',e=>{
  // Shortcut: number keys to jump to level for testing
  if(state==='menu'||state==='over'||state==='complete'){
    if(e.key>='1'&&e.key<='9'){maxUnlockedLevel=Math.max(maxUnlockedLevel,parseInt(e.key));startLevel(parseInt(e.key));sfxUI();return}
    if(e.key==='0'){maxUnlockedLevel=Math.max(maxUnlockedLevel,10);startLevel(10);sfxUI();return}
    if(e.key==='-'||e.key==='_'){maxUnlockedLevel=Math.max(maxUnlockedLevel,20);startLevel(20);sfxUI();return}
    if(e.key==='='||e.key==='+'){maxUnlockedLevel=Math.max(maxUnlockedLevel,50);startLevel(50);sfxUI();return}
    if(e.key==='Backspace'){
      const lvl=prompt('Enter level (1-100):');
      if(lvl&&!isNaN(lvl)){const n=parseInt(lvl);if(n>=1&&n<=100){maxUnlockedLevel=Math.max(maxUnlockedLevel,n);startLevel(n);sfxUI()}}
    }
  }
  if(state==='play'&&!platformPaused){
    if(e.key==='ArrowLeft'||e.key==='a')paddle.x=clamp(paddle.x-20,paddle.w/2,W-paddle.w/2);
    if(e.key==='ArrowRight'||e.key==='d')paddle.x=clamp(paddle.x+20,paddle.w/2,W-paddle.w/2);
    if(e.key===' '){launchBalls()}
    if(e.key==='p'||e.key==='Escape'){state='paused';showScreen('pause-screen')}
    if(e.key==='l'||e.key==='L'){bricks=[];levelComplete()}
  }
  if(state==='paused'&&!platformPaused&&(e.key==='p'||e.key==='Escape')){state='play';showScreen(null)}
});

// ═══════════════════════════════════════════════════
// BUTTONS
// ═══════════════════════════════════════════════════
if($('btn-play'))$('btn-play').onclick=()=>{initAudio();sfxUI();startGame()};
if($('btn-levels'))$('btn-levels').onclick=()=>{sfxUI();renderLevelSelect();showScreen('level-select')};
if($('btn-how'))$('btn-how').onclick=()=>{sfxUI();showScreen('how-screen')};
if($('btn-how-back'))$('btn-how-back').onclick=()=>{sfxUI();showScreen('main-menu')};
if($('btn-back-levels'))$('btn-back-levels').onclick=()=>{sfxUI();showScreen('main-menu')};
if($('btn-pause-hud'))$('btn-pause-hud').onclick=()=>{if(state==='play'&&!platformPaused){state='paused';showScreen('pause-screen');sfxUI()}};
if($('btn-mute'))$('btn-mute').onclick=()=>{
  audioSettings.muted=!audioSettings.muted;
  const btn=$('btn-mute');
  if(btn)btn.textContent=audioSettings.muted?'🔇':'🔊';
  if(audioSettings.muted){if(audioCtx&&audioCtx.state==='running')audioCtx.suspend()}
  else{if(audioCtx&&audioCtx.state==='suspended')audioCtx.resume()}
};
if($('btn-resume'))$('btn-resume').onclick=()=>{platformPaused=false;state='play';showScreen(null);sfxUI()};
if($('btn-restart'))$('btn-restart').onclick=()=>{platformPaused=false;sfxUI();startGame()};
if($('btn-pause-home'))$('btn-pause-home').onclick=()=>{platformPaused=false;state='menu';showScreen('main-menu');sfxUI()};
if($('btn-revive-ad'))$('btn-revive-ad').onclick=()=>{if(!rvUsed){ytShowRewarded('revive')}else{addPopup(W/2,H/2,'Already used!','#f80',16)}};
if($('btn-retry'))$('btn-retry').onclick=()=>{sfxUI();startGame()};
if($('btn-home'))$('btn-home').onclick=()=>{state='menu';showScreen('main-menu');sfxUI()};
if($('btn-next-level'))$('btn-next-level').onclick=()=>{sfxUI();nextLevel()};
if($('btn-gc-replay'))$('btn-gc-replay').onclick=()=>{sfxUI();level=1;maxUnlockedLevel=1;startGame()};
if($('btn-gc-home'))$('btn-gc-home').onclick=()=>{sfxUI();state='menu';showScreen('main-menu')};

// ═══════════════════════════════════════════════════
// LOADING
// ═══════════════════════════════════════════════════
function fakeLoad(){
  const f=$('progress-fill'),p=$('load-percent'),ls=$('loading-screen'),tip=$('load-tip');
  const tips=['Initializing neon systems...','Generating level data...','Calibrating particle emitters...','Loading sound frequencies...','Charging combo engine...','Connecting to PlayGama...','Ready to break!'];
  let pct=0,tipIdx=0;
  const iv=setInterval(()=>{
    pct+=rand(3,12);
    if(pct>=100){
      pct=100;clearInterval(iv);
      initYT();
      ytFirstFrame();
      ytLoad().then(()=>{
        initBgStars();
        loadProgress();
        if($('menu-best'))$('menu-best').textContent='BEST: '+best;
        if($('menu-coins'))$('menu-coins').textContent='COINS: '+coins;
        if($('menu-level'))$('menu-level').textContent='LV: '+maxUnlockedLevel;
        if(ls)ls.style.display='none';
        state='menu';showScreen('main-menu');
        ytGameReady();
      });
    }
    if(f)f.style.width=pct+'%';
    if(p)p.textContent=Math.floor(pct)+'%';
    if(tip&&pct>(tipIdx+1)*14){tipIdx=Math.min(tipIdx+1,tips.length-1);tip.textContent=tips[tipIdx]}
  },120);
}
fakeLoad();
})();
