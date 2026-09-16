// 지급명세서 CSV — **주민등록번호가 평문으로 나가는 유일한 자리.**
//
// 그래서 여기만 지키면 된다:
//   · 어드민인지 확인한다 (레이아웃 가드만 믿지 않는다 — 라우트는 레이아웃을 안 탄다)
//   · 번호는 `readResidentNo()` 로만 연다. 그 함수가 **로그를 먼저 남기고** 연다
//   · 로그를 못 남기면 그 사람 번호는 마스킹인 채로 나간다 — 기록 없는 열람을 만들지 않는다
//   · 브라우저·프록시가 들고 있지 않게 no-store
//
// 파일이 손을 떠난 뒤는 우리가 통제할 수 없다. 화면에서 "신고 후 지우라" 고 말하는 이유다.

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { readResidentNo } from "@/lib/resident-no-access";
import { loadWithholdingPayments } from "@/lib/withholding-query";
import { groupByPerson, periodRange, toCsv } from "@/lib/withholding-report";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const me = await getCurrentUser();
  if (!me || me.role !== "admin") {
    return new NextResponse("운영자 권한이 필요합니다.", { status: 403 });
  }

  const period = new URL(request.url).searchParams.get("period") ?? "";
  if (!periodRange(period)) {
    return new NextResponse("기간 형식이 올바르지 않습니다 (YYYY-MM).", { status: 400 });
  }

  const people = groupByPerson(await loadWithholdingPayments(period));
  if (people.length === 0) {
    return new NextResponse("그 달에 원천징수한 지급이 없습니다.", { status: 404 });
  }

  // 사람 수만큼 연다. 한 번에 다 열지 않고 실패한 사람만 마스킹으로 떨어뜨린다 —
  // 한 명 때문에 신고서 전체를 못 만들면 기한을 넘긴다.
  const plain = new Map<string, string>();
  for (const p of people) {
    try {
      const no = await readResidentNo({
        photographerId: p.photographerId,
        actorId: me.id,
        purpose: "withholding_report",
      });
      if (no) plain.set(p.photographerId, no);
    } catch {
      // 접근 기록을 못 남겼다 → 열지 않는다 (resident-no-access 가 그렇게 막는다)
    }
  }

  const csv = toCsv(people, (id) => plain.get(id) ?? null);
  const filename = `지급명세서_${period}.csv`;

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      // 한글 파일명은 filename* 로만 안전하게 전달된다
      "Content-Disposition": `attachment; filename="withholding-${period}.csv"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "no-store, max-age=0",
    },
  });
}
