export type PortfolioPackageOption = {
  id: string;
  name: string;
  price_krw: number;
};

export type PackageSelection = {
  packageId: string | null;
  priceKrw: number | null;
};

export type PhotoText = {
  title: string | null;
  caption: string | null;
};

export function resolvePackageSelection(
  packages: PortfolioPackageOption[],
  rawId: string,
): PackageSelection {
  const id = rawId.trim();
  if (!id) return { packageId: null, priceKrw: null };

  const selected = packages.find((item) => item.id === id);
  if (!selected) throw new Error("선택한 패키지를 찾을 수 없습니다.");

  return { packageId: selected.id, priceKrw: selected.price_krw };
}

export function normalizePhotoText(rawTitle: string, rawCaption: string): PhotoText {
  const title = rawTitle.trim().slice(0, 120);
  const caption = rawCaption.trim().slice(0, 1000);
  return {
    title: title || null,
    caption: caption || null,
  };
}
