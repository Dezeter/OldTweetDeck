// Links in tweets lead to the site itself instead of through t.co, and so does the website in a profile.
// Loaded by injection.js after otd-common.js. Switch "cleanLinks".
(() => {
    if(!OTD.isOn("cleanLinks")) return;
    const util = window.TD?.util;
    if(!util?.createUrlAnchor) return;

    const isWebUrl = url => /^https?:\/\//i.test(url || "");
    // parses TweetDeck's markup without running or loading anything
    const holder = document.createElement("template");

    // TweetDeck renders every link in a tweet through this, with the t.co link in href and the address in data-full-url
    const createUrlAnchor = util.createUrlAnchor;
    util.createUrlAnchor = function(entity) {
        const html = createUrlAnchor.apply(this, arguments);
        if(!isWebUrl(entity?.expanded_url)) return html;
        holder.innerHTML = html;
        const anchor = holder.content.querySelector("a[data-full-url]");
        if(!anchor) return html;
        anchor.href = anchor.dataset.fullUrl;
        return holder.innerHTML;
    };

    // a profile's website is rendered from user.url, the t.co link
    const TwitterUser = window.TD?.services?.TwitterUser;
    if(TwitterUser) {
        TwitterUser.prototype.getExpandedURL = function() {
            const url = this.entities?.url?.urls?.[0]?.expanded_url;
            return isWebUrl(url) ? url : this.url;
        };
        const from = 'href="{{url}}" class="prf-siteurl';
        for(const [name, template] of Object.entries(TD.mustaches || {})) {
            if(typeof template === "string" && template.includes(from)) TD.mustaches[name] = template.split(from).join('href="{{getExpandedURL}}" class="prf-siteurl');
        }
    }
})();
