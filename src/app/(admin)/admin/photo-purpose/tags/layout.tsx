import type { ReactNode } from "react";
import { TagsNav } from "./TagsNav";

/** 사진 태그 — 사진마다 붙인 가족(D4) · 큰 무드(D5). 무드 어휘를 만드는 일(무드 탭)과 나눴다(docs/47, 2026-10-01). */
export default function TagsLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <TagsNav />
      {children}
    </>
  );
}
