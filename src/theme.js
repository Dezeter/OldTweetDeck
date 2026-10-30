// TweetDeck's theme:
// - "System" next to Dark and Light in TweetDeck's settings, and in the TweeXDeck tab: the theme follows the
//   system's prefers-color-scheme, as it changes too. TweetDeck still sees "dark" or "light", so all its own
//   checks of the theme keep working; OTD.THEME_SYSTEM_STORAGE remembers the pick;
// - the dark theme is a calm one, in place of TweetDeck's dark blue (UX audit, October 2026): neutral greys, a
//   step lighter for each layer (the app and its left bar, a column, what's inside a tweet), parts set apart by
//   their shade rather than frames, a hairline between tweets, grey icons, three greys of text, names in 600,
//   one accent, a soft blue, for links and focus; red and green only for a like and a retweet. TweetDeck's own
//   dark rules get twins with these greys in place of its blues, so its menus, dialogs and drawers are calm too,
//   then a few rules of its layout follow. The colors are --otd-* properties of html.dark for this extension's
//   own parts;
// - "lightsOut": the same in black, as x.com's, for OLED screens: the twins of TweetDeck's rules have x.com's
//   colors (html.dark.otd-lights-out), the properties black ones.
// All apply without a reload. Loaded by injection.js after otd-common.js.
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

    // TweetDeck's dark blues, its bluish greys, its blue, its focus ring and pressed blue as the calm theme has
    // them: backgrounds, the darker app background, headers and drawers, borders, threads and scrollbars, grey and
    // light text. Its blue is the
    // soft one for text, lines and icons, a deeper one under white text (#7c9cff would be 2.4:1 there, this 4.8:1)
    const CALM = {
        "21, 32, 43": "19, 20, 22",
        "16, 23, 30": "8, 9, 10",
        "28, 41, 56": "28, 29, 31",
        "56, 68, 77": "40, 42, 46",
        "61, 84, 102": "48, 50, 55",
        "20, 23, 26": "33, 34, 36",
        "136, 153, 166": "154, 158, 166",
        "101, 119, 134": "128, 132, 140",
        "25, 36, 47": "26, 27, 29",
        "225, 232, 237": "230, 231, 233",
        "204, 214, 221": "212, 214, 218",
        "170, 184, 194": "176, 180, 186",
        "245, 248, 250": "244, 245, 246",
        "29, 161, 242": "124, 156, 255",
        "27, 149, 224": "124, 156, 255",
        "113, 201, 248": "124, 156, 255",
        // unread, a hint of the accent
        "22, 48, 67": "28, 33, 52",
    };
    // a selected unread tweet's grey stays dark under white text
    const CALM_FILL = { ...CALM, "29, 161, 242": "68, 102, 238", "27, 149, 224": "68, 102, 238", "0, 95, 209": "52, 82, 204", "101, 119, 134": "58, 61, 68" };
    // and x.com's Lights out, with the calm theme's greys of text
    const LIGHTS_OUT = {
        "21, 32, 43": "0, 0, 0",
        "16, 23, 30": "22, 24, 28",
        "28, 41, 56": "22, 24, 28",
        "56, 68, 77": "47, 51, 54",
        "61, 84, 102": "62, 65, 68",
        "136, 153, 166": "154, 158, 166",
        "101, 119, 134": "128, 132, 140",
    };
    const COLOR = /rgba?\((\d+), (\d+), (\d+)(, [\d.]+)?\)/g;
    const swap = (value, colors) => value.replace(COLOR, (all, r, g, b, alpha) => {
        const to = colors[`${r}, ${g}, ${b}`];
        return to ? (alpha ? `rgba(${to}${alpha})` : `rgb(${to})`) : all;
    });
    // a twin of every html.dark rule with one of these colors, the color swapped; a background's from fills
    function twins(rules, colors, fills, scope) {
        let css = "";
        for(const rule of rules) {
            if(rule.cssRules && rule.media) {
                const inner = twins(rule.cssRules, colors, fills, scope);
                if(inner) css += `@media ${rule.media.mediaText} { ${inner} }\n`;
                continue;
            }
            if(!rule.selectorText?.includes("html.dark")) continue;
            let body = "";
            for(const property of rule.style) {
                const value = rule.style.getPropertyValue(property);
                const swapped = swap(value, property.startsWith("background") ? fills : colors);
                if(swapped !== value) body += `${property}: ${swapped}${rule.style.getPropertyPriority(property) ? " !important" : ""}; `;
            }
            if(body) css += `${rule.selectorText.replaceAll("html.dark", scope)} { ${body}}\n`;
        }
        return css;
    }
    // In Firefox injection.js is a content script, and the <style> it puts TweetDeck's CSS in is the extension's:
    // its rules are closed to the page (a SecurityError), its text isn't. That text, once, in a sheet of the page's
    const copies = new WeakMap();
    let fromText = false;
    function rulesOf(sheet) {
        try {
            return sheet.cssRules;
        } catch(e) {
            const style = sheet.ownerNode;
            if(style?.tagName !== "STYLE" || !window.CSSStyleSheet?.prototype.replaceSync) throw e;
            fromText = true;
            if(!copies.has(style)) {
                const copy = new CSSStyleSheet();
                copy.replaceSync(style.textContent);
                copies.set(style, copy);
            }
            return copies.get(style).cssRules;
        }
    }
    const OURS = ["otd-calm", "otd-lights-out"];
    function twinsOfAll(colors, fills, scope) {
        let css = "";
        for(const sheet of document.styleSheets) {
            if(OURS.includes(sheet.ownerNode?.id)) continue;
            try {
                css += twins(rulesOf(sheet), colors, fills, scope);
            } catch(e) {
                // a sheet from elsewhere
            }
        }
        return css;
    }

    const calm = OTD.addStyle("");
    calm.id = "otd-calm";
    const layout = OTD.addStyle(`
        html.dark {
            --otd-app: #08090a; --otd-panel: #131416; --otd-panel-edge: transparent;
            --otd-raised: rgba(255, 255, 255, .04); --otd-raised-hover: rgba(255, 255, 255, .06); --otd-raised-solid: #1c1d1f;
            --otd-hover: rgba(255, 255, 255, .025); --otd-line: rgba(255, 255, 255, .06); --otd-media-edge: rgba(255, 255, 255, .07);
            --otd-text: #e6e7e9; --otd-text-2: #9a9ea6; --otd-text-3: #80848c;
            --otd-accent: #7c9cff; --otd-accent-fill: #4466ee; --otd-accent-tint: rgba(124, 156, 255, .12);
        }
        /* on black a column is set apart by a hairline round it */
        html.dark.otd-lights-out {
            --otd-app: #000; --otd-panel: #000; --otd-panel-edge: rgba(255, 255, 255, .1);
            --otd-raised: rgba(255, 255, 255, .06); --otd-raised-hover: rgba(255, 255, 255, .08); --otd-raised-solid: #0f0f0f;
            --otd-hover: rgba(255, 255, 255, .03); --otd-line: rgba(255, 255, 255, .1); --otd-media-edge: rgba(255, 255, 255, .1);
            --otd-text: #e7e9ea;
        }

        /* layers: the app and its left bar, the columns on it with round corners, set apart by their shade */
        html.dark body, html.dark .application, html.dark .app-content, html.dark .app-columns-container, html.dark .app-columns,
        html.dark .app-header, html.dark .app-navigator { background-color: var(--otd-app) !important; }
        html.dark .app-header-inner, html.dark .js-account-summary, html.dark .app-title, html.dark .column-nav, html.dark .column-nav-item { background-color: transparent !important; }
        html.dark .column-nav-item:hover { background-color: rgba(255, 255, 255, .04) !important; }
        html.dark .column { background-color: var(--otd-panel) !important; border-radius: 10px; }
        html.dark .column-panel { background-color: var(--otd-panel) !important; box-shadow: inset 0 0 0 1px var(--otd-panel-edge); border-radius: 10px; }
        html.dark .column-header { background-color: transparent !important; border-bottom: 1px solid var(--otd-line) !important; }
        html.dark .column-heading { color: var(--otd-text); font-weight: 600; }
        html.dark .column-header .attribution { color: var(--otd-text-3); }
        /* TweetDeck's numbers of the columns, for its keys; the grip to move a column, where the pointer is */
        html.dark .column-number { display: none; }
        html.dark .column-drag-handle { opacity: 0; transition: opacity .15s; }
        html.dark .column-header:hover .column-drag-handle { opacity: .5; }

        /* icons grey, the text's color under the pointer; the compose and search buttons without the blue */
        html.dark .app-header .icon, html.dark .app-navigator .icon, html.dark .column-header .icon, html.dark .column-header-link { color: var(--otd-text-2) !important; }
        html.dark .app-header a:hover .icon, html.dark .app-header button:hover .icon, html.dark .column-header-link:hover .icon { color: var(--otd-text) !important; }
        html.dark .app-header .js-show-drawer.Button, html.dark .app-search-fake { background-color: rgba(255, 255, 255, .06) !important; border-color: transparent !important; }
        html.dark .app-header .js-show-drawer.Button .icon, html.dark .app-search-fake .icon { color: var(--otd-text) !important; }

        /* tweets: a hairline between them, a shade under the pointer; the one picked with the keys and unread ones
           keep TweetDeck's marks, in these colors */
        html.dark .stream-item { border-bottom-color: var(--otd-line) !important; }
        html.dark .stream-item:not(.is-selected-tweet):not(.is-unread):hover { background-color: var(--otd-hover); }
        html.dark :is(.tweet-text, .js-quoted-tweet-text, .fullname) { color: var(--otd-text) !important; }
        html.dark .tweet.txt-mute .tweet-text { color: var(--otd-text-2) !important; }
        html.dark :is(.fullname, .account-inline b, .activity-header .account-link) { font-weight: 600 !important; }
        html.dark .activity-header .account-link { color: var(--otd-text) !important; }
        html.dark :is(.username, .tweet-timestamp, .tweet-timestamp a, .tweet-footer > a.txt-mute) { color: var(--otd-text-3) !important; }

        /* a quote, a link card: a shade of its own instead of a frame */
        html.dark .quoted-tweet { border-color: transparent !important; background-color: var(--otd-raised) !important; }
        html.dark .quoted-tweet:hover { background-color: var(--otd-raised-hover) !important; }

        /* what's only context grey: "↩ @name", "Show this thread"; a follow's button and the reply box without frames */
        html.dark :is(.other-replies, .other-replies-link) { color: var(--otd-text-2) !important; }
        html.dark .js-show-this-thread .color-twitter-blue { color: var(--otd-text-2) !important; }
        html.dark .js-show-this-thread:hover .color-twitter-blue { color: var(--otd-text) !important; }
        html.dark .btn-on-dark { border-color: transparent !important; background-color: rgba(255, 255, 255, .06) !important; }
        html.dark .btn-on-dark:hover { background-color: rgba(255, 255, 255, .1) !important; }
        html.dark .btn-on-dark .icon { color: var(--otd-text-2) !important; }
        html.dark :is(.detail-view-inline, .detail-view-inline-text) { border-color: var(--otd-line) !important; }

        html.dark, html.dark * { scrollbar-width: thin; scrollbar-color: rgba(255, 255, 255, .14) transparent; }
    `);

    // The twins keep the selectors, later than TweetDeck's, so they win as Lights out's win over them. Without
    // TweetDeck's CSS yet, again once TweetDeck is ready, and then after it.
    let lightsOut;
    const count = style => style?.sheet?.cssRules.length || 0;
    function drawCalm() {
        if(count(calm)) return;
        calm.textContent = twinsOfAll(CALM, CALM_FILL, "html.dark");
        calm.parentNode?.append(calm, layout, ...(lightsOut ? [lightsOut] : []));
    }
    function drawLightsOut() {
        const on = OTD.isOn("lightsOut");
        document.documentElement.classList.toggle("otd-lights-out", on);
        if(!on || count(lightsOut)) return;
        if(!lightsOut) {
            lightsOut = OTD.addStyle("");
            lightsOut.id = "otd-lights-out";
        }
        lightsOut.textContent = twinsOfAll(LIGHTS_OUT, LIGHTS_OUT, "html.dark.otd-lights-out");
    }
    // for the load watchdog's report
    const report = () => document.dispatchEvent(new CustomEvent("otd-diagnostic", { detail: JSON.stringify({ kind: "theme",
        text: `${count(calm)} twins of TweetDeck's rules${lightsOut ? `, ${count(lightsOut)} for Lights out` : ""}${fromText ? ", its CSS read from its text" : ""}` }) }));
    const draw = () => {
        drawCalm();
        drawLightsOut();
        report();
    };
    draw();
    OTD.jQuery()?.(document).one("TD.ready.otd-twins", draw);
    OTD.onChange("OTDlightsOut", draw);
})();
