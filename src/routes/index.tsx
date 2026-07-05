import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: Landing,
});

function Landing() {
  const navigate = useNavigate();
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      navigate({ to: data.session ? "/dashboard" : "/auth", replace: true });
    });
  }, [navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="text-center">
        <div className="mx-auto mb-6 h-12 w-12 animate-pulse rounded-full bg-accent/40" />
        <p className="text-sm text-muted-foreground">Loading 3D Walkthrough…</p>
      </div>
    </div>
  );
}

// keep `redirect` referenced for future use without breaking tree-shake warnings
void redirect;