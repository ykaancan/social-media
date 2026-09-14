import React from 'react';
import { render,screen,fireEvent,waitFor,act } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ApiProvider,ApiError,MockApi } from '../../api';
import { ThemeProvider } from '../../theme';
import { ToastHost } from '../../components/patterns';
import { clearTokens,saveTokens,SessionProvider } from '../../session';
import { initI18n,setLocale,t } from '../../i18n';
import { RootNavigator } from '../RootNavigator';
initI18n();
const metrics={frame:{x:0,y:0,width:390,height:844},insets:{top:0,bottom:0,left:0,right:0}};
async function account(){await clearTokens();const api=new MockApi({latencyMs:0,approveAfterMs:0});const auth=await api.register({email:'review@example.com',password:'password123'});await api.submitProfile({name:'Review',sectionId:'ankara'});await api.me();await saveTokens(auth.tokens);return api;}
async function mount(api:MockApi){await render(<SafeAreaProvider initialMetrics={metrics}><ThemeProvider><ApiProvider api={api}><SessionProvider><ToastHost><RootNavigator/></ToastHost></SessionProvider></ApiProvider></ThemeProvider></SafeAreaProvider>);}
afterEach(async()=>{await clearTokens();await act(async()=>{await setLocale('en');});});

it.each(['en','tr'] as const)('offers offline boot recovery without losing the session (%s)',async locale=>{
  await setLocale(locale);const api=await account();jest.spyOn(api,'me').mockRejectedValueOnce(new ApiError('network','offline'));
  await mount(api);await waitFor(()=>expect(screen.getByTestId('boot-error')).toBeTruthy());
  await fireEvent.press(screen.getByText(t('common.retry')));await waitFor(()=>expect(screen.getByTestId('tab-events')).toBeTruthy());
  expect(screen.queryByTestId('splash')).toBeNull();
});

it.each(['en','tr'] as const)('shows restricted account copy without approval promises or editing (%s)',async locale=>{
  await setLocale(locale);const api=await account();api['accounts'].get('review@example.com')!.status='banned';
  await mount(api);await waitFor(()=>expect(screen.getByText(t('reviewFlow.bannedTitle').toLocaleUpperCase(locale))).toBeTruthy());
  expect(screen.queryByText(t('onboarding.pendingNote'))).toBeNull();expect(screen.queryByTestId('pending-edit')).toBeNull();expect(screen.queryByTestId('tab-events')).toBeNull();
  await expect(api.submitProfile({name:'Bypass',sectionId:'ankara'})).rejects.toMatchObject({status:403});
});
