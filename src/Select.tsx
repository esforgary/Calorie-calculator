import { Children, Fragment, isValidElement, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent, ReactNode } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";
import "./select.css";

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

interface SelectProps {
  value: string;
  onValueChange: (value: string) => void;
  options?: SelectOption[];
  children?: ReactNode;
  id?: string;
  name?: string;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
}

function optionChildren(children: ReactNode): SelectOption[] {
  const result: SelectOption[] = [];
  Children.forEach(children, (child) => {
    if (!isValidElement<{ value?: string; disabled?: boolean; children?: ReactNode }>(child)) return;
    if (child.type === Fragment) result.push(...optionChildren(child.props.children));
    else if (child.type === "option") result.push({
      value: String(child.props.value ?? ""),
      label: Children.toArray(child.props.children).join(""),
      disabled: child.props.disabled,
    });
  });
  return result;
}

/** Single-value select. Focus stays on the trigger while the active option is announced. */
export function CustomSelect({ value, onValueChange, options: suppliedOptions, children, className = "", placeholder = "Выберите вариант", disabled, required, name, ...aria }: SelectProps) {
  const options = suppliedOptions ?? optionChildren(children);
  const generatedId = useId();
  const listId = `${generatedId}-options`;
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const search = useRef({ text: "", time: 0 });
  const [open, setOpen] = useState(false);
  const [present, setPresent] = useState(false);
  const [active, setActive] = useState(-1);
  const [position, setPosition] = useState<CSSProperties>({ visibility: "hidden" });
  const selected = options.findIndex((option) => option.value === value);
  const enabled = options.map((option, index) => option.disabled ? -1 : index).filter((index) => index >= 0);
  const activeId = active >= 0 ? `${listId}-${active}` : undefined;

  const show = (fromEnd = false) => {
    if (disabled || !enabled.length) return;
    setActive(selected >= 0 && !options[selected].disabled ? selected : (fromEnd ? enabled.at(-1)! : enabled[0]));
    setPresent(true);
    setOpen(true);
    search.current = { text: "", time: 0 };
  };

  const choose = (index: number) => {
    if (!options[index] || options[index].disabled) return;
    onValueChange(options[index].value);
    setOpen(false);
    trigger.current?.focus({ preventScroll: true });
  };

  useEffect(() => {
    if (open || !present) return;
    const timer = window.setTimeout(() => setPresent(false), 160);
    return () => window.clearTimeout(timer);
  }, [open, present]);

  useLayoutEffect(() => {
    if (!present) return;
    // The top layer escapes scrolling containers, while the portal stays inside
    // a modal's accessibility tree. Fixed positioning is the older-browser fallback.
    const element = menu.current;
    if (element?.showPopover && !element.matches(":popover-open")) element.showPopover();
    const reposition = () => {
      const rect = trigger.current?.getBoundingClientRect();
      if (!rect) return;
      const viewport = window.visualViewport;
      const width = viewport?.width ?? window.innerWidth;
      const height = viewport?.height ?? window.innerHeight;
      const offsetTop = viewport?.offsetTop ?? 0;
      const offsetLeft = viewport?.offsetLeft ?? 0;
      const below = height + offsetTop - rect.bottom - 14;
      const above = rect.top - offsetTop - 14;
      const up = below < 200 && above > below;
      const maxHeight = Math.min(300, Math.max(64, up ? above : below));
      const menuHeight = Math.min(maxHeight, element?.scrollHeight || 300);
      const menuWidth = Math.min(rect.width, width - 24);
      setPosition({
        width: menuWidth,
        maxHeight,
        left: Math.min(Math.max(offsetLeft + 12, rect.left), offsetLeft + width - menuWidth - 12),
        top: up ? Math.max(offsetTop + 12, rect.top - menuHeight - 6) : rect.bottom + 6,
        transformOrigin: up ? "bottom center" : "top center",
      });
    };
    reposition();
    const handleScroll = (event: Event) => {
      if (!menu.current?.contains(event.target as Node)) reposition();
    };
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", handleScroll, true);
    window.visualViewport?.addEventListener("resize", reposition);
    window.visualViewport?.addEventListener("scroll", reposition);
    return () => {
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", handleScroll, true);
      window.visualViewport?.removeEventListener("resize", reposition);
      window.visualViewport?.removeEventListener("scroll", reposition);
    };
  }, [present, options.length]);

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!trigger.current?.contains(event.target as Node) && !menu.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);

  useLayoutEffect(() => {
    if (!open || active < 0) return;
    const option = menu.current?.querySelector<HTMLElement>(`[data-index="${active}"]`);
    if (option && menu.current) {
      const top = option.offsetTop;
      const bottom = top + option.offsetHeight;
      if (top < menu.current.scrollTop) menu.current.scrollTop = top;
      else if (bottom > menu.current.scrollTop + menu.current.clientHeight) menu.current.scrollTop = bottom - menu.current.clientHeight;
    }
  }, [active, open]);

  const handleKey = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "Tab") { setOpen(false); return; }
    if (event.key === "Escape" && open) {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      return;
    }
    if (["ArrowDown", "ArrowUp", "Home", "End", "Enter", " "].includes(event.key)) {
      event.preventDefault();
      if (!open) { show(event.key === "ArrowUp" || event.key === "End"); return; }
      if (event.key === "Enter" || event.key === " ") { choose(active); return; }
      const current = enabled.indexOf(active);
      if (event.key === "Home") setActive(enabled[0] ?? -1);
      else if (event.key === "End") setActive(enabled.at(-1) ?? -1);
      else setActive(enabled[(current + (event.key === "ArrowDown" ? 1 : -1) + enabled.length) % enabled.length] ?? -1);
      return;
    }
    if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      if (!open) show();
      const now = Date.now();
      const next = now - search.current.time > 600 ? event.key : search.current.text + event.key;
      search.current = { text: next.toLocaleLowerCase("ru"), time: now };
      const match = enabled.find((index) => options[index].label.toLocaleLowerCase("ru").startsWith(search.current.text));
      if (match !== undefined) setActive(match);
    }
  };

  const portalTarget = trigger.current?.closest('[role="dialog"]') ?? document.body;
  return <>
    <button
      {...aria}
      ref={trigger}
      type="button"
      className={`input custom-select ${className}`}
      role="combobox"
      aria-expanded={open}
      aria-controls={present ? listId : undefined}
      aria-haspopup="listbox"
      aria-activedescendant={open ? activeId : undefined}
      aria-required={required || undefined}
      disabled={disabled}
      onClick={() => open ? setOpen(false) : show()}
      onKeyDown={handleKey}
      onBlur={() => setOpen(false)}
    >
      <span className="custom-select-value">{options[selected]?.label ?? placeholder}</span>
      <ChevronDown className="custom-select-chevron" size={17} aria-hidden="true" />
    </button>
    {name && <input type="hidden" name={name} value={value} />}
    {present && createPortal(<div
      id={listId}
      ref={menu}
      role="listbox"
      aria-label={aria["aria-label"]}
      aria-labelledby={aria["aria-labelledby"]}
      aria-hidden={!open || undefined}
      popover="manual"
      className="custom-select-menu"
      data-state={open ? "open" : "closed"}
      style={position}
      onPointerDown={(event) => event.preventDefault()}
      onClick={(event) => event.stopPropagation()}
    >{options.map((option, index) => <div
      id={`${listId}-${index}`}
      key={`${option.value}-${index}`}
      role="option"
      aria-selected={option.value === value}
      aria-disabled={option.disabled || undefined}
      data-index={index}
      data-active={active === index || undefined}
      className="custom-select-option"
      style={{ "--option-delay": `${Math.min(index, 7) * 18}ms` } as CSSProperties}
      onPointerMove={() => !option.disabled && setActive(index)}
      onClick={() => choose(index)}
    ><span>{option.label}</span>{option.value === value && <Check size={16} aria-hidden="true" />}</div>)}</div>, portalTarget)}
  </>;
}
