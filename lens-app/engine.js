/* Beneath the Lens: 3D engine (moved from the standalone index.html; its 14 inline scripts, in their
   original order, now form one ES module). three.js comes from npm, pinned to the version it was built on. */
import * as THREE from 'three';

/* ---------- app embedding ----------
   The app frames this page at /lens/ (login required) and /lens/projector (admins). The frame URL carries
   ?lang=pl|en (the app's language) and ?role=presenter (admins: presentation controls, rendered by the app).
   The two talk with window.postMessage: see the "app bridge" section at the end of this file. */
const EMBED=(()=>{let q;try{q=new URLSearchParams(location.search);}catch(e){q=new URLSearchParams('');}const l=q.get('lang');
  return{on:window.parent!==window,presenter:q.get('role')==='presenter',lang:l==='pl'||l==='en'?l:null};})();
/* false until boot() has run: an uncaught error before that (e.g. no WebGL) means the page cannot work, and the app is told */
let BOOT_OK=false,BOOT_FAILED=false;

/* =====================================================================
   Beneath the Lens — core: math, noise, optics tables, lesion library
   ===================================================================== */
/* colour theme: 'light' = projector theme (Akademia Dermatoskopii brand cards, dark stage), 'dark' = screen theme */
let THEME=(()=>{try{const v=localStorage.getItem('btl-theme');if(v==='dark'||v==='light')return v;}catch(e){}return 'light';})();
if(THEME==='dark')document.documentElement.dataset.theme='dark';
const cssv=n=>getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const TC={};function readTC(){TC.ground=cssv('--ground')||'#0D1830';TC.ground2=cssv('--ground2')||'#16264A';TC.strip=cssv('--strip')||'#070E1C';}readTC();
let LANG=EMBED.lang||(()=>{try{const s=localStorage.getItem('btl-lang');if(s==='pl'||s==='en')return s;}catch(e){}return String(navigator.language||'').toLowerCase().startsWith('pl')?'pl':'en';})();
function showErr(m){let el=document.getElementById('err');if(!el){el=document.createElement('div');el.id='err';document.body.appendChild(el);}el.textContent=(typeof t==='function'?t('err'):'Error: ')+m;}
window.addEventListener('error',e=>{showErr(e.message||String(e));if(!BOOT_OK){BOOT_FAILED=true;appPost('error');}});

const TEX=1024, PXMM=TEX/8, TAU=Math.PI*2;
const clamp=(v,a=0,b=1)=>v<a?a:v>b?b:v;
const lerp=(a,b,t)=>a+(b-a)*t;
const smoothstep=(e0,e1,x)=>{const t=clamp((x-e0)/(e1-e0));return t*t*(3-2*t);};
const mix3=(a,b,t)=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t];
const rgbStr=(c,a=1)=>`rgba(${c[0]|0},${c[1]|0},${c[2]|0},${a})`;
function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
function hash2(i,j,s){let h=(Math.imul(i,374761393)+Math.imul(j,668265263)+Math.imul(s,1442695041))|0;h=Math.imul(h^(h>>>13),1274126177);h^=h>>>16;return (h>>>0)/4294967296;}
function vnoise(x,y,s){const xi=Math.floor(x),yi=Math.floor(y),xf=x-xi,yf=y-yi;const u=xf*xf*(3-2*xf),v=yf*yf*(3-2*yf);
  const a=hash2(xi,yi,s),b=hash2(xi+1,yi,s),c=hash2(xi,yi+1,s),d=hash2(xi+1,yi+1,s);return a+(b-a)*u+(c-a)*v+(a-b-c+d)*u*v;}
function fbm(x,y,s,o=3){let f=0,a=0.5,fr=1,n=0;for(let i=0;i<o;i++){f+=a*vnoise(x*fr,y*fr,s+i*17);n+=a;fr*=2.03;a*=0.5;}return f/n;}
let W1=0,W2=0;
function worley(x,y,s){const xi=Math.floor(x),yi=Math.floor(y);let f1=9,f2=9;
  for(let j=-1;j<=1;j++)for(let i=-1;i<=1;i++){const cx=xi+i,cy=yi+j;const px=cx+0.12+0.76*hash2(cx,cy,s),py=cy+0.12+0.76*hash2(cx,cy,s+7);
    const dx=px-x,dy=py-y,d=Math.sqrt(dx*dx+dy*dy);if(d<f1){f2=f1;f1=d;}else if(d<f2)f2=d;}
  W1=f1;W2=f2;}
/* Rete ridges: the edges of a jittered cell pattern. The same function drives the
   3D dermo-epidermal junction and the pigment network painted on the lens image. */
const RETE_CELL=0.27;
function reteEdge(x,z,irr){
  const wa=0.28*(0.35+irr);
  const wx=x+(fbm(x*1.3,z*1.3,11,2)-0.5)*wa+(vnoise(x*4.3,z*4.3,15)-0.5)*0.1*(0.4+irr), wz=z+(fbm(x*1.3+5.1,z*1.3,12,2)-0.5)*wa+(vnoise(x*4.3+3,z*4.3,16)-0.5)*0.1*(0.4+irr);
  const sc=1/(RETE_CELL*(1+irr*0.55*(vnoise(x*0.75,z*0.75,31)-0.5)*2));
  worley(wx*sc,wz*sc,5);return W2-W1;}
function netLine(x,z,irr,w){return 1-smoothstep(-w*0.25,w,reteEdge(x,z,irr));}
function ridge3(x,z,irr){return 1-smoothstep(0,0.66,reteEdge(x,z,irr));}

/* ---------- depth: real millimetres <-> exaggerated scene units ---------- */
const DSEG=[[0,0],[0.02,0.12],[0.1,0.62],[0.4,1.40],[2.4,3.10],[4.0,3.80]];
function D2S(d){if(d<=0)return d*6;for(let i=1;i<DSEG.length;i++){if(d<=DSEG[i][0]){const a=DSEG[i-1],b=DSEG[i];return a[1]+(d-a[0])/(b[0]-a[0])*(b[1]-a[1]);}}
  const a=DSEG[4],b=DSEG[5];return b[1]+(d-b[0])*(b[1]-a[1])/(b[0]-a[0]);}
function S2D(s){if(s<=0)return s/6;for(let i=1;i<DSEG.length;i++){if(s<=DSEG[i][1]){const a=DSEG[i-1],b=DSEG[i];return a[0]+(s-a[1])/(b[1]-a[1])*(b[0]-a[0]);}}
  const a=DSEG[4],b=DSEG[5];return b[0]+(s-b[1])*(b[0]-a[0])/(b[1]-a[1]);}
function fmtDepth(d){if(d<0.1)return Math.round(d*1000)+' µm';const s=(d<1?d.toFixed(2):d.toFixed(1))+' mm';return LANG==='pl'?s.replace('.',','):s;}

/* ---------- colour of melanin as a function of depth (Tyndall shift) ---------- */
const PIG=[[0,[30,20,16]],[0.035,[56,35,23]],[0.075,[94,59,36]],[0.12,[126,88,62]],[0.18,[116,104,106]],[0.28,[108,114,130]],[0.5,[86,104,140]],[0.9,[64,92,140]],[2,[56,80,124]]];
function pigColor(d){if(d<=0)return PIG[0][1].slice();for(let i=1;i<PIG.length;i++){if(d<=PIG[i][0]){const a=PIG[i-1],b=PIG[i];return mix3(a[1],b[1],(d-a[0])/(b[0]-a[0]));}}return PIG[PIG.length-1][1].slice();}
function layerName(d){const pl=LANG==='pl';return d<0.02?(pl?'warstwa rogowa':'stratum corneum'):d<0.13?(pl?'naskórek i połączenie skórno-naskórkowe':'epidermis and junction'):d<0.4?(pl?'warstwa brodawkowata skóry właściwej':'papillary dermis'):d<2.4?(pl?'warstwa siateczkowata skóry właściwej':'reticular dermis'):(pl?'tkanka podskórna':'subcutis');}

/* ---------- how much of a structure at depth d reaches the image, per light mode ----------
   mode 0 dry skin, 1 non-polarized contact, 2 polarized, 3 violet-blue 405 nm */
function V(m,d){if(m===3)return Math.exp(-d/0.11);if(m===0)return 0.6*Math.exp(-Math.max(0,d-0.04)/0.45);if(m===1)return Math.exp(-Math.max(0,d-0.1)/0.9);return Math.exp(-Math.max(0,d-0.12)/1.25);}

/* ---------- optical spectra (per mm) ---------- */
function musp(l){const r=l/500;return 4.4*(0.38/r+0.62/(r*r*r*r));}      // reduced scattering, Mie λ^-1 + Rayleigh λ^-4 mix
function melA(l){return Math.pow(l/500,-3.5);}                          // melanin, relative to 500 nm
const HB=[[380,120],[400,230],[415,330],[430,190],[450,55],[480,22],[500,12],[520,20],[542,29],[560,22],[577,30],[590,10],[600,3],[620,1.2],[650,0.6],[700,0.35],[800,0.45],[900,0.6],[1000,0.5]];
function hb(l){if(l<=HB[0][0])return HB[0][1];for(let i=1;i<HB.length;i++){if(l<=HB[i][0]){const a=HB[i-1],b=HB[i];return lerp(a[1],b[1],(l-a[0])/(b[0]-a[0]));}}return 0.5;}
function lamRGB(l){let r=0,g=0,b=0;
  if(l>780)return[0.78,0.2,0.46];
  if(l<440){r=-(l-440)/60;b=1;}else if(l<490){g=(l-440)/50;b=1;}else if(l<510){g=1;b=-(l-510)/20;}else if(l<580){r=(l-510)/70;g=1;}else if(l<645){r=1;g=-(l-645)/65;}else r=1;
  let f=1;if(l<420)f=0.35+0.65*(l-380)/40;else if(l>700)f=0.35+0.65*(780-l)/80;
  return[clamp(r*f*1.15),clamp(g*f*1.15),clamp(b*f*1.15)];}

/* ---------- lesion-building helpers ---------- */
function makeShape(R,h){return th=>{let s=1;for(const q of h)s+=q[0]*Math.cos(q[1]*th+q[2]);return R*s;};}
function rhoFn(S,cx=0,cz=0){return(x,z)=>{const dx=x-cx,dz=z-cz;return Math.hypot(dx,dz)/S(Math.atan2(dz,dx));};}
const inM=(r,s)=>1-smoothstep(1-s,1+s,r);
function blobFn(cx,cz,R,soft=0.3,seed=3){return(x,z)=>{const dx=x-cx,dz=z-cz,d=Math.hypot(dx,dz)+1e-6;const k=0.8+0.4*vnoise(dx/d*1.4+seed,dz/d*1.4+seed*0.7,91);return 1-smoothstep(1-soft,1+soft,d/(R*k));};}
function scatter(rng,n,minD,test,R=3.8){const pts=[];let tries=0;while(pts.length<n&&tries<n*600){tries++;const x=(rng()*2-1)*R,z=(rng()*2-1)*R;if(!test(x,z))continue;let ok=true;for(const p of pts){if((p[0]-x)**2+(p[1]-z)**2<minD*minD){ok=false;break;}}if(ok)pts.push([x,z]);}return pts;}
const rr=(rng,a,b)=>a+(b-a)*rng();

/* capillary loop: ascending limb, apex, descending limb. tilt 0 = vertical (seen end-on as a dot) */
function vLoop(rng,x,z,o){const dTop=o.dTop??0.1,dBot=o.dBot??0.35,tilt=o.tilt??0.08,az=o.az??rng()*TAU,sep=o.sep??0.028,coil=o.coil||0,cr=o.coilR||0.028;
  const ux=Math.cos(az),uz=Math.sin(az),px=-uz,pz=ux,H=dBot-dTop,lean=Math.tan(tilt),pts=[];
  const put=(d,perp,h,phase)=>{let cx=x+ux*lean*(dBot-d)+px*perp,cz=z+uz*lean*(dBot-d)+pz*perp;
    if(coil){const a=h*coil*TAU+phase;cx+=Math.cos(a)*cr*(0.6+0.4*h)+(rng()-0.5)*0.012;cz+=Math.sin(a)*cr*(0.6+0.4*h)+(rng()-0.5)*0.012;}
    pts.push([cx,d,cz]);};
  const n=coil?16:7;
  for(let k=0;k<=n;k++){const h=k/n;put(dBot-H*h*0.93,-sep/2,h,0);}
  for(let k=1;k<6;k++){const f=k/6*Math.PI;put(dTop+0.012*(1-Math.sin(f)),-Math.cos(f)*sep/2,1,Math.PI*f/Math.PI);}
  for(let k=n;k>=0;k--){const h=k/n;put(dBot-H*h*0.93,sep/2,h,Math.PI);}
  return{t:'vessel',pts,rad:o.rad??0.011,sid:o.sid,halo:!!o.halo,kind:o.kind||'loop'};}
/* branching vessel lying parallel to the surface */
function vTree(rng,out,x,z,ang,len,d,rad,lvl,sid){const n=Math.max(4,Math.round(len/0.07)),pts=[],angs=[];let a=ang,cx=x,cz=z;
  for(let i=0;i<=n;i++){pts.push([cx,d+(rng()-0.5)*0.015+i/n*0.01,cz]);angs.push(a);a+=(rng()-0.5)*0.32;cx+=Math.cos(a)*len/n;cz+=Math.sin(a)*len/n;}
  out.push({t:'vessel',pts,rad,sid,kind:'arbor'});
  if(lvl<3){const nb=2+(rng()<0.45?1:0);for(let b=0;b<nb;b++){const idx=Math.min(n-1,Math.floor((0.25+rng()*0.6)*n));const p=pts[idx];
    vTree(rng,out,p[0],p[2],angs[idx]+(rng()<0.5?-1:1)*(0.45+rng()*0.55),len*(0.42+rng()*0.2),d-0.008,rad*0.6,lvl+1,sid);}}}
/* meandering horizontal vessel */
function vLine(rng,x,z,ang,len,d,rad,wig,sid,kind){const n=Math.max(5,Math.round(len/0.06)),pts=[];let a=ang,cx=x,cz=z,dd=d;
  for(let i=0;i<=n;i++){if(Math.abs(cx)>3.9||Math.abs(cz)>3.9){if(pts.length)break;}else pts.push([cx,dd,cz]);a+=(rng()-0.5)*wig;dd+=(rng()-0.5)*0.02;cx+=Math.cos(a)*len/n;cz+=Math.sin(a)*len/n;}
  return{t:'vessel',pts,rad,sid,kind:kind||'linear'};}

/* ---------- lesion model ---------- */
function baseModel(seed){return{seed,rng:mulberry32(seed),R:()=>9,
  elev:()=>0,sc:()=>0.02,epi:()=>0.045,rete:()=>0.055,irr:()=>0.15,netW:()=>0.13,netI:()=>0.03,
  pig:()=>0,pigD:()=>0.07,ker:()=>0,ery:()=>0,gyri:()=>0,pearl:()=>0,ulcer:()=>0,derm:()=>0,dermD:0.8,
  features:[],structures:[],summary:'',name:'',sub:''};}
function addNormalSkin(L){const rng=mulberry32(L.seed*7+3);
  const fol=scatter(rng,9,0.9,(x,z)=>L.R(x,z)>1.25&&Math.abs(x)<3.6&&Math.abs(z)<3.6);
  for(const[x,z]of fol)L.features.push({t:'follicle',x,z,hair:rng()<0.8,ang:rng()*TAU,len:rr(rng,0.8,2.0),sid:'bg'});
  for(let i=0;i<5;i++)L.features.push(vLine(rng,-3.9,-3.2+i*1.6+rr(rng,-0.3,0.3),rr(rng,-0.25,0.25),8,rr(rng,0.42,0.5),0.028,0.5,'plexus','plexus'));
  for(let i=0;i<3;i++)L.features.push(vLine(rng,-3.9,-2.6+i*2.6,rr(rng,-0.2,0.2),8,rr(rng,2.1,2.3),0.07,0.3,'plexus','plexus'));}
function finalize(L){L.elevAt=(x,z)=>L.elev(x,z,L.R(x,z));
  L.depths=(x,z)=>{const r=L.R(x,z),sc=L.sc(x,z,r),ep=L.epi(x,z,r),irr=L.irr(x,z,r),e=reteEdge(x,z,irr),rd=1-smoothstep(0,0.66,e);
    const dej=sc+ep+L.rete(x,z,r)*rd;const ni=L.netI(x,z,r);const nl=ni>0.015?ni*(1-smoothstep(0,L.netW(x,z,r),e)):0;
    return{r,sc,dej,pap:Math.max(0.4,dej+0.12),ret:2.4,sub:4.0,pigA:clamp(nl*1.1+L.pig(x,z,r)*0.8)};};
  let m=0;for(let i=-10;i<=10;i++)for(let j=-10;j<=10;j++)m=Math.max(m,L.elevAt(i*0.38,j*0.38));L.maxElev=m;
  return L;}

const CASES={};
CASES.melanoma={name:'Melanoma',sub:'superficial spreading, thin invasive',build(){
  const L=baseModel(7),rng=L.rng;L.name=this.name;L.sub=this.sub;
  const S=makeShape(2.45,[[0.13,2,0.8],[0.10,3,2.1],[0.06,5,0.4],[0.035,7,1.9]]);L.R=rhoFn(S);
  const VC=[0.95,0.55],RC=[-0.7,1.15],BC=[-0.9,-0.6];
  const veil=blobFn(VC[0],VC[1],0.7,0.35,2),reg=blobFn(RC[0],RC[1],0.55,0.35,4),blot=blobFn(BC[0],BC[1],0.5,0.3,6);
  L.elev=(x,z,r)=>0.05*inM(r,0.2);
  L.netI=(x,z,r)=>0.03+inM(r,0.04)*(0.88*(1-0.88*veil(x,z))*(1-0.85*reg(x,z))*(1-0.5*blot(x,z)));
  L.irr=(x,z,r)=>lerp(0.15,0.9,inM(r,0.1));
  L.netW=(x,z,r)=>0.13+inM(r,0.1)*0.14*fbm(x*1.6,z*1.6,91,2);
  L.pig=(x,z,r)=>r>1.3?0:inM(r,0.05)*(0.16+0.5*smoothstep(0.38,0.72,fbm(x*0.8+3,z*0.8,44,3)))+0.95*blot(x,z);
  L.pigD=(x,z,r)=>r>1.3?0.07:0.075-0.035*blot(x,z);
  L.rete=(x,z,r)=>0.055+inM(r,0.1)*0.05*fbm(x*0.7,z*0.7,63,2)-0.045*reg(x,z);
  L.epi=(x,z,r)=>0.045+0.02*inM(r,0.1);
  L.sc=(x,z,r)=>0.02+0.035*veil(x,z);
  L.ery=(x,z,r)=>r>1.3?0:0.22*inM(r,0.1)+0.25*reg(x,z);
  const F=L.features;
  // streaks at one sector of the edge
  for(const th0 of[-1.22,-0.98,-0.78,-0.46,-0.28,0.06,0.3]){const th=th0+rr(rng,-0.05,0.05),R0=S(th)*0.86;
    F.push({t:'streak',x:Math.cos(th)*R0,z:Math.sin(th)*R0,ang:th+rr(rng,-0.2,0.2),len:rr(rng,0.35,0.72),w:rr(rng,0.05,0.09),d:0.08,tip:rng()<0.5,sid:'streaks'});}
  // irregular dots and globules, crowded on one side
  const gl=scatter(rng,46,0.13,(x,z)=>{const r=L.R(x,z),a=Math.atan2(z,x);return r>0.3&&r<0.95&&(a>1.3||a<-2.2||rng()<0.18)&&veil(x,z)<0.3;});
  for(const[x,z]of gl){const q=rng();const d=q<0.25?rr(rng,0.02,0.035):q<0.8?rr(rng,0.07,0.12):rr(rng,0.17,0.24);F.push({t:'nest',x,z,d,r:rr(rng,0.022,0.085),sid:'globules'});}
  // blue-white veil = compact orthokeratosis over heavy dermal melanin
  F.push({t:'veil',x:VC[0],z:VC[1],r:0.7,sid:'veil'});
  F.push({t:'cloud',x:VC[0],z:VC[1],rx:0.62,rz:0.6,d0:0.14,d1:0.45,n:280,size:0.03,c3:'#2E2B3E',s2:'none',sid:'veil'});
  // regression
  F.push({t:'scar',x:RC[0],z:RC[1],r:0.55,sid:'regr'});
  F.push({t:'cloud',x:RC[0],z:RC[1],rx:0.5,rz:0.48,d0:0.15,d1:0.3,n:110,size:0.02,c3:'#5E5A69',s2:'dots',sid:'regr'});
  F.push({t:'collagen',x:RC[0],z:RC[1],r:0.46,d0:0.13,d1:0.3,n:34,style:'lines',sid:'shiny'});
  F.push({t:'collagen',x:VC[0],z:VC[1],r:0.55,d0:0.14,d1:0.26,n:40,style:'lines',sid:'shiny'});
  // off-centre blotch
  F.push({t:'blotch',x:BC[0],z:BC[1],r:0.5,d:0.05,sid:'blotch'});
  F.push({t:'cloud',x:BC[0],z:BC[1],rx:0.45,rz:0.44,d0:0.02,d1:0.2,n:240,size:0.028,c3:'#1E140F',s2:'none',sid:'blotch'});
  // atypical vessels: dotted + linear-irregular
  const dv=[...scatter(rng,8,0.12,(x,z)=>veil(x,z)>0.5),...scatter(rng,6,0.12,(x,z)=>reg(x,z)>0.5),...scatter(rng,4,0.2,(x,z)=>L.R(x,z)<0.35)];
  for(const[x,z]of dv)F.push(vLoop(rng,x,z,{dTop:0.11,dBot:0.34,tilt:0.06,rad:0.012,sid:'vessels',kind:'dotted'}));
  for(let i=0;i<4;i++)F.push(vLine(rng,0.1+rr(rng,-0.3,0.3),-0.5+i*0.28,rr(rng,-0.5,0.8),rr(rng,0.35,0.6),0.16,0.012,1.4,'vessels','linear'));
  L.structures=[
    {sid:'net',name:'Atypical pigment network',layer:'Dermo-epidermal junction',depth:'≈0.05–0.15 mm',vis:[3,3,3],focus:[1.55,0.1,-0.55],foot:[1.55,-0.55,0.35],
      histo:'Rete ridges that are elongated, widened and fused, carrying atypical melanocytes and heavy melanin along the junction.',
      optic:'Epidermal pigment: visible in every mode, darkest and crispest at 405 nm. Lines are thick, branched and stop abruptly at the edge.'},
    {sid:'streaks',name:'Irregular streaks (pseudopods)',layer:'Dermo-epidermal junction, lesion edge',depth:'≈0.05–0.12 mm',vis:[3,3,3],focus:[1.2,0.08,-1.75],foot:[1.25,-1.7,0.45],
      histo:'Confluent junctional nests of melanoma cells growing radially at the periphery. Present only on part of the edge.',
      optic:'Junctional melanin, so brown to black. Focal and uneven distribution is what makes them suspicious.'},
    {sid:'globules',name:'Irregular dots and globules',layer:'Epidermis to papillary dermis',depth:'≈0.02–0.25 mm',vis:[3,3,2],focus:[-1.35,0.1,0.55],foot:[-1.35,0.55,0.45],
      histo:'Nests of atypical melanocytes of different sizes. Black dots come from melanin high in the epidermis (pagetoid spread); grey ones are dermal.',
      optic:'Same pigment, three depths, three colours: black near the surface, brown at the junction, grey in the dermis. 405 nm keeps only the upper ones.'},
    {sid:'veil',name:'Blue-white veil',layer:'Stratum corneum + papillary dermis',depth:'surface and ≈0.15–0.45 mm',vis:[3,2,1],focus:[0.95,0.25,0.55],foot:[0.95,0.55,0.7],
      histo:'Compact orthokeratosis and acanthosis lying over dense melanin (tumour cells and melanophages) in the dermis.',
      optic:'Deep melanin gives the blue; the thickened keratin adds the white "ground-glass" haze. Best seen non-polarized.'},
    {sid:'regr',name:'Regression: peppering and white scar-like area',layer:'Papillary dermis',depth:'≈0.15–0.3 mm',vis:[3,2,1],focus:[-0.7,0.22,1.15],foot:[-0.7,1.15,0.55],
      histo:'Tumour cells replaced by fibrosis; melanin left behind inside melanophages. Rete ridges are flattened, so the network disappears.',
      optic:'Melanophages in the papillary dermis look grey (fine granules = peppering). Fibrosis looks white.'},
    {sid:'shiny',name:'Shiny white lines (crystalline)',layer:'Papillary dermis',depth:'≈0.13–0.3 mm',vis:[0,3,0],focus:[0.95,0.2,0.55],foot:[0.95,0.55,0.55],
      histo:'Altered, densely packed collagen in the superficial dermis.',
      optic:'Birefringent collagen rotates polarization, so this light passes the crossed analyzer. It appears only in polarized mode.'},
    {sid:'vessels',name:'Atypical vessels: dotted and linear-irregular',layer:'Papillary dermis',depth:'≈0.1–0.35 mm',vis:[1,3,1],focus:[0.2,0.2,-0.2],foot:[0.25,-0.1,0.6],
      histo:'New, irregular capillaries. Vertical loops in the dermal papillae are seen end-on as dots; horizontal ones as irregular lines.',
      optic:'Haemoglobin contrast is best polarized and without contact pressure. Contact plates empty superficial vessels.'},
    {sid:'blotch',name:'Off-centre blotch',layer:'Epidermis to upper dermis',depth:'≈0.02–0.2 mm',vis:[3,3,2],focus:[-0.9,0.08,-0.6],foot:[-0.9,-0.6,0.5],
      histo:'Pigment through the full thickness of the epidermis and into the upper dermis, hiding all underlying structure.',
      optic:'Dense pigment at several depths absorbs almost everything: dark brown to black in every mode.'}];
  L.summary='Structure and colour are asymmetric. The same melanin shows as black, brown, grey and blue because it sits at different depths.';
  addNormalSkin(L);return finalize(L);}};

CASES.nevus={name:'Common nevus',sub:'compound, benign',build(){
  const L=baseModel(11),rng=L.rng;L.name=this.name;L.sub=this.sub;
  const S=makeShape(1.85,[[0.04,2,0.3],[0.03,3,1.1]]);L.R=rhoFn(S);
  L.elev=(x,z,r)=>0.15*Math.max(0,1-r*r);
  L.rete=(x,z,r)=>0.055+0.035*inM(r,0.12);
  L.netI=(x,z,r)=>0.03+0.86*inM(r,0.1)*(1-0.72*smoothstep(0.55,1.0,r));
  L.netW=(x,z,r)=>0.13+0.06*inM(r,0.1)*(1-r*0.6);
  L.irr=()=>0.12;
  L.pig=(x,z,r)=>0.46*inM(r*1.25,0.3);
  L.pigD=()=>0.1;
  const F=L.features;
  for(const[x,z]of scatter(rng,30,0.2,(x,z)=>Math.hypot(x,z)<0.95))F.push({t:'nest',x,z,d:rr(rng,0.085,0.13),r:rr(rng,0.05,0.075),sid:'glob'});
  F.push({t:'cloud',x:0,z:0,rx:1.0,rz:1.0,d0:0.14,d1:0.38,n:260,size:0.034,c3:'#B78768',s2:'none',sid:'dermal'});
  L.structures=[
    {sid:'net',name:'Typical pigment network',layer:'Dermo-epidermal junction',depth:'≈0.05–0.13 mm',vis:[3,3,3],focus:[1.1,0.09,0.25],foot:[1.1,0.25,0.4],
      histo:'Melanin in basal keratinocytes and junctional melanocytes along the rete ridges. Lines are the ridges; the paler holes are the tips of dermal papillae, where the epidermis is thinnest.',
      optic:'Thin, evenly spaced lines of one or two shades of brown.'},
    {sid:'glob',name:'Regular brown globules',layer:'Dermo-epidermal junction',depth:'≈0.08–0.13 mm',vis:[3,3,2],focus:[0.2,0.11,-0.2],foot:[0.1,-0.1,0.9],
      histo:'Nests of nevus cells at the tips of rete ridges and just below the junction. Similar size, evenly spread in the centre.',
      optic:'Junctional depth, so brown. Their uniformity matters more than their presence.'},
    {sid:'fade',name:'Network fading at the edge',layer:'Dermo-epidermal junction',depth:'≈0.05–0.1 mm',vis:[3,3,3],focus:[-1.7,0.08,0.15],foot:[-1.7,0.1,0.35],
      histo:'Less pigment in the peripheral rete ridges. The fade is gradual and symmetric all around.',
      optic:'Compare with the abrupt edge of the melanoma network.'},
    {sid:'dermal',name:'Dermal nevus cells',layer:'Papillary dermis',depth:'≈0.14–0.38 mm',vis:[1,1,0],focus:[0,0.25,0],foot:[0,0,0.9],
      histo:'Nevus cells that have moved into the dermis. They carry little melanin.',
      optic:'Mostly invisible; they add a pale tan, structureless tone to the centre and lift the surface slightly.'}];
  L.summary='Symmetric, one or two browns, network thinning out evenly toward the edge.';
  addNormalSkin(L);return finalize(L);}};

CASES.bluenevus={name:'Blue nevus',sub:'dermal melanocytes',build(){
  const L=baseModel(13),rng=L.rng;L.name=this.name;L.sub=this.sub;
  const S=makeShape(1.45,[[0.04,2,0.2],[0.03,3,1.0]]);L.R=rhoFn(S);
  L.elev=(x,z,r)=>0.09*inM(r,0.3);
  L.derm=(x,z,r)=>0.97*inM(r,0.16);L.dermD=0.85;
  const F=L.features;
  F.push({t:'cloud',x:0,z:0,rx:1.35,rz:1.35,d0:0.45,d1:1.7,n:950,size:0.036,elong:2.6,c3:'#1B1F2C',s2:'none',sid:'blue',shape:(x,z)=>L.R(x,z)<0.97});
  L.structures=[
    {sid:'blue',name:'Homogeneous steel-blue pigmentation',layer:'Reticular dermis',depth:'≈0.45–1.7 mm',vis:[3,3,0],focus:[0.2,0.9,0],foot:[0,0,1.45],
      histo:'Heavily pigmented dendritic melanocytes and melanophages in the mid and deep dermis.',
      optic:'The dermis above scatters blue light back out before it reaches the pigment, while red and green travel on and are absorbed. The returning light is blue. Under 405 nm the lesion disappears: that light never gets this deep.'},
    {sid:'net',name:'Uninvolved epidermis',layer:'Epidermis and junction',depth:'0–0.1 mm',vis:[3,3,3],focus:[0.4,0.07,0.3],foot:[0.4,0.3,0.4],
      histo:'Normal rete ridges; no junctional component.',
      optic:'The faint background network runs straight across: nothing is happening at the junction.'}];
  L.summary='All the pigment is deep, so it is all blue. The epidermis above it is normal.';
  addNormalSkin(L);return finalize(L);}};

CASES.bcc={name:'Basal cell carcinoma',sub:'nodular, partly pigmented',build(){
  const L=baseModel(21),rng=L.rng;L.name=this.name;L.sub=this.sub;
  const S=makeShape(2.0,[[0.07,2,1.0],[0.05,3,0.2]]);L.R=rhoFn(S);
  const ul=blobFn(0.55,-0.5,0.3,0.25,8);
  L.elev=(x,z,r)=>0.62*Math.pow(Math.max(0,1-r*r),0.75)-0.05*ul(x,z);
  L.sc=(x,z,r)=>0.02*(1-0.4*inM(r,0.1))*(1-ul(x,z));
  L.epi=(x,z,r)=>(0.045-0.024*inM(r,0.1))*(1-0.95*ul(x,z));
  L.rete=(x,z,r)=>0.055*(1-0.93*inM(r,0.12));
  L.netI=(x,z,r)=>0.03*(1-inM(r,0.1));
  L.pearl=(x,z,r)=>r>1.3?0:0.85*inM(r,0.12)*(1-ul(x,z));
  L.ery=(x,z,r)=>r>1.3?0:0.35*inM(r,0.12);
  L.ulcer=(x,z)=>ul(x,z);
  const F=L.features;
  for(const q of[[0,0,0.55,0.55],[-0.6,0.35,0.45,0.4],[0.5,0.45,0.5,0.42],[-0.3,-0.6,0.6,0.4],[0.65,-0.3,0.72,0.38],[0.05,0.85,0.42,0.34]])F.push({t:'tumor',x:q[0],z:q[1],d:q[2],r:q[3],pig:0,kind:'bcc',sid:'nodule'});
  for(const q of[[-1.25,-0.45,0.28,0.24],[-1.05,0.78,0.25,0.2],[1.2,0.85,0.3,0.22],[1.38,-0.2,0.26,0.18]])F.push({t:'tumor',x:q[0],z:q[1],d:q[2],r:q[3],pig:1,kind:'bcc',sid:'ovoid'});
  for(const c of[[-0.5,1.3],[0.95,-1.1]])for(const[x,z]of scatter(rng,8,0.1,(x,z)=>Math.hypot(x-c[0],z-c[1])<0.36))F.push({t:'nest',x,z,d:rr(rng,0.12,0.2),r:rr(rng,0.03,0.055),bcc:true,sid:'glob'});
  for(const th of[2.75,-2.3]){const R0=S(th)*0.9,bx=Math.cos(th)*R0,bz=Math.sin(th)*R0,ox=Math.cos(th),oz=Math.sin(th),px=-oz,pz=ox;
    for(let k=0;k<5;k++){const f=0.05+k*0.07,side=(k%2?1:-1)*(0.05+rng()*0.06);F.push({t:'nest',x:bx+ox*f+px*side,z:bz+oz*f+pz*side,d:rr(rng,0.1,0.15),r:rr(rng,0.07,0.1),bcc:true,sid:'leaf'});}}
  for(const th of[0.45,2.2,-1.75]){const R0=S(th)*0.95;vTree(rng,F,Math.cos(th)*R0,Math.sin(th)*R0,th+Math.PI+rr(rng,-0.3,0.3),1.55,0.12,0.034,0,'arbor');}
  F.push({t:'collagen',x:0,z:0,r:1.3,d0:0.1,d1:0.2,n:55,style:'blotch',sid:'shiny'});
  F.push({t:'ulcer',x:0.55,z:-0.5,r:0.3,sid:'ulcer'});
  L.structures=[
    {sid:'arbor',name:'Arborizing vessels',layer:'Superficial dermis over the tumour',depth:'≈0.1–0.15 mm',vis:[2,3,2],focus:[0.95,0.12,0.9],foot:[0.8,0.8,0.6],
      histo:'Dilated, branching vessels lying flat in the dermis directly over the tumour, under an epidermis stretched thin.',
      optic:'Because they lie parallel to the surface and close to it, they are sharply in focus and tree-like: thick trunks that taper into fine branches.'},
    {sid:'ovoid',name:'Blue-grey ovoid nests',layer:'Papillary to upper reticular dermis',depth:'≈0.2–0.35 mm',vis:[3,3,1],focus:[-1.25,0.28,-0.45],foot:[-1.25,-0.45,0.35],
      histo:'Large pigmented tumour nests in the dermis.',
      optic:'Melanin in the dermis turns grey-blue. They fade under 405 nm.'},
    {sid:'glob',name:'Multiple blue-grey globules',layer:'Papillary dermis',depth:'≈0.12–0.2 mm',vis:[3,3,1],focus:[-0.5,0.16,1.3],foot:[-0.5,1.3,0.4],
      histo:'Small pigmented tumour nests.',
      optic:'Same colour logic as the ovoid nests, smaller and scattered.'},
    {sid:'leaf',name:'Leaf-like areas',layer:'Upper dermis at the edge',depth:'≈0.1–0.15 mm',vis:[3,3,2],focus:[-1.7,0.12,0.7],foot:[-1.75,0.65,0.4],
      histo:'Pigmented tumour nests at the periphery, still connected to the epidermis, forming bulbous lobes.',
      optic:'Brown-grey to grey-blue lobes that never join into a network.'},
    {sid:'ulcer',name:'Ulceration',layer:'Epidermis lost',depth:'surface',vis:[3,3,3],focus:[0.55,0.02,-0.5],foot:[0.55,-0.5,0.35],
      histo:'Loss of the epidermis over the tumour, covered by serum and blood crust.',
      optic:'Red-orange to dark red structureless area without a traumatic cause.'},
    {sid:'shiny',name:'Shiny white blotches and strands',layer:'Stroma around the nests',depth:'≈0.1–0.2 mm',vis:[0,3,0],focus:[0.3,0.15,0.2],foot:[0,0,1.1],
      histo:'Fibrotic stroma surrounding the tumour nests.',
      optic:'Polarized mode only. Collagen scrambles the polarization, so it passes the analyzer and glows white.'},
    {sid:'nodule',name:'Tumour nodule (translucent background)',layer:'Dermis',depth:'≈0.3–1 mm',vis:[2,3,0],focus:[0,0.55,0],foot:[0,0,1.6],
      histo:'Nests of basaloid cells with little pigment filling the dermis and lifting the surface.',
      optic:'Seen only indirectly as a translucent pink-white background: in polarized mode it looks "white-red" and structureless.'},
    {sid:'net',name:'No pigment network',layer:'Dermo-epidermal junction',depth:'≈0.04 mm',vis:[3,3,3],focus:[0.2,0.05,0.4],foot:[0.2,0.4,0.6],
      histo:'The epidermis is stretched flat over the nodule; rete ridges disappear.',
      optic:'Without rete ridges there is no network. Its absence is part of the diagnosis.'}];
  L.summary='No network. Vessels and grey-blue nests from a tumour in the dermis, seen through a thinned epidermis.';
  addNormalSkin(L);return finalize(L);}};

CASES.bowen={name:'Bowen disease',sub:'squamous cell carcinoma in situ',build(){
  const L=baseModel(33),rng=L.rng;L.name=this.name;L.sub=this.sub;
  const S=makeShape(2.3,[[0.1,2,0.5],[0.06,3,1.3],[0.03,6,0.2]]);L.R=rhoFn(S);
  const sq=(x,z)=>smoothstep(0.52,0.72,fbm(x*1.4,z*1.4,21,3));
  L.elev=(x,z,r)=>0.08*inM(r,0.05);
  L.sc=(x,z,r)=>0.02+inM(r,0.05)*(0.02+0.06*sq(x,z));
  L.ker=(x,z,r)=>r>1.2?0:inM(r,0.05)*sq(x,z)*0.85;
  L.epi=(x,z,r)=>0.045+inM(r,0.05)*0.02;
  L.rete=(x,z,r)=>0.055+inM(r,0.05)*0.17;
  L.irr=(x,z,r)=>0.15+0.3*inM(r,0.05);
  L.netI=(x,z,r)=>0.03*(1-inM(r,0.05));
  L.ery=(x,z,r)=>r>1.2?0:0.85*inM(r,0.04);
  L.pig=(x,z,r)=>r>1.2?0:0.06*inM(r,0.05);
  const F=L.features;
  const cl=scatter(rng,8,0.55,(x,z)=>L.R(x,z)<0.85);
  for(const c of cl)for(const[x,z]of scatter(rng,8,0.07,(x,z)=>Math.hypot(x-c[0],z-c[1])<0.3))F.push(vLoop(rng,x,z,{dTop:0.08,dBot:0.3,tilt:0.12,sep:0.03,coil:2.5,coilR:0.03,rad:0.011,sid:'glom',kind:'glomerular'}));
  for(let l=0;l<3;l++){const x0=-1.35+l*0.28,z0=0.5+l*0.3,a=rr(rng,-0.5,0.5);for(let k=0;k<5;k++)F.push({t:'nest',x:x0+Math.cos(a)*k*0.09,z:z0+Math.sin(a)*k*0.09,d:k%2?0.05:0.17,r:0.022,sid:'dots'});}
  for(const[x,z]of scatter(rng,26,0.28,(x,z)=>L.ker(x,z,L.R(x,z))>0.35))F.push({t:'scale',x,z,r:rr(rng,0.08,0.18),sid:'scale'});
  L.structures=[
    {sid:'glom',name:'Glomerular vessels in clusters',layer:'Papillary dermis, elongated papillae',depth:'≈0.08–0.3 mm',vis:[1,3,1],focus:[cl[0][0],0.18,cl[0][1]],foot:[cl[0][0],cl[0][1],0.35],
      histo:'Tortuous capillaries coiled inside dermal papillae that reach up between thickened rete ridges.',
      optic:'A coiled loop standing upright looks like a tiny ball of yarn from above: the kidney glomerulus the name refers to.'},
    {sid:'scale',name:'White-yellow surface scale',layer:'Stratum corneum',depth:'surface',vis:[2,3,3],focus:[0.3,0.03,0.2],foot:[0.3,0.2,0.8],
      histo:'Hyperkeratosis and parakeratosis over an atypical epidermis.',
      optic:'Scale scatters at the surface. Fluid makes it partly translucent; dry or polarized it stays white.'},
    {sid:'dots',name:'Brown and grey dots in lines',layer:'Epidermis and papillary dermis',depth:'≈0.05–0.17 mm',vis:[3,2,2],focus:[-1.1,0.1,0.8],foot:[-1.1,0.8,0.4],
      histo:'Melanin in the atypical epidermis (brown) and melanophages below it (grey), in pigmented variants.',
      optic:'The linear arrangement follows the rete ridges.'},
    {sid:'net',name:'Thickened epidermis (full-thickness atypia)',layer:'Epidermis',depth:'≈0.05–0.3 mm',vis:[1,1,1],focus:[0.8,0.15,-0.6],foot:[0.8,-0.6,0.5],
      histo:'Atypical keratinocytes through the whole epidermis; the basement membrane is intact, so this is in situ.',
      optic:'Not visible directly. You infer it from scale, vessels and a flat, well-defined red patch.'}];
  L.summary='A flat, well-demarcated red patch with clustered coiled vessels under scale.';
  addNormalSkin(L);return finalize(L);}};

CASES.scc={name:'Squamous cell carcinoma',sub:'invasive, keratinizing',build(){
  const L=baseModel(41),rng=L.rng;L.name=this.name;L.sub=this.sub;
  const S=makeShape(2.15,[[0.08,2,0.3],[0.07,3,2.0],[0.04,5,1.0]]);L.R=rhoFn(S);
  const K=blobFn(0.1,-0.1,1.0,0.25,5);
  L.elev=(x,z,r)=>0.75*Math.pow(Math.max(0,1-r*r),0.8);
  L.sc=(x,z,r)=>0.02+0.32*K(x,z);
  L.ker=(x,z,r)=>r>1.2?0:K(x,z)*(0.8+0.2*fbm(x*3,z*3,71,2));
  L.epi=(x,z,r)=>0.045+inM(r,0.1)*0.08;
  L.rete=(x,z,r)=>0.055+inM(r,0.1)*0.14;
  L.irr=(x,z,r)=>0.15+0.6*inM(r,0.1);
  L.netI=(x,z,r)=>0.03*(1-inM(r,0.1));
  L.ery=(x,z,r)=>r>1.2?0:0.6*inM(r,0.1)*(1-K(x,z));
  const F=L.features;
  for(const[x,z]of scatter(rng,9,0.35,(x,z)=>{const r=L.R(x,z);return r>0.35&&r<0.9&&K(x,z)<0.4;}))F.push({t:'follicle',x,z,wc:true,hair:rng()<0.3,ang:rng()*TAU,len:rr(rng,0.5,1.0),sid:'wc'});
  for(const[x,z]of scatter(rng,12,0.12,(x,z)=>K(x,z)>0.6))F.push({t:'blood',x,z,r:rr(rng,0.03,0.07),sid:'blood'});
  for(let i=0;i<17;i++){const th=i/17*TAU+rr(rng,-0.12,0.12),R0=S(th)*rr(rng,0.62,0.93);
    F.push(vLoop(rng,Math.cos(th)*R0,Math.sin(th)*R0,{dTop:0.1,dBot:0.4,tilt:rr(rng,0.72,0.9),az:th+Math.PI+rr(rng,-0.4,0.4),sep:0.062,rad:0.012,halo:true,sid:'hairpin',kind:'hairpin'}));}
  for(let i=0;i<4;i++){const th=rng()*TAU,R0=S(th)*0.8;F.push(vLine(rng,Math.cos(th)*R0,Math.sin(th)*R0,th+Math.PI/2,0.5,0.18,0.013,1.3,'hairpin','linear'));}
  for(const q of[[0,0,0.72,0.45],[-0.6,0.4,0.62,0.35],[0.6,0.5,0.66,0.35],[-0.3,-0.7,0.56,0.32],[0.7,-0.5,0.8,0.3]])F.push({t:'tumor',x:q[0],z:q[1],d:q[2],r:q[3],pig:0,kind:'scc',sid:'lobules'});
  F.push({t:'collagen',x:0,z:0,r:1.7,d0:0.12,d1:0.22,n:40,style:'blotch',ring:1.0,sid:'white'});
  L.structures=[
    {sid:'ker',name:'Keratin mass',layer:'Stratum corneum',depth:'surface, up to ≈0.35 mm thick',vis:[3,3,3],focus:[0.1,0.15,-0.1],foot:[0.1,-0.1,1.0],
      histo:'A thick crust of keratin produced by a well-differentiated tumour.',
      optic:'White-yellow and structureless. It sits on top, so every mode shows it, even dry skin.'},
    {sid:'wc',name:'White circles',layer:'Epidermis around follicles',depth:'≈0.02–0.1 mm',vis:[3,3,2],focus:null,foot:null,
      histo:'Acanthotic, hypergranulotic follicular infundibula: thickened keratinizing epithelium around hair openings.',
      optic:'White rings around a yellow keratin plug. A strong clue for squamous rather than basal cell carcinoma.'},
    {sid:'blood',name:'Blood spots on keratin',layer:'Stratum corneum',depth:'surface',vis:[3,3,3],focus:null,foot:null,
      histo:'Haemorrhage trapped in the keratin or in small erosions.',
      optic:'Red-black dots and clods on the white-yellow crust.'},
    {sid:'hairpin',name:'Hairpin and linear-irregular vessels with white halo',layer:'Papillary dermis',depth:'≈0.1–0.4 mm',vis:[1,3,1],focus:null,foot:null,
      histo:'Elongated capillary loops in the papillae of the tumour lobules, surrounded by keratinizing tumour cells (the white halo).',
      optic:'A loop that lies tilted shows both limbs from above: a hairpin. Polarized light shows them best.'},
    {sid:'white',name:'White structureless areas',layer:'Superficial dermis',depth:'≈0.12–0.22 mm',vis:[1,3,0],focus:[1.3,0.17,0.3],foot:[1.3,0.3,0.4],
      histo:'Keratinization and stromal fibrosis around the tumour.',
      optic:'Brighter in polarized mode.'},
    {sid:'lobules',name:'Invasive keratinizing lobules',layer:'Dermis',depth:'≈0.4–1 mm',vis:[0,0,0],focus:[0,0.72,0],foot:[0,0,1.4],
      histo:'Tongues of atypical keratinocytes with keratin pearls invading the dermis.',
      optic:'Too deep to see. They lift the surface into a nodule.'}];
  L.summary='Keratin on top, white circles and looped vessels with white halos around it.';
  addNormalSkin(L);finalize(L);
  const wc=F.find(f=>f.sid==='wc'),bl=F.find(f=>f.sid==='blood'),hp=F.find(f=>f.sid==='hairpin');
  L.structures[1].focus=[wc.x,0.05,wc.z];L.structures[1].foot=[wc.x,wc.z,0.25];
  L.structures[2].focus=[bl.x,0.03,bl.z];L.structures[2].foot=[bl.x,bl.z,0.25];
  const hm=hp.pts[Math.floor(hp.pts.length/2)];L.structures[3].focus=[hm[0],0.2,hm[2]];L.structures[3].foot=[hm[0],hm[2],0.3];
  return L;}};

CASES.sk={name:'Seborrheic keratosis',sub:'benign keratinocytic',build(){
  const L=baseModel(51),rng=L.rng;L.name=this.name;L.sub=this.sub;
  const S=makeShape(2.1,[[0.06,2,0.0],[0.07,4,1.0],[0.035,9,0.5],[0.022,14,2.0]]);L.R=rhoFn(S);
  const sulc=(x,z)=>smoothstep(0.8,0.94,1-Math.abs(2*fbm(x*1.25+7,z*1.25,33,3)-1));
  L.elev=(x,z,r)=>inM(r,0.04)*(0.36+0.07*(1-sulc(x,z)));
  L.sc=(x,z,r)=>0.025+inM(r,0.03)*(0.03+0.07*sulc(x,z));
  L.epi=(x,z,r)=>0.045+inM(r,0.03)*0.28;
  L.rete=(x,z,r)=>0.055-inM(r,0.03)*0.04;
  L.netI=(x,z,r)=>0.03*(1-inM(r,0.03));
  L.pig=(x,z,r)=>r>1.2?0:inM(r,0.025)*(0.42+0.3*fbm(x*0.9,z*0.9,55,3));
  L.pigD=()=>0.07;
  L.gyri=(x,z,r)=>r>1.2?0:inM(r,0.03)*sulc(x,z);
  const F=L.features;
  const mil=scatter(rng,14,0.32,(x,z)=>L.R(x,z)<0.85);
  for(const[x,z]of mil){const big=rng()<0.3;F.push({t:'milia',x,z,d:big?rr(rng,0.14,0.22):rr(rng,0.06,0.12),r:big?rr(rng,0.07,0.1):rr(rng,0.035,0.06),sid:'milia'});}
  const com=scatter(rng,11,0.3,(x,z)=>L.R(x,z)<0.85&&mil.every(p=>Math.hypot(p[0]-x,p[1]-z)>0.22));
  for(const[x,z]of com)F.push({t:'comedo',x,z,r:rr(rng,0.045,0.085),sid:'comedo'});
  for(const[x,z]of scatter(rng,10,0.4,(x,z)=>L.R(x,z)<0.8))F.push(vLoop(rng,x,z,{dTop:0.14,dBot:0.42,tilt:0.68,sep:0.056,rad:0.012,halo:true,sid:'hairpin',kind:'hairpin'}));
  const eb=S(0.35);
  L.structures=[
    {sid:'milia',name:'Milia-like cysts',layer:'Epidermis',depth:'≈0.06–0.22 mm',vis:[3,1,3],focus:[mil[0][0],0.1,mil[0][1]],foot:[mil[0][0],mil[0][1],0.25],
      histo:'Intraepidermal horn pseudocysts: small balls of keratin inside a thickened epidermis.',
      optic:'Bright white-yellow "stars" in non-polarized light; much dimmer polarized. Small ones look like stars, large ones like clouds.'},
    {sid:'comedo',name:'Comedo-like openings',layer:'Stratum corneum into epidermis',depth:'0–0.15 mm',vis:[3,2,3],focus:[com[0][0],0.06,com[0][1]],foot:[com[0][0],com[0][1],0.25],
      histo:'Keratin-filled invaginations of the epidermis open to the surface. Oxidized keratin is brown to black.',
      optic:'Round to oval brown-black plugs, clearest non-polarized.'},
    {sid:'gyri',name:'Fissures and ridges (brain-like)',layer:'Surface and stratum corneum',depth:'surface',vis:[3,3,3],focus:[-0.6,0.03,-0.5],foot:[-0.6,-0.5,0.6],
      histo:'Papillomatous surface folded into gyri; keratin collects in the sulci.',
      optic:'Dark curved furrows between paler ridges: the cerebriform pattern.'},
    {sid:'hairpin',name:'Hairpin vessels with white halo',layer:'Papillae inside the thick epidermis',depth:'≈0.14–0.42 mm',vis:[1,3,1],focus:null,foot:null,
      histo:'Capillary loops in elongated papillae, surrounded by keratinizing cells.',
      optic:'Tilted loops seen as hairpins; the halo is the keratinizing epithelium around them.'},
    {sid:'border',name:'Sharp, moth-eaten border',layer:'Whole epidermis',depth:'0–0.35 mm',vis:[3,3,3],focus:[Math.cos(0.35)*eb,0.1,Math.sin(0.35)*eb],foot:[Math.cos(0.35)*eb,Math.sin(0.35)*eb,0.4],
      histo:'The epidermal proliferation ends abruptly, with small notches along the edge.',
      optic:'A stuck-on edge with concave bites: no fading, unlike a nevus.'}];
  L.summary='Keratin structures in a thickened epidermis: cysts, plugs and fissures, with a sharp edge.';
  addNormalSkin(L);finalize(L);
  const hp=F.find(f=>f.sid==='hairpin'),hm=hp.pts[Math.floor(hp.pts.length/2)];L.structures[3].focus=[hm[0],0.25,hm[2]];L.structures[3].foot=[hm[0],hm[2],0.3];
  return L;}};

CASES.df={name:'Dermatofibroma',sub:'benign fibrohistiocytic',build(){
  const L=baseModel(61),rng=L.rng;L.name=this.name;L.sub=this.sub;
  const S=makeShape(1.85,[[0.05,2,0.4],[0.04,3,1.6]]);L.R=rhoFn(S);
  L.elev=(x,z,r)=>0.13*inM(r,0.2)*(1-0.45*r*r);
  L.epi=(x,z,r)=>0.045+0.035*inM(r,0.1);
  L.rete=(x,z,r)=>0.055+0.03*inM(r,0.1);
  L.netW=(x,z,r)=>0.13-0.05*inM(r,0.1);
  L.irr=()=>0.18;
  L.netI=(x,z,r)=>0.03+inM(r,0.08)*0.66*smoothstep(0.3,0.62,r);
  L.pig=(x,z,r)=>r>1.2?0:inM(r,0.1)*0.2*smoothstep(0.3,0.6,r);
  const F=L.features;
  F.push({t:'scar',x:0.05,z:0.05,r:0.8,strong:1,sid:'patch'});
  F.push({t:'collagen',x:0,z:0,r:1.05,d0:0.12,d1:1.2,n:300,style:'dense',sid:'fibro'});
  F.push({t:'collagen',x:0,z:0,r:0.6,d0:0.12,d1:0.2,n:36,style:'lines',sid:'shiny'});
  L.structures=[
    {sid:'patch',name:'Central white scar-like patch',layer:'Papillary dermis',depth:'≈0.1–0.3 mm',vis:[3,3,1],focus:[0,0.2,0],foot:[0.05,0.05,0.8],
      histo:'Fibrosis of the superficial dermis over the fibrohistiocytic proliferation.',
      optic:'Dense collagen scatters all wavelengths: white. Brighter and shinier polarized.'},
    {sid:'net',name:'Delicate peripheral network',layer:'Dermo-epidermal junction',depth:'≈0.05–0.13 mm',vis:[3,3,3],focus:[1.3,0.09,0.4],foot:[1.3,0.4,0.4],
      histo:'Hyperpigmented basal layer over a thickened epidermis with broad, flat rete ridges.',
      optic:'Thin light-brown lines in a ring around the white centre.'},
    {sid:'shiny',name:'Shiny white lines',layer:'Papillary dermis',depth:'≈0.12–0.2 mm',vis:[0,3,0],focus:[0.2,0.16,0.1],foot:[0,0,0.6],
      histo:'Collagen bundles in the superficial dermis.',
      optic:'Polarized mode only.'},
    {sid:'fibro',name:'Dermal fibrohistiocytic proliferation',layer:'Papillary and reticular dermis',depth:'≈0.1–1.2 mm',vis:[0,1,0],focus:[0,0.7,0],foot:[0,0,1.05],
      histo:'Spindle cells and collagen in the dermis; tethers the epidermis (dimple sign when pinched).',
      optic:'Too deep to see as structure; it is the reason the centre is white and firm.'}];
  L.summary='White fibrous centre with a delicate brown network rim.';
  addNormalSkin(L);return finalize(L);}};

CASES.plain={name:'Normal skin',sub:'reference',hidden:true,build(){
  const L=baseModel(3);L.name=this.name;L.sub=this.sub;L.summary='';addNormalSkin(L);return finalize(L);}};
const CASE_ORDER=['melanoma','nevus','bluenevus','bcc','bowen','scc','sk','df'];

/* =====================================================================
   Language: English / Polish. Polish uses established Polish
   dermoscopic and histopathological terms; where no Polish term is in
   common use the English one is kept (in parentheses or as is).
   ===================================================================== */
const I18N={en:{
  'brand.h1':'Beneath the Lens','brand.p':'How a dermatoscope sees into skin',
  'hint':'Drag to orbit · scroll or pinch to zoom · right-drag to pan','hint.touch':'Drag to orbit · pinch to zoom · drag with two fingers to pan','loading':'Building tissue…',
  'grip.hide':'Hide notes','grip.show':'Show notes','fs.title':'Full screen','lang.label':'Language',
  'dock.light':'Light','dock.view':'View','dock.lesion':'Lesion','dock.photons':'Photons',
  'mode.btn0':'Dry skin','mode.btn1':'Non-polarized','mode.btn2':'Polarized','mode.btn3':'405 nm',
  'mode.s0':'Dry','mode.s1':'Non-pol','mode.s2':'Pol','mode.s3':'405',
  'view.lens':'Lens','view.orbit':'3D','view.section':'Section','view.layers':'Layers','view.hist':'H&E',
  'mode.name0':'Dry skin','mode.name1':'Non-polarized contact','mode.name2':'Polarized','mode.name3':'Violet-blue 405 nm',
  'hist.ttl':'H&E section','hist.cut':'Cut position','hist.fit':'Fit','hist.lesion':'Lesion','hist.strip':'THROUGH THE LENS · {m} · CUT LINE',
  'ch.instrument':'The instrument','ch.glare':'Surface glare','ch.light':'Three kinds of light','ch.depth':'Wavelength and colour','ch.layers':'Skin layers','ch.atlas':'Diagnoses',
  'c0.kicker':'01 · Instrument','c0.h2':'A 10× lens that brings its own light',
  'c0.p':'A dermatoscope is a magnifier with a ring of LEDs around the lens. The optics are simple. The engineering is about one problem: most light that comes straight back from skin was reflected by its outermost surface and carries nothing about the lesion.',
  'c0.take':'Take it apart',
  'c0.lens.h':'Lens','c0.lens.p':'Achromatic, usually 10×, focused at the faceplate. Larger hand-held lenses reach about 25–32 mm.',
  'c0.led.h':'LED ring','c0.led.p':'White LEDs around the lens light the skin at an angle. A flat faceplate then reflects them away from the lens, not into it.',
  'c0.pol.h':'Polarizer and analyzer','c0.pol.p':'Film over the LEDs makes the light vibrate in one plane. A second film in front of the lens, turned 90°, passes only light whose polarization was scrambled inside the skin.',
  'c0.plate.h':'Faceplate and immersion fluid','c0.plate.p':'Glass in contact with skin, wetted with oil, alcohol, gel or water. Used without polarizers, this is non-polarized contact dermoscopy.',
  'c0.note':'Hybrid devices carry two LED sets, one behind polarizing film and one without, and switch with a button. Some add a 365 nm UV mode that excites fluorescence, a different mechanism that this model leaves out.',
  'c0.next':'Next: why the surface is the problem.','c0.btn':'Surface glare →',
  'c1.kicker':'02 · Surface glare','c1.h2':'Skin reflects before it lets light in',
  'c1.p1':'The stratum corneum has a refractive index of about 1.55; air is 1.00. Light reflects at the boundary in proportion to the step in index.',
  'c1.eq':'R = ((n₁ − n₂) / (n₁ + n₂))² &nbsp;·&nbsp; normal incidence, n(stratum corneum) ≈ 1.55',
  'c1.p2':'About 4.7% sounds small. But the surface is scales and furrows tilted in every direction, so reflected light reaches the lens from everywhere and lies on top of the image as haze and glints. It outshines the faint light coming back from pigment below.',
  'c1.h3a':'Two ways out','c1.h3b':'Where the light reaching the lens came from',
  'c1.note':'Glare is exaggerated here so the photons are easy to see. Bars count simulated photons for the current mode.',
  'c1.t1':'Match the index','c1.t2':'Filter it out','c1.t0':'Back to dry skin',
  'c1.x1':'Non-polarized, contact. Fluid fills the relief and glass gives one flat boundary. What still reflects leaves at the mirror angle, away from the lens.',
  'c1.x2':'Polarized. Glare keeps the polarization it arrived with, so the crossed analyzer stops it. Deeper light loses its polarization and half of it gets through.',
  'c1.x0':'No fluid, no filter: glare on top of everything.',
  'media0':'Air','media1':'Water','media2':'Ultrasound gel','media3':'70% ethanol','media4':'Mineral oil','media5':'Glass',
  'bars.glare':'Surface glare','bars.sc':'Stratum corneum','bars.epi':'Epidermis / DEJ','bars.pap':'Papillary dermis','bars.ret':'Reticular dermis',
  'c2.kicker':'03 · Light','c2.h2':'Three ways to light the same lesion','c2.h3a':'Where detected light came from','c2.h3b':'Follow one photon','c2.wait':'Waiting for the next photon…',
  'c2.note1':'The glyph on each photon shows polarization: a bar while it is still polarized, a round dot once it is lost. White photons are the ones being followed.',
  'c2.note2':'Model: random walk with wavelength-dependent reduced scattering (Mie λ⁻¹ plus Rayleigh λ⁻⁴), absorption by melanin (∝ λ⁻³·⁵) and haemoglobin, and partial loss of polarization at each scattering event. Depth is stretched.',
  'ana.rej':'Returning light rejected by the analyzer','ana.k':'Analyzer','ana.v':'none in this mode',
  'modeTxt0':'No fluid and no filter. Most of what reaches the lens is surface reflection; only pigment near the surface shows through the haze.',
  'modeTxt1':'Faceplate and fluid remove the glare. Everything that comes back is collected, including light that scattered only once or twice in the upper epidermis, so the image leans toward the epidermis and junction. Best for milia-like cysts, comedo-like openings, blue-white veil, peppering and the shade of epidermal pigment. Contact pressure empties small vessels.',
  'modeTxt2':'Polarizer on the LEDs, analyzer at 90° in front of the lens. Light that scattered only a few times near the surface keeps its polarization and is blocked with the glare. Light that went deeper and scattered many times loses it, and half of that passes. The image leans toward the junction and superficial dermis. Best for vessels, red areas and shiny white structures, which only polarized light shows. At least half the returning light is lost, so the LEDs must be brighter.',
  'modeTxt3':'Violet-blue light scatters and is absorbed strongly, reaching about 0.2–0.3 mm. Melanin absorbs more at short wavelengths and haemoglobin peaks near 415 nm, so epidermal pigment and superficial vessels turn dark and sharp while dermal pigment drops out. A blue nevus disappears. Useful for telling superficial from deep pigment.',
  'c3.kicker':'04 · Wavelength and colour','c3.h2':'Longer wavelengths reach deeper',
  'c3.p1':'Scattering in skin falls steeply with wavelength, and so does absorption by melanin and, below about 600 nm, by haemoglobin. Short wavelengths turn back near the surface; red and near-infrared wander deep.',
  'c3.lam':'Wavelength','c3.nir':' (near-infrared)','c3.kvS':'Scattering μs′, vs 530 nm','c3.kvM':'Melanin absorption, vs 530 nm','c3.kvH':'Haemoglobin absorption, vs 530 nm','c3.kv50':'Half of detected light turned back above','c3.kv90':'90% turned back above',
  'c3.h3':'Why deep pigment looks blue',
  'c3.p2':'Melanin absorbs across the visible spectrum. Near the surface it looks black or brown. Deeper, the tissue above scatters short (blue) wavelengths back out before they reach the pigment, while red and green travel on and are absorbed. What returns is skewed to blue: grey in the papillary dermis, steel blue in the reticular dermis.',
  'c3.pd':'Depth of the melanin clump','c3.sc0':'SC','c3.sc1':'Epidermis','c3.sc2':'DEJ','c3.sc3':'Papillary','c3.sc4':'Reticular',
  'c3.note':'Try 405 nm and push the clump below about 0.3 mm: it disappears, as a blue nevus does.',
  'sw.none':'Not visible','sw.dark':'Dark (absorbs violet)','sw.black':'Black','sw.brown':'Brown','sw.grey':'Grey','sw.blue':'Blue',
  'c4.kicker':'05 · Skin layers','c4.h2':'Each layer adds its own structures',
  'c4.p1':'Depth in the model is stretched so that thin layers stay visible: the epidermis is drawn several times thicker than the dermis. Labels give real depths.',
  'c4.peel':'Remove tissue from the top','c4.none':'none','c4.h3':'Vessel shape is 3D orientation',
  'c4.p2':"From above you see only a vessel's projection. A capillary loop standing upright in a papilla is seen end-on as a dot. Tilted, it shows both limbs: a hairpin. Coiled, it becomes a glomerulus. A vessel lying flat and branching reads as a tree.",
  'c4.chip0':'Dotted · melanoma','c4.chip1':'Glomerular · Bowen','c4.chip2':'Hairpin · SCC','c4.chip3':'Arborizing · BCC',
  'c4.h3b':'The same layers on H&amp;E','c4.p3':'A virtual H&amp;E section through this block, at true proportions and cut along the line shown on the lens image. Pick a feature to jump to it on the slide.',
  'openhist':'Open the H&amp;E section',
  'c5.kicker':'06 · Diagnoses','legend.N':'N non-polarized','legend.P':'P polarized','legend.B':'B 405 nm','legend.hint':'brighter = better seen',
  'vis.N':'N','vis.P':'P','vis.B':'B','vis.t0':'Not seen','vis.t1':'Faint','vis.t2':'Visible','vis.t3':'Best',
  'tab.derm':'Through the lens','tab.hist':'H&amp;E section',
  'c5.noteDerm':'Pick a structure to cut the block through it. Switch the light mode to see which structures appear or vanish.',
  'c5.noteHist':'A virtual H&amp;E section through the same model, cut along the dashed line on the lens strip. Cells are drawn to scale in micrometres; it is schematic, not a scanned slide. Move the cut with the slider above the slide.',
  's.histo':'Histology.','s.optic':'Optics.','btn.cut':'Cut through it','btn.lens':'See it through the lens','btn.he':'See it on H&amp;E',
  'hl.absent':'Not in this section · pick it to move the cut','hl.derm':'Through the lens: ','hl.only':'Histology only',
  'src.lead':'Sources:','src.tail':'Tissue, lesions and photon paths are schematic models, not patient images.',
  'lbl.probe':'Melanin clump','dev.lens':'Lens · 10×','dev.ana':'Analyzer, turned 90°','dev.leds':'LED ring','dev.pol':'Polarizer over the LEDs','dev.plate':'Glass faceplate','dev.fluid':'Immersion fluid',
  'story.photon':'photon','story.refl':'reflected at the surface','story.scat':'scattered {n}× · deepest point {d} ({l})','story.abs':'absorbed by <b>{a}</b>',
  'story.passed':'came back {p}% depolarized · <b>passed the analyzer</b>','story.reached':'came back out · <b>reached the lens</b>',
  'story.blocked':'came back only {p}% depolarized · <b>blocked by the analyzer</b>','story.left':'left the field of view',
  'lay.sc':'stratum corneum','lay.epi':'epidermis','lay.pap':'papillary dermis','lay.ret':'reticular dermis',
  'err':'Something failed while drawing the scene: '},
pl:{
  'brand.h1':'Pod soczewką','brand.p':'Jak dermatoskop zagląda w głąb skóry',
  'hint':'Przeciągnij, aby obrócić · przewiń lub uszczypnij, aby przybliżyć · prawy przycisk, aby przesunąć','hint.touch':'Przeciągnij, aby obrócić · uszczypnij, aby przybliżyć · przeciągnij dwoma palcami, aby przesunąć','loading':'Buduję tkankę…',
  'grip.hide':'Ukryj opis','grip.show':'Pokaż opis','fs.title':'Pełny ekran','lang.label':'Język',
  'dock.light':'Światło','dock.view':'Widok','dock.lesion':'Zmiana','dock.photons':'Fotony',
  'mode.btn0':'Sucha skóra','mode.btn1':'Niespolaryzowane','mode.btn2':'Spolaryzowane','mode.btn3':'405 nm',
  'mode.s0':'Sucha','mode.s1':'Niepol.','mode.s2':'Pol.','mode.s3':'405',
  'view.lens':'Dermatoskop','view.orbit':'3D','view.section':'Przekrój','view.layers':'Warstwy','view.hist':'H&E',
  'mode.name0':'Sucha skóra','mode.name1':'Niespolaryzowane, kontaktowe','mode.name2':'Spolaryzowane','mode.name3':'Fioletowo-niebieskie 405 nm',
  'hist.ttl':'Przekrój H&E','hist.cut':'Położenie cięcia','hist.fit':'Całość','hist.lesion':'Zmiana','hist.strip':'PRZEZ DERMATOSKOP · {m} · LINIA CIĘCIA',
  'ch.instrument':'Budowa dermatoskopu','ch.glare':'Odblask powierzchniowy','ch.light':'Trzy rodzaje światła','ch.depth':'Długość fali i barwa','ch.layers':'Warstwy skóry','ch.atlas':'Rozpoznania',
  'c0.kicker':'01 · Dermatoskop','c0.h2':'Soczewka 10× z własnym oświetleniem',
  'c0.p':'Dermatoskop to lupa z pierścieniem diod LED wokół soczewki. Optyka jest prosta. Cała konstrukcja rozwiązuje jeden problem: większość światła, które wraca prosto ze skóry, odbiła się od jej najbardziej zewnętrznej powierzchni i nie niesie żadnej informacji o zmianie.',
  'c0.take':'Rozłóż na części',
  'c0.lens.h':'Soczewka','c0.lens.p':'Achromatyczna, zwykle 10×, ostrość ustawiona na płytkę kontaktową. Większe soczewki w dermatoskopach ręcznych mają ok. 25–32 mm.',
  'c0.led.h':'Pierścień LED','c0.led.p':'Białe diody wokół soczewki oświetlają skórę pod kątem. Płaska płytka kontaktowa odbija wtedy ich światło w bok, a nie do soczewki.',
  'c0.pol.h':'Polaryzator i analizator','c0.pol.p':'Folia na diodach sprawia, że światło drga w jednej płaszczyźnie. Druga folia przed soczewką, obrócona o 90°, przepuszcza tylko światło, które straciło polaryzację wewnątrz skóry.',
  'c0.plate.h':'Płytka kontaktowa i płyn immersyjny','c0.plate.p':'Szkło przyłożone do skóry i zwilżone olejkiem, alkoholem, żelem lub wodą. Bez polaryzatorów to dermatoskopia kontaktowa w świetle niespolaryzowanym.',
  'c0.note':'Urządzenia hybrydowe mają dwa zestawy diod: jeden za folią polaryzacyjną, drugi bez niej, przełączane przyciskiem. Niektóre mają też tryb UV 365 nm, który wzbudza fluorescencję – to inny mechanizm, którego ten model nie obejmuje.',
  'c0.next':'Dalej: dlaczego problemem jest powierzchnia.','c0.btn':'Odblask powierzchniowy →',
  'c1.kicker':'02 · Odblask powierzchniowy','c1.h2':'Skóra odbija światło, zanim je wpuści',
  'c1.p1':'Warstwa rogowa ma współczynnik załamania około 1,55, powietrze 1,00. Na granicy tych ośrodków część światła odbija się – tym więcej, im większa różnica współczynników.',
  'c1.eq':'R = ((n₁ − n₂) / (n₁ + n₂))² &nbsp;·&nbsp; padanie prostopadłe, n(warstwa rogowa) ≈ 1,55',
  'c1.p2':'Około 4,7% to niewiele. Ale powierzchnię tworzą łuski i bruzdy nachylone we wszystkich kierunkach, więc odbite światło trafia do soczewki z każdego miejsca i nakłada się na obraz jako mgła i refleksy. Jest jaśniejsze niż słabe światło wracające od barwnika w głębi.',
  'c1.h3a':'Dwa rozwiązania','c1.h3b':'Skąd pochodzi światło docierające do soczewki',
  'c1.note':'Odblask jest tu przesadzony, żeby fotony były dobrze widoczne. Słupki zliczają symulowane fotony w bieżącym trybie.',
  'c1.t1':'Dopasuj współczynnik załamania','c1.t2':'Odfiltruj odblask','c1.t0':'Z powrotem do suchej skóry',
  'c1.x1':'Światło niespolaryzowane, kontakt. Płyn wypełnia nierówności, a szkło tworzy jedną płaską granicę. To, co nadal się odbija, odchodzi pod kątem lustrzanym, obok soczewki.',
  'c1.x2':'Światło spolaryzowane. Odblask zachowuje polaryzację, z którą padł, więc skrzyżowany analizator go zatrzymuje. Światło z głębi traci polaryzację i połowa z niego przechodzi.',
  'c1.x0':'Bez płynu i bez filtra: odblask na wszystkim.',
  'media0':'Powietrze','media1':'Woda','media2':'Żel do USG','media3':'Etanol 70%','media4':'Olej mineralny','media5':'Szkło',
  'bars.glare':'Odblask powierzchniowy','bars.sc':'Warstwa rogowa','bars.epi':'Naskórek / DEJ','bars.pap':'Warstwa brodawkowata','bars.ret':'Warstwa siateczkowata',
  'c2.kicker':'03 · Światło','c2.h2':'Trzy sposoby oświetlenia tej samej zmiany','c2.h3a':'Skąd pochodzi wykryte światło','c2.h3b':'Śledź jeden foton','c2.wait':'Czekam na następny foton…',
  'c2.note1':'Znak na fotonie pokazuje polaryzację: kreska – foton nadal spolaryzowany, okrągła kropka – polaryzacja utracona. Białe fotony to te, które śledzimy.',
  'c2.note2':'Model: błądzenie losowe z zależnym od długości fali zredukowanym współczynnikiem rozpraszania (Mie λ⁻¹ i Rayleigh λ⁻⁴), absorpcją przez melaninę (∝ λ⁻³·⁵) i hemoglobinę oraz częściową utratą polaryzacji przy każdym rozproszeniu. Głębokość jest rozciągnięta.',
  'ana.rej':'Powracające światło zatrzymane przez analizator','ana.k':'Analizator','ana.v':'brak w tym trybie',
  'modeTxt0':'Bez płynu i bez filtra. Większość światła docierającego do soczewki to odbicie od powierzchni; przez mgłę widać tylko barwnik leżący płytko.',
  'modeTxt1':'Płytka i płyn usuwają odblask. Zbierane jest całe powracające światło, także rozproszone tylko raz lub dwa razy w górnych warstwach naskórka, dlatego obraz uwypukla naskórek i połączenie skórno-naskórkowe. Najlepiej widać torbiele prosakopodobne, ujścia zaskórnikopodobne, niebiesko-biały welon, ziarnistości (peppering) i odcień barwnika naskórkowego. Ucisk płytki opróżnia drobne naczynia.',
  'modeTxt2':'Polaryzator na diodach, analizator obrócony o 90° przed soczewką. Światło rozproszone tylko kilka razy blisko powierzchni zachowuje polaryzację i zostaje zatrzymane razem z odblaskiem. Światło, które weszło głębiej i rozproszyło się wielokrotnie, traci ją i połowa z niego przechodzi. Obraz uwypukla połączenie skórno-naskórkowe i powierzchowną skórę właściwą. Najlepiej widać naczynia, obszary czerwone i białe błyszczące struktury, widoczne wyłącznie w świetle spolaryzowanym. Co najmniej połowa powracającego światła jest tracona, więc diody muszą świecić jaśniej.',
  'modeTxt3':'Światło fioletowo-niebieskie silnie się rozprasza i jest pochłaniane, docierając na ok. 0,2–0,3 mm. Melanina pochłania więcej krótkich fal, a hemoglobina ma maksimum absorpcji ok. 415 nm, więc barwnik naskórkowy i powierzchowne naczynia stają się ciemne i ostre, a barwnik w skórze właściwej znika. Znamię błękitne przestaje być widoczne. Pomaga odróżnić barwnik płytki od głębokiego.',
  'c3.kicker':'04 · Długość fali i barwa','c3.h2':'Dłuższe fale sięgają głębiej',
  'c3.p1':'Rozpraszanie w skórze gwałtownie maleje wraz z długością fali, podobnie jak absorpcja przez melaninę oraz – poniżej ok. 600 nm – przez hemoglobinę. Krótkie fale zawracają blisko powierzchni, czerwień i bliska podczerwień wędrują głęboko.',
  'c3.lam':'Długość fali','c3.nir':' (bliska podczerwień)','c3.kvS':'Rozpraszanie μs′ względem 530 nm','c3.kvM':'Absorpcja przez melaninę względem 530 nm','c3.kvH':'Absorpcja przez hemoglobinę względem 530 nm','c3.kv50':'Połowa wykrytego światła zawróciła powyżej','c3.kv90':'90% zawróciło powyżej',
  'c3.h3':'Dlaczego głęboki barwnik wygląda na niebieski',
  'c3.p2':'Melanina pochłania całe widmo widzialne. Blisko powierzchni wygląda na czarną lub brązową. Głębiej tkanka nad nią rozprasza krótkie (niebieskie) fale z powrotem, zanim dotrą do barwnika, a czerwień i zieleń wędrują dalej i są pochłaniane. Powracające światło przesuwa się ku niebieskiemu: szare w warstwie brodawkowatej, stalowoniebieskie w warstwie siateczkowatej (efekt Tyndalla).',
  'c3.pd':'Głębokość skupiska melaniny','c3.sc0':'W. rogowa','c3.sc1':'Naskórek','c3.sc2':'DEJ','c3.sc3':'Brodawkowata','c3.sc4':'Siateczkowata',
  'c3.note':'Wybierz 405 nm i przesuń skupisko poniżej ok. 0,3 mm: znika, tak jak znamię błękitne.',
  'sw.none':'Niewidoczne','sw.dark':'Ciemne (pochłania fiolet)','sw.black':'Czarne','sw.brown':'Brązowe','sw.grey':'Szare','sw.blue':'Niebieskie',
  'c4.kicker':'05 · Warstwy skóry','c4.h2':'Każda warstwa daje własne struktury',
  'c4.p1':'Głębokość w modelu jest rozciągnięta, żeby cienkie warstwy były widoczne: naskórek jest narysowany kilka razy grubszy niż skóra właściwa. Etykiety podają rzeczywiste głębokości.',
  'c4.peel':'Usuń tkankę od góry','c4.none':'brak','c4.h3':'Kształt naczynia to jego orientacja w 3D',
  'c4.p2':'Z góry widać tylko rzut naczynia. Pętla włośniczkowa ustawiona pionowo w brodawce jest widziana od czoła jako kropka. Pochylona pokazuje oba ramiona: spinka do włosów. Skręcona tworzy kłębuszek. Naczynie leżące płasko i rozgałęzione wygląda jak drzewko.',
  'c4.chip0':'Kropkowe · czerniak','c4.chip1':'Kłębuszkowe · ch. Bowena','c4.chip2':'Spinki do włosów · SCC','c4.chip3':'Drzewkowate · BCC',
  'c4.h3b':'Te same warstwy w barwieniu H&amp;E','c4.p3':'Wirtualny przekrój H&amp;E przez ten blok, w rzeczywistych proporcjach, wzdłuż linii zaznaczonej na obrazie dermatoskopowym. Wybierz element, aby przejść do niego na preparacie.',
  'openhist':'Otwórz przekrój H&amp;E',
  'c5.kicker':'06 · Rozpoznania','legend.N':'N niespolaryzowane','legend.P':'P spolaryzowane','legend.B':'F 405 nm','legend.hint':'jaśniej = lepiej widoczne',
  'vis.N':'N','vis.P':'P','vis.B':'F','vis.t0':'Niewidoczne','vis.t1':'Słabo','vis.t2':'Widoczne','vis.t3':'Najlepiej',
  'tab.derm':'Przez dermatoskop','tab.hist':'Przekrój H&amp;E',
  'c5.noteDerm':'Wybierz strukturę, aby przeciąć przez nią blok. Zmień rodzaj światła, żeby zobaczyć, które struktury się pojawiają, a które znikają.',
  'c5.noteHist':'Wirtualny przekrój H&amp;E przez ten sam model, cięty wzdłuż przerywanej linii na pasku dermatoskopowym. Komórki są narysowane w skali (mikrometry); to schemat, a nie zeskanowany preparat. Położenie cięcia zmienisz suwakiem nad preparatem.',
  's.histo':'Histologia.','s.optic':'Optyka.','btn.cut':'Przetnij przez nią','btn.lens':'Zobacz w dermatoskopie','btn.he':'Zobacz w H&amp;E',
  'hl.absent':'Nie ma w tym przekroju · wybierz, aby przesunąć cięcie','hl.derm':'W dermatoskopii: ','hl.only':'Tylko w histologii',
  'src.lead':'Źródła:','src.tail':'Tkanki, zmiany i ścieżki fotonów to modele schematyczne, a nie obrazy pacjentów.',
  'lbl.probe':'Skupisko melaniny','dev.lens':'Soczewka · 10×','dev.ana':'Analizator, obrócony o 90°','dev.leds':'Pierścień LED','dev.pol':'Polaryzator na diodach','dev.plate':'Płytka kontaktowa','dev.fluid':'Płyn immersyjny',
  'story.photon':'foton','story.refl':'odbity od powierzchni','story.scat':'rozproszony {n}× · najgłębszy punkt {d} ({l})','story.abs':'pochłonięty przez <b>{a}</b>',
  'story.passed':'wrócił w {p}% zdepolaryzowany · <b>przeszedł przez analizator</b>','story.reached':'wrócił na zewnątrz · <b>dotarł do soczewki</b>',
  'story.blocked':'wrócił zdepolaryzowany tylko w {p}% · <b>zatrzymany przez analizator</b>','story.left':'opuścił pole widzenia',
  'lay.sc':'warstwa rogowa','lay.epi':'naskórek','lay.pap':'warstwa brodawkowata','lay.ret':'warstwa siateczkowata',
  'err':'Wystąpił błąd podczas rysowania sceny: '}};
function t(k,v){let s=(I18N[LANG]&&I18N[LANG][k])??I18N.en[k]??k;if(v)for(const q in v)s=s.split('{'+q+'}').join(v[q]);return s;}

/* absorbers named in the photon story (accusative in Polish) */
const ABS_PL={'melanin in the basal layer':'melaninę w warstwie podstawnej','keratin':'keratynę','haemoglobin in dermal blood':'hemoglobinę we krwi skóry właściwej',
  'melanin in a tumour nest':'melaninę w gnieździe nowotworu','melanin in a nest of melanocytes':'melaninę w gnieździe melanocytów','melanin in a nevus cell':'melaninę w komórce znamiennej',
  'dermal melanin':'melaninę w skórze właściwej','melanin in a streak':'melaninę w smudze','haemoglobin in a vessel':'hemoglobinę w naczyniu','haemoglobin in a blood spot':'hemoglobinę w wylewie krwawym','the melanin clump':'skupisko melaniny'};
const absName=a=>LANG==='pl'?(ABS_PL[a]||a):a;

/* skin layers */
const LAYER_PL={
  sc:{n:'Warstwa rogowa',t:'10–20 µm; na dłoniach i podeszwach znacznie grubsza',what:'Spłaszczone, martwe keratynocyty. Współczynnik załamania ≈1,55: źródło odblasku powierzchniowego.',see:'Łuska, masy keratynowe, ujścia zaskórnikopodobne, czarne kropki (melanina w warstwie rogowej), wylewy krwawe w strupie.'},
  epi:{n:'Naskórek',t:'≈50–100 µm',what:'Żywe keratynocyty, a w warstwie podstawnej melanocyty. Melanina w naskórku wygląda na czarną do ciemnobrązowej.',see:'Torbiele prosakopodobne, czarne kropki przy szerzeniu pagetoidalnym, rozlany brązowy barwnik.'},
  dej:{n:'Połączenie skórno-naskórkowe',t:'faliste, ≈0,05–0,15 mm',what:'Sople naskórka zazębiają się z brodawkami skóry właściwej. Oglądane od spodu w tym modelu połączenie tworzy plaster miodu.',see:'Siatka barwnikowa (sople dają linie, szczyty brodawek – oczka), gniazda połączeniowe jako brązowe kulki, smugi.'},
  pap:{n:'Warstwa brodawkowata',t:'do ≈0,3–0,5 mm',what:'Luźny kolagen i pętla włośniczkowa wnikająca w każdą brodawkę.',see:'Naczynia kropkowe, kłębuszkowe i w kształcie spinki do włosów; szare melanofagi (peppering); białe włóknienie; białe błyszczące struktury.'},
  ret:{n:'Warstwa siateczkowata',t:'≈1–3 mm',what:'Grube pęczki kolagenu, poziomy splot naczyniowy, mieszki włosowe.',see:'Stalowoniebieski barwnik (znamię błękitne). Mniej więcej granica tego, co rozróżnia dermatoskopia.'},
  sub:{n:'Tkanka podskórna',t:'poniżej ≈2–4 mm',what:'Zraziki tłuszczowe oddzielone przegrodami.',see:'Poza zasięgiem dermatoskopii w świetle widzialnym.'}};

/* lesions */
const PL_CASE={
  melanoma:{name:'Czerniak',sub:'szerzący się powierzchownie, cienki, inwazyjny',summary:'Asymetria struktur i barw. Ta sama melanina wygląda na czarną, brązową, szarą i niebieską, bo leży na różnych głębokościach.',s:{
    net:{name:'Atypowa siatka barwnikowa',layer:'Połączenie skórno-naskórkowe',histo:'Sople naskórka wydłużone, poszerzone i zlewające się, z atypowymi melanocytami i dużą ilością melaniny wzdłuż połączenia.',optic:'Barwnik naskórkowy: widoczny w każdym trybie, najciemniejszy i najostrzejszy w 405 nm. Linie są grube, rozgałęzione i urywają się nagle na brzegu.'},
    streaks:{name:'Nieregularne smugi (pseudonóżki)',layer:'Połączenie skórno-naskórkowe, brzeg zmiany',histo:'Zlewające się gniazda połączeniowe komórek czerniaka rosnące promieniście na obwodzie. Obecne tylko na części brzegu.',optic:'Melanina na poziomie połączenia, więc barwa brązowa do czarnej. Podejrzane jest ich ogniskowe i nierównomierne rozmieszczenie.'},
    globules:{name:'Nieregularne kropki i kulki',layer:'Od naskórka do warstwy brodawkowatej',histo:'Gniazda atypowych melanocytów różnej wielkości. Czarne kropki to melanina wysoko w naskórku (szerzenie pagetoidalne); szare leżą w skórze właściwej.',optic:'Ten sam barwnik, trzy głębokości, trzy barwy: czarna przy powierzchni, brązowa na połączeniu, szara w skórze właściwej. W 405 nm zostają tylko płytkie.'},
    veil:{name:'Niebiesko-biały welon',layer:'Warstwa rogowa + warstwa brodawkowata',depth:'powierzchnia i ≈0,15–0,45 mm',histo:'Zwarta ortokeratoza i akantoza nad dużą ilością melaniny (komórki nowotworu i melanofagi) w skórze właściwej.',optic:'Głęboka melanina daje barwę niebieską, a pogrubiała warstwa rogowa białawą mgłę jak matowe szkło. Najlepiej widoczny w świetle niespolaryzowanym.'},
    regr:{name:'Regresja: ziarnistości (peppering) i białe obszary bliznowate',layer:'Warstwa brodawkowata',histo:'Komórki nowotworu zastąpione włóknieniem; melanina pozostaje w melanofagach. Sople naskórka są spłaszczone, więc siatka zanika.',optic:'Melanofagi w warstwie brodawkowatej wyglądają na szare (drobne ziarnistości). Włóknienie jest białe.'},
    shiny:{name:'Białe błyszczące linie (struktury krystaliczne)',layer:'Warstwa brodawkowata',histo:'Przebudowany, gęsto upakowany kolagen w powierzchownej skórze właściwej.',optic:'Dwójłomny kolagen zmienia polaryzację, więc to światło przechodzi przez skrzyżowany analizator. Widoczne wyłącznie w świetle spolaryzowanym.'},
    vessels:{name:'Atypowe naczynia: kropkowe i linijne nieregularne',layer:'Warstwa brodawkowata',histo:'Nowe, nieregularne włośniczki. Pionowe pętle w brodawkach widać od czoła jako kropki, poziome – jako nieregularne linie.',optic:'Kontrast hemoglobiny jest najlepszy w świetle spolaryzowanym i bez ucisku. Płytka kontaktowa opróżnia powierzchowne naczynia.'},
    blotch:{name:'Ekscentryczna plama barwnikowa (blotch)',layer:'Od naskórka do górnej części skóry właściwej',histo:'Barwnik na całej grubości naskórka i w górnej części skóry właściwej, przesłaniający wszystkie struktury pod spodem.',optic:'Gęsty barwnik na kilku głębokościach pochłania prawie wszystko: ciemnobrązowy do czarnego w każdym trybie.'}}},
  nevus:{name:'Znamię barwnikowe',sub:'znamię złożone, łagodne',summary:'Symetria, jeden lub dwa odcienie brązu, siatka równomiernie zanikająca ku brzegowi.',s:{
    net:{name:'Typowa siatka barwnikowa',layer:'Połączenie skórno-naskórkowe',histo:'Melanina w keratynocytach podstawnych i melanocytach połączenia wzdłuż sopli naskórka. Linie to sople, jaśniejsze oczka to szczyty brodawek skóry właściwej, gdzie naskórek jest najcieńszy.',optic:'Cienkie, równomiernie rozmieszczone linie w jednym lub dwóch odcieniach brązu.'},
    glob:{name:'Regularne brązowe kulki',layer:'Połączenie skórno-naskórkowe',histo:'Gniazda komórek znamionowych na końcach sopli i tuż pod połączeniem. Podobnej wielkości, równomiernie rozłożone w centrum.',optic:'Głębokość połączenia, więc barwa brązowa. Ważniejsza od samej obecności jest ich jednorodność.'},
    fade:{name:'Siatka zanikająca na obwodzie',layer:'Połączenie skórno-naskórkowe',histo:'Mniej barwnika w obwodowych soplach. Zanikanie jest stopniowe i symetryczne dookoła.',optic:'Porównaj z nagle urwanym brzegiem siatki w czerniaku.'},
    dermal:{name:'Komórki znamienne w skórze właściwej',layer:'Warstwa brodawkowata',histo:'Komórki znamienne, które przemieściły się do skóry właściwej. Zawierają mało melaniny.',optic:'W większości niewidoczne; nadają centrum jasnobrązowy, bezstrukturalny odcień i lekko unoszą powierzchnię.'}}},
  bluenevus:{name:'Znamię błękitne',sub:'melanocyty w skórze właściwej',summary:'Cały barwnik leży głęboko, więc wszystko jest niebieskie. Naskórek nad nim jest prawidłowy.',s:{
    blue:{name:'Jednolite stalowoniebieskie zabarwienie',layer:'Warstwa siateczkowata',histo:'Silnie zbarwione, dendrytyczne melanocyty i melanofagi w środkowej i głębokiej skórze właściwej.',optic:'Skóra właściwa nad barwnikiem rozprasza niebieskie światło z powrotem, zanim dotrze ono do melaniny, a czerwień i zieleń wędrują dalej i są pochłaniane. Powracające światło jest niebieskie. W 405 nm zmiana znika: to światło nie dociera tak głęboko.'},
    net:{name:'Niezmieniony naskórek',layer:'Naskórek i połączenie',histo:'Prawidłowe sople naskórka; brak komponentu połączeniowego.',optic:'Delikatna siatka tła przebiega bez zmian: na połączeniu nic się nie dzieje.'}}},
  bcc:{name:'Rak podstawnokomórkowy',sub:'guzkowy, częściowo barwnikowy',summary:'Brak siatki. Naczynia i niebieskoszare gniazda nowotworu w skórze właściwej, widoczne przez ścieńczały naskórek.',s:{
    arbor:{name:'Naczynia drzewkowate',layer:'Powierzchowna skóra właściwa nad guzem',histo:'Poszerzone, rozgałęzione naczynia leżące płasko w skórze właściwej tuż nad guzem, pod rozciągniętym, ścieńczałym naskórkiem.',optic:'Leżą równolegle do powierzchni i blisko niej, dlatego są ostre i drzewkowate: grube pnie zwężające się w cienkie gałązki.'},
    ovoid:{name:'Niebieskoszare owalne gniazda',layer:'Warstwa brodawkowata do górnej części siateczkowatej',histo:'Duże, zawierające barwnik gniazda nowotworu w skórze właściwej.',optic:'Melanina w skórze właściwej przyjmuje barwę niebieskoszarą. W 405 nm gniazda bledną.'},
    glob:{name:'Liczne niebieskoszare kulki',layer:'Warstwa brodawkowata',histo:'Małe gniazda nowotworu zawierające barwnik.',optic:'Ta sama zasada barwy co w owalnych gniazdach, tylko mniejsze i rozproszone.'},
    leaf:{name:'Struktury liściopodobne',layer:'Górna część skóry właściwej na brzegu',histo:'Barwnikowe gniazda nowotworu na obwodzie, nadal połączone z naskórkiem, tworzące pękate płaty.',optic:'Brązowoszare do niebieskoszarych płaty, które nigdy nie łączą się w siatkę.'},
    ulcer:{name:'Owrzodzenie',layer:'Utrata naskórka',depth:'powierzchnia',histo:'Ubytek naskórka nad guzem, pokryty strupem z surowicy i krwi.',optic:'Czerwonopomarańczowy do ciemnoczerwonego obszar bezstrukturalny bez przyczyny urazowej.'},
    shiny:{name:'Białe błyszczące plamy i pasma',layer:'Zrąb wokół gniazd',histo:'Włóknisty zrąb otaczający gniazda nowotworu.',optic:'Tylko w świetle spolaryzowanym. Kolagen zaburza polaryzację, więc światło przechodzi przez analizator i świeci na biało.'},
    nodule:{name:'Guzek nowotworowy (przeświecające tło)',layer:'Skóra właściwa',histo:'Gniazda komórek bazaloidnych z niewielką ilością barwnika wypełniające skórę właściwą i unoszące powierzchnię.',optic:'Widoczny tylko pośrednio jako przeświecające różowobiałe tło; w świetle spolaryzowanym bezstrukturalny, biało-czerwony.'},
    net:{name:'Brak siatki barwnikowej',layer:'Połączenie skórno-naskórkowe',histo:'Naskórek jest rozciągnięty płasko nad guzkiem; sople naskórka zanikają.',optic:'Bez sopli nie ma siatki. Jej brak jest częścią rozpoznania.'}}},
  bowen:{name:'Choroba Bowena',sub:'rak kolczystokomórkowy in situ',summary:'Płaska, dobrze odgraniczona czerwona plama ze skupiskami naczyń kłębuszkowych pod łuską.',s:{
    glom:{name:'Naczynia kłębuszkowe w skupiskach',layer:'Warstwa brodawkowata, wydłużone brodawki',histo:'Kręte naczynia włosowate zwinięte w brodawkach skóry właściwej, sięgających wysoko między pogrubiałymi soplami naskórka.',optic:'Zwinięta pętla ustawiona pionowo wygląda z góry jak kłębek – stąd nazwa od kłębuszka nerkowego.'},
    scale:{name:'Białożółta łuska na powierzchni',layer:'Warstwa rogowa',depth:'powierzchnia',histo:'Hiperkeratoza i parakeratoza nad atypowym naskórkiem.',optic:'Łuska rozprasza światło na powierzchni. Płyn czyni ją częściowo przezierną; na sucho lub w świetle spolaryzowanym pozostaje biała.'},
    dots:{name:'Brązowe i szare kropki ułożone liniowo',layer:'Naskórek i warstwa brodawkowata',histo:'Melanina w atypowym naskórku (brązowe) i melanofagi pod nim (szare) w odmianach barwnikowych.',optic:'Liniowe ułożenie odpowiada soplom naskórka.'},
    net:{name:'Pogrubiały naskórek (atypia na całej grubości)',layer:'Naskórek',histo:'Atypowe keratynocyty na całej grubości naskórka; błona podstawna jest nienaruszona, więc to zmiana in situ.',optic:'Niewidoczne bezpośrednio. Wnioskuje się o tym z łuski, naczyń i płaskiej, dobrze odgraniczonej czerwonej plamy.'}}},
  scc:{name:'Rak kolczystokomórkowy',sub:'inwazyjny, rogowaciejący',summary:'Keratyna na wierzchu, wokół niej białe okręgi i pętle naczyń z białą obwódką.',s:{
    ker:{name:'Masy keratynowe',layer:'Warstwa rogowa',depth:'powierzchnia, grubość do ≈0,35 mm',histo:'Gruby strup keratynowy wytwarzany przez dobrze zróżnicowany nowotwór.',optic:'Białożółte i bezstrukturalne. Leżą na wierzchu, więc widać je w każdym trybie, nawet na suchej skórze.'},
    wc:{name:'Białe okręgi',layer:'Naskórek wokół mieszków włosowych',histo:'Akantotyczne lejki mieszków włosowych z hipergranulozą: pogrubiały, rogowaciejący nabłonek wokół ujść mieszków.',optic:'Białe pierścienie wokół żółtego czopu keratynowego. Silna wskazówka na raka kolczystokomórkowego, a nie podstawnokomórkowego.'},
    blood:{name:'Wylewy krwawe na keratynie',layer:'Warstwa rogowa',depth:'powierzchnia',histo:'Krwotok uwięziony w keratynie lub w drobnych nadżerkach.',optic:'Czerwonoczarne kropki i grudki na białożółtym strupie.'},
    hairpin:{name:'Naczynia w kształcie spinki do włosów i linijne nieregularne z białą obwódką',layer:'Warstwa brodawkowata',histo:'Wydłużone pętle włośniczkowe w brodawkach płacików nowotworu, otoczone rogowaciejącymi komórkami nowotworu (biała obwódka).',optic:'Pochylona pętla pokazuje z góry oba ramiona: spinkę do włosów. Najlepiej widoczne w świetle spolaryzowanym.'},
    white:{name:'Białe obszary bezstrukturalne',layer:'Powierzchowna skóra właściwa',histo:'Rogowacenie i włóknienie zrębu wokół nowotworu.',optic:'Jaśniejsze w świetle spolaryzowanym.'},
    lobules:{name:'Naciekające płaciki rogowaciejące',layer:'Skóra właściwa',histo:'Pasma atypowych keratynocytów z perłami rogowymi naciekające skórę właściwą.',optic:'Za głęboko, by je zobaczyć. Unoszą powierzchnię, tworząc guzek.'}}},
  sk:{name:'Rogowacenie łojotokowe',sub:'łagodna zmiana keratynocytowa',summary:'Struktury keratynowe w pogrubiałym naskórku: torbiele, czopy i szczeliny, z ostrym brzegiem.',s:{
    milia:{name:'Torbiele prosakopodobne',layer:'Naskórek',histo:'Śródnaskórkowe pseudotorbiele rogowe: kulki keratyny w pogrubiałym naskórku.',optic:'Jasne, białożółte „gwiazdki” w świetle niespolaryzowanym; w spolaryzowanym znacznie słabsze. Małe wyglądają jak gwiazdy, duże jak chmury.'},
    comedo:{name:'Ujścia zaskórnikopodobne',layer:'Od warstwy rogowej w głąb naskórka',histo:'Wypełnione keratyną wpuklenia naskórka otwarte na powierzchnię. Utleniona keratyna jest brązowa do czarnej.',optic:'Okrągłe do owalnych brązowoczarne czopy, najwyraźniejsze w świetle niespolaryzowanym.'},
    gyri:{name:'Szczeliny i grzbiety (wzór mózgopodobny)',layer:'Powierzchnia i warstwa rogowa',depth:'powierzchnia',histo:'Brodawczakowata powierzchnia pofałdowana w zakręty; keratyna zbiera się w bruzdach.',optic:'Ciemne, wygięte bruzdy między jaśniejszymi grzbietami: wzór mózgopodobny.'},
    hairpin:{name:'Naczynia w kształcie spinki do włosów z białą obwódką',layer:'Brodawki w pogrubiałym naskórku',histo:'Pętle włośniczkowe w wydłużonych brodawkach, otoczone rogowaciejącymi komórkami.',optic:'Pochylone pętle widziane jako spinki; obwódka to otaczający je rogowaciejący nabłonek.'},
    border:{name:'Ostry, „nadgryziony” brzeg',layer:'Cały naskórek',histo:'Rozrost naskórka kończy się nagle, z drobnymi wcięciami wzdłuż brzegu.',optic:'Brzeg jak przyklejony, z wklęsłymi „nadgryzieniami”; bez zanikania, inaczej niż w znamieniu.'}}},
  df:{name:'Włókniak twardy (dermatofibroma)',sub:'łagodna zmiana włóknisto-histiocytarna',summary:'Białe, włókniste centrum z delikatną brązową siatką na obwodzie.',s:{
    patch:{name:'Centralna biała plama bliznowata',layer:'Warstwa brodawkowata',histo:'Włóknienie powierzchownej skóry właściwej nad rozrostem włóknisto-histiocytarnym.',optic:'Gęsty kolagen rozprasza wszystkie długości fal: barwa biała. Jaśniejsza i bardziej błyszcząca w świetle spolaryzowanym.'},
    net:{name:'Delikatna siatka obwodowa',layer:'Połączenie skórno-naskórkowe',histo:'Hiperpigmentacja warstwy podstawnej nad pogrubiałym naskórkiem z szerokimi, płaskimi soplami.',optic:'Cienkie jasnobrązowe linie tworzące pierścień wokół białego centrum.'},
    shiny:{name:'Białe błyszczące linie',layer:'Warstwa brodawkowata',histo:'Pęczki kolagenu w powierzchownej skórze właściwej.',optic:'Tylko w świetle spolaryzowanym.'},
    fibro:{name:'Rozrost włóknisto-histiocytarny w skórze właściwej',layer:'Warstwa brodawkowata i siateczkowata',histo:'Komórki wrzecionowate i kolagen w skórze właściwej; pociąga naskórek (objaw dołka przy ściśnięciu).',optic:'Za głęboko, by widzieć strukturę; to on sprawia, że centrum jest białe i twarde.'}}},
  plain:{name:'Skóra prawidłowa',sub:'odniesienie',summary:'',s:{}}};

/* virtual H&E items */
const H_PL={
  normal:{sc:['Warstwa rogowa','Bezjądrowa keratyna w luźnych warstwach o układzie koszyczkowym. Jej granica z powietrzem odpowiada za odblask.'],
    granular:['Warstwa ziarnista','Jeden do trzech rzędów spłaszczonych komórek z fioletowymi ziarnami keratohialiny, tuż pod keratyną.'],
    spinous:['Warstwa kolczysta','Wielokątne keratynocyty z różową cytoplazmą i okrągłymi jądrami, spłaszczające się ku górze.'],
    basal:['Warstwa podstawna i czapeczki melaninowe','Keratynocyty podstawne gromadzą melaninę w postaci brązowych czapeczek nad jądrami. Wzdłuż sopli naskórka tworzy to siatkę barwnikową.'],
    rete:['Sopel naskórka','Wpuklenie naskórka w głąb. Zbarwione sople widziane z góry to linie siatki.'],
    papilla:['Brodawka skórna z pętlą włośniczkową','Skóra właściwa wnikająca między sople. Jej cienkie naskórkowe sklepienie to oczko siatki; pętla włośniczkowa widziana z góry od czoła to naczynie kropkowe.'],
    plexus:['Powierzchowny splot naczyniowy','Poziome naczynia na granicy warstwy brodawkowatej i siateczkowatej, zaopatrujące pętle powyżej.'],
    retdermis:['Warstwa siateczkowata','Grube, faliste pęczki kolagenu z nielicznymi komórkami.'],
    follicle:['Mieszek włosowy','Pochewka nabłonkowa wokół łodygi włosa, kończąca się cebulką głęboko w skórze właściwej.'],
    sebaceous:['Zraziki gruczołu łojowego','Jasne, pieniste komórki wypełnione lipidami, uchodzące do mieszka.'],
    eccrine:['Kłębek gruczołu potowego ekrynowego','Przewodziki gruczołu potowego głęboko w skórze właściwej.'],
    fat:['Tkanka tłuszczowa podskórna','Adipocyty opróżnione podczas obróbki tkanki: zostają tylko błony komórkowe i przegrody.']},
  melanoma:{lentig:['Lentiginozowy rozrost melanocytów','Pojedyncze atypowe melanocyty zagęszczone w warstwie podstawnej, każdy z jasnym rąbkiem.'],
    pagetoid:['Szerzenie pagetoidalne','Atypowe melanocyty rozsiane pojedynczo w wyższych warstwach naskórka. Barwnik leżący tak wysoko daje czarne kropki.'],
    jnest:['Nieregularne gniazda połączeniowe','Gniazda różnej wielkości i w różnych odstępach wzdłuż połączenia, nieograniczone do końców sopli. Zlewające się na brzegu tworzą smugi.'],
    dermal:['Naciek skóry właściwej i melanofagi','Komórki nowotworu i makrofagi obładowane barwnikiem w warstwie brodawkowatej: źródło barwy niebieskiej.'],
    orthok:['Zwarta ortokeratoza','Gęsta keratyna nad obszarem barwnikowym: biaława mgła welonu.'],
    regress:['Regresja','Włóknienie z limfocytami i melanofagami. Sople naskórka są spłaszczone, więc siatka zanika.'],
    neo:['Nowotworzenie naczyń','Nieregularne naczynia włosowate w warstwie brodawkowatej.']},
  nevus:{jnest:['Gniazda połączeniowe na końcach sopli','Okrągłe, równomiernie rozmieszczone gniazda tam, gdzie kończą się sople.'],
    basalL:['Zbarwiona warstwa podstawna','Równomiernie zbarwione komórki podstawne wzdłuż regularnych sopli: typowa siatka.'],
    maturation:['Dojrzewanie wraz z głębokością','Komórki znamienne w skórze właściwej są coraz mniejsze i tracą barwnik w miarę schodzenia w głąb.']},
  bluenevus:{dendritic:['Barwnikowe melanocyty dendrytyczne','Wydłużone, silnie zbarwione komórki między pęczkami kolagenu środkowej i głębokiej skóry właściwej.'],
    sclerosis:['Melanofagi wśród zsklerotyzowanego kolagenu','Makrofagi obładowane barwnikiem wśród pogrubiałego kolagenu wokół melanocytów.'],
    basalL:['Niezmieniony naskórek','Prawidłowe połączenie skórno-naskórkowe i naskórek nad zmianą.']},
  bcc:{palisade:['Palisadowe ułożenie jąder na obwodzie','Jądra na brzegu każdego gniazda bazaloidnego układają się obok siebie jak palisada.'],
    cleft:['Szczelina retrakcyjna','Szpara między gniazdami nowotworu a zrębem, charakterystyczna dla raka podstawnokomórkowego.'],
    stroma:['Zrąb włóknisto-śluzowy','Zrąb nowotworu wokół gniazd. Jego kolagen daje białe błyszczące obszary w świetle spolaryzowanym.'],
    pignest:['Gniazdo z barwnikiem','Melanina w gniazdach nowotworu i melanofagi wokół nich: niebieskoszare owalne gniazda.'],
    vessel:['Poszerzone powierzchowne naczynie','Duże naczynia biegnące płasko tuż pod ścieńczałym naskórkiem: naczynia drzewkowate.'],
    ulcer:['Owrzodzenie','Ubytek naskórka pokryty surowicą, włóknikiem, neutrofilami i krwią.'],
    epiL:['Ścieńczały naskórek','Rozciągnięty płasko nad guzkiem, bez sopli: brak siatki.']},
  bowen:{epiL:['Atypia na całej grubości naskórka','Stłoczone, pleomorficzne keratynocyty bez dojrzewania od podstawy do powierzchni.'],
    dysk:['Komórka dyskeratotyczna','Pojedynczy keratynocyt przedwcześnie rogowaciejący: jaskraworóżowy, z obkurczonym jądrem.'],
    mitosis:['Figura podziału ponad warstwą podstawną','Dzielące się komórki wysoko w naskórku – cecha atypii.'],
    para:['Parakeratoza','Keratyna z zachowanymi spłaszczonymi jądrami: łuska.'],
    glomvessels:['Kręte naczynia w brodawkach','Jedna zwinięta włośniczka przecięta kilkakrotnie w obrębie brodawki: naczynia kłębuszkowe.'],
    basalL:['Nienaruszona błona podstawna','Brak naciekania skóry właściwej: to rak in situ.']},
  scc:{keratin:['Strup keratynowy','Gruba orto- i parakeratoza wytwarzana przez nowotwór.'],
    blood:['Krwotok w strupie','Erytrocyty uwięzione w keratynie.'],
    infund:['Akantotyczny lejek mieszka włosowego','Pogrubiały, rogowaciejący nabłonek wokół ujścia mieszka: biały okrąg.'],
    invasive:['Naciekające gniazda raka płaskonabłonkowego','Atypowe keratynocyty ze szklistą, różową cytoplazmą naciekające skórę właściwą, otoczone limfocytami.'],
    pearl:['Perła rogowa','Koncentryczne rogowacenie wewnątrz gniazda.'],
    hairpinv:['Naczynia brodawek','Wydłużone włośniczki między płacikami nowotworu: naczynia w kształcie spinki do włosów.']},
  sk:{horncyst:['Pseudotorbiel rogowa','Kulka warstwowej keratyny w obrębie naskórka: torbiel prosakopodobna.'],
    invag:['Wpuklenie wypełnione keratyną','Czop keratynowy otwarty na powierzchnię, utleniony u góry: ujście zaskórnikopodobne.'],
    epiL:['Keratynocyty bazaloidne','Małe, jednorodne komórki z niewielką ilością cytoplazmy; rozsiana między nimi melanina nadaje brązowy kolor.'],
    scL:['Brodawczakowatość i hiperkeratoza','Pofałdowana powierzchnia z keratyną w szczelinach: szczeliny i grzbiety.'],
    basalL:['Płaska podstawa','Rozrost spoczywa na płaskiej linii, na poziomie sąsiedniego naskórka (string sign).'],
    hairpinv:['Naczynia w brodawkach','Pętle włośniczkowe w brodawkach otoczone keratynocytami: naczynia w kształcie spinki do włosów z białą obwódką.']},
  df:{basalL:['Hiperpigmentacja warstwy podstawnej','Szerokie, płaskie, zbarwione sople nad zmianą („dirty fingers”): delikatna siatka.'],
    grenz:['Strefa Grenza (Grenz zone)','Wąskie pasmo niezmienionej warstwy brodawkowatej pod naskórkiem.'],
    fibrosis:['Włóknienie powierzchowne','Gęsty kolagen pod naskórkiem: centralna biała plama.'],
    storiform:['Komórki wrzecionowate w układzie storiform','Komórki fibroblastopodobne i histiocytarne ułożone w krótkie wiry.'],
    trapping:['Uwięzienie kolagenu (collagen trapping)','Grube pęczki kolagenu otoczone komórkami wrzecionowatymi na obwodzie zmiany.']}};

/* accessors */
const nf=s=>LANG==='pl'?String(s).replace(/(\d)\.(\d)/g,'$1,$2'):String(s);
function caseName(id){return LANG==='pl'&&PL_CASE[id]?PL_CASE[id].name:CASES[id].name;}
function ctext(Lm,f){const p=LANG==='pl'&&PL_CASE[Lm.id];return p&&p[f]!=null?p[f]:Lm[f];}
function stext(s,f){if(LANG==='pl'&&s.pl&&s.pl[f]!=null)return s.pl[f];const p=LANG==='pl'&&L&&PL_CASE[L.id]&&PL_CASE[L.id].s[s.sid];if(p&&p[f]!=null)return p[f];return f==='depth'?nf(s[f]):s[f];}
function hiText(it,f,cid){if(LANG!=='pl')return it[f];if(it.pl)return it.pl[f==='n'?0:1];const tbl=NORMAL_TAGS.has(it.a)&&H_PL.normal[it.a]?H_PL.normal:H_PL[cid]||{};const e=tbl[it.a]||H_PL.normal[it.a];return e?e[f==='n'?0:1]:it[f];}

/* =====================================================================
   Chapter 07 · how lesions evolve. Every sequence rebuilds the same block
   of skin (same seed, same follicles, same vessels) at successive stages,
   so the only thing that changes between stages is the lesion itself.
   Texts are [English, Polish].
   ===================================================================== */
const ev=a=>Array.isArray(a)?(LANG==='pl'?a[1]:a[0]):a;
const plNum=s=>String(s).replace(/(\d)\.(\d)/g,'$1,$2');

/* surrounding skin, identical for every stage of a sequence */
function evoSkin(L,seed,o){const rng=mulberry32(seed*13+5);
  if(!o.face){const fol=scatter(rng,11,0.9,(x,z)=>Math.abs(x)<3.6&&Math.abs(z)<3.6);
    for(const[x,z]of fol){const hair=rng()<0.8,ang=rng()*TAU,len=rr(rng,0.8,2.0);if(L.R(x,z)>1.3)L.features.push({t:'follicle',x,z,hair,ang,len,sid:'bg'});}}
  const r2=mulberry32(seed*17+9);
  for(let i=0;i<5;i++)L.features.push(vLine(r2,-3.9,-3.2+i*1.6+rr(r2,-0.3,0.3),rr(r2,-0.25,0.25),8,rr(r2,0.42,0.5),0.028,0.5,'plexus','plexus'));
  for(let i=0;i<3;i++)L.features.push(vLine(r2,-3.9,-2.6+i*2.6,rr(r2,-0.2,0.2),8,rr(r2,2.1,2.3),0.07,0.3,'plexus','plexus'));}
/* facial skin: a dense, jittered grid of follicular openings */
const FOLC=0.42;
const folPt=(i,j)=>[(i+0.15+0.7*hash2(i,j,77))*FOLC,(j+0.15+0.7*hash2(i,j,84))*FOLC];
function folDist(x,z){const i0=Math.floor(x/FOLC),j0=Math.floor(z/FOLC);let m=9;for(let j=j0-1;j<=j0+1;j++)for(let i=i0-1;i<=i0+1;i++){const p=folPt(i,j),d=Math.hypot(p[0]-x,p[1]-z);if(d<m)m=d;}return m;}
function faceFollicles(L,fn){for(let j=-10;j<10;j++)for(let i=-10;i<10;i++){const[x,z]=folPt(i,j);if(Math.abs(x)>3.9||Math.abs(z)>3.9)continue;
  const o={t:'folopen',x,z,r:0.04+0.022*hash2(i,j,91),plug:0,halo:0,ros:false,sid:'fol',h:hash2(i,j,93)};if(fn(o,L.R(x,z))!==false)L.features.push(o);}}
/* helpers for structure positions */
const fpos=f=>f.pts?[f.pts[f.pts.length>>1][0],f.pts[f.pts.length>>1][2]]:[f.x,f.z];
function nearF(L,sid,x,z,pred){let b=null,bd=1e9;for(const f of L.features)if(f.sid===sid&&(!pred||pred(f))){const p=fpos(f),d=(p[0]-x)**2+(p[1]-z)**2;if(d<bd){bd=d;b=p;}}return b;}
const setF=(L,sid,x,d,z,fr=0.3)=>{L.foc[sid]=[[x,d,z],[x,z,fr]];};
const setNF=(L,sid,x,z,d,fr=0.3,pred)=>{const p=nearF(L,sid,x,z,pred);if(p)setF(L,sid,p[0],d,p[1],fr);};
const vPool=(seed,n)=>{const rng=mulberry32(seed),o=[];for(let i=0;i<n;i++)o.push({a:rng()*TAU,q:Math.sqrt(rng()),ang:rng()*TAU,u:rng(),v:rng(),w:rng(),s:(rng()*1e9)|0});return o;};
function ptPool(seed,n,R,minD){const rng=mulberry32(seed),o=[];let t=0;while(o.length<n&&t<n*60){t++;const a=rng()*TAU,q=Math.sqrt(rng())*R,x=Math.cos(a)*q,z=Math.sin(a)*q;
  if(o.every(p=>(p.x-x)**2+(p.z-z)**2>minD*minD))o.push({x,z,u:rng(),v:rng(),w:rng()});}return o;}
const pol=(a,r)=>[Math.cos(a)*r,Math.sin(a)*r];

/* common texts */
const LY={dej:['Dermo-epidermal junction','Połączenie skórno-naskórkowe'],pap:['Papillary dermis','Warstwa brodawkowata'],sc:['Stratum corneum','Warstwa rogowa'],
  epi:['Epidermis','Naskórek'],derm:['Dermis','Skóra właściwa'],surf:['surface','powierzchnia']};
const SHINY={vis:[0,3,0],depth:'≈0.12–0.3 mm',layer:LY.pap,n:['Shiny white lines','Białe błyszczące linie'],h:['Altered, densely packed collagen in the superficial dermis.','Przebudowany, gęsto upakowany kolagen w powierzchownej skórze właściwej.'],
  o:['Birefringent collagen passes the crossed analyzer: polarized mode only.','Dwójłomny kolagen przepuszcza światło przez skrzyżowany analizator: widoczne tylko w świetle spolaryzowanym.']};

const EVO={};
/* ============================ 1 · nevus ============================ */
const NVP={pool:ptPool(1001,170,2.05,0.13),vs:vPool(1002,12),ring:(()=>{const r=mulberry32(1003),o=[];for(let i=0;i<28;i++)o.push({a:i/28*TAU+(r()-0.5)*0.1,u:r(),v:r()});return o;})()};
EVO.nevus={seed:101,hcase:'nevus',hstyle:'nv',secZ:0.1,
  title:['Nevus: a life cycle','Znamię: cykl życia'],
  sum:['Acquired nevi appear in childhood, grow symmetrically, settle in adulthood and slowly involute. The dermoscopic pattern follows the nests of nevus cells: globular while they sit at the junction and the nevus grows, reticular in adults, structureless once the cells live in the dermis. At every stage, change is slow, orderly and symmetric.',
    'Znamiona nabyte pojawiają się w dzieciństwie, rosną symetrycznie, stabilizują się w wieku dorosłym i powoli ulegają inwolucji. Obraz dermoskopowy odzwierciedla położenie gniazd komórek znamionowych: wzorzec globularny, gdy gniazda leżą na połączeniu skórno-naskórkowym i znamię rośnie, siateczkowy u dorosłych, bezstrukturalny, gdy komórki przejdą do skóry właściwej. Na każdym etapie zmiany są powolne, uporządkowane i symetryczne.'],
  src:[['https://dermoscopedia.org/Factors_that_influence_nevus_pattern_(age,_skin_type,_body_site)','dermoscopedia, nevus pattern and age'],['https://pubmed.ncbi.nlm.nih.gov/16433800/','Zalaudek et al., Br J Dermatol 2006']],
  stages:[
    {lbl:['Child','Dziecko'],ph:['Childhood · onset','Dzieciństwo · początek'],h:['Globular start','Początek: wzorzec globularny'],grow:0.5,
      see:['A small, flat, evenly tan-brown macule. Round brown globules of similar size fill the centre like cobblestones; a faint network appears only at the rim.','Mała, płaska, równomiernie jasnobrązowa plamka. Okrągłe brązowe kulki podobnej wielkości wypełniają środek jak kostka brukowa; delikatna siatka pojawia się tylko na obwodzie.'],
      tis:['Melanocytes proliferate at the dermo-epidermal junction and cluster into nests at the tips of the rete ridges. Each nest seen from above is a globule.','Melanocyty namnażają się na połączeniu skórno-naskórkowym i skupiają w gniazda na końcach sopli naskórka. Każde gniazdo widziane z góry to kulka.'],
      key:['Globular nevi are typical of children and adolescents and rare after 60.','Znamiona o wzorcu globularnym są typowe dla dzieci i młodzieży, a rzadkie po 60. roku życia.'],
      st:['glob','net'],he:['jn','bas']},
    {lbl:['Teen','Nastolatek'],ph:['Adolescence · growth','Okres dojrzewania · wzrost'],h:['Symmetric growth','Symetryczny wzrost'],grow:1,
      see:['The nevus enlarges evenly in all directions. A regular rim of small brown globules runs around the whole edge; the centre shows a regular network.','Znamię powiększa się równomiernie we wszystkich kierunkach. Na całym obwodzie biegnie regularny wieniec drobnych brązowych kulek; w środku widać regularną siatkę.'],
      tis:['New junctional nests form at the edge, which is the active growth front. The centre is already compound: nests at the junction and in the papillary dermis.','Na brzegu, który jest frontem wzrostu, powstają nowe gniazda łącznikowe. Środek jest już znamieniem złożonym: gniazda na połączeniu i w warstwie brodawkowatej.'],
      key:['Peripheral globules mean growth. This pattern peaks between 11 and 20 years. In adults such a lesion should be monitored, and after 50 excision is advised.','Kulki na obwodzie oznaczają wzrost. Wzorzec ten najczęściej występuje między 11. a 20. rokiem życia. U dorosłych taką zmianę należy obserwować, a po 50. roku życia zaleca się jej wycięcie.'],
      st:['rim','net','glob'],he:['jnEdge','jn','bas']},
    {lbl:['Adult','Dorosły'],ph:['20–50 years · stable','20–50 lat · stabilizacja'],h:['Stable reticular nevus','Stabilne znamię siateczkowe'],grow:0,
      see:['Growth has stopped and the rim of globules is gone. A regular network thins out evenly toward the edge, with a few globules in the slightly darker centre.','Wzrost ustał i wieniec kulek zniknął. Regularna siatka równomiernie przerzedza się ku brzegowi; w nieco ciemniejszym środku kilka kulek.'],
      tis:['Compound nevus. The junctional component is quiet and follows the rete ridges; dermal nevus cells get smaller and paler with depth (maturation).','Znamię złożone. Komponent łącznikowy jest spokojny i podąża za soplami naskórka; komórki znamionowe w skórze właściwej zmniejszają się i bledną wraz z głębokością (dojrzewanie).'],
      key:['Most adult nevi are reticular or reticular-homogeneous. A nevus that stays the same over time is reassuring; the “ugly duckling” that differs from the patient’s other nevi is not.','Większość znamion u dorosłych ma wzorzec siateczkowy lub siateczkowo-jednolity. Znamię, które się nie zmienia, uspokaja; niepokoi „brzydkie kaczątko”, które wyróżnia się spośród pozostałych znamion pacjenta.'],
      st:['net','fade','glob','dermal'],he:['bas','jn','mat']},
    {lbl:['40–60','40–60'],ph:['Middle age · dermal','Wiek średni · znamię skórne'],h:['Dermal nevus','Znamię skórne (śródskórne)'],grow:0,
      see:['Raised, soft and paler: skin-coloured to light tan. The network has gone; structureless tan-pink areas with a few comma vessels and remnant globules.','Uniesione, miękkie i jaśniejsze: w kolorze skóry lub jasnobrązowe. Siatka zniknęła; bezstrukturalne jasnobrązowo-różowe obszary z kilkoma naczyniami przecinkowatymi i pozostałościami kulek.'],
      tis:['The junctional component has disappeared and the rete ridges have flattened, so nothing is left to draw a network. All nevus cells now lie in the dermis and lift the surface into a dome.','Komponent łącznikowy zanikł, a sople naskórka się spłaszczyły, więc nie ma już czego tworzyć siatki. Wszystkie komórki znamionowe leżą w skórze właściwej i unoszą powierzchnię w kopułę.'],
      key:['Comma vessels in a soft, raised, structureless lesion are the signature of a dermal nevus. A contact plate pressed on the skin empties them: look without pressure or use polarized light.','Naczynia przecinkowate w miękkiej, uniesionej, bezstrukturalnej zmianie to znak rozpoznawczy znamienia skórnego. Ucisk płytki kontaktowej je opróżnia: oglądaj bez ucisku lub w świetle spolaryzowanym.'],
      st:['struct','comma','glob','dermal'],he:['flat','mat','vess']},
    {lbl:['60+','60+'],ph:['Older age · involution','Starszy wiek · inwolucja'],h:['Fading away','Stopniowe zanikanie'],grow:0,
      see:['Paler, flatter or pedunculated and almost skin-coloured. Structureless, with few vessels and a whitish tone.','Jaśniejsze, bardziej płaskie lub uszypułowane, niemal w kolorze skóry. Bezstrukturalne, z nielicznymi naczyniami i białawym odcieniem.'],
      tis:['Nevus cells become sparse and are replaced by fibrous tissue and fat; some take on a neural look (neurotization).','Komórek znamionowych ubywa; zastępuje je tkanka włóknista i tłuszczowa, a część komórek przybiera wygląd nerwowy (neurotyzacja).'],
      key:['Nevi fade with age, and new nevi after 50 are uncommon. A new or changing pigmented lesion in an older adult is not a nevus “arriving late”: assess it as a possible melanoma.','Znamiona z wiekiem bledną, a nowe znamiona po 50. roku życia są rzadkie. Nowa lub zmieniająca się zmiana barwnikowa u starszej osoby to nie „spóźnione znamię”: oceniaj ją pod kątem czerniaka.'],
      st:['struct','fib','comma','dermal'],he:['fibz','fatz','mat']}],
  S:{glob:{vis:[3,3,2],depth:'≈0.08–0.2 mm',layer:LY.dej,n:['Brown globules','Brązowe kulki'],h:['Nests of nevus cells at the tips of the rete ridges and just below the junction.','Gniazda komórek znamionowych na końcach sopli naskórka i tuż pod połączeniem skórno-naskórkowym.'],
      o:['Junctional melanin looks brown. Uniform size and spacing make them benign; deeper remnant nests look paler.','Melanina na poziomie połączenia jest brązowa. O łagodności świadczy jednakowa wielkość i rozmieszczenie; głębsze, resztkowe gniazda są jaśniejsze.']},
    net:{vis:[3,3,3],depth:'≈0.05–0.13 mm',layer:LY.dej,n:['Regular pigment network','Regularna siatka barwnikowa'],h:['Pigmented basal keratinocytes and single melanocytes along the rete ridges; the holes are the tips of the dermal papillae.','Zbarwione keratynocyty podstawne i pojedyncze melanocyty wzdłuż sopli naskórka; oczka siatki to szczyty brodawek skóry właściwej.'],
      o:['Thin, evenly spaced brown lines. A network needs rete ridges: when they flatten, it disappears.','Cienkie, równomiernie rozmieszczone brązowe linie. Siatka wymaga sopli naskórka: gdy się spłaszczą, znika.']},
    rim:{vis:[3,3,2],depth:'≈0.07–0.11 mm',layer:['Junction at the edge','Połączenie skórno-naskórkowe na brzegu'],n:['Peripheral rim of globules','Wieniec kulek na obwodzie'],h:['New junctional nests at the growing edge.','Nowe gniazda łącznikowe na rosnącym brzegu.'],
      o:['One row of small, similar brown globules around the whole circumference. Symmetric means orderly growth; an uneven or partial rim is suspicious.','Jeden rząd małych, podobnych brązowych kulek na całym obwodzie. Symetryczny oznacza uporządkowany wzrost; nierówny lub obecny tylko na części obwodu jest podejrzany.']},
    fade:{vis:[3,3,3],depth:'≈0.05–0.1 mm',layer:LY.dej,n:['Network fading at the edge','Siatka zanikająca na obwodzie'],h:['Less melanin in the peripheral rete ridges.','Mniej melaniny w obwodowych soplach naskórka.'],
      o:['The lines thin out gradually and evenly all around, unlike the abrupt edge of melanoma.','Linie przerzedzają się stopniowo i równomiernie na całym obwodzie, w przeciwieństwie do nagle urwanego brzegu czerniaka.']},
    dermal:{vis:[1,1,0],depth:'≈0.12–0.9 mm',layer:['Papillary and upper reticular dermis','Warstwa brodawkowata i górna część siateczkowatej'],n:['Dermal nevus cells','Komórki znamionowe w skórze właściwej'],h:['Nests and cords of nevus cells that mature with depth: smaller, paler and spindled at the base.','Gniazda i pasma komórek znamionowych dojrzewających wraz z głębokością: mniejsze, jaśniejsze i wrzecionowate u podstawy.'],
      o:['Little melanin, so mostly invisible; they tint the centre tan and lift the surface.','Zawierają mało melaniny, więc są prawie niewidoczne; nadają środkowi jasnobrązowy odcień i unoszą powierzchnię.']},
    struct:{vis:[3,3,2],depth:'0–0.3 mm',layer:['Epidermis and upper dermis','Naskórek i górna część skóry właściwej'],n:['Structureless tan-pink areas','Bezstrukturalne jasnobrązowo-różowe obszary'],h:['Flat rete ridges over dermal nevus cells with light, diffuse pigment.','Spłaszczone sople naskórka nad komórkami znamionowymi w skórze właściwej, z niewielką ilością rozproszonego barwnika.'],
      o:['No network without rete ridges; the colour comes from scattered melanin and blood in the papillary dermis.','Bez sopli nie ma siatki; barwa pochodzi z rozproszonej melaniny i krwi w warstwie brodawkowatej.']},
    comma:{vis:[1,3,1],depth:'≈0.12–0.2 mm',layer:LY.pap,n:['Comma vessels','Naczynia przecinkowate'],h:['Short, slightly curved, dilated vessels between nests of dermal nevus cells.','Krótkie, lekko zakrzywione, poszerzone naczynia między gniazdami komórek znamionowych.'],
      o:['Coarse, curved and barely branching: typical of dermal nevi. Best without pressure.','Grube, zakrzywione, prawie nierozgałęzione: typowe dla znamion skórnych. Najlepiej widoczne bez ucisku.']},
    fib:{vis:[2,2,1],depth:'≈0.1–1.1 mm',layer:LY.derm,n:['Fibrosis and fat','Włóknienie i tkanka tłuszczowa'],h:['Nevus cells replaced by collagen and adipocytes; residual cells may look neural (neurotization).','Komórki znamionowe zastąpione kolagenem i adipocytami; pozostałe komórki mogą mieć wygląd nerwowy (neurotyzacja).'],
      o:['Collagen scatters all wavelengths: a pale, whitish, structureless tone.','Kolagen rozprasza wszystkie długości fali: blady, białawy, bezstrukturalny odcień.']}},
  H:{jn:{a:'jnest',m:'glob',n:['Junctional nests at rete tips','Gniazda łącznikowe na końcach sopli'],d:['Round nests of uniform melanocytes where the ridges end.','Okrągłe gniazda jednakowych melanocytów na końcach sopli naskórka.']},
    jnEdge:{a:'jnest',m:'rim',pick:'edge',n:['Junctional nests at the growing edge','Gniazda łącznikowe na rosnącym brzegu'],d:['The newest nests sit at the periphery: the rim of globules seen from above.','Najmłodsze gniazda leżą na obwodzie: z góry widać je jako wieniec kulek.']},
    bas:{a:'basalL',m:'net',n:['Pigmented basal layer','Zbarwiona warstwa podstawna'],d:['Evenly pigmented basal cells along regular ridges: the network.','Równomiernie zbarwione komórki podstawne wzdłuż regularnych sopli: siatka.']},
    mat:{a:'maturation',m:'dermal',n:['Maturation with depth','Dojrzewanie wraz z głębokością'],d:['Dermal nevus cells get smaller and lose pigment as they go deeper: a key benign feature.','Komórki znamionowe w skórze właściwej stają się mniejsze i tracą barwnik w miarę zagłębiania się: ważna cecha łagodności.']},
    flat:{a:'epiL',m:'struct',n:['Flattened epidermis','Spłaszczony naskórek'],d:['No rete ridges over the dermal nevus: this is why the network is gone.','Brak sopli naskórka nad znamieniem skórnym: dlatego siatka zniknęła.']},
    vess:{a:'neo',m:'comma',n:['Dilated papillary vessels','Poszerzone naczynia warstwy brodawkowatej'],d:['Vessels squeezed between dermal nests: the comma vessels.','Naczynia ściśnięte między gniazdami w skórze właściwej: naczynia przecinkowate.']},
    fibz:{a:'fibrosis',m:'fib',n:['Fibrosis','Włóknienie'],d:['Collagen replacing nevus cells in the involuting nevus.','Kolagen zastępujący komórki znamionowe w znamieniu ulegającym inwolucji.']},
    fatz:{a:'fatd',m:'fib',n:['Fat cells in the dermis','Adipocyty w skórze właściwej'],d:['Adipocytes among the remaining nevus cells, typical of old dermal nevi.','Komórki tłuszczowe wśród pozostałych komórek znamionowych, typowe dla starych znamion skórnych.']}},
  build(k){const R=[1.0,1.45,1.8,1.9,1.75][k],L=baseModel(101),S=makeShape(R,[[0.03,2,0.3],[0.025,3,1.1]]),F=L.features,P=NVP;L.R=rhoFn(S);L.irr=()=>0.12;L.foc={};
    const inside=(p,a)=>L.R(p.x,p.z)<a;
    if(k===0){L.netI=(x,z,r)=>0.03+0.45*inM(r,0.08)*smoothstep(0.76,0.95,r);L.netW=()=>0.12;L.rete=(x,z,r)=>0.055+0.02*inM(r,0.15);L.pig=(x,z,r)=>0.34*inM(r*1.08,0.3);L.pigD=()=>0.09;
      for(const p of P.pool)if(inside(p,0.8))F.push({t:'nest',x:p.x,z:p.z,d:0.08+0.035*p.u,r:0.05+0.025*p.v,sid:'glob'});
      setNF(L,'glob',0.1,0.1,0.1,0.35);setF(L,'net',0.8*R,0.09,0.05,0.25);}
    else if(k===1){L.elev=(x,z,r)=>0.03*inM(r,0.2);L.netI=(x,z,r)=>0.03+0.72*inM(r,0.1)*(1-0.55*smoothstep(0.62,0.9,r));L.netW=(x,z,r)=>0.13+0.04*inM(r,0.1);L.rete=(x,z,r)=>0.055+0.03*inM(r,0.12);
      L.pig=(x,z,r)=>0.36*inM(r*1.1,0.3);L.pigD=()=>0.09;
      for(const p of P.pool)if(inside(p,0.42)&&p.u<0.65)F.push({t:'nest',x:p.x,z:p.z,d:0.09+0.04*p.u,r:0.04+0.02*p.v,sid:'glob'});
      for(const q of P.ring){const r0=S(q.a)*0.9;F.push({t:'nest',x:Math.cos(q.a)*r0,z:Math.sin(q.a)*r0,d:0.08+0.02*q.u,r:0.045+0.018*q.v,sid:'rim'});}
      setNF(L,'rim',R,0,0.09,0.25);setF(L,'net',0.45,0.08,-0.4,0.3);setNF(L,'glob',0,0,0.1,0.25);}
    else if(k===2){L.elev=(x,z,r)=>0.12*Math.max(0,1-r*r);L.rete=(x,z,r)=>0.055+0.035*inM(r,0.12);L.netI=(x,z,r)=>0.03+0.86*inM(r,0.1)*(1-0.72*smoothstep(0.55,1.0,r));
      L.netW=(x,z,r)=>0.13+0.06*inM(r,0.1)*(1-r*0.6);L.pig=(x,z,r)=>0.44*inM(r*1.25,0.3);L.pigD=()=>0.1;
      for(const p of P.pool)if(inside(p,0.33)&&p.u<0.55)F.push({t:'nest',x:p.x,z:p.z,d:0.1+0.04*p.u,r:0.045+0.02*p.v,sid:'glob'});
      F.push({t:'cloud',x:0,z:0,rx:0.95,rz:0.95,d0:0.14,d1:0.4,n:240,size:0.034,c3:'#B78768',s2:'none',sid:'dermal'});
      setF(L,'net',0.5*R,0.09,0.25,0.35);setF(L,'fade',-0.9*R,0.08,0.1,0.3);setNF(L,'glob',0,0,0.12,0.25);setF(L,'dermal',0,0.26,0,0.8);}
    else{const inv=k===4;L.elev=(x,z,r)=>(inv?0.24:0.46)*Math.pow(Math.max(0,1-r*r),inv?0.8:0.7);L.rete=(x,z,r)=>0.055-0.028*inM(r,0.12);L.netI=(x,z,r)=>0.03*(1-inM(r,0.1));
      L.pig=inv?(x,z,r)=>0.1*inM(r,0.3):(x,z,r)=>inM(r,0.25)*(0.2+0.14*fbm(x*1.1,z*1.1,57,2));L.pigD=()=>inv?0.12:0.11;L.ery=(x,z,r)=>(inv?0.12:0.24)*inM(r,0.2);
      if(!inv)for(const p of P.pool)if(inside(p,0.5)&&p.u<0.22)F.push({t:'nest',x:p.x,z:p.z,d:0.15+0.05*p.u,r:0.04+0.02*p.v,sid:'glob'});
      for(let i=0;i<(inv?4:10);i++){const v=P.vs[i],x=Math.cos(v.a)*(0.15+v.q*0.6)*R,z=Math.sin(v.a)*(0.15+v.q*0.6)*R;F.push(vLine(mulberry32(v.s),x,z,v.ang,0.24+0.1*v.u,0.14+0.03*v.u,inv?0.012:0.015,0.9,'comma','comma'));}
      F.push({t:'cloud',x:0,z:0,rx:inv?1.05:1.25,rz:inv?1.05:1.25,d0:0.12,d1:inv?0.7:0.9,n:inv?150:560,size:0.036,c3:inv?'#CDB39E':'#C8A48E',s2:'none',sid:'dermal',shape:(x,z)=>L.R(x,z)<0.95});
      if(inv){F.push({t:'scar',x:0.05,z:-0.05,r:1.1,a:0.26,sid:'fib'});F.push({t:'fatd',x:0,z:0,r:0.9,d0:0.3,d1:1.0,n:70,sid:'fib'});setF(L,'fib',0.1,0.3,0.1,0.9);}
      else setNF(L,'glob',0,0,0.17,0.25);
      setF(L,'struct',0.5,0.05,0.35,0.55);setNF(L,'comma',0.3,0.3,0.15,0.3);setF(L,'dermal',0,0.4,0,1.0);}
    return L;}};

/* ============================ 2 · melanoma ============================ */
const MMP={pool:ptPool(2002,260,2.4,0.11),vs:vPool(2003,40)};
const MMH=[[0.13,2,0.8],[0.10,3,2.1],[0.06,5,0.4],[0.035,7,1.9]],MVC=[0.75,0.4],MRC=[-0.75,1.0],MBC=[-0.85,-0.55];
const MM_BR=[0,0.5,0.9,1.8,3.0];
EVO.melanoma={seed:202,hcase:'melanoma',hstyle:'mm',secZ:MVC[1],
  title:['Melanoma: from radial to vertical growth','Czerniak: od wzrostu horyzontalnego do wertykalnego'],
  sum:['Superficial spreading melanoma first grows sideways within the epidermis (radial growth phase), then invades the dermis and finally forms a nodule that grows downward (vertical growth phase). Each step adds dermoscopic structures and depth. Breslow thickness, measured on histology from the top of the granular layer to the deepest tumour cell, is the strongest prognostic factor. About 30% of melanomas arise in a pre-existing nevus; most arise in normal skin.',
    'Czerniak szerzący się powierzchownie najpierw rośnie na boki w obrębie naskórka (faza wzrostu horyzontalnego), potem nacieka skórę właściwą, a w końcu tworzy guzek rosnący w głąb (faza wzrostu wertykalnego). Każdy etap dodaje nowe struktury dermoskopowe i głębokość. Grubość wg Breslowa, mierzona w badaniu histopatologicznym od górnej granicy warstwy ziarnistej do najgłębiej położonej komórki nowotworu, jest najsilniejszym czynnikiem rokowniczym. Około 30% czerniaków powstaje w istniejącym wcześniej znamieniu; większość – w niezmienionej skórze.'],
  src:[['https://pmc.ncbi.nlm.nih.gov/articles/PMC5978683/','Gershenwald et al., AJCC 8th edition, CA Cancer J Clin 2017'],['https://pubmed.ncbi.nlm.nih.gov/28864306/','Pampena et al., nevus-associated melanoma, JAAD 2017'],['https://dermoscopedia.org/Melanoma','dermoscopedia, melanoma']],
  note:['Clark level is shown for teaching only; AJCC 8th edition T categories use Breslow thickness and ulceration.','Poziom Clarka podano wyłącznie w celach dydaktycznych; kategorie T wg AJCC (8. wydanie) opierają się na grubości wg Breslowa i obecności owrzodzenia.'],
  stages:[
    {lbl:['pTis','pTis'],ph:['In situ · radial growth','In situ · wzrost horyzontalny'],h:['Melanoma in situ','Czerniak in situ'],grow:1,pT:'pTis',clark:'I',br:0,
      see:['A flat, slightly asymmetric macule in two shades of brown. The network is irregular: thicker and darker in places, ending abruptly at part of the edge. A few black dots lie off-centre.','Płaska, nieco asymetryczna plamka w dwóch odcieniach brązu. Siatka jest nieregularna: miejscami grubsza i ciemniejsza, na części obwodu nagle się urywa. Kilka czarnych kropek leży ekscentrycznie.'],
      tis:['Atypical melanocytes spread along the basal layer, singly and in irregular nests, and climb upward through the epidermis (pagetoid spread). The basement membrane is intact: no dermal invasion.','Atypowe melanocyty szerzą się wzdłuż warstwy podstawnej, pojedynczo i w nieregularnych gniazdach, oraz wędrują ku górze przez naskórek (szerzenie pagetoidalne). Błona podstawna jest nienaruszona: brak naciekania skóry właściwej.'],
      key:['Excision at this stage is curative. The clues are subtle: asymmetry and a patchy, irregular network rather than any single dramatic structure.','Wycięcie na tym etapie jest leczące. Wskazówki są subtelne: asymetria i nierównomierna, nieregularna siatka, a nie pojedyncza spektakularna struktura.'],
      st:['net','dots','glob'],he:['lentig','pag','jn','bm']},
    {lbl:['pT1a','pT1a'],ph:['Thin invasive · radial growth','Cienki inwazyjny · wzrost horyzontalny'],h:['First invasion: 0.5 mm','Pierwsze naciekanie: 0,5 mm'],grow:1,pT:'pT1a',clark:'II',br:0.5,
      see:['Larger and more asymmetric, now in three colours. Irregular streaks appear at one sector of the edge, dots and globules vary in size and colour, and a small grey area of peppering marks regression.','Większa i bardziej asymetryczna, teraz w trzech barwach. Na jednym odcinku brzegu pojawiają się nieregularne smugi, kropki i kulki różnią się wielkością i barwą, a mały szary obszar ziarnistości (peppering) wskazuje na regresję.'],
      tis:['Small nests of melanoma cells have crossed the basement membrane into the papillary dermis. Lymphocytes destroy part of the tumour, leaving melanophages and fibrosis. Growth is still mostly radial.','Małe gniazda komórek czerniaka przekroczyły błonę podstawną i weszły do warstwy brodawkowatej. Limfocyty niszczą część nowotworu; pozostają melanofagi i włóknienie. Wzrost jest nadal głównie horyzontalny.'],
      key:['Breslow 0.5 mm without ulceration = pT1a. Streaks on only part of the edge and regression are among the strongest clues to melanoma.','Breslow 0,5 mm bez owrzodzenia = pT1a. Smugi obecne tylko na części obwodu i cechy regresji należą do najsilniejszych wskazówek czerniaka.'],
      st:['net','streaks','glob','dots','regr','inv'],he:['dinv','brs','pag','jn','reg']},
    {lbl:['pT1b','pT1b'],ph:['Thin invasive','Cienki inwazyjny'],h:['Blue-white structures: 0.9 mm','Struktury niebiesko-białe: 0,9 mm'],grow:0.6,pT:'pT1b',clark:'III',br:0.9,
      see:['Four or more colours. A blue-white veil covers the area with the most dermal tumour; shiny white lines appear in polarized light; dotted and linear irregular vessels; an off-centre blotch.','Cztery barwy lub więcej. Niebiesko-biały welon pokrywa obszar z największym komponentem skórnym; w świetle spolaryzowanym pojawiają się białe błyszczące linie; naczynia kropkowe i linijne nieregularne; ekscentryczna plama barwnikowa.'],
      tis:['Tumour cells and melanophages fill the papillary dermis (Clark III) under a thickened, compact stratum corneum. New irregular vessels and altered collagen appear.','Komórki nowotworu i melanofagi wypełniają warstwę brodawkowatą (Clark III) pod pogrubiałą, zbitą warstwą rogową. Pojawiają się nowe nieregularne naczynia i przebudowany kolagen.'],
      key:['Breslow 0.8–1.0 mm = pT1b, the threshold at which sentinel lymph node biopsy is discussed. Blue-white structures signal a substantial dermal component.','Breslow 0,8–1,0 mm = pT1b; od tego progu rozważa się biopsję węzła wartowniczego. Struktury niebiesko-białe świadczą o istotnym komponencie skórnym.'],
      st:['net','veil','shiny','vessels','streaks','glob','regr','blotch'],he:['dinv','brs','ortho','reg','neo']},
    {lbl:['pT2a','pT2a'],ph:['Vertical growth phase','Faza wzrostu wertykalnego'],h:['A nodule arises: 1.8 mm','Powstaje guzek: 1,8 mm'],grow:0.3,pT:'pT2a',clark:'IV',br:1.8,
      see:['A raised blue-black nodule grows inside the flat lesion. Over it the network is gone; milky-red areas and polymorphous vessels (dotted, linear irregular, hairpin) appear. The flat part keeps its streaks and regression.','W obrębie płaskiej zmiany rośnie uniesiony, niebiesko-czarny guzek. Nad nim siatka zanika; pojawiają się mleczno-czerwone obszary i naczynia polimorficzne (kropkowe, linijne nieregularne, w kształcie spinki do włosów). Płaska część zachowuje smugi i cechy regresji.'],
      tis:['An expansile nodule of atypical epithelioid melanocytes with mitoses pushes into the reticular dermis (Clark IV). The cells do not mature with depth: the opposite of a nevus.','Rozprężający guzek atypowych, epitelioidnych melanocytów z figurami podziału wnika do warstwy siateczkowatej (Clark IV). Komórki nie dojrzewają wraz z głębokością – odwrotnie niż w znamieniu.'],
      key:['Breslow 1.01–2.0 mm without ulceration = pT2a. A new palpable nodule in a pigmented lesion is a red flag: the vertical growth phase carries metastatic potential.','Breslow 1,01–2,0 mm bez owrzodzenia = pT2a. Nowy wyczuwalny guzek w zmianie barwnikowej to sygnał alarmowy: faza wzrostu wertykalnego niesie potencjał przerzutowy.'],
      st:['nodule','milky','poly','veil','streaks','regr','net'],he:['nod','mit','brs','ortho','neo']},
    {lbl:['pT3b','pT3b'],ph:['Advanced · ulcerated','Zaawansowany · owrzodzenie'],h:['Ulceration: 3.0 mm','Owrzodzenie: 3,0 mm'],grow:0,pT:'pT3b',clark:'V',br:3.0,
      see:['The nodule is larger and ulcerated, with red-black crust and blood. Milky-red areas and polymorphous vessels dominate; specific melanocytic structures survive only at the edges.','Guzek jest większy i owrzodziały, pokryty czerwono-czarnym strupem i krwią. Dominują mleczno-czerwone obszary i naczynia polimorficzne; swoiste struktury melanocytowe przetrwały tylko na brzegach.'],
      tis:['The epidermis over the tumour is lost. In this model the nodule reaches the subcutis (Clark V). Breslow thickness is measured from the ulcer base.','Naskórek nad guzem uległ zniszczeniu. W tym modelu guzek sięga tkanki podskórnej (Clark V). Grubość wg Breslowa mierzy się od dna owrzodzenia.'],
      key:['Ulceration upstages every T category (T3a → T3b). Late melanomas lose their specific structures and can look like any bleeding nodule: search the edge for residual network, streaks or regression.','Owrzodzenie podwyższa każdą kategorię T (T3a → T3b). Późne czerniaki tracą swoiste struktury i mogą wyglądać jak każdy krwawiący guzek: szukaj na brzegu resztek siatki, smug lub regresji.'],
      st:['ulc','nodule','milky','poly','regr','streaks'],he:['ulc','nod','mit','brs']}],
  S:{net:{vis:[3,3,3],depth:'≈0.05–0.15 mm',layer:LY.dej,n:['Atypical pigment network','Atypowa siatka barwnikowa'],h:['Elongated, irregular rete ridges carrying atypical melanocytes and heavy melanin.','Wydłużone, nieregularne sople naskórka z atypowymi melanocytami i dużą ilością melaniny.'],
      o:['Thick, branched, uneven lines that end abruptly at part of the edge. Crisp at 405 nm.','Grube, rozgałęzione, nierówne linie, na części obwodu nagle urwane. Ostre w 405 nm.']},
    dots:{vis:[3,3,3],depth:'≈0.02–0.04 mm',layer:['Upper epidermis','Górna część naskórka'],n:['Irregular black dots','Nieregularne czarne kropki'],h:['Melanin carried high in the epidermis by pagetoid melanocytes.','Melanina wyniesiona wysoko w naskórku przez melanocyty szerzące się pagetoidalnie.'],
      o:['Pigment this shallow looks black. Off-centre and irregular in melanoma; central and regular in nevi.','Barwnik leżący tak płytko wygląda na czarny. W czerniaku ekscentryczny i nieregularny; w znamionach centralny i regularny.']},
    glob:{vis:[3,3,2],depth:'≈0.02–0.25 mm',layer:['Epidermis to papillary dermis','Od naskórka do warstwy brodawkowatej'],n:['Irregular dots and globules','Nieregularne kropki i kulki'],h:['Nests of atypical melanocytes of different sizes at different depths.','Gniazda atypowych melanocytów różnej wielkości na różnych głębokościach.'],
      o:['Black near the surface, brown at the junction, grey in the dermis: one pigment, three depths.','Czarne przy powierzchni, brązowe na połączeniu, szare w skórze właściwej: jeden barwnik, trzy głębokości.']},
    streaks:{vis:[3,3,3],depth:'≈0.05–0.12 mm',layer:['Junction at the edge','Połączenie skórno-naskórkowe na brzegu'],n:['Irregular streaks','Nieregularne smugi'],h:['Confluent junctional nests of melanoma cells growing radially at the periphery.','Zlewające się gniazda łącznikowe komórek czerniaka rosnące promieniście na obwodzie.'],
      o:['Radial lines or pseudopods on only part of the edge: the footprint of asymmetric radial growth.','Promieniste linie lub pseudonóżki tylko na części obwodu: ślad asymetrycznego wzrostu horyzontalnego.']},
    regr:{vis:[3,2,1],depth:'≈0.15–0.3 mm',layer:LY.pap,n:['Regression: peppering and white areas','Regresja: ziarnistości i białe obszary'],h:['Lymphocytes destroy part of the tumour; melanophages and fibrosis remain.','Limfocyty niszczą część nowotworu; pozostają melanofagi i włóknienie.'],
      o:['Melanin in dermal macrophages looks grey (fine granules); fibrosis looks white.','Melanina w makrofagach skóry właściwej wygląda na szarą (drobne ziarnistości); włóknienie jest białe.']},
    inv:{vis:[1,1,0],depth:'≈0.25–0.5 mm',layer:LY.pap,n:['Invasive nests in the dermis','Gniazda naciekające skórę właściwą'],h:['The first melanoma cells below the basement membrane: they make the tumour invasive and set its Breslow thickness.','Pierwsze komórki czerniaka poniżej błony podstawnej: to one czynią nowotwór inwazyjnym i wyznaczają grubość wg Breslowa.'],
      o:['Too few and too deep to form a structure; at most a faint grey tone.','Zbyt nieliczne i zbyt głęboko położone, by utworzyć strukturę; najwyżej słaby szary odcień.']},
    veil:{vis:[3,2,1],depth:['surface and ≈0.15–0.8 mm','powierzchnia i ≈0,15–0,8 mm'],layer:['Stratum corneum + papillary dermis','Warstwa rogowa + warstwa brodawkowata'],n:['Blue-white veil','Niebiesko-biały welon'],h:['Compact orthokeratosis over dense melanin (tumour cells and melanophages) in the dermis.','Zbita ortokeratoza nad dużą ilością melaniny (komórki nowotworu i melanofagi) w skórze właściwej.'],
      o:['Deep melanin gives the blue; thickened keratin adds the white haze. Best seen non-polarized.','Głęboka melanina daje barwę niebieską, pogrubiała warstwa rogowa białawą mgłę. Najlepiej widoczny w świetle niespolaryzowanym.']},
    shiny:SHINY,
    vessels:{vis:[1,3,1],depth:'≈0.1–0.35 mm',layer:LY.pap,n:['Dotted and linear irregular vessels','Naczynia kropkowe i linijne nieregularne'],h:['New, irregular capillaries of the tumour.','Nowe, nieregularne włośniczki nowotworu.'],o:['Best in polarized light without pressure.','Najlepiej widoczne w świetle spolaryzowanym, bez ucisku.']},
    blotch:{vis:[3,3,2],depth:'≈0.02–0.2 mm',layer:['Epidermis to upper dermis','Od naskórka do górnej części skóry właściwej'],n:['Off-centre blotch','Ekscentryczna plama barwnikowa'],h:['Melanin through the full thickness of the epidermis and upper dermis.','Melanina na całej grubości naskórka i w górnej części skóry właściwej.'],
      o:['Absorbs almost everything: dark brown to black in every mode.','Pochłania prawie całe światło: ciemnobrązowa do czarnej w każdym trybie.']},
    nodule:{vis:[3,3,1],depth:['junction to Breslow depth','od połączenia do głębokości wg Breslowa'],layer:['Papillary to reticular dermis and deeper','Od warstwy brodawkowatej do siateczkowatej i głębiej'],n:['Blue-black nodule','Niebiesko-czarny guzek'],h:['An expansile mass of atypical melanocytes with mitoses and no maturation: the vertical growth phase.','Rozprężająca masa atypowych melanocytów z figurami podziału i bez dojrzewania: faza wzrostu wertykalnego.'],
      o:['Melanin at many depths at once: black at the top, blue below. The whitish haze comes from compact keratin over it.','Melanina na wielu głębokościach naraz: czarna u góry, niebieska niżej. Biaława mgła pochodzi ze zbitej keratyny nad guzkiem.']},
    milky:{vis:[2,3,1],depth:'≈0.1–0.5 mm',layer:LY.pap,n:['Milky-red areas','Mleczno-czerwone obszary'],h:['Dense tumour cells and many small new vessels in an oedematous papillary dermis.','Gęsto upakowane komórki nowotworu i liczne drobne, nowe naczynia w obrzękniętej warstwie brodawkowatej.'],
      o:['Blood seen through a whitish layer of tumour: pink-white, blurred and fluffy. A sign of a thick tumour.','Krew widziana przez białawą warstwę nowotworu: różowobiała, rozmyta, „puszysta”. Znak grubego guza.']},
    poly:{vis:[1,3,1],depth:'≈0.1–0.4 mm',layer:LY.pap,n:['Polymorphous vessels','Naczynia polimorficzne'],h:['A mix of tumour vessels of different shapes feeding the nodule.','Mieszanina naczyń nowotworowych o różnych kształtach, zaopatrujących guzek.'],
      o:['Two or more vessel types together (dotted, linear irregular, hairpin): suspicious in any lesion.','Co najmniej dwa rodzaje naczyń jednocześnie (kropkowe, linijne nieregularne, w kształcie spinki do włosów): podejrzane w każdej zmianie.']},
    ulc:{vis:[3,3,3],depth:LY.surf,layer:['Epidermis lost','Utrata naskórka'],n:['Ulceration','Owrzodzenie'],h:['Full-thickness loss of epidermis over the tumour, covered by fibrin, neutrophils and blood.','Utrata naskórka na całej grubości nad guzem, pokryta włóknikiem, neutrofilami i krwią.'],
      o:['Red-black crust and blood without a history of trauma.','Czerwono-czarny strup i krew bez urazu w wywiadzie.']}},
  H:{lentig:{a:'lentig',m:'net',n:['Lentiginous melanocytes','Lentiginozowy rozrost melanocytów'],d:['Single atypical melanocytes crowd the basal layer, each in a clear halo.','Pojedyncze atypowe melanocyty zagęszczone w warstwie podstawnej, każdy z jasnym rąbkiem.']},
    pag:{a:'pagetoid',m:'dots',n:['Pagetoid spread','Szerzenie pagetoidalne'],d:['Melanocytes scattered upward through the epidermis: the black dots.','Melanocyty rozsiane ku górze przez naskórek: czarne kropki.']},
    jn:{a:'jnest',m:'glob',n:['Irregular junctional nests','Nieregularne gniazda łącznikowe'],d:['Nests of different size and spacing, not confined to the ridge tips.','Gniazda różnej wielkości i w różnych odstępach, nieograniczone do końców sopli.']},
    bm:{a:'basalL',n:['Intact basement membrane','Nienaruszona błona podstawna'],d:['All tumour cells lie above it: melanoma in situ has no Breslow thickness.','Wszystkie komórki nowotworu leżą ponad nią: czerniak in situ nie ma grubości wg Breslowa.']},
    dinv:{a:'dermal',m:'inv',n:['Invasion of the papillary dermis','Naciekanie warstwy brodawkowatej'],d:['Nests of melanoma cells and melanophages below the basement membrane.','Gniazda komórek czerniaka i melanofagi poniżej błony podstawnej.']},
    reg:{a:'regress',m:'regr',n:['Regression','Regresja'],d:['Fibrosis with lymphocytes and melanophages; the rete ridges are flattened.','Włóknienie z limfocytami i melanofagami; sople naskórka są spłaszczone.']},
    ortho:{a:'orthok',m:'veil',n:['Compact orthokeratosis','Zbita ortokeratoza'],d:['Dense keratin over the dermal pigment: the white of the veil.','Zbita keratyna nad barwnikiem w skórze właściwej: biała składowa welonu.']},
    neo:{a:'neo',m:['vessels','poly'],n:['New vessels','Nowe naczynia'],d:['Irregular capillaries in the papillary dermis.','Nieregularne włośniczki w warstwie brodawkowatej.']},
    nod:{a:'melnodule',m:'nodule',n:['Vertical growth nodule','Guzek fazy wzrostu wertykalnego'],d:['Sheets of atypical epithelioid melanocytes with mitoses and no maturation.','Lity naciek atypowych, epitelioidnych melanocytów z figurami podziału, bez dojrzewania.']},
    mit:{a:'mitmel',n:['Dermal mitoses','Figury podziału w skórze właściwej'],d:['Dividing tumour cells deep in the nodule.','Dzielące się komórki nowotworu głęboko w guzku.']},
    brs:{a:'breslow',n:['Breslow thickness','Grubość wg Breslowa'],d:['Measured from the top of the granular layer (or the ulcer base) to the deepest invasive tumour cell.','Mierzona od górnej granicy warstwy ziarnistej (lub dna owrzodzenia) do najgłębiej położonej komórki nowotworu.']},
    ulc:{a:'ulcer',m:'ulc',n:['Ulceration','Owrzodzenie'],d:['Full-thickness epidermal loss with fibrin, neutrophils and blood.','Utrata naskórka na całej grubości z włóknikiem, neutrofilami i krwią.']}},
  build(k){const R=[1.5,1.9,2.2,2.3,2.4][k],amp=[0.6,0.8,0.95,1,1][k],br=MM_BR[k],L=baseModel(202),S=makeShape(R,MMH.map(h=>[h[0]*amp,h[1],h[2]])),F=L.features,P=MMP,VC=MVC,RC=MRC,BC=MBC;L.R=rhoFn(S);L.foc={};
    const Z=()=>0,veil=k>=2?blobFn(VC[0],VC[1],k===2?0.62:0.8,0.35,2):Z,nod=k>=3?blobFn(VC[0],VC[1],k===3?0.72:0.95,0.28,3):Z,
      reg=k>=1?blobFn(RC[0],RC[1],k===1?0.38:0.55,0.35,4):Z,blot=k>=2?blobFn(BC[0],BC[1],0.45,0.3,6):Z,ul=k>=4?blobFn(VC[0]+0.05,VC[1]-0.05,0.36,0.25,8):Z;
    L.netI=(x,z,r)=>0.03+inM(r,0.05)*[0.72,0.82,0.88,0.88,0.85][k]*(0.55+0.45*fbm(x*1.2,z*1.2,91,2))*(1-0.88*veil(x,z))*(1-0.85*reg(x,z))*(1-0.5*blot(x,z))*(1-nod(x,z));
    L.irr=(x,z,r)=>lerp(0.15,0.55+0.1*k,inM(r,0.1));L.netW=(x,z,r)=>0.13+inM(r,0.1)*(0.08+0.02*k)*fbm(x*1.6,z*1.6,91,2);
    L.pig=(x,z,r)=>r>1.3?0:inM(r,0.05)*(0.13+0.42*smoothstep(0.4,0.72,fbm(x*0.8+3,z*0.8,44,3)))+0.95*blot(x,z)+(0.55*nod(x,z)+0.45*Math.pow(nod(x,z),3))*(1-ul(x,z));
    L.pigD=(x,z,r)=>r>1.3?0.07:Math.max(0.01,0.07-0.035*blot(x,z)-0.035*nod(x,z));
    L.derm=(x,z,r)=>0.8*nod(x,z)*(1-0.6*ul(x,z));L.dermD=0.55;
    L.rete=(x,z,r)=>0.055+inM(r,0.1)*0.05*fbm(x*0.7,z*0.7,63,2)-0.045*reg(x,z)-0.04*nod(x,z);
    L.epi=(x,z,r)=>(0.045+0.02*inM(r,0.1))*(1-0.95*ul(x,z));L.sc=(x,z,r)=>(0.02+0.035*veil(x,z)+0.03*nod(x,z))*(1-ul(x,z));
    L.ery=(x,z,r)=>r>1.3?0:(0.08+0.04*k)*inM(r,0.1)+0.25*reg(x,z)+0.3*nod(x,z);
    L.elev=(x,z,r)=>0.012*k*inM(r,0.2)+[0,0,0,0.55,0.85][k]*Math.pow(nod(x,z),0.8)-0.06*ul(x,z);L.ulcer=(x,z)=>ul(x,z);
    const free=(x,z)=>veil(x,z)<0.3&&nod(x,z)<0.2&&blot(x,z)<0.3;
    // black dots: pagetoid melanin
    for(const p of P.pool){const r=L.R(p.x,p.z);if(r<0.75&&p.w<[0.1,0.12,0.12,0.1,0.08][k]&&free(p.x,p.z))F.push({t:'nest',x:p.x,z:p.z,d:0.02+0.015*p.u,r:0.016+0.01*p.v,sid:'dots'});}
    // irregular globules, crowded on one side
    for(const p of P.pool){const r=L.R(p.x,p.z),a=Math.atan2(p.z,p.x);if(r<0.25||r>0.95||!free(p.x,p.z)||p.w<0.12)continue;if(!((a>1.3||a<-2.2)||p.w>0.9))continue;if(k===0&&p.w<0.55)continue;
      const d=k===0?0.07+0.03*p.u:p.u<0.25?0.02+0.015*p.v:p.u<0.8?0.07+0.05*p.v:0.17+0.07*p.v;F.push({t:'nest',x:p.x,z:p.z,d,r:0.022+0.06*p.v*p.v,sid:'glob'});}
    if(k>=1){const th=[-1.25,-1.0,-0.8,-0.5,-0.3,0.05,0.3];for(let i=0;i<(k===1?4:7);i++){const a=th[i],R0=S(a)*0.86,v=P.vs[i],x=Math.cos(a)*R0,z=Math.sin(a)*R0;if(nod(x,z)>0.1)continue;
        F.push({t:'streak',x,z,ang:a+(v.u-0.5)*0.4,len:0.3+0.35*v.v*(k===1?0.8:1),w:0.05+0.04*v.w,d:0.08,tip:v.u<0.5,sid:'streaks'});}
      const rr0=k===1?0.38:0.55;F.push({t:'scar',x:RC[0],z:RC[1],r:rr0,a:k===1?0.7:1,sid:'regr'});F.push({t:'cloud',x:RC[0],z:RC[1],rx:rr0*0.9,rz:rr0*0.88,d0:0.15,d1:0.3,n:k===1?60:110,size:0.02,c3:'#5E5A69',s2:'dots',sid:'regr'});}
    if(k===1){for(const q of[[0.6,0.4,0.28],[0.87,0.36,0.34],[0.7,0.46,0.3],[VC[0],VC[1],0.455]])F.push({t:'nest',x:q[0],z:q[1],d:q[2],r:0.045,sid:'inv'});}
    if(k>=2){F.push({t:'veil',x:VC[0],z:VC[1],r:k===2?0.62:0.8,sid:'veil'});
      F.push({t:'cloud',x:VC[0],z:VC[1],rx:0.55,rz:0.52,d0:0.14,d1:k===2?0.87:0.6,n:k===2?300:160,size:0.03,c3:'#2E2B3E',s2:'none',sid:'veil'});
      F.push({t:'collagen',x:RC[0],z:RC[1],r:0.46,d0:0.13,d1:0.3,n:34,style:'lines',sid:k===2?'shiny':'regr'});
      if(k===2)F.push({t:'collagen',x:VC[0],z:VC[1],r:0.55,d0:0.14,d1:0.26,n:40,style:'lines',sid:'shiny'});
      F.push({t:'blotch',x:BC[0],z:BC[1],r:0.45,d:0.05,sid:k===2?'blotch':'glob'});F.push({t:'cloud',x:BC[0],z:BC[1],rx:0.4,rz:0.4,d0:0.02,d1:0.2,n:200,size:0.028,c3:'#1E140F',s2:'none',sid:k===2?'blotch':'glob'});}
    if(k===2){let n=0;for(const v of P.vs){if(n>=14)break;const q=[VC,RC,[0.1,-0.1]][n%3],x=q[0]+(v.u-0.5)*0.7,z=q[1]+(v.v-0.5)*0.7;if(L.R(x,z)>0.85)continue;F.push(vLoop(mulberry32(v.s),x,z,{dTop:0.11,dBot:0.34,tilt:0.06,rad:0.012,sid:'vessels',kind:'dotted'}));n++;}
      for(let i=0;i<3;i++){const v=P.vs[20+i];F.push(vLine(mulberry32(v.s),0.1+(v.u-0.5)*0.6,-0.5+i*0.28,(v.v-0.3)*1.3,0.35+0.25*v.w,0.16,0.012,1.4,'vessels','linear'));}}
    if(k>=3){const nr=k===3?0.62:0.85;F.push({t:'tumor',kind:'mel',x:VC[0],z:VC[1],r:nr,d0:0.08,d1:br+0.03,pig:0,sid:'nodule'});
      for(let i=0;i<3+k-3;i++){const a=i*2.1+0.4,[dx,dz]=pol(a,nr*0.5);F.push({t:'milky',x:VC[0]+dx,z:VC[1]+dz,r:0.26+0.06*i,seed:41+i,sid:'milky'});}
      let n=0;for(const v of P.vs){const[dx,dz]=pol(v.a,v.q*nr*0.85),x=VC[0]+dx,z=VC[1]+dz;if(k===4&&ul(x,z)>0.3)continue;const kind=n%4;
        if(kind<2)F.push(vLoop(mulberry32(v.s),x,z,{dTop:0.1,dBot:0.3,tilt:0.06,rad:0.012,sid:'poly',kind:'dotted'}));
        else if(kind===2)F.push(vLine(mulberry32(v.s),x,z,v.ang,0.3+0.2*v.u,0.15,0.013,1.5,'poly','linear'));
        else F.push(vLoop(mulberry32(v.s),x,z,{dTop:0.1,dBot:0.38,tilt:0.75,az:v.ang,sep:0.06,rad:0.012,sid:'poly',kind:'hairpin'}));if(++n>=(k===3?16:20))break;}}
    if(k===4){F.push({t:'ulcer',x:VC[0]+0.05,z:VC[1]-0.05,r:0.36,sid:'ulc'});for(let i=0;i<5;i++){const[dx,dz]=pol(i*1.3,0.18+0.05*i);F.push({t:'blood',x:VC[0]+dx,z:VC[1]+dz,r:0.05+0.01*i,sid:'ulc'});}}
    if(br>0)L.brs={x:VC[0],z:VC[1],mm:br};
    setF(L,'net',0.6*R,0.1,-0.35*R,0.35);setNF(L,'dots',0,0,0.03,0.2);setNF(L,'glob',-0.9,0.4,0.1,0.3);setNF(L,'streaks',1.2,-1.6,0.08,0.4);
    setF(L,'regr',RC[0],0.22,RC[1],0.5);setF(L,'inv',VC[0],0.4,VC[1],0.35);setF(L,'veil',VC[0],0.25,VC[1],0.65);setF(L,'shiny',VC[0],0.2,VC[1],0.5);setNF(L,'vessels',0.1,-0.1,0.2,0.25);
    setF(L,'blotch',BC[0],0.08,BC[1],0.45);setF(L,'nodule',VC[0],Math.max(0.3,br*0.5),VC[1],k===4?0.9:0.7);setNF(L,'milky',VC[0],VC[1]+0.4,0.2,0.3);setNF(L,'poly',VC[0]+0.3,VC[1]-0.2,0.2,0.25);setF(L,'ulc',VC[0]+0.05,0.02,VC[1]-0.05,0.4);
    return L;}};

/* ============================ 3 · basal cell carcinoma ============================ */
const BCP={tel:vPool(3003,14),dots:vPool(3004,40)};
EVO.bcc={seed:303,hcase:'bcc',hstyle:'bc',secZ:0,
  title:['Basal cell carcinoma: from papule to ulcer','Rak podstawnokomórkowy: od grudki do owrzodzenia'],
  sum:['Nodular BCC grows slowly over months to years. It starts as a small, pink, shiny papule with fine vessels and enlarges into a pearly nodule with arborizing vessels; untreated, the centre breaks down into an ulcer (the old “rodent ulcer”). BCC almost never metastasizes but destroys tissue locally. Most BCCs keep their subtype: superficial BCC, a flat red scaly plaque with small erosions, is a separate pattern that spreads sideways.',
    'Guzkowy rak podstawnokomórkowy rośnie powoli, przez miesiące i lata. Zaczyna się jako mała, różowa, lśniąca grudka z drobnymi naczyniami, powiększa się w perłowy guzek z naczyniami drzewkowatymi, a nieleczony rozpada się w środku, tworząc owrzodzenie (dawniej ulcus rodens). BCC prawie nigdy nie daje przerzutów, ale niszczy tkanki miejscowo. Większość BCC zachowuje swój podtyp: powierzchowny BCC – płaska, czerwona, złuszczająca się blaszka z drobnymi nadżerkami – to odrębny wzorzec, szerzący się na boki.'],
  src:[['https://dermoscopedia.org/Basal_cell_carcinoma','dermoscopedia, basal cell carcinoma']],
  stages:[
    {lbl:['Early','Wczesny'],ph:['Months · small papule','Miesiące · mała grudka'],h:['Small pink papule','Mała różowa grudka'],grow:0.4,
      see:['A 2 mm pink, shiny, slightly translucent spot with no network. Short fine telangiectasias, a few in-focus blue-grey dots and shiny white-red structureless areas.','Różowa, lśniąca, lekko przeświecająca zmiana o średnicy 2 mm, bez siatki. Krótkie cienkie teleangiektazje, kilka ostro widocznych niebieskoszarych kropek i lśniące biało-czerwone obszary bezstrukturalne.'],
      tis:['Small buds of basaloid cells grow down from the basal layer into the papillary dermis, with peripheral palisading and a thin rim of stroma. The rete ridges over them flatten.','Małe pączki komórek bazaloidnych wrastają z warstwy podstawnej do warstwy brodawkowatej, z palisadowym układem jąder na obwodzie i wąskim rąbkiem podścieliska. Sople naskórka nad nimi się spłaszczają.'],
      key:['Small BCCs often lack typical arborizing vessels. Short fine telangiectasias and in-focus dots in a pink, shiny, network-free lesion are enough to suspect BCC.','Małe BCC często nie mają typowych naczyń drzewkowatych. Krótkie cienkie teleangiektazje i ostre kropki w różowej, lśniącej zmianie bez siatki wystarczą, by podejrzewać BCC.'],
      st:['tel','dots','shiny','buds'],he:['bud','telv','stroma','epi']},
    {lbl:['1–2 y','1–2 lata'],ph:['Year 1–2 · growing nodule','1–2 lata · rosnący guzek'],h:['Growing pearly nodule','Rosnący perłowy guzek'],grow:0.6,
      see:['Raised and pearly. The first branching (arborizing) vessels run over the surface; blue-grey globules and a first ovoid nest; shiny white blotches and strands in polarized light.','Uniesiony i perłowy. Po powierzchni biegną pierwsze rozgałęzione (drzewkowate) naczynia; niebieskoszare kulki i pierwsze owalne gniazdo; w świetle spolaryzowanym białe lśniące plamy i pasma.'],
      tis:['Nests enlarge into the dermis and detach from the epidermis. Retraction clefts separate them from a mucinous stroma; stromal vessels dilate under the stretched epidermis.','Gniazda powiększają się w głąb skóry właściwej i oddzielają od naskórka. Szczeliny retrakcyjne oddzielają je od śluzowatego podścieliska; naczynia podścieliska poszerzają się pod rozciągniętym naskórkiem.'],
      key:['Arborizing vessels are in sharp focus because they lie flat and close to the surface, stretched over the tumour.','Naczynia drzewkowate są ostre, bo leżą płasko i blisko powierzchni, rozciągnięte nad guzem.'],
      st:['arbor','glob','ovoid','shiny','tel','nodule'],he:['pal','cleft','stroma','vess','pig']},
    {lbl:['Years','Lata'],ph:['Years · nodular BCC','Lata · BCC guzkowy'],h:['Established nodular BCC','Rozwinięty BCC guzkowy'],grow:0.6,
      see:['A translucent nodule with prominent arborizing vessels, large blue-grey ovoid nests, leaf-like areas at the edge and shiny white structures. Still no network.','Przeświecający guzek z wyraźnymi naczyniami drzewkowatymi, dużymi niebieskoszarymi owalnymi gniazdami, obszarami liściopodobnymi na brzegu i białymi lśniącymi strukturami. Nadal brak siatki.'],
      tis:['Large basaloid nests fill the dermis. Pigmented nests and melanophages give the blue-grey structures; nests at the edge that are still attached to the epidermis form the leaf-like areas.','Duże gniazda bazaloidne wypełniają skórę właściwą. Zbarwione gniazda i melanofagi dają struktury niebieskoszare; gniazda na brzegu, wciąż połączone z naskórkiem, tworzą obszary liściopodobne.'],
      key:['The pigmented structures of BCC never join into a network: that absence is part of the diagnosis.','Barwnikowe struktury BCC nigdy nie łączą się w siatkę: jej brak jest częścią rozpoznania.'],
      st:['arbor','ovoid','leaf','glob','shiny','nodule'],he:['pal','cleft','pig','vess','epi']},
    {lbl:['Late','Późny'],ph:['Untreated · ulceration','Nieleczony · owrzodzenie'],h:['Ulcerated BCC','Owrzodziały BCC'],grow:0.5,
      see:['The centre breaks down into an ulcer with red-orange crust; a rolled, pearly border carries the arborizing vessels.','Środek rozpada się w owrzodzenie z czerwono-pomarańczowym strupem; wałowaty, perłowy brzeg niesie naczynia drzewkowate.'],
      tis:['The epidermis over the tumour is lost; fibrin, neutrophils and blood cover the base. The tumour keeps growing at its edges.','Naskórek nad guzem uległ zniszczeniu; dno pokrywają włóknik, neutrofile i krew. Nowotwór nadal rośnie na obwodzie.'],
      key:['Ulceration without trauma in a pearly lesion is typical of BCC. It rarely metastasizes, but neglected tumours near the eyes, nose or ears destroy deep structures.','Owrzodzenie bez urazu w perłowej zmianie jest typowe dla BCC. Rzadko daje przerzuty, ale zaniedbane guzy w okolicy oczu, nosa czy uszu niszczą głębokie struktury.'],
      st:['ulcer','arbor','ovoid','leaf','shiny','nodule'],he:['ulc','pal','cleft','pig','vess']}],
  S:{tel:{vis:[1,3,1],depth:'≈0.07–0.1 mm',layer:LY.pap,n:['Short fine telangiectasias','Krótkie cienkie teleangiektazje'],h:['Thin, short, barely branching vessels just under the epidermis.','Cienkie, krótkie, prawie nierozgałęzione naczynia tuż pod naskórkiem.'],
      o:['The small-lesion counterpart of arborizing vessels; best in polarized light without pressure.','Odpowiednik naczyń drzewkowatych w małych zmianach; najlepiej widoczne w świetle spolaryzowanym, bez ucisku.']},
    dots:{vis:[3,3,2],depth:'≈0.09–0.13 mm',layer:LY.pap,n:['In-focus blue-grey dots','Ostre niebieskoszare kropki'],h:['Tiny pigmented tumour nests or melanophages close to the junction.','Drobne zbarwione gniazda nowotworu lub melanofagi blisko połączenia skórno-naskórkowego.'],
      o:['Shallow enough to be in sharp focus, deep enough to look grey-blue.','Leżą na tyle płytko, by były ostre, i na tyle głęboko, by były niebieskoszare.']},
    buds:{vis:[0,1,0],depth:'≈0.1–0.2 mm',layer:['Junction and papillary dermis','Połączenie i warstwa brodawkowata'],n:['Basaloid buds','Pączki bazaloidne'],h:['Non-pigmented tumour buds hanging from the basal layer.','Niezbarwione pączki nowotworu zwisające z warstwy podstawnej.'],
      o:['Not visible directly; they lift and whiten the pink background.','Niewidoczne bezpośrednio; unoszą i rozjaśniają różowe tło.']},
    shiny:{vis:[0,3,0],depth:'≈0.1–0.2 mm',layer:['Stroma around the nests','Podścielisko wokół gniazd'],n:['Shiny white-red areas, blotches and strands','Lśniące biało-czerwone obszary, plamy i pasma'],h:['Fibrotic stroma around the nests.','Włókniste podścielisko wokół gniazd.'],
      o:['Polarized light only: collagen scrambles the polarization.','Tylko w świetle spolaryzowanym: kolagen zaburza polaryzację.']},
    arbor:{vis:[2,3,2],depth:'≈0.1–0.15 mm',layer:['Superficial dermis over the tumour','Powierzchowna skóra właściwa nad guzem'],n:['Arborizing vessels','Naczynia drzewkowate'],h:['Dilated branching vessels lying flat just under a thinned epidermis.','Poszerzone, rozgałęzione naczynia leżące płasko tuż pod ścieńczałym naskórkiem.'],
      o:['Sharp and tree-like: thick trunks tapering into fine branches.','Ostre i drzewkowate: grube pnie przechodzące w cienkie gałązki.']},
    glob:{vis:[3,3,1],depth:'≈0.12–0.2 mm',layer:LY.pap,n:['Blue-grey globules','Niebieskoszare kulki'],h:['Small pigmented tumour nests.','Małe zbarwione gniazda nowotworu.'],o:['Dermal melanin: grey-blue, fading at 405 nm.','Melanina w skórze właściwej: niebieskoszara, zanika w 405 nm.']},
    ovoid:{vis:[3,3,1],depth:'≈0.2–0.35 mm',layer:['Papillary to upper reticular dermis','Warstwa brodawkowata i górna część siateczkowatej'],n:['Blue-grey ovoid nests','Niebieskoszare owalne gniazda'],h:['Large pigmented tumour nests.','Duże zbarwione gniazda nowotworu.'],
      o:['Large, oval, well defined and not connected to any network.','Duże, owalne, dobrze odgraniczone, niepołączone z żadną siatką.']},
    leaf:{vis:[3,3,2],depth:'≈0.1–0.15 mm',layer:['Upper dermis at the edge','Górna część skóry właściwej na brzegu'],n:['Leaf-like areas','Obszary liściopodobne'],h:['Pigmented nests at the periphery still connected to the epidermis.','Zbarwione gniazda na obwodzie wciąż połączone z naskórkiem.'],
      o:['Brown-grey bulbous lobes that never join into a network.','Brązowoszare, bulwiaste płaty, które nigdy nie łączą się w siatkę.']},
    nodule:{vis:[2,3,0],depth:'≈0.3–1 mm',layer:LY.derm,n:['Tumour nodule (translucent background)','Guzek nowotworu (przeświecające tło)'],h:['Basaloid nests with little pigment filling the dermis.','Gniazda bazaloidne z niewielką ilością barwnika wypełniające skórę właściwą.'],
      o:['Seen indirectly as a pink-white, pearly, structureless background.','Widoczny pośrednio jako różowobiałe, perłowe, bezstrukturalne tło.']},
    ulcer:{vis:[3,3,3],depth:LY.surf,layer:['Epidermis lost','Utrata naskórka'],n:['Ulceration','Owrzodzenie'],h:['Epidermis lost over the tumour, covered by serum and blood crust.','Utrata naskórka nad guzem, pokryta surowicą i strupem krwotocznym.'],
      o:['Red-orange to dark red structureless area without a traumatic cause.','Czerwono-pomarańczowy do ciemnoczerwonego obszar bezstrukturalny bez przyczyny urazowej.']}},
  H:{bud:{a:'palisade',m:'buds',n:['Buds from the basal layer','Pączki z warstwy podstawnej'],d:['Small basaloid nests still attached to the epidermis, their nuclei palisaded at the edge.','Małe gniazda bazaloidne wciąż połączone z naskórkiem, z palisadowym układem jąder na obwodzie.']},
    pal:{a:'palisade',m:'nodule',n:['Peripheral palisading','Palisadowe ułożenie jąder na obwodzie'],d:['Nuclei at the edge of each basaloid nest line up side by side.','Jądra na obwodzie każdego gniazda bazaloidnego układają się obok siebie jak palisada.']},
    cleft:{a:'cleft',m:'nodule',n:['Retraction cleft','Szczelina retrakcyjna'],d:['A gap between tumour nest and stroma, a hallmark of BCC.','Szczelina między gniazdem nowotworu a podścieliskiem, cecha charakterystyczna BCC.']},
    stroma:{a:'stroma',m:'shiny',n:['Fibromyxoid stroma','Włóknisto-śluzowate podścielisko'],d:['Its collagen gives the shiny white structures in polarized light.','Jego kolagen daje białe lśniące struktury w świetle spolaryzowanym.']},
    pig:{a:'pignest',m:'ovoid',n:['Pigmented nest','Zbarwione gniazdo'],d:['Melanin in tumour nests and melanophages around them: the blue-grey structures.','Melanina w gniazdach nowotworu i melanofagi wokół nich: struktury niebieskoszare.']},
    vess:{a:'vessel',m:'arbor',n:['Dilated superficial vessel','Poszerzone naczynie powierzchowne'],d:['Large vessels running flat just under the thinned epidermis: arborizing vessels.','Duże naczynia biegnące płasko tuż pod ścieńczałym naskórkiem: naczynia drzewkowate.']},
    telv:{a:'telv',m:'tel',n:['Thin superficial capillaries','Cienkie włośniczki powierzchowne'],d:['Short vessels just under the epidermis: short fine telangiectasias.','Krótkie naczynia tuż pod naskórkiem: krótkie cienkie teleangiektazje.']},
    epi:{a:'epiL',n:['Thinned epidermis','Ścieńczały naskórek'],d:['Stretched over the tumour, with no rete ridges: no network.','Rozciągnięty nad guzem, bez sopli naskórka: brak siatki.']},
    ulc:{a:'ulcer',m:'ulcer',n:['Ulceration','Owrzodzenie'],d:['Epidermis lost and covered by serum, fibrin, neutrophils and blood.','Utrata naskórka, pokrytego surowicą, włóknikiem, neutrofilami i krwią.']}},
  build(k){const R=[1.05,1.45,1.9,2.1][k],L=baseModel(303),S=makeShape(R,[[0.07,2,1.0],[0.05,3,0.2]]),F=L.features,sc=R/2.0;L.R=rhoFn(S);L.foc={};
    const UC=[0.35,-0.3],ul=k===3?blobFn(UC[0],UC[1],0.42,0.25,8):()=>0,Hh=[0.1,0.3,0.55,0.62][k];
    L.elev=(x,z,r)=>Hh*Math.pow(Math.max(0,1-r*r),0.75)-0.06*ul(x,z);L.sc=(x,z,r)=>0.02*(1-0.4*inM(r,0.1))*(1-ul(x,z));
    L.epi=(x,z,r)=>(0.045-[0.01,0.018,0.024,0.024][k]*inM(r,0.1))*(1-0.95*ul(x,z));L.rete=(x,z,r)=>0.055*(1-[0.6,0.85,0.93,0.93][k]*inM(r,0.12));
    L.netI=(x,z,r)=>0.03*(1-inM(r,0.1));L.pearl=(x,z,r)=>r>1.3?0:[0.45,0.65,0.85,0.85][k]*inM(r,0.15)*(1-ul(x,z));L.ery=(x,z,r)=>r>1.3?0:0.34*inM(r,0.15);L.ulcer=(x,z)=>ul(x,z);
    for(let i=0;i<[8,6,3,0][k];i++){const t=BCP.tel[i],x=Math.cos(t.a)*t.q*0.75*R,z=Math.sin(t.a)*t.q*0.75*R;F.push(vLine(mulberry32(t.s),x,z,t.ang,0.18+0.14*t.u,0.085,0.008,0.9,'tel','tel'));}
    if(k===0){for(let i=0;i<7;i++){const d=BCP.dots[i],x=Math.cos(d.a)*d.q*0.7*R,z=Math.sin(d.a)*d.q*0.7*R;F.push({t:'nest',x,z,d:0.1+0.025*d.u,r:0.026+0.014*d.v,bcc:true,sid:'dots'});}
      for(let i=7;i<17;i++){const d=BCP.dots[i],x=Math.cos(d.a)*d.q*0.75*R,z=Math.sin(d.a)*d.q*0.75*R;F.push({t:'nest',x,z,d:0.12+0.05*d.u,r:0.05+0.03*d.v,bcc:true,np:true,sid:'buds'});}}
    F.push({t:'collagen',x:0,z:0,r:[0.75,1.0,1.3,1.4][k],d0:0.1,d1:0.18,n:[14,30,55,55][k],style:'blotch',sid:'shiny'});
    if(k>=1){const th=[0.45,2.2,-1.75];for(let i=0;i<(k===1?2:3);i++){const a=th[i],R0=S(a)*0.95;vTree(mulberry32(3100+i),F,Math.cos(a)*R0,Math.sin(a)*R0,a+Math.PI+(i-1)*0.2,[0.9,1.4,1.5][k-1],0.12,[0.022,0.032,0.034][k-1],0,'arbor');}
      const cl=k===1?[[-0.45,0.95]]:[[-0.45,0.95],[0.75,-0.8]];let n=0;for(const c of cl)for(let i=0;i<(k===1?6:8);i++){const d=BCP.dots[17+(n++)%23],x=c[0]*sc+Math.cos(d.a)*d.q*0.3,z=c[1]*sc+Math.sin(d.a)*d.q*0.3;
        F.push({t:'nest',x,z,d:0.12+0.08*d.u,r:0.03+0.025*d.v,bcc:true,sid:'glob'});}
      const ov=[[-1.25,-0.45,0.28,0.24],[-1.05,0.78,0.25,0.2],[1.2,0.85,0.3,0.22],[1.38,-0.2,0.26,0.18]];for(let i=0;i<[1,3,4][k-1];i++){const q=ov[i];F.push({t:'tumor',x:q[0]*sc,z:q[1]*sc,d:q[2],r:q[3]*(k===1?0.85:1),pig:1,kind:'bcc',sid:'ovoid'});}
      const nd=k===1?[[0,0,0.36,0.36],[-0.4,0.3,0.3,0.3],[0.4,-0.2,0.32,0.28]]:[[0,0,0.55,0.55],[-0.6,0.35,0.45,0.4],[0.5,0.45,0.5,0.42],[-0.3,-0.6,0.6,0.4],[0.65,-0.3,0.72,0.38],[0.05,0.85,0.42,0.34]];
      for(const q of nd)F.push({t:'tumor',x:q[0]*sc,z:q[1]*sc,d:q[2],r:q[3]*sc,pig:0,kind:'bcc',sid:'nodule'});}
    if(k>=2){for(const th of k===2?[2.75]:[2.75,-2.3]){const R0=S(th)*0.9,bx=Math.cos(th)*R0,bz=Math.sin(th)*R0,ox=Math.cos(th),oz=Math.sin(th),px=-oz,pz=ox,rg=mulberry32(3200+Math.round(th*10));
      for(let q=0;q<5;q++){const f=0.05+q*0.07,side=(q%2?1:-1)*(0.05+rg()*0.06);F.push({t:'nest',x:bx+ox*f+px*side,z:bz+oz*f+pz*side,d:rr(rg,0.1,0.15),r:rr(rg,0.07,0.1),bcc:true,sid:'leaf'});}}}
    if(k===3)F.push({t:'ulcer',x:UC[0],z:UC[1],r:0.42,sid:'ulcer'});
    setNF(L,'tel',0.3,0.2,0.085,0.25);setNF(L,'dots',0,0,0.11,0.2);setNF(L,'buds',0.3,-0.2,0.15,0.3);setF(L,'shiny',0.25,0.14,0.15,0.6);setNF(L,'arbor',0.9*sc,0.9*sc,0.12,0.5);
    setNF(L,'glob',-0.45*sc,0.95*sc,0.16,0.35);setNF(L,'ovoid',-1.25*sc,-0.45*sc,0.28,0.35);setNF(L,'leaf',-1.8*sc,0.7*sc,0.12,0.4);setF(L,'nodule',0,0.5,0,1.1*sc);setF(L,'ulcer',UC[0],0.02,UC[1],0.45);
    return L;}};

/* ============================ 4 · actinic keratosis to SCC ============================ */
const AKP={spots:(()=>{const r=mulberry32(4004),o=[];for(let i=0;i<9;i++)o.push({x:rr(r,-3.4,3.4),z:rr(r,-3.4,3.4),r:rr(r,0.3,0.6),a:rr(r,0.28,0.45),seed:(r()*97)|0});return o;})(),
  tel:vPool(4005,6),ves:vPool(4006,40),pts:ptPool(4007,120,2.1,0.12)};
EVO.ak={seed:404,face:true,hcase:'bowen',hstyle:'ak',secZ:0.2,
  title:['Actinic keratosis to squamous cell carcinoma','Od rogowacenia słonecznego do raka kolczystokomórkowego'],
  sum:['On chronically sun-damaged facial skin, atypical keratinocytes start in the basal layer (actinic keratosis), may come to occupy the whole epidermis (SCC in situ, Bowen disease) and finally invade the dermis. Dermoscopy tracks the steps: red pseudo-network in AK; dotted or glomerular vessels, yellow scale and microerosions in intraepidermal carcinoma; keratin, white structures, targetoid follicles, hairpin vessels and ulceration once invasive. In one large cohort 0.6% of AKs had progressed to SCC at one year and 2.6% at four, yet about 65% of SCCs arose in lesions previously diagnosed as AK.',
    'Na przewlekle uszkodzonej słońcem skórze twarzy atypowe keratynocyty pojawiają się najpierw w warstwie podstawnej (rogowacenie słoneczne), mogą zająć cały naskórek (rak kolczystokomórkowy in situ, choroba Bowena), a w końcu naciekają skórę właściwą. Dermoskopia pozwala śledzić te etapy: czerwona pseudosiatka w AK; naczynia kropkowe lub kłębuszkowate, żółta łuska i mikronadżerki w raku śródnaskórkowym; keratyna, białe struktury, tarczowate mieszki włosowe, naczynia w kształcie spinki do włosów i owrzodzenie w raku inwazyjnym. W dużym badaniu kohortowym 0,6% AK przeszło w SCC po roku, a 2,6% po czterech latach, ale około 65% SCC powstało w zmianach wcześniej rozpoznanych jako AK.'],
  src:[['https://pubmed.ncbi.nlm.nih.gov/21839538/','Zalaudek et al., progression model, JAAD 2012'],['https://pubmed.ncbi.nlm.nih.gov/19382202/','Criscione et al., Cancer 2009']],
  stages:[
    {lbl:['Sun damage','Fotouszkodzenie'],ph:['Decades of UV · field','Dekady UV · pole'],h:['Photodamaged facial skin','Skóra twarzy uszkodzona słońcem'],grow:0,hstyle:'n',
      see:['No lesion yet. Prominent follicular openings, scattered light-brown spots and fine linear vessels.','Nie ma jeszcze zmiany. Wyraźne ujścia mieszków włosowych, rozsiane jasnobrązowe plamki i cienkie naczynia linijne.'],
      tis:['Solar elastosis: grey-blue, tangled elastotic material replaces normal collagen in the upper dermis. The epidermis is thin and the rete ridges are flat; UV-induced mutations accumulate in keratinocytes.','Elastoza słoneczna: szaroniebieski, splątany materiał elastotyczny zastępuje prawidłowy kolagen w górnej części skóry właściwej. Naskórek jest cienki, a sople naskórka spłaszczone; w keratynocytach gromadzą się mutacje wywołane UV.'],
      key:['Field cancerization: the whole sun-exposed area carries mutated clones, so AKs are usually multiple and treatment often targets the field.','Kancerogeneza polowa (field cancerization): cały nasłoneczniony obszar zawiera zmutowane klony, dlatego AK są zwykle mnogie, a leczenie często obejmuje całe pole.'],
      st:['fol','spot','telf','elast'],he:['elas','thin','infund']},
    {lbl:['AK I','AK I'],ph:['Actinic keratosis · early','Rogowacenie słoneczne · wczesne'],h:['Red pseudo-network','Czerwona pseudosiatka'],grow:0.4,
      see:['A faint pink patch, easier to feel than to see: rough on palpation. Erythema fills the space between follicles, which stand out as pale holes (red pseudo-network); fine white scale.','Słabo widoczna różowa plamka, łatwiej wyczuwalna niż widoczna: szorstka w dotyku. Rumień wypełnia przestrzeń między mieszkami, które odcinają się jako jasne otwory (czerwona pseudosiatka); drobna biała łuska.'],
      tis:['Atypical keratinocytes in the basal layer, the lower third of the epidermis (AK I in histological grading). Parakeratosis alternates with normal keratin over the spared follicles; solar elastosis below.','Atypowe keratynocyty w warstwie podstawnej, w dolnej jednej trzeciej naskórka (AK I w klasyfikacji histologicznej). Parakeratoza przeplata się z prawidłową keratyną nad oszczędzonymi mieszkami; poniżej elastoza słoneczna.'],
      key:['Facial skin has too few rete ridges for a true network: pigment or erythema around follicles forms a pseudo-network. Red pseudo-network is the dermoscopic hallmark of AK.','Na twarzy jest zbyt mało sopli naskórka, by powstała prawdziwa siatka: barwnik lub rumień wokół mieszków tworzy pseudosiatkę. Czerwona pseudosiatka to dermoskopowy wyróżnik AK.'],
      st:['pseudo','scale','fol','elast'],he:['akb','para','infund','elas']},
    {lbl:['AK II','AK II'],ph:['Actinic keratosis · thicker','Rogowacenie słoneczne · grubsze'],h:['Strawberry pattern','Wzór truskawkowy'],grow:0.5,akFrac:0.66,
      see:['Redder and scalier. The erythematous background is interrupted by enlarged follicular openings filled with white-yellow keratin plugs: the strawberry pattern. In polarized light some follicles show rosettes.','Bardziej czerwone i złuszczające się. Rumieniowe tło przerywają poszerzone ujścia mieszków wypełnione biało-żółtymi czopami keratynowymi: wzór truskawkowy. W świetle spolaryzowanym przy części mieszków widać rozety.'],
      tis:['Atypia reaches the lower two-thirds of the epidermis and extends down the follicular infundibula. Hyperkeratosis and parakeratosis thicken the surface.','Atypia sięga dolnych dwóch trzecich naskórka i schodzi wzdłuż lejków mieszków włosowych. Hiperkeratoza i parakeratoza pogrubiają powierzchnię.'],
      key:['Rosettes are four white points arranged in a square, seen only in polarized light and thought to arise in keratin-filled follicular openings. Common in AK, but not specific.','Rozety to cztery białe punkty ułożone w kwadrat, widoczne tylko w świetle spolaryzowanym; prawdopodobnie powstają w ujściach mieszków wypełnionych keratyną. Częste w AK, ale nieswoiste.'],
      st:['straw','plug','ros','scale','elast'],he:['ak2','plugH','para','elas']},
    {lbl:['In situ','In situ'],ph:['SCC in situ · Bowen disease','SCC in situ · choroba Bowena'],h:['Intraepidermal carcinoma','Rak śródnaskórkowy'],grow:0.6,hstyle:'bw',
      see:['A sharply outlined red, scaly plaque. Dotted and glomerular vessels in clusters, diffuse yellow opaque scale and small erosions (microerosions).','Ostro odgraniczona czerwona, złuszczająca się blaszka. Skupiska naczyń kropkowych i kłębuszkowatych, rozlana żółta, nieprzejrzysta łuska i drobne nadżerki (mikronadżerki).'],
      tis:['Atypical keratinocytes occupy the full thickness of the epidermis, with dyskeratotic cells and mitoses high up. The basement membrane is intact. Coiled capillaries fill the elongated papillae.','Atypowe keratynocyty zajmują całą grubość naskórka, z komórkami dyskeratotycznymi i figurami podziału wysoko w naskórku. Błona podstawna jest nienaruszona. Kręte włośniczki wypełniają wydłużone brodawki.'],
      key:['Glomerular vessels with scale in a flat red patch: think of Bowen disease. It is still in situ and still curable by local treatment.','Naczynia kłębuszkowate i łuska w płaskiej czerwonej zmianie: pomyśl o chorobie Bowena. To wciąż rak in situ, wyleczalny leczeniem miejscowym.'],
      st:['glom','yscale','eros','elast'],he:['full','dysk','glomv','bmI','elas']},
    {lbl:['Invasive','Inwazyjny'],ph:['Invasive SCC','Inwazyjny SCC'],h:['Invasion: a keratinizing nodule','Naciekanie: rogowaciejący guzek'],grow:0.5,hstyle:'sq',hcase:'scc',
      see:['A raised, tender nodule with a central keratin mass. White structureless areas, targetoid follicles (white circles around keratin plugs), hairpin and linear irregular vessels with white halos, blood spots and ulceration.','Uniesiony, bolesny guzek z centralną masą keratynową. Białe obszary bezstrukturalne, tarczowate mieszki włosowe (białe koła wokół czopów keratynowych), naczynia w kształcie spinki do włosów i linijne nieregularne z białą otoczką, wylewy krwawe i owrzodzenie.'],
      tis:['Tongues of atypical keratinocytes break through the basement membrane into the dermis and form keratin pearls, with lymphocytes around them.','Języczki atypowych keratynocytów przebijają błonę podstawną, wnikają do skóry właściwej i tworzą perły rogowe; wokół nich gromadzą się limfocyty.'],
      key:['Signs of invasion: palpable thickening or a nodule, tenderness, a keratin mass, white structures, targetoid follicles, hairpin vessels and ulceration.','Cechy naciekania: wyczuwalne pogrubienie lub guzek, bolesność, masa keratynowa, białe struktury, tarczowate mieszki, naczynia w kształcie spinki do włosów i owrzodzenie.'],
      st:['ker','target','wsa','hairpin','ulc','lobules'],he:['inv','pearl','kerH','infW']}],
  S:{fol:{vis:[3,3,3],depth:'0–0.15 mm',layer:['Epidermis around follicles','Naskórek wokół mieszków'],n:['Follicular openings','Ujścia mieszków włosowych'],h:['Follicular infundibula, numerous and wide on facial skin.','Lejki mieszków włosowych, liczne i szerokie na skórze twarzy.'],
      o:['Pale round holes that interrupt pigment or erythema: the reason facial skin shows a pseudo-network.','Jasne okrągłe otwory przerywające barwnik lub rumień: dlatego na twarzy widać pseudosiatkę.']},
    spot:{vis:[3,3,3],depth:'≈0.05 mm',layer:['Basal layer','Warstwa podstawna'],n:['Mottled light-brown spots','Nierównomierne jasnobrązowe plamki'],h:['Patchy basal hyperpigmentation from chronic UV.','Ogniskowa hiperpigmentacja warstwy podstawnej wskutek przewlekłego UV.'],o:['Epidermal melanin: light brown, crisp at 405 nm.','Melanina naskórkowa: jasnobrązowa, ostra w 405 nm.']},
    telf:{vis:[1,3,1],depth:'≈0.1–0.15 mm',layer:LY.pap,n:['Fine linear vessels','Cienkie naczynia linijne'],h:['Dilated superficial vessels (telangiectasias) of photodamaged skin.','Poszerzone naczynia powierzchowne (teleangiektazje) skóry fotouszkodzonej.'],o:['Long, thin, gently curving red lines.','Długie, cienkie, łagodnie wygięte czerwone linie.']},
    elast:{vis:[0,1,0],depth:'≈0.12–0.45 mm',layer:['Upper dermis','Górna część skóry właściwej'],n:['Solar elastosis','Elastoza słoneczna'],h:['Degenerated elastic fibres forming grey-blue, amorphous masses (basophilic degeneration of collagen).','Zwyrodniałe włókna sprężyste tworzące szaroniebieskie, bezpostaciowe masy (zwyrodnienie bazofilne kolagenu).'],
      o:['Not a dermoscopic structure; it scatters light and makes the dermis look paler and less transparent.','Nie jest strukturą dermoskopową; rozprasza światło, przez co skóra właściwa wydaje się bledsza i mniej przejrzysta.']},
    pseudo:{vis:[2,3,1],depth:'≈0.1–0.2 mm',layer:['Papillary dermis between follicles','Warstwa brodawkowata między mieszkami'],n:['Red pseudo-network','Czerwona pseudosiatka'],h:['Dilated capillaries in the interfollicular dermis under the atypical epidermis.','Poszerzone włośniczki w skórze właściwej między mieszkami, pod atypowym naskórkiem.'],
      o:['Pink-red background interrupted by pale follicular openings.','Różowoczerwone tło przerywane jasnymi ujściami mieszków.']},
    scale:{vis:[2,3,3],depth:LY.surf,layer:LY.sc,n:['White scale','Biała łuska'],h:['Parakeratosis and hyperkeratosis over the atypical epidermis.','Parakeratoza i hiperkeratoza nad atypowym naskórkiem.'],o:['Scatters at the surface; immersion fluid makes it translucent.','Rozprasza światło na powierzchni; płyn immersyjny czyni ją przejrzystą.']},
    straw:{vis:[2,3,2],depth:'0–0.2 mm',layer:['Epidermis and papillary dermis','Naskórek i warstwa brodawkowata'],n:['Strawberry pattern','Wzór truskawkowy'],h:['Interfollicular erythema with enlarged, keratin-filled follicular openings.','Rumień między mieszkami z poszerzonymi ujściami wypełnionymi keratyną.'],
      o:['A red background dotted with white-yellow “seeds”, like the surface of a strawberry.','Czerwone tło usiane biało-żółtymi „pestkami”, jak powierzchnia truskawki.']},
    plug:{vis:[3,3,3],depth:'0–0.12 mm',layer:['Follicular infundibulum','Lejek mieszka włosowego'],n:['Keratin plugs in follicles','Czopy keratynowe w mieszkach'],h:['Keratin retained in the dilated infundibulum.','Keratyna zatrzymana w poszerzonym lejku mieszka.'],o:['White-yellow round clods.','Biało-żółte okrągłe grudki.']},
    ros:{vis:[0,3,0],depth:'0–0.1 mm',layer:['Follicular openings','Ujścia mieszków'],n:['Rosettes','Rozety'],h:['Thought to arise from keratin-filled follicular openings and their surroundings.','Prawdopodobnie powstają w ujściach mieszków wypełnionych keratyną i w ich otoczeniu.'],o:['Four white points in a square. Polarized light only.','Cztery białe punkty ułożone w kwadrat. Tylko w świetle spolaryzowanym.']},
    glom:{vis:[1,3,1],depth:'≈0.08–0.3 mm',layer:['Elongated papillae','Wydłużone brodawki'],n:['Dotted and glomerular vessels in clusters','Skupiska naczyń kropkowych i kłębuszkowatych'],h:['Tortuous capillaries coiled inside the papillae.','Kręte włośniczki zwinięte w brodawkach.'],o:['A coiled loop seen from above looks like a tiny ball of yarn.','Zwinięta pętla widziana z góry wygląda jak mały kłębek włóczki.']},
    yscale:{vis:[3,3,3],depth:LY.surf,layer:LY.sc,n:['Diffuse yellow opaque scale','Rozlana żółta nieprzejrzysta łuska'],h:['Thick parakeratotic scale over a full-thickness atypical epidermis.','Gruba parakeratotyczna łuska nad naskórkiem z atypią na całej grubości.'],o:['Yellowish, opaque, covering large parts of the lesion.','Żółtawa, nieprzejrzysta, pokrywająca znaczne części zmiany.']},
    eros:{vis:[3,3,3],depth:LY.surf,layer:LY.epi,n:['Microerosions','Mikronadżerki'],h:['Small foci where the upper epidermis is lost.','Drobne ogniska utraty górnych warstw naskórka.'],o:['Small red-brown crusted spots.','Małe czerwonobrązowe punkty pokryte strupem.']},
    ker:{vis:[3,3,3],depth:['surface, up to ≈0.3 mm thick','powierzchnia, do ≈0,3 mm grubości'],layer:LY.sc,n:['Central keratin mass','Centralna masa keratynowa'],h:['Thick keratin produced by a well-differentiated tumour.','Gruba warstwa keratyny wytwarzanej przez dobrze zróżnicowany nowotwór.'],o:['White-yellow and structureless, lying on top: visible in every mode.','Biało-żółta i bezstrukturalna, leży na wierzchu: widoczna w każdym trybie.']},
    target:{vis:[3,3,2],depth:'≈0.02–0.12 mm',layer:['Epidermis around follicles','Naskórek wokół mieszków'],n:['Targetoid follicles (white circles)','Tarczowate mieszki (białe koła)'],h:['Thickened, keratinizing epithelium of the follicular infundibulum around a keratin plug.','Pogrubiały, rogowaciejący nabłonek lejka mieszka wokół czopu keratynowego.'],
      o:['A white ring around a yellow centre. Points to invasive SCC.','Białe koło wokół żółtego środka. Wskazuje na inwazyjnego raka kolczystokomórkowego.']},
    wsa:{vis:[1,3,0],depth:'≈0.1–0.25 mm',layer:['Superficial dermis','Powierzchowna skóra właściwa'],n:['White structureless areas','Białe obszary bezstrukturalne'],h:['Keratinization and fibrosis around the invasive tumour.','Rogowacenie i włóknienie wokół naciekającego nowotworu.'],o:['Brighter in polarized light.','Jaśniejsze w świetle spolaryzowanym.']},
    hairpin:{vis:[1,3,1],depth:'≈0.1–0.4 mm',layer:LY.pap,n:['Hairpin and linear irregular vessels','Naczynia w kształcie spinki do włosów i linijne nieregularne'],h:['Elongated capillary loops between tumour lobules, rimmed by keratinizing cells (white halo).','Wydłużone pętle włośniczkowe między płacikami nowotworu, otoczone rogowaciejącymi komórkami (biała otoczka).'],
      o:['Tilted loops show both limbs: hairpins with a white halo.','Pochylone pętle ukazują oba ramiona: spinki do włosów z białą otoczką.']},
    ulc:{vis:[3,3,3],depth:LY.surf,layer:LY.sc,n:['Ulceration and blood spots','Owrzodzenie i wylewy krwawe'],h:['The tumour breaks through the surface; blood is trapped in the keratin.','Nowotwór przebija powierzchnię; krew zostaje uwięziona w keratynie.'],o:['Red to black clods and crust on white keratin.','Czerwone do czarnych grudki i strup na białej keratynie.']},
    lobules:{vis:[0,0,0],depth:'≈0.3–0.9 mm',layer:LY.derm,n:['Invasive keratinizing lobules','Naciekające rogowaciejące płaciki'],h:['Tongues of atypical keratinocytes with keratin pearls in the dermis.','Języczki atypowych keratynocytów z perłami rogowymi w skórze właściwej.'],o:['Too deep to see; they lift the surface into a nodule.','Zbyt głęboko, by je zobaczyć; unoszą powierzchnię w guzek.']}},
  H:{elas:{a:'elastosis',m:'elast',n:['Solar elastosis','Elastoza słoneczna'],d:['Grey-blue, tangled elastotic material in the upper dermis, below a thin band of spared collagen.','Szaroniebieski, splątany materiał elastotyczny w górnej części skóry właściwej, pod wąskim pasmem oszczędzonego kolagenu.']},
    thin:{a:'spinous',n:['Thin epidermis, flat rete ridges','Cienki naskórek, spłaszczone sople'],d:['Chronic UV thins the epidermis and flattens the junction.','Przewlekłe UV ścieńcza naskórek i spłaszcza połączenie skórno-naskórkowe.']},
    infund:{a:'infund2',m:'fol',n:['Follicular infundibulum','Lejek mieszka włosowego'],d:['The follicle opening; its epithelium is spared in early AK.','Ujście mieszka; we wczesnym AK jego nabłonek jest oszczędzony.']},
    akb:{a:'akatyp',m:'pseudo',n:['Basal atypia (AK I)','Atypia w warstwie podstawnej (AK I)'],d:['Crowded, enlarged, hyperchromatic nuclei in the lower third of the epidermis.','Stłoczone, powiększone, hiperchromatyczne jądra w dolnej jednej trzeciej naskórka.']},
    ak2:{a:'akatyp',m:'straw',n:['Atypia in the lower two-thirds (AK II)','Atypia w dolnych dwóch trzecich (AK II)'],d:['Atypical keratinocytes reach higher and extend along the follicles.','Atypowe keratynocyty sięgają wyżej i wzdłuż mieszków.']},
    para:{a:'para',m:'scale',n:['Parakeratosis','Parakeratoza'],d:['Retained nuclei in the keratin: the scale.','Zachowane jądra w warstwie rogowej: łuska.']},
    plugH:{a:'infund2',m:'plug',n:['Keratin plug in the infundibulum','Czop keratynowy w lejku'],d:['Keratin retained in a dilated follicle opening: the white-yellow dots of the strawberry pattern.','Keratyna zatrzymana w poszerzonym ujściu mieszka: biało-żółte kropki wzoru truskawkowego.']},
    full:{a:'epiL',m:'glom',n:['Full-thickness atypia','Atypia na całej grubości naskórka'],d:['Crowded, pleomorphic keratinocytes without maturation from base to surface.','Stłoczone, pleomorficzne keratynocyty bez dojrzewania od podstawy do powierzchni.']},
    dysk:{a:'dysk',n:['Dyskeratotic cell','Komórka dyskeratotyczna'],d:['A single keratinocyte keratinizing early: bright pink with a shrunken nucleus.','Pojedynczy keratynocyt rogowaciejący przedwcześnie: jaskraworóżowy, z obkurczonym jądrem.']},
    glomv:{a:'glomvessels',m:'glom',n:['Tortuous papillary capillaries','Kręte włośniczki brodawek'],d:['One coiled capillary cut several times inside a papilla.','Jedna zwinięta włośniczka przecięta kilkakrotnie w brodawce.']},
    bmI:{a:'basalL',n:['Intact basement membrane','Nienaruszona błona podstawna'],d:['No invasion yet: carcinoma in situ.','Brak naciekania: rak in situ.']},
    inv:{a:'invasive',m:'lobules',n:['Invasive squamous nests','Naciekające gniazda płaskonabłonkowe'],d:['Atypical keratinocytes with glassy pink cytoplasm in the dermis, rimmed by lymphocytes.','Atypowe keratynocyty o szklistej, różowej cytoplazmie w skórze właściwej, otoczone limfocytami.']},
    pearl:{a:'pearl',m:'lobules',n:['Keratin pearl','Perła rogowa'],d:['Concentric keratinization inside a nest.','Koncentryczne rogowacenie wewnątrz gniazda.']},
    kerH:{a:'keratin',m:'ker',n:['Keratin crust','Strup keratynowy'],d:['Thick ortho- and parakeratin produced by the tumour.','Gruba orto- i parakeratoza wytwarzana przez nowotwór.']},
    infW:{a:'infund',m:'target',n:['Keratinizing follicular infundibulum','Rogowaciejący lejek mieszka'],d:['Thickened epithelium around a keratin plug: the white circle.','Pogrubiały nabłonek wokół czopu keratynowego: białe koło.']}},
  build(k){const R=[1.6,1.35,1.65,1.95,2.15][k],L=baseModel(404),S=makeShape(R,[[0.09,2,0.5],[0.06,3,1.3],[0.035,5,0.2]]),F=L.features,P=AKP;L.R=rhoFn(S);L.foc={};
    const soft=[0.3,0.3,0.25,0.06,0.1][k],W=r=>inM(r,soft),spar=(x,z)=>smoothstep(0.06,0.15,folDist(x,z)),K=k===4?blobFn(0.1,-0.1,0.85,0.25,5):()=>0,UC=[0.4,-0.45],ul=k===4?blobFn(UC[0],UC[1],0.2,0.3,9):()=>0;
    L.epi=(x,z,r)=>0.036+[0,0.004,0.01,0.03,0.07][k]*W(r);L.rete=(x,z,r)=>0.035+[0,0.005,0.015,0.12,0.14][k]*W(r);L.irr=()=>0.15;L.netI=(x,z,r)=>0.03*(1-[0,0.3,0.6,1,1][k]*W(r));
    L.sc=(x,z,r)=>k===4?(0.02+0.3*K(x,z))*(1-ul(x,z)):0.02+[0,0.012,0.04,0.06,0][k]*W(r);
    if(k===1){L.ery=(x,z,r)=>0.55*W(r)*spar(x,z);L.ker=(x,z,r)=>0.2*W(r)*smoothstep(0.55,0.72,fbm(x*2.2,z*2.2,61,3));}
    if(k===2){L.ery=(x,z,r)=>0.72*W(r)*(0.35+0.65*spar(x,z));L.ker=(x,z,r)=>0.42*W(r)*smoothstep(0.45,0.65,fbm(x*2.2,z*2.2,61,3));L.elev=(x,z,r)=>0.04*W(r);}
    if(k===3){const sq=(x,z)=>smoothstep(0.5,0.7,fbm(x*1.4,z*1.4,21,3));L.ery=(x,z,r)=>0.85*W(r)*(0.75+0.25*spar(x,z));L.ker=(x,z,r)=>r>1.2?0:0.78*W(r)*sq(x,z);L.elev=(x,z,r)=>0.08*W(r);L.pig=(x,z,r)=>0.05*W(r);}
    if(k===4){L.elev=(x,z,r)=>0.72*Math.pow(Math.max(0,1-r*r),0.8)-0.05*ul(x,z);L.ker=(x,z,r)=>r>1.2?0:K(x,z)*(0.8+0.2*fbm(x*3,z*3,71,2))*(1-ul(x,z));
      L.ery=(x,z,r)=>r>1.2?0:0.6*W(r)*(1-K(x,z));L.ulcer=(x,z)=>ul(x,z);}
    // field: spots, fine vessels, elastosis
    for(const s of P.spots){if(k>=1&&L.R(s.x,s.z)<1.15)continue;F.push({t:'spot',x:s.x,z:s.z,r:s.r,a:s.a,seed:s.seed,sid:'spot'});}
    for(let i=0;i<4;i++){const v=P.tel[i];F.push(vLine(mulberry32(v.s),-3.2+v.u*4.2,-3.1+i*1.9+v.v*0.4,(v.w-0.5)*1.2,1.4+v.u*1.2,0.1,0.01,0.7,'telf','tel'));}
    F.push({t:'elastosis',x:0,z:0,r:4.3,d0:0.1,d1:0.42,n:700,sid:'elast'});
    faceFollicles(L,(o,r)=>{const w=W(r);
      if(k===1&&w>0.4){o.plug=0.15;}
      if(k===2&&w>0.4){o.r*=1+0.6*w;o.plug=0.85+0.15*o.h;o.halo=0.15;o.ros=o.h<0.45;o.sid='plug';}
      if(k===3&&w>0.4){o.plug=0.3;}
      if(k===4&&w>0.3){if(K(o.x,o.z)>0.25||ul(o.x,o.z)>0.2||o.h>0.16||r<0.3)return false;o.r*=1.35;o.plug=1;o.halo=1;o.sid='target';}});
    if(k===1||k===2){let n=0;for(const p of P.pts){if(n>=(k===1?8:16))break;if(W(L.R(p.x,p.z))<0.5)continue;F.push({t:'scale',x:p.x,z:p.z,r:0.05+0.05*p.u*(k===2?1.6:1),sid:'scale'});n++;}}
    if(k===3){const rg=mulberry32(4300),cl=scatter(rg,8,0.5,(x,z)=>L.R(x,z)<0.85);for(const c of cl)for(const[x,z]of scatter(rg,7,0.07,(x,z)=>Math.hypot(x-c[0],z-c[1])<0.28))F.push(vLoop(rg,x,z,{dTop:0.08,dBot:0.3,tilt:0.12,sep:0.03,coil:2.5,coilR:0.03,rad:0.011,sid:'glom',kind:'glomerular'}));
      let n=0;for(const p of P.pts){if(n>=22)break;if(L.ker(p.x,p.z,L.R(p.x,p.z))<0.35)continue;F.push({t:'scale',x:p.x,z:p.z,r:0.08+0.1*p.u,sid:'yscale'});n++;}
      for(const q of[[-0.55,0.35,0.08],[0.6,0.5,0.07],[0.1,-0.75,0.09]])F.push({t:'ulcer',x:q[0],z:q[1],r:q[2],sid:'eros'});setF(L,'glom',cl[0][0],0.18,cl[0][1],0.35);}
    if(k===4){const rg=mulberry32(4400);for(const[x,z]of scatter(rg,12,0.12,(x,z)=>K(x,z)>0.6&&ul(x,z)<0.2))F.push({t:'blood',x,z,r:rr(rg,0.03,0.07),sid:'ulc'});F.push({t:'ulcer',x:UC[0],z:UC[1],r:0.2,sid:'ulc'});
      for(let i=0;i<17;i++){const th=i/17*TAU+rr(rg,-0.12,0.12),R0=S(th)*rr(rg,0.62,0.93);F.push(vLoop(rg,Math.cos(th)*R0,Math.sin(th)*R0,{dTop:0.1,dBot:0.4,tilt:rr(rg,0.72,0.9),az:th+Math.PI+rr(rg,-0.4,0.4),sep:0.062,rad:0.012,halo:true,sid:'hairpin',kind:'hairpin'}));}
      for(let i=0;i<4;i++){const th=rg()*TAU,R0=S(th)*0.8;F.push(vLine(rg,Math.cos(th)*R0,Math.sin(th)*R0,th+Math.PI/2,0.5,0.18,0.013,1.3,'hairpin','linear'));}
      for(const q of[[0,0,0.72,0.45],[-0.6,0.4,0.62,0.35],[0.6,0.5,0.66,0.35],[-0.3,-0.7,0.56,0.32],[0.7,-0.5,0.8,0.3]])F.push({t:'tumor',x:q[0],z:q[1],d:q[2],r:q[3],pig:0,kind:'scc',sid:'lobules'});
      F.push({t:'collagen',x:0,z:0,r:1.7,d0:0.12,d1:0.22,n:40,style:'blotch',ring:1.0,sid:'wsa'});
      const hp=F.find(f=>f.sid==='hairpin'),hm=hp.pts[hp.pts.length>>1];setF(L,'hairpin',hm[0],0.2,hm[2],0.3);}
    setNF(L,'fol',1.5,-1.2,0.05,0.22);setF(L,'spot',P.spots[0].x,0.05,P.spots[0].z,P.spots[0].r);setNF(L,'telf',-1,-2,0.11,0.3);setF(L,'elast',-2.2,0.28,0.6,0.6);
    setF(L,'pseudo',0.3,0.12,0.2,0.55);setNF(L,'scale',0.2,0.2,0.02,0.25);setF(L,'straw',0.2,0.1,-0.3,0.7);setNF(L,'plug',0,0,0.06,0.2);setNF(L,'ros',0.3,0.3,0.03,0.2);
    if(k===2){const r0=nearF(L,'plug',0.4,0.3,f=>f.ros);if(r0)setF(L,'ros',r0[0],0.03,r0[1],0.2);}
    setNF(L,'yscale',0,0,0.02,0.3);setNF(L,'eros',0,0,0.02,0.2);setF(L,'ker',0.1,0.15,-0.1,0.9);setNF(L,'target',1.2,0.2,0.06,0.25);setF(L,'wsa',1.3,0.17,0.3,0.4);setF(L,'ulc',UC[0],0.02,UC[1],0.35);setF(L,'lobules',0,0.7,0,1.2);
    return L;}};

/* ============================ 5 · lentigo → SK → LPLK ============================ */
const SKH=[[0.05,2,0.2],[0.05,4,1.0],[0.04,9,0.5],[0.035,15,2.0],[0.025,23,0.9]];
const fpat=(x,z)=>{const w=fbm(x*0.6,z*0.6,301,2)*3,a=0.6+1.2*fbm(x*0.3,z*0.3,302,2),u=x*Math.cos(a)+z*Math.sin(a)+w*0.12;return 1-smoothstep(0,0.38,Math.abs(Math.sin(u*TAU/0.17)));};
const fpReg=(x,z)=>smoothstep(0.42,0.56,fbm(x*0.5+7,z*0.5,303,2));
const SKP={pts:ptPool(5005,160,2.0,0.15),vs:vPool(5006,20)};
EVO.sk={seed:505,hcase:'sk',hstyle:'sk',secZ:0,
  title:['Solar lentigo, seborrheic keratosis and its regression','Plama soczewicowata słoneczna, rogowacenie łojotokowe i jego regresja'],
  sum:['A solar lentigo can thicken into a seborrheic keratosis, and either can later be cleared by the immune system, passing through a lichen planus-like keratosis (LPLK). Each step keeps traces of the one before: moth-eaten borders and fingerprint lines survive into early SK, and remnants of lentigo or SK survive at the edge of an LPLK.',
    'Plama soczewicowata słoneczna może pogrubieć i przejść w rogowacenie łojotokowe, a każda z tych zmian może później zostać usunięta przez układ odpornościowy, przechodząc przez stadium rogowacenia liszajowatego (LPLK). Każdy etap zachowuje ślady poprzedniego: brzeg „nadżarty przez mole” i struktury odcisku palca przetrwają we wczesnym SK, a resztki plamy soczewicowatej lub SK – na brzegu LPLK.'],
  src:[['https://dermoscopedia.org/Solar_lentigines_/_seborrheic_keratoses_/_lichen_planus-like_keratosis_(full_text)','dermoscopedia, solar lentigo / SK / LPLK']],
  stages:[
    {lbl:['Lentigo','Lentigo'],ph:['Sun-exposed skin · 40s+','Skóra nasłoneczniona · po 40. r.ż.'],h:['Solar lentigo','Plama soczewicowata słoneczna'],grow:0.3,hstyle:'sl',
      see:['A flat, light-brown, sharply demarcated macule. Fine parallel fingerprint-like lines and a moth-eaten border with concave bites; elsewhere a faint, delicate network.','Płaska, jasnobrązowa, ostro odgraniczona plamka. Drobne, równoległe struktury przypominające odcisk palca i brzeg „nadżarty przez mole” z wklęsłymi ubytkami; w innych miejscach słaba, delikatna siatka.'],
      tis:['Rete ridges are elongated and club-shaped, with a heavily pigmented basal layer. Melanocytes are at most slightly increased and never form nests.','Sople naskórka są wydłużone i maczugowate, z silnie zbarwioną warstwą podstawną. Melanocytów jest co najwyżej nieznacznie więcej i nigdy nie tworzą gniazd.'],
      key:['No globules, no dots, a sharp moth-eaten edge: a lentigo is a keratinocyte pigment disorder, not a melanocytic tumour. On the face, beware of lentigo maligna, with grey, asymmetric pigment around follicles.','Brak kulek i kropek, ostry brzeg „nadżarty przez mole”: plama soczewicowata to zaburzenie barwnika w keratynocytach, a nie nowotwór melanocytowy. Na twarzy uważaj na lentigo maligna, w której występuje szary, asymetryczny barwnik wokół ujść mieszków.'],
      st:['fing','moth','struct'],he:['club','elas']},
    {lbl:['Early SK','Wczesne SK'],ph:['Years later · thickening','Po latach · pogrubienie'],h:['Early (reticulated) seborrheic keratosis','Wczesne (siateczkowate) rogowacenie łojotokowe'],grow:0.4,
      see:['Slightly raised and darker. Thick network-like brown lines, the first milia-like cysts and comedo-like openings. Fingerprint lines and the moth-eaten border are still there.','Nieco uniesione i ciemniejsze. Grube, siateczkopodobne brązowe linie, pierwsze torbiele prosakopodobne i ujścia zaskórnikopodobne. Struktury odcisku palca i brzeg „nadżarty przez mole” nadal są widoczne.'],
      tis:['Basaloid keratinocytes proliferate in interconnecting strands (reticulated SK); the first horn pseudocysts form.','Bazaloidne keratynocyty namnażają się w łączących się pasmach (SK siateczkowate); powstają pierwsze pseudotorbiele rogowe.'],
      key:['The thick network-like lines of SK are ridges of proliferating epidermis, not a melanocytic network, and the border stays sharp.','Grube, siateczkopodobne linie SK to grzebienie rozrastającego się naskórka, a nie siatka melanocytowa; brzeg pozostaje ostry.'],
      st:['net','milia','comedo','fing','moth'],he:['basal','hc','inv','elas']},
    {lbl:['SK','SK'],ph:['Established','Rozwinięte'],h:['Classic seborrheic keratosis','Klasyczne rogowacenie łojotokowe'],grow:0.2,
      see:['A stuck-on papule with a brain-like (cerebriform) pattern of fissures and ridges, milia-like cysts, comedo-like openings and hairpin vessels with white halos.','Grudka jakby przyklejona do skóry, z mózgowatym wzorem bruzd i grzebieni, torbielami prosakopodobnymi, ujściami zaskórnikopodobnymi i naczyniami w kształcie spinki do włosów z białą otoczką.'],
      tis:['Acanthosis of basaloid cells with papillomatosis, horn pseudocysts and keratin-filled invaginations; the base is flat and level with the neighbouring epidermis.','Akantoza z komórek bazaloidnych z brodawczakowatością, pseudotorbielami rogowymi i wpukleniami wypełnionymi keratyną; podstawa jest płaska, na poziomie sąsiedniego naskórka.'],
      key:['Everything here is keratin: cysts, plugs and fissures. A benign lesion that can look dark and irregular to the naked eye.','Wszystko tu jest keratyną: torbiele, czopy i bruzdy. Łagodna zmiana, która gołym okiem może wyglądać na ciemną i nieregularną.'],
      st:['gyri','milia','comedo','hairpin','moth'],he:['basal','hc','inv','scL','flatb']},
    {lbl:['LPLK','LPLK'],ph:['Immune regression','Regresja immunologiczna'],h:['Lichen planus-like keratosis','Rogowacenie liszajowate (LPLK)'],grow:0,hstyle:'sl',
      see:['Flatter, pinker and grey. Grey granules (dots) spread diffusely in a granular pattern; remnants of lentigo or SK structures survive at one edge.','Bardziej płaskie, różowe i szare. Szare ziarnistości (kropki) rozsiane w sposób rozlany tworzą wzorzec ziarnisty; na jednym brzegu przetrwały resztki struktur plamy soczewicowatej lub SK.'],
      tis:['A band-like lichenoid infiltrate of lymphocytes attacks the basal layer; the released melanin is taken up by melanophages in the papillary dermis.','Pasmowaty, liszajowaty naciek limfocytów atakuje warstwę podstawną; uwolniona melanina jest pochłaniana przez melanofagi w warstwie brodawkowatej.'],
      key:['Grey granules also mean regression in melanoma. A diffuse granular pattern with remnants of lentigo or SK suggests LPLK, but when in doubt a biopsy is needed.','Szare ziarnistości oznaczają także regresję w czerniaku. Rozlany wzorzec ziarnisty z resztkami plamy soczewicowatej lub SK sugeruje LPLK, ale w razie wątpliwości konieczna jest biopsja.'],
      st:['gran','remn','lich'],he:['lichH','melphH','elas']}],
  S:{fing:{vis:[3,3,3],depth:'≈0.05–0.1 mm',layer:['Epidermis and junction','Naskórek i połączenie skórno-naskórkowe'],n:['Fingerprint-like structures','Struktury odcisku palca'],h:['Pigmented, elongated rete ridges running in parallel.','Zbarwione, wydłużone sople naskórka biegnące równolegle.'],o:['Fine parallel light-brown lines, like a fingerprint.','Drobne równoległe jasnobrązowe linie, jak odcisk palca.']},
    moth:{vis:[3,3,3],depth:'0–0.1 mm',layer:['Epidermis at the edge','Naskórek na brzegu'],n:['Moth-eaten border','Brzeg „nadżarty przez mole”'],h:['The keratinocyte proliferation ends abruptly, with notches.','Rozrost keratynocytów kończy się nagle, z wcięciami.'],o:['A sharp edge with concave bites and no fading.','Ostry brzeg z wklęsłymi ubytkami, bez stopniowego zanikania.']},
    struct:{vis:[3,3,3],depth:'≈0.05 mm',layer:['Basal layer','Warstwa podstawna'],n:['Light-brown structureless area','Jasnobrązowy obszar bezstrukturalny'],h:['Evenly pigmented basal keratinocytes.','Równomiernie zbarwione keratynocyty podstawne.'],o:['Homogeneous light brown.','Jednolity jasny brąz.']},
    net:{vis:[3,3,3],depth:'≈0.05–0.15 mm',layer:LY.epi,n:['Thick network-like lines','Grube siateczkopodobne linie'],h:['Interconnecting strands of pigmented basaloid keratinocytes.','Łączące się pasma zbarwionych keratynocytów bazaloidnych.'],o:['Coarser and more uniform than a nevus network.','Grubsze i bardziej jednolite niż siatka znamienia.']},
    milia:{vis:[3,1,3],depth:'≈0.06–0.22 mm',layer:LY.epi,n:['Milia-like cysts','Torbiele prosakopodobne'],h:['Intraepidermal horn pseudocysts.','Śródnaskórkowe pseudotorbiele rogowe.'],o:['White-yellow “stars”, brightest non-polarized.','Biało-żółte „gwiazdki”, najjaśniejsze w świetle niespolaryzowanym.']},
    comedo:{vis:[3,2,3],depth:'0–0.15 mm',layer:['Stratum corneum into epidermis','Warstwa rogowa i naskórek'],n:['Comedo-like openings','Ujścia zaskórnikopodobne'],h:['Keratin-filled invaginations open to the surface; oxidized keratin is brown-black.','Wpuklenia wypełnione keratyną, otwarte na powierzchnię; utleniona keratyna jest brązowoczarna.'],o:['Round brown-black plugs.','Okrągłe brązowoczarne czopy.']},
    gyri:{vis:[3,3,3],depth:LY.surf,layer:LY.sc,n:['Fissures and ridges (cerebriform)','Bruzdy i grzebienie (wzór mózgowaty)'],h:['A papillomatous surface folded into gyri; keratin collects in the sulci.','Brodawczakowata powierzchnia pofałdowana w zakręty; keratyna gromadzi się w bruzdach.'],o:['Dark curved furrows between paler ridges.','Ciemne zakrzywione bruzdy między jaśniejszymi grzebieniami.']},
    hairpin:{vis:[1,3,1],depth:'≈0.14–0.42 mm',layer:['Papillae inside the thick epidermis','Brodawki w pogrubiałym naskórku'],n:['Hairpin vessels with white halo','Naczynia w kształcie spinki do włosów z białą otoczką'],h:['Capillary loops in elongated papillae surrounded by keratinizing cells.','Pętle włośniczkowe w wydłużonych brodawkach otoczone rogowaciejącymi komórkami.'],o:['Tilted loops seen as hairpins, with a white keratin halo.','Pochylone pętle widoczne jako spinki do włosów, z białą otoczką keratyny.']},
    gran:{vis:[3,2,1],depth:'≈0.1–0.3 mm',layer:LY.pap,n:['Grey granular pattern','Szary wzorzec ziarnisty'],h:['Melanophages in the papillary dermis after immune destruction of the basal layer.','Melanofagi w warstwie brodawkowatej po immunologicznym zniszczeniu warstwy podstawnej.'],o:['Dermal melanin: fine grey granules that fade at 405 nm.','Melanina w skórze właściwej: drobne szare ziarnistości, zanikające w 405 nm.']},
    remn:{vis:[3,3,3],depth:'≈0.05 mm',layer:['Epidermis at the edge','Naskórek na brzegu'],n:['Remnants of lentigo or SK','Resztki plamy soczewicowatej lub SK'],h:['A part of the original lesion not yet reached by the infiltrate.','Część pierwotnej zmiany, do której naciek jeszcze nie dotarł.'],o:['Light-brown structureless or fingerprint areas at one side.','Jasnobrązowe obszary bezstrukturalne lub struktury odcisku palca po jednej stronie.']},
    lich:{vis:[0,1,0],depth:'≈0.05–0.12 mm',layer:LY.dej,n:['Lichenoid infiltrate','Naciek liszajowaty'],h:['A dense band of lymphocytes hugging the junction, with damaged basal cells.','Gęste pasmo limfocytów przylegające do połączenia, z uszkodzonymi komórkami podstawnymi.'],o:['Not visible itself; it creates the pink background and releases the pigment seen as granules.','Sam niewidoczny; daje różowe tło i uwalnia barwnik widoczny jako ziarnistości.']}},
  H:{club:{a:'basalL',m:'fing',n:['Club-shaped pigmented rete ridges','Maczugowate, zbarwione sople naskórka'],d:['Elongated ridges with a heavily pigmented basal layer and no nests.','Wydłużone sople z silnie zbarwioną warstwą podstawną, bez gniazd.']},
    elas:{a:'elastosis',n:['Solar elastosis','Elastoza słoneczna'],d:['Grey-blue elastotic material: the lesion sits on chronically sun-damaged skin.','Szaroniebieski materiał elastotyczny: zmiana leży na skórze przewlekle uszkodzonej słońcem.']},
    basal:{a:'epiL',m:'net',n:['Basaloid keratinocytes','Keratynocyty bazaloidne'],d:['Small uniform cells with little cytoplasm and scattered melanin.','Małe, jednolite komórki z niewielką ilością cytoplazmy i rozproszoną melaniną.']},
    hc:{a:'horncyst',m:'milia',n:['Horn pseudocyst','Pseudotorbiel rogowa'],d:['A ball of laminated keratin inside the epidermis: a milia-like cyst.','Kulka warstwowej keratyny w naskórku: torbiel prosakopodobna.']},
    inv:{a:'invag',m:'comedo',n:['Keratin-filled invagination','Wpuklenie wypełnione keratyną'],d:['A keratin plug open to the surface, oxidized at the top: a comedo-like opening.','Czop keratynowy otwarty na powierzchnię, utleniony u góry: ujście zaskórnikopodobne.']},
    scL:{a:'scL',m:'gyri',n:['Papillomatosis and hyperkeratosis','Brodawczakowatość i hiperkeratoza'],d:['A folded surface with keratin in the clefts: fissures and ridges.','Pofałdowana powierzchnia z keratyną w szczelinach: bruzdy i grzebienie.']},
    flatb:{a:'basalL',m:'moth',n:['Flat base','Płaska podstawa'],d:['The proliferation rests on a line level with the neighbouring epidermis.','Rozrost spoczywa na linii równej z sąsiednim naskórkiem.']},
    lichH:{a:'lichenoid',m:'lich',n:['Lichenoid band infiltrate','Pasmowaty naciek liszajowaty'],d:['Lymphocytes crowd the junction and damage the basal layer.','Limfocyty tłoczą się przy połączeniu i uszkadzają warstwę podstawną.']},
    melphH:{a:'melph',m:'gran',n:['Melanophages','Melanofagi'],d:['Macrophages full of melanin in the papillary dermis: the grey granules.','Makrofagi wypełnione melaniną w warstwie brodawkowatej: szare ziarnistości.']}},
  build(k){const R=[1.6,1.8,2.0,1.9][k],L=baseModel(505),S=makeShape(R,SKH),F=L.features,P=SKP;L.R=rhoFn(S);L.foc={};
    F.push({t:'elastosis',x:0,z:0,r:4.3,d0:0.1,d1:0.4,n:420,sid:'elast'});
    const edge=a=>[Math.cos(a)*S(a),Math.sin(a)*S(a)];
    if(k===0){L.pig=(x,z,r)=>inM(r,0.03)*(0.3+0.26*fpat(x,z)*fpReg(x,z));L.pigD=()=>0.06;L.netI=(x,z,r)=>0.03+0.22*inM(r,0.04)*(1-fpReg(x,z));L.netW=()=>0.12;L.rete=(x,z,r)=>0.055+0.05*inM(r,0.05);}
    else if(k===1){L.elev=(x,z,r)=>0.08*inM(r,0.04);L.epi=(x,z,r)=>0.045+0.1*inM(r,0.03);L.rete=(x,z,r)=>0.055+0.03*inM(r,0.05);
      L.pig=(x,z,r)=>inM(r,0.03)*(0.4+0.16*fpat(x,z)*fpReg(x,z));L.pigD=()=>0.07;L.netI=(x,z,r)=>0.03+0.6*inM(r,0.04)*(1-0.6*fpReg(x,z));L.netW=(x,z,r)=>0.13+0.1*inM(r,0.05);L.irr=(x,z,r)=>lerp(0.15,0.35,inM(r,0.05));
      let a=0,b=0;for(const p of P.pts){if(L.R(p.x,p.z)>0.8)continue;if(p.u<0.5&&a<5){F.push({t:'milia',x:p.x,z:p.z,d:0.07+0.03*p.v,r:0.035+0.015*p.w,sid:'milia'});a++;}else if(p.u>=0.5&&b<5){F.push({t:'comedo',x:p.x,z:p.z,r:0.045+0.025*p.w,sid:'comedo'});b++;}}}
    else if(k===2){const sulc=(x,z)=>smoothstep(0.8,0.94,1-Math.abs(2*fbm(x*1.25+7,z*1.25,33,3)-1));
      L.elev=(x,z,r)=>inM(r,0.04)*(0.36+0.07*(1-sulc(x,z)));L.sc=(x,z,r)=>0.025+inM(r,0.03)*(0.03+0.07*sulc(x,z));L.epi=(x,z,r)=>0.045+inM(r,0.03)*0.28;L.rete=(x,z,r)=>0.055-inM(r,0.03)*0.04;
      L.netI=(x,z,r)=>0.03*(1-inM(r,0.03));L.pig=(x,z,r)=>r>1.2?0:inM(r,0.025)*(0.42+0.3*fbm(x*0.9,z*0.9,55,3));L.pigD=()=>0.07;L.gyri=(x,z,r)=>r>1.2?0:inM(r,0.03)*sulc(x,z);
      let a=0,b=0;for(const p of P.pts){if(L.R(p.x,p.z)>0.85)continue;if(p.u<0.5&&a<14){const big=p.v<0.3;F.push({t:'milia',x:p.x,z:p.z,d:big?0.14+0.08*p.w:0.06+0.06*p.w,r:big?0.07+0.03*p.w:0.035+0.025*p.w,sid:'milia'});a++;}
        else if(p.u>=0.5&&b<11){F.push({t:'comedo',x:p.x,z:p.z,r:0.045+0.04*p.w,sid:'comedo'});b++;}}
      let n=0;for(const v of P.vs){if(n>=10)break;const x=Math.cos(v.a)*v.q*0.75*R,z=Math.sin(v.a)*v.q*0.75*R;F.push(vLoop(mulberry32(v.s),x,z,{dTop:0.14,dBot:0.42,tilt:0.68,sep:0.056,rad:0.012,halo:true,sid:'hairpin',kind:'hairpin'}));n++;}
      const hp=F.find(f=>f.sid==='hairpin'),hm=hp.pts[hp.pts.length>>1];setF(L,'hairpin',hm[0],0.25,hm[2],0.3);}
    else{const rem=(x,z)=>smoothstep(-0.5,-1.15,x);
      L.elev=(x,z,r)=>0.03*inM(r,0.05);L.epi=(x,z,r)=>0.05+0.01*inM(r,0.05);L.rete=(x,z,r)=>0.055+0.02*inM(r,0.05);
      L.pig=(x,z,r)=>inM(r,0.04)*(0.07+rem(x,z)*(0.28+0.18*fpat(x,z)));L.pigD=()=>0.06;L.netI=(x,z,r)=>0.03+0.12*rem(x,z)*inM(r,0.05);L.ery=(x,z,r)=>0.3*inM(r,0.1)*(1-rem(x,z));
      F.push({t:'cloud',x:0.2,z:0,rx:1.55,rz:1.55,d0:0.1,d1:0.28,n:780,size:0.022,c3:'#5E5A69',s2:'dots',hs:'regr',sid:'gran',shape:(x,z)=>L.R(x,z)<0.95&&x>-1.0});
      F.push({t:'lichenoid',x:0.3,z:0,r:1.7,n:520,sid:'lich'});}
    let bx=0,bz=0,bv=-1,cx=0,cz=0,cv=2;for(let i=-8;i<=8;i++)for(let j=-8;j<=8;j++){const x=i*0.2,z=j*0.2;if(L.R(x,z)>0.7)continue;const v=fpReg(x,z);if(v>bv){bv=v;bx=x;bz=z;}if(v<cv){cv=v;cx=x;cz=z;}}
    setF(L,'fing',bx,0.07,bz,0.35);setF(L,'struct',cx,0.05,cz,0.35);const e=edge(0.35);setF(L,'moth',e[0]*0.97,0.05,e[1]*0.97,0.35);setF(L,'net',cx,0.08,cz,0.35);
    setNF(L,'milia',0,0,0.1,0.2);setNF(L,'comedo',0.3,0.3,0.06,0.2);setF(L,'gyri',-0.6,0.03,-0.5,0.55);setF(L,'gran',0.5,0.2,0.2,0.6);setF(L,'remn',-1.3,0.05,0.1,0.4);setF(L,'lich',0.4,0.08,-0.3,0.5);
    return L;}};

/* ============================ 6 · dermatofibroma ============================ */
const DFP={vs:vPool(6006,20)};
EVO.df={seed:606,hcase:'df',hstyle:'df',secZ:0,
  title:['Dermatofibroma: from inflammation to scar','Włókniak skóry: od zapalenia do blizny'],
  sum:['Dermatofibroma often follows minor trauma such as an insect bite or a ruptured follicle, although many appear without a known trigger and clonality points to a neoplastic component. Histologically it tends to move from an early inflammatory, cellular stage to a late fibrotic one. Dermoscopy is thought to mirror this: pink and vascular early, with a central white scar-like patch and a peripheral network once fibrosis dominates.',
    'Włókniak skóry często pojawia się po drobnym urazie, np. ukąszeniu owada lub pęknięciu mieszka włosowego, choć wiele zmian powstaje bez uchwytnej przyczyny, a klonalność wskazuje na komponent nowotworowy. Histologicznie zmiana przechodzi zwykle od wczesnego stadium zapalnego, bogatokomórkowego, do późnego, włóknistego. Dermoskopia prawdopodobnie odzwierciedla ten przebieg: wcześnie przeważają różowe tło i naczynia, a gdy dominuje włóknienie – centralna biała plama bliznowata i obwodowa siatka.'],
  src:[['https://www.dovepress.com/dermatofibroma-reappraisal-and-updated-review-peer-reviewed-fulltext-article-CCID','Dermatofibroma: reappraisal and updated review, CCID'],['https://dermoscopedia.org/Dermatofibromas','dermoscopedia, dermatofibromas']],
  stages:[
    {lbl:['Trigger','Wyzwalacz'],ph:['Weeks · inflamed papule','Tygodnie · zapalna grudka'],h:['Inflammatory papule','Zapalna grudka'],grow:0.3,
      see:['A small pink papule with dotted vessels over most of its surface; a tiny central crust may mark the original injury.','Mała różowa grudka z naczyniami kropkowymi na większości powierzchni; drobny centralny strup może wskazywać miejsce pierwotnego urazu.'],
      tis:['Perivascular lymphocytes and histiocytes in the upper dermis, with the first spindle cells and young collagen.','Okołonaczyniowy naciek limfocytów i histiocytów w górnej części skóry właściwej, z pierwszymi komórkami wrzecionowatymi i młodym kolagenem.'],
      key:['At this stage the lesion is non-specific; the diagnosis becomes clear only as fibrosis develops.','Na tym etapie zmiana jest nieswoista; rozpoznanie staje się jasne dopiero wraz z rozwojem włóknienia.'],
      st:['pink','dots','crust','infl'],he:['inflH','crustH','stor']},
    {lbl:['Months','Miesiące'],ph:['Months · cellular stage','Miesiące · stadium bogatokomórkowe'],h:['Early dermatofibroma','Wczesny włókniak skóry'],grow:0.4,
      see:['Firmer and pink-brown. A faint brown network starts to ring the edge; a small white area appears in the centre among dotted vessels.','Twardsza i różowobrązowa. Na obwodzie zaczyna się tworzyć słaba brązowa siatka; w środku, wśród naczyń kropkowych, pojawia się mały biały obszar.'],
      tis:['Fibroblast-like and histiocytic spindle cells multiply in the dermis; the epidermis above thickens and its basal layer darkens.','W skórze właściwej namnażają się wrzecionowate komórki fibroblastyczne i histiocytarne; naskórek nad nimi pogrubia się, a jego warstwa podstawna ciemnieje.'],
      key:['The epidermis over a dermatofibroma is induced by the dermal process: it thickens and gathers pigment, making the peripheral network.','Naskórek nad włókniakiem jest pobudzany przez proces w skórze właściwej: pogrubia się i gromadzi barwnik, tworząc obwodową siatkę.'],
      st:['dots','net','patch','pink','fibro'],he:['stor','basal','inflH','fibH']},
    {lbl:['Classic','Klasyczny'],ph:['A year or more · classic','Rok i dłużej · klasyczny'],h:['Classic dermatofibroma','Klasyczny włókniak skóry'],grow:0,
      see:['A central white scar-like patch surrounded by a delicate brown network; shiny white lines in polarized light. Pinching the sides produces a dimple.','Centralna biała plama bliznowata otoczona delikatną brązową siatką; w świetle spolaryzowanym białe błyszczące linie. Ściśnięcie zmiany z boków daje objaw dołeczka.'],
      tis:['Storiform spindle cells with collagen trapping at the edge; superficial fibrosis under a hyperpigmented epidermis with broad, flat rete ridges.','Wrzecionowate komórki w układzie storiform z otaczaniem pęczków kolagenu na obwodzie; powierzchowne włóknienie pod przebarwionym naskórkiem z szerokimi, płaskimi soplami.'],
      key:['The white patch is fibrosis seen from above; the network is the stimulated epidermis.','Biała plama to włóknienie widziane z góry; siatka to pobudzony naskórek.'],
      st:['patch','net','shiny','fibro'],he:['basal','grenz','fibH','stor','trap']},
    {lbl:['Late','Późny'],ph:['Years · sclerotic','Lata · stwardniały'],h:['Late, fibrotic dermatofibroma','Późny, zwłókniały włókniak skóry'],grow:0,
      see:['The white area has expanded and the network has shrunk to a thin, pale rim; vessels are scarce.','Biały obszar się powiększył, a siatka zwęziła się do cienkiego, bladego obrzeża; naczyń jest niewiele.'],
      tis:['Fewer cells and more dense, hyalinized collagen.','Mniej komórek, więcej gęstego, zeszkliwiałego kolagenu.'],
      key:['A stable, benign, scar-like nodule. One that keeps growing, becomes large or ulcerates needs a biopsy to exclude dermatofibrosarcoma protuberans.','Stabilny, łagodny guzek przypominający bliznę. Zmiana, która stale rośnie, osiąga duże rozmiary lub owrzodzi, wymaga biopsji w celu wykluczenia guza Darriera-Ferranda (dermatofibrosarcoma protuberans).'],
      st:['patch','net','shiny','fibro'],he:['fibH','trap','stor','basal']}],
  S:{pink:{vis:[2,3,1],depth:'≈0.1–0.3 mm',layer:LY.pap,n:['Pink structureless area','Różowy obszar bezstrukturalny'],h:['Inflamed, hypervascular papillary dermis.','Zapalnie zmieniona, bogato unaczyniona warstwa brodawkowata.'],o:['Diffuse pink from many small vessels.','Rozlany róż od licznych drobnych naczyń.']},
    dots:{vis:[1,3,1],depth:'≈0.1–0.3 mm',layer:LY.pap,n:['Dotted vessels','Naczynia kropkowe'],h:['Capillary loops in the papillae, seen end-on.','Pętle włośniczkowe w brodawkach widziane od czoła.'],o:['Small red dots; best without pressure.','Małe czerwone kropki; najlepiej widoczne bez ucisku.']},
    crust:{vis:[3,3,3],depth:LY.surf,layer:LY.sc,n:['Central crust','Centralny strup'],h:['Serum and blood at the site of the injury.','Surowica i krew w miejscu urazu.'],o:['A small red-brown spot.','Mały czerwonobrązowy punkt.']},
    infl:{vis:[0,1,0],depth:'≈0.1–0.6 mm',layer:LY.derm,n:['Perivascular inflammation','Okołonaczyniowy naciek zapalny'],h:['Lymphocytes and histiocytes around dermal vessels.','Limfocyty i histiocyty wokół naczyń skóry właściwej.'],o:['Not visible directly; it makes the lesion pink.','Niewidoczny bezpośrednio; nadaje zmianie różowy kolor.']},
    net:{vis:[3,3,3],depth:'≈0.05–0.13 mm',layer:LY.dej,n:['Delicate peripheral network','Delikatna siatka obwodowa'],h:['Hyperpigmented basal layer over broad, flat rete ridges.','Przebarwiona warstwa podstawna nad szerokimi, płaskimi soplami.'],o:['Thin light-brown lines ringing the lesion.','Cienkie jasnobrązowe linie otaczające zmianę.']},
    patch:{vis:[3,3,1],depth:'≈0.1–0.3 mm',layer:LY.pap,n:['Central white scar-like patch','Centralna biała plama bliznowata'],h:['Fibrosis of the superficial dermis.','Włóknienie powierzchownej skóry właściwej.'],o:['Dense collagen scatters all wavelengths: white.','Gęsty kolagen rozprasza wszystkie długości fali: biel.']},
    shiny:SHINY,
    fibro:{vis:[0,1,0],depth:'≈0.1–1.3 mm',layer:LY.derm,n:['Fibrohistiocytic proliferation','Rozrost włóknisto-histiocytarny'],h:['Spindle cells and collagen in the dermis; they tether the epidermis (dimple sign).','Komórki wrzecionowate i kolagen w skórze właściwej; pociągają naskórek (objaw dołeczka).'],o:['Too deep to see as a structure; it makes the centre white and firm.','Zbyt głęboko, by tworzyć strukturę; sprawia, że środek jest biały i twardy.']}},
  H:{inflH:{a:'inflam',m:'infl',n:['Perivascular infiltrate','Naciek okołonaczyniowy'],d:['Lymphocytes cuffing small vessels of the upper dermis.','Limfocyty otaczające drobne naczynia górnej części skóry właściwej.']},
    crustH:{a:'blood',m:'crust',n:['Crust at the injury site','Strup w miejscu urazu'],d:['Serum and red cells on the surface.','Surowica i krwinki czerwone na powierzchni.']},
    stor:{a:'storiform',m:'fibro',n:['Storiform spindle cells','Komórki wrzecionowate w układzie storiform'],d:['Fibroblast-like and histiocytic cells in short whorls.','Komórki fibroblastyczne i histiocytarne w krótkich wirach.']},
    trap:{a:'trapping',m:'fibro',n:['Collagen trapping','Otaczanie pęczków kolagenu'],d:['Thick collagen bundles wrapped by spindle cells at the edge.','Grube pęczki kolagenu otoczone komórkami wrzecionowatymi na obwodzie.']},
    basal:{a:'basalL',m:'net',n:['Basal hyperpigmentation','Przebarwienie warstwy podstawnej'],d:['Broad, flat, pigmented rete ridges (“dirty fingers”).','Szerokie, płaskie, zbarwione sople naskórka („brudne palce”).']},
    fibH:{a:'fibrosis',m:'patch',n:['Superficial fibrosis','Powierzchowne włóknienie'],d:['Dense collagen under the epidermis: the white patch.','Gęsty kolagen pod naskórkiem: biała plama.']},
    grenz:{a:'grenz',n:['Grenz zone','Strefa Grenz'],d:['A thin band of uninvolved papillary dermis under the epidermis.','Wąskie pasmo niezajętej warstwy brodawkowatej pod naskórkiem.']}},
  build(k){const R=[0.95,1.3,1.8,1.95][k],L=baseModel(606),S=makeShape(R,[[0.05,2,0.4],[0.04,3,1.6]]),F=L.features;L.R=rhoFn(S);L.foc={};
    const rs=[0.9,0.5,0.3,0.55][k],ri=[0,0.4,0.66,0.45][k];
    L.elev=(x,z,r)=>[0.12,0.1,0.13,0.14][k]*inM(r,0.2)*(1-0.45*r*r);L.epi=(x,z,r)=>0.045+[0.005,0.02,0.035,0.035][k]*inM(r,0.1);L.rete=(x,z,r)=>0.055+[0,0.015,0.03,0.03][k]*inM(r,0.1);
    L.netW=(x,z,r)=>0.13-[0,0.03,0.05,0.06][k]*inM(r,0.1);L.irr=(x,z,r)=>lerp(0.15,0.18,inM(r,0.1));L.netI=(x,z,r)=>0.03+inM(r,0.08)*ri*smoothstep(rs,rs+0.3,r);
    L.pig=(x,z,r)=>r>1.2?0:inM(r,0.1)*[0,0.1,0.2,0.14][k]*smoothstep(rs,rs+0.3,r);L.ery=(x,z,r)=>r>1.3?0:[0.55,0.35,0.12,0.06][k]*inM(r,0.15);
    const nv=[14,9,3,1][k],vr=[0.8,0.55,0.5,0.4][k];for(let i=0;i<nv;i++){const v=DFP.vs[i],x=Math.cos(v.a)*v.q*vr*R,z=Math.sin(v.a)*v.q*vr*R;F.push(vLoop(mulberry32(v.s),x,z,{dTop:0.1,dBot:0.3,tilt:0.06,rad:k<2?0.016:0.012,sid:'dots',kind:'dotted'}));}
    if(k===0){F.push({t:'blood',x:0.05,z:-0.05,r:0.07,sid:'crust'});F.push({t:'infl',x:0,z:0,r:0.75,d0:0.12,d1:0.55,n:12,sid:'infl'});F.push({t:'collagen',x:0,z:0,r:0.55,d0:0.31,d1:0.6,n:60,style:'dense',sid:'fibro'});}
    if(k===1){F.push({t:'scar',x:0.05,z:0.05,r:0.35,a:0.65,sid:'patch'});F.push({t:'infl',x:0,z:0,r:0.9,d0:0.15,d1:0.7,n:6,sid:'infl'});F.push({t:'collagen',x:0,z:0,r:0.85,d0:0.31,d1:0.85,n:150,style:'dense',sid:'fibro'});}
    if(k>=2){F.push({t:'scar',x:0.05,z:0.05,r:k===2?0.8:1.15,strong:1,sid:'patch'});F.push({t:'collagen',x:0,z:0,r:k===2?1.05:1.2,d0:0.12,d1:k===2?1.2:1.3,n:k===2?300:340,style:'dense',sid:'fibro'});
      F.push({t:'collagen',x:0,z:0,r:k===2?0.6:0.9,d0:0.12,d1:0.2,n:k===2?36:50,style:'lines',sid:'shiny'});}
    setF(L,'pink',0.3,0.15,-0.2,0.55);setNF(L,'dots',0.2,0.2,0.2,0.2);setF(L,'crust',0.05,0.02,-0.05,0.15);setF(L,'infl',0,0.3,0,0.7);setF(L,'net',(rs+0.2)*R,0.09,0.15,0.3);
    setF(L,'patch',0.05,0.2,0.05,[0.3,0.35,0.8,1.15][k]);setF(L,'shiny',0.2,0.16,0.1,0.5);setF(L,'fibro',0,0.6,0,R*0.55);
    return L;}};

const EVO_ORDER=['nevus','melanoma','bcc','ak','sk','df'];
/* stage model: structures, histology items and what is new or gone compared with the previous stage */
function evoModel(id){const[,seq,ks]=id.split(':'),k=+ks,E=EVO[seq],st=E.stages[k];
  const L=E.build(k);L.id=id;L.evo={seq,k};L.hcase=st.hcase||E.hcase;L.hstyle=st.hstyle||E.hstyle;L.secZ=L.secZ!=null?L.secZ:(E.secZ||0);L.akFrac=L.akFrac||st.akFrac||0.33;
  if(L.kind!=='nail'){evoSkin(L,E.seed,{face:!!E.face});finalize(L);}
  L.structures=st.st.map(sid=>{const e=E.S[sid],f=L.foc[sid]||[null,null],dp=e.depth;
    return{sid,vis:e.vis,focus:f[0],foot:f[1],name:e.n[0],layer:e.layer[0],depth:Array.isArray(dp)?dp[0]:dp,histo:e.h[0],optic:e.o[0],
      pl:{name:e.n[1],layer:e.layer[1],depth:Array.isArray(dp)?dp[1]:plNum(dp),histo:e.h[1],optic:e.o[1]}};});
  L.hItems=st.he.map(key=>{const e=E.H[key],ms=[].concat(e.m||[]),m=ms.find(q=>L.foc[q])||ms[0],fz=m&&L.foc[m]?L.foc[m][0][2]:undefined;return{a:e.a,m,pick:e.pick,z:fz,n:e.n[0],d:e.d[0],pl:[e.n[1],e.d[1]]};});
  const prev=k>0&&!E.ddx?E.stages[k-1].st:null;L.evoNew=new Set(prev?st.st.filter(s=>!prev.includes(s)):[]);L.evoGone=prev?prev.filter(s=>!st.st.includes(s)).map(s=>E.S[s].n):[];
  L.name=ev(E.title);L.sub=ev(st.h);L.summary='';return L;}

/* =====================================================================
   Chapter 08 · melanoma in difficult sites: the face (lentigo maligna)
   and the nail unit (nail apparatus melanoma). Same machinery as
   chapter 07: each sequence is a list of stages (or, for the "mimics"
   sets, a list of look-alike lesions shown side by side).
   Numbers in the texts are taken from the cited abstracts.
   ===================================================================== */
Object.assign(I18N.en,{'ch.sites':'Difficult sites','c7.kicker':'08 · Difficult sites','evo.item':'Lesion {n} of {m}','sites.ddx':'Look-alikes',
  'sites.hint':'Each sequence keeps the same skin or the same nail, so only the lesion changes. In the look-alike sets, step through the lesions and use Compare to put two of them side by side.'});
Object.assign(I18N.pl,{'ch.sites':'Trudne lokalizacje','c7.kicker':'08 · Trudne lokalizacje','evo.item':'Zmiana {n} z {m}','sites.ddx':'Naśladowcy',
  'sites.hint':'Każda sekwencja zachowuje tę samą skórę lub ten sam paznokieć, więc zmienia się tylko sama zmiana. W zestawach naśladowców przechodź między zmianami i użyj Porównaj, aby zestawić dwie obok siebie.'});
const SITES_ORDER=['lm','facedx','nail','naildx'],EVO_SHORT_X={};
Object.assign(EVO_SHORT_X,{lm:['Face · lentigo maligna','Twarz · lentigo maligna'],facedx:['Face · look-alikes','Twarz · naśladowcy'],nail:['Nail · melanoma','Paznokieć · czerniak'],naildx:['Nail · look-alikes','Paznokieć · naśladowcy']});

/* a follicle close to the centre, so the default section passes through follicles */
const LMZ=(()=>{let b=0,bd=9;for(let j=-2;j<=2;j++)for(let i=-2;i<=2;i++){const p=folPt(i,j),d=Math.hypot(p[0]-0.2,p[1]);if(d<bd){bd=d;b=p[1];}}return Math.round(b*1000)/1000;})();
const LMP={spots:(()=>{const r=mulberry32(7004),o=[];for(let i=0;i<8;i++)o.push({x:rr(r,-3.5,3.5),z:rr(r,-3.5,3.5),r:rr(r,0.3,0.55),a:rr(r,0.22,0.36),seed:(r()*97)|0});return o;})(),vs:vPool(7005,40),tel:vPool(7006,6)};
const LMS={
  bgpig:{vis:[3,3,3],depth:'≈0.04–0.06 mm',layer:['Basal layer','Warstwa podstawna'],n:['Light-brown pseudo-network','Jasnobrązowa pseudosiatka'],h:['Melanin in the basal layer between follicles; facial skin has flat rete ridges, so there is no true network.','Melanina w warstwie podstawnej między mieszkami; skóra twarzy ma spłaszczone sople, więc nie powstaje prawdziwa siatka.'],
    o:['Brown background interrupted by the pale, round follicular openings.','Brązowe tło przerywane jasnymi, okrągłymi ujściami mieszków.']},
  fol:{vis:[3,3,3],depth:'0–0.15 mm',layer:['Follicular openings','Ujścia mieszków'],n:['Spared follicular openings','Oszczędzone ujścia mieszków'],h:['Follicular infundibula, numerous and wide on facial skin.','Lejki mieszków włosowych, liczne i szerokie na skórze twarzy.'],o:['Pale round holes in the pigment.','Jasne okrągłe otwory w barwniku.']},
  afol:{vis:[3,3,3],depth:'≈0.03–0.15 mm',layer:['Follicular epithelium','Nabłonek mieszka'],n:['Asymmetric pigmented follicular openings','Asymetrycznie zabarwione ujścia mieszków'],h:['Atypical melanocytes descend along one side of the follicular infundibulum first.','Atypowe melanocyty schodzą najpierw wzdłuż jednej strony lejka mieszka.'],
    o:['A dark rim around only part of the opening. The most frequent LM clue (71% of LM, 23% of other flat facial lesions).','Ciemny brzeg tylko wokół części ujścia. Najczęstsza cecha LM (71% LM, 23% innych płaskich zmian twarzy).']},
  plp:{vis:[3,3,2],depth:'≈0.03–0.12 mm',layer:['Follicular epithelium and junction','Nabłonek mieszka i połączenie'],n:['Perifollicular linear projections','Okołomieszkowe projekcje linijne'],h:['Buds of pigmented keratinocytes with lentiginous atypical melanocytes growing outward from dilated infundibula.','Wypustki zabarwionych keratynocytów z lentiginozowo rosnącymi atypowymi melanocytami, wyrastające na zewnątrz z poszerzonych lejków.'],
    o:['Short pigmented lines radiating from the follicle rim, some linking neighbouring follicles. Specificity 96% for LM.','Krótkie zabarwione linie promieniście odchodzące od brzegu mieszka, niektóre łączą sąsiednie mieszki. Swoistość 96% dla LM.']},
  agEarly:{vis:[2,3,1],depth:'≈0.12–0.25 mm',layer:LY.pap,n:['First grey dots','Pierwsze szare kropki'],h:['A few melanophages in the papillary dermis near follicles.','Nieliczne melanofagi w warstwie brodawkowatej przy mieszkach.'],o:['Fine grey dots close to some follicles.','Drobne szare kropki przy niektórych mieszkach.']},
  ag:{vis:[2,3,1],depth:'≈0.12–0.3 mm',layer:LY.pap,n:['Annular-granular pattern','Wzorzec ziarnisto-obrączkowaty'],h:['Melanophages and atypical melanocytes arranged around the follicles.','Melanofagi i atypowe melanocyty ułożone wokół mieszków.'],
    o:['Grey-brown dots in rings around follicular openings. Also seen in pigmented AK and LPLK.','Szarobrązowe kropki ułożone obrączkowato wokół ujść mieszków. Występują także w barwnikowym AK i LPLK.']},
  cwc:{vis:[2,3,2],depth:'≈0.03–0.15 mm',layer:['Follicular epithelium','Nabłonek mieszka'],n:['Circle within a circle','Koło w kole'],h:['Follicular epidermal projections curving around the infundibulum.','Wypustki nabłonka mieszka zakrzywiające się wokół lejka.'],o:['A grey ring inside the pigmented rim of a follicle.','Szary pierścień wewnątrz zabarwionego brzegu mieszka.']},
  gray:{vis:[2,3,1],depth:'≈0.1–0.3 mm',layer:LY.pap,n:['Grey colour','Barwa szara'],h:['Melanin in the papillary dermis (melanophages) and deeper melanocytes.','Melanina w warstwie brodawkowatej (melanofagi) i głębiej położone melanocyty.'],
    o:['On flat facial lesions grey is a clue to malignancy (relative risk 2.2).','W płaskich zmianach twarzy barwa szara wskazuje na złośliwość (ryzyko względne 2,2).']},
  rhomb:{vis:[3,3,2],depth:'≈0.03–0.2 mm',layer:['Junction around follicles','Połączenie wokół mieszków'],n:['Rhomboidal structures','Struktury romboidalne'],h:['Fused follicular projections and confluent junctional melanocytes enclosing each follicle.','Zlane wypustki mieszków i zlewne melanocyty połączenia, otaczające każdy mieszek.'],
    o:['Thick grey-brown angular lines around follicles. Grey rhomboids: sixfold probability of LM over pigmented AK.','Grube szarobrązowe kanciaste linie wokół mieszków. Szare romboidy: sześciokrotnie większe prawdopodobieństwo LM niż barwnikowego AK.']},
  obl:{vis:[3,3,3],depth:'≈0.03–0.2 mm',layer:['Epidermis and follicles','Naskórek i mieszki'],n:['Obliterated follicles','Zatarte ujścia mieszków'],h:['Atypical melanocytes fill the follicular epithelium; the openings disappear under pigment.','Atypowe melanocyty wypełniają nabłonek mieszków; ujścia znikają pod barwnikiem.'],o:['Dark homogeneous areas without follicular openings.','Ciemne jednolite obszary bez ujść mieszków.']},
  blotchLM:{vis:[3,3,2],depth:'0–0.2 mm',layer:['Epidermis and upper dermis','Naskórek i górna skóra właściwa'],n:['Dark blotches','Ciemne plamy (blotches)'],h:['Dense melanin through the epidermis and in the papillary dermis.','Gęsta melanina w całym naskórku i w warstwie brodawkowatej.'],o:['Structureless dark brown to black areas.','Bezstrukturalne obszary ciemnobrązowe do czarnych.']},
  vasc:{vis:[1,3,1],depth:'≈0.1–0.35 mm',layer:LY.pap,n:['Increased density of vessels','Zwiększona gęstość naczyń'],h:['New capillaries around the invasive tumour.','Nowe włośniczki wokół naciekającego guza.'],o:['Dotted and linear vessels, more than in the surrounding skin (58% of LMM).','Naczynia kropkowe i linijne, liczniejsze niż w otaczającej skórze (58% LMM).']},
  redRh:{vis:[1,3,1],depth:'≈0.08–0.25 mm',layer:LY.pap,n:['Red rhomboidal structures','Czerwone struktury romboidalne'],h:['Dilated vessels outlining follicles where the tumour invades.','Poszerzone naczynia obrysowujące mieszki w miejscu naciekania.'],o:['Red angular lines around follicles (40% of LMM).','Czerwone kanciaste linie wokół mieszków (40% LMM).']},
  target:{vis:[3,3,2],depth:'≈0.05–0.2 mm',layer:['Follicles','Mieszki'],n:['Target-like follicles','Mieszki tarczowate'],h:['A pigmented follicle centre inside a pigmented ring.','Zabarwiony środek mieszka wewnątrz zabarwionego pierścienia.'],o:['A dark dot inside a ring (41% of LMM).','Ciemna kropka wewnątrz pierścienia (41% LMM).']},
  nodLM:{vis:[1,2,1],depth:'≈0.1–0.6 mm',layer:LY.derm,n:['Blue-grey raised area','Niebieskoszary uniesiony obszar'],h:['Invasive melanoma cells in the dermis under a dense lymphocytic band.','Komórki czerniaka naciekające skórę właściwą pod gęstym pasmem limfocytów.'],o:['Blue-grey to blue-white colour over a slightly raised zone.','Barwa niebieskoszara do niebiesko-białej nad lekko uniesionym obszarem.']},
  elast:{vis:[0,1,0],depth:'≈0.12–0.45 mm',layer:['Upper dermis','Górna część skóry właściwej'],n:['Solar elastosis','Elastoza słoneczna'],h:['Degenerated elastic fibres: the background of chronically sun-damaged skin.','Zwyrodniałe włókna sprężyste: tło przewlekle uszkodzonej słońcem skóry.'],o:['Not a dermoscopic structure; it makes the dermis paler.','Nie jest strukturą dermoskopową; sprawia, że skóra właściwa jest bledsza.']},
  /* look-alikes */
  fing:{vis:[3,3,3],depth:'≈0.05 mm',layer:['Elongated rete ridges','Wydłużone sople'],n:['Fingerprint-like lines','Linie jak odcisk palca'],h:['Pigmented, elongated, budding rete ridges of a solar lentigo.','Zabarwione, wydłużone, pączkujące sople naskórka plamy soczewicowatej.'],o:['Thin parallel brown lines, like a fingerprint.','Cienkie równoległe brązowe linie, jak odcisk palca.']},
  moth:{vis:[3,3,3],depth:'≈0.05 mm',layer:LY.epi,n:['Moth-eaten border','Brzeg „zjedzony przez mole”'],h:['Sharp, scalloped edge of a lentigo.','Ostry, falisty brzeg plamy soczewicowatej.'],o:['Concave bites in a sharply demarcated border.','Wklęsłe „wygryzienia” w ostro odgraniczonym brzegu.']},
  wcirc:{vis:[3,3,2],depth:'≈0.02–0.1 mm',layer:['Follicular infundibulum','Lejek mieszka'],n:['White circles','Białe koła'],h:['Keratin-filled follicular openings with thickened infundibular epithelium.','Ujścia mieszków wypełnione keratyną, z pogrubiałym nabłonkiem lejka.'],o:['White rings around follicles: 14-fold probability of pigmented AK over LM.','Białe pierścienie wokół mieszków: 14-krotnie większe prawdopodobieństwo barwnikowego AK niż LM.']},
  scaleF:{vis:[2,3,3],depth:LY.surf,layer:LY.sc,n:['Scale','Łuska'],h:['Parakeratosis over atypical keratinocytes.','Parakeratoza nad atypowymi keratynocytami.'],o:['Whitish flakes; eightfold probability of pigmented AK.','Białawe łuski; ośmiokrotnie większe prawdopodobieństwo barwnikowego AK.']},
  redF:{vis:[2,3,1],depth:'≈0.1–0.2 mm',layer:LY.pap,n:['Red colour (red pseudo-network)','Barwa czerwona (czerwona pseudosiatka)'],h:['Dilated interfollicular capillaries.','Poszerzone włośniczki między mieszkami.'],o:['Pink-red background between follicles: fourfold probability of pigmented AK.','Różowoczerwone tło między mieszkami: czterokrotnie większe prawdopodobieństwo barwnikowego AK.']},
  pakPig:{vis:[3,3,3],depth:'≈0.03–0.15 mm',layer:['Epidermis and papillary dermis','Naskórek i warstwa brodawkowata'],n:['Brown-grey pseudo-network','Brązowoszara pseudosiatka'],h:['Melanin in atypical keratinocytes and a few melanophages; melanocytes are not increased.','Melanina w atypowych keratynocytach i nieliczne melanofagi; melanocytów nie przybywa.'],o:['Brown to grey pigment between follicles, with a sharp border.','Brązowy do szarego barwnik między mieszkami, z ostrym brzegiem.']},
  pepper:{vis:[2,3,1],depth:'≈0.1–0.3 mm',layer:LY.pap,n:['Diffuse grey granularity','Rozlana szara ziarnistość'],h:['Melanophages scattered through the papillary dermis after lichenoid inflammation.','Melanofagi rozsiane w warstwie brodawkowatej po zapaleniu liszajowatym.'],o:['Grey dots everywhere, not organised around follicles.','Szare kropki wszędzie, nieułożone wokół mieszków.']},
  remnL:{vis:[3,3,3],depth:'≈0.05 mm',layer:LY.epi,n:['Remnant of lentigo','Pozostałość plamy soczewicowatej'],h:['Part of the original solar lentigo not yet cleared.','Fragment pierwotnej plamy soczewicowatej, jeszcze nieusunięty.'],o:['Light-brown area with lentigo features at one edge.','Jasnobrązowy obszar z cechami plamy soczewicowatej przy jednym brzegu.']}};
const LMH={
  lmbasal:{a:'lmbasal',m:'afol',n:['Atypical melanocytes along the basal layer','Atypowe melanocyty wzdłuż warstwy podstawnej'],d:['Single, crowded melanocytes with angulated hyperchromatic nuclei and clear halos replace basal keratinocytes of a thin, flattened epidermis (lentiginous growth).','Pojedyncze, stłoczone melanocyty o kanciastych, hiperchromatycznych jądrach z jasną otoczką zastępują keratynocyty warstwy podstawnej cienkiego, spłaszczonego naskórka (wzrost lentiginozowy).']},
  adnex:{a:'lmadnex',m:'afol',n:['Adnexal extension','Szerzenie się wzdłuż przydatków'],d:['Atypical melanocytes descend along the outer root sheath of the follicular infundibulum. Seen from above, they pigment the rim of the opening.','Atypowe melanocyty schodzą wzdłuż pochewki zewnętrznej lejka mieszka. Widziane z góry zabarwiają brzeg ujścia.']},
  bud:{a:'lmbud',m:'plp',n:['Follicular epidermal projection','Wypustka nabłonka mieszka'],d:['A bud of pigmented keratinocytes with lentiginous melanocytes growing out of a dilated infundibulum: the histological correlate of a perifollicular linear projection.','Wypustka zabarwionych keratynocytów z lentiginozowo ułożonymi melanocytami, wyrastająca z poszerzonego lejka: histologiczny odpowiednik okołomieszkowej projekcji linijnej.']},
  meph:{a:'lmmeph',m:['ag','agEarly'],n:['Melanophages around the follicle','Melanofagi wokół mieszka'],d:['Macrophages filled with coarse melanin in the papillary dermis around the follicle: the grey dots.','Makrofagi wypełnione grubymi ziarnami melaniny w warstwie brodawkowatej wokół mieszka: szare kropki.']},
  elas:{a:'elastosis',m:'elast',n:['Solar elastosis','Elastoza słoneczna'],d:['Grey-blue elastotic material in the upper dermis: lentigo maligna arises in chronically sun-damaged skin.','Szaroniebieski materiał elastotyczny w górnej części skóry właściwej: lentigo maligna powstaje w skórze przewlekle uszkodzonej słońcem.']},
  thin:{a:'epiL',n:['Atrophic epidermis','Zanikowy naskórek'],d:['Thin epidermis with flat rete ridges; the melanocytes sit directly on a straight junction.','Cienki naskórek ze spłaszczonymi soplami; melanocyty leżą bezpośrednio na prostym połączeniu.']},
  confl:{a:'lmconfl',m:'rhomb',n:['Confluent junctional melanocytes','Zlewne melanocyty połączenia'],d:['Melanocytes touch one another along long stretches of the junction, with small nests.','Melanocyty stykają się ze sobą na długich odcinkach połączenia, tworząc też małe gniazda.']},
  pag:{a:'pagetoid',m:'rhomb',n:['Pagetoid melanocytes','Melanocyty pagetoidalne'],d:['Single atypical melanocytes above the basal layer.','Pojedyncze atypowe melanocyty powyżej warstwy podstawnej.']},
  fill:{a:'lmfill',m:'obl',n:['Follicle filled with melanocytes','Mieszek wypełniony melanocytami'],d:['Atypical melanocytes replace the follicular epithelium; melanin fills the infundibulum.','Atypowe melanocyty zastępują nabłonek mieszka; melanina wypełnia lejek.']},
  inv:{a:'melnodule',m:'nodLM',n:['Invasive lentigo maligna melanoma','Inwazyjny czerniak typu lentigo maligna'],d:['Atypical spindled and epithelioid melanocytes in the papillary dermis. Breslow thickness is measured from the granular layer to the deepest cell.','Atypowe wrzecionowate i nabłonkowate melanocyty w warstwie brodawkowatej. Grubość wg Breslowa mierzy się od warstwy ziarnistej do najgłębiej położonej komórki.']},
  lymph:{a:'lichenoid',m:'nodLM',n:['Lymphocytic band','Pasmo limfocytów'],d:['A dense band of lymphocytes under the invasive area.','Gęste pasmo limfocytów pod obszarem naciekania.']},
  vascH:{a:'neo',m:'vasc',n:['New vessels','Nowe naczynia'],d:['Dilated capillaries around the tumour: the increased vascular density seen with the dermatoscope.','Poszerzone włośniczki wokół guza: zwiększona gęstość naczyń widoczna w dermatoskopie.']},
  /* look-alikes */
  slR:{a:'basalL',m:'fing',n:['Elongated, pigmented rete ridges','Wydłużone, zabarwione sople'],d:['Club-shaped rete ridges with pigmented basal keratinocytes; melanocytes are not increased and not atypical.','Maczugowate sople z zabarwionymi keratynocytami warstwy podstawnej; melanocytów nie przybywa i nie są atypowe.']},
  akb:{a:'akatyp',m:'pakPig',n:['Basal keratinocyte atypia (AK)','Atypia keratynocytów warstwy podstawnej (AK)'],d:['Atypical keratinocytes, not melanocytes, in the lower epidermis; melanin is in keratinocytes.','Atypowe są keratynocyty, nie melanocyty, w dolnej części naskórka; melanina znajduje się w keratynocytach.']},
  para:{a:'para',m:'scaleF',n:['Parakeratosis','Parakeratoza'],d:['Retained nuclei in the keratin: the scale.','Zachowane jądra w warstwie rogowej: łuska.']},
  infW:{a:'infund2',m:'wcirc',n:['Follicular infundibulum','Lejek mieszka'],d:['Spared, keratin-filled infundibulum: the white circle.','Oszczędzony lejek wypełniony keratyną: białe koło.']},
  lich:{a:'lichenoid',m:'pepper',n:['Lichenoid band','Pasmo liszajowate'],d:['Lymphocytes along the junction destroy basal keratinocytes.','Limfocyty wzdłuż połączenia niszczą keratynocyty warstwy podstawnej.']},
  mphL:{a:'melph',m:'pepper',n:['Scattered melanophages','Rozsiane melanofagi'],d:['Melanin dropped into the dermis and taken up by macrophages: grey dots without follicular organisation.','Melanina, która przedostała się do skóry właściwej i została pochłonięta przez makrofagi: szare kropki bez związku z mieszkami.']}};

/* face: follicle-centred lentigo maligna structures. f.lm holds what to draw around one follicle */
function lmFollicles(L,W,k,core){faceFollicles(L,(o,r)=>{const w=W(r);if(w<0.3)return;const h=o.h,h2=hash2(Math.round(o.x*97),Math.round(o.z*89),5),ang=h2*TAU;
  const lm={asym:0,aA:ang,aW:1.3+1.2*hash2(Math.round(o.x*31),3,9),plp:0,plpL:0,ag:0,cwc:0,rh:0,obl:0,redRh:0,tgt:0,col:0.7+0.3*w};
  if(k===0){if(h<0.55){lm.asym=1;o.sid='afol';}else return;}
  if(k===1){if(h<0.75){lm.asym=1;o.sid='afol';}if(h<0.6){lm.plp=1+((h2*2.99)|0);lm.plpL=0.045+0.05*w;o.sid='plp';}if(h>0.72&&h<0.92){lm.ag=6;o.sid='agEarly';}}
  if(k===2){lm.asym=1;o.sid='afol';if(h<0.7){lm.plp=2+((h2*1.99)|0);lm.plpL=0.07+0.07*w;o.sid='plp';}if(h<0.4){lm.cwc=1;o.sid='cwc';}if(h>0.25){lm.ag=12;if(h>0.75)o.sid='ag';}}
  if(k>=3){lm.asym=1;lm.ag=16;lm.agS=1.55;if(h<0.7){lm.rh=0.7+0.3*w;o.sid='rhomb';}else{lm.cwc=1;lm.plp=2;lm.plpL=0.1;o.sid='cwc';}}
  if(k>=4&&core(o.x,o.z)>0.45){lm.obl=1;o.sid='obl';}
  if(k===5){const rz=Math.hypot(o.x-LMN.x,o.z-LMN.z);if(rz<0.75&&!lm.obl&&h<0.6){lm.redRh=1;lm.rh=0;o.sid='redRh';}else if(rz<1.1&&!lm.obl&&h>0.8){lm.tgt=1;o.sid='target';}}
  o.lm=lm;});}
const LMN={x:1.05,z:0.6,r:0.42};
/* pin a structure on the follicle nearest to (x,z) that shows it */
function setLmF(L,sid,pred,x,z,d,fr){let b=null,bd=1e9;for(const f of L.features){if(f.t!=='folopen'||!f.lm||!pred(f.lm))continue;const dd=(f.x-x)**2+(f.z-z)**2;if(dd<bd){bd=dd;b=f;}}if(b)setF(L,sid,b.x,d,b.z,fr);}
EVO.lm={seed:707,face:true,hcase:'lm',hstyle:'lm',secZ:LMZ,
  title:['Lentigo maligna on the face','Lentigo maligna na twarzy'],
  sum:['Lentigo maligna (LM) is melanoma in situ on chronically sun-damaged skin of older people, most often the cheek and nose. Facial skin has flat rete ridges and dense, wide follicles, so there is no true pigment network: the pigment collects around the follicular openings. The progression model follows the atypical melanocytes as they move from the junction into the follicles and between them: asymmetric follicular pigmentation, perifollicular linear projections, circles within circles with an annular-granular pattern, rhomboidal structures, and finally obliterated follicles. Growth takes years; invasion turns LM into lentigo maligna melanoma (LMM).',
    'Lentigo maligna (LM) to czerniak in situ na przewlekle uszkodzonej słońcem skórze osób starszych, najczęściej na policzku i nosie. Skóra twarzy ma spłaszczone sople naskórka oraz liczne, szerokie mieszki włosowe, dlatego nie powstaje prawdziwa siatka barwnikowa: barwnik gromadzi się wokół ujść mieszków. Model progresji śledzi atypowe melanocyty, które z połączenia skórno-naskórkowego wnikają do mieszków i szerzą się między nimi: asymetryczna pigmentacja ujść, okołomieszkowe projekcje linijne, koło w kole ze wzorcem ziarnisto-obrączkowatym, struktury romboidalne, a na końcu zatarcie ujść mieszków. Rozwój trwa latami; naciekanie zmienia LM w czerniaka typu lentigo maligna (LMM).'],
  note:['Progression model after Schiffner et al. (2000), updated with perifollicular linear projections as stage 2 (Navarrete-Dechent et al., 2024).','Model progresji wg Schiffnera i wsp. (2000), uzupełniony o okołomieszkowe projekcje linijne jako etap 2 (Navarrete-Dechent i wsp., 2024).'],
  src:[['https://pubmed.ncbi.nlm.nih.gov/10607316/','Schiffner et al., JAAD 2000'],['https://doi.org/10.1016/j.jaad.2023.07.1036','Navarrete-Dechent et al., JAAD 2024'],['https://pubmed.ncbi.nlm.nih.gov/22404578/','Pralong et al., Br J Dermatol 2012'],
    ['https://pubmed.ncbi.nlm.nih.gov/26784739/','Lallas et al., Br J Dermatol 2016'],['https://pubmed.ncbi.nlm.nih.gov/24661420/','Tschandl et al., JEADV 2015'],['https://pubmed.ncbi.nlm.nih.gov/29274094/','Persechino et al., Exp Dermatol 2018'],['https://pubmed.ncbi.nlm.nih.gov/41854120/','IDS consensus on LM, JEADV 2026']],
  stages:[
    {lbl:['1 · Follicles','1 · Mieszki'],ph:['LM in situ · earliest','LM in situ · najwcześniej'],h:['Asymmetric pigmented follicular openings','Asymetrycznie zabarwione ujścia mieszków'],grow:0.3,
      see:['An ill-defined light-brown macule on photodamaged skin. Most follicular openings look normal, but several carry a darker rim of pigment on one side only: the pigment hugs part of the opening, not its whole circumference.','Słabo odgraniczona jasnobrązowa plama na skórze uszkodzonej słońcem. Większość ujść mieszków wygląda prawidłowo, ale kilka ma ciemniejszy brzeg barwnika tylko z jednej strony: barwnik obejmuje część ujścia, a nie cały jego obwód.'],
      tis:['Atypical melanocytes, single and crowded, line the basal layer of a thin epidermis and begin to descend along the outer root sheath of the follicular infundibula (adnexal extension). Solar elastosis lies below.','Atypowe melanocyty, pojedyncze i stłoczone, wyściełają warstwę podstawną cienkiego naskórka i zaczynają schodzić wzdłuż pochewki zewnętrznej lejków mieszków (szerzenie się wzdłuż przydatków). Poniżej elastoza słoneczna.'],
      key:['Asymmetric follicular pigmentation is the most frequent LM clue: 71% of LM, but also 23% of benign flat facial lesions (Navarrete-Dechent 2024). On its own it is not specific; look for the next steps.','Asymetryczna pigmentacja ujść to najczęstsza cecha LM: 71% LM, ale też 23% łagodnych płaskich zmian twarzy (Navarrete-Dechent 2024). Sama w sobie nie jest swoista; szukaj kolejnych etapów.'],
      st:['afol','bgpig','fol','elast'],he:['lmbasal','adnex','thin','elas']},
    {lbl:['2 · Projections','2 · Projekcje'],ph:['LM in situ','LM in situ'],h:['Perifollicular linear projections','Okołomieszkowe projekcje linijne'],grow:0.4,
      see:['Short pigmented lines radiate outward from the rim of several follicles, like spokes, and some begin to reach the neighbouring follicle. A few fine grey dots appear near some openings.','Krótkie zabarwione linie odchodzą promieniście od brzegu kilku mieszków jak szprychy, a niektóre zaczynają sięgać sąsiedniego mieszka. Przy niektórych ujściach pojawiają się pierwsze drobne szare kropki.'],
      tis:['Buds of epidermis grow outward from dilated follicular infundibula. They are made of pigmented keratinocytes with a lentiginous proliferation of atypical melanocytes; reflectance confocal microscopy shows them as “bulging” of the follicle.','Z poszerzonych lejków mieszków wyrastają na zewnątrz wypustki naskórka. Tworzą je zabarwione keratynocyty z lentiginozowym rozrostem atypowych melanocytów; w mikroskopii konfokalnej widoczne są jako „uwypuklenia” (bulging) mieszka.'],
      key:['Perifollicular linear projections (PLP): in 252 flat pigmented facial lesions, sensitivity 61.8% and specificity 96.0% for LM (only 4% of benign lesions showed them; OR 26.1 in multivariable analysis). PLP in a facial macule should prompt a biopsy (Navarrete-Dechent 2024).','Okołomieszkowe projekcje linijne (PLP): w 252 płaskich barwnikowych zmianach twarzy czułość 61,8% i swoistość 96,0% dla LM (tylko 4% zmian łagodnych; OR 26,1 w analizie wieloczynnikowej). PLP w plamie na twarzy powinny skłonić do biopsji (Navarrete-Dechent 2024).'],
      st:['plp','afol','agEarly','bgpig','fol'],he:['bud','lmbasal','adnex','elas']},
    {lbl:['3 · Circles','3 · Koła'],ph:['LM in situ · spreading','LM in situ · szerzenie się'],h:['Circle within a circle, annular-granular pattern','Koło w kole, wzorzec ziarnisto-obrączkowaty'],grow:0.5,
      see:['Grey to brown dots surround the follicles in rings (annular-granular pattern). In some follicles a second, grey ring sits inside the pigmented rim: the circle within a circle. Grey appears in the lesion.','Szare do brązowych kropki otaczają mieszki pierścieniami (wzorzec ziarnisto-obrączkowaty). W niektórych mieszkach wewnątrz zabarwionego brzegu leży drugi, szary pierścień: koło w kole. W zmianie pojawia się barwa szara.'],
      tis:['Atypical melanocytes extend further down the follicular epithelium; melanophages gather in the papillary dermis around the follicles (the grey dots). Projections curving around a follicle form the inner circle.','Atypowe melanocyty schodzą głębiej wzdłuż nabłonka mieszka; w warstwie brodawkowatej wokół mieszków gromadzą się melanofagi (szare kropki). Wypustki zakrzywiające się wokół mieszka tworzą wewnętrzne koło.'],
      key:['On flat facial lesions grey is the colour to look for: grey structures doubled the risk of malignancy (RR 2.2), and a pattern of circles had the highest predictive value for LM (Tschandl 2015). Grey dots alone also occur in pigmented AK and LPLK.','W płaskich zmianach twarzy szukaj barwy szarej: szare struktury podwajały ryzyko złośliwości (RR 2,2), a wzorzec kół miał najwyższą wartość predykcyjną dla LM (Tschandl 2015). Same szare kropki występują też w barwnikowym AK i LPLK.'],
      st:['cwc','ag','plp','gray','fol'],he:['meph','adnex','bud','lmbasal']},
    {lbl:['4 · Rhomboids','4 · Romboidy'],ph:['LM in situ · established','LM in situ · rozwinięte'],h:['Rhomboidal structures','Struktury romboidalne'],grow:0.6,
      see:['Thick grey-brown lines run between follicles and enclose them in angular, rhomboid shapes. The lesion is larger, darker and more asymmetric. Grey dots of the annular-granular pattern persist in rings around the follicles and along the rhomboid lines.','Grube szarobrązowe linie biegną między mieszkami i zamykają je w kanciastych, romboidalnych kształtach. Zmiana jest większa, ciemniejsza i bardziej asymetryczna. Szare kropki wzorca ziarnisto-obrączkowatego nadal otaczają mieszki i układają się wzdłuż linii romboidalnych.'],
      tis:['Confluent atypical melanocytes along the junction and down the follicles, small nests and pagetoid cells; the projections of neighbouring follicles have fused.','Zlewne atypowe melanocyty wzdłuż połączenia i w dół mieszków, małe gniazda i komórki pagetoidalne; wypustki sąsiednich mieszków zlały się ze sobą.'],
      key:['Grey rhomboids were the strongest predictor of LM against pigmented AK (sixfold; Lallas 2016). Dark rhomboidal structures are one of Schiffner’s four criteria, with asymmetric pigmented follicles and slate-grey dots and globules (sensitivity 89%, specificity 96%). In the updated model, rhomboids grow out of the follicles.','Szare romboidy były najsilniejszym predyktorem LM w porównaniu z barwnikowym AK (sześciokrotnie; Lallas 2016). Ciemne struktury romboidalne to jedno z czterech kryteriów Schiffnera, obok asymetrycznie zabarwionych mieszków oraz łupkowoszarych kropek i grudek (czułość 89%, swoistość 96%). W zaktualizowanym modelu romboidy wyrastają z mieszków.'],
      st:['rhomb','ag','cwc','gray','fol'],he:['confl','pag','meph','adnex']},
    {lbl:['5 · Obliteration','5 · Zatarcie'],ph:['LM in situ · advanced','LM in situ · zaawansowane'],h:['Obliterated follicles','Zatarte ujścia mieszków'],grow:0.5,
      see:['In the centre the follicular openings disappear under dark brown to black homogeneous areas; pale openings survive only at the edge, still ringed by grey dots (annular-granular pattern). Several colours.','W środku ujścia mieszków znikają pod ciemnobrązowymi do czarnych jednolitymi obszarami; jasne ujścia pozostają tylko na obwodzie, nadal otoczone szarymi kropkami (wzorzec ziarnisto-obrączkowaty). Kilka barw.'],
      tis:['Atypical melanocytes fill the follicular epithelium and the epidermis between follicles; pigment effaces the openings. Still in situ.','Atypowe melanocyty wypełniają nabłonek mieszków i naskórek między nimi; barwnik zaciera ujścia. Wciąż in situ.'],
      key:['In 125 LMM, at least one classic criterion was present in 87%; several colours, pigmented rhomboids and obliterated follicles were more frequent in invasive tumours (Pralong 2012). LM spreads beyond its visible edge: the IDS consensus (2026) favours margin-controlled excision for large or ill-defined LM and advises against blind destructive treatment.','W 125 LMM co najmniej jedno klasyczne kryterium występowało w 87%; liczne barwy, zabarwione romboidy i zatarte mieszki częściej stwierdzano w guzach inwazyjnych (Pralong 2012). LM szerzy się poza widoczny brzeg: konsensus IDS (2026) zaleca wycięcie z kontrolą marginesów przy dużych lub słabo odgraniczonych zmianach i odradza niszczenie zmiany „na ślepo”.'],
      st:['obl','blotchLM','rhomb','gray','ag'],he:['fill','confl','pag','meph']},
    {lbl:['6 · LMM','6 · LMM'],ph:['Lentigo maligna melanoma','Czerniak typu lentigo maligna'],h:['Invasion: vessels and a blue-grey area','Naciekanie: naczynia i niebieskoszary obszar'],grow:0.4,br:0.6,pT:'pT1a',clark:'III',
      see:['A slightly raised blue-grey zone appears within the flat lesion. The vessels become denser; red angular lines outline some follicles (red rhomboids) and some follicles show a dark dot inside a ring (target-like). Around the invasive area the flat part keeps its rhomboids and the annular-granular pattern.','W obrębie płaskiej zmiany pojawia się lekko uniesiony niebieskoszary obszar. Naczyń przybywa; czerwone kanciaste linie obrysowują niektóre mieszki (czerwone romboidy), a w niektórych mieszkach widać ciemną kropkę w pierścieniu (wzór tarczowaty). Wokół obszaru naciekania płaska część zmiany zachowuje romboidy i wzorzec ziarnisto-obrączkowaty.'],
      tis:['Spindled and epithelioid melanoma cells cross the basement membrane into the papillary dermis, with a band of lymphocytes and melanophages in a background of solar elastosis.','Wrzecionowate i nabłonkowate komórki czerniaka przekraczają błonę podstawną i wnikają do warstwy brodawkowatej; towarzyszy im pasmo limfocytów i melanofagi na tle elastozy słonecznej.'],
      key:['Invasion signs in LMM are mostly vascular: increased density of the vascular network (58%), red rhomboidal structures (40%) and target-like patterns (41%) in 125 LMM (Pralong 2012). Classic signs of other melanomas, such as blue-white veil or ulceration, are rare.','Cechy naciekania w LMM są głównie naczyniowe: zwiększona gęstość sieci naczyń (58%), czerwone struktury romboidalne (40%) i wzory tarczowate (41%) w 125 LMM (Pralong 2012). Klasyczne cechy innych czerniaków, jak niebiesko-biały welon czy owrzodzenie, są rzadkie.'],
      st:['nodLM','vasc','redRh','target','obl','rhomb','ag'],he:['inv','lymph','vascH','elas']}],
  S:LMS,H:LMH,
  build(k){const R=[1.5,1.8,2.05,2.35,2.5,2.6][k],L=baseModel(707),S=makeShape(R,[[0.12,2,0.4],[0.08,3,1.4],[0.05,5,0.3],[0.03,7,2.2]]),F=L.features;L.R=rhoFn(S,0.1,0);L.foc={};L.lmLvl=k;
    const soft=[0.35,0.3,0.26,0.22,0.2,0.2][k],W=r=>inM(r,soft),spar=(x,z)=>smoothstep(0.045,0.13,folDist(x,z));
    const core=k>=4?blobFn(-0.2,-0.15,[0,0,0,0,0.95,1.05][k],0.4,17):()=>0,dark=(x,z)=>0.65+0.35*fbm(x*1.3,z*1.3,71,3);
    L.epi=()=>0.032;L.rete=()=>0.024;L.irr=()=>0.15;L.netI=()=>0;L.pigD=(x,z,r)=>0.055+0.03*core(x,z);
    L.pig=(x,z,r)=>{const w=W(r);if(w<=0)return 0;const c=core(x,z);return w*([0.36,0.4,0.46,0.52,0.56,0.58][k]*dark(x,z)*(0.3+0.7*spar(x,z))*(1-c)+c*0.95);};
    if(k===5){const n=blobFn(LMN.x,LMN.z,LMN.r,0.5,23);L.elev=(x,z)=>0.1*n(x,z);L.ery=(x,z,r)=>0.25*W(r)+0.35*n(x,z);
      F.push({t:'tumor',kind:'mel',x:LMN.x,z:LMN.z,r:0.3,d0:0.05,d1:0.62,sid:'nodLM'});F.push({t:'veil',x:LMN.x,z:LMN.z,r:0.42,sid:'nodLM'});
      F.push({t:'lichenoid',x:LMN.x,z:LMN.z,r:0.7,n:260,sid:'nodLM'});
      const rg=mulberry32(7700);for(const[x,z]of scatter(rg,30,0.12,(x,z)=>Math.hypot(x-LMN.x,z-LMN.z)<1.0))F.push(vLoop(rg,x,z,{dTop:0.1,dBot:0.32,tilt:rg()<0.5?0.1:0.7,sep:0.04,rad:0.011,sid:'vasc',kind:'dotted'}));
      for(let i=0;i<5;i++){const a=rg()*TAU;F.push(vLine(rg,LMN.x+Math.cos(a)*0.5,LMN.z+Math.sin(a)*0.5,a+Math.PI/2,0.45,0.13,0.012,1.4,'vasc','linear'));}
      L.brs={x:LMN.x,z:LMN.z,mm:0.6};L.secZ=LMN.z;}
    // field: sun damage, solar lentigines, fine vessels, elastosis
    for(const s of LMP.spots){if(L.R(s.x,s.z)<1.2)continue;F.push({t:'spot',x:s.x,z:s.z,r:s.r,a:s.a,seed:s.seed,sid:'spot'});}
    for(let i=0;i<4;i++){const v=LMP.tel[i];F.push(vLine(mulberry32(v.s),-3.3+v.u*4,-3+i*1.9+v.v*0.4,(v.w-0.5)*1.2,1.3+v.u,0.1,0.01,0.7,'telf','tel'));}
    F.push({t:'elastosis',x:0,z:0,r:4.3,d0:0.1,d1:0.42,n:700,sid:'elast'});
    lmFollicles(L,W,k,core);
    // grey dots (melanophages) in rings around follicles
    if(k>=1){const amt=[0,110,320,760,720,660][k],dmax=k>=3?0.17:0.15;F.push({t:'cloud',x:0.1,z:0,rx:R*0.95,rz:R*0.95,d0:0.12,d1:0.24,n:amt,size:k>=3?0.03:0.021,c3:'#6A6676',s2:'dots',hs:'regr',sid:'ag',shape:(x,z)=>{const d=folDist(x,z);return d>0.075&&d<dmax&&L.R(x,z)<0.92&&core(x,z)<0.5;}});}
    if(k>=4)F.push({t:'blotch',x:-0.2,z:-0.15,r:[0,0,0,0,0.75,0.85][k],d:0.06,sid:'blotchLM'});
    // pins
    const pick=(sid,pred,x=0.3,z=0.2,d=0.05,fr=0.18)=>setLmF(L,sid,pred,x,z,d,fr);
    pick('afol',l=>l.asym&&!l.plp&&!l.rh&&!l.obl,0.4,0.3);pick('plp',l=>l.plp>=2&&!l.rh,0.2,-0.3,0.07);pick('cwc',l=>l.cwc&&!l.obl,-0.4,0.4,0.06);
    pick('rhomb',l=>l.rh>0,0.6,-0.5,0.08);pick('obl',l=>l.obl,-0.2,-0.15,0.08,0.25);pick('redRh',l=>l.redRh,LMN.x,LMN.z,0.12);pick('target',l=>l.tgt,LMN.x+0.5,LMN.z,0.1);
    setNF(L,'fol',1.6,1.2,0.05,0.2,f=>!f.lm);pick('agEarly',l=>l.ag,0.5,0.5,0.18);pick('ag',l=>l.ag,0.5,0.5,0.18,0.22);
    setF(L,'bgpig',-0.6,0.05,0.5,0.4);setF(L,'gray',0.7,0.2,0.6,0.4);setF(L,'blotchLM',-0.2,0.06,-0.15,0.6);setF(L,'elast',-2.2,0.28,0.8,0.6);
    if(k===5){setF(L,'nodLM',LMN.x,0.35,LMN.z,0.45);const v=F.find(f=>f.sid==='vasc'),m=v.pts[v.pts.length>>1];setF(L,'vasc',m[0],0.18,m[2],0.3);}
    return L;}};

/* ---------------- face look-alikes ---------------- */
const SLSH=[[0.06,2,0.2],[0.05,4,1.0],[0.05,9,0.5],[0.045,15,2.0],[0.03,23,0.9]];
EVO.facedx={seed:717,face:true,ddx:true,hcase:'lm',hstyle:'lm',secZ:LMZ,
  title:['Flat pigmented lesions of the face: look-alikes','Płaskie barwnikowe zmiany twarzy: naśladowcy'],
  sum:['Solar lentigo, flat seborrheic keratosis, pigmented actinic keratosis and lichen planus-like keratosis (LPLK) share the same sun-damaged skin and the same follicle-dominated architecture as lentigo maligna. Their benign patterns are what give them away. The inverse approach turns this around: when a flat pigmented facial lesion shows none of the benign patterns, consider lentigo maligna.',
    'Plama soczewicowata słoneczna, płaskie rogowacenie łojotokowe, barwnikowe rogowacenie słoneczne i rogowacenie liszajowate (LPLK) powstają na tej samej uszkodzonej słońcem skórze i mają tę samą, zdominowaną przez mieszki architekturę co lentigo maligna. Zdradzają je ich łagodne wzorce. Podejście odwrotne (inverse approach) odwraca tę logikę: jeśli płaska barwnikowa zmiana na twarzy nie ma żadnego z łagodnych wzorców, rozważ lentigo maligna.'],
  src:[['https://pubmed.ncbi.nlm.nih.gov/32592885/','Lallas et al., inverse approach, JAAD 2021'],['https://pubmed.ncbi.nlm.nih.gov/26784739/','Lallas et al., LM vs PAK, Br J Dermatol 2016'],['https://pubmed.ncbi.nlm.nih.gov/24661420/','Tschandl et al., JEADV 2015'],
    ['https://pubmed.ncbi.nlm.nih.gov/29274094/','Persechino et al., Exp Dermatol 2018'],['https://pubmed.ncbi.nlm.nih.gov/10607316/','Schiffner et al., JAAD 2000']],
  stages:[
    {lbl:['Lentigo','Lentigo'],ph:['Benign · solar lentigo / flat SK','Łagodne · plama soczewicowata / płaskie SK'],h:['Solar lentigo','Plama soczewicowata słoneczna'],grow:0,hstyle:'sl',
      see:['Light brown and uniform, with a sharp border bitten into by concave notches (moth-eaten border) and fine parallel fingerprint-like lines. The follicles are evenly spared.','Jasnobrązowa i jednolita, z ostrym brzegiem z wklęsłymi „wygryzieniami” (brzeg zjedzony przez mole) i z cienkimi, równoległymi liniami jak odcisk palca. Mieszki są równomiernie oszczędzone.'],
      tis:['Elongated, club-shaped, budding rete ridges with pigmented basal keratinocytes. Melanocytes are not increased and not atypical.','Wydłużone, maczugowate, pączkujące sople z zabarwionymi keratynocytami warstwy podstawnej. Melanocytów nie przybywa i nie są atypowe.'],
      key:['Sharp border, moth-eaten edge, fingerprint pattern and one light-brown colour: the patterns of solar lentigo and flat SK. These were the lesions Schiffner compared with early LM.','Ostry brzeg, „zjedzony przez mole” obrys, wzór odcisku palca i jedna jasnobrązowa barwa: wzorce plamy soczewicowatej i płaskiego SK. Właśnie z nimi Schiffner porównywał wczesne LM.'],
      st:['fing','moth','fol','elast'],he:['slR','elas']},
    {lbl:['Pigmented AK','Barwnikowe AK'],ph:['Keratinocytic · pigmented actinic keratosis','Keratynocytowe · barwnikowe rogowacenie słoneczne'],h:['Pigmented actinic keratosis','Barwnikowe rogowacenie słoneczne'],grow:0,hstyle:'ak',
      see:['Brown-grey pseudo-network with a sharp border, white circles around keratin-filled follicles, whitish scale and pink-red background between follicles.','Brązowoszara pseudosiatka z ostrym brzegiem, białe koła wokół mieszków wypełnionych keratyną, biaława łuska i różowoczerwone tło między mieszkami.'],
      tis:['Atypical keratinocytes in the basal layer carry the melanin; melanocytes are not increased. Parakeratosis on top, a few melanophages below.','Melaninę zawierają atypowe keratynocyty warstwy podstawnej; melanocytów nie przybywa. Na powierzchni parakeratoza, poniżej nieliczne melanofagi.'],
      key:['The hardest LM mimic. White circles (14-fold), scale (eightfold) and red colour (fourfold) point to pigmented AK (Lallas 2016); scale, white circles and a sharp border were the best clues in Tschandl 2015. Pigmented AK can also show grey dots and asymmetric follicles.','Najtrudniejszy naśladowca LM. Białe koła (14-krotnie), łuska (ośmiokrotnie) i barwa czerwona (czterokrotnie) wskazują na barwnikowe AK (Lallas 2016); u Tschandla (2015) najlepszymi wskazówkami były łuska, białe koła i ostry brzeg. Barwnikowe AK może też mieć szare kropki i asymetryczne mieszki.'],
      st:['wcirc','scaleF','redF','pakPig','fol'],he:['akb','para','infW','elas']},
    {lbl:['LPLK','LPLK'],ph:['Benign · regressing lentigo or SK','Łagodne · regresja plamy lub SK'],h:['Lichen planus-like keratosis','Rogowacenie liszajowate (LPLK)'],grow:0,hstyle:'sl',
      see:['Diffuse fine grey granules all over the lesion, not arranged around the follicles; a light-brown remnant of the former lentigo at one edge; sometimes pink.','Rozlane drobne szare ziarenka w całej zmianie, nieułożone wokół mieszków; przy jednym brzegu jasnobrązowa pozostałość dawnej plamy; czasem różowe zabarwienie.'],
      tis:['A band of lymphocytes along the junction destroys the basal layer; the melanin drops into the dermis and is taken up by melanophages.','Pasmo limfocytów wzdłuż połączenia niszczy warstwę podstawną; melanina przedostaje się do skóry właściwej i zostaje pochłonięta przez melanofagi.'],
      key:['Grey without follicle-centred organisation favours LPLK; grey dots in rings around follicles keep LM in the differential. In confocal microscopy, LPLK and solar lentigo are easier to separate from LM than pigmented AK (Persechino 2018). When in doubt, biopsy.','Szarość bez związku z mieszkami przemawia za LPLK; szare kropki ułożone obrączkowato wokół mieszków utrzymują LM w diagnostyce różnicowej. W mikroskopii konfokalnej LPLK i plamę soczewicowatą łatwiej odróżnić od LM niż barwnikowe AK (Persechino 2018). W razie wątpliwości – biopsja.'],
      st:['pepper','remnL','fol','elast'],he:['lich','mphL','elas']},
    {lbl:['LM','LM'],ph:['Malignant · lentigo maligna','Złośliwe · lentigo maligna'],h:['Lentigo maligna','Lentigo maligna'],grow:0,
      see:['Ill-defined border, asymmetric pigmented follicles, perifollicular linear projections, grey dots in rings and grey rhomboids. None of the benign patterns.','Słabo odgraniczony brzeg, asymetrycznie zabarwione mieszki, okołomieszkowe projekcje linijne, szare kropki w pierścieniach i szare romboidy. Brak któregokolwiek z łagodnych wzorców.'],
      tis:['Atypical melanocytes along the junction and down the follicles, melanophages around follicles, solar elastosis.','Atypowe melanocyty wzdłuż połączenia i w dół mieszków, melanofagi wokół mieszków, elastoza słoneczna.'],
      key:['Inverse approach: readers trained to suspect LM when a flat facial lesion lacks the patterns of solar lentigo, flat SK and pigmented AK raised their sensitivity for LM from 51.5% to 83.6% (Lallas 2021). Confirm with a dermoscopy-guided biopsy; several partial biopsies may be needed (IDS consensus 2026).','Podejście odwrotne: lekarze nauczeni podejrzewać LM, gdy płaska zmiana na twarzy nie ma wzorców plamy soczewicowatej, płaskiego SK ani barwnikowego AK, zwiększyli czułość rozpoznania LM z 51,5% do 83,6% (Lallas 2021). Rozpoznanie potwierdza biopsja ukierunkowana dermoskopowo; może być potrzebnych kilka biopsji częściowych (konsensus IDS 2026).'],
      st:['rhomb','plp','ag','afol','gray'],he:['lmbasal','adnex','meph','bud']}],
  S:LMS,H:LMH,
  build(k){const L=baseModel(717),F=L.features;L.foc={};
    F.push({t:'elastosis',x:0,z:0,r:4.3,d0:0.1,d1:0.42,n:700,sid:'elast'});
    for(let i=0;i<3;i++){const v=LMP.tel[i+2];F.push(vLine(mulberry32(v.s),-3.3+v.u*4,-3+i*2.6+v.v*0.4,(v.w-0.5)*1.2,1.3+v.u,0.1,0.01,0.7,'telf','tel'));}
    L.epi=()=>0.034;L.rete=()=>0.026;L.netI=()=>0;
    if(k===0){const S=makeShape(1.7,SLSH);L.R=rhoFn(S);L.pig=(x,z,r)=>inM(r,0.03)*(0.3+0.26*fpat(x,z)*fpReg(x,z));L.pigD=()=>0.06;L.netI=(x,z,r)=>0.2*inM(r,0.04)*(1-fpReg(x,z));L.netW=()=>0.12;L.rete=(x,z,r)=>0.03+0.05*inM(r,0.05);
      faceFollicles(L,()=>{});const e=a=>[Math.cos(a)*S(a),Math.sin(a)*S(a)];let bx=0,bz=0,bv=-1;for(let i=-8;i<=8;i++)for(let j=-8;j<=8;j++){const x=i*0.2,z=j*0.2;if(L.R(x,z)>0.7)continue;const v=fpReg(x,z);if(v>bv){bv=v;bx=x;bz=z;}}
      setF(L,'fing',bx,0.06,bz,0.35);const p=e(0.35);setF(L,'moth',p[0]*0.97,0.05,p[1]*0.97,0.35);}
    else if(k===1){const S=makeShape(1.6,[[0.07,2,0.5],[0.05,3,1.3],[0.03,5,0.2]]),spar=(x,z)=>smoothstep(0.06,0.15,folDist(x,z));L.R=rhoFn(S);const W=r=>inM(r,0.08);
      L.pig=(x,z,r)=>W(r)*0.5*(0.2+0.8*spar(x,z))*(0.7+0.3*fbm(x*1.2,z*1.2,41,3));L.pigD=()=>0.09;L.ery=(x,z,r)=>0.25*W(r)*spar(x,z);L.ker=(x,z,r)=>0.25*W(r)*smoothstep(0.55,0.72,fbm(x*2.2,z*2.2,61,3));L.sc=(x,z,r)=>0.02+0.02*W(r);L.akFrac=0.33;
      faceFollicles(L,(o,r)=>{if(W(r)>0.4){o.plug=0.7;o.halo=0.85;o.sid='wcirc';if(o.h<0.25)o.lm={asym:1,aA:o.h*40,aW:1.6,col:0.55};}});
      let n=0;const pts=ptPool(7101,90,1.4,0.15);for(const p of pts){if(n>=12)break;F.push({t:'scale',x:p.x,z:p.z,r:0.06+0.06*p.u,sid:'scaleF'});n++;}
      F.push({t:'cloud',x:0,z:0,rx:1.3,rz:1.3,d0:0.12,d1:0.24,n:90,size:0.016,c3:'#6A6676',s2:'dots',hs:'regr',sid:'pakPig',shape:(x,z)=>L.R(x,z)<0.9});
      setNF(L,'wcirc',0.3,0.3,0.05,0.2,f=>f.sid==='wcirc');setNF(L,'scaleF',0,0,0.02,0.2);setF(L,'redF',-0.3,0.15,0.4,0.4);setF(L,'pakPig',0.4,0.08,-0.4,0.45);}
    else if(k===2){const S=makeShape(1.65,SLSH);L.R=rhoFn(S);const rem=(x,z)=>smoothstep(-0.4,-1.1,x);
      L.pig=(x,z,r)=>inM(r,0.04)*(0.06+rem(x,z)*(0.28+0.18*fpat(x,z)));L.pigD=()=>0.06;L.ery=(x,z,r)=>0.28*inM(r,0.1)*(1-rem(x,z));
      faceFollicles(L,()=>{});
      F.push({t:'cloud',x:0.2,z:0,rx:1.6,rz:1.6,d0:0.1,d1:0.28,n:820,size:0.02,c3:'#5E5A69',s2:'dots',hs:'regr',sid:'pepper',shape:(x,z)=>L.R(x,z)<0.95&&x>-0.9});
      F.push({t:'lichenoid',x:0.3,z:0,r:1.7,n:520,sid:'pepper'});setF(L,'pepper',0.5,0.2,0.2,0.6);setF(L,'remnL',-1.2,0.05,0.1,0.4);}
    else{const S=makeShape(2.1,[[0.12,2,0.4],[0.08,3,1.4],[0.05,5,0.3],[0.03,7,2.2]]);L.R=rhoFn(S,0.1,0);L.lmLvl=3;const W=r=>inM(r,0.24),spar=(x,z)=>smoothstep(0.045,0.13,folDist(x,z));
      L.pig=(x,z,r)=>W(r)*0.4*(0.65+0.35*fbm(x*1.3,z*1.3,71,3))*(0.3+0.7*spar(x,z));L.pigD=()=>0.06;lmFollicles(L,W,3,()=>0);
      F.push({t:'cloud',x:0.1,z:0,rx:2.0,rz:2.0,d0:0.12,d1:0.26,n:320,size:0.016,c3:'#6A6676',s2:'dots',hs:'regr',sid:'ag',shape:(x,z)=>{const d=folDist(x,z);return d>0.075&&d<0.15&&L.R(x,z)<0.92;}});
      setLmF(L,'rhomb',l=>l.rh>0,0.6,-0.5,0.08,0.18);setLmF(L,'plp',l=>l.plp,0.2,-0.3,0.07,0.18);setLmF(L,'afol',l=>l.asym&&!l.rh,0.4,0.3,0.05,0.18);setLmF(L,'ag',l=>l.ag,-0.5,0.5,0.18,0.22);setF(L,'gray',0.7,0.2,0.6,0.4);}
    setNF(L,'fol',1.9,1.3,0.05,0.2,f=>!f.lm&&f.sid==='fol');setF(L,'elast',-2.2,0.28,0.8,0.6);
    return L;}};

/* =====================================================================
   The nail unit. A 16 × 16 mm block of a fingertip (1 scene unit = 2 mm):
   proximal nail fold over the matrix (left), lunula, nail plate over the
   nail bed, hyponychium (right), lateral folds at the sides, distal
   phalanx below. Each column is a stack of 7 bands, so the walls, the
   section and the virtual H&E are cut from the same anatomy.
   ===================================================================== */
const NU={mmU:2,x0:-3.72,xC:-1.75,xL:-1.0,xH:3.45,zP:3.0};
const NSLOTS=[{k:'skin',g:'sc'},{k:'fderm',g:'pap'},{k:'epon',g:'epi'},{k:'plate',g:'sc'},{k:'epith',g:'epi'},{k:'derm',g:'ret'},{k:'bone',g:'sub'}];
const nxC=z=>NU.xC-0.3*(z/NU.zP)**2,nxL=z=>NU.xL-0.38*(z/NU.zP)**2;
/* region weights for a point of the nail unit */
function nailGeo(x,z){const az=Math.abs(z),lat=smoothstep(NU.zP-0.1,NU.zP+0.32,az),prox=1-smoothstep(nxC(z)-0.09,nxC(z)+0.03,x);
  const plate=smoothstep(NU.x0,NU.x0+0.9,x)*(1-smoothstep(NU.zP-0.02,NU.zP+0.3,az)),mat=1-smoothstep(nxL(z)-0.06,nxL(z)+0.12,x),hyp=smoothstep(NU.xH-0.05,NU.xH+0.3,x);
  const riseP=Math.min(prox,0.18+0.82*(1-smoothstep(nxC(z)-0.55,nxC(z)+0.02,x)));
  return{az,lat,prox,plate,mat,hyp,riseP,fold:Math.max(prox,lat),rise:Math.max(0.78*riseP,0.62*lat)};}
/* depth boundaries (mm below the top surface) of the 7 bands */
function nailCol(L,x,z){const g=nailGeo(x,z),N=L.nail,ds=N.dystAt?N.dystAt(x,z):0,nd=N.nodAt?N.nodAt(x,z):0;
  const fT=S2D(g.rise),skin=Math.min(fT,0.1*g.fold),epon=Math.min(fT-skin,0.035*g.prox*(1-g.lat)*smoothstep(NU.x0-0.2,NU.x0+0.3,x)),fderm=Math.max(0,fT-skin-epon);
  const plate=0.55*g.plate*(1-0.45*ds)*(1-nd);
  let ep=lerp(0.05,0.2*smoothstep(NU.x0-0.15,NU.x0+0.15,x),g.mat);ep=lerp(ep,0.22,g.hyp)*(1-g.lat);ep+=0.35*nd;
  const derm=1.0+1.7*smoothstep(2.7,3.5,x)+1.4*smoothstep(3.25,3.9,g.az);
  const d=[0,skin,skin+fderm,skin+fderm+epon];d.push(d[3]+plate);d.push(d[4]+ep);d.push(Math.min(3.96,d[5]+derm));d.push(4.0);return{d,g,nd};}
function nailBandW(b,x){return lerp(b.w0,b.w1,clamp((x-NU.xC)/(NU.xH-NU.xC)));}
/* pigment in the plate (0..1) at a point; the band starts where the matrix lesion starts */
function nailBandAt(L,x,z){let v=0;for(const b of L.nail.bands){const w=nailBandW(b,x)/2,e=1-smoothstep(w*(1-0.45*b.fade)-0.015,w+0.03,Math.abs(z-b.z));if(e<=0)continue;
  v=Math.max(v,e*b.a*smoothstep(b.x0-0.05,b.x0+0.3,x));}return v;}
function nailLesAt(L,x,z){const m=L.nail.les;if(!m)return 0;const w=m.w/2;return(1-smoothstep(w-0.05,w+0.12,Math.abs(z-m.z)))*smoothstep(m.x0-0.12,m.x0+0.08,x)*(1-smoothstep(m.x1-0.08,m.x1+0.12,x));}
function nailHutAt(L,x,z){const h=L.nail.hut;if(!h)return 0;const n=fbm(x*2.6+3,z*2.6,77,3);let v=0;
  if(h.prox>0){const c=nxC(z),dx=c-x,ez=Math.abs(z-h.z);v=Math.max(v,h.prox*(1-smoothstep(h.w*0.5*(0.7+0.6*n),h.w*0.5*(0.7+0.6*n)+0.25,ez))*(1-smoothstep(h.dl*(0.6+0.7*n),h.dl*(0.6+0.7*n)+0.18,dx))*smoothstep(-0.05,0.04,dx));}
  if(h.hypo>0){const ez=Math.abs(z-h.z),dx=x-NU.xH;v=Math.max(v,h.hypo*(1-smoothstep(h.w*0.35*(0.7+0.6*n),h.w*0.35*(0.7+0.6*n)+0.2,ez))*smoothstep(-0.02,0.12,dx));}
  return clamp(v);}
function finalizeNail(L){const N=L.nail;L.kind='nail';L.mmU=NU.mmU;
  L.elev=(x,z)=>{const g=nailGeo(x,z),nd=N.nodAt?N.nodAt(x,z):0;return 0.45*(1-(z/4.6)**2)-0.012*x*x+g.rise+0.42*nd-(N.dystAt?0.06*N.dystAt(x,z):0);};
  L.elevAt=(x,z)=>L.elev(x,z);
  L.depths=(x,z)=>{const c=nailCol(L,x,z).d;return{r:L.R(x,z),sc:c[4],dej:c[5],pap:Math.min(2.39,c[5]+0.2),ret:2.4,sub:4.0,pigA:0};};
  L.netI=()=>0;L.pig=()=>0;L.R=(x,z)=>{let r=9;for(const b of N.bands){const w=nailBandW(b,x)/2+0.15;r=Math.min(r,Math.abs(z-b.z)/w);}if(N.hema)r=Math.min(r,Math.hypot((x-N.hema.x)/N.hema.rx,(z-N.hema.z)/N.hema.rz));if(N.nod)r=Math.min(r,Math.hypot(x-N.nod.x,z-N.nod.z)/N.nod.r);return x<NU.x0?9:r;};
  let m=0;for(let i=-10;i<=10;i++)for(let j=-10;j<=10;j++)m=Math.max(m,L.elevAt(i*0.38,j*0.38));L.maxElev=0;L.secZ=N.secZ;return L;}

/* random but repeatable line set inside a band: regular (nevus, lentigo) or irregular (melanoma) */
function nailLines(seed,n,reg,cols){const r=mulberry32(seed),o=[];for(let i=0;i<n;i++){const u=reg?(i+0.5)/n:clamp((i+0.5)/n+(r()-0.5)*0.7/n);
  o.push({u,w:reg?0.5:0.2+r()*0.85,c:cols[reg?0:(r()*cols.length)|0],a:reg?0.7:0.4+r()*0.55,wob:reg?0.0015:0.002+r()*0.004,drift:reg?0:(r()-0.5)*0.1,gap:reg?-1:(r()<0.35?r():-1),ph:r()*9,seg:reg?0:(r()<0.3?0.2+r()*0.5:0)});}return o;}
const NC={brown:[120,74,44],dark:[56,34,22],black:[28,20,18],gray:[100,92,94],lgray:[150,140,138],lbrown:[160,112,78]};
function mkBand(o){const b=Object.assign({z:0.3,w0:1,w1:1,x0:-2.6,a:0.85,fade:0,gran:0,blood:0,dots:0,reg:false,bg:NC.brown,n:7,cols:[NC.brown],seed:11},o);b.lines=nailLines(b.seed,b.n,b.reg,b.cols);return b;}
function makeNail(seed,o){const L=baseModel(seed);L.foc={};L.nail=Object.assign({bands:[],les:null,hut:null,hema:null,nod:null,dyst:0,origin:'distal',secZ:0.3,blood:[]},o);
  const N=L.nail;if(N.dyst>0){const r=mulberry32(seed+5);N.split={z:N.bands[0]?N.bands[0].z-0.2:0,ph:r()*9};
    N.dystAt=(x,z)=>N.dyst*smoothstep(NU.xC,NU.xC+1.4,x)*(0.55+0.45*fbm(x*1.4,z*1.4,seed,2));}
  if(N.nod){const nd=N.nod,b=blobFn(nd.x,nd.z,nd.r,0.35,31);N.nodAt=(x,z)=>b(x,z);}
  return finalizeNail(L);}

/* ---------------- texts ---------------- */
const NLY={plate:['Nail plate','Płytka paznokciowa'],mat:['Nail matrix','Macierz paznokcia'],fold:['Proximal nail fold','Wał paznokciowy bliższy'],bed:['Nail bed','Łożysko paznokcia'],plateD:['in the plate, ≈0.5 mm thick','w płytce, grubość ≈0,5 mm']};
const NS={
  band:{vis:[3,3,3],depth:NLY.plateD,layer:NLY.plate,n:['Longitudinal pigmented band','Podłużny barwnikowy pasek'],h:['Melanin made in the matrix and carried into the plate by growing onychocytes.','Melanina wytworzona w macierzy i przenoszona do płytki przez rosnące onychocyty.'],
    o:['A stripe from the cuticle to the free edge: a printout of the matrix lesion.','Pasek od obrąbka do wolnego brzegu: „wydruk” zmiany w macierzy.']},
  irrl:{vis:[3,3,3],depth:NLY.plateD,layer:NLY.plate,n:['Irregular lines on a brown background','Nieregularne linie na brązowym tle'],h:['Uneven melanin production by atypical melanocytes along the matrix.','Nierównomierne wytwarzanie melaniny przez atypowe melanocyty wzdłuż macierzy.'],
    o:['Lines of different colour, thickness and spacing that lose parallelism: the key sign of nail melanoma.','Linie o różnej barwie, grubości i odstępach, tracące równoległość: główna cecha czerniaka paznokcia.']},
  regl:{vis:[3,3,3],depth:NLY.plateD,layer:NLY.plate,n:['Regular lines on a brown background','Regularne linie na brązowym tle'],h:['Melanin from orderly nests of nevus cells in the matrix.','Melanina z uporządkowanych gniazd komórek znamionowych w macierzy.'],o:['Parallel lines of uniform colour, thickness and spacing.','Równoległe linie o jednakowej barwie, grubości i odstępach.']},
  grayb:{vis:[3,3,3],depth:NLY.plateD,layer:NLY.plate,n:['Grey background, thin grey lines','Szare tło, cienkie szare linie'],h:['Activated matrix melanocytes, not increased in number, make more melanin.','Aktywowane melanocyty macierzy, których nie przybywa, wytwarzają więcej melaniny.'],o:['Homogeneous grey band with fine regular grey lines.','Jednolity szary pasek z drobnymi, regularnymi szarymi liniami.']},
  tri:{vis:[3,3,3],depth:NLY.plateD,layer:NLY.plate,n:['Triangular sign','Objaw trójkąta'],h:['The matrix lesion is wider now than when the distal part of the plate was made.','Zmiana w macierzy jest teraz szersza niż wtedy, gdy powstawała dystalna część płytki.'],o:['Band wider at the cuticle than at the free edge: a growing lesion.','Pasek szerszy przy obrąbku niż przy wolnym brzegu: zmiana rośnie.']},
  gran:{vis:[3,3,2],depth:NLY.plateD,layer:NLY.plate,n:['Granular pigmentation','Pigmentacja ziarnista'],h:['Clumps of melanin in the plate.','Skupiska melaniny w płytce.'],o:['Fine dark dots inside the band (40% of nail melanomas, 3.5% of benign bands).','Drobne ciemne kropki w obrębie paska (40% czerniaków paznokcia, 3,5% łagodnych pasków).']},
  multi:{vis:[3,3,3],depth:NLY.plateD,layer:NLY.plate,n:['Several colours, fading border','Kilka barw, zanikający brzeg'],h:['Uneven pigment production across a widening lesion.','Nierówne wytwarzanie barwnika w poszerzającej się zmianie.'],o:['Light brown to black and grey; the lateral edges blur.','Od jasnobrązowej do czarnej i szarej; boczne brzegi się zacierają.']},
  hutch:{vis:[3,3,3],depth:['≈0.05 mm, periungual skin','≈0,05 mm, skóra okołopaznokciowa'],layer:NLY.fold,n:['Hutchinson sign','Objaw Hutchinsona'],h:['Melanoma in situ spreading into the epithelium of the nail folds and hyponychium.','Czerniak in situ szerzący się w nabłonku wałów paznokciowych i hyponychium.'],o:['Pigment on the skin around the nail.','Barwnik na skórze wokół paznokcia.']},
  micro:{vis:[3,3,2],depth:['cuticle','obrąbek naskórkowy'],layer:NLY.fold,n:['Micro-Hutchinson sign','Objaw mikro-Hutchinsona'],h:['Early spread into the cuticle and fold epithelium.','Wczesne szerzenie się do obrąbka i nabłonka wału.'],o:['Pigment on the cuticle visible only with the dermatoscope.','Barwnik na obrąbku widoczny tylko w dermatoskopie.']},
  pseudoH:{vis:[3,3,2],depth:['under the cuticle','pod obrąbkiem'],layer:NLY.fold,n:['Pseudo-Hutchinson sign','Objaw rzekomego Hutchinsona (pseudo-Hutchinson)'],h:['The band pigment is seen through a transparent cuticle; the fold skin itself is not pigmented.','Barwnik paska prześwituje przez przejrzysty obrąbek; sama skóra wału nie jest zabarwiona.'],o:['Pigment appears at the cuticle but stops at the fold skin.','Barwnik widoczny w obrąbku, ale nie przechodzi na skórę wału.']},
  wide:{vis:[3,3,3],depth:NLY.plateD,layer:NLY.plate,n:['Band wider than 2/3 of the plate','Pasek szerszy niż 2/3 płytki'],h:['A large proportion of the matrix is involved.','Zajęta jest duża część macierzy.'],o:['Most of the nail is pigmented.','Większość paznokcia jest zabarwiona.']},
  dyst:{vis:[3,3,3],depth:NLY.plateD,layer:NLY.plate,n:['Nail plate dystrophy','Dystrofia płytki'],h:['A matrix partly replaced by tumour builds a thin, fragile plate.','Macierz częściowo zastąpiona przez nowotwór wytwarza cienką, łamliwą płytkę.'],o:['Thinning, longitudinal splitting and irregular surface.','Ścieńczenie, podłużne pęknięcia i nierówna powierzchnia.']},
  onycho:{vis:[3,3,3],depth:['under the plate','pod płytką'],layer:NLY.bed,n:['Onycholysis','Onycholiza'],h:['The plate separates from the bed.','Płytka oddziela się od łożyska.'],o:['White-yellow distal area.','Białożółty obszar dystalny.']},
  blood:{vis:[3,3,3],depth:['in or under the plate','w płytce lub pod nią'],layer:NLY.bed,n:['Blood spots','Wylewy krwawe (blood spots)'],h:['Small haemorrhages trapped in the plate.','Drobne wylewy krwi uwięzione w płytce.'],o:['Red-purple to black dots; they do not rule out melanoma.','Czerwonofioletowe do czarnych kropki; nie wykluczają czerniaka.']},
  hema:{vis:[3,3,3],depth:['between bed and plate','między łożyskiem a płytką'],layer:NLY.bed,n:['Haematoma','Krwiak'],h:['Blood between the nail bed and the plate, incorporated into the ventral plate.','Krew między łożyskiem a płytką, wbudowana w brzuszną część płytki.'],o:['Red-purple-black homogeneous area with a rounded proximal border.','Czerwonofioletowoczarny jednolity obszar z zaokrąglonym brzegiem bliższym.']},
  hglob:{vis:[3,3,3],depth:['between bed and plate','między łożyskiem a płytką'],layer:NLY.bed,n:['Peripheral globules, distal streaks','Obwodowe grudki, dystalne smugi'],h:['Droplets of blood at the edge of the haematoma; streaks left as the plate grows.','Kropelki krwi na obwodzie krwiaka; smugi pozostawione przez rosnącą płytkę.'],o:['Purple-red round globules at the rim and fading streaks toward the free edge.','Fioletowoczerwone okrągłe grudki na obwodzie i zanikające smugi w stronę wolnego brzegu.']},
  dotsN:{vis:[3,3,3],depth:NLY.plateD,layer:NLY.plate,n:['Dots and globules','Kropki i grudki'],h:['Clumps of melanin from nests of nevus cells.','Skupiska melaniny z gniazd komórek znamionowych.'],o:['Brown dots inside a dark band; common in children.','Brązowe kropki w ciemnym pasku; częste u dzieci.']},
  nodN:{vis:[3,3,3],depth:['≈0.2–2 mm','≈0,2–2 mm'],layer:NLY.bed,n:['Tumour nodule','Guzek nowotworowy'],h:['Invasive melanoma lifting and destroying the plate.','Inwazyjny czerniak unoszący i niszczący płytkę.'],o:['A pink-red nodule where the plate is missing.','Różowoczerwony guzek w miejscu brakującej płytki.']},
  ulcN:{vis:[3,3,3],depth:LY.surf,layer:NLY.bed,n:['Ulceration and crust','Owrzodzenie i strup'],h:['The tumour breaks through the surface.','Nowotwór przebija powierzchnię.'],o:['Red-brown to black crust and bleeding.','Czerwonobrązowy do czarnego strup i krwawienie.']},
  amel:{vis:[3,3,2],depth:['≈0.1–0.5 mm','≈0,1–0,5 mm'],layer:NLY.bed,n:['Remnants of pigment in an amelanotic area','Resztki barwnika w obszarze bezbarwnikowym'],h:['Poorly pigmented tumour with a few pigmented cells.','Słabo zabarwiony nowotwór z nielicznymi zabarwionymi komórkami.'],o:['Brown-black dots and streaks at the edge of a pink area.','Brązowoczarne kropki i smugi na obrzeżu różowego obszaru.']},
  poly:{vis:[1,3,1],depth:['≈0.1–0.4 mm','≈0,1–0,4 mm'],layer:NLY.bed,n:['Polymorphous vessels, milky-red areas','Naczynia polimorficzne, obszary mlecznoczerwone'],h:['New vessels of the invasive tumour.','Nowe naczynia naciekającego nowotworu.'],o:['Dotted, linear irregular and hairpin vessels on milky-red.','Naczynia kropkowe, linijne nieregularne i w kształcie spinki na mlecznoczerwonym tle.']},
  matrix:{vis:[0,0,0],depth:['≈0.5–0.8 mm under the fold','≈0,5–0,8 mm pod wałem'],layer:NLY.mat,n:['The matrix lesion','Zmiana w macierzy'],h:['Melanocytes in the distal matrix, hidden under the proximal fold and the lunula.','Melanocyty w dystalnej części macierzy, ukryte pod wałem bliższym i obłączkiem.'],
    o:['Not visible through the plate: what you see is its product. The origin can be judged from the free edge: dorsal pigment → proximal matrix, ventral pigment → distal matrix.','Niewidoczna przez płytkę: widać jej produkt. Pochodzenie można ocenić na wolnym brzegu: barwnik w grzbietowej części płytki → macierz bliższa, w brzusznej → macierz dalsza.']}};
const NH={
  mat:{a:'nmat',m:'matrix',n:['Nail matrix epithelium','Nabłonek macierzy'],d:['Thick epithelium without a granular layer; its cells keratinize obliquely and merge into the plate.','Gruby nabłonek bez warstwy ziarnistej; jego komórki rogowacieją skośnie i przechodzą w płytkę.']},
  matMel:{a:'nmatmel',m:'matrix',n:['Atypical melanocytes in the matrix','Atypowe melanocyty w macierzy'],d:['Increased, single and confluent atypical melanocytes along the basal layer of the matrix (in situ melanoma ≈59 per mm of junction vs 15 in benign lentigo and 8 in normal nail; Amin 2008).','Zwiększona liczba pojedynczych i zlewnych atypowych melanocytów wzdłuż warstwy podstawnej macierzy (w czerniaku in situ ≈59 na mm połączenia, w łagodnej plamie 15, w prawidłowym paznokciu 8; Amin 2008).']},
  pag:{a:'npag',m:'matrix',n:['Pagetoid spread','Szerzenie pagetoidalne'],d:['Atypical melanocytes high in the matrix epithelium. Beware: normal proximal-matrix melanocytes also sit suprabasally (Perrin 1997).','Atypowe melanocyty wysoko w nabłonku macierzy. Uwaga: prawidłowe melanocyty macierzy bliższej także leżą nadpodstawnie (Perrin 1997).']},
  platePig:{a:'nplatepig',m:'band',n:['Melanin in the nail plate','Melanina w płytce'],d:['Brown granules in the plate keratin, in its lower (ventral) part when the source is the distal matrix.','Brązowe ziarna w keratynie płytki, w jej dolnej (brzusznej) części, gdy źródłem jest macierz dalsza.']},
  plate:{a:'nplate',m:'band',n:['Nail plate','Płytka paznokciowa'],d:['Compact, eosinophilic, anucleate keratin.','Zbita, kwasochłonna keratyna bez jąder.']},
  bed:{a:'nbed',n:['Nail bed','Łożysko paznokcia'],d:['Thin epithelium on longitudinal dermal ridges; few melanocytes (≈45/mm² vs ≈217/mm² in the matrix).','Cienki nabłonek na podłużnych listewkach skóry właściwej; nieliczne melanocyty (≈45/mm² wobec ≈217/mm² w macierzy).']},
  fold:{a:'nfoldmel',m:'hutch',n:['Melanocytes in the nail fold epithelium','Melanocyty w nabłonku wału'],d:['Atypical melanocytes in the epidermis of the proximal fold and cuticle: the histology of the Hutchinson sign.','Atypowe melanocyty w naskórku wału bliższego i obrąbka: histologiczny obraz objawu Hutchinsona.']},
  cut:{a:'ncut',m:'micro',n:['Cuticle','Obrąbek naskórkowy (cuticula)'],d:['Keratin made by the ventral side of the proximal fold, sealing the fold to the plate.','Keratyna wytwarzana przez brzuszną powierzchnię wału bliższego, uszczelniająca połączenie wału z płytką.']},
  inv:{a:'ninv',m:'nodN',n:['Invasive melanoma','Inwazyjny czerniak'],d:['Sheets and nests of atypical melanocytes in the dermis below the bed and matrix; there is no fat here, so bone is only ≈1 mm away.','Pola i gniazda atypowych melanocytów w skórze właściwej pod łożyskiem i macierzą; nie ma tu tkanki tłuszczowej, więc kość leży zaledwie ≈1 mm niżej.']},
  invM:{a:'ninv',m:'dyst',n:['Early invasion below the matrix','Wczesne naciekanie pod macierzą'],d:['Groups of atypical melanocytes cross the basement membrane of the matrix.','Grupy atypowych melanocytów przekraczają błonę podstawną macierzy.']},
  bone:{a:'nbone',n:['Distal phalanx','Paliczek dalszy'],d:['Trabecular bone with marrow, directly under the dermis of the nail bed.','Kość beleczkowa ze szpikiem, bezpośrednio pod skórą właściwą łożyska.']},
  ulc:{a:'nulc',m:'ulcN',n:['Ulceration','Owrzodzenie'],d:['Loss of epithelium over the tumour, with fibrin and blood.','Ubytek nabłonka nad nowotworem, z włóknikiem i krwią.']},
  blood:{a:'nblood',m:'hema',n:['Haematoma','Krwiak'],d:['Red blood cells between the bed epithelium and the plate; no melanocytic proliferation.','Krwinki czerwone między nabłonkiem łożyska a płytką; brak rozrostu melanocytów.']},
  nest:{a:'nnest',m:'matrix',n:['Nevus nests in the matrix','Gniazda znamionowe w macierzy'],d:['Round nests of small, uniform melanocytes at the matrix junction.','Okrągłe gniazda małych, jednakowych melanocytów na połączeniu w macierzy.']},
  act:{a:'nact',m:'matrix',n:['Activated melanocytes','Aktywowane melanocyty'],d:['Normal number of dendritic melanocytes; melanin in the matrix keratinocytes and the plate (hypermelanosis).','Prawidłowa liczba dendrytycznych melanocytów; melanina w keratynocytach macierzy i w płytce (hipermelanoza).']},
  lun:{a:'nlun',n:['Distal matrix under the lunula','Macierz dalsza pod obłączkiem'],d:['The pale lunula is the distal matrix seen through the plate; most bands start here.','Jasny obłączek to macierz dalsza widziana przez płytkę; tu zaczyna się większość pasków.']}};
const NSRC=[['https://pubmed.ncbi.nlm.nih.gov/12374538/','Ronger et al., Arch Dermatol 2002'],['https://pubmed.ncbi.nlm.nih.gov/10642684/','Levit et al., ABCDEF, JAAD 2000'],['https://pubmed.ncbi.nlm.nih.gov/27696528/','Benati et al., JEADV 2017'],
  ['https://pubmed.ncbi.nlm.nih.gov/29926108/','Ohn et al., JAMA Dermatol 2018'],['https://pubmed.ncbi.nlm.nih.gov/21175755/','Koga et al., J Dermatol 2011'],['https://pubmed.ncbi.nlm.nih.gov/18391745/','Amin et al., Am J Surg Pathol 2008'],
  ['https://pubmed.ncbi.nlm.nih.gov/9335239/','Perrin et al., Am J Dermatopathol 1997'],['https://pubmed.ncbi.nlm.nih.gov/19922528/','Phan et al., Br J Dermatol 2010'],['https://pubmed.ncbi.nlm.nih.gov/16908362/','Braun et al., free-edge dermoscopy, JAAD 2006'],['https://pubmed.ncbi.nlm.nih.gov/42865149/','Haneke et al., JEADV 2026']];
const BZ=0.35;

EVO.nail={seed:808,nail:true,hcase:'nail',hstyle:'nail',secZ:BZ,
  title:['Nail apparatus melanoma','Czerniak aparatu paznokciowego'],
  sum:['Nail melanoma usually starts in the matrix, hidden under the proximal nail fold. Matrix melanocytes put their melanin into the growing plate, so the nail shows a printout of the matrix: a longitudinal band (longitudinal melanonychia) from the cuticle to the free edge. It accounts for 1.5–2.5% of melanomas in white populations but up to half in Black patients, most often on the thumb or great toe. The task is to find the few melanomas among many benign bands, and to biopsy the right part of the matrix.',
    'Czerniak paznokcia zaczyna się zwykle w macierzy, ukrytej pod wałem paznokciowym bliższym. Melanocyty macierzy przekazują melaninę do rosnącej płytki, więc paznokieć pokazuje „wydruk” macierzy: podłużny pasek (melanonychia podłużna) od obrąbka do wolnego brzegu. Stanowi 1,5–2,5% czerniaków u osób rasy białej, ale nawet połowę u osób czarnoskórych; najczęściej dotyczy kciuka lub palucha. Zadanie polega na wychwyceniu nielicznych czerniaków spośród wielu łagodnych pasków i na pobraniu biopsji z właściwej części macierzy.'],
  note:['Section view: the cut runs along the band. Pigment sits in the lower (ventral) half of the plate, so the source is the distal matrix (Braun 2006: dorsal pigment points to the proximal matrix).','Widok przekroju: cięcie biegnie wzdłuż paska. Barwnik leży w dolnej (brzusznej) połowie płytki, więc źródłem jest macierz dalsza (Braun 2006: barwnik grzbietowy wskazuje na macierz bliższą).'],
  src:NSRC,
  stages:[
    {lbl:['1 · Band','1 · Pasek'],ph:['Melanoma in situ · early','Czerniak in situ · wczesny'],h:['A new brown band with irregular lines','Nowy brązowy pasek z nieregularnymi liniami'],grow:0,
      see:['A single digit shows a 2 mm brown band from the cuticle to the free edge. With the dermatoscope the background is brown and the lines inside it are irregular: they differ in colour, thickness and spacing and are not quite parallel.','Na jednym palcu widać brązowy pasek szerokości 2 mm biegnący od obrąbka do wolnego brzegu. W dermatoskopie tło jest brązowe, a linie w jego obrębie nieregularne: różnią się barwą, grubością i odstępami i nie są do końca równoległe.'],
      tis:['Atypical melanocytes, more numerous than normal, lie singly along the basal layer of the distal matrix and make melanin; onychocytes carry it into the plate, so the stripe reaches the free edge.','Atypowe melanocyty, liczniejsze niż zwykle, leżą pojedynczo wzdłuż warstwy podstawnej macierzy dalszej i wytwarzają melaninę; onychocyty przenoszą ją do płytki, więc pasek sięga wolnego brzegu.'],
      key:['A brown background with irregular longitudinal lines is the most suspicious dermoscopic sign of early nail melanoma (Ronger 2002; Koga 2011). Any new band in an adult deserves dermoscopic follow-up every 6 months or a matrix biopsy.','Brązowe tło z nieregularnymi podłużnymi liniami to najbardziej podejrzana cecha dermoskopowa wczesnego czerniaka paznokcia (Ronger 2002; Koga 2011). Każdy nowy pasek u dorosłego wymaga kontroli dermoskopowej co 6 miesięcy albo biopsji macierzy.'],
      st:['band','irrl','matrix'],he:['matMel','platePig','mat','lun']},
    {lbl:['2 · Widening','2 · Poszerzenie'],ph:['Melanoma in situ · growing','Czerniak in situ · rośnie'],h:['Wider proximally, several colours','Szerszy u nasady, kilka barw'],grow:0,
      see:['The band is now about 3.5 mm wide at the cuticle but narrower at the free edge (triangular sign). Light brown, dark brown, black and grey lines; the lateral borders fade; fine dark granules appear inside the band.','Pasek ma teraz około 3,5 mm szerokości przy obrąbku, ale jest węższy przy wolnym brzegu (objaw trójkąta). Linie jasnobrązowe, ciemnobrązowe, czarne i szare; boczne brzegi się zacierają; w pasku pojawiają się drobne ciemne ziarenka.'],
      tis:['The proliferation spreads along the matrix, with small nests and pagetoid melanocytes in the upper matrix epithelium. A wider matrix lesion prints a wider stripe.','Rozrost szerzy się wzdłuż macierzy; pojawiają się małe gniazda i melanocyty pagetoidalne w górnej części nabłonka macierzy. Szersza zmiana w macierzy daje szerszy pasek.'],
      key:['Ohn 2018 (in situ melanoma vs benign bands): asymmetry, border fading, multicolour, width ≥3 mm and Hutchinson sign; a score ≥3 of 8 gave 89% sensitivity and 62% specificity. Granular pigmentation: 40% of nail melanomas vs 3.5% of benign bands (Benati 2017).','Ohn 2018 (czerniak in situ vs łagodne paski): asymetria, zanikający brzeg, wiele barw, szerokość ≥3 mm i objaw Hutchinsona; wynik ≥3 na 8 punktów dawał czułość 89% i swoistość 62%. Pigmentacja ziarnista: 40% czerniaków paznokcia wobec 3,5% łagodnych pasków (Benati 2017).'],
      st:['tri','multi','gran','irrl','band','matrix'],he:['matMel','pag','platePig','mat']},
    {lbl:['3 · Hutchinson','3 · Hutchinson'],ph:['Melanoma in situ · periungual spread','Czerniak in situ · szerzenie się na skórę wokół'],h:['Pigment on the nail folds','Barwnik na wałach paznokciowych'],grow:0,
      see:['The band covers more than two-thirds of the plate. Pigment appears on the cuticle (micro-Hutchinson sign, seen only with the dermatoscope) and on the skin of the proximal fold and hyponychium (Hutchinson sign).','Pasek zajmuje ponad dwie trzecie płytki. Barwnik pojawia się na obrąbku (objaw mikro-Hutchinsona, widoczny tylko w dermatoskopie) oraz na skórze wału bliższego i hyponychium (objaw Hutchinsona).'],
      tis:['Atypical melanocytes leave the matrix and spread into the epithelium of the proximal fold, cuticle and nail bed: in situ melanoma of the periungual skin.','Atypowe melanocyty opuszczają macierz i szerzą się w nabłonku wału bliższego, obrąbka i łożyska: czerniak in situ skóry okołopaznokciowej.'],
      key:['ABCDEF rule (Levit 2000): Age (peak 5th–7th decade), Band (brown-black, ≥3 mm, irregular border), Change, Digit (single digit; thumb, great toe), Extension (Hutchinson sign), Family or personal history. Beware pseudo-Hutchinson: band pigment seen through a transparent cuticle.','Reguła ABCDEF (Levit 2000): A – wiek (szczyt w 5.–7. dekadzie), B – pasek (brązowoczarny, ≥3 mm, nieregularny brzeg), C – zmiana, D – palec (jeden palec; kciuk, paluch), E – rozszerzanie się (objaw Hutchinsona), F – wywiad rodzinny lub osobisty. Uwaga na pseudo-Hutchinsona: barwnik paska prześwitujący przez przejrzysty obrąbek.'],
      st:['hutch','micro','wide','irrl','matrix'],he:['fold','cut','matMel','platePig']},
    {lbl:['4 · Dystrophy','4 · Dystrofia'],ph:['Melanoma · early invasion','Czerniak · wczesne naciekanie'],h:['A dark, dystrophic nail','Ciemny, zdystrofizowany paznokieć'],grow:0,
      see:['Almost the whole plate is dark brown to black. The plate thins, splits along the band and lifts from the bed at the free edge (onycholysis); a few blood spots.','Prawie cała płytka jest ciemnobrązowa do czarnej. Płytka cienieje, pęka wzdłuż paska i odstaje od łożyska przy wolnym brzegu (onycholiza); kilka wylewów krwawych.'],
      tis:['The matrix, partly replaced by tumour, can no longer build a normal plate; small groups of melanoma cells cross the basement membrane of the matrix.','Macierz, częściowo zastąpiona przez nowotwór, nie wytwarza już prawidłowej płytki; małe grupy komórek czerniaka przekraczają błonę podstawną macierzy.'],
      key:['Nail dystrophy is associated with melanoma (Benati 2017). Treatment is complete excision of the nail unit: for in situ and thin tumours a wide local (functional) excision with 6 mm margins, 10 mm with Hutchinson sign; amputation is generally reserved for tumours thicker than 1 mm (expert recommendations, Haneke 2026).','Dystrofia płytki wiąże się z czerniakiem (Benati 2017). Leczeniem jest całkowite wycięcie aparatu paznokciowego: w zmianach in situ i cienkich szerokie wycięcie miejscowe (czynnościowe) z marginesem 6 mm, 10 mm przy objawie Hutchinsona; amputację zwykle zarezerwowano dla guzów grubszych niż 1 mm (zalecenia ekspertów, Haneke 2026).'],
      st:['dyst','onycho','blood','hutch','wide','matrix'],he:['invM','matMel','fold','platePig']},
    {lbl:['5 · Invasive','5 · Inwazyjny'],ph:['Invasive nail apparatus melanoma','Inwazyjny czerniak aparatu paznokciowego'],h:['A nodule destroys the plate','Guzek niszczy płytkę'],grow:0,br:2.6,pT:'pT3b',clark:'IV',
      see:['The distal plate is gone; a pink-red, crusted, bleeding nodule grows from the nail bed. Part of it has lost its pigment: brown-black remnants sit at its edge, with milky-red areas and dotted, linear irregular and hairpin vessels.','Dystalnej części płytki już nie ma; z łożyska wyrasta różowoczerwony, pokryty strupem, krwawiący guzek. Część guza utraciła barwnik: na jego obrzeżu leżą brązowoczarne resztki pigmentu, obszary mlecznoczerwone oraz naczynia kropkowe, linijne nieregularne i w kształcie spinki.'],
      tis:['Invasive melanoma below the matrix and bed reaches the deep dermis next to the distal phalanx; the surface is ulcerated.','Inwazyjny czerniak pod macierzą i łożyskiem sięga głębokiej skóry właściwej przy paliczku dalszym; powierzchnia jest owrzodziała.'],
      key:['In 44 nail-unit acral melanomas, 70% showed irregular lines; a third of acral melanomas were amelanotic, recognised by remnants of pigment and polymorphous vessels with milky-red areas; mean Breslow 2.6 mm (Phan 2010). Late diagnosis is typical: nail melanoma is often mistaken for haematoma, fungus or trauma.','W 44 akralnych czerniakach aparatu paznokciowego 70% miało nieregularne linie; jedna trzecia czerniaków akralnych była bezbarwnikowa, rozpoznawana po resztkach barwnika i naczyniach polimorficznych z obszarami mlecznoczerwonymi; średnia grubość wg Breslowa 2,6 mm (Phan 2010). Typowe jest późne rozpoznanie: czerniak paznokcia bywa mylony z krwiakiem, grzybicą lub urazem.'],
      st:['nodN','ulcN','amel','poly','hutch'],he:['inv','ulc','bone','matMel']}],
  S:NS,H:NH,
  build(k){const z=BZ,les={x0:-2.75,x1:-1.15,z,w:[1.0,1.8,4.4,6.0,6.0][k],kind:'mel',a:[0.6,0.8,0.95,1,1][k],inv:[0,0,0,0.4,1][k]};
    const cols=[[NC.brown,NC.lbrown,NC.dark],[NC.brown,NC.dark,NC.black,NC.gray,NC.lbrown],[NC.dark,NC.black,NC.brown,NC.gray],[NC.black,NC.dark,NC.gray],[NC.black,NC.dark,NC.gray]][k];
    const b=mkBand({z:k>=3?0.1:z,w0:[0.98,1.75,4.4,6.2,6.2][k],w1:[0.95,1.12,3.1,5.9,5.9][k],a:[0.82,0.9,0.95,0.97,0.97][k],fade:[0.25,0.6,0.7,0.5,0.5][k],gran:[0,0.55,0.6,0.5,0.3][k],
      bg:[NC.brown,NC.brown,NC.dark,NC.dark,NC.dark][k],n:[7,11,20,26,26][k],cols,seed:900+k,blood:[0,0,0,6,3][k],x0:les.x0});
    const L=makeNail(808,{bands:[b],les,secZ:z,hut:k>=2?{z:z+0.2,w:[0,0,2.6,4.2,4.4][k],dl:[0,0,0.55,0.9,1.0][k],prox:[0,0,0.9,1,1][k],hypo:[0,0,0.55,0.8,0.9][k],micro:1}:null,
      dyst:k===3?0.85:k===4?0.6:0,nod:k===4?{x:2.2,z:0.25,r:1.15}:null});
    if(k===4){L.brs={x:2.0,z:0.25,mm:2.6};}
    setF(L,'band',0.6,0.35,z,0.5);setF(L,'irrl',1.2,0.35,z,0.5);setF(L,'tri',-0.9,0.3,z,0.5);setF(L,'gran',0.9,0.35,z+0.3,0.4);setF(L,'multi',0.2,0.35,z+0.7,0.5);
    setF(L,'matrix',-2.1,0.7,z,0.5);setF(L,'wide',0.8,0.35,-0.6,0.9);setF(L,'hutch',-2.4,0.05,z+0.2,0.5);setF(L,'micro',nxC(z)+0.05,0.04,z+0.6,0.3);
    setF(L,'dyst',0.6,0.25,b.z-0.2,0.5);setF(L,'onycho',3.2,0.5,0.4,0.5);setF(L,'blood',1.6,0.3,-0.8,0.35);
    setF(L,'nodN',2.2,0.6,0.25,0.9);setF(L,'ulcN',2.3,0.05,0.1,0.4);setF(L,'amel',1.4,0.3,1.1,0.4);setF(L,'poly',2.6,0.2,0.6,0.4);
    return L;}};

EVO.naildx={seed:818,nail:true,ddx:true,hcase:'nail',hstyle:'nail',secZ:BZ,
  title:['Pigmented nail bands: look-alikes','Barwnikowe paski paznokcia: naśladowcy'],
  sum:['Most longitudinal bands are benign. Dermoscopy of the plate sorts them by background colour and line pattern: brown background with regular lines (nevus), grey background with thin grey lines (melanocytic activation, lentigo, ethnic or drug-induced pigmentation), red-purple blood spots (haemorrhage), and brown background with irregular lines (melanoma). Children are the exception: their nevi often look alarming.',
    'Większość podłużnych pasków jest łagodna. Dermoskopia płytki porządkuje je według barwy tła i układu linii: brązowe tło z regularnymi liniami (znamię), szare tło z cienkimi szarymi liniami (aktywacja melanocytów, plama soczewicowata, pigmentacja etniczna lub polekowa), czerwonofioletowe wylewy krwawe (krwiak) oraz brązowe tło z nieregularnymi liniami (czerniak). Wyjątkiem są dzieci: ich znamiona często wyglądają niepokojąco.'],
  note:['Ronger 2002, 148 bands: melanoma – brown background with irregular lines; nevi – brown background with regular lines; lentigo, ethnic and drug-induced pigmentation – grey background with thin grey lines; haemorrhage – blood spots.','Ronger 2002, 148 pasków: czerniak – brązowe tło z nieregularnymi liniami; znamiona – brązowe tło z regularnymi liniami; plama soczewicowata, pigmentacja etniczna i polekowa – szare tło z cienkimi szarymi liniami; krwiak – wylewy krwawe.'],
  src:NSRC.concat([['https://pubmed.ncbi.nlm.nih.gov/27177439/','Ohn et al., nail matrix nevi in children, JAAD 2016'],['https://pubmed.ncbi.nlm.nih.gov/21531039/','Hirata et al., intraoperative dermoscopy, JAAD 2011']]),
  stages:[
    {lbl:['Nevus','Znamię'],ph:['Benign · nail matrix nevus (adult)','Łagodne · znamię macierzy (dorosły)'],h:['Brown background, regular lines','Brązowe tło, regularne linie'],grow:0,
      see:['A 2 mm brown band, equally wide from cuticle to free edge, with sharp borders. The lines are parallel and evenly spaced, of the same colour and thickness.','Brązowy pasek szerokości 2 mm, jednakowo szeroki od obrąbka do wolnego brzegu, z ostrymi brzegami. Linie są równoległe i równomiernie rozłożone, tej samej barwy i grubości.'],
      tis:['Round nests of small, uniform nevus cells at the junction of the matrix.','Okrągłe gniazda małych, jednakowych komórek znamionowych na połączeniu w macierzy.'],
      key:['Brown background with regular lines = nail matrix nevus (Ronger 2002). In intraoperative matrix dermoscopy, nevi show a regular brown pattern with globules or a blotch (Hirata 2011).','Brązowe tło z regularnymi liniami = znamię macierzy (Ronger 2002). W śródoperacyjnej dermoskopii macierzy znamiona dają regularny brązowy wzorzec z grudkami lub plamą (Hirata 2011).'],
      st:['band','regl','matrix'],he:['nest','platePig','mat']},
    {lbl:['Activation','Aktywacja'],ph:['Benign · melanocytic activation / lentigo','Łagodne · aktywacja melanocytów / plama soczewicowata'],h:['Grey background, thin grey lines','Szare tło, cienkie szare linie'],grow:0,
      see:['A light grey band with fine, regular grey lines and no brown. Often several nails at once: ethnic pigmentation in darker skin, drugs (for example some chemotherapy), friction or pregnancy.','Jasnoszary pasek z drobnymi, regularnymi szarymi liniami, bez barwy brązowej. Często na kilku paznokciach naraz: pigmentacja etniczna w ciemniejszej skórze, leki (np. niektóre cytostatyki), tarcie lub ciąża.'],
      tis:['Matrix melanocytes are not increased in number; they are activated and transfer more melanin to the onychocytes (hypermelanosis).','Melanocytów macierzy nie przybywa; są aktywowane i przekazują więcej melaniny onychocytom (hipermelanoza).'],
      key:['Grey background with thin grey lines = activation, lentigo, ethnic or drug-induced pigmentation (Ronger 2002); a regular grey pattern in intraoperative dermoscopy = hypermelanosis (Hirata 2011). Several nails at once favour a benign, systemic cause.','Szare tło z cienkimi szarymi liniami = aktywacja, plama soczewicowata, pigmentacja etniczna lub polekowa (Ronger 2002); regularny szary wzorzec w dermoskopii śródoperacyjnej = hipermelanoza (Hirata 2011). Zajęcie kilku paznokci przemawia za łagodną, ogólnoustrojową przyczyną.'],
      st:['grayb','band','matrix'],he:['act','platePig','mat']},
    {lbl:['Haematoma','Krwiak'],ph:['Benign · subungual haemorrhage','Łagodne · krew pod płytką'],h:['Red-purple area that grows out','Czerwonofioletowy obszar, który odrasta'],grow:0,
      see:['A red-purple to black homogeneous area with a rounded proximal border, round globules at its rim and streaks fading toward the free edge. It does not start at the cuticle as a band, and it moves distally as the nail grows.','Czerwonofioletowy do czarnego jednolity obszar z zaokrąglonym brzegiem bliższym, okrągłymi grudkami na obwodzie i smugami zanikającymi w stronę wolnego brzegu. Nie zaczyna się przy obrąbku jak pasek i przesuwa się dystalnie wraz ze wzrostem paznokcia.'],
      tis:['Blood between the bed epithelium and the plate, taken up into the ventral plate; no melanocytic lesion.','Krew między nabłonkiem łożyska a płytką, wbudowana w brzuszną część płytki; brak zmiany melanocytowej.'],
      key:['Blood spots favour haemorrhage but cannot rule out melanoma, because the two can coexist (Ronger 2002). A dated photograph settles it: a haematoma grows out with the nail, a melanoma keeps being produced by the matrix.','Wylewy krwawe przemawiają za krwiakiem, ale nie wykluczają czerniaka, bo oba mogą współistnieć (Ronger 2002). Rozstrzyga zdjęcie z datą: krwiak odrasta razem z paznokciem, a czerniak jest stale wytwarzany przez macierz.'],
      st:['hema','hglob'],he:['blood','plate','bed']},
    {lbl:['Child nevus','Znamię dziecka'],ph:['Benign · nail matrix nevus (child)','Łagodne · znamię macierzy (dziecko)'],h:['Alarming look, benign course','Niepokojący wygląd, łagodny przebieg'],grow:0,
      see:['A wide, dark band with several colours, dots and globules, slightly wider at the cuticle (triangular sign), and pigment visible in the cuticle without true pigmentation of the fold skin (pseudo-Hutchinson sign).','Szeroki, ciemny pasek o kilku barwach, z kropkami i grudkami, nieco szerszy przy obrąbku (objaw trójkąta), z barwnikiem widocznym w obrąbku bez prawdziwego zabarwienia skóry wału (objaw pseudo-Hutchinsona).'],
      tis:['Junctional and compound nests of nevus cells in the matrix of a child; no atypia.','Gniazda komórek znamionowych w macierzy dziecka, na połączeniu i w skórze właściwej; bez atypii.'],
      key:['Nail matrix nevi in children are darker and more multicoloured than in adults, with more pseudo-Hutchinson signs, triangular signs and dots/globules (Ohn 2016). Melanoma of the nail in children is exceptional, so follow-up is usually preferred to matrix biopsy.','Znamiona macierzy u dzieci są ciemniejsze i bardziej wielobarwne niż u dorosłych, częściej mają objaw pseudo-Hutchinsona, objaw trójkąta oraz kropki i grudki (Ohn 2016). Czerniak paznokcia u dzieci zdarza się wyjątkowo, dlatego zwykle wybiera się obserwację zamiast biopsji macierzy.'],
      st:['dotsN','tri','pseudoH','band','matrix'],he:['nest','platePig','cut']},
    {lbl:['Melanoma','Czerniak'],ph:['Malignant · nail matrix melanoma in situ','Złośliwe · czerniak macierzy in situ'],h:['Brown background, irregular lines','Brązowe tło, nieregularne linie'],grow:0,
      see:['A single-digit band in an adult: brown background, irregular lines, wider proximally, several colours, fading borders and pigment on the cuticle (micro-Hutchinson).','Pasek na jednym palcu u dorosłego: brązowe tło, nieregularne linie, szerszy u nasady, kilka barw, zanikające brzegi i barwnik na obrąbku (mikro-Hutchinson).'],
      tis:['Increased atypical melanocytes along the matrix, single and in small nests, with pagetoid spread.','Zwiększona liczba atypowych melanocytów wzdłuż macierzy, pojedynczo i w małych gniazdach, z szerzeniem pagetoidalnym.'],
      key:['Compare with the nevus: same brown background, but the lines are irregular. When in doubt in an adult, biopsy the matrix at the origin of the band (a tangential matrix excision preserves the nail best).','Porównaj ze znamieniem: to samo brązowe tło, ale linie są nieregularne. W razie wątpliwości u dorosłego pobierz biopsję z macierzy w miejscu początku paska (styczne wycięcie macierzy najlepiej oszczędza paznokieć).'],
      st:['irrl','tri','micro','multi','band','matrix'],he:['matMel','pag','platePig','cut']}],
  S:NS,H:NH,
  build(k){const z=BZ;let L;
    if(k===0){const b=mkBand({z,w0:1.1,w1:1.1,reg:true,n:7,a:0.8,bg:NC.lbrown,cols:[NC.brown],seed:950});L=makeNail(818,{bands:[b],les:{x0:-2.6,x1:-1.2,z,w:1.1,kind:'nev',a:0.7},secZ:z});}
    else if(k===1){const b=mkBand({z,w0:0.95,w1:0.95,reg:true,n:9,a:0.55,bg:NC.lgray,cols:[NC.gray],seed:951});L=makeNail(818,{bands:[b],les:{x0:-2.6,x1:-1.2,z,w:0.95,kind:'act',a:0.5},secZ:z});}
    else if(k===2){L=makeNail(818,{bands:[],les:null,hema:{x:1.15,z:-0.15,rx:0.95,rz:0.8},secZ:-0.15});}
    else if(k===3){const b=mkBand({z,w0:2.4,w1:1.9,reg:false,n:14,a:0.95,fade:0.15,bg:NC.dark,cols:[NC.dark,NC.black,NC.brown],seed:952,dots:0.8});
      L=makeNail(818,{bands:[b],les:{x0:-2.7,x1:-1.15,z,w:2.4,kind:'nev',a:1},secZ:z,pseudo:1});}
    else{const b=mkBand({z,w0:1.75,w1:1.12,a:0.9,fade:0.6,gran:0.55,bg:NC.brown,n:11,cols:[NC.brown,NC.dark,NC.black,NC.gray,NC.lbrown],seed:901});
      L=makeNail(818,{bands:[b],les:{x0:-2.75,x1:-1.15,z,w:1.8,kind:'mel',a:0.8},secZ:z,hut:{z:z+0.2,w:1.2,dl:0,prox:0,hypo:0,micro:1}});}
    const zz=L.nail.secZ;setF(L,'band',0.6,0.35,zz,0.5);setF(L,'regl',1.2,0.35,zz,0.5);setF(L,'grayb',1.0,0.35,zz,0.5);setF(L,'irrl',1.2,0.35,zz,0.5);setF(L,'tri',-0.9,0.3,zz,0.5);setF(L,'multi',0.2,0.35,zz+0.7,0.5);
    setF(L,'matrix',-2.1,0.7,zz,0.5);setF(L,'micro',nxC(zz)+0.05,0.04,zz+0.5,0.3);setF(L,'pseudoH',nxC(zz)+0.04,0.04,zz,0.35);setF(L,'dotsN',0.4,0.35,zz+0.4,0.4);
    setF(L,'hema',1.15,0.5,-0.15,0.9);setF(L,'hglob',1.95,0.5,0.25,0.35);
    return L;}};

/* =====================================================================
   3D scene: renderer, tissue block, lesion structures, dermatoscope
   ===================================================================== */
const canvas=document.getElementById('gl');
const renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));
renderer.localClippingEnabled=true;
renderer.outputColorSpace=THREE.SRGBColorSpace;
const scene=new THREE.Scene();scene.background=new THREE.Color(TC.ground);
const camera=new THREE.PerspectiveCamera(38,1,0.05,300);
const hemiL=new THREE.HemisphereLight(0xe4f2ff,0x1b2a30,1.45);scene.add(hemiL);
const keyL=new THREE.DirectionalLight(0xffffff,2.2);keyL.position.set(6,11,8);scene.add(keyL);
const rimL=new THREE.DirectionalLight(0x9fd6dc,0.9);rimL.position.set(-8,4,-9);scene.add(rimL);
const fillL=new THREE.DirectionalLight(0xffe6d6,0.6);fillL.position.set(-6,3,10);scene.add(fillL);

const secPlane=new THREE.Plane(new THREE.Vector3(0,0,-1),100);
const peelPlane=new THREE.Plane(new THREE.Vector3(0,-1,0),100);
const CLIP=[secPlane,peelPlane],DEVCLIP=[secPlane];
const setC=(c,rgb)=>c.setRGB(clamp(rgb[0]/255),clamp(rgb[1]/255),clamp(rgb[2]/255),THREE.SRGBColorSpace);

(function floorShadow(){const c=document.createElement('canvas');c.width=c.height=256;const g=c.getContext('2d');const gr=g.createRadialGradient(128,128,10,128,128,128);
  gr.addColorStop(0,'rgba(0,0,0,0.55)');gr.addColorStop(1,'rgba(0,0,0,0)');g.fillStyle=gr;g.fillRect(0,0,256,256);
  const m=new THREE.Mesh(new THREE.PlaneGeometry(17,17),new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(c),transparent:true,depthWrite:false}));
  m.rotation.x=-Math.PI/2;m.position.y=-4.7;scene.add(m);})();

/* ---------- tissue containers ---------- */
const tissue=new THREE.Group();scene.add(tissue);
const LKEYS=['sc','epi','pap','ret','sub'];
const LG={};for(const k of LKEYS){LG[k]=new THREE.Group();tissue.add(LG[k]);}
const EXPL={sc:2.8,epi:1.9,pap:0.95,ret:0,sub:-0.95};
let hlMats={},layerMats={},disposables=[],L=null;
const track=o=>{disposables.push(o);return o;};
function regMat(m,sid){m.userData.em0=m.emissive?m.emissive.clone():null;if(sid){(hlMats[sid]=hlMats[sid]||[]).push(m);}return m;}
/* cut objects are capped: back faces seen through the clipping plane are painted as a flat, solid section */
const CAPK={value:1};
const CAP_GLSL='\n  if(!gl_FrontFacing){gl_FragColor=vec4(min(diffuseColor.rgb*0.94+0.02,vec3(1.0))*uCapK,1.0);}';
function capify(m){m.side=THREE.DoubleSide;m.onBeforeCompile=sh=>{sh.uniforms.uCapK=CAPK;let f='uniform float uCapK;\n'+sh.fragmentShader;
    const tag=f.indexOf('#include <opaque_fragment>')>=0?'#include <opaque_fragment>':'#include <output_fragment>';sh.fragmentShader=f.replace(tag,tag+CAP_GLSL);};
  m.customProgramCacheKey=()=>'capped';return m;}
function stdMat(o,sid){const m=new THREE.MeshStandardMaterial(o);m.clippingPlanes=CLIP;if(!o.transparent&&!o.vertexColors)capify(m);track(m);return regMat(m,sid);}
function clearTissue(){for(const k of LKEYS){const g=LG[k];while(g.children.length)g.remove(g.children[0]);}
  for(const d of disposables)if(d.dispose)d.dispose();disposables=[];hlMats={};layerMats={sc:[],epi:[],pap:[],ret:[],sub:[]};}

/* ---------- dermoscopic surface texture ---------- */
const dispCanvas=document.createElement('canvas');dispCanvas.width=dispCanvas.height=TEX;const dctx=dispCanvas.getContext('2d');
const topTex=new THREE.CanvasTexture(dispCanvas);topTex.colorSpace=THREE.SRGBColorSpace;topTex.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
const topMat=new THREE.MeshStandardMaterial({map:topTex,emissiveMap:topTex,emissive:0xffffff,emissiveIntensity:0.6,color:0x8c8c8c,roughness:0.6,metalness:0});
topMat.clippingPlanes=CLIP;regMat(topMat,null);

function gridSurface(n,yFn,colFn){const g=new THREE.PlaneGeometry(8,8,n,n);g.rotateX(-Math.PI/2);const p=g.attributes.position;const col=colFn?new Float32Array(p.count*3):null;const c=new THREE.Color();
  for(let i=0;i<p.count;i++){const x=p.getX(i),z=p.getZ(i);p.setY(i,yFn(x,z));if(colFn){setC(c,colFn(x,z));col[i*3]=c.r;col[i*3+1]=c.g;col[i*3+2]=c.b;}}
  if(col)g.setAttribute('color',new THREE.BufferAttribute(col,3));g.computeVertexNormals();return track(g);}

const LCOL={sc:[[238,222,186],[228,207,165]],epi:[[236,194,172],[214,160,138]],pap:[[243,206,199],[233,180,176]],ret:[[221,166,168],[196,137,142]],sub:[[244,224,162],[230,204,134]]};
const LROWS={sc:1,epi:4,pap:3,ret:6,sub:3};
function columnAt(x,z){const D=L.depths(x,z),yT=L.elevAt(x,z);return{x,z,b:[yT,yT-D2S(D.sc),yT-D2S(D.dej),yT-D2S(D.pap),yT-D2S(2.4),yT-D2S(4.0)],pigA:D.pigA};}
function buildStrip(ax,az,bx,bz,N){const cols=[];for(let i=0;i<=N;i++){const t=i/N;cols.push(columnAt(lerp(ax,bx,t),lerp(az,bz,t)));}
  const out={};const c=new THREE.Color();
  LKEYS.forEach((k,li)=>{const R=LROWS[k],nv=(N+1)*(R+1),pos=new Float32Array(nv*3),col=new Float32Array(nv*3),idx=[];
    for(let i=0;i<=N;i++){const C=cols[i],y0=C.b[li],y1=C.b[li+1];
      for(let r=0;r<=R;r++){const t=r/R,y=lerp(y0,y1,t),v=i*(R+1)+r;pos[v*3]=C.x;pos[v*3+1]=y;pos[v*3+2]=C.z;
        let rgb=mix3(LCOL[k][0],LCOL[k][1],t);const nz=(vnoise(C.x*5+C.z*5+li*3,y*9,17)-0.5)*14;rgb=[rgb[0]+nz,rgb[1]+nz,rgb[2]+nz];
        if(k==='epi'&&t>0.45)rgb=mix3(rgb,[110,68,42],clamp(C.pigA*(t-0.45)/0.55));
        if(k==='ret'){const s=vnoise((C.x+C.z)*2.2,y*14,23);rgb=mix3(rgb,[238,204,200],smoothstep(0.62,0.9,s)*0.4);}
        if(k==='sub'){const s=vnoise((C.x+C.z)*3,y*5,29);rgb=mix3(rgb,[250,236,190],smoothstep(0.4,0.8,s)*0.5);}
        setC(c,rgb);col[v*3]=c.r;col[v*3+1]=c.g;col[v*3+2]=c.b;}}
    for(let i=0;i<N;i++)for(let r=0;r<R;r++){const a=i*(R+1)+r,b=(i+1)*(R+1)+r;idx.push(a,b,a+1,b,b+1,a+1);}
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(pos,3));g.setAttribute('color',new THREE.BufferAttribute(col,3));g.setIndex(idx);g.computeVertexNormals();track(g);
    const lp=new Float32Array(N*6);for(let i=0;i<N;i++)lp.set([cols[i].x,cols[i].b[li],cols[i].z,cols[i+1].x,cols[i+1].b[li],cols[i+1].z],i*6);
    const lg=new THREE.BufferGeometry();lg.setAttribute('position',new THREE.BufferAttribute(lp,3));track(lg);out[k]={g,lg};});
  return out;}

let cutMeshes=[],cutZ=null;
function buildCut(zc){for(const m of cutMeshes){m.parent&&m.parent.remove(m);m.geometry.dispose();}cutMeshes=[];cutZ=zc;if(zc==null||!L)return;
  if(L.kind==='nail'){nailCut(zc);return;}
  const s=buildStrip(-3.999,zc-0.002,3.999,zc-0.002,260);
  for(const k of LKEYS){const m=new THREE.Mesh(s[k].g,cutMat);m.renderOrder=2;LG[k].add(m);cutMeshes.push(m);
    const ln=new THREE.LineSegments(s[k].lg,cutLineMat);LG[k].add(ln);cutMeshes.push(ln);}}
const cutMat=new THREE.MeshStandardMaterial({vertexColors:true,transparent:true,opacity:0.4,depthWrite:false,roughness:0.9,side:THREE.DoubleSide});cutMat.clippingPlanes=[peelPlane];
const cutLineMat=new THREE.LineBasicMaterial({color:0xffffff,transparent:true,opacity:0.55});cutLineMat.clippingPlanes=[peelPlane];
const wallLineMat=new THREE.LineBasicMaterial({color:0xffffff,transparent:true,opacity:0.22});wallLineMat.clippingPlanes=CLIP;

/* ---------- instanced structure batches ---------- */
const TOR=new THREE.TorusGeometry(0.11,0.035,8,28),SPH=new THREE.SphereGeometry(1,14,10),SPH_LO=new THREE.SphereGeometry(1,8,6),CYL=new THREE.CylinderGeometry(1,1,1,6,1),BOX=new THREE.BoxGeometry(1,1,1);
const batches=new Map();
const _m=new THREE.Matrix4(),_q=new THREE.Quaternion(),_s=new THREE.Vector3(),_p=new THREE.Vector3(),_e=new THREE.Euler();
function M4(x,y,z,sx,sy,sz,rx=0,ry=0,rz=0,ord='XYZ'){_e.set(rx,ry,rz,ord);_q.setFromEuler(_e);return _m.compose(_p.set(x,y,z),_q,_s.set(sx,sy,sz)).clone();}
function addInst(layer,sid,color,geo,m4,o={}){const key=layer+'|'+sid+'|'+color+'|'+geo.uuid+'|'+(o.opacity||1)+'|'+(o.em||'');let b=batches.get(key);if(!b){b={layer,sid,color,geo,o,list:[]};batches.set(key,b);}b.list.push(m4);}
function flushInst(){for(const b of batches.values()){const o=b.o;const m=stdMat({color:b.color,roughness:o.rough??0.5,metalness:0,transparent:!!o.opacity,opacity:o.opacity??1,depthWrite:!o.opacity,emissive:o.em||0x000000},b.sid);
    const im=new THREE.InstancedMesh(b.geo,m,b.list.length);b.list.forEach((mm,i)=>im.setMatrixAt(i,mm));im.instanceMatrix.needsUpdate=true;im.frustumCulled=false;LG[b.layer].add(im);}
  batches.clear();}
const Y=(x,z,d)=>L.elevAt(x,z)-D2S(d);
function layerOf(x,z,d){const D=L.depths(x,z);return d<D.sc?'sc':d<D.dej?'epi':d<D.pap?'pap':d<2.4?'ret':'sub';}
function tube(pts3,rad,color,sid,layer,o={}){const v=pts3.map(p=>new THREE.Vector3(p[0],Y(p[0],p[2],p[1]),p[2]));if(v.length<2)return;
  const cur=new THREE.CatmullRomCurve3(v,false,'centripetal');const g=track(new THREE.TubeGeometry(cur,Math.max(8,v.length*3),rad,o.seg||6,false));
  const m=o.mat||stdMat({color,roughness:0.42,emissive:o.em||0x000000,transparent:!!o.opacity,opacity:o.opacity??1,depthWrite:!o.opacity},sid);
  const mesh=new THREE.Mesh(g,m);LG[layer].add(mesh);return m;}

function build3DFeatures(){const vesselMats={};
  const vmat=(sid,plex)=>{const k=sid+(plex?'p':'');if(!vesselMats[k])vesselMats[k]=stdMat({color:plex?'#A0343C':'#C3222F',roughness:0.4,emissive:plex?'#1a0306':'#3a0508'},sid);return vesselMats[k];};
  const haloMat=stdMat({color:'#FFF8EE',transparent:true,opacity:0.28,depthWrite:false,roughness:0.9},'hairpin');
  for(const f of L.features){const rng=mulberry32(((f.x||1)*9187|0)^((f.z||1)*7919|0)^31);
    switch(f.t){
    case'nest':{const lay=layerOf(f.x,f.z,f.d);const col=f.bcc?(f.np?'#C9A2C4':'#4A5870'):(f.d<0.045?'#22150F':f.d<0.15?'#6A3E22':'#57525E');const y=Y(f.x,f.z,f.d);
      addInst(lay,f.sid,col,SPH,M4(f.x,y,f.z,f.r,f.r*1.5,f.r));
      for(let k=0;k<3;k++){const a=rng()*TAU;addInst(lay,f.sid,col,SPH_LO,M4(f.x+Math.cos(a)*f.r*0.7,y+(rng()-0.5)*f.r,f.z+Math.sin(a)*f.r*0.7,f.r*0.55,f.r*0.8,f.r*0.55));}break;}
    case'cloud':{for(const p of f.parts){const lay=layerOf(p.x,p.z,p.d),y=Y(p.x,p.z,p.d);
        if(f.elong)addInst(lay,f.sid,f.c3,SPH_LO,M4(p.x,y,p.z,p.s*f.elong,p.s,p.s,0,p.ry,p.rz,'YXZ'));
        else addInst(lay,f.sid,f.c3,SPH_LO,M4(p.x,y,p.z,p.s,p.s*1.4,p.s));}break;}
    case'collagen':{const col=f.style==='dense'?'#E9DDC8':'#F5EFE6';const em=f.style==='dense'?0x000000:0x2a2a2a;
      for(const p of f.parts)addInst(layerOf(p.x,p.z,p.d),f.sid,col,CYL,M4(p.x,Y(p.x,p.z,p.d),p.z,p.rad,p.len,p.rad,0,-p.ang,Math.PI/2+p.tilt,'YZX'),{em});break;}
    case'vessel':{const md=f.pts.reduce((s,p)=>s+p[1],0)/f.pts.length;const mx=f.pts[Math.floor(f.pts.length/2)];const lay=layerOf(mx[0],mx[2],md);
      tube(f.pts,Math.max(0.013,f.rad*1.25),null,f.sid,lay,{mat:vmat(f.sid,f.kind==='plexus')});
      if(f.halo)tube(f.pts,Math.max(0.013,f.rad*1.25)*3.2,null,f.sid,lay,{mat:haloMat,seg:8});break;}
    case'milia':addInst(layerOf(f.x,f.z,f.d),f.sid,'#F6F0D6',SPH,M4(f.x,Y(f.x,f.z,f.d),f.z,f.r,f.r*1.4,f.r),{em:0x2a2618});break;
    case'comedo':{const y0=L.elevAt(f.x,f.z),y1=Y(f.x,f.z,0.16),h=y0-y1;addInst('epi',f.sid,'#3A2517',CYL,M4(f.x,y0-h/2+0.01,f.z,f.r,h,f.r*0.85));break;}
    case'follicle':{const c=Math.cos(f.ang),s=Math.sin(f.ang);const P=[[f.x,0.0,f.z],[f.x+0.12*c,0.3,f.z+0.12*s],[f.x+0.35*c,1.1,f.z+0.35*s],[f.x+0.5*c,1.9,f.z+0.5*s]];
      tube(P,0.07,'#D8BBA6',f.sid,'ret');const b=P[3];addInst('ret',f.sid,'#C99D84',SPH,M4(b[0],Y(b[0],b[2],b[1]),b[2],0.13,0.16,0.13));
      if(f.hair){tube(P.slice(0).reverse().slice(0,3).reverse(),0.022,'#2B1C14',f.sid,'ret');
        const y0=L.elevAt(f.x,f.z),hp=[new THREE.Vector3(f.x,y0-0.02,f.z),new THREE.Vector3(f.x-c*f.len*0.35,y0+0.14,f.z-s*f.len*0.35),new THREE.Vector3(f.x-c*f.len,y0+0.26,f.z-s*f.len)];
        LG.sc.add(new THREE.Mesh(track(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(hp),16,0.02,5)),stdMat({color:'#2B1C14',roughness:0.35},f.sid)));}
      if(f.wc){addInst('epi',f.sid,'#FBF6EC',track(new THREE.TorusGeometry(0.11,0.035,8,28)),M4(f.x,Y(f.x,f.z,0.04),f.z,1,1,1,Math.PI/2,0,0),{em:0x333026});
        addInst('sc',f.sid,'#E2C47A',CYL,M4(f.x,L.elevAt(f.x,f.z)-0.03,f.z,0.05,0.08,0.05));}
      break;}
    case'tumor':if(f.kind==='mel'){const y0=Y(f.x,f.z,f.d0),y1=Y(f.x,f.z,f.d1),cy=(y0+y1)/2,ry=(y0-y1)/2,lay=layerOf(f.x,f.z,(f.d0+f.d1)/2);
        addInst(lay,f.sid,'#2C2436',SPH,M4(f.x,cy,f.z,f.r,ry,f.r),{rough:0.6});
        for(let k=0;k<10;k++){const a=k/10*TAU+rng(),q=f.r*(0.5+rng()*0.3),yy=cy+(rng()-0.5)*ry*1.1,s=f.r*(0.32+rng()*0.2);addInst(lay,f.sid,k%2?'#3B3048':'#1F1A26',SPH_LO,M4(f.x+Math.cos(a)*q,yy,f.z+Math.sin(a)*q,s,Math.min(ry,s*1.6),s),{rough:0.6});}
        break;}
      {const lay=layerOf(f.x,f.z,f.d);const col=f.kind==='scc'?'#E6C4B6':(f.pig?'#4D5A73':'#C6A0C3');const y=Y(f.x,f.z,f.d);
      addInst(lay,f.sid,col,SPH,M4(f.x,y,f.z,f.r,f.r*1.05,f.r),{rough:0.7});
      for(let k=0;k<6;k++){const a=k/6*TAU+rng(),q=f.r*0.62;addInst(lay,f.sid,col,SPH_LO,M4(f.x+Math.cos(a)*q,y+(rng()-0.5)*f.r*0.6,f.z+Math.sin(a)*q,f.r*0.5,f.r*0.5,f.r*0.5),{rough:0.7});}
      if(f.kind==='scc')for(let k=0;k<2;k++)addInst(lay,f.sid,'#FCF3D8',SPH_LO,M4(f.x+(rng()-0.5)*f.r,y+(rng()-0.5)*f.r*0.5,f.z+(rng()-0.5)*f.r,f.r*0.22,f.r*0.22,f.r*0.22),{em:0x2a2618});
      break;}
    case'blood':addInst('sc',f.sid,'#5A0A12',SPH,M4(f.x,L.elevAt(f.x,f.z)-0.04,f.z,f.r,f.r*0.6,f.r));break;
    case'ulcer':for(let k=0;k<9;k++){const a=rng()*TAU,q=Math.sqrt(rng())*f.r;const x=f.x+Math.cos(a)*q,z=f.z+Math.sin(a)*q,s=rr(rng,0.06,0.12);
      addInst('sc',f.sid,rng()<0.5?'#6E1C14':'#8A3A1C',SPH_LO,M4(x,L.elevAt(x,z)+0.01,z,s,s*0.45,s),{rough:0.9});}break;
    case'scale':addInst('sc',f.sid,'#EFE5C9',BOX,M4(f.x,L.elevAt(f.x,f.z)+0.012,f.z,f.r,0.02,f.r*0.7,(rng()-0.5)*0.3,rng()*TAU,(rng()-0.5)*0.3,'YXZ'),{rough:0.95});break;
    case'veil':addInst('sc',f.sid,'#EFEAF4',SPH,M4(f.x,L.elevAt(f.x,f.z)-0.06,f.z,f.r*0.9,0.045,f.r*0.85),{opacity:0.72});break;
    case'folopen':{if(f.plug>0.2){const y0=L.elevAt(f.x,f.z),h=D2S(0.1);addInst('epi',f.sid,'#E9CF86',CYL,M4(f.x,y0-h/2+0.01,f.z,f.r*0.9,h,f.r*0.9),{em:0x1a1608});}
      if(f.halo>0.3){const k=f.r*1.6/0.11;addInst('epi',f.sid,'#FBF6EC',TOR,M4(f.x,Y(f.x,f.z,0.03),f.z,k,k,k*0.8,Math.PI/2,0,0),{em:0x333026});}
      if(f.lm){const l=f.lm,c=l.obl?'#24170F':'#3A2418',n=l.obl?12:l.asym?6:0;   // lentigo maligna: melanocytes down the follicle, projections, grey melanophages
        for(let i=0;i<n;i++){const a=l.obl?i/n*TAU:l.aA+(i/Math.max(1,n-1)-0.5)*l.aW,q=f.r*1.15,x=f.x+Math.cos(a)*q,z=f.z+Math.sin(a)*q,d=0.035+0.05*(i%3)+(l.obl?0.05:0);addInst('epi',f.sid,c,SPH_LO,M4(x,Y(x,z,d),z,0.02,0.035,0.02));}
        for(let i=0;i<l.plp;i++){const a=l.aA+(i-(l.plp-1)/2)*0.95,r0=f.r*1.35,len=l.plpL,x=f.x+Math.cos(a)*(r0+len/2),z=f.z+Math.sin(a)*(r0+len/2);addInst('epi',f.sid,'#4A2E1E',CYL,M4(x,Y(x,z,0.05),z,0.012,len,0.012,0,-a,Math.PI/2,'YZX'));}
        if(l.rh||l.redRh){const col=l.redRh?'#B3283A':'#5A4E52',rr2=0.15;for(let i=0;i<4;i++){const a0=l.aA+i*Math.PI/2,a1=a0+Math.PI/2,x=f.x+(Math.cos(a0)+Math.cos(a1))*rr2/2,z=f.z+(Math.sin(a0)+Math.sin(a1))*rr2/2,ang=Math.atan2(Math.sin(a1)-Math.sin(a0),Math.cos(a1)-Math.cos(a0));
          addInst(l.redRh?'pap':'epi',f.sid,col,CYL,M4(x,Y(x,z,l.redRh?0.12:0.06),z,0.014,rr2*1.35,0.014,0,-ang,Math.PI/2,'YZX'));}}
        if(l.tgt)addInst('epi',f.sid,'#1E140E',SPH_LO,M4(f.x,Y(f.x,f.z,0.06),f.z,0.03,0.04,0.03));}
      break;}
    case'elastosis':{const r2=mulberry32(771);for(let i=0;i<f.n;i++){const a=r2()*TAU,q=Math.sqrt(r2())*f.r,x=f.x+Math.cos(a)*q,z=f.z+Math.sin(a)*q,d=lerp(f.d0,f.d1,r2()),l=rr(r2,0.1,0.22),e1=r2()*TAU,e2=r2()*TAU;if(Math.abs(x)>3.92||Math.abs(z)>3.92)continue;
        addInst(layerOf(x,z,d),f.sid,'#B7AECB',CYL,M4(x,Y(x,z,d),z,0.013,l,0.013,e1,e2,0),{rough:0.8});}break;}
    case'lichenoid':{const r2=mulberry32(772);for(let i=0;i<f.n;i++){const a=r2()*TAU,q=Math.sqrt(r2())*f.r,x=f.x+Math.cos(a)*q,z=f.z+Math.sin(a)*q,u=rr(r2,0.004,0.05);if(L.R(x,z)>1.02)continue;const d=L.depths(x,z).dej+u;
        addInst('pap',f.sid,'#4E3A78',SPH_LO,M4(x,Y(x,z,d),z,0.022,0.022,0.022));}break;}
    case'infl':{const r2=mulberry32(773);for(let c=0;c<f.n;c++){const a=r2()*TAU,q=Math.sqrt(r2())*f.r,cx=f.x+Math.cos(a)*q,cz=f.z+Math.sin(a)*q,cd=lerp(f.d0,f.d1,r2());
        for(let i=0;i<16;i++){const x=cx+(r2()-0.5)*0.14,z=cz+(r2()-0.5)*0.14,d=cd+(r2()-0.5)*0.05;addInst(layerOf(x,z,d),f.sid,'#4E3A78',SPH_LO,M4(x,Y(x,z,d),z,0.022,0.022,0.022));}}break;}
    case'fatd':{const r2=mulberry32(774);for(let i=0;i<f.n;i++){const a=r2()*TAU,q=Math.sqrt(r2())*f.r,x=f.x+Math.cos(a)*q,z=f.z+Math.sin(a)*q,d=lerp(f.d0,f.d1,r2()),sz=rr(r2,0.05,0.08);
        addInst(layerOf(x,z,d),f.sid,'#F1DC98',SPH_LO,M4(x,Y(x,z,d),z,sz,sz*0.8,sz),{rough:0.35});}break;}
    case'streak':{const c=Math.cos(f.ang),s=Math.sin(f.ang);for(let k=0;k<6;k++){const t=k/5,x=f.x+c*f.len*t,z=f.z+s*f.len*t,w=f.w*(1-0.55*t)*0.8;
        addInst('epi',f.sid,'#3A2314',SPH_LO,M4(x,Y(x,z,f.d),z,w,w*1.4,w));}
      if(f.tip){const x=f.x+c*f.len,z=f.z+s*f.len;addInst('epi',f.sid,'#3A2314',SPH,M4(x,Y(x,z,f.d),z,f.w*0.75,f.w,f.w*0.75));}break;}
    }}
  // subcutaneous fat lobules
  const rng=mulberry32(L.seed+99);for(let i=0;i<150;i++){const x=rr(rng,-3.6,3.6),z=rr(rng,-3.6,3.6),d=rr(rng,2.55,3.85),s=rr(rng,0.3,0.48);
    addInst('sub','fat','#F1DC98',SPH_LO,M4(x,Y(x,z,d),z,s,s*0.62,s),{rough:0.35});}
  flushInst();}

function buildTissue(){if(L.kind==='nail'){buildNailTissue();return;}clearTissue();cutMeshes=[];
  // lens surface
  const top=new THREE.Mesh(gridSurface(230,(x,z)=>L.elevAt(x,z)),topMat);LG.sc.add(top);
  // dermo-epidermal junction, coloured by basal pigment along the rete ridges
  const dejMat=stdMat({vertexColors:true,roughness:0.62,side:THREE.DoubleSide},'net');
  LG.epi.add(new THREE.Mesh(gridSurface(240,(x,z)=>{const D=L.depths(x,z);return L.elevAt(x,z)-D2S(D.dej);},(x,z)=>{const D=L.depths(x,z);const u=L.ulcer(x,z,D.r);
    let c=mix3([222,170,150],[104,62,38],D.pigA);if(u>0)c=mix3(c,[168,52,44],u);return c;}),dejMat));
  const pf=stdMat({vertexColors:true,roughness:0.85,side:THREE.DoubleSide});
  LG.pap.add(new THREE.Mesh(gridSurface(70,(x,z)=>L.elevAt(x,z)-D2S(L.depths(x,z).pap),()=>[214,156,158]),pf));
  const rf=stdMat({color:'#E9CF93',roughness:0.8,side:THREE.DoubleSide});
  LG.ret.add(new THREE.Mesh(gridSurface(40,(x,z)=>L.elevAt(x,z)-D2S(2.4)),rf));
  const sf=stdMat({color:'#D9BF82',roughness:0.9,side:THREE.DoubleSide});
  LG.sub.add(new THREE.Mesh(gridSurface(30,(x,z)=>L.elevAt(x,z)-D2S(4.0)),sf));
  // walls
  const wm={};for(const k of LKEYS){wm[k]=stdMat({vertexColors:true,roughness:0.88,side:THREE.DoubleSide});layerMats[k].push(wm[k]);}
  for(const e of[[-4,-4,4,-4],[4,-4,4,4],[4,4,-4,4],[-4,4,-4,-4]]){const s=buildStrip(e[0],e[1],e[2],e[3],200);
    for(const k of LKEYS){LG[k].add(new THREE.Mesh(s[k].g,wm[k]));LG[k].add(new THREE.LineSegments(s[k].lg,wallLineMat));}}
  build3DFeatures();
  if(cutZ!=null)buildCut(cutZ);}

/* ---------- highlight ---------- */
const HL={sid:null,layer:null,t:0};
const SID_ALIAS={ker:'@sc',gyri:'@sc',border:'@epi',fade:'net'};
function matsForSid(sid){const a=SID_ALIAS[sid];if(a&&a[0]==='@')return[...(layerMats[a.slice(1)]||[]),topMat];return hlMats[a||sid]||[];}
function applyHighlight(t){const pulse=0.35+0.3*Math.sin(t*4.2);
  for(const k in hlMats)for(const m of hlMats[k])if(m.emissive&&m.userData.em0)m.emissive.copy(m.userData.em0);
  for(const k in layerMats)for(const m of layerMats[k])m.emissive.setRGB(0,0,0);
  topMat.emissive.setRGB(1,1,1);
  if(HL.sid){for(const m of matsForSid(HL.sid))if(m.emissive&&m!==topMat)m.emissive.setRGB(0.95*pulse,0.78*pulse,0.45*pulse);}
  if(HL.layer){for(const m of layerMats[HL.layer]||[])m.emissive.setRGB(0.5*pulse,0.42*pulse,0.25*pulse);}}

/* ---------- selection marks ---------- */
const markMat=new THREE.MeshBasicMaterial({color:'#F2E4C9',transparent:true,opacity:0.95,depthTest:false,side:THREE.DoubleSide});
const beam=new THREE.Mesh(new THREE.CylinderGeometry(0.012,0.012,1,8),markMat);beam.renderOrder=20;beam.visible=false;scene.add(beam);
const footRing=new THREE.Mesh(new THREE.RingGeometry(0.93,1,72),markMat);footRing.rotation.x=-Math.PI/2;footRing.renderOrder=20;footRing.visible=false;scene.add(footRing);
const focusDot=new THREE.Mesh(new THREE.SphereGeometry(0.045,16,12),markMat);focusDot.renderOrder=21;focusDot.visible=false;scene.add(focusDot);

/* ---------- melanin probe (chapter 4) ---------- */
const probe=new THREE.Group();(function(){const m=capify(new THREE.MeshStandardMaterial({color:'#1B130E',roughness:0.5}));m.clippingPlanes=CLIP;const r=mulberry32(5);
  for(let i=0;i<18;i++){const s=0.07+r()*0.07;const b=new THREE.Mesh(SPH_LO,m);b.scale.set(s,s*1.3,s);b.position.set((r()-0.5)*0.42,(r()-0.5)*0.16,(r()-0.5)*0.42);probe.add(b);}})();
probe.visible=false;scene.add(probe);
const PROBE={x:1.7,z:-0.35};

/* =====================================================================
   Dermatoscope model
   ===================================================================== */
const device=new THREE.Group();scene.add(device);
const DP={};
function stripeTex(vertical){const c=document.createElement('canvas');c.width=c.height=128;const g=c.getContext('2d');g.fillStyle='rgba(60,84,94,0.5)';g.fillRect(0,0,128,128);g.fillStyle='rgba(8,16,20,0.9)';
  for(let i=0;i<128;i+=8){if(vertical)g.fillRect(i,0,3,128);else g.fillRect(0,i,128,3);}const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(6,6);return t;}
function devMat(o){const m=new THREE.MeshStandardMaterial(o);m.clippingPlanes=DEVCLIP;return m;}
const glass=(col,op)=>devMat({color:col,transparent:true,opacity:op,roughness:0.08,metalness:0.1,side:THREE.DoubleSide,depthWrite:false});
(function buildDevice(){
  const prof=[[3.02,0.0],[3.18,0.02],[3.22,0.3],[3.36,1.28],[3.36,1.8],[2.2,1.9],[1.66,1.96],[1.6,2.02]].map(p=>new THREE.Vector2(p[0],p[1]));
  DP.housing=new THREE.Mesh(new THREE.LatheGeometry(prof,80),devMat({color:'#2B3B44',roughness:0.35,metalness:0.4,transparent:true,opacity:0.46,side:THREE.DoubleSide,depthWrite:false}));
  DP.plate=new THREE.Mesh(new THREE.CylinderGeometry(3.0,3.0,0.07,80),glass('#DDF5F8',0.3));DP.plate.userData.y0=0.035;
  DP.fluid=new THREE.Mesh(new THREE.CylinderGeometry(2.94,2.94,0.035,80),glass('#6FCFE4',0.34));DP.fluid.userData.y0=-0.018;
  DP.leds=new THREE.Group();DP.ledMat=devMat({color:'#ffffff',emissive:'#ffffff',emissiveIntensity:2.2,roughness:0.3});
  for(let i=0;i<16;i++){const a=i/16*TAU,b=new THREE.Mesh(new THREE.BoxGeometry(0.2,0.08,0.2),DP.ledMat);b.position.set(Math.cos(a)*2.74,0,Math.sin(a)*2.74);b.rotation.y=-a;DP.leds.add(b);}
  DP.leds.userData.y0=1.36;
  const pr=new THREE.RingGeometry(2.42,3.02,80);pr.rotateX(-Math.PI/2);DP.pol=new THREE.Mesh(pr,devMat({map:stripeTex(false),transparent:true,opacity:0.85,side:THREE.DoubleSide,depthWrite:false,roughness:0.6}));DP.pol.userData.y0=1.27;
  const ac=new THREE.CircleGeometry(1.52,80);ac.rotateX(-Math.PI/2);DP.ana=new THREE.Mesh(ac,devMat({map:stripeTex(true),transparent:true,opacity:0.8,side:THREE.DoubleSide,depthWrite:false,roughness:0.6}));DP.ana.userData.y0=1.5;
  DP.lens=new THREE.Mesh(new THREE.SphereGeometry(1.52,56,20),glass('#BEE8FF',0.32));DP.lens.scale.set(1,0.14,1);DP.lens.userData.y0=1.72;
  DP.cup=new THREE.Mesh(new THREE.TorusGeometry(1.64,0.1,12,80),devMat({color:'#18232A',roughness:0.7}));DP.cup.rotation.x=Math.PI/2;DP.cup.userData.y0=2.02;
  DP.handle=new THREE.Mesh(new THREE.CylinderGeometry(0.42,0.5,4.4,32),devMat({color:'#1E2A31',roughness:0.45,metalness:0.3}));
  DP.handle.rotation.z=(Math.PI/2+0.35);DP.handle.position.set(-(3.3+2.2*Math.cos(0.35)),0.95-2.2*Math.sin(0.35),0);
  DP.housing.userData.y0=0;DP.handle.userData.y0=DP.handle.position.y;
  for(const k of['housing','plate','fluid','leds','pol','ana','lens','cup','handle']){device.add(DP[k]);DP[k].position.y=DP[k].userData.y0;}
})();
const DEV_EXPL={plate:-1.1,fluid:-1.6,housing:0,handle:0,pol:0.8,leds:1.3,ana:2.0,lens:2.7,cup:3.3};
function layoutDevice(expl){for(const k in DEV_EXPL)DP[k].position.y=DP[k].userData.y0+DEV_EXPL[k]*expl;}

/* =====================================================================
   Dermoscopic image painter. Every structure is drawn from the same
   feature list that builds the 3D tissue, so the lens image and the
   block stay aligned. Visibility per mode comes from V(mode, depth).
   ===================================================================== */
let GMAP=null;
function buildGMap(){const n=TEX*TEX,mott=new Float32Array(n),fur=new Float32Array(n),grain=new Float32Array(n);
  for(let j=0;j<TEX;j++){const z=-4+(j+0.5)*8/TEX;for(let i=0;i<TEX;i++){const x=-4+(i+0.5)*8/TEX,k=j*TEX+i;
    mott[k]=fbm(x*0.9,z*0.9,3,3);
    const w1=fbm(x*0.55,z*0.55,5,2)*6,w2=fbm(x*0.55+9,z*0.55,6,2)*6;
    const f1=Math.abs(Math.sin((x*0.8+z*0.6)*8.5+w1)),f2=Math.abs(Math.sin((-x*0.6+z*0.8)*7.2+w2));
    fur[k]=Math.max(1-smoothstep(0,0.1,f1),1-smoothstep(0,0.085,f2))*(0.35+0.65*vnoise(x*1.4,z*1.4,8));
    grain[k]=hash2(i,j,99)-0.5;}}
  GMAP={mott,fur,grain};}

/* pre-generate particle positions so 2D and 3D share them */
function prepFeatures(L){for(const f of L.features){const rng=mulberry32(((f.x||1)*9187|0)^((f.z||1)*7919|0)^131);
  if(f.t==='cloud'){f.parts=[];for(let i=0;i<f.n;i++){let x,z,t=0;do{const a=rng()*TAU,q=Math.sqrt(rng());x=f.x+Math.cos(a)*q*f.rx;z=f.z+Math.sin(a)*q*f.rz;t++;}while(f.shape&&!f.shape(x,z)&&t<20);
    f.parts.push({x,z,d:lerp(f.d0,f.d1,Math.pow(rng(),f.elong?0.8:1)),s:f.size*(0.6+rng()*0.8),ry:rng()*TAU,rz:(rng()-0.5)*0.6});}}
  if(f.t==='collagen'){f.parts=[];for(let i=0;i<f.n;i++){const a=rng()*TAU,q=f.ring?lerp(f.ring/f.r,1,Math.sqrt(rng())):Math.sqrt(rng());
    const dense=f.style==='dense';f.parts.push({x:f.x+Math.cos(a)*q*f.r,z:f.z+Math.sin(a)*q*f.r,d:lerp(f.d0,f.d1,rng()),
      ang:f.style==='lines'?((rng()<0.5?0:Math.PI/2)+(rng()-0.5)*0.25):rng()*Math.PI,len:dense?rr(rng,0.18,0.42):rr(rng,0.12,0.28),rad:dense?rr(rng,0.02,0.035):rr(rng,0.012,0.02),tilt:dense?(rng()-0.5)*0.6:0});}}}}

const PIGLUT=[];for(let i=0;i<=400;i++)PIGLUT.push(pigColor(i*0.005));
const pigL=d=>PIGLUT[Math.min(400,Math.max(0,Math.round(d/0.005)))];

/* per-pixel maps, quantized to 8 bits (pigment depth in 2 µm steps) and computable
   in row chunks so that later stages of an evolution can be prepared in idle time */
const MAPK=['net','pig','pigD','ker','ery','gyr','prl','derm'];
let E0=null;const E0_IRR=0.15;
const q8=v=>v<=0?0:v>=1?255:(v*255+0.5)|0;
function newMaps(){const n=TEX*TEX,M={row:0,done:false};for(const k of MAPK)M[k]=new Uint8Array(n);return M;}
function mapRows(L,M,j0,j1){if(!E0)E0=new Float32Array(TEX*TEX).fill(-1);j1=Math.min(TEX,j1);
  for(let j=j0;j<j1;j++){const z=-4+(j+0.5)*8/TEX;for(let i=0;i<TEX;i++){const x=-4+(i+0.5)*8/TEX,k=j*TEX+i;const r=L.R(x,z);
    const ni=L.netI(x,z,r);if(ni>0.015){const irr=L.irr(x,z,r);let e;if(irr===E0_IRR){e=E0[k];if(e<0){e=reteEdge(x,z,irr);E0[k]=e;}}else e=reteEdge(x,z,irr);
      const w=L.netW(x,z,r);M.net[k]=q8(ni*(1-smoothstep(-w*0.25,w,e)));}
    M.pigD[k]=35;
    if(r<1.35){M.pig[k]=q8(L.pig(x,z,r));M.pigD[k]=Math.min(255,Math.round(L.pigD(x,z,r)*500));M.ker[k]=q8(L.ker(x,z,r));M.ery[k]=q8(L.ery(x,z,r));M.gyr[k]=q8(L.gyri(x,z,r));M.prl[k]=q8(L.pearl(x,z,r));M.derm[k]=q8(L.derm(x,z,r));}}}
  M.row=j1;if(j1>=TEX)M.done=true;return M;}
function computeMaps(L){return mapRows(L,newMaps(),0,TEX);}
function finishMaps(L,M){if(!M.done)mapRows(L,M,M.row,TEX);return M;}

const MODEP=[
  {base:[226,190,172],ery:[208,116,112],eryK:0.45,net:0.55,pig:0.62,kerC:[246,238,214],ker:1.0,fur:0.24,gk:9,prlC:[238,210,204],prl:0.35},
  {base:[214,160,141],ery:[204,96,98],eryK:0.7,net:1.0,pig:1.0,kerC:[240,230,200],ker:0.82,fur:0.12,gk:6,prlC:[238,200,196],prl:0.5},
  {base:[217,150,134],ery:[212,82,92],eryK:0.95,net:0.95,pig:1.05,kerC:[246,238,216],ker:0.92,fur:0.1,gk:6,prlC:[246,218,216],prl:0.66},
  {base:[164,156,226],ery:[122,112,198],eryK:0.35,net:1,pig:1,kerC:[234,232,255],ker:1.0,fur:0.3,gk:8,prlC:[178,172,234],prl:0.22}];
const NAVY=[30,26,74];

function compose(data,M,m,L){const P=MODEP[m],G=GMAP,blue=m===3,vNet=V(m,0.08)*P.net;
  const netC=m===2?[78,48,29]:[92,58,36],dermC=pigColor(L.dermD||0.8),vDerm=Math.min(1,V(m,L.dermD||0.8)*1.9),gyC=[64,42,28];
  const s8=1/255,VD=new Float32Array(256);for(let i=0;i<256;i++)VD[i]=V(m,i*0.002);
  for(let k=0,o=0;k<TEX*TEX;k++,o+=4){const mo=G.mott[k];let r=P.base[0]*(0.92+0.16*mo),g=P.base[1]*(0.92+0.16*mo),b=P.base[2]*(0.93+0.14*mo),t,c;
    t=M.ery[k]*s8*P.eryK;if(t>0){c=P.ery;r+=(c[0]-r)*t;g+=(c[1]-g)*t;b+=(c[2]-b)*t;}
    t=M.prl[k]*s8*P.prl;if(t>0){c=P.prlC;r+=(c[0]-r)*t;g+=(c[1]-g)*t;b+=(c[2]-b)*t;}
    t=M.derm[k]*s8;if(t>0){t*=vDerm;c=blue?NAVY:dermC;r+=(c[0]-r)*t;g+=(c[1]-g)*t;b+=(c[2]-b)*t;}
    t=M.pig[k]*s8;if(t>0){const dq=M.pigD[k];t=clamp(t*VD[dq]*P.pig*(blue?1.5:1));c=blue?NAVY:pigL(dq*0.002);r+=(c[0]-r)*t;g+=(c[1]-g)*t;b+=(c[2]-b)*t;}
    t=M.net[k]*s8;if(t>0){t=clamp(t*vNet*(blue?1.6:0.95));c=blue?NAVY:netC;r+=(c[0]-r)*t;g+=(c[1]-g)*t;b+=(c[2]-b)*t;}
    t=M.gyr[k]*s8;if(t>0){t*=0.85;c=blue?NAVY:gyC;r+=(c[0]-r)*t;g+=(c[1]-g)*t;b+=(c[2]-b)*t;}
    t=M.ker[k]*s8*P.ker;if(t>0){c=P.kerC;const q=0.9+0.2*mo;r+=(c[0]*q-r)*t;g+=(c[1]*q-g)*t;b+=(c[2]*q-b)*t;}
    const fu=1-G.fur[k]*P.fur*(1-0.8*Math.max(M.ker[k],M.prl[k])*s8);r*=fu;g*=fu;b*=fu;
    const gr=G.grain[k]*P.gk;data[o]=r+gr;data[o+1]=g+gr;data[o+2]=b+gr;data[o+3]=255;}}

const PX=x=>(x+4)*PXMM;
function softDisc(ctx,x,y,r,rgb,a,hard=0.5){if(a<=0.004||r<=0)return;const g=ctx.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,rgbStr(rgb,a));g.addColorStop(hard,rgbStr(rgb,a*0.85));g.addColorStop(1,rgbStr(rgb,0));ctx.fillStyle=g;ctx.beginPath();ctx.arc(x,y,r,0,TAU);ctx.fill();}
function blobPath(ctx,x,y,R,seed,amp=0.22,n=56){ctx.beginPath();for(let i=0;i<=n;i++){const a=i/n*TAU;const k=1+amp*(vnoise(Math.cos(a)*1.7+seed,Math.sin(a)*1.7+seed,13)-0.5)*2;const px=x+Math.cos(a)*R*k,py=y+Math.sin(a)*R*k;i?ctx.lineTo(px,py):ctx.moveTo(px,py);}ctx.closePath();}
function softBlob(ctx,x,y,R,rgb,a,seed,soft=0.55){if(a<=0.004)return;const g=ctx.createRadialGradient(x,y,0,x,y,R*1.12);g.addColorStop(0,rgbStr(rgb,a));g.addColorStop(1-soft*0.65,rgbStr(rgb,a*0.9));g.addColorStop(1,rgbStr(rgb,0));ctx.fillStyle=g;blobPath(ctx,x,y,R*1.12,seed,0.26);ctx.fill();}
function patch(ctx,f,R,rgb,a,seed){const rng=mulberry32(seed);for(let i=0;i<7;i++){const q=i?R*0.45*Math.sqrt(rng()):0,an=rng()*TAU;softDisc(ctx,PX(f.x+Math.cos(an)*q),PX(f.z+Math.sin(an)*q),R*PXMM*(i?0.62:1.0),rgb,a*(i?0.55:0.8),0.45);}}

function drawFeatures(ctx,L,m){const blue=m===3,F=L.features,of=t=>F.filter(f=>f.t===t);
  ctx.lineCap='round';ctx.lineJoin='round';
  // regression white, veil, blotch
  for(const f of of('scar')){const s=f.strong?1.15:(f.a??1);const C=[[236,226,220,0.42],[238,224,218,0.62],[250,246,242,0.78],[214,212,246,0.35]][m];softBlob(ctx,PX(f.x),PX(f.z),f.r*PXMM,C,clamp(C[3]*s),17);}
  for(const f of of('veil')){const B=[[140,150,184,0.45,0.22],[112,130,170,0.8,0.17],[92,106,150,0.64,0.06],[188,184,238,0.25,0.12]][m];
    softBlob(ctx,PX(f.x),PX(f.z),f.r*PXMM,B,B[3],23);softBlob(ctx,PX(f.x+0.05),PX(f.z-0.04),f.r*PXMM*0.78,[240,244,252],B[4],29,0.8);}
  for(const f of of('blotch')){const a=blue?clamp(0.9*V(3,f.d)*1.6):0.93*V(m,f.d)/Math.max(0.6,V(m,0));ctx.fillStyle=rgbStr(blue?NAVY:[40,26,18],a);
    blobPath(ctx,PX(f.x),PX(f.z),f.r*PXMM,5,0.28);ctx.save();ctx.filter='blur(3px)';ctx.fill();ctx.restore();}
  // mottled lentigo-like spots, milky-red areas
  for(const f of of('spot'))softBlob(ctx,PX(f.x),PX(f.z),f.r*PXMM,blue?NAVY:[150,104,74],clamp((f.a||0.3)*(m===0?0.7:1)*(blue?1.4:1)),f.seed||31,0.75);
  for(const f of of('milky')){const A=[0.3,0.5,0.72,0.18][m]*(f.a||1);softBlob(ctx,PX(f.x),PX(f.z),f.r*PXMM,blue?[150,140,215]:[222,118,130],A,f.seed||41,0.85);
    softBlob(ctx,PX(f.x+0.04),PX(f.z-0.03),f.r*PXMM*0.72,blue?[210,206,250]:[246,222,226],A*0.5,(f.seed||41)+3,0.9);}
  // peppering dots
  for(const f of of('cloud'))if(f.s2==='dots')for(const p of f.parts){const v=V(m,p.d)*(m===2?0.7:1);const c=blue?NAVY:pigL(p.d);softDisc(ctx,PX(p.x),PX(p.z),Math.max(1.4,p.s*PXMM*0.9),c,clamp(v*1.25*(blue?1.3:1)),0.55);}
  // pigmented tumour nests (BCC)
  for(const f of of('tumor'))if(f.pig){const rng=mulberry32(f.x*1000|0);const v=clamp(V(m,f.d)*1.25*(blue?1.6:1));const c=blue?NAVY:pigL(f.d);
    ctx.save();ctx.translate(PX(f.x),PX(f.z));ctx.rotate(rng()*Math.PI);ctx.scale(1,0.62+rng()*0.2);softDisc(ctx,0,0,f.r*PXMM,c,v*0.95,0.62);ctx.restore();
    for(let i=0;i<4;i++){const a=rng()*TAU,q=rng()*f.r*0.6;softDisc(ctx,PX(f.x+Math.cos(a)*q),PX(f.z+Math.sin(a)*q),f.r*PXMM*0.25,blue?NAVY:pigL(f.d+0.1),v*0.6,0.5);}}
  // globules, dots
  for(const f of of('nest')){if(f.np)continue;const v=clamp(V(m,f.d)*1.25*(blue?1.8:1));softDisc(ctx,PX(f.x),PX(f.z),Math.max(1.8,f.r*PXMM*1.08),blue?NAVY:pigL(f.d),v*0.95,0.6);}
  // streaks
  for(const f of of('streak')){const v=clamp(V(m,f.d)*1.2*(blue?1.7:1));const c=blue?NAVY:[52,32,21],cs=Math.cos(f.ang),sn=Math.sin(f.ang),px=-sn,pz=cs;
    const x0=f.x,z0=f.z,x1=f.x+cs*f.len,z1=f.z+sn*f.len,w0=f.w*0.5,w1=f.w*0.18;
    ctx.fillStyle=rgbStr(c,v*0.92);ctx.beginPath();ctx.moveTo(PX(x0+px*w0),PX(z0+pz*w0));ctx.lineTo(PX(x1+px*w1),PX(z1+pz*w1));ctx.lineTo(PX(x1-px*w1),PX(z1-pz*w1));ctx.lineTo(PX(x0-px*w0),PX(z0-pz*w0));ctx.closePath();ctx.fill();
    if(f.tip)softDisc(ctx,PX(x1),PX(z1),f.w*0.55*PXMM,c,v*0.95,0.7);}
  // vessels
  const vc=[[190,72,78],[184,46,60],[208,28,46],NAVY][m],va=[0.45,0.72,0.96,0.9][m];
  const stroke=(f,w,rgb,a)=>{ctx.strokeStyle=rgbStr(rgb,a);ctx.lineWidth=w;ctx.beginPath();f.pts.forEach((p,i)=>i?ctx.lineTo(PX(p[0]),PX(p[2])):ctx.moveTo(PX(p[0]),PX(p[2])));ctx.stroke();};
  for(const f of of('vessel')){const md=f.pts.reduce((s,p)=>s+p[1],0)/f.pts.length;let vis=clamp(V(m,md)*(blue?1.6:1));if(f.kind==='plexus')vis*=0.1;if(vis<0.01)continue;
    const sharp=Math.exp(-md/0.25),w=Math.max(2.4,f.rad*2*PXMM*1.1);
    if(f.halo)stroke(f,w*2.5,blue?[220,218,255]:[250,244,236],(blue?0.18:m===2?0.36:0.28));
    stroke(f,w*1.9,vc,va*vis*0.22);stroke(f,w,vc,va*vis*(0.35+0.65*sharp));}
  // shiny white structures: polarized only
  if(m===2)for(const f of of('collagen'))for(const p of f.parts){if(f.style==='dense'&&p.d>0.3)continue;const v=clamp(V(2,p.d)*1.1);
    if(f.style==='blotch'&&p.len<0.2){softDisc(ctx,PX(p.x),PX(p.z),p.len*0.28*PXMM,[252,252,250],0.75*v,0.6);continue;}
    const hx=Math.cos(p.ang)*p.len*0.5,hz=Math.sin(p.ang)*p.len*0.5;ctx.strokeStyle=rgbStr([253,253,251],0.88*v);ctx.lineWidth=f.style==='dense'?3:2.4;
    ctx.beginPath();ctx.moveTo(PX(p.x-hx),PX(p.z-hz));ctx.lineTo(PX(p.x+hx),PX(p.z+hz));ctx.stroke();}
  // milia-like cysts
  for(const f of of('milia')){const k=[0.55,1.0,0.38,0.85][m]*clamp(V(m,f.d*0.5)*1.3);const R=Math.max(2.5,f.r*PXMM);const c=blue?[236,236,255]:[252,248,228];
    softDisc(ctx,PX(f.x),PX(f.z),R*2.1,c,0.35*k,0.25);softDisc(ctx,PX(f.x),PX(f.z),R,c,0.95*k,0.7);}
  // comedo-like openings
  for(const f of of('comedo')){const a=[0.72,0.94,0.8,0.9][m];const rng=mulberry32(f.x*997|0);ctx.save();ctx.translate(PX(f.x),PX(f.z));ctx.rotate(rng()*Math.PI);ctx.scale(1,0.72+rng()*0.2);
    softDisc(ctx,0,0,f.r*PXMM,blue?NAVY:[50,32,21],a,0.72);ctx.strokeStyle=rgbStr(blue?[200,196,250]:[168,124,90],0.35);ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(0,0,f.r*PXMM*0.95,0,TAU);ctx.stroke();ctx.restore();}
  // follicles, hairs, white circles
  for(const f of of('follicle')){const x=PX(f.x),y=PX(f.z);
    if(!f.wc){softDisc(ctx,x,y,0.07*PXMM,blue?[206,202,250]:[238,212,198],0.3,0.5);softDisc(ctx,x,y,0.035*PXMM,blue?NAVY:[150,96,84],0.45,0.6);}
    if(f.hair){const cs=Math.cos(f.ang),sn=Math.sin(f.ang);ctx.strokeStyle=rgbStr(blue?NAVY:[56,37,26],0.95);ctx.lineWidth=2.6;ctx.beginPath();ctx.moveTo(x,y);
      ctx.quadraticCurveTo(PX(f.x-cs*f.len*0.5+sn*0.08),PX(f.z-sn*f.len*0.5-cs*0.08),PX(f.x-cs*f.len),PX(f.z-sn*f.len));ctx.stroke();}
    if(f.wc){const a=[0.8,0.88,0.95,0.8][m];ctx.strokeStyle=rgbStr(blue?[232,232,255]:[251,248,241],a);ctx.lineWidth=4.6;ctx.beginPath();ctx.arc(x,y,0.11*PXMM,0,TAU);ctx.stroke();
      softDisc(ctx,x,y,0.055*PXMM,blue?[220,220,255]:[226,194,120],0.92,0.7);}}
  // follicular openings of facial skin: holes, keratin plugs, white halos, rosettes (polarized only)
  for(const f of of('folopen')){const x=PX(f.x),y=PX(f.z),R=f.r*PXMM;
    softDisc(ctx,x,y,R*1.3,blue?[214,210,250]:[238,212,196],0.4,0.45);
    if(f.halo>0.05){ctx.strokeStyle=rgbStr(blue?[236,236,255]:[251,248,241],clamp(0.9*f.halo));ctx.lineWidth=Math.max(2.4,R*0.7);ctx.beginPath();ctx.arc(x,y,R*1.6,0,TAU);ctx.stroke();}
    if(f.plug>0.05)softDisc(ctx,x,y,R*1.0,blue?[226,224,255]:[240,218,156],clamp(0.95*f.plug),0.72);
    else softDisc(ctx,x,y,R*0.45,blue?[150,140,210]:[170,124,104],0.28,0.6);
    if(m===2&&f.ros){const d=R*0.52;ctx.fillStyle='rgba(255,255,255,0.96)';for(let q=0;q<4;q++){const a=Math.PI/4+q*Math.PI/2;ctx.beginPath();ctx.arc(x+Math.cos(a)*d,y+Math.sin(a)*d,Math.max(1.4,R*0.2),0,TAU);ctx.fill();}}}
  // lentigo maligna around follicles: asymmetric rim, projections, circle within a circle, grey dots, rhomboids, obliteration
  for(const f of of('folopen')){if(!f.lm)continue;const l=f.lm,x=PX(f.x),y=PX(f.z),R=Math.max(3.2,f.r*PXMM),a=clamp(l.col||0.8)*(m===0?0.8:1),rg=mulberry32((f.x*7919|0)^(f.z*104729|0));
    const pc=blue?NAVY:[58,37,26],gc=blue?NAVY:[96,92,104],pa=blue?0.9:0.88;
    if(l.obl){softBlob(ctx,x,y,R*2.4,blue?NAVY:[44,29,21],0.62*a,(f.x*97|0)%61,0.85);continue;}
    const poly=(rr2,col,al,w)=>{ctx.strokeStyle=rgbStr(col,al);ctx.lineWidth=w;ctx.beginPath();const n=4+(rg()<0.4?1:0);for(let i=0;i<=n;i++){const an=l.aA+i/n*TAU+(rg()-0.5)*0.35,q=rr2*(0.82+0.36*rg()),px=x+Math.cos(an)*q,py=y+Math.sin(an)*q;i?ctx.lineTo(px,py):ctx.moveTo(px,py);}ctx.closePath();ctx.stroke();};
    if(l.rh)poly(0.19*PXMM,blue?NAVY:[96,84,86],0.62*l.rh*a,Math.max(2.6,R*0.45));
    if(l.redRh)poly(0.16*PXMM,blue?NAVY:[196,52,68],[0.45,0.75,0.92,0.6][m],Math.max(2.4,R*0.42));
    if(l.asym){ctx.strokeStyle=rgbStr(pc,pa*a);ctx.lineWidth=Math.max(2.4,R*0.62);ctx.beginPath();ctx.arc(x,y,R*1.22,l.aA-l.aW/2,l.aA+l.aW/2);ctx.stroke();}
    for(let i=0;i<l.plp;i++){const an=l.aA+(i-(l.plp-1)/2)*1.1+(rg()-0.5)*0.4,r0=R*1.35,len=l.plpL*PXMM*(0.6+0.6*rg()),bend=(rg()-0.5)*0.4;ctx.strokeStyle=rgbStr(blue?NAVY:[78,58,46],0.75*a);ctx.lineWidth=1.3+rg()*0.9;ctx.beginPath();
      ctx.moveTo(x+Math.cos(an)*r0,y+Math.sin(an)*r0);ctx.quadraticCurveTo(x+Math.cos(an+bend)*(r0+len*0.5),y+Math.sin(an+bend)*(r0+len*0.5),x+Math.cos(an+bend*1.5)*(r0+len),y+Math.sin(an+bend*1.5)*(r0+len));ctx.stroke();}
    if(l.cwc){ctx.strokeStyle=rgbStr(pc,0.7*a);ctx.lineWidth=Math.max(1.8,R*0.35);ctx.beginPath();ctx.arc(x,y,R*1.25,0,TAU);ctx.stroke();ctx.strokeStyle=rgbStr(gc,0.85*a);ctx.lineWidth=Math.max(1.6,R*0.3);ctx.beginPath();ctx.arc(x,y,R*0.62,0,TAU);ctx.stroke();}
    {const S=l.agS||1,n=Math.min(S>1?14:8,l.ag);for(let i=0;i<n;i++){const an=l.aA+i/n*TAU+(rg()-0.5)*0.5,q=R*(1.75+rg()*1.1)*(S>1?1.12:1);softDisc(ctx,x+Math.cos(an)*q,y+Math.sin(an)*q,(1.3+rg()*1.1)*S,S>1?(blue?NAVY:[90,86,98]):gc,(S>1?0.9:0.8)*a,0.6);}}
    if(l.tgt){ctx.strokeStyle=rgbStr(pc,0.85);ctx.lineWidth=Math.max(2,R*0.4);ctx.beginPath();ctx.arc(x,y,R*1.3,0,TAU);ctx.stroke();softDisc(ctx,x,y,R*0.5,blue?NAVY:[30,20,16],0.95,0.7);}}
  // scale, blood, ulcer
  for(const f of of('scale')){const a=[0.95,0.4,0.85,0.85][m];const rng=mulberry32(f.x*733|0);ctx.fillStyle=rgbStr(blue?[232,230,255]:[242,235,210],a);ctx.beginPath();
    for(let i=0;i<7;i++){const an=i/7*TAU,q=f.r*PXMM*(0.55+rng()*0.6);const px=PX(f.x)+Math.cos(an)*q,py=PX(f.z)+Math.sin(an)*q*0.75;i?ctx.lineTo(px,py):ctx.moveTo(px,py);}ctx.closePath();ctx.fill();}
  for(const f of of('blood'))softDisc(ctx,PX(f.x),PX(f.z),f.r*PXMM,blue?NAVY:[96,14,22],0.95,0.72);
  for(const f of of('ulcer')){const x=PX(f.x),y=PX(f.z),R=f.r*PXMM;const g=ctx.createRadialGradient(x,y,0,x,y,R*1.15);
    if(blue){g.addColorStop(0,rgbStr(NAVY,0.9));g.addColorStop(1,rgbStr(NAVY,0));}else{g.addColorStop(0,'rgba(112,20,20,0.96)');g.addColorStop(0.55,'rgba(164,58,36,0.95)');g.addColorStop(0.85,'rgba(198,128,64,0.8)');g.addColorStop(1,'rgba(198,128,64,0)');}
    ctx.fillStyle=g;blobPath(ctx,x,y,R*1.15,9,0.3);ctx.fill();
    const rng=mulberry32(4);for(let i=0;i<9;i++){const a=rng()*TAU,q=rng()*R*0.7;softDisc(ctx,x+Math.cos(a)*q,y+Math.sin(a)*q,R*0.14,blue?NAVY:[70,10,12],0.8,0.6);}}}

function addGlare(ctx,L,M){const rng=mulberry32(77);ctx.fillStyle='rgba(255,255,255,0.09)';ctx.fillRect(0,0,TEX,TEX);
  for(let i=0;i<14;i++){const x=rng()*TEX,y=rng()*TEX,r=60+rng()*160;const g=ctx.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,'rgba(255,255,255,0.16)');g.addColorStop(1,'rgba(255,255,255,0)');ctx.fillStyle=g;ctx.fillRect(x-r,y-r,2*r,2*r);}
  for(let i=0;i<9000;i++){const x=rng()*TEX,y=rng()*TEX,k=(y|0)*TEX+(x|0);const w=0.03+Math.pow(GMAP.fur[k],1.5)*1.1+(M.ker[k]*1.3+M.gyr[k]*0.9+M.prl[k]*0.15)/255;if(rng()>w)continue;
    const s=0.6+rng()*2.0;ctx.fillStyle=`rgba(255,255,255,${0.3+rng()*0.6})`;ctx.beginPath();ctx.ellipse(x,y,s*1.8,s*0.9,rng()*Math.PI,0,TAU);ctx.fill();}
  if(L.maxElev>0.2){const g=ctx.createRadialGradient(PX(-0.45),PX(-0.55),0,PX(-0.45),PX(-0.55),PXMM*0.9);g.addColorStop(0,'rgba(255,255,255,0.72)');g.addColorStop(0.35,'rgba(255,255,255,0.28)');g.addColorStop(1,'rgba(255,255,255,0)');ctx.fillStyle=g;ctx.fillRect(0,0,TEX,TEX);}}

function paint(L,M,m){if(L.kind==='nail')return paintNail(L,m);const cv=document.createElement('canvas');cv.width=cv.height=TEX;const ctx=cv.getContext('2d');
  const img=ctx.createImageData(TEX,TEX);compose(img.data,M,m,L);ctx.putImageData(img,0,0);
  drawFeatures(ctx,L,m);if(m===0)addGlare(ctx,L,M);
  const g=ctx.createRadialGradient(TEX/2,TEX/2,TEX*0.3,TEX/2,TEX/2,TEX*0.72);g.addColorStop(0,'rgba(0,0,0,0)');g.addColorStop(1,m===3?'rgba(10,8,40,0.4)':'rgba(20,6,4,0.3)');ctx.fillStyle=g;ctx.fillRect(0,0,TEX,TEX);
  return cv;}

/* chapter 4: a clump of melanin placed at a chosen depth */
function paintProbe(base,d,m){dctx.globalAlpha=1;dctx.drawImage(base,0,0);const v=clamp(V(m,d)*(m===3?1.8:1.9));const c=m===3?NAVY:pigColor(d);
  const R=0.3*PXMM*(1+d*0.9),hard=clamp(0.78-d*0.55,0.12,0.78);softDisc(dctx,PX(PROBE.x),PX(PROBE.z),R,c,0.96*v,hard);topTex.needsUpdate=true;}

/* =====================================================================
   Nail unit: dermoscopic image, 3D block (walls, cut, interior), and
   the colours of each band of tissue. Built from L.nail (see p3e).
   ===================================================================== */
const NPAL=[
  {skin:[218,178,150],plate:[236,176,176],lun:[244,222,218],cut:[240,228,216],hyp:[236,206,188],free:[247,241,228],oc:[206,140,132]},
  {skin:[212,166,138],plate:[232,150,154],lun:[240,206,204],cut:[238,222,210],hyp:[232,196,178],free:[245,238,222],oc:[196,118,118]},
  {skin:[214,160,132],plate:[234,140,150],lun:[242,206,208],cut:[240,226,216],hyp:[236,194,180],free:[247,241,229],oc:[200,100,112]},
  {skin:[150,140,214],plate:[166,152,226],lun:[204,200,246],cut:[198,192,242],hyp:[178,168,232],free:[216,214,250],oc:[140,128,210]}];
const NAVYN=[34,28,82];
function paintNail(L,m){const cv=document.createElement('canvas');cv.width=cv.height=TEX;const c=cv.getContext('2d'),N=L.nail,blue=m===3,P=NPAL[m];
  const img=c.createImageData(TEX,TEX),d=img.data,G=GMAP;
  for(let j=0;j<TEX;j++){const z=-4+(j+0.5)*8/TEX;for(let i=0;i<TEX;i++){const x=-4+(i+0.5)*8/TEX,k=j*TEX+i,o=k*4,g=nailGeo(x,z),mo=G.mott[k];
    // plate over the bed: pink with fine longitudinal ridges
    const ridge=0.985+0.015*Math.sin(z*52+4*vnoise(x*0.3,z*1.5,12));let col=P.plate.map(v=>v*ridge*(0.96+0.08*mo));
    const lw=1-smoothstep(nxL(z)-0.05,nxL(z)+0.09,x);col=mix3(col,P.lun,lw*0.7);
    const groove=Math.exp(-(((g.az-(NU.zP+0.02))/0.06)**2));col=mix3(col,[150,96,90],0.45*groove);
    const ob=Math.exp(-(((x-NU.xH)/0.07)**2));col=mix3(col,P.oc,0.55*ob);
    const fe=smoothstep(NU.xH+0.06,NU.xH+0.2,x);col=mix3(col,P.free,fe*0.95);
    // band background in the plate
    const bp=N.bands.length?nailBandAt(L,x,z):0;if(bp>0){const b=N.bands[0],bc=blue?NAVYN:b.bg;col=mix3(col,bc,clamp(bp*(blue?0.7:0.62))*(1-0.35*fe));}
    // haematoma
    if(N.hema){const h=N.hema,dx=(x-h.x)/h.rx,dz=(z-h.z)/h.rz,rr2=Math.hypot(dx,dz)+0.12*(fbm(x*3,z*3,41,2)-0.5);if(rr2<1.05){const t=clamp(1-smoothstep(0.55,1.02,rr2));const hc=blue?NAVYN:mix3([150,26,46],[46,10,24],clamp(1-rr2));col=mix3(col,hc,0.92*t);}}
    // invasive nodule replacing the plate
    if(N.nodAt){const nd=N.nodAt(x,z);if(nd>0.02){const nc=blue?[170,150,226]:mix3([214,108,112],[236,150,150],fbm(x*4,z*4,51,2));col=mix3(col,nc,nd);}}
    // dystrophy: rough, whitish streaks
    if(N.dystAt){const ds=N.dystAt(x,z);if(ds>0.02){const s=Math.abs(Math.sin(z*26+fbm(x,z*4,5,2)*4));col=mix3(col,blue?[214,212,250]:[236,226,214],ds*0.25*smoothstep(0.85,1,s));}}
    // onycholysis at the free edge in a dystrophic nail
    if(N.dyst>0){const on=smoothstep(2.75+0.25*fbm(z*2,1,9,2),3.0+0.25*fbm(z*2,1,9,2),x)*(1-fe)*(1-g.lat);col=mix3(col,blue?[214,212,250]:[244,234,206],on*0.78);}
    // skin of the folds, cuticle, Hutchinson pigment
    const skinW=g.fold;if(skinW>0.001){let sk=P.skin.map(v=>v*(0.94+0.1*mo));const cr=g.prox>g.lat?Math.abs(Math.sin(x*44+3*fbm(x,z*0.8,7,2))):Math.abs(Math.sin(z*46+3*fbm(x*0.8,z,8,2)));
      sk=sk.map(v=>v*(1-0.07*smoothstep(0.9,1,cr)));const hp=nailHutAt(L,x,z);if(hp>0)sk=mix3(sk,blue?NAVYN:mix3([96,58,36],[30,20,16],fbm(x*5,z*5,61,2)),hp*0.92);col=mix3(col,sk,skinW);}
    const sh=Math.exp(-(((x-nxC(z)-0.015)/0.025)**2))*(1-g.lat);col=mix3(col,[120,80,74],0.35*sh);
    const cw=smoothstep(nxC(z),nxC(z)+0.02,x)*(1-smoothstep(nxC(z)+0.07,nxC(z)+0.15+0.06*vnoise(z*3,2,4),x))*(1-g.lat);if(cw>0)col=mix3(col,P.cut,cw*0.7);
    const gr=G.grain[k]*6;d[o]=col[0]+gr;d[o+1]=col[1]+gr;d[o+2]=col[2]+gr;d[o+3]=255;}}
  c.putImageData(img,0,0);
  // visible plate: from the cuticle to the free edge, between the lateral folds
  const clipPlate=()=>{c.beginPath();for(let q=0;q<=40;q++){const z=-NU.zP+0.12+q/40*(2*NU.zP-0.24);const x=nxC(z)+0.02;q?c.lineTo(PX(x),PX(z)):c.moveTo(PX(x),PX(z));}c.lineTo(PX(4.1),PX(NU.zP-0.12));c.lineTo(PX(4.1),PX(-NU.zP+0.12));c.closePath();c.save();c.clip();};
  c.lineCap='round';c.lineJoin='round';
  for(const b of N.bands){const ba=b.a*(blue?1.1:1);clipPlate();
    c.lineCap='butt';
    for(const l of b.lines){const lw=Math.max(1.3,l.w*nailBandW(b,0)/b.n*PXMM*0.62),col=blue?NAVYN:l.c,reg=l.gap<0&&l.seg===0&&l.drift===0;
      const pts=[];for(let x=Math.max(b.x0,NU.xC-0.4);x<=4.05;x+=0.04){let on=true;if(l.gap>=0){const g0=-1+l.gap*4;if(x>g0&&x<g0+0.25+l.seg*0.6)on=false;}
        const w=nailBandW(b,x),zz=b.z+(l.u-0.5)*w*(1+l.drift*(x-NU.xC))+l.wob*Math.sin(x*2.2+l.ph)+l.wob*0.4*Math.sin(x*9+l.ph*2);if(N.nodAt&&N.nodAt(x,zz)>0.3)on=false;pts.push([x,zz,on]);}
      const run=(w,a)=>{c.lineWidth=w;let pen=false,k0=0;for(let q=0;q<pts.length;q++){const p=pts[q];if(!p[2]){if(pen){c.stroke();pen=false;}continue;}
          if(!pen){c.beginPath();c.moveTo(PX(p[0]),PX(p[1]));pen=true;k0=q;}else c.lineTo(PX(p[0]),PX(p[1]));
          if(!reg&&q-k0>=10){c.stroke();const v=0.7+0.6*vnoise(p[0]*1.3+l.ph,l.u*7,3);c.strokeStyle=rgbStr(col,clamp(a*v));c.beginPath();c.moveTo(PX(p[0]),PX(p[1]));k0=q;}}if(pen)c.stroke();};
      c.strokeStyle=rgbStr(col,clamp(l.a*ba*0.3));run(lw*1.7,l.a*ba*0.3);c.strokeStyle=rgbStr(col,clamp(l.a*ba));run(lw*0.8,l.a*ba);}
    const rg=mulberry32(b.seed+3);
    if(b.gran>0)for(let q=0;q<b.gran*170;q++){const x=lerp(NU.xC,NU.xH,rg()),w=nailBandW(b,x),zz=b.z+(rg()-0.5)*w*0.9;softDisc(c,PX(x),PX(zz),1.1+rg()*1.3,blue?NAVYN:(rg()<0.5?NC.black:NC.dark),0.9,0.7);}
    if(b.dots>0)for(let q=0;q<b.dots*40;q++){const x=lerp(NU.xC+0.1,NU.xH-0.2,rg()),w=nailBandW(b,x),zz=b.z+(rg()-0.5)*w*0.8;softDisc(c,PX(x),PX(zz),2.6+rg()*2.4,blue?NAVYN:(rg()<0.5?NC.dark:NC.brown),0.85,0.7);}
    if(b.blood>0)for(let q=0;q<b.blood;q++){const x=lerp(0,NU.xH-0.3,rg()),zz=b.z+(rg()-0.5)*nailBandW(b,x)*0.8;softDisc(c,PX(x),PX(zz),3+rg()*4,blue?NAVYN:[112,18,40],0.9,0.75);softDisc(c,PX(x),PX(zz),2,blue?NAVYN:[70,8,22],0.8,0.7);}
    c.restore();
    // pigment seen through a transparent cuticle (pseudo-Hutchinson)
    if(N.pseudo){c.save();for(let q=0;q<26;q++){const zz=b.z+(q/25-0.5)*b.w0*0.85,x0=nxC(zz)-0.02;c.strokeStyle=rgbStr(blue?NAVYN:b.bg,0.45);c.lineWidth=b.w0/26*PXMM*1.1;c.beginPath();c.moveTo(PX(x0),PX(zz));c.lineTo(PX(x0+0.13),PX(zz));c.stroke();}c.restore();}}
  // micro-Hutchinson: pigment on the cuticle
  if(N.hut&&N.hut.micro){const h=N.hut,rg=mulberry32(77);for(let q=0;q<70;q++){const zz=h.z+(rg()-0.5)*(N.bands[0]?N.bands[0].w0+0.5:1.4),x=nxC(zz)+0.01+rg()*0.13;softDisc(c,PX(x),PX(zz),1.4+rg()*2.2,blue?NAVYN:(rg()<0.5?[70,42,26]:[40,26,18]),0.75,0.6);}}
  // haematoma: globules at the rim, streaks toward the free edge
  if(N.hema){const h=N.hema,rg=mulberry32(91);for(let q=0;q<30;q++){const a=rg()*TAU,rr2=1+0.1*rg();const x=h.x+Math.cos(a)*h.rx*rr2,zz=h.z+Math.sin(a)*h.rz*rr2;softDisc(c,PX(x),PX(zz),3+rg()*5,blue?NAVYN:[118,20,44],0.85,0.7);}
    for(let q=0;q<9;q++){const zz=h.z+(rg()-0.5)*h.rz*1.4,x0=h.x+h.rx*0.6;const g=c.createLinearGradient(PX(x0),0,PX(x0+1.3),0);g.addColorStop(0,rgbStr(blue?NAVYN:[130,30,52],0.7));g.addColorStop(1,rgbStr(blue?NAVYN:[150,60,70],0));
      c.strokeStyle=g;c.lineWidth=2+rg()*3;c.beginPath();c.moveTo(PX(x0),PX(zz));c.lineTo(PX(x0+1.3),PX(zz+(rg()-0.5)*0.1));c.stroke();}}
  // dystrophy: longitudinal split along the band
  if(N.split){const s=N.split;c.strokeStyle=rgbStr(blue?NAVYN:[30,20,18],0.85);c.lineWidth=2.4;c.beginPath();for(let x=-1.4;x<=4;x+=0.05){const zz=s.z+0.03*Math.sin(x*5+s.ph);x>-1.39?c.lineTo(PX(x),PX(zz)):c.moveTo(PX(x),PX(zz));}c.stroke();
    c.strokeStyle=rgbStr(blue?[226,226,255]:[250,244,232],0.55);c.lineWidth=1.4;c.beginPath();for(let x=-1.4;x<=4;x+=0.05){const zz=s.z+0.03*Math.sin(x*5+s.ph)+0.025;x>-1.39?c.lineTo(PX(x),PX(zz)):c.moveTo(PX(x),PX(zz));}c.stroke();}
  // invasive nodule: milky-red, polymorphous vessels, crust, remnants of pigment
  if(N.nod){const n=N.nod,rg=mulberry32(55);softBlob(c,PX(n.x),PX(n.z),n.r*PXMM*0.85,blue?[200,196,250]:[244,186,190],0.55,7,0.8);
    for(let q=0;q<70;q++){const a=rg()*TAU,qq=Math.sqrt(rg())*n.r*0.85,x=n.x+Math.cos(a)*qq,zz=n.z+Math.sin(a)*qq;if(N.nodAt(x,zz)<0.5)continue;
      if(q%3===0){c.strokeStyle=rgbStr(blue?NAVYN:[190,30,50],0.85);c.lineWidth=2.2;c.beginPath();c.moveTo(PX(x),PX(zz));c.quadraticCurveTo(PX(x+(rg()-0.5)*0.2),PX(zz+(rg()-0.5)*0.2),PX(x+(rg()-0.5)*0.3),PX(zz+(rg()-0.5)*0.3));c.stroke();}
      else softDisc(c,PX(x),PX(zz),2+rg()*1.5,blue?NAVYN:[196,34,56],0.85,0.7);}
    const ux=n.x+0.15,uz=n.z-0.15,ug=c.createRadialGradient(PX(ux),PX(uz),0,PX(ux),PX(uz),0.42*PXMM);ug.addColorStop(0,blue?rgbStr(NAVYN,0.9):'rgba(92,18,16,0.95)');ug.addColorStop(0.6,blue?rgbStr(NAVYN,0.7):'rgba(150,56,34,0.9)');ug.addColorStop(1,'rgba(150,56,34,0)');
    c.fillStyle=ug;blobPath(c,PX(ux),PX(uz),0.42*PXMM,11,0.3);c.fill();
    for(let q=0;q<26;q++){const a=Math.PI*(0.6+0.8*rg()),x=n.x+Math.cos(a)*n.r*(0.75+0.2*rg()),zz=n.z+Math.sin(a)*n.r*(0.75+0.2*rg());softDisc(c,PX(x),PX(zz),2+rg()*3,blue?NAVYN:NC.black,0.85,0.7);}}
  // dry contact: specular shine on the convex plate
  if(m===0){const rg=mulberry32(5);c.globalCompositeOperation='screen';for(let q=0;q<3;q++){const zz=-1.6+q*1.2+(rg()-0.5)*0.4;const g=c.createLinearGradient(0,PX(zz-0.25),0,PX(zz+0.25));g.addColorStop(0,'rgba(255,255,255,0)');g.addColorStop(0.5,'rgba(255,255,255,0.28)');g.addColorStop(1,'rgba(255,255,255,0)');c.fillStyle=g;c.fillRect(PX(nxC(zz)+0.1),PX(zz-0.25),PX(3.4)-PX(nxC(zz)+0.1),0.5*PXMM);}
    c.globalCompositeOperation='source-over';for(let q=0;q<1400;q++){const x=-1.8+rg()*5.6,zz=(rg()-0.5)*6;softDisc(c,PX(x),PX(zz),0.6+rg()*1.4,[255,255,255],0.35+rg()*0.4,0.6);}}
  const vg=c.createRadialGradient(TEX/2,TEX/2,TEX*0.3,TEX/2,TEX/2,TEX*0.72);vg.addColorStop(0,'rgba(0,0,0,0)');vg.addColorStop(1,m===3?'rgba(10,8,40,0.4)':'rgba(20,6,4,0.28)');c.fillStyle=vg;c.fillRect(0,0,TEX,TEX);
  return cv;}

/* ---------------- colours of the bands of tissue (walls, section) ---------------- */
function nailSlotRGB(L,slot,x,z,t){const N=L.nail;
  if(slot==='skin'){let c=mix3([238,206,186],[212,158,138],t);const h=nailHutAt(L,x,z);if(h>0)c=mix3(c,[54,34,24],h*0.9);return c;}
  if(slot==='fderm')return mix3([240,202,198],[222,170,170],t);
  if(slot==='epon')return[236,204,190];
  if(slot==='plate'){let c=mix3([250,238,228],[240,222,212],t);const bp=N.bands.length?nailBandAt(L,x,z):0;
    if(bp>0){const w=N.origin==='proximal'?1-smoothstep(0.3,0.65,t):N.origin==='both'?1:smoothstep(0.32,0.72,t);c=mix3(c,N.bands[0].bg,bp*w*0.95);}
    if(N.hema){const h=N.hema,r=Math.hypot((x-h.x)/h.rx,(z-h.z)/h.rz);if(r<1)c=mix3(c,[110,16,34],(1-smoothstep(0.7,1,r))*smoothstep(0.55,0.85,t));}
    return c;}
  if(slot==='epith'){const g=nailGeo(x,z);let c=mix3([226,150,152],[240,214,204],g.mat);c=mix3(c,[236,198,180],g.hyp);const m=N.les?nailLesAt(L,x,z):0;
    if(m>0){const k=N.les.kind,lc=k==='act'?[150,124,116]:k==='nev'?[110,70,44]:[50,32,24];c=mix3(c,lc,m*(k==='act'?0.55:0.85)*N.les.a);}
    if(N.nodAt){const nd=N.nodAt(x,z);if(nd>0)c=mix3(c,[200,120,130],nd*0.8);}return c;}
  if(slot==='derm'){let c=mix3([228,168,168],[208,146,150],t);if(N.les&&N.les.inv>0){const m=nailLesAt(L,x,z)+(N.nodAt?N.nodAt(x,z):0);if(m>0)c=mix3(c,[86,66,96],clamp(m)*N.les.inv*(1-smoothstep(0.25,0.85,t))*0.85);}return c;}
  const s=vnoise(x*9,z*9+t*5,33);return mix3(mix3([242,230,204],[226,210,178],t),[214,170,150],smoothstep(0.62,0.85,s)*0.6);}
const NROWS={skin:1,fderm:2,epon:1,plate:4,epith:2,derm:4,bone:3};
function nailStrip(ax,az,bx,bz,N){const cols=[];for(let i=0;i<=N;i++){const t=i/N,x=lerp(ax,bx,t),z=lerp(az,bz,t),yT=L.elevAt(x,z),c=nailCol(L,x,z).d;cols.push({x,z,b:c.map(dd=>yT-D2S(dd))});}
  const out={},cc=new THREE.Color();
  NSLOTS.forEach((S,li)=>{const R=NROWS[S.k],nv=(N+1)*(R+1),pos=new Float32Array(nv*3),col=new Float32Array(nv*3),idx=[];
    for(let i=0;i<=N;i++){const C=cols[i],y0=C.b[li],y1=C.b[li+1];
      for(let r=0;r<=R;r++){const t=r/R,v=i*(R+1)+r;pos[v*3]=C.x;pos[v*3+1]=lerp(y0,y1,t);pos[v*3+2]=C.z;const rgb=nailSlotRGB(L,S.k,C.x,C.z,t),nz=(vnoise(C.x*5+C.z*5+li*3,t*3,17)-0.5)*10;
        setC(cc,[rgb[0]+nz,rgb[1]+nz,rgb[2]+nz]);col[v*3]=cc.r;col[v*3+1]=cc.g;col[v*3+2]=cc.b;}}
    for(let i=0;i<N;i++)for(let r=0;r<R;r++){const a=i*(R+1)+r,b=(i+1)*(R+1)+r;idx.push(a,b,a+1,b,b+1,a+1);}
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(pos,3));g.setAttribute('color',new THREE.BufferAttribute(col,3));g.setIndex(idx);g.computeVertexNormals();track(g);
    const lp=new Float32Array(N*6);for(let i=0;i<N;i++)lp.set([cols[i].x,cols[i].b[li],cols[i].z,cols[i+1].x,cols[i+1].b[li],cols[i+1].z],i*6);
    const lg=new THREE.BufferGeometry();lg.setAttribute('position',new THREE.BufferAttribute(lp,3));track(lg);out[S.k]={g,lg};});
  return out;}
const cutMatN=(()=>{const m=cutMat.clone();m.opacity=0.86;m.clippingPlanes=[peelPlane];return m;})();
function nailCut(zc){const s=nailStrip(-3.999,zc-0.002,3.999,zc-0.002,320);
  for(const S of NSLOTS){const m=new THREE.Mesh(s[S.k].g,S.k==='bone'||S.k==='derm'?cutMatN:cutMat);m.renderOrder=2;LG[S.g].add(m);cutMeshes.push(m);const ln=new THREE.LineSegments(s[S.k].lg,cutLineMat);LG[S.g].add(ln);cutMeshes.push(ln);}}
function buildNailTissue(){clearTissue();cutMeshes=[];
  LG.sc.add(new THREE.Mesh(gridSurface(230,(x,z)=>L.elevAt(x,z)),topMat));
  const em=stdMat({vertexColors:true,roughness:0.6,side:THREE.DoubleSide},'matrix');
  LG.epi.add(new THREE.Mesh(gridSurface(150,(x,z)=>L.elevAt(x,z)-D2S(nailCol(L,x,z).d[4]),(x,z)=>nailSlotRGB(L,'epith',x,z,0)),em));
  const bm=stdMat({color:'#EADBB8',roughness:0.85,side:THREE.DoubleSide},'bone');LG.sub.add(new THREE.Mesh(gridSurface(60,(x,z)=>L.elevAt(x,z)-D2S(nailCol(L,x,z).d[6])),bm));
  const wm={};for(const S of NSLOTS)if(!wm[S.g]){wm[S.g]=stdMat({vertexColors:true,roughness:0.88,side:THREE.DoubleSide});layerMats[S.g].push(wm[S.g]);}
  for(const e of[[-4,-4,4,-4],[4,-4,4,4],[4,4,-4,4],[-4,4,-4,-4]]){const s=nailStrip(e[0],e[1],e[2],e[3],220);for(const S of NSLOTS){LG[S.g].add(new THREE.Mesh(s[S.k].g,wm[S.g]));LG[S.g].add(new THREE.LineSegments(s[S.k].lg,wallLineMat));}}
  buildNail3D();if(cutZ!=null)buildCut(cutZ);}
/* 3D contents: melanocytes in the matrix, periungual spread, invasion, haematoma, bed capillaries */
function buildNail3D(){const N=L.nail,rng=mulberry32(L.seed*3+1),col=(x,z)=>nailCol(L,x,z).d;
  const at=(x,z,f)=>{const d=col(x,z);return Y(x,z,lerp(d[4],d[5],f));};
  if(N.les){const m=N.les,n=Math.round((m.kind==='act'?0:m.kind==='nev'?60:90)*m.a*(0.5+m.w*0.35));
    for(let i=0;i<n;i++){const x=lerp(m.x0,m.x1,rng()),z=m.z+(rng()-0.5)*m.w*0.95;if(nailLesAt(L,x,z)<0.4)continue;const s=m.kind==='nev'?rr(rng,0.05,0.08):rr(rng,0.025,0.06);
      addInst('epi','matrix',m.kind==='nev'?'#6A4126':(rng()<0.5?'#2B1A12':'#4A2C1B'),SPH_LO,M4(x,at(x,z,m.kind==='nev'?0.75:0.55+0.4*rng()),z,s,s*0.8,s));}
    if(m.inv>0){const k=Math.round(80*m.inv);for(let i=0;i<k;i++){const x=lerp(m.x0,N.nod?N.nod.x+0.6:m.x1,rng()),z=m.z+(rng()-0.5)*Math.min(m.w,3)*0.8,d=col(x,z),dd=lerp(d[5]+0.05,d[5]+(N.nod?1.4:0.35),rng());
      const s=rr(rng,0.06,0.12);addInst('ret','nodN',rng()<0.5?'#3B3048':'#2C2436',SPH_LO,M4(x,Y(x,z,dd),z,s,s*0.8,s),{rough:0.6});}}}
  if(N.hut){const h=N.hut;for(let i=0;i<70;i++){const z=h.z+(rng()-0.5)*h.w,x=nxC(z)-rng()*Math.max(0.1,h.dl)+(rng()<h.hypo*0.4?NU.xH+0.2-nxC(z)+rng()*0.4:0);if(nailHutAt(L,x,z)<0.3)continue;
    addInst('sc','hutch','#2E1D14',SPH_LO,M4(x,Y(x,z,0.06),z,0.03,0.03,0.03));}}
  if(N.hema){const h=N.hema,d=col(h.x,h.z);addInst('sc','hema','#5A0A1E',SPH,M4(h.x,Y(h.x,h.z,d[4]-0.06),h.z,h.rx*0.92,0.08,h.rz*0.92),{rough:0.4});}
  if(N.nod){const n=N.nod;for(let i=0;i<14;i++){const a=rng()*TAU,q=Math.sqrt(rng())*n.r*0.7,x=n.x+Math.cos(a)*q,z=n.z+Math.sin(a)*q,s=rr(rng,0.2,0.36);addInst('ret','nodN','#B57C8C',SPH_LO,M4(x,Y(x,z,0.45),z,s,s*0.75,s),{rough:0.7});}}
  flushInst();
  const vm=stdMat({color:'#C3222F',roughness:0.4,emissive:'#3a0508'},'bedv');
  for(let zz=-2.6;zz<=2.61;zz+=0.36){const pts=[];for(let x=nxL(zz)+0.1;x<=3.3;x+=0.35){const d=col(x,zz);pts.push([x,d[5]+0.06,zz+0.03*Math.sin(x*3+zz*7)]);}if(pts.length>2)tube(pts,0.016,null,'bedv','ret',{mat:vm});}}

/* =====================================================================
   Photon transport. A simplified Monte Carlo random walk in real
   millimetres: wavelength-dependent reduced scattering, absorption by
   epidermal melanin, blood and the lesion's own pigment and vessels,
   loss of polarization with each scattering event, and a crossed
   analyzer in polarized mode. Paths are mapped into the stretched scene.
   ===================================================================== */
const PH={on:false,list:[],max:230,rate:26,acc:0,lambda:null,follow:true,followT:0,stats:null,zBand:null,onStory:null,visible:false};
function resetStats(){PH.stats={glare:0,sc:0,epi:0,pap:0,ret:0,blocked:0,absorbed:0,reflected:0,lost:0,det:0,n:0,depths:[]};}
resetStats();
const WHITE_L=[450,490,530,575,620,660];
const pickLam=m=>PH.lambda?PH.lambda:m===3?405:WHITE_L[(Math.random()*WHITE_L.length)|0];
function headCfg(m){const contact=(m===1||m===3);const base=(L?L.maxElev:0)+(contact?0:0.95);
  return{contact,devY:base,ledY:base+1.36,ledR:2.74,lensY:base+1.72,anaY:base+1.5,lensR:1.3,analyzer:m===2,specP:m===0?0.45:m===2?0.45:0.22};}

/* coarse depth grid for fast lookups */
let DG=null;const DGN=161;
function buildDGrid(){DG={sc:new Float32Array(DGN*DGN),dej:new Float32Array(DGN*DGN),pap:new Float32Array(DGN*DGN),pig:new Float32Array(DGN*DGN)};
  for(let j=0;j<DGN;j++)for(let i=0;i<DGN;i++){const x=-4+i*8/(DGN-1),z=-4+j*8/(DGN-1),D=L.depths(x,z),k=j*DGN+i;DG.sc[k]=D.sc;DG.dej[k]=D.dej;DG.pap[k]=D.pap;DG.pig[k]=D.pigA;}}
const dq=(x,z)=>{const i=Math.max(0,Math.min(DGN-1,Math.round((x+4)*(DGN-1)/8))),j=Math.max(0,Math.min(DGN-1,Math.round((z+4)*(DGN-1)/8)));return j*DGN+i;};

/* absorbing structures of the current lesion, binned on a 0.5 mm grid */
let ABS=null,BIRE=[];
function buildAbsorbers(){const list=[];
  for(const f of L.features){
    if(f.t==='nest')list.push({x:f.x,d:f.d,z:f.z,r:f.r*1.25,kind:'mel',k:f.bcc?0.5:1,name:f.bcc?'melanin in a tumour nest':'melanin in a nest of melanocytes'});
    else if(f.t==='cloud'&&f.parts)for(const p of f.parts)list.push({x:p.x,d:p.d,z:p.z,r:p.s*2.2,kind:'mel',k:f.sid==='dermal'?0.12:1,name:f.sid==='dermal'?'melanin in a nevus cell':'dermal melanin'});
    else if(f.t==='tumor'&&f.pig)list.push({x:f.x,d:f.d,z:f.z,r:f.r,kind:'mel',k:0.35,name:'melanin in a tumour nest'});
    else if(f.t==='streak')for(let k=0;k<5;k++){const t=k/4;list.push({x:f.x+Math.cos(f.ang)*f.len*t,d:f.d,z:f.z+Math.sin(f.ang)*f.len*t,r:f.w*0.6,kind:'mel',k:1,name:'melanin in a streak'});}
    else if(f.t==='vessel')for(const p of f.pts)list.push({x:p[0],d:p[1],z:p[2],r:Math.max(0.022,f.rad*1.7),kind:'hb',k:1,name:'haemoglobin in a vessel'});
    else if(f.t==='blood')list.push({x:f.x,d:0.03,z:f.z,r:f.r,kind:'hb',k:1,name:'haemoglobin in a blood spot'});}
  if(PROBE_ON)list.push({x:PROBE.x,d:probeD,z:PROBE.z,r:0.25,kind:'mel',k:1,name:'the melanin clump'});
  const G=[];for(let i=0;i<256;i++)G.push([]);
  for(const a of list){const i0=Math.floor((a.x-a.r+4)*2),i1=Math.floor((a.x+a.r+4)*2),j0=Math.floor((a.z-a.r+4)*2),j1=Math.floor((a.z+a.r+4)*2);
    for(let j=Math.max(0,j0);j<=Math.min(15,j1);j++)for(let i=Math.max(0,i0);i<=Math.min(15,i1);i++)G[j*16+i].push(a);}
  ABS=G;BIRE=L.features.filter(f=>f.t==='collagen'||f.t==='scar').map(f=>({x:f.x,z:f.z,r:f.r,d0:f.d0??0.1,d1:f.d1??0.35}));}
function absAt(x,d,z){const i=Math.floor((x+4)*2),j=Math.floor((z+4)*2);if(i<0||j<0||i>15||j>15)return null;
  for(const a of ABS[j*16+i]){const dx=x-a.x,dz=z-a.z,dd=(d-a.d)*0.8;if(dx*dx+dz*dz+dd*dd<a.r*a.r)return a;}return null;}
function bire(x,d,z){for(const b of BIRE){if(d>=b.d0&&d<=b.d1&&(x-b.x)**2+(z-b.z)**2<b.r*b.r)return true;}return false;}

const LAYER_KEYS_SIM=['sc','epi','pap','ret','ret'];
function simPhoton(m,lam,zBand){const H=headCfg(m),rnd=Math.random;
  const pts=[],pol=[],P0=H.analyzer?1:0;
  const res={pts,pol,col:lamRGB(lam),lam,outcome:'',maxD:0,layer:'sc',nScat:0,glare:false,absName:'',pExit:P0};
  const phi=zBand?Math.PI*(1+rnd()):rnd()*TAU,lx=Math.cos(phi)*H.ledR,lz=Math.sin(phi)*H.ledR,ly=H.ledY;
  let ex,ez;do{ex=(rnd()*2-1)*2.3;ez=zBand?lerp(zBand[0],zBand[1],rnd()):(rnd()*2-1)*2.3;}while(ex*ex+ez*ez>2.3*2.3);
  const ey=L.elevAt(ex,ez);pts.push(lx,ly,lz,ex,ey,ez);pol.push(P0,P0);
  let vx=ex-lx,vy=ey-ly,vz=ez-lz;const vl=Math.hypot(vx,vy,vz);vx/=vl;vy/=vl;vz/=vl;
  const toLens=(p,tx,tz)=>{if(H.analyzer){if(rnd()<0.5*(1-p)){pts.push(tx,H.anaY,tz,tx*0.25,H.lensY+1.15,tz*0.25);pol.push(p,0);return'detected';}pts.push(tx,H.anaY,tz);pol.push(p);return'blocked';}
    pts.push(tx,H.lensY,tz,tx*0.25,H.lensY+1.15,tz*0.25);pol.push(0,0);return'detected';};
  const lensPt=()=>{const a=rnd()*TAU,q=Math.sqrt(rnd())*H.lensR;let tx=Math.cos(a)*q,tz=Math.sin(a)*q;if(zBand)tz=-Math.abs(tz)*0.5;return[tx,tz];};
  if(rnd()<H.specP){res.glare=true;
    if(H.contact){const t=(H.ledY-ey)/(-vy);pts.push(ex+vx*t,H.ledY,ez+vz*t);pol.push(P0);res.outcome='reflected';}
    else if(rnd()<0.72){const[tx,tz]=lensPt();res.outcome=toLens(1,tx,tz);}
    else{const a=rnd()*TAU;pts.push(ex+Math.cos(a)*2.6,ey+1.7,ez+Math.sin(a)*1.0);pol.push(P0);res.outcome='reflected';}
    tally(res);return res;}
  let dx=vx*0.62,dd=-vy,dz=vz*0.62,nn=Math.hypot(dx,dd,dz);dx/=nn;dd/=nn;dz/=nn;
  let x=ex,d=0,z=ez,p=P0,maxD=0,maxL=0,out='lost';
  const mus0=musp(lam),mel=melA(lam),hbA=hb(lam);
  const put=(x1,d1,z1,pp)=>{pts.push(x1,L.elevAt(x1,z1)-D2S(d1),z1);pol.push(pp);};
  const seg=(x0,d0,z0,x1,d1,z1,pp)=>{const n=Math.max(1,Math.ceil(Math.hypot(x1-x0,d1-d0,z1-z0)/0.06));for(let k=1;k<=n;k++){const t=k/n;put(lerp(x0,x1,t),lerp(d0,d1,t),lerp(z0,z1,t),pp);}};
  for(let step=0;step<140;step++){const q=dq(x,z),sc=DG.sc[q],dej=DG.dej[q],pap=DG.pap[q];
    const lay=d<sc?0:d<dej?1:d<pap?2:d<2.4?3:4;
    const muS=mus0*[2.6,1.5,1.0,0.9,0.35][lay];let s=-Math.log(1-rnd())/muS;if(s>0.8)s=0.8;
    const muA=lay===0?0.15:lay===1?51.9*mel*(0.012+0.07*DG.pig[q])*(d>dej-0.035?1:0.25):lay===2?0.012*hbA+0.03:lay===3?0.005*hbA+0.02:0.002*hbA+0.05;
    const nx=x+dx*s,nd=d+dd*s,nz=z+dz*s;
    if(nd<0){const t=d/(d-nd),x1=x+dx*s*t,z1=z+dz*s*t;seg(x,d,z,x1,0,z1,p);x=x1;z=z1;d=0;out='exit';break;}
    if(rnd()<1-Math.exp(-muA*s)){const t=rnd(),x1=x+dx*s*t,d1=d+dd*s*t,z1=z+dz*s*t;seg(x,d,z,x1,d1,z1,p);x=x1;d=d1;z=z1;out='absorbed';
      res.absName=lay===1?'melanin in the basal layer':lay===0?'keratin':'haemoglobin in dermal blood';break;}
    const hit=absAt((x+nx)/2,(d+nd)/2,(z+nz)/2)||absAt(nx,nd,nz);
    if(hit){const mu=hit.kind==='hb'?hbA*hit.k:30*mel*hit.k;if(rnd()<1-Math.exp(-mu*s*0.6)){const t=0.4+rnd()*0.6,x1=x+dx*s*t,d1=d+dd*s*t,z1=z+dz*s*t;seg(x,d,z,x1,d1,z1,p);x=x1;d=d1;z=z1;out='absorbed';res.absName=hit.name;break;}}
    seg(x,d,z,nx,nd,nz,p);x=nx;d=nd;z=nz;
    if(d>maxD){maxD=d;maxL=d<sc?0:d<dej?1:d<pap?2:3;}
    if(d>4.0){out='deep';break;}
    if(Math.abs(x)>3.92||Math.abs(z)>3.92){out='side';break;}
    res.nScat++;p*=bire(x,d,z)?0.2:0.72;
    const u=2*rnd()-1,a=rnd()*TAU,sq=Math.sqrt(1-u*u);dx=sq*Math.cos(a);dz=sq*Math.sin(a);dd=u;}
  res.maxD=maxD;res.layer=LAYER_KEYS_SIM[maxL];res.pExit=p;
  if(out==='exit'){if(Math.hypot(x,z)<3.0){const[tx,tz]=lensPt();res.outcome=toLens(p,tx,tz);}else{pts.push(x*1.07,L.elevAt(x,z)+0.8,z*1.07);pol.push(p);res.outcome='lost';}}
  else if(out==='absorbed')res.outcome='absorbed';else res.outcome='lost';
  tally(res);return res;}
function tally(r){const S=PH.stats;S.n++;
  if(r.outcome==='detected'){S.det++;if(r.glare)S.glare++;else{S[r.layer]++;S.depths.push(r.maxD);if(S.depths.length>5000)S.depths.splice(0,1000);}}
  else if(r.outcome==='blocked')S.blocked++;else if(r.outcome==='absorbed')S.absorbed++;else if(r.outcome==='reflected')S.reflected++;else S.lost++;}
function warmStats(m,n=1800){resetStats();for(let i=0;i<n;i++)simPhoton(m,pickLam(m),PH.zBand);}
function percentile(arr,q){if(!arr.length)return 0;const a=arr.slice().sort((x,y)=>x-y);return a[Math.min(a.length-1,Math.floor(q*a.length))];}

/* ---------- rendering ---------- */
const SEGMAX=30000,SPEED=3.1,TRAIL=2.4;
const tPos=new Float32Array(SEGMAX*6),tCol=new Float32Array(SEGMAX*6);
const trailGeo=new THREE.BufferGeometry();
trailGeo.setAttribute('position',new THREE.BufferAttribute(tPos,3).setUsage(THREE.DynamicDrawUsage));
trailGeo.setAttribute('color',new THREE.BufferAttribute(tCol,3).setUsage(THREE.DynamicDrawUsage));
const trails=new THREE.LineSegments(trailGeo,new THREE.LineBasicMaterial({vertexColors:true,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false,depthTest:false}));
trails.frustumCulled=false;trails.renderOrder=30;scene.add(trails);
const HMAX=400;
const hPos=new Float32Array(HMAX*3),hCol=new Float32Array(HMAX*3),hPol=new Float32Array(HMAX),hSize=new Float32Array(HMAX),hA=new Float32Array(HMAX),hKind=new Float32Array(HMAX);
const headGeo=new THREE.BufferGeometry();
[['position',hPos,3],['aColor',hCol,3],['aPol',hPol,1],['aSize',hSize,1],['aA',hA,1],['aKind',hKind,1]].forEach(([n,a,s])=>headGeo.setAttribute(n,new THREE.BufferAttribute(a,s).setUsage(THREE.DynamicDrawUsage)));
const headMat=new THREE.ShaderMaterial({transparent:true,depthWrite:false,depthTest:false,blending:THREE.AdditiveBlending,uniforms:{uScale:{value:300}},
  vertexShader:`attribute vec3 aColor;attribute float aPol;attribute float aSize;attribute float aA;attribute float aKind;uniform float uScale;
    varying vec3 vC;varying float vP;varying float vA;varying float vK;
    void main(){vC=aColor;vP=aPol;vA=aA;vK=aKind;vec4 mv=modelViewMatrix*vec4(position,1.0);gl_PointSize=max(2.0,aSize*uScale/-mv.z);gl_Position=projectionMatrix*mv;}`,
  fragmentShader:`varying vec3 vC;varying float vP;varying float vA;varying float vK;
    void main(){vec2 p=gl_PointCoord*2.0-1.0;float r=length(p);if(r>1.0)discard;float a;
      if(vK>0.5){a=smoothstep(0.55,0.78,r)*(1.0-smoothstep(0.84,1.0,r));}
      else{float disc=1.0-smoothstep(0.0,1.0,r);disc*=disc;float bar=(1.0-smoothstep(0.1,0.28,abs(p.y)))*(1.0-smoothstep(0.7,1.0,abs(p.x)));float core=1.0-smoothstep(0.0,0.3,r);a=mix(disc,max(bar,core),vP);}
      a*=vA;gl_FragColor=vec4(vC*a,a);}`});
const heads=new THREE.Points(headGeo,headMat);heads.frustumCulled=false;heads.renderOrder=31;scene.add(heads);
const flashes=[];
function flash(x,y,z,col,size){if(flashes.length<120)flashes.push({x,y,z,col,size,t:0});}
const ABS_COL={mel:[0.9,0.55,0.25],hb:[1,0.3,0.36]};
function spawnPhoton(){const m=state.mode,lam=pickLam(m);const r=simPhoton(m,lam,PH.zBand);const n=r.pts.length/3;const cum=new Float32Array(n);
  for(let i=1;i<n;i++){const a=(i-1)*3,b=i*3;cum[i]=cum[i-1]+Math.hypot(r.pts[b]-r.pts[a],r.pts[b+1]-r.pts[a+1],r.pts[b+2]-r.pts[a+2]);}
  const ph={r,cum,total:cum[n-1],head:0,done:false,fade:1,hl:false};
  if(PH.follow&&PH.followT<=0&&!r.glare){ph.hl=true;PH.followT=3.6;}
  PH.list.push(ph);}
function photonStory(r){const lay=t('lay.'+r.layer);
  let s=`<b>${r.lam} nm</b> ${t('story.photon')} · `;
  if(r.glare)s+=t('story.refl');
  else{s+=t('story.scat',{n:r.nScat,d:fmtDepth(r.maxD),l:lay})+'<br>';
    if(r.outcome==='absorbed')s+=t('story.abs',{a:absName(r.absName)});
    else if(r.outcome==='detected')s+=state.mode===2?t('story.passed',{p:Math.round((1-r.pExit)*100)}):t('story.reached');
    else if(r.outcome==='blocked')s+=t('story.blocked',{p:Math.round((1-r.pExit)*100)});
    else s+=t('story.left');}
  return s;}
function updatePhotons(dt){
  if(PH.on&&PH.visible){PH.acc+=dt*PH.rate;while(PH.acc>1){PH.acc-=1;if(PH.list.length<PH.max)spawnPhoton();}}
  PH.followT-=dt;
  let sI=0,hI=0;const cam=camera.position;
  for(let k=PH.list.length-1;k>=0;k--){const ph=PH.list[k];
    if(!ph.done){ph.head+=dt*SPEED*(ph.hl?0.75:1);if(ph.head>=ph.total){ph.head=ph.total;ph.done=true;const r=ph.r,n=r.pts.length/3,e=(n-1)*3;
        if(r.outcome==='absorbed'){const hit=r.absName.indexOf('haemo')>=0?'hb':'mel';flash(r.pts[e],r.pts[e+1],r.pts[e+2],ABS_COL[hit],0.5);}
        else if(r.outcome==='blocked')flash(r.pts[e],r.pts[e+1],r.pts[e+2],[1,0.62,0.32],0.8);
        else if(r.outcome==='detected')flash(r.pts[e],r.pts[e+1],r.pts[e+2],[0.9,0.97,1],0.45);
        if(ph.hl&&PH.onStory)PH.onStory(photonStory(r));}}
    else{ph.fade-=dt*1.3;if(ph.fade<=0){PH.list.splice(k,1);continue;}}
    const P=ph.r.pts,C=ph.r.col,n=P.length/3,boost=ph.hl?1.7:1;
    let hx=P[0],hy=P[1],hz=P[2],hp=ph.r.pol[0];
    for(let i=0;i<n-1&&sI<SEGMAX;i++){const s0=ph.cum[i];if(s0>ph.head)break;const s1=ph.cum[i+1],e=Math.min(s1,ph.head),t=s1>s0?(e-s0)/(s1-s0):1;
      const a=i*3,b=a+3;const ex=P[a]+(P[b]-P[a])*t,ey=P[a+1]+(P[b+1]-P[a+1])*t,ez=P[a+2]+(P[b+2]-P[a+2])*t;
      const i0=Math.exp(-(ph.head-s0)/TRAIL)*ph.fade*1.15*boost,i1=Math.exp(-(ph.head-e)/TRAIL)*ph.fade*1.15*boost;
      hx=ex;hy=ey;hz=ez;hp=ph.r.pol[i+1];
      if(i1<0.025)continue;const kk=i===0?0.5:1;const o=sI*6;
      tPos[o]=P[a];tPos[o+1]=P[a+1];tPos[o+2]=P[a+2];tPos[o+3]=ex;tPos[o+4]=ey;tPos[o+5]=ez;
      const cc=ph.hl?[1,1,1]:C;tCol[o]=cc[0]*i0*kk;tCol[o+1]=cc[1]*i0*kk;tCol[o+2]=cc[2]*i0*kk;tCol[o+3]=cc[0]*i1*kk;tCol[o+4]=cc[1]*i1*kk;tCol[o+5]=cc[2]*i1*kk;sI++;}
    if(!ph.done&&hI<HMAX){const o=hI*3;hPos[o]=hx;hPos[o+1]=hy;hPos[o+2]=hz;const cc=ph.hl?[1,1,1]:C;hCol[o]=cc[0];hCol[o+1]=cc[1];hCol[o+2]=cc[2];
      hPol[hI]=state.mode===2?clamp(hp):0;hSize[hI]=ph.hl?0.32:0.21;hA[hI]=1;hKind[hI]=0;hI++;}}
  for(let k=flashes.length-1;k>=0;k--){const f=flashes[k];f.t+=dt;if(f.t>0.75){flashes.splice(k,1);continue;}
    if(hI<HMAX){const o=hI*3;hPos[o]=f.x;hPos[o+1]=f.y;hPos[o+2]=f.z;hCol[o]=f.col[0];hCol[o+1]=f.col[1];hCol[o+2]=f.col[2];hPol[hI]=0;hSize[hI]=f.size*(0.5+f.t*1.6);hA[hI]=1-f.t/0.75;hKind[hI]=1;hI++;}}
  trailGeo.setDrawRange(0,sI*2);trailGeo.attributes.position.needsUpdate=true;trailGeo.attributes.color.needsUpdate=true;
  headGeo.setDrawRange(0,hI);for(const k of['position','aColor','aPol','aSize','aA','aKind'])headGeo.attributes[k].needsUpdate=true;}
function clearPhotons(){PH.list.length=0;flashes.length=0;trailGeo.setDrawRange(0,0);headGeo.setDrawRange(0,0);}

/* =====================================================================
   Camera, labels, chapters, controls, main loop
   ===================================================================== */
const REDUCED=window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches;
const state={chapter:0,mode:1,view:'device',caseId:'melanoma',explode:0,explodeT:0,devExpl:0,devExplT:0.55,sel:null,layerSel:null,lambda:530,devPart:null,atlasTab:'derm'};
let PROBE_ON=false,probeD=0.07,prevCase=null,curE=null,lamT=0;
const $=id=>document.getElementById(id);
const MODE_COL=['#E39A5E','#F2E4C9','#43B6BB','#A294FF'];
const isEvoCh=ch=>ch===6||ch===7;

/* ---------------- camera ---------------- */
const cam={t:new THREE.Vector3(0,1.5,0),az:0.7,el:0.4,dist:17,tw:null};
const VIEWS={lens:{t:[0,0,0],az:0,el:1.5695},orbit:{t:[0,-0.9,0],az:0.62,el:0.5,dist:17},section:{t:[0,-0.35,0],az:0.0,el:0.2,dist:13.5},
  layers:{t:[0,0.3,0],az:0.58,el:0.3,dist:19.5},device:{t:[0,2.1,0],az:0.72,el:0.34,dist:19},peel:{t:[0,-0.6,0],az:0.35,el:1.0,dist:15}};
/* screen layout, mirroring the media queries in lens.css: 'desk' three columns (chapters | scene | notes),
   'mob' phones in portrait (chapters on top, notes sheet and dock at the bottom), 'land' phones in landscape and
   other short windows (chapters on top, scene left, notes column right) */
const MQ_MOB=matchMedia('(max-width: 900px)'),MQ_LAND=matchMedia('(orientation: landscape) and (max-height: 500px)');
function layoutMode(){return MQ_LAND.matches?'land':MQ_MOB.matches?'mob':'desk';}
let FR={l:0,r:innerWidth,t:0,b:innerHeight};
function freeRect(){const W=innerWidth,H=innerHeight,pr=$('panel').getBoundingClientRect(),dr=$('dockIn').getBoundingClientRect(),cr=$('chapters').getBoundingClientRect();
  const eb=$('evoBar'),er=eb&&!eb.hidden?$('evoIn').getBoundingClientRect():null,bt=er?Math.min(er.top,dr.top):dr.top;
  if(AUD.on){const nr=AUD.notes&&W>900?pr.left-8:W;return{l:0,r:Math.max(nr,W*0.5),t:0,b:Math.max(er?er.top-10:H,H*0.5)};}
  const mode=layoutMode();
  if(mode==='desk')return{l:Math.min(cr.right+6,W*0.3),r:Math.max(pr.left-6,W*0.5),t:0,b:Math.max(bt-6,H*0.5)};
  if(mode==='land')return{l:0,r:$('panel').classList.contains('min')?W:Math.max(pr.left-6,W*0.45),t:Math.min(cr.bottom+4,H*0.3),b:Math.max(bt-6,H*0.45)};
  return{l:0,r:W,t:Math.min(cr.bottom+4,H*0.3),b:Math.max(Math.min(pr.top,bt)-4,H*0.3)};}
function applyOffset(){const W=innerWidth,H=innerHeight;FR=freeRect();const cx=(FR.l+FR.r)/2,cy=(FR.t+FR.b)/2;camera.setViewOffset(W,H,W/2-cx,H/2-cy,W,H);camera.updateProjectionMatrix();}
const VIEW_EXT={orbit:[10.5,9],section:[9.6,8.4],layers:[13,14.2],device:[11.5,13.2],peel:[11,9]};
function fitDist(v){const P=VIEWS[v],E=VIEW_EXT[v];if(!E)return P.dist;const ppm=Math.min((FR.r-FR.l)/E[0],(FR.b-FR.t)/E[1]),f=Math.tan(THREE.MathUtils.degToRad(camera.fov/2));return Math.max(P.dist*0.85,(innerHeight/2)/(ppm*f));}
function lensSpan(){const fh=FR.b-FR.t;return Math.max(60,Math.min(FR.r-FR.l,fh-(!AUD.on&&layoutMode()!=='desk'?Math.min(72,fh*0.3):0)));}
function lensDist(){const R=lensSpan()*0.47,f=Math.tan(THREE.MathUtils.degToRad(camera.fov/2));return(innerHeight/2)*3.95/(R*f);}
function applyCam(){const ce=Math.cos(cam.el);camera.position.set(cam.t.x+cam.dist*ce*Math.sin(cam.az),cam.t.y+cam.dist*Math.sin(cam.el),cam.t.z+cam.dist*ce*Math.cos(cam.az));camera.lookAt(cam.t);camera.updateMatrixWorld(true);}
function flyTo(t,az,el,dist,dur=1.1){cam.fit=null;let a=az;while(a-cam.az>Math.PI)a-=TAU;while(a-cam.az<-Math.PI)a+=TAU;
  cam.tw={f:{t:cam.t.clone(),az:cam.az,el:cam.el,dist:cam.dist},to:{t:new THREE.Vector3(t[0],t[1],t[2]),az:a,el,dist},k:0,dur:REDUCED?0.01:dur};}
function stepCam(dt){if(!cam.tw)return;const w=cam.tw;w.k=Math.min(1,w.k+dt/w.dur);const e=w.k<0.5?4*w.k*w.k*w.k:1-Math.pow(-2*w.k+2,3)/2;
  cam.t.lerpVectors(w.f.t,w.to.t,e);cam.az=lerp(w.f.az,w.to.az,e);cam.el=lerp(w.f.el,w.to.el,e);cam.dist=lerp(w.f.dist,w.to.dist,e);if(w.k>=1)cam.tw=null;}

/* pointer controls */
const ptrs=new Map();let pinch0=0,hintHidden=false,lastInteract=0,labelsA=1;
function hideHint(){if(!hintHidden){hintHidden=true;$('hint').style.opacity=0;}}
setTimeout(hideHint,9000);
canvas.addEventListener('contextmenu',e=>e.preventDefault());
canvas.addEventListener('pointerdown',e=>{canvas.setPointerCapture(e.pointerId);ptrs.set(e.pointerId,{x:e.clientX,y:e.clientY,pan:e.button===2||e.shiftKey});cam.tw=null;cam.fit=null;hideHint();
  if(ptrs.size===2){const[a,b]=[...ptrs.values()];pinch0=Math.hypot(a.x-b.x,a.y-b.y);}});
canvas.addEventListener('pointermove',e=>{const p=ptrs.get(e.pointerId);if(!p)return;const dx=e.clientX-p.x,dy=e.clientY-p.y;p.x=e.clientX;p.y=e.clientY;if(dx||dy)lastInteract=performance.now();
  if(ptrs.size===1){if(p.pan)pan(dx,dy);else{cam.az-=dx*0.0065;cam.el=clamp(cam.el+dy*0.005,-0.25,1.5695);if(state.view==='lens'&&cam.el<1.35){state.view='free';updateDock();updateVisibility();}}}
  else if(ptrs.size===2){const[a,b]=[...ptrs.values()];const d=Math.hypot(a.x-b.x,a.y-b.y);if(pinch0>0){cam.dist=clamp(cam.dist*pinch0/d,2.5,48);}pinch0=d;pan(dx*0.5,dy*0.5);}});
const endPtr=e=>{ptrs.delete(e.pointerId);if(ptrs.size<2)pinch0=0;};
canvas.addEventListener('pointerup',endPtr);canvas.addEventListener('pointercancel',endPtr);
canvas.addEventListener('wheel',e=>{e.preventDefault();cam.tw=null;cam.fit=null;lastInteract=performance.now();cam.dist=clamp(cam.dist*Math.exp(e.deltaY*0.0012),2.5,48);hideHint();},{passive:false});
canvas.addEventListener('dblclick',()=>{const v=VIEWS[state.view];if(v)setView(state.view);});
function pan(dx,dy){const s=cam.dist*0.0013;const right=new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld,0),up=new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld,1);
  cam.t.addScaledVector(right,-dx*s).addScaledVector(up,dy*s);}

/* ---------------- labels ---------------- */
const LBL=[];
function mkLabel(set,html,pos,cls,onClick,ox=3.5){const el=document.createElement('div');el.className='lbl '+(cls||'');el.innerHTML=html;if(onClick)el.addEventListener('click',onClick);$('labels').appendChild(el);const o={el,pos,set,on:false,ox};LBL.push(o);return o;}
function clearLabels(set){for(let i=LBL.length-1;i>=0;i--)if(LBL[i].set===set){LBL[i].el.remove();LBL.splice(i,1);}}
const _v=new THREE.Vector3();
let edgeL=[-4.02,4],edgeR=[4.03,4];
function pickEdges(){const zf=cutZ!=null?cutZ-0.01:4.02,cs=[[-4.02,-4.02],[4.03,-4.02],[4.03,zf],[-4.02,zf]];let mn=1e9,mx=-1e9;
  for(const c of cs){_v.set(c[0],-1.2,c[1]).project(camera);if(_v.x<mn){mn=_v.x;edgeL=c;}if(_v.x>mx){mx=_v.x;edgeR=c;}}}
function updateLabels(){const w=innerWidth,h=innerHeight;if(L)pickEdges();
  const now=performance.now(),moving=!!cam.tw||now-lastInteract<170,dtl=Math.min(0.1,(now-(updateLabels.t||now))/1000);updateLabels.t=now;
  labelsA=moving?0:Math.min(1,labelsA+dtl*5);const LE=$('labels');if(Math.abs((+LE.style.opacity||0)-labelsA)>0.01||labelsA===0||labelsA===1){LE.style.opacity=labelsA.toFixed(3);LE.classList.toggle('moving',labelsA<0.5);}
  for(const l of LBL){let p=l.on?l.pos():null;
  if(p){_v.copy(p).project(camera);if(_v.z>1||Math.abs(_v.x)>1.1||Math.abs(_v.y)>1.1)p=null;}
  if(!p){if(!l.hid){l.el.style.transform='translate(-9999px,-9999px)';l.hid=true;}continue;}
  l.hid=false;const lx=(_v.x*0.5+0.5)*w,ly=(-_v.y*0.5+0.5)*h;let fl=!!l.flip;
  if(FLIP_SETS.has(l.set)){const lw=l.w||(l.w=l.el.offsetWidth);if(lw){const lo=Math.max(2,FR.l),hi=Math.min(w-2,FR.r);
    if(!fl&&lx-l.ox+lw>hi&&lx+l.ox-lw>=lo)fl=true;else if(fl&&lx+l.ox-lw<lo&&lx-l.ox+lw<=hi)fl=false;}}
  if(fl!==l.fl){l.fl=fl;l.el.classList.toggle('flip',fl);}
  l.el.style.transform=fl?`translate(${(lx+l.ox).toFixed(1)}px,${ly.toFixed(1)}px) translate(-100%,-50%)`:`translate(${(lx-l.ox).toFixed(1)}px,${ly.toFixed(1)}px) translateY(-50%)`;}}
const FLIP_SETS=new Set(['dev','layer','probe','evo','brs']);
const devPt=(x,y,z)=>new THREE.Vector3(x+device.position.x,y+device.position.y,z+device.position.z);
const _r=new THREE.Vector3();
function devRim(side,R,y){_r.setFromMatrixColumn(camera.matrixWorld,0);_r.y=0;if(_r.lengthSq()<1e-6)_r.set(1,0,0);_r.normalize();
  let x=side*R*_r.x,z=side*R*_r.z;if(cutZ!=null&&state.chapter!==0&&z>cutZ-0.05){z=cutZ-0.05;x=side*Math.sign(_r.x||1)*Math.sqrt(Math.max(0,R*R-z*z));}return devPt(x,y,z);}
const DEV_POS={lens:[-1,1.55],ana:[1,1.45],leds:[-1,2.74],pol:[1,2.95],plate:[-1,3.0],fluid:[1,2.9]};
const LAYER_INFO={
  sc:{n:'Stratum corneum',t:'10–20 µm; far thicker on palms and soles',d:[0,0.02],what:'Flattened, dead keratinocytes. Refractive index ≈1.55: the source of surface glare.',see:'Scale, keratin masses, comedo-like openings, black dots of melanin in keratin, blood spots on crust.'},
  epi:{n:'Epidermis',t:'≈50–100 µm',d:[0.02,0.1],what:'Living keratinocytes, with melanocytes along the basal layer. Melanin here looks black to dark brown.',see:'Milia-like cysts, pagetoid black dots, diffuse brown pigment.'},
  dej:{n:'Dermo-epidermal junction',t:'undulating, ≈0.05–0.15 mm',d:[0.05,0.15],what:'Rete ridges of the epidermis interlock with dermal papillae. Seen from below in this model, the junction is a honeycomb.',see:'Pigment network (ridges give the lines, papilla tips the holes), junctional nests as brown globules, streaks.'},
  pap:{n:'Papillary dermis',t:'to ≈0.3–0.5 mm',d:[0.1,0.4],what:'Loose collagen and a capillary loop rising into each papilla.',see:'Dotted, glomerular and hairpin vessels; grey melanophages (peppering); white fibrosis; shiny white structures.'},
  ret:{n:'Reticular dermis',t:'≈1–3 mm',d:[0.4,2.4],what:'Dense collagen bundles, the horizontal vascular plexus, hair follicles.',see:'Steel-blue pigment (blue nevus). About the limit of what dermoscopy resolves.'},
  sub:{n:'Subcutis',t:'below ≈2–4 mm',d:[2.4,4],what:'Fat lobules separated by septa.',see:'Out of reach for visible-light dermoscopy.'}};
const LI=k=>LANG==='pl'?Object.assign({},LAYER_INFO[k],LAYER_PL[k]):LAYER_INFO[k];
const LAYER_GROUP={sc:'sc',epi:'epi',dej:'epi',pap:'pap',ret:'ret',sub:'sub'};
function layerLabelPos(k){return()=>{const E=k==='dej'?edgeR:edgeL,x=E[0],zf=E[1];const I=LAYER_INFO[k];const yT=L.elevAt(x,zf);
  const d=k==='dej'?0.1:k==='epi'?0.045:(I.d[0]+I.d[1])/2*(k==='ret'?0.55:1);return new THREE.Vector3(x,yT-D2S(d)+LG[LAYER_GROUP[k]].position.y,zf);};}
function buildStaticLabels(){for(const s of['dev','layer','ruler','probe'])clearLabels(s);
  for(const k in DEV_POS){const[sd,R]=DEV_POS[k];const o=mkLabel('dev',`<i></i><span>${t('dev.'+k)}</span>`,()=>devRim(sd,R,DP[k].position.y));o.key=k;}
  for(const k of['sc','epi','dej','pap','ret','sub']){const I=LI(k);const o=mkLabel('layer',`<i></i><span>${I.n}<small>${I.t.split(';')[0]}</small></span>`,layerLabelPos(k),k==='dej'?'layer flip':'layer',()=>selectLayer(k));o.key=k;o.flip=k==='dej';}
  mkLabel('probe',`<i></i><span>${t('lbl.probe')}</span>`,()=>probe.position.clone().add(new THREE.Vector3(0.3,0,0)));
  for(const d of[0,0.02,0.1,0.4,1,2.4,4]){mkLabel('ruler',`<i></i><span>${d===0?'0 mm':fmtDepth(d)}</span>`,()=>{const x=edgeR[0],zf=edgeR[1];return new THREE.Vector3(x,L.elevAt(Math.sign(x)*3.99,Math.max(-3.99,Math.min(3.99,zf)))-D2S(d),zf);},'ruler',null,0);}}
buildStaticLabels();
function buildPins(){clearLabels('pin');if(!L)return;L.structures.forEach((s,i)=>{if(!s.focus)return;
  const nw=!!(L.evoNew&&L.evoNew.has(s.sid));const o=mkLabel('pin',`<b>${i+1}</b><span>${stext(s,'name')}${nw?`<em>${t('evo.new')}</em>`:''}</span>`,()=>{if(state.view==='lens')return new THREE.Vector3(s.foot[0],L.elevAt(s.foot[0],s.foot[1])+0.02,s.foot[1]);
    const[fx,fd,fz]=s.focus;if(cutZ!=null&&fz>cutZ+0.05)return null;return new THREE.Vector3(fx,L.elevAt(fx,fz)-D2S(fd)+LG[layerOf(fx,fz,fd)].position.y,fz);},'pin'+(nw?' new':''),()=>selectStructure(i),10);o.idx=i;});}

/* ---------------- lens overlay ---------------- */
let lensR=0;
let lensC=0;
function updateLens(){const on=state.view==='lens';$('lens').hidden=!on;if(!on)return;const w=innerWidth,h=innerHeight;
  const c=new THREE.Vector3(0,0,0).project(camera),e=new THREE.Vector3(1,0,0).project(camera);const ppm=Math.abs(e.x-c.x)*w/2;
  const cx=(c.x*0.5+0.5)*w,cy=(-c.y*0.5+0.5)*h;
  const R=Math.min(3.95*ppm,lensSpan()*0.5);if(Math.abs(R-lensR)<0.5&&Math.abs(cx+cy-lensC)<0.5)return;lensR=R;lensC=cx+cy;
  const LE=$('lens');LE.style.setProperty('--lr',R+'px');LE.style.background=`radial-gradient(circle at ${cx}px ${cy}px, transparent 0, transparent ${R}px, var(--lens-out) ${R+1.5}px)`;const sv=$('reticle');const S=R*2+40;sv.setAttribute('width',S);sv.setAttribute('height',S);sv.setAttribute('viewBox',`${-S/2} ${-S/2} ${S} ${S}`);
  let g=`<circle r="${R}" fill="none" stroke="rgba(242,228,201,0.35)" stroke-width="1.5"/>`;
  const pmm=ppm/(L&&L.mmU||1),nt=Math.floor(3.4*ppm/pmm);for(let i=-nt;i<=nt;i++){if(!i)continue;const x=i*pmm;g+=`<line x1="${x}" y1="-5" x2="${x}" y2="5" stroke="rgba(242,228,201,0.5)" stroke-width="1"/><line x1="-5" y1="${x}" x2="5" y2="${x}" stroke="rgba(242,228,201,0.5)" stroke-width="1"/>`;}
  g+=`<line x1="${-R+8}" y1="0" x2="${-R+26}" y2="0" stroke="rgba(242,228,201,.5)"/><line x1="${R-26}" y1="0" x2="${R-8}" y2="0" stroke="rgba(242,228,201,.5)"/>`;
  sv.innerHTML=g;sv.style.left=cx+'px';sv.style.top=cy+'px';const tg=$('lensTag');tg.style.left=cx+'px';tg.style.top=Math.max(FR.t+4,cy-R-26)+'px';const sb=$('scalebar');sb.style.width=pmm+'px';sb.style.left=(cx-pmm/2)+'px';sb.style.top=Math.min(h-40,cy+R+10)+'px';}

/* ---------------- textures ---------------- */
let fade=null;const prevCv=document.createElement('canvas');prevCv.width=prevCv.height=TEX;const pctx=prevCv.getContext('2d');
function texFor(m){return paintFor(curE,m);}
function showTexture(instant){const cv=isEvoCh(state.chapter)&&EV.on&&L&&L.evo?evoCanvas():texFor(state.mode);if(PROBE_ON){paintProbe(cv,probeD,state.mode);return;}
  if(instant||REDUCED){fade=null;dctx.globalAlpha=1;dctx.drawImage(cv,0,0);topTex.needsUpdate=true;return;}
  pctx.drawImage(dispCanvas,0,0);fade={to:cv,t:0};}
function stepFade(dt){if(!fade)return;fade.t=Math.min(1,fade.t+dt/0.4);dctx.globalAlpha=1;dctx.drawImage(prevCv,0,0);dctx.globalAlpha=fade.t;dctx.drawImage(fade.to,0,0);dctx.globalAlpha=1;topTex.needsUpdate=true;if(fade.t>=1)fade=null;}

/* ---------------- lesion loading ---------------- */
const MODELS={};
/* run heavy work after the busy overlay has painted; the timeout also covers windows where frames are paused */
function afterPaint(fn){let done=false;const go=()=>{if(done)return;done=true;setTimeout(fn,30);};requestAnimationFrame(go);setTimeout(go,150);}
function getModel(id){if(!MODELS[id]){if(id.startsWith('evo:'))evoEntry(id);else{const L0=CASES[id].build();L0.id=id;prepFeatures(L0);MODELS[id]={L:L0,M:computeMaps(L0),paints:[]};}}const E=MODELS[id];finishMaps(E.L,E.M);return E;}
function busy(fn){const el=$('loading');if(MODELS[state.caseId]&&el.className==='gone'){fn();return;}el.className='busy';el.textContent=t('loading');
  afterPaint(()=>{try{fn();}catch(e){showErr(e.message);console.error(e);}el.className='gone';});}
let loadTok=0;
function loadCase(id,cb){const need=!MODELS[id]||!MODELS[id].M.done,tok=++loadTok;const run=()=>{if(tok!==loadTok)return;curE=getModel(id);L=curE.L;buildTissue();buildDGrid();buildAbsorbers();showTexture(true);buildPins();
    selectStructure(null,true);updateVisibility();if(PH.on){clearPhotons();warmStats(state.mode);}HS.sel=-1;
    if(L.evo){const sz=L.secZ||0;if(HS.lastSec!=null&&Math.abs(HS.lastSec-sz)>1e-3)HS.z=sz;HS.lastSec=sz;}if(HS.on)rebuildSlide(true);if(isEvoCh(state.chapter)&&EV.on)evoAfterLoad();renderPanel();if(cb)cb();};
  if(need){const el=$('loading');el.className='busy';el.textContent=t('loading');afterPaint(()=>{try{run();}catch(e){showErr(e.message);console.error(e);}el.className='gone';});}
  else run();}
function setCase(id,cb){if(PROBE_ON||isEvoCh(state.chapter))return;state.caseId=id;$('caseSel').value=id;loadCase(id,cb);}

/* ---------------- state setters ---------------- */
function setMode(m){if(m===state.mode)return;state.mode=m;showTexture(false);if(EV.on)evoBgStart();HS.dirty=true;if(PH.on){clearPhotons();warmStats(m);}updateDock();updateVisibility();refreshPanelLive();}
function setSection(z){if(z==null){secPlane.constant=100;buildCut(null);PH.zBand=null;}else{secPlane.constant=z;buildCut(z);PH.zBand=[z-0.75,z-0.05];}}
function setPeel(mm){peelPlane.constant=(mm==null||mm<0.004)?100:-D2S(mm);}
function setView(v){const prevV=state.view;
  if(v==='hist'){if(isEvoCh(state.chapter)&&L&&EV.hsSeq!==EV.seq){HS.z=L.secZ||0;HS.sel=-1;EV.hsSeq=EV.seq;}
    if(!AUD.on&&!HS.on&&layoutMode()==='mob'&&!$('panel').classList.contains('min')){HS.autoMin=true;setNotesMin(true);applyOffset();}
    state.view='hist';enterHist();updateDock();updateVisibility();if(state.chapter>=5&&state.atlasTab!=='hist'){state.atlasTab='hist';renderPanel();}else renderHistLists();return;}
  if(HS.on)exitHist();
  if(state.chapter>=5&&state.atlasTab==='hist'){state.atlasTab='derm';setTimeout(renderPanel,0);}
  state.view=v;const P=VIEWS[v];
  if(v==='section'){if(prevV==='hist'){state.sel=null;setSection(HS.z+0.01);}else if(cutZ==null||state.sel==null)setSection(L&&L.secZ?L.secZ:0);}else setSection(null);
  if(v!=='section'&&state.sel!=null){beam.visible=false;focusDot.visible=false;}
  if(v==='section'&&state.sel!=null){selectStructure(state.sel);return;}
  state.explodeT=v==='layers'?1:0;
  flyTo(P.t,P.az,P.el,v==='lens'?lensDist():fitDist(v));cam.fit=v;updateDock();updateVisibility();}
function setPhotons(on){PH.on=on;if(on){warmStats(state.mode);}else clearPhotons();updateDock();updateVisibility();refreshPanelLive();}

function updateVisibility(){const ch=state.chapter,lens=state.view==='lens';
  $('lens').hidden=!lens;lensR=0;
  topMat.color.set(lens?0x000000:0x8c8c8c);topMat.emissiveIntensity=lens?1.0:0.6;
  const histV=state.view==='hist';PH.visible=PH.on&&!lens&&!histV&&state.explodeT<0.5&&ch!==0;
  trails.visible=heads.visible=PH.visible;
  const showDev=!lens&&(ch===0||(PH.visible));device.visible=showDev;
  const H=headCfg(state.mode);
  if(ch===0){device.position.set(0,3.05,0);state.devExplT=state.devExplT||0;}else{device.position.set(0,H.devY,0);state.devExplT=0;}
  DP.handle.visible=ch===0;
  DP.plate.visible=DP.fluid.visible=ch===0||H.contact;DP.pol.visible=DP.ana.visible=ch===0||state.mode===2;
  const lc=PH.lambda?lamRGB(PH.lambda):state.mode===3?lamRGB(405):[1,1,1];DP.ledMat.emissive.setRGB(lc[0],lc[1],lc[2]);DP.ledMat.color.setRGB(lc[0],lc[1],lc[2]);
  probe.visible=PROBE_ON&&!lens;
  for(const l of LBL){if(l.set==='dev')l.on=showDev&&(ch===0||!!({leds:1,lens:1,ana:state.mode===2,pol:state.mode===2,plate:0,fluid:H.contact}[l.key]));
    else if(l.set==='layer')l.on=!lens&&(ch===4||state.view==='layers'||(ch>=1&&ch<=3&&state.view==='section'))&&(l.key!=='dej'||ch===4);
    else if(l.set==='ruler')l.on=!lens&&state.explodeT<0.5&&ch!==0&&ch!==4;
    else if(l.set==='pin')l.on=ch>=5;
    else if(l.set==='evo')l.on=isEvoCh(ch)&&!lens&&state.view!=='hist'&&state.explodeT<0.5&&!!(L&&L.brs);
    else if(l.set==='probe')l.on=PROBE_ON&&!lens&&state.explodeT<0.5;}
  for(const l of LBL){if(l.set==='pin')l.el.classList.toggle('on',l.idx===state.sel);if(l.set==='layer')l.el.classList.toggle('on',l.key===state.layerSel);}
  const atl=ch>=5;footRing.visible=state.sel!=null&&atl;beam.visible=focusDot.visible=state.sel!=null&&atl&&!lens&&state.view==='section';
  if(histV)for(const l of LBL)l.on=false;
  $('lensTag').textContent=(PH.lambda&&ch===3?PH.lambda+' nm':t('mode.name'+state.mode))+' · 10×';}

/* ---------------- structures & layers ---------------- */
function selectStructure(i,silent){state.sel=i;HL.sid=null;
  if(i==null){beam.visible=footRing.visible=focusDot.visible=false;if(!silent&&state.view==='section')setSection(L&&L.secZ?L.secZ:0);if(!silent)renderStructList();updateVisibility();return;}
  const s=L.structures[i];HL.sid=s.sid;HL.layer=null;
  if(s.foot){const fy=L.elevAt(s.foot[0],s.foot[1]);footRing.position.set(s.foot[0],fy+0.02,s.foot[1]);footRing.scale.set(s.foot[2],s.foot[2],1);}
  if(s.focus&&state.view!=='lens'){const[fx,fd,fz]=s.focus,top=L.elevAt(fx,fz),fy=top-D2S(fd);state.view='section';state.explodeT=0;setSection(fz+0.3);
    beam.position.set(fx,(top+0.25+fy)/2,fz);beam.scale.set(1,Math.max(0.05,top+0.25-fy),1);focusDot.position.set(fx,fy,fz);
    flyTo([fx,fy,fz],0.26,0.32,fitDist('section')*0.52+fd*2.5);}
  updateDock();updateVisibility();renderStructList();}
function selectLayer(k){state.layerSel=state.layerSel===k?null:k;HL.layer=null;HL.sid=null;
  if(state.layerSel){if(k==='dej')HL.sid='net';else HL.layer=k;if(state.view!=='layers')setView('layers');
    const I=LI(k);const g=LAYER_GROUP[k];const y=-D2S((I.d[0]+I.d[1])/2*(k==='ret'?0.55:1))+EXPL[g];flyTo([0,y,0],0.58,0.42,fitDist('layers')*(k==='ret'||k==='sub'?0.8:0.65));}
  updateVisibility();document.querySelectorAll('[data-layer]').forEach(b=>b.classList.toggle('on',b.dataset.layer===state.layerSel));}

/* ---------------- chapters ---------------- */
const CH=[
  {key:'instrument',title:'The instrument',enter(){state.devExplT=0.55;setPhotons(false);setView('device');}},
  {key:'glare',title:'Surface glare',enter(){setMode(0);setView('section');setPhotons(true);}},
  {key:'light',title:'Three kinds of light',enter(){if(state.mode===0)setMode(1);setView('section');setPhotons(true);}},
  {key:'depth',title:'Wavelength and colour',enter(){enterProbe();setView('section');setPhotons(true);},exit(){exitProbe();}},
  {key:'layers',title:'Skin layers',enter(){setPhotons(false);setView('layers');},exit(){state.layerSel=null;HL.layer=null;HL.sid=null;setPeel(null);}},
  {key:'atlas',title:'Diagnoses',enter(){state.atlasTab='derm';setPhotons(false);setView('orbit');},exit(){selectStructure(null,true);}},
  {key:'evo',title:'How lesions evolve',enter(){enterEvo('evo');},exit(n){selectStructure(null,true);exitEvo(isEvoCh(n));}},
  {key:'sites',title:'Difficult sites',enter(){enterEvo('sites');},exit(n){selectStructure(null,true);exitEvo(isEvoCh(n));}}];
function buildNav(){$('chapters').innerHTML=CH.map((c,i)=>`<button type="button" data-ch="${i}"${i===state.chapter?' aria-current="true"':''}><span class="n">0${i+1}</span><span>${t('ch.'+c.key)}</span></button>`).join('')+`<div class="lang" role="group" aria-label="${t('lang.label')}"><span>${t('lang.label')}</span><button type="button" data-lang="en" class="${LANG==='en'?'on':''}" lang="en">EN</button><button type="button" data-lang="pl" class="${LANG==='pl'?'on':''}" lang="pl">PL</button></div><div class="lang" role="group" aria-label="${t('theme.label')}"><span>${t('theme.label')}</span><button type="button" data-theme="light" class="${THEME==='light'?'on':''}" title="${t('theme.lightT')}">${t('theme.light')}</button><button type="button" data-theme="dark" class="${THEME==='dark'?'on':''}" title="${t('theme.darkT')}">${t('theme.dark')}</button></div><a id="exitBtn" href="/levels" target="_top" title="${t('exit.t')}" aria-label="${t('exit.t')}"><svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8.5 2.5 4 7l4.5 4.5"/></svg><span>${t('exit')}</span></a>`;
  /* leaving goes through the app's router (no reload); the plain link is the fallback */
  $('exitBtn').addEventListener('click',e=>{if(EMBED.on){e.preventDefault();appPost('exit');}});
  $('chapters').querySelectorAll('[data-theme]').forEach(b=>b.addEventListener('click',()=>applyTheme(b.dataset.theme)));
  $('chapters').querySelectorAll('[data-lang]').forEach(b=>b.addEventListener('click',()=>setLang(b.dataset.lang)));
  $('chapters').querySelectorAll('button[data-ch]').forEach(b=>b.addEventListener('click',()=>goChapter(+b.dataset.ch)));if(typeof presUI==='function')presUI(true);if(typeof layoutSide==='function')layoutSide();}
function goChapter(i){if(i===state.chapter&&$('panelInner').innerHTML)return;const prev=CH[state.chapter];if(prev&&prev.exit&&state.chapter!==i)prev.exit(i);
  state.chapter=i;$('chapters').querySelectorAll('button[data-ch]').forEach(b=>b.setAttribute('aria-current',String(+b.dataset.ch===i)));
  CH[i].enter();renderPanel();updateVisibility();$('panelInner').scrollTop=0;if(layoutMode()!=='desk'){const cb=$('chapters').querySelector(`button[data-ch="${i}"]`);if(cb&&cb.scrollIntoView)try{cb.scrollIntoView({inline:'center',block:'nearest'});}catch(e){}}if(!AUD.on){try{history.replaceState(null,'','#'+CH[i].key);}catch(e){}appPost('chapter',{key:CH[i].key});}}
function enterProbe(){if(PROBE_ON)return;loadTok++;prevCase=state.caseId;PROBE_ON=true;PH.lambda=state.lambda;if(state.mode===0||state.mode===2)state.mode=1;
  curE=getModel('plain');L=curE.L;buildTissue();buildDGrid();buildAbsorbers();placeProbe();showTexture(true);buildPins();updateDock();$('caseSel').disabled=true;}
function exitProbe(){PROBE_ON=false;PH.lambda=null;probe.visible=false;$('caseSel').disabled=false;state.caseId=prevCase||'melanoma';loadCase(state.caseId);}
function placeProbe(){probe.position.set(PROBE.x,L.elevAt(PROBE.x,PROBE.z)-D2S(probeD),PROBE.z);const s=0.8+probeD*0.6;probe.scale.set(s,s,s);}

/* ---------------- panel ---------------- */
const srcHTML=()=>`<div class="src">${t('src.lead')} <a href="https://dermoscopedia.org/Overview_principles_of_dermoscopy" target="_blank" rel="noopener">dermoscopedia, principles of dermoscopy</a>;
  <a href="https://dermoscopedia.org/Differences_between_polarized_and_non_polarized_dermoscopy" target="_blank" rel="noopener">dermoscopedia, polarized vs non-polarized</a>;
  Benvenuto-Andrade et al., <a href="https://pubmed.ncbi.nlm.nih.gov/17372097/" target="_blank" rel="noopener">Arch Dermatol 2007</a>;
  sub-UV (405 nm) reflectance dermoscopy, <a href="https://www.sciencedirect.com/science/article/pii/S0190962225006693" target="_blank" rel="noopener">JAAD 2025</a>;
  Anderson &amp; Parrish, <a href="https://pubmed.ncbi.nlm.nih.gov/7252245/" target="_blank" rel="noopener">J Invest Dermatol 1981</a>;
  Jacques, <a href="https://omlc.org/news/jun08/penetration/index.html" target="_blank" rel="noopener">optical penetration depth (OMLC)</a>.
  ${t('src.tail')}</div>`;
const barsHTML=()=>`<div class="bars" id="originBars">${[['glare','#E39A5E'],['sc','#EEDDB8'],['epi','#D9A48B'],['pap','#F0C2BC'],['ret','#C98B90']]
  .map(([k,c])=>`<div class="bar"><span>${t('bars.'+k)}</span><span class="t"><i data-k="${k}" style="background:${c}"></i></span><span class="v" data-v="${k}">–</span></div>`).join('')}</div>`;
const MEDIA=[1.0,1.33,1.34,1.36,1.47,1.52];
const fres=n=>((1.55-n)/(1.55+n))**2;

function renderPanel(){const P=$('panelInner'),ch=state.chapter;let h='';
  if(ch===0){h=`<p class="kicker">${t('c0.kicker')}</p><h2>${t('c0.h2')}</h2><p>${t('c0.p')}</p>
    <div class="slider"><label for="devEx">${t('c0.take')} <b id="devExV">${Math.round(state.devExplT*100)}%</b></label><input id="devEx" type="range" min="0" max="100" value="${Math.round(state.devExplT*100)}"></div>
    <div class="cards">${['lens','led','pol','plate'].map(k=>`<div class="card"><h4>${t('c0.'+k+'.h')}</h4><p>${t('c0.'+k+'.p')}</p></div>`).join('')}</div>
    <p class="note">${t('c0.note')}</p><p>${t('c0.next')}</p><button class="linkbtn" data-go="1">${t('c0.btn')}</button>`;}
  else if(ch===1){h=`<p class="kicker">${t('c1.kicker')}</p><h2>${t('c1.h2')}</h2><p>${t('c1.p1')}</p><div class="eq">${t('c1.eq')}</div>
    <div class="bars">${MEDIA.map((v,i)=>`<div class="bar"><span>${t('media'+i)} <span class="mono" style="color:var(--muted)">${nf(v.toFixed(2))}</span></span><span class="t"><i style="width:${(fres(v)/fres(1)*100).toFixed(1)}%;background:${v===1?'#E39A5E':'#43B6BB'}"></i></span><span class="v">${nf((fres(v)*100).toFixed(2))}%</span></div>`).join('')}</div>
    <p>${t('c1.p2')}</p><h3>${t('c1.h3a')}</h3><div class="cards" id="modeCards"></div>
    <h3>${t('c1.h3b')}</h3>${barsHTML()}<p class="note">${t('c1.note')}</p>${srcHTML()}`;}
  else if(ch===2){h=`<p class="kicker">${t('c2.kicker')}</p><h2>${t('c2.h2')}</h2><div class="cards" id="modeCards"></div>
    <h3>${t('c2.h3a')}</h3>${barsHTML()}<dl class="kv" id="anaKV"></dl>
    <h3>${t('c2.h3b')}</h3><div class="story" id="story">${t('c2.wait')}</div>
    <p class="note">${t('c2.note1')}</p><p class="note">${t('c2.note2')}</p>${srcHTML()}`;}
  else if(ch===3){h=`<p class="kicker">${t('c3.kicker')}</p><h2>${t('c3.h2')}</h2><p>${t('c3.p1')}</p>
    <div class="slider"><label for="lam">${t('c3.lam')} <b id="lamV">${state.lambda} nm</b></label><div class="spectrum"></div><input id="lam" type="range" min="400" max="900" step="5" value="${state.lambda}"></div>
    <dl class="kv"><dt>${t('c3.kvS')}</dt><dd id="kvS"></dd><dt>${t('c3.kvM')}</dt><dd id="kvM"></dd><dt>${t('c3.kvH')}</dt><dd id="kvH"></dd><dt>${t('c3.kv50')}</dt><dd id="kvP50"></dd><dt>${t('c3.kv90')}</dt><dd id="kvP90"></dd></dl>
    <h3>${t('c3.h3')}</h3><p>${t('c3.p2')}</p>
    <div class="slider"><label for="pd">${t('c3.pd')} <b id="pdV"></b></label><input id="pd" type="range" min="0" max="100" value="${Math.round(Math.log(probeD/0.005)/Math.log(1.4/0.005)*100)}"></div>
    <div class="swatch"><i id="sw"></i><div><b id="swT"></b><span id="swL"></span></div></div>
    <div class="depthscale">${[0.01,0.07,0.13,0.3,0.9].map(d=>`<i style="background:${rgbStr(mix3(MODEP[1].base,pigColor(d),0.95))}"></i>`).join('')}${[0,1,2,3,4].map(i=>`<span>${t('c3.sc'+i)}</span>`).join('')}</div>
    <p class="note">${t('c3.note')}</p>${srcHTML()}`;}
  else if(ch===4){h=`<p class="kicker">${t('c4.kicker')}</p><h2>${t('c4.h2')}</h2><p>${t('c4.p1')}</p>
    <div class="cards">${['sc','epi','dej','pap','ret','sub'].map(k=>{const I=LI(k);return`<button type="button" class="card btn ${state.layerSel===k?'on':''}" data-layer="${k}"><h4>${I.n}<span class="mono" style="color:var(--muted);font-weight:400;margin-left:auto">${I.t.split(';')[0]}</span></h4><p>${I.what}</p><p style="margin-top:6px!important;color:var(--warm)">${I.see}</p></button>`;}).join('')}</div>
    <div class="slider"><label for="peel">${t('c4.peel')} <b id="peelV">${t('c4.none')}</b></label><input id="peel" type="range" min="0" max="100" value="0"></div>
    <h3>${t('c4.h3')}</h3><p>${t('c4.p2')}</p>
    <div class="chips">${[['melanoma','vessels'],['bowen','glom'],['scc','hairpin'],['bcc','arbor']].map(([c,s],i)=>`<button type="button" class="chip" data-jump="${c}|${s}">${t('c4.chip'+i)}</button>`).join('')}</div>
    <h3>${t('c4.h3b')}</h3><p>${t('c4.p3')}</p>
    <div class="row" style="margin-bottom:8px"><button type="button" class="linkbtn" data-openhist>${t('openhist')}</button></div>
    <ul class="slist" id="hlist"></ul>`;}
  else if(ch===5){h=`<p class="kicker">${t('c5.kicker')}</p><h2>${ctext(L,'name')}</h2><p class="note" style="margin-top:-6px">${ctext(L,'sub')}</p>
    <div class="chips">${CASE_ORDER.map(id=>`<button type="button" class="chip ${id===state.caseId?'on':''}" data-case="${id}">${caseName(id)}</button>`).join('')}</div>
    <p>${ctext(L,'summary')}</p>
    <div class="legend"><span><i style="background:#F2E4C9"></i>${t('legend.N')}</span><span><i style="background:#43B6BB"></i>${t('legend.P')}</span><span><i style="background:#A294FF"></i>${t('legend.B')}</span><span>${t('legend.hint')}</span></div>
    <div class="seg" id="atlasTab" role="tablist" style="display:inline-flex;margin:2px 0 10px"><button type="button" role="tab" data-tab="derm" class="${state.atlasTab!=='hist'?'on':''}">${t('tab.derm')}</button><button type="button" role="tab" data-tab="hist" class="${state.atlasTab==='hist'?'on':''}">${t('tab.hist')}</button></div>
    ${state.atlasTab==='hist'?`<p class="note">${t('c5.noteHist')}</p>
    <div class="row" style="margin-bottom:8px"><button type="button" class="linkbtn" data-openhist>${t('openhist')}</button></div><ul class="slist" id="hlist"></ul>`:
    `<ul class="slist" id="slist"></ul><p class="note">${t('c5.noteDerm')}</p>`}${srcHTML()}`;}
  else if(isEvoCh(ch))h=evoPanelHTML();
  P.innerHTML=h;bindPanel();if(isEvoCh(ch))bindEvoPanel();refreshPanelLive();if(ch>=5)renderStructList();renderHistLists();if(ch===3){updateLamUI();updateProbeUI();}if(layoutMode()!=='desk')setTimeout(resize,30);}

function renderModeCards(){const el=$('modeCards');if(!el)return;const g=state.chapter===1,list=g?[1,2,0]:[0,1,2,3];
  el.innerHTML=list.map(m=>`<button type="button" class="card btn ${state.mode===m?'on':''}" data-mode="${m}"><h4><i class="dot" style="background:${MODE_COL[m]}"></i>${g?t('c1.t'+m):t('mode.name'+m)}</h4><p>${g?t('c1.x'+m):t('modeTxt'+m)}</p></button>`).join('');
  el.querySelectorAll('[data-mode]').forEach(b=>b.addEventListener('click',()=>setMode(+b.dataset.mode)));}
function renderStructList(){const el=$('slist');if(!el)return;const VC=['#F2E4C9','#43B6BB','#A294FF'],VN=[t('vis.N'),t('vis.P'),t('vis.B')];
  el.innerHTML=L.structures.map((s,i)=>`<li class="sitem ${state.sel===i?'on':''}"><button type="button" data-s="${i}"><b>${i+1}</b><span class="nm">${stext(s,'name')}${L.evoNew&&L.evoNew.has(s.sid)?`<em class="newb">${t('evo.new')}</em>`:''}<span class="ly">${stext(s,'layer')} · ${stext(s,'depth')}</span></span>
    <span class="vis">${s.vis.map((v,j)=>`<i style="background:${VC[j]};opacity:${[0.14,0.4,0.7,1][v]}" title="${t('vis.t'+v)}">${VN[j]}</i>`).join('')}</span></button>
    <div class="body"><p><b style="color:var(--text);font-weight:600">${t('s.histo')}</b> ${stext(s,'histo')}</p><p><b style="color:var(--text);font-weight:600">${t('s.optic')}</b> ${stext(s,'optic')}</p>
    <div class="row">${s.focus?`<button type="button" class="linkbtn" data-sec="${i}">${t('btn.cut')}</button>`:''}<button type="button" class="linkbtn" data-top="${i}">${t('btn.lens')}</button><button type="button" class="linkbtn" data-he="${i}">${t('btn.he')}</button></div></div></li>`).join('');
  el.querySelectorAll('[data-he]').forEach(b=>b.addEventListener('click',()=>{const i=+b.dataset.he,s=L.structures[i];state.sel=i;HL.sid=s.sid;openHistAt(s.focus?s.focus[2]:0,s.focus?s.focus[0]:null,s.focus?s.focus[1]:0,s.sid);}));
  el.querySelectorAll('[data-s]').forEach(b=>b.addEventListener('click',()=>{const i=+b.dataset.s;if(state.sel===i){selectStructure(null);return;}if(state.view==='lens'){state.sel=i;HL.sid=L.structures[i].sid;selectStructure(i);}else selectStructure(i);}));
  el.querySelectorAll('[data-sec]').forEach(b=>b.addEventListener('click',()=>{state.view='section';selectStructure(+b.dataset.sec);}));
  el.querySelectorAll('[data-top]').forEach(b=>b.addEventListener('click',()=>{const i=+b.dataset.top;state.sel=i;setView('lens');selectStructure(i);}));
  updateVisibility();}

function bindPanel(){const P=$('panelInner');
  P.querySelectorAll('[data-openhist]').forEach(b=>b.addEventListener('click',()=>{HS.sel=-1;setView('hist');}));
  P.querySelectorAll('[data-tab]').forEach(b=>b.addEventListener('click',()=>{const t=b.dataset.tab;if(t===state.atlasTab)return;state.atlasTab=t;if(t==='hist'){if(state.view!=='hist')setView('hist');renderPanel();}else{if(state.view==='hist')setView('orbit');renderPanel();}}));
  P.querySelectorAll('[data-go]').forEach(b=>b.addEventListener('click',()=>goChapter(+b.dataset.go)));
  P.querySelectorAll('[data-case]').forEach(b=>b.addEventListener('click',()=>setCase(b.dataset.case)));
  P.querySelectorAll('[data-layer]').forEach(b=>b.addEventListener('click',()=>selectLayer(b.dataset.layer)));
  P.querySelectorAll('[data-jump]').forEach(b=>b.addEventListener('click',()=>{const[c,s]=b.dataset.jump.split('|');state.chapter!==5&&goChapter(5);
    const go=()=>{const i=L.structures.findIndex(x=>x.sid===s);if(i>=0){if(state.mode!==2)setMode(2);selectStructure(i);}};if(state.caseId!==c)setCase(c,go);else go();}));
  const de=$('devEx');if(de)de.addEventListener('input',()=>{state.devExplT=de.value/100;$('devExV').textContent=de.value+'%';});
  const lam=$('lam');if(lam)lam.addEventListener('input',()=>{state.lambda=+lam.value;PH.lambda=state.lambda;updateLamUI();updateVisibility();clearPhotons();clearTimeout(lamT);lamT=setTimeout(()=>{warmStats(state.mode,1400);updateStats();},140);});
  const pd=$('pd');if(pd)pd.addEventListener('input',()=>{probeD=0.005*Math.pow(1.4/0.005,pd.value/100);placeProbe();buildAbsorbers();showTexture(true);updateProbeUI();});
  const pe=$('peel');if(pe)pe.addEventListener('input',()=>{const v=+pe.value;const mm=v<1?0:0.005*Math.pow(2.6/0.005,v/100);setPeel(mm);$('peelV').textContent=mm?fmtDepth(mm):t('c4.none');
    if(state.view==='layers'||state.view==='lens'){state.view='peel';state.explodeT=0;const P=VIEWS.peel;flyTo(P.t,P.az,P.el,fitDist('peel'));updateDock();updateVisibility();}});
  renderModeCards();}
function updateLamUI(){const l=state.lambda,el=$('lamV');if(!el)return;el.textContent=l+' nm'+(l>760?t('c3.nir'):'');
  $('kvS').textContent=nf((musp(l)/musp(530)).toFixed(2))+'×';$('kvM').textContent=nf((melA(l)/melA(530)).toFixed(2))+'×';$('kvH').textContent=nf((hb(l)/hb(530)).toFixed(2))+'×';}
function updateProbeUI(){const el=$('pdV');if(!el)return;el.textContent=fmtDepth(probeD);const m=state.mode,v=clamp(V(m,probeD)*1.9)*0.96;
  const base=MODEP[m].base,c=mix3(base,m===3?NAVY:pigColor(probeD),v);$('sw').style.background=rgbStr(c);
  $('swT').textContent=t(v<0.12?'sw.none':m===3?'sw.dark':probeD<0.03?'sw.black':probeD<0.13?'sw.brown':probeD<0.32?'sw.grey':'sw.blue');$('swL').textContent=layerName(probeD);}
function refreshPanelLive(){renderModeCards();const ak=$('anaKV');if(ak)ak.innerHTML=state.mode===2?`<dt>${t('ana.rej')}</dt><dd id="anaV">–</dd>`:`<dt>${t('ana.k')}</dt><dd>${t('ana.v')}</dd>`;updateStats();if(state.chapter===3)updateProbeUI();}
function updateStats(){const S=PH.stats;const el=$('originBars');if(el&&S){const det=Math.max(1,S.det);
    for(const k of['glare','sc','epi','pap','ret']){const f=S[k]/det;const bar=el.querySelector(`[data-k="${k}"]`),v=el.querySelector(`[data-v="${k}"]`);if(bar)bar.style.width=(f*100).toFixed(1)+'%';if(v)v.textContent=Math.round(f*100)+'%';}}
  const av=$('anaV');if(av&&S)av.textContent=Math.round(S.blocked/Math.max(1,S.blocked+S.det)*100)+'%';
  const p5=$('kvP50');if(p5&&S){p5.textContent=fmtDepth(percentile(S.depths,0.5));$('kvP90').textContent=fmtDepth(percentile(S.depths,0.9));}}
PH.onStory=s=>{const el=$('story');if(el)el.innerHTML=s;};

/* ---------------- language ---------------- */
function applyStatic(){document.documentElement.lang=LANG;
  document.querySelectorAll('[data-i18n]').forEach(el=>{el.textContent=t(el.dataset.i18n);});
  document.querySelectorAll('[data-i18n-title]').forEach(el=>{el.title=t(el.dataset.i18nTitle);});
  $('panelGrip').textContent=t($('panel').classList.contains('min')?'grip.show':'grip.hide');
  if(matchMedia('(pointer: coarse)').matches)$('hint').textContent=t('hint.touch');}
function setLang(l){if(l===LANG)return;LANG=l;try{localStorage.setItem('btl-lang',l);}catch(e){}
  if(!AUD.on)appPost('lang',{lang:l});
  applyStatic();buildNav();fillCaseSel();buildStaticLabels();buildPins();if(EV.on){evoBuildBar();buildEvoMarks();showTexture(true);}renderPanel();updateVisibility();lensR=0;
  if(HS.S){pickPins();HS.dirty=true;$('hzV').textContent=hzLab(HS.z);}renderHistLists();if(HS.on)histLayout();}

/* ---------------- dock ---------------- */
function updateDock(){document.querySelectorAll('#modeSeg button').forEach(b=>b.classList.toggle('on',+b.dataset.m===state.mode));
  document.querySelectorAll('#viewSeg button').forEach(b=>b.classList.toggle('on',b.dataset.v===state.view));
  const t=$('photonTog');t.classList.toggle('on',PH.on);t.setAttribute('aria-pressed',String(PH.on));}
document.querySelectorAll('#modeSeg button').forEach(b=>b.addEventListener('click',()=>setMode(+b.dataset.m)));
document.querySelectorAll('#viewSeg button').forEach(b=>b.addEventListener('click',()=>{if(state.chapter===0&&b.dataset.v!=='lens'){goChapter(2);}setView(b.dataset.v);}));
$('photonTog').addEventListener('click',()=>{if(state.chapter===0){goChapter(2);return;}if(!PH.on&&(state.view==='lens'||state.view==='layers'||state.view==='hist'))setView('section');setPhotons(!PH.on);});
$('fsBtn').addEventListener('click',()=>{const d=document;try{if(d.fullscreenElement)d.exitFullscreen();else{const p=d.documentElement.requestFullscreen&&d.documentElement.requestFullscreen();if(p&&p.catch)p.catch(()=>{});}}catch(e){}});
/* no Fullscreen API (iPhone Safari, or a frame without allow="fullscreen"): the button would do nothing, so hide it */
if(!document.fullscreenEnabled)$('fsBtn').hidden=true;
function fillCaseSel(){if(isEvoCh(state.chapter)&&typeof EV!=='undefined'&&EV.on){$('caseSel').innerHTML=evoList().map(s=>`<option value="${s}">${ev(EVO_SHORT[s])}</option>`).join('');$('caseSel').value=EV.seq;return;}
  $('caseSel').innerHTML=CASE_ORDER.map(id=>`<option value="${id}">${caseName(id)}</option>`).join('');$('caseSel').value=state.caseId;}
fillCaseSel();
$('caseSel').addEventListener('change',e=>{if(isEvoCh(state.chapter))evoSetSeq(e.target.value);else setCase(e.target.value);});
function setNotesMin(on){$('panel').classList.toggle('min',on);$('panelGrip').textContent=t(on?'grip.show':'grip.hide');setTimeout(resize,30);}
$('panelGrip').addEventListener('click',()=>{if(typeof HS!=='undefined')HS.autoMin=false;setNotesMin(!$('panel').classList.contains('min'));});
window.addEventListener('keydown',e=>{if(AUD.on||e.target&&(e.target.tagName==='INPUT'||e.target.tagName==='SELECT'))return;const n=+e.key;if(n>=1&&n<=8)goChapter(n-1);});

/* ---------------- loop ---------------- */
function resize(){const w=innerWidth,h=innerHeight;
  /* phones in portrait: the notes sheet sits right above the dock, whose height depends on how its controls wrap */
  if(!AUD.on&&layoutMode()==='mob')document.documentElement.style.setProperty('--dock-h',Math.ceil($('dockIn').offsetHeight)+'px');else document.documentElement.style.removeProperty('--dock-h');
  $('panel').style.maxHeight=''; // evoLayout() caps it again on phones while the evolution bar is shown
  renderer.setSize(w,h,false);camera.aspect=w/h;if(typeof evoLayout==='function')evoLayout();applyOffset();
  /* on phones and tablets in portrait the free area changes with the notes sheet: keep the model fitted unless the user moved the camera */
  if(cam.fit&&!AUD.on&&layoutMode()!=='desk'){const d=cam.fit==='lens'?lensDist():fitDist(cam.fit);if(cam.tw)cam.tw.to.dist=d;else cam.dist=d;}
  headMat.uniforms.uScale.value=renderer.getPixelRatio()*h/(2*Math.tan(THREE.MathUtils.degToRad(camera.fov/2)));lensR=0;
  if(state.view==='lens'&&!cam.tw)cam.dist=lensDist();histLayout();if(AUD.on&&AUD.lastCam)audCam(AUD.lastCam);}
window.addEventListener('resize',resize);
let last=performance.now(),statT=0,lightK=1;
function frame(now){const dt=Math.min(0.05,(now-last)/1000);last=now;
  try{if(AUD.on)cam.tw=null;stepCam(dt);applyCam();
    state.explode+=(state.explodeT-state.explode)*Math.min(1,dt*(REDUCED?60:4.5));for(const k of LKEYS)LG[k].position.y=EXPL[k]*state.explode;
    state.devExpl+=(state.devExplT-state.devExpl)*Math.min(1,dt*(REDUCED?60:4.5));layoutDevice(state.devExpl);
    evoStep(dt);stepFade(dt);applyHighlight(now/1000);evoFrame(now);
    const dimT=PH.visible?0.34:1;lightK+=(dimT-lightK)*Math.min(1,dt*3);hemiL.intensity=1.45*lightK;keyL.intensity=2.2*lightK;rimL.intensity=0.9*lightK;fillL.intensity=0.6*lightK;
    topMat.emissiveIntensity=(state.view==='lens'?1:0.6)*(0.3+0.7*lightK);CAPK.value=0.3+0.7*lightK;cutMat.opacity=0.2+0.2*lightK;
    const pz=0.6+0.4*Math.sin(now/260);markMat.opacity=0.55+0.4*pz;
    if(PH.visible||PH.list.length)updatePhotons(dt);
    statT-=dt;if(statT<=0){statT=0.5;updateStats();}
    presTick();updateLabels();updateLens();if(state.view==='hist'){if(HS.dirty)drawSlide();}else renderer.render(scene,camera);}
  catch(e){showErr(e.message);console.error(e);return;}
  requestAnimationFrame(frame);}

function boot(){try{applyStatic();buildGMap();buildNav();resize();
    const hashCh=CH.findIndex(c=>'#'+c.key===location.hash);
    curE=getModel('melanoma');L=curE.L;buildTissue();buildDGrid();buildAbsorbers();showTexture(true);buildPins();
    state.chapter=-1;goChapter(hashCh>=0?hashCh:0);updateDock();resize();
    const P=VIEWS[state.view]||VIEWS.orbit;cam.t.set(...P.t);cam.az=P.az+0.9;cam.el=P.el+0.25;cam.dist=(P.dist||14)*1.35;flyTo(P.t,P.az,P.el,state.view==='lens'?lensDist():fitDist(state.view),2.2);if(VIEWS[state.view])cam.fit=state.view;
    $('loading').className='gone';requestAnimationFrame(frame);}
  catch(e){showErr(e.message);console.error(e);BOOT_FAILED=true;}}

/* =====================================================================
   Virtual H&E section. Built from the same lesion model as the 3D block,
   at true proportions (µm), through the plane z = HS.z. Cells are drawn
   as vector primitives, so zooming re-renders them sharply.
   ===================================================================== */
const HC={glass:'#F4EEF1',sub:'#FBF4F7',ret:'#F7D6E3',pap:'#F5CBDB',epi:'#EDB2CB',scCompact:'#E690B6',keratin:'#EE9EC1',sulcus:'#EFA9C7',crust:'#EFB29E',bm:'#D47DAA'};
/* drawing groups: [key, type, colour, line width, clip] — clip 'd' keeps a group inside the dermis (below the
   basement membrane), 't' inside tissue (below the surface) */
const GDEF=[
  ['fibrin','L','#F0B9C8',5],['crustN','C','#3A2268'],['rbcX','C','#D6334F'],
  ['scStrand','Q','#E6A0C0',1.7],['scLam','L','#DB7EA8',1],['para','E','#4A2B6E'],
  ['papFib','L','#EAA5C2',1.1,'d'],
  ['retB6','Q','#EDA9C7',8,'d'],['retB10','Q','#EAA1C2',13,'d'],['retB16','Q','#E799BD',19,'d'],['retB22','Q','#E493B9',26,'d'],['retX','E','#E697BB',1,'d'],
  ['dfP','P','#F1C4D7',1,'d'],['sclP','P','#EEB0CB',1,'d'],['sclB','Q','#E590B7',15,'d'],['fatW','E','#FBF5F8',1,'d'],['fatR','R','#E2A0BD',1.4,'d'],['hyalP','P','#EC9BBF',1,'d'],
  ['dfBase','E','#F1C3D6',1,'d'],['hyal','E','#EC9BBF',1,'d'],['hyalL','L','#DE80AA',2,'d'],['collBall','E','#E37DAB',1,'d'],
  ['elastB','E','#D6CCE1',1,'d'],['elast','Q','#A395BF',2.4,'d'],
  ['sept','L','#E08EB2',7,'d'],['fatM','R','#E2A0BD',1.6,'d'],
  ['bStroma','E','#EFBCD2',1,'d'],['muc','E','#DCD3E6',1,'d'],['cleft','E','#FBF7F9',1,'d'],['nestBody','E','#E2B5CB',1,'t'],['mnodP','P','#E4BACD',1,'t'],['bccCyto','E','#B996CA',1,'t'],['sccCyto','E','#EFA2C3',1,'t'],['sccCell','E','#F2B3CE',1,'t'],
  ['pearl','E','#EE7DAD',1,'t'],['pearlL','R','#D95892',1.5,'t'],
  ['ors','E','#E8B0CA',1,'t'],['horn','E','#F5C4D8',1,'t'],['hornL','R','#E28DB4',1.2,'t'],['hair','E','#C9A062'],['bulbP','E','#F4D2DF'],['seb','E','#F8E8EF'],['sebV','R','#E8C3D5',0.9],['eccr','E','#E39BC0',1,'d'],['eccrL','E','#FBF4F7',1,'d'],
    ['melCyto','E','#EDCBDA'],['cellM','E','#E3B8CC',1,'t'],['melPhC','E','#B7876A',1,'d'],['dysk','E','#E6649A'],
  ['mel','C','#76492A'],['melC','C','#4C2D18'],['dend','E','#4A2C17',1,'d'],
  ['vWall','E','#DF7EA7',1,'d'],['lumen','E','#FCF6F8',1,'t'],['rbc','C','#D6334F',1,'d'],
  ['nuc','E','#5B3B8D'],['nucB','E','#4B2E80'],['nucD','E','#3D2672'],['nucS','E','#553890'],['nucV','E','#6C4F9E'],['gran','C','#46286F'],['fib','E','#50327F',1,'d'],['endo','E','#5A3A86',1,'d'],['lym','C','#2E1B59',1,'d'],['neut','C','#3B2369'],['mit','E','#25104B'],['apo','C','#2B124F'],
  ['nucleolus','C','#B02F5F']];
const CASE_STYLE={melanoma:'mm',nevus:'nv',bluenevus:'bn',bcc:'bc',bowen:'bw',scc:'sq',sk:'sk',df:'df',plain:'n'};
const zs=sid=>Lm=>{const f=Lm.features.find(f=>f.sid===sid);if(!f)return 0;if(f.z!=null)return f.z;return f.pts[Math.floor(f.pts.length/2)][2];};
const zFol=Lm=>{const f=Lm.features.find(f=>f.t==='follicle'&&!f.wc);return f?f.z:0;};
const H_NORMAL=[
  {a:'sc',n:'Stratum corneum',d:'Anucleate keratin in loose basket-weave layers. Its boundary with air is what causes glare.'},
  {a:'granular',n:'Granular layer',d:'One to three rows of flattened cells with purple keratohyalin granules, just under the keratin.'},
  {a:'spinous',n:'Spinous layer',d:'Polygonal keratinocytes with pink cytoplasm and round nuclei, flattening as they rise.'},
  {a:'basal',n:'Basal layer and melanin caps',d:'Basal keratinocytes hold melanin as brown caps above their nuclei. Along the rete ridges this is the pigment network.',m:'net'},
  {a:'rete',n:'Rete ridge',d:'A downward fold of epidermis. Pigmented ridges seen from above are the lines of the network.',m:'net'},
  {a:'papilla',n:'Dermal papilla with capillary loop',d:'Dermis rising between ridges. Its thin epidermal roof is a hole of the network; its capillary loop, seen end-on from above, is a dotted vessel.'},
  {a:'plexus',n:'Superficial vascular plexus',d:'Horizontal vessels at the papillary–reticular border that feed the loops above.'},
  {a:'retdermis',n:'Reticular dermis',d:'Thick, wavy collagen bundles with few cells.'},
  {a:'follicle',n:'Hair follicle',d:'Epithelial sheath around the hair shaft, ending in the bulb deep in the dermis.',z:zFol},
  {a:'sebaceous',n:'Sebaceous lobules',d:'Pale, bubbly lipid-filled cells opening into the follicle.',z:zFol},
  {a:'eccrine',n:'Eccrine coil',d:'Sweat-gland tubules deep in the dermis.'},
  {a:'fat',n:'Subcutaneous fat',d:'Adipocytes emptied by tissue processing: only membranes and septa remain.'}];
const H_CASE={
  melanoma:[
    {a:'lentig',n:'Lentiginous melanocytes',d:'Single atypical melanocytes crowd the basal layer, each in a clear halo.',m:'net'},
    {a:'pagetoid',n:'Pagetoid spread',d:'Atypical melanocytes scattered singly up through the epidermis. Pigment carried this high shows as black dots.',m:'globules'},
    {a:'jnest',n:'Irregular junctional nests',d:'Nests of different size and spacing along the junction, not confined to ridge tips. Confluent at the edge, they make streaks.',m:'streaks',z:zs('streaks')},
    {a:'dermal',n:'Dermal invasion and melanophages',d:'Tumour cells and pigment-laden macrophages in the papillary dermis: the source of the blue.',m:'veil',z:zs('veil')},
    {a:'orthok',n:'Compact orthokeratosis',d:'Dense keratin over the pigmented area: the white haze of the veil.',m:'veil',z:zs('veil')},
    {a:'regress',n:'Regression',d:'Fibrosis with lymphocytes and melanophages. The rete ridges are flattened, so the network disappears.',m:'regr',z:zs('regr')},
    {a:'neo',n:'New vessels',d:'Irregular capillaries in the papillary dermis.',m:'vessels'}],
  nevus:[
    {a:'jnest',n:'Junctional nests at rete tips',d:'Round, evenly spaced nests where the ridges end.',m:'glob'},
    {a:'basalL',n:'Pigmented basal layer',d:'Evenly pigmented basal cells along regular ridges: the typical network.',m:'net'},
    {a:'maturation',n:'Maturation with depth',d:'Dermal nevus cells get smaller and lose pigment as they go deeper.',m:'dermal'}],
  bluenevus:[
    {a:'dendritic',n:'Pigmented dendritic melanocytes',d:'Elongated, heavily pigmented cells between collagen bundles of the mid and deep dermis.',m:'blue'},
    {a:'sclerosis',n:'Melanophages in sclerotic collagen',d:'Pigment-laden macrophages among thickened collagen around the melanocytes.',m:'blue'},
    {a:'basalL',n:'Uninvolved epidermis',d:'Normal junction and epidermis over the lesion.',m:'net'}],
  bcc:[
    {a:'palisade',n:'Peripheral palisading',d:'Nuclei at the edge of each basaloid nest line up side by side.',m:'nodule'},
    {a:'cleft',n:'Retraction cleft',d:'A gap between the tumour nests and the stroma, a hallmark of BCC.',m:'nodule'},
    {a:'stroma',n:'Fibromyxoid stroma',d:'Tumour stroma around the nests. Its collagen gives the shiny white areas in polarized light.',m:'shiny'},
    {a:'pignest',n:'Pigmented nest',d:'Melanin inside tumour nests and melanophages around them: blue-grey ovoid nests.',m:'ovoid',z:zs('ovoid')},
    {a:'vessel',n:'Dilated superficial vessel',d:'Large vessels running flat just under the thinned epidermis: arborizing vessels.',m:'arbor',z:zs('arbor')},
    {a:'ulcer',n:'Ulceration',d:'Epidermis lost and covered by serum, fibrin, neutrophils and blood.',m:'ulcer',z:zs('ulcer')},
    {a:'epiL',n:'Thinned epidermis',d:'Stretched flat over the nodule with no rete ridges: no network.',m:'net'}],
  bowen:[
    {a:'epiL',n:'Full-thickness atypia',d:'Crowded, pleomorphic keratinocytes without maturation from base to surface.',m:'net'},
    {a:'dysk',n:'Dyskeratotic cell',d:'A single keratinocyte keratinizing early: bright pink with a shrunken nucleus.'},
    {a:'mitosis',n:'Mitosis above the basal layer',d:'Dividing cells high in the epidermis, a sign of atypia.'},
    {a:'para',n:'Parakeratosis',d:'Keratin that still holds flattened nuclei: the scale.',m:'scale'},
    {a:'glomvessels',n:'Tortuous papillary capillaries',d:'One coiled capillary cut several times inside a papilla: the glomerular vessels.',m:'glom',z:zs('glom')},
    {a:'basalL',n:'Intact basement membrane',d:'No invasion into the dermis: this is carcinoma in situ.'}],
  scc:[
    {a:'keratin',n:'Keratin crust',d:'Thick ortho- and parakeratin produced by the tumour.',m:'ker'},
    {a:'blood',n:'Haemorrhage in the crust',d:'Red cells trapped in keratin.',m:'blood',z:zs('blood')},
    {a:'infund',n:'Acanthotic follicular infundibulum',d:'Thickened, keratinizing epithelium around a follicle opening: a white circle.',m:'wc',z:zs('wc')},
    {a:'invasive',n:'Invasive squamous nests',d:'Atypical keratinocytes with glassy pink cytoplasm invading the dermis, rimmed by lymphocytes.',m:'lobules'},
    {a:'pearl',n:'Keratin pearl',d:'Concentric keratinization inside a nest.',m:'lobules'},
    {a:'hairpinv',n:'Papillary vessels',d:'Elongated capillaries between the tumour lobules: hairpin vessels.',m:'hairpin',z:zs('hairpin')}],
  sk:[
    {a:'horncyst',n:'Horn pseudocyst',d:'A ball of laminated keratin inside the epidermis: a milia-like cyst.',m:'milia',z:zs('milia')},
    {a:'invag',n:'Keratin-filled invagination',d:'A keratin plug open to the surface, oxidized at the top: a comedo-like opening.',m:'comedo',z:zs('comedo')},
    {a:'epiL',n:'Basaloid keratinocytes',d:'Small uniform cells with little cytoplasm; melanin scattered among them gives the brown colour.'},
    {a:'scL',n:'Papillomatosis and hyperkeratosis',d:'A folded surface with keratin collecting in the clefts: fissures and ridges.',m:'gyri'},
    {a:'basalL',n:'Flat base',d:'The proliferation rests on a flat line level with the neighbouring epidermis (string sign).',m:'border'},
    {a:'hairpinv',n:'Vessels in papillae',d:'Capillary loops in papillae surrounded by keratinocytes: hairpin vessels with a white halo.',m:'hairpin',z:zs('hairpin')}],
  df:[
    {a:'basalL',n:'Basal hyperpigmentation',d:'Broad, flat, pigmented rete ridges over the lesion ("dirty fingers"): the delicate network.',m:'net'},
    {a:'grenz',n:'Grenz zone',d:'A thin band of uninvolved papillary dermis under the epidermis.'},
    {a:'fibrosis',n:'Superficial fibrosis',d:'Dense collagen under the epidermis: the central white patch.',m:'patch'},
    {a:'storiform',n:'Storiform spindle cells',d:'Fibroblast-like and histiocytic cells in short whorls.',m:'fibro'},
    {a:'trapping',n:'Collagen trapping',d:'Thick collagen bundles wrapped by spindle cells at the edge of the lesion.',m:'fibro'}],
  plain:[]};
const NORMAL_TAGS=new Set(H_NORMAL.map(h=>h.a));
const HS={on:false,z:0,S:null,bmp:null,s:0.1,ox:0,oy:0,dirty:true,sel:-1,items:[],SR:null,STR:null,BAR:null,dpr:1,fitted:false,key:''};

const hzLab=v=>{const k=L&&L.mmU||1;return nf((v>=0?'+':'')+(v*k).toFixed(2))+' mm';};
function buildSlide(){if(L&&L.kind==='nail')return buildNailSlide();
  const Lm=L,zc=HS.z,cid=Lm.hcase||Lm.id,st0=Lm.hstyle||CASE_STYLE[cid]||'n';const lmL=Lm.lmLvl||0;
  const rng=mulberry32((Lm.seed*7919+Math.round(zc*1000)*31+17)|0);
  const N=1000,NX=N+1,X=i=>i*8,xm=i=>-4+i*0.008;
  const EL=new Float32Array(NX);let emax=-1e9;
  for(let i=0;i<NX;i++){EL[i]=Lm.elevAt(xm(i),zc)/0.85;if(EL[i]>emax)emax=EL[i];}
  const top0=(emax+0.09)*1000;
  const mk=()=>new Float32Array(NX);
  const yS=mk(),yC=mk(),yD=mk(),yP=mk(),yR=mk(),RR=mk(),PG=mk(),UL=mk(),KR=mk(),GY=mk();
  for(let i=0;i<NX;i++){const x=xm(i),D=Lm.depths(x,zc),s=top0-EL[i]*1000;yS[i]=s;yC[i]=s+D.sc*1000;yD[i]=s+D.dej*1000;yP[i]=s+D.pap*1000;yR[i]=s+2400;
    RR[i]=D.r;PG[i]=D.pigA;UL[i]=Lm.ulcer(x,zc,D.r);KR[i]=Lm.ker(x,zc,D.r);GY[i]=Lm.gyri(x,zc,D.r);
    yP[i]=Math.max(yD[i]+30,yP[i]+(vnoise(i*0.016,zc*2+1,61)-0.5)*70);}
  /* round off papilla tips (DEJ) and keep the papillary/reticular border a gentle curve */
  const smooth=(A,k)=>{const o=mk();for(let i=0;i<NX;i++){let s=0,c=0;for(let j=Math.max(0,i-k);j<=Math.min(N,i+k);j++){s+=A[j];c++;}o[i]=s/c;}return o;};
  {const d=smooth(yD,3);for(let i=0;i<NX;i++)yD[i]=Math.max(yC[i]+12,d[i]);}
  if(st0==='sk'){ /* seborrhoeic keratosis: flat base ("string sign") — keratin-filled crypts do not push the base down */
    const e=mk();for(let i=0;i<NX;i++){let m=1e9;for(let j=Math.max(0,i-30);j<=Math.min(N,i+30);j++)m=Math.min(m,yD[j]);e[i]=m;}
    const es=smooth(e,20);for(let i=0;i<NX;i++)if(RR[i]<1.05)yD[i]=Math.max(yC[i]+40,Math.min(yD[i],es[i]));}
  if(st0==='sl'){const ph=rng()*200;for(let i=0;i<NX;i++){if(RR[i]>=1)continue;const x=X(i),per=105,u=(((x+ph+60*vnoise(x/300,zc*3+2,5))%per)+per)%per/per,b=1-smoothstep(0.05,0.2,Math.abs(u-0.5));
    yD[i]+=b*(50+25*vnoise(x/140,zc,9))*clamp((1-RR[i])*4,0,1);}const d=smooth(yD,2);for(let i=0;i<NX;i++)yD[i]=d[i];}
  {const p=smooth(yP,22);for(let i=0;i<NX;i++)yP[i]=Math.max(yD[i]+30,p[i]);}
  const W=8000,H=top0+3000;
  const at=(A,x)=>{const f=Math.min(N-1e-6,Math.max(0,x/8)),i=f|0,t=f-i;return A[i]+(A[i+1]-A[i])*t;};
  const U=xmm=>(xmm+4)*1000,P=(xmm,d)=>[U(xmm),at(yS,U(xmm))+d*1000],rho=xmm=>Lm.R(xmm,zc);
  const G={},groups=GDEF.map(([k,t,c,lw,cl])=>(G[k]={k,t,c,lw:lw||1,cl:cl||null,a:[]}));
  const E=(g,x,y,rx,ry,rot)=>{G[g].a.push(x,y,rx,ry,rot||0);},C=(g,x,y,r)=>{G[g].a.push(x,y,r);};
  const Pg=(g,p)=>{G[g].a.push(p);};
  /* irregular blob outline (for fibrosis / scar / fibrous tumours) — bnd(a) gives the radius factor */
  const blob=(cx,cy,rx,ry,sd,amp)=>{const bnd=a=>1-amp/2+amp*vnoise(Math.cos(a)*2.2+sd,Math.sin(a)*2.2,23+sd);const p=new Path2D();for(let k=0;k<=96;k++){const a=k/96*TAU,s2=bnd(a),qx=cx+Math.cos(a)*rx*s2,qy=cy+Math.sin(a)*ry*s2;k?p.lineTo(qx,qy):p.moveTo(qx,qy);}p.closePath();return{p,in:(x,y,m)=>Math.hypot((x-cx)/rx,(y-cy)/ry)<bnd(Math.atan2((y-cy)/ry,(x-cx)/rx))*(m||1)};};
  const Ln=(g,x1,y1,x2,y2)=>{G[g].a.push(x1,y1,x2,y2);},Q=(g,x1,y1,cx,cy,x2,y2)=>{G[g].a.push(x1,y1,cx,cy,x2,y2);};
  const sebCells=(lx,ly,rx,ry)=>{for(let y=-ry+8;y<ry-6;y+=12)for(let x=-rx+8;x<rx-6;x+=13){const px=lx+x+((Math.round(y/12)&1)?6:0),py=ly+y;if(((px-lx)/(rx-6))**2+((py-ly)/(ry-6))**2>1)continue;C('sebV',px,py,6);if(rng()<0.6)E('nucS',px,py,1.8,1.7,0);}
    const n=Math.round((rx+ry)*0.45);for(let v=0;v<n;v++){const a=v/n*TAU;E('nucB',lx+Math.cos(a)*(rx-3),ly+Math.sin(a)*(ry-3),2.2,1.4,a);}};
  const A={},anc=(t,x,y,r)=>{const l=A[t]||(A[t]=[]);if(l.length<80)l.push({x,y,r});};
  const EX=[],exl=(x,y)=>{for(const e of EX){const dx=x-e.x,dy=y-e.y;if(dx*dx+dy*dy<e.r*e.r)return true;}return false;};
  const band=(T,B,i0,i1)=>{const p=new Path2D();p.moveTo(X(i0),T[i0]);for(let i=i0+1;i<=i1;i++)p.lineTo(X(i),T[i]);for(let i=i1;i>=i0;i--)p.lineTo(X(i),B[i]);p.closePath();return p;};
  const ivals=pred=>{const o=[];let s=-1;for(let i=0;i<=N;i++){const v=pred(i);if(v&&s<0)s=i;if(s>=0&&(!v||i===N)){const e=v?i:i-1;if(e>s)o.push([s,e]);s=-1;}}return o;};
  const yB=mk().fill(H);const full=new Path2D();full.rect(0,0,W,H);
  const regions=[{p:full,c:HC.glass},{p:band(yR,yB,0,N),c:HC.sub},{p:band(yP,yR,0,N),c:HC.ret},{p:band(yD,yP,0,N),c:HC.pap},{p:band(yC,yD,0,N),c:HC.epi}];
  const tint={bw:'#E7A1C4',sq:'#EDA0C2',sk:'#DCA3CC'}[st0];
  if(tint)for(const[a,b]of ivals(i=>RR[i]<1&&UL[i]<0.3))regions.push({p:band(yC,yD,a,b),c:tint});
  const bcol={sl:'#C79C86',df:'#D2A898'}[st0];
  if(bcol){const T=mk();for(let i=0;i<NX;i++)T[i]=Math.max(yC[i]+4,yD[i]-7.5);for(const[a,b]of ivals(i=>RR[i]<1&&UL[i]<0.3))regions.push({p:band(T,yD,a,b),c:bcol});}
  const lam=(a,b,step)=>{for(let x=X(a);x<X(b);x+=16+rng()*8){const ys=at(yS,x),yc=at(yC,x);for(let y=ys+2;y<yc-2;y+=step)if(rng()<0.8)Ln('scLam',x,y+(rng()-0.5)*2,x+14+rng()*16,y+(rng()-0.5)*2);}};
  const paraIn=(a,b,dens)=>{for(let x=X(a);x<X(b);x+=12){const ys=at(yS,x),yc=at(yC,x);for(let y=ys+3;y<yc-2;y+=8)if(rng()<dens)E('para',x+rng()*8,y,2.5,0.9,(rng()-0.5)*0.3);}};
  const mid=(a,b)=>(a+b)>>1;
  if(st0==='mm')for(const[a,b]of ivals(i=>RR[i]<1&&yC[i]-yS[i]>30)){regions.push({p:band(yS,yC,a,b),c:HC.scCompact});lam(a,b,4);const m=mid(a,b);anc('orthok',X(m),(yS[m]+yC[m])/2,RR[m]);}
  if(st0==='sq')for(const[a,b]of ivals(i=>KR[i]>0.3)){regions.push({p:band(yS,yC,a,b),c:HC.keratin});lam(a,b,5);paraIn(a,b,0.25);const m=mid(a,b);anc('keratin',X(m),(yS[m]+yC[m])/2,RR[m]);}
  if(st0==='bw')for(const[a,b]of ivals(i=>KR[i]>0.22)){regions.push({p:band(yS,yC,a,b),c:'#EDA9C8'});lam(a,b,5);paraIn(a,b,0.5);const m=mid(a,b);anc('para',X(m),(yS[m]+yC[m])/2,RR[m]);}
  if(st0==='sk')for(const[a,b]of ivals(i=>GY[i]>0.2)){regions.push({p:band(yS,yC,a,b),c:HC.sulcus});lam(a,b,5);}
  for(const[a,b]of ivals(i=>UL[i]>0.3)){const T=mk(),Bt=mk();for(let i=a;i<=b;i++){T[i]=yS[i]-50*UL[i];Bt[i]=yS[i]+14;}regions.push({p:band(T,Bt,a,b),c:HC.crust});
    for(let x=X(a);x<X(b);x+=6)for(let k=0;k<3;k++){const y=lerp(at(T,x),at(yS,x)+10,rng()),u=rng();if(u<0.35)C('crustN',x+rng()*6,y,1.6);else if(u<0.55)C('rbcX',x+rng()*6,y,3.2);else if(u<0.7)Ln('fibrin',x,y,x+8+rng()*14,y+(rng()-0.5)*4);}
    const m=mid(a,b);anc('ulcer',X(m),yS[m]-15,RR[m]);}
  const dermP=new Path2D(),tisP=new Path2D();dermP.moveTo(0,H+20);tisP.moveTo(0,H+20);for(let i=0;i<=N;i++){dermP.lineTo(X(i),UL[i]>0.3?yS[i]:yD[i]+0.8);tisP.lineTo(X(i),yS[i]-0.5);}
  dermP.lineTo(W,H+20);dermP.closePath();tisP.lineTo(W,H+20);tisP.closePath();
  const bm=new Path2D();{let pen=false;for(let i=0;i<=N;i++){if(yD[i]-yC[i]>5&&UL[i]<0.3){pen?bm.lineTo(X(i),yD[i]):bm.moveTo(X(i),yD[i]);pen=true;}else pen=false;}}

  /* cell builders */
  const melano=(x,y,atyp,pig)=>{E('melCyto',x,y,atyp?6.6:5.4,atyp?6:4.9,rng());if(atyp){E('nucD',x,y,3.7+rng()*1.3,3.1+rng()*1.1,rng()*3);C('nucleolus',x+(rng()-0.5)*1.6,y+(rng()-0.5)*1.6,0.95);}else E('nuc',x,y,2.9,2.6,rng()*3);
    const g=Math.round(pig*(2+6*rng()));for(let k=0;k<g;k++)C('mel',x+(rng()-0.5)*10,y+(rng()-0.5)*9,0.85);};
  const melPh=(x,y)=>{E('melPhC',x,y,8+rng()*2.5,6.2+rng()*1.8,rng()*3);for(let g=0;g<16;g++){const a=rng()*TAU,q=Math.sqrt(rng())*6.2;C('melC',x+Math.cos(a)*q*1.15,y+Math.sin(a)*q*0.85,1.0+rng()*0.9);}E('nucS',x+(rng()-0.5)*6,y+(rng()-0.5)*3,2.1,1.8,0);};
  /* a nest: cohesive cells in amphophilic cytoplasm, with a thin retraction cleft on its dermal side */
  const nestCells=(cx,cy,rx,ry,atyp,pig)=>{E('cleft',cx,cy,rx+3.5,ry+3,0);E('nestBody',cx,cy,rx+0.5,ry+0.5,0);const st=atyp?11.5:9.2;
    for(let yy=-ry;yy<=ry;yy+=st*0.9)for(let xx=-rx;xx<=rx;xx+=st){const px=xx+((Math.round(yy/st)&1)?st/2:0);if(px*px/(rx*rx)+yy*yy/(ry*ry)>0.86)continue;const x=cx+px+(rng()-0.5)*2.5,y=cy+yy+(rng()-0.5)*2.5;
      if(atyp){E('melCyto',x,y,5.6,5,rng());E('nucD',x,y,3.4+rng()*1.4,2.9+rng()*1.1,rng()*3);C('nucleolus',x+(rng()-0.5)*1.4,y+(rng()-0.5)*1.4,0.9);}else E('nuc',x,y,2.7+rng()*0.3,2.5,rng()*3);
      const g=Math.round(pig*(1+5*rng()));for(let k=0;k<g;k++)C('mel',x+(rng()-0.5)*9,y+(rng()-0.5)*8,0.85);}
    if(rx>ry){for(let xx=cx-rx+ry;xx<=cx+rx-ry+0.1;xx+=Math.max(4,ry*0.5))EX.push({x:xx,y:cy,r:ry+5});}else EX.push({x:cx,y:cy,r:Math.max(rx,ry)+5});};
  const vOK=(x,y,r)=>y-r>at(yD,x)+3&&!exl(x,y);
  const vX=(x,y,r,rot=0,el=1)=>{if(!vOK(x,y,r+2))return;E('vWall',x,y,(r+2.4)*el,r+2.4,rot);E('lumen',x,y,r*el,r,rot);const n=Math.min(60,Math.floor(r*r*el/10));
    for(let k=0;k<n;k++){const a=rng()*TAU,q=Math.sqrt(rng())*Math.max(0,r-3.3);C('rbc',x+Math.cos(a)*q*el,y+Math.sin(a)*q,3.2);}E('endo',x+(r+1.2)*el,y,1.1,2.6,0);E('endo',x-(r+1.2)*el,y,1.1,2.6,0);};
  const vL=(x1,y1,x2,y2,r)=>{const len=Math.hypot(x2-x1,y2-y1),n=Math.max(1,Math.ceil(len/3));for(let k=0;k<=n;k++){const t=k/n,x=lerp(x1,x2,t),y=lerp(y1,y2,t);if(!vOK(x,y,r+2))continue;E('vWall',x,y,r+2.4,r+2.4,0);E('lumen',x,y,r,r,0);}
    const m=Math.floor(len*Math.max(1,r-2)/28);for(let k=0;k<m;k++){const t=rng(),x=lerp(x1,x2,t)+(rng()-0.5)*Math.max(0,r-3),y=lerp(y1,y2,t)+(rng()-0.5)*Math.max(0,r-3);if(vOK(x,y,r))C('rbc',x,y,3.2);}};
  const inEarlier=(lobes,x,y,j)=>{for(let q=0;q<j;q++){const m=lobes[q];if((x-m.x)**2+(y-m.y)**2<(m.r-5)**2)return true;}return false;};
  const inOther=(lobes,x,y,j)=>{for(let q=0;q<lobes.length;q++){if(q===j)continue;const m=lobes[q];if((x-m.x)**2+(y-m.y)**2<(m.r-5)**2)return true;}return false;};
  const bccNest=(lobes,pig,r0,others)=>{for(const l of lobes){E('bStroma',l.x,l.y,l.r+30,l.r+27,0);E('muc',l.x,l.y,l.r+10,l.r+9,0);const ca=rng()*TAU,co=2.4+rng()*3.2;E('cleft',l.x+Math.cos(ca)*co,l.y+Math.sin(ca)*co,l.r+2.6,l.r+2.6,0);E('bccCyto',l.x,l.y,l.r,l.r,0);EX.push({x:l.x,y:l.y,r:l.r+14});}
    const inAny=(x,y)=>(others||lobes).some(m=>(x-m.x)**2+(y-m.y)**2<(m.r+9)**2);
    for(const l of lobes)for(let k=0;k<l.r*0.28;k++){const a=rng()*TAU,d=l.r+13+rng()*16,x=l.x+Math.cos(a)*d,y=l.y+Math.sin(a)*d;if(!inAny(x,y))E('fib',x,y,4.6,1.15,a+Math.PI/2);}
    lobes.forEach((l,j)=>{const n=Math.max(8,Math.floor(TAU*l.r/6.5));for(let k=0;k<n;k++){const a=k/n*TAU,x=l.x+Math.cos(a)*(l.r-4.5),y=l.y+Math.sin(a)*(l.r-4.5);if(!inOther(lobes,x,y,j))E('nucB',x,y,4.3,1.8,a);}
      for(let y=l.y-l.r+9;y<l.y+l.r-9;y+=7.4)for(let x=l.x-l.r+9;x<l.x+l.r-9;x+=7.4){const px=x+(rng()-0.5)*4.5,py=y+(rng()-0.5)*4.5;if((px-l.x)**2+(py-l.y)**2>(l.r-9.5)**2||inEarlier(lobes,px,py,j))continue;
        const u=rng();if(u<0.012){C('apo',px,py,1.7);continue;}if(u<0.02){E('mit',px,py,3.2,1.2,rng()*3);E('mit',px+1,py,1.2,3,rng()*3);continue;}
        E(u<0.55?'nucB':'nucD',px,py,3.6+rng()*1.0,2.5+rng()*0.6,rng()*3);if(pig&&rng()<0.12)C('mel',px+(rng()-0.5)*6,py+(rng()-0.5)*6,1);}});
    const l=lobes[0];
    if(pig){for(const q of lobes)for(let k=0;k<q.r*0.2;k++){const a=rng()*TAU,d=q.r*1.05+12+rng()*14;melPh(q.x+Math.cos(a)*d,q.y+Math.sin(a)*d);}anc('pignest',l.x,l.y,r0);}
    anc('palisade',l.x+Math.cos(-0.8)*(l.r-4),l.y+Math.sin(-0.8)*(l.r-4),r0);anc('cleft',l.x+Math.cos(2.4)*(l.r+4),l.y+Math.sin(2.4)*(l.r+4),r0);anc('stroma',l.x,l.y+l.r*1.06+14,r0);};
  /* separate nests packed into a tumour's cross-section, with stroma between them */
  const packNests=(cx,cy,rx,ry,rmin,rmax,gap,seed)=>{const r2=mulberry32(seed),out=[];for(let t=0;t<1400&&out.length<34;t++){const a=r2()*TAU,q=Math.sqrt(r2()),x=cx+Math.cos(a)*q*rx,y=cy+Math.sin(a)*q*ry;
      let rm=rmax*(0.45+0.55*r2());const e=Math.hypot((x-cx)/rx,(y-cy)/ry);rm=Math.min(rm,(1-e)*Math.min(rx,ry)+rmin*0.6);
      for(const o of out){const d=Math.hypot(o.x-x,o.y-y)-o.r-gap;if(d<rm)rm=d;}if(y-rm<at(yD,x)+8)rm=Math.min(rm,y-at(yD,x)-8);if(rm>=rmin)out.push({x,y,r:rm});}
    return out.sort((a,b)=>b.r-a.r);};
  const sccNest=(lobes,r0)=>{for(const l of lobes){for(let k=0;k<l.r*0.5;k++){const a=rng()*TAU,q=l.r*(1.05+rng()*0.25);C('lym',l.x+Math.cos(a)*q,l.y+Math.sin(a)*q,2.7);}E('sccCyto',l.x,l.y,l.r,l.r*0.95,0);EX.push({x:l.x,y:l.y,r:l.r+4});}
    const pearls=[];for(const l of lobes)if(l.r>62){const pr=l.r*(0.28+rng()*0.1),px0=l.x+(rng()-0.5)*l.r*0.3,py0=l.y+(rng()-0.5)*l.r*0.3;E('pearl',px0,py0,pr,pr*0.86,rng());for(let k=1;k<=4;k++)C('pearlL',px0,py0,pr*k/4.6);pearls.push({x:px0,y:py0,r:pr});}
    lobes.forEach((l,j)=>{const edge=l.r-12;for(let y=l.y-l.r+6;y<l.y+l.r-4;y+=12.5)for(let x=l.x-l.r+6;x<l.x+l.r-4;x+=12.5){const px=x+(rng()-0.5)*5,py=y+(rng()-0.5)*5,dr=Math.hypot(px-l.x,py-l.y);
      if(dr>l.r-6||inEarlier(lobes,px,py,j)||pearls.some(q=>(px-q.x)**2+(py-q.y)**2<(q.r+5)**2))continue;
      if(dr>edge){E('nucB',px,py,3.2,2.2,Math.atan2(py-l.y,px-l.x));continue;}
      E('sccCell',px,py,5.6+rng()*1.2,5+rng()*1.2,rng()*3);
      if(rng()<0.035){E('dysk',px,py,5.4,5,0);E('nucD',px,py,1.6,1.4,0);}else{E(rng()<0.6?'nucV':'nucD',px,py,3.2+rng()*1.9,2.7+rng()*1.5,rng()*3);C('nucleolus',px+(rng()-0.5)*1.5,py+(rng()-0.5)*1.5,1.0);}}});
    const l0=lobes[0];if(pearls.length)anc('pearl',pearls[0].x,pearls[0].y,r0);anc('invasive',l0.x+l0.r*0.7,l0.y-l0.r*0.2,r0);};
  /* dermal cell populations: profile tapers with depth (wedge for blue nevus, dome for nevi) and the edge is irregular */
  const CPROF={blue:t=>Math.pow(Math.max(0,1-0.82*t),0.85),dermal:t=>Math.sqrt(Math.max(0,1-t*t)),veil:t=>Math.sqrt(Math.max(0,1-Math.pow(t,1.5))),regr:t=>1-t*t*t};
  const cloudSection=f=>{const dzc=zc-f.z;if(Math.abs(dzc)>=f.rz)return;const hx=f.rx*Math.sqrt(1-(dzc/f.rz)**2),sid=f.hs||f.sid,prof=CPROF[sid]||(t=>Math.sqrt(Math.max(0,1-t*t))),sd=(Math.abs(f.x*13+f.z*7)|0)%97;
    const cfg={veil:[16,16],regr:[16,16],blotch:[18,18],dermal:[9.5,9.5],blue:[18,17]}[sid]||[16,16];
    for(let d=f.d0;d<=f.d1;d+=cfg[1]/1000){const t=(d-f.d0)/Math.max(1e-6,f.d1-f.d0),w=hx*prof(t);if(w<0.015)continue;
     for(let x=f.x-w*1.2;x<=f.x+w*1.2;x+=cfg[0]/1000){const xx=x+(rng()-0.5)*0.006,dd=d+(rng()-0.5)*0.006;if(f.shape&&!f.shape(xx,zc))continue;
      if(Math.abs(xx-f.x)>w*(0.78+0.44*vnoise((xx-f.x)*3.2+sd,dd*7,41+sd)))continue;
      const[px,py]=P(xx,dd);if(sid==='blotch'&&py<at(yD,px)+7&&py>at(yC,px)+2){if(!exl(px,py)){for(let g=0;g<4;g++)C('mel',px+(rng()-0.5)*12,py+(rng()-0.5)*12,0.9);if(rng()<0.1)melano(px,py,true,1);}continue;}
      if(py<at(yD,px)+7||exl(px,py))continue;const u=rng();
      if(sid==='veil'){if(dd<0.3&&u<0.28)melano(px,py,true,0.6);else if(u<0.42)melPh(px,py);}
      else if(sid==='regr'){if(u<0.22)melPh(px,py);else if(u<0.6)C('lym',px,py,2.7);}
      else if(sid==='blotch'){if(u<0.6)melPh(px,py);}
      else if(sid==='dermal'){ // maturation: epithelioid nests above, small cells in cords, single spindled cells at the base
        if(t<0.34){if(vnoise(xx*15+3,dd*15,7)>0.46){E('nestBody',px,py,6.6,6,0);E('nuc',px,py,2.8,2.5,rng()*3);if(rng()<0.35)C('mel',px+2,py-2,0.85);}}
        else if(t<0.68){if(vnoise(xx*9+7,dd*24,9)>0.5)E('nucS',px,py,2.1,1.9,rng()*3);}
        else if(u<0.32)E('fib',px,py,4.4,1.2,(rng()-0.5)*1.2);
        if(t>0.45&&t<0.75&&rng()<0.03)anc('maturation',px,py,rho(xx)+(0.4-dd));}
      else if(sid==='blue'){if(u<0.24){const a=(rng()-0.5)*1.0;E('dend',px,py,7+rng()*7,1.6+rng()*0.9,a);for(let g=0;g<3;g++)C('melC',px+Math.cos(a)*(rng()-0.5)*16,py+Math.sin(a)*(rng()-0.5)*16,1.2);}else if(u<0.3)melPh(px,py);}}
    }
    if(sid==='blue'){const pts=[];for(let k=0;k<=24;k++){const t=k/24,d=f.d0+(f.d1-f.d0)*t,w=hx*prof(t)*(0.9+0.2*vnoise(t*5,1,13+sd));pts.push(P(f.x-w,d));}
      for(let k=24;k>=0;k--){const t=k/24,d=f.d0+(f.d1-f.d0)*t,w=hx*prof(t)*(0.9+0.2*vnoise(t*5,2,17+sd));pts.push(P(f.x+w,d));}
      const pp=new Path2D();pts.forEach((q,i)=>i?pp.lineTo(q[0],q[1]):pp.moveTo(q[0],q[1]));pp.closePath();Pg('sclP',pp);
      for(let d=f.d0+0.01;d<f.d1;d+=0.016){const t=(d-f.d0)/Math.max(1e-6,f.d1-f.d0),w=hx*prof(t)*1000*0.85;if(w<30)continue;const[cx0,cy0]=P(f.x,d);let x=cx0-w+rng()*20;
        while(x<cx0+w-40){const len=Math.min(60+rng()*140,cx0+w-x),a=(rng()-0.5)*0.35;Q('sclB',x,cy0,x+len/2,cy0+(rng()-0.5)*14,x+len*Math.cos(a),cy0+len*Math.sin(a));x+=len+6+rng()*14;}}}
    const c=P(f.x,(f.d0+f.d1)/2),r0=rho(f.x);
    if(sid==='veil')anc('dermal',c[0],P(f.x,f.d0+0.08)[1],r0);
    if(sid==='blue'){anc('dendritic',c[0],c[1],r0);anc('sclerosis',c[0]+hx*400,P(f.x,f.d0+0.35)[1],r0);}};
  const collagenSection=f=>{const dz=Math.abs(f.z-zc);if(dz>=f.r||(st0==='bc'&&f.style!=='dense'))return;const hx=Math.sqrt(f.r*f.r-dz*dz);const x0=U(f.x-hx),x1=U(f.x+hx),cx=(x0+x1)/2,ys0=at(yS,cx);
    const yt=ys0+f.d0*1000,yb=ys0+f.d1*1000,rx=(x1-x0)/2,ry=Math.max(20,(yb-yt)/2),cy=(yt+yb)/2;
    if(f.style==='dense'){let ydm=0;for(let x=x0;x<=x1;x+=40)ydm=Math.max(ydm,at(yD,x));const yt2=Math.max(yt,ydm+45),cy2=(yt2+yb)/2,ry2=Math.max(20,(yb-yt2)/2);
      const bnd=a=>0.8+0.32*vnoise(Math.cos(a)*2.2+5,Math.sin(a)*2.2,23);const poly=new Path2D();for(let k=0;k<=120;k++){const a=k/120*TAU,s2=bnd(a);const qx=cx+Math.cos(a)*rx*s2,qy=cy2+Math.sin(a)*ry2*s2;k?poly.lineTo(qx,qy):poly.moveTo(qx,qy);}poly.closePath();Pg('dfP',poly);
      for(let y=yt2;y<yb+ry2*0.2;y+=9)for(let x=x0-rx*0.15;x<x1+rx*0.15;x+=9){const px=x+(rng()-0.5)*5,py=y+(rng()-0.5)*5;if(py<ydm+40)continue;const a0=Math.atan2((py-cy2)/ry2,(px-cx)/rx),nr=Math.hypot((px-cx)/rx,(py-cy2)/ry2)/bnd(a0);if(nr>1.08||(nr>0.9&&rng()<(nr-0.9)*5))continue;const a=TAU*fbm(px/70,py/70,17,2)*1.7;
        if(nr>0.74&&rng()<0.07){E('collBall',px,py,11+rng()*8,7+rng()*4,a);for(let k=0;k<3;k++)E('fib',px+Math.cos(a+k*2)*16,py+Math.sin(a+k*2)*11,4.6,1.2,a+k*2+1.57);continue;}
        const u=rng();if(u<0.5)E('fib',px,py,4.8,1.25,a);else if(u<0.56)E('nucS',px,py,3,2.6,0);else if(u<0.8)Ln('papFib',px-Math.cos(a)*6,py-Math.sin(a)*6,px+Math.cos(a)*6,py+Math.sin(a)*6);}
      anc('storiform',cx,cy2,0);anc('trapping',cx+rx*0.82,cy2+ry2*0.15,0.1);anc('grenz',cx-rx*0.3,(at(yD,cx-rx*0.3)+yt2)/2,0);}
    else{const bl=blob(cx,cy,rx,ry,(cx|0)%17,0.36);Pg('hyalP',bl.p);for(let y=yt+4;y<yb-2;y+=5)for(let x=x0;x<x1;x+=22){if(!bl.in(x,y,0.9)||!bl.in(x+20,y,0.9)||rng()<0.25)continue;Ln('hyalL',x,y+(rng()-0.5)*2,x+14+rng()*10,y+(rng()-0.5)*3);}
      for(let k=0;k<rx*ry/900;k++){const a=rng()*TAU,q=Math.sqrt(rng());E('fib',cx+Math.cos(a)*q*rx,cy+Math.sin(a)*q*ry,5,1.2,(rng()-0.5)*0.3);}
      if(st0==='df')anc('fibrosis',cx,yt+25,0);}};
  const scarSection=f=>{const dz=Math.abs(f.z-zc);if(dz>=f.r)return;const hx=Math.sqrt(f.r*f.r-dz*dz),x0=U(f.x-hx),x1=U(f.x+hx),cx=(x0+x1)/2,ys0=at(yS,cx);
    const yt=ys0+100,yb=ys0+320,rx=(x1-x0)/2,ry=(yb-yt)/2,cy=(yt+yb)/2,bl=blob(cx,cy,rx,ry,(cx|0)%13,0.34);Pg('hyalP',bl.p);
    for(let y=yt+4;y<yb-2;y+=5)for(let x=x0;x<x1;x+=20){if(!bl.in(x,y,0.9)||!bl.in(x+20,y,0.9)||rng()<0.2)continue;Ln('hyalL',x,y,x+12+rng()*10,y+(rng()-0.5)*3);}
    if(st0==='mm'){for(let k=0;k<rx*ry/260;k++){const a=rng()*TAU,q=Math.sqrt(rng());C('lym',cx+Math.cos(a)*q*rx,cy+Math.sin(a)*q*ry*0.9,2.7);}for(let k=0;k<4;k++)vX(cx+(rng()-0.5)*rx,cy+(rng()-0.5)*ry,7);anc('regress',cx,cy,rho(f.x));}
    else anc('fibrosis',cx,yt+30,0);};
  const follicleSection=f=>{if(Math.abs(f.z-zc)>0.3)return;const c=Math.cos(f.ang),path=[[f.x,0],[f.x+0.12*c,0.3],[f.x+0.35*c,1.1],[f.x+0.5*c,1.9]],pts=[];
    for(let k=0;k<3;k++){const a=path[k],b=path[k+1],n=Math.ceil((b[1]-a[1])/0.012);for(let j=0;j<n;j++){const t=j/n;pts.push([lerp(a[0],b[0],t),lerp(a[1],b[1],t)]);}}pts.push(path[3]);
    const ys0=at(yS,U(f.x));
    for(const[x2,d]of pts){const px=U(x2),py=ys0+d*1000,w=f.wc&&d<0.14?60:d<0.1?40:30;E('ors',px,py,w,7,0);EX.push({x:px,y:py,r:w+2});}
    for(const[x2,d]of pts){const px=U(x2),py=ys0+d*1000;if(d>0.03&&d<1.85)E('hair',px,py,9,7,0);if(rng()<0.8){E('nuc',px-24+(rng()-0.5)*4,py,2.6,2,1.57);E('nuc',px+24+(rng()-0.5)*4,py,2.6,2,1.57);}}
    const b=path[3],bx=U(b[0]),by=ys0+1900;E('ors',bx,by+10,48,42,0);E('bulbP',bx,by+22,16,14,0);for(let k=0;k<30;k++){const a=rng()*TAU,q=22+rng()*20;E('nucB',bx+Math.cos(a)*q,by+10+Math.sin(a)*q*0.85,2.4,2,a);}
    const sp=pts.find(p=>p[1]>0.42)||pts[pts.length>>1],sx=U(sp[0]),sy=ys0+sp[1]*1000,side=c>=0?-1:1;
    for(let k=0;k<3;k++){const lx=sx+side*(70+k*18),ly=sy+(k-1)*70;E('seb',lx,ly,42,34,0);sebCells(lx,ly,42,34);EX.push({x:lx,y:ly,r:45});}
    if(f.wc){const px=U(f.x);E('horn',px,ys0+28,20,30,0);for(let k=1;k<=3;k++)C('hornL',px,ys0+28,k*6);for(let k=0;k<40;k++)C('gran',px+(rng()<0.5?-1:1)*(24+rng()*14),ys0+10+rng()*90,0.9);anc('infund',px,ys0+60,rho(f.x));}
    else{anc('follicle',U(lerp(f.x,b[0],0.4)),ys0+800,rho(f.x)+2);anc('sebaceous',sx+side*70,sy,rho(f.x)+2);}};

  /* lesion structures cut by the plane */
  const melNodule=f=>{const dz=Math.abs(f.z-zc);if(dz>=f.r)return;const k=Math.sqrt(1-(dz/f.r)**2),rx=f.r*k*1000,cx=U(f.x),ys=at(yS,cx),y0=ys+f.d0*1000,y1=ys+f.d1*1000;
    const ryk=Math.max(40,(y1-y0)/2*k),cyy=y0+ryk,bl=blob(cx,cyy,rx,ryk,(cx|0)%23,0.2);Pg('mnodP',bl.p);
    // expansile nodule with a lobulated pushing border; thin fibrovascular septa split it into packets
    for(let y=cyy-ryk*1.1+7;y<cyy+ryk*1.1-5;y+=13.5)for(let x=cx-rx*1.1+7;x<cx+rx*1.1-5;x+=13.5){const px=x+(rng()-0.5)*6,py=y+(rng()-0.5)*6;if(!bl.in(px,py,0.985)||Math.abs(vnoise(px/85,py/85,77)-0.5)<0.026)continue;
      E('cellM',px,py,6.4+rng()*1.6,5.6+rng()*1.4,rng()*3);
      if(rng()<0.02){E('mit',px,py,3.6,1.4,rng()*3);E('mit',px+1,py,1.4,3.4,rng()*3);if(py>cyy)anc('mitmel',px,py,Math.abs(px-cx)/rx);continue;}
      const nr=3.0+rng()*2.4;E(rng()<0.55?'nucV':'nucD',px,py,nr,nr*(0.75+rng()*0.2),rng()*3);C('nucleolus',px+(rng()-0.5)*1.4,py+(rng()-0.5)*1.4,1.1+rng()*0.4);if(rng()<0.05)E('nucD',px+nr*1.4,py,nr*0.8,nr*0.65,rng()*3);
      const pg=Math.max(0,0.9-(py-y0)/Math.max(1,y1-y0)*0.7),g=Math.round(pg*rng()*4);for(let q=0;q<g;q++)C('mel',px+(rng()-0.5)*9,py+(rng()-0.5)*8,0.85);
      if(rng()<0.015)melPh(px+5,py+3);}
    for(let q=0;q<rx*0.4;q++){const a=Math.PI*(0.08+0.84*rng()),m=1.0+rng()*0.22,lx=cx+Math.cos(a)*rx*m,ly=cyy+Math.sin(a)*ryk*m;if(!bl.in(lx,ly,1.02))C('lym',lx,ly,2.7);}
    if(ryk>=rx){for(let yy=cyy-ryk+rx;yy<=cyy+ryk-rx+1;yy+=rx*0.6)EX.push({x:cx,y:yy,r:rx*0.98});}else{for(let xx=cx-rx+ryk;xx<=cx+rx-ryk+1;xx+=ryk*0.6)EX.push({x:xx,y:cyy,r:ryk*0.98});}
    anc('melnodule',cx,cyy,rho(f.x));};
  const VTAG={arbor:'vessel',glom:'glomvessels',hairpin:'hairpinv',vessels:'neo',plexus:'plexus',tel:'telv',telf:'telv'};
  /* junctional activity of a nevus: small nests at the tips/sides of rete ridges and single basal melanocytes
     (more than the few dermoscopically visible globules); fades as the nevus matures */
  const jA=st0==='nv'?(Lm.evo&&Lm.evo.seq==='nevus'?[1,0.8,0.5,0.15,0][Lm.evo.k]:0.6):0;
  if(jA>0)for(let x=100+rng()*150;x<7900;x+=120+rng()*130){const i0=Math.round(x/8);if(RR[i0]>0.92||UL[i0]>0.3||rng()>jA*0.7)continue;
    let bx=x,by=at(yD,x);for(let dx=-40;dx<=40;dx+=4){const y=at(yD,x+dx);if(y>by){by=y;bx=x+dx;}}
    const rx=11+rng()*13,ry=Math.min(rx*0.85,9+rng()*7);if(exl(bx,by))continue;nestCells(bx,by+ry*0.25,rx,ry,false,0.8);anc('jnest',bx,by,RR[i0]);}
  for(const pass of[0,1])for(const f of Lm.features){if((f.t==='vessel')!==(pass===1))continue;switch(f.t){
    case'nest':{const rr0=f.r+0.012,dz=Math.abs(f.z-zc);if(dz>=rr0)break;const rs=Math.max(0.016,Math.sqrt(rr0*rr0-dz*dz))*1000,r0=rho(f.x);let[cx,cy]=P(f.x,f.d);const yd=at(yD,cx),yc=at(yC,cx);
      if(f.bcc){cy=(f.sid==='buds'||f.sid==='leaf')?yd+rs*0.28:Math.max(cy,yd+rs*0.7);bccNest([{x:cx,y:cy,r:rs}],f.np?0:1,r0+(f.sid==='leaf'?0.3:0.5));if(f.sid==='leaf')anc('pignest',cx,cy,r0+0.3);break;}
      let rx=rs,ry=rs*0.85;const th=Math.max(20,yd-yc);if(f.d<0.045&&st0==='mm'&&th>2*ry+8)cy=clamp(cy,yc+ry+4,yd-ry-4);
      else if(f.d<0.15){rx=Math.min(rs,st0==='mm'?56:42);ry=Math.min(rx*0.8,st0==='mm'?38:32);cy=yd+ry*0.35;}else cy=Math.max(cy,yd+ry+8);
      nestCells(cx,cy,rx,ry,st0==='mm',f.d<0.16?0.8:0.3);anc(f.d<0.15?'jnest':st0==='mm'?'dermal':'maturation',cx,cy,r0);break;}
    case'streak':for(let k=0;k<=6;k++){const t=k/6,x=f.x+Math.cos(f.ang)*f.len*t,z=f.z+Math.sin(f.ang)*f.len*t;if(Math.abs(z-zc)<f.w*0.8){const cx=U(x),rs=f.w*1000*0.6*(1-0.4*t)+10,cy=at(yD,cx)-rs*0.8*0.35;nestCells(cx,cy,rs*1.3,rs*0.8,true,0.9);anc('jnest',cx,cy,rho(x)-0.3);}}break;
    case'cloud':cloudSection(f);break;
    case'tumor':if(f.kind==='mel'){melNodule(f);break;}{const dz=Math.abs(f.z-zc);if(dz>=f.r)break;const rs=Math.sqrt(f.r*f.r-dz*dz)*1000,[cx,cy]=P(f.x,f.d),tr=mulberry32(((f.x*1000)|0)*3+((f.z*1000)|0)+11);
      const seed=((f.x*1000)|0)*7+((f.z*1000)|0)*3+Math.round(zc*100);
      if(f.kind==='bcc'){const yd0=at(yD,cx),ns=rs<90?[{x:cx,y:cy-rs<yd0+40?yd0+rs*0.3:Math.max(cy,yd0+rs+10),r:rs}]:packNests(cx,cy,rs*1.05,rs*0.95,40,Math.max(70,rs*0.62),24,seed);
        const all=[];const groups=ns.map(n=>{const r=n.r,a0=rng()*TAU,lb=[{x:n.x+Math.cos(a0)*r*0.12,y:n.y+Math.sin(a0)*r*0.12,r:r*0.8}];const k=r>95?2:r>50?1:0;
          for(let j=0;j<k;j++){const a=a0+Math.PI*(0.75+j*0.6)+(rng()-0.5)*0.5;lb.push({x:n.x+Math.cos(a)*r*0.42,y:n.y+Math.sin(a)*r*0.42,r:r*0.56});}all.push(...lb);return lb;});
        for(const lb of groups)bccNest(lb,f.pig,rho(f.x),all);break;}
      const ns=rs<80?[{x:cx,y:cy,r:rs}]:packNests(cx,cy,rs*1.15,rs*0.95,28,Math.max(50,rs*0.45),16,seed);
      // tongues of tumour still connected to the epidermis
      for(const n of ns.slice().sort((a,b)=>(a.y-a.r)-(b.y-b.r)).slice(0,2)){const yd=at(yD,n.x);if(n.y-n.r>yd-4){const h=n.y-yd,w=Math.max(18,n.r*0.5);E('sccCyto',n.x,yd+h/2,w,h/2+4,0);
        for(let y=yd+6;y<n.y;y+=12.5)for(let x=n.x-w+6;x<n.x+w-4;x+=12.5){if(((x-n.x)/w)**2>0.9)continue;E('sccCell',x,y,5.6,5,rng()*3);E('nucV',x+(rng()-0.5)*3,y,3.4+rng(),2.8+rng(),rng()*3);}}}
      const lobes=[];for(const n of ns){const r=n.r,a0=rng()*TAU;if(r<42){lobes.push(n);continue;}lobes.push({x:n.x+Math.cos(a0)*r*0.12,y:n.y+Math.sin(a0)*r*0.12,r:r*0.8});
        const k=r>90?2:1;for(let j=0;j<k;j++){const a=a0+Math.PI*(0.7+j*0.65)+(rng()-0.5)*0.5;lobes.push({x:n.x+Math.cos(a)*r*0.44,y:n.y+Math.sin(a)*r*0.44,r:r*0.52});}}
      sccNest(lobes,rho(f.x));break;}
    case'vessel':{const tag=VTAG[f.sid]||'neo',w=f.rad+0.012,R=f.rad*1000;
      for(let k=0;k<f.pts.length-1;k++){const p=f.pts[k],q=f.pts[k+1];
        if(Math.abs(p[2]-zc)<w&&Math.abs(q[2]-zc)<w){const a=P(p[0],p[1]),b=P(q[0],q[1]);vL(a[0],a[1],b[0],b[1],R);anc(tag,a[0],a[1],rho(p[0]));}
        else if((p[2]-zc)*(q[2]-zc)<=0&&p[2]!==q[2]){const t=(zc-p[2])/(q[2]-p[2]),x=lerp(p[0],q[0],t),d=lerp(p[1],q[1],t),el=1+Math.min(2.5,Math.abs(q[0]-p[0])/Math.max(0.004,Math.abs(q[2]-p[2]))*0.6);const c=P(x,d);vX(c[0],c[1],R,0,el);anc(tag,c[0],c[1],rho(x));}}break;}
    case'collagen':collagenSection(f);break;
    case'scar':scarSection(f);break;
    case'milia':{const dz=Math.abs(f.z-zc);if(dz>=f.r)break;const rs=Math.sqrt(f.r*f.r-dz*dz)*1000;let[cx,cy]=P(f.x,f.d);const lo=at(yC,cx)+rs+6,hi=at(yD,cx)-rs-8;if(hi<lo)break;cy=clamp(cy,lo,hi);E('horn',cx,cy,rs,rs*0.92,0);for(let k=1;k<=4;k++)C('hornL',cx,cy,rs*k/4.7);
      const n=Math.max(6,Math.floor(TAU*rs/9));for(let k=0;k<n;k++){const a=k/n*TAU;E('nuc',cx+Math.cos(a)*(rs+3),cy+Math.sin(a)*(rs*0.92+3),3,1.2,a+Math.PI/2);}EX.push({x:cx,y:cy,r:rs+7});anc('horncyst',cx,cy,rho(f.x));break;}
    case'comedo':{const dz=Math.abs(f.z-zc);if(dz>=f.r+0.02)break;const w=f.r*1000,[cx,y0]=P(f.x,0),dep=160;E('horn',cx,y0+dep/2,w,dep/2,0);
      for(let y=y0+4;y<y0+dep-6;y+=6){const hw=w*Math.sqrt(Math.max(0,1-((y-y0-dep/2)/(dep/2))**2))*0.85;Ln('scLam',cx-hw,y,cx+hw,y+(rng()-0.5)*2);}
      for(let k=0;k<22;k++)C('melC',cx+(rng()-0.5)*w*1.4,y0+rng()*30,1.4);for(let k=0;k<16;k++){const a=Math.PI*(0.05+0.9*k/15);E('nuc',cx+Math.cos(a)*(w+3),y0+dep/2+Math.sin(a)*(dep/2+3),3,1.2,a+Math.PI/2);}
      EX.push({x:cx,y:y0+dep/2,r:Math.max(w,dep/2)+6});anc('invag',cx,y0+50,rho(f.x));break;}
    case'blood':{if(Math.abs(f.z-zc)>f.r+0.03)break;const[cx,cy]=P(f.x,0.035),R=f.r*1000;for(let k=0;k<Math.floor(R*R/25);k++){const a=rng()*TAU,q=Math.sqrt(rng())*R;C('rbcX',cx+Math.cos(a)*q,cy+Math.sin(a)*q*0.5,3.2);}anc('blood',cx,cy,rho(f.x));break;}
    case'follicle':follicleSection(f);break;
    case'folopen':{if(Math.abs(f.z-zc)>f.r+0.015)break;const px=U(f.x),ys0=at(yS,px),yd0=at(yD,px),w=f.r*1000*(f.halo>0.5?0.9:0.75),dep=Math.max(yd0-ys0+(f.plug>0.2?110:80),f.plug>0.2?190:150),n=30;
      // infundibulum: a funnel of keratinizing epithelium continuous with the epidermis; its canal holds loose keratin or a compact plug
      const hwAt=t=>w*(1-0.65*t);for(let k=0;k<=n;k++){const t=k/n,y=ys0+t*dep,hw=hwAt(t);if(y>yd0-4)E('ors',px,y,hw+19,dep/n*1.3,0);
        if(f.plug>0.2||t>0.45)E('horn',px,y,f.plug>0.2?hw:hw*0.55,dep/n*1.2,0);else E('lumen',px,y,hw*0.62,dep/n*1.2,0);EX.push({x:px,y,r:hw+2});
        if(k%4===0)for(const sd of[-1,1])for(let q=0;q<2;q++){if(y<at(yC,px)+2)continue;E(q?'nuc':'nucB',px+sd*(hw+5+q*8),y+(rng()-0.5)*3,q?3:2.6,q?2.2:1.6,Math.PI/2);}}
      for(let k=1;k<7;k++){const t=f.plug>0.2?k/8:0.45+k*0.07;if(t>0.98)break;const y=ys0+dep*t,hw=hwAt(t)*(f.plug>0.2?0.85:0.5);Ln('scLam',px-hw,y+(rng()-0.5)*3,px+hw,y+(rng()-0.5)*3);}
      // isthmus with a vellus hair and sebaceous lobules (facial skin)
      const yb=ys0+dep,yl=yb+420;for(let y=yb-6;y<yl;y+=5){E('ors',px,y,17,5,0);E('hair',px,y,3.2,3,0);EX.push({x:px,y,r:19});if(((y-yb)|0)%14<5)for(const sd of[-1,1])E('nucB',px+sd*12,y,2.4,1.5,Math.PI/2);}
      E('ors',px,yl+8,26,22,0);E('bulbP',px,yl+14,9,8,0);
      for(const sd of[-1,1]){const lx=px+sd*44,ly=yb+140+sd*18,rx=30,ry=44;E('ors',px+sd*16,ly,14,10,0);E('seb',lx,ly,rx,ry,0);sebCells(lx,ly,rx,ry);EX.push({x:lx,y:ly-10,r:38},{x:lx,y:ly+10,r:38});}
      if(f.lm){const l=f.lm,fr=l.obl?1:[0.45,0.6,0.8,1,1,1][lmL],sides=lmL<2&&!l.obl?[Math.cos(l.aA)>=0?1:-1]:[-1,1],rr0=rho(f.x);
        for(const sd of sides)for(let t=0.08;t<fr;t+=0.07){const y=ys0+t*dep;if(y<at(yC,px)+4)continue;if(rng()<0.8)melano(px+sd*(hwAt(t)+6),y,true,0.9);}
        anc('lmadnex',px+sides[0]*(hwAt(0.35)+6),ys0+dep*0.35,rr0);
        if(l.plp){for(const sd of sides.length>1?[-1,1]:sides){const t=0.35+0.2*rng(),y=ys0+t*dep,hw=hwAt(t),bx=px+sd*(hw+30);E('ors',bx,y,22,11,sd*0.35);for(let q=0;q<3;q++)melano(bx+sd*(q*8-6),y+4,true,0.9);for(let q=0;q<10;q++)C('mel',bx+(rng()-0.5)*30,y+(rng()-0.5)*14,0.9);anc('lmbud',bx,y,rr0);}}
        if(l.ag||l.cwc){for(let q=0;q<(l.ag?6:3);q++){const sd=rng()<0.5?-1:1,t=0.2+0.6*rng(),y=ys0+t*dep+30+rng()*40;melPh(px+sd*(hwAt(t)+45+rng()*40),y);}anc('lmmeph',px+(hwAt(0.5)+60),ys0+dep*0.5+40,rr0);}
        if(l.obl){for(let k=0;k<70;k++){const t=rng()*0.9,y=ys0+t*dep;C(rng()<0.5?'mel':'melC',px+(rng()-0.5)*hwAt(t)*1.6,y,0.9+rng()*0.7);}anc('lmfill',px,ys0+dep*0.4,rr0);}}
      if(f.halo>0.5){for(let k=0;k<40;k++){const t=rng()*0.8;C('gran',px+(rng()<0.5?-1:1)*(hwAt(t)+4+rng()*10),ys0+t*dep,0.9);}anc('infund',px,ys0+dep*0.5,rho(f.x));}
      else anc('infund2',px,ys0+dep*0.5,rho(f.x));break;}
    case'elastosis':{const dz=Math.abs(f.z-zc);if(dz>=f.r)break;const hx=Math.sqrt(f.r*f.r-dz*dz),xa=Math.max(0,U(f.x-hx)),xb=Math.min(8000,U(f.x+hx));
      /* grenz zone: elastotic material starts below the deepest rete tips, papillae keep normal collagen */
      const YDm=mk();for(let i=0;i<NX;i++){let m=0;for(let j=Math.max(0,i-12);j<=Math.min(N,i+12);j++)m=Math.max(m,yD[j]);YDm[i]=m;}
      {const ia=Math.max(0,Math.floor(xa/8)),ib=Math.min(N,Math.ceil(xb/8)),T=mk(),B=mk();for(let i=ia;i<=ib;i++){T[i]=Math.max(yS[i]+f.d0*1000,YDm[i]+24);B[i]=Math.max(T[i]+10,yS[i]+f.d1*1000-20*vnoise(i*0.05,3,7));}regions.push({p:band(T,B,ia,ib),c:'#E9DCE8'});}
      for(let x=xa;x<xb;x+=11+rng()*8){const ys0=at(yS,x),ydj=at(YDm,x),yt=ys0+f.d0*1000,yb=ys0+f.d1*1000;for(let y=Math.max(yt,ydj+24)+4;y<yb;y+=10+rng()*6){if(rng()<0.3||exl(x,y))continue;
        const l=8+rng()*14,a=rng()*TAU;Q('elast',x,y,x+Math.cos(a)*l*0.5+(rng()-0.5)*9,y+Math.sin(a)*l*0.5+(rng()-0.5)*9,x+Math.cos(a)*l,y+Math.sin(a)*l);if(rng()<0.035)E('elastB',x,y,10+rng()*8,5+rng()*4,rng()*3);}}
      const mx=clamp(U(1.1),xa,xb);anc('elastosis',mx,Math.max(at(yD,mx)+50,at(yS,mx)+(f.d0+f.d1)*500),2);break;}
    case'lichenoid':{const dz=Math.abs(f.z-zc);if(dz>=f.r)break;const hx=Math.sqrt(f.r*f.r-dz*dz),xa=U(f.x-hx),xb=U(f.x+hx);let got=false;
      for(let x=xa;x<xb;x+=5+rng()*4){const rx0=at(RR,x);if(rx0>1.02)continue;const yd=at(yD,x);for(let k=0;k<5;k++){const y=yd+4+rng()*42;if(exl(x,y))continue;C('lym',x+(rng()-0.5)*4,y,2.7);}
        if(rng()<0.1){const y=yd+32+rng()*50;melPh(x,y);if(!got&&rx0<0.5){got=true;anc('melph',x,y,rx0);}}
        if(rng()<0.02)anc('lichenoid',x,yd+20,rx0);}break;}
    case'infl':{const dz=Math.abs(f.z-zc);if(dz>=f.r)break;const hx=Math.sqrt(f.r*f.r-dz*dz),r2=mulberry32(775+Math.round(zc*100));
      for(let c=0;c<f.n*2;c++){const x=f.x+(r2()*2-1)*hx,d=lerp(f.d0,f.d1,r2()),[px,py]=P(x,d);if(exl(px,py))continue;vX(px,py,5,0,1.4);
        for(let k=0;k<26;k++){const a=r2()*TAU,q=10+r2()*26;C('lym',px+Math.cos(a)*q*1.3,py+Math.sin(a)*q,2.7);}
        if(r2()<0.3)for(let k=0;k<4;k++)E('fib',px+(r2()-0.5)*80,py+(r2()-0.5)*50,5,1.3,r2()*3);EX.push({x:px,y:py,r:34});anc('inflam',px,py,rho(x));}break;}
    case'fatd':{const dz=Math.abs(f.z-zc);if(dz>=f.r)break;const hx=Math.sqrt(f.r*f.r-dz*dz),r2=mulberry32(776+Math.round(zc*100));
      for(let i=0;i<f.n*0.8;i++){const x=f.x+(r2()*2-1)*hx,d=lerp(f.d0,f.d1,r2()),[px,py]=P(x,d);if(exl(px,py))continue;const cr=26+r2()*8;E('fatW',px,py,cr,cr,0);C('fatR',px,py,cr);EX.push({x:px,y:py,r:cr});anc('fatd',px,py,rho(x));}break;}}}
  let brs=null;if(Lm.brs&&Math.abs(Lm.brs.z-zc)<0.2){const px=U(Lm.brs.x),ul=at(UL,px)>0.3,y0=ul?at(yS,px):at(yC,px);brs={x:px,y0,y1:y0+Lm.brs.mm*1000,mm:Lm.brs.mm};anc('breslow',px-16,(brs.y0+brs.y1)/2,0);}

  /* stratum corneum: basket-weave strands */
  for(let x=0;x<8000;x+=9+rng()*7){const ys=at(yS,x),yc=at(yC,x),th=yc-ys;if(th<3)continue;const r=at(RR,x),n=Math.max(1,Math.round(th/(st0==='sk'&&r<1?4.2:6.2)));
    for(let k=0;k<n;k++){const y=ys+(k+0.25+rng()*0.5)*th/n,len=20+rng()*40;Q('scStrand',x,y,x+len/2,y+(rng()-0.5)*3,x+len,y+(rng()-0.5)*2);}
    if(r>1.3&&rng()<0.02)anc('sc',x+20,ys+th/2,r);if(st0==='sk'&&r<1&&rng()<0.03)anc('scL',x,ys+th/2,r);
    if((st0==='bw'||st0==='sq'||st0==='ak')&&r<1&&rng()<0.35){E('para',x+rng()*10,ys+rng()*th,2.4,0.9,(rng()-0.5)*0.3);if(st0==='ak'&&rng()<0.05)anc('para',x+5,ys+th/2,r);}}
  /* epidermis */
  for(let x=2;x<8000;x+=8.4+rng()*2.2){const yc=at(yC,x),yd=at(yD,x),th=yd-yc;if(th<7||at(UL,x)>0.3)continue;
    const r=at(RR,x),st=r<1?st0:'n',pg=at(PG,x),ang=Math.atan2(at(yD,x+5)-at(yD,x-5),10),by=yd-4.6;
    if(!exl(x,by)){
      if(st==='lm'&&rng()<[0.3,0.36,0.42,0.55,0.62,0.62][lmL]){melano(x,yd-6,true,0.9);if(rng()<0.05)anc('lmbasal',x,yd-6,r);if(lmL>=3&&rng()<0.08){for(let q=0;q<3;q++)melano(x+5+q*6,yd-6-(q%2)*7,true,0.9);anc('lmconfl',x,yd-6,r);}}
      else if(st==='nv'&&rng()<0.12*jA)melano(x,yd-6,false,0.9);else if(st==='mm'&&rng()<0.36){melano(x,yd-6.5,true,0.8);if(rng()<0.12)anc('lentig',x,yd-6.5,r);}
      else{const ak=st==='ak';E(st==='sk'?'nucS':ak?'nucD':'nucB',x,by,ak?4.8:4.1,ak?3.1:2.4,ang+Math.PI/2);const nc=Math.round(pg*(st==='df'?10:7)+(st==='sk'?1:0)+rng()*1.2);for(let k=0;k<nc;k++)C('mel',x+(rng()-0.5)*6,by-5.5-rng()*3.5,0.85);}
      if(st==='n'){if(rng()<0.02)anc('basal',x,by,r);}else if(rng()<0.05)anc('basalL',x,by,r);}
    const atypAll=st==='bw'||st==='sq',akF=st==='ak'?(Lm.akFrac||0.33):0,gr=atypAll?0:st==='sk'?1:2,topY=yc+gr*6+3;let y=yd-14-rng()*2;
    while(y>topY){const jx=x+(rng()-0.5)*5,atyp=atypAll||(akF>0&&yd-y<th*akF);if(!exl(jx,y)){
        if(atyp){const u=rng();if(u<0.03){E('dysk',jx,y,5.4,5,0);E('nucD',jx,y,1.6,1.4,0);anc('dysk',jx,y,r);}else if(u<0.045){E('mit',jx,y,3.4,1.3,rng()*3);E('mit',jx+1,y,1.3,3.2,rng()*3);anc('mitosis',jx,y,r);}else{const nr=2.9+rng()*2.4;E(rng()<0.4?'nucV':'nucD',jx,y,nr,nr*(0.72+rng()*0.25),rng()*TAU);if(rng()<0.025)E('nucD',jx+nr*1.5,y+1,nr*0.8,nr*0.6,rng()*3);if(akF>0&&rng()<0.03)anc('akatyp',jx,y,r);}}
        else if(st==='sk'){E('nucS',jx,y,2.9,2.5,rng()*3);if(rng()<pg*0.25)C('mel',jx+3,y-3,0.9);}
        else{const fl=1-0.45*clamp((yd-y)/Math.max(th,1),0,1);E('nuc',jx,y,3.3,2.9*fl,ang*0.5);}
        if(st==='mm'&&y<yd-18&&rng()<0.05){melano(jx+4,y-2,true,0.6);anc('pagetoid',jx+4,y-2,r);}
        if(st==='lm'&&lmL>=3&&y<yd-12&&rng()<0.035){melano(jx+4,y-2,true,0.7);anc('pagetoid',jx+4,y-2,r);}
        if(pg>0.7&&rng()<0.3)C('mel',jx+(rng()-0.5)*6,y+(rng()-0.5)*6,0.9);
        if(rng()<0.015){if(st==='n')anc('spinous',jx,y,r);else anc('epiL',jx,y,r);}}
      y-=(st==='sk'?7.6:atyp?9.6:9.4)+rng()*2;}
    for(let k=0;k<gr;k++){const gy=yc+3+k*6;if(exl(x,gy))continue;E('nuc',x+(rng()-0.5)*3,gy,3.8,1.5,ang*0.3);for(let g=0;g<4;g++)C('gran',x+(rng()-0.5)*8,gy+(rng()-0.5)*3,0.9);if(st==='n'&&k===0&&rng()<0.02)anc('granular',x,gy,r);}}
  /* a lesion whose epidermis is too thin for spinous rows (e.g. stretched over a nodule) still gets its label */
  if(st0!=='n'&&!A.epiL){let bi=-1,br=1;for(let i=0;i<=N;i++)if(RR[i]<br&&UL[i]<0.3&&yD[i]-yC[i]>8){br=RR[i];bi=i;}if(bi>=0)anc('epiL',X(bi),(yC[bi]+yD[bi])/2,RR[bi]);}
  /* papillary dermis fibrils, capillary loops in papillae */
  let yDmin=1e9,yPmax=0,yPmin=1e9,yRmax=0,yRmin=1e9;for(let i=0;i<=N;i++){yDmin=Math.min(yDmin,yD[i]);yPmax=Math.max(yPmax,yP[i]);yPmin=Math.min(yPmin,yP[i]);yRmax=Math.max(yRmax,yR[i]);yRmin=Math.min(yRmin,yR[i]);}
  for(let y=yDmin;y<yPmax;y+=15)for(let x=rng()*15;x<8000;x+=15){const yy=y+(rng()-0.5)*9,xx=x+(rng()-0.5)*6;if(yy<at(yD,xx)+4||yy>at(yP,xx)-2)continue;
    const a=rng()*Math.PI,l=6+rng()*9;Ln('papFib',xx-Math.cos(a)*l/2,yy-Math.sin(a)*l/2,xx+Math.cos(a)*l/2,yy+Math.sin(a)*l/2);if(rng()<0.1&&!exl(xx,yy))E('fib',xx+3,yy+2,4.2,1.2,a);}
  const yDs=mk();for(let i=0;i<NX;i++){let s=0,c=0;for(let k=-5;k<=5;k++){const j=i+k;if(j>=0&&j<NX){s+=yD[j];c++;}}yDs[i]=s/c;}
  for(let i=8;i<N-8;i++){
    if(yDs[i]<yDs[i-1]&&yDs[i]<=yDs[i+1]&&yDs[i]<yDs[i-8]-2&&yDs[i]<yDs[i+8]-2&&yP[i]-yD[i]>25&&UL[i]<0.3){const x=X(i),y=yD[i]+13;if(!exl(x,y)){vX(x-6,y,4.5);vX(x+6,y+3,4.5);if(RR[i]>1.3)anc('papilla',x,y,RR[i]);}}
    if(yDs[i]>yDs[i-1]&&yDs[i]>=yDs[i+1]&&yDs[i]>yDs[i-8]+3&&yDs[i]>yDs[i+8]+3&&RR[i]>1.3)anc('rete',X(i),yD[i]-12,RR[i]);}
  /* reticular dermis bundles */
  for(let y=yPmin+6;y<yRmax;y+=11+rng()*10){let x=-rng()*160;while(x<8000){const len=90+rng()*260,gap=6+rng()*20,xc=x+len/2,yp=at(yP,xc),yr=at(yR,xc),deep=y-yp;
      const a=(rng()-0.5)*0.3+0.12*Math.sin(x/900+y/400),dx=Math.cos(a)*len,dy=Math.sin(a)*len;
      if(y>yp+4&&y+dy>yp+4&&y<yr-10&&y+dy<yr-10){const w=rng()*(deep<60?0.45:1),g=w<0.3?'retB6':w<0.7?'retB10':w<0.9?'retB16':'retB22',bend=(rng()-0.5)*22;
        if(deep>80&&rng()<0.12){const rr=8+rng()*12;E('retX',x+len*0.3,y,rr*(1.3+rng()*0.8),rr,(rng()-0.5)*0.4);x+=len*0.6+gap;continue;}
        Q(g,x,y,x+dx/2-Math.sin(a)*bend,y+dy/2+Math.cos(a)*bend,x+dx,y+dy);
        if(rng()<0.16)E('fib',x+dx*rng(),y+dy*0.5+(rng()-0.5)*8,4.8,1.1,a);}
      x+=Math.max(len*0.6,dx)+gap;}}
  {let bi=-1,bd=1e9;for(let i=0;i<=N;i++)if(RR[i]>1.3){const dd=Math.abs(i-180);if(dd<bd){bd=dd;bi=i;}}if(bi>=0){anc('retdermis',X(bi),yP[bi]+700,RR[bi]);anc('fat',X(bi),yR[bi]+250,RR[bi]);}}
  /* subcutis */
  for(let y=yRmin;y<H+40;y+=58){const off=(Math.round(y/58)&1)*29;for(let x=off-30;x<8040;x+=58){const px=x+(rng()-0.5)*14,py=y+(rng()-0.5)*14;if(py<at(yR,Math.min(7999,Math.max(0,px)))+32)continue;C('fatM',px,py,27+rng()*6);}}
  for(let k=0;k<5;k++){const x=rng()*8000;Ln('sept',x,at(yR,x)+20,x+(rng()-0.5)*260,H+20);}
  /* eccrine coils */
  for(let k=0;k<3;k++){let x=0,t=0;do{x=200+rng()*7600;t++;}while(at(RR,x)<1.35&&t<40);const cy=at(yS,x)+2150+rng()*120;
    for(let j=0;j<9;j++){const tx=x+(rng()-0.5)*150,ty=cy+(rng()-0.5)*90;E('eccr',tx,ty,13,11,rng()*3);E('eccrL',tx,ty,3.2,3,0);for(let q=0;q<6;q++){const a=q/6*TAU;E('nucB',tx+Math.cos(a)*8.5,ty+Math.sin(a)*7.5,1.6,2.2,a);}}
    anc('eccrine',x,cy,at(RR,x));}
  return{W,H,top0,yS,at,regions,bm,groups,A,zc,cid,brs,U,clips:{d:dermP,t:tisP},yAt:(xmm,d)=>at(yS,U(xmm))+d*1000,lesX:ivals(i=>RR[i]<1).map(([a,b])=>[X(a),X(b)])};}

/* ---------------- drawing ---------------- */
function drawPrims(c,S,vx0,vy0,vx1,vy1){for(const rg of S.regions){c.fillStyle=rg.c;c.fill(rg.p);}c.strokeStyle=HC.bm;c.lineWidth=1.6;c.stroke(S.bm);c.lineCap='round';
  for(const g of S.groups){const a=g.a,n=a.length;if(!n)continue;const cl=g.cl&&S.clips?S.clips[g.cl]:null;if(cl){c.save();c.clip(cl);}c.beginPath();
    if(g.t==='E'){for(let i=0;i<n;i+=5){const x=a[i],y=a[i+1],rx=a[i+2],ry=a[i+3],m=rx>ry?rx:ry;if(x+m<vx0||x-m>vx1||y+m<vy0||y-m>vy1)continue;const ro=a[i+4];c.moveTo(x+rx*Math.cos(ro),y+rx*Math.sin(ro));c.ellipse(x,y,rx,ry,ro,0,TAU);}c.fillStyle=g.c;c.fill();}
    else if(g.t==='C'||g.t==='R'){for(let i=0;i<n;i+=3){const x=a[i],y=a[i+1],r=a[i+2];if(x+r<vx0||x-r>vx1||y+r<vy0||y-r>vy1)continue;c.moveTo(x+r,y);c.arc(x,y,r,0,TAU);}
      if(g.t==='C'){c.fillStyle=g.c;c.fill();}else{c.strokeStyle=g.c;c.lineWidth=g.lw;c.stroke();}}
    else if(g.t==='L'){for(let i=0;i<n;i+=4){const x1=a[i],y1=a[i+1],x2=a[i+2],y2=a[i+3];if(Math.max(x1,x2)<vx0||Math.min(x1,x2)>vx1||Math.max(y1,y2)<vy0||Math.min(y1,y2)>vy1)continue;c.moveTo(x1,y1);c.lineTo(x2,y2);}c.strokeStyle=g.c;c.lineWidth=g.lw;c.stroke();}
    else if(g.t==='P'){c.fillStyle=g.c;for(const p of a)c.fill(p);}
    else{for(let i=0;i<n;i+=6){const x1=a[i],y1=a[i+1],x2=a[i+4],y2=a[i+5];if(Math.max(x1,x2)<vx0-30||Math.min(x1,x2)>vx1+30||Math.max(y1,y2)<vy0-30||Math.min(y1,y2)>vy1+30)continue;c.moveTo(x1,y1);c.quadraticCurveTo(a[i+2],a[i+3],x2,y2);}c.strokeStyle=g.c;c.lineWidth=g.lw;c.stroke();}
    if(cl)c.restore();}}
const BMP_S=0.4;
function renderBitmap(S){const cv=document.createElement('canvas');cv.width=Math.ceil(S.W*BMP_S);cv.height=Math.ceil(S.H*BMP_S);const c=cv.getContext('2d');c.setTransform(BMP_S,0,0,BMP_S,0,0);drawPrims(c,S,-1e9,-1e9,1e9,1e9);return cv;}

const hEl=$('hist'),hcv=$('histCv'),hctx=hcv.getContext('2d');
function histLayout(){const W=innerWidth,H=innerHeight,d=Math.min(2,window.devicePixelRatio||1);HS.dpr=d;hcv.width=Math.round(W*d);hcv.height=Math.round(H*d);
  const mob=layoutMode()!=='desk',l=FR.l+(mob?8:14),r=FR.r-(mob?8:14),t=FR.t+(mob?6:14),b=FR.b-6;
  const bar=$('histBar'),brd=document.querySelector('.brand').getBoundingClientRect(),bl=(!mob&&t<brd.bottom+4&&l<brd.right+12)?brd.right+18:l;bar.classList.toggle('shift',bl>l);bar.style.left=bl+'px';bar.style.top=t+'px';bar.style.width=(r-bl)+'px';if(!mob&&bar.offsetHeight>44)bar.classList.add('shift');const barH=Math.max(34,bar.offsetHeight||34),stripH=clamp((b-t)*0.15,mob?34:46,110);
  const oldW=HS.SR?HS.SR.w:0,oldH=HS.SR?HS.SR.h:0,sT=t+barH+8;
  /* desktop: the dermoscopy strip starts right of the brand card where they would overlap */
  const sl=(!mob&&!AUD.on&&sT<brd.bottom&&sT+stripH>brd.top&&l<brd.right+8)?Math.min(brd.right+12,r-120):l;
  HS.BAR={l,t,w:r-l,h:barH};HS.STR={l:sl,t:sT,w:r-sl,h:stripH};HS.SR={l,t:sT+stripH+8,w:r-l,h:Math.max(80,b-(sT+stripH+8))};
  if(HS.on&&HS.S&&oldW&&(Math.abs(oldW-HS.SR.w)>40||Math.abs(oldH-HS.SR.h)>40))histFit(HS.fitKind||'fit');HS.dirty=true;}
function histFit(kind){const S=HS.S,SR=HS.SR;if(!S||!SR)return;HS.fitKind=kind;
  if(kind==='lesion'&&S.lesX.length){const a=Math.min(...S.lesX.map(v=>v[0])),b=Math.max(...S.lesX.map(v=>v[1])),needH=L&&L.kind==='nail'?3400:L&&L.evo?Math.max(760,L.brs?L.brs.mm*1000+420:0):1500;HS.s=Math.min(SR.w/(b-a+500),SR.h/needH);HS.ox=SR.l+SR.w/2-((a+b)/2)*HS.s;
    let ymin=1e9;for(let x=a;x<=b;x+=40)ymin=Math.min(ymin,S.at(S.yS,x));HS.oy=SR.t+14-(ymin-60)*HS.s;}
  else{HS.s=SR.w/S.W;HS.ox=SR.l;HS.oy=SR.t+6;}HS.dirty=true;}
function histZoomAt(px,py,k){const S=HS.S;if(!S)return;const s2=clamp(HS.s*k,HS.SR.w/S.W*0.8,8);HS.ox=px-(px-HS.ox)*s2/HS.s;HS.oy=py-(py-HS.oy)*s2/HS.s;HS.s=s2;HS.dirty=true;}
function histCenterOn(x,y,s){HS.s=s;HS.ox=HS.SR.l+HS.SR.w/2-x*s;HS.oy=HS.SR.t+HS.SR.h/2-y*s;HS.dirty=true;}
const hcid=()=>L?(L.hcase||L.id):'plain';
function histItems(){if(!L||state.chapter===4||L.id==='plain')return H_NORMAL;if(L.hItems)return L.hItems;return H_CASE[hcid()]||[];}
function pickPins(){const S=HS.S,normalCh=state.chapter===4;
  HS.items=histItems().map(it=>{const l=S&&S.A[it.a];let best=null;
    if(l&&l.length){if(NORMAL_TAGS.has(it.a)){let bd=1e9;for(const p of l){if(p.r<1.25)continue;const dd=Math.abs(p.x-1500);if(dd<bd){bd=dd;best=p;}}if(!best)best=l[0];}
      else if(it.pick==='edge'){let br=-1;for(const p of l){if(p.r<1.05&&p.r>br){br=p.r;best=p;}}if(!best)best=l[0];}
      else{let br=1e9;for(const p of l){if(p.r<br){br=p.r;best=p;}}}}
    return Object.assign({},it,{p:best});});
  const box=$('histPins');box.innerHTML='';
  HS.items.forEach((it,i)=>{if(!it.p)return;const b=document.createElement('button');b.type='button';b.className='hpin'+(HS.sel===i?' on':'');b.innerHTML=`${i+1}<span>${hiText(it,'n',hcid())}</span>`;
    b.addEventListener('click',e=>{e.stopPropagation();selectHist(i);});box.appendChild(b);it.el=b;});}
function histKey(){return (L?L.id:'plain')+'|'+HS.z.toFixed(3)+'|'+(state.chapter===4?'n':'c');}
function rebuildSlide(refit){HS.S=buildSlide();HS.bmp=renderBitmap(HS.S);HS.key=histKey();pickPins();if(refit||!HS.fitted){histFit(HS.S.lesX.length&&state.chapter!==4?'lesion':'fit');HS.fitted=true;}
  $('hz').value=HS.z;$('hzV').textContent=hzLab(HS.z);HS.dirty=true;renderHistLists();}
function selectHist(i,keepZoom){HS.sel=(HS.sel===i&&!keepZoom)?-1:i;const it=HS.items[i];
  if(HS.sel>=0&&it){if(!it.p){const z=typeof it.z==='function'?it.z(L):(it.z||0);if(Math.abs(z-HS.z)>0.001){HS.z=z;rebuildSlide(false);}const it2=HS.items[i];if(it2&&it2.p&&!keepZoom)histCenterOn(it2.p.x,it2.p.y,Math.max(HS.s,1.5));}
    else if(!keepZoom)histCenterOn(it.p.x,it.p.y,Math.max(HS.s,1.5));}
  HS.items.forEach((x,k)=>x.el&&x.el.classList.toggle('on',k===HS.sel));HS.dirty=true;renderHistLists();}
function enterHist(){HS.on=true;hEl.hidden=false;hideHint();histLayout();if(!HS.S||HS.key!==histKey())rebuildSlide(true);else{pickPins();HS.dirty=true;}}
function exitHist(){HS.on=false;hEl.hidden=true;if(HS.autoMin){HS.autoMin=false;if(!AUD.on&&$('panel').classList.contains('min'))setNotesMin(false);}}
function openHistAt(z,xmm,dmm,sid){HS.z=Math.round(z*100)/100;if(state.view!=='hist')setView('hist');else rebuildSlide(false);if(HS.key!==histKey())rebuildSlide(false);
  let idx=sid?HS.items.findIndex(it=>it.m===sid&&it.p):-1;if(idx>=0){HS.sel=-1;selectHist(idx);}
  else if(xmm!=null){HS.sel=-1;pickPins();histCenterOn(HS.S.U(xmm),HS.S.yAt(xmm,dmm||0),Math.max(1.1,HS.s));renderHistLists();}}

function niceScale(s){for(const v of[10,20,50,100,200,500,1000,2000]){if(v*s>=60)return v;}return 2000;}
function drawSlide(){HS.dirty=false;const S=HS.S;if(!S||!HS.SR)return;const c=hctx,d=HS.dpr,W=innerWidth,H=innerHeight,SR=HS.SR,STR=HS.STR,s=HS.s,ox=HS.ox,oy=HS.oy;
  c.setTransform(d,0,0,d,0,0);c.fillStyle=TC.ground;c.fillRect(0,0,W,H);
  // dermoscopy strip, same x scale as the slide
  c.save();c.beginPath();c.rect(STR.l,STR.t,STR.w,STR.h);c.clip();c.fillStyle=TC.strip;c.fillRect(STR.l,STR.t,STR.w,STR.h);
  const src=texFor(state.mode),hb=clamp((STR.h/2)/s*(1024/S.W),2,300),ty=(HS.z+4)*128;c.imageSmoothingEnabled=true;c.drawImage(src,0,ty-hb,1024,2*hb,ox,STR.t,S.W*s,STR.h);
  c.setLineDash([7,5]);c.strokeStyle='rgba(242,228,201,0.95)';c.lineWidth=1.3;c.beginPath();c.moveTo(STR.l,STR.t+STR.h/2);c.lineTo(STR.l+STR.w,STR.t+STR.h/2);c.stroke();c.setLineDash([]);
  c.font='500 10.5px "IBM Plex Mono",monospace';const lab=t('hist.strip',{m:t('mode.name'+state.mode).toUpperCase()});const tw=c.measureText(lab).width;
  c.fillStyle='rgba(4,12,16,0.78)';c.fillRect(STR.l+6,STR.t+6,tw+14,19);c.fillStyle='#F2E4C9';c.fillText(lab,STR.l+13,STR.t+19.5);c.restore();
  // slide
  c.save();c.beginPath();c.rect(SR.l,SR.t,SR.w,SR.h);c.clip();
  if(s<0.42&&HS.bmp){c.imageSmoothingEnabled=true;c.drawImage(HS.bmp,ox,oy,S.W*s,S.H*s);}
  else{c.setTransform(d*s,0,0,d*s,d*ox,d*oy);drawPrims(c,S,(SR.l-ox)/s,(SR.t-oy)/s,(SR.l+SR.w-ox)/s,(SR.t+SR.h-oy)/s);c.setTransform(d,0,0,d,0,0);}
  c.restore();c.strokeStyle='rgba(188,214,221,0.25)';c.lineWidth=1;c.strokeRect(SR.l+0.5,SR.t+0.5,SR.w-1,SR.h-1);c.strokeRect(STR.l+0.5,STR.t+0.5,STR.w-1,STR.h-1);
  if(S.brs){const b=S.brs,px=ox+b.x*s,y0=oy+b.y0*s,y1=oy+b.y1*s;if(px>SR.l&&px<SR.l+SR.w){c.save();c.beginPath();c.rect(SR.l,SR.t,SR.w,SR.h);c.clip();
    c.strokeStyle='rgba(20,12,24,0.85)';c.lineWidth=5;c.beginPath();c.moveTo(px,y0);c.lineTo(px,y1);c.stroke();
    c.strokeStyle='#F2E4C9';c.lineWidth=2;c.beginPath();c.moveTo(px,y0);c.lineTo(px,y1);c.moveTo(px-9,y0);c.lineTo(px+9,y0);c.moveTo(px-9,y1);c.lineTo(px+9,y1);c.stroke();
    const lab=t('evo.breslow',{v:nf(b.mm.toFixed(1))});c.font='600 12px "IBM Plex Mono",monospace';const tw=c.measureText(lab).width,ly=Math.max(SR.t+16,Math.min(SR.t+SR.h-16,(y0+y1)/2));
    c.fillStyle='rgba(20,12,24,0.86)';c.fillRect(px+13,ly-11,tw+14,22);c.fillStyle='#F2E4C9';c.fillText(lab,px+20,ly+4);c.restore();}}
  // selected pin guide: straight up into the dermoscopy strip
  const sel=HS.items[HS.sel];if(sel&&sel.p){const px=ox+sel.p.x*s,py=oy+sel.p.y*s;if(px>SR.l&&px<SR.l+SR.w){c.setLineDash([4,4]);c.strokeStyle='rgba(242,228,201,0.95)';c.lineWidth=1.4;c.beginPath();c.moveTo(px,STR.t);c.lineTo(px,Math.max(SR.t,Math.min(py-13,SR.t+SR.h)));c.stroke();c.setLineDash([]);
    c.beginPath();c.arc(px,STR.t+STR.h/2,5,0,TAU);c.fillStyle='#F2E4C9';c.fill();}}
  // scale bar
  const sb=niceScale(s),bx=SR.l+14,by=SR.t+SR.h-16;c.fillStyle='rgba(10,14,18,0.75)';c.fillRect(bx-6,by-18,sb*s+64,26);c.fillStyle='#F2E4C9';c.fillRect(bx,by-2,sb*s,3);
  c.font='500 11px "IBM Plex Mono",monospace';c.fillText(sb>=1000?nf(sb/1000)+' mm':sb+' µm',bx+sb*s+8,by+3);
  // pins
  for(const it of HS.items){if(!it.el)continue;const px=ox+it.p.x*s,py=oy+it.p.y*s;const vis=px>SR.l+4&&px<SR.l+SR.w-4&&py>SR.t+4&&py<SR.t+SR.h-4;
    const hw=it.hw||(it.hw=(it.el.offsetWidth||22)/2);it.el.classList.toggle('l',px>SR.l+SR.w*0.55);
    it.el.style.transform=vis?`translate(${(px-hw).toFixed(1)}px,${(py-hw).toFixed(1)}px)`:'translate(-9999px,0)';}
  $('hMag').textContent=`${nf((1/s).toFixed(s>2?2:1))} µm/px · ≈${Math.max(1,Math.round(s*10))}×`;}

/* pan and zoom */
(function(){const ptr=new Map();let pd=0;
  hcv.addEventListener('pointerdown',e=>{hcv.setPointerCapture(e.pointerId);ptr.set(e.pointerId,{x:e.clientX,y:e.clientY});hcv.style.cursor='grabbing';if(ptr.size===2){const[a,b]=[...ptr.values()];pd=Math.hypot(a.x-b.x,a.y-b.y);}});
  hcv.addEventListener('pointermove',e=>{const p=ptr.get(e.pointerId);if(!p)return;const dx=e.clientX-p.x,dy=e.clientY-p.y;p.x=e.clientX;p.y=e.clientY;
    if(ptr.size===1){HS.ox+=dx;HS.oy+=dy;HS.dirty=true;}else if(ptr.size===2){const[a,b]=[...ptr.values()];const dd=Math.hypot(a.x-b.x,a.y-b.y);if(pd>0)histZoomAt((a.x+b.x)/2,(a.y+b.y)/2,dd/pd);pd=dd;}});
  const up=e=>{ptr.delete(e.pointerId);if(ptr.size<2)pd=0;hcv.style.cursor='grab';};hcv.addEventListener('pointerup',up);hcv.addEventListener('pointercancel',up);
  hcv.addEventListener('wheel',e=>{e.preventDefault();histZoomAt(e.clientX,e.clientY,Math.exp(-e.deltaY*0.0016));},{passive:false});
  hcv.addEventListener('dblclick',e=>histZoomAt(e.clientX,e.clientY,2));
  document.querySelectorAll('[data-hf]').forEach(b=>b.addEventListener('click',()=>{const k=b.dataset.hf,SR=HS.SR;if(k==='in')histZoomAt(SR.l+SR.w/2,SR.t+SR.h/2,1.6);else if(k==='out')histZoomAt(SR.l+SR.w/2,SR.t+SR.h/2,1/1.6);else histFit(k);}));
  let zt=0;const hz=$('hz');hz.addEventListener('input',()=>{const v=+hz.value;$('hzV').textContent=hzLab(v);clearTimeout(zt);zt=setTimeout(()=>{HS.z=v;HS.sel=-1;rebuildSlide(false);},160);});})();

/* histology list in the notes panel */
function renderHistLists(){const el=$('hlist');if(!el)return;const fresh=HS.S&&HS.key===histKey();const items=fresh?HS.items:histItems();const cid=hcid();
  el.innerHTML=items.map((it,i)=>{const si=it.m?L.structures.findIndex(s=>s.sid===it.m):-1;const ds=si>=0?L.structures[si]:null;const dn=ds?stext(ds,'name'):'';
    return`<li class="sitem ${fresh&&HS.sel===i?'on':''}"><button type="button" data-h="${i}"><b>${i+1}</b><span class="nm">${hiText(it,'n',cid)}<span class="ly">${fresh&&!it.p?t('hl.absent'):ds?t('hl.derm')+dn:t('hl.only')}</span></span><span></span></button>
      <div class="body"><p>${hiText(it,'d',cid)}</p>${ds?`<button type="button" class="linkbtn" data-dl="${si}">${t('hl.derm')}${dn}</button>`:''}</div></li>`;}).join('');
  el.querySelectorAll('[data-h]').forEach(b=>b.addEventListener('click',()=>{const i=+b.dataset.h;if(state.view!=='hist'){setView('hist');HS.sel=-1;}selectHist(i);}));
  el.querySelectorAll('[data-dl]').forEach(b=>b.addEventListener('click',()=>{const i=+b.dataset.dl;if(state.chapter===5)state.atlasTab='derm';setView('lens');selectStructure(i);renderPanel();}));}

/* =====================================================================
   Virtual H&E of the nail unit: a longitudinal section through z = HS.z,
   proximal nail fold on the left, free edge on the right, at true
   proportions in µm (16 mm long). Uses the drawing groups of the skin
   slide plus bone.
   ===================================================================== */
(function(){const i=GDEF.findIndex(g=>g[0]==='dfP');GDEF.splice(i,0,['boneM','P','#F7E3EC',1,'d'],['boneT','Q','#DE8BBA',46,'d'],['boneC','Q','#D982B4',70,'d'],['plateL','L','#E58DB5',1.1,'t'],['ost','E','#4E2E7E',1,'d']);})();
const NHC={plate:'#EFA3C5',matrix:'#E9B4D0',bed:'#EBAEC9',epi:'#EDB2CB',derm:'#F6D0DF',fderm:'#F5CBDB',bone:'#F7E3EC',cut:'#F3C0D6',crust:'#EFB29E'};
function buildNailSlide(){const Lm=L,N=Lm.nail,zc=HS.z,rng=mulberry32((Lm.seed*7919+Math.round(zc*1000)*31+29)|0);
  const NN=1000,NX=NN+1,W=16000,X=i=>i*16,xu=i=>-4+i*0.008,U=x=>(x+4)*2000,mk=()=>new Float32Array(NX);
  const top0=1500,H=top0+4300;
  const yS=mk(),yF1=mk(),yF2=mk(),yP0=mk(),yP1=mk(),yE1=mk(),yB=mk(),MAT=mk(),HYP=mk(),FO=mk(),ND=mk(),BP=mk(),LS=mk(),HUT=mk();
  for(let i=0;i<NX;i++){const x=xu(i),g=nailGeo(x,zc),ds=N.dystAt?N.dystAt(x,zc):0,nd=N.nodAt?N.nodAt(x,zc):0,fold=g.riseP*(1-g.lat)+g.lat;
    const foldT=fold*820,epon=Math.min(foldT*0.08,48)*g.prox*smoothstep(NU.x0-0.1,NU.x0+0.2,x),plateT=520*g.plate*(1-0.45*ds)*(1-nd);
    let ep=lerp(55,lerp(230,160,smoothstep(NU.x0,nxL(zc),x))*smoothstep(NU.x0-0.15,NU.x0+0.15,x),g.mat);ep=lerp(ep,190,g.hyp)*(1-g.lat)+nd*520;
    yP0[i]=top0-nd*650;yS[i]=yP0[i]-foldT;yF1[i]=yS[i]+Math.min(foldT,85);yF2[i]=yP0[i]-epon;yP1[i]=yP0[i]+plateT;yE1[i]=yP1[i]+ep;
    yB[i]=Math.min(H-40,yE1[i]+lerp(1000,1150,g.mat)+2700*smoothstep(2.7,3.5,x));MAT[i]=g.mat;HYP[i]=g.hyp;FO[i]=fold;ND[i]=nd;
    BP[i]=N.bands.length?nailBandAt(Lm,x,zc):0;LS[i]=nailLesAt(Lm,x,zc);HUT[i]=nailHutAt(Lm,x,zc);}
  const at=(A,x)=>{const f=Math.min(NN-1e-6,Math.max(0,x/16)),i=f|0,t=f-i;return A[i]+(A[i+1]-A[i])*t;},xOf=x=>x/2000-4;
  const G={},groups=GDEF.map(([k,t,c,lw,cl])=>(G[k]={k,t,c,lw:lw||1,cl:cl||null,a:[]}));
  const E=(g,x,y,rx,ry,rot)=>{G[g].a.push(x,y,rx,ry,rot||0);},C=(g,x,y,r)=>{G[g].a.push(x,y,r);},Ln=(g,x1,y1,x2,y2)=>{G[g].a.push(x1,y1,x2,y2);},Q=(g,x1,y1,cx,cy,x2,y2)=>{G[g].a.push(x1,y1,cx,cy,x2,y2);},Pg=(g,p)=>{G[g].a.push(p);};
  const A={},anc=(t,x,y,r)=>{const l=A[t]||(A[t]=[]);if(l.length<80)l.push({x,y,r});};
  const band=(T,B,i0,i1)=>{const p=new Path2D();p.moveTo(X(i0),T[i0]);for(let i=i0+1;i<=i1;i++)p.lineTo(X(i),T[i]);for(let i=i1;i>=i0;i--)p.lineTo(X(i),B[i]);p.closePath();return p;};
  const ivals=pred=>{const o=[];let s=-1;for(let i=0;i<=NN;i++){const v=pred(i);if(v&&s<0)s=i;if(s>=0&&(!v||i===NN)){const e=v?i:i-1;if(e>s)o.push([s,e]);s=-1;}}return o;};
  const bot=mk().fill(H),full=new Path2D();full.rect(0,0,W,H);
  const regions=[{p:full,c:HC.glass},{p:band(yB,bot,0,NN),c:NHC.bone},{p:band(yE1,yB,0,NN),c:NHC.derm}];
  for(const[a,b]of ivals(i=>yE1[i]-yP1[i]>3))regions.push({p:band(yP1,yE1,a,b),c:NHC.matrix});
  for(const[a,b]of ivals(i=>yE1[i]-yP1[i]>3&&MAT[i]<0.5))regions.push({p:band(yP1,yE1,a,b),c:NHC.bed});
  for(const[a,b]of ivals(i=>yP1[i]-yP0[i]>3))regions.push({p:band(yP0,yP1,a,b),c:NHC.plate});
  for(const[a,b]of ivals(i=>yP0[i]-yS[i]>20)){regions.push({p:band(yS,yF1,a,b),c:NHC.epi});regions.push({p:band(yF1,yF2,a,b),c:NHC.fderm});regions.push({p:band(yF2,yP0,a,b),c:NHC.epi});}
  // cuticle: keratin made by the ventral fold, carried onto the plate
  {const ic=Math.round((nxC(zc)+4)/0.008),T=mk(),B=mk();for(let i=Math.max(0,ic-12);i<=Math.min(NN,ic+40);i++){const t=(i-ic)/40;B[i]=yP0[i];T[i]=yP0[i]-Math.max(0,24*(1-Math.max(0,t))*(t<-0.2?0:1));}
    regions.push({p:band(T,B,Math.max(0,ic-12),Math.min(NN,ic+40)),c:NHC.cut});anc('ncut',X(ic+14),yP0[ic+14]-10,1);}
  // nodule surface: ulcer crust
  if(N.nod)for(const[a,b]of ivals(i=>ND[i]>0.5)){const T=mk(),B=mk();for(let i=a;i<=b;i++){T[i]=yS[i]-40*ND[i];B[i]=yS[i]+18;}regions.push({p:band(T,B,a,b),c:NHC.crust});
    for(let x=X(a);x<X(b);x+=7)for(let k=0;k<3;k++){const y=lerp(at(T,x),at(yS,x)+12,rng()),u=rng();if(u<0.35)C('crustN',x+rng()*6,y,1.6);else if(u<0.6)C('rbcX',x+rng()*6,y,3.2);else Ln('fibrin',x,y,x+8+rng()*14,y+(rng()-0.5)*4);}
    anc('nulc',X((a+b)>>1),yS[(a+b)>>1],0);}
  const dP=new Path2D(),tP=new Path2D();dP.moveTo(0,H+20);tP.moveTo(0,H+20);for(let i=0;i<=NN;i++){dP.lineTo(X(i),yE1[i]+0.8);tP.lineTo(X(i),Math.min(yS[i],yP0[i])-0.5);}dP.lineTo(W,H+20);dP.closePath();tP.lineTo(W,H+20);tP.closePath();
  const bm=new Path2D();{let pen=false;for(let i=0;i<=NN;i++){if(yE1[i]-yP1[i]>4&&ND[i]<0.5){pen?bm.lineTo(X(i),yE1[i]):bm.moveTo(X(i),yE1[i]);pen=true;}else pen=false;}}
  const melano=(x,y,atyp,pig)=>{E('melCyto',x,y,atyp?6.6:5.4,atyp?6:4.9,rng());if(atyp){E('nucD',x,y,3.6+rng()*1.3,3+rng()*1.1,rng()*3);C('nucleolus',x+(rng()-0.5)*1.6,y+(rng()-0.5)*1.6,0.95);}else E('nuc',x,y,2.8,2.5,rng()*3);
    const g=Math.round(pig*(2+5*rng()));for(let k=0;k<g;k++)C('mel',x+(rng()-0.5)*10,y+(rng()-0.5)*9,0.85);};
  const les=N.les,kind=les?les.kind:null,lvl=Lm.evo?Lm.evo.k:0,mel=kind==='mel';
  /* proximal fold: dorsal epidermis with granular layer and keratin, ventral epithelium (eponychium) with granular layer */
  for(let x=4;x<W;x+=9+rng()*2){const i=Math.round(x/16),ft=yP0[Math.min(NN,i)]-yS[Math.min(NN,i)];if(ft<60)continue;const ys=at(yS,x),y1=at(yF1,x),y2=at(yF2,x),y3=at(yP0,x),hu=at(HUT,x);
    for(let y=y1-6;y>ys+14;y-=9.5)E('nuc',x+(rng()-0.5)*4,y,3.2,2.6,0);E('nucB',x,y1-4,4,2.4,1.57);E('nuc',x,ys+10,3.8,1.4,0);for(let g=0;g<3;g++)C('gran',x+(rng()-0.5)*8,ys+10+(rng()-0.5)*3,0.9);
    if(rng()<0.6)Ln('scLam',x,ys+2+rng()*5,x+12+rng()*10,ys+2+rng()*5);
    if(y3-y2>12){E('nucB',x,y2+4,3.8,2.2,1.57);for(let y=y2+12;y<y3-8;y+=9)E('nuc',x+(rng()-0.5)*4,y,3,2.4,0);for(let g=0;g<3;g++)C('gran',x+(rng()-0.5)*8,y3-6+(rng()-0.5)*2,0.9);}
    if(rng()<0.06)E('fib',x,lerp(y1,y2,0.2+0.6*rng()),4.6,1.2,(rng()-0.5)*0.6);
    if(hu>0.15&&rng()<hu*0.8){melano(x,y1-6,true,0.9);if(rng()<0.25)melano(x+3,lerp(ys+20,y1-15,rng()),true,0.7);if(y3-y2>12&&rng()<0.6)melano(x,y2+6,true,0.8);if(rng()<0.04)anc('nfoldmel',x,y1-6,1-hu);}}
  for(let x=0;x<W;x+=60){const i=Math.round(x/16);if(yF2[i]-yF1[i]>200){for(let k=0;k<6;k++){const y=lerp(yF1[i]+30,yF2[i]-30,rng()),a=(rng()-0.5)*0.5;Ln('papFib',x,y,x+40*Math.cos(a),y+40*Math.sin(a));}if(rng()<0.25){const vy=lerp(yF1[i]+80,yF2[i]-80,rng());E('vWall',x,vy,9,7,0);E('lumen',x,vy,6.5,4.5,0);}}}
  /* nail plate: compact keratin laminated parallel to its surfaces, melanin in the ventral layer when the source is the distal matrix */
  for(let x=0;x<W;x+=22){const i=Math.round(x/16),y0=yP0[Math.min(NN,i)],y1=yP1[Math.min(NN,i)],th=y1-y0;if(th<20)continue;for(let y=y0+6;y<y1-4;y+=9){if(rng()<0.75)Ln('plateL',x,y+(rng()-0.5)*2,x+18+rng()*10,y-1.5+(rng()-0.5)*2);}
    const bp=at(BP,x);if(bp>0.02){const n=Math.round(bp*th/6);for(let k=0;k<n;k++){const t=N.origin==='proximal'?rng()*0.55:N.origin==='both'?rng():0.4+rng()*0.6,xx=x+rng()*22,y=y0+th*t;C(rng()<0.5?'mel':'melC',xx,y,0.9+rng()*0.6);}
      if(rng()<0.06)anc('nplatepig',x+10,y0+th*(N.origin==='proximal'?0.25:0.72),1-bp);}
    if(rng()<0.04)anc('nplate',x,y0+th*0.5,2);}
  if(N.hema){const h=N.hema;for(let x=U(h.x-h.rx);x<U(h.x+h.rx);x+=6){const r=Math.abs(xOf(x)-h.x)/h.rx;if(r>1)continue;const y1=at(yP1,x),dep=60*(1-r*r)+10;for(let y=y1-dep*0.6;y<y1+dep*0.4;y+=6)if(rng()<0.85)C('rbcX',x+(rng()-0.5)*5,y,3.1);}
    anc('nblood',U(h.x),at(yP1,U(h.x)),0);}
  /* matrix, bed and hyponychium epithelium; matrix cells keratinize obliquely, without a granular layer */
  for(let x=4;x<W;x+=8.6+rng()*2){const i=Math.min(NN,Math.round(x/16)),y1=yP1[i],y2=yE1[i],th=y2-y1;if(th<20||ND[i]>0.5)continue;const mt=MAT[i],hy=HYP[i],ls=at(LS,x);
    E('nucB',x,y2-4.5,4.1,2.4,1.57);
    for(let y=y2-13;y>y1+(hy>0.5?16:6);y-=9.2+rng()*1.5){const u=(y2-y)/th;if(mt>0.5&&u>0.62){E('nucS',x+(rng()-0.5)*4,y,3.4,1.2,-0.55);if(rng()<0.2)C('gran',x,y,0.7);}else E('nuc',x+(rng()-0.5)*4,y,3.2,2.7*(1-0.4*u),0);
      if(kind==='act'&&ls>0.3&&rng()<0.5)C('mel',x+(rng()-0.5)*6,y+(rng()-0.5)*6,0.9);
      if(mel&&ls>0.3&&lvl>=1&&u>0.15&&u<0.85&&rng()<0.03*ls*les.a){melano(x+(rng()-0.5)*4,y,true,0.8);if(rng()<0.25)anc('npag',x,y,1-ls);}}
    if(hy>0.5){for(let g=0;g<4;g++)C('gran',x+(rng()-0.5)*8,y1+8+(rng()-0.5)*3,0.9);if(rng()<0.5)Ln('scLam',x,y1+2,x+12,y1+3);}
    // melanocytes along the basal layer
    const by=y2-6;if(mel&&ls>0.2){if(rng()<0.55*ls*les.a+0.08){melano(x,by,true,0.9);if(rng()<0.06)anc('nmatmel',x,by,1-ls);}
      if(lvl>=1&&rng()<0.025*ls){for(let q=0;q<4;q++)melano(x+(rng()-0.5)*16,by-(rng()*12),true,0.9);anc('nmatmel',x,by,1-ls);}}
    else if(kind==='nev'&&ls>0.3&&rng()<0.06){const rx=16+rng()*8,ry=12+rng()*5;E('cleft',x,by+3,rx+3,ry+3,0);E('nestBody',x,by+2,rx,ry,0);for(let q=0;q<9;q++){const a=rng()*TAU,qq=Math.sqrt(rng())*0.8;E('nuc',x+Math.cos(a)*qq*rx,by+2+Math.sin(a)*qq*ry,2.6,2.3,rng()*3);}for(let q=0;q<10;q++)C('mel',x+(rng()-0.5)*rx*1.6,by+(rng()-0.5)*ry*1.4,0.85);anc('nnest',x,by,1-ls);}
    else if(kind==='act'&&ls>0.3){if(rng()<0.12){melano(x,by,false,1);anc('nact',x,by,1-ls);}}
    else if(mt>0.5&&rng()<0.06)melano(x,by,false,mt*0.4);
    if(rng()<0.012)anc(mt>0.5?'nmat':'nbed',x,lerp(y1,y2,0.5),mt>0.5?2:3);}
  {const ix=Math.round((nxL(zc)-0.25+4)/0.008);anc('nlun',X(ix),lerp(yP1[ix],yE1[ix],0.5),2);}
  /* dermis: longitudinal collagen, capillaries, invasive tumour */
  for(let y=Math.min(...yE1)+10;y<H;y+=13+rng()*8)for(let x=rng()*40;x<W;x+=50+rng()*40){const i=Math.min(NN,Math.round(x/16));if(y<yE1[i]+8||y>yB[i]-10)continue;const a=(rng()-0.5)*0.5,l=30+rng()*50;Ln('papFib',x,y,x+Math.cos(a)*l,y+Math.sin(a)*l);if(rng()<0.12)E('fib',x+10,y+3,4.6,1.2,a);}
  for(let x=200+rng()*200;x<W;x+=260+rng()*240){const i=Math.min(NN,Math.round(x/16));if(yB[i]-yE1[i]<200)continue;const y=yE1[i]+60+rng()*(yB[i]-yE1[i]-160),r=5+rng()*6;E('vWall',x,y,r*1.6+2.4,r+2.4,0);E('lumen',x,y,r*1.6,r,0);for(let k=0;k<r*1.5;k++)C('rbc',x+(rng()-0.5)*r*2,y+(rng()-0.5)*r,3.1);}
  if(les&&les.inv>0){const x0=U(les.x0),x1=U(N.nod?N.nod.x+0.9:les.x1);for(let x=x0;x<x1;x+=13){const i=Math.min(NN,Math.round(x/16)),ls=Math.max(LS[i],ND[i]);if(ls<0.25&&!N.nod)continue;const dep=(N.nod?1300*Math.max(ND[i],0.3*LS[i]):260)*les.inv;
      for(let y=yE1[i]+8;y<yE1[i]+dep&&y<yB[i]-30;y+=13){if(rng()>0.8*Math.max(0.35,ls))continue;E('cellM',x,y,6.6+rng()*1.6,5.8+rng()*1.3,rng()*3);const nr=3+rng()*2.3;E(rng()<0.5?'nucV':'nucD',x,y,nr,nr*0.8,rng()*3);C('nucleolus',x+(rng()-0.5)*1.4,y+(rng()-0.5)*1.4,1.1);if(rng()<0.25)C('mel',x+3,y-2,0.9);if(rng()<0.03)anc('ninv',x,y,0);}
      if(rng()<0.25)C('lym',x+(rng()-0.5)*10,yE1[i]+dep+rng()*30,2.7);}}
  if(N.nod){for(let x=0;x<W;x+=9){const i=Math.min(NN,Math.round(x/16));if(ND[i]<0.4)continue;for(let y=yS[i]+20;y<yE1[i]-8;y+=12){if(rng()<0.75){E('cellM',x,y,6.4,5.6,rng()*3);E(rng()<0.5?'nucV':'nucD',x,y,3.2+rng()*2,2.8+rng()*1.5,rng()*3);}if(rng()<0.03){const r=5+rng()*5;E('vWall',x,y,r+2.4,r+2.4,0);E('lumen',x,y,r,r,0);}}}}
  /* distal phalanx: cortex, trabeculae, marrow */
  for(let x=0;x<W;x+=18){const i=Math.min(NN,Math.round(x/16));if(yB[i]>H-80)continue;const y=yB[i];Q('boneC',x,y+34,x+9,y+32+(rng()-0.5)*4,x+20,at(yB,x+20)+34);}
  {const SP=230,nodes=new Map(),key=(a,b)=>a+','+b;for(let gy=0;gy*SP<H+SP;gy++)for(let gx=0;gx*SP<W+SP;gx++)nodes.set(key(gx,gy),[gx*SP+(rng()-0.5)*SP*0.7,gy*SP+(rng()-0.5)*SP*0.7]);
    const inB=(x,y)=>{const i=Math.min(NN,Math.max(0,Math.round(x/16)));return y>yB[i]+70&&yB[i]<H-150;};
    for(const[k,p]of nodes){const[gx,gy]=k.split(',').map(Number);for(const[dx,dy]of[[1,0],[0,1],[1,1]]){if(rng()<0.3)continue;const q=nodes.get(key(gx+dx,gy+dy));if(!q||!inB(p[0],p[1])||!inB(q[0],q[1]))continue;
      const mx=(p[0]+q[0])/2+(rng()-0.5)*60,my=(p[1]+q[1])/2+(rng()-0.5)*60;Q('boneT',p[0],p[1],mx,my,q[0],q[1]);if(rng()<0.7)E('ost',mx,my,3.2,1.6,Math.atan2(q[1]-p[1],q[0]-p[0]));}}
    for(let k=0;k<360;k++){const x=rng()*W,y=rng()*H;if(!inB(x,y))continue;const r=20+rng()*14;E('fatW',x,y,r,r*0.9,0);C('fatR',x,y,r);}}
  {let bi=-1;for(let i=420;i<760;i++)if(yB[i]<H-300){bi=i;break;}if(bi>=0)anc('nbone',X(bi),yB[bi]+180,3);}
  let brs=null;if(Lm.brs&&Math.abs(Lm.brs.z-zc)<0.4){const px=U(Lm.brs.x),i=Math.round(px/16),y0=yS[i];brs={x:px,y0,y1:y0+Lm.brs.mm*1000,mm:Lm.brs.mm};}
  const lx=les?[U(les.x0-0.35),U(N.nod?N.nod.x+N.nod.r:Math.min(3.6,les.x1+2.2))]:N.hema?[U(N.hema.x-N.hema.rx-0.4),U(N.hema.x+N.hema.rx+0.4)]:[U(-3),U(3.5)];
  return{W,H,top0,yS,at,regions,bm,groups,A,zc,cid:'nail',brs,U,clips:{d:dP,t:tP},yAt:(xmm,d)=>at(yS,U(xmm))+d*1000,lesX:[lx],nail:true};}

/* =====================================================================
   Chapter 07 UI: timeline, cross-fading lens image, stage comparison,
   growth arrows and the Breslow ruler.
   ===================================================================== */
Object.assign(I18N.en,{'ch.evo':'How lesions evolve','c6.kicker':'07 · Evolution','evo.stage':'Stage {n} of {m}','evo.see':'Through the lens','evo.tis':'In the tissue','evo.key':'Key point',
  'evo.new':'new','evo.gone':'No longer seen:','evo.path':'The whole sequence','evo.play':'Play','evo.pause':'Pause','evo.cmp':'Compare','evo.cmpT':'Split the lens: previous stage on the left',
  'evo.prev':'PREVIOUS','evo.now':'NOW','evo.first':'FIRST STAGE','evo.breslow':'Breslow {v} mm','evo.insitu':'in situ · no Breslow thickness','evo.clark':'Clark {v}',
  'evo.hint':'Drag the timeline, click a stage or use ◀ ▶ and the space bar. The light mode can be switched at any stage; the arrows in 3D show where the lesion is growing.',
  'evo.src':'Sources:','evo.srcTail':'Stages are schematic: they show a typical course, not the fate of every lesion.','evo.range':'Stage'});
Object.assign(I18N.pl,{'ch.evo':'Jak rozwijają się zmiany','c6.kicker':'07 · Ewolucja','evo.stage':'Etap {n} z {m}','evo.see':'Przez dermatoskop','evo.tis':'W tkance','evo.key':'Najważniejsze',
  'evo.new':'nowe','evo.gone':'Już niewidoczne:','evo.path':'Cała sekwencja','evo.play':'Odtwórz','evo.pause':'Wstrzymaj','evo.cmp':'Porównaj','evo.cmpT':'Podziel obraz: poprzedni etap po lewej',
  'evo.prev':'POPRZEDNI','evo.now':'TERAZ','evo.first':'PIERWSZY ETAP','evo.breslow':'Breslow {v} mm','evo.insitu':'in situ · brak grubości wg Breslowa','evo.clark':'Clark {v}',
  'evo.hint':'Przeciągnij oś czasu, kliknij etap albo użyj ◀ ▶ i spacji. Rodzaj światła można zmienić na każdym etapie; strzałki w widoku 3D pokazują, gdzie zmiana rośnie.',
  'evo.src':'Źródła:','evo.srcTail':'Etapy są schematyczne: pokazują typowy przebieg, a nie los każdej zmiany.','evo.range':'Etap'});
const EVO_SHORT={nevus:['Nevus','Znamię'],melanoma:['Melanoma','Czerniak'],bcc:['BCC','BCC'],ak:['AK → SCC','AK → SCC'],sk:['Lentigo → SK','Lentigo → SK'],df:['Dermatofibroma','Włókniak skóry']};
Object.assign(EVO_SHORT,EVO_SHORT_X);
Object.assign(SID_ALIAS,{struct:'@sc',straw:'@sc',pseudo:'@sc',yscale:'@sc',moth:'@epi',remn:'@epi',pink:'@sc',ros:'plug',wsa:'@sc'});

const EV={on:false,set:'evo',last:{evo:'nevus',sites:'lm'},seq:'nevus',p:0,k:-1,playing:false,hold:0,compare:false,bgT:0,ldT:0,hsSeq:null};
const evoList=()=>EV.set==='sites'?SITES_ORDER:EVO_ORDER;
EV.cv=document.createElement('canvas');EV.cv.width=EV.cv.height=TEX;EV.ctx=EV.cv.getContext('2d');
const evoId=(s,k)=>'evo:'+s+':'+k,evoN=()=>EVO[EV.seq].stages.length;
function evoEntry(id){if(!MODELS[id]){const L0=evoModel(id);prepFeatures(L0);MODELS[id]={L:L0,M:newMaps(),paints:[]};}return MODELS[id];}
function paintFor(E,m){finishMaps(E.L,E.M);if(!E.paints[m])E.paints[m]=paint(E.L,E.M,m);return E.paints[m];}
const evoReady=k=>{const E=MODELS[evoId(EV.seq,k)];return!!(E&&E.M.done&&E.paints[state.mode]);};

/* lens image: cross-fade between neighbouring stages, optional split with the previous stage */
function evoCanvas(){const n=evoN(),p=clamp(EV.p,0,n-1),a=Math.floor(p+1e-6),b=Math.min(n-1,a+1),f=p-a,m=state.mode,c=EV.ctx;
  c.globalAlpha=1;c.drawImage(paintFor(evoEntry(evoId(EV.seq,a)),m),0,0);
  if(f>0.003&&b!==a){c.globalAlpha=f;c.drawImage(paintFor(evoEntry(evoId(EV.seq,b)),m),0,0);c.globalAlpha=1;}
  if(EV.compare){const kc=Math.round(p),kp=kc-1,st=EVO[EV.seq].stages;c.save();c.beginPath();c.rect(0,0,TEX/2,TEX);c.clip();
    if(kp>=0)c.drawImage(paintFor(evoEntry(evoId(EV.seq,kp)),m),0,0);else{c.fillStyle='rgba(4,12,16,0.6)';c.fillRect(0,0,TEX/2,TEX);}c.restore();
    c.fillStyle='rgba(242,228,201,0.95)';c.fillRect(TEX/2-1.5,0,3,TEX);
    c.font='600 21px "IBM Plex Mono",monospace';c.textBaseline='middle';
    const tag=(s,x,al)=>{const w=c.measureText(s).width;const x0=al==='r'?x-w-24:x;c.fillStyle='rgba(4,12,16,0.78)';c.fillRect(x0,TEX*0.17-18,w+24,36);c.fillStyle='#F2E4C9';c.fillText(s,x0+12,TEX*0.17+1);};
    tag(kp>=0?t('evo.prev')+' · '+ev(st[kp].lbl):t('evo.first'),TEX/2-14,'r');tag(t('evo.now')+' · '+ev(st[kc].lbl),TEX/2+14,'l');}
  return EV.cv;}

/* ---------------- timeline bar ---------------- */
const evoSVG={play:'<svg width="14" height="14" viewBox="0 0 14 14"><path d="M3 1.5v11l9.5-5.5z" fill="currentColor"/></svg>',pause:'<svg width="14" height="14" viewBox="0 0 14 14"><path d="M3 1.5h3v11H3zM8 1.5h3v11H8z" fill="currentColor"/></svg>'};
function evoBuildBar(){const st=EVO[EV.seq].stages;$('evoStages').innerHTML=st.map((s,i)=>{const f=ev(s.lbl),sh=f.includes(' · ')?f.split(' · ')[0]:f;
    return`<button type="button" class="evoSt" data-k="${i}" title="${ev(s.h)}" aria-label="${f}"><canvas width="88" height="88"></canvas><span class="lf">${f}</span><span class="ls">${sh}</span></button>`;}).join('');
  $('evoStages').style.gridTemplateColumns=`repeat(${st.length},minmax(0,1fr))`;const r=$('evoRange');r.max=st.length-1;r.value=EV.p;r.setAttribute('aria-label',t('evo.range'));
  $('evoStages').querySelectorAll('[data-k]').forEach(b=>b.addEventListener('click',()=>{evoPlay(false);evoGo(+b.dataset.k);}));
  $('evoCmp').title=t('evo.cmpT');evoThumbs();evoUpdateBar();}
function evoUpdateBar(){const k=Math.round(EV.p);$('evoStages').querySelectorAll('.evoSt').forEach((b,i)=>b.classList.toggle('on',i===k));
  const r=$('evoRange');if(Math.abs(+r.value-EV.p)>0.004)r.value=EV.p;const pb=$('evoPlay');pb.innerHTML=EV.playing?evoSVG.pause:evoSVG.play;pb.setAttribute('aria-label',t(EV.playing?'evo.pause':'evo.play'));
  const cb=$('evoCmp');cb.classList.toggle('on',EV.compare);cb.setAttribute('aria-pressed',String(EV.compare));}
function evoThumb(k){const b=$('evoStages').children[k];if(!b)return;const cv=b.querySelector('canvas'),c=cv.getContext('2d'),w=cv.width,E=MODELS[evoId(EV.seq,k)];
  c.clearRect(0,0,w,w);c.save();c.beginPath();c.arc(w/2,w/2,w/2,0,TAU);c.clip();c.fillStyle=TC.ground2;c.fillRect(0,0,w,w);
  if(E&&E.paints[state.mode]){const S=2.9*PXMM;c.drawImage(E.paints[state.mode],TEX/2-S,TEX/2-S,2*S,2*S,0,0,w,w);}c.restore();}
function evoThumbs(){for(let k=0;k<evoN();k++)evoThumb(k);}
function evoLayout(){const bar=$('evoBar');if(!bar||bar.hidden)return;const mode=layoutMode();
  const h=$('evoIn').offsetHeight||64,dr=$('dockIn').getBoundingClientRect();bar.style.bottom='auto';
  if(AUD.on)bar.style.top=(innerHeight-h-18)+'px';
  else if(mode==='mob'){const P=$('panel');let pr=P.getBoundingClientRect();
    if(!P.classList.contains('min')){const top=$('chapters').getBoundingClientRect().bottom,want=Math.round(innerHeight*0.34),room=Math.min(pr.top,dr.top)-h-8-top;
      if(room<want){P.style.maxHeight=Math.max(120,Math.round(pr.height-(want-room)))+'px';pr=P.getBoundingClientRect();}}
    bar.style.top=Math.max(90,Math.min(pr.top,dr.top)-h-8)+'px';}else bar.style.top=Math.max(mode==='land'?40:80,dr.top-h-(mode==='land'?8:10))+'px';
  const c=$('evoStages').children[0],r=$('evoRange');if(c){const w=c.getBoundingClientRect().width;r.style.marginLeft=r.style.marginRight=Math.max(0,w/2-8)+'px';}}

/* ---------------- stage changes ---------------- */
function evoSetP(p,o={}){const n=evoN();EV.p=clamp(p,0,n-1);const k=Math.round(EV.p);showTexture(true);evoUpdateBar();
  if(o.noLoad)return;clearTimeout(EV.ldT);if(k!==EV.k){if(o.now)evoLoadStage(k);else EV.ldT=setTimeout(()=>evoLoadStage(Math.round(EV.p)),o.delay??200);}}
function evoGo(k){evoSetP(k,{now:true});}
function evoLoadStage(k){if(!EV.on)return;const id=evoId(EV.seq,k);if(L&&L.id===id){EV.k=k;return;}EV.k=k;evoEntry(id);loadCase(id);}
function evoAfterLoad(){if(!EV.on||!L||!L.evo)return;EV.k=L.evo.k;evoThumb(EV.k);buildEvoMarks();
  if(state.view==='section'&&state.sel==null&&cutZ!=null&&Math.abs(cutZ-(L.secZ||0))>0.02)setSection(L.secZ||0);}
function evoPlay(on){EV.playing=!!on;if(on){if(EV.p>=evoN()-1-1e-3)evoGo(0);EV.hold=1.0;evoBgStart();}evoUpdateBar();}
function evoStep(){const now=performance.now(),dt=Math.min(0.25,(now-(EV.lastT||now))/1000);EV.lastT=now;if(!EV.playing||!EV.on)return;if(EV.hold>0){EV.hold-=dt;return;}const n=evoN(),next=Math.floor(EV.p+1e-6)+1;
  if(next>n-1){evoPlay(false);return;}if(!evoReady(next))return;
  const p=EV.p+dt/1.4;if(p>=next){evoSetP(next,{now:true});EV.hold=2.4;}else evoSetP(p,{noLoad:true});}
function evoSetSeq(s){if(!EVO[s])return;evoPlay(false);if(s!==EV.seq){for(const id in MODELS)if(id.startsWith('evo:'+EV.seq+':'))delete MODELS[id];}
  EV.seq=s;EV.p=0;EV.k=-1;const cs=$('caseSel');if(cs)cs.value=s;evoBuildBar();evoLayout();applyOffset();evoLoadStage(0);evoBgStart();}
/* prepare the other stages in small slices, so the timeline stays smooth */
function evoBgStart(){clearTimeout(EV.bgT);const seq=EV.seq,n=evoN(),k0=Math.round(EV.p),order=[];for(let d=0;d<n;d++){if(k0+d<n)order.push(k0+d);if(d&&k0-d>=0)order.push(k0-d);}
  const step=()=>{EV.bgT=0;if(!EV.on||EV.seq!==seq)return;const m=state.mode;const k=order.find(q=>!evoReady(q));if(k==null){evoThumbs();return;}
    const E=evoEntry(evoId(seq,k));if(!E.M.done)mapRows(E.L,E.M,E.M.row,E.M.row+28);else{paintFor(E,m);evoThumb(k);}
    EV.bgT=setTimeout(step,EV.playing?0:12);};
  EV.bgT=setTimeout(step,40);}

/* ---------------- growth arrows and Breslow ruler ---------------- */
const evoG=new THREE.Group();evoG.visible=false;scene.add(evoG);
const evoArrowGeo=(()=>{const s=new THREE.Shape();s.moveTo(0,-0.035);s.lineTo(0.2,-0.035);s.lineTo(0.2,-0.09);s.lineTo(0.36,0);s.lineTo(0.2,0.09);s.lineTo(0.2,0.035);s.lineTo(0,0.035);s.closePath();const g=new THREE.ShapeGeometry(s);g.rotateX(-Math.PI/2);return g;})();
const evoArrowMat=new THREE.MeshBasicMaterial({color:'#F2E4C9',transparent:true,opacity:0.8,depthWrite:false,side:THREE.DoubleSide});evoArrowMat.clippingPlanes=[secPlane];
const evoRulerMat=new THREE.MeshBasicMaterial({color:'#F2E4C9',transparent:true,opacity:0.95,depthTest:false,depthWrite:false});
const evoArrows=[];for(let i=0;i<10;i++){const m=new THREE.Mesh(evoArrowGeo,evoArrowMat.clone());m.material.clippingPlanes=[secPlane];m.renderOrder=6;evoG.add(m);evoArrows.push({m,a:i/10*TAU+0.3,rim:1});}
const evoRuler=new THREE.Group();evoG.add(evoRuler);
(function(){const bar=new THREE.Mesh(new THREE.CylinderGeometry(0.014,0.014,1,8),evoRulerMat);bar.renderOrder=25;evoRuler.add(bar);evoRuler.userData.bar=bar;
  for(const k of['t0','t1']){const tk=new THREE.Mesh(new THREE.BoxGeometry(0.16,0.012,0.012),evoRulerMat);tk.renderOrder=25;evoRuler.add(tk);evoRuler.userData[k]=tk;}
  const cone=new THREE.Mesh(new THREE.ConeGeometry(0.05,0.12,12),evoRulerMat);cone.rotation.x=Math.PI;cone.renderOrder=25;evoRuler.add(cone);evoRuler.userData.cone=cone;})();
function buildEvoMarks(){clearLabels('evo');if(!L||!L.evo){evoG.visible=false;return;}const st=EVO[L.evo.seq].stages[L.evo.k];
  for(const A of evoArrows){const c=Math.cos(A.a),s=Math.sin(A.a),rr0=1/Math.max(1e-3,L.R(c,s));A.rim=rr0;A.m.rotation.y=-A.a;}
  evoG.userData.grow=st.grow||0;
  if(L.brs){const b=L.brs,D=L.depths(b.x,b.z),yS=L.elevAt(b.x,b.z),y0=yS-D2S(L.ulcer(b.x,b.z)>0.3?0:D.sc),y1=yS-D2S(D.sc+b.mm),U=evoRuler.userData;
    U.bar.position.set(b.x,(y0+y1)/2,b.z);U.bar.scale.set(1,y0-y1,1);U.t0.position.set(b.x,y0,b.z);U.t1.position.set(b.x,y1,b.z);U.cone.position.set(b.x,y1+0.07,b.z);evoRuler.visible=true;
    const lab=`<i></i><span>${t('evo.breslow',{v:nf(b.mm.toFixed(1))})} · ${st.pT}</span>`;const o=mkLabel('evo',lab,()=>new THREE.Vector3(b.x+0.1,(y0+y1)/2,b.z),'brs',null,8);}
  else evoRuler.visible=false;
  updateVisibility();}
function evoFrame(now){const vis=EV.on&&isEvoCh(state.chapter)&&!!(L&&L.evo)&&state.view!=='lens'&&state.view!=='hist'&&state.explode<0.4;evoG.visible=vis;if(!vis)return;
  const g=evoG.userData.grow||0;for(let i=0;i<evoArrows.length;i++){const A=evoArrows[i];A.m.visible=g>0.01;if(!A.m.visible)continue;const tt=((now/1000)*0.45+i*0.37)%1,c=Math.cos(A.a),s=Math.sin(A.a),r=A.rim+0.06+0.34*tt;
    const x=c*r,z=s*r;A.m.position.set(x,L.elevAt(clamp(x,-3.9,3.9),clamp(z,-3.9,3.9))+0.035,z);A.m.material.opacity=g*0.9*Math.sin(Math.PI*tt);}}

/* ---------------- panel ---------------- */
function evoPanelHTML(){const E=EVO[EV.seq],n=E.stages.length,k=L&&L.evo&&L.evo.seq===EV.seq?L.evo.k:Math.round(EV.p),st=E.stages[k];
  const pills=st.pT?[`<span class="pill">${st.br?t('evo.breslow',{v:nf(st.br.toFixed(1))}):t('evo.insitu')}</span>`,`<span class="pill">${st.pT}</span>`,`<span class="pill">${t('evo.clark',{v:st.clark})}</span>`]:[];
  const gone=L&&L.evo&&L.evoGone.length?`<p class="note">${t('evo.gone')} ${L.evoGone.map(ev).join(', ')}.</p>`:'';const V=state.view;
  return`<p class="kicker">${t(EV.set==='sites'?'c7.kicker':'c6.kicker')}</p><h2>${ev(E.title)}</h2>
    <div class="chips">${evoList().map(s=>`<button type="button" class="chip ${s===EV.seq?'on':''}" data-seq="${s}">${ev(EVO_SHORT[s])}</button>`).join('')}</div>
    <p>${ev(E.sum)}</p>
    <div class="evoCard"><p class="evoMeta">${t(E.ddx?'evo.item':'evo.stage',{n:k+1,m:n})} · ${ev(st.ph)}</p><h3>${ev(st.h)}</h3>${pills.length?`<div class="pills">${pills.join('')}</div>`:''}
      <h4>${t('evo.see')}</h4><p>${ev(st.see)}</p><h4>${t('evo.tis')}</h4><p>${ev(st.tis)}</p><p class="lesson"><b>${t('evo.key')}</b>${ev(st.key)}</p>
      <div class="row">${[['lens','view.lens'],['section','view.section'],['hist','view.hist']].map(([v,l])=>`<button type="button" class="linkbtn ${V===v?'on':''}" data-ev="${v}">${t(l)}</button>`).join('')}</div></div>
    ${E.note?`<p class="note">${ev(E.note)}</p>`:''}
    <div class="seg" id="atlasTab" role="tablist" style="display:inline-flex;margin:4px 0 8px"><button type="button" role="tab" data-tab="derm" class="${state.atlasTab!=='hist'?'on':''}">${t('tab.derm')}</button><button type="button" role="tab" data-tab="hist" class="${state.atlasTab==='hist'?'on':''}">${t('tab.hist')}</button></div>
    ${state.atlasTab==='hist'?`<ul class="slist" id="hlist"></ul>`:`<ul class="slist" id="slist"></ul>${gone}`}
    <h3>${t('evo.path')}</h3><ol class="evoList">${E.stages.map((s,i)=>`<li><button type="button" data-k="${i}" class="${i===k?'on':''}"><b>${i+1}</b><span>${ev(s.h)}<small>${ev(s.ph)}</small></span></button></li>`).join('')}</ol>
    <p class="note">${t(EV.set==='sites'?'sites.hint':'evo.hint')}</p>
    <div class="src">${t('evo.src')} ${E.src.map(([u,l])=>`<a href="${u}" target="_blank" rel="noopener">${l}</a>`).join('; ')}. ${t('evo.srcTail')}</div>`;}
function bindEvoPanel(){const P=$('panelInner');
  P.querySelectorAll('[data-seq]').forEach(b=>b.addEventListener('click',()=>evoSetSeq(b.dataset.seq)));
  P.querySelectorAll('.evoList [data-k]').forEach(b=>b.addEventListener('click',()=>{evoPlay(false);evoGo(+b.dataset.k);}));
  P.querySelectorAll('[data-ev]').forEach(b=>b.addEventListener('click',()=>{const v=b.dataset.ev;if(v==='hist'){HS.z=L.secZ||0;HS.sel=-1;EV.hsSeq=EV.seq;if(state.view==='hist')rebuildSlide(true);else setView('hist');}else{state.sel=null;setView(v);}renderPanel();}));}

/* ---------------- chapter enter / exit ---------------- */
function enterEvo(set){set=set||'evo';if(EV.set!==set){for(const id in MODELS)if(id.startsWith('evo:'))delete MODELS[id];EV.p=0;}EV.set=set;if(!evoList().includes(EV.seq)){EV.seq=evoList().includes(EV.last[set])?EV.last[set]:evoList()[0];EV.p=0;}HS.lastSec=null;EV.on=true;state.atlasTab='derm';state.sel=null;$('evoBar').hidden=false;fillCaseSel();evoBuildBar();setPhotons(false);resize();
  EV.p=clamp(Math.round(EV.p),0,evoN()-1);EV.k=-1;evoLoadStage(Math.round(EV.p));setView('lens');evoBgStart();}
function exitEvo(toEvo){if(evoList().includes(EV.seq))EV.last[EV.set]=EV.seq;EV.on=false;evoPlay(false);clearTimeout(EV.bgT);clearTimeout(EV.ldT);$('evoBar').hidden=true;evoG.visible=false;clearLabels('evo');
  for(const id in MODELS)if(id.startsWith('evo:'))MODELS[id].paints=[];
  if(toEvo)return;fillCaseSel();resize();loadCase(state.caseId);}

$('evoPlay').addEventListener('click',()=>evoPlay(!EV.playing));
$('evoCmp').addEventListener('click',()=>{EV.compare=!EV.compare;showTexture(true);evoUpdateBar();if(EV.compare&&state.view!=='lens'&&state.view!=='hist')setView('lens');});
$('evoRange').addEventListener('input',e=>{const v=+e.target.value;if(EV.playing)evoPlay(false);evoSetP(v);});
$('evoRange').addEventListener('change',e=>{const k=Math.round(+e.target.value);evoSetP(k,{now:true});});
window.addEventListener('keydown',e=>{if(!isEvoCh(state.chapter)||!EV.on||AUD.on)return;if(e.target&&(e.target.tagName==='INPUT'||e.target.tagName==='SELECT'||e.target.tagName==='BUTTON'&&e.key===' '))return;
  if(e.key==='ArrowRight'){evoPlay(false);evoGo(Math.min(evoN()-1,Math.round(EV.p)+1));e.preventDefault();}
  else if(e.key==='ArrowLeft'){evoPlay(false);evoGo(Math.max(0,Math.round(EV.p)-1));e.preventDefault();}
  else if(e.key===' '){evoPlay(!EV.playing);e.preventDefault();}});

/* =====================================================================
   Presenter view. This window keeps every control and the notes; a second
   window (#audience) on the projector renders the same scene itself, at the
   projector's resolution. Only the state and the camera pose travel between
   the windows (BroadcastChannel, a few hundred bytes per change), so both
   screens stay sharp and the windows run in separate processes.
   ===================================================================== */
/* The presenter controls themselves (open projector, notes, blank, intro, end) are rendered by the app
   (src/features/lens/LensPresenterControls.tsx) and reach this window through the app bridge below. */
Object.assign(I18N.en,{'theme.label':'Theme','theme.light':'Light','theme.dark':'Dark','theme.lightT':'Light panels, high contrast: best on a projector','theme.darkT':'Dark interface: for a monitor in a dim room','intro.sound':'Click for sound','intro.close':'Close','intro.fail':'The video could not be embedded here.',
  'aud.fs':'Click or press F for full screen','aud.wait':'Waiting for the presenter window…','exit':'Back','exit.t':'Back to Akademia Dermatoskopii'});
Object.assign(I18N.pl,{'theme.label':'Motyw','theme.light':'Jasny','theme.dark':'Ciemny','theme.lightT':'Jasne panele, wysoki kontrast: najlepszy na rzutniku','theme.darkT':'Ciemny interfejs: dla monitora w przyciemnionej sali','intro.sound':'Kliknij, aby włączyć dźwięk','intro.close':'Zamknij','intro.fail':'Nie udało się osadzić filmu.',
  'aud.fs':'Kliknij lub naciśnij F, aby włączyć pełny ekran','aud.wait':'Oczekiwanie na okno prezentera…','exit':'Wróć','exit.t':'Wróć do Akademii Dermatoskopii'});
/* how long a just-opened projector window may take to say hello (it boots the app, restores the login and
   builds the scene) before the presenter is told it did not open */
const PRES_WAIT_MS=12000;
const PRES={intro:0,introSt:'',introLocal:false,role:null,bc:null,last:'',lastCam:'',conn:false,fs:false,lastSeen:0,opened:0,notes:false,blank:false,ui:''};
const AUD={intro:0,blank:false,on:location.hash==='#audience',started:false,pending:null,pendT:0,lastState:0,lastCam:null,lastP:null,lastCmp:null,notes:false,hb:0};
/* ---------- colour theme and left-column layout ---------- */
function applyTheme(th){if(th!=='light'&&th!=='dark')return;THEME=th;if(th==='dark')document.documentElement.dataset.theme='dark';else delete document.documentElement.dataset.theme;
  try{localStorage.setItem('btl-theme',th);}catch(e){}readTC();scene.background=new THREE.Color(TC.ground);
  $('chapters').querySelectorAll('[data-theme]').forEach(b=>b.classList.toggle('on',b.dataset.theme===th));
  if(typeof EV!=='undefined'&&EV.on&&typeof evoThumbs==='function')evoThumbs();HS.dirty=true;layoutSide();}
/* the chapter list hangs under the brand card; in the projector window the caption sits under it */
function layoutSide(){const b=document.querySelector('.brand');if(!b)return;const r=b.getBoundingClientRect(),ch=$('chapters'),cap=$('audCap');
  const dk=$('dock'),dl=dk.style.left;dk.style.left='';
  if(layoutMode()==='desk'){ch.style.top=Math.round(r.bottom+(THEME==='dark'?12:0))+'px';
    if(!AUD.on){const c=ch.getBoundingClientRect(),di=$('dockIn').getBoundingClientRect();if(c.bottom>di.top-8&&di.left<c.right+8)dk.style.left=Math.round(c.right+12)+'px';}}
  else ch.style.top='';
  if(dk.style.left!==dl&&typeof evoLayout==='function'){evoLayout();applyOffset();}
  if(cap)cap.style.top=Math.round(r.bottom+18)+'px';}
window.addEventListener('resize',()=>layoutSide());
if(document.fonts&&document.fonts.ready)document.fonts.ready.then(()=>layoutSide());
/* ---------- intro video (YouTube), played full screen on the projector ----------
   The player is driven with YouTube's iframe postMessage protocol (no extra script): we ask it to
   report its state, fall back to muted autoplay if the browser blocks sound, and close at the end. */
const INTRO={id:'diGnvjehtW8',el:null,fr:null,tok:0,state:-2,ready:false,muted:false,failed:false,t1:0,t2:0,hs:0};
const introWatch=()=>`https://www.youtube.com/watch?v=${INTRO.id}`;
function introSrc(){const o=/^https?:$/.test(location.protocol)?'&origin='+encodeURIComponent(location.origin):'';
  return `https://www.youtube.com/embed/${INTRO.id}?autoplay=1&playsinline=1&rel=0&modestbranding=1&iv_load_policy=3&enablejsapi=1${o}`;}
function introCmd(func,args){const w=INTRO.fr&&INTRO.fr.contentWindow;if(w)try{w.postMessage(JSON.stringify({event:'command',func,args:args||[]}),'*');}catch(e){}}
function introOpen(tok){introClose();INTRO.tok=tok;INTRO.state=-2;INTRO.ready=false;INTRO.muted=false;INTRO.failed=false;
  const el=document.createElement('div');el.id='intro';
  el.innerHTML=`<div class="ifr"></div><button type="button" class="isnd" hidden><span>🔊 ${t('intro.sound')}</span></button><div class="imsg" hidden></div><button type="button" class="ix">✕ ${t('intro.close')}</button>`;
  const fr=document.createElement('iframe');fr.src=introSrc();fr.allow='autoplay; encrypted-media; fullscreen; picture-in-picture';fr.referrerPolicy='strict-origin-when-cross-origin';fr.title='Akademia Dermatoskopii — intro';fr.setAttribute('allowfullscreen','');
  el.querySelector('.ifr').appendChild(fr);document.body.appendChild(el);INTRO.el=el;INTRO.fr=fr;
  el.querySelector('.ix').addEventListener('click',e=>{e.stopPropagation();introEnded();});
  el.querySelector('.isnd').addEventListener('click',()=>{introCmd('unMute');introCmd('playVideo');INTRO.muted=false;el.querySelector('.isnd').hidden=true;introReport();});
  fr.addEventListener('load',()=>{clearInterval(INTRO.hs);let n=0;INTRO.hs=setInterval(()=>{if(INTRO.ready||++n>40||!INTRO.fr){clearInterval(INTRO.hs);return;}
    try{fr.contentWindow.postMessage(JSON.stringify({event:'listening',id:'btl-intro',channel:'widget'}),'*');}catch(e){}},300);});
  INTRO.t0=performance.now();INTRO.t1=setInterval(introCheck,700);INTRO.t2=setTimeout(()=>{if(INTRO.el&&!INTRO.ready)introFail();},15000);introReport();}
/* sound blocked by the autoplay policy: the player stays unstarted, so start it muted and offer a click for sound */
function introCheck(){if(!INTRO.el||INTRO.muted||!INTRO.ready)return;const dt=performance.now()-INTRO.t0;
  if(INTRO.state===1||INTRO.state===0){clearInterval(INTRO.t1);return;}if(dt<3500||(INTRO.state===3&&dt<9000))return;clearInterval(INTRO.t1);
  {introCmd('mute');introCmd('playVideo');INTRO.muted=true;INTRO.el.querySelector('.isnd').hidden=false;introReport();}}
function introFail(){if(!INTRO.el)return;INTRO.failed=true;const m=INTRO.el.querySelector('.imsg');m.hidden=false;m.innerHTML=`${t('intro.fail')}<br><a href="${introWatch()}" target="_blank" rel="noopener">${introWatch()}</a>`;introReport();}
function introClose(){clearInterval(INTRO.t1);clearTimeout(INTRO.t2);clearInterval(INTRO.hs);if(INTRO.el)INTRO.el.remove();INTRO.el=INTRO.fr=null;INTRO.state=-2;}
function introEnded(){const tok=INTRO.tok;introClose();if(AUD.on)presPost({type:'intro',tok,st:'end'});else if(PRES.intro===tok){PRES.intro=0;PRES.introSt='';PRES.introLocal=false;presUI(true);}}
function introReport(){const st=INTRO.failed?'fail':INTRO.muted?'muted':INTRO.state===1?'play':'load';
  if(AUD.on)presPost({type:'intro',tok:INTRO.tok,st});else if(PRES.intro===INTRO.tok&&PRES.introSt!==st){PRES.introSt=st;presUI(true);}}
window.addEventListener('message',e=>{if(!INTRO.fr||e.source!==INTRO.fr.contentWindow)return;let d=e.data;if(typeof d==='string')try{d=JSON.parse(d);}catch(x){return;}if(!d||typeof d!=='object'||!d.event)return;
  INTRO.ready=true;if(d.event==='onError'){introFail();return;}
  let st=null;if(d.event==='onStateChange'&&typeof d.info==='number')st=d.info;else if(d.info&&typeof d.info.playerState==='number')st=d.info.playerState;
  if(st!=null&&st!==INTRO.state){const was=INTRO.state;INTRO.state=st;if(st===0&&was!==-2)introEnded();else introReport();}});
document.addEventListener('securitypolicyviolation',e=>{if(INTRO.el&&/youtube/.test(e.blockedURI||''))introFail();});
function presChannel(){if(!PRES.bc&&'BroadcastChannel' in window){PRES.bc=new BroadcastChannel('btl-present');PRES.bc.onmessage=e=>presMsg(e.data);}return PRES.bc;}
function presPost(m){const b=presChannel();if(b)try{b.postMessage(m);}catch(e){}}
function presMsg(m){if(!m||!m.type)return;
  if(AUD.on){if(m.type==='state'||m.type==='cam'||m.type==='ping'){AUD.lastState=performance.now();AUD.closed=false;}if(m.type==='state')audApply(m.s);else if(m.type==='cam')audCam(m.c);
    /* a frame cannot close its window: the app page does. If that is refused, stay quiet until a presenter starts again */
    else if(m.type==='close'){AUD.closed=true;if(EMBED.on)appPost('close');else try{window.close();}catch(e){}}
    return;}
  if(m.type==='hello'&&PRES.role!=='presenter'&&PRES.endedAt&&performance.now()-PRES.endedAt<120000){presPost({type:'close'});return;}
  if(m.type==='hello'||m.type==='alive'){if(PRES.role!=='presenter'){if(!EMBED.presenter||m.type!=='hello'||!hasFocusHere())return;presStart(true);}
    if(m.type==='hello'){PRES.last='';PRES.lastCam='';}PRES.conn=true;PRES.fs=!!m.fs;PRES.lastSeen=performance.now();presUI();}
  else if(m.type==='bye'){PRES.conn=false;presUI();}
  else if(m.type==='intro'&&PRES.role==='presenter'&&m.tok===PRES.intro&&!PRES.introLocal){if(m.st==='end'){PRES.intro=0;PRES.introSt='';}else PRES.introSt=m.st;presUI(true);}}

/* ---------------- presenter ---------------- */
const refDist=v=>v==='lens'?lensDist():fitDist(VIEW_EXT[v]?v:'orbit');
function presSnap(){let hs=null;if(HS.on&&HS.SR&&HS.S){const SR=HS.SR;hs={z:HS.z,sel:HS.sel,cx:+((SR.l+SR.w/2-HS.ox)/HS.s).toFixed(1),cy:+((SR.t+SR.h/2-HS.oy)/HS.s).toFixed(1),w:+(SR.w/HS.s).toFixed(1),h:+(SR.h/HS.s).toFixed(1)};}
  const pi=$('panelInner'),sp=pi.scrollHeight-pi.clientHeight;
  return{lang:LANG,th:THEME,ch:state.chapter,mode:state.mode,view:state.view,id:L?L.id:null,caseId:state.caseId,sel:state.sel,layerSel:state.layerSel,hl:[HL.sid,HL.layer],
    ex:state.explodeT,dev:+state.devExplT.toFixed(3),cut:cutZ==null?null:+cutZ.toFixed(3),peel:+peelPlane.constant.toFixed(4),ph:PH.on,lam:PH.lambda||null,lambda:state.lambda,probeD:+probeD.toFixed(4),tab:state.atlasTab,
    evo:EV.on?{seq:EV.seq,p:+EV.p.toFixed(3),cmp:EV.compare}:null,hs,notes:PRES.notes,blank:PRES.blank,intro:PRES.introLocal?0:PRES.intro,ps:sp>0?+(pi.scrollTop/sp).toFixed(3):0};}
function presCamSnap(){return{t:cam.t.toArray().map(v=>+v.toFixed(4)),az:+cam.az.toFixed(4),el:+cam.el.toFixed(4),k:+(cam.dist/refDist(state.view)).toFixed(4)};}
/* Only app admins get presenter controls (?role=presenter). The app opens the projector window itself
   (/lens/projector, which frames this page with #audience): window.open needs the click's user activation,
   which the app's button has. Here this window only becomes the presenter and waits for that window's hello. */
function presStart(fromHello){if(!EMBED.presenter||AUD.on)return;PRES.role='presenter';PRES.endedAt=0;presChannel();if(fromHello){presUI();return;}
  PRES.conn=false;PRES.opened=performance.now();presUI(true);}
/* focus may sit on the app's own controls around this frame rather than inside it */
function hasFocusHere(){if(document.hasFocus())return true;try{return window.parent!==window&&window.parent.document.hasFocus();}catch(e){return false;}}
function presAct(a){if(a==='start')presStart();else if(a==='notes')PRES.notes=!PRES.notes;else if(a==='blank')PRES.blank=!PRES.blank;
  else if(a==='intro'){if(PRES.intro){if(PRES.introLocal)introClose();PRES.intro=0;PRES.introSt='';PRES.introLocal=false;}
    else{PRES.intro=Date.now();PRES.introSt='load';PRES.introLocal=!PRES.conn;if(PRES.introLocal)introOpen(PRES.intro);}}
  else if(a==='end'){if(PRES.introLocal)introClose();presPost({type:'close'});PRES.endedAt=performance.now();PRES.role=null;PRES.conn=false;PRES.notes=PRES.blank=false;PRES.intro=0;PRES.introSt='';PRES.introLocal=false;}presUI(true);}
/* leaving /lens/ (in-app navigation removes this frame, or a reload) ends the show: the projector window closes */
addEventListener('pagehide',()=>{if(PRES.role==='presenter'&&!AUD.on){if(PRES.introLocal)introClose();presPost({type:'close'});}});
/* the app renders the presenter controls; this window reports their state to it, whenever that changes */
function presUI(force){if(!EMBED.presenter||AUD.on)return;const now=performance.now(),active=PRES.role==='presenter';
  const s={active,connected:active&&PRES.conn,fullscreen:active&&PRES.conn&&PRES.fs,waiting:active&&!PRES.conn&&now-PRES.opened<PRES_WAIT_MS,
    notes:PRES.notes,blank:PRES.blank,intro:!!PRES.intro,introState:PRES.introSt||'',introLocal:PRES.introLocal,introUrl:introWatch()};
  const key=JSON.stringify(s);if(!force&&key===PRES.ui)return;PRES.ui=key;appPost('presenter',{status:s});}
function presTick(){const now=performance.now();
  if(AUD.on){if(AUD.pending&&L&&(L.id===AUD.pending||now-AUD.pendT>5000)){const hit=L.id===AUD.pending;AUD.pending=null;if(hit&&AUD.lastSnap)audApply(AUD.lastSnap);}audOverlay();return;}
  if(PRES.role!=='presenter')return;if(PRES.conn&&now-PRES.lastSeen>3500)PRES.conn=false;presUI();if(now-(PRES.ping||0)>900){PRES.ping=now;presPost({type:'ping'});}
  const s=presSnap(),js=JSON.stringify(s);if(js!==PRES.last){PRES.last=js;presPost({type:'state',s});}
  if(state.view!=='hist'){const c=presCamSnap(),jc=JSON.stringify(c);if(jc!==PRES.lastCam){PRES.lastCam=jc;presPost({type:'cam',c});}}}

/* ---------------- audience (projector) ---------------- */
function audStart(){if(AUD.started)return;AUD.started=true;AUD.on=true;PRES.role=null;document.body.classList.add('aud');presChannel();
  const beat=()=>{if(!AUD.closed)presPost({type:performance.now()-AUD.lastState>3000?'hello':'alive',fs:!!document.fullscreenElement});};beat();AUD.hb=setInterval(beat,1000);
  addEventListener('beforeunload',()=>presPost({type:'bye'}));document.addEventListener('fullscreenchange',()=>{beat();setTimeout(resize,60);});
  resize();audCaption();audOverlay();layoutSide();}
function audCam(c){AUD.lastCam=c;if(state.view==='hist')return;cam.t.set(c.t[0],c.t[1],c.t[2]);cam.az=c.az;cam.el=c.el;cam.dist=c.k*refDist(state.view)*(state.view==='lens'?1:1.14);cam.tw=null;}
function audApply(s){AUD.lastSnap=s;try{
  if(s.lang&&s.lang!==LANG)setLang(s.lang);
  if(s.th&&s.th!==THEME)applyTheme(s.th);
  document.body.classList.toggle('blank',!!s.blank);
  const it=s.intro||0;if(it!==AUD.intro){AUD.intro=it;if(it)introOpen(it);else introClose();}
  if(!!s.blank!==AUD.blank){AUD.blank=!!s.blank;if(INTRO.el)introCmd(AUD.blank?'pauseVideo':'playVideo');}
  if(s.caseId&&CASES[s.caseId])state.caseId=s.caseId;
  if(s.ch!==state.chapter){if(s.evo){EV.seq=s.evo.seq;EV.p=s.evo.p;}goChapter(s.ch);}
  if(s.evo){if(s.evo.seq!==EV.seq){if(EV.on)evoSetSeq(s.evo.seq);else EV.seq=s.evo.seq;}EV.p=s.evo.p;EV.compare=s.evo.cmp;}
  if(s.mode!==state.mode)setMode(s.mode);
  state.lambda=s.lambda;
  if(PROBE_ON&&Math.abs(s.probeD-probeD)>1e-5){probeD=s.probeD;placeProbe();buildAbsorbers();showTexture(true);}
  if((s.lam||null)!==(PH.lambda||null)){PH.lambda=s.lam;if(PH.on){clearPhotons();warmStats(state.mode);}}
  if(s.id&&L&&s.id!==L.id&&s.id!==AUD.pending){
    if(s.id.startsWith('evo:')){const q=s.id.split(':');if(EV.on&&q[1]===EV.seq){AUD.pending=s.id;AUD.pendT=performance.now();evoLoadStage(+q[2]);}}
    else if(CASES[s.id]&&s.id!=='plain'&&!PROBE_ON&&!isEvoCh(state.chapter)){AUD.pending=s.id;AUD.pendT=performance.now();loadCase(s.id);}}
  if(EV.on&&s.evo&&(AUD.lastP!==s.evo.p||AUD.lastCmp!==s.evo.cmp)){AUD.lastP=s.evo.p;AUD.lastCmp=s.evo.cmp;if(L&&L.evo)showTexture(true);evoUpdateBar();}
  if(s.view!==state.view){if(s.view==='hist'){if(s.hs)HS.z=s.hs.z;setView('hist');}
    else if(VIEWS[s.view]){if(s.view==='section'&&s.sel!=null)state.sel=s.sel;setView(s.view);}
    else{if(HS.on)exitHist();state.view=s.view;setSection(null);}}
  if(s.tab!==state.atlasTab){state.atlasTab=s.tab;renderPanel();}
  if(s.ph!==PH.on)setPhotons(s.ph);
  state.explodeT=s.ex;state.devExplT=s.dev;peelPlane.constant=s.peel;
  if(s.sel!==state.sel){if(s.sel==null)selectStructure(null,true);else if(L&&L.structures[s.sel])selectStructure(s.sel);}
  state.layerSel=s.layerSel;HL.sid=s.hl[0];HL.layer=s.hl[1];
  if((s.cut==null)!==(cutZ==null)||(s.cut!=null&&Math.abs(s.cut-cutZ)>1e-3))setSection(s.cut);
  if(s.hs&&HS.on){if(Math.abs(HS.z-s.hs.z)>1e-4){HS.z=s.hs.z;rebuildSlide(false);}
    if(HS.sel!==s.hs.sel){HS.sel=s.hs.sel;HS.items.forEach((x,k)=>x.el&&x.el.classList.toggle('on',k===HS.sel));renderHistLists();}
    if(HS.SR&&s.hs.w>0){ // show at least what the presenter sees (trimmed to the slide), whatever the projector's aspect ratio
      const SR=HS.SR,S=HS.S,h=s.hs.h||s.hs.w*SR.h/SR.w;let x0=s.hs.cx-s.hs.w/2,x1=s.hs.cx+s.hs.w/2,y0=s.hs.cy-h/2,y1=s.hs.cy+h/2;
      const top=y0;if(S){const a=Math.max(x0,0),b=Math.min(x1,S.W),c=Math.max(y0,0),d=Math.min(y1,S.H);if(b-a>40&&d-c>40){x0=a;x1=b;y0=c;y1=d;}}
      // a wide projector keeps most of the presenter's width; if the presenter sees the skin surface, the top edges line up
      const wsc=SR.w/(x1-x0),sc=Math.max(Math.min(wsc,SR.h/(y1-y0)),wsc*0.8);HS.s=sc;HS.ox=SR.l+SR.w/2-(x0+x1)/2*sc;
      const surf=S?Math.min(...[0.2,0.5,0.8].map(f=>S.at(S.yS,x0+(x1-x0)*f))):0;HS.oy=top<surf?SR.t+6-Math.max(0,Math.min(top,surf-60))*sc:SR.t+SR.h/2-(y0+y1)/2*sc;HS.dirty=true;}}
  if(AUD.notes!==!!s.notes){AUD.notes=!!s.notes;document.body.classList.toggle('notes',AUD.notes);resize();}
  const pi=$('panelInner'),sp=pi.scrollHeight-pi.clientHeight;if(AUD.notes&&sp>0)pi.scrollTop=s.ps*sp;
  updateDock();updateVisibility();audCaption();if(AUD.lastCam)audCam(AUD.lastCam);
}catch(e){console.error(e);}}
function audCaption(){const el=$('audCap');if(!el||!AUD.on)return;const hv=state.view==='hist';if(document.body.classList.contains('hv')!==hv){document.body.classList.toggle('hv',hv);if(HS.on)histLayout();}el.style.visibility=state.view==='hist'?'hidden':'';const ch=state.chapter,c=CH[ch];if(!c)return;let sub='';
  if(ch===5&&L&&!L.evo)sub=ctext(L,'name');
  else if(isEvoCh(ch)&&L&&L.evo){const E=EVO[L.evo.seq],st=E.stages[L.evo.k];sub=`${ev(E.title)}<small>${t(E.ddx?'evo.item':'evo.stage',{n:L.evo.k+1,m:E.stages.length})} · ${ev(st.h)}${st.pT?' · '+st.pT:''}</small>`;}
  const m=ch>0&&state.view!=='hist'?`<span class="m">${PH.lambda&&ch===3?PH.lambda+' nm':t('mode.name'+state.mode)}</span>`:'';
  const h=`<span class="k">${String(ch+1).padStart(2,'0')} · ${t('ch.'+c.key)}</span>${sub?`<span class="s">${sub}</span>`:''}${m}`;if(el.innerHTML!==h)el.innerHTML=h;}
function audOverlay(){const o=$('audFs');if(!o)return;const fs=!!document.fullscreenElement,wait=performance.now()-AUD.lastState>3000;
  const txt=wait?t('aud.wait'):fs?'':t('aud.fs');if(o.dataset.t!==txt){o.dataset.t=txt;o.textContent=txt;o.hidden=!txt;}}
function audFullscreen(){const d=document.documentElement;try{if(!document.fullscreenElement&&d.requestFullscreen){const p=d.requestFullscreen();if(p&&p.catch)p.catch(()=>{});}}catch(e){}}
(function(){const cap=document.createElement('div');cap.id='audCap';document.body.appendChild(cap);
  const fs=document.createElement('button');fs.id='audFs';fs.type='button';fs.hidden=true;fs.addEventListener('click',audFullscreen);document.body.appendChild(fs);
  const bl=document.createElement('div');bl.id='audBlank';document.body.appendChild(bl);
  document.addEventListener('click',e=>{if(AUD.on&&e.target!==fs)audFullscreen();});})();
window.addEventListener('keydown',e=>{if(e.target&&(e.target.tagName==='INPUT'||e.target.tagName==='SELECT'))return;
  if(AUD.on){if(e.key==='f'||e.key==='F')audFullscreen();return;}
  if(PRES.role==='presenter'&&!e.ctrlKey&&!e.metaKey&&!e.altKey){if(e.key==='b'||e.key==='B'){presAct('blank');e.preventDefault();}else if(e.key==='n'||e.key==='N'){presAct('notes');e.preventDefault();}
    else if(e.key==='i'||e.key==='I'){presAct('intro');e.preventDefault();}else if(e.key==='Escape'&&PRES.intro&&PRES.introLocal){presAct('intro');e.preventDefault();}
    /* presentation clickers send PageDown / PageUp: next / previous chapter */
    else if(e.key==='PageDown'||e.key==='PageUp'){const n=state.chapter+(e.key==='PageDown'?1:-1);if(n>=0&&n<CH.length)goChapter(n);e.preventDefault();}}});

/* ---------------- app bridge ----------------
   lens → app  {source:'btl-lens', type:'ready'}                      booted
               {source:'btl-lens', type:'error'}                      the scene could not be built (e.g. no WebGL)
               {source:'btl-lens', type:'chapter', key}               chapter changed (the app mirrors it in its URL)
               {source:'btl-lens', type:'lang', lang}                 language switched here (the app follows)
               {source:'btl-lens', type:'exit'}                       the back link was used
               {source:'btl-lens', type:'close'}                      projector window: the presenter ended the show
               {source:'btl-lens', type:'presenter', status}           presenter state (admins only)
   app → lens  {source:'btl-app', type:'presenter', action}            start | notes | blank | intro | end
               {source:'btl-app', type:'key', key, code, shiftKey, altKey, ctrlKey, metaKey}
                                                                      a key pressed while focus was on the app around this frame
               {source:'btl-app', type:'sync'}                         asks for 'ready' and the presenter state again
   Only same-origin messages from the parent window are accepted, and messages are only sent to the same origin. */
let BOOTED=false;
function appPost(type,data){if(!EMBED.on)return;try{window.parent.postMessage(Object.assign({source:'btl-lens',type},data),location.origin);}catch(e){}}
const APP_ACTIONS=['start','notes','blank','intro','end'];
window.addEventListener('message',e=>{if(!EMBED.on||e.source!==window.parent||e.origin!==location.origin)return;const m=e.data;if(!m||typeof m!=='object'||m.source!=='btl-app')return;
  if(m.type==='presenter'){if(!EMBED.presenter||AUD.on||!APP_ACTIONS.includes(m.action))return;if(m.action==='start')presStart();else if(PRES.role==='presenter')presAct(m.action);}
  else if(m.type==='key'&&typeof m.key==='string')window.dispatchEvent(new KeyboardEvent('keydown',{key:m.key,code:String(m.code||''),shiftKey:!!m.shiftKey,altKey:!!m.altKey,ctrlKey:!!m.ctrlKey,metaKey:!!m.metaKey,bubbles:true,cancelable:true}));
  else if(m.type==='sync'){if(BOOT_FAILED)appPost('error');else if(BOOTED)appPost('ready');presUI(true);}});

if(AUD.on)document.body.classList.add('aud');
function presInit(){if(AUD.on)audStart();presUI(true);setInterval(()=>{try{presTick();}catch(e){}},120);}
setTimeout(()=>{boot();presInit();BOOTED=true;BOOT_OK=true;appPost(BOOT_FAILED?'error':'ready');},40);
