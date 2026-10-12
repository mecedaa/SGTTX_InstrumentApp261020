// Card rendering shared by the table view and the console.
window.CardUI = (function () {
  const CAT = { 'Evidence': ['EVIDENCE', 'var(--ev)'], 'Authority': ['AUTHORITY', 'var(--au)'], 'Coordination': ['COORDINATION', 'var(--co)'], 'Operational continuity': ['OPERATIONAL CONTINUITY', 'var(--op)'] };
  const CATS = Object.keys(CAT);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function band(cats, exp) {
    const list = cats && cats.length ? cats : ['Evidence'];
    return `<div class="band${exp ? ' hatch' : ''}${list.length > 2 ? ' n3' : ''}">` + list.map(k => `<span style="background-color:${(CAT[k] || CAT.Evidence)[1]}">${(CAT[k] || ['?'])[0]}</span>`).join('') + '</div>';
  }
  const num = c => c.print != null ? `<span class="no">No. ${esc(c.print)}</span>` : '';
  function front(c) {
    return band(c.cats, c.exp) + `<div class="cbody"><div class="tag"><span>${c.exp ? 'Expanded' : 'Activate'}${c.exp ? ' <span class="two">2</span>' : ''}</span>${num(c)}</div><div class="ctitle">${esc(c.title)}</div><div class="cdo">${esc(c.text)}</div></div>`;
  }
  function dots(cats) { return `<span class="dots">${(cats || []).map(k => `<i style="background:${(CAT[k] || CAT.Evidence)[1]}"></i>`).join('')}</span>`; }

  // gauge: -2..+2 on a five-step scale
  const WORD = { '-2': 'much worse', '-1': 'worse', '0': 'no change', '1': 'better', '2': 'much better' };
  const sign = v => (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v);
  function gauge(label, v) {
    v = Math.max(-2, Math.min(2, Math.round(+v || 0)));
    const steps = [-2, -1, 0, 1, 2].map(n => {
      const on = v === 0 ? n === 0 : (v > 0 ? n > 0 && n <= v : n < 0 && n >= v);
      return `<i class="${on ? (n > 0 ? 'pos' : n < 0 ? 'neg' : 'zero') : ''}${n === 0 ? ' mid' : ''}"></i>`;
    }).join('');
    return `<div class="gauge" role="img" aria-label="${label}: ${sign(v)}, ${WORD[v]}"><span class="gl">${label}</span><span class="gs">${steps}</span><span class="gv ${v > 0 ? 'pos' : v < 0 ? 'neg' : ''}">${sign(v)}</span></div>`;
  }
  function gauges(econ, pol) { return `<div class="gauges">${gauge('Economic', econ)}${gauge('Political', pol)}</div>`; }

  function readout(l, round) {
    const kind = l.kind === 'Expanded' ? 'Expanded' : 'Activated';
    return `<article class="rcard">${band(l.cats, l.kind === 'Expanded')}<div class="rbody"><div class="tag"><span>Readout${round ? ', round ' + round : ''}</span><span>${kind}</span></div>
      <h3>${esc(l.title)}</h3><p>${esc(l.text)}</p>${gauges(l.econ, l.pol)}</div></article>`;
  }
  function hindsight(h) {
    return `<article class="hcard"><div class="hband">HINDSIGHT</div><div class="rbody"><div class="tag"><span>Activated in round ${esc(h.round)}</span>${num(h)}</div>
      <h3>${esc(h.title)}</h3><p>${esc(h.text)}</p></div></article>`;
  }

  // generic, non-national table icons
  const ICON = {
    BIRD: '<svg viewBox="0 0 48 48" aria-hidden="true"><path fill="currentColor" d="M40 12c-3 0-5.4 1.7-6.6 4.1L30 15l-3 4C18 17 10 20 6 28c5-2 9-2 12 0-1 5 2 10 8 11l-2 5h4l1.6-4.8c.5 0 .9-.2 1.4-.2l1 5h4l-1.6-6C40 34 42 26 40 20l4-2-3.2-2.4c-.2-1.6-.4-2.6-.8-3.6zm-1 4a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3z"/></svg>',
    FLOWER: '<svg viewBox="0 0 48 48" aria-hidden="true"><g fill="currentColor"><circle cx="24" cy="12" r="7"/><circle cx="35" cy="20" r="7"/><circle cx="31" cy="33" r="7"/><circle cx="17" cy="33" r="7"/><circle cx="13" cy="20" r="7"/></g><circle cx="24" cy="24" r="5.5" fill="var(--icon-centre,#F2B233)"/></svg>',
  };
  return { CAT, CATS, esc, band, front, dots, gauge, gauges, readout, hindsight, ICON, sign };
})();
