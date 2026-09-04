// 관심사진(장바구니)을 작가별 더미로 묶는 순수 규칙.
// FloatingCart 의 배치·애니메이션과 분리해 둔다 — 묶음 규칙만 따로 테스트하기 위해서다.
import type { CartItem } from "@/components/user/cart/CartProvider";

// 사진 → 작가. 서버(loadCartPhotographers)가 돌려주는 최소 정보.
export type CartPhotoOwner = {
  photoId: string;
  photographerId: string;
  displayName: string | null;
};

export type CartGroup = {
  // 작가를 못 찾은 사진(비공개 전환·삭제 등)은 UNKNOWN_PHOTOGRAPHER 한 더미로 모은다.
  photographerId: string;
  displayName: string | null;
  items: CartItem[];
};

export const UNKNOWN_PHOTOGRAPHER = "__unknown__";

// 서버 응답 → photoId 기준 조회 맵
export function cartOwnerMap(owners: CartPhotoOwner[]): Map<string, CartPhotoOwner> {
  return new Map(owners.map((o) => [o.photoId, o]));
}

// 작가별 더미. items 는 카트 순서(오래된 것 먼저)를 유지하고,
// 더미 자체는 '가장 최근에 담은 사진이 있는 작가' 부터 앞에 온다 —
// 방금 담은 사진의 작가를 첫 화면에서 바로 찾을 수 있어야 하기 때문.
// 작가 미상 더미는 항상 맨 뒤.
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
    return (lastIndex.get(b.photographerId) ?? -1) - (lastIndex.get(a.photographerId) ?? -1);
  });
}

// 더미 화면을 띄울 조건 — 작가가 둘 이상일 때만. 한 작가뿐이면 더미를 한 번 더
// 눌러야 사진이 보이는 헛걸음이 되므로 지금처럼 바로 펼친다.
export function shouldShowPhotographerPiles(groups: CartGroup[]): boolean {
  return groups.length > 1;
}

// 열려 있던 작가 더미가 사라졌으면(사진을 다 빼는 등) 더미 화면으로 되돌린다.
export function reconciledActiveGroupId(
  groups: CartGroup[],
  activeId: string | null
): string | null {
  if (!activeId) return null;
  return groups.some((g) => g.photographerId === activeId) ? activeId : null;
}

// 현재 화면에 그릴 사진 — 더미 화면이면 전부, 한 작가를 열었으면 그 작가 것만.
export function visibleCartItems(
  groups: CartGroup[],
  activeId: string | null,
  fallback: CartItem[]
): CartItem[] {
  if (groups.length === 0) return fallback;
  if (!activeId) return groups.flatMap((g) => g.items);
  return groups.find((g) => g.photographerId === activeId)?.items ?? fallback;
}

// 더미 표지로 쓸 사진 — 최근에 담은 순으로 최대 3장(맨 위가 가장 최근).
export const PILE_VISIBLE_MAX = 3;
export function pileCoverItems(group: CartGroup): CartItem[] {
  return group.items.slice(-PILE_VISIBLE_MAX).reverse();
}

// 더미의 '이 작가에게 문의' 가 데려갈 사진 — 가장 최근에 담은 것.
export function groupInquiryPhotoId(group: CartGroup): string | null {
  return group.items.length > 0 ? group.items[group.items.length - 1].id : null;
}

// 작가 이름이 비어 있을 때의 표시 문구.
export function groupDisplayName(group: CartGroup): string {
  return group.displayName?.trim() || "작가 미상";
}
