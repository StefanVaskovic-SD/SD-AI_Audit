// backend-server.js
// Express server for AI Website Audit Tool
// Supports Gemini 2.0 Flash and Gemini 1.5 Flash with website content fetching

const express = require('express');
const cors = require('cors');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const cheerio = require('cheerio');
require('dotenv').config();

// Try to load puppeteer, but don't fail if it's not available
let puppeteer;
try {
  puppeteer = require('puppeteer');
} catch (e) {
  console.warn('Puppeteer not available, will use simple fetch instead');
}

const app = express();
const PORT = process.env.PORT || 3001;

// Initialize AI client
const genAI = process.env.GEMINI_API_KEY ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY) : null;

// Middleware
app.use(cors()); // Allow requests from frontend
app.use(express.json({ limit: '50mb' })); // Parse JSON requests (increased for website content)
app.use(express.static('.')); // Serve static files (including index.html)

// Rate limiting (simple in-memory implementation)
const requestCounts = new Map();
const RATE_LIMIT = 10; // requests per hour
const RATE_WINDOW = 60 * 60 * 1000; // 1 hour in milliseconds

function checkRateLimit(ip) {
  const now = Date.now();
  const userRequests = requestCounts.get(ip) || [];
  
  // Remove old requests outside the window
  const recentRequests = userRequests.filter(time => now - time < RATE_WINDOW);
  
  if (recentRequests.length >= RATE_LIMIT) {
    return false;
  }
  
  recentRequests.push(now);
  requestCounts.set(ip, recentRequests);
  return true;
}

// Simple fetch function (fallback when Puppeteer fails)
async function fetchWebsiteSimple(url) {
  try {
    console.log(`[${new Date().toISOString()}] Fetching website with simple fetch: ${url}`);
    
    // Use Node.js built-in https/http or fetch (Node 18+)
    let response;
    if (typeof fetch !== 'undefined') {
      // Node.js 18+ has fetch
      response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5'
        }
      });
    } else {
      // Fallback to https module for older Node.js
      const https = require('https');
      const http = require('http');
      const { URL } = require('url');
      
      const urlObj = new URL(url);
      const client = urlObj.protocol === 'https:' ? https : http;
      
      response = await new Promise((resolve, reject) => {
        const req = client.get(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
          }
        }, (res) => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => {
            resolve({
              ok: res.statusCode >= 200 && res.statusCode < 300,
              status: res.statusCode,
              statusText: res.statusMessage,
              text: () => Promise.resolve(data)
            });
          });
        });
        req.on('error', reject);
        req.setTimeout(30000, () => {
          req.destroy();
          reject(new Error('Request timeout'));
        });
      });
    }
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const html = typeof response.text === 'function' ? await response.text() : response.text();
    const $ = cheerio.load(html);
    
    // Extract structured data
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
      mobileData: null, // Simple fetch can't capture mobile viewport
      fetchedAt: new Date().toISOString()
    };
  } catch (error) {
    throw new Error(`Simple fetch failed: ${error.message}`);
  }
}

