
'use client';

import React, { createContext, useState, useEffect, ReactNode } from 'react';
import type { Project } from '@/lib/data';

interface ProjectContextType {
    project: Project | null;
    setProject: (project: Project | null) => void;
    isSuspended: boolean;
    setIsSuspended: (isSuspended: boolean) => void;
    loading: boolean;
}

export const ProjectContext = createContext<ProjectContextType>({
    project: null,
    setProject: () => {},
    isSuspended: false,
    setIsSuspended: () => {},
    loading: true,
});

export const ProjectProvider = ({ children }: { children: ReactNode }) => {
    const [project, setProjectState] = useState<Project | null>(null);
    const [isSuspended, setIsSuspended] = useState(false);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        try {
            const item = window.localStorage.getItem('selectedProject');
            if (item) {
                const parsed = JSON.parse(item);
                setProjectState(parsed);
                // Keep cookies in sync on mount
                import('js-cookie').then(mod => {
                    const Cookies = mod.default;
                    Cookies.set('selectedProject', JSON.stringify(parsed), { path: '/' });
                });
            }
        } catch (error) {
            console.error("Failed to parse project from localStorage", error);
            setProjectState(null);
        } finally {
            setLoading(false);
        }
    }, []);

    const setProject = React.useCallback((project: Project | null) => {
        setProjectState(project);
        try {
            if (project) {
                window.localStorage.setItem('selectedProject', JSON.stringify(project));
                import('js-cookie').then(mod => {
                    const Cookies = mod.default;
                    Cookies.set('selectedProject', JSON.stringify(project), { path: '/' });
                });
            } else {
                window.localStorage.removeItem('selectedProject');
                import('js-cookie').then(mod => {
                    const Cookies = mod.default;
                    Cookies.remove('selectedProject', { path: '/' });
                });
            }
        } catch (error) {
            console.error("Failed to sync selected project to storage/cookies", error);
        }
    }, []);

    return (
        <ProjectContext.Provider value={{ project, setProject, isSuspended, setIsSuspended, loading }}>
            {!loading && children}
        </ProjectContext.Provider>
    );
};
