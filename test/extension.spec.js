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

async function launch(testInfo, { release = VERSION } = {}) {
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
        if(url.hostname === "x.com" && url.pathname === "/i/tweetdeck") return route.fulfill({ contentType: "text/html", body: "<!doctype html><html><head></head><body>x</body></html>" });
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
    page.on("console", message => logs.push(message.text()));
    await page.goto("https://x.com/i/tweetdeck");
    return { context, page, urls, apiCalls, logs };
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
    const { context, page, urls, apiCalls, logs } = await launch(testInfo);
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

        expect(await page.locator("iframe[srcdoc]").count()).toBe(0);
        expect(urls.filter(u => /abs\.twimg\.com\/.*vendor\./.test(u))).toEqual([]);
        expect(urls.filter(u => /dimden|oldtd\.org|raw\.githubusercontent\.com/.test(u))).toEqual([]);
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
