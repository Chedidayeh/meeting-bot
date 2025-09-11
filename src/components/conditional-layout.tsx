'use client'

import { SidebarProvider } from "@/components/ui/sidebar";
import { usePathname } from "next/navigation";
import { AppSidebar } from "./app-sidebar";
import { useSession } from "next-auth/react";

export function ConditionalLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname()
    const {status} = useSession()
    const isSignedIn = status === "authenticated"
    const showSidebar = pathname !== "/" && !(pathname.startsWith("/meeting/") && !isSignedIn)

    if (!showSidebar) {
        return <div className="min-h-screen">{children}</div>
    }

    return (
        <SidebarProvider defaultOpen={true}>
            <div className="flex h-screen w-full">
                <AppSidebar />
                <main className="flex-1 overflow-auto">
                    {children}
                </main>
            </div>
        </SidebarProvider>
    )
}