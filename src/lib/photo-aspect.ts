// 사진 상세 진입 시 스켈레톤을 실제 사진과 같은 비율로 그리기 위한 보관소.
// 갤러리/추천 카드 클릭 시 그 사진의 가로세로 비율(width/height)을 sessionStorage에 저장하고,
// 상세 loading.tsx(클라이언트)가 현재 사진 id로 읽어 동일 비율의 사진 자리를 렌더한다.
const key = (id: string) => `samae:ar:${id}`;

export function rememberPhotoAspect(
  id: string,
  width?: number | null,
  height?: number | null
) {
  if (!id || !width || !height) return;
  try {
    sessionStorage.setItem(key(id), String(width / height));
  } catch {
    /* 무시 */
  }
}

export function readPhotoAspect(id: string): number | null {
  if (!id) return null;
  try {
    const v = sessionStorage.getItem(key(id));
    const n = v ? parseFloat(v) : NaN;
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

// 상세 '프레임' 비율(앨범에서 세로가 가장 긴 사진 기준) — 갤러리가 건드리는 ar 와 별개 키.
// 상세를 한 번 본 사진은 재방문 시 스켈레톤이 실제 프레임과 정확히 일치한다.
const frameKey = (id: string) => `samae:far:${id}`;

export function rememberFrameAspect(id: string, aspect?: number | null) {
  if (!id || !aspect || !Number.isFinite(aspect) || aspect <= 0) return;
  try {
    sessionStorage.setItem(frameKey(id), String(aspect));
  } catch {
    /* 무시 */
  }
}

export function readFrameAspect(id: string): number | null {
  if (!id) return null;
  try {
    const v = sessionStorage.getItem(frameKey(id));
    const n = v ? parseFloat(v) : NaN;
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}
