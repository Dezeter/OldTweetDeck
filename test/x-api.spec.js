// X retiring api.x.com: interception.js answers what is gone for good itself, and moves an address X stopped
// answering at api.x.com to x.com's own /i/api (here the page's origin, otd.test), learned from X's answers.
const { test, expect } = require("@playwright/test");
const { openPage, addScripts } = require("./helpers");

const CORS = { "access-control-allow-origin": "http://otd.test", "access-control-allow-credentials": "true" };

// X at api.x.com and at x.com/i/api (otd.test/i/api), answering by path: a status and a body, "lost" for no
// answer, or a function of the request
async function open(page, { api = {}, own = {}, storage } = {}) {
    const asked = [];
    const answer = (table, base) => route => {
        const url = new URL(route.request().url());
        const path = url.pathname.replace(base, "");
        asked.push(`${url.host}${url.pathname}`);
        let reply = table[path] ?? [200, '{"ok":true}'];
        if(typeof reply === "function") reply = reply();
        if(reply === "lost") return route.abort();
        return route.fulfill({ status: reply[0], contentType: "application/json", headers: CORS, body: reply[1] });
    };
    await openPage(page, { storage, routes: {
        "https://api.x.com/": answer(api, ""),
        "https://otd.test/i/api/": answer(own, "/i/api"),
    } });
    await page.evaluate(() => {
        window.solveChallenge = async (path, method) => `tid:${method}:${path}`;
        window.__moves = [];
        document.addEventListener("otd-diagnostic", e => {
            const entry = JSON.parse(e.detail);
            if(entry.kind === "moved") window.__moves.push(`${entry.key} ${entry.moved ? "moved" : "back"}`);
        });
    });
    await addScripts(page, "src/interception.js");
    return asked;
}

// a request the way TweetDeck sends one, and what it got
const ask = (page, url) => page.evaluate(url => new Promise(resolve => {
    const xhr = new XMLHttpRequest();
    xhr.open("GET", url);
    xhr.onloadend = () => resolve(xhr.status);
    xhr.send();
}), url);
const moved = page => page.evaluate(() => JSON.parse(localStorage.OTDmovedApi || "[]"));

test("help/configuration, gone from X, is answered with TweetDeck's own values without asking", async ({ page }) => {
    const asked = await open(page);
    const result = await page.evaluate(() => new Promise(resolve => {
        const xhr = new XMLHttpRequest();
        xhr.open("GET", "https://api.x.com/1.1/help/configuration.json");
        xhr.onload = () => resolve({ status: xhr.status, data: JSON.parse(xhr.responseText) });
        xhr.send();
    }));
    expect(result.status).toBe(200);
    expect(result.data).toMatchObject({ characters_reserved_per_media: 23, transformedURLLength: 23, short_url_length: 23, dm_text_character_limit: 10000 });
    expect(asked).toEqual([]);
});

test("an address X answers 410 for at api.x.com is asked at x.com/i/api from then on, ids and all", async ({ page }) => {
    const asked = await open(page, { api: { "/1.1/dm/conversation/1234567-7654321.json": [410, ""], "/1.1/dm/user_updates.json": [200, "{}"] } });
    expect(await ask(page, "https://api.x.com/1.1/dm/conversation/1234567-7654321.json?count=50")).toBe(410);
    expect(await moved(page)).toEqual(["/1.1/dm/conversation/{id}-{id}.json"]);
    expect(await page.evaluate(() => window.__moves)).toEqual(["/1.1/dm/conversation/{id}-{id}.json moved"]);

    // another conversation, after a reload too
    expect(await ask(page, "https://api.x.com/1.1/dm/conversation/1111111-2222222.json?count=50")).toBe(200);
    await page.reload();
    await addScripts(page, "src/interception.js");
    await page.evaluate(() => { window.solveChallenge = async () => "tid"; });
    expect(await ask(page, "https://api.x.com/1.1/dm/conversation/3333333-4444444.json")).toBe(200);
    // the rest stays where it was
    expect(await ask(page, "https://api.x.com/1.1/dm/user_updates.json")).toBe(200);
    expect(asked).toEqual([
        "api.x.com/1.1/dm/conversation/1234567-7654321.json",
        "otd.test/i/api/1.1/dm/conversation/1111111-2222222.json",
        "otd.test/i/api/1.1/dm/conversation/3333333-4444444.json",
        "api.x.com/1.1/dm/user_updates.json",
    ]);
});

