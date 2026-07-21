// cloudfunctions/pkMatch/index.js - 匹配/建房/加入/取消
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const sudoku = require('./sudoku.js');

function genRoomCode() {
  var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  var code = '';
  for (var i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

// 生成题目数组（双方共用同一组题）
function genRounds(mode, totalRounds) {
  var gen = mode === '4x4' ? sudoku.generate4x4Puzzle : sudoku.generate6x6Puzzle;
  var rounds = [];
  for (var i = 0; i < totalRounds; i++) {
    rounds.push({ puzzle: gen(20) });
  }
  return rounds;
}

// 初始化每个玩家的独立进度
function initPlayerStates(totalRounds, rounds, startTime) {
  // 每个玩家独立推进：各自有 currentRound、roundStartTimes、roundTimes
  var states = {};
  for (var s = 0; s < 2; s++) {
    states[s] = {
      ready: false,                     // 是否点了开始
      currentRound: 1,
      roundStartTimes: [startTime],  // 第1局开始时间
      roundTimes: [],                 // 每局用时（完成后填入）
      finished: false,
      totalTime: 0
    };
  }
  return states;
}

exports.main = async (event) => {
  const openid = cloud.getWXContext().OPENID;
  var { action, mode, totalRounds, roomCode } = event;
  const col = db.collection('matches');

  if ((action === 'randomMatch' || action === 'createRoom') && mode !== '4x4' && mode !== '6x6') {
    return { ok: false, error: '不支持的对战模式' };
  }

  // 局数范围校验（1-5）
  if (!totalRounds || totalRounds < 1) totalRounds = 1;
  if (totalRounds > 5) totalRounds = 5;

  try {
    // === 随机匹配 ===
    if (action === 'randomMatch') {
      var waiting = await col.where({
        status: 'matching', matchType: 'random', mode: mode, totalRounds: totalRounds
      }).get();

      for (var i = 0; i < waiting.data.length; i++) {
        var m = waiting.data[i];
        if (m.players && m.players.length === 1 && m.players[0].openid !== openid) {
          var result = await db.runTransaction(async transaction => {
            var doc = await transaction.collection('matches').doc(m._id).get();
            var match = doc.data;
            if (match.status !== 'matching' || !match.players || match.players.length !== 1) {
              throw new Error('房间状态已变');
            }
            var rounds = genRounds(mode, totalRounds);
            var now = Date.now();
            var playerStates = initPlayerStates(totalRounds, rounds, now);
            await transaction.collection('matches').doc(m._id).update({
              data: {
                players: db.command.set([
                  match.players[0],
                  { openid: openid, nickName: '', avatarUrl: '', slot: 1, lastActive: now, connected: true }
                ]),
                rounds: rounds,
                playerStates: playerStates,
                status: 'playing',
                updatedAt: now
              }
            });
            return { matchId: m._id, slot: 1 };
          }).catch(err => null);

          if (result) {
            var updated = await col.doc(m._id).get();
            return { ok: true, matchId: m._id, slot: 1, match: updated.data };
          }
        }
      }

      // 没匹配到，创建新房间等待
      var now = Date.now();
      var userRes = await db.collection('users').where({ _openid: openid }).get();
      var userInfo = userRes.data[0] || {};
      var addRes = await col.add({
        data: {
          matchId: 'pk_' + now,
          matchType: 'random',
          status: 'matching',
          mode: mode,
          totalRounds: totalRounds,
          roomCode: null,
          creatorOpenid: openid,
          players: [{
            openid: openid, nickName: userInfo.nickName || '', avatarUrl: userInfo.avatarUrl || '',
            slot: 0, lastActive: now, connected: true
          }],
          rounds: [],
          playerStates: {},
          progress: {},
          disconnect: { '0': { offline: false }, '1': { offline: false } },
          winnerSlot: null, finishedAt: null,
          createdAt: now, updatedAt: now
        }
      });
      return { ok: true, matchId: addRes._id, slot: 0, status: 'waiting' };
    }

    // === 创建房间 ===
    if (action === 'createRoom') {
      var code = genRoomCode();
      var exist = await col.where({ roomCode: code, status: 'matching' }).get();
      while (exist.data.length > 0) { code = genRoomCode(); exist = await col.where({ roomCode: code, status: 'matching' }).get(); }

      var now2 = Date.now();
      var userRes2 = await db.collection('users').where({ _openid: openid }).get();
      var userInfo2 = userRes2.data[0] || {};
      var addRes2 = await col.add({
        data: {
          matchId: 'pk_' + now2, matchType: 'room', status: 'matching',
          mode: mode, totalRounds: totalRounds, roomCode: code, creatorOpenid: openid,
          players: [{ openid: openid, nickName: userInfo2.nickName || '', avatarUrl: userInfo2.avatarUrl || '', slot: 0, lastActive: now2, connected: true }],
          rounds: [], playerStates: {}, progress: {},
          disconnect: { '0': { offline: false }, '1': { offline: false } },
          winnerSlot: null, finishedAt: null, createdAt: now2, updatedAt: now2
        }
      });
      return { ok: true, matchId: addRes2._id, slot: 0, roomCode: code };
    }

    // === 加入房间 ===
    if (action === 'joinRoom') {
      var rooms = await col.where({ roomCode: roomCode, status: 'matching', matchType: 'room' }).get();
      if (!rooms.data.length) return { ok: false, error: '房间不存在或已开始' };
      var room = rooms.data[0];
      if (room.players.length !== 1) return { ok: false, error: '房间已满' };
      if (room.players[0].openid === openid) return { ok: false, error: '不能加入自己的房间' };

      var joinResult = await db.runTransaction(async transaction => {
        var doc = await transaction.collection('matches').doc(room._id).get();
        var match = doc.data;
        if (match.status !== 'matching' || !match.players || match.players.length !== 1) {
          throw new Error('房间状态已变');
        }
        var rounds = genRounds(match.mode, match.totalRounds);
        var now3 = Date.now();
        var playerStates = initPlayerStates(match.totalRounds, rounds, now3);
        await transaction.collection('matches').doc(room._id).update({
          data: {
            players: db.command.set([
              match.players[0],
              { openid: openid, nickName: '', avatarUrl: '', slot: 1, lastActive: now3, connected: true }
            ]),
            rounds: rounds, playerStates: playerStates,
            status: 'playing', updatedAt: now3
          }
        });
        return { matchId: room._id, slot: 1 };
      }).catch(err => null);

      if (joinResult) {
        var updated2 = await col.doc(room._id).get();
        return { ok: true, matchId: room._id, slot: 1, match: updated2.data };
      }
      return { ok: false, error: '加入失败，请重试' };
    }

    // === 取消匹配/离开房间 ===
    if (action === 'cancelMatch') {
      await col.where({ _id: event.matchId, status: 'matching' }).update({ data: { status: 'cancelled', updatedAt: Date.now() } });
      return { ok: true };
    }

    return { ok: false, error: '未知 action: ' + action };
  } catch (err) {
    console.error('pkMatch error:', err);
    return { ok: false, error: err.message || '匹配失败' };
  }
};
