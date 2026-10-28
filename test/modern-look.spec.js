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
    // Chrome writes it "1e-05s", Firefox "0.00001s"
    expect(await page.evaluate(() => [window.__require(0).fx.off, parseFloat(getComputedStyle(document.querySelector(".chirp-container")).transitionDuration)])).toEqual([true, 0.00001]);
    // switched off: TweetDeck's own colors
    expect(await page.evaluate(() => document.documentElement.classList.contains("otd-modern"))).toBe(false);
    expect((await looks(page)).handle).toBe(2.94);

    await page.emulateMedia({ reducedMotion: "no-preference" });
    await expect.poll(() => page.evaluate(() => window.__require(0).fx.off)).toBe(false);
});

test("6px between a tweet's text and its buttons; a quote's text in the tweet's color, also in the dark theme", async ({ page }) => {
    await open(page, { dark: true });
    const look = () => page.evaluate(() => {
        const user = { id_str: "30", screen_name: "carol", name: "carol", profile_image_url_https: "", entities: {} };
        if(!document.querySelector('[data-key="3"]')) {
            const quoted = { id_str: "4", full_text: "quoted words", text: "quoted words", created_at: new Date().toUTCString(), source: "web", user, entities: { hashtags: [], symbols: [], urls: [], user_mentions: [] } };
            const chirp = window.__client.processTweet({ ...quoted, id_str: "3", full_text: "quoting", text: "quoting", is_quote_status: true, quoted_status_id_str: "4", quoted_status: quoted });
            document.querySelector(".js-chirp-container").insertAdjacentHTML("beforeend", chirp.render({}));
        }
        const article = document.querySelector('[data-key="3"]');
        return [getComputedStyle(article.querySelector(".tweet-footer")).marginTop, getComputedStyle(article.querySelector(".js-quoted-tweet-text")).color === getComputedStyle(article.querySelector(".tweet-text")).color];
    });
    expect(await look()).toEqual(["6px", true]);
    await page.evaluate(() => OTD.setOn("modernLook", false));
    expect(await look()).toEqual(["3px", false]);
});

test("a notification's \"Name retweeted\" stays on one line, a long name cut short", async ({ page }) => {
    await open(page);
    const header = () => page.evaluate(() => {
        if(!document.querySelector(".activity-header")) {
            const entities = { description: { urls: [] }, url: { urls: [] } };
            const me = { id_str: "1", id: 1, screen_name: "me", name: "me", profile_image_url_https: "", entities };
            const them = { id_str: "40", id: 40, screen_name: "raen", name: "RAEN Foundation of a very long and winding name", entities,
                profile_image_url_https: "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48"><rect width="48" height="48" fill="#e0245e"/></svg>') };
            const target = { id_str: "9", full_text: "mine", text: "mine", created_at: new Date().toUTCString(), source: "web", user: me, entities: { hashtags: [], symbols: [], urls: [], user_mentions: [] } };
            const ts = Date.now();
            const [chirp] = TD.services.TwitterAction.processRESTAction({ action: "retweet", created_at: new Date(ts).toUTCString(), max_position: `${ts}`, min_position: `${ts}`, sources: [them], sources_size: 1, targets: [target], targets_size: 1, target_objects: [target], target_objects_size: 1 }, window.__account);
            document.querySelector(".js-chirp-container").insertAdjacentHTML("afterbegin", chirp.render({}));
        }
        const line = document.querySelector(".activity-header.has-source-avatar > .nbfc");
        return [Math.round(line.getBoundingClientRect().height), Math.round(line.querySelector(".avatar").getBoundingClientRect().width), line.textContent.includes("Retweeted")];
    });
    // one line of 20px and TweetDeck's 2px under it
    expect(await header()).toEqual([22, 20, true]);
    await page.evaluate(() => OTD.setOn("modernLook", false));
    expect((await header())[0]).toBeGreaterThan(22);
});
