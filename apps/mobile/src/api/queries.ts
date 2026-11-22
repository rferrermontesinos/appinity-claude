import type {
  CatalogItemDto,
  ConnectStartDto,
  Category,
  ConnectionDto,
  DevSessionDto,
  DevUserDto,
  ItemProfileDetailDto,
  ItemProfileDto,
  MeDto,
  Page,
  SettingsDto,
  SourceDto,
  SyncRunDto,
} from '@appinity/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSession } from '../state/session';
import { apiRequest, fetchHealth } from './client';

/** Las consultas autenticadas no se lanzan hasta recuperar la sesión guardada. */
function useHasSession(): boolean {
  return useSession((s) => Boolean(s.session?.token));
}

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
    mutationFn: ({ handle, code }: { handle: string; code?: string }) =>
      apiRequest<DevSessionDto>('/v1/dev/session', { method: 'POST', body: code ? { handle, code } : { handle }, auth: false }),
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

// ---- Fase 1: fuentes, conexiones, catálogo y perfiles propios ----

export type SourceView = SourceDto;
export type ProfileView = ItemProfileDto & { notes: ConsolidationNotes };
export type ProfileDetailView = ItemProfileDetailDto & { notes: ConsolidationNotes | null };

export interface ConsolidationNotes {
  overridden?: Array<{ sourceKey: string; basis: string; score: number }>;
  disagreement?: Array<{ sourceKey: string; score: number }>;
  supersededInSource?: number;
}

export const dataKeys = {
  sources: ['sources'] as const,
  connections: ['connections'] as const,
  runs: (id: string) => ['connections', id, 'runs'] as const,
  catalog: (category: Category) => ['catalog', category] as const,
  profiles: (category?: Category) => ['profiles', category ?? 'all'] as const,
  profile: (itemId: string) => ['profile', itemId] as const,
  item: (itemId: string) => ['item', itemId] as const,
};

export function useSources() {
  const enabled = useHasSession();
  return useQuery({ queryKey: dataKeys.sources, queryFn: () => apiRequest<SourceView[]>('/v1/sources'), enabled });
}

export function useConnections() {
  return useQuery({
    queryKey: dataKeys.connections,
    queryFn: () => apiRequest<ConnectionDto[]>('/v1/me/connections'),
    enabled: useHasSession(),
  });
}

/** Ejecuciones de sync de una conexión; mientras la última esté en cola o en curso, se consulta cada 1,5 s. */
export function useRuns(connectionId: string | undefined) {
  return useQuery({
    queryKey: dataKeys.runs(connectionId ?? 'none'),
    queryFn: () => apiRequest<SyncRunDto[]>(`/v1/me/connections/${connectionId}/runs`),
    enabled: useHasSession() && Boolean(connectionId),
    refetchInterval: (query) => {
      const latest = query.state.data?.[0];
      return latest?.status === 'queued' || latest?.status === 'running' ? 1_500 : false;
    },
  });
}

/** Tras cambiar fuentes se invalidan conexiones y perfiles (el catálogo no depende del usuario). */
function useInvalidateUserData() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: dataKeys.connections }),
      queryClient.invalidateQueries({ queryKey: ['profiles'] }),
      queryClient.invalidateQueries({ queryKey: ['profile'] }),
    ]);
}

export function useConnect() {
  const invalidate = useInvalidateUserData();
  return useMutation({
    mutationFn: ({ sourceKey, returnUrl }: { sourceKey: string; returnUrl?: string }) =>
      apiRequest<ConnectStartDto>('/v1/me/connections', { method: 'POST', body: returnUrl ? { sourceKey, returnUrl } : { sourceKey } }),
    onSuccess: invalidate,
  });
}

export function useSync() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ connectionId, mode }: { connectionId: string; mode: 'incremental' | 'full' }) =>
      apiRequest<SyncRunDto>(`/v1/me/connections/${connectionId}/sync`, { method: 'POST', body: { mode } }),
    onSuccess: (run) => queryClient.invalidateQueries({ queryKey: dataKeys.runs(run.connectionId) }),
  });
}

export function useDisconnect() {
  const invalidate = useInvalidateUserData();
  return useMutation({
    mutationFn: ({ connectionId, purge }: { connectionId: string; purge: boolean }) =>
      apiRequest<{ purgedObservations: number; affectedItems: number }>(
        `/v1/me/connections/${connectionId}?purge=${purge ? 'true' : 'false'}`,
        { method: 'DELETE' },
      ),
    onSuccess: invalidate,
  });
}

export function useCatalog(category: Category) {
  return useQuery({
    queryKey: dataKeys.catalog(category),
    queryFn: () => apiRequest<Page<CatalogItemDto> & { total: number }>(`/v1/catalog/items?category=${category}&limit=100`),
    enabled: useHasSession(),
  });
}

export function useItemProfiles(category?: Category) {
  return useQuery({
    queryKey: dataKeys.profiles(category),
    queryFn: () => apiRequest<ProfileView[]>(`/v1/me/item-profiles${category ? `?category=${category}` : ''}`),
    enabled: useHasSession(),
  });
}

export function useItemProfileDetail(itemId: string) {
  return useQuery({
    queryKey: dataKeys.profile(itemId),
    queryFn: () => apiRequest<ProfileDetailView>(`/v1/me/item-profiles/${itemId}`),
    enabled: useHasSession() && Boolean(itemId),
  });
}
