import { afterEach, describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useThemeColor } from './useThemeColor';

const themeColor = () => document.querySelector('meta[name="theme-color"]')?.getAttribute('content') ?? null;

describe('useThemeColor', () => {
  afterEach(() => {
    document.head.querySelectorAll('meta[name="theme-color"]').forEach((meta) => meta.remove());
  });

  it('sets the colour while mounted and restores the previous one', () => {
    const meta = document.createElement('meta');
    meta.name = 'theme-color';
    meta.content = '#2855B1';
    document.head.appendChild(meta);

    const { unmount } = renderHook(() => useThemeColor('#0D1830'));
    expect(themeColor()).toBe('#0D1830');
    unmount();
    expect(themeColor()).toBe('#2855B1');
  });

  it('adds the meta tag when the page has none, and removes it again', () => {
    const { unmount } = renderHook(() => useThemeColor('#0D1830'));
    expect(themeColor()).toBe('#0D1830');
    unmount();
    expect(themeColor()).toBeNull();
  });
});
