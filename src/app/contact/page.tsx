import * as React from 'react';
import Link from 'next/link';
import Navbar from '@/components/layout/navbar';

export default function ContactPage() {
    return (
        <div className="flex flex-col min-h-screen bg-background text-foreground overflow-x-hidden pt-12 pb-24">
            <main className="max-w-3xl mx-auto w-full px-6 space-y-12">
                <Link href="/" className="text-sm text-muted-foreground hover:text-primary transition-colors">
                    &larr; Back to Home
                </Link>

                <div className="space-y-4">
                    <h1 className="text-4xl font-bold tracking-tight">Contact Us</h1>
                    <p className="text-lg text-muted-foreground">
                        Have questions about Fluxbase? We would love to hear from you.
                    </p>
                </div>

                <section className="space-y-6">
                    <div className="bg-card border rounded-xl p-8 space-y-4 shadow-sm">
                        <h2 className="text-2xl font-semibold">Get in Touch</h2>
                        <p className="text-muted-foreground">
                            For any support requests, feature ideas, or enterprise inquiries, feel free to reach out directly to the creator!
                        </p>
                        <div className="pt-4 space-y-4">
                            <div>
                                <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Creator</p>
                                <p className="text-lg">Sumith</p>
                            </div>
                            <div>
                                <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Direct Email</p>
                                <a href="mailto:sumithsumith4567890@gmail.com" className="text-lg text-primary hover:underline">
                                    sumithsumith4567890@gmail.com
                                </a>
                            </div>
                        </div>
                    </div>
                </section>
            </main>
        </div>
    );
}
