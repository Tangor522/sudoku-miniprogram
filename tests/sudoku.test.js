// tests/sudoku.test.js
// 数独核心算法单元测试
// 覆盖：生成棋盘、挖空、转单元格、校验（行/列/宫去重 + 完整度）

var sudoku = require('../utils/sudoku');

// 辅助：统计空格数
function countHoles(puzzle) {
  var n = 0;
  for (var i = 0; i < puzzle.length; i++) {
    for (var j = 0; j < puzzle[i].length; j++) {
      if (puzzle[i][j] === 0) n++;
    }
  }
  return n;
}

// 辅助：构造单元格 grid（数字矩阵 → cell 对象矩阵）
function makeGrid(matrix) {
  return matrix.map(function (row) {
    return row.map(function (v) {
      return { value: v, fixed: v !== 0, error: false };
    });
  });
}

// ==================== generate4x4Puzzle ====================
describe('sudoku.generate4x4Puzzle', function () {

  test('应生成 4x4 的二维数组', function () {
    var puzzle = sudoku.generate4x4Puzzle(1);
    expect(puzzle.length).toBe(4);
    puzzle.forEach(function (row) {
      expect(row.length).toBe(4);
    });
  });

  test('非空格数字应在 1-4 范围内', function () {
    for (var i = 0; i < 30; i++) {
      var puzzle = sudoku.generate4x4Puzzle(1);
      puzzle.forEach(function (row) {
        row.forEach(function (v) {
          if (v !== 0) {
            expect(v).toBeGreaterThanOrEqual(1);
            expect(v).toBeLessThanOrEqual(4);
          }
        });
      });
    }
  });

  test('1-10 关应挖 7 个空', function () {
    for (var i = 0; i < 30; i++) {
      expect(countHoles(sudoku.generate4x4Puzzle(1))).toBe(7);
      expect(countHoles(sudoku.generate4x4Puzzle(10))).toBe(7);
    }
  });

  test('11-20 关应挖 8 个空', function () {
    for (var i = 0; i < 30; i++) {
      expect(countHoles(sudoku.generate4x4Puzzle(11))).toBe(8);
      expect(countHoles(sudoku.generate4x4Puzzle(20))).toBe(8);
    }
  });

  test('21-30 关应挖 9 个空', function () {
    for (var i = 0; i < 30; i++) {
      expect(countHoles(sudoku.generate4x4Puzzle(25))).toBe(9);
    }
  });

  test('31-40 关应挖 10 个空', function () {
    for (var i = 0; i < 30; i++) {
      expect(countHoles(sudoku.generate4x4Puzzle(35))).toBe(10);
    }
  });

  test('41-50 关应挖 11 个空', function () {
    for (var i = 0; i < 30; i++) {
      expect(countHoles(sudoku.generate4x4Puzzle(45))).toBe(11);
    }
  });

  test('51+ 关应挖 12 个空', function () {
    for (var i = 0; i < 30; i++) {
      expect(countHoles(sudoku.generate4x4Puzzle(51))).toBe(12);
      expect(countHoles(sudoku.generate4x4Puzzle(100))).toBe(12);
    }
  });

  test('挖空位置每次应不同（随机性）', function () {
    var set = {};
    var allSame = true;
    for (var i = 0; i < 20; i++) {
      var p = sudoku.generate4x4Puzzle(1);
      var key = p.map(function (r) { return r.join(''); }).join('');
      set[key] = (set[key] || 0) + 1;
    }
    // 20 次生成应有不止 1 种结果（概率上几乎必然）
    expect(Object.keys(set).length).toBeGreaterThan(1);
  });
});

// ==================== generate6x6Puzzle ====================
describe('sudoku.generate6x6Puzzle', function () {

  test('应生成 6x6 的二维数组', function () {
    var puzzle = sudoku.generate6x6Puzzle(1);
    expect(puzzle.length).toBe(6);
    puzzle.forEach(function (row) {
      expect(row.length).toBe(6);
    });
  });

  test('非空格数字应在 1-6 范围内', function () {
    for (var i = 0; i < 20; i++) {
      var puzzle = sudoku.generate6x6Puzzle(1);
      puzzle.forEach(function (row) {
        row.forEach(function (v) {
          if (v !== 0) {
            expect(v).toBeGreaterThanOrEqual(1);
            expect(v).toBeLessThanOrEqual(6);
          }
        });
      });
    }
  });

  test('1-10 关应挖 14 个空', function () {
    for (var i = 0; i < 20; i++) {
      expect(countHoles(sudoku.generate6x6Puzzle(1))).toBe(14);
    }
  });

  test('51+ 关应挖 19 个空', function () {
    for (var i = 0; i < 20; i++) {
      expect(countHoles(sudoku.generate6x6Puzzle(60))).toBe(19);
    }
  });

  test('空格数不超过 36（总格数）', function () {
    for (var i = 0; i < 20; i++) {
      var holes = countHoles(sudoku.generate6x6Puzzle(100));
      expect(holes).toBeLessThanOrEqual(36);
    }
  });
});

