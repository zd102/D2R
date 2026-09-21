"""Import HD-first D2R sounds from local CASC storage or extracted Data files.

Uses a caller-supplied CascLib 3.x DLL. Never modifies the game installation.
Release audio and its manifest are tracked in public/audio/local; extra imports stay ignored.
"""
import argparse
import csv
import ctypes as c
import fnmatch
import hashlib
import io
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MAPPING = {
    'swing': 'weapon_1hs_small_[1-6]', 'bluntSwing': 'weapon_staff_[1-6]',
    'thrust': 'weapon_1ht_[1-6]', 'shot': 'weapon_bow_[1-5]',
    'crossbow': 'weapon_xbow_[1-4]', 'throw': 'weapon_throw_[1-3]',
    'hit': 'impact_blade_swing_[1-6]', 'boneHit': 'impact_blunt_[1-6]',
    'metalHit': 'block_weapon_[1-3]', 'block': 'block_weapon_[1-3]',
    'hurt': 'paladin_hit_[1-5]', 'death': 'paladin_death_[1-3]',
    'monsterDeath': 'fallen_death_[1-3]', 'boneDeath': 'skeleton_death_[1-3]',
    'ghostDeath': 'wraith_death_[1-3]', 'bossDeath': 'diablo_death',
    'fire': 'sorceress_firebolt_[1-3]', 'cold': 'sorceress_icebolt_[1-3]',
    'lightning': 'sorceress_lightning_[1-3]', 'poison': 'amazon_cast_poison',
    'spell': 'sorceress_cast_lightning', 'holyBolt': 'paladin_holybolt_[1-3]',
    'hammer': 'paladin_blessedhammer_[1-3]', 'shield': 'paladin_holyshield',
    'aura': 'paladin_aura_might', 'fireImpact': 'impact_fire_[1-3]',
    'coldImpact': 'impact_cold_[1-3]', 'lightningImpact': 'impact_lightning_[1-4]',
    'poisonImpact': 'impact_poison_[1-3]', 'magicImpact': 'paladin_holybolt_impact_[1-3]',
    'portal': 'player_townportal_enter', 'teleport': 'sorceress_teleport',
    'potion': 'item_potion_drink', 'gold': 'item_gold', 'loot': 'item_pickup',
    'itemMetal': 'item_smallmetalweapon', 'itemBottle': 'item_potion', 'rune': 'item_rune',
    'drop': 'item_flippy', 'dropMetal': 'item_largemetalweapon', 'dropRare': 'item_rare',
    'equip': 'item_platearmor', 'chest': 'object_chest_large',
    'uiOpen': 'cursor_switch', 'uiClose': 'cursor_select', 'uiClick': 'cursor_button_click',
    'level': 'cursor_level_up', 'quest': 'cursor_questdone',
    'stepStone': 'medium_walk_istone_[1-4]', 'stepGrass': 'light_walk_dirt_[1-4]',
    'stepSnow': 'medium_walk_snow_[1-4]',
    'ambient:camp': 'scene_wilderness_day', 'ambient:field': 'scene_wilderness_night',
    'ambient:cave': 'scene_cave', 'ambient:temple': 'scene_catacombs',
    'ambient:ruins': 'scene_monastery', 'ambient:arcane': 'scene_arcane',
    'ambient:lava': 'scene_lava', 'ambient:snow': 'scene_monastery',
}
SKILLS = {
    'holyBolt': 'paladin_holybolt_[1-3]', 'blessedHammer': 'paladin_blessedhammer_[1-3]',
    'holyShield': 'paladin_holyshield', 'fistOfHeavens': 'paladin_handofgod_cast',
    'charge': 'paladin_charge', 'sacrifice': 'paladin_sacrifice', 'vengeance': 'paladin_vengeance',
    'conversion': 'paladin_conversion', 'zeal': 'paladin_zeal',
    'fireBolt': 'sorceress_firebolt_[1-3]', 'fireBall': 'sorceress_fireball_[1-3]',
    'inferno': 'sorceress_inferno', 'blaze': 'sorceress_cast_fire', 'fireWall': 'sorceress_cast_fire',
    'enchant': 'sorceress_enchant', 'meteor': 'sorceress_meteor', 'hydra': 'sorceress_cast_fire',
    'chargedBolt': 'sorceress_chargedbolt_[1-3]', 'lightning': 'sorceress_lightning_[1-3]',
    'chainLightning': 'sorceress_lightning_[1-3]', 'staticField': 'sorceress_cast_lightning',
    'telekinesis': 'sorceress_telekinesis', 'nova': 'sorceress_nova', 'teleport': 'sorceress_teleport',
    'thunderStorm': 'sorceress_thunder_cast', 'energyShield': 'sorceress_energyshield',
    'iceBolt': 'sorceress_icebolt_[1-3]', 'iceBlast': 'sorceress_icebolt_[1-3]',
    'frostNova': 'sorceress_frostnova', 'glacialSpike': 'sorceress_glacialspike_[1-3]',
    'blizzard': 'sorceress_cast_cold', 'frozenOrb': 'sorceress_cast_cold',
    'frozenArmor': 'sorceress_frozenarmor', 'shiverArmor': 'sorceress_shiverarmor', 'chillingArmor': 'sorceress_frozenarmor',
    'magicArrow': 'amazon_magicarrow_[1-3]', 'fireArrow': 'amazon_firearrow_[1-3]',
    'coldArrow': 'amazon_coldarrow_[1-3]', 'multipleShot': 'amazon_multi_arrow_[1-5]',
    'explodingArrow': 'amazon_firearrow_[1-3]', 'iceArrow': 'amazon_coldarrow_[1-3]',
    'guidedArrow': 'amazon_magicarrow_[1-3]', 'strafe': 'amazon_multi_arrow_[1-5]',
    'immolationArrow': 'amazon_firearrow_[1-3]', 'freezingArrow': 'amazon_coldarrow_[1-3]',
    'jab': 'amazon_jab_[1-4]', 'impale': 'amazon_impale_[1-4]', 'fend': 'amazon_jab_[1-4]',
    'powerStrike': 'amazon_lightning_[1-3]', 'chargedStrike': 'amazon_lightning_[1-3]',
    'lightningStrike': 'amazon_lightning_[1-3]', 'lightningBolt': 'amazon_lightning_[1-3]',
    'lightningFury': 'amazon_lightning_[1-3]', 'poisonJavelin': 'amazon_cast_poison',
    'plagueJavelin': 'amazon_cast_poison', 'valkyrie': 'amazon_valkyrie_cast',
    'dopplezon': 'amazon_valkyrie_appear', 'innerSight': 'amazon_eyeofzeus', 'slowMissiles': 'amazon_handofathena',
}
MAPPING.update({f'cast:{key}': value for key, value in SKILLS.items()})
for class_id in ('paladin', 'sorceress', 'amazon', 'necromancer', 'barbarian', 'druid', 'assassin'):
    MAPPING[f'hurt:{class_id}'] = f'{class_id}_hit_[1-5]'
    MAPPING[f'death:{class_id}'] = f'{class_id}_death_[1-3]'
