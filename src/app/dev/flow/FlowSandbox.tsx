"use client";

import { useEffect, useState } from "react";
import { ApplyIntro } from "@/app/(user)/apply/ApplyIntro";
import { ApplyLeadForm } from "@/app/(user)/apply/ApplyLeadForm";
import { applyFieldErrors, parseApplyForm, type ApplyLeadState } from "@/app/(user)/apply/schema";
import { AgreeGate } from "@/app/(photographer)/studio/AgreeGate";
import { ConsentForm } from "@/app/(auth)/signup/consent/ConsentForm";
import ContactForm from "@/app/(auth)/signup/contact/ContactForm";
import type { RequestCodeState, VerifyCodeState } from "@/app/(auth)/signup/contact/actions";
import { KakaoButton } from "@/app/(auth)/AuthBits";
import { TERMS_VERSION } from "@/lib/policy-version";
import { PHOTOGRAPHER_AGREEMENT_VERSIONS } from "@/lib/policy-version";
import type { BusinessType } from "@/lib/platform-fee";
import { readFlow, resetFlow, setStage, writeFlow, EMPTY, type FlowState, type FlowStage } from "./store";

// 작가 온보딩 샌드박스 — **실제 화면 그대로, 저장만 localStorage.**
//
// 화면을 새로 그리지 않는다. `ApplyIntro` · `ApplyLeadForm` · `AgreeGate` 를 그대로
// 가져다 쓰고 액션만 갈아 끼운다. 복제하면 둘이 조용히 어긋나고, **어긋난 쪽을 QA 하게
// 된다** — 그게 QA 용 화면을 따로 만들 때 생기는 진짜 비용이다.
//
// 검증도 실제 것을 쓴다(`parseApplyForm`). "여기선 통과하는데 실제로는 막히는" 차이가
// 생기면 QA 로 안 잡힌다.
//
// 나가는 네트워크 요청이 **하나도 없다.** DB·디스코드·Mixpanel·문자 전부 안 건드린다.

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

