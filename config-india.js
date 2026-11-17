const path = require('path');
require('dotenv').config();

const ROOT_DIR = __dirname;
// Use a dedicated session folder for India to avoid fingerprinting issues
const USER_DATA_DIR = process.env.INDIA_SESSION_DIR 
  ? path.resolve(process.env.INDIA_SESSION_DIR) 
  : path.join(ROOT_DIR, '.naukri-india-session');

module.exports = {
  NAUKRI_LOGIN_URL: 'https://www.naukri.com/nlogin/login',
  NAUKRI_PROFILE_URL: 'https://www.naukri.com/mnjuser/profile',
  USER_DATA_DIR,
  EMAIL: process.env.NAUKRI_EMAIL || '',
  PASSWORD: process.env.NAUKRI_PASSWORD || '',
  REFRESH_INTERVAL_MINUTES: parseInt(process.env.REFRESH_INTERVAL_MINUTES || '60', 10),
  HEADLESS: process.env.HEADLESS !== 'false',
};
