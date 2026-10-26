// A single image in a column shows whole, in its own proportions, instead of cropped to TweetDeck's strip,
// and no taller than half the screen. Loaded by injection.js after otd-common.js. Switch "mediaAspect".
(() => {
    if(!OTD.isOn("mediaAspect")) return;

    // width and height of the one photo of a chirp (a retweet's, a liked tweet's), or nothing
    function photoSize(chirp) {
        const media = chirp?.getMedia?.() || [];
        if(media.length !== 1 || media[0].entity?.type !== "photo") return null;
        const { original_info: original, sizes } = media[0].entity;
        const size = original?.width ? { w: original.width, h: original.height } : sizes?.large;
        return size?.w > 0 && size?.h > 0 ? size : null;
    }

    function scan() {
        // TweetDeck's medium and large previews; small ones, quotes and the detail view stay as they are
        for(const link of document.querySelectorAll(".js-stream-item .js-media-image-link:is(.media-size-medium, .media-size-large):not([data-otd-aspect])")) {
            link.dataset.otdAspect = "";
            if(link.closest(".js-quote-detail, .js-tweet-detail")) continue;
            const size = photoSize(OTD.chirpFor(link));
            if(!size) continue;
            link.classList.add("otd-aspect");
            link.style.setProperty("--otd-aspect", `${(size.h / size.w * 100).toFixed(2)}%`);
        }
    }

    OTD.addStyle(`
        /* the strip's height becomes the image's proportion; !important over the dark theme's copy of the rule */
        .js-media-image-link.otd-aspect { height: 0 !important; padding-top: min(50vh, var(--otd-aspect)) !important; background-size: cover; background-position: center; }
    `);
    OTD.watch(scan);
})();
