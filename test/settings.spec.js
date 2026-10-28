const { test, expect } = require("@playwright/test");
const { ROOT, openPage, addTweetDeck, addScripts } = require("./helpers");

test.use({ locale: "ru-RU", viewport: { width: 1000, height: 760 } });

// TweetDeck's own settings dialog with otd-common.js and settings.js loaded
async function openSettings(page, { storage, dark = false } = {}) {
    await openPage(page, { storage });
    await page.evaluate(() => { document.documentElement.dataset.otdVersion = "5.1.0"; });
    await addTweetDeck(page, { css: true });
    await addScripts(page, "src/otd-common.js", "src/settings.js");
    await page.evaluate(dark => {
        if(dark) document.documentElement.classList.add("dark");
        document.body.insertAdjacentHTML("beforeend", '<div id="settings-modal" class="js-modal settings-modal ovl scroll-v"></div>');
        TD.storage.accountController.isEmpty = () => false;
        new TD.components.GlobalSettings();
    }, dark);
}
const tab = (page, title) => page.locator(".js-setting-list a.list-link").filter({ hasText: title }).click();
const switches = page => page.evaluate(() => [...document.querySelectorAll("#otd-settings .otd-setting")].map(row => [row.dataset.feature, row.querySelector("i").classList.contains("icon-toggle-on")]));

test("an TweeXDeck tab after TweetDeck's own, with a switch for every feature by section", async ({ page }) => {
    await openSettings(page, { storage: { OTDpasteImages: "0" } });
    expect(await page.$$eval(".js-setting-list a.list-link", links => links.map(a => a.textContent.trim()))).toEqual(["General", "Link Shortening", "Mute", "TweeXDeck"]);

    await tab(page, "TweeXDeck");
    expect(await page.$("#general_settings")).toBeNull();
    expect(await page.$eval(".js-setting-list li.selected", li => li.textContent.trim())).toBe("TweeXDeck");
    expect(await page.$$eval("#otd-settings .otd-settings-section > label", labels => labels.map(l => l.textContent))).toEqual(["Внешний вид", "Перевод", "Колонки", "Твиты", "Медиа", "Написание", "Прочее"]);
    expect(await switches(page)).toEqual([
        ["lightsOut", false], ["fitColumns", true], ["svgIcons", true], ["modernLook", true], ["grokTranslate", true], ["articlesTranslate", true], ["hideHomeReplies", true], ["groupNotifications", true],
        ["pauseOnHover", true], ["selfThreads", true], ["threadsOldestFirst", true], ["skeletons", true], ["tabTitle", true], ["loadAllReplies", true], ["instantReplies", true], ["articles", true],
        ["cleanLinks", true], ["absoluteTime", false], ["redraft", true], ["muteFromMenu", true], ["rowMuteBlock", false],
        ["mediaAspect", true], ["inlineVideo", true], ["downloadMedia", true], ["copyMediaLinks", true], ["pasteImages", false],
        ["emojiPicker", true], ["gifPicker", true], ["blockServiceWorker", false], ["loadWatchdog", true],
    ]);
    expect(await page.textContent('#otd-settings [data-feature="groupNotifications"]')).toBe(" Группировать лайки, ретвиты и подписки в уведомлениях");
    // "what: how" is a title and a hint under it
    expect(await page.$$eval('#otd-settings [data-feature="selfThreads"] span', spans => spans.map(span => span.firstChild.textContent))).toEqual(["Треды автора", "Без «Replying to @автор», соседние твиты треда соединены линией"]);
    // "Appearance" has TweetDeck's theme and column width, and density and font, with the switches they go with
    expect(await page.$$eval('#otd-settings .otd-settings-section[data-section="appearance"] > div', rows => rows.map(row => row.dataset.feature || row.className.replace("otd-settings-select ", "")))).toEqual(
        ["otd-settings-theme", "lightsOut", "otd-settings-width", "fitColumns", "otd-settings-density", "otd-settings-font", "svgIcons", "modernLook"]);
    expect(await page.textContent("#otd-settings .otd-settings-about")).toBe("TweeXDeck 5.1.0 · Релизы и обновления · Скопировать диагностику");
    expect(await page.getAttribute("#otd-settings .otd-settings-about a", "href")).toBe("https://github.com/Dezeter/TweeXDeck/releases");
    await expect(page.locator("#otd-settings .otd-settings-note")).toBeHidden();
});

