// Shared by this extension's scripts: the features and their switches, the translation language, labels,
// styles, and one watcher of the page for the scripts that rescan it. Loaded by injection.js after bundle.js,
// before the other local scripts, as window.OTD.
(() => {
    const UI_LANG = (navigator.language || "en").split("-")[0].toLowerCase();
    // injection.js puts the extension's version and the address of its files on <html>
    const VERSION = document.documentElement.dataset.otdVersion || "";
    const BASE_URL = document.documentElement.dataset.otdBase || "";

    // A feature is on by default unless it says default: false; localStorage[storage] "0" or "1" overrides that.
    // settings.js shows them as switches, by section, in this order.
    const FEATURES = [
        { key: "grokTranslate", storage: "OTDgrokTranslate", section: "translation",
            label: { ru: "Переводить твиты через Grok", en: "Translate tweets with Grok" } },
        { key: "articlesTranslate", storage: "OTDarticlesTranslate", section: "translation",
            label: { ru: "Переводить статьи через Google", en: "Translate articles with Google" } },
        { key: "hideHomeReplies", storage: "OTDhideHomeReplies", section: "columns",
            label: { ru: "Скрывать в домашних колонках ответы другим людям", en: "Hide replies to other people in home columns" } },
        { key: "groupNotifications", storage: "OTDgroupNotifications", section: "columns",
            label: { ru: "Группировать лайки, ретвиты и подписки в уведомлениях", en: "Group likes, retweets and follows in notifications" } },
        { key: "pauseOnHover", storage: "OTDpauseOnHover", section: "columns",
            label: { ru: "Не сдвигать колонку новыми твитами, пока над ней курсор", en: "Don't push a column down with new tweets while the pointer is over it" } },
        { key: "tabTitle", storage: "OTDtabTitle", section: "columns",
            label: { ru: "Непрочитанное в заголовке вкладки: «(3) TweetDeck»", en: "Unread in the tab title: \"(3) TweetDeck\"" } },
        { key: "loadAllReplies", storage: "OTDloadAllReplies", section: "tweets",
            label: { ru: "Загружать все ответы при просмотре твита", en: "Load all replies when viewing a tweet" } },
        { key: "instantReplies", storage: "OTDinstantReplies", section: "tweets",
            label: { ru: "Показывать свой ответ сразу после отправки", en: "Show your reply right after sending it" } },
        { key: "articles", storage: "OTDarticles", section: "tweets",
            label: { ru: "X Articles: заголовок и начало вместо ссылки, чтение в окне", en: "X Articles: title and beginning instead of the link, a reader" } },
        { key: "cleanLinks", storage: "OTDcleanLinks", section: "tweets",
            label: { ru: "Ссылки ведут прямо на сайт, а не через t.co", en: "Links go straight to the site, not through t.co" } },
        { key: "absoluteTime", storage: "OTDabsoluteTime", section: "tweets", default: false,
            label: { ru: "Время твита: «14:05» и дата вместо «5m»", en: "Tweet time: \"2:05 PM\" and the date instead of \"5m\"" } },
        { key: "redraft", storage: "OTDredraft", section: "tweets",
            label: { ru: "«Переписать» в меню своего твита: удалить его и открыть заново в окне твита", en: "\"Redraft\" in your tweet's menu: delete it and open it again in the tweet box" } },
        { key: "muteFromMenu", storage: "OTDmuteFromMenu", section: "tweets",
            label: { ru: "«Игнорировать #хэштег» и «Игнорировать твиты из …» в меню твита", en: "\"Mute #hashtag\" and \"Mute tweets from …\" in the tweet menu" } },
        { key: "rowMuteBlock", storage: "OTDrowMuteBlock", section: "tweets", default: false,
            label: { ru: "Кнопки «Игнорировать» и «Заблокировать» под твитами", en: "\"Mute\" and \"Block\" buttons under tweets" } },
        { key: "mediaAspect", storage: "OTDmediaAspect", section: "media",
            label: { ru: "Одиночные картинки в колонке целиком, без обрезки", en: "Single images in columns whole, not cropped" } },
        { key: "inlineVideo", storage: "OTDinlineVideo", section: "media",
            label: { ru: "Видео играют прямо в твите, а не в отдельном окне", en: "Videos play right in the tweet, not in a separate window" } },
        { key: "downloadMedia", storage: "OTDdownloadMedia", section: "media",
            label: { ru: "«Скачать медиа» в меню твита", en: "\"Download media\" in the tweet menu" } },
        { key: "copyMediaLinks", storage: "OTDcopyMediaLinks", section: "media",
            label: { ru: "«Скопировать ссылки на медиа» в меню твита", en: "\"Copy links to media\" in the tweet menu" } },
        { key: "pasteImages", storage: "OTDpasteImages", section: "compose",
            label: { ru: "Вставлять картинки по Ctrl+V", en: "Paste images with Ctrl+V" } },
        { key: "emojiPicker", storage: "OTDemojiPicker", section: "compose",
            label: { ru: "Кнопка «Эмодзи» в окне твита", en: "\"Emoji\" button in the tweet box" } },
        { key: "gifPicker", storage: "OTDgifPicker", section: "compose",
            label: { ru: "Кнопка «GIF» в окне твита: поиск GIF на X", en: "\"GIF\" button in the tweet box: X's GIF search" } },
        { key: "loadWatchdog", storage: "OTDloadWatchdog", section: "other",
            label: { ru: "Если TweetDeck не загрузился: перезагрузить страницу один раз, потом объяснить, что не так", en: "If TweetDeck doesn't load: reload the page once, then tell what's wrong" } },
    ];
    // the language tweets and articles are translated to
    const LANG_STORAGE = "OTDgrokTranslateLang";

    function feature(key) {
        const found = FEATURES.find(f => f.key === key);
        if(!found) throw new Error(`no OldTweetDeck feature ${key}`);
        return found;
    }
    function isOn(key) {
        const f = feature(key);
        const value = localStorage[f.storage];
        return value === undefined ? f.default !== false : value !== "0";
    }
    // the key is removed when the value is the default
    function setOn(key, on) {
        const f = feature(key);
        if(on === (f.default !== false)) localStorage.removeItem(f.storage);
        else localStorage[f.storage] = on ? "1" : "0";
    }
    const targetLang = () => (localStorage[LANG_STORAGE] || navigator.language || "en").split("-")[0].toLowerCase();
    const label = (labels, lang = UI_LANG) => labels[lang] || labels.en;

    const cookie = name => document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`))?.[1] || "";
    const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

    // Headers of a request to X's API as x.com sends them, with x-client-transaction-id when the solver
    // gives one within 5 s. extra adds or overrides headers.
    const BEARER = "Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA";
    async function xHeaders(path, method, extra = {}) {
        const headers = {
            "authorization": BEARER,
            "x-csrf-token": cookie("ct0"),
            "x-twitter-auth-type": "OAuth2Session",
            "x-twitter-active-user": "yes",
            "x-twitter-client-language": UI_LANG,
            ...extra,
        };
        if(localStorage.device_id) headers["x-client-uuid"] = localStorage.device_id;
        if(typeof solveChallenge === "function") {
            const id = await Promise.race([solveChallenge(path, method).catch(() => null), sleep(5000).then(() => null)]);
            if(id) headers["x-client-transaction-id"] = id;
        }
        return headers;
    }

    // The chirp TweetDeck rendered an element of a column from: the item's data-key in its column. Inside an
    // item, its media has the key of the tweet the media is from, so the stream item comes first.
    function chirpFor(element) {
        const item = element.closest(".js-stream-item[data-key]") || element.closest("[data-key]");
        const section = element.closest("[data-column]");
        if(!item || !section || !window.TD?.controller?.columnManager) return null;
        try {
            return TD.controller.columnManager.get(section.dataset.column)?.findChirp(item.dataset.key) || null;
        } catch(e) {
            return null;
        }
    }

    // Attaches files to the tweet a compose box belongs to, the way picking them with "Add image" does:
    // TweetDeck checks type, size and count, shows its own errors, and an inline reply moves to the docked
    // composer to show them. False when there's no upload input for that box.
    function attachFiles(box, files) {
        let input = null;
        for(let el = box; el && !input; el = el.parentElement) input = el.querySelector("input.js-media-upload");
        if(!input || !files.length) return false;
        const transfer = new DataTransfer();
        files.forEach(file => transfer.items.add(file));
        input.files = transfer.files;
        input.dispatchEvent(new Event("change", { bubbles: true }));
        return true;
    }

    // A button in the docked composer, after "Add image" and the buttons added before it, styled like it,
    // and its panel, shown under the buttons and toggled by it; one panel is open at a time. build(composer)
    // makes the panel's content once, open(panel, composer) runs every time it opens. TweetDeck renders the
    // composer again now and then, so the button is put back by the shared watcher.
    let composerStyle = false;
    function addComposerButton({ name, icon, label, build, open }) {
        if(!composerStyle) {
            composerStyle = true;
            addStyle(`
                .otd-compose-button .otd-compose-icon { display: inline-block; box-sizing: border-box; width: 18px; margin-right: 3px; font-size: 16px; font-style: normal; line-height: 18px; text-align: center; vertical-align: -3px; }
                .otd-compose-panel { margin: -4px 0 12px; border-radius: 8px; background: #fff; color: #14171a; overflow: hidden; }
                html.dark .otd-compose-panel { background: #15202b; color: #fff; }
                .otd-compose-panel[hidden] { display: none; }
                .otd-compose-panel .otd-picker-search { display: block; box-sizing: border-box; width: calc(100% - 16px); margin: 8px; padding: 6px 8px; border: 1px solid rgba(136, 153, 166, .5); border-radius: 6px; background: transparent; color: inherit; font: inherit; }
                .otd-compose-panel .otd-picker-body { height: 260px; overflow-y: auto; padding: 0 6px 6px; position: relative; }
                .otd-compose-panel .otd-picker-note { padding: 16px 8px; text-align: center; color: #8899a6; }
                .otd-compose-panel .otd-picker-heading { margin: 8px 2px 4px; font-size: 12px; font-weight: bold; color: #8899a6; }
            `);
        }
        watch(() => {
            for(const addImage of document.querySelectorAll(".js-docked-compose .js-add-image-button")) {
                const composer = addImage.closest(".js-docked-compose");
                if(composer.querySelector(`.otd-compose-button[data-otd-button="${name}"]`)) continue;
                const button = document.createElement("button");
                button.type = "button";
                button.className = "otd-compose-button btn btn-on-blue full-width txt-left margin-b--12 padding-v--6 padding-h--12";
                button.dataset.otdButton = name;
                const glyph = document.createElement("i");
                glyph.className = "otd-compose-icon";
                glyph.textContent = icon;
                const text = document.createElement("span");
                text.className = "label padding-ls";
                text.textContent = label;
                button.append(glyph, text);
                let after = addImage;
                while(after.nextElementSibling?.classList.contains("otd-compose-button")) after = after.nextElementSibling;
                after.after(button);

                let panel = null;
                button.addEventListener("click", e => {
                    e.preventDefault();
                    const wasOpen = panel && !panel.hidden;
                    composer.querySelectorAll(".otd-compose-panel").forEach(other => { other.hidden = true; });
                    if(wasOpen) return;
                    if(!panel) {
                        panel = document.createElement("div");
                        panel.className = `otd-compose-panel otd-${name}-panel`;
                        panel.addEventListener("keydown", e => {
                            // Esc closes the panel, not the composer
                            if(e.key !== "Escape") return;
                            e.stopPropagation();
                            panel.hidden = true;
                            button.focus();
                        });
                        build(panel, composer);
                    }
                    let last = button;
                    while(last.nextElementSibling?.classList.contains("otd-compose-button")) last = last.nextElementSibling;
                    last.after(panel);
                    panel.hidden = false;
                    open?.(panel, composer);
                });
            }
        });
    }

    // The chirp of a tweet's action row, found the way TweetDeck finds the one of its "…" menu: from the
    // attributes of the row's "…" button
    function actionsChirp(element) {
        const button = element.closest?.('[rel="actionsMenu"]') || element.closest?.(".js-tweet-actions, .tweet-detail-actions")?.querySelector('[rel="actionsMenu"]');
        if(!button || !window.TD?.controller?.columnManager) return null;
        try {
            const chirp = TD.controller.columnManager.findChirpByAccountKey({
                chirpId: button.getAttribute("data-parent-chirp-id") || button.getAttribute("data-chirp-id"),
                accountKey: button.getAttribute("data-account-key"),
                columnKey: button.closest(".js-column")?.getAttribute("data-column"),
            });
            return chirp?.getRelatedTweet?.() || chirp || null;
        } catch(e) {
            return null;
        }
    }
    // the one whose "…" menu is open, as the menu opens, before TweetDeck renders it
    let menuChirp = null;
    document.addEventListener("click", e => {
        if(e.target.closest?.('[rel="actionsMenu"]')) menuChirp = actionsChirp(e.target);
    }, true);
    const openMenuChirp = () => menuChirp;

    // A tweet's media at its best: photos at the original size, the mp4 with the highest bitrate of videos
    // and GIFs. [{ url, ext, type }], type being the entity's: photo, video or animated_gif.
    function mediaFiles(chirp) {
        const files = [];
        for(const media of chirp?.getMedia?.() || []) {
            const entity = media.entity;
            if(entity?.type === "photo" && entity.media_url_https) {
                const [, base, ext] = entity.media_url_https.match(/^(.*)\.(\w+)$/) || [];
                if(base) files.push({ url: `${base}?format=${ext}&name=orig`, ext, type: entity.type });
            } else if((entity?.type === "video" || entity?.type === "animated_gif") && media.chooseVideoVariant) {
                const url = media.chooseVideoVariant()?.url;
                if(url) files.push({ url, ext: "mp4", type: entity.type });
            }
        }
        return files;
    }

    // A message in TweetDeck's notification corner, like its own "Muted @alice"
    let notifications;
    function notify(message, error = false) {
        if(notifications === undefined) {
            let modules = {};
            try {
                window.webpackJsonp.push([["otd-notify"], { "otd-notify": (module, exports, require) => { modules = require.c; } }, [["otd-notify"]]]);
            } catch(e) {}
            notifications = Object.values(modules).map(m => m.exports).find(x => typeof x?.showNotification === "function" && typeof x.showErrorNotification === "function") || null;
        }
        if(notifications) notifications[error ? "showErrorNotification" : "showNotification"]({ message });
        else if(error) alert(message);
    }

    // TweetDeck's jQuery, the one its events (dataTweetSent, uiReadStateChange…) and $.publish live on
    let jquery;
    function jQuery() {
        if(jquery !== undefined) return jquery;
        let modules = {};
        try {
            window.webpackJsonp.push([["otd-common"], { "otd-common": (module, exports, require) => { modules = require.c; } }, [["otd-common"]]]);
        } catch(e) {
            console.warn("[otd] no webpack runtime", e);
        }
        return jquery = Object.values(modules).map(m => m.exports).find(x => x?.fn?.jquery && typeof x.publish === "function") || null;
    }

    function addStyle(css) {
        const style = document.createElement("style");
        style.textContent = css;
        // injection.js removes x.com's own head once TweetDeck is in, stay on ours
        (document.getElementById("injected-head") || document.head).appendChild(style);
    }

    // watch(fn) runs fn on the next animation frame after the page changes, and every 2 s. All watchers share
    // one MutationObserver, frame and timer. Returns a function that asks for a run of fn alone.
    const watchers = new Set();
    let due = new Set();
    let frame = 0;
    let observer = null;
    function run() {
        frame = 0;
        const now = due;
        due = new Set();
        for(const fn of now) {
            try {
                fn();
            } catch(e) {
                console.error(e);
            }
        }
    }
    function request(fns) {
        for(const fn of fns) due.add(fn);
        if(!frame) frame = requestAnimationFrame(run);
    }
    function watch(fn) {
        watchers.add(fn);
        if(!observer) {
            observer = new MutationObserver(() => request(watchers));
            observer.observe(document.documentElement, { childList: true, subtree: true });
            setInterval(() => request(watchers), 2000);
        }
        request([fn]);
        return () => request([fn]);
    }

    // for the load watchdog (watchdog.js): TweetDeck's steps as it starts, which it reports as metrics
    jQuery()?.(document).on("metric", (e, data) => {
        const key = String(data?.key || "");
        if(/^(startup:|timing:controller:init:)/.test(key)) document.dispatchEvent(new CustomEvent("otd-diagnostic", { detail: JSON.stringify({ kind: "startup", key }) }));
    });

    // Items this extension adds to TweetDeck's menus look like its own, which it styles by data-action
    addStyle(`
        .dropdown-menu [data-otd-action] { display: block; padding: 5px 20px; color: #38444d; text-shadow: none; cursor: pointer; text-decoration: none; }
        html.dark .dropdown-menu [data-otd-action], .dropdown-menu .is-selected [data-otd-action] { color: #fff; }
    `);

    window.OTD = { UI_LANG, VERSION, BASE_URL, FEATURES, LANG_STORAGE, isOn, setOn, targetLang, label, cookie, sleep, xHeaders, chirpFor, actionsChirp, openMenuChirp, mediaFiles, notify, attachFiles, addComposerButton, jQuery, addStyle, watch };
})();
