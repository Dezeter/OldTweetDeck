// Loads all replies in the tweet detail view. TweetDeck reads only the first page of
// /2/timeline/conversation and skips its cursors: the next page and the replies X hides behind
// "Show more replies" / "Show probable spam". This follows them and hands TweetDeck one merged response.
// Loaded by injection.js after interception.js and builds on its route, which is fetched from upstream.
//   localStorage.OTDloadAllReplies = "0"  turns it off
(() => {
    if(localStorage.OTDloadAllReplies === "0") return;
    if(typeof proxyRoutes === "undefined") return;

    const route = proxyRoutes.find(r => r && r.path instanceof RegExp && r.path.source.includes("timeline\\/conversation"));
    // upstream handling it on its own one day means this is no longer needed
    if(!route || route.openHandler || route.sendHandler) return;

    // the detail view polls every 60 seconds, each extra page is one more request per poll
    const MAX_EXTRA_PAGES = 3;

    const cursorOf = entry => entry.content?.operation?.cursor;
    const addEntriesOf = data => data?.timeline?.instructions?.find(i => i.addEntries)?.addEntries;

    async function getPage(url, headers) {
        const h = { ...headers };
        if(localStorage.device_id) h["X-Client-UUID"] = localStorage.device_id;
        if(typeof solveChallenge === "function") {
            try {
                h["x-client-transaction-id"] = await solveChallenge(new URL(url).pathname, "GET");
            } catch(e) {
                console.warn("[otd-replies] challenge error", e);
            }
        }
        const res = await fetch(url, { headers: h, credentials: "include" });
        return { ok: res.ok, status: res.status, text: await res.text() };
    }

    async function loadConversation(url, headers) {
        const first = await getPage(url, headers);
        if(!first.ok) return first;

        let data;
        try {
            data = JSON.parse(first.text);
        } catch(e) {
            return first;
        }
        const base = addEntriesOf(data);
        if(!base || !data.globalObjects) return first;

        const seen = new Set(base.entries.map(e => e.entryId));
        for(let page = 0; page < MAX_EXTRA_PAGES; page++) {
            const at = base.entries.findIndex(e => e.entryId.startsWith("cursor-") && !e.entryId.startsWith("cursor-top") && cursorOf(e)?.value);
            if(at === -1) break;
            const [cursorEntry] = base.entries.splice(at, 1);

            const next = new URL(url);
            next.searchParams.set("cursor", cursorOf(cursorEntry).value);
            let more;
            try {
                const res = await getPage(next.toString(), headers);
                if(!res.ok) break;
                more = JSON.parse(res.text);
            } catch(e) {
                break;
            }

            data.globalObjects.tweets = Object.assign(data.globalObjects.tweets || {}, more.globalObjects?.tweets);
            data.globalObjects.users = Object.assign(data.globalObjects.users || {}, more.globalObjects?.users);
            // in place of the cursor, so "show more" replies come after the ranked ones as on x.com
            const fresh = (addEntriesOf(more)?.entries || []).filter(e => !seen.has(e.entryId) && !e.entryId.startsWith("cursor-top"));
            fresh.forEach(e => seen.add(e.entryId));
            base.entries.splice(at, 0, ...fresh);
        }
        return { ok: true, status: first.status, text: JSON.stringify(data) };
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
            result = { ok: false, status: 0, text: "" };
        }
        xhr.storage.otdConversation = result.text;
        respond(xhr, result.ok ? 200 : result.status || 500);
    };

    // the upstream afterRequest still normalizes the response, it just gets the merged one
    const afterRequest = route.afterRequest;
    route.afterRequest = xhr => afterRequest("otdConversation" in xhr.storage
        ? { responseText: xhr.storage.otdConversation, storage: xhr.storage }
        : xhr);
})();
