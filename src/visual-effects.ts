import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { DamageType } from './paladin.ts';

export const EFFECT_COLORS:Record<DamageType,number>={physical:0xcab58e,fire:0xff722d,cold:0x9bd5ed,lightning:0xd8dcff,poison:0x789b42,magic:0xf0dba7};
const callbacks=new WeakMap<THREE.Object3D,(time:number,fade:number)=>void>();
const hash=(n:number)=>{const value=Math.sin(n*127.1+311.7)*43758.5453;return value-Math.floor(value);};
const basic=(color:number,opacity=1,additive=false)=>{
  const material=new THREE.MeshBasicMaterial({color,transparent:opacity<1||additive,opacity,depthWrite:!(opacity<1||additive),side:THREE.DoubleSide,blending:additive?THREE.AdditiveBlending:THREE.NormalBlending});
  material.userData.fxOpacity=opacity;return material;
};
const vertex=`varying vec2 vUv; void main(){vUv=uv;vec4 p=vec4(position,1.0);
  #ifdef USE_INSTANCING
  p=instanceMatrix*p;
  #endif
  gl_Position=projectionMatrix*modelViewMatrix*p;}`;
function energyMaterial(color:number,flame=false,opacity=.75,mist=false) {
  const material=new THREE.ShaderMaterial({uniforms:{effectTime:{value:0},effectFade:{value:opacity},tint:{value:new THREE.Color(color)}},vertexShader:vertex,
    fragmentShader:`varying vec2 vUv;uniform float effectTime;uniform float effectFade;uniform vec3 tint;
    void main(){vec2 uv=vUv;float a;vec3 color=tint;
    ${flame?`float wave=sin(uv.y*15.0-effectTime*9.0)*.07+sin(uv.y*28.0+effectTime*6.0)*.025;
      float width=(1.0-uv.y)*.44;float edge=abs(uv.x-.5+wave*uv.y);
      a=(1.0-smoothstep(width*.25,width,edge))*smoothstep(0.0,.12,uv.y)*pow(1.0-uv.y,.65);
      color=mix(tint,vec3(1.0,.88,.48),pow(1.0-uv.y,3.0)*.7);`:
    mist?`float d=length((uv-.5)*2.0);float cloud=sin(uv.x*17.0+effectTime)*sin(uv.y*13.0-effectTime*.7);a=pow(max(0.0,1.0-d),1.1)*(.75+cloud*.25);color=tint*(.6+cloud*.13);`:
    `float d=length((uv-.5)*2.0);a=pow(max(0.0,1.0-d),2.5);color=mix(tint,vec3(1.0),a*.45);`}
    gl_FragColor=vec4(color,a*effectFade);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    }`,transparent:true,depthWrite:false,side:THREE.DoubleSide,blending:mist?THREE.NormalBlending:THREE.AdditiveBlending,toneMapped:false});
  material.userData.fxOpacity=opacity;return material;
}
export function updateVisual(root:THREE.Object3D,time:number,fade=1) {
  root.traverse(node=>{
    if(node instanceof THREE.Mesh||node instanceof THREE.Points||node instanceof THREE.Line){
      for(const material of Array.isArray(node.material)?node.material:[node.material]){
        if(material instanceof THREE.ShaderMaterial&&material.uniforms.effectTime){material.uniforms.effectTime.value=time;material.uniforms.effectFade.value=fade*(material.userData.fxOpacity??1);}
        else if(material.userData.fxOpacity!==undefined)material.opacity=material.userData.fxOpacity*fade;
      }
    }
  });
  callbacks.get(root)?.(time,fade);
}
export function disposeVisual(root:THREE.Object3D) {
  root.removeFromParent();const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>();
  root.traverse(node=>{if(node instanceof THREE.Mesh||node instanceof THREE.Points||node instanceof THREE.Line){geometries.add(node.geometry);for(const material of Array.isArray(node.material)?node.material:[node.material])materials.add(material);}if(node instanceof THREE.InstancedMesh)node.dispose();});
  geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());callbacks.delete(root);
}

