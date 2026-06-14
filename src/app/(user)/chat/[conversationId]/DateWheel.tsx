"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { CalendarIcon } from "@/components/user/icons";

// 휠 데이트 피커 — 년/월/일 3컬럼. 스크롤 스냅으로 드럼처럼 굴려서 고른다.
// 평소엔 선택값만 한 줄로 보이고(접힘), 탭하면 휠이 펼쳐진다.
// 과거 예약 방지: 오늘 기준으로 연/월/일 범위를 동적 제한.

const ITEM_H = 34; // 한 칸 높이(px)
const VISIBLE = 5; // 보이는 칸 수(홀수) — 가운데가 선택
const PAD = ITEM_H * ((VISIBLE - 1) / 2); // 첫/마지막 항목도 가운데 오도록 위·아래 여백

function range(start: number, end: number): number[] {
  const a: number[] = [];
  for (let i = start; i <= end; i++) a.push(i);
  return a;
}
const pad2 = (n: number) => String(n).padStart(2, "0");
const fmtDate = (y: number, m: number, d: number) => `${y}-${pad2(m)}-${pad2(d)}`;

function parse(v: string): { y: number; m: number; d: number } | null {
  const mm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!mm) return null;
  return { y: +mm[1], m: +mm[2], d: +mm[3] };
}

// 단일 휠 컬럼 — 스크롤 스냅 + 가운데 강조(드럼). 부모가 높이·밴드·페이드를 감싼다.
//   onSelect: 스크롤이 멈추면 값 커밋(닫지 않음) / onPick: 숫자를 탭하면 확정(부모가 닫음)
function WheelColumn({
  values,
  selected,
  onSelect,
  onPick,
  suffix,
}: {
  values: number[];
  selected: number;
  onSelect: (v: number) => void;
  onPick: (v: number) => void;
  suffix: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const settle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idx = Math.max(0, values.indexOf(selected));
  const [center, setCenter] = useState(idx);

  // 선택/목록 변경 시 스크롤 위치 동기화 (루프 방지 위해 즉시 점프)
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.scrollTop = idx * ITEM_H;
    setCenter(idx);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, values.length]);

  const onScroll = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const i = Math.max(0, Math.min(values.length - 1, Math.round(el.scrollTop / ITEM_H)));
    setCenter((c) => (c === i ? c : i));
    if (settle.current) clearTimeout(settle.current);
    // 스크롤이 멈추면 가운데로 스냅 + 값 커밋
    settle.current = setTimeout(() => {
      el.scrollTo({ top: i * ITEM_H, behavior: "smooth" });
      const v = values[i];
      if (v !== selected) onSelect(v);
    }, 110);
  }, [values, selected, onSelect]);

  return (
    <div
      ref={ref}
      onScroll={onScroll}
      className="scrollbar-none h-full w-full overflow-y-scroll"
      style={{ scrollSnapType: "y mandatory", overscrollBehavior: "contain" }}
    >
      <div style={{ height: PAD }} />
      {values.map((v, i) => {
        const dist = Math.abs(i - center);
        const opacity = dist === 0 ? 1 : dist === 1 ? 0.42 : dist === 2 ? 0.18 : 0.07;
        const scale = dist === 0 ? 1 : dist === 1 ? 0.86 : 0.74;
        return (
          <button
            key={v}
            type="button"
            // 가운데(이미 선택)면 확정·닫기 / 아니면 그 칸으로 굴려 가운데로
            onClick={() => (i === center ? onPick(v) : ref.current?.scrollTo({ top: i * ITEM_H, behavior: "smooth" }))}
            className="flex w-full cursor-pointer items-baseline justify-center tabular-nums"
            style={{
              height: ITEM_H,
              scrollSnapAlign: "center",
              opacity,
              transform: `scale(${scale})`,
              transition: "opacity 130ms, transform 130ms",
            }}
          >
            <span className={dist === 0 ? "text-title font-semibold text-fg" : "text-body text-muted"}>
              {v}
            </span>
            <span className="ml-0.5 text-caption text-faint">{suffix}</span>
          </button>
        );
      })}
      <div style={{ height: PAD }} />
    </div>
  );
}

