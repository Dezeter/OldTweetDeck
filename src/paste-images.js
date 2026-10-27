// Ctrl+V of an image in a compose box attaches it, as if it was picked with "Add image".
// Loaded by injection.js after otd-common.js. Switch "pasteImages".
(() => {
    if(!OTD.isOn("pasteImages")) return;

    document.addEventListener("paste", e => {
        const box = e.target.closest?.("textarea.js-compose-text");
        if(!box || !e.clipboardData) return;

        const files = [...e.clipboardData.items]
            .filter(item => item.kind === "file" && item.type.startsWith("image/"))
            .map(item => item.getAsFile())
            .filter(Boolean);
        if(!files.length) return;

        if(!OTD.attachFiles(box, files)) return;
        // copied from an office app the clipboard has the text too, let that through
        if(!e.clipboardData.types.includes("text/plain")) e.preventDefault();
    });
})();
