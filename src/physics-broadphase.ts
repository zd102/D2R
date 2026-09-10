import { ArrayCollisionMatrix, SAPBroadphase, type Body, type World } from 'cannon-es';

// Only a few actors touch in a map with thousands of walls. The default dense
// matrix clears wallCount² entries every simulation tick, even for static pairs.
export class MapCollisionMatrix extends ArrayCollisionMatrix {
  private contacts = new Set<string>();
  private key(a: Body, b: Body) { return a.id < b.id ? `${a.id}:${b.id}` : `${b.id}:${a.id}`; }
  override get(a: Body, b: Body) { return this.contacts.has(this.key(a, b)) ? 1 : 0; }
  override set(a: Body, b: Body, value: boolean) { const key = this.key(a, b); if (value) this.contacts.add(key); else this.contacts.delete(key); }
  override reset() { this.contacts.clear(); }
  override setNumObjects(_count: number) { /* Body IDs remain stable when a corpse is removed. */ }
}

// Maps contain many long, static walls. Test the sorted AABB interval before
// collision filters: Cannon's sphere sweep otherwise scans every static/static
// pair, and the bounding sphere of a long wall spans most of the map.
export class MapBroadphase extends SAPBroadphase {
  constructor(world: World) {
    super(world);
    this.useBoundingBoxes = true;
  }

  override collisionPairs(_world: World, pairs1: Body[], pairs2: Body[]) {
    if (this.dirty) { this.sortList(); this.dirty = false; }
    const axis = (['x', 'y', 'z'] as const)[this.axisIndex], bodies = this.axisList;
    for (let i = 0; i < bodies.length; i++) {
      const a = bodies[i], end = a.aabb.upperBound[axis];
      for (let j = i + 1; j < bodies.length; j++) {
        const b = bodies[j];
        if (b.aabb.lowerBound[axis] > end) break;
        if (this.needBroadphaseCollision(a, b)) this.intersectionTest(a, b, pairs1, pairs2);
      }
    }
  }
}
