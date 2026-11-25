// Token Radar Analytics Dashboard
// Dynamic client-side renderer for protocol rankings, metrics, filters, and farm itineraries.

(function () {
  'use strict';

  const dataset = window.RADAR;
  if (!dataset) return;

  const rootEl = document.getElementById('board');
  const appState = {
    query: '',
    categoryFilter: 'all',
    chainFilter: 'all',
    activeTab: 'pre-token',
    sortCol: 'implied',
    sortDir: -1,
    activeSlug: null,
  };

  const currencyFmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

  function formatUsd(amount) {
    if (amount === null || amount === undefined || !Number.isFinite(amount)) return 'N/A';
    if (Math.abs(amount) >= 1e9) return '$' + (amount / 1e9).toFixed(2) + 'B';
    if (Math.abs(amount) >= 1e6) return '$' + (amount / 1e6).toFixed(1) + 'M';
    if (Math.abs(amount) >= 1e3) return '$' + Math.round(amount / 1e3) + 'K';
    return currencyFmt.format(amount);
  }

  function formatPct(val) {
    if (val === null || val === undefined || !Number.isFinite(val)) return 'N/A';
    return (val > 0 ? '+' : '') + val.toFixed(2) + '%';
  }

  function formatAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }

  function createElement(tagName, attrs, ...children) {
    const el = document.createElement(tagName);
    if (attrs) {
      Object.keys(attrs).forEach((key) => {
        if (key === 'class') {
          el.className = attrs[key];
        } else if (key === 'text') {
          el.textContent = attrs[key];
        } else if (key === 'html') {
          el.innerHTML = attrs[key];
        } else if (key.startsWith('on')) {
          el.addEventListener(key.slice(2), attrs[key]);
        } else if (attrs[key] !== null && attrs[key] !== undefined) {
          el.setAttribute(key, attrs[key]);
        }
      });
    }
    children.forEach((child) => {
      if (child === null || child === undefined) return;
      if (Array.isArray(child)) {
        child.forEach((c) => {
          if (c) el.appendChild(c);
        });
      } else if (typeof child === 'string' || typeof child === 'number') {
        el.appendChild(document.createTextNode(String(child)));
      } else {
        el.appendChild(child);
      }
    });
    return el;
  }

  function resolveChain(p) {
    return p.chains && p.chains.length > 0 ? p.chains[0] : 'Arbitrum';
  }

  function resolveCapital(p) {
    if (p.tvl_usd >= 5e9) return 300;
    if (p.tvl_usd >= 1e9) return 200;
    if (p.tvl_usd >= 1e8) return 100;
    return 50;
  }

  function resolveHoldDays(age) {
    if (age === null || age === undefined) return 45;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  }

  function generateFarmSteps(p) {
    const network = resolveChain(p);
    const amount = resolveCapital(p);
    const duration = resolveHoldDays(p.age_days);
    const title = p.name;
    const cat = (p.category || '').toLowerCase();

    if (cat.includes('lend') || cat.includes('cdp') || cat.includes('collateral')) {
      return [
        { text: `Deposit ${amount} USDC and native gas into a secure wallet on ${network}.`, cost: `~$2-4 gas`, time: `5 min` },
        { text: `Supply ${amount} USDC as collateral on ${title} and open a modest borrow position.`, cost: `~$3-5 fees`, time: `10 min` },
        { text: `Keep collateral health factor above 2.0 with weekly check-ins for ${duration} days.`, cost: `~$2 weekly gas`, time: `${duration} days` },
        { text: `Confirm participation on official ${title} dashboard before closing.`, cost: `Free check`, time: `5 min` },
      ];
    }
    if (cat.includes('dex') || cat.includes('yield') || cat.includes('farm')) {
      return [
        { text: `Prepare a clean wallet with ${amount} USDC and gas on ${network}.`, cost: `~$2 gas`, time: `5 min` },
        { text: `Add liquidity to the primary pool on ${title} and stake the LP tokens.`, cost: `~$4-8 LP fees`, time: `12 min` },
        { text: `Hold liquidity position for ${duration} days with bi-weekly reward compounding.`, cost: `~$2 compound fee`, time: `${duration} days` },
        { text: `Check ${title} governance and reward claims portal.`, cost: `Free check`, time: `5 min` },
      ];
    }
    if (cat.includes('bridge')) {
      return [
        { text: `Transfer ${amount} USDC through ${title} from source chain to destination.`, cost: `~$3-8 bridge toll`, time: `10 min` },
        { text: `Execute at least 2 additional cross-chain swaps within 14 days.`, cost: `~$4-10 transfer fees`, time: `15 min` },
        { text: `Maintain cross-chain liquidity balance for ${duration} days.`, cost: `Capital locked`, time: `${duration} days` },
        { text: `Verify activity on official ${title} explorer.`, cost: `Free check`, time: `5 min` },
      ];
    }
    return [
      { text: `Fund a dedicated non-custodial address with ${amount} USDC on ${network}.`, cost: `~$2 gas`, time: `5 min` },
      { text: `Deposit ${amount} USDC into the core vaults of ${title}.`, cost: `~$3-5 gas`, time: `10 min` },
      { text: `Maintain position without withdrawal for at least ${duration} days.`, cost: `~$1-2 weekly gas`, time: `${duration} days` },
      { text: `Check official ${title} announcements for snapshot confirmation.`, cost: `Free check`, time: `5 min` },
    ];
  }

  function readUrlHash() {
    const hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    const params = new URLSearchParams(hash);
    if (params.has('q')) appState.query = params.get('q');
    if (params.has('category')) appState.categoryFilter = params.get('category');
    if (params.has('chain')) appState.chainFilter = params.get('chain');
    if (params.has('p')) appState.activeSlug = params.get('p');
  }

  function writeUrlHash() {
    const params = new URLSearchParams();
    if (appState.query) params.set('q', appState.query);
    if (appState.categoryFilter !== 'all') params.set('category', appState.categoryFilter);
    if (appState.chainFilter !== 'all') params.set('chain', appState.chainFilter);
    if (appState.activeSlug) params.set('p', appState.activeSlug);
    const queryStr = params.toString();
    if (queryStr) {
      window.history.replaceState(null, '', '#' + queryStr);
    } else {
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }
  }

  function filterRows() {
    const term = appState.query.trim().toLowerCase();
    return dataset.rows.filter((r) => {
      if (appState.categoryFilter !== 'all' && r.category !== appState.categoryFilter) return false;
      if (appState.chainFilter !== 'all' && (!r.chains || !r.chains.includes(appState.chainFilter))) return false;
      if (!term) return true;
      const haystack = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return haystack.includes(term);
    });
  }

  function sortRows(list) {
    const key = appState.sortCol;
    const direction = appState.sortDir;
    return list.slice().sort((a, b) => {
      let valA, valB;
      if (key === 'name') {
        valA = a.name.toLowerCase();
        valB = b.name.toLowerCase();
      } else if (key === 'tvl') {
        valA = a.tvl_usd;
        valB = b.tvl_usd;
      } else if (key === 'growth') {
        valA = a.change_7d === null ? -Infinity : a.change_7d;
        valB = b.change_7d === null ? -Infinity : b.change_7d;
      } else if (key === 'age') {
        valA = a.age_days === null ? Infinity : a.age_days;
        valB = b.age_days === null ? Infinity : b.age_days;
      } else if (key === 'confidence') {
        const rankMap = { high: 3, medium: 2, low: 1 };
        valA = rankMap[a.confidence] || 0;
        valB = rankMap[b.confidence] || 0;
      } else {
        valA = a.implied_value_usd;
        valB = b.implied_value_usd;
      }

      if (valA < valB) return -direction;
      if (valA > valB) return direction;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  function renderHeader() {
    return createElement('div', { class: 'sticky-header' },
      createElement('div', { class: 'shell top' },
        createElement('div', { class: 'brand' },
          createElement('span', { class: 'mark' }),
          createElement('span', { class: 'brand-name', text: 'Token Radar 01' })
        ),
        createElement('div', { class: 'top-metrics' },
          createElement('div', { class: 'metric-badge' },
            createElement('span', { text: 'Total TVL Stake' }),
            createElement('b', { text: formatUsd(dataset.total_tvl_stake) })
          ),
          createElement('div', { class: 'metric-badge' },
            createElement('span', { text: 'High Confidence' }),
            createElement('b', { text: `${dataset.high_confidence_count} protocols` })
          ),
          createElement('div', { class: 'metric-badge' },
            createElement('span', { text: 'Median Implied' }),
            createElement('b', { text: formatUsd(dataset.median_implied_value) })
          )
        )
      )
    );
  }

  function renderLede() {
    return createElement('section', { class: 'lede' },
      createElement('div', null,
        createElement('h1', { text: `${dataset.watchlist_size} Watchlist Protocols Ranked by Implied Value` }),
        createElement('p', {
          text: `Covering protocols with at least $${Math.round(dataset.floor_usd / 1e6)}M TVL and no active token. Early radar adds ${dataset.early_size} protocols below the floor. Valuations incorporate TVL, category modifiers, 7d growth, and youth urgency.`
        })
      ),
      createElement('div', { class: 'facts' },
        createElement('div', { class: 'fact' }, createElement('span', { text: 'Watchlist Size' }), createElement('b', { text: String(dataset.watchlist_size) })),
        createElement('div', { class: 'fact' }, createElement('span', { text: 'Board Rows' }), createElement('b', { text: String(dataset.board_size) })),
        createElement('div', { class: 'fact' }, createElement('span', { text: 'Early Pre-Token' }), createElement('b', { text: String(dataset.early_size) })),
        createElement('div', { class: 'fact' }, createElement('span', { text: 'Live Tokens' }), createElement('b', { text: String(dataset.live_size) }))
      )
    );
  }

  function renderControls() {
    const categories = Array.from(new Set(dataset.rows.map((r) => r.category || 'Other'))).sort();
    const chainSet = new Set();
    dataset.rows.forEach((r) => {
      if (r.chains) r.chains.forEach((c) => chainSet.add(c));
    });
    const chains = Array.from(chainSet).sort();

    const searchInput = createElement('input', {
      type: 'search',
      id: 'q',
      placeholder: 'Search name, category, chain...',
      value: appState.query,
      'aria-label': 'Search board',
      oninput: (e) => {
        appState.query = e.target.value;
        writeUrlHash();
        renderApp();
      },
    });

    const categorySelect = createElement('select', {
      id: 'category',
      'aria-label': 'Filter by category',
      onchange: (e) => {
        appState.categoryFilter = e.target.value;
        writeUrlHash();
        renderApp();
      },
    },
      createElement('option', { value: 'all', text: 'All categories' }),
      categories.map((c) => createElement('option', { value: c, text: c, selected: c === appState.categoryFilter ? 'selected' : null }))
    );

    const chainSelect = createElement('select', {
      id: 'chain',
      'aria-label': 'Filter by chain',
      onchange: (e) => {
        appState.chainFilter = e.target.value;
        writeUrlHash();
        renderApp();
      },
    },
      createElement('option', { value: 'all', text: 'All chains' }),
      chains.map((ch) => createElement('option', { value: ch, text: ch, selected: ch === appState.chainFilter ? 'selected' : null }))
    );

    const preBtn = createElement('button', {
      type: 'button',
      'aria-pressed': appState.activeTab === 'pre-token' ? 'true' : 'false',
      text: 'Pre-Token',
      onclick: () => {
        appState.activeTab = 'pre-token';
        renderApp();
      },
    });

    const liveBtn = createElement('button', {
      type: 'button',
      'aria-pressed': appState.activeTab === 'live' ? 'true' : 'false',
      text: 'Live Token',
      onclick: () => {
        appState.activeTab = 'live';
        renderApp();
      },
    });

    return createElement('div', { class: 'controls' },
      createElement('div', { class: 'field' }, createElement('label', { for: 'q', text: 'Search' }), searchInput),
      createElement('div', { class: 'field' }, createElement('label', { for: 'category', text: 'Category' }), categorySelect),
      createElement('div', { class: 'field' }, createElement('label', { for: 'chain', text: 'Chain' }), chainSelect),
      createElement('div', { class: 'field' }, createElement('span', { class: 'sub', text: 'View Mode' }), createElement('div', { class: 'tabs' }, preBtn, liveBtn)),
      createElement('span', { class: 'count', text: appState.activeTab === 'pre-token' ? `${filterRows().length} protocols shown` : `${dataset.live.length} live tokens` })
    );
  }

  function createSortHeader(key, label) {
    const isActive = appState.sortCol === key;
    const indicator = isActive ? (appState.sortDir < 0 ? ' ▼' : ' ▲') : '';
    return createElement('th', { scope: 'col' },
      createElement('button', {
        type: 'button',
        onclick: () => {
          if (appState.sortCol === key) {
            appState.sortDir = -appState.sortDir;
          } else {
            appState.sortCol = key;
            appState.sortDir = -1;
          }
          renderApp();
        },
      }, label + indicator)
    );
  }

  function renderBoardTable() {
    const list = sortRows(filterRows());
    if (list.length === 0) {
      return createElement('div', { class: 'panel' },
        createElement('div', { class: 'empty' },
          createElement('h2', { text: 'No protocols match your search or filter' }),
          createElement('p', { text: 'Try relaxing your search query or resetting category and chain filters.' }),
          createElement('button', {
            class: 'button primary',
            type: 'button',
            text: 'Reset Filters',
            onclick: () => {
              appState.query = '';
              appState.categoryFilter = 'all';
              appState.chainFilter = 'all';
              writeUrlHash();
              renderApp();
            },
          })
        )
      );
    }

    const maxValue = list[0].implied_value_usd || 1;
    const tbody = createElement('tbody');

    list.forEach((r) => {
      const chg = r.change_7d;
      const chgClass = chg === null ? '' : chg >= 0 ? 'pos' : 'neg';
      const confBadge = `badge badge-${r.confidence}`;
      const svgTrend = `<svg width="40" height="16" viewBox="0 0 40 16"><path d="M2 12 L12 ${chg !== null && chg > 0 ? '4' : '12'} L22 8 L38 3" fill="none" stroke="${chg !== null && chg >= 0 ? '#10b981' : '#ef4444'}" stroke-width="1.5"/></svg>`;

      const rowEl = createElement('tr', {
        'data-selected': appState.activeSlug === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: () => openDetailModal(r.slug),
        onkeydown: (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            openDetailModal(r.slug);
          }
        },
      },
        createElement('td', { class: 'num', text: String(r.rank) }),
        createElement('td', null,
          createElement('div', { class: 'name' },
            createElement('b', { text: r.name }),
            createElement('span', { class: 'sub', text: `${r.category || 'Other'} on ${r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'multi-chain'}` })
          )
        ),
        createElement('td', { class: 'num', text: formatUsd(r.tvl_usd) }),
        createElement('td', { class: `num ${chgClass}`, text: formatPct(chg) }),
        createElement('td', { class: 'num', text: formatAge(r.age_days) }),
        createElement('td', null, createElement('span', { class: confBadge, text: r.confidence })),
        createElement('td', null,
          createElement('div', { class: 'bar-cell' },
            createElement('div', { class: 'bar', 'aria-hidden': 'true' },
              createElement('i', { style: `width:${Math.max(4, Math.round((r.implied_value_usd / maxValue) * 100))}%` })
            ),
            createElement('span', { class: 'num', text: formatUsd(r.implied_value_usd) })
          )
        ),
        createElement('td', null, createElement('div', { class: 'sparkline', html: svgTrend }))
      );
      tbody.appendChild(rowEl);
    });

    return createElement('div', { class: 'panel' },
      createElement('div', { class: 'table-wrap' },
        createElement('table', null,
          createElement('caption', { class: 'sub', text: 'Ranked pre-token protocols. Click any row for valuation breakdown and step-by-step farm plan.' }),
          createElement('thead', null,
            createElement('tr', null,
              createSortHeader('implied', 'Rank'),
              createSortHeader('name', 'Protocol'),
              createSortHeader('tvl', 'TVL'),
              createSortHeader('growth', '7d %'),
              createSortHeader('age', 'Age'),
              createSortHeader('confidence', 'Conf'),
              createSortHeader('implied', 'Implied Value'),
              createElement('th', { scope: 'col', text: 'Trend' })
            )
          ),
          tbody
        )
      )
    );
  }

  function renderLiveTable() {
    const tbody = createElement('tbody');
    dataset.live.forEach((item) => {
      const chg = item.change_7d;
      const chgClass = chg === null ? '' : chg >= 0 ? 'pos' : 'neg';
      tbody.appendChild(
        createElement('tr', null,
          createElement('td', { class: 'num', text: 'live' }),
          createElement('td', null,
            createElement('div', { class: 'name' },
              createElement('b', { text: item.name }),
              createElement('span', { class: 'sub', text: `${item.category || 'Other'} on ${item.chains && item.chains.length ? item.chains.slice(0, 2).join(', ') : 'multi-chain'}` })
            )
          ),
          createElement('td', { class: 'num', text: formatUsd(item.tvl_usd) }),
          createElement('td', { class: `num ${chgClass}`, text: formatPct(chg) }),
          createElement('td', { class: 'num', text: formatUsd(item.mcap_usd) }),
          createElement('td', null, createElement('span', { class: 'badge badge-high', text: 'Trading' }))
        )
      );
    });

    return createElement('div', { class: 'panel' },
      createElement('div', { class: 'table-wrap' },
        createElement('table', null,
          createElement('caption', { class: 'sub', text: 'Live tokens set aside from pre-token scoring model.' }),
          createElement('thead', null,
            createElement('tr', null,
              createElement('th', { scope: 'col', text: 'Status' }),
              createElement('th', { scope: 'col', text: 'Protocol' }),
              createElement('th', { scope: 'col', text: 'TVL' }),
              createElement('th', { scope: 'col', text: '7d' }),
              createElement('th', { scope: 'col', text: 'Market Cap' }),
              createElement('th', { scope: 'col', text: 'Token' })
            )
          ),
          tbody
        )
      )
    );
  }

  function renderModelPanel() {
    const m = dataset.model;
    return createElement('section', { class: 'panel model' },
      createElement('h2', { text: 'Valuation Methodology & Model Parameters' }),
      createElement('p', { class: 'sub', text: 'Implied valuation is calculated deterministically from multi-chain TVL, category weighting, clamped 7d growth, and youth velocity.' }),
      createElement('div', { class: 'formula' },
        `implied = round( tvl_usd × ${m.base_multiple} × category_multiplier × (1 + clamp(change_7d, ${m.growth_floor}, ${m.growth_cap}) / 100 × ${m.growth_weight}) × urgency_factor )`
      ),
      createElement('p', { class: 'sub', text: `Model version: ${dataset.model_version}. Confidence tiers reflect data completeness across category, chains, listing date, and 7d metrics.` })
    );
  }

  const modalDialog = createElement('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
  modalDialog.addEventListener('close', () => {
    appState.activeSlug = null;
    writeUrlHash();
  });

  function openDetailModal(slug) {
    const row = dataset.rows.find((r) => r.slug === slug);
    if (!row) return;
    appState.activeSlug = slug;
    writeUrlHash();
    modalDialog.textContent = '';

    const steps = generateFarmSteps(row);

    modalDialog.appendChild(
      createElement('div', { class: 'detail-head' },
        createElement('div', null,
          createElement('span', { class: 'brand-name', text: `Rank ${row.rank} of ${dataset.board_size} (Confidence: ${row.confidence.toUpperCase()})` }),
          createElement('h2', { id: 'detail-title', text: row.name }),
          createElement('p', { class: 'sub', text: `${row.category || 'Other'} on ${row.chains && row.chains.length ? row.chains.join(', ') : 'multi-chain'}` })
        ),
        createElement('button', {
          class: 'close',
          type: 'button',
          'aria-label': 'Close dialog',
          text: '✕',
          onclick: () => modalDialog.close(),
        })
      )
    );

    modalDialog.appendChild(
      createElement('section', { class: 'detail-section' },
        createElement('h3', { text: 'Why this protocol is ranked' }),
        createElement('p', { class: 'sub', text: row.why })
      )
    );

    modalDialog.appendChild(
      createElement('section', { class: 'detail-section' },
        createElement('h3', { text: 'Valuation Equation Factors' }),
        createElement('div', { class: 'equation' },
          createElement('div', null, createElement('span', { text: 'TVL (USD)' }), createElement('b', { class: 'num', text: formatUsd(row.tvl_usd) })),
          createElement('div', null, createElement('span', { text: '7-Day Change' }), createElement('b', { class: `num ${row.change_7d !== null && row.change_7d >= 0 ? 'pos' : 'neg'}`, text: formatPct(row.change_7d) })),
          createElement('div', null, createElement('span', { text: 'Protocol Age' }), createElement('b', { class: 'num', text: formatAge(row.age_days) })),
          createElement('div', null, createElement('span', { text: 'Growth Multiplier' }), createElement('b', { class: 'num', text: String(row.growth_multiplier) })),
          createElement('div', null, createElement('span', { text: 'Urgency Factor' }), createElement('b', { class: 'num', text: String(row.urgency_factor) })),
          createElement('div', null, createElement('span', { text: 'Implied Valuation' }), createElement('b', { class: 'num', text: formatUsd(row.implied_value_usd) }))
        ),
        createElement('p', { class: 'sub', text: `Engine version ${dataset.model_version}. Confidence tier: ${row.confidence.toUpperCase()}.` })
      )
    );

    modalDialog.appendChild(
      createElement('section', { class: 'detail-section' },
        createElement('h3', { text: 'Recommended Farm Plan' }),
        createElement('ol', { class: 'steps' },
          steps.map((s) =>
            createElement('li', null,
              createElement('b', { text: s.text }),
              createElement('span', { class: 'cost', text: `Cost: ${s.cost} | Time: ${s.time}` })
            )
          )
        )
      )
    );

    if (typeof modalDialog.showModal === 'function') {
      if (!modalDialog.open) modalDialog.showModal();
    } else {
      modalDialog.setAttribute('open', '');
    }
  }

  function renderApp() {
    rootEl.textContent = '';
    const mainShell = createElement('div', { class: 'shell' });
    mainShell.appendChild(renderLede());
    mainShell.appendChild(renderControls());
    mainShell.appendChild(appState.activeTab === 'pre-token' ? renderBoardTable() : renderLiveTable());
    if (appState.activeTab === 'pre-token') mainShell.appendChild(renderModelPanel());

    rootEl.appendChild(renderHeader());
    rootEl.appendChild(mainShell);
    rootEl.setAttribute('aria-busy', 'false');

    if (!modalDialog.isConnected) rootEl.appendChild(modalDialog);
    if (appState.activeSlug) openDetailModal(appState.activeSlug);
  }

  readUrlHash();
  renderApp();

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modalDialog.open) {
      modalDialog.close();
    }
  });
})();