for model, original in {
    'fallen': 'fallen', 'shaman': 'fallenshaman', 'zombie': 'zombie', 'skeleton': 'skeleton',
    'archer': 'corrupt', 'mage': 'vampire', 'goat': 'goatman', 'ghost': 'wraith',
    'mummy': 'mummy', 'beetle': 'beetle', 'maggot': 'sandmaggot', 'viper': 'serpentdemon',
    'spider': 'spider', 'flayer': 'pygmy', 'council': 'zakarumhigh', 'knight': 'megademon',
    'mauler': 'pinhead', 'venom': 'megademon', 'imp': 'imp', 'succubus': 'succubus',
    'frozen': 'yeti', 'lord': 'bloodlord', 'cow': 'moo', 'andariel': 'andariel',
    'duriel': 'duriel', 'mephisto': 'mephisto', 'diablo': 'diablo', 'baal': 'baal',
}.items():
    MAPPING[f'monsterDeath:{model}'] = original + '_death*'
for aura in ['blessedAim', 'cleansing', 'concentration', 'defiance', 'holyFire', 'meditation', 'might', 'prayer', 'redemption', 'resistCold', 'resistFire', 'resistLightning', 'salvation', 'sanctuary', 'thorns']:
    MAPPING[f'cast:{aura}'] = 'paladin_aura_' + aura.lower()
MAPPING.update({'cast:fanaticism': 'paladin_aura_fanatacism', 'cast:holyFreeze': 'paladin_aura_holywind', 'cast:holyShock': 'paladin_aura_holylight', 'cast:vigor': 'paladin_aura_stamina', 'cast:conviction': 'paladin_aura_purification'})


