import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { listMyGuideImages } from "@/lib/guide-images";
import { GuideEditor } from "./GuideEditor";

// 고객 안내 이미지 관리 — 사진 상세의 패키지 정보 아래에 세로로 노출되는 촬영 안내 이미지.
// 챗봇이 읽는 지식(KB)과는 별개 자산이라, 작가가 헷갈리지 않게 문구로 분명히 갈라둔다.
export default async function StudioGuidePage() {
  const me = await getCurrentUser();
  if (!me) redirect("/login?next=/studio/guide");
  if (!me.photographer) redirect("/studio");

  const images = await listMyGuideImages(me.photographer.id);

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 sm:py-8">
      <Link href="/studio" className="text-sm text-fg/50 hover:text-fg">
        ← 스튜디오
      </Link>
      <h1 className="mt-4 text-xl font-bold">고객 안내 이미지</h1>
      <p className="mt-1 text-body-sm text-muted">
        고객이 <b>사진 상세</b>에서 보게 되는 촬영 안내 이미지예요. 패키지 정보 아래에 세로로
        보이고, 탭하면 좌우로 넘겨볼 수 있어요. 준비물·촬영 진행·보정 안내처럼 평소 고객에게
        따로 보내주시던 이미지를 그대로 올려주세요.
      </p>
      <p className="mt-1.5 text-caption text-faint">
        ⓘ 문의 챗봇이 답할 때 쓰는 지식은 <b>운영진이 따로 등록</b>해요. 여기 올린 이미지는
        고객이 눈으로 보는 안내라서, 봇 답변을 바꾸려면 운영팀에 알려주세요.
      </p>

      <div className="mt-5">
        <GuideEditor initialImages={images} />
      </div>
    </div>
  );
}
