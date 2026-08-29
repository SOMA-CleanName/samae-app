import { randomUUID } from "crypto";
import { getCurrentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { CASTING_BUCKET } from "@/lib/casting";

export const runtime = "nodejs";

const MAX_BYTES = 15 * 1024 * 1024;

// 캐스팅 첨부 업로드 — 신청자 사진 / 보호자 동의서.
//
// ⚠️ samae-casting 은 private 버킷이다. 여기서 공개 URL 을 만들지 않고 **경로만** 돌려준다.
//    보호자 동의서에는 미성년자와 보호자의 실명·연락처·서명이 들어간다. 공개 URL 이 한 번이라도
//    새어나가면 회수할 방법이 없다. 열람은 어드민이 그때그때 단기 서명 URL 로만 한다.
export async function POST(req: Request) {
  const me = await getCurrentUser();
  if (!me) return Response.json({ error: "로그인이 필요해요." }, { status: 401 });

  const form = await req.formData();
  const file = form.get("file");
  const kind = String(form.get("kind") || "photo");
  const roundSlug = String(form.get("roundSlug") || "");

  if (!(file instanceof File)) return Response.json({ error: "파일이 없어요." }, { status: 400 });
  if (kind !== "photo" && kind !== "consent") {
    return Response.json({ error: "잘못된 요청이에요." }, { status: 400 });
  }
  if (!roundSlug) return Response.json({ error: "회차 정보가 없어요." }, { status: 400 });
  if (file.size > MAX_BYTES) return Response.json({ error: "15MB 이하 파일만 올릴 수 있어요." }, { status: 400 });

  const admin = createAdminClient();

  // 실제로 열려 있는 회차인지 확인 — 닫힌 회차로 파일만 밀어 넣는 걸 막는다.
  const { data: round } = await admin
    .from("casting_rounds")
    .select("id, slug, status")
    .eq("slug", roundSlug)
    .maybeSingle();
  if (!round || round.status !== "open") {
    return Response.json({ error: "지금은 접수 기간이 아니에요." }, { status: 400 });
  }

  const isPdf = file.type === "application/pdf";
  // 동의서는 스캔 PDF 를 그대로 받는다. 사진은 전부 JPEG 로 정규화(아이폰 HEIC 대응).
  if (!file.type.startsWith("image/") && !(kind === "consent" && isPdf)) {
    return Response.json(
      { error: kind === "consent" ? "이미지 또는 PDF만 올릴 수 있어요." : "이미지만 올릴 수 있어요." },
      { status: 400 },
    );
  }

  let body: Buffer;
  let contentType: string;
  let ext: string;

  if (isPdf) {
    body = Buffer.from(await file.arrayBuffer());
    contentType = "application/pdf";
    ext = "pdf";
  } else {
    const sharp = (await import("sharp")).default;
    // 동의서는 서명·글씨를 읽어야 해서 사진보다 크게 남긴다.
    const width = kind === "consent" ? 2000 : 1400;
    const quality = kind === "consent" ? 85 : 80;
    body = await sharp(Buffer.from(await file.arrayBuffer()))
      .rotate()
      .resize({ width, withoutEnlargement: true })
      .jpeg({ quality })
      .toBuffer();
    contentType = "image/jpeg";
    ext = "jpg";
  }

  // 신청 행이 아직 없으므로 계정 기준 경로를 쓴다. 회차·계정 단위로 묶여 파기 배치가 쉬워진다.
  const path = `${round.slug}/${me.id}/${kind}_${randomUUID()}.${ext}`;
  const up = await admin.storage.from(CASTING_BUCKET).upload(path, body, { contentType });
  if (up.error) return Response.json({ error: "업로드에 실패했어요." }, { status: 500 });

  return Response.json({ ok: true, path });
}
