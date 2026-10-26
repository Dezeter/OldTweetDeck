window.addEventListener('message', async e => {
    if(e.data === 'extensionId') {
        let extId = chrome.runtime.getURL('/injection.js').split("/")[2];
        window.postMessage({ extensionId: extId }, '*');
    } else if(e.data === 'cookie') {
        chrome.runtime.sendMessage({ action: "getcookie" }, cookie => {
            window.postMessage({ cookie }, '*');
        });
    } else if(e.data?.action === 'otdGoogleTranslate') {
        // x-articles.js -> background script, which may call Google
        const { id, text, to } = e.data;
        chrome.runtime.sendMessage({ action: 'googleTranslate', text, to }, response => {
            window.postMessage({ otdGoogleTranslateResult: { id, response } }, '*');
        });
    }
});