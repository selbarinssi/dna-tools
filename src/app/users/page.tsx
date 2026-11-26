import Header from "@/components/layout/Header";
import UsersManager from "@/components/users/UsersManager";

export default function UsersPage() {
  return (
    <div className="min-h-screen bg-[#F5F7FA]">

      <main className="max-w-7xl mx-auto px-6 py-8">
        <UsersManager />
      </main>
    </div>
  );
}
