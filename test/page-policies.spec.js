// The extension takes x.com's own page policies off /i/tweetdeck, or TweetDeck can't run there: its CSP blocks
// the scripts injection.js adds, and cross-origin isolation (COOP / COEP) makes Firefox keep the CSP anyway.
const { test, expect } = require("@playwright/test");
const { openPage, read } = require("./helpers");

const X_HEADERS = [
    { name: "content-security-policy", value: "script-src 'nonce-abc' 'self' 'unsafe-inline' https://*.twimg.com; report-uri https://x.com/i/csp_report" },
    { name: "content-security-policy-report-only", value: "script-src 'none'" },
    { name: "cross-origin-opener-policy", value: "same-origin-allow-popups" },
    { name: "cross-origin-embedder-policy", value: "require-corp" },
    { name: "strict-transport-security", value: "max-age=631138519" },
    { name: "Content-Type", value: "text/html; charset=utf-8" },
];
const POLICIES = /^(content-security-policy|cross-origin-(opener|embedder)-policy)(-report-only)?$/i;

test("Firefox's background script takes x.com's page policies off TweetDeck's page and keeps the rest", async ({ page }) => {
    await openPage(page);
    const result = await page.evaluate(([source, headers]) => {
        const listeners = {};
        const event = name => ({ addListener: (fn, filter, spec) => { (listeners[name] ||= []).push({ fn, filter, spec }); } });
        window.chrome = {
            webRequest: { OnHeadersReceivedOptions: {}, onHeadersReceived: event("headers"), onBeforeSendHeaders: event("send"), onBeforeRequest: event("request") },
            webNavigation: { onCommitted: event("navigation") },
            runtime: { onMessage: event("message"), getURL: path => path },
            storage: { local: { get: (defaults, done) => done(defaults), set: () => {} } },
        };
        new Function(source)();
        const [listener] = listeners.headers;
        return { filter: listener.filter.urls, spec: listener.spec, headers: listener.fn({ url: "https://x.com/i/tweetdeck", responseHeaders: headers }).responseHeaders.map(h => h.name) };
    }, [read("src/background.js"), X_HEADERS]);
    expect(result.filter).toEqual(expect.arrayContaining(["https://x.com/i/tweetdeck", "https://x.com/i/tweetdeck?*", "https://twitter.com/i/tweetdeck"]));
    expect(result.spec).toEqual(expect.arrayContaining(["blocking", "responseHeaders"]));
    expect(result.headers).toEqual(["strict-transport-security", "Content-Type"]);
});

test("Chrome's rules take the same policies off TweetDeck's page on x.com and twitter.com", () => {
    const rules = JSON.parse(read("ruleset.json")).filter(rule => rule.action.type === "modifyHeaders");
    expect(rules.map(rule => rule.condition.urlFilter).sort()).toEqual(["https://twitter.com/i/tweetdeck", "https://x.com/i/tweetdeck"]);
    for(const rule of rules) {
        const removed = rule.action.responseHeaders.filter(h => h.operation === "remove").map(h => h.header);
        for(const { name } of X_HEADERS.filter(h => POLICIES.test(h.name))) expect(removed, rule.condition.urlFilter).toContain(name);
        expect(removed).toContain("cross-origin-embedder-policy-report-only");
        expect(rule.condition.resourceTypes).toContain("main_frame");
    }
});

test("Firefox's background script tells the load watchdog what it took off a tab's page, and reloads past the cache", async ({ page }) => {
    await openPage(page);
    const result = await page.evaluate(async ([source, headers]) => {
        const listeners = {};
        const reloads = [];
        const event = name => ({ addListener: (fn, filter, spec) => { (listeners[name] ||= []).push({ fn, filter, spec }); } });
        window.chrome = {
            webRequest: { OnHeadersReceivedOptions: {}, onHeadersReceived: event("headers"), onBeforeSendHeaders: event("send"), onBeforeRequest: event("request") },
            webNavigation: { onCommitted: event("navigation") },
            runtime: { onMessage: event("message"), getURL: path => path },
            tabs: { reload: (tabId, options) => reloads.push([tabId, options]) },
            storage: { local: { get: (defaults, done) => done(defaults), set: () => {} } },
        };
        new Function(source)();
        const ask = (action, tabId) => new Promise(resolve => listeners.message[0].fn({ action }, { tab: { id: tabId } }, resolve));
        const before = await ask("otdPage", 7);
        listeners.headers[0].fn({ url: "https://x.com/i/tweetdeck", type: "main_frame", tabId: 7, statusCode: 200, fromCache: false, responseHeaders: headers });
        listeners.headers[0].fn({ url: "https://x.com/i/tweetdeck?x", type: "xmlhttprequest", tabId: 8, statusCode: 200, responseHeaders: headers });
        const seen = await ask("otdPage", 7);
        const other = await ask("otdPage", 8);
        listeners.message[0].fn({ action: "otdReload" }, { tab: { id: 7 } }, () => {});
        return { before, seen, other, reloads };
    }, [read("src/background.js"), X_HEADERS]);
    expect(result.before).toBeNull();
    expect(result.seen).toEqual({ status: 200, fromCache: false, stripped: ["content-security-policy", "content-security-policy-report-only", "cross-origin-opener-policy", "cross-origin-embedder-policy"] });
    expect(result.other).toBeNull();
    expect(result.reloads).toEqual([[7, { bypassCache: true }]]);
});

