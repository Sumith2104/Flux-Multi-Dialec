"use client";

import { cn } from "@/lib/utils";

interface PasswordStrengthProps {
    password: string;
}

export function PasswordStrength({ password }: PasswordStrengthProps) {
    const getStrength = (pass: string) => {
        let score = 0;
        if (!pass) return 0;
        if (pass.length > 5) score += 1;
        if (pass.length > 9) score += 1;
        if (/[A-Z]/.test(pass)) score += 1;
        if (/[0-9]/.test(pass)) score += 1;
        if (/[^A-Za-z0-9]/.test(pass)) score += 1;
        return score;
    };

    const score = getStrength(password);

    return (
        <div className="flex gap-1 h-1 mt-2">
            {[1, 2, 3, 4, 5].map((level) => (
                <div
                    key={level}
                    className={cn(
                        "h-full flex-1 rounded-full transition-all duration-300",
                        score >= level
                            ? score <= 2
                                ? "bg-red-500"
                                : score <= 4
                                    ? "bg-yellow-500"
                                    : "bg-green-500"
                            : "bg-white/10"
                    )}
                />
            ))}
        </div>
    );
}
