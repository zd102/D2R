import { mkdir, writeFile, appendFile, readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { ENDGAME_BUILDS, ENDGAME_STAGE, endgameHero, endgameMetrics } from './endgame-audit-builds.mjs';
import { auditEncounter } from './class-audit-combat.mjs';
import { ENDGAME_ENCOUNTERS } from './endgame-audit-encounters.mjs';
const output=process.env.OUTPUT_DIR??'.verification/endgame-audit',seeds=(process.env.AUDIT_SEEDS??'239,513,967').split(',').map(Number);
const builds=ENDGAME_BUILDS.filter(b=>!process.env.AUDIT_BUILDS||process.env.AUDIT_BUILDS.split(',').includes(b.id));
const jobs=[...ENDGAME_ENCOUNTERS.map(e=>({id:e.id,encounters:[e]})),{id:'gauntlet',encounters:ENDGAME_ENCOUNTERS.slice(2)}].filter(e=>!process.env.AUDIT_ENCOUNTERS||process.env.AUDIT_ENCOUNTERS.split(',').includes(e.id));
await mkdir(output,{recursive:true});
await writeFile(`${output}/metrics.json`,JSON.stringify(builds.map(endgameMetrics),null,2));
await writeFile(`${output}/metadata.json`,JSON.stringify({revision:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),seeds,level:99,players:1,secondsPerBoss:Number(process.env.AUDIT_SECONDS??300),roll:.8,torch:false,mercenary:process.env.AUDIT_NO_MERC!=='1',cta:true,healthPotions:8,manaPotions:8,rejuvenations:8,mercenaryPotions:8,dt:.04,arena:'open arena, no static collision; real combat controllers; 2s attack / 1s reposition'},null,2));
// Resume only rows supplied by the caller from the same configuration/revision.
const prior=[];
for(const file of (process.env.AUDIT_RESUME_FROM??'').split(';').filter(Boolean))for(const line of (await readFile(file,'utf8')).trim().split('\n').filter(Boolean)){
  const row=JSON.parse(line);if(builds.some(b=>b.id===row.build)&&jobs.some(j=>j.id===row.encounter)&&seeds.includes(row.seed))prior.push(row);
}
const key=row=>`${row.build}:${row.encounter}:${row.seed}`,completed=new Set(prior.map(key));
await writeFile(`${output}/encounters.jsonl`,prior.map(row=>JSON.stringify(row)+'\n').join(''));
for(const build of builds)for(const job of jobs)for(const seed of seeds){
  if(completed.has(key({build:build.id,encounter:job.id,seed})))continue;
  const options={kind:'boss',seed,mercenary:process.env.AUDIT_NO_MERC!=='1',hero:endgameHero(build,{mercenary:process.env.AUDIT_NO_MERC!=='1'}).hero,encounters:job.encounters,cta:true,rejuvs:8,mercPotions:8,mosaic:build.id==='martial',charged:build.id==='martial',seconds:Number(process.env.AUDIT_SECONDS??300)};
  const row={encounter:job.id,...auditEncounter(build,ENDGAME_STAGE,options)};
  await appendFile(`${output}/encounters.jsonl`,JSON.stringify(row)+'\n');
  console.log(`${build.id} ${job.id} #${seed}: ${row.won?'win':row.dead?'death':'timeout'} ${row.seconds}s ${row.rounds.at(-1).remaining}% HP, ${row.hpPotions}/${row.manaPotions}/${row.rejuvsUsed} potions`);
}
