// Fixes in TweetDeck's own code (files/bundle.js)
const { test, expect } = require("@playwright/test");
const { openPage, addTweetDeck } = require("./helpers");

test("the removed \"new TweetDeck\" button draws nothing instead of an error when TweetDeck starts", async ({ page }) => {
    await openPage(page);
    await addTweetDeck(page);
    const errors = [];
    page.on("console", message => message.type() === "error" && errors.push(message.text()));
    const html = await page.evaluate(() => {
        const button = Object.values(window.__require.c).map(m => m.exports).find(e => e?.GryphonBetaBtnReact);
        const node = document.createElement("div");
        document.body.append(node);
        // what TweetDeck's attachLoggedInComponents does with it
        button.default.attachTo(node);
        return node.innerHTML;
    });
    expect(html).toBe("");
    // React reports a failed render on the console
    await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 100)));
    expect(errors.filter(e => /class as a function/.test(e))).toEqual([]);
});
