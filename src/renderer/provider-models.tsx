import { useEffect, useId, useState, type FormEvent } from "react";
import { CUSTOM_MODEL_APIS, type CustomProviderModel, type ProviderModelSettings } from "../shared/contracts.js";
import { addCustomProviderModel, getProviderModels, removeCustomProviderModel, setProviderModelVisibility } from "./api.js";
import { Check, ChevronDown, LoaderCircle, Pencil, Plus, Search, Trash2, X } from "./icons.js";
import { SegmentedControl } from "./segmented-control.js";

const MODEL_FILTER_OPTIONS = [
  { value: "all", label: "全部" },
  { value: "shown", label: "已显示" },
  { value: "custom", label: "自定义" },
] as const;

export function ProviderModels({ providerId, onEditModels }: { providerId: string; onEditModels?: () => void }) {
  const [settings, setSettings] = useState<ProviderModelSettings>();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "shown" | "custom">("all");
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [deleting, setDeleting] = useState<string>();
  useEffect(() => {
    let active = true;
    setSettings(undefined);
    setEditing(false);
    setAdding(false);
    setDeleting(undefined);
    setQuery("");
    setFilter("all");
    setError(undefined);
    void getProviderModels(providerId).then((loaded) => { if (active) setSettings(loaded); })
      .catch((cause) => { if (active) setError(errorMessage(cause)); });
    return () => { active = false; };
  }, [providerId]);

  async function update(operation: () => Promise<ProviderModelSettings>, optimistic?: ProviderModelSettings): Promise<boolean> {
    const previous = settings;
    if (optimistic) setSettings(optimistic);
    setBusy(true);
    setError(undefined);
    try {
      setSettings(await operation());
      return true;
    } catch (cause) {
      if (optimistic) setSettings(previous);
      setError(errorMessage(cause));
      return false;
    } finally { setBusy(false); }
  }

  const search = query.trim().toLowerCase();
  const models = settings?.models.filter((model) => (
    (editing ? filter === "all" || (filter === "shown" ? model.visible : model.custom) : model.visible)
    && (!search || `${model.name} ${model.id}`.toLowerCase().includes(search))
  )) ?? [];
  const shown = settings?.models.filter((model) => model.visible).length ?? 0;
  function toggleEditing(): void {
    setEditing((value) => !value);
    setError(undefined);
    setAdding(false);
    setDeleting(undefined);
    setQuery("");
    setFilter("all");
  }
  function changeVisibility(ids: string[], visible: boolean): void {
    const selected = new Set(ids);
    void update(() => setProviderModelVisibility(providerId, ids, visible), settings ? {
      ...settings,
      models: settings.models.map((model) => selected.has(model.id) ? { ...model, visible } : model),
    } : undefined);
  }
  return <section className={`settings-detail-section provider-models${editing ? " is-editing" : ""}`} aria-label="语言模型">
    <div className="provider-models-heading">
      <h4>语言模型 <small>{settings ? shown : ""}</small></h4>
      {settings ? <div className="provider-models-heading-actions">
        {(editing || !settings.models.length) && settings.canAddCustomModel ? <button className="settings-secondary-button" type="button" disabled={busy || adding} onClick={onEditModels ?? (() => { setAdding(true); setError(undefined); })} aria-expanded={onEditModels ? undefined : adding}>
          <Plus size={13} /><span>添加模型</span>
        </button> : null}
        <button className="settings-secondary-button" type="button" disabled={busy} onClick={onEditModels ?? toggleEditing} aria-label={editing ? "完成模型编辑" : "编辑模型"} aria-pressed={onEditModels ? undefined : editing}>
          {editing ? <Check size={13} /> : <Pencil size={13} />}<span>{editing ? "完成" : "编辑"}</span>
        </button>
      </div> : null}
    </div>
    {error ? <p className="settings-error" role="alert">{error}</p> : null}
    {adding && settings ? <CustomModelForm key={providerId} settings={settings} busy={busy} onCancel={() => { setAdding(false); setError(undefined); }} onAdd={async (model) => {
      if (await update(() => addCustomProviderModel(providerId, model))) { setAdding(false); setQuery(""); setFilter("all"); }
    }} /> : null}
    {settings ? <>
      <div className="provider-models-controls">
        <label className="settings-provider-search"><Search size={14} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索模型" aria-label="搜索模型" /></label>
        {editing ? <SegmentedControl className="settings-provider-filters" label="筛选模型" options={MODEL_FILTER_OPTIONS} value={filter} onChange={setFilter} /> : null}
      </div>
      {editing ? <div className="provider-models-list-actions">
        <span>已显示 {shown} <i aria-hidden="true">/</i> 共 {settings.models.length} 个</span>
        <button type="button" disabled={busy || !models.some((model) => !model.visible)} onClick={() => changeVisibility(models.map((model) => model.id), true)}>显示全部</button>
        <button type="button" disabled={busy || !models.some((model) => model.visible)} onClick={() => changeVisibility(models.map((model) => model.id), false)}>隐藏全部</button>
      </div> : null}
      <div className="provider-models-list" role="list" aria-label={editing ? "服务商模型" : "已显示的服务商模型"} aria-busy={busy}>
        {models.map((model) => {
          const copy = <span className="provider-model-copy"><strong title={model.name}>{model.name}</strong>{model.name !== model.id ? <small title={model.id}>{model.id}</small> : null}</span>;
          return <div className={`provider-model-row${model.visible ? "" : " is-hidden"}`} key={model.id} role="listitem">
            {editing ? <label>
              <input type="checkbox" checked={model.visible} disabled={busy} onChange={(event) => changeVisibility([model.id], event.target.checked)} aria-label={`显示 ${model.name}`} />
              {copy}
            </label> : <div className="provider-model-readonly">{copy}</div>}
            {model.custom ? <small className="provider-model-custom">自定义</small> : null}
            {editing && model.custom ? deleting === model.id ? <div className="provider-model-delete-confirm">
              <button type="button" className="settings-danger-button" disabled={busy} onClick={() => void update(() => removeCustomProviderModel(providerId, model.id)).then((removed) => { if (removed) setDeleting(undefined); })}>删除</button>
              <button type="button" className="icon-button" title="取消删除" aria-label="取消删除" disabled={busy} onClick={() => setDeleting(undefined)}><X size={13} /></button>
            </div> : <button className="icon-button provider-model-delete" type="button" disabled={busy} title={`删除 ${model.name}`} aria-label={`删除 ${model.name}`} onClick={() => setDeleting(model.id)}><Trash2 size={14} /></button> : null}
          </div>;
        })}
        {!models.length ? <p className="settings-empty">{!settings.models.length ? "没有可用的语言模型。" : !editing && !shown ? "未显示任何模型。" : "没有符合筛选条件的模型。"}</p> : null}
      </div>
    </> : !error ? <div className="settings-loading"><LoaderCircle className="spin" size={16} />正在加载模型</div> : null}
  </section>;
}

