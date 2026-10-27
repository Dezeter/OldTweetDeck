const { test, expect } = require("@playwright/test");
const { openPage, addTweetDeck, addScripts, addAccount } = require("./helpers");

test.use({ locale: "en-US", viewport: { width: 900, height: 900 } });

const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

// A column TweetDeck rendered after tweet-actions.js changed its templates: alice's tweet with a photo and
// hashtags, your reply with a photo, your quote tweet, a retweet of bob's. Next to it TweetDeck's docked tweet
// box with its upload component; what TweetDeck does with "uiComposeTweet" is played by the test.
async function openColumn(page, { storage, media = 200 } = {}) {
    await openPage(page, { storage, routes: {
        "https://pbs.twimg.com/": route => route.fulfill({ status: media, contentType: "image/jpeg", headers: { "access-control-allow-origin": "*" }, body: Buffer.from(PNG, "base64") }),
    } });
    await addTweetDeck(page, { css: true });
    await addAccount(page);
    await addScripts(page, "src/otd-common.js", "src/download-media.js", "src/tweet-actions.js");
    await page.evaluate(() => {
        TD.settings.getColumnWidth = () => "medium";
        const $ = window.__require(0);
        const user = (id, screenName) => ({ id_str: id, screen_name: screenName, name: screenName, profile_image_url_https: "", entities: {} });
        const photo = (id, at) => ({ id_str: id, type: "photo", media_url_https: `https://pbs.twimg.com/media/P${id}.jpg`, original_info: { width: 800, height: 600 },
            sizes: { large: { w: 800, h: 600, resize: "fit" }, medium: { w: 800, h: 600, resize: "fit" }, small: { w: 800, h: 600, resize: "fit" }, thumb: { w: 150, h: 150, resize: "crop" } },
            url: "https://t.co/m", display_url: "pic.x.com/m", expanded_url: `https://x.com/i/status/${id}/photo/1`, indices: [at, at + 14] });
        const tweet = (id, author, text, entities = {}, extra = {}) => ({ id_str: id, full_text: text, text, created_at: new Date().toUTCString(), source: '<a href="https://mobile.twitter.com">Twitter for iPhone</a>', user: author,
            entities: { hashtags: [], user_mentions: [], symbols: [], urls: [], ...entities }, extended_entities: entities.media ? { media: entities.media } : undefined, ...extra });
        const me = user("1", "me"), alice = user("10", "alice"), bob = user("20", "bob");
        const chirps = [
            window.__client.processTweet(tweet("100", alice, "news &amp; cats #News #cats https://t.co/m", { hashtags: [{ text: "News", indices: [11, 16] }, { text: "cats", indices: [17, 22] }], media: [photo("1", 23)] })),
            window.__client.processTweet(tweet("600", me, "@bob hello https://t.co/x #tag https://t.co/m", {
                user_mentions: [{ id_str: "20", screen_name: "bob", name: "bob", indices: [0, 4] }],
                urls: [{ url: "https://t.co/x", expanded_url: "https://example.com/x", display_url: "example.com/x", indices: [11, 25] }],
                hashtags: [{ text: "tag", indices: [26, 30] }], media: [photo("6", 31)],
            }, { display_text_range: [5, 30], in_reply_to_status_id_str: "550", in_reply_to_user_id_str: "20", in_reply_to_screen_name: "bob" })),
            window.__client.processTweet(tweet("700", me, "nice https://t.co/q", { urls: [{ url: "https://t.co/q", expanded_url: "https://x.com/alice/status/650", display_url: "x.com/alice/sta…", indices: [5, 19] }] },
                { is_quote_status: true, quoted_status_id_str: "650", quoted_status: tweet("650", alice, "the quoted one") })),
            window.__client.processTweet({ ...tweet("801", me, "RT"), retweeted_status: tweet("800", bob, "bob's") }),
        ];
        for(const chirp of chirps) if(chirp.user.id === "1") chirp.creatorAccount = window.__account;
        window.__chirps = Object.fromEntries(chirps.map(c => [c.id, c]));
        TD.controller.columnManager = {
            get: key => key === "c1" ? { findChirp: id => window.__chirps[id] } : null,
            getAll: () => ({ c1: { findChirp: id => window.__chirps[id], reapplyFilters: () => window.__log.push(["filters applied"]) } }),
            findChirpByAccountKey: ({ chirpId, columnKey }) => columnKey === "c1" ? window.__chirps[chirpId] : null,
        };
        document.body.insertAdjacentHTML("beforeend", '<section class="js-column column" data-column="c1" style="width:340px;display:inline-block;vertical-align:top"><div class="js-column-scroller column-scroller"><div class="js-chirp-container chirp-container"></div></div></section>');
        const container = document.querySelector(".js-chirp-container");
        for(const chirp of chirps) container.insertAdjacentHTML("beforeend", chirp.render({ mediaPreviewSize: "medium" }));

        // the docked tweet box
        const require = window.__require;
        const drawer = document.createElement("div");
        drawer.className = "js-drawer";
        drawer.style.cssText = "display:inline-block;width:300px;height:600px;vertical-align:top";
        drawer.innerHTML = TD.ui.template.render("compose/docked_compose", {});
        document.body.append(drawer);
        const uploadId = Object.keys(require.m).find(id => require.m[id].toString().includes('uploadInputSelector: ".js-media-upload"'));
        const holder = document.createElement("div");
        holder.id = "otd-upload";
        drawer.querySelector(".js-docked-compose").append(holder);
        require(uploadId).attachTo("#otd-upload");

        // what happened: the tweet box opened, files added, tweets deleted, users muted and blocked, notifications
        window.__log = [];
        $(document).on("uiComposeTweet", (e, data) => {
            window.__log.push(["compose", data]);
            setTimeout(() => { document.querySelector(".js-docked-compose textarea.js-compose-text").value = data.text || ""; }, 200);
        });
        $(document).on("uiFilesAdded", (e, data) => window.__log.push(["files", [...data.files].map(f => `${f.name}|${f.type}|${f.size}`)]));
        $(document).on("uiBlockAction", (e, data) => window.__log.push(["block", data.twitterUser.screenName, data.account.getKey()]));
        TD.services.TwitterStatus.prototype.destroy = function() { window.__log.push(["delete", this.id]); };
        TD.services.TwitterUser.prototype.mute = function(account) { window.__log.push(["mute", this.screenName, account.getKey()]); };
        OTD.notify = (message, error) => window.__log.push([error ? "error" : "notify", message]);
        window.__confirm = true;
        window.confirm = message => { window.__log.push(["confirm", message]); return window.__confirm; };
        Object.defineProperty(navigator, "clipboard", { value: { writeText: async text => { window.__log.push(["clipboard", text]); } } });
    });
}

