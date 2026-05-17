import { readFileSync, writeFileSync, mkdirSync, copyFileSync, readdirSync, statSync } from 'fs';
import { execSync } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');
const repoRoot = join(rootDir, '..');

/**
 * Read and parse a JSON file.
 * @param filePath - absolute path to the JSON file
 */
function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

/**
 * Write an object back to a JSON file with 2-space indent and trailing newline.
 * @param filePath - absolute path to write
 * @param data - object to serialize
 */
function writeJson(filePath, data) {
  writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
}

/**
 * Bump the minor component of a semver string, resetting patch to 0.
 * e.g. "0.1.0" → "0.2.0"
 * @param version - current semver string
 */
function bumpMinor(version) {
  const [major, minor] = version.split('.').map(Number);
  return `${major}.${minor + 1}.0`;
}

/**
 * Return today's date as a YYYYMMDD string.
 */
function todayDateStr() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}${mm}${dd}`;
}

/**
 * Update the version field in tauri.conf.json.
 * @param newVersion - semver string to set
 */
function updateTauriConf(newVersion) {
  const filePath = join(rootDir, 'src-tauri', 'tauri.conf.json');
  const conf = readJson(filePath);
  conf.version = newVersion;
  writeJson(filePath, conf);
}

/**
 * Update the version field in the [package] section of Cargo.toml.
 * @param newVersion - semver string to set
 */
function updateCargoToml(newVersion) {
  const filePath = join(rootDir, 'src-tauri', 'Cargo.toml');
  const content = readFileSync(filePath, 'utf8');
  const updated = content.replace(/^version = "[^"]*"/m, `version = "${newVersion}"`);
  writeFileSync(filePath, updated);
}

/**
 * Update the version field in package.json.
 * @param newVersion - semver string to set
 */
function updatePackageJson(newVersion) {
  const filePath = join(rootDir, 'package.json');
  const pkg = readJson(filePath);
  pkg.version = newVersion;
  writeJson(filePath, pkg);
}

/**
 * Find the MSI produced by the Tauri build that matches the given version string.
 * Falls back to the most recently modified MSI if no exact version match is found.
 * @param version - semver string to match in the filename (e.g. "0.2.0")
 */
function findBuiltMsi(version) {
  const msiDir = join(rootDir, 'src-tauri', 'target', 'release', 'bundle', 'msi');
  const files = readdirSync(msiDir).filter(f => f.endsWith('.msi'));
  if (files.length === 0) throw new Error(`No MSI found in ${msiDir}`);
  const match = files.find(f => f.includes(version));
  if (match) return { msiDir, fileName: match };
  // fallback: pick the most recently modified MSI
  const newest = files.sort((a, b) =>
    statSync(join(msiDir, b)).mtimeMs - statSync(join(msiDir, a)).mtimeMs
  )[0];
  return { msiDir, fileName: newest };
}

/**
 * Copy the built MSI into releases/<dateStr>/ under the repo root.
 * @param msiDir - source directory containing the MSI
 * @param fileName - MSI filename
 * @param dateStr - YYYYMMDD folder name
 */
function copyMsiToReleases(msiDir, fileName, dateStr) {
  const destDir = join(repoRoot, 'releases', dateStr);
  mkdirSync(destDir, { recursive: true });
  copyFileSync(join(msiDir, fileName), join(destDir, fileName));
  return destDir;
}

/**
 * Rewrite the Windows download link in README.md to point to the new release.
 * @param dateStr - YYYYMMDD folder name
 * @param fileName - MSI filename (spaces will be URL-encoded)
 */
function updateReadme(dateStr, fileName) {
  const readmePath = join(repoRoot, 'README.md');
  const encodedName = fileName.replace(/ /g, '%20');
  const newLink = `[Download Latest](/releases/${dateStr}/${encodedName})`;
  const readme = readFileSync(readmePath, 'utf8');
  const updated = readme.replace(/\[Download Latest\]\(\/releases\/[^)]+\)/, newLink);
  writeFileSync(readmePath, updated);
}

// ── main ────────────────────────────────────────────────────────────────────

const tauriConfPath = join(rootDir, 'src-tauri', 'tauri.conf.json');
const currentVersion = readJson(tauriConfPath).version;
const newVersion = bumpMinor(currentVersion);

console.log(`Bumping version: ${currentVersion} → ${newVersion}`);
updateTauriConf(newVersion);
updateCargoToml(newVersion);
updatePackageJson(newVersion);

console.log('Running desktop:build...');
execSync('npm run desktop:build', { cwd: rootDir, stdio: 'inherit' });

const { msiDir, fileName } = findBuiltMsi(newVersion);
const dateStr = todayDateStr();

console.log(`Copying ${fileName} → releases/${dateStr}/`);
copyMsiToReleases(msiDir, fileName, dateStr);

console.log('Updating README.md...');
updateReadme(dateStr, fileName);

console.log(`\nRelease ${newVersion} complete! → releases/${dateStr}/${fileName}`);
