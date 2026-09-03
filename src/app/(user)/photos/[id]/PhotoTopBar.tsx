"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/cn";
import { ArrowLeftIcon } from "@/components/user/icons";
import {
  getBackNavigationAction,
  getPhotoBackButtonMode,
} from "@/lib/photo-back-button";

/**
 * 사진 상세 좌상단 뒤로가기 — 화면에 고정.
 *
 * 사진 위에 뜨라고 만든 물건이라 검은 반투명 원이다. 그런데 fixed 라 스크롤해
 * 사진을 지나 패키지 정보를 볼 때도 그대로 떠 있었고, 밝은 지면 위의 검은 원은
 * 이 페이지 것이 아닌 것처럼 보였다.
 *
 * 그렇다고 사진을 지날 때 없앨 수는 없다 — 나갈 문이 사라진다.
 * 그래서 **바닥에 맞춰 옷을 갈아입는다.**
 *   · 사진 위 — 검은 반투명 (밝은 사진에서도 흰 화살표가 읽힌다)
 *   · 지면 위 — 페이지 표면색 + 테두리 (다른 버튼들과 같은 물건으로 보인다)
 *
 * 기본값은 '사진 위'다. 관찰자가 안 돌아도(하이드레이션 실패 등) 첫 화면은 사진이라
 * 그 상태가 맞다 — 숨김을 기본으로 두지 않는 것과 같은 이유다.
 */
export function PhotoTopBar() {
  const router = useRouter();
  const mode = getPhotoBackButtonMode();
  const ref = useRef<HTMLButtonElement>(null);
  const [onPhoto, setOnPhoto] = useState(true);

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const frame = ref.current?.closest<HTMLElement>("[data-photo-frame]");
    if (!frame) return;

    const io = new IntersectionObserver(
      ([entry]) => setOnPhoto(entry.isIntersecting),
      // 버튼이 앉은 높이(top-3 + h-9 ≈ 48px)만큼 위를 잘라 본다.
      // 사진 아랫변이 그 선을 지나는 순간이 곧 '버튼이 사진을 벗어나는' 순간이다.
      { rootMargin: "-48px 0px 0px 0px", threshold: 0 }
    );
    io.observe(frame);
    return () => io.disconnect();
  }, []);

  function onBack() {
    const historyLength = typeof window === "undefined" ? 0 : window.history.length;
    if (getBackNavigationAction(historyLength) === "history") router.back();
    else router.push("/");
  }

  return (
    <button
      ref={ref}
      type="button"
      onClick={onBack}
      aria-label="뒤로"
      data-mode={mode}
      data-surface={onPhoto ? "photo" : "page"}
      className={cn(
        "fixed left-3 top-3 z-30 grid h-9 w-9 cursor-pointer place-items-center rounded-full backdrop-blur-sm transition-colors",
        onPhoto
          ? "bg-black/35 text-white hover:bg-black/60"
          : "border border-line-strong bg-surface/90 text-fg shadow-sm hover:border-brand hover:text-brand"
      )}
    >
      <ArrowLeftIcon />
    </button>
  );
}
