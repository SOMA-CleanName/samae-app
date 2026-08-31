"use client";

// 월 달력 — 예약 제안의 희망 날짜 선택.
//
// 휠 피커(DateWheel)를 쓰다가 달력으로 바꿨다. 예약은 "며칠 뒤 무슨 요일인가"가 중요한데
// 휠은 숫자만 굴려서 요일·주말이 안 보이고, 며칠 앞인지 감이 안 잡힌다.
// 달력은 한눈에 그게 보인다.
//
// 과거 예약 방지: 오늘 이전은 선택 불가, 이전 달 이동도 이번 달까지만.

import { useMemo, useState } from "react";
import { ChevronLeftIcon, ChevronRightIcon } from "@/components/user/icons";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
const pad2 = (n: number) => String(n).padStart(2, "0");
const key = (y: number, m: number, d: number) => `${y}-${pad2(m)}-${pad2(d)}`;

/** 오늘(로컬) — 시각을 버려서 날짜 비교만 하게 */
function today(): { y: number; m: number; d: number } {
  const n = new Date();
  return { y: n.getFullYear(), m: n.getMonth() + 1, d: n.getDate() };
}

function parse(v: string): { y: number; m: number; d: number } | null {
  const mm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  return mm ? { y: +mm[1], m: +mm[2], d: +mm[3] } : null;
}

export function DateCalendar({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const t = today();
  const sel = parse(value);
  // 보고 있는 달 — 선택값이 있으면 그 달부터
  const [view, setView] = useState(() => ({ y: sel?.y ?? t.y, m: sel?.m ?? t.m }));

  const cells = useMemo(() => {
    const first = new Date(view.y, view.m - 1, 1);
    const lead = first.getDay(); // 1일 앞의 빈 칸 수
    const days = new Date(view.y, view.m, 0).getDate();
    const out: (number | null)[] = Array.from({ length: lead }, () => null);
    for (let d = 1; d <= days; d++) out.push(d);
    while (out.length % 7 !== 0) out.push(null);
    return out;
  }, [view]);

  // 이번 달보다 과거로는 못 간다
  const atFloor = view.y === t.y && view.m === t.m;
  const shift = (delta: number) => {
    const next = new Date(view.y, view.m - 1 + delta, 1);
    setView({ y: next.getFullYear(), m: next.getMonth() + 1 });
  };

  const isPast = (d: number) =>
    view.y < t.y || (view.y === t.y && (view.m < t.m || (view.m === t.m && d < t.d)));

  return (
    <div className="rounded-xl border border-line-strong p-3">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => shift(-1)}
          disabled={atFloor}
          aria-label="이전 달"
          className="grid h-8 w-8 cursor-pointer place-items-center rounded-full text-muted transition-colors hover:bg-fg/[0.06] hover:text-fg disabled:cursor-default disabled:opacity-25"
        >
          <ChevronLeftIcon className="h-4 w-4" />
        </button>
        <p className="text-body-sm font-semibold text-fg tabular-nums">
          {view.y}년 {view.m}월
        </p>
        <button
          type="button"
          onClick={() => shift(1)}
          aria-label="다음 달"
          className="grid h-8 w-8 cursor-pointer place-items-center rounded-full text-muted transition-colors hover:bg-fg/[0.06] hover:text-fg"
        >
          <ChevronRightIcon className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-2 grid grid-cols-7 gap-0.5">
        {WEEKDAYS.map((w, i) => (
          <span
            key={w}
            className={`grid h-7 place-items-center text-caption ${
              i === 0 ? "text-danger/70" : i === 6 ? "text-brand/70" : "text-faint"
            }`}
          >
            {w}
          </span>
        ))}

        {cells.map((d, i) => {
          if (d === null) return <span key={`e${i}`} className="h-9" />;
          const v = key(view.y, view.m, d);
          const past = isPast(d);
          const selected = value === v;
          const isToday = view.y === t.y && view.m === t.m && d === t.d;
          return (
            <button
              key={v}
              type="button"
              disabled={past}
              onClick={() => onChange(v)}
              aria-pressed={selected}
              className={`grid h-9 cursor-pointer place-items-center rounded-lg text-body-sm tabular-nums transition-colors disabled:cursor-default disabled:text-faint/40 ${
                selected
                  ? "bg-fg font-semibold text-bg"
                  : past
                    ? ""
                    : isToday
                      ? "text-fg ring-1 ring-line-strong hover:bg-fg/[0.06]"
                      : "text-fg hover:bg-fg/[0.06]"
              }`}
            >
              {d}
            </button>
          );
        })}
      </div>
    </div>
  );
}
