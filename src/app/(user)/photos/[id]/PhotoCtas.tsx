"use client";

// 사진 상세의 2트랙 CTA — [작가 상담하기] / [촬영 예약하기].
//
// 대부분은 바로 예약하기 전에 물어볼 게 있다. 그래서 상담을 위에 두고, 주 전환인 예약에
// brand 색을 준다(순서는 상담이 먼저, 시선 무게는 예약이 위).
//
// 비로그인 상태에서 상담을 누르면 로그인 페이지로 보내지 않고 다이얼로그를 띄운다.
// 사진과 작가를 보던 맥락이 화면에서 사라지면, 로그인 화면 앞에서 "내가 뭘 하려던 거지" 가 되고
// 그 지점에서 이탈한다. 예약 트랙은 폼을 끝까지 채운 뒤 마지막에 로그인을 받는다(InquiryChat).

import { useState } from "react";
import { Button } from "@/components/ui";
import { TrustLink } from "@/components/user/TrustLink";
import { LoginGateDialog } from "@/components/user/LoginGateDialog";

export function PhotoCtas({
  photographerId,
  photoId,
  isLoggedIn,
}: {
  photographerId: string;
  photoId: string;
  isLoggedIn: boolean;
}) {
  const [gateOpen, setGateOpen] = useState(false);
  const consultHref = ctaHref("/chat/start", photographerId, photoId);

  return (
    <div className="mt-4 flex flex-col gap-2">
      {isLoggedIn ? (
        <Button
          href={consultHref}
          variant="secondary"
          size="lg"
          fullWidth
          style={{ borderRadius: "16px" }}
          data-track="cta:consult"
        >
          작가 상담하기
        </Button>
      ) : (
        <Button
          variant="secondary"
          size="lg"
          fullWidth
          style={{ borderRadius: "16px" }}
          data-track="cta:consult"
          onClick={() => setGateOpen(true)}
        >
          작가 상담하기
        </Button>
      )}

      <Button
        href={ctaHref("/inquiry", photographerId, photoId)}
        variant="brand"
        size="lg"
        fullWidth
        style={{ borderRadius: "16px" }}
        data-track="cta:inquiry"
        data-quote-lead=""
      >
        촬영 예약하기
      </Button>

      {/* 문의·예약을 누르기 직전 — "이거 믿어도 되나"가 드는 자리다.
          CTA 자체는 그대로 두고, 답으로 가는 문만 아래에 한 줄 둔다. */}
      <TrustLink from="photo_cta" className="mt-1 self-center" />

      {gateOpen && (
        <LoginGateDialog
          title="로그인하고 상담 시작하기"
          next={consultHref}
          context="photo_detail_consult"
          onClose={() => setGateOpen(false)}
        />
      )}
    </div>
  );
}

function ctaHref(path: string, photographerId: string, photoId: string) {
  const params = new URLSearchParams({ photographerId, photoId });
  return `${path}?${params.toString()}`;
}
