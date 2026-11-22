const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth')();
chromium.use(stealth);
const path = require('path');
const fs = require('fs');
const config = require('./config');

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
 * Check if the browser is currently logged into Naukri.
 */
async function isLoggedIn(options = {}) {
  const headless = options.headless !== undefined ? options.headless : false;
  let context;
  try {
    context = await launchBrowser({ headless });
    const page = context.pages()[0] || await context.newPage();
    await page.goto(config.NAUKRI_PROFILE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);

    const url = page.url();
    if (url.includes('nlogin') || url.includes('login')) {
      await context.close();
      return false;
    }
    // Check for profile element
    const profileHeader = await page.$('.profile-head, .supp-head, .title, .name-wrapper, .lazy-render, .resumeHeadline, .profileSummary, div[class*="profile"]');
    const loggedIn = !!profileHeader;
    await context.close();
    return loggedIn;
  } catch (err) {
    if (context) await context.close();
    return false;
  }
}

/**
 * Perform manual or credential-based login setup.
 */
async function setupLogin(options = {}) {
  console.log('Launching browser for Naukri login setup...');
  const context = await launchBrowser({ headless: false });
  const page = context.pages()[0] || await context.newPage();

  await page.goto(config.NAUKRI_LOGIN_URL, { waitUntil: 'domcontentloaded' });

  // Auto-fill if credentials provided
  if (config.EMAIL && config.PASSWORD) {
    try {
      console.log('Attempting auto-fill with configured credentials...');
      await page.waitForSelector('input[placeholder*="Email"], input[type="text"]', { timeout: 5000 });
      await page.fill('input[placeholder*="Email"], input[type="text"]', config.EMAIL);
      await page.fill('input[placeholder*="Password"], input[type="password"]', config.PASSWORD);
      console.log('Credentials entered. Please click Login or complete OTP/Captcha if prompted.');
    } catch (e) {
      console.log('Manual input required on login page.');
    }
  } else {
    console.log('Please complete the login in the opened browser window (including OTP/2FA if prompted).');
  }

  console.log('Waiting for successful login to Naukri profile page...');
  
  // Wait until navigated to profile or user dashboard
  try {
    await page.waitForURL((url) => url.toString().includes('/mnjuser/profile') || url.toString().includes('/mnjuser/homepage'), { timeout: 180000 });
    console.log('Successfully logged in! Session saved to:', config.USER_DATA_DIR);
  } catch (err) {
    console.log('Login timeout or window closed before completing profile navigation.');
  }

  await page.waitForTimeout(3000);
  await context.close();
}

/**
 * Perform profile refresh by updating Resume Headline / Profile Summary.
 */
