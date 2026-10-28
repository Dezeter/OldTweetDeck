// TweetDeck's density, applied at once, without a reload (OTD.DENSITY_STORAGE): its own, compact, or
// "comfortable", with more room around a tweet and its text no smaller than 15px, for reading a few columns
// rather than many. Columns that share the window are TweetDeck's "flex" column width (files/bundle.*).
// Loaded by injection.js after otd-common.js.
(() => {
    const density = () => document.documentElement.classList.toggle("otd-comfortable", localStorage[OTD.DENSITY_STORAGE] === "comfortable");
    density();
    OTD.onChange(OTD.DENSITY_STORAGE, density);

    OTD.addStyle(`
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
