// tests/unit/timer.test.js
// 白盒：秒表计时器与格式化（含边界值）

const timerUtil = require('../../utils/timer');

describe('utils/timer', function () {
  describe('formatStopwatch 边界值', function () {
    test('0 与非法输入 → 00:00.0', function () {
      expect(timerUtil.formatStopwatch(0)).toBe('00:00.0');
      expect(timerUtil.formatStopwatch(undefined)).toBe('00:00.0');
      expect(timerUtil.formatStopwatch(-5)).toBe('00:00.0');
      expect(timerUtil.formatStopwatch(null)).toBe('00:00.0');
    });
    test('不足 1 分钟', function () {
      expect(timerUtil.formatStopwatch(59900)).toBe('00:59.9');
      expect(timerUtil.formatStopwatch(5000)).toBe('00:05.0');
    });
    test('整分钟与进位', function () {
      expect(timerUtil.formatStopwatch(60000)).toBe('01:00.0');
      expect(timerUtil.formatStopwatch(610400)).toBe('10:10.4');
      expect(timerUtil.formatStopwatch(3599999)).toBe('59:59.9');
    });
    test('十分位四舍五入（向下截断）', function () {
      // 1234ms → 1.2 秒（截断，非四舍五入）
      expect(timerUtil.formatStopwatch(1234)).toBe('00:01.2');
    });
  });

  describe('createTimer 生命周期', function () {
    var now = 1000000;
    beforeEach(function () {
      jest.useFakeTimers();
      jest.spyOn(Date, 'now').mockImplementation(function () { return now; });
    });
    afterEach(function () {
      Date.now.mockRestore();
      jest.useRealTimers();
    });

    test('start 后经过时间应累加，pause 冻结，resume 续算', function () {
      var ticks = [];
      var t = timerUtil.createTimer(function (ms) { ticks.push(ms); });
      t.start();
      now += 1000;
      jest.advanceTimersByTime(50); // 触发一次 tick
      expect(t.get()).toBe(1000);
      t.pause();
      var frozen = t.get();
      now += 5000; // 暂停期间时间流逝不应计入
      jest.advanceTimersByTime(50);
      expect(t.get()).toBe(frozen);
      t.resume();
      now += 2000;
      jest.advanceTimersByTime(50);
      expect(t.get()).toBe(frozen + 2000);
      t.stop();
    });

    test('重复 start 不应叠加计时', function () {
      var t = timerUtil.createTimer(function () {});
      t.start();
      now += 1000;
      t.start(); // 已在运行，应忽略
      now += 1000;
      expect(t.get()).toBe(2000);
      t.stop();
    });

    test('stop 返回总毫秒并清零', function () {
      var t = timerUtil.createTimer(function () {});
      t.start();
      now += 3500;
      var total = t.stop();
      expect(total).toBe(3500);
      expect(t.get()).toBe(0);
    });

    test('getSeconds 返回向下取整秒数', function () {
      var t = timerUtil.createTimer(function () {});
      t.start();
      now += 4500;
      expect(t.getSeconds()).toBe(4);
      t.stop();
    });
  });
});
