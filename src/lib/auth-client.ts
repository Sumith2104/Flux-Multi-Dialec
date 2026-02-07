import { GoogleAuthProvider, GithubAuthProvider, signInWithPopup } from "firebase/auth";
import { auth } from "@/lib/firebase";

export async function handleSignInWithGoogle(toast: any) {
    try {
        const provider = new GoogleAuthProvider();
        provider.setCustomParameters({ prompt: 'select_account' });
        const result = await signInWithPopup(auth, provider);
        const idToken = await result.user.getIdToken();

        const response = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ idToken, type: 'login' }), // Treat social login as login/signup
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to create session');
        }

        return { success: true };

    } catch (error: any) {
        toast({
            variant: 'destructive',
            title: 'Login Failed',
            description: error.message,
        });
        return { success: false, error: error.message };
    }
}

export async function handleSignInWithGitHub(toast: any) {
    try {
        const provider = new GithubAuthProvider();
        const result = await signInWithPopup(auth, provider);
        const idToken = await result.user.getIdToken();

        const response = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ idToken, type: 'login' }),
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to create session');
        }

        return { success: true };

    } catch (error: any) {
        toast({
            variant: 'destructive',
            title: 'Login Failed',
            description: error.message,
        });
        return { success: false, error: error.message };
    }
}
