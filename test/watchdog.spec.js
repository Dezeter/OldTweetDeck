// The load watchdog on TweetDeck's page before it starts: what it hears, the panel, the report. It runs from the
// start of the page here, as the content script does, with the page's clock under the test's control.
const path = require("path");
const { test, expect } = require("@playwright/test");
const { ROOT, read, openPage, addScripts } = require("./helpers");

test.use({ locale: "en-US" });

const X_POLICY = "script-src 'nonce-abc'";

// reloaded: as if the watchdog had reloaded the page a moment ago, so it doesn't again;
// worker: x.com's service worker answers the page, the ones it lets go are counted in sessionStorage.__unregistered
async function openWatched(page, { headers, routes, reloaded, worker } = {}) {
    // the page's time stands still between the test's steps
    const now = Date.now();
    await page.clock.install({ time: now });
    await page.clock.pauseAt(now + 1000);
    if(worker) await page.addInitScript(() => {
        const registration = { unregister: async () => {
            sessionStorage.__unregistered = String(Number(sessionStorage.__unregistered || 0) + 1);
            return true;
        } };
        Object.defineProperty(navigator, "serviceWorker", { value: { controller: { scriptURL: "https://x.com/sw.js?v=1" }, getRegistrations: async () => [registration] } });
    });
    await page.addInitScript({ path: path.join(ROOT, "src/watchdog.js") });
    // what the copy button puts on the clipboard
    await page.addInitScript(() => {
        Object.defineProperty(navigator, "clipboard", { value: { writeText: async text => { window.__copied = text; } } });
    });
    // the page itself with x.com's headers
    if(headers) routes = { ...routes, "http://otd.test/i/tweetdeck": route => route.fulfill({ headers: { "content-type": "text/html", ...headers }, body: read("files/index.html") }) };
    await openPage(page, { routes });
    if(reloaded) await page.evaluate(() => { sessionStorage.OTDautoReloadAt = String(Date.now()); });
}
const diagnostic = (page, ...entries) => page.evaluate(entries => {
    for(const entry of entries) document.dispatchEvent(new CustomEvent("otd-diagnostic", { detail: JSON.stringify(entry) }));
}, entries);
const askReport = page => page.evaluate(() => {
    let report = "";
    document.addEventListener("otd-diagnostic-report", e => { report = e.detail; });
    document.dispatchEvent(new CustomEvent("otd-diagnostic-request"));
    return report;
});
const RELOADED = "The page was reloaded automatically already, it didn't help.";
// the reload the watchdog makes as the page's time moves on; the time stands still again on the new page
async function reloaded(page, run) {
    const load = page.waitForEvent("load");
    await page.clock.runFor(run);
    await load;
    await page.clock.pauseAt(await page.evaluate(() => Date.now()) + 100);
}
// the steps injection.js reports, and its first inline script
const inject = page => page.evaluate(() => {
    for(const step of ["extension", "page"]) document.dispatchEvent(new CustomEvent("otd-diagnostic", { detail: JSON.stringify({ kind: "step", step }) }));
    const script = document.createElement("script");
    script.textContent = "window.__ran = true";
    document.head.appendChild(script);
    document.dispatchEvent(new CustomEvent("otd-diagnostic", { detail: JSON.stringify({ kind: "step", step: "scripts" }) }));
});
const panel = page => page.locator("#otd-watchdog");
const findings = page => panel(page).locator(".findings li").allTextContents();

test("when x.com's policy blocks the extension's scripts, the page reloads at once; blocked again, the panel says so after 5 s and copies a report", async ({ page }) => {
    await openWatched(page, { headers: { "content-security-policy": X_POLICY } });
    await inject(page);
    expect(await page.evaluate(() => window.__ran ?? false)).toBe(false);
    await reloaded(page, 1000);

    // the new page's time starts about a second off, after the reload
    await inject(page);
    expect(await panel(page).count()).toBe(0);
    await page.clock.runFor(5000);
    await expect(panel(page)).toBeVisible();
    await expect(panel(page)).toContainText("TweetDeck hasn't loaded");
    const list = await findings(page);
    expect(list).toHaveLength(2);
    expect(list[0]).toContain("x.com blocked the extension's scripts (Content-Security-Policy), 1 blocked");
    expect(list[1]).toBe(RELOADED);

    await panel(page).getByRole("button", { name: "Copy diagnostics" }).click();
    await expect(panel(page).getByRole("button", { name: "Copied" })).toBeVisible();
    const report = await page.evaluate(() => window.__copied);
    expect(report).toMatch(/^OldTweetDeck diagnostics\n/);
    expect(report).toContain("Page: http://otd.test/i/tweetdeck\n");
    expect(report).toContain("TweetDeck: not started");
    expect(report).toContain("Steps: extension 0 s, page 0 s, scripts 0 s; TD no, OTD no\n");
    expect(report).toContain("\nService worker: none\n");
    expect(report).toMatch(/\n {2}script-src-elem inline\b.* ×1, first at 0 s\n/);

    // hidden for good, and no reload: it wouldn't help
    await page.evaluate(() => { window.__same = true; });
    await panel(page).getByRole("button", { name: "Hide" }).click();
    await page.clock.runFor(30000);
    await expect(panel(page)).toHaveCount(0);
    expect(await page.evaluate(() => window.__same)).toBe(true);
});

