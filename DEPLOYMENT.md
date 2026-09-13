# Deployment guide

This repo is ready to push and deploy as-is. I can't create your GitHub repository or your Vercel
deployment for you — both require your own account and credentials, which I don't have access to
— but everything below has been tested locally against the real build, including simulating the
exact Vercel serverless handler this repo ships (see the transcript at the bottom).

## 1. Push to GitHub

```bash
cd AgentProof
git init
git add -A
git commit -m "AgentProof: cryptographic accountability for autonomous AI, built on CooL"
```

Create an empty repository on GitHub (via the website, or `gh repo create agentproof --public
--source=. --remote=origin` if you have the GitHub CLI authenticated), then:

```bash
git remote add origin https://github.com/<your-username>/agentproof.git
git branch -M main
git push -u origin main
```

The vendored SDK tarball (`vendor/cool-nwc-3.0.0.tgz`) and the `.env.example` are committed;
`.gitignore` already excludes `node_modules/`, `dist/`, `backend/data/`, and `.env`.

## 2. Deploy to Vercel

This repo is already configured for a **single Vercel project** serving both the frontend (static)
and the backend (as a serverless function) from one domain — no second host needed for the demo.

### Option A — Vercel dashboard (recommended, no CLI needed)

1. Go to [vercel.com/new](https://vercel.com/new) and import the GitHub repo you just pushed.
2. Vercel will detect `vercel.json` at the root — leave the build settings as detected
   (`npm run vercel-build`, output directory `frontend/dist`). No environment variables are
   required for the combined deployment.
3. Click **Deploy**. First deploy takes ~1–2 minutes (it builds the backend, then the frontend).
4. Open the resulting `*.vercel.app` URL — you should land on **Agent console**.

### Option B — Vercel CLI

```bash
npm i -g vercel     # if you don't already have it
cd AgentProof
vercel login
vercel --prod
```

### What "combined" deployment means here

- `frontend/dist` is served as static files.
- `api/index.ts` becomes a serverless function; `vercel.json` rewrites `/api/*` to it and
  everything else to `index.html` (so client-side navigation works).
- **Storage caveat**: the evidence vault is stored in `/tmp` inside the serverless function, which
  Vercel does **not** guarantee persists across cold starts. For a live demo this is normally fine
  — a warm function instance keeps state for the length of a demo session — but don't expect
  evidence created yesterday to still be there today. See `docs/LIMITATIONS.md`.

### Option C — split deployment (persistent backend)

If you want the evidence vault to actually persist, deploy the backend somewhere with a real
filesystem (Render, Railway, Fly.io, a VM) instead of as a Vercel function, and deploy only the
frontend to Vercel:

1. Deploy `backend/` to your host of choice. Build command: `npm install && npm run build`. Start
   command: `npm start`. Expose the `PORT` it listens on.
2. On Vercel, import the repo but set:
   - **Root directory**: `frontend`
   - **Build command**: `npm run build`
   - **Output directory**: `dist`
   - **Environment variable**: `VITE_API_URL` = your backend's public URL (e.g.
     `https://agentproof-api.onrender.com`)
3. Deploy. The frontend will call `${VITE_API_URL}/api/...` instead of the same-origin `/api`.

## Verified locally before handing this off

Because I can't create your Vercel deployment to test it directly, I verified the exact code path
Vercel will run:

```bash
$ npm install                         # root workspace install — hoists cool-nwc, express, etc.
$ npm run build                       # builds backend/dist and frontend/dist, same as vercel-build
$ npm test                            # 6/6 backend tests pass

# Then, simulating Vercel's Node runtime invoking api/index.ts directly as a request handler,
# with VERCEL=1 set so the store uses /tmp as it would in production:

$ curl localhost:4500/api/health
{"ok":true,"service":"agentproof-backend"}

$ curl -X POST localhost:4500/api/agent/execute -d '{"command":"Pay ₹2,500 to ABC Traders"}'
# → HTTP 201, status "completed", 3 steps

$ curl -X POST localhost:4500/api/verify/<recordId>
# → verdict.ok: true, binding: pass, signature: pass
```

This confirms the serverless entrypoint, the compiled backend it imports, and the vendored CooL
SDK all resolve and run correctly together under the same conditions Vercel's Node runtime uses —
the parts of "deploy to Vercel" that could silently break (import resolution across the
`api/` → `backend/dist` boundary, `/tmp`-based storage, hoisted workspace dependencies) have all
been exercised, not just written and assumed to work.
