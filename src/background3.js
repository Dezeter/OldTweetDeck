importScripts("google-translate.js");

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if(request.action === 'setcookie') {
        chrome.cookies.getAll({url: "https://x.com"}, async cookies => {
            console.log('setcookie', cookies);
            chrome.tabs.query({ active: true, lastFocusedWindow: true }, tab => {
                tab = tab[0];
                chrome.cookies.getAllCookieStores(async cookieStores => {
                    console.log('cookieStores', cookieStores, tab);
                    const storeId = cookieStores?.find( cookieStore => cookieStore?.tabIds?.indexOf(tab?.id) !== -1)?.id;

                    for(let cookie of cookies) {
                        chrome.cookies.set({
                            url: "https://twitter.com",
                            name: cookie.name,
                            value: cookie.value,
                            expirationDate: cookie.expirationDate,
                            domain: ".twitter.com",
                            sameSite: cookie.sameSite,
                            secure: cookie.secure,
                            httpOnly: cookie.httpOnly,
                            storeId
                        }, () => {
                            console.log('set cookie', cookie, storeId);
                        });
                    }
                });
            });
        });
    } else if(request.action === 'getcookie') {
        chrome.cookies.get({ name: "auth_token", url: "https://x.com" }).then(cookie => {
            sendResponse(cookie);
        });
        return true;
    } else if(request.action === 'download') {
        // from download-media.js through content.js
        if(/^https:\/\/(pbs|video)\.twimg\.com\//.test(request.url)) chrome.downloads.download({ url: request.url, filename: request.filename, conflictAction: 'uniquify' });
    } else if(request.action === 'googleTranslate') {
        googleTranslate(request.text, request.to).then(sendResponse);
        return true;
    } else if(request.action === 'otdPage') {
        // from the load watchdog through content.js; the rules in ruleset.json don't tell what they did
        sendResponse({ rules: true });
    } else if(request.action === 'otdServiceWorker') {
        // Settings "blockServiceWorker": x.com's service worker script isn't loaded, so x.com can't register it again;
        // dynamic rules stay until changed
        chrome.declarativeNetRequest.updateDynamicRules({
            removeRuleIds: SERVICE_WORKER_RULES,
            addRules: request.block === true ? ["x.com", "twitter.com"].map((host, i) => ({
                id: SERVICE_WORKER_RULES[i],
                priority: 1,
                action: { type: "block" },
                condition: { urlFilter: `|https://${host}/sw.js` },
            })) : [],
        });
    }
});

const SERVICE_WORKER_RULES = [100, 101];