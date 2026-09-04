// 관심사진(장바구니)을 작가별 줄로 묶는 순수 규칙.
// FloatingCart 의 배치·애니메이션과 분리해 둔다 — 묶음 규칙만 따로 테스트하기 위해서다.
import type { CartItem } from "@/components/user/cart/CartProvider";

// 사진 → 작가. 서버(loadCartPhotographers)가 돌려주는 최소 정보.
export type CartPhotoOwner = {
  photoId: string;
  photographerId: string;
  displayName: string | null;
};

export type CartGroup = {
  // 작가를 못 찾은 사진(비공개 전환·삭제 등)은 UNKNOWN_PHOTOGRAPHER 한 줄로 모은다.
  photographerId: string;
  displayName: string | null;
  items: CartItem[];
};

export const UNKNOWN_PHOTOGRAPHER = "__unknown__";

// 서버 응답 → photoId 기준 조회 맵
export function cartOwnerMap(owners: CartPhotoOwner[]): Map<string, CartPhotoOwner> {
  return new Map(owners.map((o) => [o.photoId, o]));
}

// 작가별 줄. items 는 카트 순서(오래된 것 먼저)를 유지한다.
// 줄 순서는 **많이 담은 작가부터** — 마음이 기운 작가가 맨 위에 있어야 한다.
// 같은 장수면 최근에 담은 작가를 앞에, 작가 미상 줄은 항상 맨 뒤.
export function groupCartByPhotographer(
  items: CartItem[],
  owners: Map<string, CartPhotoOwner>
): CartGroup[] {
  const byPhotographer = new Map<string, CartGroup>();
  const lastIndex = new Map<string, number>();

  items.forEach((item, index) => {
    const owner = owners.get(item.id);
    const key = owner?.photographerId ?? UNKNOWN_PHOTOGRAPHER;
    const group = byPhotographer.get(key);
    if (group) group.items.push(item);
    else
      byPhotographer.set(key, {
        photographerId: key,
        displayName: owner?.displayName ?? null,
        items: [item],
      });
    lastIndex.set(key, index);
  });

  return [...byPhotographer.values()].sort((a, b) => {
    if (a.photographerId === UNKNOWN_PHOTOGRAPHER) return 1;
    if (b.photographerId === UNKNOWN_PHOTOGRAPHER) return -1;
    if (a.items.length !== b.items.length) return b.items.length - a.items.length;
    return (lastIndex.get(b.photographerId) ?? -1) - (lastIndex.get(a.photographerId) ?? -1);
  });
}

// 작가별 줄로 보여줄 수 있는가 — 작가를 한 명이라도 알아냈을 때.
// 조회 실패로 아무것도 모르면 지금까지처럼 한 화면에 폴라로이드로 펼친다.
export function hasPhotographerGroups(groups: CartGroup[]): boolean {
  return groups.length > 0;
}

// 줄 안의 사진 순서 — 최근에 담은 것이 왼쪽(줄의 시작).
export function rowItems(group: CartGroup): CartItem[] {
  return [...group.items].reverse();
}

// 줄의 '문의' 가 데려갈 사진 — 그 작가에게서 가장 최근에 담은 것.
export function groupInquiryPhotoId(group: CartGroup): string | null {
  return group.items.length > 0 ? group.items[group.items.length - 1].id : null;
}

// 작가 이름이 비어 있을 때의 표시 문구.
export function groupDisplayName(group: CartGroup): string {
  return group.displayName?.trim() || "작가 미상";
}