// Website fetching function - tries Puppeteer first, falls back to simple fetch
async function fetchWebsiteContent(url) {
  // Try Puppeteer first if available
  if (puppeteer) {
    let browser;
    try {
      console.log(`[${new Date().toISOString()}] Attempting to fetch with Puppeteer: ${url}`);
      
      browser = await puppeteer.launch({
        headless: 'new', // Use new headless mode
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu',
          '--disable-web-security',
          '--disable-blink-features=AutomationControlled',
          '--window-size=1920,1080'
        ],
        timeout: 60000,
        ignoreHTTPSErrors: true
      });
      
      const page = await browser.newPage();
      
      // Set user agent
      await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
      await page.setViewport({ width: 1920, height: 1080 });
      
      // Navigate with better error handling
      try {
        await page.goto(url, { 
          waitUntil: 'networkidle0', 
          timeout: 60000 
        });
      } catch (navError) {
        console.warn('Navigation with networkidle0 failed, trying domcontentloaded:', navError.message);
        try {
          await page.goto(url, { 
            waitUntil: 'domcontentloaded', 
            timeout: 30000 
          });
        } catch (navError2) {
          console.warn('Navigation with domcontentloaded also failed:', navError2.message);
          // Continue anyway - page might have loaded
        }
      }
      
      // Wait for page to stabilize
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // Scroll to trigger lazy loading
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
              window.scrollTo(0, 0); // Scroll back to top
              resolve();
            }
          }, 100);
        });
      });
      
      // Wait again after scrolling
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Get desktop content
      const html = await page.content();
      const title = await page.title();
      
      // Parse desktop content with Cheerio
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
      
      console.log(`[${new Date().toISOString()}] Desktop content fetched successfully`);
      
      // Now capture mobile viewport data
      console.log(`[${new Date().toISOString()}] Capturing mobile viewport data...`);
      let mobileData = null;
      try {
        // Set mobile viewport (iPhone 12 Pro dimensions - common mobile size)
        await page.setViewport({ 
          width: 390, 
          height: 844,
          deviceScaleFactor: 3, // Retina display
          isMobile: true,
          hasTouch: true
        });
        
        // Set mobile user agent
        await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1');
        
        // Reload page with mobile viewport to ensure proper rendering
        await page.reload({ waitUntil: 'networkidle0', timeout: 30000 }).catch(() => {
          return page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
        }).catch(() => {
          console.warn('Mobile page reload failed, continuing with current state');
        });
        
        // Wait for mobile layout to stabilize
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Scroll to trigger lazy loading on mobile
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
                window.scrollTo(0, 0); // Scroll back to top
                resolve();
              }
            }, 100);
          });
        });
        
        // Wait again after scrolling
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        // Get mobile HTML and extract mobile-specific data
        const mobileHtml = await page.content();
        const $mobile = cheerio.load(mobileHtml);
        
        // Extract mobile-specific accessibility data
        mobileData = await page.evaluate(() => {
          const getElementSize = (el) => {
            const rect = el.getBoundingClientRect();
            return {
              width: Math.round(rect.width),
              height: Math.round(rect.height),
              x: Math.round(rect.x),
              y: Math.round(rect.y)
            };
          };
          
          const getComputedStyle = (el, prop) => {
            return window.getComputedStyle(el).getPropertyValue(prop);
          };
          
          // Check viewport meta tag
          const viewportMeta = document.querySelector('meta[name="viewport"]');
          const viewportContent = viewportMeta ? viewportMeta.getAttribute('content') : null;
          
          // Analyze touch targets (buttons, links, inputs)
          const interactiveElements = [];
          const selectors = ['button', 'a', 'input', 'select', 'textarea', '[role="button"]', '[tabindex]'];
          
          selectors.forEach(selector => {
            document.querySelectorAll(selector).forEach((el, index) => {
              if (index < 20) { // Limit to first 20 of each type
                const size = getElementSize(el);
                const fontSize = parseInt(getComputedStyle(el, 'font-size')) || 16;
                const paddingTop = parseInt(getComputedStyle(el, 'padding-top')) || 0;
                const paddingBottom = parseInt(getComputedStyle(el, 'padding-bottom')) || 0;
                const paddingLeft = parseInt(getComputedStyle(el, 'padding-left')) || 0;
                const paddingRight = parseInt(getComputedStyle(el, 'padding-right')) || 0;
                
                // Calculate effective touch target (including padding)
                const effectiveWidth = size.width + paddingLeft + paddingRight;
                const effectiveHeight = size.height + paddingTop + paddingBottom;
                
                interactiveElements.push({
                  tag: el.tagName.toLowerCase(),
                  text: el.textContent.trim().substring(0, 50),
                  size: size,
                  effectiveSize: {
                    width: effectiveWidth,
                    height: effectiveHeight
                  },
                  fontSize: fontSize,
                  meetsWCAG: effectiveWidth >= 44 && effectiveHeight >= 44,
                  hasLabel: el.getAttribute('aria-label') || el.getAttribute('title') || el.textContent.trim().length > 0
                });
              }
            });
          });
          
          // Check spacing between interactive elements
          const spacingIssues = [];
          interactiveElements.forEach((el1, i) => {
            interactiveElements.slice(i + 1).forEach(el2 => {
              const distanceX = Math.abs(el1.size.x - el2.size.x);
              const distanceY = Math.abs(el1.size.y - el2.size.y);
              const minDistance = 8; // WCAG recommends at least 8px spacing
              
              if (distanceX < minDistance && distanceY < minDistance) {
                spacingIssues.push({
                  element1: el1.text.substring(0, 30),
                  element2: el2.text.substring(0, 30),
                  distance: Math.min(distanceX, distanceY)
                });
              }
            });
          });
          
          // Check for mobile-specific CSS (media queries)
          const stylesheets = Array.from(document.styleSheets);
          let hasMobileMediaQueries = false;
          let mobileBreakpoints = [];
          
          stylesheets.forEach(sheet => {
            try {
              const rules = sheet.cssRules || [];
              rules.forEach(rule => {
                if (rule.type === CSSRule.MEDIA_RULE) {
                  const mediaText = rule.media.mediaText;
                  if (mediaText.includes('max-width') || mediaText.includes('min-width')) {
                    hasMobileMediaQueries = true;
                    mobileBreakpoints.push(mediaText);
                  }
                }
              });
            } catch (e) {
              // Cross-origin stylesheets may throw errors
            }
          });
          
          // Check text size and readability
          const bodyText = document.body;
          const bodyFontSize = parseInt(getComputedStyle(bodyText, 'font-size')) || 16;
          const bodyLineHeight = parseFloat(getComputedStyle(bodyText, 'line-height')) || 1.5;
          
          return {
            viewport: {
              width: window.innerWidth,
              height: window.innerHeight,
              metaTag: viewportContent,
              hasViewportMeta: !!viewportMeta
            },
            touchTargets: {
              total: interactiveElements.length,
              compliant: interactiveElements.filter(el => el.meetsWCAG).length,
              nonCompliant: interactiveElements.filter(el => !el.meetsWCAG).map(el => ({
                element: el.text.substring(0, 50),
                size: `${el.effectiveSize.width}x${el.effectiveSize.height}px`,
                required: '44x44px minimum'
              })),
              details: interactiveElements.slice(0, 30) // Limit details
            },
            spacing: {
              issues: spacingIssues.slice(0, 10) // Limit issues
            },
            responsive: {
              hasMobileMediaQueries: hasMobileMediaQueries,
              breakpoints: mobileBreakpoints.slice(0, 5)
            },
            typography: {
              bodyFontSize: bodyFontSize,
              bodyLineHeight: bodyLineHeight,
              meetsMinimum: bodyFontSize >= 16
            },
            textContent: document.body.innerText.replace(/\s+/g, ' ').trim().substring(0, 30000)
          };
        });
        
        // Parse mobile HTML structure
        const mobileStructuredData = {
          headings: {
            h1: $mobile('h1').map((i, el) => $mobile(el).text()).get(),
            h2: $mobile('h2').map((i, el) => $mobile(el).text()).get(),
            h3: $mobile('h3').map((i, el) => $mobile(el).text()).get(),
          },
          buttons: $mobile('button, input[type="submit"], input[type="button"]').map((i, el) => ({
            text: $mobile(el).text() || $mobile(el).attr('value') || '',
            type: $mobile(el).attr('type') || 'button'
          })).get(),
          links: $mobile('a').map((i, el) => ({
            text: $mobile(el).text().trim(),
            href: $mobile(el).attr('href')
          })).get().slice(0, 30),
          forms: $mobile('form').length
        };
        
        mobileData.structuredData = mobileStructuredData;
        mobileData.html = mobileHtml.substring(0, 100000); // Smaller sample for mobile
        
        console.log(`[${new Date().toISOString()}] Mobile viewport data captured successfully`);
        console.log(`[Mobile] Touch targets: ${mobileData.touchTargets.compliant}/${mobileData.touchTargets.total} compliant`);
        
      } catch (mobileError) {
        console.warn(`[${new Date().toISOString()}] Mobile viewport capture failed: ${mobileError.message}`);
        mobileData = null;
      }
      
      // Close browser
      await browser.close();
      browser = null;
      
      console.log(`[${new Date().toISOString()}] Website fetched successfully with Puppeteer`);
      
      return {
        url,
        html: html.substring(0, 200000),
        structuredData,
        mobileData: mobileData,
        fetchedAt: new Date().toISOString()
      };
      
    } catch (puppeteerError) {
      console.warn(`[${new Date().toISOString()}] Puppeteer failed: ${puppeteerError.message}, trying simple fetch...`);
      
      // Close browser if still open
      if (browser) {
        try {
          await browser.close();
        } catch (e) {
          // Ignore
        }
      }
      
      // Fall back to simple fetch
      return await fetchWebsiteSimple(url);
    }
  } else {
    // No Puppeteer available, use simple fetch
    console.log(`[${new Date().toISOString()}] Puppeteer not available, using simple fetch`);
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

${websiteContent.mobileData ? `\n=== MOBILE VIEWPORT ANALYSIS ===
The website has been analyzed in a mobile viewport (390x844px - iPhone 12 Pro size) to provide mobile-specific accessibility insights.

MOBILE VIEWPORT SETTINGS:
- Viewport Width: ${websiteContent.mobileData.viewport.width}px
- Viewport Height: ${websiteContent.mobileData.viewport.height}px
- Viewport Meta Tag: ${websiteContent.mobileData.viewport.metaTag || 'Not found'}
- Has Viewport Meta: ${websiteContent.mobileData.viewport.hasViewportMeta ? 'Yes' : 'No'}

MOBILE TOUCH TARGET ANALYSIS (WCAG 2.2 AA requires minimum 44x44px):
- Total Interactive Elements Analyzed: ${websiteContent.mobileData.touchTargets.total}
- WCAG Compliant (≥44x44px): ${websiteContent.mobileData.touchTargets.compliant}
- Non-Compliant: ${websiteContent.mobileData.touchTargets.nonCompliant.length}
${websiteContent.mobileData.touchTargets.nonCompliant.length > 0 ? `\nNon-Compliant Touch Targets:\n${websiteContent.mobileData.touchTargets.nonCompliant.map(t => `  - "${t.element}": ${t.size} (required: ${t.required})`).join('\n')}` : ''}

MOBILE SPACING ANALYSIS:
- Elements with Insufficient Spacing (<8px): ${websiteContent.mobileData.spacing.issues.length}
${websiteContent.mobileData.spacing.issues.length > 0 ? `\nSpacing Issues:\n${websiteContent.mobileData.spacing.issues.map(s => `  - "${s.element1}" and "${s.element2}": ${s.distance}px apart`).join('\n')}` : ''}

MOBILE RESPONSIVE DESIGN:
- Has Mobile Media Queries: ${websiteContent.mobileData.responsive.hasMobileMediaQueries ? 'Yes' : 'No'}
${websiteContent.mobileData.responsive.breakpoints.length > 0 ? `- Breakpoints Found:\n${websiteContent.mobileData.responsive.breakpoints.map(b => `  - ${b}`).join('\n')}` : ''}

MOBILE TYPOGRAPHY:
- Body Font Size: ${websiteContent.mobileData.typography.bodyFontSize}px
- Body Line Height: ${websiteContent.mobileData.typography.bodyLineHeight}
- Meets Minimum (16px): ${websiteContent.mobileData.typography.meetsMinimum ? 'Yes' : 'No'}

MOBILE CONTENT STRUCTURE:
- H1 Headings: ${websiteContent.mobileData.structuredData.headings.h1.join(', ') || 'None'}
- H2 Headings: ${websiteContent.mobileData.structuredData.headings.h2.slice(0, 10).join(', ') || 'None'}
- Buttons Found: ${websiteContent.mobileData.structuredData.buttons.length}
- Links Found: ${websiteContent.mobileData.structuredData.links.length}
- Forms Found: ${websiteContent.mobileData.structuredData.forms}

MOBILE TEXT CONTENT (first 30,000 characters):
${websiteContent.mobileData.textContent.substring(0, 30000)}

MOBILE HTML STRUCTURE (sample):
${websiteContent.mobileData.html.substring(0, 5000)}

IMPORTANT MOBILE CONSIDERATIONS:
- When analyzing mobile-specific items (touch targets, mobile vs desktop, etc.), use the mobile viewport data above
- Compare desktop and mobile experiences where relevant
- Touch target sizes are measured including padding (effective touch area)
- Mobile spacing issues can cause accidental taps
- Viewport meta tag is critical for proper mobile rendering
` : '\n=== MOBILE VIEWPORT ANALYSIS ===\nMobile viewport data could not be captured. Please analyze based on desktop content only.\n'}

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
        // Include custom prompt if provided - it has higher priority but should still consider the label context
        if (item.prompt && item.prompt.trim()) {
          prompt += `\n⚠️ CUSTOM INSTRUCTIONS (HIGHEST PRIORITY - override default behavior if needed, but keep "${item.label}" as the main assessment context):\n${item.prompt}\n`;
          console.log(`[Custom prompt included for ${item.label}]: ${item.prompt.substring(0, 100)}...`);
        }
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
          "recommendations": ["Recommendation 1", "Recommendation 2"]
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

// Serve index.html for root path
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    message: 'Backend server is running',
    models: {
      gemini: !!process.env.GEMINI_API_KEY
    }
  });
});

