const { test } = require('node:test');
const assert = require('node:assert/strict');
const { classify } = require('./classify-mood-vocabulary.cjs');
const c = (label, axis='unassigned') => ({ id:'x', label, axis, selection_status:'collected' });
const e = (semanticCategory, partOfSpeech='명사') => ({ source_id:'dictionary', metadata:{ semanticCategory, partOfSpeech } });
test('preserves editorial axes without promoting candidates', () => {
  const row=c('따뜻한 분위기','온도');
  assert.equal(classify(row,[e('인간 > 감정')]).axis,'온도');
  assert.equal(row.selection_status,'collected');
});
test('uses direct meanings but abstains on homonyms', () => {
  assert.equal(classify(c('기쁨'),[e('인간 > 감정')]).axis,'감정');
  assert.equal(classify(c('기쁨'),[e('인간 > 감정'),e('개념 > 색깔')]).kind,'pending');
  assert.equal(classify(c('봄'),[e('개념 > 시간')]).axis,'계절');
});
test('does not treat polarity or arbitrary substring as a photo mood', () => {
  assert.equal(classify(c('가을학교'),[]).kind,'pending');
  assert.equal(classify(c('좋아'),[{source_id:'knu',metadata:{polarity:2}}]).kind,'pending');
  assert.equal(classify(c('강아지'),[e('동식물 > 동물류')]).kind,'general');
  assert.equal(classify(c('은'),[e(undefined,'조사')]).kind,'general');
});
