const { test, expect } = require("@playwright/test");
const { openPage, addScripts } = require("./helpers");

test.use({ locale: "ru-RU", viewport: { width: 760, height: 520 } });

const R = text => JSON.stringify({ result: { text } });
// Grok streams the translation as JSON objects, sometimes split across lines
const RESPONSES = {
    100: R("Привет, ") + R("@jack") + "\n" + R(", смотри https://t.co/abc123 &amp; #news\nвторая строка"),
    200: R("Это цитата") + "\r\n" + R(" на английском"),
    204: R("Тут по-английски только цитата"),
    103: R("Сегодня хорошая погода"),
    300: R("Всем привет, доброе утро"),
    400: R("Цитата в окне твита"),
};

// test/fixtures/columns.html: TweetDeck-like columns with English, Russian and Japanese tweets, quotes,
// a detail view, a composer quote and a DM. Grok's fetch and the solver are stubbed.
async function open(page, { responses = RESPONSES, rateLimitFirst = false, storage } = {}) {
    await page.addInitScript(({ responses, rateLimitFirst }) => {
        window.__calls = [];
        window.__articleClicks = 0;
        document.cookie = "ct0=csrf123";
        localStorage.device_id = "dev-1";
        window.solveChallenge = async (path, method) => `tid:${method}:${path}`;
        window.fetch = async (url, init) => {
            const body = JSON.parse(init.body);
            window.__calls.push({ url, headers: init.headers, body, t: Date.now() });
            if(rateLimitFirst && window.__calls.length === 1) {
                return new Response('{"errors":[{"code":88}]}', { status: 200, headers: { "x-rate-limit-reset": String(Math.floor(Date.now() / 1000) + 1) } });
            }
            return new Response(responses[body.id] || "", { status: 200 });
        };
    }, { responses, rateLimitFirst });
    await openPage(page, { html: "test/fixtures/columns.html", storage });
    await page.evaluate(() => document.querySelectorAll("article").forEach(a => a.addEventListener("click", () => window.__articleClicks++)));
    await addScripts(page, "src/grok-translate.js");
}
const calls = page => page.evaluate(() => window.__calls);
const requestedIds = async page => (await calls(page)).map(c => c.body.id).sort();
const visible = (page, selector) => page.evaluate(s => { const e = document.querySelector(s); return !!e && getComputedStyle(e).display !== "none"; }, selector);

