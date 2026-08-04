import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { listMyAboutSections } from "@/lib/about";
import { AboutEditor } from "./AboutEditor";

// 소개(무드) 페이지 편집 — 섹션 템플릿을 골라 쌓고, 내용을 채우고, 드래그로 순서를 바꾼다.
export default async function StudioAboutPage() {
  const me = await getCurrentUser();
  if (!me) redirect("/login?next=/studio/about");
  if (!me.photographer) redirect("/studio");

  const sections = await listMyAboutSections(me.photographer.id);

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:py-8 lg:max-w-6xl">
      <div>
        <h1 className="text-xl font-bold">소개 페이지</h1>
        <p className="mt-1 text-body-sm text-muted">
          내 프로필 맨 앞 &lsquo;소개&rsquo; 탭을 꾸며요. 섹션을 골라 쌓고, 드래그로 순서를 바꿔요.
        </p>
        <p className="mt-1.5 text-caption text-faint">
          ⓘ PC와 모바일은 화면 폭에 맞춰 배치가 달라질 수 있어요 — 2단 텍스트·이미지
          지그재그는 모바일에서 위아래로 쌓여요. 미리보기에서 두 화면을 모두 확인해 보세요.
        </p>
      </div>

      <div className="mt-5">
        <AboutEditor
          initialSections={sections}
          previewHref={`/photographers/${me.photographer.id}`}
        />
      </div>
    </div>
  );
}
