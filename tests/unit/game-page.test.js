const createGamePage = require('../../utils/game-page');

function makePage(mode) {
  var definition = createGamePage({ mode: mode, title: mode });
  var page = Object.assign({}, definition);
  page.data = Object.assign({}, definition.data);
  page.setData = function (next) { Object.assign(this.data, next); };
  page.data.grid = [[{ value: 0, fixed: false, error: false }]];
  page.data.selectedCell = { row: 0, col: 0 };
  page.data.gridRows = page.buildRows(page.data.grid, page.data.selectedCell);
  page.undoHistory = [];
  return page;
}

describe('九宫格回退', function () {
  test('只保留并回退最近 3 次填数', function () {
    var page = makePage('9x9');
    page.setCellValue(1);
    page.setCellValue(2);
    page.setCellValue(3);
    page.setCellValue(4);

    expect(page.undoHistory).toHaveLength(3);
    expect(page.data.undoSteps).toBe(3);

    page.undoMove();
    expect(page.data.grid[0][0].value).toBe(3);
    page.undoMove();
    expect(page.data.grid[0][0].value).toBe(2);
    page.undoMove();
    expect(page.data.grid[0][0].value).toBe(1);
    expect(page.data.canUndo).toBe(false);
    expect(page.data.undoSteps).toBe(0);

    page.undoMove();
    expect(page.data.grid[0][0].value).toBe(1);
  });

  test('四宫格和六宫格不启用回退', function () {
    ['4x4', '6x6'].forEach(function (mode) {
      var page = makePage(mode);
      page.setCellValue(1);
      expect(page.data.undoEnabled).toBe(false);
      expect(page.undoHistory).toHaveLength(0);
      page.undoMove();
      expect(page.data.grid[0][0].value).toBe(1);
    });
  });
});