test("foreign tweets and quotes on screen are translated, with a toggle in the action row", async ({ page }) => {
    await open(page);
    await expect.poll(() => requestedIds(page), { timeout: 15000 }).toEqual(["100", "200", "204", "300", "400"]);

    const [first, second] = await calls(page);
    expect(first.url).toBe("https://api.otd.test/2/grok/translation.json");
    expect(first.body).toMatchObject({ dst_lang: "ru", content_type: "POST" });
    expect(first.headers).toMatchObject({ "x-client-transaction-id": "tid:POST:/2/grok/translation.json", "x-csrf-token": "csrf123", "x-client-uuid": "dev-1" });
    expect(second.t - first.t).toBeGreaterThanOrEqual(600);

    // the icon sits between like and the menu, and the row stays on one line
    const row = await page.evaluate(() => {
        const ul = document.querySelector("#a100 ul.js-tweet-actions");
        return {
            order: [...ul.children].map(li => li.classList.contains("otd-grok-action") ? "GROK" : li.querySelector("a").getAttribute("rel")),
            title: ul.querySelector(".otd-grok-action a").title,
            textToggles: document.querySelectorAll("#a100 .otd-grok-toggle").length,
            lines: new Set([...ul.children].map(li => li.offsetTop)).size,
        };
    });
    expect(row).toEqual({ order: ["reply", "retweet", "favorite", "GROK", "actionsMenu"], title: "Показать оригинал", textToggles: 0, lines: 1 });

    expect(await visible(page, "#a100 .js-tweet-text")).toBe(false);
    expect(await visible(page, "#a100 .tweet-body > .otd-grok-tr")).toBe(true);
    expect(await visible(page, "#q200 .js-quoted-tweet-text")).toBe(false);
    expect(await visible(page, "#q200 .otd-grok-tr")).toBe(true);
    expect(await visible(page, "#a100 .js-translate-call-to-action")).toBe(false);
    // links, mentions and hashtags are TweetDeck's own anchors, entities decoded
    expect(await page.textContent("#a100 .tweet-body > .otd-grok-tr")).toBe("Привет, @jack, смотри example.com/page & #news\nвторая строка");
    expect(await page.evaluate(() => {
        const tr = document.querySelector("#a100 .tweet-body > .otd-grok-tr");
        return [!!tr.querySelector('a[data-user-name="jack"]'), tr.querySelector("a.url-ext")?.textContent, tr.querySelector("a.hashtag")?.textContent, tr.classList.contains("js-tweet-text")];
    })).toEqual([true, "example.com/page", "#news", false]);

    // the icon switches the tweet and its quote to the original and back, without opening the tweet
    await page.click("#a100 .otd-grok-action a");
    expect(await visible(page, "#a100 .js-tweet-text")).toBe(true);
    expect(await visible(page, "#q200 .js-quoted-tweet-text")).toBe(true);
    expect(await page.evaluate(() => [document.querySelector("#a100 .otd-grok-action a").title, getComputedStyle(document.querySelector("#a100 .otd-grok-icon")).color, window.__articleClicks]))
        .toEqual(["Показать перевод", "rgb(29, 161, 242)", 0]);
    await page.click("#a100 .otd-grok-action a");
    expect(await visible(page, "#a100 .js-tweet-text")).toBe(false);
    expect(await visible(page, "#q200 .js-quoted-tweet-text")).toBe(false);

    // only the quote is foreign: the icon toggles the quote, the Russian text stays
    await page.click("#a104 .otd-grok-action a");
    expect(await visible(page, "#q204 .js-quoted-tweet-text")).toBe(true);
    expect(await visible(page, "#a104 > .js-tweet-text")).toBe(true);
    expect(await page.$("#a101 .otd-grok-action")).toBeNull();
    expect(await page.$("#dm .otd-grok-tr")).toBeNull();

    // the detail view's row gets the icon and stays on one line
    expect(await page.evaluate(() => {
        const ul = document.querySelector("#d300 ul.tweet-detail-actions");
        return [ul.children.length, new Set([...ul.children].map(li => li.offsetTop)).size, !!ul.querySelector(".otd-grok-action")];
    })).toEqual([5, 1, true]);

    // a quote in the composer has no action row: a text toggle instead
    expect(await visible(page, "#q400 .otd-grok-toggle")).toBe(true);
    await page.click("#q400 .otd-grok-toggle");
    expect(await visible(page, "#q400 .js-quoted-tweet-text")).toBe(true);
    expect(await page.textContent("#q400 .otd-grok-toggle")).toBe("Grok · Показать перевод");

    // TweetDeck re-renders the action row: the icon comes back
    await page.evaluate(() => {
        const ul = document.querySelector("#a100 ul.js-tweet-actions");
        const fresh = ul.cloneNode(true);
        fresh.querySelector(".otd-grok-action").remove();
        ul.replaceWith(fresh);
    });
    await expect.poll(() => page.evaluate(() => document.querySelectorAll("#a100 .otd-grok-action").length)).toBe(1);

    // a tweet scrolled into view is translated too
    await page.evaluate(() => { document.getElementById("col1").scrollTop = 1200; });
    await expect.poll(() => page.evaluate(() => document.querySelector("#a103 .otd-grok-tr")?.textContent), { timeout: 10000 }).toBe("Сегодня хорошая погода");
    expect(await page.$("#a103 .otd-grok-action")).not.toBeNull();
});

