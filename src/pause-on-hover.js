// A column at its top doesn't move down with new tweets while the pointer is over it, so what you're
// reading stays put. TweetDeck adds tweets without scrolling a column that isn't at its very top (that's
// its own TD.ui.Column pause / unpause: scrollTop 1 and 0), so the column is scrolled by a pixel while the
// pointer is over it, past a pixel added on top for it, so nothing moves on the screen.
// Loaded by injection.js after otd-common.js. Switch "pauseOnHover".
(() => {
    if(!OTD.isOn("pauseOnHover")) return;

    const scrollerOf = target => target.matches?.("section.js-column") ? target.querySelector(".js-column-scroller") : null;

    // mouseenter doesn't bubble; a capturing listener still sees it for every column
    document.addEventListener("mouseenter", e => {
        const scroller = scrollerOf(e.target);
        // a column too short to scroll has nothing to hold
        if(!scroller || scroller.scrollTop !== 0 || scroller.scrollHeight <= scroller.clientHeight) return;
        scroller.classList.add("otd-held");
        scroller.scrollTop = 1;
    }, true);
    document.addEventListener("mouseleave", e => {
        const scroller = scrollerOf(e.target);
        if(!scroller?.classList.contains("otd-held")) return;
        // without the pixel the tweets come up by one; back where they were, at the top if nothing came
        const top = scroller.scrollTop;
        scroller.classList.remove("otd-held");
        scroller.scrollTop = top <= 1 ? 0 : top - 1;
    }, true);

    OTD.addStyle(`
        .js-column-scroller.otd-held::before { content: ""; display: block; height: 1px; }
    `);
})();
