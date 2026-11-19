import { awakeWindow, fixedFor } from './engine/capacity.js';
import { fmtTime,toDateStr,addDays,at } from './engine/time.js';

export function createTimeline(ring,nowMs) {

  const canvas = ring.querySelector('canvas');
  const time = ring.querySelector('time');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const gl = canvas.getContext('webgl', {alpha:true, antialias:false, depth:false});
  const start = Math.PI * .62;
  const orbitRadius = 208;
  function dayAngle(ms,base,end) {
    return start + 2*Math.PI*(ms-base)/(end-base);
  }
  const vertex = `
    attribute vec2 position;
    varying vec2 point;
    void main() {
      point = position * vec2(280., -280.);
      gl_Position = vec4(position, 0., 1.);
    }`;
  const fragment = `
    precision highp float;
    varying vec2 point;
    uniform float clockAngle, phase, pixel;
    const float radius = ${orbitRadius.toFixed(1)};
    float peak(float x) { return exp(-x*x); }
    void main() {
      float h = length(point)-radius;
      vec2 ray = point - radius*vec2(cos(clockAngle),sin(clockAngle));
      float vertical = exp(-abs(ray.x)/1.15-abs(ray.y)/(ray.y>0. ? 18. : 4.));
      float horizontal = exp(-abs(ray.y)/.9-abs(ray.x)/8.);
      float crossLight = vertical + horizontal + .22*exp(-length(ray)/6.);
      if ((h < -28. || h > 44.) && crossLight < .002) discard;
      float angle = atan(point.y,point.x);
      float delta = atan(sin(angle-clockAngle),cos(angle-clockAngle));
      float height = max(h,0.);
      // Two long swells interfere. Their surface slope catches the light near the clock.
      float tide = .5 + .5*cos(phase*.64);
      float swell = sin(delta*4.2-phase*.59) + .42*sin(delta*7.1+phase*.37);
      float root = peak(delta/(.50+.10*tide));
      float crest = root*(8.+4.*swell);
      float veil = root*(.35*peak((height-crest)/(2.2+1.8*tide))
                       +.20*peak((height-.55*crest)/7.));
      float reflection = .48*peak(delta/.11)*peak((h+2.+2.*swell)/7.);
      float rim = (.24+.47*root)*exp(-abs(h)/max(.62,pixel*.68));
      float band = .04*exp(-height/6.)*(1.-smoothstep(13.,16.,height));
      float outer = smoothstep(-pixel,pixel,h)*(band+veil)*(1.-smoothstep(20.,38.,height));
      float alpha = clamp(rim+outer+reflection+crossLight,0.,1.);
      vec3 silver = vec3(mix(.79,1.,clamp(rim+crossLight+veil,0.,1.)));
      gl_FragColor = vec4(silver*alpha,alpha);
    }`;
  function shader(type, source) {
    const result = gl.createShader(type);
    gl.shaderSource(result,source);
    gl.compileShader(result);
    if (!gl.getShaderParameter(result,gl.COMPILE_STATUS)) throw Error(gl.getShaderInfoLog(result));
    return result;
  }
  function setup() {
    const program = gl.createProgram();
    gl.attachShader(program,shader(gl.VERTEX_SHADER,vertex));
    gl.attachShader(program,shader(gl.FRAGMENT_SHADER,fragment));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program,gl.LINK_STATUS)) throw Error(gl.getProgramInfoLog(program));
    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER,gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),gl.STATIC_DRAW);
    const pos = gl.getAttribLocation(program,'position');
    gl.enableVertexAttribArray(pos);
    gl.vertexAttribPointer(pos,2,gl.FLOAT,false,0,0);
    return Object.fromEntries(['clockAngle','phase','pixel'].map(name=>[name,gl.getUniformLocation(program,name)]));
  }
  let uniforms = gl && setup();
  canvas.addEventListener('webglcontextlost',e=>e.preventDefault());
  canvas.addEventListener('webglcontextrestored',()=>{ uniforms=setup(); refresh(); });
  function draw() {
    const now = new Date(nowMs());
    const midnight = new Date(now);
    const base = midnight.setHours(0,0,0,0);
    const end = midnight.setDate(midnight.getDate()+1);
    const label = String(now.getHours()).padStart(2,'0') + ':' + String(now.getMinutes()).padStart(2,'0');
    if (time.textContent !== label) time.dateTime = time.textContent = label;
    if (!gl || gl.isContextLost()) return;
    gl.viewport(0,0,canvas.width,canvas.height);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform1f(uniforms.clockAngle,dayAngle(+now,base,end));
    gl.uniform1f(uniforms.phase,reduced.matches ? 0 : performance.now()*.00049);
    gl.uniform1f(uniforms.pixel,560/canvas.width);
    gl.drawArrays(gl.TRIANGLES,0,3);
  }
  let timer;
  function refresh() {
    clearTimeout(timer);
    if (document.hidden || ring.hidden || !canvas.clientWidth) return;
    draw();
    timer = setTimeout(refresh, reduced.matches ? 60000-Date.now()%60000 : 1000/30);
  }
  new ResizeObserver(() => {
    const side = Math.round(canvas.clientWidth * Math.min(devicePixelRatio,2));
    canvas.width = canvas.height = side;
    refresh();
  }).observe(canvas);
  document.addEventListener('visibilitychange',refresh);
  reduced.addEventListener('change',refresh);
  const agenda = document.querySelector('#agenda');
  const caption = document.querySelector('#eventLabel');
  let selected = '';
  function show(item, mode) {
    caption.firstElementChild.textContent = item ? mode : '';
    caption.querySelector('strong').textContent = item?.name || '남은 일정 없음';
    caption.lastElementChild.textContent = !item ? '' : mode === '현재 일정'
      ? fmtTime(item.end)+(item.kind==='sleep' ? ' 기상' : '까지') : fmtTime(item.start)+'–'+fmtTime(item.end);
  }
  return function renderAgenda(now,settings,fixedEvents,blocks) {
    const midnight = new Date(now);
    midnight.setHours(0,0,0,0);
    const base = +midnight;
    const end = midnight.setDate(midnight.getDate()+1);
    const angle = ms => dayAngle(ms,base,end);
    const today = toDateStr(now);
    const dates = [addDays(today,-1),today];
    const sleep = dates.map(date => ({
      name:'수면', kind:'sleep',
      start:awakeWindow(settings,date).end,
      end:awakeWindow(settings,addDays(date,1)).start
    }));
    const fixed = dates.flatMap(date => fixedFor(fixedEvents,date));
    const studyStart = at(today,16*60+30);
    const studyEnd = at(today,23*60);
    const eveningStudy = {name:'야자',kind:'study',start:studyStart,end:studyEnd};
    const items = [
      ...fixed.map(b=>({...b,name:b.label,kind:'fixed'})),
      ...blocks.map(b=>({...b,name:b.title,kind:'study'})),
      ...sleep,
      ...(!fixed.some(b=>b.label==='야자' && b.start===studyStart && b.end===studyEnd) &&
          !blocks.some(b=>b.title==='야자' && b.start===studyStart && b.end===studyEnd)
        ? [eveningStudy] : [])
    ].filter(b=>b.end>base && b.start<end && b.end>b.start &&
      (b.kind==='sleep' || b.end-b.start>3*60*60*1000)).sort((a,b)=>a.start-b.start);
    const lanes = [];
    const paths = [];
    const ns = agenda.namespaceURI;
    const defs = document.createElementNS(ns,'defs');
    // Keep the reflection concentric with each lane, including short events.
    function laneFinish(lane, inner, outer) {
      const id = 'silver-lane-' + lane;
      if (!defs.querySelector('#'+id)) {
        const gradient = document.createElementNS(ns,'radialGradient');
        gradient.id = id;
        for (const [key,value] of Object.entries({cx:0,cy:0,r:outer,gradientUnits:'userSpaceOnUse'}))
          gradient.setAttribute(key,value);
        for (const [fraction,color] of [[0,'#353535'],[.45,'#555'],[.8,'#777'],[1,'#999']]) {
          const stop = document.createElementNS(ns,'stop');
          stop.setAttribute('offset',(inner+(outer-inner)*fraction)/outer);
          stop.setAttribute('stop-color',color);
          gradient.append(stop);
        }
        defs.append(gradient);
      }
      return 'url(#'+id+')';
    }
    for (const item of items) {
      let lane = lanes.findIndex(endTime=>endTime<=item.start);
      if (lane<0) lane=lanes.length;
      lanes[lane]=item.end;
      item.lane=lane;
    }
    for (const item of items) {
      const step = Math.min(32,100/lanes.length);
      const outer = orbitRadius-step*item.lane, inner = outer-step*.82;
      const from = angle(Math.max(base,item.start)), to = angle(Math.min(end,item.end));
      const mid=(from+to)/2;
      const point=(r,t)=>[r*Math.cos(t),r*Math.sin(t)].join(' ');
      const path=document.createElementNS('http://www.w3.org/2000/svg','path');
      // Two half-arcs also represent an event spanning the entire day.
      const edge=(r,angle,clockwise)=>`A${r} ${r} 0 0 ${clockwise} ${point(r,angle)}`;
      const sector = `M${point(outer,from)} ${edge(outer,mid,1)} ${edge(outer,to,1)}`;
      // Keep the event endpoints fixed; shape its inner edge like a rising tide.
      const visual = document.createElementNS(ns,'path');
      const steps = Math.max(12,Math.ceil((to-from)*60));
      function shore(displacement) {
        const points = [];
        for (let i=steps;i>=0;i--) {
          const u = i/steps;
          const instant = Math.max(base,item.start) + u*(Math.min(end,item.end)-Math.max(base,item.start));
          const progress = (instant-item.start)/(item.end-item.start);
          const envelope = Math.sin(Math.PI*progress)**2;
          const shoal = .75 + .22*Math.sin(2*Math.PI*progress+.4);
          const depth = item.kind === 'sleep' ? (outer-inner)*(.44*envelope) + displacement*.3*envelope :
            (outer-inner)*(envelope*shoal) + displacement*envelope;
          points.push('L'+point(outer-depth,from+(to-from)*u));
        }
        return sector+points.join(' ')+' Z';
      }
      const still = shore(0);
      visual.setAttribute('d',still);
      if (!reduced.matches) {
        const motion = document.createElementNS(ns,'animate');
        motion.setAttribute('attributeName','d');
        motion.setAttribute('values',[still,shore(1.4),still].join(';'));
        motion.setAttribute('dur',item.kind==='sleep' ? '48s' : '32s');
        motion.setAttribute('repeatCount','indefinite');
        motion.setAttribute('calcMode','spline');
        motion.setAttribute('keySplines','.42 0 .58 1;.42 0 .58 1');
        visual.append(motion);
      }
      visual.setAttribute('fill',item.kind==='sleep' ? '#24446a' : laneFinish(item.lane,inner,outer));
      visual.setAttribute('aria-hidden','true');
      visual.style.pointerEvents='none';
      if (item.kind==='sleep') { visual.style.stroke='none'; visual.style.fillOpacity='.95'; }
      visual.classList.toggle('current',item.start<=now && now<item.end);
      visual.dataset.kind=item.kind;
      paths.push(visual);
      path.setAttribute('d',sector+` L${point(inner,to)} ${edge(inner,mid,0)} ${edge(inner,from,0)} Z`);
      path.setAttribute('fill','transparent');
      path.classList.add('hit');
      path.dataset.kind=item.kind;
      path.classList.toggle('current',item.start<=now && now<item.end);
      path.setAttribute('tabindex','0');
      path.setAttribute('role','button');
      path.setAttribute('aria-label',item.name+' '+fmtTime(item.start)+'–'+fmtTime(item.end));
      item.key=[item.name,item.start,item.end].join('/');
      const select=()=>{selected=item.key;show(item,"선택한 일정")};
      path.onclick=select;
      path.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();select()}};
      paths.push(path);
    }
    const focused=agenda.contains(document.activeElement) && document.activeElement.getAttribute('aria-label');
    const track = document.createElementNS(ns,'circle');
    track.setAttribute('r',orbitRadius);
    track.setAttribute('stroke-width','1');
    track.setAttribute('stroke','rgba(200,200,200,.15)');
    track.setAttribute('fill','none');
    track.setAttribute('pointer-events','none');
    agenda.replaceChildren(defs,track,...paths);
    if(focused) paths.find(p=>p.getAttribute('aria-label')===focused)?.focus();
    const choice = items.find(item=>item.key===selected);
    const current = items.find(item=>item.start<=now && now<item.end);
    show(choice || current || items.find(item=>item.start>now),
      choice ? '선택한 일정' : current ? '현재 일정' : '다음 일정');
  }

}
