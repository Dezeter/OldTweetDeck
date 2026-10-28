// "Super wide" columns, 400px, and "flex" ones that share the window: column widths after TweetDeck's narrow,
// medium and wide
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
    }))).toEqual({ values: ["narrow", "medium", "wide", "superwide", "flex"], stream: { width: 400, height: 400 }, detail: { width: 380, height: 380 }, space: 380 });
    // flex: superwide's previews, the detail and video of its narrowest column
    expect(await page.evaluate(() => [TD.services.TwitterMedia.COLUMN_WIDTH_MEDIA_SIZE_MAP.flex.stream.medium, TD.services.TwitterMedia.COLUMN_WIDTH_MEDIA_SIZE_MAP.flex.detail, TD.services.TwitterMedia.AVAILABLE_COLUMN_SPACE.flex]))
        .toEqual([{ width: 283, height: 175 }, { width: 290, height: 290 }, 290]);
});

// "Flex": columns that share the window, as TweetDeck lays out its row of columns
async function openRow(page, columns) {
    await openPage(page);
    await addTweetDeck(page, { css: true });
    await page.evaluate(columns => {
        const column = i => `<section class="js-column column" data-column="c${i}"><div class="media-size-medium"></div></section>`;
        document.body.insertAdjacentHTML("beforeend", `<div class="js-app-columns-container app-columns-container scroll-h"><div class="js-app-columns app-columns horizontal-flow-container">${Array.from({ length: columns }, (_, i) => column(i)).join("")}</div></div>`);
    }, columns);
}
const row = (page, value, dark = false) => page.evaluate(([value, dark]) => {
    document.documentElement.classList.toggle("dark", dark);
    TD.settings.getColumnWidth = () => value;
    TD.ui.main.updateColumnSize();
    const container = document.querySelector(".app-columns-container");
    return {
        classes: document.body.className.split(" ").filter(c => /-columns$/.test(c)).sort(),
        columns: [...document.querySelectorAll(".column")].map(c => Math.round(c.getBoundingClientRect().width)),
        medium: Math.round(document.querySelector(".media-size-medium").getBoundingClientRect().height),
        scrolls: container.scrollWidth > container.clientWidth,
    };
}, [value, dark]);

test("flex columns share a window they don't fill, from 310 up to 480px each, in both themes; the other widths stay fixed", async ({ page }) => {
    await page.setViewportSize({ width: 1200, height: 700 });
    await openRow(page, 3);
    // 1200px less TweetDeck's 6px before and after each column
    const flex = { classes: ["is-flex-columns", "is-superwide-columns", "is-wide-columns"], columns: [392, 392, 392], medium: 175, scrolls: false };
    expect(await row(page, "flex")).toEqual(flex);
    expect(await row(page, "flex", true)).toEqual(flex);
    expect(await row(page, "superwide")).toMatchObject({ classes: ["is-superwide-columns", "is-wide-columns"], columns: [400, 400, 400] });
    expect(await row(page, "medium")).toMatchObject({ columns: [310, 310, 310] });
    await page.setViewportSize({ width: 1800, height: 700 });
    expect(await row(page, "flex")).toMatchObject({ columns: [480, 480, 480], scrolls: false });
});

test("with more flex columns than fit, they keep 310px and the row scrolls", async ({ page }) => {
    await page.setViewportSize({ width: 1200, height: 700 });
    await openRow(page, 6);
    expect(await row(page, "flex")).toMatchObject({ columns: [310, 310, 310, 310, 310, 310], scrolls: true });
});

test("TweetDeck's column drag still lays out a flex row: the dragged columns and the gap they leave", async ({ page }) => {
    await page.setViewportSize({ width: 1200, height: 700 });
    await openRow(page, 3);
    await row(page, "flex");
    // what TweetDeck's dragdroplist does when a drag starts: columns taken out of the row, a placeholder in it
    const placeholder = await page.evaluate(() => {
        document.querySelectorAll(".column").forEach((column, i) => Object.assign(column.style, { position: "absolute", left: `${i * 398}px`, width: "392px" }));
        const holder = document.createElement("section");
        holder.className = "placeholder";
        Object.assign(holder.style, { width: "1194px", height: "600px" });
        document.querySelector(".app-columns").append(holder);
        return Math.round(holder.getBoundingClientRect().width);
    });
    expect(placeholder).toBe(1194);
    expect((await row(page, "flex")).columns).toEqual([392, 392, 392]);
});
