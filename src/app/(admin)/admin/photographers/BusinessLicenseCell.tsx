"use client";

// 작가별 사업자등록증 — 어드민이 열어 보고 확인 처리한다.
//
// 링크를 지면에 박아 두지 않는다. 등록증은 비공개 버킷에 있고(0124), 열람은 **누를 때**
// 서명 URL 을 만들어 새 창으로 연다. 지면에 박아 두면 그 지면이 캐시되거나 공유될 때
// 링크도 같이 새고, 서명 URL 은 경로를 아는 사람 누구나 쓸 수 있다.

import { useState } from "react";
import { verifyBusinessLicense } from "./actions";

export function BusinessLicenseCell({
  photographerId,
  businessType,
  uploadedAt,
  verifiedAt,
  note,
}: {
  photographerId: string;
  businessType: string | null;
  uploadedAt: string | null;
  verifiedAt: string | null;
  note: string | null;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 미등록 작가는 등록증 자체가 없다 — 빈 칸을 보여줄 이유가 없다
  if (!businessType || businessType === "unregistered") {
    return <span className="text-caption text-faint">미등록 — 등록증 없음</span>;
  }

  async function open() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/business-license?photographerId=${encodeURIComponent(photographerId)}`
      );
      const json = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !json.url) {
        setError(json.error ?? "열지 못했어요.");
        return;
      }
      window.open(json.url, "_blank", "noopener,noreferrer");
    } catch {
      setError("네트워크 오류예요.");
    } finally {
      setBusy(false);
    }
  }

  if (!uploadedAt) {
    return <span className="text-caption text-warning-ink">등록증 미제출</span>;
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={open}
          disabled={busy}
          className="cursor-pointer rounded-full border border-line-strong px-2.5 py-1 text-caption hover:border-fg disabled:opacity-50"
        >
          {busy ? "여는 중…" : "등록증 보기"}
        </button>

        {verifiedAt ? (
          <span className="text-caption text-success">✓ 확인됨</span>
        ) : (
          <form action={verifyBusinessLicense} className="inline-flex items-center gap-1.5">
            <input type="hidden" name="id" value={photographerId} />
            <input type="hidden" name="ok" value="1" />
            <button
              type="submit"
              className="cursor-pointer rounded-full bg-fg px-2.5 py-1 text-caption font-medium text-bg hover:opacity-90"
            >
              대조 완료
            </button>
          </form>
        )}
      </div>

      {/* 반려·보류 메모 — 확인이 안 된 이유가 남아야 작가에게 뭘 다시 받을지 안다 */}
      <form action={verifyBusinessLicense} className="flex items-center gap-1.5">
        <input type="hidden" name="id" value={photographerId} />
        {/* 지금 확인 상태를 그대로 실어 보낸다 — 빼면 메모만 고쳐도 확인이 풀린다 */}
        <input type="hidden" name="ok" value={verifiedAt ? "1" : ""} />
        <input
          name="note"
          defaultValue={note ?? ""}
          maxLength={300}
          placeholder="메모 (상호 불일치 등)"
          className="w-40 rounded-full border border-line bg-bg px-2.5 py-1 text-caption focus:border-fg/30 focus:outline-none"
        />
        <button
          type="submit"
          className="cursor-pointer rounded-full border border-line-strong px-2.5 py-1 text-caption hover:border-fg"
        >
          저장
        </button>
      </form>

      {error && <span className="text-caption text-danger">{error}</span>}
    </div>
  );
}
