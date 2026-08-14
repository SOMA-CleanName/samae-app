export type CartMetaSample = {
  id: string;
  src_url: string;
  thumb_url: string | null;
  width: number;
  height: number;
  price_krw: number | null;
  location_text: string | null;
  region: string | null;
};

export type CartMetaSampleView = CartMetaSample & {
  location: string | null;
};

export type CartMetaSampleGroups = {
  locationOnly: CartMetaSampleView[];
  priceOnly: CartMetaSampleView[];
  neither: CartMetaSampleView[];
};

export function groupCartMetaSamples(rows: CartMetaSample[], limit = 4): CartMetaSampleGroups {
  const maxPerGroup = Math.max(0, Math.floor(limit));
  const groups: CartMetaSampleGroups = {
    locationOnly: [],
    priceOnly: [],
    neither: [],
  };

  for (const row of rows) {
    const location = row.location_text?.trim() || row.region?.trim() || null;
    const view = { ...row, location };
    const hasPrice = row.price_krw != null;

    if (!hasPrice && location && groups.locationOnly.length < maxPerGroup) {
      groups.locationOnly.push(view);
    } else if (hasPrice && !location && groups.priceOnly.length < maxPerGroup) {
      groups.priceOnly.push(view);
    } else if (!hasPrice && !location && groups.neither.length < maxPerGroup) {
      groups.neither.push(view);
    }
  }

  return groups;
}
