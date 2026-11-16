/* Truss Spacer: power circuits. Pure functions, no DOM.
   Rules agreed with the owner (docs/v2-plan.md):
   - A circuit is always a run of neighbouring fixtures on one truss, so fixtures far apart never share one.
   - Each circuit stays at or under the limit (default 80% of 2400 W). A fixture over the limit on its own
     gets its own circuit and a warning.
   - Circuits are balanced: among the allowed splits, the one with the lowest heaviest circuit wins.
   - Socapex: `perSoca` circuits each (6), one or more per truss, never shared between trusses.
   - fill "spread": use every circuit on the truss's Socapex runs (lighter circuits, fewer link-throughs).
     fill "fewest": as few circuits as possible.
   - Optional phase balancing: circuit numbers within each Socapex are chosen so L1/L2/L3 even out across
     the rig. Circuits 1,4 = L1; 2,5 = L2; 3,6 = L3. */
(function(root){
  "use strict";

  const LETTERS="ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const socaLabel=k=>k<26?LETTERS[k]:LETTERS[Math.floor(k/26)-1]+LETTERS[k%26];

  // Fewest contiguous groups that respect the limit (greedy is optimal for this)
  function minGroups(w,limit){
    let k=0,load=0,open=false;
    for(const x of w){
      if(open&&load+x<=limit){load+=x}
      else{k++;load=x;open=true}
      if(load>limit){open=false} // an over-limit fixture sits alone
    }
    return k;
  }

  // Split w (in order) into exactly k contiguous groups: minimise the heaviest group,
  // then the sum of squares (evens the rest out). Groups over the limit are only allowed as single fixtures.
  function splitInto(w,k,limit){
    const n=w.length,pre=[0];w.forEach(x=>pre.push(pre[pre.length-1]+x));
    const load=(a,b)=>pre[b]-pre[a];
    const ok=(a,b)=>b-a===1||load(a,b)<=limit+1e-9;
    const better=(a,b)=>!b||a[0]<b[0]-1e-9||(Math.abs(a[0]-b[0])<=1e-9&&a[1]<b[1]-1e-9);
    // best[j][i]: first i fixtures in j groups -> [max, sumsq, previous cut]
    const best=Array.from({length:k+1},()=>new Array(n+1).fill(null));
    best[0][0]=[0,0,-1];
    for(let j=1;j<=k;j++){
      for(let i=j;i<=n-(k-j);i++){
        let b=null;
        for(let c=j-1;c<i;c++){
          const p=best[j-1][c];if(!p||!ok(c,i))continue;
          const l=load(c,i),cand=[Math.max(p[0],l),p[1]+l*l,c];
          if(better(cand,b))b=cand;
        }
        best[j][i]=b;
      }
    }
    if(!best[k][n]) return null;
    const cuts=[];let i=n;
    for(let j=k;j>0;j--){const c=best[j][i][2];cuts.unshift([c,i]);i=c}
    return cuts.map(([a,b])=>({from:a,to:b,load:load(a,b)}));
  }

  /* Plan one truss.
     watts: array in physical order (left to right), null for a fixture with no type.
     Returns {groups:[{from,to,load,over}], socas, unknown:[i], overs:[i]} */
  function planTruss(watts,opt){
    const limit=opt.limit, per=Math.max(1,opt.perSoca|0||6);
    const w=watts.map(x=>x==null||!(x>0)?0:+x);
    const unknown=watts.map((x,i)=>x==null?i:-1).filter(i=>i>=0);
    const n=w.length;
    if(!n) return {groups:[],socas:0,unknown,overs:[]};
    const kMin=minGroups(w,limit);
    const socas=Math.ceil(kMin/per);
    const k=opt.fill==="fewest"?kMin:Math.min(n,socas*per);
    const groups=splitInto(w,k,limit)||splitInto(w,kMin,limit);
    groups.forEach(g=>g.over=g.load>limit+1e-9);
    const overs=groups.filter(g=>g.over).map(g=>g.from);
    return {groups,socas,unknown,overs};
  }

  // Slot s (0-based) on a Socapex -> phase 0,1,2
  const phaseOf=s=>s%3;

  /* Plan the whole rig.
     trusses: [{id, watts:[...] }] in rig order. settings: {circuitW, loadPct, perSoca, fill, phases}
     Returns {limit, trusses:[{id, socas:[{label, circuits:[{slot, label, phase, from, to, fixtures, load, over}]}], unknown, overs, load}],
              total:{load, circuits, socas, phase:[L1,L2,L3], unknown, overs}} */
  function planRig(trusses,settings){
    const limit=(+settings.circuitW||2400)*(+settings.loadPct||100)/100;
    const per=Math.max(1,Math.min(12,(+settings.perSoca|0)||6));
    const phaseLoad=[0,0,0];
    const total={load:0,circuits:0,socas:0,phase:phaseLoad,unknown:0,overs:0};
    const out=trusses.map(t=>{
      const p=planTruss(t.watts,{limit,perSoca:per,fill:settings.fill});
      const socas=[];
      const nSoca=Math.max(p.socas,Math.ceil(p.groups.length/per));
      for(let s=0;s<nSoca;s++){
        const gs=p.groups.slice(s*per,(s+1)*per);
        // which slot each group goes in: in order along the truss, or balanced across phases
        let slots=gs.map((_,i)=>i);
        if(settings.phases){
          const free=Array.from({length:per},(_,i)=>i);
          let best=null,bestKey=null;
          // try every way of placing these groups in the Socapex's slots (at most 6! = 720)
          const choose=(rem,k)=>{ // all k-permutations of free slots
            if(k===0) return [[]];
            const res=[];rem.forEach((x,i)=>choose(rem.slice(0,i).concat(rem.slice(i+1)),k-1).forEach(r=>res.push([x].concat(r))));return res;
          };
          for(const cand of (per<=6?choose(free,gs.length):[slots])){
            const ph=phaseLoad.slice();gs.forEach((g,i)=>ph[phaseOf(cand[i])]+=g.load);
            const key=[Math.max(...ph),ph.reduce((a,x)=>a+x*x,0),cand.reduce((a,x,i)=>a+Math.abs(x-i),0)];
            if(!bestKey||key[0]<bestKey[0]-1e-9||(Math.abs(key[0]-bestKey[0])<=1e-9&&(key[1]<bestKey[1]-1e-9||(Math.abs(key[1]-bestKey[1])<=1e-9&&key[2]<bestKey[2])))){best=cand;bestKey=key}
          }
          slots=best;
        }
        const label=socaLabel(s);
        const circuits=gs.map((g,i)=>({slot:slots[i]+1,label:label+(slots[i]+1),phase:phaseOf(slots[i])+1,from:g.from,to:g.to,
          fixtures:Array.from({length:g.to-g.from},(_,k)=>g.from+k),load:g.load,over:g.over}))
          .sort((a,b)=>a.slot-b.slot);
        circuits.forEach(c=>{phaseLoad[c.phase-1]+=c.load});
        socas.push({label,circuits});
      }
      const load=p.groups.reduce((a,g)=>a+g.load,0);
      total.load+=load;total.circuits+=p.groups.length;total.socas+=socas.length;total.unknown+=p.unknown.length;total.overs+=p.overs.length;
      return {id:t.id,socas,unknown:p.unknown,overs:p.overs,load};
    });
    return {limit,perSoca:per,trusses:out,total};
  }

  // Fixture index -> circuit label, for one planned truss
  function circuitMap(pt){
    const m=new Map();
    pt.socas.forEach(s=>s.circuits.forEach(c=>c.fixtures.forEach(i=>m.set(i,c))));
    return m;
  }

  const api={planTruss,planRig,circuitMap,minGroups,splitInto,socaLabel};
  root.TS=root.TS||{}; root.TS.power=api;
  if(typeof module!=="undefined") module.exports=api;
})(typeof window!=="undefined"?window:globalThis);
