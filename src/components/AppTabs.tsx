"use client";

export type AppTab = "plan" | "map" | "itinerary" | "rank" | "budget";

const TABS: { id: AppTab; label: string; icon: string }[] = [
  { id: "plan", label: "规划", icon: "📝" },
  { id: "map", label: "地图", icon: "🗺️" },
  { id: "itinerary", label: "行程", icon: "📅" },
  { id: "rank", label: "榜单", icon: "🏆" },
  { id: "budget", label: "预算", icon: "💰" },
];

interface AppTabsProps {
  active: AppTab;
  onChange: (tab: AppTab) => void;
  disabled?: Partial<Record<AppTab, boolean>>;
  variant: "desktop" | "mobile";
}

export default function AppTabs({ active, onChange, disabled, variant }: AppTabsProps) {
  if (variant === "desktop") {
    return (
      <nav className="app-tab-bar-desktop hidden sm:flex" aria-label="主导航">
        {TABS.map((tab) => {
          const isDisabled = disabled?.[tab.id];
          return (
            <button
              key={tab.id}
              type="button"
              disabled={isDisabled}
              onClick={() => onChange(tab.id)}
              className={`app-tab-btn ${active === tab.id ? "active" : ""}`}
            >
              <span className="app-tab-icon">{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          );
        })}
      </nav>
    );
  }

  return (
    <nav className="mobile-nav-bar sm:hidden" aria-label="主导航">
      {TABS.map((tab) => {
        const isDisabled = disabled?.[tab.id];
        return (
          <button
            key={tab.id}
            type="button"
            disabled={isDisabled}
            onClick={() => onChange(tab.id)}
            className={`mobile-nav-btn ${active === tab.id ? "active" : ""}`}
          >
            <span className="mobile-nav-icon">{tab.icon}</span>
            <span>{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
