/**
 * React Query Hooks for Projects
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as api from '../lib/api-client';
import type { ProjectCreatePayload } from '../lib/api-client';

export function useProjects() {
  return useQuery({
    queryKey: ['projects'],
    queryFn: api.fetchProjects,
    staleTime: 30000, // 30 seconds
  });
}

export function useProject(id: string | null) {
  return useQuery({
    queryKey: ['projects', id],
    queryFn: () => api.fetchProject(id!),
    enabled: !!id,
  });
}

export function useCreateProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: ProjectCreatePayload) => api.createProject(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
  });
}

export function useDeleteProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => api.deleteProject(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
  });
}
