import * as THREE from 'three';
import { contourGeometry } from './actor-modeling.ts';
import { modelGeometryCache } from './model-geometry-cache.ts';
import { bakeModelCavity } from './model-detailing.ts';

type Section=readonly [number,number,number,number?];

export function refreshLoftNormals(geometry:THREE.BufferGeometry) {
  geometry.deleteAttribute('surfaceCavity');
  geometry.computeVertexNormals();
  const normals=geometry.attributes.normal,segments=geometry.userData.ringSegments as number,rows=geometry.userData.sideRows as number;
  const average=new THREE.Vector3();
  for(let row=0;row<rows;row++) {
    const first=row*(segments+1),last=first+segments;
    average.fromBufferAttribute(normals,first).add(new THREE.Vector3().fromBufferAttribute(normals,last)).normalize();
    normals.setXYZ(first,average.x,average.y,average.z);normals.setXYZ(last,average.x,average.y,average.z);
  }
  bakeModelCavity(geometry);
}

// Bounded cubic Hermite interpolation preserves narrow wrists and ankles. It
// does not overshoot the authored silhouette or turn thin sections inside out.
export function loftGeometry(sections:readonly Section[],segments=16,folds=0) {
  return modelGeometryCache.get(`loft:${segments}:${folds}:${JSON.stringify(sections)}`,()=>{
    const rings:[number,number,number,number][]=[];
    const steps=segments>=24?3:2;
    for(let row=0;row<sections.length-1;row++) {
      const a=sections[row],b=sections[row+1],before=sections[Math.max(0,row-1)],after=sections[Math.min(sections.length-1,row+2)];
      for(let step=0;step<steps;step++) {
        const t=step/steps,t2=t*t,t3=t2*t,values=[a[0]+(b[0]-a[0])*t];
        for(let axis=1;axis<4;axis++) {
          const av=a[axis]??0,bv=b[axis]??0;
          const v=(2*t3-3*t2+1)*av+(t3-2*t2+t)*(bv-(before[axis]??0))*.5+(-2*t3+3*t2)*bv+(t3-t2)*( (after[axis]??0)-av)*.5;
          values.push(THREE.MathUtils.clamp(v,Math.min(av,bv),Math.max(av,bv)));
        }
        rings.push(values as [number,number,number,number]);
      }
    }
    const last=sections.at(-1)!;rings.push([last[0],last[1],last[2],last[3]??0]);
    const radial=segments,geometry=contourGeometry(rings,radial,folds);
    geometry.userData.ringSegments=radial;geometry.userData.sideRows=rings.length;
    geometry.userData.bottomCapRim=rings.length*(radial+1)+1;
    return geometry;
  });
}

export function sculptedHead(broad=1,gaunt=0,profile:'veteran'|'feminine'|'gaunt'|'feral'='veteran') {
  return modelGeometryCache.get(`head:${broad}:${gaunt}:${profile}`,()=>{
    const geometry=loftGeometry([[-.13,.045,.055,.027],[-.10,.081,.075,.027],[-.06,.102,.093,.01],[0,.128,.114],[.065,.133,.12,-.005],[.12,.137,.126,-.014],[.18,.127,.116,-.02],[.225,.094,.085,-.021],[.25,.012,.024,-.015]],32);
    const vertices=geometry.attributes.position;
    const bump=(x:number,y:number,cx:number,cy:number,wx:number,wy:number)=>Math.exp(-(((x-cx)/wx)**2+((y-cy)/wy)**2));
    for(let i=0;i<vertices.count;i++) {
      const x=vertices.getX(i),y=vertices.getY(i),z=vertices.getZ(i),front=THREE.MathUtils.smoothstep(z,.035,.10);
      const cheek=(profile==='gaunt'?.029:.020)*bump(Math.abs(x),y,.084,.007,.031,.028);
      const socket=(profile==='veteran'||profile==='feral'?.025:.021)*bump(Math.abs(x),y,.052,.068,.028,.024);
      const bridge=(profile==='feminine'?.022:.032)*bump(x,y,0,.057,.018,.061),nose=.023*bump(x,y,0,.015,.020,.020);
      const lip=.009*bump(x,y,0,-.046,.043,.010),chin=.009*bump(x,y,0,-.09,.045,.020);
      const brow=(profile==='feminine'?.008:.020)*bump(Math.abs(x),y,.052,.098,.040,.014);
      const hollow=(.010+gaunt)*bump(Math.abs(x),y,.080,-.047,.036,.032);
      const nasolabial=.007*bump(Math.abs(x),y,.034,-.019,.008,.021);
      const jaw=profile==='feminine'?1-.08*(1-THREE.MathUtils.smoothstep(y,-.10,.05)):profile==='feral'?1.035:1;
      vertices.setXYZ(i,x*broad*jaw,y,z+front*(cheek-socket+bridge+nose+lip+chin+brow-hollow-nasolabial));
    }
    refreshLoftNormals(geometry);return geometry;
  });
}

