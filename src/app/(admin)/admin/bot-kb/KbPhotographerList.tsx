"use client";

// 작가 고르기 — 목록이 곧 "어느 작가의 봇이 아직 벙어리인가" 대시보드다.
// 이름 검색 + 미등록만 보기 + 행마다 빠진 핵심 주제를 붙여, 다음에 뭘 채울지 바로 보이게 한다.

import { useMemo, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui";

export type KbListRow = {
  id: string;
  name: string;
  status: string;
  count: number;
  enabled: boolean;
  /** 아직 카드가 없는 핵심 주제 — 봇이 막히는 지점 */
  missing: string[];
  demo: boolean;
};

export function KbPhotographerList({
  rows,
  selectedId,
  editor,
}: {
  rows: KbListRow[];
  selectedId: string;
  /** 고른 작가 행 바로 아래에서 펼쳐질 편집기 (서버에서 만들어 내려준다) */
  editor?: React.ReactNode;
}) {
  const [q, setQ] = useState("");
  const [onlyTodo, setOnlyTodo] = useState(false);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      // 편집 중인 작가는 검색·필터로 사라지지 않는다 — 사라지면 열려 있던 편집기가 통째로 날아간다
      if (r.id === selectedId) return true;
      if (onlyTodo && r.count > 0 && r.missing.length === 0) return false;
      if (!needle) return true;
      return r.name.toLowerCase().includes(needle);
    });
  }, [rows, q, onlyTodo, selectedId]);

  return (
    <>
      <div className="mt-5 flex flex-wrap items-center gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="작가 이름 검색"
          className="min-w-0 flex-1 rounded-lg border border-line bg-bg px-3 py-2 text-body-sm outline-none focus:border-fg/40"
        />
        <button
          type="button"
          onClick={() => setOnlyTodo((v) => !v)}
          aria-pressed={onlyTodo}
          className={
            "shrink-0 cursor-pointer rounded-lg border px-3 py-2 text-caption font-semibold transition-colors " +
            (onlyTodo ? "border-fg bg-fg text-bg" : "border-line hover:bg-fg/[0.05]")
          }
        >
          채울 게 남은 작가만
        </button>
      </div>

      {filtered.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-line px-4 py-6 text-center text-body-sm text-muted">
          조건에 맞는 작가가 없어요.
        </p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {filtered.map((r) => {
            const active = r.id === selectedId;
            return (
              <li key={r.id}>
                <Link
                  href={active ? "/admin/bot-kb" : `/admin/bot-kb?photographerId=${r.id}`}
                  scroll={false}
                  className={
                    "flex flex-wrap items-center gap-2 rounded-2xl border bg-surface px-4 py-3 transition-colors " +
                    (active ? "border-fg" : "border-line hover:bg-fg/[0.03]")
                  }
                >
                  <span className="text-body-sm font-semibold text-fg">{r.name}</span>
                  {r.status !== "approved" && <Badge tone="neutral">{r.status}</Badge>}
                  {r.count > 0 ? (
                    !r.enabled ? (
                      <Badge tone="warning">꺼짐 · {r.count}장</Badge>
                    ) : (
                      <Badge tone="success">{r.count}장</Badge>
                    )
                  ) : (
                    <Badge tone="neutral">미등록</Badge>
                  )}
                  {/* 빠진 주제 — 다음에 뭘 채울지가 목록에서 바로 보인다 */}
                  {r.count > 0 && r.missing.length > 0 && (
                    <span className="text-caption text-warning">{r.missing.join("·")} 없음</span>
                  )}
                  {r.count === 0 && r.demo && <span className="text-caption text-faint">파일 데모 있음</span>}
                  <span className="ml-auto text-caption text-muted">{active ? "닫기" : "편집"}</span>
                </Link>
                {active && editor}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
