// cloudfunctions/pkRecord/index.js - 查询战绩
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event) => {
  const openid = cloud.getWXContext().OPENID;
  const { action, limit, skip } = event;
  const col = db.collection('pk_records');

  try {
    if (action === 'list') {
      var res = await col.where({ _openid: openid })
        .orderBy('finishedAt', 'desc')
        .skip(skip || 0)
        .limit(limit || 20)
        .get();
      return { ok: true, list: res.data };
    }

    if (action === 'stats') {
      var all = await col.where({ _openid: openid }).get();
      var stats = {
        total: all.data.length,
        wins: 0, losses: 0, draws: 0,
        mode4x4: 0, mode6x6: 0,
        avgTime: 0, totalTime: 0
      };
      all.data.forEach(function (r) {
        if (r.result === 'win') stats.wins++;
        else if (r.result === 'lose') stats.losses++;
        else stats.draws++;
        if (r.mode === '4x4') stats.mode4x4++;
        else if (r.mode === '6x6') stats.mode6x6++;
        stats.totalTime += r.totalTime || 0;
      });
      stats.winRate = stats.total > 0 ? Math.round(stats.wins / stats.total * 100) : 0;
      stats.avgTime = stats.total > 0 ? Math.round(stats.totalTime / stats.total) : 0;
      return { ok: true, stats: stats };
    }

    return { ok: false, error: '未知 action: ' + action };
  } catch (err) {
    console.error('pkRecord error:', err);
    return { ok: false, error: err.message || '查询失败' };
  }
};
