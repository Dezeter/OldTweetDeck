// The TweeXDeck tab in TweetDeck's settings: a switch for every feature in OTD.FEATURES, by section, the
// language to translate to and the font. They write the localStorage keys the features read on load, so changes apply
// after a reload. Loaded by injection.js after otd-common.js.
(() => {
    const GlobalSettings = window.TD?.components?.GlobalSettings;
    if(!GlobalSettings) return;

    const TAB = "oldtweetdeck";
    const RELEASES = "https://github.com/Dezeter/TweeXDeck/releases";
    const LABEL = OTD.label({
        ru: { lang: "Переводить на", browser: "язык браузера", font: "Шрифт", systemFont: "системный, как в TweetDeck", reload: "Применится после перезагрузки.", reloadNow: "Перезагрузить", releases: "Релизы и обновления",
            diagnostics: "Скопировать диагностику", copied: "Скопировано",
            sections: { translation: "Перевод", columns: "Колонки", tweets: "Твиты", media: "Медиа", compose: "Написание", other: "Прочее" } },
        en: { lang: "Translate to", browser: "browser language", font: "Font", systemFont: "system, as in TweetDeck", reload: "Applies after a reload.", reloadNow: "Reload now", releases: "Releases and updates",
            diagnostics: "Copy diagnostics", copied: "Copied",
            sections: { translation: "Translation", columns: "Columns", tweets: "Tweets", media: "Media", compose: "Composing", other: "Other" } },
    });
    const LANGUAGES = ["ru", "en", "uk", "be", "kk", "de", "fr", "es", "it", "pt", "pl", "cs", "nl", "sv", "fi", "tr", "ar", "fa", "he", "hi", "id", "vi", "th", "ja", "ko", "zh"];

    let names;
    try {
        names = new Intl.DisplayNames([OTD.UI_LANG], { type: "language" });
    } catch(e) {
        names = { of: code => code };
    }

    function el(tag, className, text) {
        const node = document.createElement(tag);
        if(className) node.className = className;
        if(text !== undefined) node.textContent = text;
        return node;
    }

    // TweetDeck's switch: an icon and a label, the whole row toggles
    function toggleRow(feature, changed) {
        const row = el("div", "otd-setting");
        row.dataset.feature = feature.key;
        const icon = el("i", "icon icon-small color-twitter-blue is-actionable align-top");
        const show = () => {
            icon.classList.toggle("icon-toggle-on", OTD.isOn(feature.key));
            icon.classList.toggle("icon-toggle-off", !OTD.isOn(feature.key));
        };
        show();
        // TweetDeck's template has a space between the switch and its label
        row.append(icon, " ", el("span", "margin-l--4", OTD.label(feature.label)));
        row.addEventListener("click", () => {
            OTD.setOn(feature.key, !OTD.isOn(feature.key));
            show();
            changed();
        });
        return row;
    }

    function languageRow(changed) {
        const row = el("div", "otd-settings-lang");
        const label = el("label", null, `${LABEL.lang} `);
        const select = document.createElement("select");
        const browserLang = (navigator.language || "en").split("-")[0].toLowerCase();
        select.append(
            new Option(`${names.of(browserLang) || browserLang} (${LABEL.browser})`, ""),
            ...LANGUAGES.map(code => new Option(`${names.of(code) || code} (${code})`, code)),
        );
        const current = localStorage[OTD.LANG_STORAGE] || "";
        // a code typed into the console that isn't in the list
        if(current && !LANGUAGES.includes(current)) select.append(new Option(current, current));
        select.value = current;
        select.addEventListener("change", () => {
            if(select.value) localStorage[OTD.LANG_STORAGE] = select.value;
            else localStorage.removeItem(OTD.LANG_STORAGE);
            changed();
        });
        label.append(select);
        row.append(label);
        return row;
    }

    // fonts.js draws the one picked here; TweetDeck's own without the key
    function fontRow(changed) {
        const row = el("div", "otd-settings-font");
        const label = el("label", null, `${LABEL.font} `);
        const select = document.createElement("select");
        select.append(new Option(LABEL.systemFont, ""), ...OTD.FONTS.map(font => new Option(font.name, font.key)));
        select.value = OTD.FONTS.some(font => font.key === localStorage[OTD.FONT_STORAGE]) ? localStorage[OTD.FONT_STORAGE] : "";
        select.addEventListener("change", () => {
            if(select.value) localStorage[OTD.FONT_STORAGE] = select.value;
            else localStorage.removeItem(OTD.FONT_STORAGE);
            changed();
        });
        label.append(select);
        row.append(label);
        return row;
    }

    function build() {
        const fieldset = el("fieldset");
        fieldset.id = "otd-settings";
        fieldset.append(el("legend", null, "TweeXDeck"));

        const note = el("div", "otd-settings-note txt-mute is-hidden", `${LABEL.reload} `);
        const reload = el("a", null, LABEL.reloadNow);
        reload.href = "#";
        reload.addEventListener("click", e => {
            e.preventDefault();
            location.reload();
        });
        note.append(reload);
        const changed = () => note.classList.remove("is-hidden");

        const sections = [...new Set(OTD.FEATURES.map(f => f.section))];
        sections.forEach((section, i) => {
            if(i) fieldset.append(el("div", "divider-bar"));
            const group = el("div", "control-group otd-settings-section");
            group.dataset.section = section;
            const title = el("label", "txt-uppercase touch-larger-label");
            title.append(el("b", null, LABEL.sections[section]));
            group.append(title);
            if(section === "other") group.append(fontRow(changed));
            for(const feature of OTD.FEATURES.filter(f => f.section === section)) group.append(toggleRow(feature, changed));
            // the reader's translate button uses the language too, so it stays with translation off
            if(section === "translation") group.append(languageRow(changed));
            fieldset.append(group);
        });

        const about = el("div", "otd-settings-about txt-mute", `TweeXDeck${OTD.VERSION ? ` ${OTD.VERSION}` : ""} · `);
        const releases = el("a", null, LABEL.releases);
        releases.href = RELEASES;
        releases.target = "_blank";
        releases.rel = "noopener noreferrer";
        about.append(releases);
        // the load watchdog's report (watchdog.js), for an issue about something that doesn't work
        const diagnostics = el("a", "otd-settings-diagnostics", LABEL.diagnostics);
        diagnostics.href = "#";
        diagnostics.addEventListener("click", async e => {
            e.preventDefault();
            let report = "";
            const take = e => { report = e.detail; };
            document.addEventListener("otd-diagnostic-report", take);
            document.dispatchEvent(new CustomEvent("otd-diagnostic-request"));
            document.removeEventListener("otd-diagnostic-report", take);
            if(!report) return;
            try {
                await navigator.clipboard.writeText(report);
            } catch(err) {
                return;
            }
            diagnostics.textContent = LABEL.copied;
            setTimeout(() => { diagnostics.textContent = LABEL.diagnostics; }, 2000);
        });
        about.append(" · ", diagnostics);
        fieldset.append(note, about);
        return fieldset;
    }

    const proto = GlobalSettings.prototype;
    const getInfo = proto.getInfo;
    proto.getInfo = function() {
        const info = getInfo.apply(this, arguments);
        info.tabs.push({ title: "TweeXDeck", action: TAB });
        return info;
    };
    // TweetDeck's switchTab renders its own tabs into the form; ours is drawn after it switched
    const switchTab = proto.switchTab;
    proto.switchTab = function(tab) {
        const form = document.getElementById("global-settings");
        if(this.currentTabName === TAB && tab !== TAB) form?.replaceChildren();
        switchTab.apply(this, arguments);
        if(tab === TAB && form && !form.querySelector("#otd-settings")) {
            // its teardown event belongs to the tab it already tore down
            this.teardownEvent = null;
            form.replaceChildren(build());
        }
    };

    OTD.addStyle(`
        #otd-settings .otd-settings-section > label { display: block; margin-bottom: 4px; }
        /* a long label wraps next to its switch, not under it */
        #otd-settings .otd-setting { display: flex; align-items: flex-start; margin-bottom: 3px; cursor: pointer; }
        /* in a flex row the space after the switch is gone, the margin stands in for it */
        #otd-settings .otd-setting > i { flex: none; margin-right: 4px; }
        #otd-settings .otd-setting > span { flex: 1; }
        #otd-settings a { color: #1da1f2; }
        #otd-settings .otd-settings-lang { margin: 6px 0 0 30px; }
        #otd-settings .otd-settings-font { margin: 0 0 6px; }
        #otd-settings .otd-settings-lang select, #otd-settings .otd-settings-font select { margin-left: 6px; max-width: 220px; }
        #otd-settings .otd-settings-note, #otd-settings .otd-settings-about { margin-top: 10px; font-size: 12px; }
    `);
})();
