import { listAllSpots } from "@/lib/spots-db";
import { createSpot, updateSpot, toggleSpotPublished, deleteSpot } from "./actions";

export const dynamic = "force-dynamic";

const FIELD = "w-full rounded-lg border border-line px-3 py-2 text-sm";

/**
 * 촬영 장소 관리 — 비공개 포함.
 *
 * Q&A 와 같이 한 지면에서 다 편집한다. 항목이 22건 규모라 목록↔편집 왕복이 더 번거롭다.
 */
export default async function AdminSpotsPage() {
  const spots = await listAllSpots();

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <header className="mb-6">
        <h1 className="text-xl font-bold tracking-tight">촬영 장소</h1>
        <p className="mt-1.5 text-sm text-muted">
          <code>/spots</code> 와 매거진 SPOTS 레일에 실립니다.
        </p>
        {/*
          켜는 기준을 화면에 박아 둔다.

          이 기준은 마이그레이션 주석(0112)과 파일 시절 주석에만 있었다. 운영자가
          보는 자리에 없으면 지켜지지 않는다 — 검증 안 된 장소 정보는 SEO 가 아니라
          리스크다(틀리면 사람을 헛걸음시킨다).
        */}
        <div className="mt-3 rounded-lg border border-warning/30 bg-warning-soft/40 p-3 text-[13px] leading-relaxed text-warning-ink">
          <b>공개로 켜는 기준</b>
          <ol className="mt-1 list-decimal space-y-0.5 pl-4">
            <li>그 장소에서 실제로 찍힌 공개 사진이 <b>9장 이상</b></li>
            <li><b>공공장소</b>일 것 — 캠퍼스·경기장·사유지는 촬영 허가 규정이 따로 있습니다</li>
            <li>주소·최인접 역은 <b>출처로 확인한 것만</b> (아래 출처 칸에 남기세요)</li>
          </ol>
          <p className="mt-1.5">
            날짜가 박힌 정보(“추석 당일 무료” 같은)는 쓰지 않습니다 — 웹은 계속 남습니다.
          </p>
        </div>
      </header>

      <form action={createSpot} className="mb-8 rounded-xl border border-line p-4">
        <label className="block text-xs font-semibold text-muted">새 장소</label>
        <div className="mt-2 grid grid-cols-[minmax(0,1fr)] gap-2 sm:grid-cols-2">
          <input name="name" required placeholder="이름 (예: 을지로 인쇄 골목)" className={FIELD} />
          <input name="slug" placeholder="주소 조각 (영문, 비우면 이름에서 생성)" className={FIELD} />
          <input name="city" placeholder="시·도 (기본 서울)" className={FIELD} />
          <input name="area" placeholder="자치구 (예: 중구)" className={FIELD} />
        </div>
        <button
          type="submit"
          className="mt-2 min-h-10 rounded-lg bg-fg px-4 text-sm font-semibold text-bg"
        >
          만들기
        </button>
        <p className="mt-2 text-xs text-muted">비공개로 만들어집니다.</p>
      </form>

      {spots.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted">아직 장소가 없어요.</p>
      ) : (
        <ul className="space-y-3">
          {spots.map((s) => (
            <li key={s.id} className="rounded-xl border border-line p-4">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                    s.published ? "bg-success-soft text-success-ink" : "bg-fg/10 text-muted"
                  }`}
                >
                  {s.published ? "공개" : "비공개"}
                </span>
                <span className="rounded-full bg-fg/[0.06] px-2 py-0.5 text-[11px] text-muted">
                  {s.city} {s.area}
                </span>
                {!s.source && (
                  <span className="rounded-full bg-warning-soft px-2 py-0.5 text-[11px] text-warning-ink">
                    출처 없음 — 공개 불가
                  </span>
                )}
                <span className="ml-auto truncate text-[11px] text-faint">/spots/{s.slug}</span>
              </div>

              <form action={updateSpot} className="space-y-2">
                <input type="hidden" name="id" value={s.id} />
                <div className="grid grid-cols-[minmax(0,1fr)] gap-2 sm:grid-cols-2">
                  <input name="name" defaultValue={s.name} className={`${FIELD} font-semibold`} />
                  <input name="address" defaultValue={s.address} placeholder="주소" className={FIELD} />
                  <input name="city" defaultValue={s.city} className={FIELD} />
                  <input name="area" defaultValue={s.area} className={FIELD} />
                  <input
                    name="station"
                    defaultValue={s.station ?? ""}
                    placeholder="최인접 역·출구 (없으면 비워 두세요)"
                    className={FIELD}
                  />
                  <input
                    name="keywords"
                    defaultValue={s.keywords.join(", ")}
                    placeholder="사진 매칭 키워드 (쉼표로)"
                    className={FIELD}
                  />
                </div>
                <textarea
                  name="descr"
                  defaultValue={s.desc}
                  rows={2}
                  placeholder="소개 — 왜 이 장소에서 사진이 잘 나오는지"
                  className={`${FIELD} leading-relaxed`}
                />
                <textarea
                  name="tip"
                  defaultValue={s.tip}
                  rows={2}
                  placeholder="팁 — 시간대·허가·주의사항"
                  className={`${FIELD} leading-relaxed`}
                />
                <input
                  name="source"
                  defaultValue={s.source}
                  placeholder="출처 — 무엇으로 확인했는지 (공개하려면 필수)"
                  className={FIELD}
                />
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-1.5 text-xs text-muted">
                    순서
                    <input
                      name="sort_order"
                      type="number"
                      defaultValue={s.sortOrder}
                      className="w-16 rounded-lg border border-line px-2 py-1.5 text-sm tabular-nums"
                    />
                  </label>
                  <button
                    type="submit"
                    className="ml-auto min-h-9 rounded-lg bg-fg px-3 text-sm font-semibold text-bg"
                  >
                    저장
                  </button>
                </div>
              </form>

              <div className="mt-3 flex items-center gap-2 border-t border-line pt-3">
                <form action={toggleSpotPublished}>
                  <input type="hidden" name="id" value={s.id} />
                  <input type="hidden" name="next" value={s.published ? "0" : "1"} />
                  <button className="min-h-9 rounded-lg border border-line px-3 text-sm font-semibold">
                    {s.published ? "비공개로" : "공개하기"}
                  </button>
                </form>
                {/* 삭제는 되돌릴 수 없다 — 버튼이 아니라 글씨로, 오른쪽 끝에 치워 둔다 */}
                <form action={deleteSpot} className="ml-auto">
                  <input type="hidden" name="id" value={s.id} />
                  <button className="min-h-9 px-2 text-sm text-danger-ink hover:underline">
                    삭제
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
