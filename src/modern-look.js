// TweetDeck's look brought to today's standards where it falls short (UX audit, October 2026):
// - the light theme's grey text, icons and links pass WCAG AA: #536471 for secondary text and the icons of the
//   action row (2.9:1 and 2.0:1 before), #1570c4 for links (2.8:1 before); the dark theme already passes;
// - the action row's buttons take a 32px circle around their 18px icons, tinted on hover as on x.com;
// - keyboard focus shows (TweetDeck takes the outline off everywhere), for the pointer it stays as it was;
// - tweet text at line-height 1.4 instead of 1.29, @handles at 13px instead of 12, counts in tabular figures,
//   6px between a tweet's text and its buttons instead of 3;
// - a quoted tweet's text in the tweet's color, as on x.com: TweetDeck's grey is 3.6:1 in the dark theme;
// - a notification's "Name retweeted" / "Name liked" on one line: a 20px avatar, the name, the action in grey,
//   a long name cut with "…" (TweetDeck's wraps the action under a 24px avatar).
// Whatever the switch, the system's "reduce motion" stops TweetDeck's animations, CSS and jQuery ones.
// Loaded by injection.js after otd-common.js. Switch "modernLook", applies without a reload.
(() => {
    // the system's setting, now and when it changes
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    const $ = OTD.jQuery();
    const applyMotion = () => {
        if($?.fx) $.fx.off = !!reduce?.matches;
    };
    applyMotion();
    reduce?.addEventListener?.("change", applyMotion);
    OTD.addStyle(`
        @media (prefers-reduced-motion: reduce) {
            *, *::before, *::after { animation-duration: .01ms !important; animation-iteration-count: 1 !important; transition-duration: .01ms !important; scroll-behavior: auto !important; }
        }
    `);

    OTD.htmlClassWhileOn("modernLook", "otd-modern");

    const ACTIONS = ".tweet-action, .tweet-detail-action";
    const RESTING = ":not(:hover):not(:focus):not(:active):not(.is-selected)";
    OTD.addStyle(`
        html.otd-modern:not(.dark) .txt-mute,
        html.otd-modern:not(.dark) .txt-mute a:not(:hover):not(:focus),
        html.otd-modern:not(.dark) .txt-mute-text-only,
        html.otd-modern:not(.dark) .chirp-container .stream-item:not(:hover):not(.is-selected-tweet) .tweet-action${RESTING},
        html.otd-modern:not(.dark) .chirp-container .stream-item:not(:hover):not(.is-selected-tweet) .tweet-detail-action${RESTING},
        html.otd-modern:not(.dark) .tweet-action${RESTING},
        html.otd-modern:not(.dark) .tweet-detail-action${RESTING} { color: #536471; }
        html.otd-modern:not(.dark) .tweet-text a:not(:hover),
        html.otd-modern:not(.dark) .other-replies a:not(:hover),
        html.otd-modern:not(.dark) .js-show-this-thread .color-twitter-blue { color: #1570c4; }

        /* the circle is the button's middle, so the button is its icon's height and the icon in the middle of its own:
           with the counts on TweetDeck floats the icon and the count, and the button around them would be 0px tall;
           an opened tweet's icon has a line taller than itself, its middle 2.6px under the icon's */
        html.otd-modern .tweet-action, html.otd-modern .tweet-detail-action { position: relative; z-index: 0; display: flow-root; }
        html.otd-modern .tweet-action .icon, html.otd-modern .tweet-detail-action .icon { line-height: 1; }
        html.otd-modern .tweet-action::after, html.otd-modern .tweet-detail-action::after {
            content: ""; position: absolute; z-index: -1; left: -7px; top: 50%; width: 32px; height: 32px; margin-top: -16px;
            border-radius: 50%; transition: background-color .15s;
        }
        html.otd-modern .tweet-action:hover::after, html.otd-modern .tweet-detail-action:hover::after { background-color: rgba(29, 155, 240, .12); }
        html.otd-modern .tweet-action[rel="retweet"]:hover::after, html.otd-modern .tweet-detail-action[rel="retweet"]:hover::after { background-color: rgba(23, 191, 99, .12); }
        html.otd-modern .tweet-action[rel="favorite"]:hover::after, html.otd-modern .tweet-detail-action[rel="favorite"]:hover::after { background-color: rgba(224, 36, 94, .12); }

        html.otd-modern :focus-visible:not(input):not(textarea):not(select):not([contenteditable]) { outline: 2px solid #1d9bf0 !important; outline-offset: 2px; }
        html.otd-modern ${ACTIONS.split(", ").map(s => `${s}:focus-visible`).join(", ")} { outline-offset: 6px; border-radius: 50%; }

        html.otd-modern .stream-item .js-tweet-text.tweet-text, html.otd-modern .tweet-detail .js-tweet-text.tweet-text, html.otd-modern .quoted-tweet .js-quoted-tweet-text { line-height: 1.4; }
        html.otd-modern .tweet-header .account-inline .username { font-size: 13px; }
        html.otd-modern .tweet-footer, html.dark.otd-modern .tweet-footer { margin-top: 6px; }
        html.otd-modern .quoted-tweet, html.dark.otd-modern .quoted-tweet { color: inherit; }
        html.otd-modern .js-stream-item:not(.otd-notif-group) .activity-header > .nbfc {
            display: flex; align-items: center; gap: 6px; min-width: 0; font-size: 13px; line-height: 20px; white-space: nowrap; color: #536471;
        }
        html.dark.otd-modern .js-stream-item:not(.otd-notif-group) .activity-header > .nbfc { color: #8899a6; }
        /* the line and its time on one middle, not on the avatar's baseline */
        html.otd-modern .js-stream-item:not(.otd-notif-group) .activity-header > .nbfc,
        html.otd-modern .js-stream-item:not(.otd-notif-group) .activity-header > .tweet-timestamp { align-self: center; }
        html.otd-modern .js-stream-item:not(.otd-notif-group) .activity-header > .nbfc > .avatar { flex: none; width: 20px; height: 20px; margin: 0; border-radius: 50%; }
        html.otd-modern .js-stream-item:not(.otd-notif-group) .activity-header > .nbfc > .account-link { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
        html.otd-modern .tweet-action, html.otd-modern .tweet-detail-action, html.otd-modern .tweet-timestamp, html.otd-modern .like-count, html.otd-modern .retweet-count, html.otd-modern .reply-count { font-variant-numeric: tabular-nums; }
    `);
})();
