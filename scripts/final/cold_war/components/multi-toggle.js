export function createMultiToggle({ containerId, label, options, initialValues, onChange = () => {} }) {
  const host = document.getElementById(containerId);
  if (!host) throw new Error(`Multi-toggle host not found: ${containerId}`);

  const values = new Set(options.map(option => option.value));
  const selected = new Set(initialValues);
  if ([...selected].some(value => !values.has(value))) {
    throw new Error("Multi-toggle initial value is invalid.");
  }

  const choices = document.createElement("div");
  choices.className = "cw-multi-toggle";
  choices.setAttribute("role", "group");
  choices.setAttribute("aria-label", label);
  const buttons = new Map();

  function updateButtons() {
    buttons.forEach((button, value) => {
      button.setAttribute("aria-pressed", String(selected.has(value)));
    });
  }

  function emit() { onChange(new Set(selected)); }

  for (const option of options) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "cw-multi-toggle__button";
    button.dataset.value = option.value;
    button.innerHTML = `<span class="cw-multi-toggle__symbol is-${option.symbol}" aria-hidden="true"></span><span>${option.label}</span>`;
    button.addEventListener("click", () => {
      if (selected.has(option.value)) selected.delete(option.value);
      else selected.add(option.value);
      updateButtons();
      emit();
    });
    buttons.set(option.value, button);
    choices.append(button);
  }

  host.replaceChildren(choices);
  updateButtons();
  return { getValues: () => new Set(selected) };
}
