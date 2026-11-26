import Header from "@/components/layout/Header";
import ReportingDashboard from "@/components/reporting/ReportingDashboard";

export default function ReportingPage() {
  return (
    <div className="min-h-screen bg-[#F5F7FA]">

      <main className="max-w-7xl mx-auto px-6 py-8">
        <ReportingDashboard />
      </main>
    </div>
  );
}
