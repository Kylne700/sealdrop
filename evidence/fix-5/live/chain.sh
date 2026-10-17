#!/bin/sh
# fix-5 browser re-runs on 13241da, one browser at a time on :94; NEWNYM before each. Each script takes the shared lock itself, in short holds.
cd /tmp/fq-F5
nn() { node /tmp/fq-F5/nn.mjs >> /tmp/fq-F5/out/newnym.log 2>&1; sleep 12; }
nn; TMO=600 ./run.sh twotabs l.mjs twotabs chromium
nn; SENDMODE=after-once TAG=-once TMO=600 ./run.sh twotabs-once l.mjs twotabs chromium
nn; TMO=600 ./run.sh duefail l.mjs duefail chromium
nn; FAILN=2 TMO=900 ./run.sh f429x l.mjs f429x chromium
echo "chain done $(date -u +%H:%M:%S)" >> out/status.txt
# f2q ran in parallel with this chain: DISP=:95 TMO=900 ./run.sh f2q l.mjs f2q chromium
#   and on the build before fix stage 5 (git archive 48bb590 into /tmp/fq-F5/before, npm run build): DISP=:96 DIST=/tmp/fq-F5/before/dist TAG=-before TMO=900 ./run.sh f2q-before l.mjs f2q chromium
