import "server-only";
import { solapiConfigured, solapiSend, solapiSender } from "@/lib/solapi";

// 문자 발송 어댑터 — 공급자 중립 인터페이스.
// 현재 구현: 솔라피(HTTP API 직접 호출, SDK 의존성 없음 — 인증·요청은 solapi.ts).
// 키가 없으면 dev 스텁: 실발송 없이 서버 콘솔에 본문을 남기고 성공을 돌려준다.
// 갈아탈 때는 이 파일의 구현만 교체하면 된다 (OTP·알림 등 호출부는 sendSms 만 안다).
// 거래 알림은 알림톡(alimtalk.ts)이 1순위고, 문자는 대체 채널이다 — notify-user.ts 참고.

export type SmsResult = { ok: boolean; error?: string; stub?: boolean; groupId?: string };

export function smsConfigured(): boolean {
  return solapiConfigured();
}

export async function sendSms(to: string, text: string): Promise<SmsResult> {
  const digits = to.replace(/\D/g, "");

  if (!smsConfigured()) {
    console.log(`[sms:stub] to=${digits} text=${JSON.stringify(text)}`);
    return { ok: true, stub: true };
  }

  const res = await solapiSend({ to: digits, from: solapiSender(), text }, "sms");
  return res.ok ? { ok: true, groupId: res.groupId } : { ok: false, error: res.error };
}
