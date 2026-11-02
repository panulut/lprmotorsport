(() => {
  'use strict';
  window.LPRFormatLapTime = milliseconds => {
    if (!Number.isFinite(milliseconds) || milliseconds < 0) return '--:--.---';
    const total = Math.round(milliseconds);
    const minutes = Math.floor(total / 60000);
    const seconds = Math.floor(total / 1000) % 60;
    const fraction = total % 1000;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(fraction).padStart(3, '0')}`;
  };
})();
