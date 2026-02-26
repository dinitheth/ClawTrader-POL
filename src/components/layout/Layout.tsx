import { ReactNode } from "react";
import Header from "./Header";
import Footer from "./Footer";
import { AlertTriangle } from "lucide-react";
import { useAutoSwitchNetwork } from "@/hooks/useAutoSwitchNetwork";

interface LayoutProps {
  children: ReactNode;
}

const Layout = ({ children }: LayoutProps) => {
  useAutoSwitchNetwork();
  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Testnet Notice Banner */}
      <div className="fixed top-0 left-0 right-0 z-[60] bg-amber-500/90 backdrop-blur-sm text-black text-center text-xs font-medium py-1 px-4 flex items-center justify-center gap-1.5">
        <AlertTriangle className="w-3 h-3 flex-shrink-0" />
        <span>Testnet Only — All tokens (USDC, CLAW, tBTC, tETH, tSOL) are testnet tokens with no real value.</span>
      </div>
      <Header />
      <main className="pt-20 md:pt-22 pb-8 flex-1">
        {children}
      </main>
      <Footer />
    </div>
  );
};

export default Layout;
