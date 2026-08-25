export const SIGLIP_TEXT_MODEL = "google/siglip2-so400m-patch16-naflex";
export const SIGLIP_EMBED_DIM = 1152;

type TextEmbeddingRequestOptions = {
  baseUrl: string | null | undefined;
  token?: string;
  fetcher?: typeof fetch;
  timeoutMs?: number;
};

type TextEmbeddingResponse = {
  model?: unknown;
  vectors?: unknown;
};

/** 맥미니 응답이 현재 사진 임베딩과 같은 모델·차원의 벡터인지 확인한다. */
export function parseTextEmbeddingResponse(value: unknown): number[] | null {
  if (!value || typeof value !== "object") return null;
  const response = value as TextEmbeddingResponse;
  if (response.model !== SIGLIP_TEXT_MODEL) return null;
  if (!Array.isArray(response.vectors) || response.vectors.length !== 1) return null;

  const vector = response.vectors[0];
  if (!Array.isArray(vector) || vector.length !== SIGLIP_EMBED_DIM) return null;
  if (!vector.every((item) => typeof item === "number" && Number.isFinite(item))) return null;
  return vector as number[];
}

/** 인증된 맥미니 엔드포인트에서 검색어 벡터 한 개를 받는다. */
export async function requestTextEmbedding(
  rawQuery: string,
  options: TextEmbeddingRequestOptions
): Promise<number[] | null> {
  const baseUrl = options.baseUrl?.trim().replace(/\/$/, "");
  const query = rawQuery.trim();
  if (!baseUrl || !query || query.length > 120) return null;

  try {
    const response = await (options.fetcher ?? fetch)(`${baseUrl}/embed-text`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(options.token ? { "x-samae-token": options.token } : {}),
      },
      body: JSON.stringify({ texts: [query] }),
      signal: AbortSignal.timeout(options.timeoutMs ?? 4_000),
    });
    if (!response.ok) return null;
    return parseTextEmbeddingResponse(await response.json());
  } catch {
    return null;
  }
}

/** Supabase의 .in() 메타데이터 조회가 잃어버린 벡터 RPC 거리순을 복원한다. */
export function orderByVectorIds<T extends { id: string }>(
  rows: T[],
  orderedIds: string[]
): T[] {
  const byId = new Map(rows.map((row) => [row.id, row]));
  return orderedIds.flatMap((id) => {
    const row = byId.get(id);
    return row ? [row] : [];
  });
}
