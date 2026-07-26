// cloudfunctions/pkMatch/sudoku.js - 数独算法（复制自 utils/sudoku.js）
var solutionTemplates4x4 = [
  [[1,2,3,4],[3,4,1,2],[2,1,4,3],[4,3,2,1]],
  [[2,1,4,3],[4,3,2,1],[1,2,3,4],[3,4,1,2]],
  [[3,4,1,2],[1,2,3,4],[4,3,2,1],[2,1,4,3]],
  [[4,3,2,1],[2,1,4,3],[3,4,1,2],[1,2,3,4]],
  [[1,3,4,2],[4,2,1,3],[2,4,3,1],[3,1,2,4]],
  [[2,4,1,3],[3,1,4,2],[4,2,3,1],[1,3,2,4]]
];
var solutionTemplates6x6 = [
  [[1,2,3,4,5,6],[4,5,6,1,2,3],[2,3,1,5,6,4],[5,6,4,2,3,1],[6,4,5,3,1,2],[3,1,2,6,4,5]],
  [[2,1,4,3,6,5],[3,6,5,2,1,4],[1,4,2,5,3,6],[5,3,6,1,4,2],[4,2,1,6,5,3],[6,5,3,4,2,1]],
  [[4,5,6,1,2,3],[1,2,3,4,5,6],[2,3,1,5,6,4],[5,6,4,2,3,1],[6,4,5,3,1,2],[3,1,2,6,4,5]],
  [[3,6,5,2,1,4],[2,1,4,3,6,5],[5,3,6,1,4,2],[1,4,2,5,3,6],[6,5,3,4,2,1],[4,2,1,6,5,3]],
  [[3,1,2,6,4,5],[6,4,5,3,1,2],[1,2,3,4,5,6],[4,5,6,1,2,3],[5,6,4,2,3,1],[2,3,1,5,6,4]]
];

function copyGrid(grid) {
  return grid.map(function (row) { return row.slice(); });
}

function canPlace(grid, row, col, value, size, boxRows, boxCols) {
  for (var i = 0; i < size; i++) {
    if (grid[row][i] === value || grid[i][col] === value) return false;
  }
  var startRow = Math.floor(row / boxRows) * boxRows;
  var startCol = Math.floor(col / boxCols) * boxCols;
  for (var r = 0; r < boxRows; r++) {
    for (var c = 0; c < boxCols; c++) {
      if (grid[startRow + r][startCol + c] === value) return false;
    }
  }
  return true;
}

function findEmpty(grid) {
  for (var r = 0; r < grid.length; r++) {
    for (var c = 0; c < grid.length; c++) if (grid[r][c] === 0) return { row: r, col: c };
  }
  return null;
}

function countSolutions(grid, size, boxRows, boxCols, limit) {
  var empty = findEmpty(grid);
  if (!empty) return 1;
  var count = 0;
  for (var value = 1; value <= size; value++) {
    if (!canPlace(grid, empty.row, empty.col, value, size, boxRows, boxCols)) continue;
    grid[empty.row][empty.col] = value;
    count += countSolutions(grid, size, boxRows, boxCols, limit);
    grid[empty.row][empty.col] = 0;
    if (count >= limit) return count;
  }
  return count;
}

function carveUnique(solution, holes, boxRows, boxCols) {
  var puzzle = copyGrid(solution);
  var positions = [];
  for (var i = 0; i < puzzle.length * puzzle.length; i++) positions.push(i);
  positions = shuffled(positions);
  var removed = 0;
  for (var p = 0; p < positions.length && removed < holes; p++) {
    var row = Math.floor(positions[p] / puzzle.length);
    var col = positions[p] % puzzle.length;
    var old = puzzle[row][col];
    puzzle[row][col] = 0;
    if (countSolutions(copyGrid(puzzle), puzzle.length, boxRows, boxCols, 2) === 1) removed++;
    else puzzle[row][col] = old;
  }
  return removed === holes ? puzzle : null;
}

function generate4x4Puzzle(level) {
  for (var attempt = 0; attempt < 24; attempt++) {
    var base = solutionTemplates4x4[Math.floor(Math.random() * solutionTemplates4x4.length)];
    var puzzle = carveUnique(base, 8, 2, 2);
    if (puzzle) return puzzle;
  }
  throw new Error('4x4 唯一解题目生成失败');
}

