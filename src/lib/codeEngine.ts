import {
  UltronCodePayload,
  UltronCssPatch,
  UltronDomPatch,
  UltronLiveWidget,
  UltronScriptPatch,
  UltronVirtualFile,
} from '../types';

const CODE_PATCH_STORAGE_KEY = 'ruk_ai_live_code_patches_v3';
const LEGACY_V2_KEY = 'ruk_ai_live_code_patches_v2';
const LEGACY_V1_KEY = 'ruk_ai_live_code_patches_v1';
const STYLE_TAG_ID = 'ultron-live-css-patch';
const PORTAL_CLASS = 'ultron-custom-dom-portal';
const DOM_FRAGMENT_CLASS = 'ultron-dom-patch-fragment';

export interface CodeSnapshot {
  liveCss: string;
  cssPatches: UltronCssPatch[];
  persistentJs: string;
  scripts: UltronScriptPatch[];
  widgets: UltronLiveWidget[];
  domPatches: UltronDomPatch[];
}

export interface PersistedCodeState extends CodeSnapshot {
  files: UltronVirtualFile[];
  history: CodeSnapshot[];
}

export const EMPTY_CODE_STATE: PersistedCodeState = {
  liveCss: '',
  cssPatches: [],
  persistentJs: '',
  scripts: [],
  widgets: [],
  domPatches: [],
  files: [],
  history: [],
};

// ============================================================================
// MANAGED TIMER & CLEANUP REGISTRY (Prevents orphan timers on Edit / Delete!)
// ============================================================================
interface ScopeDisposables {
  intervals: number[];
  timeouts: number[];
  cleanups: Array<() => void>;
}

const activeScopes = new Map<string, ScopeDisposables>();

export function disposeManagedScope(scopeKey: string): void {
  const entry = activeScopes.get(scopeKey);
  if (!entry) return;
  for (const id of entry.intervals) window.clearInterval(id);
  for (const id of entry.timeouts) window.clearTimeout(id);
  for (const fn of entry.cleanups) {
    try {
      fn();
    } catch {
      // ignore cleanup errors
    }
  }
  activeScopes.delete(scopeKey);
}

export function disposeAllManagedScopes(prefix?: string): void {
  for (const key of Array.from(activeScopes.keys())) {
    if (!prefix || key.startsWith(prefix)) {
      disposeManagedScope(key);
    }
  }
}

export function createManagedScope(scopeKey: string) {
  disposeManagedScope(scopeKey);
  const bag: ScopeDisposables = {
    intervals: [],
    timeouts: [],
    cleanups: [],
  };
  activeScopes.set(scopeKey, bag);

  const trackedSetInterval = (handler: TimerHandler, timeout?: number, ...args: any[]) => {
    const id = window.setInterval(handler, timeout, ...args);
    bag.intervals.push(id);
    return id;
  };

  const trackedSetTimeout = (handler: TimerHandler, timeout?: number, ...args: any[]) => {
    const id = window.setTimeout(handler, timeout, ...args);
    bag.timeouts.push(id);
    return id;
  };

  const on = (
    target: EventTarget | null | undefined,
    event: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions
  ) => {
    if (!target) return;
    target.addEventListener(event, listener, options);
    bag.cleanups.push(() => target.removeEventListener(event, listener, options));
  };

  const onCleanup = (fn: () => void) => {
    if (typeof fn === 'function') bag.cleanups.push(fn);
  };

  return {
    setInterval: trackedSetInterval,
    setTimeout: trackedSetTimeout,
    on,
    onCleanup,
  };
}

// ============================================================================
// REVERSIBLE NATIVE DOM ELEMENT SNAPSHOT ENGINE
// ============================================================================
interface OriginalDomSnapshot {
  innerHTML: string;
  styleCssText: string;
  className: string;
  attrs: Record<string, string | null>;
}

const patchedNativeElements = new Map<Element, OriginalDomSnapshot>();

function captureElementIfNeeded(el: Element, attrName?: string): void {
  let snap = patchedNativeElements.get(el);
  if (!snap) {
    snap = {
      innerHTML: el.innerHTML,
      styleCssText: (el as HTMLElement).style ? (el as HTMLElement).style.cssText : '',
      className: el.getAttribute('class') ?? '',
      attrs: {},
    };
    patchedNativeElements.set(el, snap);
  }
  if (attrName && !(attrName in snap.attrs)) {
    snap.attrs[attrName] = el.getAttribute(attrName);
  }
}

