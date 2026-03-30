# CoCountant Blog Preview Generator — Vercel Deployment

## Project Structure

```
/
├── api/
│   └── search.js        ← Serverless function (proxies Shutterstock)
├── public/
│   └── index.html       ← The blog preview generator app
├── vercel.json          ← Vercel routing config
└── package.json
```

---

## Deploy to Vercel (5 steps)

### 1. Push to GitHub
Create a new GitHub repository and push all these files:
```bash
git init
git add .
git commit -m "Initial deploy"
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
git push -u origin main
```

### 2. Import to Vercel
- Go to https://vercel.com and sign in
- Click **Add New → Project**
- Import your GitHub repository
- Click **Deploy** (no build settings needed)

### 3. Add Environment Variables
After deploy, go to your project in Vercel:
- Click **Settings → Environment Variables**
- Add these two variables:

| Name | Value |
|------|-------|
| `SHUTTERSTOCK_CLIENT_ID` | your_client_id_here |
| `SHUTTERSTOCK_CLIENT_SECRET` | your_client_secret_here |

- Set them for **Production**, **Preview**, and **Development**
- Click **Save**

### 4. Redeploy
- Go to **Deployments** tab
- Click the three dots on your latest deployment → **Redeploy**
- This applies the environment variables

### 5. Done!
Your app is live at `https://your-project.vercel.app`

Share this URL with anyone — credentials stay hidden on Vercel's servers.

---

## Local development (optional)

Install Vercel CLI and run locally:
```bash
npm i -g vercel
vercel dev
```

Then set your credentials in Vercel dashboard and pull them locally:
```bash
vercel env pull .env.local
```
