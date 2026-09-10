import * as THREE from 'three';
import type { Enemy } from './game.ts';
import type { PaladinCombat, Projectile, AttackSnapshot } from './combat.ts';
import { classSkillMode, type ExtraSkillId } from './class-skills.ts';
import { skillValues, skillName, type SkillValues, type SkillId, type DamageType } from './paladin.ts';
import { skillLevel, stats, difficulty } from './model.ts';
import { clearShot } from './ranged.ts';
import { weaponType, itemMods } from './items.ts';
import { itemDamage } from './item-effects.ts';
import { createActor, animateActor, gridWalkable, makeRing, type Actor } from './world.ts';

type Missile = Projectile & { skill: ExtraSkillId; values: SkillValues; weapon: boolean; radius: number; target?: Enemy; secondary?: boolean; pulse: number; targetHits?:Map<number,number> };
type Field = { mesh: THREE.Mesh; id: ExtraSkillId; point: THREE.Vector3; direction: THREE.Vector3; values: SkillValues; snapshot: AttackSnapshot; radius: number; life: number; delay: number; tick: number; once: boolean };
export type ClassSummon = { id: 'valkyrie'|'dopplezon'|'hydra'; actor: Actor; hp: number; maxHp: number; life: number; timer: number; rank: number; snapshot: AttackSnapshot; path: THREE.Vector3[]; rethink: number };
const colors: Record<DamageType,number>={physical:0xe6d29b,magic:0xb6b5ff,fire:0xff9453,cold:0x83deff,lightning:0xffe59a,poison:0x9bdb67};
const rangedSkills = (id: string) => ['bow','javelin'].includes(classSkillMode(id) ?? '');
const delays: Partial<Record<ExtraSkillId,number>>={poisonJavelin:.6,plagueJavelin:4,immolationArrow:1,meteor:1.2,fireWall:1.4,blizzard:1.8,frozenOrb:1,hydra:2};

