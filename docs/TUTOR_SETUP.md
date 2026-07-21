# Setting up "Dein Lehrer" (Gemini Flash tutor)

Two free accounts, ~10 minutes, no command line needed. The API key never
touches the app or the public repo — it lives only inside your Cloudflare
Worker.

## Step 1 — Get a free Gemini API key

1. Go to https://aistudio.google.com/apikey and sign in with your Google
   account.
2. Click **Create API key** → copy the key (starts with `AIza…`).
3. Keep it somewhere safe for Step 2. Never paste it into the app, the repo,
   or any file on GitHub.

The free tier is enough for personal use (hundreds of requests per day).

## Step 2 — Deploy the Cloudflare Worker

1. Go to https://dash.cloudflare.com and create a free account (no domain or
   payment needed).
2. In the left menu: **Workers & Pages** → **Create** → **Create Worker**.
3. Give it a name, e.g. `deutsch-lehrer` → **Deploy** (it deploys a hello-world
   first — that's fine).
4. Click **Edit code**, delete everything in the editor, and paste the full
   contents of `cloudflare/worker.js` from this repo → **Deploy**.
5. Go back to the worker's page → **Settings** → **Variables and Secrets** →
   **Add** → Type: **Secret**, name: `GEMINI_API_KEY`, value: your key from
   Step 1 → **Deploy**.
6. Copy your worker URL, shown at the top — it looks like
   `https://deutsch-lehrer.<your-subdomain>.workers.dev`.

## Step 3 — Connect the app

1. Open the app → **Plan** → **Einstellungen** → paste the worker URL into
   **Lehrer-URL** field.
2. Done. The 💬 buttons in Lesen (word popup), Lernen (lessons) and Schreiben
   (draft check) now work.

## Notes

- The teacher refuses everything that isn't about the German language — this
  is enforced in the worker, not the app.
- Only the app's own origins (github.io page + localhost) may call the worker;
  other websites get a 403.
- To revoke access at any time: delete the worker, or rotate the key at
  https://aistudio.google.com/apikey.
- If Google renames models and the worker returns errors, change the `MODEL`
  constant at the top of the worker code to the current Flash model name.
