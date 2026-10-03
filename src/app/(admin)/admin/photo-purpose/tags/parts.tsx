import { createAdminClient } from "@/lib/supabase/admin";
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

/** 사진을 누르면 빼기 · 되살리기 — 검수는 빼는 일이라 버튼보다 사진 자체가 빠르다(사람 결정 2026-10-01) */
export function DropThumb({ id, url, layer, k, dropped }: { id: string; url?: string; layer: TagLayer; k: string; dropped: boolean }) {
  return (
    <form action={editPhotoMoodTag}>
      <input type="hidden" name="photo" value={id} />
      <input type="hidden" name="layer" value={layer} />
      <input type="hidden" name="key" value={k} />
      <input type="hidden" name="action" value={dropped ? "keep" : "drop"} />
      <button title={dropped ? "눌러서 되살리기" : "눌러서 빼기"}
        className={`relative block aspect-square w-full overflow-hidden rounded-lg bg-line/40 ${dropped ? "ring-4 ring-inset ring-info" : "hover:ring-2 hover:ring-inset hover:ring-info/60"}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {url ? <img src={url} alt="" loading="lazy" className="h-full w-full object-contain" /> : null}
        {/* 뺀 사진은 흐리게 덮지 않고 파란 테두리로 고른 것처럼(사람 요청 2026-10-03) — 사진을 그대로 보면서 무엇을 뺐는지 안다 */}
        {dropped && <span className="absolute left-1.5 top-1.5 rounded-md bg-info px-1.5 py-0.5 text-caption font-semibold text-white">뺌</span>}
      </button>
    </form>
  );
}
