import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  addReference,
  getUploadLimits,
  listInputs,
  listMusic,
  removeReference,
  removeUpload,
  copyLibraryTrack,
} from "@/services";
import { queryKeys } from "./queryKeys";

export function useUploadLimits() {
  return useQuery({
    queryKey: queryKeys.uploadLimits,
    queryFn: getUploadLimits,
    staleTime: Infinity,
  });
}

export function useInputs(projectId: string) {
  return useQuery({
    queryKey: queryKeys.inputs(projectId),
    queryFn: () => listInputs(projectId),
    enabled: Boolean(projectId),
  });
}

export function useRemoveUpload(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => removeUpload(projectId, name),
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.inputs(projectId) }),
  });
}

export function useAddReference(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (ref: { url: string; notes: string }) => addReference(projectId, ref),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.inputs(projectId) }),
  });
}

export function useRemoveReference(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (refId: string) => removeReference(projectId, refId),
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.inputs(projectId) }),
  });
}

export function useMusic() {
  return useQuery({ queryKey: queryKeys.music, queryFn: listMusic, select: (d) => d.tracks });
}

/** Use a music-library track as the creator's music (copies it into the project). */
export function useUseLibraryTrack(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => copyLibraryTrack(projectId, name),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.inputs(projectId) }),
  });
}
