import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const CreateTourInput = z.object({
  title: z.string().min(1).max(120),
  fileNames: z.array(z.string().min(1)).min(1).max(200),
  captureType: z.enum(["photos", "video"]),
});

export const createTour = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => CreateTourInput.parse(data))
  .handler(async ({ data, context }) => {
    const { lumaCreateCapture } = await import("./luma.server");
    const luma = await lumaCreateCapture(data);

    const { data: tour, error } = await context.supabase
      .from("tours")
      .insert({
        user_id: context.userId,
        title: data.title,
        status: "uploading",
        luma_slug: luma.capture.slug,
        luma_capture_id: luma.capture.slug,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    return {
      tourId: tour.id as string,
      slug: luma.capture.slug,
      signedUrls: luma.signedUrls,
    };
  });

const TourIdInput = z.object({ tourId: z.string().uuid() });

export const startProcessing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ tourId: z.string().uuid(), sourcePaths: z.array(z.string()) }).parse(data))
  .handler(async ({ data, context }) => {
    const { data: tour, error } = await context.supabase
      .from("tours")
      .select("luma_slug")
      .eq("id", data.tourId)
      .maybeSingle();
    if (error || !tour?.luma_slug) throw new Error("Tour not found");

    const { lumaTriggerProcess } = await import("./luma.server");
    await lumaTriggerProcess(tour.luma_slug);

    const { error: updErr } = await context.supabase
      .from("tours")
      .update({ status: "processing", source_paths: data.sourcePaths })
      .eq("id", data.tourId);
    if (updErr) throw new Error(updErr.message);

    return { ok: true };
  });

export const listTours = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("tours")
      .select("id, title, status, thumbnail_url, embed_url, created_at, error_message")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const getTour = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => TourIdInput.parse(data))
  .handler(async ({ data, context }) => {
    const { data: tour, error } = await context.supabase
      .from("tours")
      .select("*")
      .eq("id", data.tourId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!tour) throw new Error("Not found");
    return tour;
  });

export const pollTour = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => TourIdInput.parse(data))
  .handler(async ({ data, context }) => {
    const { data: tour, error } = await context.supabase
      .from("tours")
      .select("id, status, luma_slug, embed_url, thumbnail_url")
      .eq("id", data.tourId)
      .maybeSingle();
    if (error || !tour) throw new Error("Tour not found");
    if (tour.status === "ready" || tour.status === "failed" || !tour.luma_slug) return tour;

    const { lumaGetCapture, lumaEmbedUrl } = await import("./luma.server");
    try {
      const res = await lumaGetCapture(tour.luma_slug);
      const runStatus = (res.latestRun?.status ?? "").toLowerCase();
      const artifacts = res.latestRun?.artifacts ?? [];
      const thumb = artifacts.find((a) => a.type === "thumb" || a.type === "thumbnail")?.url;

      if (runStatus === "finished" || runStatus === "complete" || runStatus === "completed") {
        const embed = lumaEmbedUrl(tour.luma_slug);
        const { data: updated } = await context.supabase
          .from("tours")
          .update({ status: "ready", embed_url: embed, thumbnail_url: thumb ?? null })
          .eq("id", tour.id)
          .select("id, status, embed_url, thumbnail_url, luma_slug")
          .single();
        return updated ?? tour;
      }
      if (runStatus === "failed" || runStatus === "error") {
        await context.supabase.from("tours").update({ status: "failed", error_message: "Luma processing failed" }).eq("id", tour.id);
        return { ...tour, status: "failed" as const };
      }
      return tour;
    } catch (e) {
      // transient — leave status untouched
      return tour;
    }
  });

export const deleteTour = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => TourIdInput.parse(data))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("tours").delete().eq("id", data.tourId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });