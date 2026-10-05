import { Suspense, type ReactNode } from "react";
import { MoodLayerNav } from "./MoodLayerNav";

/** 무드 어휘 화면은 층(D1~D5)으로 나뉜다 — 둘째 줄에서 층과 갈래(사진 뼈대 · 사전)를 고른다. 목적 분류와는 다른 일이다(2026-09-29). */
export default function MoodLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <Suspense fallback={<div className="mb-6 h-14 border-b border-border" />}>
        <MoodLayerNav />
      </Suspense>
      {children}
    </>
  );
}
