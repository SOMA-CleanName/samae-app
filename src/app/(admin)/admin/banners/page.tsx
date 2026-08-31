import { listAllBanners, safeBannerHref } from "@/lib/banners";
import { Badge, EmptyState } from "@/components/ui";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { ConfirmForm } from "@/components/admin/ConfirmForm";
import { LayersIcon } from "@/components/user/icons";
import { BannerUploader } from "./BannerUploader";
import {
  createBanner,
  updateBanner,
  toggleBannerPublished,
  moveBanner,
  deleteBanner,
} from "./actions";

export const dynamic = "force-dynamic";

// datetime-local 입력용 — ISO → "YYYY-MM-DDTHH:mm" (로컬 시각)
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function isLive(b: { published: boolean; starts_at: string | null; ends_at: string | null }) {
  const now = Date.now();
  if (!b.published) return false;
  if (b.starts_at && new Date(b.starts_at).getTime() > now) return false;
  if (b.ends_at && new Date(b.ends_at).getTime() <= now) return false;
  return true;
}

// 홈 배너 관리 — 운영자가 이미지·링크·순서·노출 기간을 관리한다. 홈(/)·카테고리(/c/슬러그) 상단 캐러셀에 반영.
export default async function AdminBannersPage() {
  const banners = await listAllBanners();
  const liveCount = banners.filter(isLive).length;

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-5">
      <h1 className="text-h1 font-semibold">홈 배너</h1>
      <p className="mt-1 text-body-sm text-muted">
        홈과 카테고리 페이지 최상단 캐러셀에 노출돼요. 지금 노출 중 <b className="text-fg">{liveCount}</b>장 · 2장
        이상이면 5초마다 자동으로 넘어갑니다.
      </p>

      {/* 생성 */}
      <form action={createBanner} className="mt-5 rounded-2xl border border-line bg-surface p-4">
        <p className="text-body-sm font-semibold">새 배너</p>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <BannerUploader />
          </div>
          <LabeledInput name="title" label="제목 (대체텍스트)" placeholder="가을 프로필 촬영 이벤트" required />
          <LabeledInput name="link_url" label="링크 (선택)" placeholder="/c/snap 또는 https://…" />
          <LabeledInput name="starts_at" label="노출 시작 (선택)" type="datetime-local" />
          <LabeledInput name="ends_at" label="노출 종료 (선택)" type="datetime-local" />
        </div>
        <label className="mt-3 flex cursor-pointer items-center gap-2 text-body-sm">
          <input type="checkbox" name="published" className="h-4 w-4 accent-brand" defaultChecked />
          바로 공개
        </label>
        <SubmitButton
          pendingText="추가 중…"
          className="mt-3 cursor-pointer rounded-lg bg-fg px-4 py-2 text-body-sm font-semibold text-bg transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          배너 추가
        </SubmitButton>
      </form>

      {/* 목록 */}
      {banners.length === 0 ? (
        <EmptyState className="mt-6" icon={<LayersIcon className="h-7 w-7" />} title="아직 배너가 없어요" />
      ) : (
        <ul className="mt-6 flex flex-col gap-3">
          {banners.map((b, i) => {
            const href = safeBannerHref(b.link_url);
            return (
              <li key={b.id} className="rounded-2xl border border-line bg-surface p-4">
                <div className="flex flex-col gap-3 sm:flex-row">
                  <div className="w-full shrink-0 overflow-hidden rounded-xl border border-line sm:w-56">
                    {/* eslint-disable-next-line @next/next/no-img-element -- 외부 Storage 프리뷰, 최적화 불필요 */}
                    <img
                      src={b.thumb_url ?? b.image_url}
                      alt={b.title || "배너"}
                      className="aspect-[16/9] w-full object-cover"
                    />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-title font-semibold text-fg">{b.title || "(제목 없음)"}</p>
                      {isLive(b) ? (
                        <Badge tone="success">노출 중</Badge>
                      ) : (
                        <Badge tone="neutral">{b.published ? "기간 밖" : "비공개"}</Badge>
                      )}
                      <span className="text-caption text-faint">{i + 1}번째</span>
                    </div>
                    {b.link_url && !href && (
                      <p className="mt-1 text-caption text-danger">
                        링크 형식이 올바르지 않아 클릭이 비활성화돼요 (내부 경로 /… 또는 https:// 만 가능).
                      </p>
                    )}

                    {/* 수정 */}
                    <form action={updateBanner} className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                      <input type="hidden" name="id" value={b.id} />
                      <LabeledInput name="title" label="제목" defaultValue={b.title} />
                      <LabeledInput name="link_url" label="링크" defaultValue={b.link_url ?? ""} />
                      <LabeledInput
                        name="starts_at"
                        label="노출 시작"
                        type="datetime-local"
                        defaultValue={toLocalInput(b.starts_at)}
                      />
                      <LabeledInput
                        name="ends_at"
                        label="노출 종료"
                        type="datetime-local"
                        defaultValue={toLocalInput(b.ends_at)}
                      />
                      <div className="sm:col-span-2">
                        <SubmitButton
                          pendingText="저장 중…"
                          className="cursor-pointer rounded-lg border border-line px-3 py-1.5 text-caption font-semibold transition-colors hover:bg-fg/[0.05] disabled:opacity-50"
                        >
                          저장
                        </SubmitButton>
                      </div>
                    </form>

                    {/* 공개 토글 · 순서 · 삭제 */}
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <form action={toggleBannerPublished}>
                        <input type="hidden" name="id" value={b.id} />
                        <input type="hidden" name="published" value={String(b.published)} />
                        <SubmitButton
                          pendingText="…"
                          className="cursor-pointer rounded-lg border border-line px-3 py-1.5 text-caption font-semibold transition-colors hover:bg-fg/[0.05] disabled:opacity-50"
                        >
                          {b.published ? "비공개로" : "공개로"}
                        </SubmitButton>
                      </form>
                      <MoveButton id={b.id} dir="up" disabled={i === 0} label="↑" />
                      <MoveButton id={b.id} dir="down" disabled={i === banners.length - 1} label="↓" />
                      <ConfirmForm
                        action={deleteBanner}
                        message="이 배너를 삭제할까요? 이미지도 함께 지워집니다."
                        className="ml-auto"
                      >
                        <input type="hidden" name="id" value={b.id} />
                        <SubmitButton
                          pendingText="삭제 중…"
                          className="cursor-pointer rounded-lg border border-danger/30 px-3 py-1.5 text-caption font-semibold text-danger transition-colors hover:bg-danger/10 disabled:opacity-50"
                        >
                          삭제
                        </SubmitButton>
                      </ConfirmForm>
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}

function MoveButton({
  id,
  dir,
  disabled,
  label,
}: {
  id: string;
  dir: "up" | "down";
  disabled: boolean;
  label: string;
}) {
  return (
    <form action={moveBanner}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="dir" value={dir} />
      {/* SubmitButton 은 disabled 를 받지 않아(useFormStatus 전용) 양 끝 배너는 평범한 버튼으로 잠근다 */}
      <button
        type="submit"
        disabled={disabled}
        aria-label={dir === "up" ? "위로" : "아래로"}
        className="cursor-pointer rounded-lg border border-line px-3 py-1.5 text-caption font-semibold transition-colors hover:bg-fg/[0.05] disabled:cursor-default disabled:opacity-40"
      >
        {label}
      </button>
    </form>
  );
}

function LabeledInput({
  label,
  ...props
}: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-caption text-muted">{label}</span>
      <input
        {...props}
        className="rounded-lg border border-line bg-bg px-3 py-2 text-body-sm outline-none focus:border-fg/40"
      />
    </label>
  );
}
