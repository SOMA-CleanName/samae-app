import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

// 06:00 공개 사진 목록(search_tag_snapshot, 0138)이 오늘도 만들어졌나 — 매일 크론(09:00)이 본다.
//
// 무드 태그 검색과 촬영 장소 카드는 이 목록이 **낡아도 계속 쓴다**(lib/discovery, 2026-10-06 결정).
// DB 를 직접 읽는 길로 돌아가면 요청마다 무거운 조회가 되기 때문이다. 대가로 맥미니가 멈추면
// 화면은 멀쩡해 보인 채 그 시점 사진으로 굳는다 — 내린 사진이 남고 새 사진이 안 뜬다.
// 실제로 그렇게 굳어 있던 걸 아무도 몰랐다(2026-10-06, 을지로가 DB 66장 · 목록 50장).
// 그래서 화면 대신 여기서 잡는다.

/** 06:00 에 만들고 09:00 에 보니 평소엔 3시간. 하루를 건너뛰었으면 넘는다. */
const STALE_AFTER_HOURS = 26;

export async function checkSearchSnapshotFreshness(): Promise<{ ok: boolean; [k: string]: unknown }> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("search_tag_snapshot")
    .select("built_at, photo_count")
    .eq("id", 1)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };

  const builtAt = data ? Date.parse(data.built_at as string) : NaN;
  const ageHours = Number.isFinite(builtAt) ? Math.round((Date.now() - builtAt) / 3_600_000) : null;
  const stale = ageHours === null || ageHours > STALE_AFTER_HOURS;

  if (stale) {
    await notifyStale(
      ageHours === null
        ? "⚠️ **공개 사진 목록(search_tag_snapshot)이 없습니다.** 무드 검색은 검색마다 DB 를 직접 읽고, 홈·매거진 장소 카드는 비어 있습니다. 맥미니 06:00 배치(build_search_tags.py, docs/28)를 확인하세요."
        : `⚠️ **공개 사진 목록이 ${ageHours}시간째 그대로입니다.** 무드 검색·장소 카드가 그 시점 사진으로 굳어 있습니다(내린 사진이 남고 새 사진이 안 뜸). 맥미니 06:00 배치(build_search_tags.py, docs/28)를 확인하세요.`
    );
  }
  return { ok: true, ageHours, stale, photoCount: data?.photo_count ?? null };
}

async function notifyStale(content: string): Promise<void> {
  const webhook = process.env.DISCORD_OPS_WEBHOOK_URL;
  if (!webhook) return; // 미설정이면 조용히 패스(로컬/미배포)
  try {
    await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
  } catch {
    // 알림 실패로 크론을 실패시키지 않는다 — 결과 JSON 의 stale 로 남는다
  }
}