test("paragraphs are kept, with a small gap instead of an empty line", async ({ page }) => {
    await open(page, { responses: {
        100: R("О боже!\n\nЭто так мило, ") + R("@jack!\n\n\nСмотри https://t.co/abc123\nи #news") + R("\n\nНеделя точно будет суперской."),
        200: R("Одна строка"),
    } });
    await expect.poll(() => page.evaluate(() => document.querySelectorAll("#a100 .tweet-body > .otd-grok-tr > .otd-grok-para").length), { timeout: 10000 }).toBe(4);
    const result = await page.evaluate(() => {
        const tr = document.querySelector("#a100 .tweet-body > .otd-grok-tr");
        const paras = [...tr.querySelectorAll(":scope > .otd-grok-para")];
        const fontSize = parseFloat(getComputedStyle(tr).fontSize);
        return {
            texts: paras.map(p => p.textContent),
            margins: paras.map(p => parseFloat(getComputedStyle(p).marginTop) / fontSize),
            gaps: paras.slice(1).map((p, i) => p.getBoundingClientRect().top - paras[i].getBoundingClientRect().bottom),
            lineHeight: parseFloat(getComputedStyle(tr).lineHeight) || fontSize * 1.2,
            anchors: [!!paras[1].querySelector('a[data-user-name="jack"]'), paras[2].querySelector("a.url-ext")?.textContent, paras[2].querySelector("a.hashtag")?.textContent],
        };
    });
    expect(result.texts).toEqual(["О боже!", "Это так мило, @jack!", "Смотри example.com/page\nи #news", "Неделя точно будет суперской."]);
    expect(result.margins[0]).toBe(0);
    for(const margin of result.margins.slice(1)) expect(margin).toBeCloseTo(0.45, 1);
    for(const gap of result.gaps) expect(gap).toBeLessThan(result.lineHeight / 2);
    expect(result.anchors).toEqual([true, "example.com/page", "#news"]);
    await expect.poll(() => page.evaluate(() => [...document.querySelectorAll("#q200 .otd-grok-tr > .otd-grok-para")].map(p => p.textContent))).toEqual(["Одна строка"]);
});

test("translations are cached: a re-rendered tweet and a reload need no requests", async ({ page, context }) => {
    await open(page);
    await expect.poll(() => page.evaluate(() => document.querySelector("#a100 .otd-grok-tr")?.textContent), { timeout: 10000 }).toMatch(/^Привет/);
    await expect.poll(() => requestedIds(page), { timeout: 15000 }).toEqual(["100", "200", "204", "300", "400"]);

    // TweetDeck renders the chirp again: a new element with the same tweet id
    await page.evaluate(() => {
        const body = document.querySelector("#a100 .tweet-body");
        body.querySelectorAll(":scope > .js-tweet-text, :scope > .otd-grok-tr").forEach(n => n.remove());
        const p = document.createElement("p");
        p.className = "js-tweet-text tweet-text with-linebreaks";
        p.lang = "en";
        p.textContent = "Hello again";
        body.prepend(p);
    });
    await expect.poll(() => page.evaluate(() => document.querySelector("#a100 .tweet-body > .otd-grok-tr")?.textContent)).toMatch(/^Привет/);
    expect(await calls(page)).toHaveLength(5);

    // the cache is saved a little later; then a new page translates everything from localStorage
    await expect.poll(() => page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith("OTDgrok"))), { timeout: 10000 }).toEqual(["OTDgrokCache_ru"]);
    const reloaded = await context.newPage();
    await open(reloaded);
    await expect.poll(() => reloaded.evaluate(() => document.querySelector("#a100 .otd-grok-tr")?.textContent)).toMatch(/^Привет/);
    expect(await reloaded.$("#a100 .otd-grok-action")).not.toBeNull();
    expect(await calls(reloaded)).toHaveLength(0);
});

test("a rate limit pauses until the reset and retries the same tweet", async ({ page }) => {
    await open(page, { rateLimitFirst: true });
    await expect.poll(async () => (await calls(page)).length, { timeout: 15000 }).toBeGreaterThanOrEqual(2);
    const [first, second] = await calls(page);
    expect(second.body.id).toBe(first.body.id);
    expect(second.t - first.t).toBeGreaterThanOrEqual(2000);
});

test.describe("in English", () => {
    test.use({ locale: "en-US" });

    test("the target language follows the browser", async ({ page }) => {
        await open(page);
        await expect.poll(() => requestedIds(page), { timeout: 15000 }).toContain("101");
        const all = await calls(page);
        expect(all.map(c => c.body.id)).not.toContain("100");
        expect(all.every(c => c.body.dst_lang === "en")).toBe(true);
    });
});

test("OTDgrokTranslateLang sets the target language", async ({ page }) => {
    await open(page, { storage: { OTDgrokTranslateLang: "de" } });
    await expect.poll(async () => (await calls(page)).length, { timeout: 15000 }).toBeGreaterThan(0);
    expect((await calls(page))[0].body.dst_lang).toBe("de");
});

test("OTDgrokTranslate=0 turns it off", async ({ page }) => {
    await open(page, { storage: { OTDgrokTranslate: "0" } });
    await page.waitForTimeout(2500);
    expect(await calls(page)).toHaveLength(0);
    expect(await page.$$(".otd-grok-tr, .otd-grok-action")).toHaveLength(0);
});
