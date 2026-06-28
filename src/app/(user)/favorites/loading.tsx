import { MasonrySkeleton } from "@/components/user/skeletons";

export default function Loading() {
  return (
    <div>
      {/* 탭바 자리 */}
      <div className="mx-auto flex max-w-screen-2xl gap-2 px-2.5 pt-4 sm:px-4">
        <div className="h-8 w-20 animate-pulse rounded-full bg-surface-2" />
        <div className="h-8 w-20 animate-pulse rounded-full bg-surface-2" />
      </div>
      <MasonrySkeleton count={12} />
    </div>
  );
}
