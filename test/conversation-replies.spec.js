const { test, expect } = require("@playwright/test");
const { openPage, addScripts } = require("./helpers");

// X's answers to TweetDetail: tweets with their authors inside, in entries for the tweet, the reply threads and the cursors
const user = (id, screenName) => ({ __typename: "User", rest_id: id, is_blue_verified: false, core: { name: screenName, screen_name: screenName, created_at: "Mon Jan 01 00:00:00 +0000 2024" }, avatar: { image_url: "https://pbs.twimg.com/x.jpg" },
    legacy: { name: screenName, screen_name: screenName, profile_image_url_https: "https://pbs.twimg.com/x.jpg", entities: { description: { urls: [] }, url: { urls: [] } } } });
const USERS = { 10: user("10", "alice"), 20: user("20", "bob") };
const tweet = (id, uid, reply) => ({ __typename: "Tweet", rest_id: id, core: { user_results: { result: USERS[uid] } }, views: { count: "5" },
    legacy: { id_str: id, user_id_str: uid, conversation_id_str: "100", full_text: `text ${id}`, created_at: new Date(1790000000000 + Number(id) * 1000).toUTCString(), entities: { hashtags: [], urls: [], user_mentions: [], symbols: [] }, ...(reply ? { in_reply_to_status_id_str: reply, in_reply_to_user_id_str: "10" } : {}) } });
const item = (t, displayType = "Tweet") => ({ itemType: "TimelineTweet", __typename: "TimelineTweet", tweet_results: { result: t }, tweetDisplayType: displayType });
const tweetEntry = (t, displayType) => ({ entryId: `tweet-${t.rest_id}`, sortIndex: "9", content: { entryType: "TimelineTimelineItem", itemContent: item(t, displayType) } });
// a reply thread, with the "show more" cursor of its own TweetDeck never followed
const thread = t => ({ entryId: `conversationthread-${t.rest_id}`, sortIndex: "5", content: { entryType: "TimelineTimelineModule", displayType: "VerticalConversation", items: [
    { entryId: `conversationthread-${t.rest_id}-tweet-${t.rest_id}`, item: { itemContent: item(t) } },
    { entryId: `conversationthread-${t.rest_id}-cursor-showmore-1`, item: { itemContent: { itemType: "TimelineTimelineCursor", value: "MORE", cursorType: "ShowMore" } } },
] } });
const cursor = (kind, value) => ({ entryId: `cursor-${kind.toLowerCase()}-${value}`, sortIndex: "1", content: { entryType: "TimelineTimelineItem", itemContent: { itemType: "TimelineTimelineCursor", value, cursorType: kind } } });
const detail = entries => JSON.stringify({ data: { threaded_conversation_with_injections_v2: { instructions: [{ type: "TimelineClearCache" }, { type: "TimelineAddEntries", entries }, { type: "TimelineTerminateTimeline", direction: "Top" }] } } });
// "Discover more" after the replies, and a deleted reply
const related = { entryId: "tweetdetailrelatedtweets-1", sortIndex: "0", content: { entryType: "TimelineTimelineModule", items: [{ entryId: "tweetdetailrelatedtweets-1-tweet-999", item: { itemContent: item(tweet("999", "20")) } }] } };
const tombstone = { entryId: "conversationthread-204", sortIndex: "4", content: { entryType: "TimelineTimelineModule", items: [{ entryId: "conversationthread-204-tweet-204", item: { itemContent: { itemType: "TimelineTweet", tweet_results: { result: { __typename: "TweetTombstone", tombstone: {} } } } } }] } };

// TweetDetail's pages by "<focalTweetId>:<cursor>"
const PAGES = {
    "100:": detail([cursor("Top", "TOP1"), tweetEntry(tweet("100", "10")), thread(tweet("201", "20", "100")), cursor("Bottom", "BOTTOM1")]),
    "100:BOTTOM1": detail([thread(tweet("202", "20", "100")), tombstone, cursor("ShowMoreThreadsPrompt", "SPAM1")]),
    "100:SPAM1": detail([thread(tweet("202", "20", "100")), thread(tweet("203", "20", "100")), related]),
};
// one X loses the first time it's asked for
PAGES["500:"] = detail([tweetEntry(tweet("500", "10")), thread(tweet("501", "20", "500"))]);
// a conversation that never ends
for(let i = 0; i < 10; i++) PAGES[`300:${i ? `C${i}` : ""}`] = detail([...(i ? [] : [tweetEntry(tweet("300", "10"))]), thread(tweet(String(310 + i), "20", "300")), cursor("Bottom", `C${i + 1}`)]);
// a deleted tweet: X says so with 200
PAGES["800:"] = JSON.stringify({ errors: [{ code: 144, message: "_Missing: No status found with that ID." }], data: {} });
const DETAIL = "/i/api/graphql/KwGBbJZc6DBx8EKmyQSP7g/TweetDetail";