// 년·월·일 휠 — value(YYYY-MM-DD) 동기화. 비어 있으면 오늘로 시작.
export function DateWheel({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const now = new Date();
  const ty = now.getFullYear();
  const tm = now.getMonth() + 1;
  const td = now.getDate();

  const init = parse(value) ?? { y: ty, m: tm, d: td };
  const [y, setY] = useState(init.y);
  const [m, setM] = useState(init.m);
  const [d, setD] = useState(init.d);
  const [active, setActive] = useState<"y" | "m" | "d" | null>(null); // 휠로 펼친 부분

  // 동적 범위 — 오늘 이전은 제외
  const years = range(ty, ty + 2);
  const months = y === ty ? range(tm, 12) : range(1, 12);
  const lastDay = new Date(y, m, 0).getDate();
  const minDay = y === ty && m === tm ? td : 1;
  const days = range(minDay, lastDay);

  // 상위(년) 변경으로 월이 범위 밖이면 클램프
  useEffect(() => {
    if (!months.includes(m)) setM(months[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [y]);

  // 년/월 변경으로 일이 범위 밖이면 클램프
  useEffect(() => {
    if (d < minDay) setD(minDay);
    else if (d > lastDay) setD(lastDay);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [y, m]);

  // 선택값을 부모로 (YYYY-MM-DD). onChange 의존성 제외해 루프 방지.
  useEffect(() => {
    onChange(fmtDate(y, m, d));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [y, m, d]);

  // 세그먼트 정의 — 클릭 시 그 부분만 휠로 펼쳐짐
  const segs = [
    { key: "y" as const, values: years, value: y, set: setY, suffix: "년", width: 60 },
    { key: "m" as const, values: months, value: m, set: setM, suffix: "월", width: 46 },
    { key: "d" as const, values: days, value: d, set: setD, suffix: "일", width: 46 },
  ];

  return (
    <div
      className={cn(
        "flex items-center gap-1 rounded-xl border bg-surface px-3 transition-colors",
        active ? "border-brand/30 py-2" : "border-line-strong py-2.5"
      )}
    >
      <CalendarIcon className="mr-1 h-4 w-4 shrink-0 text-faint" />
      {segs.map((s) =>
        active === s.key ? (
          // 펼친 부분 — 그 자리에서 휠로 변환 (가운데 밴드 + 상하 페이드)
          <div
            key={s.key}
            className="relative shrink-0"
            style={{ height: ITEM_H * VISIBLE, width: s.width }}
          >
            <div
              className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 rounded-lg bg-brand/[0.06] ring-1 ring-brand/15"
              style={{ height: ITEM_H }}
            />
            <WheelColumn
              values={s.values}
              selected={s.value}
              onSelect={s.set}
              onPick={(v) => {
                s.set(v);
                setActive(null);
              }}
              suffix={s.suffix}
            />
            <div
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  "linear-gradient(180deg, var(--surface) 0%, transparent 28%, transparent 72%, var(--surface) 100%)",
              }}
            />
          </div>
        ) : (
          // 접힌 부분 — 숫자 클릭하면 그 부분만 휠로
          <button
            key={s.key}
            type="button"
            onClick={() => setActive(s.key)}
            className="cursor-pointer rounded-md px-1.5 py-1 text-body-sm font-medium tabular-nums text-fg transition-colors hover:bg-fg/[0.05]"
          >
            {s.value}
            <span className="ml-0.5 text-caption text-faint">{s.suffix}</span>
          </button>
        )
      )}
      {active && (
        <button
          type="button"
          onClick={() => setActive(null)}
          className="ml-auto shrink-0 cursor-pointer rounded-md px-2 py-1 text-caption font-medium text-brand transition-colors hover:bg-brand/[0.06]"
        >
          완료
        </button>
      )}
    </div>
  );
}
