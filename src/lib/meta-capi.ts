import "server-only";

import { cookies, headers } from "next/headers";
import { createHash } from "node:crypto";

// Meta 전환 API(서버측 Lead 전송) — 브라우저 픽셀이 놓친 전환(iOS/광고차단)을 서버가 보완.
// 전환 시점은 '무료로 견적 받아보기' CTA 클릭 — 클라(meta-lead.ts)가 픽셀 발화 후
// 같은 eventID 를 /api/meta/quote-lead 로 보내오면 여기서 CAPI 로 재전송한다.
// 같은 event_name + event_id 라 Meta 가 자동 중복 제거(이중 집계 방지).
// FB_CAPI_TOKEN(서버 비밀)이 없으면 아무 동작도 안 함 → 토큰 등록 전엔 안전.

const PIXEL_ID = process.env.NEXT_PUBLIC_FB_PIXEL_ID;
const TOKEN = process.env.FB_CAPI_TOKEN;
const GRAPH_VERSION = "v21.0";

export type MetaAdCookies = { fbp: string | null; fbc: string | null };

// 픽셀이 심은 광고 식별자를 요청 쿠키에서 읽는다.
// CAPI 전송용이자, 문의 행에 스냅샷으로 남기는 값(0055). 픽셀 미로딩 시 둘 다 null.
export async function readMetaAdCookies(): Promise<MetaAdCookies> {
  const c = await cookies();
  return {
    fbp: c.get("_fbp")?.value ?? null,
    fbc: c.get("_fbc")?.value ?? null,
  };
}

// 서버측 전환 전송 공통부 — 브라우저 픽셀과 **같은 event_id** 로 보내 Meta 가 중복 제거한다.
// 연락처(em/ph)는 싣지 않는다 — fbp/fbc + IP/UA(+ external_id) 로 매칭한다.
// 해시한 이메일·전화를 보내면 매칭률이 오르지만, 그건 개인정보 처리방침에 Meta 제공을
// 적은 뒤에 할 일이다. 지금은 우리 쪽 불투명 식별자까지만 보낸다.
async function sendCapi(
  eventName: string,
  eventId: string,
  extraUserData: Record<string, unknown> = {}
): Promise<void> {
  if (!PIXEL_ID || !TOKEN) return; // 토큰 미설정 시 비활성(안전)
  try {
    const c = await cookies();
    const h = await headers();
    const fbp = c.get("_fbp")?.value;
    const fbc = c.get("_fbc")?.value;
    const ua = h.get("user-agent") ?? undefined;
    const ip = (h.get("x-forwarded-for")?.split(",")[0].trim() || h.get("x-real-ip")) ?? undefined;
    const referer = h.get("referer") ?? undefined;

    const userData: Record<string, unknown> = { ...extraUserData };
    if (fbp) userData.fbp = fbp;
    if (fbc) userData.fbc = fbc;
    if (ip) userData.client_ip_address = ip;
    if (ua) userData.client_user_agent = ua;

    const body = {
      data: [
        {
          event_name: eventName,
          event_time: Math.floor(Date.now() / 1000),
          event_id: eventId, // 클라 픽셀과 동일 → 중복 제거
          action_source: "website",
          ...(referer ? { event_source_url: referer } : {}),
          user_data: userData,
        },
      ],
    };

    await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/${PIXEL_ID}/events?access_token=${encodeURIComponent(TOKEN)}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }
    );
  } catch {
    /* CAPI 실패가 사용자 플로우를 막지 않게 무시 */
  }
}

// CTA 클릭 시점의 Lead
export async function sendCapiQuoteLead(eventId: string): Promise<void> {
  await sendCapi("Lead", eventId);
}

/**
 * 회원가입 완료 — /auth/callback 이 **새 계정**을 확인했을 때.
 *
 * external_id 는 우리 사용자 id 의 SHA-256. Meta 에게 개인정보가 아니라 불투명 식별자다.
 * 같은 사람이 나중에 다른 전환을 낼 때 이어 붙일 수 있어 매칭률이 오른다.
 */
export async function sendCapiCompleteRegistration(eventId: string, userId: string): Promise<void> {
  await sendCapi("CompleteRegistration", eventId, {
    external_id: createHash("sha256").update(userId).digest("hex"),
  });
}
