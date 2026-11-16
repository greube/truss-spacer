// Checks js/spacing.js against output recorded from v1 (main, commit 39fcb92) in Chromium.
// Run: node --test tests/*.test.js
const test=require("node:test"), assert=require("node:assert");
const SP=require("../js/spacing.js");
const golden=require("./v1-golden.json");

const close=(a,b)=>Math.abs(a-b)<1e-6;

test(`matches v1 for ${golden.length} recorded settings`,()=>{
  golden.forEach(({S,out},k)=>{
    const where=`case ${k}: ${JSON.stringify(S)}`;
    const r=SP.compute(S);
    if(r.err){assert.equal(out.err,r.err,where);assert.equal(out.r,null,where);return}
    assert.equal(out.err,r.warn||null,where); // v1 showed warnings in the same message box
    assert.ok(close(out.r.L,r.L),where);
    assert.equal(out.r.rows.length,r.rows.length,where);
    r.rows.forEach((row,i)=>{
      const g=out.r.rows[i];
      for(const key of ["i","sec","near"]) assert.equal(g[key],row[key],`${where} row ${i} ${key}`);
      for(const key of ["p","mark","off"]) assert.ok(close(g[key],row[key]),`${where} row ${i} ${key}`);
      assert.ok(g.gap===null?row.gap===null:close(g.gap,row.gap),`${where} row ${i} gap`);
      // table text: #, mark (+ join flag), gap
      const cells=out.marks[i];
      assert.equal(cells[0],String(i+1),where);
      assert.equal(cells[1],SP.markTxt(row,S)+(row.near?"Near a join":""),`${where} row ${i} mark text`);
      assert.equal(cells[cells.length-1],row.gap!=null?SP.fmt(row.gap,false,S):"—",`${where} row ${i} gap text`);
    });
    assert.equal(out.sum[0],SP.fmt(r.L,false,S),where);
  });
});

test("feet and inches formatting",()=>{
  const S={unit:"ft",round:3.175};
  assert.equal(SP.fmt(304.8,false,S),"1′ 0″");
  assert.equal(SP.fmt(304.8+25.4*1.5,false,S),"1′ 1 1/2″");
  assert.equal(SP.fmt(-12.7,true,S),"−0′ 0 1/2″");
});
