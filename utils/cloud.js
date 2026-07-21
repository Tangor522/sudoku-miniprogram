// utils/cloud.js - 云开发封装（推荐方案，需开通云开发）
// 开通后自动启用，未开通时各方法会被上层降级到本地存储

function isReady() {
  var app = getApp();
  return app && app.globalData && app.globalData.cloudReady;
}

// 登录：云函数换 openid（云开发自动注入，免手动 code2Session）
function login() {
  return wx.cloud.callFunction({ name: 'login' });
}

// 更新用户资料（昵称、头像）
function updateProfile(nickName, avatarFileID) {
  return wx.cloud.callFunction({
    name: 'login',
    data: { nickName: nickName, avatarFileID: avatarFileID, update: true }
  });
}

// 上传头像到云存储，返回 fileID
function uploadAvatar(filePath) {
  var cloudPath = 'avatars/' + Date.now() + '-' + Math.random().toString(36).slice(2) + '.png';
  return wx.cloud.uploadFile({ cloudPath: cloudPath, filePath: filePath });
}

// 保存关卡进度
function saveProgress(mode, level, usedTime) {
  return wx.cloud.callFunction({
    name: 'saveProgress',
    data: { mode: mode, level: level, usedTime: usedTime, completedAt: Date.now() }
  });
}

// 查询某模式所有成绩
function getStats(mode) {
  return wx.cloud.callFunction({
    name: 'saveProgress',
    data: { action: 'list', mode: mode }
  }).then(function (res) {
    return res.result.list;
  });
}

// 查询全服排行榜（总关数 + 总用时）
function getRanking() {
  return wx.cloud.callFunction({ name: 'getRanking' }).then(function (res) {
    return res.result;
  });
}

module.exports = {
  isReady: isReady,
  login: login,
  updateProfile: updateProfile,
  uploadAvatar: uploadAvatar,
  saveProgress: saveProgress,
  getStats: getStats,
  getRanking: getRanking
};
