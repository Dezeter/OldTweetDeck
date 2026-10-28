const { test, expect } = require("@playwright/test");
const { openPage, addTweetDeck, addScripts, addAccount } = require("./helpers");

test.use({ locale: "en-US", viewport: { width: 420, height: 1400 } });

// A column TweetDeck rendered, newest first: alice's reply to bob, a self-reply whose tweet isn't in the column,
// bob's retweet of a self-reply, and alice's thread of three, which X sends without self_thread now.
async function openColumn(page, storage) {
    await openPage(page, { storage });
    await addTweetDeck(page, { css: true });
    await addAccount(page);
    await addScripts(page, "src/otd-common.js", "src/self-threads.js");
    await page.evaluate(() => {
        TD.settings.getColumnWidth = () => "medium";
        const user = (id, screenName) => ({ id_str: id, screen_name: screenName, name: screenName, profile_image_url_https: "", entities: {} });
        const alice = user("10", "alice"), bob = user("20", "bob");
        const tweet = (id, author, text, reply) => ({ id_str: id, full_text: text, text, created_at: new Date(1790000000000 + Number(id) * 1000).toUTCString(), source: "web", user: author,
            entities: { hashtags: [], user_mentions: [], symbols: [], urls: [] },
            ...(reply ? { in_reply_to_status_id_str: reply[0], in_reply_to_user_id_str: reply[1].id_str, in_reply_to_screen_name: reply[1].screen_name } : {}) });
        const chirps = [
            window.__client.processTweet({ ...tweet("300", alice, "@bob to bob", ["250", bob]), display_text_range: [5, 11],
                entities: { hashtags: [], symbols: [], urls: [], user_mentions: [{ id_str: "20", screen_name: "bob", name: "bob", indices: [0, 4] }] } }),
            window.__client.processTweet(tweet("200", alice, "a later one", ["150", alice])),
            window.__client.processTweet({ ...tweet("190", bob, "RT"), retweeted_status: tweet("180", alice, "retweeted one", ["170", alice]) }),
            window.__client.processTweet(tweet("102", alice, "three", ["101", alice])),
            window.__client.processTweet(tweet("101", alice, "two", ["100", alice])),
            window.__client.processTweet(tweet("100", alice, "one")),
        ];
        window.__chirps = Object.fromEntries(chirps.map(c => [c.id, c]));
        TD.controller.columnManager = { get: key => key === "c1" ? { findChirp: id => window.__chirps[id] } : null };
        document.body.insertAdjacentHTML("beforeend", '<section class="js-column column" data-column="c1" style="width:340px;display:block"><div class="js-column-scroller column-scroller"><div class="js-chirp-container chirp-container"></div></div></section>');
        const container = document.querySelector(".js-chirp-container");
        for(const chirp of chirps) container.insertAdjacentHTML("beforeend", chirp.render({}));
    });
    await page.waitForTimeout(300);
}

// what each tweet shows: "Replying to", "Show this thread", the lines
const items = page => page.evaluate(() => Object.fromEntries([...document.querySelectorAll(".js-chirp-container > article")].map(article => [article.dataset.key, {
    replying: article.querySelector(".other-replies")?.textContent.trim().replace(/\s+/g, " ") || null,
    showThread: !!article.querySelector(".js-show-this-thread p") && getComputedStyle(article.querySelector(".js-show-this-thread")).display !== "none",
    lines: [...article.querySelectorAll(".otd-thread-line")].map(line => line.className.match(/otd-thread-line-(\w+)/)[1]),
}])));

test("a thread has no \"Replying to @author\", and its tweets next to each other are joined by a line", async ({ page }) => {
    await openColumn(page);
    expect(await items(page)).toEqual({
        "300": { replying: "Replying to @bob", showThread: false, lines: [] },
        "200": { replying: null, showThread: true, lines: [] },
        "190": { replying: null, showThread: true, lines: [] },
        "102": { replying: null, showThread: false, lines: ["down"] },
        "101": { replying: null, showThread: false, lines: ["down", "up"] },
        "100": { replying: null, showThread: false, lines: ["up"] },
    });

    // the line runs under the avatars, from one to the next
    const geometry = await page.evaluate(() => [...document.querySelectorAll('article[data-key="102"], article[data-key="101"]')].map(article => {
        const avatar = article.querySelector(".tweet-header .tweet-img").getBoundingClientRect();
        const down = article.querySelector(".otd-thread-line-down").getBoundingClientRect();
        return { centered: Math.abs(down.left + down.width / 2 - (avatar.left + avatar.width / 2)) <= 1, below: down.top >= avatar.bottom, toNext: Math.round(article.nextElementSibling.getBoundingClientRect().top - down.bottom) };
    }));
    expect(geometry).toEqual([{ centered: true, below: true, toNext: 0 }, { centered: true, below: true, toNext: 0 }]);
    const up = await page.evaluate(() => {
        const article = document.querySelector('article[data-key="100"]');
        const line = article.querySelector(".otd-thread-line-up").getBoundingClientRect();
        return { fromTop: Math.round(line.top - article.getBoundingClientRect().top), aboveAvatar: line.bottom <= article.querySelector(".tweet-header .tweet-img").getBoundingClientRect().top };
    });
    expect(up).toEqual({ fromTop: 0, aboveAvatar: true });
});

test("a new tweet above takes its place in the thread, and lines go with tweets that go", async ({ page }) => {
    await openColumn(page);
    await page.evaluate(() => {
        const chirp = window.__client.processTweet({ id_str: "103", full_text: "four", text: "four", created_at: new Date().toUTCString(), source: "web",
            user: { id_str: "10", screen_name: "alice", name: "alice", profile_image_url_https: "", entities: {} },
            entities: { hashtags: [], user_mentions: [], symbols: [], urls: [] }, in_reply_to_status_id_str: "102", in_reply_to_user_id_str: "10", in_reply_to_screen_name: "alice" });
        window.__chirps["103"] = chirp;
        document.querySelector('article[data-key="102"]').insertAdjacentHTML("beforebegin", chirp.render({}));
        document.querySelector('article[data-key="100"]').remove();
    });
    await expect.poll(async () => Object.fromEntries(Object.entries(await items(page)).map(([key, item]) => [key, item.lines]))).toEqual({
        "300": [], "200": [], "190": [], "103": ["down"], "102": ["down", "up"], "101": ["up"],
    });
});

test("only while TweetDeck renders a tweet is a self-reply in a thread: the tweet view, which asks too, keeps its reply box", async ({ page }) => {
    await openColumn(page);
    expect(await page.evaluate(() => [window.__chirps["101"].isInThread(), window.__chirps["200"].isInThread()])).toEqual([false, false]);
    // around an opened tweet, as TweetDeck renders the ones it replies to
    const replying = await page.evaluate(() => {
        const box = document.createElement("div");
        box.innerHTML = window.__chirps["101"].render({ isInConvo: true });
        return box.querySelector(".other-replies")?.textContent ?? null;
    });
    expect(replying).toBeNull();
});

test("OTDselfThreads=0 leaves TweetDeck's \"Replying to\" and no lines", async ({ page }) => {
    await openColumn(page, { OTDselfThreads: "0" });
    const result = await items(page);
    expect(result["101"]).toEqual({ replying: "Replying to @alice", showThread: false, lines: [] });
    expect(await page.locator(".otd-thread-line").count()).toBe(0);
});
