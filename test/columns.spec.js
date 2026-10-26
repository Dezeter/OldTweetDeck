const { test, expect } = require("@playwright/test");
const { openPage, addTweetDeck, addScripts } = require("./helpers");

test.use({ viewport: { width: 900, height: 600 } });

// two columns TweetDeck-style: a scroller with more tweets than fit, plus TweetDeck's unread badge for messages
async function open(page, storage) {
    await openPage(page, { storage });
    await addTweetDeck(page);
    await page.evaluate(() => {
        const column = key => `<section class="js-column column" data-column="${key}" style="display:inline-block;width:300px;height:400px;vertical-align:top">
            <div class="js-column-scroller column-scroller" style="height:400px;overflow-y:auto"><div class="js-chirp-container">${"<article style=\"height:120px\">tweet</article>".repeat(10)}</div></div></section>`;
        document.body.insertAdjacentHTML("beforeend", `<div style="padding:20px">${column("c1")}${column("c2")}</div><span class="js-unread-count msg-unread-count"></span>`);
    });
    await addScripts(page, "src/otd-common.js", "src/pause-on-hover.js", "src/tab-title.js");
}
const scrollTop = (page, key) => page.evaluate(key => document.querySelector(`[data-column="${key}"] .js-column-scroller`).scrollTop, key);

test("a column at its top is held while the pointer is over it, and let go after", async ({ page }) => {
    await open(page);
    await page.hover('[data-column="c1"] article');
    expect(await scrollTop(page, "c1")).toBe(1);
    expect(await scrollTop(page, "c2")).toBe(0);

    await page.hover('[data-column="c2"] article');
    expect(await scrollTop(page, "c1")).toBe(0);
    expect(await scrollTop(page, "c2")).toBe(1);

    // a column scrolled down by the reader is left alone, both ways (the pointer moves without scrolling
    // anything into view, as hover would)
    await page.evaluate(() => { document.querySelector('[data-column="c1"] .js-column-scroller').scrollTop = 300; });
    const box = await page.locator('[data-column="c1"]').boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    expect(await scrollTop(page, "c1")).toBe(300);
    await page.mouse.move(890, 590);
    expect(await scrollTop(page, "c1")).toBe(300);
});

test("OTDpauseOnHover=0 leaves the columns alone", async ({ page }) => {
    await open(page, { OTDpauseOnHover: "0" });
    await page.hover('[data-column="c1"] article');
    expect(await scrollTop(page, "c1")).toBe(0);
});

test("the tab title shows unread messages, then new tweets, then nothing", async ({ page }) => {
    await open(page);
    const set = (messages, tweets) => page.evaluate(([messages, tweets]) => {
        const badge = document.querySelector(".js-unread-count");
        badge.textContent = messages || "";
        badge.classList.toggle("is-visible", !!messages);
        document.querySelector('[data-column="c2"]').classList.toggle("is-new", tweets);
        // TweetDeck's own event, as it sends it when a column or a conversation is read
        OTD.jQuery()(document).trigger("uiMessageUnreadCount", { count: messages });
    }, [messages, tweets]);
    expect(await page.title()).toBe("TweetDeck");

    await set(3, true);
    await expect(page).toHaveTitle("(3) TweetDeck");
    await set(0, true);
    await expect(page).toHaveTitle("(*) TweetDeck");
    await set(0, false);
    await expect(page).toHaveTitle("TweetDeck");
});

test("OTDtabTitle=0 leaves the title alone", async ({ page }) => {
    await open(page, { OTDtabTitle: "0" });
    await page.evaluate(() => {
        document.querySelector(".js-unread-count").classList.add("is-visible");
        document.querySelector(".js-unread-count").textContent = "3";
    });
    await page.waitForTimeout(2200);
    expect(await page.title()).toBe("TweetDeck");
});
