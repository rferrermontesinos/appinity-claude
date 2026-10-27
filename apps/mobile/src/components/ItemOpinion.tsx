import type { ItemOpinionDto, VoteValueDto } from '@appinity/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';
import { apiRequest } from '../api/client';
import { spacing, type, usePalette } from '../theme';
import { Small } from './ui';
import { RoundAction } from './Vote';

/**
 * «Tu opinión» en la ficha (2026-10-27): votar lo que guardaste cuando ya lo has visto, leído o escuchado, con la misma
 * escala que Inicio (No me gusta · Me gusta · Me encanta) y el mismo peso que una nota de tus fuentes. Votar es
 * definitivo (la obra deja de recomendarse); «Deshacer» solo se ofrece justo después de votar aquí.
 */
type Choice = { kind: 'vote'; value: VoteValueDto } | { kind: 'save' };

export function ItemOpinion({ itemId, surface }: { itemId: string; surface: string }) {
  const { t } = useTranslation();
  const c = usePalette();
  const queryClient = useQueryClient();
  const [justActed, setJustActed] = useState(false);
  const key = ['opinion', itemId];
  const opinion = useQuery({ queryKey: key, queryFn: () => apiRequest<ItemOpinionDto>(`/v1/me/home/items/${itemId}/opinion`) });
  const refresh = (tastes: boolean) => {
    void queryClient.invalidateQueries({ queryKey: key });
    // Un voto cambia tus gustos (perfil y mosaico). La lista de Recomendaciones se rehace al volver a abrirla.
    const keys = tastes ? [['profiles'], ['profile'], ['categoryRanking']] : [];
    for (const queryKey of keys) void queryClient.invalidateQueries({ queryKey });
  };
  const act = useMutation({
    mutationFn: (choice: Choice) =>
      choice.kind === 'vote'
        ? apiRequest('/v1/me/home/votes', { method: 'POST', body: { itemId, value: choice.value } })
        : apiRequest('/v1/me/home/actions', { method: 'POST', body: { itemId, action: 'keep' } }),
    onSuccess: (_, choice) => {
      setJustActed(true);
      // Se ve al instante; la consulta se vuelve a pedir igualmente para confirmar.
      queryClient.setQueryData<ItemOpinionDto>(key, (prev) =>
        choice.kind === 'vote' ? { voted: true, vote: choice.value, saved: prev?.saved ?? false } : { voted: false, vote: null, ...prev, saved: true },
      );
      refresh(choice.kind === 'vote');
    },
  });
  const undo = useMutation({
    mutationFn: () => apiRequest('/v1/me/home/undo', { method: 'POST' }),
    onSuccess: () => {
      setJustActed(false);
      refresh(true);
    },
  });

  const data = opinion.data;
  if (!data) return null;
  // Votos antiguos de «Lo odio» (−2) se muestran como «No me gusta».
  const current = data.vote === null ? null : data.vote < 0 ? -1 : data.vote;
  const busy = act.isPending || undo.isPending;
  const levels = [
    { value: -1 as const, icon: 'thumb-down' as const, label: t('home.vote.dislike'), color: c.negative },
    { value: 1 as const, icon: 'thumb-up' as const, label: t('home.vote.like'), color: c.affinity },
    { value: 2 as const, icon: 'heart' as const, label: t('home.vote.love'), color: c.affinity },
  ];
  const status = data.voted
    ? t('item.yourVote', { label: levels.find((l) => l.value === current)?.label ?? '—' })
    : data.saved
      ? t('item.savedHint')
      : t('item.opinionHint');

  return (
    <View style={{ gap: spacing.md, backgroundColor: surface, borderRadius: 18, padding: spacing.lg }}>
      <Text accessibilityRole="header" style={{ color: c.text, ...type.h3 }}>
        {t('item.opinionTitle')}
      </Text>
      <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'flex-end' }}>
        {levels.map((l) => (
          <RoundAction
            key={l.value}
            icon={l.icon}
            label={l.label}
            hint={t('home.vote.counts')}
            color={l.color}
            size={l.value === 2 ? 56 : 50}
            emphasis={l.value === 2 && !data.voted}
            selected={current === l.value}
            onPress={() => act.mutate({ kind: 'vote', value: l.value })}
            disabled={busy || data.voted}
          />
        ))}
        <RoundAction
          icon={data.saved ? 'bookmark' : 'bookmark-outline'}
          label={t(data.saved ? 'home.vote.saved' : 'home.vote.save')}
          hint={t('home.vote.saveHint')}
          color={c.text}
          size={44}
          selected={data.saved}
          onPress={() => act.mutate({ kind: 'save' })}
          disabled={busy || data.voted || data.saved}
        />
      </View>
      <View accessibilityLiveRegion="polite" style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm }}>
        <Small style={{ flexShrink: 1 }}>{status}</Small>
        {justActed ? (
          <Pressable accessibilityRole="button" onPress={() => undo.mutate()} disabled={busy} style={{ minHeight: 48, justifyContent: 'center', paddingHorizontal: spacing.sm }}>
            <Text style={{ color: c.primaryInk, fontSize: 14, fontWeight: '700' }}>{t('home.undo')}</Text>
          </Pressable>
        ) : null}
      </View>
      {act.isError || undo.isError ? <Small style={{ color: c.danger }}>{t('item.opinionError')}</Small> : null}
    </View>
  );
}
