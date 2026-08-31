import type { Metadata } from "next";
import Link from "next/link";
import { JsonLd } from "@/components/JsonLd";
import { StickyBack } from "@/components/editorial/StickyBack";
import { Masthead } from "@/components/editorial/Masthead";
import { breadcrumbJsonLd } from "@/lib/seo";
import { REFUND_WINDOW_DAYS, WITHDRAWAL_DAYS } from "@/lib/refund";

/*
  신뢰·안전 지면.

  '사매 파트너 작가' 뱃지를 눌렀을 때 "왜 믿을 수 있는지"를 한 줄로만 말하고 있었다.
  그 뒤에 실제 근거가 없으면 그 한 줄은 광고 문구다.

  ⚠️ 이 지면에는 **실제로 하고 있는 것만** 적는다.
     "책임은 사매가 집니다" 같은 포괄적 보증은 쓰지 않았다. 검증할 수 없고,
     그 문장 하나가 그대로 채무가 된다. 법률 검토를 거친 문구가 준비되면 그때 넣을 것.

  적은 것은 전부 코드나 문서에 근거가 있다.
    · 작가 승인       — photographers.status = 'approved' 인 작가만 노출
    · 안전거래·연락처 — lib/platform-policy.ts (전 작가 상담봇이 공유하는 규칙)
    · 환불 기준       — lib/refund.ts · docs/32-refund-policy.md
    · 개인정보        — /privacy
  숫자(7일 등)는 상수를 그대로 읽어 온다. 정책이 바뀌면 이 지면도 같이 바뀐다.
*/
export const revalidate = 86400;

export const metadata: Metadata = {
  title: "안전하게 촬영하기",
  description:
    "사매가 작가를 어떻게 심사하고, 결제와 연락처를 어떻게 지키며, 취소·환불을 어떤 기준으로 처리하는지 정리했습니다.",
  alternates: { canonical: "/trust" },
};

type Item = { term: string; desc: string };

function Block({
  no,
  title,
  lead,
  items,
  footnote,
}: {
  no: string;
  title: string;
  lead: string;
  items: Item[];
  footnote?: React.ReactNode;
}) {
  return (
    <section className="mt-11 border-t border-line pt-7 first:mt-8">
      <div className="flex items-baseline gap-2">
        <span className="font-display text-body-sm italic tabular-nums text-brand">{no}</span>
        <h2 className="text-title font-bold tracking-tight">{title}</h2>
      </div>
      <p className="mt-1.5 text-body-sm leading-relaxed text-muted">{lead}</p>

      <dl className="mt-4 border-t border-line-strong">
        {items.map((it) => (
          <div key={it.term} className="border-b border-line py-3.5">
            <dt className="text-body-sm font-bold tracking-tight">{it.term}</dt>
            <dd className="mt-1 text-body-sm leading-relaxed text-muted">{it.desc}</dd>
          </div>
        ))}
      </dl>

      {footnote && <p className="mt-3 text-[11px] leading-relaxed text-faint">{footnote}</p>}
    </section>
  );
}

