#!/usr/bin/env node
/**
 * 数独小程序 · 一键发布脚本（全自动）
 * ------------------------------------------------------------
 * 职责：
 *   1. （可选）跑 Jest 测试门禁，确保质量
 *   2. 用 miniprogram-ci 把 7 个云函数部署到微信云环境
 *   3. 汇总结果，失败时给出明确指引
 *
 * 唯一的人工前置条件：
 *   需要提供「小程序代码上传密钥」privateKey.json
 *   生成方式：mp.weixin.qq.com → 开发管理 → 开发设置 → 小程序代码上传密钥 → 生成
 *   然后保存到本目录（deploy/privateKey.json），或设置环境变量 WX_PRIVATE_KEY 指向它
 *
 * 用法：
 *   node release.js                # 默认：先跑测试，再部署
 *   node release.js --skip-tests   # 跳过测试，直接部署
 *   node release.js --skip-functions --skip-tests   # 仅补传前端代码（云函数已就绪）
 *   node release.js --dry-run      # 只校验配置，不真正部署
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execSync, spawnSync } = require('child_process');

// ---- 路径解析 ----
const DEPLOY_DIR = __dirname;
const PROJECT_ROOT = path.resolve(DEPLOY_DIR, '..');           // sudoku-miniprogram/
const FUNC_ROOT = path.join(PROJECT_ROOT, 'cloudfunctions');
const TESTS_DIR = path.join(PROJECT_ROOT, 'tests');

// 优先使用项目依赖，也可通过 MINIPROGRAM_CI_PATH 指定自定义安装位置。
function loadCi() {
  const customPath = process.env.MINIPROGRAM_CI_PATH;
  if (customPath) return require(customPath);
  return require('miniprogram-ci');
}

// ---- 常量 ----
const APPID = 'wx2aee8764ea0cc2be';
const ENV = 'cloud1-d7g923wuw561b7bb6';

const FUNCTIONS = [
  'login',
  'saveProgress',
  'getRanking',
  'pkMatch',
  'pkState',
  'pkSubmit',
  'pkRecord',
];

// ---- 参数 ----
const ARGS = process.argv.slice(2);
const SKIP_TESTS = ARGS.includes('--skip-tests');
const DRY_RUN = ARGS.includes('--dry-run');
const SKIP_CODE = ARGS.includes('--skip-code');          // 默认上传前端代码
const SKIP_FUNCTIONS = ARGS.includes('--skip-functions'); // 跳过云函数部署（已部署时补传代码用）
const VER_MATCH = ARGS.find((a) => a.startsWith('--version='));
const VERSION = VER_MATCH ? VER_MATCH.split('=')[1] : '1.0.0';

// ---- 颜色（Windows 终端兼容） ----
const C = {
  reset: '\x1b[0m', red: '\x1b[31m', green: '\x1b[32m',
  yellow: '\x1b[33m', cyan: '\x1b[36m', bold: '\x1b[1m',
};
const log = (s) => process.stdout.write(s + '\n');
const ok = (s) => log(`${C.green}✓${C.reset} ${s}`);
const bad = (s) => log(`${C.red}✗${C.reset} ${s}`);
const info = (s) => log(`${C.cyan}ℹ${C.reset} ${s}`);
const warn = (s) => log(`${C.yellow}⚠${C.reset} ${s}`);

// ---- 0. 校验密钥 ----
function resolvePrivateKey() {
  const fromEnv = process.env.WX_PRIVATE_KEY;
  if (fromEnv && fs.existsSync(fromEnv)) return fromEnv;
  const def = path.join(DEPLOY_DIR, 'privateKey.json');
  if (fs.existsSync(def)) return def;
  return null;
}

function printKeyHelp() {
  log('');
  warn('缺少「小程序代码上传密钥」privateKey.json，无法部署。');
  log('');
  log(`${C.bold}请按以下步骤生成（一次性，约 1 分钟）：${C.reset}`);
  log('  1. 浏览器打开 https://mp.weixin.qq.com');
  log('  2. 登录后进入：开发管理 → 开发设置');
  log('  3. 找到「小程序代码上传密钥」→ 点击「生成」');
  log('  4. 下载得到的 private.XXX.key 文件，重命名为 privateKey.json');
  log('  5. 把它放到：' + path.join(DEPLOY_DIR, 'privateKey.json'));
  log('     或者设置环境变量：set WX_PRIVATE_KEY=<文件绝对路径>');
  log('');
  log('生成后即可再次运行本脚本完成全自动部署。');
}

// ---- 1. 测试门禁 ----
function runTests() {
  info('运行 Jest 测试门禁 ...');
  const runner = process.platform === 'win32' ? 'npx.cmd' : 'pnpm';
  const runnerArgs = process.platform === 'win32' ? ['jest', '--ci'] : ['exec', 'jest', '--ci', '--runInBand'];
  const r = spawnSync(runner, runnerArgs, {
    cwd: TESTS_DIR,
    stdio: 'inherit',
    shell: false,
  });
  if (r.status !== 0) {
    bad('测试未通过，已中止部署。请先修复测试再发布。');
    process.exit(1);
  }
  ok('测试全部通过');
}

// ---- 2. 部署单个云函数 ----
async function deployOne(ci, project, name) {
  const funcPath = path.join(FUNC_ROOT, name);
  if (!fs.existsSync(funcPath)) {
    throw new Error(`云函数目录不存在: ${funcPath}`);
  }
  const t0 = Date.now();
  const res = await ci.cloud.uploadFunction({
    project,
    env: ENV,
    name,
    path: funcPath,
    remoteNpmInstall: false, // 依赖已本地安装（wx-server-sdk）
  });
  const ms = Date.now() - t0;
  return { ms, filesCount: res.filesCount, packSize: res.packSize };
}

// ---- 3. 上传前端代码（生成可提审版本） ----
async function uploadCode(ci, project) {
  info(`上传前端代码，版本 ${VERSION} ...`);
  await ci.upload({
    project,
    version: VERSION,
    desc: '数独小勇士 自动发布',
    setting: {
      es6: true,
      enhance: true,
      postcss: true,
      minified: true,
      newFeature: true,
      bigPackageSizeSupport: true,
      minifyWXSS: true,
      minifyWXML: true,
    },
    onProgressUpdate: (task) => {
      if (task && typeof task === 'object' && task.status) {
        process.stdout.write(`    [${task.status}] ${task.message || ''}\r`);
      }
    },
  });
  ok(`前端代码已上传，版本 ${VERSION}`);
}

// ---- main ----
async function main() {
  log(`${C.bold}═══════════════════════════════════════════════════${C.reset}`);
  log(`${C.bold}  数独小程序 · 一键发布${C.reset}`);
  log(`  AppID : ${APPID}`);
  log(`  环境  : ${ENV}`);
  log(`  函数  : ${FUNCTIONS.length} 个`);
  log(`  代码  : ${SKIP_CODE ? '跳过' : `上传 v${VERSION}`}`);
  log(`${C.bold}═══════════════════════════════════════════════════${C.reset}`);
  log('');

  // 校验密钥
  const keyPath = resolvePrivateKey();

  // dry-run：仅校验配置，不需要密钥
  if (DRY_RUN) {
    if (!keyPath) warn('dry-run：未检测到密钥，仅校验函数清单与路径');
    else ok(`已找到上传密钥: ${keyPath}`);
    let allDirs = true;
    for (const n of FUNCTIONS) {
      const p = path.join(FUNC_ROOT, n);
      if (fs.existsSync(p)) ok(`函数目录存在: ${n}`);
      else { bad(`函数目录缺失: ${n} (${p})`); allDirs = false; }
    }
    info('dry-run：配置校验完成，未执行部署。');
    process.exit(allDirs ? 0 : 4);
  }

  // 只有真实发布才需要加载 miniprogram-ci。
  let ci;
  try {
    ci = loadCi();
  } catch (e) {
    bad('未能加载 miniprogram-ci，请确认已安装。');
    log('  安装命令：pnpm add -D miniprogram-ci');
    log('  或设置 MINIPROGRAM_CI_PATH 指向已有安装目录。');
    process.exit(3);
  }

  if (!keyPath) {
    printKeyHelp();
    process.exit(2);
  }
  ok(`已找到上传密钥: ${keyPath}`);

  // 测试门禁
  if (!SKIP_TESTS) {
    runTests();
    log('');
  } else {
    warn('已跳过测试门禁（--skip-tests）');
    log('');
  }

  // 构建 project
  const project = new ci.Project({
    projectPath: PROJECT_ROOT,
    type: 'miniProgram',
    appid: APPID,
    privateKeyPath: keyPath,
  });

  // 部署
  const results = [];
  let allOk = true;
  let ipBlocked = false;
  if (SKIP_FUNCTIONS) {
    warn('已跳过云函数部署（--skip-functions），假定其已就绪');
  }
  for (const name of FUNCTIONS) {
    if (SKIP_FUNCTIONS) {
      results.push({ name, ok: true, skipped: true });
      continue;
    }
    process.stdout.write(`  部署 ${name} ... `);
    try {
      const r = await deployOne(ci, project, name);
      ok(`${name} 完成 (${r.filesCount} 文件, ${(r.packSize / 1024).toFixed(0)}KB, ${r.ms}ms)`);
      results.push({ name, ok: true, ...r });
    } catch (e) {
      const msg = e.message || String(e);
      bad(`${name} 失败: ${msg}`);
      results.push({ name, ok: false, error: msg });
      allOk = false;
      if (/-10008|invalid ip/i.test(msg)) ipBlocked = true;
    }
  }

  if (ipBlocked) {
    warn('检测到微信「代码上传密钥」IP 白名单拦截（-10008 invalid ip）。');
    log('');
    log('  解决办法（微信公众平台，一次性）：');
    log('    1. 登录 https://mp.weixin.qq.com → 开发管理 → 开发设置');
    log('    2. 找到「小程序代码上传密钥」，点击该密钥的「IP 白名单」设置');
    log('    3. 把被拒的 IP 加进白名单（或改为「不限制 IP」），保存');
    log('    4. 重新运行本脚本即可继续部署');
    log('');
  }

  // 汇总云函数
  log('');
  log(`${C.bold}──────── 云函数部署汇总 ────────${C.reset}`);
  for (const r of results) {
    if (r.skipped) info(`${r.name.padEnd(12)} 已跳过`);
    else if (r.ok) ok(`${r.name.padEnd(12)} 成功`);
    else bad(`${r.name.padEnd(12)} 失败: ${r.error}`);
  }

  // 上传前端代码
  let codeOk = true;
  if (allOk && !SKIP_CODE) {
    log('');
    try {
      await uploadCode(ci, project);
    } catch (e) {
      bad('前端代码上传失败: ' + (e.message || e));
      codeOk = false;
    }
  } else if (SKIP_CODE) {
    warn('已跳过前端代码上传（--skip-code）');
  }

  log('');
  if (allOk && codeOk) {
    ok(`${C.bold}全部 ${FUNCTIONS.length} 个云函数 + 前端代码 部署/上传成功！${C.reset}`);
    log('');
    info('下一步（人工，控制台一次点击）：');
    log('  • 打开 https://mp.weixin.qq.com → 管理 → 版本管理');
    log('  • 把刚上传的版本「设为体验版」或「提交审核」');
    log('  • 体验版可用微信扫码自测；审核通过后即正式发布');
    process.exit(0);
  } else if (allOk && !codeOk) {
    warn('云函数已就绪，但前端代码上传失败，可重跑 `node release.js --skip-tests` 仅补传代码。');
    process.exit(5);
  } else {
    bad(`${C.bold}存在部署失败的函数，请修复后重跑。${C.reset}`);
    process.exit(1);
  }
}

main().catch((e) => {
  bad('发布脚本异常: ' + (e && e.stack ? e.stack : e));
  process.exit(99);
});
