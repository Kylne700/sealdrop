#!/bin/sh
# L-08 rerun: the same f429x section, waiting 30 s after Refresh instead of 6 s, to see Refresh restore the inbox without a reload.
cd /tmp/fq-F4
(nohup Xvfb :94 -screen 0 1400x1000x24 -nolisten tcp > /tmp/fq-F4/out/xvfb94.log 2>&1 &)
node /tmp/fq-F4/nn.mjs >> /tmp/fq-F4/out/newnym.log 2>&1; sleep 12
FAILN=2 REFRESHWAIT=30000 TAG=-refreshwait TMO=900 ./run.sh f429x-rw l.mjs f429x chromium
echo "chain2 done" >> out/status.txt
