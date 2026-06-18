// 업로드 전 클라이언트 리사이즈 — 브라우저에서 긴 변을 줄이고 JPEG로 재인코딩한다.
//   목적 1) Next.js Server Action 본문 한계(기본 1MB)·Vercel 함수 4.5MB 한계 회피
//   목적 2) 아이폰 HEIC 등 포맷을 JPEG로 정규화
// 디코드/캔버스 실패 시 원본 파일을 그대로 반환.

const MAX_EDGE = 1600;
const QUALITY = 0.82;

export async function downscaleImage(file: File, maxEdge = MAX_EDGE, quality = QUALITY): Promise<File> {
  try {
    const bitmap = await loadBitmap(file);
    const srcW = bitmap.width;
    const srcH = bitmap.height;
    if (!srcW || !srcH) return file;

    const scale = Math.min(1, maxEdge / Math.max(srcW, srcH));
    const w = Math.max(1, Math.round(srcW * scale));
    const h = Math.max(1, Math.round(srcH * scale));

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap as CanvasImageSource, 0, 0, w, h);
    if (typeof (bitmap as ImageBitmap).close === "function") (bitmap as ImageBitmap).close();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/jpeg", quality)
    );
    if (!blob) return file;

    const name = file.name.replace(/\.[^.]+$/, "") + ".jpg";
    return new File([blob], name, { type: "image/jpeg", lastModified: Date.now() });
  } catch {
    return file;
  }
}

// EXIF 회전 반영 디코드. createImageBitmap 우선, 실패 시 <img> fallback.
async function loadBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      // HEIC 등 일부 포맷·브라우저 → img fallback
    }
  }
  return await new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("이미지를 읽을 수 없어요."));
    };
    img.src = url;
  });
}
