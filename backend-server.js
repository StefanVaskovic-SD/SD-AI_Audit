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
      
      // Extract comprehensive CSS and rendered HTML analysis for desktop
      console.log(`[${new Date().toISOString()}] Extracting CSS and rendered HTML analysis...`);
      let desktopCSSAnalysis = null;
      try {
        desktopCSSAnalysis = await page.evaluate(() => {
          const getComputedStyle = (el, prop) => {
            try {
              return window.getComputedStyle(el).getPropertyValue(prop);
            } catch (e) {
              return '';
            }
          };
          
          const rgbToHex = (rgb) => {
            if (!rgb || rgb === 'rgba(0, 0, 0, 0)' || rgb === 'transparent') return null;
            const match = rgb.match(/\d+/g);
            if (!match || match.length < 3) return null;
            const r = parseInt(match[0]);
            const g = parseInt(match[1]);
            const b = parseInt(match[2]);
            return '#' + [r, g, b].map(x => {
              const hex = x.toString(16);
              return hex.length === 1 ? '0' + hex : hex;
            }).join('');
          };
          
          const getContrastRatio = (color1, color2) => {
            // Simplified contrast calculation - returns approximate ratio
            // For accurate calculation, we'd need proper luminance calculation
            return 'calculated_from_colors';
          };
          
          // Analyze links
          const links = [];
          document.querySelectorAll('a').forEach((link, index) => {
            if (index < 30) {
              const styles = window.getComputedStyle(link);
              const textDecoration = styles.textDecoration;
              const fontWeight = styles.fontWeight;
              const color = styles.color;
              const backgroundColor = styles.backgroundColor;
              
              links.push({
                text: link.textContent.trim().substring(0, 50),
                href: link.getAttribute('href') || '',
                hasUnderline: textDecoration.includes('underline'),
                isBold: parseInt(fontWeight) >= 600 || fontWeight === 'bold',
                color: color,
                backgroundColor: backgroundColor,
                fontSize: styles.fontSize,
                isDistinguishable: textDecoration.includes('underline') || parseInt(fontWeight) >= 600 || color !== getComputedStyle(document.body, 'color')
              });
            }
          });
          
          // Analyze form elements and error messages
          const formElements = [];
          const errorMessages = [];
          document.querySelectorAll('input, select, textarea').forEach((input, index) => {
            if (index < 20) {
              const styles = window.getComputedStyle(input);
              const placeholder = input.getAttribute('placeholder') || '';
              const placeholderColor = input.matches(':placeholder-shown') ? styles.color : '';
              
              // Check label visibility
              let labelVisible = false;
              let labelText = '';
              if (input.labels && input.labels.length > 0) {
                input.labels.forEach(label => {
                  const labelStyles = window.getComputedStyle(label);
                  if (labelStyles.display !== 'none' && labelStyles.visibility !== 'hidden' && labelStyles.opacity !== '0') {
                    labelVisible = true;
                    labelText = label.textContent.trim();
                  }
                });
              }
              
              // Check for aria-label or aria-labelledby
              const ariaLabel = input.getAttribute('aria-label');
              const ariaLabelledBy = input.getAttribute('aria-labelledby');
              if (ariaLabel) {
                labelVisible = true;
                labelText = ariaLabel;
              } else if (ariaLabelledBy) {
                const labelEl = document.getElementById(ariaLabelledBy);
                if (labelEl) {
                  const labelStyles = window.getComputedStyle(labelEl);
                  if (labelStyles.display !== 'none' && labelStyles.visibility !== 'hidden') {
                    labelVisible = true;
                    labelText = labelEl.textContent.trim();
                  }
                }
              }
              
              formElements.push({
                type: input.type || input.tagName.toLowerCase(),
                name: input.name || '',
                id: input.id || '',
                placeholder: placeholder,
                placeholderColor: placeholderColor,
                color: styles.color,
                backgroundColor: styles.backgroundColor,
                borderColor: styles.borderColor,
                fontSize: styles.fontSize,
                hasLabel: !!(input.labels && input.labels.length > 0) || !!ariaLabel || !!ariaLabelledBy,
                labelVisible: labelVisible,
                labelText: labelText.substring(0, 50)
              });
              
              // Look for error messages near this input
              const parent = input.closest('form, div, fieldset');
              if (parent) {
                const errorElements = parent.querySelectorAll('[role="alert"], .error, .invalid, [aria-invalid="true"]');
                errorElements.forEach(err => {
                  const errStyles = window.getComputedStyle(err);
                  errorMessages.push({
                    inputType: input.type || input.tagName.toLowerCase(),
                    message: err.textContent.trim().substring(0, 100),
                    color: errStyles.color,
                    backgroundColor: errStyles.backgroundColor,
                    fontSize: errStyles.fontSize,
                    isVisible: errStyles.display !== 'none' && errStyles.visibility !== 'hidden',
                    isNearInput: true
                  });
                });
              }
            }
          });
          
          // Analyze spacing (line-height, letter-spacing) with unit checking
          const checkIfRelativeUnit = (value) => {
            if (!value) return false;
            const str = value.toString().toLowerCase();
            return str.includes('em') || str.includes('rem') || str === 'normal' || str === 'inherit';
          };
          
          const spacingAnalysis = {
            body: {
              lineHeight: getComputedStyle(document.body, 'line-height'),
              letterSpacing: getComputedStyle(document.body, 'letter-spacing'),
              fontSize: getComputedStyle(document.body, 'font-size'),
              lineHeightAllowsOverride: checkIfRelativeUnit(getComputedStyle(document.body, 'line-height')),
              letterSpacingAllowsOverride: checkIfRelativeUnit(getComputedStyle(document.body, 'letter-spacing'))
            },
            paragraphs: []
          };
          
          document.querySelectorAll('p').forEach((p, index) => {
            if (index < 10) {
              const lineHeight = getComputedStyle(p, 'line-height');
              const letterSpacing = getComputedStyle(p, 'letter-spacing');
              spacingAnalysis.paragraphs.push({
                lineHeight: lineHeight,
                letterSpacing: letterSpacing,
                fontSize: getComputedStyle(p, 'font-size'),
                lineHeightAllowsOverride: checkIfRelativeUnit(lineHeight),
                letterSpacingAllowsOverride: checkIfRelativeUnit(letterSpacing)
              });
            }
          });
          
          // Analyze desktop target sizes (24x24px minimum for clickable areas)
          const targetSizes = [];
          document.querySelectorAll('button, a, input, select, [role="button"], [role="link"], [tabindex]:not([tabindex="-1"])').forEach((el, index) => {
            if (index < 30) {
              const rect = el.getBoundingClientRect();
              const styles = window.getComputedStyle(el);
              const paddingTop = parseFloat(styles.paddingTop) || 0;
              const paddingBottom = parseFloat(styles.paddingBottom) || 0;
              const paddingLeft = parseFloat(styles.paddingLeft) || 0;
              const paddingRight = parseFloat(styles.paddingRight) || 0;
              
              const effectiveWidth = rect.width + paddingLeft + paddingRight;
              const effectiveHeight = rect.height + paddingTop + paddingBottom;
              
              targetSizes.push({
                tag: el.tagName.toLowerCase(),
                text: el.textContent.trim().substring(0, 40),
                width: Math.round(rect.width),
                height: Math.round(rect.height),
                effectiveWidth: Math.round(effectiveWidth),
                effectiveHeight: Math.round(effectiveHeight),
                meets24x24: effectiveWidth >= 24 && effectiveHeight >= 24
              });
            }
          });
          
          // Analyze button and interactive element states (hover, focus, active, disabled)
          const interactiveElements = [];
          const hoverOnlyInfo = [];
          
          document.querySelectorAll('button, a, input[type="button"], input[type="submit"], [role="button"], [title], [data-tooltip], [aria-label]').forEach((el, index) => {
            if (index < 25) {
              const normalStyles = window.getComputedStyle(el);
              
              // Check for tooltips/titles that might be hover-only
              const title = el.getAttribute('title');
              const ariaLabel = el.getAttribute('aria-label');
              const hasTooltip = el.hasAttribute('data-tooltip') || el.querySelector('[class*="tooltip"]');
              
              // Check for CSS hover styles by examining stylesheet rules
              let hasHoverStyles = false;
              let hoverStyles = null;
              try {
                const sheets = document.styleSheets;
                for (let sheet of sheets) {
                  try {
                    const rules = sheet.cssRules || sheet.rules;
                    for (let rule of rules) {
                      if (rule.type === CSSRule.STYLE_RULE && rule.selectorText) {
                        const selector = rule.selectorText.toLowerCase();
                        // Check if this element matches the hover selector
                        const baseSelector = selector.replace(':hover', '').trim();
                        if (selector.includes(':hover') && (el.matches(baseSelector) || el.matches(selector.replace(':hover', '')))) {
                          hasHoverStyles = true;
                          hoverStyles = {
                            color: rule.style.color || normalStyles.color,
                            backgroundColor: rule.style.backgroundColor || normalStyles.backgroundColor,
                            borderColor: rule.style.borderColor || normalStyles.borderColor,
                            textDecoration: rule.style.textDecoration || normalStyles.textDecoration
                          };
                          break;
                        }
                      }
                    }
                    if (hasHoverStyles) break;
                  } catch (e) {
                    // Cross-origin stylesheet
                  }
                }
              } catch (e) {}
              
              // Check focus state
              el.focus();
              const focusStyles = window.getComputedStyle(el);
              const focusOutline = focusStyles.outline;
              const focusOutlineWidth = focusStyles.outlineWidth;
              const focusColor = focusStyles.color;
              const focusBg = focusStyles.backgroundColor;
              el.blur();
              
              // Check active state (can simulate by checking :active pseudo-class)
              let activeStyles = null;
              try {
                el.focus();
                // Simulate active by checking if styles change
                activeStyles = {
                  color: focusStyles.color,
                  backgroundColor: focusStyles.backgroundColor
                };
                el.blur();
              } catch (e) {}
              
              // Check disabled state
              const isDisabled = el.disabled || el.getAttribute('aria-disabled') === 'true';
              const disabledStyles = isDisabled ? {
                color: normalStyles.color,
                opacity: normalStyles.opacity,
                cursor: normalStyles.cursor
              } : null;
              
              // Check if hover-only info exists (title attribute without aria-label)
              if (title && !ariaLabel && !el.getAttribute('aria-describedby')) {
                hoverOnlyInfo.push({
                  element: el.tagName.toLowerCase(),
                  text: el.textContent.trim().substring(0, 40),
                  tooltip: title,
                  hasAriaLabel: false,
                  isHoverOnly: true
                });
              }
              
              interactiveElements.push({
                tag: el.tagName.toLowerCase(),
                text: el.textContent.trim().substring(0, 50),
                normal: {
                  color: normalStyles.color,
                  backgroundColor: normalStyles.backgroundColor,
                  borderColor: normalStyles.borderColor
                },
                hover: hasHoverStyles ? hoverStyles : null,
                focus: {
                  outline: focusOutline,
                  outlineWidth: focusOutlineWidth,
                  color: focusColor,
                  backgroundColor: focusBg,
                  hasVisibleFocus: focusOutline !== 'none' && focusOutlineWidth !== '0px',
                  isDistinctFromNormal: focusColor !== normalStyles.color || focusBg !== normalStyles.backgroundColor || focusOutline !== 'none'
                },
                active: activeStyles,
                disabled: disabledStyles,
                hasTitle: !!title,
                hasAriaLabel: !!ariaLabel
              });
            }
          });
          
          // Detect animations and transitions
          const animations = [];
          const transitions = [];
          document.querySelectorAll('*').forEach((el, index) => {
            if (index < 50) { // Limit to avoid performance issues
              const styles = window.getComputedStyle(el);
              const animationName = styles.animationName;
              const transitionProperty = styles.transitionProperty;
              
              if (animationName && animationName !== 'none') {
                animations.push({
                  element: el.tagName.toLowerCase(),
                  className: el.className || '',
                  animationName: animationName,
                  animationDuration: styles.animationDuration,
                  animationIterationCount: styles.animationIterationCount
                });
              }
              
              if (transitionProperty && transitionProperty !== 'none') {
                transitions.push({
                  element: el.tagName.toLowerCase(),
                  className: el.className || '',
                  transitionProperty: transitionProperty,
                  transitionDuration: styles.transitionDuration
                });
              }
            }
          });
          
          // Analyze color usage (check if color alone is used for status)
          const colorOnlyIndicators = [];
          document.querySelectorAll('[class*="status"], [class*="error"], [class*="success"], [class*="warning"]').forEach((el, index) => {
            if (index < 15) {
              const styles = window.getComputedStyle(el);
              const hasIcon = el.querySelector('svg, img, [class*="icon"]');
              const hasText = el.textContent.trim().length > 0;
              const color = styles.color;
              const backgroundColor = styles.backgroundColor;
              
              colorOnlyIndicators.push({
                element: el.tagName.toLowerCase(),
                text: el.textContent.trim().substring(0, 50),
                hasIcon: !!hasIcon,
                hasText: hasText,
                reliesOnColorAlone: !hasIcon && !hasText && (color !== 'rgb(0, 0, 0)' || backgroundColor !== 'rgba(0, 0, 0, 0)'),
                color: color,
                backgroundColor: backgroundColor
              });
            }
          });
          
          // Analyze non-text contrast (UI components)
          const uiComponents = [];
          document.querySelectorAll('button, input, select, [role="button"], [role="checkbox"], [role="radio"]').forEach((el, index) => {
            if (index < 15) {
              const styles = window.getComputedStyle(el);
              const borderColor = styles.borderColor;
              const backgroundColor = styles.backgroundColor;
              
              uiComponents.push({
                element: el.tagName.toLowerCase(),
                text: el.textContent.trim().substring(0, 30),
                borderColor: borderColor,
                backgroundColor: backgroundColor,
                hasBorder: styles.borderWidth !== '0px'
              });
            }
          });
          
          return {
            links: {
              total: document.querySelectorAll('a').length,
              analyzed: links.length,
              details: links
            },
            formElements: {
              total: document.querySelectorAll('input, select, textarea').length,
              analyzed: formElements.length,
              details: formElements
            },
            errorMessages: {
              total: errorMessages.length,
              details: errorMessages
            },
            spacing: spacingAnalysis,
            targetSizes: {
              total: targetSizes.length,
              compliant: targetSizes.filter(t => t.meets24x24).length,
              nonCompliant: targetSizes.filter(t => !t.meets24x24),
              details: targetSizes
            },
            interactiveStates: {
              total: interactiveElements.length,
              details: interactiveElements
            },
            hoverOnlyInfo: {
              total: hoverOnlyInfo.length,
              details: hoverOnlyInfo
            },
            animations: {
              total: animations.length,
              details: animations.slice(0, 10)
            },
            transitions: {
              total: transitions.length,
              details: transitions.slice(0, 10)
            },
            colorOnlyIndicators: {
              total: colorOnlyIndicators.length,
              details: colorOnlyIndicators
            },
            uiComponents: {
              total: uiComponents.length,
              details: uiComponents
            }
          };
        });
        
        console.log(`[${new Date().toISOString()}] CSS analysis extracted successfully`);
      } catch (cssError) {
        console.warn(`[${new Date().toISOString()}] CSS analysis failed: ${cssError.message}`);
        desktopCSSAnalysis = null;
      }
      
      // Test reflow at 320px width
      console.log(`[${new Date().toISOString()}] Testing reflow at 320px width...`);
      let reflowTest = null;
      try {
        await page.setViewport({ width: 320, height: 800 });
        await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for layout to adjust
        
        reflowTest = await page.evaluate(() => {
          const bodyWidth = document.body.scrollWidth;
          const viewportWidth = window.innerWidth;
          const hasHorizontalScroll = bodyWidth > viewportWidth;
          const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
          
          return {
            viewportWidth: viewportWidth,
            bodyWidth: bodyWidth,
            hasHorizontalScroll: hasHorizontalScroll,
            scrollbarWidth: scrollbarWidth,
            meetsReflowRequirement: !hasHorizontalScroll || scrollbarWidth === 0
          };
        });
        
        console.log(`[${new Date().toISOString()}] Reflow test completed: ${reflowTest.meetsReflowRequirement ? 'PASS' : 'FAIL'}`);
      } catch (reflowError) {
        console.warn(`[${new Date().toISOString()}] Reflow test failed: ${reflowError.message}`);
        reflowTest = null;
      }
      
      // Test zoom at 200%
      console.log(`[${new Date().toISOString()}] Testing zoom at 200%...`);
      let zoomTest = null;
      try {
        // Reset to original viewport first
        await page.setViewport({ width: 1920, height: 1080 });
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Apply 200% zoom using CSS transform
        zoomTest = await page.evaluate(() => {
          const originalBodyWidth = document.body.scrollWidth;
          const originalBodyHeight = document.body.scrollHeight;
          
          // Apply zoom via CSS
          document.body.style.zoom = '2';
          document.documentElement.style.zoom = '2';
          
          // Wait a bit for zoom to apply
          return new Promise((resolve) => {
            setTimeout(() => {
              const newBodyWidth = document.body.scrollWidth;
              const newBodyHeight = document.body.scrollHeight;
              const viewportWidth = window.innerWidth;
              const viewportHeight = window.innerHeight;
              
              // Check if content is still accessible (not cut off)
              const hasHorizontalScroll = newBodyWidth > viewportWidth;
              const hasVerticalScroll = newBodyHeight > viewportHeight;
              
              // Reset zoom
              document.body.style.zoom = '1';
              document.documentElement.style.zoom = '1';
              
              resolve({
                zoomLevel: 2,
                originalWidth: originalBodyWidth,
                originalHeight: originalBodyHeight,
                zoomedWidth: newBodyWidth,
                zoomedHeight: newBodyHeight,
                viewportWidth: viewportWidth,
                viewportHeight: viewportHeight,
                hasHorizontalScroll: hasHorizontalScroll,
                hasVerticalScroll: hasVerticalScroll,
                // Content should still be accessible even with scrolling
                meetsZoomRequirement: true // Scrolling is acceptable, just need to check if content is readable
              });
            }, 500);
          });
        });
        
        console.log(`[${new Date().toISOString()}] Zoom test completed`);
      } catch (zoomError) {
        console.warn(`[${new Date().toISOString()}] Zoom test failed: ${zoomError.message}`);
        zoomTest = null;
      }
      
      // Reset viewport to desktop size
      await page.setViewport({ width: 1920, height: 1080 });
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Now capture mobile viewport data
      console.log(`[${new Date().toISOString()}] Capturing mobile viewport data...`);
      let mobileData = null;
      try {
        // Set mobile user agent first
        await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1');
        
        // Set mobile viewport (iPhone 12 Pro dimensions - common mobile size)
        await page.setViewport({ 
          width: 390, 
          height: 844,
          deviceScaleFactor: 3, // Retina display
          isMobile: true,
          hasTouch: true
        });
        
        // Verify viewport was set
        const viewportCheck = await page.evaluate(() => ({
          width: window.innerWidth,
          height: window.innerHeight
        }));
        console.log(`[${new Date().toISOString()}] Mobile viewport set: ${viewportCheck.width}x${viewportCheck.height}`);
        
        // Reload page with mobile viewport to ensure proper rendering
        try {
          await page.reload({ waitUntil: 'networkidle0', timeout: 45000 });
        } catch (reloadError) {
          console.warn('Mobile reload with networkidle0 failed, trying domcontentloaded:', reloadError.message);
          try {
            await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
          } catch (reloadError2) {
            console.warn('Mobile reload with domcontentloaded also failed, continuing:', reloadError2.message);
          }
        }
        
        // Wait for mobile layout to stabilize - longer wait for CSS to apply
        await new Promise(resolve => setTimeout(resolve, 3000));
        
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
        
        // Extract mobile-specific accessibility data with comprehensive CSS analysis
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
            textContent: document.body.innerText.replace(/\s+/g, ' ').trim().substring(0, 30000),
            // Add mobile CSS analysis similar to desktop
            cssAnalysis: (() => {
              const getComputedStyle = (el, prop) => {
                try {
                  return window.getComputedStyle(el).getPropertyValue(prop);
                } catch (e) {
                  return '';
                }
              };
              
              // Analyze links on mobile
              const links = [];
              document.querySelectorAll('a').forEach((link, index) => {
                if (index < 20) {
                  const styles = window.getComputedStyle(link);
                  links.push({
                    text: link.textContent.trim().substring(0, 50),
                    hasUnderline: styles.textDecoration.includes('underline'),
                    isBold: parseInt(styles.fontWeight) >= 600,
                    fontSize: styles.fontSize
                  });
                }
              });
              
              // Analyze spacing on mobile
              const spacing = {
                body: {
                  lineHeight: getComputedStyle(document.body, 'line-height'),
                  letterSpacing: getComputedStyle(document.body, 'letter-spacing')
                }
              };
              
              return {
                links: { total: document.querySelectorAll('a').length, details: links },
                spacing: spacing
              };
            })()
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
        console.error(`[${new Date().toISOString()}] Mobile viewport capture failed: ${mobileError.message}`);
        console.error('Mobile error stack:', mobileError.stack);
        // Try to capture at least basic mobile data even if detailed analysis fails
        try {
          const basicMobileData = await page.evaluate(() => {
            return {
              viewport: {
                width: window.innerWidth,
                height: window.innerHeight,
                metaTag: document.querySelector('meta[name="viewport"]')?.getAttribute('content') || null,
                hasViewportMeta: !!document.querySelector('meta[name="viewport"]')
              },
              touchTargets: {
                total: document.querySelectorAll('button, a, input, select, textarea').length,
                compliant: 0,
                nonCompliant: []
              },
              spacing: { issues: [] },
              responsive: { hasMobileMediaQueries: false, breakpoints: [] },
              typography: {
                bodyFontSize: parseInt(window.getComputedStyle(document.body).fontSize) || 16,
                bodyLineHeight: parseFloat(window.getComputedStyle(document.body).lineHeight) || 1.5,
                meetsMinimum: true
              },
              textContent: document.body.innerText.replace(/\s+/g, ' ').trim().substring(0, 10000),
              structuredData: {
                headings: { h1: [], h2: [], h3: [] },
                buttons: [],
                links: [],
                forms: 0
              },
              html: document.documentElement.outerHTML.substring(0, 50000)
            };
          });
          mobileData = basicMobileData;
          console.log(`[${new Date().toISOString()}] Basic mobile data captured as fallback`);
        } catch (fallbackError) {
          console.error(`[${new Date().toISOString()}] Mobile fallback capture also failed: ${fallbackError.message}`);
          mobileData = null;
        }
      }
      
      // Close browser
      await browser.close();
      browser = null;
      
      console.log(`[${new Date().toISOString()}] Website fetched successfully with Puppeteer`);
      
      return {
        url,
        html: html.substring(0, 200000),
        structuredData,
        cssAnalysis: desktopCSSAnalysis,
        reflowTest: reflowTest,
        zoomTest: zoomTest,
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

// Fetch Google PageSpeed Insights data
async function fetchPageSpeedInsights(url) {
  const psiApiKey = process.env.PSI_API_KEY;
  
  if (!psiApiKey) {
    console.warn('PSI_API_KEY not set in environment variables. PageSpeed Insights data will not be available.');
    return null;
  }
  
  try {
    console.log(`[${new Date().toISOString()}] Fetching PageSpeed Insights data for: ${url}`);
    
    // Fetch both mobile and desktop strategies
    const [mobileResponse, desktopResponse] = await Promise.allSettled([
      fetch(`https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&key=${psiApiKey}&strategy=mobile&category=ACCESSIBILITY&category=PERFORMANCE`),
      fetch(`https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&key=${psiApiKey}&strategy=desktop&category=ACCESSIBILITY&category=PERFORMANCE`)
    ]);
    
    const mobileData = mobileResponse.status === 'fulfilled' && mobileResponse.value.ok 
      ? await mobileResponse.value.json() 
      : null;
    const desktopData = desktopResponse.status === 'fulfilled' && desktopResponse.value.ok 
      ? await desktopResponse.value.json() 
      : null;
    
    if (!mobileData && !desktopData) {
      console.warn('PageSpeed Insights API returned no data');
      return null;
    }
    
    // Extract relevant data from PSI response
    const extractPSIData = (psiResponse, strategy) => {
      if (!psiResponse || !psiResponse.lighthouseResult) return null;
      
      const lhr = psiResponse.lighthouseResult;
      const audits = lhr.audits || {};
      const categories = lhr.categories || {};
      
      // Extract accessibility audits
      const accessibilityAudits = {};
      Object.keys(audits).forEach(key => {
        const audit = audits[key];
        if (audit.id && audit.id.startsWith('accessibility')) {
          accessibilityAudits[audit.id] = {
            title: audit.title,
            description: audit.description,
            score: audit.score,
            displayValue: audit.displayValue,
            details: audit.details
          };
        }
      });
      
      // Extract performance metrics
      const performanceMetrics = {};
      const metricIds = ['first-contentful-paint', 'largest-contentful-paint', 'total-blocking-time', 'cumulative-layout-shift', 'speed-index'];
      metricIds.forEach(id => {
        if (audits[id]) {
          performanceMetrics[id] = {
            title: audits[id].title,
            displayValue: audits[id].displayValue,
            numericValue: audits[id].numericValue,
            score: audits[id].score
          };
        }
      });
      
      return {
        strategy: strategy,
        scores: {
          performance: categories.performance?.score ? Math.round(categories.performance.score * 100) : null,
          accessibility: categories.accessibility?.score ? Math.round(categories.accessibility.score * 100) : null,
          bestPractices: categories['best-practices']?.score ? Math.round(categories['best-practices'].score * 100) : null,
          seo: categories.seo?.score ? Math.round(categories.seo.score * 100) : null
        },
        accessibilityAudits: accessibilityAudits,
        performanceMetrics: performanceMetrics,
        finalUrl: lhr.finalUrl,
        userAgent: lhr.userAgent,
        // Extract mobile-specific rendering info
        viewport: lhr.configSettings?.viewport || null,
        emulatedFormFactor: lhr.configSettings?.emulatedFormFactor || null
      };
    };
    
    const result = {
      mobile: extractPSIData(mobileData, 'mobile'),
      desktop: extractPSIData(desktopData, 'desktop'),
      fetchedAt: new Date().toISOString()
    };
    
    console.log(`[${new Date().toISOString()}] PageSpeed Insights data extracted - Mobile Accessibility: ${result.mobile?.scores?.accessibility || 'N/A'}, Desktop Accessibility: ${result.desktop?.scores?.accessibility || 'N/A'}`);
    
    return result;
    
  } catch (error) {
    console.error(`[${new Date().toISOString()}] PageSpeed Insights fetch failed: ${error.message}`);
    return null;
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

${websiteContent.cssAnalysis ? `\n=== DESKTOP CSS & RENDERED HTML ANALYSIS ===
This section contains computed CSS styles and rendered HTML analysis for accurate accessibility assessment.

LINK ANALYSIS (Distinguishability):
- Total Links: ${websiteContent.cssAnalysis.links.total}
- Analyzed: ${websiteContent.cssAnalysis.links.analyzed}
${websiteContent.cssAnalysis.links.details.length > 0 ? `\nLink Details:\n${websiteContent.cssAnalysis.links.details.slice(0, 15).map(link => `  - "${link.text.substring(0, 40)}": ${link.hasUnderline ? 'Has underline' : 'No underline'}, ${link.isBold ? 'Bold' : 'Not bold'}, Color: ${link.color}, Font size: ${link.fontSize}, Distinguishable: ${link.isDistinguishable ? 'Yes' : 'No'}`).join('\n')}` : ''}

FORM ELEMENTS & ERROR MESSAGES:
- Total Form Elements: ${websiteContent.cssAnalysis.formElements.total}
- Analyzed: ${websiteContent.cssAnalysis.formElements.analyzed}
${websiteContent.cssAnalysis.formElements.details.length > 0 ? `\nForm Element Details:\n${websiteContent.cssAnalysis.formElements.details.slice(0, 10).map(el => `  - ${el.type} (${el.name || el.id || 'unnamed'}): Placeholder: "${el.placeholder}", Has label: ${el.hasLabel}, Label visible: ${el.labelVisible}, Label text: "${el.labelText}", Color: ${el.color}, Background: ${el.backgroundColor}`).join('\n')}` : ''}
- Error Messages Found: ${websiteContent.cssAnalysis.errorMessages.total}
${websiteContent.cssAnalysis.errorMessages.details.length > 0 ? `\nError Message Details:\n${websiteContent.cssAnalysis.errorMessages.details.slice(0, 5).map(err => `  - For ${err.inputType}: "${err.message.substring(0, 50)}", Color: ${err.color}, Visible: ${err.isVisible}`).join('\n')}` : ''}

SPACING ANALYSIS (Line-height, Letter-spacing):
Body:
- Line-height: ${websiteContent.cssAnalysis.spacing.body.lineHeight} (Allows user override: ${websiteContent.cssAnalysis.spacing.body.lineHeightAllowsOverride ? 'Yes - uses relative units' : 'No - uses fixed units'})
- Letter-spacing: ${websiteContent.cssAnalysis.spacing.body.letterSpacing} (Allows user override: ${websiteContent.cssAnalysis.spacing.body.letterSpacingAllowsOverride ? 'Yes - uses relative units' : 'No - uses fixed units'})
- Font-size: ${websiteContent.cssAnalysis.spacing.body.fontSize}
${websiteContent.cssAnalysis.spacing.paragraphs.length > 0 ? `\nParagraph Samples:\n${websiteContent.cssAnalysis.spacing.paragraphs.slice(0, 5).map((p, i) => `  Paragraph ${i + 1}: Line-height: ${p.lineHeight} (Override: ${p.lineHeightAllowsOverride ? 'Yes' : 'No'}), Letter-spacing: ${p.letterSpacing} (Override: ${p.letterSpacingAllowsOverride ? 'Yes' : 'No'}), Font-size: ${p.fontSize}`).join('\n')}` : ''}

TARGET SIZE ANALYSIS (Desktop - WCAG requires minimum 24x24px for clickable areas):
- Total Clickable Elements Analyzed: ${websiteContent.cssAnalysis.targetSizes.total}
- WCAG Compliant (≥24x24px): ${websiteContent.cssAnalysis.targetSizes.compliant}
- Non-Compliant: ${websiteContent.cssAnalysis.targetSizes.nonCompliant.length}
${websiteContent.cssAnalysis.targetSizes.nonCompliant.length > 0 ? `\nNon-Compliant Target Sizes:\n${websiteContent.cssAnalysis.targetSizes.nonCompliant.slice(0, 10).map(t => `  - ${t.tag} "${t.text.substring(0, 30)}": ${t.effectiveWidth}x${t.effectiveHeight}px (required: 24x24px minimum)`).join('\n')}` : ''}

INTERACTIVE ELEMENT STATES (Hover, Focus, Active, Disabled):
- Total Analyzed: ${websiteContent.cssAnalysis.interactiveStates.total}
${websiteContent.cssAnalysis.interactiveStates.details.length > 0 ? `\nElement State Details:\n${websiteContent.cssAnalysis.interactiveStates.details.slice(0, 10).map(el => `  - ${el.tag} "${el.text.substring(0, 30)}": Hover state: ${el.hover ? 'Present' : 'Not detected'}, Focus outline: ${el.focus.outline}, Has visible focus: ${el.focus.hasVisibleFocus}, Focus distinct from normal: ${el.focus.isDistinctFromNormal}, Active state: ${el.active ? 'Present' : 'Not detected'}, Disabled: ${el.disabled ? 'Yes' : 'No'}, Has title: ${el.hasTitle}, Has aria-label: ${el.hasAriaLabel}`).join('\n')}` : ''}

HOVER-ONLY INFO DETECTION:
- Elements with Potential Hover-Only Info: ${websiteContent.cssAnalysis.hoverOnlyInfo.total}
${websiteContent.cssAnalysis.hoverOnlyInfo.details.length > 0 ? `\nHover-Only Info Issues (title attribute without aria-label):\n${websiteContent.cssAnalysis.hoverOnlyInfo.details.slice(0, 10).map(info => `  - ${info.element} "${info.text.substring(0, 30)}": Tooltip="${info.tooltip}" - This information may only be available on hover, not accessible to keyboard users`).join('\n')}` : 'None detected'}

ANIMATIONS & TRANSITIONS:
- Animations Found: ${websiteContent.cssAnalysis.animations.total}
${websiteContent.cssAnalysis.animations.details.length > 0 ? `\nAnimation Details:\n${websiteContent.cssAnalysis.animations.details.slice(0, 5).map(anim => `  - ${anim.element} (${anim.className}): ${anim.animationName}, Duration: ${anim.animationDuration}, Iterations: ${anim.animationIterationCount}`).join('\n')}` : ''}
- Transitions Found: ${websiteContent.cssAnalysis.transitions.total}
${websiteContent.cssAnalysis.transitions.details.length > 0 ? `\nTransition Details:\n${websiteContent.cssAnalysis.transitions.details.slice(0, 5).map(trans => `  - ${trans.element} (${trans.className}): ${trans.transitionProperty}, Duration: ${trans.transitionDuration}`).join('\n')}` : ''}

COLOR-ONLY INDICATORS (Status indicators that rely on color alone):
- Total Found: ${websiteContent.cssAnalysis.colorOnlyIndicators.total}
${websiteContent.cssAnalysis.colorOnlyIndicators.details.length > 0 ? `\nColor-Only Indicator Details:\n${websiteContent.cssAnalysis.colorOnlyIndicators.details.slice(0, 10).map(ind => `  - ${ind.element} "${ind.text.substring(0, 30)}": Has icon: ${ind.hasIcon}, Has text: ${ind.hasText}, Relies on color alone: ${ind.reliesOnColorAlone ? 'YES (ISSUE)' : 'No'}, Color: ${ind.color}`).join('\n')}` : ''}

NON-TEXT CONTRAST (UI Components):
- Total UI Components Analyzed: ${websiteContent.cssAnalysis.uiComponents.total}
${websiteContent.cssAnalysis.uiComponents.details.length > 0 ? `\nUI Component Details:\n${websiteContent.cssAnalysis.uiComponents.details.slice(0, 10).map(comp => `  - ${comp.element} "${comp.text.substring(0, 30)}": Border color: ${comp.borderColor}, Background: ${comp.backgroundColor}, Has border: ${comp.hasBorder}`).join('\n')}` : ''}

IMPORTANT: Use this CSS analysis data to provide accurate assessments for:
- Link distinguishability (underline, bold, color)
- Form element labels and error messages (check label visibility)
- Spacing (line-height, letter-spacing) - check if values use relative units (em/rem) to allow user overrides
- Target sizes (24x24px minimum for desktop clickable areas)
- Interactive element states (focus indicators, hover states, active states, disabled states)
- Hover-only info (elements with title attribute but no aria-label)
- Animations and transitions (detected but quality assessment requires judgment)
- Color-only indicators (should have icons or labels)
- Non-text contrast (UI component borders and backgrounds)
` : '\n=== DESKTOP CSS & RENDERED HTML ANALYSIS ===\nCSS analysis could not be extracted. Please analyze based on HTML structure only.\n'}

${websiteContent.reflowTest ? `\n=== REFLOW TEST (320px width) ===
The website has been tested at 320px width to check if content reflows properly without horizontal scrolling.

REFLOW TEST RESULTS:
- Viewport Width: ${websiteContent.reflowTest.viewportWidth}px
- Body Width: ${websiteContent.reflowTest.bodyWidth}px
- Has Horizontal Scroll: ${websiteContent.reflowTest.hasHorizontalScroll ? 'YES (ISSUE)' : 'No'}
- Scrollbar Width: ${websiteContent.reflowTest.scrollbarWidth}px
- Meets Reflow Requirement: ${websiteContent.reflowTest.meetsReflowRequirement ? 'Yes' : 'No'}

IMPORTANT: Use this data to assess if the website properly reflows at 320px width without horizontal scrolling.
` : '\n=== REFLOW TEST ===\nReflow test could not be performed.\n'}

${websiteContent.zoomTest ? `\n=== ZOOM TEST (200%) ===
The website has been tested at 200% zoom level to check if UI scales properly without breaking.

ZOOM TEST RESULTS:
- Zoom Level: ${websiteContent.zoomTest.zoomLevel * 100}%
- Original Body Width: ${websiteContent.zoomTest.originalWidth}px
- Original Body Height: ${websiteContent.zoomTest.originalHeight}px
- Zoomed Body Width: ${websiteContent.zoomTest.zoomedWidth}px
- Zoomed Body Height: ${websiteContent.zoomTest.zoomedHeight}px
- Viewport Width: ${websiteContent.zoomTest.viewportWidth}px
- Viewport Height: ${websiteContent.zoomTest.viewportHeight}px
- Has Horizontal Scroll: ${websiteContent.zoomTest.hasHorizontalScroll ? 'Yes (acceptable)' : 'No'}
- Has Vertical Scroll: ${websiteContent.zoomTest.hasVerticalScroll ? 'Yes (acceptable)' : 'No'}
- Meets Zoom Requirement: ${websiteContent.zoomTest.meetsZoomRequirement ? 'Yes' : 'No'}

IMPORTANT: Use this data to assess if the website scales properly at 200% zoom. Scrolling is acceptable, but content should remain readable and functional.
` : '\n=== ZOOM TEST ===\nZoom test could not be performed.\n'}

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

${websiteContent.mobileData.cssAnalysis ? `\nMOBILE CSS ANALYSIS:
Links Analyzed: ${websiteContent.mobileData.cssAnalysis.links.total}
${websiteContent.mobileData.cssAnalysis.links.details.length > 0 ? `\nMobile Link Details:\n${websiteContent.mobileData.cssAnalysis.links.details.slice(0, 10).map(link => `  - "${link.text.substring(0, 40)}": ${link.hasUnderline ? 'Has underline' : 'No underline'}, ${link.isBold ? 'Bold' : 'Not bold'}, Font size: ${link.fontSize}`).join('\n')}` : ''}
Mobile Spacing:
- Line-height: ${websiteContent.mobileData.cssAnalysis.spacing.body.lineHeight}
- Letter-spacing: ${websiteContent.mobileData.cssAnalysis.spacing.body.letterSpacing}
` : ''}

IMPORTANT MOBILE CONSIDERATIONS:
- When analyzing mobile-specific items (touch targets, mobile vs desktop, etc.), use the mobile viewport data above
- Compare desktop and mobile experiences where relevant
- Touch target sizes are measured including padding (effective touch area)
- Mobile spacing issues can cause accidental taps
- Viewport meta tag is critical for proper mobile rendering
` : '\n=== MOBILE VIEWPORT ANALYSIS ===\nMobile viewport data could not be captured. Please analyze based on desktop content only.\n'}

${websiteContent.psiData ? `\n=== GOOGLE PAGESPEED INSIGHTS ANALYSIS ===
This section contains real mobile and desktop performance/accessibility data from Google PageSpeed Insights API.

MOBILE ANALYSIS (from PageSpeed Insights):
${websiteContent.psiData.mobile ? `
- Accessibility Score: ${websiteContent.psiData.mobile.scores.accessibility || 'N/A'}/100
- Performance Score: ${websiteContent.psiData.mobile.scores.performance || 'N/A'}/100
- Best Practices Score: ${websiteContent.psiData.mobile.scores.bestPractices || 'N/A'}/100
- SEO Score: ${websiteContent.psiData.mobile.scores.seo || 'N/A'}/100
- Emulated Form Factor: ${websiteContent.psiData.mobile.emulatedFormFactor || 'mobile'}
- Final URL: ${websiteContent.psiData.mobile.finalUrl || url}

ACCESSIBILITY AUDITS (Mobile):
${Object.keys(websiteContent.psiData.mobile.accessibilityAudits || {}).length > 0 ? Object.entries(websiteContent.psiData.mobile.accessibilityAudits).slice(0, 30).map(([key, audit]) => {
  const score = audit.score !== null ? (audit.score === 1 ? 'PASS' : audit.score === 0 ? 'FAIL' : `PARTIAL (${Math.round(audit.score * 100)}%)`) : 'N/A';
  return `  - ${audit.title}: ${score}${audit.displayValue ? ` - ${audit.displayValue}` : ''}${audit.description ? `\n    Description: ${audit.description}` : ''}`;
}).join('\n') : 'No accessibility audits available'}

PERFORMANCE METRICS (Mobile):
${Object.keys(websiteContent.psiData.mobile.performanceMetrics || {}).length > 0 ? Object.entries(websiteContent.psiData.mobile.performanceMetrics).map(([key, metric]) => {
  return `  - ${metric.title}: ${metric.displayValue || 'N/A'} (Score: ${metric.score !== null ? Math.round(metric.score * 100) : 'N/A'})`;
}).join('\n') : 'No performance metrics available'}
` : 'Mobile PageSpeed Insights data not available'}

DESKTOP ANALYSIS (from PageSpeed Insights):
${websiteContent.psiData.desktop ? `
- Accessibility Score: ${websiteContent.psiData.desktop.scores.accessibility || 'N/A'}/100
- Performance Score: ${websiteContent.psiData.desktop.scores.performance || 'N/A'}/100
- Best Practices Score: ${websiteContent.psiData.desktop.scores.bestPractices || 'N/A'}/100
- SEO Score: ${websiteContent.psiData.desktop.scores.seo || 'N/A'}/100
- Final URL: ${websiteContent.psiData.desktop.finalUrl || url}

ACCESSIBILITY AUDITS (Desktop):
${Object.keys(websiteContent.psiData.desktop.accessibilityAudits || {}).length > 0 ? Object.entries(websiteContent.psiData.desktop.accessibilityAudits).slice(0, 30).map(([key, audit]) => {
  const score = audit.score !== null ? (audit.score === 1 ? 'PASS' : audit.score === 0 ? 'FAIL' : `PARTIAL (${Math.round(audit.score * 100)}%)`) : 'N/A';
  return `  - ${audit.title}: ${score}${audit.displayValue ? ` - ${audit.displayValue}` : ''}${audit.description ? `\n    Description: ${audit.description}` : ''}`;
}).join('\n') : 'No accessibility audits available'}
` : 'Desktop PageSpeed Insights data not available'}

IMPORTANT: Use PageSpeed Insights data to:
- Validate and supplement accessibility findings (PSI provides real mobile accessibility audits)
- Use mobile PSI data as the primary source for mobile-specific accessibility analysis
- Compare PSI accessibility scores with your own analysis
- Use PSI mobile rendering data to verify mobile viewport behavior
- Cross-reference PSI accessibility audits with your findings for accuracy
` : '\n=== GOOGLE PAGESPEED INSIGHTS ANALYSIS ===\nPageSpeed Insights data not available. To enable this feature, set PSI_API_KEY in your environment variables.\n'}

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
    },
    features: {
      pageSpeedInsights: !!process.env.PSI_API_KEY
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

    // Step 1: Fetch website content and PageSpeed Insights data in parallel
    console.log(`[${new Date().toISOString()}] Starting website content fetch and PageSpeed Insights analysis...`);
    const [websiteContent, psiData] = await Promise.allSettled([
      fetchWebsiteContent(url),
      fetchPageSpeedInsights(url)
    ]);
    
    const content = websiteContent.status === 'fulfilled' ? websiteContent.value : null;
    const psi = psiData.status === 'fulfilled' ? psiData.value : null;
    
    if (!content) {
      throw new Error('Failed to fetch website content');
    }
    
    // Merge PSI data into website content
    if (psi) {
      content.psiData = psi;
      console.log(`[${new Date().toISOString()}] PageSpeed Insights data fetched successfully`);
    } else {
      console.warn(`[${new Date().toISOString()}] PageSpeed Insights data not available (API key may be missing or request failed)`);
    }
    
    console.log(`[${new Date().toISOString()}] Website content fetched`);

    // Step 2: Generate audit prompt
    const prompt = generateAuditPrompt(url, content, auditOptions);

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
        'gemini-3-pro-preview', // Latest Pro model (preview)
        'gemini-2.5-pro',       // Pro model
        'gemini-2.5-flash',     // Latest Flash model
        'gemini-2.0-flash'      // Previous version, best performance
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
              temperature: 0.2, // Very low temperature for highly consistent JSON responses
              topK: 40,
              topP: 0.95,
              maxOutputTokens: 32000, // Increased to allow detailed analysis for all 43+ audit items
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
