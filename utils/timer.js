// utils/timer.js - 计时器管理（后台自动暂停，回前台恢复）
// onTick 回调返回毫秒数 elapsed，展示用 formatStopwatch 格式化

function createTimer(onTick) {
  var id = null;
  var startTime = 0;   // 本次启动时的 Date.now()
  var elapsed = 0;     // 累计已过毫秒数（不含当前进行段）
  var running = false;

  function getCurrentElapsed() {
    if (running) {
      return elapsed + (Date.now() - startTime);
    }
    return elapsed;
  }

  function tick() {
    if (onTick) onTick(getCurrentElapsed());
  }

  return {
    start: function (initialElapsed) {
      if (running) return;
      if (typeof initialElapsed === 'number' && initialElapsed >= 0) elapsed = initialElapsed;
      startTime = Date.now();
      running = true;
      tick();
      id = setInterval(tick, 50); // 50ms 刷新一次，秒表流畅
    },
    pause: function () {
      if (!running) return;
      elapsed += (Date.now() - startTime);
      running = false;
      clearInterval(id);
      id = null;
    },
    resume: function () {
      if (running) return;
      startTime = Date.now();
      running = true;
      id = setInterval(tick, 50);
    },
    stop: function () {
      var r = getCurrentElapsed();
      if (id) { clearInterval(id); id = null; }
      elapsed = 0;
      running = false;
      return r; // 返回总毫秒数
    },
    setElapsed: function (ms) {
      elapsed = typeof ms === 'number' && ms > 0 ? ms : 0;
      if (running) startTime = Date.now();
      tick();
    },
    get: function () { return getCurrentElapsed(); },
    // 返回秒数（兼容旧调用）
    getSeconds: function () { return Math.floor(getCurrentElapsed() / 1000); }
  };
}

// 把毫秒格式化为秒表样式：MM:SS.ms（如 01:23.4）
function formatStopwatch(ms) {
  if (!ms || ms < 0) ms = 0;
  var totalSec = Math.floor(ms / 1000);
  var minutes = Math.floor(totalSec / 60);
  var seconds = totalSec % 60;
  var tenths = Math.floor((ms % 1000) / 100); // 十分位
  var mStr = minutes < 10 ? '0' + minutes : '' + minutes;
  var sStr = seconds < 10 ? '0' + seconds : '' + seconds;
  return mStr + ':' + sStr + '.' + tenths;
}

function formatStopwatchParts(ms) {
  var text = formatStopwatch(ms);
  return { text: text, main: text.slice(0, -2), tenths: text.slice(-1) };
}

module.exports = { createTimer: createTimer, formatStopwatch: formatStopwatch, formatStopwatchParts: formatStopwatchParts };
