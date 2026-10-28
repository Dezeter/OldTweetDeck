// Medeo Sans for all of TweetDeck's text instead of the system font: a variable font for Latin and Cyrillic by
// DNF (https://github.com/DNFDEVS/medeo-font, medeo-font 1.0.0-rc.4.1 on npm), SIL Open Font License 1.1, in
// files/fonts with its license. Icons keep their own fonts: TweetDeck draws them in ::before with a font of their
// own. The files are fetched from the extension and handed to the page as FontFace, so no font is asked for
// anywhere else and Firefox's rule that fonts come from the page's own origin doesn't get in the way.
// Loaded by injection.js after otd-common.js. Switch "medeoFont".
(() => {
    if(!OTD.isOn("medeoFont")) return;

    const FAMILY = "Medeo Sans";
    const FILES = [["MedeoSansVariable.woff2", "normal"], ["MedeoSansVariable-Italic.woff2", "italic"]];
    for(const [file, style] of FILES) {
        fetch(`${OTD.BASE_URL}files/fonts/${file}`)
            .then(res => res.ok ? res.arrayBuffer() : Promise.reject(new Error(`HTTP ${res.status}`)))
            .then(data => {
                const face = new FontFace(FAMILY, data, { weight: "100 900", style });
                document.fonts.add(face);
                return face.load();
            })
            .catch(e => console.warn(`[otd-font] ${file} didn't load:`, e));
    }

    // TweetDeck's own fonts after it, for what Medeo doesn't cover (Japanese, Chinese, emoji)
    OTD.addStyle(`
        html, html.dark, html * { font-family: "${FAMILY}", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Ubuntu, "Helvetica Neue", Arial, "Hiragino Kaku Gothic Pro", Meiryo, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji" !important; }
    `);
})();
