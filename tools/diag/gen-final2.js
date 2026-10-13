const fs=require('fs');
const SRC='C:/Users/ASUS/AppData/Local/Temp/【手杀懒人包 - 数据 - 抖音诗筏】【手杀懒人包 - 数据 - 抖音诗筏】';
const IPAD='C:/Users/ASUS/Documents/Default Project/noname/extension';
const OUT='C:/Users/ASUS/Downloads/懒人包配置-最终版2.txt';

const present=new Set(fs.readdirSync(IPAD,{withFileTypes:true}).filter(d=>d.isDirectory()).map(d=>d.name));
const data=JSON.parse(Buffer.from(fs.readFileSync(SRC,'latin1').replace(/\s+/g,''),'base64').toString('utf8'));
const c=data.config;

console.log('修改前：');
console.log('  extensions: '+JSON.stringify(c.extensions));
console.log('  plays     : '+JSON.stringify(c.plays));

// 1) extensions 只留实际存在的
c.extensions=c.extensions.filter(e=>present.has(e));
// 2) plays：这里是"纯扩展名"，必须一起过滤（上一版漏了）
if(Array.isArray(c.plays)) c.plays=c.plays.filter(n=>present.has(n));
// 3) characters/cards/plays 里的 mode_extension_XXX
for(const k of ['characters','cards']){
  if(Array.isArray(c[k])) c[k]=c[k].filter(n=>{ const m=/^mode_extension_(.+)$/.exec(String(n)); return !(m&&!present.has(m[1])); });
}
fs.writeFileSync(OUT, Buffer.from(JSON.stringify(data),'utf8').toString('base64'),'ascii');

console.log('');
console.log('修改后：');
console.log('  extensions ('+c.extensions.length+'): '+c.extensions.join('、'));
console.log('  plays     : '+JSON.stringify(c.plays));
console.log('  mode      : '+JSON.stringify(c.mode));
console.log('  cards     : '+JSON.stringify(c.cards));
console.log('');
console.log('输出: '+OUT+'   ('+fs.statSync(OUT).size.toLocaleString()+' 字节)');

// 顺带检查 cards 里的项对应文件/扩展是否存在
console.log('');
console.log('=== cards 里每一项的来源 ===');
for(const n of (c.cards||[])){
  const f1='E:/noname-port/iosport/payload/game/card/'+n+'.js';
  const f2='E:/noname-port/iosport/payload/game/extension/'+n;
  console.log('  '+n.padEnd(16)+' card/'+n+'.js:'+(fs.existsSync(f1)?'有':'无')+'   同名扩展目录:'+(fs.existsSync(f2)?'有':'无'));
}