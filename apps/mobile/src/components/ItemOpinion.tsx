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
 * «Tu opinión» en la ficha (motor v3, 2026-10-27): votar lo que ya conoces con la misma escala que Inicio (No me gusta ·
 * Me gusta · Me encanta) y el mismo peso que una nota de tus fuentes. Votar es definitivo (la obra deja de
 * recomendarse); «Deshacer» solo se ofrece justo después de votar aquí.
 */
export function ItemOpinion({ itemId, surface }: { itemId: string; surface: string }) {
  const { t } = useTranslation();
  const c = usePalette();
  const queryClient = useQueryClient();
  const [justVoted, setJustVoted] = useState(false);
  const key = ['opinion', itemId];
  const opinion = useQuery({ queryKey: key, queryFn: () => apiRequest<ItemOpinionDto>(`/v1/me/home/items/${itemId}/opinion`) });
  // Un voto cambia tus gustos (perfil y mosaico). La lista de Recomendaciones se rehace al volver a abrirla.
  const refreshTastes = () => {
    for (const queryKey of [key, ['profiles'], ['profile'], ['categoryRanking']]) void queryClient.invalidateQueries({ queryKey });
  };
  const vote = useMutation({
    mutationFn: (value: VoteValueDto) => apiRequest('/v1/me/home/votes', { method: 'POST', body: { itemId, value } }),
    onSuccess: (_, value) => {
      setJustVoted(true);
      // Se ve al instante; la consulta se vuelve a pedir igualmente para confirmar.
      queryClient.setQueryData<ItemOpinionDto>(key, { voted: true, vote: value });
      refreshTastes();
    },
  });
  const undo = useMutation({
    mutationFn: () => apiRequest('/v1/me/home/undo', { method: 'POST' }),
    onSuccess: () => {
      setJustVoted(false);
      refreshTastes();
    },
  });

  const data = opinion.data;
  if (!data) return null;
  // Votos antiguos de «Lo odio» (−2) se muestran como «No me gusta».
  const current = data.vote === null ? null : data.vote < 0 ? -1 : data.vote;
  const busy = vote.isPending || undo.isPending;
  const levels = [
    { value: -1 as const, icon: 'thumb-down' as const, label: t('home.vote.dislike'), color: c.negative },
    { value: 1 as const, icon: 'thumb-up' as const, label: t('home.vote.like'), color: c.affinity },
    { value: 2 as const, icon: 'heart' as const, label: t('home.vote.love'), color: c.affinity },
  ];
  const status = data.voted ? t('item.yourVote', { label: levels.find((l) => l.value === current)?.label ?? '—' }) : t('item.opinionHint');

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
            size={l.value === 2 ? 58 : 52}
            emphasis={l.value === 2 && !data.voted}
            selected={current === l.value}
            onPress={() => vote.mutate(l.value)}
            disabled={busy || data.voted}
          />
        ))}
      </View>
      <View accessibilityLiveRegion="polite" style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm }}>
        <Small style={{ flexShrink: 1 }}>{status}</Small>
        {justVoted ? (
          <Pressable accessibilityRole="button" onPress={() => undo.mutate()} disabled={busy} style={{ minHeight: 48, justifyContent: 'center', paddingHorizontal: spacing.sm }}>
            <Text style={{ color: c.primaryInk, fontSize: 14, fontWeight: '700' }}>{t('home.undo')}</Text>
          </Pressable>
        ) : null}
      </View>
      {vote.isError || undo.isError ? <Small style={{ color: c.danger }}>{t('item.opinionError')}</Small> : null}
    </View>
  );
}