async function refreshProfile(options = {}) {
  const headless = options.headless !== undefined ? options.headless : config.HEADLESS;
  console.log(`[${new Date().toLocaleString()}] Starting Naukri Profile Refresh (Headless: ${headless})...`);

  let context;
  try {
    context = await launchBrowser({ headless });
    const page = context.pages()[0] || await context.newPage();

    console.log('Navigating to Naukri Profile page...');
    await page.goto(config.NAUKRI_PROFILE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(15000); // Increased wait time
    
    // Scroll down progressively to ensure all sections load
    for (let i = 0; i < 8; i++) {
        await page.evaluate((y) => window.scrollTo(0, y), i * 600);
        await page.waitForTimeout(1000);
    }

    // Debug: Log the URL we landed on
    console.log('Current URL:', page.url());

    // Scroll down progressively to ensure all sections load
    for (let i = 0; i < 8; i++) {
        await page.evaluate((y) => window.scrollTo(0, y), i * 600);
        await page.waitForTimeout(1000);
    }
    
    // Debug: Take a screenshot to see what the bot sees
    await page.screenshot({ path: 'profile-debug.png', fullPage: true }).catch(() => {});
    console.log('Screenshot taken to debug page load.');


    // Check login status
    if (page.url().includes('login') || page.url().includes('nlogin')) {
      // If credentials are provided in env (e.g. GitHub Actions), attempt automated login
      if (config.EMAIL && config.PASSWORD) {
        console.log('Session not found or expired. Attempting automated login with credentials...');
        try {
          await page.fill('input[placeholder*="Email"], input[type="text"]', config.EMAIL);
          await page.fill('input[placeholder*="Password"], input[type="password"]', config.PASSWORD);
          const loginBtn = await page.locator('button:has-text("Login"), button[type="submit"]').first();
          if (await loginBtn.count() > 0) {
            await loginBtn.click();
            await page.waitForURL((url) => url.toString().includes('/mnjuser/profile') || url.toString().includes('/mnjuser/homepage'), { timeout: 30000 });
            await page.goto(config.NAUKRI_PROFILE_URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
            await page.waitForTimeout(3000);
          }
        } catch (loginErr) {
          console.error('Automated login failed (likely blocked by Captcha/OTP):', loginErr.message);
        }
      }

      if (page.url().includes('login') || page.url().includes('nlogin')) {
        console.error('ERROR: Session expired or not logged in. Please run `npm start login` first to log in.');
        await context.close();
        return { success: false, reason: 'NOT_LOGGED_IN' };
      }
    }

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

    // Debug: Log the page content structure to identify edit triggers
    const pageStructure = await page.evaluate(() => {
        // Log the ENTIRE body text to verify if the profile content is loaded
        const bodyText = document.body.textContent || "";
        console.log('Body Text Snippet:', bodyText.substring(0, 1000));
        
        return Array.from(document.querySelectorAll('*'))
            .filter(el => el.offsetWidth > 0 && el.offsetHeight > 0)
            .map(el => ({
                tagName: el.tagName,
                className: el.className,
                textContent: el.textContent ? el.textContent.trim().substring(0, 50) : '',
                id: el.id
            }));
    });
    console.log('Detected ALL visible elements count:', pageStructure.length);

    // Method: Target Resume Headline specifically
    console.log('Attempting to update Resume Headline specifically...');
    try {
      await page.waitForLoadState('networkidle').catch(() => {});
      await page.waitForTimeout(5000); // Increased wait before attempt

      // Scroll to Resume Headline area
      await page.evaluate(() => {
        const els = Array.from(document.querySelectorAll('*'));
        const headlineEl = els.find(el => el.textContent && el.textContent.includes('Resume headline'));
        if (headlineEl) {
            headlineEl.scrollIntoView();
            console.log('Scrolled to headline');
        }
      });
      await page.waitForTimeout(2000);

      // Dump all edit buttons to console to see why they aren't matching
      const allEdits = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('.edit, [class*="edit"]')).map(el => ({
            text: el.textContent,
            className: el.className
        }));
      });
      console.log('All potential edit buttons found:', allEdits);

       // Specific fix for Naukri structure
       const resumeCard = page.locator('.styles_card__hQJ63');
       const editButtons = resumeCard.locator('.styles_edit-icon__NJ9to, .edit, [class*="edit"]');
       
       let clicked = false;
       for (let i = 0; i < await editButtons.count(); i++) {
         const btn = editButtons.nth(i);
         // Try clicking and check if a textarea appears
         await btn.click({force: true}).catch(() => {});
         await page.waitForTimeout(2000); // Wait for modal
         const textarea = await page.$('textarea#resumeHeadlineTxt, textarea[id*="Headline"], textarea');
         if (textarea) {
           clicked = true;
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

        const textarea = await page.waitForSelector('textarea#resumeHeadlineTxt, textarea[id*="Headline"], textarea', { timeout: 5000 }).catch(() => null);
        if (textarea) {
          let text = await textarea.inputValue();
          text = text.trim();
          
          let newText = text.endsWith('.') ? text.slice(0, -1) : text + '.';
          
          console.log(`==================================================`);
          console.log(`[UPDATE] Resume Headline Sentence Updated:`);
          console.log(`  Before: "${text}"`);
          console.log(`  After:  "${newText}"`);
          console.log(`==================================================`);
          
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
      } else {
        console.log('Could not locate Resume Headline edit button.');
      }
    } catch (err) {
      console.log('Resume Headline update failed:', err.message);
    }

    // Check last updated text on profile header
    let lastUpdatedText = 'Unknown';
    try {
      const modDateElem = await page.$('.mod-date, .last-updated, div:has-text("Profile last updated"), span:has-text("Profile last updated")');
      if (modDateElem) {
        lastUpdatedText = (await modDateElem.textContent() || '').trim();
      }
    } catch (e) {}

    await context.close();

    if (refreshed) {
      return {
        success: true,
        message: detailMsg,
        lastUpdated: 'SUCCESS',
        timestamp: new Date().toISOString()
      };
    } else {
      console.error('ERROR: Could not find edit triggers for profile refresh.');
      return { success: false, reason: 'EDIT_ELEMENT_NOT_FOUND' };
    }

  } catch (err) {
    console.error('Error during profile refresh:', err.message);
    if (context) await context.close();
    return { success: false, error: err.message };
  }
}

module.exports = {
  setupLogin,
  refreshProfile,
  isLoggedIn
};
