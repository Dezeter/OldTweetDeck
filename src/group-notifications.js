// Notifications grouped the way x.com shows them: likes and retweets of the same tweet become one item
// with a row of avatars ("A, B and 3 others liked"), follows in a row become one, and the liked tweet
// is cut to a few lines without media. TweetDeck makes an item of every single action (interception.js
// unpacks X's grouped notifications for it), so this regroups them on the page.
// Loaded by injection.js after otd-common.js. Switch "groupNotifications".
(() => {
    if(!OTD.isOn("groupNotifications")) return;

    const LABELS = {
        ru: { favorite: "лайкнули", retweet: "ретвитнули", follow: "подписались на вас", and: "и", more: n => `и ещё ${n}` },
        en: { favorite: "liked", retweet: "retweeted", follow: "followed you", and: "and", more: n => `and ${n} ${n === 1 ? "other" : "others"}` },
    };
    const LABEL = OTD.label(LABELS);
    const MAX_AVATARS = 10;

    // TweetDeck action -> what it is about; actions on your retweets and mentions count as likes / retweets too
    const KIND = {
        favorite: "favorite", favorited_retweet: "favorite", favorited_mention: "favorite", favorited_media_tagged: "favorite",
        retweet: "retweet", retweeted_retweet: "retweet", retweeted_mention: "retweet", retweeted_media_tagged: "retweet",
        follow: "follow",
    };

    const actor = chirp => chirp.sourceUser || chirp.following;

    function itemsOf(section) {
        return [...section.querySelectorAll(".js-chirp-container > article.js-stream-item[data-key]")].map(el => {
            const chirp = OTD.chirpFor(el);
            return { el, chirp, kind: KIND[chirp?.action] };
        });
    }

    // Likes / retweets group by tweet across the column, the newest one stays in place as on x.com.
    // Follows group while they come one after another.
    function groupsOf(items) {
        const groups = new Map();
        let follows = null;
        for(const item of items) {
            if(item.kind === "follow") {
                if(!follows) groups.set(`follow-${groups.size}`, follows = []);
                follows.push(item);
                continue;
            }
            follows = null;
            const tweetId = item.chirp?.targetTweet?.id;
            if(!item.kind || !tweetId || !actor(item.chirp)) continue;
            const key = `${item.chirp.action}:${tweetId}`;
            if(!groups.has(key)) groups.set(key, []);
            groups.get(key).push(item);
        }
        return [...groups.values()];
    }

    function el(tag, className, text) {
        const node = document.createElement(tag);
        if(className) node.className = className;
        if(text) node.textContent = text;
        return node;
    }

    function summary(users, kind) {
        const names = users.map(u => u.name || u.screenName);
        const text = el("div", "otd-notif-text");
        const bold = name => el("b", "", name);
        if(names.length === 2) text.append(bold(names[0]), ` ${LABEL.and} `, bold(names[1]));
        else text.append(bold(names[0]), ", ", bold(names[1]), ` ${LABEL.more(names.length - 2)}`);
        text.append(` ${LABEL[kind]}`);
        return text;
    }

    function avatars(users) {
        const row = el("div", "otd-notif-avatars");
        for(const user of users.slice(0, MAX_AVATARS)) {
            // rel="user" + data-user-name: TweetDeck opens its profile popup on click
            const a = el("a", "account-link");
            a.href = user.profileURL || `https://x.com/${user.screenName}`;
            a.rel = "user";
            a.target = "_blank";
            a.dataset.userName = user.screenName;
            a.title = `${user.name} @${user.screenName}`;
            const img = el("img", "avatar");
            img.src = user.profileImageURL;
            img.alt = user.screenName;
            a.append(img);
            row.append(a);
        }
        if(users.length > MAX_AVATARS) row.append(el("span", "otd-notif-more", `+${users.length - MAX_AVATARS}`));
        return row;
    }

    // The text part of the item's own activity header gets the group; the icon and the live
    // timestamp stay TweetDeck's. The original nodes are kept to put back if the group breaks up.
    function setGroup(item, group) {
        const users = [];
        for(const { chirp } of group) {
            const user = actor(chirp);
            if(user && !users.some(u => u.id === user.id)) users.push(user);
        }
        const body = item.el.querySelector(".activity-header .nbfc");
        if(users.length < 2 || !body) return clearGroup(item.el);

        const signature = users.map(u => u.id).join(",");
        if(item.el.dataset.otdGroup === signature && body.querySelector(".otd-notif-avatars")) return;
        if(!body.otdOriginal) body.otdOriginal = [...body.childNodes];
        body.replaceChildren(avatars(users), summary(users, item.kind));
        item.el.classList.add("otd-notif-group");
        item.el.dataset.otdGroup = signature;
    }

    function clearGroup(article) {
        if(!article.classList.contains("otd-notif-group")) return;
        const body = article.querySelector(".activity-header .nbfc");
        if(body?.otdOriginal) {
            body.replaceChildren(...body.otdOriginal);
            delete body.otdOriginal;
        }
        article.classList.remove("otd-notif-group");
        delete article.dataset.otdGroup;
    }

    function scan() {
        if(!window.TD?.controller?.columnManager) return;
        for(const section of document.querySelectorAll("section.js-column[data-column]")) {
            const items = itemsOf(section);
            if(!items.some(item => item.kind)) continue;

            const representative = new Map();
            const hidden = new Set();
            for(const group of groupsOf(items)) {
                representative.set(group[0].el, group);
                group.slice(1).forEach(item => hidden.add(item.el));
            }
            for(const item of items) {
                item.el.classList.toggle("otd-notif-compact", item.kind === "favorite" || item.kind === "retweet");
                item.el.classList.toggle("otd-notif-hidden", hidden.has(item.el));
                const group = representative.get(item.el);
                if(group) setGroup(item, group);
                else clearGroup(item.el);
            }
        }
    }

    OTD.addStyle(`
        .otd-notif-hidden { display: none !important; }
        /* in a follow group the avatar row stands in for the first follower's card */
        .otd-notif-group .account-summary { display: none !important; }
        .otd-notif-group .otd-notif-avatars { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 4px; }
        .otd-notif-group .otd-notif-avatars a { display: block; line-height: 0; }
        .otd-notif-group .otd-notif-avatars img { width: 24px; height: 24px; border-radius: 50%; }
        .otd-notif-group .otd-notif-more { align-self: center; font-size: 12px; color: #8899a6; }
        /* paragraphs run together, otherwise a blank line eats one of the three */
        .otd-notif-compact .tweet-text { display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; max-height: 4.5em; white-space: normal !important; }
        .otd-notif-compact .tweet-text .otd-grok-para { display: inline; margin: 0; }
        .otd-notif-compact .tweet-text .otd-grok-para::after { content: " "; }
        .otd-notif-compact .js-media, .otd-notif-compact .js-media-preview-container, .otd-notif-compact .js-card-container, .otd-notif-compact .js-quote-detail { display: none !important; }
    `);

    OTD.watch(scan);
})();
