// A click on a video in a tweet plays it right there, in its own proportions and no taller than half the
// screen, instead of TweetDeck's media window: the mp4 TweetDeck would play itself, with the browser's controls
// and full screen. One video plays at a time, it pauses when scrolled away, and the volume is remembered.
// Ctrl/Cmd/Shift or a middle click open TweetDeck's window as before. GIFs TweetDeck already plays in place.
// Loaded by injection.js after otd-common.js. Switch "inlineVideo".
(() => {
    if(!OTD.isOn("inlineVideo")) return;

    const VOLUME = "OTDvideoVolume";
    const videos = new Set();

    // the media entity the preview stands for: of the tweet, the retweeted one, or the quoted one
    function mediaOf(link) {
        const chirp = OTD.chirpFor(link);
        const id = link.getAttribute("data-media-entity-id");
        if(!chirp || !id) return null;
        for(const tweet of [chirp, chirp.retweetedStatus, chirp.quotedTweet, chirp.retweetedStatus?.quotedTweet]) {
            const media = tweet?.getMedia?.().find(m => m.entity?.id_str === id || String(m.entity?.id) === id);
            if(media) return media;
        }
        return null;
    }

    function rememberVolume(video) {
        try {
            const saved = JSON.parse(localStorage[VOLUME] || "null");
            if(saved) {
                video.volume = Math.min(1, Math.max(0, Number(saved.volume) || 0));
                video.muted = !!saved.muted;
            }
        } catch(e) {}
        video.addEventListener("volumechange", () => {
            localStorage[VOLUME] = JSON.stringify({ volume: video.volume, muted: video.muted });
        });
    }

    // pauses a video that has mostly left the screen
    const visibility = new IntersectionObserver(entries => {
        for(const entry of entries) if(entry.intersectionRatio < 0.3 && !entry.target.paused) entry.target.pause();
    }, { threshold: [0, 0.3] });

    function play(link, media) {
        const entity = media.entity;
        const [w, h] = entity.video_info?.aspect_ratio || [entity.original_info?.width, entity.original_info?.height];
        const video = document.createElement("video");
        video.className = "otd-inline-video";
        video.src = media.chooseVideoVariant().url;
        if(entity.media_url_https) video.poster = entity.media_url_https;
        video.controls = true;
        video.autoplay = true;
        video.playsInline = true;
        video.preload = "auto";
        if(w && h) video.style.setProperty("--otd-video-aspect", `${w} / ${h}`);
        rememberVolume(video);
        video.addEventListener("play", () => {
            for(const other of videos) if(other !== video && other.isConnected && !other.paused) other.pause();
        });
        // a click on the controls stays with the video, not the tweet under it
        video.addEventListener("click", e => e.stopPropagation());
        link.classList.add("otd-inline-video-link");
        link.after(video);
        // the ones TweetDeck has rendered away are let go
        for(const old of videos) if(!old.isConnected) videos.delete(old);
        videos.add(video);
        visibility.observe(video);
        video.play?.()?.catch(() => {});
        return video;
    }

    document.addEventListener("click", e => {
        if(e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
        const link = e.target.closest?.('.js-media-preview-container.is-video a[rel="mediaPreview"]');
        if(!link || link.classList.contains("otd-inline-video-link")) return;
        const media = mediaOf(link);
        if(media?.entity?.type !== "video" || !media.chooseVideoVariant?.()?.url) return;
        e.preventDefault();
        e.stopPropagation();
        play(link, media);
    }, true);

    OTD.addStyle(`
        .otd-inline-video-link { display: none !important; }
        .otd-inline-video { display: block; width: 100%; max-height: 50vh; aspect-ratio: var(--otd-video-aspect, 16 / 9); border-radius: 8px; background: #000; object-fit: contain; }
    `);
})();
