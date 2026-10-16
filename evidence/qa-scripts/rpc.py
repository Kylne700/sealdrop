import json, sys, urllib.request
URL='https://rpc.tiramisu.db-chain.testnet.arkiv.network'
def call(method, params, origin=None):
    req=urllib.request.Request(URL, data=json.dumps({"jsonrpc":"2.0","id":1,"method":method,"params":params}).encode(), headers={"content-type":"application/json", **({"origin":origin} if origin else {})})
    try:
        r=urllib.request.urlopen(req, timeout=20); body=r.read(); hdr=dict(r.headers); st=r.status
    except urllib.error.HTTPError as e:
        body=e.read(); hdr=dict(e.headers); st=e.code
    return st, hdr, json.loads(body or b'null')
if __name__=='__main__':
    st,hdr,body=call(sys.argv[1], json.loads(sys.argv[2]) if len(sys.argv)>2 else [])
    print(st, {k:v for k,v in hdr.items() if k.lower().startswith(('arkiv','retry','x-','access-control'))}, json.dumps(body)[:300])
