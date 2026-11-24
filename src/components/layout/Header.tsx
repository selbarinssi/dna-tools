export default function Header() {
  return (
    <header className="bg-[#0058A3] text-white shadow-sm">
      <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="font-bold text-lg tracking-tight">D&A Tools</span>
        </div>
        <div className="text-sm opacity-90">
          Tool Request System
        </div>
      </div>
    </header>
  );
}
