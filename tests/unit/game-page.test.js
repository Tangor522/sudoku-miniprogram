var createGamePage = require('../../utils/game-page');

var SOL4 = [[1,2,3,4],[3,4,1,2],[2,1,4,3],[4,3,2,1]];

function cells(values, editable) {
  return values.map(function (row, r) {
    return row.map(function (value, c) {
      return { value: value, fixed: !(editable && editable[r + '-' + c]), error: false };
    });
  });
}

function makePage(grid) {
  var page = createGamePage({ mode: '4x4', title: '四宫格' });
  page.data.grid = grid;
  page.data.solution = SOL4;
  page.data.selectedCell = null;
  page.data.showResult = false;
  page.data.resultStatus = null;
  page.data.currentLevel = 1;
  page.timer = { pause: jest.fn(), get: jest.fn(function () { return 1000; }) };
  page.setData = function (updates) {
    for (var key in updates) this.data[key] = updates[key];
  };
  return page;
}

describe('单人模式提交校验', function () {
  beforeEach(function () {
    global.wx = {
      showToast: jest.fn(),
      getStorageSync: jest.fn(function () { return null; }),
      setStorageSync: jest.fn()
    };
    global.getApp = function () { return { globalData: { cloudReady: false } }; };
  });

  test('未填写完整时只提示，不标错也不弹结果', function () {
    var incomplete = SOL4.map(function (row) { return row.slice(); });
    incomplete[0][1] = 0;
    var page = makePage(cells(incomplete, { '0-1': true }));
    page.checkAnswer();
    expect(wx.showToast).toHaveBeenCalledWith({ title: '请先填写完整', icon: 'none' });
    expect(page.data.showResult).toBe(false);
    expect(page.data.grid[0][1].error).toBe(false);
  });

  test('按唯一正解只标记真正填错的一格，不扩大标记冲突格', function () {
    var wrong = SOL4.map(function (row) { return row.slice(); });
    wrong[3][2] = 4;
    var editable = { '0-0': true, '1-0': true, '1-2': true, '1-3': true, '2-1': true, '3-0': true, '3-2': true };
    var page = makePage(cells(wrong, editable));
    page.checkAnswer();
    expect(page.data.showResult).toBe(false);
    expect(page.data.grid[3][2].error).toBe(true);
    expect(page.data.grid[3][0].error).toBe(false);
    expect(page.data.grid[1][2].error).toBe(false);
    expect(page.data.grid.reduce(function (count, row) {
      return count + row.filter(function (cell) { return cell.error; }).length;
    }, 0)).toBe(1);
    expect(wx.showToast).not.toHaveBeenCalled();
  });

  test('游客完成第3关后必须登录，不能进入第4关', function () {
    var modalOptions;
    wx.getStorageSync = jest.fn(function (key) { return key === 'authMode' ? 'guest' : null; });
    wx.showModal = jest.fn(function (options) { modalOptions = options; });
    wx.redirectTo = jest.fn();
    var page = makePage(cells(SOL4));
    page.data.currentLevel = 3;
    page.data.showResult = true;
    page.nextLevel();
    expect(wx.showModal).toHaveBeenCalled();
    expect(page.data.currentLevel).toBe(3);
    modalOptions.success({ confirm: true });
    expect(wx.redirectTo).toHaveBeenCalledWith({ url: '/pages/login/login?from=guest-limit' });
  });
});
