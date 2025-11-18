# 🚀 Vercel Deployment Guide

## ✅ Why Vercel?

Vercel supports **both frontend AND backend** (Node.js serverless functions), so you can deploy everything in one place!

## 📋 Prerequisites

1. GitHub account (you already have this)
2. Vercel account (free): https://vercel.com/signup
3. Gemini API key

## 🎯 Step-by-Step Deployment

### Step 1: Sign up for Vercel

1. Go to https://vercel.com/signup
2. Sign up with your GitHub account (easiest way)
3. Authorize Vercel to access your GitHub repositories

### Step 2: Import Your Project

1. In Vercel dashboard, click **"Add New..."** → **"Project"**
2. Find your repository: `StefanVaskovic-SD/SD-AI_Audit`
3. Click **"Import"**

### Step 3: Configure Project Settings

Vercel should auto-detect the settings from `vercel.json`, but verify:

- **Framework Preset**: Other (or leave blank)
- **Root Directory**: `./` (root)
- **Build Command**: Leave empty (no build needed)
- **Output Directory**: Leave empty (serving static files)

### Step 4: Add Environment Variables

**IMPORTANT**: Add your Gemini API key!

1. In project settings, go to **"Environment Variables"**
2. Add:
   - **Name**: `GEMINI_API_KEY`
   - **Value**: Your Gemini API key (starts with `AIza...`)
   - **Environment**: Production, Preview, Development (check all)

3. Click **"Save"**

### Step 5: Deploy!

1. Click **"Deploy"**
2. Wait for deployment to complete (usually 2-3 minutes)
3. You'll get a URL like: `https://your-project-name.vercel.app`

### Step 6: Update Frontend Backend URL

After deployment, you need to update the frontend to use the Vercel backend URL:

1. Open `index.html` in your editor
2. Find the line with `backendUrl` (around line 71)
3. Change from:
   ```javascript
   const [backendUrl, setBackendUrl] = useState('http://localhost:3001');
   ```
   To:
   ```javascript
   const [backendUrl, setBackendUrl] = useState('https://your-project-name.vercel.app');
   ```
4. Commit and push:
   ```bash
   git add index.html
   git commit -m "Update backend URL for Vercel deployment"
   git push
   ```
5. Vercel will automatically redeploy

## 🔧 Project Structure

```
SD-AI_Audit/
├── api/
│   └── audit.js          # Serverless function (backend)
├── index.html            # Frontend
├── vercel.json           # Vercel configuration
└── package.json          # Dependencies
```

## 📝 How It Works

- **Frontend**: `index.html` is served as a static file
- **Backend**: `api/audit.js` runs as a serverless function
- **Routes**: 
  - `/api/*` → Serverless functions
  - `/*` → Static files (index.html)

## 🐛 Troubleshooting

### "Page not found" error
- Check that `index.html` exists in the root
- Verify `vercel.json` routes are correct

### "Failed to connect to backend"
- Check that `GEMINI_API_KEY` is set in Vercel environment variables
- Verify the backend URL in `index.html` matches your Vercel URL
- Check Vercel function logs: Dashboard → Your Project → Functions → View Logs

### "Function timeout"
- Vercel free tier has 10-second timeout for serverless functions
- Puppeteer might take longer - consider using simple fetch fallback
- Or upgrade to Vercel Pro for longer timeouts

### Puppeteer issues
- Vercel serverless functions have limited resources
- Puppeteer might not work perfectly - the code has a fallback to simple fetch
- If Puppeteer fails, it automatically uses simple fetch

## 🔄 Automatic Deployments

Vercel automatically deploys when you push to GitHub:
- Push to `main` branch → Production deployment
- Push to other branches → Preview deployment

## 📊 Monitoring

- **Deployments**: Dashboard → Your Project → Deployments
- **Function Logs**: Dashboard → Your Project → Functions → View Logs
- **Analytics**: Dashboard → Your Project → Analytics (Pro feature)

## 💰 Pricing

**Free Tier** (Hobby):
- ✅ Unlimited deployments
- ✅ 100GB bandwidth/month
- ✅ Serverless functions (10s timeout)
- ✅ Perfect for this project!

**Pro Tier** ($20/month):
- Everything in Hobby
- Longer function timeouts
- More bandwidth
- Team features

## 🎉 You're Done!

Your app should now be live at: `https://your-project-name.vercel.app`

Test it by:
1. Opening the URL in your browser
2. Entering a website URL
3. Running an audit

---

**Need Help?**
- Vercel Docs: https://vercel.com/docs
- Vercel Discord: https://vercel.com/discord

