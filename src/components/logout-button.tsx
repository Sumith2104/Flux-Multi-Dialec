'use client';

import { Button } from "@/components/ui/button";
import { logoutAction } from "@/app/(app)/actions";
import { useRouter } from "next/navigation";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { LogOut } from "lucide-react";

/**
 * Handles full sign-out:
 * 1. Calls Server Action to clear 'session' cookie
 * 2. Redirects to login
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
        await logoutAction();
        router.push('/');
        router.refresh();
    };

    return (
        <AlertDialog>
            <AlertDialogTrigger asChild>
                <Button
                    className={className}
                    variant={variant}
                    size={size}
                    onClick={(e) => {
                        // Let AlertDialog handle the click event instead of immediate logout
                    }}
                >
                    {children || (
                        <>
                            <LogOut className="mr-2 h-4 w-4" />
                            Logout
                        </>
                    )}
                </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                    <AlertDialogDescription>
                        This will securely sign you out of your current session on this device. You will need to sign in again to access your projects.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleLogout}>Log out</AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}
