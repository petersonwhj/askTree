import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import * as pdfjs from "pdfjs-dist";
import type { AskImage } from "@asktree/core";

const PAGE_IMAGE_MAX_EDGE = 1600;
const MAX_CANVAS = 6000;
const JPEG_QUALITY = 0.8;
const CROP_MAX_ZOOM = 3;
const CROP_MAX_EDGE = 2000;
const PAGE_CACHE_MAX = 10;
const MIN_CROP = 8;
const ZOOM_MIN = 0.2;
const ZOOM_MAX = 6;
const ZOOM_STEP = 1.25;
/** Horizontal padding of .pdf-canvas-wrap (must match the CSS). */
const WRAP_PADDING_X = 12;

// pdf.js needs to fetch its decoders, CMaps and standard fonts locally; the copy
// script puts them under public/pdfjs (see apps/web/scripts/copy-pdfjs-assets.mjs).
const ASSET_BASE = `${import.meta.env.BASE_URL.replace(/\/?$/, "/")}pdfjs/`;

// Served as a static file (see scripts/copy-pdfjs-assets.mjs) rather than a Vite
// ?url import, whose dev URL can fail to load and break the whole viewer.
pdfjs.GlobalWorkerOptions.workerSrc = `${ASSET_BASE}pdf.worker.min.mjs`;

type Doc = Awaited<ReturnType<typeof pdfjs.getDocument>["promise"]>;
type PdfPage = Awaited<ReturnType<Doc["getPage"]>>;

export interface PdfPaneHandle {
  renderContextImages(): Promise<{ images: AskImage[]; pages: number[] }>;
}

interface Props {
  asset: Blob;
  /** Reading position as a 0-1 fraction of the page count (matches setReadingPosition). */
  initialFraction?: number;
  onPageChange?: (page: number, total: number) => void;
  onCrop?: (crop: AskImage) => void;
}

function pageCanvas(page: PdfPage, scale: number): HTMLCanvasElement {
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  return canvas;
}

