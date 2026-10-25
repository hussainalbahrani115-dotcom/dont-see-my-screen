import { h, mount } from '../../dom.js';

function withHighlight(text, word) {
  if (!word || !text.includes(word)) return text;
  const [before, ...rest] = text.split(word);
  return [before, h('mark', {}, word), rest.join(word)];
}

export function renderDocs(host, docs) {
  mount(
    host,
    [...docs].reverse().map((d) =>
      h(
        'article',
        { class: 'paper doc-body' },
        h('span', { class: 'stamp' }, d.stamp),
        h('h3', {}, d.title),
        d.body.map((p) => h('p', {}, withHighlight(p, d.highlight))),
      ),
    ),
  );
}
