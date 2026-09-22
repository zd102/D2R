import { loftGeometry as contourGeometry, sculptedTorso } from './sculpted-surfaces.ts';
import * as THREE from 'three';
import type { Actor } from './world.ts';
import { createMonsterActor } from './monster-models.ts';
import { MONSTERS } from './bestiary.ts';
import { createHeroActor } from './hero-models.ts';
import { actorMaterial, mergeActorParts, organicGeometry, plateGeometry } from './actor-modeling.ts';

export function createBeastActor(bear=false,upright=false):Actor {
  const group=new THREE.Group(),body=new THREE.Group();group.add(body);
  const fur=actorMaterial(bear?0x644333:0x92918a,'fur'),dark=actorMaterial(0x292522,'leather'),eye=actorMaterial(0xe3c273,'bronze');
  const sphere=organicGeometry('fur'),cone=new THREE.ConeGeometry(1,1,7);
  const part=(p:THREE.Object3D,mat:THREE.Material,x:number,y:number,z:number,sx:number,sy:number,sz:number,geo:THREE.BufferGeometry=sphere)=>{const mesh=new THREE.Mesh(geo,mat);mesh.position.set(x,y,z);mesh.scale.set(sx,sy,sz);mesh.castShadow=true;p.add(mesh);return mesh;};
  const bulk=bear?1.3:1;
  part(body,fur,0,upright?1:.65,0,.34*bulk,upright?.67:.36,.62*bulk);
  const head=new THREE.Group();head.position.set(0,upright?1.65:.92,upright?.2:.53);body.add(head);
  part(head,fur,0,0,0,.25*bulk,.25,.29);part(head,fur,0,-.07,.27,.14*bulk,.12,.28);part(head,dark,0,-.025,.48,.10,.07,.07);
  for(const side of [-1,1]){part(head,fur,side*.18,.23,-.04,bear?.1:.11,bear?.1:.28,.09,bear?sphere:cone);part(head,eye,side*.14,.065,.23,.028,.018,.025);}
  for(const side of [-1,1]) {
    part(head,dark,side*.14,.067,.236,.035,.024,.016);part(head,eye,side*.14,.067,.250,.012,.009,.008);
    part(head,dark,side*.083,-.124,.37,.085,.012,.13);
    for(let tuft=0;tuft<5;tuft++) {
      const lock=part(head,fur,side*(.19+tuft*.012),-.06-tuft*.032,-.08,.05,.15,.07,cone);
      lock.rotation.z=Math.PI+side*.45;
    }
  }
  // Shoulder blades and a tapered chest replace the toy-like uniform barrel.
  part(body,fur,0,upright?1.15:.72,.29,.30*bulk,.38,.36);
  const legs:THREE.Group[]=[];
  for(let i=0;i<4;i++){const side=i%2?1:-1,front=i<2,limb=new THREE.Group();body.add(limb);limb.position.set(side*(upright&&front?.32:.25)*bulk,upright&&front?1.33:.52,front?(upright?.1:.37):-.38);legs.push(limb);
    part(body,fur,limb.position.x,limb.position.y,limb.position.z,.15*bulk,.17,.16);
    const leg=contourGeometry([[-.43,.063,.07,.055],[-.30,.075,.075,-.025],[-.16,.10,.12,-.04],[0,.13,.13]],12);
    part(limb,fur,0,0,0,bulk,upright&&front?1.2:1,1,leg);
    part(limb,dark,0,-(upright&&front?.5:.43),.07,.12*bulk,.075,.2);for(let claw=0;claw<3;claw++)part(limb,eye,(claw-1)*.06,-(upright&&front?.5:.44),.24,.02,.07,.02,cone).rotation.x=Math.PI/2;}
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
  const group=new THREE.Group(),material=actorMaterial(id==='fireGolem'?0xa44322:id==='ironGolem'?0x828988:id==='bloodGolem'?0x7d3936:id==='raven'?0x252b31:0x796950,id==='ironGolem'?'steel':id==='bloodGolem'?'hide':id==='raven'?'fur':'stone'),glow=new THREE.MeshStandardMaterial({color:0xa9c578,emissive:0x36532a});
  if(id==='fireGolem'){material.emissive.setHex(0xb52b08);material.emissiveIntensity=.35;glow.color.setHex(0xffc76c);glow.emissive.setHex(0xf47419);}
  const sphere=organicGeometry(id.includes('Golem')?'stone':'muscle'),limbs=[new THREE.Group(),new THREE.Group(),new THREE.Group(),new THREE.Group()];limbs.forEach(l=>group.add(l));
  const ball=(p:THREE.Object3D,x:number,y:number,z:number,sx:number,sy:number,sz:number,mat:THREE.Material=material)=>{const m=new THREE.Mesh(sphere,mat);m.position.set(x,y,z);m.scale.set(sx,sy,sz);m.castShadow=true;p.add(m);return m;};
  if(id==='raven'){
    ball(group,0,1.6,0,.12,.14,.3);ball(group,0,1.7,.28,.10,.11,.12);
    const beak=new THREE.Mesh(new THREE.ConeGeometry(.047,.19,6),material);beak.position.set(0,1.69,.43);beak.rotation.x=Math.PI/2;group.add(beak);
    for(const side of [-1,1])ball(group,side*.077,1.73,.34,.015,.013,.012,glow);
    for(const [i,side] of [-1,1].entries()){
      limbs[i].position.set(side*.08,1.65,0);ball(limbs[i],side*.2,0,0,.27,.035,.15);
      for(let feather=0;feather<7;feather++) {
        const mesh=new THREE.Mesh(plateGeometry([[-.025,.06],[.028,.06],[.023,-.19],[0,-.28],[-.02,-.20]],.008,.003),material);
        mesh.position.set(side*(.16+feather*.044),0,-.03-feather*.026);mesh.rotation.set(-Math.PI/2,0,-side*(.3+feather*.07));limbs[i].add(mesh);
      }
    }group.userData.untargetable=true;
  }else if(['oakSage','heartOfWolverine','spiritOfBarbs'].includes(id)){
    glow.color.setHex(id==='heartOfWolverine'?0xdd9251:id==='spiritOfBarbs'?0xc6ae76:0xb6d08b);
    ball(group,0,.9,0,.18,.25,.18,glow);
    for(let i=0;i<7;i++) {
      const a=i*Math.PI*2/7,curve=new THREE.CatmullRomCurve3([
        new THREE.Vector3(Math.cos(a)*.1,.35,Math.sin(a)*.1),new THREE.Vector3(Math.cos(a+.3)*.29,.78,Math.sin(a+.3)*.29),new THREE.Vector3(Math.cos(a)*.22,1.2,Math.sin(a)*.22),new THREE.Vector3(Math.cos(a-.4)*.06,1.48,Math.sin(a-.4)*.06)]);
      const branch=new THREE.Mesh(new THREE.TubeGeometry(curve,12,.022,5,false),glow);group.add(branch);
    }
    for(const side of [-1,1])ball(group,side*.064,.95,.16,.035,.024,.014,material);
  }else if(['plaguePoppy','carrionVine','solarCreeper'].includes(id)){
    const points=Array.from({length:9},(_,i)=>new THREE.Vector3(Math.sin(i*.8)*.3,.07+i*.067,(i-4)*.12));
    const vine=new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),32,.065,8,false),material);vine.castShadow=true;group.add(vine);
    for(let i=1;i<8;i++) {
      const thorn=new THREE.Mesh(new THREE.ConeGeometry(.027,.15,5),material);thorn.position.copy(points[i]);thorn.rotation.z=i%2?.8:-.8;group.add(thorn);
    }
    ball(group,Math.sin(6.4)*.3,.63,.48,.15,.10,.18,glow);
    ball(group,Math.sin(6.4)*.3,.66,.61,.10,.035,.04,material);
  }else{
    const torso=new THREE.Mesh(sculptedTorso([[.46,.25,.22],[.67,.29,.25],[.95,.34,.28],[1.20,.45,.30],[1.39,.30,.23]],.065),material);torso.castShadow=true;group.add(torso);
    ball(group,0,1.52,.05,.20,.24,.20);
    for(const side of [-1,1]) {
      if(id==='ironGolem') {
        const plate=new THREE.Mesh(plateGeometry([[-.18,-.1],[.15,-.1],[.23,.08],[0,.19],[-.23,.08]],.055,.014),material);plate.position.set(side*.40,1.32,.09);plate.rotation.y=side*.5;group.add(plate);
      }
    }
    for(const [i,side] of [-1,1].entries()){limbs[i].position.set(side*.46,1.21,0);ball(limbs[i],0,-.32,0,.17,.4,.18);ball(limbs[i],0,-.65,.1,.19,.16,.22);limbs[i+2].position.set(side*.23,.49,0);ball(limbs[i+2],0,-.19,0,.19,.3,.22);ball(group,side*.075,1.58,.25,.035,.023,.02,glow);}
  }
  mergeActorParts(group);
  return {group,leftArm:limbs[0],rightArm:limbs[1],leftLeg:limbs[2],rightLeg:limbs[3],kind:id,animate(time,moving,attacking){if(id==='raven'){limbs[0].rotation.z=Math.sin(time*14)*.6;limbs[1].rotation.z=-Math.sin(time*14)*.6;}else{for(let i=0;i<4;i++)limbs[i].rotation.x=moving?Math.sin(time*6+i*Math.PI)*.3:attacking&&i<2?-.8:0;}}};
}
export function trapModel(id:string){
  const group=new THREE.Group(),metal=actorMaterial(0x68645a,'steel'),energy=new THREE.MeshStandardMaterial({color:/Fire|Inferno/.test(id)?0xf18b36:0x99cde4,emissive:/Fire|Inferno/.test(id)?0x6a2707:0x194c76});
  for(let i=0;i<3;i++){const leg=new THREE.Mesh(new THREE.CylinderGeometry(.04,.07,.65,6),metal);leg.rotation.z=.6;leg.rotation.y=i*Math.PI*2/3;leg.position.set(Math.cos(i*Math.PI*2/3)*.2,.25,Math.sin(i*Math.PI*2/3)*.2);group.add(leg);}
  const core=new THREE.Mesh(new THREE.OctahedronGeometry(.16),energy);core.position.y=.6;group.add(core);
  const housing=new THREE.Mesh(contourGeometry([[.32,.23,.23],[.38,.27,.27],[.56,.19,.19],[.68,.12,.12]],12),metal);group.add(housing);
  for(const y of [.38,.55]){const ring=new THREE.Mesh(new THREE.TorusGeometry(y===.38?.25:.20,.023,6,20),metal);ring.position.y=y;ring.rotation.x=Math.PI/2;group.add(ring);}
  const barrel=new THREE.Mesh(new THREE.CylinderGeometry(.075,.095,.32,10,1,true),metal);barrel.rotation.x=Math.PI/2;barrel.position.set(0,.56,.24);group.add(barrel);
  group.traverse(node=>{if(node instanceof THREE.Mesh)node.castShadow=node.receiveShadow=true;});mergeActorParts(group);group.name=`trap-${id}`;return group;
}
