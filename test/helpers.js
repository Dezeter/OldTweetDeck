// Shared setup: TweetDeck's own page and code on a stubbed origin, plus this extension's scripts on top,
// injected the way src/injection.js does it (inline scripts, one after another).
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const cache = {};
const read = file => cache[file] ??= fs.readFileSync(path.join(ROOT, file), "utf8");

// Serves files/index.html (or `html`) at http://otd.test/i/tweetdeck and bundle.css next to it. Other requests
// go to the first `routes` prefix that matches, data: and blob: URLs load, everything else is aborted.
async function openPage(page, { html, storage, routes = {} } = {}) {
    await page.route("**/*", route => {
        const url = route.request().url();
        if(url.startsWith("data:") || url.startsWith("blob:")) return route.continue();
        for(const [prefix, handler] of Object.entries(routes)) {
            if(url.startsWith(prefix)) return handler(route);
        }
        if(url.startsWith("http://otd.test/") && url.endsWith("/bundle.css")) return route.fulfill({ contentType: "text/css", body: read("files/bundle.css") });
        if(url.startsWith("http://otd.test/")) return route.fulfill({ contentType: "text/html", body: html ? read(html) : read("files/index.html") });
        return route.abort();
    });
    await page.goto("http://otd.test/i/tweetdeck");
    if(storage) await page.evaluate(storage => Object.assign(localStorage, storage), storage);
}

async function addScripts(page, ...files) {
    await page.evaluate(sources => {
        for(const source of sources) {
            const script = document.createElement("script");
            script.textContent = source;
            document.head.appendChild(script);
        }
    }, files.map(read));
}

// TweetDeck's CSS and code. TD.settings getters throw until TweetDeck has loaded its storage, which never happens
// here, so they return undefined instead.
async function addTweetDeck(page, { css = false } = {}) {
    if(css) {
        await page.evaluate(css => {
            const style = document.createElement("style");
            style.textContent = css;
            document.head.appendChild(style);
        }, read("files/bundle.css"));
    }
    await addScripts(page, "files/vendor.js", "files/bundle.js");
    await page.evaluate(() => {
        for(const key of Object.keys(TD.settings)) {
            const getter = TD.settings[key];
            if(typeof getter !== "function") continue;
            TD.settings[key] = function(...args) {
                try {
                    return getter.apply(this, args);
                } catch(e) {
                    return undefined;
                }
            };
        }
        document.querySelectorAll(".js-app-loading, .login-container").forEach(node => node.remove());
        // webpack's require, for TweetDeck modules that aren't on TD (jQuery with $.publish, components)
        window.webpackJsonp.push([["otdtest"], { otdtest: (module, exports, require) => { window.__require = require; } }, [["otdtest"]]]);
    });
}

// An account and a TwitterClient enough for TweetDeck to render tweets and conversations
async function addAccount(page) {
    await page.evaluate(() => {
        const account = { getUserID: () => "1", getKey: () => "twitter:1", getUsername: () => "me", getUserName: () => "me", getName: () => "me", getProfileImageURL: () => "", isPrivate: () => false };
        const client = Object.create(TD.services.TwitterClient.prototype);
        client.account = account;
        client.oauth = { account };
        TD.controller.clients = TD.controller.clients || {};
        TD.controller.clients.getClient = () => client;
        TD.controller.clients.getPreferredClient = () => client;
        TD.controller.scheduler = TD.controller.scheduler || {};
        TD.controller.scheduler.schedulePeriodicTask = () => 1;
        TD.controller.scheduler.removePeriodicTask = () => {};
        window.__account = account;
        window.__client = client;
    });
}

module.exports = { ROOT, read, openPage, addScripts, addTweetDeck, addAccount };
