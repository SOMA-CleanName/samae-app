"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ApplyFormBody, ApplyPendingBody } from "@/app/(user)/apply/ApplyBodies";
import { applyFieldErrors, parseApplyForm, type ApplyLeadState } from "@/app/(user)/apply/schema";
import { ConsentBody } from "@/app/(auth)/signup/consent/ConsentBody";
import { SignupForm } from "@/app/(auth)/signup/SignupForm";
import ContactForm from "@/app/(auth)/signup/contact/ContactForm";
import type { RequestCodeState, VerifyCodeState } from "@/app/(auth)/signup/contact/actions";
import { AgreeGate } from "@/app/(photographer)/studio/AgreeGate";
import { PHOTOGRAPHER_AGREEMENT_VERSIONS } from "@/lib/policy-version";
import type { BusinessType } from "@/lib/platform-fee";
import { readFlow, resetFlow, writeFlow, EMPTY, type FlowState, type FlowStage } from "./store";

// 샌드박스의 클라이언트 섬들 — **화면은 전부 실제 컴포넌트**이고 여기서는 액션만 갈아 끼운다.
//
// 지면 자체는 page.tsx(서버 컴포넌트)가 그린다. 그래야 가입 지면의 AuthShell(사진 벽을
// DB 에서 읽는 async 서버 컴포넌트)을 진짜로 쓸 수 있다. 처음엔 전부 클라이언트로 만들어
// 그 화면을 손으로 흉내 냈는데, 그러면 **실제와 다른 화면을 QA 하게 된다.**

/** 샌드박스 인증번호 — 문자를 안 보내므로 고정값을 화면에 적어 둔다 */
export const SANDBOX_OTP = "000000";

const STAGES: { key: FlowStage; label: string }[] = [
  { key: "intro", label: "① 안내" },
  { key: "signup", label: "② 가입" },
  { key: "consent", label: "③ 약관" },
  { key: "contact", label: "④ 연락처" },
  { key: "form", label: "⑤ 신청 폼" },
  { key: "pending", label: "⑥ 승인 대기" },
  { key: "agree", label: "⑦ 입점 동의" },
  { key: "done", label: "⑧ 완료" },
];

/**
 * 단계 이동은 라우팅으로 — 서버가 그 단계의 진짜 지면을 그려야 한다.
 *
 * `next=/apply` 를 같이 달고 다닌다. 가입·로그인 지면의 표제는 **어디서 왔는지(next)에
 * 따라 달라지는데**(SignupHeadline → "작가로 시작하기"), 이걸 빼면 샌드박스만 손님용
 * 카피("사진부터 고르고…")를 보여준다 — 실제 작가 경로와 다른 화면이 된다.
 */
function useGo() {
  const router = useRouter();
  return (stage: FlowStage) => {
    router.push(`/dev/flow?stage=${stage}&next=%2Fapply`);
    router.refresh();
  };
}

