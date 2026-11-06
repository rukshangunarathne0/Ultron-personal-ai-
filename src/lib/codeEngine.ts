import { UltronCodePayload, UltronLiveWidget } from '../types';

const CODE_PATCH_STORAGE_KEY = 'ruk_ai_live_code_patches_v2';
const LEGACY_STORAGE_KEY = 'ruk_ai_live_code_patches_v1';
const STYLE_TAG_ID = 'ultron-live-css-patch';
const PORTAL_CLASS = 'ultron-custom-dom-portal';

export interface PersistedCodeState {
  liveCss: string;
  persistentJs: string;
  widgets: UltronLiveWidget[];
}

export function loadPersistedCodeState(): PersistedCodeState {
  try {
    const raw =
      localStorage.getItem(CODE_PATCH_STORAGE_KEY) ||
      localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return { liveCss: '', persistentJs: '', widgets: [] };
    const parsed = JSON.parse(raw);
    return {
      liveCss: typeof parsed.liveCss === 'string' ? parsed.liveCss : '',
      persistentJs: typeof parsed.persistentJs === 'string' ? parsed.persistentJs : '',
      widgets: Array.isArray(parsed.widgets) ? parsed.widgets : [],
    };
  } catch {
    return { liveCss: '', persistentJs: '', widgets: [] };
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

export function clearInjectedDomPortals(): void {
  if (typeof document === 'undefined') return;
  document.querySelectorAll(`.${PORTAL_CLASS}`).forEach((el) => el.remove());
}

/**
 * Mounts any widgets that specify a custom `targetSelector` directly into that DOM element
 * (e.g. `#ultron-mobile-nav`, `#ultron-root`, `#ultron-center-stage`, etc.)
 */
export function syncCustomTargetWidgetsToDom(widgets: UltronLiveWidget[]): void {
  if (typeof document === 'undefined') return;
  clearInjectedDomPortals();
  for (const w of widgets) {
    if (!w.targetSelector) continue;
    const host = document.querySelector(w.targetSelector);
    if (!host) continue;
    const wrapper = document.createElement('div');
    wrapper.className = PORTAL_CLASS;
    wrapper.id = `ultron-widget-${w.id}`;
    wrapper.innerHTML = w.html;
    host.appendChild(wrapper);
    if (w.js && w.js.trim()) {
      try {
        const fn = new Function('root', 'ULTRON_OS', w.js);
        fn(wrapper, (window as any).ULTRON_OS);
      } catch (err) {
        console.warn('Custom widget JS error:', err);
      }
    }
  }
}

export async function runPersistentDomScript(jsCode: string): Promise<void> {
  if (!jsCode || !jsCode.trim() || typeof window === 'undefined') return;
  try {
    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
    const fn = new AsyncFunction('ULTRON_OS', jsCode);
    await Promise.race([
      fn((window as any).ULTRON_OS),
      new Promise((_, rej) => setTimeout(() => rej(new Error('Persistent JS timeout')), 5000)),
    ]);
  } catch (err) {
    console.warn('Persistent Ultron DOM script error:', err);
  }
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
  let nextPersistentJs = currentState.persistentJs;
  let nextWidgets = [...currentState.widgets];
  const actionsDone: string[] = [];

  if (codePayload.clearAllPatches) {
    nextCss = '';
    nextPersistentJs = '';
    nextWidgets = [];
    applyLiveCssToDom('');
    clearInjectedDomPortals();
    actionsDone.push('Cleared all live CSS, DOM scripts & custom HUD widgets');
  }

  if (typeof codePayload.liveCss === 'string') {
    nextCss =
      codePayload.appendCss && nextCss
        ? `${nextCss}\n/* --- PATCH --- */\n${codePayload.liveCss}`
        : codePayload.liveCss;
    applyLiveCssToDom(nextCss);
    actionsDone.push('Injected live CSS into #ultron-live-css-patch');
  }

  if (typeof codePayload.persistentJs === 'string') {
    nextPersistentJs = codePayload.persistentJs;
    await runPersistentDomScript(nextPersistentJs);
    actionsDone.push('Applied & saved persistent DOM script');
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
      targetSelector: codePayload.widget.targetSelector,
      createdAt: new Date().toISOString(),
    };
    nextWidgets = [
      newWidget,
      ...nextWidgets.filter((w) => w.id !== newWidget.id),
    ].slice(0, 8);
    actionsDone.push(
      `Mounted widget "${newWidget.title}"${
        newWidget.targetSelector ? ` into ${newWidget.targetSelector}` : ''
      }`
    );
  }

  syncCustomTargetWidgetsToDom(nextWidgets);

  if (codePayload.downloadFile?.filename && typeof codePayload.downloadFile.content === 'string') {
    triggerFileDownload(
      codePayload.downloadFile.filename,
      codePayload.downloadFile.content,
      codePayload.downloadFile.mimeType
    );
    actionsDone.push(`Downloaded file "${codePayload.downloadFile.filename}"`);
  }

  let executionOutput: string | undefined;
  if (codePayload.executeJs && codePayload.executeJs.trim()) {
    try {
      const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
      const fn = new AsyncFunction('ULTRON_OS', codePayload.executeJs);
      const res = await Promise.race([
        fn((window as any).ULTRON_OS),
        new Promise((_, rej) => setTimeout(() => rej(new Error('Execution timeout (8s)')), 8000)),
      ]);
      if (res !== undefined) {
        executionOutput =
          typeof res === 'string' ? res : JSON.stringify(res, null, 2);
      }
      actionsDone.push('Executed live JS with ULTRON_OS root access');
    } catch (err) {
      executionOutput = `JS Runtime Error: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  const nextState: PersistedCodeState = {
    liveCss: nextCss,
    persistentJs: nextPersistentJs,
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
