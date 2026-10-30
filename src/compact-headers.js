// Shorter tweet headers:
// - "↩ @name" instead of "Replying to @name", the words kept for screen readers; in a column wide enough for both,
//   on the line of the author's name;
// - a notification of a like or a retweet of your own tweet (or a grouped one) without your name and handle over
//   the tweet again: one line says who liked it, as on x.com;
// - a notification's kind, the heart, the retweet or the follow, in the avatars' column in the middle of the item,
//   where the column has nothing else: your own tweet's like or retweet, a follow. A follower's card goes beside
//   it, its avatar by the name. Where the tweet shows its author's avatar, the icon stays over it.
// Loaded by injection.js after otd-common.js. Switch "compactHeaders".
(() => {
    if(!OTD.isOn("compactHeaders")) return;

    // the author's name, handle, "↩ @name" and the time take about 340px of a tweet's body
    const WIDE_FROM = 340;
    // by column, measured on one of its tweets, again when the window or a column changes
    function wide(column) {
        const body = column?.querySelector(".js-stream-item .tweet-body");
        const width = body ? body.getBoundingClientRect().width : 0;
        if(width > 0) column.dataset.otdHeadersWide = width >= WIDE_FROM ? "1" : "0";
        return column?.dataset.otdHeadersWide === "1";
    }

    function shorten(replies) {
        if("otdShort" in replies.dataset) return;
        replies.dataset.otdShort = "";
        for(const node of [...replies.childNodes]) {
            if(node.nodeType !== Node.TEXT_NODE || !node.data.trim()) continue;
            const words = document.createElement("span");
            words.className = "otd-reply-words";
            words.textContent = node.data;
            node.replaceWith(words);
        }
        const icon = document.createElement("span");
        icon.className = "otd-reply-icon";
        icon.setAttribute("aria-hidden", "true");
        replies.prepend(icon);
    }

    // the reply line with the name, or back under it where TweetDeck put it
    function place(item, inHeader) {
        const tweet = item.querySelector(":scope > .js-stream-item-content > .js-tweet");
        const header = tweet?.querySelector(":scope > .tweet-header");
        const replies = tweet?.querySelector(":scope > .tweet-body > .nbfc > .other-replies, :scope > .tweet-header > .other-replies");
        if(!header || !replies) return;
        shorten(replies);
        replies.otdHome ||= replies.parentElement;
        if(inHeader && replies.parentElement !== header) header.querySelector(":scope > .account-link")?.after(replies);
        else if(!inHeader && replies.parentElement === header) replies.otdHome.append(replies);
        header.classList.toggle("otd-reply-in-header", replies.parentElement === header);
    }

    // a notification's tweet by the column's own account
    function ownTarget(item) {
        if(!item.querySelector(":scope > .js-stream-item-content > .activity-header")) return false;
        const account = item.closest(".js-column")?.querySelector(".column-header .attribution")?.textContent.trim().toLowerCase();
        const author = item.querySelector(":scope > .js-stream-item-content > .js-tweet > .tweet-header .username")?.textContent.trim().toLowerCase();
        return !!account && account === author;
    }
    function kindAside(item) {
        const content = item.querySelector(":scope > .js-stream-item-content");
        if(!content?.querySelector(":scope > .activity-header > .item-img:first-child .icon")) return false;
        return item.classList.contains("otd-own-target") || !content.querySelector(":scope > .js-tweet");
    }

    function scan() {
        // a column that got wider or narrower: its reply lines again
        for(const column of document.querySelectorAll(".js-column[data-otd-headers-wide]")) {
            const was = column.dataset.otdHeadersWide;
            if(wide(column) !== (was === "1")) for(const item of column.querySelectorAll(".js-stream-item[data-otd-headers]")) place(item, was !== "1");
        }
        for(const item of document.querySelectorAll(".js-stream-item:not([data-otd-headers])")) {
            if(item.closest(".js-tweet-detail")) continue;
            item.dataset.otdHeaders = "";
            item.classList.toggle("otd-own-target", ownTarget(item));
            item.classList.toggle("otd-kind-aside", kindAside(item));
            place(item, wide(item.closest(".js-column")));
        }
    }
    const rescan = OTD.watch(scan);
    window.addEventListener("resize", rescan);

    // Lucide's "reply" (ISC, files/icons/LICENSE)
    const REPLY = `url("data:image/svg+xml,${encodeURIComponent("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='#000' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M20 18v-2a4 4 0 0 0-4-4H4'/><path d='m9 17-5-5 5-5'/></svg>")}")`;
    OTD.addStyle(`
        .otd-reply-words { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
        .otd-reply-icon { display: inline-block; width: 1.15em; height: 1.15em; margin-right: 3px; vertical-align: -.22em; background-color: currentColor; opacity: .75;
            -webkit-mask: ${REPLY} center / contain no-repeat; mask: ${REPLY} center / contain no-repeat; }
        .tweet-header.otd-reply-in-header > .account-link { flex: 0 1 auto; min-width: 0; }
        .tweet-header.otd-reply-in-header > .other-replies { flex: 0 1 auto; min-width: 0; margin: 0 auto 0 6px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 13px; }
        .otd-own-target > .js-stream-item-content > .js-tweet > .tweet-header { display: none; }
        /* the avatars' column is 36px at the item's padding (layout.js's density), the text 46px from it; TweetDeck's
           margins of the icon's box are !important */
        .otd-kind-aside > .js-stream-item-content { position: relative; }
        .otd-kind-aside > .js-stream-item-content > .activity-header { padding-left: 46px; }
        .otd-kind-aside > .js-stream-item-content > .activity-header > .item-img:first-child {
            position: absolute; top: 0; bottom: 0; left: var(--otd-item-pad-x, 10px); width: 36px; margin: 0 !important; display: flex; align-items: center; justify-content: center;
        }
        .otd-kind-aside > .js-stream-item-content > .activity-header > .item-img:first-child > .icon { font-size: 20px !important; line-height: 1; }
        .otd-kind-aside > .js-stream-item-content > .account-summary { margin-left: 46px; }
    `);
})();
