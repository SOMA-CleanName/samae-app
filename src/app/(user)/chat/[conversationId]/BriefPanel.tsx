"use client";

/* eslint-disable @next/next/no-img-element */
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ConsultationBrief } from "@/lib/chat";
import { ClipboardIcon, XIcon, PlusIcon } from "@/components/user/icons";

const MAX_IMAGES = 5;

// 채팅방 상담 정보 — 작가는 열람, 고객은 작성/수정. 고객 첫 진입(미작성)이면 자동으로 폼 오픈.
export function BriefPanel({
  conversationId,
  amCustomer,
  initialBrief,
  sourcePhotoPath,
  expandOnHover = false,
  requireCompletion = false,
}: {
  conversationId: string;
  amCustomer: boolean;
  initialBrief: ConsultationBrief | null;
  sourcePhotoPath: string | null;
  expandOnHover?: boolean;
  requireCompletion?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [hasBrief, setHasBrief] = useState(!!initialBrief);

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
    ? hasBrief
      ? "상담 정보"
      : "상담 정보 작성"
    : "상담 정보";
  // 고객이 아직 상담 정보를 안 썼으면 점으로 환기
  const needsAttention = amCustomer && !hasBrief;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={label}
        title={label}
        className="group relative grid h-9 w-9 cursor-pointer place-items-center rounded-full text-fg/65 transition-colors hover:bg-fg/[0.06] hover:text-fg"
      >
        <ClipboardIcon className="h-5 w-5" />
        {expandOnHover && (
          <span className="pointer-events-none absolute right-0 top-10 z-10 whitespace-nowrap rounded-full border border-line bg-bg px-3 py-1.5 text-sm font-medium text-fg opacity-0 shadow-sm transition-opacity duration-150 group-hover:opacity-100">
            {label}
          </span>
        )}
        {needsAttention && (
          <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-brand ring-2 ring-bg" />
        )}
      </button>

      {open && (
        <Overlay onClose={() => setOpen(false)}>
          {amCustomer ? (
            <BriefForm
              conversationId={conversationId}
              brief={initialBrief}
              sourcePhotoPath={sourcePhotoPath}
              requireCompletion={requireCompletion}
              onSaved={() => setHasBrief(true)}
              onClose={() => setOpen(false)}
            />
          ) : (
            <BriefView
              brief={initialBrief}
              sourcePhotoPath={sourcePhotoPath}
              onClose={() => setOpen(false)}
            />
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
        className="relative max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-bg p-5 shadow-pop"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

// 문의 진입 출처 사진 — 사진에서 채팅을 시작한 경우 상담 정보에 함께 노출(채팅 버블 대체)
function SourcePhoto({ path }: { path: string | null }) {
  if (!path) return null;
  return (
    <div className="mt-4">
      <p className="text-xs text-faint">문의한 사진</p>
      <a
        href={path}
        target="_blank"
        rel="noreferrer"
        className="mt-2 block aspect-[4/5] w-28 overflow-hidden rounded-lg bg-fg/[0.05]"
      >
        <img src={path} alt="" loading="lazy" className="h-full w-full object-cover" />
      </a>
    </div>
  );
}

// ───────── 작가 열람용(읽기 전용) ─────────
function BriefView({
  brief,
  sourcePhotoPath,
  onClose,
}: {
  brief: ConsultationBrief | null;
  sourcePhotoPath: string | null;
  onClose: () => void;
}) {
  if (!brief) {
    return (
      <div>
        <Header title="상담 정보" onClose={onClose} />
        <SourcePhoto path={sourcePhotoPath} />
        <p className="mt-6 text-center text-sm text-faint">아직 고객이 작성한 상담 정보가 없어요.</p>
      </div>
    );
  }
  return (
    <div>
      <Header title="상담 정보" onClose={onClose} />
      <SourcePhoto path={sourcePhotoPath} />
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
          <p className="text-xs text-faint">레퍼런스 사진</p>
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
      <dt className="text-faint">{label}</dt>
      <dd className={value ? "" : "text-faint"}>{value || "—"}</dd>
    </>
  );
}

// ───────── 고객 작성/수정용 폼 ─────────
type NewImage = { file: File; url: string };

function BriefForm({
  conversationId,
  brief,
  sourcePhotoPath,
  requireCompletion,
  onSaved,
  onClose,
}: {
  conversationId: string;
  brief: ConsultationBrief | null;
  sourcePhotoPath: string | null;
  requireCompletion: boolean;
  onSaved: () => void;
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
    if (requireCompletion) fd.set("requireCompletion", "1");
    keep.forEach((u) => fd.append("keep", u));
    added.forEach((a) => fd.append("file", a.file));

    try {
      const res = await fetch("/api/brief", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "저장 실패");
      if (!requireCompletion) router.refresh();
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "저장에 실패했어요.");
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit}>
      <Header title={brief ? "상담 정보 수정" : "상담 정보 작성"} onClose={onClose} />
      <p className="mt-1 text-xs text-faint">작가가 촬영을 준비할 수 있도록 알려주세요. 나중에 수정할 수 있어요.</p>
      <SourcePhoto path={sourcePhotoPath} />

      <div className="mt-4 space-y-3">
        <label className="block">
          <span className="text-xs text-muted">성별</span>
          <select
            name="gender"
            defaultValue={brief?.gender ?? ""}
            className="mt-1 w-full rounded-lg border border-line-strong bg-transparent px-3 py-2 text-sm"
          >
            <option value="">선택 안 함</option>
            <option value="여성">여성</option>
            <option value="남성">남성</option>
            <option value="혼성">혼성</option>
            <option value="무관">무관</option>
          </select>
        </label>

        <Input name="party_size" label="인원" defaultValue={brief?.party_size?.toString() ?? ""} placeholder="예: 2" inputMode="numeric" />

        <Input
          name="purpose"
          label="사진 목적"
          defaultValue={brief?.purpose ?? ""}
          placeholder="프로필 / 커플 / 가족 / 우정 스냅 등"
          required={requireCompletion}
        />
        <Input
          name="preferred_date"
          label="희망 일정"
          defaultValue={brief?.preferred_date ?? ""}
          placeholder="예: 6월 말 주말 오후"
          required={requireCompletion}
        />
        <Input
          name="region"
          label="희망 지역"
          defaultValue={brief?.region ?? ""}
          placeholder="예: 서울 성수동 일대"
          required={requireCompletion}
        />

        <label className="block">
          <span className="text-xs text-muted">자유 요청</span>
          <textarea
            name="note"
            defaultValue={brief?.note ?? ""}
            rows={3}
            placeholder="원하는 분위기, 의상, 참고 사항 등"
            className="mt-1 w-full resize-none rounded-lg border border-line-strong bg-transparent px-3 py-2 text-sm"
          />
        </label>

        {/* 레퍼런스 사진 */}
        <div>
          <span className="text-xs text-muted">레퍼런스 사진 ({total}/{MAX_IMAGES})</span>
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
                className="grid aspect-square cursor-pointer place-items-center rounded-lg border border-dashed border-line-strong text-faint transition-colors hover:bg-fg/[0.03] hover:text-muted"
                aria-label="사진 추가"
              >
                <PlusIcon className="h-5 w-5" />
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
        {!requireCompletion && (
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-full border border-line-strong py-2.5 text-sm font-medium text-muted hover:bg-fg/[0.04]"
          >
            {brief ? "닫기" : "건너뛰기"}
          </button>
        )}
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
  required,
}: {
  name: string;
  label: string;
  defaultValue?: string;
  placeholder?: string;
  inputMode?: "numeric" | "text";
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-xs text-muted">{label}</span>
      <input
        name={name}
        defaultValue={defaultValue}
        placeholder={placeholder}
        inputMode={inputMode}
        required={required}
        className="mt-1 w-full rounded-lg border border-line-strong bg-transparent px-3 py-2 text-sm"
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
        className="absolute right-1 top-1 grid h-5 w-5 cursor-pointer place-items-center rounded-full bg-black/55 text-white transition-colors hover:bg-black/75"
      >
        <XIcon className="h-3 w-3" />
      </button>
    </div>
  );
}

function Header({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div className="flex items-center justify-between">
      <h2 className="text-title font-semibold">{title}</h2>
      <button
        type="button"
        onClick={onClose}
        aria-label="닫기"
        className="grid h-8 w-8 cursor-pointer place-items-center rounded-full text-muted transition-colors hover:bg-fg/[0.06] hover:text-fg"
      >
        <XIcon className="h-5 w-5" />
      </button>
    </div>
  );
}
