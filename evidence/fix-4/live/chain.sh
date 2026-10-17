#!/bin/sh
# F4 live repros on 3445445, one browser at a time; NEWNYM before each so no run starts on a spent exit budget. Each script takes the shared lock itself, in short holds.
cd /tmp/fq-F4
nn() { node /tmp/fq-F4/nn.mjs >> /tmp/fq-F4/out/newnym.log 2>&1; sleep 12; }
nn; TMO=600 ./run.sh f2 l.mjs f2 chromium
nn; TMO=600 ./run.sh f3 l.mjs f3 chromium
nn; MODES=after TRACE=1 TAG=-after TMO=600 ./run.sh kill-after l.mjs kill chromium
nn; MODES=after-hang,after-once TRACE=1 TAG=-timeout TMO=900 ./run.sh kill-timeout l.mjs kill chromium
nn; NOPROBE=1 TMO=700 ./run.sh expire l.mjs expire chromium
nn; TMO=600 ./run.sh duefail l.mjs duefail chromium
nn; TMO=600 ./run.sh twotabs l.mjs twotabs chromium
nn; FAILN=2 TMO=900 ./run.sh f429x l.mjs f429x chromium
echo "chain done" >> out/status.txt
