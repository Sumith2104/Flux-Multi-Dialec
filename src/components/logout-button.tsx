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
        // 1. Client-side sign out (Crucial for "Switch Account")
        await signOut(auth);

        // 2. Server-side cookie clear & redirect
        // Next.js redirect() throws a NEXT_REDIRECT error under the hood.
        // We MUST NOT wrap this in a generic try/catch block, or else 
        // the client absorbs the redirect signal and crashes the app instead.
        await logoutAction();
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
