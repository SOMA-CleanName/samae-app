import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchPhotoById, fetchPhotographerById } from "@/lib/discovery";
import { ensureBotConversation } from "@/app/(user)/inquiry/actions";
import { seedBotRoomMessages } from "@/lib/inquiry-bot-room";
import { resolveGreeting } from "@/lib/bot-kb-db";

export const dynamic = "force-dynamic";

// 작가 상담하기 — 사진 상세의 [작가 상담하기] 가 여기로 들어온다.
//
// "촬영 예약하기"(/inquiry, 숨고형 폼)와 갈라지는 지점이다. 이쪽은 폼을 거치지 않고
// 곧장 작가 채팅방으로 들여보낸다. 사용자 인식은 **작가의 채팅방에 들어온 것**이고,
// 작가가 자리를 비운 동안은 안내봇이 대신 답한다(작가 KB 기반, 모르면 작가에게 넘김).
//
// 이 라우트는 화면이 없다 — 방을 확보하고 시드한 뒤 곧바로 리다이렉트한다.
export default async function ChatStartPage({
  searchParams,
}: {
  searchParams?: Promise<{ photographerId?: string; photoId?: string }>;
}) {
  const sp = (await searchParams) ?? {};
  const photographerId = sp.photographerId ?? "";
  const photoId = sp.photoId ?? "";
  if (!photographerId) notFound();

  const selfUrl = `/chat/start?photographerId=${encodeURIComponent(photographerId)}${
    photoId ? `&photoId=${encodeURIComponent(photoId)}` : ""
  }`;

  const me = await getCurrentUser();
  if (!me) redirect(`/login?next=${encodeURIComponent(selfUrl)}`);

  const photographer = await fetchPhotographerById(photographerId);
  if (!photographer) notFound();
  if (me.photographer?.id === photographerId) redirect("/studio"); // 본인 방 방지

  // 번호 없는 계정(연락처 수집 도입 전 가입자 포함) → 가입 마무리(OTP) 경유.
  // 예약 제안·접수가 번호를 전제로 하므로 상담 진입에서도 같은 게이트를 건다.
  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("phone")
    .eq("id", me.id)
    .maybeSingle();
  if (!profile?.phone) redirect(`/signup/contact?next=${encodeURIComponent(selfUrl)}`);

  const convId = await ensureBotConversation(photographerId, photoId || null);
  if (!convId) notFound();

  const photo = photoId ? await fetchPhotoById(photoId) : null;
  const admin = createAdminClient();
  const { data: phRow } = await admin
    .from("photographers")
    .select("profile_id")
    .eq("id", photographerId)
    .single();

  if (phRow?.profile_id) {
    // 시드는 멱등하다 (방에 메시지가 하나라도 있으면 건너뛴다) — 재진입해도 인사가 겹치지 않는다.
    await seedBotRoomMessages({
      conversationId: convId,
      customerId: me.id,
      photographerProfileId: phRow.profile_id as string,
      photographerName: photographer.display_name,
      photo: { thumbUrl: photo ? photo.thumb_url ?? photo.src_url : null },
      // 채팅방 봇은 묻지 않는다 — 첫 질문을 시드하지 않고 인사만 건다.
      firstQuestion: "",
      qaMode: true,
      greeting: await resolveGreeting(photographerId, photographer.display_name),
    });
  }

  redirect(`/chat/${convId}`);
}
