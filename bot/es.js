// A small evolution strategy (after Salimans et al., 2017) for the trained CPU's weights.
// Each generation it tries `pop` copies of the weights, each nudged by random noise and its mirror image (theta + noise,
// theta - noise), ranks them by how well they fought, and moves theta towards the better-ranked nudges. Only the ranking
// counts, so one freak score cannot drag the weights away. Everything is drawn from a seeded generator: a state's
// {theta, gen, seed} is all that has to be saved to carry on exactly where it stopped.
'use strict';

function mulberry32(a){ return ()=>{ a|=0; a=a+0x6D2B79F5|0; let t=Math.imul(a^a>>>15,1|a); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; }; }
// The noise for one generation: `pairs` rows of n standard normals (Box-Muller), the same every time for the same seed and generation.
function noise(seed,gen,pairs,n){
  let h=(seed^Math.imul(gen+1,0x9E3779B1))>>>0; h=Math.imul(h^h>>>16,0x85EBCA6B); h=Math.imul(h^h>>>13,0xC2B2AE35); h=(h^h>>>16)>>>0;
  const rnd=mulberry32(h), out=new Float32Array(pairs*n);
  for(let i=0;i<out.length;i+=2){
    const r=Math.sqrt(-2*Math.log(1-rnd())), a=2*Math.PI*rnd();
    out[i]=r*Math.cos(a); if(i+1<out.length) out[i+1]=r*Math.sin(a);
  }
  return out;
}
const evenPop=p=>Math.max(2,2*Math.round((p||64)/2));

function esInit(n,seed){ return {theta:new Float32Array(n),gen:0,seed:(seed>>>0)||1}; }

// The candidates for this generation: [theta+s*e0, theta-s*e0, theta+s*e1, theta-s*e1, ...].
function esAsk(state,opts){
  const pop=evenPop(opts&&opts.pop), sigma=(opts&&opts.sigma)||0.1, th=state.theta, n=th.length, eps=noise(state.seed,state.gen,pop/2,n), out=[];
  for(let k=0;k<pop/2;k++){
    const a=new Float32Array(n), b=new Float32Array(n), o=k*n;
    for(let i=0;i<n;i++){ const d=sigma*eps[o+i]; a[i]=th[i]+d; b[i]=th[i]-d; }
    out.push(a,b);
  }
  return out;
}

// Ranks from -0.5 (worst) to +0.5 (best); equal scores share the middle of their places, so ties pull nowhere.
function centredRanks(f){
  const n=f.length, idx=Array.from(f,(v,i)=>i).sort((a,b)=>f[a]-f[b]), u=new Float64Array(n);
  for(let i=0;i<n;){ let j=i; while(j+1<n&&f[idx[j+1]]===f[idx[i]]) j++; const r=n>1?((i+j)/2)/(n-1)-0.5:0; for(let k=i;k<=j;k++) u[idx[k]]=r; i=j+1; }
  return u;
}

// fitnesses[i] is the score of candidate i from esAsk on this same state (same pop and sigma). Returns the next state.
// theta += lr * ( sum(rank_i * noise_i) / (pop * sigma) - decay * theta )
function esTell(state,fitnesses,opts){
  const pop=fitnesses.length, sigma=(opts&&opts.sigma)||0.1, lr=opts&&opts.lr!==undefined?opts.lr:0.03, decay=opts&&opts.decay!==undefined?opts.decay:0.005;
  if(pop<2||pop%2) throw new Error('esTell needs one fitness per candidate from esAsk (an even number), got '+pop);
  const th=state.theta, n=th.length, eps=noise(state.seed,state.gen,pop/2,n), u=centredRanks(fitnesses), next=new Float32Array(n), g=new Float64Array(n);
  for(let k=0;k<pop/2;k++){ const w=u[2*k]-u[2*k+1], o=k*n; if(w!==0) for(let i=0;i<n;i++) g[i]+=w*eps[o+i]; }
  const sc=lr/(pop*sigma);
  for(let i=0;i<n;i++) next[i]=th[i]+sc*g[i]-lr*decay*th[i];
  return {theta:next,gen:state.gen+1,seed:state.seed};
}

module.exports={esInit,esAsk,esTell,mulberry32};
