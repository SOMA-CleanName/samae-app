"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { saveRules } from "./actions";
import type { AvailRule } from "@/lib/slots";

const WD = ["일", "월", "화", "수", "목", "금", "토"];
const pad = (n: number) => String(n).padStart(2, "0");
const key = (wd: number, h: number) => `${wd}-${h}`;

// 규칙 → 선택된 칸 집합 (start~end-1 시각의 칸을 채움)
function rulesToSet(rules: AvailRule[]): Set<string> {
  const s = new Set<string>();
  for (const r of rules) {
    const sh = parseInt(r.start_time.slice(0, 2), 10);
    const eh = parseInt(r.end_time.slice(0, 2), 10);
    for (let h = sh; h < eh; h++) s.add(key(r.weekday, h));
  }
  return s;
}

// 선택 칸 → 연속 구간 병합 (요일별)
function setToRanges(sel: Set<string>) {
  const out: { weekday: number; start_time: string; end_time: string }[] = [];
  for (let wd = 0; wd < 7; wd++) {
    const hours: number[] = [];
    for (let h = 0; h < 24; h++) if (sel.has(key(wd, h))) hours.push(h);
    let i = 0;
    while (i < hours.length) {
      const start = hours[i];
      let end = start;
      while (i + 1 < hours.length && hours[i + 1] === hours[i] + 1) {
        i++;
        end = hours[i];
      }
      out.push({ weekday: wd, start_time: `${pad(start)}:00`, end_time: `${pad(end + 1)}:00` });
      i++;
    }
  }
  return out;
}

// 드래그/클릭으로 가능시간을 칠하는 주간 격자
export function WeeklyGrid({ initialRules }: { initialRules: AvailRule[] }) {
  const router = useRouter();
  const [sel, setSel] = useState<Set<string>>(() => rulesToSet(initialRules));
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const drag = useRef<{ active: boolean; mode: "add" | "remove" }>({ active: false, mode: "add" });

  // 드래그 종료
  useEffect(() => {
    const up = () => {
      drag.current.active = false;
    };
    window.addEventListener("pointerup", up);
    return () => window.removeEventListener("pointerup", up);
  }, []);

  function apply(k: string, mode: "add" | "remove") {
    setSel((prev) => {
      const has = prev.has(k);
      if (mode === "add" ? has : !has) return prev;
      const next = new Set(prev);
      if (mode === "add") next.add(k);
      else next.delete(k);
      return next;
    });
    setDirty(true);
  }

  function onDown(k: string) {
    const mode = sel.has(k) ? "remove" : "add";
    drag.current = { active: true, mode };
    apply(k, mode);
  }
  function onEnter(k: string) {
    if (drag.current.active) apply(k, drag.current.mode);
  }

  async function onSave() {
    setSaving(true);
    try {
      await saveRules(setToRanges(sel));
      setDirty(false);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <p className="text-xs text-fg/45">
        칸을 클릭하거나 드래그해서 가능한 시간을 칠하세요. (1시간 단위)
      </p>

      <div className="mt-3 select-none overflow-x-auto">
        {/* 요일 헤더 */}
        <div className="grid grid-cols-[2.2rem_repeat(7,1fr)] gap-px text-center text-[11px] text-fg/45">
          <div />
          {WD.map((d) => (
            <div key={d} className="py-1 font-medium">{d}</div>
          ))}
        </div>

        {/* 시간 행 */}
        {Array.from({ length: 24 }).map((_, h) => (
          <div key={h} className="grid grid-cols-[2.2rem_repeat(7,1fr)] gap-px">
            <div className="flex items-center justify-end pr-1 text-[10px] text-fg/35">{pad(h)}</div>
            {WD.map((_, wd) => {
              const k = key(wd, h);
              const on = sel.has(k);
              return (
                <button
                  key={k}
                  type="button"
                  onPointerDown={(e) => {
                    e.preventDefault();
                    onDown(k);
                  }}
                  onPointerEnter={() => onEnter(k)}
                  className={`h-5 rounded-[3px] transition-colors ${
                    on ? "bg-fg" : "bg-fg/[0.06] hover:bg-fg/15"
                  }`}
                  aria-label={`${WD[wd]} ${pad(h)}시 ${on ? "가능" : "불가"}`}
                />
              );
            })}
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={onSave}
        disabled={saving || !dirty}
        className="mt-4 rounded-full bg-fg px-6 py-2.5 text-sm font-semibold text-bg hover:opacity-90 disabled:opacity-40"
      >
        {saving ? "저장 중…" : dirty ? "변경사항 저장" : "저장됨"}
      </button>
    </div>
  );
}
