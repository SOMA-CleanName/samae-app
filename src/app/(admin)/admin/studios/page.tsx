import { redirect } from "next/navigation";

// 「작가 관리」는 「작가」로 합쳐졌다 (2026-09-18). 북마크·옛 링크를 위해 길만 남긴다.
export default function AdminStudiosRedirect(): never {
  redirect("/admin/photographers");
}
