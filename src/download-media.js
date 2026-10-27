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

    // named after the author and the tweet: alice_123.jpg, alice_123_2.jpg
    function filesOf(chirp) {
        const tweet = chirp.retweetedStatus || chirp;
        const name = `${tweet.user?.screenName || "tweet"}_${tweet.id}`;
        const files = OTD.mediaFiles(chirp);
        return files.map((file, i) => ({ url: file.url, filename: `${name}${files.length > 1 ? `_${i + 1}` : ""}.${file.ext}` }));
    }

    document.addEventListener("click", e => {
        const item = e.target.closest?.('[data-otd-action="download-media"]');
        if(!item) return;
        e.preventDefault();
        const chirp = OTD.openMenuChirp();
        if(!chirp) return;
        // content.js passes these on to the background script
        for(const file of filesOf(chirp)) window.postMessage({ action: "otdDownload", url: file.url, filename: file.filename }, location.origin);
    });
})();
