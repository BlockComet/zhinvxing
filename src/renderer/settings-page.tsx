import { useEffect, useRef, useState, type CSSProperties } from "react";
import { ArrowLeft, Check, ExternalLink, Globe2, InfoCircle, Package, Palette, Plug, Server, UserRound } from "./icons.js";
import { useAuth } from "./auth.js";
import { readSidebarWidth } from "./app-sidebar.js";
import { ModelsSettings, type ModelsView } from "./models-settings.js";
import type { SettingsSection } from "./routes.js";
import { UserAvatar } from "./user-avatar.js";
import { WindowDragRegion } from "./window-drag-region.js";
import type { DesktopUpdateState } from "../shared/desktop-update.js";
import { ConnectionsSettings } from "./connections-settings.js";
import { readAppearance, setAppearance as persistAppearance, type Appearance } from "./appearance.js";
import { WebSearchSettingsPanel } from "./web-search-settings.js";
import { readChatLayout, setChatLayout, type ChatLayout } from "./chat-layout.js";
import { SegmentedControl } from "./segmented-control.js";
import { PluginsSettings } from "./plugins.js";
import type { PluginDetail } from "../shared/plugins.js";

const BILLING_DASHBOARD_URL = "https://account.ohmygame.ai/account/billing";
const CHAT_LAYOUT_OPTIONS: readonly { value: ChatLayout; label: string }[] = [
  { value: "left", label: "左侧" },
  { value: "right", label: "右侧" },
];

const SETTINGS_SECTIONS: Array<{ section: SettingsSection; label: string; icon: typeof UserRound }> = [
  { section: "providers", label: "服务商与模型", icon: Server },
  { section: "account", label: "账号", icon: UserRound },
  { section: "appearance", label: "外观", icon: Palette },
  { section: "web-search", label: "网络搜索", icon: Globe2 },
  { section: "plugins", label: "插件", icon: Package },
  { section: "connections", label: "连接", icon: Plug },
  { section: "about", label: "关于", icon: InfoCircle },
];

