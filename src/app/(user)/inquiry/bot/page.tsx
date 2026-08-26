import { notFound, redirect } from "next/navigation";
import { fetchPhotoById, fetchPhotographerById } from "@/lib/discovery";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { InquiryBotChat } from "./InquiryBotChat";

export const dynamic = "force-dynamic";

// 로그인 게이트 — 선 리다이렉트가 아니라 **인챗 CTA** 방식:
// 비로그인이어도 채팅방(헤더·사진·봇 인사·첫 질문)에는 진입시켜 방의 가치를 먼저 보여주고,
// 입력바 자리의 카카오 CTA 로 로그인을 유도한다 (/login?next= 복귀 동선, gate 파라미터 보존).
// INQUIRY_BOT_LOGIN_GATE 로 강제: "on"=항상, "off"=끔. 미설정이면 프로덕션만 on
// (dev 는 기본 off — 데모·개발 편의, 서버 재시작 없이 동작 유지).
const LOGIN_GATE_ON =
  process.env.INQUIRY_BOT_LOGIN_GATE === "on" ||
  (process.env.INQUIRY_BOT_LOGIN_GATE !== "off" && process.env.NODE_ENV === "production");

// 채팅룸형 문의 (C1) — 기존 /inquiry 위저드와 병행 배포되는 챗봇 경로.
// 진입 쿼리는 위저드와 동일(photographerId, photoId) — 사진 상세의 문의 버튼을
// 플래그로 이 경로로 돌려 퍼널을 비교한다 (위저드 제거는 C3에서).
export default async function InquiryBotPage({
  searchParams,
}: {
  searchParams?: Promise<{ photographerId?: string; photoId?: string; gate?: string }>;
}) {
  const sp = (await searchParams) ?? {};
  const photographerId = sp.photographerId ?? "";
  const photoId = sp.photoId ?? "";
  // dev 편의 토글 — ?gate=1 이면 dev 에서도 게이트 강제 (env 재시작 없이 테스트).
  // 프로덕션 로직 무영향: NODE_ENV 프로덕션에서는 이 토글을 무시하고 env 플래그만 따른다.
  const gateForced = process.env.NODE_ENV !== "production" && sp.gate === "1";
  if (!photographerId) notFound();

  const [me, photographer] = await Promise.all([
    getCurrentUser(),
    fetchPhotographerById(photographerId),
  ]);
  if (!photographer) notFound();
  if (me?.photographer?.id === photographerId) redirect("/studio");

  // 비로그인 + 게이트 활성 → 리다이렉트하지 않고 로그인 CTA URL 을 내려보낸다.
  // 클라이언트는 입력바 자리에 카카오 CTA 를 렌더 (진입 시점의 대화 상태는 localStorage 키가
  // photoId/photographerId 기반이라 로그인 전후 동일 — 복귀 후 그대로 이어진다).
  const selfUrl = `/inquiry/bot?photographerId=${photographerId}${photoId ? `&photoId=${photoId}` : ""}${gateForced ? "&gate=1" : ""}`;
  let loginGateUrl: string | null = null;
  if ((LOGIN_GATE_ON || gateForced) && !me) {
    // gate=1 을 next 에도 유지 — 로그인 후 복귀했을 때 같은 조건으로 재검증(이미 로그인이라 통과)
    loginGateUrl = `/login?next=${encodeURIComponent(selfUrl)}`;
  }

  // 등록 연락처 — 게이트 환경에선 봇이 연락처를 묻지 않는 대신 프로필 번호로 알림을 보낸다
  let userPhone: string | null = null;
  if (me) {
    const supabase = await createClient();
    const { data: profile } = await supabase
      .from("profiles")
      .select("phone")
      .eq("id", me.id)
      .maybeSingle();
    userPhone = profile?.phone ?? null;
  }

  // 로그인했는데 번호가 없는 계정(연락처 수집 도입 전 가입자 포함) → 가입 마무리(OTP) 경유.
  // 로그인 콜백만으론 못 잡는다 — 이미 로그인된 채로 진입하면 콜백을 안 거치기 때문.
  // 이게 없으면 봇이 구식 연락처 질문으로 폴백해 "번호를 두 번 묻는" 흐름이 된다.
  if ((LOGIN_GATE_ON || gateForced) && me && !userPhone) {
    redirect(`/signup/contact?next=${encodeURIComponent(selfUrl)}`);
  }

  const photo = photoId ? await fetchPhotoById(photoId) : null;
  const photoSrc = photo ? photo.thumb_url ?? photo.src_url : null;

  return (
    // E2: 루트 레이아웃의 main 과 중첩(landmark 중복)되지 않게 div 사용
    <div className="bg-bg">
      <InquiryBotChat
        // 작가·사진이 바뀌면 컴포넌트를 통째로 리마운트 — 같은 라우트에서 쿼리만 바뀔 때
        // React 가 인스턴스를 재사용해 이전 대화 타임라인이 이어지던 버그 방지
        key={`${photographerId}:${photoId || "direct"}`}
        photographerId={photographerId}
        photographerName={photographer.display_name}
        photographerAvatar={photographer.avatar_url}
        photoId={photoId}
        photoSrc={photoSrc}
        // LLM 봇 사진 컨텍스트 — 시스템 프롬프트에 무드·가격 주입
        photoMoodTags={photo?.mood_tags ?? []}
        photoPriceKrw={photo?.price_krw ?? null}
        userPhone={userPhone}
        loginGateUrl={loginGateUrl}
      />
    </div>
  );
}
