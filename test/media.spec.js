const { test, expect } = require("@playwright/test");
const { openPage, addTweetDeck, addScripts, addAccount } = require("./helpers");

test.use({ viewport: { width: 420, height: 900 } });

// A column with tweets TweetDeck rendered: one tall photo, two photos, one wide photo in a retweet, a video,
// and text only. columnManager knows them the way TweetDeck's does.
async function openColumn(page, storage) {
    await openPage(page, { storage });
    await addTweetDeck(page, { css: true });
    await addAccount(page);
    await page.evaluate(() => {
        TD.settings.getColumnWidth = () => "medium";
        const user = (id, screenName) => ({ id_str: id, screen_name: screenName, name: screenName, profile_image_url_https: "", entities: {} });
        const photo = (id, w, h) => ({ id_str: id, type: "photo", media_url_https: `https://pbs.twimg.com/media/P${id}.jpg`, original_info: { width: w, height: h },
            sizes: { large: { w, h, resize: "fit" }, medium: { w, h, resize: "fit" }, small: { w, h, resize: "fit" }, thumb: { w: 150, h: 150, resize: "crop" } },
            url: "https://t.co/m", display_url: "pic.x.com/m", expanded_url: `https://x.com/i/status/${id}/photo/1`, indices: [5, 18] });
        const video = { ...photo("40", 1280, 720), type: "video", media_url_https: "https://pbs.twimg.com/ext_tw_video_thumb/40/pu/img/V40.jpg",
            video_info: { aspect_ratio: [16, 9], variants: [
                { content_type: "application/x-mpegURL", url: "https://video.twimg.com/ext_tw_video/40/pu/pl/x.m3u8" },
                { content_type: "video/mp4", bitrate: 832000, url: "https://video.twimg.com/ext_tw_video/40/pu/vid/640x360/low.mp4?tag=12" },
                { content_type: "video/mp4", bitrate: 2176000, url: "https://video.twimg.com/ext_tw_video/40/pu/vid/1280x720/best.mp4?tag=12" },
            ] } };
        const tweet = (id, author, media) => ({ id_str: id, full_text: "look https://t.co/m", text: "look https://t.co/m", created_at: new Date().toUTCString(), source: "web", user: author,
            entities: { hashtags: [], user_mentions: [], symbols: [], urls: [], media }, extended_entities: { media } });
        const alice = user("10", "alice"), bob = user("20", "bob");
        const chirps = [
            window.__client.processTweet(tweet("100", alice, [photo("1", 1000, 4000)])),
            window.__client.processTweet(tweet("200", alice, [photo("2", 800, 600), photo("3", 800, 600)])),
            window.__client.processTweet({ ...tweet("301", bob, []), retweeted_status: tweet("300", alice, [photo("4", 2000, 1000)]) }),
            window.__client.processTweet(tweet("400", alice, [video])),
            window.__client.processTweet({ ...tweet("500", alice, []), full_text: "just text", text: "just text" }),
        ];
        window.__chirps = Object.fromEntries(chirps.map(c => [c.id, c]));
        TD.controller.columnManager = {
            get: key => key === "c1" ? { findChirp: id => window.__chirps[id] } : null,
            findChirpByAccountKey: ({ chirpId, columnKey }) => columnKey === "c1" ? window.__chirps[chirpId] : null,
        };
        document.body.insertAdjacentHTML("beforeend", '<section class="js-column column" data-column="c1" style="width:340px;display:block"><div class="js-column-scroller column-scroller"><div class="js-chirp-container chirp-container"></div></div></section>');
        const container = document.querySelector(".js-chirp-container");
        for(const chirp of chirps) container.insertAdjacentHTML("beforeend", chirp.render({ mediaPreviewSize: "medium" }));
        window.__messages = [];
        window.addEventListener("message", e => { if(e.data?.action === "otdDownload") window.__messages.push(e.data); });
    });
    await addScripts(page, "src/otd-common.js", "src/media-aspect.js", "src/download-media.js");
    await page.waitForTimeout(300);
}

const previews = page => page.evaluate(() => Object.fromEntries([...document.querySelectorAll(".js-chirp-container > article")].map(article => {
    const links = [...article.querySelectorAll(".js-media-image-link")];
    return [article.dataset.key, links.map(link => ({ aspect: link.classList.contains("otd-aspect"), ratio: Math.round(link.getBoundingClientRect().height / link.getBoundingClientRect().width * 100) / 100 }))];
})));

test("a single image shows in its own proportions, no taller than half the screen", async ({ page }) => {
    await openColumn(page);
    const result = await previews(page);
    // a very tall (1:4) photo: capped at 50vh = 450px
    expect(result["100"]).toHaveLength(1);
    expect(result["100"][0].aspect).toBe(true);
    expect(await page.evaluate(() => Math.round(document.querySelector('[data-key="100"] .js-media-image-link').getBoundingClientRect().height))).toBe(450);
    // two photos: TweetDeck's grid as it was
    expect(result["200"].every(p => !p.aspect)).toBe(true);
    // wide (2:1) photo of a retweet: full proportion
    expect(result["301"]).toEqual([{ aspect: true, ratio: 0.5 }]);
    // a video keeps TweetDeck's preview
    expect(result["400"].every(p => !p.aspect)).toBe(true);
});

