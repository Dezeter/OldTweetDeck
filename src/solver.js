// x-client-transaction-id solver. Runs inside the sandboxed iframe challenge.js creates: opaque origin,
// no access to x.com's cookies or to the extension. It runs X's own ondemand.s code, the one x.com signs
// its requests with, on a minimal webpack runtime fed with X's vendor chunk, and answers challenge.js.
// Protocol: init {challenge, vendor, anims, verificationCode} -> ready | initError,
//           solve {id, path, method} -> solved {id, result} | error {id, error}
(() => {
    let solver = null;
    let initStarted = false;
    let initFailed = null;
    // solve requests that come before init is done wait here
    let waiting = [];

    function makeRequire(modules) {
        const cache = {};
        function require(id) {
            if(cache[id]) return cache[id].exports;
            if(!modules[id]) throw new Error(`webpack module ${id} is missing`);
            const module = cache[id] = { id, loaded: false, exports: {} };
            modules[id].call(module.exports, module, module.exports, require);
            module.loaded = true;
            return module.exports;
        }
        const has = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
        require.m = modules;
        require.c = cache;
        require.o = has;
        require.g = globalThis;
        require.p = "https://abs.twimg.com/responsive-web/client-web/";
        require.d = (exports, getters) => {
            for(const key in getters) {
                if(has(getters, key) && !has(exports, key)) Object.defineProperty(exports, key, { enumerable: true, get: getters[key] });
            }
        };
        require.r = exports => {
            if(typeof Symbol !== "undefined" && Symbol.toStringTag) Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
            Object.defineProperty(exports, "__esModule", { value: true });
        };
        require.n = module => {
            const getter = module && module.__esModule ? () => module.default : () => module;
            require.d(getter, { a: getter });
            return getter;
        };
        // webpack's "create fake namespace object"
        require.t = function(value, mode) {
            if(mode & 1) value = this(value);
            if(mode & 8) return value;
            if(typeof value === "object" && value) {
                if((mode & 4) && value.__esModule) return value;
                if((mode & 16) && typeof value.then === "function") return value;
            }
            const ns = Object.create(null);
            require.r(ns);
            const getters = {};
            for(let current = mode & 2 && value; typeof current === "object" && current && current !== Object.prototype; current = Object.getPrototypeOf(current)) {
                Object.getOwnPropertyNames(current).forEach(key => { getters[key] = () => value[key]; });
            }
            getters.default = () => value;
            require.d(ns, getters);
            return ns;
        };
        require.nmd = module => {
            module.paths = [];
            if(!module.children) module.children = [];
            return module;
        };
        require.hmd = require.nmd;
        // the signing code doesn't load chunks on demand; this keeps a stray import from throwing
        require.e = () => Promise.resolve();
        return require;
    }

    async function init(data) {
        // the animation SVGs and the verification key from x.com's homepage: the signing code reads both from the DOM
        document.getElementById("anims").innerHTML = data.anims.join("\n");
        document.querySelector('meta[name="twitter-site-verification"]').content = data.verificationCode;

        // X's chunks push themselves onto this array; collect their module factories
        const modules = {};
        let collecting = null;
        self.webpackChunk_twitter_responsive_web = Object.assign([], {
            push(chunk) {
                for(const id of Object.keys(chunk[1] || {})) {
                    modules[id] = chunk[1][id];
                    collecting?.push(id);
                }
                return 0;
            },
        });
        const run = (0, eval);
        run(data.vendor);
        const challengeIds = collecting = [];
        run(data.challenge);
        collecting = null;

        const require = makeRequire(modules);
        let entry = null;
        for(const id of challengeIds) {
            const exports = require(id);
            if(typeof exports?.default === "function") {
                entry = exports.default;
                break;
            }
        }
        if(!entry) throw new Error("no signing function in ondemand.s");

        // default() builds the solver; should X ever export the solver itself, use it as is
        let made;
        try {
            made = await entry();
        } catch(e) {}
        solver = typeof made === "function" ? made : entry;
    }

    async function solve(event, data) {
        try {
            const result = await solver(data.path, data.method);
            event.source.postMessage({ action: "solved", id: data.id, result }, event.origin);
        } catch(e) {
            event.source.postMessage({ action: "error", id: data.id, error: String(e?.message || e) }, event.origin);
        }
    }

    window.addEventListener("message", async event => {
        if(event.origin !== "https://x.com" && event.origin !== "https://twitter.com") return;
        const data = event.data || {};
        if(data.action === "init") {
            // challenge.js sends init again if "ready" is late; one is enough
            if(initStarted) return;
            initStarted = true;
            try {
                await init(data);
                event.source.postMessage({ action: "ready" }, event.origin);
            } catch(e) {
                initFailed = String(e?.message || e);
                console.error("[otd-solver] init failed", e);
                event.source.postMessage({ action: "initError", error: initFailed }, event.origin);
            }
            for(const [queuedEvent, queuedData] of waiting) {
                if(solver) solve(queuedEvent, queuedData);
                else queuedEvent.source.postMessage({ action: "error", id: queuedData.id, error: initFailed }, queuedEvent.origin);
            }
            waiting = [];
        } else if(data.action === "solve") {
            if(solver) solve(event, data);
            else if(initFailed) event.source.postMessage({ action: "error", id: data.id, error: initFailed }, event.origin);
            else waiting.push([event, data]);
        }
    });
})();
