import Header from "@/components/layout/Header";

export default function HomePage() {
  return (
    <div className="min-h-screen bg-[#F5F7FA]">
      <Header />

      <main className="max-w-7xl mx-auto px-6 py-10">
        <div className="bg-white rounded-lg border border-[#E2E8F0] shadow-sm p-8">
          <h1 className="text-2xl font-semibold text-[#1A202C] mb-2">
            Welcome to D&A Tools
          </h1>
          <p className="text-[#4A5568]">
            The tool request system is under construction.
          </p>
        </div>
      </main>
    </div>
  );
}
