const { test, expect } = require("@playwright/test");
const { openPage, addTweetDeck, addScripts, addAccount } = require("./helpers");

test.use({ locale: "ru-RU", timezoneId: "Europe/Moscow" });

async function open(page, storage) {
    await openPage(page, { storage });
    await addTweetDeck(page);
    await addScripts(page, "src/otd-common.js", "src/clean-links.js", "src/absolute-time.js");
    await addAccount(page);
}

// A tweet with a t.co link, as TweetDeck renders its text
const renderedLink = page => page.evaluate(() => {
    const text = "смотри https://t.co/abc123 и https://t.co/bad";
    const json = {
        id_str: "100", full_text: text, text, created_at: new Date().toUTCString(), source: "web",
        user: { id_str: "10", screen_name: "alice", name: "alice", profile_image_url_https: "", entities: {} },
        entities: { hashtags: [], user_mentions: [], symbols: [], urls: [
            { url: "https://t.co/abc123", expanded_url: "https://example.com/page?a=1&b=2", display_url: "example.com/page?a=1…", indices: [7, 26] },
            { url: "https://t.co/bad", expanded_url: "javascript:alert(1)", display_url: "bad", indices: [29, 45] },
        ] },
    };
    const chirp = window.__client.processTweet(json);
    const holder = document.createElement("div");
    holder.innerHTML = chirp.htmlText;
    return [...holder.querySelectorAll("a")].map(a => ({ href: a.getAttribute("href"), full: a.dataset.fullUrl ?? null, text: a.textContent }));
});

test("links in tweets go straight to the site, with t.co only for what isn't a web address", async ({ page }) => {
    await open(page);
    expect(await renderedLink(page)).toEqual([
        { href: "https://example.com/page?a=1&b=2", full: "https://example.com/page?a=1&b=2", text: "example.com/page?a=1…" },
        { href: "https://t.co/bad", full: "javascript:alert(1)", text: "bad" },
    ]);
});

test("a profile's website is the site's address", async ({ page }) => {
    await open(page);
    const result = await page.evaluate(() => {
        const user = new TD.services.TwitterUser(window.__account).fromJSONObject({
            id_str: "10", screen_name: "alice", name: "Alice", url: "https://t.co/site", profile_image_url_https: "",
            entities: { url: { urls: [{ url: "https://t.co/site", expanded_url: "https://alice.example/", display_url: "alice.example" }] }, description: { urls: [] } },
        });
        const templates = Object.keys(TD.mustaches).filter(name => typeof TD.mustaches[name] === "string" && TD.mustaches[name].includes("prf-siteurl"));
        const holder = document.createElement("div");
        try {
            holder.innerHTML = TD.ui.template.render("twitter_profile", { twitterProfile: { profile: user }, profile: user, user });
        } catch(e) {
            return { error: e.message };
        }
        return {
            expanded: user.getExpandedURL(),
            templates: templates.map(name => TD.mustaches[name].includes('href="{{getExpandedURL}}" class="prf-siteurl')),
            rendered: [...holder.querySelectorAll("a.prf-siteurl")].map(a => a.getAttribute("href")),
        };
    });
    expect(result.expanded).toBe("https://alice.example/");
    expect(result.templates.length).toBeGreaterThan(0);
    expect(result.templates.every(Boolean)).toBe(true);
    expect(result.rendered).toEqual(["https://alice.example/"]);
});

test("OTDcleanLinks=0 keeps t.co", async ({ page }) => {
    await open(page, { OTDcleanLinks: "0" });
    expect((await renderedLink(page))[0].href).toBe("https://t.co/abc123");
});

// today, earlier this year (a day that isn't today) and last year
const times = page => page.evaluate(() => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 5);
    const thisYear = new Date(now.getFullYear(), 2, now.getMonth() === 2 && now.getDate() === 3 ? 4 : 3, 14, 5);
    const lastYear = new Date(now.getFullYear() - 1, 11, 25, 14, 5);
    // the way TweetDeck refreshes the times of tweets on screen
    document.body.insertAdjacentHTML("beforeend", `<time class="js-timestamp" data-time="${lastYear.getTime()}"><a href="#">5m</a></time>`);
    TD.ui.updates.refreshTimestamps();
    return new Promise(resolve => requestAnimationFrame(() => setTimeout(() => resolve({
        today: TD.util.prettyDate(today),
        thisYear: TD.util.prettyDate(thisYear),
        lastYear: TD.util.prettyDate(lastYear),
        refreshed: document.querySelector("time.js-timestamp a").textContent,
        year: now.getFullYear() - 1,
    }), 50)));
});

test("tweet times as time and date when switched on", async ({ page }) => {
    await open(page, { OTDabsoluteTime: "1" });
    const result = await times(page);
    expect(result.today).toMatch(/^0?0:05$/);
    expect(result.thisYear).toContain("14:05");
    expect(result.thisYear).toMatch(/мар/);
    expect(result.lastYear).toMatch(new RegExp(`^25\\D12\\D${result.year}$`));
    // TweetDeck's own refresh of the times on screen gives the same
    expect(result.refreshed).toBe(result.lastYear);
});

test("relative times stay TweetDeck's by default", async ({ page }) => {
    await open(page);
    const result = await times(page);
    expect(result.thisYear).not.toContain("14:05");
    expect(result.refreshed).toBe(result.lastYear);
});
