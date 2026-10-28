// Every kind of tweet TweetDeck draws, with this extension's look: in a home column (text, a reply, a retweet,
// photos, video, a GIF, sensitive media, quotes, link cards, a poll), in notifications, and opened in a column.
// The tests check what holds for all of them; SPECIMENS_OUT=<dir> also saves a picture of each, for a look.
// X's pictures and avatars are drawn here, in the proportions of the media.
const { test, expect } = require("@playwright/test");
const fs = require("fs");
const path = require("path");
const { openPage, addTweetDeck, addAccount, addScripts } = require("./helpers");

// pictures sharp on a high-density screen
if(process.env.SPECIMENS_OUT) test.use({ deviceScaleFactor: 2 });

const COLORS = ["#7a5cfa", "#e0245e", "#17bf63", "#ffad1f", "#1d9bf0", "#f45d22", "#794bc4", "#00a5a5"];
// a picture of the given proportions, in place of X's media
const picture = (w, h, i) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${COLORS[i % 8]}"/><stop offset="1" stop-color="${COLORS[(i + 3) % 8]}"/></linearGradient></defs><rect width="${w}" height="${h}" fill="url(#g)"/><circle cx="${w * .7}" cy="${h * .3}" r="${Math.min(w, h) * .12}" fill="#fff" opacity=".7"/><path d="M0 ${h} L${w * .35} ${h * .55} L${w * .6} ${h * .8} L${w * .8} ${h * .6} L${w} ${h} Z" fill="#000" opacity=".25"/></svg>`;
const avatar = i => `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96"><rect width="96" height="96" fill="${COLORS[i % 8]}"/><circle cx="48" cy="38" r="18" fill="#fff" opacity=".85"/><ellipse cx="48" cy="92" rx="34" ry="26" fill="#fff" opacity=".85"/></svg>`;

const SIZES = { 1: [1600, 900], 2: [900, 1200], 3: [1200, 1200], 4: [800, 600], 5: [800, 600], 6: [800, 600], 7: [800, 600], 8: [1280, 720], 9: [480, 270], 10: [1000, 1000], 11: [1200, 628], 12: [1200, 628], 13: [400, 400], 14: [1500, 1000] };

async function stand(page, { dark = false, width = "medium", media = "", density = "", storage = {} } = {}) {
    await openPage(page, {
        storage: { ...storage, ...(media ? { OTDmedia: media } : {}), ...(density ? { OTDdensity: density } : {}) },
        routes: {
            "https://pbs.twimg.com/": route => {
                const url = route.request().url();
                const avatarId = url.match(/profile_images\/(\d+)/)?.[1];
                if(avatarId) return route.fulfill({ contentType: "image/svg+xml", body: avatar(+avatarId) });
                const id = +(url.match(/(?:media|img|thumb|card_img)\/[A-Za-z]*(\d+)/)?.[1] || 1);
                const [w, h] = SIZES[id] || [800, 600];
                return route.fulfill({ contentType: "image/svg+xml", body: picture(w, h, id) });
            },
        },
    });
    await addTweetDeck(page, { css: true });
    await addAccount(page);
    await page.evaluate(([dark, width]) => {
        if(dark) document.documentElement.classList.add("dark");
        window.__account.isContributor = () => false;
        TD.settings.getColumnWidth = () => width;
        TD.settings.getTheme = () => dark ? "dark" : "light";
        TD.ui.main.updateColumnSize();
        const decider = TD.decider.get;
        TD.decider.get = key => key === "multi_photo_media_grid" ? true : decider.call(TD.decider, key);
        let n = 0;
        const user = (id, name, extra = {}) => ({ id_str: id, id: +id, screen_name: name.replace(/\W/g, ""), name, profile_image_url_https: `https://pbs.twimg.com/profile_images/${n++}/a_normal.jpg`, entities: { description: { urls: [] }, url: { urls: [] } }, description: "", followers_count: 1200, friends_count: 300, ...extra });
        const U = window.U = { me: user("1", "Dezeter"), a: user("11", "Badlynasty", { verified: true }), b: user("12", "Pantea.AEW"), c: user("13", "Zh0u"), d: user("14", "RAEN Foundation"), e: user("15", "Audrey"), f: user("16", "bloodredfrog") };
        const photo = (id, type = "photo") => {
            const [w, h] = { 1: [1600, 900], 2: [900, 1200], 3: [1200, 1200], 4: [800, 600], 5: [800, 600], 6: [800, 600], 7: [800, 600], 8: [1280, 720], 9: [480, 270], 10: [1000, 1000], 14: [1500, 1000] }[id] || [800, 600];
            const m = { id_str: String(id), type, media_url_https: `https://pbs.twimg.com/media/P${id}.jpg`, original_info: { width: w, height: h },
                sizes: { large: { w, h, resize: "fit" }, medium: { w, h, resize: "fit" }, small: { w, h, resize: "fit" }, thumb: { w: 150, h: 150, resize: "crop" } },
                url: "https://t.co/m", display_url: "pic.x.com/m", expanded_url: `https://x.com/i/status/${id}/photo/1`, indices: [0, 0] };
            if(type !== "photo") m.video_info = { aspect_ratio: [w, h], duration_millis: 42000, variants: [{ content_type: "video/mp4", bitrate: 832000, url: "https://video.twimg.com/x/low.mp4" }] };
            return m;
        };
        let t = 0;
        const ago = () => new Date(Date.now() - (t += 7 * 60000)).toUTCString();
        const ent = (extra = {}) => ({ hashtags: [], user_mentions: [], symbols: [], urls: [], ...extra });
        const tw = (id, author, text, extra = {}) => ({ id_str: String(id), full_text: text, text, created_at: ago(), source: "web", user: author, entities: ent(), retweet_count: 3, favorite_count: 12, reply_count: 5, ...extra });
        const withMedia = (json, media) => ({ ...json, entities: { ...json.entities, media }, extended_entities: { media } });
        const card = (name, values) => ({ name, url: "https://t.co/card", binding_values: Object.fromEntries(Object.entries(values).map(([k, v]) => [k, typeof v === "string" ? { type: "STRING", string_value: v } : v])) });
        const img = (id, w, h) => ({ type: "IMAGE", image_value: { url: `https://pbs.twimg.com/card_img/${id}/x.jpg`, width: w, height: h } });

        const long = "Мои ставки на сегодня на @biggerz. Я ставлю на победу и выход в плей-офф Furia и Spirit, а ещё немного на тотал больше в третьей карте. Если зайдёт, будет повод для отдельного треда #esports";
        const home = [
            ["text", tw(101, U.a, "Ссылка на реферала и бонусный код: BADLY")],
            ["long text, mention, hashtag", tw(102, U.a, long, { entities: ent({ user_mentions: [{ id_str: "99", screen_name: "biggerz", name: "BiggerZ", indices: [long.indexOf("@biggerz"), long.indexOf("@biggerz") + 8] }], hashtags: [{ text: "esports", indices: [long.length - 8, long.length] }] }) })],
            ["reply", tw(103, U.c, "@Dezeter Это правда работает? Как настроить?", { in_reply_to_status_id_str: "90", in_reply_to_user_id_str: "1", in_reply_to_screen_name: "Dezeter", entities: ent({ user_mentions: [{ id_str: "1", screen_name: "Dezeter", name: "Dezeter", indices: [0, 8] }] }), display_text_range: [9, 44] })],
            ["retweet", { ...tw(104, U.f, "RT"), retweeted_status: tw(1040, U.b, "⭕ РАСПРОДАНО ЗА 3 ДНЯ ⭕ Привет моей удивительной семейке! Последний билет на концерт в Тбилиси ушёл сегодня утром") }],
            ["photo, landscape", withMedia(tw(105, U.a, "Закат над городом"), [photo(1)])],
            ["photo, portrait", withMedia(tw(106, U.b, "Новый постер"), [photo(2)])],
            ["two photos", withMedia(tw(107, U.c, "До и после"), [photo(4), photo(5)])],
            ["three photos", withMedia(tw(108, U.d, "Три кадра со съёмки"), [photo(4), photo(5), photo(6)])],
            ["four photos", withMedia(tw(109, U.e, "Четыре"), [photo(4), photo(5), photo(6), photo(7)])],
            ["video", withMedia(tw(110, U.a, "Видео с матча, финальная карта"), [photo(8, "video")])],
            ["gif", withMedia(tw(111, U.f, "когда наконец зашла ставка"), [photo(9, "animated_gif")])],
            ["sensitive", withMedia(tw(112, U.b, "Осторожно, спойлеры"), [photo(10)]), { possibly_sensitive: true }],
            ["quote", tw(113, U.c, "Вот реальный пример, о котором я говорил", { is_quote_status: true, quoted_status_id_str: "1130", quoted_status: tw(1130, U.d, "Самый быстрый способ перевести деньги — через нас, благодарим за доверие") })],
            ["quote with a photo", tw(114, U.e, "Что такое?", { is_quote_status: true, quoted_status_id_str: "1140", quoted_status: withMedia(tw(1140, U.a, "Транзакция прошла за 3 секунды"), [photo(14)]) })],
            ["photo and a quote", withMedia(tw(115, U.b, "Смотрите, что нашла", { is_quote_status: true, quoted_status_id_str: "1150", quoted_status: tw(1150, U.c, "Цитируемый твит без картинки") }), [photo(3)])],
            ["link card, large", tw(116, U.a, "BiggerZ: Global Online Casino https://t.co/card", { card: card("summary_large_image", { title: "BiggerZ: Global Online Casino, Sportsbook & Prediction Markets", description: "BiggerZ brings together 6,000+ casino games, sports betting and prediction markets", domain: "biggerz.com", vanity_url: "biggerz.com", card_url: "https://t.co/card", summary_photo_image_original: img(11, 1200, 628), thumbnail_image_original: img(11, 1200, 628) }) })],
            ["link card, small", tw(117, U.d, "Статья https://t.co/card", { card: card("summary", { title: "Как работает TweetDeck в 2026 году", description: "Разбор расширения, которое возвращает старый интерфейс", domain: "habr.com", vanity_url: "habr.com", card_url: "https://t.co/card", thumbnail_image_original: img(13, 400, 400) }) })],
            ["poll", tw(118, U.e, "Какую тему вы используете?", { card: card("poll3choice_text_only", { choice1_label: "Светлую", choice1_count: "120", choice2_label: "Тёмную", choice2_count: "340", choice3_label: "Lights out", choice3_count: "88", counts_are_final: { type: "BOOLEAN", boolean_value: false }, end_datetime_utc: new Date(Date.now() + 864e5).toISOString(), duration_minutes: "1440" }) })],
            ["liked and retweeted", tw(119, U.c, "Твит, который я лайкнул и ретвитнул", { favorited: true, retweeted: true })],
        ];
        window.__home = home.map(([label, json, extra]) => [label, window.__client.processTweet({ ...json, ...(extra || {}) })]);
        window.__chirps = Object.fromEntries(window.__home.map(([, c]) => [c.id, c]));
        TD.controller.columnManager = { get: key => key === "home" ? { findChirp: id => window.__chirps[id], getMediaPreviewSize: () => "medium" } : null, getAllOrdered: () => [] };

        const column = (key, title, body) => `<section class="js-column column" data-column="${key}"><div class="column-holder"><div class="column-panel flex flex-column height-p--100"><header class="js-column-header column-header flex-shrink--0"><i class="pull-left margin-l--10 margin-r--2 column-type-icon icon icon-${key === "home" ? "home" : key === "notif" ? "notifications" : "search"}"></i><div class="column-title flex flex-justify-content--space-between"><div class="column-header-title flex flex-align--center flex-wrap--wrap flex-grow--2"><h1 class="column-heading">${title}</h1> <span class="attribution txt-mute txt-sub-antialiased">@Dezeter</span></div><div class="column-header-links"><a class="column-header-link column-settings-link" href="#"><i class="icon icon-sliders"></i></a></div></div></header><div class="js-column-content column-content flex-auto position-rel flex flex-column height-p--100"><div class="js-column-scroller column-scroller position-rel scroll-v flex-auto height-p--100"><div class="js-chirp-container chirp-container">${body}</div></div></div></div></div></section>`;
        const homeHtml = window.__home.map(([label, chirp]) => chirp.render({ mediaPreviewSize: "medium" }).replace("<article ", `<article data-otd-label="${label}" `)).join("");
        // notifications, as X's activity JSON
        const account = window.__account;
        let at = 0;
        const act = (action, source, target, targetObject) => {
            const ts = Date.now() - (at += 9 * 60000);
            const json = { action, created_at: new Date(ts).toUTCString(), max_position: `${ts}`, min_position: `${ts}`, sources: [source], sources_size: 1, targets: [target], targets_size: 1, target_objects: [targetObject || target], target_objects_size: 1 };
            return TD.services.TwitterAction.processRESTAction(json, account)[0];
        };
        const mine = withMedia(tw(201, U.me, "Самый быстрый способ перевести деньги без комиссии, благодарим за доверие 🙏"), [photo(3)]);
        const mineText = tw(202, U.me, "Это адрес нашего кошелька, проверяйте перед отправкой");
        const notifs = [
            ["like, grouped", act("favorite", U.a, mine)], ["", act("favorite", U.b, mine)], ["", act("favorite", U.c, mine)],
            ["retweet", act("retweet", U.d, mineText)],
            ["follows, grouped", act("follow", U.e, U.me)], ["", act("follow", U.f, U.me)],
            ["reply to me", act("reply", U.c, tw(203, U.c, "@Dezeter Вот реально, у меня тоже так", { in_reply_to_status_id_str: "202", in_reply_to_user_id_str: "1", in_reply_to_screen_name: "Dezeter", display_text_range: [9, 37] }))],
            ["quote of mine", act("quote", U.d, tw(204, U.d, "Ты сделал TweetDeck снова удобным", { is_quote_status: true, quoted_status_id_str: "202", quoted_status: mineText }))],
            ["mention", act("mention", U.b, tw(205, U.b, "Спасибо @Dezeter за расширение!", { entities: ent({ user_mentions: [{ id_str: "1", screen_name: "Dezeter", name: "Dezeter", indices: [8, 16] }] }) }))],
        ].filter(([, chirp]) => chirp);
        window.__notifs = notifs;
        for(const [, c] of notifs) window.__chirps[c.id] = c;

        window.__renderCards = () => {
            const req = window.__require;
            const id = Object.keys(req.m).find(id => req.m[id].toString().includes("t.renderCardForChirp = function"));
            const { renderCardForChirp } = req(id);
            const $ = OTD.jQuery();
            for(const [, chirp] of window.__home) {
                const container = document.querySelector(`article[data-key="${chirp.id}"] .js-card-container`);
                // as TweetDeck's column does it
                if(chirp.card && container) try { TD.ui.Column.prototype.loadCard.call({ getChirpById: () => $(container).closest("article") }, chirp, "home"); } catch(e) { console.log("card", e.message); }
            }
        };
        const notifHtml = notifs.map(([label, chirp]) => chirp.render({ mediaPreviewSize: "medium" }).replace("<article ", `<article data-otd-label="${label || "·"}" `)).join("");
        // the opened tweet, as TweetDeck's detail view draws it
        const focal = window.__client.processTweet(withMedia(tw(301, U.a, "Закат над городом, снято на телефон. Без фильтров!", { favorite_count: 1280, retweet_count: 64, reply_count: 12, quote_count: 3 }), [photo(1)]));
        const reply = window.__client.processTweet(withMedia(tw(302, U.c, "@Badlynasty Красиво! А это мой вчерашний", { in_reply_to_status_id_str: "301", in_reply_to_user_id_str: "11", in_reply_to_screen_name: "Badlynasty", display_text_range: [12, 41] }), [photo(2)]));
        window.__chirps[focal.id] = focal;
        window.__chirps[reply.id] = reply;
        const detail = TD.ui.template.render("status/tweet_detail", { chirp: focal, withDragHandle: false, isFavorited: false, isRetweeted: false, renderQuoted() { return ""; } });
        const detailHtml = `<div class="js-detail-container column-scroller" data-otd-label="opened tweet"><div class="js-tweet-detail tweet-detail-wrapper">${detail}</div><div class="js-tweet-replies tweet-detail-reply">${reply.render({ mediaPreviewSize: "medium" }).replace("<article ", '<article data-otd-label="reply in the opened tweet" ')}</div></div>`;
        document.body.insertAdjacentHTML("beforeend", `<div class="js-app-content app-content" style="left:0"><div class="js-app-columns-container app-columns-container scroll-h"><div class="js-app-columns app-columns horizontal-flow-container">${column("home", "Home", homeHtml)}${column("notif", "Notifications", notifHtml)}${column("detail", "Tweet", detailHtml)}</div></div></div>`);
        window.__detailMedia = () => {
            const box = document.querySelector(".js-tweet-detail .js-tweet-media");
            if(!box) return;
            box.classList.remove("is-hidden");
            box.innerHTML = TD.ui.template.render("status/tweet_detail_media", Object.assign(Object.create(focal), { isPossiblySensitive: false,
                renderMediaGridView() { return this.media.renderGridView({ isPossiblySensitive: false }); },
                renderMediaDetailView() { return this.media.renderDetailView({ chirpId: this.chirpId, isPossiblySensitive: false }); } }));
        };
    }, [dark, width]);
}

// a picture of each tweet in <SPECIMENS_OUT>/<name>/, numbered, with their labels in labels.json
async function shoot(page, name) {
    const dir = path.join(process.env.SPECIMENS_OUT, name);
    fs.mkdirSync(dir, { recursive: true });
    const SEL = "article[data-otd-label]:not([data-otd-label='·']):not(.js-tweet-replies article), [data-otd-label='opened tweet']";
    const labels = await page.evaluate(SEL => [...document.querySelectorAll(SEL)].map(a => a.dataset.otdLabel), SEL);
    for(const [i, el] of (await page.$$(SEL)).entries()) await el.screenshot({ path: path.join(dir, `${String(i).padStart(2, "0")}.png`) });
    fs.writeFileSync(path.join(dir, "labels.json"), JSON.stringify(labels));
}

// for each tweet of the home and notifications columns: what sticks out of it, and where its square is
const layout = page => page.evaluate(() => [...document.querySelectorAll("article[data-otd-label]")].filter(a => a.offsetParent).map(article => {
    const box = el => el?.getBoundingClientRect();
    const tweet = box(article);
    // what shows: an element clipped by a box of its own inside the tweet doesn't stick out of it
    const clipped = el => {
        for(let up = el.parentElement; up && up !== article; up = up.parentElement) if(getComputedStyle(up).overflowX !== "visible") return true;
        return false;
    };
    const out = [...article.querySelectorAll("*")].filter(el => el.offsetParent && !el.closest(".js-tweet-actions") && !clipped(el)).some(el => box(el).right > tweet.right + 0.5 || box(el).left < tweet.left - 0.5);
    const media = article.querySelector(".tweet-body > .js-media");
    const square = media && box(media);
    const text = box(article.querySelector(".tweet-text"));
    const quote = box(article.querySelector(".tweet-body > .js-quote-detail"));
    return {
        label: article.dataset.otdLabel,
        out,
        square: square ? [Math.round(square.width), Math.round(square.height), text.right <= square.left - 12, !quote || quote.top >= square.bottom] : null,
    };
}));

const SCRIPTS = ["src/otd-common.js", "src/modern-look.js", "src/icons.js", "src/media-layout.js", "src/self-threads.js", "src/group-notifications.js"];
for(const [name, options] of Object.entries({
    "light": {}, "dark": { dark: true }, "flex": { width: "flex" }, "dark-flex": { dark: true, width: "flex" }, "whole": { media: "whole" }, "comfortable": { density: "comfortable" },
})) test(`every kind of tweet, ${name}: nothing sticks out, media are a square beside the text, quotes under it`, async ({ page }) => {
    await page.setViewportSize({ width: options.width === "flex" ? 1400 : 1000, height: 3000 });
    await stand(page, options);
    await addScripts(page, ...SCRIPTS);
    await page.evaluate(() => { window.__renderCards(); window.__detailMedia(); });
    await page.waitForTimeout(500);
    const tweets = await layout(page);
    expect(tweets.filter(t => t.out).map(t => t.label)).toEqual([]);
    const squares = tweets.filter(t => t.square);
    if(options.media === "whole") expect(squares.every(t => t.square[0] > 200)).toBe(true);
    else {
        expect(squares.map(t => t.label)).toEqual(expect.arrayContaining(["photo, landscape", "photo, portrait", "two photos", "three photos", "four photos", "video", "gif", "sensitive", "photo and a quote"]));
        for(const t of squares) expect(t.square, t.label).toEqual([80, 80, true, true]);
    }
    if(process.env.SPECIMENS_OUT) await shoot(page, name);
});