// the "…" menu of a tweet as TweetDeck opens it: the items, and a click on one of them
async function menu(page, key, click) {
    return page.evaluate(([key, click]) => {
        document.querySelectorAll(".dropdown-menu").forEach(m => m.remove());
        const article = document.querySelector(`.js-chirp-container > article[data-key="${key}"]`);
        article.querySelector('[rel="actionsMenu"]').click();
        const chirp = window.__chirps[key];
        const menu = document.createElement("div");
        menu.className = "js-dropdown dropdown-menu";
        menu.innerHTML = TD.ui.template.render("menus/actions", { chirp: chirp.getRelatedTweet?.() || chirp, user: chirp.getMainUser() });
        article.append(menu);
        const items = [...menu.querySelectorAll("li.is-selectable a")].map(a => a.textContent.trim().replace(/\s+/g, " "));
        if(click) [...menu.querySelectorAll("a")].find(a => a.textContent.trim() === click).click();
        return items;
    }, [key, click]);
}
const log = page => page.evaluate(() => window.__log.splice(0));

test("\"Copy links to media\" copies the tweet's photos at full size", async ({ page }) => {
    await openColumn(page);
    const items = await menu(page, "100", "Copy links to media");
    const at = items.indexOf("Copy link to this Tweet");
    expect(items.slice(at, at + 3)).toEqual(["Copy link to this Tweet", "Copy links to media", "Download media"]);
    await expect.poll(() => page.evaluate(() => window.__log.length)).toBe(2);
    expect(await log(page)).toEqual([["clipboard", "https://pbs.twimg.com/media/P1?format=jpg&name=orig"], ["notify", "Links to media copied"]]);
    expect(await menu(page, "700")).not.toContain("Copy links to media");
});

test("\"Mute #tag\" and \"Mute tweets from …\" add TweetDeck's own mutes, once", async ({ page }) => {
    await openColumn(page);
    const items = await menu(page, "100", "Mute #News");
    const at = items.indexOf("Mute @alice");
    expect(items.slice(at, at + 5)).toEqual(["Mute @alice", "Mute #News", "Mute #cats", "Mute tweets from «Twitter for iPhone»", "Block @alice"]);
    await menu(page, "100", "Mute tweets from «Twitter for iPhone»");
    await menu(page, "100", "Mute #News");
    // in lower case, as TweetDeck keeps them
    expect(await page.evaluate(() => TD.controller.filterManager.getAll().map(f => [f.type, f.value]))).toEqual([["phrase", "#news"], ["source", "twitter for iphone"]]);
    expect(await log(page)).toEqual([
        ["filters applied"], ["notify", "Tweets with \"#News\" are muted"], ["filters applied"], ["notify", "Tweets with \"Twitter for iPhone\" are muted"], ["notify", "\"#News\" is already muted"],
    ]);
    // a retweet: the retweeted tweet's; your own tweets have none
    expect(await menu(page, "801")).toContain("Mute @bob");
    expect((await menu(page, "600")).filter(i => i.startsWith("Mute"))).toEqual([]);
});