// Pectoral and abdominal planes form one continuous surface.
export function sculptedTorso(sections:readonly Section[],strength=.015) {
  return modelGeometryCache.get(`torso:${strength}:${JSON.stringify(sections)}`,()=>{
    const geometry=loftGeometry(sections,24),vertices=geometry.attributes.position;
    const low=sections[0][0],height=sections.at(-1)![0]-low,width=Math.max(...sections.map(s=>s[1]));
    for(let i=0;i<vertices.count;i++) {
      const x=vertices.getX(i),y=vertices.getY(i),z=vertices.getZ(i),u=x/width,v=(y-low)/height;
      const chest=Math.exp(-(((Math.abs(u)-.48)/.37)**2+((v-.68)/.18)**2));
      const abdomen=Math.exp(-(((Math.abs(u)-.21)/.20)**2+((v-.32)/.30)**2))*(.5+.5*Math.cos(v*35));
      const sternum=Math.exp(-((u/.075)**2+((v-.58)/.35)**2));
      const front=THREE.MathUtils.smoothstep(z,0,.10);
      const clavicle=Math.exp(-(((v-.86+Math.abs(u)*.045)/.035)**2))*(1-u*u);
      const oblique=Math.exp(-(((Math.abs(u)-.78)/.18)**2+((v-.35)/.24)**2));
      const back=THREE.MathUtils.smoothstep(-z,0,.10);
      const scapula=Math.exp(-(((Math.abs(u)-.51)/.27)**2+((v-.72)/.19)**2));
      const costalGroove=Math.exp(-(((v-.54-Math.abs(u)*.12)/.025)**2))*(1-u*u);
      vertices.setZ(i,z+front*strength*(chest+.45*abdomen-.36*sternum+.32*clavicle+.24*oblique-.25*costalGroove)-back*strength*.6*scapula);
    }
    refreshLoftNormals(geometry);return geometry;
  });
}

export function drapedCloth(width:number,height:number,seed=0) {
  const geometry=new THREE.PlaneGeometry(width,height,10,14),positions=geometry.attributes.position;
  for(let i=0;i<positions.count;i++) {
    const x=positions.getX(i),y=positions.getY(i),t=.5-y/height,u=x/width;
    const flare=1+t*.24,fold=Math.sin(u*Math.PI*8+t*.8+seed)*.7+Math.sin(u*Math.PI*14-t*.45+seed)*.3;
    positions.setXYZ(i,x*flare,y-Math.pow(t,8)*height*.025*(.5+.5*Math.sin(u*23+seed)),fold*Math.min(width*.13,.052)*(.25+t*.75));
  }
  geometry.computeVertexNormals();bakeModelCavity(geometry);return geometry;
}

// Tuck a shoulder into the clavicle instead of exposing a flat cylinder cap.
export function insetLoftTop(geometry:THREE.BufferGeometry,insetX:number,startY:number,endY:number) {
  const positions=geometry.attributes.position;
  for(let i=0;i<positions.count;i++)positions.setX(i,positions.getX(i)+insetX*THREE.MathUtils.smoothstep(positions.getY(i),startY,endY));
  refreshLoftNormals(geometry);return geometry;
}

// Tapered, grooved locks follow a jaw instead of overlapping round beard balls.
export function sculptedBeard(long=false) {
  return modelGeometryCache.get(`beard:${long}`,()=>{
    const geometry=loftGeometry(long
      ? [[-.27,.012,.017,.10],[-.20,.06,.038,.105],[-.13,.092,.049,.09],[-.075,.096,.042,.078],[-.052,.064,.023,.095]]
      : [[-.18,.018,.017,.085],[-.135,.062,.034,.083],[-.092,.093,.044,.067],[-.053,.080,.025,.08]],16,.09);
    const vertices=geometry.attributes.position;
    for(let i=0;i<vertices.count;i++) {
      const x=vertices.getX(i),y=vertices.getY(i),z=vertices.getZ(i);
      vertices.setZ(i,z+Math.sin(x*150+y*13)*.004*THREE.MathUtils.smoothstep(z,.08,.12));
    }
    refreshLoftNormals(geometry);return geometry;
  });
}