// Main audit endpoint
app.post('/api/audit', async (req, res) => {
  try {
    // Rate limiting
    const clientIp = req.ip || req.connection.remoteAddress;
    if (!checkRateLimit(clientIp)) {
      return res.status(429).json({ 
        error: 'Rate limit exceeded. Please try again later.' 
      });
    }

    const { url, auditOptions, model = 'gemini-2.0-flash' } = req.body;

    // Validate input
    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    if (!auditOptions) {
      return res.status(400).json({ error: 'Audit options are required' });
    }

    console.log(`[${new Date().toISOString()}] Audit request received`);
    console.log('URL:', url);
    console.log('Model:', model);
    
    // Debug: Check if custom prompts are included
    let customPromptCount = 0;
    Object.entries(auditOptions).forEach(([categoryKey, category]) => {
      Object.entries(category.items).forEach(([itemKey, item]) => {
        if (item.checked && item.prompt && item.prompt.trim()) {
          customPromptCount++;
          console.log(`[Custom prompt found] ${category.title} > ${item.label}: "${item.prompt.substring(0, 50)}..."`);
        }
      });
    });
    if (customPromptCount > 0) {
      console.log(`[Total custom prompts: ${customPromptCount}]`);
    }

    // Step 1: Fetch website content
    const websiteContent = await fetchWebsiteContent(url);
    console.log(`[${new Date().toISOString()}] Website content fetched`);

    // Step 2: Generate audit prompt
    const prompt = generateAuditPrompt(url, websiteContent, auditOptions);

    // Step 3: Call AI model
    let response;
    
    if (model.startsWith('gemini')) {
      // Use Gemini
      if (!genAI) {
        return res.status(500).json({ 
          error: 'Gemini API key not configured. Please set GEMINI_API_KEY in .env file.' 
        });
      }

      // Try different model names - some may require billing
      // Start with gemini-2.0-flash (best performance), then try others
      let modelName = model || 'gemini-2.0-flash';
      let result;
      let lastError;
      
      // List of models to try in order
      const modelsToTry = [
        'gemini-2.0-flash',     // Latest, best performance
        'gemini-1.5-flash'      // Fallback option
      ];
      
      // If specific model requested, try that first
      if (model && modelsToTry.includes(model)) {
        modelsToTry.unshift(model);
        // Remove duplicate
        const unique = [...new Set(modelsToTry)];
        modelsToTry.length = 0;
        modelsToTry.push(...unique);
      }
      
      for (const tryModel of modelsToTry) {
        try {
          console.log(`[${new Date().toISOString()}] Trying Gemini model: ${tryModel}`);
          const geminiModel = genAI.getGenerativeModel({ model: tryModel });
          
          result = await geminiModel.generateContent({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.3, // Lower temperature for more consistent JSON
              topK: 40,
              topP: 0.95,
              maxOutputTokens: 16000,
              responseMimeType: 'application/json', // Force JSON response format
            }
          });
          
          modelName = tryModel;
          console.log(`[${new Date().toISOString()}] Successfully using model: ${tryModel}`);
          break; // Success, exit loop
          
        } catch (geminiError) {
          console.warn(`[${new Date().toISOString()}] Model ${tryModel} failed: ${geminiError.message}`);
          lastError = geminiError;
          // Continue to next model
        }
      }
      
      if (!result) {
        console.error('All Gemini models failed. Last error:', lastError);
        throw new Error(`Gemini API error: All models failed. Last error: ${lastError?.message || 'Unknown error'}. Note: Some models may require billing to be enabled in Google AI Studio.`);
      }

      let responseText = result.response.text();
      
      // Clean up the response - remove markdown code blocks
      responseText = responseText.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
      
      // Try to find JSON object in the response
      let cleanText = responseText;
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        cleanText = jsonMatch[0];
      }
      
      // Try to fix common JSON issues
      try {
        // Validate JSON by parsing it
        const testParse = JSON.parse(cleanText);
        
        // If parsing succeeds, use the cleaned text
        response = {
          content: [{ text: cleanText }],
          model: modelName,
          usage: {
            input_tokens: result.response.usageMetadata?.promptTokenCount || 0,
            output_tokens: result.response.usageMetadata?.candidatesTokenCount || 0
          }
        };
      } catch (parseError) {
        console.error('JSON parsing error:', parseError.message);
        console.error('Problematic JSON (first 500 chars):', cleanText.substring(0, 500));
        
        // Try to fix common JSON issues
        try {
          // Fix trailing commas
          cleanText = cleanText.replace(/,(\s*[}\]])/g, '$1');
          
          // Try to close unclosed arrays/objects
          const openBraces = (cleanText.match(/\{/g) || []).length;
          const closeBraces = (cleanText.match(/\}/g) || []).length;
          const openBrackets = (cleanText.match(/\[/g) || []).length;
          const closeBrackets = (cleanText.match(/\]/g) || []).length;
          
          // Add missing closing brackets
          if (openBrackets > closeBrackets) {
            cleanText += ']'.repeat(openBrackets - closeBrackets);
          }
          
          // Add missing closing braces
          if (openBraces > closeBraces) {
            cleanText += '}'.repeat(openBraces - closeBraces);
          }
          
          // Try parsing again
          const fixedParse = JSON.parse(cleanText);
          
          response = {
            content: [{ text: cleanText }],
            model: modelName,
            usage: {
              input_tokens: result.response.usageMetadata?.promptTokenCount || 0,
              output_tokens: result.response.usageMetadata?.candidatesTokenCount || 0
            }
          };
        } catch (fixError) {
          // If still can't parse, return error with partial response
          console.error('Could not fix JSON:', fixError.message);
          throw new Error(`Invalid JSON response from Gemini. The response may be incomplete or malformed. Error: ${parseError.message}. Please try again.`);
        }
      }

    } else {
      return res.status(400).json({ 
        error: `Unsupported model: ${model}. Use 'gemini-2.0-flash' (recommended) or 'gemini-1.5-flash'` 
      });
    }

    console.log(`[${new Date().toISOString()}] Audit completed successfully`);

    res.json(response);

  } catch (error) {
    console.error('Error in audit endpoint:', error);
    
    // Handle different error types
    if (error.status === 429) {
      res.status(429).json({ 
        error: 'API rate limit exceeded. Please try again later.' 
      });
    } else if (error.status === 401) {
      res.status(500).json({ 
        error: 'Invalid API key. Please check server configuration.' 
      });
    } else {
      res.status(500).json({ 
        error: 'Failed to generate audit. Please try again.',
        details: error.message
      });
    }
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Audit Tool Backend Server running on http://localhost:${PORT}`);
  console.log(`📝 API endpoint: http://localhost:${PORT}/api/audit`);
  console.log(`❤️  Health check: http://localhost:${PORT}/api/health`);
  
  // Check API keys
  console.log('\n📋 API Key Status:');
  if (process.env.GEMINI_API_KEY) {
    console.log('✅ Gemini API key configured');
  } else {
    console.log('⚠️  GEMINI_API_KEY not found in environment variables!');
    console.log('❌ Server cannot function without GEMINI_API_KEY');
    console.error('\n❌ ERROR: No API keys configured! Please create a .env file with at least one API key.');
  }
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received. Shutting down gracefully...');
  process.exit(0);
});
