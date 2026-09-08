import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist';
import { EventBus, PDFLinkService, PDFViewer as PdfJsViewer, RenderingStates } from 'pdfjs-dist/web/pdf_viewer.mjs';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import 'pdfjs-dist/web/pdf_viewer.css';
import { mostVisiblePage } from '../lib/pageTiming';

GlobalWorkerOptions.workerSrc = workerUrl;

export default forwardRef(function PdfViewer({ url, onPage, onError }, ref) {
  const containerRef = useRef(null);
  const viewerRef = useRef(null);
  const callbacks = useRef({ onPage, onError });
  callbacks.current = { onPage, onError };

  useImperativeHandle(ref, () => ({
    goToPage(pageNumber) {
      viewerRef.current?.scrollPageIntoView({ pageNumber });
    },
  }), []);

  useEffect(() => {
    const container = containerRef.current;
    const controller = new AbortController();
    const eventBus = new EventBus();
    const linkService = new PDFLinkService({ eventBus });
    const viewer = new PdfJsViewer({
      container, eventBus, linkService, abortSignal: controller.signal,
      // Reading only; retain selectable text and document links.
      annotationMode: 1, maxCanvasPixels: 8_388_608,
    });
    viewerRef.current = viewer;
    linkService.setViewer(viewer);
    let active = true;
    let selectedPage = null;
    const failedPages = new Set();

    const updatePage = () => {
      if (!active) return;
      // PDF.js's pinned viewer provides a bounded list of visible page views,
      // avoiding a scan of every page in a long chart on each scroll frame.
      const pages = viewer._getVisiblePages().views.map(({ id, view }) => ({
        page: id, rect: view.div.getBoundingClientRect(),
      }));
      const bounds = container.getBoundingClientRect();
      const viewport = {
        top: Math.max(0, bounds.top), bottom: Math.min(window.innerHeight, bounds.bottom),
        left: Math.max(0, bounds.left), right: Math.min(window.innerWidth, bounds.right),
      };
      selectedPage = mostVisiblePage(pages, viewport, selectedPage);
      const pageView = selectedPage && viewer.getPageView(selectedPage - 1);
      const ready = Boolean(pageView && pageView.renderingState === RenderingStates.FINISHED && !failedPages.has(selectedPage));
      callbacks.current.onPage(selectedPage, ready);
    };
    eventBus.on('updateviewarea', updatePage);
    window.addEventListener('scroll', updatePage, { capture: true, signal: controller.signal });
    window.addEventListener('resize', updatePage, { signal: controller.signal });
    eventBus.on('pagerendered', ({ pageNumber, error }) => {
      if (!active) return;
      if (error) {
        failedPages.add(pageNumber);
        callbacks.current.onError(`Page ${pageNumber} could not be rendered. Please reload the chart.`);
      } else {
        failedPages.delete(pageNumber);
      }
      updatePage();
    });
    eventBus.on('pagesinit', () => {
      viewer.currentScaleValue = 'page-width';
      updatePage();
    });
    const resize = new ResizeObserver(() => {
      if (active && viewer.pagesCount) {
        viewer.currentScaleValue = 'page-width';
        viewer.update();
      }
    });
    resize.observe(container);
    const assetBase = `${import.meta.env.BASE_URL}pdfjs/`;
    const task = getDocument({
      url, cMapUrl: `${assetBase}cmaps/`, cMapPacked: true,
      standardFontDataUrl: `${assetBase}standard_fonts/`, wasmUrl: `${assetBase}wasm/`,
      isEvalSupported: false,
    });
    task.promise.then(pdf => {
      if (!active) return;
      linkService.setDocument(pdf);
      viewer.setDocument(pdf);
      viewer.pagesPromise.catch(error => {
        if (active) callbacks.current.onError(error.message);
      });
    }).catch(error => {
      if (active) callbacks.current.onError(error.message);
    });
    return () => {
      active = false;
      resize.disconnect();
      viewer.setDocument(null);
      linkService.setDocument(null);
      controller.abort();
      viewerRef.current = null;
      void task.destroy();
    };
  }, [url]);

  return (
    <div className="pdf-scroll-container" ref={containerRef} tabIndex={0} role="region" aria-label="Medical chart PDF. Scroll to review pages.">
      <div className="pdfViewer" />
    </div>
  );
});
