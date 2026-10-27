// Load watchdog: when TweetDeck hasn't started 20 s after the page opened, it reloads the page once, when that
// may help, and then a panel says what went wrong instead of the endless spinner and copies a report for an
// issue. It hears what the page shows (scripts blocked by Content-Security-Policy, script errors) and what the
// other scripts tell it on "otd-diagnostic" events: the steps of injection.js and the extension files that
// didn't load, the transaction id solver, TweetDeck's own steps as it starts, the requests to X and X's answers.
// A content script that runs before injection.js, so it works when everything injection.js adds is blocked; in
// Firefox it's in the extension's own world and sees the page's through wrappedJSObject.
// The settings tab asks it for the report with an "otd-diagnostic-request" event.
// Switch "loadWatchdog" (the reload and the panel; the report is always there).
(() => {
    if(window.top !== window) return;

    const START = Date.now();
    const DEADLINE = 20000;
    // when the extension's scripts are blocked or missing, TweetDeck won't start, there's no need to wait long
    const DEADLINE_BROKEN = 5000;
    // one automatic reload, and not again for a while if TweetDeck is stuck after it too
    const RELOAD_AT = "OTDautoReloadAt";
    const RELOAD_REPORT = "OTDautoReloadReport";
    const RELOAD_AGAIN_AFTER = 120000;
    const ISSUES = "https://github.com/Dezeter/OldTweetDeck/issues";
    const RU = (navigator.language || "en").toLowerCase().startsWith("ru");
    const T = RU ? {
        title: "TweetDeck не загрузился",
        noExtension: "Расширение не запустилось на странице: его скрипт не получил ответа. Перезагрузите страницу; если не поможет — перезапустите браузер или переустановите расширение.",
        files: list => `Не загрузились файлы расширения: ${list}. Переустановите расширение и не удаляйте его файлы после установки.`,
        csp: n => `x.com запретил скрипты расширения (Content-Security-Policy), заблокировано: ${n}. Расширение снимает этот запрет, значит x.com стал присылать его иначе или его вернуло другое расширение.`,
        solver: text => `Не вычисляется x-client-transaction-id, без него X отклоняет часть запросов: ${text}.`,
        auth: "X отвечает 401/403: похоже, вы не вошли в x.com в этом браузере или сессия истекла. Откройте x.com, войдите и перезагрузите эту страницу.",
        limit: "X отвечает 429: слишком много запросов. Подождите несколько минут.",
        responses: list => `X отвечает ошибками: ${list}.`,
        errors: (text, more) => `Ошибка в скриптах: ${text}${more ? ` (и ещё ${more})` : ""}.`,
        waiting: list => `X не отвечает на запросы TweetDeck: ${list}. Обычно помогает перезагрузка страницы.`,
        reloaded: "Страница уже перезагружалась сама, это не помогло.",
        nothing: "Явных ошибок не видно: возможно, X отвечает медленно. Подождите или перезагрузите страницу.",
        privacy: "В диагностике нет cookies и токенов, её можно приложить к issue.",
        copy: "Скопировать диагностику", copied: "Скопировано", reload: "Перезагрузить", report: "Сообщить о проблеме", close: "Скрыть",
        notSent: "не отправлен", noAnswer: "нет ответа", waitingFor: n => `ждём ${n} с`,
    } : {
        title: "TweetDeck hasn't loaded",
        noExtension: "The extension didn't start on the page: its script got no answer. Reload the page; if that doesn't help, restart the browser or reinstall the extension.",
        files: list => `The extension's files didn't load: ${list}. Reinstall the extension and keep its files after installing.`,
        csp: n => `x.com blocked the extension's scripts (Content-Security-Policy), ${n} blocked. The extension takes this policy off, so x.com sends it some other way now or another extension put it back.`,
        solver: text => `x-client-transaction-id can't be computed, and X refuses some requests without it: ${text}.`,
        auth: "X answers 401/403: you're probably not logged in to x.com in this browser or the session expired. Open x.com, log in and reload this page.",
        limit: "X answers 429: too many requests. Wait a few minutes.",
        responses: list => `X answers with errors: ${list}.`,
        errors: (text, more) => `A script error: ${text}${more ? ` (and ${more} more)` : ""}.`,
        waiting: list => `X doesn't answer TweetDeck's requests: ${list}. A reload usually helps.`,
        reloaded: "The page was reloaded automatically already, it didn't help.",
        nothing: "No errors in sight: X may be slow to answer. Wait or reload the page.",
        privacy: "The report has no cookies or tokens, it can go into an issue.",
        copy: "Copy diagnostics", copied: "Copied", reload: "Reload", report: "Report a problem", close: "Hide",
        notSent: "not sent", noAnswer: "no answer", waitingFor: n => `waiting ${n} s`,
    };

    const seconds = at => `${Math.round((at - START) / 1000)} s`;
    // addresses without queries; the extension's own files by their path
    function clean(url) {
        if(!url || !/^[a-z-]+:\/\//.test(url)) return url || "";
        try {
            const u = new URL(url);
            return /-extension:$/.test(u.protocol) ? u.pathname.slice(1) : `${u.host}${u.pathname}`;
        } catch(e) {
            return url.split("?")[0];
        }
    }
    // counts repeats of the same thing, remembers when it was first seen; at most 20 kinds
    function tally(map, key, value) {
        const known = map.get(key);
        if(known) known.count++;
        else if(map.size < 20) map.set(key, { ...value, count: 1, at: Date.now() });
    }

    const steps = {};
    const files = [];
    const csp = new Map();
    const errors = new Map();
    const failed = new Map();
    // the addresses still asked at api.x.com that answered, X retires them one by one
    const oldApi = new Map();
    const moves = [];
    // the requests sent to X with no answer yet, and TweetDeck's steps as it starts
    const pending = new Map();
    const startup = [];
    let answered = 0;
    let solver = null;
    let startedAt = 0;

    document.addEventListener("otd-diagnostic", e => {
        let entry;
        try {
            entry = JSON.parse(e.detail);
        } catch(err) {
            return;
        }
        if(entry.kind === "step") steps[entry.step] ??= Date.now();
        else if(entry.kind === "file") files.push(String(entry.path));
        else if(entry.kind === "moved") moves.push({ key: String(entry.key), moved: !!entry.moved, at: Date.now() });
        else if(entry.kind === "startup" && startup.length < 20) startup.push({ key: String(entry.key), at: Date.now() });
        else if(entry.kind === "request") pending.set(entry.id, { method: String(entry.method), url: clean(entry.url), at: Date.now() });
        else if(entry.kind === "solver") solver = { ok: !!entry.ok, text: String(entry.text || ""), at: Date.now() };
        else if(entry.kind === "response") {
            pending.delete(entry.id);
            const status = Number(entry.status);
            if(status >= 200 && status < 400) {
                answered++;
                const old = clean(entry.url).match(/^api\.(?:x|twitter)\.com(\/.*)/)?.[1];
                if(old) tally(oldApi, old.replace(/\d{5,}/g, "{id}"), {});
            }
            else tally(failed, `${entry.method} ${clean(entry.url)} ${status || entry.error || ""}`, { method: String(entry.method), url: clean(entry.url), status, error: entry.error ? String(entry.error) : "" });
        }
    });
    document.addEventListener("securitypolicyviolation", e => {
        if(e.disposition !== "enforce") return;
        const where = e.sourceFile ? ` ${clean(e.sourceFile)}${e.lineNumber ? `:${e.lineNumber}` : ""}` : "";
        tally(csp, `${e.effectiveDirective} ${e.blockedURI}${where}`, { directive: e.effectiveDirective, blocked: clean(e.blockedURI) || "inline", where });
    }, true);
    // errors of x.com's own page before injection.js replaced it don't matter
    window.addEventListener("error", e => {
        if(!steps.page || !e.message) return;
        const where = e.filename ? ` (${clean(e.filename)}:${e.lineno})` : "";
        tally(errors, `${e.message}${where}`, { text: `${e.message}${where}` });
    }, true);
    window.addEventListener("unhandledrejection", e => {
        if(!steps.page) return;
        let text;
        try {
            const reason = e.reason;
            text = reason?.message !== undefined ? `${reason.name || "Error"}: ${reason.message}` : String(reason);
            // where it was thrown: the first frame of the stack, "at f (url:1:2)" in Chrome, "f@url:1:2" in Firefox
            const frame = String(reason?.stack || "").split("\n").map(line => line.match(/(\S+):(\d+):\d+\)?$/)).find(Boolean);
            if(frame) text += ` (${clean(frame[1].replace(/^.*[(@]/, ""))}:${frame[2]})`;
        } catch(err) {
            text = "?";
        }
        tally(errors, text, { text });
    });

    // interception.js keeps what it moved
    const movedApi = () => {
        try {
            return JSON.parse(localStorage.OTDmovedApi || "[]").map(String);
        } catch(e) {
            return [];
        }
    };

    const pageWindow = () => window.wrappedJSObject || window;
    const has = name => {
        try {
            return !!pageWindow()[name];
        } catch(e) {
            return false;
        }
    };
    // TweetDeck shows its app when logged in, its login form otherwise
    const started = () => {
        if(!startedAt && document.querySelector("#injected-body .js-app:not(.is-hidden), #injected-body .js-login-form")) startedAt = Date.now();
        return !!startedAt;
    };
    const scriptsBlocked = () => [...csp.values()].filter(v => v.directive.startsWith("script-src")).reduce((n, v) => n + v.count, 0);

    // what probably went wrong, most likely first
    function findings() {
        const list = [];
        if(!steps.extension) list.push(T.noExtension);
        if(files.length) list.push(T.files(files.join(", ")));
        const blocked = scriptsBlocked();
        if(blocked) list.push(T.csp(blocked));
        if(solver && !solver.ok) list.push(T.solver(solver.text));
        const responses = [...failed.values()];
        if(responses.some(r => r.status === 401 || r.status === 403)) list.push(T.auth);
        if(responses.some(r => r.status === 429)) list.push(T.limit);
        const other = responses.filter(r => ![401, 403, 429].includes(r.status));
        if(other.length) list.push(T.responses(other.slice(0, 3).map(describe).join("; ")));
        const waiting = waitingFor(10000);
        if(waiting.length) list.push(T.waiting(waiting.slice(0, 3).map(r => `${r.method} ${r.url} (${T.waitingFor(r.seconds)})`).join("; ")));
        const errs = [...errors.values()];
        if(errs.length) list.push(T.errors(errs[0].text, errs.length - 1));
        if(!list.length) list.push(T.nothing);
        if(reloadedRecently()) list.push(T.reloaded);
        return list;
    }
    const describe = r => `${r.method} ${r.url} — ${r.status || (r.error ? `${T.notSent} (${r.error})` : T.noAnswer)}`;
    // requests X hasn't answered for at least `ms`, the longest waiting first
    const waitingFor = ms => [...pending.values()].filter(r => Date.now() - r.at >= ms).sort((a, b) => a.at - b.at)
        .map(r => ({ ...r, seconds: Math.round((Date.now() - r.at) / 1000) }));

    const session = (key, value) => {
        try {
            if(value === undefined) return sessionStorage[key];
            sessionStorage[key] = value;
        } catch(e) {}
    };
    const reloadedRecently = () => Date.now() - Number(session(RELOAD_AT) || 0) < RELOAD_AGAIN_AFTER;
    // a reload doesn't bring back blocked or missing scripts, nor log in
    const reloadMayHelp = () => !scriptsBlocked() && !files.length && ![...failed.values()].some(r => r.status === 401 || r.status === 403);

    function report() {
        let version = "";
        try {
            version = globalThis.browser?.runtime?.getManifest?.().version || globalThis.chrome?.runtime?.getManifest?.().version || "";
        } catch(e) {}
        version ||= document.documentElement.dataset.otdVersion || "?";
        const now = Date.now();
        const lines = [
            "OldTweetDeck diagnostics",
            `Version: ${version}`,
            `Browser: ${navigator.userAgent}`,
            `Page: ${location.origin}${location.pathname}`,
            `Time: ${new Date(now).toISOString()}, ${seconds(now)} after the page opened`,
            `TweetDeck: ${started() ? `started at ${seconds(startedAt)}` : "not started"}`,
            `Steps: ${["extension", "page", "scripts"].map(step => `${step} ${steps[step] ? seconds(steps[step]) : "—"}`).join(", ")}; TD ${has("TD") ? "yes" : "no"}, OTD ${has("OTD") ? "yes" : "no"}`,
            `TweetDeck's steps: ${startup.map(s => `${s.key} ${seconds(s.at)}`).join(", ") || "none"}`,
            `Solver: ${solver ? `${solver.ok ? "ready" : "failed"} at ${seconds(solver.at)} (${solver.text})` : "no news"}`,
            `Extension files not loaded: ${files.join(", ") || "none"}`,
            `Blocked by Content-Security-Policy: ${csp.size ? "" : "nothing"}`,
            ...[...csp.values()].map(v => `  ${v.directive} ${v.blocked}${v.where} ×${v.count}, first at ${seconds(v.at)}`),
            `X: ${answered} answered fine${failed.size ? ", errors:" : ""}`,
            ...[...failed.values()].map(r => `  ${describe(r)} ×${r.count}, first at ${seconds(r.at)}`),
            `Waiting for X: ${pending.size ? "" : "nothing"}`,
            ...waitingFor(0).map(r => `  ${r.method} ${r.url} for ${r.seconds} s`),
            `Still asked at api.x.com and answered: ${[...oldApi].map(([path, v]) => `${path} ×${v.count}`).join(", ") || "nothing"}`,
            `Moved to x.com/i/api: ${movedApi().join(", ") || "nothing"}`,
            ...moves.map(m => `  ${m.key} ${m.moved ? "moved" : "moved back"} at ${seconds(m.at)}`),
            `Script errors: ${errors.size ? "" : "none"}`,
            ...[...errors.values()].map(v => `  ${v.text} ×${v.count}, first at ${seconds(v.at)}`),
        ];
        const before = session(RELOAD_REPORT);
        if(before) lines.push("", `Before the automatic reload at ${new Date(Number(session(RELOAD_AT))).toISOString()}:`, before);
        return lines.join("\n");
    }
    document.addEventListener("otd-diagnostic-request", () => {
        document.dispatchEvent(new CustomEvent("otd-diagnostic-report", { detail: report() }));
    });

    async function copy(text) {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch(e) {
            const area = document.createElement("textarea");
            area.value = text;
            area.style.cssText = "position: fixed; top: 0; left: 0; opacity: 0;";
            document.documentElement.append(area);
            area.select();
            const done = document.execCommand("copy");
            area.remove();
            return done;
        }
    }

    // Styles go through the CSSOM: when the page's policy blocks scripts it may block inline styles too
    function el(tag, css, text) {
        const node = document.createElement(tag);
        if(css) node.style.cssText = css;
        if(text !== undefined) node.textContent = text;
        return node;
    }
    const BUTTON = "margin: 0 8px 8px 0; padding: 6px 12px; border: 1px solid #1da1f2; border-radius: 16px; background: #fff; color: #1da1f2; font: inherit; font-weight: bold; cursor: pointer; text-decoration: none; display: inline-block;";

    let host = null;
    let list = null;
    let dismissed = false;
    function show() {
        if(!host) {
            // in a shadow root, out of reach of TweetDeck's styles for buttons and lists
            host = el("div", "position: fixed; z-index: 2147483647; left: 50%; bottom: 24px; transform: translateX(-50%); width: calc(100% - 32px); max-width: 560px;");
            host.id = "otd-watchdog";
            const panel = el("div", "box-sizing: border-box; max-height: calc(100vh - 48px); overflow-y: auto; padding: 16px 16px 8px; border-radius: 12px; background: #fff; color: #14171a; box-shadow: 0 4px 24px rgba(0, 0, 0, .35); font: 14px/1.4 -apple-system, 'Segoe UI', Roboto, Arial, sans-serif; text-align: left; position: relative;");
            panel.setAttribute("role", "alert");
            const close = el("button", "position: absolute; top: 8px; right: 10px; border: 0; padding: 0; background: none; color: #657786; font-size: 20px; line-height: 1; cursor: pointer;", "×");
            close.title = T.close;
            close.setAttribute("aria-label", T.close);
            close.addEventListener("click", () => {
                dismissed = true;
                host.remove();
            });
            list = el("ul", "margin: 8px 0; padding-left: 20px; list-style: disc;");
            list.className = "findings";
            const copyButton = el("button", BUTTON, T.copy);
            copyButton.className = "copy";
            copyButton.addEventListener("click", async () => {
                if(await copy(report())) copyButton.textContent = T.copied;
                setTimeout(() => { copyButton.textContent = T.copy; }, 2000);
            });
            const reload = el("button", BUTTON, T.reload);
            reload.addEventListener("click", () => location.reload());
            const issue = el("a", BUTTON, T.report);
            issue.href = ISSUES;
            issue.target = "_blank";
            issue.rel = "noopener noreferrer";
            panel.append(close, el("div", "font-size: 16px; font-weight: bold; padding-right: 24px;", T.title), list,
                el("div", "margin-bottom: 10px; color: #657786; font-size: 12px;", `OldTweetDeck · ${T.privacy}`), copyButton, reload, issue);
            host.attachShadow({ mode: "open" }).append(panel);
        }
        list.replaceChildren(...findings().map(text => el("li", "margin-bottom: 4px;", text)));
        // injection.js replaces the page under it when the extension starts late
        if(!host.isConnected) document.documentElement.append(host);
    }

    const timer = setInterval(() => {
        if(started()) {
            clearInterval(timer);
            host?.remove();
            return;
        }
        if(dismissed || localStorage.OTDloadWatchdog === "0") return;
        const waited = Date.now() - START;
        if(waited >= DEADLINE && !host && reloadMayHelp() && !reloadedRecently()) {
            // the stuck page's report stays for the next one
            const stuck = report().split("\n\nBefore the automatic reload")[0];
            session(RELOAD_REPORT, stuck);
            session(RELOAD_AT, String(Date.now()));
            clearInterval(timer);
            location.reload();
            return;
        }
        if(waited >= DEADLINE || (waited >= DEADLINE_BROKEN && (scriptsBlocked() || files.length))) show();
    }, 1000);
})();
