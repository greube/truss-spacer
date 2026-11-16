/* Truss Spacer: UI. Jobs hold several trusses; each truss uses the v1 spacing screen.
   `S` is the working settings object: the job's settings merged with the open truss.
   Every change goes through put(), which also writes it back into the job. */
(function(){
  "use strict";
  const $=id=>document.getElementById(id);
  const SP=window.TS.spacing, ST=window.TS.store, PW=window.TS.power, FX=window.TS.fixtures;
  const {UF,ROUNDS}=SP;
  const esc=s=>String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

  let store=ST.load();
  let job=store.jobs[store.current];
  let truss=null;          // the open truss, or null on the Rig overview
  let S={};
  let done=new Set(), sel=-1, lastKey="";
  let showSec=false;       // deliberately not saved: starts off every time the app opens

  const fmt=(mm,signed)=>SP.fmt(mm,signed,S);
  const rnd=mm=>SP.rnd(mm,S);
  const compute=()=>SP.compute(S);
  const markTxt=row=>SP.markTxt(row,S);
  const merged=t=>Object.assign({},job.settings,t);
  const tName=(t,i)=>(t.name||"").trim()||`Truss ${(i==null?job.trusses.indexOf(t):i)+1}`;
  const slug=s=>String(s).toLowerCase().replace(/[^a-z0-9.]+/g,"-").replace(/^-+|-+$/g,"").slice(0,40);

  /* ---------- Fixture types and power ---------- */
  const nOf=t=>Math.max(1,Math.min(99,Math.round(+t.count)||1));
  const typeOf=(t,i)=>{const k=ST.typeAt(t,i);return k&&job.types[k]?job.types[k]:null};
  const hasTypes=t=>{for(let i=0;i<nOf(t);i++)if(typeOf(t,i))return true;return false};
  const anyTypes=()=>job.trusses.some(hasTypes);
  // Fixture number as shown in the marks table (counts from the right when measuring from the right)
  const fxNo=(t,i)=>t.ref==="right"?nOf(t)-i:i+1;
  const W=w=>Math.round(w).toLocaleString("en-AU")+" W";
  const PHASE=["L1","L2","L3"];
  let plan=null;
  function planRig(){
    plan=PW.planRig(job.trusses.map(t=>({id:t.id,watts:Array.from({length:nOf(t)},(_,i)=>{const ty=typeOf(t,i);return ty?ty.w:null})})),job.settings);
    return plan;
  }
  const planOf=t=>plan&&plan.trusses.find(x=>x.id===t.id);
  // "1–3, 5" style list of fixture numbers
  function numList(nums){
    nums=nums.slice().sort((a,b)=>a-b);const out=[];
    for(let i=0;i<nums.length;){let j=i;while(j+1<nums.length&&nums[j+1]===nums[j]+1)j++;out.push(j>i+1?`${nums[i]}–${nums[j]}`:j===i+1?`${nums[i]}, ${nums[j]}`:`${nums[i]}`);i=j+1}
    return out.join(", ");
  }
  // "MegaPointe ×4, Aura ×2" for a set of fixtures on a truss
  function typeSummary(t,idx,full){
    const c=new Map();idx.forEach(i=>{const ty=typeOf(t,i);const k=ty?(full?FX.label(ty):ty.n):"No type";c.set(k,(c.get(k)||0)+1)});
    return [...c].map(([k,v])=>v>1?`${k} ×${v}`:k).join(", ");
  }

  let saveWarned=false;
  function save(){
    job.updated=Date.now(); store.current=job.id;
    if(!ST.save(store)&&!saveWarned){saveWarned=true;alert("This phone isn't letting the app save. Changes will be lost when you close it.")}
  }
  function put(k,v){S[k]=v;if(ST.SETTING_KEYS.includes(k))job.settings[k]=v;else if(truss)truss[k]=v}
  const upd=()=>{save();render()};

  /* ---------- Tabs: Rig + one per truss ---------- */
  function renderTabs(){
    $("tabs").innerHTML=`<button type="button" data-t="rig" aria-pressed="${!truss}">Rig</button>`+
      job.trusses.map((t,i)=>`<button type="button" data-t="${t.id}" aria-pressed="${!!truss&&truss.id===t.id}">${esc(tName(t,i))}</button>`).join("")+
      `<button type="button" class="add" data-t="add" aria-label="Add a truss">+ Truss</button>`;
    $("jobLabel").textContent=job.name;
  }
  function openView(id){
    truss=id==="rig"?null:job.trusses.find(t=>t.id===id)||null;
    job.view=truss?truss.id:"rig";
    S=merged(truss||{});
    if(truss)sync();
    upd();
    const on=$("tabs").querySelector('[aria-pressed="true"]');
    if(on&&on.scrollIntoView)on.scrollIntoView({block:"nearest",inline:"nearest"});
  }
  function addTruss(){
    const t=ST.newTruss(job.settings.unit,{name:`Truss ${job.trusses.length+1}`});
    job.trusses.push(t);openView(t.id);
    $("tname").focus();$("tname").select();
  }
  $("tabs").addEventListener("click",e=>{
    const b=e.target.closest("button");if(!b)return;
    if(b.dataset.t==="add")addTruss();else openView(b.dataset.t);
  });

  /* ---------- Truss actions ---------- */
  $("tname").addEventListener("input",e=>{if(!truss)return;truss.name=e.target.value;save();renderTabs()});
  $("dupTruss").onclick=()=>{
    const i=job.trusses.indexOf(truss);
    const t=Object.assign({},truss,{id:ST.uid(),name:`${tName(truss,i)} copy`,fx:(truss.fx||[]).slice()});
    job.trusses.splice(i+1,0,t);openView(t.id);
  };
  $("delTruss").onclick=()=>{
    if(job.trusses.length<2)return;
    const i=job.trusses.indexOf(truss);
    if(!confirm(`Delete ${tName(truss,i)}? This can't be undone.`))return;
    job.trusses.splice(i,1);openView(job.trusses[Math.min(i,job.trusses.length-1)].id);
  };
  function moveTruss(d){
    const i=job.trusses.indexOf(truss),j=i+d;if(j<0||j>=job.trusses.length)return;
    [job.trusses[i],job.trusses[j]]=[job.trusses[j],job.trusses[i]];upd();
  }
  $("moveL").onclick=()=>moveTruss(-1);
  $("moveR").onclick=()=>moveTruss(1);
  $("addTruss2").onclick=addTruss;

  /* ---------- Truss drawing ---------- */
  function svgDraw(r){
    const svg=$("svg"); const W=1000,P=34,y1=40,y2=70,sc=(W-2*P)/r.L,X=p=>P+p*sc;
    let h=`<g stroke="var(--truss)" fill="none">`;
    h+=`<line x1="${P}" y1="${y1}" x2="${W-P}" y2="${y1}" stroke-width="4"/><line x1="${P}" y1="${y2}" x2="${W-P}" y2="${y2}" stroke-width="4"/>`;
    let acc=0; const step=30;
    r.secs.forEach(s=>{
      const x0=X(acc),x1=X(acc+s); let d="";
      const cnt=Math.max(1,Math.round((x1-x0)/step)), w=(x1-x0)/cnt;
      for(let i=0;i<cnt;i++){d+=`M${(x0+i*w).toFixed(1)},${i%2?y1:y2}L${(x0+(i+1)*w).toFixed(1)},${i%2?y2:y1}`}
      h+=`<path d="${d}" stroke-width="1.5" opacity=".6"/>`;
      acc+=s;
    });
    h+=`</g>`;
    [0,...r.joins,r.L].forEach(j=>{h+=`<rect x="${X(j)-3}" y="${y1-6}" width="6" height="${y2-y1+12}" fill="var(--truss)"/>`});
    acc=0;r.secs.forEach(s=>{h+=`<text x="${X(acc+s/2)}" y="${y1-12}" text-anchor="middle" font-family="var(--f-num)" font-size="15" fill="var(--muted)">${fmt(s)}</text>`;acc+=s});
    const showNum=r.n<=24;
    r.rows.slice().sort((a,b)=>a.p-b.p).forEach(row=>{
      const cx=X(row.p), on=row.i===sel, dn=done.has(row.i);
      const col=row.near?"var(--warn)":on?"var(--accent)":dn?"var(--ok)":"var(--fg)";
      h+=`<g data-i="${row.i}" style="cursor:pointer"><line x1="${cx}" y1="${y2}" x2="${cx}" y2="${y2+12}" stroke="${col}" stroke-width="3"/>`+
         `<path d="M${cx-9},${y2+12}h18l-4,24h-10z" fill="${dn||on?col:"none"}" stroke="${col}" stroke-width="2.5"/>`;
      if(showNum) h+=`<text x="${cx}" y="${y2+56}" text-anchor="middle" font-family="var(--f-num)" font-weight="600" font-size="15" fill="${col}">${rowNo(row)}</text>`;
      h+=`<rect x="${cx-14}" y="${y1}" width="28" height="100" fill="transparent"/></g>`;
    });
    const lx=S.ref==="right"?W-P:S.ref==="centre"?W/2:P;
    if(S.ref==="centre") h+=`<line x1="${W/2}" y1="${y1-4}" x2="${W/2}" y2="${y2+4}" stroke="var(--accent)" stroke-dasharray="4 4" stroke-width="2"/>`;
    h+=`<text x="${lx}" y="${146}" text-anchor="${S.ref==="right"?"end":S.ref==="centre"?"middle":"start"}" font-family="var(--f-body)" font-size="13" font-weight="600" letter-spacing="1.5" fill="var(--accent)">▲ 0 HERE</text>`;
    svg.innerHTML=h;
  }
  let numMap=new Map();
  const rowNo=row=>numMap.get(row.i);

  /* ---------- Render ---------- */
  function render(){
    planRig();
    renderTabs();
    $("trussView").hidden=!truss; $("rigView").hidden=!!truss;
    if(!truss){renderRig();return}
    const r=compute();
    document.querySelectorAll(".u").forEach(e=>e.textContent=S.unit);
    $("insetWrap").hidden=S.mode!=="edge";
    $("insetRWrap").hidden=!S.diffEnds; $("insetLab").textContent=S.diffEnds?"Left end":"End gap"; $("spacingWrap").hidden=S.mode!=="fixed";
    document.querySelectorAll("#mode button").forEach(b=>b.setAttribute("aria-pressed",b.dataset.v===S.mode));
    document.querySelectorAll("#ref button").forEach(b=>b.setAttribute("aria-pressed",b.dataset.v===S.ref));
    const i=job.trusses.indexOf(truss);
    $("delTruss").disabled=job.trusses.length<2; $("moveL").disabled=i===0; $("moveR").disabled=i===job.trusses.length-1;
    const msg=$("msg");
    if(r.err){msg.hidden=false;msg.textContent=r.err;$("rows").innerHTML="";$("svg").innerHTML="";["sLen","sGap","sEnd"].forEach(i=>$(i).textContent="–");window._r=r;return}
    msg.hidden=!r.warn; msg.textContent=r.warn;
    const key=[truss.id,S.sections,S.count,S.mode,S.inset,S.insetR,S.diffEnds,S.spacing,S.unit].join("|");
    if(key!==lastKey){done.clear();sel=-1;lastKey=key}
    numMap=new Map(r.rows.map((row,k)=>[row.i,k+1]));
    const gap=r.n>1?r.pos[1]-r.pos[0]:null;
    $("sLen").textContent=fmt(r.L); $("sGap").textContent=gap!=null?fmt(gap):"—"; {const eL=r.pos[0],eR=r.L-r.pos[r.pos.length-1],same=Math.abs(eL-eR)<0.5;
      $("sEnd").textContent=same?fmt(eL):`L ${fmt(eL)}\nR ${fmt(eR)}`;$("sEnd").classList.toggle("two",!same);
      $("sEndLab").textContent=same?"Each end":"Ends";}
    const refTxt={left:"the left end",right:"the right end",centre:"the centre of the truss (− is left, + is right)"}[S.ref];
    $("refNote").textContent=`Measured from ${refTxt}. Tap a row to tick it off.`;
    $("thMark").textContent={left:"From left",right:"From right",centre:"From centre"}[S.ref];
    $("rows").innerHTML=r.rows.map((row,k)=>{
      const g=row.gap!=null?fmt(row.gap):"—";
      return `<tr class="row${done.has(row.i)?" done":""}${row.i===sel?" sel":""}" data-i="${row.i}">
        <td><span class="num">${k+1}</span></td>
        <td class="mark">${markTxt(row)}${row.near?'<span class="sub flag">Near a join</span>':""}</td>
        ${showSec?`<td>${fmt(row.off)}<span class="sub">Section ${row.sec}</span></td>`:""}
        <td>${g}</td>${powCell(row)}</tr>`;
    }).join("");
    $("thSec").hidden=!showSec;
    renderTrussPower(r);
    svgDraw(r);
    window._r=r;
  }

  function powCell(row){
    if(!hasTypes(truss)) return "";
    const ty=typeOf(truss,row.i), c=PW.circuitMap(planOf(truss)).get(row.i);
    const cls=!ty?" none":c&&c.over?" over":"";
    return `<td class="pw"><button type="button" class="tcell${cls}" data-fx="${row.i}" aria-label="Fixture ${fxNo(truss,row.i)}: change type"><b>${ty&&c?c.label:"—"}</b><small>${ty?esc(ty.n):"Set type"}</small></button></td>`;
  }
  function renderTrussPower(r){
    const has=hasTypes(truss), n=nOf(truss);
    $("thPow").hidden=!has;
    // the type button: one type, mixed, or none yet
    const keys=new Set();for(let i=0;i<n;i++)keys.add(ST.typeAt(truss,i));
    const b=$("typeBtn");
    if(!has){b.classList.add("empty");$("typeName").textContent="Choose fixture type";$("typeMeta").textContent="Search the database or add your own"}
    else if(keys.size===1){const ty=typeOf(truss,0);b.classList.remove("empty");$("typeName").textContent=FX.label(ty);$("typeMeta").textContent=`${W(ty.w)} each · ${FX.SRC[ty.src]||""} · tap a circuit in the list to change one fixture`}
    else{b.classList.remove("empty");$("typeName").textContent="Mixed types";$("typeMeta").textContent=typeSummary(truss,Array.from({length:n},(_,i)=>i))}
    const pn=$("powNote"), pt=planOf(truss);
    if(!has||!pt){pn.hidden=true;return}
    const circ=pt.socas.reduce((a,s)=>a+s.circuits.length,0);
    let h=`Power: <b>${W(pt.load)}</b> on ${circ} circuit${circ>1?"s":""} · Socapex ${pt.socas.map(s=>s.label).join(", ")}`;
    if(pt.overs.length)h+=` <span class="flag">· ${pt.overs.length} fixture${pt.overs.length>1?"s":""} over the circuit limit on ${pt.overs.length>1?"their":"its"} own</span>`;
    if(pt.unknown.length)h+=` <span class="flag">· ${pt.unknown.length} with no type</span>`;
    pn.innerHTML=h;pn.hidden=false;
  }

  /* ---------- Rig overview ---------- */
  function miniSvg(r){
    const W=300,P=6,y1=10,y2=22,X=p=>P+p*(W-2*P)/r.L;
    let h=`<rect x="${P}" y="${y1}" width="${W-2*P}" height="${y2-y1}" fill="none" stroke="var(--truss)" stroke-width="2"/>`;
    r.joins.forEach(j=>{h+=`<line x1="${X(j)}" y1="${y1-3}" x2="${X(j)}" y2="${y2+3}" stroke="var(--truss)" stroke-width="2"/>`});
    r.rows.forEach(row=>{h+=`<line x1="${X(row.p)}" y1="${y2}" x2="${X(row.p)}" y2="${y2+9}" stroke="${row.near?"var(--warn)":"var(--accent)"}" stroke-width="3"/>`});
    return `<svg viewBox="0 0 ${W} 34" aria-hidden="true">${h}</svg>`;
  }
  function renderRig(){
    let fx=0,len=0,bad=0;
    $("rigList").innerHTML=job.trusses.map((t,i)=>{
      const s=merged(t), r=SP.compute(s), f=(mm)=>SP.fmt(mm,false,s);
      const head=`<span class="rc-name">${esc(tName(t,i))}</span>`;
      if(r.err){bad++;return `<button type="button" class="rigcard" data-t="${t.id}">${head}<span class="rc-err">${esc(r.err)}</span></button>`}
      fx+=r.n;len+=r.L;
      const near=r.rows.filter(x=>x.near).length;
      const gap=r.n>1?f(r.pos[1]-r.pos[0]):"—";
      return `<button type="button" class="rigcard" data-t="${t.id}">${head}<span class="rc-len">${f(r.L)}</span>
        <span class="rc-meta">${esc(t.sections.replace(/\s/g,""))} · ${r.n} fixture${r.n>1?"s":""} · gap ${gap}${hasTypes(t)?` · ${W(planOf(t).load)}`:""}</span>
        ${miniSvg(r)}
        ${r.warn?`<span class="rc-err">${esc(r.warn)}</span>`:""}${near?`<span class="rc-err">${near} near a join</span>`:""}</button>`;
    }).join("");
    const n=job.trusses.length;
    $("rigNote").textContent=`${n} truss${n>1?"es":""} · ${fx} fixture${fx===1?"":"s"} · ${SP.fmt(len,false,job.settings)} of truss${bad?` · ${bad} need${bad>1?"":"s"} fixing`:""}. Tap a truss to open it.`;
    renderPower();
    window._r=null;
  }
  $("rigList").addEventListener("click",e=>{const b=e.target.closest(".rigcard");if(b)openView(b.dataset.t)});

  /* ---------- Power: rig sheet ---------- */
  function renderPower(){
    const st=job.settings, tot=plan.total, has=anyTypes();
    $("pwW").value=st.circuitW;$("pwPct").value=st.loadPct;$("pwPer").value=st.perSoca;$("pwPhase").checked=!!st.phases;
    document.querySelectorAll("#pwFill button").forEach(b=>b.setAttribute("aria-pressed",b.dataset.v===st.fill));
    $("powerNote").textContent=`Circuits up to ${W(plan.limit)} (${st.loadPct}% of ${W(st.circuitW)}), ${st.perSoca} per Socapex, one Socapex run per truss. Neighbouring fixtures share circuits.`;
    ["copyPower","exportPower"].forEach(id=>$(id).disabled=!has);
    $("powerTotal").hidden=!has;
    if(!has){
      $("powerList").innerHTML=`<p class="hint">Open a truss and choose its fixture type to work out circuits.</p>`;$("powerWarn").hidden=true;return;
    }
    $("powerTotal").innerHTML=`<div><div class="lab">Total</div><div class="v">${W(tot.load)}</div></div>`+
      `<div><div class="lab">Circuits</div><div class="v">${tot.circuits}</div></div>`+
      `<div><div class="lab">Socapex</div><div class="v">${tot.socas}</div></div>`+
      (st.phases?PHASE.map((p,k)=>`<div><div class="lab">${p}</div><div class="v">${W(tot.phase[k])}</div></div>`).join(""):"");
    const warns=[];
    if(tot.overs)warns.push(`${tot.overs} fixture${tot.overs>1?"s are":" is"} over the ${W(plan.limit)} circuit limit on ${tot.overs>1?"their":"its"} own. Check the wattage, or raise the limit in Power settings.`);
    if(tot.unknown)warns.push(`${tot.unknown} fixture${tot.unknown>1?"s have":" has"} no type, so ${tot.unknown>1?"they're":"it's"} counted as 0 W.`);
    $("powerWarn").hidden=!warns.length;$("powerWarn").innerHTML=warns.map(esc).join("<br>");
    $("powerList").innerHTML=job.trusses.map((t,ti)=>{
      if(!hasTypes(t)) return `<div class="pcard"><h3>${esc(tName(t,ti))}<span>no types yet</span></h3></div>`;
      const pt=planOf(t);
      const rows=pt.socas.map(so=>`<tr class="soca"><td colspan="${st.phases?5:4}">Socapex ${so.label}</td></tr>`+so.circuits.map(c=>{
        const pct=c.load/plan.limit*100;
        return `<tr class="${c.over?"over":""}"><td>${c.label}</td>${st.phases?`<td>${PHASE[c.phase-1]}</td>`:""}
          <td class="fxs">#${numList(c.fixtures.map(i=>fxNo(t,i)))}<small>${esc(typeSummary(t,c.fixtures))}</small></td>
          <td>${W(c.load)}<span class="bar${c.over?" over":pct>90?" hi":""}"><i style="width:${Math.min(100,pct).toFixed(0)}%"></i></span></td>
          <td>${pct.toFixed(0)}%</td></tr>`}).join("")).join("");
      return `<div class="pcard"><h3>${esc(tName(t,ti))}<span>${W(pt.load)}</span></h3><table>
        <thead><tr><th>Circuit</th>${st.phases?"<th>Phase</th>":""}<th style="text-align:left">Fixtures</th><th>Load</th><th>%</th></tr></thead><tbody>${rows}</tbody></table></div>`;
    }).join("");
  }
  const numIn=(id,key,lo,hi)=>$(id).addEventListener("change",e=>{const v=+e.target.value;if(v>=lo&&v<=hi){put(key,key==="perSoca"?Math.round(v):v);upd()}else e.target.value=job.settings[key]});
  numIn("pwW","circuitW",100,100000);numIn("pwPct","loadPct",10,100);numIn("pwPer","perSoca",1,12);
  document.querySelectorAll("#pwFill button").forEach(b=>b.onclick=()=>{put("fill",b.dataset.v);upd()});
  $("pwPhase").addEventListener("change",e=>{put("phases",e.target.checked);upd()});

  /* ---------- Fixture type picker ---------- */
  let fxAt=-1, fxScope="all";   // fxAt: fixture index the sheet was opened for, or -1 for the whole truss
  function openFx(i){
    if(!truss)return;
    fxAt=i;fxScope=i<0?"all":"one";
    $("fxScope").hidden=i<0;
    $("fxFor").textContent=i<0?`For all ${nOf(truss)} fixtures on ${tName(truss)}.`:`Fixture ${fxNo(truss,i)} on ${tName(truss)}${typeOf(truss,i)?`, now ${FX.label(typeOf(truss,i))}`:""}.`;
    $("fxClear").hidden=!hasTypes(truss);
    $("fxSearch").value="";renderFxScope();renderFxList();
    $("fxSheet").hidden=false;$("fxSearch").focus();
  }
  function renderFxScope(){document.querySelectorAll("#fxScope button").forEach(b=>b.setAttribute("aria-pressed",b.dataset.v===fxScope))}
  function fxItem(t,key,edit){
    return `<div class="fxrow"><button type="button" class="fxitem" data-key="${esc(key)}"><b>${esc(FX.label(t))}</b>
      <small><span class="w">${W(t.w)}</span> · ${esc(FX.SRC[t.src]||"")}</small></button>${edit?`<button type="button" class="fxedit" data-edit="${esc(key)}" aria-label="Change watts for ${esc(FX.label(t))}">Edit W</button>`:""}</div>`;
  }
  let fxShown=new Map();   // key -> type, for the items currently listed
  function renderFxList(){
    const q=$("fxSearch").value.trim();fxShown=new Map();let h="";
    if(!q){
      const used=[...new Set(job.trusses.flatMap(t=>Array.from({length:nOf(t)},(_,i)=>ST.typeAt(t,i))))].filter(k=>k&&job.types[k]);
      if(used.length){h+=`<div class="fxsec">In this job</div>`+used.map(k=>{fxShown.set(k,job.types[k]);return fxItem(job.types[k],k,true)}).join("")}
      const my=FX.mine().filter(t=>!used.includes(t.key));
      if(my.length){h+=`<div class="fxsec">My fixtures</div>`+my.slice(0,30).map(t=>{fxShown.set(t.key,t);return fxItem(t,t.key,false)}).join("")}
      h+=`<p class="hint">Search ${FX.count().toLocaleString("en-AU")} fixtures by model or manufacturer.</p>`;
    }else{
      const res=FX.search(q,40);
      h+=res.length?res.map(t=>{const jt=job.types[t.key];fxShown.set(t.key,jt||t);return fxItem(jt||t,t.key,!!jt)}).join("")
        :`<p class="hint">Nothing found for “${esc(q)}”. Check the spelling, try just the model name, or add it below.</p>`;
    }
    $("fxList").innerHTML=h;
  }
  function assignType(key){
    const n=nOf(truss), fx=Array.from({length:n},(_,i)=>ST.typeAt(truss,i));
    for(let i=0;i<n;i++) if(fxScope==="all"||fxAt<0||(fxScope==="one"&&i===fxAt)||(fxScope==="alt"&&(i-fxAt)%2===0)) fx[i]=key;
    truss.fx=fx;S.fx=fx;
    $("fxSheet").hidden=true;upd();
  }
  function pickType(key,t){
    if(!job.types[key]) job.types[key]=FX.snapshot(t);
    assignType(key);
  }
  $("fxSearch").addEventListener("input",renderFxList);
  $("fxScope").addEventListener("click",e=>{const b=e.target.closest("button");if(b){fxScope=b.dataset.v;renderFxScope()}});
  $("fxList").addEventListener("click",e=>{
    const ed=e.target.closest("[data-edit]");
    if(ed){
      const k=ed.dataset.edit,t=job.types[k];if(!t)return;
      const v=prompt(`Maximum watts for ${FX.label(t)} in this job:`,t.w);
      if(v!==null&&+v>0&&+v<100000){t.w=Math.round(+v);t.src="j";upd();renderFxList()}
      return;
    }
    const b=e.target.closest("[data-key]");if(b&&fxShown.has(b.dataset.key))pickType(b.dataset.key,fxShown.get(b.dataset.key));
  });
  $("fxAddBtn").onclick=()=>{
    const m=$("fxM").value.trim(),n=$("fxN").value.trim(),w=+$("fxW").value;
    if(!n||!(w>0&&w<100000)){alert("Enter at least the model and its maximum watts.");return}
    const t=FX.addMine(m,n,w);$("fxM").value=$("fxN").value=$("fxW").value="";$("fxAdd").open=false;
    pickType(t.key,t);
  };
  $("fxClear").onclick=()=>assignType("");
  $("typeBtn").onclick=()=>openFx(-1);
  $("fxClose").onclick=()=>{$("fxSheet").hidden=true};
  $("fxSheet").addEventListener("click",e=>{if(e.target.id==="fxSheet")$("fxSheet").hidden=true});

  /* ---------- Inputs ---------- */
  function fillRound(){
    const list=S.unit==="ft"?ROUNDS.ft:ROUNDS.metric;
    if(!list.some(o=>o[0]==S.round)) put("round",S.unit==="ft"?3.175:5);
    $("round").innerHTML=list.map(o=>`<option value="${o[0]}"${o[0]==S.round?" selected":""}>${o[1]}</option>`).join("");
  }

  const CHIP_SIZES={m:[1,1.5,2,2.5,3,4],mm:[1000,1500,2000,2500,3000,4000],ft:[4,5,8,10]};
  function fillChips(){
    $("chips").innerHTML=`<button type="button" class="k" data-k="+" aria-label="Type a plus sign">+</button>`+
      CHIP_SIZES[S.unit].map(v=>`<button type="button" data-add="${v}" aria-label="Add a ${v} ${S.unit} section">${v}</button>`).join("")+
      `<button type="button" class="act" data-k="back" aria-label="Remove last section">⌫</button><button type="button" class="act" data-k="clear">Clear</button>`;
  }
  $("chips").addEventListener("click",e=>{
    const b=e.target.closest("button");if(!b)return;
    const inp=$("sections");let v=S.sections.trim();
    if(b.dataset.add){v=v&&!/[+]$/.test(v)?v+"+"+b.dataset.add:v+b.dataset.add}
    else if(b.dataset.k==="+"){
      // insert at the cursor if the field is being typed in, otherwise at the end
      if(document.activeElement===inp){const s=inp.selectionStart,en=inp.selectionEnd;v=inp.value.slice(0,s)+"+"+inp.value.slice(en);put("sections",v);inp.value=v;inp.setSelectionRange(s+1,s+1);upd();return}
      v=v+"+";
    }
    else if(b.dataset.k==="back"){v=v.replace(/\+?[^+]*$/,"")}
    else if(b.dataset.k==="clear"){v=""}
    put("sections",v);inp.value=v;upd();
  });
  // keep focus (and the keyboard) in the field when tapping + while typing
  $("chips").addEventListener("mousedown",e=>{if(document.activeElement===$("sections")&&e.target.closest('[data-k="+"]'))e.preventDefault()});

  function sync(){fillChips();$("tname").value=truss?truss.name:"";$("sections").value=S.sections;$("count").value=S.count;$("inset").value=S.inset;$("insetR").value=S.insetR;$("diffEnds").checked=!!S.diffEnds;$("spacing").value=S.spacing;$("unit").value=S.unit;$("joinWarn").value=S.joinWarn;fillRound()}

  $("sections").addEventListener("input",e=>{put("sections",e.target.value);upd()});
  $("count").addEventListener("input",e=>{const v=parseInt(e.target.value);if(v>0){put("count",Math.min(99,v));upd()}});
  $("minus").onclick=()=>{put("count",Math.max(1,S.count-1));$("count").value=S.count;upd()};
  $("plus").onclick=()=>{put("count",Math.min(99,S.count+1));$("count").value=S.count;upd()};
  $("inset").addEventListener("input",e=>{put("inset",e.target.value);upd()});
  $("insetR").addEventListener("input",e=>{put("insetR",e.target.value);upd()});
  $("diffEnds").addEventListener("change",e=>{put("diffEnds",e.target.checked);if(S.diffEnds){put("insetR",S.inset);$("insetR").value=S.insetR}upd()});
  $("spacing").addEventListener("input",e=>{put("spacing",e.target.value);upd()});
  $("joinWarn").addEventListener("input",e=>{put("joinWarn",e.target.value);upd()});
  $("showSec").checked=false;
  $("showSec").addEventListener("change",e=>{showSec=e.target.checked;render()});
  $("round").addEventListener("change",e=>{put("round",+e.target.value);upd()});
  // Units belong to the job, so changing them converts every truss in it
  $("unit").addEventListener("change",e=>{
    const from=job.settings.unit,to=e.target.value,f=UF[from]/UF[to],conv=v=>+(v*f).toFixed(to==="mm"?0:3);
    job.trusses.forEach(t=>{
      const secs=SP.parseSections(t.sections,{unit:from});
      if(secs) t.sections=secs.map(s=>+(s/UF[to]).toFixed(to==="mm"?0:3)).join("+");
      t.inset=conv(+t.inset||0);t.insetR=conv(+t.insetR||0);t.spacing=conv(+t.spacing||0);
    });
    job.settings.unit=to;job.settings.round=-1;S=merged(truss||{});sync();upd()});
  document.querySelectorAll("#mode button").forEach(b=>b.onclick=()=>{put("mode",b.dataset.v);upd()});
  document.querySelectorAll("#ref button").forEach(b=>b.onclick=()=>{put("ref",b.dataset.v);upd()});

  function toggleRow(i){if(done.has(i)){done.delete(i);sel=i}else if(sel===i){done.add(i)}else{sel=i}render()}
  $("rows").addEventListener("click",e=>{
    const tc=e.target.closest(".tcell");if(tc){openFx(+tc.dataset.fx);return}
    const tr=e.target.closest("tr.row");if(tr)toggleRow(+tr.dataset.i);
  });
  $("svg").addEventListener("click",e=>{const g=e.target.closest("g[data-i]");if(g){sel=+g.dataset.i;render()}});

  /* ---------- Copy ---------- */
  function trussText(t){
    const s=merged(t),r=SP.compute(s),f=(mm,sg)=>SP.fmt(mm,sg,s),name=tName(t);
    if(r.err) return `${name}: ${r.err}`;
    const head=`${name}\nTruss ${s.sections.replace(/\s/g,"")} = ${f(r.L)}, ${r.n} fixtures, gap ${r.n>1?f(r.pos[1]-r.pos[0]):"—"}\nMarks from ${({left:"left end",right:"right end",centre:"centre"})[s.ref]}:`;
    const cm=hasTypes(t)?PW.circuitMap(planOf(t)):null;
    const pw=row=>{if(!cm)return "";const ty=typeOf(t,row.i),c=cm.get(row.i);return ty?`  ${ty.n}${c?" "+c.label:""}`:"  (no type)"};
    const body=r.rows.map((row,k)=>`${k+1}. ${SP.markTxt(row,s)}${showSec?`  (sec ${row.sec} +${f(row.off)})`:""}${pw(row)}${row.near?" NEAR JOIN":""}`).join("\n");
    return head+"\n"+body;
  }
  async function copyText(btn,txt,label){
    try{await navigator.clipboard.writeText(txt);btn.textContent="Copied"}catch(err){btn.textContent="Copy failed"}
    setTimeout(()=>btn.textContent=label,1600);
  }
  $("copy").onclick=()=>{if(truss&&window._r&&!window._r.err)copyText($("copy"),trussText(truss),"Copy list")};
  $("copyRig").onclick=()=>copyText($("copyRig"),`${job.name}\n\n`+job.trusses.map(trussText).join("\n\n")+(anyTypes()?"\n\n"+powerText():""),"Copy rig");
  function powerText(){
    const st=job.settings,tot=plan.total;
    const lines=[`POWER: ${job.name}`,`Circuits up to ${W(plan.limit)} (${st.loadPct}% of ${W(st.circuitW)}), ${st.perSoca} per Socapex`];
    job.trusses.forEach((t,ti)=>{
      if(!hasTypes(t))return;
      const pt=planOf(t);lines.push("",`${tName(t,ti)}: ${W(pt.load)}`);
      pt.socas.forEach(so=>{lines.push(`Socapex ${so.label}`);so.circuits.forEach(c=>lines.push(`  ${c.label}${st.phases?" "+PHASE[c.phase-1]:""}  #${numList(c.fixtures.map(i=>fxNo(t,i)))}  ${typeSummary(t,c.fixtures)}  ${W(c.load)}${c.over?"  OVER LIMIT":""}`))});
    });
    lines.push("",`Total ${W(tot.load)} (${(tot.load/240).toFixed(1)} A at 240 V) on ${tot.circuits} circuits, ${tot.socas} Socapex`);
    if(st.phases)lines.push(PHASE.map((p,k)=>`${p} ${W(tot.phase[k])}`).join(", "));
    if(tot.unknown)lines.push(`${tot.unknown} fixture(s) with no type, counted as 0 W`);
    return lines.join("\n");
  }
  $("copyPower").onclick=()=>copyText($("copyPower"),powerText(),"Copy power");

  /* ---------- Export image ---------- */
  const MODE_NAME={edge:"Set end gaps",equal:"Equal gaps",cells:"Centred",fixed:"Fixed gap"};
  const REF_NAME={left:"left end",right:"right end",centre:"centre"};

  async function buildPng(){
    const r=window._r; if(!r||r.err) return null;
    // canvas text doesn't trigger font loading, so load every face the plot uses first
    try{await Promise.all(["400 30px Barlow","500 30px Barlow","600 30px Barlow","700 30px 'Barlow Condensed'","500 30px 'JetBrains Mono'","700 30px 'JetBrains Mono'"].map(f=>document.fonts.load(f)));await document.fonts.ready}catch(e){}
    const C={bg:"#ffffff",ink:"#16181c",muted:"#666d78",line:"#d8d6cf",band:"#f4f3ef",accent:"#c97f00",warn:"#d13b1c",truss:"#3a3f48"};
    const FD="'Barlow Condensed','Arial Narrow',sans-serif", FB="Barlow,Arial,sans-serif", FM="'JetBrains Mono',monospace";
    const W=2400,P=150,n=r.n,rowH=58,tableTop=960,H=tableTop+70+n*rowH+110;
    const cv=document.createElement("canvas");cv.width=W;cv.height=H;
    const c=cv.getContext("2d");
    const X=p=>P+p*(W-2*P)/r.L;
    const T=(s,x,y,font,col,align="left",base="alphabetic")=>{c.font=font;c.fillStyle=col;c.textAlign=align;c.textBaseline=base;c.fillText(s,x,y)};
    const L=(x1,y1,x2,y2,col,w=2,dash)=>{c.beginPath();c.setLineDash(dash||[]);c.strokeStyle=col;c.lineWidth=w;c.moveTo(x1,y1);c.lineTo(x2,y2);c.stroke();c.setLineDash([])};
    const fit=(s,font,max)=>{c.font=font;if(c.measureText(s).width<=max)return s;while(s.length>1&&c.measureText(s+"…").width>max)s=s.slice(0,-1);return s+"…"};
    c.fillStyle=C.bg;c.fillRect(0,0,W,H);

    // Header: truss name, then job name and date on the right
    const title=fit(tName(truss).toUpperCase(),`700 76px ${FD}`,1300);
    T(title,P,110,`700 76px ${FD}`,C.ink);
    c.font=`700 76px ${FD}`;const tw=c.measureText(title).width;
    const date=new Date().toLocaleDateString("en-AU",{day:"numeric",month:"short",year:"numeric"});
    const rightF=`500 32px ${FB}`;c.font=rightF;
    const jobRoom=W-2*P-tw-80-c.measureText("   ·   "+date).width;
    T((jobRoom>60?fit(job.name,rightF,jobRoom)+"   ·   ":"")+date,W-P,110,rightF,C.muted,"right");
    const gap=n>1?fmt(r.pos[1]-r.pos[0]):"—";
    T(`Truss ${S.sections.replace(/\s/g,"")} = ${fmt(r.L)}   ·   ${n} fixture${n>1?"s":""}   ·   ${MODE_NAME[S.mode]}   ·   Gap ${gap}`,P,165,`500 34px ${FB}`,C.ink);
    T(`Marks measured from the ${REF_NAME[S.ref]}${S.ref==="centre"?" (− left, + right)":""}${S.mode==="edge"?(S.diffEnds?`   ·   End gaps: left ${fmt((+S.inset||0)*UF[S.unit])}, right ${fmt((+S.insetR||0)*UF[S.unit])}`:`   ·   End gap ${fmt((+S.inset||0)*UF[S.unit])}`):""}`,P,212,`400 30px ${FB}`,C.muted);

    // Truss
    const y1=300,y2=360;
    let acc=0;
    r.secs.forEach((s,k)=>{
      const x0=X(acc),x1=X(acc+s),cnt=Math.max(1,Math.round((x1-x0)/40)),w=(x1-x0)/cnt;
      for(let i=0;i<cnt;i++)L(x0+i*w,i%2?y1:y2,x0+(i+1)*w,i%2?y2:y1,C.truss,2.5);
      const lab=`S${S.ref==="right"?r.secs.length-k:k+1}  ${fmt(s)}`;c.font=`500 26px ${FM}`;
      T(c.measureText(lab).width<x1-x0-20?lab:fmt(s),(x0+x1)/2,y1-22,`500 26px ${FM}`,C.muted,"center");
      acc+=s;
    });
    L(X(0),y1,X(r.L),y1,C.truss,7);L(X(0),y2,X(r.L),y2,C.truss,7);
    c.fillStyle=C.truss;[0,...r.joins,r.L].forEach(j=>c.fillRect(X(j)-6,y1-10,12,y2-y1+20));

    // Fixtures
    const sorted=r.rows.slice().sort((a,b)=>a.p-b.p), small=n>30;
    sorted.forEach(row=>{
      const x=X(row.p),col=row.near?C.warn:C.ink;
      L(x,y2,x,y2+20,col,4);
      c.beginPath();c.moveTo(x-14,y2+20);c.lineTo(x+14,y2+20);c.lineTo(x+8,y2+58);c.lineTo(x-8,y2+58);c.closePath();c.fillStyle=col;c.fill();
      const rad=small?15:22;
      c.beginPath();c.arc(x,y2+95,rad,0,Math.PI*2);c.lineWidth=3;c.strokeStyle=col;c.stroke();
      T(String(numMap.get(row.i)),x,y2+96,`600 ${small?18:24}px ${FM}`,col,"center","middle");
    });
    // circuit under each fixture, when there's room
    const cmap=hasTypes(truss)?PW.circuitMap(planOf(truss)):null;
    if(cmap){
      let gapMin=Infinity;for(let i=1;i<sorted.length;i++)gapMin=Math.min(gapMin,X(sorted[i].p)-X(sorted[i-1].p));
      c.font=`600 22px ${FM}`;
      const wMax=Math.max(...sorted.map(row=>{const cc=cmap.get(row.i);return cc?c.measureText(cc.label).width:0}));
      if(wMax+12<gapMin) sorted.forEach(row=>{const cc=cmap.get(row.i);if(cc&&typeOf(truss,row.i))T(cc.label,X(row.p),y2+142,`600 22px ${FM}`,cc.over?C.warn:C.accent,"center","middle")});
    }

    // Chain dimensions (gaps)
    const yc=550, pts=[0,...sorted.map(r=>r.p),r.L];
    L(X(0),yc,X(r.L),yc,C.ink,2);
    pts.forEach(p=>{const x=X(p);L(x,yc-14,x,yc+14,C.ink,2);L(x-9,yc+9,x+9,yc-9,C.ink,3)});
    c.font=`500 26px ${FM}`;
    for(let i=0;i<pts.length-1;i++){
      const a=X(pts[i]),b=X(pts[i+1]),seg=pts[i+1]-pts[i];if(seg<0.5)continue;
      const s=fmt(rnd(seg));if(c.measureText(s).width+14<b-a)T(s,(a+b)/2,yc-16,`500 26px ${FM}`,C.ink,"center");
    }
    T("GAPS",P-20,yc,`600 22px ${FB}`,C.muted,"right","middle");

    // Running marks from reference
    const yr=620, rx=S.ref==="right"?X(r.L):S.ref==="centre"?X(r.L/2):X(0);
    c.beginPath();c.moveTo(rx,yr-30);c.lineTo(rx-14,yr-4);c.lineTo(rx+14,yr-4);c.closePath();c.fillStyle=C.accent;c.fill();
    T("0",S.ref==="right"?rx-22:rx+22,yr-14,`700 30px ${FM}`,C.accent,S.ref==="right"?"right":"left","middle");
    L(rx,y2+4,rx,yr-34,C.accent,2,[8,8]);
    // Mark labels: horizontal when they fit, otherwise slanted just enough that neighbours clear each other
    const fs=small?24:30, mf=`600 ${fs}px ${FM}`, fs2=Math.round(fs*0.78), sf=`500 ${fs2}px ${FM}`;
    const secTxt=row=>`S${row.sec} +${fmt(row.off)}`;
    c.font=mf; let labW=Math.max(...sorted.map(row=>c.measureText(markTxt(row)).width));
    if(showSec){c.font=sf;labW=Math.max(labW,...sorted.map(row=>c.measureText(secTxt(row)).width))}
    const pad=34, blockH=showSec?fs+fs2+8:fs;
    let minSp=Infinity; for(let i=1;i<sorted.length;i++) minSp=Math.min(minSp,X(sorted[i].p)-X(sorted[i-1].p));
    let ang=0;
    if(labW+pad>minSp){
      const need=(blockH+pad*0.6)/minSp;                   // spacing·sin(θ) must clear the label block height
      ang=need>=1?Math.PI/2:Math.max(Math.asin(need),Math.PI/6);
    }
    const ext=labW*Math.cos(ang)/2, vh=(labW*Math.sin(ang)+blockH*Math.cos(ang))/2, cyM=yr+18+vh;
    if(X(sorted[0].p)-ext>P-10) T("MARKS",P-20,yr+40,`600 22px ${FB}`,C.muted,"right","middle");
    sorted.forEach(row=>{
      const x=X(row.p);L(x,yc+16,x,yr+4,C.line,2,[6,6]);
      c.save();c.translate(x,cyM);c.rotate(-ang);
      const off=showSec?-(blockH-fs)/2:0;
      T(markTxt(row),0,off,mf,row.near?C.warn:C.ink,"center","middle");
      if(showSec)T(secTxt(row),0,off+fs/2+8+fs2/2,sf,C.muted,"center","middle");
      c.restore();
    });

    // Overall
    const yo=880;
    L(X(0),yo,X(r.L),yo,C.ink,2);
    [[X(0),1],[X(r.L),-1]].forEach(([x,d])=>{c.beginPath();c.moveTo(x,yo);c.lineTo(x+d*24,yo-10);c.lineTo(x+d*24,yo+10);c.closePath();c.fillStyle=C.ink;c.fill();L(x,yo-24,x,yo+24,C.ink,2)});
    const ov=`${fmt(r.L)} overall`;c.font=`600 30px ${FM}`;const ow=c.measureText(ov).width+30;
    c.fillStyle=C.bg;c.fillRect(W/2-ow/2,yo-22,ow,44);T(ov,W/2,yo,`600 30px ${FM}`,C.ink,"center","middle");

    // Table
    const pw=!!cmap;
    const cols=showSec
      ?[[P,"#","left"],[P+330,`FROM ${REF_NAME[S.ref].toUpperCase()}`,"right"],[P+560,"SECTION","right"],[P+900,"IN SECTION","right"],[P+1240,"GAP","right"],[pw?P+1800:P+1300,"","left"],pw?[P+1290,"TYPE","left"]:null,pw?[P+1640,"CIRCUIT","left"]:null]
      :[[P,"#","left"],[P+330,`FROM ${REF_NAME[S.ref].toUpperCase()}`,"right"],null,null,[P+640,"GAP","right"],[pw?P+1500:P+700,"","left"],pw?[P+700,"TYPE","left"]:null,pw?[P+1300,"CIRCUIT","left"]:null];
    const th=tableTop+30;
    cols.forEach(col=>col&&T(col[1],col[0],th,`600 24px ${FB}`,C.muted,col[2]));
    L(P,th+18,W-P,th+18,C.line,2);
    r.rows.forEach((row,k)=>{
      const y=th+18+k*rowH;
      if(k%2){c.fillStyle=C.band;c.fillRect(P,y,W-2*P,rowH)}
      const cy=y+rowH/2+2,f=`500 30px ${FM}`;
      T(String(k+1),cols[0][0]+8,cy,`600 30px ${FM}`,C.ink,"left","middle");
      T(markTxt(row),cols[1][0],cy,`700 32px ${FM}`,row.near?C.warn:C.ink,"right","middle");
      if(showSec){T(String(row.sec),cols[2][0],cy,f,C.ink,"right","middle");T(fmt(row.off),cols[3][0],cy,f,C.ink,"right","middle")}
      T(row.gap!=null?fmt(rnd(row.gap)):"—",cols[4][0],cy,f,C.ink,"right","middle");
      if(pw){
        const ty=typeOf(truss,row.i),cc=cmap.get(row.i);
        T(ty?fit(FX.label(ty),`500 28px ${FB}`,(showSec?330:580)):"No type",cols[6][0],cy,`500 28px ${FB}`,ty?C.ink:C.warn,"left","middle");
        if(ty&&cc)T(cc.label,cols[7][0],cy,`700 30px ${FM}`,cc.over?C.warn:C.ink,"left","middle");
      }
      if(row.near)T(showSec&&pw?"NEAR JOIN":"NEAR SECTION JOIN",cols[5][0],cy,`600 24px ${FB}`,C.warn,"left","middle");
    });
    const fy=th+18+n*rowH+60;
    T(`Rounded to ${S.round?$("round").selectedOptions[0].textContent:"exact values"}.${showSec?`  "In section" is measured from the ${S.ref==="right"?"right":"left"} end of each section; sections numbered from the ${S.ref==="right"?"right":"left"}.`:""}`,P,fy,`400 26px ${FB}`,C.muted);
    return await new Promise(res=>cv.toBlob(res,"image/png"));
  }

  /* ---------- Saving and sharing files ---------- */
  let dl=null, dlTried=false;
  async function getDownloads(){if(!dlTried){dlTried=true;try{dl=await window.claude?.use?.("downloads")}catch(e){dl=null}}return dl}
  getDownloads();
  function canShare(file){try{return !!(navigator.canShare&&navigator.share&&navigator.canShare({files:[file]}))}catch(e){return false}}
  // Plain browser download: works in Chrome on Android and desktop
  function anchorSave(blob,name){
    const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=name;a.rel="noopener";
    document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);
  }
  // Returns a message for the hint line
  async function saveBlob(blob,name){
    const d=await getDownloads();
    if(d){ // inside claude.ai the artifact runtime handles saving
      try{await d.save({filename:name,data:blob});return "Saved."}
      catch(e){
        if(e&&e.code==="declined")return "Not saved. Tap Save to try again.";
        if(e&&e.code==="rate_limited")return "A save prompt is already open. Finish that one first.";
      }
    }
    try{anchorSave(blob,name);return "Saved to your Downloads."}catch(e){return null}
  }

  /* ---------- Export overlay ---------- */
  let pngBlob=null, pngUrl=null, png={name:"",title:"",text:""};
  const pngName=()=>png.name;
  const pngFile=()=>new File([pngBlob],pngName(),{type:"image/png"});
  function showPng(blob,meta){
    pngBlob=blob;png=meta;if(!blob)return;
    if(pngUrl)URL.revokeObjectURL(pngUrl);pngUrl=URL.createObjectURL(blob);
    $("sheetImg").src=pngUrl;$("sheetTitle").textContent=meta.heading;
    const share=canShare(pngFile());
    $("shareBtn").hidden=!share;
    $("sheetHint").textContent=share?"Save the PNG, or share it straight to the crew.":"Saves a PNG you can send to the crew or print.";
    $("sheet").hidden=false;$("sheetClose").focus();
  }
  $("exportBtn").onclick=async()=>{
    const btn=$("exportBtn");btn.textContent="Drawing…";
    const blob=await buildPng();btn.textContent="Export image";
    if(!blob)return;
    const r=window._r;
    showPng(blob,{heading:"Plot image",name:`truss-plot-${slug(tName(truss))}-${S.sections.replace(/[^\dx.]+/gi,"-").replace(/^-|-$/g,"")}-${r.n}fx.png`,
      title:tName(truss),text:`${tName(truss)}: truss ${S.sections.replace(/\s/g,"")} = ${fmt(r.L)}, ${r.n} fixtures`});
  };
  $("exportPower").onclick=async()=>{
    const btn=$("exportPower");btn.textContent="Drawing…";
    const blob=await buildPowerPng();btn.textContent="Export sheet";
    showPng(blob,{heading:"Power sheet",name:`power-${slug(job.name)||"job"}.png`,title:`Power: ${job.name}`,text:`Power for ${job.name}: ${W(plan.total.load)} on ${plan.total.circuits} circuits, ${plan.total.socas} Socapex`});
  };

  async function buildPowerPng(){
    if(!anyTypes())return null;
    try{await Promise.all(["400 30px Barlow","500 30px Barlow","600 30px Barlow","700 30px 'Barlow Condensed'","500 30px 'JetBrains Mono'","700 30px 'JetBrains Mono'"].map(f=>document.fonts.load(f)))}catch(e){}
    const C={bg:"#ffffff",ink:"#16181c",muted:"#666d78",line:"#d8d6cf",band:"#f4f3ef",accent:"#c97f00",warn:"#d13b1c",ok:"#1f8a4f"};
    const FD="'Barlow Condensed','Arial Narrow',sans-serif", FB="Barlow,Arial,sans-serif", FM="'JetBrains Mono',monospace";
    const st=job.settings,tot=plan.total,Wd=2400,P=120,rowH=60,headH=96,socaH=48;
    const list=job.trusses.filter(hasTypes);
    let H=330+(st.phases?60:0);
    list.forEach(t=>{const pt=planOf(t);H+=headH+pt.socas.length*socaH+pt.socas.reduce((a,so)=>a+so.circuits.length,0)*rowH+40});
    H+=90;
    const cv=document.createElement("canvas");cv.width=Wd;cv.height=H;const c=cv.getContext("2d");
    const T=(s,x,y,font,col,align="left",base="alphabetic")=>{c.font=font;c.fillStyle=col;c.textAlign=align;c.textBaseline=base;c.fillText(s,x,y)};
    const fit=(s,font,max)=>{c.font=font;if(c.measureText(s).width<=max)return s;while(s.length>1&&c.measureText(s+"…").width>max)s=s.slice(0,-1);return s+"…"};
    c.fillStyle=C.bg;c.fillRect(0,0,Wd,H);
    T("POWER",P,110,`700 76px ${FD}`,C.ink);
    c.font=`700 76px ${FD}`;const tw=c.measureText("POWER").width;
    const date=new Date().toLocaleDateString("en-AU",{day:"numeric",month:"short",year:"numeric"});
    T(fit(job.name,`600 44px ${FB}`,Wd-2*P-tw-420)+"",P+tw+40,108,`600 44px ${FB}`,C.ink);
    T(date,Wd-P,108,`500 32px ${FB}`,C.muted,"right");
    T(`Total ${W(tot.load)} (${(tot.load/240).toFixed(1)} A at 240 V)   ·   ${tot.circuits} circuits   ·   ${tot.socas} Socapex`,P,172,`600 36px ${FB}`,C.ink);
    T(`Circuits loaded to ${W(plan.limit)} (${st.loadPct}% of ${W(st.circuitW)}), ${st.perSoca} per Socapex, one Socapex run per truss.${tot.unknown?`  ${tot.unknown} fixture(s) with no type counted as 0 W.`:""}`,P,222,`400 28px ${FB}`,tot.unknown?C.warn:C.muted);
    let y=270;
    if(st.phases){T(PHASE.map((p,k)=>`${p}  ${W(tot.phase[k])}`).join("      "),P,y+10,`600 32px ${FM}`,C.ink);y+=60}
    const X={circ:P+20,phase:P+230,fx:st.phases?P+400:P+260,load:Wd-P-360,bar:Wd-P-320,pct:Wd-P};
    const barW=220;
    list.forEach(t=>{
      const pt=planOf(t);y+=20;
      c.fillStyle=C.ink;c.fillRect(P,y,Wd-2*P,headH-24);
      T(fit(tName(t).toUpperCase(),`700 46px ${FD}`,1300),P+20,y+(headH-24)/2+2,`700 46px ${FD}`,"#ffffff","left","middle");
      T(`${W(pt.load)}   ·   ${nOf(t)} fixtures`,Wd-P-20,y+(headH-24)/2+2,`600 30px ${FM}`,"#ffffff","right","middle");
      y+=headH-24+4;
      pt.socas.forEach(so=>{
        T(`SOCAPEX ${so.label}`,P+20,y+socaH/2+4,`600 24px ${FB}`,C.muted,"left","middle");
        y+=socaH;
        so.circuits.forEach((cc,k)=>{
          if(k%2){c.fillStyle=C.band;c.fillRect(P,y,Wd-2*P,rowH)}
          const cy=y+rowH/2+2,col=cc.over?C.warn:C.ink;
          T(cc.label,X.circ,cy,`700 34px ${FM}`,col,"left","middle");
          if(st.phases)T(PHASE[cc.phase-1],X.phase,cy,`600 30px ${FM}`,col,"left","middle");
          const fxTxt=`#${numList(cc.fixtures.map(i=>fxNo(t,i)))}   ${typeSummary(t,cc.fixtures,true)}`;
          T(fit(fxTxt,`500 30px ${FB}`,X.load-X.fx-260),X.fx,cy,`500 30px ${FB}`,col,"left","middle");
          T(W(cc.load),X.load,cy,`600 30px ${FM}`,col,"right","middle");
          const pct=cc.load/plan.limit;
          c.fillStyle=C.line;c.fillRect(X.bar,cy-6,barW,12);
          c.fillStyle=cc.over?C.warn:pct>0.9?C.accent:C.ok;c.fillRect(X.bar,cy-6,barW*Math.min(1,pct),12);
          T(`${Math.round(pct*100)}%`,X.pct,cy,`500 28px ${FM}`,col,"right","middle");
          y+=rowH;
        });
      });
      y+=20;
    });
    T("Fixture numbers match each truss's marks list. Loads use each fixture type's maximum power from the spec sheet; check anything marked as your own entry.",P,H-50,`400 26px ${FB}`,C.muted);
    return await new Promise(res=>cv.toBlob(res,"image/png"));
  }
  $("sheetClose").onclick=()=>{$("sheet").hidden=true};
  $("sheet").addEventListener("click",e=>{if(e.target.id==="sheet")$("sheet").hidden=true});
  $("saveBtn").onclick=async()=>{
    if(!pngBlob)return;
    $("sheetHint").textContent=await saveBlob(pngBlob,pngName())||"Couldn't save here. Press and hold the image to save it.";
  };
  $("shareBtn").onclick=async()=>{
    if(!pngBlob)return;
    const r=window._r;
    try{
      await navigator.share({files:[pngFile()],title:png.title,text:png.text});
      $("sheetHint").textContent="Shared.";
    }catch(e){
      if(e&&e.name==="AbortError")return; // user closed the share sheet
      $("sheetHint").textContent="Sharing didn't work. Save the PNG and send it from your gallery instead.";
    }
  };

  /* ---------- Jobs ---------- */
  const dateTxt=t=>new Date(t).toLocaleDateString("en-AU",{day:"numeric",month:"short",year:"numeric"});
  function renderJobs(){
    $("jobName").value=job.name;
    $("delJob").disabled=Object.keys(store.jobs).length<2;
    $("jobList").innerHTML=Object.values(store.jobs).sort((a,b)=>b.updated-a.updated).map(j=>
      `<button type="button" class="jobitem" data-j="${j.id}"${j.id===job.id?' aria-current="true"':""}>
        <b>${esc(j.name)}</b><small>${j.trusses.length} truss${j.trusses.length>1?"es":""} · ${j.trusses.reduce((a,t)=>a+(+t.count||0),0)} fixtures · ${dateTxt(j.updated)}</small></button>`).join("");
  }
  function openJob(j,hint){
    store.jobs[j.id]=j;job=j;store.current=j.id;
    S={};openView(j.view);renderJobs();
    $("jobsHint").textContent=hint||"";
  }
  $("jobBtn").onclick=()=>{renderJobs();$("jobsHint").textContent="";$("jobsSheet").hidden=false;$("jobsClose").focus()};
  $("jobsClose").onclick=()=>{$("jobsSheet").hidden=true};
  $("jobsSheet").addEventListener("click",e=>{if(e.target.id==="jobsSheet")$("jobsSheet").hidden=true});
  // Update the name in place: re-rendering the list here would swallow a tap that lands on it as the field blurs
  $("jobName").addEventListener("input",e=>{
    job.name=e.target.value.slice(0,80)||"Untitled job";save();renderTabs();
    const cur=$("jobList").querySelector('[aria-current="true"] b');if(cur)cur.textContent=job.name;
  });
  $("jobList").addEventListener("click",e=>{
    const b=e.target.closest(".jobitem");if(!b||b.dataset.j===job.id)return;
    openJob(store.jobs[b.dataset.j]);$("jobsSheet").hidden=true;
  });
  $("newJob").onclick=()=>{openJob(ST.newJob("New job",job.settings),"New job started. Give it a name above.");$("jobName").focus();$("jobName").select()};
  $("dupJob").onclick=()=>{
    const j=ST.fromFile(ST.toFile(job));j.name=`${job.name} copy`;
    openJob(j,`Made a copy: ${j.name}.`);
  };
  $("delJob").onclick=()=>{
    if(Object.keys(store.jobs).length<2)return;
    if(!confirm(`Delete the job "${job.name}"? This can't be undone.`))return;
    delete store.jobs[job.id];
    openJob(Object.values(store.jobs).sort((a,b)=>b.updated-a.updated)[0],"Job deleted.");
  };
  function jobFile(){
    const base=slug(job.name)||"job", text=ST.toFile(job);
    const f=new File([text],`${base}.truss.json`,{type:"application/json"});
    if(canShare(f))return f;
    // Android's share sheet won't take .json files, so fall back to plain text (it opens the same way)
    return new File([text],`${base}.truss.txt`,{type:"text/plain"});
  }
  $("saveJob").onclick=async()=>{
    const text=ST.toFile(job);
    $("jobsHint").textContent=await saveBlob(new Blob([text],{type:"application/json"}),`${slug(job.name)||"job"}.truss.json`)||"Couldn't save the file here.";
  };
  $("shareJob").onclick=async()=>{
    const f=jobFile();
    if(!canShare(f)){$("jobsHint").textContent="Sharing files isn't available here. Use Save file instead.";return}
    try{await navigator.share({files:[f],title:job.name,text:`Truss Spacer job: ${job.name}`});$("jobsHint").textContent="Shared."}
    catch(e){if(!(e&&e.name==="AbortError"))$("jobsHint").textContent="Sharing didn't work. Use Save file instead."}
  };
  $("openJob").addEventListener("change",async e=>{
    const file=e.target.files&&e.target.files[0];e.target.value="";if(!file)return;
    try{
      if(file.size>2e6)throw new Error("That file is too big to be a Truss Spacer job.");
      const j=ST.fromFile(await file.text());
      if(Object.values(store.jobs).some(x=>x.name===j.name))j.name+=" (opened)";
      openJob(j,`Opened ${j.name}.`);
    }catch(err){$("jobsHint").textContent=err.message||"Couldn't open that file."}
  });

  /* ---------- Keep screen on ---------- */
  let lock=null;
  $("wake").onclick=async()=>{
    const b=$("wake");
    if(lock){try{await lock.release()}catch(e){}lock=null;b.setAttribute("aria-pressed","false");b.textContent="Keep screen on";return}
    try{lock=await navigator.wakeLock.request("screen");b.setAttribute("aria-pressed","true");b.textContent="Screen stays on";
      lock.addEventListener("release",()=>{lock=null;b.setAttribute("aria-pressed","false");b.textContent="Keep screen on"})}
    catch(e){b.textContent="Not available here";setTimeout(()=>b.textContent="Keep screen on",1800)}
  };

  openView(job.view);
  $("shareJob").hidden=!canShare(new File(["x"],"x.txt",{type:"text/plain"}));

  // Offline support: only when served over http(s), not when opened as a local file
  if("serviceWorker" in navigator&&/^https?:$/.test(location.protocol)){
    window.addEventListener("load",()=>{navigator.serviceWorker.register("sw.js").catch(()=>{})});
  }
})();
