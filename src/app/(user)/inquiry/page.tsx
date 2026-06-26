import { notFound, redirect } from "next/navigation";
import { fetchPhotoById, fetchPhotographerById } from "@/lib/discovery";
import { getCurrentUser } from "@/lib/auth";
import { InquiryChat } from "./InquiryChat";

export const dynamic = "force-dynamic";

export default async function InquiryPage({
  searchParams,
}: {
  searchParams?: Promise<{ photographerId?: string; photoId?: string }>;
}) {
  const sp = (await searchParams) ?? {};
  const photographerId = sp.photographerId ?? "";
  const photoId = sp.photoId ?? "";
  if (!photographerId) notFound();

  const [me, photographer] = await Promise.all([
    getCurrentUser(),
    fetchPhotographerById(photographerId),
  ]);
  if (!photographer) notFound();
  if (me?.photographer?.id === photographerId) redirect("/studio");

  const photo = photoId ? await fetchPhotoById(photoId) : null;
  const photoSrc = photo ? photo.thumb_url ?? photo.src_url : null;

  return (
    <main className="bg-bg">
      <InquiryChat photographerId={photographerId} photoId={photoId} photoSrc={photoSrc} />
    </main>
  );
}
