import * as THREE from 'three';
import type { Actor } from './world.ts';
import { createMonsterActor } from './monster-models.ts';
import { MONSTERS } from './bestiary.ts';
import { createHeroActor } from './hero-models.ts';
import { actorMaterial, mergeActorParts } from './actor-modeling.ts';

export function createBeastActor(bear=false,upright=false):Actor {
  const group=new THREE.Group(),body=new THREE.Group();group.add(body);
  const fur=actorMaterial(bear?0x644333:0x92918a,'leather'),dark=actorMaterial(0x292522,'leather'),eye=actorMaterial(0xe3c273,'bronze');
  const sphere=new THREE.SphereGeometry(1,10,8),cone=new THREE.ConeGeometry(1,1,7);
  const part=(p:THREE.Object3D,mat:THREE.Material,x:number,y:number,z:number,sx:number,sy:number,sz:number,geo:THREE.BufferGeometry=sphere)=>{const mesh=new THREE.Mesh(geo,mat);mesh.position.set(x,y,z);mesh.scale.set(sx,sy,sz);mesh.castShadow=true;p.add(mesh);return mesh;};
  const bulk=bear?1.3:1;
  part(body,fur,0,upright?1:.65,0,.34*bulk,upright?.67:.36,.62*bulk);
  const head=new THREE.Group();head.position.set(0,upright?1.65:.92,upright?.2:.53);body.add(head);
  part(head,fur,0,0,0,.25*bulk,.25,.29);part(head,fur,0,-.07,.27,.14*bulk,.12,.28);part(head,dark,0,-.025,.48,.10,.07,.07);
  for(const side of [-1,1]){part(head,fur,side*.18,.23,-.04,bear?.1:.11,bear?.1:.28,.09,bear?sphere:cone);part(head,eye,side*.14,.065,.23,.028,.018,.025);}
  const legs:THREE.Group[]=[];
  for(let i=0;i<4;i++){const side=i%2?1:-1,front=i<2,limb=new THREE.Group();body.add(limb);limb.position.set(side*(upright&&front?.43:.25)*bulk,upright&&front?1.33:.52,front?.37:-.38);legs.push(limb);part(limb,fur,0,-.19,0,.105*bulk,upright&&front?.35:.28,.12);part(limb,dark,0,-(upright&&front?.5:.43),.07,.12*bulk,.075,.2);for(let claw=0;claw<3;claw++)part(limb,eye,(claw-1)*.06,-(upright&&front?.5:.44),.24,.02,.07,.02,cone).rotation.x=Math.PI/2;}
  if(!bear){const tail=part(body,fur,0,.60,-.85,.12,.17,.40);tail.rotation.x=-.3;}
  mergeActorParts(body);
  return {group,leftArm:legs[0],rightArm:legs[1],leftLeg:legs[2],rightLeg:legs[3],kind:bear?'bear':'wolf',animate(time,moving,attacking){for(let i=0;i<legs.length;i++)legs[i].rotation.x=moving?Math.sin(time*10+(i===0||i===3?0:Math.PI))*.6:0;body.position.y=moving?Math.abs(Math.sin(time*10))*.04:0;head.rotation.x=attacking?Math.sin(time*12)*.2:Math.sin(time*2)*.03;}};
}
export function createCompanionActor(id:string):Actor {
  if(id==='raiseSkeleton'||id==='raiseSkeletalMage'){
    const actor=createMonsterActor(MONSTERS[id==='raiseSkeleton'?'skeleton':'boneMage']??MONSTERS.skeleton);actor.group.scale.setScalar(.8);return actor;
  }
  if(id==='shadowWarrior'||id==='shadowMaster'){
    const actor=createHeroActor('assassin');actor.group.traverse(node=>{if(node instanceof THREE.Mesh)for(const mat of Array.isArray(node.material)?node.material:[node.material]){if(mat instanceof THREE.MeshStandardMaterial){mat.color.multiplyScalar(.5);mat.emissive.setHex(0x261f45);}}});return actor;
  }
  if(id==='summonSpiritWolf'||id==='summonFenris'||id==='summonGrizzly')return createBeastActor(id==='summonGrizzly');
  const group=new THREE.Group(),material=actorMaterial(id==='fireGolem'?0xa44322:id==='ironGolem'?0x828988:id==='bloodGolem'?0x7d3936:0x796950,'leather'),glow=new THREE.MeshStandardMaterial({color:0xa9c578,emissive:0x36532a});
  const sphere=new THREE.SphereGeometry(1,10,8),limbs=[new THREE.Group(),new THREE.Group(),new THREE.Group(),new THREE.Group()];limbs.forEach(l=>group.add(l));
  const ball=(p:THREE.Object3D,x:number,y:number,z:number,sx:number,sy:number,sz:number,mat:THREE.Material=material)=>{const m=new THREE.Mesh(sphere,mat);m.position.set(x,y,z);m.scale.set(sx,sy,sz);m.castShadow=true;p.add(m);return m;};
  if(id==='raven'){
    ball(group,0,1.6,0,.12,.14,.3,glow);ball(group,0,1.7,.28,.10,.11,.12);for(const [i,side] of [-1,1].entries()){limbs[i].position.set(side*.08,1.65,0);ball(limbs[i],side*.2,0,0,.32,.035,.20);}group.userData.untargetable=true;
  }else if(['oakSage','heartOfWolverine','spiritOfBarbs'].includes(id)){
    ball(group,0,.9,0,.24,.30,.24,glow);for(let i=0;i<7;i++){const a=i*Math.PI*2/7;ball(group,Math.cos(a)*.25,.9,Math.sin(a)*.25,.055,.55,.055,glow);}
  }else if(['plaguePoppy','carrionVine','solarCreeper'].includes(id)){
    for(let i=0;i<8;i++){ball(group,Math.sin(i*.8)*.3,.1+i*.06,(i-4)*.12,.09,.13,.11,glow);}ball(group,Math.sin(5.6)*.3,.66,.4,.18,.14,.17,glow);
  }else{
    ball(group,0,.92,0,.39,.53,.28);ball(group,0,1.52,.05,.23,.24,.22);
    for(const [i,side] of [-1,1].entries()){limbs[i].position.set(side*.46,1.21,0);ball(limbs[i],0,-.32,0,.17,.4,.18);ball(limbs[i],0,-.65,.1,.19,.16,.22);limbs[i+2].position.set(side*.23,.49,0);ball(limbs[i+2],0,-.19,0,.19,.3,.22);ball(group,side*.075,1.58,.25,.035,.023,.02,glow);}
  }
  mergeActorParts(group);
  return {group,leftArm:limbs[0],rightArm:limbs[1],leftLeg:limbs[2],rightLeg:limbs[3],kind:id,animate(time,moving,attacking){if(id==='raven'){limbs[0].rotation.z=Math.sin(time*14)*.6;limbs[1].rotation.z=-Math.sin(time*14)*.6;}else{for(let i=0;i<4;i++)limbs[i].rotation.x=moving?Math.sin(time*6+i*Math.PI)*.3:attacking&&i<2?-.8:0;}}};
}
export function trapModel(id:string){
  const group=new THREE.Group(),metal=new THREE.MeshStandardMaterial({color:0x777980,metalness:.7,roughness:.45}),energy=new THREE.MeshStandardMaterial({color:/Fire|Inferno/.test(id)?0xf18b36:0x99cde4,emissive:/Fire|Inferno/.test(id)?0x6a2707:0x194c76});
  for(let i=0;i<3;i++){const leg=new THREE.Mesh(new THREE.CylinderGeometry(.04,.07,.65,6),metal);leg.rotation.z=.6;leg.rotation.y=i*Math.PI*2/3;leg.position.set(Math.cos(i*Math.PI*2/3)*.2,.25,Math.sin(i*Math.PI*2/3)*.2);group.add(leg);}
  const core=new THREE.Mesh(new THREE.OctahedronGeometry(.23),energy);core.position.y=.6;group.add(core);group.name=`trap-${id}`;return group;
}
