// cloudfunctions/pkState/index.js - 掉线/重连/超时判负/认输
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event) => {
  const openid = cloud.getWXContext().OPENID;
  const { action, matchId } = event;
  const col = db.collection('matches');

  try {
    var matchDoc = await col.doc(matchId).get();
    var match = matchDoc.data;
    if (!match) return { ok: false, error: '对局不存在' };

    var slot = -1;
    for (var i = 0; i < match.players.length; i++) {
      if (match.players[i].openid === openid) { slot = i; break; }
    }
    if (slot === -1) return { ok: false, error: '非本局玩家' };
    var oppSlot = slot === 0 ? 1 : 0;

    // === 轮询拉取对局数据（替代 watch，无需集合读权限） ===
    if (action === 'getMatch') {
      var freshDoc = await col.doc(matchId).get();
      return { ok: true, match: freshDoc.data };
    }

    // === 同步棋盘进度（替代客户端 db.update，无需集合写权限） ===
    if (action === 'syncProgress') {
      if (match.status !== 'playing') return { ok: false, error: '对局已结束' };
      var grid = event.grid;
      var sizeMap = { '4x4': 4, '6x6': 6, '9x9': 9 };
      var size = sizeMap[match.mode];
      if (!size) return { ok: false, error: '不支持的对战模式' };
      if (!Array.isArray(grid) || grid.length !== size || grid.some(function (row) {
        return !Array.isArray(row) || row.length !== size || row.some(function (v) { return !Number.isInteger(v) || v < 0 || v > size; });
      })) return { ok: false, error: '棋盘数据无效' };
      var syncUpd = {};
      syncUpd['progress.' + slot + '.grid'] = grid;
      syncUpd['progress.' + slot + '.updatedAt'] = Date.now();
      await col.doc(matchId).update({ data: syncUpd });
      return { ok: true };
    }

    // === 心跳（替代客户端 db.update） ===
    if (action === 'heartbeat') {
      if (match.status !== 'playing') return { ok: false, error: '对局已结束' };
      var hbUpd = {};
      hbUpd['players.' + slot + '.lastActive'] = Date.now();
      await col.doc(matchId).update({ data: hbUpd });
      return { ok: true };
    }

    // === 标记准备就绪 ===
    if (action === 'setReady') {
      if (match.status !== 'playing' && match.status !== 'matching') return { ok: false, error: '对局状态异常' };
      var wasReady = !!((match.playerStates['' + slot] || {}).ready);
      var readyUpd = {};
      readyUpd['playerStates.' + slot + '.ready'] = true;
      readyUpd['updatedAt'] = Date.now();
      await col.doc(matchId).update({ data: readyUpd });

      // 检查双方是否都已准备
      var freshMatch = await col.doc(matchId).get();
      var fm = freshMatch.data;
      var myReady = (fm.playerStates['' + slot] || {}).ready;
      var oppReady = (fm.playerStates['' + oppSlot] || {}).ready;
      if (!wasReady && myReady && oppReady) {
        // 双方都准备完成的这一刻才正式开始首局计时，排除等待对手的时间。
        var startAt = Date.now();
        var startUpd = { updatedAt: startAt };
        startUpd['playerStates.0.roundStartTimes'] = [startAt];
        startUpd['playerStates.1.roundStartTimes'] = [startAt];
        await col.doc(matchId).update({ data: startUpd });
      }
      return { ok: true, myReady: myReady, oppReady: oppReady, bothReady: myReady && oppReady };
    }

    // === 重连 ===
    if (action === 'reconnect') {
      if (match.status !== 'playing') return { ok: false, error: '对局已结束' };
      var upd = {};
      upd['players.' + slot + '.connected'] = true;
      upd['players.' + slot + '.lastActive'] = Date.now();
      upd['disconnect.' + slot + '.offline'] = false;
      upd['disconnect.' + slot + '.offlineAt'] = null;
      upd['updatedAt'] = Date.now();
      await col.doc(matchId).update({ data: upd });
      var fresh = await col.doc(matchId).get();
      return { ok: true, match: fresh.data };
    }

    // === 超时判负 ===
    if (action === 'timeoutLoss') {
      if (match.status !== 'playing') return { ok: false, error: '对局已结束' };
      var disc = match.disconnect['' + oppSlot];
      if (!disc || !disc.offline) return { ok: false, error: '对手未掉线' };
      var deadline = disc.offlineAt + 30000;
      if (Date.now() < deadline) return { ok: false, error: '对手重连时间未到' };
      await finishMatch(matchId, slot, match, '对手超时未重连');
      return { ok: true, winnerSlot: slot, reason: '对手超时' };
    }

    // === 认输 ===
    if (action === 'surrender') {
      if (match.status !== 'playing') return { ok: false, error: '对局已结束' };
      await finishMatch(matchId, oppSlot, match, '对手认输');
      return { ok: true, winnerSlot: oppSlot, reason: '认输' };
    }

    // === 标记对方掉线 ===
    if (action === 'markOffline') {
      if (match.status !== 'playing') return { ok: false, error: '对局已结束' };
      var now = Date.now();
      var upd2 = {};
      upd2['disconnect.' + oppSlot + '.offline'] = true;
      upd2['disconnect.' + oppSlot + '.offlineAt'] = now;
      upd2['updatedAt'] = now;
      await col.doc(matchId).update({ data: upd2 });
      return { ok: true, deadline: now + 30000 };
    }

    return { ok: false, error: '未知 action: ' + action };
  } catch (err) {
    console.error('pkState error:', err);
    return { ok: false, error: err.message || '操作失败' };
  }
};

// 结束对局，写 pk_records
async function finishMatch(matchId, winnerSlot, match, reason) {
  var updates = {
    status: 'finished',
    winnerSlot: winnerSlot,
    finishedAt: Date.now(),
    updatedAt: Date.now()
  };
  await db.collection('matches').doc(matchId).update({ data: updates });

  var recordsCol = db.collection('pk_records');
  for (var s = 0; s < 2; s++) {
    var p = match.players[s];
    var opp = match.players[s === 0 ? 1 : 0];
    var myResult = winnerSlot === s ? 'win' : (winnerSlot === -1 ? 'draw' : 'lose');
    var pState = (match.playerStates || {})[s] || {};
    var myTotal = pState.totalTime || 0;
    var roundsDetail = (pState.roundTimes || []).map(function (t, idx) {
      return { round: idx + 1, myTime: t };
    });
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
        roundsDetail: roundsDetail,
        matchType: match.matchType,
        note: reason,
        finishedAt: Date.now()
      }
    });
  }
}