class CascStorage:
    def __init__(self, game: Path, dll_path: Path):
        self.dll = c.WinDLL(str(dll_path.resolve()), use_last_error=True)
        signatures = {
            'CascOpenStorage': [c.c_char_p, c.c_uint32, c.POINTER(c.c_void_p)],
            'CascOpenFile': [c.c_void_p, c.c_char_p, c.c_uint32, c.c_uint32, c.POINTER(c.c_void_p)],
            'CascReadFile': [c.c_void_p, c.c_void_p, c.c_uint32, c.POINTER(c.c_uint32)],
            'CascCloseFile': [c.c_void_p], 'CascCloseStorage': [c.c_void_p],
        }
        for name, args in signatures.items():
            function = getattr(self.dll, name)
            function.argtypes, function.restype = args, c.c_bool
        self.dll.CascGetFileSize.argtypes = [c.c_void_p, c.POINTER(c.c_uint32)]
        self.dll.CascGetFileSize.restype = c.c_uint32
        self.handle = c.c_void_p()
        if not self.dll.CascOpenStorage(str(game.resolve()).encode('mbcs'), 0, c.byref(self.handle)):
            raise OSError(c.get_last_error(), 'Cannot open local CASC storage')

    def read(self, name: str) -> bytes:
        handle = c.c_void_p()
        if not self.dll.CascOpenFile(self.handle, name.encode('utf-8'), 0, 0, c.byref(handle)):
            raise FileNotFoundError(name)
        try:
            high = c.c_uint32()
            size = self.dll.CascGetFileSize(handle, c.byref(high))
            if high.value or not 0 < size <= 32 * 1024 * 1024:
                raise ValueError(f'Unexpected audio file size: {size}')
            buffer, read = c.create_string_buffer(size), c.c_uint32()
            if not self.dll.CascReadFile(handle, buffer, size, c.byref(read)) or read.value != size:
                raise OSError(c.get_last_error(), f'Cannot read local file: {name}')
            return buffer.raw
        finally:
            self.dll.CascCloseFile(handle)

    def close(self):
        self.dll.CascCloseStorage(self.handle)


def table(storage, name):
    return list(csv.DictReader(io.StringIO(storage.read(
        f'data:data\\global\\excel\\{name}.txt').decode('utf-8-sig')), delimiter='\t'))


class ExtractedStorage:
    """Root contains global/excel and hd/global/sfx (the extracted Data folder)."""
    def __init__(self, root):
        self.root = root.resolve()

    def read(self, name):
        relative = name.removeprefix('data:data\\').replace('\\', '/')
        target = (self.root / relative).resolve()
        if not target.is_relative_to(self.root):
            raise ValueError('Resource path escapes extracted Data folder')
        return target.read_bytes()

    def close(self):
        pass


class SoundTable:
    def __init__(self, rows):
        self.rows = rows
        self.by_name = {r['Sound'].lower(): i for i, r in enumerate(rows) if r.get('Sound')}
        self.by_index = {r['Index']: i for i, r in enumerate(rows) if r.get('Index')}

    def candidates(self, row, quality):
        """Follow named/numeric redirects and groups, then try the classic row."""
        start = self.by_name[row['Sound'].lower()]
        seen = set()

        def visit(index):
            if index in seen:
                return
            seen.add(index)
            current = self.rows[index]
            redirect = (current.get('Redirect') or '').strip().lower()
            target = self.by_name.get(redirect, self.by_index.get(redirect))
            if quality == 'hd' and target is not None:
                yield from visit(target)
            yield current
            try:
                size = min(32, max(1, int(current.get('Group Size') or 1)))
            except ValueError:
                size = 1
            for other in range(index + 1, min(len(self.rows), index + size)):
                yield from visit(other)

        return list(visit(start))


def audio_paths(row, quality):
    filename = (row.get('FileName') or '').replace('\\', '/').strip().lower()
    if (not re.fullmatch(r'[a-z0-9_ ./-]+\.(flac|wav|ogg|mp3)', filename)
            or '..' in filename.split('/') or filename.startswith('/')
            or filename.rsplit('/', 1)[-1] in ('none.flac', 'none.wav')):
        return []
    filename = filename.removeprefix('data/')
    if quality == 'classic' and filename.startswith('hd/'):
        return []
    if filename.startswith(('hd/', 'global/')):
        return [filename]
    roots = ['hd/global/sfx/', 'global/sfx/'] if quality == 'hd' else ['global/sfx/']
    return [root + filename for root in roots]


