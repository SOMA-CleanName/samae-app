import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { SITE_URL } from "@/lib/site";
import { sendSms } from "@/lib/sms";
import { alimtalkAvailable, sendAlimtalk } from "@/lib/alimtalk";
import {
  NOTIFY_TEMPLATES,
  renderNotifyBody,
  toSolapiVariables,
  type NotifyKind,
  type NotifyVariables,
} from "@/lib/notify-templates";

// 서비스 밖으로 나가는 알림의 단일 통로.
//
// 채널 선택은 호출부가 하지 않는다 — kind 만 주면 여기서 정한다:
//   1순위 카카오 알림톡 (템플릿 ID·채널이 등록돼 있는 kind)
//   2순위 문자 (알림톡 미설정이거나 솔라피가 요청 자체를 거부한 경우)
// 알림톡이 카카오 단계에서 실패하는 경우(미가입·차단)는 솔라피가 같은 본문을 문자로
// 대체 발송하므로 우리가 개입하지 않는다. 여기서 문자로 내려가는 건 "요청이 안 먹힌" 경우다.
//
// notification_queue 는 큐이자 감사 로그다. 보내기 전에 pending 으로 한 줄 남기고
// 결과로 갱신한다 — 중간에 죽어도 "보내려 했다" 는 사실은 남는다.
//
// 실패가 본 흐름(채팅·예약·정산)을 막으면 안 된다. 모든 예외는 여기서 삼키고 로그만 남긴다.

export type DispatchResult = "sent" | "skipped" | "failed";

/** 알림 링크 — 사용자 손에 남는 주소다. 운영에서는 무조건 정식 도메인. */
export function notifyLink(path: string): string {
  // NEXT_PUBLIC_SITE_URL 은 로컬에서 localhost 라 운영에 쓰면 죽은 링크가 나간다.
  // (구 폴백이 samae.co.kr 이었는데 우리 도메인은 samae.ai 다 — 링크가 통째로 헛나갔다)
  const base =
    process.env.NODE_ENV === "production"
      ? SITE_URL
      : process.env.NEXT_PUBLIC_SITE_URL || SITE_URL;
  return `${base.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
}

/** dev 에서는 NOTIFY_SMS_DEV=on 일 때만 실발송 (그 외엔 큐에 skipped 로 기록) */
function sendingAllowed(): boolean {
  return process.env.NODE_ENV === "production" || process.env.NOTIFY_SMS_DEV === "on";
}

export type DispatchParams = {
  kind: NotifyKind;
  /** 수신자 프로필 — 전화번호는 여기서 읽는다 */
  profileId: string | null | undefined;
  variables: NotifyVariables;
  /** 중복 억제 키. 같은 사건은 같은 키를 써야 한다 (예: `booking_accepted:<bookingId>`) */
  dedupeKey: string;
  /**
   * 이 시간 안에 같은 키로 보낸 적 있으면 스킵.
   * 생략하면 **영구 1회** — 예약·정산처럼 한 사건에 한 번만 알리는 알림이 기본이다.
   */
  cooldownMs?: number;
};

export async function dispatchNotify(params: DispatchParams): Promise<DispatchResult> {
  try {
    if (!params.profileId) return "skipped";
    const admin = createAdminClient();

    // 중복 억제 — 이미 나간 이력이 있으면 조용히 스킵
    let dupQuery = admin
      .from("notification_queue")
      .select("id")
      .eq("dedupe_key", params.dedupeKey)
      .eq("status", "sent");
    if (params.cooldownMs !== undefined) {
      dupQuery = dupQuery.gte(
        "created_at",
        new Date(Date.now() - params.cooldownMs).toISOString()
      );
    }
    const { data: recent } = await dupQuery.limit(1).maybeSingle();
    if (recent) return "skipped";

    // 본문 — 알림톡은 카카오가 템플릿으로 그리지만, 문자 대체와 감사 로그에는 이 본문이 쓰인다.
    // 변수가 비면 던진다 (`#{}` 가 그대로 나가는 사고를 막는다)
    const body = renderNotifyBody(params.kind, params.variables);

    const { data: profile } = await admin
      .from("profiles")
      .select("phone")
      .eq("id", params.profileId)
      .maybeSingle();

    const useAlimtalk = alimtalkAvailable(params.kind);

    const { data: queued } = await admin
      .from("notification_queue")
      .insert({
        kind: params.kind,
        profile_id: params.profileId,
        phone: profile?.phone ?? null,
        body,
        dedupe_key: params.dedupeKey,
        status: "pending",
        channel: useAlimtalk ? "alimtalk" : "sms",
        template_code: params.kind,
        variables: params.variables,
      })
      .select("id")
      .single();
    if (!queued) return "failed";

    const finish = async (
      status: DispatchResult | "pending",
      opts: { error?: string; channel?: "sms" | "alimtalk"; groupId?: string } = {}
    ) => {
      await admin
        .from("notification_queue")
        .update({
          status,
          error: opts.error ?? null,
          sent_at: status === "sent" ? new Date().toISOString() : null,
          ...(opts.channel ? { channel: opts.channel } : {}),
          ...(opts.groupId ? { provider_group_id: opts.groupId } : {}),
        })
        .eq("id", queued.id);
    };

    if (!profile?.phone) {
      await finish("skipped", { error: "no_phone" });
      return "skipped";
    }
    if (!sendingAllowed()) {
      await finish("skipped", { error: "dev" });
      return "skipped";
    }

    if (useAlimtalk) {
      const res = await sendAlimtalk({
        to: profile.phone,
        kind: params.kind,
        variables: toSolapiVariables(params.variables),
      });
      if (res.ok) {
        await finish("sent", { channel: "alimtalk", groupId: res.groupId });
        return "sent";
      }
      // 요청 자체가 거부됨(템플릿 미승인·pfId 오류 등) — 문자로 한 번 더.
      // 알림을 못 받는 것보다 문자로라도 가는 게 낫다. 채널은 실제 나간 쪽으로 기록한다.
      console.error(`[notify] 알림톡 실패 → 문자 대체 (${params.kind}): ${res.error}`);
      const sms = await sendSms(profile.phone, body);
      await finish(sms.ok ? "sent" : "failed", {
        channel: "sms",
        groupId: sms.groupId,
        error: sms.ok ? `alimtalk_fallback: ${res.error}` : sms.error,
      });
      return sms.ok ? "sent" : "failed";
    }

    const sms = await sendSms(profile.phone, body);
    await finish(sms.ok ? "sent" : "failed", {
      channel: "sms",
      groupId: sms.groupId,
      error: sms.error,
    });
    return sms.ok ? "sent" : "failed";
  } catch (err) {
    // 알림 실패가 거래를 막으면 안 된다 — 로그만
    console.error(
      `[notify] ${params.kind} 실패:`,
      err instanceof Error ? err.message : err
    );
    return "failed";
  }
}

/** 작가 프로필 id + 표시 이름 — 알림 호출부가 반복해서 필요로 한다 */
export async function photographerNotifyTarget(
  photographerId: string
): Promise<{ profileId: string; displayName: string } | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("photographers")
    .select("profile_id, display_name")
    .eq("id", photographerId)
    .maybeSingle();
  if (!data?.profile_id) return null;
  return { profileId: data.profile_id, displayName: data.display_name ?? "작가" };
}

export { NOTIFY_TEMPLATES };
