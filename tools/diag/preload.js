const fs=require('fs');
const D='E:/noname-port/iosport/payload/game/extension/十周年UI/';
console.log('=== 谁在消费 dcdanimation_list ===');
for(const f of fs.readdirSync(D)){
  if(!f.endsWith('.js')) continue;
  fs.readFileSync(D+f,'utf8').split('\n').forEach((l,i)=>{
    if(l.includes('dcdanimation_list')) console.log('  ['+f+':'+(i+1)+'] '+l.trim().slice(0,150));
  });
}
console.log('');
// 估算列表里各资源的贴图大小
const list=['SS_ShiWeiYanSkill','SS_SWY_yinzhan','SS_SWY_tongchang','SS_ShiWeiyanFaDongSkill','effect_youxikaishi_shousha','effect_baguazhen','effect_baiyinshizi','effect_cixiongshuanggujian','effect_fangtianhuaji','effect_guanshifu','effect_gudingdao','effect_hanbingjian','effect_qilingong','effect_qinggangjian','effect_qinglongyanyuedao','effect_renwangdun','effect_shoujidonghua','effect_tengjiafangyu','effect_tengjiaranshao','effect_zhangbashemao','skeleton','effect_zhugeliannu','effect_zhuqueyushan','effect_jinhe','effect_numa','effect_nvzhuang','effect_wufengjian','effect_yajiaoqiang','effect_yinfengjia','effect_zheji','skeletonxHp','maxskeleton','effect_lebusishu','lianzhao_jindu','lianzhao_zuowei','weizhangliao_jineng','SS_taishici_jineng','effect_bingliangcunduan','effect_shandian','SS_PaiJu_xunishanghai','tiesuolianhuan','tiesuolianhuan2','effect_panding','gaipan','kapaizhuanhuan','numchange'];
const A=D+'assets/animation/';
let total=0, found=0, miss=[];
for(const n of list){
  const pngs=fs.readdirSync(A).filter(x=>x.toLowerCase().startsWith(n.toLowerCase()) && x.toLowerCase().endsWith('.png'));
  if(!pngs.length){ miss.push(n); continue; }
  found++;
  pngs.forEach(p=>{ total+=fs.statSync(A+p).size; });
}
console.log('=== 预加载列表统计 ===');
console.log('  条目数: '+list.length+'   找到贴图: '+found+'   找不到: '+miss.length);
if(miss.length) console.log('  找不到贴图的: '+miss.join(', '));
console.log('  贴图文件合计: '+(total/1048576).toFixed(1)+' MB（这是压缩后的大小）');
console.log('  ⚠️ 解码后按 宽×高×4 字节算，通常是文件大小的 3~8 倍');