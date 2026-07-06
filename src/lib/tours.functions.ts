import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const CreateTourInput = z.object({
  title: z.string().min(1).max(120),
  captureType: z.enum(["photos", "video"]),
});

export const createTour = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => CreateTourInput.parse(data))
  .handler(async ({ data, context }) => {
    const { data: tour, error } = await context.supabase
      .from("tours")
      .insert({
        user_id: context.userId,
        title: data.title,
        status: "uploading",
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    return {
      ok: true as const,
      tourId: tour.id as string,
    };
  });

const TourIdInput = z.object({ tourId: z.string().uuid() });

export const startProcessing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        tourId: z.string().uuid(),
        sourcePaths: z.array(z.string()).min(1),
        captureType: z.enum(["photos", "video"]),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { data: tour, error } = await context.supabase
      .from("tours")
      .select("id, user_id")
      .eq("id", data.tourId)
      .maybeSingle();
    if (error || !tour) throw new Error("Tour not found");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { kiriUploadPhotos, kiriUploadVideo } = await import("./kiri.server");

    // Fetch uploaded files from Supabase Storage (private bucket) via service role.
    const downloaded: Array<{ name: string; blob: Blob }> = [];
    for (const path of data.sourcePaths) {
      const { data: file, error: dlErr } = await supabaseAdmin.storage
        .from("tour-uploads")
        .download(path);
      if (dlErr || !file) throw new Error(`Failed to load ${path}: ${dlErr?.message ?? "no data"}`);
      downloaded.push({ name: path.split("/").pop() ?? "file", blob: file });
    }

    let serialize: string;
    try {
      if (data.captureType === "video") {
        const res = await kiriUploadVideo({ file: downloaded[0] });
        serialize = res.serialize;
      } else {
        const res = await kiriUploadPhotos({ files: downloaded });
        serialize = res.serialize;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "KIRI upload failed";
      await context.supabase
        .from("tours")
        .update({ status: "failed", source_paths: data.sourcePaths, error_message: message })
        .eq("id", data.tourId);
      return { ok: false as const, error: message };
    }

    const { error: updErr } = await context.supabase
      .from("tours")
      .update({
        status: "processing",
        source_paths: data.sourcePaths,
        luma_slug: serialize,
        luma_capture_id: serialize,
      })
      .eq("id", data.tourId);
    if (updErr) throw new Error(updErr.message);

    return { ok: true as const };
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

    const { kiriGetStatus, kiriGetModelZip } = await import("./kiri.server");
    try {
      const { status } = await kiriGetStatus(tour.luma_slug);
      // 3 = successful, 2 = failed, 5 = expired
      if (status === 3) {
        const { modelUrl } = await kiriGetModelZip(tour.luma_slug);
        const { data: updated } = await context.supabase
          .from("tours")
          .update({ status: "ready", embed_url: modelUrl })
          .eq("id", tour.id)
          .select("id, status, embed_url, thumbnail_url, luma_slug")
          .single();
        return updated ?? tour;
      }
      if (status === 2 || status === 5) {
        await context.supabase
          .from("tours")
          .update({ status: "failed", error_message: status === 5 ? "Model expired" : "KIRI processing failed" })
          .eq("id", tour.id);
        return { ...tour, status: "failed" as const };
      }
      return tour;
    } catch {
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