// One draw call for an entire impact, without per-spark meshes or frame allocations.
export function createImpact(origin:THREE.Vector3,color:number,count:number) {
  count=Math.max(1,Math.min(48,Math.floor(count)));
  const geometry=new THREE.BufferGeometry(),positions=new Float32Array(count*3),velocities=new Float32Array(count*3),sizes=new Float32Array(count);
  for(let i=0;i<count;i++){const angle=hash(i+count)*Math.PI*2,speed=.6+hash(i*3+19)*2.8;velocities.set([Math.cos(angle)*speed,.6+hash(i+4)*2.8,Math.sin(angle)*speed],i*3);sizes[i]=3+hash(i+31)*5;}
  geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));geometry.setAttribute('velocity',new THREE.BufferAttribute(velocities,3));geometry.setAttribute('sparkSize',new THREE.BufferAttribute(sizes,1));
  const material=new THREE.ShaderMaterial({uniforms:{effectTime:{value:0},effectFade:{value:1},tint:{value:new THREE.Color(color)}},
    vertexShader:`attribute vec3 velocity;attribute float sparkSize;uniform float effectTime;varying float vLife;void main(){float t=effectTime;
      vec3 p=position+velocity*t;p.y-=2.8*t*t;vec4 view=modelViewMatrix*vec4(p,1.0);gl_Position=projectionMatrix*view;
      gl_PointSize=sparkSize;vLife=max(0.0,1.0-t/0.8);}`,
    fragmentShader:`uniform vec3 tint;uniform float effectFade;varying float vLife;void main(){float d=length(gl_PointCoord-.5)*2.0;float a=pow(max(0.0,1.0-d),1.8)*vLife*effectFade;gl_FragColor=vec4(mix(tint,vec3(1.0,.94,.8),a*.4),a);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false});
  const mesh=new THREE.Points(geometry,material);mesh.position.copy(origin);mesh.frustumCulled=false;mesh.name='impact-sparks';
  return {mesh,duration:.8};
}

export function createLightning(from:THREE.Vector3,to:THREE.Vector3,color=EFFECT_COLORS.lightning) {
  const length=from.distanceTo(to),direction=to.clone().sub(from).normalize(),side=new THREE.Vector3().crossVectors(direction,new THREE.Vector3(0,1,0));
  if(side.lengthSq()<.01)side.set(1,0,0);side.normalize();const other=new THREE.Vector3().crossVectors(direction,side).normalize();
  const count=Math.max(2,Math.min(32,Math.ceil(length*2))),points:THREE.Vector3[]=[];
  for(let i=0;i<=count;i++){const point=from.clone().lerp(to,i/count);if(i&&i<count)point.addScaledVector(side,(hash(i+length)-.5)*.45).addScaledVector(other,(hash(i*4+length)-.5)*.22);points.push(point);}
  const geometry=new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points,false,'catmullrom',0),count*2,.025,5,false);
  const mesh=new THREE.Mesh(geometry,basic(color,.9,true));mesh.name='forked-lightning';
  const core=new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points,false,'catmullrom',0),count*2,.009,4,false),basic(0xfffcf0,1,true));mesh.add(core);
  if(length>2){const branches:THREE.BufferGeometry[]=[];for(const i of [Math.floor(count*.35),Math.floor(count*.65)]){const start=points[i],end=start.clone().addScaledVector(side,(i%2?1:-1)*Math.min(1,length*.2)).addScaledVector(direction,.55);branches.push(new THREE.TubeGeometry(new THREE.LineCurve3(start,end),1,.012,4,false));}
    const merged=mergeGeometries(branches);branches.forEach(g=>g.dispose());if(merged)mesh.add(new THREE.Mesh(merged,basic(color,.5,true)));
  }
  return mesh;
}

export type ProjectileLook='bolt'|'orb'|'arrow'|'javelin'|'knife'|'axe'|'hammer';
export function createProjectileVisual(type:DamageType,look:ProjectileLook='bolt',radius=.16) {
  if(look==='axe'||look==='knife') {
    // Spin the weapon inside its root so the projectile still follows its simulation direction.
    const mesh=new THREE.Mesh(new THREE.BufferGeometry(),basic(0xc8b389));mesh.name=`${type}-${look}`;
    const weapon=new THREE.Group();mesh.add(weapon);
    const grip=new THREE.Mesh(new THREE.CylinderGeometry(.025,.035,look==='axe'?.40:.16,7),basic(0x785337));grip.position.y=-.12;weapon.add(grip);
    if(look==='axe') {
      const shape=new THREE.Shape();shape.moveTo(-.015,.02);shape.lineTo(.08,.23);shape.lineTo(.27,.18);shape.quadraticCurveTo(.32,.07,.27,-.08);shape.lineTo(.06,-.04);shape.closePath();
      const edge=new THREE.Mesh(new THREE.ExtrudeGeometry(shape,{depth:.045,bevelEnabled:false}),basic(0xb8c1c4));edge.position.z=-.0225;weapon.add(edge);
    } else {
      const edge=new THREE.Mesh(new THREE.ConeGeometry(.06,.40,4),basic(0xd3d9d8));edge.scale.z=.3;edge.position.y=.13;weapon.add(edge);
      const guard=new THREE.Mesh(new THREE.BoxGeometry(.13,.035,.035),basic(0xa99b77));guard.position.y=-.07;weapon.add(guard);
    }
    callbacks.set(mesh,time=>{weapon.rotation.z=-time*(look==='axe'?18:24);});return mesh;
  }
  const physical=look==='arrow'||look==='javelin',hammer=look==='hammer';
  const material=basic(physical?0xc8b389:type==='fire'?0xffd477:EFFECT_COLORS[type]);
  const geometry=physical?new THREE.CylinderGeometry(.018,.025,look==='javelin'?1.15:.72,6):hammer?new THREE.BoxGeometry(.42,.18,.20):type==='cold'?new THREE.OctahedronGeometry(radius,0):new THREE.IcosahedronGeometry(radius,1);
  const mesh=new THREE.Mesh(geometry,material);mesh.name=`${type}-${look}`;
  if(physical){const tip=new THREE.Mesh(new THREE.ConeGeometry(.055,.19,5),basic(0xd7d9d5));tip.position.y=look==='javelin'?.64:.43;mesh.add(tip);
    const feathers=new THREE.Mesh(new THREE.BoxGeometry(.11,.12,.018),basic(0xd3c8ae));feathers.position.y=-.29;mesh.add(feathers);
    if(type==='physical')return mesh;
  }
  if(hammer){const handle=new THREE.Mesh(new THREE.CylinderGeometry(.025,.035,.45,8),basic(0xb89658));handle.position.y=-.23;mesh.add(handle);}
  else if(type==='cold'&&look!=='orb'&&!physical)mesh.scale.set(.65,1.65,.65);
  const glow=new THREE.Mesh(new THREE.PlaneGeometry(radius*6,radius*6),energyMaterial(EFFECT_COLORS[type]));glow.name='projectile-glow';mesh.add(glow);
  if(look==='orb'){
    const orbit=new THREE.Group();mesh.add(orbit);const frost=basic(0xe7f6ff,.65,true),shards:THREE.BufferGeometry[]=[];
    for(let i=0;i<8;i++){const shard=new THREE.OctahedronGeometry(radius*.2);const a=i*Math.PI/4;shard.scale(1,2,1);shard.translate(Math.cos(a)*radius*1.3,Math.sin(a)*radius*1.3,(i%2-.5)*radius);shards.push(shard);}
    const merged=mergeGeometries(shards);shards.forEach(g=>g.dispose());if(merged)orbit.add(new THREE.Mesh(merged,frost));
    callbacks.set(mesh,time=>{orbit.rotation.z=time*2;orbit.rotation.y=time;glow.rotation.z=-time*.4;});
  } else if(type==='lightning') {
    const arc=createLightning(new THREE.Vector3(0,-.7,0),new THREE.Vector3(0,.35,0));mesh.add(arc);
    callbacks.set(mesh,time=>{arc.rotation.y=Math.sin(time*35)*.55;});
  } else if(!hammer) {
    const tail=new THREE.Mesh(new THREE.PlaneGeometry(radius*4,radius*8),energyMaterial(EFFECT_COLORS[type],type==='fire'));tail.position.y=-radius*2;tail.rotation.z=Math.PI;mesh.add(tail);
    callbacks.set(mesh,time=>{tail.scale.x=1+Math.sin(time*28)*.12;glow.rotation.z=time*.8;});
  }
  return mesh;
}

export function createNova(radius:number,type:DamageType) {
  const mesh=new THREE.Mesh(new THREE.RingGeometry(radius*.90,radius,64),basic(EFFECT_COLORS[type],.65,true));mesh.rotation.x=-Math.PI/2;mesh.name=`${type}-nova`;
  const teeth:THREE.BufferGeometry[]=[];
  for(let i=0;i<32;i++){const angle=i*Math.PI/16;const geometry=type==='cold'?new THREE.ConeGeometry(.055,.35,4):new THREE.BoxGeometry(.022,.23,.015);geometry.rotateZ(-angle);geometry.translate(Math.sin(angle)*radius*.94,Math.cos(angle)*radius*.94,.05);teeth.push(geometry);}
  const merged=mergeGeometries(teeth);teeth.forEach(g=>g.dispose());if(merged)mesh.add(new THREE.Mesh(merged,basic(type==='cold'?0xe8faff:EFFECT_COLORS[type],.8,true)));
  callbacks.set(mesh,(time)=>{mesh.scale.setScalar(Math.min(1,.12+time/.35*.88));});return mesh;
}

// Ground decoration stays inside its damage footprint. Instancing gives fire
// walls, blizzards and poison clouds one additional draw each, not one per wisp.
export function decorateGround(mesh:THREE.Mesh,type:DamageType,radius:number,kind='pool',length=radius*2) {
  const fire=type==='fire',ice=type==='cold',line=['line','wall','inferno','fireWall'].includes(kind);
  if(!fire&&!ice&&type!=='poison')return;
  const old=mesh.material;mesh.material=new THREE.ShaderMaterial({uniforms:{effectTime:{value:0},effectFade:{value:1},tint:{value:new THREE.Color(EFFECT_COLORS[type])}},vertexShader:vertex,
    fragmentShader:`varying vec2 vUv;uniform vec3 tint;uniform float effectTime;uniform float effectFade;void main(){vec2 p=(vUv-.5)*2.0;
      float edge=${line?'max(abs(p.x),abs(p.y))':'length(p)'};float grain=sin(p.x*18.0+effectTime*.4)*sin(p.y*21.0-effectTime*.3);
      float opacity=(1.0-smoothstep(.65,1.0,edge))*(.11+grain*.04);gl_FragColor=vec4(tint,opacity*effectFade);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,transparent:true,depthWrite:false,side:THREE.DoubleSide});
  for(const material of Array.isArray(old)?old:[old])material.dispose();
  const count=Math.min(32,Math.max(8,Math.round(line?length*4:radius*7))),geometry=ice?new THREE.OctahedronGeometry(.11):new THREE.PlaneGeometry(1,1);
  const material=ice?basic(0xc2eafa,.8,true):energyMaterial(EFFECT_COLORS[type],fire,fire?.7:.45,!fire);
  const wisps=new THREE.InstancedMesh(geometry,material,count);wisps.instanceMatrix.setUsage(THREE.DynamicDrawUsage);wisps.frustumCulled=false;wisps.name=`${type}-field-particles`;mesh.add(wisps);
  const dummy=new THREE.Object3D(),positions=Array.from({length:count},(_,i)=>{
    const a=hash(i+5)*Math.PI*2,r=Math.sqrt(hash(i+20))*radius*.8;
    return line?{x:(kind==='wall'||kind==='fireWall'?i/(count-1)-.5:hash(i+17)-.5)*(kind==='wall'||kind==='fireWall'?length:radius*1.3),y:(kind==='wall'||kind==='fireWall'?hash(i+5)-.5:i/(count-1)-.5)*(kind==='wall'||kind==='fireWall'?radius*1.3:length)}:{x:Math.cos(a)*r,y:Math.sin(a)*r};
  });
  const update=(time:number,fade:number)=>{
    for(let i=0;i<count;i++){
      const p=positions[i],phase=(time*(ice?1.1:.55)+hash(i+9))%1,height=ice?(1-phase)*3:fire?.30+hash(i+9)*.35:.15+phase*.7;
      dummy.position.set(p.x,p.y,height);dummy.rotation.set(ice?0:Math.PI/2,ice?time+i:i%2*Math.PI/2,0);
      const size=ice?1:fire?.6+hash(i+18)*.5:.7+phase*.6;dummy.scale.set(size,ice?2.4:fire?size*1.7:size,1);dummy.updateMatrix();wisps.setMatrixAt(i,dummy.matrix);
    }
    wisps.instanceMatrix.needsUpdate=true;wisps.visible=fade>0;
  };
  callbacks.set(mesh,update);update(0,1);
}

