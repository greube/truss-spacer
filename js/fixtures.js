/* Truss Spacer: fixture types. Searches the bundled database (js/fixtures-data.js) plus
   "my fixtures" the user adds on this phone (localStorage["trussSpacerMyFixtures"]).
   A type is {key, m, n, w, src, url}: manufacturer, model, max watts, source. */
(function(root){
  "use strict";
  const KEY="trussSpacerMyFixtures";
  const SRC={s:"Spec sheet",l:"Rated",o:"Open Fixture Library",m:"My fixture",j:"This job"};
  const norm=s=>String(s).toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g," ").trim();

  let db=null;
  function base(){
    if(!db) db=(root.TS&&root.TS.FIXTURES||[]).map(r=>({key:r[0],m:r[1],n:r[2],w:r[3],src:r[4],url:r[5]||"",
      hay:" "+norm(r[1]+" "+r[2])+" ",hayN:" "+norm(r[2])+" "}));
    return db;
  }

  function mine(){
    try{const a=JSON.parse(localStorage.getItem(KEY)||"[]");return Array.isArray(a)?a.filter(x=>x&&x.key&&x.n&&x.w>0):[]}catch(e){return []}
  }
  function saveMine(a){try{localStorage.setItem(KEY,JSON.stringify(a));return true}catch(e){return false}}
  function addMine(m,n,w){
    const t={key:"my:"+Date.now().toString(36)+Math.random().toString(36).slice(2,6),m:String(m||"").trim().slice(0,60),n:String(n).trim().slice(0,80),w:Math.round(+w),src:"m",url:""};
    const a=mine();a.unshift(t);saveMine(a.slice(0,500));return t;
  }
  function removeMine(key){saveMine(mine().filter(x=>x.key!==key))}

  // All query words must appear; model-name matches and curated spec sheets rank first
  function search(q,limit){
    const words=norm(q).split(" ").filter(Boolean);
    if(!words.length) return [];
    const pool=mine().map(t=>Object.assign({},t,{hay:" "+norm(t.m+" "+t.n)+" ",hayN:" "+norm(t.n)+" "})).concat(base());
    const out=[];
    for(const t of pool){
      if(!words.every(w=>t.hay.includes(w))) continue;
      let score=0;
      for(const w of words){
        if(t.hayN.includes(" "+w+" "))score+=6;else if(t.hayN.includes(" "+w))score+=4;else if(t.hayN.includes(w))score+=2;
        if(t.hay.startsWith(" "+w))score+=1;
      }
      score+=t.src==="m"?5:t.src==="s"||t.src==="l"?3:0;
      score-=t.n.length/40;
      out.push([score,t]);
    }
    out.sort((a,b)=>b[0]-a[0]);
    return out.slice(0,limit||40).map(x=>x[1]);
  }

  const label=t=>t?((t.m&&t.m!=="Generic"?t.m+" ":"")+t.n):"";
  const snapshot=t=>({m:t.m||"",n:t.n,w:t.w,src:t.src,url:t.url||""});

  const api={search,mine,addMine,removeMine,label,snapshot,SRC,count:()=>base().length};
  root.TS=root.TS||{}; root.TS.fixtures=api;
  if(typeof module!=="undefined") module.exports=api;
})(typeof window!=="undefined"?window:globalThis);
