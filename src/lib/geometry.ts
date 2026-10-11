export type Vec2 = {
  x: number;
  y: number;
};

export type DesignModel = {
  widthMm: number;
  heightMm: number;
  thicknessMm: number;
  curve: {
    control1: Vec2;
    control2: Vec2;
  };
};

export const DESIGN_LIMITS = {
  widthMin: 30,
  widthMax: 260,
  heightMin: 30,
  heightMax: 220,
  thicknessMin: 2,
  thicknessMax: 60,
  controlXMin: -0.9,
  controlXMax: 1.2,
  controlYMin: -1.1,
  controlYMax: 2.1,
};

export const DEFAULT_DESIGN: DesignModel = {
  widthMm: 180,
  heightMm: 120,
  thicknessMm: 18,
  curve: {
    control1: { x: 0.18, y: -0.18 },
    control2: { x: 0.14, y: 1.18 },
  },
};

export function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function toWorldControl(control: Vec2, widthMm: number, heightMm: number): Vec2 {
  return {
    x: widthMm + control.x * widthMm,
    y: control.y * heightMm,
  };
}

export function fromWorldControl(point: Vec2, widthMm: number, heightMm: number): Vec2 {
  return {
    x: (point.x - widthMm) / widthMm,
    y: point.y / heightMm,
  };
}

export function normalizeControl(control: Vec2): Vec2 {
  return {
    x: clamp(control.x, DESIGN_LIMITS.controlXMin, DESIGN_LIMITS.controlXMax),
    y: clamp(control.y, DESIGN_LIMITS.controlYMin, DESIGN_LIMITS.controlYMax),
  };
}

export function normalizeDesign(input: Partial<DesignModel> | null | undefined): DesignModel {
  const base = DEFAULT_DESIGN;
  const width = clamp(
    isFiniteNumber(input?.widthMm) ? input.widthMm : base.widthMm,
    DESIGN_LIMITS.widthMin,
    DESIGN_LIMITS.widthMax,
  );
  const height = clamp(
    isFiniteNumber(input?.heightMm) ? input.heightMm : base.heightMm,
    DESIGN_LIMITS.heightMin,
    DESIGN_LIMITS.heightMax,
  );
  const thickness = clamp(
    isFiniteNumber(input?.thicknessMm) ? input.thicknessMm : base.thicknessMm,
    DESIGN_LIMITS.thicknessMin,
    DESIGN_LIMITS.thicknessMax,
  );

  const control1 = normalizeControl(
    input?.curve?.control1 ?? base.curve.control1,
  );
  const control2 = normalizeControl(
    input?.curve?.control2 ?? base.curve.control2,
  );

  return {
    widthMm: width,
    heightMm: height,
    thicknessMm: thickness,
    curve: { control1, control2 },
  };
}

