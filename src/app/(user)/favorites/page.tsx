import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fetchPhotographersByIds } from "@/lib/discovery";
import { PhotographerCardView } from "@/components/user/PhotographerCard";

export const dynamic = "force-dynamic";

// 찜한 작가 목록
export default async function FavoritesPage() {
  const me = await getCurrentUser();
  if (!me) redirect("/login?next=/favorites");

  const supabase = await createClient();
  const { data: favs } = await supabase
    .from("favorites")
    .select("target_id")
    .eq("profile_id", me.id)
    .eq("target_type", "photographer")
    .order("created_at", { ascending: false });

  const ids = (favs ?? []).map((f) => f.target_id as string);
  const photographers = await fetchPhotographersByIds(ids);

  return (
    <main className="mx-auto max-w-6xl px-4 sm:px-6 py-8 font-kr">
      <h1 className="text-2xl font-semibold">찜한 작가</h1>
      {photographers.length === 0 ? (
        <p className="mt-10 text-center text-sm text-fg/45">
          아직 찜한 작가가 없어요. 탐색에서 마음에 드는 작가를 찜해보세요.
        </p>
      ) : (
        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {photographers.map((p) => (
            <PhotographerCardView key={p.handle} p={p} />
          ))}
        </div>
      )}
    </main>
  );
}
