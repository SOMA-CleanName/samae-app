import "server-only";
import { loadAxisBundle } from "@/lib/mood-axes-data";
import { loadTermsBundle } from "@/lib/mood-terms-data";
import {
  cleanEnglishPhrase,
  QUERY_ENGLISH_MODEL,
  queryEnglishMessages,
} from "@/lib/search-query-english-core";

const OLLAMA_URL = (process.env.OLLAMA_URL ?? "http://127.0.0.1:11434").replace(/\/$/, "");

/** 검색어를 로컬 qwen 으로 영어 문구로 바꾼다. 실패는 null — 호출하는 쪽이 한국어로 되돌아간다. */
export async function toEnglishQuery(query: string, timeoutMs = 8_000): Promise<string | null> {
  try {
    const response = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: QUERY_ENGLISH_MODEL,
        messages: queryEnglishMessages(query),
        stream: false,
        think: false,
        options: { temperature: 0, num_predict: 20 },
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as { message?: { content?: string } };
    return cleanEnglishPhrase(payload.message?.content ?? "");
  } catch {
    return null;
  }
}

/**
 * 무드 어휘 사전(docs/40)에 있는 말이면 그 대표의 영어 문구를 돌려준다.
 * 사전에서 모은 어휘라 힙한·빈티지 같은 요즘 말은 없다 — 있는 말일 때만 쓴다.
 */
export async function vocabularyPrompt(query: string): Promise<{ head: string; prompt: string } | null> {
  const needle = query.trim();
  if (!needle) return null;
  const [terms, axes] = await Promise.all([loadTermsBundle(), loadAxisBundle()]);
  const row = terms.rows.find((r) => r.head === needle || r.terms.includes(needle) || needle in r.aliases);
  if (!row) return null;
  const prompt = axes.groups.find((g) => g.head === row.head)?.prompts[0];
  return prompt ? { head: row.head, prompt } : null;
}
