const { test, expect } = require("@playwright/test");
const { openPage, addTweetDeck, addScripts, addAccount } = require("./helpers");

// A tweet's detail view with one reply, the way TweetDeck shows it after /tweets/conversation/<id>
async function openConversation(page, storage) {
    await openPage(page, { storage });
    await addTweetDeck(page);
    await addScripts(page, "src/otd-common.js", "src/instant-replies.js");
    await addAccount(page);
    await page.evaluate(() => {
        const $ = window.__require(0);
        window.$td = $;
        const client = window.__client;
        client.getConversation = () => {};
        const user = (id, screenName) => ({ id_str: id, screen_name: screenName, name: screenName, profile_image_url_https: "https://pbs.twimg.com/x.jpg", entities: { description: { urls: [] } } });
        window.tw = (id, uid, reply, text) => ({ id_str: id, full_text: text || `text ${id}`, text: text || `text ${id}`, created_at: new Date().toUTCString(), user: user(uid, uid === "1" ? "me" : `u${uid}`), entities: { hashtags: [], urls: [], user_mentions: [], symbols: [] }, source: "<a>web</a>", ...(reply ? { in_reply_to_status_id_str: reply, in_reply_to_user_id_str: "10" } : {}) });
        const main = client.processTweet(tw("100", "10"));
        const repliesTo = new TD.components.RepliesTo(main, { model: { getKey: () => "c1" }, ui: {} }, "medium", false);
        document.body.appendChild(repliesTo.$node[0]);
        window.__repliesTo = repliesTo;
        $.publish("/tweets/conversation/100", [{ ancestors: [], descendants: [client.processTweet(tw("201", "20", "100"))], root: main }]);
    });
}
const replyIds = page => page.evaluate(() => [...new Set([...window.__repliesTo.$node[0].querySelectorAll(".js-replies-to [data-tweet-id]")].map(e => e.getAttribute("data-tweet-id")))]);
const send = (page, request, response) => page.evaluate(({ request, response }) => {
    window.$td(document).trigger("dataTweetSent", { request, response: Array.isArray(response) ? tw(...response) : response });
}, { request, response });

test("a sent reply shows up in the open conversation right away, once", async ({ page }) => {
    await openConversation(page);
    expect(await replyIds(page)).toEqual(["201"]);

    await send(page, { type: "reply", accountKey: "twitter:1", inReplyToStatusId: "100" }, ["300", "1", "100", "my new reply"]);
    expect(await replyIds(page)).toEqual(["201", "300"]);
    expect(await page.evaluate(() => window.__repliesTo.$node[0].querySelector('[data-tweet-id="300"] .js-tweet-text')?.textContent)).toBe("my new reply");

    // a reply to a reply in the thread
    await send(page, { type: "reply", accountKey: "twitter:1", inReplyToStatusId: "201" }, ["301", "1", "201"]);
    expect(await replyIds(page)).toContain("301");

    // TweetDeck's next refresh brings the same reply: not added twice
    await page.evaluate(() => window.$td.publish("/tweets/conversation/100", [{ ancestors: [], descendants: [window.__client.processTweet(tw("300", "1", "100", "my new reply"))], root: null }]));
    expect((await replyIds(page)).filter(id => id === "300")).toHaveLength(1);

    // plain tweets and failed sends are ignored
    const count = (await replyIds(page)).length;
    await send(page, { type: "tweet", accountKey: "twitter:1" }, ["400", "1"]);
    await send(page, { type: "reply", accountKey: "twitter:1", inReplyToStatusId: "100" }, {});
    expect(await replyIds(page)).toHaveLength(count);
});

test("OTDinstantReplies=0 turns it off", async ({ page }) => {
    await openConversation(page, { OTDinstantReplies: "0" });
    await send(page, { type: "reply", accountKey: "twitter:1", inReplyToStatusId: "100" }, ["300", "1", "100"]);
    expect(await replyIds(page)).toEqual(["201"]);
});
