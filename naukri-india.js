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
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--window-size=1920,1080'
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
    await page.goto(config.NAUKRI_PROFILE_URL, { waitUntil: 'networkidle', timeout: 60000 });
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

      // Attempt to find the specific Resume Headline edit button
      const resumeCard = page.locator('.card:has-text("Resume")');
      const editBtn = resumeCard.locator('.edit, [class*="edit"]').first();
      
      let clicked = false;
      if (await editBtn.count() > 0) {
        await editBtn.first().click({ force: true });
        clicked = true;
      } else {
        // Fallback to searching all edit buttons
        const editButtons = page.locator('.edit, [class*="edit"]');
        for (let i = 0; i < await editButtons.count(); i++) {
           const btn = editButtons.nth(i);
           await btn.click();
           await page.waitForTimeout(2000);
           const textarea = await page.$('textarea#resumeHeadlineTxt, textarea[id*="Headline"], textarea');
           if (textarea) {
             clicked = true;
             break;
           } else {
             const closeBtn = await page.$('.crossIcon, .close-icon, button:has-text("Cancel")');
             if (closeBtn) await closeBtn.click().catch(() => {});
             await page.waitForTimeout(1000);
           }
        }
      }

      if (clicked) {
        await page.waitForTimeout(2000);

        const textarea = await page.waitForSelector('textarea#resumeHeadlineTxt, textarea[id*="Headline"], textarea', { timeout: 5000 }).catch(() => null);
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
          }
        }
      }
    } catch (err) {
      console.log('Resume Headline update failed:', err.message);
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
