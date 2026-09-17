"use client";

// 사업자등록증 업로드 — 입점 동의 화면의 사업자 등록 작가용.
//
// 번호만으로는 우리가 할 일을 못 한다(0124 주석). 세금계산서에 들어갈 상호·대표자가
// 등록증과 같은지 어드민이 눈으로 대조해야 하고, 그 대조가 곧 전자상거래법 20조의
// "확인" 이다.
//
// 폼 제출과 분리해 **즉시 올린다.** 동의 폼에 끼워 넣으면 10MB 파일이 서버 액션 본문에
// 실려 느려지고, 검증에 걸려 폼이 되돌아올 때마다 파일을 다시 고르게 된다.
// 올라간 사실만 폼이 hidden 으로 들고 가면 된다.

import { useRef, useState } from "react";

export function BusinessLicenseUpload({
  initialUploadedAt,
}: {
  /** 이미 올려 둔 게 있으면 그 시각 */
  initialUploadedAt?: string | null;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploaded, setUploaded] = useState(!!initialUploadedAt);
  const [name, setName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onPick(file: File) {
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set("file", file);
      const res = await fetch("/api/studio/business-license", { method: "POST", body: fd });
      const json = (await res.json()) as { ok?: boolean; error?: string; name?: string };
      if (!res.ok || !json.ok) {
        // 서버가 돌려준 말을 그대로 보인다 — "실패했어요" 로 덮으면 뭘 고쳐야 할지 모른다
        setError(json.error ?? "올리지 못했어요. 잠시 후 다시 시도해주세요.");
        return;
      }
      setUploaded(true);
      setName(json.name ?? file.name);
    } catch {
      setError("네트워크가 불안정해요. 다시 시도해주세요.");
    } finally {
      setBusy(false);
      // 같은 파일을 다시 고를 수 있게 비운다 (input[type=file] 은 값이 같으면 change 가 안 난다)
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="block">
      <span className="text-body-sm font-semibold">사업자등록증</span>

      {/* 폼이 읽는 값 — 파일 자체가 아니라 "올라갔다" 는 사실만 */}
      <input type="hidden" name="businessLicenseUploaded" value={uploaded ? "1" : ""} />

      <div className="mt-1.5 flex items-center gap-2.5">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="cursor-pointer rounded-xl border border-line-strong bg-surface px-3.5 py-2.5 text-body-sm font-medium transition-colors hover:border-fg disabled:opacity-50"
        >
          {busy ? "올리는 중…" : uploaded ? "다시 올리기" : "파일 선택"}
        </button>
        {uploaded && (
          <span className="min-w-0 truncate text-caption text-success">
            ✓ {name ?? "등록증이 올라와 있어요"}
          </span>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void onPick(f);
        }}
      />

      {error && (
        <p role="alert" className="mt-2 text-caption text-danger">
          {error}
        </p>
      )}

      <span className="mt-1.5 block text-caption leading-relaxed text-muted">
        수수료 세금계산서를 발급하려면 등록증의 상호·대표자가 입력하신 내용과 맞아야 해요.
        PDF 또는 사진(10MB 이하). 사매 운영진만 열람하며 작가님 외에는 공개되지 않아요.
      </span>
    </div>
  );
}
