/// <reference types="vite/client" />
import type { NativeAudioManifest } from './audio.ts';

// The optional local pack is discovered at build time. No missing-file requests,
// third-party playback URLs, or original game assets are needed by the fallback.
const manifests = import.meta.glob<NativeAudioManifest>('/public/audio/local/manifest.json', { eager: true, import: 'default' });
export const nativeAudioManifest = Object.values(manifests)[0] ?? {};