def skill_mapping(storage):
    # Match stable skill IDs, including the four expansion classes, to the
    # installation's actual cast sounds instead of guessing sound row names.
    ids = {}
    source = (ROOT / 'src/expansion-skill-data.ts').read_text(encoding='utf-8')
    ids.update({number: key for key, number in re.findall(r'"(\w+)":\s*\{"number":(\d+)', source)})
    source = (ROOT / 'src/item-skill-definitions.ts').read_text(encoding='utf-8')
    ids.update({number: key for key, number in re.findall(r"\['(\w+)',(\d+),", source)})
    try:
        skills = table(storage, 'skills')
    except FileNotFoundError:
        return {}
    return {f'cast:{ids[r["Id"]]}': r['stsound'] for r in skills
            if r.get('Id') in ids and r.get('stsound')}


def import_pack(storage, destination, quality='hd', mapping=None):
    rows = table(storage, 'sounds')
    sounds = SoundTable(rows)
    manifest = {'version': 2, 'source': 'Locally installed Diablo II: Resurrected',
                'quality': quality, 'sounds': {}, 'files': {}, 'coverage': {}}
    missing = []
    mappings = mapping if mapping is not None else {**MAPPING, **skill_mapping(storage)}
    for cue, pattern in mappings.items():
        selected = [r for r in rows if fnmatch.fnmatchcase(r.get('Sound', ''), pattern)
                    and (quality != 'classic' or '_hd' not in r.get('Sound', '').lower())]
        files = []
        for base in selected:
            candidates = sounds.candidates(base, quality)
            # HD candidates are tried before classic files, including group members.
            choices = [(r, path) for r in candidates for path in audio_paths(r, quality)]
            if quality == 'hd':
                choices.sort(key=lambda pair: not pair[1].startswith('hd/'))
            preferred = []
            for row, original in choices:
                hd = original.startswith('hd/')
                if preferred and manifest['files'][preferred[0]]['hd'] and not hd:
                    continue
                relative = 'local/' + original
                if relative not in manifest['files']:
                    try:
                        data = storage.read('data:data\\' + original.replace('/', '\\'))
                    except FileNotFoundError:
                        continue
                    if not (data.startswith((b'fLaC', b'RIFF', b'OggS', b'ID3')) or data[:1] == b'\xff'):
                        raise ValueError(f'Unexpected audio format: {original}')
                    target = destination / original
                    target.parent.mkdir(parents=True, exist_ok=True)
                    target.write_bytes(data)
                    manifest['files'][relative] = {'sound': row['Sound'], 'source': original,
                        'hd': hd, 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()}
                if relative not in preferred:
                    preferred.append(relative)
                if len(preferred) >= 8:
                    break
            files.extend(preferred)
        files = list(dict.fromkeys(files))[:8]
        if files:
            manifest['sounds'][cue] = files
            manifest['coverage'][cue] = 'hd' if all(manifest['files'][f]['hd'] for f in files) else 'classic'
        else:
            missing.append(cue)
    if not manifest['sounds']:
        raise ValueError('No usable audio found; existing manifest was not replaced')
    manifest['missing'] = missing
    destination.mkdir(parents=True, exist_ok=True)
    temporary = destination / 'manifest.json.tmp'
    temporary.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
    temporary.replace(destination / 'manifest.json')
    return manifest


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument('--game', type=Path)
    source.add_argument('--extracted', type=Path, help='Extracted Data folder containing global/excel/sounds.txt')
    parser.add_argument('--casc-dll', type=Path)
    parser.add_argument('--quality', choices=['hd', 'classic'], default='hd')
    args = parser.parse_args()
    destination = ROOT / 'public/audio/local'
    if args.game and not args.casc_dll:
        parser.error('--game requires --casc-dll')
    storage = ExtractedStorage(args.extracted) if args.extracted else CascStorage(args.game, args.casc_dll)
    try:
        manifest = import_pack(storage, destination, args.quality)
    finally:
        storage.close()
    print(json.dumps({'cues': len(manifest['sounds']), 'files': len(manifest['files']),
        'hdCues': sum(v == 'hd' for v in manifest['coverage'].values()),
        'classicCues': sum(v == 'classic' for v in manifest['coverage'].values()),
        'bytes': sum(f['bytes'] for f in manifest['files'].values()), 'missing': manifest['missing']}, ensure_ascii=False))


if __name__ == '__main__':
    main()
