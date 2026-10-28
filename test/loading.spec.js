// A column before its tweets: shapes of tweets while it loads, "X didn't answer" with a retry when the load
// failed, and a plain message with what to do when it's empty
const { test, expect } = require("@playwright/test");
const { openPage, addTweetDeck, addScripts } = require("./helpers");

test.use({ locale: "ru-RU", viewport: { width: 700, height: 700 } });

// a column of TweetDeck's markup with `template` in its chirp container; TweetDeck's column for it a stub
async function open(page, { template, data = {}, search = false, state = "backfill_loading", storage } = {}) {
    await page.clock.install();
    await openPage(page, { storage });
    await addTweetDeck(page, { css: true });
    await page.evaluate(([template, data, search, state]) => {
        window.__calls = [];
        const column = {
            state,
            backfill() { window.__calls.push(`backfill ${this.state}`); this.state = "backfill_loading"; },
            reloadTweets() { window.__calls.push("reload"); },
        };
        TD.controller.columnManager.get = key => key === "c1" ? column : null;
        document.body.insertAdjacentHTML("beforeend", `<section class="js-column column" data-column="c1" style="height:600px">
            <header><a href="#" data-action="options">options</a></header>${search ? '<div class="js-search-filter-callout"></div>' : ""}
            <div class="js-column-scroller js-dropdown-container column-scroller position-rel scroll-v flex-auto height-p--100" style="height:560px"><div class="js-chirp-container chirp-container">${TD.ui.template.render(template, data)}</div></div></section>`);
        document.querySelector('[data-action="options"]').addEventListener("click", e => { e.preventDefault(); window.__calls.push("options"); });
    }, [template, data, search, state]);
    await addScripts(page, "src/otd-common.js", "src/loading.js");
}
const placeholder = ".js-chirp-container > .js-column-loading-placeholder";
const look = page => page.$eval(placeholder, el => ({
    shapes: getComputedStyle(el).backgroundImage.startsWith("radial-gradient"),
    height: el.getBoundingClientRect().height,
    // "Loading…" stays for screen readers
    text: el.textContent.trim(),
    textWidth: el.querySelector("p")?.getBoundingClientRect().width,
}));
const state = page => page.$eval(".otd-column-state", box => [...box.children].map(child => child.textContent));
const calls = page => page.evaluate(() => window.__calls);

test("a loading column shows shapes of tweets, \"Loading…\" left for screen readers; switched off, TweetDeck's", async ({ page }) => {
    await open(page, { template: "column_loading_placeholder" });
    expect(await look(page)).toEqual({ shapes: true, height: 460, text: "Loading…", textWidth: 1 });
    await page.evaluate(() => OTD.setOn("skeletons", false));
    expect(await look(page)).toMatchObject({ shapes: false, text: "Loading…" });
    expect((await look(page)).textWidth).toBeGreaterThan(30);
});

test("a load TweetDeck gave up on says X didn't answer, and tries again", async ({ page }) => {
    await open(page, { template: "column_loading_placeholder", state: "awaiting_backfill" });
    await page.clock.runFor(5000);
    expect(await page.$(".otd-column-state")).toBeNull();
    // the column is looked at every 2 s, from the first look: 8 s are past by 11 s whenever that was
    await page.clock.runFor(6000);
    expect(await state(page)).toEqual(["X не ответил", "Колонка не загрузилась. Обычно помогает ещё одна попытка.", "Повторить"]);
    expect((await look(page)).shapes).toBe(false);

    await page.click(".otd-column-state-action");
    expect(await calls(page)).toEqual(["backfill awaiting_backfill"]);
    expect(await page.$(".otd-column-state")).toBeNull();
    expect((await look(page)).shapes).toBe(true);
});

test("a load still going after 30 s says X is taking too long; its retry starts the load again", async ({ page }) => {
    await open(page, { template: "column_loading_placeholder" });
    await page.clock.runFor(20000);
    expect(await page.$(".otd-column-state")).toBeNull();
    await page.clock.runFor(12000);
    expect((await state(page))[0]).toBe("X отвечает слишком долго");
    await page.click(".otd-column-state-action");
    expect(await calls(page)).toEqual(["backfill awaiting_backfill"]);
});

test("an empty column says so in the reader's language, with a refresh", async ({ page }) => {
    await open(page, { template: "search_no_tweets_placeholder" });
    await page.clock.runFor(100);
    expect(await state(page)).toEqual(["Здесь пока пусто", "Новые твиты появятся здесь сами.", "Обновить"]);
    await page.click(".otd-column-state-action");
    expect(await calls(page)).toEqual(["reload"]);
});

test("an empty search offers its options", async ({ page }) => {
    await open(page, { template: "search_no_tweets_placeholder", search: true });
    await page.clock.runFor(100);
    expect(await state(page)).toEqual(["Здесь пока пусто", "По этому запросу твитов нет. Можно поменять запрос или фильтры.", "Настройки колонки"]);
    await page.click(".otd-column-state-action");
    expect(await calls(page)).toEqual(["options"]);
});

test("a collection keeps TweetDeck's \"drag tweets here\"", async ({ page }) => {
    await open(page, { template: "search_no_tweets_placeholder", data: { isDropTarget: true } });
    await page.clock.runFor(100);
    expect(await page.$(".otd-column-state")).toBeNull();
    expect(await page.textContent(".list-placeholder")).toContain("Drag Tweets into this Collection");
});

test.describe("in English", () => {
    test.use({ locale: "en-US" });
    test("messages follow the browser language", async ({ page }) => {
        await open(page, { template: "search_no_tweets_placeholder" });
        await page.clock.runFor(100);
        expect(await state(page)).toEqual(["Nothing here yet", "New tweets will show up here by themselves.", "Refresh"]);
    });
});
