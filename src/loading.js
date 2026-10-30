// What a column shows before its tweets: grey shapes of tweets while it loads instead of TweetDeck's "Loading…"
// (still there for screen readers); "X didn't answer" with a button to try again when the load failed, which
// TweetDeck leaves as "Loading…" for good; and for an empty column a plain message in the reader's language with
// what to do: a search's options, or a refresh. Loaded by injection.js after otd-common.js. Switch "skeletons",
// the shapes go and come without a reload.
(() => {
    OTD.htmlClassWhileOn("skeletons", "otd-skeletons");

    const L = OTD.label({
        ru: { failed: "X не ответил", slow: "X отвечает слишком долго", failedHint: "Колонка не загрузилась. Обычно помогает ещё одна попытка.", retry: "Повторить",
            empty: "Здесь пока пусто", emptyHint: "Новые твиты появятся здесь сами.", searchHint: "По этому запросу твитов нет. Можно поменять запрос или фильтры.",
            refresh: "Обновить", options: "Настройки колонки" },
        en: { failed: "X didn't answer", slow: "X is taking too long", failedHint: "The column didn't load. Another try usually helps.", retry: "Try again",
            empty: "Nothing here yet", emptyHint: "New tweets will show up here by themselves.", searchHint: "No tweets for this search. You can change the search or its filters.",
            refresh: "Refresh", options: "Column options" },
    });
    // a load TweetDeck gave up on is back to waiting; one still going counts as failed after a while too
    const FAILED_AFTER = 8000;
    const SLOW_AFTER = 30000;

    const columnOf = el => {
        const key = el.closest("[data-column]")?.dataset.column;
        try {
            return key ? TD.controller.columnManager.get(key) : null;
        } catch(e) {
            return null;
        }
    };
    function el(tag, className, text) {
        const node = document.createElement(tag);
        if(className) node.className = className;
        if(text !== undefined) node.textContent = text;
        return node;
    }
    // a title, a hint and a button in place of TweetDeck's text
    function message(target, title, hint, button, action) {
        const box = el("div", "otd-column-state");
        const go = el("button", "otd-column-state-action Button--primary", button);
        go.type = "button";
        go.addEventListener("click", e => {
            e.stopPropagation();
            action();
        });
        box.append(el("p", "otd-column-state-title", title), el("p", "otd-column-state-hint", hint), go);
        target.replaceChildren(box);
    }

    const seen = new WeakMap();
    function scan() {
        if(!OTD.isOn("skeletons")) return;
        const now = Date.now();
        for(const holder of document.querySelectorAll(".js-chirp-container > .js-column-loading-placeholder:not(.otd-failed)")) {
            if(!seen.has(holder)) seen.set(holder, now);
            const column = columnOf(holder);
            const age = now - seen.get(holder);
            const failed = column?.state === "awaiting_backfill" && age > FAILED_AFTER;
            if(!failed && age <= SLOW_AFTER) continue;
            holder.classList.add("otd-failed");
            // TweetDeck takes the placeholder away once tweets come, this message with it
            message(holder, failed ? L.failed : L.slow, L.failedHint, L.retry, () => {
                holder.classList.remove("otd-failed");
                holder.replaceChildren(el("p", null, "…"));
                seen.set(holder, Date.now());
                const again = columnOf(holder);
                if(!again?.backfill) return;
                // a load still going after this long is as good as failed
                again.state = "awaiting_backfill";
                again.backfill();
            });
        }
        for(const empty of document.querySelectorAll(".js-chirp-container > .list-placeholder:not(.js-column-loading-placeholder):not([data-otd-empty])")) {
            empty.dataset.otdEmpty = "";
            const cell = empty.querySelector(".l-cell");
            // a collection's "drag tweets here" stays
            if(!cell || cell.querySelector(".icon-move")) continue;
            const section = empty.closest("section.js-column");
            const options = section?.querySelector('[data-action="options"]');
            // TweetDeck's template has the callout in search columns only
            if(section?.querySelector(".js-search-filter-callout") && options) message(cell, L.empty, L.searchHint, L.options, () => options.click());
            else message(cell, L.empty, L.emptyHint, L.refresh, () => columnOf(empty)?.reloadTweets?.());
        }
    }
    OTD.watch(scan);

    OTD.addStyle(`
        /* five tweets: an avatar and three lines each, pulsing */
        html.otd-skeletons .js-chirp-container > .js-column-loading-placeholder:not(.otd-failed) {
            --otd-sk: #eff3f4; position: relative; height: 460px; padding: 0; overflow: hidden; text-shadow: none;
            background-image:
                radial-gradient(circle at 18px 18px, var(--otd-sk) 17.5px, transparent 18px),
                linear-gradient(var(--otd-sk) 10px, transparent 10px),
                linear-gradient(var(--otd-sk) 9px, transparent 9px),
                linear-gradient(var(--otd-sk) 9px, transparent 9px),
                linear-gradient(#e1e8ed 1px, transparent 1px);
            background-size: 36px 92px, 34% 92px, calc(100% - 66px) 92px, 58% 92px, 100% 92px;
            background-position: 10px 10px, 56px 12px, 56px 34px, 56px 52px, 0 91px;
            background-repeat: repeat-y;
            animation: otd-skeleton 1.4s ease-in-out infinite;
        }
        html.dark.otd-skeletons .js-chirp-container > .js-column-loading-placeholder:not(.otd-failed) { --otd-sk: var(--otd-raised-solid, #22303c); background-image:
            radial-gradient(circle at 18px 18px, var(--otd-sk) 17.5px, transparent 18px), linear-gradient(var(--otd-sk) 10px, transparent 10px),
            linear-gradient(var(--otd-sk) 9px, transparent 9px), linear-gradient(var(--otd-sk) 9px, transparent 9px), linear-gradient(var(--otd-line, #000) 1px, transparent 1px); }
        /* "Loading…" for screen readers only */
        html.otd-skeletons .js-chirp-container > .js-column-loading-placeholder:not(.otd-failed) > p {
            position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap;
        }
        @keyframes otd-skeleton { 50% { opacity: .55; } }

        /* :root over TweetDeck's html.dark rules for paragraphs and buttons */
        :root .otd-column-state { padding: 40px 24px; text-align: center; text-shadow: none; }
        :root .otd-column-state > p.otd-column-state-title { margin: 0 0 6px; font-size: 17px; font-weight: 700; line-height: 1.3; color: #0f1419; }
        :root.dark .otd-column-state > p.otd-column-state-title { color: var(--otd-text, #f7f9f9); }
        :root .otd-column-state > p.otd-column-state-hint { margin: 0 0 16px; font-size: 14px; line-height: 1.4; color: #536471; }
        :root.dark .otd-column-state > p.otd-column-state-hint { color: var(--otd-text-2, #8b98a5); }
        :root .otd-column-state > button.otd-column-state-action { height: auto; padding: 8px 18px; border-radius: 999px; font-size: 14px; font-weight: 700; line-height: 1.2; }
    `);
})();
