import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listTours } from "@/lib/tours.functions";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Box, LogOut, Plus, Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "My tours — 3D Walkthrough" }] }),
  component: Dashboard,
});

function StatusBadge({ status }: { status: string }) {
  if (status === "ready")
    return (
      <Badge className="gap-1 bg-emerald-100 text-emerald-800 hover:bg-emerald-100">
        <CheckCircle2 className="h-3 w-3" /> Ready
      </Badge>
    );
  if (status === "failed")
    return (
      <Badge variant="destructive" className="gap-1">
        <AlertCircle className="h-3 w-3" /> Failed
      </Badge>
    );
  return (
    <Badge variant="secondary" className="gap-1">
      <Loader2 className="h-3 w-3 animate-spin" />
      {status === "uploading" ? "Uploading" : "Processing"}
    </Badge>
  );
}

function Dashboard() {
  const navigate = useNavigate();
  const router = useRouter();
  const qc = useQueryClient();
  const list = useServerFn(listTours);
  const { data: tours = [], isLoading } = useQuery({
    queryKey: ["tours"],
    queryFn: () => list(),
    refetchInterval: (q) => {
      const rows = q.state.data as Array<{ status: string }> | undefined;
      return rows?.some((r) => r.status === "processing" || r.status === "uploading") ? 8000 : false;
    },
  });

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    router.invalidate();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <Link to="/dashboard" className="flex items-center gap-2 font-semibold">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-accent/40 text-primary">
              <Box className="h-4 w-4" />
            </span>
            3D Walkthrough
          </Link>
          <Button variant="ghost" size="sm" onClick={signOut}>
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 pb-32 pt-6">
        <div className="mb-6 flex items-end justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Your tours</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Capture a space, walk through it anywhere.
            </p>
          </div>
        </div>

        {isLoading ? (
          <div className="grid gap-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-24 animate-pulse rounded-xl bg-muted" />
            ))}
          </div>
        ) : tours.length === 0 ? (
          <Card className="flex flex-col items-center gap-3 border-dashed p-10 text-center">
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-accent/30 text-primary">
              <Box className="h-6 w-6" />
            </div>
            <p className="font-medium">No tours yet</p>
            <p className="max-w-xs text-sm text-muted-foreground">
              Upload photos or a short video of an apartment to build your first 3D walkthrough.
            </p>
          </Card>
        ) : (
          <ul className="grid gap-3">
            {tours.map((t) => (
              <li key={t.id}>
                <Link
                  to="/tour/$id"
                  params={{ id: t.id }}
                  className="group flex items-center gap-3 rounded-xl border bg-card p-3 transition hover:bg-accent/10"
                >
                  <div className="relative h-16 w-24 shrink-0 overflow-hidden rounded-lg bg-muted">
                    {t.thumbnail_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={t.thumbnail_url} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                        <Box className="h-6 w-6" />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-medium">{t.title}</p>
                    </div>
                    <div className="mt-1 flex items-center gap-2">
                      <StatusBadge status={t.status} />
                      <span className="text-xs text-muted-foreground">
                        {new Date(t.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t bg-background/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto max-w-3xl">
          <Button
            size="lg"
            className="w-full gap-2 text-base"
            onClick={() => navigate({ to: "/new" })}
          >
            <Plus className="h-5 w-5" />
            New 3D tour
          </Button>
        </div>
      </div>
    </div>
  );
}