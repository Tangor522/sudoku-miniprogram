// tests/e2e/miniprogram-automator.demo.js
// 小程序 E2E 自动化测试示例（基于 miniprogram-automator）
//
// 使用前准备：
// 1. 全局安装：npm install -g miniprogram-automator
// 2. 微信开发者工具开启「CLI/HTTP 调用」：设置 → 安全设置 → 开启服务端口
// 3. 确保 project.config.json 已填入真实 AppID
//
// 运行：node tests/e2e/miniprogram-automator.demo.js
//
// 本脚本演示：启动小程序 → 模拟登录 → 进入四宫格 → 填数 → 提交 → 校验弹窗

const automator = require('miniprogram-automator');

const PROJECT_PATH = require('path').resolve(__dirname, '../../');
const CLI_PATH = 'C:\\Program Files (x86)\\Tencent\\微信web开发者工具\\cli.bat'; // 按实际路径调整

async function run() {
  const miniProgram = await automator.launch({
    cliPath: CLI_PATH,
    projectPath: PROJECT_PATH,
  });

  try {
    console.log('=== 小程序已启动 ===');

    // 1. 首页（本地模式默认已登录态会直接进 home；未登录会跳 login）
    let page = await miniProgram.currentPage();
    console.log('当前页：', await page.path);

    // 如果在登录页，模拟点「微信一键登录」
    if ((await page.path).indexOf('login') !== -1) {
      console.log('--- 在登录页，模拟一键登录 ---');
      const loginBtn = await page.$('.login-btn');
      if (loginBtn) {
        await loginBtn.tap();
        await miniProgram.pageScrollTo();
        await page.waitFor(1000);
      }

      // 如果出现资料补全，点「跳过」
      const skipBtn = await page.$('.skip-btn');
      if (skipBtn) {
        await skipBtn.tap();
        await page.waitFor(500);
      }
      page = await miniProgram.currentPage();
    }

    // 2. 进入四宫格
    console.log('--- 进入四宫格 ---');
    const home = await miniProgram.currentPage();
    const go4x4 = await home.$('.mode-btn');
    if (go4x4) {
      await go4x4.tap();
      await page.waitFor(800);
    }

    page = await miniProgram.currentPage();
    console.log('当前页：', await page.path);
    if ((await page.path).indexOf('game4x4') === -1) {
      throw new Error('未跳转到 game4x4');
    }

    // 3. 点开始游戏
    console.log('--- 点开始游戏 ---');
    const startBtn = await page.$('.start-btn');
    if (startBtn) {
      await startBtn.tap();
      await page.waitFor(300);
    }

    // 4. 读取棋盘数据
    const gridData = await page.data('gridRows');
    console.log('棋盘行数：', gridData.length);

    // 5. 找第一个空格并填数（演示填入 1）
    let targetCell = null;
    for (let r = 0; r < gridData.length; r++) {
      for (let c = 0; c < gridData[r].length; c++) {
        if (!gridData[r][c].fixed && gridData[r][c].value === 0) {
          targetCell = { row: r, col: c };
          break;
        }
      }
      if (targetCell) break;
    }
    if (targetCell) {
      console.log('--- 选中空格', targetCell, '---');
      const cells = await page.$$('.cell');
      const idx = targetCell.row * gridData[0].length + targetCell.col;
      if (cells[idx]) {
        await cells[idx].tap();
        await page.waitFor(200);
      }

      // 点数字键 1
      const numBtns = await page.$$('.num-btn');
      if (numBtns[0]) {
        await numBtns[0].tap();
        await page.waitFor(200);
        console.log('已填入数字 1');
      }
    }

    // 6. 点提交
    console.log('--- 点提交 ---');
    const submitBtn = await page.$('.action-btn');
    if (submitBtn) {
      await submitBtn.tap();
      await page.waitFor(500);
    }

    // 7. 校验弹窗出现
    const modal = await page.$('.modal-card');
    if (modal) {
      console.log('✅ 结果弹窗已弹出');
      const status = await page.data('resultStatus');
      console.log('   结果状态：', status);
    } else {
      console.log('⚠️ 未检测到结果弹窗');
    }

    console.log('=== E2E 测试完成 ===');
  } catch (err) {
    console.error('❌ 测试失败：', err);
    process.exitCode = 1;
  } finally {
    await miniProgram.close();
  }
}

run();
