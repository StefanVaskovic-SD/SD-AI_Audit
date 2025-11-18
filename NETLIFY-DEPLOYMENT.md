# Netlify Deployment Guide

## ⚠️ Important: Backend vs Frontend

**Netlify can only host the FRONTEND** (static HTML/CSS/JS files). The backend server (`backend-server.js`) **cannot run on Netlify** because Netlify is a static hosting service.

## Current Setup

- ✅ **Frontend**: `index.html` (can be deployed on Netlify)
- ❌ **Backend**: `backend-server.js` (needs separate hosting)

## Deployment Options

### Option 1: Frontend on Netlify + Backend on Separate Service (Recommended)

1. **Frontend (Netlify)**:
   - Already configured with `netlify.toml`
   - Deploy from GitHub: https://github.com/StefanVaskovic-SD/SD-AI_Audit
   - Netlify will automatically deploy when you push to GitHub

2. **Backend (Choose one)**:
   - **Vercel** (Recommended): https://vercel.com
     - Supports Node.js servers
     - Free tier available
     - Easy deployment from GitHub
   - **Railway**: https://railway.app
     - Supports Node.js servers
     - Free tier available
   - **Render**: https://render.com
     - Supports Node.js servers
     - Free tier available
   - **Heroku**: https://heroku.com
     - Paid service (no free tier anymore)

### Option 2: Convert Backend to Netlify Functions

Convert `backend-server.js` to Netlify serverless functions. This requires code refactoring.

## Netlify Configuration

The `netlify.toml` file is already configured:
- Publishes from root directory
- Redirects all routes to `index.html`
- Uses Node.js 18

## Environment Variables

### For Frontend (Netlify):
1. Go to Netlify Dashboard → Site Settings → Environment Variables
2. Add: `REACT_APP_BACKEND_URL` (or similar) pointing to your backend URL

### For Backend (separate service):
1. Add `.env` file with:
   ```
   GEMINI_API_KEY=your-key-here
   PORT=3001
   ```

## Current Issue

If you're seeing "Page not found" on Netlify:
1. ✅ Check that `index.html` exists (it does now)
2. ✅ Check that `netlify.toml` is configured (it is now)
3. ⚠️ **Backend URL**: The frontend needs to know where the backend is hosted
   - Update `backendUrl` in `index.html` to point to your backend service
   - Or set it via environment variable

## Next Steps

1. **Deploy backend separately** (Vercel/Railway/Render)
2. **Update frontend** to use the backend URL
3. **Redeploy frontend** on Netlify

## Quick Fix for Testing

For local testing, you can run:
```bash
# Terminal 1: Backend
npm start

# Terminal 2: Frontend (local server)
npx http-server -p 8000
```

Then open `http://localhost:8000` and set backend URL to `http://localhost:3001`

