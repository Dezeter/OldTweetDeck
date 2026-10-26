// Tests run TweetDeck's real code with this extension's scripts in pages where x.com and its APIs are stubbed.
// `npm test` runs them in Chromium and Firefox; `npx playwright test --project=chromium` in Chromium only.
const { defineConfig } = require("@playwright/test");

module.exports = defineConfig({
    testDir: "test",
    timeout: 60000,
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    reporter: process.env.CI ? [["list"], ["github"]] : "list",
    projects: [
        { name: "chromium", use: { browserName: "chromium" } },
        // Playwright loads extensions only into Chromium; everything else also runs in Firefox
        { name: "firefox", use: { browserName: "firefox" }, testIgnore: /extension\.spec\.js/ },
    ],
});
