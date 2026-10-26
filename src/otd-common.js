// Shared by this extension's scripts: the features and their switches, the translation language, labels,
// styles, and one watcher of the page for the scripts that rescan it. Loaded by injection.js after bundle.js,
// before the other local scripts, as window.OTD.
(() => {
    const UI_LANG = (navigator.language || "en").split("-")[0].toLowerCase();

    // Every feature is on unless localStorage[storage] is "0". settings.js shows them as switches, by section.
    const FEATURES = [
        { key: "grokTranslate", storage: "OTDgrokTranslate", section: "translation",
            label: { ru: "Переводить твиты через Grok", en: "Translate tweets with Grok" } },
        { key: "articlesTranslate", storage: "OTDarticlesTranslate", section: "translation",
            label: { ru: "Переводить статьи через Google", en: "Translate articles with Google" } },
        { key: "hideHomeReplies", storage: "OTDhideHomeReplies", section: "columns",
            label: { ru: "Скрывать в домашних колонках ответы другим людям", en: "Hide replies to other people in home columns" } },
        { key: "groupNotifications", storage: "OTDgroupNotifications", section: "columns",
            label: { ru: "Группировать лайки, ретвиты и подписки в уведомлениях", en: "Group likes, retweets and follows in notifications" } },
        { key: "loadAllReplies", storage: "OTDloadAllReplies", section: "tweets",
            label: { ru: "Загружать все ответы при просмотре твита", en: "Load all replies when viewing a tweet" } },
        { key: "instantReplies", storage: "OTDinstantReplies", section: "tweets",
            label: { ru: "Показывать свой ответ сразу после отправки", en: "Show your reply right after sending it" } },
        { key: "articles", storage: "OTDarticles", section: "tweets",
            label: { ru: "X Articles: заголовок и начало вместо ссылки, чтение в окне", en: "X Articles: title and beginning instead of the link, a reader" } },
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
    const isOn = key => localStorage[feature(key).storage] !== "0";
    function setOn(key, on) {
        if(on) localStorage.removeItem(feature(key).storage);
        else localStorage[feature(key).storage] = "0";
    }
    const targetLang = () => (localStorage[LANG_STORAGE] || navigator.language || "en").split("-")[0].toLowerCase();
    const label = (labels, lang = UI_LANG) => labels[lang] || labels.en;

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

    window.OTD = { UI_LANG, FEATURES, LANG_STORAGE, isOn, setOn, targetLang, label, addStyle, watch };
})();
