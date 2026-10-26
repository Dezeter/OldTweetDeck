// src/challenge.js computes x-client-transaction-id; x-client-transaction-id (the library it's ported from)
// is the reference: same inputs, same time and random byte, the same id.
const { test, expect } = require("@playwright/test");
const { parseHTML } = require("linkedom");
const { ClientTransaction } = require("x-client-transaction-id");
const { openPage, addScripts } = require("./helpers");
const { ONDEMAND_PATH, animations, homepage, ondemand, key } = require("./fixtures/x-home");

const page200 = (body, contentType = "text/html") => route => route.fulfill({ contentType, headers: { "access-control-allow-origin": "*" }, body });

// challenge.js in a page on https://x.com, with x.com's homepage (and /i/jf/) and ondemand.s stubbed
async function openSolver(page, { home, jf, script }) {
    const routes = { "https://x.com/i/jf/": page200(jf ?? "<!doctype html><html><body>x-web</body></html>") };
    routes[`https://abs.twimg.com${ONDEMAND_PATH}`] = script !== undefined ? page200(script, "text/javascript") : route => route.fulfill({ status: 404, headers: { "access-control-allow-origin": "*" }, body: "" });
    routes["https://x.com/i/tweetdeck"] = page200("<!doctype html><html><head></head><body></body></html>");
    routes["https://x.com/"] = page200(home);
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
