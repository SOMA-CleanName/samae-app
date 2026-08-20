// 게시물 이미지 → Claude 멀티모달 base64 블록.
// (woori-mirae `report/prompt.ts`의 이미지 처리부 포팅)
// Claude에 URL을 그대로 주면 Claude가 인스타 CDN을 직접 fetch하다 robots.txt에 막힌다.
// → 서버(여기)에서 직접 다운로드해 base64로 인코딩하면 robots.txt와 무관하게 전달 가능.
import "server-only";
import sharp from "sharp";
import type { IgProfile } from "@/lib/persona/types";

type ImageMediaType = "image/jpeg" | "image/png" | "image/gif" | "image/webp";
const ALLOWED_MEDIA = new Set<string>(["image/jpeg", "image/png", "image/gif", "image/webp"]);
const MAX_IMAGE_BYTES = 4_800_000; // Claude 이미지 한도(5MB) 여유

// Claude 이미지 토큰 ≈ (가로×세로)/750. 인스타 원본(1080px)은 장당 ~1,550토큰이라
// 장수를 늘리면 비용이 바로 튄다. 512px로 줄이면 장당 ~350토큰 — 4배 이상 절약되고,
// 톤·색·구도·피사체 판단에는 이 해상도로 충분하다. (얼굴 표정 디테일까지는 안 봐도 되는 과업)
const DOWNSCALE_PX = 512;

// Claude 멀티모달 이미지 블록 타입 (스크래핑·업로드 공용)
export type PersonaImageBlock = {
  type: "image";
  source: { type: "base64"; media_type: ImageMediaType; data: string };
};

// 업로드 fallback — 클라이언트가 보낸 base64를 이미지 블록으로 변환.
export function imageBlockFromBase64(mediaType: string, base64: string): PersonaImageBlock | null {
  const mt = mediaType.split(";")[0].trim().toLowerCase();
  if (!ALLOWED_MEDIA.has(mt) || !base64) return null;
  return { type: "image", source: { type: "base64", media_type: mt as ImageMediaType, data: base64 } };
}

// 매직바이트로 이미지 타입 추정 (Content-Type이 부정확할 때 폴백)
function sniffMediaType(buf: Buffer): ImageMediaType | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8) return "image/jpeg";
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "image/png";
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return "image/gif";
  if (buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  return null;
}

/** 원본 버퍼 → 512px JPEG. 실패하면 원본을 그대로 쓴다(분석이 멈추면 안 되므로). */
async function downscale(buf: Buffer): Promise<{ buf: Buffer; mediaType: ImageMediaType } | null> {
  try {
    const out = await sharp(buf, { failOn: "none" })
      .rotate() // EXIF 회전 반영 — 세로 사진이 눕는 것 방지
      .resize(DOWNSCALE_PX, DOWNSCALE_PX, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer();
    return { buf: out, mediaType: "image/jpeg" };
  } catch {
    return null;
  }
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

    const raw = Buffer.from(await res.arrayBuffer());
    if (raw.length === 0 || raw.length > MAX_IMAGE_BYTES) return null;

    const header = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    const rawType: ImageMediaType | null = ALLOWED_MEDIA.has(header)
      ? (header as ImageMediaType)
      : sniffMediaType(raw);
    if (!rawType) return null;

    // 축소 실패 시엔 원본으로 폴백 (토큰은 더 쓰지만 분석은 된다)
    const small = await downscale(raw);
    const buf = small?.buf ?? raw;
    const mediaType = small?.mediaType ?? rawType;

    return {
      type: "image" as const,
      source: { type: "base64" as const, media_type: mediaType, data: buf.toString("base64") },
    };
  } catch {
    return null; // 다운로드 실패 이미지는 조용히 스킵
  }
}

/** 피드 전체에서 k장을 고르게 뽑는다.
 *  앞에서부터 자르면(slice) 최근 며칠의 게시물만 보게 돼 표본이 한쪽으로 쏠린다.
 *  — 여행 다녀온 직후면 계정 전체가 '여행 감성'으로 오판된다.
 *  등간격으로 뽑으면 같은 장수로 더 긴 기간을 커버한다. */
function spread<T>(items: T[], k: number): T[] {
  if (k <= 1 || items.length <= k) return items.slice(0, Math.max(k, 0));
  const step = (items.length - 1) / (k - 1);
  return Array.from({ length: k }, (_, i) => items[Math.round(i * step)]);
}

/** 분석 표본 → 결과 화면용 초소형 썸네일(data URL).
 *  "근거" 옆에 실제 그 사진을 보여주기 위한 것 — 128px q70 이면 장당 ~6KB 라
 *  9장을 실어도 응답 ~60KB. DB 에는 저장하지 않는다(남의 피드 사진을 남기지 않는다). */
export async function blockThumbnails(blocks: PersonaImageBlock[]): Promise<string[]> {
  return Promise.all(
    blocks.map(async (b) => {
      try {
        const out = await sharp(Buffer.from(b.source.data, "base64"), { failOn: "none" })
          .resize(128, 128, { fit: "cover" })
          .jpeg({ quality: 70 })
          .toBuffer();
        return `data:image/jpeg;base64,${out.toString("base64")}`;
      } catch {
        return ""; // 한 장 실패는 빈 문자열 — 자리(번호)는 유지해야 photoIndexes 가 안 어긋난다
      }
    })
  );
}

/** 이미지 블록 → 원본 버퍼. 팔레트 추출처럼 픽셀이 필요한 곳에서 쓴다.
 *  (이미 512px 로 줄여둔 것이라 디코딩 비용이 작다) */
export function blockBuffers(blocks: PersonaImageBlock[]): Buffer[] {
  return blocks.map((b) => Buffer.from(b.source.data, "base64"));
}

/** 계정당 최대 maxImages개 이미지를 서버에서 받아 base64 블록으로 반환 (피드 전체에서 등간격 표집) */
export async function fetchImageBlocks(p: IgProfile, maxImages: number): Promise<PersonaImageBlock[]> {
  const urls = spread(
    p.posts.map((post) => post.imageUrl).filter((u): u is string => !!u),
    maxImages
  );

  const blocks = await Promise.all(urls.map(fetchImageAsBlock));
  return blocks.filter((b): b is PersonaImageBlock => b !== null);
}
