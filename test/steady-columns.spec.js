// What's on the screen of a column stays in place when TweetDeck drops or adds tweets above it, by TweetDeck's own
// code (TD.ui.columns.alterColumnContents), with the browser not keeping the position itself, as Firefox gives up
// doing for a column, and a scroll TweetDeck hasn't heard of yet
const { test, expect } = require("@playwright/test");
const { openPage, addTweetDeck, addAccount, addScripts } = require("./helpers");

test.use({ viewport: { width: 600, height: 800 } });

// a home column of 80 tweets of one to four lines, its scroll followed by TweetDeck
async function openColumn(page, storage) {
    await openPage(page, { storage });
    await addTweetDeck(page, { css: true });
    await addAccount(page);
    await page.evaluate(() => {
        const user = { id_str: "10", screen_name: "alice", name: "alice", profile_image_url_https: "", entities: {} };
        const tweet = i => window.__client.processTweet({ id_str: String(1000 - i), full_text: `tweet ${i} `.repeat(4 + (i % 4) * 12), text: "", created_at: new Date().toUTCString(), source: "web", user, entities: { hashtags: [], symbols: [], urls: [], user_mentions: [] } });
        document.body.insertAdjacentHTML("beforeend", '<section class="js-column column" data-column="home" style="width:400px;height:700px;display:block"><div class="js-column-scroller column-scroller scroll-v" style="height:700px;overflow-y:auto;overflow-anchor:none"><div class="js-chirp-container chirp-container" data-column="home"></div></div></section>');
        document.querySelector(".js-chirp-container").innerHTML = Array.from({ length: 80 }, (_, i) => tweet(i).render({})).join("");
        TD.ui.columns.setupColumnScrollListeners({ model: { getKey: () => "home" } });
    });
    await addScripts(page, "src/otd-common.js", "src/steady-columns.js");
}

// scrolled to the 50th tweet, then on by 900px TweetDeck hasn't heard of yet; then TweetDeck's change: how far the
// tweet on the top of the screen moved, and the column's scroll
const change = (page, kind) => page.evaluate(async kind => {
    const scroller = document.querySelector(".js-column-scroller");
    const items = () => [...scroller.querySelectorAll("article.js-stream-item")];
    scroller.scrollTop = items()[50].offsetTop;
    await new Promise(resolve => setTimeout(resolve, 200));
    scroller.scrollTop += 900;
    const top = scroller.getBoundingClientRect().top;
    const reading = items().find(item => item.getBoundingClientRect().top >= top);
    const before = reading.getBoundingClientRect().top;
    const $ = OTD.jQuery();
    if(kind === "drop") {
        // as removeOffscreen does after a page of older tweets: the first 20 go
        const first = $(items().slice(0, 20));
        TD.ui.columns.alterColumnContents("home", first.eq(0), () => first.remove(), { willBreakScrollPosition: true });
    } else {
        // new tweets on top
        const fresh = $(items().slice(0, 10).map(item => item.outerHTML.replace(/data-key="/, 'data-key="n')).join(""));
        TD.ui.columns.alterColumnContents("home", fresh, () => $(scroller.querySelector(".js-chirp-container")).prepend(fresh), { willBreakScrollPosition: true });
    }
    return Math.round(reading.getBoundingClientRect().top - before);
}, kind);

test("TweetDeck drops tweets above the screen: what's on it stays put", async ({ page }) => {
    await openColumn(page);
    expect(await change(page, "drop")).toBe(0);
});

test("new tweets come above the screen: what's on it stays put", async ({ page }) => {
    await openColumn(page);
    expect(await change(page, "add")).toBe(0);
});

test("switched off, TweetDeck's own puts the column back by where it last heard it was", async ({ page }) => {
    await openColumn(page, { OTDsteadyColumns: "0" });
    expect(Math.abs(await change(page, "drop"))).toBeGreaterThan(100);
});

test("at the top of a column new tweets show, as TweetDeck has it", async ({ page }) => {
    await openColumn(page);
    expect(await page.evaluate(() => {
        const scroller = document.querySelector(".js-column-scroller");
        const $ = OTD.jQuery();
        const fresh = $(scroller.querySelector("article").outerHTML.replace(/data-key="/, 'data-key="n'));
        // TweetDeck tells by itself whether the change breaks the scroll: at the top it doesn't
        TD.ui.columns.alterColumnContents("home", fresh, () => $(scroller.querySelector(".js-chirp-container")).prepend(fresh));
        return [scroller.scrollTop, scroller.querySelector("article").dataset.key.startsWith("n")];
    })).toEqual([0, true]);
});

test("a column keeps 200 tweets before it drops the ones above, not 40", async ({ page }) => {
    await openColumn(page);
    expect(await page.evaluate(() => {
        // as TweetDeck's column sets it when it's made
        const column = Object.create(TD.vo.Column.prototype);
        column.TARGET_COLUMN_CHIRP_LIMIT = 40;
        return column.TARGET_COLUMN_CHIRP_LIMIT;
    })).toBe(200);
});
