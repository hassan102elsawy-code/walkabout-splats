import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { createTour, startProcessing } from "@/lib/tours.functions";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { ArrowLeft, Camera, Image as ImageIcon, Loader2, Upload, Video, X } from "lucide-react";

export const Route = createFileRoute("/_authenticated/new")({
  head: () => ({ meta: [{ title: "New tour — 3D Walkthrough" }] }),
  component: NewTour,
});

type Mode = "photos" | "video";

function NewTour() {
  const navigate = useNavigate();
  const create = useServerFn(createTour);
  const startProc = useServerFn(startProcessing);

  const [title, setTitle] = useState("");
  const [mode, setMode] = useState<Mode>("photos");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState<string>("");
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  function addFiles(list: FileList | null) {
    if (!list) return;
    const arr = Array.from(list);
    if (mode === "video") setFiles(arr.slice(0, 1));
    else setFiles((prev) => [...prev, ...arr].slice(0, 200));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return toast.error("Give your tour a title");
    if (files.length === 0) return toast.error("Add at least one file");

    setBusy(true);
    setProgress(2);
    setPhase("Preparing…");
    try {
      if (mode === "photos" && (files.length < 20 || files.length > 300)) {
        toast.error("KIRI requires 20–300 photos.");
        setBusy(false);
        setProgress(0);
        setPhase("");
        return;
      }

      const fileNames = files.map((f, i) => `${String(i).padStart(3, "0")}_${f.name.replace(/[^\w.\-]+/g, "_")}`);
      const created = await create({
        data: { title: title.trim(), captureType: mode },
      });
      const { tourId } = created;

      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user!.id;
      const storagePaths: string[] = [];

      setPhase("Uploading photos…");
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const name = fileNames[i];
        const storagePath = `${userId}/${tourId}/${name}`;
        const { error: upErr } = await supabase.storage.from("tour-uploads").upload(storagePath, file, {
          upsert: true,
          contentType: file.type || undefined,
        });
        if (upErr) throw new Error(`Upload failed for ${file.name}: ${upErr.message}`);
        storagePaths.push(storagePath);

        setProgress(Math.round(((i + 1) / files.length) * 85));
      }

      setPhase("Sending to KIRI Engine…");
      setProgress(92);
      const started = await startProc({ data: { tourId, sourcePaths: storagePaths, captureType: mode } });
      if (!started.ok) {
        toast.error(started.error, { duration: 12000 });
        navigate({ to: "/tour/$id", params: { id: tourId } });
        return;
      }

      setProgress(100);
      toast.success("Uploaded! Your tour is processing.");
      navigate({ to: "/tour/$id", params: { id: tourId } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
      setBusy(false);
      setProgress(0);
      setPhase("");
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center gap-2 px-4 py-3">
          <Button variant="ghost" size="icon" onClick={() => navigate({ to: "/dashboard" })}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-base font-semibold">New 3D tour</h1>
        </div>
      </header>

      <form onSubmit={onSubmit} className="mx-auto max-w-2xl px-4 pb-24 pt-6">
        <div className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="title">Tour name</Label>
            <Input
              id="title"
              placeholder="e.g. Sunset 2-bedroom, Mission St."
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={busy}
            />
          </div>

          <div className="space-y-2">
            <Label>What are you uploading?</Label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => { setMode("photos"); setFiles([]); }}
                className={`flex items-center justify-center gap-2 rounded-xl border p-3 text-sm transition ${
                  mode === "photos" ? "border-primary bg-accent/20" : "hover:bg-muted"
                }`}
              >
                <ImageIcon className="h-4 w-4" /> Photos
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => { setMode("video"); setFiles([]); }}
                className={`flex items-center justify-center gap-2 rounded-xl border p-3 text-sm transition ${
                  mode === "video" ? "border-primary bg-accent/20" : "hover:bg-muted"
                }`}
              >
                <Video className="h-4 w-4" /> Video
              </button>
            </div>
          </div>

          <Card
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              if (!busy) addFiles(e.dataTransfer.files);
            }}
            className={`flex flex-col items-center justify-center gap-3 border-dashed p-8 text-center transition ${
              dragOver ? "border-primary bg-accent/10" : ""
            }`}
          >
            <div className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-accent/30 text-primary">
              <Upload className="h-6 w-6" />
            </div>
            <p className="text-sm text-muted-foreground">
              {mode === "photos"
                ? "Drop 20–100 overlapping photos of the space"
                : "Drop a short walkthrough video (30–90 seconds)"}
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              <Button type="button" variant="secondary" onClick={() => inputRef.current?.click()} disabled={busy}>
                Choose files
              </Button>
              <Button type="button" variant="outline" onClick={() => cameraRef.current?.click()} disabled={busy}>
                <Camera className="mr-1 h-4 w-4" /> Camera
              </Button>
            </div>
            <input
              ref={inputRef}
              type="file"
              className="hidden"
              multiple={mode === "photos"}
              accept={mode === "photos" ? "image/*" : "video/*"}
              onChange={(e) => addFiles(e.target.files)}
            />
            <input
              ref={cameraRef}
              type="file"
              className="hidden"
              accept={mode === "photos" ? "image/*" : "video/*"}
              capture="environment"
              onChange={(e) => addFiles(e.target.files)}
            />
          </Card>

          {files.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">{files.length} file{files.length === 1 ? "" : "s"} selected</p>
                {!busy && (
                  <button type="button" className="text-xs text-muted-foreground hover:text-foreground" onClick={() => setFiles([])}>
                    Clear
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {files.slice(0, 30).map((f, i) => (
                  <div key={i} className="flex items-center gap-1 rounded-full bg-muted px-3 py-1 text-xs">
                    <span className="max-w-[10rem] truncate">{f.name}</span>
                    {!busy && (
                      <button
                        type="button"
                        onClick={() => setFiles((p) => p.filter((_, idx) => idx !== i))}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                ))}
                {files.length > 30 && (
                  <span className="text-xs text-muted-foreground">+{files.length - 30} more</span>
                )}
              </div>
            </div>
          )}

          {busy && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> {phase}
              </div>
              <Progress value={progress} />
            </div>
          )}
        </div>
      </form>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t bg-background/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto max-w-2xl">
          <Button
            size="lg"
            className="w-full text-base"
            disabled={busy || files.length === 0 || !title.trim()}
            onClick={onSubmit as unknown as React.MouseEventHandler<HTMLButtonElement>}
          >
            {busy ? "Uploading…" : "Create 3D tour"}
          </Button>
        </div>
      </div>
    </div>
  );
}