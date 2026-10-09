import { useEffect, useState } from "react";
import type {
  UpdateWebSearchSettings,
  WebSearchProvider,
  WebSearchSettings,
} from "../shared/web-search.js";
import { getWebSearchSettings, updateWebSearchSettings } from "./api.js";

interface FormState {
  enabled: boolean;
  provider: WebSearchProvider;
  fallback: boolean;
  exaApiKey: string;
  parallelApiKey: string;
  clearExaApiKey: boolean;
  clearParallelApiKey: boolean;
  customName: string;
  customEndpoint: string;
  customToolName: string;
  customApiKey: string;
  clearCustomApiKey: boolean;
}

export function WebSearchSettingsPanel() {
  const [settings, setSettings] = useState<WebSearchSettings>();
  const [form, setForm] = useState<FormState>();
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let disposed = false;
    void getWebSearchSettings()
      .then((next) => {
        if (disposed) return;
        setSettings(next);
        setForm(formFromSettings(next));
      })
      .catch((cause) => {
        if (!disposed) setError(errorMessage(cause));
      });
    return () => {
      disposed = true;
    };
  }, []);

  async function save() {
    if (!form || saving) return;
    setSaving(true);
    setError(undefined);
    setSaved(false);
    try {
      const next = await updateWebSearchSettings(updateFromForm(form));
      setSettings(next);
      setForm(formFromSettings(next));
      setSaved(true);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setSaving(false);
    }
  }

  if (!form || !settings) {
    return (
      <section className="settings-panel settings-overview-panel">
        <p className={error ? "settings-error" : "settings-loading"}>
          {error ?? "正在加载网络搜索设置…"}
        </p>
      </section>
    );
  }

  function update(patch: Partial<FormState>) {
    setSaved(false);
    setForm((current) => (current ? { ...current, ...patch } : current));
  }

  return (
    <form
      className="settings-panel settings-overview-panel settings-web-search-panel"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <header className="settings-panel-header">
        <h3>网络搜索</h3>
      </header>
      <div className="settings-search-row">
        <strong>网络搜索</strong>
        <label className="settings-toggle">
          <input
            type="checkbox"
            checked={form.enabled}
            onChange={(event) => update({ enabled: event.target.checked })}
          />
          <span />
        </label>
      </div>

      <section className="settings-search-section">
        <div className="settings-search-section-header">
          <h4>服务商</h4>
          <p>选择执行网络搜索的服务。</p>
        </div>
        <div
          className="settings-provider-options"
          role="radiogroup"
          aria-label="网络搜索服务商"
        >
          {(
            [
              ["auto", "自动", "自动选择 Exa 或 Parallel"],
              ["exa", "Exa", "始终使用 Exa"],
              ["parallel", "Parallel", "始终使用 Parallel"],
              ["custom", "自定义 MCP", "使用兼容的 MCP 服务器"],
            ] as const
          ).map(([value, label, description]) => (
            <label className="settings-provider-option" key={value}>
              <input
                type="radio"
                name="web-search-provider"
                value={value}
                checked={form.provider === value}
                disabled={!form.enabled}
                onChange={() => update({ provider: value })}
              />
              <span className="settings-provider-option-label">{label}</span>
              <span className="settings-provider-option-description">
                {description}
              </span>
            </label>
          ))}
        </div>
        <div className="settings-search-option-row">
          <span>
            <strong>使用备用服务商</strong>
            <small>
              自动搜索失败时，使用另一个公共服务商重试。
            </small>
          </span>
          <label className="settings-toggle">
            <input
              type="checkbox"
              checked={form.fallback}
              disabled={!form.enabled || form.provider !== "auto"}
              onChange={(event) => update({ fallback: event.target.checked })}
            />
            <span />
          </label>
        </div>
      </section>

      <section className="settings-search-section">
        <div className="settings-search-section-header">
          <h4>API 密钥</h4>
          <p>添加所使用的公共服务商凭据。</p>
        </div>
        <div className="settings-search-credentials">
          <SearchCredential
            label="Exa API 密钥"
            configured={settings.exaApiKeyConfigured}
            value={form.exaApiKey}
            clear={form.clearExaApiKey}
            disabled={!form.enabled}
            onChange={(exaApiKey) =>
              update({ exaApiKey, clearExaApiKey: false })
            }
            onClear={(clearExaApiKey) =>
              update({ clearExaApiKey, exaApiKey: "" })
            }
          />
          <SearchCredential
            label="Parallel API 密钥"
            configured={settings.parallelApiKeyConfigured}
            value={form.parallelApiKey}
            clear={form.clearParallelApiKey}
            disabled={!form.enabled}
            onChange={(parallelApiKey) =>
              update({ parallelApiKey, clearParallelApiKey: false })
            }
            onClear={(clearParallelApiKey) =>
              update({ clearParallelApiKey, parallelApiKey: "" })
            }
          />
        </div>
      </section>

      {form.provider === "custom" ? (
        <section className="settings-search-section settings-custom-search-section">
          <div className="settings-search-section-header">
            <h4>自定义 MCP</h4>
            <p>连接兼容的服务器进行网络搜索。</p>
          </div>
          <div className="settings-search-fields">
            <label>
              <span className="settings-search-field-label">名称</span>
              <input
                className="settings-search-input"
                value={form.customName}
                disabled={!form.enabled}
                onChange={(event) => update({ customName: event.target.value })}
              />
            </label>
            <label>
              <span className="settings-search-field-label">接口地址</span>
              <input
                className="settings-search-input"
                type="url"
                value={form.customEndpoint}
                disabled={!form.enabled}
                placeholder="https://search.example.com/mcp"
                onChange={(event) =>
                  update({ customEndpoint: event.target.value })
                }
              />
            </label>
            <label>
              <span className="settings-search-field-label">工具名称</span>
              <input
                className="settings-search-input"
                value={form.customToolName}
                disabled={!form.enabled}
                placeholder="web_search"
                onChange={(event) =>
                  update({ customToolName: event.target.value })
                }
              />
            </label>
            <SearchCredential
              label="Bearer 令牌"
              configured={settings.custom?.apiKeyConfigured ?? false}
              value={form.customApiKey}
              clear={form.clearCustomApiKey}
              disabled={!form.enabled}
              onChange={(customApiKey) =>
                update({ customApiKey, clearCustomApiKey: false })
              }
              onClear={(clearCustomApiKey) =>
                update({ clearCustomApiKey, customApiKey: "" })
              }
            />
          </div>
        </section>
      ) : null}

      {error ? (
        <p className="settings-error" role="alert">
          {error}
        </p>
      ) : null}
      {saved ? (
        <p className="settings-success">网络搜索设置已保存。</p>
      ) : null}
      <div className="settings-form-actions">
        <button
          className="settings-primary-button"
          type="submit"
          disabled={saving}
        >
          {saving ? "正在保存…" : "保存"}
        </button>
      </div>
    </form>
  );
}

