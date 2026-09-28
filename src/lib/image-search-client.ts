"use client";

/**
 * 사진으로 검색 — 브라우저 쪽. (docs/42 §3)
 *
 * 올린 사진을 **보내기 전에 줄인다.** SigLIP 은 사진을 작게 보므로 결과는 같고 전송만 준다
 * (4000×3000 사진 5MB → 512px JPEG 약 100KB). 원본은 어디에도 올라가지 않는다.
 *
 * 줄인 사진은 이 탭의 sessionStorage 에만 둔다 — 결과 화면이 그걸 읽어 검색한다.
 * 탭을 닫으면 사라지고, 서버·다른 기기에는 남지 않는다.
 */
import {
  fitWithin,
  IMAGE_SEARCH_MAX_BYTES,
  IMAGE_SEARCH_SESSION_KEY,
} from "@/lib/image-search-core";

const JPEG_QUALITY = 0.85;
/** 사진이 바뀌었다고 알리는 신호 — 결과 화면이 이걸 듣고 새 사진으로 다시 찾는다.
 *  sessionStorage 는 같은 탭 안에서 바뀔 때 아무 신호도 주지 않는다. */
const CHANGED = "samae:image-search-changed";

/** 사진 한 장을 512px JPEG data URL 로. 브라우저가 못 읽는 형식(HEIC 등)이면 null. */
export async function shrinkImage(file: Blob): Promise<string | null> {
  try {
    const bitmap = await createImageBitmap(file);
    const { width, height } = fitWithin(bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    const dataUrl = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
    if (!dataUrl.startsWith("data:image/jpeg;base64,")) return null;
    // 줄였는데도 한도를 넘으면(아주 큰 그림) 더 낮은 품질로 한 번 더
    if (dataUrl.length * 0.75 > IMAGE_SEARCH_MAX_BYTES) return canvas.toDataURL("image/jpeg", 0.6);
    return dataUrl;
  } catch {
    return null;   // 못 읽는 형식 — 부르는 쪽이 "JPG·PNG 로 올려 주세요" 안내
  }
}

/** 결과 화면이 읽을 자리에 넣는다. 자리가 없으면(사생활 보호 모드 등) false. */
export function rememberSearchImage(dataUrl: string): boolean {
  try {
    sessionStorage.setItem(IMAGE_SEARCH_SESSION_KEY, dataUrl);
    window.dispatchEvent(new Event(CHANGED));
    return true;
  } catch {
    return false;
  }
}

/** 사진이 바뀔 때마다 알려준다(useSyncExternalStore 용). */
export function subscribeSearchImage(onChange: () => void): () => void {
  window.addEventListener(CHANGED, onChange);
  return () => window.removeEventListener(CHANGED, onChange);
}

export function readSearchImage(): string | null {
  try {
    return sessionStorage.getItem(IMAGE_SEARCH_SESSION_KEY);
  } catch {
    return null;
  }
}

export function forgetSearchImage() {
  try {
    sessionStorage.removeItem(IMAGE_SEARCH_SESSION_KEY);
    window.dispatchEvent(new Event(CHANGED));
  } catch {
    /* 지우지 못해도 화면은 그대로 진행한다 */
  }
}

/** 붙여넣기·끌어다 놓기에서 사진 한 장을 꺼낸다. 없으면 null. */
export function firstImage(items: FileList | DataTransferItemList | null | undefined): Blob | null {
  if (!items) return null;
  for (const item of Array.from(items as ArrayLike<File | DataTransferItem>)) {
    const file = "getAsFile" in item ? item.getAsFile() : item;
    if (file && file.type.startsWith("image/")) return file;
  }
  return null;
}