export function createMeteor(point:THREE.Vector3) {
  const mesh=new THREE.Mesh(new THREE.IcosahedronGeometry(.55,1),new THREE.MeshStandardMaterial({color:0x3c241c,emissive:0xde4311,emissiveIntensity:.75,roughness:1}));
  mesh.position.copy(point).setY(8);mesh.name='falling-meteor';
  const tail=new THREE.Mesh(new THREE.PlaneGeometry(1.8,4),energyMaterial(0xff7430,true));tail.position.y=1.3;mesh.add(tail);
  callbacks.set(mesh,time=>{mesh.position.y=Math.max(.35,8*(1-Math.min(1,time/.95)**2));mesh.rotation.y=time*2;});return mesh;
}

export function decorateAura(mesh:THREE.Mesh) {
  const runes:THREE.BufferGeometry[]=[];
  for(let i=0;i<12;i++){const a=i*Math.PI/6;for(const [r,w,h] of [[1.1,.022,.14],[1.17,.12,.022]]){const geo=new THREE.PlaneGeometry(w,h);geo.rotateZ(-a);geo.translate(Math.sin(a)*r,Math.cos(a)*r,.005);runes.push(geo);}}
  const merged=mergeGeometries(runes);runes.forEach(g=>g.dispose());if(merged)mesh.add(new THREE.Mesh(merged,mesh.material));
}

