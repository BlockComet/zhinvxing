import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { AGENT_REASONING_LEVELS, CUSTOM_MODEL_APIS, type CustomProviderDetails, type CustomProviderModel, type SaveCustomProviderRequest } from "../shared/contracts.js";
import { reasoningLabel, supportedReasoningLevels } from "../shared/reasoning.js";
import { discoverCustomProviderModels, saveCustomProvider } from "./api.js";
import { LoaderCircle, Pencil, Plus, RefreshCw, Search, Trash2, X } from "./icons.js";
import { initialCustomThinkingLevelMap, invalidateCustomModelCapabilities, mergeDiscoveredProviderModels, modelError, type ModelRow } from "./custom-provider-models.js";

const PRESETS = {
  gateway: { name: "", baseUrl: "", api: "openai-completions", authentication: "api_key" },
  ollama: { name: "Ollama", baseUrl: "http://localhost:11434/v1", api: "openai-completions", authentication: "none" },
  lmstudio: { name: "LM Studio", baseUrl: "http://localhost:1234/v1", api: "openai-completions", authentication: "none" },
} as const;

export const PROVIDER_API_LABELS: Record<string, string> = {
  "openai-completions": "OpenAI Chat Completions",
  "openai-responses": "OpenAI Responses",
  "anthropic-messages": "Anthropic Messages",
  "google-generative-ai": "Google Generative AI",
  "google-vertex": "Google Vertex AI",
};

const emptyModel = (): CustomProviderModel => ({ id: "", name: "", api: "openai-completions", contextWindow: 128_000, maxTokens: 16_384, reasoning: false, supportsImages: false });

export type CustomProviderField = "name" | "baseUrl" | "api" | "apiKey" | "models";

