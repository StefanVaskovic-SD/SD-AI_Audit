# 🌐 AI Website Audit Tool

Comprehensive website audit tool powered by Google Gemini AI. Analyze UX, content, accessibility, and more with AI-powered insights.

---

## 📋 Table of Contents

1. [Overview](#overview)
2. [Features](#features)
3. [What's Been Done](#whats-been-done)
4. [Quick Start](#quick-start)
5. [Setup Instructions](#setup-instructions)
6. [API Keys & Billing](#api-keys--billing)
7. [Usage Guide](#usage-guide)
8. [Troubleshooting](#troubleshooting)
9. [Next Steps & Future Enhancements](#next-steps--future-enhancements)
10. [Technical Details](#technical-details)

---

## 🎯 Overview

This tool allows you to audit websites for:
- **User Experience (UX)** - Navigation, CTAs, interactions, touch targets
- **Content Quality** - Message clarity, relevance, writing quality, images
- **Accessibility** - WCAG compliance, contrast ratios, focus indicators
- **User Journeys** - Critical paths, user types, pain points

The tool uses **Google Gemini 2.0 Flash** (recommended) or **Gemini 1.5 Flash** to analyze website content, providing detailed, actionable insights.

---

## ✨ Features

### Core Features
- ✅ **AI-Powered Analysis** - Deep analysis using Google Gemini
- ✅ **Automatic Website Fetching** - Backend fetches full website content using Puppeteer
- ✅ **Screenshot Capture** - Full-page and element-specific screenshots
- ✅ **PDF Export** - Export complete audit reports as PDF
- ✅ **Model Selection** - Choose between Gemini models
- ✅ **43 Audit Categories** - Comprehensive coverage across UX, content, and accessibility
- ✅ **Smart Status Detection** - Automatically detects "CANNOT VERIFY" status with neutral styling

### Technical Features
- ✅ **Puppeteer Integration** - Renders JavaScript-heavy websites
- ✅ **Fallback Mechanism** - Simple fetch if Puppeteer fails
- ✅ **JSON Response Format** - Structured, parseable audit results
- ✅ **Error Handling** - Robust error handling with helpful messages
- ✅ **Rate Limiting** - Basic in-memory rate limiting

---

## ✅ What's Been Done

### Version 2.0 - Current State

1. **✅ Gemini Integration**
   - Migrated from Anthropic Claude to Google Gemini
   - Supports `gemini-2.0-flash` (recommended) and `gemini-1.5-flash`
   - Automatic model fallback if primary model fails

2. **✅ Website Content Fetching**
   - Puppeteer for dynamic content rendering
   - Scroll mechanism to trigger lazy loading
   - Simple fetch fallback for reliability
   - HTML parsing with Cheerio

3. **✅ Screenshot Functionality**
   - Full-page screenshots captured during audit
   - Element-specific screenshots (forms, buttons, nav, headers)
   - AI can request specific screenshots via `screenshotRequest` field
   - Screenshots displayed in relevant audit sections
   - Screenshots included in PDF export

4. **✅ PDF Export**
   - Complete audit reports exported as PDF
   - Includes all findings, issues, recommendations
   - Screenshots included when AI requests them
   - Professional formatting with status colors

5. **✅ Status Logic**
   - "CANNOT VERIFY" status with neutral gray styling
   - Automatic detection of unverifiable items
   - Proper color coding (green/yellow/red/gray)

6. **✅ Backend Architecture**
   - Express.js server with CORS
   - Secure API key management via `.env`
   - Rate limiting
   - Health check endpoint

7. **✅ Frontend Improvements**
   - Model selection dropdown
   - Backend URL configuration
   - Loading states
   - Error handling
   - Responsive design

### Previous Versions

- **v1.0**: Initial implementation with Claude
- **v1.5**: Added backend server and website fetching
- **v2.0**: Gemini integration, screenshots, PDF export

---

## 🚀 Quick Start

### Prerequisites
- Node.js 18 or higher
- npm or yarn
- Gemini API Key ([Get it here](https://aistudio.google.com/app/apikey))

### 3-Step Setup

#### Step 1: Install Dependencies
```bash
npm install
```

This installs:
- `@google/generative-ai` - Gemini SDK
- `puppeteer` - Website fetching (headless browser)
- `cheerio` - HTML parsing
- `express`, `cors`, `dotenv` - Backend server

**Note:** Puppeteer downloads Chromium (~200MB), so installation may take a few minutes.

#### Step 2: Configure API Key

Create a `.env` file in the project root:

```bash
touch .env
```

Add your Gemini API key:

```env
GEMINI_API_KEY=AIzaSyC-your-api-key-here
PORT=3001
```

#### Step 3: Start the Server

```bash
npm start
```

You should see:
```
✅ Gemini API key configured
🚀 Audit Tool Backend Server running on http://localhost:3001
```

### Using the Tool

1. **Open** `website-audit-tool.html` in your browser
2. **Enter** a website URL (e.g., `https://example.com`)
3. **Select** "Gemini 2.0 Flash" as the AI model (default)
4. **Select** audit categories you want to check
5. **Click** "Start Audit"
6. **Wait** 30-60 seconds for analysis
7. **Review** the comprehensive audit report!
8. **Export** to PDF if needed

---

## 📖 Setup Instructions

### Detailed Installation

#### 1. Install Dependencies

```bash
npm install
```

If you encounter issues:

```bash
# Try with --force
npm install --force

# Or clean install
rm -rf node_modules package-lock.json
npm install
```

#### 2. Create .env File

```bash
# Create .env file
touch .env
```

Or use your preferred editor:

```bash
nano .env
# or
code .env
```

Add your configuration:

```env
# Required: Gemini API Key
GEMINI_API_KEY=AIzaSyC-your-api-key-here

# Optional: Server Port (default: 3001)
PORT=3001
```

#### 3. Start Backend Server

**Development mode (with auto-reload):**
```bash
npm run dev
```

**Production mode:**
```bash
npm start
```

**Verify it's running:**
```bash
curl http://localhost:3001/api/health
```

Expected response:
```json
{
  "status": "ok",
  "message": "Backend server is running",
  "models": {
    "gemini": true
  }
}
```

#### 4. Open Frontend

**Option A: Direct in Browser**
- Double-click `website-audit-tool.html`
- Or: `open website-audit-tool.html` (macOS)

**Option B: Local Server (Recommended)**
```bash
# Python 3
python3 -m http.server 8000

# Or Node.js http-server
npx http-server -p 8000
```

Then open: `http://localhost:8000/website-audit-tool.html`

#### 5. Configure Frontend

In the frontend, set:
- **Backend URL**: `http://localhost:3001` (default)
- **AI Model**: `Gemini 2.0 Flash` (recommended)

---

## 🔑 API Keys & Billing

### Getting a Gemini API Key

1. Go to [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Sign in with your Google account
3. Click "Create API Key"
4. Copy your API key (starts with `AIza...`)
5. Add it to your `.env` file

### Billing Setup

**Important:** Some Gemini models (like `gemini-2.0-flash`) may require billing to be enabled, even for the free tier.

#### Enable Billing (if needed)

1. Go to [Google AI Studio](https://aistudio.google.com/)
2. Click **Settings** (⚙️) in the bottom left
3. Select **Plan information**
4. Click **Set up Billing** for your project
5. Add a payment method (credit card)

**Note:**
- Free tier still exists (60 requests/minute)
- Billing is only used if you exceed the free limit
- Some models require billing to be enabled even for free tier usage

#### Models & Billing Requirements

| Model | Billing Required? | Notes |
|-------|------------------|-------|
| `gemini-pro` | ❌ Usually not | Older, stable model |
| `gemini-1.5-flash` | ⚠️ May require | Faster, newer |
| `gemini-2.0-flash` | ⚠️ May require | Latest, recommended |
| `gemini-1.5-pro` | ⚠️ May require | More powerful |

**Recommendation:**
- Start with `gemini-2.0-flash` (if billing is enabled)
- Or use `gemini-pro` if you don't want to enable billing yet

### API Limits

**Free Tier:**
- 60 requests per minute
- Perfect for testing and development
- No credit card required (but billing may need to be enabled)

**Paid Tier:**
- Pay-as-you-go pricing
- $1.25 per 1M input tokens (first 128K)
- $5 per 1M output tokens
- Very affordable for production use

---

## 📚 Usage Guide

### Basic Usage

1. **Enter Website URL**
   - Full URL with protocol (e.g., `https://example.com`)
   - The tool will fetch and analyze the website

2. **Select Audit Categories**
   - **User Journeys** (10 items) - Critical paths, user types, pain points
   - **User Experience** (9 items) - Navigation, CTAs, interactions
   - **Content Assessment** (9 items) - Message clarity, quality, images
   - **Accessibility** (15 items) - WCAG compliance, contrast, focus

3. **Choose AI Model**
   - **Gemini 2.0 Flash** (Recommended) - Latest, fastest
   - **Gemini 1.5 Flash** - Alternative option

4. **Start Audit**
   - Click "Start Audit" button
   - Wait 30-60 seconds for analysis
   - Review the comprehensive report

5. **Export Results**
   - Click "Export PDF" to download the report
   - PDF includes all findings, screenshots, and recommendations

### Understanding Audit Results

#### Status Colors
- 🟢 **GOOD** (Green) - No issues found
- 🟡 **WARNING** (Yellow) - Minor issues or improvements needed
- 🔴 **CRITICAL** (Red) - Major issues requiring immediate attention
- ⚪ **CANNOT VERIFY** (Gray) - AI couldn't verify from static HTML (may be dynamically loaded)

#### Report Sections
- **Findings** - Detailed analysis of the item
- **Issues Found** - Specific problems identified
- **Recommendations** - Actionable suggestions for improvement
- **Screenshots** - Visual evidence when AI requests it

### Tips for Best Results

1. **Use Full URLs** - Include `https://` protocol
2. **Wait for Complete Analysis** - Don't interrupt the process
3. **Check Multiple Pages** - Run audits on different pages for comprehensive coverage
4. **Review Screenshots** - Visual evidence helps understand issues
5. **Export PDFs** - Save reports for future reference

---

## 🐛 Troubleshooting

### Backend Issues

#### "GEMINI_API_KEY not found"
- ✅ Check `.env` file exists in project root
- ✅ Verify API key is correct (starts with `AIza`)
- ✅ Restart server after updating `.env`

#### "Port 3001 already in use"
```bash
# Find process using port 3001
lsof -ti:3001

# Kill the process
kill -9 $(lsof -ti:3001)

# Or change port in .env
PORT=3002
```

#### Backend won't start
- ✅ Check Node.js version: `node --version` (needs 18+)
- ✅ Run `npm install` to ensure dependencies are installed
- ✅ Check `.env` file exists and has valid API key

### Frontend Issues

#### "Failed to connect to backend"
- ✅ Make sure backend is running (`npm start`)
- ✅ Check backend URL in frontend matches (default: `http://localhost:3001`)
- ✅ Verify CORS is enabled (it is by default)
- ✅ Check browser console for errors

#### Frontend shows nothing
- ✅ Check browser console for JavaScript errors
- ✅ Ensure `website-audit-tool.html` is opened correctly
- ✅ Try opening in a different browser
- ✅ Check if CDN links are accessible

### API Issues

#### "404 Not Found" for Gemini models
- ✅ Enable billing in Google AI Studio (see [Billing Setup](#billing-setup))
- ✅ Verify API key is valid
- ✅ Try using `gemini-pro` model (may not require billing)

#### "Rate limit exceeded"
- ✅ Free tier: 60 requests/minute
- ✅ Wait a minute and try again
- ✅ Consider enabling billing for higher limits

#### "Failed to fetch website"
- ✅ Website might block automated requests
- ✅ Check URL is correct and accessible
- ✅ Try a different website
- ✅ Check if Puppeteer is working (check backend logs)

### Puppeteer Issues

#### Puppeteer fails to load website
- ✅ Check if Chromium is installed (Puppeteer downloads it automatically)
- ✅ Try updating Puppeteer: `npm install puppeteer@latest`
- ✅ Check system dependencies (varies by OS)

**macOS:**
```bash
brew install chromium
```

**Linux (Ubuntu/Debian):**
```bash
sudo apt-get install -y chromium-browser
```

#### Puppeteer timeout errors
- ✅ Website might be slow to load
- ✅ Check backend logs for specific errors
- ✅ Tool will automatically fallback to simple fetch

### JSON Parsing Errors

#### "Invalid JSON response"
- ✅ This is usually handled automatically by the backend
- ✅ Backend attempts to fix common JSON errors
- ✅ If persistent, try a different model
- ✅ Check backend logs for AI response

### General Issues

#### npm install fails
```bash
# Try with --force
npm install --force

# Or clean install
rm -rf node_modules package-lock.json
npm install
```

#### Dependencies not installing
- ✅ Check internet connection
- ✅ Try clearing npm cache: `npm cache clean --force`
- ✅ Check Node.js version compatibility

---

## 🚀 Next Steps & Future Enhancements

### ✅ Completed Features

1. ✅ Gemini Integration - Successfully integrated Gemini 2.0 Flash
2. ✅ Website Fetching - Puppeteer with simple fetch fallback
3. ✅ PDF Export - Full audit reports can be exported as PDF
4. ✅ Model Selection - Users can choose between Gemini models
5. ✅ Screenshot Functionality - Full-page and element-specific screenshots
6. ✅ Status Logic - "CANNOT VERIFY" status with neutral styling
7. ✅ Error Handling - Better error messages and JSON parsing

### 🎯 Recommended Next Moves

#### Priority 1: Core Improvements (Quick Wins)

1. **Loading States** ⏳
   - [ ] Add loading progress indicator
   - [ ] Show estimated time remaining
   - [ ] Better visual feedback during analysis
   - [ ] Step-by-step progress (Fetching → Analyzing → Generating)

2. **Audit History & Storage**
   - [ ] Save audit reports locally (localStorage)
   - [ ] View previous audits
   - [ ] Compare audits (before/after)
   - [ ] Delete old audits

3. **Export Improvements**
   - [ ] Export to DOCX/Word format
   - [ ] Export to CSV (for data analysis)
   - [ ] Export to JSON (for developers)
   - [ ] Shareable links for reports

#### Priority 2: Feature Enhancements

4. **Performance Metrics**
   - [ ] Integrate Google PageSpeed Insights API
   - [ ] Lighthouse scores
   - [ ] Core Web Vitals
   - [ ] Load time analysis

5. **Advanced Analysis**
   - [ ] SEO audit (meta tags, headings, alt text)
   - [ ] Security audit (HTTPS, headers, vulnerabilities)
   - [ ] Mobile responsiveness scoring
   - [ ] Browser compatibility check

6. **UI/UX Improvements**
   - [ ] Dark/Light theme toggle
   - [ ] Collapsible sections in report
   - [ ] Search/filter within audit report
   - [ ] Print-friendly view
   - [ ] Mobile-responsive design improvements

#### Priority 3: Advanced Features

7. **Scheduled Audits**
   - [ ] Schedule recurring audits
   - [ ] Email notifications when audits complete
   - [ ] Track changes over time
   - [ ] Trend analysis

8. **Team Collaboration**
   - [ ] User accounts/authentication
   - [ ] Share audits with team members
   - [ ] Comments/notes on findings
   - [ ] Assign issues to team members

9. **API & Integration**
   - [ ] REST API for programmatic access
   - [ ] Webhook support
   - [ ] Slack/Teams integration
   - [ ] CI/CD integration (GitHub Actions)

### 💡 Quick Wins (Can Do Now)

1. **Add loading states** - Show progress during audit
2. **Local storage** - Save audits in browser
3. **Better PDF formatting** - Improve PDF layout
4. **Error recovery** - Retry failed requests
5. **Keyboard shortcuts** - Quick actions (Ctrl+S to save, etc.)

### 🎨 UI Polish

- [ ] Animations for better UX
- [ ] Toast notifications
- [ ] Skeleton loaders
- [ ] Better color scheme
- [ ] Icons for different issue types
- [ ] Progress bars

---

## 🔧 Technical Details

### Architecture

```
┌─────────────┐
│   Browser   │
│  (Frontend) │
└──────┬──────┘
       │ HTTP Request
       ▼
┌─────────────────┐
│  Backend Server │
│  (Express.js)   │
└──────┬──────────┘
       │
       ├──► Puppeteer ──► Fetch Website Content
       │
       ├──► Gemini API ──► AI Analysis
       │
       └──► Response ──► JSON Audit Report
```

### File Structure

```
files-v3/
├── backend-server.js          # Express server, AI integration
├── website-audit-tool.html    # Frontend UI (React embedded)
├── package.json               # Dependencies
├── .env                       # API keys (not in git)
├── README.md                  # This file
└── node_modules/              # Dependencies
```

### API Endpoints

#### `POST /api/audit`
Analyze a website.

**Request:**
```json
{
  "url": "https://example.com",
  "auditOptions": {
    "userJourneys": ["criticalJourneys", "userTypes"],
    "userExperience": ["navigation", "ctas"],
    "contentAssessment": ["messageClarity"],
    "accessibility": ["wcagCompliance"]
  },
  "model": "gemini-2.0-flash"
}
```

**Response:**
```json
{
  "success": true,
  "report": {
    "categories": [
      {
        "title": "Category Name",
        "items": [
          {
            "label": "Item label",
            "status": "good|warning|critical|cannot_verify",
            "findings": "Detailed description",
            "issues": ["Issue 1", "Issue 2"],
            "recommendations": ["Recommendation 1"],
            "screenshotRequest": "optional description"
          }
        ]
      }
    ]
  },
  "screenshot": "data:image/png;base64,...",
  "elementScreenshots": {
    "form": "data:image/png;base64,...",
    "button": "data:image/png;base64,..."
  }
}
```

#### `GET /api/health`
Health check endpoint.

**Response:**
```json
{
  "status": "ok",
  "message": "Backend server is running",
  "models": {
    "gemini": true
  }
}
```

### Dependencies

**Core:**
- `express` - Web server framework
- `@google/generative-ai` - Gemini SDK
- `puppeteer` - Headless browser for website fetching
- `cheerio` - HTML parsing

**Utilities:**
- `cors` - Cross-origin resource sharing
- `dotenv` - Environment variable management

**Note:** Only Gemini SDK is used. Claude support has been completely removed.

### Environment Variables

```env
# Required
GEMINI_API_KEY=AIzaSyC-your-api-key-here

# Optional
PORT=3001
```

### How Website Fetching Works

1. **Puppeteer (Primary Method)**
   - Launches headless Chromium browser
   - Navigates to website
   - Waits for page to load (networkidle0)
   - Scrolls page to trigger lazy loading
   - Captures full-page screenshot
   - Captures element-specific screenshots
   - Extracts HTML content
   - Parses with Cheerio for structured data

2. **Simple Fetch (Fallback)**
   - Uses Node.js `fetch` or `https` module
   - Fetches HTML directly
   - Parses with Cheerio
   - No screenshot support

### How AI Analysis Works

1. **Content Preparation**
   - Website HTML is parsed and structured
   - Key elements extracted (title, headings, links, forms, etc.)
   - Screenshots included in prompt

2. **Prompt Generation**
   - Detailed instructions for AI
   - Website content included
   - Audit categories specified
   - JSON format requirements

3. **AI Processing**
   - Gemini analyzes content
   - Returns structured JSON response
   - Backend validates and fixes JSON if needed

4. **Response Formatting**
   - JSON is parsed and validated
   - Screenshots attached
   - Response sent to frontend

### Security Considerations

- ✅ API keys stored in `.env` (not committed to git)
- ✅ Backend proxies API calls (keys never exposed to frontend)
- ✅ CORS enabled for local development
- ✅ Rate limiting on backend
- ⚠️ For production: Add authentication, HTTPS, stricter CORS

### Performance

- **Typical Audit Time**: 30-60 seconds
- **Website Fetching**: 5-15 seconds (depends on site)
- **AI Analysis**: 20-40 seconds (depends on content size)
- **PDF Generation**: 2-5 seconds

### Limitations

- Puppeteer may fail on some websites (automatic fallback)
- Free tier: 60 requests/minute
- Large websites may hit token limits
- Some dynamic content may not be captured

---

## 📝 License

MIT License - Feel free to use and modify as needed.

---

## 🤝 Contributing

This is a personal project, but suggestions and improvements are welcome!

---

## 📞 Support

For issues or questions:
1. Check the [Troubleshooting](#troubleshooting) section
2. Review backend logs for errors
3. Check browser console for frontend errors

---

**Happy Auditing!** 🚀

