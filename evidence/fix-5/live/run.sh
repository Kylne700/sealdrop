#!/bin/sh
# usage: run.sh <name> <script> args...   (fix-4's runner, retargeted to /tmp/fq-F5; DISP picks Xvfb :94-:96; scripts take the lock themselves)
export DISPLAY=${DISP:-:94} TORSOCKS_CONF_FILE=/tmp/fq-L/torsocks.conf
n=$1; shift
cd /tmp/fq-F5/repo
timeout -k 5 ${TMO:-900} torsocks nice -n 10 node qa-net/"$@" > /tmp/fq-F5/out/run-$n.log 2>&1
echo "$n exit $? $(date -u +%H:%M:%S)" >> /tmp/fq-F5/out/status.txt