function generate6x6Puzzle(level) {
  for (var attempt = 0; attempt < 24; attempt++) {
    var base = solutionTemplates6x6[Math.floor(Math.random() * solutionTemplates6x6.length)];
    var puzzle = carveUnique(base, 15, 2, 3);
    if (puzzle) return puzzle;
  }
  throw new Error('6x6 唯一解题目生成失败');
}

function shuffled(values) {
  var result = values.slice();
  for (var i = result.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var tmp = result[i]; result[i] = result[j]; result[j] = tmp;
  }
  return result;
}

function canPlace9(grid, row, col, value) {
  for (var i = 0; i < 9; i++) if (grid[row][i] === value || grid[i][col] === value) return false;
  var startRow = Math.floor(row / 3) * 3;
  var startCol = Math.floor(col / 3) * 3;
  for (var r = 0; r < 3; r++) for (var c = 0; c < 3; c++) if (grid[startRow + r][startCol + c] === value) return false;
  return true;
}

function countSolutions9(grid, limit) {
  var empty = null;
  for (var r = 0; r < 9 && !empty; r++) for (var c = 0; c < 9; c++) if (grid[r][c] === 0) { empty = { row: r, col: c }; break; }
  if (!empty) return 1;
  var count = 0;
  for (var value = 1; value <= 9; value++) {
    if (!canPlace9(grid, empty.row, empty.col, value)) continue;
    grid[empty.row][empty.col] = value;
    count += countSolutions9(grid, limit);
    grid[empty.row][empty.col] = 0;
    if (count >= limit) return count;
  }
  return count;
}

function generate9x9Puzzle() {
  // 先生成完整合法终盘，再随机挖空。双方共用同一题，保证 PK 公平。
  var base = 3;
  var side = 9;
  var pattern = function (r, c) { return (base * (r % base) + Math.floor(r / base) + c) % side; };
  var rowGroups = shuffled([0, 1, 2]);
  var colGroups = shuffled([0, 1, 2]);
  var rows = [];
  var cols = [];
  rowGroups.forEach(function (g) { shuffled([0, 1, 2]).forEach(function (r) { rows.push(g * base + r); }); });
  colGroups.forEach(function (g) { shuffled([0, 1, 2]).forEach(function (c) { cols.push(g * base + c); }); });
  var nums = shuffled([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  var puzzle = rows.map(function (r) {
    return cols.map(function (c) { return nums[pattern(r, c)]; });
  });
  var positions = [];
  for (var p = 0; p < 81; p++) positions.push(p);
  var cells = shuffled(positions);
  var removed = 0;
  for (var i = 0; i < cells.length && removed < 42; i++) {
    var row = Math.floor(cells[i] / 9);
    var col = cells[i] % 9;
    var old = puzzle[row][col];
    puzzle[row][col] = 0;
    var copy = puzzle.map(function (line) { return line.slice(); });
    if (countSolutions9(copy, 2) === 1) removed++;
    else puzzle[row][col] = old;
  }
  return puzzle;
}

function solvePuzzle(puzzle, mode) {
  var cfg = { '4x4': [4, 2, 2], '6x6': [6, 2, 3], '9x9': [9, 3, 3] }[mode];
  if (!cfg) return null;
  var solved = copyGrid(puzzle);
  function solve() {
    var empty = findEmpty(solved);
    if (!empty) return true;
    for (var value = 1; value <= cfg[0]; value++) {
      if (!canPlace(solved, empty.row, empty.col, value, cfg[0], cfg[1], cfg[2])) continue;
      solved[empty.row][empty.col] = value;
      if (solve()) return true;
      solved[empty.row][empty.col] = 0;
    }
    return false;
  }
  return solve() ? solved : null;
}

module.exports = {
  generate4x4Puzzle: generate4x4Puzzle,
  generate6x6Puzzle: generate6x6Puzzle,
  generate9x9Puzzle: generate9x9Puzzle,
  solvePuzzle: solvePuzzle,
  countSolutions: function (puzzle, mode, limit) {
    var cfg = { '4x4': [4, 2, 2], '6x6': [6, 2, 3], '9x9': [9, 3, 3] }[mode];
    return cfg ? countSolutions(copyGrid(puzzle), cfg[0], cfg[1], cfg[2], limit || 2) : 0;
  }
};
