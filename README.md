# TweeXDeck

Until 5.12.0 this fork was called OldTweetDeck, like the project it comes from.

Returns old TweetDeck, with translation, X Articles, grouped notifications and other additions.

This is an independently developed fork of [OldTweetDeck by dimden](https://github.com/dimdenGD/OldTweetDeck). It doesn't download anything from the original project and gets its updates through the [releases of this repository](https://github.com/Dezeter/TweeXDeck/releases). MIT licensed, like the original.

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
- [Media as a small square beside the text](#media), or whole, instead of TweetDeck's cropped strips; [videos that play right in the tweet](#media), and [downloading media](#media) or copying its links from the tweet menu
- [Redrafting your tweet, muting a hashtag or an app](#tweet-menu) from the tweet menu, [Mute and Block buttons](#tweet-menu) under tweets
- [Super wide columns](#columns) of 400px, [flex columns that share the window](#columns), [columns that hold still](#columns) under the pointer, [an author's threads joined by a line](#columns), and [unread counts](#columns) in the tab title
- [Tweet shapes while a column loads](#loading-and-empty-columns), and a plain message with a button when it's empty or X didn't answer
- [Emoji and GIF pickers](#emoji-and-gifs) in the tweet box
- [An explanation instead of an endless spinner](#when-tweetdeck-doesnt-load) when TweetDeck doesn't load, with a report to copy into an issue
- [A theme that follows the system's](#appearance), [Lights out](#appearance) in x.com's black, [a comfortable density](#appearance) and [sharp SVG icons](#appearance)
- [A font of your choice](#font) for TweetDeck's text: Golos Text, Onest, Inter or Manrope
- [A command palette](#command-palette) on Ctrl+K: go to a column, write a tweet, switch the theme and more
- [A Settings tab](#settings) to switch each of these on and off, with a search

## Installation

Note: Do not delete the extension files (unzipped archive for Chromium, zip file for Firefox) after installation.  
If the original OldTweetDeck is installed, remove or disable it first: both work on the same page.

### Chromium (Chrome, Edge, Opera, Brave, Etc.)

1. Go to the [Release page](https://github.com/Dezeter/TweeXDeck/releases) and download `TweeXDeckChrome.zip`
2. Unzip the archive
3. Go to extensions page (`chrome://extensions`)
4. Enable developer mode (there should be switch somewhere on that page)
5. Press "Load unpacked" button
6. Select folder with unzipped archive
7. Go to https://x.com/i/tweetdeck and enjoy old TweetDeck

### Firefox

#### Nightly / Developer Edition

1. Go to the [Release page](https://github.com/Dezeter/TweeXDeck/releases) and download `TweeXDeckFirefox.zip`
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
When a new release is out, TweeXDeck tells you about it once. Download it from the [Release page](https://github.com/Dezeter/TweeXDeck/releases) and replace the extension files: in Chromium, unzip over the old folder and press the reload button of the extension on `chrome://extensions`.

## Settings

Settings → TweeXDeck has a switch for every feature below, all on by default, and the language to translate to; under "Appearance" also TweetDeck's own theme and column width, the density and the font. A field at the top finds a setting by any word of it, in Russian or English. What's under "Appearance" applies at once; the rest after a reload, and the tab says when one is needed, with a link for it.

The same settings are kept in `localStorage`, so they can also be changed from the browser console on the TweetDeck tab (`"0"` turns a feature off, removing the key turns it back on):

| Feature | Key |
|---|---|
| Translating tweets with Grok | `OTDgrokTranslate` |
| Translating articles with Google | `OTDarticlesTranslate` |
| Language to translate to (default: the browser's) | `OTDgrokTranslateLang`, e.g. `'ru'` |
| Hiding replies in home columns | `OTDhideHomeReplies` |
| Grouping notifications | `OTDgroupNotifications` |
| Holding a column under the pointer | `OTDpauseOnHover` |
| An author's threads without "Replying to @author", joined by a line | `OTDselfThreads` |
| An author's threads in a column from the first tweet down | `OTDthreadsOldestFirst` |
| Unread in the tab title | `OTDtabTitle` |
| Loading all replies | `OTDloadAllReplies` |
| Showing your reply right away | `OTDinstantReplies` |
| X Articles | `OTDarticles` |
| Links straight to the site | `OTDcleanLinks` |
| Exact tweet times (off by default, `'1'` turns it on) | `OTDabsoluteTime` |
| "Redraft" in your tweet's menu | `OTDredraft` |
| "Mute #hashtag" and "Mute tweets from …" in the tweet menu | `OTDmuteFromMenu` |
| Mute and Block buttons under tweets (off by default, `'1'` turns it on) | `OTDrowMuteBlock` |
| Media in columns (a square beside the text without the key) | `OTDmedia`: `'whole'` or `'strip'` |
| Videos playing in the tweet | `OTDinlineVideo` |
| "Download media" in the tweet menu | `OTDdownloadMedia` |
| "Copy links to media" in the tweet menu | `OTDcopyMediaLinks` |
| Pasting images | `OTDpasteImages` |
| "Emoji" button | `OTDemojiPicker` |
| "Find a GIF" button | `OTDgifPicker` |
| Better readability: contrast, larger buttons, keyboard focus | `OTDmodernLook` |
| Lights out (off by default, `'1'` turns it on) | `OTDlightsOut` |
| Theme following the system's (TweetDeck's own pick without the key) | `OTDthemeSystem`: `'1'` |
| Density (TweetDeck's compact without the key) | `OTDdensity`: `'comfortable'` |
| SVG icons | `OTDsvgIcons` |
| Font (TweetDeck's own without the key) | `OTDfont`: `'golos'`, `'onest'`, `'inter'` or `'manrope'` |
| Tweet shapes while loading, messages in empty columns | `OTDskeletons` |
| Keeping x.com's service worker off (off by default, `'1'` turns it on) | `OTDblockServiceWorker` |
| Reloading once and telling why TweetDeck didn't load | `OTDloadWatchdog` |

## Grok auto-translation

Tweets and quoted tweets that aren't in your language are translated automatically through Grok, the same endpoint x.com uses for "Show translation". Translated tweets get a translate icon next to reply/retweet/like that switches between the original and the translation.  
Only tweets that stay on screen are translated, at most 20 per minute, and translations are cached for 7 days.

The language to translate to is the browser's unless you pick another in [Settings](#settings).

## Replies in home columns

Home columns hide replies to other people, the way mutes hide tweets. Threads where the author replies to themselves and retweets of replies still show, and replies stay visible when you open a conversation.

## All replies in the tweet view

TweetDeck only shows the first page of replies when you open a tweet. TweeXDeck also loads up to 3 more pages, including the replies x.com hides behind "Show more replies" and "Show probable spam".  
TweetDeck asks for an open tweet's replies again every minute; the extra pages are kept for 5 minutes and only the first page is asked for again, so X's rate limit lasts longer. When X's answer gets lost or comes back empty, it's asked for once more.

## Pasting images

Ctrl+V of an image in the tweet or reply box attaches it, the same as picking it with "Add image".

A quote Tweet can have images and video too, as on x.com: TweetDeck kept them apart ("Quoted Tweets cannot contain images"), which X no longer does. Such a Tweet shows the quoted one under its media, in columns and opened. A direct message still takes a Tweet or an image.

## Emoji and GIFs

The tweet box has two more buttons under "Add image":

- **Emoji** opens a panel with every emoji by group, a search by name in Russian or English, and the ones you used recently at the top. A click puts the emoji where the cursor is.
- **Find a GIF** searches GIFs with x.com's own GIF search and attaches the one you click, like an image added with "Add image".

The emoji list is `files/emoji.json`, built from [emojibase](https://emojibase.dev) (MIT) by `npm run emoji`.

## X Articles

A tweet that is an X Article shows the title and the start of the text instead of the bare `x.com/i/article/…` link. Clicking it opens the whole article in a reader over most of the screen; Esc, the × button or a click outside closes it.  
Articles in another language are translated with Google Translate (the card and the reader, with a button to switch back to the original). The language is the same as for tweet translation.  
With article translation switched off in [Settings](#settings), the reader still has the button to translate.

## Grouped notifications

Notifications are grouped the way x.com shows them: likes and retweets of the same tweet become one item with a row of avatars ("A, B and 3 others liked"), follows in a row become one, and the liked tweet is cut to three lines without media.

## Links and time

Links in tweets and the website in a profile lead straight to the site instead of through t.co. Hovering a link shows where it goes.

Tweet times can show the time and date instead of "5m": "14:05" for today, "26 окт., 14:05" this year, "26.10.2025" before, in your browser's language. This one is off by default, switch it on in [Settings](#settings).

## Media

Settings → TweeXDeck → Media → "Media in columns" sets how a tweet's photos and videos show in a column:

- **A square beside the text**, the default: an 80px square at the right, the text, "Replying to" and the buttons in a column beside it, so a tweet with a photo is about as tall as one without. Several photos are TweetDeck's grid in the square (or the first one with "+2"), a video has a play button, a GIF a "GIF" badge, sensitive media an eye to show them. A quoted tweet goes under the square at full width; its own media are a smaller square in the quote. A link card with a large picture is X's small card in a column, its picture beside the title. A click opens TweetDeck's media window as before; a click on a video opens the tweet back to full width and plays it there.
- **Whole**: a tweet with one image shows it whole, in its own proportions, instead of TweetDeck's cropped strip; a very tall image stops at half the screen. Tweets with several images and videos keep TweetDeck's previews.
- **A strip, as in TweetDeck**.

The tweet opened in a column, and columns set to TweetDeck's "Large" media previews, keep TweetDeck's own.

A link card shows its picture also when X sends it in other sizes than the one TweetDeck reads.

A click on a video plays it right in the tweet instead of TweetDeck's media window: in its own proportions, no taller than half the screen, with the browser's controls and full screen. One video plays at a time, it pauses when scrolled away, and the volume is remembered. Ctrl+click or a middle click opens TweetDeck's window as before; GIFs play in place as TweetDeck has them.

The "…" menu of a tweet with media has "Download media": photos are saved at their original size, videos and GIFs as MP4 at the best quality, named after the author and the tweet (`alice_1234567890.jpg`). For this the extension asks for the permission to download files.  
"Copy links to media" next to it copies the same addresses, one per line.

## Tweet menu

The "…" menu of a tweet has more, after [Better TweetDeck](https://github.com/eramdam/BetterTweetDeck):

- **Redraft** on your own tweet deletes it and opens it in the tweet box as it was typed: the text with full links instead of t.co, its photos and videos attached again, the same quoted tweet, a reply to the same tweet. Correct it and send it again. Image descriptions aren't carried over, and a GIF comes back as a video.
- **Mute #hashtag** for each hashtag of the tweet and **Mute tweets from "Twitter for iPhone"** for the app it was sent from, next to "Mute @user". They go to TweetDeck's own Settings → Mute, where they can be removed.

Under other people's tweets there can be **Mute** and **Block** buttons, next to reply, retweet and like. Both ask before doing it. They're off by default; switch them on in [Settings](#settings).

## Columns

Settings → General → Columns has a fourth width after TweetDeck's narrow, medium and wide: **Super wide**, 400px, with images and video sized for it.

After them, **Flex**: columns that share the window, each from 310 up to 480px, so three columns on a wide screen don't leave half of it empty; with more columns than fit, they keep 310px and the row scrolls as before. Media in flex columns are sized as in super wide ones. The other widths stay as wide as they say.

A column scrolled to the top doesn't move down with new tweets while the pointer is over it, so the tweet you're reading stays where it is. TweetDeck's "N New Tweets" over the column counts the ones that came; it, or a scroll to the top, brings them in, and with the pointer still over the column it holds still again.

A thread, where the author replies to themselves, looks the way TweetDeck showed it before X stopped marking such tweets: no "Replying to @author" over its tweets, and "Show this thread" under them. Tweets of a thread right next to each other in a column are joined by a line between the avatars and read from the first one down, the way they were written, in the place the newest of them has in the column; switched off, they stay newest on top like the rest of the column.

The tab title shows what's unread: "(3) TweetDeck" for three unread direct messages, "(*) TweetDeck" when a column has new tweets.

## Loading and empty columns

While a column loads, it shows grey shapes of tweets instead of TweetDeck's "Loading…". When X doesn't answer, TweetDeck used to leave "Loading…" for good; now the column says so, with a button to try again. An empty column says "Nothing here yet" in your language, with a button to refresh it, or, for a search, to open its options.

## Appearance

Settings → TweeXDeck → Appearance has, in one place:

- **Theme**: light, dark, or as the system, which follows the system's light or dark mode as it changes. "System" is in Settings → General → Theme too.
- **Lights out**: the dark theme in x.com's black instead of TweetDeck's dark blue, for OLED screens.
- **Column width**, flex included (see [Columns](#columns)).
- **Density**: TweetDeck's compact one, or comfortable, with more room around a tweet and its text from 15px, for reading a few columns rather than many.
- **Font** (see [Font](#font)).
- **New icons**: TweetDeck's icon font replaced by sharp SVG icons in x.com's style, from [Lucide](https://lucide.dev). A liked heart stays red and filled, a retweet green; the icons Lucide has no match for (the bird, switches, badges) keep the font.

TweetDeck's look is also brought up to today's accessibility standards (WCAG 2.2 AA) where it fell short, with the "Better readability" switch:

- The light theme's grey text, icons and links are darker: handles and times at 6.1:1 instead of 2.9:1, links at 5.1:1 instead of 2.8:1, the icons under a tweet at 6.1:1 instead of 2.0:1. The dark theme already passed and keeps its colors.
- The buttons under a tweet take a 32px circle around their 18px icons, tinted on hover as on x.com, so they're easier to hit.
- Keyboard focus shows as a blue ring (TweetDeck took it off everywhere); a click doesn't draw it.
- Tweet text has more room between lines (1.4), @handles are 13px instead of 12, counts don't jump as they change, and there are 6px between a tweet's text and its buttons instead of 3.
- A quoted tweet's text is in the tweet's own color, as on x.com: TweetDeck's grey was 3.6:1 in the dark theme.
- A notification's "Name retweeted" or "Name liked" stays on one line, with a 20px avatar and a long name cut short, instead of the action wrapping under the name.

With "reduce motion" on in the system, TweetDeck's animations stop, whatever the switch.

## Command palette

Ctrl+K (⌘K on a Mac), or TweetDeck's own ";", opens one field for everything: type a few letters of what you need and press Enter. It has TweetDeck's own commands (go to a column, with its number key; remove a column; create a list; change the column width or font size) and TweeXDeck's: write a tweet, add a column, search, open the settings or the TweeXDeck tab, switch the theme, Lights out, column width, density, font, icons and readability, copy the diagnostics, reload. TweetDeck had this palette all along, but only for X's own staff.

## Font

Settings → TweeXDeck → Appearance → Font sets all of TweetDeck's text (tweets, columns, menus, buttons and fields) in one of four free fonts for Latin and Cyrillic: [Golos Text](https://github.com/googlefonts/golos-text), [Onest](https://github.com/simpals/onest), [Inter](https://github.com/rsms/inter) or [Manrope](https://github.com/sharanda/manrope). By default TweetDeck keeps its own system fonts. The fonts come with the extension and load from its files, nothing is downloaded. Icons keep their own font, or SVG with "New icons"; other scripts (Greek, Japanese, Chinese) and emoji come from the system fonts as before.

## Instant replies

A reply you send shows up in the open conversation right away, instead of after the next refresh or reopening the tweet.

## When TweetDeck doesn't load

If TweetDeck hasn't started 20 seconds after the page opened, the page reloads itself once, as reloading by hand usually helps. When x.com's service worker answers TweetDeck's page from its cache, or x.com's page policy blocked the extension's scripts anyway, the worker is removed and the page reloads at once, past the browser's cache and the service worker (as Ctrl+Shift+R). In Firefox x.com's policy can stay on the page after that reload although the extension took it off, when the tab had plain x.com or its service worker's answer a moment before; then the page reloads once more. x.com registers its worker again when you open x.com; if TweetDeck gets stuck this way often, switch on "Keep x.com's service worker off" in Settings → TweeXDeck → Other: the worker is removed whenever TweetDeck opens and x.com can't install it again, but X's notifications in the browser stop coming. When that wouldn't help (the extension's scripts were blocked or didn't load, or you aren't logged in), or TweetDeck is stuck again after it, a panel over the spinner says what most likely went wrong: x.com's page policy blocking the extension's scripts, extension files that didn't load, the `x-client-transaction-id` solver failing, X answering 401/403 (not logged in), 429 (rate limit) or other errors, requests X doesn't answer, script errors. Blocked scripts show it after 5 seconds.  
"Copy diagnostics" copies a report for an [issue](https://github.com/Dezeter/TweeXDeck/issues): the extension version, browser, what loaded and when, TweetDeck's own steps as it started, the requests X hasn't answered yet, and X's answers without their parameters; where the page came from (the network, the cache or a service worker), what the extension took off it, and the page policy that blocked anything. After an automatic reload it also has the reports of the pages that got stuck. It has no cookies or tokens. The same report is under Settings → TweeXDeck → "Copy diagnostics", for problems after TweetDeck has started, such as replies or a column not loading.

## When X retires an address

X is retiring the old API addresses TweetDeck asks at `api.x.com`. In October 2026 `help/configuration` started answering "410 Gone", and replies stopped answering at all; x.com's own `x.com/i/api` still answers most of the same requests.

- `help/configuration`, which only holds the values compose counts characters with, is answered by the extension with TweetDeck's own defaults.
- Replies are asked with `TweetDetail`, x.com's own query for a tweet with its replies, and handed to TweetDeck in the old shape: since late October 2026 X answers 404 to `2/timeline/conversation` at `x.com/i/api` too.
- Any other address X stops answering at `api.x.com` (410, a 404 without X's error message, or no answer twice in a row) is asked at `x.com/i/api` from then on. One request fails, the next ones work. If it isn't there either, it goes back. The moved addresses are kept in `localStorage.OTDmovedApi`; removing the key starts over.

["Copy diagnostics"](#when-tweetdeck-doesnt-load) lists the addresses still asked at `api.x.com` and the moved ones.

## Development

`npm install`, then:

- `npm test` runs the tests: TweetDeck's own code with these scripts on stubbed pages, in Chromium and Firefox, and the unpacked extension in Chromium. They need Playwright's browsers once: `npx playwright install chromium firefox`.
- `npm run build` packs `build/TweeXDeckChrome.zip` and `build/TweeXDeckFirefox.zip`. Publishing a release attaches them to it.
- `test/specimens.spec.js` draws every kind of tweet (photos, video, GIF, quotes, link cards, a poll, notifications, an opened tweet) in both themes and several widths, and checks their layout; `SPECIMENS_OUT=specimens npx playwright test test/specimens.spec.js --project=chromium` also saves a picture of each.

## FAQ

#### Extension stopped working.

Before opening an issue, try to reinstall extension. If it still doesn't work, attach the report from ["Copy diagnostics"](#when-tweetdeck-doesnt-load) to the issue.

#### Some column isn't loading for me.

You're getting rate limited. They'll comeback after some time.

#### Likes tab aren't loading for me.

This can not be fixed. Since Twitter made likes private, the API to retrieve likes is gone.

## License

MIT, see [LICENSE](LICENSE). Copyright dimden (the original OldTweetDeck) and Dezeter (this fork).  
The `x-client-transaction-id` algorithm in `src/challenge.js` is ported from [x-client-transaction-id](https://github.com/Lqm1/x-client-transaction-id) by Lami (MIT).  
TweetDeck's own code in `files/` (`bundle.js`, `vendor.js`, `bundle.css`) belongs to X Corp., as in the original project.  
The fonts in `files/fonts/` (Golos Text, Onest, Inter, Manrope, from [Fontsource](https://fontsource.org)'s variable packages, Latin and Cyrillic) are by their authors under the SIL Open Font License 1.1, see `files/fonts/<font>/OFL.txt`.  
The icon shapes in `src/icons.js` are [Lucide](https://lucide.dev)'s (ISC, some from Feather under MIT), see `files/icons/LICENSE`.
