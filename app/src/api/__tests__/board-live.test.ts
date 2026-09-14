import { Client } from '@stomp/stompjs';
import { HttpApi } from '../http';

jest.mock('@stomp/stompjs',()=>({Client:jest.fn().mockImplementation(config=>({
  ...config,activate:jest.fn(),deactivate:jest.fn(async()=>{}),subscribe:jest.fn(),
}))}));

it('subscribes only to the private thread queue and ignores callbacks after cleanup',()=>{
  const api=new HttpApi('https://api.example');api.setTokens({accessToken:'first',refreshToken:'refresh'});
  const changed=jest.fn(),stop=api.subscribeThreads(changed);
  const client=(Client as unknown as jest.Mock).mock.results.at(-1)!.value;
  client.beforeConnect();expect(client.connectHeaders.Authorization).toBe('Bearer first');
  client.onConnect();expect(client.subscribe.mock.calls[0][0]).toBe('/user/queue/threads');
  expect(client.subscribe).toHaveBeenCalledTimes(1);
  api.setTokens({accessToken:'renewed',refreshToken:'refresh'});client.beforeConnect();
  expect(client.connectHeaders.Authorization).toBe('Bearer renewed');
  const count=changed.mock.calls.length;stop();client.subscribe.mock.calls[0][1]({body:'late'});
  expect(changed).toHaveBeenCalledTimes(count);expect(client.deactivate).toHaveBeenCalledTimes(1);
});

it('authenticates each STOMP connection, refreshes on reconnect and tears down subscriptions',()=>{
  const api=new HttpApi('https://api.example');api.setTokens({accessToken:'first',refreshToken:'refresh'});
  const changed=jest.fn(),stop=api.subscribeBoard('event/id',changed);
  const client=(Client as unknown as jest.Mock).mock.results.at(-1)!.value;
  expect(client.brokerURL).toBe('wss://api.example/ws');expect(client.activate).toHaveBeenCalledTimes(1);
  client.beforeConnect();expect(client.connectHeaders).toEqual({Authorization:'Bearer first'});
  client.onConnect();expect(client.subscribe.mock.calls.map((call:unknown[])=>call[0])).toEqual([
    '/topic/events/event%2Fid/board','/user/queue/events/event%2Fid']);
  expect(changed).toHaveBeenCalledTimes(1);
  client.subscribe.mock.calls[0][1]({body:'ignored'});expect(changed).toHaveBeenCalledTimes(2);
  api.setTokens({accessToken:'renewed',refreshToken:'refresh'});client.beforeConnect();
  expect(client.connectHeaders.Authorization).toBe('Bearer renewed');
  client.onConnect();expect(changed).toHaveBeenCalledTimes(3);
  stop();expect(client.deactivate).toHaveBeenCalledTimes(1);
  client.subscribe.mock.calls[0][1]({body:'late event'});expect(changed).toHaveBeenCalledTimes(3);
});
