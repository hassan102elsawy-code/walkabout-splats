// Server-only helpers for the KIRI Engine 3D scan API.
// Docs: https://docs.kiriengine.app

const KIRI_BASE = "https://api.kiriengine.app/api/v1/open";

function apiKey() {
  const key = process.env.KIRI_API_KEY;
  if (!key) throw new Error("KIRI_API_KEY is not configured on the server");
  return key;
}

function authHeaders(): Record<string, string> {
  return { authorization: `Bearer ${apiKey()}` };
}

type KiriEnvelope<T> = { ok: boolean; code?: number; msg?: string; data?: T };

async function kiriJson<T>(res: Response, action: string): Promise<T> {
  const body = await res.text();
  if (!res.ok) throw new Error(`KIRI ${action} HTTP ${res.status}: ${body}`);
  let parsed: KiriEnvelope<T>;
  try {
    parsed = JSON.parse(body) as KiriEnvelope<T>;
  } catch {
    throw new Error(`KIRI ${action} returned non-JSON: ${body.slice(0, 200)}`);
  }
  if (!parsed.ok) throw new Error(`KIRI ${action} failed: ${parsed.msg ?? "unknown"} (code ${parsed.code ?? "?"})`);
  return (parsed.data ?? ({} as T)) as T;
}

export type KiriUploadResult = { serialize: string; calculateType?: number };

/**
 * Upload photos for a 3D Gaussian Splat reconstruction.
 * Kiri requires 20–300 images.
 */
export async function kiriUploadPhotos(input: {
  files: Array<{ name: string; blob: Blob }>;
  isMesh?: 0 | 1;
  isMask?: 0 | 1;
  fileFormat?: "OBJ" | "FBX" | "STL" | "PLY" | "GLB" | "GLTF" | "USDZ" | "XYZ";
}): Promise<KiriUploadResult> {
  if (input.files.length < 20) throw new Error("KIRI requires at least 20 photos.");
  if (input.files.length > 300) throw new Error("KIRI allows at most 300 photos.");

  const form = new FormData();
  form.set("isMesh", String(input.isMesh ?? 0));
  form.set("isMask", String(input.isMask ?? 0));
  if (input.isMesh === 1) form.set("fileFormat", input.fileFormat ?? "GLB");
  input.files.forEach((f, i) => form.append(`imagesFiles[${i}]`, f.blob, f.name));

  const res = await fetch(`${KIRI_BASE}/3dgs/image`, {
    method: "POST",
    headers: authHeaders(),
    body: form,
  });
  return kiriJson<KiriUploadResult>(res, "uploadPhotos");
}

/**
 * Upload a single video file for 3DGS reconstruction.
 */
export async function kiriUploadVideo(input: {
  file: { name: string; blob: Blob };
  isMesh?: 0 | 1;
  isMask?: 0 | 1;
  fileFormat?: string;
}): Promise<KiriUploadResult> {
  const form = new FormData();
  form.set("isMesh", String(input.isMesh ?? 0));
  form.set("isMask", String(input.isMask ?? 0));
  if (input.isMesh === 1) form.set("fileFormat", input.fileFormat ?? "GLB");
  form.append("videoFile", input.file.blob, input.file.name);

  const res = await fetch(`${KIRI_BASE}/3dgs/video`, {
    method: "POST",
    headers: authHeaders(),
    body: form,
  });
  return kiriJson<KiriUploadResult>(res, "uploadVideo");
}

// Status codes per KIRI docs:
// 0 = uploading, 1 = processing, 2 = failed, 3 = successful, 4 = queuing, 5 = expired
export type KiriStatus = { status: number };

export async function kiriGetStatus(serialize: string): Promise<KiriStatus> {
  const url = `${KIRI_BASE}/model/getStatus?serialize=${encodeURIComponent(serialize)}`;
  const res = await fetch(url, { headers: authHeaders() });
  return kiriJson<KiriStatus>(res, "getStatus");
}

export type KiriModelZip = { modelUrl: string };

export async function kiriGetModelZip(serialize: string): Promise<KiriModelZip> {
  const url = `${KIRI_BASE}/model/getModelZip?serialize=${encodeURIComponent(serialize)}`;
  const res = await fetch(url, { headers: authHeaders() });
  return kiriJson<KiriModelZip>(res, "getModelZip");
}