// utils/pk.js - PK 功能封装：云函数调用 + 轮询同步 + 心跳
// 全部数据操作走云函数，不依赖 matches 集合的客户端读写权限

// 调用云函数
function callFn(name, data) {
  return wx.cloud.callFunction({ name: name, data: data }).then(function (res) {
    return res.result;
  });
}

// 匹配
function randomMatch(mode, totalRounds) {
  return callFn('pkMatch', { action: 'randomMatch', mode: mode, totalRounds: totalRounds });
}
function createRoom(mode, totalRounds) {
  return callFn('pkMatch', { action: 'createRoom', mode: mode, totalRounds: totalRounds });
}
function joinRoom(roomCode) {
  return callFn('pkMatch', { action: 'joinRoom', roomCode: roomCode });
}
function cancelMatch(matchId) {
  return callFn('pkMatch', { action: 'cancelMatch', matchId: matchId });
}

// 标记自己已准备（走云函数，不依赖客户端写权限）
function setReady(matchId) {
  return callFn('pkState', { action: 'setReady', matchId: matchId });
}

// 提交
function submitRound(matchId, grid) {
  return callFn('pkSubmit', { matchId: matchId, grid: grid });
}

// 状态
function reconnect(matchId) {
  return callFn('pkState', { action: 'reconnect', matchId: matchId });
}
function surrender(matchId) {
  return callFn('pkState', { action: 'surrender', matchId: matchId });
}
function markOffline(matchId) {
  return callFn('pkState', { action: 'markOffline', matchId: matchId });
}
function timeoutLoss(matchId) {
  return callFn('pkState', { action: 'timeoutLoss', matchId: matchId });
}

// 战绩
function getRecords(limit, skip) {
  return callFn('pkRecord', { action: 'list', limit: limit, skip: skip });
}
function getStats() {
  return callFn('pkRecord', { action: 'stats' });
}

// === 轮询拉取对局数据（替代 watch，无需集合读权限） ===
// 每 1.5 秒通过云函数拉取最新 match 文档
function pollMatch(matchId, onChange, onError) {
  var stopped = false;
  var pollTimer = null;

  function poll() {
    if (stopped) return;
    callFn('pkState', { action: 'getMatch', matchId: matchId }).then(function (res) {
      if (stopped) return;
      if (res.ok && res.match) {
        onChange(res.match);
      } else if (onError) {
        onError(new Error(res.error || '拉取对局失败'));
      }
      pollTimer = setTimeout(poll, 1500);
    }).catch(function (err) {
      if (stopped) return;
      if (onError) onError(err);
      // 出错后 3 秒重试，避免密集请求
      pollTimer = setTimeout(poll, 3000);
    });
  }

  poll();

  return {
    close: function () {
      stopped = true;
      if (pollTimer) { clearTimeout(pollTimer); pollTimer = null; }
    }
  };
}

// === 同步棋盘进度（走云函数，不依赖客户端写权限） ===
var lastSyncTime = 0;
function syncProgress(matchId, slot, grid) {
  var now = Date.now();
  if (now - lastSyncTime < 2000) return; // 节流：最少 2 秒一次
  lastSyncTime = now;
  callFn('pkState', { action: 'syncProgress', matchId: matchId, grid: grid }).catch(function (e) {
    console.warn('syncProgress fail', e);
  });
}

// 强制同步（提交前调用，不走节流）
function forceSync(matchId, slot, grid) {
  return callFn('pkState', { action: 'syncProgress', matchId: matchId, grid: grid }).catch(function (e) {
    console.warn('forceSync fail', e);
  });
}

// === 心跳（走云函数，不依赖客户端写权限） ===
var lastHeartbeat = 0;
function heartbeat(matchId, slot) {
  var now = Date.now();
  if (now - lastHeartbeat < 10000) return; // 10 秒一次
  lastHeartbeat = now;
  callFn('pkState', { action: 'heartbeat', matchId: matchId }).catch(function (e) {
    console.warn('heartbeat fail', e);
  });
}

// 缓存当前对战
function setActiveMatch(matchId, slot, mode) {
  wx.setStorageSync('activeMatch', { matchId: matchId, slot: slot, mode: mode });
}
function getActiveMatch() {
  return wx.getStorageSync('activeMatch') || null;
}
function clearActiveMatch() {
  wx.removeStorageSync('activeMatch');
}

module.exports = {
  randomMatch: randomMatch, createRoom: createRoom, joinRoom: joinRoom, cancelMatch: cancelMatch,
  setReady: setReady,
  submitRound: submitRound,
  reconnect: reconnect, surrender: surrender, markOffline: markOffline, timeoutLoss: timeoutLoss,
  getRecords: getRecords, getStats: getStats,
  pollMatch: pollMatch, syncProgress: syncProgress, forceSync: forceSync, heartbeat: heartbeat,
  setActiveMatch: setActiveMatch, getActiveMatch: getActiveMatch, clearActiveMatch: clearActiveMatch
};
