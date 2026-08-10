"use client";

export function ToggleSwitch({
  on,
  onChange,
  disabled = false,
  label,
}: {
  on: boolean;
  onChange?: (next: boolean) => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      aria-checked={on}
      aria-label={label}
      className={`toggle ${on ? "is-on" : ""}`}
      disabled={disabled || !onChange}
      onClick={() => onChange?.(!on)}
      role="switch"
      type="button"
    >
      <span className="toggle__thumb" />
    </button>
  );
}
