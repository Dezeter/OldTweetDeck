const { test, expect } = require("@playwright/test");
const { openPage, addTweetDeck, addScripts, read } = require("./helpers");

test.use({ locale: "ru-RU", viewport: { width: 900, height: 900 } });

const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
const GIF = "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

// TweetDeck's docked composer (its own template) with its upload component, the extension's files at
// http://otd.test/ext/, and x.com's GIF search answered by `gifs` (a page of items, or an HTTP status)
async function openComposer(page, { storage, gifs } = {}) {
    const searches = [];
    await openPage(page, {
        storage,
        routes: {
            "http://otd.test/ext/files/emoji.json": route => route.fulfill({ contentType: "application/json", body: read("files/emoji.json") }),
            "https://api.otd.test/1.1/foundmedia/search.json": route => {
                const url = new URL(route.request().url());
                searches.push({ q: url.searchParams.get("q"), cursor: url.searchParams.get("cursor"), id: route.request().headers()["x-client-transaction-id"] });
                const answer = typeof gifs === "function" ? gifs(url) : gifs;
                if(typeof answer === "number") return route.fulfill({ status: answer, headers: { "access-control-allow-origin": "http://otd.test", "access-control-allow-credentials": "true" }, body: "" });
                return route.fulfill({ contentType: "application/json", headers: { "access-control-allow-origin": "http://otd.test", "access-control-allow-credentials": "true" }, body: JSON.stringify(answer) });
            },
            "https://media.example/": route => route.fulfill({ contentType: "image/gif", headers: { "access-control-allow-origin": "*" }, body: Buffer.from(GIF, "base64") }),
        },
    });
    await page.evaluate(() => {
        document.documentElement.dataset.otdBase = "http://otd.test/ext/";
        window.solveChallenge = async (path, method) => `tid:${method}:${path}`;
    });
    await addTweetDeck(page, { css: true });
    await page.evaluate(() => {
        const require = window.__require;
        const $ = require(0);
        const drawer = document.createElement("div");
        drawer.className = "js-drawer";
        drawer.style.cssText = "position:relative;width:300px;height:880px;background:#1da1f2";
        drawer.innerHTML = TD.ui.template.render("compose/docked_compose", {});
        document.body.append(drawer);
        // TweetDeck's own upload component, as the composer has it
        const uploadId = Object.keys(require.m).find(id => require.m[id].toString().includes('uploadInputSelector: ".js-media-upload"'));
        const holder = document.createElement("div");
        holder.id = "otd-upload";
        drawer.querySelector(".js-docked-compose").append(holder);
        require(uploadId).attachTo("#otd-upload");
        window.__added = [];
        $(document).on("uiFilesAdded", (e, data) => window.__added.push([...data.files].map(f => `${f.name}|${f.type}`)));
    });
    await addScripts(page, "src/otd-common.js", "src/emoji-picker.js", "src/gif-picker.js");
    await page.waitForSelector('.otd-compose-button[data-otd-button="gif"]');
    return searches;
}
const textOf = page => page.inputValue(".js-docked-compose textarea.js-compose-text");

test("the buttons sit after \"Add image\", one panel open at a time", async ({ page }) => {
    await openComposer(page);
    const order = await page.$$eval(".js-docked-compose button.btn", buttons => buttons.map(b => b.dataset.otdButton || b.className.match(/js-[\w-]+-button/)?.[0]));
    expect(order.slice(order.indexOf("js-add-image-button"), order.indexOf("js-add-image-button") + 3)).toEqual(["js-add-image-button", "emoji", "gif"]);
    expect(await page.textContent('.otd-compose-button[data-otd-button="emoji"] .label')).toBe("Эмодзи");

    await page.click('[data-otd-button="emoji"]');
    await expect(page.locator(".otd-emoji-panel")).toBeVisible();
    await page.click('[data-otd-button="gif"]');
    await expect(page.locator(".otd-emoji-panel")).toBeHidden();
    await expect(page.locator(".otd-gif-panel")).toBeVisible();
    await page.click('[data-otd-button="gif"]');
    await expect(page.locator(".otd-gif-panel")).toBeHidden();

    // TweetDeck renders the composer again: the buttons come back once
    await page.evaluate(() => {
        const drawer = document.querySelector(".js-drawer");
        drawer.querySelector(".js-docked-compose").remove();
        drawer.insertAdjacentHTML("beforeend", TD.ui.template.render("compose/docked_compose", {}));
    });
    await expect(page.locator('.otd-compose-button[data-otd-button="emoji"]')).toHaveCount(1);
});

