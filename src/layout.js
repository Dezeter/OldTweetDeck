// How the columns use the room they have; both apply at once, without a reload:
// - "fitColumns": columns share a window they don't fill, each growing from the width picked in TweetDeck's
//   settings up to 480px; with more columns than fit, the row scrolls as before. A column TweetDeck's drag
//   takes out of the row is positioned by it, so the drag works as it did;
// - density (OTD.DENSITY_STORAGE): TweetDeck's own, compact, or "comfortable", with more room around a tweet
//   and its text no smaller than 15px, for reading a few columns rather than many.
// Loaded by injection.js after otd-common.js.
(() => {
    OTD.htmlClassWhileOn("fitColumns", "otd-fit-columns");
    const density = () => document.documentElement.classList.toggle("otd-comfortable", localStorage[OTD.DENSITY_STORAGE] === "comfortable");
    density();
    OTD.onChange(OTD.DENSITY_STORAGE, density);

    OTD.addStyle(`
        html.otd-fit-columns .app-columns { display: flex; }
        html.otd-fit-columns .app-columns > .column { flex: 1 0 auto; max-width: 480px; }
        html.otd-fit-columns .app-columns > .placeholder { flex: none; }

        html.otd-comfortable .stream-item > .item-box { padding: 12px 14px; }
        html.otd-comfortable .tweet-header { margin-bottom: 2px; }
        html.otd-comfortable .tweet-body { margin-bottom: 4px; }
        html.otd-comfortable .tweet-footer { margin-top: 8px; }
        html.otd-comfortable .stream-item .js-tweet-text.tweet-text,
        html.otd-comfortable .quoted-tweet .js-quoted-tweet-text { font-size: max(15px, 1rem); }
        html.otd-comfortable .js-media,
        html.otd-comfortable .quoted-tweet { margin-top: 8px; }
    `);
})();
