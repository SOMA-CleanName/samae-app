// 비로그인 사용자의 '관심사진' — 사진 id 를 쿠키에 보관해, 로그인 없이도
// 브라우저를 닫았다 다시 열어도 좋아요가 유지된다. (samae_inq 문의 쿠키와 동일 패턴)
// httpOnly → 서버(서버액션·라우트·RSC)에서만 읽고 쓴다. 관심작가(photographer)는 대상 외.
import { cookies } from "next/headers";

export const ANON_FAV_COOKIE = "samae_fav";
const MAX = 80; // 쿠키 4KB 여유 (UUID 80개 ≈ 3KB) — 초과 시 오래된 것부터 밀려남
const ONE_YEAR = 60 * 60 * 24 * 365;

function parse(raw: string | undefined): string[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

// 쿠키에 저장된 관심사진 id 목록(최신 앞).
export async function readAnonFavPhotoIds(): Promise<string[]> {
  return parse((await cookies()).get(ANON_FAV_COOKIE)?.value);
}

// 관심사진 토글 — 저장 후 새 liked 상태 반환. 서버액션/라우트에서만 호출(쿠키 쓰기).
export async function toggleAnonFavPhoto(photoId: string): Promise<boolean> {
  const jar = await cookies();
  const ids = parse(jar.get(ANON_FAV_COOKIE)?.value);
  const has = ids.includes(photoId);
  const next = (has ? ids.filter((id) => id !== photoId) : [photoId, ...ids]).slice(0, MAX);
  if (next.length === 0) {
    jar.delete(ANON_FAV_COOKIE);
  } else {
    jar.set(ANON_FAV_COOKIE, JSON.stringify(next), {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: ONE_YEAR,
    });
  }
  return !has;
}
