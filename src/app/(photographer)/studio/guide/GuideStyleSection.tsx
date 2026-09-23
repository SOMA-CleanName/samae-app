"use client";

// 작가용 얇은 껍데기 — 고르는 화면은 components/guide/GuideStylePicker 가 전부다.
// **pid 를 넘기지 않는다.** 라우트와 액션이 세션에서 내 작가 행을 꺼내므로,
// 남의 id 를 끼워 넣어 다른 작가 것을 보거나 고칠 길이 없다.

import { GuideStylePicker } from "@/components/guide/GuideStylePicker";
import type { GuideStyle } from "@/lib/guide-style";
import { saveMyGuideStyle, uploadMyGuideBackdrop } from "./actions";

export function GuideStyleSection({ initial }: { initial: GuideStyle }) {
  return (
    <GuideStylePicker
      initial={initial}
      sheetsUrl="/api/studio/guide-card"
      imageUrl={(sheet, style, stamp) => {
        const q = new URLSearchParams({
          sheet: String(sheet),
          template: style.template,
          backdrop: style.backdrop,
          font: style.font,
          t: String(stamp),
        });
        if (style.backdropUrl) q.set("backdropUrl", style.backdropUrl);
        return `/api/studio/guide-card?${q.toString()}`;
      }}
      onSave={async (style) => {
        const r = await saveMyGuideStyle(style);
        // 저장과 동시에 다시 굽는다 — 새 그림을 보려면 목록을 새로 읽어야 한다
        if (r.ok) setTimeout(() => window.location.reload(), 600);
        return r;
      }}
      onUpload={uploadMyGuideBackdrop}
      saveLabel="이 양식으로 다시 만들기"
      savedText="이 양식으로 다시 만들었어요. 잠시 뒤 새로고침됩니다."
      emptyText="아직 사매 양식 안내가 없어요. 촬영 정보를 운영팀에 보내주시면 만들어드려요."
    />
  );
}
