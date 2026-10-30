// A column gets its new tweets on a page open for hours (interception.js): with the top cursor of X's last answer,
// one with nothing new too, as on x.com; with none after X answered the cursor with an error, or after five minutes
// it brought nothing, as after a reload of the page. Kept, a cursor X stopped taking left Home without new tweets
// until a reload.
const { test, expect } = require("@playwright/test");
const { openPage, addScripts } = require("./helpers");

const CORS = { "access-control-allow-origin": "http://otd.test", "access-control-allow-credentials": "true" };

// a tweet of X's timelines, newer for a bigger id
const result = id => ({
    __typename: "Tweet", rest_id: String(id),
    core: { user_results: { result: { __typename: "User", rest_id: "10", core: { name: "Alice", screen_name: "alice", created_at: "Wed May 03 18:30:51 +0000 2023" }, legacy: {} } } },
    legacy: { id_str: String(id), full_text: `tweet ${id}`, created_at: new Date(Date.UTC(2026, 9, 30, 10, 0, id)).toUTCString(), user_id_str: "10", conversation_id_str: String(id), entities: { hashtags: [], symbols: [], urls: [], user_mentions: [] } },
});
const entries = (ids, top) => [
    ...ids.map(id => ({ entryId: `tweet-${id}`, content: { itemContent: { tweet_results: { result: result(id) } } } })),
    { entryId: `cursor-top-${top}`, content: { value: top } },
    { entryId: "cursor-bottom-1", content: { value: `bottom-${top}` } },
];
// X's answer: tweets newest first and the top cursor, or a status and a body
const home = (ids, top, extra) => [200, { ...extra, data: { home: { home_timeline_urt: { instructions: [{ type: "TimelineAddEntries", entries: entries(ids, top) }] } } } }];
const list = (ids, top) => [200, { data: { list: { tweets_timeline: { timeline: { instructions: [{ type: "TimelineAddEntries", entries: entries(ids, top) }] } } } } }];

// interception.js, X answering its GraphQL requests one after another from `answers`; what it was asked: the
// operation and the cursor. The page's clock is moved on by window.__shift.
async function open(page, answers) {
    const asked = [];
    await page.addInitScript(() => {
        const now = Date.now;
        window.__shift = 0;
        Date.now = () => now() + window.__shift;
    });
    await openPage(page, {
        // no random skipping of a column's requests that come quickly
        storage: { OTDrefreshInterval: "0" },
        routes: { "https://otd.test/i/api/graphql/": route => {
            const url = new URL(route.request().url());
            asked.push({ operation: url.pathname.split("/").pop(), cursor: JSON.parse(url.searchParams.get("variables")).cursor ?? null });
            const [status, body] = answers.shift();
            return route.fulfill({ status, contentType: "application/json", headers: CORS, body: typeof body === "string" ? body : JSON.stringify(body) });
        } },
    });
    await page.evaluate(() => {
        window.solveChallenge = async (path, method) => `tid:${method}:${path}`;
        // what the load watchdog is told of the columns' requests for new tweets
        window.__polls = [];
        document.addEventListener("otd-diagnostic", e => {
            const entry = JSON.parse(e.detail);
            if(entry.kind === "poll") window.__polls.push(entry);
        });
    });
    await addScripts(page, "src/interception.js");
    return asked;
}
// TweetDeck's request for a column's tweets, newer than since_id; the ids it got, or the status of an error
const poll = (page, path, since) => page.evaluate(([path, since]) => new Promise(resolve => {
    const xhr = new XMLHttpRequest();
    xhr.open("GET", `https://api.x.com/1.1/${path}${since ? `&since_id=${since}` : ""}`);
    xhr.setRequestHeader("x-act-as-user-id", "1");
    xhr.onloadend = () => resolve(xhr.status === 200 ? JSON.parse(xhr.responseText).map(tweet => Number(tweet.id_str)) : xhr.status);
    xhr.send();
}), [path, since]);
const pollHome = (page, since) => poll(page, "statuses/home_timeline.json?user_id=1&count=40", since);
const minutes = (page, n) => page.evaluate(n => { window.__shift += n * 60000; }, n);