export const PdfPane = forwardRef<PdfPaneHandle, Props>(function PdfPane(
  { asset, initialFraction = 0, onPageChange, onCrop },
  ref,
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const docRef = useRef<Doc | null>(null);
  const pageImageCache = useRef(new Map<number, AskImage>());
  const dragRef = useRef<{ x: number; y: number } | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageDraft, setPageDraft] = useState("1");
  const wrapRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  // Absolute render scale (1 = PDF's natural 72dpi size). In fit mode it is
  // derived from the pane width; otherwise it is the reader's zoom.
  const [fitMode, setFitMode] = useState(true);
  const [scale, setScale] = useState(1);
  const [displayScale, setDisplayScale] = useState(1);
  const [rect, setRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pageWarning, setPageWarning] = useState<string | null>(null);

  // Standard "fit page width": container width / page width at scale 1.
  const fitWidthScale = useCallback(
    (baseWidth: number) => (baseWidth > 0 && containerWidth > 0 ? containerWidth / baseWidth : 0),
    [containerWidth],
  );

  const clampScale = useCallback((value: number, baseWidth: number, baseHeight: number) => {
    const bounded = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, value));
    return Math.min(bounded, MAX_CANVAS / baseWidth, MAX_CANVAS / baseHeight);
  }, []);

  // Context page images: a fixed, modest scale independent of the reader's zoom.
  const pageImageScale = useCallback(
    (baseWidth: number) => Math.min(1.5, PAGE_IMAGE_MAX_EDGE / baseWidth),
    [],
  );

  const renderPage = useCallback(async (pageNumber: number, doc: Doc, target: HTMLCanvasElement) => {
    const pdfPage = await doc.getPage(pageNumber);
    const base = pdfPage.getViewport({ scale: 1 });
    const wanted = fitMode ? fitWidthScale(base.width) : scale;
    const resolved = clampScale(wanted, base.width, base.height);
    if (resolved <= 0) return;
    const viewport = pdfPage.getViewport({ scale: resolved });
    target.width = viewport.width;
    target.height = viewport.height;
    setDisplayScale(resolved);

    // pdf.js reports images it cannot decode through its warning logger and then
    // renders the page without them. Catch that here so the reader sees a notice
    // instead of a page that silently looks blank.
    const collected: string[] = [];
    const originalWarn = console.warn;
    const originalError = console.error;
    const capture = (...args: unknown[]) => {
      collected.push(args.map((a) => String(a)).join(" "));
    };
    console.warn = capture;
    console.error = capture;
    try {
      await pdfPage.render({ canvas: target, viewport }).promise;
    } finally {
      console.warn = originalWarn;
      console.error = originalError;
    }
    const undecoded = collected.find((m) =>
      /ignoring XObject|Jbig2|JPEG2000|OpenJPEG|unknown image|Cannot decode|WebAssembly|wasm-unsafe-eval|CompileError/i.test(m),
    );
    setPageWarning(
      undecoded
        ? "Part of this page uses an image format this app cannot decode, so it may look incomplete."
        : null,
    );
  }, [fitMode, scale, fitWidthScale, clampScale]);

  // Captured once: the load effect must not depend on the fraction, or navigating
  // (which persists a new fraction) would reload the document.
  const initialFractionRef = useRef(initialFraction);

  useEffect(() => {
    let cancelled = false;
    // Load through an object URL: pdf.js can fetch and (re)read it, and we never
    // hand it an ArrayBuffer that it would detach. Works for very large files
    // that exceed Chrome's per-value IndexedDB/structured-clone limits.
    const url = URL.createObjectURL(asset);
    const task = pdfjs.getDocument({
      url,
      wasmUrl: `${ASSET_BASE}wasm/`,
      cMapUrl: `${ASSET_BASE}cmaps/`,
      cMapPacked: true,
      standardFontDataUrl: `${ASSET_BASE}standard_fonts/`,
    });
    (async () => {
      const doc = await task.promise;
      if (cancelled) return;
      docRef.current = doc;
      pageImageCache.current.clear();
      setTotal(doc.numPages);
      const start = Math.min(
        doc.numPages,
        Math.max(1, Math.round(initialFractionRef.current * doc.numPages) || 1),
      );
      setPage(start);
    })().catch((e) => {
      if (cancelled) return;
      console.error("PDF LOAD FAILED", e);
      const name = (e as { name?: string }).name;
      if (name === "PasswordException") {
        setLoadError("This PDF is password-protected and cannot be opened.");
      } else if (name === "InvalidPDFException") {
        setLoadError("This file is not a valid PDF.");
      } else {
        setLoadError(`Could not open this PDF: ${(e as Error).message}`);
      }
    });
    return () => {
      cancelled = true;
      // Destroy the loading task before revoking the URL (React StrictMode runs
      // effects twice in dev; aborting cleanly avoids a spurious fetch error).
      void task.destroy();
      URL.revokeObjectURL(url);
    };
  }, [asset]);

  // Keep the callback in a ref so a new function identity each render does not
  // re-trigger the render effect.
  const onPageChangeRef = useRef(onPageChange);
  onPageChangeRef.current = onPageChange;

  useEffect(() => {
    const doc = docRef.current;
    if (doc && canvasRef.current && total > 0 && page >= 1 && page <= total) {
      void renderPage(page, doc, canvasRef.current);
      onPageChangeRef.current?.(page, total);
    }
  }, [page, total, renderPage]);

  useEffect(() => {
    setPageDraft(String(page));
  }, [page]);

  // Track the pane width so "fit width" follows resizes of the split panel.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => setContainerWidth(Math.max(0, el.clientWidth - WRAP_PADDING_X * 2));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const jumpTo = (value: string) => {
    const n = Math.round(Number(value));
    if (!Number.isFinite(n) || total === 0) {
      setPageDraft(String(page));
      return;
    }
    setPage(Math.min(total, Math.max(1, n)));
  };

  const zoomBy = (factor: number) => {
    setFitMode(false);
    setScale(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, displayScale * factor)));
  };

  const pageImage = useCallback(async (pageNumber: number, doc: Doc): Promise<AskImage> => {
    const cached = pageImageCache.current.get(pageNumber);
    if (cached) return cached;

    const pdfPage = await doc.getPage(pageNumber);
    const base = pdfPage.getViewport({ scale: 1 });
    // Context images use a fixed modest scale, independent of the reader's zoom,
    // so a zoomed-in view does not inflate the request. The per-page cache makes
    // repeat asks free.
    const renderScale = pageImageScale(base.width);
    const canvas = pageCanvas(pdfPage, renderScale);
    const viewport = pdfPage.getViewport({ scale: renderScale });
    await pdfPage.render({ canvas, viewport }).promise;

    const dataUrl = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
    const image: AskImage = {
      mediaType: "image/jpeg",
      data: dataUrl.slice(dataUrl.indexOf(",") + 1),
    };

    const cache = pageImageCache.current;
    cache.set(pageNumber, image);
    if (cache.size > PAGE_CACHE_MAX) {
      const oldest = cache.keys().next().value;
      if (oldest !== undefined) cache.delete(oldest);
    }
    return image;
  }, [pageImageScale]);

  useImperativeHandle(ref, () => ({
    async renderContextImages() {
      const doc = docRef.current;
      if (!doc) return { images: [], pages: [] };
      const pages = [page, page - 1, page + 1].filter(
        (p, i, all) => p >= 1 && p <= total && all.indexOf(p) === i,
      );
      const images = await Promise.all(pages.map((p) => pageImage(p, doc)));
      return { images, pages };
    },
  }), [page, total, pageImage]);

  const localPoint = (e: React.MouseEvent) => {
    const box = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - box.left, y: e.clientY - box.top };
  };

  const onMouseDown = (e: React.MouseEvent) => {
    dragRef.current = localPoint(e);
    setRect(null);
  };

  const onMouseMove = (e: React.MouseEvent) => {
    const start = dragRef.current;
    if (!start) return;
    const { x, y } = localPoint(e);
    setRect({
      x: Math.min(start.x, x),
      y: Math.min(start.y, y),
      w: Math.abs(x - start.x),
      h: Math.abs(y - start.y),
    });
  };

  const onMouseUp = () => {
    dragRef.current = null;
  };

  const confirmCrop = async () => {
    const current = rect;
    const doc = docRef.current;
    if (!current || !doc || current.w < MIN_CROP || current.h < MIN_CROP) return;

    // Re-render just this region from the PDF at a higher scale so the crop is crisp.
    // `current` is in on-screen canvas pixels (which already include the zoom), so
    // the region maps back 1:1 onto the displayed scale.
    const k = Math.max(1, Math.min(CROP_MAX_ZOOM, CROP_MAX_EDGE / Math.max(current.w, current.h)));
    const pdfPage = await doc.getPage(page);
    const base = pdfPage.getViewport({ scale: 1 });
    const viewport = pdfPage.getViewport({ scale: displayScale * k });

    const out = document.createElement("canvas");
    out.width = Math.round(current.w * k);
    out.height = Math.round(current.h * k);
    await pdfPage.render({
      canvas: out,
      viewport,
      transform: [1, 0, 0, 1, -current.x * k, -current.y * k],
    }).promise;

    const dataUrl = out.toDataURL("image/png");
    onCrop?.({ mediaType: "image/png", data: dataUrl.slice(dataUrl.indexOf(",") + 1) });
    setRect(null);
  };

  return (
    <div className="pdf-pane">
      <div className="pdf-toolbar">
        <button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
          ◀
        </button>
        <input
          className="pdf-page-input"
          aria-label="Page number"
          value={pageDraft}
          onChange={(e) => setPageDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") jumpTo(pageDraft);
          }}
          onBlur={() => jumpTo(pageDraft)}
        />
        <span className="pdf-page-total">/ {total || "…"}</span>
        <button
          type="button"
          onClick={() => setPage((p) => Math.min(total || p, p + 1))}
          disabled={total > 0 && page >= total}
        >
          ▶
        </button>
        <div className="pdf-zoom">
          <button type="button" aria-label="Zoom out" onClick={() => zoomBy(1 / ZOOM_STEP)}>−</button>
          <span className="pdf-zoom-label">{Math.round(displayScale * 100)}%</span>
          <button type="button" aria-label="Zoom in" onClick={() => zoomBy(ZOOM_STEP)}>+</button>
          <button type="button" className="pdf-fit" onClick={() => setFitMode(true)}>Fit width</button>
        </div>
      </div>
      {loadError && <div className="pdf-error">{loadError}</div>}
      {!loadError && pageWarning && <div className="pdf-warning">{pageWarning}</div>}
      <div ref={wrapRef} className="pdf-canvas-wrap" onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp}>
        <canvas ref={canvasRef} />
        {rect && rect.w >= MIN_CROP && rect.h >= MIN_CROP && (
          <>
            <div
              className="pdf-crop-rect"
              style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}
            />
            <button
              type="button"
              className="pdf-crop-ask"
              style={{ left: rect.x, top: rect.y + rect.h + 6 }}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={() => { confirmCrop().catch((e) => console.error("CROP FAILED", e)); }}
            >
              🔍 Ask about this
            </button>
          </>
        )}
      </div>
    </div>
  );
});
