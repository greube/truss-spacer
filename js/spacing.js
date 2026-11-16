/* Truss Spacer: spacing maths. Pure functions, no DOM.
   All internal maths is in millimetres. `S` is a flat settings object:
   job settings (unit, round, joinWarn) merged with one truss (sections, count, mode, inset, insetR, diffEnds, spacing, ref).
   Behaviour is identical to v1; tests/spacing.test.js checks it against v1's recorded output. */
(function(root){
  "use strict";
  const UF={m:1000,mm:1,ft:304.8};
  const ROUNDS={metric:[[0,"No rounding"],[1,"1 mm"],[5,"5 mm"],[10,"10 mm"],[25,"25 mm"],[50,"50 mm"]],
                ft:[[0,"No rounding"],[3.175,"1/8 in"],[6.35,"1/4 in"],[12.7,"1/2 in"],[25.4,"1 in"]]};

  function fmt(mm,signed,S){
    const neg=mm<0; let a=Math.abs(mm); let s;
    if(S.unit==="mm") s=Math.round(a)+"";
    else if(S.unit==="m") s=(a/1000).toFixed(S.round>=10?2:3)+" m";
    else{
      const step=S.round||3.175/2; const inches=Math.round(a/25.4/(step/25.4))*(step/25.4);
      let ft=Math.floor(inches/12+1e-9), inch=inches-ft*12;
      let whole=Math.floor(inch+1e-9), frac=inch-whole, den=16, n=Math.round(frac*den);
      if(n===den){whole++;n=0} if(whole===12){ft++;whole=0}
      while(n&&n%2===0&&den>1){n/=2;den/=2}
      s=ft+"′ "+whole+(n?" "+n+"/"+den:"")+"″";
    }
    if(S.unit==="mm") s+=" mm";
    return (signed&&neg?"−":"")+s;
  }
  const rnd=(mm,S)=>S.round?Math.round(mm/S.round)*S.round:mm;

  function parseSections(str,S){
    const parts=String(str).replace(/[,\-]/g,"+").split(/[+\s]+/).filter(Boolean);
    const out=[];
    for(const p of parts){
      const m=p.match(/^(\d+)[x×*](\d*\.?\d+)$/i);
      if(m){for(let i=0;i<+m[1];i++)out.push(+m[2]*UF[S.unit])}
      else{const v=parseFloat(p); if(!(v>0))return null; out.push(v*UF[S.unit])}
    }
    return out.length?out:null;
  }

  function compute(S){
    const secs=parseSections(S.sections,S); if(!secs) return {err:"Enter the truss as section lengths, e.g. 3+3+2 or 4x2.5"};
    const L=secs.reduce((a,b)=>a+b,0), n=Math.max(1,Math.min(99,Math.round(S.count)||1));
    const ins=(+S.inset||0)*UF[S.unit], sp=(+S.spacing||0)*UF[S.unit];
    let pos=[], warn="";
    if(S.mode==="edge"){
      const insR=S.diffEnds?(+S.insetR||0)*UF[S.unit]:ins, b=L-insR;
      if(ins+insR>=L) return {err:"The end gaps add up to more than the truss length."};
      pos=n===1?[(ins+b)/2]:Array.from({length:n},(_,i)=>ins+i*(b-ins)/(n-1));
    }else if(S.mode==="equal"){const g=L/(n+1);pos=Array.from({length:n},(_,i)=>(i+1)*g)}
    else if(S.mode==="cells"){const c=L/n;pos=Array.from({length:n},(_,i)=>(i+.5)*c)}
    else{
      if(!(sp>0)) return {err:"Enter the gap you want between fixtures."};
      const start=(L-(n-1)*sp)/2; pos=Array.from({length:n},(_,i)=>start+i*sp);
      if(start<0){const fit=Math.floor(L/sp+1e-9)+1; warn=`${n} fixtures at that gap is longer than the truss. Up to ${fit} will fit.`}
    }
    const joins=[];let acc=0;secs.forEach((s,i)=>{if(i)joins.push(acc);acc+=s});
    const jw=+S.joinWarn||0;
    const rows=pos.map((p,i)=>{
      let si=0,a=0; while(si<secs.length-1&&p>=a+secs[si]){a+=secs[si];si++}
      const near=joins.some(j=>Math.abs(j-p)<jw);
      let d=S.ref==="left"?p:S.ref==="right"?L-p:p-L/2;
      const fromR=S.ref==="right";
      return {i,p,mark:rnd(d,S),sec:fromR?secs.length-si:si+1,off:rnd(fromR?a+secs[si]-p:p-a,S),near};
    });
    if(S.ref==="right") rows.reverse();
    rows.forEach((row,k)=>row.gap=k?Math.abs(row.p-rows[k-1].p):null);
    return {L,secs,joins,pos,rows,warn,n};
  }

  // Mark as shown in the table, copied text and image: centre marks get an explicit + on the right
  const markTxt=(row,S)=>(S.ref==="centre"&&row.mark>0?"+":"")+fmt(row.mark,true,S);

  const api={UF,ROUNDS,fmt,rnd,parseSections,compute,markTxt};
  root.TS=root.TS||{}; root.TS.spacing=api;
  if(typeof module!=="undefined") module.exports=api;
})(typeof window!=="undefined"?window:globalThis);
