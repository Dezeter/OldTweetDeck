// The font picked in the settings for TweetDeck's text, from the extension's own files; icons keep their fonts
const { test, expect } = require("@playwright/test");
const fs = require("fs");
const path = require("path");
const { ROOT, openPage, addTweetDeck, addScripts } = require("./helpers");

async function open(page, storage, { missing = false } = {}) {
    const asked = [];
    await openPage(page, {
        storage,
        routes: {
            "http://otd.test/ext/files/fonts/": route => {
                const file = new URL(route.request().url()).pathname.replace("/ext/files/fonts/", "");
                asked.push(file);
                if(missing) return route.fulfill({ status: 404, body: "" });
                return route.fulfill({ contentType: "font/woff2", body: fs.readFileSync(path.join(ROOT, "files/fonts", file)) });
            },
        },
    });
    await page.evaluate(() => { document.documentElement.dataset.otdBase = "http://otd.test/ext/"; });
    await addTweetDeck(page, { css: true });
    await page.evaluate(() => {
        document.body.insertAdjacentHTML("beforeend", '<p class="otd-test-text">Привет, TweetDeck</p><button class="Button">Tweet</button><input class="otd-test-input"><i class="icon icon-reply otd-test-icon"></i>');
    });
    await addScripts(page, "src/otd-common.js", "src/fonts.js");
    return asked;
}

const fontOf = (page, selector, pseudo) => page.evaluate(([selector, pseudo]) => getComputedStyle(document.querySelector(selector), pseudo).fontFamily, [selector, pseudo]);
const faces = (page, family) => page.evaluate(family => [...document.fonts].filter(f => f.family.replace(/"/g, "") === family).map(f => `${f.unicodeRange.split(",")[0]} ${f.weight} ${f.status}`).sort(), family);
// how wide a line is in the page's font, in the font alone, and in another one
const widths = (page, family) => page.evaluate(family => {
    const measure = style => {
        const span = document.createElement("span");
        span.style.cssText = `font-size: 20px; position: absolute; white-space: nowrap; ${style}`;
        span.textContent = "Привет, TweetDeck 0123 ąęł ї";
        document.body.append(span);
        const width = span.getBoundingClientRect().width;
        span.remove();
        return width;
    };
    return { page: measure(""), font: measure(`font-family: "${family}" !important`), other: measure("font-family: serif !important") };
}, family);

for(const font of [{ key: "golos", name: "Golos Text", weight: "400 900" }, { key: "onest", name: "Onest", weight: "100 900" }, { key: "inter", name: "Inter", weight: "100 900" }, { key: "manrope", name: "Manrope", weight: "200 800" }]) {
    test(`${font.name}: TweetDeck's text, buttons and fields in it, Latin and Cyrillic from the extension; icons keep their font`, async ({ page }) => {
        const asked = await open(page, { OTDfont: font.key });
        await expect.poll(() => faces(page, font.name)).toEqual([`U+0-FF ${font.weight} loaded`, `U+100-2BA ${font.weight} loaded`, `U+301 ${font.weight} loaded`, `U+460-52F ${font.weight} loaded`].sort());
        expect(asked.sort()).toEqual(["cyrillic-ext", "cyrillic", "latin-ext", "latin"].map(subset => `${font.key}/${subset}.woff2`).sort());
        for(const selector of ["html", ".otd-test-text", ".Button", ".otd-test-input"]) expect(await fontOf(page, selector), selector).toMatch(new RegExp(`^"?${font.name}"?, `));
        expect(await fontOf(page, ".otd-test-icon", "::before")).toBe("tweetdeckregular");
        const width = await widths(page, font.name);
        expect(Math.abs(width.page - width.font)).toBeLessThan(1);
        expect(Math.abs(width.font - width.other)).toBeGreaterThan(1);
    });
}

test("without a font picked, or with one that isn't there, TweetDeck keeps its own fonts and nothing is fetched", async ({ page }) => {
    for(const storage of [{}, { OTDfont: "medeo" }]) {
        const asked = await open(page, storage);
        await page.waitForTimeout(300);
        expect(asked).toEqual([]);
        // TweetDeck's icons are the only font
        expect(await page.evaluate(() => [...document.fonts].map(f => f.family.replace(/"/g, "")))).toEqual(["tweetdeckregular"]);
        expect(await fontOf(page, ".Button")).toBe('"Helvetica Neue", Helvetica, Arial, sans-serif');
    }
});

test("font files that don't load leave the system fonts, without errors", async ({ page }) => {
    const warnings = [];
    page.on("console", message => { if(message.type() === "warning") warnings.push(message.text()); });
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await open(page, { OTDfont: "golos" }, { missing: true });
    await expect.poll(() => warnings.filter(w => w.startsWith("[otd-font] golos/")).length).toBe(4);
    expect(await faces(page, "Golos Text")).toEqual([]);
    expect(errors).toEqual([]);
});
