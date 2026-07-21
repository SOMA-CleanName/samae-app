// 인스타 CDN 이미지 프록시 (woori-mirae `api/img/route.ts` 포팅).
// 브라우저가 인스타 CDN을 직접 로드하면 hotlink/referer 차단으로 막힌다.
// → 우리 서버가 대신 받아서 스트리밍(서버 GET은 차단 무관).

export const runtime = "nodejs";

// SSRF 방지: 인스타/페이스북 CDN 호스트만 허용
const ALLOWED_HOST = /(^|\.)(cdninstagram\.com|fbcdn\.net)$/i;

const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
  Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
};

export async function GET(request: Request) {
  const target = new URL(request.url).searchParams.get("url");
  if (!target) return new Response("missing url", { status: 400 });

  let u: URL;
  try {
    u = new URL(target);
  } catch {
    return new Response("bad url", { status: 400 });
  }
  if (u.protocol !== "https:" || !ALLOWED_HOST.test(u.hostname)) {
    return new Response("forbidden", { status: 403 });
  }

  try {
    const res = await fetch(target, { headers: BROWSER_HEADERS, signal: AbortSignal.timeout(8000) });
    if (!res.ok) return new Response("upstream error", { status: 502 });

    const contentType = res.headers.get("content-type") ?? "image/jpeg";
    const buf = await res.arrayBuffer();
    return new Response(buf, {
      headers: {
        "Content-Type": contentType,
        // 세션 동안 캐시 (프로필 사진은 자주 안 바뀜)
        "Cache-Control": "public, max-age=3600, immutable",
      },
    });
  } catch {
    return new Response("fetch failed", { status: 502 });
  }
}
