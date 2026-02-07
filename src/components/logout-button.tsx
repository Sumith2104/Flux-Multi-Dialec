'use client';

import { Button } from "@/components/ui/button";
import { auth } from "@/lib/firebase";
import { signOut } from "firebase/auth";
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
        try {
            // 1. Client-side sign out (Crucial for "Switch Account")
            await signOut(auth);

            // 2. Server-side cookie clear
            await logoutAction();

            // 3. Force redirect
            router.push('/');
        } catch (error) {
            console.error("Logout failed:", error);
            // Fallback: try server logout anyway
            await logoutAction();
        }
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