export function CustomProviderDialog({ settings, initialFocus = "name", onClose, onSaved }: {
  settings?: CustomProviderDetails;
  initialFocus?: CustomProviderField;
  onClose: () => void;
  onSaved: (settings: CustomProviderDetails) => void;
}) {
  const titleId = useId();
  const dialog = useRef<HTMLElement>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  const endpointInput = useRef<HTMLInputElement>(null);
  const keyInput = useRef<HTMLInputElement>(null);
  const apiInput = useRef<HTMLSelectElement>(null);
  const authenticationInput = useRef<HTMLSelectElement>(null);
  const modelSearch = useRef<HTMLInputElement>(null);
  const fetchButton = useRef<HTMLButtonElement>(null);
  const closeRef = useRef(onClose);
  const savingRef = useRef(false);
  const discovery = useRef<AbortController | undefined>(undefined);
  const [preset, setPreset] = useState<keyof typeof PRESETS>("gateway");
  const [form, setForm] = useState<SaveCustomProviderRequest>(settings ? { name: settings.name, baseUrl: settings.baseUrl, api: settings.api, authentication: settings.authentication } : PRESETS.gateway);
  const [rows, setRows] = useState<ModelRow[]>(() => {
    const hidden = new Set(settings?.hiddenModelIds);
    return settings?.models.map((model) => ({ model, enabled: !hidden.has(model.id), saved: true })) ?? [];
  });
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<string>();
  const [fetching, setFetching] = useState(false);
  const [discoveryError, setDiscoveryError] = useState<string>();
  const [truncated, setTruncated] = useState(false);
  const [fetchedCount, setFetchedCount] = useState<number>();
  const [manualOpen, setManualOpen] = useState(false);
  const [manual, setManual] = useState<CustomProviderModel>(emptyModel);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  closeRef.current = onClose;
  savingRef.current = saving;

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
    const initialInput = initialFocus === "baseUrl" ? endpointInput.current
      : initialFocus === "api" ? apiInput.current
      : initialFocus === "apiKey" ? keyInput.current ?? authenticationInput.current
      : initialFocus === "models" ? modelSearch.current ?? fetchButton.current
      : nameInput.current;
    initialInput?.focus();
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        if (!savingRef.current) closeRef.current();
      }
      if (event.key !== "Tab" || !dialog.current) return;
      const elements = [...dialog.current.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled), select:not(:disabled), summary, [tabindex='0']")].filter((element) => element.getClientRects().length > 0);
      const first = elements[0];
      const last = elements.at(-1);
      if (!first || !last) { event.preventDefault(); return; }
      if (!dialog.current.contains(document.activeElement) || (!event.shiftKey && document.activeElement === last)) { event.preventDefault(); first.focus(); }
      else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    };
    window.addEventListener("keydown", keyboard, true);
    return () => { discovery.current?.abort(); window.removeEventListener("keydown", keyboard, true); previousFocus?.focus(); };
  }, []);

  function cancelDiscovery(): void {
    discovery.current?.abort();
    setFetching(false);
  }

  function field<K extends keyof SaveCustomProviderRequest>(key: K, value: SaveCustomProviderRequest[K]): void {
    if (key !== "name") { cancelDiscovery(); setDiscoveryError(undefined); setFetchedCount(undefined); setTruncated(false); }
    if (key === "api" || key === "baseUrl") {
      setRows((current) => current.map((row) => ({ ...row, model: invalidateCustomModelCapabilities(row.model, key === "api" && row.model.api === form.api ? String(value) : row.model.api) })));
      setManual((current) => invalidateCustomModelCapabilities(current, key === "api" ? String(value) : current.api));
    }
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function fetchModels(): Promise<void> {
    if (!endpointInput.current?.reportValidity() || (keyInput.current && !keyInput.current.reportValidity())) return;
    cancelDiscovery();
    const controller = new AbortController();
    discovery.current = controller;
    setFetching(true);
    setDiscoveryError(undefined);
    try {
      const loaded = await discoverCustomProviderModels({ providerId: settings?.id, baseUrl: form.baseUrl, api: form.api, authentication: form.authentication, apiKey: form.authentication === "api_key" ? form.apiKey : undefined }, controller.signal);
      if (controller.signal.aborted) return;
      setRows((current) => mergeDiscoveredProviderModels(current, loaded.models));
      setFetchedCount(loaded.models.length);
      setTruncated(loaded.truncated === true);
    } catch (cause) {
      if (!controller.signal.aborted) setDiscoveryError(cause instanceof Error ? cause.message : String(cause));
    } finally { if (!controller.signal.aborted) setFetching(false); }
  }

  function updateModel(id: string, model: CustomProviderModel): void {
    setRows((current) => current.map((row) => row.model.id === id ? { ...row, model } : row));
  }

  function toggleModels(ids: string[], enabled: boolean): void {
    const matching = new Set(ids);
    setRows((current) => current.map((row) => matching.has(row.model.id) ? { ...row, enabled } : row));
  }

  function addManualModel(): void {
    const model = { ...manual, id: manual.id.trim(), name: manual.name.trim() || manual.id.trim(), api: form.api };
    const invalid = modelError(model);
    if (invalid || rows.some((row) => row.model.id === model.id)) {
      setError(invalid ?? "列表中已存在此 ID 的模型。");
      setManualOpen(true);
      return;
    }
    setRows((current) => [...current, { model, enabled: true, saved: false }]);
    setManual(emptyModel());
    setManualOpen(false);
    setQuery("");
    setError(undefined);
  }

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (savingRef.current) return;
    if (!nameInput.current?.reportValidity() || !endpointInput.current?.reportValidity() || (keyInput.current && !keyInput.current.reportValidity())) return;
    const included = rows.filter((row) => row.saved || row.enabled);
    for (const row of included) {
      const invalid = modelError(row.model);
      if (invalid) { setError(invalid); setQuery(""); setEditing(row.model.id); return; }
    }
    const models = included.map((row) => ({ ...row.model, name: row.model.name.trim() || row.model.id }));
    cancelDiscovery();
    savingRef.current = true;
    setSaving(true);
    setError(undefined);
    try {
      const saved = await saveCustomProvider({
        ...form,
        apiKey: form.authentication === "api_key" ? form.apiKey : undefined,
        models, hiddenModelIds: included.filter((row) => !row.enabled).map((row) => row.model.id),
      }, settings?.id);
      onSaved(saved);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      savingRef.current = false;
      setSaving(false);
    }
  }

  const search = query.trim().toLowerCase();
  const visibleModels = rows.filter((row) => !search || `${row.model.id} ${row.model.name}`.toLowerCase().includes(search));
  const enabledCount = rows.filter((row) => row.enabled).length;
  const allVisibleEnabled = visibleModels.length > 0 && visibleModels.every((row) => row.enabled);

  return createPortal(<div className="project-settings-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !savingRef.current) onClose(); }}>
    <section ref={dialog} className="project-settings-dialog custom-provider-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
      <header><h2 id={titleId}>{settings ? "编辑自定义服务商" : "添加服务商"}</h2><button type="button" disabled={saving} aria-label="关闭" onClick={onClose}><X size={16} /></button></header>
      <form noValidate onSubmit={(event) => void submit(event)}>
        <div className="custom-provider-dialog-body">
          <p className="custom-provider-intro">连接具有独立接口地址和模型的网关或本地模型服务。</p>
          <fieldset className="project-settings-section" disabled={saving}>
            <div className={!settings ? "project-settings-field-row" : undefined}>
              {!settings ? <label><span>预设</span><select value={preset} onChange={(event) => { const next = event.target.value as keyof typeof PRESETS; cancelDiscovery(); setPreset(next); setForm({ ...PRESETS[next] }); setRows((current) => current.map((row) => ({ ...row, model: invalidateCustomModelCapabilities(row.model, row.model.api === form.api ? PRESETS[next].api : row.model.api) }))); setManual((current) => invalidateCustomModelCapabilities(current, PRESETS[next].api)); setDiscoveryError(undefined); setFetchedCount(undefined); setTruncated(false); }}>
                <option value="gateway">自定义网关</option><option value="ollama">Ollama</option><option value="lmstudio">LM Studio</option>
              </select></label> : null}
              <label><span>显示名称</span><input ref={nameInput} value={form.name} onChange={(event) => field("name", event.target.value)} placeholder="我的服务商" maxLength={100} required autoComplete="off" /></label>
            </div>
            <label><span>API 基础地址</span><input ref={endpointInput} type="url" value={form.baseUrl} onChange={(event) => field("baseUrl", event.target.value)} placeholder="https://api.example.com/v1" required autoComplete="off" spellCheck={false} /><small>请填写 API 接口地址；如果服务要求，请包含 /v1。</small></label>
            <div className="project-settings-field-row">
              <label><span>API 协议</span><select ref={apiInput} value={form.api} onChange={(event) => field("api", event.target.value)}>{CUSTOM_MODEL_APIS.map((api) => <option key={api} value={api}>{PROVIDER_API_LABELS[api]}</option>)}</select></label>
              <label><span>身份验证</span><select ref={authenticationInput} value={form.authentication} onChange={(event) => field("authentication", event.target.value as SaveCustomProviderRequest["authentication"])}><option value="api_key">API 密钥</option><option value="none">无需 API 密钥</option></select></label>
            </div>
            {form.authentication === "api_key" ? <label><span>API 密钥</span><input ref={keyInput} type="password" value={form.apiKey ?? ""} onChange={(event) => field("apiKey", event.target.value)} required={!settings || settings.authentication !== "api_key"} placeholder={settings?.authentication === "api_key" ? "留空以保留当前密钥" : "粘贴 API 密钥"} autoComplete="new-password" spellCheck={false} /></label> : <p className="custom-provider-hint">适用于无需 API 密钥的本地服务。</p>}
          </fieldset>
          <section className="custom-provider-model-picker" aria-label="模型设置">
            <div className="custom-provider-model-heading">
              <h3>语言模型 <small>已启用 {enabledCount}</small></h3>
              <button ref={fetchButton} className="settings-secondary-button" type="button" disabled={saving || fetching} onClick={() => void fetchModels()}>{fetching ? <LoaderCircle className="spin" size={13} /> : <RefreshCw size={13} />}{fetching ? "正在获取…" : "获取"}</button>
            </div>
            <p className="custom-provider-hint">获取模型列表或手动添加。也可不添加模型直接保存服务商。</p>
            {discoveryError ? <p className="project-settings-error" role="alert">{discoveryError}</p> : null}
            {fetchedCount !== undefined ? <p className="custom-provider-hint" role="status">{truncated ? `已获取前 ${fetchedCount} 个模型，其他模型 ID 可手动添加。` : `已获取 ${fetchedCount} 个模型。`}</p> : null}
            {rows.length ? <>
              <label className="custom-provider-model-search"><Search size={14} /><input ref={modelSearch} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索模型" aria-label="搜索模型" disabled={saving} /></label>
              {visibleModels.length ? <>
                <label className="custom-provider-select-all"><input type="checkbox" checked={allVisibleEnabled} onChange={(event) => toggleModels(visibleModels.map((row) => row.model.id), event.target.checked)} disabled={saving} />{search ? "启用匹配的模型" : "启用全部模型"}</label>
                <div className={`custom-provider-model-results${visibleModels.some((row) => row.model.id === editing) ? " is-editing" : ""}`} role="group" aria-label="可用模型">
                  {visibleModels.map((row) => <div className="custom-provider-model-item" key={row.model.id}>
                    <div className="custom-provider-model-row">
                      <label className="custom-provider-model-choice"><input type="checkbox" aria-label={`启用 ${row.model.name || row.model.id}`} checked={row.enabled} onChange={(event) => toggleModels([row.model.id], event.target.checked)} disabled={saving} /><span><strong>{row.model.name || row.model.id}</strong><small>{row.model.id}</small></span></label>
                      <button className="icon-button" type="button" aria-label={`编辑 ${row.model.name || row.model.id}`} data-tooltip={`编辑 ${row.model.name || row.model.id}`} aria-expanded={editing === row.model.id} disabled={saving} onClick={() => setEditing((current) => current === row.model.id ? undefined : row.model.id)}><Pencil size={14} /></button>
                      <button className="icon-button" type="button" aria-label={`移除 ${row.model.name || row.model.id}`} data-tooltip={`移除 ${row.model.name || row.model.id}`} disabled={saving} onClick={() => { setRows((current) => current.filter((item) => item.model.id !== row.model.id)); if (editing === row.model.id) setEditing(undefined); }}><Trash2 size={14} /></button>
                    </div>
                    {editing === row.model.id ? <div className="custom-provider-model-editor" role="group" aria-label={`编辑模型 ${row.model.id}`}><ModelFields model={row.model} onChange={(model) => updateModel(row.model.id, model)} disabled={saving} /></div> : null}
                  </div>)}
                </div>
              </> : <p className="custom-provider-hint">没有匹配的模型。</p>}
            </> : <p className="custom-provider-model-empty">尚未添加模型。</p>}
            <details className="custom-provider-manual" open={manualOpen} onToggle={(event) => setManualOpen(event.currentTarget.open)}>
              <summary>手动添加模型</summary>
              <label><span>模型 ID</span><input value={manual.id} onChange={(event) => setManual((current) => ({ ...current, id: event.target.value }))} placeholder={preset === "ollama" ? "qwen3:8b" : "服务商提供的模型 ID"} maxLength={200} disabled={saving} autoComplete="off" spellCheck={false} /></label>
              <details className="custom-provider-advanced"><summary>高级模型设置</summary><ModelFields model={manual} onChange={setManual} disabled={saving || !manual.id.trim()} /></details>
              <button className="settings-secondary-button custom-provider-manual-add" type="button" disabled={saving || !manual.id.trim()} onClick={addManualModel}><Plus size={13} />添加模型</button>
            </details>
          </section>
          {error ? <p className="project-settings-error" role="alert">{error}</p> : null}
        </div>
        <footer><button type="button" disabled={saving} onClick={onClose}>取消</button><button className="project-settings-submit" type="submit" disabled={saving}>{saving ? <LoaderCircle className="spin" size={14} /> : null}{saving ? "正在保存…" : settings ? "保存更改" : "添加服务商"}</button></footer>
      </form>
    </section>
  </div>, document.body);
}

