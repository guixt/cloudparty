import { describe, expect, it } from 'vitest';
import { SLOT_DEFAULT, SLOT_MIN, clampSlotWidth, slotMax, widthFromPointer } from './slotWidth';

describe('Breite der Leisten', () => {
  it('begrenzt auf Minimum, Fensterhälfte und 640 px', () => {
    expect(clampSlotWidth(50, 1280)).toBe(SLOT_MIN);
    expect(clampSlotWidth(900, 1280)).toBe(640);
    expect(clampSlotWidth(900, 800)).toBe(400);
    expect(slotMax(300)).toBe(SLOT_MIN);
    expect(clampSlotWidth(Number.NaN, 1280)).toBe(SLOT_MIN);
    expect(clampSlotWidth(SLOT_DEFAULT.right, 1280)).toBe(290);
  });
  it('Breite aus der Mausposition: links ab Rand, rechts ab rechtem Rand', () => {
    expect(widthFromPointer('left', 352, 1280)).toBe(340);
    expect(widthFromPointer('right', 1280 - 12 - 400, 1280)).toBe(400);
    expect(widthFromPointer('right', 1270, 1280)).toBe(SLOT_MIN);
  });
});
