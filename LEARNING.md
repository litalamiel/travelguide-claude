# Self-learning reel place detection

The app learns from every reel import. Nothing is retrained from scratch: each confirm or fix is saved,
and the next guesses use them.

## How it works

1. **Lessons.** Each reel pin ends in one of three ways, and each one is saved to Supabase (`reel_lessons`):
   - **Confirmed:** "Add to map" with the place and category unchanged.
   - **Fixed:** the user picked a different suggestion, changed the category, or turned the pin down and
     added the right place by search within 3 minutes.
   - **Turned down:** "Not this one" with no correction, or unticked in bulk review.
2. **Shared memory.** Once a reel is confirmed, everyone who imports it gets that place straight away
   (`reel_answers`). An answer that's turned down as often as it's confirmed stops being used.
3. **Claude reads the reel.** `api/ai-place.js` sends the caption, the cover picture and the creator to Claude.
   Before it guesses, Claude is shown the 6 most similar reels people already checked (same creator and
   corrected guesses rank first, via `similar_lessons`). More lessons mean better examples.
4. **Order of guesses:** shared memory, then Claude, then the app's own caption rules (`src/geocode.ts`).
   Claude's place is still found on the map by the same search, so the pin is real.
5. **Score.** `accuracy_summary`, `accuracy_daily` and `recent_misses` show how often the first guess was right.
6. **Training later.** `/api/learn?action=export` downloads every lesson as JSONL (with `format=chat` for
   fine-tuning style pairs, `images=1` to include the small cover pictures).

Without the keys below, all of this switches off and the app works exactly as before.

## Setup (once, about 15 minutes)

### 1. Supabase (the memory, free)
1. Go to https://supabase.com, sign up, and click **New project**. Any name (e.g. `travel-maps`), set a database
   password, pick the region nearest your users, Free plan.
2. When it's ready, open **SQL Editor → New query**, paste all of [`supabase/learning.sql`](supabase/learning.sql),
   and click **Run**. It should say "Success. No rows returned".
3. Copy the **Project URL** (on the project's home page, or **Project Settings → Data API**), then open
   **Project Settings → API Keys** and copy a **secret key** (`sb_secret_…`; on older projects it's the
   `service_role` key). Keep the secret key private.

### 2. Anthropic (Claude, pay as you go)
1. Go to https://console.anthropic.com, sign up, add a payment method under **Billing** and a few dollars of credit.
2. **API Keys → Create Key**, name it `travel-maps`, copy it (`sk-ant-…`).
3. Cost: one reel reading is roughly 2 to 4 US cents with the default model. Reels already in the shared memory cost nothing.

### 3. Vercel (where the app runs)
In https://vercel.com open the `travelguide-claude` project → **Settings → Environment Variables**, add each for
Production, Preview and Development, then **Deployments → ⋯ → Redeploy** the latest deployment:

| Name | Value |
|---|---|
| `SUPABASE_URL` | the Project URL, e.g. `https://abcd.supabase.co` |
| `SUPABASE_SECRET_KEY` | the `sb_secret_…` key (or `service_role` key) |
| `ANTHROPIC_API_KEY` | the `sk-ant-…` key |
| `LEARN_ADMIN_TOKEN` | any long password you make up; protects the export and the misses list |
| `ANTHROPIC_MODEL` (optional) | default `claude-opus-5-5` |
| `ANTHROPIC_EFFORT` (optional) | default `low` (faster); `medium` reads harder reels better |

Check: open `https://travelguide-claude.vercel.app/api/learn?action=status`. It should say
`{"memory":true,"ai":true}`.

## Teaching it day to day
- Import reels as usual. When the pin is right, press **Add to map**: that's a confirm.
- When the category is wrong, pick the right one before **Add to map**.
- When the place is wrong, press **Not this one**, then search for the right place and add it within 3 minutes.
  That teaches the right answer, not just "wrong".
- In bulk review, untick wrong places, fix the "which place" choice and category, then press Add.
- Creators teach fast: after a few of one creator's reels are checked, Claude follows how they write captions.

## Reading the score
- Quick look: `https://travelguide-claude.vercel.app/api/learn?action=stats`
- With misses and creators: add `&token=<LEARN_ADMIN_TOKEN>`.
- In Supabase → **Table Editor**, open the views: `accuracy_summary` (last 7 days / 30 days / all time),
  `accuracy_daily` (per day and per method: memory, ai, rules), `recent_misses` (what to look at),
  `creator_habits`.
- `place_right_pct` is the share of reels where the first pin was the right place. `both_right_pct` also needs
  the right category. Watch the `ai` rows climb as lessons pile up.

## Training your own model later
- Download: `https://travelguide-claude.vercel.app/api/learn?action=export&format=chat&token=<LEARN_ADMIN_TOKEN>`
- Each line is one checked reel: the caption (and cover with `&images=1`) and the right place and category.
- With a few thousand lines, this is enough to fine-tune or evaluate a dedicated model, and to measure any
  new model against the same reels before switching.

## Files
- `supabase/learning.sql`: table, views, the similar-lessons search, and access rules (only the server can read it).
- `api/learn.js`: status, shared memory lookup, saving lessons, score, export.
- `api/ai-place.js`: Claude reading the caption and pictures with past lessons as examples.
- `src/learn.ts`: the app side (memory, Claude, sending lessons). Hooked into `src/App.tsx` and `src/Bulk.tsx`.