export function revertAllDomPatchesFromDom(): void {
  if (typeof document === 'undefined') return;
  document.querySelectorAll(`.${DOM_FRAGMENT_CLASS}`).forEach((n) => n.remove());
  for (const [el, snap] of patchedNativeElements.entries()) {
    try {
      if (el.isConnected) {
        el.innerHTML = snap.innerHTML;
        if ((el as HTMLElement).style) {
          (el as HTMLElement).style.cssText = snap.styleCssText;
        }
        if (snap.className) {
          el.setAttribute('class', snap.className);
        } else {
          el.removeAttribute('class');
        }
        for (const [attr, origVal] of Object.entries(snap.attrs)) {
          if (origVal === null) el.removeAttribute(attr);
          else el.setAttribute(attr, origVal);
        }
      }
    } catch {
      // ignore detached node errors
    }
  }
  patchedNativeElements.clear();
}

export function syncDomPatchesToDom(domPatches: UltronDomPatch[]): void {
  if (typeof document === 'undefined') return;
  revertAllDomPatchesFromDom();
  for (const p of domPatches) {
    if (!p.selector) continue;
    let nodes: NodeListOf<Element>;
    try {
      nodes = document.querySelectorAll(p.selector);
    } catch {
      continue;
    }
    nodes.forEach((el) => {
      captureElementIfNeeded(el, p.attrName);
      const htmlEl = el as HTMLElement;
      switch (p.action) {
        case 'setText':
          el.textContent = p.value ?? '';
          break;
        case 'setHtml':
          el.innerHTML = p.value ?? '';
          break;
        case 'appendHtml': {
          const wrap = document.createElement('div');
          wrap.className = DOM_FRAGMENT_CLASS;
          wrap.setAttribute('data-dom-patch-id', p.id);
          wrap.innerHTML = p.value ?? '';
          el.appendChild(wrap);
          break;
        }
        case 'prependHtml': {
          const wrap = document.createElement('div');
          wrap.className = DOM_FRAGMENT_CLASS;
          wrap.setAttribute('data-dom-patch-id', p.id);
          wrap.innerHTML = p.value ?? '';
          el.insertBefore(wrap, el.firstChild);
          break;
        }
        case 'setStyle':
          if (htmlEl.style) {
            if (p.styles && typeof p.styles === 'object') {
              for (const [k, v] of Object.entries(p.styles)) {
                htmlEl.style.setProperty(
                  k.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`),
                  String(v)
                );
              }
            }
            if (typeof p.value === 'string') {
              htmlEl.style.cssText += `;${p.value}`;
            }
          }
          break;
        case 'addClass':
          if (p.value) {
            p.value
              .split(/\s+/)
              .filter(Boolean)
              .forEach((c) => el.classList.add(c));
          }
          break;
        case 'removeClass':
          if (p.value) {
            p.value
              .split(/\s+/)
              .filter(Boolean)
              .forEach((c) => el.classList.remove(c));
          }
          break;
        case 'setAttribute':
          if (p.attrName) el.setAttribute(p.attrName, p.value ?? '');
          break;
        case 'removeAttribute':
          if (p.attrName) el.removeAttribute(p.attrName);
          break;
        case 'hide':
          if (htmlEl.style) htmlEl.style.display = 'none';
          break;
        case 'show':
          if (htmlEl.style) htmlEl.style.display = p.value || '';
          break;
      }
    });
  }
}

// ============================================================================
// PERSISTENCE & CSS / WIDGET / SCRIPT COMPILERS
// ============================================================================
export function loadPersistedCodeState(): PersistedCodeState {
  try {
    const raw =
      localStorage.getItem(CODE_PATCH_STORAGE_KEY) ||
      localStorage.getItem(LEGACY_V2_KEY) ||
      localStorage.getItem(LEGACY_V1_KEY);
    if (!raw) return { ...EMPTY_CODE_STATE };
    const parsed = JSON.parse(raw);
    return {
      liveCss: typeof parsed.liveCss === 'string' ? parsed.liveCss : '',
      cssPatches: Array.isArray(parsed.cssPatches) ? parsed.cssPatches : [],
      persistentJs: typeof parsed.persistentJs === 'string' ? parsed.persistentJs : '',
      scripts: Array.isArray(parsed.scripts) ? parsed.scripts : [],
      widgets: Array.isArray(parsed.widgets) ? parsed.widgets : [],
      domPatches: Array.isArray(parsed.domPatches) ? parsed.domPatches : [],
      files: Array.isArray(parsed.files) ? parsed.files : [],
      history: Array.isArray(parsed.history) ? parsed.history.slice(0, 8) : [],
    };
  } catch {
    return { ...EMPTY_CODE_STATE };
  }
}

export function savePersistedCodeState(state: PersistedCodeState): void {
  try {
    localStorage.setItem(CODE_PATCH_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore storage quota errors
  }
}

export function compileCombinedCss(state: Pick<PersistedCodeState, 'liveCss' | 'cssPatches'>): string {
  const parts: string[] = [];
  if (state.liveCss && state.liveCss.trim()) {
    parts.push(`/* [GLOBAL_LIVE_CSS] */\n${state.liveCss.trim()}`);
  }
  for (const p of state.cssPatches) {
    if (p.css && p.css.trim()) {
      parts.push(`/* [CSS_PATCH:${p.id}] */\n${p.css.trim()}`);
    }
  }
  return parts.join('\n\n');
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

export function applyFullCodeStateToDom(state: PersistedCodeState): void {
  applyLiveCssToDom(compileCombinedCss(state));
  syncCustomTargetWidgetsToDom(state.widgets);
  syncDomPatchesToDom(state.domPatches);
}

export function clearInjectedDomPortals(): void {
  if (typeof document === 'undefined') return;
  disposeAllManagedScopes('portal:');
  document.querySelectorAll(`.${PORTAL_CLASS}`).forEach((el) => el.remove());
}

/**
 * Mounts any widgets that specify a custom `targetSelector` directly into that DOM element
 * with managed timer/listener cleanup!
 */
export function syncCustomTargetWidgetsToDom(widgets: UltronLiveWidget[]): void {
  if (typeof document === 'undefined') return;
  clearInjectedDomPortals();
  for (const w of widgets) {
    if (!w.targetSelector) continue;
    let host: Element | null = null;
    try {
      host = document.querySelector(w.targetSelector);
    } catch {
      continue;
    }
    if (!host) continue;
    const wrapper = document.createElement('div');
    wrapper.className = PORTAL_CLASS;
    wrapper.id = `ultron-widget-${w.id}`;
    wrapper.setAttribute('data-widget-id', w.id);
    wrapper.innerHTML = w.html;
    host.appendChild(wrapper);
    if (w.js && w.js.trim()) {
      const scope = createManagedScope(`portal:${w.id}`);
      try {
        const fn = new Function(
          'root',
          'ULTRON_OS',
          'SCOPE',
          'setInterval',
          'setTimeout',
          w.js
        );
        fn(wrapper, (window as any).ULTRON_OS, scope, scope.setInterval, scope.setTimeout);
      } catch (err) {
        console.warn(`Custom widget [${w.id}] JS error:`, err);
      }
    }
  }
}

export async function runNamedScript(scriptId: string, jsCode: string): Promise<void> {
  const scopeKey = `script:${scriptId}`;
  disposeManagedScope(scopeKey);
  if (!jsCode || !jsCode.trim() || typeof window === 'undefined') return;
  const scope = createManagedScope(scopeKey);
  try {
    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
    const fn = new AsyncFunction('ULTRON_OS', 'SCOPE', 'setInterval', 'setTimeout', jsCode);
    await Promise.race([
      fn((window as any).ULTRON_OS, scope, scope.setInterval, scope.setTimeout),
      new Promise((_, rej) => setTimeout(() => rej(new Error('Persistent JS timeout')), 5000)),
    ]);
  } catch (err) {
    console.warn(`Persistent Ultron script [${scriptId}] error:`, err);
  }
}

export async function runAllPersistedScripts(state: PersistedCodeState): Promise<void> {
  if (state.persistentJs && state.persistentJs.trim()) {
    await runNamedScript('__legacy__', state.persistentJs);
  } else {
    disposeManagedScope('script:__legacy__');
  }
  for (const s of state.scripts) {
    await runNamedScript(s.id, s.js);
  }
}

export async function runPersistentDomScript(jsCode: string): Promise<void> {
  await runNamedScript('__legacy__', jsCode);
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

function makeSnapshot(s: PersistedCodeState): CodeSnapshot {
  return JSON.parse(
    JSON.stringify({
      liveCss: s.liveCss,
      cssPatches: s.cssPatches,
      persistentJs: s.persistentJs,
      scripts: s.scripts,
      widgets: s.widgets,
      domPatches: s.domPatches,
    })
  );
}

/**
 * Formats active CRUD state so Ultron can READ all existing CSS patches, widgets, DOM edits,
 * scripts, and virtual files on every turn before editing or deleting them!
 */
export function formatCodeCrudStateForPrompt(state?: PersistedCodeState): string {
  if (!state) return 'empty';
  const lines: string[] = [];

  if (state.liveCss.trim()) {
    lines.push(`rawLiveCss: ${JSON.stringify(state.liveCss.slice(0, 600))}`);
  }
  if (state.cssPatches.length > 0) {
    lines.push(
      `cssPatches(${state.cssPatches.length}):\n` +
        state.cssPatches
          .map((p) => `  - id="${p.id}": ${JSON.stringify(p.css.slice(0, 450))}`)
          .join('\n')
    );
  } else if (!state.liveCss.trim()) {
    lines.push('cssPatches: none');
  }

  if (state.widgets.length > 0) {
    lines.push(
      `widgets(${state.widgets.length}):\n` +
        state.widgets
          .map(
            (w) =>
              `  - id="${w.id}", title="${w.title}", target="${
                w.targetSelector || 'top_deck'
              }", html=${JSON.stringify(w.html.slice(0, 500))}${
                w.js ? `, js=${JSON.stringify(w.js.slice(0, 400))}` : ''
              }`
          )
          .join('\n')
    );
  } else {
    lines.push('widgets: none');
  }

  if (state.domPatches.length > 0) {
    lines.push(
      `domPatches(${state.domPatches.length}):\n` +
        state.domPatches
          .map(
            (d) =>
              `  - id="${d.id}", selector="${d.selector}", action="${d.action}", value=${JSON.stringify(
                (d.value ?? '').slice(0, 200)
              )}${d.styles ? `, styles=${JSON.stringify(d.styles)}` : ''}`
          )
          .join('\n')
    );
  } else {
    lines.push('domPatches: none');
  }

  if (state.scripts.length > 0 || state.persistentJs.trim()) {
    const scList = [
      ...(state.persistentJs.trim()
        ? [`  - id="__legacy__": ${JSON.stringify(state.persistentJs.slice(0, 300))}`]
        : []),
      ...state.scripts.map(
        (s) => `  - id="${s.id}" (${s.title || 'script'}): ${JSON.stringify(s.js.slice(0, 350))}`
      ),
    ];
    lines.push(`scripts(${scList.length}):\n${scList.join('\n')}`);
  } else {
    lines.push('scripts: none');
  }

  if (state.files.length > 0) {
    lines.push(
      `virtualFiles(${state.files.length}):\n` +
        state.files
          .map(
            (f) =>
              `  - name="${f.name}" (${f.content.length} chars): ${JSON.stringify(
                f.content.slice(0, 350)
              )}`
          )
          .join('\n')
    );
  } else {
    lines.push('virtualFiles: none');
  }

  lines.push(`undoSnapshotsAvailable: ${state.history.length}`);
  return lines.join('\n');
}

// ============================================================================
// FULL CRUD EXECUTION PIPELINE (<ultron_code>)
// ============================================================================
export async function executeUltronCodePayload(params: {
  codePayload: UltronCodePayload;
  currentState: PersistedCodeState;
}): Promise<{
  nextState: PersistedCodeState;
  executionOutput?: string;
  appliedSummary: string;
}> {
  const { codePayload, currentState } = params;
  const nowIso = new Date().toISOString();
  const actionsDone: string[] = [];
  const outputBlocks: string[] = [];

  // 0. UNDO LAST CODE PATCH (Instant 1-step rollback)
  if (codePayload.undoLastPatch && currentState.history.length > 0) {
    const [latestSnap, ...restHistory] = currentState.history;
    disposeAllManagedScopes();
    const restored: PersistedCodeState = {
      ...latestSnap,
      files: [...currentState.files],
      history: restHistory,
    };
    applyFullCodeStateToDom(restored);
    await runAllPersistedScripts(restored);
    savePersistedCodeState(restored);
    return {
      nextState: restored,
      appliedSummary: codePayload.summary || 'Reverted last code / UI patch from undo history',
    };
  }

  // Push current state onto undo stack before mutating
  const nextHistory = [makeSnapshot(currentState), ...currentState.history].slice(0, 8);

  let nextLiveCss = currentState.liveCss;
  let nextCssPatches = [...currentState.cssPatches];
  let nextPersistentJs = currentState.persistentJs;
  let nextScripts = [...currentState.scripts];
  let nextWidgets = [...currentState.widgets];
  let nextDomPatches = [...currentState.domPatches];
  let nextFiles = [...currentState.files];

  // 1. CLEAR ALL PATCHES (Full Reset)
  if (codePayload.clearAllPatches) {
    disposeAllManagedScopes();
    revertAllDomPatchesFromDom();
    clearInjectedDomPortals();
    applyLiveCssToDom('');
    nextLiveCss = '';
    nextCssPatches = [];
    nextPersistentJs = '';
    nextScripts = [];
    nextWidgets = [];
    nextDomPatches = [];
    actionsDone.push('Cleared all CSS patches, widgets, DOM edits & persistent scripts');
  }

  // 2. CSS CRUD (Delete, Edit/Replace, Create/Upsert)
  if (Array.isArray(codePayload.removeCssPatchIds) && codePayload.removeCssPatchIds.length > 0) {
    if (codePayload.removeCssPatchIds.includes('*')) {
      nextLiveCss = '';
      nextCssPatches = [];
      actionsDone.push('Removed all CSS patches');
    } else {
      const rmSet = new Set(codePayload.removeCssPatchIds);
      if (rmSet.has('__legacy__') || rmSet.has('global')) {
        nextLiveCss = '';
      }
      const before = nextCssPatches.length;
      nextCssPatches = nextCssPatches.filter((p) => !rmSet.has(p.id));
      actionsDone.push(
        `Deleted ${Math.max(1, before - nextCssPatches.length)} CSS patch(es): [${codePayload.removeCssPatchIds.join(', ')}]`
      );
    }
  }

  if (codePayload.replaceInCss && codePayload.replaceInCss.find) {
    const { patchId, find, replace } = codePayload.replaceInCss;
    if (patchId) {
      nextCssPatches = nextCssPatches.map((p) =>
        p.id === patchId
          ? { ...p, css: p.css.split(find).join(replace), updatedAt: nowIso }
          : p
      );
      actionsDone.push(`Edited CSS patch [${patchId}]`);
    } else {
      nextLiveCss = nextLiveCss.split(find).join(replace);
      nextCssPatches = nextCssPatches.map((p) => ({
        ...p,
        css: p.css.split(find).join(replace),
        updatedAt: nowIso,
      }));
      actionsDone.push('Edited live CSS rules via find/replace');
    }
  }

  const incomingCssPatches: Array<{ id: string; css: string }> = [];
  if (codePayload.cssPatch && codePayload.cssPatch.id) {
    incomingCssPatches.push(codePayload.cssPatch);
  }
  if (Array.isArray(codePayload.cssPatches)) {
    incomingCssPatches.push(...codePayload.cssPatches.filter((p) => p && p.id));
  }
  for (const patch of incomingCssPatches) {
    if (!patch.css || !patch.css.trim()) {
      // Empty css string on an ID = delete that patch!
      nextCssPatches = nextCssPatches.filter((p) => p.id !== patch.id);
      actionsDone.push(`Removed CSS patch [${patch.id}]`);
    } else {
      const exists = nextCssPatches.some((p) => p.id === patch.id);
      const updatedItem: UltronCssPatch = {
        id: patch.id,
        css: patch.css,
        updatedAt: nowIso,
      };
      nextCssPatches = exists
        ? nextCssPatches.map((p) => (p.id === patch.id ? updatedItem : p))
        : [...nextCssPatches, updatedItem];
      actionsDone.push(`${exists ? 'Updated' : 'Created'} CSS patch [${patch.id}]`);
    }
  }

  if (typeof codePayload.liveCss === 'string') {
    if (!codePayload.liveCss.trim() && codePayload.appendCss === false) {
      nextLiveCss = '';
      nextCssPatches = [];
      actionsDone.push('Cleared live CSS');
    } else if (codePayload.liveCss.trim()) {
      nextLiveCss =
        codePayload.appendCss && nextLiveCss
          ? `${nextLiveCss}\n/* --- PATCH --- */\n${codePayload.liveCss}`
          : codePayload.liveCss;
      actionsDone.push(
        codePayload.appendCss === false ? 'Replaced live CSS' : 'Injected live CSS'
      );
    }
  }

  // 3. PERSISTENT SCRIPT CRUD (Delete/Stop, Create/Update)
  if (Array.isArray(codePayload.removeScriptIds) && codePayload.removeScriptIds.length > 0) {
    if (codePayload.removeScriptIds.includes('*')) {
      disposeAllManagedScopes('script:');
      nextPersistentJs = '';
      nextScripts = [];
      actionsDone.push('Stopped & deleted all persistent scripts');
    } else {
      for (const id of codePayload.removeScriptIds) {
        disposeManagedScope(`script:${id}`);
        if (id === '__legacy__') nextPersistentJs = '';
      }
      const rmSet = new Set(codePayload.removeScriptIds);
      nextScripts = nextScripts.filter((s) => !rmSet.has(s.id));
      actionsDone.push(`Stopped & deleted script(s): [${codePayload.removeScriptIds.join(', ')}]`);
    }
  }

  if (typeof codePayload.persistentJs === 'string') {
    nextPersistentJs = codePayload.persistentJs;
    await runNamedScript('__legacy__', nextPersistentJs);
    actionsDone.push(
      nextPersistentJs.trim()
        ? 'Applied & saved persistent DOM script'
        : 'Stopped & cleared persistent DOM script'
    );
  }

  if (codePayload.scriptPatch && codePayload.scriptPatch.id) {
    const sp = codePayload.scriptPatch;
    if (!sp.js || !sp.js.trim()) {
      disposeManagedScope(`script:${sp.id}`);
      nextScripts = nextScripts.filter((s) => s.id !== sp.id);
      actionsDone.push(`Stopped & deleted script [${sp.id}]`);
    } else {
      const exists = nextScripts.some((s) => s.id === sp.id);
      const item: UltronScriptPatch = {
        id: sp.id,
        title: sp.title,
        js: sp.js,
        updatedAt: nowIso,
      };
      nextScripts = exists
        ? nextScripts.map((s) => (s.id === sp.id ? item : s))
        : [...nextScripts, item];
      await runNamedScript(sp.id, sp.js);
      actionsDone.push(`${exists ? 'Updated' : 'Created'} script [${sp.id}]`);
    }
  }

  // 4. WIDGET CRUD (Delete, Partial Update/Edit, Create/Replace)
  const widgetsToRemove: string[] = [];
  if (codePayload.removeWidgetId) widgetsToRemove.push(codePayload.removeWidgetId);
  if (Array.isArray(codePayload.removeWidgetIds)) {
    widgetsToRemove.push(...codePayload.removeWidgetIds);
  }
  if (widgetsToRemove.length > 0) {
    if (widgetsToRemove.includes('*')) {
      disposeAllManagedScopes('widget:');
      disposeAllManagedScopes('portal:');
      nextWidgets = [];
      actionsDone.push('Deleted all mounted widgets');
    } else {
      for (const id of widgetsToRemove) {
        disposeManagedScope(`widget:${id}`);
        disposeManagedScope(`portal:${id}`);
      }
      const rmSet = new Set(widgetsToRemove);
      // Also allow matching by widget title (case-insensitive) if model passed title instead of ID!
      nextWidgets = nextWidgets.filter(
        (w) =>
          !rmSet.has(w.id) &&
          !widgetsToRemove.some((q) => w.title.toLowerCase() === q.toLowerCase())
      );
      actionsDone.push(`Deleted widget(s): [${widgetsToRemove.join(', ')}]`);
    }
  }

  if (codePayload.updateWidget && codePayload.updateWidget.id) {
    const u = codePayload.updateWidget;
    const targetIdx = nextWidgets.findIndex(
      (w) => w.id === u.id || w.title.toLowerCase() === u.id.toLowerCase()
    );
    if (targetIdx >= 0) {
      const prev = nextWidgets[targetIdx];
      let html = u.html !== undefined ? u.html : prev.html;
      if (u.replaceInHtml && u.replaceInHtml.find) {
        html = html.split(u.replaceInHtml.find).join(u.replaceInHtml.replace);
      }
      let js = u.js !== undefined ? u.js : prev.js;
      if (js && u.replaceInJs && u.replaceInJs.find) {
        js = js.split(u.replaceInJs.find).join(u.replaceInJs.replace);
      }
      const edited: UltronLiveWidget = {
        ...prev,
        title: u.title !== undefined ? u.title : prev.title,
        html,
        js,
        targetSelector:
          u.targetSelector !== undefined ? u.targetSelector || undefined : prev.targetSelector,
        updatedAt: nowIso,
      };
      nextWidgets[targetIdx] = edited;
      actionsDone.push(`Edited widget "${edited.title}" [${edited.id}]`);
    } else if (u.html) {
      // Upsert if it didn't exist yet and HTML was provided
      const created: UltronLiveWidget = {
        id: u.id,
        title: u.title || 'ULTRON MODULE',
        html: u.html,
        js: u.js,
        targetSelector: u.targetSelector || undefined,
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      nextWidgets = [created, ...nextWidgets].slice(0, 10);
      actionsDone.push(`Created widget "${created.title}" [${created.id}]`);
    }
  }

  if (codePayload.widget && codePayload.widget.id) {
    const wIn = codePayload.widget;
    const existing = nextWidgets.find((x) => x.id === wIn.id);
    if (existing) {
      const updatedWidget: UltronLiveWidget = {
        ...existing,
        title: wIn.title || existing.title,
        html: wIn.html !== undefined ? wIn.html : existing.html,
        js: wIn.js !== undefined ? wIn.js : existing.js,
        targetSelector:
          wIn.targetSelector !== undefined
            ? wIn.targetSelector || undefined
            : existing.targetSelector,
        updatedAt: nowIso,
      };
      nextWidgets = nextWidgets.map((x) => (x.id === wIn.id ? updatedWidget : x));
      actionsDone.push(`Updated widget "${updatedWidget.title}" [${updatedWidget.id}]`);
    } else if (wIn.html) {
      const newWidget: UltronLiveWidget = {
        id: wIn.id,
        title: wIn.title || 'ULTRON MODULE',
        html: wIn.html,
        js: wIn.js,
        targetSelector: wIn.targetSelector || undefined,
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      nextWidgets = [newWidget, ...nextWidgets].slice(0, 10);
      actionsDone.push(
        `Created widget "${newWidget.title}"${
          newWidget.targetSelector ? ` into ${newWidget.targetSelector}` : ''
        }`
      );
    }
  }

  // 5. NATIVE DOM ELEMENT CRUD (Delete/Revert, Create/Update)
  if (Array.isArray(codePayload.removeDomPatchIds) && codePayload.removeDomPatchIds.length > 0) {
    if (codePayload.removeDomPatchIds.includes('*')) {
      nextDomPatches = [];
      actionsDone.push('Reverted all native DOM element edits');
    } else {
      const rmSet = new Set(codePayload.removeDomPatchIds);
      nextDomPatches = nextDomPatches.filter(
        (d) => !rmSet.has(d.id) && !rmSet.has(d.selector)
      );
      actionsDone.push(
        `Reverted DOM edit(s): [${codePayload.removeDomPatchIds.join(', ')}]`
      );
    }
  }

  const incomingDomPatches: Array<Omit<UltronDomPatch, 'updatedAt'>> = [];
  if (codePayload.domPatch && codePayload.domPatch.selector) {
    incomingDomPatches.push({
      ...codePayload.domPatch,
      id: codePayload.domPatch.id || `dom_${Date.now()}`,
    });
  }
  if (Array.isArray(codePayload.domPatches)) {
    for (const dp of codePayload.domPatches) {
      if (dp && dp.selector) {
        incomingDomPatches.push({
          ...dp,
          id: dp.id || `dom_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
        });
      }
    }
  }
  for (const dp of incomingDomPatches) {
    const exists = nextDomPatches.some((d) => d.id === dp.id);
    const fullDp: UltronDomPatch = { ...dp, updatedAt: nowIso };
    nextDomPatches = exists
      ? nextDomPatches.map((d) => (d.id === dp.id ? fullDp : d))
      : [...nextDomPatches, fullDp];
    actionsDone.push(
      `${exists ? 'Updated' : 'Applied'} DOM ${dp.action} on "${dp.selector}" [${dp.id}]`
    );
  }

  // 6. VIRTUAL WORKSPACE FILES CRUD (Delete, Create, Edit, Read, Download)
  if (Array.isArray(codePayload.deleteFileNames) && codePayload.deleteFileNames.length > 0) {
    if (codePayload.deleteFileNames.includes('*')) {
      nextFiles = [];
      actionsDone.push('Deleted all virtual files');
    } else {
      const rmNames = new Set(codePayload.deleteFileNames.map((n) => n.toLowerCase()));
      nextFiles = nextFiles.filter((f) => !rmNames.has(f.name.toLowerCase()));
      actionsDone.push(`Deleted file(s): [${codePayload.deleteFileNames.join(', ')}]`);
    }
  }

  if (codePayload.saveFile && codePayload.saveFile.name) {
    const sf = codePayload.saveFile;
    const exists = nextFiles.some((f) => f.name.toLowerCase() === sf.name.toLowerCase());
    const item: UltronVirtualFile = {
      name: sf.name,
      content: sf.content ?? '',
      mimeType: sf.mimeType,
      updatedAt: nowIso,
    };
    nextFiles = exists
      ? nextFiles.map((f) => (f.name.toLowerCase() === sf.name.toLowerCase() ? item : f))
      : [item, ...nextFiles].slice(0, 25);
    actionsDone.push(`${exists ? 'Updated' : 'Created'} file "${sf.name}"`);
    if (sf.download) {
      triggerFileDownload(sf.name, item.content, sf.mimeType);
    }
  }

  if (codePayload.editFile && codePayload.editFile.name) {
    const ef = codePayload.editFile;
    const idx = nextFiles.findIndex((f) => f.name.toLowerCase() === ef.name.toLowerCase());
    if (idx >= 0) {
      let nextContent = nextFiles[idx].content;
      if (typeof ef.content === 'string') {
        nextContent = ef.content;
      } else if (ef.find) {
        nextContent = nextContent.split(ef.find).join(ef.replace ?? '');
      }
      if (ef.append) {
        nextContent += ef.append;
      }
      nextFiles[idx] = { ...nextFiles[idx], content: nextContent, updatedAt: nowIso };
      actionsDone.push(`Edited file "${nextFiles[idx].name}"`);
      if (ef.download) {
        triggerFileDownload(nextFiles[idx].name, nextContent, nextFiles[idx].mimeType);
      }
    } else if (typeof ef.content === 'string') {
      const created: UltronVirtualFile = {
        name: ef.name,
        content: ef.content,
        updatedAt: nowIso,
      };
      nextFiles = [created, ...nextFiles];
      actionsDone.push(`Created file "${ef.name}"`);
    }
  }

  if (codePayload.readFileName) {
    const found = nextFiles.find(
      (f) => f.name.toLowerCase() === codePayload.readFileName!.toLowerCase()
    );
    outputBlocks.push(
      found
        ? `=== FILE: ${found.name} ===\n${found.content}`
        : `File "${codePayload.readFileName}" not found in workspace vault.`
    );
  }

  // Commit compiled CSS, custom portals & reversible DOM patches to the live DOM BEFORE executeJs!
  const nextState: PersistedCodeState = {
    liveCss: nextLiveCss,
    cssPatches: nextCssPatches,
    persistentJs: nextPersistentJs,
    scripts: nextScripts,
    widgets: nextWidgets,
    domPatches: nextDomPatches,
    files: nextFiles,
    history: nextHistory,
  };

  applyFullCodeStateToDom(nextState);
  savePersistedCodeState(nextState);

  if (codePayload.downloadFile?.filename && typeof codePayload.downloadFile.content === 'string') {
    triggerFileDownload(
      codePayload.downloadFile.filename,
      codePayload.downloadFile.content,
      codePayload.downloadFile.mimeType
    );
    actionsDone.push(`Downloaded "${codePayload.downloadFile.filename}"`);
  }

  // 7. ONE-SHOT ROOT JS EXECUTION (Can also call ULTRON_OS CRUD methods directly!)
  if (codePayload.executeJs && codePayload.executeJs.trim()) {
    try {
      const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
      const fn = new AsyncFunction('ULTRON_OS', codePayload.executeJs);
      const res = await Promise.race([
        fn((window as any).ULTRON_OS),
        new Promise((_, rej) => setTimeout(() => rej(new Error('Execution timeout (8s)')), 8000)),
      ]);
      if (res !== undefined) {
        outputBlocks.push(
          typeof res === 'string' ? res : JSON.stringify(res, null, 2)
        );
      }
      actionsDone.push('Executed live JS with ULTRON_OS CRUD access');
    } catch (err) {
      outputBlocks.push(
        `JS Runtime Error: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  // Re-read storage in case executeJs mutated ULTRON_OS state synchronously!
  const finalState =
    codePayload.executeJs && codePayload.executeJs.trim()
      ? loadPersistedCodeState()
      : nextState;

  return {
    nextState: finalState,
    executionOutput: outputBlocks.length > 0 ? outputBlocks.join('\n\n') : undefined,
    appliedSummary:
      codePayload.summary || actionsDone.join(' • ') || 'Applied live CRUD code patch',
  };
}
