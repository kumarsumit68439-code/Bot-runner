"use client";

import { useState } from "react";
import Sidebar from "@/components/Sidebar";
import ConsoleTab from "@/components/ConsoleTab";
import FileManagerTab from "@/components/FileManagerTab";
import StartupTab from "@/components/StartupTab";
import { useServerSocket } from "@/hooks/useServerSocket";

export default function Page() {
  const [tab, setTab] = useState("console");
  const server = useServerSocket(); // lives here so the terminal buffer survives tab switches

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <Sidebar tab={tab} onChange={setTab} connection={server.connection} />
      <main className="min-w-0 flex-1 p-4 md:p-8">
        {tab === "console" && <ConsoleTab server={server} />}
        {tab === "files" && <FileManagerTab server={server} />}
        {tab === "startup" && <StartupTab server={server} />}
      </main>
    </div>
  );
}
