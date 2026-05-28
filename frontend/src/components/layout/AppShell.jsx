import Sidebar from "./Sidebar";
import Header from "./Header";

export default function AppShell({ children }) {
  return (
    <div className="min-h-screen flex">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Header />
        <main className="flex-1 px-4 lg:px-8 py-6 max-w-7xl w-full mx-auto fade-up">
          {children}
        </main>
      </div>
    </div>
  );
}
