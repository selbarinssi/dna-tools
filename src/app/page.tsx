import Header from "@/components/layout/Header";
import RequestsList from "@/components/requests/RequestsList";

export default function HomePage() {
  return (
    <div className="min-h-screen bg-[#F5F7FA]">

      <main className="max-w-7xl mx-auto px-6 py-8">
        <RequestsList />
      </main>
    </div>
  );
}
