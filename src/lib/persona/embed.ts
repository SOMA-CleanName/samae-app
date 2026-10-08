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
  if (url) return url.replace(/\/$/, "");
  // 개발 기계에서는 상주 서버가 같은 컴퓨터에 뜬다 — 검색(siglip-text-search.ts)과 같은 기본값을 쓴다.
  return process.env.NODE_ENV === "development" ? "http://127.0.0.1:8077" : null;
}

/** 임베딩 서비스가 설정돼 있는지 (호출부에서 폴백 판단용) */
export function embedConfigured(): boolean {
  return baseUrl() !== null;
}

/**
 * base64 JPEG 배열 → 벡터. 서비스가 없거나 실패하면 null.
 * timeoutMs — 사람이 기다리는 화면(사진으로 검색)은 페르소나 분석보다 짧게 끊는다.
 */
export async function embedImages(
  imagesB64: string[],
  { timeoutMs = TIMEOUT_MS, signal }: { timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<EmbedResult | null> {
  const url = baseUrl();
  if (!url || imagesB64.length === 0) return null;

  try {
    const res = await fetch(`${url}/embed`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        // 서비스가 공개 인터넷(Funnel)에 노출된 경우의 인증
        ...(process.env.PERSONA_SERVICE_TOKEN
          ? { "x-samae-token": process.env.PERSONA_SERVICE_TOKEN }
          : {}),
      },
      body: JSON.stringify({ images: imagesB64 }),
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs),
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
