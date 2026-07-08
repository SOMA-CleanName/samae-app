"use client";

import { createContext, useContext, useMemo, useState, useTransition } from "react";
import { checkResetPassword } from "@/lib/admin-reset-action";

export type ResetState = { error?: string; ok?: boolean };
type ResetAction = (prev: ResetState, fd: FormData) => Promise<ResetState>;

type DeleteModeCtx = {
  active: boolean;
  password: string;
  selected: Set<string>;
  isSelected: (id: string) => boolean;
  toggle: (id: string) => void;
  toggleAll: (ids: string[]) => void;
  enter: (pw: string) => void;
  exit: () => void;
  clear: () => void;
};

const Ctx = createContext<DeleteModeCtx | null>(null);

function useDeleteMode(): DeleteModeCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useDeleteMode must be used within DeleteModeProvider");
  return v;
}

export function DeleteModeProvider({ children }: { children: React.ReactNode }) {
  const [active, setActive] = useState(false);
  const [password, setPassword] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const value = useMemo<DeleteModeCtx>(
    () => ({
      active,
      password,
      selected,
      isSelected: (id) => selected.has(id),
      toggle: (id) =>
        setSelected((prev) => {
          const next = new Set(prev);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          return next;
        }),
      toggleAll: (ids) =>
        setSelected((prev) => (ids.every((id) => prev.has(id)) ? new Set() : new Set(ids))),
      enter: (pw) => {
        setPassword(pw);
        setActive(true);
      },
      exit: () => {
        setActive(false);
        setPassword("");
        setSelected(new Set());
      },
      clear: () => setSelected(new Set()),
    }),
    [active, password, selected]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

// 각 행에 붙는 선택 체크박스 — 삭제 모드일 때만 렌더.
export function SelectCheckbox({ id, className }: { id: string; className?: string }) {
  const { active, isSelected, toggle } = useDeleteMode();
  if (!active) return null;
  return (
    <input
      type="checkbox"
      checked={isSelected(id)}
      onChange={() => toggle(id)}
      onClick={(e) => e.stopPropagation()}
      aria-label="삭제 선택"
      className={className ?? "h-4 w-4 shrink-0 cursor-pointer accent-danger"}
    />
  );
}

// 목록 상단 삭제 툴바 — 진입(비밀번호) → 전체 초기화 / 선택 삭제 / 나가기.
export function DeleteModeToolbar({
  clearAction,
  deleteSelectedAction,
  allIds,
  clearWarning,
  entityLabel = "건",
}: {
  clearAction: ResetAction;
  deleteSelectedAction: ResetAction;
  allIds: string[];
  clearWarning?: string;
  entityLabel?: string;
}) {
  const { active, password, selected, enter, exit, clear, toggleAll } = useDeleteMode();
  const [opening, setOpening] = useState(false);
  const [pw, setPw] = useState("");
  const [msg, setMsg] = useState<{ error?: string; ok?: string } | null>(null);
  const [pending, start] = useTransition();

  const selectedCount = selected.size;
  const allChecked = allIds.length > 0 && allIds.every((id) => selected.has(id));

  // 비밀번호 확인 → 삭제 모드 진입
  function submitPassword() {
    setMsg(null);
    start(async () => {
      const r = await checkResetPassword(pw);
      if (!r.ok) {
        setMsg({ error: r.error ?? "비밀번호가 올바르지 않아요." });
        return;
      }
      enter(pw);
      setPw("");
      setOpening(false);
    });
  }

  function runClear() {
    if (!window.confirm(clearWarning ?? "전체를 삭제할까요? 되돌릴 수 없어요(백업은 보관).")) return;
    setMsg(null);
    const fd = new FormData();
    fd.set("password", password);
    start(async () => {
      const r = await clearAction({}, fd);
      if (r.error) setMsg({ error: r.error });
      else {
        setMsg({ ok: "전체 초기화됐어요." });
        exit();
      }
    });
  }

  function runDeleteSelected() {
    const ids = [...selected];
    if (ids.length === 0) return;
    if (!window.confirm(`${ids.length}${entityLabel}을(를) 삭제할까요? 되돌릴 수 없어요(백업은 보관).`)) return;
    setMsg(null);
    const fd = new FormData();
    fd.set("password", password);
    fd.set("ids", JSON.stringify(ids));
    start(async () => {
      const r = await deleteSelectedAction({}, fd);
      if (r.error) setMsg({ error: r.error });
      else {
        setMsg({ ok: `${ids.length}${entityLabel} 삭제됐어요.` });
        clear();
      }
    });
  }

  // 비활성: "삭제" 버튼만
  if (!active) {
    if (!opening) {
      return (
        <div className="flex flex-col items-end gap-1">
          <button
            type="button"
            onClick={() => setOpening(true)}
            className="shrink-0 cursor-pointer rounded-full border border-line-strong px-3 py-1.5 text-caption font-medium text-muted transition-colors hover:bg-fg/[0.04]"
          >
            삭제
          </button>
          {msg?.ok && <span className="text-caption text-success">{msg.ok}</span>}
        </div>
      );
    }
    return (
      <div className="flex flex-col items-end gap-1">
        <div className="flex flex-wrap items-center justify-end gap-2">
          <input
            type="password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submitPassword()}
            placeholder="비밀번호"
            autoComplete="off"
            autoFocus
            className="w-32 rounded-lg border border-line-strong bg-surface px-2.5 py-1.5 text-caption outline-none focus:border-fg/40"
          />
          <button
            type="button"
            disabled={pending}
            onClick={submitPassword}
            className="cursor-pointer rounded-full bg-fg px-3 py-1.5 text-caption font-semibold text-bg transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {pending ? "확인 중…" : "확인"}
          </button>
          <button
            type="button"
            onClick={() => {
              setOpening(false);
              setPw("");
              setMsg(null);
            }}
            className="cursor-pointer rounded-full px-2 py-1.5 text-caption text-muted hover:text-fg"
          >
            취소
          </button>
        </div>
        {msg?.error && <span className="text-caption text-danger">{msg.error}</span>}
      </div>
    );
  }

  // 활성: 삭제 모드 바
  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex flex-wrap items-center justify-end gap-2 rounded-xl border border-danger/30 bg-danger/[0.04] p-2">
        {allIds.length > 0 && (
          <label className="flex cursor-pointer items-center gap-1.5 px-1 text-caption text-muted">
            <input
              type="checkbox"
              checked={allChecked}
              onChange={() => toggleAll(allIds)}
              className="h-4 w-4 cursor-pointer accent-danger"
            />
            전체
          </label>
        )}
        <button
          type="button"
          disabled={pending || selectedCount === 0}
          onClick={runDeleteSelected}
          className="cursor-pointer rounded-full bg-danger px-3 py-1.5 text-caption font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          선택 삭제 ({selectedCount})
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={runClear}
          className="cursor-pointer rounded-full border border-danger/50 px-3 py-1.5 text-caption font-semibold text-danger transition-colors hover:bg-danger/10 disabled:opacity-50"
        >
          전체 초기화
        </button>
        <button
          type="button"
          onClick={() => {
            exit();
            setMsg(null);
          }}
          className="cursor-pointer rounded-full px-2 py-1.5 text-caption text-muted hover:text-fg"
        >
          나가기
        </button>
      </div>
      {msg?.error && <span className="text-caption text-danger">{msg.error}</span>}
      {msg?.ok && <span className="text-caption text-success">{msg.ok}</span>}
    </div>
  );
}
