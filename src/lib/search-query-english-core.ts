// 한국어 검색어를 SigLIP 이 알아듣는 영어 문구로 바꾸는 지시문. 순수 로직만 둔다.
//
// SigLIP2 는 영어 중심으로 학습돼 한국어 한 단어를 약하게 읽는다. "노을" 로 찾으면 한낮
// 골목길이 진짜 노을 사진보다 위에 오고, "sunset" 으로 찾으면 상위가 노을로 채워진다
// (docs/40 §9-1 의 낱말 실측과 같은 결론). 번역이 아니라 "그 말에 맞는 사진이 어떻게
// 생겼나" 를 쓰게 한다 — 무드 어휘 영어 문구(docs/40 §9-2)와 같은 원칙이다.

export const QUERY_ENGLISH_MODEL = "qwen3:8b";

export const QUERY_ENGLISH_SYSTEM = `You rewrite a Korean photo-search query as a short English phrase for an image-search engine.

Write what a matching PHOTO LOOKS LIKE — the visible scene, light, colour, mood, subject.
Rules:
- 2 to 6 words. No articles, no punctuation, no quotes.
- Not a dictionary gloss. "쓸쓸한" is not "lonely"; it is "empty quiet lonely scene".
- Keep people, places and actions the query mentions.
- Never answer in Korean. Never explain. Output the phrase only.`;

// 예시는 시험할 말과 글자가 겹치지 않게 고른다. "청량한" 을 넣었더니 "청순한" 을
// 그대로 베껴 "cool fresh summer light" 로 답했다.
export const QUERY_ENGLISH_SHOTS: [string, string][] = [
  ["쓸쓸한", "empty quiet lonely scene"],
  ["몽글몽글한", "soft fluffy dreamy texture"],
  ["흑백 인물", "black and white portrait"],
  ["한강 커플", "couple by seoul riverside"],
];

export function queryEnglishMessages(query: string) {
  const messages = [{ role: "system", content: QUERY_ENGLISH_SYSTEM }];
  for (const [korean, english] of QUERY_ENGLISH_SHOTS) {
    messages.push({ role: "user", content: korean }, { role: "assistant", content: english });
  }
  messages.push({ role: "user", content: query });
  return messages;
}

/** 모델 답에서 문구만 남긴다. 한글이 섞였거나 비었으면 쓸 수 없는 답이다. */
export function cleanEnglishPhrase(raw: string): string | null {
  let text = raw;
  if (text.includes("</think>")) text = text.split("</think>").pop() ?? "";
  text = text.split("\n").map((line) => line.trim()).find(Boolean) ?? "";
  text = text.replace(/^["'`]+|["'`.]+$/g, "").trim();
  if (!text || /[가-힣]/.test(text) || text.length > 80) return null;
  return text;
}
