// Threads, where the author replies to themselves, as TweetDeck showed them when X still marked such tweets
// (self_thread, which X's answers don't have any more): no "Replying to @author" over its tweets, but "Show this
// thread" under them. Tweets of a thread next to each other in a column, the newest on top as the column has
// them, are joined by a line between the avatars, and "Show this thread" stays where the next one isn't right
// below. Loaded by injection.js after otd-common.js. Switch "selfThreads".
(() => {
    if(!OTD.isOn("selfThreads")) return;
    const Status = window.TD?.services?.TwitterStatus;
    if(!Status?.prototype?.isInThread || !Status.prototype.render) return;

    const selfReply = chirp => !!chirp?.inReplyToID && !!chirp.user && String(chirp.inReplyToUserID) === String(chirp.user.id);

    // TweetDeck asks this when it renders a tweet; selfThreadId is what X used to say. Only while render() draws a
    // tweet (in a column, or around an opened one): the tweet view asks it too, and would put away the reply box
    // under your own thread's tweets, waiting for X to say which one is the last
    const isInThread = Status.prototype.isInThread;
    const render = Status.prototype.render;
    let rendering = 0;
    Status.prototype.render = function() {
        rendering++;
        try {
            return render.apply(this, arguments);
        } finally {
            rendering--;
        }
    };
    Status.prototype.isInThread = function() {
        return isInThread.call(this) || (rendering > 0 && selfReply(this.retweetedStatus || this));
    };

    OTD.watch(() => {
        const lines = [];
        for(const container of document.querySelectorAll(".js-column .js-chirp-container")) {
            const items = [...container.children].filter(el => el.matches("article.js-stream-item"));
            const chirps = items.map(item => OTD.chirpFor(item));
            // a tweet replying to its own author's tweet right below it; retweets are someone else's doing
            const joined = items.map((item, i) => {
                const chirp = chirps[i], next = chirps[i + 1];
                return !!chirp && !!next && !chirp.retweetedStatus && !next.retweetedStatus && selfReply(chirp) && String(chirp.inReplyToID) === String(next.id);
            });
            items.forEach((item, i) => {
                const down = joined[i], up = i > 0 && joined[i - 1];
                item.classList.toggle("otd-thread-down", down);
                item.classList.toggle("otd-thread-up", up);
                const avatar = (down || up) && item.querySelector(".tweet-header .tweet-img");
                for(const [where, on] of [["down", down], ["up", up]]) {
                    if(on && avatar) lines.push({ item, where, avatar });
                    else item.querySelector(`:scope > .otd-thread-line-${where}`)?.remove();
                }
            });
        }

        // measured first and drawn after, so the page is laid out once: from under the avatar to the bottom of the
        // item, or from its top down to the avatar
        const places = lines.map(({ item, avatar }) => ({
            box: item.getBoundingClientRect(),
            pic: avatar.getBoundingClientRect(),
            border: parseFloat(getComputedStyle(item).borderBottomWidth) || 0,
        }));
        lines.forEach(({ item, where }, i) => {
            const { box, pic, border } = places[i];
            let el = item.querySelector(`:scope > .otd-thread-line-${where}`);
            if(!el) {
                el = document.createElement("div");
                el.className = `otd-thread-line otd-thread-line-${where}`;
                item.append(el);
            }
            el.style.left = `${Math.round(pic.left - box.left + pic.width / 2 - 1)}px`;
            if(where === "down") {
                el.style.top = `${Math.round(pic.bottom - box.top + 4)}px`;
                // over the border between the items, to meet the next one's line
                el.style.bottom = `-${border}px`;
            } else {
                el.style.top = "0";
                el.style.height = `${Math.max(0, Math.round(pic.top - box.top - 4))}px`;
            }
        });
    });

    OTD.addStyle(`
        .otd-thread-down, .otd-thread-up { position: relative; }
        .otd-thread-line { position: absolute; width: 2px; border-radius: 1px; background: rgba(136, 153, 166, .5); pointer-events: none; }
        .otd-thread-down .js-show-this-thread { display: none !important; }
    `);
})();
