// Ctrl+V of an image in a compose box attaches it, as if it was picked with "Add image".
// Loaded by injection.js after bundle.js.
//   localStorage.OTDpasteImages = "0"  turns it off
(() => {
    if(localStorage.OTDpasteImages === "0") return;

    // the nearest upload input, there is one in the docked composer
    function uploadInput(from) {
        for(let el = from; el; el = el.parentElement) {
            const input = el.querySelector("input.js-media-upload");
            if(input) return input;
        }
        return null;
    }

    document.addEventListener("paste", e => {
        const box = e.target.closest?.("textarea.js-compose-text");
        if(!box || !e.clipboardData) return;

        const files = [...e.clipboardData.items]
            .filter(item => item.kind === "file" && item.type.startsWith("image/"))
            .map(item => item.getAsFile())
            .filter(Boolean);
        if(!files.length) return;

        const input = uploadInput(box);
        if(!input) return;
        // copied from an office app the clipboard has the text too, let that through
        if(!e.clipboardData.types.includes("text/plain")) e.preventDefault();

        // Same path as a picked file: TweetDeck checks type, size and count, shows its own errors,
        // and moves an inline reply to the docked composer to show the attachment.
        const transfer = new DataTransfer();
        files.forEach(file => transfer.items.add(file));
        input.files = transfer.files;
        input.dispatchEvent(new Event("change", { bubbles: true }));
    });
})();
