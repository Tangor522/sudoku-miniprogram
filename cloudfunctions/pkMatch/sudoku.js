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

function generate4x4Puzzle(level) {
  var base = solutionTemplates4x4[Math.floor(Math.random() * 6)];
  var puzzle = base.map(function (r) { return r.slice(); });
  var holes = 8;
  var marked = {}; var count = 0;
  while (count < holes) {
    var row = Math.floor(Math.random() * 4);
    var col = Math.floor(Math.random() * 4);
    var key = row + '-' + col;
    if (puzzle[row][col] !== 0 && !marked[key]) { puzzle[row][col] = 0; marked[key] = true; count++; }
  }
  return puzzle;
}

function generate6x6Puzzle(level) {
  var base = solutionTemplates6x6[Math.floor(Math.random() * 5)];
  var puzzle = base.map(function (r) { return r.slice(); });
  var holes = 15;
  var marked = {}; var count = 0; var attempts = 0;
  while (count < holes && attempts < 500) {
    var row = Math.floor(Math.random() * 6);
    var col = Math.floor(Math.random() * 6);
    var key = row + '-' + col;
    if (puzzle[row][col] !== 0 && !marked[key]) { puzzle[row][col] = 0; marked[key] = true; count++; }
    attempts++;
  }
  return puzzle;
}

module.exports = {
  generate4x4Puzzle: generate4x4Puzzle,
  generate6x6Puzzle: generate6x6Puzzle
};
