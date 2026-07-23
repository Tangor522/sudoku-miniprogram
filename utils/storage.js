// utils/storage.js - 本地存储封装
// 云开发未开通时的降级方案，平替原 React 的 localStorage
// 单设备单用户，数据存在 wx 本地缓存

var STORAGE_KEY = 'sudoku_data';

function loadAll() {
  return wx.getStorageSync(STORAGE_KEY) || {
    user: null,
    colorMode: 'normal',
    level4x4: 1,
    level6x6: 1,
    level9x9: 1,
    guestLevel4x4: 1,
    guestLevel6x6: 1,
    guestLevel9x9: 1,
    stats: { '4x4': [], '6x6': [], '9x9': [] }
  };
}

function saveAll(data) {
  wx.setStorageSync(STORAGE_KEY, data);
}

// 保存关卡成绩（仅当更快时更新）
function saveProgress(mode, level, usedTime) {
  var all = loadAll();
  var list = all.stats[mode] || [];
  var idx = -1;
  for (var i = 0; i < list.length; i++) {
    if (list[i].level === level) { idx = i; break; }
  }
  var record = { level: level, usedTime: usedTime, completedAt: Date.now() };
  if (idx === -1) {
    list.push(record);
  } else if (usedTime < list[idx].usedTime) {
    list[idx] = record;
  }
  all.stats[mode] = list;
  saveAll(all);
}

// 查询某模式所有成绩（按关卡升序）
function getStats(mode) {
  var all = loadAll();
  var list = (all.stats[mode] || []).slice();
  list.sort(function (a, b) { return a.level - b.level; });
  return list;
}

// 读取当前关卡进度
function getLevel(mode) {
  var all = loadAll();
  return all['level' + mode] || 1;
}

// 保存当前关卡进度
function setLevel(mode, level) {
  var all = loadAll();
  all['level' + mode] = level;
  saveAll(all);
}

// 游客进度与正式账号隔离，并且只允许停留在前 3 关。
function getGuestLevel(mode) {
  var all = loadAll();
  var level = all['guestLevel' + mode] || 1;
  return Math.max(1, Math.min(3, level));
}

function setGuestLevel(mode, level) {
  var all = loadAll();
  all['guestLevel' + mode] = Math.max(1, Math.min(3, level));
  saveAll(all);
}

// 生成本地临时用户（云开发未开通时用）
function genLocalUser() {
  var id = 'local_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
  return { openid: id, nickName: '', avatarUrl: '' };
}

module.exports = {
  loadAll: loadAll,
  saveAll: saveAll,
  saveProgress: saveProgress,
  getStats: getStats,
  getLevel: getLevel,
  setLevel: setLevel,
  getGuestLevel: getGuestLevel,
  setGuestLevel: setGuestLevel,
  genLocalUser: genLocalUser
};
