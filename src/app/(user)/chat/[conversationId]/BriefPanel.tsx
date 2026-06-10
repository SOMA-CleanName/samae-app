"use client";

/* eslint-disable @next/next/no-img-element */
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ConsultationBrief } from "@/lib/chat";

const MAX_IMAGES = 5;

// 채팅방 상담 정보 — 작가는 열람, 고객은 작성/수정. 고객 첫 진입(미작성)이면 자동으로 폼 오픈.
export function BriefPanel({
  conversationId,
  amCustomer,
  initialBrief,
}: {
  conversationId: string;
  amCustomer: boolean;
  initialBrief: ConsultationBrief | null;
}) {
  const [open, setOpen] = useState(false);

  // 인라인 배너 등 외부에서 'samae:open-brief' 이벤트로 모달 열기(자동 전체화면 대신 완화)
  useEffect(() => {
    function openFromEvent() {
      setOpen(true);
    }
    window.addEventListener("samae:open-brief", openFromEvent);
    return () => window.removeEventListener("samae:open-brief", openFromEvent);
  }, []);

  // 모달 열림 동안 배경 스크롤 잠금
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const label = amCustomer
    ? initialBrief
      ? "상담 정보"
      : "상담 정보 작성"
    : "상담 정보";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs text-fg/50 hover:text-fg"
      >
        📋 {label}
      </button>

      {open && (
        <Overlay onClose={() => setOpen(false)}>
          {amCustomer ? (
            <BriefForm
              conversationId={conversationId}
              brief={initialBrief}
              onClose={() => setOpen(false)}
            />
          ) : (
            <BriefView brief={initialBrief} onClose={() => setOpen(false)} />
          )}
        </Overlay>
      )}
    </>
  );
}

