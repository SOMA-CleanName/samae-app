import "server-only";

import { createHash } from "crypto";
import { cookies, headers } from "next/headers";

// Meta 전환 API(서버측 Lead 전송) — 브라우저 픽셀이 놓친 전환(iOS/광고차단)을 서버가 보완.
// 클라이언트 픽셀과 같은 event_id 로 보내 Meta 가 자동 중복 제거(이중 집계 방지).
// FB_CAPI_TOKEN(서버 비밀)이 없으면 아무 동작도 안 함 → 토큰 등록 전엔 안전.

const PIXEL_ID = process.env.NEXT_PUBLIC_FB_PIXEL_ID;
const TOKEN = process.env.FB_CAPI_TOKEN;
const GRAPH_VERSION = "v21.0";

function sha256(v: string): string {
  return createHash("sha256").update(v).digest("hex");
}
function hashEmail(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const t = raw.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t) ? sha256(t) : null;
}
// 한국 번호 → E.164(82...) 후 해시
function hashPhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const d = raw.replace(/\D/g, "");
  if (d.length < 9) return null;
  const e164 = d.startsWith("0") ? "82" + d.slice(1) : d.startsWith("82") ? d : "82" + d;
  return sha256(e164);
}

export async function sendCapiLead(opts: {
  inquiryId: string;
  phone?: string | null;
  email?: string | null;
}): Promise<void> {
  if (!PIXEL_ID || !TOKEN) return; // 토큰 미설정 시 비활성(안전)
  try {
    const c = await cookies();
    const h = await headers();
    const fbp = c.get("_fbp")?.value;
    const fbc = c.get("_fbc")?.value;
    const ua = h.get("user-agent") ?? undefined;
    const ip = (h.get("x-forwarded-for")?.split(",")[0].trim() || h.get("x-real-ip")) ?? undefined;
    const referer = h.get("referer") ?? undefined;

    const userData: Record<string, unknown> = {};
    const em = hashEmail(opts.email);
    const ph = hashPhone(opts.phone);
    if (em) userData.em = [em];
    if (ph) userData.ph = [ph];
    if (fbp) userData.fbp = fbp;
    if (fbc) userData.fbc = fbc;
    if (ip) userData.client_ip_address = ip;
    if (ua) userData.client_user_agent = ua;

    const body = {
      data: [
        {
          event_name: "Lead",
          event_time: Math.floor(Date.now() / 1000),
          event_id: `inquiry_${opts.inquiryId}`, // 클라 픽셀과 동일 → 중복 제거
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
    /* CAPI 실패가 문의 접수를 막지 않게 무시 */
  }
}
