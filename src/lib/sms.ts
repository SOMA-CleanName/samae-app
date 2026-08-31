import "server-only";
import { createHmac, randomBytes } from "node:crypto";

// 문자 발송 어댑터 — 공급자 중립 인터페이스.
// 현재 구현: 솔라피(HTTP API 직접 호출, SDK 의존성 없음).
// 키가 없으면 dev 스텁: 실발송 없이 서버 콘솔에 본문을 남기고 성공을 돌려준다.
// 갈아탈 때는 이 파일의 구현만 교체하면 된다 (OTP·알림 등 호출부는 sendSms 만 안다).

export type SmsResult = { ok: boolean; error?: string; stub?: boolean };

const SOLAPI_ENDPOINT = "https://api.solapi.com/messages/v4/send";

export function smsConfigured(): boolean {
  return !!(process.env.SOLAPI_API_KEY && process.env.SOLAPI_API_SECRET && process.env.SMS_SENDER);
}

export async function sendSms(to: string, text: string): Promise<SmsResult> {
  const digits = to.replace(/\D/g, "");

  if (!smsConfigured()) {
    console.log(`[sms:stub] to=${digits} text=${JSON.stringify(text)}`);
    return { ok: true, stub: true };
  }

  const apiKey = process.env.SOLAPI_API_KEY!;
  const apiSecret = process.env.SOLAPI_API_SECRET!;
  const from = process.env.SMS_SENDER!.replace(/\D/g, "");

  // 솔라피 HMAC-SHA256 인증 — date+salt 를 secret 으로 서명
  const date = new Date().toISOString();
  const salt = randomBytes(16).toString("hex");
  const signature = createHmac("sha256", apiSecret).update(date + salt).digest("hex");

  try {
    const res = await fetch(SOLAPI_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `HMAC-SHA256 apiKey=${apiKey}, date=${date}, salt=${salt}, signature=${signature}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ message: { to: digits, from, text } }),
    });
    if (!res.ok) {
      const body = await res.text();
      console.error(`[sms] 발송 실패 ${res.status}: ${body.slice(0, 300)}`);
      return { ok: false, error: `발송 실패 (${res.status})` };
    }
    return { ok: true };
  } catch (err) {
    console.error("[sms] 발송 오류:", err instanceof Error ? err.message : err);
    return { ok: false, error: "발송 중 오류가 발생했어요." };
  }
}
