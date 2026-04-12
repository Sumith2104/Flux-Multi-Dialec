
import { NextIntlClientProvider } from 'next-intl';
import HomeClient from './home-client';
import { Metadata } from 'next';
import messagesEn from '../../messages/en.json';
import { getCurrentUserId } from '@/lib/auth';
import { redirect } from 'next/navigation';

export const metadata: Metadata = {
    title: 'Fluxbase - The Intelligent AI Spreadsheet',
    description: 'The intelligent spreadsheet that thinks like a human. Build powerful databases, automate workflows, and collaborate in real-time.',
};

export default async function Home() {
    // If the user already has an active session, take them straight to the app
    const userId = await getCurrentUserId();
    if (userId) {
        redirect('/dashboard/projects');
    }

    // Manually load 'en' locale and messages since we are bypassing middleware routing
    const locale = 'en';
    const messages = messagesEn;

    return (
        <NextIntlClientProvider locale={locale} messages={messages}>
            <HomeClient />
        </NextIntlClientProvider>
    );
}
