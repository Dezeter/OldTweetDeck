// Shared by this extension's scripts: the features and their switches, the translation language, labels,
// styles, and one watcher of the page for the scripts that rescan it. Loaded by injection.js after bundle.js,
// before the other local scripts, as window.OTD.
(() => {
    const UI_LANG = (navigator.language || "en").split("-")[0].toLowerCase();
    // injection.js puts the extension's version on <html>
    const VERSION = document.documentElement.dataset.otdVersion || "";

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
        { key: "mediaAspect", storage: "OTDmediaAspect", section: "media",
            label: { ru: "Одиночные картинки в колонке целиком, без обрезки", en: "Single images in columns whole, not cropped" } },
        { key: "downloadMedia", storage: "OTDdownloadMedia", section: "media",
            label: { ru: "«Скачать медиа» в меню твита", en: "\"Download media\" in the tweet menu" } },
        { key: "pasteImages", storage: "OTDpasteImages", section: "compose",
            label: { ru: "Вставлять картинки по Ctrl+V", en: "Paste images with Ctrl+V" } },
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

    window.OTD = { UI_LANG, VERSION, FEATURES, LANG_STORAGE, isOn, setOn, targetLang, label, cookie, sleep, xHeaders, chirpFor, jQuery, addStyle, watch };
})();
