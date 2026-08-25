import { notFound, redirect } from "next/navigation";
import { fetchPhotoById, fetchPhotographerById } from "@/lib/discovery";
import { getCurrentUser } from "@/lib/auth";
import { InquiryBotChat } from "./InquiryBotChat";

export const dynamic = "force-dynamic";

// 로그인 게이트 — 새 플로우: 채팅 시작 = 가입/로그인 (작가 답장 SMS 재소환용 연락처 확보의 전제).
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
  searchParams?: Promise<{ photographerId?: string; photoId?: string }>;
}) {
  const sp = (await searchParams) ?? {};
  const photographerId = sp.photographerId ?? "";
  const photoId = sp.photoId ?? "";
  if (!photographerId) notFound();

  const [me, photographer] = await Promise.all([
    getCurrentUser(),
    fetchPhotographerById(photographerId),
  ]);
  if (!photographer) notFound();
  if (me?.photographer?.id === photographerId) redirect("/studio");

  // 비로그인 → 기존 카카오 로그인 플로우(/login?next=)로 — 로그인 후 이 채팅방으로 복귀.
  // 카카오 일반 앱은 전화번호를 주지 않으므로, 연락처는 챗봇의 연락처 스텝에서 1회 수집한다
  // (profiles.phone 컬럼 존재 확인 — 저장 배선은 C3 persistBotConversation 본구현에서).
  if (LOGIN_GATE_ON && !me) {
    const next = `/inquiry/bot?photographerId=${photographerId}${photoId ? `&photoId=${photoId}` : ""}`;
    redirect(`/login?next=${encodeURIComponent(next)}`);
  }

  const photo = photoId ? await fetchPhotoById(photoId) : null;
  const photoSrc = photo ? photo.thumb_url ?? photo.src_url : null;

  return (
    <main className="bg-bg">
      <InquiryBotChat
        photographerId={photographerId}
        photographerName={photographer.display_name}
        photographerAvatar={photographer.avatar_url}
        photoId={photoId}
        photoSrc={photoSrc}
        // LLM 봇 사진 컨텍스트 — 시스템 프롬프트에 무드·가격 주입
        photoMoodTags={photo?.mood_tags ?? []}
        photoPriceKrw={photo?.price_krw ?? null}
      />
    </main>
  );
}
