'use client';

import { Button } from "@/components/ui/button";
import { logoutAction } from "@/app/(app)/actions";
import { useRouter } from "next/navigation";
import { HTMLAttributes } from "react";

/**
 * Handles full sign-out:
 * 1. Signs out of Firebase Client SDK (clears IndexedDB/localStorage)
 * 2. Calls Server Action to clear 'session' cookie
 * 3. Redirects to login
 */
export function LogoutButton({ className, variant = 'outline', size = 'sm', children }: {
    className?: string,
    variant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link",
    size?: "default" | "sm" | "lg" | "icon",
    children?: React.ReactNode
}) {
    const router = useRouter();

    const handleLogout = async () => {
        // We only need to clear the Server-side cookie.
        // Google OAuth and Native JWT do not maintain complex client-side states.
        await logoutAction();
        router.push('/');
        router.refresh();
    };

    return (
        <Button
            className={className}
            variant={variant}
            size={size}
            onClick={handleLogout}
        >
            {children || 'Logout'}
        </Button>
    );
}
