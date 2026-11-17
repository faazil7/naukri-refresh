const config = require('./config-india');
const naukri = require('./naukri-india');

async function main() {
  const args = process.argv.slice(2);
  const isHeaded = args.includes('--headed');
  const headless = isHeaded ? false : config.HEADLESS;

  console.log('Running Naukri India profile refresh...');
  const res = await naukri.refreshProfile({ headless });
  
  if (res.success) {
    console.log('[RESULT] Success:', res.message);
  } else {
    console.log('[RESULT] Failed:', res.error || 'Unknown error');
  }
}

main().catch(err => {
  console.error('Fatal Error:', err);
  process.exit(1);
});
