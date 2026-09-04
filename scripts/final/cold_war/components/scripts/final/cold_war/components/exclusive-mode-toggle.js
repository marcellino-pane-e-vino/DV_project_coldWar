export function createExclusiveModeToggle({
  containerId,
  label,
  options,
  initialValue,
  onChange = () => {}
}) {
  const host = document.getElementById(containerId);

  if (!host) {
    throw new Error(`Exclusive mode toggle host not found: ${containerId}`);
  }

  if (!Array.isArray(options) || options.length < 2) {
    throw new Error(
      "Exclusive mode toggle requires at least two options."
    );
  }

  const optionsByValue = new Map(options.map(option => [option.value, option]));

  if (!optionsByValue.has(initialValue)) {
    throw new Error(
      `Exclusive mode toggle initial value is invalid: ${initialValue}`
    );
  }

  let value = initialValue;

  const root = document.createElement("div");
  root.className = "cw-exclusive-toggle";

  const labelElement = document.createElement("div");
  labelElement.className = "cw-exclusive-toggle__label";
  labelElement.textContent = label;

  const choices = document.createElement("div");
  choices.className = "cw-exclusive-toggle__choices";
  choices.setAttribute("role", "group");
  choices.setAttribute("aria-label", label);

  const buttons = new Map();

  function updateButtons() {
    buttons.forEach((button, optionValue) => {
      const isActive = optionValue === value;
      button.setAttribute("aria-pressed", String(isActive));
    });
  }

  function setValue(nextValue, { emit = true } = {}) {
    if (!optionsByValue.has(nextValue)) {
      throw new Error(
        `Exclusive mode toggle value is invalid: ${nextValue}`
      );
    }

    if (nextValue === value) return;

    value = nextValue;
    updateButtons();

    if (emit) onChange(value);
  }

  for (const option of options) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "cw-exclusive-toggle__button";
    button.textContent = option.label;
    button.dataset.value = option.value;
    button.style.setProperty("--cw-toggle-accent", option.accent);

    button.addEventListener("click", () => {
      setValue(option.value);
    });

    buttons.set(option.value, button);
    choices.append(button);
  }

  root.append(labelElement, choices);
  host.replaceChildren(root);

  updateButtons();

  return {
    getValue: () => value,
    setValue,
    destroy() {
      host.replaceChildren();
    }
  };
}