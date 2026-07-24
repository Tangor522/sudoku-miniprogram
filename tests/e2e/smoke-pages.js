// 开发者工具真机内核冒烟：逐页加载、校验棋盘维度与核心交互，并保存截图。
const path = require('path');
const fs = require('fs');
const automator = require('miniprogram-automator');

const PROJECT_PATH = path.resolve(__dirname, '../..');
const CLI_PATH = process.platform === 'darwin'
  ? '/Applications/wechatwebdevtools.app/Contents/MacOS/cli'
  : (process.env.WECHAT_DEVTOOLS_CLI || 'C:\\Program Files (x86)\\Tencent\\微信web开发者工具\\cli.bat');
// 截图必须放到项目外，否则开发者工具文件监听会触发热重载并中断导航。
const SHOTS_DIR = path.join(require('os').tmpdir(), 'sudoku-e2e-screenshots');

async function clearUser(miniProgram) {
  await miniProgram.evaluate(() => {
    getApp().globalData.user = null;
    wx.removeStorageSync('currentUser');
  });
}

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
    : await automator.launch({
        cliPath: CLI_PATH,
        projectPath: PROJECT_PATH,
        trustProject: true,
        port: Number(process.env.AUTOMATOR_PORT || 9420),
        args: process.env.WECHAT_DEVTOOLS_PORT ? ['--port', process.env.WECHAT_DEVTOOLS_PORT] : []
      });
  try {
    miniProgram.on('console', msg => console.log('[小程序 console]', msg));
    miniProgram.on('exception', err => console.error('[小程序 exception]', err));

    await clearUser(miniProgram);
    const home = await miniProgram.reLaunch('/pages/home/home');
    await home.waitFor(600);
    if (!(await home.$('.home-container'))) throw new Error('游客首页未正常渲染');
    if (await home.data('user')) throw new Error('游客首页不应自动登录');
    await miniProgram.screenshot({ path: path.join(SHOTS_DIR, 'home.png') });

    for (const size of [4, 6, 9]) {
      const route = `/pages/game${size}x${size}/game${size}x${size}`;
      const page = await miniProgram.navigateTo(route);
      await page.waitFor(600);
      if (!(await page.$('.grid'))) throw new Error(`${size}x${size} 游客无法进入棋盘`);
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

    const stats = await miniProgram.navigateTo('/pages/stats/stats');
    await stats.waitFor(600);
    if (!(await stats.$('.stats-container'))) throw new Error('游客无法查看本地成长记录');
    await miniProgram.screenshot({ path: path.join(SHOTS_DIR, 'stats.png') });
    await miniProgram.navigateBack();

    const guestHome = await miniProgram.currentPage();
    await clearUser(miniProgram);
    const pkButton = await guestHome.$('.pk-card');
    await pkButton.tap();
    await guestHome.waitFor(500);
    const login = await miniProgram.currentPage();
    if ((await login.path) !== 'pages/login/login') throw new Error('游客点击 PK 后未进入登录页');
    if ((await login.data('from')) !== 'pk') throw new Error('登录页未保留 PK 回跳目标');
    if (!(await login.$('.login-btn'))) throw new Error('登录页缺少用户主动登录按钮');
    await miniProgram.screenshot({ path: path.join(SHOTS_DIR, 'login-for-pk.png') });
    console.log('E2E_SMOKE_OK: 游客首页、三种单人棋盘、本地记录、PK 按需登录均通过');
  } finally {
    await miniProgram.close();
  }
}

run().catch(err => { console.error(err); process.exitCode = 1; });
