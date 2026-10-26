// Google Translate for the page scripts (x-articles.js). Runs in the background script: the endpoint
// sends no CORS headers, and host_permissions let the extension call it anyway.
async function googleTranslate(text, to) {
    if(typeof text !== "string" || !text || encodeURIComponent(text).length > 8000 || !/^[a-z]{2,3}(-[A-Za-z]{2,4})?$/.test(to)) {
        return { error: "bad request" };
    }
    try {
        const res = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${to}&dt=t&q=${encodeURIComponent(text)}`);
        if(!res.ok) return { error: `HTTP ${res.status}` };
        const data = await res.json();
        // [[[translated, original, ...], ...], null, detected language, ...]
        return { text: (data[0] || []).map(sentence => sentence[0] || "").join(""), lang: data[2] };
    } catch(e) {
        return { error: String(e) };
    }
}
