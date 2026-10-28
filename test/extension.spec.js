// The unpacked extension in Chromium, on an x.com whose homepage, scripts and API are stubbed
const crypto = require("crypto");
const { test, expect, chromium } = require("@playwright/test");
const { parseHTML } = require("linkedom");
const { ClientTransaction } = require("x-client-transaction-id");
const { ROOT, read } = require("./helpers");
const { ONDEMAND_PATH, animations, homepage, ondemand, key } = require("./fixtures/x-home");

const KEY = key("extension");
const HOME = homepage(KEY, animations(9));
const ONDEMAND = ondemand([3, 2, 13, 41]);
const VERSION = JSON.parse(read("manifest.json")).version;
const NEXT_VERSION = VERSION.replace(/\d+$/, n => Number(n) + 1);

async function launch(testInfo, { release = VERSION, pageHeaders = {} } = {}) {
    const context = await chromium.launchPersistentContext(testInfo.outputPath("profile"), {
        channel: "chromium",
        args: [`--disable-extensions-except=${ROOT}`, `--load-extension=${ROOT}`],
    });
    const urls = [];
    const apiCalls = [];
    context.on("request", request => urls.push(request.url()));
    await context.route("**/*", route => {
        const request = route.request();
        const url = new URL(request.url());
        const cors = { "access-control-allow-origin": "*" };
        if(url.protocol === "chrome-extension:" || url.protocol === "data:") return route.continue();
        if(url.hostname === "x.com" && url.pathname === "/i/tweetdeck") return route.fulfill({ contentType: "text/html", headers: pageHeaders, body: "<!doctype html><html><head></head><body>x</body></html>" });
        if(url.hostname === "x.com" && url.pathname === "/") return route.fulfill({ contentType: "text/html", body: HOME });
        if(url.hostname === "abs.twimg.com" && url.pathname === ONDEMAND_PATH) return route.fulfill({ contentType: "text/javascript", headers: cors, body: ONDEMAND });
        if(url.hostname === "api.github.com") return route.fulfill({ contentType: "application/json", headers: cors, body: JSON.stringify({ tag_name: `v${release}` }) });
        if(/(^|\.)(x|twitter)\.com$/.test(url.hostname)) {
            apiCalls.push({ path: url.pathname, method: request.method(), id: request.headers()["x-client-transaction-id"] });
            return route.fulfill({ status: 401, contentType: "application/json", headers: { "access-control-allow-origin": "https://x.com", "access-control-allow-credentials": "true" }, body: '{"errors":[{"code":32}]}' });
        }
        return route.abort();
    });
    const page = await context.newPage();
    const logs = [];
    const errors = [];
    page.on("console", message => logs.push(message.text()));
    page.on("pageerror", error => errors.push(error.message));
    await page.goto("https://x.com/i/tweetdeck");
    return { context, page, urls, apiCalls, logs, errors };
}

async function referenceAnimationKey() {
    const realFetch = globalThis.fetch;
    globalThis.fetch = async () => new Response(ONDEMAND);
    try {
        return (await ClientTransaction.create(parseHTML(HOME).document)).animationKey;
    } finally {
        globalThis.fetch = realFetch;
    }
}
function isValidId(id, method, path, animationKey) {
    if(!id) return false;
    const raw = Buffer.from(id, "base64");
    const bytes = [...raw.subarray(1)].map(b => b ^ raw[0]);
    const time = bytes[48] | bytes[49] << 8 | bytes[50] << 16 | bytes[51] << 24;
    const hash = crypto.createHash("sha256").update(`${method}!${path}!${time}obfiowerehiring${animationKey}`).digest();
    return Buffer.from(bytes.slice(0, 48)).equals(Buffer.from(KEY, "base64")) && Buffer.from(bytes.slice(52, 68)).equals(hash.subarray(0, 16)) && bytes[68] === 3;
}

