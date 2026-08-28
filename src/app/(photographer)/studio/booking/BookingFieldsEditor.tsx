"use client";

// 예약서 추가 항목 편집 — 작가가 자기 촬영에 필요한 질문을 직접 만든다.
//
// 폼 전송은 부모 form 이 한다. 여기서는 항목 배열을 hidden input 에 JSON 으로 실어보낸다
// (어드민 KB 편집기와 같은 방식 — 문법은 앱이 만들고 사람은 내용만 적는다).

import { useState } from "react";
import { useFormStatus } from "react-dom";
import {
  MAX_BOOKING_FIELDS,
  MAX_FIELD_LABEL,
  MAX_FIELD_OPTIONS,
  type BookingField,
  type BookingFieldType,
} from "@/lib/booking-fields";

const TYPE_LABEL: Record<BookingFieldType, string> = {
  text: "직접 입력",
  select: "선택",
  checkbox: "예/아니오",
};

type Draft = BookingField & { key: string };

let seq = 0;
const nextKey = () => `k${seq++}`;

export function BookingFieldsEditor({ initial }: { initial: BookingField[] }) {
  const [fields, setFields] = useState<Draft[]>(() =>
    initial.map((f) => ({ ...f, key: nextKey() }))
  );

  const patch = (key: string, next: Partial<Draft>) =>
    setFields((prev) => prev.map((f) => (f.key === key ? { ...f, ...next } : f)));

  const add = () => {
    if (fields.length >= MAX_BOOKING_FIELDS) return;
    setFields((prev) => [
      ...prev,
      {
        key: nextKey(),
        id: `f${prev.length + 1}_${Date.now().toString(36).slice(-4)}`,
        label: "",
        type: "text",
      },
    ]);
  };

  const remove = (key: string) => setFields((prev) => prev.filter((f) => f.key !== key));

  const move = (key: string, dir: -1 | 1) =>
    setFields((prev) => {
      const i = prev.findIndex((f) => f.key === key);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  // 줄별 문제 — 저장 전에 여기서 알려준다. 서버는 이걸로 던지지 않는다(페이지가 죽으므로).
  const problem = (f: Draft): string | null => {
    if (!f.label.trim()) return "물어볼 내용을 적어주세요.";
    if (f.type === "select" && (f.options ?? []).filter((o) => o.trim()).length < 2)
      return "보기를 2개 이상 적어주세요.";
    return null;
  };
  const incomplete = fields.filter((f) => problem(f));

  const payload = JSON.stringify(
    fields.map(({ key: _key, ...f }) => f) // eslint-disable-line @typescript-eslint/no-unused-vars
  );

  return (
    <div className="flex flex-col gap-2">
      <input type="hidden" name="booking_fields" value={payload} />

      {fields.length === 0 && (
        <p className="rounded-xl border border-dashed border-fg/15 px-4 py-5 text-center text-sm text-fg/50">
          아직 추가 항목이 없어요.
        </p>
      )}

      {fields.map((f, i) => (
        <div
          key={f.key}
          className={`rounded-xl border bg-surface p-3 ${
            problem(f) ? "border-danger/40" : "border-fg/15"
          }`}
        >
          <div className="flex items-center gap-2">
            <input
              value={f.label}
              maxLength={MAX_FIELD_LABEL}
              onChange={(e) => patch(f.key, { label: e.target.value })}
              placeholder="고객에게 물어볼 내용"
              className="min-w-0 flex-1 rounded-lg border border-fg/15 bg-bg px-3 py-2 text-sm font-normal outline-none focus:border-fg/40"
            />
            <button
              type="button"
              onClick={() => move(f.key, -1)}
              disabled={i === 0}
              aria-label="위로"
              className="grid h-7 w-7 shrink-0 cursor-pointer place-items-center rounded-lg text-xs text-fg/50 hover:bg-fg/[0.06] disabled:opacity-25"
            >
              ↑
            </button>
            <button
              type="button"
              onClick={() => move(f.key, 1)}
              disabled={i === fields.length - 1}
              aria-label="아래로"
              className="grid h-7 w-7 shrink-0 cursor-pointer place-items-center rounded-lg text-xs text-fg/50 hover:bg-fg/[0.06] disabled:opacity-25"
            >
              ↓
            </button>
            <button
              type="button"
              onClick={() => remove(f.key)}
              aria-label="삭제"
              className="grid h-7 w-7 shrink-0 cursor-pointer place-items-center rounded-lg text-xs text-danger hover:bg-danger/10"
            >
              ×
            </button>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {(Object.keys(TYPE_LABEL) as BookingFieldType[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() =>
                  patch(f.key, {
                    type: t,
                    options: t === "select" ? (f.options?.length ? f.options : ["", ""]) : undefined,
                  })
                }
                className={`cursor-pointer rounded-full px-2.5 py-1 text-xs transition-colors ${
                  f.type === t ? "bg-fg text-bg" : "bg-fg/[0.06] text-fg/60 hover:bg-fg/10"
                }`}
              >
                {TYPE_LABEL[t]}
              </button>
            ))}

            {f.type !== "checkbox" && (
              <label className="ml-auto flex cursor-pointer items-center gap-1.5 text-xs text-fg/55">
                <input
                  type="checkbox"
                  checked={!!f.required}
                  onChange={(e) => patch(f.key, { required: e.target.checked })}
                  className="h-3.5 w-3.5 accent-brand"
                />
                필수
              </label>
            )}
          </div>

          {f.type === "select" && (
            <div className="mt-2 flex flex-col gap-1.5">
              {(f.options ?? []).map((opt, oi) => (
                <div key={oi} className="flex items-center gap-2">
                  <input
                    value={opt}
                    onChange={(e) => {
                      const next = [...(f.options ?? [])];
                      next[oi] = e.target.value;
                      patch(f.key, { options: next });
                    }}
                    placeholder={`보기 ${oi + 1}`}
                    className="min-w-0 flex-1 rounded-lg border border-fg/15 bg-bg px-3 py-1.5 text-sm font-normal outline-none focus:border-fg/40"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      patch(f.key, { options: (f.options ?? []).filter((_, k) => k !== oi) })
                    }
                    aria-label="보기 삭제"
                    className="grid h-7 w-7 shrink-0 cursor-pointer place-items-center rounded-lg text-xs text-fg/40 hover:bg-fg/[0.06]"
                  >
                    ×
                  </button>
                </div>
              ))}
              {(f.options?.length ?? 0) < MAX_FIELD_OPTIONS && (
                <button
                  type="button"
                  onClick={() => patch(f.key, { options: [...(f.options ?? []), ""] })}
                  className="self-start rounded-lg px-2 py-1 text-xs text-fg/55 hover:bg-fg/[0.06]"
                >
                  + 보기 추가
                </button>
              )}
            </div>
          )}

          {problem(f) && <p className="mt-2 text-xs text-danger">{problem(f)}</p>}
        </div>
      ))}

      {fields.length < MAX_BOOKING_FIELDS && (
        <button
          type="button"
          onClick={add}
          className="rounded-xl border border-dashed border-fg/15 py-2.5 text-sm font-medium text-fg/60 hover:bg-fg/[0.04]"
        >
          + 항목 추가
        </button>
      )}

      <SaveButton blocked={incomplete.length > 0} />
      {incomplete.length > 0 && (
        <p className="text-xs text-danger">
          덜 채운 항목 {incomplete.length}개를 마저 적거나 지워주세요.
        </p>
      )}
    </div>
  );
}

function SaveButton({ blocked }: { blocked: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending || blocked}
      className="mt-1 rounded-xl bg-fg py-3 text-sm font-semibold text-bg transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {pending ? "저장 중…" : "저장"}
    </button>
  );
}
