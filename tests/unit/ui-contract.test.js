var fs = require('fs');
var path = require('path');

var ROOT = path.resolve(__dirname, '../..');
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }

describe('全局 UI 设计契约', function () {
  var wxmlFiles = [
    'pages/home/home.wxml', 'pages/login/login.wxml',
    'pages/game4x4/game4x4.wxml', 'pages/game6x6/game6x6.wxml', 'pages/game9x9/game9x9.wxml',
    'pages/stats/stats.wxml', 'pages/ranking/ranking.wxml',
    'pages/pk_lobby/pk_lobby.wxml', 'pages/pk_game/pk_game.wxml'
  ];

  test('所有页面使用同一主题根节点，且不混用装饰性 Emoji', function () {
    var decorativeEmoji = /[🦄🏆🥇🥈🥉⚔📚🎮🧩🎯🏠🔑📤🚀✅🏳⏱👤☁♛✦]/;
    wxmlFiles.forEach(function (file) {
      var source = read(file);
      // include 页面由共享模板提供主题根节点。
      expect(source.indexOf('<include') === 0 || source.indexOf('theme-{{colorMode}}') !== -1).toBe(true);
      expect(source).not.toMatch(decorativeEmoji);
    });
  });

  test('4×4、6×6、9×9 共用同一游戏模板', function () {
    expect(read('pages/game4x4/game4x4.wxml')).toContain('../game6x6/game6x6.wxml');
    expect(read('pages/game9x9/game9x9.wxml')).toContain('../game6x6/game6x6.wxml');
  });

  test('单人玩法只保留开始、数字输入和提交，不展示额外工具', function () {
    var game = read('pages/game6x6/game6x6.wxml');
    var gameController = read('utils/game-page.js');
    expect(game).toContain('开始游戏');
    expect(game).toContain('提交答案');
    expect(game).not.toMatch(/重置|撤销|提示|清除/);
    expect(gameController).not.toMatch(/resetGame|initialGrid/);
  });

  test('棋盘遵循固定数字黑色、填写数字主题色、错误格单独标识', function () {
    var solo = read('pages/game-common.wxss');
    var pk = read('pages/pk_game/pk_game.wxss');
    [solo, pk].forEach(function (css) {
      expect(css).toMatch(/\.cell-text\{[^}]*color:var\(--primary-solid\)/);
      expect(css).toMatch(/\.cell-fixed \.cell-text\{color:#111/);
      expect(css).toMatch(/\.cell-error \.cell-text\{color:var\(--error-color\)/);
    });
  });

  test('PK 大厅完整展示三种棋盘规格，按钮文案无多余图标', function () {
    var lobby = read('pages/pk_lobby/pk_lobby.wxml');
    var lobbyCss = read('pages/pk_lobby/pk_lobby.wxss');
    expect(lobby).toContain('4×4');
    expect(lobby).toContain('6×6');
    expect(lobby).toContain('9×9');
    expect(read('pages/pk_game/pk_game.wxml')).toContain('>提交答案</button>');
    expect(lobbyCss).toContain('grid-template-columns:minmax(0,1fr) minmax(0,1fr)');
    expect(lobbyCss).toMatch(/\.action-btn-half\{[^}]*min-width:0/);
  });

  test('审核登录流程允许游客先体验首页和单人玩法', function () {
    var appConfig = JSON.parse(read('app.json'));
    var login = read('pages/login/login.js');
    var home = read('pages/home/home.js');
    var game = read('utils/game-page.js');
    expect(appConfig.pages[0]).toBe('pages/home/home');
    expect(login).not.toMatch(/silentLogin|chooseAvatar|type="nickname"/);
    expect(read('pages/login/login.wxml')).toContain('暂不登录，返回体验');
    expect(home).toContain("auth.loginUrl('pk')");
    expect(home).toContain("auth.loginUrl('ranking')");
    expect(game).toContain("cloud.isReady() && store.getState('user')");
    expect(game).toContain('GUEST_LEVEL_LIMIT = 3');
    expect(login).toContain("game9x9: '/pages/game9x9/game9x9'");
  });

  test('所有核心页面具备小屏断点、安全区和可读触控基线', function () {
    var globalCss = read('app.wxss');
    var responsivePages = [
      'pages/home/home.wxss',
      'pages/login/login.wxss',
      'pages/game-common.wxss',
      'pages/pk_lobby/pk_lobby.wxss',
      'pages/pk_game/pk_game.wxss',
      'pages/stats/stats.wxss',
      'pages/ranking/ranking.wxss'
    ];
    expect(globalCss).toContain('min-height:96rpx');
    expect(globalCss).toContain('.root{font-size:28rpx}');
    responsivePages.forEach(function (file) {
      var css = read(file);
      expect(css).toContain('@media (max-width:360px)');
      expect(css).toContain('env(safe-area-inset-bottom)');
    });
    var lobby = read('pages/pk_lobby/pk_lobby.wxss');
    expect(lobby).toContain('.round-control{width:84rpx;height:84rpx');
    expect(lobby).toContain('.opt-btn{min-height:112rpx');
  });

  test('现代机型使用统一的响应式字体、图标和触控尺寸', function () {
    var globalCss = read('app.wxss');
    expect(globalCss).toContain('--font-sm: clamp(');
    expect(globalCss).toContain('--icon-md: clamp(');
    expect(globalCss).toContain('--icon-lg: clamp(');
    expect(globalCss).toContain('--touch-min: 44px');
    [
      'pages/home/home.wxss', 'pages/login/login.wxss', 'pages/game-common.wxss',
      'pages/stats/stats.wxss', 'pages/ranking/ranking.wxss',
      'pages/pk_lobby/pk_lobby.wxss', 'pages/pk_game/pk_game.wxss'
    ].forEach(function (file) {
      var css = read(file);
      expect(css).toContain('max-width:430px');
      expect(css).toContain('var(--page-gutter)');
      expect(css).toMatch(/var\(--font-(xs|sm|md|lg|xl)\)/);
    });
    expect(read('pages/pk_lobby/pk_lobby.wxss')).toContain('repeat(3,minmax(0,1fr))');
  });
});
