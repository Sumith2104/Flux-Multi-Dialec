import Link from "next/link";
import { motion } from 'framer-motion';
import { Database } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from "@/components/ui/button";
import { AuthModal } from "@/components/auth-modal";

export function LandingNavbar() {
    const t = useTranslations('Auth');

    return (
        <motion.nav
            initial={{ y: -100 }}
            animate={{ y: 0 }}
            className="fixed top-0 left-0 right-0 z-50 flex items-center justify-center pt-6 px-4 pointer-events-none"
        >
            <div className="flex items-center gap-2 p-2 rounded-full border border-white/10 bg-black/50 backdrop-blur-md shadow-2xl pointer-events-auto">
                {/* Logo */}
                <Link href="/" className="flex items-center gap-2 px-4 transition-opacity hover:opacity-80">
                    <Database className="h-6 w-6 text-orange-500" />
                    <span className="font-bold text-lg tracking-tight text-white/90">Fluxbase</span>
                </Link>

                <div className="h-6 w-[1px] bg-white/10 mx-2" />

                <div className="flex items-center gap-1">
                    <AuthModal defaultTab="login">
                        <Button variant="ghost" size="sm" className="rounded-full text-zinc-400 hover:text-white hover:bg-white/10 transition-colors">
                            {t('login')}
                        </Button>
                    </AuthModal>
                    <AuthModal defaultTab="signup">
                        <Button size="sm" className="rounded-full bg-orange-600 hover:bg-orange-700 text-white border-0 transition-colors">
                            {t('signup')}
                        </Button>
                    </AuthModal>
                </div>
            </div>
        </motion.nav>
    );
}
