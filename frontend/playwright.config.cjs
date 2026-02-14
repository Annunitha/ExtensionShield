// @ts-check
const { defineConfig, devices } = require('@playwright/test');

/**
 * Playwright config for visual tests. Runs against local Vite dev server.
 * @see https://playwright.dev/docs/test-configuration
 */
module.exports = defineConfig({
  testDir: './tests/visual',
  outputDir: './tests/visual/test-results',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5173',
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    locale: 'en-US',
    timezoneId: 'UTC',
    reducedMotion: 'reduce',
    trace: 'off',
    screenshot: 'off',
    video: 'off',
    addInitScript: `
      (function() {
        var FIXED = 1609459200000;
        var Orig = Date;
        function StubDate(y, m, d, h, i, s, ms) {
          if (arguments.length === 0) return new Orig(FIXED);
          return new (Function.prototype.bind.apply(Orig, [null].concat(Array.prototype.slice.call(arguments))))();
        }
        StubDate.now = function() { return FIXED; };
        StubDate.prototype = Orig.prototype;
        window.Date = StubDate;
      })();
      (function() {
        var s = document.createElement('style');
        s.textContent = '*{animation:none!important;transition:none!important;caret-color:transparent!important;}';
        if (document.documentElement) document.documentElement.appendChild(s);
      })();
    `,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
