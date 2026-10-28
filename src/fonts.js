// The font of all of TweetDeck's text, picked in Settings → TweeXDeck (OTD.FONTS, OTD.FONT_STORAGE): without
// a pick TweetDeck keeps its own system fonts. The fonts are in files/fonts/<key>, from Fontsource's variable
// packages, each with its OFL.txt: Latin and Cyrillic in four files, every one with its unicode range, so other
// scripts and emoji fall back to the system fonts. The files are fetched from the extension and handed to the
// page as FontFace, so no font is asked for anywhere else and Firefox's rule that fonts come from the page's own
// origin doesn't get in the way. Icons keep their fonts: TweetDeck draws them in ::before with a font of their
// own. A pick applies without a reload. Loaded by injection.js after otd-common.js.
(() => {
    // Google Fonts' subsets, as Fontsource cuts them
    const RANGES = {
        "latin": "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD",
        "latin-ext": "U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF",
        "cyrillic": "U+0301,U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116",
        "cyrillic-ext": "U+0460-052F,U+1C80-1C8A,U+20B4,U+2DE0-2DFF,U+A640-A69F,U+FE2E-FE2F",
    };
    function load(font) {
        for(const [subset, unicodeRange] of Object.entries(RANGES)) {
            fetch(`${OTD.BASE_URL}files/fonts/${font.key}/${subset}.woff2`)
                .then(res => res.ok ? res.arrayBuffer() : Promise.reject(new Error(`HTTP ${res.status}`)))
                .then(data => {
                    const face = new FontFace(font.name, data, { weight: font.weight, unicodeRange });
                    document.fonts.add(face);
                    return face.load();
                })
                .catch(e => console.warn(`[otd-font] ${font.key}/${subset} didn't load:`, e));
        }
    }

    const loaded = new Set();
    let style;
    function apply() {
        const font = OTD.FONTS.find(f => f.key === localStorage[OTD.FONT_STORAGE]);
        if(font && !loaded.has(font.key)) {
            loaded.add(font.key);
            load(font);
        }
        // TweetDeck's own fonts after it, for what it doesn't cover (Japanese, Chinese, emoji)
        const css = font ? `
            html, html.dark, html * { font-family: "${font.name}", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Ubuntu, "Helvetica Neue", Arial, "Hiragino Kaku Gothic Pro", Meiryo, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji" !important; }
        ` : "";
        if(style) style.textContent = css;
        else if(css) style = OTD.addStyle(css);
    }
    apply();
    OTD.onChange(OTD.FONT_STORAGE, apply);
})();