test("no answer twice in a row moves an address, once or with an answer in between doesn't", async ({ page }) => {
    let lost = 0;
    const asked = await open(page, { api: {
        "/1.1/mutes/users/ids.json": "lost",
        "/1.1/lists/list.json": () => lost++ === 1 ? [200, "[]"] : "lost",
    } });
    // asked with open(method, url) and no async, which is async as XMLHttpRequest has it
    expect(await ask(page, "https://api.x.com/1.1/lists/list.json")).toBe(0);
    expect(await ask(page, "https://api.x.com/1.1/lists/list.json")).toBe(200);
    expect(await ask(page, "https://api.x.com/1.1/lists/list.json")).toBe(0);
    await ask(page, "https://api.x.com/1.1/mutes/users/ids.json");
    expect(await moved(page)).toEqual([]);
    await ask(page, "https://api.x.com/1.1/mutes/users/ids.json");
    expect(await moved(page)).toEqual(["/1.1/mutes/users/ids.json"]);
    expect(await ask(page, "https://api.x.com/1.1/mutes/users/ids.json?cursor=-1")).toBe(200);
    expect(asked.at(-1)).toBe("otd.test/i/api/1.1/mutes/users/ids.json");
});

test("X's own errors don't move anything: a 404 with its JSON, a 401, a 429", async ({ page }) => {
    await open(page, { api: {
        "/1.1/users/show.json": [404, '{"errors":[{"code":50,"message":"User not found."}]}'],
        "/1.1/friendships/show.json": [401, '{"errors":[{"code":32}]}'],
        "/1.1/lists/show.json": [429, ""],
    } });
    for(const path of ["users/show", "friendships/show", "lists/show"]) await ask(page, `https://api.x.com/1.1/${path}.json`);
    expect(await moved(page)).toEqual([]);
});

test("an address that isn't at x.com/i/api either goes back and stays at api.x.com", async ({ page }) => {
    const asked = await open(page, {
        storage: { OTDmovedApi: JSON.stringify(["/1.1/saved_searches/list.json"]) },
        own: { "/1.1/saved_searches/list.json": [404, ""] },
        api: { "/1.1/saved_searches/list.json": [410, ""] },
    });
    expect(await ask(page, "https://api.x.com/1.1/saved_searches/list.json")).toBe(404);
    expect(await moved(page)).toEqual([]);
    // gone from both: not moved again
    expect(await ask(page, "https://api.x.com/1.1/saved_searches/list.json")).toBe(410);
    expect(await moved(page)).toEqual([]);
    expect(asked).toEqual(["otd.test/i/api/1.1/saved_searches/list.json", "api.x.com/1.1/saved_searches/list.json"]);
    expect(await page.evaluate(() => window.__moves)).toEqual(["/1.1/saved_searches/list.json back"]);
});

test("the load watchdog's report lists the old addresses in use and the moved ones", async ({ page }) => {
    await page.addInitScript({ path: require("path").join(require("./helpers").ROOT, "src/watchdog.js") });
    await open(page, { api: { "/1.1/blocks/ids.json": [410, ""] } });
    await ask(page, "https://api.x.com/1.1/users/lookup.json?user_id=1");
    await ask(page, "https://api.x.com/1.1/users/lookup.json?user_id=2");
    await ask(page, "https://api.x.com/1.1/dm/conversation/1234567-7654321.json");
    await ask(page, "https://api.x.com/1.1/blocks/ids.json");
    const report = await page.evaluate(() => {
        let report = "";
        document.addEventListener("otd-diagnostic-report", e => { report = e.detail; });
        document.dispatchEvent(new CustomEvent("otd-diagnostic-request"));
        return report;
    });
    expect(report).toContain("\nStill asked at api.x.com and answered: /1.1/users/lookup.json ×2, /1.1/dm/conversation/{id}-{id}.json ×1\n");
    expect(report).toMatch(/\nMoved to x\.com\/i\/api: \/1\.1\/blocks\/ids\.json\n {2}\/1\.1\/blocks\/ids\.json moved at \d+ s\n/);
});
