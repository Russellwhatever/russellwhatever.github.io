(() => {
  const normalize = value => value.normalize('NFKC').toLocaleLowerCase().trim();
  const collator = new Intl.Collator('zh-CN', { numeric: true, sensitivity: 'base' });
  const dateValue = value => {
    const timestamp = Date.parse(value);
    return Number.isFinite(timestamp) ? timestamp : null;
  };
  const numberValue = value => {
    if (value == null || value.trim() === '') return null;
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? number : null;
  };
  const compare = (a, b, ascending = false) => {
    // Missing dates/playtime always come last, in either direction.
    if (a === null) return b === null ? 0 : 1;
    if (b === null) return -1;
    return ascending ? a - b : b - a;
  };

  // Assign cards left-to-right, then continue below the previous card in each column.
  // Keep DOM order intact so keyboard navigation follows the selected sort order.
  const masonryLayouts = new WeakMap();
  document.querySelectorAll('.card-grid:not(.card-grid--games)').forEach(grid => {
    let frame = null;
    let observedWidth = -1;
    let cards = [];
    const schedule = () => {
      if (frame !== null) return;
      frame = requestAnimationFrame(() => {
        frame = null;
        layout();
      });
    };
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(entries => {
      for (const entry of entries) {
        if (entry.target !== grid || entry.contentRect.width !== observedWidth) {
          if (entry.target === grid) observedWidth = entry.contentRect.width;
          schedule();
        }
      }
    });

    function layout() {
      const width = grid.clientWidth;
      if (!width) return;
      const styles = getComputedStyle(grid);
      const gap = parseFloat(styles.columnGap) || 12;
      const minWidth = parseFloat(styles.getPropertyValue('--card-min-width')) || 200;
      const columns = Math.max(1, Math.min(cards.length, Math.floor((width + gap) / (minWidth + gap))));
      const cardWidth = (width - gap * (columns - 1)) / columns;
      const heights = Array(columns).fill(0);
      grid.classList.add('card-grid--masonry');
      // Set all widths before measuring: images and text determine natural height.
      cards.forEach(card => { card.style.width = `${cardWidth}px`; });
      const cardHeights = cards.map(card => card.offsetHeight);
      cards.forEach((card, index) => {
        const column = index % columns;
        card.style.left = `${column * (cardWidth + gap)}px`;
        card.style.top = `${heights[column]}px`;
        heights[column] += cardHeights[index] + gap;
      });
      grid.style.height = `${Math.max(0, ...heights) - (cards.length ? gap : 0)}px`;
    }

    function refresh() {
      cards = Array.from(grid.children);
      if (observer) {
        observer.disconnect();
        observer.observe(grid);
        cards.forEach(card => observer.observe(card));
      }
      schedule();
    }

    grid.addEventListener('load', schedule, true);
    grid.addEventListener('error', schedule, true);
    window.addEventListener('resize', schedule);
    if (document.fonts) document.fonts.ready.then(schedule);
    masonryLayouts.set(grid, { refresh });
    refresh();
  });

  document.querySelectorAll('[data-record-browser]').forEach(browser => {
    const grid = browser.querySelector('[data-record-grid]');
    const search = browser.querySelector('[data-record-search]');
    const sort = browser.querySelector('[data-record-sort]');
    const count = browser.querySelector('[data-record-count]');
    const empty = browser.querySelector('[data-record-empty]');
    const records = Array.from(grid.children).map((node, index) => ({
      node,
      index,
      title: node.dataset.title || '',
      search: normalize(`${node.dataset.title || ''} ${node.dataset.tags || ''} ${node.textContent}`),
      date: dateValue(node.dataset.date),
      lastPlayed: dateValue(node.dataset.lastPlayed),
      playtime: numberValue(node.dataset.playtime),
      rating: numberValue(node.dataset.rating) || null,
    }));
    sort.value = browser.dataset.defaultSort;

    function render() {
      const words = normalize(search.value).split(/\s+/).filter(Boolean);
      const matches = records.filter(record => words.every(word => record.search.includes(word)));
      matches.sort((a, b) => {
        let result = 0;
        switch (sort.value) {
          case 'last-played': result = compare(a.lastPlayed, b.lastPlayed) || compare(a.playtime, b.playtime); break;
          case 'playtime-desc': result = compare(a.playtime, b.playtime); break;
          case 'playtime-asc': result = compare(a.playtime, b.playtime, true); break;
          case 'newest': result = compare(a.date, b.date); break;
          case 'oldest': result = compare(a.date, b.date, true); break;
          case 'rating': result = compare(a.rating, b.rating); break;
          case 'title': result = collator.compare(a.title, b.title); break;
        }
        return result || collator.compare(a.title, b.title) || a.index - b.index;
      });
      grid.replaceChildren(...matches.map(record => record.node));
      masonryLayouts.get(grid)?.refresh();
      count.textContent = words.length
        ? `找到 ${matches.length} 项 · 共 ${records.length} 项`
        : `共 ${records.length} 项`;
      empty.hidden = matches.length !== 0;
    }

    search.addEventListener('input', render);
    sort.addEventListener('change', render);
    render();
    browser.querySelector('[data-record-controls]').hidden = false;
  });
})();