async function open(page, storage, routes) {
    await openPage(page, { storage, routes });
    await page.evaluate(PAGES => {
        window.__calls = [];
        localStorage.device_id = "dev-1";
        window.solveChallenge = async (path, method) => `tid:${method}:${path}`;
        window.fetch = async (url, init) => {
            const u = new URL(url);
            window.__calls.push({ url, headers: init.headers });
            if(!u.pathname.endsWith("/TweetDetail")) return new Response("", { status: 404 });
            const { focalTweetId: id, cursor } = JSON.parse(u.searchParams.get("variables"));
            if(id === "400") return new Response('{"errors":[{"code":131}]}', { status: 500 });
            if(id === "500" && !window.__lost) {
                window.__lost = true;
                throw new TypeError("NetworkError when attempting to fetch resource.");
            }
            // X's answers with nothing in them
            if(id === "600") return new Response("", { status: 404 });
            if(id === "700") return new Response("", { status: 429 });
            const body = PAGES[`${id}:${cursor || ""}`];
            return new Response(body || "{}", { status: body ? 200 : 404 });
        };
    }, PAGES);
    // interception.js routes TweetDeck's XHRs; conversation-replies.js changes its conversation route
    await addScripts(page, "src/interception.js", "files/vendor.js", "files/bundle.js", "src/otd-common.js", "src/conversation-replies.js");
}

const rawConversation = (page, id = "100") => page.evaluate(id => new Promise(resolve => {
    const xhr = new XMLHttpRequest();
    xhr.open("GET", `https://api.x.com/2/timeline/conversation/${id}.json?include_reply_count=true&ext=mediaStats`);
    xhr.setRequestHeader("X-Csrf-Token", "csrf123");
    xhr.onload = () => resolve({ status: xhr.status, readyState: xhr.readyState, text: xhr.responseText, calls: window.__calls.splice(0) });
    xhr.send();
}), id);
const entryIds = raw => JSON.parse(raw.text).timeline.instructions[0].addEntries.entries.map(e => e.entryId);
const variables = call => JSON.parse(new URL(call.url).searchParams.get("variables"));

test("the conversation route follows bottom and show-more cursors and merges the pages", async ({ page }) => {
    await open(page);
    const raw = await rawConversation(page);
    expect(raw.status).toBe(200);
    expect(raw.readyState).toBe(4);
    const data = JSON.parse(raw.text);
    const entries = data.timeline.instructions[0].addEntries.entries;
    // merged in order, followed cursors removed, the top cursor kept, the duplicate thread dropped, and nothing of
    // "Discover more" or the deleted reply
    expect(entries.map(e => e.entryId)).toEqual(["cursor-top-TOP1", "tweet-100", "conversationThread-201", "conversationThread-202", "conversationThread-203"]);
    expect(entries[1].content.item.content.tweet).toEqual({ id: "100", displayType: "Tweet" });
    expect(Object.keys(data.globalObjects.tweets).sort()).toEqual(["100", "201", "202", "203"]);
    expect(data.globalObjects.users["20"]).toMatchObject({ id_str: "20", screen_name: "bob", name: "bob" });
    expect(data.globalObjects.tweets["201"]).toMatchObject({ user_id_str: "20", in_reply_to_status_id_str: "100", full_text: "text 201" });

    // x.com's own TweetDetail on the page's origin (here otd.test): /2/timeline/conversation answers 404 now
    expect(raw.calls).toHaveLength(3);
    expect(raw.calls.map(call => call.url.split("?")[0])).toEqual(Array(3).fill(`https://otd.test${DETAIL}`));
    expect(raw.calls.map(call => [variables(call).focalTweetId, variables(call).cursor ?? null])).toEqual([["100", null], ["100", "BOTTOM1"], ["100", "SPAM1"]]);
    const headers = raw.calls[1].headers;
    expect(headers["x-client-transaction-id"]).toBe(`tid:GET:${DETAIL}`);
    expect(headers["X-Client-UUID"]).toBe("dev-1");
    expect(headers["X-Csrf-Token"]).toBe("csrf123");
    expect(headers["Authorization"]).toMatch(/^Bearer /);

    // interception.js's afterRequest normalized the merged pages too; a thread's own "show more" isn't TweetDeck's
    expect(entries[3].content?.item?.content?.conversationThread?.conversationComponents?.map(c => c.conversationTweetComponent.tweet.id)).toEqual(["202"]);
    expect(data.globalObjects.tweets["203"]?.favorited).toBe(false);
});

