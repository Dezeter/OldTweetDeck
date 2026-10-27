// "Download media" in a tweet's "…" menu saves its photos at full size and its videos and GIFs at the best
// quality, through the extension's background script (chrome.downloads, which CORS doesn't limit).
// Loaded by injection.js after otd-common.js. Switch "downloadMedia".
(() => {
    if(!OTD.isOn("downloadMedia") || !window.TD?.mustaches) return;

    const LABEL = OTD.label({ ru: "Скачать медиа", en: "Download media" });
    const TEMPLATE = "menus/actions.mustache";
    const AFTER = '<li class="is-selectable"><a href="#" data-action="reference-to">{{_i}}Copy link to this Tweet{{/i}}</a></li>';
    const template = TD.mustaches[TEMPLATE];
    if(typeof template !== "string" || !template.includes(AFTER)) return;
    // hasMedia needs the chirp as the current context, here it's inside {{#user}}
    TD.mustaches[TEMPLATE] = template.replace(AFTER, `${AFTER} {{#chirp}}{{#hasMedia}}<li class="is-selectable"><a href="#" data-otd-action="download-media">${LABEL}</a></li>{{/hasMedia}}{{/chirp}}`);

    // TweetDeck finds the menu's chirp from the "…" button's attributes; the same here, as it opens
    let menuChirp = null;
    document.addEventListener("click", e => {
        const button = e.target.closest?.('[rel="actionsMenu"]');
        if(!button) return;
        menuChirp = null;
        try {
            const chirp = TD.controller.columnManager.findChirpByAccountKey({
                chirpId: button.getAttribute("data-parent-chirp-id") || button.getAttribute("data-chirp-id"),
                accountKey: button.getAttribute("data-account-key"),
                columnKey: button.closest(".js-column")?.getAttribute("data-column"),
            });
            menuChirp = chirp?.getRelatedTweet?.() || chirp;
        } catch(e) {}
    }, true);

    // the files to save: photos at their original size, the mp4 with the highest bitrate of videos and GIFs
    function filesOf(chirp) {
        const tweet = chirp.retweetedStatus || chirp;
        const name = `${tweet.user?.screenName || "tweet"}_${tweet.id}`;
        const files = [];
        for(const media of chirp.getMedia()) {
            const entity = media.entity;
            if(entity?.type === "photo" && entity.media_url_https) {
                const [, base, ext] = entity.media_url_https.match(/^(.*)\.(\w+)$/) || [];
                if(base) files.push({ url: `${base}?format=${ext}&name=orig`, ext });
            } else if((entity?.type === "video" || entity?.type === "animated_gif") && media.chooseVideoVariant) {
                const url = media.chooseVideoVariant()?.url;
                if(url) files.push({ url, ext: "mp4" });
            }
        }
        return files.map((file, i) => ({ url: file.url, filename: `${name}${files.length > 1 ? `_${i + 1}` : ""}.${file.ext}` }));
    }

    document.addEventListener("click", e => {
        const item = e.target.closest?.('[data-otd-action="download-media"]');
        if(!item) return;
        e.preventDefault();
        if(!menuChirp) return;
        // content.js passes these on to the background script
        for(const file of filesOf(menuChirp)) window.postMessage({ action: "otdDownload", url: file.url, filename: file.filename }, location.origin);
    });
})();
