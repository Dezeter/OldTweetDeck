# OldTweetDeck

Returns old TweetDeck, with translation, X Articles, grouped notifications and other additions.

This is an independently developed fork of [OldTweetDeck by dimden](https://github.com/dimdenGD/OldTweetDeck). It doesn't download anything from the original project and gets its updates through the [releases of this repository](https://github.com/Dezeter/OldTweetDeck/releases). MIT licensed, like the original.

> [!NOTE]
> Since Twitter made likes private, the Likes tab aren't loading anymore.  
> This can not be fixed since the API to retrieve the likes is gone. Same thing with Activity column.

## What's added

- [Auto-translation](#grok-auto-translation) of tweets with Grok, to the language you choose
- [X Articles](#x-articles) in columns and a reader for them, translated with Google Translate
- [Grouped notifications](#grouped-notifications): likes, retweets and follows like on x.com
- [Replies to other people hidden](#replies-in-home-columns) in home columns
- [All replies](#all-replies-in-the-tweet-view) in the tweet view, and [your sent replies](#instant-replies) shown right away
- [Pasting images](#pasting-images) into the compose box with Ctrl+V
- [Links straight to the site](#links-and-time) instead of t.co, and [exact tweet times](#links-and-time) if you like
- [A Settings tab](#settings) to switch each of these on and off

## Installation

Note: Do not delete the extension files (unzipped archive for Chromium, zip file for Firefox) after installation.  
If the original OldTweetDeck is installed, remove or disable it first: both work on the same page.

### Chromium (Chrome, Edge, Opera, Brave, Etc.)

1. Go to the [Release page](https://github.com/Dezeter/OldTweetDeck/releases) and download `OldTweetDeckChrome.zip`
2. Unzip the archive
3. Go to extensions page (`chrome://extensions`)
4. Enable developer mode (there should be switch somewhere on that page)
5. Press "Load unpacked" button
6. Select folder with unzipped archive
7. Go to https://x.com/i/tweetdeck and enjoy old TweetDeck

### Firefox

#### Nightly / Developer Edition

1. Go to the [Release page](https://github.com/Dezeter/OldTweetDeck/releases) and download `OldTweetDeckFirefox.zip`
2. Go to Firefox Configuration Editor (`about:config`)
3. Change the preference `xpinstall.signatures.required` to false
4. Go to addons page(`about:addons`)
5. Press "Install Add-on From File..." button
6. Select zip file you downloaded
7. Go to https://x.com/i/tweetdeck and enjoy old TweetDeck

#### Stable

**It's not recommended to use this extension on Stable version.**

1. Go to `about:debugging#/runtime/this-firefox`
2. Press "Load Temporary Add-on" and select zip file you downloaded
3. **Installing this way on Firefox will remove it after closing browser.**

### Safari

NOT SUPPORTED

## Updating

Everything ships with the extension: TweetDeck's own code, the request handling and the signing of requests to X (`x-client-transaction-id`, computed locally the same way x.com does it). Nothing is downloaded at runtime except from X itself.  
When a new release is out, OldTweetDeck tells you about it once. Download it from the [Release page](https://github.com/Dezeter/OldTweetDeck/releases) and replace the extension files: in Chromium, unzip over the old folder and press the reload button of the extension on `chrome://extensions`.

## Settings

Settings → OldTweetDeck has a switch for every feature below, all on by default, and the language to translate to. Changes apply after a reload; the tab has a link for it.

The same settings are kept in `localStorage`, so they can also be changed from the browser console on the TweetDeck tab (`"0"` turns a feature off, removing the key turns it back on):

| Feature | Key |
|---|---|
| Translating tweets with Grok | `OTDgrokTranslate` |
| Translating articles with Google | `OTDarticlesTranslate` |
| Language to translate to (default: the browser's) | `OTDgrokTranslateLang`, e.g. `'ru'` |
| Hiding replies in home columns | `OTDhideHomeReplies` |
| Grouping notifications | `OTDgroupNotifications` |
| Loading all replies | `OTDloadAllReplies` |
| Showing your reply right away | `OTDinstantReplies` |
| X Articles | `OTDarticles` |
| Links straight to the site | `OTDcleanLinks` |
| Exact tweet times (off by default, `'1'` turns it on) | `OTDabsoluteTime` |
| Pasting images | `OTDpasteImages` |

## Grok auto-translation

Tweets and quoted tweets that aren't in your language are translated automatically through Grok, the same endpoint x.com uses for "Show translation". Translated tweets get a translate icon next to reply/retweet/like that switches between the original and the translation.  
Only tweets that stay on screen are translated, at most 20 per minute, and translations are cached for 7 days.

The language to translate to is the browser's unless you pick another in [Settings](#settings).

## Replies in home columns

Home columns hide replies to other people, the way mutes hide tweets. Threads where the author replies to themselves and retweets of replies still show, and replies stay visible when you open a conversation.

## All replies in the tweet view

TweetDeck only shows the first page of replies when you open a tweet. OldTweetDeck also loads up to 3 more pages, including the replies x.com hides behind "Show more replies" and "Show probable spam".

## Pasting images

Ctrl+V of an image in the tweet or reply box attaches it, the same as picking it with "Add image".

## X Articles

A tweet that is an X Article shows the title and the start of the text instead of the bare `x.com/i/article/…` link. Clicking it opens the whole article in a reader over most of the screen; Esc, the × button or a click outside closes it.  
Articles in another language are translated with Google Translate (the card and the reader, with a button to switch back to the original). The language is the same as for tweet translation.  
With article translation switched off in [Settings](#settings), the reader still has the button to translate.

## Grouped notifications

Notifications are grouped the way x.com shows them: likes and retweets of the same tweet become one item with a row of avatars ("A, B and 3 others liked"), follows in a row become one, and the liked tweet is cut to three lines without media.

## Links and time

Links in tweets and the website in a profile lead straight to the site instead of through t.co. Hovering a link shows where it goes.

Tweet times can show the time and date instead of "5m": "14:05" for today, "26 окт., 14:05" this year, "26.10.2025" before, in your browser's language. This one is off by default, switch it on in [Settings](#settings).

## Instant replies

A reply you send shows up in the open conversation right away, instead of after the next refresh or reopening the tweet.

## Development

`npm install`, then:

- `npm test` runs the tests: TweetDeck's own code with these scripts on stubbed pages, in Chromium and Firefox, and the unpacked extension in Chromium. They need Playwright's browsers once: `npx playwright install chromium firefox`.
- `npm run build` packs `build/OldTweetDeckChrome.zip` and `build/OldTweetDeckFirefox.zip`. Publishing a release attaches them to it.

## FAQ

#### Extension stopped working.

Before opening an issue, try to reinstall extension.

#### Some column isn't loading for me.

You're getting rate limited. They'll comeback after some time.

#### Likes tab aren't loading for me.

This can not be fixed. Since Twitter made likes private, the API to retrieve likes is gone.

## License

MIT, see [LICENSE](LICENSE). Copyright dimden (the original OldTweetDeck) and Dezeter (this fork).  
The `x-client-transaction-id` algorithm in `src/challenge.js` is ported from [x-client-transaction-id](https://github.com/Lqm1/x-client-transaction-id) by Lami (MIT).  
TweetDeck's own code in `files/` (`bundle.js`, `vendor.js`, `bundle.css`) belongs to X Corp., as in the original project.
