/** 모델의 4초 제한에 DB·관심사진 조회 시간을 더한 사진 영역의 전체 대기 한도. */
export const PHOTO_SEARCH_TIMEOUT_MS = 8_000;

export type PhotoSearchResult<T> =
  | { status: "ready"; data: T }
  | { status: "unavailable" };

/** 빈 결과와 실패를 구분하고, 응답하지 않는 의존성이 화면을 계속 붙잡지 않게 한다. */
export async function resolvePhotoSearch<T>(
  load: (signal: AbortSignal) => Promise<T | null>,
  timeoutMs = PHOTO_SEARCH_TIMEOUT_MS,
): Promise<PhotoSearchResult<T>> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("photo search timeout")), timeoutMs);
    });
    const data = await Promise.race([load(controller.signal), deadline]);
    if (data === null) {
      controller.abort();
      return { status: "unavailable" };
    }
    return { status: "ready", data };
  } catch {
    controller.abort();
    return { status: "unavailable" };
  } finally {
    clearTimeout(timer);
  }
}