export default function TrustPage() {
  return (
    <main className="min-h-dvh bg-bg font-kr">
      <JsonLd
        data={breadcrumbJsonLd([
          { name: "홈", path: "/" },
          { name: "안전하게 촬영하기", path: "/trust" },
        ])}
      />

      <StickyBack href="/" meta="Trust & Safety" maxWidth="720px" />

      <div className="mx-auto w-full max-w-[720px] px-5 pb-24 pt-6">
        <Masthead
          word="SAFETY"
          size="compact"
          lead="사매가 작가를 어떻게 고르고, 돈과 연락처를 어떻게 지키는지 적어 둡니다."
        />

        <Block
          no="01"
          title="작가"
          lead="아무나 올라오지 않습니다."
          items={[
            {
              term: "직접 인터뷰하고 심사합니다",
              desc: "사매가 카카오 채널로 직접 이야기를 나눠 보고, 승인한 작가만 지면에 올립니다. 심사를 통과하지 않은 계정의 사진은 검색에도 추천에도 나오지 않습니다.",
            },
            {
              term: "작가 이름을 앞세우지 않습니다",
              desc: "사매는 사진으로 작가를 만나는 곳입니다. 인지도가 아니라 사진이 기준이라, 특정 작가를 순위로 띄우지 않습니다.",
            },
          ]}
        />

        <Block
          no="02"
          title="결제"
          lead="작가 개인 계좌로 보내는 일이 없습니다."
          items={[
            {
              term: "사매 계좌로 받습니다",
              desc: "촬영비는 사매가 받아 두고, 촬영이 끝난 뒤 작가에게 정산합니다. 작가가 개인 계좌를 알려주며 직접 보내달라고 하면 그건 사매의 절차가 아닙니다.",
            },
            {
              term: "고객이 더 내는 금액은 없습니다",
              desc: "사매는 중개 수수료를 촬영비에서 떼어 갑니다. 화면에 적힌 금액 위에 얹히는 수수료는 없습니다.",
            },
            {
              term: "예약은 양쪽이 확인해야 잡힙니다",
              desc: "작가가 보낸 예약 제안을 고객이 수락하고, 입금을 사매가 확인해야 확정됩니다.",
            },
          ]}
        />

        <Block
          no="03"
          title="연락처"
          lead="번호가 먼저 넘어가지 않습니다."
          items={[
            {
              term: "고객 연락처는 작가에게 공개되지 않습니다",
              desc: "상담은 사매 채팅 안에서만 오갑니다. 작가는 고객의 전화번호를 볼 수 없습니다.",
            },
            {
              term: "작가 연락처는 예약이 확정된 뒤에",
              desc: "촬영 당일 연락이 필요해지는 시점에, 작가가 보내고 고객이 안내를 확인한 뒤 전달됩니다.",
            },
            {
              term: "외부 채널로 옮기자는 요청에는 응하지 않습니다",
              desc: "카카오톡·인스타그램이나 개인 계좌로 넘어가면 아래의 취소·환불 기준이 적용되지 않습니다.",
            },
          ]}
          footnote={
            <>
              수집하는 항목과 보관·파기 기준은{" "}
              <Link href="/privacy" className="underline underline-offset-2 hover:text-muted">
                개인정보 처리방침
              </Link>
              에 적혀 있습니다.
            </>
          }
        />

        <Block
          no="04"
          title="취소와 환불"
          lead="작가마다 다르지 않습니다. 사매 공통 기준 하나입니다."
          items={[
            {
              term: "입금 전에는 언제든 무료",
              desc: "예약이 확정되기 전에는 위약금 없이 취소할 수 있습니다.",
            },
            {
              term: `결제 후 ${WITHDRAWAL_DAYS}일 이내는 전액 환불`,
              desc: "전자상거래 등에서의 소비자보호에 관한 법률 제17조에 따른 청약철회 기간입니다. 이 기간에는 위약금을 떼지 않습니다.",
            },
            {
              term: `촬영 ${REFUND_WINDOW_DAYS}일 전까지는 절반 환불`,
              desc: "그 뒤로는 작가가 그날을 비워 둔 상태라 환불이 어렵습니다.",
            },
            {
              term: "천재지변이나 작가 사정이면 전액",
              desc: "이동이 불가능한 수준의 천재지변, 작가가 약속을 지키지 못한 경우에는 전액 돌려드립니다.",
            },
            {
              term: "판단은 사매가 합니다",
              desc: "환불 여부를 작가가 정하지 않습니다. 예약 카드의 [사매에 문의]로 접수하면 사매가 확인하고 처리합니다.",
            },
          ]}
          footnote="기준은 결제일과 촬영일 두 시계로 판정하며, 법정 청약철회 기간이 위약금 규정보다 우선합니다."
        />

        <footer className="mt-12 border-t border-line pt-6">
          <p className="text-body-sm leading-relaxed text-muted">
            여기 적힌 내용과 다르게 진행되는 일이 있으면 예약 카드의 [사매에 문의]로 알려
            주세요. 사매가 확인합니다.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              href="/privacy"
              className="ed-more rounded-full border border-line bg-surface px-4 py-2 text-body-sm font-semibold"
            >
              개인정보 처리방침
            </Link>
            <Link
              href="/"
              className="ed-more rounded-full border border-line bg-surface px-4 py-2 text-body-sm font-semibold"
            >
              사진 보러 가기
            </Link>
          </div>
        </footer>
      </div>
    </main>
  );
}
