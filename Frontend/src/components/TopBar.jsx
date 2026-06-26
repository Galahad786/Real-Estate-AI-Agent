export default function TopBar({ title, sidebarOpen, onToggleSidebar }) {
  return (
    <header className="topbar">
      <button
        className="topbar-sidebar-toggle"
        type="button"
        aria-label={sidebarOpen ? "Close sidebar" : "Open sidebar"}
        aria-pressed={sidebarOpen}
        onClick={onToggleSidebar}
      >
        ☰
      </button>
      <div className="topbar-title">{title}</div>
    </header>
  );
}
