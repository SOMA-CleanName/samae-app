"use client";

import { useEffect } from "react";
import { markDocumentEntry } from "@/lib/in-app-nav";

/**
 * 문서가 열린 시점을 기록만 하는 조각. 아무것도 안 그린다.
 *
 * 루트 레이아웃에 둔다 — 어느 페이지로 들어오든 **첫 화면에서** 한 번 돌아야
 * "그 뒤로 앱 안에서 몇 번 움직였는지"를 셀 수 있다. (자세한 건 lib/in-app-nav)
 */
export function NavEntryProbe() {
  useEffect(() => {
    markDocumentEntry();
  }, []);
  return null;
}