export function validateDesign(design: DesignModel): string[] {
  const errors: string[] = [];

  if (!isFiniteNumber(design.widthMm) || design.widthMm <= 0) {
    errors.push('Width must be a positive number.');
  }
  if (!isFiniteNumber(design.heightMm) || design.heightMm <= 0) {
    errors.push('Height must be a positive number.');
  }
  if (!isFiniteNumber(design.thicknessMm) || design.thicknessMm <= 0) {
    errors.push('Thickness must be a positive number.');
  }

  if (design.widthMm < DESIGN_LIMITS.widthMin || design.widthMm > DESIGN_LIMITS.widthMax) {
    errors.push(`Width must stay between ${DESIGN_LIMITS.widthMin} and ${DESIGN_LIMITS.widthMax} mm.`);
  }
  if (design.heightMm < DESIGN_LIMITS.heightMin || design.heightMm > DESIGN_LIMITS.heightMax) {
    errors.push(`Height must stay between ${DESIGN_LIMITS.heightMin} and ${DESIGN_LIMITS.heightMax} mm.`);
  }
  if (design.thicknessMm < DESIGN_LIMITS.thicknessMin || design.thicknessMm > DESIGN_LIMITS.thicknessMax) {
    errors.push(`Thickness must stay between ${DESIGN_LIMITS.thicknessMin} and ${DESIGN_LIMITS.thicknessMax} mm.`);
  }

  if (!isFiniteNumber(design.curve.control1.x) || !isFiniteNumber(design.curve.control1.y)) {
    errors.push('Control point 1 must use finite coordinates.');
  }
  if (!isFiniteNumber(design.curve.control2.x) || !isFiniteNumber(design.curve.control2.y)) {
    errors.push('Control point 2 must use finite coordinates.');
  }

  const d1 = Math.hypot(design.curve.control1.x - design.curve.control2.x, design.curve.control1.y - design.curve.control2.y);
  if (d1 < 0.05) {
    errors.push('Control handles must be distinct to form a valid curve.');
  }

  const start = { x: 0, y: 0 };
  const end = { x: design.widthMm, y: design.heightMm };
  const cp1 = toWorldControl(design.curve.control1, design.widthMm, design.heightMm);
  const cp2 = toWorldControl(design.curve.control2, design.widthMm, design.heightMm);

  const curveFromStart = Math.abs(cp1.x - start.x) + Math.abs(cp1.y - start.y);
  const curveToEnd = Math.abs(cp2.x - end.x) + Math.abs(cp2.y - end.y);
  if (curveFromStart < 1 && curveToEnd < 1) {
    errors.push('The curved edge is too close to a flat line and should be reshaped.');
  }

  const leftEdge = Math.abs(cp1.x - cp2.x) < 0.05 && Math.abs(cp1.y - cp2.y) < 0.05;
  if (leftEdge) {
    errors.push('The curve is degenerate and would collapse the rib profile.');
  }

  return errors;
}

export function buildOutlinePath(design: DesignModel): string {
  const start = { x: 0, y: 0 };
  const end = { x: design.widthMm, y: design.heightMm };
  const cp1 = toWorldControl(design.curve.control1, design.widthMm, design.heightMm);
  const cp2 = toWorldControl(design.curve.control2, design.widthMm, design.heightMm);

  return `M ${start.x} ${start.y} L ${end.x} ${start.y} C ${cp1.x} ${cp1.y}, ${cp2.x} ${cp2.y}, ${end.x} ${end.y} L 0 ${end.y} L 0 0 Z`;
}

export function buildOutlineSvgMarkup(design: DesignModel): string {
  const path = buildOutlinePath(design);
  const width = design.widthMm;
  const height = design.heightMm;

  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${width}mm" height="${height}mm" viewBox="0 0 ${width} ${height}" role="img" aria-label="Pottery rib outline">
  <path d="${path}" fill="#f4efe6" stroke="#2a2523" stroke-width="1.2" stroke-linejoin="round" />
</svg>
  `.trim();
}

export function exportDesignPayload(design: DesignModel): Record<string, unknown> {
  return {
    schemaVersion: 1,
    createdAt: new Date().toISOString(),
    coordinateSystem: {
      units: 'mm',
      origin: 'top-left of the rib body',
      xAxis: 'width along the top edge toward the custom curve',
      yAxis: 'height downward from the top edge',
      edgeDefinition: 'The custom curve is the right-side cubic Bezier from the top-right corner to the bottom-right corner.',
    },
    dimensions: {
      widthMm: design.widthMm,
      heightMm: design.heightMm,
      thicknessMm: design.thicknessMm,
    },
    bezierControlPoints: {
      control1: {
        x: design.curve.control1.x,
        y: design.curve.control1.y,
        worldPositionMm: toWorldControl(design.curve.control1, design.widthMm, design.heightMm),
      },
      control2: {
        x: design.curve.control2.x,
        y: design.curve.control2.y,
        worldPositionMm: toWorldControl(design.curve.control2, design.widthMm, design.heightMm),
      },
    },
    geometry: {
      outline: {
        start: { x: 0, y: 0 },
        end: { x: design.widthMm, y: design.heightMm },
        path: buildOutlinePath(design),
      },
    },
  };
}