function ModelFields({ model, onChange, disabled }: { model: CustomProviderModel; onChange: (model: CustomProviderModel) => void; disabled: boolean }) {
  const field = <K extends keyof CustomProviderModel>(key: K, value: CustomProviderModel[K]) => onChange({ ...model, [key]: value });
  const automaticMap = model.reasoningCapabilities?.thinkingLevelMap;
  const automaticLevels = supportedReasoningLevels({ reasoning: true, thinkingLevelMap: automaticMap });
  const effectiveMap = { ...automaticMap, ...model.thinkingLevelMap };
  const levels = supportedReasoningLevels({ reasoning: true, thinkingLevelMap: effectiveMap });
  return <fieldset className="project-settings-section" disabled={disabled}>
    <label><span>模型显示名称</span><input value={model.name} onChange={(event) => field("name", event.target.value)} placeholder={model.id || "与模型 ID 相同"} maxLength={200} /></label>
    <div className="project-settings-field-row">
      <label><span>上下文长度</span><input type="number" min={1} max={100_000_000} step={1} value={model.contextWindow} onChange={(event) => field("contextWindow", Number(event.target.value))} required /></label>
      <label><span>最大输出 Token 数</span><input type="number" min={1} max={model.contextWindow} step={1} value={model.maxTokens} onChange={(event) => field("maxTokens", Number(event.target.value))} required /></label>
    </div>
    <div className="custom-provider-capabilities"><label><input type="checkbox" checked={model.reasoning} onChange={(event) => field("reasoning", event.target.checked)} />推理</label><label><input type="checkbox" checked={model.supportsImages} onChange={(event) => field("supportsImages", event.target.checked)} />图片输入</label></div>
    {model.reasoning ? <details className="custom-provider-advanced"><summary>推理设置</summary>
      <label><span>推理级别</span><select value={model.thinkingLevelMap ? "custom" : "automatic"} onChange={(event) => field("thinkingLevelMap", event.target.value === "automatic" ? undefined : initialCustomThinkingLevelMap(model))}><option value="automatic">自动</option><option value="custom">自定义</option></select></label>
      {model.thinkingLevelMap ? <>
        <p className="custom-provider-hint">启用支持的推理级别，并设置发送给服务商的参数。</p>
        <div className="custom-provider-reasoning-levels">
          {AGENT_REASONING_LEVELS.map((level) => <div className="custom-provider-reasoning-row" key={level}>
            <label><input type="checkbox" checked={levels.includes(level)} onChange={(event) => field("thinkingLevelMap", { ...model.thinkingLevelMap, [level]: event.target.checked ? automaticMap?.[level] ?? (level === "off" ? "none" : level) : null })} />{reasoningLabel(level)}</label>
            <input aria-label={`${reasoningLabel(level)} parameter`} value={levels.includes(level) ? effectiveMap[level] ?? (level === "off" ? "none" : level) : ""} disabled={!levels.includes(level)} maxLength={100} spellCheck={false} autoComplete="off" placeholder={level === "off" ? "none" : level} onChange={(event) => field("thinkingLevelMap", { ...model.thinkingLevelMap, [level]: event.target.value })} />
          </div>)}
        </div>
      </> : <p className="custom-provider-hint">{automaticLevels.map(reasoningLabel).join(" · ")}{model.reasoningCapabilities?.source === "provider" ? " — 由服务商提供" : model.reasoningCapabilities?.source === "catalog" ? " — 来自模型目录" : " — 默认级别，可按需调整"}</p>}
    </details> : null}
  </fieldset>;
}
