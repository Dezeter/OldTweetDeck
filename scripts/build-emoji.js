// Builds files/emoji.json for the emoji picker (src/emoji-picker.js) from emojibase-data (MIT):
// npm run emoji. The file is committed, so the extension has no build step.
//
// {
//   groups: { en: [names by group id], ru: [...] },
//   emoji: [[emoji, group, English label, Russian label, English tags, Russian tags], ...] in Unicode order
// }
// Skin tone variants and components are left out, and so are emoji newer than Unicode Emoji 15.0, which
// many systems can't draw yet.
const fs = require("fs");
const path = require("path");

const MAX_VERSION = 15;
const en = require("emojibase-data/en/data.json");
const ru = require("emojibase-data/ru/data.json");
const ruByCode = new Map(ru.map(e => [e.hexcode, e]));
const groups = lang => require(`emojibase-data/${lang}/messages.json`).groups.sort((a, b) => a.order - b.order).map(g => g.message);

const emoji = en
    .filter(e => e.group !== undefined && e.group !== 2 && e.version <= MAX_VERSION)
    .sort((a, b) => a.order - b.order)
    .map(e => {
        const r = ruByCode.get(e.hexcode) || {};
        return [e.emoji, e.group, e.label, r.label || "", (e.tags || []).join(" "), (r.tags || []).join(" ")];
    });

const out = path.join(__dirname, "..", "files", "emoji.json");
fs.writeFileSync(out, JSON.stringify({ groups: { en: groups("en"), ru: groups("ru") }, emoji }));
console.log(`${emoji.length} emoji, ${Math.round(fs.statSync(out).size / 1024)} KB -> ${path.relative(process.cwd(), out)}`);
