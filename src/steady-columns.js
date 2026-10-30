// What you're reading in a column stays in place when TweetDeck adds or drops tweets above it:
// - TweetDeck keeps a column to 40 tweets: past them, every page of older tweets (20) it loads at the bottom drops
//   as many at the top. 200 here, so a column scrolled down drops tweets far less often;
// - for a change above what's on the screen TweetDeck puts the column back by the change of its height, from the
//   scroll position it last heard of. Out of date by a scroll it hasn't heard of yet (the browser tells it in the
//   next frame, Firefox's later when it scrolls on its own), and where the browser doesn't keep the position
//   itself (Firefox gives up on that for a column after too many changes), that threw the column hundreds of
//   pixels, hours of tweets, or to its top. After TweetDeck's own, the first of the tweets that were on the screen
//   and still are is put back where it was.
// Loaded by injection.js after otd-common.js. Switch "steadyColumns".
(() => {
    if(!OTD.isOn("steadyColumns")) return;
    const columns = window.TD?.ui?.columns;
    if(typeof columns?.cacheColumnScrollPosition !== "function") return;

    const LIMIT = 200;
    // TweetDeck's column sets it on itself when it's made: a setter that keeps this one
    if(window.TD.vo?.Column?.prototype) {
        Object.defineProperty(window.TD.vo.Column.prototype, "TARGET_COLUMN_CHIRP_LIMIT", { configurable: true, get: () => LIMIT, set() {} });
    }

    // the tweets on the screen, from the top, and where they are
    function onScreen(scroller) {
        const { top, bottom } = scroller.getBoundingClientRect();
        const seen = [];
        for(const item of scroller.querySelectorAll(".js-chirp-container > .js-stream-item")) {
            const box = item.getBoundingClientRect();
            if(box.top >= bottom) break;
            if(box.height && box.bottom > top + 1) seen.push({ item, top: box.top });
        }
        return seen;
    }
    const cache = columns.cacheColumnScrollPosition;
    columns.cacheColumnScrollPosition = function(key) {
        const restore = cache.apply(this, arguments);
        const scroller = document.querySelector(`.js-chirp-container[data-column="${CSS.escape(String(key))}"]`)?.closest(".js-column-scroller");
        // at the top TweetDeck shows what comes, as it always did
        const seen = scroller && scroller.scrollTop > 0 ? onScreen(scroller) : [];
        if(!seen.length) return restore;
        return function() {
            const out = restore.apply(this, arguments);
            const anchor = seen.find(({ item }) => item.isConnected);
            if(anchor) {
                const moved = anchor.item.getBoundingClientRect().top - anchor.top;
                if(Math.abs(moved) >= 1) scroller.scrollTop += moved;
            }
            return out;
        };
    };
})();
