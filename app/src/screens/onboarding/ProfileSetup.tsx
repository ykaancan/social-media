import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { isApiError, LIMITS, useApi } from '../../api';
import {
  Back,
  BottomBar,
  Button,
  Input,
  PhotoPicker,
  PickerRow,
  Screen,
  SectionSheet,
  Text,
  useToast,
  WallHeader,
  Wordmark,
  type SectionOption,
} from '../../components';
import { useTranslation } from '../../i18n';
import type { RootScreenProps } from '../../navigation/types';
import { useSession } from '../../session';
import { useTheme } from '../../theme';

/**
 * Profile setup — the `profile` branch of
 * `/design/bundle/prototypes/onboarding-app.jsx`: photo, name, section, a
 * read-only country row and a one-line bio, over a live wall-header preview.
 *
 * `route.params.edit` is true when an account that already has a profile is
 * changing it (a `rejected` account resubmitting, or Settings later); false or
 * absent on first setup, when the account is `incomplete`.
 *
 * [D11] Country is not an independent field. It is read through the section,
 * shown read-only, and never picked — the row exists so the form still reads as
 * one column, not because it is a control waiting to be enabled.
 */
export function ProfileSetup({ navigation, route }: RootScreenProps<'ProfileSetup'>) {
  const edit = route.params?.edit === true;
  const { me, submitProfile, logout, refreshMe } = useSession();
  const approved=me?.status==='approved';
  const api = useApi();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const toast = useToast();

  // Prefilled from `me`, which is empty while the account is `incomplete` and
  // full in edit mode. The section keeps only what the server sent — id, name
  // and country — so no member count is invented for it (principle 4).
  const [name, setName] = useState(me?.name ?? '');
  const [bio, setBio] = useState(me?.bio ?? '');
  const [section, setSection] = useState<{ id: string; name: string; country: string } | null>(
    me?.section ?? null,
  );
  /**
   * A photo picked in THIS session, as a local `file://` URI. Kept apart from
   * `me.avatarUrl` because `ProfileRequest.photoUri` is a local URI the client
   * uploads; sending back the avatar URL the account already has would ask the
   * server to fetch its own file. Absent means "keep the current avatar".
   *
   * This avatar is the ONE image upload stage 1 allows. "Text only in stage 1.
   * No image or file upload endpoints" is about content — posts, messages,
   * threads — and stays absolute. Do not add a second one.
   */
  const [photoUri, setPhotoUri] = useState<string | undefined>(undefined);
  const [sections, setSections] = useState<SectionOption[] | null>(null);
  const [picking, setPicking] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(()=>{if(approved&&me?.section)setSection(me.section);},[approved,me?.section]);
  const shownPhoto = photoUri ?? me?.avatarUrl;

  /* ---------------- sections ---------------- */

  const loadSections = useCallback(async () => {
    try {
      const list = await api.listSections();
      setSections(
        list.map((s) => ({ id: s.id, name: s.name, country: s.country, members: s.memberCount })),
      );
    } catch (err) {
      if (isApiError(err, 'network')) {
        toast.show(t('onboarding.errorNetwork'), {
          tone: 'warn',
          action: t('common.retry'),
          onAction: () => {
            void loadSections();
          },
        });
        return;
      }
      toast.show(t('onboarding.errorGeneric'), { tone: 'danger' });
    }
  }, [api, t, toast]);

  useEffect(() => {
    void loadSections();
  }, [loadSections]);

  /* ---------------- photo ---------------- */

  const pickPhoto = useCallback(async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      // Calm, and it says what to do next — never "denied", never a warning face.
      toast.show(t('onboarding.photoPermission'), { tone: 'warn' });
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    if (asset) setPhotoUri(asset.uri);
  }, [t, toast]);

  /* ---------------- submit ---------------- */

  const ready = name.trim().length > 0 && section !== null;

  const send = useCallback(async () => {
    if (!ready || !section || sending) return;
    setSending(true);
    try {
      if(approved){
        await api.editProfile({name:name.trim(),bio:bio.trim(),photoUri});await refreshMe();toast.show(t('settingsFlow.saved'));navigation.goBack();return;
      }
      await submitProfile({
        name: name.trim(),
        sectionId: section.id,
        bio: bio.trim() || undefined,
        photoUri,
      });
      // Nothing to navigate: the account moves to `pending` and `RootNavigator`
      // swaps the whole route group out from under this screen. That includes
      // a `rejected` account resubmitting — the group's key carries the status.
    } catch (err) {
      setSending(false);
      if (isApiError(err, 'network')) {
        toast.show(t('onboarding.errorNetwork'), { tone: 'warn' });
        return;
      }
      toast.show(t('onboarding.errorGeneric'), { tone: 'danger' });
    }
  }, [ready, section, sending, submitProfile, name, bio, photoUri, toast, t, approved, api, refreshMe, navigation]);

  /* ---------------- section chip ---------------- */

  // The Section route only exists in the approved group (RootNavigator), so on
  // first setup and while pending the preview's chip has nowhere to go and is
  // left inert rather than pressable-and-dead.
  const canOpenSection = navigation.getState()?.routeNames.includes('Section') ?? false;
  const openSection = useCallback(() => {
    if (section) navigation.navigate('Section', { id: section.id });
  }, [navigation, section]);

  /* ---------------- header ---------------- */

  /**
   * In edit mode there is a screen behind this one. On first setup there is
   * not: the account is registered but has no profile, so the way out is the
   * Pending screen's header — the mark and a log out — not a back arrow to a
   * sign-up form that has already done its job.
   *
   * [D1] This row is duplicated on Pending; it belongs in the library the
   * moment a third screen wants it.
   */
  const header = edit ? (
    <Back onBack={() => navigation.goBack()} />
  ) : (
    <View style={styles.header}>
      <View style={styles.headerRow}>
        <Wordmark treatment="plain" size="sm" />
        <Button
          variant="ghost"
          size="sm"
          onPress={() => {
            void logout();
          }}
          testID="profile-logout"
        >
          {t('onboarding.logOut')}
        </Button>
      </View>
    </View>
  );

  return (
    <Screen
      keyboard
      header={header}
      testID="profile-setup"
      bottom={
        <BottomBar>
          <Button
            size="lg"
            full
            icon="Send"
            disabled={!ready}
            loading={sending}
            onPress={() => {
              void send();
            }}
            testID="profile-submit"
          >
            {/* Approved edits save directly; rejected profiles still resubmit. */}
            {t(approved?'common.save':'onboarding.sendForApproval')}
          </Button>
        </BottomBar>
      }
    >
      <Text variant="displayLg" upper>
        {t('onboarding.profileTitle')}
      </Text>

      <PhotoPicker
        uri={shownPhoto}
        name={name.trim()}
        label={t('onboarding.photo')}
        hint={t('onboarding.photoHint')}
        onPress={() => {
          void pickPhoto();
        }}
        testID="profile-photo"
      />

      <Input
        label={t('onboarding.name')}
        value={name}
        onChange={setName}
        placeholder={t('onboarding.namePlaceholder')}
        maxLength={LIMITS.nameMax}
        testID="profile-name"
      />

      <PickerRow
        label={t('onboarding.section')}
        icon="MapPin"
        value={approved?me?.section?.name:section?.name}
        placeholder={t('onboarding.pickSection')}
        hint={t('onboarding.sectionHint')}
        // Until the list is here there is nothing to open; an empty sheet would
        // read as "no sections exist".
        onPress={approved?()=>navigation.navigate('Settings',{page:'section'}):sections ? () => setPicking(true) : undefined}
        testID="profile-section"
      />

      {/* [D11] Read-only, filled from the section, never picked. */}
      <PickerRow
        locked
        label={t('onboarding.country')}
        icon="Flag"
        value={approved?me?.section?.country:section?.country}
        placeholder={t('onboarding.countryFromSection')}
        testID="profile-country"
      />

      <Input
        label={t('onboarding.bio')}
        value={bio}
        onChange={setBio}
        placeholder={t('onboarding.bioPlaceholder')}
        maxLength={LIMITS.bioMax}
        testID="profile-bio"
      />

      <View style={styles.preview}>
        <Text variant="captionCaps" upper color={colors.text2}>
          {t('onboarding.wallPreview')}
        </Text>
        <WallHeader
          preview
          testID="profile-preview"
          user={{
            name: name.trim(),
            section: section?.name,
            country: section?.country,
            bio: bio.trim(),
            avatar: shownPhoto,
            hasPhoto: Boolean(shownPhoto),
          }}
          onSection={section && canOpenSection ? openSection : undefined}
        />
      </View>

      {picking && sections ? (
        <SectionSheet
          sections={sections}
          value={section?.id}
          onPick={(picked) => {
            // [D11] Picking a section is picking a country: the locked row and
            // the preview chip both fill from this one choice.
            setSection({ id: picked.id, name: picked.name, country: picked.country });
            setPicking(false);
          }}
          onClose={() => setPicking(false)}
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  // S.header from the prototype, without a title.
  header: { paddingTop: 6, paddingHorizontal: 16, paddingBottom: 12 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    minHeight: 44,
  },
  preview: { gap: 8 },
});
