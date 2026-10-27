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