export function SettingsPage({ section, pluginId, onBack, onSectionChange, onPluginChange, onAddPlugin, onTryPlugin }: {
  section: SettingsSection;
  pluginId?: string;
  onBack: () => void;
  onSectionChange: (section: SettingsSection) => void;
  onPluginChange: (pluginId?: string) => void;
  onAddPlugin: () => Promise<void>;
  onTryPlugin: (plugin: PluginDetail, prompt: string, projectId?: string) => Promise<void>;
}) {
  const [modelsView, setModelsView] = useState<ModelsView>({ page: "providers" });
  const navigation = useRef<HTMLElement>(null);
  const sidebarStyle = { "--sidebar-width": `${readSidebarWidth()}px` } as CSSProperties;

  useEffect(() => {
    if (window.matchMedia("(max-width: 720px)").matches) {
      navigation.current?.querySelector('[aria-current="page"]')?.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
  }, [section]);

  function chooseSection(next: SettingsSection): void {
    if (next === "providers") setModelsView({ page: "providers" });
    onSectionChange(next);
  }

  return (
    <main className="home-shell settings-page-shell" style={sidebarStyle}>
      <aside className="home-sidebar settings-page-sidebar">
        <div className="home-sidebar-header-spacer" aria-hidden="true" />
        <button className="settings-page-back" type="button" onClick={onBack}>
          <ArrowLeft size={17} />
          <span>返回应用</span>
        </button>
        <nav className="settings-page-nav" aria-label="设置分类" ref={navigation}>
          <div className="home-nav-label">设置</div>
          {SETTINGS_SECTIONS.map((item) => {
            const Icon = item.icon;
            const active = section === item.section;
            return (
              <button className={`settings-page-nav-item${active ? " is-active" : ""}`} type="button" aria-current={active ? "page" : undefined} onClick={() => chooseSection(item.section)} key={item.section}>
                <Icon size={17} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      </aside>
      <section className="settings-page-content">
        <WindowDragRegion />
        <div className={`settings-page-inner${section === "plugins" ? " settings-page-inner-plugins" : ""}`}>
          {section === "account" ? <AccountSettings /> : null}
          {section === "billing" ? <BillingSettings /> : null}
          {section === "appearance" ? <AppearanceSettings /> : null}
          {section === "providers" ? <ModelsSettings view={modelsView} onViewChange={setModelsView} /> : null}
          {section === "web-search" ? <WebSearchSettingsPanel /> : null}
          {section === "plugins" ? <PluginsSettings pluginId={pluginId} onPluginChange={onPluginChange} onAddPlugin={onAddPlugin} onTryPlugin={onTryPlugin} /> : null}
          {section === "connections" ? <ConnectionsSettings /> : null}
          {section === "about" ? <AboutSettings /> : null}
        </div>
      </section>
    </main>
  );
}

async function openBillingDashboard(): Promise<void> {
  if (window.ohMyGameDesktop?.openExternal) {
    await window.ohMyGameDesktop.openExternal(BILLING_DASHBOARD_URL);
  } else {
    window.open(BILLING_DASHBOARD_URL, "_blank", "noopener,noreferrer");
  }
}

function BillingSettings() {
  return (
    <section className="settings-panel settings-overview-panel settings-billing-panel">
      <header className="settings-panel-header"><h3>账单</h3></header>
      <p>在网页中管理 OhMyGame Cloud 套餐、用量和支付信息。</p>
      <button className="settings-primary-button" type="button" onClick={() => void openBillingDashboard()}>
        <span>打开账单管理</span>
        <ExternalLink size={14} aria-hidden="true" />
      </button>
    </section>
  );
}

function AppearanceSettings() {
  const [appearance, setAppearance] = useState<Appearance>(readAppearance);
  const [chatLayout, updateChatLayout] = useState<ChatLayout>(readChatLayout);

  function chooseAppearance(next: Appearance): void {
    setAppearance(next);
    persistAppearance(next);
  }

  function chooseChatLayout(next: ChatLayout): void {
    updateChatLayout(next);
    setChatLayout(next);
  }

  return (
    <section className="settings-panel settings-overview-panel settings-appearance-panel">
      <header className="settings-panel-header"><h3>外观</h3></header>
      <div className="settings-appearance-group">
        <h4 className="settings-section-heading">主题</h4>
        <fieldset className="settings-theme-options" aria-label="主题">
          <ThemeOption appearance="system" selected={appearance === "system"} onSelect={chooseAppearance} />
          <ThemeOption appearance="light" selected={appearance === "light"} onSelect={chooseAppearance} />
          <ThemeOption appearance="dark" selected={appearance === "dark"} onSelect={chooseAppearance} />
        </fieldset>
      </div>
      <div className="settings-appearance-group">
        <h4 className="settings-section-heading">工作区</h4>
        <div className="settings-chat-layout-row">
          <span className="settings-chat-layout-label">聊天面板位置</span>
          <SegmentedControl className="settings-chat-layout-control" label="聊天面板位置" options={CHAT_LAYOUT_OPTIONS} value={chatLayout} onChange={chooseChatLayout} />
        </div>
      </div>
    </section>
  );
}

function ThemeOption({ appearance, selected, onSelect }: {
  appearance: Appearance;
  selected: boolean;
  onSelect: (appearance: Appearance) => void;
}) {
  const label = appearance === "system" ? "跟随系统" : appearance === "light" ? "浅色" : "深色";
  return (
    <button
      className={`settings-theme-option is-${appearance}${selected ? " is-selected" : ""}`}
      type="button"
      aria-pressed={selected}
      onClick={() => onSelect(appearance)}
    >
      <ThemePreview appearance={appearance} />
      <span className="settings-theme-option-label">
        <span>{label}</span>
        {selected ? <Check size={16} aria-hidden="true" /> : null}
      </span>
    </button>
  );
}

function ThemePreview({ appearance }: { appearance: Appearance }) {
  if (appearance === "system") {
    return <span className="settings-theme-preview is-system" aria-hidden="true">
      <span className="settings-theme-system-layer">
        <span className="settings-theme-preview-sidebar" />
        <ThemePreviewContent />
      </span>
      <span className="settings-theme-system-layer is-dark">
        <span className="settings-theme-preview-sidebar" />
        <ThemePreviewContent />
      </span>
    </span>;
  }
  return <span className="settings-theme-preview" aria-hidden="true">
    <span className="settings-theme-preview-sidebar" />
    <ThemePreviewContent />
  </span>;
}

function ThemePreviewContent() {
  return <span className="settings-theme-preview-content">
    <i />
    <i />
    <i />
  </span>;
}

function AccountSettings() {
  const auth = useAuth();
  const [error, setError] = useState<string>();
  return (
    <section className="settings-panel settings-overview-panel settings-account-panel">
      <header className="settings-panel-header"><h3>账号</h3></header>
      {auth.state.status === "signed-in" ? (
        <div className="settings-account-row">
          <div className="settings-account-profile">
            <UserAvatar className="settings-account-avatar" name={auth.state.user.name} avatarUrl={auth.state.user.avatarUrl} />
            <span className="settings-account-copy">
              <small>当前登录账号</small>
              <strong>{auth.state.user.name}</strong>
              {auth.state.user.email ? <span>{auth.state.user.email}</span> : null}
            </span>
          </div>
          <button className="settings-danger-button" type="button" onClick={() => void auth.signOut().catch((cause) => setError(errorMessage(cause)))}>退出登录</button>
        </div>
      ) : (
        <button className="settings-primary-button" type="button" onClick={auth.openSignIn}>登录</button>
      )}
      {error ? <p className="settings-error" role="alert">{error}</p> : null}
    </section>
  );
}

function AboutSettings() {
  const localChineseBuild = __APP_VERSION__.includes("-zh.");
  const [update, setUpdate] = useState<DesktopUpdateState | null>(null);
  const updates = window.ohMyGameDesktop?.updates;
  useEffect(() => {
    if (!updates) return;
    let disposed = false;
    void updates.state().then((state) => { if (!disposed) setUpdate(state); }).catch(() => undefined);
    const unsubscribe = updates.onState(setUpdate);
    return () => { disposed = true; unsubscribe(); };
  }, [updates]);
  const status = update?.status;
  const message = status?.type === "up-to-date" ? "已是最新版本"
    : status?.type === "checking" ? "正在检查更新…"
      : status?.type === "available" ? `有可用更新：${status.version}`
        : status?.type === "downloading" ? `正在下载更新（${status.percent}%)`
          : status?.type === "ready" ? `重启后更新至：${status.version}`
            : status?.type === "error" ? status.message : "尚未检查";
  const busy = status?.type === "checking" || status?.type === "downloading";
  return (
    <section className="settings-panel settings-overview-panel">
      <header className="settings-panel-header"><h3>织女星</h3></header>
      <p className="settings-about-status">AI 游戏工作室 · 基于 OhMyGame 开源项目开发</p>
      <div className="settings-about-list">
        <div className="settings-about-row">
          <span>版本</span>
          <strong>{update?.currentVersion ?? __APP_VERSION__}</strong>
        </div>
        <div className="settings-about-row">
          <span>更新</span>
          <div className="settings-about-update">
            <span className="settings-about-status">{localChineseBuild ? "织女星本地版本。通过新版安装包升级。" : message}</span>
            {updates && !localChineseBuild ? (
              <div className="settings-about-actions">
                {status?.type === "available" ? <button className="settings-primary-button" type="button" onClick={() => void updates.download()}>下载更新</button> : null}
                {status?.type === "ready" ? <button className="settings-primary-button" type="button" onClick={() => void updates.install()}>重启并更新</button> : null}
                <button className="settings-secondary-button" type="button" disabled={busy} onClick={() => void updates.check()}>
                  {status?.type === "error" ? "再次检查" : "检查更新"}
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
