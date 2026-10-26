// Hides replies to other people in home columns. Threads, where the author replies to themselves, stay,
// and so do retweets of replies. Loaded by injection.js after otd-common.js. Switch "hideHomeReplies".
(() => {
    if(!OTD.isOn("hideHomeReplies")) return;

    const isReplyToOthers = chirp =>
        !!chirp.inReplyToID && !!chirp.user && String(chirp.inReplyToUserID) !== String(chirp.user.id);

    function patch() {
        const proto = window.TD?.vo?.Column?.prototype;
        if(!proto?.filterAllowedChirps) return false;

        // This is where TweetDeck applies mutes, for polling, infinite scroll and gaps alike.
        // Paging takes its cursors from the poller cache, not from what passed, so hiding here doesn't break it.
        const filterAllowedChirps = proto.filterAllowedChirps;
        proto.filterAllowedChirps = function(chirps) {
            const allowed = filterAllowedChirps.call(this, chirps);
            if(typeof this.getFeedsByType !== "function" || !this.getFeedsByType("home").length) return allowed;
            return allowed.filter(chirp => !isReplyToOthers(chirp));
        };
        return true;
    }

    if(!patch()) {
        const timer = setInterval(() => patch() && clearInterval(timer), 100);
        setTimeout(() => clearInterval(timer), 30000);
    }
})();
