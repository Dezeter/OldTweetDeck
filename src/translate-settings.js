// Translation settings in Settings → General: one switch for automatic translation (Grok for tweets,
// Google for articles) and the target language. Writes the same localStorage keys grok-translate.js and
// x-articles.js read on load, so changes apply after a reload. Loaded by injection.js after bundle.js.
(() => {
    const UI_LANG = (navigator.language || "en").split("-")[0];
    const LABELS = {
        ru: { toggle: "Автоперевод: твиты через Grok, статьи через Google (OldTweetDeck)", lang: "Переводить на", browser: "язык браузера", reload: "Применится после перезагрузки.", reloadNow: "Перезагрузить" },
        en: { toggle: "Auto-translate: tweets with Grok, articles with Google (OldTweetDeck)", lang: "Translate to", browser: "browser language", reload: "Applies after a reload.", reloadNow: "Reload now" },
    };
    const LABEL = LABELS[UI_LANG] || LABELS.en;
    const LANGUAGES = ["ru", "en", "uk", "be", "kk", "de", "fr", "es", "it", "pt", "pl", "cs", "nl", "sv", "fi", "tr", "ar", "fa", "he", "hi", "id", "vi", "th", "ja", "ko", "zh"];

    let names;
    try {
        names = new Intl.DisplayNames([UI_LANG], { type: "language" });
    } catch(e) {
        names = { of: code => code };
    }
    const browserLang = (navigator.language || "en").split("-")[0].toLowerCase();

    const isOn = () => localStorage.OTDgrokTranslate !== "0";
    function setOn(on) {
        for(const key of ["OTDgrokTranslate", "OTDarticlesTranslate"]) {
            if(on) localStorage.removeItem(key);
            else localStorage[key] = "0";
        }
    }

    function build() {
        const block = document.createElement("div");
        block.className = "otd-translate-settings";

        const row = document.createElement("div");
        const toggle = document.createElement("i");
        toggle.className = `icon icon-small ${isOn() ? "icon-toggle-on" : "icon-toggle-off"} color-twitter-blue is-actionable align-top`;
        const label = document.createElement("span");
        label.className = "margin-l--4";
        label.textContent = LABEL.toggle;
        // TweetDeck's template has a space between the switch and its label
        row.append(toggle, " ", label);

        const langRow = document.createElement("div");
        langRow.className = "otd-translate-lang";
        const langLabel = document.createElement("label");
        langLabel.textContent = `${LABEL.lang} `;
        const select = document.createElement("select");
        const auto = new Option(`${names.of(browserLang) || browserLang} (${LABEL.browser})`, "");
        select.append(auto, ...LANGUAGES.map(code => new Option(`${names.of(code) || code} (${code})`, code)));
        select.value = localStorage.OTDgrokTranslateLang || "";
        // a code typed into the console earlier that isn't in the list
        if(select.value !== (localStorage.OTDgrokTranslateLang || "")) {
            const code = localStorage.OTDgrokTranslateLang;
            select.append(new Option(code, code));
            select.value = code;
        }
        langLabel.append(select);
        langRow.append(langLabel);

        const note = document.createElement("div");
        note.className = "otd-translate-note txt-mute is-hidden";
        const reload = document.createElement("a");
        reload.href = "#";
        reload.textContent = LABEL.reloadNow;
        note.append(`${LABEL.reload} `, reload);

        const changed = () => note.classList.remove("is-hidden");
        toggle.addEventListener("click", () => {
            setOn(!isOn());
            toggle.classList.toggle("icon-toggle-on", isOn());
            toggle.classList.toggle("icon-toggle-off", !isOn());
            changed();
        });
        // stays enabled with auto-translate off: the reader's translate button uses it too
        select.addEventListener("change", () => {
            if(select.value) localStorage.OTDgrokTranslateLang = select.value;
            else localStorage.removeItem("OTDgrokTranslateLang");
            changed();
        });
        reload.addEventListener("click", e => {
            e.preventDefault();
            location.reload();
        });

        block.append(row, langRow, note);
        return block;
    }

    // the settings dialog is rendered on demand and again on every tab switch
    function inject() {
        const group = document.querySelector("#general_settings .control-group");
        if(!group || group.querySelector(".otd-translate-settings")) return;
        // after the last switch, before the theme / columns / font size part
        const divider = group.querySelector(":scope > .divider-bar");
        if(divider) divider.before(build());
        else group.append(build());
    }

    let scheduled = false;
    new MutationObserver(() => {
        if(scheduled) return;
        scheduled = true;
        requestAnimationFrame(() => {
            scheduled = false;
            inject();
        });
    }).observe(document.documentElement, { childList: true, subtree: true });

    const style = document.createElement("style");
    style.textContent = `
        .otd-translate-settings .otd-translate-lang { margin: 6px 0 0 30px; }
        .otd-translate-settings .otd-translate-lang select { margin-left: 6px; max-width: 220px; }
        .otd-translate-settings .otd-translate-note { margin: 6px 0 0 30px; font-size: 12px; }
    `;
    (document.getElementById("injected-head") || document.head).appendChild(style);
})();
