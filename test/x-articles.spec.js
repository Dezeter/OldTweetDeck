const { test, expect } = require("@playwright/test");
const { openPage, addScripts } = require("./helpers");

test.use({ locale: "ru-RU", viewport: { width: 1100, height: 700 } });

const image = color => "data:image/svg+xml," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="800" height="400"><rect width="800" height="400" fill="${color}"/></svg>`);
const block = (type, text, inlineStyleRanges = [], entityRanges = []) => ({ type, text, inlineStyleRanges, entityRanges });
const author = { core: { user_results: { result: { core: { name: "Cody", screen_name: "codystreams" } } } } };

// TweetResultByRestId for tweet 500: an article with every kind of Draft.js block the reader handles
const ARTICLE = { data: { tweetResult: { result: { __typename: "TweetWithVisibilityResults", tweet: { rest_id: "500", ...author, article: { article_results: { result: {
    rest_id: "2114000", title: "Building <img src=x onerror=alert(1)> things",
    preview_text: "This is the beginning of a long article about building things. It goes on for a while so the card has to clamp it to a few lines and not take the whole column with it. More text here to be sure it overflows four lines in a narrow column.",
    cover_media: { media_info: { original_img_url: image("#1da1f2") } },
    metadata: { first_published_at_secs: 1793000000 },
    media_entities: [{ media_id: "77", media_info: { original_img_url: image("#e0245e") } }],
    content_state: {
        blocks: [
            block("unstyled", "Hi 😀 bold link end", [{ offset: 5, length: 4, style: "Bold" }, { offset: 15, length: 3, style: "Italic" }], [{ offset: 10, length: 4, key: 0 }]),
            block("header-one", "Section one"),
            block("unordered-list-item", "apple"),
            block("unordered-list-item", "pear"),
            block("ordered-list-item", "first"),
            block("blockquote", "quoted words"),
            block("atomic", " ", [], [{ offset: 0, length: 1, key: 1 }]),
            block("unstyled", ""),
            block("atomic", " ", [], [{ offset: 0, length: 1, key: 2 }]),
            block("atomic", " ", [], [{ offset: 0, length: 1, key: 3 }]),
            block("unstyled", "bad link here", [], [{ offset: 0, length: 8, key: 4 }]),
            block("header-two", "Sub"),
            block("atomic", " ", [], [{ offset: 0, length: 1, key: 5 }]),
        ],
        entityMap: [
            { key: "0", value: { type: "LINK", data: { url: "https://example.com/" } } },
            { key: "1", value: { type: "MEDIA", data: { mediaItems: [{ mediaId: "77", mediaCategory: "DraftTweetImage" }] } } },
            { key: "2", value: { type: "DIVIDER", data: {} } },
            { key: "3", value: { type: "MARKDOWN", data: { markdown: "```js\nconst a = 1;\n```" } } },
            { key: "4", value: { type: "LINK", data: { url: "javascript:alert(1)" } } },
            { key: "5", value: { type: "TWEET", data: { tweetId: "123" } } },
        ],
    },
} } } } } } } };
const NO_ARTICLE = { data: { tweetResult: { result: { __typename: "Tweet", rest_id: "600", core: {} } } } };

// test/fixtures/articles.html: a tweet that is an article link, a tweet linking someone else's article, a quote of the first
async function open(page, { dark = false } = {}) {
    await page.addInitScript(({ ARTICLE, NO_ARTICLE }) => {
        window.__calls = [];
        window.__clicks = 0;
        window.__keys = [];
        window.solveChallenge = async (path, method) => `tid:${method}:${path}`;
        window.fetch = async (url, init) => {
            const u = new URL(url);
            const variables = JSON.parse(u.searchParams.get("variables"));
            window.__calls.push({ path: u.pathname, variables, toggles: JSON.parse(u.searchParams.get("fieldToggles")), features: JSON.parse(u.searchParams.get("features")), headers: init.headers });
            return new Response(JSON.stringify(variables.tweetId === "500" ? ARTICLE : NO_ARTICLE), { status: 200 });
        };
    }, { ARTICLE, NO_ARTICLE });
    // no automatic translation here, the translation tests are below
    await openPage(page, { html: "test/fixtures/articles.html", storage: { OTDarticlesTranslate: "0" } });
    await page.evaluate(dark => {
        if(dark) document.documentElement.classList.add("dark");
        document.querySelectorAll("article").forEach(a => a.addEventListener("click", () => window.__clicks++));
        document.addEventListener("keydown", e => window.__keys.push(e.key));
    }, dark);
    await addScripts(page, "src/otd-common.js", "src/x-articles.js");
    await page.waitForSelector("#a500 .otd-article-card");
}

test("an article tweet becomes a card that opens a reader", async ({ page }) => {
    await open(page);
    // one request per tweet: the quote reuses tweet 500's
    await expect.poll(() => page.evaluate(() => window.__calls.map(c => c.variables.tweetId).sort())).toEqual(["500", "600"]);
    const state = await page.evaluate(() => ({
        calls: window.__calls.map(c => c.variables.tweetId).sort(),
        call: window.__calls[0],
        title: document.querySelector("#a500 .otd-article-card-title")?.textContent,
        hint: document.querySelector("#a500 .otd-article-card-hint")?.textContent,
        linkHidden: getComputedStyle(document.querySelector("#a500 a.url-ext")).display === "none",
        clamped: (p => p.scrollHeight > p.clientHeight)(document.querySelector("#a500 .otd-article-card-preview")),
        quoteCard: !!document.querySelector("#q500 + .otd-article-card, #q500 .otd-article-card"),
        otherAuthorPlain: !document.querySelector("#a600 .otd-article-card") && getComputedStyle(document.querySelector("#a600 a.url-ext")).display !== "none",
    }));
    expect(state.calls).toEqual(["500", "600"]);
    expect(state.call.path).toBe("/i/api/graphql/aZ3tDYsjtdOMi7iarEJuiQ/TweetResultByRestId");
    expect(state.call.toggles).toMatchObject({ withArticleRichContentState: true, withArticlePlainText: true });
    expect(state.call.features.articles_preview_enabled).toBe(true);
    expect(state.call.headers["x-client-transaction-id"]).toBe("tid:GET:/i/api/graphql/aZ3tDYsjtdOMi7iarEJuiQ/TweetResultByRestId");
    expect(state.call.headers.authorization).toMatch(/^Bearer /);
    expect(state).toMatchObject({ title: "Building <img src=x onerror=alert(1)> things", hint: "Читать статью", linkHidden: true, clamped: true, quoteCard: true, otherAuthorPlain: true });

    await page.click("#a500 .otd-article-card");
    const reader = await page.evaluate(() => {
        const overlay = document.querySelector(".otd-article-overlay");
        const body = overlay.querySelector(".otd-article-body");
        const p = body.querySelector("p");
        const panel = overlay.querySelector(".otd-article-panel").getBoundingClientRect();
        return {
            clicks: window.__clicks,
            h1: body.querySelector("h1").textContent, injected: !!body.querySelector("h1 img"),
            byline: body.querySelector(".otd-article-byline").textContent, cover: !!body.querySelector("img.otd-article-cover"),
            first: p.textContent, bold: p.querySelector("b")?.textContent, italic: p.querySelector("i")?.textContent,
            link: p.querySelector("a") && [p.querySelector("a").textContent, p.querySelector("a").href, p.querySelector("a").target],
            h2: body.querySelector("h2")?.textContent, h3: body.querySelector("h3")?.textContent,
            ul: [...body.querySelectorAll("ul > li")].map(l => l.textContent), ol: [...body.querySelectorAll("ol > li")].map(l => l.textContent),
            quote: body.querySelector("blockquote")?.textContent, figures: body.querySelectorAll("figure img").length, dividers: body.querySelectorAll("hr").length,
            pre: body.querySelector("pre")?.textContent,
            javascriptLink: [...body.querySelectorAll("a")].some(a => a.href.startsWith("javascript")),
            embeddedTweet: [...body.querySelectorAll("a")].some(a => a.href === "https://x.com/i/status/123"),
            footer: body.querySelector(".otd-article-footer a")?.href,
            size: [Math.round(panel.width), Math.round(panel.height)],
        };
    });
    expect(reader.clicks).toBe(0);
    // the title is text, not markup
    expect(reader).toMatchObject({ h1: "Building <img src=x onerror=alert(1)> things", injected: false, cover: true });
    expect(reader.byline).toMatch(/^Cody · @codystreams · /);
    // inline styles and links at code point offsets, after an emoji
    expect(reader).toMatchObject({ first: "Hi 😀 bold link end", bold: "bold", italic: "end", link: ["link", "https://example.com/", "_blank"] });
    expect(reader).toMatchObject({ h2: "Section one", h3: "Sub", ul: ["apple", "pear"], ol: ["first"], quote: "quoted words", figures: 1, dividers: 1, pre: "```js\nconst a = 1;\n```" });
    expect(reader).toMatchObject({ javascriptLink: false, embeddedTweet: true, footer: "https://x.com/i/article/2114000" });
    expect(reader.size).toEqual([960, Math.round(700 * 0.92)]);

    // TweetDeck's shortcuts don't fire while reading; Esc, a click outside and × close it
    await page.keyboard.press("n");
    expect(await page.evaluate(() => window.__keys.length)).toBe(0);
    await page.keyboard.press("Escape");
    expect(await page.$(".otd-article-overlay")).toBeNull();
    await page.keyboard.press("n");
    expect(await page.evaluate(() => window.__keys.length)).toBe(1);
    await page.click("#a700 .otd-article-card");
    await page.mouse.click(20, 20);
    expect(await page.$(".otd-article-overlay")).toBeNull();
    await page.click("#a500 .otd-article-card");
    await page.click(".otd-article-close");
    expect(await page.$(".otd-article-overlay")).toBeNull();
});

test("the reader is styled in both themes", async ({ page }) => {
    await open(page, { dark: true });
    await page.click("#a500 .otd-article-card");
    expect(await page.evaluate(() => getComputedStyle(document.querySelector(".otd-article-panel")).backgroundColor)).toBe("rgb(21, 32, 43)");
    for(const theme of ["dark", "light"]) {
        if(theme === "light") await page.evaluate(() => document.documentElement.classList.remove("dark"));
        const styles = await page.evaluate(() => {
            const body = document.querySelector(".otd-article-body");
            const style = (selector, property) => getComputedStyle(body.querySelector(selector))[property];
            return { body: getComputedStyle(body).fontSize, h1: style("h1", "fontSize"), h2: style("h2", "fontSize"), p: style("p", "marginBottom"), ul: style("ul", "listStyleType"), li: style("li", "display"), ol: style("ol", "listStyleType"), quote: style("blockquote", "borderLeftWidth") };
        });
        expect(styles, theme).toEqual({ body: "17px", h1: "32px", h2: "24px", p: "14px", ul: "disc", li: "list-item", ol: "decimal", quote: "3px" });
    }
});

test("OTDarticles=0 turns it off", async ({ page }) => {
    await page.addInitScript(() => { window.__calls = []; window.fetch = async url => { window.__calls.push(url); return new Response("{}"); }; });
    await openPage(page, { html: "test/fixtures/articles.html", storage: { OTDarticles: "0" } });
    await addScripts(page, "src/otd-common.js", "src/x-articles.js");
    await page.waitForTimeout(2500);
    expect(await page.$$(".otd-article-card")).toHaveLength(0);
    expect(await page.evaluate(() => window.__calls)).toHaveLength(0);
});

// Translation with Google, through the same path as in the extension: x-articles.js → content.js →
// background3.js → google-translate.js. chrome.runtime is a stub that connects content.js to the background.
const long = Array.from({ length: 90 }, (_, i) => `This is sentence number ${i} of a very long paragraph that keeps going.`).join(" ");
const translatable = lang => ({ data: { tweetResult: { result: { rest_id: "500", ...author, article: { article_results: { result: {
    rest_id: `${lang}2114`, title: lang === "ru" ? "Уже по-русски" : "Building things", preview_text: lang === "ru" ? "Текст на русском" : "The beginning of the article.",
    cover_media: { media_info: { original_img_url: image("#1da1f2") } }, media_entities: [{ media_id: "77", media_info: { original_img_url: image("#e0245e") } }],
    content_state: { blocks: [
        block("unstyled", "Hello world, this is bold.", [{ offset: 21, length: 4, style: "Bold" }]),
        block("header-one", "Section one"),
        block("unordered-list-item", "apple"),
        block("unordered-list-item", "pear\nwith a soft break"),
        block("atomic", " ", [], [{ offset: 0, length: 1, key: 0 }]),
        block("code-block", "const a = 1;"),
        block("unstyled", long),
    ], entityMap: [{ key: "0", value: { type: "MEDIA", data: { mediaItems: [{ mediaId: "77" }] } } }] },
} } } } } } });

async function openTranslated(page, options = {}) {
    await page.addInitScript(({ en, ru, options }) => {
        window.__google = [];
        window.solveChallenge = async () => "tid";
        const fakeTranslate = s => s.split("\n").map(line => line ? `[ru] ${line}` : line).join("\n");
        window.fetch = async url => {
            const u = new URL(url);
            if(u.hostname === "translate.googleapis.com") {
                const q = u.searchParams.get("q");
                window.__google.push({ q, tl: u.searchParams.get("tl"), length: url.length });
                if(options.googleDown) return new Response("", { status: 429 });
                const source = /[а-я]/i.test(q) ? "ru" : "en";
                let out = source === "ru" ? q : fakeTranslate(q);
                // Google merging two lines into one, once
                if(options.mergeLines && q.includes("\n") && !window.__merged) {
                    window.__merged = true;
                    out = out.replace("\n", " ");
                }
                // answered sentence by sentence
                const sentences = out.match(/[^.]+\.?\s*|.+$/g) || [out];
                return new Response(JSON.stringify([sentences.map(s => [s, "orig", null, null]), null, source]), { status: 200 });
            }
            const variables = JSON.parse(u.searchParams.get("variables"));
            return new Response(JSON.stringify(variables.tweetId === "600" ? ru : en), { status: 200 });
        };
        window.chrome = { runtime: { onMessage: { addListener: fn => { window.__background = fn; } }, sendMessage: (message, callback) => { window.__background(message, {}, callback); } }, cookies: {} };
        window.importScripts = () => {};
    }, { en: translatable("en"), ru: translatable("ru"), options });
    await openPage(page, { html: "test/fixtures/articles.html", storage: options.storage });
    await page.evaluate(() => document.querySelector(".column-scroller").insertAdjacentHTML("beforeend",
        '<article class="stream-item js-stream-item" data-tweet-id="600" id="a600ru"><p class="js-tweet-text tweet-text" lang="zxx"><a href="https://t.co/r" class="url-ext" data-full-url="https://x.com/i/article/31">x.com/i/article/31</a></p></article>'));
    await addScripts(page, "src/google-translate.js", "src/background3.js", "src/content.js", "src/otd-common.js", "src/x-articles.js");
    await page.waitForSelector("#a500 .otd-article-card");
}
const reader = page => page.evaluate(() => {
    const body = document.querySelector(".otd-article-overlay .otd-article-body");
    const button = body.querySelector(".otd-article-translate");
    return {
        h1: body.querySelector("h1").textContent, button: button?.textContent, disabled: button?.disabled,
        first: body.querySelector(".otd-article-content p")?.innerHTML, h2: body.querySelector("h2")?.textContent,
        li: [...body.querySelectorAll("li")].map(l => l.textContent), pre: body.querySelector("pre")?.textContent,
        figures: body.querySelectorAll("figure img").length, last: [...body.querySelectorAll(".otd-article-content p")].pop()?.textContent,
    };
});
const openReader = async (page, card = "#a500") => {
    await page.click(`${card} .otd-article-card`);
    await page.waitForSelector(".otd-article-overlay .otd-article-body h1");
};

test("articles in another language are translated with Google, with a button back to the original", async ({ page }) => {
    await openTranslated(page);
    await expect.poll(() => page.textContent("#a500 .otd-article-card-title")).toBe("[ru] Building things");
    expect(await page.textContent("#a500 .otd-article-card-preview")).toBe("[ru] The beginning of the article.");
    await expect.poll(() => page.evaluate(() => document.querySelector("#a600ru .otd-article-card-title")?.textContent)).toBe("Уже по-русски");
    expect(await page.evaluate(() => window.__google.every(g => g.tl === "ru"))).toBe(true);

    await openReader(page);
    await expect.poll(async () => (await reader(page)).h1).toBe("[ru] Building things");
    await expect.poll(async () => (await reader(page)).last).toMatch(/^\[ru\] This is sentence number 0/);
    let state = await reader(page);
    expect(state).toMatchObject({ button: "Показать оригинал · Google Переводчик", first: "[ru] Hello world, this is bold.", h2: "[ru] Section one", li: ["[ru] apple", "[ru] pear with a soft break"], pre: "const a = 1;", figures: 1 });
    // a paragraph over the URL limit is split and put back together
    expect(state.last).toContain("number 89");
    expect(await page.evaluate(() => Math.max(...window.__google.map(g => g.length)))).toBeLessThan(4600);

    await page.click(".otd-article-translate");
    state = await reader(page);
    expect(state).toMatchObject({ h1: "Building things", first: "Hello world, this is <b>bold</b>.", button: "Перевести" });
    const requests = await page.evaluate(() => window.__google.length);
    await page.click(".otd-article-translate");
    expect((await reader(page)).h1).toBe("[ru] Building things");
    expect(await page.evaluate(() => window.__google.length)).toBe(requests);
    await page.keyboard.press("Escape");

    // already in Russian: no translation, no button
    await openReader(page, "#a600ru");
    await expect.poll(async () => (await reader(page)).button).toBeUndefined();
    expect((await reader(page)).h1).toBe("Уже по-русски");
});

test("when Google merges lines, that batch is redone line by line", async ({ page }) => {
    await openTranslated(page, { mergeLines: true });
    await openReader(page);
    await expect.poll(async () => (await reader(page)).li).toEqual(["[ru] apple", "[ru] pear with a soft break"]);
    expect((await reader(page)).h2).toBe("[ru] Section one");
});

test("OTDarticlesTranslate=0: nothing automatic, the button translates", async ({ page }) => {
    await openTranslated(page, { storage: { OTDarticlesTranslate: "0" } });
    expect(await page.textContent("#a500 .otd-article-card-title")).toBe("Building things");
    await openReader(page);
    expect(await reader(page)).toMatchObject({ h1: "Building things", button: "Перевести" });
    expect(await page.evaluate(() => window.__google.length)).toBe(0);
    await page.click(".otd-article-translate");
    await expect.poll(async () => (await reader(page)).h1).toBe("[ru] Building things");
});

test("when Google fails the original stays and the button offers a retry", async ({ page }) => {
    await openTranslated(page, { googleDown: true });
    await openReader(page);
    await expect.poll(async () => (await reader(page)).button).toBe("Не удалось перевести · Перевести");
    expect(await reader(page)).toMatchObject({ h1: "Building things", disabled: false });
});
