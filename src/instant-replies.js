// A reply sent from TweetDeck shows up in the open conversation right away, instead of after the
// next refresh (every 60 s) or reopening the tweet. Loaded by injection.js after otd-common.js.
// Switch "instantReplies".
(() => {
    if(!OTD.isOn("instantReplies")) return;

    // dataTweetSent is a jQuery event, and the conversation pub/sub lives on TweetDeck's jQuery too
    const $ = OTD.jQuery();
    if(!$) return;

    $(document).on("dataTweetSent", (e, data) => {
        const { request, response } = data || {};
        if(request?.type !== "reply" || !response?.id_str) return;

        // the response is the created tweet, as interception.js builds it from CreateTweet
        const client = TD.controller.clients.getClient(request.accountKey) || TD.controller.clients.getPreferredClient();
        const chirp = client?.processTweet(response);
        if(!chirp) return;

        // An open conversation listens on its tweet and on every reply in it, and skips ids it already
        // has, so the regular refresh won't add this one twice.
        const parent = chirp.inReplyToID || request.inReplyToStatusId;
        $.publish(`/tweets/conversation/${parent}`, [{ ancestors: [], descendants: [chirp], root: null }]);
    });
})();
