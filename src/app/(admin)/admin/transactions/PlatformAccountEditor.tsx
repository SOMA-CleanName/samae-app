import { updatePlatformAccount } from "./actions";

/*
  사매 계좌 — **고객이 촬영비를 넣는 에스크로 계좌다.**

  ⚠️ 전에는 「입금·문의 관리」(/admin/inquiries) 에 있었다. 리드 모델 시절 그 화면이
     돈을 다루던 유일한 곳이어서인데, 리드가 끝난 뒤에도 편집기만 거기 남아 있었다.
     지금 이 계좌를 쓰는 건 예약 에스크로(`lib/platform-account` → `lib/payments`)라
     거래·정산 화면이 제자리다.

  ⚠️ **비어 있으면 고객 화면에 입금 안내가 아예 안 뜬다.** 예약을 수락해도 돈을 넣을
     곳이 없어서 거래가 그 자리에서 멈춘다. 그래서 미설정이면 펼친 채로 강조한다.
*/
export function PlatformAccountEditor({
  account,
  configured,
}: {
  account: { bank: string; number: string; holder: string; notice: string };
  configured: boolean;
}) {
  return (
    <details className="mt-5 rounded-2xl border border-line bg-surface" open={!configured}>
      <summary className="flex cursor-pointer flex-wrap items-center gap-2 px-4 py-3 text-body-sm font-medium">
        사매 입금 계좌
        {configured ? (
          <span className="text-caption text-faint">
            {account.bank} {account.number} · {account.holder}
          </span>
        ) : (
          <span className="text-caption font-semibold text-danger-ink">
            미설정 — 고객에게 입금 안내가 안 떠요
          </span>
        )}
      </summary>
      <p className="px-4 pb-3 text-caption leading-relaxed text-faint">
        고객이 예약을 수락하면 이 계좌가 안내돼요. 입금 후 고객이 [입금 완료] 를 누르면
        「입금 확인 대기」에 올라와요.
      </p>
      <form action={updatePlatformAccount} className="grid grid-cols-1 gap-2.5 px-4 pb-4 sm:grid-cols-3">
        <label className="block">
          <span className="mb-1 block text-caption text-muted">은행</span>
          <input name="bank" defaultValue={account.bank} placeholder="국민" className="w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-body-sm outline-none focus:border-fg/40" />
        </label>
        <label className="block sm:col-span-2">
          <span className="mb-1 block text-caption text-muted">계좌번호</span>
          <input name="number" defaultValue={account.number} placeholder="000000-00-000000" className="w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-body-sm tabular-nums outline-none focus:border-fg/40" />
        </label>
        <label className="block">
          <span className="mb-1 block text-caption text-muted">예금주</span>
          <input name="holder" defaultValue={account.holder} placeholder="사매" className="w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-body-sm outline-none focus:border-fg/40" />
        </label>
        <label className="block sm:col-span-2">
          <span className="mb-1 block text-caption text-muted">안내 문구 (선택)</span>
          <input name="notice" defaultValue={account.notice} placeholder="입금자명을 예약자 이름과 동일하게 적어주세요." className="w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-body-sm outline-none focus:border-fg/40" />
        </label>
        <div className="sm:col-span-3">
          <button className="cursor-pointer rounded-lg bg-fg px-4 py-2 text-body-sm font-semibold text-bg transition-opacity hover:opacity-90">
            계좌 저장
          </button>
        </div>
      </form>
    </details>
  );
}