// 공용 모달 오버레이
function Overlay({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 font-kr"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="relative max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-bg p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

// ───────── 작가 열람용(읽기 전용) ─────────
function BriefView({ brief, onClose }: { brief: ConsultationBrief | null; onClose: () => void }) {
  if (!brief) {
    return (
      <div>
        <Header title="상담 정보" onClose={onClose} />
        <p className="mt-6 text-center text-sm text-fg/45">아직 고객이 작성한 상담 정보가 없어요.</p>
      </div>
    );
  }
  return (
    <div>
      <Header title="상담 정보" onClose={onClose} />
      <dl className="mt-4 grid grid-cols-[5rem_1fr] gap-x-3 gap-y-2.5 text-sm">
        <Row label="성별" value={brief.gender} />
        <Row label="인원" value={brief.party_size != null ? `${brief.party_size}명` : null} />
        <Row label="목적" value={brief.purpose} />
        <Row label="희망 일정" value={brief.preferred_date} />
        <Row label="희망 지역" value={brief.region} />
        <Row label="요청" value={brief.note} />
      </dl>

      {brief.ref_image_paths.length > 0 && (
        <div className="mt-4">
          <p className="text-xs text-fg/45">레퍼런스 사진</p>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {brief.ref_image_paths.map((url) => (
              <a
                key={url}
                href={url}
                target="_blank"
                rel="noreferrer"
                className="block aspect-square overflow-hidden rounded-lg bg-fg/[0.05]"
              >
                <img src={url} alt="" loading="lazy" className="h-full w-full object-cover" />
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string | null }) {
  return (
    <>
      <dt className="text-fg/45">{label}</dt>
      <dd className={value ? "" : "text-fg/35"}>{value || "—"}</dd>
    </>
  );
}

// ───────── 고객 작성/수정용 폼 ─────────
type NewImage = { file: File; url: string };

function BriefForm({
  conversationId,
  brief,
  onClose,
}: {
  conversationId: string;
  brief: ConsultationBrief | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [keep, setKeep] = useState<string[]>(brief?.ref_image_paths ?? []);
  const [added, setAdded] = useState<NewImage[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // 미리보기 objectURL 정리
  useEffect(() => {
    return () => added.forEach((a) => URL.revokeObjectURL(a.url));
  }, [added]);

  const total = keep.length + added.length;

  function onPickFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []).filter((f) => f.type.startsWith("image/"));
    const room = MAX_IMAGES - total;
    const next = picked.slice(0, Math.max(0, room)).map((file) => ({
      file,
      url: URL.createObjectURL(file),
    }));
    setAdded((prev) => [...prev, ...next]);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const fd = new FormData(e.currentTarget);
    fd.set("conversationId", conversationId);
    keep.forEach((u) => fd.append("keep", u));
    added.forEach((a) => fd.append("file", a.file));

    try {
      const res = await fetch("/api/brief", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "저장 실패");
      router.refresh();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "저장에 실패했어요.");
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit}>
      <Header title={brief ? "상담 정보 수정" : "상담 정보 작성"} onClose={onClose} />
      <p className="mt-1 text-xs text-fg/45">작가가 촬영을 준비할 수 있도록 알려주세요. 나중에 수정할 수 있어요.</p>

      <div className="mt-4 space-y-3">
        <label className="block">
          <span className="text-xs text-fg/55">성별</span>
          <select
            name="gender"
            defaultValue={brief?.gender ?? ""}
            className="mt-1 w-full rounded-lg border border-fg/15 bg-transparent px-3 py-2 text-sm"
          >
            <option value="">선택 안 함</option>
            <option value="여성">여성</option>
            <option value="남성">남성</option>
            <option value="혼성">혼성</option>
            <option value="무관">무관</option>
          </select>
        </label>

        <Input name="party_size" label="인원" defaultValue={brief?.party_size?.toString() ?? ""} placeholder="예: 2" inputMode="numeric" />

        <Input name="purpose" label="사진 목적" defaultValue={brief?.purpose ?? ""} placeholder="프로필 / 커플 / 가족 / 우정 스냅 등" />
        <Input name="preferred_date" label="희망 일정" defaultValue={brief?.preferred_date ?? ""} placeholder="예: 6월 말 주말 오후" />
        <Input name="region" label="희망 지역" defaultValue={brief?.region ?? ""} placeholder="예: 서울 성수동 일대" />

        <label className="block">
          <span className="text-xs text-fg/55">자유 요청</span>
          <textarea
            name="note"
            defaultValue={brief?.note ?? ""}
            rows={3}
            placeholder="원하는 분위기, 의상, 참고 사항 등"
            className="mt-1 w-full resize-none rounded-lg border border-fg/15 bg-transparent px-3 py-2 text-sm"
          />
        </label>

        {/* 레퍼런스 사진 */}
        <div>
          <span className="text-xs text-fg/55">레퍼런스 사진 ({total}/{MAX_IMAGES})</span>
          <div className="mt-2 grid grid-cols-4 gap-2">
            {keep.map((url) => (
              <Thumb key={url} url={url} onRemove={() => setKeep((p) => p.filter((u) => u !== url))} />
            ))}
            {added.map((a) => (
              <Thumb key={a.url} url={a.url} onRemove={() => setAdded((p) => p.filter((x) => x.url !== a.url))} />
            ))}
            {total < MAX_IMAGES && (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="grid aspect-square place-items-center rounded-lg border border-dashed border-fg/25 text-fg/40 hover:bg-fg/[0.03]"
                aria-label="사진 추가"
              >
                +
              </button>
            )}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            onChange={onPickFiles}
            className="hidden"
          />
        </div>
      </div>

      {error && <p className="mt-3 text-sm text-brand">{error}</p>}

      <div className="mt-5 flex gap-2">
        <button
          type="button"
          onClick={onClose}
          className="flex-1 rounded-full border border-fg/15 py-2.5 text-sm font-medium text-fg/70 hover:bg-fg/[0.04]"
        >
          {brief ? "닫기" : "건너뛰기"}
        </button>
        <button
          type="submit"
          disabled={saving}
          className="flex-1 rounded-full bg-fg py-2.5 text-sm font-semibold text-bg hover:opacity-90 disabled:opacity-50"
        >
          {saving ? "저장 중…" : "저장"}
        </button>
      </div>
    </form>
  );
}

function Input({
  name,
  label,
  defaultValue,
  placeholder,
  inputMode,
}: {
  name: string;
  label: string;
  defaultValue?: string;
  placeholder?: string;
  inputMode?: "numeric" | "text";
}) {
  return (
    <label className="block">
      <span className="text-xs text-fg/55">{label}</span>
      <input
        name={name}
        defaultValue={defaultValue}
        placeholder={placeholder}
        inputMode={inputMode}
        className="mt-1 w-full rounded-lg border border-fg/15 bg-transparent px-3 py-2 text-sm"
      />
    </label>
  );
}

function Thumb({ url, onRemove }: { url: string; onRemove: () => void }) {
  return (
    <div className="relative aspect-square overflow-hidden rounded-lg bg-fg/[0.05]">
      <img src={url} alt="" className="h-full w-full object-cover" />
      <button
        type="button"
        onClick={onRemove}
        aria-label="삭제"
        className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-black/55 text-[10px] text-white hover:bg-black/75"
      >
        ✕
      </button>
    </div>
  );
}

function Header({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div className="flex items-center justify-between">
      <h2 className="text-base font-semibold">{title}</h2>
      <button type="button" onClick={onClose} aria-label="닫기" className="text-fg/40 hover:text-fg">
        ✕
      </button>
    </div>
  );
}
