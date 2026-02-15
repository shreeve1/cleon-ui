import { chromium } from 'playwright';

const APP_URL = 'http://localhost:3010';

async function runTests() {
  console.log('Starting session context validation tests\n');
  
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  
  const consoleMessages = [];
  page.on('console', msg => { consoleMessages.push({ type: msg.type(), text: msg.text() }); });
  
  const results = { passed: [], failed: [], warnings: [] };

  try {
    console.log('Test 1: Application loads successfully');
    await page.goto(APP_URL, { waitUntil: 'networkidle' });
    
    const errors = consoleMessages.filter(m => m.type === 'error');
    if (errors.length > 0) {
      results.failed.push('Test 1: Console errors detected');
      console.log('FAIL: Console errors:', errors);
    } else {
      results.passed.push('Test 1: No console errors');
      console.log('PASS: No console errors on load');
    }

    const authScreen = await page.$('#auth-screen');
    const chatScreen = await page.$('#chat-screen');
    if (authScreen || chatScreen) {
      results.passed.push('Test 1: UI rendered');
      console.log('PASS: UI rendered\n');
    } else {
      results.failed.push('Test 1: UI did not render');
      console.log('FAIL: UI did not render\n');
    }

    console.log('Test 2: Session state visual indicator');
    const hasIndicator = await page.evaluate(() => {
      const html = document.documentElement.innerHTML;
      return html.includes('Continuing session') || html.includes('New session - no conversation history');
    });
    
    if (hasIndicator) {
      results.passed.push('Test 2: Session indicator found');
      console.log('PASS: Session state indicator present\n');
    } else {
      results.failed.push('Test 2: Session indicator missing');
      console.log('FAIL: Session state indicator not found\n');
    }

    console.log('Test 3: Console logging validation');
    const sessionLogs = consoleMessages.filter(m => m.text.includes('[Session]') || m.text.includes('session'));
    if (sessionLogs.length > 0) {
      results.passed.push('Test 3: Session logs present');
      console.log('PASS: Found', sessionLogs.length, 'session logs\n');
    } else {
      results.warnings.push('Test 3: No session logs');
      console.log('WARNING: No session logs\n');
    }

    console.log('Test 5: Critical DOM elements');
    const newSessionBtn = await page.$('#new-session-btn');
    const messagesDiv = await page.$('#messages');
    const userInput = await page.$('#user-input');
    
    if (newSessionBtn && messagesDiv && userInput) {
      results.passed.push('Test 5: All elements present');
      console.log('PASS: All critical elements found\n');
    } else {
      results.failed.push('Test 5: Missing elements');
      console.log('FAIL: Some elements missing\n');
    }

    console.log('Test 6: Screenshot');
    await page.screenshot({ path: '/Users/james/1-testytech/cleonui/artifacts/test-screenshot-baseline.png', fullPage: true });
    results.passed.push('Test 6: Screenshot captured');
    console.log('PASS: Screenshot saved\n');

    console.log('Test 7: Mobile viewport');
    await page.setViewportSize({ width: 375, height: 812 });
    await page.screenshot({ path: '/Users/james/1-testytech/cleonui/artifacts/test-screenshot-mobile.png', fullPage: true });
    results.passed.push('Test 7: Mobile screenshot');
    console.log('PASS: Mobile screenshot saved\n');

  } catch (error) {
    results.failed.push('Fatal error: ' + error.message);
    console.error('FATAL ERROR:', error);
  } finally {
    await browser.close();
  }

  console.log('\nTEST SUMMARY');
  console.log('Passed:', results.passed.length);
  console.log('Failed:', results.failed.length);
  console.log('Warnings:', results.warnings.length);

  process.exit(results.failed.length > 0 ? 1 : 0);
}

runTests().catch(err => { console.error('Unhandled error:', err); process.exit(1); });
