window.addEventListener('message', async e => {
    if(e.data === 'extensionId') {
        let extId = chrome.runtime.getURL('/injection.js').split("/")[2];
        window.postMessage({ extensionId: extId }, '*');
    } else if(e.data === 'cookie') {
        chrome.runtime.sendMessage({ action: "getcookie" }, cookie => {
            window.postMessage({ cookie }, '*');
        });
    } else if(e.data?.action === 'otdDownload' && e.source === window) {
        // download-media.js -> background script, which saves the file; only X's media hosts
        const { url, filename } = e.data;
        if(/^https:\/\/(pbs|video)\.twimg\.com\//.test(url)) chrome.runtime.sendMessage({ action: 'download', url, filename });
    } else if(e.data?.action === 'otdPage' && e.source === window) {
        // the load watchdog (watchdog.js) -> background script: what it saw of this page
        chrome.runtime.sendMessage({ action: 'otdPage' }, response => {
            window.postMessage({ otdPage: response ?? null }, '*');
        });
    } else if(e.data?.action === 'otdServiceWorker' && e.source === window) {
        // the load watchdog -> background script: keep x.com's service worker off, or let it be
        chrome.runtime.sendMessage({ action: 'otdServiceWorker', block: e.data.block === true });
    } else if(e.data?.action === 'otdGoogleTranslate') {
        // x-articles.js -> background script, which may call Google
        const { id, text, to } = e.data;
        chrome.runtime.sendMessage({ action: 'googleTranslate', text, to }, response => {
            window.postMessage({ otdGoogleTranslateResult: { id, response } }, '*');
        });
    }
});