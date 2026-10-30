// src/challenge.js computes x-client-transaction-id; x-client-transaction-id (the library it's ported from)
// is the reference: same inputs, same time and random byte, the same id.
const { test, expect } = require("@playwright/test");
const { parseHTML } = require("linkedom");
const { ClientTransaction } = require("x-client-transaction-id");
const { openPage, addScripts } = require("./helpers");
const { ONDEMAND_PATH, animations, homepage, ondemand, key } = require("./fixtures/x-home");

const page200 = (body, contentType = "text/html") => route => route.fulfill({ contentType, headers: { "access-control-allow-origin": "*" }, body });

// challenge.js in a page on https://x.com, with x.com's homepage (and /i/jf/) and ondemand.s stubbed; home can be a
// function: the homepage as it is when it's asked for
async function openSolver(page, { home, jf, script }) {
    const routes = { "https://x.com/i/jf/": page200(jf ?? "<!doctype html><html><body>x-web</body></html>") };
    routes[`https://abs.twimg.com${ONDEMAND_PATH}`] = script !== undefined ? page200(script, "text/javascript") : route => route.fulfill({ status: 404, headers: { "access-control-allow-origin": "*" }, body: "" });
    routes["https://x.com/i/tweetdeck"] = page200("<!doctype html><html><head></head><body></body></html>");
    routes["https://x.com/"] = async route => page200(typeof home === "function" ? await home() : home)(route);
    // console arguments as text, errors with their message (Firefox gives only "Error" for them in text())
    const logs = [];
    page.on("console", async message => {
        const args = await Promise.all(message.args().map(arg => arg.evaluate(v => v instanceof Error ? `${v.name}: ${v.message}` : String(v)).catch(() => "")));
        logs.push(args.join(" "));
    });
    await openPage(page, { routes });
    await page.goto("https://x.com/i/tweetdeck");
    await addScripts(page, "src/challenge.js");
    return logs;
}

async function reference(home, script, method, path, time, random) {
    const realFetch = globalThis.fetch;
    const realRandom = Math.random;
    globalThis.fetch = async () => new Response(script);
    try {
        const transaction = await ClientTransaction.create(parseHTML(home).document);
        Math.random = () => (random + 0.5) / 256;
        return await transaction.generateTransactionId(method, path, undefined, undefined, undefined, time);
    } finally {
        globalThis.fetch = realFetch;
        Math.random = realRandom;
    }
}

const decode = id => {
    const bytes = Buffer.from(id, "base64");
    const decoded = [...bytes.subarray(1)].map(b => b ^ bytes[0]);
    return { random: bytes[0], bytes: decoded, time: decoded[48] | decoded[49] << 8 | decoded[50] << 16 | decoded[51] << 24 };
};
const REQUESTS = [["GET", "/i/api/graphql/abc/HomeLatestTimeline"], ["POST", "/1.1/statuses/update.json"]];

for(let n = 0; n < 12; n++) {
    // 4 or 5 indices, so the animation time is sometimes past the end of the curve
    const indices = n % 3 === 2 ? [n % 48, 7, 19, 33, 41] : [(n * 5) % 48, 2, 13, 41];
    const layout = n % 2 ? "runtime" : "plain";
    test(`same ids as the reference library: key ${n}, ${indices.length} indices, ${layout} chunk map`, async ({ page }) => {
        const svgs = animations(n);
        const script = ondemand(indices);
        await openSolver(page, { home: homepage(key(n), svgs, { layout }), script });
        for(const [method, path] of REQUESTS) {
            const id = await page.evaluate(([path, method]) => solveChallenge(path, method), [path, method]);
            const { random, time } = decode(id);
            // the reference only reads the runtime layout; the chunk map doesn't change the id
            expect(id).toBe(await reference(homepage(key(n), svgs), script, method, path, time, random));
        }
    });
}

test("an id is the key, the current time, a hash and 3, in 94 base64 characters", async ({ page }) => {
    await openSolver(page, { home: homepage(key("k"), animations(1)), script: ondemand([3, 2, 13, 41]) });
    const id = await page.evaluate(() => solveChallenge("/x", "GET"));
    const { bytes, time } = decode(id);
    expect(id).toHaveLength(94);
    expect(id).not.toContain("=");
    expect(Buffer.from(bytes.slice(0, 48)).equals(Buffer.from(key("k"), "base64"))).toBe(true);
    expect(Math.abs(time - Math.floor((Date.now() - 1682924400000) / 1000))).toBeLessThan(5);
    expect(bytes[68]).toBe(3);
});

