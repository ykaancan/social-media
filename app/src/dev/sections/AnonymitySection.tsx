import React, { useState } from 'react';
import type { LayoutChangeEvent } from 'react-native';
import {
  AnonymityBadge,
  AnonymitySelector,
  HintChip,
  type AnonymityLevel,
  type HintFields,
} from '../../components/anonymity';
import { me } from '../fixtures';
import { Cluster, GallerySection, Specimen } from '../kit';

export function AnonymitySection({ onLayout }: { onLayout?: (e: LayoutChangeEvent) => void }) {
  const [level, setLevel] = useState<AnonymityLevel>('hint');
  const [hintFields, setHintFields] = useState<HintFields>({ section: true, letter: true });

  return (
    <GallerySection
      id="anonymity"
      title="Anonymity"
      subtitle="anonymity.card.html — sender badge at each level, hint chips, and the composer selector"
      onLayout={onLayout}
    >
      <Specimen label="anonymous">
        <Cluster>
          <AnonymityBadge level="anonymous" />
        </Cluster>
      </Specimen>

      <Specimen label="hint">
        <Cluster>
          <AnonymityBadge
            level="hint"
            hints={{ section: 'ESN İzmir', country: 'Türkiye', letter: 'Şeyma' }}
          />
        </Cluster>
      </Specimen>

      <Specimen label="named">
        <Cluster>
          <AnonymityBadge level="named" name="Şeyma Kaya" />
        </Cluster>
      </Specimen>

      <Specimen label="sizes sm / md / lg / xl">
        <Cluster>
          <AnonymityBadge size="sm" level="hint" hints={{ letter: 'Deniz' }} />
        </Cluster>
        <Cluster>
          <AnonymityBadge size="md" level="anonymous" />
        </Cluster>
        <Cluster>
          <AnonymityBadge size="lg" level="hint" hints={{ section: 'ESN Ankara' }} />
        </Cluster>
        <Cluster>
          <AnonymityBadge size="xl" level="named" name="Deniz Aksoy" />
        </Cluster>
      </Specimen>

      <Specimen label="HintChip · section / country / letter · sm / md / lg / xl">
        <Cluster>
          <HintChip kind="section" value="ESN İzmir" />
          <HintChip kind="country" value="Italy" />
          <HintChip kind="letter" value="S" />
          <HintChip size="sm" kind="section" value="ESN Ankara" />
        </Cluster>
        <Cluster>
          <HintChip size="lg" kind="country" value="Türkiye" />
          <HintChip size="xl" kind="letter" value="D" />
        </Cluster>
      </Specimen>

      <Specimen label="AnonymitySelector · live level + hint-field picks">
        <AnonymitySelector
          value={level}
          onChange={setLevel}
          hintFields={hintFields}
          onHintFieldsChange={setHintFields}
          me={{ name: me.name, section: me.section, country: me.country }}
        />
      </Specimen>
    </GallerySection>
  );
}
