import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getTour, pollTour, deleteTour } from "@/lib/tours.functions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Copy,
  Loader2,
  Share2,
  Trash2,
} from "lucide-react";
import { useEffect } from "react";

export const Route = createFileRoute("/_authenticated/tour/$id")({
  head: () => ({ meta: [{ title: "Tour — 3D Walkthrough" }] }),
  component: TourView,
});

function TourView() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const get = useServerFn(getTour);
  const poll = useServerFn(pollTour);
  const del = useServerFn(deleteTour);

  const { data: tour, isLoading } = useQuery({
    queryKey: ["tour", id],
    queryFn: () => get({ data: { tourId: id } }),
  });

  const isPending = tour?.status === "processing" || tour?.status === "uploading";

  useEffect(() => {
    if (!isPending) return;
    const t = setInterval(async () => {
      try {
        await poll({ data: { tourId: id } });
        qc.invalidateQueries({ queryKey: ["tour", id] });
        qc.invalidateQueries({ queryKey: ["tours"] });
      } catch {}
    }, 10000);
    return () => clearInterval(t);
  }, [id, isPending, poll, qc]);

  async function share() {
    if (!tour?.embed_url) return;
    try {
      await navigator.clipboard.writeText(tour.embed_url);
      toast.success("Public tour link copied");
    } catch {
      toast.error("Couldn't copy — long-press the link");
    }
  }

  async function onDelete() {
    if (!confirm("Delete this tour?")) return;
    await del({ data: { tourId: id } });
    qc.invalidateQueries({ queryKey: ["tours"] });
    navigate({ to: "/dashboard" });
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
          <Link to="/dashboard" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> All tours
          </Link>
          <div className="flex items-center gap-1">
            {tour?.status === "ready" && (
              <Button variant="ghost" size="sm" onClick={share}>
                <Share2 className="mr-1 h-4 w-4" /> Share
              </Button>
            )}
            <Button variant="ghost" size="icon" onClick={onDelete}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-6">
        {isLoading ? (
          <div className="h-[60vh] animate-pulse rounded-2xl bg-muted" />
        ) : !tour ? (
          <p className="text-muted-foreground">Not found.</p>
        ) : (
          <div className="space-y-4">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">{tour.title}</h1>
              <p className="mt-1 text-xs text-muted-foreground">
                {new Date(tour.created_at).toLocaleString()}
              </p>
            </div>

            {tour.status === "ready" && tour.embed_url ? (
              <Card className="flex flex-col items-center gap-4 p-10 text-center">
                <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600">
                  <CheckCircle2 className="h-6 w-6" />
                </div>
                <div>
                  <p className="font-medium">Your 3D model is ready</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    KIRI Engine finished the reconstruction. Download the zipped Gaussian Splat / mesh below.
                  </p>
                </div>
                <Button asChild>
                  <a href={tour.embed_url} target="_blank" rel="noreferrer">
                    Download 3D model (.zip)
                  </a>
                </Button>
              </Card>
            ) : tour.status === "failed" ? (
              <Card className="flex flex-col items-center gap-3 p-10 text-center">
                <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
                  <AlertCircle className="h-6 w-6" />
                </div>
                <p className="font-medium">Processing failed</p>
                {tour.error_message && (
                  <p className="text-sm text-muted-foreground">{tour.error_message}</p>
                )}
              </Card>
            ) : (
              <Card className="flex flex-col items-center gap-4 p-10 text-center">
                <div className="relative inline-flex h-16 w-16 items-center justify-center rounded-full bg-accent/30">
                  <Loader2 className="h-7 w-7 animate-spin text-primary" />
                </div>
                <div>
                  <p className="font-medium">Building your 3D walkthrough…</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    KIRI Engine is turning your capture into a 3D Gaussian Splat scene.
                    This usually takes a few minutes — you can safely leave this page.
                  </p>
                </div>
                <Badge variant="secondary" className="gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  {tour.status === "uploading" ? "Uploading" : "Processing"}
                </Badge>
              </Card>
            )}

            {tour.status === "ready" && tour.embed_url && (
              <Card className="flex items-center justify-between gap-3 p-3">
                <div className="flex items-center gap-2 text-sm">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  <span className="truncate text-muted-foreground">{tour.embed_url}</span>
                </div>
                <Button size="sm" variant="secondary" onClick={share}>
                  <Copy className="mr-1 h-4 w-4" /> Copy
                </Button>
              </Card>
            )}
          </div>
        )}
      </main>
    </div>
  );
}