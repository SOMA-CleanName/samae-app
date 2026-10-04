// 가족 → 사진 색인을 손으로 다시 쓴다(docs/47 §9). 검수 · 이름 화면에서 저장하면 저절로 다시 쓰이므로,
// 파일을 직접 고쳤을 때(큰 무드 다시 묶기 · 태그 다시 계산)만 돌린다.
//   npx tsx --conditions=react-server scripts/embed/build-family-photo-index.mts
import { writeFamilyIndex } from "../../src/lib/mood-photo-layers-data.ts";
import index from "../../src/lib/mood-family-photos.json" with { type: "json" };

await writeFamilyIndex();
console.log(`색인 다시 씀 — 이전 ${index.made_at} (다시 읽어 확인: src/lib/mood-family-photos.json)`);
