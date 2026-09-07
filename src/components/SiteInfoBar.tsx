import Link from "next/link";
import { businessInfoRows } from "@/lib/business-info";

/**
 * 운영 주체 표시 줄 — 지면 **맨 위**, 데스크톱에서만.
 *
 * 처음엔 푸터로 뒀는데 홈·탐색이 무한 스크롤이라 아래에 두면 영영 닿지 않는다.
 * 심사도 사용자도 "보이는 곳" 에 있어야 의미가 있어서 위로 올렸다.
 *
 * 모바일에서는 그리지 않는다. 좁은 화면에서 이 줄은 첫 화면의 사진을 밀어내기만 하고,
 * 결제채널 심사는 브라우저로 사이트를 열어 확인하므로 데스크톱에 있으면 요건은 충족된다.
 */
export function SiteInfoBar() {
  const rows = businessInfoRows();

  return (
    <div className="hidden border-b border-line bg-surface font-kr md:block">
      {/* 로고를 얹지 않는다 — 바로 아래 지면이 자기 판권면(samae)을 이미 갖고 있어 두 번 나온다. */}
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-5 gap-y-1 px-6 py-2">
        {/*
          사업자 정보 — 결제채널 심사가 사이트의 상호·사업자번호를 채널 등록 정보와 대조한다.
          ⚠️ 지우지 말 것. 값은 lib/business-info 한 곳에서만 고친다.
        */}
        <dl className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] leading-none text-muted">
          {rows.map((row) => (
            <div key={row.label} className="flex items-center gap-1.5">
              <dt className="text-faint">{row.label}</dt>
              <dd>{row.value}</dd>
            </div>
          ))}
        </dl>

        <Link
          href="/privacy"
          className="ml-auto text-[11px] leading-none text-muted transition-colors hover:text-brand"
        >
          개인정보 처리방침
        </Link>
      </div>
    </div>
  );
}
