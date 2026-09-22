import * as THREE from 'three';

// CPU templates never enter a scene. Returned clones have independent buffers
// and disposal, so hit effects, deformation and scene teardown remain local.
export class ModelGeometryCache {
  private entries=new Map<string,{geometry:THREE.BufferGeometry;bytes:number}>();
  private bytes=0;
  private hits=0;
  private misses=0;
  readonly maxBytes:number;
  readonly maxEntries:number;
  constructor(maxBytes=12*1024*1024,maxEntries=256) {this.maxBytes=maxBytes;this.maxEntries=maxEntries;}
  get<T extends THREE.BufferGeometry>(key:string,build:()=>T):T {
    const found=this.entries.get(key);
    if(found){this.hits++;this.entries.delete(key);this.entries.set(key,found);return found.geometry.clone() as T;}
    this.misses++;
    const geometry=build();
    const bytes=Object.values(geometry.attributes).reduce((sum,attribute)=>sum+attribute.array.byteLength,geometry.index?.array.byteLength??0);
    if(bytes>this.maxBytes||this.maxEntries<1)return geometry;
    while(this.entries.size&&(this.bytes+bytes>this.maxBytes||this.entries.size>=this.maxEntries)) {
      const oldest=this.entries.keys().next().value!,entry=this.entries.get(oldest)!;
      this.entries.delete(oldest);this.bytes-=entry.bytes;entry.geometry.dispose();
    }
    this.entries.set(key,{geometry,bytes});this.bytes+=bytes;return geometry.clone();
  }
  clear(){for(const {geometry} of this.entries.values())geometry.dispose();this.entries.clear();this.bytes=0;this.hits=this.misses=0;}
  stats(){return{bytes:this.bytes,entries:this.entries.size,hits:this.hits,misses:this.misses};}
}
export const modelGeometryCache=new ModelGeometryCache();
