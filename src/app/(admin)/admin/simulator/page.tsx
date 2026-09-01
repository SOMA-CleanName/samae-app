import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { loadSimState, SIM_CUSTOMER_EMAIL } from "@/lib/sim-room";
import { Simulator } from "./Simulator";

export const dynamic = "force-dynamic";

// 채팅방 시뮬레이터 — 고객 화면과 작가 화면을 나란히 두고 흐름을 걸어본다.
//
// 브라우저 하나로 두 사람이 동시에 로그인할 수 없어서(쿠키 공유) 실제 페이지를
// 그대로 띄우지는 못한다. 대신 **같은 DB 를 보는 두 개의 화면**을 시뮬레이터가 직접 그리고,
// 어드민 권한으로 양쪽을 대신 조작한다. 봇 응답·검열·인계는 실제 코드가 그대로 돈다.
export default async function SimulatorPage({
  searchParams,
}: {
  searchParams?: Promise<{ p?: string }>;
}) {
  const me = await getCurrentUser();
  if (me?.role !== "admin") redirect("/");

  const sp = (await searchParams) ?? {};
  const state = await loadSimState(sp.p ?? null);

  return (
    <main className="min-h-dvh bg-bg px-4 py-6 font-kr md:px-8">
      <header className="mx-auto mb-6 max-w-6xl">
        <h1 className="text-title font-bold text-fg">채팅방 시뮬레이터</h1>
        <p className="mt-1 text-body-sm text-muted">
          고객 화면과 작가 화면을 나란히 두고 문의부터 상담까지 걸어봅니다. 대화는 실제
          테이블에 들어가고 봇도 실제로 답합니다 —{" "}
          <span className="font-medium text-fg">{SIM_CUSTOMER_EMAIL}</span> 계정만 조작합니다.
        </p>
      </header>

      {!state.customer.id ? (
        <div className="mx-auto max-w-6xl rounded-2xl border border-warning/30 bg-warning-soft p-5 text-body-sm text-warning-ink">
          역할극 고객 계정(<b>{SIM_CUSTOMER_EMAIL}</b>)이 없어 시뮬레이터를 열 수 없어요.
          <br />
          <code className="text-caption">node scripts/add-qa-accounts.cjs</code> 로 만든 뒤 다시
          들어와주세요.
        </div>
      ) : (
        <Simulator state={state} />
      )}
    </main>
  );
}