test("stuck with nothing to explain it, the page reloads once and keeps the stuck one's report; stuck again, the panel", async ({ page }) => {
    await openWatched(page);
    await inject(page);
    // TweetDeck got as far as logging in, and X never answered
    await diagnostic(page, { kind: "startup", key: "startup:start" }, { kind: "startup", key: "startup:do-login" },
        { kind: "request", id: 1, method: "GET", url: "https://api.x.com/1.1/account/verify_credentials.json" },
        { kind: "request", id: 2, method: "GET", url: "https://api.x.com/1.1/help/settings.json" }, { kind: "response", id: 2, method: "GET", url: "https://api.x.com/1.1/help/settings.json", status: 200 });
    await page.clock.runFor(15000);
    expect(await askReport(page)).toMatch(/\nTweetDeck's steps: startup:start 0 s, startup:do-login 0 s\n[^]*\nWaiting for X: \n {2}GET api\.x\.com\/1\.1\/account\/verify_credentials\.json for 15 s\n/);
    await reloaded(page, 6000);

    // the next page: stuck again, it shows the panel and says the reload didn't help
    await inject(page);
    await diagnostic(page, { kind: "request", id: 1, method: "GET", url: "https://api.x.com/1.1/account/verify_credentials.json" });
    await page.clock.runFor(21000);
    await expect(panel(page)).toBeVisible();
    const list = await findings(page);
    expect(list).toHaveLength(2);
    expect(list[0]).toMatch(/^X doesn't answer TweetDeck's requests: GET api\.x\.com\/1\.1\/account\/verify_credentials\.json \(waiting 2\d s\)\. A reload usually helps\.$/);
    expect(list[1]).toBe(RELOADED);
    const report = await askReport(page);
    expect(report).toMatch(/\n\nBefore the automatic reload at \d{4}-\d\d-\d\dT[\d:.]+Z:\nOldTweetDeck diagnostics\n/);
    expect(report.split("Before the automatic reload")[1]).toContain("\nWaiting for X: \n  GET api.x.com/1.1/account/verify_credentials.json for 20 s\n");
});

test("a page x.com's service worker answers: the worker goes and the page reloads at once, once", async ({ page }) => {
    await openWatched(page, { worker: true });
    await reloaded(page, 1000);
    expect(await page.evaluate(() => sessionStorage.__unregistered)).toBe("1");
    expect(await askReport(page)).toMatch(/\nBefore the automatic reload at [^\n]+\n[^]*\nService worker: controls the page \(x\.com\/sw\.js\), 1 removed\n/);

    // still answered by it after the reload (a stub here): no more reloads, the panel says how to remove it by hand
    await inject(page);
    await page.clock.runFor(21000);
    expect(await findings(page)).toEqual([
        "x.com's service worker (x.com/sw.js) answers TweetDeck's page, past the extension. Remove it by hand and reload the page: about:serviceworkers in Firefox, chrome://serviceworker-internals in Chrome, find x.com and press \"Unregister\".",
        RELOADED,
    ]);
    expect(await page.evaluate(() => sessionStorage.__unregistered)).toBe("1");
});

test("after a reload, without errors it waits 20 s, and goes away when TweetDeck starts after all", async ({ page }) => {
    await openWatched(page, { reloaded: true });
    await inject(page);
    expect(await page.evaluate(() => window.__ran)).toBe(true);

    await page.clock.runFor(15000);
    await expect(panel(page)).toHaveCount(0);
    await page.clock.runFor(6000);
    await expect(panel(page)).toBeVisible();
    expect(await findings(page)).toEqual(["No errors in sight: X may be slow to answer. Wait or reload the page.", RELOADED]);

    await page.evaluate(() => document.querySelector(".js-app").classList.remove("is-hidden"));
    await page.clock.runFor(1000);
    await expect(panel(page)).toHaveCount(0);
});

test("TweetDeck's login form counts as started", async ({ page }) => {
    await openWatched(page);
    await inject(page);
    await page.evaluate(() => document.querySelector(".js-app-loading").insertAdjacentHTML("beforeend", '<section class="js-login-form"></section>'));
    await page.clock.runFor(25000);
    await expect(panel(page)).toHaveCount(0);
    expect(await page.evaluate(() => {
        let report = "";
        document.addEventListener("otd-diagnostic-report", e => { report = e.detail; });
        document.dispatchEvent(new CustomEvent("otd-diagnostic-request"));
        return report;
    })).toContain("TweetDeck: started at ");
});

test("the extension that never started, files that didn't load, the solver and X's answers, without queries", async ({ page }) => {
    const cors = { "access-control-allow-origin": "http://otd.test" };
    await openWatched(page, { routes: {
        "https://upload.x.com/i/ok": route => route.fulfill({ status: 200, headers: cors, contentType: "application/json", body: "{}" }),
        "https://upload.x.com/": route => route.fulfill({ status: 401, headers: cors, contentType: "application/json", body: "{}" }),
        "https://upload.twitter.com/": route => route.fulfill({ status: 503, headers: cors, contentType: "application/json", body: "{}" }),
    }, reloaded: true });
    await page.clock.runFor(21000);
    expect(await findings(page)).toEqual(["The extension didn't start on the page: its script got no answer. Reload the page; if that doesn't help, restart the browser or reinstall the extension.", RELOADED]);

    // the real reporters: injection.js's file loader is in its main(), so a file is reported by hand
    await page.evaluate(() => document.dispatchEvent(new CustomEvent("otd-diagnostic", { detail: JSON.stringify({ kind: "file", path: "/src/settings.js", error: "TypeError: NetworkError" }) })));
    // the solver can't reach x.com's homepage here
    await addScripts(page, "src/challenge.js", "src/interception.js");
    const urls = [
        "https://upload.x.com/i/ok",
        "https://upload.x.com/1.1/media/upload.json?command=STATUS&media_id=123",
        "https://upload.twitter.com/1.1/media/upload.json?command=STATUS&media_id=456",
        // the solver can't sign it, so it never goes out
        "https://api.x.com/1.1/account/verify_credentials.json?include_email=true",
    ];
    await page.evaluate(urls => new Promise(resolve => {
        let reported = 0;
        document.addEventListener("otd-diagnostic", e => {
            if(JSON.parse(e.detail).kind === "response" && ++reported === urls.length) resolve();
        });
        for(const url of urls) {
            const xhr = new XMLHttpRequest();
            xhr.open("GET", url);
            xhr.send();
        }
    }), urls);
    await page.clock.runFor(1000);
    const list = await findings(page);
    expect(list).toHaveLength(6);
    expect(list[1]).toBe("The extension's files didn't load: /src/settings.js. Reinstall the extension and keep its files after installing.");
    expect(list[2]).toMatch(/^x-client-transaction-id can't be computed, and X refuses some requests without it: TypeError: /);
    expect(list[3]).toBe("X answers 401/403: you're probably not logged in to x.com in this browser or the session expired. Open x.com, log in and reload this page.");
    expect(list[4]).toMatch(/^X answers with errors: /);
    expect(list[4]).toContain("GET upload.twitter.com/1.1/media/upload.json — 503");
    expect(list[4]).toContain("GET api.x.com/1.1/account/verify_credentials.json — not sent (Solver errored)");

    await panel(page).getByRole("button", { name: "Copy diagnostics" }).click();
    const report = await page.evaluate(() => window.__copied);
    expect(report).toMatch(/\nSolver: failed at \d+ s \(TypeError: [^)]*\)\n/);
    expect(report).toContain("\nExtension files not loaded: /src/settings.js\n");
    expect(report).toContain("\nX: 1 answered fine, errors:\n");
    expect(report).toMatch(/\n {2}GET upload\.x\.com\/1\.1\/media\/upload\.json — 401 ×1, first at \d+ s\n/);
    expect(report).not.toMatch(/command=|media_id|include_email/);
    // all answered, or never sent
    expect(report).toContain("\nWaiting for X: nothing\n");
});

test("switched off, no reload and no panel; the report is still there", async ({ page }) => {
    await openWatched(page);
    await page.evaluate(() => { localStorage.OTDloadWatchdog = "0"; });
    await page.clock.runFor(30000);
    await expect(panel(page)).toHaveCount(0);
    expect(await page.evaluate(() => {
        let report = "";
        document.addEventListener("otd-diagnostic-report", e => { report = e.detail; });
        document.dispatchEvent(new CustomEvent("otd-diagnostic-request"));
        return report;
    })).toContain("TweetDeck: not started");
});
