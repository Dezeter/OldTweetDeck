// "Super wide" columns, 400px: a fourth column width after TweetDeck's narrow, medium and wide
const { test, expect } = require("@playwright/test");
const { openPage, addTweetDeck } = require("./helpers");

test.use({ viewport: { width: 1400, height: 700 } });

async function open(page) {
    await openPage(page);
    await addTweetDeck(page, { css: true });
    await page.evaluate(() => {
        document.body.insertAdjacentHTML("beforeend", '<div class="app-columns"><section class="column"><div class="media-size-large"></div><div class="media-size-medium"></div><div class="media-size-small"></div><div class="live-video-container"></div></section></div>');
    });
}
// the width TweetDeck's settings say, as TweetDeck applies it when it changes
const widthFor = (page, value, dark = false) => page.evaluate(([value, dark]) => {
    document.documentElement.classList.toggle("dark", dark);
    TD.settings.getColumnWidth = () => value;
    TD.ui.main.updateColumnSize();
    const size = selector => Math.round(document.querySelector(selector).getBoundingClientRect()[selector === ".column" ? "width" : "height"]);
    return { classes: document.body.className.split(" ").filter(c => /-columns$/.test(c)).sort(), column: size(".column"), large: size(".media-size-large"), medium: size(".media-size-medium"), small: size(".media-size-small"), live: size(".live-video-container") };
}, [value, dark]);

test("super wide columns are 400px, with media sized for them, in both themes, and back to wide", async ({ page }) => {
    await open(page);
    const superwide = { classes: ["is-superwide-columns", "is-wide-columns"], column: 400, large: 400, medium: 175, small: 104, live: 224 };
    expect(await widthFor(page, "superwide")).toEqual(superwide);
    expect(await widthFor(page, "superwide", true)).toEqual(superwide);
    expect(await widthFor(page, "wide")).toEqual({ classes: ["is-wide-columns"], column: 350, large: 350, medium: 153, small: 91, live: 196 });
    expect(await widthFor(page, "narrow")).toMatchObject({ classes: ["is-narrow-columns"], column: 270 });
});

test("TweetDeck knows it: in its list of widths and the sizes it gives media", async ({ page }) => {
    await open(page);
    expect(await page.evaluate(() => ({
        values: TD.settings.COLUMN_WIDTH_VALUES,
        stream: TD.services.TwitterMedia.COLUMN_WIDTH_MEDIA_SIZE_MAP.superwide.stream.large,
        detail: TD.services.TwitterMedia.COLUMN_WIDTH_MEDIA_SIZE_MAP.superwide.detail,
        space: TD.services.TwitterMedia.AVAILABLE_COLUMN_SPACE.superwide,
    }))).toEqual({ values: ["narrow", "medium", "wide", "superwide"], stream: { width: 400, height: 400 }, detail: { width: 380, height: 380 }, space: 380 });
});
