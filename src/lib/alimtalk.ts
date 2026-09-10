import "server-only";
import { solapiConfigured, solapiSend, solapiSender } from "@/lib/solapi";
import { alimtalkTemplateId, type NotifyKind } from "@/lib/notify-templates";

// 카카오 알림톡 발송 어댑터 — 솔라피 경유 (문자와 같은 계정·같은 엔드포인트).
//
// 전제 (솔라피 콘솔, docs/34-kakao-alimtalk.md):
//   1. 카카오 비즈니스 채널을 솔라피에 연동 → pfId  (env SOLAPI_KAKAO_PF_ID)
//   2. kind 별 템플릿을 등록·심사 통과 → templateId (env ALIMTALK_TPL_<KIND>)
// 둘 중 하나라도 없으면 그 kind 는 알림톡 불가 → 호출부(notify-user.ts)가 문자로 내려보낸다.
//
// 알림톡은 심사된 템플릿 본문 그대로만 나간다. 우리가 보내는 건 치환 변수뿐이고,
// 본문 렌더링은 카카오 쪽에서 한다. (notify-templates.ts 의 본문은 심사 원문 + 문자 대체용)
//
// disableSms 는 켜지 않는다 — 카카오 측 실패(알림톡 미수신 번호·채널 차단)는 솔라피가
// 같은 본문을 문자로 대체 발송한다. 솔라피 요청 자체가 실패(템플릿 미승인·잘못된 pfId 등)한
// 경우만 우리 쪽에서 sendSms 로 한 번 더 시도한다.

export type AlimtalkResult =
  | { ok: true; stub?: boolean; groupId?: string }
  | { ok: false; error: string; status?: number };

export function alimtalkPfId(): string | undefined {
  return process.env.SOLAPI_KAKAO_PF_ID || undefined;
}

/** 이 kind 를 알림톡으로 보낼 수 있는가 — 계정 키 + 채널 + 템플릿 ID 가 다 있어야 한다 */
export function alimtalkAvailable(kind: NotifyKind): boolean {
  return solapiConfigured() && !!alimtalkPfId() && !!alimtalkTemplateId(kind);
}

export async function sendAlimtalk(params: {
  to: string;
  kind: NotifyKind;
  /** `#{변수}` → 값. 키·값 모두 문자열이어야 한다 (솔라피 규격) */
  variables: Record<string, string>;
}): Promise<AlimtalkResult> {
  const digits = params.to.replace(/\D/g, "");
  const templateId = alimtalkTemplateId(params.kind);
  const pfId = alimtalkPfId();

  if (!solapiConfigured() || !pfId || !templateId) {
    // 호출부가 alimtalkAvailable 로 걸렀어야 한다 — 그래도 조용히 스텁
    console.log(`[alimtalk:stub] to=${digits} kind=${params.kind} vars=${JSON.stringify(params.variables)}`);
    return { ok: true, stub: true };
  }

  const res = await solapiSend(
    {
      to: digits,
      from: solapiSender(),
      type: "ATA",
      kakaoOptions: {
        pfId,
        templateId,
        variables: params.variables,
        disableSms: false,
      },
    },
    `alimtalk:${params.kind}`
  );
  return res.ok
    ? { ok: true, groupId: res.groupId }
    : { ok: false, error: res.error, status: res.status };
}
