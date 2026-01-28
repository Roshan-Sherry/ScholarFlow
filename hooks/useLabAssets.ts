/**
 * React Query Hooks for Lab Assets
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as api from '../lib/api-client';

export function useLabAssets(projectId: string | null) {
  return useQuery({
    queryKey: ['lab-assets', projectId],
    queryFn: () => api.fetchLabAssets(projectId!),
    enabled: !!projectId,
  });
}

export function useUploadLabAsset() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      projectId,
      file,
      name,
      assetType,
    }: {
      projectId: string;
      file: File;
      name: string;
      assetType: 'image' | 'data' | 'code';
    }) => api.uploadLabAsset(projectId, file, name, assetType),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['lab-assets', variables.projectId] });
    },
  });
}

export function useReanalyzeAsset() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      assetId,
      customPrompt,
      projectId,
    }: {
      assetId: string;
      customPrompt?: string;
      projectId: string;
    }) => api.reanalyzeAsset(assetId, customPrompt),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['lab-assets', variables.projectId] });
    },
  });
}

export function useDeleteLabAsset() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ assetId, projectId }: { assetId: string; projectId: string }) =>
      api.deleteLabAsset(assetId),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['lab-assets', variables.projectId] });
    },
  });
}
