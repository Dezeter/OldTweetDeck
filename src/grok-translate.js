// Automatic translation of tweets through Grok, the same endpoint x.com uses for "Show translation".
// Loaded by injection.js after otd-common.js. Switch "grokTranslate", target language OTD.targetLang().
(() => {
    if(!OTD.isOn("grokTranslate")) return;

    const DST_LANG = OTD.targetLang();
    const DELAY_MS = 600;     // pause between requests
    const MAX_PER_MIN = 20;   // soft cap, X's rate limit is shared with the rest of the session
    const DWELL_MS = 700;     // a tweet is translated only if it stayed on screen this long
    const MAX_FAILS = 3;
    const CACHE_MAX = 1000;   // lives in the same localStorage as OTD state, so keep it small
    const CACHE_DAYS = 7;

    const ENDPOINT_PATH = "/2/grok/translation.json";
    const ENDPOINT = `https://api.${location.hostname}${ENDPOINT_PATH}`;

    const LABELS = {
        ru: { original: "Показать оригинал", translation: "Показать перевод" },
        en: { original: "Show original", translation: "Show translation" },
    };
    const LABEL = OTD.label(LABELS, DST_LANG);

    // X's language codes for tweets without linguistic content (media only, hashtags only, etc.)
    const NO_TEXT_LANGS = ["zxx", "qme", "qam", "qct", "qht", "qst", "art"];
    // When TweetDeck gives no lang (quoted tweets) or "und", guess by script
    const CYRILLIC_LANGS = ["ru", "uk", "be", "bg", "sr", "mk", "kk"];

    const sleep = OTD.sleep;

    const cache = (() => {
        const KEY = `OTDgrokCache_${DST_LANG}`;
        let map = new Map();
        try {
            const now = Date.now(), ttl = CACHE_DAYS * 864e5;
            for(const [id, v] of JSON.parse(localStorage.getItem(KEY) || "[]")) {
                if(now - v.t < ttl) map.set(id, v);
            }
        } catch(e) {
            console.warn("[grok-tr] broken cache, starting empty", e);
        }

        let timer = null;
        const save = () => {
            if(timer) return;
            timer = setTimeout(() => {
                timer = null;
                const entries = [...map].slice(-CACHE_MAX);
                map = new Map(entries);
                try {
                    localStorage.setItem(KEY, JSON.stringify(entries));
                } catch(e) {
                    // never let the cache take the space OTD needs for columns and feeds
                    localStorage.removeItem(KEY);
                }
            }, 3000);
        };

        return {
            has: id => map.has(id),
            get: id => map.get(id)?.text,
            set: (id, text) => { map.delete(id); map.set(id, { text, t: Date.now() }); save(); },
        };
    })();

    let pauseUntil = 0;
    let backoffMs = 60000;
    const fails = new Map();
    const queue = [];
    let stamps = [];
    let draining = false;

    // --- what to translate ---------------------------------------------------
    // A unit is a tweet text with its id: the main text of a stream item, or the text of a quoted tweet.
    function collectUnits() {
        const units = [];
        for(const item of document.querySelectorAll("article.js-stream-item[data-tweet-id]")) {
            const id = item.dataset.tweetId;
            if(!/^\d+$/.test(id)) continue;
            const text = [...item.querySelectorAll(".js-tweet-text")].find(el =>
                el.closest("article.js-stream-item") === item && !el.closest(".js-quote-detail")
            );
            if(text) units.push({ host: item, text, id });
        }
        for(const quote of document.querySelectorAll(".js-quote-detail[data-tweet-id]")) {
            const id = quote.dataset.tweetId;
            const text = quote.querySelector(".js-quoted-tweet-text");
            if(/^\d+$/.test(id) && text) units.push({ host: quote, text, id });
        }
        return units;
    }

    function needsTranslation(el) {
        const lang = (el.getAttribute("lang") || "").toLowerCase();
        if(NO_TEXT_LANGS.includes(lang)) return false;
        if(lang && lang !== "und") return lang.split("-")[0] !== DST_LANG;

        const letters = (el.textContent || "").replace(/[^\p{L}]/gu, "");
        if(letters.length < 3) return false;
        if(CYRILLIC_LANGS.includes(DST_LANG)) {
            const cyr = (letters.match(/[Ѐ-ӿ]/g) || []).length;
            return cyr / letters.length < 0.5;
        }
        return true;
    }

    function onScreen(el) {
        const r = el.getBoundingClientRect();
        if(r.height === 0 || r.bottom <= 0 || r.top >= innerHeight || r.right <= 0 || r.left >= innerWidth) return false;
        // columns scroll on their own, the window doesn't
        const scroller = el.closest(".column-scroller");
        if(!scroller) return true;
        const b = scroller.getBoundingClientRect();
        return r.bottom > b.top && r.top < b.bottom && r.right > b.left && r.left < b.right;
    }

    // --- request --------------------------------------------------------------
    // The response is a stream of JSON objects, one per token; split them by braces rather than newlines,
    // since several objects can arrive on one line.
    function parseStream(raw) {
        let text = "", depth = 0, start = -1, inStr = false, esc = false, bad = 0;
        for(let i = 0; i < raw.length; i++) {
            const c = raw[i];
            if(inStr) {
                if(esc) esc = false;
                else if(c === "\\") esc = true;
                else if(c === '"') inStr = false;
                continue;
            }
            if(c === '"') inStr = true;
            else if(c === "{") { if(depth++ === 0) start = i; }
            else if(c === "}" && depth > 0 && --depth === 0) {
                try { text += JSON.parse(raw.slice(start, i + 1)).result?.text ?? ""; }
                catch(e) { bad++; }
            }
        }
        return { text, bad, open: depth !== 0 };
    }

    // tweet text comes back HTML-escaped (&gt; &amp;), a textarea decodes it without running markup
    const decoder = document.createElement("textarea");
    function decodeEntities(s) {
        decoder.innerHTML = s;
        return decoder.value;
    }

    async function translate(id, retry = false) {
        if(!retry && cache.has(id)) return cache.get(id);

        const headers = await OTD.xHeaders(ENDPOINT_PATH, "POST", {
            "x-twitter-client-language": DST_LANG,
            "content-type": "text/plain;charset=UTF-8",
        });

        const res = await fetch(ENDPOINT, {
            method: "POST",
            credentials: "include",
            headers,
            body: JSON.stringify({ content_type: "POST", dst_lang: DST_LANG, id }),
        });

        const raw = await res.text();
        // the rate limit sometimes comes as code 88 in the body instead of a 429
        if(!res.ok || /"code"\s*:\s*88\b/.test(raw)) {
            const err = new Error(`HTTP ${res.status}`);
            err.status = res.ok ? 429 : res.status;
            err.reset = Number(res.headers.get("x-rate-limit-reset")) || 0;
            throw err;
        }

        const { text, bad, open } = parseStream(raw);
        // a broken chunk is lost words, ask once more
        if((bad || open) && !retry) return translate(id, true);
        if(bad || open) console.warn(`[grok-tr] ${id}: response is still broken`, raw);
        if(!text.trim()) throw new Error("empty translation");

        const out = decodeEntities(text);
        cache.set(id, out);
        return out;
    }

    // --- rendering ------------------------------------------------------------
    // as cashtags.js finds it: the chain and the contract, or "native" for the chain's own coin
    const TOKEN_ID = "[a-z][a-z0-9_-]{1,20}:(?:0x[0-9a-fA-F]{40}|[1-9A-HJ-NP-Za-km-z]{32,44}|native)";
    const SPLIT_RE = new RegExp(`(${TOKEN_ID}|https?:\\/\\/\\S+|@\\w{1,15}|#[\\p{L}\\p{N}_]+|\\$[A-Za-z][A-Za-z0-9_]{0,14})`, "gu");
    const IS_TOKEN = new RegExp(`^${TOKEN_ID}$`);
    const IS_LINK = new RegExp(`^(?:${TOKEN_ID}|https?:\\/\\/|@|#|\\$[A-Za-z])`, "u");

    // Anchors of the original by visible text and by href: Grok returns raw t.co links,
    // while TweetDeck shows them shortened, so only the href matches.
    function linkIndex(orig) {
        const map = new Map();
        const put = (key, a) => { if(key) map.set(key.trim().toLowerCase(), a); };
        for(const a of orig.querySelectorAll("a")) {
            put(a.textContent, a);
            const href = a.getAttribute("href") || "";
            put(href, a);
            put(href.replace(/^https?:\/\//, ""), a);
        }
        return map;
    }

    function externalLink(url, text) {
        const a = document.createElement("a");
        a.href = url;
        a.textContent = text;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        return a;
    }

    // Cloned anchors keep TweetDeck's classes and data attributes, so its click handlers
    // (profile popups, hashtag search) keep working on the translation.
    function fillInline(node, text, ctx) {
        for(const part of text.split(SPLIT_RE)) {
            if(!part) continue;
            if(!IS_LINK.test(part)) { node.append(part); continue; }

            if(IS_TOKEN.test(part)) {
                // on-chain cashtags come back as "chain:contract", put the original cashtag back: the one for this
                // token (cashtags.js keeps its id), not another cashtag of the text; without it, the id. Else by
                // the contract; not for a chain's own coin, which is "native" on every chain
                const id = part.toLowerCase();
                const addr = id.slice(id.indexOf(":") + 1);
                const free = ctx.cash.filter(a => !ctx.cashUsed.has(a));
                const src = free.find(a => (a.dataset.otdToken || "").toLowerCase() === id)
                    || (addr !== "native" && free.find(a => `${a.dataset.otdToken || ""} ${a.getAttribute("href") || ""}`.toLowerCase().includes(addr)));
                if(src) { ctx.cashUsed.add(src); node.append(src.cloneNode(true)); }
                else node.append(part);
                continue;
            }

            if(/^https?:/i.test(part)) {
                // trailing punctuation isn't part of the url
                const [, url, trail] = part.match(/^(.*?)([.,!?;:)\]»"'…]*)$/);
                const key = url.toLowerCase();
                // the translator keeps links in order, so the n-th link is the n-th link of the original
                const src = ctx.links.get(key) || ctx.links.get(key.replace(/^https?:\/\//, "")) || ctx.ext[ctx.urlIdx];
                ctx.urlIdx++;
                if(src) node.append(src.cloneNode(true));
                // an unmatched t.co is a media link TweetDeck hides from the text
                else if(!/^https?:\/\/t\.co\//i.test(url)) node.append(externalLink(url, url));
                if(trail) node.append(trail);
                continue;
            }

            // mentions, hashtags, cashtags
            const src = ctx.links.get(part.trim().toLowerCase());
            if(src) { ctx.cashUsed.add(src); node.append(src.cloneNode(true)); continue; }
            const name = encodeURIComponent(part.slice(1));
            node.append(externalLink(
                part.startsWith("@") ? `https://${location.hostname}/${name}` :
                part.startsWith("$") ? `https://${location.hostname}/search?q=%24${name}&src=cashtag_click` :
                `https://${location.hostname}/hashtag/${name}`,
                part
            ));
        }
    }

    function buildNode(orig, text) {
        // an empty clone of the original keeps TweetDeck's typography
        const node = orig.cloneNode(false);
        node.classList.remove("js-tweet-text", "js-quoted-tweet-text", "otd-grok-orig");
        node.classList.add("otd-grok-tr");
        node.setAttribute("lang", DST_LANG);

        const anchors = [...orig.querySelectorAll("a")];
        const ctx = {
            links: linkIndex(orig),
            ext: anchors.filter(a => /^https?:/i.test(a.getAttribute("href") || "") && !/^[@#$]/.test(a.textContent.trim())),
            urlIdx: 0,
            cash: anchors.filter(a => /^\$/.test(a.textContent.trim())),
            cashUsed: new Set(),
        };
        // Paragraphs become blocks with a small gap. With pre-wrap every \n\n would be a whole
        // empty line, and its height can't be reduced separately from the text.
        for(const para of text.split(/\n{2,}/)) {
            if(!para.trim()) continue;
            const block = document.createElement("span");
            block.className = "otd-grok-para";
            fillInline(block, para, ctx);
            node.append(block);
        }
        return node;
    }

    // Material "translate" icon, Apache 2.0
    const ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12.87 15.07l-2.54-2.51.03-.03c1.74-1.94 2.98-4.17 3.71-6.53H17V4h-7V2H8v2H1v1.99h11.17C11.5 7.92 10.44 9.75 9 11.35 8.07 10.32 7.3 9.19 6.69 8h-2c.73 1.63 1.73 3.17 2.98 4.56l-5.09 5.02L4 19l5-5 3.11 3.11.76-2.04zM18.5 10h-2L12 22h2l1.12-3h4.75L21 22h2l-4.5-12zm-2.62 7l1.62-4.33L19.12 17h-3.24z"/></svg>';

    // stream items and quotes are clickable and draggable as a whole
    function onActivate(el, handler) {
        const stop = e => { e.preventDefault(); e.stopPropagation(); };
        el.addEventListener("mousedown", stop);
        el.addEventListener("click", e => { stop(e); handler(); });
    }

    // Original or translation is a class on the host, so one toggle switches
    // the tweet and its quote together. CSS does the hiding.
    function toggle(host) {
        const original = host.classList.toggle("otd-grok-original");
        const label = original ? LABEL.translation : LABEL.original;
        for(const a of host.querySelectorAll(".otd-grok-action > a")) a.title = label;
        for(const a of host.querySelectorAll(".otd-grok-toggle")) a.textContent = `Grok · ${label}`;
    }

    const currentLabel = host => host.classList.contains("otd-grok-original") ? LABEL.translation : LABEL.original;

    function buildAction(row, host) {
        const detail = row.classList.contains("tweet-detail-actions");
        const li = document.createElement("li");
        li.className = `${detail ? "tweet-detail-action-item" : "tweet-action-item pull-left margin-r--10"} otd-grok-action`;
        const a = document.createElement("a");
        a.href = "#";
        a.className = detail ? "tweet-detail-action" : "tweet-action";
        a.title = currentLabel(host);
        a.innerHTML = `<i class="icon txt-center otd-grok-icon">${ICON}</i>`;
        onActivate(a, () => toggle(host));
        li.append(a);
        return li;
    }

    function buildToggle(host) {
        const a = document.createElement("a");
        a.href = "#";
        a.className = "otd-grok-toggle txt-mute";
        a.textContent = `Grok · ${currentLabel(host)}`;
        onActivate(a, () => toggle(host));
        return a;
    }

    // Puts the toggle into the stream item's action row, next to reply/retweet/like.
    // Called on every scan, since TweetDeck can re-render the row.
    function ensureToggle(unit) {
        const item = unit.host.closest("article.js-stream-item");
        const host = item || unit.host;
        host.classList.add("otd-grok-translated");

        const row = item && [...item.querySelectorAll("ul.js-tweet-actions, ul.tweet-detail-actions")]
            .find(ul => ul.closest("article.js-stream-item") === item);
        if(row) {
            if(row.querySelector(":scope > .otd-grok-action")) return;
            // detail rows give each item a fixed width share, room is made in CSS
            row.classList.add("otd-grok-row");
            const more = row.querySelector(':scope > li > a[rel="actionsMenu"]')?.parentElement;
            const action = buildAction(row, host);
            if(more) more.before(action);
            else row.append(action);
            return;
        }

        // no action row (a quote in the composer), fall back to a link under the translation
        const tr = unit.text.nextElementSibling;
        if(tr?.classList.contains("otd-grok-tr") && !tr.nextElementSibling?.classList.contains("otd-grok-toggle")) {
            tr.after(buildToggle(host));
        }
    }

    // the node got reused for another tweet, remove our previous output
    function cleanup(unit) {
        const { text: orig } = unit;
        let next = orig.nextElementSibling;
        while(next && (next.classList.contains("otd-grok-tr") || next.classList.contains("otd-grok-toggle"))) {
            next.remove();
            next = orig.nextElementSibling;
        }
        orig.classList.remove("otd-grok-orig");
        delete orig.dataset.otdGrok;
        delete orig.dataset.otdGrokDone;
    }

    function render(unit, text) {
        const { text: orig, id } = unit;
        if(!text || !orig.isConnected || orig.dataset.otdGrok !== id || orig.dataset.otdGrokDone === id) return;
        orig.dataset.otdGrokDone = id;
        // Grok echoes text that is already in the target language
        if(text.trim() === orig.textContent.trim()) return;

        orig.after(buildNode(orig, text));
        orig.classList.add("otd-grok-orig");
        ensureToggle(unit);
    }

    // --- queue ----------------------------------------------------------------
    function underLimit() {
        const now = Date.now();
        stamps = stamps.filter(t => now - t < 60000);
        return stamps.length < MAX_PER_MIN;
    }

    // a tweet that didn't get its turn goes back to the scanner for the next time it's on screen
    function release(unit) {
        if(unit.text.dataset.otdGrok === unit.id) delete unit.text.dataset.otdGrok;
    }

    async function drain() {
        if(draining) return;
        draining = true;

        try {
            while(queue.length) {
                const wait = pauseUntil - Date.now();
                if(wait > 0) { await sleep(Math.min(wait, 5000)); continue; }
                if(!underLimit()) { await sleep(5000); continue; }

                const unit = queue.shift();
                if(!unit.text.isConnected) continue;

                // don't spend requests on tweets that were only scrolled past
                const dwell = DWELL_MS - (Date.now() - unit.at);
                if(dwell > 0) await sleep(dwell);
                if(!onScreen(unit.host)) { release(unit); continue; }

                try {
                    if(!cache.has(unit.id)) stamps.push(Date.now());
                    render(unit, await translate(unit.id));
                    backoffMs = 60000;
                } catch(e) {
                    if(e.status === 429) {
                        // keep hammering and X extends the block for the whole session, wait for the reset
                        pauseUntil = e.reset ? e.reset * 1000 + 2000 : Date.now() + backoffMs;
                        backoffMs = Math.min(backoffMs * 2, 15 * 60000);
                        queue.unshift(unit);
                        console.warn(`[grok-tr] rate limited until ${new Date(pauseUntil).toLocaleTimeString()}`);
                        continue;
                    }
                    const n = (fails.get(unit.id) || 0) + 1;
                    fails.set(unit.id, n);
                    if(n < MAX_FAILS) release(unit);
                    console.warn("[grok-tr]", unit.id, e.message);
                }
                await sleep(DELAY_MS);
            }
        } finally {
            draining = false;
        }
    }

    // --- scanner --------------------------------------------------------------
    function scan() {
        for(const unit of collectUnits()) {
            const { text, id } = unit;
            const claimed = text.dataset.otdGrok;
            if(claimed === id) {
                if(text.classList.contains("otd-grok-orig")) ensureToggle(unit);
                continue;
            }
            if(claimed) cleanup(unit);
            if(!needsTranslation(text)) continue;

            // cached ones cost nothing, render them even off screen
            if(cache.has(id)) {
                text.dataset.otdGrok = id;
                render(unit, cache.get(id));
                continue;
            }
            if(!onScreen(unit.host)) continue;
            text.dataset.otdGrok = id;
            unit.at = Date.now();
            queue.push(unit);
        }
        drain();
    }

    OTD.addStyle(`
        .otd-grok-translated:not(.otd-grok-original) .otd-grok-orig,
        .otd-grok-original .otd-grok-tr { display: none !important; }
        .otd-grok-translated .js-translate-call-to-action { display: none; }
        .otd-grok-para { display: block; }
        .otd-grok-para + .otd-grok-para { margin-top: 0.45em; }
        .otd-grok-icon svg { display: block; width: 100%; height: 100%; }
        .otd-grok-original .otd-grok-icon,
        .otd-grok-action > a:hover .otd-grok-icon { color: var(--otd-accent, #1da1f2); }
        /* !important: the dark theme repeats every TweetDeck rule under html.dark, which outranks these */
        .tweet-detail-actions.otd-grok-row { display: flex !important; }
        .tweet-detail-actions.otd-grok-row > .tweet-detail-action-item { flex: 1 1 0; width: auto !important; }
        .otd-grok-toggle { display: inline-block; margin-top: 4px; font-size: 12px; }
        .otd-grok-toggle:hover { text-decoration: underline; }
    `);

    const schedule = OTD.watch(scan);
    // scroll doesn't bubble, columns scroll on their own elements
    document.addEventListener("scroll", schedule, { capture: true, passive: true });

    console.log(`[grok-tr] active, dst=${DST_LANG}`);
})();