test("asked with the top cursor of X's last answer, one with nothing new too, as on x.com", async ({ page }) => {
    const asked = await open(page, [home([30, 20, 10], "T1"), home([], "T2"), home([40], "T3"), home([], "T4")]);
    expect(await pollHome(page)).toEqual([30, 20, 10]);
    expect(await pollHome(page, 30)).toEqual([]);
    expect(await pollHome(page, 30)).toEqual([40]);
    expect(await pollHome(page, 40)).toEqual([]);
    expect(asked).toEqual([
        { operation: "HomeLatestTimeline", cursor: null },
        { operation: "HomeLatestTimeline", cursor: "T1" },
        { operation: "HomeLatestTimeline", cursor: "T2" },
        { operation: "HomeLatestTimeline", cursor: "T3" },
    ]);
    // the first isn't one for new tweets
    expect(await page.evaluate(() => window.__polls)).toEqual([
        { kind: "poll", feed: "home", tweets: 0, cursor: true },
        { kind: "poll", feed: "home", tweets: 1, cursor: true },
        { kind: "poll", feed: "home", tweets: 0, cursor: true },
    ]);
});

for(const [name, answer] of [
    ["an error status", [404, ""]],
    ["errors and no timeline", [200, { errors: [{ code: 130, message: "Over capacity" }] }]],
]) {
    test(`a top cursor X answers with ${name} isn't asked with again: X's newest tweets come`, async ({ page }) => {
        const asked = await open(page, [home([30, 20, 10], "T1"), answer, home([50, 40, 30, 20], "T5"), home([], "T6")]);
        await pollHome(page);
        await pollHome(page, 30);
        expect(await pollHome(page, 30)).toEqual([50, 40, 30, 20]);
        await pollHome(page, 50);
        expect(asked.map(a => a.cursor)).toEqual([null, "T1", null, "T5"]);
    });
}

test("after five minutes a top cursor brought nothing, X's newest tweets are asked for, as after a reload", async ({ page }) => {
    const asked = await open(page, [home([30, 20, 10], "T1"), home([], "T2"), home([], "T3"), home([60, 30, 20, 10], "T7"), home([], "T8")]);
    await pollHome(page);
    await pollHome(page, 30);
    await minutes(page, 4);
    // the cursor of an answer with nothing new keeps the time of the one that brought tweets
    await pollHome(page, 30);
    await minutes(page, 1.1);
    expect(await pollHome(page, 30)).toEqual([60, 30, 20, 10]);
    await pollHome(page, 60);
    expect(asked.map(a => a.cursor)).toEqual([null, "T1", "T2", null, "T7"]);
});

test("what a top cursor brings older than TweetDeck's newest: the next request goes on from X's next cursor", async ({ page }) => {
    const asked = await open(page, [home([30, 20, 10], "T1"), home([25], "T2"), home([], "T3")]);
    await pollHome(page);
    // a tweet that came late to the timeline; TweetDeck's newest is still 30
    expect(await pollHome(page, 30)).toEqual([25]);
    await pollHome(page, 30);
    expect(asked.map(a => a.cursor)).toEqual([null, "T1", "T2"]);
});

test("errors beside the timeline, X's about some of its tweets, don't lose the rest", async ({ page }) => {
    const answer = home([30, 20], "T1", { errors: [{ message: "_Missing: No status found with that ID.", path: ["data", "home"] }] });
    answer[1].data.home.home_timeline_urt.instructions[0].entries.splice(1, 0, { entryId: "tweet-25", content: { itemContent: { tweet_results: {} } } });
    const asked = await open(page, [answer, home([], "T2")]);
    expect(await pollHome(page)).toEqual([30, 20]);
    await pollHome(page, 30);
    expect(asked.map(a => a.cursor)).toEqual([null, "T1"]);
});

test("a list column too: its cursor X answers with an error isn't asked with again", async ({ page }) => {
    const asked = await open(page, [list([30, 20], "L1"), [500, ""], list([40, 30, 20], "L2"), list([], "L3")]);
    const pollList = since => poll(page, "lists/statuses.json?list_id=5&count=40", since);
    expect(await pollList()).toEqual([30, 20]);
    expect(await pollList(30)).toBe(500);
    expect(await pollList(30)).toEqual([40, 30, 20]);
    await pollList(40);
    expect(asked.map(a => `${a.operation} ${a.cursor}`)).toEqual(["ListLatestTweetsTimeline null", "ListLatestTweetsTimeline L1", "ListLatestTweetsTimeline null", "ListLatestTweetsTimeline L2"]);
});
