
'use client';

import React, { createContext, useState, useEffect, ReactNode } from 'react';
import type { Project } from '@/lib/data';

interface ProjectContextType {
    project: Project | null;
    setProject: (project: Project | null) => void;
    loading: boolean;
}

export const ProjectContext = createContext<ProjectContextType>({
    project: null,
    setProject: () => {},
    loading: true,
});

export const ProjectProvider = ({ children }: { children: ReactNode }) => {
    const [project, setProjectState] = useState<Project | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        try {
            const item = window.localStorage.getItem('selectedProject');
            if (item) {
                setProjectState(JSON.parse(item));
            }
        } catch (error) {
            console.error("Failed to parse project from localStorage", error);
            setProjectState(null);
        } finally {
            setLoading(false);
        }
    }, []);

    const setProject = (project: Project | null) => {
        setProjectState(project);
        try {
            if (project) {
                window.localStorage.setItem('selectedProject', JSON.stringify(project));
            } else {
                window.localStorage.removeItem('selectedProject');
            }
        } catch (error) {
            console.error("Failed to save project to localStorage", error);
        }
    };

    return (
        <ProjectContext.Provider value={{ project, setProject, loading }}>
            {!loading && children}
        </ProjectContext.Provider>
    );
};