export class ClassCombat {
  missiles: Missile[]=[];
  fields: Field[]=[];
  summons: ClassSummon[]=[];
  delays: Partial<Record<ExtraSkillId,number>>={};
  debuffs=new WeakMap<Enemy,{ sight:number; defense:number; missiles:number }>();
  sequence?: { id: ExtraSkillId; remaining:number; timer:number; direction:THREE.Vector3; aimed:boolean; seen:Set<number>; first:boolean };
  pulse=0;
  blazePoint?: THREE.Vector3;
  readonly combat: PaladinCombat;
  constructor(combat: PaladinCombat) { this.combat=combat; }
  get game() { return this.combat.game; }
  value(id:ExtraSkillId) { const h=this.game.hero; return skillValues(id,skillLevel(h,id),h.skills); }
  reach(id:string) { const mode=classSkillMode(id); return mode==='spear'?2.6:mode?14:undefined; }
  nearby(point:THREE.Vector3,radius:number) { return this.game.enemies.filter(enemy=>this.combat.hostile(enemy)&&enemy.actor.group.position.distanceTo(point)<=radius&&clearShot(this.game.world.grid,point,enemy.actor.group.position)).sort((a,b)=>a.actor.group.position.distanceToSquared(point)-b.actor.group.position.distanceToSquared(point)); }
  aim(aimed:boolean) {
    const g=this.game, target=aimed?this.combat.pointedEnemy():g.target&&this.combat.hostile(g.target)?g.target:this.nearby(g.position,14)[0];
    const point=aimed?g.aim.clone():target?target.actor.group.position.clone():g.position.clone().add(new THREE.Vector3(Math.sin(g.actor.group.rotation.y)*8,0,Math.cos(g.actor.group.rotation.y)*8));
    const direction=point.clone().sub(g.position).setY(0); if(direction.lengthSq()<.01) direction.set(Math.sin(g.actor.group.rotation.y),0,Math.cos(g.actor.group.rotation.y));
    return {point,direction:direction.normalize(),target};
  }
  destination(point:THREE.Vector3, teleport=false) {
    const g=this.game, direction=point.clone().sub(g.position).setY(0), distance=Math.min(12,direction.length()); direction.normalize();
    // A landing spot must leave room for the hero's collision body.
    const safe=(p:THREE.Vector3)=>[[0,0],[.35,0],[-.35,0],[0,.35],[0,-.35]].every(([x,z])=>gridWalkable(g.world.grid,{x:p.x+x,z:p.z+z}));
    for(let d=distance;d>=.3;d-=.25) { const p=g.position.clone().addScaledVector(direction,d); if(safe(p)&&(teleport||clearShot(g.world.grid,g.position,p))) return p; }
    return undefined;
  }
  cast(id: ExtraSkillId, aimed:boolean): boolean {
    const c=this.combat,g=this.game,h=g.hero,s=stats(h),rank=skillLevel(h,id,s.mods),v=skillValues(id,rank,h.skills),mode=classSkillMode(id);
    if(!rank||mode==='passive'||c.lock>0||c.zeal||this.sequence||g.paused||g.dead||(this.delays[id]??0)>0) return false;
    const {point,direction,target}=this.aim(aimed);
    const utility=id==='telekinesis'&&aimed?this.telekinesisTarget(point):undefined;
    if(mode==='bow'&&(!s.weapon||!s.ranged||s.ranged.stack)) { g.ui.toast('需要可用的弓或弩');return false; }
    if(mode==='javelin'&&s.ranged?.kind!=='javelin'||mode==='spear'&&(!s.weapon||!['spear','javelin'].includes(weaponType(s.weapon)??''))) { g.ui.toast('需要可用的长矛或标枪');return false; }
    let destination:THREE.Vector3|undefined;
    if(['teleport','meteor','fireWall','blizzard','valkyrie','dopplezon','hydra'].includes(id)) { destination=this.destination(point,id==='teleport');if(!destination) {g.ui.toast('该位置不可到达');return false;} }
    if(['chainLightning','telekinesis'].includes(id)&&!target&&!utility) {g.ui.toast('没有可作用的目标');return false;}
    if(h.mana<v.cost) {g.ui.toast('法力不足');return false;}
    h.mana-=v.cost;c.lock=(mode==='bow'||mode==='javelin'?s.rangedFrames:mode==='spear'?s.attackFrames:['lightning','chainLightning'].includes(id)?s.lightningFrames:s.castFrames)/25;
    this.delays[id]=delays[id]??0;g.attackTime=1;g.actor.group.rotation.y=Math.atan2(direction.x,direction.z);g.audio.play(rangedSkills(id)?'shot':'spell');
    if(target&&['bow','javelin','spear'].includes(mode??''))c.triggerItems('att-skill',target);
    if(utility){g.beam(g.position.clone().setY(1),utility.point.clone().setY(.5));if(utility.chest)g.openChest(utility.chest.id,true);else if(utility.loot)g.collectLoot(utility.loot);return true;}
    if(id==='teleport') {g.burst(g.position.clone().setY(1),0x95cfff,16);g.body.position.set(destination!.x,.5,destination!.z);g.body.velocity.set(0,0,0);g.position.copy(destination!);g.path=[];g.target=undefined;g.marker.visible=false;g.burst(destination!.clone().setY(1),0x95cfff,16);return true;}
    if(mode==='buff') {
      if(['frozenArmor','shiverArmor','chillingArmor'].includes(id)) for(const other of ['frozenArmor','shiverArmor','chillingArmor'] as const) delete h.buffs[other];
      h.buffs[id]={remaining:v.duration,rank};g.burst(g.position.clone().setY(1),colors[v.type],20);g.save(false);return true;
    }
    if(mode==='summon') {this.summon(id as ClassSummon['id'],destination!,rank);return true;}
    if(id==='innerSight'||id==='slowMissiles') {
      this.ring(g.position,v.radius,id==='innerSight'?0xefe3ba:0xbadf92);
      for(const enemy of this.nearby(g.position,v.radius)) {const old=this.debuffs.get(enemy)??{sight:0,defense:0,missiles:0};if(id==='innerSight'){old.sight=v.duration;old.defense=v.secondary;}else old.missiles=v.duration;this.debuffs.set(enemy,old);g.burst(enemy.actor.group.position.clone().setY(1.6),0xe8dc9d,4);}
      return true;
    }
    if(id==='staticField') {
      this.ring(g.position,v.radius,colors.lightning);
      for(const enemy of this.nearby(g.position,v.radius)) {const floor=enemy.maxHp*[0,.33,.5][difficulty(h)],res=enemy.resistances.lightning; if(res>=100)continue;const amount=Math.min(Math.max(0,enemy.hp-floor),enemy.hp*.25*Math.max(0,1-res/100));if(amount>0){const snap=c.snapshot();snap.stats.mods.lightningSkillDamage=0;snap.stats.mods.lightningPierce=0;snap.stats.auras=[];c.damage(enemy,amount,'lightning',true,false,snap);}}
      return true;
    }
    if(id==='nova'||id==='frostNova') {this.ring(g.position,v.radius,colors[v.type]);for(const enemy of this.nearby(g.position,v.radius))this.hit(enemy,id,v,c.snapshot());return true;}
    if(id==='chainLightning') {this.chain(target!,id,v,c.snapshot());return true;}
    if(id==='telekinesis') {g.beam(g.position.clone().setY(1),target!.actor.group.position.clone().setY(1));this.hit(target!,id,v,c.snapshot());if(!target!.boss){c.knockback(target!,1.2);target!.stunned=Math.max(target!.stunned,.4);}return true;}
    if(id==='meteor'||id==='blizzard'||id==='fireWall'||id==='inferno') {this.field(id,destination??g.position.clone(),direction,v,c.snapshot(),id==='meteor'?1:0);if(id==='inferno')c.lock=.6;return true;}
    if(id==='jab'||id==='fend'||id==='strafe') {
      const hits=id==='strafe'?Math.max(v.secondary,Math.min(v.hits,this.nearby(g.position,14).length)):id==='fend'?Math.min(v.hits,this.nearby(g.position,2.6).length):v.hits;
      this.sequence={id,remaining:Math.max(1,hits),timer:0,direction,aimed,seen:new Set(),first:true};c.lock=Math.max(c.lock,hits*(id==='strafe'?Math.max(.08,stats(h).rangedFrames/100):.22));return true;
    }
    if(mode==='spear') {this.spear(id,direction,aimed);if(id==='impale'){c.lock*=1.8;const weapon=s.weapon!;if(weapon.durability&&!itemMods(weapon).indestructible&&Math.random()*100<v.percent)weapon.durability--;}return true;}
    if(id==='multipleShot'||id==='chargedBolt') {
      const shared=id==='multipleShot'?new Set<number>():undefined;
      for(let i=0;i<v.hits;i++){const dir=direction.clone().applyAxisAngle(new THREE.Vector3(0,1,0),(i-(v.hits-1)/2)*Math.min(.13,1.2/Math.max(1,v.hits-1)));this.missile(id,g.position,dir,v,c.snapshot(),target,shared);}
      return true;
    }
    this.missile(id,g.position,direction,v,c.snapshot(),target);
    return true;
  }
  ring(point:THREE.Vector3,radius:number,color:number) {const g=this.game,mesh=makeRing(radius,color,.7);mesh.position.copy(point).setY(.15);g.world.scene.add(mesh);g.effects.push({mesh,life:.35,duration:.35,type:'slash'});}
  telekinesisTarget(point:THREE.Vector3) {
    const g=this.game,within=(p:{x:number;z:number})=>Math.hypot(p.x-point.x,p.z-point.z)<1.4&&Math.hypot(p.x-g.position.x,p.z-g.position.z)<=12&&clearShot(g.world.grid,g.position,p);
    const loot=g.loot?.find(l=>within(l)&&(l.gold||l.potion!==undefined||l.item?.misc&&['tsc','isc','key','aqv','cqv'].includes(l.item.baseCode??'')));
    if(loot)return {loot,point:new THREE.Vector3(loot.x,0,loot.z)};
    const chest=g.world.chests?.find(c=>!c.opened&&within(c));if(chest)return {chest,point:new THREE.Vector3(chest.x,0,chest.z)};
    return undefined;
  }
  missile(id:ExtraSkillId,origin:THREE.Vector3,direction:THREE.Vector3,values:SkillValues,snapshot:AttackSnapshot,target?:Enemy,hit=new Set<number>(),secondary=false,targetHits?:Map<number,number>) {
    if(this.missiles.length>=160)return;
    direction=direction.clone().setY(0);if(direction.lengthSq()<.0001)direction.set(0,0,1);else direction.normalize();
    const weapon=rangedSkills(id)&&!secondary, color=colors[values.type], orb=id==='frozenOrb'&&!secondary;
    const mesh=new THREE.Mesh(weapon?new THREE.CylinderGeometry(.035,.035,id==='lightningFury'?1.2:.85,5):new THREE.IcosahedronGeometry(orb?.42:values.type==='cold'?.17:.2,1),new THREE.MeshBasicMaterial({color:weapon&&values.type==='physical'?0xe6d4a6:color}));
    mesh.position.copy(origin).setY(.9);mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),direction);this.game.world.scene.add(mesh);
    this.missiles.push({mesh,origin:origin.clone(),direction:direction.clone(),phase:Math.random()*6,age:0,life:orb?1.15:1.1,damage:0,healing:0,kind:weapon?'arrow':'bolt',hit,snapshot,speed:orb?7:weapon?20:id==='chargedBolt'||id==='chargedStrike'?10:15,pierce:id==='guidedArrow'?0:id==='lightning'?100:weapon?snapshot.stats.mods.pierceChance??0:0,magicArrow:0,explosion:0,skill:id,values:{...values},weapon,radius:['fireBall','explodingArrow','immolationArrow','glacialSpike','freezingArrow','plagueJavelin'].includes(id)?values.radius:0,target,secondary,targetHits,pulse:0});
  }
  hit(enemy:Enemy,id:ExtraSkillId,v:SkillValues,snapshot:AttackSnapshot,scale=1) {
    if(!this.combat.hostile(enemy))return 0;
    const c=this.combat,amount=(v.min+Math.random()*(v.max-v.min))*scale;
    if(v.type==='poison') {const seconds=Math.max(.5,v.duration),dps=itemDamage(amount/seconds,'poison',snapshot.stats.mods,enemy.resistances.poison);if(dps>0&&(!enemy.poison||enemy.poison.dps<=dps))enemy.poison={dps,remaining:seconds};enemy.active=true;return dps;}
    const dealt=c.damage(enemy,amount,v.type,false,false,snapshot);
    if(dealt>0&&v.type==='cold') {const duration=Math.max(.5,v.duration||2)/[1,2,4][snapshot.difficulty];enemy.coldTime=Math.max(enemy.coldTime,duration);if(!enemy.boss&&['iceBlast','iceArrow','glacialSpike','freezingArrow','frozenArmor'].includes(id))enemy.stunned=Math.max(enemy.stunned,Math.min(4,duration));}
    return dealt;
  }
  spear(id:ExtraSkillId,direction:THREE.Vector3,aimed:boolean,seen?:Set<number>) {
    const g=this.game,c=this.combat,v=this.value(id),target=this.nearby(g.position,2.6).find(enemy=>!seen?.has(enemy.id)&&(!aimed||enemy.actor.group.position.clone().sub(g.position).normalize().dot(direction)>.2));
    this.ring(g.position,1.4,colors[v.type]);g.attackTime=1;if(!target)return;seen?.add(target.id);
    const hit=c.weaponHit(target,id),snapshot=c.snapshot();
    if(id==='chargedStrike') {const targetHits=new Map<number,number>();for(let i=0;i<v.hits;i++)this.missile(id,g.position,direction.clone().applyAxisAngle(new THREE.Vector3(0,1,0),(i-(v.hits-1)/2)*.18),v,snapshot,undefined,undefined,true,targetHits);}
    else if(id==='lightningStrike')this.chain(target,id,v,snapshot);
    else if(hit&&v.max>0)this.hit(target,id,v,snapshot);
  }
  chain(first:Enemy,id:ExtraSkillId,v:SkillValues,snapshot:AttackSnapshot) {
    let target:Enemy|undefined=first,previous=snapshot.origin.clone();const hit=new Set<number>();
    for(let i=0;i<v.hits&&target;i++) {const point=target.actor.group.position.clone();if(!clearShot(this.game.world.grid,previous,point))break;this.game.beam(previous.clone().setY(1),point.clone().setY(1));this.hit(target,id,v,snapshot);hit.add(target.id);previous=point;target=this.nearby(point,6).find(enemy=>!hit.has(enemy.id));}
  }
  impact(m:Missile,point:THREE.Vector3,target?:Enemy) {
    if(m.radius) {this.ring(point,m.radius,colors[m.values.type]);for(const enemy of this.nearby(point,m.radius))this.hit(enemy,m.skill,m.values,m.snapshot);}
    if(m.skill==='immolationArrow')this.field(m.skill,point,m.direction,{...m.values,min:m.values.min*.25,max:m.values.max*.25,duration:4,radius:2.5},m.snapshot);
    if(m.skill==='plagueJavelin')this.field(m.skill,point,m.direction,{...m.values,radius:3},m.snapshot);
    if(m.skill==='lightningFury'&&!m.secondary&&target) for(const enemy of this.nearby(point,10).filter(enemy=>enemy!==target).slice(0,m.values.hits)) this.missile('lightningFury',point,enemy.actor.group.position.clone().sub(point).normalize(),m.values,m.snapshot,enemy,new Set([target.id]),true);
  }
  updateMissile(m:Missile,dt:number) {
    const g=this.game,steps=Math.max(1,Math.ceil(dt*m.speed/.2)),step=dt/steps;
    for(let i=0;i<steps;i++) {
      if(m.skill==='guidedArrow'&&m.target&&this.combat.hostile(m.target))m.direction.lerp(m.target.actor.group.position.clone().sub(m.mesh.position).setY(0).normalize(),Math.min(1,step*7)).normalize();
      const previous=m.mesh.position.clone();m.age+=step;m.mesh.position.addScaledVector(m.direction,step*m.speed);
      if(!clearShot(g.world.grid,previous,m.mesh.position)) {this.impact(m,previous.clone().setY(0));return false;}
      if(m.skill==='frozenOrb'&&!m.secondary) {
        m.pulse-=step;if(m.pulse<=0){m.pulse=.13;for(let n=0;n<4;n++)this.missile('frozenOrb',m.mesh.position,new THREE.Vector3(Math.sin(m.age*9+n*Math.PI/2),0,Math.cos(m.age*9+n*Math.PI/2)),m.values,m.snapshot,undefined,undefined,true);}
      } else {
        const segment=new THREE.Line3(previous,m.mesh.position),hits=this.nearby(previous,1.5).filter(enemy=>!m.hit.has(enemy.id)&&segment.closestPointToPoint(enemy.actor.group.position.clone().setY(.9),true,new THREE.Vector3()).distanceTo(enemy.actor.group.position.clone().setY(.9))<(enemy.boss?.85:.55)).sort((a,b)=>a.actor.group.position.distanceToSquared(previous)-b.actor.group.position.distanceToSquared(previous));
        for(const enemy of hits){m.hit.add(enemy.id);if(m.targetHits){const count=m.targetHits.get(enemy.id)??0;if(count>=3)continue;m.targetHits.set(enemy.id,count+1);}const hit=!m.weapon||this.combat.weaponHit(enemy,m.skill,m);if(hit){if(!m.radius&&m.values.max>0)this.hit(enemy,m.skill,m.values,m.snapshot);this.impact(m,enemy.actor.group.position.clone(),enemy);}if(hit&&Math.random()*100>=m.pierce)return false;}
      }
      if(m.skill==='poisonJavelin'){m.pulse-=step;if(m.pulse<=0){m.pulse=.18;this.field(m.skill,previous.clone().setY(0),m.direction,{...m.values,radius:.85},m.snapshot);}}
    }
    if(m.age>=m.life){if(m.skill==='frozenOrb'&&!m.secondary)for(let i=0;i<12;i++)this.missile('frozenOrb',m.mesh.position,new THREE.Vector3(Math.sin(i*Math.PI/6),0,Math.cos(i*Math.PI/6)),m.values,m.snapshot,undefined,undefined,true);return false;}
    return true;
  }
  field(id:ExtraSkillId,point:THREE.Vector3,direction:THREE.Vector3,values:SkillValues,snapshot:AttackSnapshot,delay=0) {
    if(this.fields.length>=40)return;
    const line=id==='fireWall'||id==='inferno',radius=values.radius||2;
    const mesh=new THREE.Mesh(line?new THREE.PlaneGeometry(id==='inferno'?1.5:radius*2,id==='inferno'?radius*2:1.5):new THREE.CircleGeometry(radius,28),new THREE.MeshBasicMaterial({color:colors[values.type],transparent:true,opacity:delay?.16:.22,depthWrite:false,side:THREE.DoubleSide}));
    mesh.rotation.x=-Math.PI/2;mesh.rotation.z=Math.atan2(direction.x,direction.z);mesh.position.copy(point).setY(.13);this.game.world.scene.add(mesh);
    this.fields.push({mesh,id,point:point.clone(),direction:direction.clone(),values:{...values},snapshot,radius,life:id==='poisonJavelin'?1.2:id==='plagueJavelin'?3:values.duration||3,delay,tick:0,once:!!delay});
  }
  summon(id:ClassSummon['id'],point:THREE.Vector3,rank:number) {
    const g=this.game,v=this.value(id),existing=this.summons.filter(s=>s.id===id);
    if(existing.length>=(id==='hydra'?3:1)){const old=existing[0];g.disposeObject(old.actor.group);this.summons.splice(this.summons.indexOf(old),1);}
    const actor=id==='hydra'?this.hydraActor():createActor('hero','amazon');actor.group.position.copy(point);
    if(id!=='hydra') {actor.group.getObjectByName('hero-weapon')!.visible=false;actor.group.getObjectByName('hero-javelin')!.visible=true;actor.group.userData.rangedKind='javelin';}
    if(id==='dopplezon')actor.group.traverse(node=>{if(node instanceof THREE.Mesh){const mat=node.material as THREE.MeshStandardMaterial;mat.color?.setHex(0x75cbbb);mat.transparent=true;mat.opacity=.65;}});
    g.world.scene.add(actor.group);const hp=id==='dopplezon'?stats(g.hero).maxHp*v.percent/100:id==='hydra'?200+rank*20:v.healing;
    this.summons.push({id,actor,hp,maxHp:hp,life:v.duration||3600,timer:0,rank,snapshot:this.combat.snapshot(),path:[],rethink:0});g.burst(point.clone().setY(1),id==='hydra'?0xff9a61:0xbde8c4,18);
  }
  target(enemy:Enemy) { return this.summons.filter(s=>s.id!=='hydra'&&s.hp>0&&s.actor.group.position.distanceTo(enemy.actor.group.position)<10&&clearShot(this.game.world.grid,enemy.actor.group.position,s.actor.group.position)).sort((a,b)=>a.actor.group.position.distanceToSquared(enemy.actor.group.position)-b.actor.group.position.distanceToSquared(enemy.actor.group.position))[0]; }
  hydraActor():Actor {
    const group=new THREE.Group(), material=new THREE.MeshStandardMaterial({color:0xba5b33,emissive:0x541407}), eye=new THREE.MeshBasicMaterial({color:0xffd899});
    for(let head=0;head<3;head++){const neck=new THREE.Group();neck.position.x=(head-1)*.4;group.add(neck);const body=new THREE.Mesh(new THREE.CylinderGeometry(.10,.19,1.2+head*.15,7),material);body.position.y=.6+head*.075;neck.add(body);const skull=new THREE.Mesh(new THREE.SphereGeometry(.22,8,6),material);skull.position.set(0,1.25+head*.15,.1);skull.scale.z=1.5;neck.add(skull);for(const side of [-1,1]){const pupil=new THREE.Mesh(new THREE.SphereGeometry(.045,6,4),eye);pupil.position.set(side*.15,skull.position.y+.04,.27);neck.add(pupil);}}
    const limb=()=>new THREE.Group();return {group,leftLeg:limb(),rightLeg:limb(),leftArm:limb(),rightArm:limb(),kind:'hydra',animate:(time)=>{group.children.forEach((neck,i)=>neck.rotation.z=Math.sin(time*2+i)*.07);}};
  }
  hurtSummon(summon:ClassSummon,amount:number,type:DamageType='physical') {const resistance=summon.id==='valkyrie'&&!['physical','magic'].includes(type)?Math.min(85,summon.rank*2):0;summon.hp=Math.max(0,summon.hp-amount*(1-resistance/100));this.game.burst(summon.actor.group.position.clone().setY(1),0xe7c9a1,3);}
  missileSpeed(enemy:Enemy) {return (this.debuffs.get(enemy)?.missiles??0)>0?.33:1;}
  defenseReduction(enemy:Enemy) {const debuff=this.debuffs.get(enemy);return debuff&&debuff.sight>0?debuff.defense:0;}
  update(dt:number) {
    const g=this.game,c=this.combat,h=g.hero;
    for(const id of Object.keys(this.delays) as ExtraSkillId[])this.delays[id]=Math.max(0,this.delays[id]!-dt);
    for(const [id,buff] of Object.entries(h.buffs??{})) {buff.remaining=Math.max(0,buff.remaining-dt);if(!buff.remaining)delete h.buffs[id as SkillId];}
    for(const enemy of g.enemies){const debuff=this.debuffs.get(enemy);if(debuff){debuff.sight=Math.max(0,debuff.sight-dt);debuff.missiles=Math.max(0,debuff.missiles-dt);}}
    if(this.sequence){const seq=this.sequence;seq.timer-=dt;if(seq.timer<=0){const {direction,target}=this.aim(seq.aimed);if(seq.id==='strafe'){const s=stats(h);if(!s.weapon||!s.ranged||s.ranged.stack){this.sequence=undefined;}else this.missile(seq.id,g.position,direction,this.value(seq.id),c.snapshot(),target);}else this.spear(seq.id,direction,seq.id==='fend'?false:seq.aimed,seq.id==='fend'?seq.seen:undefined);seq.first=false;g.actor.group.rotation.y=Math.atan2(direction.x,direction.z);g.attackTime=1;if(--seq.remaining<=0)this.sequence=undefined;else seq.timer=seq.id==='strafe'?Math.max(.08,stats(h).rangedFrames/100):.22;}}
    for(let i=this.missiles.length-1;i>=0;i--)if(!this.updateMissile(this.missiles[i],dt)){g.disposeObject(this.missiles[i].mesh);this.missiles.splice(i,1);}
    for(let i=this.fields.length-1;i>=0;i--){const f=this.fields[i];if(f.delay>0){f.delay-=dt;continue;}f.life-=dt;f.tick-=dt;
      if(f.life<=0){g.disposeObject(f.mesh);this.fields.splice(i,1);continue;}
      if(f.tick<=0){f.tick=f.id==='blizzard'?1:.25;if(f.once){f.once=false;g.beam(f.point.clone().setY(10),f.point.clone().setY(.2));for(const enemy of this.nearby(f.point,f.radius))this.hit(enemy,f.id,f.values,f.snapshot);f.values.min*=.15;f.values.max*=.15;}
        for(const enemy of this.nearby(f.point,f.id==='inferno'?f.radius*2:f.radius)){const delta=enemy.actor.group.position.clone().sub(f.point),along=delta.dot(f.direction),across=Math.abs(delta.x*f.direction.z-delta.z*f.direction.x);if(f.id==='inferno'&&(along<0||across>1.1+along*.15)||f.id==='fireWall'&&Math.abs(along)>1)continue;this.hit(enemy,f.id,f.values,f.snapshot,f.values.type==='poison'||f.id==='blizzard'?1:.25);g.burst(enemy.actor.group.position.clone().setY(f.id==='blizzard'?2:.3),colors[f.values.type],2);}
      }
    }
    const blaze=h.buffs?.blaze;if(blaze&&(!this.blazePoint||this.blazePoint.distanceTo(g.position)>.8)){this.blazePoint=g.position.clone();this.field('blaze',g.position,new THREE.Vector3(0,0,1),{...skillValues('blaze',blaze.rank,h.skills),duration:2,radius:1},c.snapshot());}if(!blaze)this.blazePoint=undefined;
    this.pulse-=dt;if(this.pulse<=0){const storm=h.buffs?.thunderStorm;if(storm){const v=skillValues('thunderStorm',storm.rank,h.skills),target=this.nearby(g.position,v.radius)[0];if(target){g.beam(target.actor.group.position.clone().setY(9),target.actor.group.position.clone());this.hit(target,'thunderStorm',v,c.snapshot());}this.pulse=v.secondary;}else this.pulse=.25;}
    for(let i=this.summons.length-1;i>=0;i--){const summon=this.summons[i];summon.life-=dt;summon.timer-=dt;if(summon.hp<=0||summon.life<=0||g.dead){g.disposeObject(summon.actor.group);this.summons.splice(i,1);continue;}
      const point=summon.actor.group.position,target=this.nearby(point,12)[0];let moving=false;
      if(summon.id==='hydra'){if(target&&summon.timer<=0){summon.timer=1.4;const v=skillValues('hydra',summon.rank,h.skills);for(let head=0;head<3;head++)this.missile('hydra',point.clone().add(new THREE.Vector3((head-1)*.35,0,0)),target.actor.group.position.clone().sub(point).normalize(),v,summon.snapshot,target);}}
      else if(summon.id==='valkyrie'){const destination=target?.actor.group.position??g.position,distance=point.distanceTo(destination);if(distance>(target?1.8:3)){summon.rethink-=dt;if(summon.rethink<=0){summon.path=g.world.path(point,destination);summon.rethink=.6;}const next=summon.path[0];if(next){const direction=next.clone().sub(point).normalize(),end=point.clone().addScaledVector(direction,Math.min(next.distanceTo(point),dt*4));if(clearShot(g.world.grid,point,end)){point.copy(end);moving=true;summon.actor.group.rotation.y=Math.atan2(direction.x,direction.z);}if(point.distanceTo(next)<.25)summon.path.shift();}}else if(target&&summon.timer<=0){summon.timer=1.2;const v=skillValues('valkyrie',summon.rank,h.skills);this.hit(target,'valkyrie',v,summon.snapshot);const enchant=h.buffs.enchant;if(enchant)this.hit(target,'enchant',skillValues('enchant',enchant.rank,h.skills),c.snapshot());}}
      animateActor(summon.actor,g.time+i,moving,summon.timer>1?.7:0);
    }
  }
  clear() {for(const m of this.missiles)this.game.disposeObject(m.mesh);for(const f of this.fields)this.game.disposeObject(f.mesh);for(const s of this.summons)this.game.disposeObject(s.actor.group);this.missiles=[];this.fields=[];this.summons=[];this.sequence=undefined;this.delays={};this.debuffs=new WeakMap();this.blazePoint=undefined;}
}
