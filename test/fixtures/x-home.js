// x.com's homepage and ondemand.s, shaped like X's: the site verification key, four loading-x-anim SVGs whose
// second path holds 16 rows of 11 numbers after "M 10,30 C", and the chunk maps that name ondemand.s.
const crypto = require("crypto");

const ONDEMAND_PATH = "/responsive-web/client-web/ondemand.s.c0ffee-1xa.js";

function animations(seed) {
    const bytes = crypto.createHash("sha256").update(`svg${seed}`).digest();
    let k = 0;
    const next = () => bytes[(k++) % bytes.length] ^ (k * 37 & 255);
    return [0, 1, 2, 3].map(i => {
        const rows = Array.from({ length: 16 }, () => Array.from({ length: 11 }, next));
        const d = "M 10,30 C" + rows.map(r => ` ${r[0]},${r[1]} ${r[2]},${r[3]} ${r[4]},${r[5]} h ${r[6]} s ${r[7]},${r[8]} ${r[9]},${r[10]}`).join(" C");
        return `<svg id="loading-x-anim-${i}" width="40" height="40" viewBox="0 0 40 40"><g><path d="M0 0" fill="none"></path><path d="${d}"></path></g></svg>`;
    });
}

// layout "runtime": webpack's chunk url function, as in x.com's runtime; "plain": just the two maps.
// Both have a decoy chunk 183914 whose id ends like ondemand.s's 83914.
function homepage(key, svgs, { layout = "runtime" } = {}) {
    const maps = layout === "runtime"
        ? 'n.u=e=>(({183914:"wrong",83914:"ondemand.s",12:"other"})[e]||e)+"."+({183914:"decoy",12:"aaa",83914:"c0ffee-1x"})[e]+"a.js"'
        : 'var names={183914:"wrong",83914:"ondemand.s"};var hashes={183914:"decoy",83914:"c0ffee-1x"};';
    return `<!doctype html><html><head><meta name="twitter-site-verification" content="${key}"></head><body>${svgs.join("")}<script>${maps}</script></body></html>`;
}

// the key byte indices appear in ondemand.s as (o[N], 16)
function ondemand(indices) {
    return '"use strict";(self.webpackChunk_twitter_responsive_web=self.webpackChunk_twitter_responsive_web||[]).push([["ondemand.s"],{83914:(e,t,n)=>{'
        + indices.map((index, i) => `var v${i}=parseInt(o[${index}], 16);`).join("") + "}}]);";
}

const key = seed => crypto.createHash("sha384").update(`key${seed}`).digest("base64");

module.exports = { ONDEMAND_PATH, animations, homepage, ondemand, key };