test("without the old app on / it uses /i/jf/", async ({ page }) => {
    await openSolver(page, { home: "<!doctype html><html><body>x-web</body></html>", jf: homepage(key("jf"), animations(2)), script: ondemand([3, 2, 13, 41]) });
    const { bytes } = decode(await page.evaluate(() => solveChallenge("/x", "GET")));
    expect(Buffer.from(bytes.slice(0, 48)).equals(Buffer.from(key("jf"), "base64"))).toBe(true);
});

for(const [name, setup, reason] of [
    ["no key byte indices in ondemand.s", { home: homepage(key(3), animations(3)), script: "nothing here" }, "no key byte indices"],
    ["ondemand.s not found", { home: homepage(key(3), animations(3)) }, "HTTP 404"],
    ["no loading animation", { home: homepage(key(3), []), script: ondemand([3, 2, 13, 41]) }, "no loading animation"],
]) {
    test(`${name}: requests fail at once, the console says why`, async ({ page }) => {
        const logs = await openSolver(page, setup);
        const started = Date.now();
        const result = await page.evaluate(() => solveChallenge("/x", "GET").then(v => `resolved ${v}`, e => `rejected ${e}`));
        expect(result).toBe("rejected Solver errored");
        expect(Date.now() - started).toBeLessThan(3000);
        await expect.poll(() => logs.some(l => l.includes("Solver init error") && l.includes(reason))).toBe(true);
    });
}

// the key of an id
const keyOf = id => Buffer.from(decode(id).bytes.slice(0, 48)).toString("base64");
// the page's clock moved on by window.__shift
const shiftable = page => page.addInitScript(() => {
    const now = Date.now;
    window.__shift = 0;
    Date.now = () => now() + window.__shift;
});
const solve = page => page.evaluate(() => solveChallenge("/x", "GET").then(id => id, e => `rejected ${e}`));
// X's answers as interception.js tells the load watchdog of them
const answers = (page, ...statuses) => page.evaluate(statuses => {
    for(const status of statuses) document.dispatchEvent(new CustomEvent("otd-diagnostic", { detail: JSON.stringify({ kind: "response", id: 1, method: "GET", url: "https://api.x.com/1.1/statuses/home_timeline.json", status }) }));
}, statuses);

test("a solver that failed is made again half a minute later, from x.com's homepage as it is then", async ({ page }) => {
    let home = homepage(key(5), []);
    await shiftable(page);
    await openSolver(page, { home: () => home, script: ondemand([3, 2, 13, 41]) });
    expect(await solve(page)).toBe("rejected Solver errored");
    home = homepage(key(5), animations(5));
    // not before
    await page.evaluate(() => { window.__shift = 20000; });
    expect(await solve(page)).toBe("rejected Solver errored");
    await page.evaluate(() => { window.__shift = 31000; });
    expect(keyOf(await solve(page))).toBe(key(5));
});

test("X answering 404 three times in a row: the solver is made again from x.com's homepage as it is now, the old one goes on meanwhile", async ({ page }) => {
    let home = homepage(key("a"), animations(1));
    let hold;
    await shiftable(page);
    await openSolver(page, { home: () => hold ? hold.then(() => home) : home, script: ondemand([3, 2, 13, 41]) });
    expect(keyOf(await solve(page))).toBe(key("a"));
    home = homepage(key("b"), animations(2));
    // a fine answer between them
    await answers(page, 404, 404, 200, 404, 404);
    await page.waitForTimeout(300);
    expect(keyOf(await solve(page))).toBe(key("a"));
    // the homepage slow to answer: the old key until the new one is ready
    let release;
    hold = new Promise(resolve => release = resolve);
    await answers(page, 404);
    expect(keyOf(await solve(page))).toBe(key("a"));
    release();
    hold = null;
    await expect.poll(async () => keyOf(await solve(page))).toBe(key("b"));

    // not again within five minutes
    home = homepage(key("c"), animations(3));
    await answers(page, 404, 404, 404);
    await page.waitForTimeout(300);
    expect(keyOf(await solve(page))).toBe(key("b"));
    await page.evaluate(() => { window.__shift = 5 * 60000 + 1000; });
    await answers(page, 404, 404, 404);
    await expect.poll(async () => keyOf(await solve(page))).toBe(key("c"));
});
