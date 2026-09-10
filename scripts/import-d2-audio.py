"""Read classic D2 sounds from a locally installed D2R CASC storage (Windows x64).

Uses a caller-supplied CascLib 3.x DLL. Never modifies the game installation.
Original audio and the generated manifest stay in gitignored public/audio/local.
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
for class_id in ('paladin', 'sorceress', 'amazon'):
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


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--game', type=Path, required=True)
    parser.add_argument('--casc-dll', type=Path, required=True)
    args = parser.parse_args()
    destination = ROOT / 'public/audio/local'
    destination.mkdir(parents=True, exist_ok=True)
    storage = CascStorage(args.game, args.casc_dll)
    manifest = {'version': 1, 'source': 'Locally installed Diablo II: Resurrected; classic sound rows', 'sounds': {}, 'files': {}}
    missing = []
    try:
        table = storage.read(r'data:data\global\excel\sounds.txt').decode('utf-8-sig')
        rows = list(csv.DictReader(io.StringIO(table), delimiter='\t'))
        for cue, pattern in MAPPING.items():
            selected = [r for r in rows if fnmatch.fnmatchcase(r['Sound'], pattern) and '_hd' not in r['Sound'].lower() and '_hd' not in r['FileName'].lower() and r['FileName'] not in ('', 'none.flac', 'none.wav')][:6]
            files = []
            for row in selected:
                original = row['FileName'].replace('\\', '/')
                # Paths are derived from the table but may never escape the local pack.
                if '..' in original.split('/') or not re.fullmatch(r'[a-zA-Z0-9_ ./-]+\.(flac|wav)', original):
                    continue
                relative = 'local/' + original.lower()
                if relative not in manifest['files']:
                    try:
                        data = storage.read('data:data\\global\\sfx\\' + original.replace('/', '\\'))
                    except (FileNotFoundError, OSError):
                        missing.append(row['Sound'])
                        continue
                    if not (data.startswith(b'fLaC') or data.startswith(b'RIFF')):
                        raise ValueError(f'Unexpected audio format: {original}')
                    target = destination / original.lower()
                    target.parent.mkdir(parents=True, exist_ok=True)
                    target.write_bytes(data)
                    manifest['files'][relative] = {'sound': row['Sound'], 'source': original, 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()}
                files.append(relative)
            if files:
                manifest['sounds'][cue] = list(dict.fromkeys(files))
            else:
                missing.append(cue)
    finally:
        storage.close()
    # Atomic manifest publication: a failed extraction never leaves half-written JSON.
    temporary = destination / 'manifest.json.tmp'
    temporary.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
    temporary.replace(destination / 'manifest.json')
    print(json.dumps({'cues': len(manifest['sounds']), 'files': len(manifest['files']), 'bytes': sum(f['bytes'] for f in manifest['files'].values()), 'missing': missing}, ensure_ascii=False))
    if not manifest['sounds']:
        raise SystemExit('No usable audio found')


if __name__ == '__main__':
    main()
