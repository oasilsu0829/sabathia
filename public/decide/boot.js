// Sabathia WS 부팅 화면 (2026-11-20, 사용자 시안 'Sabathia WS — Boot'를 그대로 옮김)
// WS 화면을 열 때마다 컨택트 맵이 대각선을 따라 피어나고 → 빛이 쓸고 → 작아지며 'Sabathia WS' 글자가 나온 뒤 WS로 넘어간다.
// 소리 없음, 탭 없이 바로 자동 재생(2026-11-20 사용자 요청).
// 같은 파일이 sabathia public/decide/boot.js 와 sabathiaWS ws/boot.js 에 있다(둘 다 고칠 것).
// <body> 맨 앞에서 일반 <script>로 불러야 WS가 먼저 비치지 않는다. 주소 끝 #noboot 이면 건너뜀.
(function(){
if (/noboot/.test(location.hash)) return;

const css = `
#sab-boot{--navy:#0F1E3D;--empty:#18284C;--pale:#BED6EA;
  --brand:"Inter Tight","Helvetica Neue",Arial,sans-serif;--mono:"JetBrains Mono",ui-monospace,monospace;
  position:fixed;inset:0;background:var(--navy);z-index:2147483000;overflow:hidden;
  font-family:"Noto Sans KR",system-ui,sans-serif;-webkit-font-smoothing:antialiased;letter-spacing:0}
#sab-boot *{box-sizing:border-box;margin:0;padding:0}
#sab-boot::after{content:"";position:absolute;inset:0;pointer-events:none;
  background:radial-gradient(ellipse at 50% 45%,rgba(44,112,170,.16),transparent 60%)}
#sab-boot .map{position:absolute;left:50%;top:50%;display:grid;will-change:transform;overflow:hidden;border-radius:4px}
#sab-boot .c{border-radius:18%;background:var(--empty);opacity:0;transform:scale(.2)}
#sab-boot .glow{position:absolute;inset:-12%;pointer-events:none;opacity:0;
  background:linear-gradient(135deg,transparent 42%,rgba(255,255,255,.55) 50%,transparent 58%);
  mix-blend-mode:screen;filter:blur(6px)}
#sab-boot .word{position:absolute;top:0;display:flex;align-items:baseline;gap:.26em;
  font-family:var(--brand);font-size:var(--fs);line-height:1;color:#fff;white-space:nowrap;
  clip-path:inset(0 100% 0 0)}
#sab-boot .word .s{font-weight:700;letter-spacing:-.035em}
#sab-boot .word .w{font-weight:400;color:var(--pale);letter-spacing:-.01em}
#sab-boot .word .bl{display:inline-block;width:0;height:0}
@media (prefers-reduced-motion:reduce){#sab-boot .c{transition:none}}
html.sab-booting,html.sab-booting body{overflow:hidden}`;
const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
const fl = document.createElement('link'); fl.rel = 'stylesheet';
fl.href = 'https://fonts.googleapis.com/css2?family=Inter+Tight:wght@400;700&family=JetBrains+Mono:wght@400;600&display=swap';
document.head.appendChild(fl);

const boot = document.createElement('div'); boot.id = 'sab-boot'; boot.setAttribute('aria-hidden', 'true');
boot.innerHTML = '<div class="map"><div class="glow"></div></div>'
  + '<div class="word"><span class="s">Sabathia</span><span class="w">WS</span><span class="bl"></span></div>';
(document.body || document.documentElement).appendChild(boot);
document.documentElement.classList.add('sab-booting');

const MAP={"n": 28, "d": [[0.0, 3.8, 10.3, 16.4, 22.1, 21.7, 16.7, 10.3, 5.5, 4.4, 6.1, 8.5, 8.7, 11.9, 12.2, 15.7, 15.5, 20.3, 21.0, 21.7, 21.4, 16.6, 13.0, 11.3, 7.6, 9.4, 14.6, 20.8], [3.8, 0.0, 3.7, 9.7, 15.5, 15.5, 10.4, 5.7, 4.0, 6.2, 9.1, 7.9, 6.9, 9.2, 9.0, 12.2, 12.1, 16.2, 16.4, 16.1, 15.7, 11.7, 9.7, 9.4, 5.4, 4.9, 8.3, 14.2], [10.3, 3.7, 0.0, 3.8, 9.5, 10.3, 6.0, 4.7, 5.8, 11.3, 14.2, 11.6, 9.3, 9.2, 7.1, 9.7, 9.5, 13.1, 13.3, 11.8, 11.6, 9.8, 9.1, 12.1, 8.9, 4.8, 4.5, 8.5], [16.4, 9.7, 3.8, 0.0, 3.8, 6.8, 5.0, 6.2, 11.0, 17.1, 19.9, 16.8, 14.4, 13.1, 9.9, 10.7, 8.0, 11.5, 10.5, 8.4, 8.5, 9.5, 12.2, 16.8, 14.4, 8.5, 5.2, 4.7], [22.1, 15.5, 9.5, 3.8, 0.0, 3.8, 5.7, 11.4, 16.5, 22.3, 24.7, 21.4, 18.9, 16.8, 13.6, 12.9, 9.3, 11.3, 8.9, 6.1, 7.2, 11.2, 16.2, 21.6, 19.8, 13.3, 7.2, 4.8], [21.7, 15.5, 10.3, 6.8, 3.8, 0.0, 3.8, 9.9, 15.3, 21.5, 25.5, 22.8, 19.4, 18.2, 13.9, 14.1, 9.4, 11.6, 8.0, 7.6, 11.6, 15.0, 18.9, 23.6, 21.0, 15.3, 10.7, 9.3], [16.7, 10.4, 6.0, 5.0, 5.7, 3.8, 0.0, 3.7, 10.5, 17.4, 22.2, 19.8, 16.9, 16.7, 12.8, 14.6, 10.7, 13.7, 10.7, 9.8, 12.2, 14.1, 16.1, 19.4, 16.2, 12.0, 9.7, 9.4], [10.3, 5.7, 4.7, 6.2, 11.4, 9.9, 3.7, 0.0, 3.8, 10.7, 16.6, 14.9, 11.7, 12.8, 9.2, 12.4, 10.0, 14.3, 12.9, 13.4, 15.3, 14.2, 14.1, 16.2, 12.2, 9.9, 9.2, 12.4], [5.5, 4.0, 5.8, 11.0, 16.5, 15.3, 10.5, 3.8, 0.0, 3.8, 10.2, 10.3, 6.8, 9.8, 8.0, 11.8, 10.4, 15.5, 15.2, 16.4, 18.1, 15.1, 13.2, 14.1, 9.9, 8.9, 11.3, 16.4], [4.4, 6.2, 11.3, 17.1, 22.3, 21.5, 17.4, 10.7, 3.8, 0.0, 3.9, 7.1, 5.4, 9.2, 8.7, 13.4, 13.4, 18.3, 19.2, 20.8, 21.3, 17.2, 14.3, 13.4, 11.0, 12.1, 16.0, 21.5], [6.1, 9.1, 14.2, 19.9, 24.7, 25.5, 22.2, 16.6, 10.2, 3.9, 0.0, 3.8, 5.6, 8.8, 11.1, 14.5, 16.7, 20.1, 23.0, 22.6, 20.5, 15.5, 12.2, 10.5, 9.9, 12.2, 16.3, 22.0], [8.5, 7.9, 11.6, 16.8, 21.4, 22.8, 19.8, 14.9, 10.3, 7.1, 3.8, 0.0, 3.7, 5.1, 8.9, 10.7, 14.3, 16.4, 20.2, 18.4, 16.4, 11.7, 8.6, 8.2, 7.9, 9.3, 12.9, 18.5], [8.7, 6.9, 9.3, 14.4, 18.9, 19.4, 16.9, 11.7, 6.8, 5.4, 5.6, 3.7, 0.0, 3.8, 5.1, 8.4, 10.3, 13.9, 16.5, 16.5, 16.0, 12.6, 10.3, 11.7, 9.8, 8.9, 12.0, 17.0], [11.9, 9.2, 9.2, 13.1, 16.8, 18.2, 16.7, 12.8, 9.8, 9.2, 8.8, 5.1, 3.8, 0.0, 3.8, 5.2, 8.5, 10.4, 14.3, 13.8, 12.7, 9.6, 8.5, 11.7, 10.7, 7.7, 10.1, 14.4], [12.2, 9.0, 7.1, 9.9, 13.6, 13.9, 12.8, 9.2, 8.0, 8.7, 11.1, 8.9, 5.1, 3.8, 0.0, 3.8, 4.7, 8.3, 10.5, 10.7, 12.2, 10.4, 11.2, 15.0, 12.7, 8.3, 9.3, 12.9], [15.7, 12.2, 9.7, 10.7, 12.9, 14.1, 14.6, 12.4, 11.8, 13.4, 14.5, 10.7, 8.4, 5.2, 3.8, 0.0, 3.8, 4.9, 8.6, 8.9, 9.9, 9.2, 11.9, 16.6, 15.1, 9.8, 8.7, 11.9], [15.5, 12.1, 9.5, 8.0, 9.3, 9.4, 10.7, 10.0, 10.4, 13.4, 16.7, 14.3, 10.3, 8.5, 4.7, 3.8, 0.0, 3.7, 5.2, 5.0, 9.0, 10.7, 14.5, 19.4, 16.9, 11.3, 8.1, 10.3], [20.3, 16.2, 13.1, 11.5, 11.3, 11.6, 13.7, 14.3, 15.5, 18.3, 20.1, 16.4, 13.9, 10.4, 8.3, 4.9, 3.7, 0.0, 3.8, 5.5, 9.7, 12.5, 16.9, 22.1, 20.3, 14.4, 10.7, 12.1], [21.0, 16.4, 13.3, 10.5, 8.9, 8.0, 10.7, 12.9, 15.2, 19.2, 23.0, 20.2, 16.5, 14.3, 10.5, 8.6, 5.2, 3.8, 0.0, 3.8, 9.9, 14.7, 19.4, 24.3, 21.7, 16.0, 11.8, 10.6], [21.7, 16.1, 11.8, 8.4, 6.1, 7.6, 9.8, 13.4, 16.4, 20.8, 22.6, 18.4, 16.5, 13.8, 10.7, 8.9, 5.0, 5.5, 3.8, 0.0, 3.8, 9.3, 15.6, 21.6, 20.4, 13.8, 7.8, 6.2], [21.4, 15.7, 11.6, 8.5, 7.2, 11.6, 12.2, 15.3, 18.1, 21.3, 20.5, 16.4, 16.0, 12.7, 12.2, 9.9, 9.0, 9.7, 9.9, 3.8, 0.0, 3.8, 10.5, 16.7, 16.9, 10.3, 5.3, 4.1], [16.6, 11.7, 9.8, 9.5, 11.2, 15.0, 14.1, 14.2, 15.1, 17.2, 15.5, 11.7, 12.6, 9.6, 10.4, 9.2, 10.7, 12.5, 14.7, 9.3, 3.8, 0.0, 3.8, 9.8, 10.6, 5.6, 4.4, 6.5], [13.0, 9.7, 9.1, 12.2, 16.2, 18.9, 16.1, 14.1, 13.2, 14.3, 12.2, 8.6, 10.3, 8.5, 11.2, 11.9, 14.5, 16.9, 19.4, 15.6, 10.5, 3.8, 0.0, 3.7, 5.6, 4.3, 6.6, 11.9], [11.3, 9.4, 12.1, 16.8, 21.6, 23.6, 19.4, 16.2, 14.1, 13.4, 10.5, 8.2, 11.7, 11.7, 15.0, 16.6, 19.4, 22.1, 24.3, 21.6, 16.7, 9.8, 3.7, 0.0, 3.8, 6.5, 11.6, 17.7], [7.6, 5.4, 8.9, 14.4, 19.8, 21.0, 16.2, 12.2, 9.9, 11.0, 9.9, 7.9, 9.8, 10.7, 12.7, 15.1, 16.9, 20.3, 21.7, 20.4, 16.9, 10.6, 5.6, 3.8, 0.0, 3.8, 10.3, 16.8], [9.4, 4.9, 4.8, 8.5, 13.3, 15.3, 12.0, 9.9, 8.9, 12.1, 12.2, 9.3, 8.9, 7.7, 8.3, 9.8, 11.3, 14.4, 16.0, 13.8, 10.3, 5.6, 4.3, 6.5, 3.8, 0.0, 3.8, 10.1], [14.6, 8.3, 4.5, 5.2, 7.2, 10.7, 9.7, 9.2, 11.3, 16.0, 16.3, 12.9, 12.0, 10.1, 9.3, 8.7, 8.1, 10.7, 11.8, 7.8, 5.3, 4.4, 6.6, 11.6, 10.3, 3.8, 0.0, 3.8], [20.8, 14.2, 8.5, 4.7, 4.8, 9.3, 9.4, 12.4, 16.4, 21.5, 22.0, 18.5, 17.0, 14.4, 12.9, 11.9, 10.3, 12.1, 10.6, 6.2, 4.1, 6.5, 11.9, 17.7, 16.8, 10.1, 3.8, 0.0]]};
const CUT=8.0;              // CMM과 같은 8Å 기준
const n=MAP.n, D=MAP.d;

/* 거리 → 색: 대각선 흰색, 가까울수록 흰색 → 연파랑 → 바하마 블루 */
const lerp=(a,b,t)=>a.map((v,i)=>Math.round(v+(b[i]-v)*t));
const W=[255,255,255],P=[190,214,234],B=[44,112,170],Dp=[32,78,140];
function col(d,i,j){
  if(i===j) return W;
  if(d>CUT) return null;
  const x=Math.min(1,Math.max(0,(d-3.8)/(CUT-3.8)));
  return x<.35?lerp(W,P,x/.35):x<.7?lerp(P,B,(x-.35)/.35):lerp(B,Dp,(x-.7)/.3);
}
const rgb=c=>`rgb(${c[0]},${c[1]},${c[2]})`;

/* ---------- 지도 만들기 ---------- */
const map=boot.querySelector('.map'), glow=boot.querySelector('.glow'),
      word=boot.querySelector('.word'), bl=boot.querySelector('.bl');
const cells=[];
for(let i=0;i<n;i++)for(let j=0;j<n;j++){
  const el=document.createElement('div'); el.className='c';
  const c=col(D[i][j],i,j);
  el._on=!!c; el._i=i; el._j=j; el._c=c;
  if(c) el.style.background=rgb(c);
  map.insertBefore(el,glow); cells.push(el);
}

let B0,K,GAP,CAP=.73;      // 시작 크기, 최종 축척, 지도-글자 간격, 대문자 높이 비율
function capRatio(){         // 폰트의 대문자 높이/글자 크기 실측
  const c=document.createElement('canvas').getContext('2d');
  c.font='700 100px "Inter Tight"'; const m=c.measureText('S');
  return (m.actualBoundingBoxAscent||73)/100;
}
function layout(){
  const vw=innerWidth,vh=innerHeight;
  B0=Math.min(vw*.62,vh*.62,380);
  const g=B0/n*.16, cs=(B0-g*(n-1))/n;
  map.style.width=map.style.height=B0+'px';
  map.style.gridTemplateColumns=`repeat(${n},${cs}px)`;
  map.style.gap=g+'px';
  map.style.marginLeft=map.style.marginTop=(-B0/2)+'px';
  // 대문자 높이 = 아이콘 높이가 되도록 글자 크기와 최종 축척을 함께 정함
  word.style.setProperty('--fs','100px');
  const w100=word.getBoundingClientRect().width;      // 100px일 때 글자 폭
  let m=(vw*.84)/(1.32+w100/(CAP*100));
  m=Math.min(m,B0*.32,72);
  K=m/B0;
  word.style.setProperty('--fs',(m/CAP)+'px');
}
function finalPos(){             // 최종: [작아진 지도][간격][글자] 묶음을 가운데 정렬
  const vw=innerWidth, m=B0*K; GAP=m*.32;
  const tw=word.getBoundingClientRect().width;
  const total=m+GAP+tw, left=(vw-total)/2;
  const base=bl.offsetTop;       // 글자 기준선 = 아이콘 아래 변
  return {dx:left+m/2-vw/2, textLeft:left+m+GAP, textTop:innerHeight/2+m/2-base};
}

/* ---------- 시퀀스 ---------- */
const E1='cubic-bezier(.2,.8,.2,1)', E2='cubic-bezier(.75,0,.2,1)';
let anims=[], timers=[];
function reset(){
  anims.forEach(a=>a.cancel()); anims=[]; timers.forEach(clearTimeout); timers=[];
  boot.style.display='block'; boot.style.opacity=1;
  cells.forEach(c=>{c.style.opacity=0;c.style.transform='scale(.2)'});
  map.style.transform='rotate(-6deg)'; word.style.clipPath='inset(0 100% 0 0)';
}
function A(el,k,o){const a=el.animate(k,Object.assign({fill:'forwards'},o));anims.push(a);return a}

function play(){
  reset(); layout();
  // 1) 대각선을 따라 아르페지오 박자에 맞춰 칸이 피어남 (0 ~ 1.1s)
  cells.forEach(c=>{
    const t=((c._i+c._j)/2)/n, off=Math.abs(c._i-c._j);
    if(c._on){
      const delay=60+t*720+off*14+Math.random()*30;
      A(c,[{opacity:0,transform:'scale(.2)',filter:'brightness(2.2)'},
           {opacity:1,transform:'scale(1.12)',filter:'brightness(1.6)',offset:.55},
           {opacity:1,transform:'scale(1)',filter:'brightness(1)'}],
        {duration:520,delay,easing:E1});
    }else{
      A(c,[{opacity:0,transform:'scale(.5)'},{opacity:1,transform:'scale(1)'}],
        {duration:600,delay:500+t*500,easing:'ease-out'});
    }
  });
  // 지도 전체가 살짝 돌며 자리 잡음
  A(map,[{transform:'rotate(-6deg) scale(.94)'},{transform:'rotate(0) scale(1)'}],{duration:1500,easing:E1});
  // 2) 빛 한 줄기가 대각선을 쓸고 지나감 (1.05s)
  A(glow,[{opacity:0,transform:'translate(-60%,-60%)'},{opacity:1,offset:.3},{opacity:1,offset:.7},{opacity:0,transform:'translate(60%,60%)'}],
    {duration:900,delay:1050,easing:'ease-in-out'});
  // 3) 작아지며 왼쪽으로 (1.75s)
  timers.push(setTimeout(()=>{
    const f=finalPos();
    word.style.left=f.textLeft+'px'; word.style.top=f.textTop+'px';
    A(map,[{transform:'translateX(0) scale(1)'},{transform:`translateX(${f.dx}px) scale(${K})`}],
      {duration:950,easing:E2});
    // 4) 지도 옆에서 글자가 빠져나오듯 드러남
    A(word,[{clipPath:'inset(0 100% 0 0)',transform:'translateX(-18px)',opacity:.4},
            {clipPath:'inset(0 0% 0 0)',transform:'none',opacity:1}],
      {duration:900,delay:520,easing:E1});
  },1750));
  // 5) WS 화면으로 (4.3s) — 시안의 자리표시 홈 대신 실제 WS(#stage)가 올라온다
  timers.push(setTimeout(()=>{
    A(boot,[{opacity:1,transform:'scale(1)'},{opacity:0,transform:'scale(1.04)'}],{duration:650,easing:'ease-in'});
    const stage=document.getElementById('stage');
    if(stage) stage.animate([{opacity:0,translate:'0 14px'},{opacity:1,translate:'0 0'}],{duration:650,delay:250,easing:E1});
    timers.push(setTimeout(()=>{
      boot.remove(); document.documentElement.classList.remove('sab-booting');
      removeEventListener('resize',onResize);
    },950));
  },4300));
}

function onResize(){ if(boot.isConnected) layout(); }

/* 글꼴 준비(오프라인이면 2초 뒤 그냥 진행) → 바로 재생 */
const fontsReady=Promise.race([
  new Promise(r=>{fl.onload=fl.onerror=r}).then(()=>Promise.all([
    document.fonts.load('700 100px "Inter Tight"'),document.fonts.load('400 100px "Inter Tight"')])).catch(()=>{}),
  new Promise(r=>setTimeout(r,2000)),
]);
fontsReady.then(()=>{
  CAP=capRatio();
  layout();
  play();
});
addEventListener('resize',onResize);
})();