test("switches write the keys the features read, and say a reload is needed", async ({ page }) => {
    await openSettings(page, { storage: { OTDpasteImages: "0" } });
    await tab(page, "TweeXDeck");

    await page.click('#otd-settings [data-feature="groupNotifications"] span');
    await page.click('#otd-settings [data-feature="pasteImages"] i');
    expect(await page.evaluate(() => [localStorage.OTDgroupNotifications, localStorage.OTDpasteImages ?? null])).toEqual(["0", null]);
    expect(Object.fromEntries(await switches(page))).toMatchObject({ groupNotifications: false, pasteImages: true });
    await expect(page.locator("#otd-settings .otd-settings-note")).toBeVisible();
    expect(await page.textContent("#otd-settings .otd-settings-note")).toBe("Применится после перезагрузки. Перезагрузить");

    // every switch, both ways
    const features = (await switches(page)).map(([key]) => key);
    for(const key of features) {
        await page.click(`#otd-settings [data-feature="${key}"]`);
        await page.click(`#otd-settings [data-feature="${key}"]`);
    }
    expect(Object.fromEntries(await switches(page))).toMatchObject({ groupNotifications: false, pasteImages: true, grokTranslate: true });
    expect(await page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith("OTD")).sort())).toEqual(["OTDgroupNotifications"]);
});

test("the language select writes OTDgrokTranslateLang and keeps a code it doesn't list", async ({ page }) => {
    await openSettings(page, { storage: { OTDgrokTranslateLang: "eo" } });
    await tab(page, "TweeXDeck");
    const select = page.locator("#otd-settings .otd-settings-lang select");
    await expect(select).toHaveValue("eo");
    expect(await select.locator("option").first().textContent()).toBe("русский (язык браузера)");
    expect(await select.locator('option[value="de"]').textContent()).toBe("немецкий (de)");

    await select.selectOption("de");
    expect(await page.evaluate(() => localStorage.OTDgrokTranslateLang)).toBe("de");
    await select.selectOption("");
    expect(await page.evaluate(() => localStorage.OTDgrokTranslateLang ?? null)).toBeNull();
    await expect(page.locator("#otd-settings .otd-settings-note")).toBeVisible();
});

test("the font select lists the fonts, writes OTDfont, and goes back to TweetDeck's own without the key", async ({ page }) => {
    await openSettings(page, { storage: { OTDfont: "gone" } });
    await tab(page, "TweeXDeck");
    const select = page.locator("#otd-settings .otd-settings-font select");
    // a font that isn't there any more is the system one
    await expect(select).toHaveValue("");
    expect(await select.locator("option").allTextContents()).toEqual(["системный, как в TweetDeck", "Golos Text", "Onest", "Inter", "Manrope"]);

    await select.selectOption("onest");
    expect(await page.evaluate(() => localStorage.OTDfont)).toBe("onest");
    // fonts.js isn't loaded here, nothing would draw it before a reload
    await expect(page.locator("#otd-settings .otd-settings-note")).toBeVisible();
    await select.selectOption("");
    expect(await page.evaluate(() => localStorage.OTDfont ?? null)).toBeNull();
});

