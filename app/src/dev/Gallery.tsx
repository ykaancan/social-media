import React, { useCallback, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { ReducedMotionConfig, ReduceMotion } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Chip, Switch, Text } from '../components/core';
import { setLocale, useLocale, LOCALES, type Locale } from '../i18n';
import {
  covers,
  coverNames,
  DEFAULT_COVER,
  EntitlementsProvider,
  EventColorProvider,
  useTheme,
  type CoverName,
} from '../theme';
import { Caption, Cluster } from './kit';
import { AnonymitySection } from './sections/AnonymitySection';
import { CardsSection } from './sections/CardsSection';
import { CoreSection } from './sections/CoreSection';
import { PatternsSection } from './sections/PatternsSection';
import { ProjectorSection } from './sections/ProjectorSection';

/**
 * [D1] The dev-only component gallery: every component in the library, in every
 * variant, on the design bundle's own fixtures. It is the RN equivalent of the
 * bundle's `*.card.html` specimens and the way "verified visually against the
 * prototype" is proved — run Expo, screenshot this screen, compare it against
 * `/design`.
 *
 * The gallery's own chrome (control bar, section headings, specimen captions)
 * is dev-only and deliberately NOT translated. Everything inside a specimen
 * still comes from i18n or from the fixtures in `./fixtures`.
 */

const SECTIONS = ['core', 'anonymity', 'cards', 'projector', 'patterns'] as const;
type SectionId = (typeof SECTIONS)[number];

const SECTION_LABELS: Record<SectionId, string> = {
  core: 'Core',
  anonymity: 'Anonymity',
  cards: 'Cards',
  projector: 'Projector',
  patterns: 'Patterns',
};

export default function Gallery() {
  const { colors, space } = useTheme();
  const locale = useLocale();

  const [cover, setCover] = useState<CoverName>(DEFAULT_COVER);
  const [lockedCards, setLockedCards] = useState(false);
  const [reduced, setReduced] = useState(false);

  const scrollRef = useRef<ScrollView>(null);
  const offsets = useRef<Partial<Record<SectionId, number>>>({});

  const measure = useCallback(
    (id: SectionId) => (e: LayoutChangeEvent) => {
      offsets.current[id] = e.nativeEvent.layout.y;
    },
    []
  );

  const jump = (id: SectionId) => {
    scrollRef.current?.scrollTo({ y: Math.max(0, (offsets.current[id] ?? 0) - 8), animated: true });
  };

  return (
    <>
      {/* Not a wrapper: ReducedMotionConfig takes no children, it sets the
          reanimated global for as long as it is mounted. Only mounted for the
          ON state: mounting it with `System` would merely restore reanimated's
          own default while logging "Reduced motion setting is overwritten with
          mode 'system'" on every mount, so the default path mounts nothing. */}
      {reduced ? <ReducedMotionConfig mode={ReduceMotion.Always} /> : null}
      <EventColorProvider cover={cover}>
        <EntitlementsProvider value={{ lockedCards }}>
          <SafeAreaView edges={['top']} style={[styles.root, { backgroundColor: colors.bg }]}>
            {/* Control bar — sticky above the scroller, not part of it. */}
            <View
              style={[
                styles.bar,
                { backgroundColor: colors.bgSunken, borderBottomColor: colors.border, gap: space.s2 },
              ]}
            >
              <View style={styles.barTop}>
                <Text variant="titleSm">Component gallery</Text>
                <Text variant="caption" color={colors.text2} nums>
                  {`49 components · ${SECTIONS.length} sections`}
                </Text>
              </View>

              <Cluster gap={6}>
                <Caption>locale</Caption>
                {LOCALES.map((l: Locale) => (
                  <Chip key={l} size="sm" selected={locale === l} onPress={() => void setLocale(l)}>
                    {l}
                  </Chip>
                ))}
              </Cluster>

              <Cluster gap={6}>
                <Caption>event</Caption>
                {coverNames.map((name) => (
                  <Pressable
                    key={name}
                    accessibilityRole="button"
                    accessibilityLabel={name}
                    testID={`gallery-cover-${name}`}
                    onPress={() => setCover(name)}
                    style={[
                      styles.swatch,
                      {
                        backgroundColor: covers[name].cover,
                        borderColor: cover === name ? colors.text : 'transparent',
                      },
                    ]}
                  />
                ))}
              </Cluster>

              <Cluster gap={space.s4}>
                <View style={styles.toggle}>
                  <Caption>locked gate</Caption>
                  <Switch checked={lockedCards} onChange={setLockedCards} />
                </View>
                <View style={styles.toggle}>
                  <Caption>reduced motion</Caption>
                  <Switch checked={reduced} onChange={setReduced} />
                </View>
              </Cluster>

              <Cluster gap={6}>
                {SECTIONS.map((id) => (
                  <Chip key={id} size="sm" tone="outline" onPress={() => jump(id)}>
                    {SECTION_LABELS[id]}
                  </Chip>
                ))}
              </Cluster>
            </View>

            <ScrollView
              ref={scrollRef}
              testID="gallery-scroll"
              contentContainerStyle={{
                paddingHorizontal: space.screenX,
                paddingBottom: space.thumbZone,
              }}
            >
              <CoreSection onLayout={measure('core')} />
              <AnonymitySection onLayout={measure('anonymity')} />
              <CardsSection onLayout={measure('cards')} />
              <ProjectorSection onLayout={measure('projector')} />
              <PatternsSection onLayout={measure('patterns')} />
            </ScrollView>
          </SafeAreaView>
        </EntitlementsProvider>
      </EventColorProvider>
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  bar: { paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1 },
  barTop: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  swatch: { width: 22, height: 22, borderRadius: 11, borderWidth: 2 },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 6 },
});
