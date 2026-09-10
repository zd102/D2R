import * as THREE from 'three';
import PF from 'pathfinding';
import { FIELD_BOUND, type Level, type MapPoint } from './campaign.ts';
import { distanceToSegment, layoutWalkable, type LevelLayout } from './level-layouts.ts';
import { sceneDesign, type SceneryProp } from './scene-design.ts';
import { sceneryRandom, sceneryTexture, sceneryDecal } from './scenery-textures.ts';

type SceneHost = {
  level: Level; layout: LevelLayout; scene: THREE.Scene; staticGroup: THREE.Group; ground: THREE.Mesh; grid: PF.Grid; floorCells: MapPoint[];
  addCollider(x: number, z: number, width: number, depth: number): void;
  torch(x: number, z: number, y: number, light?: boolean): void;
};

export function buildLevelScenery(world: SceneHost) {
  const level = world.level, design = sceneDesign(level), palette = design.palette, layout = world.layout;
  const random = sceneryRandom(3817 + level.index * 793 + layout.seed), root = world.staticGroup;
  const geometry = {
    box: new THREE.BoxGeometry(1,1,1), column: new THREE.CylinderGeometry(1,1,1,10), cone: new THREE.ConeGeometry(1,1,7),
    rock: new THREE.SphereGeometry(1,9,7), orb: new THREE.SphereGeometry(1,12,8), ring: new THREE.TorusGeometry(1,.018,5,64),
    crystal: new THREE.OctahedronGeometry(1,0), plane: new THREE.PlaneGeometry(1,1),
  };
  const rockVertices=geometry.rock.attributes.position;
  for(let i=0;i<rockVertices.count;i++){const x=rockVertices.getX(i),y=rockVertices.getY(i),z=rockVertices.getZ(i),r=1+.13*Math.sin(x*17+y*13+z*9)+.07*Math.cos(x*7-z*11);rockVertices.setXYZ(i,x*r,y*r,z*r);}
  geometry.rock.computeVertexNormals();
  const floorMap = sceneryTexture(design.surface, 600 + level.index), wallMap = sceneryTexture('wall', 900 + level.act);
  const material = (color: number, roughness = .9, metalness = 0) => new THREE.MeshStandardMaterial({ color, roughness, metalness });
  const stone = material(palette.wall), dark = material(palette.dark), trim = material(palette.trim,.55,.35), wood = material(palette.wood);
  const rockMap=sceneryTexture('earth',410+level.index),barkMap=sceneryTexture('bark',780);
  stone.map=rockMap;stone.bumpMap=rockMap;stone.bumpScale=.16;wood.map=barkMap;wood.bumpMap=barkMap;wood.bumpScale=.08;
  const foliage = material(palette.foliage), bone = material(level.act === 4 ? 0xa5b6bd : 0xa8a08a), iron = material(0x403e3d,.55,.65);
  const wall = new THREE.MeshStandardMaterial({ color: palette.wall, map: wallMap, bumpMap: wallMap, bumpScale: .14, roughness: .95 });
  const floor = new THREE.MeshStandardMaterial({ color: palette.floor, map: floorMap, bumpMap: floorMap, bumpScale: design.surface === 'ice' ? .035 : .085, roughness: ['mud','ice'].includes(design.surface) ? .42 : .95, vertexColors: true });
  const glow = new THREE.MeshBasicMaterial({ color: design.landmark === 'catacombs' ? 0x91be49 : design.landmark === 'frozen-river' ? 0x97def5 : level.act === 3 ? 0xf3a253 : palette.trim });
  const red = material(level.act === 4 ? 0x9b3e55 : 0x682b2b), ice = material(level.index === 24 ? 0xb94965 : 0x74b9d0,.25,.2);
  const leafMap=sceneryDecal('leaves'),webMap=sceneryDecal('web');
  const leaves=new THREE.MeshStandardMaterial({color:palette.foliage,map:leafMap,alphaTest:.25,side:THREE.DoubleSide,roughness:.85});
  const silk=new THREE.MeshBasicMaterial({color:0xd8dfcc,map:webMap,transparent:true,opacity:.5,depthWrite:false,side:THREE.DoubleSide});
  const stainMap=sceneryDecal(level.act===3||design.landmark==='durance'?'blood':'dirt',711+level.index);
  const stain=new THREE.MeshBasicMaterial({map:stainMap,transparent:true,depthWrite:false,opacity:.75});
  const engravingMap=sceneryDecal('runes'),engraving=new THREE.MeshBasicMaterial({map:engravingMap,color:palette.trim,transparent:true,opacity:.65,depthWrite:false});
  const daisMaterial=new THREE.MeshStandardMaterial({color:palette.floor,map:floorMap,bumpMap:floorMap,bumpScale:.045,roughness:.9});
  const materials = [stone,dark,trim,wood,foliage,bone,iron,wall,floor,glow,red,ice,leaves,silk,stain,engraving,daisMaterial];
  const mesh = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1, angle = 0) => {
    const object = new THREE.Mesh(geo,mat); object.position.set(x,y,z); object.scale.set(sx,sy,sz); object.rotation.y = angle;
    object.castShadow = object.receiveShadow = true; root.add(object); return object;
  };
  const box = (mat: THREE.Material,x: number,y: number,z: number,w: number,h: number,d: number,angle = 0) => mesh(geometry.box,mat,x,y,z,w,h,d,angle);
  const beam = (mat: THREE.Material,a: number[],b: number[],radius = .07) => {
    const start = new THREE.Vector3(a[0],a[1],a[2]), end = new THREE.Vector3(b[0],b[1],b[2]);
    const object = mesh(geometry.column,mat,0,0,0,radius,start.distanceTo(end),radius);
    object.position.copy(start).add(end).multiplyScalar(.5); object.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),end.sub(start).normalize()); return object;
  };
  const ring = (x: number,y: number,z: number,r: number,mat = trim) => { const object = mesh(geometry.ring,mat,x,y,z,r,r,r); object.rotation.x = -Math.PI/2; return object; };
  const decal = (mat: THREE.Material,x: number,z: number,size: number,y = .084) => {const object=mesh(geometry.plane,mat,x,y,z,size,size,1);object.rotation.set(-Math.PI/2,0,random()*6);object.castShadow=false;return object;};
  const solid = (x: number,z: number,w: number,d: number) => {
    if(world.floorCells.some(p=>Math.abs(p.x-x)<w/2+.5&&Math.abs(p.z-z)<d/2+.5))world.addCollider(x,z,w,d);
  };
  const pylon = (x: number,z: number,h = 3.8, ornate = true) => {
    box(stone,x,.18,z,1.25,.36,1.25); box(wall,x,h/2,z,.7,h,.7);
    for (const y of [.5,h-.3]) box(trim,x,y,z,.94,.17,.94);
    if (ornate) { mesh(geometry.cone,trim,x,h+.25,z,.65,.75,.65); box(dark,x,h*.56,z+.361,.2,h*.42,.025); }
    solid(x,z,1.25,1.25);
  };
  const arch = (x: number,z: number,width = 5.2,h = 4.1) => {
    pylon(x-width/2,z,h,false); pylon(x+width/2,z,h,false);
    for (let i = 0; i < 7; i++) {
      const a = i*Math.PI/6, object = box(wall,x+Math.cos(a)*width/2,h+Math.sin(a)*width*.3,z,.85,.8,.9);
      object.rotation.z = a-Math.PI/2;
    }
    box(trim,x,h+width*.3+.3,z,.65,.7,1.05);
  };
  const crystal = (x: number,z: number,h: number,mat = ice) => {
    mesh(geometry.crystal,mat,x,h*.48,z,h*.23,h*.66,h*.24,.4+random());
    mesh(geometry.crystal,mat,x+.6,h*.25,z+.3,h*.12,h*.33,h*.12,-.4);
    mesh(geometry.crystal,mat,x-.45,h*.2,z-.3,h*.12,h*.28,h*.15,.6);
    solid(x,z,h*.48,h*.48);
  };
  const prop = (kind: SceneryProp,x: number,z: number,scale = 1,angle = 0) => {
    // Geometry is placed outside navigation or inside a checked solid footprint.
    const h = (1.5+random())*scale;
    if (kind === 'crag') {
      mesh(geometry.rock,stone,x,h*.36,z,scale*1.2,h*.6,scale*.9,angle);
      mesh(geometry.rock,dark,x+.6*scale,.25,z+.4*scale,.55*scale,.5,.5*scale,angle+1);
      if (design.surface === 'snow') mesh(geometry.rock,bone,x,h*.76,z,.9*scale,.15,.7*scale,angle);
    } else if (kind === 'root' || kind === 'tree') {
      const tall = kind === 'tree' ? 1.65 : 1;
      beam(wood,[x,0,z],[x+.25*scale,h*tall,z+.1],.22*scale);
      for (let i = 0; i < 4; i++) {
        const a = angle+i*1.57, dx = Math.cos(a)*scale, dz = Math.sin(a)*scale;
        beam(wood,[x,.6,z],[x+dx*1.1,.04,z+dz],.09*scale);
        beam(wood,[x,h*.65*tall,z],[x+dx,h*tall,z+dz],.1*scale);
        if (kind === 'tree') {
          for(let leaf=0;leaf<3;leaf++) {
            const b=a+(leaf-1)*.45,card=mesh(geometry.plane,leaves,x+Math.cos(b)*1.2*scale,h*tall+(leaf-1)*.3,z+Math.sin(b)*1.2*scale,2.3*scale,3.3*scale,1,b);
            card.rotation.set(-Math.PI/2+.35,b,Math.sin(b)*.3);
          }
        }
      }
    } else if (kind === 'grave') {
      box(dark,x,.06,z+.3,.7*scale,.12,1.45*scale,angle);
      box(stone,x,.6*scale,z,.65*scale,1.2*scale,.25,angle);
      mesh(geometry.orb,stone,x,1.12*scale,z,.32*scale,.3*scale,.14,angle);
      box(dark,x,.67*scale,z+.14,.06,.5,.025); box(dark,x,.79*scale,z+.14,.3,.06,.025);
    } else if (kind === 'coffin') {
      box(dark,x,.2,z,1.2*scale,.4,2.3*scale,angle); box(stone,x,.55,z,scale,.5,2.1*scale,angle);
      box(trim,x,.84,z,1.25*scale,.12,2.35*scale,angle);
      const effigy = mesh(geometry.orb,bone,x,.96,z,.28,.15,.75,angle); effigy.rotation.y=angle;
    } else if (kind === 'ruin') {
      box(wall,x,1.15*scale,z,2.5*scale,2.3*scale,.55,angle);
      beam(wood,[x-1.4*scale,2.5*scale,z],[x,3.7*scale,z],.12); beam(wood,[x,3.7*scale,z],[x+1.4*scale,2.5*scale,z],.12);
      box(dark,x,1.2*scale,z+.29,.65*scale,1.1*scale,.03,angle);
      for (let i=0;i<3;i++) mesh(geometry.rock,stone,x+(random()-.5)*2,.15,z+.6+random(),.3,.3,.3);
    } else if (kind === 'pillar') pylon(x,z,3*scale);
    else if (kind === 'urn') {
      mesh(geometry.orb,stone,x,.48*scale,z,.37*scale,.5*scale,.37*scale);
      mesh(geometry.column,trim,x,.88*scale,z,.23*scale,.12,.23*scale); mesh(geometry.column,dark,x,.955*scale,z,.16*scale,.025,.16*scale);
    } else if (kind === 'egg') {
      for(let i=0;i<3;i++) { const dx=(i-1)*.42*scale; mesh(geometry.orb,foliage,x+dx,.42*scale,z+Math.abs(i-1)*.25,.32*scale,.55*scale,.35*scale); }
      for(let i=0;i<4;i++) beam(wood,[x-1,.05,z+i*.2],[x+1,.07,z+.7-i*.2],.025);
    } else if (kind === 'obelisk') {
      box(stone,x,.15,z,1.1*scale,.3,1.1*scale); box(wall,x,h*.55,z,.65*scale,h,.65*scale);
      mesh(geometry.cone,trim,x,h+.45,z,.48*scale,.9,.48*scale);
      for(let i=0;i<4;i++) box(trim,x,.6+i*.35,z+.334*scale,.16+i%2*.1,.07,.02);
    } else if (kind === 'web') {
      for(const side of [-1,1])beam(wood,[x+side*1.4*scale,0,z],[x+side*1.2*scale,2.5*scale,z],.06);
      const web=mesh(geometry.plane,silk,x,1.3*scale,z,2.6*scale,2.6*scale,1);web.castShadow=false;
    } else if (kind === 'hut') {
      box(wood,x,.7,z,1.7*scale,1.4,1.7*scale); mesh(geometry.cone,foliage,x,2,z,1.5*scale,1.7,1.5*scale);
      box(dark,x,.57,z+.87*scale,.65,1.05,.03);
    } else if (kind === 'totem' || kind === 'spike') {
      mesh(geometry.cone,kind==='spike'?dark:wood,x,h*.5,z,.25*scale,h,.25*scale);
      if(kind==='totem') for(let i=0;i<3;i++) { mesh(geometry.orb,bone,x,.8+i*.5,z+.1,.32,.24,.22); box(dark,x,.84+i*.5,z+.3,.28,.065,.025); }
      else beam(iron,[x-.6,h*.6,z],[x+.6,h*.6,z],.06);
    } else if (kind === 'bones') {
      mesh(geometry.orb,bone,x,.22,z,.24,.22,.29);
      for(let i=0;i<3;i++) beam(bone,[x-.55+i*.14,.1,z+.3],[x+.4,.13,z+.8-i*.18],.04);
    } else if (kind === 'barricade') {
      for(let i=-1;i<=1;i++) { beam(wood,[x+i*.55,0,z+.25],[x+i*.55,1.7*scale,z-.3],.13); mesh(geometry.cone,wood,x+i*.55,1.83*scale,z-.3,.14,.4,.14); }
      beam(wood,[x-1,.6,z],[x+1,.6,z],.1); beam(iron,[x-1,1.1,z],[x+1,1.1,z],.06);
    } else crystal(x,z,2.5*scale);
    if(!['web','bones','pillar','crystal'].includes(kind)) {
      const [w,d] = kind==='coffin'?[1.25,2.35]:kind==='ruin'?[2.6,.7]:kind==='hut'?[1.8,1.8]:kind==='barricade'?[2,.9]:kind==='egg'?[1.5,1]:kind==='crag'?[1.8,1.6]:kind==='root'||kind==='tree'?[.65,.65]:[.8,.8];
      solid(x,z,(Math.abs(Math.cos(angle))*w+Math.abs(Math.sin(angle))*d)*scale,(Math.abs(Math.sin(angle))*w+Math.abs(Math.cos(angle))*d)*scale);
    }
  };

  const walkable = (x: number,z: number) => layoutWalkable(layout,x,z);
  const offset = FIELD_BOUND + 1, size = offset * 2 + 1;
  const matrix = Array.from({length:size},(_,row)=>Array.from({length:size},(_,column)=>walkable(column-offset,row-offset)?0:1));
  for(let z=-FIELD_BOUND;z<=FIELD_BOUND;z++) for(let x=-FIELD_BOUND;x<=FIELD_BOUND;) {
    if(walkable(x,z)) { world.floorCells.push({x,z}); x++; continue; }
    const start=x; while(x<=FIELD_BOUND&&!walkable(x,z))x++;
    world.addCollider((start+x-1)/2,z,x-start,1);
  }
  world.grid = new PF.Grid(matrix);
  const occupied = new Set(world.floorCells.map(p=>`${p.x},${p.z}`));
  const onFloor = (x:number,z:number) => occupied.has(`${x},${z}`);
  const positions:number[]=[], normals:number[]=[], uvs:number[]=[], colors:number[]=[];
  const paved = ['flagstone','mosaic'].includes(design.surface);
  for(const {x,z} of world.floorCells) {
    const nearEdge = !onFloor(x-1,z)||!onFloor(x+1,z)||!onFloor(x,z-1)||!onFloor(x,z+1);
    const routeDistance = Math.min(...layout.connections.map(([a,b])=>distanceToSegment(x,z,a,b)));
    const shade = (nearEdge?.9:1)*(paved?.98:1+Math.exp(-routeDistance*routeDistance/3)*.035)+(random()-.5)*.018;
    for(const [dx,dz] of [[-.5,-.5],[-.5,.5],[.5,-.5],[.5,-.5],[-.5,.5],[.5,.5]]) {
      positions.push(x+dx,.075,z+dz); normals.push(0,1,0); uvs.push((x+dx)/4,(z+dz)/4); colors.push(shade,shade,shade);
    }
    if(design.edge==='void'&&nearEdge) box(dark,x,-.65,z,1,1.4,1);
  }
  const floorGeometry = new THREE.BufferGeometry();
  floorGeometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3)); floorGeometry.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));
  floorGeometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2)); floorGeometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  const terrain = new THREE.Mesh(floorGeometry,floor); terrain.receiveShadow=true; terrain.name='campaign-floor'; world.scene.add(terrain);
  world.ground.position.y = design.edge==='void'?-2.3:design.liquid?-.36:-.12;
  // Replace the old terrain texture and release it before it can be orphaned.
  const oldGround = world.ground.material as THREE.MeshStandardMaterial;
  const oldTextures=new Set([oldGround.map,oldGround.bumpMap]); oldTextures.forEach(texture=>texture?.dispose()); oldGround.dispose();
  const backdropMap=sceneryTexture(design.liquid==='lava'?'lava':design.liquid?'water':design.surface,1900+level.index); backdropMap.repeat.set(26,26);
  const backdrop = new THREE.MeshStandardMaterial({color:design.liquid?palette.liquid:palette.dark,map:backdropMap,roughness:design.liquid?.5:1,
    ...(design.liquid==='lava'?{emissive:palette.liquid,emissiveMap:backdropMap,emissiveIntensity:.6}:{}),});
  world.ground.material=backdrop;
  for(let x=-FIELD_BOUND;x<=FIELD_BOUND;x++) for(let z=-FIELD_BOUND;z<=FIELD_BOUND;z++) {
    if(onFloor(x,z))continue;
    const adjacent=[[-1,0],[1,0],[0,-1],[0,1]].filter(([dx,dz])=>onFloor(x+dx,z+dz));
    if(!adjacent.length)continue;
    if(design.edge==='wall') {
      const nearCamera = adjacent.some(([dx,dz])=>dx<0||dz<0), h=nearCamera?1.1:2.7;
      box(wall,x,h/2,z,1,h,1); box(stone,x,h+.07,z,1.05,.14,1.05);
      if((x+z)%5===0)box(trim,x,h*.55,z,1.025,.09,1.025);
    } else if(design.edge==='rock'||design.edge==='bank') {
      const h=(design.edge==='rock'?1.35:design.surface==='snow'?.5:.27)+random()*.3;
      box(dark,x,.1,z,1,.55,1);
      mesh(geometry.rock,stone,x,h*.4,z,.7,h*.64,.7,random()*6);
      if(design.surface==='snow')mesh(geometry.rock,bone,x,h*.89,z,.65,.15,.65);
    } else {
      box(trim,x,-.02,z,.85,.22,.85);
    }
  }
  for(const p of world.floorCells) {
    if(random()>.025||[layout.spawn,layout.supply,...layout.objects,...layout.chests].some(target=>Math.hypot(target.x-p.x,target.z-p.z)<2))continue;
    decal(stain,p.x,p.z,1.5+random()*2.8);
    if(design.edge==='bank'&&level.act===2){const tuft=mesh(geometry.plane,leaves,p.x,.22,p.z,.7,.6,1,random()*6);tuft.castShadow=false;}
  }
  // Dense silhouettes belong beyond the solid edge, never in an invisible collider.
  for(let x=-FIELD_BOUND+2;x<FIELD_BOUND-1;x+=3)for(let z=-FIELD_BOUND+2;z<FIELD_BOUND-1;z+=3) {
    if(design.edge==='void')continue;
    if(random()<.22||walkable(x,z))continue;
    if(world.floorCells.some(p=>Math.abs(p.x-x)<1.8&&Math.abs(p.z-z)<1.8))continue;
    if(!world.floorCells.some(p=>Math.hypot(p.x-x,p.z-z)<6))continue;
    prop(design.props[Math.floor(random()*design.props.length)],x,z,.75+random()*.55,random()*6);
  }
  // Low relief clutter remains traversable; substantial furniture gets real collision.
  for(const room of layout.rooms) {
    const x=room.x+room.width*.32,z=room.z-room.depth*.3;
    if(layout.connections.some(([a,b])=>distanceToSegment(x,z,a,b)<layout.corridorWidth+1.2))continue;
    if([layout.spawn,layout.supply,layout.boss,...layout.objects,...layout.chests].some(p=>Math.hypot(p.x-x,p.z-z)<4))continue;
    if(!walkable(x,z)||!walkable(x+1,z)||!walkable(x,z+1))continue;
    const kind=design.props[Math.floor(random()*design.props.length)];
    if(['pillar','obelisk','coffin','grave','urn','egg','crystal','totem','barricade'].includes(kind)) {
      prop(kind,x,z,.8);
    }
  }
  const {x:bx,z:bz}=layout.boss;
  const daisGeometry=new THREE.CylinderGeometry(1,1,1,64);
  const dais = (r=5) => { mesh(daisGeometry,dark,bx,.04,bz,r,.15,r); mesh(daisGeometry,daisMaterial,bx,.125,bz,r-.2,.08,r-.2); ring(bx,.18,bz,r-.55);decal(engraving,bx,bz,r*1.7,.173); };
  const sigil = (x:number,z:number,r:number,points=5) => {
    ring(x,.19,z,r);
    for(let i=0;i<points;i++) {const a=i*Math.PI*2/points-Math.PI/2,b=(i+2)*Math.PI*2/points-Math.PI/2;beam(glow,[x+Math.cos(a)*r,.2,z+Math.sin(a)*r],[x+Math.cos(b)*r,.2,z+Math.sin(b)*r],.035);}
  };
  const pillars = (radius=6) => { for(const side of [-1,1])pylon(bx+side*radius,bz-1,4.5); };
  const ribs = (x:number,z:number,mat=bone) => {
    for(const side of [-1,1])for(let i=0;i<5;i++){beam(mat,[x+side*2.5,0,z+i*.9],[x+side*2,1.7,z+i*.9],.16);beam(mat,[x+side*2,1.7,z+i*.9],[x+side*.8,2.5,z+i*.9],.12);}
  };
  const statue = (x:number,z:number,weapon:'axe'|'spear'|'sword') => {
    mesh(geometry.column,stone,x,.2,z,.8,.4,.8); mesh(geometry.cone,stone,x,1.25,z,.65,1.8,.65);
    box(stone,x,2.2,z,1.15,1,.55); mesh(geometry.orb,stone,x,3,z,.38,.43,.35);
    beam(stone,[x-.7,2.2,z],[x+.7,2.2,z],.18); beam(trim,[x+.8,.8,z],[x+.8,3.4,z],.075);
    if(weapon==='axe')box(trim,x+.9,3.15,z,.85,.45,.12);else mesh(geometry.cone,trim,x+.8,3.55,z,.17,.65,.1);
  };
  const canal = (x:number,z:number,length:number,color=palette.liquid) => {
    const liquid=material(color,.3);materials.push(liquid);box(liquid,x,.087,z,1.6,.02,length);
    for(const side of [-1,1])box(stone,x+side*.95,.13,z,.25,.18,length);
    for(let i=-length/2;i<length/2;i+=2)box(iron,x,.18,z+i,2.3,.08,.11);
  };
  const fence = (x:number,z:number,length:number) => {
    for(let i=0;i<=length;i+=.5){beam(iron,[x,.1,z+i],[x,1.25,z+i],.027);mesh(geometry.cone,iron,x,1.37,z+i,.08,.24,.08);}
    for(const y of [.4,.95])beam(iron,[x,y,z],[x,y,z+length],.035);solid(x,z+length/2,.15,length);
  };

  // Each encounter gets a recognizable silhouette and a distinct approach.
  switch(design.landmark) {
    case 'den':
      for(const side of [-1,1])world.torch(bx+side*4,bz+1,.55,true);
      for(let i=0;i<6;i++)prop('crag',bx-6+i*2,bz-5,1.5);
      for(const side of [-1,1])for(let i=0;i<3;i++){mesh(geometry.cone,stone,bx+side*(5+i*.4),1.2+i*.5,bz+i, .42,2.4+i,.42);solid(bx+side*(5+i*.4),bz+i,.85,.85);}
      prop('bones',bx+3,bz+2,2);decal(stain,bx,bz,6);break;
    case 'graveyard':
      dais(4.8);prop('root',bx,bz-5,2);for(const side of [-1,1]){for(let i=0;i<5;i++)prop('grave',bx+side*4,bz+2+i*2,.85);arch(bx+side*7,bz-3,2.3,2.1);fence(bx+side*6.2,bz+1,9);}break;
    case 'tristram':
      arch(bx,bz-5,6,4.5);for(const side of [-1,1]){prop('ruin',bx+side*7,bz-2,1.7);box(red,bx+side*7,.1,bz-1,2,.12,2);world.torch(bx+side*7,bz-2,1.3,true);}
      for(let i=0;i<12;i++){const a=i*Math.PI/6;box(stone,layout.route[2].x+Math.cos(a)*1.2,.45,layout.route[2].z+Math.sin(a)*1.2,.65,.9,.5,a);}world.addCollider(layout.route[2].x,layout.route[2].z,2.8,2.8);break;
    case 'tower':
      dais();arch(bx,bz-5,6,4);box(red,bx,.19,bz+1,2.2,.025,7);for(const side of [-1,1])for(let i=0;i<3;i++)prop('urn',bx+side*4.5,bz+i*1.3,1.1);break;
    case 'catacombs':
      pillars();arch(bx,bz-5,5.8,4.7);for(const side of [-1,1]){prop('coffin',bx+side*5.4,bz+3);mesh(geometry.orb,glow,bx+side*4.8,1.1,bz-2,.4,.8,.4);}break;
    case 'sewers':
      arch(bx,bz-4.8,5.5,3);for(const p of layout.route.slice(1,-1))canal(p.x,p.z,5);for(const side of [-1,1])mesh(geometry.column,iron,bx+side*5,1,bz,.7,2,.7);break;
    case 'burial-hall':
      dais();pillars();for(const side of [-1,1])prop('coffin',bx+side*5,bz+3,1.2);arch(bx,bz-5,5.8,4);break;
    case 'hive':
      mesh(geometry.orb,foliage,bx,.1,bz,4.7,.25,4);ribs(bx,bz-1);for(let i=0;i<9;i++){const a=i*.7,x=bx+Math.cos(a)*5.6,z=bz+Math.sin(a)*5;if(!layout.connections.some(([from,to])=>distanceToSegment(x,z,from,to)<layout.corridorWidth+1.4))prop('egg',x,z,1.3);}break;
    case 'orrery':
      dais();sigil(bx,bz,3.4,6);pillars();for(const r of [1.8,2.5,3.1]){const orbit=mesh(geometry.ring,trim,bx,5,bz-6,r,r,r);orbit.rotation.set(.4+r,.3,r*.5);}
      mesh(geometry.orb,glow,bx,5,bz-6,.55,.55,.55);for(const p of layout.route.slice(1,-1)){ring(p.x,.1,p.z,1.5);for(const side of [-1,1])prop('obelisk',p.x+side*3.8,p.z,.8);}break;
    case 'horadric-tomb':
      dais();arch(bx,bz-5,6,5);for(let i=0;i<7;i++){const a=Math.PI+i*Math.PI/6;prop('obelisk',bx+Math.cos(a)*6.7,bz+Math.sin(a)*5,.9);}sigil(bx,bz,3.2,7);break;
    case 'spider-grove':
      for(const side of [-1,1]){prop('tree',bx+side*6,bz-2,1.5);prop('web',bx+side*3.7,bz-4,1.8);prop('egg',bx+side*5,bz+2,1.4);}decal(silk,bx,bz,7,.09);break;
    case 'flayer-village':
      for(const side of [-1,1]){prop('hut',bx+side*6,bz-2,1.6);prop('totem',bx+side*3.8,bz+2,1.5);}ring(bx,.13,bz,3);world.torch(bx,bz-4,1,true);break;
    case 'bazaar':
      for(const side of [-1,1]){for(let i=0;i<4;i++)pylon(bx+side*6,bz+5-i*3,3.2,false);box(stone,bx+side*6,3.3,bz+.5,1.1,.5,10);prop('ruin',bx+side*7,bz-5,1.3);}dais();break;
    case 'travincal':
      for(let i=0;i<4;i++)box(i%2?trim:stone,bx,.12+i*.04,bz-2,12-i*1.3,.14,8-i*.7);pillars();arch(bx,bz-5,6.8,4.5);sigil(bx,bz,3,4);break;
    case 'durance':
      dais();pillars();for(const side of [-1,1]){canal(bx+side*4,bz+1,6);for(let i=0;i<3;i++)prop('bones',bx+side*5,bz+i*1.3,1.1);}arch(bx,bz-5,5.8,4.4);break;
    case 'steppes':
      for(const side of [-1,1]){prop('crag',bx+side*6,bz-3,2);prop('spike',bx+side*4,bz+3,1.7);}ribs(bx,bz-4);break;
    case 'despair':
      for(const side of [-1,1]){prop('obelisk',bx+side*5.8,bz-1,1.8);beam(iron,[bx+side*5.8,3,bz-1],[bx+side*1.7,.1,bz],.08);}sigil(bx,bz,3,4);break;
    case 'hellforge':
      dais();for(const side of [-1,1]){pylon(bx+side*5.8,bz,4.5);beam(iron,[bx+side*5.8,4,bz],[bx+side*2,2,bz-5],.13);}box(iron,bx,1.05,bz-5,2.4,1.5,1.5);box(trim,bx,1.9,bz-5,3.3,.4,1.9);world.torch(bx,bz-5,2,true);break;
    case 'chaos':
      dais();pillars();arch(bx,bz-5,6,5.6);for(const p of layout.route.slice(1,-1)){sigil(p.x,p.z,1.5);for(const side of [-1,1])prop('spike',p.x+side*4,p.z,1.1);}break;
    case 'terror':
      dais(6.4);sigil(bx,bz,5,5);for(let i=0;i<5;i++){const a=i*Math.PI*2/5;prop('spike',bx+Math.cos(a)*7.7,bz+Math.sin(a)*7.7,2);}break;
    case 'siege':
      for(const side of [-1,1]){prop('barricade',bx+side*5,bz+2,1.7);box(wood,bx+side*6,1,bz-3,2.3,.5,3);beam(wood,[bx+side*6,.8,bz-4],[bx+side*6,3.6,bz-1],.18);for(const dz of [-1,1]){const wheel=mesh(geometry.column,iron,bx+side*7,.6,bz-3+dz,.6,.2,.6);wheel.rotation.z=Math.PI/2;}}break;
    case 'prison':
      for(const side of [-1,1]){for(let i=0;i<5;i++)prop('barricade',bx+side*6,bz+3-i*1.5,1.25);prop('tree',bx+side*7,bz-5,1.3);}arch(bx,bz-5,5,3.2);break;
    case 'frozen-river':
      for(const side of [-1,1]){crystal(bx+side*5.7,bz-2,5);crystal(bx+side*5,bz+3,3);}ring(bx,.11,bz,4,ice);break;
    case 'ancients':
      dais(6.3);sigil(bx,bz,4,3);for(let i=0;i<3;i++){const a=Math.PI+i*Math.PI/2;const x=bx+Math.cos(a)*6,z=bz+Math.sin(a)*6;statue(x,z,(['axe','spear','sword'] as const)[i]);world.addCollider(x,z,1.6,1.6);}break;
    case 'worldstone':
      dais(6);pillars(6.5);crystal(bx,bz-7.8,9,red);for(const side of [-1,1]){pylon(bx+side*7,bz-6,6);crystal(bx+side*4.5,bz-5,4,red);}sigil(bx,bz,3.5,6);break;
  }
  // Structural entrance markers bring the area identity into the first camera view.
  for(const side of [-1,1]) {
    const x=side*8,z=15;
    if(!walkable(x,z))prop(design.props[side<0?0:Math.min(1,design.props.length-1)],x,z,1.2);
  }
  for(const [i,p] of layout.route.slice(0,-1).entries()) {
    const x=p.x+layout.corridorWidth-.65,z=p.z;
    world.torch(x,z,design.edge==='wall'?1.6:.85,i%2===0);
    if(paved){ring(p.x,.09,p.z,.8);}
  }
  // Hand off animated surfaces without allocating materials during updates.
  world.scene.userData.scenery={ landmark:design.landmark, surface:design.surface, atmosphere:design.atmosphere, description:design.description };
  if(design.liquid)world.scene.userData.liquidTexture=backdropMap;
  // Unused variants were never attached to the scene; release them explicitly.
  const used=new Set<THREE.Material>();root.traverse(object=>{if(object instanceof THREE.Mesh)for(const mat of Array.isArray(object.material)?object.material:[object.material])used.add(mat);});used.add(floor);
  materials.filter(mat=>!used.has(mat)).forEach(mat=>mat.dispose());
}
