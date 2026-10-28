// TweetDeck's look to today's standards: contrast of the light theme, 32px buttons, keyboard focus, text rhythm,
// and the system's "reduce motion"
const { test, expect } = require("@playwright/test");
const { openPage, addTweetDeck, addAccount, addScripts } = require("./helpers");

test.use({ viewport: { width: 600, height: 700 } });

async function open(page, { dark = false, storage } = {}) {
    await openPage(page, { storage });
    await page.evaluate(dark => { if(dark) document.documentElement.classList.add("dark"); }, dark);
    await addTweetDeck(page, { css: true });
    await addAccount(page);
    await addScripts(page, "src/otd-common.js", "src/modern-look.js");
    await page.evaluate(() => {
        TD.settings.getColumnWidth = () => "medium";
        const user = { id_str: "10", screen_name: "alice", name: "alice", profile_image_url_https: "", entities: {} };
        const tweet = (id, extra) => window.__client.processTweet({ id_str: id, full_text: "hello @bob", text: "hello @bob", created_at: new Date().toUTCString(), source: "web", user,
            entities: { hashtags: [], symbols: [], urls: [], user_mentions: [{ id_str: "20", screen_name: "bob", name: "bob", indices: [6, 10] }] }, ...extra });
        document.body.insertAdjacentHTML("beforeend", '<section class="js-column column" style="width:340px"><div class="js-chirp-container chirp-container"></div></section>');
        const container = document.querySelector(".js-chirp-container");
        container.insertAdjacentHTML("beforeend", tweet("1").render({}));
        container.insertAdjacentHTML("beforeend", tweet("2", { favorited: true }).render({}));
    });
}

// a color's contrast against white or #15202b, by WCAG's formula
const looks = page => page.evaluate(() => {
    const rgb = s => s.match(/\d+/g).slice(0, 3).map(Number);
    const lum = c => { const [r, g, b] = c.map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
    const bg = document.documentElement.classList.contains("dark") ? [21, 32, 43] : [255, 255, 255];
    const contrast = el => { const [a, b] = [lum(rgb(getComputedStyle(el).color)), lum(bg)]; return Math.round((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) * 100) / 100; };
    const [first, liked] = document.querySelectorAll("article");
    return {
        handle: contrast(first.querySelector(".username")),
        time: contrast(first.querySelector(".tweet-timestamp")),
        link: contrast(first.querySelector(".tweet-text a")),
        action: contrast(first.querySelector('.tweet-action[rel="reply"]')),
        liked: getComputedStyle(liked.querySelector(".icon-favorite-toggle")).color,
        text: [getComputedStyle(first.querySelector(".tweet-text")).lineHeight, getComputedStyle(first.querySelector(".username")).fontSize],
    };
});

test("the light theme's grey text, links and icons pass WCAG AA; a liked tweet keeps its red heart", async ({ page }) => {
    await open(page);
    const result = await looks(page);
    expect(result.handle).toBeGreaterThanOrEqual(4.5);
    expect(result.time).toBeGreaterThanOrEqual(4.5);
    expect(result.link).toBeGreaterThanOrEqual(4.5);
    expect(result.action).toBeGreaterThanOrEqual(3);
    expect(result.liked).toBe("rgb(224, 36, 94)");
    // tweet text at 1.4, @handles at 13px
    expect(result.text).toEqual(["19.6px", "13px"]);
});

test("the dark theme keeps its colors, which already pass", async ({ page }) => {
    await open(page, { dark: true });
    expect(await looks(page)).toMatchObject({ handle: 5.62, link: 5.84, action: 5.62 });
});

test("a tweet's buttons take a 32px circle: a click next to the 18px icon still hits the button", async ({ page }) => {
    await open(page);
    const hit = () => page.evaluate(() => {
        const like = document.querySelector('article .tweet-action[rel="favorite"]');
        const icon = like.querySelector(".icon").getBoundingClientRect();
        // 13px under the icon's middle: outside its 18px, inside the 32px circle (to the side is the next button)
        const el = document.elementFromPoint(icon.left + icon.width / 2, icon.top + icon.height / 2 + 13);
        return el?.closest(".tweet-action")?.getAttribute("rel") ?? null;
    });
    expect(await hit()).toBe("favorite");
    await page.evaluate(() => document.documentElement.classList.remove("otd-modern"));
    expect(await hit()).not.toBe("favorite");
});

test("keyboard focus shows, a click doesn't draw it", async ({ page }) => {
    await open(page);
    const focused = () => page.evaluate(() => `${document.activeElement.getAttribute("rel")} ${getComputedStyle(document.activeElement).outlineStyle}`);
    await page.click('article .tweet-action[rel="favorite"]', { position: { x: 9, y: 9 } });
    expect(await focused()).toBe("favorite none");
    await page.keyboard.press("Tab");
    expect(await focused()).toBe("actionsMenu solid");
});

test("the system's \"reduce motion\" stops TweetDeck's animations, with the switch off too", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await open(page, { storage: { OTDmodernLook: "0" } });
    expect(await page.evaluate(() => [window.__require(0).fx.off, getComputedStyle(document.querySelector(".chirp-container")).transitionDuration])).toEqual([true, "1e-05s"]);
    // switched off: TweetDeck's own colors
    expect(await page.evaluate(() => document.documentElement.classList.contains("otd-modern"))).toBe(false);
    expect((await looks(page)).handle).toBe(2.94);

    await page.emulateMedia({ reducedMotion: "no-preference" });
    await expect.poll(() => page.evaluate(() => window.__require(0).fx.off)).toBe(false);
});
