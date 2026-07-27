"use server";

import { refresh } from "next/cache";

import { createClient } from "@/lib/supabase/server";

export async function deleteReview(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  // Fetch the storage path before the row disappears, so the object can go too.
  const { data: review } = await supabase
    .from("reviews")
    .select("resume_id, resumes(storage_path)")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  await supabase.from("reviews").delete().eq("id", id).eq("user_id", user.id);

  const storagePath = (review?.resumes as unknown as { storage_path: string }[] | null)?.[0]
    ?.storage_path;

  if (storagePath) {
    // Only remove the file if no other review still points at that resume.
    const { count } = await supabase
      .from("reviews")
      .select("id", { count: "exact", head: true })
      .eq("resume_id", review!.resume_id)
      .eq("user_id", user.id);

    if (!count) {
      await supabase.storage.from("resumes").remove([storagePath]);
      await supabase.from("resumes").delete().eq("id", review!.resume_id).eq("user_id", user.id);
    }
  }

  // These queries are per-user and uncached, so there is no cache tag to
  // invalidate — refresh() re-renders the client router with fresh data.
  // (updateTag/revalidateTag would be the call if the reads were cached; in
  // Next.js 16 revalidateTag also now requires a cacheLife argument.)
  refresh();
}
