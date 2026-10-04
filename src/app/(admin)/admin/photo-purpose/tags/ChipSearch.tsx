"use client";

import { useRef, useState, type ReactNode } from "react";

/**
 * 가족 · 큰 무드 칩 찾기(사람 요청 2026-10-04) — 칩이 97개라 눈으로 찾기 힘들다.
 * 칩마다 `data-search`(번호 · 이름 · 큰 무드 · 식구 묶음)에 걸리는 것만 남긴다. 하나만 남으면 Enter 로 바로 연다.
 */
export function ChipSearch({ children }: { children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const [q, setQ] = useState("");
  const [left, setLeft] = useState<number | null>(null);

  function filter(value: string) {
    setQ(value);
    const needle = value.trim().toLowerCase();
    let n = 0;
    for (const li of box.current?.querySelectorAll<HTMLElement>("[data-search]") ?? []) {
      const hit = !needle || (li.dataset.search ?? "").toLowerCase().includes(needle);
      li.hidden = !hit;
      if (hit) n++;
    }
    setLeft(needle ? n : null);
  }

  function enter() {
    const shown = [...(box.current?.querySelectorAll<HTMLElement>("[data-search]") ?? [])].filter((li) => !li.hidden);
    if (shown.length === 1) shown[0].querySelector("a")?.click();
  }

  return (
    <div ref={box}>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <input type="search" value={q} onChange={(e) => filter(e.target.value)} onKeyDown={(e) => e.key === "Enter" && enter()}
          aria-label="가족 찾기" placeholder="찾기 — 번호 · 이름 · 큰 무드 · 묶음 (예: f41, 가을, 노을)"
          className="w-full max-w-md rounded-xl border border-line bg-bg px-3 py-1.5 text-body-sm" />
        {left !== null && <span className="text-caption text-muted tabular-nums">{left}개{left === 1 && " — Enter 로 열기"}</span>}
      </div>
      {children}
    </div>
  );
}
