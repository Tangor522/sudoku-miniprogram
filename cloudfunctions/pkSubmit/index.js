// cloudfunctions/pkSubmit/index.js - 提交每局结果 + 整场结算
// 新逻辑：每个玩家独立推进，谁先完成全部N局谁赢
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const sudoku = require('./sudoku.js');

function toCellGrid(puzzle) {
  return puzzle.map(function (row) {
    return row.map(function (v) { return { value: v, fixed: v !== 0, error: false }; });
  });
}

exports.main = async (event) => {
  const openid = cloud.getWXContext().OPENID;
  const { matchId, grid } = event;

  try {
    var result = await db.runTransaction(async transaction => {
      var doc = await transaction.collection('matches').doc(matchId).get();
      var match = doc.data;

      if (match.status !== 'playing') throw new Error('对局已结束');

      // 找到自己的 slot
      var slot = -1;
      for (var i = 0; i < match.players.length; i++) {
        if (match.players[i].openid === openid) { slot = i; break; }
      }
      if (slot === -1) throw new Error('非本局玩家');
      var oppSlot = slot === 0 ? 1 : 0;

      var myState = match.playerStates['' + slot];
      if (!myState) throw new Error('玩家状态异常');
      if (myState.finished) throw new Error('你已完成全部局数');

      var roundIdx = myState.currentRound - 1; // 0-based
      var round = match.rounds[roundIdx];
      var puzzle = round.puzzle;

      if (!Array.isArray(grid) || grid.length !== puzzle.length || grid.some(function (row) {
        return !Array.isArray(row) || row.length !== puzzle.length || row.some(function (v) {
          return !Number.isInteger(v) || v < 0 || v > puzzle.length;
        });
      })) throw new Error('棋盘数据无效');

      // 校验答案与题目一致
      for (var r = 0; r < puzzle.length; r++) {
        for (var c = 0; c < puzzle[r].length; c++) {
          if (puzzle[r][c] !== 0 && grid[r][c] !== puzzle[r][c]) {
            throw new Error('答案与题目不匹配');
          }
        }
      }

      // 校验答案正确
      var cellGrid = toCellGrid(grid);
      var checkers = { '4x4': sudoku.check4x4, '6x6': sudoku.check6x6, '9x9': sudoku.check9x9 };
      var checker = checkers[match.mode];
      if (!checker) throw new Error('不支持的对战模式');
      var checkResult = checker(cellGrid);
      if (!checkResult.isComplete || checkResult.hasError) {
        return { ok: false, reason: 'wrong', message: '答案不正确，请继续' };
      }

      // 最终以该局保存的唯一正解为准；兼容旧对局没有 solution 的情况，
      // 从题目现场求解后再比对。即便客户端校验被绕过，服务端也不能放行错答。
      var expectedSolution = round.solution || sudoku.solvePuzzle(puzzle, match.mode);
      if (!expectedSolution) throw new Error('本局答案数据异常');
      for (var sr = 0; sr < grid.length; sr++) {
        for (var sc = 0; sc < grid[sr].length; sc++) {
          if (grid[sr][sc] !== expectedSolution[sr][sc]) {
            return { ok: false, reason: 'wrong', message: '答案不正确，请继续' };
          }
        }
      }

      // 计算本局用时（毫秒，用于秒表展示）
      var startTime = (myState.roundStartTimes || [])[roundIdx];
      // 兼容旧版对局中数组下标写入失败的情况：match.updatedAt 为上一局推进时刻。
      if (typeof startTime !== 'number' || startTime <= 0) startTime = match.updatedAt || match.createdAt || Date.now();
      var usedTime = Math.max(1, Date.now() - startTime);

      var now = Date.now();
      var updates = {};

      // 整体替换用时数组，避免云数据库对数组下标的局部更新在最后一局丢值。
      var newRoundTimes = (myState.roundTimes || []).slice();
      newRoundTimes[roundIdx] = usedTime;
      updates['playerStates.' + slot + '.roundTimes'] = db.command.set(newRoundTimes);

      // 更新累计用时
      var newTotalTime = (myState.totalTime || 0) + usedTime;
      updates['playerStates.' + slot + '.totalTime'] = newTotalTime;

      // 判断是否完成全部局数
      var nextRound = myState.currentRound + 1;
      var matchFinished = false;
      var iWon = false;

      if (nextRound > match.totalRounds) {
        // 完成最后一局，本人跑完全程
        updates['playerStates.' + slot + '.finished'] = true;
        updates['playerStates.' + slot + '.currentRound'] = match.totalRounds;

        // 检查是否是第一个完成的
        var oppState = match.playerStates['' + oppSlot];
        if (!oppState || !oppState.finished) {
          // 本人先完成全部，赢！
          iWon = true;
          matchFinished = true;
          updates['status'] = 'finished';
          updates['winnerSlot'] = slot;
          updates['finishedAt'] = now;
        } else {
          // 对手已经完成了，看谁总用时少
          var oppTotal = oppState.totalTime || 0;
          if (newTotalTime < oppTotal) {
            iWon = true;
            updates['winnerSlot'] = slot;
          } else if (newTotalTime > oppTotal) {
            iWon = false;
            updates['winnerSlot'] = oppSlot;
          } else {
            iWon = false;
            updates['winnerSlot'] = -1; // 平局
          }
          matchFinished = true;
          updates['status'] = 'finished';
          updates['finishedAt'] = now;
        }
      } else {
        // 还有下一局，推进到下一局
        updates['playerStates.' + slot + '.currentRound'] = nextRound;
        // 整体替换开始时间数组：微信云数据库对数组下标的点路径更新不稳定，
        // 一旦未写入，下一局会回退到 Date.now() 并被记为 00:00.0。
        var newRoundStartTimes = (myState.roundStartTimes || []).slice();
        newRoundStartTimes[roundIdx + 1] = now;
        updates['playerStates.' + slot + '.roundStartTimes'] = db.command.set(newRoundStartTimes);
        // 重置自己的 progress grid 为下一题
        var nextPuzzle = match.rounds[roundIdx + 1].puzzle;
        updates['progress.' + slot + '.grid'] = nextPuzzle.map(function (r) { return r.slice(); });
        updates['progress.' + slot + '.round'] = nextRound;
        updates['progress.' + slot + '.updatedAt'] = now;
      }

      updates['updatedAt'] = now;
      await transaction.collection('matches').doc(matchId).update({ data: updates });

      // 整场结束时写 pk_records
      if (matchFinished) {
        var recordsCol = db.collection('pk_records');
        for (var s = 0; s < 2; s++) {
          var p = match.players[s];
          var opp = match.players[s === 0 ? 1 : 0];
          var pState = match.playerStates['' + s];
          var finalWinner = updates.winnerSlot;
          var myResult = finalWinner === s ? 'win' : (finalWinner === -1 ? 'draw' : 'lose');
          var myTotal = s === slot ? newTotalTime : (pState ? pState.totalTime : 0);

          await recordsCol.add({
            data: {
              _openid: p.openid,
              matchId: matchId,
              mode: match.mode,
              totalRounds: match.totalRounds,
              result: myResult,
              opponentOpenid: opp.openid,
              opponentNickName: opp.nickName || '匿名玩家',
              opponentAvatarUrl: opp.avatarUrl || '',
              totalTime: myTotal,
              roundsDetail: (s === slot ? newRoundTimes : (pState.roundTimes || [])).map(function (t, idx) {
                return { round: idx + 1, myTime: t };
              }),
              matchType: match.matchType,
              finishedAt: now
            }
          });
        }
      }

      return {
        ok: true,
        roundTime: usedTime,
        myTotalTime: newTotalTime,
        matchFinished: matchFinished,
        iWon: iWon,
        winnerSlot: matchFinished ? updates.winnerSlot : null,
        nextRound: matchFinished ? null : nextRound
      };
    });

    return result;
  } catch (err) {
    console.error('pkSubmit error:', err);
    return { ok: false, error: err.message || '提交失败' };
  }
};
