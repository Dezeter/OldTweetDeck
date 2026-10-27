// A column at its top doesn't move down with new tweets while the pointer is over it, so what you're
// reading stays put. TweetDeck adds tweets without scrolling a column that isn't at its very top (that's
// its own TD.ui.Column pause / unpause: scrollTop 1 and 0), so the column is nudged by a pixel while the
// pointer is over it. Loaded by injection.js after otd-common.js. Switch "pauseOnHover".
(() => {
    if(!OTD.isOn("pauseOnHover")) return;

    const scrollerOf = target => target.matches?.("section.js-column") ? target.querySelector(".js-column-scroller") : null;

    // mouseenter doesn't bubble; a capturing listener still sees it for every column
    document.addEventListener("mouseenter", e => {
        const scroller = scrollerOf(e.target);
        if(scroller && scroller.scrollTop === 0) scroller.scrollTop = 1;
    }, true);
    document.addEventListener("mouseleave", e => {
        const scroller = scrollerOf(e.target);
        if(scroller && scroller.scrollTop === 1) scroller.scrollTop = 0;
    }, true);
})();
