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
    var app = { globalData: { cloudReady: false, user: null } };
    global.wx = {
      showToast: jest.fn(),
      redirectTo: jest.fn(),
      getStorageSync: jest.fn(function () { return null; }),
      setStorageSync: jest.fn()
    };
    global.getApp = function () { return app; };
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

  test('游客完成第 3 关后要求登录，不直接进入第 4 关', function () {
    var page = makePage(cells(SOL4, {}));
    page.data.currentLevel = 3;
    page.data.showResult = true;
    page.nextLevel();
    expect(page.data.currentLevel).toBe(3);
    expect(wx.redirectTo).toHaveBeenCalledWith({
      url: '/pages/login/login?from=game4x4'
    });
  });

  test('已登录用户完成第 3 关后可以进入第 4 关', function () {
    getApp().globalData.user = { openid: 'logged-in' };
    var page = makePage(cells(SOL4, {}));
    page.data.currentLevel = 3;
    page.startGame = jest.fn();
    page.timer = { start: jest.fn() };
    page.nextLevel();
    expect(page.data.currentLevel).toBe(4);
    expect(page.startGame).toHaveBeenCalled();
    expect(wx.redirectTo).not.toHaveBeenCalled();
  });

  test('退回只保留最近操作的 3 个不同位置，同一位置多次改数只回退一次', function () {
    var grid = cells(SOL4, { '0-0': true, '0-1': true, '0-2': true, '0-3': true });
    grid[0].forEach(function (cell) { cell.value = 0; });
    var page = makePage(grid);
    page.data.gameStarted = true;
    page.data.selectedCell = { row: 0, col: 0 };
    page.setCellValue(1);
    page.setCellValue(2);
    expect(page.undoHistory).toHaveLength(1);
    page.data.selectedCell = { row: 0, col: 1 };
    page.setCellValue(2);
    page.data.selectedCell = { row: 0, col: 2 };
    page.setCellValue(3);
    page.data.selectedCell = { row: 0, col: 3 };
    page.setCellValue(4);
    expect(page.undoHistory).toHaveLength(3);
    page.undoLast();
    expect(page.data.grid[0][3].value).toBe(0);
    page.undoLast();
    expect(page.data.grid[0][2].value).toBe(0);
    page.undoLast();
    expect(page.data.grid[0][1].value).toBe(0);
    page.undoLast();
    expect(page.data.grid[0][0].value).toBe(2);
    expect(page.data.canUndo).toBe(false);
  });

  test('再次操作已有位置会更新最近顺序，但仍恢复第一次修改前的值', function () {
    var grid = cells(SOL4, { '0-0': true, '0-1': true });
    grid[0][0].value = 0;
    grid[0][1].value = 0;
    var page = makePage(grid);
    page.data.gameStarted = true;
    page.data.selectedCell = { row: 0, col: 0 };
    page.setCellValue(1);
    page.data.selectedCell = { row: 0, col: 1 };
    page.setCellValue(2);
    page.data.selectedCell = { row: 0, col: 0 };
    page.setCellValue(3);
    expect(page.undoHistory).toHaveLength(2);
    page.undoLast();
    expect(page.data.grid[0][0].value).toBe(0);
    page.undoLast();
    expect(page.data.grid[0][1].value).toBe(0);
  });

  test('重复填相同数字不占用退回次数，退回会清除错误标记', function () {
    var grid = cells(SOL4, { '0-0': true, '0-1': true });
    grid[0][0].value = 0;
    grid[0][1].error = true;
    var page = makePage(grid);
    page.data.gameStarted = true;
    page.data.selectedCell = { row: 0, col: 0 };
    page.setCellValue(2);
    page.setCellValue(2);
    expect(page.undoHistory).toHaveLength(1);
    page.undoLast();
    expect(page.data.grid[0][0].value).toBe(0);
    expect(page.data.grid[0][1].error).toBe(false);
  });

  test('进入新关卡后不能退回上一关的操作', function () {
    var page = makePage(cells(SOL4, {}));
    page.undoHistory = [{ row: 0, col: 0, value: 0 }];
    page.data.canUndo = true;
    page.timer = { stop: jest.fn() };
    page.startGame();
    expect(page.undoHistory).toEqual([]);
    expect(page.data.canUndo).toBe(false);
  });
});
