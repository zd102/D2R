import { newHero, type HeroState } from '../src/model.ts';
import { parseCharacterFile, parseProfile, CHARACTER_FILE_LIMIT, type SavedProfile } from '../src/save-format.ts';
import { parseSharedItems } from '../src/shared-stash.ts';
import { randomUUID } from 'node:crypto';
import type { Item } from '../src/items.ts';

export class ApiError extends Error {
  status: number; code: string;
  constructor(status: number, code: string, message: string) { super(message); this.status = status; this.code = code; }
}
export function check(condition: unknown, code = 'INVALID_REQUEST', message = '请求内容无效。', status = 422): asserts condition {
  if (!condition) throw new ApiError(status, code, message);
}
export function record(value: unknown): Record<string, unknown> {
  check(value && typeof value === 'object' && !Array.isArray(value)); return value as Record<string, unknown>;
}
export function string(value: unknown, max = 128): string {
  check(typeof value === 'string' && value.length > 0 && value.length <= max); return value;
}
export function integer(value: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  check(Number.isSafeInteger(value) && (value as number) >= min && (value as number) <= max); return value as number;
}
function validateTree(value: unknown, depth = 0) {
  check(depth <= 24, 'INVALID_SAVE', '存档嵌套过深。');
  if (typeof value === 'number') check(Number.isFinite(value) && Math.abs(value) <= Number.MAX_SAFE_INTEGER, 'INVALID_SAVE', '存档数值无效。');
  if (typeof value === 'string') check(value.length <= 4096, 'INVALID_SAVE', '存档字段过长。');
  if (Array.isArray(value)) { check(value.length <= 1000, 'INVALID_SAVE', '存档数组过大。'); value.forEach(v => validateTree(v, depth + 1)); }
  else if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      check(!['__proto__', 'prototype', 'constructor'].includes(key), 'INVALID_SAVE'); validateTree(child, depth + 1);
    }
  }
}
export function heroItems(hero: HeroState): Item[] {
  return [...hero.inventory, ...hero.stash, ...hero.cube, ...Object.values(hero.equipment), ...Object.values(hero.alternate),
    ...Object.values(hero.corpse?.equipment ?? {}), ...(hero.corpse?.extras ?? []), ...Object.values(hero.mercenary?.equipment ?? {})].filter((item): item is Item => !!item);
}
export function uniqueItems(items: Item[]) {
  const ids = items.map(item => item.id); check(new Set(ids).size === ids.length, 'DUPLICATE_ITEM', '发现重复物品，请重新载入角色。', 409);
}
export function validateHero(value: unknown): HeroState {
  validateTree(value);
  const raw = record(value), template = newHero();
  check(raw.rulesVersion === 2, 'CLIENT_UPDATE_REQUIRED', '角色规则版本不受支持，请刷新页面。', 409);
  for (const [key, sample] of Object.entries(template)) {
    check(key in raw, 'INVALID_SAVE', `角色数据缺少 ${key}。`);
    if (typeof sample === 'number') check(typeof raw[key] === 'number', 'INVALID_SAVE');
    if (Array.isArray(sample)) check(Array.isArray(raw[key]), 'INVALID_SAVE');
    else if (sample !== null && typeof sample === 'object') check(raw[key] && typeof raw[key] === 'object' && !Array.isArray(raw[key]), 'INVALID_SAVE');
  }
  integer(raw.level, 1, 99); integer(raw.gold, 0, 10000000); integer(raw.kills, 0, 10000000);
  integer(raw.points, 0, 10000000); integer(raw.skillPoints, 0, 10000000);
  for (const field of ['strength','dexterity','vitality','energy']) integer(raw[field], 1, 10000);
  for (const field of ['xp','hp','mana','stamina']) check(typeof raw[field] === 'number' && (raw[field] as number) >= 0, 'INVALID_SAVE');
  check((raw.inventory as unknown[]).length <= 40 && (raw.stash as unknown[]).length <= 200 && (raw.cube as unknown[]).length <= 12, 'INVALID_SAVE', '物品容器超出容量。');
  const profile = parseProfile(JSON.stringify({ version: 2, id: 'validation', name: 'validation', createdAt: 1, updatedAt: 1, revision: 1, hero: value }));
  check(profile, 'INVALID_SAVE', '角色存档无法读取。');
  // Reject dropped/invalid items rather than silently accepting a repaired save.
  const incoming = heroItems(value as HeroState), parsed = heroItems(profile.hero);
  check(incoming.length === parsed.length && incoming.every((item, i) => item?.id === parsed[i]?.id), 'INVALID_SAVE', '存档包含无效物品。');
  uniqueItems(parsed);
  return profile.hero;
}
export function importProfile(raw: unknown): SavedProfile {
  const content = string(raw, CHARACTER_FILE_LIMIT);
  check(Buffer.byteLength(content) <= CHARACTER_FILE_LIMIT, 'FILE_TOO_LARGE', '存档文件不能超过 2 MB。', 413);
  let data: unknown;
  try { data = JSON.parse(content.replace(/^\uFEFF/, '')); } catch { throw new ApiError(422, 'INVALID_SAVE', '存档文件不是有效的 JSON。'); }
  validateTree(data);
  const profile = parseCharacterFile(content);
  profile.hero = validateHero(profile.hero);
  // An import is a new independent character; new item IDs permit intentional copies.
  heroItems(profile.hero).forEach(item => { item.id = randomUUID(); });
  return profile;
}
export function validateStash(value: unknown) { return parseSharedItems(value); }
