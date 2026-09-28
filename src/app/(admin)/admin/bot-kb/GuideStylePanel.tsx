"use client";

// 운영용 얇은 껍데기 — 고르는 화면 자체는 components/guide/GuideStylePicker 가 전부다.
// 여기서는 **어느 작가의 것을 어디서 받아 어디에 저장하는지**만 정한다.

import { GuideStylePicker } from "@/components/guide/GuideStylePicker";
import type { GuideStyle } from "@/lib/guide-style";
import { saveGuideStyle, uploadGuideBackdrop } from "./actions";

export function GuideStylePanel({
  photographerId,
  initial,
  rev,
}: {
  photographerId: string;
  initial: GuideStyle;
  rev?: string;
}) {
  return (
    <GuideStylePicker
      initial={initial}
      rev={rev}
      sheetsUrl={`/api/admin/guide-card?pid=${photographerId}`}
      imageUrl={(sheet, style) => {
        const q = new URLSearchParams({
          pid: photographerId,
          sheet: String(sheet),
          template: style.template,
          backdrop: style.backdrop,
          font: style.font,
        });
        if (rev) q.set("rev", rev);
        if (style.backdropUrl) q.set("backdropUrl", style.backdropUrl);
        return `/api/admin/guide-card?${q.toString()}`;
      }}
      onSave={(style) => saveGuideStyle(photographerId, style)}
      onUpload={(form) => {
        form.set("photographerId", photographerId);
        return uploadGuideBackdrop(form);
      }}
    />
  );
}
