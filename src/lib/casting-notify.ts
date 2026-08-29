import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { CASTING_BUCKET } from "@/lib/casting";

/**
 * 캐스팅 결과 통지 · 개인정보 파기.
 *
 * 이 파일의 핵심은 **탈락 통지**다. 캐스팅 퍼널의 KPI는 모델 확보가 아니라 유저 획득이고,
 * 선정은 소수, 탈락이 다수다. 즉 이 함수가 퍼널의 실제 수익 지점이다.
 * 탈락 메시지를 사과문으로 쓰면 안 된다 — 재방문 명분과 전환 링크를 넣는다.
 */

const PURGE_AFTER_DAYS = 30;

type NotifyResult = { selected: number; rejected: number; skipped: number };

/**
 * 회차 결과 일괄 통지.
 *
 * 개별이 아니라 **회차 단위로 한 번에** 보낸다. 개별 발송은 "쟤는 먼저 받았는데 나는?"
 * 같은 형평성 논란을 만든다. 이미 통지한 건(notified_at)은 건너뛰므로 두 번 눌러도 안전하다.
 */
export async function notifyCastingRoundResults(roundId: string): Promise<NotifyResult> {
  const admin = createAdminClient();

  const { data: round } = await admin
    .from("casting_rounds")
    .select("id, title")
    .eq("id", roundId)
    .maybeSingle();
  if (!round) throw new Error("회차를 찾을 수 없어요.");

  const { data: apps } = await admin
    .from("casting_applications")
    .select("id, profile_id, status, preferred_photo_ids, notify_next_round")
    .eq("round_id", roundId)
    .in("status", ["selected", "rejected"])
    .is("notified_at", null);

  const rows = apps ?? [];
  if (rows.length === 0) return { selected: 0, rejected: 0, skipped: 0 };

  // 탈락 통지에 되돌려 보여줄 사진 — 본인이 좋다고 표시한 그 이미지가 가장 강한 전환 소재다.
  const photoIds = [...new Set(rows.flatMap((a) => (a.preferred_photo_ids as string[]) ?? []))];
  const photographerByPhoto = new Map<string, string>();
  if (photoIds.length > 0) {
    const { data: photos } = await admin
      .from("photos")
      .select("id, photographer:photographers!photos_photographer_id_fkey(display_name)")
      .in("id", photoIds);
    for (const p of photos ?? []) {
      const ph = (Array.isArray(p.photographer) ? p.photographer[0] : p.photographer) as
        | { display_name: string | null }
        | null;
      photographerByPhoto.set(p.id as string, ph?.display_name ?? "작가");
    }
  }

  const now = new Date().toISOString();
  const notifications: Record<string, unknown>[] = [];
  const waitlist: Record<string, unknown>[] = [];
  let selected = 0;
  let rejected = 0;

  for (const a of rows) {
    const isSelected = a.status === "selected";
    const picks = ((a.preferred_photo_ids as string[]) ?? []).map(
      (id) => photographerByPhoto.get(id) ?? "작가",
    );

    if (isSelected) {
      selected += 1;
      notifications.push({
        recipient_id: a.profile_id,
        type: "system",
        title: `🎉 ${round.title} 모델로 선정되셨어요!`,
        body:
          "축하드려요! 곧 촬영 일정과 장소를 안내드릴게요.\n" +
          "촬영 원본과 보정본은 전부 드리고, 사용에 제한은 없어요.",
        link: "/casting/my",
      });
    } else {
      rejected += 1;
      // 사과가 아니라 다음 행동을 준다 — 대기 등록 사실 + 고른 사진으로 되돌아갈 링크
      const lines = [
        "아쉽게도 이번 회차에는 함께하지 못하게 되었어요.",
        "",
        "· 다음 회차 대기 명단에 올려두었어요. 열리면 가장 먼저 알려드릴게요.",
      ];
      if (picks.length > 0) {
        lines.push(`· 신청 때 고르셨던 ${[...new Set(picks)].join(" · ")} 작가님 사진, 다시 보러 가실래요?`);
      }
      notifications.push({
        recipient_id: a.profile_id,
        type: "system",
        title: `${round.title} 결과를 알려드려요`,
        body: lines.join("\n"),
        link: "/casting/my",
      });

      if (a.notify_next_round) {
        waitlist.push({ profile_id: a.profile_id, source: "rejected" });
      }
    }
  }

  if (notifications.length > 0) {
    const { error } = await admin.from("notifications").insert(notifications);
    if (error) throw new Error(error.message);
  }
  if (waitlist.length > 0) {
    // 이미 대기 중이면 그대로 둔다 — 등록 시점을 뒤로 밀 이유가 없다.
    await admin.from("casting_waitlist").upsert(waitlist, { onConflict: "profile_id", ignoreDuplicates: true });
  }

  const { error: markErr } = await admin
    .from("casting_applications")
    .update({ notified_at: now })
    .in(
      "id",
      rows.map((a) => a.id as string),
    );
  if (markErr) throw new Error(markErr.message);

  return { selected, rejected, skipped: 0 };
}

/**
 * 미선정자의 사진·보호자 동의서 파기.
 *
 * 기획서 별첨 A와 /casting/consent 에 "종료 후 파기"라고 약속했다.
 * 약속을 사람이 기억해서 지키는 구조로 두면 안 지켜진다 — 배치로 돌린다.
 *
 * 선정자는 촬영·게시가 남아 있어 제외한다.
 * Storage 파일을 먼저 지우고 DB 경로를 비운다 — 순서가 반대면 경로를 잃어 파일이 영영 남는다.
 */
export async function purgeCastingPersonalData(
  afterDays = PURGE_AFTER_DAYS,
): Promise<{ purged: number; files: number }> {
  const admin = createAdminClient();
  const cutoff = new Date(Date.now() - afterDays * 86_400_000).toISOString();

  const { data: due } = await admin
    .from("casting_applications")
    .select("id, photo_paths, guardian_consent_path")
    .eq("status", "rejected")
    .not("notified_at", "is", null)
    .lt("notified_at", cutoff)
    .is("purged_at", null);

  const rows = due ?? [];
  if (rows.length === 0) return { purged: 0, files: 0 };

  const paths = rows.flatMap((a) => [
    ...(((a.photo_paths as string[]) ?? [])),
    ...(a.guardian_consent_path ? [a.guardian_consent_path as string] : []),
  ]);

  if (paths.length > 0) {
    const { error } = await admin.storage.from(CASTING_BUCKET).remove(paths);
    // 파일 삭제가 실패하면 DB 경로를 비우지 않는다 — 비우면 다음 배치가 찾지 못해 영영 남는다.
    if (error) throw new Error(`파일 삭제 실패: ${error.message}`);
  }

  const { error: updErr } = await admin
    .from("casting_applications")
    .update({ photo_paths: [], guardian_consent_path: null, purged_at: new Date().toISOString() })
    .in(
      "id",
      rows.map((a) => a.id as string),
    );
  if (updErr) throw new Error(updErr.message);

  return { purged: rows.length, files: paths.length };
}
