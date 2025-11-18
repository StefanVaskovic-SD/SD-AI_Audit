// Vercel serverless function wrapper
// This exports the Express app handler for Vercel

const express = require('express');
const cors = require('cors');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const cheerio = require('cheerio');

// Try to load puppeteer
let puppeteer;
try {
  puppeteer = require('puppeteer');
} catch (e) {
  console.warn('Puppeteer not available, will use simple fetch instead');
}

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Initialize AI client
const genAI = process.env.GEMINI_API_KEY ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY) : null;

// Rate limiting
const requestCounts = new Map();
const RATE_LIMIT = 10;
const RATE_WINDOW = 60 * 60 * 1000;

function checkRateLimit(ip) {
  const now = Date.now();
  const userRequests = requestCounts.get(ip) || [];
  const recentRequests = userRequests.filter(time => now - time < RATE_WINDOW);
  
  if (recentRequests.length >= RATE_LIMIT) {
    return false;
  }
  
  recentRequests.push(now);
  requestCounts.set(ip, recentRequests);
  return true;
}

// Simple fetch function
async function fetchWebsiteSimple(url) {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
      }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const html = await response.text();
    const $ = cheerio.load(html);
    
    const structuredData = {
      title: $('title').text() || 'No title',
      metaDescription: $('meta[name="description"]').attr('content') || '',
      headings: {
        h1: $('h1').map((i, el) => $(el).text()).get(),
        h2: $('h2').map((i, el) => $(el).text()).get(),
        h3: $('h3').map((i, el) => $(el).text()).get(),
      },
      links: $('a').map((i, el) => ({
        text: $(el).text().trim(),
        href: $(el).attr('href'),
        isCTA: $(el).text().toLowerCase().includes('click') || 
               $(el).text().toLowerCase().includes('buy') ||
               $(el).text().toLowerCase().includes('sign up') ||
               $(el).text().toLowerCase().includes('contact')
      })).get().slice(0, 50),
      images: $('img').map((i, el) => ({
        src: $(el).attr('src'),
        alt: $(el).attr('alt') || '',
        title: $(el).attr('title') || ''
      })).get().slice(0, 30),
      forms: $('form').length,
      buttons: $('button, input[type="submit"], input[type="button"]').map((i, el) => ({
        text: $(el).text() || $(el).attr('value') || '',
        type: $(el).attr('type') || 'button'
      })).get(),
      textContent: $('body').text().replace(/\s+/g, ' ').trim().substring(0, 50000)
    };
    
    return {
      url,
      html: html.substring(0, 200000),
      structuredData,
      screenshot: null,
      elementScreenshots: null,
      fetchedAt: new Date().toISOString()
    };
  } catch (error) {
    throw new Error(`Simple fetch failed: ${error.message}`);
  }
}

