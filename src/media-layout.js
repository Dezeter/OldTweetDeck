// How a tweet's photos and videos show in a column, picked in Settings → TweeXDeck → Media (OTD.MEDIA_STORAGE),
// applied at once:
// - "thumb", the default: a small square at the right of the text, the text, "Replying to" and the buttons in a
//   column beside it, a quoted tweet under it at full width. Several photos are TweetDeck's grid in the square, or
//   the first with "+2"; a video has a play badge, a GIF "GIF". A quoted tweet's media is a smaller square in the
//   quote. A click opens TweetDeck's media window as before; a video, with inline video on, opens the tweet back to
//   full width and plays there;
// - "whole": a single photo whole, in its own proportions and no taller than half the screen, instead of TweetDeck's
//   strip; several photos and videos as TweetDeck has them;
// - "strip": TweetDeck's own strip.
// A link card with a large picture is X's small one in a column, its picture beside the title, as the media are.
// The tweet opened in a column's detail view and TweetDeck's "Large" previews keep TweetDeck's.
// Loaded by injection.js after otd-common.js.
(() => {
    // before 5.15 a switch, "mediaAspect": whole, or switched off TweetDeck's strip
    if(localStorage.OTDmediaAspect !== undefined) {
        if(localStorage.OTDmediaAspect === "0" && localStorage[OTD.MEDIA_STORAGE] === undefined) localStorage[OTD.MEDIA_STORAGE] = "strip";
        localStorage.removeItem("OTDmediaAspect");
    }
    const mode = () => ["whole", "strip"].includes(localStorage[OTD.MEDIA_STORAGE]) ? localStorage[OTD.MEDIA_STORAGE] : "thumb";
    const apply = () => {
        document.documentElement.classList.toggle("otd-media-thumb", mode() === "thumb");
        document.documentElement.classList.toggle("otd-media-whole", mode() === "whole");
        for(const media of document.querySelectorAll("[data-otd-thumb]")) place(media);
    };
    // A square floats at the start of what it's beside, so the text goes beside it and not under it; elsewhere
    // the media goes back where TweetDeck put it: after a tweet's card container, at the end of a quote.
    function place(media) {
        const box = media.parentElement;
        if(!box) return;
        const thumb = mode() === "thumb" && (box.classList.contains("otd-has-thumb") || box.classList.contains("otd-quote-thumb"));
        if(thumb && box.firstElementChild !== media) box.prepend(media);
        else if(!thumb && box.firstElementChild === media) {
            const card = box.querySelector(":scope > .js-card-container");
            if(card) card.after(media);
            else box.append(media);
        }
    }
    apply();
    OTD.onChange(OTD.MEDIA_STORAGE, apply);

    // width and height of the one photo of a chirp (a retweet's, a liked tweet's), or nothing
    function photoSize(chirp) {
        const media = chirp?.getMedia?.() || [];
        if(media.length !== 1 || media[0].entity?.type !== "photo") return null;
        const { original_info: original, sizes } = media[0].entity;
        const size = original?.width ? { w: original.width, h: original.height } : sizes?.large;
        return size?.w > 0 && size?.h > 0 ? size : null;
    }

    function scan() {
        // whole: TweetDeck's medium and large previews; small ones, quotes and the detail view stay as they are
        for(const link of document.querySelectorAll(".js-stream-item .js-media-image-link:is(.media-size-medium, .media-size-large):not([data-otd-aspect])")) {
            link.dataset.otdAspect = "";
            if(link.closest(".js-quote-detail, .js-tweet-detail")) continue;
            const size = photoSize(OTD.chirpFor(link));
            if(!size) continue;
            link.classList.add("otd-aspect");
            link.style.setProperty("--otd-aspect", `${(size.h / size.w * 100).toFixed(2)}%`);
        }
        // thumb: the tweets and quotes with media, and how many photos past the first
        for(const media of document.querySelectorAll(".js-stream-item .tweet-body > .js-media:not([data-otd-thumb]), .js-stream-item .js-quote-detail > div > .js-media:not([data-otd-thumb])")) {
            media.dataset.otdThumb = "";
            if(media.closest(".js-tweet-detail")) continue;
            media.parentElement.classList.add(media.closest(".js-quote-detail") ? "otd-quote-thumb" : "otd-has-thumb");
            const more = media.querySelectorAll(":scope > .js-media-preview-container").length - 1;
            if(more > 0) media.dataset.otdMore = `+${more}`;
            place(media);
        }
    }
    OTD.watch(scan);

    // a card is drawn for a column by TD.ui.Column's loadCard (the detail view draws its own): in thumb mode a
    // summary_large_image goes as a summary, with the large picture as its thumbnail
    const Column = window.TD?.ui?.Column;
    const loadCard = Column?.prototype?.loadCard;
    if(loadCard) Column.prototype.loadCard = function(chirp) {
        const card = chirp?.card;
        if(mode() !== "thumb" || card?.name !== "summary_large_image") return loadCard.apply(this, arguments);
        const values = card.binding_values || {};
        const image = values.summary_photo_image_original || values.thumbnail_image_original;
        const small = Object.create(chirp);
        small.card = { ...card, name: "summary", binding_values: { ...values, ...(image ? { thumbnail_image_original: image } : {}) } };
        return loadCard.call(this, small, ...[...arguments].slice(1));
    };

    // a video in a square plays nowhere: its tweet opens to full width first, inline-video.js plays it there
    document.addEventListener("click", e => {
        if(mode() !== "thumb" || !OTD.isOn("inlineVideo") || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
        const box = e.target.closest?.('.js-media .js-media-preview-container.is-video a[rel="mediaPreview"]')?.closest(".otd-has-thumb, .otd-quote-thumb");
        if(!box) return;
        box.classList.remove("otd-has-thumb", "otd-quote-thumb");
        place(box.querySelector(":scope > .js-media"));
    }, true);

    const mask = shape => `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='#000' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'>${shape}</svg>`)}")`;
    // Lucide's (ISC, files/icons/LICENSE)
    const EYE_OFF = mask("<path d='M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49'/><path d='M14.084 14.158a3 3 0 0 1-4.242-4.242'/><path d='M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143'/><path d='m2 2 20 20'/>");
    const PLAY = mask("<path d='M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z' fill='#000'/>");
    // the square in a tweet and in a quote
    const M = ["html.otd-media-thumb .otd-has-thumb > .js-media", "html.otd-media-thumb .otd-quote-thumb > .js-media"];
    const both = rest => M.map(m => `${m}${rest}`).join(", ");
    OTD.addStyle(`
        /* whole: the strip's height becomes the image's proportion; !important over the dark theme's copy of the rule */
        html.otd-media-whole .js-media-image-link.otd-aspect { height: 0 !important; padding-top: min(50vh, var(--otd-aspect)) !important; background-size: cover; background-position: center; }

        /* thumb: an 80px square at the right, 64px in a quote */
        ${both("")} { --otd-thumb: 80px; float: right; position: relative; width: var(--otd-thumb); height: var(--otd-thumb); margin: 2px 0 6px 12px; overflow: hidden; border-radius: 12px; }
        ${M[1]} { --otd-thumb: 64px; margin: 0 0 4px 10px; border-radius: 10px; }
        /* a column beside it: the text, "Replying to", the buttons (in a GIF's tweet TweetDeck's markup puts them in the body) */
        html.otd-media-thumb .otd-has-thumb > .tweet-text, html.otd-media-thumb .otd-quote-thumb > .js-quoted-tweet-text,
        html.otd-media-thumb .otd-has-thumb ~ .tweet-footer, html.otd-media-thumb .otd-has-thumb .tweet-footer { display: flow-root; }
        /* in a quote, its author's line too, cut short with "…" */
        html.otd-media-thumb .otd-quote-thumb > .tweet-header { display: flow-root; }
        html.otd-media-thumb .otd-quote-thumb > .tweet-header > .account-link, html.otd-media-thumb .otd-quote-thumb > .tweet-header .nbfc { display: block; }
        /* a quote under it, whole */
        html.otd-media-thumb .otd-has-thumb > .js-quote-detail { clear: right; }
        ${both(" > .js-media-preview-container")} { width: 100%; height: 100%; min-height: 0 !important; margin: 0 !important; }
        ${both(" > .js-media-preview-container ~ .js-media-preview-container")} { display: none; }
        ${both(" .media-item")}, ${both(" .media-grid-container")} {
            height: var(--otd-thumb) !important; min-height: 0 !important; padding-top: 0 !important; margin: 0 !important; border-radius: inherit; background-size: cover; background-position: center;
        }
        /* TweetDeck's grid of several photos is the square itself: its height, the square's margins */
        ${both(".media-grid-container")} { height: var(--otd-thumb) !important; min-height: 0 !important; }
        ${both(" .media-item-gif")} { width: 100%; height: 100%; object-fit: cover; }
        /* TweetDeck's badges are for its strip; the square has its own */
        ${both(" .video-overlay")}, ${both(" .gif-badge")}, ${both(" .gif-pause")} { display: none; }
        ${both("[data-otd-more]::after")}, ${both(" .is-gif::after")} {
            position: absolute; z-index: 1; padding: 1px 6px; border-radius: 999px; background: rgba(15, 20, 25, .75);
            color: #fff; font-size: 11px; font-weight: 700; line-height: 16px; pointer-events: none;
        }
        ${both("[data-otd-more]::after")} { content: attr(data-otd-more); right: 4px; bottom: 4px; }
        ${both(" .is-gif::after")} { content: "GIF"; left: 4px; bottom: 4px; }
        /* a play button: a dark circle, a white triangle */
        ${both(" .is-video::after")} {
            content: ""; position: absolute; z-index: 1; left: 50%; top: 50%; width: 28px; height: 28px; margin: -14px 0 0 -14px; border-radius: 50%;
            background: rgba(15, 20, 25, .75); pointer-events: none;
        }
        ${both(" .is-video::before")} {
            content: ""; position: absolute; z-index: 2; left: 50%; top: 50%; width: 12px; height: 12px; margin: -6px 0 0 -4px; background-color: #fff;
            -webkit-mask: ${PLAY} center / contain no-repeat; mask: ${PLAY} center / contain no-repeat; pointer-events: none;
        }
        /* TweetDeck's notice over sensitive media: an eye in the square, the whole of it shows it */
        ${both(" .media-sensitive")} { border-radius: inherit; }
        ${both(" .media-sensitive .padding-am")} { font-size: 0; }
        ${both(" .media-sensitive .padding-am > :not([rel=\"showSensitiveMedia\"])")} { display: none; }
        ${both(" .media-sensitive [rel=\"showSensitiveMedia\"]")} { position: absolute; inset: 0; font-size: 0; color: inherit; }
        ${both(" .media-sensitive [rel=\"showSensitiveMedia\"]::before")} {
            content: ""; position: absolute; left: 50%; top: 50%; width: 24px; height: 24px; margin: -12px 0 0 -12px; background-color: currentColor;
            -webkit-mask: ${EYE_OFF} center / contain no-repeat; mask: ${EYE_OFF} center / contain no-repeat;
        }
    `);
})();
