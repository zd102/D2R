import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { LEVELS, levelLayout } from '../src/campaign.ts';
import { areaMapProfile } from '../src/area-map-profiles.ts';
import { layoutWalkable } from '../src/level-layouts.ts';
import { encounterPlan } from '../src/encounter-plan.ts';

// All cards use the same world-to-pixel scale, so small maps stay visibly small.
const seed = Number(process.env.MAP_SEED ?? 20260910);
const output = process.env.OUTPUT_FILE ?? '.verification/map-footprints.svg';
const colors = ['#80977c','#bd9e6b','#599b7c','#ad7765','#89b5c4'];
const cards = LEVELS.map(level => {
  const layout=levelLayout(level,seed),profile=areaMapProfile(level),plan=encounterPlan(level,layout,0);
  const runs:string[]=[];let cells=0;
  for(let z=-layout.bounds.z;z<=layout.bounds.z;z++)for(let x=-layout.bounds.x;x<=layout.bounds.x;) {
    if(!layoutWalkable(layout,x,z)){x++;continue;}
    const start=x;while(x<=layout.bounds.x&&layoutWalkable(layout,x,z))x++;
    cells+=x-start;runs.push(`M${start},${z}h${x-start}v1h${start-x}z`);
  }
  const dot=(x:number,z:number,color:string,radius:number)=>`<circle cx="${x}" cy="${z}" r="${radius}" fill="${color}" stroke="#142023" stroke-width="1"/>`;
  const x=20+(level.index%5)*344,y=92+Math.floor(level.index/5)*384;
  return `<g transform="translate(${x} ${y})"><rect width="332" height="370" rx="5" fill="#172225"/>
    <text x="14" y="25" class="name">${level.index+1}. ${level.name}</text>
    <text x="14" y="46" class="detail">${layout.width} × ${layout.height} · ${profile.character}</text>
    <g transform="translate(166 203) scale(.94)">
      <rect x="${-layout.width/2}" y="${-layout.height/2}" width="${layout.width}" height="${layout.height}" fill="#10191c" stroke="#324347" stroke-width="1"/>
      <path d="${runs.join('')}" fill="${colors[level.act]}"/>
      ${layout.chests.map(p=>dot(p.x,p.z,'#e3bd67',2)).join('')}
      ${layout.objects.map(p=>dot(p.x,p.z,'#61d9e0',3)).join('')}
      ${dot(layout.boss.x,layout.boss.z,'#f17864',4)}${dot(layout.spawn.x,layout.spawn.z,'#fff3d1',3)}
    </g><text x="14" y="357" class="detail">可走 ${cells.toLocaleString('en-US')} 格 · 普通怪 ${plan.normalCount} 只</text></g>`;
});
const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1760" height="2036" viewBox="0 0 1760 2036" role="img" aria-label="暗黑二风格25关地图同尺度大小对照">
  <style>text{font-family:'Microsoft YaHei',sans-serif;fill:#e2e5df}.name{font-size:16px}.detail{font-size:12px;fill:#a9bab8}</style>
  <rect width="1760" height="2036" fill="#0d171a"/>
  <text x="24" y="36" font-size="24">25 关 · 同尺度地图对照</text>
  <text x="24" y="65" class="detail">每张图使用相同比例；白色为入口，红色为首领，蓝色为任务，金色为宝箱。随机种子 ${seed}。</text>
  ${cards.join('\n')}<text x="24" y="2024" class="detail">本项目按暗黑 II 区域特点设计的压缩地图，尺寸为项目配置，并非原作逐格尺寸。</text></svg>`;
await mkdir(dirname(output),{recursive:true});await writeFile(output,svg.replace(/[ \t]+$/gm,''));
console.log(`Wrote ${output}`);
