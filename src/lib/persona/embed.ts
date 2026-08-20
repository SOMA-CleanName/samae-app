// 로컬 임베딩 서비스 클라이언트 (scripts/embed/serve.py).
//
// 왜 별도 서비스인가: SigLIP2 는 파이썬·torch 위에서 돈다. Vercel 함수에는 못 올린다.
// 대신 맥미니에 상주시키고 HTTP 로 부른다. 사진 9장에 ~1.1초(MPS 실측).
//
// ⚠️ 이 경로는 **없어도 서비스가 돌아가야 한다**. 서비스가 꺼져 있거나 느리면
// 조용히 null 을 주고, 호출부는 기존 무드 큐레이션으로 폴백한다.
// 임베딩은 추천을 '더 좋게' 만드는 것이지, 분석의 필수 조건이 아니다.
import "server-only";

const TIMEOUT_MS = 12_000;

export type EmbedResult = {
  /** 사진 1장당 1개, L2 정규화된 1152차원 벡터 */
  vectors: number[][];
  /** 전체 평균(정규화) — 피드 대표 벡터가 필요할 때 */
  mean: number[];
  inferMs: number;
};

function baseUrl(): string | null {
  const url = process.env.PERSONA_EMBED_URL?.trim();
  return url && url.length > 0 ? url.replace(/\/$/, "") : null;
}

/** 임베딩 서비스가 설정돼 있는지 (호출부에서 폴백 판단용) */
export function embedConfigured(): boolean {
  return baseUrl() !== null;
}

/** base64 JPEG 배열 → 벡터. 서비스가 없거나 실패하면 null. */
export async function embedImages(imagesB64: string[]): Promise<EmbedResult | null> {
  const url = baseUrl();
  if (!url || imagesB64.length === 0) return null;

  try {
    const res = await fetch(`${url}/embed`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ images: imagesB64 }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      console.warn(`[persona] 임베딩 서비스 ${res.status}`);
      return null;
    }
    const j = (await res.json()) as { vectors?: number[][]; mean?: number[]; infer_ms?: number };
    if (!Array.isArray(j.vectors) || j.vectors.length === 0 || !Array.isArray(j.mean)) return null;
    return { vectors: j.vectors, mean: j.mean, inferMs: j.infer_ms ?? 0 };
  } catch (e) {
    // 타임아웃·연결 거부 모두 여기로 — 분석을 멈추지 않는다
    console.warn("[persona] 임베딩 서비스 호출 실패:", e instanceof Error ? e.message : e);
    return null;
  }
}
