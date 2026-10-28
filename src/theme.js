// TweetDeck's theme, two more ways:
// - "System" next to Dark and Light in TweetDeck's settings, and in the TweeXDeck tab: the theme follows the
//   system's prefers-color-scheme, as it changes too. TweetDeck still sees "dark" or "light", so all its own
//   checks of the theme keep working; OTD.THEME_SYSTEM_STORAGE remembers the pick;
// - "lightsOut": the dark theme in x.com's black instead of TweetDeck's dark blue. The rules come from
//   TweetDeck's own dark ones: every html.dark rule with one of its blues gets a twin for
//   html.dark.otd-lights-out with x.com's color in its place, so nothing TweetDeck draws dark is left out.
// Both apply without a reload. Loaded by injection.js after otd-common.js.
(() => {
    const settings = window.TD?.settings;
    if(!settings?.setTheme) return;

    const systemDark = window.matchMedia?.("(prefers-color-scheme: dark)");
    const follows = () => localStorage[OTD.THEME_SYSTEM_STORAGE] === "1";
    const setTheme = settings.setTheme;
    // asked afresh: Firefox brings a MediaQueryList it gave before up to date only with its change event
    const systemTheme = () => window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    // TweetDeck's radio, the TweeXDeck tab and the command palette all pick "system" through here
    settings.setTheme = function(theme) {
        OTD.setValue(OTD.THEME_SYSTEM_STORAGE, theme === "system" ? "1" : "");
        return setTheme.call(this, theme === "system" ? systemTheme() : theme);
    };
    // TweetDeck's settings read its storage, which is there once TweetDeck is ready
    const follow = () => {
        if(window.TD?.ready && follows() && settings.getTheme() !== systemTheme()) setTheme.call(settings, systemTheme());
    };
    follow();
    // jQuery's namespace keeps TweetDeck's own handlers out of a test's trigger
    OTD.jQuery()?.(document).one("TD.ready.otd-theme", follow);
    systemDark?.addEventListener?.("change", follow);
    OTD.onChange(OTD.THEME_SYSTEM_STORAGE, follow);

    // TweetDeck's dark blues and x.com's Lights out: backgrounds, the darker app background and pressed buttons,
    // headers and drawers, borders, threads and scrollbars, grey text
    const LIGHTS_OUT = {
        "21, 32, 43": "0, 0, 0",
        "16, 23, 30": "22, 24, 28",
        "28, 41, 56": "22, 24, 28",
        "56, 68, 77": "47, 51, 54",
        "61, 84, 102": "62, 65, 68",
        "136, 153, 166": "113, 118, 123",
        "101, 119, 134": "113, 118, 123",
    };
    const COLOR = /rgba?\((\d+), (\d+), (\d+)(, [\d.]+)?\)/g;
    const swap = value => value.replace(COLOR, (all, r, g, b, alpha) => {
        const to = LIGHTS_OUT[`${r}, ${g}, ${b}`];
        return to ? (alpha ? `rgba(${to}${alpha})` : `rgb(${to})`) : all;
    });
    function lightsOutRules(rules) {
        let css = "";
        for(const rule of rules) {
            if(rule.cssRules && rule.media) {
                const inner = lightsOutRules(rule.cssRules);
                if(inner) css += `@media ${rule.media.mediaText} { ${inner} }\n`;
                continue;
            }
            if(!rule.selectorText?.includes("html.dark")) continue;
            let body = "";
            for(const property of rule.style) {
                const value = rule.style.getPropertyValue(property);
                const swapped = swap(value);
                if(swapped !== value) body += `${property}: ${swapped}${rule.style.getPropertyPriority(property) ? " !important" : ""}; `;
            }
            if(body) css += `${rule.selectorText.replaceAll("html.dark", "html.dark.otd-lights-out")} { ${body}}\n`;
        }
        return css;
    }
    let lightsOut;
    function drawLightsOut() {
        const on = OTD.isOn("lightsOut");
        document.documentElement.classList.toggle("otd-lights-out", on);
        if(!on || lightsOut) return;
        let css = "";
        for(const sheet of document.styleSheets) {
            if(sheet.ownerNode?.id === "otd-lights-out") continue;
            try {
                css += lightsOutRules(sheet.cssRules);
            } catch(e) {
                // a sheet from elsewhere
            }
        }
        lightsOut = OTD.addStyle(`${css}
            /* TweetDeck parts tweets with black lines, on black they'd be gone */
            html.dark.otd-lights-out .stream-item { border-bottom-color: #2f3336; }
        `);
        lightsOut.id = "otd-lights-out";
    }
    drawLightsOut();
    OTD.onChange("OTDlightsOut", drawLightsOut);
})();
