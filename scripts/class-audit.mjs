import { mkdir, appendFile, writeFile } from 'node:fs/promises';
import { AUDIT_BUILDS, AUDIT_STAGES, buildMetrics } from './class-audit-builds.mjs';
import { auditEncounter } from './class-audit-combat.mjs';

const output=process.env.OUTPUT_DIR??'.verification/seven-class-audit';await mkdir(output,{recursive:true});
const select=(values,key,filter)=>values.filter(v=>!filter||filter.split(',').includes(v[key]));
const builds=select(AUDIT_BUILDS,'id',process.env.AUDIT_BUILDS),stages=select(AUDIT_STAGES,'id',process.env.AUDIT_STAGES);
const kinds=(process.env.AUDIT_KINDS??'pack,boss').split(','),seeds=(process.env.AUDIT_SEEDS??'239').split(',').map(Number);
const options={poor:process.env.AUDIT_POOR==='1',mercenary:process.env.AUDIT_MERCENARY==='1',coldStart:process.env.AUDIT_COLD==='1',stationary:process.env.AUDIT_STATIONARY==='1',affixes:process.env.AUDIT_AFFIXES==='1',mosaic:process.env.AUDIT_MOSAIC==='1',combatGear:process.env.AUDIT_COMBAT_GEAR==='1',white:process.env.AUDIT_WHITE==='1',charged:process.env.AUDIT_CHARGED==='1'};
await writeFile(`${output}/metrics.json`,JSON.stringify(builds.flatMap(b=>stages.map(s=>buildMetrics(b,s,options))),null,2));
await writeFile(`${output}/encounters.jsonl`,'');let completed=0;
for(const build of builds)for(const stage of stages)for(const kind of kinds)for(const seed of seeds){
  const result=auditEncounter(build,stage,{...options,kind,seed});await appendFile(`${output}/encounters.jsonl`,JSON.stringify(result)+'\n');
  if(++completed%8===0)console.log(`${completed}/${builds.length*stages.length*kinds.length*seeds.length} ${build.id} ${stage.id}: ${result.won?'win':result.dead?'death':'timeout'} ${result.seconds}s`);
}
console.log(`Complete: ${completed} encounters; ${output}/encounters.jsonl`);
