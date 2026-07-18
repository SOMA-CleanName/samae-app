// 게시물 이미지 → Claude 멀티모달 base64 블록.
// (woori-mirae `report/prompt.ts`의 이미지 처리부 포팅)
// Claude에 URL을 그대로 주면 Claude가 인스타 CDN을 직접 fetch하다 robots.txt에 막힌다.
// → 서버(여기)에서 직접 다운로드해 base64로 인코딩하면 robots.txt와 무관하게 전달 가능.
import "server-only";
import type { IgProfile } from "@/lib/persona/types";

type ImageMediaType = "image/jpeg" | "image/png" | "image/gif" | "image/webp";
const ALLOWED_MEDIA = new Set<string>(["image/jpeg", "image/png", "image/gif", "image/webp"]);
const MAX_IMAGE_BYTES = 4_800_000; // Claude 이미지 한도(5MB) 여유

// 매직바이트로 이미지 타입 추정 (Content-Type이 부정확할 때 폴백)
function sniffMediaType(buf: Buffer): ImageMediaType | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8) return "image/jpeg";
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "image/png";
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return "image/gif";
  if (buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  return null;
}

async function fetchImageAsBlock(url: string) {
  try {
    const res = await fetch(url, {
      headers: {
        // 브라우저처럼 요청해 CDN 차단 회피
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
        Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;

    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length === 0 || buf.length > MAX_IMAGE_BYTES) return null;

    const header = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    const mediaType: ImageMediaType | null = ALLOWED_MEDIA.has(header)
      ? (header as ImageMediaType)
      : sniffMediaType(buf);
    if (!mediaType) return null;

    return {
      type: "image" as const,
      source: { type: "base64" as const, media_type: mediaType, data: buf.toString("base64") },
    };
  } catch {
    return null; // 다운로드 실패 이미지는 조용히 스킵
  }
}

/** 계정당 최대 maxImages개 이미지를 서버에서 받아 base64 블록으로 반환 */
export async function fetchImageBlocks(p: IgProfile, maxImages: number) {
  const urls = p.posts
    .map((post) => post.imageUrl)
    .filter((u): u is string => !!u)
    .slice(0, maxImages);

  const blocks = await Promise.all(urls.map(fetchImageAsBlock));
  return blocks.filter((b): b is NonNullable<typeof b> => b !== null);
}
