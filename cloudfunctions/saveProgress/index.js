// cloudfunctions/saveProgress/index.js
// 保存/查询关卡成绩，按 openid 天然隔离（云开发自动注入 _openid）

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event) => {
  const wxContext = cloud.getWXContext();
  const _openid = wxContext.OPENID;
  const col = db.collection('progress');
  const validModes = { '4x4': true, '6x6': true, '9x9': true };

  if (!validModes[event.mode]) return { ok: false, error: '不支持的游戏模式' };

  // 查询某模式所有成绩（按关卡升序）
  if (event.action === 'list') {
    const { data } = await col
      .where({ _openid: _openid, mode: event.mode })
      .orderBy('level', 'asc')
      .get();
    return { list: data };
  }

  // 写入/更新某关成绩（仅当更快时更新）
  const { mode, level, usedTime, completedAt } = event;
  if (!Number.isInteger(level) || level < 1 || level > 100 || typeof usedTime !== 'number' || usedTime < 0 || usedTime > 86400) {
    return { ok: false, error: '成绩参数无效' };
  }
  const exist = await col
    .where({ _openid: _openid, mode: mode, level: level })
    .get();

  if (exist.data.length) {
    if (usedTime < exist.data[0].usedTime) {
      await col
        .where({ _openid: _openid, mode: mode, level: level })
        .update({ data: { usedTime: usedTime, completedAt: completedAt } });
    }
  } else {
    // 云函数 add 不会自动注入 _openid，需手动写入
    await col.add({
      data: {
        _openid: _openid,
        mode: mode,
        level: level,
        usedTime: usedTime,
        completedAt: completedAt
      }
    });
  }
  return { ok: true };
};
