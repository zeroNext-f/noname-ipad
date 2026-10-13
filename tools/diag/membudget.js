const fs=require('fs');
const A='E:/noname-port/iosport/payload/game/extension/十周年UI/assets/animation/';
const list=['SS_ShiWeiYanSkill','SS_SWY_yinzhan','SS_SWY_tongchang','SS_ShiWeiyanFaDongSkill','effect_youxikaishi_shousha','effect_baguazhen','effect_baiyinshizi','effect_cixiongshuanggujian','effect_fangtianhuaji','effect_guanshifu','effect_gudingdao','effect_hanbingjian','effect_qilingong','effect_qinggangjian','effect_qinglongyanyuedao','effect_renwangdun','effect_shoujidonghua','effect_tengjiafangyu','effect_tengjiaranshao','effect_zhangbashemao','skeleton','effect_zhugeliannu','effect_zhuqueyushan','effect_jinhe','effect_numa','effect_nvzhuang','effect_wufengjian','effect_yajiaoqiang','effect_yinfengjia','effect_zheji','skeletonxHp','maxskeleton','effect_lebusishu','lianzhao_jindu','lianzhao_zuowei','weizhangliao_jineng','SS_taishici_jineng','effect_bingliangcunduan','effect_shandian','SS_PaiJu_xunishanghai','tiesuolianhuan','tiesuolianhuan2','effect_panding','gaipan','kapaizhuanhuan','numchange'];

let totalPx=0, nAtlas=0, rows=[];
for(const n of list){
  const f=A+n+'.atlas';
  if(!fs.existsSync(f)){ rows.push([n,'(无atlas)','']); continue; }
  const t=fs.readFileSync(f,'utf8').split('\n');
  let dec=0;
  t.forEach(l=>{
    const m=/^size:\s*(\d+)\s*,\s*(\d+)/.exec(l.trim());
    if(m){
      const w=+m[1], h=+m[2];
      // 只统计"页面尺寸"（很大的那些），跳过 region 尺寸
      if(w>=256 && h>=256){ dec += w*h*4; totalPx += w*h*4; }
    }
  });
  if(dec>0){ nAtlas++; rows.push([n, (dec/1048576).toFixed(1)+' MB', '']); }
}
console.log('=== 预加载骨骼的"解码后贴图内存"估算（按 atlas 页面尺寸 × 4 字节）===');
rows.slice(0,20).forEach(r=>console.log('  '+r[0].padEnd(34)+r[1]));
console.log('  ... 共 '+rows.length+' 项');
console.log('');
console.log('  ★ 合计约 '+(totalPx/1048576).toFixed(0)+' MB （贴图解码后常驻内存）');
console.log('  ★ 再加上 spine 骨骼数据、动画对象、预制节点，实际更高');