function SearchCredential({
  label,
  configured,
  value,
  clear,
  disabled,
  onChange,
  onClear,
}: {
  label: string;
  configured: boolean;
  value: string;
  clear: boolean;
  disabled: boolean;
  onChange: (value: string) => void;
  onClear: (value: boolean) => void;
}) {
  return (
    <div className="settings-search-credential">
      <label>
        <span className="settings-search-field-label">
          <span>{label}</span>
          {configured && !clear ? (
            <span className="settings-search-field-status">已保存</span>
          ) : null}
        </span>
        <input
          className="settings-search-input"
          type="password"
          autoComplete="off"
          value={value}
          disabled={disabled || clear}
          placeholder={
            configured && !clear
              ? "已保存，输入新值即可替换"
              : "可选"
          }
          onChange={(event) => onChange(event.target.value)}
        />
      </label>
      {configured ? (
        <label className="settings-checkbox-row">
          <input
            type="checkbox"
            checked={clear}
            disabled={disabled}
            onChange={(event) => onClear(event.target.checked)}
          />
          <span>移除已保存的密钥</span>
        </label>
      ) : null}
    </div>
  );
}

function formFromSettings(settings: WebSearchSettings): FormState {
  return {
    enabled: settings.enabled,
    provider: settings.provider,
    fallback: settings.fallback,
    exaApiKey: "",
    parallelApiKey: "",
    clearExaApiKey: false,
    clearParallelApiKey: false,
    customName: settings.custom?.name ?? "",
    customEndpoint: settings.custom?.endpoint ?? "",
    customToolName: settings.custom?.toolName ?? "web_search",
    customApiKey: "",
    clearCustomApiKey: false,
  };
}

function updateFromForm(form: FormState): UpdateWebSearchSettings {
  const secret = (value: string, clear: boolean): string | null | undefined =>
    clear ? null : value.trim() || undefined;
  return {
    enabled: form.enabled,
    provider: form.provider,
    fallback: form.fallback,
    exaApiKey: secret(form.exaApiKey, form.clearExaApiKey),
    parallelApiKey: secret(form.parallelApiKey, form.clearParallelApiKey),
    ...(form.provider === "custom"
      ? {
          custom: {
            name: form.customName,
            endpoint: form.customEndpoint,
            toolName: form.customToolName,
            apiKey: secret(form.customApiKey, form.clearCustomApiKey),
          },
        }
      : {}),
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
