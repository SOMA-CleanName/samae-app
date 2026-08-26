// LLM 문의 챗봇 라우트 — 게이트 프리뷰(비로그인 데모)·레거시 봇 페이지용.
// 본 플로우는 채팅방 상주 봇(chat/bot-actions.ts)이며, LLM 턴 로직은
// lib/inquiry-bot-room.ts 의 runBotLlmTurn 을 공유한다.
//
// - LLM 호출은 서버에서만 (ANTHROPIC_API_KEY 노출 금지)
// - 안전: 대화 이력에 작가(photographer) 발화가 있으면 LLM 호출 없이 즉시 봇 정지
//   (extractOnly=조용한 추출 모드는 예외 — 슬롯만 계속 수집)

import { NextResponse } from "next/server";
import {
  hasPhotographerIntervened,
  shouldNotifyStarted,
  validateMessageLimits,
  type BotApiRequest,
  type BotChatMessage,
  type LlmSlots,
} from "@/lib/inquiry-bot-llm";
import { runBotLlmTurn } from "@/lib/inquiry-bot-room";
import { getCurrentUser } from "@/lib/auth";
import { fetchPhotographerScript } from "@/lib/photographer-scripts-db";
import { notifyPhotographer } from "@/lib/inquiry-bot-notify";

export const runtime = "nodejs";

// 레퍼런스 이미지 data URL 상한 — 클라이언트가 800px 로 축소해 보내므로 넉넉한 방어선
const MAX_IMAGE_DATAURL_CHARS = 2_500_000; // ≈ 1.8MB 원본
const MAX_VISION_IMAGES = 3; // vision 에 넘기는 최대 장수 — 초과분은 개수만 언급

export async function POST(req: Request) {
  let body: BotApiRequest;
  try {
    body = (await req.json()) as BotApiRequest;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  // 프로덕션 인증 필수 — 익명 LLM 호출(비용·남용) 차단. dev 는 통과 (드라이런·데모 편의).
  if (process.env.NODE_ENV === "production") {
    const me = await getCurrentUser();
    if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const photographerId = typeof body.photographerId === "string" ? body.photographerId : "";
  if (!photographerId) {
    return NextResponse.json({ error: "photographerId required" }, { status: 400 });
  }
  const messages: BotChatMessage[] = Array.isArray(body.messages)
    ? body.messages.filter(
        (m): m is BotChatMessage =>
          !!m &&
          typeof m.text === "string" &&
          (m.role === "user" || m.role === "bot" || m.role === "photographer")
      )
    : [];
  // 환경 무관 상한 — 턴 수·발화 길이 초과는 자르지 않고 400 거부 (프롬프트 스터핑·폭주 차단)
  const limits = validateMessageLimits(messages);
  if (!limits.ok) {
    return NextResponse.json({ error: limits.reason }, { status: 400 });
  }
  const slots: LlmSlots = body.slots && typeof body.slots === "object" ? body.slots : {};
  // 레퍼런스 이미지들 — data URL 형식·크기 검증 후 최대 3장 (아니면 조용히 무시, 흐름 무영향)
  const imageDataUrls = (Array.isArray(body.images) ? body.images : [])
    .map((i) => i?.dataUrl)
    .filter(
      (u): u is string =>
        typeof u === "string" && u.startsWith("data:image/") && u.length <= MAX_IMAGE_DATAURL_CHARS
    )
    .slice(0, MAX_VISION_IMAGES);
  const totalImages =
    typeof body.totalImages === "number" && body.totalImages > 0
      ? Math.floor(body.totalImages)
      : imageDataUrls.length;

  // ── 작가 개입 = 봇 정지. LLM 호출 자체를 하지 않는다 ──
  // 예외: extractOnly(조용한 추출) — 작가가 대화 중이어도 사용자의 답변에서 슬롯만 계속
  // 뽑아 '문의 내용 정리'가 끝까지 완성되게 한다 (봇 발화는 클라이언트가 게시하지 않음).
  const extractOnly = body.extractOnly === true;
  if (hasPhotographerIntervened(messages) && !extractOnly) {
    return NextResponse.json({ handedOff: true });
  }

  const script = await fetchPhotographerScript(photographerId);

  try {
    const clean = await runBotLlmTurn({
      photographerName: body.photographerName?.trim() || "작가",
      script,
      messages,
      slots,
      photoContext: body.photoContext ?? null,
      imageDataUrls,
      totalImages,
    });

    // 작가 알림 — "새 손님이 챗봇 문의 진행 중/완료" 를 알려 채팅 이어받기를 유도.
    const notifyStarted =
      !extractOnly && shouldNotifyStarted(messages, body.startedNotified === true);
    if (clean.done || notifyStarted) {
      const s = clean.slots;
      await notifyPhotographer({
        event: clean.done ? "bot_inquiry_completed" : "bot_inquiry_started",
        photographerId,
        photographerName: body.photographerName,
        photoId: body.photoId,
        summary: clean.done
          ? [
              s.purpose && `목적=${s.purpose}`,
              s.preferredDate && `희망일=${s.preferredDate}`,
              s.region && `지역=${s.region}`,
              s.partySize && `인원=${s.partySize}`,
              s.custom && Object.keys(s.custom).length > 0 && `커스텀 ${Object.keys(s.custom).length}건`,
            ]
              .filter(Boolean)
              .join(", ")
          : undefined,
      });
    }
    return NextResponse.json({ ...clean, handedOff: false });
  } catch (e) {
    // 클라이언트는 이 실패(재시도 포함 2회 연속)를 받으면 기존 버튼 상태 머신으로 폴백한다
    console.error("[inquiry-bot] LLM call failed:", e);
    return NextResponse.json({ error: "llm_unavailable" }, { status: 502 });
  }
}
