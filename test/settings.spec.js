const { test, expect } = require("@playwright/test");
const { openPage, addTweetDeck, addScripts } = require("./helpers");

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

test("an OldTweetDeck tab after TweetDeck's own, with a switch for every feature by section", async ({ page }) => {
    await openSettings(page, { storage: { OTDpasteImages: "0" } });
    expect(await page.$$eval(".js-setting-list a.list-link", links => links.map(a => a.textContent.trim()))).toEqual(["General", "Link Shortening", "Mute", "OldTweetDeck"]);

    await tab(page, "OldTweetDeck");
    expect(await page.$("#general_settings")).toBeNull();
    expect(await page.$eval(".js-setting-list li.selected", li => li.textContent.trim())).toBe("OldTweetDeck");
    expect(await page.$$eval("#otd-settings .otd-settings-section > label", labels => labels.map(l => l.textContent))).toEqual(["Перевод", "Колонки", "Твиты", "Написание"]);
    expect(await switches(page)).toEqual([
        ["grokTranslate", true], ["articlesTranslate", true], ["hideHomeReplies", true], ["groupNotifications", true],
        ["loadAllReplies", true], ["instantReplies", true], ["articles", true], ["pasteImages", false],
    ]);
    expect(await page.textContent('#otd-settings [data-feature="groupNotifications"]')).toBe(" Группировать лайки, ретвиты и подписки в уведомлениях");
    expect(await page.textContent("#otd-settings .otd-settings-about")).toBe("OldTweetDeck 5.1.0 · Релизы и обновления");
    expect(await page.getAttribute("#otd-settings .otd-settings-about a", "href")).toBe("https://github.com/Dezeter/OldTweetDeck/releases");
    await expect(page.locator("#otd-settings .otd-settings-note")).toBeHidden();
});

test("switches write the keys the features read, and say a reload is needed", async ({ page }) => {
    await openSettings(page, { storage: { OTDpasteImages: "0" } });
    await tab(page, "OldTweetDeck");

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
    await tab(page, "OldTweetDeck");
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

test("switching tabs leaves nothing of the other tab behind", async ({ page }) => {
    await openSettings(page);
    await tab(page, "OldTweetDeck");
    await tab(page, "General");
    expect(await page.$("#otd-settings")).toBeNull();
    expect(await page.$("#general_settings")).not.toBeNull();
    await tab(page, "Mute");
    await tab(page, "OldTweetDeck");
    await tab(page, "OldTweetDeck");
    expect(await page.$$("#otd-settings")).toHaveLength(1);
    expect(await page.$("#global-settings > :not(#otd-settings)")).toBeNull();
});

test.describe("in English", () => {
    test.use({ locale: "en-US" });
    test("labels follow the browser language", async ({ page }) => {
        await openSettings(page, { dark: true });
        await tab(page, "OldTweetDeck");
        expect(await page.$$eval("#otd-settings .otd-settings-section > label", labels => labels.map(l => l.textContent))).toEqual(["Translation", "Columns", "Tweets", "Composing"]);
        expect(await page.textContent('#otd-settings [data-feature="pasteImages"]')).toBe(" Paste images with Ctrl+V");
        expect(await page.locator("#otd-settings .otd-settings-lang select option").first().textContent()).toBe("English (browser language)");
    });
});
