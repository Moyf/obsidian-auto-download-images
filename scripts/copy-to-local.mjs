/**
 * 将构建产物复制到本地 Obsidian vault，并确保 .hotreload 文件存在
 * Copy build artifacts to the local Obsidian vault and ensure .hotreload exists
 *
 * Vault 路径从 .env 读取（优先当前目录，回退到上层目录）：
 *   OBSIDIAN_VAULT=/path/to/your/vault
 * Vault path is read from .env (current dir first, then parent dir).
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// 简易 .env 解析（无 dotenv 依赖）| Minimal .env parser (no dotenv dependency)
function loadEnv(dir) {
  const envPath = join(dir, '.env');
  if (!existsSync(envPath)) return null;
  const env = {};
  for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    // 去掉两端引号 | strip surrounding quotes
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    env[key] = val;
  }
  return env;
}

// 从当前目录逐层向上查找 .env | walk up from current dir until a .env is found
function findEnv(startDir) {
  let dir = startDir;
  // 向上最多 10 层，避免无限循环 | cap at 10 levels to avoid infinite loops
  for (let i = 0; i < 10; i++) {
    const env = loadEnv(dir);
    if (env) return env;
    const parent = dirname(dir);
    if (parent === dir) break; // 到达文件系统根 | reached filesystem root
    dir = parent;
  }
  return null;
}

const env = findEnv(ROOT);
const VAULT_PATH = env?.OBSIDIAN_VAULT_PATH ?? env?.OBSIDIAN_VAULT;
if (!VAULT_PATH) {
  console.error('✖ .env 中未找到 OBSIDIAN_VAULT_PATH（已从当前目录逐层向上查找）');
  console.error('  请在 .env 中添加：OBSIDIAN_VAULT_PATH=/path/to/your/vault');
  process.exit(1);
}

// 从 manifest.json 读取插件 ID | read plugin id from manifest.json
const manifest = JSON.parse(readFileSync(join(ROOT, 'manifest.json'), 'utf-8'));
const PLUGIN_ID = manifest.id;

const VAULT_PLUGIN_DIR = join(VAULT_PATH, '.obsidian', 'plugins', PLUGIN_ID);

if (!existsSync(VAULT_PLUGIN_DIR)) {
  mkdirSync(VAULT_PLUGIN_DIR, { recursive: true });
  console.log(`Created plugin dir: ${VAULT_PLUGIN_DIR}`);
}

// 从仓库根目录读取（esbuild 输出到根目录）| read from repo root (esbuild outputs to root)
const FILES = ['main.js', 'manifest.json', 'styles.css'];
for (const file of FILES) {
  const src = join(ROOT, file);
  if (existsSync(src)) {
    copyFileSync(src, join(VAULT_PLUGIN_DIR, file));
    console.log(`Copied ${file} → ${VAULT_PLUGIN_DIR}`);
  } else if (file !== 'styles.css') {
    console.warn(`⚠ ${file} not found`);
  }
}

const hotreload = join(VAULT_PLUGIN_DIR, '.hotreload');
if (!existsSync(hotreload)) {
  writeFileSync(hotreload, '');
  console.log(`Created .hotreload in ${VAULT_PLUGIN_DIR}`);
}

console.log(`\n✅ Done: ${PLUGIN_ID} → ${VAULT_PLUGIN_DIR}`);
