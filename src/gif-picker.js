// A "GIF" button in the docked composer opens a panel that searches GIFs with x.com's own GIF search
// (/1.1/foundmedia/search.json, the one its composer uses) and attaches the picked one to the tweet like
// an image picked with "Add image". Loaded by injection.js after otd-common.js. Switch "gifPicker".
(() => {
    if(!OTD.isOn("gifPicker")) return;

    const PATH = "/1.1/foundmedia/search.json";
    const LABEL = OTD.label({
        ru: { button: "Найти GIF", search: "Найти GIF", hint: "Введите запрос, например «кот»", nothing: "Ничего не нашлось", failed: "Поиск GIF не ответил", more: "Ещё", attaching: "Прикрепляю GIF…", attachFailed: "Не удалось скачать GIF" },
        en: { button: "Find a GIF", search: "Search GIFs", hint: "Type what to look for, like \"cat\"", nothing: "Nothing found", failed: "The GIF search didn't answer", more: "More", attaching: "Attaching the GIF…", attachFailed: "Couldn't download the GIF" },
    });

    // items as x.com's GIF search gives them; anything without a picture to show and a file to attach is left out
    async function searchGifs(query, cursor) {
        const params = new URLSearchParams({ q: query, count: "24" });
        if(cursor) params.set("cursor", cursor);
        const headers = await OTD.xHeaders(PATH, "GET");
        const res = await fetch(`https://api.${location.hostname}${PATH}?${params}`, { headers, credentials: "include" });
        if(!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        const items = (json?.data?.items || json?.items || []).map(item => ({
            preview: item.preview_image?.url || item.still_image?.url || item.original_image?.url,
            original: item.original_image?.url || item.url,
            alt: item.alt_text || "",
        })).filter(item => /^https:\/\//.test(item.preview || "") && /^https:\/\//.test(item.original || ""));
        return { items, cursor: json?.cursor?.next || null };
    }

    function el(tag, className, text) {
        const node = document.createElement(tag);
        if(className) node.className = className;
        if(text !== undefined) node.textContent = text;
        return node;
    }

    function build(panel, composer) {
        const search = el("input", "otd-picker-search");
        search.type = "search";
        search.placeholder = LABEL.search;
        const body = el("div", "otd-picker-body");
        const note = el("div", "otd-picker-note", LABEL.hint);
        const results = el("div", "otd-gif-grid");
        const more = el("button", "otd-gif-more", LABEL.more);
        more.type = "button";
        more.hidden = true;
        body.append(note, results, more);
        panel.append(search, body);

        let query = "";
        let cursor = null;
        let request = 0;
        async function run(append) {
            const id = ++request;
            if(!append) {
                results.replaceChildren();
                cursor = null;
            }
            more.hidden = true;
            if(!query) {
                note.textContent = LABEL.hint;
                note.hidden = false;
                return;
            }
            note.textContent = "…";
            note.hidden = append;
            try {
                const page = await searchGifs(query, append ? cursor : null);
                if(id !== request) return;
                for(const item of page.items) {
                    const button = el("button", "otd-gif");
                    button.type = "button";
                    button.dataset.original = item.original;
                    button.title = item.alt;
                    const img = el("img");
                    img.loading = "lazy";
                    img.alt = item.alt;
                    img.src = item.preview;
                    button.append(img);
                    results.append(button);
                }
                cursor = page.cursor;
                note.hidden = results.childElementCount > 0;
                note.textContent = LABEL.nothing;
                more.hidden = !cursor;
            } catch(e) {
                if(id !== request) return;
                console.error("[otd-gif]", e);
                note.textContent = LABEL.failed;
                note.hidden = false;
            }
        }

        let timer = 0;
        search.addEventListener("input", () => {
            clearTimeout(timer);
            timer = setTimeout(() => {
                query = search.value.trim();
                run(false);
            }, 400);
        });
        search.addEventListener("keydown", e => {
            if(e.key !== "Enter") return;
            e.preventDefault();
            clearTimeout(timer);
            query = search.value.trim();
            run(false);
        });
        more.addEventListener("click", () => run(true));

        // the GIF file itself, attached through TweetDeck's own upload
        results.addEventListener("click", async e => {
            const button = e.target.closest(".otd-gif");
            if(!button) return;
            note.textContent = LABEL.attaching;
            note.hidden = false;
            try {
                const res = await fetch(button.dataset.original);
                if(!res.ok) throw new Error(`HTTP ${res.status}`);
                const blob = await res.blob();
                const type = blob.type.startsWith("image/") ? blob.type : "image/gif";
                const file = new File([blob], `gif.${type.split("/")[1]}`, { type });
                const box = composer.querySelector("textarea.js-compose-text");
                if(!box || !OTD.attachFiles(box, [file])) throw new Error("no upload input");
                panel.hidden = true;
            } catch(e) {
                console.error("[otd-gif]", e);
                note.textContent = LABEL.attachFailed;
            }
        });
    }

    OTD.addComposerButton({
        name: "gif", icon: "GIF", label: LABEL.button, build,
        open: panel => panel.querySelector(".otd-picker-search").focus(),
    });

    OTD.addStyle(`
        .otd-gif-panel .otd-gif-grid { columns: 2; column-gap: 4px; }
        .otd-gif-panel .otd-gif { display: block; width: 100%; margin: 0 0 4px; padding: 0; border: 0; border-radius: 6px; overflow: hidden; background: rgba(136, 153, 166, .2); cursor: pointer; break-inside: avoid; }
        .otd-gif-panel .otd-gif img { display: block; width: 100%; }
        .otd-gif-panel .otd-gif:hover { outline: 2px solid #1da1f2; }
        .otd-gif-panel .otd-gif-more { display: block; margin: 4px auto; padding: 4px 12px; border: 0; border-radius: 14px; background: #1da1f2; color: #fff; cursor: pointer; }
        .otd-gif-panel [hidden] { display: none; }
        /* "GIF" in a small frame, in the one-glyph icon slot */
        .otd-compose-button[data-otd-button="gif"] .otd-compose-icon { height: 14px; font-size: 7px; font-weight: bold; line-height: 11px; border: 1.5px solid currentColor; border-radius: 3px; vertical-align: -1px; }
    `);
})();
