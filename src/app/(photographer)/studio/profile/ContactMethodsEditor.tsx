"use client";

// 연락 수단 등록 — 예약이 확정된 뒤 고객에게 건넬 것들.
//
// 매번 채팅에 타이핑하지 않게 미리 등록해두고, 예약 카드의 [연락처 보내기] 한 번으로 넘긴다.
// 넘긴 시점의 값은 예약 건에 스냅샷으로 굳으므로, 여기서 나중에 바꿔도 지난 전달 기록은
// 그대로 남는다 (docs/32 §3-3).

import { useState } from "react";
import { useFormStatus } from "react-dom";
import {
  CONTACT_KIND_LABEL,
  CONTACT_KIND_PLACEHOLDER,
  MAX_CONTACT_METHODS,
  MAX_CONTACT_VALUE,
  type ContactKind,
  type ContactMethod,
} from "@/lib/photographer-contacts";

type Draft = ContactMethod & { key: string };

let seq = 0;
const nextKey = () => `k${seq++}`;

const KINDS: ContactKind[] = ["kakao_open", "phone", "instagram", "other"];

export function ContactMethodsEditor({ initial }: { initial: ContactMethod[] }) {
  const [rows, setRows] = useState<Draft[]>(() => initial.map((c) => ({ ...c, key: nextKey() })));

  const patch = (key: string, next: Partial<Draft>) =>
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...next } : r)));

  const add = () => {
    if (rows.length >= MAX_CONTACT_METHODS) return;
    setRows((prev) => [
      ...prev,
      { key: nextKey(), id: `c${prev.length + 1}_${Date.now().toString(36).slice(-4)}`, kind: "kakao_open", value: "" },
    ]);
  };

  const remove = (key: string) => setRows((prev) => prev.filter((r) => r.key !== key));

  const payload = JSON.stringify(
    rows.map(({ key: _key, ...c }) => c) // eslint-disable-line @typescript-eslint/no-unused-vars
  );
  const empty = rows.filter((r) => !r.value.trim()).length;

  return (
    <div className="flex flex-col gap-2">
      <input type="hidden" name="contact_methods" value={payload} />

      {rows.length === 0 && (
        <p className="rounded-xl border border-dashed border-fg/15 px-4 py-5 text-center text-sm text-fg/50">
          아직 등록한 연락 수단이 없어요.
        </p>
      )}

      {rows.map((r) => (
        <div key={r.key} className="rounded-xl border border-fg/15 bg-surface p-3">
          <div className="flex items-center gap-2">
            <select
              value={r.kind}
              onChange={(e) => patch(r.key, { kind: e.target.value as ContactKind })}
              className="shrink-0 cursor-pointer rounded-lg border border-fg/15 bg-bg px-2.5 py-2 text-sm outline-none focus:border-fg/40"
            >
              {KINDS.map((k) => (
                <option key={k} value={k}>
                  {CONTACT_KIND_LABEL[k]}
                </option>
              ))}
            </select>
            <input
              value={r.value}
              maxLength={MAX_CONTACT_VALUE}
              onChange={(e) => patch(r.key, { value: e.target.value })}
              placeholder={CONTACT_KIND_PLACEHOLDER[r.kind]}
              className="min-w-0 flex-1 rounded-lg border border-fg/15 bg-bg px-3 py-2 text-sm font-normal outline-none focus:border-fg/40"
            />
            <button
              type="button"
              onClick={() => remove(r.key)}
              aria-label="삭제"
              className="grid h-7 w-7 shrink-0 cursor-pointer place-items-center rounded-lg text-xs text-danger hover:bg-danger/10"
            >
              ×
            </button>
          </div>
          <input
            value={r.label ?? ""}
            maxLength={30}
            onChange={(e) => patch(r.key, { label: e.target.value })}
            placeholder={`고객에게 보일 이름 (비우면 "${CONTACT_KIND_LABEL[r.kind]}")`}
            className="mt-2 w-full rounded-lg border border-fg/15 bg-bg px-3 py-1.5 text-sm font-normal outline-none focus:border-fg/40"
          />
        </div>
      ))}

      {rows.length < MAX_CONTACT_METHODS && (
        <button
          type="button"
          onClick={add}
          className="rounded-xl border border-dashed border-fg/15 py-2.5 text-sm font-medium text-fg/60 hover:bg-fg/[0.04]"
        >
          + 연락 수단 추가
        </button>
      )}

      {empty > 0 && (
        <p className="text-xs text-fg/45">빈 칸은 저장할 때 자동으로 빠져요.</p>
      )}
      <SaveButton />
    </div>
  );
}

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="mt-1 rounded-xl bg-fg py-3 text-sm font-semibold text-bg transition-opacity hover:opacity-90 disabled:opacity-40"
    >
      {pending ? "저장 중…" : "저장"}
    </button>
  );
}
