// X takes images and video with a quoted Tweet now; TweetDeck's composer kept them apart
const { test, expect } = require("@playwright/test");
const { openPage, addTweetDeck, addScripts, addAccount } = require("./helpers");

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

// a Tweet with a photo quoting another, as X sends it, drawn in a column and opened
async function quoteWithPhoto(page) {
    await openPage(page);
    await addTweetDeck(page, { css: true });
    await addAccount(page);
    return page.evaluate(() => {
        TD.settings.getColumnWidth = () => "medium";
        const user = (id, screenName) => ({ id_str: id, screen_name: screenName, name: screenName, profile_image_url_https: "", entities: {} });
        const photo = { id_str: "9", type: "photo", media_url_https: "https://pbs.twimg.com/media/P9.jpg", original_info: { width: 800, height: 400 },
            sizes: { large: { w: 800, h: 400, resize: "fit" }, medium: { w: 800, h: 400, resize: "fit" }, small: { w: 800, h: 400, resize: "fit" }, thumb: { w: 150, h: 150, resize: "crop" } },
            url: "https://t.co/m", display_url: "pic.x.com/m", expanded_url: "https://x.com/me/status/700/photo/1", indices: [13, 27] };
        const quoted = { id_str: "650", full_text: "You made it first", text: "You made it first", created_at: new Date().toUTCString(), source: "web", user: user("10", "raen"), entities: { hashtags: [], user_mentions: [], symbols: [], urls: [] } };
        const chirp = window.__client.processTweet({ id_str: "700", full_text: "thanks you =) https://t.co/m", text: "thanks you =) https://t.co/m", created_at: new Date().toUTCString(), source: "web", user: user("1", "me"),
            entities: { hashtags: [], user_mentions: [], symbols: [], urls: [], media: [photo] }, extended_entities: { media: [photo] },
            is_quote_status: true, quoted_status_id_str: "650", quoted_status: quoted, quoted_status_permalink: { expanded: "https://x.com/raen/status/650" } });
        const where = html => {
            const box = document.createElement("div");
            box.style.width = "340px";
            box.innerHTML = html;
            document.body.append(box);
            const media = box.querySelector(".js-media, .js-media-preview-container, .js-tweet-media");
            const quote = box.querySelector(".quoted-tweet");
            const out = { media: !!media, quote: quote?.querySelector(".js-quoted-tweet-text")?.textContent ?? null, quoteBelowMedia: !!media && !!quote && !!(media.compareDocumentPosition(quote) & Node.DOCUMENT_POSITION_FOLLOWING) };
            box.remove();
            return out;
        };
        const column = where(chirp.render({ mediaPreviewSize: "medium" }));
        const opened = where(TD.ui.template.render("status/tweet_detail", { chirp, renderQuoted: function() { return this.renderQuotedTweet({ mediaPreviewSize: "medium" }); } }));
        return { column, opened };
    });
}

test("a Tweet with images shows the Tweet it quotes under them, in a column and opened", async ({ page }) => {
    expect(await quoteWithPhoto(page)).toEqual({
        column: { media: true, quote: "You made it first", quoteBelowMedia: true },
        opened: { media: true, quote: "You made it first", quoteBelowMedia: true },
    });
});