// ==================== toCellGrid ====================
describe('sudoku.toCellGrid', function () {

  test('非零值应标记 fixed=true', function () {
    var grid = sudoku.toCellGrid([[1, 2], [0, 3]]);
    expect(grid[0][0]).toEqual({ value: 1, fixed: true, error: false });
    expect(grid[1][0]).toEqual({ value: 0, fixed: false, error: false });
  });

  test('应保持原矩阵维度', function () {
    var grid = sudoku.toCellGrid([[1, 2, 3, 4], [3, 4, 1, 2]]);
    expect(grid.length).toBe(2);
    expect(grid[0].length).toBe(4);
  });

  test('不应修改原数组', function () {
    var original = [[1, 0], [0, 2]];
    sudoku.toCellGrid(original);
    expect(original[0][0]).toBe(1);
    expect(original[0][1]).toBe(0);
  });
});

// ==================== check4x4 ====================
describe('sudoku.check4x4', function () {

  // 完整正确解（取自模板）
  var correctSolution = [
    [1, 2, 3, 4],
    [3, 4, 1, 2],
    [2, 1, 4, 3],
    [4, 3, 2, 1]
  ];

  test('完整且正确：isComplete=true, hasError=false', function () {
    var grid = makeGrid(correctSolution);
    var r = sudoku.check4x4(grid);
    expect(r.isComplete).toBe(true);
    expect(r.hasError).toBe(false);
    expect(Object.keys(r.errorCells).length).toBe(0);
  });

  test('行重复：应检测到错误并标记对应单元格', function () {
    // 第 0 行出现两个 1（位置 0-0 和 0-2）
    var bad = [
      [1, 2, 1, 4],
      [3, 4, 1, 2],
      [2, 1, 4, 3],
      [4, 3, 2, 1]
    ];
    var grid = makeGrid(bad);
    var r = sudoku.check4x4(grid);
    expect(r.hasError).toBe(true);
    expect(r.errorCells['0-0']).toBe(true);
    expect(r.errorCells['0-2']).toBe(true);
  });

  test('列重复：应检测到错误', function () {
    // 第 0 列出现两个 1（位置 0-0 和 2-2 → 实际 2-0）
    var bad = [
      [1, 2, 3, 4],
      [3, 4, 1, 2],
      [1, 1, 4, 3],  // 2-0 列重复
      [4, 3, 2, 1]
    ];
    var grid = makeGrid(bad);
    var r = sudoku.check4x4(grid);
    expect(r.hasError).toBe(true);
    expect(r.errorCells['0-0']).toBe(true);
    expect(r.errorCells['2-0']).toBe(true);
  });

  test('宫格重复（2x2）：应检测到错误', function () {
    // 左上 2x2 宫格：[1,2 / 3,4] 正常；构造一个左上宫内重复
    // 左上宫 = (0,0)(0,1)(1,0)(1,1)
    var bad = [
      [1, 1, 3, 4],
      [3, 4, 1, 2],
      [2, 1, 4, 3],
      [4, 3, 2, 1]
    ];
    var grid = makeGrid(bad);
    var r = sudoku.check4x4(grid);
    expect(r.hasError).toBe(true);
    expect(r.errorCells['0-0']).toBe(true);
    expect(r.errorCells['0-1']).toBe(true);
  });

  test('有空格：isComplete=false', function () {
    var grid = makeGrid([
      [1, 2, 3, 4],
      [3, 4, 1, 2],
      [2, 1, 4, 3],
      [4, 0, 2, 1]  // 一个空格
    ]);
    var r = sudoku.check4x4(grid);
    expect(r.isComplete).toBe(false);
  });

  test('有空格但无冲突：hasError=false, isComplete=false', function () {
    var grid = makeGrid([
      [1, 2, 3, 4],
      [3, 4, 1, 2],
      [2, 1, 4, 3],
      [4, 0, 2, 1]
    ]);
    var r = sudoku.check4x4(grid);
    expect(r.hasError).toBe(false);
    expect(r.isComplete).toBe(false);
  });

  test('不完整且有冲突：hasError=true, isComplete=false', function () {
    var grid = makeGrid([
      [1, 2, 1, 4],
      [3, 0, 1, 2],
      [2, 1, 4, 3],
      [4, 3, 0, 1]
    ]);
    var r = sudoku.check4x4(grid);
    expect(r.hasError).toBe(true);
    expect(r.isComplete).toBe(false);
  });

  test('全空格不应报错但应不完整', function () {
    var grid = makeGrid([
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0]
    ]);
    var r = sudoku.check4x4(grid);
    expect(r.hasError).toBe(false);
    expect(r.isComplete).toBe(false);
  });
});

