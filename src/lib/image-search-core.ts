/**
 * 사진으로 검색 — 브라우저와 서버가 함께 쓰는 값·검사. (docs/42 §3)
 *
 * 올린 사진은 **어디에도 저장하지 않는다.** 브라우저가 줄여서 서버로 보내고, 서버는 벡터로 바꾼 뒤 버린다.
 * 결과 화면이 쓸 사진은 그 브라우저 탭에만(sessionStorage) 남는다.
 */

/** 줄일 긴 변(px). SigLIP 은 patch_budget 256 으로 사진을 작게 본다 — 더 키워도 결과가 달라지지 않고 전송만 커진다. */
export const IMAGE_SEARCH_MAX_EDGE = 512;
/** 줄인 뒤 허용하는 최대 크기. 512px JPEG 는 보통 100KB 안팎이다. */
export const IMAGE_SEARCH_MAX_BYTES = 1_000_000;
/** 브라우저가 못 줄였을 때(HEIC 등)를 걸러내기 위한 목록 — 줄인 결과는 늘 JPEG 다. */
export const IMAGE_SEARCH_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
/** 결과 화면이 읽는 자리 — 이 탭에서만 산다. */
export const IMAGE_SEARCH_SESSION_KEY = "samae:image-search";
/** 결과 화면 주소 — 사진은 주소에 담지 않는다(§7-1). */
export const IMAGE_SEARCH_RESULT_PATH = "/search/image";

/** 긴 변을 maxEdge 로 맞춘 크기(원본이 더 작으면 그대로). 정수로 준다. */
export function fitWithin(
  width: number,
  height: number,
  maxEdge = IMAGE_SEARCH_MAX_EDGE,
): { width: number; height: number } {
  if (!(width > 0) || !(height > 0)) return { width: 0, height: 0 };
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

export type ParsedImage = { mime: string; base64: string; bytes: number };

/**
 * `data:image/jpeg;base64,...` 를 쪼개고 형식·크기를 본다. 맞지 않으면 null —
 * 왜 아닌지는 굳이 나누지 않는다(호출하는 쪽이 같은 안내를 보여준다).
 */
export function parseImageDataUrl(value: unknown, maxBytes = IMAGE_SEARCH_MAX_BYTES): ParsedImage | null {
  if (typeof value !== "string") return null;
  const match = /^data:([a-z]+\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/i.exec(value.trim());
  if (!match) return null;
  const mime = match[1].toLowerCase();
  if (!(IMAGE_SEARCH_TYPES as readonly string[]).includes(mime)) return null;
  const base64 = match[2];
  // base64 4글자가 3바이트다. 끝의 '=' 는 채움이라 뺀다.
  const bytes = Math.floor((base64.length * 3) / 4) - (base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0);
  if (bytes <= 0 || bytes > maxBytes) return null;
  return { mime, base64, bytes };
}

/**
 * 사진 한 장을 가리키는 짧은 키. 결과 격자가 **사진마다 다른 자리**에 저장하게 쓴다 —
 * 같은 주소(/search/image)라 키를 안 가르면 앞 사진의 결과가 되살아난다(2026-09-28).
 */
export function imageSearchKey(dataUrl: string): string {
  let hash = 0x811c9dc5;   // FNV-1a 32비트
  for (let i = 0; i < dataUrl.length; i += 1) {
    hash ^= dataUrl.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `${dataUrl.length.toString(36)}-${(hash >>> 0).toString(36)}`;
}
