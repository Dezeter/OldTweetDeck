// The tab title shows what's unread: "(3) TweetDeck" for unread direct messages, "(*) TweetDeck" for new
// tweets in a column. TweetDeck marks those with its unread badges and the is-new class on a column.
// Loaded by injection.js after otd-common.js. Switch "tabTitle".
(() => {
    if(!OTD.isOn("tabTitle")) return;

    const MARK = /^\((\d+|\*)\) /;

    function update() {
        const messages = Math.max(0, ...[...document.querySelectorAll(".js-unread-count.is-visible")].map(badge => parseInt(badge.textContent, 10) || 0));
        const tweets = !!document.querySelector("section.js-column.is-new");
        const base = document.title.replace(MARK, "");
        const title = messages ? `(${messages}) ${base}` : tweets ? `(*) ${base}` : base;
        if(document.title !== title) document.title = title;
    }

    // right away on TweetDeck's own events, and on the shared watcher for anything else
    OTD.jQuery()?.(document).on("uiReadStateChange uiMessageUnreadCount", () => setTimeout(update));
    OTD.watch(update);
})();
