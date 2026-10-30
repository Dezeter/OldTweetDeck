// Posts longer than 280, as on x.com: TweetDeck's tweet box counts to X Premium's 25 000 instead of 280, so its
// count and its Tweet button don't stop at 280. interception.js sends a longer post the way x.com does, with
// CreateNoteTweet. TweetDeck's limit is twitter-text's: its configs, which TweetDeck's own copy reads on every
// count, and the one files/twitter-text.js puts on window. Loaded by injection.js after otd-common.js.
// Switch "longPosts".
(() => {
    if(!OTD.isOn("longPosts")) return;

    const MAX = 25000;
    let modules = {};
    try {
        window.webpackJsonp.push([["otd-long-posts"], { "otd-long-posts": (module, exports, require) => { modules = require.c; } }, [["otd-long-posts"]]]);
    } catch(e) {
        console.warn("[otd] no webpack runtime", e);
    }
    const texts = new Set([...Object.values(modules).map(m => m.exports), window.twttr?.txt, window.twttrTxt].filter(x => x?.configs?.defaults?.maxWeightedTweetLength));
    // the configs of 280; version 1's 140 is no one's now
    for(const text of texts) for(const config of Object.values(text.configs)) if(config.maxWeightedTweetLength >= 280) config.maxWeightedTweetLength = MAX;
})();
