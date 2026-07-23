// 开发者工具真机内核冒烟：逐页加载、校验棋盘维度与核心交互，并保存截图。
const path = require('path');
const fs = require('fs');
const automator = require('miniprogram-automator');

const PROJECT_PATH = path.resolve(__dirname, '../..');
const CLI_PATH = process.platform === 'darwin'
  ? '/Applications/wechatwebdevtools.app/Contents/MacOS/cli'
  : 'D:\\Tencent\\微信web开发者工具\\cli.bat';
// 截图必须放到项目外，否则开发者工具文件监听会触发热重载并中断导航。
const SHOTS_DIR = process.platform === 'darwin'
  ? '/private/tmp/sudoku-e2e-screenshots'
  : 'D:\\tmp\\sudoku-e2e-screenshots';

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
  const miniProgram = await automator.connect({ wsEndpoint: 'ws://127.0.0.1:9420' });
  try {
    miniProgram.on('console', msg => console.log('[小程序 console]', msg));
    miniProgram.on('exception', err => console.error('[小程序 exception]', err));
    await injectUser(miniProgram);

    const home = await assertPage(miniProgram, '/pages/home/home', '.home-container');
    console.log('E2E_STEP: home');

    for (const size of [4, 6, 9]) {
      const route = `/pages/game${size}x${size}/game${size}x${size}`;
      const page = await navigatePage(miniProgram, route, '.grid');
      console.log(`E2E_STEP: game-${size}x${size}`);
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
      const undoButton = await page.$('.undo-button');
      if (size === 9 && !undoButton) throw new Error('9x9 缺少回退按钮');
      if (size !== 9 && undoButton) throw new Error(`${size}x${size} 不应显示回退按钮`);

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
      if (size === 9) {
        for (const numIndex of [1, 2, 3]) {
          await nums[numIndex].tap();
          await page.waitFor(80);
        }
        if ((await page.data('undoSteps')) !== 3) throw new Error('9x9 回退记录未限制为 3 步');
        for (const expected of [3, 2, 1]) {
          await undoButton.tap();
          await page.waitFor(80);
          const afterUndo = await page.data('gridRows');
          if (afterUndo.flat()[editable].value !== expected) {
            throw new Error(`9x9 回退结果错误，期望 ${expected}`);
          }
        }
        if ((await page.data('canUndo')) || (await page.data('undoSteps')) !== 0) {
          throw new Error('9x9 三步回退后按钮状态错误');
        }
      }
      if ((await page.$$('.tool')).length !== 0) throw new Error(`${size}x${size} 不应存在额外辅助工具`);
      await miniProgram.navigateBack();
    }

    await navigatePage(miniProgram, '/pages/stats/stats', '.stats-container');
    console.log('E2E_STEP: stats');
    console.log('E2E_SMOKE_OK: 首页、三种棋盘、九宫格三步回退、手动开始、大键盘输入、记录页均通过');
  } finally {
    // 连接的是已打开的开发者工具，不在测试结束时关闭用户窗口。
  }
}

run().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
