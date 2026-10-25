// Global, role-aware feedback for server effects.
import { h, fxLayer, toast } from './dom.js';
import { sfx } from './audio.js';

export function playFx(e, role) {
  const d = e.data || {};
  switch (e.type) {
    case 'penalty':
      sfx.penalty();
      fxLayer(h('div', { class: 'fx-flash' }), 800);
      document.getElementById('app').classList.remove('shake');
      void document.getElementById('app').offsetWidth;
      document.getElementById('app').classList.add('shake');
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
  }
}
