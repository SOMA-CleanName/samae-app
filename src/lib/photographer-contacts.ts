// 작가 연락 수단 — 예약이 확정된 뒤 고객에게 건네는 것.
//
// 순수 로직만 둔다 (서버 저장·검증과 클라이언트 렌더가 같은 규칙을 쓴다).
// 정책 근거: docs/32-refund-policy.md §3-3

export const MAX_CONTACT_METHODS = 4;
export const MAX_CONTACT_VALUE = 200;

export type ContactKind = "phone" | "kakao_open" | "instagram" | "other";

export type ContactMethod = {
  id: string;
  kind: ContactKind;
  /** 번호·링크·아이디 그대로 */
  value: string;
  /** 고객에게 보일 이름. 비면 종류 기본 라벨 */
  label?: string;
};

export const CONTACT_KIND_LABEL: Record<ContactKind, string> = {
  phone: "전화번호",
  kakao_open: "오픈채팅",
  instagram: "인스타그램",
  other: "기타",
};

export const CONTACT_KIND_PLACEHOLDER: Record<ContactKind, string> = {
  phone: "010-1234-5678",
  kakao_open: "https://open.kakao.com/o/…",
  instagram: "@myaccount",
  other: "링크 또는 아이디",
};

const KINDS = new Set<ContactKind>(["phone", "kakao_open", "instagram", "other"]);

/** 저장 전 정규화 — 규칙에 안 맞는 줄은 조용히 버린다(편집기가 미리 알려준다) */
export function normalizeContactMethods(raw: unknown): ContactMethod[] {
  if (!Array.isArray(raw)) return [];
  const out: ContactMethod[] = [];
  const seen = new Set<string>();

  raw.forEach((item, i) => {
    if (!item || typeof item !== "object") return;
    const r = item as Record<string, unknown>;
    const value = typeof r.value === "string" ? r.value.trim().slice(0, MAX_CONTACT_VALUE) : "";
    if (!value) return; // 추가만 해두고 안 채운 줄
    const kind: ContactKind = KINDS.has(r.kind as ContactKind) ? (r.kind as ContactKind) : "other";

    let id = typeof r.id === "string" && r.id.trim() ? r.id.trim().slice(0, 20) : `c${i + 1}`;
    while (seen.has(id)) id = `${id}_`;
    seen.add(id);

    const label = typeof r.label === "string" ? r.label.trim().slice(0, 30) : "";
    out.push({ id, kind, value, ...(label ? { label } : {}) });
  });

  return out.slice(0, MAX_CONTACT_METHODS);
}

/** 화면 표시용 이름 */
export function contactLabel(c: ContactMethod): string {
  return c.label?.trim() || CONTACT_KIND_LABEL[c.kind];
}

/** 눌러서 바로 이어지게 — 전화는 tel:, 링크는 그대로. 아니면 null(복사만) */
export function contactHref(c: ContactMethod): string | null {
  const v = c.value.trim();
  if (c.kind === "phone") return `tel:${v.replace(/[^0-9+]/g, "")}`;
  if (/^https?:\/\//i.test(v)) return v;
  if (c.kind === "instagram") return `https://instagram.com/${v.replace(/^@/, "")}`;
  return null;
}
