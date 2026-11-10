import React, { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { isApiError, LIMITS, soleMembershipSection, useApi } from '../../api';
import {
  Back,
  BottomBar,
  Button,
  Input,
  OnboardingHeader,
  PhotoPicker,
  Screen,
  Text,
  useToast,
  WallHeader,
} from '../../components';
import { useTranslation } from '../../i18n';
import type { RootScreenProps } from '../../navigation/types';
import { useSession } from '../../session';
import { useTheme } from '../../theme';

/**
 * Profile setup — the `profile` branch of
 * `/design/bundle/prototypes/onboarding-app.jsx`: photo, name and a one-line
 * bio, over a live wall-header preview.
 *
 * [D15] The section is no longer part of the account profile, so the section
 * picker and the read-only country row [D11] are gone from this screen: a
 * section is picked when the person first enters an organisation that has
 * sections. Sending the profile makes the account `active` [D14] and the
 * navigator opens the four-tab shell; nobody reviews the account.
 *
 * `route.params.edit` is true when an active account is changing its profile
 * (reached from Settings); false or absent on first setup, when the account is
 * `incomplete`.
 */
export function ProfileSetup({ navigation, route }: RootScreenProps<'ProfileSetup'>) {
  const edit = route.params?.edit === true;
  const { me, submitProfile, logout, refreshMe } = useSession();
  const active = me?.status === 'active';
  const api = useApi();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const toast = useToast();

  // Prefilled from `me`, which is empty while the account is `incomplete` and
  // full in edit mode.
  const [name, setName] = useState(me?.name ?? '');
  const [bio, setBio] = useState(me?.bio ?? '');
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
  const [sending, setSending] = useState(false);

  const shownPhoto = photoUri ?? me?.avatarUrl;
  // Q5: your own wall header shows "section · country" only with exactly one
  // membership that has a section. On first setup there is no membership.
  const section = soleMembershipSection(me);

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

  const ready = name.trim().length > 0;

  const send = useCallback(async () => {
    if (!ready || sending) return;
    setSending(true);
    try {
      if (active) {
        await api.editProfile({ name: name.trim(), bio: bio.trim(), photoUri });
        await refreshMe();
        toast.show(t('settingsFlow.saved'));
        navigation.goBack();
        return;
      }
      await submitProfile({
        name: name.trim(),
        bio: bio.trim() || undefined,
        photoUri,
      });
      // Nothing to navigate: the account becomes `active` and `RootNavigator`
      // swaps the whole route group out from under this screen.
    } catch (err) {
      setSending(false);
      if (isApiError(err, 'network')) {
        toast.show(t('onboarding.errorNetwork'), { tone: 'warn' });
        return;
      }
      toast.show(t('onboarding.errorGeneric'), { tone: 'danger' });
    }
  }, [ready, sending, submitProfile, name, bio, photoUri, toast, t, active, api, refreshMe, navigation]);

  /* ---------------- section chip ---------------- */

  // The Section route only exists in the active group (RootNavigator), so on
  // first setup the preview's chip has nowhere to go and is left inert.
  const canOpenSection = navigation.getState()?.routeNames.includes('Section') ?? false;
  const openSection = useCallback(() => {
    if (section) navigation.navigate('Section', { id: section.id });
  }, [navigation, section]);

  /* ---------------- header ---------------- */

  /**
   * In edit mode there is a screen behind this one. On first setup there is
   * not: the account has no profile yet, so the way out is a log out, not a
   * back arrow to a sign-up form that has already done its job.
   */
  const header = edit ? (
    <Back onBack={() => navigation.goBack()} />
  ) : (
    <OnboardingHeader
      actionLabel={t('onboarding.logOut')}
      onAction={() => {
        void logout();
      }}
      testID="profile-logout"
    />
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
            {t(active ? 'common.save' : 'onboarding.continue')}
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
    </Screen>
  );
}

const styles = StyleSheet.create({
  preview: { gap: 8 },
});
