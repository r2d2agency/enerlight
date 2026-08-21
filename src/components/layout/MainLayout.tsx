import { ReactNode } from "react";
import { Sidebar, SIDEBAR_COLLAPSED_WIDTH } from "./Sidebar";
import { TopBar } from "./TopBar";
import { MessageNotifications } from "./MessageNotifications";
import { CRMAlerts } from "./CRMAlerts";
import { ConnectionStatusIndicator } from "./ConnectionStatusIndicator";
import { GroupSecretaryPopup } from "./GroupSecretaryPopup";
import { DailyFollowupGate } from "@/components/crm/DailyFollowupGate";


interface MainLayoutProps {
  children: ReactNode;
}

export function MainLayout({ children }: MainLayoutProps) {
  return (
    <div className="flex h-screen bg-background overflow-hidden relative">
      <Sidebar />
      <TopBar />
      
      {/* Mobile TopBar with notifications */}
      <div className="lg:hidden fixed top-0 right-0 left-12 h-14 flex items-center justify-end gap-2 px-3 bg-background/95 backdrop-blur-sm border-b border-border/50 z-50">
        <ConnectionStatusIndicator />
        <div className="h-5 w-px bg-border" />
        <MessageNotifications />
        <CRMAlerts />
      </div>
      
      {/* Desktop: margin-left for collapsed sidebar + top bar, Mobile: no margin */}
      {/* Use calc to ensure content fits exactly within available space */}
      <main className="flex-1 flex flex-col min-w-0 pt-14 lg:pt-0 overflow-hidden relative">
        <div className="flex-1 overflow-y-auto p-2 lg:p-4 xl:p-6 custom-scrollbar">
          <div className="max-w-[1600px] mx-auto w-full">
            {children}
          </div>
        </div>
      </main>
      <GroupSecretaryPopup />
      <DailyFollowupGate />
    </div>
  );
}
