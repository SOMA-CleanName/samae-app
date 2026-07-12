import { PhotoModal } from "@/components/user/PhotoModal";
import { PhotoDetailView } from "../../../photos/[id]/PhotoDetailView";

// 소프트 내비게이션(피드에서 사진 클릭)을 가로채 상세를 모달로 렌더한다.
// 하드 내비게이션(직접 링크·새로고침)은 이 인터셉트가 적용되지 않아 전체 페이지가 뜬다.
// 본문(PhotoDetailView)은 전체 페이지와 100% 동일 — inModal 로 창 스크롤만 안 건드린다.
export const dynamic = "force-dynamic";

export default async function InterceptedPhotoModal({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ like?: string; mock?: string }>;
}) {
  const { id } = await params;
  const sp = (await searchParams) ?? {};
  return (
    <PhotoModal>
      <PhotoDetailView id={id} like={sp.like} mock={sp.mock} inModal />
    </PhotoModal>
  );
}
