// An "Emoji" button in the docked composer opens a panel to pick emoji: search by name in Russian or English,
// the groups, the recently used ones first. The emoji are files/emoji.json (scripts/build-emoji.js), loaded
// the first time the panel opens. Loaded by injection.js after otd-common.js. Switch "emojiPicker".
(() => {
    if(!OTD.isOn("emojiPicker")) return;

    const RECENT = "OTDemojiRecent";
    const MAX_RECENT = 24;
    const MAX_FOUND = 240;
    const LABEL = OTD.label({
        ru: { button: "Эмодзи", search: "Найти эмодзи", recent: "Недавние", found: "Найдено", nothing: "Ничего не нашлось", failed: "Не удалось загрузить эмодзи" },
        en: { button: "Emoji", search: "Search emoji", recent: "Recently used", found: "Found", nothing: "Nothing found", failed: "Couldn't load the emoji" },
    });

    let data = null;
    const load = () => data ??= fetch(`${OTD.BASE_URL}files/emoji.json`).then(res => {
        if(!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
    });

    function recent() {
        try {
            return JSON.parse(localStorage[RECENT] || "[]");
        } catch(e) {
            return [];
        }
    }
    function remember(emoji) {
        localStorage[RECENT] = JSON.stringify([emoji, ...recent().filter(e => e !== emoji)].slice(0, MAX_RECENT));
    }

    // at the caret of the composer's text, and TweetDeck counts the characters again on "input"
    function insert(composer, emoji) {
        const box = composer.querySelector("textarea.js-compose-text");
        if(!box) return;
        const start = box.selectionStart ?? box.value.length;
        const end = box.selectionEnd ?? start;
        box.focus();
        box.setRangeText(emoji, start, end, "end");
        box.dispatchEvent(new Event("input", { bubbles: true }));
    }

    function el(tag, className, text) {
        const node = document.createElement(tag);
        if(className) node.className = className;
        if(text !== undefined) node.textContent = text;
        return node;
    }
    function grid(entries) {
        const box = el("div", "otd-emoji-grid");
        for(const entry of entries) {
            const button = el("button", "otd-emoji", entry.char);
            button.type = "button";
            button.title = entry.title;
            box.append(button);
        }
        return box;
    }

    function build(panel, composer) {
        const search = el("input", "otd-picker-search");
        search.type = "search";
        search.placeholder = LABEL.search;
        const tabs = el("div", "otd-emoji-tabs");
        const body = el("div", "otd-picker-body");
        const note = el("div", "otd-picker-note", "…");
        body.append(note);
        panel.append(search, tabs, body);

        load().then(({ groups, emoji }) => {
            note.remove();
            const names = groups[OTD.UI_LANG] || groups.en;
            const entries = emoji.map(([char, group, en, ru, enTags, ruTags]) => ({
                char, group,
                title: OTD.UI_LANG === "ru" && ru ? ru : en,
                text: `${en} ${ru} ${enTags} ${ruTags}`.toLowerCase(),
            }));
            const byChar = new Map(entries.map(entry => [entry.char, entry]));

            const recentSection = el("section", "otd-emoji-section");
            const showRecent = () => {
                const list = recent().map(char => byChar.get(char)).filter(Boolean);
                recentSection.replaceChildren(el("div", "otd-picker-heading", LABEL.recent), grid(list));
                recentSection.hidden = !list.length;
            };
            showRecent();
            const all = el("div", "otd-emoji-all");
            all.append(recentSection);
            for(const group of [...new Set(entries.map(entry => entry.group))]) {
                const list = entries.filter(entry => entry.group === group);
                const section = el("section", "otd-emoji-section");
                section.dataset.group = group;
                section.append(el("div", "otd-picker-heading", names[group] || ""), grid(list));
                all.append(section);
                const tab = el("button", "otd-emoji-tab", list[0].char);
                tab.type = "button";
                tab.title = names[group] || "";
                tab.addEventListener("click", () => {
                    search.value = "";
                    filter();
                    body.scrollTop = section.offsetTop - body.offsetTop;
                });
                tabs.append(tab);
            }
            const results = el("section", "otd-emoji-section");
            body.append(all, results);

            // every word of the query, anywhere in the names and tags, in either language
            function filter() {
                const words = search.value.toLowerCase().split(/\s+/).filter(Boolean);
                all.hidden = words.length > 0;
                results.hidden = !words.length;
                if(!words.length) return;
                const found = entries.filter(entry => words.every(word => entry.text.includes(word))).slice(0, MAX_FOUND);
                results.replaceChildren(found.length ? grid(found) : el("div", "otd-picker-note", LABEL.nothing));
                body.scrollTop = 0;
            }
            search.addEventListener("input", filter);
            filter();

            body.addEventListener("click", e => {
                const button = e.target.closest(".otd-emoji");
                if(!button) return;
                insert(composer, button.textContent);
                remember(button.textContent);
                showRecent();
            });
        }).catch(e => {
            console.error("[otd-emoji]", e);
            note.textContent = LABEL.failed;
            // try again next time the panel is built
            data = null;
        });
    }

    OTD.addComposerButton({
        name: "emoji", icon: "😊", label: LABEL.button, build,
        open: panel => panel.querySelector(".otd-picker-search").focus(),
    });

    OTD.addStyle(`
        .otd-emoji-panel .otd-emoji-tabs { display: flex; gap: 2px; padding: 0 6px 4px; border-bottom: 1px solid rgba(136, 153, 166, .3); }
        .otd-emoji-panel .otd-emoji-tab { flex: 1; padding: 2px 0; border: 0; border-radius: 4px; background: none; font-size: 16px; cursor: pointer; }
        .otd-emoji-panel .otd-emoji-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(34px, 1fr)); }
        .otd-emoji-panel .otd-emoji { height: 34px; padding: 0; border: 0; border-radius: 6px; background: none; font-size: 22px; line-height: 34px; cursor: pointer; }
        .otd-emoji-panel .otd-emoji, .otd-emoji-panel .otd-emoji-tab { font-family: "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif; }
        .otd-emoji-panel .otd-emoji:hover, .otd-emoji-panel .otd-emoji-tab:hover { background: rgba(29, 161, 242, .15); }
        .otd-emoji-panel [hidden] { display: none; }
    `);
})();