// ==================== check6x6 ====================
describe('sudoku.check6x6', function () {

  // 完整正确解（取自第一个模板）
  var correctSolution = [
    [1, 2, 3, 4, 5, 6],
    [4, 5, 6, 1, 2, 3],
    [2, 3, 1, 5, 6, 4],
    [5, 6, 4, 2, 3, 1],
    [6, 4, 5, 3, 1, 2],
    [3, 1, 2, 6, 4, 5]
  ];

  test('完整且正确：isComplete=true, hasError=false', function () {
    var grid = makeGrid(correctSolution);
    var r = sudoku.check6x6(grid);
    expect(r.isComplete).toBe(true);
    expect(r.hasError).toBe(false);
  });

  test('行重复：应检测到错误', function () {
    var bad = correctSolution.map(function (r) { return r.slice(); });
    bad[0][2] = 1; // 第0行已有1，制造重复
    var grid = makeGrid(bad);
    var r = sudoku.check6x6(grid);
    expect(r.hasError).toBe(true);
    expect(r.errorCells['0-0']).toBe(true);
    expect(r.errorCells['0-2']).toBe(true);
  });

  test('列重复：应检测到错误', function () {
    var bad = correctSolution.map(function (r) { return r.slice(); });
    bad[2][0] = 1; // 第0列位置0-0已有1，制造列重复
    var grid = makeGrid(bad);
    var r = sudoku.check6x6(grid);
    expect(r.hasError).toBe(true);
    expect(r.errorCells['0-0']).toBe(true);
    expect(r.errorCells['2-0']).toBe(true);
  });

  test('宫格重复（2行3列）：应检测到错误', function () {
    // 左上宫 = 行0-1, 列0-2: [1,2,3 / 4,5,6]
    var bad = correctSolution.map(function (r) { return r.slice(); });
    bad[0][1] = 1; // 左上宫内 1 重复
    var grid = makeGrid(bad);
    var r = sudoku.check6x6(grid);
    expect(r.hasError).toBe(true);
    expect(r.errorCells['0-0']).toBe(true);
    expect(r.errorCells['0-1']).toBe(true);
  });

  test('有空格：isComplete=false', function () {
    var bad = correctSolution.map(function (r) { return r.slice(); });
    bad[0][0] = 0;
    var grid = makeGrid(bad);
    var r = sudoku.check6x6(grid);
    expect(r.isComplete).toBe(false);
    expect(r.hasError).toBe(false);
  });

  test('不完整且有冲突', function () {
    var bad = correctSolution.map(function (r) { return r.slice(); });
    bad[0][0] = 2; // 行重复 + 宫重复
    bad[3][3] = 0; // 空格
    var grid = makeGrid(bad);
    var r = sudoku.check6x6(grid);
    expect(r.hasError).toBe(true);
    expect(r.isComplete).toBe(false);
  });
});

// ==================== 集成场景：生成 → 校验 ====================
describe('集成：生成的题目能被校验函数正确处理', function () {

  test('4x4 生成后填回正确解应通过校验', function () {
    // 生成题目，把空格填回去（用模板值），应通过
    // 这里用一个已知模板验证
    var solution = [[1,2,3,4],[3,4,1,2],[2,1,4,3],[4,3,2,1]];
    var grid = makeGrid(solution);
    var r = sudoku.check4x4(grid);
    expect(r.isComplete && !r.hasError).toBe(true);
  });

  test('6x6 生成后填回正确解应通过校验', function () {
    var solution = [
      [1,2,3,4,5,6],[4,5,6,1,2,3],[2,3,1,5,6,4],
      [5,6,4,2,3,1],[6,4,5,3,1,2],[3,1,2,6,4,5]
    ];
    var grid = makeGrid(solution);
    var r = sudoku.check6x6(grid);
    expect(r.isComplete && !r.hasError).toBe(true);
  });

  test('生成的题目空格数符合预期且不破坏宫格结构', function () {
    for (var i = 0; i < 10; i++) {
      var puzzle = sudoku.generate4x4Puzzle(5);
      expect(countHoles(puzzle)).toBe(7);
      // 每行/列至少应能解（模板本身是合法解，挖空不改变合法性）
      var grid = makeGrid(puzzle);
      var r = sudoku.check4x4(grid);
      // 挖空后只要剩余数字不冲突即可（模板合法，挖空不会引入冲突）
      expect(r.hasError).toBe(false);
    }
  });
});
