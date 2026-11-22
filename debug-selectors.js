const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth')();
chromium.use(stealth);
const config = require('./config');

async function debugSelectors() {
  const context = await chromium.launchPersistentContext(config.USER_DATA_DIR, {
    headless: false,
    args: ['--window-size=1920,1080']
  });
  const page = context.pages()[0] || await context.newPage();
  await page.goto(config.NAUKRI_PROFILE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(10000);

  const editButtons = await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('.styles_card__hQJ63'));
    
    return cards.map(card => {
        const editIcon = card.querySelector('[class*="edit"]');
        return {
            cardClassName: card.className,
            editIconClassName: editIcon ? editIcon.className : 'Not found',
            editIconTagName: editIcon ? editIcon.tagName : 'Not found'
        };
    });

  });

  console.log('Edit buttons in Resume headline card:', JSON.stringify(editButtons, null, 2));
  await context.close();
}

debugSelectors();
