// 홈 피드 페르소나 재정렬 — 하이브리드 피드의 두 번째 축.
//
// 무드 카테고리 티어링(어떤 사진이 보일지)은 기존 로직 그대로 두고,
// **페이지 안의 순서**만 사용자 피드 벡터와의 코사인 거리순으로 바꾼다.
// 카테고리는 "같은 무드로 분류됨"이고, 이 재정렬이 "시각적으로 닮음"을 더한다.
//
// 페이지 단위(48장)로만 정렬하는 이유: 티어 RPC(docs/22 민감 영역)를 건드리지 않고,
// 무한스크롤의 페이지 경계와도 자연히 맞는다. 거리 계산은 이미 정해진 48개 id 에
// 대해서만 하므로 인덱스 없이 ~ms(0080 주석 참고).
//
// 실패는 전부 무해화 — 쿠키 없음·벡터 없음·RPC 오류 모두 원래 순서 그대로.
import "server-only";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { PERSONA_RESULT_COOKIE } from "@/lib/persona/store";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** id 를 가진 아무 사진 배열이나 받는다 (GalleryPhoto 등) */
export async function rerankByPersonaVector<T extends { id: string }>(photos: T[]): Promise<T[]> {
  if (photos.length < 2) return photos;

  let resultId: string | undefined;
  try {
    resultId = (await cookies()).get(PERSONA_RESULT_COOKIE)?.value;
  } catch {
    return photos; // 요청 스코프 밖 — 재정렬 없음
  }
  if (!resultId || !UUID_RE.test(resultId)) return photos;

  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("persona_photo_distances", {
      p_result_id: resultId,
      p_photo_ids: photos.map((p) => p.id),
    });
    if (error || !data || (data as unknown[]).length === 0) return photos;

    const dist = new Map((data as Array<{ id: string; distance: number }>).map((r) => [r.id, r.distance]));
    // 안정 정렬 — 거리 없는 사진(임베딩 미보유)은 원래 상대 순서를 유지한 채 뒤로
    return [...photos].sort(
      (a, b) => (dist.get(a.id) ?? Number.POSITIVE_INFINITY) - (dist.get(b.id) ?? Number.POSITIVE_INFINITY)
    );
  } catch {
    return photos;
  }
}
