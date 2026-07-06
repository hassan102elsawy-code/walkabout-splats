// Server-only helpers for the Luma AI Capture API.
// Docs: https://docs.lumalabs.ai (Capture / Gaussian Splat API)

const LUMA_BASE = "https://webapp.engineeringlumalabs.com/api/v3";

export const LUMA_CAPTURE_ACCESS_ERROR =
  "The configured Luma API key is not authorized for Luma's Capture API used for photo/video-to-3D tours. The key appears to be for Luma's current public API, while this capture endpoint requires Capture API access from Luma. Use a Capture API-enabled key or switch this app to another photos-to-3D provider.";

export class LumaProviderError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly providerBody: string,
  ) {
    super(message);
    this.name = "LumaProviderError";
  }
}

async function lumaError(res: Response, action: string) {
  const body = await res.text();
  if (res.status === 500 && body.includes("Cannot read properties of undefined") && body.includes("'id'")) {
    return new LumaProviderError(LUMA_CAPTURE_ACCESS_ERROR, res.status, body);
  }
  return new LumaProviderError(`Luma ${action} failed: ${res.status} ${body}`, res.status, body);
}

function authHeaders() {
  const key = process.env.LUMA_API_KEY;
  if (!key) throw new Error("LUMA_API_KEY is not configured on the server");
  return {
    authorization: `luma-api-key=${key}`,
  } as Record<string, string>;
}

export type LumaCreatedCapture = {
  signedUrls: Record<string, string>;
  capture: {
    slug: string;
    title: string;
    type: string;
  };
};

export async function lumaCreateCapture(input: {
  title: string;
  fileNames: string[];
  captureType: "photos" | "video";
}): Promise<LumaCreatedCapture> {
  const body = new URLSearchParams();
  body.set("title", input.title);
  body.set("type", "uploaded");
  for (const name of input.fileNames) body.append("fileNames[]", name);

  const res = await fetch(`${LUMA_BASE}/captures`, {
    method: "POST",
    headers: {
      ...authHeaders(),
      "content-type": "application/x-www-form-urlencoded",
    },
    body,
  });
  if (!res.ok) throw await lumaError(res, "createCapture");
  return (await res.json()) as LumaCreatedCapture;
}

export async function lumaTriggerProcess(slug: string) {
  const res = await fetch(`${LUMA_BASE}/captures/${slug}`, {
    method: "POST",
    headers: authHeaders(),
  });
  if (!res.ok) throw await lumaError(res, "triggerProcess");
  return res.json();
}

export type LumaCaptureStatus = {
  capture: {
    slug: string;
    status?: string;
    title?: string;
  };
  latestRun?: {
    status?: string; // e.g. "queued" | "dispatched" | "finished" | "failed"
    artifacts?: Array<{ type: string; url: string }>;
  };
};

export async function lumaGetCapture(slug: string): Promise<LumaCaptureStatus> {
  const res = await fetch(`${LUMA_BASE}/captures/${slug}`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw await lumaError(res, "getCapture");
  return (await res.json()) as LumaCaptureStatus;
}

export function lumaEmbedUrl(slug: string) {
  return `https://lumalabs.ai/embed/capture/${slug}?mode=sparkles&background=%23ffffff&color=%23000000&showTitle=true&loadBg=true&logoPosition=bottom-left&infoPosition=bottom-right&cinematicVideo=undefined&showMenu=false`;
}
