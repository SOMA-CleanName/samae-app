"use client";

import { useState } from "react";
import { EmptyState } from "@/components/ui";
import { LayersIcon } from "@/components/user/icons";
import type { TagUsage, GeneratedTagUsage } from "@/lib/tags";
import { TagTable } from "./TagTable";
import { GeneratedTagTable } from "./GeneratedTagTable";

type Props = {
  publicTags: TagUsage[];
  publicPhotoCount: number;
  mappedTagCount: number;
  generatedTags: GeneratedTagUsage[];
  generatedPhotoCount: number;
};

// 공개 태그(mood_tags) / 숨김 태그(generated_tags) 탭 전환.
export function TagsTabs({
  publicTags,
  publicPhotoCount,
  mappedTagCount,
  generatedTags,
  generatedPhotoCount,
}: Props) {
  const [tab, setTab] = useState<"public" | "generated">("public");

  return (
    <div className="mt-5">
      <div className="flex gap-1.5">
        <TabButton active={tab === "public"} onClick={() => setTab("public")}>
          공개 태그 <span className="tabular-nums text-faint">{publicTags.length}</span>
        </TabButton>
        <TabButton active={tab === "generated"} onClick={() => setTab("generated")}>
          숨김 태그(검색용) <span className="tabular-nums text-faint">{generatedTags.length}</span>
        </TabButton>
      </div>

      {tab === "public" ? (
        <>
          <p className="mt-4 text-body-sm text-muted">
            작가가 사진에 단 공개 태그예요. ‘미매핑’은 어떤 카테고리에도 연결돼 있지 않아요.
          </p>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-caption text-muted">
            <span>
              고유 태그 <b className="text-fg">{publicTags.length}</b>
            </span>
            <span>
              매핑됨 <b className="text-fg">{mappedTagCount}</b>
            </span>
            <span>
              집계 사진 <b className="text-fg">{publicPhotoCount}</b>
            </span>
          </div>
          {publicTags.length === 0 ? (
            <EmptyState className="mt-6" icon={<LayersIcon className="h-7 w-7" />} title="아직 사용된 태그가 없어요" />
          ) : (
            <TagTable tags={publicTags} />
          )}
        </>
      ) : (
        <>
          <p className="mt-4 text-body-sm text-muted">
            사용자에겐 안 보이고 검색·추천에만 쓰이는 태그예요(AI/배치 생성). 잘못된 태그는 이름변경·병합하거나 전역 삭제하세요.
          </p>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-caption text-muted">
            <span>
              고유 태그 <b className="text-fg">{generatedTags.length}</b>
            </span>
            <span>
              태그 달린 사진 <b className="text-fg">{generatedPhotoCount}</b>
            </span>
          </div>
          {generatedTags.length === 0 ? (
            <EmptyState
              className="mt-6"
              icon={<LayersIcon className="h-7 w-7" />}
              title="아직 생성된 숨김 태그가 없어요"
            />
          ) : (
            <GeneratedTagTable tags={generatedTags} />
          )}
        </>
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={`rounded-full px-3.5 py-1.5 text-body-sm font-medium transition-colors ${
        active ? "bg-fg text-bg" : "bg-fg/[0.06] text-muted hover:text-fg"
      }`}
    >
      {children}
    </button>
  );
}
