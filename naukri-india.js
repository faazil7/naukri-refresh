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

  const context = await chromium.launchPersistentContext(config.USER_DATA_DIR, {
    headless: isHeadless,
    viewport: { width: 1920, height: 1080 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
    locale: 'en-US',
    timezoneId: 'Asia/Kolkata',
    extraHTTPHeaders: {
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://www.naukri.com/'
    },
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--window-size=1920,1080',
      '--lang=en-US,en'
    ]
  });

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
    await page.goto(config.NAUKRI_PROFILE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(10000); // Wait for potential redirects/lazy loads

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

    let refreshed = false;
    let detailMsg = '';

    // Method: Target Resume Headline specifically
    console.log('Attempting to update Resume Headline specifically...');
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

      // Check for iframes
      const frames = page.frames();
      console.log(`Number of frames: ${frames.length}`);
      for (const frame of frames) {
          console.log(`Frame: ${frame.name()} - ${frame.url()}`);
      }

      // Log ALL elements to see what is actually there, not just edit buttons
      const allPageElements = await page.evaluate(() => {
          return Array.from(document.querySelectorAll('*')).map(el => ({
              tagName: el.tagName,
              className: el.className.replace(/\s+/g, ' '),
              textContent: el.textContent ? el.textContent.substring(0, 30) : ''
          })).filter(e => e.textContent.length > 0);
      });
      console.log('ALL page elements count:', allPageElements.length);

      // Attempt to find the specific Resume Headline edit button using selectors from working version
      const editBtn = page.locator('.card:has-text("Resume headline") .edit, .card:has-text("Resume headline") svg').first();
      
      let btnCount = 0;
      let clicked = false;
      if (await editBtn.count() > 0) {
        btnCount = await editBtn.count();
        console.log(`Found ${btnCount} potential edit buttons`);
      if (btnCount > 0) {
        await resumeHeadlineEditBtn.click({ force: true });
        clicked = true;
        console.log('Clicked Resume Headline edit button.');


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
