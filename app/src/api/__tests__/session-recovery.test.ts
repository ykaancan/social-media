import { HttpApi } from '../http';

it('keeps credentials when refresh loses the network and retries on the next request',async()=>{
  const fetchMock=jest.spyOn(global,'fetch'),expired={ok:false,status:401,text:async()=>'{}'} as Response;
  fetchMock.mockResolvedValueOnce(expired).mockRejectedValueOnce(new Error('offline'));
  const api=new HttpApi('https://api.example'),signedOut=jest.fn();api.setTokens({accessToken:'old',refreshToken:'refresh'});api.onUnauthorized(signedOut);
  try{
    await expect(api.me()).rejects.toMatchObject({code:'network'});expect(signedOut).not.toHaveBeenCalled();
    fetchMock.mockResolvedValueOnce(expired).mockResolvedValueOnce({ok:true,text:async()=>JSON.stringify({accessToken:'new',refreshToken:'renewed'})} as Response).mockResolvedValueOnce({ok:true,text:async()=>JSON.stringify({id:'me'})} as Response);
    expect(await api.me()).toEqual({id:'me'});expect(signedOut).not.toHaveBeenCalled();
    expect(fetchMock.mock.calls[4][1]?.headers).toMatchObject({Authorization:'Bearer new'});
  }finally{fetchMock.mockRestore();}
});

it('signs out when the server explicitly rejects the refresh credential',async()=>{
  const fetchMock=jest.spyOn(global,'fetch').mockResolvedValue({ok:false,status:401,text:async()=>'{}'} as Response);
  const api=new HttpApi('https://api.example'),signedOut=jest.fn();api.setTokens({accessToken:'old',refreshToken:'refresh'});api.onUnauthorized(signedOut);
  try{await expect(api.me()).rejects.toMatchObject({code:'unauthorized'});expect(signedOut).toHaveBeenCalledTimes(1);}finally{fetchMock.mockRestore();}
});
