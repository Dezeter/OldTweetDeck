// X takes images and video with a quoted Tweet now; TweetDeck's composer kept them apart
const { test, expect } = require("@playwright/test");
const { openPage, addTweetDeck, addScripts } = require("./helpers");

// TweetDeck's composer state: whether it can send, and whether "Add images or video" is on, with its tooltip
async function composer(page, state) {
    return page.evaluate(state => {
        const require = window.__require;
        const id = Object.keys(require.m).find(id => require.m[id].toString().includes("t.hasQuotedTweet = !!t.quotedTweet"));
        const quotedTweet = state.quoted ? { getChirpURL: () => "https://x.com/alice/status/1" } : null;
        const files = (state.files || []).map(type => ({ type, name: "image" }));
        const result = require(id)({
            tweetText: state.text ?? "hi", files, quotedTweet, tweetType: state.type || "tweet",
            selectedAccountKeys: ["twitter:1"], messageRecipients: state.type === "message" ? [{ id: "2" }] : [],
            configuration: { characters_reserved_per_media: 24, transformedURLLength: 23, dm_text_character_limit: 10000 },
            settings: {}, currentTime: new Date(), sendingStatus: "ready", accounts: [], selectedAccounts: [],
        });
        return { canSend: result.canSend, canAddMedia: result.canAddMedia, tooltip: result.addImageButtonTooltip ?? null };
    }, state);
}

test("a Tweet quoting another can take images, and goes", async ({ page }) => {
    await openPage(page);
    await addTweetDeck(page);
    expect(await composer(page, { quoted: true, files: ["image/png"] })).toEqual({ canSend: true, canAddMedia: true, tooltip: null });
    expect(await composer(page, { quoted: true })).toMatchObject({ canSend: true, canAddMedia: true });
    // the other limits stay: four images, one video
    expect(await composer(page, { quoted: true, files: ["image/png", "image/png", "image/png", "image/png"] })).toMatchObject({ canSend: true, canAddMedia: false });
    expect(await composer(page, { quoted: true, files: ["video/mp4"] })).toMatchObject({ canAddMedia: false });
    // a message takes a Tweet or an image, as before
    expect(await composer(page, { quoted: true, type: "message" })).toMatchObject({ canAddMedia: false, tooltip: "Quoted Tweets cannot contain images" });
});

test("the quote and the images go to X together, as x.com sends them", async ({ page }) => {
    const bodies = [];
    await openPage(page, { routes: {
        "https://otd.test/i/api/graphql/": route => {
            bodies.push(route.request().postDataJSON());
            return route.fulfill({ contentType: "application/json", headers: { "access-control-allow-origin": "http://otd.test", "access-control-allow-credentials": "true" }, body: '{"errors":[{"code":1}]}' });
        },
    } });
    await page.evaluate(() => { window.solveChallenge = async (path, method) => `tid:${method}:${path}`; });
    await addScripts(page, "src/interception.js");
    // statuses/update the way TweetDeck sends it with a quote and two images
    await page.evaluate(() => new Promise(resolve => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", "https://api.x.com/1.1/statuses/update.json");
        xhr.setRequestHeader("Content-Type", "application/x-www-form-urlencoded");
        xhr.onloadend = resolve;
        xhr.send(new URLSearchParams({ status: "hi", media_ids: "11,12", attachment_url: "https://x.com/alice/status/1" }).toString());
    }));
    expect(bodies).toHaveLength(1);
    expect(bodies[0].queryId).toBe("oB-5XsHNAbjvARJEc8CZFw");
    expect(bodies[0].variables).toMatchObject({
        tweet_text: "hi",
        attachment_url: "https://x.com/alice/status/1",
        media: { media_entities: [{ media_id: "11", tagged_users: [] }, { media_id: "12", tagged_users: [] }] },
    });
});
