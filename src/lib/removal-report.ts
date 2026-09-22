// 작가 퇴출 점검 — 무엇이 막고, 무엇이 같이 정리되고, 무엇을 모르는가.
//
// 퇴출은 되돌릴 수 없다(하드 딜리트). 그래서 누르기 전에 **한 화면에서 전부 보여준다.**
// 전에는 예약·수수료(FK RESTRICT)만 세고 나머지는 그냥 지웠는데, 막지 못한 것들이
// 히히픽 건에서 드러났다 — 답을 기다리는 대화가 통째로 사라지고, 아티클·배너가 쓰던
// 사진은 FK 가 없어 조용히 404 가 된다.
//
// 판정만 여기 둔다(DB 접근 없음). 세는 일은 removal-facts.ts 가 한다.

/**
 * - `block`   — 사람이 처리해야 끝난다. 하나라도 있으면 퇴출 불가
 * - `unknown` — **확인할 방법이 아직 없다.** 막지는 않지만 초록으로 칠하지도 않는다
 * - `auto`    — 퇴출 실행 때 같이 처리된다 (스팟 숨김·파일 삭제)
 * - `info`    — CASCADE 로 알아서 정리된다. 숫자만 보여준다
 */
export type RemovalLevel = "block" | "unknown" | "auto" | "info";

export type RemovalItem = {
  key: string;
  level: RemovalLevel;
  label: string;
  count: number;
  /** 목록으로 보여줄 것 (아티클 제목 등) */
  detail?: string[];
  /** 운영자가 뭘 해야 하는지 */
  howTo?: string;
};

export type RemovalFacts = {
  /** FK RESTRICT — 남아 있으면 DB 가 삭제 자체를 거부한다 */
  bookings: number;
  platformFees: number;
  settlements: number;
  /** 아직 닫히지 않은 대화·문의. CASCADE 라 **아무것도 막지 않는다** */
  openConversations: number;
  openInquiries: number;
  /** 이 작가 사진을 쓰는 아티클·배너. FK 가 없어 행 삭제로는 안 잡힌다 */
  articles: Array<{ title: string; published: boolean }>;
  banners: Array<{ title: string; published: boolean }>;
  /** 표지가 이 작가 사진인 하이라이트 (SET NULL 이라 조용히 빈다) */
  highlightCovers: number;
  /** 퇴출 후 기준 미달이 될 공개 스팟 */
  spotsGoingDark: Array<{ slug: string; before: number; after: number }>;
  /** 지울 Storage 파일 수 */
  storageFiles: number;
  /** CASCADE 로 따라 지워질 행 수 */
  cascadeRows: number;
  /**
   * 마케팅 사용 대장이 있는가. 없으면 "집행 중 소재" 를 **셀 수가 없다.**
   * 그때 0 으로 적으면 "없다" 가 되어 버린다 — 모르는 것과 없는 것은 다르다.
   */
  marketingLedger: { available: false } | { available: true; active: number };
};

export type RemovalReport = {
  items: RemovalItem[];
  blockers: RemovalItem[];
  canRemove: boolean;
};

/** 스팟을 켜 두는 최소 장수 (lib/spots-db.ts 의 기준과 같다) */
export const SPOT_MIN_PHOTOS = 9;

export function buildRemovalReport(f: RemovalFacts): RemovalReport {
  const items: RemovalItem[] = [];
  const add = (i: RemovalItem) => {
    if (i.count > 0 || i.level === "unknown") items.push(i);
  };

  // ── 차단 ────────────────────────────────────────────────
  add({
    key: "bookings",
    level: "block",
    label: "진행 중인 예약",
    count: f.bookings,
    howTo: "정산·환불을 마무리한 뒤 다시 시도해주세요.",
  });
  add({
    key: "platform_fees",
    level: "block",
    label: "정산되지 않은 수수료",
    count: f.platformFees,
    howTo: "정산을 마무리해주세요.",
  });
  add({
    key: "settlements",
    level: "block",
    label: "남아 있는 정산 건",
    count: f.settlements,
    howTo: "정산을 마무리해주세요.",
  });

  // 대화·문의는 **FK 가 안 막는다.** CASCADE 라 그냥 사라진다 — 고객이 답을 기다리는
  // 방이 예고 없이 없어지는 일이라, 여기서 사람이 닫게 한다.
  add({
    key: "conversations",
    level: "block",
    label: "아직 열려 있는 대화",
    count: f.openConversations,
    howTo: "고객에게 안내한 뒤 방을 닫아주세요. 지금 퇴출하면 대화가 통째로 사라져요.",
  });
  add({
    key: "inquiries",
    level: "block",
    label: "처리되지 않은 문의",
    count: f.openInquiries,
    howTo: "문의를 마무리해주세요.",
  });

  // 아티클·배너는 사진을 **URL 문자열로 복사**해 둔다. 작가를 지워도 아무 일이 안
  // 일어나고, 파일까지 지우는 순간 깨진 이미지가 된다. 그래서 먼저 교체시킨다.
  add({
    key: "articles",
    level: "block",
    label: "이 작가 사진을 쓰는 아티클",
    count: f.articles.length,
    detail: f.articles.map((a) => `${a.published ? "공개" : "비공개"} · ${a.title}`),
    howTo: "대체 사진으로 교체한 뒤 퇴출할 수 있어요.",
  });
  add({
    key: "banners",
    level: "block",
    label: "이 작가 사진을 쓰는 배너",
    count: f.banners.length,
    detail: f.banners.map((b) => `${b.published ? "공개" : "비공개"} · ${b.title}`),
    howTo: "교체하거나 배너를 내려주세요.",
  });

  if (f.marketingLedger.available) {
    add({
      key: "marketing",
      level: "block",
      label: "집행 중인 마케팅 소재",
      count: f.marketingLedger.active,
      howTo: "소재를 내리거나 다른 사진으로 교체해주세요.",
    });
  } else {
    // ⚠️ 0 으로 적지 않는다. 대장이 없으면 **못 세는 것**이지 없는 게 아니다.
    items.push({
      key: "marketing",
      level: "unknown",
      label: "마케팅 소재 — 확인할 수 없어요",
      count: 0,
      howTo: "사용 대장이 아직 없어요. 인스타·광고에 이 작가 사진을 쓴 적이 있는지 직접 확인해주세요.",
    });
  }

  // ── 자동 처리 ───────────────────────────────────────────
  add({
    key: "highlights",
    level: "auto",
    label: "표지가 비게 될 하이라이트",
    count: f.highlightCovers,
    howTo: "표지를 다시 골라주세요. (지금 퇴출해도 진행은 돼요)",
  });
  add({
    key: "spots",
    level: "auto",
    label: `사진이 ${SPOT_MIN_PHOTOS}장 미만이 되어 숨겨질 장소`,
    count: f.spotsGoingDark.length,
    detail: f.spotsGoingDark.map((s) => `${s.slug} · ${s.before} → ${s.after}장`),
    howTo: "사진이 다시 채워지면 자동으로 돌아와요.",
  });
  add({
    key: "storage",
    level: "auto",
    label: "삭제될 사진 파일",
    count: f.storageFiles,
  });

  // ── 참고 ────────────────────────────────────────────────
  add({
    key: "cascade",
    level: "info",
    label: "함께 정리되는 항목",
    count: f.cascadeRows,
  });

  const blockers = items.filter((i) => i.level === "block");
  return { items, blockers, canRemove: blockers.length === 0 };
}
