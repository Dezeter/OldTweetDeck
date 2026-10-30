// A notification's kind, the heart, the retweet or the follow, in the avatars' column in the middle of the item
// (compact-headers.js), where nothing else is in that column
const { test, expect } = require("@playwright/test");
const { openPage, addTweetDeck, addScripts } = require("./helpers");

test.use({ viewport: { width: 500, height: 900 } });

// A notifications column of @Dezeter, rendered by TweetDeck from activity JSON: a like and a retweet of my tweet, a
// follow, and a like of someone else's tweet I'm mentioned in
async function openColumn(page, storage) {
    await openPage(page, { storage });
    await addTweetDeck(page, { css: true });
    await page.evaluate(() => {
        const account = { getUserID: () => "1", getKey: () => "twitter:1", getUsername: () => "Dezeter", getName: () => "Dezeter", getProfileImageURL: () => "", isPrivate: () => false };
        const user = (id, name) => ({ id_str: id, id: +id, screen_name: name.toLowerCase(), name, profile_image_url_https: "", entities: { description: { urls: [] }, url: { urls: [] } }, description: "" });
        const me = user("1", "Dezeter"), a = user("11", "Alice"), b = user("12", "Bob"), c = user("13", "Carol");
        const entities = { hashtags: [], urls: [], user_mentions: [], symbols: [] };
        const tweet = (id, author, text) => ({ id_str: id, full_text: text, text, created_at: new Date(Date.now() - 864e5).toUTCString(), user: author, entities, source: "web" });
        const mine = tweet("100", me, "Самый быстрый способ перевести деньги без комиссии, благодарим за доверие. Вторая строка, чтобы твит был в несколько строк");
        const mention = tweet("200", c, "Спасибо @Dezeter за расширение!");
        let t = 0;
        const act = (action, source, target) => {
            const ts = Date.now() - (t += 60000);
            const json = { action, created_at: new Date(ts).toUTCString(), max_position: `${ts}`, min_position: `${ts}`, sources: [source], sources_size: 1, targets: [target], targets_size: 1, target_objects: [target], target_objects_size: 1 };
            return TD.services.TwitterAction.processRESTAction(json, account)[0];
        };
        const chirps = [["like", act("favorite", a, mine)], ["retweet", act("retweet", b, mine)], ["follow", act("follow", c, me)], ["mention liked", act("favorited_mention", a, mention)]];
        document.body.insertAdjacentHTML("beforeend", `<section class="js-column column" data-column="c1" style="width:400px;display:block"><header class="column-header"><span class="attribution">@Dezeter</span></header><div class="js-column-scroller column-scroller"><div class="js-chirp-container chirp-container">${chirps.map(([label, chirp]) => chirp.render({ mediaPreviewSize: "medium" }).replace("<article ", `<article data-label="${label}" `)).join("")}</div></div></section>`);
    });
    await addScripts(page, "src/otd-common.js", "src/layout.js", "src/icons.js", "src/compact-headers.js");
    await page.waitForTimeout(300);
}

// where the icon is: from the item's left and its middle; where the text starts, and a follower's avatar
const places = page => page.evaluate(() => Object.fromEntries([...document.querySelectorAll("article[data-label]")].map(article => {
    const item = article.querySelector(".js-stream-item-content").getBoundingClientRect();
    // its box: at line height 1 the SVG of icons.js fills it
    const icon = article.querySelector(".activity-header .icon").getBoundingClientRect();
    const name = article.querySelector(".activity-header .nbfc").getBoundingClientRect();
    const avatar = article.querySelector(".account-summary .avatar")?.getBoundingClientRect();
    return [article.dataset.label, {
        aside: article.classList.contains("otd-kind-aside"),
        across: Math.round(icon.left + icon.width / 2 - item.left),
        middle: Math.round(icon.top + icon.height / 2 - (item.top + item.height / 2)),
        size: Math.round(icon.width),
        text: Math.round(name.left - item.left),
        avatar: avatar ? Math.round(avatar.left - item.left) : null,
    }];
})));

test("a like, a retweet of my tweet and a follow: the icon in the avatars' column, in the middle of the item", async ({ page }) => {
    await openColumn(page);
    const at = await places(page);
    // the avatars' column: 36px from the item's 10px padding, its middle 28px in; the text 56px in
    for(const kind of ["like", "retweet", "follow"]) {
        expect(at[kind], kind).toMatchObject({ aside: true, across: 28, size: 20, text: 56 });
        expect(Math.abs(at[kind].middle), kind).toBeLessThanOrEqual(1);
    }
    // the follower's avatar by the name, in the text's column
    expect(at.follow.avatar).toBe(56);
    // a liked tweet that shows its author's avatar: the icon stays over it, at the top
    expect(at["mention liked"].aside).toBe(false);
    expect(at["mention liked"].middle).toBeLessThan(-10);
});

test("comfortable density: the icon in the middle of its wider padding", async ({ page }) => {
    await openColumn(page, { OTDdensity: "comfortable" });
    const at = await places(page);
    expect(at.like).toMatchObject({ aside: true, across: 32, text: 60 });
});

test("short headers off: the icon where TweetDeck puts it", async ({ page }) => {
    await openColumn(page, { OTDcompactHeaders: "0" });
    const at = await places(page);
    expect(Object.values(at).map(place => place.aside)).toEqual([false, false, false, false]);
    expect(at.like.middle).toBeLessThan(-10);
});