test("TweetDeck starts and signs its requests to X, loading nothing from elsewhere", async ({}, testInfo) => {
    const { context, page, urls, apiCalls, logs, errors } = await launch(testInfo);
    try {
        await expect.poll(() => logs.some(l => l.startsWith("Transaction id solver is ready")), { timeout: 20000 }).toBe(true);
        await expect.poll(() => apiCalls.map(c => c.path), { timeout: 20000 }).toContain("/1.1/account/verify_credentials.json");
        expect(logs.filter(l => /Solver init error|Challenge error/.test(l))).toEqual([]);

        const animationKey = await referenceAnimationKey();
        for(const call of apiCalls) expect(isValidId(call.id, call.method, call.path, animationKey), `${call.method} ${call.path}`).toBe(true);
        // other scripts get the same ids (grok-translate.js, x-articles.js)
        const ids = await page.evaluate(async () => [await solveChallenge("/i/api/graphql/abc/HomeLatestTimeline", "GET"), await solveChallenge("/1.1/statuses/update.json", "POST")]);
        expect(isValidId(ids[0], "GET", "/i/api/graphql/abc/HomeLatestTimeline", animationKey)).toBe(true);
        expect(isValidId(ids[1], "POST", "/1.1/statuses/update.json", animationKey)).toBe(true);

        // this extension's scripts are all in, otd-common.js before the rest
        expect(await page.evaluate(() => typeof window.OTD?.watch)).toBe("function");
        expect(await page.evaluate(() => [OTD.VERSION, TD.components.GlobalSettings.prototype.getInfo().tabs.map(t => t.action)])).toEqual([VERSION, ["general", "services", "filter", "oldtweetdeck"]]);
        expect(errors.filter(e => /OTD/.test(e))).toEqual([]);
        // the page loads the emoji list from the extension when the picker opens
        expect(await page.evaluate(async () => (await (await fetch(`${OTD.BASE_URL}files/emoji.json`)).json()).emoji.length)).toBeGreaterThan(1800);
        // and Medeo Sans for TweetDeck's text
        await expect.poll(() => page.evaluate(() => [...document.fonts].filter(f => f.family.replace(/"/g, "") === "Medeo Sans" && f.status === "loaded").length)).toBe(2);
        expect(urls.filter(u => u.includes("/files/fonts/")).map(u => new URL(u).protocol)).toEqual(["chrome-extension:", "chrome-extension:"]);
        expect(await page.locator("iframe[srcdoc]").count()).toBe(0);
        expect(urls.filter(u => /abs\.twimg\.com\/.*vendor\./.test(u))).toEqual([]);
        expect(urls.filter(u => /dimden|oldtd\.org|raw\.githubusercontent\.com/.test(u))).toEqual([]);

        // logged out (X answers 401 here), TweetDeck shows its login form, and the load watchdog stays away
        await expect(page.locator(".js-login-form")).toBeVisible();
        expect(await page.evaluate(() => getComputedStyle(document.querySelector(".js-login-form")).fontFamily)).toMatch(/^"Medeo Sans", /);
        const report = await page.evaluate(() => {
            let report = "";
            document.addEventListener("otd-diagnostic-report", e => { report = e.detail; });
            document.dispatchEvent(new CustomEvent("otd-diagnostic-request"));
            return report;
        });
        expect(report).toMatch(/\nTweetDeck: started at \d+ s\n/);
        expect(report).toMatch(/\nSteps: extension \d+ s, page \d+ s, scripts \d+ s; TD yes, OTD yes\n/);
        expect(report).toMatch(/\nSolver: ready at \d+ s \(ondemand\.s\.[\w-]+\.js\)\n/);
        expect(report).toContain("\nBlocked by Content-Security-Policy: nothing\n");
        expect(report).toMatch(/\nLoaded: navigate, from the (network \(\d+ kB\)|browser's cache); Chrome's rules took its policies off\n/);
        expect(report).toContain("\nService worker: none\n");
        expect(report).toMatch(/\n {2}GET api\.x\.com\/1\.1\/account\/verify_credentials\.json — 401 ×\d+, first at \d+ s\n/);
        // TweetDeck's own, with where it happened
        expect(report).toMatch(/\n {2}TypeError: .*id_str.* \((src|files)\/[\w-]+\.js:\d+\) ×\d+, first at \d+ s/);
        expect(await page.locator("#otd-watchdog").count()).toBe(0);
    } finally {
        await context.close();
    }
});

test("a newer release on GitHub is announced", async ({}, testInfo) => {
    const { context, page } = await launch(testInfo, { release: NEXT_VERSION });
    try {
        const notice = page.locator(".otd-notification-modal");
        await expect(notice).toBeVisible({ timeout: 20000 });
        await expect(notice).toContainText(NEXT_VERSION);
        await expect(notice).toContainText(VERSION);
    } finally {
        await context.close();
    }
});

test("the current release is not announced", async ({}, testInfo) => {
    const { context, page, urls } = await launch(testInfo);
    try {
        await expect.poll(() => urls.some(u => u.startsWith("https://api.github.com/repos/Dezeter/OldTweetDeck/releases/latest")), { timeout: 20000 }).toBe(true);
        await page.waitForTimeout(1000);
        expect(await page.locator(".otd-notification-modal").count()).toBe(0);
    } finally {
        await context.close();
    }
});

test("when x.com's page policy gets through, the page says so instead of loading forever", async ({}, testInfo) => {
    // route.fulfill skips the extension's rules, x.com's policy stays on the page as it would if they failed
    const { context, page } = await launch(testInfo, { pageHeaders: { "content-security-policy": "script-src 'nonce-abc' https://abs.twimg.com" } });
    try {
        const panel = page.locator("#otd-watchdog");
        await expect(panel).toBeVisible({ timeout: 15000 });
        await expect(panel.locator(".findings li").first()).toContainText("Content-Security-Policy");
        // it reloaded once first, which a policy route.fulfill gives every time can't fix
        await expect(panel.locator(".findings li").last()).toContainText("reloaded automatically already");
        expect(await page.locator(".js-app:not(.is-hidden), .js-login-form").count()).toBe(0);
    } finally {
        await context.close();
    }
});
