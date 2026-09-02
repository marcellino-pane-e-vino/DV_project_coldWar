export function createInteractiveLegend(containerId, items, options = {}) {
  const root = document.getElementById(containerId);
  if (!root) return { setActive(){}, destroy(){} };
  root.innerHTML = "";
  const { activeKey = null, onToggle = null, clickable = true } = options;
  let current = activeKey;

  function render() {
    root.innerHTML = "";
    items.forEach(item => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'cw-legend-item';
      btn.dataset.key = item.key;
      if (!clickable) btn.disabled = true;
      if (current && current !== item.key) btn.classList.add('is-dimmed');
      if (current === item.key) btn.classList.add('is-active');
      btn.innerHTML = `<span class="cw-legend-swatch ${item.swatchClass || ''}"></span><span>${item.label}</span>`;
      if (clickable) {
        btn.addEventListener('click', () => {
          current = current === item.key ? null : item.key;
          render();
          onToggle?.(current);
        });
      }
      root.appendChild(btn);
    });
  }

  render();
  return {
    setActive(key) { current = key; render(); },
    destroy() { root.innerHTML = ""; }
  };
}