// Website fetching function
async function fetchWebsiteContent(url) {
  if (puppeteer) {
    let browser;
    try {
      browser = await puppeteer.launch({
        headless: 'new',
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu'
        ],
        timeout: 60000,
        ignoreHTTPSErrors: true
      });
      
      const page = await browser.newPage();
      await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
      await page.setViewport({ width: 1920, height: 1080 });
      
      try {
        await page.goto(url, { waitUntil: 'networkidle0', timeout: 60000 });
      } catch (navError) {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      }
      
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      await page.evaluate(async () => {
        await new Promise((resolve) => {
          let totalHeight = 0;
          const distance = 100;
          const timer = setInterval(() => {
            const scrollHeight = document.body.scrollHeight;
            window.scrollBy(0, distance);
            totalHeight += distance;
            if(totalHeight >= scrollHeight){
              clearInterval(timer);
              window.scrollTo(0, 0);
              resolve();
            }
          }, 100);
        });
      });
      
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const html = await page.content();
      const title = await page.title();
      
      let screenshot = null;
      try {
        screenshot = await page.screenshot({ type: 'png', fullPage: true, encoding: 'base64' });
      } catch (screenshotError) {
        try {
          screenshot = await page.screenshot({ type: 'png', encoding: 'base64' });
        } catch (e) {}
      }
      
      const elementScreenshots = {};
      const selectors = ['form', 'button', 'input[type="submit"]', '.cta', '[class*="button"]', '[class*="form"]', 'nav', 'header'];
      
      for (const selector of selectors) {
        try {
          const elements = await page.$$(selector);
          if (elements.length > 0) {
            const elementScreenshot = await elements[0].screenshot({ type: 'png', encoding: 'base64' });
            elementScreenshots[selector] = `data:image/png;base64,${elementScreenshot}`;
          }
        } catch (e) {}
      }
      
      await browser.close();
      
      const $ = cheerio.load(html);
      const structuredData = {
        title: title || $('title').text() || 'No title',
        metaDescription: $('meta[name="description"]').attr('content') || '',
        headings: {
          h1: $('h1').map((i, el) => $(el).text()).get(),
          h2: $('h2').map((i, el) => $(el).text()).get(),
          h3: $('h3').map((i, el) => $(el).text()).get(),
        },
        links: $('a').map((i, el) => ({
          text: $(el).text().trim(),
          href: $(el).attr('href'),
          isCTA: $(el).text().toLowerCase().includes('click') || 
                 $(el).text().toLowerCase().includes('buy') ||
                 $(el).text().toLowerCase().includes('sign up') ||
                 $(el).text().toLowerCase().includes('contact')
        })).get().slice(0, 50),
        images: $('img').map((i, el) => ({
          src: $(el).attr('src'),
          alt: $(el).attr('alt') || '',
          title: $(el).attr('title') || ''
        })).get().slice(0, 30),
        forms: $('form').length,
        buttons: $('button, input[type="submit"], input[type="button"]').map((i, el) => ({
          text: $(el).text() || $(el).attr('value') || '',
          type: $(el).attr('type') || 'button'
        })).get(),
        textContent: $('body').text().replace(/\s+/g, ' ').trim().substring(0, 50000)
      };
      
      return {
        url,
        html: html.substring(0, 200000),
        structuredData,
        screenshot: screenshot ? `data:image/png;base64,${screenshot}` : null,
        elementScreenshots: Object.keys(elementScreenshots).length > 0 ? elementScreenshots : null,
        fetchedAt: new Date().toISOString()
      };
      
    } catch (puppeteerError) {
      if (browser) {
        try {
          await browser.close();
        } catch (e) {}
      }
      return await fetchWebsiteSimple(url);
    }
  } else {
    return await fetchWebsiteSimple(url);
  }
}

