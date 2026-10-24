import { describe, expect, it } from "vitest";

import { arrowHead, pathOf, type Shape, shapeAt } from "./annotation";

const red = "#E53935";

describe("éditeur d'image", () => {
  it("trace un point isolé et un trait", () => {
    expect(pathOf([{ x: 1, y: 2 }])).toBe("M1 2 l0.1 0");
    expect(pathOf([{ x: 0, y: 0 }, { x: 10, y: 5 }])).toBe("M0.0 0.0 L10.0 5.0");
  });

  it("pointe de flèche symétrique sur l'extrémité", () => {
    const d = arrowHead({ x: 0, y: 0 }, { x: 100, y: 0 }, 5);
    const [x1, y1, , , x2, y2] = d.match(/-?\d+\.\d/g)!.map(Number);
    expect(d).toContain("L100.0 0.0");
    expect(y1).toBeCloseTo(-y2);
    expect(x1).toBeCloseTo(x2);
    expect(x1).toBeLessThan(100);
  });

  it("la gomme vise la forme la plus récente sous le doigt", () => {
    const shapes: Shape[] = [
      { kind: "rectangle", color: red, width: 4, a: { x: 0, y: 0 }, b: { x: 100, y: 100 } },
      { kind: "sharpie", color: red, width: 4, points: [{ x: 40, y: 40 }, { x: 60, y: 60 }] },
      { kind: "text", color: red, size: 20, at: { x: 200, y: 200 }, text: "abc" },
    ];
    expect(shapeAt(shapes, { x: 50, y: 50 }, 5)).toBe(1);
    expect(shapeAt(shapes, { x: 10, y: 90 }, 5)).toBe(0);
    expect(shapeAt(shapes, { x: 210, y: 190 }, 5)).toBe(2);
    expect(shapeAt(shapes, { x: 150, y: 150 }, 5)).toBe(-1);
    // Ligne horizontale : la tolérance rend le trait fin atteignable.
    expect(shapeAt([{ kind: "line", color: red, width: 2, a: { x: 0, y: 10 }, b: { x: 100, y: 10 } }], { x: 50, y: 14 }, 5)).toBe(0);
  });
});
