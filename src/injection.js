let extId;
let isFirefox = navigator.userAgent.indexOf('Firefox') > -1;
let cookie = null;

if(!window.chrome) window.chrome = {};
if(!window.chrome.runtime) window.chrome.runtime = {};
window.chrome.runtime.getURL = url => {
    if(!url.startsWith('/')) url = `/${url}`;
    return `${isFirefox ? 'moz-extension://' : 'chrome-extension://'}${extId}${url}`;   
}
window.addEventListener('message', e => {
    if(e.data.extensionId) {
        console.log("got extensionId", e.data.extensionId);
        extId = e.data.extensionId;
        main();
    } else if(e.data.cookie) {
        cookie = e.data.cookie;
    }
});
window.postMessage('extensionId', '*');
window.postMessage('cookie', '*');

async function main() {
    let html = await fetch(chrome.runtime.getURL('/files/index.html')).then(r => r.text());
    document.documentElement.innerHTML = html;
    // for the settings tab, which runs in the page and can't read the manifest itself in Firefox
    let manifest = await fetch(chrome.runtime.getURL('/manifest.json')).then(r => r.json()).catch(() => null);
    if(manifest) document.documentElement.dataset.otdVersion = manifest.version;

    let [challenge_js, interception_js, vendor_js, bundle_js, bundle_css, twitter_text, ...local_js] =
        await Promise.allSettled([
            fetch(chrome.runtime.getURL("/src/challenge.js")).then(r => r.text()),
            fetch(chrome.runtime.getURL("/src/interception.js")).then(r => r.text()),
            fetch(chrome.runtime.getURL("/files/vendor.js")).then(r => r.text()),
            fetch(chrome.runtime.getURL("/files/bundle.js")).then(r => r.text()),
            fetch(chrome.runtime.getURL("/files/bundle.css")).then(r => r.text()),
            fetch(chrome.runtime.getURL("/files/twitter-text.js")).then(r => r.text()),
            // otd-common.js first: the others use window.OTD
            fetch(chrome.runtime.getURL("/src/otd-common.js")).then(r => r.text()),
            fetch(chrome.runtime.getURL("/src/grok-translate.js")).then(r => r.text()),
            fetch(chrome.runtime.getURL("/src/hide-home-replies.js")).then(r => r.text()),
            fetch(chrome.runtime.getURL("/src/conversation-replies.js")).then(r => r.text()),
            fetch(chrome.runtime.getURL("/src/paste-images.js")).then(r => r.text()),
            fetch(chrome.runtime.getURL("/src/x-articles.js")).then(r => r.text()),
            fetch(chrome.runtime.getURL("/src/instant-replies.js")).then(r => r.text()),
            fetch(chrome.runtime.getURL("/src/settings.js")).then(r => r.text()),
            fetch(chrome.runtime.getURL("/src/group-notifications.js")).then(r => r.text()),
            fetch(chrome.runtime.getURL("/src/clean-links.js")).then(r => r.text()),
            fetch(chrome.runtime.getURL("/src/absolute-time.js")).then(r => r.text()),
            fetch(chrome.runtime.getURL("/src/media-aspect.js")).then(r => r.text()),
            fetch(chrome.runtime.getURL("/src/download-media.js")).then(r => r.text()),
            fetch(chrome.runtime.getURL("/src/pause-on-hover.js")).then(r => r.text()),
            fetch(chrome.runtime.getURL("/src/tab-title.js")).then(r => r.text()),
        ]);

    let challenge_js_script = document.createElement("script");
    challenge_js_script.innerHTML = challenge_js.value;
    document.head.appendChild(challenge_js_script);

    let interception_js_script = document.createElement("script");
    interception_js_script.innerHTML = interception_js.value;
    document.head.appendChild(interception_js_script);

    let bundle_css_style = document.createElement("style");
    bundle_css_style.innerHTML = bundle_css.value;
    document.head.appendChild(bundle_css_style);

    let vendor_js_script = document.createElement("script");
    vendor_js_script.innerHTML = vendor_js.value;
    document.head.appendChild(vendor_js_script);

    let bundle_js_script = document.createElement("script");
    bundle_js_script.innerHTML = bundle_js.value;
    document.head.appendChild(bundle_js_script);

    let twitter_text_script = document.createElement("script");
    twitter_text_script.innerHTML = twitter_text.value;
    document.head.appendChild(twitter_text_script);

    for(let local_script_js of local_js) {
        if(local_script_js.status !== "fulfilled") continue;
        let local_script = document.createElement("script");
        local_script.innerHTML = local_script_js.value;
        document.head.appendChild(local_script);
    }

    let int = setTimeout(function() {
        let badBody = document.querySelector('body:not(#injected-body)');
        if (badBody) {
            let badHead = document.querySelector('head:not(#injected-head)');
            clearInterval(int);
            if(badHead) badHead.remove();
            badBody.remove(); 
        }
    }, 200);
    setTimeout(() => clearInterval(int), 10000);

    let injInt;
    function injectAccount() {
        if(!document.querySelector('a[data-title="Accounts"]')) return;
        clearInterval(injInt);

        let accountsBtn = document.querySelector('a[data-title="Accounts"]');
        accountsBtn.addEventListener("click", function() {
            console.log("setting account cookie");
            chrome.runtime.sendMessage({ action: "setcookie" }); 
        });
    }
    setInterval(injectAccount, 1000);
};