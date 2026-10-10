# Running the backend on Lightning AI

This runs the same backend as `backend/colab_runner.ipynb`, on a Lightning AI
Studio instead of Colab. Nothing here changes the Colab setup; both work.

Why Lightning: the Studio's disk persists, so packages, the downloaded models
and your keys survive between sessions. Setup happens once instead of every
session, and you can do it on the free CPU machine and switch to a GPU only
while the app is in use.

> Check your free GPU allowance in the Lightning dashboard: it is a monthly
> credit pool and the hours depend on the GPU type. Free Studios also have to
> be restarted every few hours.

## One-time setup

**1. Create a Studio.** Sign up at https://lightning.ai, create a new Studio
(the default "Code" template is fine) and open its **Terminal**. Leave the
machine on **CPU** for now.

**2. Get the code.** For a public repo:

```bash
cd ~
git clone https://github.com/boybothere/konkani_companion.git
cd konkani_companion
git checkout lightning-backend      # or main, once this branch is merged
```

For a private repo, create a GitHub fine-grained token with read-only
*Contents* access to this repo, then clone with
`git clone https://<TOKEN>@github.com/boybothere/konkani_companion.git` and run
`git remote set-url origin https://github.com/boybothere/konkani_companion.git`
afterwards so the token isn't stored in the repo config.

**3. Install everything** (still on CPU, takes a few minutes):

```bash
bash deploy/lightning/setup.sh
```

**4. Add your keys.** Open `backend/.env` in the Studio's file editor (the
setup script created it from `.env.example`) and fill in at least:

```
GROQ_API_KEY=...
BACKEND_API_KEY=...        # same value as in the frontend's .env.local
TAVILY_API_KEY=...         # optional
FIRECRAWL_API_KEY=...      # optional
NGROK_AUTHTOKEN=...        # only if you use --ngrok
NGROK_DOMAIN=...           # optional, bare domain without https://
```

`backend/.env` is ignored by git, so it never gets committed.

## Every time you use it

**1. Switch to a GPU.** In the Studio, change the machine to a GPU (a T4 is
enough for Qwen 3B in 4-bit plus Whisper medium).

**2. Start the server:**

```bash
cd ~/konkani_companion
bash deploy/lightning/start.sh
```

The first start downloads the models (a few minutes); later starts reuse them.
Wait for `serving on http://0.0.0.0:8000`.

**3. Make it reachable from the frontend.** Two options:

- **Lightning's port sharing:** open the **Ports** plugin in the Studio,
  add port `8000` and copy the URL it gives you.
- **ngrok** (works the same as on Colab): stop the server and start it with
  `bash deploy/lightning/start.sh --ngrok`. The log prints the public URL.

Check it from your PC: `https://<url>/health` should return
`{"status":"ok", ...}`. If the Ports URL asks for a Lightning login, the
Next.js server can't use it; use the ngrok option instead.

**4. Point the frontend at it.** In `.env.local`:

```
BACKEND_URL="https://<url>"
```

then restart `npm run dev`.

**5. When you're done,** stop the server (Ctrl+C) and switch the Studio back
to CPU or stop it, so it stops using GPU credits.

## Updating the code

```bash
cd ~/konkani_companion
git pull
bash deploy/lightning/start.sh
```

Re-run `setup.sh` only if `backend/requirements*.txt` changed.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `No GPU detected` | Switch the Studio to a GPU machine. To test the API without models, set `MODEL_BACKEND=mock` and `LLM_BACKEND=mock` in `backend/.env`. |
| `GROQ_API_KEY is not set` | Add it to `backend/.env`. |
| `CUDA out of memory` | Use a larger GPU, or set `WHISPER_MODEL=small` in `backend/.env`. |
| Errors importing `unsloth` or `torch` after setup | Unsloth may have changed the preinstalled torch. Restart the Studio's Python (or the Studio) and run `start.sh` again; if it persists, send the error. |
| `/health` works on the Studio but not from your PC | The port isn't exposed publicly. Use `--ngrok`. |
| Frontend says `Unauthorized` | `BACKEND_API_KEY` in `backend/.env` and `.env.local` must match. |
