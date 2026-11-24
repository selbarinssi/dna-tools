import Header from "@/components/layout/Header";
import CoworkersManager from "@/components/coworkers/CoworkersManager";

export default function CoworkersPage() {
  return (
    <div className="min-h-screen bg-[#F5F7FA]">
      <Header />

      <main className="max-w-7xl mx-auto px-6 py-8">
        <CoworkersManager />
      </main>
    </div>
  );
}
