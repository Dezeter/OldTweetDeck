const { test, expect } = require("@playwright/test");
const { openPage, addTweetDeck, addScripts, addAccount } = require("./helpers");

test.use({ viewport: { width: 420, height: 900 } });

// A column TweetDeck rendered: a wide video, a tall video and a photo.
// TweetDeck's media window is a spy; video.twimg.com answers nothing playable.
async function openColumn(page, storage) {
    await openPage(page, { storage, routes: {
        "https://video.twimg.com/": route => route.fulfill({ status: 200, contentType: "video/mp4", body: "" }),
        "https://pbs.twimg.com/": route => route.fulfill({ status: 200, contentType: "image/jpeg", body: "" }),
    } });
    await addTweetDeck(page, { css: true });
    await addAccount(page);
    await page.evaluate(() => {
        TD.settings.getColumnWidth = () => "medium";
        TD.settings.getDisplaySensitiveMedia = () => true;
        const user = (id, screenName) => ({ id_str: id, screen_name: screenName, name: screenName, profile_image_url_https: "", entities: {} });
        const sizes = (w, h) => ({ large: { w, h, resize: "fit" }, medium: { w, h, resize: "fit" }, small: { w, h, resize: "fit" }, thumb: { w: 150, h: 150, resize: "crop" } });
        const video = (id, w, h) => ({ id_str: id, type: "video", media_url_https: `https://pbs.twimg.com/ext_tw_video_thumb/${id}/pu/img/V${id}.jpg`, original_info: { width: w, height: h }, sizes: sizes(w, h),
            url: "https://t.co/v", display_url: "pic.x.com/v", expanded_url: `https://x.com/i/status/${id}/video/1`, indices: [5, 18],
            video_info: { aspect_ratio: [w / 80, h / 80], variants: [
                { content_type: "application/x-mpegURL", url: `https://video.twimg.com/ext_tw_video/${id}/pu/pl/x.m3u8` },
                { content_type: "video/mp4", bitrate: 832000, url: `https://video.twimg.com/ext_tw_video/${id}/pu/vid/low.mp4` },
                { content_type: "video/mp4", bitrate: 2176000, url: `https://video.twimg.com/ext_tw_video/${id}/pu/vid/best.mp4` },
            ] } });
        const photo = { id_str: "5", type: "photo", media_url_https: "https://pbs.twimg.com/media/P5.jpg", original_info: { width: 800, height: 600 }, sizes: sizes(800, 600),
            url: "https://t.co/p", display_url: "pic.x.com/p", expanded_url: "https://x.com/i/status/5/photo/1", indices: [5, 18] };
        const tweet = (id, media, extra = {}) => ({ id_str: id, full_text: "look https://t.co/v", text: "look https://t.co/v", created_at: new Date().toUTCString(), source: "web", user: user("10", "alice"),
            entities: { hashtags: [], user_mentions: [], symbols: [], urls: [], media }, extended_entities: { media }, ...extra });
        const chirps = [
            window.__client.processTweet(tweet("100", [video("1", 1280, 720)])),
            window.__client.processTweet(tweet("200", [video("2", 720, 1280)])),
            window.__client.processTweet(tweet("300", [photo])),
        ];
        window.__chirps = Object.fromEntries(chirps.map(c => [c.id, c]));
        TD.controller.columnManager = { get: key => key === "c1" ? { findChirp: id => window.__chirps[id] } : null };
        document.body.insertAdjacentHTML("beforeend", '<section class="js-column column" data-column="c1" style="width:340px;display:block"><div class="js-column-scroller column-scroller" style="height:880px;overflow-y:auto"><div class="js-chirp-container chirp-container"></div></div></section>');
        const container = document.querySelector(".js-chirp-container");
        for(const chirp of chirps) container.insertAdjacentHTML("beforeend", chirp.render({ mediaPreviewSize: "medium" }));
        // TweetDeck's own click on a preview opens its media window; here it's counted, and links don't navigate
        window.__windows = 0;
        document.addEventListener("click", e => {
            if(e.target.closest('[rel="mediaPreview"]')) {
                e.preventDefault();
                window.__windows++;
            }
        });
        window.__paused = [];
        HTMLMediaElement.prototype.pause = function() { window.__paused.push(this.src.split("/").slice(-4)[0]); };
    });
    await addScripts(page, "src/otd-common.js", "src/inline-video.js");
}
const preview = (page, key) => page.locator(`article[data-key="${key}"] [rel="mediaPreview"]`);
const player = (page, key) => page.locator(`article[data-key="${key}"] video.otd-inline-video`);

test("a click on a video plays it in the tweet, the best mp4, in its own proportions", async ({ page }) => {
    await openColumn(page);
    await preview(page, "100").click();
    const video = player(page, "100");
    await expect(video).toHaveCount(1);
    expect(await video.evaluate(v => ({ src: v.src, poster: v.poster, controls: v.controls, autoplay: v.autoplay }))).toEqual({
        src: "https://video.twimg.com/ext_tw_video/1/pu/vid/best.mp4", poster: "https://pbs.twimg.com/ext_tw_video_thumb/1/pu/img/V1.jpg", controls: true, autoplay: true,
    });
    await expect(preview(page, "100")).toBeHidden();
    const box = await video.boundingBox();
    expect(Math.round(box.width / box.height * 100) / 100).toBe(1.78);
    // a tall one stops at half the screen
    await preview(page, "200").click();
    expect(Math.round((await player(page, "200").boundingBox()).height)).toBe(450);
    expect(await page.evaluate(() => window.__windows)).toBe(0);
});

test("one video plays at a time, and the volume carries over", async ({ page }) => {
    await openColumn(page);
    await preview(page, "100").click();
    await preview(page, "200").click();
    await page.evaluate(() => {
        const [first, second] = document.querySelectorAll("video.otd-inline-video");
        Object.defineProperty(first, "paused", { value: false });
        second.dispatchEvent(new Event("play"));
        first.volume = 0.3;
        first.dispatchEvent(new Event("volumechange"));
    });
    expect(await page.evaluate(() => window.__paused)).toEqual(["1"]);
    expect(await page.evaluate(() => JSON.parse(localStorage.OTDvideoVolume))).toEqual({ volume: 0.3, muted: false });
    await page.reload();
    await openColumn(page);
    await preview(page, "100").click();
    expect(await player(page, "100").evaluate(v => v.volume)).toBe(0.3);
});

test("Ctrl+click, a photo and the switch off leave TweetDeck's window", async ({ page }) => {
    await openColumn(page);
    await preview(page, "100").click({ modifiers: ["Control"] });
    await preview(page, "300").click();
    expect(await page.locator("video.otd-inline-video").count()).toBe(0);
    expect(await page.evaluate(() => window.__windows)).toBe(2);

    await page.reload();
    await openColumn(page, { OTDinlineVideo: "0" });
    await preview(page, "100").click();
    expect(await page.locator("video.otd-inline-video").count()).toBe(0);
    expect(await page.evaluate(() => window.__windows)).toBe(1);
});
