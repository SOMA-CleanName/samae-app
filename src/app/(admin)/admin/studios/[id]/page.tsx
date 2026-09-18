import { redirect } from "next/navigation";

// 상세는 /admin/photographers/[id] 로 옮겼다 (2026-09-18).
export default async function AdminStudioDetailRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<never> {
  const { id } = await params;
  redirect(`/admin/photographers/${id}`);
}
