import * as THREE from 'three';

// Local cavity is baked once on the CPU. Weld only for the calculation: UV seams
// and hard normals remain separate vertices in the actual render geometry.
export function bakeModelCavity(geometry: THREE.BufferGeometry) {
  if (geometry.hasAttribute('surfaceCavity')) return;
  const positions=geometry.attributes.position,normals=geometry.attributes.normal;
  const cavity=new Float32Array(positions.count).fill(1);
  if(!normals){geometry.setAttribute('surfaceCavity',new THREE.BufferAttribute(cavity,1));return;}
  const welded=new Map<string,number>(),ids=new Uint32Array(positions.count);
  const points:THREE.Vector3[]=[],neighbors:Set<number>[]=[];
  for(let i=0;i<positions.count;i++) {
    const x=positions.getX(i),y=positions.getY(i),z=positions.getZ(i);
    const key=`${Math.round(x*1e5)},${Math.round(y*1e5)},${Math.round(z*1e5)}`;
    let id=welded.get(key);
    if(id===undefined){id=points.length;welded.set(key,id);points.push(new THREE.Vector3(x,y,z));neighbors.push(new Set());}
    ids[i]=id;
  }
  const index=geometry.index,count=index?.count??positions.count;
  for(let i=0;i<count;i+=3) {
    const face=[0,1,2].map(offset=>ids[index?index.getX(i+offset):i+offset]);
    for(let j=0;j<3;j++){const a=face[j],b=face[(j+1)%3];if(a!==b){neighbors[a].add(b);neighbors[b].add(a);}}
  }
  const directions=points.map((point,id)=>{
    const direction=new THREE.Vector3(),delta=new THREE.Vector3();
    for(const neighbor of neighbors[id])direction.add(delta.copy(points[neighbor]).sub(point).normalize());
    return direction.divideScalar(Math.max(1,neighbors[id].size));
  });
  const normal=new THREE.Vector3();
  for(let i=0;i<positions.count;i++)cavity[i]=1-THREE.MathUtils.clamp(normal.fromBufferAttribute(normals,i).dot(directions[ids[i]])*2.8,0,.52);
  geometry.setAttribute('surfaceCavity',new THREE.BufferAttribute(cavity,1));
}

// Surface scars follow the existing topology. No extra polygons or objects are
// needed for large planes, tool marks and the softer edges of worn organic parts.
export function carveSurface(geometry:THREE.BufferGeometry,amount:number,frequency=9) {
  geometry.deleteAttribute('surfaceCavity');
  const positions=geometry.attributes.position,normals=geometry.attributes.normal;
  for(let i=0;i<positions.count;i++) {
    const x=positions.getX(i),y=positions.getY(i),z=positions.getZ(i);
    const relief=amount*(Math.sin(x*frequency+y*3)*Math.sin(z*frequency-y*5)*.65+Math.cos(x*5+z*7+y*frequency)*.35);
    positions.setXYZ(i,x+normals.getX(i)*relief,y+normals.getY(i)*relief,z+normals.getZ(i)*relief);
  }
  geometry.computeVertexNormals();return geometry;
}
