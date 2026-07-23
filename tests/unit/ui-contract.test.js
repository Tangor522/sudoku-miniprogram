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
    expect(lobby).toContain('4×4');
    expect(lobby).toContain('6×6');
    expect(lobby).toContain('9×9');
    expect(read('pages/pk_game/pk_game.wxml')).toContain('>提交答案</button>');
  });

  test('新用户可明确选择微信登录或游客体验，并告知游客限制', function () {
    var login = read('pages/login/login.wxml');
    expect(login).toContain('微信登录');
    expect(login).toContain('游客体验');
    expect(login).toContain('各前 3 关');
    expect(read('app.json')).toMatch(/"pages\/login\/login"[\s\S]*"pages\/home\/home"/);
  });
});
