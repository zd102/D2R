// Rerun affected builds and their comparisons when a support/rotation changes.
import { mkdir, writeFile, appendFile } from 'node:fs/promises';
import { AUDIT_BUILDS, AUDIT_STAGES, buildMetrics } from './class-audit-builds.mjs';
import { auditEncounter } from './class-audit-combat.mjs';
const output=process.env.OUTPUT_DIR??'.verification/class-audit-recheck';await mkdir(output,{recursive:true});
const ids=(process.env.AUDIT_BUILDS??'summonnec,poisonnec').split(',');
const builds=AUDIT_BUILDS.filter(b=>ids.includes(b.id)),jobs=[];
for(const build of builds){
  for(const stage of AUDIT_STAGES)for(const kind of ['pack','boss'])jobs.push({group:'main',build,stage,kind});
  for(const stage of AUDIT_STAGES.filter(s=>['nightmare5','hell5'].includes(s.id))){
    jobs.push({group:'affixes',build,stage,kind:'pack',affixes:true});
    for(const kind of ['pack','boss'])jobs.push({group:'mercenary',build,stage,kind,mercenary:true});
    if(build.id==='poisonnec')for(const kind of ['pack','boss'])jobs.push({group:'white',build,stage,kind,white:true,mercenary:true});
  }
  for(const kind of ['pack','boss'])for(const seed of [513,967])jobs.push({group:'repeat',build,stage:AUDIT_STAGES.at(-1),kind,seed});
  if(build.id==='summonnec')for(const stage of AUDIT_STAGES.filter(s=>['normal1','normal5','hell5'].includes(s.id)))for(const kind of ['pack','boss'])jobs.push({group:'cold',build,stage,kind,coldStart:true});
}
await writeFile(`${output}/metrics.json`,JSON.stringify(builds.flatMap(b=>AUDIT_STAGES.map(s=>buildMetrics(b,s)))));
await writeFile(`${output}/encounters.jsonl`,'');let completed=0;
for(const {build,stage,group,...options} of jobs){await appendFile(`${output}/encounters.jsonl`,JSON.stringify({group,...auditEncounter(build,stage,options)})+'\n');if(++completed%8===0)console.log(`${completed}/${jobs.length} ${build.id} ${group}`);}
console.log(`Complete: ${completed} build checks`);
