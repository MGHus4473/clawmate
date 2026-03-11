#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const trackedFiles = [
  { label: "root package", path: path.join(rootDir, "package.json") },
  { label: "plugin package", path: path.join(rootDir, "packages", "clawmate-companion", "package.json") },
  { label: "plugin manifest", path: path.join(rootDir, "packages", "clawmate-companion", "openclaw.plugin.json") },
];

function printHelp() {
  console.log(`
ClawMate release helper

Usage:
  npm run release -- <patch|minor|major|x.y.z> [--publish] [--dry-run] [--tag <tag>]

Examples:
  npm run release -- patch --dry-run
  npm run release -- patch --publish
  npm run release -- 0.2.0 --publish
  npm run release:patch
  npm run release:minor
  npm run release:major

What it does:
  1. Sync versions across the 3 release files
  2. Refresh package-lock.json
  3. Run manifest consistency check
  4. Run npm pack --dry-run
  5. Optionally publish to npm
`.trim());
}

function parseArgs(argv) {
  const options = {
    publish: false,
    dryRun: false,
    tag: "latest",
  };

  let releaseTarget = null;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }

    if (arg === "--publish") {
      options.publish = true;
      continue;
    }

    if (arg === "--dry-run") {
      options.dryRun = true;
      continue;
    }

    if (arg === "--tag") {
      const value = argv[index + 1];
      if (!value) {
        throw new Error("Missing value for --tag");
      }
      options.tag = value;
      index += 1;
      continue;
    }

    if (arg.startsWith("--tag=")) {
      options.tag = arg.slice("--tag=".length);
      continue;
    }

    if (arg.startsWith("-")) {
      throw new Error(`Unknown option: ${arg}`);
    }

    if (releaseTarget) {
      throw new Error(`Unexpected extra argument: ${arg}`);
    }

    releaseTarget = arg;
  }

  return { options, releaseTarget };
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function parseSemver(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)(-[0-9A-Za-z.-]+)?$/.exec(version);
  if (!match) {
    throw new Error(`Unsupported version format: ${version}`);
  }

  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    suffix: match[4] ?? "",
  };
}

function resolveNextVersion(target, currentVersion) {
  if (!target) {
    throw new Error("Missing release target. Use patch, minor, major, or an explicit version.");
  }

  if (/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(target)) {
    return target;
  }

  const parsed = parseSemver(currentVersion);

  if (target === "patch") {
    return `${parsed.major}.${parsed.minor}.${parsed.patch + 1}`;
  }

  if (target === "minor") {
    return `${parsed.major}.${parsed.minor + 1}.0`;
  }

  if (target === "major") {
    return `${parsed.major + 1}.0.0`;
  }

  throw new Error(`Unsupported release target: ${target}`);
}

function runCommand(command, args) {
  const printable = [command, ...args].join(" ");
  console.log(`\n> ${printable}`);

  const result = spawnSync(command, args, {
    cwd: rootDir,
    stdio: "inherit",
    shell: process.platform === "win32",
  });

  if (result.status !== 0) {
    throw new Error(`Command failed: ${printable}`);
  }
}

function main() {
  const { options, releaseTarget } = parseArgs(process.argv.slice(2));

  if (options.help) {
    printHelp();
    return;
  }

  const jsonFiles = trackedFiles.map((entry) => ({
    ...entry,
    json: readJson(entry.path),
  }));

  const currentVersion = jsonFiles[0].json.version;
  if (typeof currentVersion !== "string" || !currentVersion.trim()) {
    throw new Error("Root package version is missing.");
  }

  const nextVersion = resolveNextVersion(releaseTarget, currentVersion);
  const currentVersions = jsonFiles.map((entry) => `${entry.label}: ${entry.json.version}`).join("\n");

  if (nextVersion === currentVersion) {
    throw new Error(`Version is unchanged: ${currentVersion}`);
  }

  console.log(`Current versions:\n${currentVersions}`);
  console.log(`\nNext version: ${nextVersion}`);
  console.log(`Publish: ${options.publish ? "yes" : "no"}`);
  console.log(`Tag: ${options.tag}`);

  if (options.dryRun) {
    console.log("\nDry run only. No files changed.");
    return;
  }

  for (const entry of jsonFiles) {
    entry.json.version = nextVersion;
    writeJson(entry.path, entry.json);
  }

  console.log("\nUpdated versions:");
  for (const entry of jsonFiles) {
    console.log(`- ${entry.label}: ${nextVersion}`);
  }

  runCommand("npm", ["install", "--package-lock-only"]);
  runCommand("npm", ["run", "clawmate:plugin:check"]);
  runCommand("npm", ["pack", "--dry-run"]);

  if (options.publish) {
    runCommand("npm", ["publish", "--access", "public", "--tag", options.tag]);
    console.log(`\nRelease published: @clawmate/clawmate@${nextVersion}`);
  } else {
    console.log("\nSkipped npm publish. Re-run with --publish when ready.");
  }
}

try {
  main();
} catch (error) {
  console.error(`\nRelease failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
