// 开发者工具真机内核冒烟：逐页加载、校验棋盘维度与核心交互，并保存截图。
const path = require('path');
const fs = require('fs');
const automator = require('miniprogram-automator');

const PROJECT_PATH = path.resolve(__dirname, '../..');
const CLI_PATH = process.platform === 'darwin'
  ? '/Applications/wechatwebdevtools.app/Contents/MacOS/cli'
  : 'C:\\Program Files (x86)\\Tencent\\微信web开发者工具\\cli.bat';
// 截图必须放到项目外，否则开发者工具文件监听会触发热重载并中断导航。
const SHOTS_DIR = '/private/tmp/sudoku-e2e-screenshots';

async function injectUser(miniProgram) {
  const state = await miniProgram.evaluate(() => {
    const user = { openid: 'e2e-local-user', nickName: '体验小勇士', avatarUrl: '' };
    getApp().globalData.user = user;
    wx.setStorageSync('currentUser', user);
    return { globalUser: getApp().globalData.user, cachedUser: wx.getStorageSync('currentUser') };
  });
  if (!state || !state.globalUser || !state.globalUser.openid) throw new Error('测试登录态注入失败: ' + JSON.stringify(state));
}

async function assertPage(miniProgram, route, selector) {
  await injectUser(miniProgram);
  const page = await miniProgram.reLaunch(route);
  await page.waitFor(600);
  const actual = await page.path;
  if (actual !== route.replace(/^\//, '')) throw new Error(`路由异常: ${route} -> ${actual}`);
  if (selector && !(await page.$(selector))) throw new Error(`${route} 缺少 ${selector}`);
  return page;
}

async function navigatePage(miniProgram, route, selector) {
  await injectUser(miniProgram);
  const page = await miniProgram.navigateTo(route);
  await page.waitFor(600);
  const actual = await page.path;
  if (actual !== route.replace(/^\//, '')) throw new Error(`路由异常: ${route} -> ${actual}`);
  if (selector && !(await page.$(selector))) throw new Error(`${route} 缺少 ${selector}`);
  return page;
}

async function run() {
  if (!fs.existsSync(SHOTS_DIR)) fs.mkdirSync(SHOTS_DIR, { recursive: true });
  const miniProgram = process.env.AUTOMATOR_WS
    ? await automator.connect({ wsEndpoint: process.env.AUTOMATOR_WS })
    : await automator.launch({ cliPath: CLI_PATH, projectPath: PROJECT_PATH, trustProject: true });
  try {
    miniProgram.on('console', msg => console.log('[小程序 console]', msg));
    miniProgram.on('exception', err => console.error('[小程序 exception]', err));
    await injectUser(miniProgram);

    const home = await assertPage(miniProgram, '/pages/home/home', '.home-container');
    await miniProgram.screenshot({ path: path.join(SHOTS_DIR, 'home.png') });

    for (const size of [4, 6, 9]) {
      const route = `/pages/game${size}x${size}/game${size}x${size}`;
      const page = await navigatePage(miniProgram, route, '.grid');
      const grid = await page.data('gridRows');
      if (!Array.isArray(grid) || grid.length !== size || grid.some(row => row.length !== size)) {
        throw new Error(`${size}x${size} 棋盘维度错误`);
      }
      if (await page.data('gameStarted')) throw new Error(`${size}x${size} 进入后不应自动开始`);
      if (await page.data('timer')) throw new Error(`${size}x${size} 未开始时不应计时`);
      const startButton = await page.$('.start-game-btn');
      if (!startButton) throw new Error(`${size}x${size} 缺少开始游戏按钮`);
      await startButton.tap();
      await page.waitFor(150);
      if (!(await page.data('gameStarted'))) throw new Error(`${size}x${size} 点击后未开始`);

      const editable = grid.flat().findIndex(cell => !cell.fixed);
      const cells = await page.$$('.cell');
      const nums = await page.$$('.num-btn');
      if (editable < 0 || nums.length !== size) throw new Error(`${size}x${size} 交互控件数量错误`);
      await cells[editable].tap();
      await page.waitFor(150);
      await nums[0].tap();
      await page.waitFor(150);
      const updated = await page.data('gridRows');
      if (updated.flat()[editable].value !== 1) throw new Error(`${size}x${size} 数字输入失败`);
      if ((await page.$$('.tool')).length !== 0) throw new Error(`${size}x${size} 不应存在额外辅助工具`);
      await miniProgram.screenshot({ path: path.join(SHOTS_DIR, `game-${size}x${size}.png`) });
      await miniProgram.navigateBack();
    }

    await navigatePage(miniProgram, '/pages/stats/stats', '.stats-container');
    await miniProgram.screenshot({ path: path.join(SHOTS_DIR, 'stats.png') });
    console.log('E2E_SMOKE_OK: 首页、三种棋盘、手动开始、大键盘输入、记录页均通过');
  } finally {
    await miniProgram.close();
  }
}

run().catch(err => { console.error(err); process.exitCode = 1; });
