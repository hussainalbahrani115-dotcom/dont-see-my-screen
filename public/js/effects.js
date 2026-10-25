// Global, role-aware feedback for server effects.
import { h, fxLayer, toast } from './dom.js';
import { sfx } from './audio.js';

export function playFx(e, role) {
  const d = e.data || {};
  switch (e.type) {
    case 'penalty':
      sfx.penalty();
      fxLayer(h('div', { class: 'fx-flash' }), 800);
      shake();
      break;
    case 'blackout':
      if (role !== 'explorer') break;
      sfx.static(500);
      fxLayer(h('div', { class: 'fx-blackout', style: { '--ms': `${d.ms}ms` } }, 'الكشاف ينطفئ…'), d.ms);
      break;
    case 'static':
      sfx.static(d.ms || 900);
      fxLayer(h('div', { class: 'fx-static', style: { '--ms': `${d.ms || 1200}ms` } }), d.ms || 1200);
      break;
    case 'spark':
      sfx.spark();
      break;
    case 'fall':
      sfx.fall();
      fxLayer(h('div', { class: 'fx-blackout', style: { '--ms': '1400ms' } }, '…'), 1400);
      break;
    case 'stageComplete':
      sfx.success();
      break;
    case 'stage':
      fxLayer(
        h('div', { class: 'fx-banner' }, h('div', { class: 'kicker' }, `STAGE 0${d.index + 1}`), h('div', { class: 'big' }, d.title)),
        2700,
      );
      break;
    case 'doc':
      sfx.item();
      toast(`📄 وثيقة جديدة في «الملفات»: ${d.title}`, 'good');
      break;
    case 'item':
      sfx.item();
      toast(`🎒 التقطت: ${d.name}`, 'good');
      break;
    case 'msg':
      sfx.msg();
      break;
    case 'echoCaught':
      sfx.good();
      break;
    case 'falseFlag':
      sfx.penalty();
      break;
    case 'echoLaugh':
      sfx.echo();
      fxLayer(h('div', { class: 'fx-static', style: { '--ms': '1600ms' } }), 1600);
      break;
    case 'ended':
      sfx.end();
      break;
    case 'ping':
      sfx.ping();
      navigator.vibrate?.([120, 60, 120]);
      fxLayer(h('div', { class: 'fx-ping' }), 1200);
      toast('📣 شريكك يناديك بشكل عاجل! افتح المحادثة', 'error');
      break;
    case 'surge':
      sfx.surge();
      shake();
      break;
    case 'rumble':
      sfx.surge();
      break;
    case 'burst':
      sfx.spark();
      fxLayer(h('div', { class: 'fx-steam' }), 1600);
      break;
    case 'stall':
      sfx.fall();
      break;
    case 'caught':
      sfx.caught();
      fxLayer(h('div', { class: 'fx-caught' }, 'وجدتك.'), 2000);
      break;
    case 'deal':
      sfx.echo();
      break;
  }
}

function shake() {
  const app = document.getElementById('app');
  app.classList.remove('shake');
  void app.offsetWidth;
  app.classList.add('shake');
}
