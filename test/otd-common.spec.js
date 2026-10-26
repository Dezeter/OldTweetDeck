const { test, expect } = require("@playwright/test");
const { openPage, addScripts } = require("./helpers");

test("switches read and write the same localStorage keys as before", async ({ page }) => {
    await openPage(page, { storage: { OTDpasteImages: "0" } });
    await addScripts(page, "src/otd-common.js");
    const result = await page.evaluate(() => {
        const before = OTD.FEATURES.map(f => [f.key, OTD.isOn(f.key)]);
        OTD.setOn("pasteImages", true);
        OTD.setOn("groupNotifications", false);
        return { before, paste: localStorage.OTDpasteImages ?? null, group: localStorage.OTDgroupNotifications, unknown: (() => { try { OTD.isOn("nope"); } catch(e) { return e.message; } })() };
    });
    expect(result.before).toEqual([
        ["grokTranslate", true], ["articlesTranslate", true], ["hideHomeReplies", true], ["groupNotifications", true],
        ["pauseOnHover", true], ["tabTitle", true], ["loadAllReplies", true], ["instantReplies", true], ["articles", true],
        ["cleanLinks", true], ["absoluteTime", false], ["mediaAspect", true], ["downloadMedia", true], ["pasteImages", false],
    ]);
    expect(result).toMatchObject({ paste: null, group: "0", unknown: "no OldTweetDeck feature nope" });
});

test("a feature that is off by default is switched on with \"1\" and its key goes when it's off again", async ({ page }) => {
    await openPage(page);
    await addScripts(page, "src/otd-common.js");
    const steps = await page.evaluate(() => {
        const state = () => [OTD.isOn("absoluteTime"), localStorage.OTDabsoluteTime ?? null];
        const steps = [state()];
        OTD.setOn("absoluteTime", true);
        steps.push(state());
        OTD.setOn("absoluteTime", false);
        steps.push(state());
        localStorage.OTDabsoluteTime = "0";
        steps.push(state());
        // a feature that is on by default and was set to "1" by hand is on
        localStorage.OTDcleanLinks = "1";
        steps.push([OTD.isOn("cleanLinks"), localStorage.OTDcleanLinks]);
        return steps;
    });
    expect(steps).toEqual([[false, null], [true, "1"], [false, null], [false, "0"], [true, "1"]]);
});

test("xHeaders: x.com's headers and the transaction id, which a failing solver leaves out", async ({ page }) => {
    await openPage(page);
    await addScripts(page, "src/otd-common.js");
    const result = await page.evaluate(async () => {
        document.cookie = "ct0=csrf123";
        localStorage.device_id = "dev-1";
        window.solveChallenge = async (path, method) => `tid:${method}:${path}`;
        const signed = await OTD.xHeaders("/1.1/x.json", "GET", { "content-type": "application/json" });
        window.solveChallenge = () => Promise.reject(new Error("solver down"));
        const failed = await OTD.xHeaders("/1.1/x.json", "GET");
        return { signed, failed: "x-client-transaction-id" in failed };
    });
    expect(result.signed).toMatchObject({
        "authorization": expect.stringMatching(/^Bearer /), "x-csrf-token": "csrf123", "x-twitter-auth-type": "OAuth2Session",
        "x-client-uuid": "dev-1", "x-client-transaction-id": "tid:GET:/1.1/x.json", "content-type": "application/json",
    });
    expect(result.failed).toBe(false);
});

test.describe("target language", () => {
    test.use({ locale: "pt-BR" });
    test("is the browser's unless set", async ({ page }) => {
        await openPage(page);
        await addScripts(page, "src/otd-common.js");
        expect(await page.evaluate(() => OTD.targetLang())).toBe("pt");
        expect(await page.evaluate(() => { localStorage.OTDgrokTranslateLang = "uk"; return OTD.targetLang(); })).toBe("uk");
        // labels follow the browser, English when there are none for its language
        expect(await page.evaluate(() => [OTD.label({ ru: "да", en: "yes" }), OTD.label({ ru: "да", en: "yes" }, "ru")])).toEqual(["yes", "да"]);
    });
});

test("watchers share one observer and frame, and one failing doesn't stop the others", async ({ page }) => {
    await openPage(page);
    await addScripts(page, "src/otd-common.js");
    const runs = await page.evaluate(async () => {
        const runs = { a: 0, b: 0, broken: 0 };
        const nextFrames = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const scheduleA = OTD.watch(() => runs.a++);
        OTD.watch(() => { runs.broken++; throw new Error("broken watcher"); });
        OTD.watch(() => runs.b++);
        await nextFrames();
        const first = { ...runs };
        // many changes in one frame: one more run each
        for(let i = 0; i < 5; i++) document.body.append(document.createElement("div"));
        await nextFrames();
        const afterChanges = { ...runs };
        // a watcher's own schedule runs only that watcher
        scheduleA();
        await nextFrames();
        return { first, afterChanges, own: { ...runs } };
    });
    expect(runs.first).toEqual({ a: 1, b: 1, broken: 1 });
    expect(runs.afterChanges).toEqual({ a: 2, b: 2, broken: 2 });
    expect(runs.own).toEqual({ a: 3, b: 2, broken: 2 });
});
