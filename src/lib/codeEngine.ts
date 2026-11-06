import { UltronCodePayload, UltronLiveWidget } from '../types';

const CODE_PATCH_STORAGE_KEY = 'ruk_ai_live_code_patches_v1';
const STYLE_TAG_ID = 'ultron-live-css-patch';

export interface PersistedCodeState {
  liveCss: string;
  widgets: UltronLiveWidget[];
}

export function loadPersistedCodeState(): PersistedCodeState {
  try {
    const raw = localStorage.getItem(CODE_PATCH_STORAGE_KEY);
    if (!raw) return { liveCss: '', widgets: [] };
    const parsed = JSON.parse(raw);
    return {
      liveCss: typeof parsed.liveCss === 'string' ? parsed.liveCss : '',
      widgets: Array.isArray(parsed.widgets) ? parsed.widgets : [],
    };
  } catch {
    return { liveCss: '', widgets: [] };
  }
}

export function savePersistedCodeState(state: PersistedCodeState): void {
  try {
    localStorage.setItem(CODE_PATCH_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
}

export function applyLiveCssToDom(cssText: string): void {
  if (typeof document === 'undefined') return;
  let styleEl = document.getElementById(STYLE_TAG_ID) as HTMLStyleElement | null;
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = STYLE_TAG_ID;
    document.head.appendChild(styleEl);
  }
  styleEl.textContent = cssText || '';
}

export function triggerFileDownload(
  filename: string,
  content: string,
  mimeType = 'text/plain;charset=utf-8'
): void {
  if (typeof document === 'undefined') return;
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}

export async function executeUltronCodePayload(params: {
  codePayload: UltronCodePayload;
  currentState: PersistedCodeState;
}): Promise<{
  nextState: PersistedCodeState;
  executionOutput?: string;
  appliedSummary: string;
}> {
  const { codePayload, currentState } = params;
  let nextCss = currentState.liveCss;
  let nextWidgets = [...currentState.widgets];
  const actionsDone: string[] = [];

  if (codePayload.clearAllPatches) {
    nextCss = '';
    nextWidgets = [];
    applyLiveCssToDom('');
    actionsDone.push('Cleared all live CSS & custom HUD widgets');
  }

  if (typeof codePayload.liveCss === 'string') {
    nextCss =
      codePayload.appendCss && nextCss
        ? `${nextCss}\n${codePayload.liveCss}`
        : codePayload.liveCss;
    applyLiveCssToDom(nextCss);
    actionsDone.push('Injected live CSS patch into DOM');
  }

  if (codePayload.removeWidgetId) {
    nextWidgets = nextWidgets.filter((w) => w.id !== codePayload.removeWidgetId);
    actionsDone.push(`Removed widget [${codePayload.removeWidgetId}]`);
  }

  if (codePayload.widget && codePayload.widget.html) {
    const newWidget: UltronLiveWidget = {
      id: codePayload.widget.id || `wid_${Date.now()}`,
      title: codePayload.widget.title || 'ULTRON MODULE',
      html: codePayload.widget.html,
      js: codePayload.widget.js,
      createdAt: new Date().toISOString(),
    };
    nextWidgets = [
      newWidget,
      ...nextWidgets.filter((w) => w.id !== newWidget.id),
    ].slice(0, 6);
    actionsDone.push(`Mounted live HUD widget "${newWidget.title}"`);
  }

  if (codePayload.downloadFile?.filename && typeof codePayload.downloadFile.content === 'string') {
    triggerFileDownload(
      codePayload.downloadFile.filename,
      codePayload.downloadFile.content,
      codePayload.downloadFile.mimeType
    );
    actionsDone.push(`Generated & downloaded file "${codePayload.downloadFile.filename}"`);
  }

  let executionOutput: string | undefined;
  if (codePayload.executeJs && codePayload.executeJs.trim()) {
    try {
      const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
      const fn = new AsyncFunction(codePayload.executeJs);
      const res = await Promise.race([
        fn(),
        new Promise((_, rej) => setTimeout(() => rej(new Error('Execution timeout (6s)')), 6000)),
      ]);
      if (res !== undefined) {
        executionOutput =
          typeof res === 'string' ? res : JSON.stringify(res, null, 2);
      }
      actionsDone.push('Executed live JS runtime block');
    } catch (err) {
      executionOutput = `JS Runtime Error: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  const nextState: PersistedCodeState = {
    liveCss: nextCss,
    widgets: nextWidgets,
  };
  savePersistedCodeState(nextState);

  return {
    nextState,
    executionOutput,
    appliedSummary:
      codePayload.summary || actionsDone.join(' • ') || 'Live code patch applied',
  };
}
