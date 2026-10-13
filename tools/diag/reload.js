const fs=require('fs');
const G='E:/noname-port/iosport/payload/game/';
const hits=[];
(function walk(p,d){ if(d>4) return; let e; try{e=fs.readdirSync(p,{withFileTypes:true});}catch(x){return;}
 for(const f of e){ const fp=p+f.name;
   if(f.isDirectory()){ if(/^(image|audio|font|node_modules)$/.test(f.name)) continue; walk(fp+'/',d+1); continue; }
   if(!f.name.endsWith('.js')) continue;
   let s; try{ if(fs.statSync(fp).size>4e6) continue; s=fs.readFileSync(fp,'utf8'); }catch(x){ continue; }
   if(/location\.reload|game\.reload|location\.href\s*=\s*(location|\w*init)/.test(s)){
     s.split('\n').forEach((l,i)=>{ if(/location\.reload|game\.reload/.test(l)) hits.push('  ['+fp.replace(G,'')+':'+(i+1)+'] '+l.trim().slice(0,150)); });
   }
 }})(G,0);
console.log('=== 触发重新加载的位置 ===');
hits.forEach(h=>console.log(h));
console.log('  共 '+hits.length+' 条');