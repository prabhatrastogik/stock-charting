import { AwsClient } from "aws4fetch";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
  "Access-Control-Allow-Headers": "Range, If-None-Match",
  "Access-Control-Expose-Headers": "Content-Length, Content-Range, Accept-Ranges, ETag",
};

export async function onRequest({ request, env }) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }

  const { searchParams } = new URL(request.url);

  // Diagnostic: /api/data?ping=1
  if (searchParams.has("ping")) {
    return new Response(JSON.stringify({
      ok: true,
      hasAccountId: !!env.R2_ACCOUNT_ID,
      hasAccessKey: !!env.R2_ACCESS_KEY_ID,
      hasSecret: !!env.R2_SECRET_ACCESS_KEY,
      hasBucket: !!env.R2_BUCKET,
    }), { status: 200, headers: { ...CORS, "Content-Type": "application/json" } });
  }

  const key = searchParams.get("key");
  if (!key) return new Response("missing key", { status: 400, headers: CORS });

  const aws = new AwsClient({
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    region: "auto",
    service: "s3",
  });

  const r2url = `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${env.R2_BUCKET}/${key}`;

  if (request.method === "HEAD") {
    const res = await aws.fetch(r2url, { method: "HEAD" });
    if (!res.ok) return new Response(null, { status: 404, headers: CORS });
    return new Response(null, {
      headers: {
        ...CORS,
        "Content-Type": "application/octet-stream",
        "Content-Length": res.headers.get("Content-Length") ?? "0",
        "Accept-Ranges": "bytes",
        "ETag": res.headers.get("ETag") ?? "",
      },
    });
  }

  const rangeHeader = request.headers.get("Range");
  const fetchHeaders = rangeHeader ? { "Range": rangeHeader } : {};
  const res = await aws.fetch(r2url, { method: "GET", headers: fetchHeaders });
  if (!res.ok) return new Response(null, { status: 404, headers: CORS });

  const headers = {
    ...CORS,
    "Content-Type": "application/octet-stream",
    "Accept-Ranges": "bytes",
  };
  const contentLength = res.headers.get("Content-Length");
  if (contentLength) headers["Content-Length"] = contentLength;
  const contentRange = res.headers.get("Content-Range");
  if (contentRange) headers["Content-Range"] = contentRange;
  const etag = res.headers.get("ETag");
  if (etag) headers["ETag"] = etag;

  return new Response(res.body, { status: res.status, headers });
}
