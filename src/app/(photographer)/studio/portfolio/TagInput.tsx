"use client";

import { useRef, useState } from "react";

// 태그 입력 — 칩 방식. Enter/쉼표로 추가, 빈 입력에서 Backspace로 마지막 삭제, 최대 max개.
// 제어형: value/onChange 사용. 폼 제출형: name 주면 쉼표 join한 hidden input 렌더.
export function TagInput({
  name,
  defaultTags = [],
  max = 5,
  onChange,
  placeholder = "태그 입력 후 Enter",
}: {
  name?: string;
  defaultTags?: string[];
  max?: number;
  onChange?: (tags: string[]) => void;
  placeholder?: string;
}) {
  const [tags, setTags] = useState<string[]>(() => defaultTags.slice(0, max));
  const [draft, setDraft] = useState("");
  // 한글 IME 조합 중인지 — 조합 확정용 Enter/글자를 태그 추가로 오인하지 않도록
  const composing = useRef(false);

  function commit(next: string[]) {
    setTags(next);
    onChange?.(next);
  }

  // 한 개 추가 — 공백/쉼표 제거, 중복·정원초과 무시
  function addTag(raw: string) {
    const t = raw.trim().replace(/,/g, "");
    setDraft("");
    if (!t || tags.length >= max || tags.includes(t)) return;
    commit([...tags, t]);
  }

  function removeAt(i: number) {
    commit(tags.filter((_, idx) => idx !== i));
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    // IME 조합 중 Enter/, 는 글자 확정용 — 태그 추가로 처리하지 않는다.
    if (composing.current || e.nativeEvent.isComposing) return;
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag(draft);
    } else if (e.key === "Backspace" && draft === "" && tags.length > 0) {
      removeAt(tags.length - 1);
    }
  }

  const full = tags.length >= max;

  return (
    <div>
      <div className="field-wrap flex flex-wrap items-center gap-1.5 rounded-lg border border-fg/15 bg-surface px-2 py-1.5">
        {tags.map((t, i) => (
          <span
            key={t}
            className="flex items-center gap-1 rounded-full bg-fg/[0.06] py-0.5 pl-2.5 pr-1 text-xs text-fg"
          >
            {t}
            <button
              type="button"
              onClick={() => removeAt(i)}
              aria-label={`${t} 삭제`}
              className="grid h-4 w-4 place-items-center rounded-full text-fg/40 hover:bg-fg/10 hover:text-fg"
            >
              ✕
            </button>
          </span>
        ))}
        {!full && (
          <input
            value={draft}
            onChange={(e) => {
              // 쉼표 입력 순간에도 칩으로 확정 (조합 중엔 그대로 두고 확정 시 처리)
              if (!composing.current && e.target.value.includes(",")) addTag(e.target.value);
              else setDraft(e.target.value);
            }}
            onCompositionStart={() => {
              composing.current = true;
            }}
            onCompositionEnd={(e) => {
              composing.current = false;
              setDraft(e.currentTarget.value);
            }}
            onKeyDown={onKeyDown}
            onBlur={() => addTag(draft)}
            placeholder={tags.length === 0 ? placeholder : ""}
            className="min-w-[7rem] flex-1 bg-transparent px-1 py-0.5 text-sm text-fg outline-none placeholder:text-fg/45"
          />
        )}
      </div>
      <p className="mt-1 text-[11px] text-fg/40">
        {tags.length}/{max}
        {full ? " · 최대 개수예요" : ""}
      </p>
      {name && <input type="hidden" name={name} value={tags.join(", ")} />}
    </div>
  );
}
