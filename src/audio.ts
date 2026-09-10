import { AUDIO_FILES, SOUND_BANK, spatialMix, type AudioChannel, type AudioTerrain, type SoundId, type SoundPoint, type Texture } from './audio-bank.ts';
import { ambienceSamples, audioRandom, synthesize } from './audio-synthesis.ts';

export const AUDIO_SETTINGS_KEY = 'eclipse-audio-v1';
export const MAX_AUDIO_VOICES = 24;
export type NativeAudioManifest = { sounds?: Record<string, string[]> };
type Voice = { kind: SoundId; priority: number; gain: GainNode; nodes: AudioNode[]; sources: AudioBufferSourceNode[]; end: number };
type AmbientVoice = { source: AudioBufferSourceNode; gain: GainNode };
type SceneAudio = { position: SoundPoint; terrain: AudioTerrain; paused: boolean; active: boolean; running: boolean; area: string };
const clamp = (value: unknown, fallback: number) => typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : fallback;

export class GameAudio {
  context?: AudioContext;
  private master?: GainNode;
  private reverb?: ConvolverNode;
  private buses?: Record<AudioChannel, GainNode>;
  private sends?: Record<'effects' | 'ui', GainNode>;
  private graph: AudioNode[] = [];
  private settings = { volume: .35, effects: 1, ambience: .55, ui: .75, lastVolume: .35 };
  private random = audioRandom(0xD2A0D10);
  private buffers = new Map<string, AudioBuffer>();
  private voices = new Set<Voice>();
  private lastPlayed = new Map<SoundId, number>();
  private variants = new Map<string, number>();
  private ambient?: AmbientVoice;
  private fadingAmbience = new Set<AmbientVoice>();
  private terrain?: AudioTerrain;
  private scene?: SceneAudio;
  private listener: SoundPoint = { x: 0, z: 0 };
  private walked = 0;
  private hidden = false;
  private disposed = false;
  private loading?: Promise<void>;
  private abort = new AbortController();
  private failedFiles = new Set<string>();
  private native: Record<string, string[]>;
  private ambientFile?: string;

