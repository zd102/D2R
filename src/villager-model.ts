import * as THREE from 'three';
import { actorMaterial, mergeActorParts, organicGeometry } from './actor-modeling.ts';
import { loftGeometry, sculptedHead } from './sculpted-surfaces.ts';

// Static camp character: the same face/cloth surfaces as actors, with no weapon
// catalogue, animation state or invisible equipment to build and retain.
export function createVillagerModel() {
  const root=new THREE.Group(),skin=actorMaterial(0xa87c5c,'skin'),cloth=actorMaterial(0x354c51,'cloth'),leather=actorMaterial(0x352820,'leather'),bone=actorMaterial(0xc1b299,'bone');
  const sphere=organicGeometry(),box=new THREE.BoxGeometry();
  const part=(geometry:THREE.BufferGeometry,material:THREE.Material,x:number,y:number,z:number,sx=1,sy=1,sz=1)=>{
    const mesh=new THREE.Mesh(geometry,material);mesh.position.set(x,y,z);mesh.scale.set(sx,sy,sz);mesh.castShadow=mesh.receiveShadow=true;root.add(mesh);return mesh;
  };
  part(loftGeometry([[.18,.31,.21],[.45,.28,.19],[.84,.20,.15],[1.03,.23,.17],[1.28,.28,.15],[1.38,.13,.095]],20,.035),cloth,0,0,0);
  part(loftGeometry([[0,.067,.065],[.17,.072,.068]],16),skin,0,1.32,0);
  part(sculptedHead(.98,.005),skin,0,1.57,0);
  part(loftGeometry([[.12,.142,.132,-.016],[.19,.135,.119,-.022],[.255,.065,.072,-.02]],24),leather,0,1.57,0);
  for(const side of [-1,1]) {
    const sleeve=part(loftGeometry([[-.41,.055,.062,.05],[-.20,.09,.085],[0,.11,.10],[.08,.055,.045]],16,.025),cloth,side*.28,1.28,0);sleeve.rotation.z=side*.08;
    part(sphere,skin,side*.31,.85,.045,.053,.085,.047);
    part(sphere,leather,side*.13,.09,.055,.095,.085,.18);
    part(sphere,bone,side*.052,1.636,.115,.021,.006,.007);
    part(sphere,leather,side*.052,1.636,.123,.006,.006,.003);
  }
  part(loftGeometry([[-.025,.214,.158],[.025,.216,.16]],20),leather,0,.89,0);
  part(box,bone,0,.89,.165,.07,.055,.015);
  part(sphere,leather,.24,.77,.08,.095,.12,.065);
  part(sphere,leather,0,1.524,.117,.026,.003,.005);
  mergeActorParts(root);return root;
}
