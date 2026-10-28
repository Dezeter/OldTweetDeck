// This script generates Firefox version of the extension and packs Chrome and Firefox versions to zip files.

const fsp = require('fs').promises;
const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

// not part of the extension
const SKIP = ['.git', '.github', '_metadata', 'node_modules', 'build', 'scripts', 'test', 'test-results', 'playwright-report', 'playwright.config.js'];

async function copyDir(src, dest) {
    const entries = await fsp.readdir(src, { withFileTypes: true });
    await fsp.mkdir(dest);
    for (let entry of entries) {
        if(SKIP.includes(entry.name)) continue;
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);
        if (entry.isDirectory()) {
            await copyDir(srcPath, destPath);
        } else {
            await fsp.copyFile(srcPath, destPath);
        }
    }
}

if(!fs.existsSync('./build')) {
    fs.mkdirSync('./build');
}

if(fs.existsSync('./build/TweeXDeckTempChrome')) {
    fs.rmSync('./build/TweeXDeckTempChrome', { recursive: true });
}
if(fs.existsSync('./build/TweeXDeckFirefox')) {
    fs.rmSync('./build/TweeXDeckFirefox', { recursive: true });
}

console.log("Copying...");
copyDir('./', './build/TweeXDeckFirefox').then(async () => {
    await copyDir('./', './build/TweeXDeckTempChrome');
    console.log("Copied!");
    console.log("Patching...");

    let manifest = JSON.parse(await fsp.readFile('./build/TweeXDeckTempChrome/manifest.json', 'utf8'));
    manifest.browser_specific_settings = {
        gecko: {
            id: "oldtweetdeck@dezeter",
            strict_min_version: "90.0"
        }
    };
    manifest.manifest_version = 2;
    delete manifest.declarative_net_request;
    manifest.permissions.push("webRequest", "webRequestBlocking", ...manifest.host_permissions);
    delete manifest.host_permissions;
    for(let content_script of manifest.content_scripts) {
        if(content_script.world === "MAIN") {
            delete content_script.world;
        }
        content_script.js = content_script.js.filter(js => js !== "src/destroyer.js");
    }
    manifest.background = {
        scripts: ["src/google-translate.js", "src/background.js"],
    }
    manifest.web_accessible_resources = manifest.web_accessible_resources[0].resources;

    fs.unlinkSync('./build/TweeXDeckFirefox/pack.js');
    fs.unlinkSync('./build/TweeXDeckTempChrome/pack.js');
    fs.unlinkSync('./build/TweeXDeckFirefox/README.md');
    fs.unlinkSync('./build/TweeXDeckTempChrome/README.md');
    fs.unlinkSync('./build/TweeXDeckFirefox/package.json');
    fs.unlinkSync('./build/TweeXDeckTempChrome/package.json');
    fs.unlinkSync('./build/TweeXDeckFirefox/package-lock.json');
    fs.unlinkSync('./build/TweeXDeckTempChrome/package-lock.json');
    fs.unlinkSync('./build/TweeXDeckFirefox/.gitignore');
    fs.unlinkSync('./build/TweeXDeckTempChrome/.gitignore');
    fs.writeFileSync('./build/TweeXDeckFirefox/manifest.json', JSON.stringify(manifest, null, 2));

    console.log("Patched!");

    console.log("Zipping Firefox version...");
    try {
        const zip = new AdmZip();
        const outputDir = "./build/TweeXDeckFirefox.zip";
        zip.addLocalFolder("./build/TweeXDeckFirefox");
        zip.writeZip(outputDir);
    } catch (e) {
        console.log(`Something went wrong ${e}`);
    }
    console.log("Zipping Chrome version...");
    try {
        const zip = new AdmZip();
        const outputDir = "./build/TweeXDeckChrome.zip";
        zip.addLocalFolder("./build/TweeXDeckTempChrome");
        zip.writeZip(outputDir);
    } catch (e) {
        console.log(`Something went wrong ${e}`);
    }
    console.log("Zipped!");
    console.log("Deleting temporary folders...");
    fs.rmSync('./build/TweeXDeckTempChrome', { recursive: true });
    fs.rmSync('./build/TweeXDeckFirefox', { recursive: true });
    console.log("Deleted!");
});