test("the search keeps the rows and sections it finds, in either language; a section's title finds all of it", async ({ page }) => {
    await openSettings(page);
    await tab(page, "TweeXDeck");
    const shown = () => page.evaluate(() => [...document.querySelectorAll("#otd-settings [data-search]:not(.otd-settings-section)")].filter(row => row.getClientRects().length).map(row => row.dataset.feature || row.className.split(" ").pop()));
    const sections = () => page.evaluate(() => [...document.querySelectorAll("#otd-settings .otd-settings-section")].filter(group => group.getClientRects().length).map(group => group.dataset.section));
    const dividers = () => page.evaluate(() => [...document.querySelectorAll("#otd-settings .divider-bar")].filter(bar => bar.getClientRects().length).length);
    const search = page.locator("#otd-settings .otd-settings-search");
    await expect(search).toHaveAttribute("placeholder", "Поиск по настройкам");

    await search.fill("ТРЕД");
    expect(await shown()).toEqual(["selfThreads", "threadsOldestFirst"]);
    expect(await sections()).toEqual(["columns"]);
    expect(await dividers()).toBe(0);
    await search.fill("thread");
    expect(await shown()).toEqual(["selfThreads", "threadsOldestFirst"]);
    await search.fill("шрифт");
    // the icons replace TweetDeck's icon font, their hint says so
    expect(await shown()).toEqual(["otd-settings-font", "svgIcons"]);
    await search.fill("медиа");
    expect(await sections()).toEqual(["media"]);
    expect(await shown()).toEqual(["mediaAspect", "inlineVideo", "downloadMedia", "copyMediaLinks"]);
    await search.fill("перевод");
    expect(await sections()).toEqual(["translation"]);
    expect(await shown()).toEqual(["grokTranslate", "articlesTranslate", "otd-settings-lang"]);
    await search.fill("плотн");
    expect(await sections()).toEqual(["appearance"]);
    await search.fill("ничего такого");
    expect(await sections()).toEqual([]);
    await expect(page.locator("#otd-settings .otd-settings-nothing")).toHaveText("Ничего не нашлось");
    await search.fill("");
    expect(await sections()).toEqual(["appearance", "translation", "columns", "tweets", "media", "compose", "other"]);
    expect(await dividers()).toBe(6);
    await expect(page.locator("#otd-settings .otd-settings-nothing")).toBeHidden();
});

test("what applies at once doesn't ask for a reload: TweetDeck's theme and column width, and what a script listens to", async ({ page }) => {
    await openSettings(page);
    await page.evaluate(() => {
        window.__set = [];
        TD.settings.getTheme = () => "dark";
        TD.settings.getColumnWidth = () => "wide";
        TD.settings.setTheme = value => window.__set.push(`theme ${value}`);
        TD.settings.setColumnWidth = value => window.__set.push(`width ${value}`);
        // as layout.js does
        OTD.onChange("OTDdensity", () => window.__set.push(`density ${localStorage.OTDdensity}`));
    });
    await tab(page, "TweeXDeck");
    const note = page.locator("#otd-settings .otd-settings-note");
    const theme = page.locator("#otd-settings .otd-settings-theme select");
    await expect(theme).toHaveValue("dark");
    expect(await theme.locator("option").allTextContents()).toEqual(["светлая", "тёмная", "как в системе"]);
    await theme.selectOption("system");
    const width = page.locator("#otd-settings .otd-settings-width select");
    await expect(width).toHaveValue("wide");
    expect(await width.locator("option").allTextContents()).toEqual(["узкие", "средние", "широкие", "очень широкие"]);
    await width.selectOption("superwide");
    const density = page.locator("#otd-settings .otd-settings-density select");
    await density.selectOption("comfortable");
    expect(await page.evaluate(() => window.__set)).toEqual(["theme system", "width superwide", "density comfortable"]);
    await expect(note).toBeHidden();

    // nothing listens to the switch here
    await page.click('#otd-settings [data-feature="fitColumns"]');
    await expect(note).toBeVisible();
});

test("a change in another tab reaches who listens", async ({ page }) => {
    await openSettings(page);
    await page.evaluate(() => {
        window.__changes = [];
        OTD.onChange("OTDdensity", () => window.__changes.push(localStorage.OTDdensity ?? null));
        window.dispatchEvent(new StorageEvent("storage", { key: "OTDdensity" }));
        localStorage.OTDdensity = "comfortable";
        window.dispatchEvent(new StorageEvent("storage", { key: "OTDdensity" }));
        window.dispatchEvent(new StorageEvent("storage", { key: "OTDfont" }));
    });
    expect(await page.evaluate(() => window.__changes)).toEqual([null, "comfortable"]);
});

