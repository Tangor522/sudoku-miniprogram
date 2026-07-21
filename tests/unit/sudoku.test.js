// tests/unit/sudoku.test.js
// 白盒：数独核心算法（生成器难度梯度、合法性、校验器正确性、边界值）

const sudoku = require('../../utils/sudoku');
const SOL4 = [[1, 2, 3, 4], [3, 4, 1, 2], [2, 1, 4, 3], [4, 3, 2, 1]];
const SOL6 = [[1, 2, 3, 4, 5, 6], [4, 5, 6, 1, 2, 3], [2, 3, 1, 5, 6, 4], [5, 6, 4, 2, 3, 1], [6, 4, 5, 3, 1, 2], [3, 1, 2, 6, 4, 5]];
const SOL9 = [[1,2,3,4,5,6,7,8,9],[4,5,6,7,8,9,1,2,3],[7,8,9,1,2,3,4,5,6],[2,3,4,5,6,7,8,9,1],[5,6,7,8,9,1,2,3,4],[8,9,1,2,3,4,5,6,7],[3,4,5,6,7,8,9,1,2],[6,7,8,9,1,2,3,4,5],[9,1,2,3,4,5,6,7,8]];

function countHoles(grid) {
  var n = 0;
  for (var r = 0; r < grid.length; r++) for (var c = 0; c < grid[r].length; c++) if (grid[r][c] === 0) n++;
  return n;
}
function noDup(arr) {
  var seen = {};
  for (var i = 0; i < arr.length; i++) {
    var v = arr[i];
    if (v === 0) continue;
    if (seen[v]) return false;
    seen[v] = true;
  }
  return true;
}
function partialValid(grid, boxRows, boxCols) {
  for (var r = 0; r < grid.length; r++) if (!noDup(grid[r])) return false;
  for (var c = 0; c < grid[0].length; c++) {
    var col = [];
    for (var r2 = 0; r2 < grid.length; r2++) col.push(grid[r2][c]);
    if (!noDup(col)) return false;
  }
  for (var br = 0; br < grid.length / boxRows; br++) {
    for (var bc = 0; bc < grid[0].length / boxCols; bc++) {
      var box = [];
      for (var rr = 0; rr < boxRows; rr++) for (var cc = 0; cc < boxCols; cc++) box.push(grid[br * boxRows + rr][bc * boxCols + cc]);
      if (!noDup(box)) return false;
    }
  }
  return true;
}

describe('utils/sudoku 生成器', function () {
  test('4x4 各关卡梯度空格数正确', function () {
    expect(countHoles(sudoku.generate4x4Puzzle(1))).toBe(7);
    expect(countHoles(sudoku.generate4x4Puzzle(10))).toBe(7);
    expect(countHoles(sudoku.generate4x4Puzzle(11))).toBe(8);
    expect(countHoles(sudoku.generate4x4Puzzle(50))).toBe(11);
    expect(countHoles(sudoku.generate4x4Puzzle(999))).toBe(12);
  });

  test('6x6 各关卡梯度空格数正确', function () {
    expect(countHoles(sudoku.generate6x6Puzzle(1))).toBe(14);
    expect(countHoles(sudoku.generate6x6Puzzle(20))).toBe(15);
    expect(countHoles(sudoku.generate6x6Puzzle(30))).toBe(16);
    expect(countHoles(sudoku.generate6x6Puzzle(40))).toBe(17);
    expect(countHoles(sudoku.generate6x6Puzzle(50))).toBe(18);
    expect(countHoles(sudoku.generate6x6Puzzle(999))).toBe(19);
  });

  test('生成的题目均为合法残局（行/列/宫无非空格重复）', function () {
    for (var i = 0; i < 30; i++) {
      expect(partialValid(sudoku.generate4x4Puzzle(1), 2, 2)).toBe(true);
      expect(partialValid(sudoku.generate6x6Puzzle(1), 2, 3)).toBe(true);
    }
  });

  test('生成网格尺寸正确', function () {
    expect(sudoku.generate4x4Puzzle(1).length).toBe(4);
    expect(sudoku.generate6x6Puzzle(1).length).toBe(6);
    expect(sudoku.generate9x9Puzzle(1).length).toBe(9);
  });

  test('9x9 题目有唯一解且难度梯度正确', function () {
    var easy = sudoku.generate9x9Puzzle(1);
    var hard = sudoku.generate9x9Puzzle(60);
    expect(countHoles(easy)).toBe(34);
    expect(countHoles(hard)).toBe(54);
    expect(partialValid(easy, 3, 3)).toBe(true);
    expect(sudoku.countSolutions(easy, '9x9', 2)).toBe(1);
  });

  test('toCellGrid 正确标记 fixed（非空格为固定）', function () {
    var grid = sudoku.toCellGrid([[1, 0], [0, 2]]);
    expect(grid[0][0].value).toBe(1);
    expect(grid[0][0].fixed).toBe(true);
    expect(grid[0][1].value).toBe(0);
    expect(grid[0][1].fixed).toBe(false);
  });
});

