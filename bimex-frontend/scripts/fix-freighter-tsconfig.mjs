import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const freighterTsconfigPath = path.join(root, "node_modules", "@stellar", "freighter-api", "tsconfig.json");
const nodeModulesTsconfigPath = path.join(root, "node_modules", "tsconfig.json");

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function patchFreighterTsconfig() {
  if (!fs.existsSync(freighterTsconfigPath)) return;

  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(freighterTsconfigPath, "utf8"));
  } catch {
    return;
  }

  const next = {
    compilerOptions: {
      baseUrl: "./src",
      declaration: true,
      declarationDir: "build/",
      outDir: "build/",
      sourceMap: true,
      skipLibCheck: true,
      paths: {
        "@shared/*": ["../../../@shared/*"],
      },
    },
    include: ["src"],
    exclude: ["build", "node_modules", "src/**/*.test.js"],
  };

  // If upstream package changes significantly, keep include/exclude if present.
  if (Array.isArray(parsed.include)) next.include = parsed.include;
  if (Array.isArray(parsed.exclude)) next.exclude = parsed.exclude;

  writeJson(freighterTsconfigPath, next);
}

function ensureNodeModulesBaseTsconfig() {
  const base = {
    compilerOptions: {
      target: "ES2022",
      module: "ESNext",
      moduleResolution: "Bundler",
      sourceMap: true,
      allowJs: true,
      skipLibCheck: true,
      esModuleInterop: true,
      types: ["@testing-library/jest-dom"],
    },
  };

  writeJson(nodeModulesTsconfigPath, base);
}

function patchStellarSdk() {
  const configPath = path.join(root, "node_modules", "@stellar", "stellar-sdk", "lib", "minimal", "bindings", "config.js");
  if (fs.existsSync(configPath)) {
    let content = fs.readFileSync(configPath, "utf8");
    if (content.includes('require("../../package.json")')) {
      content = content.replace(/require\("\.\.\/\.\.\/package\.json"\)/g, '{ version: "14.6.1" }');
      fs.writeFileSync(configPath, content, "utf8");
    }
  }
}

patchFreighterTsconfig();
ensureNodeModulesBaseTsconfig();
patchStellarSdk();

console.log("[postinstall] Applied compatibility patches");