test("emoji: search in Russian and English, insert at the caret, recently used first", async ({ page }) => {
    await openComposer(page);
    await page.fill(".js-docked-compose textarea.js-compose-text", "Привет мир");
    await page.evaluate(() => {
        const box = document.querySelector(".js-docked-compose textarea.js-compose-text");
        box.setSelectionRange(6, 6);
        window.__inputs = 0;
        box.addEventListener("input", () => window.__inputs++);
    });
    await page.click('[data-otd-button="emoji"]');
    await expect(page.locator(".otd-emoji-panel .otd-emoji").first()).toBeVisible();
    // the groups, by their first emoji, and names in Russian
    expect(await page.locator(".otd-emoji-panel .otd-emoji-tab").count()).toBe(9);
    expect(await page.getAttribute(".otd-emoji-panel .otd-emoji-tab >> nth=0", "title")).toBe("смайлики и эмоции");
    expect(await page.evaluate(() => document.activeElement.classList.contains("otd-picker-search"))).toBe(true);

    await page.fill(".otd-emoji-panel .otd-picker-search", "кошк");
    const found = await page.$$eval(".otd-emoji-panel .otd-emoji", buttons => buttons.filter(b => b.offsetParent).map(b => b.textContent));
    expect(found).toContain("🐱");
    await page.fill(".otd-emoji-panel .otd-picker-search", "cat face");
    expect(await page.$$eval(".otd-emoji-panel .otd-emoji", buttons => buttons.filter(b => b.offsetParent).map(b => b.textContent))).toContain("🐱");
    await page.fill(".otd-emoji-panel .otd-picker-search", "зззззз");
    await expect(page.locator(".otd-emoji-panel .otd-picker-note:visible")).toHaveText("Ничего не нашлось");

    await page.fill(".otd-emoji-panel .otd-picker-search", "кошк");
    await page.locator(".otd-emoji-panel .otd-emoji:visible", { hasText: "🐱" }).first().click();
    expect(await textOf(page)).toBe("Привет🐱 мир");
    expect(await page.evaluate(() => window.__inputs)).toBe(1);
    expect(await page.evaluate(() => localStorage.OTDemojiRecent)).toBe('["🐱"]');

    // the recent row at the top, Esc closes the panel and not the composer
    await page.fill(".otd-emoji-panel .otd-picker-search", "");
    expect(await page.locator(".otd-emoji-panel .otd-emoji-section >> nth=0 >> .otd-emoji").allTextContents()).toEqual(["🐱"]);
    await page.focus(".otd-emoji-panel .otd-picker-search");
    await page.keyboard.press("Escape");
    await expect(page.locator(".otd-emoji-panel")).toBeHidden();
    await expect(page.locator(".js-docked-compose")).toBeVisible();
});

const items = (prefix, n) => Array.from({ length: n }, (_, i) => ({
    url: `https://media.example/${prefix}${i}.gif`,
    preview_image: { url: `https://media.example/${prefix}${i}-preview.gif`, width: 200, height: 150 },
    original_image: { url: `https://media.example/${prefix}${i}.gif`, width: 480, height: 360 },
    alt_text: `${prefix} ${i}`,
}));

test("GIF: searches x.com's GIF search and attaches the picked GIF through TweetDeck's upload", async ({ page }) => {
    const searches = await openComposer(page, { gifs: url => url.searchParams.get("cursor")
        ? { data: { items: items("more", 2) }, cursor: {} }
        : { data: { items: items("cat", 4) }, cursor: { next: "NEXT" } } });
    await page.click('[data-otd-button="gif"]');
    await expect(page.locator(".otd-gif-panel .otd-picker-note")).toHaveText("Введите запрос, например «кот»");
    await page.fill(".otd-gif-panel .otd-picker-search", "кот");
    await page.press(".otd-gif-panel .otd-picker-search", "Enter");
    await expect(page.locator(".otd-gif-panel .otd-gif")).toHaveCount(4);
    expect(searches[0]).toEqual({ q: "кот", cursor: null, id: "tid:GET:/1.1/foundmedia/search.json" });
    expect(await page.getAttribute(".otd-gif-panel .otd-gif >> nth=0 >> img", "src")).toBe("https://media.example/cat0-preview.gif");

    await page.click(".otd-gif-panel .otd-gif-more");
    await expect(page.locator(".otd-gif-panel .otd-gif")).toHaveCount(6);
    expect(searches[1].cursor).toBe("NEXT");
    await expect(page.locator(".otd-gif-panel .otd-gif-more")).toBeHidden();

    await page.click(".otd-gif-panel .otd-gif >> nth=1");
    await expect.poll(() => page.evaluate(() => window.__added)).toEqual([["gif.gif|image/gif"]]);
    await expect(page.locator(".otd-gif-panel")).toBeHidden();
});

test("GIF: nothing found and a failing search say so", async ({ page }) => {
    let answer = { data: { items: [] } };
    await openComposer(page, { gifs: () => answer });
    await page.click('[data-otd-button="gif"]');
    await page.fill(".otd-gif-panel .otd-picker-search", "zzz");
    await page.press(".otd-gif-panel .otd-picker-search", "Enter");
    await expect(page.locator(".otd-gif-panel .otd-picker-note")).toHaveText("Ничего не нашлось");
    answer = 403;
    await page.fill(".otd-gif-panel .otd-picker-search", "кот");
    await page.press(".otd-gif-panel .otd-picker-search", "Enter");
    await expect(page.locator(".otd-gif-panel .otd-picker-note")).toHaveText("Поиск GIF не ответил");
});

test("OTDemojiPicker=0 and OTDgifPicker=0 leave the composer as it was", async ({ page }) => {
    await openPage(page, { storage: { OTDemojiPicker: "0", OTDgifPicker: "0" } });
    await addTweetDeck(page);
    await page.evaluate(() => document.body.insertAdjacentHTML("beforeend", TD.ui.template.render("compose/docked_compose", {})));
    await addScripts(page, "src/otd-common.js", "src/emoji-picker.js", "src/gif-picker.js");
    await page.waitForTimeout(500);
    expect(await page.locator(".otd-compose-button").count()).toBe(0);
});

test("the emoji list: groups in both languages, no skin tones or components", async () => {
    const data = JSON.parse(read("files/emoji.json"));
    expect(data.groups.ru[3]).toBe("животные и природа");
    expect(data.emoji.length).toBeGreaterThan(1800);
    const cat = data.emoji.find(e => e[0] === "🐱");
    expect(cat).toEqual(["🐱", 3, "cat face", "морда кошки", expect.stringContaining("kitten"), expect.stringContaining("кот")]);
    expect(data.emoji.some(e => e[1] === 2)).toBe(false);
    expect(data.emoji.some(e => /\u{1F3FB}|\u{1F3FF}/u.test(e[0]))).toBe(false);
});
