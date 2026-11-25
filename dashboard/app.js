// Token Radar 01 Dashboard Script
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var state = { q: '', category: 'all', chain: 'all', tab: 'pre-token', sort: 'implied', dir: -1, selected: null };

  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  // Client-side farm plan generator matching model.ts
  function chainOf(p) { return p.chains && p.chains.length > 0 ? p.chains[0] : 'Arbitrum'; }
  function capitalFor(p) {
    if (p.tvl_usd >= 5e9) return 300;
    if (p.tvl_usd >= 1e9) return 200;
    if (p.tvl_usd >= 1e8) return 100;
    return 50;
  }
  function holdDaysFor(age) {
    if (age === null || age === undefined) return 45;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  }
  function farmSteps(p) {
    var chain = chainOf(p);
    var capital = capitalFor(p);
    var hold = holdDaysFor(p.age_days);
    var name = p.name;
    var c = (p.category || '').toLowerCase();

    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) {
      return [
        { text: 'Fund a clean non-custodial wallet with ' + capital + ' USDC and native gas on ' + chain + '.', cost: '~&2-4 gas', time: '5 min' },
        { text: 'Supply ' + capital + ' USDC as collateral on ' + name + ' and borrow a conservative amount against it.', cost: '~&3-5 gas & borrow fee', time: '10 min' },
        { text: 'Maintain position health factor above 2.0 and perform weekly interactions for ' + hold + ' days.', cost: '~&2 gas weekly', time: hold + ' days' },
        { text: 'Verify eligibility on the official ' + name + ' rewards or points dashboard before unwinding.', cost: 'Free check', time: '5 min' }
      ];
    }
    if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0 || c.indexOf('leveraged farm') >= 0) {
      return [
        { text: 'Prepare a non-custodial wallet with ' + capital + ' USDC and native gas for ' + chain + '.', cost: '~&2 gas', time: '5 min' },
        { text: 'Add liquidity to ' + name + "'s primary trading pair pool and stake LP tokens in their farm vault.", cost: '~&4-8 LP & gas fees', time: '12 min' },
        { text: 'Hold active LP stake for at least ' + hold + ' days with bi-weekly reward compounding.', cost: '~&2 gas per compound', time: hold + ' days' },
        { text: 'Check official ' + name + ' governance forum and points portal to claim rewards.', cost: 'Free check', time: '5 min' }
      ];
    }
    if (c.indexOf('bridge') >= 0 || c.indexOf('canonical bridge') >= 0) {
      return [
        { text: 'Deposit ' + capital + ' USDC into ' + name + ' from Ethereum or source chain to target chain.', cost: '~&3-8 bridge fee', time: '10 min' },
        { text: 'Execute at least 2 additional cross-chain transfers or swaps within 14 days.', cost: '~&4-10 transfer fees', time: '15 min' },
        { text: 'Retain cross-chain balance or LP position for ' + hold + ' days to ensure epoch inclusion.', cost: 'Capital locked', time: hold + ' days' },
        { text: 'Confirm activity logging on official ' + name + ' explorer / points checker.', cost: 'Free check', time: '5 min' }
      ];
    }
    return [
      { text: 'Fund a dedicated wallet with ' + capital + ' USDC and native gas on ' + chain + '.', cost: '~&2 gas', time: '5 min' },
      { text: 'Deposit ' + capital + ' USDC into ' + name + ' core contract vault on ' + chain + '.', cost: '~&3-5 gas', time: '10 min' },
      { text: 'Maintain active participation without withdrawing for at least ' + hold + ' days.', cost: '~&1-2 weekly gas', time: hold + ' days' },
      { text: 'Check official ' + name + ' announcements and points portal for snapshots.', cost: 'Free check', time: '5 min' }
    ];
  }

  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('p')) state.selected = params.get('p');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('chain')) state.chain = params.get('chain');
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  function rows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.category !== 'all' && r.category !== state.category) return false;
      if (state.chain !== 'all' && (!r.chains || r.chains.indexOf(state.chain) < 0)) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }

  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else if (key === 'confidence') {
        var rankMap = { high: 3, medium: 2, low: 1 };
        av = rankMap[a.confidence] || 0; bv = rankMap[b.confidence] || 0;
      }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  function stickyHeader() {
    return el('div', { class: 'sticky-header' },
      el('div', { class: 'shell top' },
        el('div', { class: 'brand' }, el('span', { class: 'mark' }), el('span', { class: 'brand-name', text: 'Token Radar 01' })),
        el('div', { class: 'top-metrics' },
          el('div', { class: 'metric-badge' }, el('span', { text: 'Total TVL at Stake' }), el('b', { text: fmtUsd(DATA.total_tvl_stake) })),
          el('div', { class: 'metric-badge' }, el('span', { text: 'High Confidence' }), el('b', { text: DATA.high_confidence_count + ' protocols' })),
          el('div', { class: 'metric-badge' }, el('span', { text: 'Median Implied' }), el('b', { text: fmtUsd(DATA.median_implied_value) }))
        )
      )
    );
  }

  function lede() {
    return el('section', { class: 'lede' },
      el('div', null,
        el('h1', { text: DATA.watchlist_size + ' Watchlist Protocols Ranked by Implied Value' }),
        el('p', { text: 'The watchlist covers every protocol with at least $' + Math.round(DATA.floor_usd / 1e6) + 'M TVL and no active token. The early radar adds ' + DATA.early_size + ' pre-token protocols below the floor. Implied valuation is derived from TVL, category multiplier, 7d growth, and youth urgency.' })
      ),
      el('div', { class: 'facts' },
        el('div', { class: 'fact' }, el('span', { text: 'Watchlist Covered' }), el('b', { text: DATA.watchlist_size + ' / ' + DATA.watchlist_size })),
        el('div', { class: 'fact' }, el('span', { text: 'Total Scored Rows' }), el('b', { text: String(DATA.board_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Early Pre-Token Rows' }), el('b', { text: String(DATA.early_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Live Tokens Set Aside' }), el('b', { text: String(DATA.live_size) }))
      )
    );
  }

  function controls() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var chainsSet = new Set();
    DATA.rows.forEach(function (r) { if (r.chains) r.chains.forEach(function (c) { chainsSet.add(c); }); });
    var chains = Array.from(chainsSet).sort();

    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search name, category, chain...', value: state.q, 'aria-label': 'Search board' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); });

    var catSelect = el('select', { id: 'category', 'aria-label': 'Filter by category' },
      el('option', { value: 'all', text: 'All categories' }),
      categories.map(function (c) { return el('option', { value: c, text: c, selected: c === state.category ? 'selected' : null }); })
    );
    catSelect.addEventListener('change', function () { state.category = catSelect.value; writeHash(); render(); });

    var chainSelect = el('select', { id: 'chain', 'aria-label': 'Filter by chain' },
      el('option', { value: 'all', text: 'All chains' }),
      chains.map(function (ch) { return el('option', { value: ch, text: ch, selected: ch === state.chain ? 'selected' : null }); })
    );
    chainSelect.addEventListener('change', function () { state.chain = chainSelect.value; writeHash(); render(); });

    var preBtn = el('button', { type: 'button', 'aria-pressed': state.tab === 'pre-token' ? 'true' : 'false', text: 'Pre-Token', onclick: function () { state.tab = 'pre-token'; render(); } });
    var liveBtn = el('button', { type: 'button', 'aria-pressed': state.tab === 'live' ? 'true' : 'false', text: 'Live Token', onclick: function () { state.tab = 'live'; render(); } });

    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), catSelect),
      el('div', { class: 'field' }, el('label', { for: 'chain', text: 'Chain' }), chainSelect),
      el('div', { class: 'field' }, el('span', { class: 'sub', text: 'View Mode' }), el('div', { class: 'tabs' }, preBtn, liveBtn)),
      el('span', { class: 'count', text: state.tab === 'pre-token' ? rows().length + ' rows shown' : DATA.live.length + ' live protocols' })
    );
  }

  function sortHeader(key, label) {
    return el('th', { scope: 'col' },
      el('button', { type: 'button', onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = -1; } render(); } },
        label,
        state.sort === key ? el('span', { 'aria-hidden': 'true', text: state.dir < 0 ? ' v' : ' ^' }) : null
      )
    );
  }

  function boardTable() {
    var list = sortedRows(rows());
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches your filter criteria' }),
        el('p', { text: 'Try clearing your search query or selecting a different category/chain filter.' }),
        el('button', { class: 'button primary', type: 'button', text: 'Reset Filters', onclick: function () { state.q = ''; state.category = 'all'; state.chain = 'all'; writeHash(); render(); } })
      ));
    }
    var max = list[0].implied_value_usd || 1;
    var tbody = el('tbody');
    list.forEach(function (r) {
      var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var confClass = 'badge badge-' + r.confidence;

      // Sparkline mini SVG hint for trend
      var trendSvg = '<svg width="40" height="16" viewBox="0 0 40 16"><path d="M2 12 L12 ' + (r.change_7d !== null && r.change_7d > 0 ? '4' : '12') + ' L22 8 L38 3" fill="none" stroke="' + (r.change_7d !== null && r.change_7d >= 0 ? '#10b981' : '#ef4444') + '" stroke-width="1.5"/></svg>';

      var tr = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'num', text: String(r.rank) }),
        el('td', null, el('div', { class: 'name' },
          el('b', { text: r.name }),
          el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'multi-chain') })
        )),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: growth }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', null, el('span', { class: confClass, text: r.confidence })),
        el('td', null, el('div', { class: 'bar-cell' },
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(4, Math.round((r.implied_value_usd / max) * 100)) + '%' })),
          el('span', { class: 'num', text: fmtUsd(r.implied_value_usd) })
        )),
        el('td', null, el('div', { class: 'sparkline', html: trendSvg }))
      );
      tbody.appendChild(tr);
    });

    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Pre-token protocols ranked by implied valuation. Click any row for deep model metrics and farm plan.' }),
          el('thead', null, el('tr', null,
            sortHeader('implied', 'Rank'),
            sortHeader('name', 'Protocol'),
            sortHeader('tvl', 'TVL'),
            sortHeader('growth', '7d %'),
            sortHeader('age', 'Age'),
            sortHeader('confidence', 'Conf'),
            sortHeader('implied', 'Implied Value'),
            el('th', { scope: 'col', text: 'Trend' })
          )),
          tbody
        )
      )
    );
  }

  function liveTable() {
    var tbody = el('tbody');
    DATA.live.forEach(function (r) {
      tbody.appendChild(el('tr', null,
        el('td', { class: 'num', text: 'live' }),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'multi-chain') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', null, el('span', { class: 'badge badge-high', text: 'Trading' }))
      ));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Live tokens set aside from pre-token rankings: market capitalization is factual market data.' }),
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Status' }), el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', text: 'TVL' }), el('th', { scope: 'col', text: '7d' }), el('th', { scope: 'col', text: 'Market Cap' }), el('th', { scope: 'col', text: 'Token' }))),
          tbody
        )
      )
    );
  }

  function modelPanel() {
    var m = DATA.model;
    return el('section', { class: 'panel model' },
      el('h2', { text: 'Implied Valuation Formula & Methodology' }),
      el('p', { class: 'sub', text: 'Every row is computed deterministically from the snapshot using sector multipliers, 7d growth adjustments, and youth urgency factors.' }),
      el('div', { class: 'formula' },
        'implied = round( tvl_usd x ' + m.base_multiple + ' x category_multiplier x (1 + clamp(change_7d, ' + m.growth_floor + ', ' + m.growth_cap + ') / 100 x ' + m.growth_weight + ') x urgency_factor )'
      ),
      el('p', { class: 'sub', text: 'Younger protocols with substantial TVL and robust multi-chain presence receive higher urgency multipliers. Confidence tiers reflect data completeness across category, chains, listed date, and 7d change.' })
    );
  }

  var dialog = el('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
  dialog.addEventListener('close', function () { state.selected = null; writeHash(); });

  function openDetail(slug) {
    var row = DATA.rows.filter(function (r) { return r.slug === slug; })[0];
    if (!row) return;
    state.selected = slug;
    writeHash();
    dialog.textContent = '';
    var steps = farmSteps(row);

    dialog.appendChild(el('div', { class: 'detail-head' },
      el('div', null,
        el('span', { class: 'brand-name', text: 'Rank ' + row.rank + ' of ' + DATA.board_size + ' (Confidence: ' + row.confidence.toUpperCase() + ')' }),
        el('h2', { id: 'detail-title', text: row.name }),
        el('p', { class: 'sub', text: (row.category || 'Other') + ' on ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'multi-chain') })
      ),
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: '✕', onclick: function () { dialog.close(); } })
    ));

    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Why this protocol is ranked' }),
      el('p', { class: 'sub', text: row.why })
    ));

    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Valuation Breakdown' }),
      el('div', { class: 'equation' },
        el('div', null, el('span', { text: 'Protocol TVL' }), el('b', { class: 'num', text: fmtUsd(row.tvl_usd) })),
        el('div', null, el('span', { text: '7-Day Change' }), el('b', { class: 'num ' + (row.change_7d !== null && row.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(row.change_7d) })),
        el('div', null, el('span', { text: 'Age with No Token' }), el('b', { class: 'num', text: fmtAge(row.age_days) })),
        el('div', null, el('span', { text: 'Growth Multiplier' }), el('b', { class: 'num', text: String(row.growth_multiplier) })),
        el('div', null, el('span', { text: 'Urgency Factor' }), el('b', { class: 'num', text: String(row.urgency_factor) })),
        el('div', null, el('span', { text: 'Implied Valuation' }), el('b', { class: 'num', text: fmtUsd(row.implied_value_usd) }))
      ),
      el('p', { class: 'sub', text: 'Model version ' + DATA.model_version + '. Confidence tier: ' + row.confidence.toUpperCase() + '.' })
    ));

    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Concrete Farm Plan & Steps' }),
      el('ol', { class: 'steps' }, steps.map(function (s) {
        return el('li', null, el('b', { text: s.text }), el('span', { class: 'cost', text: 'Cost: ' + s.cost + ' | Time: ' + s.time }));
      }))
    ));

    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  function render() {
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(lede());
    shell.appendChild(controls());
    shell.appendChild(state.tab === 'pre-token' ? boardTable() : liveTable());
    if (state.tab === 'pre-token') shell.appendChild(modelPanel());

    app.textContent = '';
    app.appendChild(stickyHeader());
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
    if (!dialog.isConnected) app.appendChild(dialog);
    if (state.selected) openDetail(state.selected);
  }

  readHash();
  render();
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && dialog.open) dialog.close();
  });
})();
