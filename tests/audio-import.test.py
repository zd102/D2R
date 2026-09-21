"""Importer regression tests; synthetic fixtures, no installed game required."""
import csv
import importlib.util
import io
import json
import tempfile
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('audio_import', Path(__file__).parents[1] / 'scripts/import-d2-audio.py')
audio = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audio)


class Storage:
    def __init__(self, rows, files):
        out = io.StringIO()
        writer = csv.DictWriter(out, ['Sound', 'Index', 'Redirect', 'FileName', 'Group Size'], delimiter='\t')
        writer.writeheader()
        writer.writerows(rows)
        self.files = {'global/excel/sounds.txt': out.getvalue().encode(), **files}

    def read(self, name):
        key = name.removeprefix('data:data\\').replace('\\', '/')
        if key not in self.files:
            raise FileNotFoundError(key)
        return self.files[key]


class ImportTests(unittest.TestCase):
    rows = [
        {'Sound': 'potion', 'Index': '10', 'Redirect': 'potion_hd', 'FileName': 'item/old.wav'},
        {'Sound': 'potion_hd', 'Index': '11', 'FileName': 'item/new.flac', 'Group Size': '2'},
        {'Sound': 'potion_hd_2', 'Index': '12', 'FileName': 'item/new2.flac'},
    ]
    files = {'global/sfx/item/old.wav': b'RIFFclassic',
             'hd/global/sfx/item/new.flac': b'fLaChd1',
             'hd/global/sfx/item/new2.flac': b'fLaChd2'}

    def pack(self, directory, rows=None, files=None, quality='hd'):
        return audio.import_pack(Storage(rows or self.rows, self.files if files is None else files),
                                 Path(directory), quality, {'potion': 'potion'})

    def test_hd_redirect_and_group_preserve_original_bytes(self):
        with tempfile.TemporaryDirectory(prefix='d2r-audio-test-') as directory:
            pack = self.pack(directory)
            self.assertEqual(pack['coverage'], {'potion': 'hd'})
            self.assertEqual(len(pack['sounds']['potion']), 2)
            for filename in pack['sounds']['potion']:
                self.assertEqual((Path(directory) / filename.removeprefix('local/')).read_bytes(),
                                 self.files[filename.removeprefix('local/')])

    def test_missing_hd_falls_back_and_classic_mode_ignores_redirect(self):
        with tempfile.TemporaryDirectory(prefix='d2r-audio-test-') as directory:
            for pack in [self.pack(directory, files={'global/sfx/item/old.wav': b'RIFFclassic'}),
                         self.pack(directory, quality='classic')]:
                self.assertEqual(pack['coverage'], {'potion': 'classic'})
                self.assertEqual(pack['sounds']['potion'], ['local/global/sfx/item/old.wav'])

    def test_numeric_redirect_and_cycles_are_bounded(self):
        rows = [dict(r) for r in self.rows]
        rows[0]['Redirect'] = '11'
        rows[1]['Redirect'] = '10'
        with tempfile.TemporaryDirectory(prefix='d2r-audio-test-') as directory:
            self.assertEqual(len(self.pack(directory, rows=rows)['sounds']['potion']), 2)

    def test_classic_wildcard_never_imports_hd_rows(self):
        with tempfile.TemporaryDirectory(prefix='d2r-audio-test-') as directory:
            pack = audio.import_pack(Storage(self.rows, self.files), Path(directory),
                                     'classic', {'potion': 'potion*'})
            self.assertEqual(pack['sounds']['potion'], ['local/global/sfx/item/old.wav'])
        self.assertEqual(audio.audio_paths({'FileName': 'hd/global/sfx/test.flac'}, 'classic'), [])

    def test_empty_import_does_not_replace_existing_manifest(self):
        with tempfile.TemporaryDirectory(prefix='d2r-audio-test-') as directory:
            before = self.pack(directory)
            with self.assertRaisesRegex(ValueError, 'No usable audio'):
                self.pack(directory, files={})
            self.assertEqual(json.loads((Path(directory) / 'manifest.json').read_text()), before)

    def test_unsafe_paths_and_silent_placeholders_are_rejected(self):
        for filename in ['../../outside.wav', '/outside.wav', 'C:/outside.wav', 'none.wav', 'item/none.flac']:
            self.assertEqual(audio.audio_paths({'FileName': filename}, 'hd'), [])
        self.assertEqual(audio.audio_paths({'FileName': 'data\\hd\\global\\sfx\\item\\new.flac'}, 'hd'),
                         ['hd/global/sfx/item/new.flac'])

    def test_expansion_casts_use_installation_skill_ids(self):
        storage = Storage(self.rows, self.files)
        storage.files['global/excel/skills.txt'] = b'Id\tstsound\n66\tnecromancer_curse\n251\tassassin_fire\n'
        mappings = audio.skill_mapping(storage)
        self.assertEqual(mappings['cast:amplifyDamage'], 'necromancer_curse')
        self.assertEqual(mappings['cast:fireBlast'], 'assassin_fire')
        for name in ['necromancer', 'barbarian', 'druid', 'assassin']:
            self.assertIn('hurt:' + name, audio.MAPPING)


if __name__ == '__main__':
    unittest.main()
