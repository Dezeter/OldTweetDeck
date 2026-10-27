// Loads all replies in the tweet detail view. TweetDeck reads only the first page of
// /2/timeline/conversation and skips its cursors: the next page and the replies X hides behind
// "Show more replies" / "Show probable spam". This follows them and hands TweetDeck one merged response.
// Loaded by injection.js after interception.js and otd-common.js, and builds on interception.js's route.
// Switch "loadAllReplies".
(() => {
    if(!OTD.isOn("loadAllReplies")) return;
    if(typeof proxyRoutes === "undefined") return;

    const route = proxyRoutes.find(r => r && r.path instanceof RegExp && r.path.source.includes("timeline\\/conversation"));
    // upstream handling it on its own one day means this is no longer needed
    if(!route || route.openHandler || route.sendHandler) return;

    const MAX_EXTRA_PAGES = 3;
    // TweetDeck asks for an open conversation again every minute; following its cursors every time would spend
    // X's rate limit four times as fast, so the extra pages are kept for a while and only the first is asked for
    const EXTRA_PAGES_FOR = 5 * 60 * 1000;
    const extraPages = new Map();

    const cursorOf = entry => entry.content?.operation?.cursor;
    const addEntriesOf = data => data?.timeline?.instructions?.find(i => i.addEntries)?.addEntries;
    const report = entry => document.dispatchEvent(new CustomEvent("otd-diagnostic", { detail: JSON.stringify({ kind: "response", method: "GET", ...entry }) }));

    async function getPage(url, headers, retry = true) {
        const h = { ...headers };
        if(localStorage.device_id) h["X-Client-UUID"] = localStorage.device_id;
        const path = new URL(url).pathname;
        if(typeof solveChallenge === "function") {
            try {
                h["x-client-transaction-id"] = await solveChallenge(path, "GET");
            } catch(e) {
                console.warn("[otd-replies] challenge error", e);
            }
        }
        let result;
        try {
            const res = await fetch(url, { headers: h, credentials: "include" });
            result = { ok: res.ok, status: res.status, text: await res.text() };
        } catch(e) {
            // a network error, or an answer without CORS headers (X's own errors sometimes come like that)
            result = { ok: false, status: 0, text: "", error: String(e) };
        }
        report({ url: url.split("?")[0], status: result.status, error: result.error });
        // nothing at all is no answer: once more, with a new transaction id
        const broken = !result.text || result.status >= 500;
        if(broken && retry && result.status !== 429) {
            await OTD.sleep(1000);
            return getPage(url, headers, false);
        }
        if(!result.ok || !result.text) console.warn(`[otd-replies] X answered ${result.status || result.error} to ${path}${result.text ? "" : " with nothing"}`);
        return result;
    }

    async function loadConversation(url, headers) {
        const first = await getPage(url, headers);
        let data;
        try {
            data = JSON.parse(first.text);
        } catch(e) {
            return { ...first, ok: false };
        }
        const base = addEntriesOf(data);
        if(!first.ok || !base || !data.globalObjects) return first;

        const seen = new Set(base.entries.map(e => e.entryId));
        const nextCursor = () => base.entries.findIndex(e => e.entryId.startsWith("cursor-") && !e.entryId.startsWith("cursor-top") && cursorOf(e)?.value);
        // a page's tweets, users and new entries, in place of the cursor that led to it, so "show more"
        // replies come after the ranked ones as on x.com
        const insert = (at, page) => {
            data.globalObjects.tweets = Object.assign(data.globalObjects.tweets || {}, page.tweets);
            data.globalObjects.users = Object.assign(data.globalObjects.users || {}, page.users);
            const fresh = page.entries.filter(e => !seen.has(e.entryId) && !e.entryId.startsWith("cursor-top"));
            fresh.forEach(e => seen.add(e.entryId));
            base.entries.splice(at, 0, ...fresh);
        };
        const merged = () => ({ ok: true, status: first.status, text: JSON.stringify(data) });

        const kept = extraPages.get(url);
        if(kept && Date.now() - kept.at < EXTRA_PAGES_FOR) {
            const at = nextCursor();
            if(at !== -1) {
                base.entries.splice(at, 1);
                insert(at, kept);
            }
            return merged();
        }

        const firstPage = new Set(seen);
        const extra = { at: Date.now(), tweets: {}, users: {}, entries: [] };
        let complete = true;
        for(let page = 0; page < MAX_EXTRA_PAGES; page++) {
            const at = nextCursor();
            if(at === -1) break;
            const [cursorEntry] = base.entries.splice(at, 1);

            const next = new URL(url);
            next.searchParams.set("cursor", cursorOf(cursorEntry).value);
            let more;
            try {
                const res = await getPage(next.toString(), headers);
                if(!res.ok) throw res.status;
                more = JSON.parse(res.text);
            } catch(e) {
                complete = false;
                break;
            }
            const found = { tweets: more.globalObjects?.tweets || {}, users: more.globalObjects?.users || {}, entries: addEntriesOf(more)?.entries || [] };
            Object.assign(extra.tweets, found.tweets);
            Object.assign(extra.users, found.users);
            insert(at, found);
        }
        // what the extra pages added, without the cursors that were followed
        extra.entries = base.entries.filter(e => !firstPage.has(e.entryId));
        if(complete && extra.entries.length) {
            for(const [key, value] of extraPages) if(Date.now() - value.at >= EXTRA_PAGES_FOR) extraPages.delete(key);
            extraPages.set(url, extra);
        }
        return merged();
    }

    // emulateResponse from interception.js, with a status
    function respond(xhr, status) {
        xhr._status = status;
        xhr._readyState = 4;
        xhr.responseHeaderOverride = { "content-type": () => "application/json" };
        const loadEvent = new ProgressEvent("load");
        if(xhr.onload) xhr.onload(loadEvent);
        if(xhr.onloadend) xhr.onloadend(loadEvent);
        if(xhr.onreadystatechange) xhr.onreadystatechange(new Event("readystatechange"));
    }

    // Both handlers have to be set: the request is never opened, everything goes through fetch.
    route.openHandler = () => {};
    route.sendHandler = async xhr => {
        let result;
        try {
            result = await loadConversation(xhr.modUrl, xhr.modReqHeaders);
        } catch(e) {
            console.warn("[otd-replies]", e);
            result = { ok: false, status: 0, text: "", error: String(e) };
        }
        const status = result.ok ? 200 : result.status && result.status !== 200 ? result.status : 502;
        // TweetDeck reads an error as JSON too; X's own error when there is one
        let text = result.text;
        if(!result.ok) {
            try {
                JSON.parse(text);
            } catch(e) {
                text = JSON.stringify({ errors: [{ code: status, message: result.error || `X answered ${status}${text ? "" : " with nothing"}` }] });
            }
        }
        xhr.storage.otdConversation = text;
        respond(xhr, status);
    };

    // the upstream afterRequest still normalizes the response, it just gets the merged one
    const afterRequest = route.afterRequest;
    route.afterRequest = xhr => afterRequest("otdConversation" in xhr.storage
        ? { responseText: xhr.storage.otdConversation, storage: xhr.storage }
        : xhr);
})();
