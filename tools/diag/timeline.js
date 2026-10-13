const fs=require('fs');
const L=fs.readFileSync('C:/Users/ASUS/AppData/Local/Temp/noname-debug.log','utf8').split(/\r?\n/);
const boots=[];
L.forEach((l,i)=>{ if(/noname-shim.*ready/.test(l)) boots.push(i); });
console.log('共 '+boots.length+' 次启动');
console.log('');

// 每个启动区间内：报错种类 + 是否有对局（PixiJS / 对局迹象）
function t(l){ const m=/^\[(\d\d:\d\d:\d\d)/.exec(l||''); return m?m[1]:''; }
boots.forEach((b,idx)=>{
  const e = (idx+1<boots.length)? boots[idx+1] : L.length;
  const errs={};
  let pixi=0;
  for(let i=b;i<e;i++){
    const l=L[i];
    if(/\[error\]|\[window\.onerror\]|\[unhandledrejection\]/.test(l)){
      let s=l.replace(/^\[\d\d:\d\d:\d\d\.\d+\]\s*/,'').replace(/\d+/g,'N').slice(0,70);
      errs[s]=(errs[s]||0)+1;
    }
    if(/PixiJS/.test(l)) pixi++;
  }
  const keys=Object.keys(errs);
  const total=keys.reduce((a,k)=>a+errs[k],0);
  console.log('启动@'+t(L[b])+'  ('+(e-b)+'行, 对局迹象:'+pixi+')  报错 '+total+' 条');
  keys.forEach(k=>console.log('      x'+errs[k]+'  '+k));
});

console.log('');
console.log('=== 23:20 之后的所有报错行 ===');
let n=0;
L.forEach(l=>{ if(/\[error\]|\[window\.onerror\]|\[unhandledrejection\]/.test(l) && /^\[23:(2[0-9]|[3-5][0-9])/.test(l)){ console.log('   '+l.trim().slice(0,140)); n++; } });
if(!n) console.log('    （没有）');