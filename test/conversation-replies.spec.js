const { test, expect } = require("@playwright/test");
const { openPage, addScripts } = require("./helpers");

const user = (id, screenName) => ({ id_str: id, screen_name: screenName, name: screenName, profile_image_url_https: "https://pbs.twimg.com/x.jpg", entities: { description: { urls: [] }, url: { urls: [] } } });
const tweet = (id, uid, reply) => ({ id_str: id, user_id_str: uid, full_text: `text ${id}`, created_at: new Date(1790000000000 + Number(id) * 1000).toUTCString(), entities: { hashtags: [], urls: [], user_mentions: [], symbols: [] }, source: "web", ...(reply ? { in_reply_to_status_id_str: reply, in_reply_to_user_id_str: "10" } : {}) });
const tweetEntry = id => ({ entryId: `tweet-${id}`, sortIndex: "9", content: { item: { content: { tweet: { id, displayType: "Tweet" } } } } });
const thread = id => ({ entryId: `conversationThread-${id}`, sortIndex: "5", content: { timelineModule: { displayType: "VerticalConversation", items: [{ entryId: `conversationThread-${id}-tweet-${id}`, item: { content: { tweet: { id, displayType: "Tweet" } } } }] } } });
const cursor = (kind, value) => ({ entryId: `cursor-${kind}-${value}`, sortIndex: "1", content: { operation: { cursor: { value, cursorType: kind } } } });
const timeline = (tweets, entries) => JSON.stringify({ globalObjects: { tweets: Object.fromEntries(tweets.map(t => [t.id_str, t])), users: { 10: user("10", "alice"), 20: user("20", "bob") } }, timeline: { id: "Conversation", instructions: [{ addEntries: { entries } }, { terminateTimeline: { direction: "Top" } }] } });

// legacy /2/timeline/conversation/<id>.json pages by "<id>:<cursor>"
const PAGES = {
    "100:": timeline([tweet("100", "10"), tweet("201", "20", "100")], [cursor("top", "TOP1"), tweetEntry("100"), thread("201"), cursor("bottom", "BOTTOM1")]),
    "100:BOTTOM1": timeline([tweet("202", "20", "100")], [thread("202"), cursor("showMoreThreadsPrompt", "SPAM1")]),
    "100:SPAM1": timeline([tweet("202", "20", "100"), tweet("203", "20", "100")], [thread("202"), thread("203")]),
};
// a conversation that never ends
for(let i = 0; i < 10; i++) PAGES[`300:${i ? `C${i}` : ""}`] = timeline([tweet("300", "10"), tweet(String(310 + i), "20", "300")], [...(i ? [] : [tweetEntry("300")]), thread(String(310 + i)), cursor("bottom", `C${i + 1}`)]);

async function open(page, storage, routes) {
    await openPage(page, { storage, routes });
    await page.evaluate(PAGES => {
        window.__calls = [];
        localStorage.device_id = "dev-1";
        window.solveChallenge = async (path, method) => `tid:${method}:${path}`;
        window.fetch = async (url, init) => {
            const u = new URL(url);
            const match = u.pathname.match(/conversation\/(\d+)\.json/);
            window.__calls.push({ url, headers: init.headers });
            if(!match) return new Response("", { status: 404 });
            if(match[1] === "400") return new Response('{"errors":[{"code":131}]}', { status: 500 });
            const body = PAGES[`${match[1]}:${u.searchParams.get("cursor") || ""}`];
            return new Response(body || "{}", { status: body ? 200 : 404 });
        };
    }, PAGES);
    // interception.js routes TweetDeck's XHRs; conversation-replies.js changes its conversation route
    await addScripts(page, "src/interception.js", "files/vendor.js", "files/bundle.js", "src/otd-common.js", "src/conversation-replies.js");
}

const rawConversation = page => page.evaluate(() => new Promise(resolve => {
    const xhr = new XMLHttpRequest();
    xhr.open("GET", "https://api.x.com/2/timeline/conversation/100.json?include_reply_count=true&ext=mediaStats");
    xhr.setRequestHeader("X-Csrf-Token", "csrf123");
    xhr.onload = () => resolve({ status: xhr.status, readyState: xhr.readyState, text: xhr.responseText, calls: window.__calls.splice(0) });
    xhr.send();
}));

test("the conversation route follows bottom and show-more cursors and merges the pages", async ({ page }) => {
    await open(page);
    const raw = await rawConversation(page);
    expect(raw.status).toBe(200);
    expect(raw.readyState).toBe(4);
    const data = JSON.parse(raw.text);
    const entries = data.timeline.instructions[0].addEntries.entries;
    // merged in order, followed cursors removed, the top cursor kept, the duplicate thread dropped
    expect(entries.map(e => e.entryId)).toEqual(["cursor-top-TOP1", "tweet-100", "conversationThread-201", "conversationThread-202", "conversationThread-203"]);

    expect(raw.calls).toHaveLength(3);
    expect(raw.calls[1].url).toContain("cursor=BOTTOM1");
    expect(raw.calls[2].url).toContain("cursor=SPAM1");
    expect(raw.calls[0].url).not.toContain("ext=");
    const headers = raw.calls[1].headers;
    expect(headers["x-client-transaction-id"]).toBe("tid:GET:/2/timeline/conversation/100.json");
    expect(headers["X-Client-UUID"]).toBe("dev-1");
    expect(headers["X-Csrf-Token"]).toBe("csrf123");
    expect(headers["Authorization"]).toMatch(/^Bearer /);

    // interception.js's afterRequest normalized the merged pages too
    expect(entries[3].content?.item?.content?.conversationThread?.conversationComponents?.[0]?.conversationTweetComponent?.tweet?.id).toBe("202");
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
        for(const id of ["100", "300", "400"]) {
            bus.subscribe(`/tweets/conversation/${id}`, conversation => {
                out[id] = { root: conversation.root && conversation.root.id, descendants: conversation.descendants.map(d => d.id || "more"), calls: window.__calls.filter(c => c.url.includes(`/${id}.json`)).length };
                if(out["100"] && out["300"] && out["400"]) resolve(out);
            });
            client.getConversation(id);
        }
    }));
    expect(result["100"]).toMatchObject({ root: "100", descendants: ["201", "202", "203"] });
    expect(result["300"]).toMatchObject({ calls: 4 });
    expect(result["300"].descendants).toHaveLength(4);
    expect(result["400"]).toEqual({ root: null, descendants: [], calls: 1 });
});

test("OTDloadAllReplies=0 leaves TweetDeck's request alone", async ({ page }) => {
    // without the module the upstream route sends the XHR itself
    const requests = [];
    await open(page, { OTDloadAllReplies: "0" }, {
        "https://api.x.com/": route => {
            requests.push(route.request().url());
            return route.fulfill({ contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: PAGES["100:"] });
        },
    });
    const raw = await rawConversation(page);
    expect(raw.calls).toHaveLength(0);
    expect(requests).toHaveLength(1);
    expect(JSON.parse(raw.text).timeline.instructions[0].addEntries.entries.map(e => e.entryId)).toContain("cursor-bottom-BOTTOM1");
});
