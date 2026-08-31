"use client";

import { useActionState, useCallback, useEffect, useRef, useState } from "react";
import { downscaleImage } from "@/lib/downscale";
import { mpTrack } from "@/lib/mixpanel";
import {
  ADULT_AGE,
  CASTING_MOODS,
  MIN_AGE,
  PHOTO_MAX,
  PICK_MAX,
  ageGate,
  type CastingPickPhoto,
  type CastingRound,
} from "@/lib/casting";
import { submitCastingApplication, type CastingState } from "./actions";
import { CastingPhotoPicker } from "./CastingPhotoPicker";

const initial: CastingState = {};
const DRAFT_KEY = "casting_draft_v1";
const STEPS = ["기본 정보", "사진 고르기", "내 사진·컨셉", "동의"] as const;

/** sessionStorage 에 남기는 초안 — 로그인 리다이렉트를 건너뛰어도 입력이 살아남게. 파일은 담지 않는다. */
type Draft = {
  name: string;
  phone: string;
  birthDate: string;
  gender: string;
  region: string;
  photoIds: string[];
  moodTags: string[];
  conceptNote: string;
};

const emptyDraft = (name = ""): Draft => ({
  name,
  phone: "",
  birthDate: "",
  gender: "",
  region: "",
  photoIds: [],
  moodTags: [],
  conceptNote: "",
});