test("\"Redraft\" opens your reply as it was typed, with its photo, then deletes it", async ({ page }) => {
    await openColumn(page);
    expect(await menu(page, "100")).not.toContain("Redraft");
    const items = await menu(page, "600", "Redraft");
    expect(items.slice(-2)).toEqual(["Redraft", "Delete"]);
    await expect.poll(() => page.evaluate(() => window.__log.map(entry => entry[0])), { timeout: 5000 }).toEqual(["confirm", "compose", "files", "delete"]);
    const [confirm, [, compose], files, deleted] = await log(page);
    expect(confirm[1]).toContain("The tweet will be deleted");
    expect(compose).toMatchObject({ type: "reply", text: "hello https://example.com/x #tag", from: ["twitter:1"], popFromInline: true, autoPopulateReplyMetadata: true, inReplyTo: { id: "550", user: { screenName: "bob" } } });
    expect(compose.mentions.map(u => u.screenName)).toContain("bob");
    expect(files).toEqual(["files", [`600_1.jpg|image/jpeg|${Buffer.from(PNG, "base64").length}`]]);
    expect(deleted).toEqual(["delete", "600"]);
});

test("\"Redraft\" of a quote tweet quotes the same tweet, without its link", async ({ page }) => {
    await openColumn(page);
    await menu(page, "700", "Redraft");
    await expect.poll(() => page.evaluate(() => window.__log.map(entry => entry[0]))).toEqual(["confirm", "compose", "delete"]);
    const [, [, compose]] = await log(page);
    expect(compose).toMatchObject({ type: "tweet", text: "nice" });
    expect(compose.quotedTweet.id).toBe("650");
});

test("\"Redraft\" changes nothing when it's cancelled or the media can't be had", async ({ page }) => {
    await openColumn(page, { media: 404 });
    await page.evaluate(() => { window.__confirm = false; });
    await menu(page, "600", "Redraft");
    await page.waitForTimeout(300);
    expect((await log(page)).map(entry => entry[0])).toEqual(["confirm"]);

    await page.evaluate(() => { window.__confirm = true; });
    await menu(page, "600", "Redraft");
    await expect.poll(() => page.evaluate(() => window.__log.map(entry => entry[0]))).toEqual(["confirm", "error"]);
    expect((await log(page))[1][1]).toBe("Couldn't get the tweet's media, it wasn't deleted");
});

test("\"Mute\" and \"Block\" under other people's tweets, when switched on", async ({ page }) => {
    await openColumn(page, { storage: { OTDrowMuteBlock: "1" } });
    const rows = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll(".js-chirp-container > article")].map(article =>
        [article.dataset.key, [...article.querySelectorAll(".js-tweet-actions > li > a")].map(a => a.getAttribute("rel") || a.title)])));
    expect(rows["100"]).toEqual(["reply", "retweet", "favorite", "Mute @alice", "Block @alice", "actionsMenu"]);
    expect(rows["801"]).toContain("Block @bob");
    expect(rows["600"]).toEqual(["reply", "retweet", "favorite", "actionsMenu"]);

    // the click goes no further than the button: TweetDeck would open the tweet
    await page.evaluate(() => document.querySelector(".js-chirp-container").addEventListener("click", () => window.__log.push(["column click"])));
    await page.click('article[data-key="100"] [data-otd-action="mute-user"]');
    await page.click('article[data-key="801"] [data-otd-action="block-user"]');
    expect(await log(page)).toEqual([["confirm", "Mute @alice?"], ["mute", "alice", "twitter:1"], ["confirm", "Block @bob?"], ["block", "bob", "twitter:1"]]);
    await page.evaluate(() => { window.__confirm = false; });
    await page.click('article[data-key="100"] [data-otd-action="block-user"]');
    expect(await log(page)).toEqual([["confirm", "Block @alice?"]]);

    // the tweet view's row makes room for them
    const detail = await page.evaluate(() => {
        const box = document.createElement("div");
        box.style.width = "320px";
        box.innerHTML = TD.ui.template.render("status/tweet_detail_actions", window.__chirps["100"]);
        document.body.append(box);
        const row = box.querySelector("ul");
        return { flex: getComputedStyle(row).display, buttons: [...row.querySelectorAll("li > a")].map(a => a.getAttribute("rel") || a.title), widths: [...row.children].map(li => Math.round(li.getBoundingClientRect().width)) };
    });
    expect(detail.flex).toBe("flex");
    expect(detail.buttons).toEqual(["reply", "retweet", "favorite", "Mute @alice", "Block @alice", "actionsMenu"]);
    expect(new Set(detail.widths).size).toBe(1);
});

test("switched off, the menu and the row stay as TweetDeck has them", async ({ page }) => {
    await openColumn(page, { storage: { OTDcopyMediaLinks: "0", OTDmuteFromMenu: "0", OTDredraft: "0" } });
    expect(await menu(page, "100")).not.toEqual(expect.arrayContaining(["Copy links to media"]));
    expect((await menu(page, "100")).filter(i => /^Mute (#|tweets)/.test(i))).toEqual([]);
    expect(await menu(page, "600")).not.toContain("Redraft");
    expect(await page.locator(".otd-row-action").count()).toBe(0);
});
