const config = require('./config');
const naukri = require('./naukri');

function printHelp() {
  console.log(`
===================================================
      Naukri Profile Auto-Refresh Bot
===================================================

Usage:
  node index.js <command> [options]

Commands:
  login            Launch browser to manually log in to Naukri & save session.
  refresh          Run a single profile refresh now.
  schedule         Run refresh now, then continuously refresh at set interval.
  status           Check session status and verify login state.
  help             Show this help screen.

Options:
  --headed         Run browser with visible UI (non-headless mode).
  --interval <N>   Set refresh interval in minutes (default: ${config.REFRESH_INTERVAL_MINUTES} min).

Examples:
  node index.js login
  node index.js refresh
  node index.js refresh --headed
  node index.js schedule --interval 30
===================================================
  `);
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'help';

  const isHeaded = args.includes('--headed');
  const headless = isHeaded ? false : config.HEADLESS;

  // Parse custom interval if provided
  let intervalMinutes = config.REFRESH_INTERVAL_MINUTES;
  const intervalIdx = args.indexOf('--interval');
  if (intervalIdx !== -1 && args[intervalIdx + 1]) {
    const parsed = parseInt(args[intervalIdx + 1], 10);
    if (!isNaN(parsed) && parsed > 0) {
      intervalMinutes = parsed;
    }
  }

  switch (command.toLowerCase()) {
    case 'login':
      await naukri.setupLogin();
      break;

    case 'refresh':
      console.log('Running one-time Naukri profile refresh...');
      const res = await naukri.refreshProfile({ headless });
      if (res.success) {
        console.log('\n[RESULT] Profile refresh completed successfully!');
        if (res.lastUpdated) console.log(`[STATUS] ${res.lastUpdated}`);
      } else {
        console.log('\n[RESULT] Profile refresh failed:', res.reason || res.error);
        if (res.reason === 'NOT_LOGGED_IN') {
          console.log('\nTip: Run `node index.js login` to log in first.');
        }
      }
      break;

    case 'schedule':
      console.log(`\n===================================================`);
      console.log(` Starting Naukri Profile Refresh Scheduler`);
      console.log(` Interval: Every ${intervalMinutes} minutes`);
      console.log(` Headless: ${headless}`);
      console.log(` Press Ctrl+C to stop.`);
      console.log(`===================================================\n`);

      // Initial run
      await naukri.refreshProfile({ headless });

      // Scheduled loop
      const intervalMs = intervalMinutes * 60 * 1000;
      setInterval(async () => {
        console.log(`\n--- Scheduled trigger at ${new Date().toLocaleString()} ---`);
        await naukri.refreshProfile({ headless });
      }, intervalMs);
      break;

    case 'status':
      console.log('Checking session login status...');
      const context = await naukri.isLoggedIn();
      if (context) {
        console.log('Status: Logged In (Session valid)');
      } else {
        console.log('Status: Not Logged In (or session expired). Please run `node index.js login`.');
      }
      break;

    case 'help':
    case '--help':
    case '-h':
    default:
      printHelp();
      break;
  }
}

main().catch(err => {
  console.error('Fatal Error:', err);
  process.exit(1);
});