test("Chrome's background script reloads past the cache, and says its rules don't tell", async ({ page }) => {
    await openPage(page);
    const result = await page.evaluate(async source => {
        let listener;
        const reloads = [];
        self.importScripts = () => {};
        window.chrome = { runtime: { onMessage: { addListener: fn => { listener = fn; } } }, tabs: { reload: (tabId, options) => reloads.push([tabId, options]) } };
        new Function(source)();
        const page = await new Promise(resolve => listener({ action: "otdPage" }, { tab: { id: 3 } }, resolve));
        listener({ action: "otdReload" }, { tab: { id: 3 } }, () => {});
        return { page, reloads };
    }, read("src/background3.js"));
    expect(result).toEqual({ page: { rules: true }, reloads: [[3, { bypassCache: true }]] });
});

test("content.js passes the load watchdog's questions to the background script and the answer back", async ({ page }) => {
    await openPage(page);
    const result = await page.evaluate(async source => {
        const sent = [];
        const answers = [];
        window.chrome = { runtime: { getURL: () => "", sendMessage: (message, reply) => {
            sent.push(message);
            if(message.action === "otdPage") reply({ status: 200, fromCache: false, stripped: [] });
        } } };
        new Function(source)();
        window.addEventListener("message", e => { if(e.data && "otdPage" in e.data) answers.push(e.data.otdPage); });
        window.postMessage({ action: "otdPage" }, "*");
        window.postMessage({ action: "otdReload" }, "*");
        window.postMessage({ action: "otdServiceWorker", block: true }, "*");
        window.postMessage({ action: "otdServiceWorker", block: "yes" }, "*");
        await new Promise(resolve => setTimeout(resolve, 100));
        return { sent, answers };
    }, read("src/content.js"));
    expect(result).toEqual({
        sent: [{ action: "otdPage" }, { action: "otdReload" }, { action: "otdServiceWorker", block: true }, { action: "otdServiceWorker", block: false }],
        answers: [{ status: 200, fromCache: false, stripped: [] }],
    });
});

test("Firefox's background script keeps x.com's service worker script from loading while the setting says so, and remembers it", async ({ page }) => {
    await openPage(page);
    const result = await page.evaluate(async source => {
        const listeners = {};
        const stored = { blockServiceWorker: true };
        const event = name => ({ addListener: (fn, filter, spec) => { (listeners[name] ||= []).push({ fn, filter, spec }); } });
        window.chrome = {
            webRequest: { OnHeadersReceivedOptions: {}, onHeadersReceived: event("headers"), onBeforeSendHeaders: event("send"), onBeforeRequest: event("request") },
            webNavigation: { onCommitted: event("navigation") },
            runtime: { onMessage: event("message"), getURL: path => path },
            storage: { local: { get: (defaults, done) => done({ ...defaults, ...stored }), set: items => Object.assign(stored, items) } },
        };
        new Function(source)();
        const worker = listeners.request.find(l => l.filter.urls.includes("https://x.com/sw.js*"));
        const load = () => worker.fn({ url: "https://x.com/sw.js", type: "script" }) ?? null;
        const tell = block => listeners.message[0].fn({ action: "otdServiceWorker", block }, { tab: { id: 1 } }, () => {});
        const remembered = load();
        tell(false);
        const off = [load(), { ...stored }];
        tell(true);
        const on = [load(), { ...stored }];
        return { filter: worker.filter.urls, spec: worker.spec, remembered, off, on };
    }, read("src/background.js"));
    expect(result).toEqual({
        filter: ["https://x.com/sw.js*", "https://twitter.com/sw.js*"],
        spec: ["blocking"],
        remembered: { cancel: true },
        off: [null, { blockServiceWorker: false }],
        on: [{ cancel: true }, { blockServiceWorker: true }],
    });
});

test("Chrome's background script keeps x.com's service worker script from loading with rules of its own while the setting says so", async ({ page }) => {
    await openPage(page);
    const result = await page.evaluate(async source => {
        let listener;
        const updates = [];
        self.importScripts = () => {};
        window.chrome = { runtime: { onMessage: { addListener: fn => { listener = fn; } } }, declarativeNetRequest: { updateDynamicRules: update => updates.push(update) } };
        new Function(source)();
        listener({ action: "otdServiceWorker", block: true }, { tab: { id: 3 } }, () => {});
        listener({ action: "otdServiceWorker", block: false }, { tab: { id: 3 } }, () => {});
        return updates;
    }, read("src/background3.js"));
    expect(result).toEqual([
        { removeRuleIds: [100, 101], addRules: [
            { id: 100, priority: 1, action: { type: "block" }, condition: { urlFilter: "|https://x.com/sw.js" } },
            { id: 101, priority: 1, action: { type: "block" }, condition: { urlFilter: "|https://twitter.com/sw.js" } },
        ] },
        { removeRuleIds: [100, 101], addRules: [] },
    ]);
});