export function createHeroWards() {
  const group=new THREE.Group();group.name='hero-wards';
  const frost=new THREE.Group();frost.name='ward-frost';frost.visible=false;group.add(frost);
  const shell=new THREE.Mesh(new THREE.IcosahedronGeometry(.65,1),basic(0x90c8e8,.065,true));shell.position.y=1; shell.scale.set(.7,1.4,.65);frost.add(shell);
  const crystals=new THREE.Mesh(new THREE.TorusGeometry(.49,.018,4,6),basic(0xc9eeff,.45,true));crystals.position.y=.85;crystals.rotation.x=Math.PI/2;frost.add(crystals);
  const energy=new THREE.Group();energy.name='ward-energy';energy.visible=false;energy.position.y=2.02;group.add(energy);
  energy.add(new THREE.Mesh(new THREE.IcosahedronGeometry(.105,1),basic(0xf1c985,.55,true)));
  const halo=new THREE.Mesh(new THREE.PlaneGeometry(.65,.65),energyMaterial(0xe5b76b,false,.5));halo.rotation.x=-Math.PI/4;energy.add(halo);
  const enchant=new THREE.Group();enchant.name='ward-enchant';enchant.visible=false;group.add(enchant);
  const flame=new THREE.Mesh(new THREE.PlaneGeometry(.16,.7),energyMaterial(EFFECT_COLORS.fire,true,.45));flame.position.set(.3,.64,.22);enchant.add(flame);
  return group;
}
export function updateHeroWards(group:THREE.Group,buffs:Partial<Record<string,unknown>>,time:number) {
  const frost=group.getObjectByName('ward-frost'),energy=group.getObjectByName('ward-energy'),enchant=group.getObjectByName('ward-enchant');
  if(frost){frost.visible=!!(buffs.frozenArmor||buffs.shiverArmor||buffs.chillingArmor);frost.rotation.y=time*.25;}
  if(energy){energy.visible=!!buffs.energyShield;energy.position.y=2.02+Math.sin(time*2)*.035;}
  if(enchant)enchant.visible=!!buffs.enchant;
  const root=group.getObjectByName('hero-wards');if(root)updateVisual(root,time);
}
