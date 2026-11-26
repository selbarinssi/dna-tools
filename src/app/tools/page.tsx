import Header from "@/components/layout/Header";
import ToolsManager from "@/components/tools/ToolsManager";

export default function ToolsPage() {
  return (
    <div className="min-h-screen bg-[#F7F8FA]">
      <main className="max-w-7xl mx-auto px-6 py-8">
        <ToolsManager />
      </main>
    </div>
  );
}
