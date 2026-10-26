const { test, expect } = require("@playwright/test");
const { openPage, addTweetDeck, addScripts } = require("./helpers");

async function filterHome(page) {
    return page.evaluate(() => {
        const account = { getUserID: () => "1", getKey: () => "twitter:1", getUsername: () => "me", getUserName: () => "me", getProfileImageURL: () => "", getName: () => "me" };
        const user = (id, screenName) => ({ id_str: id, screen_name: screenName, name: screenName, profile_image_url_https: "", entities: {} });
        const base = (id, author) => ({ id_str: id, full_text: `text ${id}`, text: `text ${id}`, created_at: new Date(Date.now() - Number(id) * 1000).toUTCString(), user: author, entities: { hashtags: [], urls: [], user_mentions: [], symbols: [] }, source: "<a>web</a>" });
        const alice = user("10", "alice"), bob = user("20", "bob");
        const tweets = {
            plain: base("101", alice),
            replyToOther: { ...base("102", alice), in_reply_to_status_id_str: "900", in_reply_to_user_id_str: "20", in_reply_to_screen_name: "bob" },
            selfThread: { ...base("103", alice), in_reply_to_status_id_str: "101", in_reply_to_user_id_str: "10", in_reply_to_screen_name: "alice" },
            retweetOfReply: { ...base("104", bob), retweeted_status: { ...base("105", alice), in_reply_to_status_id_str: "900", in_reply_to_user_id_str: "30", in_reply_to_screen_name: "carol" } },
            myReply: { ...base("106", user("1", "me")), in_reply_to_status_id_str: "901", in_reply_to_user_id_str: "20", in_reply_to_screen_name: "bob" },
        };
        const chirps = Object.fromEntries(Object.entries(tweets).map(([name, json]) => [name, new TD.services.TwitterStatus(account).fromJSONObject(json)]));
        const column = type => ({ model: { getClearedTimestamp: () => 0 }, filters: [], getFeedsByType: t => (t === type ? [{}] : []) });
        const run = col => TD.vo.Column.prototype.filterAllowedChirps.call(col, Object.values(chirps)).map(c => Object.keys(chirps).find(name => chirps[name] === c));
        return { home: run(column("home")), list: run(column("list")) };
    });
}

test("home columns hide replies to other people, keep threads and retweets of replies", async ({ page }) => {
    await openPage(page);
    await addTweetDeck(page);
    await page.evaluate(() => { window.__original = TD.vo.Column.prototype.filterAllowedChirps; });
    await addScripts(page, "src/otd-common.js", "src/hide-home-replies.js");
    // patched synchronously, before TweetDeck loads any column
    expect(await page.evaluate(() => TD.vo.Column.prototype.filterAllowedChirps !== window.__original)).toBe(true);

    const result = await filterHome(page);
    expect(result.home).toEqual(["plain", "selfThread", "retweetOfReply"]);
    expect(result.list).toHaveLength(5);
});

test("OTDhideHomeReplies=0 leaves TweetDeck untouched", async ({ page }) => {
    await openPage(page, { storage: { OTDhideHomeReplies: "0" } });
    await addTweetDeck(page);
    await addScripts(page, "src/otd-common.js", "src/hide-home-replies.js");
    expect((await filterHome(page)).home).toHaveLength(5);
});
