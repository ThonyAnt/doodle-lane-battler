// One training worker thread (started by bot/train.js). It plays rounds in the headless arena and reports the scores.
// The generation's candidates sit in memory shared with the trainer; the league and the schedule arrive as messages.
'use strict';
const {parentPort,workerData}=require('worker_threads');
const A=require('./arena.js');
const n=A.SIZE, shared=new Float32Array(workerData.sab), local=new Float32Array(n), skill=workerData.skill;
const fixed=A.FIXED.map(A.opponent);
let league=fixed, sched=[];

parentPort.on('message',m=>{
  if(m.t==='league'){ league=fixed.concat(m.thetas.map(th=>A.netPlayer(th,skill))); return; }      // earlier champions join the fixed six
  if(m.t==='sched'){ sched=m.sched; return; }                                                      // this generation's fights
  if(m.t==='fit'){            // candidate m.i through rounds m.a..m.b of the schedule
    local.set(shared.subarray(m.i*n,(m.i+1)*n));
    const r=A.evaluate(A.netPlayer(local,skill),league,0,sched.slice(m.a,m.b));
    parentPort.postMessage({t:'fit',i:m.i,sum:r.fit*r.rounds,rounds:r.rounds,wins:r.wins,timeouts:r.timeouts,secs:r.secs});
    return;
  }
  if(m.t==='vs'){             // these weights against one named opponent, sides swapped every round
    const r=A.evaluate(A.netPlayer(m.theta,skill),[A.opponent(m.opp)],m.rounds);
    parentPort.postMessage({t:'vs',rounds:r.rounds,wins:r.wins,losses:r.losses,timeouts:r.timeouts,secs:r.secs});
  }
});
parentPort.postMessage({t:'ready'});
