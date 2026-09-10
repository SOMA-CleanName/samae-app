import "server-only";
import { createHmac, randomBytes } from "node:crypto";

// 솔라피 HTTP 클라이언트 — 문자(sms.ts)와 알림톡(alimtalk.ts)이 같은 엔드포인트·같은 인증을 쓴다.
// SDK 없이 fetch 직접 호출. 키가 없으면 각 호출부가 dev 스텁으로 동작한다.

const SOLAPI_SEND_ENDPOINT = "https://api.solapi.com/messages/v4/send";

export type SolapiResult =
  | { ok: true; groupId?: string }
  | { ok: false; status?: number; error: string };

export function solapiConfigured(): boolean {
  return !!(process.env.SOLAPI_API_KEY && process.env.SOLAPI_API_SECRET && process.env.SMS_SENDER);
}

/** 발신번호 — 숫자만 (솔라피는 하이픈 등 특수문자를 받지 않는다) */
export function solapiSender(): string {
  return (process.env.SMS_SENDER ?? "").replace(/\D/g, "");
}

// HMAC-SHA256 인증 — date+salt 를 secret 으로 서명
function authHeader(): string {
  const apiKey = process.env.SOLAPI_API_KEY!;
  const apiSecret = process.env.SOLAPI_API_SECRET!;
  const date = new Date().toISOString();
  const salt = randomBytes(16).toString("hex");
  const signature = createHmac("sha256", apiSecret).update(date + salt).digest("hex");
  return `HMAC-SHA256 apiKey=${apiKey}, date=${date}, salt=${salt}, signature=${signature}`;
}

/** 단건 발송. message 는 솔라피 메시지 객체(to·from·text 또는 kakaoOptions). */
export async function solapiSend(
  message: Record<string, unknown>,
  label: string
): Promise<SolapiResult> {
  try {
    const res = await fetch(SOLAPI_SEND_ENDPOINT, {
      method: "POST",
      headers: { Authorization: authHeader(), "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
    });
    const text = await res.text();
    if (!res.ok) {
      console.error(`[${label}] 발송 실패 ${res.status}: ${text.slice(0, 300)}`);
      return { ok: false, status: res.status, error: `발송 실패 (${res.status})` };
    }
    let groupId: string | undefined;
    try {
      groupId = (JSON.parse(text) as { groupId?: string }).groupId;
    } catch {
      /* 응답 본문이 JSON 이 아니어도 발송은 성공 */
    }
    return { ok: true, groupId };
  } catch (err) {
    console.error(`[${label}] 발송 오류:`, err instanceof Error ? err.message : err);
    return { ok: false, error: "발송 중 오류가 발생했어요." };
  }
}