test("TweetDeck sees all replies, at most 3 extra pages, and errors as before", async ({ page }) => {
    await open(page);
    const result = await page.evaluate(() => new Promise(resolve => {
        const account = { getUserID: () => "1", getKey: () => "twitter:1", getUsername: () => "me" };
        const client = Object.create(TD.services.TwitterClient.prototype);
        Object.assign(client, { account, oauth: { account }, pendingConversation: {}, URT_BASE_URL: "https://api.x.com/2/" });
        client.makeTwitterCall = function(url, params, method, processor, success, error) {
            const xhr = new XMLHttpRequest();
            xhr.open(method, `${url}?include_reply_count=true`);
            xhr.onload = () => xhr.status === 200 ? success(processor.call(client, JSON.parse(xhr.responseText))) : error(xhr);
            xhr.send();
        };
        const require = (() => { let r; window.webpackJsonp.push([["otdtest"], { otdtest: (m, e, req) => { r = req; } }, [["otdtest"]]]); return r; })();
        const bus = require(0);
        const out = {};
        const ids = ["100", "300", "400", "800"];
        for(const id of ids) {
            bus.subscribe(`/tweets/conversation/${id}`, conversation => {
                out[id] = { root: conversation.root && conversation.root.id, descendants: conversation.descendants.map(d => d.id || "more"), calls: window.__calls.filter(c => JSON.parse(new URL(c.url).searchParams.get("variables")).focalTweetId === id).length };
                if(ids.every(id => out[id])) resolve(out);
            });
            client.getConversation(id);
        }
    }));
    expect(result["100"]).toMatchObject({ root: "100", descendants: ["201", "202", "203"] });
    expect(result["300"]).toMatchObject({ calls: 4 });
    expect(result["300"].descendants).toHaveLength(4);
    // X's 500 is asked again once
    expect(result["400"]).toEqual({ root: null, descendants: [], calls: 2 });
    // a deleted tweet: X's error with 200 is one for TweetDeck
    expect(result["800"]).toEqual({ root: null, descendants: [], calls: 1 });
});

test("OTDloadAllReplies=0 leaves TweetDeck's request alone", async ({ page }) => {
    // without the module the upstream route sends the XHR itself
    const requests = [];
    await open(page, { OTDloadAllReplies: "0" }, {
        "https://otd.test/i/api/": route => {
            requests.push(route.request().url());
            return route.fulfill({ contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: PAGES["100:"] });
        },
    });
    const raw = await rawConversation(page);
    expect(raw.calls).toHaveLength(0);
    expect(requests.map(url => url.split("?")[0])).toEqual([`https://otd.test${DETAIL}`]);
    expect(JSON.parse(raw.text).timeline.instructions[0].addEntries.entries.map(e => e.entryId)).toContain("cursor-bottom-BOTTOM1");
});

test("an answer that got lost or came empty is asked for once more, and an error reaches TweetDeck as JSON with X's status", async ({ page }) => {
    await open(page);
    await page.evaluate(() => {
        window.__reports = [];
        document.addEventListener("otd-diagnostic", e => {
            const entry = JSON.parse(e.detail);
            if(entry.kind === "response") window.__reports.push(entry);
        });
        // interception.js logs what it can't parse
        window.__errors = [];
        const error = console.error;
        console.error = (...args) => {
            window.__errors.push(args.map(String).join(" "));
            error.apply(console, args);
        };
    });

    const lost = await rawConversation(page, "500");
    expect(lost.status).toBe(200);
    expect(lost.calls).toHaveLength(2);
    expect(entryIds(lost)).toEqual(["tweet-500", "conversationThread-501"]);

    const empty = await rawConversation(page, "600");
    expect(empty.status).toBe(404);
    expect(empty.calls).toHaveLength(2);
    expect(JSON.parse(empty.text)).toEqual({ errors: [{ code: 404, message: "X answered 404 with nothing" }] });

    // a rate limit isn't asked again
    const limited = await rawConversation(page, "700");
    expect(limited.status).toBe(429);
    expect(limited.calls).toHaveLength(1);

    // X says it with 200 when the tweet is gone; TweetDeck gets 404 and X's words
    const deleted = await rawConversation(page, "800");
    expect(deleted.status).toBe(404);
    expect(deleted.calls).toHaveLength(1);
    expect(JSON.parse(deleted.text).errors[0].code).toBe(144);

    expect(await page.evaluate(() => window.__errors.filter(e => /SyntaxError|JSON/.test(e)))).toEqual([]);
    // the load watchdog hears of X's answers
    expect(await page.evaluate(() => window.__reports.map(r => `${r.status} ${r.url}${r.error ? ` ${r.error}` : ""}`))).toEqual([
        "0 TypeError: NetworkError when attempting to fetch resource.", "200", "404", "404", "429", "200",
    ].map(line => line.replace(/^(\d+)/, `$1 https://otd.test${DETAIL}`)));
});

test("a conversation asked for again within 5 minutes keeps its extra pages without asking X for them", async ({ page }) => {
    await open(page);
    const first = await rawConversation(page);
    expect(first.calls).toHaveLength(3);

    // TweetDeck's poll a minute later
    const again = await rawConversation(page);
    expect(again.calls).toHaveLength(1);
    expect(entryIds(again)).toEqual(entryIds(first));
    expect(Object.keys(JSON.parse(again.text).globalObjects.tweets).sort()).toEqual(["100", "201", "202", "203"]);

    await page.evaluate(() => {
        const now = Date.now;
        Date.now = () => now() + 5 * 60 * 1000;
    });
    const later = await rawConversation(page);
    expect(later.calls).toHaveLength(3);
    expect(entryIds(later)).toEqual(entryIds(first));
});