// Generate audit prompt based on selected options
function generateAuditPrompt(url, websiteContent, auditOptions) {
  let prompt = `You are an expert UX/UI auditor and web accessibility specialist. Analyze the following website and provide a comprehensive audit report.

WEBSITE URL: ${url}

WEBSITE CONTENT:
Title: ${websiteContent.structuredData.title}
Meta Description: ${websiteContent.structuredData.metaDescription}

HEADINGS:
H1: ${websiteContent.structuredData.headings.h1.join(', ')}
H2: ${websiteContent.structuredData.headings.h2.slice(0, 10).join(', ')}
H3: ${websiteContent.structuredData.headings.h3.slice(0, 10).join(', ')}

TEXT CONTENT (first 50,000 characters):
${websiteContent.structuredData.textContent}

IMAGES FOUND: ${websiteContent.structuredData.images.length} images
${websiteContent.structuredData.images.slice(0, 10).map(img => `- ${img.alt || 'No alt text'}: ${img.src}`).join('\n')}

LINKS FOUND: ${websiteContent.structuredData.links.length} links
CTAs: ${websiteContent.structuredData.links.filter(l => l.isCTA).length}

FORMS: ${websiteContent.structuredData.forms}
BUTTONS: ${websiteContent.structuredData.buttons.length}

HTML STRUCTURE (sample):
${websiteContent.html.substring(0, 10000)}

AUDIT INSTRUCTIONS:
THOROUGHLY examine ALL the provided content. Important considerations:
- Many modern websites use lazy-loading, JavaScript rendering, and dynamic content
- Look carefully for: image tags with client logos, testimonial sections, team info, case studies
- Check class names, section headings, alt text, and content structure
- If you find evidence of something (like logo images or testimonial text), report it ACCURATELY
- If you CANNOT verify something from the HTML (may be JS-loaded), state "Cannot verify from static HTML - may be dynamically loaded"
- DO NOT assume something is missing just because it's not immediately obvious
- Be precise and honest about what you can and cannot see in the code

Analyze ONLY the following checked items and provide detailed findings, issues, and recommendations for each:

`;

  Object.entries(auditOptions).forEach(([categoryKey, category]) => {
    const checkedItems = Object.entries(category.items)
      .filter(([_, item]) => item.checked);
    
    if (checkedItems.length > 0) {
      prompt += `\n## ${category.title.toUpperCase()}\n`;
      checkedItems.forEach(([itemKey, item]) => {
        prompt += `\n✓ ${item.label}\n`;
      });
    }
  });

  prompt += `\n\nCRITICAL: YOU MUST RESPOND WITH VALID JSON ONLY. NO MARKDOWN, NO EXPLANATIONS, NO BACKTICKS.

FORMAT YOUR RESPONSE AS THIS EXACT JSON STRUCTURE:
{
  "categories": [
    {
      "title": "Category Name",
      "items": [
        {
          "label": "Item label",
          "status": "good",
          "findings": "Detailed description",
          "issues": ["Issue 1", "Issue 2"],
          "recommendations": ["Recommendation 1", "Recommendation 2"],
          "screenshotRequest": "optional - describe what element/area would benefit from a screenshot"
        }
      ]
    }
  ]
}

STRICT JSON RULES:
1. Start with { and end with }
2. All strings must be in double quotes "
3. All arrays must be properly closed with ]
4. All objects must be properly closed with }
5. Use "good", "warning", or "critical" for status (lowercase, in quotes)
6. Escape any quotes in text content with \\"
7. Do NOT include markdown code blocks
8. Do NOT include any text before or after the JSON
9. Ensure all commas are present between array/object elements
10. If content is very long, truncate it rather than breaking JSON structure

SCREENSHOT RECOMMENDATIONS:
- If you identify a specific issue that would benefit from a visual screenshot, you can add a "screenshotRequest" field to that item
- Format: "screenshotRequest": "description of what element/area to screenshot" (e.g., "form with validation issues", "navigation menu", "CTA button")
- Only request screenshots when they would help illustrate the issue or recommendation
- Available element screenshots are listed above - reference them if relevant

IMPORTANT: 
- Be specific and actionable in your recommendations
- Use "good" status for things done well, "warning" for minor issues, "critical" for serious problems
- Provide code examples or specific changes where relevant
- If you cannot assess something (like actual performance metrics), state that clearly
- When analyzing trust elements (logos, testimonials, case studies): Look for <img> tags, testimonial sections, client name mentions, and quote blocks
- If you see evidence of these elements in the HTML, acknowledge them positively

RESPOND WITH ONLY THE JSON OBJECT, NOTHING ELSE.`;

  return prompt;
}

// Audit endpoint
app.post('/api/audit', async (req, res) => {
  try {
    const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress || 'unknown';
    
    if (!checkRateLimit(ip)) {
      return res.status(429).json({ error: 'Rate limit exceeded' });
    }
    
    const { url, auditOptions, model = 'gemini-2.0-flash' } = req.body;
    
    if (!url || !auditOptions) {
      return res.status(400).json({ error: 'URL and audit options are required' });
    }
    
    if (!genAI) {
      return res.status(500).json({ error: 'Gemini API key not configured' });
    }
    
    const websiteContent = await fetchWebsiteContent(url);
    const prompt = generateAuditPrompt(url, websiteContent, auditOptions);
    
    const modelName = model || 'gemini-2.0-flash';
    const geminiModel = genAI.getGenerativeModel({ model: modelName });
    
    const result = await geminiModel.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.3,
        topK: 40,
        topP: 0.95,
        maxOutputTokens: 16000,
        responseMimeType: 'application/json',
      }
    });
    
    let responseText = result.response.text();
    responseText = responseText.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    
    let auditReport;
    try {
      auditReport = JSON.parse(responseText);
    } catch (parseError) {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        auditReport = JSON.parse(jsonMatch[0]);
      } else {
        throw parseError;
      }
    }
    
    res.json({
      success: true,
      report: auditReport,
      screenshot: websiteContent.screenshot || null,
      elementScreenshots: websiteContent.elementScreenshots || null
    });
    
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Failed to generate audit', details: error.message });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    message: 'Backend server is running',
    models: { gemini: !!process.env.GEMINI_API_KEY }
  });
});

// Export for Vercel
module.exports = app;