export function FlowSandbox() {
  const [flow, setFlow] = useState<FlowState>(EMPTY);
  const [ready, setReady] = useState(false);

  // localStorage 는 서버에 없다 — 마운트 후에 읽는다(hydration 불일치 방지).
  // setState 를 이펙트 본문에서 바로 부르면 eslint(react-hooks/set-state-in-effect)가 막는다 —
  // rAF 한 번 미뤄서 커밋 이후에 쓴다.
  useEffect(() => {
    const sync = () => setFlow(readFlow());
    const frame = requestAnimationFrame(() => {
      sync();
      setReady(true);
    });
    window.addEventListener("samae:dev-flow", sync);
    window.addEventListener("storage", sync);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("samae:dev-flow", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  /** 약관 동의 — 실제 액션과 같은 조건으로 막는다 */
  const sandboxConsent = async (fd: FormData): Promise<void> => {
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
  };

  /** 연락처 OTP — **문자를 보내지 않는다.** 인증번호는 화면에 적어 둔 고정값 */
  const sandboxRequestCode = async (
    _p: RequestCodeState | null,
    fd: FormData
  ): Promise<RequestCodeState> => {
    const raw = String(fd.get("phone") ?? "").replace(/\D/g, "");
    if (raw.length < 10) return { ok: false, error: "휴대폰 번호를 정확히 입력해주세요." };
    // devCode 는 실제 액션도 dev 스텁 발송에서 쓰는 필드다 — 화면이 그대로 코드를 보여준다
    return { ok: true, error: null, phone: raw, devCode: SANDBOX_OTP };
  };
  const sandboxVerifyCode = async (
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

  /** 신청 제출 — 검증은 실제 스키마, 저장은 localStorage */
  const sandboxApply = async (
    _prev: ApplyLeadState,
    fd: FormData
  ): Promise<ApplyLeadState> => {
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
    return { ok: true };
  };

  /** 입점 동의 — 실제 액션과 같은 조건으로 막고, 저장만 localStorage */
  const sandboxAgree = async (fd: FormData): Promise<void> => {
    for (const key of ["contract", "terms", "fee", "refund"]) {
      if (fd.get(`agree_${key}`) !== "on") throw new Error("문서 4종에 모두 동의해야 해요.");
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
      },
    });
  };

  if (!ready) return null;

  return (
    <>
      <FlowBar flow={flow} />
      <div className="pt-[4.5rem]">
        {flow.stage === "intro" && <SandboxIntro />}
        {flow.stage === "signup" && <SandboxSignup />}
        {flow.stage === "consent" && (
          <main className="mx-auto max-w-sm px-5 py-12 font-kr">
            <h1 className="text-2xl font-bold tracking-tight">약관에 동의해 주세요</h1>
            <p className="mt-2 text-sm text-muted">
              사매를 이용하려면 아래 두 문서에 동의가 필요해요. 본문은 링크에서 읽을 수 있어요.
            </p>
            <ConsentForm next="/apply" termsVersion={TERMS_VERSION} action={sandboxConsent} />
          </main>
        )}
        {flow.stage === "contact" && (
          <>
            <p className="mx-auto max-w-sm px-6 pt-4 text-xs text-brand">
              샌드박스 — 문자는 나가지 않습니다. 인증번호는 <b>{SANDBOX_OTP}</b>
            </p>
            <ContactForm
              next="/apply"
              displayName="QA작가"
              requestAction={sandboxRequestCode}
              verifyAction={sandboxVerifyCode}
              onDone={() => setStage("form")}
            />
          </>
        )}
        {flow.stage === "form" && (
          <main className="mx-auto max-w-lg px-3.5 py-10 font-kr sm:px-5">
            <h1 className="text-2xl font-semibold">작가 신청</h1>
            <p className="mt-2 text-sm text-muted">
              아래 정보를 남기고 신청하면, 운영자 검토 후 작가로 등록돼 사진이 지면에 노출되고 의뢰를 받을 수 있어요.
            </p>
            <ApplyLeadForm kakaoChannelUrl="" action={sandboxApply} />
          </main>
        )}
        {flow.stage === "pending" && <SandboxPending flow={flow} />}
        {flow.stage === "agree" && (
          <AgreeGate
            displayName={flow.application?.displayName ?? "QA작가"}
            versions={PHOTOGRAPHER_AGREEMENT_VERSIONS}
            initial={{ legalName: "", businessType: "" as BusinessType | "", businessNo: "", promoConsent: false }}
            reason="first"
            submit={sandboxAgree}
          />
        )}
        {flow.stage === "done" && <SandboxDone flow={flow} />}
      </div>
    </>
  );
}

/** 샌드박스 인증번호 — 문자를 안 보내므로 고정값을 화면에 적어 둔다 */
const SANDBOX_OTP = "000000";

/**
 * 카카오 가입 — **여기만 실제와 다르다.**
 *
 * 카카오는 진짜 계정으로 진짜 인가를 받아야 해서 샌드박스가 태울 수 없다. 버튼 모양은
 * 실제 가입 지면(AuthShell + KakaoButton)과 같게 두고, 누르면 "가입됐다 치고" 통과시킨다.
 * 그 뒤의 약관 동의·연락처 등록은 전부 실제 화면이다 — 카카오 가입자가 실제로 밟는 순서다.
 */
function SandboxSignup() {
  return (
    <main className="mx-auto max-w-sm px-5 py-12 font-kr">
      <p className="font-display text-xl italic text-brand-ink">samae</p>
      <h1 className="mt-4 text-[1.75rem] font-bold leading-[1.3] tracking-tight">작가로 시작하기</h1>
      <p className="mt-3 text-body-sm leading-relaxed text-muted">
        가입하면 바로 신청서로 이어져요. 검토 후 사진이 지면에 노출됩니다.
      </p>
      <div className="mt-8">
        <KakaoButton onClick={() => setStage("consent")} label="카카오로 시작하기" track="cta:sandbox_kakao" />
        <p className="mt-2 text-center text-xs text-muted">별도 입력 없이 카카오 계정으로 바로 가입돼요</p>
      </div>
      <p className="mt-6 rounded-xl border border-dashed border-line-strong p-3 text-xs leading-relaxed text-brand">
        샌드박스 — 이 단계만 실제와 다릅니다. 카카오는 진짜 인가가 필요해 태울 수 없어서
        <b> 가입됐다 치고</b> 넘어갑니다. 다음 화면(약관·연락처)부터는 전부 실제 화면이에요.
      </p>
    </main>
  );
}

/** 안내 지면은 실제 컴포넌트를 그대로 쓰되, 버튼만 샌드박스 안에서 다음 단계로 간다 */
function SandboxIntro() {
  return (
    <div
      // ApplyIntro 의 [작가 신청 시작하기]·[이미 계정이 있어요] 는 /signup·/login 으로 나간다.
      // 샌드박스에서는 밖으로 나가면 안 되므로 클릭을 가로채 다음 단계로 보낸다.
      // 화면 자체는 손대지 않는다 — 그래야 실제와 같은 것을 본다.
      onClickCapture={(e) => {
        const a = (e.target as HTMLElement).closest("a");
        if (!a) return;
        const href = a.getAttribute("href") ?? "";
        if (href.startsWith("/signup") || href.startsWith("/login")) {
          e.preventDefault();
          setStage("signup");
        }
      }}
    >
      <ApplyIntro />
    </div>
  );
}

function SandboxPending({ flow }: { flow: FlowState }) {
  const a = flow.application;
  return (
    <main className="mx-auto max-w-lg px-3.5 py-10 font-kr sm:px-5">
      <h1 className="text-2xl font-semibold">작가 신청</h1>
      <div className="mt-6 rounded-2xl border border-warning/20 bg-warning-soft p-6">
        <p className="text-base font-semibold">승인 대기 중이에요</p>
        <p className="mt-1.5 text-sm text-muted">
          운영자 검토 후 안내드려요. 보통 영업일 기준 1~2일 소요됩니다.
        </p>
        <p className="mt-3 text-xs text-faint">신청 작가명: {a?.displayName}</p>
      </div>

      <div className="mt-6 rounded-2xl border border-dashed border-line-strong p-4">
        <p className="text-xs font-semibold text-brand">샌드박스 — 운영자 역할</p>
        <p className="mt-1 text-xs leading-relaxed text-muted">
          실제로는 어드민이 <code>/admin/photographers</code> 에서 [승인] 을 누릅니다.
        </p>
        <button
          type="button"
          onClick={() => setStage("agree")}
          className="mt-3 w-full cursor-pointer rounded-xl bg-fg py-2.5 text-sm font-semibold text-bg transition-opacity hover:opacity-90"
        >
          승인 처리하기
        </button>
      </div>
    </main>
  );
}

function SandboxDone({ flow }: { flow: FlowState }) {
  const g = flow.agreement;
  return (
    <main className="mx-auto max-w-lg px-3.5 py-10 font-kr sm:px-5">
      <h1 className="text-2xl font-semibold">동의 완료</h1>
      <p className="mt-2 text-sm text-muted">
        실제라면 여기서 스튜디오가 열립니다. 아래는 이번 회차에 <b className="font-semibold text-fg">기록됐을</b> 내용이에요.
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

      <button
        type="button"
        onClick={() => resetFlow()}
        className="mt-8 w-full cursor-pointer rounded-xl border border-line-strong py-3 text-sm font-medium transition-colors hover:bg-fg/[0.04]"
      >
        처음부터 다시
      </button>
    </main>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
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

/** 위에 붙는 단계 이동 막대 — 어느 단계든 바로 열어볼 수 있다 */
function FlowBar({ flow }: { flow: FlowState }) {
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
            onClick={() => setStage(s.key)}
            className={`cursor-pointer rounded-lg px-2 py-1 text-[0.7rem] font-medium transition-colors ${
              flow.stage === s.key ? "bg-fg text-bg" : "bg-fg/[0.06] hover:bg-fg/10"
            }`}
          >
            {s.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => resetFlow()}
          className="ml-auto cursor-pointer rounded-lg px-2 py-1 text-[0.7rem] text-muted underline underline-offset-2 hover:text-fg"
        >
          초기화
        </button>
      </div>
    </div>
  );
}
