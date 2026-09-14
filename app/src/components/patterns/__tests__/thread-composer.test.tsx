import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThreadComposer } from '../ThreadComposer';
import { ThemeProvider } from '../../../theme';
import { initI18n } from '../../../i18n';
initI18n();

it('requires acknowledgement per draft and preserves the draft when delivery fails',async()=>{
  const send=jest.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(undefined),screening=jest.fn(async()=>({warning:true}));
  await render(<SafeAreaProvider initialMetrics={{frame:{x:0,y:0,width:390,height:844},insets:{top:0,bottom:0,left:0,right:0}}}><ThemeProvider><ThreadComposer onScreen={screening} onSend={send}/></ThemeProvider></SafeAreaProvider>);
  await fireEvent.changeText(screen.getByTestId('thread-text'),'First draft');
  await fireEvent.press(screen.getByTestId('thread-send'));expect(send).not.toHaveBeenCalled();
  await fireEvent.changeText(screen.getByTestId('thread-text'),'Changed draft');
  await fireEvent.press(screen.getByTestId('thread-send'));expect(send).not.toHaveBeenCalled();expect(screening).toHaveBeenCalledTimes(2);
  await fireEvent.press(screen.getByTestId('thread-send'));expect(send).toHaveBeenCalledWith('Changed draft',true);
  expect(screen.getByTestId('thread-text').props.value).toBe('Changed draft');expect(screen.getByRole('alert')).toBeTruthy();
  await fireEvent.press(screen.getByTestId('thread-send'));expect(screen.getByTestId('thread-text').props.value).toBe('');
});
