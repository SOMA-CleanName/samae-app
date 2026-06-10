"use client";

import { useState } from "react";
import { updatePhotoMeta } from "./actions";

type Props = {
  id: string;
  priceKrw: number | null;
  locationText: string | null;
};

// 사진별 가격·장소 편집 모달 (가격 노출 여부는 탐색 메인에서 보는 사람이 토글)
export function PhotoMetaEditor({ id, priceKrw, locationText }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded bg-white/90 px-2 py-1 text-[11px] font-medium text-fg hover:bg-white"
      >
        편집
      </button>

      {open && (
        // 배경 클릭 시 닫기
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4 font-kr"
          onClick={() => setOpen(false)}
        >
          <form
            action={updatePhotoMeta}
            onSubmit={() => setOpen(false)}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl"
          >
            <h3 className="text-base font-semibold">사진 정보</h3>
            <p className="mt-0.5 text-xs text-fg/50">가격과 장소를 입력할 수 있어요.</p>

            <input type="hidden" name="id" value={id} />

            {/* 가격 */}
            <label className="mt-4 block text-sm font-medium">가격 (원)</label>
            <input
              name="price_krw"
              type="number"
              min={0}
              step={1000}
              defaultValue={priceKrw ?? ""}
              placeholder="예: 50000"
              className="mt-1 w-full rounded-lg border border-fg/15 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-fg/15"
            />
            <p className="mt-1 text-xs text-fg/45">
              입력한 가격은 보는 사람이 메인에서 “가격 보기”를 켤 때 노출돼요.
            </p>

            {/* 장소 */}
            <label className="mt-4 block text-sm font-medium">장소</label>
            <input
              name="location_text"
              type="text"
              maxLength={120}
              defaultValue={locationText ?? ""}
              placeholder="예: 성수동 카페, 한강공원"
              className="mt-1 w-full rounded-lg border border-fg/15 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-fg/15"
            />

            {/* 액션 */}
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex-1 rounded-full border border-fg/20 py-2.5 text-sm font-medium text-fg/70 hover:bg-fg/[0.04]"
              >
                취소
              </button>
              <button
                type="submit"
                className="flex-1 rounded-full bg-fg py-2.5 text-sm font-semibold text-bg hover:opacity-90"
              >
                저장
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
