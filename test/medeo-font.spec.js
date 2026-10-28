// Medeo Sans for TweetDeck's text, from the extension's own files; icons keep their fonts
const { test, expect } = require("@playwright/test");
const fs = require("fs");
const path = require("path");
const { ROOT, openPage, addTweetDeck, addScripts } = require("./helpers");

async function open(page, storage) {
    const fonts = [];
    await openPage(page, {
        storage,
        routes: {
            "http://otd.test/ext/files/fonts/": route => {
                const file = new URL(route.request().url()).pathname.split("/").pop();
                fonts.push(file);
                return route.fulfill({ contentType: "font/woff2", body: fs.readFileSync(path.join(ROOT, "files/fonts", file)) });
            },
        },
    });
    await page.evaluate(() => { document.documentElement.dataset.otdBase = "http://otd.test/ext/"; });
    await addTweetDeck(page, { css: true });
    await page.evaluate(() => {
        document.body.insertAdjacentHTML("beforeend", '<p class="otd-test-text">Привет, TweetDeck</p><button class="Button">Tweet</button><input class="otd-test-input"><i class="icon icon-reply otd-test-icon"></i>');
    });
    await addScripts(page, "src/otd-common.js", "src/medeo-font.js");
    return fonts;
}

const fontOf = (page, selector, pseudo) => page.evaluate(([selector, pseudo]) => getComputedStyle(document.querySelector(selector), pseudo).fontFamily, [selector, pseudo]);
const faces = page => page.evaluate(() => [...document.fonts].filter(f => f.family.replace(/"/g, "") === "Medeo Sans").map(f => `${f.style} ${f.weight} ${f.status}`).sort());

test("TweetDeck's text, buttons and fields are in Medeo Sans, loaded from the extension; icons keep their font", async ({ page }) => {
    const fonts = await open(page);
    await expect.poll(() => faces(page)).toEqual(["italic 100 900 loaded", "normal 100 900 loaded"]);
    expect(fonts.sort()).toEqual(["MedeoSansVariable-Italic.woff2", "MedeoSansVariable.woff2"]);
    for(const selector of ["html", ".otd-test-text", ".Button", ".otd-test-input"]) expect(await fontOf(page, selector), selector).toMatch(/^"Medeo Sans", /);
    expect(await fontOf(page, ".otd-test-icon", "::before")).toBe("tweetdeckregular");
    // the text is drawn with it: as wide as in Medeo Sans alone, not as in another font
    const widths = await page.evaluate(() => {
        const measure = style => {
            const span = document.createElement("span");
            span.style.cssText = `font-size: 20px; position: absolute; white-space: nowrap; ${style}`;
            span.textContent = "Привет, TweetDeck 0123";
            document.body.append(span);
            const width = span.getBoundingClientRect().width;
            span.remove();
            return width;
        };
        return { page: measure(""), medeo: measure('font-family: "Medeo Sans" !important'), fallback: measure("font-family: serif !important") };
    });
    expect(Math.abs(widths.page - widths.medeo)).toBeLessThan(1);
    expect(Math.abs(widths.medeo - widths.fallback)).toBeGreaterThan(1);
});

test("OTDmedeoFont=0 leaves TweetDeck's fonts", async ({ page }) => {
    const fonts = await open(page, { OTDmedeoFont: "0" });
    await page.waitForTimeout(300);
    expect(fonts).toEqual([]);
    expect(await faces(page)).toEqual([]);
    expect(await fontOf(page, ".Button")).not.toContain("Medeo");
});

test("a font file that doesn't load leaves the system fonts for that style, without errors", async ({ page }) => {
    const warnings = [];
    page.on("console", message => { if(message.type() === "warning") warnings.push(message.text()); });
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await openPage(page, { routes: { "http://otd.test/ext/files/fonts/": route => route.fulfill({ status: 404, body: "" }) } });
    await page.evaluate(() => { document.documentElement.dataset.otdBase = "http://otd.test/ext/"; });
    await addTweetDeck(page, { css: true });
    await addScripts(page, "src/otd-common.js", "src/medeo-font.js");
    await expect.poll(() => warnings.filter(w => w.startsWith("[otd-font]")).length).toBe(2);
    expect(await faces(page)).toEqual([]);
    expect(errors).toEqual([]);
});