test("TweetDeck's General tab has \"Super wide\" after its column widths, and picks it", async ({ page }) => {
    await openSettings(page);
    await page.evaluate(() => {
        window.__widths = [];
        TD.settings.setColumnWidth = value => window.__widths.push(value);
    });
    await tab(page, "General");
    const radios = page.locator('.js-column-size input[name="column-size"]');
    expect(await radios.evaluateAll(inputs => inputs.map(input => `${input.value}:${input.parentElement.textContent.trim()}`))).toEqual(["narrow:Narrow", "medium:Medium", "wide:Wide", "superwide:Super wide"]);
    await page.locator('.js-column-size input[value="superwide"]').check();
    expect(await page.evaluate(() => window.__widths)).toEqual(["superwide"]);
});

test("TweetDeck's General tab has \"System\" after its themes, checked while the theme follows the system's", async ({ page }) => {
    await openSettings(page, { storage: { OTDthemeSystem: "1" } });
    await page.evaluate(() => {
        window.__themes = [];
        TD.settings.getTheme = () => "dark";
        TD.settings.setTheme = value => window.__themes.push(value);
    });
    await tab(page, "General");
    const radios = page.locator('.js-theme input[name="theme"]');
    expect(await radios.evaluateAll(inputs => inputs.map(input => `${input.value}:${input.parentElement.textContent.trim()}:${input.checked}`))).toEqual(["dark:Dark:false", "light:Light:false", "system:System:true"]);
    await page.locator('.js-theme input[value="light"]').check();
    await page.locator('.js-theme input[value="system"]').check();
    expect(await page.evaluate(() => window.__themes)).toEqual(["light", "system"]);
});

test("switching tabs leaves nothing of the other tab behind", async ({ page }) => {
    await openSettings(page);
    await tab(page, "TweeXDeck");
    await tab(page, "General");
    expect(await page.$("#otd-settings")).toBeNull();
    expect(await page.$("#general_settings")).not.toBeNull();
    await tab(page, "Mute");
    await tab(page, "TweeXDeck");
    await tab(page, "TweeXDeck");
    expect(await page.$$("#otd-settings")).toHaveLength(1);
    expect(await page.$("#global-settings > :not(#otd-settings)")).toBeNull();
});

test("\"Copy diagnostics\" copies the load watchdog's report", async ({ page }) => {
    await page.addInitScript({ path: require("path").join(ROOT, "src/watchdog.js") });
    await page.addInitScript(() => {
        Object.defineProperty(navigator, "clipboard", { value: { writeText: async text => { window.__copied = text; } } });
    });
    await openSettings(page);
    await tab(page, "TweeXDeck");
    const link = page.locator("#otd-settings .otd-settings-diagnostics");
    await link.click();
    await expect(link).toHaveText("Скопировано");
    expect(await page.evaluate(() => window.__copied)).toMatch(/^TweeXDeck diagnostics\nVersion: 5\.1\.0\n/);
    await expect(link).toHaveText("Скопировать диагностику", { timeout: 5000 });
});

test.describe("in English", () => {
    test.use({ locale: "en-US" });
    test("labels follow the browser language", async ({ page }) => {
        await openSettings(page, { dark: true });
        await tab(page, "TweeXDeck");
        expect(await page.$$eval("#otd-settings .otd-settings-section > label", labels => labels.map(l => l.textContent))).toEqual(["Appearance", "Translation", "Columns", "Tweets", "Media", "Composing", "Other"]);
        expect(await page.textContent('#otd-settings [data-feature="pasteImages"]')).toBe(" Paste images with Ctrl+V");
        expect(await page.locator("#otd-settings .otd-settings-lang select option").first().textContent()).toBe("English (browser language)");
    });
});
