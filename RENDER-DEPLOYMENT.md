# 🚀 Render Deployment Guide (BEST for Long-Running Tasks)

## ✅ Why Render?

**Render has 100 MINUTE timeout on FREE tier!** Perfect for detailed audits that need 1-2 minutes.

## 📋 Prerequisites

1. GitHub account (you already have this)
2. Render account (free): https://render.com
3. Gemini API key

## 🎯 Step-by-Step Deployment

### Step 1: Sign up for Render

1. Go to https://render.com
2. Sign up with your GitHub account
3. Authorize Render to access your repositories

### Step 2: Create Web Service

1. In Render dashboard, click **"New +"** → **"Web Service"**
2. Connect your GitHub repository: `StefanVaskovic-SD/SD-AI_Audit`
3. Configure:
   - **Name**: `ai-audit-tool` (or any name)
   - **Region**: Choose closest to you
   - **Branch**: `main`
   - **Root Directory**: Leave empty (root)
   - **Runtime**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `node backend-server.js`
   - **Instance Type**: **Free** (has 100 minute timeout!)

### Step 3: Add Environment Variables

1. Scroll down to **"Environment Variables"**
2. Add:
   - **Key**: `GEMINI_API_KEY`
   - **Value**: Your Gemini API key
   - Click **"Add"**
3. Add:
   - **Key**: `PORT`
   - **Value**: `10000` (Render uses this port)
   - Click **"Add"**

### Step 4: Deploy!

1. Click **"Create Web Service"**
2. Wait for deployment (usually 2-3 minutes)
3. You'll get a URL like: `https://ai-audit-tool.onrender.com`

### Step 5: Update Frontend

1. Open `index.html`
2. Change backend URL to your Render URL:
   ```javascript
   const [backendUrl, setBackendUrl] = useState('https://ai-audit-tool.onrender.com');
   ```
3. Commit and push

### Step 6: Deploy Frontend (Optional)

You can deploy frontend on:
- **Vercel** (free, fast) - just the `index.html`
- **Netlify** (free) - just the `index.html`
- **Render** (same service, different route)

## 🔧 Render Configuration

Create `render.yaml` in project root:

```yaml
services:
  - type: web
    name: ai-audit-backend
    env: node
    buildCommand: npm install
    startCommand: node backend-server.js
    envVars:
      - key: GEMINI_API_KEY
        sync: false
      - key: PORT
        value: 10000
```

## 📊 Comparison

| Platform | Free Tier Timeout | Pro Tier Timeout | Cost |
|----------|------------------|------------------|------|
| **Render** | **100 minutes** ✅ | 100 minutes | $7/mo |
| Vercel | 10 seconds | 5 minutes | $20/mo |
| Railway | 5 minutes | Unlimited | $5/mo |

## 🎉 Advantages of Render

- ✅ **100 minute timeout** on free tier
- ✅ Perfect for long-running audits
- ✅ No need to optimize code
- ✅ Can use full website content
- ✅ Can use full AI response (16k tokens)

## ⚠️ Note

Render free tier services "spin down" after 15 minutes of inactivity. First request after spin-down takes ~30 seconds to wake up. This is normal and acceptable for audit tool.

---

**This is the BEST solution for your use case!**

