const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth')();
chromium.use(stealth);
const path = require('path');
const fs = require('fs');
const config = require('./config-india');

/**
 * Launch Chromium browser with persistent context to store login state.
 */
async function launchBrowser(options = {}) {
  const isHeadless = options.headless !== undefined ? options.headless : config.HEADLESS;

  // Ensure user data directory exists
  if (!fs.existsSync(config.USER_DATA_DIR)) {
    fs.mkdirSync(config.USER_DATA_DIR, { recursive: true });
  }

  const launchOptions = {
    headless: isHeadless,
    viewport: { width: 1920, height: 1080 },
    // Use a more realistic, updated User-Agent
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--window-size=1920,1080',
      '--disable-infobars',
      '--disable-extensions',
      '--disable-notifications',
      '--mute-audio',
      '--disable-gpu',
      '--disable-dev-shm-usage',
      // Hide the headless nature via argument
      '--hide-scrollbars',
      '--disable-http2', // Added from Gulf bot
      '--ignore-certificate-errors' // Added from Gulf bot
    ],
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined
  };

  // In GitHub Actions, explicitly define executable path if standard detection fails
  if (process.env.GITHUB_ACTIONS) {
    const baseDir = '/home/runner/.cache/ms-playwright/chromium-1255/chrome-linux64/';
    if (fs.existsSync(baseDir + 'chrome')) {
      launchOptions.executablePath = baseDir + 'chrome';
    }
  }

  const context = await chromium.launchPersistentContext(config.USER_DATA_DIR, launchOptions);
  return context;
}

/**
 * Perform profile refresh by updating Resume Headline / Profile Summary.
 */
async function refreshProfile(options = {}) {
  const headless = options.headless !== undefined ? options.headless : config.HEADLESS;
  console.log(`[${new Date().toLocaleString()}] Starting Naukri India Profile Refresh (Headless: ${headless})...`);

  let context;
  try {
    context = await launchBrowser({ headless });
    const page = context.pages()[0] || await context.newPage();

    console.log('Navigating to Naukri Profile page...');
    // Use 'domcontentloaded' to avoid networkidle timeouts
    await page.goto(config.NAUKRI_PROFILE_URL, { waitUntil: 'domcontentloaded', timeout: 90000 });
    
    // Significantly increase wait for the profile card to load
    // Often in headless GHA, elements take longer or get lazy-loaded.
    // Try to wait for the body to be available first, then look for the specific card.
    await page.waitForLoadState('domcontentloaded');
    try {
        await page.waitForSelector('.styles_card__hQJ63, .card', { timeout: 60000 });
    } catch (e) {
        console.log('Timeout waiting for card. Proceeding anyway to debug...');
    }
    await page.waitForTimeout(10000); 

    console.log('Current URL:', page.url());

    // Dismiss intrusive popups if present
    try {
      const closeButtons = await page.$$('.crossIcon, .close-icon, button:has-text("Skip"), div[class*="cross"]');
      for (const btn of closeButtons) {
        if (await btn.isVisible()) {
          await btn.click().catch(() => {});
        }
      }
    } catch (e) {}
    
    // TAKE SCREENSHOT HERE to see what the bot actually sees in headless mode
    await page.screenshot({ path: 'headless-debug.png', fullPage: true }).catch(() => {});
    console.log('Screenshot taken to debug page load in headless mode.');

    let refreshed = false;
    let detailMsg = '';

    // Debug: Log the final URL and a snippet of content if it fails
    if (page.url().includes('login')) {
      console.error('CRITICAL: Headless mode redirected to login. Page Content Snippet:');
      const content = await page.content();
      console.error(content.substring(0, 2000));
    }
    try {
      // Force scroll to headline area
      await page.evaluate(() => {
        const els = Array.from(document.querySelectorAll('*'));
        const headlineEl = els.find(el => el.textContent && el.textContent.includes('Resume headline'));
        if (headlineEl) headlineEl.scrollIntoView();
      });
      await page.waitForTimeout(2000);

      // Log the full page content to diagnose what is being seen
      const content = await page.content();
      console.log('Page content length:', content.length);
      console.log('Page URL:', page.url());

    // Method: Target Resume Headline specifically
    console.log('Attempting to update Resume Headline specifically...');
    
    // Try robust class-based selector first
    let section = page.locator('.styles_card__hQJ63');
    
    // Fallback: Find section by text
    if (await section.count() === 0) {
        section = page.locator('div, section, .card').filter({ hasText: /Resume headline/i }).first();
    }
    
    // Find all potential edit buttons within that section
    const editButtons = section.locator('span, a, button, [class*="edit"]');
    
    let clicked = false;
    for (let i = 0; i < await editButtons.count(); i++) {
      const btn = editButtons.nth(i);
      
      // Try clicking
      await btn.click({ force: true }).catch(() => {});
      await page.waitForTimeout(2000); // Wait for modal
      
      // Verify if the correct modal opened
      const textarea = await page.$('textarea#resumeHeadlineTxt, textarea[id*="Headline"], textarea');
      if (textarea) {
        clicked = true;
        console.log('Clicked edit button and verified Resume Headline modal opened.');
        break;
      } else {
        // Close modal if it opened something else
        const closeBtn = await page.$('.crossIcon, .close-icon, button:has-text("Cancel")');
        if (closeBtn) await closeBtn.click().catch(() => {});
        await page.waitForTimeout(1000);
      }
    }


      if (clicked) {
        await page.waitForTimeout(2000);

        const textarea = await page.waitForSelector('textarea#resumeHeadlineTxt, textarea[id*="Headline"], textarea', { timeout: 10000 }).catch(() => null);
        if (textarea) {
          let text = await textarea.inputValue();
          text = text.trim();
          
          let newText = text.endsWith('.') ? text.slice(0, -1) : text + '.';
          
          console.log(`[UPDATE] Before: "${text}"`);
          console.log(`[UPDATE] After:  "${newText}"`);
          
          await textarea.fill(newText);
          await page.waitForTimeout(500);

          const saveBtn = await page.locator('.lightbox button:has-text("Save"), button:has-text("Save")').last();
          if (await saveBtn.count() > 0) {
            await saveBtn.click();
            await page.waitForTimeout(2000);
            refreshed = true;
            detailMsg = 'SUCCESS: Resume Headline updated and saved successfully!';
            console.log(detailMsg);
          } else {
              throw new Error('Save button not found');
          }
        } else {
           throw new Error('Modal opened, but textarea not found.');
        }
      } else {
        throw new Error('Could not locate Resume Headline edit button.');
      }
    } catch (err) {
      console.log('Resume Headline update failed:', err.message);
      throw err;
    }

    await context.close();
    return { success: refreshed, message: detailMsg };

  } catch (err) {
    console.error('Error:', err.message);
    if (context) await context.close();
    return { success: false, error: err.message };
  }
}

module.exports = { refreshProfile };
