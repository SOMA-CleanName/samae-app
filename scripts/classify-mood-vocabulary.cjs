// Conservative lexical grouping, not photo suitability approval or usage activation.
const fs = require('node:fs');
const path = require('node:path');
const VERSION = 'mood-lexical-v1';
const DIRECT = new Map([
  ['인간 > 감정', '감정'], ['사회 생활 > 인간관계', '관계'],
  ['개념 > 색깔', '색감'], ['개념 > 온도', '온도'],
  ['개념 > 밝기', '빛'], ['개념 > 속도', '에너지'],
]);
const ALIASES = {
  감정: '행복 행복하다 행복한 설레다 설렘 설레는 즐겁다 즐거운 슬프다 슬픈 쓸쓸하다 쓸쓸한 그립다 그리운 아련하다 아련한 평온하다 평온한',
  관계: '다정 다정하다 다정한 친밀 친밀하다 친밀한 애틋하다 애틋한 로맨틱 로맨틱하다 로맨틱한 사랑스럽다 사랑스러운 수줍다 수줍은 고독 고독하다 고독한',
  스타일: '몽환 몽환적 몽환적인 몽환적이다 힙하다 힙한 빈티지 빈티지한 레트로 레트로한 우아하다 우아한 세련되다 세련된 시크 시크하다 시크한 모던 모던하다 모던한 클래식 클래식한 초현실적 초현실적인',
  온도: '포근하다 포근한 따스하다 따스한 서늘하다 서늘한 쌀쌀하다 쌀쌀한 청량하다 청량한 상쾌하다 상쾌한 후덥지근하다 후덥지근한',
  계절: '봄 봄날 봄기운 봄빛 봄철 초봄 늦봄 여름 한여름 초여름 여름날 여름철 가을 가을빛 가을날 가을철 초가을 늦가을 겨울 겨울날 겨울철 한겨울 초겨울 늦겨울',
  빛: '역광 노을빛 새벽빛 햇빛 햇살 네온빛 조명 달빛 눈부시다 눈부신 화사하다 화사한',
  색감: '파스텔 파스텔톤 베이지톤 분홍빛 초록빛 푸른빛 황금빛 흑백 단색 다채롭다 다채로운',
  질감: '매끈하다 매끈한 보송하다 보송한 거칠거칠하다 까칠까칠하다 입자감 소프트포커스 매트하다 매트한 윤기 질감 흐릿하다 흐릿한 뿌옇다 뿌연',
  에너지: '역동적 역동적인 역동적이다 정적 정적인 경쾌하다 경쾌한 느긋하다 느긋한 발랄하다 발랄한 생동감 생동감있다 고요하다 고요한 잔잔하다 잔잔한 분주하다 분주한',
  공간: '아늑하다 아늑한 웅장하다 웅장한 미니멀 미니멀한 도시적 도시적인 전원적 전원적인 한적하다 한적한',
};
const EXACT = new Map(Object.entries(ALIASES).flatMap(([axis, words]) => words.split(' ').map(word => [word, axis])));
// Only explicitly concrete/institutional noun categories are separated as general vocabulary.
const GENERAL = new Set([
  '정치와 행정 > 사법 및 치안 주체', '정치와 행정 > 정치 및 행정 주체', '정치와 행정 > 공공 기관', '정치와 행정 > 무기',
  '경제 생활 > 경제 수단', '경제 생활 > 경제 행위 주체', '경제 생활 > 경제 행위 장소',
  '교육 > 교육 기관', '교육 > 학교 시설', '교육 > 교수 학습 주체', '교육 > 학습 관련 사물', '교육 > 전공과 교과목',
  '인간 > 신체 부위', '인간 > 신체 내부 구성', '삶 > 약품류', '삶 > 치료 시설',
  '식생활 > 음식', '식생활 > 식재료', '식생활 > 조리 도구', '식생활 > 식사 도구', '식생활 > 음료',
  '식생활 > 식생활 관련 장소', '식생활 > 과일', '식생활 > 채소', '식생활 > 곡류',
  '동식물 > 동물류', '동식물 > 식물류', '동식물 > 곤충류', '동식물 > 동물의 부분', '동식물 > 식물의 부분',
  '사회 생활 > 직업', '사회 생활 > 직위', '사회 생활 > 교통 수단', '사회 생활 > 교통 이용 장소',
  '주생활 > 생활 용품', '주생활 > 건물 종류', '의생활 > 옷 종류', '의생활 > 모자, 신발, 장신구',
]);
const FUNCTION_WORDS = new Set(['조사', '어미', '접사', '대명사', '수사', '보조 동사', '보조 형용사']);

function classify(candidate, entries) {
  const categories = [...new Set(entries.map(e => e.metadata.semanticCategory).filter(Boolean))];
  const pos = [...new Set(entries.map(e => e.metadata.partOfSpeech).filter(Boolean))];
  const base = { candidate_id: candidate.id, version: VERSION,
    evidence: { categories, parts_of_speech: pos, photo_suitability: 'not_validated',
      source_ids: [...new Set(entries.map(e => e.source_id))] } };
  const result = (kind, axis, rule) => ({ ...base, kind, axis, rule });
  if (candidate.axis !== 'unassigned') return result('mood', candidate.axis, 'existing_editorial_axis_preserved');
  const axes = [...new Set(categories.map(c => DIRECT.get(c)).filter(Boolean))];
  const explicit = EXACT.get(candidate.label);
  // Mixed senses remain pending instead of silently selecting one meaning.
  if (axes.length > 1 || (explicit && axes.some(a => a !== explicit))) return result('pending', null, 'conflicting_axes');
  if (explicit && categories.length > 1 && categories.some(c => GENERAL.has(c))) return result('pending', null, 'ambiguous_dictionary_senses');
  if (explicit) return result('mood', explicit, 'explicit_photo_vocabulary_alias');
  if (axes.length === 1 && categories.every(c => DIRECT.has(c))) return result('mood', axes[0], 'dictionary_semantic_category');
  if (axes.length) return result('pending', null, 'ambiguous_dictionary_senses');
  if (pos.length && pos.every(p => FUNCTION_WORDS.has(p))) return result('general', null, 'grammatical_function_word');
  if (pos.length && pos.every(p => p === '명사') && categories.length && categories.every(c => GENERAL.has(c))) {
    return result('general', null, 'concrete_or_institutional_noun');
  }
  return result('pending', null, categories.length ? 'semantic_category_not_specific_enough' : 'no_semantic_evidence');
}

function build(collection) {
  const entries = new Map();
  for (const entry of collection.entries) {
    if (!entries.has(entry.candidate_id)) entries.set(entry.candidate_id, []);
    entries.get(entry.candidate_id).push(entry);
  }
  const rows = collection.candidates.map(c => classify(c, entries.get(c.id) ?? []));
  const counts = {};
  for (const row of rows) { const key = row.axis ?? row.kind; counts[key] = (counts[key] ?? 0) + 1; }
  return { version: VERSION, counts, rows };
}
module.exports = { classify, build };
if (require.main === module) {
  const out = path.join(__dirname, 'embed/out/mood-vocabulary');
  const collection = JSON.parse(fs.readFileSync(path.join(out, 'collection.json'), 'utf8'));
  const data = build(collection);
  fs.writeFileSync(path.join(out, 'classification.json'), JSON.stringify(data));
  console.log(JSON.stringify({ total: data.rows.length, counts: data.counts }));
}
