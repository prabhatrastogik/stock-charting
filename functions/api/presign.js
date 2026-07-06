import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const keys = url.searchParams.get("keys")?.split(",").filter(Boolean) ?? [];

  if (!keys.length) {
    return new Response("missing keys param", { status: 400 });
  }

  const s3 = new S3Client({
    region: "auto",
    endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    },
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });

  const urls = await Promise.all(
    keys.map((key) =>
      getSignedUrl(
        s3,
        new GetObjectCommand({ Bucket: env.R2_BUCKET, Key: key }),
        { expiresIn: 3600 }
      )
    )
  );

  return Response.json({ urls });
}
