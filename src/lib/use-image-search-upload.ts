"use client";

/**
 * 사진으로 검색 — 사진 한 장을 받아 줄이고 결과 화면으로 넘기는 몫. (docs/46 §3)
 *
 * 검색창(모바일: 바로 사진 고르기)과 패널(PC: 끌어다 놓기·붙여넣기)이 같이 쓴다.
 */
import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";

import { rememberSearchImage, shrinkImage } from "@/lib/image-search-client";
import { IMAGE_SEARCH_RESULT_PATH } from "@/lib/image-search-core";

const CANNOT_READ = "이 사진은 읽지 못했어요. JPG·PNG 로 올려 주세요.";

export function useImageSearchUpload() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const accept = useCallback(
    async (file: Blob | null | undefined) => {
      if (!file || busy) return;
      setBusy(true);
      setError(null);
      const shrunk = await shrinkImage(file);
      if (!shrunk || !rememberSearchImage(shrunk)) {
        setBusy(false);
        setError(CANNOT_READ);
        return;
      }
      router.push(IMAGE_SEARCH_RESULT_PATH);
      setBusy(false);
    },
    [busy, router],
  );

  return { accept, busy, error };
}

/**
 * 손가락으로 쓰는 기기인가. 참이면 카메라 버튼이 패널 대신 **바로 OS 사진 고르기**를 연다 —
 * 거기서 "사진 보관함 / 사진 찍기" 가 뜨고 사진 접근 권한도 그때 묻는다.
 * 끌어다 놓기·붙여넣기는 손가락으로 할 수 없으니 패널을 띄울 이유가 없다.
 */
export function prefersNativePicker(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(pointer: coarse)").matches;
}
