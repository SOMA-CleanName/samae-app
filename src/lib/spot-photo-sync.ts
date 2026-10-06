// 장소 ↔ 사진 자동 연결을 다시 계산할 때, 저장된 연결(spot_photos, 0145)을 어떻게 고칠지 정한다.
//
// 틀리기 쉬운 건 DB 가 아니라 **운영자가 손댄 것을 지키는 규칙**이다 — 자동 계산이 운영자가 뺀
// 사진을 되살리거나, 넣은 사진을 지우면 어드민에서 한 일이 다음 날 아침 조용히 사라진다.
// 그래서 순수 함수로 떼어 테스트로 묶는다(lib/spot-match 와 같은 방식).
//
// 규칙
//   · manual(운영자가 넣은 것) — 건드리지 않는다. 자동 매칭에 걸려도 manual 로 둔다
//   · auto + excluded(운영자가 뺀 것) — 뺀 표시를 지킨다. 매칭에서 빠져도 지우지 않는다
//     (작가가 장소 메모를 고쳐 다시 걸려도 되살아나지 않게)
//   · auto — 이번 매칭 순서로 sort 를 다시 매기고, 매칭에서 빠진 것은 지운다

export type ExistingLink = {
  photoId: string;
  source: "auto" | "manual";
  excluded: boolean;
};

export type SyncPlan = {
  /** 쓸 자동 연결 — 새로 생기는 것과 순서만 바뀌는 것 모두. excluded 는 있던 값을 그대로 싣는다 */
  upsert: Array<{ photoId: string; sort: number; excluded: boolean }>;
  /** 지울 자동 연결(매칭에서 빠졌고 운영자가 뺀 것도 아닌 것) */
  remove: string[];
};

export function planAutoSync(existing: ExistingLink[], matchedIds: string[]): SyncPlan {
  const byPhoto = new Map(existing.map((l) => [l.photoId, l]));
  const matched = new Set(matchedIds);

  const upsert: SyncPlan["upsert"] = [];
  matchedIds.forEach((photoId, sort) => {
    const cur = byPhoto.get(photoId);
    if (cur?.source === "manual") return;
    upsert.push({ photoId, sort, excluded: cur?.excluded ?? false });
  });

  const remove = existing
    .filter((l) => l.source === "auto" && !l.excluded && !matched.has(l.photoId))
    .map((l) => l.photoId);

  return { upsert, remove };
}
