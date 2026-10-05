"use client";

import { useMemo, useRef, useState } from "react";
import { addPhotoMoodTag } from "./actions";

export type AddTagOption = { key: string; name: string; big: string; words: string[] };

/**
 * [+ 태그 추가] — 가족을 찾아 사진에 직접 붙인다(사람 요청 2026-10-05). 번호 · 가족 이름 · 큰 무드 · 식구 말로 찾는다.
 * 이미 붙은 가족은 목록에서 뺀다. 고르면 바로 저장된다(빼기와 같은 기록, action add).
 */
export function AddTag({ photo, options, have }: { photo: string; options: AddTagOption[]; have: string[] }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [pending, setPending] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  const key = useRef<HTMLInputElement>(null);

  const hits = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const taken = new Set(have);
    return options
      .filter((o) => !taken.has(o.key))
      .filter((o) => !needle || [o.key, o.name, o.big, ...o.words].some((t) => t.toLowerCase().includes(needle)))
      .sort((a, b) => Number(!b.name.includes(q.trim())) - Number(!a.name.includes(q.trim())) || a.key.localeCompare(b.key))
      .slice(0, 8);
  }, [q, options, have]);

  function pick(k: string) {
    if (!key.current || !form.current) return;
    key.current.value = k;
    setPending(true);
    form.current.requestSubmit();
    setOpen(false);
    setQ("");
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="rounded-lg border border-dashed border-line px-2 py-0.5 text-muted hover:border-fg/40 hover:text-fg">
        {pending ? "붙이는 중…" : "+ 태그 추가"}
      </button>
    );
  }
  return (
    <div className="relative w-full max-w-xs">
      <form ref={form} action={async (fd) => { await addPhotoMoodTag(fd); setPending(false); }}>
        <input type="hidden" name="photo" value={photo} />
        <input ref={key} type="hidden" name="key" />
      </form>
      <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} aria-label="붙일 가족 찾기"
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
          if (e.key === "Enter" && hits[0]) { e.preventDefault(); pick(hits[0].key); }
        }}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
        placeholder="가족 찾기 — 이름 · 큰 무드 · 말 (Enter 로 첫째)"
        className="w-full rounded-lg border border-brand/50 bg-bg px-2 py-1 text-caption" />
      <ul className="absolute left-0 right-0 top-full z-20 mt-1 max-h-64 overflow-auto rounded-lg border border-line bg-surface shadow-lg">
        {hits.map((o) => (
          <li key={o.key}>
            <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => pick(o.key)}
              className="flex w-full items-baseline gap-1.5 px-2 py-1.5 text-left text-caption hover:bg-brand/10">
              <span className="tabular-nums text-muted">{o.key.toUpperCase()}</span>
              <b className="font-medium">{o.name}</b>
              <span className="text-muted">{o.big}</span>
            </button>
          </li>
        ))}
        {!hits.length && <li className="px-2 py-1.5 text-caption text-muted">맞는 가족이 없습니다</li>}
      </ul>
    </div>
  );
}
