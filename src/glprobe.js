// WebGL-Probe im Worker: Das Anlegen eines Kontexts kann bei Software-Renderern (SwiftShader, llvmpipe) mehrere
// Sekunden dauern. Im Worker blockiert das die Seite nicht. Antwort: { ok, gpu } (Renderer-Name, falls lesbar).
self.onmessage = () => {
  let ok = false, gpu = '';
  try {
    const g = new OffscreenCanvas(1, 1).getContext('webgl2', { failIfMajorPerformanceCaveat: true, antialias: false, depth: false, powerPreference: 'low-power' });
    if (g) {
      ok = true;
      const d = g.getExtension('WEBGL_debug_renderer_info');
      gpu = String((d ? g.getParameter(d.UNMASKED_RENDERER_WEBGL) : g.getParameter(g.RENDERER)) || '');
      const lose = g.getExtension('WEBGL_lose_context');
      if (lose) lose.loseContext();
    }
  } catch (e) { ok = false; }
  self.postMessage({ ok, gpu });
};
