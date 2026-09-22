import * as THREE from 'three';
import { contourGeometry } from './actor-modeling.ts';
import { modelGeometryCache } from './model-geometry-cache.ts';

type Section=readonly [number,number,number,number?];

export function refreshLoftNormals(geometry:THREE.BufferGeometry) {
  geometry.computeVertexNormals();
  const normals=geometry.attributes.normal,segments=geometry.userData.ringSegments as number,rows=geometry.userData.sideRows as number;
  const average=new THREE.Vector3();
  for(let row=0;row<rows;row++) {
    const first=row*(segments+1),last=first+segments;
    average.fromBufferAttribute(normals,first).add(new THREE.Vector3().fromBufferAttribute(normals,last)).normalize();
    normals.setXYZ(first,average.x,average.y,average.z);normals.setXYZ(last,average.x,average.y,average.z);
  }
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

export function sculptedHead(broad=1,gaunt=0) {
  return modelGeometryCache.get(`head:${broad}:${gaunt}`,()=>{
    const geometry=loftGeometry([[-.13,.045,.055,.027],[-.10,.081,.075,.027],[-.06,.102,.093,.01],[0,.128,.114],[.065,.133,.12,-.005],[.12,.137,.126,-.014],[.18,.127,.116,-.02],[.225,.094,.085,-.021],[.25,.012,.024,-.015]],32);
    const vertices=geometry.attributes.position;
    const bump=(x:number,y:number,cx:number,cy:number,wx:number,wy:number)=>Math.exp(-(((x-cx)/wx)**2+((y-cy)/wy)**2));
    for(let i=0;i<vertices.count;i++) {
      const x=vertices.getX(i),y=vertices.getY(i),z=vertices.getZ(i),front=THREE.MathUtils.smoothstep(z,.035,.10);
      const cheek=.015*bump(Math.abs(x),y,.085,.01,.035,.034);
      const socket=.012*bump(Math.abs(x),y,.052,.068,.025,.022);
      const bridge=.029*bump(x,y,0,.057,.018,.061),nose=.028*bump(x,y,0,.015,.022,.020);
      const lip=.009*bump(x,y,0,-.046,.043,.010),chin=.009*bump(x,y,0,-.09,.045,.020);
      vertices.setXYZ(i,x*broad,y,z+front*(cheek-socket+bridge+nose+lip+chin-gaunt*bump(Math.abs(x),y,.080,-.047,.036,.032)));
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
      const abdomen=Math.exp(-((u/.56)**2+((v-.32)/.30)**2))*(.5+.5*Math.cos(v*35));
      const sternum=Math.exp(-((u/.09)**2+((v-.67)/.23)**2));
      const front=THREE.MathUtils.smoothstep(z,0,.10);
      vertices.setZ(i,z+front*strength*(chest+.35*abdomen-.3*sternum));
    }
    refreshLoftNormals(geometry);return geometry;
  });
}
