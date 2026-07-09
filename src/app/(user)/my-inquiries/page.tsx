import type { Metadata } from "next";
import { readMyInquiryIds, fetchMyInquiries } from "@/lib/my-inquiries";
import { EmptyState } from "@/components/ui";
import { ClipboardIcon } from "@/components/user/icons";
import { MyInquiryList } from "./MyInquiryList";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "문의 내역", robots: { index: false } };

// 비로그인 사용자의 '내 문의' 내역 — 쿠키에 보관된 문의 id 로 조회.
export default async function MyInquiriesPage() {
  const ids = await readMyInquiryIds();
  const inquiries = await fetchMyInquiries(ids);

  return (
    <main className="mx-auto max-w-2xl px-4 pb-24 pt-6 font-kr">
      <h1 className="text-h1 font-semibold">문의 내역</h1>
      <p className="mt-1 text-body-sm text-muted">문의한 내역과 진행 상태를 확인할 수 있어요.</p>

      {inquiries.length === 0 ? (
        <div className="mt-8">
          <EmptyState
            icon={<ClipboardIcon className="h-7 w-7" />}
            title="아직 문의 내역이 없어요"
            description="마음에 든 작가에게 문의하면 여기에 쌓여요."
          />
        </div>
      ) : (
        <MyInquiryList inquiries={inquiries} />
      )}
    </main>
  );
}