function CustomModelForm({ settings, busy, onAdd, onCancel }: { settings: ProviderModelSettings; busy: boolean; onAdd: (model: CustomProviderModel) => Promise<void>; onCancel: () => void }) {
  const fieldId = useId();
  const [advanced, setAdvanced] = useState(!settings.defaultBaseUrl);
  const [model, setModel] = useState<CustomProviderModel>({ id: "", name: "", api: settings.defaultApi, baseUrl: "", contextWindow: 128_000, maxTokens: 16_384, reasoning: false, supportsImages: false });
  const apis = [...new Set([settings.defaultApi, ...CUSTOM_MODEL_APIS])];
  const field = <K extends keyof CustomProviderModel>(key: K, value: CustomProviderModel[K]) => setModel((current) => ({ ...current, [key]: value }));
  function submit(event: FormEvent): void {
    event.preventDefault();
    void onAdd({ ...model, id: model.id.trim(), name: model.name.trim() || model.id.trim() });
  }
  return <form className="provider-model-form" aria-label="添加模型" onSubmit={submit}>
    <label className="settings-detail-field" htmlFor={`${fieldId}-id`}><span className="settings-search-field-label">模型 ID</span><input id={`${fieldId}-id`} className="settings-search-input" value={model.id} onChange={(event) => field("id", event.target.value)} placeholder="模型 ID" maxLength={200} required disabled={busy} autoFocus autoComplete="off" spellCheck={false} /></label>
    {advanced ? <div className="provider-model-form-advanced" id={`${fieldId}-advanced`}>
      <div className="provider-model-form-grid">
        <label className="settings-detail-field" htmlFor={`${fieldId}-name`}><span className="settings-search-field-label">显示名称</span><input id={`${fieldId}-name`} className="settings-search-input" value={model.name} onChange={(event) => field("name", event.target.value)} placeholder={model.id || "显示名称"} maxLength={200} disabled={busy} /></label>
        <label className="settings-detail-field" htmlFor={`${fieldId}-api`}><span className="settings-search-field-label">API</span><select id={`${fieldId}-api`} className="settings-search-input" value={model.api} onChange={(event) => field("api", event.target.value)} disabled={busy}>{apis.map((api) => <option key={api} value={api}>{api}</option>)}</select></label>
        <label className="settings-detail-field provider-model-url-field" htmlFor={`${fieldId}-url`}><span className="settings-search-field-label">API 基础地址</span><input id={`${fieldId}-url`} className="settings-search-input" type="url" value={model.baseUrl} onChange={(event) => field("baseUrl", event.target.value)} placeholder={settings.defaultBaseUrl ?? "https://api.example.com/v1"} required={!settings.defaultBaseUrl} disabled={busy} /></label>
        <label className="settings-detail-field" htmlFor={`${fieldId}-context`}><span className="settings-search-field-label">上下文长度</span><input id={`${fieldId}-context`} className="settings-search-input" type="number" min={1} max={100_000_000} step={1} value={model.contextWindow} onChange={(event) => field("contextWindow", Number(event.target.value))} required disabled={busy} /></label>
        <label className="settings-detail-field" htmlFor={`${fieldId}-tokens`}><span className="settings-search-field-label">最大输出 Token 数</span><input id={`${fieldId}-tokens`} className="settings-search-input" type="number" min={1} max={model.contextWindow} step={1} value={model.maxTokens} onChange={(event) => field("maxTokens", Number(event.target.value))} required disabled={busy} /></label>
      </div>
      <div className="provider-model-capabilities">
        <label><input type="checkbox" checked={model.reasoning} onChange={(event) => field("reasoning", event.target.checked)} disabled={busy} />推理</label>
        <label><input type="checkbox" checked={model.supportsImages} onChange={(event) => field("supportsImages", event.target.checked)} disabled={busy} />图片输入</label>
      </div>
    </div> : null}
    <div className="provider-model-form-footer">
      <button className="provider-model-advanced-toggle" type="button" aria-expanded={advanced} aria-controls={advanced ? `${fieldId}-advanced` : undefined} disabled={busy} onClick={() => setAdvanced((value) => !value)}><ChevronDown size={12} /><span>高级</span></button>
      <div className="provider-model-form-actions">
        <button className="settings-secondary-button" type="button" disabled={busy} onClick={onCancel}>取消</button>
        <button className="settings-primary-button" type="submit" disabled={busy || !model.id.trim()}>{busy ? <LoaderCircle className="spin" size={13} /> : <Plus size={13} />}<span>添加</span></button>
      </div>
    </div>
  </form>;
}

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
