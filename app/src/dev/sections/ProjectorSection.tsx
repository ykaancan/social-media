import { ProjectorStage } from '../../components/projector/ProjectorStage';
import React from 'react';
import { StyleSheet, useWindowDimensions, View, type LayoutChangeEvent } from 'react-native';
import { PulseDot, Text } from '../../components/core';
import { ProjectorPost } from '../../components/projector';
import { ink, palette, ThemeProvider, useTheme } from '../../theme';
import { events, posts } from '../fixtures';
import { GallerySection, Specimen } from '../kit';

/** The projector layout is authored at 1920×1080, exactly like the web specimen. */
const W = 1920;
const H = 1080;

const projectorColors = palette('projector');

export function ProjectorSection({ onLayout }: { onLayout?: (e: LayoutChangeEvent) => void }) {
  const { space, radius } = useTheme();
  const { width } = useWindowDimensions();

  // projector.card.html scales the 1920 stage by .35 inside a 700px card. The
  // phone is narrower, so the same idea is computed from the window instead.
  const available = Math.max(240, width - space.screenX * 2);
  const scale = available / W;
  const percent = Math.round(scale * 100);

  return (
    <GallerySection
      id="projector"
      title="Projector"
      subtitle="projector.card.html — 1920×1080 dark board view — event color bar, lg sender, 72–96px text"
      onLayout={onLayout}
    >
      <Specimen label={`Projector · 1920×1080 stage at ${percent}% · ProjectorPost hint + named`}>
        <View
          style={[
            styles.viewport,
            { width: available, height: H * scale, borderRadius: radius.card, backgroundColor: ink[950] },
          ]}
        >
          <View
            style={[
              styles.stage,
              {
                transform: [
                  { translateX: (-W * (1 - scale)) / 2 },
                  { translateY: (-H * (1 - scale)) / 2 },
                  { scale },
                ],
              },
            ]}
          >
            {/* The one dark scope in stage 1: nest the projector palette here. */}
            <ThemeProvider scheme="projector">
              <View style={styles.frame}>
                <View style={styles.header}>
                  <Text variant="projectorTitle" upper color={projectorColors.text}>
                    {events.np.name}
                  </Text>
                  <View style={styles.meta}>
                    <PulseDot size={22} color={projectorColors.live}>
                      <View style={[styles.dot, { backgroundColor: projectorColors.live }]} />
                    </PulseDot>
                    <Text variant="projectorMeta" upper nums color={projectorColors.live}>
                      {`Live · ${events.np.memberCount ?? 0}`}
                    </Text>
                  </View>
                </View>

                <ProjectorPost
                  text={posts.speaker}
                  sender={{ level: 'hint', hints: { section: 'ESN Ankara' } }}
                  time="22:41"
                  reactions={{ '🔥': 31, '😂': 8 }}
                />
                <ProjectorPost
                  text={posts.jacket}
                  sender={{ level: 'named', name: 'Deniz Aksoy' }}
                  time="22:39"
                  reactions={{ '👀': 44, '😳': 6 }}
                />
              </View>
            </ThemeProvider>
          </View>
        </View>
      </Specimen>
      <Specimen label="ProjectorStage · live cycle / empty">
        <View style={{height:320}}><ProjectorStage name="National Platform" status="live" onExit={()=>{}} posts={[
          {id:'stage-1',text:posts.speaker,sender:{level:'hint',hints:{section:'ESN Ankara'}},createdAt:new Date().toISOString(),state:'approved',mine:false,reactions:{'🔥':3}},
          {id:'stage-2',text:posts.jacket,sender:{level:'anonymous'},createdAt:new Date().toISOString(),state:'approved',mine:false,reactions:{}},
        ]}/></View>
        <View style={{height:220}}><ProjectorStage name="Welcome night" status="upcoming" onExit={()=>{}} posts={[]}/></View>
      </Specimen>
    </GallerySection>
  );
}

const styles = StyleSheet.create({
  viewport: { overflow: 'hidden' },
  stage: { position: 'absolute', top: 0, left: 0, width: W, height: H },
  frame: {
    width: W,
    height: H,
    paddingVertical: 72,
    paddingHorizontal: 96,
    gap: 64,
    overflow: 'hidden',
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 18 },
  dot: { width: 22, height: 22, borderRadius: 11 },
});