export function CastingForm({
  round,
  photos,
  photographerCount,
  isLoggedIn,
  defaultName,
}: {
  round: CastingRound;
  photos: CastingPickPhoto[];
  photographerCount: number;
  isLoggedIn: boolean;
  defaultName: string;
}) {
  const [state, formAction, pending] = useActionState(submitCastingApplication, initial);
  const [step, setStep] = useState(0);
  const [d, setD] = useState<Draft>(() => emptyDraft(defaultName));

  // 파일은 sessionStorage 에 담을 수 없으므로, 파일을 다루는 3단계부터 로그인을 요구한다.
  // (1~2단계는 비로그인으로 두는 게 콜드 트래픽 이탈 방지에 중요하다)
  const [photoPaths, setPhotoPaths] = useState<string[]>([]);
  const [photoPreviews, setPhotoPreviews] = useState<string[]>([]);
  const [consentPath, setConsentPath] = useState<string>("");
  const [consentFileName, setConsentFileName] = useState<string>("");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const [consents, setConsents] = useState({
    participate: false,
    sns: false,
    paidAd: false,
    credit: false,
    notifyNextRound: true,
  });
  const [guardian, setGuardian] = useState({ name: "", phone: "", relation: "" });

  const gate = d.birthDate ? ageGate(d.birthDate) : null;
  const isMinor = gate?.kind === "minor";
  const tooYoung = gate?.kind === "too_young";

  // ── 초안 복원 ────────────────────────────────────────────────
  // sessionStorage 는 서버에 없으므로 useState 초기화로는 읽을 수 없다(하이드레이션 불일치).
  // 마운트 후 1회 읽어 넣는 것이 유일한 방법 — set-state-in-effect 규칙의 알려진 예외 케이스다.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<Draft> & { step?: number };
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 위 주석 참고
      setD((prev) => ({ ...prev, ...parsed, name: parsed.name || prev.name }));
      // 로그인하고 돌아온 경우 멈췄던 자리로
      if (typeof parsed.step === "number") setStep(Math.min(parsed.step, STEPS.length - 1));
    } catch {
      // 초안이 깨졌으면 조용히 무시하고 빈 폼으로 시작
    }
  }, []);

  const saveDraft = useCallback(
    (next: Draft, atStep: number) => {
      try {
        sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ ...next, step: atStep }));
      } catch {
        // 용량 초과 등 — 저장 실패가 폼을 막지 않게
      }
    },
    [],
  );

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => {
    setD((prev) => {
      const next = { ...prev, [k]: v };
      saveDraft(next, step);
      return next;
    });
  };

  // 접수 성공 시 초안 폐기
  useEffect(() => {
    if (state.ok) {
      try {
        sessionStorage.removeItem(DRAFT_KEY);
      } catch {
        /* noop */
      }
    }
  }, [state.ok]);

  // 어느 단계에서 이탈하는지 — 폼 개선의 유일한 근거
  const lastStep = useRef(0);
  useEffect(() => {
    lastStep.current = step;
  }, [step]);
  useEffect(() => {
    const onLeave = () => {
      if (!state.ok) mpTrack("Casting Abandon", { round_slug: round.slug, last_step: lastStep.current + 1 });
    };
    window.addEventListener("pagehide", onLeave);
    return () => window.removeEventListener("pagehide", onLeave);
  }, [round.slug, state.ok]);

  const go = (next: number) => {
    setStep(next);
    saveDraft(d, next);
    mpTrack("Casting Step", { round_slug: round.slug, step: next + 1 });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // ── 단계별 통과 조건 ──────────────────────────────────────────
  const step1Ok =
    d.name.trim().length > 0 &&
    d.phone.trim().length > 0 &&
    d.region.trim().length > 0 &&
    gate !== null &&
    (gate.kind === "adult" || gate.kind === "minor");
  const step2Ok = d.photoIds.length > 0;
  const step3Ok = photoPaths.length > 0;
  const step4Ok =
    consents.participate && (!isMinor || (guardian.name.trim() && guardian.phone.trim()));

  // ── 업로드 ───────────────────────────────────────────────────
  const upload = async (file: File, kind: "photo" | "consent"): Promise<string | null> => {
    setUploadError(null);
    setUploading(true);
    try {
      // 이미지면 브라우저에서 먼저 줄인다(HEIC 정규화 + 업로드 실패 감소). PDF는 그대로.
      const payload = file.type === "application/pdf" ? file : await downscaleImage(file, 1600, 0.85);
      const fd = new FormData();
      fd.append("file", payload);
      fd.append("kind", kind);
      fd.append("roundSlug", round.slug);
      const res = await fetch("/api/casting/upload", { method: "POST", body: fd });
      const json = (await res.json()) as { ok?: boolean; path?: string; error?: string };
      if (!res.ok || !json.path) {
        setUploadError(json.error ?? "업로드에 실패했어요.");
        return null;
      }
      return json.path;
    } catch {
      setUploadError("업로드에 실패했어요. 네트워크를 확인해주세요.");
      return null;
    } finally {
      setUploading(false);
    }
  };

  const onPickPhotos = async (files: FileList | null) => {
    if (!files?.length) return;
    const room = PHOTO_MAX - photoPaths.length;
    for (const file of Array.from(files).slice(0, room)) {
      const path = await upload(file, "photo");
      if (!path) return;
      setPhotoPaths((p) => [...p, path]);
      setPhotoPreviews((p) => [...p, URL.createObjectURL(file)]);
    }
  };

  const onPickConsent = async (file: File | null) => {
    if (!file) return;
    const path = await upload(file, "consent");
    if (!path) return;
    setConsentPath(path);
    setConsentFileName(file.name);
  };

  // 3단계 진입 = 로그인 필요 지점
  const enterStep3 = () => {
    if (!isLoggedIn) {
      saveDraft(d, 2); // 돌아오면 3단계부터
      mpTrack("Casting Login Gate", { round_slug: round.slug });
      window.location.href = "/login?next=/casting";
      return;
    }
    go(2);
  };

  if (state.ok) {
    return (
      <div className="mt-6 rounded-2xl border border-success/30 bg-success-soft p-6">
        <p className="text-base font-semibold text-success">신청이 접수됐어요!</p>
        <p className="mt-1.5 text-sm text-fg/70">
          결과는 접수 마감 후 한 번에 알려드려요.
          {isMinor && " 보호자 동의서를 아직 안 올리셨다면 마감 전까지 올려주세요 — 없으면 선정될 수 없어요."}
        </p>
        <a href="/casting/my" className="mt-4 inline-block text-sm font-medium underline underline-offset-4">
          내 신청 내용 보기
        </a>
      </div>
    );
  }

  const payload = JSON.stringify({
    roundSlug: round.slug,
    name: d.name.trim(),
    phone: d.phone.trim(),
    birthDate: d.birthDate,
    gender: d.gender || undefined,
    region: d.region.trim(),
    photoIds: d.photoIds,
    moodTags: d.moodTags,
    conceptNote: d.conceptNote.trim() || undefined,
    photoPaths,
    consentParticipate: consents.participate,
    consentSns: consents.sns,
    consentPaidAd: consents.paidAd,
    consentCredit: consents.credit,
    guardianName: isMinor ? guardian.name.trim() : undefined,
    guardianPhone: isMinor ? guardian.phone.trim() : undefined,
    guardianRelation: isMinor ? guardian.relation.trim() || undefined : undefined,
    guardianConsentPath: isMinor ? consentPath || undefined : undefined,
    notifyNextRound: consents.notifyNextRound,
    landingPath: typeof window !== "undefined" ? window.location.pathname : undefined,
  });

  return (
    <div className="mt-7">
      <Progress step={step} />

      {/* ── STEP 1 · 기본 정보 ───────────────────────────────── */}
      {step === 0 && (
        <Panel>
          <Field label="이름" required value={d.name} onChange={(v) => set("name", v)} placeholder="실명을 입력해주세요" />
          <Field
            label="연락처"
            required
            type="tel"
            inputMode="tel"
            value={d.phone}
            onChange={(v) => set("phone", v)}
            placeholder="010-1234-5678"
          />
          <div className="flex flex-col gap-1.5">
            <Label required>생년월일</Label>
            <input
              type="date"
              value={d.birthDate}
              onChange={(e) => set("birthDate", e.target.value)}
              className="h-12 rounded-xl border border-line-strong bg-surface px-4 text-sm outline-none transition-colors focus:border-fg/45"
            />
            {tooYoung ? (
              <p className="text-xs text-brand">
                만 {MIN_AGE}세 이상부터 신청하실 수 있어요. 조금 더 자란 뒤에 다시 만나요!
              </p>
            ) : isMinor ? (
              <p className="text-xs text-warning">
                만 {gate?.age}세 — 미성년자는 보호자 동의가 필요해요. 마지막 단계에서 안내드릴게요.
              </p>
            ) : (
              <p className="text-xs text-fg/45">촬영 가능 여부 확인에만 써요.</p>
            )}
          </div>
          <Field
            label="촬영 가능 지역"
            required
            value={d.region}
            onChange={(v) => set("region", v)}
            placeholder="예: 서울 전역, 경기 남부"
          />
          <div className="flex flex-col gap-1.5">
            <Label>성별 <span className="text-xs font-normal text-fg/40">선택</span></Label>
            <div className="flex gap-2">
              {["여성", "남성", "응답 안 함"].map((g) => (
                <Chip key={g} on={d.gender === g} onClick={() => set("gender", d.gender === g ? "" : g)}>
                  {g}
                </Chip>
              ))}
            </div>
          </div>
          <Next disabled={!step1Ok || tooYoung} onClick={() => go(1)}>다음</Next>
        </Panel>
      )}

      {/* ── STEP 2 · 사진 고르기 ─────────────────────────────── */}
      {/* 작가 이름이 아니라 사진을 고르게 한다. 사람은 이름이 아니라 이미지로 취향을 판단한다. */}
      {step === 1 && (
        <Panel>
          <div>
            <p className="text-sm font-semibold">이런 사진 찍고 싶어요</p>
            <p className="mt-1.5 text-xs leading-relaxed text-fg/50">
              마음에 드는 사진을 최대 {PICK_MAX}장 골라주세요. 참여 작가 {photographerCount}명의 실제 작업이에요.
              고르신 사진의 작가님과 매칭해드려요 — 희망 사항이라 실제 배정은 일정에 따라 달라질 수 있어요.
            </p>
          </div>

          <CastingPhotoPicker
            photos={photos}
            selected={d.photoIds}
            photographerCount={photographerCount}
            onToggle={(id) =>
              set("photoIds", d.photoIds.includes(id) ? d.photoIds.filter((x) => x !== id) : [...d.photoIds, id])
            }
          />

          <div className="flex gap-2">
            <Back onClick={() => go(0)} />
            <Next disabled={!step2Ok} onClick={enterStep3}>
              {isLoggedIn ? "다음" : "로그인하고 계속"}
            </Next>
          </div>
          {!isLoggedIn && (
            <p className="text-center text-xs text-fg/45">지금까지 쓰신 내용은 그대로 남아 있어요.</p>
          )}
        </Panel>
      )}

      {/* ── STEP 3 · 사진·컨셉 ───────────────────────────────── */}
      {step === 2 && (
        <Panel>
          <div>
            <p className="text-sm font-semibold">사진을 올려주세요 <span className="text-xs text-brand">필수</span></p>
            <p className="mt-1.5 text-xs leading-relaxed text-fg/50">
              전신 1장과 얼굴이 잘 보이는 사진이면 충분해요. 최대 {PHOTO_MAX}장. 보정 안 된 사진이 더 좋아요.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {photoPreviews.map((src, i) => (
              <div key={src} className="relative aspect-[3/4] overflow-hidden rounded-xl border border-line">
                {/* 로컬 blob 미리보기 — next/image 최적화 대상이 아니라 img 사용 */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt="" className="h-full w-full object-cover" />
                <button
                  type="button"
                  onClick={() => {
                    setPhotoPaths((p) => p.filter((_, x) => x !== i));
                    setPhotoPreviews((p) => p.filter((_, x) => x !== i));
                  }}
                  className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-black/55 text-xs text-white"
                  aria-label="사진 삭제"
                >
                  ✕
                </button>
              </div>
            ))}
            {photoPaths.length < PHOTO_MAX && (
              <label className="grid aspect-[3/4] cursor-pointer place-items-center rounded-xl border border-dashed border-line-strong text-xs text-fg/45 hover:border-fg/40">
                {uploading ? "올리는 중…" : "+ 사진"}
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  disabled={uploading}
                  onChange={(e) => onPickPhotos(e.target.files)}
                />
              </label>
            )}
          </div>
          {uploadError && <p className="text-xs text-brand">{uploadError}</p>}

          <div className="flex flex-col gap-1.5">
            <Label>어떤 무드를 원하세요? <span className="text-xs font-normal text-fg/40">선택</span></Label>
            <div className="flex flex-wrap gap-1.5">
              {CASTING_MOODS.map((m) => (
                <Chip
                  key={m}
                  on={d.moodTags.includes(m)}
                  onClick={() =>
                    set("moodTags", d.moodTags.includes(m) ? d.moodTags.filter((x) => x !== m) : [...d.moodTags, m])
                  }
                >
                  {m}
                </Chip>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>하고 싶은 이야기 <span className="text-xs font-normal text-fg/40">선택</span></Label>
            <textarea
              rows={3}
              maxLength={1000}
              value={d.conceptNote}
              onChange={(e) => set("conceptNote", e.target.value)}
              placeholder="찍고 싶은 컨셉, 경험, 가능한 요일 등 자유롭게 적어주세요."
              className="resize-none rounded-xl border border-line-strong bg-surface px-4 py-3 text-sm outline-none transition-colors placeholder:text-fg/30 focus:border-fg/45"
            />
          </div>

          <div className="flex gap-2">
            <Back onClick={() => go(1)} />
            <Next disabled={!step3Ok || uploading} onClick={() => go(3)}>다음</Next>
          </div>
        </Panel>
      )}

      {/* ── STEP 4 · 동의 ────────────────────────────────────── */}
      {step === 3 && (
        <form action={formAction}>
          <input type="hidden" name="payload" value={payload} />
          <Panel>
            <div>
              <p className="text-sm font-semibold">동의해주세요</p>
              <p className="mt-1.5 text-xs leading-relaxed text-fg/50">
                촬영 참여만 동의하고 <b className="font-semibold text-fg/70">SNS 게시·광고는 동의하지 않으셔도</b> 신청할 수 있어요.
                사진은 전부 그대로 받으세요.
              </p>
            </div>

            <Check
              on={consents.participate}
              onClick={() => setConsents((c) => ({ ...c, participate: !c.participate }))}
              required
              title="촬영 참여에 동의합니다"
              desc="선정되면 협의된 일정에 촬영에 참여해요."
            />
            <Check
              on={consents.sns}
              onClick={() => setConsents((c) => ({ ...c, sns: !c.sns }))}
              title="사매 SNS 게시에 동의합니다"
              desc="사매 공식 계정과 서비스 소개 자료에 사진이 올라갈 수 있어요. 언제든 내려달라고 하실 수 있어요."
            />
            <Check
              on={consents.paidAd}
              onClick={() => setConsents((c) => ({ ...c, paidAd: !c.paidAd }))}
              title="유료 광고 사용에 동의합니다"
              desc="사매의 유료 광고 소재로 쓰일 수 있어요."
            />
            <Check
              on={consents.credit}
              onClick={() => setConsents((c) => ({ ...c, credit: !c.credit }))}
              title="모델 크레딧 표기에 동의합니다"
              desc="게시물에 이름을 모델 크레딧으로 적어드려요."
            />

            {isMinor && (
              <div className="flex flex-col gap-3 rounded-2xl border border-warning/30 bg-warning-soft p-4">
                <div>
                  <p className="text-sm font-semibold">보호자 동의가 필요해요</p>
                  <p className="mt-1.5 text-xs leading-relaxed text-fg/60">
                    만 {ADULT_AGE}세 미만은 보호자 동의 없이 촬영할 수 없어요.
                    지금은 <b className="font-semibold text-fg/80">보호자 연락처만</b> 남겨주셔도 신청이 접수돼요.
                    동의서는 마감 전까지 올려주시면 되는데, <b className="font-semibold text-fg/80">없으면 선정될 수 없어요.</b>
                  </p>
                </div>
                <Field label="보호자 성명" required value={guardian.name} onChange={(v) => setGuardian((g) => ({ ...g, name: v }))} placeholder="보호자 이름" />
                <Field label="보호자 연락처" required type="tel" inputMode="tel" value={guardian.phone} onChange={(v) => setGuardian((g) => ({ ...g, phone: v }))} placeholder="010-1234-5678" />
                <Field label="관계" value={guardian.relation} onChange={(v) => setGuardian((g) => ({ ...g, relation: v }))} placeholder="예: 모, 부" />

                <div className="flex flex-col gap-1.5">
                  <Label>보호자 서명 동의서 <span className="text-xs font-normal text-fg/40">선택 · 마감 전까지</span></Label>
                  <a href="/casting/consent" target="_blank" rel="noreferrer" className="text-xs font-medium underline underline-offset-4">
                    동의서 양식 열기 (인쇄용)
                  </a>
                  <label className="mt-1 inline-flex h-11 cursor-pointer items-center justify-center rounded-xl border border-dashed border-line-strong text-xs text-fg/55 hover:border-fg/40">
                    {uploading ? "올리는 중…" : consentFileName ? `✓ ${consentFileName}` : "서명한 동의서 올리기 (사진 또는 PDF)"}
                    <input
                      type="file"
                      accept="image/*,application/pdf"
                      className="hidden"
                      disabled={uploading}
                      onChange={(e) => onPickConsent(e.target.files?.[0] ?? null)}
                    />
                  </label>
                </div>
              </div>
            )}

            <Check
              on={consents.notifyNextRound}
              onClick={() => setConsents((c) => ({ ...c, notifyNextRound: !c.notifyNextRound }))}
              title="다음 회차 알림 받기"
              desc="이번에 선정되지 않아도 다음 회차가 열리면 알려드려요."
            />

            {state.error && <p className="text-sm font-medium text-brand">{state.error}</p>}

            <div className="flex gap-2">
              <Back onClick={() => go(2)} />
              <button
                type="submit"
                disabled={!step4Ok || pending || uploading}
                className="h-12 flex-[2] rounded-xl bg-brand text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
              >
                {pending ? "보내는 중…" : "신청하기"}
              </button>
            </div>
          </Panel>
        </form>
      )}
    </div>
  );
}

/* ── 프리미티브 ─────────────────────────────────────────────── */

function Progress({ step }: { step: number }) {
  return (
    <div className="mb-5 flex items-center gap-1.5">
      {STEPS.map((s, i) => (
        <div key={s} className="flex-1">
          <div className={`h-1 rounded-full transition-colors ${i <= step ? "bg-fg" : "bg-fg/10"}`} />
          <p className={`mt-1.5 text-[10px] ${i === step ? "font-semibold text-fg" : "text-fg/35"}`}>{s}</p>
        </div>
      ))}
    </div>
  );
}

function Panel({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col gap-4">{children}</div>;
}

function Label({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <span className="flex items-center gap-1.5 text-sm font-medium text-fg/80">
      {children}
      {required && <span className="text-xs font-medium text-brand">필수</span>}
    </span>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  required,
  type = "text",
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
  type?: string;
  inputMode?: "tel" | "text";
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label required={required}>{label}</Label>
      <input
        type={type}
        inputMode={inputMode}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-12 rounded-xl border border-line-strong bg-surface px-4 text-sm outline-none transition-colors placeholder:text-fg/30 focus:border-fg/45"
      />
    </div>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3.5 py-2 text-xs font-medium transition-colors ${
        on ? "border-fg bg-fg text-bg" : "border-line-strong text-fg/65 hover:border-fg/40"
      }`}
    >
      {children}
    </button>
  );
}

function Check({
  on,
  onClick,
  title,
  desc,
  required,
}: {
  on: boolean;
  onClick: () => void;
  title: string;
  desc: string;
  required?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`flex gap-3 rounded-2xl border p-4 text-left transition-colors ${
        on ? "border-fg/40 bg-fg/[0.03]" : "border-line hover:border-line-strong"
      }`}
    >
      <span
        className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md border text-[12px] font-bold ${
          on ? "border-fg bg-fg text-bg" : "border-line-strong text-transparent"
        }`}
      >
        ✓
      </span>
      <span className="flex-1">
        <span className="flex items-center gap-1.5 text-sm font-medium">
          {title}
          {required && <span className="text-xs font-medium text-brand">필수</span>}
        </span>
        <span className="mt-1 block text-xs leading-relaxed text-fg/50">{desc}</span>
      </span>
    </button>
  );
}

function Next({ disabled, onClick, children }: { disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="h-12 flex-[2] rounded-xl bg-brand text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function Back({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="h-12 flex-1 rounded-xl border border-line-strong text-sm font-medium text-fg/70 transition-colors hover:border-fg/40"
    >
      이전
    </button>
  );
}
