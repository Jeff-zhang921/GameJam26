import { test, expect } from 'bun:test';
import { viewportBounds } from '../public/viewport.js';

test('fractional edges cover the last screen pixel instead of exposing the root background', () => {
  expect(viewportBounds({ width: 1193.75, height: 833.5 }, { width: 1194, height: 834 })).toEqual({ left: 0, top: 0, width: 1194, height: 834 });
  const rect = viewportBounds({ width: 843.4, height: 389.25, offsetLeft: .25, offsetTop: .5 }, { width: 844, height: 390 });
  expect(rect).toEqual({ left: 0, top: 0, width: 844, height: 390 });
});
test('a standalone backdrop includes the window area beyond the visual viewport', () => {
  const visual = { width: 1194, height: 813 };
  const layout = { width: 1194, height: 834 };
  expect(viewportBounds(visual, layout, { standalone: true }).height).toBe(834);
  expect(viewportBounds(visual, layout).height).toBe(813);
});
test('text entry continues to fit above the keyboard in both standalone and browser windows', () => {
  const visual = { width: 844, height: 210, offsetTop: 35 };
  const layout = { width: 844, height: 390 };
  expect(viewportBounds(visual, layout, { standalone: true, editing: true })).toEqual({ left: 0, top: 35, width: 844, height: 210 });
  expect(viewportBounds(visual, layout)).toEqual({ left: 0, top: 35, width: 844, height: 210 });
});
