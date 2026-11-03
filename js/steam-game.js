/* Per-game chart. All Steam requests and interval calculation happen in Actions. */
(() => {
  const SVG = "http://www.w3.org/2000/svg";
  const dateTime = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  });
  const day = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit",
  });
  function node(tag, attributes = {}, text = "") {
    const element = document.createElementNS(SVG, tag);
    for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
    if (text) element.textContent = text;
    return element;
  }
  function duration(minutes) {
    if (minutes === null) return "计数调整，无法确定";
    return `${Math.floor(minutes / 60)} 小时 ${minutes % 60} 分钟`;
  }
  function draw(container, data) {
    const status = container.querySelector(".steam-chart-status");
    const drawing = container.querySelector(".steam-chart-drawing");
    const table = container.querySelector("tbody");
    const details = container.querySelector(".steam-chart-details");
    const range = container.querySelector("select").value;
    // Anchor to the latest observation, not the visitor's current date.
    const cutoff = range === "all" ? 0 : data.updated - Number(range) * 86400;
    const rows = data.intervals.filter(item => item.end > cutoff);
    drawing.replaceChildren();
    table.replaceChildren();
    details.hidden = rows.length === 0;
    if (!rows.length) {
      status.textContent = `已于 ${day.format(data.first_sample * 1000)} 建立时长基线；等待下一次同步后生成柱状图。`;
      return;
    }
    const start = rows[0].start;
    const end = rows[rows.length - 1].end;
    const width = 900, left = 62, right = 18, top = 22, bottom = 200;
    const plot = width - left - right;
    const maxHours = Math.max(1, ...rows.map(row => (row.minutes || 0) / 60));
    const ceiling = Math.ceil(maxHours * 2) / 2;
    const x = timestamp => left + (timestamp - start) / Math.max(1, end - start) * plot;
    const height = hours => hours / ceiling * (bottom - top);
    const chart = node("svg", { viewBox: `0 0 ${width} 250`, role: "img", "aria-label": "游玩时长柱状图：横轴为同步区间，纵轴为新增小时数；详细数据见下方表格。" });
    for (let tick = 0; tick <= 4; tick++) {
      const hours = ceiling * tick / 4;
      const y = bottom - height(hours);
      chart.append(node("line", { x1: left, y1: y, x2: width - right, y2: y, class: "steam-gridline" }));
      chart.append(node("text", { x: left - 8, y: y + 4, "text-anchor": "end" }, `${hours.toFixed(1)} h`));
    }
    for (const row of rows) {
      const label = `${dateTime.format(row.start * 1000)} → ${dateTime.format(row.end * 1000)}：${duration(row.minutes)}${row.status === "gap" ? "（跨多天合计）" : ""}`;
      const barHeight = row.minutes === null ? 7 : Math.max(2, height(row.minutes / 60));
      const bar = node("rect", {
        x: x(row.start) + 0.5, y: bottom - barHeight,
        width: Math.max(0.5, x(row.end) - x(row.start) - 1), height: barHeight,
        class: `steam-bar steam-bar-${row.status}${row.minutes === 0 ? " steam-bar-zero" : ""}`,
      });
      bar.append(node("title", {}, label));
      chart.append(bar);
      const tr = document.createElement("tr");
      for (const text of [dateTime.format(row.start * 1000), dateTime.format(row.end * 1000), duration(row.minutes) + (row.status === "gap" ? "（跨多天合计）" : "")]) {
        const td = document.createElement("td");
        td.textContent = text;
        tr.append(td);
      }
      table.append(tr);
    }
    for (let tick = 0; tick <= 3; tick++) {
      const at = start + (end - start) * tick / 3;
      chart.append(node("text", { x: x(at), y: 226, "text-anchor": tick === 0 ? "start" : tick === 3 ? "end" : "middle" }, day.format(at * 1000)));
    }
    drawing.append(chart);
    const total = rows.reduce((sum, row) => sum + (row.minutes || 0), 0);
    const adjustment = rows.some(row => row.status === "counter-adjusted");
    status.textContent = `已记录 ${rows.length} 个区间，已知新增 ${duration(total)}。橙色为跨多天合计，灰色为计数调整。${adjustment ? "计数调整区间未计入合计。" : ""}`;
  }
  for (const container of document.querySelectorAll("[data-steam-chart]")) {
    fetch(container.dataset.steamChart)
      .then(response => {
        if (!response.ok) throw new Error("Unavailable");
        return response.json();
      })
      .then(data => {
        if (!Array.isArray(data.intervals)) throw new Error("Invalid chart data");
        draw(container, data);
        container.querySelector("select").addEventListener("change", () => draw(container, data));
      })
      .catch(() => {
        container.querySelector(".steam-chart-status").textContent = "游玩记录暂时无法读取，请稍后刷新。";
      });
  }
})();
