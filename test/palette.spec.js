// The command palette: Ctrl+K or TweetDeck's ";", TweetDeck's commands and ours, found by the letters typed
const { test, expect } = require("@playwright/test");
const { openPage, addTweetDeck, addScripts } = require("./helpers");

test.use({ locale: "ru-RU", viewport: { width: 1000, height: 700 } });

async function open(page, storage) {
    await openPage(page, { storage });
    await addTweetDeck(page, { css: true });
    await page.evaluate(() => {
        window.__done = [];
        TD.settings.getTheme = () => "dark";
        TD.settings.setTheme = value => window.__done.push(`theme ${value}`);
        TD.settings.getColumnWidth = () => "medium";
        TD.settings.setColumnWidth = value => window.__done.push(`width ${value}`);
        // TweetDeck's own, as its column manager adds them
        window.cmd.makeCommandBag().add([{ label: "Go to column — 1: Home @alice", shortcut: { key: "1" }, apply: () => window.__done.push("column 1") }]);
        document.body.insertAdjacentHTML("beforeend", '<button id="before">before</button>');
        document.getElementById("before").focus();
    });
    await addScripts(page, "src/otd-common.js", "src/palette.js");
    await page.evaluate(() => {
        OTD.jQuery()(document).on("uiComposeTweet", () => window.__done.push("uiComposeTweet"));
    });
}
const shown = page => page.$$eval(".otd-palette-item .otd-palette-label", items => items.map(item => item.textContent));
const selected = page => page.$eval(".otd-palette-item.is-selected", item => item.textContent);
const done = page => page.evaluate(() => window.__done);

test("Ctrl+K opens it on the field; typing finds commands by their letters, Enter runs one and closes it", async ({ page }) => {
    await open(page);
    await page.keyboard.press("Control+KeyK");
    await expect(page.locator(".otd-palette-input")).toBeFocused();
    await expect(page.locator(".otd-palette-input")).toHaveAttribute("placeholder", "Команда или колонка…");
    expect(await shown(page)).toContain("Новый твит");
    // TweetDeck's dark theme is on, so only the others are offered; its own English ones are hidden
    await page.keyboard.type("тема");
    expect(await shown(page)).toEqual(["Тема: светлая", "Тема: как в системе"]);
    expect(await page.$$eval(".otd-palette-item:first-child b", marks => marks.map(b => b.textContent).join(""))).toBe("Тема");
    await page.keyboard.press("ArrowDown");
    expect(await selected(page)).toBe("Тема: как в системе");
    await page.keyboard.press("ArrowDown");
    expect(await selected(page)).toBe("Тема: светлая");
    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("Enter");
    expect(await done(page)).toEqual(["theme system"]);
    expect(await page.$(".otd-palette-overlay")).toBeNull();
    await expect(page.locator("#before")).toBeFocused();
});

test("TweetDeck's own commands are in it with their shortcuts, its keys don't fire while typing", async ({ page }) => {
    await open(page);
    // TweetDeck's ";"
    await page.evaluate(() => OTD.jQuery()(document).trigger("uiShowCommandPalette"));
    await page.keyboard.type("home");
    expect(await shown(page)).toEqual(["Go to column — 1: Home @alice"]);
    expect(await page.textContent(".otd-palette-item .otd-palette-key")).toBe("1");
    await page.keyboard.press("Enter");
    expect(await done(page)).toEqual(["column 1"]);

    // keys typed into the palette don't reach TweetDeck's shortcuts on the document
    await page.keyboard.press("Control+KeyK");
    await page.evaluate(() => document.addEventListener("keydown", e => window.__done.push(`key ${e.key}`)));
    await page.keyboard.type("новый");
    expect(await done(page)).toEqual(["column 1"]);
    await page.keyboard.press("Enter");
    expect(await done(page)).toEqual(["column 1", "uiComposeTweet"]);
});

test("Escape, a click outside and Ctrl+K again close it; a click on a command runs it", async ({ page }) => {
    await open(page);
    await page.keyboard.press("Control+KeyK");
    await page.keyboard.press("Escape");
    expect(await page.$(".otd-palette-overlay")).toBeNull();
    await expect(page.locator("#before")).toBeFocused();

    await page.keyboard.press("Control+KeyK");
    await page.mouse.click(10, 680);
    expect(await page.$(".otd-palette-overlay")).toBeNull();

    await page.keyboard.press("Control+KeyK");
    await page.keyboard.press("Control+KeyK");
    expect(await page.$(".otd-palette-overlay")).toBeNull();

    await page.keyboard.press("Control+KeyK");
    await page.keyboard.type("тема");
    await page.hover(".otd-palette-item >> text=как в системе");
    expect(await selected(page)).toBe("Тема: как в системе");
    await page.click(".otd-palette-item >> text=светлая");
    expect(await done(page)).toEqual(["theme light"]);
});

test("our switches and choices offer only what they aren't, and apply at once", async ({ page }) => {
    await open(page, { OTDdensity: "comfortable" });
    await page.keyboard.press("Control+KeyK");
    await page.keyboard.type("плотность");
    expect(await shown(page)).toEqual(["Плотность: компактно"]);
    await page.keyboard.press("Enter");
    expect(await page.evaluate(() => localStorage.OTDdensity ?? null)).toBeNull();

    await page.keyboard.press("Control+KeyK");
    await page.keyboard.type("lights");
    expect(await shown(page)).toEqual(["Lights out: включить"]);
    await page.keyboard.press("Enter");
    expect(await page.evaluate(() => localStorage.OTDlightsOut)).toBe("1");

    await page.keyboard.press("Control+KeyK");
    await page.keyboard.type("ширина");
    expect(await shown(page)).toEqual(["Ширина колонок: узкие", "Ширина колонок: широкие", "Ширина колонок: очень широкие", "Ширина колонок: по ширине окна (flex)"]);
    await page.keyboard.press("Enter");
    expect(await done(page)).toEqual(["width narrow"]);

    await page.keyboard.press("Control+KeyK");
    await page.keyboard.type("нет такого");
    expect(await page.textContent(".otd-palette-list")).toBe("Ничего не нашлось");
    expect(await page.getAttribute(".otd-palette", "role")).toBe("dialog");
    expect(await page.getAttribute(".otd-palette-input", "aria-activedescendant")).toBe("");
});

test.describe("in English", () => {
    test.use({ locale: "en-US" });
    test("labels follow the browser language", async ({ page }) => {
        await open(page);
        await page.keyboard.press("Control+KeyK");
        await page.keyboard.type("theme");
        expect(await shown(page)).toEqual(["Theme: light", "Theme: as the system"]);
    });
});
