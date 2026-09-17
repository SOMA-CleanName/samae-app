const { test } = require('node:test');
const assert = require('node:assert/strict');
const { inventory, candidateId } = require('./collect-mood-vocabulary.cjs');
test('repeated source entries are idempotent; alternate sources remain traceable', () => {
  const data = inventory();
  data.add('one', '1', '  따뜻한   빛 ');
  data.add('one', '1', '따뜻한 빛');
  data.add('two', '2', '따뜻한 빛');
  assert.equal(data.candidates.size, 1);
  assert.equal(data.entries.size, 2);
});
test('different senses/axes stay separate and raw inventories are not promoted', () => {
  assert.notEqual(candidateId('부드러운', '빛'), candidateId('부드러운', '질감'));
  const data = inventory(); data.add('one','1','질투');
  assert.equal([...data.candidates.values()][0].selection_status, 'collected');
});
