# Deployment Guide — Cloudflare Pages

## Prerequisites

- A Cloudflare account with Pages enabled
- The R2 bucket already populated with Parquet data
- An R2 API token with **Object Read** permission on the bucket
- pnpm installed locally (`npm i -g pnpm`)

---

## Step 1 — Create an R2 API Token

1. Go to [Cloudflare dashboard](https://dash.cloudflare.com) → **R2 → Manage R2 API Tokens → Create API Token**
2. Set permissions: **Object Read** only
3. Scope it to your specific bucket
4. Save the **Access Key ID** and **Secret Access Key** — you will not see the secret again

You will also need your **Cloudflare Account ID** — found in the right sidebar of any dashboard page.

---

## Step 2 — Deploy to Cloudflare Pages

### Option A — Connect GitHub (recommended)

1. Push the repo to GitHub.
2. Go to **Cloudflare Pages → Create a project → Connect to Git**
3. Select the repo.
4. Set build settings:
   - **Framework preset**: None
   - **Build command**: `pnpm run build`
   - **Build output directory**: `dist`
   - **Node.js version**: 20
5. Click **Save and Deploy**.

Cloudflare automatically picks up `functions/api/data.js` and deploys it as a Pages Function at `/api/data`.

### Option B — Deploy with Wrangler CLI

```bash
pnpm deploy
```

This runs `pnpm build && wrangler pages deploy dist`. On first run Wrangler creates the project in your account.

---

## Step 3 — Set Environment Variables

The proxy function signs R2 requests using `aws4fetch` with credentials read from Pages environment variables. Only the two secret values need to be set; the account ID and bucket name are already in `wrangler.toml [vars]`.

1. Go to **Pages → your project → Settings → Environment variables**
2. Add the following for the **Production** environment (mark both as **Encrypted**):

| Variable | Value |
|---|---|
| `R2_ACCESS_KEY_ID` | Access key from Step 1 |
| `R2_SECRET_ACCESS_KEY` | Secret from Step 1 |

> `R2_ACCOUNT_ID` and `R2_BUCKET` are already set in `wrangler.toml` as plain `[vars]` and do not need to be added here. If you need to override them (e.g. for a different bucket in a preview environment), add them as environment variables there.

3. Add the same variables to the **Preview** environment if you want branch previews to work.
4. Trigger a new deployment after saving.

> **Never** add these to `.env`, `.env.local`, or with a `VITE_` prefix. Vite bakes `VITE_*` variables into the client bundle.

---

## Step 4 — Verify the Deployment

After deploying, open the Pages URL and check:

1. **Diagnostic endpoint** — visit `<your-url>/api/data?ping=1`. You should see:
   ```json
   { "ok": true, "hasAccountId": true, "hasAccessKey": true, "hasSecret": true, "hasBucket": true }
   ```
   If any value is `false`, the corresponding env var is missing.

2. **DuckDB status** — the top bar shows a green dot within ~5 seconds (DuckDB-Wasm loads from jsDelivr CDN).
3. **Network tab** — filter by `/api/data`. Chart loads should trigger HEAD then GET requests, returning 200 (or 206 for range requests).
4. **Console** — no errors. If you see 404s on `/api/data`, the function wasn't deployed or env vars are missing.

---

## Step 5 — Restrict Access with Cloudflare Access (optional)

The proxy endpoint will serve any R2 key it receives to any caller. Add Cloudflare Access to gate the entire site to your team.

1. Go to **Zero Trust → Access → Applications → Add an application → Self-hosted**
2. Set the domain to your Pages domain (e.g. `stock-charting.pages.dev`)
3. Create a policy: allow users where **Email ends in** `@yourdomain.com` (or use GitHub/Google identity)
4. Save — Cloudflare Access now requires authentication before any page or function is served

This is zero-config from the app's perspective; the frontend code does not change.

---

## Step 6 — Custom Domain (optional)

1. Go to **Pages → your project → Custom domains → Set up a custom domain**
2. Enter your domain (e.g. `charts.yourdomain.com`)
3. Add the CNAME record Cloudflare shows to your DNS

---

## Local Development

```bash
# Install dependencies (approve build scripts for esbuild/sharp/workerd when prompted)
pnpm install

# Create .dev.vars with real R2 credentials (gitignored)
cp .dev.vars.example .dev.vars
# Fill in R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY
# R2_ACCOUNT_ID and R2_BUCKET are in wrangler.toml [vars] but can be overridden here

# Start dev server — Vite on :5173, Wrangler Pages dev on :8788 proxying to Vite
pnpm dev
# Open http://localhost:8788
```

The dev script runs `vite --port 5173 & sleep 1 && wrangler pages dev --proxy 5173 --port 8788`. Wrangler proxies all non-function traffic to Vite, while Vite's HMR connects directly on port 5173 (configured in `vite.config.ts`).

---

## Redeployment

Every `git push` to the connected branch triggers an automatic build and deploy. To deploy manually:

```bash
pnpm deploy
```

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `ERR_PNPM_IGNORED_BUILDS` on install | pnpm blocking native build scripts | Run `pnpm approve-builds` and select esbuild, sharp, workerd |
| `Command failed with exit code 1: pnpm install` on `pnpm dev` | Same as above | Run `pnpm approve-builds` |
| DuckDB stuck on initializing | CDN blocked or SharedArrayBuffer unavailable | Check browser console; ensure jsDelivr (cdn.jsdelivr.net) is reachable |
| `/api/data?ping=1` shows `hasAccessKey: false` | Missing env var | Add `R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY` in Pages → Settings → Environment variables |
| `/api/data` returns 500 | Signing error or wrong credentials | Check credentials match the R2 token; re-check `R2_ACCOUNT_ID` and `R2_BUCKET` in `wrangler.toml` |
| `/api/data` returns 404 on a valid key | R2 token lacks read permission or wrong bucket name | Verify token permissions and `R2_BUCKET` value |
| Chart loads but no data | Symbol not in R2 / wrong key path | Check key conventions in README — index symbols use hyphens (`NIFTY-50`) |
| HMR not working in dev | Wrangler intercepting WebSocket | Confirm `vite.config.ts` sets `hmr.port: 5173` and `hmr.clientPort: 5173` |
