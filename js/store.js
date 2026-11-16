/* Truss Spacer: jobs and trusses, saved on the phone.
   localStorage["trussSpacerJobs"] = {current, jobs:{id: job}}
   job   = {id, name, updated, settings:{unit, round, joinWarn}, trusses:[truss], view: trussId | "rig"}
   truss = {id, name, sections, count, mode, inset, insetR, diffEnds, spacing, ref}
   Lengths in a job are stored in that job's unit, as typed (same as v1).
   On first run, v1's single setup (localStorage["trussSpacer"]) becomes the first job. The v1 key is left alone. */
(function(root){
  "use strict";
  const KEY="trussSpacerJobs", V1_KEY="trussSpacer";
  const MODES=["edge","equal","cells","fixed"], REFS=["left","centre","right"], UNITS=["m","mm","ft"];
  const SETTINGS_DEFAULT={unit:"m",round:5,joinWarn:100};
  const TRUSS_DEFAULT={name:"",sections:"3+3+2",count:6,mode:"edge",inset:0.25,insetR:0.25,diffEnds:false,spacing:1.2,ref:"left"};
  // Sensible starting lengths for a new truss in each unit
  const UNIT_DEFAULT={m:{sections:"3+3+2",inset:0.25,insetR:0.25,spacing:1.2},
                      mm:{sections:"3000+3000+2000",inset:250,insetR:250,spacing:1200},
                      ft:{sections:"10+10+8",inset:1,insetR:1,spacing:4}};
  const TRUSS_KEYS=Object.keys(TRUSS_DEFAULT), SETTING_KEYS=Object.keys(SETTINGS_DEFAULT);

  const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,8);
  const isNum=v=>v!==""&&v!==null&&isFinite(+v);

  function cleanSettings(s){
    s=s&&typeof s==="object"?s:{};
    return {unit:UNITS.includes(s.unit)?s.unit:"m",round:isNum(s.round)?+s.round:5,joinWarn:isNum(s.joinWarn)?s.joinWarn:100};
  }
  function cleanTruss(t,unit){
    t=t&&typeof t==="object"?t:{};
    const d=Object.assign({},TRUSS_DEFAULT,UNIT_DEFAULT[unit]||UNIT_DEFAULT.m);
    const o={id:typeof t.id==="string"&&t.id?t.id:uid()};
    o.name=typeof t.name==="string"?t.name.slice(0,60):"";
    o.sections=typeof t.sections==="string"?t.sections.slice(0,200):d.sections;
    o.count=isNum(t.count)?Math.max(1,Math.min(99,Math.round(+t.count))):d.count;
    o.mode=MODES.includes(t.mode)?t.mode:d.mode;
    o.ref=REFS.includes(t.ref)?t.ref:d.ref;
    o.diffEnds=!!t.diffEnds;
    // kept as typed (string or number), like v1, so a half-typed "0." survives a reload
    for(const k of ["inset","insetR","spacing"]) o[k]=(typeof t[k]==="string"&&t[k].length<20)||typeof t[k]==="number"?t[k]:d[k];
    return o;
  }
  function cleanJob(j){
    j=j&&typeof j==="object"?j:{};
    const settings=cleanSettings(j.settings);
    const trusses=(Array.isArray(j.trusses)?j.trusses:[]).slice(0,200).map(t=>cleanTruss(t,settings.unit));
    if(!trusses.length) trusses.push(cleanTruss({name:"Truss 1"},settings.unit));
    const view=j.view==="rig"||trusses.some(t=>t.id===j.view)?j.view:trusses[0].id;
    return {id:typeof j.id==="string"&&j.id?j.id:uid(),name:typeof j.name==="string"&&j.name.trim()?j.name.slice(0,80):"Untitled job",
            updated:isNum(j.updated)?+j.updated:Date.now(),settings,trusses,view};
  }

  function newTruss(unit,over){return cleanTruss(Object.assign({},UNIT_DEFAULT[unit]||UNIT_DEFAULT.m,over||{},{id:uid()}),unit)}
  function newJob(name,settings){
    const s=cleanSettings(settings), t=newTruss(s.unit,{name:"Truss 1"});
    return {id:uid(),name:name||"New job",updated:Date.now(),settings:s,trusses:[t],view:t.id};
  }

  function fromV1(){
    let old={}; try{old=JSON.parse(localStorage.getItem(V1_KEY)||"{}")||{}}catch(e){}
    const j=newJob("My rig",old);
    j.trusses[0]=cleanTruss(Object.assign({},old,{id:j.trusses[0].id,name:"Truss 1"}),j.settings.unit);
    j.view=j.trusses[0].id;
    return j;
  }

  function load(){
    let st=null; try{st=JSON.parse(localStorage.getItem(KEY)||"null")}catch(e){}
    const jobs={};
    if(st&&st.jobs&&typeof st.jobs==="object") for(const k of Object.keys(st.jobs)){const j=cleanJob(st.jobs[k]);jobs[j.id]=j}
    if(!Object.keys(jobs).length){const j=fromV1();jobs[j.id]=j}
    const current=st&&jobs[st.current]?st.current:Object.values(jobs).sort((a,b)=>b.updated-a.updated)[0].id;
    return {current,jobs};
  }
  function save(st){try{localStorage.setItem(KEY,JSON.stringify(st));return true}catch(e){return false}}

  // Job files for sharing with crew or moving to another phone
  function toFile(job){return JSON.stringify({app:"truss-spacer",format:1,exported:new Date().toISOString(),job},null,1)}
  function fromFile(text){
    let d; try{d=JSON.parse(text)}catch(e){throw new Error("That file isn't a Truss Spacer job.")}
    if(!d||d.app!=="truss-spacer"||!d.job) throw new Error("That file isn't a Truss Spacer job.");
    if(d.format>1) throw new Error("That job was saved by a newer version. Update the app and try again.");
    const j=cleanJob(d.job);
    // fresh ids so an imported copy never overwrites a job already on this phone
    const ids={}; j.id=uid(); j.trusses.forEach(t=>{const n=uid();ids[t.id]=n;t.id=n});
    j.view=j.view==="rig"?"rig":ids[j.view]||j.trusses[0].id; j.updated=Date.now();
    return j;
  }

  const api={SETTING_KEYS,TRUSS_KEYS,uid,newTruss,newJob,cleanJob,load,save,toFile,fromFile};
  root.TS=root.TS||{}; root.TS.store=api;
  if(typeof module!=="undefined") module.exports=api;
})(typeof window!=="undefined"?window:globalThis);
