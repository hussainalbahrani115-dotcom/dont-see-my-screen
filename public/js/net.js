// Socket.IO wrapper with promise-based acks and connection status.
/* global io */

const socket = io({ reconnectionDelay: 600, reconnectionDelayMax: 4000, timeout: 8000 });
const statusListeners = new Set();
let status = 'connecting';

function setStatus(s) {
  status = s;
  statusListeners.forEach((fn) => fn(s));
}

socket.on('connect', () => setStatus('online'));
socket.on('disconnect', () => setStatus('offline'));
socket.io.on('reconnect_attempt', () => setStatus('reconnecting'));

export const net = {
  get status() {
    return status;
  },
  onStatus(fn) {
    statusListeners.add(fn);
  },
  on(event, fn) {
    socket.on(event, fn);
  },
  emit(event, payload = {}) {
    return new Promise((resolve) => {
      if (!socket.connected) return resolve({ ok: false, error: 'لا يوجد اتصال بالخادم حاليًا' });
      const timer = setTimeout(() => resolve({ ok: false, error: 'انتهت مهلة الاتصال' }), 9000);
      socket.emit(event, payload, (res) => {
        clearTimeout(timer);
        resolve(res || { ok: false, error: 'رد غير صالح من الخادم' });
      });
    });
  },
};
