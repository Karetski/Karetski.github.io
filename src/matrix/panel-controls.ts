import type { MatrixConfig } from './config';
import { state } from './state';

export const rgbToHex = ([r, g, b]: number[] | readonly number[]): string =>
  '#' + [r, g, b].map((n) => Math.max(0, Math.min(255, n! | 0)).toString(16).padStart(2, '0')).join('');

export const hexToRgb = (hex: string): [number, number, number] => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

export interface SliderEntry {
  key: keyof MatrixConfig;
  input: HTMLInputElement;
  valEl: HTMLSpanElement;
  step: number;
}

export const fmt = (v: number, step: number): string =>
  step >= 1 ? String(v | 0) : v.toFixed(step >= 0.01 ? 3 : 4);

export const makeSection = (body: HTMLElement) =>
  (label: string): void => {
    const h = document.createElement('div');
    h.textContent = label;
    h.style.cssText = 'opacity: 0.5; margin: 12px 0 4px; text-transform: uppercase; font-size: 9px; letter-spacing: 0.1em;';
    body.appendChild(h);
  };

export const makeSlider = (body: HTMLElement, sliders: SliderEntry[]) =>
  (
    label: string,
    key: keyof MatrixConfig,
    min: number,
    max: number,
    step: number,
    onChange?: () => void,
  ): void => {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'margin-bottom: 6px;';
    const labelRow = document.createElement('div');
    labelRow.style.cssText = 'display: flex; justify-content: space-between; font-size: 10px; margin-bottom: 1px;';
    const labelEl = document.createElement('span');
    labelEl.textContent = label;
    const valEl = document.createElement('span');
    valEl.style.opacity = '0.7';
    valEl.textContent = fmt(state.config[key] as number, step);
    labelRow.append(labelEl, valEl);
    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(state.config[key]);
    input.style.cssText = 'width: 100%; accent-color: #ff195f;';
    input.oninput = () => {
      const v = parseFloat(input.value);
      (state.config as unknown as Record<string, number>)[key as string] = v;
      valEl.textContent = fmt(v, step);
      if (onChange) onChange();
    };
    wrap.append(labelRow, input);
    body.appendChild(wrap);
    sliders.push({ key, input, valEl, step });
  };

export const makeColorRow = (body: HTMLElement) =>
  (
    label: string,
    getter: () => number[] | readonly number[],
    setter: (v: [number, number, number]) => void,
    onChange: () => void,
  ): HTMLInputElement => {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; font-size: 10px;';
    const labelEl = document.createElement('span');
    labelEl.textContent = label;
    const input = document.createElement('input');
    input.type = 'color';
    input.value = rgbToHex(getter());
    input.style.cssText = 'width: 36px; height: 20px; border: 1px solid #444; padding: 0; cursor: pointer; background: none;';
    input.oninput = () => {
      setter(hexToRgb(input.value));
      onChange();
    };
    wrap.append(labelEl, input);
    body.appendChild(wrap);
    return input;
  };
