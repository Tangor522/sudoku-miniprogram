// tests/unit/storage.test.js
// 白盒：本地存储封装（降级方案）的读写、成绩更新策略、关卡进度

const { makeWxMock, installWx } = require('../helpers/wxMock');

describe('utils/storage 本地存储封装', function () {
  var mock, storage;
  beforeEach(function () {
    mock = makeWxMock();
    installWx(mock);
    storage = require('../../utils/storage');
  });

  test('loadAll 无数据时返回默认值结构', function () {
    var all = storage.loadAll();
    expect(all.user).toBeNull();
    expect(all.colorMode).toBe('normal');
    expect(all.level4x4).toBe(1);
    expect(all.level6x6).toBe(1);
    expect(all.level9x9).toBe(1);
    expect(all.stats['4x4']).toEqual([]);
    expect(all.stats['6x6']).toEqual([]);
    expect(all.stats['9x9']).toEqual([]);
  });

  test('saveProgress 新关卡追加，更快成绩覆盖，更慢忽略', function () {
    storage.saveProgress('4x4', 1, 100);
    expect(storage.getStats('4x4')[0].usedTime).toBe(100);
    storage.saveProgress('4x4', 1, 50); // 更快 → 覆盖
    expect(storage.getStats('4x4')[0].usedTime).toBe(50);
    storage.saveProgress('4x4', 1, 80); // 更慢 → 忽略
    expect(storage.getStats('4x4')[0].usedTime).toBe(50);
  });

  test('saveProgress 不同关卡独立记录', function () {
    storage.saveProgress('6x6', 5, 200);
    storage.saveProgress('6x6', 3, 120);
    var stats = storage.getStats('6x6');
    expect(stats.length).toBe(2);
    expect(stats[0].level).toBe(3);
    expect(stats[1].level).toBe(5);
  });

  test('getStats 仅返回对应模式，并按关卡升序排序', function () {
    storage.saveProgress('4x4', 3, 30);
    storage.saveProgress('4x4', 1, 10);
    storage.saveProgress('4x4', 2, 20);
    var stats = storage.getStats('4x4');
    expect(stats.map(function (s) { return s.level; })).toEqual([1, 2, 3]);
  });

  test('getLevel / setLevel 读写当前关卡进度', function () {
    expect(storage.getLevel('4x4')).toBe(1);
    storage.setLevel('4x4', 12);
    expect(storage.getLevel('4x4')).toBe(12);
    expect(storage.getLevel('6x6')).toBe(1);
  });

  test('genLocalUser 生成 local_ 前缀的临时用户', function () {
    var u = storage.genLocalUser();
    expect(u.openid.indexOf('local_')).toBe(0);
    expect(u.nickName).toBe('');
    expect(u.avatarUrl).toBe('');
  });
});
