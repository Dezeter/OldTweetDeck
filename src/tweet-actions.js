// More in a tweet's "…" menu and under it, after Better TweetDeck's:
// - "Copy links to media" (switch "copyMediaLinks"): its photos at full size and videos at the best quality,
//   one address per line;
// - "Mute #tag" for each of its hashtags and "Mute tweets from <app>" (switch "muteFromMenu"), the same as
//   adding them in Settings → Mute;
// - "Redraft" for your own tweet (switch "redraft"): deletes it and opens it in the tweet box as it was, with
//   its media, the tweet it replied to and the one it quoted, to be corrected and sent again;
// - "Mute" and "Block" buttons under other people's tweets (switch "rowMuteBlock", off by default).
// Loaded by injection.js after otd-common.js.
(() => {
    if(typeof window.TD?.mustaches?.["menus/actions.mustache"] !== "string") return;

    const LABEL = OTD.label({
        ru: {
            copyLinks: "Скопировать ссылки на медиа", copied: "Ссылки на медиа скопированы", copyFailed: "Не получилось скопировать ссылки",
            mute: "Игнорировать", muteSource: "Игнорировать твиты из", muted: value => `Твиты с «${value}» скрыты`, mutedAlready: value => `«${value}» уже в списке игнорируемого`,
            redraft: "Переписать", redraftConfirm: "Твит будет удалён, а его текст и медиа откроются в окне твита, чтобы исправить и отправить заново. Продолжить?",
            redraftFailed: "Не получилось забрать медиа твита, он не удалён",
            block: "Заблокировать", muteUser: name => `Игнорировать @${name}?`, blockUser: name => `Заблокировать @${name}?`,
        },
        en: {
            copyLinks: "Copy links to media", copied: "Links to media copied", copyFailed: "Couldn't copy the links",
            mute: "Mute", muteSource: "Mute tweets from", muted: value => `Tweets with "${value}" are muted`, mutedAlready: value => `"${value}" is already muted`,
            redraft: "Redraft", redraftConfirm: "The tweet will be deleted and its text and media will open in the tweet box, to be corrected and sent again. Go on?",
            redraftFailed: "Couldn't get the tweet's media, it wasn't deleted",
            block: "Block", muteUser: name => `Mute @${name}?`, blockUser: name => `Block @${name}?`,
        },
    });

    // Adds html to a TweetDeck template next to a piece of it. Quietly does nothing when the piece isn't there.
    function addToTemplate(name, piece, html, { before = false } = {}) {
        const template = TD.mustaches[name];
        if(typeof template !== "string" || !template.includes(piece)) return console.warn(`[otd-actions] ${name} has changed`);
        TD.mustaches[name] = template.replace(piece, before ? `${html} ${piece}` : `${piece} ${html}`);
    }
    const MENU = "menus/actions.mustache";
    const item = (action, text, attrs = "") => `<li class="is-selectable"><a href="#" class="txt-ellipsis" data-otd-action="${action}"${attrs}>${text}</a></li>`;
    const actions = {};

    if(OTD.isOn("copyMediaLinks")) {
        addToTemplate(MENU, '<li class="is-selectable"><a href="#" data-action="reference-to">{{_i}}Copy link to this Tweet{{/i}}</a></li>',
            `{{#chirp}}{{#hasMedia}}${item("copy-media-links", LABEL.copyLinks)}{{/hasMedia}}{{/chirp}}`);
        actions["copy-media-links"] = async chirp => {
            try {
                await navigator.clipboard.writeText(OTD.mediaFiles(chirp).map(file => file.url).join("\n"));
                OTD.notify(LABEL.copied);
            } catch(e) {
                OTD.notify(LABEL.copyFailed, true);
            }
        };
    }

    if(OTD.isOn("muteFromMenu")) {
        // with "Mute @user", which is there for other people's tweets
        addToTemplate(MENU, '{{#isMuted}} <li class="is-selectable"><a href="#" data-action="unmute" class="txt-ellipsis">{{_i}}Unmute @{{screenName}}{{/i}}</a></li> {{/isMuted}}',
            "{{#chirp}}" +
            `{{#entities.hashtags}}${item("mute-hashtag", `${LABEL.mute} #{{text}}`, ' data-otd-value="#{{text}}"')}{{/entities.hashtags}}` +
            `{{#sourceNoHTML}}${item("mute-source", `${LABEL.muteSource} «{{sourceNoHTML}}»`, ' data-otd-value="{{sourceNoHTML}}"')}{{/sourceNoHTML}}` +
            "{{/chirp}}");
        // TweetDeck keeps mutes in lower case and compares them so
        const mute = (type, value) => {
            const filters = TD.controller.filterManager;
            if(!filters.validateFilter(type, value.toLowerCase())) return OTD.notify(LABEL.mutedAlready(value));
            filters.addFilter(type, value.toLowerCase());
            OTD.notify(LABEL.muted(value));
        };
        actions["mute-hashtag"] = (chirp, link) => mute("phrase", link.dataset.otdValue);
        actions["mute-source"] = (chirp, link) => mute("source", link.dataset.otdValue);
    }

    if(OTD.isOn("redraft")) {
        addToTemplate(MENU, '<li class="is-selectable"><a href="#" data-action="destroy">{{_i}}Delete{{/i}}</a></li>', item("redraft", LABEL.redraft), { before: true });
        actions.redraft = redraft;
    }

    // The tweet's text as it was typed: without the links to its media and to the tweet it quotes (both are
    // attached again), with the full addresses of links instead of t.co, without the mentions X put in front
    // of a reply by itself
    function draftText(chirp) {
        const entities = chirp.entities || {};
        let text = TD.util.removeHTMLCodes(chirp.text || "");
        for(const media of entities.media || []) if(media.url) text = text.split(media.url).join("");
        const quoted = chirp.quotedTweet?.id;
        for(const url of entities.urls || []) {
            const quote = url.isUrlForAttachment || (quoted && new RegExp(`/status(es)?/${quoted}(\\D|$)`).test(url.expanded_url || ""));
            if(url.url) text = text.split(url.url).join(quote ? "" : url.expanded_url || url.url);
        }
        const implicit = new Set((entities.user_mentions || []).filter(m => m.isImplicitMention).map(m => m.screen_name.toLowerCase()));
        text = text.replace(/^(?:@\w+\s+)+/, mentions => mentions.split(/\s+/).filter(word => word && !implicit.has(word.slice(1).toLowerCase())).map(word => `${word} `).join(""));
        return text.trim();
    }

    // a tweet TweetDeck has in one of its columns
    function findChirp(id) {
        for(const column of Object.values(TD.controller.columnManager.getAll?.() || {})) {
            try {
                const chirp = column.findChirp?.(id);
                if(chirp) return chirp;
            } catch(e) {}
        }
        return null;
    }

    const MIME = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif", webp: "image/webp", mp4: "video/mp4" };

    async function redraft(chirp) {
        if(!confirm(LABEL.redraftConfirm)) return;
        let files;
        try {
            files = await Promise.all(OTD.mediaFiles(chirp).map(async (media, i) => {
                const res = await fetch(media.url);
                if(!res.ok) throw new Error(`${media.url}: HTTP ${res.status}`);
                const blob = await res.blob();
                return new File([blob], `${chirp.id}_${i + 1}.${media.ext}`, { type: MIME[media.ext] || blob.type });
            }));
        } catch(e) {
            console.warn("[otd-redraft]", e);
            return OTD.notify(LABEL.redraftFailed, true);
        }

        // as TweetDeck opens a scheduled tweet to edit it
        const text = draftText(chirp);
        const compose = { type: "tweet", popFromInline: true, text, from: [chirp.account.getKey()] };
        if(chirp.isQuoteStatus && chirp.quotedTweet && !chirp.quotedTweetMissing) compose.quotedTweet = chirp.quotedTweet;
        if(chirp.inReplyToID) {
            const name = chirp.inReplyToScreenName || "";
            Object.assign(compose, {
                type: "reply",
                autoPopulateReplyMetadata: true,
                inReplyTo: findChirp(chirp.inReplyToID) || { id: String(chirp.inReplyToID), htmlText: "", user: { screenName: name, name, profileImageURL: "" } },
                mentions: chirp.getReplyingToUsers?.() || [],
            });
        }
        OTD.jQuery()(document).trigger("uiComposeTweet", compose);

        if(files.length) {
            // into the tweet box once TweetDeck has opened it with the text
            let box = null;
            for(let waited = 0; waited < 3000 && !box; waited += 100) {
                await OTD.sleep(100);
                const textarea = document.querySelector(".js-docked-compose textarea.js-compose-text");
                if(textarea && (textarea.value.trim() === text || (!text && waited >= 500))) box = textarea;
            }
            if(!box || !OTD.attachFiles(box, files)) return OTD.notify(LABEL.redraftFailed, true);
        }
        chirp.destroy();
    }

    if(OTD.isOn("rowMuteBlock")) {
        const button = (detail, action, icon, title) => `<li class="${detail ? "tweet-detail-action-item" : "tweet-action-item pull-left margin-r--10"} otd-row-action">` +
            `<a class="js-show-tip ${detail ? "tweet-detail-action" : "tweet-action"} position-rel" href="#" data-otd-action="${action}" title="${title} @{{screenName}}">` +
            `<i class="icon ${icon} txt-center"></i><span class="is-vishidden">${title} @{{screenName}}</span></a></li>`;
        const buttons = detail => `{{#getMainUser}}{{^isMe}}${button(detail, "mute-user", "icon-sound-off", LABEL.mute)} ${button(detail, "block-user", "icon-blocked", LABEL.block)}{{/isMe}}{{/getMainUser}}`;
        addToTemplate("status/tweet_single_actions.mustache", '<li class="tweet-action-item position-rel pull-left margin-r--10"> <a class="tweet-action" href="#" rel="actionsMenu"', buttons(false), { before: true });
        addToTemplate("status/tweet_detail_actions.mustache", '<li class="tweet-detail-action-item position-rel"> <a class="js-tweet-detail-action tweet-detail-action" href="#" rel="actionsMenu"', buttons(true), { before: true });
        // the tweet view gives each button an equal share of the row, room is made for two more
        addToTemplate("status/tweet_detail_actions.mustache", '<ul class="tweet-detail-actions', "otd-row-actions");
        OTD.addStyle(`
            .tweet-detail-actions.otd-row-actions { display: flex !important; }
            .tweet-detail-actions.otd-row-actions > .tweet-detail-action-item { flex: 1 1 0; width: auto !important; }
        `);

        actions["mute-user"] = chirp => {
            const user = chirp.getMainUser();
            if(confirm(LABEL.muteUser(user.screenName))) user.mute(chirp.account);
        };
        actions["block-user"] = chirp => {
            const user = chirp.getMainUser();
            if(confirm(LABEL.blockUser(user.screenName))) OTD.jQuery()(document).trigger("uiBlockAction", { account: chirp.account, twitterUser: user });
        };
    }

    // Menu items are for the tweet whose menu is open; TweetDeck closes the menu after the click as usual.
    // Buttons under a tweet are for that tweet, and the click goes no further, or it would open the tweet.
    document.addEventListener("click", e => {
        const link = e.target.closest?.("[data-otd-action]");
        const action = link && actions[link.dataset.otdAction];
        if(!action) return;
        e.preventDefault();
        const inMenu = !link.closest(".otd-row-action");
        if(!inMenu) e.stopPropagation();
        const chirp = inMenu ? OTD.openMenuChirp() : OTD.actionsChirp(link);
        if(chirp) action(chirp, link);
    }, true);
})();