describe('utils/sudoku 校验器', function () {
  describe('check4x4', function () {
    test('完整合法解 → 通过', function () {
      var r = sudoku.check4x4(SOL4.map(function (row) { return row.map(function (v) { return { value: v, fixed: v !== 0, error: false }; }); }));
      expect(r.isComplete).toBe(true);
      expect(r.hasError).toBe(false);
      expect(Object.keys(r.errorCells).length).toBe(0);
    });
    test('行内重复 → 报错并标记相关格', function () {
      var g = SOL4.map(function (row) { return row.slice(); });
      g[0][1] = 1; // 与 (0,0)=1 同行重复
      var cell = g.map(function (row) { return row.map(function (v) { return { value: v, fixed: v !== 0, error: false }; }); });
      var r = sudoku.check4x4(cell);
      expect(r.hasError).toBe(true);
      expect(r.errorCells['0-0']).toBe(true);
      expect(r.errorCells['0-1']).toBe(true);
    });
    test('列内重复 → 报错', function () {
      var g = SOL4.map(function (row) { return row.slice(); });
      g[1][0] = 1; // 与 (0,0)=1 同列重复
      var cell = g.map(function (row) { return row.map(function (v) { return { value: v, fixed: v !== 0, error: false }; }); });
      expect(sudoku.check4x4(cell).hasError).toBe(true);
    });
    test('宫内重复 → 报错', function () {
      var g = SOL4.map(function (row) { return row.slice(); });
      g[1][1] = 1; // 与 (0,0)=1 同 2x2 宫
      var cell = g.map(function (row) { return row.map(function (v) { return { value: v, fixed: v !== 0, error: false }; }); });
      expect(sudoku.check4x4(cell).hasError).toBe(true);
    });
    test('未完成（存在空格）→ isComplete=false 且 hasError=false', function () {
      var g = SOL4.map(function (row) { return row.slice(); });
      g[3][3] = 0;
      var cell = g.map(function (row) { return row.map(function (v) { return { value: v, fixed: v !== 0, error: false }; }); });
      var r = sudoku.check4x4(cell);
      expect(r.isComplete).toBe(false);
      expect(r.hasError).toBe(false);
    });
  });

  describe('check6x6', function () {
    test('完整合法解 → 通过', function () {
      var cell = SOL6.map(function (row) { return row.map(function (v) { return { value: v, fixed: v !== 0, error: false }; }); });
      var r = sudoku.check6x6(cell);
      expect(r.isComplete).toBe(true);
      expect(r.hasError).toBe(false);
    });
    test('宫内重复（2行3列）→ 报错', function () {
      var g = SOL6.map(function (row) { return row.slice(); });
      g[1][1] = 1; // 与 (0,0)=1 同宫
      var cell = g.map(function (row) { return row.map(function (v) { return { value: v, fixed: v !== 0, error: false }; }); });
      expect(sudoku.check6x6(cell).hasError).toBe(true);
    });
    test('未完成 → isComplete=false', function () {
      var g = SOL6.map(function (row) { return row.slice(); });
      g[5][5] = 0;
      var cell = g.map(function (row) { return row.map(function (v) { return { value: v, fixed: v !== 0, error: false }; }); });
      expect(sudoku.check6x6(cell).isComplete).toBe(false);
    });
  });

  describe('check9x9', function () {
    test('完整合法解通过，重复数字被标记', function () {
      var cells = SOL9.map(function (row) { return row.map(function (v) { return { value: v, fixed: true, error: false }; }); });
      expect(sudoku.check9x9(cells).hasError).toBe(false);
      cells[0][1].value = 1;
      expect(sudoku.check9x9(cells).errorCells['0-1']).toBe(true);
    });
  });
});
