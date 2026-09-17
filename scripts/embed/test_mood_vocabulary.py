import tempfile
from pathlib import Path
import unittest
from extract_mood_dictionary import extract, extract_senses


def importorskip(name):
    try:
        return __import__(name)
    except ImportError as error:
        raise unittest.SkipTest(f'{name} unavailable in this environment: {error}')

# One entry: a definition per sense, plus quoted examples and translations we must not collect.
XML = ('<LexicalResource><LexicalEntry val="1"><feat att="partOfSpeech" val="형용사"/>'
       '<feat att="semanticCategory" val="개념 &gt; 촉감"/>'
       '<Lemma><feat att="writtenForm" val="포근하다"/></Lemma>'
       '<Sense val="1"><feat att="definition" val="bad\x08control 하다"/>'
       '<SenseExample><feat att="example" val="not collected"/></SenseExample>'
       '<Equivalent><feat att="definition" val="translated definition"/></Equivalent></Sense>'
       '<Sense val="2"><feat att="annotation" val="ignored"/>'
       '<feat att="definition" val="따뜻하고   부드럽다"/></Sense>'
       '<Sense val="3"><SenseExample><feat att="example" val="no definition here"/></SenseExample></Sense>'
       '</LexicalEntry></LexicalResource>')


class MoodVocabularyTest(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.addCleanup(self.folder.cleanup)
        self.path = Path(self.folder.name) / 'x.xml'
        self.path.write_text(XML, encoding='utf-8')

    def test_top_results_limit_duplicate_album_but_keep_solo_photos(self):
        # Reported as skipped, never as passing, where the embedding stack is not installed.
        np = importorskip('numpy')
        rank_diverse = importorskip('validate_mood_vocabulary').rank_diverse
        photos = [{'id':str(i), 'album_id':'a' if i<4 else None} for i in range(8)]
        self.assertEqual(rank_diverse(np.arange(8)[::-1], photos), [0,1,4,5,6,7])

    def test_dictionary_extracts_headword_not_examples_or_translation_and_cleans_invalid_control(self):
        self.assertEqual(list(extract(self.path)), [{'entry_key':'1','label':'포근하다',
            'metadata':{'partOfSpeech':'형용사','semanticCategory':'개념 > 촉감'}}])

    def test_senses_keep_korean_definitions_with_ids_and_skip_translations_and_examples(self):
        rows = list(extract_senses(self.path))
        self.assertEqual(rows[0]['label'], '포근하다')
        self.assertEqual(rows[0]['senses'], [{'sense_id':'1','definition':'badcontrol 하다'},
                                             {'sense_id':'2','definition':'따뜻하고 부드럽다'}])

    def test_sense_without_definition_is_dropped_rather_than_invented(self):
        self.assertNotIn('3', [s['sense_id'] for s in list(extract_senses(self.path))[0]['senses']])


if __name__ == '__main__':
    unittest.main()
