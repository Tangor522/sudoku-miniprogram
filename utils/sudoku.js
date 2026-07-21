// 通用数独引擎：支持 4x4（2x2）、6x6（2x3）和 9x9（3x3）

var MODES = {
  '4x4': { size: 4, boxRows: 2, boxCols: 2, holes: [7, 8, 9, 10, 11, 12] },
  '6x6': { size: 6, boxRows: 2, boxCols: 3, holes: [14, 15, 16, 17, 18, 19] },
  '9x9': { size: 9, boxRows: 3, boxCols: 3, holes: [34, 38, 42, 46, 50, 54] }
};

function copyGrid(grid) {
  return grid.map(function (row) { return row.slice(); });
}

function shuffledNumbers(size) {
  var arr = [];
  for (var i = 1; i <= size; i++) arr.push(i);
  for (var j = arr.length - 1; j > 0; j--) {
    var k = Math.floor(Math.random() * (j + 1));
    var temp = arr[j]; arr[j] = arr[k]; arr[k] = temp;
  }
  return arr;
}

function isAllowed(grid, row, col, value, cfg) {
  var i;
  for (i = 0; i < cfg.size; i++) {
    if (grid[row][i] === value || grid[i][col] === value) return false;
  }
  var startRow = Math.floor(row / cfg.boxRows) * cfg.boxRows;
  var startCol = Math.floor(col / cfg.boxCols) * cfg.boxCols;
  for (var r = 0; r < cfg.boxRows; r++) {
    for (var c = 0; c < cfg.boxCols; c++) {
      if (grid[startRow + r][startCol + c] === value) return false;
    }
  }
  return true;
}

function findEmpty(grid) {
  for (var r = 0; r < grid.length; r++) {
    for (var c = 0; c < grid[r].length; c++) {
      if (grid[r][c] === 0) return { row: r, col: c };
    }
  }
  return null;
}

function fillGrid(grid, cfg, randomize) {
  var empty = findEmpty(grid);
  if (!empty) return true;
  var nums = randomize ? shuffledNumbers(cfg.size) : shuffledNumbers(cfg.size).sort(function (a, b) { return a - b; });
  for (var i = 0; i < nums.length; i++) {
    var value = nums[i];
    if (isAllowed(grid, empty.row, empty.col, value, cfg)) {
      grid[empty.row][empty.col] = value;
      if (fillGrid(grid, cfg, randomize)) return true;
      grid[empty.row][empty.col] = 0;
    }
  }
  return false;
}

function countSolutions(grid, cfg, limit) {
  var empty = findEmpty(grid);
  if (!empty) return 1;
  var count = 0;
  for (var value = 1; value <= cfg.size; value++) {
    if (isAllowed(grid, empty.row, empty.col, value, cfg)) {
      grid[empty.row][empty.col] = value;
      count += countSolutions(grid, cfg, limit);
      grid[empty.row][empty.col] = 0;
      if (count >= limit) return count;
    }
  }
  return count;
}

function levelBand(level) {
  if (level <= 10) return 0;
  if (level <= 20) return 1;
  if (level <= 30) return 2;
  if (level <= 40) return 3;
  if (level <= 50) return 4;
  return 5;
}

function generatePuzzle(mode, level, retry) {
  var cfg = MODES[mode];
  if (!cfg) throw new Error('不支持的数独模式: ' + mode);
  var solution = [];
  for (var r = 0; r < cfg.size; r++) {
    var emptyRow = [];
    for (var z = 0; z < cfg.size; z++) emptyRow.push(0);
    solution.push(emptyRow);
  }
  fillGrid(solution, cfg, true);

  var puzzle = copyGrid(solution);
  var cells = [];
  for (var rr = 0; rr < cfg.size; rr++) {
    for (var cc = 0; cc < cfg.size; cc++) cells.push({ row: rr, col: cc });
  }
  for (var x = cells.length - 1; x > 0; x--) {
    var y = Math.floor(Math.random() * (x + 1));
    var swap = cells[x]; cells[x] = cells[y]; cells[y] = swap;
  }

  var target = cfg.holes[levelBand(level || 1)];
  var removed = 0;
  for (var i = 0; i < cells.length && removed < target; i++) {
    var cell = cells[i];
    var old = puzzle[cell.row][cell.col];
    puzzle[cell.row][cell.col] = 0;
    if (countSolutions(copyGrid(puzzle), cfg, 2) === 1) removed++;
    else puzzle[cell.row][cell.col] = old;
  }
  // 小盘面在某些挖空顺序下会提前卡住；换一张终盘重试，保证关卡梯度稳定。
  if (removed < target && (retry || 0) < 16) return generatePuzzle(mode, level, (retry || 0) + 1);
  return { puzzle: puzzle, solution: solution };
}

function solvePuzzle(puzzle, mode) {
  var cfg = MODES[mode];
  if (!cfg) return null;
  var solved = copyGrid(puzzle);
  return fillGrid(solved, cfg, false) ? solved : null;
}

function toCellGrid(puzzle) {
  return puzzle.map(function (row) {
    return row.map(function (value) {
      return { value: value, fixed: value !== 0, error: false };
    });
  });
}

function checkGrid(grid, mode) {
  var cfg = MODES[mode];
  if (!cfg) throw new Error('不支持的数独模式: ' + mode);
  var errors = {};
  var complete = true;

  function markDuplicates(items) {
    var seen = {};
    items.forEach(function (item) {
      var value = grid[item.row][item.col].value;
      if (!value) { complete = false; return; }
      if (value < 1 || value > cfg.size) errors[item.row + '-' + item.col] = true;
      if (seen[value]) {
        errors[item.row + '-' + item.col] = true;
        errors[seen[value].row + '-' + seen[value].col] = true;
      } else seen[value] = item;
    });
  }

  var r, c, items;
  for (r = 0; r < cfg.size; r++) {
    items = [];
    for (c = 0; c < cfg.size; c++) items.push({ row: r, col: c });
    markDuplicates(items);
  }
  for (c = 0; c < cfg.size; c++) {
    items = [];
    for (r = 0; r < cfg.size; r++) items.push({ row: r, col: c });
    markDuplicates(items);
  }
  for (var br = 0; br < cfg.size; br += cfg.boxRows) {
    for (var bc = 0; bc < cfg.size; bc += cfg.boxCols) {
      items = [];
      for (r = 0; r < cfg.boxRows; r++) {
        for (c = 0; c < cfg.boxCols; c++) items.push({ row: br + r, col: bc + c });
      }
      markDuplicates(items);
    }
  }
  return { hasError: Object.keys(errors).length > 0, errorCells: errors, isComplete: complete };
}

function legacyPuzzle(mode, level) { return generatePuzzle(mode, level).puzzle; }

module.exports = {
  MODES: MODES,
  generatePuzzle: generatePuzzle,
  generate4x4Puzzle: function (level) { return legacyPuzzle('4x4', level); },
  generate6x6Puzzle: function (level) { return legacyPuzzle('6x6', level); },
  generate9x9Puzzle: function (level) { return legacyPuzzle('9x9', level); },
  solvePuzzle: solvePuzzle,
  countSolutions: function (puzzle, mode, limit) { return countSolutions(copyGrid(puzzle), MODES[mode], limit || 2); },
  toCellGrid: toCellGrid,
  checkGrid: checkGrid,
  check4x4: function (grid) { return checkGrid(grid, '4x4'); },
  check6x6: function (grid) { return checkGrid(grid, '6x6'); },
  check9x9: function (grid) { return checkGrid(grid, '9x9'); }
};
