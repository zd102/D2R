import { mkdir, writeFile, appendFile } from 'node:fs/promises';
import { AUDIT_BUILDS, AUDIT_STAGES } from './class-audit-builds.mjs';
import { auditEncounter } from './class-audit-combat.mjs';

const output=process.env.OUTPUT_DIR??'.verification/class-audit-variants';await mkdir(output,{recursive:true});
const jobs=[];
function add(group,ids,stages,options,seeds=[239]){
  for(const id of ids)for(const stage of stages)for(const kind of ['pack','boss'])for(const seed of seeds)jobs.push({group,build:AUDIT_BUILDS.find(b=>b.id===id),stage:AUDIT_STAGES.find(s=>s.id===stage),options:{...options,kind,seed}});
}
add('repeat',AUDIT_BUILDS.map(b=>b.id),['hell5'],{},[513,967]);
add('poor',['zeal','bow','nova','bone','whirlwind','fury','summondruid','lighttraps'],['nightmare5','hell5'],{poor:true});
add('cold',['summonnec','summondruid'],['normal1','normal5','hell5'],{coldStart:true});
add('mosaic',['martial'],['nightmare5','hell5'],{mosaic:true});
add('mosaicCharged',['martial'],['nightmare5','hell5'],{mosaic:true,charged:true});
add('combatGear',['zeal','smite','bow','frenzy','berserk','fury','kicks','blades'],['hell5'],{combatGear:true});
await writeFile(`${output}/encounters.jsonl`,'');let completed=0;
for(const job of jobs){
  const row={group:job.group,...auditEncounter(job.build,job.stage,job.options)};await appendFile(`${output}/encounters.jsonl`,JSON.stringify(row)+'\n');
  if(++completed%8===0)console.log(`${completed}/${jobs.length} ${job.group} ${job.build.id}: ${row.won?'win':row.dead?'death':'timeout'} ${row.seconds}s`);
}
console.log(`Complete: ${completed} variant encounters`);
