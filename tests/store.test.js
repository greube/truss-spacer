// Jobs store: v1 migration, cleaning bad data, job files. Run: node --test tests/*.test.js
const test=require("node:test"), assert=require("node:assert");
const mem={};
globalThis.localStorage={getItem:k=>k in mem?mem[k]:null,setItem:(k,v)=>{mem[k]=String(v)},clear:()=>{for(const k in mem)delete mem[k]}};
const ST=require("../js/store.js");

test("first run turns v1 settings into a job",()=>{
  localStorage.clear();
  localStorage.setItem("trussSpacer",JSON.stringify({sections:"4x2.5",count:9,mode:"fixed",spacing:"1.1",ref:"right",unit:"mm",round:10,joinWarn:"150"}));
  const st=ST.load(), j=st.jobs[st.current];
  assert.equal(j.name,"My rig");
  assert.deepEqual(j.settings,{unit:"mm",round:10,joinWarn:"150"});
  assert.equal(j.trusses.length,1);
  const t=j.trusses[0];
  assert.equal(t.name,"Truss 1");assert.equal(t.sections,"4x2.5");assert.equal(t.count,9);assert.equal(t.mode,"fixed");assert.equal(t.spacing,"1.1");assert.equal(t.ref,"right");
  assert.ok(localStorage.getItem("trussSpacer"),"v1 key is left alone");
});

test("saved jobs come back, and junk is cleaned",()=>{
  localStorage.clear();
  const j=ST.newJob("Gig",{unit:"ft"});j.trusses.push({id:"x",name:"<b>",count:500,mode:"nope",sections:"10+8"});
  ST.save({current:j.id,jobs:{[j.id]:j,bad:"oops"}});
  const st=ST.load(), g=st.jobs[j.id];
  assert.equal(st.current,j.id);
  assert.equal(g.trusses[0].sections,"10+10+8","new truss uses the job's unit defaults");
  assert.equal(g.trusses[1].count,99);assert.equal(g.trusses[1].mode,"edge");assert.equal(g.trusses[1].name,"<b>");
  assert.equal(Object.keys(st.jobs).length,2,"a bad entry becomes an empty job rather than crashing");
});

test("job files round-trip with fresh ids",()=>{
  const j=ST.newJob("Festival",{unit:"m"});j.trusses.push(ST.newTruss("m",{name:"Pod"}));j.view=j.trusses[1].id;
  const k=ST.fromFile(ST.toFile(j));
  assert.equal(k.name,"Festival");assert.equal(k.trusses.length,2);
  assert.notEqual(k.id,j.id);assert.notEqual(k.trusses[1].id,j.trusses[1].id);
  assert.equal(k.view,k.trusses[1].id,"open truss follows the new ids");
  assert.throws(()=>ST.fromFile("{}"),/isn't a Truss Spacer job/);
  assert.throws(()=>ST.fromFile("not json"),/isn't a Truss Spacer job/);
  assert.throws(()=>ST.fromFile(JSON.stringify({app:"truss-spacer",format:9,job:{}})),/newer version/);
});
