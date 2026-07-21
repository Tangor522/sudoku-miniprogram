// cloudfunctions/pkSubmit/sudoku.js - 校验函数（复制自 utils/sudoku.js）
function check4x4(grid) {
  var errorCells = {}; var hasError = false;
  for (var row = 0; row < 4; row++) { var seen = {};
    for (var col = 0; col < 4; col++) { var v = grid[row][col].value; if (v === 0) continue;
      if (seen[v] !== undefined) { errorCells[row+'-'+col]=true; errorCells[row+'-'+seen[v]]=true; hasError=true; } seen[v]=col; } }
  for (var col2 = 0; col2 < 4; col2++) { var seen2 = {};
    for (var row2 = 0; row2 < 4; row2++) { var v2 = grid[row2][col2].value; if (v2 === 0) continue;
      if (seen2[v2] !== undefined) { errorCells[row2+'-'+col2]=true; errorCells[seen2[v2]+'-'+col2]=true; hasError=true; } seen2[v2]=row2; } }
  for (var boxRow = 0; boxRow < 2; boxRow++) { for (var boxCol = 0; boxCol < 2; boxCol++) { var seen3 = {};
    for (var r = 0; r < 2; r++) { for (var c = 0; c < 2; c++) { var rr=boxRow*2+r, cc=boxCol*2+c, vv=grid[rr][cc].value; if (vv===0) continue;
      if (seen3[vv] !== undefined) { errorCells[rr+'-'+cc]=true; errorCells[seen3[vv].row+'-'+seen3[vv].col]=true; hasError=true; } seen3[vv]={row:rr,col:cc}; } } } }
  var isComplete = true;
  for (var r2 = 0; r2 < 4; r2++) { for (var c2 = 0; c2 < 4; c2++) { if (grid[r2][c2].value === 0) { isComplete = false; break; } } if (!isComplete) break; }
  return { hasError: hasError, errorCells: errorCells, isComplete: isComplete };
}

function check6x6(grid) {
  var errorCells = {}; var hasError = false;
  for (var row = 0; row < 6; row++) { var seen = {};
    for (var col = 0; col < 6; col++) { var v = grid[row][col].value; if (v === 0) continue;
      if (seen[v] !== undefined) { errorCells[row+'-'+col]=true; errorCells[row+'-'+seen[v]]=true; hasError=true; } seen[v]=col; } }
  for (var col2 = 0; col2 < 6; col2++) { var seen2 = {};
    for (var row2 = 0; row2 < 6; row2++) { var v2 = grid[row2][col2].value; if (v2 === 0) continue;
      if (seen2[v2] !== undefined) { errorCells[row2+'-'+col2]=true; errorCells[seen2[v2]+'-'+col2]=true; hasError=true; } seen2[v2]=row2; } }
  for (var boxRow = 0; boxRow < 3; boxRow++) { for (var boxCol = 0; boxCol < 2; boxCol++) { var seen3 = {};
    for (var r = 0; r < 2; r++) { for (var c = 0; c < 3; c++) { var rr=boxRow*2+r, cc=boxCol*3+c, vv=grid[rr][cc].value; if (vv===0) continue;
      if (seen3[vv] !== undefined) { errorCells[rr+'-'+cc]=true; errorCells[seen3[vv].row+'-'+seen3[vv].col]=true; hasError=true; } seen3[vv]={row:rr,col:cc}; } } } }
  var isComplete = true;
  for (var r2 = 0; r2 < 6; r2++) { for (var c2 = 0; c2 < 6; c2++) { if (grid[r2][c2].value === 0) { isComplete = false; break; } } if (!isComplete) break; }
  return { hasError: hasError, errorCells: errorCells, isComplete: isComplete };
}

module.exports = { check4x4: check4x4, check6x6: check6x6 };
