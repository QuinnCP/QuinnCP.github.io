import { useEffect, useMemo, useRef, useState } from 'react';
import {
  DEFAULT_DESIGN,
  DESIGN_LIMITS,
  buildOutlinePath,
  buildOutlineSvgMarkup,
  exportDesignPayload,
  fromWorldControl,
  normalizeDesign,
  toWorldControl,
  validateDesign,
  type DesignModel,
} from './lib/geometry';

type DimensionKey = 'widthMm' | 'heightMm' | 'thicknessMm';

type DragHandle = 'control1' | 'control2';

const STORAGE_KEY = 'pottery-rib-design-v1';
const VIEW_BOX = { width: 820, height: 560 };

function readStoredDesign(): DesignModel {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return DEFAULT_DESIGN;
    }

    const parsed = JSON.parse(raw) as Partial<DesignModel>;
    const normalized = normalizeDesign(parsed);
    const errors = validateDesign(normalized);
    return errors.length === 0 ? normalized : DEFAULT_DESIGN;
  } catch {
    return DEFAULT_DESIGN;
  }
}

function getCanvasMetrics(design: DesignModel) {
  const padding = 70;
  const points = [
    { x: 0, y: 0 },
    { x: design.widthMm, y: 0 },
    { x: design.widthMm, y: design.heightMm },
    { x: 0, y: design.heightMm },
    toWorldControl(design.curve.control1, design.widthMm, design.heightMm),
    toWorldControl(design.curve.control2, design.widthMm, design.heightMm),
  ];

  const minX = Math.min(...points.map((point) => point.x));
  const maxX = Math.max(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const maxY = Math.max(...points.map((point) => point.y));

  const spanX = Math.max(maxX - minX, 10);
  const spanY = Math.max(maxY - minY, 10);
  const scale = Math.min(
    (VIEW_BOX.width - padding * 2) / spanX,
    (VIEW_BOX.height - padding * 2) / spanY,
  );

  return {
    scale,
    offsetX: (VIEW_BOX.width - (maxX + minX) * scale) / 2,
    offsetY: (VIEW_BOX.height - (maxY + minY) * scale) / 2,
  };
}

function App() {
  const [design, setDesign] = useState<DesignModel>(() => readStoredDesign());
  const [validationMessage, setValidationMessage] = useState<string>('');
  const [draftValues, setDraftValues] = useState({
    widthMm: DEFAULT_DESIGN.widthMm.toString(),
    heightMm: DEFAULT_DESIGN.heightMm.toString(),
    thicknessMm: DEFAULT_DESIGN.thicknessMm.toString(),
  });
  const [dragHandle, setDragHandle] = useState<DragHandle | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    setDraftValues({
      widthMm: String(design.widthMm),
      heightMm: String(design.heightMm),
      thicknessMm: String(design.thicknessMm),
    });
  }, [design]);

  useEffect(() => {
    const errors = validateDesign(design);
    if (errors.length === 0) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(design));
      setValidationMessage('');
      return;
    }
    setValidationMessage(errors[0]);
  }, [design]);

  const canvasMetrics = useMemo(() => getCanvasMetrics(design), [design]);
  const outlinePath = useMemo(() => buildOutlinePath(design), [design]);

  const control1World = useMemo(
    () => toWorldControl(design.curve.control1, design.widthMm, design.heightMm),
    [design],
  );

  const control2World = useMemo(
    () => toWorldControl(design.curve.control2, design.widthMm, design.heightMm),
    [design],
  );

  const updateDraftValue = (key: DimensionKey, value: string) => {
    setDraftValues((current) => ({ ...current, [key]: value }));

    if (value.trim() === '') {
      return;
    }

    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      setValidationMessage('Enter a valid numeric value.');
      return;
    }

    const min = key === 'widthMm' ? DESIGN_LIMITS.widthMin : key === 'heightMm' ? DESIGN_LIMITS.heightMin : DESIGN_LIMITS.thicknessMin;
    const max = key === 'widthMm' ? DESIGN_LIMITS.widthMax : key === 'heightMm' ? DESIGN_LIMITS.heightMax : DESIGN_LIMITS.thicknessMax;

    if (parsed <= 0) {
      setValidationMessage(`${key === 'widthMm' ? 'Width' : key === 'heightMm' ? 'Height' : 'Thickness'} must be greater than zero.`);
      return;
    }

    if (parsed < min || parsed > max) {
      setValidationMessage(`${key === 'widthMm' ? 'Width' : key === 'heightMm' ? 'Height' : 'Thickness'} must stay between ${min} and ${max} mm.`);
      return;
    }

    const nextDesign = normalizeDesign({ ...design, [key]: parsed });
    const nextErrors = validateDesign(nextDesign);
    if (nextErrors.length > 0) {
      setValidationMessage(nextErrors[0]);
      return;
    }

    setDesign(nextDesign);
    setValidationMessage('');
  };

  const commitDraftValue = (key: DimensionKey) => {
    const raw = draftValues[key];
    const parsed = Number(raw);

    if (!Number.isFinite(parsed) || raw.trim() === '') {
      setDraftValues((current) => ({ ...current, [key]: String(design[key]) }));
      setValidationMessage('Please enter a valid number.');
      return;
    }

    const min = key === 'widthMm' ? DESIGN_LIMITS.widthMin : key === 'heightMm' ? DESIGN_LIMITS.heightMin : DESIGN_LIMITS.thicknessMin;
    const max = key === 'widthMm' ? DESIGN_LIMITS.widthMax : key === 'heightMm' ? DESIGN_LIMITS.heightMax : DESIGN_LIMITS.thicknessMax;

    if (parsed <= 0 || parsed < min || parsed > max) {
      setDraftValues((current) => ({ ...current, [key]: String(design[key]) }));
      setValidationMessage(`${key === 'widthMm' ? 'Width' : key === 'heightMm' ? 'Height' : 'Thickness'} must stay within ${min}–${max} mm.`);
      return;
    }

    const nextDesign = normalizeDesign({ ...design, [key]: parsed });
    const errors = validateDesign(nextDesign);
    if (errors.length > 0) {
      setDraftValues((current) => ({ ...current, [key]: String(design[key]) }));
      setValidationMessage(errors[0]);
      return;
    }

    setDesign(nextDesign);
    setValidationMessage('');
  };

  const handleReset = () => {
    const resetDesign = normalizeDesign(DEFAULT_DESIGN);
    setDesign(resetDesign);
    setValidationMessage('');
    setDragHandle(null);
  };

  const exportJson = () => {
    const payload = exportDesignPayload(design);
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.href = url;
    link.download = 'pottery-rib-design.json';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const exportSvg = () => {
    const svgMarkup = buildOutlineSvgMarkup(design);
    const blob = new Blob([svgMarkup], { type: 'image/svg+xml;charset=utf-8' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.href = url;
    link.download = 'pottery-rib-design.svg';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const handlePointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!dragHandle || !svgRef.current) {
      return;
    }

    const rect = svgRef.current.getBoundingClientRect();
    const xRatio = (event.clientX - rect.left) / rect.width;
    const yRatio = (event.clientY - rect.top) / rect.height;
    const pointInSvg = {
      x: xRatio * VIEW_BOX.width,
      y: yRatio * VIEW_BOX.height,
    };

    const actualPoint = {
      x: (pointInSvg.x - canvasMetrics.offsetX) / canvasMetrics.scale,
      y: (pointInSvg.y - canvasMetrics.offsetY) / canvasMetrics.scale,
    };

    const normalizedPoint = fromWorldControl(actualPoint, design.widthMm, design.heightMm);
    const nextCurve = {
      ...design.curve,
      [dragHandle]: normalizeDesign({
        ...design,
        curve: {
          ...design.curve,
          [dragHandle]: normalizedPoint,
        },
      }).curve[dragHandle],
    };

    const nextDesign = normalizeDesign({
      ...design,
      curve: nextCurve,
    });

    const errors = validateDesign(nextDesign);
    if (errors.length > 0) {
      setValidationMessage(errors[0]);
      return;
    }

    setDesign(nextDesign);
    setValidationMessage('');
  };

  const handlePointerUp = () => {
    setDragHandle(null);
  };

  const handlePointerDown = (handle: DragHandle) => (event: React.PointerEvent<SVGCircleElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setDragHandle(handle);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  return (
    <div className="page-shell">
      <header className="top-bar">
        <div className="brand-block">
          <p className="brand-kicker">Custom pottery tool</p>
          <h1>Pottery Rib Designer</h1>
        </div>

        <div className="banner-actions">
          <button type="button" className="button ghost" onClick={handleReset}>
            Reset
          </button>
          <button type="button" className="button secondary" onClick={exportSvg}>
            Export SVG
          </button>
          <button type="button" className="button primary" onClick={exportJson}>
            Export Design
          </button>
        </div>
      </header>

      <main className="workspace">
        <section className="editor-card" aria-label="Pottery rib design canvas">
          <div className="canvas-topline">
            <span className="inline-pill">Profile preview</span>
            <span className="canvas-meta">{design.widthMm} × {design.heightMm} mm</span>
          </div>

          <svg
            ref={svgRef}
            className="design-canvas"
            viewBox={`0 0 ${VIEW_BOX.width} ${VIEW_BOX.height}`}
            role="img"
            aria-label="Pottery rib profile editor"
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
          >
            <rect
              x={0}
              y={0}
              width={VIEW_BOX.width}
              height={VIEW_BOX.height}
              className="canvas-background"
            />

            <g transform={`translate(${canvasMetrics.offsetX} ${canvasMetrics.offsetY}) scale(${canvasMetrics.scale})`}>
              <path d={outlinePath} className="rib-shape" />
              <line x1={design.widthMm} y1={0} x2={control1World.x} y2={control1World.y} className="guide-line" />
              <line x1={design.widthMm} y1={design.heightMm} x2={control2World.x} y2={control2World.y} className="guide-line" />
              <circle cx={control1World.x} cy={control1World.y} r={2.7} className={dragHandle === 'control1' ? 'drag-handle active' : 'drag-handle'} onPointerDown={handlePointerDown('control1')} />
              <circle cx={control2World.x} cy={control2World.y} r={2.7} className={dragHandle === 'control2' ? 'drag-handle active' : 'drag-handle'} onPointerDown={handlePointerDown('control2')} />
              <circle cx={design.widthMm} cy={0} r={2.4} className="endpoint" />
              <circle cx={design.widthMm} cy={design.heightMm} r={2.4} className="endpoint" />
            </g>
          </svg>
        </section>

        <aside className="control-panel" aria-label="Dimension controls">
          <div className="panel-header">
            <h2>Dimension controls</h2>
            <button type="button" className="button small" onClick={handleReset}>
              Reset design
            </button>
          </div>

          <div className="controls-stack">
            <label className="input-row">
              <span>Width</span>
              <div className="input-shell">
                <input
                  type="number"
                  min={DESIGN_LIMITS.widthMin}
                  max={DESIGN_LIMITS.widthMax}
                  step="1"
                  value={draftValues.widthMm}
                  onChange={(event) => updateDraftValue('widthMm', event.target.value)}
                  onBlur={() => commitDraftValue('widthMm')}
                />
                <span className="unit">mm</span>
              </div>
            </label>

            <label className="input-row">
              <span>Height</span>
              <div className="input-shell">
                <input
                  type="number"
                  min={DESIGN_LIMITS.heightMin}
                  max={DESIGN_LIMITS.heightMax}
                  step="1"
                  value={draftValues.heightMm}
                  onChange={(event) => updateDraftValue('heightMm', event.target.value)}
                  onBlur={() => commitDraftValue('heightMm')}
                />
                <span className="unit">mm</span>
              </div>
            </label>

            <label className="input-row">
              <span>Thickness</span>
              <div className="input-shell">
                <input
                  type="number"
                  min={DESIGN_LIMITS.thicknessMin}
                  max={DESIGN_LIMITS.thicknessMax}
                  step="1"
                  value={draftValues.thicknessMm}
                  onChange={(event) => updateDraftValue('thicknessMm', event.target.value)}
                  onBlur={() => commitDraftValue('thicknessMm')}
                />
                <span className="unit">mm</span>
              </div>
            </label>
          </div>

          <div className="status-box" aria-live="polite">
            {validationMessage ? validationMessage : 'Valid design saved locally and ready for export.'}
          </div>

          <div className="design-summary">
            <div>
              <dt>Curve handles</dt>
              <dd>{dragHandle ? `Active: ${dragHandle === 'control1' ? 'Left handle' : 'Right handle'}` : 'Ready to adjust'}</dd>
            </div>
            <div>
              <dt>Thickness</dt>
              <dd>{design.thicknessMm} mm</dd>
            </div>
          </div>
        </aside>
      </main>
    </div>
  );
}

export default App;
