import { createAdminClient } from "@/lib/supabase/admin";
import { isMarketingUsable } from "@/lib/marketing-photos";
import type { TagLayer } from "@/lib/mood-photo-tags";
import { editPhotoMoodTag } from "./actions";

// 사진 태그 두 화면(태그 관리 · 사진별 태그)이 같이 쓰는 조각 (docs/47 §5)

/** 이 화면에 띄울 사진의 썸네일 — PostgREST 주소 길이 때문에 100장씩 끊어 읽는다 */
export async function loadThumbs(ids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!ids.length) return out;
  const admin = createAdminClient();
  for (let i = 0; i < ids.length; i += 100) {
    const { data } = await admin.from("photos").select("id, thumb_url, src_url").in("id", ids.slice(i, i + 100));
    for (const row of data ?? []) out.set(row.id as string, (row.thumb_url ?? row.src_url) as string);
  }
  return out;
}

/**
 * 이 사진들 중 **마케팅에 써도 되는** 사진 — 판정은 lib/marketing-photos 한 곳(앨범 광고 사용 동의 · 공개 사진).
 * 「확정된 사진 → 마케팅 허용만」 보기가 쓴다. 100장씩 끊어 읽는다(주소 길이).
 */
export async function loadMarketingUsable(ids: string[]): Promise<Set<string>> {
  const out = new Set<string>();
  if (!ids.length) return out;
  const admin = createAdminClient();
  for (let i = 0; i < ids.length; i += 100) {
    const { data } = await admin
      .from("photos")
      .select("id, visibility, album:albums(ad_consent)")
      .in("id", ids.slice(i, i + 100));
    for (const row of (data ?? []) as unknown as Array<{ id: string; visibility: string; album: { ad_consent: boolean } | null }>) {
      if (isMarketingUsable({ albumAdConsent: !!row.album?.ad_consent, visibility: row.visibility })) out.add(row.id);
    }
  }
  return out;
}

export function PhotoThumb({ id, url }: { id: string; url?: string }) {
  return (
    <a href={`/photos/${id}`} target="_blank" rel="noreferrer" className="block aspect-square overflow-hidden rounded-lg bg-line/40">
      {/* 검수용 썸네일 — 500px 썸네일 그대로. 정사각 칸에 자르지 않고 통째로(가로 사진이 잘리지 않게, 사람 요청 2026-10-01) */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {url ? <img src={url} alt="" loading="lazy" className="h-full w-full object-contain" /> : null}
    </a>
  );
}

export function TagButton({ photo, layer, k, dropped }: { photo: string; layer: TagLayer; k: string; dropped: boolean }) {
  return (
    <form action={editPhotoMoodTag} className="ml-auto">
      <input type="hidden" name="photo" value={photo} />
      <input type="hidden" name="layer" value={layer} />
      <input type="hidden" name="key" value={k} />
      <input type="hidden" name="action" value={dropped ? "keep" : "drop"} />
      <button className={`rounded border px-1.5 ${dropped ? "border-line text-muted" : "border-danger/40 text-danger-ink"}`}>{dropped ? "되살리기" : "빼기"}</button>
    </form>
  );
}

/**
 * 검수 칸의 사진 — **누르면 그 사진의 포트폴리오로 간다**(새 탭, /photos/{id} 가 같은 포트폴리오 사진을 이어 보여준다).
 * 빼기는 [빼기] 버튼으로만 한다 — 예전엔 사진을 누르면 바로 빠져서, 포트폴리오를 보려다 실수로 빼는 일이 있었다(사람 요청 2026-10-17).
 */
export function DropThumb({ id, url, dropped }: { id: string; url?: string; dropped: boolean }) {
  return (
    <a href={`/photos/${id}`} target="_blank" rel="noreferrer" title="포트폴리오 보기 (새 탭)"
      className={`relative block aspect-square w-full overflow-hidden rounded-lg bg-line/40 ${dropped ? "ring-4 ring-inset ring-info" : "hover:ring-2 hover:ring-inset hover:ring-info/60"}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {url ? <img src={url} alt="" loading="lazy" className="h-full w-full object-contain" /> : null}
      {/* 뺀 사진은 흐리게 덮지 않고 파란 테두리로 고른 것처럼(사람 요청 2026-10-03) — 사진을 그대로 보면서 무엇을 뺐는지 안다 */}
      {dropped && <span className="absolute left-1.5 top-1.5 rounded-md bg-info px-1.5 py-0.5 text-caption font-semibold text-white">뺌</span>}
    </a>
  );
}
