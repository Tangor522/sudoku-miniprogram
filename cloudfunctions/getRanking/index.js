// cloudfunctions/getRanking/index.js
// 排行榜云函数：聚合统计每个玩家的总关数、总用时，join users 拿昵称头像
// 排序规则：总关数降序 → 总用时升序（关数相同时快的在前）
// 返回 top 100

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;
const $ = db.command.aggregate;

exports.main = async (event) => {
  try {
    // 聚合管道：按 _openid 分组统计总关数、总用时
    const result = await db.collection('progress')
      .aggregate()
      .group({
        _id: '$_openid',
        totalLevels: $.sum(1),
        totalTime: $.sum('$usedTime')
      })
      .sort({
        totalLevels: -1,
        totalTime: 1
      })
      .limit(100)
      .end();

    const list = result.list || [];

    if (list.length === 0) {
      return { list: [], myRank: null };
    }

    // 批量查 users 拿昵称头像
    const openids = list.map(function (item) { return item._id; });
    const usersRes = await db.collection('users')
      .where({ _openid: _.in(openids) })
      .field({ _openid: true, nickName: true, avatarUrl: true })
      .get();

    var userMap = {};
    usersRes.data.forEach(function (u) {
      userMap[u._openid] = u;
    });

    const myOpenid = cloud.getWXContext().OPENID;
    var myRank = null;
    var rankedList = list.map(function (item, index) {
      var u = userMap[item._id] || {};
      var entry = {
        rank: index + 1,
        openid: item._id,
        nickName: u.nickName || '匿名玩家',
        avatarUrl: u.avatarUrl || '',
        totalLevels: item.totalLevels,
        totalTime: item.totalTime,
        isMe: item._id === myOpenid
      };
      if (entry.isMe) myRank = entry;
      return entry;
    });

    return { list: rankedList, myRank: myRank };
  } catch (err) {
    console.error('getRanking error:', err);
    return { list: [], myRank: null, error: err.message };
  }
};
