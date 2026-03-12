# Old Toronto · Historical Itinerary Planner (React)

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Copy your JSON data files into /public
#    (these must be in the public folder so Vite serves them)
cp /path/to/locations_ex.json     public/
cp /path/to/images_ex.json        public/
cp /path/to/location_names.json   public/
cp /path/to/wikidata_toronto_landmarks.json public/

# 3. Run locally
npm run dev
```

Open http://localhost:5173/old-toronto/ in your browser.

## Deploy to GitHub Pages

### One-time setup

1. Create a GitHub repo (e.g. `old-toronto`)

2. In `vite.config.js`, make sure `base` matches your repo name:
   ```js
   base: '/old-toronto/',
   ```

3. Push the code:
   ```bash
   git init
   git add .
   git commit -m "initial commit"
   git remote add origin https://github.com/YOUR_USERNAME/old-toronto.git
   git branch -M main
   git push -u origin main
   ```

4. Deploy:
   ```bash
   npm run deploy
   ```
   This builds the project and pushes the `dist/` folder to a `gh-pages` branch.

5. In GitHub → repo **Settings** → **Pages**:
   - Source: **Deploy from a branch**
   - Branch: **gh-pages** / **/ (root)**
   - Save

6. Your site will be live at:
   ```
   https://YOUR_USERNAME.github.io/old-toronto/
   ```

### Subsequent deploys

Just run:
```bash
npm run deploy
```

## Important Notes

- Your 4 JSON data files **must** be in the `public/` folder — Vite copies them as-is to the build output.
- The `base` path in `vite.config.js` must match your GitHub repo name exactly.
- If you're deploying to a custom domain or to `username.github.io` (the root user site), set `base: '/'` instead.
# old-toronto
