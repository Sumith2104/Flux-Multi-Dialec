
'use client';

import Cookies from 'js-cookie';
import type { Project } from '@/lib/data';
import { selectProjectAction } from '@/app/actions';

const COOKIE_NAME = 'selectedProject';

export function useSelectedProject() {
  const setSelectedProject = (project: Project | null) => {
    const formData = new FormData();
    if (project) {
        formData.append('project', JSON.stringify(project));
    } else {
        formData.append('project', '');
    }
    selectProjectAction(formData);
  };

  const getSelectedProject = (): Project | null => {
    const cookie = Cookies.get(COOKIE_NAME);
    try {
        return cookie ? JSON.parse(cookie) : null;
    } catch (e) {
        return null;
    }
  };

  return { setSelectedProject, getSelectedProject };
}
