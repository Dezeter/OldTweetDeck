// X Articles. A tweet that is an article shows its title and the start of the text in place of the
// x.com/i/article link, and a click opens the whole article in a reader over most of the screen.
// Loaded by injection.js after bundle.js.
//   localStorage.OTDarticles = "0"  turns it off
(() => {
    if(localStorage.OTDarticles === "0") return;

    const ARTICLE_RE = /(?:x|twitter)\.com\/i\/article\/(\d+)/;
    const QUERY_PATH = "/i/api/graphql/aZ3tDYsjtdOMi7iarEJuiQ/TweetResultByRestId";
    const BEARER = "Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA";
    // the set x.com sends with TweetResultByRestId
    const FEATURES = {"creator_subscriptions_tweet_preview_api_enabled":true,"premium_content_api_read_enabled":false,"communities_web_enable_tweet_community_results_fetch":true,"c9s_tweet_anatomy_moderator_badge_enabled":true,"responsive_web_grok_analyze_button_fetch_trends_enabled":false,"responsive_web_grok_analyze_post_followups_enabled":true,"rweb_cashtags_composer_attachment_enabled":true,"responsive_web_jetfuel_frame":true,"rweb_sports_post_context_enabled":true,"responsive_web_grok_share_attachment_enabled":true,"responsive_web_grok_annotations_enabled":true,"articles_preview_enabled":true,"responsive_web_edit_tweet_api_enabled":true,"rweb_conversational_replies_downvote_enabled":false,"graphql_is_translatable_rweb_tweet_is_translatable_enabled":true,"view_counts_everywhere_api_enabled":true,"longform_notetweets_consumption_enabled":true,"responsive_web_twitter_article_tweet_consumption_enabled":true,"content_disclosure_indicator_enabled":true,"content_disclosure_ai_generated_indicator_enabled":true,"responsive_web_grok_show_grok_translated_post":true,"responsive_web_grok_analysis_button_from_backend":true,"post_ctas_fetch_enabled":false,"rweb_cashtags_enabled":true,"freedom_of_speech_not_reach_fetch_enabled":true,"standardized_nudges_misinfo":true,"tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled":true,"longform_notetweets_rich_text_read_enabled":true,"longform_notetweets_inline_media_enabled":false,"profile_label_improvements_pcf_label_in_post_enabled":true,"responsive_web_profile_redirect_enabled":true,"rweb_tipjar_consumption_enabled":false,"verified_phone_label_enabled":false,"responsive_web_nested_quote_preview_enabled":true,"responsive_web_grok_image_annotation_enabled":true,"responsive_web_grok_imagine_annotation_enabled":true,"responsive_web_grok_community_note_auto_translation_is_enabled":true,"responsive_web_graphql_timeline_navigation_enabled":true};

    const LABELS = {
        ru: { read: "Читать статью", open: "Открыть на x.com", close: "Закрыть" },
        en: { read: "Read article", open: "Open on x.com", close: "Close" },
    };
    const LABEL = LABELS[(navigator.language || "en").split("-")[0]] || LABELS.en;

    const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
    const getCookie = name => document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`))?.[1] || "";

    function el(tag, className, text) {
        const node = document.createElement(tag);
        if(className) node.className = className;
        if(text) node.textContent = text;
        return node;
    }

    function externalLink(url, text) {
        const a = el("a", "", text);
        a.href = url;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        return a;
    }

    // --- data -----------------------------------------------------------------
    async function requestArticle(tweetId) {
        const params = new URLSearchParams({
            variables: JSON.stringify({ tweetId, withCommunity: false, includePromotedContent: false, withVoice: false }),
            features: JSON.stringify(FEATURES),
            fieldToggles: JSON.stringify({ withArticleRichContentState: true, withArticlePlainText: true }),
        });
        const headers = {
            "authorization": BEARER,
            "x-csrf-token": getCookie("ct0"),
            "x-twitter-auth-type": "OAuth2Session",
            "x-twitter-active-user": "yes",
            "x-twitter-client-language": "en",
            "content-type": "application/json",
        };
        if(localStorage.device_id) headers["x-client-uuid"] = localStorage.device_id;
        if(typeof solveChallenge === "function") {
            try {
                headers["x-client-transaction-id"] = await solveChallenge(QUERY_PATH, "GET");
            } catch(e) {
                console.warn("[otd-articles] challenge error", e);
            }
        }

        const res = await fetch(`https://${location.hostname}${QUERY_PATH}?${params}`, { headers, credentials: "include" });
        if(!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        let result = data?.data?.tweetResult?.result;
        if(result?.tweet) result = result.tweet;  // TweetWithVisibilityResults
        const article = result?.article?.article_results?.result;
        if(!article) return null;

        // X is moving user fields from legacy to core
        const user = result.core?.user_results?.result;
        return {
            article,
            name: user?.core?.name ?? user?.legacy?.name ?? "",
            screenName: user?.core?.screen_name ?? user?.legacy?.screen_name ?? "",
        };
    }

    // one request at a time, articles are rare enough
    const articles = new Map();
    let queue = Promise.resolve();
    function getArticle(tweetId) {
        if(!articles.has(tweetId)) {
            const request = queue.then(() => requestArticle(tweetId)).catch(e => {
                console.warn("[otd-articles]", tweetId, e.message);
                return null;
            });
            queue = request.then(() => sleep(300));
            articles.set(tweetId, request);
        }
        return articles.get(tweetId);
    }

    // --- article content ------------------------------------------------------
    // content_state is a Draft.js raw state: blocks with ranges in code points, entityMap as [{key, value}]
    function entityMap(raw) {
        const map = new Map();
        if(Array.isArray(raw)) raw.forEach(e => map.set(String(e.key), e.value));
        else if(raw) Object.entries(raw).forEach(([key, value]) => map.set(String(key), value));
        return map;
    }

    const STYLE_TAGS = { bold: "b", italic: "i", strikethrough: "s", underline: "u", code: "code" };

    function fillInline(node, block, entities) {
        const chars = Array.from(block.text || "");
        const styles = block.inlineStyleRanges || [];
        const links = (block.entityRanges || []).filter(r => {
            const entity = entities.get(String(r.key));
            return entity?.type?.toUpperCase() === "LINK" && /^https?:\/\//i.test(entity.data?.url || "");
        });
        const cuts = new Set([0, chars.length]);
        for(const r of [...styles, ...links]) cuts.add(r.offset).add(r.offset + r.length);
        const points = [...cuts].filter(n => n >= 0 && n <= chars.length).sort((a, b) => a - b);

        for(let i = 0; i < points.length - 1; i++) {
            const from = points[i], to = points[i + 1];
            const covers = r => r.offset <= from && r.offset + r.length >= to;
            let piece = document.createTextNode(chars.slice(from, to).join(""));
            for(const r of styles.filter(covers)) {
                const tag = STYLE_TAGS[String(r.style).toLowerCase()];
                if(!tag) continue;
                const wrap = el(tag);
                wrap.append(piece);
                piece = wrap;
            }
            const link = links.find(covers);
            if(link) {
                const a = externalLink(entities.get(String(link.key)).data.url);
                a.append(piece);
                piece = a;
            }
            node.append(piece);
        }
        return node;
    }

    function renderAtomic(block, entities, media) {
        const key = block.entityRanges?.[0]?.key;
        const entity = key === undefined ? null : entities.get(String(key));
        const data = entity?.data || {};
        switch(entity?.type?.toUpperCase()) {
            case "MEDIA": {
                const figure = el("figure");
                for(const item of data.mediaItems || []) {
                    const info = media.get(String(item.mediaId ?? item.media_id))?.media_info;
                    const src = info?.original_img_url || info?.preview_image?.original_img_url;
                    if(!src) continue;
                    const img = el("img");
                    img.src = src;
                    img.loading = "lazy";
                    figure.append(img);
                }
                return figure.childElementCount ? figure : null;
            }
            case "DIVIDER":
                return el("hr");
            case "TWEET": {
                if(!data.tweetId) return null;
                const p = el("p");
                p.append(externalLink(`https://x.com/i/status/${data.tweetId}`, `x.com/i/status/${data.tweetId}`));
                return p;
            }
            case "MARKDOWN":
                return data.markdown ? el("pre", "", data.markdown) : null;
        }
        return null;
    }

    const BLOCK_TAGS = { "header-one": "h2", "header-two": "h3", "header-three": "h4", "blockquote": "blockquote", "code-block": "pre" };

    function renderContent(article) {
        const out = document.createDocumentFragment();
        const blocks = article.content_state?.blocks;
        if(!Array.isArray(blocks) || !blocks.length) {
            for(const para of String(article.plain_text || article.preview_text || "").split(/\n+/)) {
                if(para.trim()) out.append(el("p", "", para));
            }
            return out;
        }

        const entities = entityMap(article.content_state.entityMap);
        const media = new Map((article.media_entities || []).map(m => [String(m.media_id), m]));
        let list = null;
        for(const block of blocks) {
            const listTag = block.type === "unordered-list-item" ? "UL" : block.type === "ordered-list-item" ? "OL" : null;
            if(listTag) {
                if(list?.tagName !== listTag) out.append(list = el(listTag));
                list.append(fillInline(el("li"), block, entities));
                continue;
            }
            list = null;
            if(block.type === "atomic") {
                const node = renderAtomic(block, entities, media);
                if(node) out.append(node);
                continue;
            }
            if(!block.text?.trim()) continue;
            out.append(fillInline(el(BLOCK_TAGS[block.type] || "p"), block, entities));
        }
        return out;
    }

    // --- reader ---------------------------------------------------------------
    function openReader(tweetId, href, { article, name, screenName }) {
        const overlay = el("div", "otd-article-overlay");
        if(document.documentElement.classList.contains("dark")) overlay.classList.add("otd-article-dark");
        const panel = el("div", "otd-article-panel");
        const close = el("button", "otd-article-close", "×");
        close.title = LABEL.close;
        const scroll = el("div", "otd-article-scroll");
        scroll.tabIndex = -1;
        const body = el("div", "otd-article-body");

        const cover = article.cover_media?.media_info?.original_img_url;
        if(cover) {
            const img = el("img", "otd-article-cover");
            img.src = cover;
            body.append(img);
        }
        body.append(el("h1", "", article.title || ""));
        const date = article.metadata?.first_published_at_secs;
        body.append(el("div", "otd-article-byline", [
            name,
            screenName && `@${screenName}`,
            date && new Date(date * 1000).toLocaleDateString(),
        ].filter(Boolean).join(" · ")));
        body.append(renderContent(article));
        const footer = el("div", "otd-article-footer");
        footer.append(externalLink(href, LABEL.open));
        body.append(footer);

        scroll.append(body);
        panel.append(close, scroll);
        overlay.append(panel);

        // capture phase: TweetDeck's keyboard shortcuts must not fire while reading
        const onKey = e => {
            e.stopPropagation();
            if(e.key === "Escape") hide();
        };
        function hide() {
            document.removeEventListener("keydown", onKey, true);
            overlay.remove();
        }
        document.addEventListener("keydown", onKey, true);
        close.addEventListener("click", hide);
        overlay.addEventListener("mousedown", e => { if(e.target === overlay) hide(); });

        document.body.append(overlay);
        scroll.focus();
    }

    // --- tweets ---------------------------------------------------------------
    function buildCard(tweetId, href, data) {
        const card = el("div", "otd-article-card");
        card.append(el("div", "otd-article-card-title", data.article.title || ""));
        const preview = data.article.preview_text || String(data.article.plain_text || "").slice(0, 400);
        if(preview) card.append(el("div", "otd-article-card-preview", preview));
        card.append(el("div", "otd-article-card-hint", LABEL.read));

        // stream items and quotes are clickable and draggable as a whole
        const stop = e => { e.preventDefault(); e.stopPropagation(); };
        card.addEventListener("mousedown", stop);
        card.addEventListener("click", e => { stop(e); openReader(tweetId, href, data); });
        return card;
    }

    function collect() {
        const found = [];
        for(const item of document.querySelectorAll("article.js-stream-item[data-tweet-id]")) {
            const text = [...item.querySelectorAll(".js-tweet-text")].find(t =>
                t.closest("article.js-stream-item") === item && !t.closest(".js-quote-detail")
            );
            if(text) found.push({ id: item.dataset.tweetId, text });
        }
        for(const quote of document.querySelectorAll(".js-quote-detail[data-tweet-id]")) {
            const text = quote.querySelector(".js-quoted-tweet-text");
            if(text) found.push({ id: quote.dataset.tweetId, text });
        }
        return found;
    }

    function scan() {
        for(const { id, text } of collect()) {
            if(!/^\d+$/.test(id) || text.dataset.otdArticle === id) continue;
            const link = [...text.querySelectorAll("a")].find(a => ARTICLE_RE.test(a.dataset.fullUrl || a.title || a.textContent));
            if(!link) continue;
            text.dataset.otdArticle = id;
            const href = link.dataset.fullUrl || link.href;

            getArticle(id).then(data => {
                // without an article (someone else's article linked) the link stays as it is
                if(!data || !text.isConnected || text.nextElementSibling?.classList.contains("otd-article-card")) return;
                link.classList.add("otd-article-link");
                text.after(buildCard(id, href, data));
            });
        }
    }

    let scheduled = false;
    function schedule() {
        if(scheduled) return;
        scheduled = true;
        requestAnimationFrame(() => {
            scheduled = false;
            scan();
        });
    }

    const style = document.createElement("style");
    style.textContent = `
        .otd-article-link { display: none !important; }
        .otd-article-card { margin: 6px 0 4px; padding: 8px 10px; border: 1px solid rgba(136, 153, 166, .4); border-radius: 12px; cursor: pointer; }
        .otd-article-card:hover { border-color: #1da1f2; }
        .otd-article-card .otd-article-card-title { font-weight: bold; margin-bottom: 4px; }
        .otd-article-card .otd-article-card-preview { display: -webkit-box; -webkit-line-clamp: 4; -webkit-box-orient: vertical; overflow: hidden; white-space: normal; }
        .otd-article-card .otd-article-card-hint { margin-top: 6px; font-size: 12px; color: #1da1f2; }

        /* two classes deep: the dark theme repeats TweetDeck's element rules under html.dark */
        .otd-article-overlay { position: fixed; inset: 0; z-index: 10000; display: flex; align-items: center; justify-content: center; background: rgba(0, 0, 0, .6); }
        .otd-article-overlay .otd-article-panel { position: relative; display: flex; flex-direction: column; width: min(960px, 94vw); height: 92vh; overflow: hidden; border-radius: 14px; background: #fff; color: #14171a; box-shadow: 0 8px 40px rgba(0, 0, 0, .5); }
        .otd-article-dark .otd-article-panel { background: #15202b; color: #fff; }
        .otd-article-overlay .otd-article-close { position: absolute; top: 10px; right: 14px; z-index: 1; width: 36px; height: 36px; border: 0; border-radius: 50%; background: rgba(136, 153, 166, .2); color: inherit; font-size: 24px; line-height: 36px; cursor: pointer; }
        .otd-article-overlay .otd-article-close:hover { background: rgba(136, 153, 166, .4); }
        .otd-article-overlay .otd-article-scroll { flex: 1; overflow-y: auto; outline: none; padding: 40px 24px 56px; }
        .otd-article-overlay .otd-article-body { max-width: 680px; margin: 0 auto; font-size: 17px; line-height: 1.6; overflow-wrap: break-word; }
        .otd-article-overlay .otd-article-body .otd-article-cover { display: block; width: 100%; max-height: 420px; object-fit: cover; border-radius: 12px; margin-bottom: 20px; }
        .otd-article-overlay .otd-article-body h1 { font-size: 32px; line-height: 1.2; font-weight: 800; margin: 0 0 10px; }
        .otd-article-overlay .otd-article-body h2 { font-size: 24px; line-height: 1.3; font-weight: 700; margin: 30px 0 10px; }
        .otd-article-overlay .otd-article-body h3 { font-size: 20px; line-height: 1.3; font-weight: 700; margin: 24px 0 8px; }
        .otd-article-overlay .otd-article-body h4 { font-size: 18px; font-weight: 700; margin: 20px 0 8px; }
        .otd-article-overlay .otd-article-body p { margin: 0 0 14px; }
        .otd-article-overlay .otd-article-body ul, .otd-article-overlay .otd-article-body ol { margin: 0 0 14px; padding-left: 1.5em; }
        .otd-article-overlay .otd-article-body ul { list-style: disc; }
        .otd-article-overlay .otd-article-body ol { list-style: decimal; }
        .otd-article-overlay .otd-article-body li { margin: 4px 0; }
        .otd-article-overlay .otd-article-body blockquote { margin: 16px 0; padding: 2px 0 2px 16px; border-left: 3px solid #1da1f2; color: #8899a6; }
        .otd-article-overlay .otd-article-body pre { margin: 0 0 14px; padding: 12px 14px; border-radius: 8px; background: rgba(136, 153, 166, .15); white-space: pre-wrap; font-size: 14px; line-height: 1.5; }
        .otd-article-overlay .otd-article-body figure { margin: 20px 0; }
        .otd-article-overlay .otd-article-body figure img { display: block; max-width: 100%; margin: 0 auto 8px; border-radius: 10px; }
        .otd-article-overlay .otd-article-body hr { margin: 28px 0; border: 0; border-top: 1px solid rgba(136, 153, 166, .4); }
        .otd-article-overlay .otd-article-body a { color: #1da1f2; }
        .otd-article-overlay .otd-article-body b { font-weight: bold; }
        .otd-article-overlay .otd-article-body i { font-style: italic; }
        .otd-article-overlay .otd-article-body .otd-article-byline { margin-bottom: 28px; font-size: 14px; color: #8899a6; }
        .otd-article-overlay .otd-article-body .otd-article-footer { margin-top: 32px; font-size: 14px; }
    `;
    // injection.js removes the original head/body of x.com once TweetDeck is in, stay on ours
    (document.getElementById("injected-head") || document.head).appendChild(style);

    new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
    setInterval(schedule, 2000);
    schedule();
})();
