import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createMonsterActor } from './monster-models.ts';
import type { MonsterDef } from './bestiary.ts';

export class EncyclopediaPreview {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera(-5, 5, 5, -5, .1, 100);
  private controls: OrbitControls;
  private actor?: ReturnType<typeof createMonsterActor>;
  private observer: ResizeObserver;
  private host?: HTMLElement;
  private frame = 0;
  private time = 0;
  private previous = 0;
  private bounds = new THREE.Box3();
  paused = false;
  constructor() {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.25;
    this.renderer.domElement.className = 'encyclopedia-model';
    this.renderer.domElement.setAttribute('role', 'img');
    this.scene.add(new THREE.HemisphereLight(0xe7f1ff, 0x687563, 2.8));
    const key = new THREE.DirectionalLight(0xffe1bc, 3.2); key.position.set(5, 8, 6); this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x9ddbea, 1.6); rim.position.set(-4, 4, -3); this.scene.add(rim);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enablePan = false; this.controls.enableDamping = true;
    this.controls.minZoom = .7; this.controls.maxZoom = 2.5;
    this.controls.minPolarAngle = .15; this.controls.maxPolarAngle = Math.PI * .7;
    this.observer = new ResizeObserver(() => this.fit());
  }
  mount(host: HTMLElement, definition: MonsterDef, boss: boolean, name: string) {
    this.observer.disconnect(); this.removeActor(); this.host = host; host.append(this.renderer.domElement);
    this.renderer.domElement.setAttribute('aria-label', `${name}模型`);
    this.actor = createMonsterActor(definition, boss); this.scene.add(this.actor.group);
    this.actor.animate?.(.5, false, 0); this.bounds.setFromObject(this.actor.group);
    this.time = .5; this.previous = 0; this.fit(); this.observer.observe(host);
    if (!this.frame) this.frame = requestAnimationFrame(this.animate);
  }
  private fit() {
    if (!this.host || !this.actor) return;
    const width = Math.max(1, this.host.clientWidth), height = Math.max(1, this.host.clientHeight), aspect = width / height;
    this.renderer.setSize(width, height);
    const center = this.bounds.getCenter(new THREE.Vector3()), size = this.bounds.getSize(new THREE.Vector3());
    const extent = Math.max(size.length() * 1.15, size.length() * 1.15 / aspect, 2);
    this.camera.left = -extent * aspect / 2; this.camera.right = extent * aspect / 2;
    this.camera.top = extent / 2; this.camera.bottom = -extent / 2; this.camera.zoom = 1;
    this.camera.position.copy(center).add(new THREE.Vector3(6, 3.5, 9)); this.controls.target.copy(center);
    this.camera.updateProjectionMatrix(); this.controls.update(); this.renderer.render(this.scene, this.camera);
  }
  reset() { this.fit(); }
  toggle() { this.paused = !this.paused; }
  private animate = (stamp: number) => {
    const dt = this.previous ? Math.min(.05, (stamp - this.previous) / 1000) : 0; this.previous = stamp;
    if (!this.paused && !document.hidden) { this.time += dt; this.actor?.animate?.(this.time, false, 0); }
    this.controls.update(); if (!document.hidden) this.renderer.render(this.scene, this.camera);
    this.frame = requestAnimationFrame(this.animate);
  };
  private removeActor() {
    if (!this.actor) return;
    const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
    this.actor.group.traverse(object => {
      if (object instanceof THREE.Mesh) { geometries.add(object.geometry); for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material); }
    });
    this.actor.group.removeFromParent(); geometries.forEach(value => value.dispose()); materials.forEach(value => value.dispose()); this.actor = undefined;
  }
  dispose() {
    cancelAnimationFrame(this.frame); this.frame = 0; this.observer.disconnect(); this.controls.dispose(); this.removeActor();
    this.renderer.dispose(); this.renderer.forceContextLoss(); this.renderer.domElement.remove(); this.host = undefined;
  }
}
