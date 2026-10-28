// Density, the theme that follows the system's, and Lights out; all of them apply without a reload
const { test, expect } = require("@playwright/test");
const { openPage, addTweetDeck, addAccount, addScripts } = require("./helpers");

test.use({ viewport: { width: 1200, height: 700 } });

async function open(page, { storage, columns = 3, dark = false, before } = {}) {
    await openPage(page, { storage });
    await addTweetDeck(page, { css: true });
    await addAccount(page);
    await page.evaluate(([columns, dark]) => {
        if(dark) document.documentElement.classList.add("dark");
        TD.settings.getColumnWidth = () => "medium";
        const user = { id_str: "10", screen_name: "alice", name: "alice", profile_image_url_https: "", entities: {} };
        const tweet = window.__client.processTweet({ id_str: "1", full_text: "hello", text: "hello", created_at: new Date().toUTCString(), source: "web", user, entities: { hashtags: [], symbols: [], urls: [], user_mentions: [] } });
        const column = i => `<section class="js-column column" data-column="c${i}"><div class="column-panel"><div class="js-chirp-container chirp-container">${tweet.render({})}</div></div></section>`;
        document.body.insertAdjacentHTML("beforeend", `<div class="js-app-columns-container app-columns-container scroll-h"><div class="js-app-columns app-columns horizontal-flow-container">${Array.from({ length: columns }, (_, i) => column(i)).join("")}</div></div>`);
    }, [columns, dark]);
    // [function, argument] to run in the page before the scripts load
    if(before) await page.evaluate(...before);
    await addScripts(page, "src/otd-common.js", "src/layout.js", "src/theme.js");
}
test("comfortable density: more room around a tweet and text from 15px, larger font sizes kept", async ({ page }) => {
    await open(page);
    const look = () => page.evaluate(() => {
        const style = getComputedStyle(document.querySelector(".stream-item > .item-box"));
        return [style.padding, getComputedStyle(document.querySelector(".tweet-text")).fontSize];
    });
    const compact = await look();
    expect(compact[0]).toBe("8px 10px");
    await page.evaluate(() => OTD.setValue(OTD.DENSITY_STORAGE, "comfortable"));
    expect(await look()).toEqual(["12px 14px", "15px"]);
    expect(await page.evaluate(() => localStorage.OTDdensity)).toBe("comfortable");
    // TweetDeck's "Largest", 16px
    await page.evaluate(() => document.documentElement.classList.add("txt-size--16"));
    expect((await look())[1]).toBe("16px");
    await page.evaluate(() => {
        document.documentElement.classList.remove("txt-size--16");
        OTD.setValue(OTD.DENSITY_STORAGE, "");
    });
    expect(await look()).toEqual(compact);
});

// TweetDeck's theme setting as a stub: the theme it holds and what was set
const stubTheme = theme => [theme => {
    window.__theme = theme;
    window.__sets = [];
    TD.settings.getTheme = () => window.__theme;
    TD.settings.setTheme = value => {
        window.__theme = value;
        window.__sets.push(value);
    };
}, theme];
const ready = page => page.evaluate(() => {
    TD.ready = true;
    OTD.jQuery()(document).trigger("TD.ready.otd-theme");
});

test("\"System\" follows the system's theme once TweetDeck is ready, and as it changes", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await open(page, { storage: { OTDthemeSystem: "1" }, before: stubTheme("light") });
    // TweetDeck's settings aren't there yet
    expect(await page.evaluate(() => window.__sets)).toEqual([]);
    await ready(page);
    expect(await page.evaluate(() => window.__sets)).toEqual(["dark"]);
    await page.emulateMedia({ colorScheme: "light" });
    await expect.poll(() => page.evaluate(() => window.__sets)).toEqual(["dark", "light"]);

    // TweetDeck's own pick ends it, "system" starts it again
    await page.evaluate(() => TD.settings.setTheme("dark"));
    expect(await page.evaluate(() => localStorage.OTDthemeSystem ?? null)).toBeNull();
    await page.emulateMedia({ colorScheme: "dark" });
    await page.emulateMedia({ colorScheme: "light" });
    expect(await page.evaluate(() => window.__sets)).toEqual(["dark", "light", "dark"]);
    await page.evaluate(() => TD.settings.setTheme("system"));
    expect(await page.evaluate(() => [localStorage.OTDthemeSystem, window.__theme])).toEqual(["1", "light"]);
});

test("without \"System\" the theme stays TweetDeck's", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await open(page, { before: stubTheme("light") });
    await ready(page);
    await page.emulateMedia({ colorScheme: "light" });
    await page.emulateMedia({ colorScheme: "dark" });
    expect(await page.evaluate(() => window.__sets)).toEqual([]);
});

const colors = page => page.evaluate(() => ({
    column: getComputedStyle(document.querySelector(".column")).backgroundColor,
    item: getComputedStyle(document.querySelector(".stream-item")).backgroundColor,
    border: getComputedStyle(document.querySelector(".stream-item")).borderBottomColor,
    app: getComputedStyle(document.querySelector(".app-columns-container")).backgroundColor,
    mute: getComputedStyle(document.querySelector(".tweet-timestamp")).color,
}));

test("Lights out: the dark theme in x.com's black, with TweetDeck's dark blues swapped; off, back to them", async ({ page }) => {
    await open(page, { dark: true, storage: { OTDlightsOut: "1" } });
    expect(await colors(page)).toEqual({ column: "rgb(0, 0, 0)", item: "rgb(0, 0, 0)", border: "rgb(47, 51, 54)", app: "rgb(22, 24, 28)", mute: "rgb(113, 118, 123)" });
    // a rule with !important keeps it
    expect(await page.evaluate(() => {
        document.body.insertAdjacentHTML("beforeend", '<div class="accounts-drawer"></div>');
        return getComputedStyle(document.querySelector(".accounts-drawer")).backgroundColor;
    })).toBe("rgb(0, 0, 0)");

    await page.evaluate(() => OTD.setOn("lightsOut", false));
    expect(await colors(page)).toEqual({ column: "rgb(21, 32, 43)", item: "rgb(21, 32, 43)", border: "rgb(0, 0, 0)", app: "rgb(16, 23, 30)", mute: "rgb(136, 153, 166)" });
    await page.evaluate(() => OTD.setOn("lightsOut", true));
    expect((await colors(page)).column).toBe("rgb(0, 0, 0)");
    expect(await page.$$("#otd-lights-out")).toHaveLength(1);
});

test("Lights out leaves the light theme alone", async ({ page }) => {
    await open(page, { storage: { OTDlightsOut: "1" } });
    expect(await colors(page)).toMatchObject({ column: "rgb(255, 255, 255)", item: "rgb(255, 255, 255)" });
});
