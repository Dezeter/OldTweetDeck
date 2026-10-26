const { test, expect } = require("@playwright/test");
const { openPage, addTweetDeck, addScripts } = require("./helpers");

// TweetDeck's compose upload component attached to a docked composer, plus an inline reply and unrelated inputs
async function openComposer(page, storage) {
    await openPage(page, { storage });
    await addTweetDeck(page);
    await addScripts(page, "src/otd-common.js", "src/paste-images.js");
    await page.evaluate(() => {
        const require = window.__require;
        const $ = require(0);
        const uploadId = Object.keys(require.m).find(id => require.m[id].toString().includes('uploadInputSelector: ".js-media-upload"'));
        document.body.insertAdjacentHTML("beforeend", `
            <div class="js-docked-compose"><textarea class="js-compose-text compose-text"></textarea><div id="upload"></div></div>
            <section class="js-column"><div class="js-inline-reply"><textarea id="inline" class="js-compose-text compose-text"></textarea></div></section>
            <input id="search" class="js-app-search-input"><textarea id="other" class="js-list-description"></textarea>`);
        require(uploadId).attachTo("#upload");
        $(document).on("uiFilesAdded", (e, data) => window.__added.push([...data.files].map(f => `${f.name}|${f.type}`)));
    });
}

// a paste event with `images` 1x1 PNGs and optional text in its clipboard data. Firefox drops files given to
// the ClipboardEvent constructor, so clipboardData is set on the event the way a real paste has it.
const paste = (page, selector, { images = 0, text } = {}) => page.evaluate(async ({ selector, images, text }) => {
    window.__added = [];
    const data = new DataTransfer();
    const png = await (await fetch("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==")).blob();
    for(let i = 0; i < images; i++) data.items.add(new File([png], "image.png", { type: "image/png" }));
    if(text) data.setData("text/plain", text);
    const event = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "clipboardData", { value: data });
    const target = document.querySelector(selector);
    target.focus();
    target.dispatchEvent(event);
    await new Promise(resolve => setTimeout(resolve, 50));
    return { added: window.__added, prevented: event.defaultPrevented, inputCleared: document.querySelector("#upload input.js-media-upload").value === "" };
}, { selector, images, text });

test("Ctrl+V of images attaches them in the composer and inline replies", async ({ page }) => {
    await openComposer(page);

    let result = await paste(page, ".js-docked-compose textarea", { images: 1 });
    expect(result.added).toEqual([["image.png|image/png"]]);
    expect(result.prevented && result.inputCleared).toBe(true);

    result = await paste(page, "#inline", { images: 2 });
    expect(result.added).toHaveLength(1);
    expect(result.added[0]).toHaveLength(2);

    // image and text together: the image is attached, the text paste goes through
    result = await paste(page, "#inline", { images: 1, text: "caption from Word" });
    expect(result.added).toHaveLength(1);
    expect(result.prevented).toBe(false);

    result = await paste(page, "#inline", { text: "just text" });
    expect(result).toMatchObject({ added: [], prevented: false });

    for(const selector of ["#search", "#other"]) {
        expect(await paste(page, selector, { images: 1 })).toMatchObject({ added: [], prevented: false });
    }

    // TweetDeck's own validation still applies: 5 images is over the limit
    expect((await paste(page, ".js-docked-compose textarea", { images: 5 })).added).toEqual([]);
});

test("OTDpasteImages=0 turns it off", async ({ page }) => {
    await openComposer(page, { OTDpasteImages: "0" });
    expect(await paste(page, ".js-docked-compose textarea", { images: 1 })).toMatchObject({ added: [], prevented: false });
});
