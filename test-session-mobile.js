import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  console.log('\n=== Mobile Session Tab Close Button Test ===\n');

  try {
    // 1. Navigate to the app
    console.log('1. Navigating to http://localhost:3010...');
    await page.goto('http://localhost:3010', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);

    // Take baseline screenshot
    await page.screenshot({ path: '/Users/james/1-testytech/cleonui/test-screenshots/01-baseline-desktop.png' });
    console.log('   ✓ Baseline screenshot saved');

    // 2. Set viewport to mobile (iPhone SE: 375x667)
    console.log('\n2. Setting viewport to mobile (375x667)...');
    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForTimeout(500);
    await page.screenshot({ path: '/Users/james/1-testytech/cleonui/test-screenshots/02-mobile-viewport.png' });
    console.log('   ✓ Mobile viewport set');

    // 3. Create 2+ session tabs
    console.log('\n3. Creating multiple session tabs...');
    
    // Check if new session button exists
    const newSessionBtn = page.locator('[data-action="new-session"], button:has-text("New Session"), .new-session-btn').first();
    const newSessionExists = await newSessionBtn.count() > 0;
    
    if (!newSessionExists) {
      console.log('   ⚠ New session button not found, checking for alternative selectors...');
      // Try to find the button by inspecting the page
      const buttons = await page.locator('button').all();
      console.log(`   Found ${buttons.length} buttons on the page`);
      
      // Print button text to help identify
      for (let i = 0; i < Math.min(buttons.length, 10); i++) {
        const text = await buttons[i].textContent();
        console.log(`   Button ${i}: "${text}"`);
      }
    } else {
      // Click to create first new session
      await newSessionBtn.click();
      await page.waitForTimeout(500);
      console.log('   ✓ First new session created');

      // Click to create second new session
      await newSessionBtn.click();
      await page.waitForTimeout(500);
      console.log('   ✓ Second new session created');
    }

    // Count session tabs
    const sessionTabs = await page.locator('.session-tab').count();
    console.log(`   ✓ Total session tabs: ${sessionTabs}`);
    await page.screenshot({ path: '/Users/james/1-testytech/cleonui/test-screenshots/03-sessions-created.png' });

    if (sessionTabs < 2) {
      console.log('   ⚠ Warning: Less than 2 session tabs found');
    }

    // 4. First tap on a session tab - verify close button appears
    console.log('\n4. Testing tap-to-reveal close button...');
    const firstTab = page.locator('.session-tab').first();
    
    // Check initial state (close button should be hidden)
    const closeBtn = firstTab.locator('.session-close-btn, .close-btn, [data-action="close-session"]');
    const closeBtnCount = await closeBtn.count();
    
    if (closeBtnCount === 0) {
      console.log('   ⚠ No close button found in session tab');
    } else {
      const initialVisible = await closeBtn.isVisible();
      console.log(`   Initial close button visible: ${initialVisible}`);
      
      // Tap the session tab
      await firstTab.click();
      await page.waitForTimeout(300);
      
      const afterTapVisible = await closeBtn.isVisible();
      console.log(`   ✓ After tap, close button visible: ${afterTapVisible}`);
      
      await page.screenshot({ path: '/Users/james/1-testytech/cleonui/test-screenshots/04-close-button-revealed.png' });
      
      if (!afterTapVisible) {
        console.log('   ✗ FAIL: Close button did not appear after tap');
      }
    }

    // 5. Tap the close button - verify session closes
    console.log('\n5. Testing close button functionality...');
    if (closeBtnCount > 0) {
      const tabCountBefore = await page.locator('.session-tab').count();
      console.log(`   Session tabs before close: ${tabCountBefore}`);
      
      await closeBtn.click();
      await page.waitForTimeout(500);
      
      const tabCountAfter = await page.locator('.session-tab').count();
      console.log(`   Session tabs after close: ${tabCountAfter}`);
      
      await page.screenshot({ path: '/Users/james/1-testytech/cleonui/test-screenshots/05-session-closed.png' });
      
      if (tabCountAfter < tabCountBefore) {
        console.log('   ✓ PASS: Session was closed successfully');
      } else {
        console.log('   ✗ FAIL: Session was not closed');
      }
    }

    // 6. Create another session and test tab switching
    console.log('\n6. Testing session tab switching...');
    const remainingTabs = await page.locator('.session-tab').count();
    
    if (remainingTabs < 2 && newSessionExists) {
      await newSessionBtn.click();
      await page.waitForTimeout(500);
      console.log('   ✓ Created additional session for testing');
    }
    
    const secondTab = page.locator('.session-tab').nth(1);
    const secondTabExists = await secondTab.count() > 0;
    
    if (secondTabExists) {
      await secondTab.click();
      await page.waitForTimeout(500);
      console.log('   ✓ Switched to second session tab');
      await page.screenshot({ path: '/Users/james/1-testytech/cleonui/test-screenshots/06-tab-switched.png' });
    }

    // 7. Tap outside session bar - verify close button disappears
    console.log('\n7. Testing tap-outside to hide close button...');
    await page.locator('body').click({ position: { x: 200, y: 400 } });
    await page.waitForTimeout(300);
    
    if (closeBtnCount > 0) {
      const closeBtnVisible = await closeBtn.isVisible().catch(() => false);
      console.log(`   Close button visible after tap-outside: ${closeBtnVisible}`);
      await page.screenshot({ path: '/Users/james/1-testytech/cleonui/test-screenshots/07-tap-outside.png' });
    }

    // 8. Resize to desktop and test hover behavior
    console.log('\n8. Testing desktop hover behavior...');
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.waitForTimeout(500);
    await page.screenshot({ path: '/Users/james/1-testytech/cleonui/test-screenshots/08-desktop-viewport.png' });
    console.log('   ✓ Resized to desktop viewport (1024x768)');

    // Hover over a session tab
    const tabToHover = page.locator('.session-tab').first();
    if (await tabToHover.count() > 0) {
      await tabToHover.hover();
      await page.waitForTimeout(300);
      await page.screenshot({ path: '/Users/james/1-testytech/cleonui/test-screenshots/09-desktop-hover.png' });
      console.log('   ✓ Hover test completed');
    }

    console.log('\n=== Test Summary ===');
    console.log('All tests completed. Check screenshots in test-screenshots/ folder.');
    console.log('\nScreenshots saved:');
    console.log('  01-baseline-desktop.png - Initial state');
    console.log('  02-mobile-viewport.png - Mobile viewport');
    console.log('  03-sessions-created.png - Multiple sessions created');
    console.log('  04-close-button-revealed.png - Close button after tap');
    console.log('  05-session-closed.png - After closing session');
    console.log('  06-tab-switched.png - After switching tabs');
    console.log('  07-tap-outside.png - After tapping outside');
    console.log('  08-desktop-viewport.png - Desktop viewport');
    console.log('  09-desktop-hover.png - Desktop hover state');

  } catch (error) {
    console.error('\n✗ Test failed with error:', error.message);
    await page.screenshot({ path: '/Users/james/1-testytech/cleonui/test-screenshots/error.png' });
  } finally {
    await page.waitForTimeout(2000); // Keep browser open for 2s
    await browser.close();
  }
})();
