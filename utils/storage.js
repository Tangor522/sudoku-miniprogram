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

// 登录后把云端已完成关卡合并到本机。只允许推进，避免覆盖本机更高进度。
function syncLevelFromRecords(mode, records) {
  var maxCompleted = 0;
  (records || []).forEach(function (record) {
    var level = Number(record && record.level);
    if (level >= 1 && level <= 100 && level > maxCompleted) maxCompleted = level;
  });
  var cloudNext = maxCompleted ? Math.min(100, maxCompleted + 1) : 1;
  var merged = Math.max(getLevel(mode), cloudNext);
  setLevel(mode, merged);
  return merged;
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
  syncLevelFromRecords: syncLevelFromRecords,
  genLocalUser: genLocalUser
};