  constructor(manifest: NativeAudioManifest = {}) {
    this.native = Object.fromEntries(Object.entries(manifest.sounds ?? {}).filter(([id, files]) => /^[a-zA-Z0-9:]+$/.test(id) && Array.isArray(files)).map(([id, files]) => [id, files.filter(file => typeof file === 'string' && /^local\/[a-z0-9_ ./-]+\.(wav|ogg|mp3|flac)$/i.test(file) && !file.includes('..')).slice(0, 8)]));
    try {
      const saved = JSON.parse(localStorage.getItem(AUDIO_SETTINGS_KEY) ?? '{}');
      for (const key of Object.keys(this.settings) as (keyof typeof this.settings)[]) this.settings[key] = clamp(saved?.[key], this.settings[key]);
    } catch { /* Private browsing and corrupt preferences use defaults. */ }
  }
  get volume() { return this.settings.volume; }
  set volume(value: number) {
    this.settings.volume = clamp(value, this.settings.volume);
    if (this.settings.volume) this.settings.lastVolume = this.settings.volume;
    this.applyMix(); this.saveSettings();
  }
  channelVolume(channel: AudioChannel) { return this.settings[channel]; }
  setChannelVolume(channel: AudioChannel, value: number) { this.settings[channel] = clamp(value, this.settings[channel]); this.applyMix(); this.saveSettings(); }
  toggleMute() { this.volume = this.volume ? 0 : this.settings.lastVolume || .35; }
  private saveSettings() { try { localStorage.setItem(AUDIO_SETTINGS_KEY, JSON.stringify(this.settings)); } catch { /* Audio remains usable without storage. */ } }
  private smooth(param: AudioParam, value: number, seconds = .025) { const now = this.context!.currentTime; param.cancelScheduledValues(now); param.setTargetAtTime(value, now, seconds); }
  private applyMix() {
    if (!this.master || !this.buses) return;
    this.smooth(this.master.gain, this.hidden ? 0 : this.volume);
    for (const channel of ['effects', 'ambience', 'ui'] as const) this.smooth(this.buses[channel].gain, this.settings[channel] * (channel === 'ambience' && this.scene?.paused ? .28 : 1));
    if (this.sends) for (const channel of ['effects', 'ui'] as const) this.smooth(this.sends[channel].gain, this.settings[channel]);
  }
  /** Call synchronously inside an input gesture, before any asynchronous loading. */
  unlock() {
    if (this.disposed) return;
    try {
      if (!this.context) this.createGraph();
      if (this.context?.state === 'suspended') void this.context.resume().catch(() => {});
      void this.preload();
    } catch { /* Missing/unavailable audio hardware must not prevent playing. */ }
  }
  private createGraph() {
    const ctx = new AudioContext({ latencyHint: 'interactive' }); this.context = ctx;
    const master = ctx.createGain(), limiter = ctx.createDynamicsCompressor(), highpass = ctx.createBiquadFilter();
    this.master = master; master.gain.value = this.hidden ? 0 : this.volume;
    highpass.type = 'highpass'; highpass.frequency.value = 35;
    limiter.threshold.value = -6; limiter.knee.value = 6; limiter.ratio.value = 12; limiter.attack.value = .003; limiter.release.value = .16;
    highpass.connect(limiter); limiter.connect(master); master.connect(ctx.destination);
    this.buses = { effects: ctx.createGain(), ambience: ctx.createGain(), ui: ctx.createGain() };
    Object.values(this.buses).forEach(bus => bus.connect(highpass));
    this.reverb = ctx.createConvolver();
    const impulse = ctx.createBuffer(2, Math.ceil(ctx.sampleRate * 1.15), ctx.sampleRate), random = audioRandom(7781);
    for (let channel = 0; channel < 2; channel++) { const data = impulse.getChannelData(channel); let low = 0; for (let i = 0; i < data.length; i++) { low += ((random() * 2 - 1) - low) * .25; data[i] = low * Math.exp(-i / ctx.sampleRate * 6.5) * Math.min(1, i / (ctx.sampleRate * .018)); } }
    this.reverb.buffer = impulse;
    const wet = ctx.createGain(); wet.gain.value = .32; this.reverb.connect(wet); wet.connect(highpass);
    // Each channel controls both its dry signal and its reverberant send.
    this.sends = { effects: ctx.createGain(), ui: ctx.createGain() };
    for (const channel of ['effects', 'ui'] as const) this.sends[channel].connect(this.reverb);
    this.graph = [master, limiter, highpass, ...Object.values(this.buses), ...Object.values(this.sends), this.reverb, wet];
    this.applyMix();
  }
  async preload(): Promise<void> {
    if (!this.context || this.disposed) return;
    if (this.loading) return this.loading;
    const ctx = this.context, nativeFiles = Object.values(this.native).flat(), queue = [...new Set([...nativeFiles, ...AUDIO_FILES])];
    this.loading = (async () => {
      await Promise.all(Array.from({ length: 4 }, async () => {
        while (queue.length && !this.disposed) {
          const file = queue.shift()!;
          try {
            const response = await fetch(`/audio/${file}`, { signal: this.abort.signal });
            if (!response.ok) throw new Error(`Audio HTTP ${response.status}`);
            const buffer = await ctx.decodeAudioData(await response.arrayBuffer());
            if (!this.disposed) this.buffers.set(file, buffer);
          } catch { if (!this.disposed) this.failedFiles.add(file); }
        }
      }));
    })();
    return this.loading;
  }
  private texture(texture: Texture, variant: number) {
    const ctx = this.context!, key = `${texture}:${variant}`;
    let buffer = this.buffers.get(key);
    if (!buffer) { const pcm = synthesize(texture, variant, ctx.sampleRate); buffer = ctx.createBuffer(1, pcm.length, ctx.sampleRate); buffer.getChannelData(0).set(pcm); this.buffers.set(key, buffer); }
    return buffer;
  }
  play(kind: SoundId, options: { position?: SoundPoint; gain?: number; pitch?: number; nativeKey?: string } = {}): boolean {
    const ctx = this.context;
    if (!ctx || ctx.state !== 'running' || this.disposed || this.hidden || !this.volume) return false;
    const definition = SOUND_BANK[kind], channel = definition.channel;
    if (!this.settings[channel]) return false;
    const now = ctx.currentTime, spatial = spatialMix(this.listener, options.position);
    if (!spatial.gain || now - (this.lastPlayed.get(kind) ?? -Infinity) < definition.cooldown) return false;
    const same = [...this.voices].filter(voice => voice.kind === kind);
    if (same.length >= definition.limit) return false;
    if (this.voices.size >= MAX_AUDIO_VOICES) {
      const victim = [...this.voices].sort((a, b) => a.priority - b.priority || a.end - b.end)[0];
      if (victim.priority >= definition.priority) return false;
      this.finishVoice(victim);
    }
    this.lastPlayed.set(kind, now);
    const nativeFiles = (this.native[options.nativeKey ?? kind] ?? this.native[kind])?.filter(file => this.buffers.has(file));
    // Use all available native variants; never immediately repeat a sample.
    const variantKey = options.nativeKey ?? kind, count = nativeFiles?.length || 3;
    const variant = ((this.variants.get(variantKey) ?? -1) + 1 + Math.floor(this.random() * Math.max(1, count - 1))) % count;
    this.variants.set(variantKey, variant);
    const layers = nativeFiles?.length ? [{ buffer: this.buffers.get(nativeFiles[variant % nativeFiles.length])!, gain: 1, rate: 1, delay: 0 }] : definition.layers.map(layer => {
      const files = layer.files?.filter(file => this.buffers.has(file));
      return { buffer: files?.length ? this.buffers.get(files[variant % files.length])! : this.texture(layer.texture, variant), gain: layer.gain, rate: layer.rate ?? 1, delay: layer.delay ?? 0 };
    });
    const volume = ctx.createGain(), pan = ctx.createStereoPanner(), send = ctx.createGain();
    const pitch = (nativeFiles?.length ? 1 : definition.rate * (.97 + this.random() * .06)) * Math.max(.5, Math.min(2, options.pitch ?? 1));
    volume.gain.value = 0; volume.gain.linearRampToValueAtTime(definition.gain * spatial.gain * clamp(options.gain, 1), now + .004);
    pan.pan.value = spatial.pan; send.gain.value = definition.wet * (this.terrain === 'cave' || this.terrain === 'temple' ? 1 : .5);
    volume.connect(pan); pan.connect(this.buses![channel]); pan.connect(send); send.connect(this.sends![channel]);
    const voice: Voice = { kind, priority: definition.priority, gain: volume, nodes: [volume, pan, send], sources: [], end: now };
    let remaining = layers.length;
    for (const layer of layers) {
      const source = ctx.createBufferSource(), gain = ctx.createGain(); source.buffer = layer.buffer; source.playbackRate.value = pitch * layer.rate; gain.gain.value = layer.gain;
      source.connect(gain); gain.connect(volume); voice.nodes.push(gain); voice.sources.push(source);
      source.onended = () => { if (--remaining === 0) this.finishVoice(voice); };
      source.start(now + layer.delay); voice.end = Math.max(voice.end, now + layer.delay + layer.buffer.duration / source.playbackRate.value);
    }
    this.voices.add(voice); return true;
  }
  private finishVoice(voice: Voice) {
    for (const source of voice.sources) { source.onended = null; try { source.stop(); } catch { /* Already ended. */ } source.disconnect(); source.buffer = null; }
    voice.nodes.forEach(node => node.disconnect()); this.voices.delete(voice);
  }
  setHidden(hidden: boolean) {
    if (hidden === this.hidden) return;
    this.hidden = hidden;
    if (hidden) { this.stopEffects(); this.stopAmbience(); }
    this.applyMix();
  }
  stopEffects() { for (const voice of this.voices) this.finishVoice(voice); this.lastPlayed.clear(); }
  private stopAmbience() {
    if (this.ambient) this.releaseAmbient(this.ambient);
    for (const voice of this.fadingAmbience) this.releaseAmbient(voice);
    this.ambient = undefined; this.terrain = undefined; this.ambientFile = undefined;
  }
  private releaseAmbient(voice: AmbientVoice) { voice.source.onended = null; try { voice.source.stop(); } catch { /* Already ended. */ } voice.source.disconnect(); voice.source.buffer = null; voice.gain.disconnect(); this.fadingAmbience.delete(voice); }
  private startAmbience(terrain: AudioTerrain) {
    const ctx = this.context!, now = ctx.currentTime;
    if (this.ambient) {
      const old = this.ambient; this.fadingAmbience.add(old); this.smooth(old.gain.gain, 0, .15); old.source.stop(now + .65); old.source.onended = () => this.releaseAmbient(old);
    }
    // Area switches cannot accumulate an unbounded collection of fading loops.
    while (this.fadingAmbience.size > 1) this.releaseAmbient(this.fadingAmbience.values().next().value!);
    const source = ctx.createBufferSource(), gain = ctx.createGain();
    this.ambientFile = this.native[`ambient:${terrain}`]?.find(file => this.buffers.has(file));
    let buffer = this.ambientFile ? this.buffers.get(this.ambientFile)! : undefined;
    if (!buffer) {
      buffer = ctx.createBuffer(2, ctx.sampleRate * 8, ctx.sampleRate);
      for (let channel = 0; channel < 2; channel++) buffer.getChannelData(channel).set(ambienceSamples(terrain, ctx.sampleRate, channel));
    }
    source.buffer = buffer; source.loop = true; gain.gain.value = 0; source.connect(gain); gain.connect(this.buses!.ambience);
    source.start(); this.smooth(gain.gain, this.ambientFile ? .25 : .7, .5); this.ambient = { source, gain }; this.terrain = terrain;
  }
  updateScene(scene: SceneAudio) {
    const previous = this.scene, changed = previous?.area !== scene.area;
    const moved = previous ? Math.hypot(scene.position.x - this.listener.x, scene.position.z - this.listener.z) : 0;
    this.scene = { ...scene, position: { ...scene.position } };
    this.listener = { ...scene.position };
    if (changed) this.walked = 0;
    if (previous?.paused !== scene.paused) this.applyMix();
    if (this.context?.state !== 'running' || this.hidden || !scene.active || !this.volume || !this.settings.ambience) {
      if (this.ambient) this.stopAmbience();
    } else if (this.terrain !== scene.terrain || !this.ambientFile && this.native[`ambient:${scene.terrain}`]?.some(file => this.buffers.has(file))) this.startAmbience(scene.terrain);
    if (!scene.active || scene.paused || changed || moved > 1.5 || !moved) { this.walked = 0; return; }
    this.walked += moved;
    if (this.walked >= (scene.running ? 1.6 : 1.35)) {
      this.walked = 0;
      this.play(scene.terrain === 'snow' ? 'stepSnow' : ['field', 'camp'].includes(scene.terrain) ? 'stepGrass' : 'stepStone', { gain: scene.running ? 1 : .72 });
    }
  }
  diagnostics() { return { voices: this.voices.size, buffers: this.buffers.size, ambience: (this.ambient ? 1 : 0) + this.fadingAmbience.size, failedFiles: [...this.failedFiles], nativeCues: Object.values(this.native).filter(files => files.some(file => this.buffers.has(file))).length, disposed: this.disposed }; }
  dispose() {
    if (this.disposed) return;
    this.disposed = true; this.abort.abort(); this.stopEffects(); this.stopAmbience();
    this.graph.forEach(node => node.disconnect()); if (this.reverb) this.reverb.buffer = null;
    this.buffers.clear(); this.variants.clear(); this.failedFiles.clear(); this.graph = [];
    this.master = undefined; this.buses = undefined; this.sends = undefined; this.reverb = undefined; this.scene = undefined;
    if (this.context && this.context.state !== 'closed') void this.context.close().catch(() => {});
  }
}
