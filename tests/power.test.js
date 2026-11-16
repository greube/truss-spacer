// Circuit grouping. Run: node --test tests/*.test.js
const test=require("node:test"), assert=require("node:assert");
const P=require("../js/power.js");
const spans=gs=>gs.map(g=>[g.from,g.to]);

// every contiguous split into k groups, for brute-force checks
function* splits(n,k,start=0){
  if(k===1){yield [[start,n]];return}
  for(let c=start+1;c<=n-k+1;c++) for(const rest of splits(n,k-1,c)) yield [[start,c],...rest];
}

test("fewest: minimum circuits under the limit",()=>{
  const p=P.planTruss([500,500,500,500,500,500],{limit:1920,fill:"fewest",perSoca:6});
  assert.equal(p.groups.length,2);
  assert.deepEqual(spans(p.groups),[[0,3],[3,6]]);
  assert.deepEqual(p.groups.map(g=>g.load),[1500,1500]);
});

test("spread: uses all 6 circuits of the Socapex",()=>{
  const p=P.planTruss([500,500,500,500,500,500,500,500],{limit:1920,fill:"spread",perSoca:6});
  assert.equal(p.groups.length,6);assert.equal(p.socas,1);
  assert.ok(p.groups.every(g=>g.load<=1000));
  // 3 fixtures can't use more than 3 circuits
  assert.equal(P.planTruss([300,300,300],{limit:1920,fill:"spread"}).groups.length,3);
});

test("a big truss gets a second Socapex",()=>{
  const w=new Array(14).fill(700);           // 2 per circuit at 1920 W -> 7 circuits -> 2 Socapex
  const p=P.planTruss(w,{limit:1920,fill:"fewest",perSoca:6});
  assert.equal(p.groups.length,7);assert.equal(p.socas,2);
  const r=P.planRig([{id:"a",watts:w}],{circuitW:2400,loadPct:80,perSoca:6,fill:"spread"});
  assert.equal(r.trusses[0].socas.length,2);
  assert.deepEqual(r.trusses[0].socas.map(s=>s.circuits.length),[6,6]);
  assert.equal(r.trusses[0].socas[1].circuits[0].label,"B1");
});

test("groups are always neighbours and never over the limit",()=>{
  let seed=3;const rnd=()=>(seed=(seed*48271)%2147483647)/2147483647;
  for(let t=0;t<300;t++){
    const n=1+Math.floor(rnd()*30), w=Array.from({length:n},()=>Math.round(50+rnd()*1200));
    for(const fill of ["spread","fewest"]){
      const p=P.planTruss(w,{limit:1920,fill,perSoca:6});
      let next=0;
      for(const g of p.groups){assert.equal(g.from,next);assert.ok(g.to>g.from);next=g.to;assert.ok(g.load<=1920||g.to-g.from===1)}
      assert.equal(next,n);
    }
  }
});

test("balanced: matches brute force for the heaviest circuit",()=>{
  let seed=11;const rnd=()=>(seed=(seed*48271)%2147483647)/2147483647;
  for(let t=0;t<120;t++){
    const n=2+Math.floor(rnd()*9), w=Array.from({length:n},()=>Math.round(100+rnd()*900));
    const k=P.minGroups(w,1920);
    let bestMax=Infinity;
    for(const s of splits(n,k)){
      const loads=s.map(([a,b])=>w.slice(a,b).reduce((x,y)=>x+y,0));
      if(s.every(([a,b],i)=>loads[i]<=1920||b-a===1)) bestMax=Math.min(bestMax,Math.max(...loads));
    }
    const got=Math.max(...P.splitInto(w,k,1920).map(g=>g.load));
    assert.equal(got,bestMax,JSON.stringify(w));
  }
});

test("a fixture over the limit gets its own circuit and a warning",()=>{
  const p=P.planTruss([400,3000,400],{limit:1920,fill:"fewest"});
  assert.deepEqual(spans(p.groups),[[0,1],[1,2],[2,3]]);
  assert.deepEqual(p.overs,[1]);
});

test("fixtures with no type count as 0 W and are listed",()=>{
  const p=P.planTruss([500,null,500],{limit:1920,fill:"fewest"});
  assert.deepEqual(p.unknown,[1]);assert.equal(p.groups.length,1);
});

test("phase balancing evens L1/L2/L3 across the rig",()=>{
  const trusses=[{id:"a",watts:[1800,1800,1800]},{id:"b",watts:[1800,1800,1800]}];
  const off=P.planRig(trusses,{circuitW:2400,loadPct:80,perSoca:6,fill:"fewest",phases:false});
  assert.deepEqual(off.total.phase,[3600,3600,3600]);
  const uneven=[{id:"a",watts:[1800,1800]},{id:"b",watts:[1800,1800]},{id:"c",watts:[1800,1800]}];
  const plain=P.planRig(uneven,{circuitW:2400,loadPct:80,perSoca:6,fill:"fewest",phases:false});
  assert.deepEqual(plain.total.phase,[5400,5400,0],"in order: every truss uses circuits 1 and 2");
  const bal=P.planRig(uneven,{circuitW:2400,loadPct:80,perSoca:6,fill:"fewest",phases:true});
  assert.deepEqual(bal.total.phase,[3600,3600,3600]);
  assert.equal(bal.total.load,10800);
});

test("Socapex labels",()=>{assert.equal(P.socaLabel(0),"A");assert.equal(P.socaLabel(25),"Z");assert.equal(P.socaLabel(26),"AA")});