/** localStorage 는 서버에 없다 — 마운트 후에 읽는다 */
function useFlow(): FlowState {
  const [flow, setFlow] = useState<FlowState>(EMPTY);
  useEffect(() => {
    const sync = () => setFlow(readFlow());
    const frame = requestAnimationFrame(sync);
    window.addEventListener("samae:dev-flow", sync);
    window.addEventListener("storage", sync);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("samae:dev-flow", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  return flow;
}

// ── 상단 단계 막대 ────────────────────────────────────────────
export function FlowBar({ stage }: { stage: FlowStage }) {
  const go = useGo();
  return (
    <div className="fixed inset-x-0 top-0 z-50 border-b border-line bg-surface/95 backdrop-blur">
      <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-1.5 px-3 py-2.5">
        <span className="mr-1 text-[0.65rem] font-semibold uppercase tracking-wider text-brand">
          sandbox
        </span>
        {STAGES.map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => go(s.key)}
            className={`cursor-pointer rounded-lg px-2 py-1 text-[0.7rem] font-medium transition-colors ${
              stage === s.key ? "bg-fg text-bg" : "bg-fg/[0.06] hover:bg-fg/10"
            }`}
          >
            {s.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => {
            resetFlow();
            go("intro");
          }}
          className="ml-auto cursor-pointer rounded-lg px-2 py-1 text-[0.7rem] text-muted underline underline-offset-2 hover:text-fg"
        >
          초기화
        </button>
      </div>
    </div>
  );
}

// ── ① 안내 — 실제 ApplyIntro 를 그대로 받아 감싸기만 한다 ────────
export function SandboxIntroShim({ children }: { children: ReactNode }) {
  const go = useGo();
  return (
    <div
      // ApplyIntro 의 [작가 신청 시작하기]·[이미 계정이 있어요] 는 /signup·/login 으로 나간다.
      // 샌드박스 밖으로 나가면 안 되므로 클릭만 가로챈다. 화면은 손대지 않는다.
      onClickCapture={(e) => {
        const a = (e.target as HTMLElement).closest("a");
        if (!a) return;
        const href = a.getAttribute("href") ?? "";
        if (href.startsWith("/signup") || href.startsWith("/login")) {
          e.preventDefault();
          go("signup");
        }
      }}
    >
      {children}
    </div>
  );
}

// ── ② 가입 — 실제 SignupForm, 카카오 동작만 교체 ────────────────
export function SandboxSignupForm() {
  const go = useGo();
  return (
    <>
      <SignupForm onKakaoOverride={() => go("consent")} />
      <p className="mt-5 rounded-xl border border-dashed border-line-strong p-3 text-xs leading-relaxed text-brand">
        샌드박스 — 이 버튼만 실제와 다릅니다. 카카오는 진짜 인가가 필요해 태울 수 없어서
        <b> 가입됐다 치고</b> 넘어갑니다. 지면·버튼·문구는 실제 /signup 그대로예요.
      </p>
    </>
  );
}

// ── ③ 약관 — 실제 ConsentBody ────────────────────────────────
export function SandboxConsent({ termsVersion }: { termsVersion: string }) {
  const go = useGo();
  const action = async (fd: FormData): Promise<void> => {
    if (fd.get("terms") !== "on" || fd.get("privacy") !== "on") {
      throw new Error("서비스 이용약관과 개인정보 처리방침에 모두 동의해야 계속할 수 있어요.");
    }
    const prev = readFlow();
    writeFlow({
      ...prev,
      stage: "contact",
      signup: {
        agreedTerms: true,
        agreedPrivacy: true,
        phone: prev.signup?.phone ?? "",
        at: new Date().toISOString(),
      },
    });
    go("contact");
  };
  return (
    <ConsentBody next="/apply" termsVersion={termsVersion} displayName="QA작가" action={action} />
  );
}

// ── ④ 연락처 — 실제 ContactForm, OTP 만 교체(문자 안 나감) ───────
export function SandboxContact() {
  const go = useGo();
  const requestAction = async (
    _p: RequestCodeState | null,
    fd: FormData
  ): Promise<RequestCodeState> => {
    const raw = String(fd.get("phone") ?? "").replace(/\D/g, "");
    if (raw.length < 10) return { ok: false, error: "휴대폰 번호를 정확히 입력해주세요." };
    // devCode 는 실제 액션도 dev 스텁 발송에서 쓰는 필드 — 화면이 그대로 코드를 보여준다
    return { ok: true, error: null, phone: raw, devCode: SANDBOX_OTP };
  };
  const verifyAction = async (
    _p: VerifyCodeState | null,
    fd: FormData
  ): Promise<VerifyCodeState> => {
    if (String(fd.get("code") ?? "") !== SANDBOX_OTP) {
      return { ok: false, error: `샌드박스 인증번호는 ${SANDBOX_OTP} 입니다.` };
    }
    const prev = readFlow();
    writeFlow({
      ...prev,
      signup: {
        agreedTerms: prev.signup?.agreedTerms ?? true,
        agreedPrivacy: prev.signup?.agreedPrivacy ?? true,
        phone: String(fd.get("phone") ?? ""),
        at: prev.signup?.at ?? new Date().toISOString(),
      },
    });
    return { ok: true, error: null };
  };
  return (
    <>
      <p className="mx-auto max-w-sm px-6 pt-4 text-xs text-brand">
        샌드박스 — 문자는 나가지 않습니다. 인증번호는 <b>{SANDBOX_OTP}</b>
      </p>
      <ContactForm
        next="/apply"
        displayName="QA작가"
        requestAction={requestAction}
        verifyAction={verifyAction}
        onDone={() => go("form")}
      />
    </>
  );
}

// ── ⑤ 신청 폼 — 실제 ApplyFormBody ───────────────────────────
export function SandboxApply({ kakaoChannelUrl }: { kakaoChannelUrl: string }) {
  const action = async (_prev: ApplyLeadState, fd: FormData): Promise<ApplyLeadState> => {
    const parsed = parseApplyForm(fd);
    if (!parsed.success) {
      return { error: "입력값을 확인해주세요.", fieldErrors: applyFieldErrors(parsed.error.issues) };
    }
    const v = parsed.data;
    writeFlow({
      ...readFlow(),
      stage: "pending",
      application: {
        displayName: v.displayName,
        portfolioUrl: v.portfolioUrl,
        phone: v.phone,
        bio: v.bio ?? "",
        submittedAt: new Date().toISOString(),
      },
    });
    // 실제로도 여기서 화면을 옮기지 않는다 — 폼 자리에 "접수됐어요" 가 뜨고 카카오 채널
    // 단계가 남는다. 그 화면까지 보고 막대로 ⑥ 으로 넘어간다.
    return { ok: true };
  };
  return <ApplyFormBody kakaoChannelUrl={kakaoChannelUrl} action={action} />;
}

// ── ⑥ 승인 대기 — 실제 ApplyPendingBody + 운영자 역할 버튼 ──────
export function SandboxPendingShim() {
  const go = useGo();
  const flow = useFlow();
  return (
    <>
      <ApplyPendingBody displayName={flow.application?.displayName ?? "QA작가"} />
      <div className="mx-auto max-w-lg px-3.5 pb-10 sm:px-5">
        <div className="rounded-2xl border border-dashed border-line-strong p-4">
          <p className="text-xs font-semibold text-brand">샌드박스 — 운영자 역할</p>
          <p className="mt-1 text-xs leading-relaxed text-muted">
            실제로는 어드민이 <code>/admin/photographers</code> 에서 [승인] 을 누릅니다.
          </p>
          <button
            type="button"
            onClick={() => go("agree")}
            className="mt-3 w-full cursor-pointer rounded-xl bg-fg py-2.5 text-sm font-semibold text-bg transition-opacity hover:opacity-90"
          >
            승인 처리하기
          </button>
        </div>
      </div>
    </>
  );
}

// ── ⑦ 입점 동의 — 실제 AgreeGate ─────────────────────────────
export function SandboxAgree() {
  const go = useGo();
  const flow = useFlow();
  const submit = async (fd: FormData): Promise<void> => {
    // 실제 액션과 같은 조건으로 막는다 — 문서별 열람 증적이 없으면 거절
    for (const key of ["contract", "terms", "fee", "refund"]) {
      if (fd.get(`agree_${key}`) !== "on") throw new Error("문서 4종에 모두 동의해야 해요.");
    }
    let docRecords: Record<string, { openedAt?: string; agreedAt?: string }> = {};
    try {
      docRecords = JSON.parse(String(fd.get("docRecords") ?? ""));
    } catch {
      throw new Error("열람 기록이 없어요. 문서를 전문으로 읽고 다시 동의해주세요.");
    }
    for (const key of ["contract", "terms", "fee", "refund"]) {
      if (!docRecords[key]?.openedAt || !docRecords[key]?.agreedAt) {
        throw new Error("문서를 전문으로 읽어야 동의할 수 있어요.");
      }
    }
    const legalName = String(fd.get("legalName") ?? "").trim();
    const businessType = String(fd.get("businessType") ?? "");
    if (!legalName) throw new Error("성명 또는 상호를 입력해주세요.");
    if (!businessType) throw new Error("사업자 유형을 선택해주세요.");
    writeFlow({
      ...readFlow(),
      stage: "done",
      agreement: {
        versions: { ...PHOTOGRAPHER_AGREEMENT_VERSIONS },
        legalName,
        businessType,
        businessNo: String(fd.get("businessNo") ?? ""),
        promoConsent: fd.get("promoConsent") === "on",
        agreedAt: new Date().toISOString(),
        docRecords,
      },
    });
    go("done");
  };
  return (
    <AgreeGate
      displayName={flow.application?.displayName ?? "QA작가"}
      initial={{
        legalName: "",
        businessType: "" as BusinessType | "",
        businessNo: "",
        promoConsent: false,
      }}
      reason="first"
      submit={submit}
    />
  );
}

// ── ⑧ 완료 — 샌드박스 전용 요약(실제에는 없는 화면) ─────────────
export function SandboxDone() {
  const go = useGo();
  const flow = useFlow();
  const g = flow.agreement;
  return (
    <main className="mx-auto max-w-lg px-3.5 py-10 font-kr sm:px-5">
      <h1 className="text-2xl font-semibold">동의 완료</h1>
      <p className="mt-2 text-sm text-muted">
        실제라면 여기서 스튜디오가 열립니다. 아래는{" "}
        <b className="font-semibold text-fg">이번 회차에 기록됐을</b> 내용이에요 — 이 화면만
        샌드박스 전용입니다.
      </p>

      <Block title="가입">
        <Row k="약관 동의" v={flow.signup?.agreedTerms ? "O" : "—"} />
        <Row k="처리방침" v={flow.signup?.agreedPrivacy ? "O" : "—"} />
        <Row k="연락처" v={flow.signup?.phone || "—"} />
        <Row k="시각" v={flow.signup?.at} />
      </Block>

      <Block title="신청서">
        <Row k="작가명" v={flow.application?.displayName} />
        <Row k="포트폴리오" v={flow.application?.portfolioUrl} />
        <Row k="전화번호" v={flow.application?.phone} />
        <Row k="소개" v={flow.application?.bio || "—"} />
      </Block>

      <Block title="입점 동의 기록">
        <Row k="성명/상호" v={g?.legalName} />
        <Row k="사업자 유형" v={g?.businessType} />
        <Row k="사업자번호" v={g?.businessNo || "—"} />
        <Row k="홍보 동의" v={g?.promoConsent ? "O" : "X"} />
        <Row k="동의 시각" v={g?.agreedAt} />
        <Row k="버전" v={g ? JSON.stringify(g.versions) : "—"} />
      </Block>

      <Block title="문서별 열람·동의 증적">
        {g?.docRecords
          ? Object.entries(g.docRecords).map(([k, v]) => (
              <Row key={k} k={k} v={`읽음 ${v.openedAt?.slice(11, 19)} · 동의 ${v.agreedAt?.slice(11, 19)}`} />
            ))
          : <Row k="—" v="없음" />}
      </Block>

      <button
        type="button"
        onClick={() => {
          resetFlow();
          go("intro");
        }}
        className="mt-8 w-full cursor-pointer rounded-xl border border-line-strong py-3 text-sm font-medium transition-colors hover:bg-fg/[0.04]"
      >
        처음부터 다시
      </button>
    </main>
  );
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-6 rounded-2xl border border-line p-4">
      <p className="text-sm font-semibold">{title}</p>
      <dl className="mt-2.5 flex flex-col gap-1.5">{children}</dl>
    </section>
  );
}

function Row({ k, v }: { k: string; v?: string }) {
  return (
    <div className="flex gap-3 text-xs">
      <dt className="w-20 shrink-0 text-faint">{k}</dt>
      <dd className="min-w-0 flex-1 break-all">{v ?? "—"}</dd>
    </div>
  );
}
