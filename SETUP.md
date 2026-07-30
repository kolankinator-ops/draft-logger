# Draft Logger — Website Setup

## Step 1: Run the database schema

1. Go to https://supabase.com/dashboard/project/bsajdyunxzkkrgtvsuwf
2. Click **SQL Editor** in the left sidebar
3. Click **New query**
4. Paste the entire contents of `supabase/schema.sql`
5. Click **Run**

## Step 2: Add GitHub Secrets

These let GitHub Actions build the app with your Supabase credentials.

1. Go to https://github.com/kolankinator-ops/draft-logger/settings/secrets/actions
2. Click **New repository secret** and add these two:

   - Name: `VITE_SUPABASE_URL`
     Value: `https://bsajdyunxzkkrgtvsuwf.supabase.co`

   - Name: `VITE_SUPABASE_ANON_KEY`
     Value: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJzYWpkeXVueHpra3JndHZzdXdmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUzNzc3ODUsImV4cCI6MjEwMDk1Mzc4NX0.gj2GNvvHfLcvidTMSmsMFVoJR3MlYnIhJbJF1VgP9r4`

## Step 3: Enable GitHub Pages

1. Go to https://github.com/kolankinator-ops/draft-logger/settings/pages
2. Under **Source**, select **GitHub Actions**
3. Save

## Step 4: Upload these files to your repo

Upload all files from this folder to your GitHub repo via the web interface:
- Drag and drop the entire folder, or upload file by file
- Commit to `main`
- GitHub Actions will automatically build and deploy

## Step 5: Set Supabase redirect URLs

1. Go to https://supabase.com/dashboard/project/bsajdyunxzkkrgtvsuwf/auth/url-configuration
2. Add your GitHub Pages URL to **Redirect URLs**:
   `https://kolankinator-ops.github.io/draft-logger/`
3. Also add `http://localhost:5173/` for local dev if needed

## After setup

Your app will be live at:
**https://kolankinator-ops.github.io/draft-logger/**

Every time you push a file to `main`, GitHub Actions rebuilds and deploys in ~2 minutes.

## Migrating your existing data

Once you're signed in, go to ⚙ Sync and use **Import from old version** to paste in your existing `data.json` from GitHub. All your entries, bankroll, settings and factor weights will migrate automatically.