test("OTDmediaAspect=0 keeps TweetDeck's strip", async ({ page }) => {
    await openColumn(page, { OTDmediaAspect: "0" });
    const result = await previews(page);
    expect(Object.values(result).flat().some(p => p.aspect)).toBe(false);
});

// opens the "…" menu of a tweet the way TweetDeck renders it, and clicks "Download media" if it's there
async function download(page, key) {
    return page.evaluate(key => {
        window.__messages = [];
        const article = document.querySelector(`.js-chirp-container > article[data-key="${key}"]`);
        article.querySelector('[rel="actionsMenu"]').click();
        const chirp = window.__chirps[key];
        const menu = document.createElement("div");
        menu.className = "js-dropdown dropdown-menu";
        menu.innerHTML = TD.ui.template.render("menus/actions", { chirp: chirp.getRelatedTweet?.() || chirp, user: chirp.getMainUser() });
        article.append(menu);
        const item = menu.querySelector('[data-otd-action="download-media"]');
        if(!item) return null;
        item.click();
        return new Promise(resolve => setTimeout(() => resolve({ label: item.textContent, messages: window.__messages }), 50));
    }, key);
}

test("\"Download media\" in the menu saves photos at full size and videos at the best quality", async ({ page }) => {
    await openColumn(page);
    expect(await download(page, "100")).toEqual({ label: "Download media", messages: [
        { action: "otdDownload", url: "https://pbs.twimg.com/media/P1?format=jpg&name=orig", filename: "alice_100.jpg" },
    ] });
    expect((await download(page, "200")).messages.map(m => m.filename)).toEqual(["alice_200_1.jpg", "alice_200_2.jpg"]);
    // a retweet saves the retweeted tweet's media under its author
    expect((await download(page, "301")).messages).toEqual([
        { action: "otdDownload", url: "https://pbs.twimg.com/media/P4?format=jpg&name=orig", filename: "alice_300.jpg" },
    ]);
    expect((await download(page, "400")).messages).toEqual([
        { action: "otdDownload", url: "https://video.twimg.com/ext_tw_video/40/pu/vid/1280x720/best.mp4?tag=12", filename: "alice_400.mp4" },
    ]);
    // no media, no item
    expect(await download(page, "500")).toBeNull();
});

test("OTDdownloadMedia=0 leaves the menu as it was", async ({ page }) => {
    await openColumn(page, { OTDdownloadMedia: "0" });
    expect(await download(page, "100")).toBeNull();
});

// content.js passes only X's media hosts on to the background script
test("content.js forwards downloads from this page to the background, for X's media only", async ({ page }) => {
    await openPage(page);
    const sent = await page.evaluate(async source => {
        const sent = [];
        window.chrome = { runtime: { getURL: () => "", sendMessage: message => sent.push(message) } };
        new Function(source)();
        window.postMessage({ action: "otdDownload", url: "https://pbs.twimg.com/media/P1?format=jpg&name=orig", filename: "a.jpg" }, "*");
        window.postMessage({ action: "otdDownload", url: "https://evil.example/x.exe", filename: "x.exe" }, "*");
        await new Promise(resolve => setTimeout(resolve, 100));
        return sent;
    }, require("fs").readFileSync(require("path").join(__dirname, "../src/content.js"), "utf8"));
    expect(sent).toEqual([{ action: "download", url: "https://pbs.twimg.com/media/P1?format=jpg&name=orig", filename: "a.jpg" }]);
});

test("the background script saves only X's media", async ({ page }) => {
    await openPage(page);
    const downloads = await page.evaluate(source => {
        const downloads = [];
        let listener;
        window.importScripts = () => {};
        window.chrome = { runtime: { onMessage: { addListener: fn => { listener = fn; } } }, downloads: { download: options => downloads.push(options) } };
        new Function(source)();
        listener({ action: "download", url: "https://video.twimg.com/ext_tw_video/40/pu/vid/1280x720/best.mp4?tag=12", filename: "alice_400.mp4" }, {}, () => {});
        listener({ action: "download", url: "https://evil.example/x.exe", filename: "x.exe" }, {}, () => {});
        return downloads;
    }, require("fs").readFileSync(require("path").join(__dirname, "../src/background3.js"), "utf8"));
    expect(downloads).toEqual([{ url: "https://video.twimg.com/ext_tw_video/40/pu/vid/1280x720/best.mp4?tag=12", filename: "alice_400.mp4", conflictAction: "uniquify" }]);
});
