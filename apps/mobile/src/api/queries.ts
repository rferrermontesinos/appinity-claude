import type { DevSessionDto, DevUserDto, MeDto, SettingsDto } from '@appinity/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSession } from '../state/session';
import { apiRequest, fetchHealth } from './client';

export const queryKeys = {
  health: ['health'] as const,
  devUsers: ['dev', 'users'] as const,
  me: ['me'] as const,
};

export function useHealth() {
  return useQuery({ queryKey: queryKeys.health, queryFn: fetchHealth, retry: 0, refetchInterval: 30_000 });
}

export function useDevUsers() {
  return useQuery({
    queryKey: queryKeys.devUsers,
    queryFn: () => apiRequest<DevUserDto[]>('/v1/dev/users', { auth: false }),
    retry: 0,
  });
}

export function useMe() {
  const token = useSession((s) => s.session?.token);
  return useQuery({
    queryKey: [...queryKeys.me, token],
    queryFn: () => apiRequest<MeDto>('/v1/me'),
    enabled: Boolean(token),
  });
}

export function useDevLogin() {
  const setSession = useSession((s) => s.setSession);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (handle: string) =>
      apiRequest<DevSessionDto>('/v1/dev/session', { method: 'POST', body: { handle }, auth: false }),
    onSuccess: async (data) => {
      await setSession({ token: data.token, expiresAt: data.expiresAt, handle: data.me.user.handle });
      queryClient.clear();
    },
  });
}

export type SettingsPatch = Partial<Omit<SettingsDto, 'location'>> & { location?: SettingsDto['location'] };

export function useUpdateSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (patch: SettingsPatch) => apiRequest<MeDto>('/v1/me/settings', { method: 'PATCH', body: patch }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.me }),
  });
}
